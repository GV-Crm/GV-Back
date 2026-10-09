import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { autorizar } from '@/lib/supabase/auth'
import { CATALOGO, existeEnCatalogo, ROL_ADMIN } from '@/lib/permisos/catalogo'
import { motivoParaNoEditarRol } from '@/lib/permisos/limites'
import { listarRoles } from '@/lib/permisos/roles'

type PermisoElegido = { accion: string; recurso: string }

function errorRespuesta(mensaje: string, status: number) {
  return NextResponse.json({ error: mensaje }, { status })
}

/** Catálogo de permisos y lo que tiene cada rol. Para la pantalla "Roles y permisos". */
export async function GET(req: NextRequest) {
  const acceso = await autorizar(req, 'gestionar', 'Permiso')
  if (acceso.respuesta) return acceso.respuesta

  const { data, error } = await createAdminClient().from('PermisosRol').select('Rol, Accion, Recurso')
  if (error) return errorRespuesta(error.message, 500)

  const roles = (await listarRoles()).map((rol) => ({
    rol,
    // El Admin no tiene filas en la tabla: siempre tiene todo.
    permisos:
      rol === ROL_ADMIN
        ? CATALOGO.map(({ accion, recurso }) => ({ accion, recurso }))
        : data.filter((fila) => fila.Rol === rol).map((fila) => ({ accion: fila.Accion, recurso: fila.Recurso })),
    // Si no se puede editar, el motivo para mostrarlo en pantalla.
    bloqueado: motivoParaNoEditarRol(acceso.perfil, rol),
  }))

  return NextResponse.json({ catalogo: CATALOGO, roles })
}

/** Reemplaza los permisos de un rol. Body: `{ rol, permisos: [{ accion, recurso }] }`. */
export async function PUT(req: NextRequest) {
  const acceso = await autorizar(req, 'gestionar', 'Permiso')
  if (acceso.respuesta) return acceso.respuesta

  const body = await req.json().catch(() => null)
  const rol: unknown = body?.rol
  const permisos: unknown = body?.permisos

  if (typeof rol !== 'string' || !Array.isArray(permisos)) {
    return errorRespuesta('Se espera { rol, permisos: [{ accion, recurso }] }', 400)
  }
  const elegidos = permisos as PermisoElegido[]
  if (!elegidos.every((p) => existeEnCatalogo(p?.accion, p?.recurso))) {
    return errorRespuesta('Hay un permiso que no existe en el catálogo', 400)
  }

  const motivo = motivoParaNoEditarRol(acceso.perfil, rol)
  if (motivo) return errorRespuesta(motivo, 403)
  if (!(await listarRoles()).includes(rol)) return errorRespuesta('No existe ese rol', 404)

  const supabase = createAdminClient()

  // 1. Agregar los permisos elegidos (los que ya tenía se quedan igual).
  if (elegidos.length > 0) {
    const filas = elegidos.map((p) => ({ Rol: rol, Accion: p.accion, Recurso: p.recurso }))
    const { error } = await supabase
      .from('PermisosRol')
      .upsert(filas, { onConflict: 'Rol,Accion,Recurso', ignoreDuplicates: true })
    if (error) return errorRespuesta(error.message, 500)
  }

  // 2. Quitar los que ya no se eligieron.
  const { data: actuales, error: errorActuales } = await supabase
    .from('PermisosRol')
    .select('id, Accion, Recurso')
    .eq('Rol', rol)
  if (errorActuales) return errorRespuesta(errorActuales.message, 500)

  const sobran = actuales.filter((fila) => !elegidos.some((p) => p.accion === fila.Accion && p.recurso === fila.Recurso))
  if (sobran.length > 0) {
    const { error } = await supabase.from('PermisosRol').delete().in('id', sobran.map((fila) => fila.id))
    if (error) return errorRespuesta(error.message, 500)
  }

  return NextResponse.json({ rol, permisos: elegidos })
}
