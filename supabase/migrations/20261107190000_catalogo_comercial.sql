-- =====================================================================================================================
-- 0010 · Catálogo comercial en la base (Lote 4)
-- ---------------------------------------------------------------------------------------------------------------------
--   · `programas`, `niveles`, `tipos_pago`, `tarifarios`, `promociones` y `origenes_lead`: lo que hoy se configura en Oferta comercial
--     (y en Configuración → Orígenes de leads) pasa a la base. Es la ÚNICA fuente del catálogo: la matrícula, los planes y las promociones
--     leen de aquí.
--   · Ids numéricos como texto ('1', '2', …): es la política de ids de los catálogos del sistema (`utils/ids.ts`, `nextNumericId`).
--   · Cada tabla se escribe directo desde el sistema, con la función del registro que corresponde (`com-programas:create`, `:edit`, `:delete`,
--     etc.; `cfg-leads:…` para los orígenes). Leer el catálogo puede cualquier cuenta vigente (la matrícula lo necesita).
--   · La base valida OTRA VEZ lo que valida la pantalla (código y nombre, niveles solo en programas con niveles, desglose del tarifario,
--     promociones, etc.) y no deja eliminar algo de lo que dependen otros registros (mensajes en español, código EN001).
--   · Los conjuntos (sedes habilitadas de un programa; programas, tipos de pago y sedes de una promoción) se guardan como listas de ids
--     dentro de la misma fila: así cada cambio es de una sola fila y todo o nada. Un disparador comprueba que cada id exista, y otro
--     impide eliminar un programa, tipo de pago o sede que una de esas listas todavía nombra.
--   · Cada fila guarda quién la creó y quién la cambió por última vez (el nombre sale de la cuenta, no de la pantalla).
-- Los campos retirados del modelo (`applicablePrograms`, `allowPartial`, `includesEnrollment`…, `composition`) no se guardan: no tenían uso.
-- Para deshacer: supabase/deshacer/20261107190000_catalogo_comercial.down.sql
-- =====================================================================================================================

begin;

-- ---------------------------------------------------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------------------------------------------------

create table public.programas (
  id                text primary key check (id ~ '^[0-9]{1,9}$'),
  codigo            text not null check (length(btrim(codigo)) between 1 and 40),
  nombre            text not null check (length(btrim(nombre)) between 1 and 80),
  alias             text,
  descripcion       text,
  tiene_niveles     boolean not null,
  duracion_base     integer not null check (duracion_base >= 1),
  garantia          integer not null check (garantia >= 0),
  todas_las_sedes   boolean not null default true,
  sedes_habilitadas text[] not null default '{}',
  estado            text not null default 'Activo' check (estado in ('Activo', 'Inactivo')),
  observaciones     text,
  creado_en         timestamptz not null default now(),
  creado_por        text,
  actualizado_en    timestamptz not null default now(),
  actualizado_por   text,
  check (todas_las_sedes or cardinality(sedes_habilitadas) >= 1)
);
create unique index programas_codigo_unico on public.programas (lower(btrim(codigo)));
create unique index programas_nombre_activo_unico on public.programas (lower(btrim(nombre))) where estado = 'Activo';
comment on table public.programas is 'Programas que se venden (Kids, Pre-Kids, Profesional…). Duración base y garantía en meses. Con `todas_las_sedes` en falso solo se ofrece en las sedes de `sedes_habilitadas`.';

create table public.niveles (
  id              text primary key check (id ~ '^[0-9]{1,9}$'),
  programa_id     text not null references public.programas (id) on delete restrict,
  codigo          text not null check (length(btrim(codigo)) between 1 and 40),
  nombre          text not null check (length(btrim(nombre)) between 1 and 80),
  orden           integer not null check (orden >= 1),
  estado          text not null default 'Activo' check (estado in ('Activo', 'Inactivo')),
  descripcion     text,
  creado_en       timestamptz not null default now(),
  creado_por      text,
  actualizado_en  timestamptz not null default now(),
  actualizado_por text
);
create unique index niveles_codigo_unico on public.niveles (programa_id, lower(btrim(codigo)));
create index niveles_programa_idx on public.niveles (programa_id);
comment on table public.niveles is 'Niveles de un programa que tiene niveles (Nivel 1, Nivel 2…).';

