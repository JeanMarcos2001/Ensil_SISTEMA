-- =====================================================================================================================
-- 0001 · Base de acceso: empresas, sedes, almacenes, roles, funciones por rol y cuentas
-- ---------------------------------------------------------------------------------------------------------------------
-- Qué crea:
--   empresas, sedes, almacenes · roles, rol_funciones · cuentas, cuenta_sedes, cuenta_almacenes · schema `app` con las reglas de acceso (RLS)
-- Principios (docs/PLANTILLA_SUPABASE.md):
--   · RLS activo en TODAS las tablas y NINGÚN acceso para `anon`: sin sesión no se ve ni se escribe nada.
--   · Lo que alguien puede hacer sale de las mismas funciones del registro (`utils/capabilityRegistry.ts`): `funcionalidad:acción`.
--   · Lo que ya se usa no se borra: las claves entre tablas son ON DELETE RESTRICT, así que eliminar una empresa o sede solo
--     prospera si nada depende de ella; lo demás se inactiva.
--   · Las cuentas NO se crean ni se modifican desde el navegador: lo hará una Edge Function (invitación por correo) que comprueba
--     que quien llama es Superusuario. Por eso `cuentas` y `cuenta_sedes` solo tienen política de lectura.
--   · Las reglas de negocio siguen en `src/utils/*.ts`; aquí solo va lo imprescindible (seguridad e integridad).
-- Para deshacer: supabase/deshacer/20261105181142_acceso_base.down.sql
-- =====================================================================================================================

begin;

-- ---------------------------------------------------------------------------------------------------------------------
-- Cinturón de seguridad: lo que se cree de ahora en adelante en `public` nace SIN permisos para `anon`.
-- ---------------------------------------------------------------------------------------------------------------------
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;

-- Schema privado de ayudantes (no está expuesto por la API).
create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------------------------------------------------

create table public.empresas (
  id               text primary key check (id ~ '^EMP-[0-9]{3,}$'),
  ruc              text not null unique check (ruc ~ '^[0-9]{11}$'),
  razon_social     text not null check (length(btrim(razon_social)) between 1 and 150),
  nombre_comercial text check (nombre_comercial is null or length(btrim(nombre_comercial)) between 1 and 150),
  estado           text not null default 'Activo' check (estado in ('Activo', 'Inactivo')),
  observaciones    text,
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now()
);
comment on table public.empresas is 'Empresas del grupo (razón social y RUC). Cada sede apunta a la suya. No se borran: se inactivan.';

