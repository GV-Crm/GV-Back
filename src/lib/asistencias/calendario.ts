export const ZONA_HORARIA = 'America/Mexico_City'

/** `EstadosAsistencia.id` de "Falta" y "Falta Justificada". */
export const ID_ESTADO_FALTA = 3
export const ID_ESTADO_FALTA_JUSTIFICADA = 4

/**
 * Las reglas del horario están en jornada.ts.
 * - asistio: tiene entrada y salida, y llegó a tiempo.
 * - retardo: tiene entrada y salida, pero llegó más de 15 min tarde.
 * - permiso: salió antes de su hora con permiso (checó dentro de los 10 min que se le dieron).
 * - sin_salida / sin_entrada: solo se registró una de las dos (falta registrar la otra).
 * - falta: día laboral sin registros, o llegó más de 1 hora tarde.
 * - justificada: falta marcada como "Falta Justificada".
 * - vacaciones: día laboral dentro de un periodo de vacaciones (tabla Vacaciones), sin checadas.
 * - pendiente: hoy, todavía sin registros y aún no pasa la hora límite de entrada.
 * - descanso: día sin jornada (domingo) y sin registros.
 */
export type EstadoDia =
  | 'asistio'
  | 'retardo'
  | 'permiso'
  | 'sin_salida'
  | 'sin_entrada'
  | 'falta'
  | 'justificada'
  | 'vacaciones'
  | 'pendiente'
  | 'descanso'

export type Asistencia = {
  id: number
  id_empleados: number
  id_estado: number | null
  Fecha: string | null
  HoraEntrada: string | null
  InicioComida: string | null
  FinComida: string | null
  HoraSalida: string | null
  /** Solo en faltas justificadas: el motivo y quién lo escribió. */
  Justificacion?: string | null
  JustificadoPor?: string | null
}

/**
 * Solicitud de vacaciones (tabla Vacaciones). `Fechas` son los días exactos, que pueden ser salteados;
 * `Desde`/`Hasta` son el primero y el último. `Dias` = cuántas fechas tiene.
 */
export type PeriodoVacaciones = {
  id: number
  id_empleados: number
  Desde: string
  Hasta: string
  Fechas: string[]
  Dias: number
  Nota: string | null
}

/** La solicitud de vacaciones que incluye esa fecha, si hay. */
export function vacacionesDelDia(periodos: PeriodoVacaciones[], fecha: string): PeriodoVacaciones | null {
  return periodos.find((p) => p.Fechas.includes(fecha)) ?? null
}

/**
 * Permiso para salir antes (tabla PermisosSalida). Abre una ventana de `AutorizadoEn` a `VenceEn` (10 min):
 * la checada que caiga ahí es su salida con permiso.
 */
export type PermisoSalida = {
  id: number
  id_empleados: number
  Fecha: string
  AutorizadoEn: string
  VenceEn: string
  Motivo: string | null
  AutorizadoPor: string | null
}

/** Marca del checador (tabla MarcasChecador). El PIN es el PinChecador del trabajador. */
export type MarcaChecador = { PIN: string; FechaHora: string }

const formatoFecha = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA_HORARIA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const UN_DIA_MS = 86_400_000

/** Fecha `YYYY-MM-DD` de un instante, vista en la zona horaria de la empresa. */
export function fechaLocal(instante: Date | string): string {
  return formatoFecha.format(new Date(instante))
}

export function hoy(): string {
  return fechaLocal(new Date())
}

export function diaAnterior(fecha: string): string {
  return new Date(Date.parse(fecha) - UN_DIA_MS).toISOString().slice(0, 10)
}

export function esFechaValida(fecha: string): boolean {
  const ms = Date.parse(fecha)
  return /^\d{4}-\d{2}-\d{2}$/.test(fecha) && !Number.isNaN(ms) && new Date(ms).toISOString().startsWith(fecha)
}

export function rangoDeFechas(desde: string, hasta: string): string[] {
  const dias: string[] = []
  for (let t = Date.parse(desde); t <= Date.parse(hasta); t += UN_DIA_MS) {
    dias.push(new Date(t).toISOString().slice(0, 10))
  }
  return dias
}

/** Ventana UTC holgada que cubre por completo los días locales del rango, sea cual sea el desfase horario. */
export function ventanaUtc(desde: string, hasta: string) {
  return {
    inicio: new Date(Date.parse(desde) - UN_DIA_MS).toISOString(),
    fin: new Date(Date.parse(hasta) + 2 * UN_DIA_MS).toISOString(),
  }
}

/**
 * Filtro PostgREST (para `.or()`) de las asistencias de un rango de días: los registros con hora se buscan en
 * una ventana UTC holgada (por entrada, o por salida si no hay entrada) y las faltas guardadas, por su `Fecha`.
 */
export function filtroAsistenciasDelRango(desde: string, hasta: string): string {
  const { inicio, fin } = ventanaUtc(desde, hasta)
  return [
    `and(HoraEntrada.gte.${inicio},HoraEntrada.lt.${fin})`,
    `and(HoraEntrada.is.null,HoraSalida.gte.${inicio},HoraSalida.lt.${fin})`,
    `and(Fecha.gte.${desde},Fecha.lte.${hasta})`,
  ].join(',')
}

/** Falta guardada (por el sistema o justificada a mano): una fila sin hora de entrada ni de salida. */
export function esFaltaRegistrada(a: Asistencia): boolean {
  return !a.HoraEntrada && !a.HoraSalida
}

export function fechaDelRegistro(a: Asistencia): string | null {
  const hora = a.HoraEntrada ?? a.HoraSalida
  return hora ? fechaLocal(hora) : a.Fecha
}

export function agruparPorEmpleadoYDia(asistencias: Asistencia[]): Map<string, Asistencia[]> {
  const grupos = new Map<string, Asistencia[]>()
  for (const asistencia of asistencias) {
    const fecha = fechaDelRegistro(asistencia)
    if (!fecha) continue
    const clave = `${asistencia.id_empleados}|${fecha}`
    const lista = grupos.get(clave) ?? []
    lista.push(asistencia)
    grupos.set(clave, lista)
  }
  return grupos
}

/** Marcas del checador agrupadas por "PIN|fecha local". */
export function agruparMarcasPorPinYDia(marcas: MarcaChecador[]): Map<string, string[]> {
  const grupos = new Map<string, string[]>()
  for (const marca of marcas) {
    const clave = `${Number(marca.PIN)}|${fechaLocal(marca.FechaHora)}`
    const lista = grupos.get(clave) ?? []
    lista.push(marca.FechaHora)
    grupos.set(clave, lista)
  }
  return grupos
}
