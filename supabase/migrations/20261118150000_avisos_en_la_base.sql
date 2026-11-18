-- =====================================================================================================================
-- 0026 · Avisos de la campana en la base (Lote 11A)
-- ---------------------------------------------------------------------------------------------------------------------
-- Hasta ahora los avisos vivían en el navegador de cada cuenta: lo que disparaba una cuenta no le llegaba a otra (y una cuenta común no puede leer las
-- cuentas, roles ni funciones de las demás, así que el navegador tampoco podía calcular quién debía recibirlo). Esta migración los pasa a la base:
--   · `aviso_eventos`: las reglas de cada evento (a quién le llega, por función y sede; respaldo; y qué funciones pueden emitirlo). Es configuración **generada
--     desde el registro de funciones** del sistema (`EVENTS` + `emits`): se carga con `supabase/seed/avisos_eventos.sql` y se vuelve a cargar si cambia un evento.
--   · `avisos`: qué pasó y dónde (el evento, la sede de destino, de origen o del asunto, quién lo pidió, lo que nombra). **NO guarda a quién llega**: el destinatario
--     se calcula al leer, con las cuentas activas, las funciones de su rol y las sedes que alcanzan (lo mismo que `utils/notifications.ts`, ahora dentro de la
--     base): crear una cuenta con la función correcta en una sede hace que empiece a ver los avisos que ya iban hacia esa sede. Si nadie cumple la regla, le llega
--     a quien tenga «Recibir los avisos que nadie más puede recibir»; el Superusuario ve todos (soporte). **Solo se agregan** (no se modifican ni se borran).
--   · `avisos_lecturas`: qué avisos ya leyó cada cuenta (cada una marca los suyos). Solo se agregan.
--   · Nadie escribe estas tablas directo: solo las funciones `emitir_aviso` (pide alguna de las funciones que emiten ese aviso, comprueba que se alcance al menos una
--     de las sedes del aviso y deja quién lo emitió: el nombre sale de la cuenta, no de la pantalla; con una clave opcional que evita repetir el mismo aviso),
--     `marcar_avisos_leidos` y `mis_avisos` (lo que le corresponde a la cuenta, con su marca de leído y si le llega por respaldo). Se lee con la función de ver la
--     bandeja de avisos (`sis-avisos:view` y sus dos funciones hermanas; la lista se compara con el registro en `check-notices-db.ts`).
--   · Las alertas por regla (cuotas vencidas, stock bajo el mínimo, contratos por vencer…) NO se guardan: se siguen calculando al mostrar.
-- Los errores de negocio usan el código EN001: el sistema muestra su texto tal cual (está en español).
-- Después de esta migración hay que cargar `supabase/seed/avisos_eventos.sql` (sin él no hay eventos y ningún aviso se puede emitir).
-- Para deshacer: supabase/deshacer/20261118150000_avisos_en_la_base.down.sql
-- =====================================================================================================================

begin;

-- ---------------------------------------------------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------------------------------------------------

create table public.aviso_eventos (
  id            text primary key check (id ~ '^[a-z][a-z0-9_]*$'),
  etiqueta      text not null,
  disparo       text not null check (disparo in ('accion', 'sistema')),
  -- [{ "capability": "log-recepciones:confirm", "where": "destination-branch" }, { "person": "requester" }, …]
  destinatarios jsonb not null check (jsonb_typeof(destinatarios) = 'array'),
  respaldo      text not null,
  -- Las funciones que, según el registro, emiten este aviso: quien lo emite debe tener alguna
  emiten        text[] not null default '{}'
);
comment on table public.aviso_eventos is 'Reglas de destinatario de cada evento de aviso, generadas desde el registro de funciones (supabase/seed/avisos_eventos.sql). `where`: destination-branch / origin-branch / subject-branch (la sede del aviso) o any (cualquier sede).';

