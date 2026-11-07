-- =====================================================================================================================
-- 0007 · Contratos y planilla en la base (Lote 3)
-- ---------------------------------------------------------------------------------------------------------------------
--   · `contratos`: el contrato de cada trabajador, con SU EMPRESA (la que lo emplea) y su cargo. La empresa no se cambia después de crear el
--     contrato: cambiar de empleador es un contrato nuevo. Un trabajador tiene un solo contrato vigente.
--   · `contratos_pago`: lo que es dinero (sueldo, pensión, aportes, renta, neto) va APARTE, para que solo lo lea quien tiene la función
--     «Ver remuneraciones»: el cargo y las fechas los ve quien ve al personal; los sueldos, nadie más. La protección es de la base, no de la pantalla.
--   · `planillas`: UNA planilla por empresa y mes (cada RUC cierra la suya). `planilla_lineas` guarda la FOTO de cada línea al cerrar.
--   · Nadie escribe estas tablas directamente: todo pasa por funciones (crear/editar/cesar/renovar contrato; generar, ajustar, cerrar y reabrir
--     planilla) que validan, piden la función que corresponde y dejan constancia de quién y cuándo. Cada una es todo o nada.
--   · No se puede cesar un contrato ni renovarlo «encima» de una planilla ya cerrada con él, ni inactivar a quien aún tiene contrato vigente.
-- Los errores de negocio usan el código EN001: el sistema muestra su texto tal cual (está en español).
-- Para deshacer: supabase/deshacer/20261107120000_contratos_y_planilla.down.sql
-- =====================================================================================================================

begin;

-- ---------------------------------------------------------------------------------------------------------------------
-- Ayudantes
-- ---------------------------------------------------------------------------------------------------------------------

-- Hoy, en la fecha de Lima (los contratos, los cierres y las planillas se miden con el día de Perú).
create function app.hoy() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'America/Lima')::date;
$$;

-- Nombre de quien hace el cambio: el de la cuenta con la que se ingresó (lo que se manda desde la pantalla no se usa: no se puede falsear).
-- Las escrituras sin sesión (el editor SQL) quedan como «Sistema» o con el respaldo que se indique.
create function app.quien(p_respaldo text) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select c.nombre from public.cuentas c where c.id = auth.uid()), nullif(btrim(coalesce(p_respaldo, '')), ''), 'Sistema');
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------------------------------------------------

create table public.contratos (
  id               text primary key check (id ~ '^CON-[0-9]{3,}$'),
  personal_id      text not null references public.personal (id) on delete restrict,
  empresa_id       text not null references public.empresas (id) on delete restrict,
  tipo             text not null check (tipo in ('Indeterminado', 'Plazo Fijo', 'Locación de servicios')),
  cargo            text not null check (length(btrim(cargo)) between 3 and 60),
  fecha_inicio     date not null,
  fecha_fin        date,
  estado           text not null default 'Vigente' check (estado in ('Vigente', 'Cesado', 'Renovado')),
  jornada          text not null default 'Full time' check (jornada = 'Full time'),
  vacaciones_inicio date,
  vacaciones_fin   date,
  motivo_cese      text,
  renueva_id       text references public.contratos (id) on delete restrict,
  observaciones    text,
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now(),
  -- El plazo fijo y la locación tienen fecha de fin; el indeterminado solo la tiene si ya cesó (la fecha del cese)
  check ((tipo <> 'Indeterminado' and fecha_fin is not null) or (tipo = 'Indeterminado' and (fecha_fin is null or estado = 'Cesado'))),
  check (fecha_fin is null or fecha_fin >= fecha_inicio),
  check (estado <> 'Cesado' or (motivo_cese is not null and length(btrim(motivo_cese)) >= 5)),
  check ((vacaciones_inicio is null) = (vacaciones_fin is null)),
  check (vacaciones_fin is null or vacaciones_fin >= vacaciones_inicio),
  check (tipo <> 'Locación de servicios' or vacaciones_inicio is null)
);
create index contratos_personal_idx on public.contratos (personal_id);
create index contratos_empresa_idx on public.contratos (empresa_id);
comment on table public.contratos is 'Contrato de cada trabajador con la empresa que lo emplea (no cambia después de creado). No se borra: cesa o se renueva. Un solo contrato vigente por persona. Sin dinero: el sueldo está en contratos_pago.';

