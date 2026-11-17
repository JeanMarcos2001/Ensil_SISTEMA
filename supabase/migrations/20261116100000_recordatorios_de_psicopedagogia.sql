-- =====================================================================================================================
-- 0024 · Agenda de Psicopedagogía, tercera entrega (Lote 10C): política y registro de recordatorios
-- ---------------------------------------------------------------------------------------------------------------------
-- Pasa a la base lo que seguía en memoria de los recordatorios de Psicopedagogía (el mismo patrón que la cobranza, Lote 9C):
--   · `psy_recordatorio_politicas`: con cuántos días de anticipación se avisa cada cosa (asesorías, actividades especiales y vigencia por vencer). UNA para
--     todo el grupo (como la política de cobranza). **Solo se agregan versiones**: cambiarla guarda una versión nueva con quién y cuándo (el historial es la
--     propia tabla); la vigente es la de número más alto. Sin ninguna fila valen los valores de partida (asesorías 1 día antes, actividades 2 y vigencia 14, 7
--     y 1), que es lo que mostraba el sistema.
--   · `psy_recordatorios`: cada recordatorio que se envió u omitió (canal, resultado y, si se omite, el motivo). Se ven por sede. **Solo se agregan**; un mismo
--     recordatorio (tipo + asesoría, actividad o matrícula + alumno + etapa) no se puede registrar dos veces, ni siquiera dos personas a la vez. El sistema no
--     envía mensajes: prepara el texto, abre WhatsApp y deja aquí el registro. El código `PRL-NNN` lo asigna la base.
--   · **La base vuelve a comprobar** lo que ya comprobaba el sistema: la asesoría sigue pendiente (reservada o reprogramada y no pasada) y, si es una primera
--     asesoría, su matrícula está verificada (no se recuerda una cuyo paso previo es verificar o reprogramar); la actividad no pasó y el alumno sigue inscrito sin
--     asistencia marcada; la matrícula sigue activa; la etapa es una de la política vigente; el canal y el resultado; y que omitir lleva su motivo.
--   · Nadie escribe estas tablas directo: solo las funciones `guardar_politica_recordatorios_psy` y `registrar_recordatorio_psy`, que piden la función del
--     registro (`psi-recordatorios:config`, `psi-recordatorios:remind`), comprueban que la sede se alcance y dejan quién y cuándo (el nombre sale de la
--     cuenta, no de la pantalla). La política la lee cualquier cuenta vigente; los recordatorios, quien los lee según el registro y de su sede
--     (comparado en `check-psy-reminders-db.ts`).
-- Los errores de negocio usan el código EN001: el sistema muestra su texto tal cual (está en español).
-- No hay carga de partida: sin filas, el sistema usa los valores de partida y la primera vez que se guarda nace la versión 1.
-- Para deshacer: supabase/deshacer/20261116100000_recordatorios_de_psicopedagogia.down.sql
-- =====================================================================================================================

begin;

-- ---------------------------------------------------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------------------------------------------------

create table public.psy_recordatorio_politicas (
  version           integer primary key check (version >= 1),
  asesorias_antes   integer[] not null,
  actividades_antes integer[] not null,
  vigencia_antes    integer[] not null,
  creada_en         timestamptz not null default now(),
  creada_por        text not null,
  check (cardinality(asesorias_antes) >= 1 and cardinality(actividades_antes) >= 1 and cardinality(vigencia_antes) >= 1)
);
comment on table public.psy_recordatorio_politicas is 'Política de recordatorios de Psicopedagogía del grupo, por versiones (solo se agregan). La vigente es la de número más alto; sin filas valen los valores de partida. Los días son ANTES de la fecha (0 = el mismo día).';

create table public.psy_recordatorios (
  id             text primary key check (id ~ '^PRL-[0-9]{3,}$'),
  tipo           text not null check (tipo in ('asesoria', 'actividad', 'vigencia')),
  ref_id         text not null,
  alumno_id      text not null references public.alumnos (id) on delete restrict,
  etapa          integer not null check (etapa between 0 and 60),
  clave          text generated always as (tipo || ':' || ref_id || case when tipo = 'actividad' then ':' || alumno_id else '' end || ':' || etapa::text) stored,
  sede_id        text not null references public.sedes (id) on delete restrict,
  registrado_en  timestamptz not null default now(),
  registrado_por text not null,
  canal          text not null check (canal in ('WhatsApp', 'Correo', 'Llamada', 'Otro')),
  resultado      text not null check (resultado in ('Enviado', 'Omitido')),
  nota           text,
  check (resultado = 'Enviado' or length(btrim(coalesce(nota, ''))) >= 5)
);
-- Un mismo recordatorio (tipo + asesoría, actividad o matrícula + alumno + etapa) se registra una sola vez, en cualquier sede
create unique index psy_recordatorios_clave_uq on public.psy_recordatorios (clave);
create index psy_recordatorios_sede_idx on public.psy_recordatorios (sede_id, registrado_en desc);
create index psy_recordatorios_alumno_idx on public.psy_recordatorios (alumno_id);
comment on table public.psy_recordatorios is 'Recordatorios de Psicopedagogía enviados u omitidos. Solo se agregan. `ref_id` = la asesoría (SES-NNN), la actividad (CRO-NNN:ACT-NNN) o la matrícula (MAT-AAAA-NNN); `etapa` = los días antes de la fecha (0 = el mismo día). La sede es la de lo recordado al registrarlo.';

