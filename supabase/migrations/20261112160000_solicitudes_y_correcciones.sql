-- =====================================================================================================================
-- 0018 · Solicitudes y correcciones de matrículas en la base (Lote 9B)
-- ---------------------------------------------------------------------------------------------------------------------
--   · `solicitudes_matricula`: las solicitudes de caída, reactivación, cambio de programa y traslado de sede, con su historial (quién pidió, quién
--     resolvió, cuándo, por qué y qué efectos tuvo). UNA tabla para las cuatro clases (`tipo`): caída = `CAI-NNN`, las demás = `SOL-NNN`. Nace
--     pendiente y después solo se aprueba o se rechaza; una resuelta no vuelve a cambiar y nada se borra.
--   · `correcciones_matricula`: el registro de las correcciones que se hacen a una matrícula (un campo, su valor de antes y de después y el motivo).
--     Solo se agrega: un error se corrige con otra corrección.
--   · Las dos tablas se escriben dentro de la MISMA operación atómica que ya guarda la matrícula y el dinero (`aplicar_cambios_matricula`, 0015):
--     una aprobación y su efecto (la matrícula y el plan) quedan guardados juntos o no se guarda nada. La función se amplía con acciones nuevas
--     (pedir y rechazar cada tipo de solicitud) y con las tablas nuevas en las acciones que ya existían (caída, reactivación, cambio de programa,
--     traslado y corregir).
--   · Lo derivable no se guarda: el alumno de una solicitud sale de su matrícula. Quién y cuándo pidieron y resolvieron salen de la cuenta con la que se
--     inició sesión, no de la pantalla (sin sesión, el editor SQL, se respeta lo indicado para cargar los datos de partida).
--   · Quien pidió una solicitud no la resuelve (salvo el Superusuario): ahora también lo exige la base, comparando la cuenta.
--   · Quién ve: por sede (`app.ve_matricula`). Las solicitudes, con las funciones que en el registro leen «Solicitud sobre una matrícula» y las
--     correcciones, con las que leen matrículas (check-requests-db.ts compara estas listas con el registro).
-- Los errores de negocio usan el código EN001: el sistema muestra su texto tal cual (está en español).
-- Para deshacer: supabase/deshacer/20261112160000_solicitudes_y_correcciones.down.sql
-- =====================================================================================================================

begin;

-- ---------------------------------------------------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------------------------------------------------

