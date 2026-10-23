import { createAdminClient } from '@/lib/supabase/admin'

/*
 * Catálogo de áreas (tabla Areas). Empleados."Area" guarda el nombre de una de ellas.
 * Los nombres se comparan sin importar mayúsculas, acentos de más o espacios: "legal " = "Legal".
 */

export const MAX_NOMBRE_AREA = 60

/** Quita espacios, tabuladores y saltos de línea sobrantes ("Administrativo\n" → "Administrativo"). */
export function limpiarNombreArea(valor: unknown): string {
  return typeof valor === 'string' ? valor.replace(/\s+/g, ' ').trim() : ''
}

const clave = (nombre: string) => limpiarNombreArea(nombre).toLowerCase()

export type Area = { id: number; Nombre: string }

/** Áreas en orden alfabético, con el nombre limpio y sin repetidas. */
export async function listarAreas(): Promise<Area[]> {
  const { data, error } = await createAdminClient().from('Areas').select('id, Nombre').order('id')
  if (error) throw new Error(error.message)
  const unicas = new Map<string, Area>()
  for (const a of data) {
    if (!unicas.has(clave(a.Nombre))) unicas.set(clave(a.Nombre), { id: a.id, Nombre: limpiarNombreArea(a.Nombre) })
  }
  return [...unicas.values()].sort((a, b) => a.Nombre.localeCompare(b.Nombre, 'es'))
}

/** Clave para comparar nombres de área: sin espacios de más y en minúsculas. */
export const claveDeArea = clave

/** El área del catálogo con ese nombre (como está escrita en el catálogo), o null si no existe. */
export async function areaDelCatalogo(nombre: string): Promise<Area | null> {
  const buscada = clave(nombre)
  return (await listarAreas()).find((a) => clave(a.Nombre) === buscada) ?? null
}
