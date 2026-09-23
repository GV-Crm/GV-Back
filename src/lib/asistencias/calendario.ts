export const ZONA_HORARIA = 'America/Mexico_City'

/** `EstadosAsistencia.id` de "Falta". */
export const ID_ESTADO_FALTA = 3

export type EstadoDia = 'asistio' | 'falta' | 'incompleto'

export type Asistencia = {
  id: number
  id_empleados: number
  id_estado: number | null
  Fecha: string | null
  HoraEntrada: string | null
  InicioComida: string | null
  FinComida: string | null
  HoraSalida: string | null
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

export function rangoDeFechas(desde: string, hasta: string): string[] {
  const dias: string[] = []
  for (let t = Date.parse(desde); t <= Date.parse(hasta); t += UN_DIA_MS) {
    dias.push(new Date(t).toISOString().slice(0, 10))
  }
  return dias
}

/**
 * Filtro PostgREST (para `.or()`) de las asistencias de un rango de días: los registros con hora de entrada
 * se buscan en una ventana UTC holgada y las faltas generadas, por su `Fecha`.
 */
export function filtroAsistenciasDelRango(desde: string, hasta: string): string {
  const inicio = new Date(Date.parse(desde) - UN_DIA_MS).toISOString()
  const fin = new Date(Date.parse(hasta) + 2 * UN_DIA_MS).toISOString()
  return `and(HoraEntrada.gte.${inicio},HoraEntrada.lt.${fin}),and(Fecha.gte.${desde},Fecha.lte.${hasta})`
}

/** Falta guardada por el sistema: se distingue de un registro capturado porque no tiene hora de entrada. */
export function esFaltaRegistrada(a: Asistencia): boolean {
  return a.id_estado === ID_ESTADO_FALTA && !a.HoraEntrada
}

export function fechaDelRegistro(a: Asistencia): string | null {
  return a.HoraEntrada ? fechaLocal(a.HoraEntrada) : a.Fecha
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

function estaCompleta(a: Asistencia): boolean {
  return Boolean(a.HoraEntrada && a.InicioComida && a.FinComida && a.HoraSalida)
}

export function estadoDelDia(registros: Asistencia[]): EstadoDia {
  const reales = registros.filter((r) => !esFaltaRegistrada(r))
  if (reales.length === 0) return 'falta'
  return reales.some(estaCompleta) ? 'asistio' : 'incompleto'
}

/** Días sin ningún registro (ni asistencia ni falta ya guardada) desde el ingreso de cada empleado hasta `hasta`. */
export function planificarFaltas(
  empleados: { id: number; Ingreso: string }[],
  asistencias: Asistencia[],
  hasta: string,
): FaltaNueva[] {
  const grupos = agruparPorEmpleadoYDia(asistencias)
  return empleados.flatMap((empleado) =>
    rangoDeFechas(empleado.Ingreso, hasta)
      .filter((fecha) => !grupos.has(`${empleado.id}|${fecha}`))
      .map((fecha) => ({ id_empleados: empleado.id, id_estado: ID_ESTADO_FALTA, Fecha: fecha })),
  )
}
