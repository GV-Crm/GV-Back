import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { autorizar } from '@/lib/supabase/auth'
import { horarioDelDia, minutosDelDia, MINUTOS_PERMISO_SALIDA } from '@/lib/asistencias/jornada'
import { diaDeHoyDe, horaLocal } from '@/lib/asistencias/permisos-salida'

const MAX_MOTIVO = 200

function errorRespuesta(mensaje: string, status: number) {
  return NextResponse.json({ error: mensaje }, { status })
}

/**
 * Da permiso a un trabajador para salir antes de su hora. Requiere "autorizar Salida".
 * Body: `{ uuid, motivo? }`. Se abren 10 minutos: la checada que haga en ese tiempo es su salida y el día
 * queda como "permiso" en el calendario. Solo para hoy, si ya registró su entrada y antes de su hora de salida.
 */
export async function POST(req: NextRequest) {
  const acceso = await autorizar(req, 'autorizar', 'Salida')
  if (acceso.respuesta) return acceso.respuesta

  const body = await req.json().catch(() => null)
  if (typeof body?.uuid !== 'string') return errorRespuesta('Falta el trabajador (uuid)', 400)
  const motivo = typeof body.motivo === 'string' ? body.motivo.trim() : ''
  if (motivo.length > MAX_MOTIVO) return errorRespuesta(`El motivo puede tener máximo ${MAX_MOTIVO} caracteres`, 400)

  const hoy = await diaDeHoyDe(body.uuid)
  if (!hoy) return errorRespuesta('No existe ese trabajador o está dado de baja', 404)
  const { empleado, dia, fecha } = hoy

  const horario = horarioDelDia(fecha)
  if (!horario) return errorRespuesta('Hoy no es día laboral', 409)
  const ahora = new Date()
  // Solo para probar en local fuera de horario: PRUEBA_PERMISO_SIN_HORARIO=1 en .env (en producción no aplica).
  const sinHorario = process.env.NODE_ENV !== 'production' && process.env.PRUEBA_PERMISO_SIN_HORARIO === '1'
  if (!sinHorario && minutosDelDia(ahora) >= horario.salida) {
    return errorRespuesta('Ya pasó su hora de salida: puede checar sin permiso', 409)
  }
  if (!dia.entrada) return errorRespuesta('Todavía no registra su entrada de hoy', 409)
  if (dia.permisoSalida?.situacion === 'usado') {
    return errorRespuesta('Ya salió hoy con permiso', 409)
  }
  if (dia.permisoSalida?.situacion === 'activo') {
    return errorRespuesta(`Ya tiene un permiso activo hasta las ${horaLocal(dia.permisoSalida.venceEn)}`, 409)
  }

  const { data, error } = await createAdminClient()
    .from('PermisosSalida')
    .insert({
      id_empleados: empleado.id,
      Fecha: fecha,
      AutorizadoEn: ahora.toISOString(),
      VenceEn: new Date(ahora.getTime() + MINUTOS_PERMISO_SALIDA * 60_000).toISOString(),
      Motivo: motivo || null,
      AutorizadoPor: acceso.perfil.nombre ?? acceso.perfil.correo,
    })
    .select('id, Fecha, AutorizadoEn, VenceEn, Motivo, AutorizadoPor')
    .single()
  if (error) return errorRespuesta(error.message, 500)

  return NextResponse.json(data, { status: 201 })
}
