-- =====================================================================================================================
-- 0004 · Personal y asignaciones en la base, y cuentas ancladas a una persona
-- ---------------------------------------------------------------------------------------------------------------------
--   · `personal`: la ficha de cada trabajador. `asignaciones`: dónde trabaja (UNA sede o el almacén), en qué área y con qué cargo.
--   · Una cuenta de usuario nace de una persona (`cuentas.personal_id`): una persona, una cuenta. Solo las cuentas con un rol del sistema
--     (Superusuario) pueden existir sin persona.
--   · Lo derivable se mantiene solo, dentro de la base (disparadores), para que no dependa de que alguien se acuerde de llamarlo:
--       - nombre, documento y teléfono de la cuenta = los de la ficha;
--       - sedes y almacén de la cuenta = los de sus asignaciones activas que dan acceso (rol del sistema distinto de «Sin acceso»);
--       - una persona con asignaciones activas tiene SIEMPRE una principal;
--       - al inactivar a la persona, se cierran sus asignaciones y su cuenta se desactiva (reactivarla es una decisión aparte).
--   · El correo de ingreso de una cuenta nunca es el correo personal de la ficha.
-- Los errores de negocio de estos disparadores usan el código EN001: el sistema muestra su texto tal cual (está en español).
-- Para deshacer: supabase/deshacer/20261106100000_personal_y_asignaciones.down.sql
-- =====================================================================================================================

begin;

-- ---------------------------------------------------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------------------------------------------------

create table public.personal (
  id               text primary key check (id ~ '^STF-[0-9]{3,}$'),
  codigo           text not null unique check (codigo ~ '^[0-9]{6}$'),
  tipo_documento   text not null check (tipo_documento in ('DNI', 'CE', 'Pasaporte')),
  numero_documento text not null check (length(btrim(numero_documento)) between 4 and 20),
  nombres          text not null check (length(btrim(nombres)) between 1 and 80),
  apellido_paterno text not null check (length(btrim(apellido_paterno)) between 1 and 60),
  apellido_materno text check (apellido_materno is null or length(btrim(apellido_materno)) between 1 and 60),
  fecha_nacimiento date not null,
  genero           text check (genero is null or genero in ('Masculino', 'Femenino', 'Otro')),
  estado_civil     text,
  tiene_hijos      boolean not null default false,
  numero_hijos     integer not null default 0 check (numero_hijos between 0 and 20),
  nivel_educativo  text,
  profesion        text,
  especialidad     text,
  telefono         text not null check (length(btrim(telefono)) between 5 and 20),
  correo_personal  text check (correo_personal is null or position('@' in correo_personal) > 1),
  direccion        text,
  estado           text not null default 'Activo' check (estado in ('Activo', 'Inactivo')),
  observaciones    text,
  fecha_estado     date,
  motivo_estado    text,
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now(),
  check (tiene_hijos or numero_hijos = 0)
);
create unique index personal_documento_unico on public.personal (lower(btrim(numero_documento)));
comment on table public.personal is 'Ficha de cada trabajador. No se borra: se inactiva (queda con fecha y motivo). Su cuenta de usuario nace de aquí.';
comment on column public.personal.correo_personal is 'Correo personal (opcional). Nunca es el correo de ingreso de su cuenta, que debe ser institucional.';

