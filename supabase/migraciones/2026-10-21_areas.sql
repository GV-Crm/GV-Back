-- =====================================================================================================
-- Catálogo de áreas. Correr UNA VEZ en un proyecto que ya tiene schema.sql (SQL Editor → pegar → Run).
-- Los proyectos nuevos no lo necesitan: schema.sql y seed.sql ya lo incluyen.
-- =====================================================================================================

create table if not exists public."Areas" (
  id bigint generated always as identity primary key,
  "Nombre" text not null,
  "CreadoEn" timestamptz not null default now(),
  -- Sin espacios ni saltos de línea al inicio o al final, y de 1 a 60 caracteres.
  constraint "Areas_Nombre_check" check ("Nombre" = btrim("Nombre", E' \t\r\n') and length("Nombre") between 1 and 60)
);
-- Sin repetir aunque cambien mayúsculas ("Legal" = "legal").
create unique index if not exists "Areas_Nombre_unico" on public."Areas" (lower("Nombre"));
comment on table public."Areas" is 'Áreas de la empresa. Se agregan desde Trabajadores → Áreas; Empleados.Area guarda el nombre.';
alter table public."Areas" enable row level security;

-- Limpia las áreas ya guardadas en los trabajadores (espacios o saltos de línea sobrantes).
update public."Empleados" set "Area" = btrim("Area", E' \t\r\n') where "Area" is distinct from btrim("Area", E' \t\r\n');

-- El catálogo empieza con las áreas que ya usan los trabajadores (si no hay, con las de siempre).
insert into public."Areas" ("Nombre")
select distinct on (lower("Area")) "Area" from public."Empleados" where coalesce("Area", '') <> ''
on conflict do nothing;

insert into public."Areas" ("Nombre")
select nombre from (values ('Administración'), ('Fábrica'), ('Legal')) as v(nombre)
where not exists (select 1 from public."Areas")
on conflict do nothing;
