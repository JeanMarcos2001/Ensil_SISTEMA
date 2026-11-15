-- Deshace 0023 (agenda de Psicopedagogía, segunda entrega: cronogramas mensuales y actividades especiales en la base): se quitan las tres tablas (con lo que
-- tengan guardado: cronogramas, actividades, inscripciones y asistencias) y las funciones nuevas; `aplicar_cambios_matricula`, `asignar_codigos_agenda` y
-- `verificar_asesoria` vuelven a ser las de la 0022 (sin la clave `agenda.actividades` y sin el bloqueo de horarios por una actividad).
-- Los eventos del historial de las actividades (`psy_eventos`, tema = 'actividad') NO se borran: el historial no se modifica ni se vacía.
-- Después de deshacerla, la aplicación debe ser la versión anterior (la que guarda las actividades en memoria).
begin;

create or replace function public.aplicar_cambios_matricula(p_accion text, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_agenda jsonb;
  v_res    jsonb;
  v_ag     jsonb;
begin
  if p_accion = 'mora' and jsonb_typeof(p) = 'object' then perform app.verificar_mora(p); end if;
  if jsonb_typeof(p) = 'object' and p ? 'agenda' then
    if p_accion not in ('matricular', 'caida', 'traslado') then raise exception 'Esta operación no cambia la agenda.' using errcode = 'EN001'; end if;
    v_agenda := p->'agenda';
    p := p - 'agenda';
  end if;
  v_res := app.aplicar_cambios_matricula_con_codigos(p_accion, p);
  if v_agenda is not null then
    -- Los borradores de la matrícula (MAT-2026-~1~…) ya tienen su código real: la agenda los nombra con él
    v_agenda := app.reemplazar_borradores(v_agenda, v_res->'codigos');
    v_ag := app.aplicar_agenda(p_accion, v_agenda, true);
    v_res := v_res || jsonb_build_object('codigos', coalesce(v_res->'codigos', '{}'::jsonb) || coalesce(v_ag->'codigos', '{}'::jsonb));
  end if;
  return v_res;
end;
$$;
comment on function public.aplicar_cambios_matricula(text, jsonb) is 'Aplica los cambios de una acción del dinero, todo o nada, y asigna los códigos de los registros nuevos. En «mora» vigila antes que lo cobrado no pase de lo que dice la política. En matricular, caida y traslado acepta `agenda` (primera asesoría y cancelaciones) y la guarda en la misma operación. Devuelve { ok, codigos }.';

create or replace function app.asignar_codigos_agenda(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_texto   text := p::text;
  v_tok     record;
  v_grupo   text := '';
  v_base    integer := 0;
  v_dado    integer := 0;
  v_pad     integer;
  v_num     text;
  v_token   text;
  v_real    text;
  v_codigos jsonb := '{}'::jsonb;
begin
  for v_tok in
    select distinct m[1] as pref, m[2] as numero, m[2]::bigint as n
    from regexp_matches(v_texto, '([A-Z][A-Z0-9]{2})-~([0-9]+)~', 'g') as m
    order by 1, 3
  loop
    if v_tok.pref is distinct from v_grupo then
      v_grupo := v_tok.pref;
      if v_tok.pref not in ('SES', 'EVT', 'TRK') then
        raise exception 'El código «%» no lo asigna el sistema en la agenda.', v_tok.pref using errcode = 'EN001';
      end if;
      -- Un candado por tipo, que dura hasta el final de la operación; el siguiente es el más alto de TODA la tabla (sin el filtro por sede)
      perform pg_advisory_xact_lock(hashtextextended('ensil:codigo:' || v_grupo || '|', 0));
      v_base := case v_tok.pref
        when 'SES' then (select coalesce(max(substring(t.id from '^SES-([0-9]+)$')::integer), 0) from public.asesorias t)
        when 'EVT' then (select coalesce(max(substring(t.id from '^EVT-([0-9]+)$')::integer), 0) from public.psy_eventos t)
        else (select coalesce(max(substring(t.id from '^TRK-([0-9]+)$')::integer), 0) from public.seguimientos t)
      end;
      v_dado := 0;
    end if;
    v_dado := v_dado + 1;
    v_pad := case when v_tok.pref = 'EVT' then 4 else 3 end;
    v_num := (v_base + v_dado)::text;
    v_token := v_tok.pref || '-~' || v_tok.numero || '~';
    v_real := v_tok.pref || '-' || case when length(v_num) >= v_pad then v_num else lpad(v_num, v_pad, '0') end;
    v_codigos := v_codigos || jsonb_build_object(v_token, v_real);
    v_texto := replace(v_texto, v_token, v_real);
  end loop;
  return jsonb_build_object('payload', v_texto::jsonb, 'codigos', v_codigos);
end;
$$;

create or replace function app.verificar_asesoria(p_o jsonb, p_id text, p_accion text, p_interno boolean, p_eventos jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  n           public.asesorias;
  v_hoy       date := app.hoy();
  v_nueva     boolean := p_o is null;
  v_ocupan    constant text[] := array['Reservado', 'Reprogramado', 'Asistió', 'Faltó'];
  v_activas   constant text[] := array['Reservado', 'Reprogramado', 'Asistió'];
  v_esperan   constant text[] := array['Reservado', 'Reprogramado'];
  v_antes_est text := p_o->>'estado';
  v_movido    boolean := false;
  v_entra     boolean;
  v_msg       text;
  v_cupo      integer;
  v_usados    integer;
  v_categoria text;
  v_ev        jsonb;
  v_mot       record;
  v_horas     numeric;
  v_aviso     boolean;
  v_sin_mat   boolean := false;
  v_tipos     text[];
  v_esperados text[] := '{}';
begin
  select * into n from public.asesorias a where a.id = p_id;
  if not found then raise exception 'No se encontró la asesoría %.', p_id using errcode = 'EN001'; end if;
  perform app.exigir_sede(n.sede_id, 'asesorías');
  if p_accion <> 'caida' and (v_nueva or n.fecha is distinct from (p_o->>'fecha')::date or n.hora is distinct from p_o->>'hora') then
    if n.fecha < v_hoy and p_accion <> 'asistencia' and p_accion <> 'registrar_sesion' then raise exception 'La fecha no puede ser anterior a hoy.' using errcode = 'EN001'; end if;
  end if;

  -- Qué es este cambio
  if v_nueva then
    v_categoria := 'nueva';
  else
    v_movido := n.fecha is distinct from (p_o->>'fecha')::date or n.hora is distinct from p_o->>'hora' or n.responsable_id is distinct from nullif(p_o->>'responsable_id', '');
    if n.estado = 'Cancelado' and v_antes_est <> 'Cancelado' then v_categoria := 'cancelar';
    elsif n.estado in ('Asistió', 'Faltó') and v_antes_est is distinct from n.estado then v_categoria := 'asistencia';
    elsif v_movido then v_categoria := 'reprogramar';
    elsif n.estado is distinct from v_antes_est then v_categoria := 'estado';
    else v_categoria := 'observaciones';
    end if;
  end if;

  -- Estados y movimientos permitidos
  if v_nueva then
    if p_accion not in ('reservar', 'matricular', 'traslado') then raise exception 'Esta operación no crea asesorías.' using errcode = 'EN001'; end if;
    if n.estado <> 'Reservado' then raise exception 'Una asesoría nueva nace «Reservado».' using errcode = 'EN001'; end if;
    if p_accion = 'reservar' and n.es_primera then raise exception 'La primera asesoría la crea la matrícula.' using errcode = 'EN001'; end if;
    if p_accion in ('matricular', 'traslado') and not n.es_primera then raise exception 'La matrícula solo crea primeras asesorías.' using errcode = 'EN001'; end if;
    if n.es_primera then
      if not exists (select 1 from public.matriculas m where m.id = n.matricula_id and m.alumno_id = n.alumno_id and m.sede_id = n.sede_id and m.estado = 'Activa') then
        raise exception 'La primera asesoría debe ser de una matrícula activa del alumno en esa sede.' using errcode = 'EN001';
      end if;
    elsif not exists (select 1 from public.matriculas m where m.alumno_id = n.alumno_id and m.sede_id = n.sede_id and m.estado = 'Activa') then
      raise exception 'El alumno no tiene una matrícula activa en esa sede.' using errcode = 'EN001';
    end if;
  else
    if v_antes_est = 'Asistió' and v_categoria <> 'observaciones' then raise exception 'Una asesoría con asistencia ya no se cambia (solo sus observaciones).' using errcode = 'EN001'; end if;
    if v_categoria = 'cancelar' then
      if not (v_antes_est = any (v_esperan)) then raise exception 'Solo se cancela una asesoría reservada o reprogramada.' using errcode = 'EN001'; end if;
      if v_movido then raise exception 'Una cancelación no cambia la fecha, la hora ni el responsable.' using errcode = 'EN001'; end if;
      if p_accion not in ('cancelar', 'caida', 'traslado') then raise exception 'Esta operación no cancela asesorías.' using errcode = 'EN001'; end if;
    elsif v_categoria = 'asistencia' then
      if not (v_antes_est = any (v_esperan)) then raise exception 'La asistencia solo se marca en una asesoría reservada o reprogramada.' using errcode = 'EN001'; end if;
      if v_movido then raise exception 'La asistencia no cambia la fecha, la hora ni el responsable.' using errcode = 'EN001'; end if;
      if n.fecha > v_hoy then raise exception 'La asistencia se marca desde el día de la asesoría.' using errcode = 'EN001'; end if;
      if (n.estado = 'Asistió' and p_accion not in ('asistencia', 'registrar_sesion')) or (n.estado = 'Faltó' and p_accion <> 'asistencia') then
        raise exception 'Esta operación no marca esa asistencia.' using errcode = 'EN001';
      end if;
      if n.es_primera and app.matricula_sin_verificar(n.matricula_id) then
        raise exception 'No se puede registrar la primera asesoría: la matrícula aún no está verificada (el alumno no tiene sus materiales). Verifique la matrícula o reprograme la asesoría.' using errcode = 'EN001';
      end if;
    elsif v_categoria = 'reprogramar' then
      if p_accion <> 'reprogramar' then raise exception 'Esta operación no reprograma asesorías.' using errcode = 'EN001'; end if;
      if n.estado <> 'Reprogramado' then raise exception 'Una asesoría reprogramada queda «Reprogramado».' using errcode = 'EN001'; end if;
    elsif v_categoria = 'estado' then
      raise exception 'Ese cambio de estado no está permitido.' using errcode = 'EN001';
    else
      if p_accion = 'cancelar' then raise exception 'Solo se cancela una asesoría reservada o reprogramada.' using errcode = 'EN001'; end if;
      if p_accion not in ('observaciones', 'registrar_sesion', 'editar_sesion') then raise exception 'Esta operación no cambia nada de la asesoría.' using errcode = 'EN001'; end if;
    end if;
  end if;

  -- Horario, cupo, cruce del alumno y responsable: lo que entra a un horario (una asesoría nueva, movida o que vuelve a ocupar el suyo)
  v_entra := n.estado = any (v_ocupan) and (v_nueva or v_movido or v_antes_est = 'Cancelado');
  if v_entra then
    if not app.horario_valido(n.fecha, n.hora) then raise exception 'El horario elegido no está disponible para esa fecha.' using errcode = 'EN001'; end if;
    if n.es_primera then
      if exists (select 1 from public.asesorias x where x.sede_id = n.sede_id and x.fecha = n.fecha and x.hora = n.hora and x.id <> n.id and x.estado = any (v_ocupan)
                   and not (x.es_primera and x.registro_id is not distinct from n.registro_id)) then
        raise exception 'Ese horario ya está ocupado: la primera asesoría necesita un horario libre (o el de su mismo registro de matrícula).' using errcode = 'EN001';
      end if;
    else
      if exists (select 1 from public.asesorias x where x.sede_id = n.sede_id and x.fecha = n.fecha and x.hora = n.hora and x.id <> n.id and x.estado = any (v_ocupan) and x.es_primera) then
        raise exception 'Ese horario está reservado para primeras asesorías; no admite asesorías normales.' using errcode = 'EN001';
      end if;
      v_cupo := app.cupo_de(n.sede_id, n.fecha, n.hora);
      select count(*)::integer into v_usados from public.asesorias x where x.sede_id = n.sede_id and x.fecha = n.fecha and x.hora = n.hora and x.estado = any (v_ocupan);
      if v_cupo is not null and v_usados > v_cupo then
        raise exception 'El horario está completo: % de % cupos. Elija otro horario o amplíe el cupo.', v_usados - 1, v_cupo using errcode = 'EN001';
      end if;
    end if;
    if n.estado = any (v_activas) and exists (select 1 from public.asesorias x where x.alumno_id = n.alumno_id and x.fecha = n.fecha and x.hora = n.hora and x.id <> n.id and x.estado = any (v_activas)) then
      raise exception 'El alumno ya tiene una asesoría ese día en ese horario.' using errcode = 'EN001';
    end if;
  end if;
  if v_nueva or v_movido then
    if n.responsable_id is null then
      if not (p_interno and p_accion in ('matricular', 'traslado')) then raise exception 'Seleccione al responsable.' using errcode = 'EN001'; end if;
    else
      v_msg := app.responsable_invalido(n.responsable_id, n.sede_id, n.fecha);
      if v_msg is not null then raise exception '%', v_msg using errcode = 'EN001'; end if;
    end if;
  end if;

  -- Cancelar o reprogramar una asesoría que esperaba al alumno: motivo, quién lo pidió y la regla de las 24 horas
  if not v_nueva and v_categoria in ('cancelar', 'reprogramar') and v_antes_est = any (v_esperan) then
    v_horas := extract(epoch from (((p_o->>'fecha') || ' ' || (p_o->>'hora'))::timestamp at time zone 'America/Lima' - now())) / 3600;
    v_aviso := v_horas >= 24;
    v_sin_mat := n.es_primera and app.matricula_sin_verificar(n.matricula_id);
    for v_ev in select e from jsonb_array_elements(coalesce(p_eventos, '[]'::jsonb)) e where e->>'ref_id' = p_id and e->>'tipo' in ('Cancelada', 'Reprogramada') loop
      if p_interno then
        if v_ev->>'iniciador' is distinct from 'Institución' or length(btrim(coalesce(v_ev->>'motivo', ''))) < 5 then
          raise exception 'Un cambio que hace el sistema es de la institución y lleva su motivo.' using errcode = 'EN001';
        end if;
      else
        select * into v_mot from app.motivo_cambio(v_ev->>'motivo');
        if not found or (v_ev->>'tipo' = 'Reprogramada' and v_mot.solo_cancelar) then raise exception 'Seleccione el motivo.' using errcode = 'EN001'; end if;
        if v_mot.iniciador is distinct from v_ev->>'iniciador' then raise exception 'Quién pidió el cambio no corresponde al motivo.' using errcode = 'EN001'; end if;
        if v_mot.necesita_detalle and length(btrim(coalesce(v_ev->>'detalle', ''))) < 5 then raise exception 'Explique brevemente el motivo: queda en el historial.' using errcode = 'EN001'; end if;
        if v_mot.iniciador = 'Alumno o titular' and not v_aviso then
          raise exception 'Con menos de 24 horas el alumno o su titular ya no puede cambiar la asesoría: si la institución decide el cambio, elija un motivo de la institución.' using errcode = 'EN001';
        end if;
        if v_mot.iniciador = 'Institución' and not v_aviso and not v_sin_mat and not app.permite('psi-prog:institutional_change') then
          raise exception 'Su rol no puede cambiar una asesoría con menos de 24 horas de anticipación.' using errcode = 'EN001';
        end if;
        if v_sin_mat and v_mot.iniciador = 'Alumno o titular' then
          raise exception 'La matrícula aún no está verificada: el cambio es de la institución (sin materiales).' using errcode = 'EN001';
        end if;
      end if;
    end loop;
  end if;

  -- Cada cambio deja su evento (lo que cambió determina los eventos que deben venir)
  if v_nueva then v_esperados := array['Reservada'];
  elsif v_categoria = 'cancelar' then v_esperados := array['Cancelada'];
  elsif v_categoria = 'reprogramar' then v_esperados := array['Reprogramada'];
  elsif v_categoria = 'asistencia' then v_esperados := array[n.estado];
  end if;
  v_tipos := array(select e->>'tipo' from jsonb_array_elements(coalesce(p_eventos, '[]'::jsonb)) e where e->>'ref_id' = p_id);
  if exists (select 1 from unnest(v_esperados) t where not (t = any (v_tipos))) then
    raise exception 'Todo cambio de una asesoría deja su evento en el historial (%).', array_to_string(v_esperados, ', ') using errcode = 'EN001';
  end if;
end;
$$;

drop function if exists public.aplicar_cambios_actividades(text, jsonb);

drop policy if exists cronogramas_leer on public.cronogramas;
drop policy if exists actividades_leer on public.actividades;
drop policy if exists actividad_inscripciones_leer on public.actividad_inscripciones;
drop policy if exists psy_eventos_leer on public.psy_eventos;
create policy psy_eventos_leer on public.psy_eventos for select to authenticated
  using ((select app.puede_leer_asesorias()) and (select app.ve_sede(sede_id)));

drop trigger if exists cronogramas_no_cambian on public.cronogramas;
drop trigger if exists cronogramas_no_vaciar on public.cronogramas;
drop trigger if exists actividades_no_cambian on public.actividades;
drop trigger if exists actividades_no_vaciar on public.actividades;
drop trigger if exists actividad_inscripciones_no_cambian on public.actividad_inscripciones;
drop trigger if exists actividad_inscripciones_no_vaciar on public.actividad_inscripciones;

drop table if exists public.actividad_inscripciones;
drop table if exists public.actividades;
drop table if exists public.cronogramas;

drop function if exists app.aplicar_actividades(text, jsonb, boolean);
drop function if exists app.acciones_actividades();
drop function if exists app.responsable_actividad_invalido(text, text, date, text, text);
drop function if exists app.actividad_bloqueante(text, date, text);
drop function if exists app.actividad_problema(text, date, text, text, integer, integer, integer);
drop function if exists app.rango_actividad_horas(date, text, text);
drop function if exists app.actividad_cruza(text, text, text);
drop function if exists app.puede_leer_actividades();
drop function if exists app.cronograma_inmutable();
drop function if exists app.actividad_inmutable();
drop function if exists app.inscripcion_inmutable();

commit;
