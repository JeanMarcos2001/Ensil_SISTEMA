-- Deshace 20261105181142_acceso_base.sql (borra TODO lo que creó, incluidas las cuentas y roles que se hayan cargado).
-- Está fuera de `migrations/` a propósito: el CLI no lo ejecuta solo. Se pega a mano en el SQL Editor si hace falta.
-- Después de usarlo, hay que quitar la fila de la migración del historial: `npx supabase migration repair --status reverted 20261105181142`.

begin;

drop table if exists public.cuenta_almacenes cascade;
drop table if exists public.cuenta_sedes cascade;
drop table if exists public.cuentas cascade;
drop table if exists public.rol_funciones cascade;
drop table if exists public.roles cascade;
drop table if exists public.almacenes cascade;
drop table if exists public.sedes cascade;
drop table if exists public.empresas cascade;
drop schema if exists app cascade;

-- Devuelve los permisos por defecto de Supabase para lo que se cree después.
alter default privileges in schema public grant all on tables to anon;
alter default privileges in schema public grant all on sequences to anon;
alter default privileges in schema public grant all on functions to anon;

commit;
