-- Deshace la migración 0029 (el tablero de envíos): los envíos que se preparan (Por armar, Empacando, Por despachar) vuelven a ser «Borrador», la sede destino
-- vuelve a leer todos los estados y las funciones de envíos recuperan su texto de la migración 0013. Se pierde cuándo y quién despachó cada envío.
begin;

alter table public.envios drop constraint envios_estado_check;
alter table public.envios disable trigger envios_huella;
update public.envios set estado = 'Borrador' where estado in ('Por armar', 'Empacando', 'Por despachar');
alter table public.envios enable trigger envios_huella;
alter table public.envios
  add constraint envios_estado_check check (estado in ('Borrador', 'En tránsito', 'Listo para recepción', 'Recibido', 'Recibido con diferencias', 'Cancelado'));
alter table public.envios alter column estado set default 'Borrador';

drop policy envios_leer on public.envios;
create policy envios_leer on public.envios for select to authenticated
  using ((select app.tiene_funcion('log-envios:view') or app.tiene_funcion('log-recepciones:view'))
    and ((select app.puede_ver_ubicacion(null, almacen_origen_id)) or (select app.puede_ver_ubicacion(sede_destino_id, null))));

alter table public.envios drop column despachado_en;
alter table public.envios drop column despachado_por;

create or replace function app.envio_validar_contenido(e public.envios) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.validar_ruta_envio(e.almacen_origen_id, e.sede_destino_id);
  if e.eta is null or e.eta_hora is null or e.metodo_envio_id is null then
    raise exception 'Por favor complete los campos obligatorios (*) en Datos Generales y Método de Envío.' using errcode = 'EN001';
  end if;
  perform app.validar_transporte(e.metodo_envio_id, e.courier_id, e.numero_guia, e.viajero_nombre, e.observacion_envio, true);
  perform app.validar_detalle(e.lineas, e.cajas);
  if jsonb_array_length(e.cajas) = 0 then raise exception 'Debe agregar al menos una caja con sus artículos.' using errcode = 'EN001'; end if;
end;
$$;

