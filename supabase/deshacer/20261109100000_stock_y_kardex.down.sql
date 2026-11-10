-- Deshace la migración 0012 (stock, kardex y ajustes). CUIDADO: borra el stock, el kardex y los ajustes guardados.
-- Orden: primero lo que depende de las tablas (funciones y disparadores), después las tablas.

begin;

drop function if exists public.registrar_ingreso_stock(text, text, integer, text, text);
drop function if exists public.registrar_ajuste_stock(text, text, text, integer, text, text);
drop function if exists public.empaquetar_articulo(text, text);
drop function if exists public.desempaquetar_articulo(text, text);
drop function if exists public.definir_stock_minimo(text, text, integer);
drop function if exists public.vender_articulo(text, text, integer, text, text);
drop function if exists public.entregar_materiales(text, text, text, jsonb);
drop function if exists public.reponer_por_reversa(text, text, integer, text);

drop trigger if exists almacenes_inactivar_guarda on public.almacenes;
drop function if exists app.almacen_inactivar_guarda();

-- La guarda de las sedes vuelve a la de la migración 0011 (sin mirar el stock)
create or replace function app.sede_catalogo_eliminar_guarda() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.programas p where not p.todas_las_sedes and old.id = any (p.sedes_habilitadas))
     or exists (select 1 from public.tarifarios t where t.sede_id = old.id)
     or exists (select 1 from public.promociones p where not p.todas_las_sedes and old.id = any (p.sedes))
     or exists (select 1 from public.recetas r where not r.todas_las_sedes and old.id = any (r.sedes))
     or exists (select 1 from public.articulo_precios x where x.sede_id = old.id) then
    raise exception 'No se puede eliminar la filial: el catálogo comercial o de artículos (programas, tarifarios, promociones, recetas o precios) la usa. Inactívela si ya no se usa.' using errcode = 'EN001';
  end if;
  return old;
end;
$$;

drop table if exists public.ajustes;
drop table if exists public.kardex;
drop table if exists public.stock;

drop function if exists app.mover_stock(text, text, integer, text, text, text);
drop function if exists app.stock_disponible(text, text);
drop function if exists app.paquete_de(text, boolean);
drop function if exists app.stock_solo_por_movimientos();
drop function if exists app.libro_inmutable();
drop function if exists app.exigir_mover(text);
drop function if exists app.puede_mover(text);
drop function if exists app.puede_ver_ubicacion(text, text);
drop function if exists app.nombre_ubicacion(text);
drop function if exists app.exigir(text, text);
drop function if exists app.ubicacion_es_almacen(text);
drop sequence if exists app.seq_empaquetado;
drop sequence if exists app.seq_desempaquetado;

commit;