create table public.tipos_pago (
  id              text primary key check (id ~ '^[0-9]{1,9}$'),
  codigo          text not null check (length(btrim(codigo)) between 1 and 40),
  nombre          text not null check (length(btrim(nombre)) between 1 and 80),
  cuotas          integer not null check (cuotas >= 1),
  intervalo_dias  integer not null default 0 check (intervalo_dias >= 0),
  modalidad       text not null check (modalidad in ('inmediato', 'intervalo_fijo', 'fechas_manuales')),
  estado          text not null default 'Activo' check (estado in ('Activo', 'Inactivo')),
  descripcion     text,
  creado_en       timestamptz not null default now(),
  creado_por      text,
  actualizado_en  timestamptz not null default now(),
  actualizado_por text,
  check ((modalidad = 'inmediato' and cuotas = 1) or (modalidad <> 'inmediato' and cuotas >= 2)),
  check (modalidad <> 'intervalo_fijo' or intervalo_dias >= 1)
);
create unique index tipos_pago_codigo_unico on public.tipos_pago (lower(btrim(codigo)));
comment on table public.tipos_pago is 'Modalidades comerciales base de los tarifarios: contado, contado en partes, planes en cuotas. `cuotas` = obligaciones del cronograma (sin contar la matrícula).';

create table public.tarifarios (
  id              text primary key check (id ~ '^[0-9]{1,9}$'),
  nombre          text not null check (length(btrim(nombre)) between 1 and 120),
  programa_id     text not null references public.programas (id) on delete restrict,
  nivel_id        text references public.niveles (id) on delete restrict,
  tipo_pago_id    text not null references public.tipos_pago (id) on delete restrict,
  sede_id         text references public.sedes (id) on delete restrict,
  moneda          text not null default 'USD' check (moneda in ('PEN', 'USD')),
  precio_base     numeric(12,2) not null check (precio_base > 0),
  lineas          jsonb not null check (jsonb_typeof(lineas) = 'array' and jsonb_array_length(lineas) >= 1),
  vigencia_inicio date not null,
  vigencia_fin    date,
  estado          text not null default 'Activo' check (estado in ('Activo', 'Inactivo')),
  creado_en       timestamptz not null default now(),
  creado_por      text,
  actualizado_en  timestamptz not null default now(),
  actualizado_por text,
  check (vigencia_fin is null or vigencia_fin >= vigencia_inicio)
);
create index tarifarios_programa_idx on public.tarifarios (programa_id);
create index tarifarios_nivel_idx on public.tarifarios (nivel_id);
create index tarifarios_tipo_pago_idx on public.tarifarios (tipo_pago_id);
create index tarifarios_sede_idx on public.tarifarios (sede_id);
comment on table public.tarifarios is 'Precio de un programa (y nivel, si lo hay) por tipo de pago y sede, con su vigencia. `sede_id` vacío = todas las sedes. `lineas` es el desglose (matrícula, cuotas o partes) y es la fuente del total.';
comment on column public.tarifarios.lineas is 'Lista de líneas {numero, concepto, monto, dias, tipo, variable}: número 0 = matrícula; tipo: matricula, cuota, unica o parte; las líneas `variable` fijan su monto al cobrar.';

