import { createMongoAbility, type MongoAbility } from '@casl/ability'
import { createAdminClient } from '@/lib/supabase/admin'
import { existeEnCatalogo, ROL_ADMIN, type Accion, type Recurso } from './catalogo'

/**
 * "Ability" es el objeto de CASL que responde preguntas como:
 *   ability.can('justificar', 'Falta')  → true / false
 *
 * 'manage' y 'all' son palabras especiales de CASL: "cualquier acción" y "cualquier recurso".
 */
export type AppAbility = MongoAbility<[Accion | 'manage', Recurso | 'all']>

/** Una regla en el formato que entiende CASL. Es lo mismo que se manda al frontend. */
export type Regla = { action: Accion | 'manage'; subject: Recurso | 'all' }

/** Lee de la tabla PermisosRol lo que puede hacer un rol. */
export async function reglasDelRol(rol: string): Promise<Regla[]> {
  if (rol === ROL_ADMIN) return [{ action: 'manage', subject: 'all' }]

  const { data, error } = await createAdminClient()
    .from('PermisosRol')
    .select('Accion, Recurso')
    .eq('Rol', rol)
  if (error) throw new Error(error.message)

  return data
    // Si alguien escribió a mano un permiso que no existe en el catálogo, se ignora.
    .filter((fila) => existeEnCatalogo(fila.Accion, fila.Recurso))
    .map((fila) => ({ action: fila.Accion as Accion, subject: fila.Recurso as Recurso }))
}

export function crearAbility(reglas: Regla[]): AppAbility {
  return createMongoAbility<AppAbility>(reglas)
}
