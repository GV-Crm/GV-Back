import { createClient } from '@supabase/supabase-js'

/**
 * Cliente de Supabase con la clave service_role: SALTA RLS y tiene acceso total
 * a la base de datos. Úsalo SOLO en código de servidor de confianza (Route
 * Handlers, Server Actions) y nunca lo expongas al navegador.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}
