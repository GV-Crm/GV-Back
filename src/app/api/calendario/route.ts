import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  agruparPorEmpleadoYDia,
  esFechaValida,
  estadoDelDia,
  filtroAsistenciasDelRango,
  hoy,
  rangoDeFechas,
  type Asistencia,
} from '@/lib/asistencias/calendario'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'http://localhost:5173',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
}

const MAX_DIAS = 31

function errorRespuesta(mensaje: string, status: number) {
  return NextResponse.json({ error: mensaje }, { status, headers: CORS_HEADERS })
}

export async function OPTIONS() {
  return new NextResponse(null, { headers: CORS_HEADERS })
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const fechaHoy = hoy()
  const desde = params.get('desde') ?? fechaHoy
  const hastaPedido = params.get('hasta') ?? desde
  const uuid = params.get('uuid')

  if (!esFechaValida(desde) || !esFechaValida(hastaPedido)) {
    return errorRespuesta('Las fechas deben tener formato YYYY-MM-DD', 400)
  }

  // Los días futuros no pueden ser falta todavía: el rango se corta en hoy.
  const hasta = hastaPedido > fechaHoy ? fechaHoy : hastaPedido

  if (desde > hasta) {
    return errorRespuesta('"desde" debe ser anterior o igual a "hasta" y no puede ser una fecha futura', 400)
  }

  const dias = rangoDeFechas(desde, hasta)
  if (dias.length > MAX_DIAS) {
    return errorRespuesta(`El rango máximo es de ${MAX_DIAS} días`, 400)
  }

  const supabase = createAdminClient()

  let empleadosQuery = supabase
    .from('Empleados')
    .select('id, Uuid, Nombre, Area, Ingreso')
    .eq('Activo', true)
    .or(`Ingreso.is.null,Ingreso.lte.${hasta}`)
    .order('Nombre')
  if (uuid) empleadosQuery = empleadosQuery.eq('Uuid', uuid)

  const [empleadosRes, asistenciasRes] = await Promise.all([
    empleadosQuery,
    supabase.from('Asistencias').select('*').or(filtroAsistenciasDelRango(desde, hasta)),
  ])

  if (empleadosRes.error) return errorRespuesta(empleadosRes.error.message, 500)
  if (asistenciasRes.error) return errorRespuesta(asistenciasRes.error.message, 500)

  const registrosPorEmpleadoYDia = agruparPorEmpleadoYDia(asistenciasRes.data as Asistencia[])

  const empleados = empleadosRes.data.map((empleado) => ({
    ...empleado,
    // Antes de su ingreso el empleado no podía asistir, así que esos días no se evalúan.
    dias: dias.filter((fecha) => !empleado.Ingreso || fecha >= empleado.Ingreso).map((fecha) => {
      const registros = registrosPorEmpleadoYDia.get(`${empleado.id}|${fecha}`) ?? []
      return { fecha, estado: estadoDelDia(registros), registros }
    }),
  }))

  return NextResponse.json({ hoy: fechaHoy, desde, hasta, empleados }, { headers: CORS_HEADERS })
}
