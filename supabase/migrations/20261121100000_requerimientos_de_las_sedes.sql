-- =====================================================================================================================
-- 0031 · Requerimientos de las sedes, «Verificar existencia» y mensajes anclados (entrega 3 del tablero de envíos)
-- ---------------------------------------------------------------------------------------------------------------------
-- Hasta ahora una sede solo recibía lo que Logística decidía enviarle. Con esta migración la sede puede PEDIR mercadería:
--
--   · `requerimientos`: lo que pide una sede (artículos y cantidades) al almacén central. Una vez enviado la sede ya no lo edita (manda un mensaje anclado). Cae como
--     tarjeta en «Por armar» de Logística. Logística abre «Verificar existencia» (compara con el stock del almacén y con lo ya comprometido en otras tarjetas), **solo
--     reduce** las cantidades (0 = sin stock) o lo **rechaza con motivo**. Al pasarlo a «Empacando» nace el envío (el requerimiento NO es el envío: el envío se crea
--     entonces, con las cantidades que se enviarán). Mientras se prepara, la sede ve cómo cambia su lista («pidió 30 → se enviará 4») **sin ver la etapa**; solo ve
--     si sigue en Logística, si se rechazó (con su motivo) o si ya se despachó. El enlace con el envío vive en el envío (`envios.requerimiento_id`): la sede no puede
--     leer un envío hasta que sale, así que no se entera de su etapa.
--   · `requerimiento_mensajes`: mensajes anclados a un requerimiento (la sede pregunta o corrige, Logística responde). Solo se agregan. Solo mientras el requerimiento
--     está pendiente.
--   · `requerimiento_lecturas`: hasta qué mensaje leyó cada cuenta (la marca de «mensaje nuevo»). Cada cuenta marca los suyos.
--   · Nadie escribe estas tablas directo: solo las funciones `crear_requerimiento`, `abrir_verificacion_requerimiento` (apaga el parpadeo de la tarjeta para todos),
--     `verificar_requerimiento`, `rechazar_requerimiento`, `pasar_requerimiento_a_empacando`, `enviar_mensaje_requerimiento` y `marcar_mensajes_requerimiento_vistos`.
--     Cada una pide su función del registro y vuelve a validar. Los códigos `REQ-AAAA-NNN` los asigna la base con un candado.
--   · Funciones nuevas: «Ver requerimientos» (`log-requerimientos:view`), «Armar un requerimiento» (`:create`), «Atender requerimientos» (`:attend`: verificar la
--     existencia, rechazar y pasar a «Empacando») y «Escribir en un requerimiento» (`:message`). Los roles que ya recibían envíos (`log-recepciones:confirm`) reciben
--     ver, armar y escribir; los que ya preparaban envíos (`log-envios:create`), ver, atender y escribir.
--   · Un envío que viene de un requerimiento lleva su código (`envios.requerimiento_id`): su destino no se cambia, solo hay uno vivo por requerimiento y, al
--     despacharse, el requerimiento pasa a «Despachado» con lo que de verdad salió; si el envío se cancela, el requerimiento vuelve a estar pendiente.
--   · Tiempo real: las tablas `requerimientos` y `requerimiento_mensajes` se agregan a la publicación `supabase_realtime` (cada cuenta solo recibe lo que puede leer).
-- Los errores de negocio usan el código EN001: el sistema muestra su texto tal cual (está en español).
-- Para deshacer: supabase/deshacer/20261121100000_requerimientos_de_las_sedes.down.sql
-- =====================================================================================================================

begin;

-- ---------------------------------------------------------------------------------------------------------------------
-- 1) Tablas
-- ---------------------------------------------------------------------------------------------------------------------