create table public.solicitudes_matricula (
  id                 text primary key check (id ~ '^(CAI|SOL)-[0-9]{3,}$'),
  tipo               text not null check (tipo in ('Caída', 'Reactivación', 'Cambio de programa', 'Traslado de sede')),
  matricula_id       text not null references public.matriculas (id) on delete restrict,
  motivo             text not null check (btrim(motivo) <> ''),
  detalle            text not null default '',
  fecha_efecto       date,
  datos              jsonb not null default '{}'::jsonb,
  estado             text not null default 'Pendiente' check (estado in ('Pendiente', 'Aprobada', 'Rechazada')),
  resuelta_en        timestamptz,
  resuelta_por       text,
  nota_resolucion    text,
  efectos            jsonb,
  solicitante_cuenta uuid,
  creado_en          timestamptz not null default now(),
  creado_por         text,
  actualizado_en     timestamptz not null default now(),
  actualizado_por    text,
  -- Los códigos de caída son CAI-; los de los demás tipos, SOL-
  check ((tipo = 'Caída') = (id like 'CAI-%')),
  -- Lo propio de cada tipo
  check (tipo <> 'Caída' or (fecha_efecto is not null and datos = '{}'::jsonb)),
  check (tipo = 'Caída' or fecha_efecto is null),
  check (tipo <> 'Reactivación' or datos ? 'startDate'),
  check (tipo <> 'Cambio de programa' or datos ? 'programId'),
  check (tipo <> 'Traslado de sede' or datos ? 'branchId'),
  -- Pendiente = sin resolver; resuelta = con quién, cuándo y (si se aprobó) qué efectos tuvo; un rechazo explica por qué
  check ((estado = 'Pendiente') = (resuelta_en is null)),
  check ((estado = 'Pendiente') = (resuelta_por is null)),
  check ((estado = 'Aprobada') = (efectos is not null)),
  check (estado <> 'Rechazada' or length(btrim(coalesce(nota_resolucion, ''))) >= 5)
);
create index solicitudes_matricula_idx on public.solicitudes_matricula (matricula_id);
-- Una sola solicitud de caída pendiente por matrícula, y una sola de cambio (reactivación, programa o traslado), como en la pantalla
create unique index solicitudes_caida_pendiente_uq on public.solicitudes_matricula (matricula_id) where tipo = 'Caída' and estado = 'Pendiente';
create unique index solicitudes_cambio_pendiente_uq on public.solicitudes_matricula (matricula_id) where tipo <> 'Caída' and estado = 'Pendiente';
comment on table public.solicitudes_matricula is 'Solicitudes de caída, reactivación, cambio de programa y traslado de una matrícula. Nadie escribe directo: solo aplicar_cambios_matricula. Nace pendiente y después solo se aprueba o se rechaza.';
comment on column public.solicitudes_matricula.datos is 'Lo propio de cada tipo: Reactivación { startDate }; Cambio de programa { programId, levelId }; Traslado de sede { branchId, firstDate, firstTime }. Una caída usa fecha_efecto.';
comment on column public.solicitudes_matricula.efectos is 'Qué se hizo al aprobar (para el historial): en una caída, el resumen de efectos; en las demás, las líneas de texto.';
comment on column public.solicitudes_matricula.solicitante_cuenta is 'La cuenta que pidió la solicitud (para exigir que quien pide no resuelva).';

create table public.correcciones_matricula (
  id              text primary key check (id ~ '^COR-[0-9]{3,}$'),
  matricula_id    text not null references public.matriculas (id) on delete restrict,
  campo           text not null check (btrim(campo) <> ''),
  etiqueta        text not null check (btrim(etiqueta) <> ''),
  antes           text not null default '',
  despues         text not null default '',
  motivo          text not null check (btrim(motivo) <> ''),
  creado_en       timestamptz not null default now(),
  creado_por      text,
  actualizado_en  timestamptz not null default now(),
  actualizado_por text
);
create index correcciones_matricula_idx on public.correcciones_matricula (matricula_id);
comment on table public.correcciones_matricula is 'Registro de correcciones de una matrícula (un campo, su valor de antes y de después y el motivo). Solo se agrega: nadie escribe directo, solo aplicar_cambios_matricula.';

-- Quién y cuándo (misma huella que el resto del dinero, 0015)
create trigger solicitudes_huella  before insert or update on public.solicitudes_matricula  for each row execute function app.huella_dinero();
create trigger correcciones_huella before insert or update on public.correcciones_matricula for each row execute function app.huella_dinero();

-- ---------------------------------------------------------------------------------------------------------------------
-- Lo que no se cambia ni se borra
-- ---------------------------------------------------------------------------------------------------------------------

