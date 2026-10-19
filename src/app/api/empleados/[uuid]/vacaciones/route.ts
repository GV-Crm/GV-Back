import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { autorizar } from '@/lib/supabase/auth'
import { hoy } from '@/lib/asistencias/calendario'
import { calcularVacaciones, diasGanados, PRIMA_VACACIONAL_MINIMA } from '@/lib/empleados/vacaciones'

/**
 * Vacaciones y prima vacacional de un trabajador según su antigüedad (ver lib/empleados/vacaciones.ts).
 * Requiere "ver Asistencia". Los montos en pesos solo se incluyen si quien consulta tiene
 * "gestionar DatosPersonales" (el salario es un dato sensible) y el trabajador tiene salario diario.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ uuid: string }> }) {
  const acceso = await autorizar(req, 'ver', 'Asistencia')
  if (acceso.respuesta) return acceso.respuesta

  const supabase = createAdminClient()
  const { data: empleado, error } = await supabase
    .from('Empleados')
    .select('id, Ingreso')
    .eq('Uuid', (await params).uuid)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!empleado) return NextResponse.json({ error: 'No existe ese trabajador' }, { status: 404 })

  const fechaHoy = hoy()
  if (!empleado.Ingreso) {
    return NextResponse.json({ error: 'El trabajador no tiene fecha de ingreso: agrégala en Trabajadores' }, { status: 409 })
  }
  if (empleado.Ingreso > fechaHoy) {
    return NextResponse.json({ error: 'Su fecha de ingreso todavía no llega' }, { status: 409 })
  }

  const puedeVerSalario = acceso.ability.can('gestionar', 'DatosPersonales')
  const [empresa, datos] = await Promise.all([
    supabase.from('Empresa').select('PrimaVacacional').eq('id', 1).maybeSingle(),
    puedeVerSalario
      ? supabase.from('DatosPersonales').select('SalarioDiario').eq('id_empleados', empleado.id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])
  if (empresa.error) return NextResponse.json({ error: empresa.error.message }, { status: 500 })
  if (datos.error) return NextResponse.json({ error: datos.error.message }, { status: 500 })

  const vacaciones = calcularVacaciones(
    empleado.Ingreso,
    fechaHoy,
    Number(empresa.data?.PrimaVacacional ?? PRIMA_VACACIONAL_MINIMA),
  )

  const salario = datos.data?.SalarioDiario == null ? null : Number(datos.data.SalarioDiario)
  const dias = vacaciones.periodoActual?.dias ?? vacaciones.proporcionales
  const redondear = (n: number) => Math.round(n * 100) / 100
  const montos =
    salario === null
      ? null
      : {
          salarioDiario: salario,
          pagoVacaciones: redondear(salario * dias),
          primaVacacional: redondear(salario * vacaciones.prima.diasDeSalario),
        }

  // Saldo: lo ganado por todos sus años cumplidos menos lo que ya pidió (incluye periodos futuros).
  const { data: periodos, error: errorPeriodos } = await supabase
    .from('Vacaciones')
    .select('id, Desde, Hasta, Fechas, Dias, Nota, RegistradoPor, RegistradoEn')
    .eq('id_empleados', empleado.id)
    .order('Desde', { ascending: false })
  if (errorPeriodos) return NextResponse.json({ error: errorPeriodos.message }, { status: 500 })

  const ganados = diasGanados(vacaciones.antiguedad.anios)
  const tomados = periodos.reduce((total, p) => total + p.Dias, 0)
  const saldo = { ganados, tomados, disponibles: ganados - tomados }

  // `montos` es null si no tiene permiso o si falta el salario; `puedeVerSalario` dice cuál de los dos.
  return NextResponse.json({ ...vacaciones, montos, puedeVerSalario, saldo, periodos, hoy: fechaHoy })
}
