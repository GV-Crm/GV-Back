import { createAdminClient } from '@/lib/supabase/admin'
import { esFechaValida, hoy } from '@/lib/asistencias/calendario'

/*
 * Datos personales de los trabajadores (tabla DatosPersonales, 1 a 1 con Empleados).
 * Son datos sensibles: solo los ve y edita quien tiene el permiso "gestionar DatosPersonales".
 * Todos los campos son opcionales; un campo vacío se guarda como null.
 */

export const MAX_CONTACTOS = 3
const EDAD_MINIMA = 15 // Edad mínima para trabajar según la Ley Federal del Trabajo.

export type ContactoEmergencia = { Nombre: string; Parentesco: string; Telefono: string }

export type DatosPersonales = {
  FechaNacimiento: string | null
  Celular: string | null
  Correo: string | null
  CURP: string | null
  RFC: string | null
  NSS: string | null
  Domicilio: string | null
  ContactosEmergencia: ContactoEmergencia[]
  /** En pesos. Con él se calcula la prima vacacional. */
  SalarioDiario: number | null
}

export const COLUMNAS_DATOS_PERSONALES =
  'FechaNacimiento, Celular, Correo, CURP, RFC, NSS, Domicilio, ContactosEmergencia, SalarioDiario, ActualizadoEn, ActualizadoPor'

export const DATOS_VACIOS: DatosPersonales = {
  FechaNacimiento: null,
  Celular: null,
  Correo: null,
  CURP: null,
  RFC: null,
  NSS: null,
  Domicilio: null,
  ContactosEmergencia: [],
  SalarioDiario: null,
}

const MAX_SALARIO_DIARIO = 100_000

const ESTADOS_CURP =
  'AS|BC|BS|CC|CL|CM|CS|CH|DF|DG|GT|GR|HG|JC|MC|MN|MS|NT|NL|OC|PL|QT|QR|SP|SL|SR|TC|TS|TL|VZ|YN|ZS|NE'
const PATRON_CURP = new RegExp(
  `^[A-Z][AEIOUX][A-Z]{2}\\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\\d|3[01])[HMX](${ESTADOS_CURP})[B-DF-HJ-NP-TV-Z]{3}[A-Z\\d]\\d$`,
)
const PATRON_RFC = /^[A-ZÑ&]{4}\d{6}[A-Z\d]{3}$/
const PATRON_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const texto = (valor: unknown) => (typeof valor === 'string' ? valor.trim() : '')
const sinEspacios = (valor: string) => valor.replace(/[\s-]/g, '').toUpperCase()

/** Deja solo los 10 dígitos de un teléfono de México (quita espacios, guiones, paréntesis y el +52). */
function telefono(valor: unknown): string {
  const digitos = texto(valor).replace(/\D/g, '')
  return digitos.length === 12 && digitos.startsWith('52') ? digitos.slice(2) : digitos
}

/** Fecha de nacimiento que viene en la CURP (posiciones 5 a 10). El dígito 17 indica el siglo. */
function nacimientoDeLaCurp(curp: string): string {
  const siglo = /\d/.test(curp[16]) ? '19' : '20'
  return `${siglo}${curp.slice(4, 6)}-${curp.slice(6, 8)}-${curp.slice(8, 10)}`
}

function edadAl(nacimiento: string, fecha: string): number {
  const [a1, m1, d1] = nacimiento.split('-').map(Number)
  const [a2, m2, d2] = fecha.split('-').map(Number)
  return a2 - a1 - (m2 < m1 || (m2 === m1 && d2 < d1) ? 1 : 0)
}

