-- =====================================================================================================================
-- 0012 · Stock, kardex y ajustes en la base (Lote 6, primera parte)
-- ---------------------------------------------------------------------------------------------------------------------
--   · `stock`: cuántas unidades de cada artículo hay en cada ubicación (el almacén central o una sede) y su mínimo de alerta. NADIE escribe
--     la cantidad directamente: solo cambia con un movimiento (`app.mover_stock`), que en una sola operación descuenta o suma, comprueba que
--     el saldo no quede negativo y deja la línea del kardex. Si algo falla, no queda nada a medias.
--   · `kardex`: el libro de movimientos. Solo se agrega: no se modifica ni se borra (un error se corrige con un ajuste). Cada línea guarda el
--     saldo anterior, el saldo nuevo, quién lo hizo y el documento que lo respalda. Los nombres del artículo y del lugar NO se guardan
--     (salen de sus ids).
--   · `ajustes`: ajustes, mermas, devoluciones y regularizaciones, cada una con su motivo; también solo se agrega. Cada ajuste deja su línea
--     en el kardex.
--   · Funciones públicas (la base vuelve a comprobar lo que comprueba la pantalla y pide la función del registro de cada una):
--       registrar_ingreso_stock · registrar_ajuste_stock · empaquetar_articulo · desempaquetar_articulo · definir_stock_minimo
--       vender_articulo (descuenta el stock de la venta en caja) · entregar_materiales (verificación de la matrícula)
--       reponer_por_reversa (devuelve al stock una venta reversada en caja)
--   · Quién mueve: una sede, quien la alcanza; el almacén, solo el Superusuario o quien trabaja en él (ver el almacén no autoriza a moverlo).
--     Quién ve: el stock de las sedes que alcanza y el del almacén si lo ve (alcance total o asignado).
--   · El almacén no se inactiva con mercadería dentro, y una sede con stock o movimientos no se elimina (se inactiva).
-- Los errores de negocio usan el código EN001: el sistema muestra su texto tal cual (está en español).
-- Para deshacer: supabase/deshacer/20261109100000_stock_y_kardex.down.sql
-- =====================================================================================================================

begin;

-- ---------------------------------------------------------------------------------------------------------------------
-- Ayudantes
-- ---------------------------------------------------------------------------------------------------------------------

