-- =====================================================================================================================
-- 0032 · Transferencias entre sedes, sin aprobación
-- ---------------------------------------------------------------------------------------------------------------------
-- Una transferencia es lo que una SEDE manda a otra sede (un préstamo: Juliaca le presta a Cusco) o devuelve al almacén central. No lleva aprobación: la sede que
-- manda responde por lo que manda. Lo que el almacén le manda a una sede es un envío, y la sede lo pide con un requerimiento (migración 0031).
--
--   · Ruta: una transferencia sale SIEMPRE de una sede activa y llega a otra sede activa o al almacén central activo. Ya no sale del almacén (la restricción
--     «un extremo es el almacén» se cambia por «sale de una sede»).
--   · Estados: Borrador → En tránsito → (Listo para recepción) → Recibida (con o sin diferencias); también Cancelada. Se quitan Solicitada, Aprobada y Rechazada. La
--     sede prepara el borrador (lista, motivo, cajas, método de envío y fecha de llegada) y despachar es pasar a «En tránsito»: ahí sale el stock de la sede de
--     origen (una sola vez) y queda cuándo y quién (`despachado_en`, `despachado_por`).
--   · La sede destino ve la transferencia solo desde que sale (igual que un envío): un borrador, o uno cancelado antes de salir, solo lo ve la sede que lo prepara.
--   · Quién puede: prepara, despacha y cancela quien alcanza la sede que manda y tiene la función. Antes bastaba la función (porque solo el almacén despachaba); ahora
--     que cada sede despacha lo suyo, la base también comprueba que la cuenta alcance la sede de origen al editar, marcar «Listo para recepción» y cancelar.
--   · Cancelar una transferencia que ya salió pide su motivo (al menos 5 letras): lo que salió vuelve a la sede de origen y el motivo queda en `motivo_cancelacion`.
--   · Funciones del registro: «Solicitar transferencia» (`req_transfer`) pasa a ser «Preparar una transferencia» (`log-transfer:create`) y «Aprobar transferencia»
--     (`approve_transfer`) desaparece. Los roles que podían solicitar reciben preparar y despachar; la aprobación se quita de todos.
--   · `directorio_sedes()`: el código, el nombre y el estado de todas las sedes, para cualquier cuenta con acceso vigente. Una cuenta de sede solo lee su propia sede y
--     no podía elegir a qué otra sede mandar ni saber de cuál viene lo que le llega. No entrega dirección, teléfonos ni empresa.
--   · Tiempo real: la tabla `transferencias` se agrega a la publicación `supabase_realtime` (cada cuenta solo recibe lo que puede leer).
--   · Los eventos de aviso «Transferencia solicitada» y «Transferencia aprobada o rechazada» se quitan; se suma «Transferencia cancelada» (para la sede que recibe).
-- Los errores de negocio usan el código EN001: el sistema muestra su texto tal cual (está en español).
-- Para deshacer: supabase/deshacer/20261122100000_transferencias_entre_sedes.down.sql
-- =====================================================================================================================

begin;

-- ---------------------------------------------------------------------------------------------------------------------
-- 1) Lo que había antes
-- ---------------------------------------------------------------------------------------------------------------------

-- Una transferencia que sale del almacén (una reposición) ya no existe como tal: si hubiera alguna, se revisa a mano antes de seguir.
do $$
begin
  if exists (select 1 from public.transferencias where origen_almacen_id is not null) then
    raise exception 'Hay transferencias que salen del almacén (reposiciones): revíselas antes de aplicar esta migración. Desde ahora una transferencia sale siempre de una sede.';
  end if;
end;
$$;

alter table public.transferencias
  add column despachado_en timestamptz,
  add column despachado_por text,
  add column motivo_cancelacion text;
comment on column public.transferencias.despachado_en is 'Cuándo salió de la sede de origen. Desde ahí la sede destino la ve. Vacío mientras es un borrador.';
comment on column public.transferencias.motivo_cancelacion is 'Por qué se canceló una transferencia que ya había salido (lo que salió volvió a la sede de origen).';

-- Las solicitudes que esperaban aprobación (o se aprobaron sin despachar) nunca movieron stock: se cancelan y se explica por qué.
update public.transferencias
   set estado = 'Cancelada', motivo_cancelacion = 'Se canceló al dejar de pedir aprobación en las transferencias (migración 0032).'
 where estado in ('Solicitada', 'Aprobada', 'Rechazada');

-- Lo que ya salió trae su fecha de despacho (la última vez que se tocó).
update public.transferencias
   set despachado_en = coalesce(despachado_en, actualizado_en), despachado_por = coalesce(despachado_por, actualizado_por)
 where estado in ('En tránsito', 'Listo para recepción', 'Recibida', 'Recibida con diferencias');

