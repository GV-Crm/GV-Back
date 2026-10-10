import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { autorizar } from '@/lib/supabase/auth'
import { esFechaValida } from '@/lib/asistencias/calendario'

function errorRespuesta(mensaje: string, status: number) {
  return NextResponse.json({ error: mensaje }, { status })
}

/**
 * Edita los datos de un trabajador. Requiere el permiso "editar Empleado".
 * Body: `{ Nombre, Area, Ingreso: 'YYYY-MM-DD' }` (los tres obligatorios).
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ uuid: string }> }) {
  const acceso = await autorizar(req, 'editar', 'Empleado')
  if (acceso.respuesta) return acceso.respuesta

  const { uuid } = await params
  const body = await req.json().catch(() => null)
  const nombre = typeof body?.Nombre === 'string' ? body.Nombre.trim() : ''
  const area = typeof body?.Area === 'string' ? body.Area.trim() : ''
  const ingreso = typeof body?.Ingreso === 'string' ? body.Ingreso : ''

  if (!nombre || nombre.length > 120) return errorRespuesta('El nombre es obligatorio (máximo 120 caracteres)', 400)
  if (!area || area.length > 60) return errorRespuesta('El área es obligatoria (máximo 60 caracteres)', 400)
  if (!esFechaValida(ingreso)) return errorRespuesta('La fecha de ingreso debe tener formato YYYY-MM-DD', 400)

  const { data, error } = await createAdminClient()
    .from('Empleados')
    .update({ Nombre: nombre, Area: area, Ingreso: ingreso })
    .eq('Uuid', uuid)
    .select()
    .maybeSingle()
  if (error) return errorRespuesta(error.message, 500)
  if (!data) return errorRespuesta('No existe ese trabajador', 404)

  return NextResponse.json(data)
}