create table public.asignaciones (
  id             text primary key check (id ~ '^ASG-[0-9]{3,}$'),
  personal_id    text not null references public.personal (id) on delete restrict,
  sede_id        text references public.sedes (id) on delete restrict,
  almacen_id     text references public.almacenes (id) on delete restrict,
  area           text not null check (area in ('Administración', 'Psicopedagogía', 'Logística', 'Ventas')),
  cargo          text not null check (length(btrim(cargo)) between 3 and 60),
  rol_sistema    text not null check (rol_sistema in ('Administración', 'Psicopedagogía', 'Ventas', 'Almacén', 'Sin acceso')),
  fecha_inicio   date not null,
  fecha_fin      date,
  es_principal   boolean not null default false,
  estado         text not null default 'Activa' check (estado in ('Activa', 'Cerrada')),
  observaciones  text,
  motivo_cierre  text,
  cerrada_por    text,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  -- Una asignación es de UNA sede o del almacén, nunca de las dos ni de ninguna
  check ((sede_id is null) <> (almacen_id is null)),
  -- En el almacén solo se trabaja con el rol del sistema «Almacén» (o sin acceso: limpieza); «Almacén» no existe en una sede
  check (almacen_id is null or rol_sistema in ('Almacén', 'Sin acceso')),
  check (sede_id is null or rol_sistema <> 'Almacén'),
  check (estado = 'Activa' or es_principal = false),
  check (fecha_fin is null or fecha_fin >= fecha_inicio)
);
create unique index asignaciones_una_principal on public.asignaciones (personal_id) where es_principal and estado = 'Activa';
-- Una persona no repite lugar + área mientras la anterior siga activa
create unique index asignaciones_sin_duplicar on public.asignaciones (personal_id, coalesce(sede_id, almacen_id), lower(area)) where estado = 'Activa';
create index asignaciones_personal_idx on public.asignaciones (personal_id);
create index asignaciones_sede_idx on public.asignaciones (sede_id);
create index asignaciones_almacen_idx on public.asignaciones (almacen_id);
comment on table public.asignaciones is 'Dónde trabaja cada persona: una sede o el almacén, con área, cargo y rol del sistema. No se borra: se cierra con fecha y motivo. De las activas con acceso salen las sedes y el almacén de su cuenta.';

-- ---------------------------------------------------------------------------------------------------------------------
-- Ayudantes
-- ---------------------------------------------------------------------------------------------------------------------

-- Quien llama tiene la función; las escrituras que no vienen de una persona con sesión (el editor SQL, la Edge Function) no se frenan aquí.
create function app.permite(funcion text) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is null or app.tiene_funcion(funcion);
$$;

