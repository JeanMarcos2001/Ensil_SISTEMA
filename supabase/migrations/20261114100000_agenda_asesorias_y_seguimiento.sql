-- =====================================================================================================================
-- 0022 · Agenda de Psicopedagogía, primera entrega (Lote 10A): asesorías, historial, seguimiento y capacidad
-- ---------------------------------------------------------------------------------------------------------------------
-- Pasa a la base lo que seguía en memoria de las asesorías:
--   · `asesorias`: cada reserva (alumno, sede, fecha, hora, **responsable por su id de Personal**, estado). Duran siempre una hora. **Nunca se borran**:
--     una asesoría se cancela. El nombre del alumno, el programa y el nivel salen de sus ids (no se guardan).
--   · `psy_eventos`: el historial de Psicopedagogía. **Solo se agrega**: cada cambio de una asesoría deja su evento (quién, cuándo, de qué a qué, por qué y
--     quién lo pidió) y la base lo EXIGE (ningún cambio puede olvidarlo). Hoy guarda los de las asesorías; los de las actividades llegan con la 0023.
--   · `seguimientos`: la sesión a la que el alumno asistió (métricas, observaciones y, en la primera asesoría, la lista de cierre). Uno por asesoría.
--   · `capacidad_asesorias`: el cupo por horario (general, por sede y excepciones por fecha y hora). Sin filas vale el cupo de partida (6).
--   · **Todo se escribe con UNA función atómica**, `aplicar_cambios_agenda(acción, cambios)`: pide la función del registro de la acción, comprueba que la sede
--     se alcance y vuelve a comprobar las reglas de la agenda (el cliente calcula, la base guarda y vigila): horario válido, no en el pasado, el alumno no se
--     cruza consigo mismo, el cupo del horario (y que un horario de primera asesoría es solo de primeras asesorías), responsable de Psicopedagogía de esa
--     sede y que trabaje ese día, estados permitidos, **sin materiales entregados no se marca asistencia**, la regla de las 24 horas con su motivo y quién
--     lo pidió, y que cada cambio traiga su evento. Los códigos (`SES`, `EVT`, `TRK`) los asigna la base con el mecanismo de borradores (0019).
--   · **Las operaciones del dinero que tocan la agenda la tocan EN LA MISMA operación atómica**: `aplicar_cambios_matricula` acepta una clave `agenda` en
--     las acciones `matricular` (nace la primera asesoría), `caida` y `traslado` (se cancelan las asesorías y, en el traslado, nace la primera de la sede
--     nueva). Todo se guarda o no se guarda nada.
--   · Se ve por sede. Nadie escribe las tablas directo.
-- Los errores de negocio usan el código EN001: el sistema muestra su texto tal cual (está en español).
-- Para deshacer: supabase/deshacer/20261114100000_agenda_asesorias_y_seguimiento.down.sql
-- =====================================================================================================================

begin;

-- ---------------------------------------------------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------------------------------------------------

