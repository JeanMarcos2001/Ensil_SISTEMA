-- Deshace 0016 · Reglas de artículos y kits: vuelven el tipo «Paquete / kit logístico», las casillas «se vende» y «permite desempaquetar»
-- y las funciones de las migraciones 0011 y 0012. Las unidades de medida ya normalizadas se quedan como están (son válidas también antes).
-- «se_vende» vuelve en «sí» para los artículos que tienen precio, y «permite_desempaquetar» en «sí» para todo kit.

begin;

alter table public.articulos disable trigger articulos_huella;
alter table public.articulos disable trigger articulos_validar;

alter table public.articulos add column se_vende boolean not null default false, add column permite_desempaquetar boolean not null default false;
update public.articulos a set se_vende = exists (select 1 from public.articulo_precios p where p.articulo_id = a.id);
update public.articulos a set permite_desempaquetar = a.es_paquete;

alter table public.articulos drop constraint articulos_tipo_check;
update public.articulos set tipo = 'Paquete / kit logístico' where tipo = 'Kit';
alter table public.articulos add constraint articulos_tipo_check check (tipo in ('Material educativo', 'Herramienta / adicional', 'Libro', 'Paquete / kit logístico'));

alter table public.articulos enable trigger articulos_huella;
alter table public.articulos enable trigger articulos_validar;

drop trigger if exists recetas_kit_componente on public.recetas;
drop function if exists app.receta_kit_componente();

delete from public.rol_funciones where funcion_id = 'log-stock:unpack';

-- ---------------------------------------------------------------------------------------------------------------------
-- Las funciones de antes (migraciones 0011 y 0012)
-- ---------------------------------------------------------------------------------------------------------------------

create or replace function app.articulo_validar() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_comp jsonb;
  v_vistos text[] := '{}';
  v_cant numeric;
begin
  if tg_op = 'UPDATE' and new.id <> old.id then raise exception 'El código SKU de un artículo no se puede cambiar.' using errcode = 'EN001'; end if;
  new.nombre := btrim(new.nombre);
  new.unidad := coalesce(nullif(btrim(coalesce(new.unidad, '')), ''), 'Unidad');
  if new.nombre = '' then raise exception 'El nombre del artículo es obligatorio.' using errcode = 'EN001'; end if;
  if new.tipo = 'Libro' and new.encuadernado is null then raise exception 'Seleccione el tipo de libro (Anillado o Encolado).' using errcode = 'EN001'; end if;
  if new.tipo = 'Material educativo' and new.modo_entrenamiento = 'Variable' and coalesce(new.sesiones, 0) > 0
     and coalesce(jsonb_array_length(new.entrenamientos_variables), 0) <> new.sesiones then
    raise exception 'Configure la tabla de sesiones: indique los entrenamientos de cada sesión del material.' using errcode = 'EN001';
  end if;
  if new.tipo = 'Paquete / kit logístico' then
    if new.permite_desempaquetar and coalesce(jsonb_array_length(new.composicion), 0) = 0 then
      raise exception 'Un paquete que permite desempaquetado debe definir su composición (artículos y cantidades).' using errcode = 'EN001';
    end if;
    for v_comp in select * from jsonb_array_elements(coalesce(new.composicion, '[]'::jsonb)) loop
      v_cant := case when jsonb_typeof(v_comp->'cantidad') = 'number' then (v_comp->>'cantidad')::numeric else null end;
      if jsonb_typeof(v_comp) is distinct from 'object' or length(btrim(coalesce(v_comp->>'articulo_id', ''))) = 0 or v_cant is null or not (v_cant >= 1) then
        raise exception 'Cada componente del paquete debe tener un artículo y una cantidad mayor a 0.' using errcode = 'EN001';
      end if;
      if v_comp->>'articulo_id' = new.id then raise exception 'Un paquete no puede contenerse a sí mismo.' using errcode = 'EN001'; end if;
      if (v_comp->>'articulo_id') = any (v_vistos) then raise exception 'La composición tiene artículos repetidos.' using errcode = 'EN001'; end if;
      v_vistos := v_vistos || (v_comp->>'articulo_id');
      if not exists (select 1 from public.articulos a where a.id = v_comp->>'articulo_id') then
        raise exception 'Un componente del paquete no existe en el catálogo de artículos.' using errcode = 'EN001';
      end if;
    end loop;
  end if;
  return new;
end;
$$;

