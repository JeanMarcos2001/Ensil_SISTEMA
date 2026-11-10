-- =====================================================================================================================
-- 0013 · Envíos, transferencias, recepciones, couriers y métodos de envío en la base (Lote 6, segunda parte)
-- ---------------------------------------------------------------------------------------------------------------------
--   · `envios`: la mercadería sale del almacén central hacia una sede, en cajas. Borrador → En tránsito → (Listo para recepción) → Recibido
--     (con o sin diferencias) o Cancelado. El stock sale del origen UNA sola vez, al despachar; el destino suma al recibir; cancelar un envío
--     despachado devuelve lo que salió. Todo con el kardex (`app.mover_stock`), todo o nada.
--   · `transferencias`: una solicitud con aprobación; uno de sus extremos es siempre el almacén central (reposición hacia una sede o devolución
--     desde una sede). Borrador → Solicitada → Aprobada → En tránsito → (Listo para recepción) → Recibida (con o sin diferencias); también
--     Rechazada y Cancelada. Se despacha solo si está Aprobada.
--   · `incidencias_recepcion`: lo que faltó, llegó dañado o de más al recibir un envío o una transferencia. Solo se agrega.
--   · `couriers` y `metodos_envio`: catálogos de transporte. No se eliminan: se inactivan.
--   · Una recepción solo se confirma sobre un documento en tránsito (no se puede recibir dos veces) y suma al stock lo recibido.
--   · Las cantidades de las cajas deben coincidir con el detalle (`lineas`) del envío o de la transferencia. Nadie escribe estas tablas
--     directo: solo las funciones de abajo, que validan otra vez, piden la función del registro y dejan quién y cuándo.
--   · Quién mueve: despachar y cancelar mueven el stock del origen (el almacén, solo quien trabaja en él o el Superusuario; una sede, quien la
--     alcanza); recibir mueve el del destino. Quién ve: quien alcanza el origen o el destino.
-- Los errores de negocio usan el código EN001: el sistema muestra su texto tal cual (está en español).
-- Para deshacer: supabase/deshacer/20261109120000_envios_transferencias_y_recepciones.down.sql
-- =====================================================================================================================

begin;

-- ---------------------------------------------------------------------------------------------------------------------
-- Couriers y métodos de envío
-- ---------------------------------------------------------------------------------------------------------------------

create table public.couriers (
  id              text primary key check (id ~ '^COUR-[0-9]{3,}$'),
  codigo          text not null check (length(btrim(codigo)) between 1 and 20),
  nombre          text not null check (length(btrim(nombre)) between 1 and 80),
  direccion       text not null default '',
  referencia      text not null default '',
  telefono        text not null default '',
  estado          text not null default 'Activo' check (estado in ('Activo', 'Inactivo')),
  observaciones   text not null default '',
  creado_en       timestamptz not null default now(),
  creado_por      text,
  actualizado_en  timestamptz not null default now(),
  actualizado_por text
);
create unique index couriers_codigo_unico on public.couriers (lower(btrim(codigo)));
comment on table public.couriers is 'Empresas de transporte que llevan los envíos y transferencias. No se eliminan: se inactivan.';

create table public.metodos_envio (
  id              text primary key check (id ~ '^SM-[0-9]{3,}$'),
  nombre          text not null check (length(btrim(nombre)) between 1 and 80),
  estado          text not null default 'Activo' check (estado in ('Activo', 'Inactivo')),
  observaciones   text not null default '',
  creado_en       timestamptz not null default now(),
  creado_por      text,
  actualizado_en  timestamptz not null default now(),
  actualizado_por text
);
comment on table public.metodos_envio is 'Cómo viaja la mercadería (Courier, Viajero, Recojo interno…). El nombre «Courier» pide courier y guía; «Viajero», quién lleva la carga.';

create trigger couriers_huella before insert or update on public.couriers for each row execute function app.catalogo_huella();
create trigger metodos_envio_huella before insert or update on public.metodos_envio for each row execute function app.catalogo_huella();

