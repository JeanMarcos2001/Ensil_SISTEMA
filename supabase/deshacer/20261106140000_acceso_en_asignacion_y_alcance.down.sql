-- Deshace 0006: vuelve `rol_sistema` (se reconstruye: sin acceso → «Sin acceso»; el almacén → «Almacén»; el resto, según el área), el Superusuario
-- vuelve a poder darse a una persona y Personal y Asignaciones vuelven a verse enteros con solo tener la función.
begin;

alter table public.asignaciones add column rol_sistema text;
alter table public.asignaciones disable trigger user;
update public.asignaciones set rol_sistema = case
  when not con_acceso then 'Sin acceso'
  when almacen_id is not null then 'Almacén'
  when area = 'Psicopedagogía' then 'Psicopedagogía'
  when area = 'Ventas' then 'Ventas'
  else 'Administración' end;
alter table public.asignaciones enable trigger user;
alter table public.asignaciones alter column rol_sistema set not null;
alter table public.asignaciones add constraint asignaciones_rol_sistema_check check (rol_sistema in ('Administración', 'Psicopedagogía', 'Ventas', 'Almacén', 'Sin acceso'));
alter table public.asignaciones add constraint asignaciones_almacen_rol_check check (almacen_id is null or rol_sistema in ('Almacén', 'Sin acceso'));
alter table public.asignaciones add constraint asignaciones_sede_rol_check check (sede_id is null or rol_sistema <> 'Almacén');

create or replace function app.sincronizar_cuenta(p_personal text) returns void
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

create or replace function app.cuentas_validar_personal() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  p public.personal;
  es_sis boolean;
begin
  select r.es_sistema into es_sis from public.roles r where r.id = new.rol_id;
  if new.personal_id is null then
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
  new.nombre := btrim(p.nombres || ' ' || p.apellido_paterno);
  new.documento := p.numero_documento;
  new.telefono := p.telefono;
  return new;
end;
$$;

alter table public.asignaciones drop column con_acceso;

drop policy personal_leer on public.personal;
drop policy personal_editar on public.personal;
drop policy asignaciones_leer on public.asignaciones;
drop policy asignaciones_crear on public.asignaciones;
drop policy asignaciones_editar on public.asignaciones;

create policy personal_leer on public.personal for select to authenticated
  using ((select app.tiene_funcion('per-personal:view')));
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

create or replace function public.inactivar_personal(p_id text, p_motivo text, p_detalle text, p_fecha date, p_por text) returns void
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

drop function if exists app.opera_lugar(text, text);
drop function if exists app.ve_asignacion(text, text, text);
drop function if exists app.ve_persona(text);
commit;
