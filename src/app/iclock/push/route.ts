import type { NextRequest } from 'next/server'
import { configuracionPush, ipDeLaPeticion, registrarContacto, snDeLaPeticion, texto } from '@/lib/checador/adms'

/**
 * Después de registrarse, el checador de control de acceso pide su configuración:
 *   POST (o GET, según la versión) /iclock/push?SN=XXXX
 * Se responde cada cuánto mandar latidos, qué tablas subir y que mande las marcas al momento.
 */
async function responder(req: NextRequest) {
  const sn = snDeLaPeticion(req.nextUrl.searchParams)
  if (!sn) return texto('Falta SN', 400)

  await registrarContacto(sn, ipDeLaPeticion(req), null)
  return texto(configuracionPush())
}

export const GET = responder
export const POST = responder
