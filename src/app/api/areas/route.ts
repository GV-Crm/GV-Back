import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { autorizar, sinPermiso } from '@/lib/supabase/auth'
import { areaDelCatalogo, claveDeArea, limpiarNombreArea, listarAreas, MAX_NOMBRE_AREA } from '@/lib/empleados/areas'

function errorRespuesta(mensaje: string, status: number) {
  return NextResponse.json({ error: mensaje }, { status })
}

/** Áreas del catálogo con cuántos trabajadores activos tiene cada una. */
export async function GET(req: NextRequest) {
  const acceso = await autorizar(req)
  if (acceso.respuesta) return acceso.respuesta
  const puedeVer =
    acceso.ability.can('ver', 'Asistencia') || acceso.ability.can('gestionar', 'Empleado') || acceso.ability.can('editar', 'Empleado')
  if (!puedeVer) return sinPermiso()

  const [areas, empleados] = await Promise.all([
    listarAreas(),
    createAdminClient().from('Empleados').select('Area').eq('Activo', true),
  ])
  if (empleados.error) return errorRespuesta(empleados.error.message, 500)

  const porArea = new Map<string, number>()
  for (const e of empleados.data) {
    const nombre = claveDeArea(e.Area ?? '')
    porArea.set(nombre, (porArea.get(nombre) ?? 0) + 1)
  }
  return NextResponse.json(areas.map((a) => ({ ...a, trabajadores: porArea.get(claveDeArea(a.Nombre)) ?? 0 })))
}

/** Agrega un área. Body: `{ Nombre }`. Requiere "gestionar Empleado" o "editar Empleado". */
export async function POST(req: NextRequest) {
  const acceso = await autorizar(req)
  if (acceso.respuesta) return acceso.respuesta
  if (acceso.ability.cannot('gestionar', 'Empleado') && acceso.ability.cannot('editar', 'Empleado')) return sinPermiso()

  const body = await req.json().catch(() => null)
  const nombre = limpiarNombreArea(body?.Nombre)
  if (!nombre || nombre.length > MAX_NOMBRE_AREA) {
    return errorRespuesta(`Escribe el nombre del área (máximo ${MAX_NOMBRE_AREA} caracteres)`, 400)
  }

  const existente = await areaDelCatalogo(nombre)
  if (existente) return errorRespuesta(`El área "${existente.Nombre}" ya existe`, 409)

  const { data, error } = await createAdminClient().from('Areas').insert({ Nombre: nombre }).select('id, Nombre').single()
  if (error) return errorRespuesta(error.message, 500)
  return NextResponse.json({ ...data, trabajadores: 0 }, { status: 201 })
}
