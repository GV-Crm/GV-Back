import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { autorizar } from '@/lib/supabase/auth'
import { ROL_ADMIN } from '@/lib/permisos/catalogo'
import { mismoCorreo, motivoParaNoAsignarRol } from '@/lib/permisos/limites'
import { listarRoles } from '@/lib/permisos/roles'

function errorRespuesta(mensaje: string, status: number) {
  return NextResponse.json({ error: mensaje }, { status })
}

/**
 * Cuentas con acceso al sistema: filas de la tabla Roles que tienen correo.
 * También devuelve los roles que este usuario puede asignar.
 */
export async function GET(req: NextRequest) {
  const acceso = await autorizar(req, 'gestionar', 'Permiso')
  if (acceso.respuesta) return acceso.respuesta

  const { data, error } = await createAdminClient()
    .from('Roles')
    .select('id, Nombre, Correo, Rol')
    .not('Correo', 'is', null)
    .order('Nombre')
  if (error) return errorRespuesta(error.message, 500)

  const cuentas = data.map((fila) => {
    const cuenta = { id: fila.id, Nombre: fila.Nombre, Correo: fila.Correo.trim(), Rol: fila.Rol.trim() }
    return { ...cuenta, bloqueado: motivoParaNoAsignarRol(acceso.perfil, cuenta, cuenta.Rol) }
  })

  const esAdmin = acceso.perfil.rol === ROL_ADMIN
  const rolesAsignables = (await listarRoles()).filter((rol) => esAdmin || rol !== ROL_ADMIN)

  return NextResponse.json({ cuentas, rolesAsignables })
}

/**
 * Da acceso a una cuenta nueva. Body: `{ Nombre, Correo, Rol }`.
 * El usuario además debe existir en Supabase Auth (se crea a mano) para poder iniciar sesión.
 */
export async function POST(req: NextRequest) {
  const acceso = await autorizar(req, 'gestionar', 'Permiso')
  if (acceso.respuesta) return acceso.respuesta

  const body = await req.json().catch(() => null)
  const nombre = typeof body?.Nombre === 'string' ? body.Nombre.trim() : ''
  const correo = typeof body?.Correo === 'string' ? body.Correo.trim().toLowerCase() : ''
  const rol = typeof body?.Rol === 'string' ? body.Rol : ''

  if (!nombre) return errorRespuesta('El nombre es obligatorio', 400)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) return errorRespuesta('El correo no es válido', 400)
  if (!(await listarRoles()).includes(rol)) return errorRespuesta('No existe ese rol', 400)

  const motivo = motivoParaNoAsignarRol(acceso.perfil, null, rol)
  if (motivo) return errorRespuesta(motivo, 403)

  const supabase = createAdminClient()
  const { data: existentes, error: errorExistentes } = await supabase.from('Roles').select('Correo').not('Correo', 'is', null)
  if (errorExistentes) return errorRespuesta(errorExistentes.message, 500)
  if (existentes.some((fila) => mismoCorreo(fila.Correo, correo))) {
    return errorRespuesta('Ese correo ya tiene una cuenta', 409)
  }

  const { data, error } = await supabase
    .from('Roles')
    .insert({ Nombre: nombre, Correo: correo, Rol: rol })
    .select('id, Nombre, Correo, Rol')
    .single()
  if (error) return errorRespuesta(error.message, 500)

  return NextResponse.json({ ...data, bloqueado: null }, { status: 201 })
}
