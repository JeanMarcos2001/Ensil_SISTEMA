-- =====================================================================================================================
-- 0011 · Artículos, sus precios de venta y las recetas de materiales en la base (Lote 5)
-- ---------------------------------------------------------------------------------------------------------------------
--   · `articulos`: el Catálogo de artículos de Logística (materiales, libros, herramientas y paquetes). El id es el código SKU que escribe
--     la persona (p. ej. ITM-LIB-K1). Los artículos NO se eliminan: se inactivan (el stock, el kardex y las recetas los nombran).
--   · `articulo_precios`: el precio de venta (USD) con vigencia e historial, general (`sede_id` vacío) o por sede. Un precio nunca se
--     sobrescribe ni se borra: registrar uno nuevo cierra la vigencia abierta del mismo alcance el día anterior. Solo se escribe con las
--     funciones `crear_articulos` y `agregar_precio_articulo`, que validan, piden la función del registro y dejan quién lo registró.
--   · `recetas`: qué artículos se entregan al matricular un programa (y nivel) en una sede y período. Para un mismo programa, nivel, sede y
--     período solo puede haber UNA receta activa: la base lo comprueba (si no, la verificación no sabría qué entregar).
--   · Leer, cualquier cuenta vigente (matrícula, verificación y caja lo necesitan). Escribir, con la función de cada pantalla
--     (`log-catalogo:create|edit|edit_price`, `com-recetas:create|edit|deactivate`). Cada fila guarda quién la creó y quién la cambió.
--   · El stock, el kardex, los envíos y las transferencias siguen en memoria y nombran a los artículos por su SKU: por eso los SKU no cambian.
--   · Ahora que las recetas viven aquí, la base también impide eliminar un programa, un nivel o una sede que una receta nombra (reemplaza los
--     guardias de la migración 0010).
-- Los errores de negocio usan el código EN001: el sistema muestra su texto tal cual (está en español).
-- Para deshacer: supabase/deshacer/20261107210000_articulos_y_recetas.down.sql
-- =====================================================================================================================

begin;

-- ---------------------------------------------------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------------------------------------------------