create table public.avisos (
  id                 text primary key check (id ~ '^AVI-[0-9]{6,}$'),
  evento             text references public.aviso_eventos (id) on delete restrict,
  titulo             text not null check (length(btrim(titulo)) between 3 and 120),
  mensaje            text not null check (length(btrim(mensaje)) between 3 and 800),
  tipo               text not null check (tipo in ('info', 'success', 'warning', 'danger')),
  -- Dónde ocurrió: una sede (FIL-NNN) o el almacén (ALM-NNN)
  destino_id         text check (destino_id ~ '^[A-Z]{3}-[0-9]{3,}$'),
  origen_id          text check (origen_id ~ '^[A-Z]{3}-[0-9]{3,}$'),
  asunto_id          text check (asunto_id ~ '^[A-Z]{3}-[0-9]{3,}$'),
  solicitante_id     uuid references public.cuentas (id) on delete restrict,
  solicitante_nombre text check (solicitante_nombre is null or length(btrim(solicitante_nombre)) between 1 and 120),
  referencia         text check (referencia is null or length(btrim(referencia)) between 1 and 60),
  clave              text check (clave is null or length(btrim(clave)) between 1 and 120),
  creado_en          timestamptz not null default now(),
  creado_por         uuid references public.cuentas (id) on delete restrict,
  creado_por_nombre  text not null
);
-- Un mismo aviso con la misma clave (por ejemplo, el de «sin stock» de una matrícula en un día) se emite una sola vez
create unique index avisos_clave_uq on public.avisos (evento, clave) where clave is not null;
create index avisos_creado_idx on public.avisos (creado_en desc);
comment on table public.avisos is 'Avisos de la campana: qué pasó y dónde. NO guardan a quién llegan (se calcula al leer con las funciones y sedes de cada cuenta). Solo se agregan.';

create table public.avisos_lecturas (
  aviso_id  text not null references public.avisos (id) on delete restrict,
  cuenta_id uuid not null references public.cuentas (id) on delete restrict,
  leido_en  timestamptz not null default now(),
  primary key (aviso_id, cuenta_id)
);
create index avisos_lecturas_cuenta_idx on public.avisos_lecturas (cuenta_id);
comment on table public.avisos_lecturas is 'Qué avisos ya leyó cada cuenta. Solo se agregan.';

-- ---------------------------------------------------------------------------------------------------------------------
-- Lo que no se cambia ni se borra
-- ---------------------------------------------------------------------------------------------------------------------

create function app.aviso_inmutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Un aviso no se modifica ni se borra.' using errcode = 'EN001';
end;
$$;
create trigger avisos_no_cambian before update or delete on public.avisos for each row execute function app.aviso_inmutable();
create trigger avisos_no_vaciar  before truncate on public.avisos for each statement execute function app.aviso_inmutable();

create function app.aviso_lectura_inmutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'La marca de leído de un aviso no se modifica ni se borra.' using errcode = 'EN001';
end;
$$;
create trigger avisos_lecturas_no_cambian before update or delete on public.avisos_lecturas for each row execute function app.aviso_lectura_inmutable();
create trigger avisos_lecturas_no_vaciar  before truncate on public.avisos_lecturas for each statement execute function app.aviso_lectura_inmutable();

-- ---------------------------------------------------------------------------------------------------------------------
-- Quién ve qué (check-notices-db.ts compara esta lista con el registro)
-- ---------------------------------------------------------------------------------------------------------------------

create function app.puede_leer_avisos() returns boolean
language sql stable security definer set search_path = '' as $$
  select app.tiene_alguna(array['sis-avisos:view', 'sis-avisos:supervise', 'sis-avisos:fallback']);
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- A quién le llega un aviso (la misma regla que `resolveRecipients` de utils/notifications.ts, pero con TODAS las cuentas)
-- ---------------------------------------------------------------------------------------------------------------------

