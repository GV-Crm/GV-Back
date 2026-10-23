import { createAdminClient } from '@/lib/supabase/admin'
import { fechaLocal, fechaDelRegistro, hoy, vacacionesDelDia } from './calendario'
import { evaluarDia, type ResultadoDia } from './jornada'
import { cargarAsistencias, cargarMarcas, cargarPermisosSalida, cargarVacaciones } from './registros'

/** El trabajador (activo) y cómo va su día de hoy, con sus permisos de salida. */
export async function diaDeHoyDe(uuid: string): Promise<{ empleado: { id: number }; dia: ResultadoDia; fecha: string } | null> {
  const { data: empleado, error } = await createAdminClient()
    .from('Empleados')
    .select('id, PinChecador, Activo')
    .eq('Uuid', uuid)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!empleado || !empleado.Activo) return null

  const fecha = hoy()
  const [asistencias, marcas, vacaciones, permisos] = await Promise.all([
    cargarAsistencias(fecha, fecha, empleado.id),
    cargarMarcas(fecha, fecha, [empleado.PinChecador]),
    cargarVacaciones(fecha, fecha, empleado.id),
    cargarPermisosSalida(fecha, fecha, empleado.id),
  ])
  const dia = evaluarDia(
    fecha,
    fecha,
    asistencias.filter((a) => fechaDelRegistro(a) === fecha),
    marcas.filter((m) => fechaLocal(m.FechaHora) === fecha).map((m) => m.FechaHora),
    new Date(),
    vacacionesDelDia(vacaciones, fecha),
    permisos,
  )
  return { empleado, dia, fecha }
}

/** "15:40" en hora de México. */
export const horaLocal = (instante: string) =>
  new Date(instante).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Mexico_City' })
