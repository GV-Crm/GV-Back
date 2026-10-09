import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { autorizar } from '@/lib/supabase/auth'
import {
  esFaltaRegistrada,
  esFechaValida,
  fechaDelRegistro,
  filtroAsistenciasDelRango,
  hoy,
  ID_ESTADO_FALTA,
  ID_ESTADO_FALTA_JUSTIFICADA,
  type Asistencia,
} from '@/lib/asistencias/calendario'

function errorRespuesta(mensaje: string, status: number) {
  return NextResponse.json({ error: mensaje }, { status })
}

/**
 * Marca (o desmarca) como "Falta Justificada" un día sin entrada ni salida.
 * Body: `{ uuid, fecha: 'YYYY-MM-DD', justificada: boolean }`. Si la falta aún no estaba guardada, se crea.
 */
export async function POST(req: NextRequest) {
  const acceso = await autorizar(req, 'justificar_faltas')
  if (acceso.respuesta) return acceso.respuesta

  const body = await req.json().catch(() => null)
  const { uuid, fecha, justificada } = body ?? {}
  if (typeof uuid !== 'string' || typeof fecha !== 'string' || typeof justificada !== 'boolean') {
    return errorRespuesta('Se espera { uuid, fecha, justificada }', 400)
  }
  if (!esFechaValida(fecha)) return errorRespuesta('La fecha debe tener formato YYYY-MM-DD', 400)
  if (fecha > hoy()) return errorRespuesta('No se puede justificar un día futuro', 400)

  const supabase = createAdminClient()

  const { data: empleado, error: errorEmpleado } = await supabase
    .from('Empleados')
    .select('id, Ingreso')
    .eq('Uuid', uuid)
    .maybeSingle()
  if (errorEmpleado) return errorRespuesta(errorEmpleado.message, 500)
  if (!empleado) return errorRespuesta('No existe ese trabajador', 404)
  if (empleado.Ingreso && fecha < empleado.Ingreso) return errorRespuesta('La fecha es anterior a su ingreso', 400)

  const { data, error } = await supabase
    .from('Asistencias')
    .select('*')
    .eq('id_empleados', empleado.id)
    .or(filtroAsistenciasDelRango(fecha, fecha))
  if (error) return errorRespuesta(error.message, 500)

  const delDia = (data as Asistencia[]).filter((a) => fechaDelRegistro(a) === fecha)
  if (delDia.some((a) => !esFaltaRegistrada(a))) {
    return errorRespuesta('Ese día tiene registro de entrada o salida, no es una falta', 409)
  }

  const idEstado = justificada ? ID_ESTADO_FALTA_JUSTIFICADA : ID_ESTADO_FALTA
  const resultado =
    delDia.length > 0
      ? await supabase.from('Asistencias').update({ id_estado: idEstado }).in('id', delDia.map((a) => a.id))
      : await supabase.from('Asistencias').insert({ id_empleados: empleado.id, Fecha: fecha, id_estado: idEstado })
  if (resultado.error) return errorRespuesta(resultado.error.message, 500)

  return NextResponse.json({ fecha, justificada })
}