alter table public.transferencias drop constraint transferencias_estado_check;
alter table public.transferencias add constraint transferencias_estado_check
  check (estado in ('Borrador', 'En tránsito', 'Listo para recepción', 'Recibida', 'Recibida con diferencias', 'Cancelada'));
-- «Un extremo es el almacén» → «sale de una sede» (el destino es otra sede o el almacén)
alter table public.transferencias drop constraint transferencias_check2;
alter table public.transferencias add constraint transferencias_sale_de_sede_check check (origen_almacen_id is null);
alter table public.transferencias add constraint transferencias_despacho_check
  check (estado not in ('En tránsito', 'Listo para recepción', 'Recibida', 'Recibida con diferencias') or despachado_en is not null);

-- ---------------------------------------------------------------------------------------------------------------------
-- 2) Quién la ve: la sede destino, solo desde que sale
-- ---------------------------------------------------------------------------------------------------------------------

drop policy transferencias_leer on public.transferencias;
create policy transferencias_leer on public.transferencias for select to authenticated
  using ((select app.tiene_funcion('log-transfer:view') or app.tiene_funcion('log-recepciones:view'))
    and ((select app.puede_ver_ubicacion(origen_sede_id, origen_almacen_id))
      or (despachado_en is not null and (select app.puede_ver_ubicacion(destino_sede_id, destino_almacen_id)))));

-- ---------------------------------------------------------------------------------------------------------------------
-- 3) La ruta: de una sede a otra sede o al almacén central
-- ---------------------------------------------------------------------------------------------------------------------

create or replace function app.validar_ruta_transferencia(p_origen text, p_destino text) returns void
language plpgsql stable security definer set search_path = '' as $$
declare
  v_sede public.sedes;
begin
  if coalesce(p_origen, '') = '' or coalesce(p_destino, '') = '' then raise exception 'Indique la sede de origen y la de destino.' using errcode = 'EN001'; end if;
  if p_origen = p_destino then raise exception 'El origen y el destino deben ser distintos.' using errcode = 'EN001'; end if;
  if app.ubicacion_es_almacen(p_origen) then
    raise exception 'Una transferencia sale de una sede: el almacén central envía con los envíos y la sede lo pide con un requerimiento.' using errcode = 'EN001';
  end if;
  select * into v_sede from public.sedes s where s.id = p_origen;
  if not found then raise exception 'La sede de origen no existe.' using errcode = 'EN001'; end if;
  if v_sede.estado <> 'Activo' then raise exception 'La sede % está inactiva.', v_sede.nombre using errcode = 'EN001'; end if;
  if app.ubicacion_es_almacen(p_destino) then
    if not exists (select 1 from public.almacenes a where a.id = p_destino and a.estado = 'Activo') then
      raise exception 'No hay un almacén central activo con ese código.' using errcode = 'EN001';
    end if;
    return;
  end if;
  select * into v_sede from public.sedes s where s.id = p_destino;
  if not found then raise exception 'La sede de destino no existe.' using errcode = 'EN001'; end if;
  if v_sede.estado <> 'Activo' then raise exception 'La sede % está inactiva.', v_sede.nombre using errcode = 'EN001'; end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- 4) Preparar, editar, despachar y cancelar
-- ---------------------------------------------------------------------------------------------------------------------

