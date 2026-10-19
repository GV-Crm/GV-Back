import { createHash, randomUUID } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'

/*
 * Protocolo ADMS ("push") de los checadores ZKTeco. El checador es el que llama al servidor (no al revés),
 * por eso funciona aunque el backend esté en Vercel. Hay dos variantes:
 *
 * Asistencia (T&A, p. ej. SpeedFace-V3):
 *   1. GET  /iclock/cdata?SN=...&options=all       → saludo: se responde su configuración.
 *   2. GET  /iclock/getrequest?SN=...              → latido: "sigo conectado, ¿hay órdenes?".
 *   3. POST /iclock/cdata?SN=...&table=ATTLOG      → marcas (una por línea).
 *
 * Control de acceso ("Security PUSH", DeviceType=acc, p. ej. SpeedFace-V3L):
 *   1. GET  /iclock/cdata?SN=...&options=all&DeviceType=acc  → "OK" (todavía no está registrado).
 *   2. POST /iclock/registry?SN=...                → manda sus capacidades; se responde RegistryCode=...
 *   3. POST /iclock/push?SN=...                    → se responde la configuración (latido, tablas a subir...).
 *   4. GET  /iclock/getrequest o /iclock/ping      → latido.
 *   5. POST /iclock/cdata?SN=...&table=rtlog       → marcas y eventos en tiempo real.
 *      POST /iclock/cdata?...&table=tabledata&tablename=user|templatev10|biodata → usuarios y biometría.
 *
 * Instructivo para conectarlo y probarlo: INSTRUCTIVO-CHECADOR.txt (archivo local, no se sube al repo).
 */

/** Cada cuántos segundos el checador manda su "latido". */
export const SEGUNDOS_ENTRE_LATIDOS = 30

/** Si no hay latido en este tiempo, el checador se considera desconectado. */
export const SEGUNDOS_PARA_DESCONECTADO = 120

/** Zona horaria de México (CDMX, sin horario de verano desde 2022). El checador manda la hora local sin zona. */
const DESFASE_MEXICO = '-06:00'

const PATRON_SN = /^[A-Za-z0-9_-]{1,40}$/
const PATRON_FECHA_HORA = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/

