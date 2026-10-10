import { createAdminClient } from '@/lib/supabase/admin'

/*
 * Protocolo ADMS ("push") de los checadores ZKTeco, como el SpeedFace-V3.
 *
 * El checador es el que llama al servidor (no al revés), por eso funciona aunque el backend esté en Vercel:
 *   1. GET  /iclock/cdata?SN=...&options=all  → "saludo": el servidor le responde su configuración.
 *   2. GET  /iclock/getrequest?SN=...          → "latido" cada pocos segundos: "sigo conectado, ¿hay órdenes?".
 *   3. POST /iclock/cdata?SN=...&table=ATTLOG  → manda las marcas (una por línea).
 *
 * Instructivo para conectarlo y probarlo: INSTRUCTIVO-CHECADOR.txt (archivo local, no se sube al repo).
 */

/** Cada cuántos segundos el checador manda su "latido". */
export const SEGUNDOS_ENTRE_LATIDOS = 30

/** Si no hay latido en este tiempo, el checador se considera desconectado. */
export const SEGUNDOS_PARA_DESCONECTADO = 120

/** Zona horaria de México (CDMX, sin horario de verano desde 2022). El checador manda la hora local sin zona. */
const DESFASE_MEXICO = '-06:00'

/** Respuesta de texto plano, que es lo único que entiende el checador. */
export function texto(contenido: string, status = 200) {
  return new Response(contenido, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}

/** Configuración que se le manda al checador en el saludo. */
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
  Linea: string
}

/**
 * Convierte el texto de ATTLOG en marcas. Cada línea viene separada por tabuladores:
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
      if (!pin || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(fechaHora ?? '')) return []
      const numero = (valor?: string) => (valor && /^\d+$/.test(valor) ? Number(valor) : null)
      return [
        {
          SN: sn,
          PIN: pin.trim(),
          FechaHora: `${fechaHora.replace(' ', 'T')}${DESFASE_MEXICO}`,
          Estado: numero(estado),
          Verificacion: numero(verificacion),
          Linea: linea,
        },
      ]
    })
}

/** Guarda las marcas; si el checador vuelve a mandar una que ya estaba, se ignora. */
export async function guardarMarcas(marcas: MarcaNueva[]): Promise<void> {
  if (marcas.length === 0) return
  const { error } = await createAdminClient()
    .from('MarcasChecador')
    .upsert(marcas, { onConflict: 'SN,PIN,FechaHora', ignoreDuplicates: true })
  if (error) throw new Error(error.message)
}