create table public.requerimientos (
  id              text primary key check (id ~ '^REQ-[0-9]{4}-[0-9]{3,}$'),
  fecha           date not null,
  -- La sede que pide (y a la que se envía) y el almacén al que se pide
  sede_id         text not null references public.sedes (id) on delete restrict,
  almacen_id      text not null references public.almacenes (id) on delete restrict,
  -- [{ articulo_id, cantidad (lo que se pidió), enviar (lo que se enviará: vacío hasta que Logística verifica) }]. El nombre del artículo no se guarda.
  lineas          jsonb not null check (jsonb_typeof(lineas) = 'array' and jsonb_array_length(lineas) > 0),
  nota            text check (nota is null or length(btrim(nota)) between 1 and 500),
  -- Pendiente: sigue en Logística (con o sin envío en preparación) · Rechazado: Logística lo rechazó con motivo · Despachado: ya salió en un envío
  estado          text not null default 'Pendiente' check (estado in ('Pendiente', 'Rechazado', 'Despachado')),
  motivo_rechazo  text check (motivo_rechazo is null or length(btrim(motivo_rechazo)) between 5 and 300),
  -- La primera vez que alguien abrió «Verificar existencia» (apaga el parpadeo de la tarjeta para todos)
  visto_en        timestamptz,
  visto_por       text,
  -- La última vez que se guardaron las cantidades que se enviarán
  verificado_en   timestamptz,
  verificado_por  text,
  -- Cuándo y quién lo rechazó
  resuelto_en     timestamptz,
  resuelto_por    text,
  -- Sube en 1 con cada cambio de contenido (no con «visto»): quien edita manda la versión que vio y, si otra persona lo cambió, no se guarda
  version         integer not null default 1,
  creado_por_id   uuid references public.cuentas (id) on delete restrict,
  creado_en       timestamptz not null default now(),
  creado_por      text,
  actualizado_en  timestamptz not null default now(),
  actualizado_por text,
  check ((estado = 'Rechazado') = (motivo_rechazo is not null))
);
create trigger requerimientos_huella before insert or update on public.requerimientos for each row execute function app.catalogo_huella();
create index requerimientos_sede_idx on public.requerimientos (sede_id);
create index requerimientos_estado_idx on public.requerimientos (estado);
comment on table public.requerimientos is 'Lo que una sede pide al almacén central. No es el envío: el envío nace al pasar el requerimiento a «Empacando» (envios.requerimiento_id). Nadie escribe directo: solo las funciones de requerimientos.';
comment on column public.requerimientos.lineas is 'Lista de {articulo_id, cantidad, enviar}. «cantidad» es lo pedido (no cambia); «enviar» lo fija Logística al verificar la existencia y solo puede reducir lo pedido.';

-- Sube la versión solo cuando cambia el contenido (marcar «visto» no la cambia: dos personas que abren «Verificar existencia» a la vez no se estorban)
create function app.requerimiento_subir_version() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (to_jsonb(new) - 'visto_en' - 'visto_por' - 'version' - 'actualizado_en' - 'actualizado_por')
     is distinct from (to_jsonb(old) - 'visto_en' - 'visto_por' - 'version' - 'actualizado_en' - 'actualizado_por') then
    new.version := old.version + 1;
  else
    new.version := old.version;
  end if;
  return new;
end;
$$;
create trigger requerimientos_version before update on public.requerimientos for each row execute function app.requerimiento_subir_version();

create table public.requerimiento_mensajes (
  numero           bigint generated always as identity primary key,
  requerimiento_id text not null references public.requerimientos (id) on delete restrict,
  -- De qué lado escribe: la sede que pidió o Logística (quien puede atender requerimientos)
  lado             text not null check (lado in ('sede', 'logistica')),
  texto            text not null check (length(btrim(texto)) between 1 and 800),
  autor_id         uuid references public.cuentas (id) on delete restrict,
  autor_nombre     text not null,
  creado_en        timestamptz not null default now()
);
create index requerimiento_mensajes_req_idx on public.requerimiento_mensajes (requerimiento_id, numero);
comment on table public.requerimiento_mensajes is 'Mensajes anclados a un requerimiento (no es la mensajería interna). Solo se agregan; solo mientras el requerimiento está pendiente.';

create function app.requerimiento_mensaje_inmutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Un mensaje de un requerimiento no se modifica ni se borra.' using errcode = 'EN001';
end;
$$;
create trigger requerimiento_mensajes_no_cambian before update or delete on public.requerimiento_mensajes for each row execute function app.requerimiento_mensaje_inmutable();
create trigger requerimiento_mensajes_no_vaciar  before truncate on public.requerimiento_mensajes for each statement execute function app.requerimiento_mensaje_inmutable();