create or replace function public.crear_transferencia(p jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_id      text;
  v_origen  text := app.jtexto(p, 'origen_id');
  v_destino text := app.jtexto(p, 'destino_id');
  t         public.transferencias;
begin
  perform app.exigir('log-transfer:create', 'Preparar una transferencia');
  if coalesce(app.jtexto(p, 'estado'), 'Borrador') <> 'Borrador' then raise exception 'Una transferencia nueva nace como borrador: se despacha después.' using errcode = 'EN001'; end if;
  perform app.validar_ruta_transferencia(v_origen, v_destino);
  -- Solo la sede que manda la prepara: quien la alcanza
  perform app.exigir_mover(v_origen);
  if app.jtexto(p, 'motivo') is null then raise exception 'Por favor complete los campos obligatorios (*) y agregue al menos un artículo.' using errcode = 'EN001'; end if;
  perform app.validar_detalle(coalesce(p->'lineas', '[]'::jsonb), '[]'::jsonb);
  v_id := app.siguiente_codigo('TRF', 'transferencias');
  insert into public.transferencias (id, fecha, origen_sede_id, destino_sede_id, destino_almacen_id, estado, lineas, motivo, solicitada_por, solicitada_por_id,
    observacion, creado_por)
  values (v_id, coalesce(nullif(p->>'fecha', '')::date, app.hoy()), v_origen,
    case when app.ubicacion_es_almacen(v_destino) then null else v_destino end, case when app.ubicacion_es_almacen(v_destino) then v_destino else null end,
    'Borrador', coalesce(p->'lineas', '[]'::jsonb), coalesce(app.jtexto(p, 'motivo'), ''), app.quien(null), auth.uid(), app.jtexto(p, 'observacion'), app.quien(null))
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
  if v_despacho then perform app.exigir('log-transfer:dispatch', 'Despachar transferencia'); else perform app.exigir('log-transfer:create', 'Preparar una transferencia'); end if;
  -- Solo la sede que manda toca lo suyo
  perform app.exigir_mover(t.origen_id);

  -- El borrador es lo que prepara la sede: la lista, el motivo, las cajas, el transporte y la fecha de llegada
  if t.estado = 'Borrador' then
    v_origen := case when p ? 'origen_id' then coalesce(app.jtexto(p, 'origen_id'), t.origen_id) else t.origen_id end;
    v_destino := case when p ? 'destino_id' then coalesce(app.jtexto(p, 'destino_id'), t.destino_id) else t.destino_id end;
    perform app.validar_ruta_transferencia(v_origen, v_destino);
    if v_origen <> t.origen_id then perform app.exigir_mover(v_origen); end if;
    if p ? 'motivo' and app.jtexto(p, 'motivo') is null then raise exception 'Por favor complete los campos obligatorios (*) y agregue al menos un artículo.' using errcode = 'EN001'; end if;
    if p ? 'lineas' then perform app.validar_detalle(coalesce(p->'lineas', '[]'::jsonb), '[]'::jsonb); end if;
    update public.transferencias x set
      fecha = case when p ? 'fecha' then coalesce(nullif(p->>'fecha', '')::date, x.fecha) else x.fecha end,
      origen_sede_id = v_origen,
      destino_sede_id = case when app.ubicacion_es_almacen(v_destino) then null else v_destino end,
      destino_almacen_id = case when app.ubicacion_es_almacen(v_destino) then v_destino else null end,
      lineas = case when p ? 'lineas' then coalesce(p->'lineas', '[]'::jsonb) else x.lineas end,
      -- Al cambiar la lista sin mandar cajas, las cajas se vuelven a armar: no quedan cajas que no sumen la lista
      cajas = case when p ? 'cajas' then coalesce(p->'cajas', '[]'::jsonb) when p ? 'lineas' then '[]'::jsonb else x.cajas end,
      motivo = case when p ? 'motivo' then coalesce(app.jtexto(p, 'motivo'), '') else x.motivo end,
      observacion = case when p ? 'observacion' then app.jtexto(p, 'observacion') else x.observacion end,
      metodo_envio_id = case when p ? 'metodo_envio_id' then app.jtexto(p, 'metodo_envio_id') else x.metodo_envio_id end,
      courier_id = case when p ? 'courier_id' then app.jtexto(p, 'courier_id') else x.courier_id end,
      numero_guia = case when p ? 'numero_guia' then app.jtexto(p, 'numero_guia') else x.numero_guia end,
      referencia_adicional = case when p ? 'referencia_adicional' then app.jtexto(p, 'referencia_adicional') else x.referencia_adicional end,
      viajero_nombre = case when p ? 'viajero_nombre' then app.jtexto(p, 'viajero_nombre') else x.viajero_nombre end,
      viajero_documento = case when p ? 'viajero_documento' then app.jtexto(p, 'viajero_documento') else x.viajero_documento end,
      observacion_envio = case when p ? 'observacion_envio' then app.jtexto(p, 'observacion_envio') else x.observacion_envio end,
      observacion_interna_logistica = case when p ? 'observacion_interna_logistica' then app.jtexto(p, 'observacion_interna_logistica') else x.observacion_interna_logistica end,
      eta = case when p ? 'eta' then nullif(p->>'eta', '')::date else x.eta end,
      adjuntos = case when p ? 'adjuntos' then coalesce(array(select jsonb_array_elements_text(coalesce(p->'adjuntos', '[]'::jsonb))), '{}') else x.adjuntos end,
      actualizado_por = app.quien(null), actualizado_en = now()
    where x.id = p_id returning * into t;
    perform app.transferencia_validar_solicitud(t);
    if p ? 'lineas' or p ? 'cajas' then perform app.validar_detalle(t.lineas, t.cajas); end if;
    return;
  end if;

  -- Ya salió: solo se habilita la recepción manual (quien la manda avisa que llegó antes de la fecha de llegada)
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
  -- El destino puede haberse inactivado desde que se preparó
  perform app.validar_ruta_transferencia(t.origen_id, t.destino_id);
  if t.metodo_envio_id is null or t.eta is null then raise exception 'Por favor complete el método de envío y la fecha de llegada.' using errcode = 'EN001'; end if;
  perform app.validar_transporte(t.metodo_envio_id, t.courier_id, t.numero_guia, t.viajero_nombre, t.observacion_envio, false);
  perform app.validar_detalle(t.lineas, t.cajas);
  perform app.mover_lineas(t.origen_id, t.lineas, -1, 'Transferencia Salida', t.id, 'Despacho TRF: ' || t.id);
  update public.transferencias x set estado = 'En tránsito', despachado_en = now(), despachado_por = app.quien(null),
    actualizado_por = app.quien(null), actualizado_en = now() where x.id = p_id;
end;
$$;

-- La firma cambia (se suma el motivo de la cancelación): se quita la anterior para que no quede una segunda con las reglas de antes
drop function public.cambiar_estado_transferencia(text, text);
create function public.cambiar_estado_transferencia(p_id text, p_estado text, p_observacion text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  t public.transferencias;
begin
  select * into t from public.transferencias x where x.id = p_id for update;
  if not found then raise exception 'Transferencia no encontrada.' using errcode = 'EN001'; end if;

  if p_estado = 'En tránsito' and t.estado = 'Borrador' then
    perform app.exigir('log-transfer:dispatch', 'Despachar transferencia');
    perform app.despachar_transferencia(p_id);
  elsif p_estado = 'Listo para recepción' and t.estado = 'En tránsito' then
    perform app.exigir('log-transfer:dispatch', 'Despachar transferencia');
    perform app.exigir_mover(t.origen_id);
    update public.transferencias x set estado = p_estado, actualizado_por = app.quien(null), actualizado_en = now() where x.id = p_id;
  elsif p_estado = 'Cancelada' and t.estado = 'Borrador' then
    if not (app.permite('log-transfer:create') or app.permite('log-transfer:dispatch')) then
      raise exception 'Su rol no tiene ninguna de estas funciones: «Preparar una transferencia» o «Despachar transferencia».' using errcode = 'EN001';
    end if;
    perform app.exigir_mover(t.origen_id);
    update public.transferencias x set estado = p_estado, actualizado_por = app.quien(null), actualizado_en = now() where x.id = p_id;
  elsif p_estado = 'Cancelada' and t.estado in ('En tránsito', 'Listo para recepción') then
    perform app.exigir('log-transfer:dispatch', 'Despachar transferencia');
    perform app.exigir_mover(t.origen_id);
    if length(btrim(coalesce(p_observacion, ''))) < 5 then
      raise exception 'Indique el motivo de la cancelación (al menos 5 letras): lo que salió vuelve a la sede de origen.' using errcode = 'EN001';
    end if;
    perform app.mover_lineas(t.origen_id, t.lineas, 1, 'Ingreso', t.id, 'Cancelación TRF: ' || t.id);
    update public.transferencias x set estado = p_estado, motivo_cancelacion = btrim(p_observacion), actualizado_por = app.quien(null), actualizado_en = now() where x.id = p_id;
  else
    raise exception 'Una transferencia «%» no puede pasar a «%».', t.estado, p_estado using errcode = 'EN001';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- 5) La lista de sedes que puede ver cualquier cuenta (para elegir y nombrar el otro extremo de una transferencia)
-- ---------------------------------------------------------------------------------------------------------------------

create function public.directorio_sedes() returns table (id text, nombre text, estado text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not app.acceso_vigente() then
    raise exception 'Su cuenta no puede consultar esto.' using errcode = 'EN001';
  end if;
  return query select s.id, s.nombre, s.estado from public.sedes s order by s.id;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- 6) Funciones del registro: «Solicitar transferencia» → «Preparar una transferencia»; «Aprobar transferencia» desaparece
-- ---------------------------------------------------------------------------------------------------------------------

-- Quien podía solicitar transferencias ahora las prepara y las despacha (cada sede responde por lo que manda)
insert into public.rol_funciones (rol_id, funcion_id)
select rf.rol_id, f.funcion from public.rol_funciones rf, (values ('log-transfer:create'), ('log-transfer:dispatch')) as f (funcion)
where rf.funcion_id = 'log-transfer:req_transfer'
on conflict do nothing;
delete from public.rol_funciones where funcion_id in ('log-transfer:req_transfer', 'log-transfer:approve_transfer');

-- Los eventos de aviso que ya no existen (si algún aviso los nombrara, se conservan)
delete from public.aviso_eventos e
 where e.id in ('transfer_requested', 'transfer_decided') and not exists (select 1 from public.avisos a where a.evento = e.id);

-- ---------------------------------------------------------------------------------------------------------------------
-- 7) Tiempo real y permisos
-- ---------------------------------------------------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'transferencias') then
      alter publication supabase_realtime add table public.transferencias;
    end if;
  end if;
end;
$$;

revoke execute on function public.cambiar_estado_transferencia(text, text, text), public.directorio_sedes() from public, anon;
grant execute on function public.cambiar_estado_transferencia(text, text, text), public.directorio_sedes() to authenticated;
revoke execute on all functions in schema app from public, anon;
grant execute on all functions in schema app to authenticated;

commit;
