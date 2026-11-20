-- =====================================================================================================================
-- 0029 · El tablero de envíos de Logística: columnas, datos por etapa y qué ve la sede destino
-- ---------------------------------------------------------------------------------------------------------------------
-- Hasta ahora un envío se llenaba entero de una vez (destino, cajas, transporte y fecha de llegada) y nacía como «Borrador». Ahora avanza por las columnas de un
-- tablero, cada una con sus datos, como se trabaja en el almacén:
--
--   Por armar  →  Empacando  →  Por despachar  →  En tránsito  →  Recibido
--   (la lista)    (las cajas)    (transporte y     (ya salió;        (lo mueve la sede
--                                fecha de llegada)  sale el stock)    al recibir)
--
-- 1) Estados. «Borrador» pasa a ser «Por armar» (hoy no hay ningún borrador) y se suman «Empacando» y «Por despachar». «Listo para recepción» se conserva
--    como estado (se ve como etiqueta dentro de «En tránsito»).
-- 2) Cada columna tiene sus datos y solo ahí se cambian: la lista de artículos y el destino en «Por armar», las cajas en «Empacando», el transporte y la fecha
--    y hora de llegada en «Por despachar». Se avanza de a una columna y solo con los datos de la columna de la que sale (`app.envio_validar_etapa`): la lista
--    (destino y artículos), las cajas (suman justo la lista) y el transporte con la fecha y hora de llegada. Hacia atrás se vuelve libremente hasta «Por
--    despachar» (el stock todavía no salió). Mientras se arman las cajas se guarda el avance a medias (`app.validar_cajas_avance`: nunca más unidades en las
--    cajas que en la lista). Una tarjeta no vence sola (se deja de usar `borrador_vence`).
-- 3) Despachar (pasar a «En tránsito») es lo único que mueve stock: sale del almacén UNA vez y se anota cuándo (`despachado_en`, `despachado_por`). Desde ahí no se
--    vuelve atrás: solo se cancela, y cancelar algo ya despachado pide su motivo y devuelve lo que salió. Cancelar antes de despachar no mueve stock.
-- 4) La sede destino NO ve la preparación: solo lee un envío desde que salió (`despachado_en` con valor). Antes la base le dejaba leer todos los estados, también un
--    borrador. El almacén de origen ve todo, como siempre.
-- Los permisos no cambian: crear y editar (incluido mover entre las columnas de preparación) piden «Preparar un envío» / «Editar un envío»; despachar y cancelar,
-- «Realizar el envío (despachar)».
-- Para deshacer: supabase/deshacer/20261119100000_tablero_de_envios.down.sql
-- =====================================================================================================================

begin;

-- ---------------------------------------------------------------------------------------------------------------------
-- 1) Estados y cuándo salió el envío
-- ---------------------------------------------------------------------------------------------------------------------

alter table public.envios drop constraint envios_estado_check;
-- La huella (quién y cuándo) no debe cambiar por este reacomodo de datos
alter table public.envios disable trigger envios_huella;
update public.envios set estado = 'Por armar' where estado = 'Borrador';
update public.envios set borrador_vence = null where borrador_vence is not null;
alter table public.envios
  add constraint envios_estado_check check (estado in ('Por armar', 'Empacando', 'Por despachar', 'En tránsito', 'Listo para recepción', 'Recibido', 'Recibido con diferencias', 'Cancelado'));
alter table public.envios alter column estado set default 'Por armar';

alter table public.envios add column despachado_en timestamptz;
alter table public.envios add column despachado_por text;
comment on column public.envios.despachado_en is 'Cuándo salió del almacén (pasó a «En tránsito»). Vacío mientras se prepara: la sede destino solo lee un envío desde que salió.';
comment on column public.envios.despachado_por is 'Quién lo despachó (el nombre sale de la cuenta).';
-- Lo que ya había salido antes de esta migración: se toma la última vez que cambió
update public.envios set despachado_en = actualizado_en where estado in ('En tránsito', 'Listo para recepción', 'Recibido', 'Recibido con diferencias') and despachado_en is null;
alter table public.envios enable trigger envios_huella;

