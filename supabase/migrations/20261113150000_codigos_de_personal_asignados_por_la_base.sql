-- =====================================================================================================================
-- 0020 — Los códigos de Personal, Asignaciones y Contratos de personal los asigna la base (no la pantalla)
--
-- El mismo problema que se resolvió con el dinero (0019): cada pantalla proponía «el más alto que veo, más uno». Personal, asignaciones y contratos
-- se ven por sede (`app.ve_persona`), así que la cuenta de una sede proponía un código que ya existía en otra (la base lo rechazaba y el reintento
-- de la pantalla, que solo sumaba uno, podía agotarse sin lograrlo). El código de seis dígitos de la ficha y el de los ajustes de planilla igual.
--
-- La solución: la pantalla manda un código de BORRADOR donde antes iba el código (`STF-~1~`, `ASG-~2~`, `CON-~3~`, `AJU-~4~`) y la base lo cambia
-- por el siguiente al más alto que existe en TODA la tabla (sin el filtro por sede), con un candado por tipo que dura hasta el final de la operación:
-- sin repetidos y, si algo falla, sin huecos (el número sale del más alto que existe, no de un contador que pueda desfasarse).
--   · Personal y Asignaciones se guardan con un `insert` directo: un disparador (antes de insertar) cambia el borrador del id (y, en la ficha, el
--     código de seis dígitos) por los reales; el `insert … returning` los devuelve.
--   · Los contratos y los ajustes de planilla se guardan con funciones: `crear_contrato`, `renovar_contrato` y `agregar_ajuste_planilla` pasan a ser
--     envolturas que asignan el código y llaman a la función de siempre (ahora `app.*_base`), y devuelven el código asignado.
-- Un código que NO es un borrador se respeta tal cual (las cargas de partida del editor SQL y una pantalla vieja siguen funcionando: la llave primaria
-- y los índices únicos siguen protegiendo contra repetidos). El espejo en TypeScript es `src/utils/draftIds.ts`; `scripts/check-staff-codes.ts` lo
-- compara con este archivo.
-- Para deshacer: supabase/deshacer/20261113150000_codigos_de_personal_asignados_por_la_base.down.sql
-- =====================================================================================================================

begin;

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. El siguiente número de cada tipo, mirando TODA la tabla (la función corre con los permisos del dueño y no ve el filtro por sede)
-- ---------------------------------------------------------------------------------------------------------------------
create function app.siguiente_numero(p_prefijo text) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_max integer;
begin
  -- Un candado por tipo de código, que dura hasta el final de la operación: dos personas a la vez no reciben el mismo número
  perform pg_advisory_xact_lock(hashtextextended('ensil:codigo:' || p_prefijo || '|', 0));
  if p_prefijo = 'STF' then select max(substring(t.id from '^STF-([0-9]+)$')::integer) into v_max from public.personal t;
  elsif p_prefijo = 'COD' then select max(t.codigo::integer) into v_max from public.personal t;
  elsif p_prefijo = 'ASG' then select max(substring(t.id from '^ASG-([0-9]+)$')::integer) into v_max from public.asignaciones t;
  elsif p_prefijo = 'CON' then select max(substring(t.id from '^CON-([0-9]+)$')::integer) into v_max from public.contratos t;
  elsif p_prefijo = 'AJU' then select max(substring(t.id from '^AJU-([0-9]+)$')::integer) into v_max from public.planilla_ajustes t;
  else raise exception 'El código «%» no lo asigna el sistema.', p_prefijo using errcode = 'EN001';
  end if;
  return coalesce(v_max, 0) + 1;
end;
$$;
comment on function app.siguiente_numero(text) is 'El siguiente número de ese tipo (STF, COD = código de seis dígitos de la ficha, ASG, CON, AJU) mirando TODA la tabla, con un candado hasta el final de la operación.';

-- El número con ceros a la izquierda; si ya tiene más dígitos que el relleno, no se recorta (999 → 1000)
create function app.numero_con_relleno(p_n integer, p_pad integer) returns text
language sql immutable set search_path = '' as $$
  select case when length(p_n::text) >= p_pad then p_n::text else lpad(p_n::text, p_pad, '0') end;
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. Personal y Asignaciones: el disparador cambia el borrador por el código real antes de validar y guardar
--    (se ejecutan antes de `personal_validar_trg` y `asignaciones_validar_trg`: el orden es el alfabético de sus nombres)
-- ---------------------------------------------------------------------------------------------------------------------
create function app.personal_asignar_codigo() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(new.id ~ '^STF-~[0-9]+~$', false) then
    new.id := 'STF-' || app.numero_con_relleno(app.siguiente_numero('STF'), 3);
    -- El código de seis dígitos de la ficha lo asigna siempre la base cuando el id es un borrador (lo que mande la pantalla se ignora)
    new.codigo := app.numero_con_relleno(app.siguiente_numero('COD'), 6);
  end if;
  return new;