create function app.courier_validar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.codigo := btrim(new.codigo);
  new.nombre := btrim(new.nombre);
  if new.codigo = '' or new.nombre = '' then raise exception 'El código y nombre son obligatorios.' using errcode = 'EN001'; end if;
  if exists (select 1 from public.couriers c where c.id <> new.id and lower(btrim(c.codigo)) = lower(new.codigo)) then
    raise exception 'Ya existe un courier con ese código.' using errcode = 'EN001';
  end if;
  return new;
end;
$$;
create trigger couriers_validar before insert or update on public.couriers for each row execute function app.courier_validar();

create function app.metodo_envio_validar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.nombre := btrim(new.nombre);
  if new.nombre = '' then raise exception 'El nombre del método es obligatorio.' using errcode = 'EN001'; end if;
  return new;
end;
$$;
create trigger metodos_envio_validar before insert or update on public.metodos_envio for each row execute function app.metodo_envio_validar();

-- ---------------------------------------------------------------------------------------------------------------------
-- Envíos
-- ---------------------------------------------------------------------------------------------------------------------

create table public.envios (
  id                          text primary key check (id ~ '^ENV-[0-9]{4}-[0-9]{3,}$'),
  fecha                       date not null,
  almacen_origen_id           text not null references public.almacenes (id) on delete restrict,
  sede_destino_id             text not null references public.sedes (id) on delete restrict,
  estado                      text not null default 'Borrador'
                                check (estado in ('Borrador', 'En tránsito', 'Listo para recepción', 'Recibido', 'Recibido con diferencias', 'Cancelado')),
  -- Cajas: lista de {id, numero, observacion, items: [{articulo_id, cantidad}]}. El detalle (`lineas`) es la suma de las cajas.
  cajas                       jsonb not null default '[]'::jsonb check (jsonb_typeof(cajas) = 'array'),
  -- Detalle: lista de {articulo_id, cantidad, observacion}. El nombre del artículo NO se guarda: sale del propio artículo.
  lineas                      jsonb not null default '[]'::jsonb check (jsonb_typeof(lineas) = 'array'),
  metodo_envio_id             text references public.metodos_envio (id) on delete restrict,
  courier_id                  text references public.couriers (id) on delete restrict,
  numero_guia                 text,
  referencia_adicional        text,
  viajero_nombre              text,
  viajero_documento           text,
  observacion_envio           text,
  eta                         date,
  eta_hora                    text check (eta_hora is null or eta_hora ~ '^[0-2][0-9]:[0-5][0-9]$'),
  borrador_vence              timestamptz,
  observacion                 text,
  adjuntos                    text[] not null default '{}',
  recepcion_observacion       text,
  recepcion_fecha             timestamptz,
  recibido_por                text,
  habilitar_recepcion_manual  boolean not null default false,
  creado_en                   timestamptz not null default now(),
  creado_por                  text,
  actualizado_en              timestamptz not null default now(),
  actualizado_por             text
);
create trigger envios_huella before insert or update on public.envios for each row execute function app.catalogo_huella();
create index envios_destino_idx on public.envios (sede_destino_id);
create index envios_origen_idx on public.envios (almacen_origen_id);
comment on table public.envios is 'Mercadería que sale del almacén central hacia una sede, en cajas. El stock sale del origen al despachar y el destino suma al recibir. Nadie escribe directo: solo las funciones de envíos.';
comment on column public.envios.adjuntos is 'Nombres de los archivos adjuntos (los archivos en sí se guardarán cuando haya almacenamiento de archivos).';

-- ---------------------------------------------------------------------------------------------------------------------
-- Transferencias
-- ---------------------------------------------------------------------------------------------------------------------