-- ---------------------------------------------------------------------------------------------------------------------
-- Lo que no se cambia ni se borra
-- ---------------------------------------------------------------------------------------------------------------------

create function app.psy_politica_inmutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Una política de recordatorios no se modifica ni se borra: un cambio se guarda como una versión nueva.' using errcode = 'EN001';
end;
$$;
create trigger psy_politicas_no_cambian before update or delete on public.psy_recordatorio_politicas for each row execute function app.psy_politica_inmutable();
create trigger psy_politicas_no_vaciar  before truncate on public.psy_recordatorio_politicas for each statement execute function app.psy_politica_inmutable();

create function app.psy_recordatorio_inmutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Un recordatorio registrado no se modifica ni se borra.' using errcode = 'EN001';
end;
$$;
create trigger psy_recordatorios_no_cambian before update or delete on public.psy_recordatorios for each row execute function app.psy_recordatorio_inmutable();
create trigger psy_recordatorios_no_vaciar  before truncate on public.psy_recordatorios for each statement execute function app.psy_recordatorio_inmutable();

-- ---------------------------------------------------------------------------------------------------------------------
-- La política vigente (o la de partida si nunca se guardó una)
-- ---------------------------------------------------------------------------------------------------------------------

create function app.psy_politica_vigente()
returns table (version integer, asesorias integer[], actividades integer[], vigencia integer[])
language sql stable security definer set search_path = '' as $$
  (select p.version, p.asesorias_antes, p.actividades_antes, p.vigencia_antes from public.psy_recordatorio_politicas p order by p.version desc limit 1)
  union all
  select 0, array[1], array[2], array[14, 7, 1] where not exists (select 1 from public.psy_recordatorio_politicas);
$$;
comment on function app.psy_politica_vigente() is 'La política de recordatorios de Psicopedagogía vigente; sin ninguna guardada, la de partida (versión 0: asesorías 1 día antes, actividades 2 y vigencia 14, 7 y 1).';

-- ---------------------------------------------------------------------------------------------------------------------
-- Guardar la política de recordatorios (`validatePsyPolicy` del sistema: enteros, de 0 a 14 / 30 / 60 días, al menos uno de cada)
-- ---------------------------------------------------------------------------------------------------------------------

create function public.guardar_politica_recordatorios_psy(p_asesorias integer[], p_actividades integer[], p_vigencia integer[]) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_ases    integer[];
  v_acts    integer[];
  v_vig     integer[];
  v_actual  record;
  v_version integer;
begin
  perform app.exigir('psi-recordatorios:config', 'Configurar los días de recordatorio');
  v_ases := array(select distinct x from unnest(coalesce(p_asesorias, '{}'::integer[])) x order by x desc);
  v_acts := array(select distinct x from unnest(coalesce(p_actividades, '{}'::integer[])) x order by x desc);
  v_vig  := array(select distinct x from unnest(coalesce(p_vigencia, '{}'::integer[])) x order by x desc);
  if cardinality(v_ases) = 0 then raise exception 'Defina al menos un día para las asesorías.' using errcode = 'EN001'; end if;
  if cardinality(v_acts) = 0 then raise exception 'Defina al menos un día para las actividades.' using errcode = 'EN001'; end if;
  if cardinality(v_vig) = 0 then raise exception 'Defina al menos un día para la vigencia por vencer.' using errcode = 'EN001'; end if;
  if exists (select 1 from unnest(v_ases) x where x is null or x < 0 or x > 14) then
    raise exception 'Los días de las asesorías deben ser enteros entre 0 y 14 (0 = el mismo día).' using errcode = 'EN001';
  end if;
  if exists (select 1 from unnest(v_acts) x where x is null or x < 0 or x > 30) then
    raise exception 'Los días de las actividades deben ser enteros entre 0 y 30 (0 = el mismo día).' using errcode = 'EN001';
  end if;
  if exists (select 1 from unnest(v_vig) x where x is null or x < 0 or x > 60) then
    raise exception 'Los días de la vigencia por vencer deben ser enteros entre 0 y 60 (0 = el mismo día).' using errcode = 'EN001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ensil:psy_recordatorio_politicas', 0));
  select * into v_actual from app.psy_politica_vigente();
  -- Sin cambios no se agrega una versión (la de partida, versión 0, no cuenta: guardarla por primera vez crea la 1)
  if v_actual.version > 0 and v_actual.asesorias = v_ases and v_actual.actividades = v_acts and v_actual.vigencia = v_vig then
    return v_actual.version;
  end if;
  v_version := v_actual.version + 1;
  insert into public.psy_recordatorio_politicas (version, asesorias_antes, actividades_antes, vigencia_antes, creada_por)
  values (v_version, v_ases, v_acts, v_vig, app.quien(null));
  return v_version;