create table public.requerimiento_lecturas (
  requerimiento_id text not null references public.requerimientos (id) on delete restrict,
  cuenta_id        uuid not null references public.cuentas (id) on delete restrict,
  -- El número del último mensaje que esta cuenta ya vio
  visto_hasta      bigint not null default 0,
  primary key (requerimiento_id, cuenta_id)
);
comment on table public.requerimiento_lecturas is 'Hasta qué mensaje de cada requerimiento leyó cada cuenta (la marca de «mensaje nuevo»). Cada cuenta marca los suyos.';

-- ---------------------------------------------------------------------------------------------------------------------
-- 2) El envío que viene de un requerimiento
-- ---------------------------------------------------------------------------------------------------------------------

alter table public.envios add column requerimiento_id text references public.requerimientos (id) on delete restrict;
comment on column public.envios.requerimiento_id is 'El requerimiento de una sede del que nació este envío (vacío si lo armó Logística por su cuenta). No cambia. La sede solo lee el envío desde que sale.';
-- Un requerimiento tiene a lo sumo un envío vivo (los cancelados no cuentan: el requerimiento se puede volver a pasar a «Empacando»)
create unique index envios_requerimiento_vivo_uq on public.envios (requerimiento_id) where requerimiento_id is not null and estado <> 'Cancelado';

-- El requerimiento de un envío y su destino no se cambian
create function app.envio_requerimiento_guardar() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.requerimiento_id is distinct from old.requerimiento_id then
    raise exception 'El requerimiento de un envío no se cambia.' using errcode = 'EN001';
  end if;
  if old.requerimiento_id is not null and new.sede_destino_id is distinct from old.sede_destino_id then
    raise exception 'El destino de un envío que viene de un requerimiento no se cambia: es la sede que lo pidió. Cancele el envío y vuelva a pasar el requerimiento a «Empacando».' using errcode = 'EN001';
  end if;
  return new;
end;
$$;
create trigger envios_requerimiento_guardar before update on public.envios for each row execute function app.envio_requerimiento_guardar();

-- Al despacharse el envío, el requerimiento pasa a «Despachado» con lo que de verdad salió; si el envío se cancela, el requerimiento vuelve a estar pendiente
create function app.envio_sincronizar_requerimiento() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.requerimiento_id is null or new.estado is not distinct from old.estado then return new; end if;
  if new.estado = 'En tránsito' and old.estado = 'Por despachar' then
    update public.requerimientos r set
      estado = 'Despachado',
      lineas = (
        select jsonb_agg(jsonb_build_object(
          'articulo_id', l->>'articulo_id',
          'cantidad', (l->>'cantidad')::integer,
          'enviar', coalesce((select (e->>'cantidad')::integer from jsonb_array_elements(new.lineas) e where e->>'articulo_id' = l->>'articulo_id'), 0)
        ) order by ord)
        from jsonb_array_elements(r.lineas) with ordinality as t(l, ord)
      )
    where r.id = new.requerimiento_id and r.estado = 'Pendiente';
  elsif new.estado = 'Cancelado' then
    update public.requerimientos r set estado = 'Pendiente' where r.id = new.requerimiento_id and r.estado = 'Despachado';
  end if;
  return new;
end;
$$;
create trigger envios_requerimiento_sync after update of estado on public.envios
  for each row when (old.estado is distinct from new.estado and new.requerimiento_id is not null) execute function app.envio_sincronizar_requerimiento();

-- ---------------------------------------------------------------------------------------------------------------------
-- 3) Quién lee y reglas de apoyo
-- ---------------------------------------------------------------------------------------------------------------------

-- ¿Puede esta cuenta leer ese requerimiento? Con «Ver requerimientos» y alcanzando la sede que pidió (o viendo el almacén al que se pidió). La política de lectura de la
-- tabla repite esta misma condición (check-requirements-db.ts la compara con el registro).
create function app.requerimiento_visible(p_id text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.requerimientos r
    where r.id = p_id and app.tiene_funcion('log-requerimientos:view')
      and (app.puede_ver_ubicacion(r.sede_id, null::text) or app.puede_ver_ubicacion(null::text, r.almacen_id))
  );
