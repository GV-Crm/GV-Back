import { NextResponse, type NextRequest } from 'next/server'
import { autorizar } from '@/lib/supabase/auth'

/** Rol y permisos del usuario con sesión, para que el frontend sepa qué mostrar. */
export async function GET(req: NextRequest) {
  const acceso = await autorizar(req)
  if (acceso.respuesta) return acceso.respuesta
  return NextResponse.json(acceso.perfil)
}
