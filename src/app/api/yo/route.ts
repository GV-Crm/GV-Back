import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { autorizar } from '@/lib/supabase/auth'

const MAX_NOMBRE = 80

/** Rol, permisos, nombre y foto del usuario con sesión, para que el frontend sepa qué mostrar. */
export async function GET(req: NextRequest) {
  const acceso = await autorizar(req)
  if (acceso.respuesta) return acceso.respuesta
  return NextResponse.json(acceso.perfil)
}

/** El usuario cambia su propio nombre. Body: `{ Nombre }`. Solo puede cambiar su cuenta. */
export async function PATCH(req: NextRequest) {
  const acceso = await autorizar(req)
  if (acceso.respuesta) return acceso.respuesta

  const body = await req.json().catch(() => null)
  const nombre = typeof body?.Nombre === 'string' ? body.Nombre.trim() : ''
  if (!nombre) return NextResponse.json({ error: 'Escribe tu nombre' }, { status: 400 })
  if (nombre.length > MAX_NOMBRE) {
    return NextResponse.json({ error: `El nombre puede tener máximo ${MAX_NOMBRE} caracteres` }, { status: 400 })
  }

  const { error } = await createAdminClient().from('Roles').update({ Nombre: nombre }).eq('id', acceso.perfil.cuentaId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ...acceso.perfil, nombre })
}