create table public.sedes (
  -- El código lo escribe la persona en Organización → Filiales (hoy solo se exige que no esté vacío y no se repita):
  -- la base acepta letras, números, guion y guion bajo (2 a 20), sin distinguir mayúsculas al comparar.
  id             text primary key check (id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{1,19}$'),
  id_web         integer unique,
  nombre         text not null check (length(btrim(nombre)) between 1 and 80),
  empresa_id     text references public.empresas (id) on delete restrict,
  estado         text not null default 'Activo' check (estado in ('Activo', 'Inactivo')),
  direccion      text not null check (length(btrim(direccion)) > 0),
  referencia     text,
  departamento   text not null check (length(btrim(departamento)) > 0),
  provincia      text not null check (length(btrim(provincia)) > 0),
  distrito       text not null check (length(btrim(distrito)) > 0),
  telefono_fijo  text,
  telefono_movil text,
  correo         text check (correo is null or position('@' in correo) > 1),
  responsable_id text,
  observaciones  text,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create unique index sedes_id_unico on public.sedes (lower(id));
create unique index sedes_nombre_unico on public.sedes (lower(nombre));
create index sedes_empresa_idx on public.sedes (empresa_id);
comment on table public.sedes is 'Sedes (filiales) con alumnos. Nunca almacén. No se borran: se inactivan.';
comment on column public.sedes.id_web is 'Id de la sede en la web pública (ensilperu.com); solo para enlazar, nada depende de él.';
comment on column public.sedes.empresa_id is 'Puede quedar vacío al cargar las sedes; la pantalla de Filiales la exige al guardar, y debe estar completa antes de emitir fichas y contratos.';
comment on column public.sedes.responsable_id is 'Ficha de personal (STF-NNN). Sin clave foránea hasta que el módulo Personal pase a la base.';

create table public.almacenes (
  id             text primary key check (id ~ '^ALM-[0-9]{3,}$'),
  nombre         text not null check (length(btrim(nombre)) between 1 and 80),
  empresa_id     text references public.empresas (id) on delete restrict,
  estado         text not null default 'Activo' check (estado in ('Activo', 'Inactivo')),
  direccion      text,
  observaciones  text,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create unique index almacenes_nombre_unico on public.almacenes (lower(nombre));
create index almacenes_empresa_idx on public.almacenes (empresa_id);
comment on table public.almacenes is 'Almacén central, aparte de las sedes: recibe compras, despacha y recibe devoluciones; no vende.';

create table public.roles (
  id                      text primary key check (id ~ '^ROL-[0-9]{3,}$'),
  nombre                  text not null check (length(btrim(nombre)) between 1 and 60),
  descripcion             text not null default '',
  estado                  text not null default 'Activo' check (estado in ('Activo', 'Inactivo')),
  plantilla_id            text,
  observaciones           text,
  limite_cuentas_por_sede integer check (limite_cuentas_por_sede between 1 and 50),
  es_sistema              boolean not null default false,
  riesgos_aceptados       jsonb not null default '[]'::jsonb check (jsonb_typeof(riesgos_aceptados) = 'array'),
  creado_en               timestamptz not null default now(),
  actualizado_en          timestamptz not null default now()
);
create unique index roles_nombre_unico on public.roles (lower(nombre));
comment on table public.roles is 'Roles armados en Organización → Permisos. El rol del sistema (Superusuario) no se edita, desactiva ni elimina.';

create table public.rol_funciones (
  rol_id     text not null references public.roles (id) on delete cascade,
  funcion_id text not null check (funcion_id ~ '^[a-z0-9]+(-[a-z0-9]+)*:[a-z0-9_]+$'),
  primary key (rol_id, funcion_id)
);
comment on table public.rol_funciones is 'Funciones (`funcionalidad:acción`, las del registro de funciones del código) que tiene cada rol. El Superusuario no las necesita: puede todo.';

create table public.cuentas (
  id             uuid primary key references auth.users (id) on delete restrict,
  nombre         text not null check (length(btrim(nombre)) between 1 and 120),
  correo         text not null check (correo = lower(btrim(correo)) and position('@' in correo) > 1),
  rol_id         text not null references public.roles (id) on delete restrict,
  estado         text not null default 'Activo' check (estado in ('Activo', 'Inactivo')),
  -- Equivale a la sede «Todas» de hoy (`scopeOfUser`): la cuenta alcanza todas las sedes aunque su rol no tenga org-alcance:all_branches.
  todas_las_sedes boolean not null default false,
  nota_estado    text,
  personal_id    text,
  documento      text,
  telefono       text,
  ultimo_acceso  timestamptz,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create unique index cuentas_correo_unico on public.cuentas (correo);
create index cuentas_rol_idx on public.cuentas (rol_id);
comment on table public.cuentas is 'Una fila por persona con ingreso (id = auth.users.id). La contraseña vive solo en Auth, cifrada. Se escribe solo desde la Edge Function de usuarios.';
comment on column public.cuentas.personal_id is 'Ficha de personal (STF-NNN). Sin clave foránea hasta que el módulo Personal pase a la base.';

create table public.cuenta_sedes (
  cuenta_id    uuid not null references public.cuentas (id) on delete cascade,
  sede_id      text not null references public.sedes (id) on delete restrict,
  es_principal boolean not null default false,
  primary key (cuenta_id, sede_id)
);
create unique index cuenta_sedes_una_principal on public.cuenta_sedes (cuenta_id) where es_principal;
create index cuenta_sedes_sede_idx on public.cuenta_sedes (sede_id);
comment on table public.cuenta_sedes is 'Sedes asignadas a cada cuenta (la principal y las adicionales). Para las cuentas de personal, el módulo Personal las dictará (asignaciones activas); hasta que pase a la base se guardan aquí.';

create table public.cuenta_almacenes (
  cuenta_id  uuid not null references public.cuentas (id) on delete cascade,
  almacen_id text not null references public.almacenes (id) on delete restrict,
  primary key (cuenta_id, almacen_id)
);
create index cuenta_almacenes_almacen_idx on public.cuenta_almacenes (almacen_id);
comment on table public.cuenta_almacenes is 'Almacenes en los que trabaja cada cuenta (p. ej. el rol Almacén central). Al separar el almacén de la sede, esa cuenta ya no se asigna a una sede.';

-- ---------------------------------------------------------------------------------------------------------------------
-- Ayudantes de acceso (schema app). SECURITY DEFINER para poder leer las tablas sin que las propias políticas se
-- vuelvan a evaluar; con `search_path` vacío para que nadie pueda suplantarlos.
-- ---------------------------------------------------------------------------------------------------------------------

-- ¿La sesión actual es de una cuenta activa con rol activo?
create function app.acceso_vigente() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.cuentas c join public.roles r on r.id = c.rol_id
    where c.id = auth.uid() and c.estado = 'Activo' and r.estado = 'Activo'
  );
$$;

-- ¿Es Superusuario (rol del sistema)?
create function app.es_superusuario() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.cuentas c join public.roles r on r.id = c.rol_id
    where c.id = auth.uid() and c.estado = 'Activo' and r.estado = 'Activo' and r.es_sistema
  );
$$;

-- ¿Tiene la función `funcionalidad:acción`? El Superusuario puede todo (igual que `can()` en el código).
create function app.tiene_funcion(funcion text) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.es_superusuario() or exists (
    select 1
    from public.cuentas c
    join public.roles r on r.id = c.rol_id
    join public.rol_funciones rf on rf.rol_id = r.id
    where c.id = auth.uid() and c.estado = 'Activo' and r.estado = 'Activo' and rf.funcion_id = funcion
  );
$$;

-- Rol de la cuenta actual (para que cada quien pueda leer el suyo).
create function app.rol_propio() returns text
language sql stable security definer set search_path = '' as $$
  select c.rol_id from public.cuentas c where c.id = auth.uid();
$$;

create function app.rol_es_sistema(rol text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select r.es_sistema from public.roles r where r.id = rol), false);
$$;

-- ¿Alcanza todas las sedes? Igual que `scopeOfUser`: Superusuario, rol con org-alcance:all_branches o cuenta marcada «Todas».
create function app.alcance_total() returns boolean
language sql stable security definer set search_path = '' as $$
  select app.tiene_funcion('org-alcance:all_branches') or coalesce((
    select c.todas_las_sedes from public.cuentas c
    join public.roles r on r.id = c.rol_id
    where c.id = auth.uid() and c.estado = 'Activo' and r.estado = 'Activo'
  ), false);
$$;

-- ¿Puede ver/operar esa sede? Con alcance total, todas; si no, solo las asignadas a su cuenta.
create function app.ve_sede(sede text) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.alcance_total() or (
    app.acceso_vigente() and exists (
      select 1 from public.cuenta_sedes cs where cs.cuenta_id = auth.uid() and cs.sede_id = sede
    )
  );
$$;

-- ¿Puede MOVER el stock de ese almacén (despachar, ingresar compras, ajustar)? El Superusuario o quien lo tenga asignado.
-- Alcanzar todas las sedes NO basta: quien aprueba o consulta no despacha ni ajusta (separación de funciones).
-- Lo usarán las políticas de escritura de las tablas de stock.
create function app.ve_almacen(almacen text) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.es_superusuario() or (
    app.acceso_vigente() and exists (
      select 1 from public.cuenta_almacenes ca where ca.cuenta_id = auth.uid() and ca.almacen_id = almacen
    )
  );
$$;

-- ¿Puede VER el stock de ese almacén? Quien lo mueve, más quien alcanza todas las sedes (necesita el stock total para aprobar
-- reposiciones y para los reportes globales). Lo usarán las políticas de lectura de las tablas de stock.
create function app.ve_almacen_lectura(almacen text) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.alcance_total() or app.ve_almacen(almacen);
$$;

-- ¿Puede ver esa empresa? La de alguna sede que ve.
create function app.ve_empresa(empresa text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.sedes s where s.empresa_id = empresa and app.ve_sede(s.id));
$$;

-- ¿Puede ver esa cuenta? La propia, o (con org-usuarios:view) las de las sedes que ve.
create function app.ve_cuenta(cuenta uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select cuenta = auth.uid() or (
    app.tiene_funcion('org-usuarios:view') and (
      app.alcance_total() or exists (
        select 1
        from public.cuenta_sedes mias
        join public.cuenta_sedes suyas on suyas.sede_id = mias.sede_id
        where mias.cuenta_id = auth.uid() and suyas.cuenta_id = cuenta
      )
    )
  );
$$;

revoke execute on all functions in schema app from public, anon;
grant execute on all functions in schema app to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- Disparadores de integridad
-- ---------------------------------------------------------------------------------------------------------------------

create function app.tocar_actualizado() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

create trigger empresas_actualizado  before update on public.empresas  for each row execute function app.tocar_actualizado();
create trigger sedes_actualizado     before update on public.sedes     for each row execute function app.tocar_actualizado();
create trigger almacenes_actualizado before update on public.almacenes for each row execute function app.tocar_actualizado();
create trigger roles_actualizado     before update on public.roles     for each row execute function app.tocar_actualizado();
create trigger cuentas_actualizado   before update on public.cuentas   for each row execute function app.tocar_actualizado();

-- El rol del sistema no se edita, no se elimina y ningún otro rol puede pasar a serlo.
create function app.proteger_rol_sistema() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.es_sistema then raise exception 'El rol del sistema no se puede eliminar.'; end if;
    return old;
  end if;
  if old.es_sistema then raise exception 'El rol del sistema no se puede modificar.'; end if;
  if new.es_sistema then raise exception 'Ningún rol puede pasar a ser del sistema.'; end if;
  return new;
end;
$$;
create trigger roles_proteger_sistema before update or delete on public.roles for each row execute function app.proteger_rol_sistema();

-- Siempre queda al menos una cuenta de Superusuario activa.
create function app.proteger_ultimo_superusuario() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Solo importa si la fila actual es un Superusuario activo…
  if old.estado <> 'Activo' or not exists (select 1 from public.roles r where r.id = old.rol_id and r.es_sistema) then
    return case tg_op when 'DELETE' then old else new end;
  end if;
  -- …y si después del cambio sigue siéndolo, tampoco hay problema.
  if tg_op = 'UPDATE' and new.estado = 'Activo'
     and exists (select 1 from public.roles r where r.id = new.rol_id and r.es_sistema) then
    return new;
  end if;
  if not exists (
    select 1 from public.cuentas c join public.roles r on r.id = c.rol_id
    where r.es_sistema and c.estado = 'Activo' and c.id <> old.id
  ) then
    raise exception 'Debe quedar al menos una cuenta de Superusuario activa.';
  end if;
  return case tg_op when 'DELETE' then old else new end;
end;
$$;
create trigger cuentas_ultimo_superusuario before update or delete on public.cuentas for each row execute function app.proteger_ultimo_superusuario();

-- ---------------------------------------------------------------------------------------------------------------------
-- Permisos de tabla y RLS (primero se quita todo; luego solo lo necesario, y solo para `authenticated`)
-- ---------------------------------------------------------------------------------------------------------------------

revoke all on public.empresas, public.sedes, public.almacenes, public.roles, public.rol_funciones, public.cuentas, public.cuenta_sedes, public.cuenta_almacenes
  from public, anon, authenticated;

grant select, insert, update, delete on public.empresas, public.sedes to authenticated;
grant select, insert, update on public.almacenes to authenticated;
grant select, insert, update, delete on public.roles to authenticated;
grant select, insert, delete on public.rol_funciones to authenticated;
grant select on public.cuentas, public.cuenta_sedes, public.cuenta_almacenes to authenticated;

alter table public.empresas     enable row level security;
alter table public.sedes        enable row level security;
alter table public.almacenes    enable row level security;
alter table public.roles        enable row level security;
alter table public.rol_funciones enable row level security;
alter table public.cuentas      enable row level security;
alter table public.cuenta_sedes enable row level security;
alter table public.cuenta_almacenes enable row level security;

-- Empresas: las ve quien tiene org-empresas:view o la de las sedes que ve; crea, edita y elimina con su función.
-- Eliminar solo prospera si nada la usa (las claves son ON DELETE RESTRICT): lo que ya tiene historia se inactiva.
create policy empresas_leer on public.empresas for select to authenticated
  using ((select app.tiene_funcion('org-empresas:view')) or app.ve_empresa(id));
create policy empresas_crear on public.empresas for insert to authenticated
  with check ((select app.tiene_funcion('org-empresas:create')));
create policy empresas_editar on public.empresas for update to authenticated
  using ((select app.tiene_funcion('org-empresas:edit'))) with check ((select app.tiene_funcion('org-empresas:edit')));
create policy empresas_eliminar on public.empresas for delete to authenticated
  using ((select app.tiene_funcion('org-empresas:delete')));

-- Sedes: las ve quien tiene org-filiales:view o la suya; crea, edita y elimina con su función (igual que empresas: solo si nada la usa).
create policy sedes_leer on public.sedes for select to authenticated
  using ((select app.tiene_funcion('org-filiales:view')) or app.ve_sede(id));
create policy sedes_crear on public.sedes for insert to authenticated
  with check ((select app.tiene_funcion('org-filiales:create')));
create policy sedes_editar on public.sedes for update to authenticated
  using ((select app.tiene_funcion('org-filiales:edit'))) with check ((select app.tiene_funcion('org-filiales:edit')));
create policy sedes_eliminar on public.sedes for delete to authenticated
  using ((select app.tiene_funcion('org-filiales:delete')));

-- Almacenes: los ve cualquier cuenta vigente (la logística los necesita); solo el Superusuario los crea o edita
-- hasta que exista su propia función en el registro (`capabilityRegistry.ts`).
create policy almacenes_leer on public.almacenes for select to authenticated
  using ((select app.acceso_vigente()));
create policy almacenes_crear on public.almacenes for insert to authenticated
  with check ((select app.es_superusuario()));
create policy almacenes_editar on public.almacenes for update to authenticated
  using ((select app.es_superusuario())) with check ((select app.es_superusuario()));

-- Roles: los ve quien tiene org-roles:view (y cada quien el suyo). Nadie toca el rol del sistema.
create policy roles_leer on public.roles for select to authenticated
  using ((select app.tiene_funcion('org-roles:view')) or id = (select app.rol_propio()));
create policy roles_crear on public.roles for insert to authenticated
  with check (not es_sistema and (select app.tiene_funcion('org-roles:create')));
create policy roles_editar on public.roles for update to authenticated
  using (not es_sistema and ((select app.tiene_funcion('org-roles:edit')) or (select app.tiene_funcion('org-roles:config_perms'))))
  with check (not es_sistema and ((select app.tiene_funcion('org-roles:edit')) or (select app.tiene_funcion('org-roles:config_perms'))));
create policy roles_eliminar on public.roles for delete to authenticated
  using (not es_sistema and (select app.tiene_funcion('org-roles:delete')));

-- Funciones de cada rol: se ven con org-roles:view (y las del propio rol); se cambian con org-roles:config_perms.
create policy rol_funciones_leer on public.rol_funciones for select to authenticated
  using ((select app.tiene_funcion('org-roles:view')) or rol_id = (select app.rol_propio()));
create policy rol_funciones_crear on public.rol_funciones for insert to authenticated
  with check ((select app.tiene_funcion('org-roles:config_perms')) and not app.rol_es_sistema(rol_id));
create policy rol_funciones_quitar on public.rol_funciones for delete to authenticated
  using ((select app.tiene_funcion('org-roles:config_perms')) and not app.rol_es_sistema(rol_id));

-- Cuentas y sus sedes: solo lectura desde el navegador (las escribe la Edge Function de usuarios).
create policy cuentas_leer on public.cuentas for select to authenticated
  using (app.ve_cuenta(id));
create policy cuenta_sedes_leer on public.cuenta_sedes for select to authenticated
  using (app.ve_cuenta(cuenta_id));
create policy cuenta_almacenes_leer on public.cuenta_almacenes for select to authenticated
  using (app.ve_cuenta(cuenta_id));

-- ---------------------------------------------------------------------------------------------------------------------
-- Datos de partida: el rol del sistema. La primera cuenta (Superusuario) se crea con supabase/seed/primer_superusuario.sql.
-- ---------------------------------------------------------------------------------------------------------------------
insert into public.roles (id, nombre, descripcion, es_sistema)
values ('ROL-001', 'Superusuario', 'Rol técnico del sistema: puede todo. No se edita, desactiva ni elimina.', true);

commit;