$$;

-- Siguiente código del año (REQ-2026-001): se numera con la mesa bloqueada para que dos personas a la vez no repitan.
create function app.siguiente_codigo_requerimiento() returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_base text := 'REQ-' || app.anio_hoy() || '-';
  v_max  integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('ensil:codigo:REQ|', 0));
  select coalesce(max(substring(r.id from length(v_base) + 1)::integer), 0) into v_max from public.requerimientos r where r.id like v_base || '%';
  return v_base || lpad((v_max + 1)::text, 3, '0');
end;
$$;

-- Lo que se pide: al menos un artículo, hasta 60, cada uno del catálogo y activo, sin repetir y con cantidad entera de 1 a 99 999.
create function app.validar_lineas_requerimiento(p_lineas jsonb) returns void
language plpgsql stable security definer set search_path = '' as $$
declare
  v_linea  jsonb;
  v_cant   numeric;
  v_vistos text[] := '{}';
  v_art    public.articulos;
begin
  if jsonb_typeof(p_lineas) is distinct from 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'Agregue al menos un artículo al requerimiento.' using errcode = 'EN001';
  end if;
  if jsonb_array_length(p_lineas) > 60 then raise exception 'Un requerimiento admite hasta 60 artículos distintos.' using errcode = 'EN001'; end if;
  for v_linea in select * from jsonb_array_elements(p_lineas) loop
    if jsonb_typeof(v_linea) is distinct from 'object' or coalesce(v_linea->>'articulo_id', '') = '' then
      raise exception 'Hay un artículo sin seleccionar.' using errcode = 'EN001';
    end if;
    v_cant := case when jsonb_typeof(v_linea->'cantidad') = 'number' then (v_linea->>'cantidad')::numeric else null end;
    if v_cant is null or v_cant < 1 or v_cant <> trunc(v_cant) then raise exception 'La cantidad debe ser un número entero mayor a 0.' using errcode = 'EN001'; end if;
    if v_cant > 99999 then raise exception 'La cantidad pedida no puede pasar de 99 999 unidades por artículo.' using errcode = 'EN001'; end if;
    if (v_linea->>'articulo_id') = any (v_vistos) then raise exception 'Hay artículos repetidos en el requerimiento.' using errcode = 'EN001'; end if;
    v_vistos := v_vistos || (v_linea->>'articulo_id');
    select * into v_art from public.articulos a where a.id = v_linea->>'articulo_id';
    if not found then raise exception 'Un artículo no existe en el catálogo.' using errcode = 'EN001'; end if;
    if v_art.estado <> 'Activo' then raise exception 'El artículo «%» está inactivo.', v_art.nombre using errcode = 'EN001'; end if;
  end loop;
end;
$$;

-- Un requerimiento solo se atiende mientras está pendiente, sin envío en preparación y, si quien edita trae la versión que vio, sin que otra persona lo haya cambiado.
create function app.requerimiento_abierto(r public.requerimientos, p_version integer) returns void
language plpgsql stable security definer set search_path = '' as $$
declare
  v_env text;
begin
  if r.estado = 'Rechazado' then raise exception 'Este requerimiento ya fue rechazado.' using errcode = 'EN001'; end if;
  if r.estado = 'Despachado' then raise exception 'Este requerimiento ya se despachó.' using errcode = 'EN001'; end if;
  if p_version is not null and p_version <> r.version then
    raise exception 'Otra persona cambió este requerimiento mientras usted lo tenía abierto: ya se actualizó en pantalla. Revise y vuelva a intentar.' using errcode = 'EN001';
  end if;
  select e.id into v_env from public.envios e where e.requerimiento_id = r.id and e.estado <> 'Cancelado' limit 1;
  if v_env is not null then
    raise exception 'Este requerimiento ya se está armando como el envío %: trabaje desde la tarjeta del envío.', v_env using errcode = 'EN001';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- 4) Funciones
