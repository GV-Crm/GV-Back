import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { crearAbility, reglasDelRol, type AppAbility, type Regla } from '@/lib/permisos/ability'
import type { Accion, Recurso } from '@/lib/permisos/catalogo'

/**
 * Quién está haciendo la petición. `reglas` es lo que puede hacer (formato CASL).
 * `cuentaId` es el id de su fila en la tabla Roles; `avatar`, la URL de su foto (o null).
 */
export type Perfil = {
  cuentaId: number
  correo: string
  nombre: string | null
  avatar: string | null
  rol: string
  reglas: Regla[]
}

/** Valida el access token de Supabase que el frontend manda en `Authorization: Bearer <token>`. */
async function usuarioDeLaPeticion(req: NextRequest) {
  const token = req.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1]
  if (!token) return null

  const { data, error } = await createAdminClient().auth.getUser(token)
  return error ? null : data.user
}

// En la tabla los correos se capturan a mano y pueden traer espacios o saltos de línea.
const normalizarCorreo = (correo: string) => correo.trim().toLowerCase()

/** Busca la cuenta en la tabla Roles por correo y arma su perfil con sus permisos. */
async function perfilDelCorreo(correo: string): Promise<Perfil | null> {
  const { data, error } = await createAdminClient()
    .from('Roles')
    .select('id, Nombre, Rol, Correo, Avatar')
    .not('Correo', 'is', null)
  if (error) throw new Error(error.message)

  const cuenta = data.find((r) => normalizarCorreo(r.Correo) === normalizarCorreo(correo))
  if (!cuenta) return null

  const rol = cuenta.Rol.trim()
  return {
    cuentaId: cuenta.id,
    correo,
    nombre: cuenta.Nombre,
    avatar: cuenta.Avatar,
    rol,
    reglas: await reglasDelRol(rol),
  }
}

export function sinPermiso() {
  return NextResponse.json({ error: 'Tu rol no tiene permiso para esta acción' }, { status: 403 })
}

type Acceso =
  | { perfil: Perfil; ability: AppAbility; respuesta?: never }
  | { perfil?: never; ability?: never; respuesta: NextResponse }

/**
 * Revisa quién hace la petición y si tiene permiso. Uso en una ruta:
 *
 *   const acceso = await autorizar(req, 'justificar', 'Falta')
 *   if (acceso.respuesta) return acceso.respuesta   // 401 o 403
 *
 * Sin `accion` y `recurso` solo exige sesión válida y un rol asignado.
 */
export async function autorizar(req: NextRequest, accion?: Accion, recurso?: Recurso): Promise<Acceso> {
  const usuario = await usuarioDeLaPeticion(req)
  if (!usuario?.email) {
    return { respuesta: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) }
  }

  const perfil = await perfilDelCorreo(usuario.email)
  if (!perfil) {
    const mensaje = 'Tu usuario no tiene un rol asignado. Pide a un administrador que te dé acceso.'
    return { respuesta: NextResponse.json({ error: mensaje }, { status: 403 }) }
  }

  const ability = crearAbility(perfil.reglas)
  if (accion && recurso && ability.cannot(accion, recurso)) return { respuesta: sinPermiso() }

  return { perfil, ability }
}