create or replace function public.crear_articulos(p_articulos jsonb, p_precios jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_precio jsonb;
begin
  if not app.permite('log-catalogo:create') then raise exception 'Su rol no tiene la función «Crear artículos (uno a uno o por carga masiva)».' using errcode = 'EN001'; end if;
  if jsonb_typeof(p_articulos) is distinct from 'array' or jsonb_array_length(p_articulos) = 0 then raise exception 'No hay artículos para guardar.' using errcode = 'EN001'; end if;
  p_precios := coalesce(p_precios, '[]'::jsonb);

  insert into public.articulos (id, nombre, estado, tipo, descripcion, unidad, costo, se_vende, se_entrega_en_matricula, es_paquete, permite_desempaquetar,
    sesiones, gimnasia_por_sesion, entrenamientos_por_sesion, modo_entrenamiento, entrenamientos_variables, tipo_libro, encuadernado, composicion)
  select x.id, x.nombre, coalesce(x.estado, 'Activo'), x.tipo, coalesce(x.descripcion, ''), coalesce(x.unidad, 'Unidad'), coalesce(x.costo, 0),
    coalesce(x.se_vende, false), coalesce(x.se_entrega_en_matricula, false), coalesce(x.es_paquete, false), coalesce(x.permite_desempaquetar, false),
    x.sesiones, x.gimnasia_por_sesion, x.entrenamientos_por_sesion, x.modo_entrenamiento, x.entrenamientos_variables, x.tipo_libro, x.encuadernado, x.composicion
  from jsonb_to_recordset(p_articulos) as x(id text, nombre text, estado text, tipo text, descripcion text, unidad text, costo numeric, se_vende boolean,
    se_entrega_en_matricula boolean, es_paquete boolean, permite_desempaquetar boolean, sesiones integer, gimnasia_por_sesion integer,
    entrenamientos_por_sesion integer, modo_entrenamiento text, entrenamientos_variables jsonb, tipo_libro text, encuadernado text, composicion jsonb)
  where x.tipo is distinct from 'Paquete / kit logístico';

  insert into public.articulos (id, nombre, estado, tipo, descripcion, unidad, costo, se_vende, se_entrega_en_matricula, es_paquete, permite_desempaquetar,
    sesiones, gimnasia_por_sesion, entrenamientos_por_sesion, modo_entrenamiento, entrenamientos_variables, tipo_libro, encuadernado, composicion)
  select x.id, x.nombre, coalesce(x.estado, 'Activo'), x.tipo, coalesce(x.descripcion, ''), coalesce(x.unidad, 'Unidad'), coalesce(x.costo, 0),
    coalesce(x.se_vende, false), coalesce(x.se_entrega_en_matricula, false), coalesce(x.es_paquete, false), coalesce(x.permite_desempaquetar, false),
    x.sesiones, x.gimnasia_por_sesion, x.entrenamientos_por_sesion, x.modo_entrenamiento, x.entrenamientos_variables, x.tipo_libro, x.encuadernado, x.composicion
  from jsonb_to_recordset(p_articulos) as x(id text, nombre text, estado text, tipo text, descripcion text, unidad text, costo numeric, se_vende boolean,
    se_entrega_en_matricula boolean, es_paquete boolean, permite_desempaquetar boolean, sesiones integer, gimnasia_por_sesion integer,
    entrenamientos_por_sesion integer, modo_entrenamiento text, entrenamientos_variables jsonb, tipo_libro text, encuadernado text, composicion jsonb)
  where x.tipo = 'Paquete / kit logístico';

  if exists (
    select 1 from jsonb_to_recordset(p_articulos) as x(id text, se_vende boolean)
    where coalesce(x.se_vende, false) and not exists (
      select 1 from jsonb_to_recordset(p_precios) as p(articulo_id text, monto numeric) where p.articulo_id = x.id and p.monto > 0
    )
  ) then
    raise exception 'Indique el precio general de venta (USD) para un artículo que se vende.' using errcode = 'EN001';
  end if;
  for v_precio in select * from jsonb_array_elements(p_precios) loop
    perform app.registrar_precio(v_precio->>'articulo_id', null, nullif(v_precio->>'monto', '')::numeric, nullif(v_precio->>'desde', '')::date);
  end loop;
end;
$$;

create or replace function public.vender_articulo(p_sede text, p_articulo text, p_cantidad integer, p_documento text, p_observacion text) returns void
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

create or replace function public.empaquetar_articulo(p_ubicacion text, p_articulo text) returns void
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

drop function public.desempaquetar_articulo(text, text, text);
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

drop function app.kit_de(text);

revoke execute on function public.desempaquetar_articulo(text, text) from public, anon;
grant execute on function public.desempaquetar_articulo(text, text) to authenticated;
revoke execute on all functions in schema app from public, anon;
grant execute on all functions in schema app to authenticated;

commit;
