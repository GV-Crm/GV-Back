import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(req: NextRequest, { params }: { params: Promise<{ uuid: string }> }) {
  const { uuid } = await params
  const supabase = await createAdminClient()

  const { data, error } = await supabase
    .from('Empleados')
    .select('*, Asistencias(*, Estado:EstadosAsistencia(id, Motivo))')
    .eq('Uuid', uuid)
    .order('HoraEntrada', { ascending: false, referencedTable: 'Asistencias' })
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
