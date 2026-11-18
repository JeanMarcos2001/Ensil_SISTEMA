-- =====================================================================================================================
-- 0025 · Directorio del equipo: quién puede ser responsable, sin abrir la ficha de Personal
-- ---------------------------------------------------------------------------------------------------------------------
-- El problema (2026-11-18): reservar una asesoría, elegir al responsable de una actividad o de una entrevista, o nombrar a quien atiende una matrícula necesita
-- saber QUIÉN trabaja en la sede y en qué área. Pero las tablas `personal` y `asignaciones` solo las lee quien tiene «Ver personal» y «Ver asignaciones»: una cuenta
-- de Administrador de sede o de Psicopedagogía, sin esas funciones, recibía cero personas y la lista de responsables salía vacía (y, en la agenda, el nombre del
-- responsable de cada asesoría salía en blanco).
-- La solución: UNA función, `directorio_equipo()`, que entrega SOLO lo mínimo para elegir y nombrar a alguien:
--   · de cada persona: su código, sus nombres y apellidos y su estado (solo las activas);
--   · de cada asignación ACTIVA en una sede: la persona, la sede, el área, desde cuándo y si es la principal.
--   Nada más: ni documento, ni fecha de nacimiento, ni teléfono, ni correo, ni dirección, ni contratos ni sueldos (eso sigue pidiendo «Ver personal»,
--   «Ver contratos» y «Ver remuneraciones»).
-- Quién ve a quién: se ve al equipo de las sedes que la cuenta alcanza (la misma regla de siempre, `app.ve_sede`) y a uno mismo. Quien alcanza todas las sedes ve
-- a todos los de sede. Las asignaciones al almacén no se incluyen. Cualquier cuenta con acceso vigente puede llamarla; sin acceso vigente devuelve vacío.
-- La función NO cambia lo que las tablas dejan leer: quien ya tenía «Ver personal» sigue leyendo la ficha completa (el sistema deja ganar a la ficha completa
-- y agrega solo a quienes faltan).
-- Las vacaciones y el cese NO viajan aquí: la base sigue comprobándolos al guardar (`app.personal_disponible`) y avisa con su mensaje.
-- Para deshacer: supabase/deshacer/20261118100000_directorio_del_equipo.down.sql
-- =====================================================================================================================

begin;

create function public.directorio_equipo() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_personal jsonb;
  v_asig     jsonb;
begin
  if auth.uid() is null or not app.acceso_vigente() then
    return jsonb_build_object('personal', '[]'::jsonb, 'asignaciones', '[]'::jsonb);
  end if;

  -- Las asignaciones activas, en las sedes que la cuenta alcanza, de personas activas
  select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb) into v_asig
  from (
    select a.id, a.personal_id, a.sede_id, a.area, a.fecha_inicio, a.es_principal, a.estado
    from public.asignaciones a join public.personal p on p.id = a.personal_id
    where a.estado = 'Activa' and a.sede_id is not null and p.estado = 'Activo' and app.ve_sede(a.sede_id)
  ) x;

  -- Las personas activas que trabajan en esas sedes y la propia persona de la cuenta
  select coalesce(jsonb_agg(to_jsonb(y) order by y.id), '[]'::jsonb) into v_personal
  from (
    select p.id, p.codigo, p.nombres, p.apellido_paterno, p.apellido_materno, p.estado
    from public.personal p
    where p.estado = 'Activo' and (
      exists (select 1 from public.asignaciones a where a.personal_id = p.id and a.estado = 'Activa' and a.sede_id is not null and app.ve_sede(a.sede_id))
      or exists (select 1 from public.cuentas c where c.id = auth.uid() and c.personal_id = p.id)
    )
  ) y;

  return jsonb_build_object('personal', v_personal, 'asignaciones', v_asig);
end;
$$;
comment on function public.directorio_equipo() is 'Directorio mínimo del equipo (nombres, estado y asignaciones activas de las sedes que la cuenta alcanza) para elegir responsables sin abrir la ficha de Personal. No incluye documento, nacimiento, teléfono, correo, dirección, contratos ni sueldos.';

revoke execute on function public.directorio_equipo() from public, anon;
grant execute on function public.directorio_equipo() to authenticated;

commit;
