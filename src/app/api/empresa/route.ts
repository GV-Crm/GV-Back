import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { autorizar, sinPermiso } from '@/lib/supabase/auth'
import { PRIMA_VACACIONAL_MINIMA } from '@/lib/empleados/vacaciones'

/*
 * Datos de la empresa (tabla Empresa, un solo renglón con id = 1).
 * Ver: permiso "ver Empresa" o "editar Empresa". Cambiar: "editar Empresa". El Admin puede todo.
 */

const COLUMNAS =
  'RazonSocial, NombreComercial, RFC, RegimenFiscal, RegistroPatronal, DomicilioFiscal, CodigoPostal, Telefono, Correo, RepresentanteLegal, PrimaVacacional, ActualizadoEn, ActualizadoPor'

type DatosEmpresa = Record<
  | 'RazonSocial'
  | 'NombreComercial'
  | 'RFC'
  | 'RegimenFiscal'
  | 'RegistroPatronal'
  | 'DomicilioFiscal'
  | 'CodigoPostal'
  | 'Telefono'
  | 'Correo'
  | 'RepresentanteLegal',
  string | null
> & { PrimaVacacional: number }

// Persona moral: 3 letras + fecha + homoclave (12). Persona física: 4 letras (13).
const PATRON_RFC = /^[A-ZÑ&]{3,4}\d{6}[A-Z\d]{3}$/
const PATRON_REGISTRO_PATRONAL = /^[A-Z]\d{10}$/
const PATRON_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Campos de texto libre: solo se revisa su largo. */
const CAMPOS_LIBRES = {
  RazonSocial: { nombre: 'Razón social', maximo: 200 },
  NombreComercial: { nombre: 'Nombre comercial', maximo: 120 },
  RegimenFiscal: { nombre: 'Régimen fiscal', maximo: 120 },
  DomicilioFiscal: { nombre: 'Domicilio fiscal', maximo: 300 },
  RepresentanteLegal: { nombre: 'Representante legal', maximo: 120 },
} as const
type CampoLibre = keyof typeof CAMPOS_LIBRES

function errorRespuesta(mensaje: string, status: number) {
  return NextResponse.json({ error: mensaje }, { status })
}

const texto = (valor: unknown) => (typeof valor === 'string' ? valor.trim() : '')

function leerDatosEmpresa(body: unknown): { datos: DatosEmpresa } | { error: string } {
  if (typeof body !== 'object' || body === null) return { error: 'Faltan los datos de la empresa' }
  const b = body as Record<string, unknown>

  const libres: Partial<Record<CampoLibre, string | null>> = {}
  for (const [campo, { nombre, maximo }] of Object.entries(CAMPOS_LIBRES) as [CampoLibre, (typeof CAMPOS_LIBRES)[CampoLibre]][]) {
    const valor = texto(b[campo])
    if (valor.length > maximo) return { error: `${nombre}: máximo ${maximo} caracteres` }
    libres[campo] = valor || null
  }

  const rfc = texto(b.RFC).replace(/[\s-]/g, '').toUpperCase() || null
  if (rfc && !PATRON_RFC.test(rfc)) return { error: 'El RFC no es válido: 12 caracteres (persona moral) o 13 (persona física)' }

  const registro = texto(b.RegistroPatronal).replace(/[\s-]/g, '').toUpperCase() || null
  if (registro && !PATRON_REGISTRO_PATRONAL.test(registro)) {
    return { error: 'El registro patronal debe tener una letra y 10 dígitos, por ejemplo Y1234567890' }
  }

  const cp = texto(b.CodigoPostal) || null
  if (cp && !/^\d{5}$/.test(cp)) return { error: 'El código postal debe tener 5 dígitos' }

  const digitos = texto(b.Telefono).replace(/\D/g, '')
  const telefono = (digitos.length === 12 && digitos.startsWith('52') ? digitos.slice(2) : digitos) || null
  if (telefono && telefono.length !== 10) return { error: 'El teléfono debe tener 10 dígitos' }

  const correo = texto(b.Correo).toLowerCase() || null
  if (correo && (correo.length > 120 || !PATRON_CORREO.test(correo))) return { error: 'El correo no es válido' }

  // Porcentaje de prima vacacional: vacío = el mínimo de ley.
  const primaTexto = typeof b.PrimaVacacional === 'number' ? String(b.PrimaVacacional) : texto(b.PrimaVacacional).replace('%', '')
  const prima = primaTexto ? Number(primaTexto) : PRIMA_VACACIONAL_MINIMA
  if (!Number.isFinite(prima) || prima < PRIMA_VACACIONAL_MINIMA || prima > 100) {
    return { error: `La prima vacacional debe ser de ${PRIMA_VACACIONAL_MINIMA}% a 100% (la ley pide al menos ${PRIMA_VACACIONAL_MINIMA}%)` }
  }

  return {
    datos: {
      PrimaVacacional: Math.round(prima * 100) / 100,
      RazonSocial: libres.RazonSocial ?? null,
      NombreComercial: libres.NombreComercial ?? null,
      RFC: rfc,
      RegimenFiscal: libres.RegimenFiscal ?? null,
      RegistroPatronal: registro,
      DomicilioFiscal: libres.DomicilioFiscal ?? null,
      CodigoPostal: cp,
      Telefono: telefono,
      Correo: correo,
      RepresentanteLegal: libres.RepresentanteLegal ?? null,
    },
  }
}

export async function GET(req: NextRequest) {
  const acceso = await autorizar(req)
  if (acceso.respuesta) return acceso.respuesta
  if (acceso.ability.cannot('ver', 'Empresa') && acceso.ability.cannot('editar', 'Empresa')) return sinPermiso()

  const { data, error } = await createAdminClient().from('Empresa').select(COLUMNAS).eq('id', 1).maybeSingle()
  if (error) return errorRespuesta(error.message, 500)
  return NextResponse.json(data)
}

/** Reemplaza todos los datos (lo que no venga se borra). */
export async function PUT(req: NextRequest) {
  const acceso = await autorizar(req, 'editar', 'Empresa')
  if (acceso.respuesta) return acceso.respuesta

  const leido = leerDatosEmpresa(await req.json().catch(() => null))
  if ('error' in leido) return errorRespuesta(leido.error, 400)

  const { data, error } = await createAdminClient()
    .from('Empresa')
    .upsert({ id: 1, ...leido.datos, ActualizadoEn: new Date().toISOString(), ActualizadoPor: acceso.perfil.correo })
    .select(COLUMNAS)
    .single()
  if (error) return errorRespuesta(error.message, 500)
  return NextResponse.json(data)
}