create table public.promociones (
  id                    text primary key check (id ~ '^[0-9]{1,9}$'),
  codigo                text not null check (length(btrim(codigo)) between 1 and 40 and codigo !~ '\s'),
  nombre                text not null check (length(btrim(nombre)) between 1 and 120),
  tipo                  text not null default 'Grupal' check (tipo = 'Grupal'),
  alumnos_requeridos    integer not null check (alumnos_requeridos >= 2),
  programas_elegibles   text[] not null check (cardinality(programas_elegibles) >= 1),
  precio_base_requerido numeric(12,2) check (precio_base_requerido is null or precio_base_requerido > 0),
  permite_varios_grupos boolean not null default false,
  tipos_pago            text[] not null check (cardinality(tipos_pago) >= 1),
  precio_total          numeric(12,2) not null check (precio_total > 0),
  moneda                text not null default 'USD' check (moneda in ('PEN', 'USD')),
  regla_reparto         text not null default 'Igualitario' check (regla_reparto = 'Igualitario'),
  todas_las_sedes       boolean not null default true,
  sedes                 text[] not null default '{}',
  vigencia_inicio       date not null,
  vigencia_fin          date,
  estado                text not null default 'Activo' check (estado in ('Activo', 'Inactivo')),
  observaciones         text,
  creado_en             timestamptz not null default now(),
  creado_por            text,
  actualizado_en        timestamptz not null default now(),
  actualizado_por       text,
  check (todas_las_sedes or cardinality(sedes) >= 1),
  check (vigencia_fin is null or vigencia_fin >= vigencia_inicio)
);
create unique index promociones_codigo_unico on public.promociones (lower(btrim(codigo)));
comment on table public.promociones is 'Promociones grupales: N alumnos de los programas elegibles, con los tipos de pago permitidos, por un precio total repartido en partes iguales.';

create table public.origenes_lead (
  id              text primary key check (id ~ '^[0-9]{1,9}$'),
  nombre          text not null check (length(btrim(nombre)) between 1 and 60),
  estado          text not null default 'Activo' check (estado in ('Activo', 'Inactivo')),
  creado_en       timestamptz not null default now(),
  creado_por      text,
  actualizado_en  timestamptz not null default now(),
  actualizado_por text
);
create unique index origenes_lead_nombre_unico on public.origenes_lead (lower(btrim(nombre)));
comment on table public.origenes_lead is 'Canales por los que llegan los prospectos (Facebook Ads, Referido, WhatsApp…).';

-- ---------------------------------------------------------------------------------------------------------------------
-- Disparadores: quién y cuándo
-- ---------------------------------------------------------------------------------------------------------------------

create function app.catalogo_huella() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.creado_en := now();
    new.creado_por := app.quien(null);
  else
    new.creado_en := old.creado_en;
    new.creado_por := old.creado_por;
  end if;
  new.actualizado_en := now();
  new.actualizado_por := app.quien(null);
  return new;
end;
$$;

create trigger programas_huella    before insert or update on public.programas    for each row execute function app.catalogo_huella();
create trigger niveles_huella      before insert or update on public.niveles      for each row execute function app.catalogo_huella();
create trigger tipos_pago_huella   before insert or update on public.tipos_pago   for each row execute function app.catalogo_huella();
create trigger tarifarios_huella   before insert or update on public.tarifarios   for each row execute function app.catalogo_huella();
create trigger promociones_huella  before insert or update on public.promociones  for each row execute function app.catalogo_huella();
create trigger origenes_lead_huella before insert or update on public.origenes_lead for each row execute function app.catalogo_huella();

-- ---------------------------------------------------------------------------------------------------------------------
-- Validaciones (las mismas que hace la pantalla; la base las vuelve a comprobar). SECURITY DEFINER: leen las tablas aunque la cuenta
-- no vea Organización.
-- ---------------------------------------------------------------------------------------------------------------------

-- Lista de ids sin repetidos, en orden; vacía si es nula.
create function app.ids_unicos(p_ids text[]) returns text[]
language sql immutable set search_path = '' as $$
  select coalesce(array(select distinct x from unnest(coalesce(p_ids, '{}'::text[])) x order by x), '{}'::text[]);
$$;

create function app.programa_validar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.codigo := btrim(new.codigo);
  new.nombre := btrim(new.nombre);
  if new.codigo = '' then raise exception 'El código oficial es obligatorio.' using errcode = 'EN001'; end if;
  if new.nombre = '' then raise exception 'El nombre oficial es obligatorio.' using errcode = 'EN001'; end if;
  if new.duracion_base < 1 then raise exception 'La duración base debe ser al menos 1 mes.' using errcode = 'EN001'; end if;
  if new.garantia < 0 then raise exception 'La garantía no puede ser negativa.' using errcode = 'EN001'; end if;
  if new.todas_las_sedes then
    new.sedes_habilitadas := '{}';
  else
    new.sedes_habilitadas := app.ids_unicos(new.sedes_habilitadas);
    if cardinality(new.sedes_habilitadas) = 0 then raise exception 'Debe seleccionar al menos una sede.' using errcode = 'EN001'; end if;
    if exists (select 1 from unnest(new.sedes_habilitadas) s where not exists (select 1 from public.sedes x where x.id = s)) then
      raise exception 'Una de las sedes elegidas no existe.' using errcode = 'EN001';
    end if;
  end if;
  return new;
