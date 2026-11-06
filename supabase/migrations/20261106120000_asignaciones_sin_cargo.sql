-- =====================================================================================================================
-- 0005 · La asignación ya no guarda el cargo y el almacén solo trabaja en Logística
--
--  · El cargo es lo pactado con la persona, no depende de dónde trabaje: sale de su CONTRATO. Una asignación dice DÓNDE y en qué ÁREA.
--    (Lo derivable no se guarda: la columna `cargo` se quita. Los contratos todavía no están en la base; hasta que pasen, Personal muestra
--    «Sin contrato» donde antes mostraba el cargo escrito a mano.)
--  · El almacén central es un lugar de logística: una asignación al almacén solo puede ser del área «Logística». Una sede admite todas.
--
-- Si ya hubiera asignaciones al almacén con otra área, la migración se detiene con un aviso claro (no cambia nada): se corrigen primero
-- desde Personas → Asignaciones y se vuelve a ejecutar.
-- Para deshacer: supabase/deshacer/20261106120000_asignaciones_sin_cargo.down.sql
-- =====================================================================================================================

do $$
begin
  if exists (select 1 from public.asignaciones where almacen_id is not null and area <> 'Logística') then
    raise exception 'Hay asignaciones al almacén con un área distinta de Logística: corríjalas o ciérrelas en Personas → Asignaciones y vuelva a ejecutar esta migración.';
  end if;
end $$;

alter table public.asignaciones add constraint asignaciones_almacen_solo_logistica check (almacen_id is null or area = 'Logística');

alter table public.asignaciones drop column cargo;

comment on table public.asignaciones is 'Dónde trabaja cada persona: una sede o el almacén, con área y rol del sistema (el cargo sale de su contrato). No se borra: se cierra con fecha y motivo. De las activas con acceso salen las sedes y el almacén de su cuenta.';
comment on constraint asignaciones_almacen_solo_logistica on public.asignaciones is 'El almacén central es un lugar de logística: allí solo se trabaja en el área Logística.';
