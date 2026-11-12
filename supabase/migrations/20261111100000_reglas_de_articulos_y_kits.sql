-- =====================================================================================================================
-- 0016 · Reglas de artículos y kits (2026-11-11)
-- ---------------------------------------------------------------------------------------------------------------------
-- Lo que decidió el usuario sobre el catálogo de artículos, aplicado a la base:
--   · El «Paquete / kit logístico» pasa a llamarse **Kit** (tipo `Kit`). Un kit se arma con sus artículos: su composición es OBLIGATORIA, no puede
--     haber kits dentro de kits y `es_paquete` se deriva del tipo (solo un Kit es un kit).
--   · Ya no existen las casillas «¿Se vende?» ni «¿Permite desempaquetado?» (se eliminan `se_vende` y `permite_desempaquetar`): TODO artículo lleva un
--     precio de referencia y se puede vender si hay stock y precio (por ejemplo, un libro que el alumno extravió); todo kit se puede desarmar en Stock.
--   · El material educativo siempre se entrega con la matrícula (`se_entrega_en_matricula` fijo en «sí»).
--   · La unidad de medida sale de una lista corta: Unidad, Juego, Kit, Caja, Paquete, Par (lo que había escrito a mano se normaliza: un kit pasa a «Kit»
--     y lo que no reconoce pasa a «Unidad»).
--   · Todo artículo se crea con su precio de referencia general (`crear_articulos` lo exige para CADA artículo). Los que ya existen sin precio no se
--     tocan (no se inventan precios): el sistema los marca «Sin precio de referencia» hasta completarlos.
--   · Desarmar un kit pide SIEMPRE su motivo (`desempaquetar_articulo(ubicación, artículo, motivo)`: queda en el kardex junto a quién y cuándo) y tiene su
--     propia función, `log-stock:unpack` («Desarmar kits»), separada de `log-stock:pack` («Armar kits»). Los roles que ya podían armar reciben también
--     la de desarmar, para que nada deje de funcionar; después se puede quitar desde Organización → Permisos.
--   · Una receta activa no puede llevar un kit y, a la vez, uno de sus artículos (se entregaría dos veces).
-- La carga de partida `supabase/seed/articulos_y_recetas.sql` (generada) ya viene con las columnas nuevas: se aplica DESPUÉS de esta migración.
-- Los errores de negocio usan el código EN001: el sistema muestra su texto tal cual (está en español).
-- Para deshacer: supabase/deshacer/20261111100000_reglas_de_articulos_y_kits.down.sql
-- =====================================================================================================================

begin;

-- ---------------------------------------------------------------------------------------------------------------------
-- 1 · Datos: el tipo, las unidades y lo que se vuelve fijo (sin que cuenten como «cambios» del artículo: se apagan sus disparadores un momento)
-- ---------------------------------------------------------------------------------------------------------------------

alter table public.articulos disable trigger articulos_huella;
alter table public.articulos disable trigger articulos_validar;

alter table public.articulos drop constraint articulos_tipo_check;
update public.articulos set tipo = 'Kit' where tipo = 'Paquete / kit logístico';
alter table public.articulos add constraint articulos_tipo_check check (tipo in ('Material educativo', 'Herramienta / adicional', 'Libro', 'Kit'));

update public.articulos set es_paquete = (tipo = 'Kit') where es_paquete is distinct from (tipo = 'Kit');
update public.articulos set se_entrega_en_matricula = true where tipo = 'Material educativo' and not se_entrega_en_matricula;
update public.articulos set unidad = case
    when tipo = 'Kit' then 'Kit'
    else case lower(btrim(unidad)) when 'juego' then 'Juego' when 'kit' then 'Kit' when 'caja' then 'Caja' when 'paquete' then 'Paquete' when 'par' then 'Par' else 'Unidad' end
  end