/** Respuesta de texto plano, que es lo único que entiende el checador. */
export function texto(contenido: string, status = 200) {
  return new Response(contenido, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}

/** Número de serie del checador, o null si no viene o no parece uno (evita que cualquiera cree registros basura). */
export function snDeLaPeticion(params: URLSearchParams): string | null {
  const sn = params.get('SN')?.trim()
  return sn && PATRON_SN.test(sn) ? sn : null
}

/** Configuración que se le manda a un checador de asistencia (T&A) en el saludo. */
export function configuracionParaElChecador(sn: string) {
  return [
    `GET OPTION FROM: ${sn}`,
    'ATTLOGStamp=None',
    'OPERLOGStamp=9999',
    'ATTPHOTOStamp=None',
    'ErrorDelay=30',
    `Delay=${SEGUNDOS_ENTRE_LATIDOS}`,
    'TransTimes=00:00;14:05',
    'TransInterval=1',
    'TransFlag=TransData AttLog',
    'TimeZone=-6',
    'Realtime=1',
    'Encrypt=None',
  ].join('\n')
}

/** Código que se le da a un checador de control de acceso al registrarse. Es fijo por número de serie (máx. 32). */
export function codigoDeRegistro(sn: string): string {
  return createHash('sha256').update(`gv-one:${sn}`).digest('hex').slice(0, 32)
}

/**
 * Configuración para un checador de control de acceso (respuesta a /iclock/push).
 * Los separadores (tabulador en TransTimes y TransTables) son los que aceptó el SpeedFace-V3L en las pruebas.
 */
export function configuracionPush(): string {
  return [
    'ServerVersion=3.0.1',
    'ServerName=ADMS',
    'PushVersion=3.0.1',
    'ErrorDelay=30',
    `RequestDelay=${SEGUNDOS_ENTRE_LATIDOS}`,
    'TransTimes=00:00\t14:00',
    'TransInterval=1',
    'TransTables=User\tTransaction',
    'Realtime=1',
    `SessionID=${randomUUID().replace(/-/g, '')}`,
    'TimeoutSec=10',
  ].join('\n')
}

/**
 * Del cuerpo de /iclock/registry ("DeviceType=acc,~DeviceName=SpeedFace-V3L,FirmVer=...,PushVersion=...")
 * arma el texto que se guarda en Checadores.Info: "versión de firmware,modelo,versión de push".
 */
export function infoDelRegistro(cuerpo: string): string | null {
  const valores = new Map(
    cuerpo
      .split(/[,\r\n]+/)
      .map((par) => par.split('='))
      .filter((par) => par.length >= 2)
      .map(([clave, ...valor]) => [clave.trim().replace(/^~/, ''), valor.join('=').trim()]),
  )
  const partes = [valores.get('FirmVer'), valores.get('DeviceName'), valores.get('PushVersion') && `Push ${valores.get('PushVersion')}`]
  const info = partes.filter(Boolean).join(',')
  return info ? info.slice(0, 300) : null
}

type Checador = { id: number; SN: string; Autorizado: boolean }

/**
 * Anota que el checador se comunicó (hora, IP y datos del equipo).
 * Si es la primera vez, lo crea como "pendiente de autorizar".
 */
export async function registrarContacto(sn: string, ip: string | null, info: string | null): Promise<Checador> {
  const supabase = createAdminClient()
  const datos: Record<string, string> = { SN: sn, UltimaConexion: new Date().toISOString() }
  if (ip) datos.IP = ip
  if (info) datos.Info = info

  const { data, error } = await supabase
    .from('Checadores')
    .upsert(datos, { onConflict: 'SN' })
    .select('id, SN, Autorizado')
    .single()
  if (error) throw new Error(error.message)
  return data
}

/** IP desde la que llama el checador (Vercel la pone en x-forwarded-for). */
export function ipDeLaPeticion(req: Request): string | null {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
}

export type MarcaNueva = {
  SN: string
  PIN: string
  FechaHora: string
  Estado: number | null
  Verificacion: number | null
  Evento: number | null
  Indice: number | null
  Linea: string
}

const numero = (valor?: string) => (valor && /^\d+$/.test(valor) ? Number(valor) : null)
const fechaHoraMexico = (fechaHora: string) => `${fechaHora.replace(' ', 'T')}${DESFASE_MEXICO}`

/**
 * Convierte el texto de ATTLOG (checadores de asistencia) en marcas. Cada línea viene separada por tabuladores:
 *   PIN  FECHA-HORA  ESTADO  VERIFICACIÓN  ...
 *   1    2026-10-09 08:01:22    0    15
 */
export function leerMarcas(sn: string, cuerpo: string): MarcaNueva[] {
  return cuerpo
    .split(/\r?\n/)
    .map((linea) => linea.trim())
    .filter(Boolean)
    .flatMap((linea) => {
      const [pin, fechaHora, estado, verificacion] = linea.split('\t')
      if (!pin || !PATRON_FECHA_HORA.test(fechaHora ?? '')) return []
      return [
        {
          SN: sn,
          PIN: pin.trim(),
          FechaHora: fechaHoraMexico(fechaHora),
          Estado: numero(estado),
          Verificacion: numero(verificacion),
          Evento: null,
          Indice: null,
          Linea: linea,
        },
      ]
    })
}

/**
 * Convierte el texto de rtlog (checadores de control de acceso) en marcas. Cada registro son campos clave=valor:
 *   time=2026-10-13 12:01:54  pin=1  cardno=0  eventaddr=1  event=3  inoutstatus=0  verifytype=15  index=46
 * La especificación los separa con tabulador, pero algunos ejemplos usan saltos de línea; por eso un registro
 * nuevo empieza en cada "time=".
 *
 * Solo se guardan los registros con un usuario identificado (pin distinto de 0). Los eventos del equipo
 * (puerta, arranque, alarmas: pin=0) se descartan. Se guarda el código de evento para filtrar después.
 * `inoutstatus` no se usa: el SpeedFace-V3L siempre manda 0, no distingue entrada de salida.
 */
export function leerRtlog(sn: string, cuerpo: string): MarcaNueva[] {
  const registros: Map<string, string>[] = []
  for (const campo of cuerpo.split(/[\t\r\n]+/).map((c) => c.trim()).filter(Boolean)) {
    const separador = campo.indexOf('=')
    if (separador < 1) continue
    const clave = campo.slice(0, separador)
    if (clave === 'time' || registros.length === 0) registros.push(new Map())
    registros[registros.length - 1].set(clave, campo.slice(separador + 1).trim())
  }

  return registros.flatMap((r) => {
    const pin = r.get('pin') ?? ''
    const fechaHora = r.get('time') ?? ''
    if (!/^\d+$/.test(pin) || Number(pin) === 0 || !PATRON_FECHA_HORA.test(fechaHora)) return []
    return [
      {
        SN: sn,
        PIN: pin,
        FechaHora: fechaHoraMexico(fechaHora),
        Estado: null,
        Verificacion: numero(r.get('verifytype')),
        Evento: numero(r.get('event')),
        Indice: numero(r.get('index')),
        Linea: [...r].map(([clave, valor]) => `${clave}=${valor}`).join('\t'),
      },
    ]
  })
}

/**
 * Respuesta a tabledata (usuarios, huellas, rostros): "<tabla>=<cuántos se recibieron>".
 * Nada de esto se guarda: la biometría son datos personales sensibles y los usuarios se manejan en GV One.
 */
export function respuestaTabledata(params: URLSearchParams, cuerpo: string): string {
  const tabla = params.get('tablename')?.trim() || 'tabledata'
  const declarado = numero(params.get('count') ?? undefined)
  const recibidos = declarado ?? cuerpo.split(/\r?\n/).filter((linea) => linea.trim()).length
  return `${tabla}=${recibidos}`
}

/** Guarda las marcas; si el checador vuelve a mandar una que ya estaba, se ignora. */
export async function guardarMarcas(marcas: MarcaNueva[]): Promise<void> {
  if (marcas.length === 0) return
  const { error } = await createAdminClient()
    .from('MarcasChecador')
    .upsert(marcas, { onConflict: 'SN,PIN,FechaHora', ignoreDuplicates: true })
  if (error) throw new Error(error.message)
}
