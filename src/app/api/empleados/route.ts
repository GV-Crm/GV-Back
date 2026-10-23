import { NextResponse, type NextRequest} from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { autorizar, sinPermiso } from '@/lib/supabase/auth'
import { esFechaValida } from '@/lib/asistencias/calendario'
import { areaDelCatalogo, limpiarNombreArea } from '@/lib/empleados/areas'
import {
  DuplicadoError,
  guardarDatosPersonales,
  leerDatosPersonales,
  motivoDeDuplicado,
  type DatosPersonales,
} from '@/lib/empleados/datos-personales'

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

/**
 * Alta de un trabajador. Body: `{ Nombre, Area, Ingreso: 'YYYY-MM-DD', DatosPersonales? }`.
 * La base le asigna su `PinChecador` (el ID con el que se registra en el checador).
 * `DatosPersonales` es opcional y requiere además el permiso "gestionar DatosPersonales".
 */
export async function POST(req: NextRequest) {
  const acceso = await autorizar(req, 'gestionar', 'Empleado')
  if (acceso.respuesta) return acceso.respuesta

  const body = await req.json().catch(() => null)
  const nombre = typeof body?.Nombre === 'string' ? body.Nombre.trim() : ''
  const ingreso = typeof body?.Ingreso === 'string' ? body.Ingreso : ''

  if (!nombre || nombre.length > 120) {
    return NextResponse.json({ error: 'El nombre es obligatorio (máximo 120 caracteres)' }, { status: 400 })
  }
  // El área tiene que existir en el catálogo; se guarda tal como está escrita ahí.
  const areaElegida = limpiarNombreArea(body?.Area)
  if (!areaElegida) return NextResponse.json({ error: 'Elige el área del trabajador' }, { status: 400 })
  const area = (await areaDelCatalogo(areaElegida))?.Nombre
  if (!area) {
    return NextResponse.json({ error: `El área "${areaElegida}" no existe: agrégala primero en Áreas` }, { status: 400 })
  }
  if (!esFechaValida(ingreso)) {
    return NextResponse.json({ error: 'La fecha de ingreso debe tener formato YYYY-MM-DD' }, { status: 400 })
  }

  // Los datos personales se revisan antes de crear al trabajador, para no darlo de alta si ya existe.
  let datosPersonales: DatosPersonales | null = null
  if (body?.DatosPersonales !== undefined && body.DatosPersonales !== null) {
    if (acceso.ability.cannot('gestionar', 'DatosPersonales')) return sinPermiso()
    const leido = leerDatosPersonales(body.DatosPersonales)
    if ('error' in leido) return NextResponse.json({ error: leido.error }, { status: 400 })
    const duplicado = await motivoDeDuplicado(leido.datos)
    if (duplicado) return NextResponse.json({ error: duplicado }, { status: 409 })
    datosPersonales = leido.datos
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('Empleados')
    .insert({ Nombre: nombre, Area: area, Ingreso: ingreso, Activo: true })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (datosPersonales) {
    try {
      await guardarDatosPersonales(data.id, datosPersonales, acceso.perfil.correo)
    } catch (err) {
      // Sin transacciones en el cliente de Supabase: si fallan los datos personales, se deshace el alta.
      await supabase.from('Empleados').delete().eq('id', data.id)
      const status = err instanceof DuplicadoError ? 409 : 500
      return NextResponse.json({ error: err instanceof Error ? err.message : 'No se pudo dar de alta' }, { status })
    }
  }

  return NextResponse.json(data, { status: 201 })
}