create or replace function app.despachar_envio(p_id text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  e public.envios;
begin
  perform app.exigir('log-envios:dispatch', 'Realizar el envío (despachar)');
  select * into e from public.envios x where x.id = p_id for update;
  if not found then raise exception 'Envío no encontrado.' using errcode = 'EN001'; end if;
  if e.estado <> 'Borrador' then raise exception 'Solo se despacha un envío en borrador.' using errcode = 'EN001'; end if;
  perform app.exigir_mover(e.almacen_origen_id);
  perform app.envio_validar_contenido(e);
  perform app.mover_lineas(e.almacen_origen_id, e.lineas, -1, 'Transferencia Salida', e.id, 'Despacho de envío ' || e.id);
  update public.envios x set estado = 'En tránsito', borrador_vence = null where x.id = p_id;
end;
$$;

create or replace function public.crear_envio(p jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_id     text;
  v_estado text := coalesce(app.jtexto(p, 'estado'), 'Borrador');
begin
  perform app.exigir('log-envios:create', 'Preparar un envío');
  if v_estado not in ('Borrador', 'En tránsito') then raise exception 'Un envío nuevo nace como borrador o despachado.' using errcode = 'EN001'; end if;
  if v_estado = 'En tránsito' then perform app.exigir('log-envios:dispatch', 'Realizar el envío (despachar)'); end if;
  perform app.validar_ruta_envio(app.jtexto(p, 'almacen_origen_id'), app.jtexto(p, 'sede_destino_id'));
  v_id := app.siguiente_codigo('ENV', 'envios');
  insert into public.envios (id, fecha, almacen_origen_id, sede_destino_id, estado, cajas, lineas, metodo_envio_id, courier_id, numero_guia, referencia_adicional,
    viajero_nombre, viajero_documento, observacion_envio, eta, eta_hora, borrador_vence, observacion, adjuntos, creado_por)
  values (v_id, coalesce(nullif(p->>'fecha', '')::date, app.hoy()), app.jtexto(p, 'almacen_origen_id'), app.jtexto(p, 'sede_destino_id'), 'Borrador',
    coalesce(p->'cajas', '[]'::jsonb), coalesce(p->'lineas', '[]'::jsonb), app.jtexto(p, 'metodo_envio_id'), app.jtexto(p, 'courier_id'), app.jtexto(p, 'numero_guia'),
    app.jtexto(p, 'referencia_adicional'), app.jtexto(p, 'viajero_nombre'), app.jtexto(p, 'viajero_documento'), app.jtexto(p, 'observacion_envio'),
    nullif(p->>'eta', '')::date, app.jtexto(p, 'eta_hora'), nullif(p->>'borrador_vence', '')::timestamptz, app.jtexto(p, 'observacion'),
    coalesce(array(select jsonb_array_elements_text(coalesce(p->'adjuntos', '[]'::jsonb))), '{}'), app.quien(null));
  if v_estado = 'En tránsito' then
    perform app.despachar_envio(v_id);
  else
    perform app.envio_validar_contenido((select x from public.envios x where x.id = v_id));
  end if;
  return v_id;
end;
$$;

create or replace function public.editar_envio(p_id text, p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  e public.envios;
begin
  select * into e from public.envios x where x.id = p_id for update;
  if not found then raise exception 'Envío no encontrado.' using errcode = 'EN001'; end if;
  if app.jtexto(p, 'estado') = 'En tránsito' then perform app.exigir('log-envios:dispatch', 'Realizar el envío (despachar)'); else perform app.exigir('log-envios:edit', 'Editar un envío'); end if;
  if e.estado = 'Borrador' then
    update public.envios x set
      fecha = case when p ? 'fecha' then coalesce(nullif(p->>'fecha', '')::date, x.fecha) else x.fecha end,
      almacen_origen_id = case when p ? 'almacen_origen_id' then coalesce(app.jtexto(p, 'almacen_origen_id'), x.almacen_origen_id) else x.almacen_origen_id end,
      sede_destino_id = case when p ? 'sede_destino_id' then coalesce(app.jtexto(p, 'sede_destino_id'), x.sede_destino_id) else x.sede_destino_id end,
      cajas = case when p ? 'cajas' then coalesce(p->'cajas', '[]'::jsonb) else x.cajas end,
      lineas = case when p ? 'lineas' then coalesce(p->'lineas', '[]'::jsonb) else x.lineas end,
      metodo_envio_id = case when p ? 'metodo_envio_id' then app.jtexto(p, 'metodo_envio_id') else x.metodo_envio_id end,
      courier_id = case when p ? 'courier_id' then app.jtexto(p, 'courier_id') else x.courier_id end,
      numero_guia = case when p ? 'numero_guia' then app.jtexto(p, 'numero_guia') else x.numero_guia end,
      referencia_adicional = case when p ? 'referencia_adicional' then app.jtexto(p, 'referencia_adicional') else x.referencia_adicional end,
      viajero_nombre = case when p ? 'viajero_nombre' then app.jtexto(p, 'viajero_nombre') else x.viajero_nombre end,
      viajero_documento = case when p ? 'viajero_documento' then app.jtexto(p, 'viajero_documento') else x.viajero_documento end,
      observacion_envio = case when p ? 'observacion_envio' then app.jtexto(p, 'observacion_envio') else x.observacion_envio end,
      eta = case when p ? 'eta' then nullif(p->>'eta', '')::date else x.eta end,
      eta_hora = case when p ? 'eta_hora' then app.jtexto(p, 'eta_hora') else x.eta_hora end,
      borrador_vence = case when p ? 'borrador_vence' then nullif(p->>'borrador_vence', '')::timestamptz else x.borrador_vence end,
      observacion = case when p ? 'observacion' then app.jtexto(p, 'observacion') else x.observacion end,
      adjuntos = case when p ? 'adjuntos' then coalesce(array(select jsonb_array_elements_text(coalesce(p->'adjuntos', '[]'::jsonb))), '{}') else x.adjuntos end,
      habilitar_recepcion_manual = case when p ? 'habilitar_recepcion_manual' then coalesce((p->>'habilitar_recepcion_manual')::boolean, false) else x.habilitar_recepcion_manual end,
      actualizado_por = app.quien(null), actualizado_en = now()
    where x.id = p_id;
    if app.jtexto(p, 'estado') = 'En tránsito' then
      perform app.despachar_envio(p_id);
    else
      perform app.envio_validar_contenido((select x from public.envios x where x.id = p_id));
    end if;
    return;
  end if;
  -- Ya despachado, el contenido no cambia: solo se habilita la recepción manual
  if (select count(*) from jsonb_object_keys(p) k where k not in ('habilitar_recepcion_manual', 'estado')) > 0 or (p ? 'estado' and app.jtexto(p, 'estado') is distinct from e.estado) then
    raise exception 'Un envío despachado ya no se edita: cancélelo y prepare otro.' using errcode = 'EN001';
  end if;
  if e.estado not in ('En tránsito', 'Listo para recepción') then raise exception 'Este envío ya está cerrado.' using errcode = 'EN001'; end if;
  update public.envios x set habilitar_recepcion_manual = coalesce((p->>'habilitar_recepcion_manual')::boolean, x.habilitar_recepcion_manual),
    actualizado_por = app.quien(null), actualizado_en = now() where x.id = p_id;
end;
$$;

create or replace function public.cambiar_estado_envio(p_id text, p_estado text, p_observacion text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  e public.envios;
begin
  perform app.exigir('log-envios:dispatch', 'Realizar el envío (despachar)');
  select * into e from public.envios x where x.id = p_id for update;
  if not found then raise exception 'Envío no encontrado.' using errcode = 'EN001'; end if;
  if p_estado = 'En tránsito' and e.estado = 'Borrador' then
    perform app.despachar_envio(p_id);
  elsif p_estado = 'Listo para recepción' and e.estado = 'En tránsito' then
    update public.envios x set estado = p_estado, actualizado_por = app.quien(null), actualizado_en = now() where x.id = p_id;
  elsif p_estado = 'Cancelado' and e.estado = 'Borrador' then
    update public.envios x set estado = p_estado, actualizado_por = app.quien(null), actualizado_en = now() where x.id = p_id;
  elsif p_estado = 'Cancelado' and e.estado in ('En tránsito', 'Listo para recepción') then
    perform app.exigir_mover(e.almacen_origen_id);
    perform app.mover_lineas(e.almacen_origen_id, e.lineas, 1, 'Ingreso', e.id, 'Cancelación de envío ' || e.id);
    update public.envios x set estado = p_estado, actualizado_por = app.quien(null), actualizado_en = now() where x.id = p_id;
  else
    raise exception 'Un envío «%» no puede pasar a «%».', e.estado, p_estado using errcode = 'EN001';
  end if;
  if app.jtexto(jsonb_build_object('o', p_observacion), 'o') is not null then
    update public.envios x set observacion = btrim(p_observacion) where x.id = p_id;
  end if;
end;
$$;

create or replace function public.eliminar_envio(p_id text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  e public.envios;
begin
  perform app.exigir('log-envios:delete', 'Eliminar un envío');
  select * into e from public.envios x where x.id = p_id for update;
  if not found then raise exception 'Envío no encontrado.' using errcode = 'EN001'; end if;
  if e.estado <> 'Borrador' then raise exception 'Solo se elimina un envío en borrador; uno despachado se cancela.' using errcode = 'EN001'; end if;
  delete from public.envios x where x.id = p_id;
end;
$$;

drop function app.mover_envio(text, text);
drop function app.envio_validar_etapa(public.envios, text);
drop function app.validar_cajas_avance(jsonb, jsonb);

commit;
