-- =====================================================================================================================
-- 0023 · Agenda de Psicopedagogía, segunda entrega (Lote 10B): cronogramas mensuales y actividades especiales
-- ---------------------------------------------------------------------------------------------------------------------
-- Pasa a la base lo que seguía en memoria de las actividades especiales:
--   · `cronogramas`: el cuadro de actividades de UNA sede en UN mes (sede, mes, año, título y observaciones). Una sede tiene un solo cronograma por mes. La
--     sede de un cronograma no cambia.
--   · `actividades`: cada actividad del cronograma (nombre, fecha, de 1 a 3 horas consecutivas dentro del horario de atención, cupo y **responsable por su id
--     de Personal**). Nace sin responsable: se asigna aparte. Bloquea los horarios de asesoría de su sede (la base ya lo exige al reservar o mover una asesoría).
--   · `actividad_inscripciones`: los alumnos inscritos en cada actividad y, de cada uno, su asistencia (Asistió o Faltó, con quién y cuándo la marcó).
--   · Los eventos del historial de las actividades (inscripción, inscripción quitada, responsable asignado, asistencia) van a la misma tabla `psy_eventos` de
--     la 0022 (con `tema = 'actividad'`). **Cada cambio deja su evento y no hay eventos sin cambio**: la base lo exige.
--   · **Todo se escribe con UNA función atómica**, `aplicar_cambios_actividades(acción, cambios)`: crear, editar y eliminar un cronograma (con sus actividades),
--     asignar el responsable, inscribir, retirar la inscripción y registrar la asistencia. Cada acción pide la función del registro, comprueba que la sede se
--     alcance y vuelve a comprobar las reglas (el cliente calcula, la base guarda y vigila): fecha dentro del mes y no en domingo, horas válidas, cupo, que el cupo
--     no quede por debajo de lo inscrito, que una actividad nueva o movida no quede en el pasado, responsable de Psicopedagogía sin cruces ni vacaciones, inscripción
--     de un alumno de esa sede y sin cruce con una asesoría suya, la regla de las 24 horas al retirar una inscripción, y la asistencia solo desde el día de la
--     actividad y con responsable. **Con asistencia registrada no se cambia el responsable, la fecha ni el horario, ni se quita la inscripción, la actividad o
--     el cronograma** (es parte del historial).
--   · **Las operaciones del dinero que sacan al alumno de sus actividades lo hacen EN LA MISMA operación atómica**: la clave `agenda.actividades` de
--     `aplicar_cambios_matricula` (caída y traslado de sede). Todo se guarda o no se guarda nada.
--   · **La base ahora vigila el bloqueo de horarios**: una asesoría nueva, movida o que vuelve a ocupar su horario no puede quedar donde una actividad de su sede
--     está en curso. Se reemplaza `app.verificar_asesoria` (de la 0022) con ese único cambio.
--   · Los códigos (`CRO`, `ACT`, `EVT`) los asigna la base con el mecanismo de borradores (0019 y 0022). Se ve por sede. Nadie escribe las tablas directo.
-- Los errores de negocio usan el código EN001: el sistema muestra su texto tal cual (está en español).
-- Para deshacer: supabase/deshacer/20261114160000_cronogramas_y_actividades.down.sql
-- =====================================================================================================================

begin;

-- ---------------------------------------------------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------------------------------------------------

create table public.cronogramas (
  id              text primary key check (id ~ '^CRO-[0-9]{3,}$'),
  sede_id         text not null references public.sedes (id) on delete restrict,
  anio            integer not null check (anio between 2000 and 2100),
  mes             integer not null check (mes between 1 and 12),
  titulo          text not null check (length(btrim(titulo)) between 1 and 200),
  observaciones   text not null default '',
  creado_en       timestamptz not null default now(),
  creado_por      text,
  actualizado_en  timestamptz not null default now(),
  actualizado_por text,
  unique (sede_id, anio, mes)
);
comment on table public.cronogramas is 'Cronograma mensual de actividades especiales de UNA sede (uno por sede y mes). Nadie escribe directo: solo aplicar_cambios_actividades. No se borra si alguna actividad tiene asistencia registrada.';

