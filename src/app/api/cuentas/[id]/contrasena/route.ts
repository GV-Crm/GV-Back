import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { autorizar } from '@/lib/supabase/auth'
import { motivoParaNoCambiarContrasena } from '@/lib/permisos/limites'
import { motivoContrasenaInvalida, ponerContrasena } from '@/lib/permisos/usuarios-auth'

function errorRespuesta(mensaje: string, status: number) {
  return NextResponse.json({ error: mensaje }, { status })
}

/**
 * Cambia la contraseña de una cuenta. Body: `{ Contrasena }`. Requiere "cambiar Contrasena".
 * Si la cuenta todavía no tenía usuario de inicio de sesión, se le crea con esa contraseña.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const acceso = await autorizar(req, 'cambiar', 'Contrasena')
  if (acceso.respuesta) return acceso.respuesta

  const { id } = await params
  const body = await req.json().catch(() => null)
  const contrasena: unknown = body?.Contrasena
  const motivoContrasena = motivoContrasenaInvalida(contrasena)
  if (motivoContrasena) return errorRespuesta(motivoContrasena, 400)

  const { data: cuenta, error } = await createAdminClient()
    .from('Roles')
    .select('id, Correo, Rol')
    .eq('id', id)
    .not('Correo', 'is', null)
    .maybeSingle()
  if (error) return errorRespuesta(error.message, 500)
  if (!cuenta) return errorRespuesta('No existe esa cuenta', 404)

  const motivo = motivoParaNoCambiarContrasena(acceso.perfil, { Rol: cuenta.Rol.trim() })
  if (motivo) return errorRespuesta(motivo, 403)

  try {
    const resultado = await ponerContrasena(cuenta.Correo.trim(), contrasena as string)
    return NextResponse.json({ ok: true, usuarioCreado: resultado === 'creado' })
  } catch (err) {
    return errorRespuesta(`No se pudo cambiar la contraseña: ${err instanceof Error ? err.message : err}`, 400)
  }
}