create table public.articulos (
  id                        text primary key check (id ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$'),
  nombre                    text not null check (length(btrim(nombre)) between 1 and 120),
  estado                    text not null default 'Activo' check (estado in ('Activo', 'Inactivo')),
  tipo                      text not null check (tipo in ('Material educativo', 'Herramienta / adicional', 'Libro', 'Paquete / kit logístico')),
  descripcion               text not null default '',
  unidad                    text not null default 'Unidad' check (length(btrim(unidad)) between 1 and 40),
  costo                     numeric(12,2) not null default 0 check (costo >= 0),
  se_vende                  boolean not null default false,
  se_entrega_en_matricula   boolean not null default false,
  es_paquete                boolean not null default false,
  permite_desempaquetar     boolean not null default false,
  -- Material educativo
  sesiones                  integer check (sesiones is null or sesiones >= 0),
  gimnasia_por_sesion       integer check (gimnasia_por_sesion is null or gimnasia_por_sesion >= 0),
  entrenamientos_por_sesion integer check (entrenamientos_por_sesion is null or entrenamientos_por_sesion >= 0),
  modo_entrenamiento        text check (modo_entrenamiento is null or modo_entrenamiento in ('General', 'Variable')),
  entrenamientos_variables  jsonb check (entrenamientos_variables is null or jsonb_typeof(entrenamientos_variables) = 'array'),
  -- Libro
  tipo_libro                text check (tipo_libro is null or tipo_libro in ('Individual', 'Paquete/Juego')),
  encuadernado              text check (encuadernado is null or encuadernado in ('Anillado', 'Encolado')),
  -- Paquete: lista de {articulo_id, cantidad}. El nombre de cada componente NO se guarda: sale del propio artículo.
  composicion               jsonb check (composicion is null or jsonb_typeof(composicion) = 'array'),
  creado_en                 timestamptz not null default now(),
  creado_por                text,
  actualizado_en            timestamptz not null default now(),
  actualizado_por           text
);
create unique index articulos_id_unico on public.articulos (lower(id));
comment on table public.articulos is 'Catálogo de artículos (única fuente). El id es el SKU. No se eliminan: se inactivan. El precio de venta vive en articulo_precios.';
comment on column public.articulos.se_entrega_en_matricula is 'Habilita el artículo para elegirlo dentro de una receta de matrícula; no lo entrega automáticamente a todo alumno.';
comment on column public.articulos.entrenamientos_variables is 'Lista de {sesion, entrenamientos}: una fila por sesión cuando el modo es Variable.';

create table public.articulo_precios (
  id             text primary key check (id ~ '^PRC-[0-9]{3,}$'),
  articulo_id    text not null references public.articulos (id) on delete restrict,
  sede_id        text references public.sedes (id) on delete restrict,
  monto          numeric(12,2) not null check (monto > 0),
  vigente_desde  date not null,
  vigente_hasta  date,
  creado_en      timestamptz not null default now(),
  creado_por     text,
  check (vigente_hasta is null or vigente_hasta >= vigente_desde)
);
create unique index articulo_precios_inicio_unico on public.articulo_precios (articulo_id, coalesce(sede_id, ''), vigente_desde);
create index articulo_precios_articulo_idx on public.articulo_precios (articulo_id);
create index articulo_precios_sede_idx on public.articulo_precios (sede_id);
comment on table public.articulo_precios is 'Precio de venta (USD) con vigencia e historial. `sede_id` vacío = precio general. Nunca se sobrescribe ni se borra: un precio nuevo cierra la vigencia abierta del mismo alcance.';

create table public.recetas (
  id              text primary key check (id ~ '^REC-[0-9]{3,}$'),
  nombre          text not null check (length(btrim(nombre)) between 1 and 120),
  programa_id     text not null references public.programas (id) on delete restrict,
  nivel_id        text references public.niveles (id) on delete restrict,
  todas_las_sedes boolean not null default true,
  sedes           text[] not null default '{}',
  estado          text not null default 'Activo' check (estado in ('Activo', 'Inactivo')),
  articulos       jsonb not null check (jsonb_typeof(articulos) = 'array' and jsonb_array_length(articulos) >= 1),
  vigencia_inicio date not null,
  vigencia_fin    date,
  creado_en       timestamptz not null default now(),
  creado_por      text,
  actualizado_en  timestamptz not null default now(),
  actualizado_por text,
  check (todas_las_sedes or cardinality(sedes) >= 1),
  check (vigencia_fin is null or vigencia_fin >= vigencia_inicio)
);
create index recetas_programa_idx on public.recetas (programa_id);
create index recetas_nivel_idx on public.recetas (nivel_id);
comment on table public.recetas is 'Qué artículos se entregan al matricular un programa (y nivel; vacío = todos) en una sede (o todas) y período. Una sola receta activa por programa, nivel, sede y período.';
comment on column public.recetas.articulos is 'Lista de {articulo_id, cantidad}.';

-- ---------------------------------------------------------------------------------------------------------------------
-- Quién y cuándo (artículos y recetas)
-- ---------------------------------------------------------------------------------------------------------------------

create trigger articulos_huella before insert or update on public.articulos for each row execute function app.catalogo_huella();
create trigger recetas_huella   before insert or update on public.recetas   for each row execute function app.catalogo_huella();

-- ---------------------------------------------------------------------------------------------------------------------
-- Validaciones (las mismas que hace la pantalla; la base las vuelve a comprobar)
-- ---------------------------------------------------------------------------------------------------------------------

create function app.articulo_validar() returns trigger
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
create trigger articulos_validar before insert or update on public.articulos for each row execute function app.articulo_validar();

create function app.receta_validar() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_prog   public.programas;
  v_nivel  public.niveles;
  v_linea  jsonb;
  v_art    public.articulos;
  v_cant   numeric;
  v_vistos text[] := '{}';
  v_antes  text[] := '{}';
  v_choque public.recetas;
begin
  new.nombre := btrim(new.nombre);
  if new.nombre = '' then raise exception 'El nombre es obligatorio.' using errcode = 'EN001'; end if;
  select * into v_prog from public.programas p where p.id = new.programa_id;
  if not found then raise exception 'El programa es obligatorio.' using errcode = 'EN001'; end if;
  if new.nivel_id is not null then
    select * into v_nivel from public.niveles n where n.id = new.nivel_id;
    if not found or not v_prog.tiene_niveles or v_nivel.programa_id <> new.programa_id then
      raise exception 'El nivel seleccionado no pertenece al programa.' using errcode = 'EN001';
    end if;
  end if;

  -- Una receta que ya tenía un artículo lo conserva aunque hoy esté inactivo o sin habilitar para matrícula
  if tg_op = 'UPDATE' then
    select coalesce(array_agg(l->>'articulo_id'), '{}') into v_antes from jsonb_array_elements(old.articulos) l;
  end if;
  for v_linea in select * from jsonb_array_elements(new.articulos) loop
    v_cant := case when jsonb_typeof(v_linea->'cantidad') = 'number' then (v_linea->>'cantidad')::numeric else null end;
    if jsonb_typeof(v_linea) is distinct from 'object' or length(btrim(coalesce(v_linea->>'articulo_id', ''))) = 0 then
      raise exception 'Seleccione el artículo en todas las filas.' using errcode = 'EN001';
    end if;
    if (v_linea->>'articulo_id') = any (v_vistos) then raise exception 'Hay artículos repetidos en la receta.' using errcode = 'EN001'; end if;
    v_vistos := v_vistos || (v_linea->>'articulo_id');
    if v_cant is null or not (v_cant >= 1) then raise exception 'Las cantidades deben ser mayores a 0.' using errcode = 'EN001'; end if;
    select * into v_art from public.articulos a where a.id = v_linea->>'articulo_id';
    if not found then raise exception 'Un artículo de la receta no existe en el catálogo.' using errcode = 'EN001'; end if;
    -- (la copia de una receta nace inactiva y conserva sus artículos aunque hoy alguno esté inactivo: no se revisa hasta que se active)
    if not (tg_op = 'INSERT' and new.estado = 'Inactivo') and not ((v_art.estado = 'Activo' and v_art.se_entrega_en_matricula) or (v_art.id = any (v_antes))) then
      raise exception 'Hay artículos inactivos o no habilitados para matrícula en la receta.' using errcode = 'EN001';
    end if;
  end loop;

  if new.todas_las_sedes then
    new.sedes := '{}';
  else
    new.sedes := app.ids_unicos(new.sedes);
    if cardinality(new.sedes) = 0 then raise exception 'Elija al menos una sede o aplique la receta a todas.' using errcode = 'EN001'; end if;
    if exists (select 1 from unnest(new.sedes) s where not exists (select 1 from public.sedes x where x.id = s)) then
      raise exception 'Una de las sedes elegidas no existe.' using errcode = 'EN001';
    end if;
  end if;
  if new.vigencia_fin is not null and new.vigencia_fin < new.vigencia_inicio then
    raise exception 'La fecha de fin no puede ser anterior a la de inicio.' using errcode = 'EN001';
  end if;

  -- Una sola receta activa por programa, nivel, sede y período
  if new.estado = 'Activo' then
    select * into v_choque from public.recetas r
    where r.id <> new.id and r.estado = 'Activo' and r.programa_id = new.programa_id
      and (r.nivel_id is null or new.nivel_id is null or r.nivel_id = new.nivel_id)
      and (r.todas_las_sedes or new.todas_las_sedes or r.sedes && new.sedes)
      and new.vigencia_inicio <= coalesce(r.vigencia_fin, date '9999-12-31')
      and coalesce(new.vigencia_fin, date '9999-12-31') >= r.vigencia_inicio
    limit 1;
    if found then
      if tg_op = 'UPDATE' and old.estado <> 'Activo' then
        raise exception 'No se puede activar: se solapa con la receta activa "%". Desactívela primero o ajuste el período.', v_choque.nombre using errcode = 'EN001';
      end if;
      raise exception 'Ya existe una receta activa ("%") que se solapa en programa, nivel, sede y período.', v_choque.nombre using errcode = 'EN001';
    end if;
  end if;

  -- Quien solo tiene «Activar y desactivar recetas» no puede cambiar nada más que el estado
  if tg_op = 'UPDATE' and auth.uid() is not null and not app.tiene_funcion('com-recetas:edit') then
    if (to_jsonb(new) - 'estado' - 'actualizado_en' - 'actualizado_por') is distinct from (to_jsonb(old) - 'estado' - 'actualizado_en' - 'actualizado_por') then
      raise exception 'Con su rol solo puede activar o desactivar la receta; para cambiar algo más hace falta la función «Editar recetas».' using errcode = 'EN001';
    end if;
  end if;
  return new;
end;
$$;
create trigger recetas_validar before insert or update on public.recetas for each row execute function app.receta_validar();

-- ---------------------------------------------------------------------------------------------------------------------
-- Precios: registrar uno nuevo cierra la vigencia abierta del mismo alcance (nunca se sobrescribe)
-- ---------------------------------------------------------------------------------------------------------------------

create function app.registrar_precio(p_articulo text, p_sede text, p_monto numeric, p_desde date) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_id text;
begin
  if p_monto is null or not (p_monto > 0) then raise exception 'El precio debe ser mayor a 0.' using errcode = 'EN001'; end if;
  if p_desde is null then raise exception 'Indique desde cuándo rige el precio.' using errcode = 'EN001'; end if;
  if not exists (select 1 from public.articulos a where a.id = p_articulo) then raise exception 'No se encontró el artículo.' using errcode = 'EN001'; end if;
  if p_sede is not null and not exists (select 1 from public.sedes s where s.id = p_sede) then raise exception 'La sede elegida no existe.' using errcode = 'EN001'; end if;
  perform pg_advisory_xact_lock(hashtext('articulo_precios'));
  if exists (select 1 from public.articulo_precios x where x.articulo_id = p_articulo and x.sede_id is not distinct from p_sede and x.vigente_desde = p_desde) then
    raise exception 'Ya existe un precio con esa fecha de inicio. Use una fecha posterior.' using errcode = 'EN001';
  end if;
  if exists (select 1 from public.articulo_precios x where x.articulo_id = p_articulo and x.sede_id is not distinct from p_sede and x.vigente_desde > p_desde) then
    raise exception 'Existe un precio con vigencia posterior. Registre el nuevo precio después de esa fecha.' using errcode = 'EN001';
  end if;
  update public.articulo_precios x set vigente_hasta = p_desde - 1
  where x.articulo_id = p_articulo and x.sede_id is not distinct from p_sede and x.vigente_hasta is null;
  select 'PRC-' || lpad((coalesce(max(substring(x.id from 5)::integer), 0) + 1)::text, 3, '0') into v_id from public.articulo_precios x;
  insert into public.articulo_precios (id, articulo_id, sede_id, monto, vigente_desde, creado_por)
  values (v_id, p_articulo, p_sede, round(p_monto, 2), p_desde, app.quien(null));
end;
$$;

-- Precio de venta nuevo de un artículo (general si `p_sede` es nulo).
create function public.agregar_precio_articulo(p_articulo text, p_sede text, p_monto numeric, p_desde date) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.permite('log-catalogo:edit_price') then raise exception 'Su rol no tiene la función «Registrar el precio de un artículo».' using errcode = 'EN001'; end if;
  perform app.registrar_precio(p_articulo, p_sede, p_monto, p_desde);
end;
$$;

-- Crea uno o varios artículos con sus precios generales de venta: todo o nada (una carga masiva no queda a medias).
-- `p_articulos`: lista de filas de `articulos`; `p_precios`: lista de {articulo_id, monto, desde}.
create function public.crear_articulos(p_articulos jsonb, p_precios jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_precio jsonb;
begin
  if not app.permite('log-catalogo:create') then raise exception 'Su rol no tiene la función «Crear artículos (uno a uno o por carga masiva)».' using errcode = 'EN001'; end if;
  if jsonb_typeof(p_articulos) is distinct from 'array' or jsonb_array_length(p_articulos) = 0 then raise exception 'No hay artículos para guardar.' using errcode = 'EN001'; end if;
  p_precios := coalesce(p_precios, '[]'::jsonb);

  -- Primero lo que no es paquete y después los paquetes: así un paquete puede nombrar artículos de la misma carga
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

  -- Un artículo que se vende nace con su precio general
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

-- ---------------------------------------------------------------------------------------------------------------------
-- Lo que ya se usa no se elimina: ahora también las recetas (reemplaza los guardias de la migración 0010)
-- ---------------------------------------------------------------------------------------------------------------------

create or replace function app.programa_eliminar_guarda() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.niveles n where n.programa_id = old.id) then
    raise exception 'No se puede eliminar el programa: tiene niveles. Elimínelos primero o inactive el programa.' using errcode = 'EN001';
  end if;
  if exists (select 1 from public.tarifarios t where t.programa_id = old.id) then
    raise exception 'No se puede eliminar el programa: tiene tarifarios. Elimínelos primero o inactive el programa.' using errcode = 'EN001';
  end if;
  if exists (select 1 from public.promociones p where old.id = any (p.programas_elegibles)) then
    raise exception 'No se puede eliminar el programa: hay promociones que lo usan. Quítelo de ellas o inactive el programa.' using errcode = 'EN001';
  end if;
  if exists (select 1 from public.recetas r where r.programa_id = old.id) then
    raise exception 'No se puede eliminar el programa: hay recetas de materiales que lo usan. Inactive el programa.' using errcode = 'EN001';
  end if;
  return old;
end;
$$;

create or replace function app.nivel_eliminar_guarda() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.tarifarios t where t.nivel_id = old.id) then
    raise exception 'No se puede eliminar el nivel: hay tarifarios que lo usan. Elimínelos primero o inactive el nivel.' using errcode = 'EN001';
  end if;
  if exists (select 1 from public.recetas r where r.nivel_id = old.id) then
    raise exception 'No se puede eliminar el nivel: hay recetas de materiales que lo usan. Inactive el nivel.' using errcode = 'EN001';
  end if;
  return old;
