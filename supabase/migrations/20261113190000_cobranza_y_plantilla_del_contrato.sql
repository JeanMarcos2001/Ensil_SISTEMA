-- =====================================================================================================================
-- 0021 · Política de cobranza, recordatorios registrados y plantilla del contrato (Lote 9C)
-- ---------------------------------------------------------------------------------------------------------------------
-- Pasa a la base lo que seguía en memoria de la cobranza y de los documentos de la matrícula:
--   · `cobranza_politicas`: la política de cobranza **del grupo** (días de gracia, tasa de mora mensual y cuándo se recuerda cada cuota). UNA para todo
--     el grupo (decisión del usuario, 2026-11-13). **Solo se agregan versiones**: cambiarla guarda una versión nueva con quién y cuándo (el historial es
--     la propia tabla); la vigente es la de número más alto. Sin ninguna fila valen los valores de partida (3 días de gracia, 0 % de mora, recordar 3 y 0
--     días antes y 1, 7, 15 y 30 después), que es lo que mostraba el sistema.
--   · `recordatorios_cobranza`: cada recordatorio de una cuota que se envió u omitió (canal, resultado y, si se omite, el motivo). Se ven por sede.
--     **Solo se agregan**; un mismo recordatorio (plan + cuota + etapa) no se puede registrar dos veces, ni siquiera dos personas a la vez. El sistema
--     no envía mensajes: prepara el texto, abre WhatsApp y deja aquí el registro. El código `REC-NNN` lo asigna la base.
--   · `plantilla_contrato_versiones`: el texto del contrato de servicios educativos con TODAS sus versiones (la vigente es la más alta). El texto de una
--     versión no se cambia nunca; lo único que se anota después es si el área legal la revisó. **Cada contrato conserva la versión con la que se generó**
--     (el contrato guarda su `templateVersion`): editar la plantilla solo afecta a los contratos nuevos.
--   · **La base vigila la mora**: `aplicar_cambios_matricula` pasa a ser una envoltura más; en la acción `mora` comprueba, antes de guardar, que lo que
--     se cobra no pase de lo que corresponde según la política vigente (el cliente calcula; la base vuelve a calcular con la política guardada).
--   · Nadie escribe estas tablas directo: solo las funciones `guardar_politica_cobranza`, `registrar_recordatorio` y `guardar_plantilla_contrato`, que
--     piden la función del registro (`op-cobranza:config`, `op-cobranza:remind`, `cfg-plantillas:edit`), vuelven a validar y dejan quién y cuándo
--     (el nombre sale de la cuenta, no de la pantalla). La política y la plantilla las lee cualquier cuenta vigente; los recordatorios, quien ve la cartera
--     (`op-cobranza:view`) y de su sede (comparado con el registro en `check-collection-db.ts`).
-- Los errores de negocio usan el código EN001: el sistema muestra su texto tal cual (está en español).
-- No hay carga de partida: sin filas, el sistema usa los valores de partida (política y texto modelo del contrato) y la primera vez que se guarda nace la
-- versión 1.
-- Para deshacer: supabase/deshacer/20261113190000_cobranza_y_plantilla_del_contrato.down.sql
-- =====================================================================================================================

begin;

-- ---------------------------------------------------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------------------------------------------------

create table public.cobranza_politicas (
  version          integer primary key check (version >= 1),
  dias_gracia      integer not null check (dias_gracia between 0 and 60),
  tasa_mora        numeric(6,4) not null check (tasa_mora between 0 and 0.1),
  recordar_antes   integer[] not null,
  recordar_despues integer[] not null,
  creada_en        timestamptz not null default now(),
  creada_por       text not null,
  check (cardinality(recordar_antes) + cardinality(recordar_despues) >= 1)
);
comment on table public.cobranza_politicas is 'Política de cobranza del grupo, por versiones (solo se agregan). La vigente es la de número más alto; sin filas valen los valores de partida. `tasa_mora` es la tasa MENSUAL como fracción (0.02 = 2 %).';

