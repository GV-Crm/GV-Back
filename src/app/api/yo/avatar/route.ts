import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { autorizar } from '@/lib/supabase/auth'
import { borrarFoto, guardarFoto, leerFoto } from '@/lib/fotos'

const rutaDeLaFoto = (cuentaId: number) => `cuenta-${cuentaId}.webp`

function errorRespuesta(mensaje: string, status: number) {
  return NextResponse.json({ error: mensaje }, { status })
}

/** El usuario sube su propia foto. Body: `{ imagen: 'data:image/webp;base64,...' }`. */
export async function POST(req: NextRequest) {
  const acceso = await autorizar(req)
  if (acceso.respuesta) return acceso.respuesta

  const body = await req.json().catch(() => null)
  const foto = leerFoto(body?.imagen)
  if ('error' in foto) return errorRespuesta(foto.error, 400)

  try {
    const avatar = await guardarFoto(rutaDeLaFoto(acceso.perfil.cuentaId), foto.archivo)
    const { error } = await createAdminClient().from('Roles').update({ Avatar: avatar }).eq('id', acceso.perfil.cuentaId)
    if (error) return errorRespuesta(error.message, 500)
    return NextResponse.json({ avatar })
  } catch (err) {
    return errorRespuesta(err instanceof Error ? err.message : 'No se pudo guardar la foto', 500)
  }
}

/** El usuario quita su foto: se borra el archivo y vuelven a verse sus iniciales. */
export async function DELETE(req: NextRequest) {
  const acceso = await autorizar(req)
  if (acceso.respuesta) return acceso.respuesta

  await borrarFoto(rutaDeLaFoto(acceso.perfil.cuentaId))
  const { error } = await createAdminClient().from('Roles').update({ Avatar: null }).eq('id', acceso.perfil.cuentaId)
  if (error) return errorRespuesta(error.message, 500)

  return NextResponse.json({ avatar: null })
}