where unidad not in ('Unidad', 'Juego', 'Kit', 'Caja', 'Paquete', 'Par') or (tipo = 'Kit' and unidad <> 'Kit');

alter table public.articulos drop column se_vende, drop column permite_desempaquetar;

alter table public.articulos enable trigger articulos_huella;
alter table public.articulos enable trigger articulos_validar;

comment on column public.articulos.es_paquete is 'Se deriva del tipo: solo un artículo de tipo Kit es un kit (se arma y se desarma en Stock).';
comment on column public.articulos.composicion is 'Kit: lista de {articulo_id, cantidad} con la que se arma (obligatoria; sin kits dentro de kits). El nombre de cada componente NO se guarda: sale del propio artículo.';
comment on column public.articulos.unidad is 'Lista corta: Unidad, Juego, Kit, Caja, Paquete o Par.';

-- ---------------------------------------------------------------------------------------------------------------------
-- 2 · Validaciones del artículo (las mismas que hace la pantalla; la base las vuelve a comprobar)
-- ---------------------------------------------------------------------------------------------------------------------

create or replace function app.articulo_validar() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_comp   jsonb;
  v_vistos text[] := '{}';
  v_cant   numeric;
  v_parte  public.articulos;
begin
  if tg_op = 'UPDATE' and new.id <> old.id then raise exception 'El código SKU de un artículo no se puede cambiar.' using errcode = 'EN001'; end if;
  new.nombre := btrim(new.nombre);
  new.unidad := coalesce(nullif(btrim(coalesce(new.unidad, '')), ''), 'Unidad');
  if new.nombre = '' then raise exception 'El nombre del artículo es obligatorio.' using errcode = 'EN001'; end if;
  if new.unidad not in ('Unidad', 'Juego', 'Kit', 'Caja', 'Paquete', 'Par') then
    raise exception 'La unidad de medida debe ser una de estas: Unidad, Juego, Kit, Caja, Paquete, Par.' using errcode = 'EN001';
  end if;
  if new.es_paquete is distinct from (new.tipo = 'Kit') then raise exception 'Solo un artículo de tipo Kit puede ser un kit.' using errcode = 'EN001'; end if;
  if new.tipo = 'Material educativo' and not new.se_entrega_en_matricula then
    raise exception 'El material educativo siempre se entrega con la matrícula.' using errcode = 'EN001';
  end if;
  if new.tipo = 'Libro' and new.encuadernado is null then raise exception 'Seleccione el encuadernado del libro (Anillado o Encolado).' using errcode = 'EN001'; end if;
  if new.tipo = 'Material educativo' and new.modo_entrenamiento = 'Variable' and coalesce(new.sesiones, 0) > 0
     and coalesce(jsonb_array_length(new.entrenamientos_variables), 0) <> new.sesiones then
    raise exception 'Configure la tabla de sesiones: indique los entrenamientos de cada sesión del material.' using errcode = 'EN001';
  end if;
  -- Un kit se arma con sus artículos: la composición es obligatoria y no hay kits dentro de kits
  if new.tipo = 'Kit' then
    if coalesce(jsonb_array_length(new.composicion), 0) = 0 then
      raise exception 'Un kit debe definir su composición (los artículos y cantidades con los que se arma).' using errcode = 'EN001';
    end if;
    for v_comp in select * from jsonb_array_elements(new.composicion) loop
      v_cant := case when jsonb_typeof(v_comp->'cantidad') = 'number' then (v_comp->>'cantidad')::numeric else null end;
      if jsonb_typeof(v_comp) is distinct from 'object' or length(btrim(coalesce(v_comp->>'articulo_id', ''))) = 0 or v_cant is null or not (v_cant >= 1) then
        raise exception 'Cada componente del kit debe tener un artículo y una cantidad mayor a 0.' using errcode = 'EN001';
      end if;
      if v_comp->>'articulo_id' = new.id then raise exception 'Un kit no puede contenerse a sí mismo.' using errcode = 'EN001'; end if;
      if (v_comp->>'articulo_id') = any (v_vistos) then raise exception 'La composición tiene artículos repetidos.' using errcode = 'EN001'; end if;
      v_vistos := v_vistos || (v_comp->>'articulo_id');
      select * into v_parte from public.articulos a where a.id = v_comp->>'articulo_id';
      if not found then raise exception 'Un componente del kit no existe en el catálogo de artículos.' using errcode = 'EN001'; end if;
      if v_parte.tipo = 'Kit' then raise exception 'Un kit no puede contener otro kit («%»). Use sus artículos sueltos.', v_parte.nombre using errcode = 'EN001'; end if;
    end loop;
  end if;
  return new;
