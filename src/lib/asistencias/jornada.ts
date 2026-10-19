import {
  esFaltaRegistrada,
  ID_ESTADO_FALTA,
  ID_ESTADO_FALTA_JUSTIFICADA,
  rangoDeFechas,
  ZONA_HORARIA,
  type Asistencia,
  type EstadoDia,
  type PeriodoVacaciones,
} from './calendario'

/*
 * Reglas del horario de trabajo.
 *
 *   Lunes a viernes: 8:00 a 18:00.   Sábado: 8:00 a 14:00.   Domingo: descanso.
 *
 *   - Retardo:   la entrada es después de las 8:15.
 *   - Falta:     la entrada es después de las 9:00 (aunque haya trabajado), o un día laboral sin registros.
 *   - Horas extra: el trabajador checa su salida y VUELVE A CHECAR después de las 18:10 (sábado 14:10).
 *     Desde esa checada y hasta su última checada del día corre el tiempo extra, en minutos exactos.
 *     Si ese día cuenta como falta, no genera horas extra.
 *   - Vacaciones: un día laboral dentro de un periodo de vacaciones y sin checadas no es falta.
 *
 * Las checadas del día salen de dos lados: los registros de Asistencias (entrada, comida y salida) y las
 * marcas del checador. Se ordenan por hora: la primera es la entrada y la última, la salida.
 */

const ENTRADA = 8 * 60
const SALIDA_ENTRE_SEMANA = 18 * 60
const SALIDA_SABADO = 14 * 60

export const MINUTOS_TOLERANCIA_RETARDO = 15
export const MINUTOS_PARA_FALTA = 60
export const MINUTOS_TOLERANCIA_EXTRA = 10

/** Dos checadas con menos de esto de diferencia cuentan como una (la persona checó dos veces seguidas). */
const MINUTOS_CHECADA_REPETIDA = 5

/** Hora de entrada y de salida de un día, en minutos desde la medianoche. null = día de descanso. */
export function horarioDelDia(fecha: string): { entrada: number; salida: number } | null {
  const diaSemana = new Date(`${fecha}T00:00:00Z`).getUTCDay()
  if (diaSemana >= 1 && diaSemana <= 5) return { entrada: ENTRADA, salida: SALIDA_ENTRE_SEMANA }
  if (diaSemana === 6) return { entrada: ENTRADA, salida: SALIDA_SABADO }
  return null
}

/** Días laborables (lunes a sábado) entre dos fechas, incluidas. */
export function diasLaborablesEntre(desde: string, hasta: string): string[] {
  return rangoDeFechas(desde, hasta).filter((fecha) => horarioDelDia(fecha) !== null)
}

