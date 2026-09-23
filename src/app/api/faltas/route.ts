import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  diaAnterior,
  filtroAsistenciasDelRango,
  hoy,
  planificarFaltas,
  type Asistencia,
} from '@/lib/asistencias/calendario'

const TAMANO_PAGINA = 1000
const TAMANO_LOTE = 500

function errorRespuesta(mensaje: string, status: number) {
  return NextResponse.json({ error: mensaje }, { status })
}

/**
 * Guarda como falta (id_estado = 3) cada día sin registros, desde el ingreso de cada empleado activo hasta ayer.
 * Hoy no se procesa porque el día sigue en curso. Es idempotente: los días que ya tienen registro se saltan.
 * Con `?simular=1` solo informa lo que insertaría. Vercel Cron lo invoca con GET (ver vercel.json).
 */
export async function GET(req: NextRequest) {
  const secreto = process.env.CRON_SECRET
  if (!secreto) return errorRespuesta('CRON_SECRET no está configurado en el servidor', 500)
  if (req.headers.get('authorization') !== `Bearer ${secreto}`) {
    return errorRespuesta('No autorizado', 401)
  }

  const simular = req.nextUrl.searchParams.get('simular') === '1'
  const hasta = diaAnterior(hoy())
  const supabase = createAdminClient()

  const { data: empleados, error: errorEmpleados } = await supabase
    .from('Empleados')
    .select('id, Nombre, Ingreso')
    .eq('Activo', true)
    .not('Ingreso', 'is', null)
    .lte('Ingreso', hasta)
    .order('id')
  if (errorEmpleados) return errorRespuesta(errorEmpleados.message, 500)

  if (empleados.length === 0) {
    return NextResponse.json({ procesadoHasta: hasta, simulacion: simular, faltasNuevas: 0, porEmpleado: [] })
  }

  const desde = empleados.reduce((min, e) => (e.Ingreso < min ? e.Ingreso : min), empleados[0].Ingreso)

  // PostgREST devuelve como máximo 1000 filas por consulta, así que se pagina.
  const asistencias: Asistencia[] = []
  for (let inicio = 0; ; inicio += TAMANO_PAGINA) {
    const { data, error } = await supabase
      .from('Asistencias')
      .select('*')
      .or(filtroAsistenciasDelRango(desde, hasta))
      .order('id')
      .range(inicio, inicio + TAMANO_PAGINA - 1)
    if (error) return errorRespuesta(error.message, 500)
    asistencias.push(...(data as Asistencia[]))
    if (data.length < TAMANO_PAGINA) break
  }

  const faltas = planificarFaltas(empleados, asistencias, hasta)

  if (!simular) {
    for (let i = 0; i < faltas.length; i += TAMANO_LOTE) {
      const { error } = await supabase.from('Asistencias').insert(faltas.slice(i, i + TAMANO_LOTE))
      if (error) {
        return errorRespuesta(`Se guardaron ${i} de ${faltas.length} faltas antes del error: ${error.message}`, 500)
      }
    }
  }

  const porEmpleado = empleados.map((empleado) => {
    const suyas = faltas.filter((f) => f.id_empleados === empleado.id)
    return {
      id: empleado.id,
      Nombre: empleado.Nombre,
      faltas: suyas.length,
      primera: suyas[0]?.Fecha ?? null,
      ultima: suyas.at(-1)?.Fecha ?? null,
    }
  })

  return NextResponse.json({ procesadoHasta: hasta, simulacion: simular, faltasNuevas: faltas.length, porEmpleado })
}

export const POST = GET