-- ---------------------------------------------------------------------------------------------------------------------

-- La sede arma su requerimiento: p = { sede_id, almacen_id, lineas: [{ articulo_id, cantidad }], nota }. Devuelve el código.
create function public.crear_requerimiento(p jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_sede   text := app.jtexto(p, 'sede_id');
  v_alm    text := app.jtexto(p, 'almacen_id');
  v_nota   text := app.jtexto(p, 'nota');
  v_estado text;
  v_lineas jsonb;
  v_id     text;
begin
  perform app.exigir('log-requerimientos:create', 'Armar un requerimiento');
  if v_sede is null then raise exception 'Indique la sede que pide.' using errcode = 'EN001'; end if;
  select s.estado into v_estado from public.sedes s where s.id = v_sede;
  if not found then raise exception 'La sede que pide no existe.' using errcode = 'EN001'; end if;
  if v_estado <> 'Activo' then raise exception 'La sede que pide está inactiva.' using errcode = 'EN001'; end if;
  perform app.exigir_sede(v_sede, 'un requerimiento');
  if v_alm is null or not exists (select 1 from public.almacenes a where a.id = v_alm and a.estado = 'Activo') then
    raise exception 'Los requerimientos se piden al almacén central.' using errcode = 'EN001';
  end if;
  if v_nota is not null and length(v_nota) > 500 then raise exception 'La nota no puede pasar de 500 letras.' using errcode = 'EN001'; end if;
  perform app.validar_lineas_requerimiento(p->'lineas');
  v_lineas := (
    select jsonb_agg(jsonb_build_object('articulo_id', l->>'articulo_id', 'cantidad', (l->>'cantidad')::integer) order by ord)
    from jsonb_array_elements(p->'lineas') with ordinality as t(l, ord)
  );
  v_id := app.siguiente_codigo_requerimiento();
  insert into public.requerimientos (id, fecha, sede_id, almacen_id, lineas, nota, creado_por_id)
  values (v_id, app.hoy(), v_sede, v_alm, v_lineas, v_nota, auth.uid());
  return v_id;
end;
$$;
comment on function public.crear_requerimiento(jsonb) is 'La sede pide mercadería al almacén central: sede, almacén, lista de artículos con cantidades y una nota opcional. Devuelve el código REQ-AAAA-NNN.';

-- Alguien abrió «Verificar existencia»: la tarjeta deja de parpadear para todos (no cambia la versión del requerimiento).
create function public.abrir_verificacion_requerimiento(p_id text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.exigir('log-requerimientos:attend', 'Atender requerimientos');
  if not app.requerimiento_visible(p_id) then raise exception 'Requerimiento no encontrado.' using errcode = 'EN001'; end if;
  update public.requerimientos r set visto_en = now(), visto_por = app.quien(null) where r.id = p_id and r.visto_en is null;
end;
$$;

-- Logística fija cuánto se enviará de cada artículo pedido: solo puede reducir (0 = sin stock). p_lineas = [{ articulo_id, enviar }] con todos los artículos pedidos.
create function public.verificar_requerimiento(p_id text, p_lineas jsonb, p_version integer default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r         public.requerimientos;
  v_pedido  jsonb;
  v_linea   jsonb;
  v_enviar  numeric;
  v_cant    integer;
  v_nombre  text;
  v_nuevo   jsonb := '[]'::jsonb;
begin
  perform app.exigir('log-requerimientos:attend', 'Atender requerimientos');
  select * into r from public.requerimientos x where x.id = p_id for update;
  if not found or not app.requerimiento_visible(p_id) then raise exception 'Requerimiento no encontrado.' using errcode = 'EN001'; end if;
  perform app.requerimiento_abierto(r, p_version);
  if jsonb_typeof(p_lineas) is distinct from 'array' then raise exception 'Indique cuánto se enviará de cada artículo.' using errcode = 'EN001'; end if;
  if jsonb_array_length(p_lineas) <> jsonb_array_length(r.lineas) then raise exception 'La lista trae artículos que el requerimiento no pidió.' using errcode = 'EN001'; end if;
  for v_pedido in select * from jsonb_array_elements(r.lineas) loop
    select a.nombre into v_nombre from public.articulos a where a.id = v_pedido->>'articulo_id';
    v_cant := (v_pedido->>'cantidad')::integer;
    select l into v_linea from jsonb_array_elements(p_lineas) l where l->>'articulo_id' = v_pedido->>'articulo_id' limit 1;
    if v_linea is null then raise exception 'Falta indicar cuánto se enviará de «%».', coalesce(v_nombre, v_pedido->>'articulo_id') using errcode = 'EN001'; end if;
    v_enviar := case when jsonb_typeof(v_linea->'enviar') = 'number' then (v_linea->>'enviar')::numeric else null end;
    if v_enviar is null or v_enviar < 0 or v_enviar <> trunc(v_enviar) then
      raise exception 'La cantidad a enviar de «%» debe ser un número entero de 0 o más.', coalesce(v_nombre, v_pedido->>'articulo_id') using errcode = 'EN001';
    end if;
    if v_enviar > v_cant then
      raise exception 'Solo se puede reducir lo pedido: de «%» pidieron % y no se puede enviar más.', coalesce(v_nombre, v_pedido->>'articulo_id'), v_cant using errcode = 'EN001';
    end if;
    v_nuevo := v_nuevo || jsonb_build_object('articulo_id', v_pedido->>'articulo_id', 'cantidad', v_cant, 'enviar', v_enviar::integer);
  end loop;
  update public.requerimientos x set
    lineas = v_nuevo, verificado_en = now(), verificado_por = app.quien(null),
    visto_en = coalesce(x.visto_en, now()), visto_por = coalesce(x.visto_por, app.quien(null))
  where x.id = p_id;
end;
$$;

-- Logística rechaza el requerimiento con su motivo (al menos 5 letras): la sede lo ve.
create function public.rechazar_requerimiento(p_id text, p_motivo text, p_version integer default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r         public.requerimientos;
  v_motivo  text := btrim(coalesce(p_motivo, ''));
begin
  perform app.exigir('log-requerimientos:attend', 'Atender requerimientos');
  select * into r from public.requerimientos x where x.id = p_id for update;
  if not found or not app.requerimiento_visible(p_id) then raise exception 'Requerimiento no encontrado.' using errcode = 'EN001'; end if;
  perform app.requerimiento_abierto(r, p_version);
  if length(v_motivo) < 5 then raise exception 'Indique el motivo del rechazo (al menos 5 letras): la sede lo verá.' using errcode = 'EN001'; end if;
  if length(v_motivo) > 300 then raise exception 'El motivo del rechazo no puede pasar de 300 letras.' using errcode = 'EN001'; end if;
  update public.requerimientos x set
    estado = 'Rechazado', motivo_rechazo = v_motivo, resuelto_en = now(), resuelto_por = app.quien(null),
    visto_en = coalesce(x.visto_en, now()), visto_por = coalesce(x.visto_por, app.quien(null))
  where x.id = p_id;
end;
$$;

-- Pasa el requerimiento a «Empacando»: nace el envío (con lo que se enviará: las cantidades en 0 no entran) y queda enlazado. Devuelve el código del envío.
create function public.pasar_requerimiento_a_empacando(p_id text, p_version integer default null) returns text
language plpgsql security definer set search_path = '' as $$
declare
  r        public.requerimientos;
  v_lineas jsonb;
  v_id     text;
begin
  perform app.exigir('log-requerimientos:attend', 'Atender requerimientos');
  perform app.exigir('log-envios:create', 'Preparar un envío');
  select * into r from public.requerimientos x where x.id = p_id for update;
  if not found or not app.requerimiento_visible(p_id) then raise exception 'Requerimiento no encontrado.' using errcode = 'EN001'; end if;
  perform app.requerimiento_abierto(r, p_version);
  if r.verificado_en is null then
    raise exception 'Antes de pasar el requerimiento a «Empacando» verifique la existencia: abra «Verificar existencia» y guarde las cantidades.' using errcode = 'EN001';
  end if;
  v_lineas := (
    select coalesce(jsonb_agg(jsonb_build_object('articulo_id', l->>'articulo_id', 'cantidad', (l->>'enviar')::integer) order by ord), '[]'::jsonb)
    from jsonb_array_elements(r.lineas) with ordinality as t(l, ord)
    where coalesce((l->>'enviar')::integer, 0) > 0
  );
  if jsonb_array_length(v_lineas) = 0 then
    raise exception 'No hay nada que enviar: todas las cantidades están en 0. Rechace el requerimiento con su motivo.' using errcode = 'EN001';
  end if;
  perform app.validar_ruta_envio(r.almacen_id, r.sede_id);
  v_id := app.siguiente_codigo('ENV', 'envios');
  insert into public.envios (id, fecha, almacen_origen_id, sede_destino_id, estado, cajas, lineas, observacion, adjuntos, requerimiento_id, creado_por)
  values (v_id, app.hoy(), r.almacen_id, r.sede_id, 'Empacando', '[]'::jsonb, v_lineas, 'Requerimiento ' || r.id, '{}', r.id, app.quien(null));
  perform app.envio_validar_etapa((select x from public.envios x where x.id = v_id), 'Por armar');
  update public.requerimientos x set visto_en = coalesce(x.visto_en, now()), visto_por = coalesce(x.visto_por, app.quien(null)) where x.id = p_id;
  return v_id;
end;
$$;

-- Un mensaje anclado al requerimiento (de 1 a 800 letras), solo mientras está pendiente. Quien puede atender requerimientos escribe del lado de Logística; el resto, de la sede.
create function public.enviar_mensaje_requerimiento(p_id text, p_texto text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  r       public.requerimientos;
  v_texto text := btrim(coalesce(p_texto, ''));
  v_n     bigint;
begin
  perform app.exigir('log-requerimientos:message', 'Escribir en un requerimiento');
  select * into r from public.requerimientos x where x.id = p_id;
  if not found or not app.requerimiento_visible(p_id) then raise exception 'Requerimiento no encontrado.' using errcode = 'EN001'; end if;
  if r.estado <> 'Pendiente' then raise exception 'Este requerimiento ya está cerrado: no admite más mensajes.' using errcode = 'EN001'; end if;
  if length(v_texto) < 1 then raise exception 'Escriba el mensaje.' using errcode = 'EN001'; end if;
  if length(v_texto) > 800 then raise exception 'El mensaje no puede pasar de 800 letras.' using errcode = 'EN001'; end if;
  insert into public.requerimiento_mensajes (requerimiento_id, lado, texto, autor_id, autor_nombre)
  values (p_id, case when app.tiene_funcion('log-requerimientos:attend') then 'logistica' else 'sede' end, v_texto, auth.uid(), app.quien(null))
  returning numero into v_n;
  -- Lo que uno mismo escribe no cuenta como mensaje nuevo para uno
  if auth.uid() is not null then
    insert into public.requerimiento_lecturas as l (requerimiento_id, cuenta_id, visto_hasta) values (p_id, auth.uid(), v_n)
    on conflict (requerimiento_id, cuenta_id) do update set visto_hasta = greatest(l.visto_hasta, excluded.visto_hasta);
  end if;
  return v_n;
end;
$$;

-- La cuenta que llama marca como vistos todos los mensajes de ese requerimiento (la marca de «mensaje nuevo» desaparece).
create function public.marcar_mensajes_requerimiento_vistos(p_id text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_max bigint;
begin
  if not app.acceso_vigente() then raise exception 'Su cuenta no puede leer requerimientos.' using errcode = 'EN001'; end if;
  if not app.requerimiento_visible(p_id) then raise exception 'Requerimiento no encontrado.' using errcode = 'EN001'; end if;
  select coalesce(max(m.numero), 0) into v_max from public.requerimiento_mensajes m where m.requerimiento_id = p_id;
  insert into public.requerimiento_lecturas as l (requerimiento_id, cuenta_id, visto_hasta) values (p_id, auth.uid(), v_max)
  on conflict (requerimiento_id, cuenta_id) do update set visto_hasta = greatest(l.visto_hasta, excluded.visto_hasta);
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- 5) Roles que ya hacían algo parecido reciben las funciones nuevas (para que nada deje de funcionar)
-- ---------------------------------------------------------------------------------------------------------------------

-- Quien ya recibía envíos en la sede: ve sus requerimientos, los arma y escribe en ellos
insert into public.rol_funciones (rol_id, funcion_id)
select rf.rol_id, f.funcion from public.rol_funciones rf, (values ('log-requerimientos:view'), ('log-requerimientos:create'), ('log-requerimientos:message')) as f (funcion)
where rf.funcion_id = 'log-recepciones:confirm'
on conflict do nothing;
-- Quien ya preparaba envíos: ve los requerimientos, los atiende y escribe en ellos
insert into public.rol_funciones (rol_id, funcion_id)
select rf.rol_id, f.funcion from public.rol_funciones rf, (values ('log-requerimientos:view'), ('log-requerimientos:attend'), ('log-requerimientos:message')) as f (funcion)
where rf.funcion_id = 'log-envios:create'
on conflict do nothing;

-- ---------------------------------------------------------------------------------------------------------------------
-- 6) Permisos de tabla, seguridad por fila y tiempo real: solo se lee; todo lo que cambia pasa por las funciones de arriba
-- ---------------------------------------------------------------------------------------------------------------------

revoke all on public.requerimientos, public.requerimiento_mensajes, public.requerimiento_lecturas from public, anon, authenticated;
grant select on public.requerimientos, public.requerimiento_mensajes, public.requerimiento_lecturas to authenticated;

alter table public.requerimientos          enable row level security;
alter table public.requerimiento_mensajes  enable row level security;
alter table public.requerimiento_lecturas  enable row level security;

create policy requerimientos_leer on public.requerimientos for select to authenticated using (
  (select app.tiene_funcion('log-requerimientos:view'))
  and (
    (select app.puede_ver_ubicacion(requerimientos.sede_id, null::text))
    or (select app.puede_ver_ubicacion(null::text, requerimientos.almacen_id))
  )
);
create policy requerimiento_mensajes_leer on public.requerimiento_mensajes for select to authenticated using ((select app.requerimiento_visible(requerimiento_id)));
create policy requerimiento_lecturas_leer on public.requerimiento_lecturas for select to authenticated using (cuenta_id = (select auth.uid()));

-- Las funciones públicas son de las cuentas con sesión
revoke execute on function
  public.crear_requerimiento(jsonb), public.abrir_verificacion_requerimiento(text), public.verificar_requerimiento(text, jsonb, integer), public.rechazar_requerimiento(text, text, integer),
  public.pasar_requerimiento_a_empacando(text, integer), public.enviar_mensaje_requerimiento(text, text), public.marcar_mensajes_requerimiento_vistos(text)
  from public, anon;
grant execute on function
  public.crear_requerimiento(jsonb), public.abrir_verificacion_requerimiento(text), public.verificar_requerimiento(text, jsonb, integer), public.rechazar_requerimiento(text, text, integer),
  public.pasar_requerimiento_a_empacando(text, integer), public.enviar_mensaje_requerimiento(text, text), public.marcar_mensajes_requerimiento_vistos(text)
  to authenticated;

-- Lo interno no se llama de fuera (las funciones públicas corren con los permisos del dueño)
revoke execute on function
  app.requerimiento_subir_version(), app.requerimiento_mensaje_inmutable(), app.envio_requerimiento_guardar(), app.envio_sincronizar_requerimiento(),
  app.siguiente_codigo_requerimiento(), app.validar_lineas_requerimiento(jsonb), app.requerimiento_abierto(public.requerimientos, integer)
  from public, anon, authenticated;
-- La política de seguridad de los mensajes llama a esta función con la cuenta que lee, así que sí debe poder ejecutarla
revoke execute on function app.requerimiento_visible(text) from public, anon;
grant execute on function app.requerimiento_visible(text) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'requerimientos') then
      alter publication supabase_realtime add table public.requerimientos;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'requerimiento_mensajes') then
      alter publication supabase_realtime add table public.requerimiento_mensajes;
    end if;
  end if;
end;
$$;

commit;
