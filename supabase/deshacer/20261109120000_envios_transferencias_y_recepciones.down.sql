-- Deshace la migración 0013 (envíos, transferencias, recepciones, couriers y métodos de envío).
-- CUIDADO: borra los envíos, transferencias, incidencias, couriers y métodos de envío guardados. El stock ya movido por ellos NO se revierte.

begin;

drop function if exists public.crear_envio(jsonb);
drop function if exists public.editar_envio(text, jsonb);
drop function if exists public.cambiar_estado_envio(text, text, text);
drop function if exists public.eliminar_envio(text);
drop function if exists public.crear_transferencia(jsonb);
drop function if exists public.editar_transferencia(text, jsonb);
drop function if exists public.cambiar_estado_transferencia(text, text);
drop function if exists public.confirmar_recepcion(text, text, jsonb, text);
-- Estas dos reciben una fila de la tabla: hay que quitarlas antes que las tablas
drop function if exists app.envio_validar_contenido(public.envios);
drop function if exists app.transferencia_validar_solicitud(public.transferencias);

-- La guarda de las sedes vuelve a la de la migración 0012 (stock y movimientos, sin envíos ni transferencias)
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
  if exists (select 1 from public.stock s where s.sede_id = old.id) or exists (select 1 from public.kardex k where k.sede_id = old.id) then
    raise exception 'No se puede eliminar la filial: tiene stock o movimientos de stock. Inactívela si ya no se usa.' using errcode = 'EN001';
  end if;
  return old;
end;
$$;

drop table if exists public.incidencias_recepcion;
drop table if exists public.envios;
drop table if exists public.transferencias;
drop table if exists public.couriers;
drop table if exists public.metodos_envio;

drop function if exists app.courier_validar();
drop function if exists app.metodo_envio_validar();
drop function if exists app.mover_lineas(text, jsonb, integer, text, text, text);
drop function if exists app.siguiente_codigo(text, text);
drop function if exists app.despachar_envio(text);
drop function if exists app.despachar_transferencia(text);
drop function if exists app.validar_ruta_transferencia(text, text);
drop function if exists app.validar_ruta_envio(text, text);
drop function if exists app.validar_transporte(text, text, text, text, text, boolean);
drop function if exists app.validar_detalle(jsonb, jsonb);
drop function if exists app.sumar_cajas(jsonb);
drop function if exists app.anio_hoy();
drop function if exists app.jtexto(jsonb, text);

commit;
