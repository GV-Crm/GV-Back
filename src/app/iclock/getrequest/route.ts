import type { NextRequest } from 'next/server'
import { ipDeLaPeticion, registrarContacto, texto } from '@/lib/checador/adms'

/**
 * "Latido" del checador (ADMS): cada pocos segundos pregunta si hay órdenes para él.
 *   GET /iclock/getrequest?SN=XXXX&INFO=Ver 8.0.4,usuarios,huellas,marcas,IP,...
 * Con esto sabemos que está conectado. Por ahora no le mandamos órdenes: siempre "OK".
 */
export async function GET(req: NextRequest) {
  const sn = req.nextUrl.searchParams.get('SN')
  if (!sn) return texto('Falta SN', 400)

  await registrarContacto(sn, ipDeLaPeticion(req), req.nextUrl.searchParams.get('INFO'))
  return texto('OK')
}
