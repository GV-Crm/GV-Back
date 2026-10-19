/*
 * Vacaciones y prima vacacional según la Ley Federal del Trabajo (reforma "Vacaciones Dignas",
 * DOF 27-dic-2022, vigente desde 2023 y en 2026):
 *
 *   Art. 76: al cumplir 1 año, 12 días laborables; +2 por año hasta 20 días al 5.º año.
 *            Desde el 6.º año, +2 días por cada 5 años: 6–10 años 22, 11–15 años 24, 16–20 años 26...
 *   Art. 79: si la relación termina antes de cumplir el año, le corresponden en proporción al tiempo trabajado.
 *   Art. 80: prima vacacional de al menos 25% del salario de los días de vacaciones.
 *   Art. 81: las vacaciones se deben dar dentro de los 6 meses siguientes al cumplir el año.
 *
 * Fechas en formato YYYY-MM-DD (fecha de México). Aquí no se registran los días que ya tomó.
 */

export const PRIMA_VACACIONAL_MINIMA = 25
const MESES_PARA_DISFRUTARLAS = 6
const UN_DIA_MS = 86_400_000

/** Días de vacaciones que corresponden al cumplir `anio` años de servicio (art. 76). */
export function diasDeVacaciones(anio: number): number {
  if (anio < 1) return 0
  if (anio <= 5) return 10 + 2 * anio
  return 22 + 2 * Math.floor((anio - 6) / 5)
}

/** Días ganados en total por todos sus años cumplidos (1.º año + 2.º año + ...). */
export function diasGanados(aniosCumplidos: number): number {
  let total = 0
  for (let anio = 1; anio <= aniosCumplidos; anio++) total += diasDeVacaciones(anio)
  return total
}

function partes(fecha: string) {
  const [anio, mes, dia] = fecha.split('-').map(Number)
  return { anio, mes, dia }
}

const formatear = (anio: number, mes: number, dia: number) =>
  `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`

const ultimoDiaDelMes = (anio: number, mes: number) => new Date(Date.UTC(anio, mes, 0)).getUTCDate()

/** Suma meses; si el día no existe en el mes destino (31 de feb.), usa el último día del mes. */
function sumarMeses(fecha: string, meses: number): string {
  const { anio, mes, dia } = partes(fecha)
  const total = anio * 12 + (mes - 1) + meses
  const anioNuevo = Math.floor(total / 12)
  const mesNuevo = (total % 12) + 1
  return formatear(anioNuevo, mesNuevo, Math.min(dia, ultimoDiaDelMes(anioNuevo, mesNuevo)))
}

const sumarAnios = (fecha: string, anios: number) => sumarMeses(fecha, anios * 12)

const diasEntre = (desde: string, hasta: string) => Math.round((Date.parse(hasta) - Date.parse(desde)) / UN_DIA_MS)

/** Años, meses y días completos entre dos fechas. */
function antiguedad(ingreso: string, hoy: string) {
  let meses = 0
  while (sumarMeses(ingreso, meses + 1) <= hoy) meses++
  return { anios: Math.floor(meses / 12), meses: meses % 12, dias: diasEntre(sumarMeses(ingreso, meses), hoy) }
}

export type Vacaciones = {
  ingreso: string
  antiguedad: { anios: number; meses: number; dias: number }
  /** El último año de servicio cumplido: los días que ya ganó. null si todavía no cumple 1 año. */
  periodoActual: {
    anioDeServicio: number
    aniversario: string
    /** Fecha límite para darle esas vacaciones (6 meses después del aniversario, art. 81). */
    disfrutarAntesDe: string
    dias: number
    /** Ya pasó la fecha límite. */
    vencido: boolean
  } | null
  /** El año de servicio en curso. */
  siguiente: { anioDeServicio: number; aniversario: string; dias: number; faltanDias: number }
  /** Días acumulados del año en curso, en proporción a lo trabajado (art. 79). Con 2 decimales. */
  proporcionales: number
  prima: {
    porcentaje: number
    /** Días de salario que vale la prima del periodo actual (o de los proporcionales si no cumple 1 año). */
    diasDeSalario: number
  }
}

export function calcularVacaciones(ingreso: string, hoy: string, porcentajePrima = PRIMA_VACACIONAL_MINIMA): Vacaciones {
  const tiempo = antiguedad(ingreso, hoy)
  const cumplidos = tiempo.anios

  const ultimoAniversario = sumarAnios(ingreso, cumplidos)
  const proximoAniversario = sumarAnios(ingreso, cumplidos + 1)
  const diasSiguiente = diasDeVacaciones(cumplidos + 1)
  const fraccion = diasEntre(ultimoAniversario, hoy) / diasEntre(ultimoAniversario, proximoAniversario)
  const proporcionales = Math.round(diasSiguiente * fraccion * 100) / 100

  const periodoActual =
    cumplidos >= 1
      ? (() => {
          const limite = sumarMeses(ultimoAniversario, MESES_PARA_DISFRUTARLAS)
          return {
            anioDeServicio: cumplidos,
            aniversario: ultimoAniversario,
            disfrutarAntesDe: limite,
            dias: diasDeVacaciones(cumplidos),
            vencido: hoy > limite,
          }
        })()
      : null

  const baseDeLaPrima = periodoActual?.dias ?? proporcionales
  return {
    ingreso,
    antiguedad: tiempo,
    periodoActual,
    siguiente: {
      anioDeServicio: cumplidos + 1,
      aniversario: proximoAniversario,
      dias: diasSiguiente,
      faltanDias: diasEntre(hoy, proximoAniversario),
    },
    proporcionales,
    prima: {
      porcentaje: porcentajePrima,
      diasDeSalario: Math.round(baseDeLaPrima * (porcentajePrima / 100) * 100) / 100,
    },
  }
}