end;
$$;
comment on function public.guardar_politica_recordatorios_psy(integer[], integer[], integer[]) is 'Guarda la política de recordatorios de Psicopedagogía del grupo como una versión nueva (si cambió) y devuelve el número de la vigente.';

-- ---------------------------------------------------------------------------------------------------------------------
-- Registrar un recordatorio de Psicopedagogía (enviado u omitido)
-- ---------------------------------------------------------------------------------------------------------------------

create function public.registrar_recordatorio_psy(p_tipo text, p_ref text, p_alumno text, p_etapa integer, p_canal text, p_resultado text, p_nota text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_hoy    date := app.hoy();
  v_sede   text;
  v_ases   public.asesorias;
  v_act    public.actividades;
  v_mat    public.matriculas;
  v_pol    record;
  v_etapas integer[];
  v_nota   text := btrim(coalesce(p_nota, ''));
  v_clave  text;
  v_n      integer;
  v_id     text;
begin
  perform app.exigir('psi-recordatorios:remind', 'Enviar y registrar recordatorios');
  if p_tipo is null or p_tipo not in ('asesoria', 'actividad', 'vigencia') then raise exception 'El tipo de recordatorio no es válido.' using errcode = 'EN001'; end if;
  if p_ref is null or btrim(p_ref) = '' or p_alumno is null or not exists (select 1 from public.alumnos a where a.id = p_alumno) then
    raise exception 'No se encontró el alumno del recordatorio.' using errcode = 'EN001';
  end if;

  -- Lo recordado sigue pendiente (es lo que ya comprobaba el sistema al armar la lista)
  if p_tipo = 'asesoria' then
    select * into v_ases from public.asesorias s where s.id = p_ref;
    if not found then raise exception 'No se encontró la asesoría.' using errcode = 'EN001'; end if;
    if v_ases.alumno_id <> p_alumno then raise exception 'El recordatorio debe ser del alumno de la asesoría.' using errcode = 'EN001'; end if;
    if v_ases.estado not in ('Reservado', 'Reprogramado') or v_ases.fecha < v_hoy then
      raise exception 'La asesoría ya no está pendiente: no hace falta recordarla.' using errcode = 'EN001';
    end if;
    if v_ases.es_primera and app.matricula_sin_verificar(v_ases.matricula_id) then
      raise exception 'Una primera asesoría cuya matrícula sigue sin verificar no se recuerda: primero hay que verificar o reprogramar.' using errcode = 'EN001';
    end if;
    v_sede := v_ases.sede_id;
  elsif p_tipo = 'actividad' then
    select * into v_act from public.actividades a where a.id = split_part(p_ref, ':', 2) and a.cronograma_id = split_part(p_ref, ':', 1);
    if not found then raise exception 'No se encontró la actividad.' using errcode = 'EN001'; end if;
    if v_act.fecha < v_hoy then raise exception 'La actividad ya pasó: no hace falta recordarla.' using errcode = 'EN001'; end if;
    if not exists (select 1 from public.actividad_inscripciones i where i.actividad_id = v_act.id and i.alumno_id = p_alumno and i.asistencia is null) then
      raise exception 'El alumno ya no está inscrito en la actividad (o ya tiene su asistencia): no hace falta recordarla.' using errcode = 'EN001';
    end if;
    v_sede := v_act.sede_id;
  else
    select * into v_mat from public.matriculas m where m.id = p_ref;
    if not found then raise exception 'No se encontró la matrícula.' using errcode = 'EN001'; end if;
    if v_mat.alumno_id <> p_alumno then raise exception 'El recordatorio debe ser del alumno de la matrícula.' using errcode = 'EN001'; end if;
    if v_mat.estado <> 'Activa' then raise exception 'La matrícula ya no está activa: no hace falta recordar su vigencia.' using errcode = 'EN001'; end if;
    v_sede := v_mat.sede_id;
  end if;
  perform app.exigir_sede(v_sede, 'recordatorios de Psicopedagogía');

  if p_canal is null or p_canal not in ('WhatsApp', 'Correo', 'Llamada', 'Otro') then raise exception 'Seleccione el canal.' using errcode = 'EN001'; end if;
  if p_resultado is null or p_resultado not in ('Enviado', 'Omitido') then raise exception 'Indique si se envió o se omitió.' using errcode = 'EN001'; end if;
  if p_resultado = 'Omitido' and length(v_nota) < 5 then raise exception 'Explique por qué se omite el recordatorio.' using errcode = 'EN001'; end if;

  -- La etapa debe ser una de la política vigente (si la política cambió mientras tanto, la pantalla debe actualizarse)
  select * into v_pol from app.psy_politica_vigente();
  v_etapas := case p_tipo when 'asesoria' then v_pol.asesorias when 'actividad' then v_pol.actividades else v_pol.vigencia end;
  if p_etapa is null or not (p_etapa = any (v_etapas)) then
    raise exception 'Esa etapa de recordatorio ya no está en la política de Psicopedagogía: actualice la página.' using errcode = 'EN001';
  end if;

  -- Un candado: dos personas a la vez no registran el mismo recordatorio ni reciben el mismo código
  perform pg_advisory_xact_lock(hashtextextended('ensil:codigo:PRL|', 0));
  v_clave := p_tipo || ':' || p_ref || case when p_tipo = 'actividad' then ':' || p_alumno else '' end || ':' || p_etapa::text;
  if exists (select 1 from public.psy_recordatorios r where r.clave = v_clave) then
    raise exception 'Este recordatorio ya fue registrado.' using errcode = 'EN001';
  end if;
  select coalesce(max(substring(r.id from '^PRL-([0-9]+)$')::integer), 0) + 1 into v_n from public.psy_recordatorios r;
  v_id := 'PRL-' || app.numero_con_relleno(v_n, 3);
  insert into public.psy_recordatorios (id, tipo, ref_id, alumno_id, etapa, sede_id, registrado_por, canal, resultado, nota)
  values (v_id, p_tipo, p_ref, p_alumno, p_etapa, v_sede, app.quien(null), p_canal, p_resultado, nullif(v_nota, ''));
  return v_id;
end;
$$;
comment on function public.registrar_recordatorio_psy(text, text, text, integer, text, text, text) is 'Registra un recordatorio de Psicopedagogía enviado u omitido (una sola vez por tipo, asesoría, actividad o matrícula, alumno y etapa) y devuelve su código PRL-NNN.';

-- ---------------------------------------------------------------------------------------------------------------------
-- Quién ve qué (check-psy-reminders-db.ts compara esta lista con el registro)
-- ---------------------------------------------------------------------------------------------------------------------

create function app.puede_leer_recordatorios_psy() returns boolean
language sql stable security definer set search_path = '' as $$
  select app.tiene_alguna(array['psi-recordatorios:view', 'sis-auditoria:view']);
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Permisos de tabla y RLS: solo se lee; todo lo que cambia pasa por las funciones de arriba
-- ---------------------------------------------------------------------------------------------------------------------

revoke all on public.psy_recordatorio_politicas, public.psy_recordatorios from public, anon, authenticated;
grant select on public.psy_recordatorio_politicas, public.psy_recordatorios to authenticated;

alter table public.psy_recordatorio_politicas enable row level security;
alter table public.psy_recordatorios          enable row level security;

create policy psy_politicas_leer on public.psy_recordatorio_politicas for select to authenticated using ((select app.acceso_vigente()));
create policy psy_recordatorios_leer on public.psy_recordatorios for select to authenticated
  using ((select app.puede_leer_recordatorios_psy()) and (select app.ve_sede(sede_id)));

-- Las funciones públicas son de las cuentas con sesión
revoke execute on function public.guardar_politica_recordatorios_psy(integer[], integer[], integer[]), public.registrar_recordatorio_psy(text, text, text, integer, text, text, text) from public, anon;
grant execute on function public.guardar_politica_recordatorios_psy(integer[], integer[], integer[]), public.registrar_recordatorio_psy(text, text, text, integer, text, text, text) to authenticated;

-- Lo interno no se llama de fuera (las funciones públicas corren con los permisos del dueño). No se toca ningún otro permiso del esquema `app`.
revoke execute on function app.psy_politica_vigente(), app.psy_politica_inmutable(), app.psy_recordatorio_inmutable() from public, anon, authenticated;
-- La política de seguridad de los recordatorios llama a esta función con la cuenta que lee, así que sí debe poder ejecutarla
revoke execute on function app.puede_leer_recordatorios_psy() from public, anon;
grant execute on function app.puede_leer_recordatorios_psy() to authenticated;

commit;
