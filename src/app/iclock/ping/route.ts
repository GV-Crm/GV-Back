import type { NextRequest } from 'next/server'
import { ipDeLaPeticion, registrarContacto, snDeLaPeticion, texto } from '@/lib/checador/adms'

/**
 * Latido de los checadores de control de acceso que usan /iclock/ping en vez de /iclock/getrequest
 * (mientras suben mucha información). Con esto el módulo Checador lo muestra como "Conectado".
 */
async function responder(req: NextRequest) {
  const sn = snDeLaPeticion(req.nextUrl.searchParams)
  if (!sn) return texto('Falta SN', 400)

  await registrarContacto(sn, ipDeLaPeticion(req), null)
  return texto('OK')
}

export const GET = responder
export const POST = responder