create table public.transferencias (
  id                            text primary key check (id ~ '^TRF-[0-9]{4}-[0-9]{3,}$'),
  fecha                         date not null,
  origen_sede_id                text references public.sedes (id) on delete restrict,
  origen_almacen_id             text references public.almacenes (id) on delete restrict,
  origen_id                     text generated always as (coalesce(origen_sede_id, origen_almacen_id)) stored,
  destino_sede_id               text references public.sedes (id) on delete restrict,
  destino_almacen_id            text references public.almacenes (id) on delete restrict,
  destino_id                    text generated always as (coalesce(destino_sede_id, destino_almacen_id)) stored,
  estado                        text not null default 'Borrador'
                                  check (estado in ('Borrador', 'Solicitada', 'Aprobada', 'En tránsito', 'Listo para recepción', 'Recibida', 'Recibida con diferencias', 'Rechazada', 'Cancelada')),
  lineas                        jsonb not null default '[]'::jsonb check (jsonb_typeof(lineas) = 'array'),
  cajas                         jsonb not null default '[]'::jsonb check (jsonb_typeof(cajas) = 'array'),
  motivo                        text not null check (length(btrim(motivo)) >= 1),
  solicitada_por                text,
  solicitada_por_id             uuid,
  metodo_envio_id               text references public.metodos_envio (id) on delete restrict,
  courier_id                    text references public.couriers (id) on delete restrict,
  numero_guia                   text,
  referencia_adicional          text,
  viajero_nombre                text,
  viajero_documento             text,
  observacion_envio             text,
  observacion_interna_logistica text,
  eta                           date,
  observacion                   text,
  adjuntos                      text[] not null default '{}',
  recepcion_observacion         text,
  recepcion_fecha               timestamptz,
  recibido_por                  text,
  habilitar_recepcion_manual    boolean not null default false,
  creado_en                     timestamptz not null default now(),
  creado_por                    text,
  actualizado_en                timestamptz not null default now(),
  actualizado_por               text,
  check ((origen_sede_id is null) <> (origen_almacen_id is null)),
  check ((destino_sede_id is null) <> (destino_almacen_id is null)),
  -- Uno de los extremos es siempre el almacén y el otro una sede (entre dos sedes todo pasa por el almacén)
  check ((origen_almacen_id is not null) <> (destino_almacen_id is not null))
);
create trigger transferencias_huella before insert or update on public.transferencias for each row execute function app.catalogo_huella();
create index transferencias_origen_idx on public.transferencias (origen_id);
create index transferencias_destino_idx on public.transferencias (destino_id);
comment on table public.transferencias is 'Solicitud con aprobación para mover mercadería entre el almacén central y una sede (en cualquier sentido). Nadie escribe directo: solo las funciones de transferencias.';

-- ---------------------------------------------------------------------------------------------------------------------
-- Incidencias de recepción (solo se agregan)
-- ---------------------------------------------------------------------------------------------------------------------

create table public.incidencias_recepcion (
  numero        bigint generated always as identity primary key,
  id            text generated always as ('INC-' || lpad(numero::text, 3, '0')) stored unique,
  fecha         timestamptz not null default now(),
  doc_tipo      text not null check (doc_tipo in ('Envío', 'Transferencia')),
  doc_id        text not null,
  articulo_id   text not null references public.articulos (id) on delete restrict,
  tipo          text not null check (tipo in ('missing', 'damaged', 'extra')),
  cantidad      integer not null check (cantidad >= 0),
  observacion   text not null default '',
  sede_id       text references public.sedes (id) on delete restrict,
  almacen_id    text references public.almacenes (id) on delete restrict,
  ubicacion_id  text generated always as (coalesce(sede_id, almacen_id)) stored,
  check ((sede_id is null) <> (almacen_id is null))
);
create index incidencias_doc_idx on public.incidencias_recepcion (doc_id);
comment on table public.incidencias_recepcion is 'Lo que faltó, llegó dañado o de más al recibir un envío o una transferencia. Solo se agrega.';

create trigger incidencias_no_cambian before update or delete on public.incidencias_recepcion for each row execute function app.libro_inmutable();
create trigger incidencias_no_vaciar before truncate on public.incidencias_recepcion for each statement execute function app.libro_inmutable();