create table public.asesorias (
  id             text primary key check (id ~ '^SES-[0-9]{3,}$'),
  alumno_id      text not null references public.alumnos (id) on delete restrict,
  sede_id        text not null references public.sedes (id) on delete restrict,
  fecha          date not null,
  hora           text not null check (hora ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  responsable_id text references public.personal (id) on delete restrict,
  estado         text not null check (estado in ('Reservado', 'Reprogramado', 'Asistió', 'Faltó', 'Cancelado')),
  observaciones  text,
  es_primera     boolean not null default false,
  registro_id    text,
  matricula_id   text references public.matriculas (id) on delete restrict,
  creado_en      timestamptz not null default now(),
  creado_por     text,
  actualizado_en timestamptz not null default now(),
  actualizado_por text,
  check (not es_primera or matricula_id is not null)
);
create index asesorias_sede_fecha_idx on public.asesorias (sede_id, fecha, hora);
create index asesorias_alumno_idx on public.asesorias (alumno_id, fecha);
create index asesorias_matricula_idx on public.asesorias (matricula_id) where es_primera;
create index asesorias_responsable_idx on public.asesorias (responsable_id, fecha);
comment on table public.asesorias is 'Asesorías de Psicopedagogía (una hora). Nadie escribe directo: solo aplicar_cambios_agenda y las operaciones del dinero. Nunca se borran: se cancelan.';
comment on column public.asesorias.registro_id is 'Primera asesoría: el registro de matrícula (lote) al que pertenece; los alumnos de un mismo registro comparten horario.';

create table public.psy_eventos (
  id         text primary key check (id ~ '^EVT-[0-9]{4,}$'),
  en         timestamptz not null default now(),
  por        text not null,
  tema       text not null check (tema in ('asesoria', 'actividad')),
  ref_id     text not null,
  alumno_id  text references public.alumnos (id) on delete restrict,
  sede_id    text not null references public.sedes (id) on delete restrict,
  tipo       text not null check (tipo in ('Reservada', 'Reprogramada', 'Cancelada', 'Asistió', 'Faltó', 'Sesión registrada', 'Inscripción', 'Inscripción quitada', 'Responsable asignado', 'Asistencia a actividad')),
  iniciador  text check (iniciador in ('Alumno o titular', 'Institución')),
  motivo     text,
  detalle    text,
  desde      jsonb,
  hasta      jsonb
);
create index psy_eventos_ref_idx on public.psy_eventos (tema, ref_id, en);
create index psy_eventos_alumno_idx on public.psy_eventos (alumno_id, en);
create index psy_eventos_sede_idx on public.psy_eventos (sede_id, en desc);
comment on table public.psy_eventos is 'Historial de Psicopedagogía: solo se agrega. `desde`/`hasta` = { date, time, responsible } (el nombre del responsable ese día). La sede es la de la asesoría.';

create table public.seguimientos (
  id             text primary key check (id ~ '^TRK-[0-9]{3,}$'),
  alumno_id      text not null references public.alumnos (id) on delete restrict,
  asesoria_id    text references public.asesorias (id) on delete restrict,
  sede_id        text not null references public.sedes (id) on delete restrict,
  fecha          date not null,
  estado         text not null,
  metricas       jsonb not null default '{}'::jsonb,
  observaciones  text not null default '',
  checklist      jsonb,
  creado_en      timestamptz not null default now(),
  creado_por     text,
  actualizado_en timestamptz not null default now(),
  actualizado_por text
);
-- Una sesión de seguimiento por asesoría
create unique index seguimientos_asesoria_uq on public.seguimientos (asesoria_id) where asesoria_id is not null;
create index seguimientos_alumno_idx on public.seguimientos (alumno_id, fecha);
create index seguimientos_sede_idx on public.seguimientos (sede_id, fecha);
comment on table public.seguimientos is 'Sesión de una asesoría a la que el alumno asistió (métricas, observaciones y lista de la primera asesoría). Uno por asesoría; se edita (queda quién y cuándo).';

create table public.capacidad_asesorias (
  id              text primary key,
  ambito          text not null check (ambito in ('general', 'sede', 'excepcion')),
  sede_id         text references public.sedes (id) on delete cascade,
  fecha           date,
  hora            text,
  cupo            integer check (cupo is null or cupo between 1 and 50),
  actualizado_en  timestamptz not null default now(),
  actualizado_por text,
  check ((ambito = 'general' and sede_id is null and fecha is null and hora is null)
      or (ambito = 'sede' and sede_id is not null and fecha is null and hora is null)
      or (ambito = 'excepcion' and sede_id is not null and fecha is not null and hora is not null))
);
comment on table public.capacidad_asesorias is 'Cupo de alumnos por horario: excepción de esa fecha y hora > cupo de la sede > cupo general > 6. `cupo` vacío = sin límite. El id es general, sede:FIL-NNN o exc:FIL-NNN:AAAA-MM-DD:HH:MM.';

-- ---------------------------------------------------------------------------------------------------------------------
-- Lo que no se cambia ni se borra
-- ---------------------------------------------------------------------------------------------------------------------

create function app.asesoria_inmutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'TRUNCATE' or tg_op = 'DELETE' then
    raise exception 'Una asesoría no se borra: se cancela.' using errcode = 'EN001';
  end if;
  if (to_jsonb(old) - 'fecha' - 'hora' - 'responsable_id' - 'estado' - 'observaciones' - 'actualizado_en' - 'actualizado_por')
     is distinct from (to_jsonb(new) - 'fecha' - 'hora' - 'responsable_id' - 'estado' - 'observaciones' - 'actualizado_en' - 'actualizado_por') then
    raise exception 'De una asesoría no se cambia el alumno, la sede ni lo que la vincula a su matrícula.' using errcode = 'EN001';
  end if;
  return new;
end;
$$;
create trigger asesorias_no_cambian before update or delete on public.asesorias for each row execute function app.asesoria_inmutable();
create trigger asesorias_no_vaciar  before truncate on public.asesorias for each statement execute function app.asesoria_inmutable();

create function app.evento_inmutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'El historial de Psicopedagogía no se modifica ni se borra.' using errcode = 'EN001';
end;
$$;
create trigger psy_eventos_no_cambian before update or delete on public.psy_eventos for each row execute function app.evento_inmutable();
create trigger psy_eventos_no_vaciar  before truncate on public.psy_eventos for each statement execute function app.evento_inmutable();

create function app.seguimiento_inmutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'TRUNCATE' or tg_op = 'DELETE' then
    raise exception 'Un seguimiento no se borra: se corrige.' using errcode = 'EN001';
  end if;
  if (to_jsonb(old) - 'fecha' - 'estado' - 'metricas' - 'observaciones' - 'checklist' - 'actualizado_en' - 'actualizado_por')
     is distinct from (to_jsonb(new) - 'fecha' - 'estado' - 'metricas' - 'observaciones' - 'checklist' - 'actualizado_en' - 'actualizado_por') then
    raise exception 'De un seguimiento no se cambia el alumno ni la asesoría.' using errcode = 'EN001';
  end if;
  return new;
end;
$$;
create trigger seguimientos_no_cambian before update or delete on public.seguimientos for each row execute function app.seguimiento_inmutable();
create trigger seguimientos_no_vaciar  before truncate on public.seguimientos for each statement execute function app.seguimiento_inmutable();

-- ---------------------------------------------------------------------------------------------------------------------
-- Reglas de la agenda en la base (espejo de las funciones puras de src/utils; check-agenda-db.ts las compara)
-- ---------------------------------------------------------------------------------------------------------------------

-- Horarios de inicio permitidos (cada uno dura una hora): lunes a viernes 3 a 8 p. m.; sábados 9 a 1 y 4 a 8 p. m.; domingos no hay atención
create function app.horario_valido(p_fecha date, p_hora text) returns boolean
language sql immutable set search_path = '' as $$
  select case extract(isodow from p_fecha)::int
    when 7 then false
    when 6 then p_hora = any (array['09:00', '10:00', '11:00', '12:00', '16:00', '17:00', '18:00', '19:00'])
    else p_hora = any (array['15:00', '16:00', '17:00', '18:00', '19:00'])
  end;
$$;

-- Cupo de un horario: excepción de esa fecha y hora > cupo de la sede > cupo general > 6. Devuelve nulo si no hay límite.
create function app.cupo_de(p_sede text, p_fecha date, p_hora text) returns integer
language plpgsql stable security definer set search_path = '' as $$
declare
  v_id text;
begin
  v_id := 'exc:' || p_sede || ':' || p_fecha::text || ':' || p_hora;
  if exists (select 1 from public.capacidad_asesorias c where c.id = v_id) then return (select c.cupo from public.capacidad_asesorias c where c.id = v_id); end if;
  v_id := 'sede:' || p_sede;
  if exists (select 1 from public.capacidad_asesorias c where c.id = v_id) then return (select c.cupo from public.capacidad_asesorias c where c.id = v_id); end if;
  if exists (select 1 from public.capacidad_asesorias c where c.id = 'general') then return (select c.cupo from public.capacidad_asesorias c where c.id = 'general'); end if;
  return 6;
end;
$$;

-- ¿Trabaja esa persona ese día? No si está de vacaciones (las de su contrato vigente) ni después de su cese (contrato cerrado y sin otro que la cubra)
create function app.personal_disponible(p_personal text, p_fecha date) returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists (
    select 1 from public.contratos c
    where c.personal_id = p_personal and c.estado = 'Vigente' and c.vacaciones_inicio is not null and p_fecha between c.vacaciones_inicio and c.vacaciones_fin
  ) and not exists (
    select 1 from public.contratos c
    where c.personal_id = p_personal and c.estado = 'Cesado' and c.fecha_fin is not null and p_fecha > c.fecha_fin
      and p_fecha < coalesce((select min(x.fecha_inicio) from public.contratos x where x.personal_id = c.personal_id and x.id <> c.id and x.fecha_inicio > c.fecha_fin), 'infinity'::date)
  );
$$;

-- Mensaje si esa persona no puede ser responsable de una asesoría en esa sede y fecha (nulo = puede)
create function app.responsable_invalido(p_personal text, p_sede text, p_fecha date) returns text
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.personal p where p.id = p_personal) then return 'El responsable elegido no existe.'; end if;
  if not exists (select 1 from public.asignaciones a where a.personal_id = p_personal and a.sede_id = p_sede and a.area = 'Psicopedagogía' and a.estado = 'Activa') then
    return 'El responsable debe ser personal de Psicopedagogía con una asignación activa en esa sede.';
  end if;
  if not app.personal_disponible(p_personal, p_fecha) then
    return 'El responsable no trabaja ese día (está de vacaciones o ya cesó): elija a otra persona.';
  end if;
  return null;
