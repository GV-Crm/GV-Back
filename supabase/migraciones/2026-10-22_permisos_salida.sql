-- =====================================================================================================
-- Permisos para salir antes. Correr UNA VEZ en un proyecto que ya tiene schema.sql (SQL Editor → Run).
-- Los proyectos nuevos no lo necesitan: schema.sql ya lo incluye.
-- =====================================================================================================

-- Cada permiso abre una ventana de 10 minutos (AutorizadoEn → VenceEn). La checada que el trabajador haga
-- en ese tiempo es su salida, y el día queda como "salió con permiso".
create table if not exists public."PermisosSalida" (
  id bigint generated always as identity primary key,
  id_empleados bigint not null references public."Empleados"(id) on delete cascade,
  "Fecha" date not null,
  "AutorizadoEn" timestamptz not null default now(),
  "VenceEn" timestamptz not null,
  "Motivo" text,
  "AutorizadoPor" text,
  constraint "PermisosSalida_ventana" check ("VenceEn" > "AutorizadoEn")
);
create index if not exists "PermisosSalida_empleado_fecha" on public."PermisosSalida" (id_empleados, "Fecha");

comment on table public."PermisosSalida" is 'Permisos para salir antes: la checada dentro de la ventana (AutorizadoEn a VenceEn) es su salida.';
comment on column public."PermisosSalida"."Fecha" is 'Día del permiso (fecha de México).';
comment on column public."PermisosSalida"."AutorizadoPor" is 'Nombre (o correo) de quien dio el permiso.';

alter table public."PermisosSalida" enable row level security;
