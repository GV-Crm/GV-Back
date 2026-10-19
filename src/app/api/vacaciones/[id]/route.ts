import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { autorizar } from '@/lib/supabase/auth'

/**
 * Quita un periodo de vacaciones (p. ej. el trabajador ya no las tomó). Requiere "gestionar Vacaciones".
 * Esos días vuelven a evaluarse normal: si no checó, cuentan como falta.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const acceso = await autorizar(req, 'gestionar', 'Vacaciones')
  if (acceso.respuesta) return acceso.respuesta

  const { id } = await params
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'Id inválido' }, { status: 400 })

  const { data, error } = await createAdminClient().from('Vacaciones').delete().eq('id', id).select('id').maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'No existe ese periodo de vacaciones' }, { status: 404 })
  return NextResponse.json({ id: data.id })
}
