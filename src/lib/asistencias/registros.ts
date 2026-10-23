import { createAdminClient } from '@/lib/supabase/admin'
import {
  filtroAsistenciasDelRango,
  ventanaUtc,
  type Asistencia,
  type MarcaChecador,
  type PeriodoVacaciones,
  type PermisoSalida,
} from './calendario'

const TAMANO_PAGINA = 1000

type Pagina<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>

/** PostgREST devuelve como máximo 1000 filas por consulta: pide páginas hasta traerlas todas. */
async function todasLasFilas<T>(pedirPagina: (desde: number, hasta: number) => Pagina<T>): Promise<T[]> {
  const filas: T[] = []
  for (let inicio = 0; ; inicio += TAMANO_PAGINA) {
    const { data, error } = await pedirPagina(inicio, inicio + TAMANO_PAGINA - 1)
    if (error) throw new Error(error.message)
    filas.push(...(data ?? []))
    if (!data || data.length < TAMANO_PAGINA) return filas
  }
}

/** Registros de Asistencias del rango (con su Estado). `idEmpleado` limita a un trabajador. */
export function cargarAsistencias(desde: string, hasta: string, idEmpleado?: number): Promise<Asistencia[]> {
  return todasLasFilas<Asistencia>((inicio, fin) => {
    let consulta = createAdminClient()
      .from('Asistencias')
      .select('*, Estado:EstadosAsistencia(id, Motivo)')
      .or(filtroAsistenciasDelRango(desde, hasta))
    if (idEmpleado !== undefined) consulta = consulta.eq('id_empleados', idEmpleado)
    return consulta.order('id').range(inicio, fin)
  })
}

/** Periodos de vacaciones que tocan el rango. `idEmpleado` limita a un trabajador. */
export function cargarVacaciones(desde: string, hasta: string, idEmpleado?: number): Promise<PeriodoVacaciones[]> {
  return todasLasFilas<PeriodoVacaciones>((inicio, fin) => {
    let consulta = createAdminClient()
      .from('Vacaciones')
      .select('id, id_empleados, Desde, Hasta, Fechas, Dias, Nota')
      .lte('Desde', hasta)
      .gte('Hasta', desde)
    if (idEmpleado !== undefined) consulta = consulta.eq('id_empleados', idEmpleado)
    return consulta.order('Desde').range(inicio, fin)
  })
}

/** Periodos de vacaciones agrupados por trabajador. */
export function agruparVacacionesPorEmpleado(periodos: PeriodoVacaciones[]): Map<number, PeriodoVacaciones[]> {
  const grupos = new Map<number, PeriodoVacaciones[]>()
  for (const p of periodos) grupos.set(p.id_empleados, [...(grupos.get(p.id_empleados) ?? []), p])
  return grupos
}

/** Permisos de salida del rango. `idEmpleado` limita a un trabajador. */
export async function cargarPermisosSalida(desde: string, hasta: string, idEmpleado?: number): Promise<PermisoSalida[]> {
  try {
    return await todasLasFilas<PermisoSalida>((inicio, fin) => {
      let consulta = createAdminClient()
        .from('PermisosSalida')
        .select('id, id_empleados, Fecha, AutorizadoEn, VenceEn, Motivo, AutorizadoPor')
        .gte('Fecha', desde)
        .lte('Fecha', hasta)
      if (idEmpleado !== undefined) consulta = consulta.eq('id_empleados', idEmpleado)
      return consulta.order('id').range(inicio, fin)
    })
  } catch (error) {
    // Si todavía no se corre la migración 2026-10-22_permisos_salida.sql, el calendario funciona igual, sin permisos.
    if (error instanceof Error && error.message.includes("'public.PermisosSalida'")) {
      console.warn('Falta la tabla PermisosSalida: corre supabase/migraciones/2026-10-22_permisos_salida.sql')
      return []
    }
    throw error
  }
}

/** Permisos de salida agrupados por "idEmpleado|fecha". */
export function agruparPermisosPorEmpleadoYDia(permisos: PermisoSalida[]): Map<string, PermisoSalida[]> {
  const grupos = new Map<string, PermisoSalida[]>()
  for (const p of permisos) {
    const clave = `${p.id_empleados}|${p.Fecha}`
    grupos.set(clave, [...(grupos.get(clave) ?? []), p])
  }
  return grupos
}

/** Marcas del checador del rango de los trabajadores con esos PinChecador. */
export function cargarMarcas(desde: string, hasta: string, pines: number[]): Promise<MarcaChecador[]> {
  if (pines.length === 0) return Promise.resolve([])
  const { inicio, fin } = ventanaUtc(desde, hasta)
  return todasLasFilas<MarcaChecador>((desdeFila, hastaFila) =>
    createAdminClient()
      .from('MarcasChecador')
      .select('PIN, FechaHora')
      .in('PIN', pines.map(String))
      .gte('FechaHora', inicio)
      .lt('FechaHora', fin)
      .order('id')
      .range(desdeFila, hastaFila),
  )
}
