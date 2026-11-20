-- Deshace la migración 0032: las transferencias vuelven a pedir aprobación y a salir siempre con el almacén en un extremo.
-- ATENCIÓN: no se puede deshacer si ya hay transferencias entre dos sedes (el almacén tendría que ser uno de los extremos): primero hay que resolverlas a mano.
-- Las funciones «Preparar una transferencia» y «Despachar transferencia» de los roles vuelven a ser «Solicitar transferencia» (la aprobación que se quitó no se puede
-- adivinar: se vuelve a dar en Organización → Permisos). Los eventos de aviso se restauran volviendo a cargar supabase/seed/avisos_eventos.sql de la versión anterior.
begin;

do $$
begin
  if exists (select 1 from public.transferencias where origen_almacen_id is null and destino_almacen_id is null) then
    raise exception 'Hay transferencias entre dos sedes: no se puede deshacer hasta resolverlas.';
  end if;
end;
$$;

-- Fuera de la publicación de tiempo real
do $$
begin
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'transferencias') then
    alter publication supabase_realtime drop table public.transferencias;
  end if;
end;
$$;

-- Las funciones nuevas
drop function public.directorio_sedes();
drop function public.cambiar_estado_transferencia(text, text, text);

-- Las funciones de los roles: quien preparaba vuelve a «Solicitar transferencia»
insert into public.rol_funciones (rol_id, funcion_id)
select rf.rol_id, 'log-transfer:req_transfer' from public.rol_funciones rf where rf.funcion_id = 'log-transfer:create'
on conflict do nothing;
delete from public.rol_funciones where funcion_id = 'log-transfer:create';

-- Las reglas de antes
create or replace function app.validar_ruta_transferencia(p_origen text, p_destino text) returns void
language plpgsql stable security definer set search_path = '' as $$
declare
  v_otro text;
  v_sede public.sedes;
begin
  if coalesce(p_origen, '') = '' or coalesce(p_destino, '') = '' then raise exception 'Indique la sede de origen y la de destino.' using errcode = 'EN001'; end if;
  if p_origen = p_destino then raise exception 'El origen y el destino deben ser distintos.' using errcode = 'EN001'; end if;
  if not (app.ubicacion_es_almacen(p_origen) or app.ubicacion_es_almacen(p_destino)) then
    raise exception 'Entre filiales todo pasa por el almacén central: devuelva el stock al almacén o pídalo desde allí.' using errcode = 'EN001';
  end if;
  if app.ubicacion_es_almacen(p_origen) and app.ubicacion_es_almacen(p_destino) then
    raise exception 'La otra punta de una transferencia es una sede, no otro almacén.' using errcode = 'EN001';
  end if;
  if not exists (select 1 from public.almacenes a where a.id = case when app.ubicacion_es_almacen(p_origen) then p_origen else p_destino end and a.estado = 'Activo') then
    raise exception 'No hay un almacén central activo con ese código.' using errcode = 'EN001';
  end if;
  v_otro := case when app.ubicacion_es_almacen(p_origen) then p_destino else p_origen end;
  select * into v_sede from public.sedes s where s.id = v_otro;
  if not found then raise exception 'La sede indicada no existe.' using errcode = 'EN001'; end if;
  if v_sede.estado <> 'Activo' then raise exception 'La sede % está inactiva.', v_sede.nombre using errcode = 'EN001'; end if;
end;
$$;

