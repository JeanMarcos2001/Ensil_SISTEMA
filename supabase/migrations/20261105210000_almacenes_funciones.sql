-- =====================================================================================================================
-- 0003 · Almacenes: permisos por función y un solo almacén central activo
-- ---------------------------------------------------------------------------------------------------------------------
--   · Crear y editar almacenes ya no es solo del Superusuario: lo decide la función `org-almacenes:create` / `org-almacenes:edit`
--     (existen desde que Organización → Almacenes tiene su propia entrada en el registro de funciones). Verlos sigue abierto a
--     toda cuenta vigente: la logística los necesita.
--   · La regla «un solo almacén central activo» pasa a la base: un índice único parcial impide dos almacenes activos a la vez.
-- Para deshacer: supabase/deshacer/20261105210000_almacenes_funciones.down.sql
-- =====================================================================================================================

begin;

create unique index almacenes_un_activo on public.almacenes ((true)) where estado = 'Activo';

drop policy almacenes_crear on public.almacenes;
drop policy almacenes_editar on public.almacenes;

create policy almacenes_crear on public.almacenes for insert to authenticated
  with check ((select app.tiene_funcion('org-almacenes:create')));
create policy almacenes_editar on public.almacenes for update to authenticated
  using ((select app.tiene_funcion('org-almacenes:edit'))) with check ((select app.tiene_funcion('org-almacenes:edit')));

commit;
