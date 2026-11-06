-- =====================================================================================================================
-- 0006 · Acceso Sí/No en la asignación, Superusuario solo técnico y alcance por sede en Personal y Asignaciones
--
--  1. «Rol del sistema» de la asignación (Administración, Psicopedagogía, Ventas, Almacén, Sin acceso) era una etiqueta de cuando el sistema
--     tenía 4 roles fijos y repetía el rol real de la cuenta. La asignación solo dice si la persona NECESITA ACCESO al sistema (Sí/No): el rol
--     real se elige una sola vez, en Usuarios, y se filtra por el lugar de trabajo. `rol_sistema` se reemplaza por `con_acceso`
--     («Sin acceso» pasa a ser «No»; cualquier otro valor, «Sí»).
--  2. El rol del sistema (Superusuario) es solo para cuentas técnicas, sin persona. Ya no se le da a una persona de Personal (y una cuenta
--     técnica solo puede tener ese rol, como antes).
--  3. Alcance por sede: Personal y Asignaciones se veían y se editaban enteros con solo tener la función. Ahora, igual que Filiales y
--     Cuentas, quien no alcanza todas las sedes solo ve y modifica a las personas y asignaciones de SUS sedes (el almacén, solo quien trabaja
--     en él; el Superusuario, todo). Una persona sin ninguna asignación todavía la ve quien la crea.
--
-- Después de aplicarla hay que volver a desplegar la Edge Function `usuarios` (ahora lee `con_acceso`).
-- Para deshacer: supabase/deshacer/20261106140000_acceso_en_asignacion_y_alcance.down.sql
-- =====================================================================================================================

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. rol_sistema → con_acceso
-- ---------------------------------------------------------------------------------------------------------------------

alter table public.asignaciones add column con_acceso boolean not null default true;

-- Se actualizan filas ya guardadas (también cerradas): los disparadores de usuario se apagan solo mientras dura este cambio de datos
alter table public.asignaciones disable trigger user;
update public.asignaciones set con_acceso = false where rol_sistema = 'Sin acceso';
alter table public.asignaciones enable trigger user;

-- Las restricciones que nombraban la columna (valores permitidos, almacén ↔ rol «Almacén») se van con ella
alter table public.asignaciones drop column rol_sistema;

comment on column public.asignaciones.con_acceso is 'La persona necesita acceso al sistema en este lugar de trabajo. Si es así, el lugar se suma a las sedes o al almacén de su cuenta. El rol real de la cuenta se elige en Usuarios.';

