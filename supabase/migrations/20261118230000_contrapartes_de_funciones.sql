-- =====================================================================================================================
-- 0028 · Las contrapartes que el navegador no puede ver + «fecha de llegada» en lugar de «ETA»
-- ---------------------------------------------------------------------------------------------------------------------
-- 1) El problema. Al crear un envío, el sistema comprueba que alguien pueda recibirlo en la sede destino (la función «Confirmar recepción» en esa sede). Esa
--    comprobación la hacía el navegador con las cuentas y los roles que él mismo leía; pero una cuenta común (por ejemplo, la de Logística del almacén)
--    solo lee su propia cuenta y su propio rol (`cuentas_leer`, `roles_leer`, `rol_funciones_leer`), así que NO veía a quien recibe en Chiclayo y avisaba
--    «Nadie tiene «Confirmar la recepción de un envío» en Chiclayo» aunque esa persona existiera. Solo funcionaba con el Superusuario, que lo lee todo.
--    La misma regla que ya se resolvió en la base para los avisos (migración 0026): lo que depende de TODAS las cuentas lo calcula la base.
--    · `contrapartes_de_funciones(funciones)` entrega, por cada función pedida, DÓNDE hay al menos una cuenta activa (rol activo, sin el Superusuario) que la
--      tiene: el id de una sede, el de un almacén o «*» (alcanza todas las sedes). **No entrega nombres, correos ni ids de cuentas**: solo función y lugar.
--      La puede llamar cualquier cuenta con acceso vigente (para decidir si ofrece crear un envío no hace falta ver a las demás cuentas).
-- 2) La recepción dice «fecha de llegada». Se reemplaza `confirmar_recepcion` (migración 0027) con los textos de sus avisos sin la sigla «ETA» y con la hora en
--    12 horas («6 p. m.»); la regla y lo demás quedan igual (función del registro, mover stock del destino, incidencias, todo o nada).
-- Para deshacer: supabase/deshacer/20261118230000_contrapartes_de_funciones.down.sql
-- =====================================================================================================================

begin;

-- ---------------------------------------------------------------------------------------------------------------------
-- Dónde hay cuentas con cada función
-- ---------------------------------------------------------------------------------------------------------------------

-- p_funciones: ids de funciones del registro (hasta 60). Devuelve (funcion_id, lugar_id): lugar_id es una sede (FIL-…), un almacén (ALM-…) o '*' (alcanza todas las sedes,
-- por la función «Alcanzar todas las sedes» del rol o por la marca «Todas» de la cuenta, igual que `app.ve_sede`).
create function public.contrapartes_de_funciones(p_funciones text[])
returns table (funcion_id text, lugar_id text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not app.acceso_vigente() then
    raise exception 'Su cuenta no puede consultar esto.' using errcode = 'EN001';
  end if;
  if p_funciones is null or cardinality(p_funciones) = 0 then
    return;
  end if;
  if cardinality(p_funciones) > 60 then
    raise exception 'Se pidieron demasiadas funciones.' using errcode = 'EN001';
  end if;
  return query
  with titulares as (
    select c.id, c.rol_id, c.todas_las_sedes
    from public.cuentas c join public.roles r on r.id = c.rol_id
    where c.estado = 'Activo' and r.estado = 'Activo' and not r.es_sistema
  ),
  tienen as (
    select t.id, rf.funcion_id, t.todas_las_sedes
    from titulares t join public.rol_funciones rf on rf.rol_id = t.rol_id
    where rf.funcion_id = any (p_funciones)
  )
  select distinct x.funcion_id, x.lugar_id
  from (
    select h.funcion_id, '*'::text as lugar_id
    from tienen h
    where h.todas_las_sedes
       or exists (select 1 from public.cuentas c2 join public.rol_funciones a on a.rol_id = c2.rol_id where c2.id = h.id and a.funcion_id = 'org-alcance:all_branches')
    union all
    select h.funcion_id, cs.sede_id from tienen h join public.cuenta_sedes cs on cs.cuenta_id = h.id
    union all
    select h.funcion_id, ca.almacen_id from tienen h join public.cuenta_almacenes ca on ca.cuenta_id = h.id
  ) x;
end;
$$;
comment on function public.contrapartes_de_funciones(text[]) is 'Dónde hay al menos una cuenta activa (sin el Superusuario) con cada función pedida: sede, almacén o * (todas las sedes). No entrega nombres ni ids de cuentas.';

revoke execute on function public.contrapartes_de_funciones(text[]) from public, anon;
grant execute on function public.contrapartes_de_funciones(text[]) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- La recepción, con los textos «fecha de llegada»
-- ---------------------------------------------------------------------------------------------------------------------

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
  -- (recepción manual) o lo marca «Listo para recepción». Es lo mismo que dice `receptionWindow` del sistema (con las mismas palabras: «fecha de llegada»).
  if v_estado <> 'Listo para recepción' and not coalesce(v_manual, false) then
    if v_eta is null then
      raise exception 'Este documento no tiene fecha de llegada: pida a Logística que la registre o que habilite la recepción manual.' using errcode = 'EN001';
    end if;
    v_desde := case when v_eta_hora is not null then v_eta + v_eta_hora::time else v_eta::timestamp end;
    if v_desde > (now() at time zone 'America/Lima') then
      raise exception 'La recepción se habilita desde la fecha de llegada (%). Si llegó antes, pida a Logística que habilite la recepción manual.',
        to_char(v_desde, 'DD/MM/YYYY') || case when v_eta_hora is not null then ' ' || to_char(v_desde, 'FMHH12')
          || case when extract(minute from v_desde) <> 0 then ':' || to_char(v_desde, 'MI') else '' end
          || case when extract(hour from v_desde) >= 12 then ' p. m.' else ' a. m.' end else '' end using errcode = 'EN001';
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