end;
$$;

-- ¿Hay una receta de materiales para esa matrícula? (mismo programa, nivel o todos, sede o todas, y vigente hoy)
create function app.receta_aplica(p_matricula text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.matriculas m join public.recetas r on r.programa_id = m.programa_id
    where m.id = p_matricula and r.estado = 'Activo' and (r.nivel_id is null or r.nivel_id = m.nivel_id)
      and (r.todas_las_sedes or m.sede_id = any (r.sedes)) and r.vigencia_inicio <= app.hoy() and (r.vigencia_fin is null or app.hoy() <= r.vigencia_fin)
  );
$$;

-- La verificación va ANTES de la primera asesoría: una matrícula activa, sin verificar y con receta de materiales no admite asistencia ni falta
create function app.matricula_sin_verificar(p_matricula text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.matriculas m
    where m.id = p_matricula and m.estado = 'Activa' and coalesce(m.verificacion_estado, '') not in ('Verificado Completo', 'Verificado Incompleto') and app.receta_aplica(m.id)
  );
$$;

-- Los motivos de una cancelación o reprogramación y quién los pide (`CHANGE_REASONS` en src/utils/psyHistory.ts)
create function app.motivo_cambio(p_motivo text) returns table (iniciador text, necesita_detalle boolean, solo_cancelar boolean)
language sql immutable set search_path = '' as $$
  select m.iniciador, m.necesita_detalle, m.solo_cancelar from (values
    ('El alumno o su titular avisó con anticipación', 'Alumno o titular', false, false),
    ('Enfermedad del alumno', 'Alumno o titular', false, false),
    ('Cruce con el colegio, el trabajo o un viaje', 'Alumno o titular', false, false),
    ('El alumno dejará de asistir', 'Alumno o titular', false, true),
    ('Reserva duplicada o hecha por error', 'Institución', false, true),
    ('Institución: personal no disponible', 'Institución', false, false),
    ('Institución: feriado o cierre de la sede', 'Institución', false, false),
    ('Institución: cruce con una actividad o evento', 'Institución', false, false),
    ('Institución: matrícula sin verificar (sin materiales)', 'Institución', false, false),
    ('Institución: otro motivo', 'Institución', true, false)
  ) as m (motivo, iniciador, necesita_detalle, solo_cancelar) where m.motivo = p_motivo;
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Códigos asignados por la base: SES-NNN, EVT-NNNN y TRK-NNN (el mismo mecanismo de borradores que el dinero y el personal)
-- ---------------------------------------------------------------------------------------------------------------------

