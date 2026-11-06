-- Deshace 0005: vuelve la columna `cargo` (las asignaciones existentes quedan con «Sin cargo») y quita la regla del almacén.
begin;
alter table public.asignaciones drop constraint if exists asignaciones_almacen_solo_logistica;
alter table public.asignaciones add column cargo text not null default 'Sin cargo' check (length(btrim(cargo)) between 3 and 60);
alter table public.asignaciones alter column cargo drop default;
comment on table public.asignaciones is 'Dónde trabaja cada persona: una sede o el almacén, con área, cargo y rol del sistema. No se borra: se cierra con fecha y motivo. De las activas con acceso salen las sedes y el almacén de su cuenta.';
commit;
