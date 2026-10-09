export const ZONA_HORARIA = 'America/Mexico_City'

/** `EstadosAsistencia.id` de "Falta" y "Falta Justificada". */
export const ID_ESTADO_FALTA = 3
export const ID_ESTADO_FALTA_JUSTIFICADA = 4

/**
 * - asistio: tiene entrada y salida.
 * - sin_salida / sin_entrada: solo se registró una de las dos (falta registrar la otra).
 * - falta: día laboral ya cerrado sin entrada ni salida.
 * - justificada: falta marcada como "Falta Justificada".
 * - pendiente: hoy y todavía sin registros.
 * - descanso: fin de semana sin registros.
 */
export type EstadoDia = 'asistio' | 'sin_salida' | 'sin_entrada' | 'falta' | 'justificada' | 'pendiente' | 'descanso'

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

export type FaltaNueva = Pick<Asistencia, 'id_empleados' | 'id_estado'> & { Fecha: string }

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

/** De lunes a viernes. Solo estos días pueden generar falta. */
export function esDiaLaboral(fecha: string): boolean {
  const diaSemana = new Date(`${fecha}T00:00:00Z`).getUTCDay()
  return diaSemana >= 1 && diaSemana <= 5
}

export function rangoDeFechas(desde: string, hasta: string): string[] {
  const dias: string[] = []
  for (let t = Date.parse(desde); t <= Date.parse(hasta); t += UN_DIA_MS) {
    dias.push(new Date(t).toISOString().slice(0, 10))
  }
  return dias
}

/**
 * Filtro PostgREST (para `.or()`) de las asistencias de un rango de días: los registros con hora se buscan en
 * una ventana UTC holgada (por entrada, o por salida si no hay entrada) y las faltas guardadas, por su `Fecha`.
 */
export function filtroAsistenciasDelRango(desde: string, hasta: string): string {
  const inicio = new Date(Date.parse(desde) - UN_DIA_MS).toISOString()
  const fin = new Date(Date.parse(hasta) + 2 * UN_DIA_MS).toISOString()
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

export function estadoDelDia(registros: Asistencia[], fecha: string, fechaHoy: string): EstadoDia {
  const conHoras = registros.filter((r) => !esFaltaRegistrada(r))
  if (conHoras.length === 0) {
    if (registros.some((r) => r.id_estado === ID_ESTADO_FALTA_JUSTIFICADA)) return 'justificada'
    if (fecha === fechaHoy) return 'pendiente'
    return esDiaLaboral(fecha) ? 'falta' : 'descanso'
  }

  const entrada = conHoras.some((r) => r.HoraEntrada)
  const salida = conHoras.some((r) => r.HoraSalida)
  if (entrada && salida) return 'asistio'
  return entrada ? 'sin_salida' : 'sin_entrada'
}

/** Días laborales sin ningún registro (ni asistencia ni falta ya guardada) desde el ingreso de cada empleado hasta `hasta`. */
export function planificarFaltas(
  empleados: { id: number; Ingreso: string }[],
  asistencias: Asistencia[],
  hasta: string,
): FaltaNueva[] {
  const grupos = agruparPorEmpleadoYDia(asistencias)
  return empleados.flatMap((empleado) =>
    rangoDeFechas(empleado.Ingreso, hasta)
      .filter((fecha) => esDiaLaboral(fecha) && !grupos.has(`${empleado.id}|${fecha}`))
      .map((fecha) => ({ id_empleados: empleado.id, id_estado: ID_ESTADO_FALTA, Fecha: fecha })),
  )
}