end;
$$;
create trigger programas_validar before insert or update on public.programas for each row execute function app.programa_validar();

create function app.nivel_validar() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_prog public.programas;
begin
  new.codigo := btrim(new.codigo);
  new.nombre := btrim(new.nombre);
  select * into v_prog from public.programas p where p.id = new.programa_id;
  if not found then raise exception 'El programa seleccionado no existe.' using errcode = 'EN001'; end if;
  if not v_prog.tiene_niveles then
    raise exception 'El programa "%" no está habilitado para gestionar niveles. Solo se permiten programas configurados con «Tiene niveles» en la sección Programas.', v_prog.nombre using errcode = 'EN001';
  end if;
  if new.nombre = '' then raise exception 'El nombre del nivel es obligatorio.' using errcode = 'EN001'; end if;
  if new.codigo = '' then raise exception 'El código del nivel es obligatorio.' using errcode = 'EN001'; end if;
  if new.orden < 1 then raise exception 'El orden del nivel debe ser un número entero desde 1.' using errcode = 'EN001'; end if;
  return new;
end;
$$;
create trigger niveles_validar before insert or update on public.niveles for each row execute function app.nivel_validar();

create function app.tipo_pago_validar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.codigo := btrim(new.codigo);
  new.nombre := btrim(new.nombre);
  if new.codigo = '' then raise exception 'El código es obligatorio.' using errcode = 'EN001'; end if;
  if new.nombre = '' then raise exception 'El nombre es obligatorio.' using errcode = 'EN001'; end if;
  if new.modalidad = 'inmediato' and new.cuotas <> 1 then raise exception 'El pago inmediato tiene una sola obligación.' using errcode = 'EN001'; end if;
  if new.modalidad <> 'inmediato' and new.cuotas < 2 then raise exception 'Esta modalidad requiere al menos 2 obligaciones.' using errcode = 'EN001'; end if;
  if new.modalidad = 'intervalo_fijo' and new.intervalo_dias < 1 then raise exception 'El intervalo entre cuotas debe ser de al menos 1 día.' using errcode = 'EN001'; end if;
  return new;
end;
$$;
create trigger tipos_pago_validar before insert or update on public.tipos_pago for each row execute function app.tipo_pago_validar();

create function app.tarifario_validar() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_prog     public.programas;
  v_nivel    public.niveles;
  v_tipo     public.tipos_pago;
  v_linea    jsonb;
  v_obliga   integer := 0;
  v_variable boolean := false;
  v_suma     numeric := 0;