-- Deja la cuenta de una persona con las sedes y el almacén de sus asignaciones activas con acceso (la sede principal es la de su asignación
-- principal; si esa es el almacén, la de su asignación en sede más antigua).
create function app.sincronizar_cuenta(p_personal text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c record;
  principal text;
begin
  select a.sede_id into principal
  from public.asignaciones a
  where a.personal_id = p_personal and a.estado = 'Activa' and a.rol_sistema <> 'Sin acceso' and a.sede_id is not null
  order by a.es_principal desc, a.fecha_inicio, a.id
  limit 1;

  for c in select id from public.cuentas where personal_id = p_personal loop
    delete from public.cuenta_sedes where cuenta_id = c.id;
    delete from public.cuenta_almacenes where cuenta_id = c.id;
    insert into public.cuenta_sedes (cuenta_id, sede_id, es_principal)
      select distinct c.id, a.sede_id, (a.sede_id = principal)
      from public.asignaciones a
      where a.personal_id = p_personal and a.estado = 'Activa' and a.rol_sistema <> 'Sin acceso' and a.sede_id is not null;
    insert into public.cuenta_almacenes (cuenta_id, almacen_id)
      select distinct c.id, a.almacen_id
      from public.asignaciones a
      where a.personal_id = p_personal and a.estado = 'Activa' and a.rol_sistema <> 'Sin acceso' and a.almacen_id is not null;
  end loop;
end;
$$;

-- Toda persona con asignaciones activas tiene una principal (la primera lo es siempre; si se cierra la principal, la activa más antigua).
create function app.asegurar_principal(p_personal text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.asignaciones a set es_principal = true
  where a.id = (select x.id from public.asignaciones x where x.personal_id = p_personal and x.estado = 'Activa' order by x.fecha_inicio, x.id limit 1)
    and not exists (select 1 from public.asignaciones y where y.personal_id = p_personal and y.estado = 'Activa' and y.es_principal);
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Disparadores de `personal`
-- ---------------------------------------------------------------------------------------------------------------------

create function app.personal_validar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.id <> old.id then raise exception 'El id de una persona no se puede cambiar.' using errcode = 'EN001'; end if;
    if new.estado is distinct from old.estado then
      if new.estado = 'Inactivo' and not app.permite('per-personal:inactivate') then
        raise exception 'Su rol no tiene la función «Inactivar a un trabajador».' using errcode = 'EN001';
      elsif new.estado = 'Activo' and not app.permite('per-personal:reactivate') then
        raise exception 'Su rol no tiene la función «Reactivar a un trabajador».' using errcode = 'EN001';
      end if;
    end if;
    if (to_jsonb(new) - 'estado' - 'fecha_estado' - 'motivo_estado' - 'actualizado_en') is distinct from (to_jsonb(old) - 'estado' - 'fecha_estado' - 'motivo_estado' - 'actualizado_en')
       and not app.permite('per-personal:edit') then
      raise exception 'Su rol no tiene la función «Editar ficha de personal».' using errcode = 'EN001';
    end if;
  end if;
  new.correo_personal := nullif(btrim(coalesce(new.correo_personal, '')), '');
  if new.correo_personal is not null and exists (
    select 1 from public.cuentas c where c.personal_id = new.id and lower(c.correo) = lower(new.correo_personal)
  ) then
    raise exception 'Ese correo es el de ingreso de su cuenta: el correo personal debe ser otro.' using errcode = 'EN001';
  end if;
  return new;
end;
$$;

create function app.personal_sincronizar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.nombres is distinct from old.nombres or new.apellido_paterno is distinct from old.apellido_paterno
     or new.numero_documento is distinct from old.numero_documento or new.telefono is distinct from old.telefono then
    update public.cuentas
      set nombre = btrim(new.nombres || ' ' || new.apellido_paterno), documento = new.numero_documento, telefono = new.telefono
      where personal_id = new.id;
  end if;
  -- Un trabajador dado de baja no puede seguir entrando; al reactivarlo, la cuenta NO se reactiva sola
  if new.estado = 'Inactivo' and old.estado = 'Activo' then
    update public.cuentas
      set estado = 'Inactivo',
          nota_estado = 'Se desactivó al inactivar al trabajador el ' || coalesce(new.fecha_estado, current_date)::text || ' (' || coalesce(new.motivo_estado, 'sin motivo') || ').'
      where personal_id = new.id and estado = 'Activo';
  end if;
  return null;
end;
$$;

create trigger personal_actualizado before update on public.personal for each row execute function app.tocar_actualizado();
create trigger personal_validar_trg before insert or update on public.personal for each row execute function app.personal_validar();
create trigger personal_sincronizar_trg after update on public.personal for each row execute function app.personal_sincronizar();

-- ---------------------------------------------------------------------------------------------------------------------
-- Disparadores de `asignaciones`
-- ---------------------------------------------------------------------------------------------------------------------

create function app.asignaciones_validar() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  baja boolean := coalesce(current_setting('app.baja_personal', true), '') = 'on';
begin
  if tg_op = 'UPDATE' then
    if new.personal_id <> old.personal_id then raise exception 'No se puede cambiar el trabajador de una asignación.' using errcode = 'EN001'; end if;
    if old.estado = 'Cerrada' then raise exception 'La asignación está cerrada: no se edita. Cree una nueva.' using errcode = 'EN001'; end if;
  end if;

  -- Permisos: cerrar es una función y guardar otra (la baja de una persona cierra todo con su propia función)
  if not baja then
    if tg_op = 'UPDATE' and new.estado = 'Cerrada' then
      if not app.permite('per-asignaciones:close') then raise exception 'Su rol no tiene la función «Cerrar una asignación».' using errcode = 'EN001'; end if;
    elsif not app.permite('per-asignaciones:save') then
      raise exception 'Su rol no tiene la función «Crear o editar una asignación».' using errcode = 'EN001';
    end if;
  end if;

  if tg_op = 'INSERT' and not exists (select 1 from public.personal p where p.id = new.personal_id and p.estado = 'Activo') then
    raise exception 'El trabajador está inactivo: reactívelo antes de asignarlo.' using errcode = 'EN001';
  end if;
  if new.estado = 'Activa' and (tg_op = 'INSERT' or new.sede_id is distinct from old.sede_id or new.almacen_id is distinct from old.almacen_id) then
    if new.sede_id is not null and not exists (select 1 from public.sedes s where s.id = new.sede_id and s.estado = 'Activo') then
      raise exception 'La sede está inactiva: elija una sede activa.' using errcode = 'EN001';
    end if;
    if new.almacen_id is not null and not exists (select 1 from public.almacenes a where a.id = new.almacen_id and a.estado = 'Activo') then
      raise exception 'El almacén está inactivo: elija un almacén activo.' using errcode = 'EN001';
    end if;
  end if;

  if new.estado = 'Cerrada' then new.es_principal := false; end if;
  -- Si esta es la principal, la anterior pasa a secundaria
  if new.estado = 'Activa' and new.es_principal then
    update public.asignaciones set es_principal = false where personal_id = new.personal_id and es_principal and estado = 'Activa' and id <> new.id;
  end if;
  return new;
end;
$$;

create function app.asignaciones_despues() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Las actualizaciones que hacen estos mismos disparadores (pasar la principal) no vuelven a entrar
  if pg_trigger_depth() > 1 then return null; end if;
  if tg_op <> 'INSERT' then
    perform app.asegurar_principal(old.personal_id);
    perform app.sincronizar_cuenta(old.personal_id);
  end if;
  if tg_op <> 'DELETE' then
    perform app.asegurar_principal(new.personal_id);
    perform app.sincronizar_cuenta(new.personal_id);
  end if;
  return null;
end;
$$;

create trigger asignaciones_actualizado before update on public.asignaciones for each row execute function app.tocar_actualizado();
create trigger asignaciones_validar_trg before insert or update on public.asignaciones for each row execute function app.asignaciones_validar();
create trigger asignaciones_despues_trg after insert or update or delete on public.asignaciones for each row execute function app.asignaciones_despues();

-- ---------------------------------------------------------------------------------------------------------------------
-- La cuenta de usuario nace de una persona
-- ---------------------------------------------------------------------------------------------------------------------

alter table public.cuentas add constraint cuentas_personal_fk foreign key (personal_id) references public.personal (id) on delete restrict;
create unique index cuentas_personal_unico on public.cuentas (personal_id) where personal_id is not null;

create function app.cuentas_validar_personal() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  p public.personal;
  es_sis boolean;
begin
  select r.es_sistema into es_sis from public.roles r where r.id = new.rol_id;
  if new.personal_id is null then
    -- Solo el rol del sistema (Superusuario) puede tener una cuenta sin persona
    if not coalesce(es_sis, false) then
      raise exception 'Una cuenta que no es del sistema debe estar ligada a una persona de Personal.' using errcode = 'EN001';
    end if;
    return new;
  end if;

  select * into p from public.personal where id = new.personal_id;
  if not found then raise exception 'La persona de la cuenta no existe.' using errcode = 'EN001'; end if;
  if tg_op = 'UPDATE' and old.personal_id is not null and new.personal_id <> old.personal_id then
    raise exception 'Una cuenta no se pasa a otra persona: se desactiva y se crea una nueva.' using errcode = 'EN001';
  end if;
  if (tg_op = 'INSERT' or (old.estado = 'Inactivo' and new.estado = 'Activo')) and new.estado = 'Activo' then
    if p.estado <> 'Activo' then
      raise exception 'La persona está inactiva: reactívela en Personas → Personal antes de activar su cuenta.' using errcode = 'EN001';
    end if;
    if not exists (select 1 from public.asignaciones a where a.personal_id = p.id and a.estado = 'Activa' and a.rol_sistema <> 'Sin acceso') then
      raise exception 'La persona no tiene una asignación activa con acceso al sistema (Personas → Asignaciones).' using errcode = 'EN001';
    end if;
  end if;
  if p.correo_personal is not null and lower(new.correo) = lower(btrim(p.correo_personal)) then
    raise exception 'El correo de ingreso no puede ser el correo personal de la ficha: use el institucional.' using errcode = 'EN001';
  end if;
  -- Nombre, documento y teléfono salen siempre de la ficha
  new.nombre := btrim(p.nombres || ' ' || p.apellido_paterno);
  new.documento := p.numero_documento;
  new.telefono := p.telefono;
  return new;
end;
$$;

create function app.cuentas_despues() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.personal_id is not null and pg_trigger_depth() <= 1 then perform app.sincronizar_cuenta(new.personal_id); end if;
  return null;
end;
$$;

create trigger cuentas_validar_personal_trg before insert or update on public.cuentas for each row execute function app.cuentas_validar_personal();
create trigger cuentas_despues_trg after insert or update of personal_id on public.cuentas for each row execute function app.cuentas_despues();

-- ---------------------------------------------------------------------------------------------------------------------
-- Inactivar a una persona: todo o nada (la ficha, sus asignaciones y, por disparador, su cuenta)
-- ---------------------------------------------------------------------------------------------------------------------

create function public.inactivar_personal(p_id text, p_motivo text, p_detalle text, p_fecha date, p_por text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.permite('per-personal:inactivate') then
    raise exception 'Su rol no tiene la función «Inactivar a un trabajador».' using errcode = 'EN001';
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
-- Permisos de tabla y RLS
-- ---------------------------------------------------------------------------------------------------------------------

revoke all on public.personal, public.asignaciones from public, anon, authenticated;
grant select, insert, update on public.personal, public.asignaciones to authenticated;

alter table public.personal enable row level security;
alter table public.asignaciones enable row level security;

create policy personal_leer on public.personal for select to authenticated
  using ((select app.tiene_funcion('per-personal:view')));
create policy personal_crear on public.personal for insert to authenticated
  with check ((select app.tiene_funcion('per-personal:create')));
-- Editar, inactivar y reactivar son tres funciones: aquí basta una de ellas; el disparador exige la que corresponde a lo que cambia
create policy personal_editar on public.personal for update to authenticated
  using ((select app.tiene_funcion('per-personal:edit') or app.tiene_funcion('per-personal:inactivate') or app.tiene_funcion('per-personal:reactivate')))
  with check ((select app.tiene_funcion('per-personal:edit') or app.tiene_funcion('per-personal:inactivate') or app.tiene_funcion('per-personal:reactivate')));

create policy asignaciones_leer on public.asignaciones for select to authenticated
  using ((select app.tiene_funcion('per-asignaciones:view')));
create policy asignaciones_crear on public.asignaciones for insert to authenticated
  with check ((select app.tiene_funcion('per-asignaciones:save')));
create policy asignaciones_editar on public.asignaciones for update to authenticated
  using ((select app.tiene_funcion('per-asignaciones:save') or app.tiene_funcion('per-asignaciones:close')))
  with check ((select app.tiene_funcion('per-asignaciones:save') or app.tiene_funcion('per-asignaciones:close')));

revoke execute on function public.inactivar_personal(text, text, text, date, text) from public, anon;
grant execute on function public.inactivar_personal(text, text, text, date, text) to authenticated;
revoke execute on all functions in schema app from public, anon;
grant execute on all functions in schema app to authenticated;

commit;