create table public.recordatorios_cobranza (
  id             text primary key check (id ~ '^REC-[0-9]{3,}$'),
  plan_id        text not null references public.planes (id) on delete restrict,
  cuota_id       text not null,
  desfase        integer not null check (desfase between -30 and 180),
  clave          text generated always as (plan_id || ':' || cuota_id || ':' || desfase::text) stored,
  sede_id        text not null references public.sedes (id) on delete restrict,
  registrado_en  timestamptz not null default now(),
  registrado_por text not null,
  canal          text not null check (canal in ('WhatsApp', 'Correo', 'Llamada', 'Otro')),
  resultado      text not null check (resultado in ('Enviado', 'Omitido')),
  nota           text,
  check (resultado = 'Enviado' or length(btrim(coalesce(nota, ''))) >= 5)
);
-- Un mismo recordatorio (plan + cuota + etapa) se registra una sola vez, en cualquier sede
create unique index recordatorios_clave_uq on public.recordatorios_cobranza (clave);
create index recordatorios_sede_idx on public.recordatorios_cobranza (sede_id, registrado_en desc);
comment on table public.recordatorios_cobranza is 'Recordatorios de cobro enviados u omitidos. Solo se agregan. `desfase` = días respecto del vencimiento de la etapa (−3 = tres antes; 0 = el día; 7 = siete después). La sede es la de la matrícula al registrarlo.';

create table public.plantilla_contrato_versiones (
  version       integer primary key check (version >= 1),
  introduccion  text not null check (length(btrim(introduccion)) >= 20),
  clausulas     jsonb not null check (jsonb_typeof(clausulas) = 'array' and jsonb_array_length(clausulas) >= 1),
  cierre        text not null default '',
  revisada      boolean not null default false,
  revisada_por  text,
  revisada_en   timestamptz,
  creada_en     timestamptz not null default now(),
  creada_por    text not null,
  check (revisada = (revisada_en is not null))
);
comment on table public.plantilla_contrato_versiones is 'Texto del contrato de servicios educativos, por versiones. El texto de una versión no cambia; solo se anota si el área legal la revisó. `clausulas` = [{ id, title, body }].';

-- ---------------------------------------------------------------------------------------------------------------------
-- Lo que no se cambia ni se borra
-- ---------------------------------------------------------------------------------------------------------------------

create function app.politica_inmutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Una política de cobranza no se modifica ni se borra: un cambio se guarda como una versión nueva.' using errcode = 'EN001';
end;
$$;
create trigger politicas_no_cambian before update or delete on public.cobranza_politicas for each row execute function app.politica_inmutable();
create trigger politicas_no_vaciar  before truncate on public.cobranza_politicas for each statement execute function app.politica_inmutable();

create function app.recordatorio_inmutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Un recordatorio registrado no se modifica ni se borra.' using errcode = 'EN001';
end;
$$;
create trigger recordatorios_no_cambian before update or delete on public.recordatorios_cobranza for each row execute function app.recordatorio_inmutable();
create trigger recordatorios_no_vaciar  before truncate on public.recordatorios_cobranza for each statement execute function app.recordatorio_inmutable();

-- De una versión de la plantilla solo cambia la marca de «revisada por el área legal»
create function app.plantilla_inmutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'TRUNCATE' or tg_op = 'DELETE' then
    raise exception 'Una versión de la plantilla del contrato no se borra: los contratos ya generados la conservan.' using errcode = 'EN001';
  end if;
  if (to_jsonb(old) - 'revisada' - 'revisada_por' - 'revisada_en') is distinct from (to_jsonb(new) - 'revisada' - 'revisada_por' - 'revisada_en') then
    raise exception 'El texto de una versión de la plantilla no se modifica: un cambio se guarda como una versión nueva.' using errcode = 'EN001';
  end if;
  return new;
end;
$$;
create trigger plantilla_no_cambia before update or delete on public.plantilla_contrato_versiones for each row execute function app.plantilla_inmutable();
create trigger plantilla_no_vaciar before truncate on public.plantilla_contrato_versiones for each statement execute function app.plantilla_inmutable();

-- ---------------------------------------------------------------------------------------------------------------------
-- La política vigente (o la de partida si nunca se guardó una)
-- ---------------------------------------------------------------------------------------------------------------------

