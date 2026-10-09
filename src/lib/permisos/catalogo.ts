/**
 * Lista de todo lo que se puede permitir en el sistema.
 * Cada permiso es una ACCIÓN sobre un RECURSO, por ejemplo: "justificar" + "Falta".
 *
 * Para agregar un permiso nuevo:
 *   1. Agrégalo aquí.
 *   2. Agrégalo también en el frontend (GV-Front-End: src/auth/permisos.ts).
 *   3. Protege la ruta del API con: autorizar(req, 'accion', 'Recurso').
 */
export const CATALOGO = [
  {
    accion: 'ver',
    recurso: 'Asistencia',
    modulo: 'Asistencias',
    descripcion: 'Ver empleados, su calendario de asistencias y descargar reportes',
  },
  {
    accion: 'justificar',
    recurso: 'Falta',
    modulo: 'Asistencias',
    descripcion: 'Marcar o quitar faltas justificadas',
  },
  {
    accion: 'gestionar',
    recurso: 'Empleado',
    modulo: 'Trabajadores',
    descripcion: 'Dar de alta, dar de baja o reactivar trabajadores',
  },
  {
    accion: 'gestionar',
    recurso: 'Permiso',
    modulo: 'Permisos',
    descripcion: 'Asignar roles a las cuentas y cambiar lo que puede hacer cada rol',
  },
  {
    accion: 'ver',
    recurso: 'Inventario',
    modulo: 'Inventario',
    descripcion: 'Ver el módulo de inventario',
  },
] as const

export type Accion = (typeof CATALOGO)[number]['accion']
export type Recurso = (typeof CATALOGO)[number]['recurso']

/** El rol Admin siempre puede hacer todo y nadie puede quitarle permisos. */
export const ROL_ADMIN = 'Admin'

export function existeEnCatalogo(accion: string, recurso: string): boolean {
  return CATALOGO.some((p) => p.accion === accion && p.recurso === recurso)
}
