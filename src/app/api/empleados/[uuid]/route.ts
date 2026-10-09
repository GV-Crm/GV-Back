import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { autorizar } from '@/lib/supabase/auth'

export async function GET(req: NextRequest, { params }: { params: Promise<{ uuid: string }> }) {
  const acceso = await autorizar(req)
  if (acceso.respuesta) return acceso.respuesta

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

/** Baja (`{ Activo: false }`) o reactivación (`{ Activo: true }`) de un trabajador. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ uuid: string }> }) {
  const acceso = await autorizar(req, 'gestionar_empleados')
  if (acceso.respuesta) return acceso.respuesta

  const { uuid } = await params
  const body = await req.json().catch(() => null)
  if (typeof body?.Activo !== 'boolean') {
    return NextResponse.json({ error: 'Se espera { "Activo": true | false }' }, { status: 400 })
  }

  const { data, error } = await createAdminClient()
    .from('Empleados')
    .update({ Activo: body.Activo })
    .eq('Uuid', uuid)
    .select()
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'No existe ese trabajador' }, { status: 404 })
  return NextResponse.json(data)
}
