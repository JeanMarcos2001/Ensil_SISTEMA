-- Deshace 0002 (formato del código y columna `id_web`). NO devuelve los códigos antiguos: las sedes conservan sus FIL-NNN.
begin;
alter table public.sedes drop constraint sedes_id_check;
alter table public.sedes add constraint sedes_id_check check (id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{1,19}$');
alter table public.sedes add column id_web integer unique;
comment on column public.sedes.id_web is 'Id de la sede en la web pública (ensilperu.com); solo para enlazar, nada depende de él.';
commit;
