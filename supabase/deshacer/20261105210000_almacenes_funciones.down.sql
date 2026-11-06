-- Deshace 0003: vuelve a que solo el Superusuario cree y edite almacenes y quita el índice de un solo almacén activo.
begin;
drop index public.almacenes_un_activo;
drop policy almacenes_crear on public.almacenes;
drop policy almacenes_editar on public.almacenes;
create policy almacenes_crear on public.almacenes for insert to authenticated with check ((select app.es_superusuario()));
create policy almacenes_editar on public.almacenes for update to authenticated
  using ((select app.es_superusuario())) with check ((select app.es_superusuario()));
commit;