-- ---------------------------------------------------------------------------------------------------------------------
-- Ayudantes de validación
-- ---------------------------------------------------------------------------------------------------------------------

create function app.jtexto(p jsonb, p_clave text) returns text
language sql immutable set search_path = '' as $$
  select nullif(btrim(coalesce(p->>p_clave, '')), '');
$$;

-- Año de Lima (los códigos ENV-AAAA-NNN y TRF-AAAA-NNN reinician cada año).
create function app.anio_hoy() returns integer
language sql stable set search_path = '' as $$
  select extract(year from app.hoy())::integer;
$$;

-- Comprueba el detalle (lineas) y, si hay, las cajas: al menos un artículo, cada uno existente, sin repetir y con cantidad entera mayor a 0;
-- cada caja con al menos un artículo; y la suma de las cajas igual al detalle.
create function app.validar_detalle(p_lineas jsonb, p_cajas jsonb) returns void
language plpgsql stable security definer set search_path = '' as $$
declare
  v_linea  jsonb;
  v_caja   jsonb;
  v_item   jsonb;
  v_cant   numeric;
  v_vistos text[] := '{}';
  v_n      integer := 0;
begin
  if jsonb_typeof(p_lineas) is distinct from 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'Debe agregar al menos un artículo.' using errcode = 'EN001';
  end if;
  for v_linea in select * from jsonb_array_elements(p_lineas) loop
    v_cant := case when jsonb_typeof(v_linea->'cantidad') = 'number' then (v_linea->>'cantidad')::numeric else null end;
    if jsonb_typeof(v_linea) is distinct from 'object' or coalesce(v_linea->>'articulo_id', '') = '' then
      raise exception 'Hay un artículo sin seleccionar.' using errcode = 'EN001';
    end if;
    if v_cant is null or v_cant < 1 or v_cant <> trunc(v_cant) then raise exception 'La cantidad debe ser un número entero mayor a 0.' using errcode = 'EN001'; end if;
    if (v_linea->>'articulo_id') = any (v_vistos) then raise exception 'Hay artículos repetidos en el detalle.' using errcode = 'EN001'; end if;
    v_vistos := v_vistos || (v_linea->>'articulo_id');
    if not exists (select 1 from public.articulos a where a.id = v_linea->>'articulo_id') then
      raise exception 'Un artículo no existe en el catálogo.' using errcode = 'EN001';
    end if;
  end loop;

  if jsonb_typeof(p_cajas) = 'array' and jsonb_array_length(p_cajas) > 0 then
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
    -- La suma de las cajas es el detalle
    if exists (
      (select c.articulo, c.cantidad from app.sumar_cajas(p_cajas) c except select l->>'articulo_id', (l->>'cantidad')::integer from jsonb_array_elements(p_lineas) l)
      union all
      (select l->>'articulo_id', (l->>'cantidad')::integer from jsonb_array_elements(p_lineas) l except select c.articulo, c.cantidad from app.sumar_cajas(p_cajas) c)
    ) then
      raise exception 'Las cantidades de las cajas no coinciden con el detalle.' using errcode = 'EN001';
    end if;
  end if;
end;
$$;

-- Suma por artículo de lo que llevan las cajas.
create function app.sumar_cajas(p_cajas jsonb) returns table (articulo text, cantidad integer)
language sql stable set search_path = '' as $$
  select i->>'articulo_id', sum((i->>'cantidad')::numeric)::integer
  from jsonb_array_elements(p_cajas) c, jsonb_array_elements(c->'items') i
  group by 1;
$$;

-- El transporte según el método: «Courier» pide courier y guía; «Viajero», quién lleva la carga; otro método puede pedir una observación.
create function app.validar_transporte(p_metodo text, p_courier text, p_guia text, p_viajero text, p_observacion text, p_exigir_observacion boolean) returns void
language plpgsql stable security definer set search_path = '' as $$
declare
  v_nombre text;
