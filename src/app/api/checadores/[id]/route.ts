import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { autorizar } from '@/lib/supabase/auth'

/** Autoriza (o deja de autorizar) un checador y/o le pone nombre. Body: `{ Autorizado?, Nombre? }`. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const acceso = await autorizar(req, 'gestionar', 'Checador')
  if (acceso.respuesta) return acceso.respuesta

  const { id } = await params
  const body = await req.json().catch(() => null)

  const cambios: { Autorizado?: boolean; Nombre?: string | null } = {}
  if (typeof body?.Autorizado === 'boolean') cambios.Autorizado = body.Autorizado
  if (typeof body?.Nombre === 'string') cambios.Nombre = body.Nombre.trim().slice(0, 80) || null
  if (Object.keys(cambios).length === 0) {
    return NextResponse.json({ error: 'Se espera { Autorizado } o { Nombre }' }, { status: 400 })
  }

  const { data, error } = await createAdminClient()
    .from('Checadores')
    .update(cambios)
    .eq('id', id)
    .select()
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'No existe ese checador' }, { status: 404 })
  return NextResponse.json(data)
}
