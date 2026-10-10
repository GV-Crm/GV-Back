import type { NextRequest } from 'next/server'
import {
  configuracionParaElChecador,
  guardarMarcas,
  ipDeLaPeticion,
  leerMarcas,
  registrarContacto,
  texto,
} from '@/lib/checador/adms'

/**
 * Saludo del checador (ADMS). Lo manda al encender o al reconectarse:
 *   GET /iclock/cdata?SN=XXXX&options=all
 * Se le responde su configuración (cada cuánto mandar latidos, zona horaria, etc.).
 */
export async function GET(req: NextRequest) {
  const sn = req.nextUrl.searchParams.get('SN')
  if (!sn) return texto('Falta SN', 400)

  await registrarContacto(sn, ipDeLaPeticion(req), null)
  return texto(configuracionParaElChecador(sn))
}

/**
 * El checador manda datos:
 *   POST /iclock/cdata?SN=XXXX&table=ATTLOG   → marcas de asistencia (se guardan)
 *   POST /iclock/cdata?SN=XXXX&table=OPERLOG  → bitácora del equipo (se ignora)
 * Siempre hay que responder "OK"; si no, el checador vuelve a mandar lo mismo.
 */
export async function POST(req: NextRequest) {
  const sn = req.nextUrl.searchParams.get('SN')
  if (!sn) return texto('Falta SN', 400)

  const tabla = req.nextUrl.searchParams.get('table')
  const cuerpo = await req.text()
  const checador = await registrarContacto(sn, ipDeLaPeticion(req), null)

  if (tabla === 'ATTLOG') {
    const marcas = leerMarcas(sn, cuerpo)
    // Las marcas de un checador que todavía no se autorizó en el módulo Checador no se guardan.
    if (checador.Autorizado) await guardarMarcas(marcas)
    return texto(`OK: ${marcas.length}`)
  }

  return texto('OK')
}