create function app.politica_cobranza_vigente()
returns table (version integer, dias_gracia integer, tasa_mora numeric, recordar_antes integer[], recordar_despues integer[])
language sql stable security definer set search_path = '' as $$
  (select p.version, p.dias_gracia, p.tasa_mora, p.recordar_antes, p.recordar_despues from public.cobranza_politicas p order by p.version desc limit 1)
  union all
  select 0, 3, 0::numeric, array[3, 0], array[1, 7, 15, 30] where not exists (select 1 from public.cobranza_politicas);
$$;
comment on function app.politica_cobranza_vigente() is 'La política de cobranza vigente; sin ninguna guardada, la de partida (versión 0: 3 días de gracia, 0 % de mora, recordar 3 y 0 días antes y 1, 7, 15 y 30 después).';

-- ---------------------------------------------------------------------------------------------------------------------
-- Guardar la política de cobranza
-- ---------------------------------------------------------------------------------------------------------------------

create function public.guardar_politica_cobranza(p_dias_gracia integer, p_tasa_mora numeric, p_antes integer[], p_despues integer[]) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_antes   integer[];
  v_despues integer[];
  v_vig     record;
  v_version integer;
begin
  perform app.exigir('op-cobranza:config', 'Configurar políticas de cobranza');
  if p_dias_gracia is null or p_dias_gracia < 0 or p_dias_gracia > 60 then
    raise exception 'Los días de gracia deben ser un número entero entre 0 y 60.' using errcode = 'EN001';
  end if;
  if p_tasa_mora is null or p_tasa_mora < 0 or p_tasa_mora > 0.1 or round(p_tasa_mora, 4) <> p_tasa_mora then
    raise exception 'La tasa de mora mensual debe estar entre 0 %% y 10 %% (con hasta dos decimales).' using errcode = 'EN001';
  end if;
  v_antes   := array(select distinct x from unnest(coalesce(p_antes, '{}'::integer[])) x order by x desc);
  v_despues := array(select distinct x from unnest(coalesce(p_despues, '{}'::integer[])) x order by x);
  if exists (select 1 from unnest(v_antes) x where x is null or x < 0 or x > 30) then
    raise exception 'Los días previos deben ser enteros entre 0 y 30 (0 = el día del vencimiento).' using errcode = 'EN001';
  end if;
  if exists (select 1 from unnest(v_despues) x where x is null or x < 1 or x > 180) then
    raise exception 'Los días posteriores deben ser enteros entre 1 y 180.' using errcode = 'EN001';
  end if;
  if cardinality(v_antes) + cardinality(v_despues) = 0 then
    raise exception 'Defina al menos un día de recordatorio.' using errcode = 'EN001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ensil:cobranza_politicas', 0));
  select * into v_vig from app.politica_cobranza_vigente();
  -- Sin cambios no se agrega una versión (la de partida, versión 0, no cuenta: guardarla por primera vez crea la 1)
  if v_vig.version > 0 and v_vig.dias_gracia = p_dias_gracia and v_vig.tasa_mora = p_tasa_mora
     and v_vig.recordar_antes = v_antes and v_vig.recordar_despues = v_despues then
    return v_vig.version;
  end if;
  v_version := v_vig.version + 1;
  insert into public.cobranza_politicas (version, dias_gracia, tasa_mora, recordar_antes, recordar_despues, creada_por)
  values (v_version, p_dias_gracia, p_tasa_mora, v_antes, v_despues, app.quien(null));
  return v_version;
end;
$$;
comment on function public.guardar_politica_cobranza(integer, numeric, integer[], integer[]) is 'Guarda la política de cobranza del grupo como una versión nueva (si cambió) y devuelve el número de la vigente.';

-- ---------------------------------------------------------------------------------------------------------------------
-- Registrar un recordatorio de cobro (enviado u omitido)
-- ---------------------------------------------------------------------------------------------------------------------

