-- =====================================================================================================================
-- Deshacer 0018 · Solicitudes y correcciones de matrículas (Lote 9B)
-- ---------------------------------------------------------------------------------------------------------------------
-- Quita las dos tablas nuevas (con lo que tengan: las solicitudes y las correcciones guardadas se pierden) y devuelve la función
-- `aplicar_cambios_matricula` y la lista de acciones `app.acciones_dinero()` a como estaban en la 0015.
-- =====================================================================================================================

begin;

-- Las funciones de la 0015 (sin las tablas nuevas)
create or replace function app.acciones_dinero() returns jsonb
language sql immutable set search_path = '' as $$
  select '{
    "matricular":          { "mensaje": "matricular", "funciones": ["op-matriculas:create", "op-matriculas:renew"], "tablas": { "grupos": "i", "matriculas": "i", "planes": "i", "pagos": "i", "movimientos": "i" }, "mov_nuevo": "Ingreso" },
    "cobrar":              { "mensaje": "registrar pagos", "funciones": ["op-pagos:register"], "tablas": { "planes": "u", "pagos": "i", "movimientos": "i" }, "mov_nuevo": "Ingreso" },
    "refinanciar":         { "mensaje": "refinanciar cuotas", "funciones": ["op-cobranza:refinance"], "tablas": { "planes": "u" } },
    "mora":                { "mensaje": "cobrar mora", "funciones": ["op-cobranza:charge_mora"], "tablas": { "planes": "u" } },
    "reversar_pago":       { "mensaje": "reversar pagos", "funciones": ["op-pagos:reverse_payment"], "tablas": { "planes": "u", "pagos": "u", "movimientos": "iu", "notas": "i" }, "extra": { "notas": "op-pagos:credit_note" }, "mov_nuevo": "Egreso" },
    "reversar_movimiento": { "mensaje": "reversar movimientos de caja", "funciones": ["op-caja:reverse_movement"], "tablas": { "movimientos": "u" }, "stock": ["reponer"] },
    "deposito":            { "mensaje": "crear lotes de depósito", "funciones": ["op-caja:deposit"], "tablas": { "movimientos": "iu" }, "mov_nuevo": "Egreso" },
    "ingreso_caja":        { "mensaje": "registrar ingresos de caja", "funciones": ["op-caja:reg_income"], "tablas": { "movimientos": "i" }, "mov_nuevo": "Ingreso" },
    "egreso_caja":         { "mensaje": "registrar egresos de caja", "funciones": ["op-caja:reg_expense"], "tablas": { "movimientos": "i" }, "mov_nuevo": "Egreso" },
    "venta":               { "mensaje": "vender artículos en caja", "funciones": ["op-caja:sell_item"], "tablas": { "movimientos": "i" }, "mov_nuevo": "Ingreso", "stock": ["vender"] },
    "caida":               { "mensaje": "aprobar caídas", "funciones": ["op-matriculas:approve_drop"], "tablas": { "matriculas": "u", "planes": "u" } },
    "reactivacion":        { "mensaje": "aprobar reactivaciones", "funciones": ["op-matriculas:approve_reactivation"], "tablas": { "matriculas": "u", "planes": "u" } },
    "cambio_programa":     { "mensaje": "aprobar cambios de programa", "funciones": ["op-matriculas:approve_program_change"], "tablas": { "matriculas": "u", "planes": "u" } },
    "traslado":            { "mensaje": "aprobar traslados de sede", "funciones": ["op-matriculas:approve_transfer"], "tablas": { "matriculas": "u" } },
    "corregir":            { "mensaje": "corregir datos de la matrícula", "funciones": ["op-matriculas:edit_data"], "tablas": { "matriculas": "u" } },
    "extension":           { "mensaje": "habilitar la extensión", "funciones": ["op-matriculas:extend"], "tablas": { "matriculas": "u" } },
    "documentos":          { "mensaje": "generar contratos y fichas", "funciones": ["op-matriculas:documents"], "tablas": { "matriculas": "u" } },
    "verificacion":        { "mensaje": "registrar la entrega de materiales", "funciones": ["op-verificacion:deliver"], "tablas": { "matriculas": "u" }, "stock": ["entregar"] }
  }'::jsonb;