-- Los ids de almacén son `ALM-NNN`; los de las sedes, `FIL-NNN`: nunca chocan.
create function app.ubicacion_es_almacen(p_ubicacion text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(p_ubicacion ~ '^ALM-[0-9]{3,}$', false);
$$;

-- Quien llama tiene la función; si no, el mensaje nombra la función tal como la ve en Permisos.
create function app.exigir(p_funcion text, p_etiqueta text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.permite(p_funcion) then
    raise exception 'Su rol no tiene la función «%».', p_etiqueta using errcode = 'EN001';
  end if;
end;
$$;

-- ¿Puede MOVER el stock de esa ubicación? Una sede, quien la alcanza; el almacén, el Superusuario o quien trabaja en él.
-- Las escrituras sin sesión (el editor SQL) no se frenan aquí.
create function app.puede_mover(p_ubicacion text) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is null or case when app.ubicacion_es_almacen(p_ubicacion) then app.ve_almacen(p_ubicacion) else app.ve_sede(p_ubicacion) end;
$$;

create function app.exigir_mover(p_ubicacion text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.puede_mover(p_ubicacion) then
    if app.ubicacion_es_almacen(p_ubicacion) then
      raise exception 'Su cuenta no está asignada a ese almacén: ver su stock no autoriza a moverlo.' using errcode = 'EN001';
    end if;
    raise exception 'Esa sede no está entre las que alcanza su cuenta.' using errcode = 'EN001';
  end if;
end;
$$;

-- ¿Puede VER lo de esa ubicación? Una sede que alcanza, o el almacén si lo ve (alcance total o asignado).
create function app.puede_ver_ubicacion(p_sede text, p_almacen text) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.acceso_vigente() and ((p_sede is not null and app.ve_sede(p_sede)) or (p_almacen is not null and app.ve_almacen_lectura(p_almacen)));
$$;

-- Nombre de una ubicación (para los mensajes).
create function app.nombre_ubicacion(p_ubicacion text) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select a.nombre from public.almacenes a where a.id = p_ubicacion),
    (select s.nombre from public.sedes s where s.id = p_ubicacion),
    p_ubicacion);
$$;

create sequence app.seq_empaquetado;
create sequence app.seq_desempaquetado;

-- ---------------------------------------------------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------------------------------------------------

create table public.stock (
  numero         bigint generated always as identity primary key,
  id             text generated always as ('STK-' || lpad(numero::text, 3, '0')) stored unique,
  articulo_id    text not null references public.articulos (id) on delete restrict,
  sede_id        text references public.sedes (id) on delete restrict,
  almacen_id     text references public.almacenes (id) on delete restrict,
  ubicacion_id   text generated always as (coalesce(sede_id, almacen_id)) stored,
  cantidad       integer not null default 0 check (cantidad >= 0),
  minimo         integer not null default 0 check (minimo >= 0),
  actualizado_en timestamptz not null default now(),
  check ((sede_id is null) <> (almacen_id is null))
);
create unique index stock_articulo_ubicacion on public.stock (articulo_id, ubicacion_id);
create index stock_ubicacion_idx on public.stock (ubicacion_id);
comment on table public.stock is 'Unidades de cada artículo en cada ubicación (almacén central o sede) y su mínimo de alerta. La cantidad solo cambia con un movimiento (app.mover_stock), que deja su línea en el kardex.';

create table public.kardex (
  numero         bigint generated always as identity primary key,
  id             text generated always as ('KDX-' || lpad(numero::text, 3, '0')) stored unique,
  fecha          timestamptz not null default now(),
  articulo_id    text not null references public.articulos (id) on delete restrict,
  sede_id        text references public.sedes (id) on delete restrict,
  almacen_id     text references public.almacenes (id) on delete restrict,
  ubicacion_id   text generated always as (coalesce(sede_id, almacen_id)) stored,
  tipo           text not null check (tipo in ('Ingreso', 'Salida', 'Transferencia Salida', 'Transferencia Entrada', 'Ajuste Positivo', 'Ajuste Negativo', 'Merma',
                   'Venta', 'Entrega por Verificación', 'Empaquetado', 'Desempaquetado', 'Regularización Administrativa', 'Salida por matrícula',
                   'Transferencia', 'Ajuste', 'Devolución')),
  cantidad       integer not null check (cantidad <> 0),
  saldo_anterior integer not null check (saldo_anterior >= 0),
  saldo_nuevo    integer not null check (saldo_nuevo >= 0),
  usuario        text not null,
  documento      text not null default 'S/N',
  observacion    text,
  check ((sede_id is null) <> (almacen_id is null)),
  check (saldo_nuevo = saldo_anterior + cantidad)
);
create index kardex_ubicacion_idx on public.kardex (ubicacion_id, numero desc);
create index kardex_articulo_idx on public.kardex (articulo_id, numero desc);
comment on table public.kardex is 'Libro de movimientos de stock: solo se agrega (no se modifica ni se borra; un error se corrige con un ajuste). Los nombres del artículo y del lugar salen de sus ids.';

create table public.ajustes (
  numero       bigint generated always as identity primary key,
  id           text generated always as ('ADJ-' || lpad(numero::text, 3, '0')) stored unique,
  fecha        timestamptz not null default now(),
  articulo_id  text not null references public.articulos (id) on delete restrict,
  sede_id      text references public.sedes (id) on delete restrict,
  almacen_id   text references public.almacenes (id) on delete restrict,
  ubicacion_id text generated always as (coalesce(sede_id, almacen_id)) stored,
  tipo         text not null check (tipo in ('Ajuste Positivo', 'Ajuste Negativo', 'Merma', 'Regularización Administrativa', 'Devolución')),
  cantidad     integer not null check (cantidad <> 0),
  motivo       text not null check (length(btrim(motivo)) >= 1),
  observacion  text,
  usuario      text not null,
  check ((sede_id is null) <> (almacen_id is null))
);
create index ajustes_ubicacion_idx on public.ajustes (ubicacion_id, numero desc);
comment on table public.ajustes is 'Ajustes, mermas, devoluciones y regularizaciones de stock, cada una con su motivo. Solo se agrega; cada una deja su línea en el kardex.';

-- ---------------------------------------------------------------------------------------------------------------------
-- Lo que no se toca a mano: el kardex y los ajustes solo se agregan; el stock solo cambia con un movimiento
-- ---------------------------------------------------------------------------------------------------------------------

create function app.libro_inmutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'El kardex y los ajustes no se modifican ni se borran: un error se corrige con un ajuste.' using errcode = 'EN001';
end;
$$;
create trigger kardex_no_cambia before update or delete on public.kardex for each row execute function app.libro_inmutable();
create trigger kardex_no_vaciar before truncate on public.kardex for each statement execute function app.libro_inmutable();
create trigger ajustes_no_cambian before update or delete on public.ajustes for each row execute function app.libro_inmutable();
create trigger ajustes_no_vaciar before truncate on public.ajustes for each statement execute function app.libro_inmutable();

create function app.stock_solo_por_movimientos() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'El stock no se borra: se ajusta con un movimiento.' using errcode = 'EN001';
  end if;
  if coalesce(current_setting('app.mueve_stock', true), '') <> 'on' and (tg_op = 'INSERT' or new.cantidad is distinct from old.cantidad) then
    raise exception 'La cantidad en stock solo cambia con un movimiento (ingreso, salida, ajuste, envío…): así queda en el kardex.' using errcode = 'EN001';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger stock_solo_movimientos before insert or update or delete on public.stock for each row execute function app.stock_solo_por_movimientos();

-- ---------------------------------------------------------------------------------------------------------------------
-- El movimiento: la única forma de cambiar una cantidad. Todo o nada (si el saldo quedaría negativo, no se mueve nada).
-- ---------------------------------------------------------------------------------------------------------------------

create function app.mover_stock(p_ubicacion text, p_articulo text, p_cantidad integer, p_tipo text, p_documento text, p_observacion text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_alm    boolean := app.ubicacion_es_almacen(p_ubicacion);
  v_nombre text;
  v_lugar  text;
  v_stock  public.stock;
begin
  if p_cantidad is null or p_cantidad = 0 then raise exception 'La cantidad debe ser distinta de cero.' using errcode = 'EN001'; end if;
  select a.nombre into v_nombre from public.articulos a where a.id = p_articulo;
  if not found then raise exception 'No se encontró el artículo.' using errcode = 'EN001'; end if;
  if v_alm then select a.nombre into v_lugar from public.almacenes a where a.id = p_ubicacion;
  else select s.nombre into v_lugar from public.sedes s where s.id = p_ubicacion; end if;
  if v_lugar is null then raise exception 'La sede o el almacén indicado no existe.' using errcode = 'EN001'; end if;

  perform set_config('app.mueve_stock', 'on', true);
  if v_alm then
    insert into public.stock (articulo_id, almacen_id) values (p_articulo, p_ubicacion) on conflict (articulo_id, ubicacion_id) do nothing;
  else
    insert into public.stock (articulo_id, sede_id) values (p_articulo, p_ubicacion) on conflict (articulo_id, ubicacion_id) do nothing;
  end if;
  select * into v_stock from public.stock s where s.articulo_id = p_articulo and s.ubicacion_id = p_ubicacion for update;

  if v_stock.cantidad + p_cantidad < 0 then
    raise exception 'Stock insuficiente de "%" en %: disponible %, se intentó descontar %.', v_nombre, v_lugar, v_stock.cantidad, -p_cantidad using errcode = 'EN001';
  end if;
  update public.stock s set cantidad = s.cantidad + p_cantidad, actualizado_en = now() where s.numero = v_stock.numero;
  insert into public.kardex (articulo_id, sede_id, almacen_id, tipo, cantidad, saldo_anterior, saldo_nuevo, usuario, documento, observacion)
  values (p_articulo, case when v_alm then null else p_ubicacion end, case when v_alm then p_ubicacion else null end, p_tipo, p_cantidad,
    v_stock.cantidad, v_stock.cantidad + p_cantidad, app.quien(null), coalesce(nullif(btrim(coalesce(p_documento, '')), ''), 'S/N'), nullif(btrim(coalesce(p_observacion, '')), ''));
end;
$$;

-- Unidades disponibles (0 si no hay fila).
create function app.stock_disponible(p_ubicacion text, p_articulo text) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce((select s.cantidad from public.stock s where s.articulo_id = p_articulo and s.ubicacion_id = p_ubicacion), 0);
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Funciones públicas
-- ---------------------------------------------------------------------------------------------------------------------

-- Ingreso de stock (compra o reposición) con el documento que lo respalda.
create function public.registrar_ingreso_stock(p_ubicacion text, p_articulo text, p_cantidad integer, p_documento text, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.exigir('log-stock:entry', 'Registrar un ingreso de stock (compra o reposición)');
  if coalesce(p_ubicacion, '') = '' or coalesce(p_articulo, '') = '' then raise exception 'Elija la sede y el artículo.' using errcode = 'EN001'; end if;
  if p_cantidad is null or p_cantidad < 1 then raise exception 'La cantidad debe ser un número entero mayor a 0.' using errcode = 'EN001'; end if;
  if btrim(coalesce(p_documento, '')) = '' then raise exception 'Indique el documento que respalda el ingreso (factura, guía o acta).' using errcode = 'EN001'; end if;
  perform app.exigir_mover(p_ubicacion);
  perform app.mover_stock(p_ubicacion, p_articulo, p_cantidad, 'Ingreso', btrim(p_documento), coalesce(nullif(btrim(coalesce(p_motivo, '')), ''), 'Ingreso manual de stock'));
end;
$$;

-- Ajuste, merma, devolución o regularización: el tipo define el signo (la regularización admite ambos). Devuelve el código del ajuste.
create function public.registrar_ajuste_stock(p_ubicacion text, p_articulo text, p_tipo text, p_cantidad integer, p_motivo text, p_observacion text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_id text;
  v_alm boolean := app.ubicacion_es_almacen(p_ubicacion);
begin
  perform app.exigir('log-ajustes:create', 'Registrar un ajuste o una merma');
  if coalesce(p_ubicacion, '') = '' or coalesce(p_articulo, '') = '' then raise exception 'Elija la sede y el artículo.' using errcode = 'EN001'; end if;
  if p_tipo is null or p_tipo not in ('Ajuste Positivo', 'Ajuste Negativo', 'Merma', 'Regularización Administrativa', 'Devolución') then
    raise exception 'Elija el tipo de ajuste.' using errcode = 'EN001';
  end if;
  if p_cantidad is null or p_cantidad = 0 then raise exception 'La cantidad no puede ser 0.' using errcode = 'EN001'; end if;
  if p_tipo in ('Ajuste Positivo', 'Devolución') and p_cantidad < 0 then raise exception 'Un ajuste positivo o una devolución suma unidades: la cantidad debe ser mayor a 0.' using errcode = 'EN001'; end if;
  if p_tipo in ('Ajuste Negativo', 'Merma') and p_cantidad > 0 then raise exception 'Un ajuste negativo o una merma descuenta unidades: la cantidad debe ser menor a 0.' using errcode = 'EN001'; end if;
  if btrim(coalesce(p_motivo, '')) = '' then raise exception 'Indique el motivo del ajuste.' using errcode = 'EN001'; end if;
  if not exists (select 1 from public.articulos a where a.id = p_articulo) then raise exception 'No se encontró el artículo.' using errcode = 'EN001'; end if;
  if not exists (select 1 from public.almacenes a where a.id = p_ubicacion) and not exists (select 1 from public.sedes s where s.id = p_ubicacion) then
    raise exception 'La sede o el almacén indicado no existe.' using errcode = 'EN001';
  end if;
  perform app.exigir_mover(p_ubicacion);
  insert into public.ajustes (articulo_id, sede_id, almacen_id, tipo, cantidad, motivo, observacion, usuario)
  values (p_articulo, case when v_alm then null else p_ubicacion end, case when v_alm then p_ubicacion else null end, p_tipo, p_cantidad, btrim(p_motivo),
    nullif(btrim(coalesce(p_observacion, '')), ''), app.quien(null))
  returning id into v_id;
  perform app.mover_stock(p_ubicacion, p_articulo, p_cantidad, p_tipo, v_id, btrim(p_motivo));
  return v_id;
end;
$$;

-- Estado de un paquete con composición (sus componentes salen del propio artículo).
create function app.paquete_de(p_articulo text, p_exigir_desempaque boolean) returns public.articulos
language plpgsql stable security definer set search_path = '' as $$
declare
  v_art public.articulos;
begin
  select * into v_art from public.articulos a where a.id = p_articulo;
  if not found or not v_art.es_paquete or v_art.composicion is null then raise exception 'El artículo no es un paquete con composición.' using errcode = 'EN001'; end if;
  if jsonb_array_length(v_art.composicion) = 0 then raise exception 'El paquete no tiene composición definida.' using errcode = 'EN001'; end if;
  if p_exigir_desempaque and not v_art.permite_desempaquetar then raise exception 'Este paquete no permite desempaquetado.' using errcode = 'EN001'; end if;
  return v_art;
end;
$$;

-- Arma una unidad del paquete: descuenta sus componentes y suma 1 al paquete, todo o nada.
create function public.empaquetar_articulo(p_ubicacion text, p_articulo text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_art  public.articulos;
  v_comp record;
  v_doc  text := 'EMP-' || lpad(nextval('app.seq_empaquetado')::text, 3, '0');
begin
  perform app.exigir('log-stock:pack', 'Armar y abrir paquetes');
  perform app.exigir_mover(p_ubicacion);
  v_art := app.paquete_de(p_articulo, false);
  for v_comp in select c->>'articulo_id' as articulo, (c->>'cantidad')::integer as cantidad from jsonb_array_elements(v_art.composicion) c loop
    if app.stock_disponible(p_ubicacion, v_comp.articulo) < v_comp.cantidad then
      raise exception 'No hay stock suficiente de todos los componentes para empaquetar. Stock insuficiente de "%" en %: disponible %, requerido %.',
        (select a.nombre from public.articulos a where a.id = v_comp.articulo), app.nombre_ubicacion(p_ubicacion), app.stock_disponible(p_ubicacion, v_comp.articulo), v_comp.cantidad
        using errcode = 'EN001';
    end if;
  end loop;
  for v_comp in select c->>'articulo_id' as articulo, (c->>'cantidad')::integer as cantidad from jsonb_array_elements(v_art.composicion) c loop
    perform app.mover_stock(p_ubicacion, v_comp.articulo, -v_comp.cantidad, 'Empaquetado', v_doc, 'Componente para ' || v_art.nombre);
  end loop;
  perform app.mover_stock(p_ubicacion, p_articulo, 1, 'Empaquetado', v_doc, 'Empaquetado de ' || v_art.nombre);
end;
$$;

-- Abre una unidad del paquete: resta 1 al paquete y suma sus componentes, todo o nada.
create function public.desempaquetar_articulo(p_ubicacion text, p_articulo text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_art  public.articulos;
  v_comp record;
  v_doc  text := 'DESEMP-' || lpad(nextval('app.seq_desempaquetado')::text, 3, '0');
begin
  perform app.exigir('log-stock:pack', 'Armar y abrir paquetes');
  perform app.exigir_mover(p_ubicacion);
  v_art := app.paquete_de(p_articulo, true);
  perform app.mover_stock(p_ubicacion, p_articulo, -1, 'Desempaquetado', v_doc, 'Desempaquetado de ' || v_art.nombre);
  for v_comp in select c->>'articulo_id' as articulo, (c->>'cantidad')::integer as cantidad from jsonb_array_elements(v_art.composicion) c loop
    perform app.mover_stock(p_ubicacion, v_comp.articulo, v_comp.cantidad, 'Desempaquetado', v_doc, 'Componente de ' || v_art.nombre);
  end loop;
end;
$$;

-- Stock mínimo de alerta de un artículo en una ubicación que ya tiene su fila.
create function public.definir_stock_minimo(p_ubicacion text, p_articulo text, p_minimo integer) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.exigir('log-stock:edit_min', 'Definir el stock mínimo');
  if p_minimo is null or p_minimo < 0 then raise exception 'El stock mínimo debe ser un número entero de 0 en adelante.' using errcode = 'EN001'; end if;
  perform app.exigir_mover(p_ubicacion);
  update public.stock s set minimo = p_minimo, actualizado_en = now() where s.articulo_id = p_articulo and s.ubicacion_id = p_ubicacion;
  if not found then raise exception 'No se encontró el registro de stock.' using errcode = 'EN001'; end if;
end;
$$;

-- Venta de un artículo en caja: solo en una sede, con el artículo activo y a la venta, con precio vigente y stock suficiente.
create function public.vender_articulo(p_sede text, p_articulo text, p_cantidad integer, p_documento text, p_observacion text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_art public.articulos;
begin
  perform app.exigir('op-caja:sell_item', 'Vender un artículo en caja');
  if coalesce(p_sede, '') = '' or coalesce(p_articulo, '') = '' then raise exception 'Por favor complete todos los campos obligatorios.' using errcode = 'EN001'; end if;
  if app.ubicacion_es_almacen(p_sede) then raise exception 'El almacén central no vende: registre la venta en una sede.' using errcode = 'EN001'; end if;
  select * into v_art from public.articulos a where a.id = p_articulo;
  if not found or not v_art.se_vende or v_art.estado <> 'Activo' then raise exception 'El artículo no está habilitado para la venta.' using errcode = 'EN001'; end if;
  if not exists (
    select 1 from public.articulo_precios p
    where p.articulo_id = p_articulo and (p.sede_id = p_sede or p.sede_id is null) and p.vigente_desde <= app.hoy() and (p.vigente_hasta is null or app.hoy() <= p.vigente_hasta)
  ) then
    raise exception 'El artículo no tiene un precio de venta vigente. Configúrelo en Logística → Catálogo de artículos.' using errcode = 'EN001';
  end if;
  if p_cantidad is null or p_cantidad < 1 then raise exception 'La cantidad debe ser un número entero mayor a 0.' using errcode = 'EN001'; end if;
  if app.stock_disponible(p_sede, p_articulo) < p_cantidad then raise exception 'No hay stock suficiente para realizar la venta.' using errcode = 'EN001'; end if;
  perform app.exigir_mover(p_sede);
  perform app.mover_stock(p_sede, p_articulo, -p_cantidad, 'Venta', p_documento, p_observacion);
end;
$$;

-- Entrega de los materiales de una matrícula (verificación): varias líneas, todo o nada. `p_lineas`: lista de {articulo_id, cantidad}.
create function public.entregar_materiales(p_sede text, p_matricula text, p_alumno text, p_lineas jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_linea jsonb;
  v_cant  numeric;
begin
  perform app.exigir('op-verificacion:deliver', 'Registrar la entrega de materiales');
  if coalesce(p_sede, '') = '' or coalesce(p_matricula, '') = '' then raise exception 'Indique la sede y la matrícula.' using errcode = 'EN001'; end if;
  if app.ubicacion_es_almacen(p_sede) then raise exception 'Los materiales se entregan desde una sede, no desde el almacén.' using errcode = 'EN001'; end if;
  if jsonb_typeof(p_lineas) is distinct from 'array' then raise exception 'No hay materiales para entregar.' using errcode = 'EN001'; end if;
  perform app.exigir_mover(p_sede);
  for v_linea in select * from jsonb_array_elements(p_lineas) loop
    v_cant := case when jsonb_typeof(v_linea->'cantidad') = 'number' then (v_linea->>'cantidad')::numeric else null end;
    if jsonb_typeof(v_linea) is distinct from 'object' or coalesce(v_linea->>'articulo_id', '') = '' or v_cant is null or v_cant < 1 or v_cant <> trunc(v_cant) then
      raise exception 'Cada material a entregar necesita su artículo y una cantidad entera mayor a 0.' using errcode = 'EN001';
    end if;
    perform app.mover_stock(p_sede, v_linea->>'articulo_id', -(v_cant::integer), 'Entrega por Verificación', p_matricula,
      'Entrega a alumno ' || coalesce(nullif(btrim(coalesce(p_alumno, '')), ''), 'sin nombre') || ' (Matrícula: ' || p_matricula || ')');
  end loop;
end;
$$;

-- Devuelve al stock lo que vendió un movimiento de caja que se reversa.
create function public.reponer_por_reversa(p_sede text, p_articulo text, p_cantidad integer, p_movimiento text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.exigir('op-caja:reverse_movement', 'Reversar movimiento');
  if coalesce(p_sede, '') = '' or coalesce(p_articulo, '') = '' or coalesce(p_movimiento, '') = '' then raise exception 'Faltan datos para reponer el stock.' using errcode = 'EN001'; end if;
  if p_cantidad is null or p_cantidad < 1 then raise exception 'La cantidad debe ser un número entero mayor a 0.' using errcode = 'EN001'; end if;
  perform app.exigir_mover(p_sede);
  perform app.mover_stock(p_sede, p_articulo, p_cantidad, 'Devolución', p_movimiento, 'Reversa de la venta registrada en caja (' || p_movimiento || ')');
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Lo que tiene mercadería o movimientos no se elimina ni se inactiva
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
  if exists (select 1 from public.stock s where s.sede_id = old.id) or exists (select 1 from public.kardex k where k.sede_id = old.id) then
    raise exception 'No se puede eliminar la filial: tiene stock o movimientos de stock. Inactívela si ya no se usa.' using errcode = 'EN001';
  end if;
  return old;
end;
$$;

-- El almacén no se inactiva con mercadería dentro: quedaría stock que nadie puede mover.
create function app.almacen_inactivar_guarda() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_unidades bigint;
begin
  if old.estado = 'Activo' and new.estado = 'Inactivo' then
    select coalesce(sum(s.cantidad), 0) into v_unidades from public.stock s where s.almacen_id = old.id;
    if v_unidades > 0 then
      raise exception 'No se puede inactivar el almacén «%»: todavía tiene % unidad% en stock. Envíelas o ajústelas primero.', old.nombre, v_unidades, case when v_unidades = 1 then '' else 'es' end
        using errcode = 'EN001';
    end if;
  end if;
  return new;
end;
$$;
create trigger almacenes_inactivar_guarda before update on public.almacenes for each row execute function app.almacen_inactivar_guarda();

-- ---------------------------------------------------------------------------------------------------------------------
-- Permisos de tabla y RLS: solo se lee; todo lo que cambia pasa por las funciones de arriba
-- ---------------------------------------------------------------------------------------------------------------------

revoke all on public.stock, public.kardex, public.ajustes from public, anon, authenticated;
grant select on public.stock, public.kardex, public.ajustes to authenticated;

alter table public.stock   enable row level security;
alter table public.kardex  enable row level security;
alter table public.ajustes enable row level security;

create policy stock_leer on public.stock for select to authenticated using ((select app.puede_ver_ubicacion(sede_id, almacen_id)));
create policy kardex_leer on public.kardex for select to authenticated
  using ((select app.tiene_funcion('log-kardex:view')) and (select app.puede_ver_ubicacion(sede_id, almacen_id)));
create policy ajustes_leer on public.ajustes for select to authenticated
  using ((select app.tiene_funcion('log-ajustes:view')) and (select app.puede_ver_ubicacion(sede_id, almacen_id)));

revoke execute on function
  public.registrar_ingreso_stock(text, text, integer, text, text), public.registrar_ajuste_stock(text, text, text, integer, text, text),
  public.empaquetar_articulo(text, text), public.desempaquetar_articulo(text, text), public.definir_stock_minimo(text, text, integer),
  public.vender_articulo(text, text, integer, text, text), public.entregar_materiales(text, text, text, jsonb),
  public.reponer_por_reversa(text, text, integer, text)
  from public, anon;
grant execute on function
  public.registrar_ingreso_stock(text, text, integer, text, text), public.registrar_ajuste_stock(text, text, text, integer, text, text),
  public.empaquetar_articulo(text, text), public.desempaquetar_articulo(text, text), public.definir_stock_minimo(text, text, integer),
  public.vender_articulo(text, text, integer, text, text), public.entregar_materiales(text, text, text, jsonb),
  public.reponer_por_reversa(text, text, integer, text)
  to authenticated;
revoke execute on all functions in schema app from public, anon;
grant execute on all functions in schema app to authenticated;

commit;