-- Una solicitud nace pendiente (con sesión) y después solo se resuelve, una vez; quién resolvió y cuándo salen de la cuenta; quien la pidió no la resuelve.
create function app.solicitud_guarda() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      if new.estado <> 'Pendiente' then
        raise exception 'Una solicitud nueva nace pendiente.' using errcode = 'EN001';
      end if;
      new.solicitante_cuenta := auth.uid();
    end if;
    return new;
  end if;

  if old.estado <> 'Pendiente' then
    raise exception 'Esta solicitud ya fue resuelta (%).', lower(old.estado) using errcode = 'EN001';
  end if;
  if (to_jsonb(old) - 'estado' - 'resuelta_en' - 'resuelta_por' - 'nota_resolucion' - 'efectos' - 'actualizado_en' - 'actualizado_por')
     is distinct from (to_jsonb(new) - 'estado' - 'resuelta_en' - 'resuelta_por' - 'nota_resolucion' - 'efectos' - 'actualizado_en' - 'actualizado_por') then
    raise exception 'Una solicitud no se modifica: solo se aprueba o se rechaza.' using errcode = 'EN001';
  end if;
  if new.estado = 'Pendiente' then
    raise exception 'Una solicitud pendiente solo se resuelve: se aprueba o se rechaza.' using errcode = 'EN001';
  end if;
  if new.estado = 'Rechazada' and length(btrim(coalesce(new.nota_resolucion, ''))) < 5 then
    raise exception 'Indique por qué se rechaza la solicitud.' using errcode = 'EN001';
  end if;
  if auth.uid() is not null then
    if old.solicitante_cuenta is not null and old.solicitante_cuenta = auth.uid() and not app.es_superusuario() then
      raise exception 'Quien pidió la solicitud no puede resolverla: debe hacerlo otra persona con autoridad.' using errcode = 'EN001';
    end if;
    new.resuelta_en := now();
    new.resuelta_por := app.quien(null);
  else
    new.resuelta_en := coalesce(new.resuelta_en, now());
    new.resuelta_por := coalesce(nullif(btrim(coalesce(new.resuelta_por, '')), ''), 'Sistema');
  end if;
  return new;
end;
$$;
create trigger solicitudes_guarda before insert or update on public.solicitudes_matricula for each row execute function app.solicitud_guarda();

create function app.solicitud_no_se_borra() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Una solicitud no se borra: queda resuelta, con su motivo.' using errcode = 'EN001';
end;
$$;
create trigger solicitudes_no_borrar before delete on public.solicitudes_matricula for each row execute function app.solicitud_no_se_borra();

create function app.correccion_inmutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Una corrección no se modifica ni se borra: si hubo un error, se corrige con otra corrección.' using errcode = 'EN001';
end;
$$;
create trigger correcciones_no_cambian before update or delete on public.correcciones_matricula for each row execute function app.correccion_inmutable();

create function app.solicitudes_no_se_vacian() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Las solicitudes y las correcciones no se vacían.' using errcode = 'EN001';
end;
$$;
create trigger solicitudes_no_vaciar  before truncate on public.solicitudes_matricula  for each statement execute function app.solicitudes_no_se_vacian();
create trigger correcciones_no_vaciar before truncate on public.correcciones_matricula for each statement execute function app.solicitudes_no_se_vacian();

-- ---------------------------------------------------------------------------------------------------------------------
-- Quién ve qué
-- ---------------------------------------------------------------------------------------------------------------------

-- Funciones que, en el registro, leen «Solicitud sobre una matrícula» (check-requests-db.ts compara esta lista con el registro).
create function app.puede_leer_solicitudes() returns boolean
language sql stable security definer set search_path = '' as $$
  select app.tiene_alguna(array['dash-resumen:view', 'op-matriculas:view', 'op-matriculas:approve_drop', 'op-matriculas:approve_reactivation', 'op-matriculas:approve_program_change',
    'op-matriculas:approve_transfer', 'rep-matriculas:view', 'sis-solicitudes:view']);
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Comprobaciones de lo que quedó (después de aplicar todo)
-- ---------------------------------------------------------------------------------------------------------------------