-- ---------------------------------------------------------------------------------------------------------------------
-- 2) Quién lee un envío: el almacén de origen, siempre; la sede destino, solo desde que salió
-- ---------------------------------------------------------------------------------------------------------------------

drop policy envios_leer on public.envios;
create policy envios_leer on public.envios for select to authenticated using (
  (select (app.tiene_funcion('log-envios:view') or app.tiene_funcion('log-recepciones:view')))
  and (
    (select app.puede_ver_ubicacion(null::text, envios.almacen_origen_id))
    or (envios.despachado_en is not null and (select app.puede_ver_ubicacion(envios.sede_destino_id, null::text)))
  )
);

-- ---------------------------------------------------------------------------------------------------------------------
-- 3) Lo que cada columna exige para poder salir de ella
-- ---------------------------------------------------------------------------------------------------------------------

-- Las cajas guardadas a medias: cada caja con sus artículos, cada artículo de la lista y nunca más unidades en las cajas que en la lista.
create function app.validar_cajas_avance(p_lineas jsonb, p_cajas jsonb) returns void
language plpgsql stable security definer set search_path = '' as $$
declare
  v_caja jsonb;
  v_item jsonb;
  v_cant numeric;
  v_n    integer := 0;
begin
  if jsonb_typeof(p_cajas) is distinct from 'array' then return; end if;
  for v_caja in select * from jsonb_array_elements(p_cajas) loop
    v_n := v_n + 1;
    if jsonb_typeof(v_caja->'items') is distinct from 'array' or jsonb_array_length(v_caja->'items') = 0 then
      raise exception 'La caja % no puede estar vacía.', coalesce(nullif(btrim(coalesce(v_caja->>'numero', '')), ''), v_n::text) using errcode = 'EN001';
    end if;
    for v_item in select * from jsonb_array_elements(v_caja->'items') loop
      v_cant := case when jsonb_typeof(v_item->'cantidad') = 'number' then (v_item->>'cantidad')::numeric else null end;
      if coalesce(v_item->>'articulo_id', '') = '' then
        raise exception 'Hay un artículo sin seleccionar en la caja %.', coalesce(nullif(btrim(coalesce(v_caja->>'numero', '')), ''), v_n::text) using errcode = 'EN001';
      end if;
      if v_cant is null or v_cant < 1 or v_cant <> trunc(v_cant) then
        raise exception 'La cantidad debe ser mayor a 0 en la caja %.', coalesce(nullif(btrim(coalesce(v_caja->>'numero', '')), ''), v_n::text) using errcode = 'EN001';
      end if;
    end loop;
  end loop;
  if exists (
    select 1 from app.sumar_cajas(p_cajas) c
    where not exists (select 1 from jsonb_array_elements(p_lineas) l where l->>'articulo_id' = c.articulo)
  ) then
    raise exception 'Hay un artículo en las cajas que no está en la lista del envío.' using errcode = 'EN001';
  end if;
  if exists (
    select 1 from app.sumar_cajas(p_cajas) c join jsonb_array_elements(p_lineas) l on l->>'articulo_id' = c.articulo
    where c.cantidad > (l->>'cantidad')::integer
  ) then
    raise exception 'Hay más unidades en las cajas que en la lista del envío.' using errcode = 'EN001';
  end if;
end;
$$;

