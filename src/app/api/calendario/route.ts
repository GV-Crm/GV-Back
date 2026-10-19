import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { autorizar } from '@/lib/supabase/auth'
import {
  agruparMarcasPorPinYDia,
  agruparPorEmpleadoYDia,
  esFechaValida,
  hoy,
  rangoDeFechas,
  vacacionesDelDia,
} from '@/lib/asistencias/calendario'
import { evaluarDia } from '@/lib/asistencias/jornada'
import {
  agruparVacacionesPorEmpleado,
  cargarAsistencias,
  cargarMarcas,
  cargarVacaciones,
} from '@/lib/asistencias/registros'

const MAX_DIAS = 31

function errorRespuesta(mensaje: string, status: number) {
  return NextResponse.json({ error: mensaje }, { status })
}

/**
 * Estado de cada día (máx. 31) de los trabajadores, con las reglas de jornada.ts: entrada, salida,
 * retardo y horas extra. Toma en cuenta los registros de Asistencias y las marcas del checador.
 * Cada trabajador trae sus `totales` del rango (asistencias, retardos, faltas, vacaciones y minutos extra) y
 * sus periodos de `vacaciones` que tocan el rango pedido, aunque sean futuros (así se ven las programadas).
 * Los días futuros no se evalúan: un rango que empieza después de hoy regresa `dias` vacío.
 */
export async function GET(req: NextRequest) {
  const acceso = await autorizar(req, 'ver', 'Asistencia')
  if (acceso.respuesta) return acceso.respuesta

  const params = req.nextUrl.searchParams
  const ahora = new Date()
  const fechaHoy = hoy()
  const desde = params.get('desde') ?? fechaHoy
  const hastaPedido = params.get('hasta') ?? desde
  const uuid = params.get('uuid')

  if (!esFechaValida(desde) || !esFechaValida(hastaPedido)) {
    return errorRespuesta('Las fechas deben tener formato YYYY-MM-DD', 400)
  }

  if (desde > hastaPedido) return errorRespuesta('"desde" debe ser anterior o igual a "hasta"', 400)
  if (rangoDeFechas(desde, hastaPedido).length > MAX_DIAS) {
    return errorRespuesta(`El rango máximo es de ${MAX_DIAS} días`, 400)
  }

  // Los días futuros no pueden ser falta todavía: se evalúa solo hasta hoy.
  const hasta = hastaPedido > fechaHoy ? fechaHoy : hastaPedido
  const dias = desde <= hasta ? rangoDeFechas(desde, hasta) : []

  let empleadosQuery = createAdminClient()
    .from('Empleados')
    .select('id, Uuid, Nombre, Area, Ingreso, PinChecador')
    .or(`Ingreso.is.null,Ingreso.lte.${hastaPedido}`)
    .order('Nombre')
  // Un empleado concreto se consulta aunque esté inactivo, para poder ver su historial.
  empleadosQuery = uuid ? empleadosQuery.eq('Uuid', uuid) : empleadosQuery.eq('Activo', true)

  const empleadosRes = await empleadosQuery
  if (empleadosRes.error) return errorRespuesta(empleadosRes.error.message, 500)
  if (uuid && empleadosRes.data.length === 0) return NextResponse.json({ hoy: fechaHoy, desde, hasta, empleados: [] })

  const idEmpleado = uuid ? empleadosRes.data[0].id : undefined
  const [asistencias, marcas, vacaciones] = await Promise.all([
    dias.length ? cargarAsistencias(desde, hasta, idEmpleado) : [],
    dias.length ? cargarMarcas(desde, hasta, empleadosRes.data.map((e) => e.PinChecador)) : [],
    cargarVacaciones(desde, hastaPedido, idEmpleado),
  ])
  const registrosPorDia = agruparPorEmpleadoYDia(asistencias)
  const marcasPorDia = agruparMarcasPorPinYDia(marcas)
  const vacacionesPorEmpleado = agruparVacacionesPorEmpleado(vacaciones)

  const empleados = empleadosRes.data.map((empleado) => {
    const totales = { asistencias: 0, retardos: 0, faltas: 0, vacaciones: 0, minutosExtra: 0 }
    const susVacaciones = vacacionesPorEmpleado.get(empleado.id) ?? []
    // Antes de su ingreso el empleado no podía asistir, así que esos días no se evalúan.
    const diasDelEmpleado = dias
      .filter((fecha) => !empleado.Ingreso || fecha >= empleado.Ingreso)
      .map((fecha) => {
        const registros = registrosPorDia.get(`${empleado.id}|${fecha}`) ?? []
        const marcasDelDia = marcasPorDia.get(`${empleado.PinChecador}|${fecha}`) ?? []
        const dia = evaluarDia(fecha, fechaHoy, registros, marcasDelDia, ahora, vacacionesDelDia(susVacaciones, fecha))
        if (['asistio', 'retardo', 'sin_salida', 'sin_entrada'].includes(dia.estado)) totales.asistencias++
        if (dia.retardo && dia.estado !== 'falta' && dia.estado !== 'justificada') totales.retardos++
        if (dia.estado === 'falta') totales.faltas++
        if (dia.estado === 'vacaciones') totales.vacaciones++
        totales.minutosExtra += dia.minutosExtra
        return { fecha, ...dia, registros }
      })
    return { ...empleado, totales, vacaciones: susVacaciones, dias: diasDelEmpleado }
  })

  return NextResponse.json({ hoy: fechaHoy, desde, hasta, empleados })
}
