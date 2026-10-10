import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { autorizar } from '@/lib/supabase/auth'
import { borrarFoto, guardarFoto, leerFoto } from '@/lib/fotos'

function errorRespuesta(mensaje: string, status: number) {
  return NextResponse.json({ error: mensaje }, { status })
}

/** Busca el id del trabajador (la foto se guarda como empleado-<id>.webp). */
async function idDelTrabajador(uuid: string): Promise<number | null> {
  const { data } = await createAdminClient().from('Empleados').select('id').eq('Uuid', uuid).maybeSingle()
  return data?.id ?? null
}

/** Cambia la foto de un trabajador. Requiere "editar Empleado". Body: `{ imagen: 'data:image/webp;base64,...' }`. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ uuid: string }> }) {
  const acceso = await autorizar(req, 'editar', 'Empleado')
  if (acceso.respuesta) return acceso.respuesta

  const { uuid } = await params
  const id = await idDelTrabajador(uuid)
  if (!id) return errorRespuesta('No existe ese trabajador', 404)

  const body = await req.json().catch(() => null)
  const foto = leerFoto(body?.imagen)
  if ('error' in foto) return errorRespuesta(foto.error, 400)

  try {
    const url = await guardarFoto(`empleado-${id}.webp`, foto.archivo)
    const { error } = await createAdminClient().from('Empleados').update({ Foto: url }).eq('id', id)
    if (error) return errorRespuesta(error.message, 500)
    return NextResponse.json({ Foto: url })
  } catch (err) {
    return errorRespuesta(err instanceof Error ? err.message : 'No se pudo guardar la foto', 500)
  }
}

/** Quita la foto de un trabajador. Requiere "editar Empleado". */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ uuid: string }> }) {
  const acceso = await autorizar(req, 'editar', 'Empleado')
  if (acceso.respuesta) return acceso.respuesta

  const { uuid } = await params
  const id = await idDelTrabajador(uuid)
  if (!id) return errorRespuesta('No existe ese trabajador', 404)

  await borrarFoto(`empleado-${id}.webp`)
  const { error } = await createAdminClient().from('Empleados').update({ Foto: null }).eq('id', id)
  if (error) return errorRespuesta(error.message, 500)

  return NextResponse.json({ Foto: null })
}
