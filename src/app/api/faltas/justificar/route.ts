import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { autorizar } from '@/lib/supabase/auth'
import {
  esFaltaRegistrada,
  esFechaValida,
  fechaDelRegistro,
  fechaLocal,
  hoy,
  ID_ESTADO_FALTA,
  ID_ESTADO_FALTA_JUSTIFICADA,
  type EstadoDia,
} from '@/lib/asistencias/calendario'
import { evaluarDia } from '@/lib/asistencias/jornada'
import { cargarAsistencias, cargarMarcas, cargarVacaciones } from '@/lib/asistencias/registros'

function errorRespuesta(mensaje: string, status: number) {
  return NextResponse.json({ error: mensaje }, { status })
}

const MAX_MOTIVO = 300
const ESTADOS_JUSTIFICABLES: EstadoDia[] = ['falta', 'justificada', 'pendiente']

/**
 * Marca (o desmarca) como "Falta Justificada" un día que cuenta como falta: sin registros, o con entrada
 * después de las 9:00 (ver jornada.ts).
 * Body: `{ uuid, fecha: 'YYYY-MM-DD', justificada: boolean, motivo?: string }`.
 * Para justificar, el motivo es obligatorio. Si la falta aún no estaba guardada, se crea.
 */
export async function POST(req: NextRequest) {
  const acceso = await autorizar(req, 'justificar', 'Falta')
  if (acceso.respuesta) return acceso.respuesta

  const body = await req.json().catch(() => null)
  const { uuid, fecha, justificada } = body ?? {}
  if (typeof uuid !== 'string' || typeof fecha !== 'string' || typeof justificada !== 'boolean') {
    return errorRespuesta('Se espera { uuid, fecha, justificada, motivo }', 400)
  }
  if (!esFechaValida(fecha)) return errorRespuesta('La fecha debe tener formato YYYY-MM-DD', 400)
  if (fecha > hoy()) return errorRespuesta('No se puede justificar un día futuro', 400)

  const motivo = typeof body.motivo === 'string' ? body.motivo.trim() : ''
  if (justificada && !motivo) return errorRespuesta('Escribe el motivo de la justificación', 400)
  if (motivo.length > MAX_MOTIVO) return errorRespuesta(`El motivo puede tener máximo ${MAX_MOTIVO} caracteres`, 400)

  const supabase = createAdminClient()

  const { data: empleado, error: errorEmpleado } = await supabase
    .from('Empleados')
    .select('id, Ingreso, PinChecador')
    .eq('Uuid', uuid)
    .maybeSingle()
  if (errorEmpleado) return errorRespuesta(errorEmpleado.message, 500)
  if (!empleado) return errorRespuesta('No existe ese trabajador', 404)
  if (empleado.Ingreso && fecha < empleado.Ingreso) return errorRespuesta('La fecha es anterior a su ingreso', 400)

  const [asistencias, marcas, vacaciones] = await Promise.all([
    cargarAsistencias(fecha, fecha, empleado.id),
    cargarMarcas(fecha, fecha, [empleado.PinChecador]),
    cargarVacaciones(fecha, fecha, empleado.id),
  ])
  const delDia = asistencias.filter((a) => fechaDelRegistro(a) === fecha)
  const marcasDelDia = marcas.filter((m) => fechaLocal(m.FechaHora) === fecha).map((m) => m.FechaHora)

  // Se puede justificar un día sin registros o uno en el que llegó más de 1 hora tarde (los dos cuentan como falta).
  const { estado } = evaluarDia(fecha, hoy(), delDia, marcasDelDia, new Date(), vacaciones[0] ?? null)
  if (estado === 'vacaciones') return errorRespuesta('Ese día está de vacaciones: no es una falta', 409)
  if (!ESTADOS_JUSTIFICABLES.includes(estado)) {
    return errorRespuesta('Ese día no es una falta: tiene entrada a tiempo o con retardo', 409)
  }

  // La justificación es una fila sin horas; las filas con horas (entrada, salida...) no se tocan.
  const filasDeFalta = delDia.filter(esFaltaRegistrada)
  const tieneChecadas = delDia.length > filasDeFalta.length || marcasDelDia.length > 0

  let resultado
  if (justificada) {
    const cambios = {
      id_estado: ID_ESTADO_FALTA_JUSTIFICADA,
      Justificacion: motivo,
      JustificadoPor: acceso.perfil.nombre ?? acceso.perfil.correo,
    }
    resultado =
      filasDeFalta.length > 0
        ? await supabase.from('Asistencias').update(cambios).in('id', filasDeFalta.map((a) => a.id))
        : await supabase.from('Asistencias').insert({ id_empleados: empleado.id, Fecha: fecha, ...cambios })
  } else if (tieneChecadas) {
    // Falta por llegar tarde: al quitar la justificación basta con borrarla; la falta se vuelve a calcular sola.
    resultado = await supabase.from('Asistencias').delete().in('id', filasDeFalta.map((a) => a.id))
  } else {
    // Al quitar la justificación también se borran el motivo y quién la puso.
    resultado = await supabase
      .from('Asistencias')
      .update({ id_estado: ID_ESTADO_FALTA, Justificacion: null, JustificadoPor: null })
      .in('id', filasDeFalta.map((a) => a.id))
  }
  if (resultado.error) return errorRespuesta(resultado.error.message, 500)

  return NextResponse.json({ fecha, justificada, motivo: justificada ? motivo : null })
}
