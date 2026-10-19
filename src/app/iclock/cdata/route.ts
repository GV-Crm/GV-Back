import type { NextRequest } from 'next/server'
import {
  configuracionParaElChecador,
  guardarMarcas,
  ipDeLaPeticion,
  leerMarcas,
  leerRtlog,
  registrarContacto,
  respuestaTabledata,
  snDeLaPeticion,
  texto,
} from '@/lib/checador/adms'

/**
 * Saludo del checador. Lo manda al encender o al reconectarse:
 *   GET /iclock/cdata?SN=XXXX&options=all[&pushver=3.1.2&DeviceType=acc]
 * - Control de acceso (DeviceType=acc): se responde "OK" y el equipo sigue con /iclock/registry.
 * - Asistencia (T&A): se responde su configuración (latidos, zona horaria, etc.).
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const sn = snDeLaPeticion(params)
  if (!sn) return texto('Falta SN', 400)

  await registrarContacto(sn, ipDeLaPeticion(req), null)
  if (params.get('DeviceType') === 'acc') return texto('OK')
  return texto(configuracionParaElChecador(sn))
}

/**
 * El checador manda datos:
 *   table=ATTLOG     → marcas de un checador de asistencia (se guardan)
 *   table=rtlog      → marcas y eventos de un checador de control de acceso (se guardan las de usuarios)
 *   table=tabledata  → usuarios / huellas / rostros (se confirman, no se guardan)
 *   table=OPERLOG, rtstate, options... → bitácora y estado del equipo (se confirman, se ignoran)
 * Siempre hay que confirmar; si no, el checador vuelve a mandar lo mismo.
 */
export async function POST(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const sn = snDeLaPeticion(params)
  if (!sn) return texto('Falta SN', 400)

  const tabla = params.get('table')
  const cuerpo = await req.text()
  const checador = await registrarContacto(sn, ipDeLaPeticion(req), null)

  // Las marcas de un checador que todavía no se autorizó en el módulo Checador no se guardan.
  if (tabla === 'ATTLOG') {
    const marcas = leerMarcas(sn, cuerpo)
    if (checador.Autorizado) await guardarMarcas(marcas)
    return texto(`OK: ${marcas.length}`)
  }

  if (tabla === 'rtlog') {
    if (checador.Autorizado) await guardarMarcas(leerRtlog(sn, cuerpo))
    return texto('OK')
  }

  if (tabla === 'tabledata') return texto(respuestaTabledata(params, cuerpo))

  return texto('OK')
}