-- p_etapa: la columna de la que se quiere salir. «Por armar»: el destino y la lista; «Empacando»: todo repartido en cajas; «Por despachar»: el transporte y la
-- fecha y hora de llegada.
create function app.envio_validar_etapa(e public.envios, p_etapa text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_etapa = 'Por armar' then
    perform app.validar_ruta_envio(e.almacen_origen_id, e.sede_destino_id);
    perform app.validar_detalle(e.lineas, '[]'::jsonb);
  elsif p_etapa = 'Empacando' then
    if jsonb_array_length(e.cajas) = 0 then raise exception 'Debe agregar al menos una caja con sus artículos.' using errcode = 'EN001'; end if;
    perform app.validar_detalle(e.lineas, e.cajas);
  elsif p_etapa = 'Por despachar' then
    if e.eta is null or e.eta_hora is null then raise exception 'Indique la fecha y la hora de llegada.' using errcode = 'EN001'; end if;
    perform app.validar_transporte(e.metodo_envio_id, e.courier_id, e.numero_guia, e.viajero_nombre, e.observacion_envio, true);
  else
    raise exception 'Etapa desconocida.' using errcode = 'EN001';
  end if;
end;
$$;

-- Para despachar hacen falta los datos de las tres columnas.
create or replace function app.envio_validar_contenido(e public.envios) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.envio_validar_etapa(e, 'Por armar');
  perform app.envio_validar_etapa(e, 'Empacando');
  perform app.envio_validar_etapa(e, 'Por despachar');
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- 4) Moverse entre las columnas de preparación
-- ---------------------------------------------------------------------------------------------------------------------