end;
$$;

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
  return old;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Permisos de tabla y RLS: leer, cualquier cuenta vigente; escribir, con la función del registro de cada pantalla
-- ---------------------------------------------------------------------------------------------------------------------

revoke all on public.articulos, public.articulo_precios, public.recetas from public, anon, authenticated;
grant select, update on public.articulos to authenticated;      -- las altas pasan por crear_articulos (artículo + precio, todo o nada)
grant select on public.articulo_precios to authenticated;       -- solo se escribe con las funciones de precio
grant select, insert, update on public.recetas to authenticated; -- las recetas no se eliminan: se inactivan

alter table public.articulos       enable row level security;
alter table public.articulo_precios enable row level security;
alter table public.recetas         enable row level security;

create policy articulos_leer on public.articulos for select to authenticated using ((select app.acceso_vigente()));
create policy articulos_editar on public.articulos for update to authenticated
  using ((select app.tiene_funcion('log-catalogo:edit'))) with check ((select app.tiene_funcion('log-catalogo:edit')));

create policy articulo_precios_leer on public.articulo_precios for select to authenticated using ((select app.acceso_vigente()));

create policy recetas_leer on public.recetas for select to authenticated using ((select app.acceso_vigente()));
create policy recetas_crear on public.recetas for insert to authenticated with check ((select app.tiene_funcion('com-recetas:create')));
create policy recetas_editar on public.recetas for update to authenticated
  using ((select app.tiene_funcion('com-recetas:edit') or app.tiene_funcion('com-recetas:deactivate')))
  with check ((select app.tiene_funcion('com-recetas:edit') or app.tiene_funcion('com-recetas:deactivate')));

revoke execute on function public.agregar_precio_articulo(text, text, numeric, date), public.crear_articulos(jsonb, jsonb) from public, anon;
grant execute on function public.agregar_precio_articulo(text, text, numeric, date), public.crear_articulos(jsonb, jsonb) to authenticated;
revoke execute on all functions in schema app from public, anon;
grant execute on all functions in schema app to authenticated;

commit;
