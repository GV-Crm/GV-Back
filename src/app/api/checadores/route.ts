import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { autorizar } from '@/lib/supabase/auth'
import { SEGUNDOS_PARA_DESCONECTADO } from '@/lib/checador/adms'

const MARCAS_A_MOSTRAR = 30

/** Checadores con su estado (conectado o no) y las últimas marcas que llegaron. */
export async function GET(req: NextRequest) {
  const acceso = await autorizar(req, 'gestionar', 'Checador')
  if (acceso.respuesta) return acceso.respuesta

  const supabase = createAdminClient()
  const [checadores, marcas] = await Promise.all([
    supabase.from('Checadores').select('*').order('CreadoEn'),
    supabase.from('MarcasChecador').select('*').order('FechaHora', { ascending: false }).limit(MARCAS_A_MOSTRAR),
  ])
  if (checadores.error) return NextResponse.json({ error: checadores.error.message }, { status: 500 })
  if (marcas.error) return NextResponse.json({ error: marcas.error.message }, { status: 500 })

  // El PIN de cada marca es el PinChecador de un trabajador. Si no coincide con nadie, `empleado` queda en null.
  const pines = [...new Set(marcas.data.map((m) => m.PIN).filter((pin) => /^\d+$/.test(pin)).map(Number))]
  const empleados = pines.length
    ? await supabase.from('Empleados').select('Uuid, Nombre, Activo, Foto, PinChecador').in('PinChecador', pines)
    : { data: [], error: null }
  if (empleados.error) return NextResponse.json({ error: empleados.error.message }, { status: 500 })
  const porPin = new Map(empleados.data.map(({ PinChecador, ...empleado }) => [String(PinChecador), empleado]))

  const ahora = Date.now()
  return NextResponse.json({
    ahora: new Date(ahora).toISOString(),
    segundosParaDesconectado: SEGUNDOS_PARA_DESCONECTADO,
    checadores: checadores.data.map((c) => {
      const segundos = c.UltimaConexion ? Math.round((ahora - Date.parse(c.UltimaConexion)) / 1000) : null
      // Conectado = mandó su latido hace poco.
      return { ...c, conectado: segundos !== null && segundos <= SEGUNDOS_PARA_DESCONECTADO }
    }),
    marcas: marcas.data.map((m) => ({ ...m, empleado: porPin.get(String(Number(m.PIN))) ?? null })),
  })
}
