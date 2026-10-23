import type { Perfil } from '@/lib/supabase/auth'
import { ROL_ADMIN } from './catalogo'

/*
 * Límites para que nadie pueda darse más poder del que tiene.
 * Cada función devuelve el motivo por el que NO se permite, o null si sí se permite.
 */

export const mismoCorreo = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/** ¿Puede este usuario cambiar los permisos de `rol`? */
export function motivoParaNoEditarRol(perfil: Perfil, rol: string): string | null {
  if (rol === ROL_ADMIN) return 'El rol Admin siempre tiene acceso total'
  if (rol === perfil.rol) return 'No puedes cambiar los permisos de tu propio rol'
  return null
}

/** ¿Puede este usuario asignar `rolNuevo` a la cuenta `cuenta`? (`cuenta` es null si es una cuenta nueva) */
export function motivoParaNoAsignarRol(
  perfil: Perfil,
  cuenta: { Correo: string; Rol: string } | null,
  rolNuevo: string,
): string | null {
  if (cuenta && mismoCorreo(cuenta.Correo, perfil.correo)) return 'No puedes cambiar el rol de tu propia cuenta'

  const esAdmin = perfil.rol === ROL_ADMIN
  if (!esAdmin && cuenta?.Rol === ROL_ADMIN) return 'Solo el Admin puede cambiar una cuenta Admin'
  if (!esAdmin && rolNuevo === ROL_ADMIN) return 'Solo el Admin puede asignar el rol Admin'
  return null
}

/** ¿Puede este usuario cambiar la contraseña de `cuenta`? (además necesita el permiso "cambiar Contrasena") */
export function motivoParaNoCambiarContrasena(perfil: Perfil, cuenta: { Rol: string }): string | null {
  // Si no, alguien con este permiso podría entrar como Admin.
  if (cuenta.Rol === ROL_ADMIN && perfil.rol !== ROL_ADMIN) return 'Solo el Admin puede cambiar la contraseña de una cuenta Admin'
  return null
}