create or replace function app.sincronizar_cuenta(p_personal text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c record;
  principal text;
begin
  select a.sede_id into principal
  from public.asignaciones a
  where a.personal_id = p_personal and a.estado = 'Activa' and a.con_acceso and a.sede_id is not null
  order by a.es_principal desc, a.fecha_inicio, a.id
  limit 1;

  for c in select id from public.cuentas where personal_id = p_personal loop
    delete from public.cuenta_sedes where cuenta_id = c.id;
    delete from public.cuenta_almacenes where cuenta_id = c.id;
    insert into public.cuenta_sedes (cuenta_id, sede_id, es_principal)
      select distinct c.id, a.sede_id, (a.sede_id = principal)
      from public.asignaciones a
      where a.personal_id = p_personal and a.estado = 'Activa' and a.con_acceso and a.sede_id is not null;
    insert into public.cuenta_almacenes (cuenta_id, almacen_id)
      select distinct c.id, a.almacen_id
      from public.asignaciones a
      where a.personal_id = p_personal and a.estado = 'Activa' and a.con_acceso and a.almacen_id is not null;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. Superusuario solo técnico
-- ---------------------------------------------------------------------------------------------------------------------

create or replace function app.cuentas_validar_personal() returns trigger
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

  -- Y el rol del sistema es solo para esas cuentas técnicas: no se le da a una persona de Personal
  if coalesce(es_sis, false) and (tg_op = 'INSERT' or new.rol_id is distinct from old.rol_id) then
    raise exception 'El rol del sistema (Superusuario) es solo para cuentas técnicas, sin persona: no se le da a una persona de Personal.' using errcode = 'EN001';
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
    if not exists (select 1 from public.asignaciones a where a.personal_id = p.id and a.estado = 'Activa' and a.con_acceso) then
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

-- ---------------------------------------------------------------------------------------------------------------------
-- 3. Alcance por sede
-- ---------------------------------------------------------------------------------------------------------------------

-- ¿Puede ver a esta persona? Con alcance total, todas; si no: ella misma, quien aún no tiene ninguna asignación (acaba de crearse) y quien
-- tiene (o tuvo) alguna asignación en una sede que ve o en el almacén en el que trabaja.
create function app.ve_persona(persona text) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.alcance_total()
    or exists (select 1 from public.cuentas c where c.id = auth.uid() and c.personal_id = persona)
    or not exists (select 1 from public.asignaciones a where a.personal_id = persona)
    or exists (
      select 1 from public.asignaciones a
      where a.personal_id = persona
        and ((a.sede_id is not null and app.ve_sede(a.sede_id)) or (a.almacen_id is not null and app.ve_almacen(a.almacen_id)))
    );
$$;

-- ¿Puede VER una asignación de ese lugar? Quien alcanza la sede o ve el almacén (alcance total o asignado), o la propia persona.
create function app.ve_asignacion(sede text, almacen text, persona text) returns boolean
language sql stable security definer set search_path = '' as $$
  select (sede is not null and app.ve_sede(sede))
    or (almacen is not null and app.ve_almacen_lectura(almacen))
    or exists (select 1 from public.cuentas c where c.id = auth.uid() and c.personal_id = persona);
$$;

-- ¿Puede CREAR o CAMBIAR una asignación en ese lugar? Una sede que alcanza; el almacén solo si es Superusuario o trabaja en él
-- (ver el almacén no autoriza a mover a su gente: igual que en la Edge Function `usuarios`).
create function app.opera_lugar(sede text, almacen text) returns boolean
language sql stable security definer set search_path = '' as $$
  select (sede is not null and app.ve_sede(sede)) or (almacen is not null and app.ve_almacen(almacen));
$$;

revoke execute on all functions in schema app from public, anon;
grant execute on all functions in schema app to authenticated;

drop policy personal_leer on public.personal;
drop policy personal_editar on public.personal;
drop policy asignaciones_leer on public.asignaciones;
drop policy asignaciones_crear on public.asignaciones;
drop policy asignaciones_editar on public.asignaciones;

create policy personal_leer on public.personal for select to authenticated
  using ((select app.tiene_funcion('per-personal:view')) and app.ve_persona(id));
-- Editar, inactivar y reactivar son tres funciones: aquí basta una de ellas; el disparador exige la que corresponde a lo que cambia
create policy personal_editar on public.personal for update to authenticated
  using ((select app.tiene_funcion('per-personal:edit') or app.tiene_funcion('per-personal:inactivate') or app.tiene_funcion('per-personal:reactivate')) and app.ve_persona(id))
  with check ((select app.tiene_funcion('per-personal:edit') or app.tiene_funcion('per-personal:inactivate') or app.tiene_funcion('per-personal:reactivate')) and app.ve_persona(id));

create policy asignaciones_leer on public.asignaciones for select to authenticated
  using ((select app.tiene_funcion('per-asignaciones:view')) and app.ve_asignacion(sede_id, almacen_id, personal_id));
create policy asignaciones_crear on public.asignaciones for insert to authenticated
  with check ((select app.tiene_funcion('per-asignaciones:save')) and app.opera_lugar(sede_id, almacen_id) and app.ve_persona(personal_id));
create policy asignaciones_editar on public.asignaciones for update to authenticated
  using ((select app.tiene_funcion('per-asignaciones:save') or app.tiene_funcion('per-asignaciones:close')) and app.opera_lugar(sede_id, almacen_id))
  with check ((select app.tiene_funcion('per-asignaciones:save') or app.tiene_funcion('per-asignaciones:close')) and app.opera_lugar(sede_id, almacen_id));

-- La baja la hace una función propia (todo o nada) que no pasa por las políticas: aquí se exige también el alcance
create or replace function public.inactivar_personal(p_id text, p_motivo text, p_detalle text, p_fecha date, p_por text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.permite('per-personal:inactivate') then
    raise exception 'Su rol no tiene la función «Inactivar a un trabajador».' using errcode = 'EN001';
  end if;
  if auth.uid() is not null and not app.ve_persona(p_id) then
    raise exception 'Esa persona trabaja en otra sede: su cuenta no la alcanza.' using errcode = 'EN001';
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
