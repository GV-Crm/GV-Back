import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { autorizar } from '@/lib/supabase/auth'
import { claveDeArea } from '@/lib/empleados/areas'

/** Quita un área del catálogo, solo si ningún trabajador (activo o de baja) la tiene. Requiere "gestionar Empleado". */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const acceso = await autorizar(req, 'gestionar', 'Empleado')
  if (acceso.respuesta) return acceso.respuesta

  const { id } = await params
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'Id inválido' }, { status: 400 })

  const supabase = createAdminClient()
  const { data: area, error } = await supabase.from('Areas').select('id, Nombre').eq('id', id).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!area) return NextResponse.json({ error: 'No existe esa área' }, { status: 404 })

  const { data: empleados, error: errorEmpleados } = await supabase.from('Empleados').select('Area')
  if (errorEmpleados) return NextResponse.json({ error: errorEmpleados.message }, { status: 500 })
  const count = empleados.filter((e) => claveDeArea(e.Area ?? '') === claveDeArea(area.Nombre)).length
  if (count) {
    const quien = count === 1 ? '1 trabajador la tiene' : `${count} trabajadores la tienen`
    return NextResponse.json({ error: `No se puede quitar "${area.Nombre}": ${quien}. Cámbialos de área primero.` }, { status: 409 })
  }

  const { error: errorBorrado } = await supabase.from('Areas').delete().eq('id', id)
  if (errorBorrado) return NextResponse.json({ error: errorBorrado.message }, { status: 500 })
  return NextResponse.json({ id: area.id })
}