-- Una solicitud aprobada deja la matrícula como se aprobó: la caída, caída y nombrando esta solicitud (con su fecha); la reactivación, activa y
-- nombrándola; el cambio de programa, con el programa y el nivel pedidos; el traslado, en la sede pedida.
create function app.verificar_solicitudes(p_solicitudes text[]) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r record;
begin
  for r in
    select s.id, s.tipo, s.fecha_efecto, s.datos, m.estado as m_estado, m.caida_fecha, m.caida_solicitud, m.reactivacion_solicitud, m.programa_id, m.nivel_id, m.sede_id
    from public.solicitudes_matricula s join public.matriculas m on m.id = s.matricula_id
    where s.id = any (p_solicitudes) and s.estado = 'Aprobada'
  loop
    if r.tipo = 'Caída' and not (r.m_estado = 'Caída' and r.caida_solicitud = r.id and r.caida_fecha = r.fecha_efecto) then
      raise exception 'La aprobación de la solicitud % no cuadra: la matrícula debe quedar caída, desde la fecha pedida y nombrando esta solicitud.', r.id using errcode = 'EN001';
    elsif r.tipo = 'Reactivación' and not (r.m_estado = 'Activa' and r.reactivacion_solicitud = r.id) then
      raise exception 'La aprobación de la solicitud % no cuadra: la matrícula debe quedar activa y nombrando esta solicitud.', r.id using errcode = 'EN001';
    elsif r.tipo = 'Cambio de programa' and not (r.programa_id = r.datos->>'programId' and coalesce(r.nivel_id, '') = coalesce(r.datos->>'levelId', '')) then
      raise exception 'La aprobación de la solicitud % no cuadra: la matrícula debe quedar con el programa y el nivel pedidos.', r.id using errcode = 'EN001';
    elsif r.tipo = 'Traslado de sede' and not (r.sede_id = r.datos->>'branchId') then
      raise exception 'La aprobación de la solicitud % no cuadra: la matrícula debe quedar en la sede pedida.', r.id using errcode = 'EN001';
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Acciones: qué función pide cada una, qué tablas puede tocar ('i' = agregar filas nuevas, 'u' = cambiar las que ya existen), qué tipo de
-- movimiento de caja puede AGREGAR y qué movimientos de stock puede pedir (todo igual que en 0015). Nuevo: `sol_tipo` y `sol_estado` = con qué tipo de
-- solicitud trabaja la acción y en qué estado la deja (pedir = Pendiente; aprobar = Aprobada; rechazar = Rechazada). Una acción con `sol_tipo` trabaja
-- con UNA solicitud. check-money-db.ts y check-requests-db.ts comparan las funciones con el registro.
-- ---------------------------------------------------------------------------------------------------------------------
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
    "caida":               { "mensaje": "aprobar caídas", "funciones": ["op-matriculas:approve_drop"], "tablas": { "matriculas": "u", "planes": "u", "solicitudes": "u" }, "sol_tipo": "Caída", "sol_estado": "Aprobada" },
    "reactivacion":        { "mensaje": "aprobar reactivaciones", "funciones": ["op-matriculas:approve_reactivation"], "tablas": { "matriculas": "u", "planes": "u", "solicitudes": "u", "correcciones": "i" }, "sol_tipo": "Reactivación", "sol_estado": "Aprobada" },
    "cambio_programa":     { "mensaje": "aprobar cambios de programa", "funciones": ["op-matriculas:approve_program_change"], "tablas": { "matriculas": "u", "planes": "u", "solicitudes": "u", "correcciones": "i" }, "sol_tipo": "Cambio de programa", "sol_estado": "Aprobada" },
    "traslado":            { "mensaje": "aprobar traslados de sede", "funciones": ["op-matriculas:approve_transfer"], "tablas": { "matriculas": "u", "solicitudes": "u", "correcciones": "i" }, "sol_tipo": "Traslado de sede", "sol_estado": "Aprobada" },
    "corregir":            { "mensaje": "corregir datos de la matrícula", "funciones": ["op-matriculas:edit_data"], "tablas": { "matriculas": "u", "correcciones": "i" } },
    "extension":           { "mensaje": "habilitar la extensión", "funciones": ["op-matriculas:extend"], "tablas": { "matriculas": "u" } },
    "documentos":          { "mensaje": "generar contratos y fichas", "funciones": ["op-matriculas:documents"], "tablas": { "matriculas": "u" } },
    "verificacion":        { "mensaje": "registrar la entrega de materiales", "funciones": ["op-verificacion:deliver"], "tablas": { "matriculas": "u" }, "stock": ["entregar"] },
    "solicitar_caida":              { "mensaje": "solicitar caídas", "funciones": ["op-matriculas:req_drop"], "tablas": { "solicitudes": "i" }, "sol_tipo": "Caída", "sol_estado": "Pendiente" },
    "solicitar_reactivacion":       { "mensaje": "solicitar reactivaciones", "funciones": ["op-matriculas:req_reactivation"], "tablas": { "solicitudes": "i" }, "sol_tipo": "Reactivación", "sol_estado": "Pendiente" },
    "solicitar_cambio_programa":    { "mensaje": "solicitar cambios de programa", "funciones": ["op-matriculas:req_program_change"], "tablas": { "solicitudes": "i" }, "sol_tipo": "Cambio de programa", "sol_estado": "Pendiente" },
    "solicitar_traslado":           { "mensaje": "solicitar traslados de sede", "funciones": ["op-matriculas:req_transfer"], "tablas": { "solicitudes": "i" }, "sol_tipo": "Traslado de sede", "sol_estado": "Pendiente" },
    "rechazar_caida":               { "mensaje": "rechazar solicitudes de caída", "funciones": ["op-matriculas:approve_drop"], "tablas": { "solicitudes": "u" }, "sol_tipo": "Caída", "sol_estado": "Rechazada" },
    "rechazar_reactivacion":        { "mensaje": "rechazar solicitudes de reactivación", "funciones": ["op-matriculas:approve_reactivation"], "tablas": { "solicitudes": "u" }, "sol_tipo": "Reactivación", "sol_estado": "Rechazada" },
    "rechazar_cambio_programa":     { "mensaje": "rechazar solicitudes de cambio de programa", "funciones": ["op-matriculas:approve_program_change"], "tablas": { "solicitudes": "u" }, "sol_tipo": "Cambio de programa", "sol_estado": "Rechazada" },
    "rechazar_traslado":            { "mensaje": "rechazar solicitudes de traslado de sede", "funciones": ["op-matriculas:approve_transfer"], "tablas": { "solicitudes": "u" }, "sol_tipo": "Traslado de sede", "sol_estado": "Rechazada" }
  }'::jsonb;
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- La función pública: aplica los cambios de una acción, todo o nada (la de 0015 con las dos tablas nuevas).
--   p = { grupos: [fila], matriculas: [fila], planes: [fila + cuotas], pagos: [fila], movimientos: [fila], notas: [fila],
--         solicitudes: [fila], correcciones: [fila], stock: [{ op: 'vender' | 'reponer' | 'entregar', ... }] }
-- Una fila NUEVA trae todas sus columnas (con los nombres de las tablas) y `_nueva: true`; un CAMBIO trae su `id` y solo las columnas que cambiaron.
-- El orden respeta las claves foráneas. Una acción de solicitudes trabaja con UNA solicitud; una corrección solo nace junto con un cambio de esa
-- misma matrícula.
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function public.aplicar_cambios_matricula(p_accion text, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_conf         jsonb;
  v_funcs        text[];
  v_fila         jsonb;
  v_perm         text;
  v_extra        text;
  v_stock        jsonb;
  v_op           text;
  v_grupos       text[] := '{}';
  v_matriculas   text[] := '{}';
  v_planes       text[] := '{}';
  v_pagos        text[] := '{}';
  v_movs         text[] := '{}';
  v_notas        text[] := '{}';
  v_solicitudes  text[] := '{}';
  v_correcciones text[] := '{}';
  v_vieja        text;
  v_nueva        text;
  v_restr        text;
  v_sol_tipo     text;
  v_sol_estado   text;
  v_tipo_fila    text;
  v_mat_fila     text;
  v_existe_sol   boolean;
  v_m_estado     text;
  v_m_fecha      date;
begin
  v_conf := app.acciones_dinero() -> p_accion;
  if v_conf is null then raise exception 'La operación «%» no existe.', coalesce(p_accion, '') using errcode = 'EN001'; end if;
  if jsonb_typeof(p) is distinct from 'object' then raise exception 'No hay cambios para guardar.' using errcode = 'EN001'; end if;

  select array_agg(f) into v_funcs from jsonb_array_elements_text(v_conf->'funciones') f;
  perform app.exigir_alguna(v_funcs, 'Su rol no puede ' || (v_conf->>'mensaje') || ': falta la función correspondiente.');

  -- Qué tablas puede tocar esta acción
  foreach v_op in array array['grupos', 'matriculas', 'planes', 'pagos', 'movimientos', 'notas', 'solicitudes', 'correcciones'] loop
    if jsonb_typeof(p->v_op) = 'array' and jsonb_array_length(p->v_op) > 0 then
      if v_conf->'tablas'->>v_op is null then
        raise exception 'Esta operación no puede modificar % (%).', case v_op when 'grupos' then 'los grupos promocionales' when 'matriculas' then 'las matrículas'
          when 'planes' then 'los planes' when 'pagos' then 'los pagos' when 'movimientos' then 'la caja' when 'solicitudes' then 'las solicitudes'
          when 'correcciones' then 'las correcciones' else 'las notas de crédito' end, p_accion using errcode = 'EN001';
      end if;
      v_extra := v_conf->'extra'->>v_op;
      if v_extra is not null then perform app.exigir(v_extra, 'Emitir o registrar notas de crédito'); end if;
    end if;
  end loop;

  -- Una acción de solicitudes trabaja con UNA solicitud
  v_sol_tipo := v_conf->>'sol_tipo';
  v_sol_estado := v_conf->>'sol_estado';
  if v_sol_tipo is not null and (jsonb_typeof(p->'solicitudes') is distinct from 'array' or jsonb_array_length(p->'solicitudes') <> 1) then
    raise exception 'Esta operación trabaja con una solicitud de %.', lower(v_sol_tipo) using errcode = 'EN001';
  end if;

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

  -- 7. Solicitudes (una sola por operación): de este tipo, en el estado que la acción deja, sobre una matrícula de una sede alcanzable. Una nueva
  --    pide que la matrícula esté en el estado que ese tipo exige (la reactivación, caída; los demás, activa) y que la fecha de una caída sea válida.
  for v_fila in select * from jsonb_array_elements(coalesce(p->'solicitudes', '[]'::jsonb)) loop
    select s.tipo, s.matricula_id, true into v_tipo_fila, v_mat_fila, v_existe_sol from public.solicitudes_matricula s where s.id = v_fila->>'id';
    if not coalesce(v_existe_sol, false) then
      v_tipo_fila := v_fila->>'tipo';
      v_mat_fila := v_fila->>'matricula_id';
    end if;
    if v_tipo_fila is distinct from v_sol_tipo then
      raise exception 'Esta operación solo trabaja con solicitudes de %.', lower(v_sol_tipo) using errcode = 'EN001';
    end if;
    if (v_fila->>'estado') is distinct from v_sol_estado then
      raise exception 'Esta operación debe dejar la solicitud en estado «%».', lower(v_sol_estado) using errcode = 'EN001';
    end if;
    select m.sede_id, m.estado, m.fecha into v_vieja, v_m_estado, v_m_fecha from public.matriculas m where m.id = v_mat_fila;
    if v_vieja is null then raise exception 'La matrícula % ya no existe. Actualice la pantalla.', coalesce(v_mat_fila, '') using errcode = 'EN001'; end if;
    perform app.exigir_sede(v_vieja, 'solicitudes de matrícula');
    if not coalesce(v_existe_sol, false) then
      if v_sol_tipo = 'Reactivación' and v_m_estado <> 'Caída' then
        raise exception 'La matrícula % no está caída (%).', v_mat_fila, v_m_estado using errcode = 'EN001';
      elsif v_sol_tipo <> 'Reactivación' and v_m_estado <> 'Activa' then
        raise exception 'La matrícula % no está activa (%).', v_mat_fila, v_m_estado using errcode = 'EN001';
      end if;
      if v_sol_tipo = 'Caída' then
        if (v_fila->>'fecha_efecto')::date > app.hoy() then raise exception 'La fecha no puede ser futura.' using errcode = 'EN001'; end if;
        if (v_fila->>'fecha_efecto')::date < v_m_fecha then raise exception 'La fecha no puede ser anterior a la matrícula.' using errcode = 'EN001'; end if;
      end if;
    end if;
    perform app.aplicar_fila('solicitudes_matricula', v_fila, array['id'], v_conf->'tablas'->>'solicitudes');
    v_solicitudes := v_solicitudes || (v_fila->>'id');
  end loop;

  -- 8. Correcciones: solo se agregan, y solo junto con un cambio de esa misma matrícula
  for v_fila in select * from jsonb_array_elements(coalesce(p->'correcciones', '[]'::jsonb)) loop
    if not coalesce((v_fila->>'matricula_id') = any (v_matriculas), false) then
      raise exception 'La corrección nombra la matrícula %, y esta operación no la cambia.', coalesce(v_fila->>'matricula_id', '') using errcode = 'EN001';
    end if;
    perform app.exigir_sede((select m.sede_id from public.matriculas m where m.id = v_fila->>'matricula_id'), 'correcciones de matrícula');
    perform app.aplicar_fila('correcciones_matricula', v_fila, array['id'], v_conf->'tablas'->>'correcciones');
    v_correcciones := v_correcciones || (v_fila->>'id');
  end loop;

  perform app.verificar_dinero(v_planes, v_pagos, v_movs, v_notas, v_grupos);
  perform app.verificar_solicitudes(v_solicitudes);
  return jsonb_build_object('ok', true);
exception
  when unique_violation then
    get stacked diagnostics v_restr = constraint_name;
    if v_restr like '%pkey' then
      raise exception 'Otra persona registró algo al mismo tiempo y el código ya está en uso. Vuelva a intentarlo.' using errcode = 'EN001';
    elsif v_restr = 'planes_matricula_id_key' then
      raise exception 'La matrícula ya tiene un plan de pagos.' using errcode = 'EN001';
    elsif v_restr = 'solicitudes_caida_pendiente_uq' then
      raise exception 'Ya hay una solicitud de caída pendiente para esta matrícula.' using errcode = 'EN001';
    elsif v_restr = 'solicitudes_cambio_pendiente_uq' then
      raise exception 'Ya hay una solicitud de cambio pendiente para esta matrícula.' using errcode = 'EN001';
    end if;
    raise exception 'Ya existe un registro con esos datos.' using errcode = 'EN001';
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Permisos de tabla y RLS: solo se lee (por sede y con la función que muestra cada cosa); todo lo demás pasa por la función
-- ---------------------------------------------------------------------------------------------------------------------

revoke all on public.solicitudes_matricula, public.correcciones_matricula from public, anon, authenticated;
grant select on public.solicitudes_matricula, public.correcciones_matricula to authenticated;

alter table public.solicitudes_matricula  enable row level security;
alter table public.correcciones_matricula enable row level security;

create policy solicitudes_leer on public.solicitudes_matricula for select to authenticated
  using ((select app.puede_leer_solicitudes()) and (select app.ve_matricula(matricula_id)));
create policy correcciones_leer on public.correcciones_matricula for select to authenticated
  using ((select app.puede_leer_matriculas()) and (select app.ve_matricula(matricula_id)));

revoke execute on all functions in schema app from public, anon;
grant execute on all functions in schema app to authenticated;

commit;
