import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { autorizar, sinPermiso } from '@/lib/supabase/auth'
import { ROL_ADMIN } from '@/lib/permisos/catalogo'
import { mismoCorreo, motivoParaNoAsignarRol, motivoParaNoCambiarContrasena } from '@/lib/permisos/limites'
import { listarRoles } from '@/lib/permisos/roles'
import { buscarUsuarioAuth, crearUsuarioAuth, motivoContrasenaInvalida } from '@/lib/permisos/usuarios-auth'

const MAX_ROL = 40

function errorRespuesta(mensaje: string, status: number) {
  return NextResponse.json({ error: mensaje }, { status })
}

/**
 * Cuentas con acceso al sistema: filas de la tabla Roles que tienen correo.
 * Entra quien gestiona permisos o quien puede cambiar contraseñas. `bloqueado` dice por qué no se le puede
 * cambiar el rol; `contrasenaBloqueada`, por qué no se le puede cambiar la contraseña (null = sí se puede).
 * También devuelve los roles que este usuario puede asignar.
 */
export async function GET(req: NextRequest) {
  const acceso = await autorizar(req)
  if (acceso.respuesta) return acceso.respuesta
  const gestionaPermisos = acceso.ability.can('gestionar', 'Permiso')
  const cambiaContrasenas = acceso.ability.can('cambiar', 'Contrasena')
  if (!gestionaPermisos && !cambiaContrasenas) return sinPermiso()

  const { data, error } = await createAdminClient()
    .from('Roles')
    .select('id, Nombre, Correo, Rol, Avatar')
    .not('Correo', 'is', null)
    .order('Nombre')
  if (error) return errorRespuesta(error.message, 500)

  const cuentas = data.map((fila) => {
    const cuenta = { id: fila.id, Nombre: fila.Nombre, Correo: fila.Correo.trim(), Rol: fila.Rol.trim(), Avatar: fila.Avatar }
    return {
      ...cuenta,
      bloqueado: gestionaPermisos
        ? motivoParaNoAsignarRol(acceso.perfil, cuenta, cuenta.Rol)
        : 'Solo quien administra permisos cambia roles',
      contrasenaBloqueada: cambiaContrasenas
        ? motivoParaNoCambiarContrasena(acceso.perfil, cuenta)
        : 'Tu rol no puede cambiar contraseñas',
    }
  })

  const esAdmin = acceso.perfil.rol === ROL_ADMIN
  const rolesAsignables = gestionaPermisos ? (await listarRoles()).filter((rol) => esAdmin || rol !== ROL_ADMIN) : []

  return NextResponse.json({ cuentas, rolesAsignables })
}

/**
 * Da acceso a una cuenta nueva. Body: `{ Nombre, Correo, Rol, Contrasena }`. Si `Rol` no existe, se crea (sin permisos).
 * También crea su usuario de inicio de sesión (Supabase Auth) con esa contraseña inicial. Si el correo ya tenía
 * usuario, conserva su contraseña de antes (`usaContrasenaExistente: true`).
 */
export async function POST(req: NextRequest) {
  const acceso = await autorizar(req, 'gestionar', 'Permiso')
  if (acceso.respuesta) return acceso.respuesta

  const body = await req.json().catch(() => null)
  const nombre = typeof body?.Nombre === 'string' ? body.Nombre.trim() : ''
  const correo = typeof body?.Correo === 'string' ? body.Correo.trim().toLowerCase() : ''
  const rolPedido = typeof body?.Rol === 'string' ? body.Rol.trim().replace(/\s+/g, ' ') : ''
  const contrasena: unknown = body?.Contrasena

  if (!nombre) return errorRespuesta('El nombre es obligatorio', 400)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) return errorRespuesta('El correo no es válido', 400)
  // Un rol (área) que todavía no existe se crea con esta cuenta, sin permisos: se le asignan en "Roles y permisos".
  const rolExistente = (await listarRoles()).find((r) => r.toLowerCase() === rolPedido.toLowerCase())
  const rol = rolExistente ?? rolPedido
  if (!rolExistente && (rol.length < 2 || rol.length > MAX_ROL)) {
    return errorRespuesta(`El nombre del rol debe tener entre 2 y ${MAX_ROL} caracteres`, 400)
  }
  const motivoContrasena = motivoContrasenaInvalida(contrasena)
  if (motivoContrasena) return errorRespuesta(motivoContrasena, 400)

  const motivo = motivoParaNoAsignarRol(acceso.perfil, null, rol)
  if (motivo) return errorRespuesta(motivo, 403)

  const supabase = createAdminClient()
  const { data: existentes, error: errorExistentes } = await supabase.from('Roles').select('Correo').not('Correo', 'is', null)
  if (errorExistentes) return errorRespuesta(errorExistentes.message, 500)
  if (existentes.some((fila) => mismoCorreo(fila.Correo, correo))) {
    return errorRespuesta('Ese correo ya tiene una cuenta', 409)
  }

  // Usuario de inicio de sesión: se crea con la contraseña inicial, salvo que ese correo ya tenga uno.
  let usuarioCreado: string | null = null
  try {
    if (!(await buscarUsuarioAuth(correo))) usuarioCreado = await crearUsuarioAuth(correo, contrasena as string)
  } catch (err) {
    return errorRespuesta(`No se pudo crear su usuario: ${err instanceof Error ? err.message : err}`, 400)
  }

  const { data, error } = await supabase
    .from('Roles')
    .insert({ Nombre: nombre, Correo: correo, Rol: rol })
    .select('id, Nombre, Correo, Rol, Avatar')
    .single()
  if (error) {
    // Sin su fila en Roles el usuario no tendría acceso: se borra para poder intentarlo de nuevo.
    if (usuarioCreado) await supabase.auth.admin.deleteUser(usuarioCreado)
    return errorRespuesta(error.message, 500)
  }

  return NextResponse.json(
    {
      ...data,
      bloqueado: null,
      contrasenaBloqueada: acceso.ability.can('cambiar', 'Contrasena')
        ? motivoParaNoCambiarContrasena(acceso.perfil, data)
        : 'Tu rol no puede cambiar contraseñas',
      usaContrasenaExistente: !usuarioCreado,
    },
    { status: 201 },
  )
}