create function app.asignar_codigos_agenda(p jsonb) returns jsonb
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

-- Cambia los borradores que el dinero ya resolvió (p. ej. MAT-2026-~1~ → MAT-2026-007) en lo que viaja para la agenda
create function app.reemplazar_borradores(p jsonb, p_codigos jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  v_texto text := p::text;
  v_k     record;
begin
  for v_k in select key, value from jsonb_each_text(coalesce(p_codigos, '{}'::jsonb)) loop
    v_texto := replace(v_texto, v_k.key, v_k.value);
  end loop;
  return v_texto::jsonb;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Qué función pide cada acción de la agenda (las del dinero piden la suya y la agenda las acepta tal cual)
-- ---------------------------------------------------------------------------------------------------------------------

create function app.acciones_agenda() returns jsonb
language sql immutable set search_path = '' as $$
  select '{
    "reservar":         { "mensaje": "agendar asesorías", "funciones": ["psi-prog:create"] },
    "reprogramar":      { "mensaje": "reprogramar asesorías", "funciones": ["psi-prog:reschedule"] },
    "cancelar":         { "mensaje": "cancelar asesorías", "funciones": ["psi-prog:reschedule"] },
    "observaciones":    { "mensaje": "editar las observaciones de una asesoría", "funciones": ["psi-prog:reschedule"] },
    "asistencia":       { "mensaje": "marcar la asistencia de una asesoría", "funciones": ["psi-prog:mark_attendance"] },
    "registrar_sesion": { "mensaje": "registrar el seguimiento de la sesión", "funciones": ["psi-prog:reg_tracking"] },
    "editar_sesion":    { "mensaje": "editar el seguimiento de la sesión", "funciones": ["psi-prog:reg_tracking"] }
  }'::jsonb
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Comprobación de UNA asesoría ya aplicada (p_o = cómo estaba antes; nulo si es nueva)
-- ---------------------------------------------------------------------------------------------------------------------

create function app.verificar_asesoria(p_o jsonb, p_id text, p_accion text, p_interno boolean, p_eventos jsonb) returns void
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

-- ---------------------------------------------------------------------------------------------------------------------
-- La operación atómica de la agenda
--   p = { asesorias: [fila], seguimientos: [fila], eventos: [evento] }; una fila NUEVA trae `_nueva: true` y todas sus columnas; una existente trae su id y solo
--   las columnas que cambiaron. Las primeras asesorías (matrícula) y las cancelaciones (caída, traslado) viajan dentro de la operación del dinero.
-- ---------------------------------------------------------------------------------------------------------------------