begin
  new.nombre := btrim(new.nombre);
  if new.nombre = '' then raise exception 'El nombre de la tarifa es obligatorio.' using errcode = 'EN001'; end if;
  select * into v_prog from public.programas p where p.id = new.programa_id;
  if not found then raise exception 'Debe seleccionar un programa.' using errcode = 'EN001'; end if;
  if new.nivel_id is not null then
    select * into v_nivel from public.niveles n where n.id = new.nivel_id;
    if not found or not v_prog.tiene_niveles or v_nivel.programa_id <> new.programa_id then
      raise exception 'El nivel seleccionado no pertenece al programa.' using errcode = 'EN001';
    end if;
  end if;
  select * into v_tipo from public.tipos_pago t where t.id = new.tipo_pago_id;
  if not found then raise exception 'Debe seleccionar un tipo de pago.' using errcode = 'EN001'; end if;
  if new.sede_id is not null and not exists (select 1 from public.sedes s where s.id = new.sede_id) then
    raise exception 'La sede elegida no existe.' using errcode = 'EN001';
  end if;

  if jsonb_typeof(new.lineas) <> 'array' or jsonb_array_length(new.lineas) = 0 then
    raise exception 'Genere el desglose antes de guardar.' using errcode = 'EN001';
  end if;
  for v_linea in select * from jsonb_array_elements(new.lineas) loop
    if jsonb_typeof(v_linea) is distinct from 'object' or jsonb_typeof(v_linea->'monto') is distinct from 'number'
       or jsonb_typeof(v_linea->'numero') is distinct from 'number' or jsonb_typeof(v_linea->'dias') is distinct from 'number'
       or length(btrim(coalesce(v_linea->>'concepto', ''))) = 0 then
      raise exception 'El desglose tiene una línea incompleta.' using errcode = 'EN001';
    end if;
    if coalesce(v_linea->>'tipo', '') not in ('matricula', 'cuota', 'unica', 'parte') then
      raise exception 'El desglose tiene una línea de un tipo desconocido.' using errcode = 'EN001';
    end if;
    if coalesce(v_linea->>'tipo', '') <> 'matricula' and (v_linea->>'numero')::numeric <> 0 then v_obliga := v_obliga + 1; end if;
    if coalesce((v_linea->>'variable')::boolean, false) then v_variable := true; else v_suma := v_suma + (v_linea->>'monto')::numeric; end if;
  end loop;
  if v_obliga <> v_tipo.cuotas then
    raise exception 'El tipo de pago "%" requiere % obligación(es) además de la matrícula. Regenere el desglose.', v_tipo.nombre, v_tipo.cuotas using errcode = 'EN001';
  end if;
  if not v_variable and exists (select 1 from jsonb_array_elements(new.lineas) l where not ((l->>'monto')::numeric > 0)) then
    raise exception 'Todas las líneas del desglose deben tener un monto mayor a 0.' using errcode = 'EN001';
  end if;
  if not v_variable and abs(new.precio_base - v_suma) > 0.005 then
    raise exception 'El precio base debe ser la suma del desglose.' using errcode = 'EN001';
  end if;
  if not (new.precio_base > 0) then
    if v_variable then raise exception 'Indique el total objetivo (mayor a 0).' using errcode = 'EN001'; end if;
    raise exception 'El total del desglose debe ser mayor a 0.' using errcode = 'EN001';
  end if;
  return new;
end;
$$;
create trigger tarifarios_validar before insert or update on public.tarifarios for each row execute function app.tarifario_validar();

create function app.promocion_validar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.codigo := btrim(new.codigo);
  new.nombre := btrim(new.nombre);
  if new.codigo = '' or new.codigo ~ '\s' then raise exception 'El código es obligatorio y no debe contener espacios.' using errcode = 'EN001'; end if;
  if new.nombre = '' then raise exception 'El nombre de la promoción es obligatorio.' using errcode = 'EN001'; end if;
  if new.alumnos_requeridos < 2 then raise exception 'La cantidad de alumnos requerida debe ser mayor a 1.' using errcode = 'EN001'; end if;
  new.programas_elegibles := app.ids_unicos(new.programas_elegibles);
  if cardinality(new.programas_elegibles) = 0 then raise exception 'Seleccione al menos un programa elegible.' using errcode = 'EN001'; end if;
  if exists (select 1 from unnest(new.programas_elegibles) p where not exists (select 1 from public.programas x where x.id = p)) then
    raise exception 'Uno de los programas elegidos no existe.' using errcode = 'EN001';
  end if;
  if new.precio_base_requerido is not null and not (new.precio_base_requerido > 0) then
    raise exception 'El precio contado base requerido debe ser mayor a 0 (o déjelo vacío).' using errcode = 'EN001';
  end if;
  new.tipos_pago := app.ids_unicos(new.tipos_pago);
  if cardinality(new.tipos_pago) = 0 then raise exception 'Debe seleccionar al menos un tipo de pago permitido.' using errcode = 'EN001'; end if;
  if exists (select 1 from unnest(new.tipos_pago) t where not exists (select 1 from public.tipos_pago x where x.id = t)) then
    raise exception 'Uno de los tipos de pago elegidos no existe.' using errcode = 'EN001';
  end if;
  if not (new.precio_total > 0) then raise exception 'El precio promocional total debe ser mayor a 0.' using errcode = 'EN001'; end if;
  if new.todas_las_sedes then
    new.sedes := '{}';
  else
    new.sedes := app.ids_unicos(new.sedes);
    if cardinality(new.sedes) = 0 then raise exception 'Debe seleccionar al menos una sede o aplicar a todas.' using errcode = 'EN001'; end if;
    if exists (select 1 from unnest(new.sedes) s where not exists (select 1 from public.sedes x where x.id = s)) then
      raise exception 'Una de las sedes elegidas no existe.' using errcode = 'EN001';
    end if;
  end if;
  if new.vigencia_fin is not null and new.vigencia_fin < new.vigencia_inicio then
    raise exception 'La fecha de fin no puede ser menor a la fecha de inicio.' using errcode = 'EN001';
  end if;
  return new;
