-- =====================================================================================================================
-- 0002 · Sedes: código automático FIL-NNN y sin `id_web`
-- ---------------------------------------------------------------------------------------------------------------------
--   · El código de una sede ya no lo escribe la persona: lo asigna el sistema (FIL-001, FIL-002…), igual que EMP-, ALM- y ROL-.
--     La base lo exige con el mismo formato.
--   · Las sedes que ya existían con un código escrito a mano se renumeran en orden (por fecha de creación y nombre).
--   · Se elimina `id_web` (enlace con la tabla `filiales` de otro proyecto): nada dependía de él.
-- Para deshacer el formato y la columna: supabase/deshacer/20261105200000_sedes_codigo_automatico.down.sql (no devuelve los códigos antiguos).
-- =====================================================================================================================

begin;

alter table public.sedes drop constraint sedes_id_check;

-- Renumera solo las que no cumplen el formato nuevo, a continuación del mayor FIL-NNN que ya exista.
with base as (
  select coalesce(max(substring(id from 5)::int), 0) as ultimo from public.sedes where id ~ '^FIL-[0-9]{3,}$'
), nuevas as (
  select s.id as viejo,
         'FIL-' || lpad((b.ultimo + row_number() over (order by s.creado_en, s.nombre))::text, 3, '0') as nuevo
  from public.sedes s cross join base b
  where s.id !~ '^FIL-[0-9]{3,}$'
)
update public.sedes s set id = n.nuevo from nuevas n where s.id = n.viejo;

alter table public.sedes add constraint sedes_id_check check (id ~ '^FIL-[0-9]{3,}$');

alter table public.sedes drop column id_web;

comment on table public.sedes is 'Sedes (filiales) con alumnos. Nunca almacén. El código FIL-NNN lo asigna el sistema. No se borran: se inactivan.';

commit;
