import { createAdminClient } from '@/lib/supabase/admin'

/*
 * Fotos de perfil (de cuentas y de trabajadores) en el bucket público "avatares" de Supabase Storage.
 * El frontend manda la foto ya recortada a 256x256 en WebP (src/lib/imagen.ts del frontend).
 */

const BUCKET = 'avatares'
const MAX_BYTES = 1024 * 1024

/** Revisa el texto "data:image/webp;base64,..." y lo convierte en archivo. Devuelve el motivo si no sirve. */
export function leerFoto(imagen: unknown): { archivo: Buffer } | { error: string } {
  const base64 = typeof imagen === 'string' ? imagen.match(/^data:image\/webp;base64,([A-Za-z0-9+/=]+)$/)?.[1] : undefined
  if (!base64) return { error: 'La foto debe venir en formato WebP' }
  const archivo = Buffer.from(base64, 'base64')
  if (archivo.length > MAX_BYTES) return { error: 'La foto pesa demasiado (máximo 1 MB)' }
  return { archivo }
}

/** Sube (o reemplaza) la foto y devuelve su URL pública. */
export async function guardarFoto(ruta: string, archivo: Buffer): Promise<string> {
  const storage = createAdminClient().storage.from(BUCKET)
  const { error } = await storage.upload(ruta, archivo, { contentType: 'image/webp', upsert: true })
  if (error) throw new Error(error.message)
  // "?v=" cambia en cada subida para que el navegador no muestre la foto anterior guardada en caché.
  return `${storage.getPublicUrl(ruta).data.publicUrl}?v=${Date.now()}`
}

export async function borrarFoto(ruta: string): Promise<void> {
  await createAdminClient().storage.from(BUCKET).remove([ruta])
}
