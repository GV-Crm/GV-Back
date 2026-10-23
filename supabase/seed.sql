-- =====================================================================================================
-- GV One: datos mínimos para arrancar (catálogos, roles y la cuenta del administrador). Sin trabajadores.
-- Uso: después de schema.sql → SQL Editor → pegar → Run.
-- Antes: crear el usuario general.admin@gv-chapa.com en Authentication → Users (ver paso 4).
-- =====================================================================================================

-- 1. Estados de asistencia. El código usa los ids 3 (Falta) y 4 (Falta Justificada): no cambiarlos.
insert into public."EstadosAsistencia" (id, "Motivo") values
  (1, 'Retardo'),
  (2, 'Retardo Justificado'),
  (3, 'Falta'),
  (4, 'Falta Justificada'),
  (5, 'Asistencia');
select setval(pg_get_serial_sequence('public."EstadosAsistencia"', 'id'), 5);

-- 1b. Áreas de la empresa (se agregan más desde GV One → Trabajadores → Áreas).
insert into public."Areas" ("Nombre") values ('Administración'), ('Fábrica'), ('Legal');

-- 2. Datos de la empresa: un renglón vacío que se llena desde el módulo Empresa (prima vacacional 25%).
insert into public."Empresa" (id) values (1);

-- 3. Roles y lo que puede hacer cada uno. El rol "Admin" no va aquí: siempre puede todo.
--    Se asignan a las cuentas y se ajustan desde GV One → Permisos.
insert into public."PermisosRol" ("Rol", "Accion", "Recurso") values
  -- Jefe de Administración: da de alta y de baja trabajadores y justifica faltas.
  ('Jefe de Administración', 'ver', 'Asistencia'),
  ('Jefe de Administración', 'justificar', 'Falta'),
  ('Jefe de Administración', 'gestionar', 'Empleado'),
  ('Jefe de Administración', 'ver', 'Inventario'),
  -- Jefe de Legal: maneja los perfiles de los trabajadores y el checador.
  ('Jefe de Legal', 'ver', 'Asistencia'),
  ('Jefe de Legal', 'gestionar', 'Empleado'),
  ('Jefe de Legal', 'editar', 'Empleado'),
  ('Jefe de Legal', 'gestionar', 'Checador'),
  ('Jefe de Legal', 'ver', 'Inventario'),
  -- Administración y Legal: solo consulta.
  ('Administración', 'ver', 'Asistencia'),
  ('Administración', 'ver', 'Inventario'),
  ('Legal', 'ver', 'Asistencia'),
  ('Legal', 'ver', 'Inventario');

-- 4. La única cuenta para empezar: el administrador general (rol "Admin", acceso total).
--    Su correo debe ser el mismo del usuario creado en Authentication → Users.
--    Las demás cuentas se agregan después desde GV One → Permisos → Cuentas.
insert into public."Roles" ("Nombre", "Rol", "Correo") values
  ('Administrador General', 'Admin', 'general.admin@gv-chapa.com');
