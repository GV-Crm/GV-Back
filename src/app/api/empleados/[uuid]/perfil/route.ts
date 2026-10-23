import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { autorizar } from '@/lib/supabase/auth'
import { esFechaValida } from '@/lib/asistencias/calendario'
import { areaDelCatalogo, limpiarNombreArea } from '@/lib/empleados/areas'

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
  const ingreso = typeof body?.Ingreso === 'string' ? body.Ingreso : ''

  if (!nombre || nombre.length > 120) return errorRespuesta('El nombre es obligatorio (máximo 120 caracteres)', 400)
  if (!esFechaValida(ingreso)) return errorRespuesta('La fecha de ingreso debe tener formato YYYY-MM-DD', 400)
  // El área tiene que existir en el catálogo; se guarda tal como está escrita ahí.
  const areaElegida = limpiarNombreArea(body?.Area)
  if (!areaElegida) return errorRespuesta('Elige el área del trabajador', 400)
  const area = (await areaDelCatalogo(areaElegida))?.Nombre
  if (!area) return errorRespuesta(`El área "${areaElegida}" no existe: agrégala primero en Áreas`, 400)

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