begin
  select lower(m.nombre) into v_nombre from public.metodos_envio m where m.id = p_metodo;
  if v_nombre is null then raise exception 'Elija el método de envío.' using errcode = 'EN001'; end if;
  if v_nombre like '%courier%' then
    if p_courier is null or p_guia is null then raise exception 'Para envíos por Courier, debe seleccionar el Courier y el número de guía.' using errcode = 'EN001'; end if;
  elsif v_nombre like '%viajero%' then
    if p_viajero is null then raise exception 'Para envíos por Viajero, debe ingresar el nombre de la persona que transporta.' using errcode = 'EN001'; end if;
  elsif p_exigir_observacion and p_observacion is null then
    raise exception 'Debe ingresar una observación para el método de envío seleccionado.' using errcode = 'EN001';
  end if;
end;
$$;

-- La ruta de un envío: sale del almacén central (el único activo) hacia una sede activa.
create function app.validar_ruta_envio(p_almacen text, p_sede text) returns void
language plpgsql stable security definer set search_path = '' as $$
declare
  v_alm  public.almacenes;
  v_sede public.sedes;
begin
  select * into v_alm from public.almacenes a where a.id = p_almacen;
  if not found or v_alm.estado <> 'Activo' then raise exception 'Los envíos salen del almacén central.' using errcode = 'EN001'; end if;
  if coalesce(p_sede, '') = '' then raise exception 'Indique la filial de destino.' using errcode = 'EN001'; end if;
  select * into v_sede from public.sedes s where s.id = p_sede;
  if not found then raise exception 'La filial de destino no existe.' using errcode = 'EN001'; end if;
  if v_sede.estado <> 'Activo' then raise exception 'La filial % está inactiva.', v_sede.nombre using errcode = 'EN001'; end if;
end;
$$;

-- Los extremos de una transferencia: uno es el almacén central y el otro una sede activa.
create function app.validar_ruta_transferencia(p_origen text, p_destino text) returns void
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

