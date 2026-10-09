import { createAdminClient } from '@/lib/supabase/admin'
import { ROL_ADMIN } from './catalogo'

/**
 * Nombres de todos los roles que existen: los de la tabla Roles y los que ya tienen permisos.
 * Admin siempre va primero; el resto, en orden alfabético.
 */
export async function listarRoles(): Promise<string[]> {
  const supabase = createAdminClient()
  const [roles, permisos] = await Promise.all([
    supabase.from('Roles').select('Rol'),
    supabase.from('PermisosRol').select('Rol'),
  ])
  if (roles.error) throw new Error(roles.error.message)
  if (permisos.error) throw new Error(permisos.error.message)

  const nombres = new Set([...roles.data, ...permisos.data].map((fila) => fila.Rol.trim()))
  nombres.delete(ROL_ADMIN)
  return [ROL_ADMIN, ...[...nombres].sort((a, b) => a.localeCompare(b))]
}
