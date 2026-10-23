import type { User } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { mismoCorreo } from './limites'

/*
 * Usuarios de inicio de sesión (Supabase Auth). Cada cuenta de la tabla Roles inicia sesión con el usuario
 * de Auth que tiene su mismo correo.
 */

export const MIN_CONTRASENA = 8
// Supabase guarda la contraseña con bcrypt, que solo usa los primeros 72 bytes.
const MAX_CONTRASENA = 72

/** Motivo por el que la contraseña no sirve, o null si está bien. */
export function motivoContrasenaInvalida(contrasena: unknown): string | null {
  if (typeof contrasena !== 'string' || contrasena.length < MIN_CONTRASENA) {
    return `La contraseña debe tener al menos ${MIN_CONTRASENA} caracteres`
  }
  if (new TextEncoder().encode(contrasena).length > MAX_CONTRASENA) {
    return `La contraseña puede tener máximo ${MAX_CONTRASENA} caracteres`
  }
  return null
}

const POR_PAGINA = 1000

/** El usuario de Auth con ese correo, o null si no tiene. */
export async function buscarUsuarioAuth(correo: string): Promise<User | null> {
  const auth = createAdminClient().auth.admin
  for (let page = 1; ; page++) {
    const { data, error } = await auth.listUsers({ page, perPage: POR_PAGINA })
    if (error) throw new Error(error.message)
    const usuario = data.users.find((u) => u.email && mismoCorreo(u.email, correo))
    if (usuario) return usuario
    if (data.users.length < POR_PAGINA) return null
  }
}

/** Crea el usuario de Auth con esa contraseña (con el correo ya confirmado). Devuelve su id. */
export async function crearUsuarioAuth(correo: string, contrasena: string): Promise<string> {
  const { data, error } = await createAdminClient().auth.admin.createUser({
    email: correo,
    password: contrasena,
    email_confirm: true,
  })
  if (error) throw new Error(error.message)
  return data.user.id
}

/** Le pone esta contraseña al usuario del correo. Si todavía no tiene usuario de Auth, se lo crea. */
export async function ponerContrasena(correo: string, contrasena: string): Promise<'actualizado' | 'creado'> {
  const usuario = await buscarUsuarioAuth(correo)
  if (!usuario) {
    await crearUsuarioAuth(correo, contrasena)
    return 'creado'
  }
  const { error } = await createAdminClient().auth.admin.updateUserById(usuario.id, { password: contrasena })
  if (error) throw new Error(error.message)
  return 'actualizado'
}