end;
$$;

-- Una receta activa no puede llevar un kit y, a la vez, uno de sus artículos: se entregaría dos veces
create function app.receta_kit_componente() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_choque record;
begin
  if new.estado <> 'Activo' then return new; end if;
  select k.nombre as kit, c.nombre as componente into v_choque
  from jsonb_array_elements(new.articulos) l
  join public.articulos k on k.id = l->>'articulo_id' and k.tipo = 'Kit'
  cross join lateral jsonb_array_elements(coalesce(k.composicion, '[]'::jsonb)) comp
  join jsonb_array_elements(new.articulos) l2 on l2->>'articulo_id' = comp->>'articulo_id'
  join public.articulos c on c.id = comp->>'articulo_id'
  limit 1;
  if found then
    raise exception 'La receta incluye el kit «%» y también uno de sus artículos («%»): se entregaría dos veces. Quite uno de los dos.', v_choque.kit, v_choque.componente using errcode = 'EN001';
  end if;
  return new;
end;
$$;
create trigger recetas_kit_componente before insert or update on public.recetas for each row execute function app.receta_kit_componente();

-- ---------------------------------------------------------------------------------------------------------------------
-- 3 · Crear artículos: TODO artículo nace con su precio de referencia general
-- ---------------------------------------------------------------------------------------------------------------------