end;
$$;
create trigger promociones_validar before insert or update on public.promociones for each row execute function app.promocion_validar();

create function app.origen_lead_validar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.nombre := btrim(new.nombre);
  if new.nombre = '' then raise exception 'El nombre del origen es obligatorio.' using errcode = 'EN001'; end if;
  return new;
end;
$$;
create trigger origenes_lead_validar before insert or update on public.origenes_lead for each row execute function app.origen_lead_validar();

-- ---------------------------------------------------------------------------------------------------------------------
-- Lo que ya se usa no se elimina (se inactiva): mensajes claros antes de que lo frene una clave foránea o una lista de ids.
-- ---------------------------------------------------------------------------------------------------------------------

create function app.programa_eliminar_guarda() returns trigger
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
  return old;
end;
$$;
create trigger programas_eliminar before delete on public.programas for each row execute function app.programa_eliminar_guarda();

create function app.nivel_eliminar_guarda() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.tarifarios t where t.nivel_id = old.id) then
    raise exception 'No se puede eliminar el nivel: hay tarifarios que lo usan. Elimínelos primero o inactive el nivel.' using errcode = 'EN001';
  end if;
  return old;
end;
$$;
create trigger niveles_eliminar before delete on public.niveles for each row execute function app.nivel_eliminar_guarda();

create function app.tipo_pago_eliminar_guarda() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.tarifarios t where t.tipo_pago_id = old.id) then
    raise exception 'No se puede eliminar el tipo de pago: hay tarifarios que lo usan. Elimínelos primero o inactive el tipo de pago.' using errcode = 'EN001';
  end if;
  if exists (select 1 from public.promociones p where old.id = any (p.tipos_pago)) then
    raise exception 'No se puede eliminar el tipo de pago: hay promociones que lo usan. Quítelo de ellas o inactive el tipo de pago.' using errcode = 'EN001';
  end if;
  return old;
end;
$$;
create trigger tipos_pago_eliminar before delete on public.tipos_pago for each row execute function app.tipo_pago_eliminar_guarda();

-- Una sede que el catálogo nombra (programa habilitado solo en ciertas sedes, tarifario de una sede, promoción de ciertas sedes) no se elimina.
create function app.sede_catalogo_eliminar_guarda() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.programas p where not p.todas_las_sedes and old.id = any (p.sedes_habilitadas))
     or exists (select 1 from public.tarifarios t where t.sede_id = old.id)
     or exists (select 1 from public.promociones p where not p.todas_las_sedes and old.id = any (p.sedes)) then
    raise exception 'No se puede eliminar la filial: el catálogo comercial (programas, tarifarios o promociones) la usa. Inactívela si ya no se usa.' using errcode = 'EN001';
  end if;
  return old;
end;
$$;
create trigger sedes_catalogo_eliminar before delete on public.sedes for each row execute function app.sede_catalogo_eliminar_guarda();

-- ---------------------------------------------------------------------------------------------------------------------
-- Permisos de tabla y RLS: leer, cualquier cuenta vigente; escribir, con la función del registro de cada pantalla.
-- ---------------------------------------------------------------------------------------------------------------------