create table public.contratos_pago (
  contrato_id         text primary key references public.contratos (id) on delete cascade,
  sueldo_bruto        numeric(12,2) not null check (sueldo_bruto > 0 and sueldo_bruto <= 100000),
  sistema_pension     text check (sistema_pension is null or sistema_pension in ('AFP', 'ONP')),
  afp                 text check (afp is null or afp in ('Integra', 'Prima', 'Habitat', 'Profuturo')),
  aporte              numeric(12,2) not null default 0,
  renta               numeric(12,2) not null default 0,
  asignacion_familiar numeric(12,2) not null default 0,
  neto                numeric(12,2) not null,
  suspension_4ta      boolean not null default false,
  check (afp is null or sistema_pension = 'AFP')
);
comment on table public.contratos_pago is 'Lo que es dinero del contrato (sueldo, pensión, aportes, renta, neto). Solo lo lee quien tiene «Ver remuneraciones».';

create table public.contrato_revisiones (
  id          bigint generated always as identity primary key,
  contrato_id text not null references public.contratos (id) on delete cascade,
  en          timestamptz not null default now(),
  por         text not null,
  motivo      text not null check (length(btrim(motivo)) >= 5),
  cambios     jsonb not null
);
create index contrato_revisiones_contrato_idx on public.contrato_revisiones (contrato_id);
comment on table public.contrato_revisiones is 'Modificaciones de un contrato vigente, con motivo, quién y cuándo (incluyen cambios de sueldo: solo las lee quien tiene «Ver remuneraciones»).';

