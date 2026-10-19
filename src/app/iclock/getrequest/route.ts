import type { NextRequest } from 'next/server'
import { ipDeLaPeticion, registrarContacto, snDeLaPeticion, texto } from '@/lib/checador/adms'

/**
 * "Latido" del checador (ADMS): cada pocos segundos pregunta si hay órdenes para él.
 *   GET /iclock/getrequest?SN=XXXX[&INFO=Ver 8.0.4,usuarios,huellas,marcas,IP,...]
 * Con esto sabemos que está conectado. Por ahora no le mandamos órdenes: siempre "OK".
 * INFO solo lo mandan los de asistencia; los de control de acceso dejan su versión en /iclock/registry.
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const sn = snDeLaPeticion(params)
  if (!sn) return texto('Falta SN', 400)

  await registrarContacto(sn, ipDeLaPeticion(req), params.get('INFO'))
  return texto('OK')
}