create function app.aplicar_agenda(p_accion text, p jsonb, p_interno boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_conf     jsonb;
  v_funcs    text[];
  v_cod      jsonb;
  v_codigos  jsonb;
  v_ids      text[];
  v_antes    jsonb := '{}'::jsonb;
  v_fila     jsonb;
  v_ev       jsonb;
  v_id       text;
  v_ref      text;
  v_ases     public.asesorias;
  v_tipos_ok constant text[] := array['Reservada', 'Reprogramada', 'Cancelada', 'Asistió', 'Faltó', 'Sesión registrada'];
  v_hoy      date := app.hoy();
  v_sg       public.seguimientos;
  v_sesiones text[] := '{}';
begin
  if jsonb_typeof(p) is distinct from 'object' then raise exception 'No hay cambios para guardar.' using errcode = 'EN001'; end if;
  if p_interno then
    if p_accion not in ('matricular', 'caida', 'traslado') then raise exception 'Esta operación no cambia la agenda.' using errcode = 'EN001'; end if;
  else
    v_conf := app.acciones_agenda() -> p_accion;
    if v_conf is null then raise exception 'La operación «%» no existe.', coalesce(p_accion, '') using errcode = 'EN001'; end if;
    select array_agg(f) into v_funcs from jsonb_array_elements_text(v_conf->'funciones') f;
    perform app.exigir_alguna(v_funcs, 'Su rol no puede ' || (v_conf->>'mensaje') || ': falta la función correspondiente.');
  end if;
  if exists (select 1 from jsonb_object_keys(p) k where k not in ('asesorias', 'seguimientos', 'eventos')) then
    raise exception 'Hay datos que la agenda no reconoce.' using errcode = 'EN001';
  end if;
  if (p ? 'seguimientos') and p_accion not in ('registrar_sesion', 'editar_sesion') then raise exception 'Esta operación no guarda seguimientos.' using errcode = 'EN001'; end if;

  -- El código de toda fila NUEVA es un borrador (SES-~1~, TRK-~2~, EVT-~3~): lo asigna la base (una pantalla desactualizada que mande uno escrito a mano se rechaza)
  if exists (select 1 from jsonb_array_elements(coalesce(p->'asesorias', '[]'::jsonb)) r where coalesce((r->>'_nueva')::boolean, false) and coalesce(r->>'id', '') !~ '^SES-~[0-9]+~$')
     or exists (select 1 from jsonb_array_elements(coalesce(p->'seguimientos', '[]'::jsonb)) r where coalesce((r->>'_nueva')::boolean, false) and coalesce(r->>'id', '') !~ '^TRK-~[0-9]+~$')
     or exists (select 1 from jsonb_array_elements(coalesce(p->'eventos', '[]'::jsonb)) r where coalesce(r->>'id', '') !~ '^EVT-~[0-9]+~$') then
    raise exception 'Esta pantalla está desactualizada: el código de un registro nuevo lo asigna el sistema. Recargue la página e intente de nuevo.' using errcode = 'EN001';
  end if;

  -- Los borradores de código se cambian por los reales (el más alto de toda la tabla)
  v_cod := app.asignar_codigos_agenda(p);
  p := v_cod->'payload';
  v_codigos := v_cod->'codigos';

  -- Cómo estaban las asesorías antes de tocarlas
  v_ids := array(select r->>'id' from jsonb_array_elements(coalesce(p->'asesorias', '[]'::jsonb)) r);
  select coalesce(jsonb_object_agg(a.id, to_jsonb(a)), '{}'::jsonb) into v_antes from public.asesorias a where a.id = any (v_ids);

  -- Asesorías: las nuevas se agregan completas; de las existentes solo cambian fecha, hora, responsable, estado y observaciones
  for v_fila in select * from jsonb_array_elements(coalesce(p->'asesorias', '[]'::jsonb)) loop
    if coalesce((v_fila->>'_nueva')::boolean, false) then
      insert into public.asesorias (id, alumno_id, sede_id, fecha, hora, responsable_id, estado, observaciones, es_primera, registro_id, matricula_id, creado_por, actualizado_por)
      values (v_fila->>'id', v_fila->>'alumno_id', v_fila->>'sede_id', (v_fila->>'fecha')::date, v_fila->>'hora', nullif(v_fila->>'responsable_id', ''), v_fila->>'estado',
              nullif(v_fila->>'observaciones', ''), coalesce((v_fila->>'es_primera')::boolean, false), nullif(v_fila->>'registro_id', ''), nullif(v_fila->>'matricula_id', ''),
              app.quien(null), app.quien(null));
    else
      if exists (select 1 from jsonb_object_keys(v_fila) k where k not in ('id', 'fecha', 'hora', 'responsable_id', 'estado', 'observaciones')) then
        raise exception 'De una asesoría solo se cambia la fecha, la hora, el responsable, el estado y las observaciones.' using errcode = 'EN001';
      end if;
      update public.asesorias a set
        fecha = case when v_fila ? 'fecha' then (v_fila->>'fecha')::date else a.fecha end,
        hora = case when v_fila ? 'hora' then v_fila->>'hora' else a.hora end,
        responsable_id = case when v_fila ? 'responsable_id' then nullif(v_fila->>'responsable_id', '') else a.responsable_id end,
        estado = case when v_fila ? 'estado' then v_fila->>'estado' else a.estado end,
        observaciones = case when v_fila ? 'observaciones' then nullif(v_fila->>'observaciones', '') else a.observaciones end,
        actualizado_en = now(), actualizado_por = app.quien(null)
      where a.id = v_fila->>'id';
      if not found then raise exception 'No se encontró la asesoría %.', v_fila->>'id' using errcode = 'EN001'; end if;
    end if;
  end loop;

  -- Seguimientos (la sesión de una asesoría): nuevos completos; los existentes solo cambian lo que se corrige
  for v_fila in select * from jsonb_array_elements(coalesce(p->'seguimientos', '[]'::jsonb)) loop
    if coalesce((v_fila->>'_nueva')::boolean, false) then
      if p_accion <> 'registrar_sesion' then raise exception 'Esta operación no crea seguimientos.' using errcode = 'EN001'; end if;
      select * into v_ases from public.asesorias a where a.id = v_fila->>'asesoria_id';
      if not found then raise exception 'El seguimiento debe ser de una asesoría que existe.' using errcode = 'EN001'; end if;
      if v_ases.alumno_id is distinct from v_fila->>'alumno_id' then raise exception 'El seguimiento debe ser del alumno de la asesoría.' using errcode = 'EN001'; end if;
      perform app.exigir_sede(v_ases.sede_id, 'seguimientos');
      if v_ases.estado <> 'Asistió' then raise exception 'Solo se registra la sesión de una asesoría a la que el alumno asistió.' using errcode = 'EN001'; end if;
      if v_ases.fecha > v_hoy then raise exception 'La sesión solo existe desde el día de la asesoría.' using errcode = 'EN001'; end if;
      if v_ases.es_primera and app.matricula_sin_verificar(v_ases.matricula_id) then
        raise exception 'No se puede registrar la primera asesoría: la matrícula aún no está verificada (el alumno no tiene sus materiales). Verifique la matrícula o reprograme la asesoría.' using errcode = 'EN001';
      end if;
      v_sesiones := v_sesiones || v_ases.id;
      insert into public.seguimientos (id, alumno_id, asesoria_id, sede_id, fecha, estado, metricas, observaciones, checklist, creado_por, actualizado_por)
      values (v_fila->>'id', v_ases.alumno_id, v_ases.id, v_ases.sede_id, (v_fila->>'fecha')::date, v_fila->>'estado', coalesce(v_fila->'metricas', '{}'::jsonb),
              coalesce(v_fila->>'observaciones', ''), case when jsonb_typeof(v_fila->'checklist') = 'object' then v_fila->'checklist' end, app.quien(null), app.quien(null));
    else
      if p_accion <> 'editar_sesion' then raise exception 'Esta operación no edita seguimientos.' using errcode = 'EN001'; end if;
      if exists (select 1 from jsonb_object_keys(v_fila) k where k not in ('id', 'fecha', 'estado', 'metricas', 'observaciones', 'checklist')) then
        raise exception 'De un seguimiento solo se corrigen la fecha, el estado, las métricas, las observaciones y la lista de cierre.' using errcode = 'EN001';
      end if;
      select * into v_sg from public.seguimientos s where s.id = v_fila->>'id';
      if not found then raise exception 'No se encontró el seguimiento %.', v_fila->>'id' using errcode = 'EN001'; end if;
      perform app.exigir_sede(v_sg.sede_id, 'seguimientos');
      update public.seguimientos s set
        fecha = case when v_fila ? 'fecha' then (v_fila->>'fecha')::date else s.fecha end,
        estado = case when v_fila ? 'estado' then v_fila->>'estado' else s.estado end,
        metricas = case when v_fila ? 'metricas' then coalesce(v_fila->'metricas', '{}'::jsonb) else s.metricas end,
        observaciones = case when v_fila ? 'observaciones' then coalesce(v_fila->>'observaciones', '') else s.observaciones end,
        checklist = case when v_fila ? 'checklist' then (case when jsonb_typeof(v_fila->'checklist') = 'object' then v_fila->'checklist' end) else s.checklist end,
        actualizado_en = now(), actualizado_por = app.quien(null)
      where s.id = v_fila->>'id';
    end if;
  end loop;

  -- Las reglas, asesoría por asesoría (sobre lo que quedó)
  foreach v_id in array coalesce((select array_agg(distinct i) from unnest(v_ids) i), '{}'::text[]) loop
    perform app.verificar_asesoria(v_antes -> v_id, v_id, p_accion, p_interno, p->'eventos');
  end loop;

  -- Una sesión registrada deja su evento
  for v_fila in select * from jsonb_array_elements(coalesce(p->'seguimientos', '[]'::jsonb)) loop
    if coalesce((v_fila->>'_nueva')::boolean, false) and not exists (
      select 1 from jsonb_array_elements(coalesce(p->'eventos', '[]'::jsonb)) e where e->>'ref_id' = v_fila->>'asesoria_id' and e->>'tipo' = 'Sesión registrada') then
      raise exception 'Registrar la sesión deja su evento en el historial.' using errcode = 'EN001';
    end if;
  end loop;

  -- Los eventos: solo de las asesorías de esta operación, con los tipos de una asesoría; quién y cuándo los pone la base
  for v_ev in select * from jsonb_array_elements(coalesce(p->'eventos', '[]'::jsonb)) loop
    v_ref := v_ev->>'ref_id';
    if v_ev->>'tema' is distinct from 'asesoria' or not (v_ref = any (v_ids || v_sesiones)) then raise exception 'Un evento debe ser de una asesoría de esta operación.' using errcode = 'EN001'; end if;
    if not ((v_ev->>'tipo') = any (v_tipos_ok)) then raise exception 'El evento «%» no es de una asesoría.', v_ev->>'tipo' using errcode = 'EN001'; end if;
    select * into v_ases from public.asesorias a where a.id = v_ref;
    insert into public.psy_eventos (id, por, tema, ref_id, alumno_id, sede_id, tipo, iniciador, motivo, detalle, desde, hasta)
    values (v_ev->>'id', app.quien(null), 'asesoria', v_ref, v_ases.alumno_id, v_ases.sede_id, v_ev->>'tipo', nullif(v_ev->>'iniciador', ''), nullif(btrim(coalesce(v_ev->>'motivo', '')), ''),
            nullif(btrim(coalesce(v_ev->>'detalle', '')), ''), case when jsonb_typeof(v_ev->'desde') = 'object' then v_ev->'desde' end, case when jsonb_typeof(v_ev->'hasta') = 'object' then v_ev->'hasta' end);
  end loop;

  return jsonb_build_object('ok', true, 'codigos', v_codigos);
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Funciones públicas
-- ---------------------------------------------------------------------------------------------------------------------

create function public.aplicar_cambios_agenda(p_accion text, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  return app.aplicar_agenda(p_accion, p, false);
end;
$$;
comment on function public.aplicar_cambios_agenda(text, jsonb) is 'Aplica los cambios de una acción de la agenda (asesorías, historial, seguimiento), todo o nada, con la función del registro, las reglas de la agenda y los códigos asignados por la base. Devuelve { ok, codigos }.';

-- El cupo de los horarios: { guardar: [{ ambito, sede_id, fecha, hora, cupo }], quitar: [id] }
create function public.guardar_capacidad(p_cambios jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_fila  jsonb;
  v_id    text;
  v_ambito text;
  v_sede  text;
  v_fecha date;
  v_hora  text;
  v_cupo  integer;
begin
  perform app.exigir('psi-prog:capacity', 'Configurar los cupos');
  if jsonb_typeof(p_cambios) is distinct from 'object' then raise exception 'No hay cambios para guardar.' using errcode = 'EN001'; end if;
  for v_fila in select * from jsonb_array_elements(coalesce(p_cambios->'guardar', '[]'::jsonb)) loop
    v_ambito := v_fila->>'ambito';
    v_sede := nullif(v_fila->>'sede_id', '');
    v_fecha := nullif(v_fila->>'fecha', '')::date;
    v_hora := nullif(v_fila->>'hora', '');
    v_cupo := nullif(v_fila->>'cupo', '')::integer;
    if v_ambito is null or v_ambito not in ('general', 'sede', 'excepcion') then raise exception 'El tipo de cupo no es válido.' using errcode = 'EN001'; end if;
    if v_cupo is not null and (v_cupo < 1 or v_cupo > 50) then raise exception 'El cupo debe estar entre 1 y 50 alumnos (o sin límite).' using errcode = 'EN001'; end if;
    if v_ambito = 'general' then
      if not app.alcance_total() then raise exception 'Solo quien alcanza todas las sedes cambia el cupo general.' using errcode = 'EN001'; end if;
      v_id := 'general'; v_sede := null; v_fecha := null; v_hora := null;
    else
      if v_sede is null or not exists (select 1 from public.sedes s where s.id = v_sede) then raise exception 'Elija la sede del cupo.' using errcode = 'EN001'; end if;
      perform app.exigir_sede(v_sede, 'los cupos');
      if v_ambito = 'sede' then
        v_id := 'sede:' || v_sede; v_fecha := null; v_hora := null;
      else
        if v_fecha is null or v_hora is null or not app.horario_valido(v_fecha, v_hora) then raise exception 'Elija una fecha y un horario de atención para la excepción.' using errcode = 'EN001'; end if;
        v_id := 'exc:' || v_sede || ':' || v_fecha::text || ':' || v_hora;
      end if;
    end if;
    insert into public.capacidad_asesorias (id, ambito, sede_id, fecha, hora, cupo, actualizado_por) values (v_id, v_ambito, v_sede, v_fecha, v_hora, v_cupo, app.quien(null))
    on conflict (id) do update set cupo = excluded.cupo, actualizado_en = now(), actualizado_por = excluded.actualizado_por;
  end loop;
  for v_id in select jsonb_array_elements_text(coalesce(p_cambios->'quitar', '[]'::jsonb)) loop
    if v_id = 'general' then raise exception 'El cupo general no se quita: se cambia.' using errcode = 'EN001'; end if;
    select c.sede_id into v_sede from public.capacidad_asesorias c where c.id = v_id;
    if found then
      perform app.exigir_sede(v_sede, 'los cupos');
      delete from public.capacidad_asesorias c where c.id = v_id;
    end if;
  end loop;
end;
$$;
comment on function public.guardar_capacidad(jsonb) is 'Guarda o quita los cupos de los horarios (general, por sede y excepciones por fecha y hora).';

-- ---------------------------------------------------------------------------------------------------------------------
-- La función pública del dinero acepta ahora una clave `agenda` (matricular, caida, traslado): se aplica DESPUÉS del dinero y en la misma operación
-- ---------------------------------------------------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------------------------------------------------
-- Quién ve qué (check-agenda-db.ts compara estas listas con el registro)
-- ---------------------------------------------------------------------------------------------------------------------

create function app.puede_leer_asesorias() returns boolean
language sql stable security definer set search_path = '' as $$
  select app.tiene_alguna(array['dash-resumen:view', 'op-matriculas:view', 'op-verificacion:view', 'per-alumnos:view', 'per-asignaciones:view', 'per-contratos:view', 'per-personal:view',
    'psi-historial:view', 'psi-prog:view', 'psi-recordatorios:view', 'rep-matriculas:view', 'rep-psicopedagogia:view', 'rep-verificacion:view', 'sis-auditoria:view']);
$$;

create function app.puede_leer_seguimientos() returns boolean
language sql stable security definer set search_path = '' as $$
  select app.tiene_alguna(array['psi-historial:view', 'psi-prog:view', 'rep-psicopedagogia:view']);
$$;

create function app.puede_leer_capacidad() returns boolean
language sql stable security definer set search_path = '' as $$
  select app.tiene_alguna(array['psi-prog:view', 'psi-prog:create', 'psi-prog:activity_enroll']);
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Permisos de tabla y RLS: solo se lee; todo lo que cambia pasa por las funciones de arriba
-- ---------------------------------------------------------------------------------------------------------------------

revoke all on public.asesorias, public.psy_eventos, public.seguimientos, public.capacidad_asesorias from public, anon, authenticated;
grant select on public.asesorias, public.psy_eventos, public.seguimientos, public.capacidad_asesorias to authenticated;

alter table public.asesorias           enable row level security;
alter table public.psy_eventos         enable row level security;
alter table public.seguimientos        enable row level security;
alter table public.capacidad_asesorias enable row level security;

create policy asesorias_leer on public.asesorias for select to authenticated
  using ((select app.puede_leer_asesorias()) and (select app.ve_sede(sede_id)));
create policy psy_eventos_leer on public.psy_eventos for select to authenticated
  using ((select app.puede_leer_asesorias()) and (select app.ve_sede(sede_id)));
create policy seguimientos_leer on public.seguimientos for select to authenticated
  using ((select app.puede_leer_seguimientos()) and (select app.ve_sede(sede_id)));
create policy capacidad_leer on public.capacidad_asesorias for select to authenticated
  using ((select app.puede_leer_capacidad()) and (sede_id is null or (select app.ve_sede(sede_id))));

-- Las funciones públicas son de las cuentas con sesión
revoke execute on function public.aplicar_cambios_agenda(text, jsonb), public.guardar_capacidad(jsonb) from public, anon;
grant execute on function public.aplicar_cambios_agenda(text, jsonb), public.guardar_capacidad(jsonb) to authenticated;
revoke execute on function public.aplicar_cambios_matricula(text, jsonb) from public, anon;
grant execute on function public.aplicar_cambios_matricula(text, jsonb) to authenticated;

-- Lo interno no se llama de fuera (las funciones públicas corren con los permisos del dueño). No se toca ningún otro permiso del esquema `app`.
revoke execute on function
  app.aplicar_agenda(text, jsonb, boolean), app.verificar_asesoria(jsonb, text, text, boolean, jsonb), app.asignar_codigos_agenda(jsonb), app.reemplazar_borradores(jsonb, jsonb),
  app.cupo_de(text, date, text), app.personal_disponible(text, date), app.responsable_invalido(text, text, date), app.receta_aplica(text), app.matricula_sin_verificar(text),
  app.motivo_cambio(text), app.horario_valido(date, text), app.acciones_agenda(),
  app.asesoria_inmutable(), app.evento_inmutable(), app.seguimiento_inmutable()
  from public, anon, authenticated;
-- Las políticas de seguridad llaman a estas funciones con la cuenta que lee, así que sí deben poder ejecutarlas
revoke execute on function app.puede_leer_asesorias(), app.puede_leer_seguimientos(), app.puede_leer_capacidad() from public, anon;
grant execute on function app.puede_leer_asesorias(), app.puede_leer_seguimientos(), app.puede_leer_capacidad() to authenticated;

commit;