end;
$$;
create trigger personal_asignar_codigo_trg before insert on public.personal for each row execute function app.personal_asignar_codigo();

create function app.asignaciones_asignar_codigo() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(new.id ~ '^ASG-~[0-9]+~$', false) then
    new.id := 'ASG-' || app.numero_con_relleno(app.siguiente_numero('ASG'), 3);
  end if;
  return new;
end;
$$;
create trigger asignaciones_asignar_codigo_trg before insert on public.asignaciones for each row execute function app.asignaciones_asignar_codigo();

-- ---------------------------------------------------------------------------------------------------------------------
-- 3. Contratos y ajustes de planilla: las funciones de siempre pasan a ser la base; la pública es la envoltura que asigna el código y lo devuelve
-- ---------------------------------------------------------------------------------------------------------------------
alter function public.crear_contrato(text, jsonb) set schema app;
alter function app.crear_contrato(text, jsonb) rename to crear_contrato_base;

create function public.crear_contrato(p_id text, p jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_id text := p_id;
begin
  if coalesce(p_id ~ '^CON-~[0-9]+~$', false) then v_id := 'CON-' || app.numero_con_relleno(app.siguiente_numero('CON'), 3); end if;
  perform app.crear_contrato_base(v_id, p);
  return v_id;
end;
$$;
comment on function public.crear_contrato(text, jsonb) is 'Crea un contrato (la función de siempre, validada) y asigna su código si llega como borrador (CON-~n~) con el más alto de TODA la tabla. Devuelve el código.';

alter function public.renovar_contrato(text, text, jsonb) set schema app;
alter function app.renovar_contrato(text, text, jsonb) rename to renovar_contrato_base;

create function public.renovar_contrato(p_anterior text, p_id text, p jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_id text := p_id;
begin
  if coalesce(p_id ~ '^CON-~[0-9]+~$', false) then v_id := 'CON-' || app.numero_con_relleno(app.siguiente_numero('CON'), 3); end if;
  perform app.renovar_contrato_base(p_anterior, v_id, p);
  return v_id;
end;
$$;
comment on function public.renovar_contrato(text, text, jsonb) is 'Renueva un contrato (la función de siempre, validada) y asigna el código del nuevo si llega como borrador (CON-~n~). Devuelve el código del contrato nuevo.';

alter function public.agregar_ajuste_planilla(text, text, jsonb, text) set schema app;
alter function app.agregar_ajuste_planilla(text, text, jsonb, text) rename to agregar_ajuste_planilla_base;

create function public.agregar_ajuste_planilla(p_id text, p_planilla text, p jsonb, p_detalle text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_id text := p_id;
begin
  if coalesce(p_id ~ '^AJU-~[0-9]+~$', false) then v_id := 'AJU-' || app.numero_con_relleno(app.siguiente_numero('AJU'), 3); end if;
  perform app.agregar_ajuste_planilla_base(v_id, p_planilla, p, p_detalle);
  return v_id;
end;
$$;
comment on function public.agregar_ajuste_planilla(text, text, jsonb, text) is 'Agrega un ajuste a una planilla en borrador (la función de siempre, validada) y asigna su código si llega como borrador (AJU-~n~). Devuelve el código.';

-- ---------------------------------------------------------------------------------------------------------------------
-- Permisos: las públicas son de las cuentas con sesión; las bases y los ayudantes no se llaman de fuera (las envolturas y los disparadores corren con
-- los permisos del dueño). No se toca ningún otro permiso del esquema `app` (la 0019 dejó cerrada la base del dinero).
-- ---------------------------------------------------------------------------------------------------------------------
revoke execute on function public.crear_contrato(text, jsonb), public.renovar_contrato(text, text, jsonb), public.agregar_ajuste_planilla(text, text, jsonb, text) from public, anon;
grant execute on function public.crear_contrato(text, jsonb), public.renovar_contrato(text, text, jsonb), public.agregar_ajuste_planilla(text, text, jsonb, text) to authenticated;

revoke execute on function
  app.crear_contrato_base(text, jsonb), app.renovar_contrato_base(text, text, jsonb), app.agregar_ajuste_planilla_base(text, text, jsonb, text),
  app.siguiente_numero(text), app.numero_con_relleno(integer, integer), app.personal_asignar_codigo(), app.asignaciones_asignar_codigo()
  from public, anon, authenticated;

commit;
