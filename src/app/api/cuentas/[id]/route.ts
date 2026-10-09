import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { autorizar } from '@/lib/supabase/auth'
import { motivoParaNoAsignarRol } from '@/lib/permisos/limites'
import { listarRoles } from '@/lib/permisos/roles'

function errorRespuesta(mensaje: string, status: number) {
  return NextResponse.json({ error: mensaje }, { status })
}

/** Cambia el rol de una cuenta. Body: `{ Rol }`. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const acceso = await autorizar(req, 'gestionar', 'Permiso')
  if (acceso.respuesta) return acceso.respuesta

  const { id } = await params
  const body = await req.json().catch(() => null)
  const rolNuevo = typeof body?.Rol === 'string' ? body.Rol : ''
  if (!(await listarRoles()).includes(rolNuevo)) return errorRespuesta('No existe ese rol', 400)

  const supabase = createAdminClient()
  const { data: cuenta, error: errorCuenta } = await supabase
    .from('Roles')
    .select('id, Correo, Rol')
    .eq('id', id)
    .not('Correo', 'is', null)
    .maybeSingle()
  if (errorCuenta) return errorRespuesta(errorCuenta.message, 500)
  if (!cuenta) return errorRespuesta('No existe esa cuenta', 404)

  const motivo = motivoParaNoAsignarRol(acceso.perfil, { Correo: cuenta.Correo, Rol: cuenta.Rol.trim() }, rolNuevo)
  if (motivo) return errorRespuesta(motivo, 403)

  const { data, error } = await supabase
    .from('Roles')
    .update({ Rol: rolNuevo })
    .eq('id', id)
    .select('id, Nombre, Correo, Rol')
    .single()
  if (error) return errorRespuesta(error.message, 500)

  return NextResponse.json({ ...data, Correo: data.Correo.trim(), bloqueado: null })
}
