import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { autorizar } from '@/lib/supabase/auth'
import { esFechaValida, hoy } from '@/lib/asistencias/calendario'
import { diasLaborablesEntre, horarioDelDia } from '@/lib/asistencias/jornada'
import { calcularVacaciones, diasGanados } from '@/lib/empleados/vacaciones'

const MAX_DIAS = 40
const MAX_NOTA = 300

function errorRespuesta(mensaje: string, status: number) {
  return NextResponse.json({ error: mensaje }, { status })
}

/** "lun 21 oct" para los mensajes de error. */
const corta = (fecha: string) =>
  new Date(`${fecha}T12:00:00Z`).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })

/**
 * Las fechas de la solicitud: días sueltos (`fechas`) o un rango (`desde`/`hasta`, se toman sus días
 * laborables). Devuelve las fechas en orden y sin repetir, o el motivo por el que no sirven.
 */
function leerFechas(body: Record<string, unknown>): { fechas: string[] } | { error: string } {
  let fechas: string[]
  if (Array.isArray(body.fechas)) {
    if (!body.fechas.every((f) => typeof f === 'string' && esFechaValida(f))) {
      return { error: 'Las fechas deben tener formato YYYY-MM-DD' }
    }
    fechas = [...new Set(body.fechas as string[])].sort()
    const domingo = fechas.find((f) => horarioDelDia(f) === null)
    if (domingo) return { error: `El ${corta(domingo)} es domingo: no es día laborable` }
  } else if (typeof body.desde === 'string' && typeof body.hasta === 'string') {
    if (!esFechaValida(body.desde) || !esFechaValida(body.hasta)) return { error: 'Las fechas deben tener formato YYYY-MM-DD' }
    if (body.desde > body.hasta) return { error: 'La fecha de inicio debe ser anterior o igual a la de fin' }
    if (Date.parse(body.hasta) - Date.parse(body.desde) > 366 * 86_400_000) return { error: 'El rango no puede pasar de un año' }
    fechas = diasLaborablesEntre(body.desde, body.hasta)
  } else {
    return { error: 'Se espera { uuid, fechas: [...] } o { uuid, desde, hasta }' }
  }

  if (fechas.length === 0) return { error: 'Elige al menos un día laborable (de lunes a sábado)' }
  if (fechas.length > MAX_DIAS) return { error: `Una solicitud puede tener máximo ${MAX_DIAS} días` }
  return { fechas }
}

/**
 * Registra una solicitud de vacaciones. Requiere "gestionar Vacaciones".
 * Body: `{ uuid, fechas: ['YYYY-MM-DD', ...], nota? }` (días salteados) o `{ uuid, desde, hasta, nota? }`
 * (días seguidos: se toman los laborables del rango). En el calendario esos días quedan como "vacaciones".
 * Pueden ser pasados (para justificar faltas) o futuros (vacaciones programadas).
 * No se pueden pedir más días de los disponibles: los ganados por sus años cumplidos menos los ya pedidos.
 */
export async function POST(req: NextRequest) {
  const acceso = await autorizar(req, 'gestionar', 'Vacaciones')
  if (acceso.respuesta) return acceso.respuesta

  const body = await req.json().catch(() => null)
  if (typeof body?.uuid !== 'string') return errorRespuesta('Falta el trabajador (uuid)', 400)

  const leidas = leerFechas(body)
  if ('error' in leidas) return errorRespuesta(leidas.error, 400)
  const { fechas } = leidas
  const desde = fechas[0]
  const hasta = fechas[fechas.length - 1]

  const nota = typeof body.nota === 'string' ? body.nota.trim() : ''
  if (nota.length > MAX_NOTA) return errorRespuesta(`La nota puede tener máximo ${MAX_NOTA} caracteres`, 400)

  const supabase = createAdminClient()
  const { data: empleado, error } = await supabase.from('Empleados').select('id, Ingreso').eq('Uuid', body.uuid).maybeSingle()
  if (error) return errorRespuesta(error.message, 500)
  if (!empleado) return errorRespuesta('No existe ese trabajador', 404)
  if (empleado.Ingreso && desde < empleado.Ingreso) return errorRespuesta(`El ${corta(desde)} es antes de su fecha de ingreso`, 400)

  // Ningún día puede estar ya en otra solicitud suya.
  const { data: cercanas, error: errorCercanas } = await supabase
    .from('Vacaciones')
    .select('Fechas')
    .eq('id_empleados', empleado.id)
    .lte('Desde', hasta)
    .gte('Hasta', desde)
  if (errorCercanas) return errorRespuesta(errorCercanas.message, 500)
  const yaPedidos = new Set(cercanas.flatMap((v) => v.Fechas as string[]))
  const repetidos = fechas.filter((f) => yaPedidos.has(f))
  if (repetidos.length > 0) {
    return errorRespuesta(`Ya tiene vacaciones registradas el ${repetidos.slice(0, 3).map(corta).join(', ')}`, 409)
  }

  // No puede pedir más días de los que tiene disponibles (ganados por sus años cumplidos menos los ya pedidos).
  if (!empleado.Ingreso) return errorRespuesta('El trabajador no tiene fecha de ingreso: agrégala en Trabajadores', 409)
  const fechaHoy = hoy()
  const { antiguedad, siguiente } = calcularVacaciones(empleado.Ingreso, fechaHoy > empleado.Ingreso ? fechaHoy : empleado.Ingreso)
  const { data: todas, error: errorTodas } = await supabase.from('Vacaciones').select('Dias').eq('id_empleados', empleado.id)
  if (errorTodas) return errorRespuesta(errorTodas.message, 500)
  const disponibles = diasGanados(antiguedad.anios) - todas.reduce((total, v) => total + v.Dias, 0)
  if (disponibles <= 0) {
    const motivo =
      antiguedad.anios === 0
        ? `todavía no cumple 1 año; gana sus primeros ${siguiente.dias} días el ${corta(siguiente.aniversario)}`
        : 'ya pidió todos los días que ha ganado'
    return errorRespuesta(`No tiene días de vacaciones disponibles: ${motivo}`, 409)
  }
  if (fechas.length > disponibles) {
    return errorRespuesta(`Solo le quedan ${disponibles} ${disponibles === 1 ? 'día' : 'días'} de vacaciones y pediste ${fechas.length}`, 409)
  }

  const { data, error: errorAlta } = await supabase
    .from('Vacaciones')
    .insert({
      id_empleados: empleado.id,
      Desde: desde,
      Hasta: hasta,
      Fechas: fechas,
      Dias: fechas.length,
      Nota: nota || null,
      RegistradoPor: acceso.perfil.nombre ?? acceso.perfil.correo,
    })
    .select('id, Desde, Hasta, Fechas, Dias, Nota, RegistradoPor, RegistradoEn')
    .single()
  if (errorAlta) return errorRespuesta(errorAlta.message, 500)

  return NextResponse.json(data, { status: 201 })
}
