import { NextResponse, type NextRequest} from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { autorizar, sinPermiso } from '@/lib/supabase/auth'
import { esFechaValida } from '@/lib/asistencias/calendario'

export async function GET(req: NextRequest) {
  const acceso = await autorizar(req)
  if (acceso.respuesta) return acceso.respuesta
  // La lista la usan dos módulos: Asistencias y Trabajadores. Basta con tener acceso a uno.
  const puedeVerLista =
    acceso.ability.can('ver', 'Asistencia') ||
    acceso.ability.can('gestionar', 'Empleado') ||
    acceso.ability.can('editar', 'Empleado')
  if (!puedeVerLista) {
    return sinPermiso()
  }

  const supabase = await createAdminClient()

  let query = supabase.from('Empleados').select('*')

  const { data, error } = await query

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
}

/** Alta de un trabajador. Body: `{ Nombre, Area, Ingreso: 'YYYY-MM-DD' }`. */
export async function POST(req: NextRequest) {
  const acceso = await autorizar(req, 'gestionar', 'Empleado')
  if (acceso.respuesta) return acceso.respuesta

  const body = await req.json().catch(() => null)
  const nombre = typeof body?.Nombre === 'string' ? body.Nombre.trim() : ''
  const area = typeof body?.Area === 'string' ? body.Area.trim() : ''
  const ingreso = typeof body?.Ingreso === 'string' ? body.Ingreso : ''

  if (!nombre || nombre.length > 120) {
    return NextResponse.json({ error: 'El nombre es obligatorio (máximo 120 caracteres)' }, { status: 400 })
  }
  if (!area || area.length > 60) {
    return NextResponse.json({ error: 'El área es obligatoria (máximo 60 caracteres)' }, { status: 400 })
  }
  if (!esFechaValida(ingreso)) {
    return NextResponse.json({ error: 'La fecha de ingreso debe tener formato YYYY-MM-DD' }, { status: 400 })
  }

  const { data, error } = await createAdminClient()
    .from('Empleados')
    .insert({ Nombre: nombre, Area: area, Ingreso: ingreso, Activo: true })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