create table public.planillas (
  id          text primary key check (id ~ '^PLA-[0-9]{4}-[0-9]{2}-EMP-[0-9]{3,}$'),
  empresa_id  text not null references public.empresas (id) on delete restrict,
  periodo     text not null check (periodo ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  estado      text not null default 'Borrador' check (estado in ('Borrador', 'Cerrada')),
  creada_en   timestamptz not null default now(),
  creada_por  text not null,
  cerrada_en  timestamptz,
  cerrada_por text,
  unique (empresa_id, periodo),
  check (id = 'PLA-' || periodo || '-' || empresa_id),
  check ((estado = 'Cerrada') = (cerrada_en is not null))
);
comment on table public.planillas is 'Una planilla por empresa y mes (informativa: el sistema no registra pagos al personal). Borrador = se recalcula con los contratos; Cerrada guarda la foto de sus líneas.';

create table public.planilla_ajustes (
  id          text primary key check (id ~ '^AJU-[0-9]{3,}$'),
  planilla_id text not null references public.planillas (id) on delete cascade,
  personal_id text not null references public.personal (id) on delete restrict,
  tipo        text not null check (tipo in ('Ingreso', 'Descuento')),
  concepto    text not null check (length(btrim(concepto)) between 3 and 80),
  monto       numeric(12,2) not null check (monto > 0 and monto <= 100000),
  afecto      boolean not null default true,
  motivo      text not null check (length(btrim(motivo)) >= 5),
  por         text not null,
  en          timestamptz not null default now()
);
create index planilla_ajustes_planilla_idx on public.planilla_ajustes (planilla_id);

create table public.planilla_lineas (
  planilla_id text not null references public.planillas (id) on delete cascade,
  contrato_id text not null references public.contratos (id) on delete restrict,
  personal_id text not null references public.personal (id) on delete restrict,
  neto        numeric(12,2) not null,
  linea       jsonb not null,
  primary key (planilla_id, contrato_id)
);
create index planilla_lineas_contrato_idx on public.planilla_lineas (contrato_id);
comment on table public.planilla_lineas is 'La FOTO de cada línea de una planilla cerrada (el contrato tal como estaba y lo calculado). Se borra solo al reabrir la planilla.';

create table public.planilla_eventos (
  id          bigint generated always as identity primary key,
  planilla_id text not null references public.planillas (id) on delete cascade,
  en          timestamptz not null default now(),
  por         text not null,
  accion      text not null check (accion in ('Generada', 'Ajuste', 'Cerrada', 'Reabierta')),
  detalle     text
);
create index planilla_eventos_planilla_idx on public.planilla_eventos (planilla_id);

create trigger contratos_actualizado before update on public.contratos for each row execute function app.tocar_actualizado();

-- ---------------------------------------------------------------------------------------------------------------------
-- Reglas de un contrato (las mismas de la pantalla; la base las exige aunque alguien se las salte)
-- ---------------------------------------------------------------------------------------------------------------------

-- `p`: personal_id, empresa_id, tipo, cargo, fecha_inicio, fecha_fin, sueldo_bruto, sistema_pension, afp, vacaciones_inicio, vacaciones_fin.
-- `p_propio`: el contrato que se edita (no cuenta contra «un solo contrato vigente»).
-- La remuneración mínima vital cambia cada año: se valida en la pantalla, no aquí.
create function app.contrato_validar(p jsonb, p_propio text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_tipo   text := p->>'tipo';
  v_inicio date := nullif(p->>'fecha_inicio', '')::date;
  v_fin    date := nullif(p->>'fecha_fin', '')::date;
  v_vi     date := nullif(p->>'vacaciones_inicio', '')::date;
  v_vf     date := nullif(p->>'vacaciones_fin', '')::date;
  v_bruto  numeric := nullif(p->>'sueldo_bruto', '')::numeric;
begin
  if not exists (select 1 from public.personal x where x.id = p->>'personal_id' and x.estado = 'Activo') then
    raise exception 'El trabajador no existe o está inactivo.' using errcode = 'EN001';
  end if;
  if not exists (select 1 from public.empresas e where e.id = p->>'empresa_id' and e.estado = 'Activo') then
    raise exception 'La empresa elegida no existe o está inactiva.' using errcode = 'EN001';
  end if;
  if v_tipo is null or v_tipo not in ('Indeterminado', 'Plazo Fijo', 'Locación de servicios') then
    raise exception 'Seleccione el tipo de contrato.' using errcode = 'EN001';
  end if;
  if length(btrim(coalesce(p->>'cargo', ''))) < 3 then raise exception 'Indique el cargo (ej.: Psicólogo Senior).' using errcode = 'EN001'; end if;
  if length(btrim(p->>'cargo')) > 60 then raise exception 'El cargo es demasiado largo (máximo 60 caracteres).' using errcode = 'EN001'; end if;
  if v_inicio is null then raise exception 'La fecha de inicio es obligatoria.' using errcode = 'EN001'; end if;
  if v_tipo <> 'Indeterminado' then
    if v_fin is null then raise exception 'La fecha de fin es obligatoria para este tipo de contrato.' using errcode = 'EN001'; end if;
    if v_fin <= v_inicio then raise exception 'La fecha de fin debe ser posterior a la de inicio.' using errcode = 'EN001'; end if;
  elsif v_fin is not null then
    raise exception 'El contrato indeterminado no tiene fecha de fin.' using errcode = 'EN001';
  end if;
  if v_bruto is null or not (v_bruto > 0) then raise exception 'Indique el sueldo bruto.' using errcode = 'EN001'; end if;
  if v_bruto > 100000 then raise exception 'Revise el sueldo bruto.' using errcode = 'EN001'; end if;
  if v_tipo <> 'Locación de servicios' then
    if coalesce(p->>'sistema_pension', '') not in ('AFP', 'ONP') then raise exception 'Seleccione el sistema de pensiones.' using errcode = 'EN001'; end if;
    if p->>'sistema_pension' = 'AFP' and coalesce(p->>'afp', '') not in ('Integra', 'Prima', 'Habitat', 'Profuturo') then raise exception 'Seleccione la AFP.' using errcode = 'EN001'; end if;
    if v_vi is not null or v_vf is not null then
      if v_vi is null or v_vf is null then raise exception 'Indique el inicio y el retorno de las vacaciones.' using errcode = 'EN001'; end if;
      if v_vf < v_vi then raise exception 'El retorno no puede ser anterior al inicio.' using errcode = 'EN001'; end if;
      if v_vi < v_inicio then raise exception 'Las vacaciones no pueden empezar antes del contrato.' using errcode = 'EN001'; end if;
      if v_fin is not null and v_vf > v_fin then raise exception 'Las vacaciones no pueden terminar después del contrato.' using errcode = 'EN001'; end if;
    end if;
  elsif v_vi is not null or v_vf is not null then
    raise exception 'La locación de servicios no tiene vacaciones.' using errcode = 'EN001';
  end if;
  if exists (
    select 1 from public.contratos c
    where c.personal_id = p->>'personal_id' and c.id is distinct from p_propio and c.estado = 'Vigente' and (c.fecha_fin is null or c.fecha_fin >= app.hoy())
  ) then
    raise exception 'Este trabajador ya tiene un contrato vigente. Ciérrelo antes de crear otro.' using errcode = 'EN001';
  end if;
end;
$$;

-- Inserta el contrato y su parte de dinero (usada al crear y al renovar).
create function app.contrato_insertar(p_id text, p jsonb, p_renueva text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.contratos (id, personal_id, empresa_id, tipo, cargo, fecha_inicio, fecha_fin, estado, vacaciones_inicio, vacaciones_fin, renueva_id, observaciones)
  values (
    p_id, p->>'personal_id', p->>'empresa_id', p->>'tipo', btrim(p->>'cargo'), (p->>'fecha_inicio')::date, nullif(p->>'fecha_fin', '')::date, 'Vigente',
    nullif(p->>'vacaciones_inicio', '')::date, nullif(p->>'vacaciones_fin', '')::date, p_renueva, nullif(btrim(coalesce(p->>'observaciones', '')), '')
  );
  insert into public.contratos_pago (contrato_id, sueldo_bruto, sistema_pension, afp, aporte, renta, asignacion_familiar, neto, suspension_4ta)
  values (
    p_id, (p->>'sueldo_bruto')::numeric, nullif(p->>'sistema_pension', ''), nullif(p->>'afp', ''), coalesce(nullif(p->>'aporte', '')::numeric, 0),
    coalesce(nullif(p->>'renta', '')::numeric, 0), coalesce(nullif(p->>'asignacion_familiar', '')::numeric, 0), (p->>'neto')::numeric,
    coalesce((p->>'suspension_4ta')::boolean, false)
  );
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Contratos: crear, editar, cesar, renovar
-- ---------------------------------------------------------------------------------------------------------------------

create function public.crear_contrato(p_id text, p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.permite('per-contratos:create') then raise exception 'Su rol no tiene la función «Crear contrato».' using errcode = 'EN001'; end if;
  if not app.permite('per-remuneracion:view') then raise exception 'Para crear un contrato se necesita también la función «Ver remuneraciones».' using errcode = 'EN001'; end if;
  perform app.contrato_validar(p, null);
  perform app.contrato_insertar(p_id, p, null);
end;
$$;

-- Cambia las condiciones de un contrato vigente. El trabajador y la empresa NO cambian. Queda la constancia (qué cambió, por qué, quién, cuándo).
create function public.editar_contrato(p_id text, p jsonb, p_motivo text, p_cambios jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c public.contratos;
begin
  if not app.permite('per-contratos:edit') then raise exception 'Su rol no tiene la función «Editar contrato».' using errcode = 'EN001'; end if;
  if not app.permite('per-remuneracion:view') then raise exception 'Para editar un contrato se necesita también la función «Ver remuneraciones».' using errcode = 'EN001'; end if;
  select * into c from public.contratos where id = p_id for update;
  if not found then raise exception 'No se encontró el contrato.' using errcode = 'EN001'; end if;
  if c.estado <> 'Vigente' then raise exception 'Solo se puede editar un contrato vigente. Un contrato cesado queda como historial: registre uno nuevo.' using errcode = 'EN001'; end if;
  if p->>'personal_id' is distinct from c.personal_id then raise exception 'No se puede cambiar el trabajador de un contrato.' using errcode = 'EN001'; end if;
  if p->>'empresa_id' is distinct from c.empresa_id then raise exception 'No se puede cambiar la empresa de un contrato: cese este y registre uno nuevo.' using errcode = 'EN001'; end if;
  if coalesce(jsonb_array_length(p_cambios), 0) = 0 then raise exception 'No hay cambios que guardar.' using errcode = 'EN001'; end if;
  if length(btrim(coalesce(p_motivo, ''))) < 5 then raise exception 'Indique el motivo de la modificación: queda en el historial del contrato.' using errcode = 'EN001'; end if;
  perform app.contrato_validar(p, p_id);
  update public.contratos set
    tipo = p->>'tipo', cargo = btrim(p->>'cargo'), fecha_inicio = (p->>'fecha_inicio')::date, fecha_fin = nullif(p->>'fecha_fin', '')::date,
    vacaciones_inicio = nullif(p->>'vacaciones_inicio', '')::date, vacaciones_fin = nullif(p->>'vacaciones_fin', '')::date,
    observaciones = nullif(btrim(coalesce(p->>'observaciones', '')), '')
  where id = p_id;
  update public.contratos_pago set
    sueldo_bruto = (p->>'sueldo_bruto')::numeric, sistema_pension = nullif(p->>'sistema_pension', ''), afp = nullif(p->>'afp', ''),
    aporte = coalesce(nullif(p->>'aporte', '')::numeric, 0), renta = coalesce(nullif(p->>'renta', '')::numeric, 0),
    asignacion_familiar = coalesce(nullif(p->>'asignacion_familiar', '')::numeric, 0), neto = (p->>'neto')::numeric,
    suspension_4ta = coalesce((p->>'suspension_4ta')::boolean, false)
  where contrato_id = p_id;
  insert into public.contrato_revisiones (contrato_id, por, motivo, cambios) values (p_id, app.quien(null), btrim(p_motivo), p_cambios);
end;
$$;

-- Cese: fecha y motivo; no se puede si una planilla ya cerrada lo pagó en esas fechas.
create function public.cesar_contrato(p_id text, p_fecha date, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c public.contratos;
  cerrada text;
begin
  if not app.permite('per-contratos:close') then raise exception 'Su rol no tiene la función «Cerrar contrato».' using errcode = 'EN001'; end if;
  select * into c from public.contratos where id = p_id for update;
  if not found then raise exception 'No se encontró el contrato.' using errcode = 'EN001'; end if;
  if c.estado <> 'Vigente' then raise exception 'Solo se cierra un contrato vigente.' using errcode = 'EN001'; end if;
  if p_fecha is null then raise exception 'Indique la fecha de cese.' using errcode = 'EN001'; end if;
  if p_fecha < c.fecha_inicio then raise exception 'La fecha de cese no puede ser anterior al inicio del contrato.' using errcode = 'EN001'; end if;
  if length(btrim(coalesce(p_motivo, ''))) < 5 then raise exception 'Indique el motivo del cese.' using errcode = 'EN001'; end if;
  select pl.periodo into cerrada
  from public.planilla_lineas l join public.planillas pl on pl.id = l.planilla_id
  where l.contrato_id = p_id and pl.estado = 'Cerrada' and pl.periodo >= to_char(p_fecha, 'YYYY-MM')
  order by pl.periodo limit 1;
  if cerrada is not null then
    raise exception 'La planilla de % ya está cerrada con este contrato: reábrala o elija una fecha de cese posterior.', cerrada using errcode = 'EN001';
  end if;
  update public.contratos set estado = 'Cesado', fecha_fin = p_fecha, motivo_cese = btrim(p_motivo) where id = p_id;
end;
$$;

-- Renovación: el contrato que vence queda «Renovado» y nace uno nuevo, de la misma persona y la misma empresa, desde el día siguiente a su fin.
create function public.renovar_contrato(p_anterior text, p_id text, p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c public.contratos;
  cerrada text;
begin
  if not app.permite('per-contratos:renew') then raise exception 'Su rol no tiene la función «Renovar contrato».' using errcode = 'EN001'; end if;
  if not app.permite('per-remuneracion:view') then raise exception 'Para renovar un contrato se necesita también la función «Ver remuneraciones».' using errcode = 'EN001'; end if;
  select * into c from public.contratos where id = p_anterior for update;
  if not found then raise exception 'No se encontró el contrato.' using errcode = 'EN001'; end if;
  if c.estado <> 'Vigente' then raise exception 'Solo se renueva un contrato vigente o vencido sin cerrar.' using errcode = 'EN001'; end if;
  if c.fecha_fin is null then raise exception 'Un contrato indeterminado no se renueva: no tiene fecha de fin.' using errcode = 'EN001'; end if;
  if p->>'personal_id' is distinct from c.personal_id or p->>'empresa_id' is distinct from c.empresa_id then
    raise exception 'La renovación es de la misma persona y la misma empresa.' using errcode = 'EN001';
  end if;
  if nullif(p->>'fecha_inicio', '')::date is distinct from c.fecha_fin + 1 then
    raise exception 'El contrato nuevo empieza el día siguiente al fin del anterior.' using errcode = 'EN001';
  end if;
  if exists (select 1 from public.contratos x where x.personal_id = c.personal_id and x.id <> c.id and x.fecha_inicio >= c.fecha_fin + 1) then
    raise exception 'Ya hay un contrato de esta persona que empieza después del fin de este: no se puede renovar encima.' using errcode = 'EN001';
  end if;
  select pl.periodo into cerrada from public.planillas pl
  where pl.empresa_id = c.empresa_id and pl.estado = 'Cerrada' and pl.periodo >= to_char(c.fecha_fin + 1, 'YYYY-MM') order by pl.periodo limit 1;
  if cerrada is not null then
    raise exception 'Ya hay una planilla cerrada de % o posterior: reábrala antes de renovar con fecha de inicio %.', cerrada, c.fecha_fin + 1 using errcode = 'EN001';
  end if;
  update public.contratos set estado = 'Renovado' where id = p_anterior;
  perform app.contrato_validar(p, null);
  perform app.contrato_insertar(p_id, p, p_anterior);
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Planilla: generar, eliminar el borrador, ajustar, cerrar y reabrir
-- ---------------------------------------------------------------------------------------------------------------------

create function public.generar_planilla(p_id text, p_empresa text, p_periodo text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  anterior text;
begin
  if not app.permite('per-planilla:generate') then raise exception 'Su rol no tiene la función «Generar planilla».' using errcode = 'EN001'; end if;
  if p_periodo !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'Elija el mes de la planilla.' using errcode = 'EN001'; end if;
  if not exists (select 1 from public.empresas e where e.id = p_empresa and e.estado = 'Activo') then raise exception 'La empresa elegida no existe o está inactiva.' using errcode = 'EN001'; end if;
  if p_periodo > to_char(app.hoy(), 'YYYY-MM') then raise exception 'No se genera la planilla de un mes que aún no empieza.' using errcode = 'EN001'; end if;
  if exists (select 1 from public.planillas where empresa_id = p_empresa and periodo = p_periodo) then
    raise exception 'Ya existe la planilla de % de esa empresa.', p_periodo using errcode = 'EN001';
  end if;
  -- La renta de 5.ª categoría de un mes depende de lo retenido en el anterior del mismo año
  anterior := to_char((p_periodo || '-01')::date - interval '1 month', 'YYYY-MM');
  if substr(anterior, 1, 4) = substr(p_periodo, 1, 4) and exists (
    select 1 from public.planillas where empresa_id = p_empresa and periodo = anterior and estado = 'Borrador'
  ) then
    raise exception 'Cierre primero la planilla de % de esa empresa: la renta de 5.ª categoría de este mes depende de lo retenido en el anterior.', anterior using errcode = 'EN001';
  end if;
  insert into public.planillas (id, empresa_id, periodo, creada_por) values (p_id, p_empresa, p_periodo, app.quien(null));
  insert into public.planilla_eventos (planilla_id, por, accion) values (p_id, app.quien(null), 'Generada');
end;
$$;

create function public.eliminar_borrador_planilla(p_id text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  est text;
begin
  if not app.permite('per-planilla:generate') then raise exception 'Su rol no tiene la función «Generar y eliminar borradores de planilla».' using errcode = 'EN001'; end if;
  select estado into est from public.planillas where id = p_id for update;
  if not found then raise exception 'No se encontró la planilla.' using errcode = 'EN001'; end if;
  if est <> 'Borrador' then raise exception 'Solo se elimina una planilla en borrador.' using errcode = 'EN001'; end if;
  delete from public.planillas where id = p_id;
end;
$$;

create function public.agregar_ajuste_planilla(p_id text, p_planilla text, p jsonb, p_detalle text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  est text;
begin
  if not app.permite('per-planilla:adjust') then raise exception 'Su rol no tiene la función «Agregar ajustes (bonos, descuentos)».' using errcode = 'EN001'; end if;
  select estado into est from public.planillas where id = p_planilla for update;
  if not found then raise exception 'No se encontró la planilla.' using errcode = 'EN001'; end if;
  if est <> 'Borrador' then raise exception 'Solo se ajusta una planilla en borrador. Si ya se cerró, reábrala con un motivo.' using errcode = 'EN001'; end if;
  if not exists (select 1 from public.personal x where x.id = p->>'personal_id') then raise exception 'El trabajador no figura en esta planilla.' using errcode = 'EN001'; end if;
  if coalesce(p->>'tipo', '') not in ('Ingreso', 'Descuento') then raise exception 'Indique si es un ingreso o un descuento.' using errcode = 'EN001'; end if;
  if length(btrim(coalesce(p->>'concepto', ''))) < 3 then raise exception 'Indique el concepto (p. ej. «Bono por metas»).' using errcode = 'EN001'; end if;
  if not (coalesce((p->>'monto')::numeric, 0) > 0) then raise exception 'El monto debe ser mayor que cero.' using errcode = 'EN001'; end if;
  if (p->>'monto')::numeric > 100000 then raise exception 'Revise el monto.' using errcode = 'EN001'; end if;
  if length(btrim(coalesce(p->>'motivo', ''))) < 5 then raise exception 'Indique el motivo: queda en la planilla.' using errcode = 'EN001'; end if;
  insert into public.planilla_ajustes (id, planilla_id, personal_id, tipo, concepto, monto, afecto, motivo, por)
  values (p_id, p_planilla, p->>'personal_id', p->>'tipo', btrim(p->>'concepto'), (p->>'monto')::numeric, coalesce((p->>'afecto')::boolean, true), btrim(p->>'motivo'), app.quien(null));
  insert into public.planilla_eventos (planilla_id, por, accion, detalle) values (p_planilla, app.quien(null), 'Ajuste', p_detalle);
end;
$$;

create function public.quitar_ajuste_planilla(p_planilla text, p_ajuste text, p_detalle text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  est text;
begin
  if not app.permite('per-planilla:adjust') then raise exception 'Su rol no tiene la función «Agregar ajustes (bonos, descuentos)».' using errcode = 'EN001'; end if;
  select estado into est from public.planillas where id = p_planilla for update;
  if not found then raise exception 'No se encontró la planilla.' using errcode = 'EN001'; end if;
  if est <> 'Borrador' then raise exception 'Solo se ajusta una planilla en borrador.' using errcode = 'EN001'; end if;
  delete from public.planilla_ajustes where id = p_ajuste and planilla_id = p_planilla;
  if not found then raise exception 'No se encontró el ajuste.' using errcode = 'EN001'; end if;
  insert into public.planilla_eventos (planilla_id, por, accion, detalle) values (p_planilla, app.quien(null), 'Ajuste', p_detalle);
end;
$$;

-- Cierra la planilla y guarda la FOTO de sus líneas, todo o nada. `p_lineas`: [{contrato_id, personal_id, neto, linea}].
create function public.cerrar_planilla(p_id text, p_lineas jsonb, p_detalle text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  pl public.planillas;
  n int;
begin
  if not app.permite('per-planilla:close') then raise exception 'Su rol no tiene la función «Cerrar planilla».' using errcode = 'EN001'; end if;
  select * into pl from public.planillas where id = p_id for update;
  if not found then raise exception 'No se encontró la planilla.' using errcode = 'EN001'; end if;
  if pl.estado <> 'Borrador' then raise exception 'La planilla ya está cerrada.' using errcode = 'EN001'; end if;
  if pl.periodo > to_char(app.hoy(), 'YYYY-MM') then raise exception 'No se cierra la planilla de un mes que aún no empieza.' using errcode = 'EN001'; end if;
  n := coalesce(jsonb_array_length(p_lineas), 0);
  if n = 0 then raise exception 'La planilla no tiene trabajadores: no hay contratos que cubran el mes.' using errcode = 'EN001'; end if;
  if exists (
    select 1 from jsonb_to_recordset(p_lineas) as x(contrato_id text, personal_id text, neto numeric, linea jsonb)
    left join public.contratos c on c.id = x.contrato_id
    where c.id is null or c.empresa_id <> pl.empresa_id or c.personal_id <> x.personal_id
  ) then
    raise exception 'Hay una línea que no corresponde a un contrato de esta empresa.' using errcode = 'EN001';
  end if;
  insert into public.planilla_lineas (planilla_id, contrato_id, personal_id, neto, linea)
  select p_id, x.contrato_id, x.personal_id, x.neto, x.linea from jsonb_to_recordset(p_lineas) as x(contrato_id text, personal_id text, neto numeric, linea jsonb);
  update public.planillas set estado = 'Cerrada', cerrada_en = now(), cerrada_por = app.quien(null) where id = p_id;
  insert into public.planilla_eventos (planilla_id, por, accion, detalle) values (p_id, app.quien(null), 'Cerrada', p_detalle);
end;
$$;

-- Reabre una planilla cerrada (con motivo): vuelve a ser borrador y la foto se descarta. Solo si no hay otra posterior cerrada del mismo año y empresa.
create function public.reabrir_planilla(p_id text, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  pl public.planillas;
  posterior text;
begin
  if not app.permite('per-planilla:reopen') then raise exception 'Su rol no tiene la función «Reabrir planilla cerrada».' using errcode = 'EN001'; end if;
  select * into pl from public.planillas where id = p_id for update;
  if not found then raise exception 'No se encontró la planilla.' using errcode = 'EN001'; end if;
  if pl.estado <> 'Cerrada' then raise exception 'La planilla ya está en borrador.' using errcode = 'EN001'; end if;
  if length(btrim(coalesce(p_motivo, ''))) < 5 then raise exception 'Indique el motivo de la reapertura: queda en el historial.' using errcode = 'EN001'; end if;
  select x.periodo into posterior from public.planillas x
  where x.empresa_id = pl.empresa_id and x.id <> pl.id and x.estado = 'Cerrada' and substr(x.periodo, 1, 4) = substr(pl.periodo, 1, 4) and x.periodo > pl.periodo
  order by x.periodo limit 1;
  if posterior is not null then
    raise exception 'Ya está cerrada la planilla de %: reabra primero esa (la renta de 5.ª depende del orden).', posterior using errcode = 'EN001';
  end if;
  delete from public.planilla_lineas where planilla_id = p_id;
  update public.planillas set estado = 'Borrador', cerrada_en = null, cerrada_por = null where id = p_id;
  insert into public.planilla_eventos (planilla_id, por, accion, detalle) values (p_id, app.quien(null), 'Reabierta', btrim(p_motivo));
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Inactivar a una persona: ahora también exige que no tenga un contrato vigente (primero se cierra, que es el acto laboral)
-- ---------------------------------------------------------------------------------------------------------------------

create or replace function public.inactivar_personal(p_id text, p_motivo text, p_detalle text, p_fecha date, p_por text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.permite('per-personal:inactivate') then
    raise exception 'Su rol no tiene la función «Inactivar a un trabajador».' using errcode = 'EN001';
  end if;
  if exists (select 1 from public.contratos c where c.personal_id = p_id and c.estado = 'Vigente' and (c.fecha_fin is null or c.fecha_fin >= app.hoy())) then
    raise exception 'Tiene un contrato vigente: ciérrelo primero en Personas → Contratos.' using errcode = 'EN001';
  end if;
  perform set_config('app.baja_personal', 'on', true);
  update public.personal
    set estado = 'Inactivo', fecha_estado = p_fecha, motivo_estado = p_motivo || ' — ' || btrim(p_detalle)
    where id = p_id and estado = 'Activo';
  if not found then raise exception 'No se encontró al trabajador activo.' using errcode = 'EN001'; end if;
  update public.asignaciones
    set estado = 'Cerrada', es_principal = false, fecha_fin = greatest(p_fecha, fecha_inicio), motivo_cierre = p_motivo || ' — ' || btrim(p_detalle), cerrada_por = p_por
    where personal_id = p_id and estado = 'Activa';
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Permisos de tabla y RLS: solo lectura directa; todo lo demás, por las funciones de arriba
-- ---------------------------------------------------------------------------------------------------------------------

revoke all on public.contratos, public.contratos_pago, public.contrato_revisiones, public.planillas, public.planilla_ajustes, public.planilla_lineas, public.planilla_eventos
  from public, anon, authenticated;
grant select on public.contratos, public.contratos_pago, public.contrato_revisiones, public.planillas, public.planilla_ajustes, public.planilla_lineas, public.planilla_eventos
  to authenticated;

alter table public.contratos enable row level security;
alter table public.contratos_pago enable row level security;
alter table public.contrato_revisiones enable row level security;
alter table public.planillas enable row level security;
alter table public.planilla_ajustes enable row level security;
alter table public.planilla_lineas enable row level security;
alter table public.planilla_eventos enable row level security;

-- El contrato (cargo, empresa, fechas): lo ve quien ve al personal, los contratos o la planilla, de las personas que alcanza
create policy contratos_leer on public.contratos for select to authenticated
  using ((select app.tiene_funcion('per-personal:view') or app.tiene_funcion('per-contratos:view') or app.tiene_funcion('per-planilla:view')) and app.ve_persona(personal_id));

-- El dinero del contrato: solo con «Ver remuneraciones» (y para trabajar con contratos o planilla)
create policy contratos_pago_leer on public.contratos_pago for select to authenticated
  using (
    (select app.tiene_funcion('per-remuneracion:view') and (app.tiene_funcion('per-contratos:view') or app.tiene_funcion('per-planilla:view')))
    and exists (select 1 from public.contratos c where c.id = contrato_id and app.ve_persona(c.personal_id))
  );

create policy contrato_revisiones_leer on public.contrato_revisiones for select to authenticated
  using (
    (select app.tiene_funcion('per-remuneracion:view') and app.tiene_funcion('per-contratos:view'))
    and exists (select 1 from public.contratos c where c.id = contrato_id and app.ve_persona(c.personal_id))
  );

-- La planilla es de toda la organización: la ve quien tiene la función Y alcanza todas las sedes (un rol de una sola sede no ve la de las demás)
create policy planillas_leer on public.planillas for select to authenticated
  using ((select app.tiene_funcion('per-planilla:view') and app.tiene_funcion('per-remuneracion:view') and app.alcance_total()));
create policy planilla_ajustes_leer on public.planilla_ajustes for select to authenticated
  using ((select app.tiene_funcion('per-planilla:view') and app.tiene_funcion('per-remuneracion:view') and app.alcance_total()));
create policy planilla_lineas_leer on public.planilla_lineas for select to authenticated
  using ((select app.tiene_funcion('per-planilla:view') and app.tiene_funcion('per-remuneracion:view') and app.alcance_total()));
create policy planilla_eventos_leer on public.planilla_eventos for select to authenticated
  using ((select app.tiene_funcion('per-planilla:view') and app.tiene_funcion('per-remuneracion:view') and app.alcance_total()));

revoke execute on function
  public.crear_contrato(text, jsonb), public.editar_contrato(text, jsonb, text, jsonb), public.cesar_contrato(text, date, text), public.renovar_contrato(text, text, jsonb),
  public.generar_planilla(text, text, text), public.eliminar_borrador_planilla(text), public.agregar_ajuste_planilla(text, text, jsonb, text),
  public.quitar_ajuste_planilla(text, text, text), public.cerrar_planilla(text, jsonb, text), public.reabrir_planilla(text, text)
  from public, anon;
grant execute on function
  public.crear_contrato(text, jsonb), public.editar_contrato(text, jsonb, text, jsonb), public.cesar_contrato(text, date, text), public.renovar_contrato(text, text, jsonb),
  public.generar_planilla(text, text, text), public.eliminar_borrador_planilla(text), public.agregar_ajuste_planilla(text, text, jsonb, text),
  public.quitar_ajuste_planilla(text, text, text), public.cerrar_planilla(text, jsonb, text), public.reabrir_planilla(text, text)
  to authenticated;
revoke execute on function public.inactivar_personal(text, text, text, date, text) from public, anon;
grant execute on function public.inactivar_personal(text, text, text, date, text) to authenticated;
revoke execute on all functions in schema app from public, anon;
grant execute on all functions in schema app to authenticated;

commit;