const formatoHora = new Intl.DateTimeFormat('en-GB', {
  timeZone: ZONA_HORARIA,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

/** Minutos desde la medianoche (con fracción por los segundos) de un instante, en hora de México. */
export function minutosDelDia(instante: Date | string): number {
  const partes = Object.fromEntries(formatoHora.formatToParts(new Date(instante)).map((p) => [p.type, p.value]))
  return Number(partes.hour) * 60 + Number(partes.minute) + Number(partes.second) / 60
}

type Checada = { hora: string; ms: number; tipo: 'entrada' | 'comida' | 'salida' | 'checador' }

/** Todas las checadas del día en orden, sin las repetidas (las que caen a menos de 5 min de la anterior). */
function checadasDelDia(registros: Asistencia[], marcas: string[]): Checada[] {
  const todas: Checada[] = []
  const agregar = (hora: string | null, tipo: Checada['tipo']) => {
    if (hora) todas.push({ hora, ms: Date.parse(hora), tipo })
  }
  for (const r of registros) {
    agregar(r.HoraEntrada, 'entrada')
    agregar(r.InicioComida, 'comida')
    agregar(r.FinComida, 'comida')
    agregar(r.HoraSalida, 'salida')
  }
  for (const marca of marcas) agregar(marca, 'checador')

  todas.sort((a, b) => a.ms - b.ms)
  return todas.filter((c, i) => i === 0 || c.ms - todas[i - 1].ms >= MINUTOS_CHECADA_REPETIDA * 60_000)
}

export type ResultadoDia = {
  estado: EstadoDia
  /** Primera y última checada de la jornada normal (sin el tiempo extra). */
  entrada: string | null
  salida: string | null
  /** Todas las checadas del día en orden (registros y checador), sin repetidas. */
  checadas: string[]
  /** Minutos después de la hora de entrada (0 si llegó a tiempo o antes). */
  minutosTarde: number
  retardo: boolean
  /** Tiempo extra del día. `fin` es null si volvió a checar pero todavía no checa su salida del tiempo extra. */
  extra: { inicio: string; fin: string | null } | null
  minutosExtra: number
  /** Periodo de vacaciones que incluye este día (aunque haya checado), o null. */
  vacaciones: PeriodoVacaciones | null
}

/**
 * Evalúa un día de un trabajador. `ahora` sirve para el día de hoy: después de las 9:00 sin registros ya es falta.
 * `vacaciones` es el periodo de vacaciones que incluye el día, si hay.
 */
export function evaluarDia(
  fecha: string,
  fechaHoy: string,
  registros: Asistencia[],
  marcas: string[],
  ahora: Date = new Date(),
  vacaciones: PeriodoVacaciones | null = null,
): ResultadoDia {
  const horario = horarioDelDia(fecha)
  const checadas = checadasDelDia(registros.filter((r) => !esFaltaRegistrada(r)), marcas)
  const justificada = registros.some((r) => r.id_estado === ID_ESTADO_FALTA_JUSTIFICADA)
  const resultado: ResultadoDia = {
    estado: 'descanso',
    entrada: null,
    salida: null,
    checadas: checadas.map((c) => c.hora),
    minutosTarde: 0,
    retardo: false,
    extra: null,
    minutosExtra: 0,
    vacaciones,
  }

  if (checadas.length === 0) {
    // Las vacaciones mandan sobre una falta guardada antes de registrarlas.
    if (horario && vacaciones) resultado.estado = 'vacaciones'
    else if (justificada) resultado.estado = 'justificada'
    else if (!horario) resultado.estado = 'descanso'
    else if (fecha !== fechaHoy) resultado.estado = 'falta'
    else resultado.estado = minutosDelDia(ahora) > horario.entrada + MINUTOS_PARA_FALTA ? 'falta' : 'pendiente'
    return resultado
  }

  // Un solo registro que es una salida capturada a mano: falta la entrada.
  if (checadas.length === 1 && checadas[0].tipo === 'salida') {
    resultado.salida = checadas[0].hora
    resultado.estado = justificada ? 'justificada' : 'sin_entrada'
    return resultado
  }

  const entrada = checadas[0]
  resultado.entrada = entrada.hora

  // Tiempo extra: a partir de la 3.ª checada (entrada, salida y la que vuelve a checar), la primera después de la tolerancia.
  let finJornada = checadas.length - 1
  if (horario) {
    const limite = horario.salida + MINUTOS_TOLERANCIA_EXTRA
    const inicioExtra = checadas.findIndex((c, i) => i >= 2 && minutosDelDia(c.hora) > limite)
    if (inicioExtra !== -1) {
      finJornada = inicioExtra - 1
      const ultima = checadas.length - 1
      resultado.extra = { inicio: checadas[inicioExtra].hora, fin: ultima > inicioExtra ? checadas[ultima].hora : null }
      if (ultima > inicioExtra) {
        resultado.minutosExtra = Math.floor((checadas[ultima].ms - checadas[inicioExtra].ms) / 60_000)
      }
    }
  }
  resultado.salida = finJornada > 0 ? checadas[finJornada].hora : null

  if (horario) {
    const tarde = minutosDelDia(entrada.hora) - horario.entrada
    resultado.minutosTarde = Math.max(0, Math.floor(tarde))
    resultado.retardo = tarde > MINUTOS_TOLERANCIA_RETARDO

    if (tarde > MINUTOS_PARA_FALTA) {
      // Llegó más de una hora tarde: cuenta como falta y no genera horas extra.
      resultado.estado = justificada ? 'justificada' : 'falta'
      resultado.extra = null
      resultado.minutosExtra = 0
      return resultado
    }
  }

  if (justificada) resultado.estado = 'justificada'
  else if (!resultado.salida) resultado.estado = 'sin_salida'
  else resultado.estado = resultado.retardo ? 'retardo' : 'asistio'
  return resultado
}

export type FaltaNueva = Pick<Asistencia, 'id_empleados' | 'id_estado'> & { Fecha: string }

/**
 * Días laborales sin ningún registro (ni asistencia, ni marca del checador, ni falta ya guardada) desde el
 * ingreso de cada empleado hasta `hasta`. `diasConRegistro` tiene claves "idEmpleado|fecha".
 */
export function planificarFaltas(
  empleados: { id: number; Ingreso: string }[],
  diasConRegistro: Set<string>,
  hasta: string,
): FaltaNueva[] {
  return empleados.flatMap((empleado) =>
    rangoDeFechas(empleado.Ingreso, hasta)
      .filter((fecha) => horarioDelDia(fecha) !== null && !diasConRegistro.has(`${empleado.id}|${fecha}`))
      .map((fecha) => ({ id_empleados: empleado.id, id_estado: ID_ESTADO_FALTA, Fecha: fecha })),
  )
}