create function public.registrar_recordatorio(p_plan text, p_cuota text, p_desfase integer, p_canal text, p_resultado text, p_nota text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_sede    text;
  v_cuota   public.cuotas;
  v_pol     record;
  v_etapas  integer[];
  v_nota    text := btrim(coalesce(p_nota, ''));
  v_clave   text;
  v_n       integer;
  v_id      text;
begin
  perform app.exigir('op-cobranza:remind', 'Enviar recordatorios');
  select m.sede_id into v_sede from public.planes pl join public.matriculas m on m.id = pl.matricula_id where pl.id = p_plan;
  if v_sede is null then raise exception 'No se encontró el plan de pagos.' using errcode = 'EN001'; end if;
  perform app.exigir_sede(v_sede, 'recordatorios de cobranza');
  select * into v_cuota from public.cuotas c where c.plan_id = p_plan and c.id = p_cuota;
  if not found then raise exception 'No se encontró la cuota.' using errcode = 'EN001'; end if;
  if v_cuota.estado in ('Anulada', 'Refinanciada') or v_cuota.saldo <= 0 then
    raise exception 'La cuota ya no tiene saldo por cobrar: no hace falta recordarla.' using errcode = 'EN001';
  end if;
  if p_canal is null or p_canal not in ('WhatsApp', 'Correo', 'Llamada', 'Otro') then raise exception 'Seleccione el canal.' using errcode = 'EN001'; end if;
  if p_resultado is null or p_resultado not in ('Enviado', 'Omitido') then raise exception 'Indique si se envió o se omitió.' using errcode = 'EN001'; end if;
  if p_resultado = 'Omitido' and length(v_nota) < 5 then raise exception 'Explique por qué se omite el recordatorio.' using errcode = 'EN001'; end if;

  -- La etapa debe ser una de la política vigente (si la política cambió mientras tanto, la pantalla debe actualizarse)
  select * into v_pol from app.politica_cobranza_vigente();
  v_etapas := array(select -x from unnest(v_pol.recordar_antes) x where x > 0)
              || case when 0 = any (v_pol.recordar_antes) then array[0] else array[]::integer[] end
              || v_pol.recordar_despues;
  if p_desfase is null or not (p_desfase = any (v_etapas)) then
    raise exception 'Esa etapa de recordatorio ya no está en la política de cobranza: actualice la página.' using errcode = 'EN001';
  end if;

  -- Un candado: dos personas a la vez no registran el mismo recordatorio ni reciben el mismo código
  perform pg_advisory_xact_lock(hashtextextended('ensil:codigo:REC|', 0));
  v_clave := p_plan || ':' || p_cuota || ':' || p_desfase::text;
  if exists (select 1 from public.recordatorios_cobranza r where r.clave = v_clave) then
    raise exception 'Este recordatorio ya fue registrado.' using errcode = 'EN001';
  end if;
  select coalesce(max(substring(r.id from '^REC-([0-9]+)$')::integer), 0) + 1 into v_n from public.recordatorios_cobranza r;
  v_id := 'REC-' || app.numero_con_relleno(v_n, 3);
  insert into public.recordatorios_cobranza (id, plan_id, cuota_id, desfase, sede_id, registrado_por, canal, resultado, nota)
  values (v_id, p_plan, p_cuota, p_desfase, v_sede, app.quien(null), p_canal, p_resultado, nullif(v_nota, ''));
  return v_id;
end;
$$;
comment on function public.registrar_recordatorio(text, text, integer, text, text, text) is 'Registra un recordatorio de cobro enviado u omitido (una sola vez por plan, cuota y etapa) y devuelve su código REC-NNN.';

-- ---------------------------------------------------------------------------------------------------------------------
-- Guardar la plantilla del contrato
-- ---------------------------------------------------------------------------------------------------------------------

create function public.guardar_plantilla_contrato(p_introduccion text, p_clausulas jsonb, p_cierre text, p_revisada boolean) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  -- Los campos que el contrato completa solo (los mismos de `TEMPLATE_TOKENS`; `check-collection-db.ts` los compara)
  v_campos constant text[] := array['empresa', 'ruc', 'sede', 'direccion_sede', 'ciudad', 'contratante', 'contratante_doc', 'contratante_direccion', 'calidad',
    'alumno', 'alumno_doc', 'programa', 'duracion', 'garantia', 'inicio', 'fin_base', 'fin_extension', 'horario', 'precio', 'tipo_pago', 'plan_pagos',
    'fecha_matricula', 'fecha_contrato', 'matricula'];
  v_intro   text := coalesce(p_introduccion, '');
  v_cierre  text := coalesce(p_cierre, '');
  v_claus   jsonb;
  v_c       jsonb;
  v_i       integer := 0;
  v_texto   text;
  v_campo   text;
  v_ult     public.plantilla_contrato_versiones;
  v_version integer;
begin
  perform app.exigir('cfg-plantillas:edit', 'Editar las plantillas de contrato y ficha');
  if p_revisada is null then raise exception 'Indique si el área legal revisó este texto.' using errcode = 'EN001'; end if;
  if length(btrim(v_intro)) < 20 then raise exception 'La introducción del contrato es demasiado corta.' using errcode = 'EN001'; end if;
  if jsonb_typeof(p_clausulas) is distinct from 'array' or jsonb_array_length(p_clausulas) = 0 then
    raise exception 'El contrato necesita al menos una cláusula.' using errcode = 'EN001';
  end if;
  -- Solo se guardan id, título y texto de cada cláusula (así dos guardados iguales comparan igual)
  for v_c in select * from jsonb_array_elements(p_clausulas) loop
    v_i := v_i + 1;
    if jsonb_typeof(v_c) is distinct from 'object' or length(btrim(coalesce(v_c->>'id', ''))) = 0 then
      raise exception 'La cláusula % no es válida.', v_i using errcode = 'EN001';
    end if;
    if length(btrim(coalesce(v_c->>'title', ''))) = 0 then raise exception 'La cláusula % no tiene título.', v_i using errcode = 'EN001'; end if;
    if length(btrim(coalesce(v_c->>'body', ''))) < 10 then raise exception 'La cláusula % no tiene contenido.', v_i using errcode = 'EN001'; end if;
    v_claus := coalesce(v_claus, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('id', v_c->>'id', 'title', v_c->>'title', 'body', v_c->>'body'));
  end loop;
  -- Ningún campo desconocido ({{algo}} que el contrato no sabe completar)
  v_texto := v_intro || ' ' || v_cierre || ' ' || (select string_agg(c->>'body', ' ') from jsonb_array_elements(v_claus) c);
  for v_campo in select distinct m[1] from regexp_matches(v_texto, '\{\{\s*([a-z_]+)\s*\}\}', 'g') as m loop
    if not (v_campo = any (v_campos)) then
      raise exception 'La plantilla usa un campo que no existe: {{%}}.', v_campo using errcode = 'EN001';
    end if;
  end loop;

  perform pg_advisory_xact_lock(hashtextextended('ensil:plantilla_contrato', 0));
  select * into v_ult from public.plantilla_contrato_versiones v order by v.version desc limit 1;
  if not found then
    v_version := 1;
  elsif v_ult.introduccion = v_intro and v_ult.clausulas = v_claus and v_ult.cierre = v_cierre then
    -- El texto es el mismo: solo puede cambiar la marca de «revisada» (el texto de una versión no se toca)
    if v_ult.revisada is distinct from p_revisada then
      update public.plantilla_contrato_versiones v set revisada = p_revisada,
        revisada_por = case when p_revisada then app.quien(null) else null end, revisada_en = case when p_revisada then now() else null end
      where v.version = v_ult.version;
    end if;
    return v_ult.version;
  else
    v_version := v_ult.version + 1;
  end if;
  insert into public.plantilla_contrato_versiones (version, introduccion, clausulas, cierre, revisada, revisada_por, revisada_en, creada_por)
  values (v_version, v_intro, v_claus, v_cierre, p_revisada, case when p_revisada then app.quien(null) end, case when p_revisada then now() end, app.quien(null));
  return v_version;
end;
$$;
comment on function public.guardar_plantilla_contrato(text, jsonb, text, boolean) is 'Guarda el texto del contrato: si cambió, como una versión nueva; si solo cambió la marca de revisada, la anota en la vigente. Devuelve el número de la versión vigente.';

-- ---------------------------------------------------------------------------------------------------------------------
-- La base vigila la mora: lo que se cobra no pasa de lo que corresponde según la política vigente
-- ---------------------------------------------------------------------------------------------------------------------

create function app.verificar_mora(p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_pol       record;
  v_plan      jsonb;
  v_plan_id   text;
  v_sede      text;
  v_hoy       date := app.hoy();
  v_origen_id text;
  v_nuevo     numeric;
  v_origen    public.cuotas;
  v_dias      integer;
  v_pend      numeric;
  v_cobrada   numeric;
begin
  perform app.exigir('op-cobranza:charge_mora', 'Cobrar mora');
  if jsonb_typeof(p->'planes') is distinct from 'array' then return; end if;
  select * into v_pol from app.politica_cobranza_vigente();
  for v_plan in select * from jsonb_array_elements(p->'planes') loop
    v_plan_id := v_plan->>'id';
    if jsonb_typeof(v_plan->'cuotas') is distinct from 'array' then continue; end if;
    select m.sede_id into v_sede from public.planes pl join public.matriculas m on m.id = pl.matricula_id where pl.id = v_plan_id;
    if v_sede is null then continue; end if;   -- un plan que no existe lo rechaza la función de siempre
    perform app.exigir_sede(v_sede, 'la mora');
    -- Cada grupo de cuotas de mora NUEVAS (las que antes no existían) de una misma cuota de origen
    for v_origen_id, v_nuevo in
      select c->>'mora_de', sum((c->>'monto')::numeric)
      from jsonb_array_elements(v_plan->'cuotas') c
      where coalesce((c->>'es_mora')::boolean, false) and not exists (select 1 from public.cuotas x where x.plan_id = v_plan_id and x.id = c->>'id')
      group by 1
    loop
      select * into v_origen from public.cuotas x where x.plan_id = v_plan_id and x.id = v_origen_id;
      if not found then raise exception 'No se encontró la cuota sobre la que se cobra la mora.' using errcode = 'EN001'; end if;
      if v_origen.es_mora then raise exception 'La mora no genera más mora.' using errcode = 'EN001'; end if;
      if v_origen.estado in ('Anulada', 'Refinanciada') or v_origen.saldo <= 0 then raise exception 'La cuota no tiene saldo por cobrar.' using errcode = 'EN001'; end if;
      if v_pol.tasa_mora <= 0 then
        raise exception 'La política de cobranza no cobra mora (tasa 0 %%). Defínala en Configuración → Cobranza → Política de cobranza.' using errcode = 'EN001';
      end if;
      -- Lo mismo que calcula el sistema (`moraOf`): saldo × tasa mensual × días fuera de gracia / 30, menos lo ya cobrado como mora
      v_dias := case when v_origen.vence is null or v_origen.vence >= v_hoy then 0 else v_hoy - v_origen.vence end;
      v_pend := greatest(0, round(round(v_origen.saldo * v_pol.tasa_mora * greatest(0, v_dias - v_pol.dias_gracia) / 30, 2) - round(coalesce(v_origen.mora_cobrada, 0), 2), 2));
      if v_nuevo > v_pend + 0.011 then
        raise exception 'La mora de la cuota «%» (USD %) supera lo que corresponde según la política de cobranza (USD %). Actualice la página e intente de nuevo.',
          v_origen.nombre, to_char(v_nuevo, 'FM999,990.00'), to_char(v_pend, 'FM999,990.00') using errcode = 'EN001';
      end if;
      -- Lo cobrado como mora en la cuota de origen = lo de antes + lo nuevo
      select (c->>'mora_cobrada')::numeric into v_cobrada from jsonb_array_elements(v_plan->'cuotas') c where c->>'id' = v_origen_id;
      if abs(coalesce(v_cobrada, 0) - (coalesce(v_origen.mora_cobrada, 0) + v_nuevo)) > 0.011 then
        raise exception 'Lo cobrado como mora en la cuota «%» no cuadra con las cuotas de mora.', v_origen.nombre using errcode = 'EN001';
      end if;
    end loop;
  end loop;
end;
$$;
comment on function app.verificar_mora(jsonb) is 'Antes de guardar una acción «mora»: lo que se cobra no pasa de lo que corresponde según la política de cobranza vigente (se vuelve a calcular con la política guardada).';

-- La función pública del dinero (la envoltura de la 0019, que asigna los códigos) pasa a ser interna; la pública vigila la mora y la llama
alter function public.aplicar_cambios_matricula(text, jsonb) set schema app;
alter function app.aplicar_cambios_matricula(text, jsonb) rename to aplicar_cambios_matricula_con_codigos;

create function public.aplicar_cambios_matricula(p_accion text, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if p_accion = 'mora' and jsonb_typeof(p) = 'object' then perform app.verificar_mora(p); end if;
  return app.aplicar_cambios_matricula_con_codigos(p_accion, p);
end;
$$;
comment on function public.aplicar_cambios_matricula(text, jsonb) is 'Aplica los cambios de una acción del dinero, todo o nada, y asigna los códigos de los registros nuevos. En «mora» vigila antes que lo cobrado no pase de lo que dice la política. Devuelve { ok, codigos }.';

-- ---------------------------------------------------------------------------------------------------------------------
-- Quién ve qué (check-collection-db.ts compara esta lista con el registro)
-- ---------------------------------------------------------------------------------------------------------------------

create function app.puede_leer_recordatorios() returns boolean
language sql stable security definer set search_path = '' as $$
  select app.tiene_alguna(array['op-cobranza:view']);
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Permisos de tabla y RLS: solo se lee; todo lo que cambia pasa por las funciones de arriba
-- ---------------------------------------------------------------------------------------------------------------------

revoke all on public.cobranza_politicas, public.recordatorios_cobranza, public.plantilla_contrato_versiones from public, anon, authenticated;
grant select on public.cobranza_politicas, public.recordatorios_cobranza, public.plantilla_contrato_versiones to authenticated;

alter table public.cobranza_politicas           enable row level security;
alter table public.recordatorios_cobranza       enable row level security;
alter table public.plantilla_contrato_versiones enable row level security;

create policy politicas_leer on public.cobranza_politicas for select to authenticated using ((select app.acceso_vigente()));
create policy plantilla_leer on public.plantilla_contrato_versiones for select to authenticated using ((select app.acceso_vigente()));
create policy recordatorios_leer on public.recordatorios_cobranza for select to authenticated
  using ((select app.puede_leer_recordatorios()) and (select app.ve_sede(sede_id)));

-- Las funciones públicas son de las cuentas con sesión
revoke execute on function
  public.guardar_politica_cobranza(integer, numeric, integer[], integer[]), public.registrar_recordatorio(text, text, integer, text, text, text),
  public.guardar_plantilla_contrato(text, jsonb, text, boolean), public.aplicar_cambios_matricula(text, jsonb)
  from public, anon;
grant execute on function
  public.guardar_politica_cobranza(integer, numeric, integer[], integer[]), public.registrar_recordatorio(text, text, integer, text, text, text),
  public.guardar_plantilla_contrato(text, jsonb, text, boolean), public.aplicar_cambios_matricula(text, jsonb)
  to authenticated;

-- Lo interno no se llama de fuera (las funciones públicas corren con los permisos del dueño). No se toca ningún otro permiso del esquema `app`
-- (la 0019 dejó cerrada la base del dinero y la 0020 las bases de personal).
revoke execute on function
  app.aplicar_cambios_matricula_con_codigos(text, jsonb), app.verificar_mora(jsonb), app.politica_cobranza_vigente(),
  app.politica_inmutable(), app.recordatorio_inmutable(), app.plantilla_inmutable()
  from public, anon, authenticated;
-- La política de seguridad de los recordatorios llama a esta función con la cuenta que lee, así que sí debe poder ejecutarla
revoke execute on function app.puede_leer_recordatorios() from public, anon;
grant execute on function app.puede_leer_recordatorios() to authenticated;

commit;