-- ¿Alcanza esa cuenta ese lugar? Una sede: la tiene asignada o alcanza todas (por su rol o por estar marcada «Todas»). El almacén: solo quien lo tiene asignado
-- (ver todas las sedes no es trabajar en el almacén).
create function app.aviso_alcanza(p_cuenta uuid, p_lugar text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when p_lugar like 'ALM-%' then exists (select 1 from public.cuenta_almacenes ca where ca.cuenta_id = p_cuenta and ca.almacen_id = p_lugar)
    else exists (select 1 from public.cuenta_sedes cs where cs.cuenta_id = p_cuenta and cs.sede_id = p_lugar)
      or exists (select 1 from public.cuentas c where c.id = p_cuenta and c.todas_las_sedes)
      or exists (
        select 1 from public.cuentas c join public.rol_funciones rf on rf.rol_id = c.rol_id
        where c.id = p_cuenta and rf.funcion_id = 'org-alcance:all_branches'
      )
  end;
$$;

-- Las cuentas a las que les llega el aviso. Cuentas activas con rol activo, sin el Superusuario (rol técnico: no cuenta como destinatario). Una regla con función
-- y sede llega a quien tiene la función y alcanza esa sede (si el aviso no trae la sede que la regla pide, a todos los que tienen la función); `requester` llega a
-- quien pidió (por su cuenta o, si solo se guardó su nombre, por su nombre). Si nadie cumple ninguna regla, llega a quien tenga la función de respaldo
-- (`via_respaldo`).
create function app.aviso_destinatarios(p_evento text, p_destino text, p_origen text, p_asunto text, p_solicitante uuid, p_solicitante_nombre text)
returns table (cuenta uuid, via_respaldo boolean)
language sql stable security definer set search_path = '' as $$
  with ev as (
    select e.destinatarios, e.respaldo from public.aviso_eventos e where e.id = p_evento
  ),
  titulares as (
    select c.id, c.nombre, c.rol_id
    from public.cuentas c join public.roles r on r.id = c.rol_id
    where c.estado = 'Activo' and r.estado = 'Activo' and not r.es_sistema
  ),
  reglas as (
    select d.regla,
           nullif(case d.regla->>'where' when 'destination-branch' then p_destino when 'origin-branch' then p_origen when 'subject-branch' then p_asunto else null end, '') as lugar
    from ev, jsonb_array_elements(ev.destinatarios) as d(regla)
  ),
  directos as (
    select t.id
    from titulares t join reglas g on g.regla->>'capability' is not null
    where exists (select 1 from public.rol_funciones rf where rf.rol_id = t.rol_id and rf.funcion_id = g.regla->>'capability')
      and (g.lugar is null or app.aviso_alcanza(t.id, g.lugar))
    union
    select t.id
    from titulares t join reglas g on g.regla->>'person' = 'requester'
    where (p_solicitante is not null and t.id = p_solicitante)
       or (p_solicitante is null and nullif(btrim(coalesce(p_solicitante_nombre, '')), '') is not null and t.nombre = p_solicitante_nombre)
  )
  select d.id, false from directos d
  union all
  select t.id, true
  from titulares t cross join ev
  where not exists (select 1 from directos)
    and exists (select 1 from public.rol_funciones rf where rf.rol_id = t.rol_id and rf.funcion_id = ev.respaldo);
$$;

-- ¿Le corresponde este aviso a la cuenta que lee? Con la función de ver avisos y, si el aviso tiene evento, siendo destinatario o Superusuario (soporte).
-- Un aviso sin evento (general) lo ve todo el que pueda leer avisos.
create function app.aviso_es_para_mi(p_evento text, p_destino text, p_origen text, p_asunto text, p_solicitante uuid, p_solicitante_nombre text) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.puede_leer_avisos() and (
    p_evento is null
    or app.es_superusuario()
    or exists (select 1 from app.aviso_destinatarios(p_evento, p_destino, p_origen, p_asunto, p_solicitante, p_solicitante_nombre) d where d.cuenta = auth.uid())
  );
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Leer los avisos de la cuenta
-- ---------------------------------------------------------------------------------------------------------------------

create function public.mis_avisos(p_dias integer default 60)
returns table (
  id text, evento text, titulo text, mensaje text, tipo text, destino_id text, origen_id text, asunto_id text, solicitante_id uuid, solicitante_nombre text,
  referencia text, creado_en timestamptz, creado_por_nombre text, leido boolean, via_respaldo boolean
)
language sql stable security definer set search_path = '' as $$
  select a.id, a.evento, a.titulo, a.mensaje, a.tipo, a.destino_id, a.origen_id, a.asunto_id, a.solicitante_id, a.solicitante_nombre,
         a.referencia, a.creado_en, a.creado_por_nombre,
         exists (select 1 from public.avisos_lecturas l where l.aviso_id = a.id and l.cuenta_id = auth.uid()) as leido,
         coalesce((
           select d.via_respaldo
           from app.aviso_destinatarios(a.evento, a.destino_id, a.origen_id, a.asunto_id, a.solicitante_id, a.solicitante_nombre) d
           where d.cuenta = auth.uid()
         ), false) as via_respaldo
  from public.avisos a
  where app.acceso_vigente()
    and a.creado_en >= now() - make_interval(days => greatest(1, least(coalesce(p_dias, 60), 365)))
    and app.aviso_es_para_mi(a.evento, a.destino_id, a.origen_id, a.asunto_id, a.solicitante_id, a.solicitante_nombre)
  order by a.creado_en desc, a.id desc
  limit 300;
$$;
comment on function public.mis_avisos(integer) is 'Los avisos de los últimos días (60 por defecto, hasta 365; máximo 300) que le corresponden a la cuenta, con su marca de leído y si le llegan por respaldo.';

-- ---------------------------------------------------------------------------------------------------------------------
-- Emitir un aviso
-- ---------------------------------------------------------------------------------------------------------------------

-- p_alcance: { "destino": "FIL-001", "origen": "ALM-001", "asunto": "FIL-002", "solicitante": "<uuid de la cuenta>", "solicitante_nombre": "…" } (todo opcional)
create function public.emitir_aviso(
  p_evento text, p_titulo text, p_mensaje text, p_tipo text, p_alcance jsonb default '{}'::jsonb, p_referencia text default null, p_clave text default null
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_ev       public.aviso_eventos;
  v_alc      jsonb := case when p_alcance is not null and jsonb_typeof(p_alcance) = 'object' then p_alcance else '{}'::jsonb end;
  v_destino  text := nullif(btrim(coalesce(v_alc->>'destino', '')), '');
  v_origen   text := nullif(btrim(coalesce(v_alc->>'origen', '')), '');
  v_asunto   text := nullif(btrim(coalesce(v_alc->>'asunto', '')), '');
  v_solic    uuid;
  v_solic_n  text := nullif(btrim(coalesce(v_alc->>'solicitante_nombre', '')), '');
  v_titulo   text := btrim(coalesce(p_titulo, ''));
  v_mensaje  text := btrim(coalesce(p_mensaje, ''));
  v_ref      text := nullif(btrim(coalesce(p_referencia, '')), '');
  v_clave    text := nullif(btrim(coalesce(p_clave, '')), '');
  v_lugar    text;
  v_alcanza  boolean := false;
  v_hay      boolean := false;
  v_n        integer;
  v_id       text;
begin
  if not app.acceso_vigente() then raise exception 'Su cuenta no puede emitir avisos.' using errcode = 'EN001'; end if;
  select * into v_ev from public.aviso_eventos e where e.id = p_evento;
  if not found or v_ev.disparo <> 'accion' then
    raise exception 'Ese aviso no existe o no se emite desde una acción.' using errcode = 'EN001';
  end if;
  -- Solo quien puede hacer lo que causa el aviso lo emite (las funciones que lo emiten salen del registro del sistema)
  perform app.exigir_alguna(v_ev.emiten, 'Su rol no puede emitir ese aviso.');

  if length(v_titulo) < 3 or length(v_titulo) > 120 then raise exception 'El título del aviso debe tener entre 3 y 120 letras.' using errcode = 'EN001'; end if;
  if length(v_mensaje) < 3 or length(v_mensaje) > 800 then raise exception 'El mensaje del aviso debe tener entre 3 y 800 letras.' using errcode = 'EN001'; end if;
  if p_tipo is null or p_tipo not in ('info', 'success', 'warning', 'danger') then raise exception 'El tipo del aviso no es válido.' using errcode = 'EN001'; end if;

  -- Quién lo pidió (si se indica por cuenta, esa cuenta debe existir)
  begin
    v_solic := nullif(btrim(coalesce(v_alc->>'solicitante', '')), '')::uuid;
  exception when invalid_text_representation then
    raise exception 'La cuenta de quien pidió el aviso no es válida.' using errcode = 'EN001';
  end;
  if v_solic is not null and not exists (select 1 from public.cuentas c where c.id = v_solic) then
    raise exception 'La cuenta de quien pidió el aviso no existe.' using errcode = 'EN001';
  end if;

  -- Los lugares del aviso existen y quien lo emite alcanza al menos uno (no se emiten avisos de sedes ajenas)
  foreach v_lugar in array array[v_destino, v_origen, v_asunto] loop
    continue when v_lugar is null;
    v_hay := true;
    if v_lugar like 'ALM-%' then
      if not exists (select 1 from public.almacenes a where a.id = v_lugar) then raise exception 'El almacén del aviso no existe.' using errcode = 'EN001'; end if;
      v_alcanza := v_alcanza or app.ve_almacen_lectura(v_lugar);
    else
      if not exists (select 1 from public.sedes s where s.id = v_lugar) then raise exception 'La sede del aviso no existe.' using errcode = 'EN001'; end if;
      v_alcanza := v_alcanza or app.ve_sede(v_lugar);
    end if;
  end loop;
  if v_hay and not v_alcanza then
    raise exception 'No puede emitir avisos de una sede que su cuenta no alcanza.' using errcode = 'EN001';
  end if;

  -- Un candado: dos personas a la vez no repiten el aviso ni reciben el mismo código
  perform pg_advisory_xact_lock(hashtextextended('ensil:codigo:AVI|', 0));
  if v_clave is not null and exists (select 1 from public.avisos a where a.evento = p_evento and a.clave = v_clave) then
    raise exception 'Este aviso ya se envió.' using errcode = 'EN001';
  end if;
  select coalesce(max(substring(a.id from '^AVI-([0-9]+)$')::integer), 0) + 1 into v_n from public.avisos a;
  v_id := 'AVI-' || app.numero_con_relleno(v_n, 6);
  insert into public.avisos (id, evento, titulo, mensaje, tipo, destino_id, origen_id, asunto_id, solicitante_id, solicitante_nombre, referencia, clave, creado_por, creado_por_nombre)
  values (v_id, p_evento, v_titulo, v_mensaje, p_tipo, v_destino, v_origen, v_asunto, v_solic, v_solic_n, v_ref, v_clave, auth.uid(), app.quien(null));
  return v_id;
end;
$$;
comment on function public.emitir_aviso(text, text, text, text, jsonb, text, text) is 'Emite un aviso de un evento que se dispara desde una acción (quien lo emite debe tener alguna de las funciones que lo causan y alcanzar alguna de sus sedes) y devuelve su código AVI-NNNNNN. Con una clave, el mismo aviso no se emite dos veces.';

-- ---------------------------------------------------------------------------------------------------------------------
-- Marcar avisos como leídos (por la cuenta que llama, y solo los que le corresponden)
-- ---------------------------------------------------------------------------------------------------------------------

create function public.marcar_avisos_leidos(p_ids text[]) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_n integer;
begin
  if not app.acceso_vigente() then raise exception 'Su cuenta no puede leer avisos.' using errcode = 'EN001'; end if;
  if p_ids is null or cardinality(p_ids) = 0 then return 0; end if;
  if cardinality(p_ids) > 500 then raise exception 'Son demasiados avisos a la vez.' using errcode = 'EN001'; end if;
  insert into public.avisos_lecturas (aviso_id, cuenta_id)
  select a.id, auth.uid()
  from public.avisos a
  where a.id = any (p_ids) and app.aviso_es_para_mi(a.evento, a.destino_id, a.origen_id, a.asunto_id, a.solicitante_id, a.solicitante_nombre)
  on conflict do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
comment on function public.marcar_avisos_leidos(text[]) is 'Marca como leídos, por la cuenta que llama, los avisos indicados que le corresponden. Devuelve cuántos eran nuevos.';

-- ---------------------------------------------------------------------------------------------------------------------
-- Permisos de tabla y RLS: solo se lee; todo lo que cambia pasa por las funciones de arriba
-- ---------------------------------------------------------------------------------------------------------------------

revoke all on public.aviso_eventos, public.avisos, public.avisos_lecturas from public, anon, authenticated;
grant select on public.aviso_eventos, public.avisos, public.avisos_lecturas to authenticated;

alter table public.aviso_eventos  enable row level security;
alter table public.avisos         enable row level security;
alter table public.avisos_lecturas enable row level security;

create policy aviso_eventos_leer on public.aviso_eventos for select to authenticated using ((select app.acceso_vigente()));
create policy avisos_leer on public.avisos for select to authenticated
  using (app.aviso_es_para_mi(evento, destino_id, origen_id, asunto_id, solicitante_id, solicitante_nombre));
create policy avisos_lecturas_leer on public.avisos_lecturas for select to authenticated using (cuenta_id = (select auth.uid()));

-- Las funciones públicas son de las cuentas con sesión
revoke execute on function public.mis_avisos(integer), public.emitir_aviso(text, text, text, text, jsonb, text, text), public.marcar_avisos_leidos(text[]) from public, anon;
grant execute on function public.mis_avisos(integer), public.emitir_aviso(text, text, text, text, jsonb, text, text), public.marcar_avisos_leidos(text[]) to authenticated;

-- Lo interno no se llama de fuera (las funciones públicas corren con los permisos del dueño). No se toca ningún otro permiso del esquema `app`.
revoke execute on function app.aviso_inmutable(), app.aviso_lectura_inmutable(), app.aviso_alcanza(uuid, text), app.aviso_destinatarios(text, text, text, text, uuid, text) from public, anon, authenticated;
-- La política de seguridad de los avisos llama a estas funciones con la cuenta que lee, así que sí deben poder ejecutarlas
revoke execute on function app.puede_leer_avisos(), app.aviso_es_para_mi(text, text, text, text, uuid, text) from public, anon;
grant execute on function app.puede_leer_avisos(), app.aviso_es_para_mi(text, text, text, text, uuid, text) to authenticated;

commit;