create table public.actividades (
  id              text primary key check (id ~ '^ACT-[0-9]{3,}$'),
  cronograma_id   text not null references public.cronogramas (id) on delete restrict,
  sede_id         text not null references public.sedes (id) on delete restrict,
  nombre          text not null check (length(btrim(nombre)) between 1 and 200),
  fecha           date not null,
  hora_inicio     text not null check (hora_inicio ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  hora_fin        text not null check (hora_fin ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  cupo            integer check (cupo is null or cupo between 1 and 50),
  responsable_id  text references public.personal (id) on delete restrict,
  orden           integer not null default 1,
  creado_en       timestamptz not null default now(),
  creado_por      text,
  actualizado_en  timestamptz not null default now(),
  actualizado_por text,
  check (hora_fin > hora_inicio)
);
create index actividades_cronograma_idx on public.actividades (cronograma_id, orden);
create index actividades_sede_fecha_idx on public.actividades (sede_id, fecha);
create index actividades_responsable_idx on public.actividades (responsable_id, fecha) where responsable_id is not null;
comment on table public.actividades is 'Actividad especial de un cronograma: de 1 a 3 horas consecutivas dentro del horario de atención; bloquea los horarios de asesoría de su sede. `cupo` vacío = sin límite. El responsable se asigna aparte (por su id de Personal).';

create table public.actividad_inscripciones (
  actividad_id     text not null references public.actividades (id) on delete restrict,
  alumno_id        text not null references public.alumnos (id) on delete restrict,
  sede_id          text not null references public.sedes (id) on delete restrict,
  inscrito_en      timestamptz not null default now(),
  inscrito_por     text,
  asistencia       text check (asistencia in ('Asistió', 'Faltó')),
  asistencia_nota  text,
  asistencia_en    timestamptz,
  asistencia_por   text,
  primary key (actividad_id, alumno_id),
  check ((asistencia is null) = (asistencia_en is null))
);
create index actividad_inscripciones_alumno_idx on public.actividad_inscripciones (alumno_id);
create index actividad_inscripciones_sede_idx on public.actividad_inscripciones (sede_id);
comment on table public.actividad_inscripciones is 'Alumno inscrito en una actividad y, si ya se marcó, su asistencia. Con asistencia registrada no se quita. El historial de cada cambio está en psy_eventos (tema = actividad).';

-- ---------------------------------------------------------------------------------------------------------------------
-- Lo que no se cambia ni se borra
-- ---------------------------------------------------------------------------------------------------------------------

create function app.cronograma_inmutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'TRUNCATE' then
    raise exception 'Los cronogramas no se vacían.' using errcode = 'EN001';
  end if;
  if tg_op = 'DELETE' then
    if exists (select 1 from public.actividad_inscripciones i join public.actividades a on a.id = i.actividad_id where a.cronograma_id = old.id and i.asistencia is not null) then
      raise exception 'No se elimina un cronograma con asistencia registrada: ya es parte del historial.' using errcode = 'EN001';
    end if;
    return old;
  end if;
  if old.id is distinct from new.id or old.sede_id is distinct from new.sede_id then
    raise exception 'La sede de un cronograma no se cambia.' using errcode = 'EN001';
  end if;
  return new;
end;
$$;
create trigger cronogramas_no_cambian before update or delete on public.cronogramas for each row execute function app.cronograma_inmutable();
create trigger cronogramas_no_vaciar  before truncate on public.cronogramas for each statement execute function app.cronograma_inmutable();

create function app.actividad_inmutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'TRUNCATE' then
    raise exception 'Las actividades no se vacían.' using errcode = 'EN001';
  end if;
  if tg_op = 'DELETE' then
    if exists (select 1 from public.actividad_inscripciones i where i.actividad_id = old.id and i.asistencia is not null) then
      raise exception 'Una actividad con asistencia registrada no se quita: ya es parte del historial.' using errcode = 'EN001';
    end if;
    return old;
  end if;
  if old.id is distinct from new.id or old.cronograma_id is distinct from new.cronograma_id or old.sede_id is distinct from new.sede_id then
    raise exception 'De una actividad no se cambia el cronograma ni la sede.' using errcode = 'EN001';
  end if;
  if (old.fecha is distinct from new.fecha or old.hora_inicio is distinct from new.hora_inicio or old.hora_fin is distinct from new.hora_fin or old.responsable_id is distinct from new.responsable_id)
     and exists (select 1 from public.actividad_inscripciones i where i.actividad_id = old.id and i.asistencia is not null) then
    raise exception 'Con asistencia registrada no se cambia el responsable, la fecha ni el horario de la actividad.' using errcode = 'EN001';
  end if;
  return new;
end;
$$;
create trigger actividades_no_cambian before update or delete on public.actividades for each row execute function app.actividad_inmutable();
create trigger actividades_no_vaciar  before truncate on public.actividades for each statement execute function app.actividad_inmutable();

create function app.inscripcion_inmutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'TRUNCATE' then
    raise exception 'Las inscripciones no se vacían.' using errcode = 'EN001';
  end if;
  if tg_op = 'DELETE' then
    if old.asistencia is not null then
      raise exception 'Ya tiene asistencia registrada: no se puede quitar la inscripción.' using errcode = 'EN001';
    end if;
    return old;
  end if;
  if (to_jsonb(old) - 'asistencia' - 'asistencia_nota' - 'asistencia_en' - 'asistencia_por') is distinct from (to_jsonb(new) - 'asistencia' - 'asistencia_nota' - 'asistencia_en' - 'asistencia_por') then
    raise exception 'De una inscripción solo cambia la asistencia.' using errcode = 'EN001';
  end if;
  return new;
end;
$$;
create trigger actividad_inscripciones_no_cambian before update or delete on public.actividad_inscripciones for each row execute function app.inscripcion_inmutable();
create trigger actividad_inscripciones_no_vaciar  before truncate on public.actividad_inscripciones for each statement execute function app.inscripcion_inmutable();

-- ---------------------------------------------------------------------------------------------------------------------
-- Reglas de las actividades en la base (espejo de las funciones puras de src/utils/schedule.ts y psyActivities.ts; check-activities-db.ts las compara)
-- ---------------------------------------------------------------------------------------------------------------------

-- ¿La actividad (de ini a fin) pisa el horario de una hora que empieza en `hora`?
create function app.actividad_cruza(p_ini text, p_fin text, p_hora text) returns boolean
language sql immutable set search_path = '' as $$
  select p_ini::time < p_hora::time + interval '1 hour' and p_hora::time < p_fin::time;
$$;

-- Cuántas horas de atención consecutivas cubre el rango exactamente (0 si no coincide con horas de atención de esa fecha)
create function app.rango_actividad_horas(p_fecha date, p_ini text, p_fin text) returns integer
language plpgsql immutable set search_path = '' as $$
declare
  v_t timestamp;
  v_f timestamp;
  v_n integer := 0;
begin
  if p_fecha is null or p_ini is null or p_fin is null or p_ini !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or p_fin !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then return 0; end if;
  v_t := p_fecha::timestamp + p_ini::time;
  v_f := p_fecha::timestamp + p_fin::time;
  if v_f <= v_t then return 0; end if;
  while v_t < v_f loop
    if not app.horario_valido(p_fecha, to_char(v_t, 'HH24:MI')) then return 0; end if;
    v_t := v_t + interval '1 hour';
    v_n := v_n + 1;
    if v_n > 3 then return 0; end if;
  end loop;
  if v_t <> v_f then return 0; end if;
  return v_n;
end;
$$;

-- Mensaje si los datos de una actividad no son válidos para el mes de su cronograma (nulo = bien). Es `validateActivity` del sistema.
create function app.actividad_problema(p_nombre text, p_fecha date, p_ini text, p_fin text, p_cupo integer, p_anio integer, p_mes integer) returns text
language plpgsql immutable set search_path = '' as $$
declare
  v_nom   text := coalesce(nullif(btrim(coalesce(p_nombre, '')), ''), 'La actividad');
  v_meses constant text[] := array['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  v_horas integer;
begin
  if btrim(coalesce(p_nombre, '')) = '' then return 'Toda actividad necesita un nombre.'; end if;
  if p_fecha is null then return v_nom || ': indique la fecha.'; end if;
  if extract(year from p_fecha)::integer <> p_anio or extract(month from p_fecha)::integer <> p_mes then
    return v_nom || ': la fecha debe estar dentro de ' || v_meses[p_mes] || ' ' || p_anio || '.';
  end if;
  if extract(isodow from p_fecha)::integer = 7 then return v_nom || ': los domingos no hay atención; elija de lunes a sábado.'; end if;
  if p_ini is null or p_fin is null or p_ini !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or p_fin !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then return v_nom || ': elija las horas de la actividad.'; end if;
  if p_fin <= p_ini then return v_nom || ': la hora de fin debe ser posterior a la de inicio.'; end if;
  v_horas := app.rango_actividad_horas(p_fecha, p_ini, p_fin);
  if v_horas < 1 or v_horas > 3 then return v_nom || ': elija entre 1 y 3 horas consecutivas dentro del horario de atención.'; end if;
  if p_cupo is not null and (p_cupo < 1 or p_cupo > 50) then return v_nom || ': el cupo debe ser un número entero entre 1 y 50, o sin límite.'; end if;
  return null;
end;
$$;

-- La actividad de esa sede que ocupa ese horario de asesoría (su nombre y su rango), o nulo si ninguna lo hace
create function app.actividad_bloqueante(p_sede text, p_fecha date, p_hora text) returns text
language sql stable security definer set search_path = '' as $$
  select '«' || a.nombre || '» (' || a.hora_inicio || ' a ' || a.hora_fin || ')'
  from public.actividades a
  where a.sede_id = p_sede and a.fecha = p_fecha and app.actividad_cruza(a.hora_inicio, a.hora_fin, p_hora)
  order by a.cronograma_id, a.orden, a.id
  limit 1;
$$;

-- Mensaje si esa persona no puede ser responsable de la actividad (nulo = puede): es personal activo con una asignación activa en Psicopedagogía, trabaja ese
-- día y no tiene otra actividad ni una asesoría a esa hora (`validateResponsible` del sistema)
create function app.responsable_actividad_invalido(p_personal text, p_actividad text, p_fecha date, p_ini text, p_fin text) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  v_p       public.personal;
  v_nom     text;
  v_choques text[] := '{}';
  v_o       record;
begin
  select * into v_p from public.personal p where p.id = p_personal;
  if not found then return 'No se encontró al trabajador.'; end if;
  v_nom := btrim(v_p.nombres || ' ' || v_p.apellido_paterno);
  if v_p.estado <> 'Activo' then return v_nom || ' está inactivo.'; end if;
  if not exists (select 1 from public.asignaciones a where a.personal_id = p_personal and a.area = 'Psicopedagogía' and a.estado = 'Activa') then
    return v_nom || ' no tiene una asignación activa en Psicopedagogía.';
  end if;
  if not app.personal_disponible(p_personal, p_fecha) then v_choques := v_choques || 'no trabaja ese día (está de vacaciones o ya cesó)'::text; end if;
  for v_o in
    select a.nombre, a.hora_inicio, a.hora_fin from public.actividades a
    where a.responsable_id = p_personal and a.fecha = p_fecha and a.id is distinct from p_actividad and a.hora_inicio < p_fin and p_ini < a.hora_fin
    order by a.hora_inicio
  loop
    v_choques := v_choques || ('ya es responsable de «' || v_o.nombre || '» (' || v_o.hora_inicio || ' a ' || v_o.hora_fin || ') ese día');
  end loop;
  for v_o in
    select s.hora, btrim(al.nombres || ' ' || al.apellido_paterno) as alumno from public.asesorias s join public.alumnos al on al.id = s.alumno_id
    where s.responsable_id = p_personal and s.fecha = p_fecha and s.estado in ('Reservado', 'Reprogramado', 'Asistió') and app.actividad_cruza(p_ini, p_fin, s.hora)
    order by s.hora
  loop
    v_choques := v_choques || ('tiene una asesoría con ' || v_o.alumno || ' a las ' || v_o.hora);
  end loop;
  if cardinality(v_choques) > 0 then return v_nom || ' ' || array_to_string(v_choques, ' y ') || '.'; end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Códigos asignados por la base: ahora también CRO-NNN (cronograma) y ACT-NNN (actividad), con el mismo mecanismo de borradores
-- ---------------------------------------------------------------------------------------------------------------------

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
      if v_tok.pref not in ('SES', 'EVT', 'TRK', 'CRO', 'ACT') then
        raise exception 'El código «%» no lo asigna el sistema en la agenda.', v_tok.pref using errcode = 'EN001';
      end if;
      -- Un candado por tipo, que dura hasta el final de la operación; el siguiente es el más alto de TODA la tabla (sin el filtro por sede)
      perform pg_advisory_xact_lock(hashtextextended('ensil:codigo:' || v_grupo || '|', 0));
      v_base := case v_tok.pref
        when 'SES' then (select coalesce(max(substring(t.id from '^SES-([0-9]+)$')::integer), 0) from public.asesorias t)
        when 'EVT' then (select coalesce(max(substring(t.id from '^EVT-([0-9]+)$')::integer), 0) from public.psy_eventos t)
        -- Un cronograma o una actividad puede eliminarse: su código no se vuelve a usar mientras el historial lo nombre (así su historial no se mezcla con el de otra)
        when 'CRO' then greatest(
          (select coalesce(max(substring(t.id from '^CRO-([0-9]+)$')::integer), 0) from public.cronogramas t),
          (select coalesce(max(substring(e.ref_id from '^CRO-([0-9]+):')::integer), 0) from public.psy_eventos e where e.tema = 'actividad'))
        when 'ACT' then greatest(
          (select coalesce(max(substring(t.id from '^ACT-([0-9]+)$')::integer), 0) from public.actividades t),
          (select coalesce(max(substring(e.ref_id from ':ACT-([0-9]+)$')::integer), 0) from public.psy_eventos e where e.tema = 'actividad'))
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

-- ---------------------------------------------------------------------------------------------------------------------
-- Comprobación de UNA asesoría ya aplicada: igual que en la 0022 y, además, una asesoría que entra a un horario no puede quedar donde una actividad de su sede
-- está en curso
-- ---------------------------------------------------------------------------------------------------------------------
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
  v_bloq      text;
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
    -- Una actividad especial en curso en esa sede ocupa el horario: no admite asesorías (las ya reservadas se reprograman desde Programación)
    v_bloq := app.actividad_bloqueante(n.sede_id, n.fecha, n.hora);
    if v_bloq is not null then raise exception 'Ese horario está ocupado por la actividad %.', v_bloq using errcode = 'EN001'; end if;
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

-- ---------------------------------------------------------------------------------------------------------------------
-- Qué función pide cada acción de las actividades
-- ---------------------------------------------------------------------------------------------------------------------

create function app.acciones_actividades() returns jsonb
language sql immutable set search_path = '' as $$
  select '{
    "crear_cronograma":    { "mensaje": "crear cronogramas mensuales", "funciones": ["psi-cronogramas:create"] },
    "editar_cronograma":   { "mensaje": "editar cronogramas mensuales", "funciones": ["psi-cronogramas:edit"] },
    "eliminar_cronograma": { "mensaje": "eliminar cronogramas mensuales", "funciones": ["psi-cronogramas:delete"] },
    "responsable":         { "mensaje": "asignar el responsable de una actividad especial", "funciones": ["psi-prog:activity_lead"] },
    "inscribir":           { "mensaje": "inscribir alumnos en una actividad especial", "funciones": ["psi-prog:activity_enroll"] },
    "quitar_inscripcion":  { "mensaje": "retirar alumnos de una actividad especial", "funciones": ["psi-prog:activity_enroll"] },
    "asistencia":          { "mensaje": "registrar la asistencia a actividades especiales", "funciones": ["psi-prog:activity_attendance"] }
  }'::jsonb
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- La operación atómica de las actividades
--   p = { cronogramas: [fila], actividades: [fila], quitar_actividades: [id], inscripciones: [fila], quitar_inscripciones: [{ actividad_id, alumno_id }], eventos: [evento] }
--   Una fila NUEVA trae `_nueva: true` y todas sus columnas; una existente trae su id y solo las columnas que cambiaron. `ref_id` de un evento es
--   `CRO-NNN:ACT-NNN`. Las inscripciones que salen con la caída o el traslado de sede viajan dentro de la operación del dinero (clave `agenda.actividades`).
-- ---------------------------------------------------------------------------------------------------------------------

create function app.aplicar_actividades(p_accion text, p jsonb, p_interno boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_conf       jsonb;
  v_funcs      text[];
  v_permitidas text[];
  v_cod        jsonb;
  v_codigos    jsonb;
  v_hoy        date := app.hoy();
  v_fila       jsonb;
  v_cro_fila   jsonb;
  v_ev         jsonb;
  v_id         text;
  v_msg        text;
  v_cro        public.cronogramas;
  v_act        public.actividades;
  v_ins        public.actividad_inscripciones;
  v_ant        jsonb;
  v_antes      jsonb := '{}'::jsonb;
  v_refs       jsonb := '{}'::jsonb;
  v_act_ids    text[];
  v_hechos     text[] := '{}';
  v_inst       text[] := '{}';
  v_usuario    text[] := '{}';
  v_nuevas     text[] := '{}';
  v_movidas    text[] := '{}';
  v_clave      text;
  v_ref        text;
  v_alumno     text;
  v_nombre     text;
  v_n          integer;
  v_fecha      date;
  v_ini        text;
  v_fin        text;
  v_cupo       integer;
  v_nom_act    text;
  v_nuevo      text;
  v_estado     text;
  v_sede_nom   text;
  v_choque     text;
  v_mot        record;
  v_horas      numeric;
  v_aviso      boolean;
begin
  if jsonb_typeof(p) is distinct from 'object' then raise exception 'No hay cambios para guardar.' using errcode = 'EN001'; end if;
  if p_interno then
    if p_accion not in ('caida', 'traslado') then raise exception 'Esta operación no cambia las actividades.' using errcode = 'EN001'; end if;
    v_permitidas := array['quitar_inscripciones', 'eventos'];
  else
    v_conf := app.acciones_actividades() -> p_accion;
    if v_conf is null then raise exception 'La operación «%» no existe.', coalesce(p_accion, '') using errcode = 'EN001'; end if;
    select array_agg(f) into v_funcs from jsonb_array_elements_text(v_conf->'funciones') f;
    perform app.exigir_alguna(v_funcs, 'Su rol no puede ' || (v_conf->>'mensaje') || ': falta la función correspondiente.');
    v_permitidas := case p_accion
      when 'crear_cronograma' then array['cronogramas', 'actividades', 'eventos']
      when 'editar_cronograma' then array['cronogramas', 'actividades', 'quitar_actividades', 'eventos']
      when 'eliminar_cronograma' then array['cronogramas', 'eventos']
      when 'responsable' then array['actividades', 'eventos']
      when 'quitar_inscripcion' then array['quitar_inscripciones', 'eventos']
      else array['inscripciones', 'eventos']
    end;
  end if;
  if exists (select 1 from jsonb_object_keys(p) k where not (k = any (v_permitidas))) then
    raise exception 'Hay datos que las actividades no reconocen.' using errcode = 'EN001';
  end if;

  -- El código de toda fila NUEVA es un borrador (CRO-~1~, ACT-~2~, EVT-~3~): lo asigna la base (una pantalla desactualizada que mande uno escrito a mano se rechaza)
  if exists (select 1 from jsonb_array_elements(coalesce(p->'cronogramas', '[]'::jsonb)) r where coalesce((r->>'_nueva')::boolean, false) and coalesce(r->>'id', '') !~ '^CRO-~[0-9]+~$')
     or exists (select 1 from jsonb_array_elements(coalesce(p->'actividades', '[]'::jsonb)) r where coalesce((r->>'_nueva')::boolean, false) and coalesce(r->>'id', '') !~ '^ACT-~[0-9]+~$')
     or exists (select 1 from jsonb_array_elements(coalesce(p->'eventos', '[]'::jsonb)) r where coalesce(r->>'id', '') !~ '^EVT-~[0-9]+~$') then
    raise exception 'Esta pantalla está desactualizada: el código de un registro nuevo lo asigna el sistema. Recargue la página e intente de nuevo.' using errcode = 'EN001';
  end if;

  -- Los borradores de código se cambian por los reales (el más alto de toda la tabla)
  v_cod := app.asignar_codigos_agenda(p);
  p := v_cod->'payload';
  v_codigos := v_cod->'codigos';

  -- Cómo estaban las actividades antes de tocarlas y a qué sede pertenece cada una (para los eventos)
  v_act_ids := array(
    select distinct x from (
      select r->>'id' as x from jsonb_array_elements(coalesce(p->'actividades', '[]'::jsonb)) r where not coalesce((r->>'_nueva')::boolean, false)
      union select jsonb_array_elements_text(coalesce(p->'quitar_actividades', '[]'::jsonb))
      union select r->>'actividad_id' from jsonb_array_elements(coalesce(p->'inscripciones', '[]'::jsonb)) r
      union select r->>'actividad_id' from jsonb_array_elements(coalesce(p->'quitar_inscripciones', '[]'::jsonb)) r
      union select a.id from public.actividades a where p_accion = 'eliminar_cronograma' and a.cronograma_id = (p->'cronogramas'->0)->>'id'
    ) t where x is not null);
  select coalesce(jsonb_object_agg(a.id, to_jsonb(a)), '{}'::jsonb) into v_antes from public.actividades a where a.id = any (v_act_ids);
  select coalesce(jsonb_object_agg(a.cronograma_id || ':' || a.id, a.sede_id), '{}'::jsonb) into v_refs from public.actividades a where a.id = any (v_act_ids);

  -- ===================================================================================================== Cronogramas (crear y editar)
  if p_accion in ('crear_cronograma', 'editar_cronograma') then
    if jsonb_array_length(coalesce(p->'cronogramas', '[]'::jsonb)) <> 1 then raise exception 'Se guarda un cronograma a la vez.' using errcode = 'EN001'; end if;
    v_cro_fila := p->'cronogramas'->0;
    if p_accion = 'crear_cronograma' then
      if not coalesce((v_cro_fila->>'_nueva')::boolean, false) then raise exception 'Un cronograma nuevo viene completo.' using errcode = 'EN001'; end if;
      if not exists (select 1 from public.sedes s where s.id = v_cro_fila->>'sede_id') then raise exception 'Seleccione la sede.' using errcode = 'EN001'; end if;
      if not (v_cro_fila ? 'titulo' and v_cro_fila ? 'anio' and v_cro_fila ? 'mes') then raise exception 'Un cronograma nuevo lleva su título, su mes y su año.' using errcode = 'EN001'; end if;
      perform app.exigir_sede(v_cro_fila->>'sede_id', 'cronogramas');
    else
      if coalesce((v_cro_fila->>'_nueva')::boolean, false) then raise exception 'Editar es cambiar un cronograma que ya existe.' using errcode = 'EN001'; end if;
      if exists (select 1 from jsonb_object_keys(v_cro_fila) k where k not in ('id', 'anio', 'mes', 'titulo', 'observaciones')) then
        raise exception 'De un cronograma solo se cambian el título, el mes, el año y las observaciones (la sede no cambia).' using errcode = 'EN001';
      end if;
    end if;
    if v_cro_fila ? 'titulo' and btrim(coalesce(v_cro_fila->>'titulo', '')) = '' then raise exception 'Indique el título del cuadro.' using errcode = 'EN001'; end if;
    if v_cro_fila ? 'anio' and (coalesce(v_cro_fila->>'anio', '') !~ '^[0-9]+$' or (v_cro_fila->>'anio')::integer < 2000 or (v_cro_fila->>'anio')::integer > 2100) then raise exception 'Indique un año válido.' using errcode = 'EN001'; end if;
    if v_cro_fila ? 'mes' and (coalesce(v_cro_fila->>'mes', '') !~ '^[0-9]+$' or (v_cro_fila->>'mes')::integer < 1 or (v_cro_fila->>'mes')::integer > 12) then raise exception 'Elija el mes.' using errcode = 'EN001'; end if;
    begin
      if p_accion = 'crear_cronograma' then
        insert into public.cronogramas (id, sede_id, anio, mes, titulo, observaciones, creado_por, actualizado_por)
        values (v_cro_fila->>'id', v_cro_fila->>'sede_id', (v_cro_fila->>'anio')::integer, (v_cro_fila->>'mes')::integer, btrim(v_cro_fila->>'titulo'), btrim(coalesce(v_cro_fila->>'observaciones', '')), app.quien(null), app.quien(null))
        returning * into v_cro;
      else
        select * into v_cro from public.cronogramas c where c.id = v_cro_fila->>'id' for update;
        if not found then raise exception 'No se encontró el cronograma %.', v_cro_fila->>'id' using errcode = 'EN001'; end if;
        perform app.exigir_sede(v_cro.sede_id, 'cronogramas');
        update public.cronogramas c set
          anio = case when v_cro_fila ? 'anio' then (v_cro_fila->>'anio')::integer else c.anio end,
          mes = case when v_cro_fila ? 'mes' then (v_cro_fila->>'mes')::integer else c.mes end,
          titulo = case when v_cro_fila ? 'titulo' then btrim(v_cro_fila->>'titulo') else c.titulo end,
          observaciones = case when v_cro_fila ? 'observaciones' then btrim(coalesce(v_cro_fila->>'observaciones', '')) else c.observaciones end,
          actualizado_en = now(), actualizado_por = app.quien(null)
        where c.id = v_cro.id
        returning * into v_cro;
      end if;
    exception when unique_violation then
      raise exception 'Ya existe un cronograma de esa sede para ese mes: edítelo en lugar de crear otro.' using errcode = 'EN001';
    end;

    -- Las actividades que se quitan primero (liberan su cupo): sin asistencia; cada inscrito que sale deja su evento de la institución
    for v_id in select jsonb_array_elements_text(coalesce(p->'quitar_actividades', '[]'::jsonb)) loop
      select * into v_act from public.actividades a where a.id = v_id and a.cronograma_id = v_cro.id for update;
      if not found then raise exception 'La actividad % no es de este cronograma.', v_id using errcode = 'EN001'; end if;
      if exists (select 1 from public.actividad_inscripciones i where i.actividad_id = v_act.id and i.asistencia is not null) then
        raise exception '«%» ya tiene asistencia registrada: no se puede quitar.', v_act.nombre using errcode = 'EN001';
      end if;
      for v_ins in select * from public.actividad_inscripciones i where i.actividad_id = v_act.id loop
        v_clave := v_cro.id || ':' || v_act.id || '|' || v_ins.alumno_id || '|Inscripción quitada';
        v_hechos := v_hechos || v_clave;
        v_inst := v_inst || v_clave;
      end loop;
      delete from public.actividad_inscripciones i where i.actividad_id = v_act.id;
      delete from public.actividades a where a.id = v_act.id;
    end loop;

    -- Las actividades nuevas (completas) y las que cambian (solo nombre, fecha, horas, cupo y orden; el responsable se asigna aparte)
    for v_fila in select * from jsonb_array_elements(coalesce(p->'actividades', '[]'::jsonb)) loop
      if coalesce((v_fila->>'_nueva')::boolean, false) then
        if v_fila->>'cronograma_id' is distinct from v_cro.id then raise exception 'Una actividad nueva es del cronograma que se guarda.' using errcode = 'EN001'; end if;
        if exists (select 1 from jsonb_object_keys(v_fila) k where k not in ('id', '_nueva', 'cronograma_id', 'nombre', 'fecha', 'hora_inicio', 'hora_fin', 'cupo', 'orden')) then
          raise exception 'Hay datos de la actividad que no se reconocen.' using errcode = 'EN001';
        end if;
        v_msg := app.actividad_problema(v_fila->>'nombre', nullif(v_fila->>'fecha', '')::date, v_fila->>'hora_inicio', v_fila->>'hora_fin', nullif(v_fila->>'cupo', '')::integer, v_cro.anio, v_cro.mes);
        if v_msg is not null then raise exception '%', v_msg using errcode = 'EN001'; end if;
        insert into public.actividades (id, cronograma_id, sede_id, nombre, fecha, hora_inicio, hora_fin, cupo, orden, creado_por, actualizado_por)
        values (v_fila->>'id', v_cro.id, v_cro.sede_id, btrim(v_fila->>'nombre'), (v_fila->>'fecha')::date, v_fila->>'hora_inicio', v_fila->>'hora_fin', nullif(v_fila->>'cupo', '')::integer,
                coalesce(nullif(v_fila->>'orden', '')::integer, 1), app.quien(null), app.quien(null));
        v_nuevas := v_nuevas || (v_fila->>'id');
      else
        if p_accion <> 'editar_cronograma' then raise exception 'Un cronograma nuevo solo lleva actividades nuevas.' using errcode = 'EN001'; end if;
        if exists (select 1 from jsonb_object_keys(v_fila) k where k not in ('id', 'nombre', 'fecha', 'hora_inicio', 'hora_fin', 'cupo', 'orden')) then
          raise exception 'De una actividad solo se cambian el nombre, la fecha, las horas, el cupo y el orden (el responsable se asigna aparte).' using errcode = 'EN001';
        end if;
        select * into v_act from public.actividades a where a.id = v_fila->>'id' and a.cronograma_id = v_cro.id for update;
        if not found then raise exception 'La actividad % no es de este cronograma.', v_fila->>'id' using errcode = 'EN001'; end if;
        v_fecha := case when v_fila ? 'fecha' then nullif(v_fila->>'fecha', '')::date else v_act.fecha end;
        v_ini := case when v_fila ? 'hora_inicio' then v_fila->>'hora_inicio' else v_act.hora_inicio end;
        v_fin := case when v_fila ? 'hora_fin' then v_fila->>'hora_fin' else v_act.hora_fin end;
        v_cupo := case when v_fila ? 'cupo' then nullif(v_fila->>'cupo', '')::integer else v_act.cupo end;
        v_nom_act := case when v_fila ? 'nombre' then v_fila->>'nombre' else v_act.nombre end;
        if (v_fecha is distinct from v_act.fecha or v_ini is distinct from v_act.hora_inicio or v_fin is distinct from v_act.hora_fin) then
          if exists (select 1 from public.actividad_inscripciones i where i.actividad_id = v_act.id and i.asistencia is not null) then
            raise exception '%: ya tiene asistencia registrada, no se cambia su fecha ni su horario.', btrim(v_act.nombre) using errcode = 'EN001';
          end if;
          v_movidas := v_movidas || v_act.id;
        end if;
        v_msg := app.actividad_problema(v_nom_act, v_fecha, v_ini, v_fin, v_cupo, v_cro.anio, v_cro.mes);
        if v_msg is not null then raise exception '%', v_msg using errcode = 'EN001'; end if;
        update public.actividades a set nombre = btrim(v_nom_act), fecha = v_fecha, hora_inicio = v_ini, hora_fin = v_fin, cupo = v_cupo,
          orden = case when v_fila ? 'orden' then coalesce(nullif(v_fila->>'orden', '')::integer, a.orden) else a.orden end, actualizado_en = now(), actualizado_por = app.quien(null)
        where a.id = v_act.id;
      end if;
    end loop;

    -- Lo que quedó: cada actividad dentro de su mes (también si cambió el mes del cronograma), el cupo sin bajar de lo inscrito, las nuevas o movidas no en el pasado
    -- y el responsable de una actividad movida sin cruces ni vacaciones
    for v_act in select * from public.actividades a where a.cronograma_id = v_cro.id order by a.orden, a.id loop
      v_msg := app.actividad_problema(v_act.nombre, v_act.fecha, v_act.hora_inicio, v_act.hora_fin, v_act.cupo, v_cro.anio, v_cro.mes);
      if v_msg is not null then raise exception '%', v_msg using errcode = 'EN001'; end if;
      select count(*)::integer into v_n from public.actividad_inscripciones i where i.actividad_id = v_act.id;
      if v_act.cupo is not null and v_act.cupo < v_n then raise exception '%: el cupo (%) es menor que los inscritos (%).', btrim(v_act.nombre), v_act.cupo, v_n using errcode = 'EN001'; end if;
      if (v_act.id = any (v_nuevas) or v_act.id = any (v_movidas)) and v_act.fecha < v_hoy then
        raise exception '%: la fecha no puede ser anterior a hoy.', btrim(v_act.nombre) using errcode = 'EN001';
      end if;
      if v_act.id = any (v_movidas) and v_act.responsable_id is not null then
        v_msg := app.responsable_actividad_invalido(v_act.responsable_id, v_act.id, v_act.fecha, v_act.hora_inicio, v_act.hora_fin);
        if v_msg is not null then raise exception '%: %', btrim(v_act.nombre), v_msg using errcode = 'EN001'; end if;
      end if;
    end loop;

  -- ===================================================================================================== Eliminar un cronograma
  elsif p_accion = 'eliminar_cronograma' then
    if jsonb_array_length(coalesce(p->'cronogramas', '[]'::jsonb)) <> 1 then raise exception 'Se elimina un cronograma a la vez.' using errcode = 'EN001'; end if;
    v_cro_fila := p->'cronogramas'->0;
    if exists (select 1 from jsonb_object_keys(v_cro_fila) k where k <> 'id') then raise exception 'Para eliminar un cronograma basta su código.' using errcode = 'EN001'; end if;
    select * into v_cro from public.cronogramas c where c.id = v_cro_fila->>'id' for update;
    if not found then raise exception 'No se encontró el cronograma %.', v_cro_fila->>'id' using errcode = 'EN001'; end if;
    perform app.exigir_sede(v_cro.sede_id, 'cronogramas');
    if exists (select 1 from public.actividad_inscripciones i join public.actividades a on a.id = i.actividad_id where a.cronograma_id = v_cro.id and i.asistencia is not null) then
      raise exception 'No se elimina un cronograma con asistencia registrada: ya es parte del historial.' using errcode = 'EN001';
    end if;
    for v_ins in select i.* from public.actividad_inscripciones i join public.actividades a on a.id = i.actividad_id where a.cronograma_id = v_cro.id loop
      v_clave := v_cro.id || ':' || v_ins.actividad_id || '|' || v_ins.alumno_id || '|Inscripción quitada';
      v_hechos := v_hechos || v_clave;
      v_inst := v_inst || v_clave;
    end loop;
    delete from public.actividad_inscripciones i using public.actividades a where a.id = i.actividad_id and a.cronograma_id = v_cro.id;
    delete from public.actividades a where a.cronograma_id = v_cro.id;
    delete from public.cronogramas c where c.id = v_cro.id;

  -- ===================================================================================================== Responsable de una actividad
  elsif p_accion = 'responsable' then
    for v_fila in select * from jsonb_array_elements(coalesce(p->'actividades', '[]'::jsonb)) loop
      if exists (select 1 from jsonb_object_keys(v_fila) k where k not in ('id', 'responsable_id')) then raise exception 'Aquí solo se asigna el responsable.' using errcode = 'EN001'; end if;
      select * into v_act from public.actividades a where a.id = v_fila->>'id' for update;
      if not found then raise exception 'No se encontró la actividad.' using errcode = 'EN001'; end if;
      perform app.exigir_sede(v_act.sede_id, 'actividades');
      if exists (select 1 from public.actividad_inscripciones i where i.actividad_id = v_act.id and i.asistencia is not null) then
        raise exception 'Ya hay asistencia registrada: no se cambia el responsable (quedaría registrada a nombre de otra persona).' using errcode = 'EN001';
      end if;
      v_nuevo := nullif(v_fila->>'responsable_id', '');
      if v_nuevo is distinct from v_act.responsable_id then
        if v_nuevo is not null then
          v_msg := app.responsable_actividad_invalido(v_nuevo, v_act.id, v_act.fecha, v_act.hora_inicio, v_act.hora_fin);
          if v_msg is not null then raise exception '%', v_msg using errcode = 'EN001'; end if;
        end if;
        update public.actividades a set responsable_id = v_nuevo, actualizado_en = now(), actualizado_por = app.quien(null) where a.id = v_act.id;
        v_hechos := v_hechos || (v_act.cronograma_id || ':' || v_act.id || '||Responsable asignado');
      end if;
    end loop;

  -- ===================================================================================================== Inscribir alumnos
  elsif p_accion = 'inscribir' then
    for v_fila in select * from jsonb_array_elements(coalesce(p->'inscripciones', '[]'::jsonb)) loop
      if exists (select 1 from jsonb_object_keys(v_fila) k where k not in ('actividad_id', 'alumno_id')) then raise exception 'Aquí solo se inscribe al alumno.' using errcode = 'EN001'; end if;
      select * into v_act from public.actividades a where a.id = v_fila->>'actividad_id' for update;
      if not found then raise exception 'No se encontró la actividad.' using errcode = 'EN001'; end if;
      perform app.exigir_sede(v_act.sede_id, 'actividades');
      select btrim(al.nombres || ' ' || al.apellido_paterno || case when btrim(al.apellido_materno) <> '' then ' ' || btrim(al.apellido_materno) else '' end) into v_nombre
        from public.alumnos al where al.id = v_fila->>'alumno_id';
      if not found then raise exception 'No se encontró el alumno.' using errcode = 'EN001'; end if;
      v_alumno := v_fila->>'alumno_id';
      if v_act.fecha < v_hoy then raise exception 'La actividad ya pasó: no admite inscripciones.' using errcode = 'EN001'; end if;
      if exists (select 1 from public.actividad_inscripciones i where i.actividad_id = v_act.id and i.alumno_id = v_alumno) then
        raise exception '% ya está inscrito en «%».', v_nombre, v_act.nombre using errcode = 'EN001';
      end if;
      select m.sede_id into v_nuevo from public.matriculas m where m.alumno_id = v_alumno order by m.fecha desc, m.id desc limit 1;
      if v_nuevo is not null and v_nuevo <> v_act.sede_id then
        select s.nombre into v_sede_nom from public.sedes s where s.id = v_act.sede_id;
        raise exception '% pertenece a otra sede; la actividad es de %.', v_nombre, v_sede_nom using errcode = 'EN001';
      end if;
      select count(*)::integer into v_n from public.actividad_inscripciones i where i.actividad_id = v_act.id;
      if v_act.cupo is not null and v_n >= v_act.cupo then raise exception '«%» está completa (% de % cupos).', v_act.nombre, v_n, v_act.cupo using errcode = 'EN001'; end if;
      select s.hora into v_choque from public.asesorias s
        where s.alumno_id = v_alumno and s.fecha = v_act.fecha and s.estado in ('Reservado', 'Reprogramado', 'Asistió') and app.actividad_cruza(v_act.hora_inicio, v_act.hora_fin, s.hora)
        order by s.hora limit 1;
      if v_choque is not null then raise exception '% tiene una asesoría ese día a las %. Reprográmela antes de inscribirlo.', v_nombre, v_choque using errcode = 'EN001'; end if;
      insert into public.actividad_inscripciones (actividad_id, alumno_id, sede_id, inscrito_por) values (v_act.id, v_alumno, v_act.sede_id, app.quien(null));
      v_hechos := v_hechos || (v_act.cronograma_id || ':' || v_act.id || '|' || v_alumno || '|Inscripción');
    end loop;

  -- ===================================================================================================== Retirar inscripciones (también la caída y el traslado)
  elsif p_accion = 'quitar_inscripcion' or p_interno then
    for v_fila in select * from jsonb_array_elements(coalesce(p->'quitar_inscripciones', '[]'::jsonb)) loop
      if exists (select 1 from jsonb_object_keys(v_fila) k where k not in ('actividad_id', 'alumno_id')) then raise exception 'Aquí solo se retira al alumno.' using errcode = 'EN001'; end if;
      select * into v_act from public.actividades a where a.id = v_fila->>'actividad_id' for update;
      if not found then raise exception 'No se encontró la actividad.' using errcode = 'EN001'; end if;
      perform app.exigir_sede(v_act.sede_id, 'actividades');
      v_alumno := v_fila->>'alumno_id';
      select * into v_ins from public.actividad_inscripciones i where i.actividad_id = v_act.id and i.alumno_id = v_alumno;
      if not found then raise exception 'El alumno no está inscrito en la actividad.' using errcode = 'EN001'; end if;
      if v_ins.asistencia is not null then raise exception 'Ya tiene asistencia registrada: no se puede quitar la inscripción.' using errcode = 'EN001'; end if;
      if not p_interno and v_act.fecha < v_hoy then raise exception 'La actividad ya pasó: no se quitan inscripciones.' using errcode = 'EN001'; end if;
      delete from public.actividad_inscripciones i where i.actividad_id = v_act.id and i.alumno_id = v_alumno;
      v_clave := v_act.cronograma_id || ':' || v_act.id || '|' || v_alumno || '|Inscripción quitada';
      v_hechos := v_hechos || v_clave;
      if p_interno then v_inst := v_inst || v_clave; else v_usuario := v_usuario || v_clave; end if;
    end loop;

  -- ===================================================================================================== Asistencia a una actividad
  elsif p_accion = 'asistencia' then
    for v_fila in select * from jsonb_array_elements(coalesce(p->'inscripciones', '[]'::jsonb)) loop
      if exists (select 1 from jsonb_object_keys(v_fila) k where k not in ('actividad_id', 'alumno_id', 'asistencia', 'nota')) then raise exception 'Aquí solo se registra la asistencia.' using errcode = 'EN001'; end if;
      select * into v_act from public.actividades a where a.id = v_fila->>'actividad_id' for update;
      if not found then raise exception 'No se encontró la actividad.' using errcode = 'EN001'; end if;
      perform app.exigir_sede(v_act.sede_id, 'actividades');
      v_alumno := v_fila->>'alumno_id';
      if v_act.responsable_id is null then raise exception 'Asigne primero al responsable de la actividad: es quien firma la asistencia.' using errcode = 'EN001'; end if;
      if v_act.fecha > v_hoy then raise exception 'La asistencia se registra desde el día de la actividad.' using errcode = 'EN001'; end if;
      select * into v_ins from public.actividad_inscripciones i where i.actividad_id = v_act.id and i.alumno_id = v_alumno for update;
      if not found then raise exception 'El alumno no está inscrito en la actividad.' using errcode = 'EN001'; end if;
      v_estado := nullif(v_fila->>'asistencia', '');
      if v_estado is null then
        if v_ins.asistencia is null then raise exception 'El alumno no tiene marca de asistencia.' using errcode = 'EN001'; end if;
        if length(btrim(coalesce(v_fila->>'nota', ''))) < 5 then raise exception 'Explique por qué se quita la marca: queda en el historial.' using errcode = 'EN001'; end if;
        update public.actividad_inscripciones i set asistencia = null, asistencia_nota = null, asistencia_en = null, asistencia_por = null where i.actividad_id = v_act.id and i.alumno_id = v_alumno;
      else
        if v_estado not in ('Asistió', 'Faltó') then raise exception 'Indique si asistió o faltó.' using errcode = 'EN001'; end if;
        update public.actividad_inscripciones i set asistencia = v_estado, asistencia_nota = nullif(btrim(coalesce(v_fila->>'nota', '')), ''), asistencia_en = now(), asistencia_por = app.quien(null)
          where i.actividad_id = v_act.id and i.alumno_id = v_alumno;
      end if;
      v_hechos := v_hechos || (v_act.cronograma_id || ':' || v_act.id || '|' || v_alumno || '|Asistencia a actividad');
    end loop;
  end if;

  -- ===================================================================================================== El historial: cada cambio deja su evento y no hay eventos sin cambio
  for v_ev in select * from jsonb_array_elements(coalesce(p->'eventos', '[]'::jsonb)) loop
    v_ref := v_ev->>'ref_id';
    v_clave := coalesce(v_ref, '') || '|' || coalesce(v_ev->>'alumno_id', '') || '|' || coalesce(v_ev->>'tipo', '');
    if v_ev->>'tema' is distinct from 'actividad' or not (v_clave = any (v_hechos)) or not (v_refs ? v_ref) then
      raise exception 'Un evento debe corresponder a un cambio de esta operación.' using errcode = 'EN001';
    end if;
    v_hechos := array_remove(v_hechos, v_clave);
    if v_clave = any (v_inst) then
      if v_ev->>'iniciador' is distinct from 'Institución' or length(btrim(coalesce(v_ev->>'motivo', ''))) < 5 then
        raise exception 'Un cambio que hace el sistema es de la institución y lleva su motivo.' using errcode = 'EN001';
      end if;
    elsif v_clave = any (v_usuario) then
      -- Retirar una inscripción: el motivo, quién lo pidió y la regla de las 24 horas (la misma que para las asesorías)
      select * into v_act from public.actividades a where a.id = split_part(v_ref, ':', 2);
      select * into v_mot from app.motivo_cambio(v_ev->>'motivo');
      if not found then raise exception 'Seleccione el motivo.' using errcode = 'EN001'; end if;
      if v_mot.iniciador is distinct from v_ev->>'iniciador' then raise exception 'Quién pidió el cambio no corresponde al motivo.' using errcode = 'EN001'; end if;
      if v_mot.necesita_detalle and length(btrim(coalesce(v_ev->>'detalle', ''))) < 5 then raise exception 'Explique brevemente el motivo: queda en el historial.' using errcode = 'EN001'; end if;
      v_horas := extract(epoch from (((v_act.fecha::text || ' ' || v_act.hora_inicio)::timestamp at time zone 'America/Lima') - now())) / 3600;
      v_aviso := v_horas >= 24;
      if v_mot.iniciador = 'Alumno o titular' and not v_aviso then
        raise exception 'Con menos de 24 horas el alumno o su titular ya no puede cambiar la asesoría: si la institución decide el cambio, elija un motivo de la institución.' using errcode = 'EN001';
      end if;
      if v_mot.iniciador = 'Institución' and not v_aviso and not app.permite('psi-prog:institutional_change') then
        raise exception 'Su rol no puede cambiar una asesoría con menos de 24 horas de anticipación.' using errcode = 'EN001';
      end if;
    end if;
    insert into public.psy_eventos (id, por, tema, ref_id, alumno_id, sede_id, tipo, iniciador, motivo, detalle, desde, hasta)
    values (v_ev->>'id', app.quien(null), 'actividad', v_ref, nullif(v_ev->>'alumno_id', ''), v_refs->>v_ref, v_ev->>'tipo', nullif(v_ev->>'iniciador', ''), nullif(btrim(coalesce(v_ev->>'motivo', '')), ''),
            nullif(btrim(coalesce(v_ev->>'detalle', '')), ''), null, null);
  end loop;
  if cardinality(v_hechos) > 0 then
    raise exception 'Todo cambio de una actividad deja su evento en el historial (%).', split_part(v_hechos[1], '|', 3) using errcode = 'EN001';
  end if;

  return jsonb_build_object('ok', true, 'codigos', v_codigos);
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Función pública
-- ---------------------------------------------------------------------------------------------------------------------

create function public.aplicar_cambios_actividades(p_accion text, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  return app.aplicar_actividades(p_accion, p, false);
end;
$$;
comment on function public.aplicar_cambios_actividades(text, jsonb) is 'Aplica los cambios de una acción de las actividades especiales (cronogramas, responsable, inscripciones, asistencia), todo o nada, con la función del registro, las reglas de la base y los códigos asignados por ella. Devuelve { ok, codigos }.';

-- ---------------------------------------------------------------------------------------------------------------------
-- La función pública del dinero acepta ahora, dentro de `agenda`, la clave `actividades` (caída y traslado): las inscripciones del alumno en actividades salen
-- EN la misma operación, después del dinero y de las asesorías
-- ---------------------------------------------------------------------------------------------------------------------

create or replace function public.aplicar_cambios_matricula(p_accion text, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_agenda jsonb;
  v_act    jsonb;
  v_res    jsonb;
  v_cod    jsonb;
  v_ag     jsonb;
  v_at     jsonb;
  v_tocada boolean := false;
begin
  if p_accion = 'mora' and jsonb_typeof(p) = 'object' then perform app.verificar_mora(p); end if;
  if jsonb_typeof(p) = 'object' and p ? 'agenda' then
    if p_accion not in ('matricular', 'caida', 'traslado') then raise exception 'Esta operación no cambia la agenda.' using errcode = 'EN001'; end if;
    v_agenda := p->'agenda';
    p := p - 'agenda';
    if jsonb_typeof(v_agenda) = 'object' and v_agenda ? 'actividades' then
      if p_accion not in ('caida', 'traslado') then raise exception 'Esta operación no cambia las actividades.' using errcode = 'EN001'; end if;
      v_act := v_agenda->'actividades';
      v_agenda := v_agenda - 'actividades';
    end if;
  end if;
  v_res := app.aplicar_cambios_matricula_con_codigos(p_accion, p);
  v_cod := coalesce(v_res->'codigos', '{}'::jsonb);
  if v_agenda is not null and v_agenda <> '{}'::jsonb then
    -- Los borradores de la matrícula (MAT-2026-~1~…) ya tienen su código real: la agenda los nombra con él
    v_agenda := app.reemplazar_borradores(v_agenda, v_res->'codigos');
    v_ag := app.aplicar_agenda(p_accion, v_agenda, true);
    v_cod := v_cod || coalesce(v_ag->'codigos', '{}'::jsonb);
    v_tocada := true;
  end if;
  if v_act is not null then
    v_at := app.aplicar_actividades(p_accion, v_act, true);
    v_cod := v_cod || coalesce(v_at->'codigos', '{}'::jsonb);
    v_tocada := true;
  end if;
  if v_tocada then v_res := v_res || jsonb_build_object('codigos', v_cod); end if;
  return v_res;
end;
$$;
comment on function public.aplicar_cambios_matricula(text, jsonb) is 'Aplica los cambios de una acción del dinero, todo o nada, y asigna los códigos de los registros nuevos. En «mora» vigila antes que lo cobrado no pase de lo que dice la política. En matricular, caida y traslado acepta `agenda` (primera asesoría y cancelaciones) y, en caida y traslado, `agenda.actividades` (inscripciones que salen): todo se guarda en la misma operación. Devuelve { ok, codigos }.';

-- ---------------------------------------------------------------------------------------------------------------------
-- Quién ve qué (check-activities-db.ts compara esta lista con el registro)
-- ---------------------------------------------------------------------------------------------------------------------

create function app.puede_leer_actividades() returns boolean
language sql stable security definer set search_path = '' as $$
  select app.tiene_alguna(array['op-matriculas:view', 'per-asignaciones:view', 'per-contratos:view', 'per-personal:view', 'psi-cronogramas:view', 'psi-historial:view', 'psi-prog:export_schedule',
    'psi-prog:view', 'psi-recordatorios:view', 'rep-psicopedagogia:view']);
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Permisos de tabla y RLS: solo se lee; todo lo que cambia pasa por las funciones de arriba
-- ---------------------------------------------------------------------------------------------------------------------

revoke all on public.cronogramas, public.actividades, public.actividad_inscripciones from public, anon, authenticated;
grant select on public.cronogramas, public.actividades, public.actividad_inscripciones to authenticated;

alter table public.cronogramas             enable row level security;
alter table public.actividades             enable row level security;
alter table public.actividad_inscripciones enable row level security;

create policy cronogramas_leer on public.cronogramas for select to authenticated
  using ((select app.puede_leer_actividades()) and (select app.ve_sede(sede_id)));
create policy actividades_leer on public.actividades for select to authenticated
  using ((select app.puede_leer_actividades()) and (select app.ve_sede(sede_id)));
create policy actividad_inscripciones_leer on public.actividad_inscripciones for select to authenticated
  using ((select app.puede_leer_actividades()) and (select app.ve_sede(sede_id)));

-- El historial: los eventos de asesorías los lee quien lee asesorías; los de actividades, quien lee actividades
drop policy psy_eventos_leer on public.psy_eventos;
create policy psy_eventos_leer on public.psy_eventos for select to authenticated
  using (((tema = 'asesoria' and (select app.puede_leer_asesorias())) or (tema = 'actividad' and (select app.puede_leer_actividades()))) and (select app.ve_sede(sede_id)));

-- Las funciones públicas son de las cuentas con sesión
revoke execute on function public.aplicar_cambios_actividades(text, jsonb) from public, anon;
grant execute on function public.aplicar_cambios_actividades(text, jsonb) to authenticated;
revoke execute on function public.aplicar_cambios_matricula(text, jsonb) from public, anon;
grant execute on function public.aplicar_cambios_matricula(text, jsonb) to authenticated;

-- Lo interno no se llama de fuera (las funciones públicas corren con los permisos del dueño). No se toca ningún otro permiso del esquema `app`.
revoke execute on function
  app.aplicar_actividades(text, jsonb, boolean), app.acciones_actividades(), app.actividad_cruza(text, text, text), app.rango_actividad_horas(date, text, text),
  app.actividad_problema(text, date, text, text, integer, integer, integer), app.actividad_bloqueante(text, date, text), app.responsable_actividad_invalido(text, text, date, text, text),
  app.cronograma_inmutable(), app.actividad_inmutable(), app.inscripcion_inmutable()
  from public, anon, authenticated;
-- La función de lectura la llaman las políticas de seguridad con la cuenta que lee, así que sí debe poder ejecutarla
revoke execute on function app.puede_leer_actividades() from public, anon;
grant execute on function app.puede_leer_actividades() to authenticated;

commit;