revoke all on public.programas, public.niveles, public.tipos_pago, public.tarifarios, public.promociones, public.origenes_lead
  from public, anon, authenticated;
grant select, insert, update, delete on public.programas, public.niveles, public.tipos_pago, public.tarifarios, public.promociones, public.origenes_lead
  to authenticated;

alter table public.programas      enable row level security;
alter table public.niveles        enable row level security;
alter table public.tipos_pago     enable row level security;
alter table public.tarifarios     enable row level security;
alter table public.promociones    enable row level security;
alter table public.origenes_lead  enable row level security;

create policy programas_leer on public.programas for select to authenticated using ((select app.acceso_vigente()));
create policy programas_crear on public.programas for insert to authenticated with check ((select app.tiene_funcion('com-programas:create')));
create policy programas_editar on public.programas for update to authenticated
  using ((select app.tiene_funcion('com-programas:edit'))) with check ((select app.tiene_funcion('com-programas:edit')));
create policy programas_eliminar on public.programas for delete to authenticated using ((select app.tiene_funcion('com-programas:delete')));

create policy niveles_leer on public.niveles for select to authenticated using ((select app.acceso_vigente()));
create policy niveles_crear on public.niveles for insert to authenticated with check ((select app.tiene_funcion('com-niveles:create')));
create policy niveles_editar on public.niveles for update to authenticated
  using ((select app.tiene_funcion('com-niveles:edit'))) with check ((select app.tiene_funcion('com-niveles:edit')));
create policy niveles_eliminar on public.niveles for delete to authenticated using ((select app.tiene_funcion('com-niveles:delete')));

create policy tipos_pago_leer on public.tipos_pago for select to authenticated using ((select app.acceso_vigente()));
create policy tipos_pago_crear on public.tipos_pago for insert to authenticated with check ((select app.tiene_funcion('com-tipos-pago:create')));
create policy tipos_pago_editar on public.tipos_pago for update to authenticated
  using ((select app.tiene_funcion('com-tipos-pago:edit'))) with check ((select app.tiene_funcion('com-tipos-pago:edit')));
create policy tipos_pago_eliminar on public.tipos_pago for delete to authenticated using ((select app.tiene_funcion('com-tipos-pago:delete')));

create policy tarifarios_leer on public.tarifarios for select to authenticated using ((select app.acceso_vigente()));
create policy tarifarios_crear on public.tarifarios for insert to authenticated with check ((select app.tiene_funcion('com-tarifarios:create')));
create policy tarifarios_editar on public.tarifarios for update to authenticated
  using ((select app.tiene_funcion('com-tarifarios:edit'))) with check ((select app.tiene_funcion('com-tarifarios:edit')));
create policy tarifarios_eliminar on public.tarifarios for delete to authenticated using ((select app.tiene_funcion('com-tarifarios:delete')));

create policy promociones_leer on public.promociones for select to authenticated using ((select app.acceso_vigente()));
create policy promociones_crear on public.promociones for insert to authenticated with check ((select app.tiene_funcion('com-promociones:create')));
create policy promociones_editar on public.promociones for update to authenticated
  using ((select app.tiene_funcion('com-promociones:edit'))) with check ((select app.tiene_funcion('com-promociones:edit')));
create policy promociones_eliminar on public.promociones for delete to authenticated using ((select app.tiene_funcion('com-promociones:delete')));

create policy origenes_lead_leer on public.origenes_lead for select to authenticated using ((select app.acceso_vigente()));
create policy origenes_lead_crear on public.origenes_lead for insert to authenticated with check ((select app.tiene_funcion('cfg-leads:create')));
create policy origenes_lead_editar on public.origenes_lead for update to authenticated
  using ((select app.tiene_funcion('cfg-leads:edit'))) with check ((select app.tiene_funcion('cfg-leads:edit')));
create policy origenes_lead_eliminar on public.origenes_lead for delete to authenticated using ((select app.tiene_funcion('cfg-leads:delete')));

-- Las funciones nuevas del schema `app` solo las usa quien inició sesión.
revoke execute on all functions in schema app from public, anon;
grant execute on all functions in schema app to authenticated;

commit;
