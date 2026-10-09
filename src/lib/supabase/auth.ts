import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type Permiso = 'gestionar_empleados' | 'justificar_faltas'

/** Roles de la tabla `Roles` con permisos extra; cualquier otro rol solo puede consultar. */
const PERMISOS_POR_ROL: Record<string, Permiso[]> = {
  Admin: ['gestionar_empleados'],
  'Admin Administracion': ['gestionar_empleados', 'justificar_faltas'],
}

export type Perfil = { correo: string; nombre: string | null; rol: string; permisos: Permiso[] }

/** Valida el access token de Supabase que el frontend manda en `Authorization: Bearer <token>`. */
async function usuarioDeLaPeticion(req: NextRequest) {
  const token = req.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1]
  if (!token) return null

  const { data, error } = await createAdminClient().auth.getUser(token)
  return error ? null : data.user
}

// En la tabla los correos se capturan a mano y pueden traer espacios o saltos de línea.
const normalizarCorreo = (correo: string) => correo.trim().toLowerCase()

async function perfilDelCorreo(correo: string): Promise<Perfil | null> {
  const { data, error } = await createAdminClient()
    .from('Roles')
    .select('Nombre, Rol, Correo')
    .not('Correo', 'is', null)
  if (error) throw new Error(error.message)

  const fila = data.find((r) => normalizarCorreo(r.Correo) === normalizarCorreo(correo))
  if (!fila) return null

  const rol = fila.Rol.trim()
  return { correo, nombre: fila.Nombre, rol, permisos: PERMISOS_POR_ROL[rol] ?? [] }
}

type Acceso = { perfil: Perfil; respuesta?: never } | { perfil?: never; respuesta: NextResponse }

const negar = (mensaje: string, status: number): Acceso => ({
  respuesta: NextResponse.json({ error: mensaje }, { status }),
})

/** Exige sesión válida y un rol en `Roles`; si se pasa `permiso`, también que el rol lo tenga. */
export async function autorizar(req: NextRequest, permiso?: Permiso): Promise<Acceso> {
  const usuario = await usuarioDeLaPeticion(req)
  if (!usuario?.email) return negar('No autorizado', 401)

  const perfil = await perfilDelCorreo(usuario.email)
  if (!perfil) return negar('Tu usuario no tiene un rol asignado. Pide a un administrador que te dé acceso.', 403)
  if (permiso && !perfil.permisos.includes(permiso)) return negar('Tu rol no tiene permiso para esta acción', 403)

  return { perfil }
}
