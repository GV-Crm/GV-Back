import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { autorizar } from '@/lib/supabase/auth'
import {
  COLUMNAS_DATOS_PERSONALES,
  DATOS_VACIOS,
  DuplicadoError,
  guardarDatosPersonales,
  leerDatosPersonales,
  motivoDeDuplicado,
} from '@/lib/empleados/datos-personales'

type Contexto = { params: Promise<{ uuid: string }> }

function errorRespuesta(mensaje: string, status: number) {
  return NextResponse.json({ error: mensaje }, { status })
}

async function idDelEmpleado(uuid: string): Promise<number | null> {
  const { data, error } = await createAdminClient().from('Empleados').select('id').eq('Uuid', uuid).maybeSingle()
  if (error) throw new Error(error.message)
  return data?.id ?? null
}

/** Datos personales de un trabajador. Si todavía no se capturan, regresa todo vacío. */
export async function GET(req: NextRequest, { params }: Contexto) {
  const acceso = await autorizar(req, 'gestionar', 'DatosPersonales')
  if (acceso.respuesta) return acceso.respuesta

  const id = await idDelEmpleado((await params).uuid)
  if (id === null) return errorRespuesta('No existe ese trabajador', 404)

  const { data, error } = await createAdminClient()
    .from('DatosPersonales')
    .select(COLUMNAS_DATOS_PERSONALES)
    .eq('id_empleados', id)
    .maybeSingle()
  if (error) return errorRespuesta(error.message, 500)

  return NextResponse.json(data ?? { ...DATOS_VACIOS, ActualizadoEn: null, ActualizadoPor: null })
}

/** Guarda los datos personales completos (lo que no venga se borra). */
export async function PUT(req: NextRequest, { params }: Contexto) {
  const acceso = await autorizar(req, 'gestionar', 'DatosPersonales')
  if (acceso.respuesta) return acceso.respuesta

  const id = await idDelEmpleado((await params).uuid)
  if (id === null) return errorRespuesta('No existe ese trabajador', 404)

  const leido = leerDatosPersonales(await req.json().catch(() => null))
  if ('error' in leido) return errorRespuesta(leido.error, 400)

  const duplicado = await motivoDeDuplicado(leido.datos, id)
  if (duplicado) return errorRespuesta(duplicado, 409)

  try {
    return NextResponse.json(await guardarDatosPersonales(id, leido.datos, acceso.perfil.correo))
  } catch (err) {
    if (err instanceof DuplicadoError) return errorRespuesta(err.message, 409)
    throw err
  }
}
