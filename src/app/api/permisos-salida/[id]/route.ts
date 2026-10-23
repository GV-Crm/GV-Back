import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { autorizar } from '@/lib/supabase/auth'
import { diaDeHoyDe } from '@/lib/asistencias/permisos-salida'

/**
 * Cancela un permiso de salida que todavía está activo (se dio por error o ya no va a salir).
 * No se puede cancelar uno que ya usó ni uno vencido. Requiere "autorizar Salida".
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const acceso = await autorizar(req, 'autorizar', 'Salida')
  if (acceso.respuesta) return acceso.respuesta

  const { id } = await params
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'Id inválido' }, { status: 400 })

  const supabase = createAdminClient()
  const { data: permiso, error } = await supabase
    .from('PermisosSalida')
    .select('id, VenceEn, Empleados(Uuid)')
    .eq('id', id)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!permiso) return NextResponse.json({ error: 'No existe ese permiso' }, { status: 404 })

  const uuid = (permiso.Empleados as unknown as { Uuid: string } | null)?.Uuid
  const permisoDeHoy = uuid ? (await diaDeHoyDe(uuid))?.dia.permisoSalida : null
  if (permisoDeHoy && permisoDeHoy.id === permiso.id && permisoDeHoy.situacion === 'usado') {
    return NextResponse.json({ error: 'Ya checó su salida con este permiso: no se puede cancelar' }, { status: 409 })
  }
  if (Date.now() > Date.parse(permiso.VenceEn)) {
    return NextResponse.json({ error: 'El permiso ya venció' }, { status: 409 })
  }

  const { error: errorBorrado } = await supabase.from('PermisosSalida').delete().eq('id', id)
  if (errorBorrado) return NextResponse.json({ error: errorBorrado.message }, { status: 500 })
  return NextResponse.json({ id: permiso.id })
}
