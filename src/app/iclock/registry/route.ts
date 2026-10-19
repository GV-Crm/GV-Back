import type { NextRequest } from 'next/server'
import { codigoDeRegistro, infoDelRegistro, ipDeLaPeticion, registrarContacto, snDeLaPeticion, texto } from '@/lib/checador/adms'

/**
 * Registro de un checador de control de acceso (lo hace en cada conexión):
 *   POST /iclock/registry?SN=XXXX   cuerpo: "DeviceType=acc,~DeviceName=...,FirmVer=...,PushVersion=..."
 * Se guarda su versión en Checadores.Info y se responde su RegistryCode. Sin código, el equipo
 * reinicia el saludo cada ~15 s. La autorización para guardar marcas se da aparte, en el módulo Checador.
 */
export async function POST(req: NextRequest) {
  const sn = snDeLaPeticion(req.nextUrl.searchParams)
  if (!sn) return texto('Falta SN', 400)

  await registrarContacto(sn, ipDeLaPeticion(req), infoDelRegistro(await req.text()))
  return texto(`RegistryCode=${codigoDeRegistro(sn)}`)
}