create or replace function public.crear_transferencia(p jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_id      text;
  v_estado  text := coalesce(app.jtexto(p, 'estado'), 'Borrador');
  v_origen  text := app.jtexto(p, 'origen_id');
  v_destino text := app.jtexto(p, 'destino_id');
  t         public.transferencias;
begin
  perform app.exigir('log-transfer:req_transfer', 'Solicitar transferencia');
  if v_estado not in ('Borrador', 'Solicitada') then raise exception 'Una transferencia nueva nace como borrador o solicitada.' using errcode = 'EN001'; end if;
  perform app.validar_ruta_transferencia(v_origen, v_destino);
  if app.jtexto(p, 'motivo') is null then raise exception 'Por favor complete los campos obligatorios (*) y agregue al menos un artículo.' using errcode = 'EN001'; end if;
  perform app.validar_detalle(coalesce(p->'lineas', '[]'::jsonb), '[]'::jsonb);
  v_id := app.siguiente_codigo('TRF', 'transferencias');
  insert into public.transferencias (id, fecha, origen_sede_id, origen_almacen_id, destino_sede_id, destino_almacen_id, estado, lineas, motivo, solicitada_por, solicitada_por_id,
    observacion, creado_por)
  values (v_id, coalesce(nullif(p->>'fecha', '')::date, app.hoy()),
    case when app.ubicacion_es_almacen(v_origen) then null else v_origen end, case when app.ubicacion_es_almacen(v_origen) then v_origen else null end,
    case when app.ubicacion_es_almacen(v_destino) then null else v_destino end, case when app.ubicacion_es_almacen(v_destino) then v_destino else null end,
    v_estado, coalesce(p->'lineas', '[]'::jsonb), coalesce(app.jtexto(p, 'motivo'), ''), app.quien(null), auth.uid(), app.jtexto(p, 'observacion'), app.quien(null))
  returning * into t;
  perform app.transferencia_validar_solicitud(t);
  return v_id;
end;
$$;

create or replace function public.editar_transferencia(p_id text, p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  t         public.transferencias;
  v_despacho boolean := exists (
    select 1 from jsonb_object_keys(p) k
    where k in ('cajas', 'metodo_envio_id', 'courier_id', 'numero_guia', 'referencia_adicional', 'viajero_nombre', 'viajero_documento', 'observacion_envio',
      'observacion_interna_logistica', 'eta', 'habilitar_recepcion_manual', 'adjuntos'));
  v_origen  text;
  v_destino text;
begin
  select * into t from public.transferencias x where x.id = p_id for update;
  if not found then raise exception 'Transferencia no encontrada.' using errcode = 'EN001'; end if;
  if v_despacho then perform app.exigir('log-transfer:dispatch', 'Despachar transferencia'); else perform app.exigir('log-transfer:req_transfer', 'Solicitar transferencia'); end if;

  if t.estado = 'Borrador' and not v_despacho then
    v_origen := case when p ? 'origen_id' then coalesce(app.jtexto(p, 'origen_id'), t.origen_id) else t.origen_id end;
    v_destino := case when p ? 'destino_id' then coalesce(app.jtexto(p, 'destino_id'), t.destino_id) else t.destino_id end;
    perform app.validar_ruta_transferencia(v_origen, v_destino);
    if p ? 'motivo' and app.jtexto(p, 'motivo') is null then raise exception 'Por favor complete los campos obligatorios (*) y agregue al menos un artículo.' using errcode = 'EN001'; end if;
    if p ? 'lineas' then perform app.validar_detalle(coalesce(p->'lineas', '[]'::jsonb), '[]'::jsonb); end if;
    update public.transferencias x set
      fecha = case when p ? 'fecha' then coalesce(nullif(p->>'fecha', '')::date, x.fecha) else x.fecha end,
      origen_sede_id = case when app.ubicacion_es_almacen(v_origen) then null else v_origen end,
      origen_almacen_id = case when app.ubicacion_es_almacen(v_origen) then v_origen else null end,
      destino_sede_id = case when app.ubicacion_es_almacen(v_destino) then null else v_destino end,
      destino_almacen_id = case when app.ubicacion_es_almacen(v_destino) then v_destino else null end,
      lineas = case when p ? 'lineas' then coalesce(p->'lineas', '[]'::jsonb) else x.lineas end,
      motivo = case when p ? 'motivo' then coalesce(app.jtexto(p, 'motivo'), '') else x.motivo end,
      observacion = case when p ? 'observacion' then app.jtexto(p, 'observacion') else x.observacion end,
      actualizado_por = app.quien(null), actualizado_en = now()
    where x.id = p_id returning * into t;
    perform app.transferencia_validar_solicitud(t);
    return;
  end if;

  if t.estado = 'Aprobada' and v_despacho then
    update public.transferencias x set
      lineas = case when p ? 'lineas' then coalesce(p->'lineas', '[]'::jsonb) else x.lineas end,
      cajas = case when p ? 'cajas' then coalesce(p->'cajas', '[]'::jsonb) else x.cajas end,
      metodo_envio_id = case when p ? 'metodo_envio_id' then app.jtexto(p, 'metodo_envio_id') else x.metodo_envio_id end,
      courier_id = case when p ? 'courier_id' then app.jtexto(p, 'courier_id') else x.courier_id end,
      numero_guia = case when p ? 'numero_guia' then app.jtexto(p, 'numero_guia') else x.numero_guia end,
      referencia_adicional = case when p ? 'referencia_adicional' then app.jtexto(p, 'referencia_adicional') else x.referencia_adicional end,
      viajero_nombre = case when p ? 'viajero_nombre' then app.jtexto(p, 'viajero_nombre') else x.viajero_nombre end,
      viajero_documento = case when p ? 'viajero_documento' then app.jtexto(p, 'viajero_documento') else x.viajero_documento end,
      observacion_envio = case when p ? 'observacion_envio' then app.jtexto(p, 'observacion_envio') else x.observacion_envio end,
      observacion_interna_logistica = case when p ? 'observacion_interna_logistica' then app.jtexto(p, 'observacion_interna_logistica') else x.observacion_interna_logistica end,
      eta = case when p ? 'eta' then nullif(p->>'eta', '')::date else x.eta end,
      observacion = case when p ? 'observacion' then app.jtexto(p, 'observacion') else x.observacion end,
      adjuntos = case when p ? 'adjuntos' then coalesce(array(select jsonb_array_elements_text(coalesce(p->'adjuntos', '[]'::jsonb))), '{}') else x.adjuntos end,
      actualizado_por = app.quien(null), actualizado_en = now()
    where x.id = p_id;
    if p ? 'lineas' or p ? 'cajas' then
      select * into t from public.transferencias x where x.id = p_id;
      perform app.validar_detalle(t.lineas, t.cajas);
    end if;
    return;
  end if;

  if t.estado in ('En tránsito', 'Listo para recepción') and v_despacho
     and (select count(*) from jsonb_object_keys(p) k where k <> 'habilitar_recepcion_manual') = 0 then
    update public.transferencias x set habilitar_recepcion_manual = coalesce((p->>'habilitar_recepcion_manual')::boolean, x.habilitar_recepcion_manual),
      actualizado_por = app.quien(null), actualizado_en = now() where x.id = p_id;
    return;
  end if;
  raise exception 'Una transferencia «%» ya no admite ese cambio.', t.estado using errcode = 'EN001';
end;
$$;

create or replace function app.despachar_transferencia(p_id text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  t public.transferencias;
begin
  select * into t from public.transferencias x where x.id = p_id for update;
  perform app.exigir_mover(t.origen_id);
  if t.metodo_envio_id is null or t.eta is null then raise exception 'Por favor complete el método de envío y el ETA.' using errcode = 'EN001'; end if;
  perform app.validar_transporte(t.metodo_envio_id, t.courier_id, t.numero_guia, t.viajero_nombre, t.observacion_envio, false);
  perform app.validar_detalle(t.lineas, t.cajas);
  perform app.mover_lineas(t.origen_id, t.lineas, -1, 'Transferencia Salida', t.id, 'Despacho TRF: ' || t.id);
  update public.transferencias x set estado = 'En tránsito', actualizado_por = app.quien(null), actualizado_en = now() where x.id = p_id;
end;
$$;

create function public.cambiar_estado_transferencia(p_id text, p_estado text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  t public.transferencias;
begin
  select * into t from public.transferencias x where x.id = p_id for update;
  if not found then raise exception 'Transferencia no encontrada.' using errcode = 'EN001'; end if;

  if p_estado = 'Solicitada' and t.estado = 'Borrador' then
    perform app.exigir('log-transfer:req_transfer', 'Solicitar transferencia');
    perform app.transferencia_validar_solicitud(t);
    update public.transferencias x set estado = p_estado, actualizado_por = app.quien(null), actualizado_en = now() where x.id = p_id;
  elsif p_estado in ('Aprobada', 'Rechazada') and ((p_estado = 'Aprobada' and t.estado = 'Solicitada') or (p_estado = 'Rechazada' and t.estado in ('Solicitada', 'Aprobada'))) then
    perform app.exigir('log-transfer:approve_transfer', 'Aprobar transferencia');
    update public.transferencias x set estado = p_estado, actualizado_por = app.quien(null), actualizado_en = now() where x.id = p_id;
  elsif p_estado = 'En tránsito' and t.estado = 'Aprobada' then
    perform app.exigir('log-transfer:dispatch', 'Despachar transferencia');
    perform app.despachar_transferencia(p_id);
  elsif p_estado = 'Listo para recepción' and t.estado = 'En tránsito' then
    perform app.exigir('log-transfer:dispatch', 'Despachar transferencia');
    update public.transferencias x set estado = p_estado, actualizado_por = app.quien(null), actualizado_en = now() where x.id = p_id;
  elsif p_estado = 'Cancelada' and t.estado in ('Borrador', 'Solicitada', 'Aprobada') then
    if not (app.permite('log-transfer:req_transfer') or app.permite('log-transfer:dispatch') or app.permite('log-transfer:approve_transfer')) then
      raise exception 'Su rol no tiene ninguna de estas funciones: «Solicitar transferencia» o «Despachar transferencia» o «Aprobar transferencia».' using errcode = 'EN001';
    end if;
    update public.transferencias x set estado = p_estado, actualizado_por = app.quien(null), actualizado_en = now() where x.id = p_id;
  elsif p_estado = 'Cancelada' and t.estado in ('En tránsito', 'Listo para recepción') then
    perform app.exigir('log-transfer:dispatch', 'Despachar transferencia');
    perform app.exigir_mover(t.origen_id);
    perform app.mover_lineas(t.origen_id, t.lineas, 1, 'Ingreso', t.id, 'Cancelación TRF: ' || t.id);
    update public.transferencias x set estado = p_estado, actualizado_por = app.quien(null), actualizado_en = now() where x.id = p_id;
  else
    raise exception 'Una transferencia «%» no puede pasar a «%».', t.estado, p_estado using errcode = 'EN001';
  end if;
end;
$$;

-- Quién la ve: las dos puntas, en cualquier estado
drop policy transferencias_leer on public.transferencias;
create policy transferencias_leer on public.transferencias for select to authenticated
  using ((select app.tiene_funcion('log-transfer:view') or app.tiene_funcion('log-recepciones:view'))
    and ((select app.puede_ver_ubicacion(origen_sede_id, origen_almacen_id)) or (select app.puede_ver_ubicacion(destino_sede_id, destino_almacen_id))));

-- Restricciones y columnas
alter table public.transferencias drop constraint transferencias_despacho_check;
alter table public.transferencias drop constraint transferencias_sale_de_sede_check;
alter table public.transferencias add constraint transferencias_check2 check ((origen_almacen_id is not null) <> (destino_almacen_id is not null));
alter table public.transferencias drop constraint transferencias_estado_check;
alter table public.transferencias add constraint transferencias_estado_check
  check (estado in ('Borrador', 'Solicitada', 'Aprobada', 'En tránsito', 'Listo para recepción', 'Recibida', 'Recibida con diferencias', 'Rechazada', 'Cancelada'));
alter table public.transferencias drop column despachado_en, drop column despachado_por, drop column motivo_cancelacion;

revoke execute on function public.cambiar_estado_transferencia(text, text) from public, anon;
grant execute on function public.cambiar_estado_transferencia(text, text) to authenticated;
revoke execute on all functions in schema app from public, anon;
grant execute on all functions in schema app to authenticated;

commit;