-- Hacia adelante, de a una columna y con la columna de la que sale completa; hacia atrás, libre. Despachar lo hace `app.despachar_envio`.
create function app.mover_envio(p_id text, p_a text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  e public.envios;
begin
  select * into e from public.envios x where x.id = p_id for update;
  if not found then raise exception 'Envío no encontrado.' using errcode = 'EN001'; end if;
  if p_a is not distinct from e.estado then return; end if;
  if p_a = 'En tránsito' then
    if e.estado <> 'Por despachar' then raise exception 'Para despachar, la tarjeta debe estar en «Por despachar».' using errcode = 'EN001'; end if;
    perform app.despachar_envio(p_id);
    return;
  end if;
  if e.estado = 'Por armar' and p_a = 'Empacando' then
    perform app.envio_validar_etapa(e, 'Por armar');
  elsif e.estado = 'Empacando' and p_a = 'Por despachar' then
    perform app.envio_validar_etapa(e, 'Empacando');
  elsif e.estado = 'Por armar' and p_a = 'Por despachar' then
    raise exception 'Avance de a una columna: pase la tarjeta a «Empacando» primero.' using errcode = 'EN001';
  elsif (e.estado = 'Empacando' and p_a = 'Por armar') or (e.estado = 'Por despachar' and p_a in ('Empacando', 'Por armar')) then
    null; -- hacia atrás: libre mientras el stock no haya salido
  else
    raise exception 'Un envío «%» no puede pasar a «%».', e.estado, p_a using errcode = 'EN001';
  end if;
  update public.envios x set estado = p_a where x.id = p_id;
end;
$$;

-- Despachar: pasa de «Por despachar» a «En tránsito», sale el stock del almacén (una sola vez) y queda cuándo y quién.
create or replace function app.despachar_envio(p_id text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  e public.envios;
begin
  perform app.exigir('log-envios:dispatch', 'Realizar el envío (despachar)');
  select * into e from public.envios x where x.id = p_id for update;
  if not found then raise exception 'Envío no encontrado.' using errcode = 'EN001'; end if;
  if e.estado <> 'Por despachar' then raise exception 'Solo se despacha un envío que está en «Por despachar».' using errcode = 'EN001'; end if;
  perform app.exigir_mover(e.almacen_origen_id);
  perform app.envio_validar_contenido(e);
  perform app.mover_lineas(e.almacen_origen_id, e.lineas, -1, 'Transferencia Salida', e.id, 'Despacho de envío ' || e.id);
  update public.envios x set estado = 'En tránsito', borrador_vence = null, despachado_en = now(), despachado_por = app.quien(null) where x.id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- 5) Crear, editar, cambiar de estado y eliminar
-- ---------------------------------------------------------------------------------------------------------------------

-- Un envío nuevo nace en «Por armar», con el destino y la lista de artículos (lo demás se completa en las columnas siguientes).
create or replace function public.crear_envio(p jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_id text;
begin
  perform app.exigir('log-envios:create', 'Preparar un envío');
  if coalesce(app.jtexto(p, 'estado'), 'Por armar') <> 'Por armar' then raise exception 'Un envío nuevo nace en «Por armar».' using errcode = 'EN001'; end if;
  perform app.validar_ruta_envio(app.jtexto(p, 'almacen_origen_id'), app.jtexto(p, 'sede_destino_id'));
  v_id := app.siguiente_codigo('ENV', 'envios');
  insert into public.envios (id, fecha, almacen_origen_id, sede_destino_id, estado, cajas, lineas, observacion, adjuntos, creado_por)
  values (v_id, coalesce(nullif(p->>'fecha', '')::date, app.hoy()), app.jtexto(p, 'almacen_origen_id'), app.jtexto(p, 'sede_destino_id'), 'Por armar',
    '[]'::jsonb, coalesce(p->'lineas', '[]'::jsonb), app.jtexto(p, 'observacion'),
    coalesce(array(select jsonb_array_elements_text(coalesce(p->'adjuntos', '[]'::jsonb))), '{}'), app.quien(null));
  perform app.envio_validar_etapa((select x from public.envios x where x.id = v_id), 'Por armar');
  return v_id;
end;
$$;

-- Guarda los datos de la columna en que está el envío y, si trae un `estado` distinto, lo mueve de columna. Un envío ya despachado no se edita (solo se habilita
-- su recepción manual).
create or replace function public.editar_envio(p_id text, p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  e         public.envios;
  n         public.envios;
  v_a       text := app.jtexto(p, 'estado');
  v_clave   text;
  v_validas text[];
begin
  select * into e from public.envios x where x.id = p_id for update;
  if not found then raise exception 'Envío no encontrado.' using errcode = 'EN001'; end if;
  if v_a = 'En tránsito' then perform app.exigir('log-envios:dispatch', 'Realizar el envío (despachar)'); else perform app.exigir('log-envios:edit', 'Editar un envío'); end if;

  if e.estado in ('Por armar', 'Empacando', 'Por despachar') then
    v_validas := case e.estado
      when 'Por armar' then array['almacen_origen_id', 'sede_destino_id', 'lineas', 'observacion', 'adjuntos', 'estado']
      when 'Empacando' then array['cajas', 'observacion', 'adjuntos', 'estado']
      else array['metodo_envio_id', 'courier_id', 'numero_guia', 'referencia_adicional', 'viajero_nombre', 'viajero_documento', 'observacion_envio', 'eta', 'eta_hora', 'observacion', 'adjuntos', 'estado']
    end;
    for v_clave in select k from jsonb_object_keys(p) k loop
      if not (v_clave = any (v_validas)) then
        raise exception '%', case
          when v_clave in ('almacen_origen_id', 'sede_destino_id', 'lineas') then 'La lista de artículos y el destino solo se cambian en «Por armar»: devuelva la tarjeta a esa columna.'
          when v_clave = 'cajas' then 'Las cajas solo se arman en «Empacando»: devuelva la tarjeta a esa columna.'
          when v_clave in ('metodo_envio_id', 'courier_id', 'numero_guia', 'referencia_adicional', 'viajero_nombre', 'viajero_documento', 'observacion_envio', 'eta', 'eta_hora')
            then 'El transporte y la fecha de llegada se registran en «Por despachar»: pase la tarjeta a esa columna.'
          else 'Ese dato no se puede cambiar en «' || e.estado || '».'
        end using errcode = 'EN001';
      end if;
    end loop;

    update public.envios x set
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
      observacion = case when p ? 'observacion' then app.jtexto(p, 'observacion') else x.observacion end,
      adjuntos = case when p ? 'adjuntos' then coalesce(array(select jsonb_array_elements_text(coalesce(p->'adjuntos', '[]'::jsonb))), '{}') else x.adjuntos end
    where x.id = p_id;
    select * into n from public.envios x where x.id = p_id;
    if p ? 'lineas' or p ? 'almacen_origen_id' or p ? 'sede_destino_id' then perform app.envio_validar_etapa(n, 'Por armar'); end if;
    if p ? 'cajas' then perform app.validar_cajas_avance(n.lineas, n.cajas); end if;
    if v_a is not null and v_a is distinct from e.estado then perform app.mover_envio(p_id, v_a); end if;
    return;
  end if;

  -- Ya despachado, el contenido no cambia: solo se habilita la recepción manual
  if (select count(*) from jsonb_object_keys(p) k where k not in ('habilitar_recepcion_manual', 'estado')) > 0 or (p ? 'estado' and app.jtexto(p, 'estado') is distinct from e.estado) then
    raise exception 'Un envío despachado ya no se edita: cancélelo y prepare otro.' using errcode = 'EN001';
  end if;
  if e.estado not in ('En tránsito', 'Listo para recepción') then raise exception 'Este envío ya está cerrado.' using errcode = 'EN001'; end if;
  update public.envios x set habilitar_recepcion_manual = coalesce((p->>'habilitar_recepcion_manual')::boolean, x.habilitar_recepcion_manual) where x.id = p_id;
end;
$$;

-- Despachar, marcar «Listo para recepción» o cancelar. Cancelar algo ya despachado pide su motivo y devuelve al almacén lo que salió; antes de despachar no mueve stock.
create or replace function public.cambiar_estado_envio(p_id text, p_estado text, p_observacion text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  e public.envios;
begin
  perform app.exigir('log-envios:dispatch', 'Realizar el envío (despachar)');
  select * into e from public.envios x where x.id = p_id for update;
  if not found then raise exception 'Envío no encontrado.' using errcode = 'EN001'; end if;
  if p_estado = 'En tránsito' and e.estado = 'Por despachar' then
    perform app.despachar_envio(p_id);
  elsif p_estado = 'Listo para recepción' and e.estado = 'En tránsito' then
    update public.envios x set estado = p_estado where x.id = p_id;
  elsif p_estado = 'Cancelado' and e.estado in ('Por armar', 'Empacando', 'Por despachar') then
    update public.envios x set estado = p_estado where x.id = p_id;
  elsif p_estado = 'Cancelado' and e.estado in ('En tránsito', 'Listo para recepción') then
    if length(btrim(coalesce(p_observacion, ''))) < 5 then raise exception 'Indique el motivo de la cancelación (al menos 5 letras): lo que salió vuelve al almacén.' using errcode = 'EN001'; end if;
    perform app.exigir_mover(e.almacen_origen_id);
    perform app.mover_lineas(e.almacen_origen_id, e.lineas, 1, 'Ingreso', e.id, 'Cancelación de envío ' || e.id);
    update public.envios x set estado = p_estado where x.id = p_id;
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
  if e.estado <> 'Por armar' then raise exception 'Solo se elimina un envío que está en «Por armar»; si ya avanzó, se cancela.' using errcode = 'EN001'; end if;
  delete from public.envios x where x.id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Permisos de las funciones nuevas: las de `app` las llama la base, no la API
-- ---------------------------------------------------------------------------------------------------------------------

revoke execute on function app.validar_cajas_avance(jsonb, jsonb), app.envio_validar_etapa(public.envios, text), app.mover_envio(text, text) from public, anon;
grant execute on function app.validar_cajas_avance(jsonb, jsonb), app.envio_validar_etapa(public.envios, text), app.mover_envio(text, text) to authenticated;

commit;