create or replace function public.crear_articulos(p_articulos jsonb, p_precios jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_precio jsonb;
begin
  if not app.permite('log-catalogo:create') then raise exception 'Su rol no tiene la función «Crear artículos (uno a uno o por carga masiva)».' using errcode = 'EN001'; end if;
  if jsonb_typeof(p_articulos) is distinct from 'array' or jsonb_array_length(p_articulos) = 0 then raise exception 'No hay artículos para guardar.' using errcode = 'EN001'; end if;
  p_precios := coalesce(p_precios, '[]'::jsonb);

  -- Primero lo que no es kit y después los kits: así un kit puede nombrar artículos de la misma carga
  insert into public.articulos (id, nombre, estado, tipo, descripcion, unidad, costo, se_entrega_en_matricula, es_paquete,
    sesiones, gimnasia_por_sesion, entrenamientos_por_sesion, modo_entrenamiento, entrenamientos_variables, tipo_libro, encuadernado, composicion)
  select x.id, x.nombre, coalesce(x.estado, 'Activo'), x.tipo, coalesce(x.descripcion, ''), coalesce(x.unidad, 'Unidad'), coalesce(x.costo, 0),
    coalesce(x.se_entrega_en_matricula, false), coalesce(x.es_paquete, false),
    x.sesiones, x.gimnasia_por_sesion, x.entrenamientos_por_sesion, x.modo_entrenamiento, x.entrenamientos_variables, x.tipo_libro, x.encuadernado, x.composicion
  from jsonb_to_recordset(p_articulos) as x(id text, nombre text, estado text, tipo text, descripcion text, unidad text, costo numeric,
    se_entrega_en_matricula boolean, es_paquete boolean, sesiones integer, gimnasia_por_sesion integer,
    entrenamientos_por_sesion integer, modo_entrenamiento text, entrenamientos_variables jsonb, tipo_libro text, encuadernado text, composicion jsonb)
  where x.tipo is distinct from 'Kit';

  insert into public.articulos (id, nombre, estado, tipo, descripcion, unidad, costo, se_entrega_en_matricula, es_paquete,
    sesiones, gimnasia_por_sesion, entrenamientos_por_sesion, modo_entrenamiento, entrenamientos_variables, tipo_libro, encuadernado, composicion)
  select x.id, x.nombre, coalesce(x.estado, 'Activo'), x.tipo, coalesce(x.descripcion, ''), coalesce(x.unidad, 'Unidad'), coalesce(x.costo, 0),
    coalesce(x.se_entrega_en_matricula, false), coalesce(x.es_paquete, false),
    x.sesiones, x.gimnasia_por_sesion, x.entrenamientos_por_sesion, x.modo_entrenamiento, x.entrenamientos_variables, x.tipo_libro, x.encuadernado, x.composicion
  from jsonb_to_recordset(p_articulos) as x(id text, nombre text, estado text, tipo text, descripcion text, unidad text, costo numeric,
    se_entrega_en_matricula boolean, es_paquete boolean, sesiones integer, gimnasia_por_sesion integer,
    entrenamientos_por_sesion integer, modo_entrenamiento text, entrenamientos_variables jsonb, tipo_libro text, encuadernado text, composicion jsonb)
  where x.tipo = 'Kit';

  -- Todo artículo nace con su precio de referencia general: es el precio con el que se vende si hace falta
  if exists (
    select 1 from jsonb_to_recordset(p_articulos) as x(id text)
    where not exists (
      select 1 from jsonb_to_recordset(p_precios) as p(articulo_id text, monto numeric) where p.articulo_id = x.id and p.monto > 0
    )
  ) then
    raise exception 'Indique el precio de referencia (USD) de cada artículo: es el precio con el que se vende si hace falta.' using errcode = 'EN001';
  end if;
  for v_precio in select * from jsonb_array_elements(p_precios) loop
    perform app.registrar_precio(v_precio->>'articulo_id', null, nullif(v_precio->>'monto', '')::numeric, nullif(v_precio->>'desde', '')::date);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- 4 · Vender: todo artículo activo con precio vigente y stock (ya no hay «a la venta»)
-- ---------------------------------------------------------------------------------------------------------------------

create or replace function public.vender_articulo(p_sede text, p_articulo text, p_cantidad integer, p_documento text, p_observacion text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_art public.articulos;
begin
  perform app.exigir('op-caja:sell_item', 'Vender un artículo en caja');
  if coalesce(p_sede, '') = '' or coalesce(p_articulo, '') = '' then raise exception 'Por favor complete todos los campos obligatorios.' using errcode = 'EN001'; end if;
  if app.ubicacion_es_almacen(p_sede) then raise exception 'El almacén central no vende: registre la venta en una sede.' using errcode = 'EN001'; end if;
  select * into v_art from public.articulos a where a.id = p_articulo;
  if not found or v_art.estado <> 'Activo' then raise exception 'El artículo no está habilitado para la venta.' using errcode = 'EN001'; end if;
  if not exists (
    select 1 from public.articulo_precios p
    where p.articulo_id = p_articulo and (p.sede_id = p_sede or p.sede_id is null) and p.vigente_desde <= app.hoy() and (p.vigente_hasta is null or app.hoy() <= p.vigente_hasta)
  ) then
    raise exception 'El artículo no tiene un precio de referencia vigente. Configúrelo en Logística → Catálogo de artículos.' using errcode = 'EN001';
  end if;
  if p_cantidad is null or p_cantidad < 1 then raise exception 'La cantidad debe ser un número entero mayor a 0.' using errcode = 'EN001'; end if;
  if app.stock_disponible(p_sede, p_articulo) < p_cantidad then raise exception 'No hay stock suficiente para realizar la venta.' using errcode = 'EN001'; end if;
  perform app.exigir_mover(p_sede);
  perform app.mover_stock(p_sede, p_articulo, -p_cantidad, 'Venta', p_documento, p_observacion);
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- 5 · Armar y desarmar kits: dos funciones distintas, y desarmar siempre con motivo
-- ---------------------------------------------------------------------------------------------------------------------

-- El kit con su composición (sus artículos salen del propio artículo).
create function app.kit_de(p_articulo text) returns public.articulos
language plpgsql stable security definer set search_path = '' as $$
declare
  v_art public.articulos;
begin
  select * into v_art from public.articulos a where a.id = p_articulo;
  if not found or not v_art.es_paquete or v_art.composicion is null then raise exception 'El artículo no es un kit con composición.' using errcode = 'EN001'; end if;
  if jsonb_array_length(v_art.composicion) = 0 then raise exception 'El kit no tiene composición definida.' using errcode = 'EN001'; end if;
  return v_art;
end;
$$;

-- Arma una unidad del kit: descuenta sus artículos y suma 1 al kit, todo o nada.
create or replace function public.empaquetar_articulo(p_ubicacion text, p_articulo text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_art  public.articulos;
  v_comp record;
  v_doc  text := 'EMP-' || lpad(nextval('app.seq_empaquetado')::text, 3, '0');
begin
  perform app.exigir('log-stock:pack', 'Armar kits (empaquetar)');
  perform app.exigir_mover(p_ubicacion);
  v_art := app.kit_de(p_articulo);
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

-- Desarma una unidad del kit: resta 1 al kit y suma sus artículos, todo o nada. El motivo es obligatorio y queda en el kardex.
drop function public.desempaquetar_articulo(text, text);
create function public.desempaquetar_articulo(p_ubicacion text, p_articulo text, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_art  public.articulos;
  v_comp record;
  v_doc  text := 'DESEMP-' || lpad(nextval('app.seq_desempaquetado')::text, 3, '0');
  v_mot  text := btrim(coalesce(p_motivo, ''));
begin
  perform app.exigir('log-stock:unpack', 'Desarmar kits (desempaquetar)');
  if v_mot = '' then raise exception 'Indique el motivo del desempaquetado.' using errcode = 'EN001'; end if;
  if length(v_mot) > 300 then raise exception 'El motivo no puede pasar de 300 caracteres.' using errcode = 'EN001'; end if;
  perform app.exigir_mover(p_ubicacion);
  v_art := app.kit_de(p_articulo);
  perform app.mover_stock(p_ubicacion, p_articulo, -1, 'Desempaquetado', v_doc, 'Desempaquetado de ' || v_art.nombre || '. Motivo: ' || v_mot);
  for v_comp in select c->>'articulo_id' as articulo, (c->>'cantidad')::integer as cantidad from jsonb_array_elements(v_art.composicion) c loop
    perform app.mover_stock(p_ubicacion, v_comp.articulo, v_comp.cantidad, 'Desempaquetado', v_doc, 'Componente de ' || v_art.nombre);
  end loop;
end;
$$;

drop function app.paquete_de(text, boolean);

-- Los roles que ya podían armar y abrir paquetes reciben la función de desarmar (para que nada deje de funcionar)
insert into public.rol_funciones (rol_id, funcion_id)
select rf.rol_id, 'log-stock:unpack' from public.rol_funciones rf where rf.funcion_id = 'log-stock:pack'
on conflict do nothing;

-- ---------------------------------------------------------------------------------------------------------------------
-- 6 · Permisos de las funciones nuevas
-- ---------------------------------------------------------------------------------------------------------------------

revoke execute on function public.desempaquetar_articulo(text, text, text) from public, anon;
grant execute on function public.desempaquetar_articulo(text, text, text) to authenticated;
revoke execute on all functions in schema app from public, anon;
grant execute on all functions in schema app to authenticated;

commit;