-- Siguiente código del año (ENV-2026-001): se numera con la mesa bloqueada para que dos personas a la vez no repitan.
create function app.siguiente_codigo(p_prefijo text, p_tabla text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_base text := p_prefijo || '-' || app.anio_hoy() || '-';
  v_max  integer;
begin
  perform pg_advisory_xact_lock(hashtext(p_tabla));
  if p_tabla = 'envios' then
    select coalesce(max(substring(e.id from length(v_base) + 1)::integer), 0) into v_max from public.envios e where e.id like v_base || '%';
  else
    select coalesce(max(substring(t.id from length(v_base) + 1)::integer), 0) into v_max from public.transferencias t where t.id like v_base || '%';
  end if;
  return v_base || lpad((v_max + 1)::text, 3, '0');
end;
$$;

-- Mueve todas las líneas de un documento: `p_signo` = -1 descuenta, 1 suma.
create function app.mover_lineas(p_ubicacion text, p_lineas jsonb, p_signo integer, p_tipo text, p_documento text, p_observacion text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_linea jsonb;
begin
  for v_linea in select * from jsonb_array_elements(p_lineas) loop
    perform app.mover_stock(p_ubicacion, v_linea->>'articulo_id', p_signo * (v_linea->>'cantidad')::integer, p_tipo, p_documento, p_observacion);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Envíos: funciones
-- ---------------------------------------------------------------------------------------------------------------------

-- Valida lo que el formulario exige antes de guardar un envío (borrador o para despachar).
create function app.envio_validar_contenido(e public.envios) returns void
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

-- Despacha un envío en borrador: el stock sale del almacén de origen (todo o nada) y queda En tránsito.
create function app.despachar_envio(p_id text) returns void
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

-- Crea un envío en borrador y, si `estado` es «En tránsito», lo despacha en la misma operación (todo o nada). Devuelve el código.
create function public.crear_envio(p jsonb) returns text
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

-- Edita un envío en borrador (todos los datos) o, ya despachado, habilita su recepción manual. Con `estado` = «En tránsito» lo despacha.
create function public.editar_envio(p_id text, p jsonb) returns void
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

-- Cambia el estado de un envío: marcarlo listo para recepción, cancelarlo (devuelve lo que ya salió) o despacharlo.
create function public.cambiar_estado_envio(p_id text, p_estado text, p_observacion text) returns void
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

-- Elimina un borrador (un envío despachado no se elimina: se cancela).
create function public.eliminar_envio(p_id text) returns void
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

-- ---------------------------------------------------------------------------------------------------------------------
-- Transferencias: funciones
-- ---------------------------------------------------------------------------------------------------------------------

-- Lo que el formulario de solicitud exige: ruta, motivo y detalle.
create function app.transferencia_validar_solicitud(t public.transferencias) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.validar_ruta_transferencia(t.origen_id, t.destino_id);
  if btrim(coalesce(t.motivo, '')) = '' then raise exception 'Por favor complete los campos obligatorios (*) y agregue al menos un artículo.' using errcode = 'EN001'; end if;
  perform app.validar_detalle(t.lineas, '[]'::jsonb);
end;
$$;

-- Crea una transferencia: en borrador o ya solicitada. Devuelve el código.
create function public.crear_transferencia(p jsonb) returns text
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

-- Edita una transferencia: en borrador, la solicitud (ruta, motivo, detalle); aprobada, los datos del despacho (cajas, transporte); despachada,
-- solo habilita su recepción manual. Los datos del despacho piden despachar; los de la solicitud, solicitar.
create function public.editar_transferencia(p_id text, p jsonb) returns void
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

-- Despacha una transferencia aprobada: el stock sale del origen (todo o nada) y queda En tránsito.
create function app.despachar_transferencia(p_id text) returns void
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

-- Cambia el estado de una transferencia siguiendo su camino: solicitar, aprobar o rechazar, despachar, marcar lista para recepción, cancelar.
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

-- ---------------------------------------------------------------------------------------------------------------------
-- Recepción de un envío o de una transferencia
-- ---------------------------------------------------------------------------------------------------------------------

-- `p_lineas`: lista de {articulo_id, cantidad, estado ('ok' | 'missing' | 'damaged' | 'extra'), observacion}. Suma al stock del destino lo recibido,
-- registra una incidencia por cada diferencia y deja el documento recibido (con o sin diferencias). Todo o nada; solo sobre un documento en tránsito.
create function public.confirmar_recepcion(p_tipo text, p_doc text, p_lineas jsonb, p_observacion text) returns void
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
begin
  if p_tipo = 'Envío' then
    perform app.exigir('log-recepciones:confirm', 'Confirmar la recepción de un envío');
    select e.sede_destino_id, e.estado, e.lineas into v_destino, v_estado, v_lineas from public.envios e where e.id = p_doc for update;
  elsif p_tipo = 'Transferencia' then
    perform app.exigir('log-transfer:receive', 'Recepcionar transferencia');
    select t.destino_id, t.estado, t.lineas into v_destino, v_estado, v_lineas from public.transferencias t where t.id = p_doc for update;
  else
    raise exception 'No se encontró el documento a recepcionar.' using errcode = 'EN001';
  end if;
  if v_estado is null then raise exception 'No se encontró el documento a recepcionar.' using errcode = 'EN001'; end if;
  if v_estado not in ('En tránsito', 'Listo para recepción') then
    raise exception 'El % % está «%»: solo se recibe lo que está en tránsito.', lower(p_tipo), p_doc, v_estado using errcode = 'EN001';
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

-- ---------------------------------------------------------------------------------------------------------------------
-- Lo que tiene documentos no se elimina (las guardas de sedes y almacén ahora miran también los envíos y transferencias)
-- ---------------------------------------------------------------------------------------------------------------------

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
  if exists (select 1 from public.stock s where s.sede_id = old.id) or exists (select 1 from public.kardex k where k.sede_id = old.id)
     or exists (select 1 from public.envios e where e.sede_destino_id = old.id)
     or exists (select 1 from public.transferencias t where t.origen_sede_id = old.id or t.destino_sede_id = old.id) then
    raise exception 'No se puede eliminar la filial: tiene stock, movimientos, envíos o transferencias. Inactívela si ya no se usa.' using errcode = 'EN001';
  end if;
  return old;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Permisos de tabla y RLS: solo se lee (los catálogos de transporte también se escriben, con su función del registro)
-- ---------------------------------------------------------------------------------------------------------------------

revoke all on public.couriers, public.metodos_envio, public.envios, public.transferencias, public.incidencias_recepcion from public, anon, authenticated;
grant select, insert, update on public.couriers, public.metodos_envio to authenticated;
grant select on public.envios, public.transferencias, public.incidencias_recepcion to authenticated;

alter table public.couriers              enable row level security;
alter table public.metodos_envio         enable row level security;
alter table public.envios                enable row level security;
alter table public.transferencias        enable row level security;
alter table public.incidencias_recepcion enable row level security;

create policy couriers_leer on public.couriers for select to authenticated using ((select app.acceso_vigente()));
create policy couriers_crear on public.couriers for insert to authenticated with check ((select app.tiene_funcion('cfg-couriers:create')));
create policy couriers_editar on public.couriers for update to authenticated
  using ((select app.tiene_funcion('cfg-couriers:edit'))) with check ((select app.tiene_funcion('cfg-couriers:edit')));

create policy metodos_envio_leer on public.metodos_envio for select to authenticated using ((select app.acceso_vigente()));
create policy metodos_envio_crear on public.metodos_envio for insert to authenticated with check ((select app.tiene_funcion('cfg-couriers:create')));
create policy metodos_envio_editar on public.metodos_envio for update to authenticated
  using ((select app.tiene_funcion('cfg-couriers:edit'))) with check ((select app.tiene_funcion('cfg-couriers:edit')));

create policy envios_leer on public.envios for select to authenticated
  using ((select app.tiene_funcion('log-envios:view') or app.tiene_funcion('log-recepciones:view'))
    and ((select app.puede_ver_ubicacion(null, almacen_origen_id)) or (select app.puede_ver_ubicacion(sede_destino_id, null))));
create policy transferencias_leer on public.transferencias for select to authenticated
  using ((select app.tiene_funcion('log-transfer:view') or app.tiene_funcion('log-recepciones:view'))
    and ((select app.puede_ver_ubicacion(origen_sede_id, origen_almacen_id)) or (select app.puede_ver_ubicacion(destino_sede_id, destino_almacen_id))));
create policy incidencias_leer on public.incidencias_recepcion for select to authenticated
  using ((select app.tiene_funcion('log-recepciones:view') or app.tiene_funcion('log-transfer:view') or app.tiene_funcion('log-ajustes:view'))
    and (select app.puede_ver_ubicacion(sede_id, almacen_id)));

revoke execute on function
  public.crear_envio(jsonb), public.editar_envio(text, jsonb), public.cambiar_estado_envio(text, text, text), public.eliminar_envio(text),
  public.crear_transferencia(jsonb), public.editar_transferencia(text, jsonb), public.cambiar_estado_transferencia(text, text),
  public.confirmar_recepcion(text, text, jsonb, text)
  from public, anon;
grant execute on function
  public.crear_envio(jsonb), public.editar_envio(text, jsonb), public.cambiar_estado_envio(text, text, text), public.eliminar_envio(text),
  public.crear_transferencia(jsonb), public.editar_transferencia(text, jsonb), public.cambiar_estado_transferencia(text, text),
  public.confirmar_recepcion(text, text, jsonb, text)
  to authenticated;
revoke execute on all functions in schema app from public, anon;
grant execute on all functions in schema app to authenticated;

commit;