$$;

create or replace function public.aplicar_cambios_matricula(p_accion text, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_conf       jsonb;
  v_funcs      text[];
  v_fila       jsonb;
  v_perm       text;
  v_extra      text;
  v_stock      jsonb;
  v_op         text;
  v_grupos     text[] := '{}';
  v_matriculas text[] := '{}';
  v_planes     text[] := '{}';
  v_pagos      text[] := '{}';
  v_movs       text[] := '{}';
  v_notas      text[] := '{}';
  v_vieja      text;
  v_nueva      text;
  v_restr      text;
begin
  v_conf := app.acciones_dinero() -> p_accion;
  if v_conf is null then raise exception 'La operación «%» no existe.', coalesce(p_accion, '') using errcode = 'EN001'; end if;
  if jsonb_typeof(p) is distinct from 'object' then raise exception 'No hay cambios para guardar.' using errcode = 'EN001'; end if;

  select array_agg(f) into v_funcs from jsonb_array_elements_text(v_conf->'funciones') f;
  perform app.exigir_alguna(v_funcs, 'Su rol no puede ' || (v_conf->>'mensaje') || ': falta la función correspondiente.');

  -- Qué tablas puede tocar esta acción
  foreach v_op in array array['grupos', 'matriculas', 'planes', 'pagos', 'movimientos', 'notas'] loop
    if jsonb_typeof(p->v_op) = 'array' and jsonb_array_length(p->v_op) > 0 then
      if v_conf->'tablas'->>v_op is null then
        raise exception 'Esta operación no puede modificar % (%).', case v_op when 'grupos' then 'los grupos promocionales' when 'matriculas' then 'las matrículas'
          when 'planes' then 'los planes' when 'pagos' then 'los pagos' when 'movimientos' then 'la caja' else 'las notas de crédito' end, p_accion using errcode = 'EN001';
      end if;
      v_extra := v_conf->'extra'->>v_op;
      if v_extra is not null then perform app.exigir(v_extra, 'Emitir o registrar notas de crédito'); end if;
    end if;
  end loop;

  -- El stock que esta acción puede mover (cada función de stock vuelve a pedir la suya y a comprobar la sede)
  if jsonb_typeof(p->'stock') = 'array' then
    for v_stock in select * from jsonb_array_elements(p->'stock') loop
      v_op := v_stock->>'op';
      if not coalesce((v_conf->'stock') ? v_op, false) then
        raise exception 'Esta operación no puede mover stock (%).', coalesce(v_op, '') using errcode = 'EN001';
      end if;
      if v_op = 'vender' then
        perform public.vender_articulo(v_stock->>'sede', v_stock->>'articulo', (v_stock->>'cantidad')::integer, v_stock->>'documento', v_stock->>'observacion');
      elsif v_op = 'reponer' then
        perform public.reponer_por_reversa(v_stock->>'sede', v_stock->>'articulo', (v_stock->>'cantidad')::integer, v_stock->>'movimiento');
      elsif v_op = 'entregar' then
        perform public.entregar_materiales(v_stock->>'sede', v_stock->>'matricula', v_stock->>'alumno', v_stock->'lineas');
      end if;
    end loop;
  end if;

  -- 1. Grupos promocionales
  for v_fila in select * from jsonb_array_elements(coalesce(p->'grupos', '[]'::jsonb)) loop
    perform app.aplicar_fila('grupos_promocionales', v_fila, array['id'], v_conf->'tablas'->>'grupos');
    v_grupos := v_grupos || (v_fila->>'id');
  end loop;

  -- 2. Matrículas (la sede de antes y la de después deben ser alcanzables: un traslado necesita ambas). Un cambio solo trae las columnas que
  --    cambiaron: si no trae la sede, es la que ya tiene la fila.
  for v_fila in select * from jsonb_array_elements(coalesce(p->'matriculas', '[]'::jsonb)) loop
    select m.sede_id into v_vieja from public.matriculas m where m.id = v_fila->>'id';
    if v_vieja is not null then perform app.exigir_sede(v_vieja, 'matrículas'); end if;
    v_nueva := case when v_fila ? 'sede_id' then v_fila->>'sede_id' else v_vieja end;
    perform app.exigir_sede(v_nueva, 'matrículas');
    perform app.aplicar_fila('matriculas', v_fila, array['id'], v_conf->'tablas'->>'matriculas');
    v_matriculas := v_matriculas || (v_fila->>'id');
  end loop;

  -- 3. Planes y sus cuotas (la sede es la de la matrícula)
  for v_fila in select * from jsonb_array_elements(coalesce(p->'planes', '[]'::jsonb)) loop
    perform app.exigir_sede((select m.sede_id from public.matriculas m
      where m.id = case when v_fila ? 'matricula_id' then v_fila->>'matricula_id' else (select pl.matricula_id from public.planes pl where pl.id = v_fila->>'id') end), 'planes de pago');
    perform app.aplicar_fila('planes', v_fila, array['id'], v_conf->'tablas'->>'planes');
    if v_fila ? 'cuotas' then perform app.aplicar_cuotas(v_fila->>'id', v_fila->'cuotas'); end if;
    v_planes := v_planes || (v_fila->>'id');
  end loop;

  -- 4. Pagos
  for v_fila in select * from jsonb_array_elements(coalesce(p->'pagos', '[]'::jsonb)) loop
    perform app.exigir_sede(case when v_fila ? 'sede_id' then v_fila->>'sede_id' else (select pg.sede_id from public.pagos pg where pg.id = v_fila->>'id') end, 'pagos');
    perform app.aplicar_fila('pagos', v_fila, array['id'], v_conf->'tablas'->>'pagos');
    v_pagos := v_pagos || (v_fila->>'id');
  end loop;

  -- 5. Movimientos de caja
  for v_fila in select * from jsonb_array_elements(coalesce(p->'movimientos', '[]'::jsonb)) loop
    perform app.exigir_sede(case when v_fila ? 'sede_id' then v_fila->>'sede_id' else (select mc.sede_id from public.movimientos_caja mc where mc.id = v_fila->>'id') end, 'movimientos de caja');
    -- Un movimiento NUEVO es del tipo que esa acción registra (un ingreso no se cuela por la acción de egresos)
    if not exists (select 1 from public.movimientos_caja mc where mc.id = v_fila->>'id')
       and coalesce(v_fila->>'tipo', '') is distinct from (v_conf->>'mov_nuevo') then
      raise exception 'Esta operación solo registra movimientos de caja de tipo %.', lower(coalesce(v_conf->>'mov_nuevo', 'ninguno')) using errcode = 'EN001';
    end if;
    perform app.aplicar_fila('movimientos_caja', v_fila, array['id'], v_conf->'tablas'->>'movimientos');
    v_movs := v_movs || (v_fila->>'id');
  end loop;

  -- 6. Notas de crédito
  for v_fila in select * from jsonb_array_elements(coalesce(p->'notas', '[]'::jsonb)) loop
    perform app.aplicar_fila('notas_credito', v_fila, array['id'], v_conf->'tablas'->>'notas');
    v_notas := v_notas || (v_fila->>'id');
  end loop;

  perform app.verificar_dinero(v_planes, v_pagos, v_movs, v_notas, v_grupos);
  return jsonb_build_object('ok', true);
exception
  when unique_violation then
    get stacked diagnostics v_restr = constraint_name;
    if v_restr like '%pkey' then
      raise exception 'Otra persona registró algo al mismo tiempo y el código ya está en uso. Vuelva a intentarlo.' using errcode = 'EN001';
    elsif v_restr = 'planes_matricula_id_key' then
      raise exception 'La matrícula ya tiene un plan de pagos.' using errcode = 'EN001';
    end if;
    raise exception 'Ya existe un registro con esos datos.' using errcode = 'EN001';
end;
$$;

drop policy if exists solicitudes_leer on public.solicitudes_matricula;
drop policy if exists correcciones_leer on public.correcciones_matricula;

drop table if exists public.correcciones_matricula;
drop table if exists public.solicitudes_matricula;

drop function if exists app.verificar_solicitudes(text[]);
drop function if exists app.puede_leer_solicitudes();
drop function if exists app.solicitud_guarda();
drop function if exists app.solicitud_no_se_borra();
drop function if exists app.correccion_inmutable();
drop function if exists app.solicitudes_no_se_vacian();

commit;