/** Revisa lo que manda el frontend y lo deja listo para guardar. Devuelve el motivo si algo no sirve. */
export function leerDatosPersonales(body: unknown): { datos: DatosPersonales } | { error: string } {
  if (typeof body !== 'object' || body === null) return { error: 'Faltan los datos personales' }
  const b = body as Record<string, unknown>

  const curp = sinEspacios(texto(b.CURP)) || null
  if (curp && !PATRON_CURP.test(curp)) return { error: 'La CURP no es válida: debe tener 18 caracteres, por ejemplo GAPM900215HDFRRR09' }

  const rfc = sinEspacios(texto(b.RFC)) || null
  if (rfc && !PATRON_RFC.test(rfc)) return { error: 'El RFC no es válido: debe tener 13 caracteres, con homoclave' }
  // Solo se compara la fecha (posiciones 5 a 10): las letras pueden variar por las "palabras inconvenientes".
  if (rfc && curp && rfc.slice(4, 10) !== curp.slice(4, 10)) {
    return { error: 'El RFC no corresponde a la CURP: la fecha de nacimiento que traen es distinta' }
  }

  const nss = texto(b.NSS).replace(/\D/g, '') || null
  if (nss && nss.length !== 11) return { error: 'El NSS debe tener 11 dígitos' }

  const nacimiento = texto(b.FechaNacimiento) || null
  if (nacimiento) {
    if (!esFechaValida(nacimiento)) return { error: 'La fecha de nacimiento debe tener formato YYYY-MM-DD' }
    if (edadAl(nacimiento, hoy()) < EDAD_MINIMA) return { error: `El trabajador debe tener al menos ${EDAD_MINIMA} años` }
    if (curp && nacimientoDeLaCurp(curp) !== nacimiento) {
      return { error: 'La fecha de nacimiento no coincide con la que viene en la CURP' }
    }
  }

  const celular = telefono(b.Celular) || null
  if (celular && celular.length !== 10) return { error: 'El celular debe tener 10 dígitos' }

  const correo = texto(b.Correo).toLowerCase() || null
  if (correo && (correo.length > 120 || !PATRON_CORREO.test(correo))) return { error: 'El correo no es válido' }

  const domicilio = texto(b.Domicilio) || null
  if (domicilio && domicilio.length > 300) return { error: 'El domicilio puede tener máximo 300 caracteres' }

  // Acepta 350, "350.50" o "$1,200.00".
  const salarioTexto = typeof b.SalarioDiario === 'number' ? String(b.SalarioDiario) : texto(b.SalarioDiario).replace(/[$,\s]/g, '')
  const salario = salarioTexto ? Number(salarioTexto) : null
  if (salario !== null && (!Number.isFinite(salario) || salario <= 0 || salario > MAX_SALARIO_DIARIO)) {
    return { error: 'El salario diario debe ser un número mayor a 0' }
  }

  const listaContactos = b.ContactosEmergencia ?? []
  if (!Array.isArray(listaContactos)) return { error: 'Los contactos de emergencia deben ser una lista' }
  if (listaContactos.length > MAX_CONTACTOS) return { error: `Máximo ${MAX_CONTACTOS} contactos de emergencia` }

  const contactos: ContactoEmergencia[] = []
  for (const [i, c] of listaContactos.entries()) {
    const numero = i + 1
    const nombre = texto(c?.Nombre)
    const parentesco = texto(c?.Parentesco)
    const tel = telefono(c?.Telefono)
    if (!nombre && !parentesco && !tel) continue // Fila vacía en el formulario.
    if (!nombre || nombre.length > 120) return { error: `Contacto ${numero}: escribe su nombre (máximo 120 caracteres)` }
    if (!parentesco || parentesco.length > 40) return { error: `Contacto ${numero}: escribe el parentesco (máximo 40 caracteres)` }
    if (tel.length !== 10) return { error: `Contacto ${numero}: el teléfono debe tener 10 dígitos` }
    contactos.push({ Nombre: nombre, Parentesco: parentesco, Telefono: tel })
  }

  return {
    datos: {
      FechaNacimiento: nacimiento,
      Celular: celular,
      Correo: correo,
      CURP: curp,
      RFC: rfc,
      NSS: nss,
      Domicilio: domicilio,
      ContactosEmergencia: contactos,
      SalarioDiario: salario === null ? null : Math.round(salario * 100) / 100,
    },
  }
}

/**
 * ¿Ya hay otro trabajador con la misma CURP, RFC o NSS? Devuelve el motivo, o null si no.
 * Así se evita registrar dos veces a la misma persona. `idEmpleado` es el trabajador que se está editando.
 */
export async function motivoDeDuplicado(datos: DatosPersonales, idEmpleado?: number): Promise<string | null> {
  const campos = (['CURP', 'RFC', 'NSS'] as const).filter((campo) => datos[campo])
  if (campos.length === 0) return null

  let consulta = createAdminClient()
    .from('DatosPersonales')
    .select('id_empleados, CURP, RFC, NSS, Empleados(Nombre)')
    .or(campos.map((campo) => `${campo}.eq.${datos[campo]}`).join(','))
  if (idEmpleado !== undefined) consulta = consulta.neq('id_empleados', idEmpleado)

  const { data, error } = await consulta.limit(1).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null

  const campo = campos.find((c) => data[c] === datos[c]) ?? campos[0]
  const empleado = data.Empleados as unknown as { Nombre: string } | null
  return `Ya hay un trabajador registrado con ese ${campo}: ${empleado?.Nombre ?? `id ${data.id_empleados}`}`
}

/** Guarda (o reemplaza) los datos personales de un trabajador. */
export async function guardarDatosPersonales(idEmpleado: number, datos: DatosPersonales, correoQuienEdita: string) {
  const { data, error } = await createAdminClient()
    .from('DatosPersonales')
    .upsert({ id_empleados: idEmpleado, ...datos, ActualizadoEn: new Date().toISOString(), ActualizadoPor: correoQuienEdita })
    .select(COLUMNAS_DATOS_PERSONALES)
    .single()
  if (error) {
    // Si dos personas guardaron la misma CURP al mismo tiempo, el índice único lo detiene.
    if (error.code === '23505') throw new DuplicadoError('Ya hay un trabajador registrado con esa CURP, RFC o NSS')
    throw new Error(error.message)
  }
  return data
}

export class DuplicadoError extends Error {}
