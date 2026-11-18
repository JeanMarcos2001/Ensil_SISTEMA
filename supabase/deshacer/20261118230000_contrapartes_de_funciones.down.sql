-- Deshace la migración 0028: quita `contrapartes_de_funciones` y vuelve a la función `confirmar_recepcion` de la migración 0027 (con los textos que decían «ETA»).
begin;

drop function if exists public.contrapartes_de_funciones(text[]);

-- `p_lineas`: lista de {articulo_id, cantidad, estado ('ok' | 'missing' | 'damaged' | 'extra'), observacion}. Suma al stock del destino lo recibido,
-- registra una incidencia por cada diferencia y deja el documento recibido (con o sin diferencias). Todo o nada; solo sobre un documento en tránsito.
create or replace function public.confirmar_recepcion(p_tipo text, p_doc text, p_lineas jsonb, p_observacion text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_destino    text;
  v_estado     text;
  v_lineas     jsonb;
  v_linea      jsonb;
  v_vistos     text[] := '{}';
  v_cant       numeric;
  v_esperada   integer;
  v_estado_li  text;
  v_dif        boolean := false;
  v_final      text;
  v_alm        boolean;
  v_eta        date;
  v_eta_hora   text;
  v_manual     boolean;
  v_desde      timestamp;
begin
  if p_tipo = 'Envío' then
    perform app.exigir('log-recepciones:confirm', 'Confirmar la recepción de un envío');
    select e.sede_destino_id, e.estado, e.lineas, e.eta, e.eta_hora, e.habilitar_recepcion_manual into v_destino, v_estado, v_lineas, v_eta, v_eta_hora, v_manual
      from public.envios e where e.id = p_doc for update;
  elsif p_tipo = 'Transferencia' then
    perform app.exigir('log-transfer:receive', 'Recepcionar transferencia');
    select t.destino_id, t.estado, t.lineas, t.eta, null::text, t.habilitar_recepcion_manual into v_destino, v_estado, v_lineas, v_eta, v_eta_hora, v_manual
      from public.transferencias t where t.id = p_doc for update;
  else
    raise exception 'No se encontró el documento a recepcionar.' using errcode = 'EN001';
  end if;
  if v_estado is null then raise exception 'No se encontró el documento a recepcionar.' using errcode = 'EN001'; end if;
  if v_estado not in ('En tránsito', 'Listo para recepción') then
    raise exception 'El % % está «%»: solo se recibe lo que está en tránsito.', lower(p_tipo), p_doc, v_estado using errcode = 'EN001';
  end if;
  -- Solo desde la fecha (y hora) estimada de llegada (hora de Lima): antes el documento solo se ve. Si llegó antes, Logística la habilita a mano
  -- (recepción manual) o lo marca «Listo para recepción». Es lo mismo que dice `receptionWindow` del sistema.
  if v_estado <> 'Listo para recepción' and not coalesce(v_manual, false) then
    if v_eta is null then
      raise exception 'Este documento no tiene fecha de llegada (ETA): pida a Logística que la registre o que habilite la recepción manual.' using errcode = 'EN001';
    end if;
    v_desde := case when v_eta_hora is not null then v_eta + v_eta_hora::time else v_eta::timestamp end;
    if v_desde > (now() at time zone 'America/Lima') then
      raise exception 'Todavía no llega la fecha estimada de llegada (ETA: %). La recepción se habilita desde ese momento; si llegó antes, pida a Logística que habilite la recepción manual.',
        to_char(v_desde, 'DD/MM/YYYY') || case when v_eta_hora is not null then ' ' || to_char(v_desde, 'HH24:MI') else '' end using errcode = 'EN001';
    end if;
  end if;
  perform app.exigir_mover(v_destino);
  v_alm := app.ubicacion_es_almacen(v_destino);
  if jsonb_typeof(p_lineas) is distinct from 'array' or jsonb_array_length(p_lineas) = 0 then raise exception 'Indique lo que se recibió.' using errcode = 'EN001'; end if;

  -- Primero se revisa todo
  for v_linea in select * from jsonb_array_elements(p_lineas) loop
    v_cant := case when jsonb_typeof(v_linea->'cantidad') = 'number' then (v_linea->>'cantidad')::numeric else null end;
    v_estado_li := coalesce(v_linea->>'estado', 'ok');
    if coalesce(v_linea->>'articulo_id', '') = '' or v_cant is null or v_cant < 0 or v_cant <> trunc(v_cant) then
      raise exception 'Cada artículo recibido necesita su cantidad (un entero de 0 en adelante).' using errcode = 'EN001';
    end if;
    if v_estado_li not in ('ok', 'missing', 'damaged', 'extra') then raise exception 'El estado de un artículo recibido no es válido.' using errcode = 'EN001'; end if;
    if (v_linea->>'articulo_id') = any (v_vistos) then raise exception 'Hay artículos repetidos en la recepción.' using errcode = 'EN001'; end if;
    v_vistos := v_vistos || (v_linea->>'articulo_id');
    if not exists (select 1 from public.articulos a where a.id = v_linea->>'articulo_id') then raise exception 'Un artículo recibido no existe en el catálogo.' using errcode = 'EN001'; end if;
    v_esperada := coalesce((select (l->>'cantidad')::integer from jsonb_array_elements(v_lineas) l where l->>'articulo_id' = v_linea->>'articulo_id'), 0);
    if v_estado_li <> 'ok' or v_cant::integer <> v_esperada then v_dif := true; end if;
  end loop;
  v_final := case when p_tipo = 'Envío' then case when v_dif then 'Recibido con diferencias' else 'Recibido' end
                  else case when v_dif then 'Recibida con diferencias' else 'Recibida' end end;

  -- El origen ya se descontó al despachar: aquí solo se suma lo recibido al destino y se anotan las diferencias
  for v_linea in select * from jsonb_array_elements(p_lineas) loop
    v_cant := (v_linea->>'cantidad')::numeric;
    v_estado_li := coalesce(v_linea->>'estado', 'ok');
    v_esperada := coalesce((select (l->>'cantidad')::integer from jsonb_array_elements(v_lineas) l where l->>'articulo_id' = v_linea->>'articulo_id'), 0);
    if v_estado_li <> 'ok' then
      insert into public.incidencias_recepcion (doc_tipo, doc_id, articulo_id, tipo, cantidad, observacion, sede_id, almacen_id)
      values (p_tipo, p_doc, v_linea->>'articulo_id', v_estado_li, case when v_estado_li = 'missing' then greatest(v_esperada - v_cant::integer, 0) else v_cant::integer end,
        coalesce(btrim(v_linea->>'observacion'), ''), case when v_alm then null else v_destino end, case when v_alm then v_destino else null end);
    end if;
    if v_cant > 0 then
      perform app.mover_stock(v_destino, v_linea->>'articulo_id', v_cant::integer, case when p_tipo = 'Envío' then 'Ingreso' else 'Transferencia Entrada' end, p_doc,
        'Recepción de ' || p_tipo || ' ' || p_doc || '. Estado: ' || v_estado_li || '. ' || coalesce(btrim(v_linea->>'observacion'), ''));
    end if;
  end loop;

  if p_tipo = 'Envío' then
    update public.envios e set estado = v_final, recepcion_observacion = app.jtexto(jsonb_build_object('o', p_observacion), 'o'), recepcion_fecha = now(),
      recibido_por = app.quien(null), actualizado_por = app.quien(null), actualizado_en = now() where e.id = p_doc;
  else
    update public.transferencias t set estado = v_final, recepcion_observacion = app.jtexto(jsonb_build_object('o', p_observacion), 'o'), recepcion_fecha = now(),
      recibido_por = app.quien(null), actualizado_por = app.quien(null), actualizado_en = now() where t.id = p_doc;
  end if;
end;
$$;

comment on function public.confirmar_recepcion(text, text, jsonb, text) is 'Confirma la recepción de un envío o de una transferencia en tránsito: suma lo recibido al stock del destino y anota las diferencias. Solo desde la fecha (y hora) estimada de llegada, salvo recepción manual o «Listo para recepción». Todo o nada.';

commit;
