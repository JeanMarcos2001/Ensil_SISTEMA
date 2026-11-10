-- =====================================================================================================================
-- 0015 · Matrículas y dinero en la base (Lote 8)
-- ---------------------------------------------------------------------------------------------------------------------
--   · `matriculas`, `planes`, `cuotas` (con lo cobrado en cada una), `pagos` (con sus partes), `movimientos_caja`, `notas_credito` y
--     `grupos_promocionales`: los hechos del dinero. Lo derivable NO se guarda: el nombre del alumno, del programa, del nivel, de la sede,
--     del asesor, del origen, del tipo de pago y del tarifario salen de sus ids al mostrar; el estado «Vencida» de una cuota, las urgencias
--     y la vigencia se calculan; el saldo y el estado del plan son el resumen que escribe `recomputePlan` (la base los vuelve a comprobar).
--   · Los códigos (MAT-AAAA-NNN, PLN-NNN, PAG-NNN, CJ-NNN, NC-NNN, PGR-NNN) siguen asignándolos las pantallas (máximo + 1); la base rechaza un
--     código repetido y pide intentar de nuevo (nunca se reparte mal: se rechaza).
--   · Principio: el cliente CALCULA (con las reglas puras de `src/utils`) y la base GUARDA Y VIGILA. Nadie escribe las tablas directo: todo pasa
--     por `aplicar_cambios_matricula(accion, cambios)`, UNA llamada atómica (todo o nada) que (1) pide la función del registro de esa acción,
--     (2) solo deja tocar las tablas que esa acción puede tocar (y si solo insertar o también cambiar), (3) comprueba que la sede sea alcanzable,
--     (4) mueve el stock cuando la acción lo pide (venta, reposición por reversa, entrega de materiales) y (5) vuelve a comprobar los
--     invariantes del dinero sobre lo que quedó.
--   · Los pagos, sus partes, los movimientos de caja y las notas de crédito SOLO SE AGREGAN: después solo cambian el estado y la constancia de
--     reversa de un pago, y el estado, la reversa y el lote de depósito de un movimiento. Un error se corrige con una reversa.
--   · Quién ve: por sede (`app.ve_sede`). También limita a los ALUMNOS y TITULARES: se ve a quien aún no tiene matrícula o la tiene en una
--     sede que se alcanza.
-- Los errores de negocio usan el código EN001: el sistema muestra su texto tal cual (está en español).
-- Para deshacer: supabase/deshacer/20261110140000_matriculas_y_dinero.down.sql
-- =====================================================================================================================

begin;

-- ---------------------------------------------------------------------------------------------------------------------
-- Huella: quién y cuándo. Con sesión, sale de la cuenta (no se puede falsear); sin sesión (el editor SQL, para cargar los datos de partida)
-- se respeta lo indicado.
-- ---------------------------------------------------------------------------------------------------------------------
create function app.huella_dinero() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is null then
      new.creado_en := coalesce(new.creado_en, now());
      new.creado_por := coalesce(nullif(btrim(coalesce(new.creado_por, '')), ''), 'Sistema');
    else
      new.creado_en := now();
      new.creado_por := app.quien(null);
    end if;
  else
    new.creado_en := old.creado_en;
    new.creado_por := old.creado_por;
  end if;
  new.actualizado_en := now();
  new.actualizado_por := app.quien(null);
  return new;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------------------------------------------------

-- Grupos promocionales: alumnos que comparten una promoción y UN único pago. `reparto` = [{ studentKey, enrollmentId, amount }].
create table public.grupos_promocionales (
  id              text primary key check (id ~ '^PGR-[0-9]{3,}$'),
  promocion_id    text not null references public.promociones (id) on delete restrict,
  moneda          text not null check (moneda in ('PEN', 'USD')),
  precio_total    numeric(12,2) not null check (precio_total >= 0),
  reparto         jsonb not null default '[]'::jsonb,
  pago_id         text,
  creado_en       timestamptz not null default now(),
  creado_por      text,
  actualizado_en  timestamptz not null default now(),
  actualizado_por text
);
comment on table public.grupos_promocionales is 'Alumnos que comparten una promoción y un único pago. Nadie escribe directo: solo aplicar_cambios_matricula.';

create table public.matriculas (
  id                      text primary key check (id ~ '^MAT-[0-9]{4}-[0-9]{3,}$'),
  fecha                   date not null,
  alumno_id               text not null references public.alumnos (id) on delete restrict,
  sede_id                 text not null references public.sedes (id) on delete restrict,
  programa_id             text not null references public.programas (id) on delete restrict,
  nivel_id                text references public.niveles (id) on delete restrict,
  asesor_id               text references public.personal (id) on delete restrict,
  origen_id               text references public.origenes_lead (id) on delete restrict,
  observacion             text,
  estado                  text not null check (estado in ('Activa', 'Caída')),
  titular_ids             text[] not null default '{}',
  tipo_pago_id            text references public.tipos_pago (id) on delete restrict,
  tarifario_id            text references public.tarifarios (id) on delete restrict,
  precio_asignado         numeric(12,2) check (precio_asignado is null or precio_asignado >= 0),
  grupo_promocional_id    text references public.grupos_promocionales (id) on delete restrict,
  verificacion_estado     text check (verificacion_estado is null or verificacion_estado in ('Pendiente', 'Verificado Incompleto', 'Verificado Completo')),
  verificacion_items      text[] not null default '{}',
  verificacion_fecha      date,
  verificador             text,
  verificacion_obs        text,
  extension_en            timestamptz,
  extension_por           text,
  caida_fecha             date,
  caida_solicitud         text,
  reactivada_en           timestamptz,
  reactivacion_solicitud  text,
  renueva_id              text references public.matriculas (id) on delete restrict,
  documentos              jsonb not null default '{}'::jsonb,
  creado_en               timestamptz not null default now(),
  creado_por              text,
  actualizado_en          timestamptz not null default now(),
  actualizado_por         text,
  check (renueva_id is null or renueva_id <> id)
);
create index matriculas_alumno_idx on public.matriculas (alumno_id);
create index matriculas_sede_idx on public.matriculas (sede_id);
comment on table public.matriculas is 'Matrículas. Nadie escribe directo: solo aplicar_cambios_matricula. El nombre del alumno, programa, nivel, sede, asesor, origen, tipo de pago y tarifario se derivan de sus ids.';
comment on column public.matriculas.documentos is 'Contrato y ficha generados: { contract?: {...}, ficha?: {...} } (número, versión, quién, cuándo, firma).';

create table public.planes (
  id              text primary key check (id ~ '^PLN-[0-9]{3,}$'),
  matricula_id    text not null unique references public.matriculas (id) on delete restrict,
  tipo            text not null default '',
  total           numeric(12,2) not null check (total >= 0),
  saldo           numeric(12,2) not null check (saldo >= 0),
  estado          text not null check (estado in ('Al día', 'Atrasado', 'Completado', 'Caída')),
  creado_en       timestamptz not null default now(),
  creado_por      text,
  actualizado_en  timestamptz not null default now(),
  actualizado_por text
);
comment on table public.planes is 'Plan de pagos de una matrícula. `saldo` y `estado` son el resumen que escribe recomputePlan; la base comprueba que el saldo sea la suma de las cuotas abiertas.';

create table public.cuotas (
  plan_id            text not null references public.planes (id) on delete cascade,
  id                 text not null,
  orden              integer not null check (orden >= 1),
  nombre             text not null,
  monto              numeric(12,2) not null check (monto >= 0),
  saldo              numeric(12,2) not null check (saldo >= 0),
  vence              date,
  estado             text not null check (estado in ('Pendiente', 'Parcial', 'Pagada', 'Vencida', 'Anulada', 'Refinanciada')),
  cobros             jsonb not null default '[]'::jsonb,
  variable           boolean not null default false,
  es_mora            boolean not null default false,
  mora_de            text,
  mora_cobrada       numeric(12,2),
  refinanciada_de    text,
  refinanciada_a     text,
  reactivada_desde   date,
  anulada_por_caida  boolean not null default false,
  condonada          boolean not null default false,
  nota               text,
  creada_en          timestamptz,
  primary key (plan_id, id),
  unique (plan_id, orden)
);
comment on table public.cuotas is 'Cuotas de un plan. `cobros` = lo cobrado en la cuota: [{ id, paymentId, date, amount, receipt }]. «Vencida» no la escribe nadie: se calcula con la fecha.';

create table public.pagos (
  id                    text primary key check (id ~ '^PAG-[0-9]{3,}$'),
  fecha                 date not null,
  alumno_nombre         text not null,
  concepto              text not null,
  monto                 numeric(12,2) not null check (monto > 0),
  medio                 text not null default '',
  comprobante           text not null default '',
  documento             jsonb,
  estado                text not null check (estado in ('Aprobado', 'Anulado')),
  reversa               jsonb,
  partes                jsonb not null default '[]'::jsonb,
  moneda                text check (moneda is null or moneda in ('PEN', 'USD')),
  grupo_promocional_id  text references public.grupos_promocionales (id) on delete restrict,
  matricula_ids         text[] not null default '{}',
  sede_id               text not null references public.sedes (id) on delete restrict,
  comentario            text,
  creado_en             timestamptz not null default now(),
  creado_por            text,
  actualizado_en        timestamptz not null default now(),
  actualizado_por       text
);
create index pagos_sede_idx on public.pagos (sede_id);
comment on table public.pagos is 'Pagos. Solo se agregan: después solo cambian el estado y la constancia de reversa. `monto` es USD; `alumno_nombre` es la constancia del nombre ese día (no se reescribe); `partes` = [{ id, currency, amount, exchangeRate, method, bank, operationNumber, evidence, note }].';

create table public.movimientos_caja (
  id              text primary key check (id ~ '^CJ-[0-9]{3,}$'),
  fecha           timestamptz not null,
  tipo            text not null check (tipo in ('Ingreso', 'Egreso')),
  concepto        text not null,
  referencia      text not null default '',
  moneda          text not null check (moneda in ('PEN', 'USD')),
  monto           numeric(12,2) not null check (monto > 0),
  tipo_cambio     numeric(10,4) check (tipo_cambio is null or tipo_cambio > 0),
  monto_usd       numeric(12,2) not null check (monto_usd >= 0),
  medio           text not null default '',
  banco           text,
  operacion       text,
  sede_id         text references public.sedes (id) on delete restrict,
  pago_id         text references public.pagos (id) on delete restrict,
  matricula_ids   text[] not null default '{}',
  estado          text not null check (estado in ('Aplicado', 'Reversado')),
  reversa         jsonb,
  lote_deposito   text,
  deposito        jsonb,
  venta           jsonb,
  creado_en       timestamptz not null default now(),
  creado_por      text,
  actualizado_en  timestamptz not null default now(),
  actualizado_por text
);
create index movimientos_caja_sede_idx on public.movimientos_caja (sede_id, fecha desc);
create index movimientos_caja_pago_idx on public.movimientos_caja (pago_id);
comment on table public.movimientos_caja is 'Movimientos de caja. Solo se agregan: después solo cambian el estado, la constancia de reversa y el lote de depósito. `deposito` = { code, bank, movementIds }; `venta` = { itemId, branchId, qty }.';

create table public.notas_credito (
  id                 text primary key check (id ~ '^NC-[0-9]{3,}$'),
  serie              text not null,
  correlativo        integer not null,
  etiqueta           text not null,
  origen             text not null check (origen in ('sistema', 'externa')),
  pago_id            text not null references public.pagos (id) on delete restrict,
  alumno_nombre      text not null default '',
  matricula_ids      text[] not null default '{}',
  tipo_original      text not null check (tipo_original in ('Boleta', 'Factura')),
  documento_original text not null default '',
  monto              numeric(12,2) not null check (monto > 0),
  moneda             text not null check (moneda in ('PEN', 'USD')),
  motivo             text not null,
  detalle            text not null default '',
  emitida_en         timestamptz not null,
  emitida_por        text not null,
  creado_en          timestamptz not null default now(),
  creado_por         text,
  actualizado_en     timestamptz not null default now(),
  actualizado_por    text
);
comment on table public.notas_credito is 'Notas de crédito. Solo se agregan.';

create trigger grupos_huella     before insert or update on public.grupos_promocionales for each row execute function app.huella_dinero();
create trigger matriculas_huella before insert or update on public.matriculas           for each row execute function app.huella_dinero();
create trigger planes_huella     before insert or update on public.planes               for each row execute function app.huella_dinero();
create trigger pagos_huella      before insert or update on public.pagos                for each row execute function app.huella_dinero();
create trigger movimientos_huella before insert or update on public.movimientos_caja    for each row execute function app.huella_dinero();
create trigger notas_huella      before insert or update on public.notas_credito        for each row execute function app.huella_dinero();

-- ---------------------------------------------------------------------------------------------------------------------
-- Lo que no se cambia ni se borra
-- ---------------------------------------------------------------------------------------------------------------------

create function app.pago_inmutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Un pago no se borra: se anula con su reversa.' using errcode = 'EN001';
  end if;
  if (to_jsonb(old) - 'estado' - 'reversa' - 'actualizado_en' - 'actualizado_por') is distinct from (to_jsonb(new) - 'estado' - 'reversa' - 'actualizado_en' - 'actualizado_por') then
    raise exception 'Un pago no se modifica: solo se anula con su reversa.' using errcode = 'EN001';
  end if;
  if old.estado = 'Anulado' and new.estado <> 'Anulado' then
    raise exception 'Un pago anulado no se reactiva.' using errcode = 'EN001';
  end if;
  return new;
end;
$$;
create trigger pagos_no_cambian before update or delete on public.pagos for each row execute function app.pago_inmutable();

create function app.movimiento_inmutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Un movimiento de caja no se borra: se reversa con su constancia.' using errcode = 'EN001';
  end if;
  if (to_jsonb(old) - 'estado' - 'reversa' - 'lote_deposito' - 'actualizado_en' - 'actualizado_por')
     is distinct from (to_jsonb(new) - 'estado' - 'reversa' - 'lote_deposito' - 'actualizado_en' - 'actualizado_por') then
    raise exception 'Un movimiento de caja no se modifica: solo se reversa o se asigna a un lote de depósito.' using errcode = 'EN001';
  end if;
  if old.estado = 'Reversado' and new.estado <> 'Reversado' then
    raise exception 'Un movimiento reversado no se reactiva.' using errcode = 'EN001';
  end if;
  return new;
end;
$$;
create trigger movimientos_no_cambian before update or delete on public.movimientos_caja for each row execute function app.movimiento_inmutable();

create function app.nota_inmutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Una nota de crédito no se modifica ni se borra.' using errcode = 'EN001';
end;
$$;
create trigger notas_no_cambian before update or delete on public.notas_credito for each row execute function app.nota_inmutable();

create function app.dinero_no_se_vacia() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Los pagos, la caja y las notas de crédito no se vacían.' using errcode = 'EN001';
end;
$$;
create trigger pagos_no_vaciar       before truncate on public.pagos            for each statement execute function app.dinero_no_se_vacia();
create trigger movimientos_no_vaciar before truncate on public.movimientos_caja for each statement execute function app.dinero_no_se_vacia();
create trigger notas_no_vaciar       before truncate on public.notas_credito    for each statement execute function app.dinero_no_se_vacia();

-- Una matrícula nombra titulares que existen.
create function app.matricula_validar() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_t text;
begin
  foreach v_t in array new.titular_ids loop
    if not exists (select 1 from public.titulares t where t.id = v_t) then
      raise exception 'Algún titular de la matrícula ya no existe.' using errcode = 'EN001';
    end if;
  end loop;
  return new;
end;
$$;
create trigger matriculas_validar before insert or update on public.matriculas for each row execute function app.matricula_validar();

-- Un alumno con matrículas no se elimina (es historial).
create function app.alumno_con_matriculas_guarda() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.matriculas m where m.alumno_id = old.id) then
    raise exception 'El alumno tiene matrículas, asesorías o seguimiento registrados: no se puede eliminar.' using errcode = 'EN001';
  end if;
  return old;
end;
$$;
create trigger alumnos_no_eliminar_con_matriculas before delete on public.alumnos for each row execute function app.alumno_con_matriculas_guarda();

-- ---------------------------------------------------------------------------------------------------------------------
-- Quién ve qué
-- ---------------------------------------------------------------------------------------------------------------------

-- Funciones que, en el registro, leen cada cosa (check-money-db.ts compara estas listas con el registro).
create function app.puede_leer_matriculas() returns boolean
language sql stable security definer set search_path = '' as $$
  select app.tiene_alguna(array['dash-resumen:view', 'op-matriculas:view', 'op-matriculas:documents', 'op-verificacion:view', 'op-cobranza:view', 'psi-prog:view',
    'psi-prog:create', 'per-alumnos:view', 'per-titulares:view', 'rep-matriculas:view', 'rep-cartera:view', 'rep-verificacion:view', 'rep-stock:view', 'sis-solicitudes:view']);
$$;

create function app.puede_leer_planes() returns boolean
language sql stable security definer set search_path = '' as $$
  select app.tiene_alguna(array['dash-resumen:view', 'op-matriculas:view', 'op-pagos:view', 'op-pagos:register', 'op-cobranza:view', 'per-titulares:view', 'rep-cartera:view']);
$$;

create function app.puede_leer_cuotas() returns boolean
language sql stable security definer set search_path = '' as $$
  select app.tiene_alguna(array['dash-resumen:view_money', 'op-pagos:view', 'op-pagos:register', 'op-cobranza:view', 'rep-cartera:view']);
$$;

create function app.puede_leer_pagos() returns boolean
language sql stable security definer set search_path = '' as $$
  select app.tiene_alguna(array['dash-resumen:view_money', 'op-pagos:view']);
$$;

create function app.puede_leer_caja() returns boolean
language sql stable security definer set search_path = '' as $$
  select app.tiene_alguna(array['dash-resumen:view_money', 'op-caja:view', 'op-caja:close_box', 'rep-caja:view']);
$$;

-- ¿Alcanza la sede de esta matrícula?
create function app.ve_matricula(p_matricula text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.matriculas m where m.id = p_matricula and app.ve_sede(m.sede_id));
$$;

-- Un movimiento sin sede (caja general) lo ve quien alcanza todas las sedes.
create function app.ve_sede_o_general(p_sede text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case when p_sede is null then app.alcance_total() else app.ve_sede(p_sede) end;
$$;

create function app.ve_pago(p_pago text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.pagos p where p.id = p_pago and app.ve_sede(p.sede_id));
$$;

create function app.ve_grupo(p_grupo text) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.alcance_total()
    or not exists (select 1 from public.matriculas m where m.grupo_promocional_id = p_grupo)
    or exists (select 1 from public.matriculas m where m.grupo_promocional_id = p_grupo and app.ve_sede(m.sede_id));
$$;

-- Un alumno se ve si aún no tiene matrícula o la tiene en una sede que se alcanza (quien alcanza todas las sedes, siempre).
create function app.ve_alumno(p_alumno text) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.alcance_total()
    or not exists (select 1 from public.matriculas m where m.alumno_id = p_alumno)
    or exists (select 1 from public.matriculas m where m.alumno_id = p_alumno and app.ve_sede(m.sede_id));
$$;

-- Un titular se ve si no tiene alumnos todavía o alguno de ellos es visible.
create function app.ve_titular(p_titular text) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.alcance_total()
    or not exists (select 1 from public.alumno_titulares l where l.titular_id = p_titular)
    or exists (select 1 from public.alumno_titulares l where l.titular_id = p_titular and app.ve_alumno(l.alumno_id));
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Acciones: qué función pide cada una, qué tablas puede tocar ('i' = agregar filas nuevas, 'u' = cambiar las que ya existen), qué tipo de
-- movimiento de caja puede AGREGAR (`mov_nuevo`: Ingreso o Egreso) y qué movimientos de stock puede pedir. `extra` = función adicional que pide
-- una tabla concreta. check-money-db.ts compara las funciones con el registro.
-- ---------------------------------------------------------------------------------------------------------------------
create function app.acciones_dinero() returns jsonb
language sql immutable set search_path = '' as $$
  select '{
    "matricular":          { "mensaje": "matricular", "funciones": ["op-matriculas:create", "op-matriculas:renew"], "tablas": { "grupos": "i", "matriculas": "i", "planes": "i", "pagos": "i", "movimientos": "i" }, "mov_nuevo": "Ingreso" },
    "cobrar":              { "mensaje": "registrar pagos", "funciones": ["op-pagos:register"], "tablas": { "planes": "u", "pagos": "i", "movimientos": "i" }, "mov_nuevo": "Ingreso" },
    "refinanciar":         { "mensaje": "refinanciar cuotas", "funciones": ["op-cobranza:refinance"], "tablas": { "planes": "u" } },
    "mora":                { "mensaje": "cobrar mora", "funciones": ["op-cobranza:charge_mora"], "tablas": { "planes": "u" } },
    "reversar_pago":       { "mensaje": "reversar pagos", "funciones": ["op-pagos:reverse_payment"], "tablas": { "planes": "u", "pagos": "u", "movimientos": "iu", "notas": "i" }, "extra": { "notas": "op-pagos:credit_note" }, "mov_nuevo": "Egreso" },
    "reversar_movimiento": { "mensaje": "reversar movimientos de caja", "funciones": ["op-caja:reverse_movement"], "tablas": { "movimientos": "u" }, "stock": ["reponer"] },
    "deposito":            { "mensaje": "crear lotes de depósito", "funciones": ["op-caja:deposit"], "tablas": { "movimientos": "iu" }, "mov_nuevo": "Egreso" },
    "ingreso_caja":        { "mensaje": "registrar ingresos de caja", "funciones": ["op-caja:reg_income"], "tablas": { "movimientos": "i" }, "mov_nuevo": "Ingreso" },
    "egreso_caja":         { "mensaje": "registrar egresos de caja", "funciones": ["op-caja:reg_expense"], "tablas": { "movimientos": "i" }, "mov_nuevo": "Egreso" },
    "venta":               { "mensaje": "vender artículos en caja", "funciones": ["op-caja:sell_item"], "tablas": { "movimientos": "i" }, "mov_nuevo": "Ingreso", "stock": ["vender"] },
    "caida":               { "mensaje": "aprobar caídas", "funciones": ["op-matriculas:approve_drop"], "tablas": { "matriculas": "u", "planes": "u" } },
    "reactivacion":        { "mensaje": "aprobar reactivaciones", "funciones": ["op-matriculas:approve_reactivation"], "tablas": { "matriculas": "u", "planes": "u" } },
    "cambio_programa":     { "mensaje": "aprobar cambios de programa", "funciones": ["op-matriculas:approve_program_change"], "tablas": { "matriculas": "u", "planes": "u" } },
    "traslado":            { "mensaje": "aprobar traslados de sede", "funciones": ["op-matriculas:approve_transfer"], "tablas": { "matriculas": "u" } },
    "corregir":            { "mensaje": "corregir datos de la matrícula", "funciones": ["op-matriculas:edit_data"], "tablas": { "matriculas": "u" } },
    "extension":           { "mensaje": "habilitar la extensión", "funciones": ["op-matriculas:extend"], "tablas": { "matriculas": "u" } },
    "documentos":          { "mensaje": "generar contratos y fichas", "funciones": ["op-matriculas:documents"], "tablas": { "matriculas": "u" } },
    "verificacion":        { "mensaje": "registrar la entrega de materiales", "funciones": ["op-verificacion:deliver"], "tablas": { "matriculas": "u" }, "stock": ["entregar"] }
  }'::jsonb;
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Aplicar filas (genérico): agrega una fila nueva (viene completa y marcada con `_nueva`) o cambia solo las columnas que trae una fila que ya existe.
-- ---------------------------------------------------------------------------------------------------------------------
create function app.aplicar_fila(p_tabla text, p_fila jsonb, p_clave text[], p_permiso text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_existe boolean;
  v_nueva  boolean := coalesce((p_fila->>'_nueva')::boolean, false);
  v_donde  text;
  v_set    text;
begin
  select string_agg(format('t.%I = r.%I', k, k), ' and ') into v_donde from unnest(p_clave) k;
  execute format('select exists (select 1 from public.%I t, jsonb_populate_record(null::public.%I, $1) r where %s)', p_tabla, p_tabla, v_donde)
    into v_existe using p_fila;
  if not v_nueva then
    -- Un cambio: la fila ya debe existir y solo trae las columnas que cambiaron
    if position('u' in p_permiso) = 0 then
      raise exception 'Esta operación no puede cambiar registros que ya existen (%).', p_fila->>'id' using errcode = 'EN001';
    end if;
    if not v_existe then
      raise exception 'El registro % ya no existe. Actualice la pantalla.', p_fila->>'id' using errcode = 'EN001';
    end if;
    select string_agg(format('%I = r.%I', a.attname, a.attname), ', ') into v_set
    from pg_attribute a
    where a.attrelid = (format('public.%I', p_tabla))::regclass and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
      and a.attname <> all (p_clave) and a.attname not in ('creado_en', 'creado_por', 'actualizado_en', 'actualizado_por') and p_fila ? (a.attname::text);
    -- Solo se cambian las columnas que vienen (una fila que solo trae su clave y las cuotas no toca el resto)
    if v_set is not null then
      execute format('update public.%I t set %s from jsonb_populate_record(null::public.%I, $1) r where %s', p_tabla, v_set, p_tabla, v_donde) using p_fila;
    end if;
  else
    -- Una fila nueva (viene marcada con `_nueva`, completa): si su código ya existe, otra persona lo registró primero
    if position('i' in p_permiso) = 0 then
      raise exception 'Esta operación no puede agregar registros nuevos (%).', coalesce(p_fila->>'id', p_tabla) using errcode = 'EN001';
    end if;
    if v_existe then
      raise exception 'Otra persona registró algo al mismo tiempo y el código % ya está en uso. Vuelva a intentarlo.', p_fila->>'id' using errcode = 'EN001';
    end if;
    execute format('insert into public.%I select * from jsonb_populate_record(null::public.%I, $1)', p_tabla, p_tabla) using p_fila;
  end if;
end;
$$;

-- Las cuotas de un plan se reemplazan por completo (un cobro quitado por una reversa es una fila menos en `cobros`).
create function app.aplicar_cuotas(p_plan text, p_cuotas jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.cuotas c where c.plan_id = p_plan;
  if jsonb_typeof(p_cuotas) = 'array' and jsonb_array_length(p_cuotas) > 0 then
    insert into public.cuotas
    select * from jsonb_populate_recordset(null::public.cuotas, (select jsonb_agg(x || jsonb_build_object('plan_id', p_plan)) from jsonb_array_elements(p_cuotas) x));
  end if;
end;
$$;

-- La sede debe ser alcanzable por quien llama (sin sesión, el editor SQL, no se frena).
create function app.exigir_sede(p_sede text, p_que text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is not null and p_sede is not null and not app.ve_sede(p_sede) then
    raise exception 'No puede registrar % en una sede que su cuenta no alcanza.', p_que using errcode = 'EN001';
  end if;
  if auth.uid() is not null and p_sede is null and not app.alcance_total() then
    raise exception 'Solo quien alcanza todas las sedes registra % sin sede.', p_que using errcode = 'EN001';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Invariantes del dinero (se comprueban sobre lo que quedó, después de aplicar todo)
-- ---------------------------------------------------------------------------------------------------------------------
create function app.verificar_dinero(p_planes text[], p_pagos text[], p_movimientos text[], p_notas text[], p_grupos text[]) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r          record;
  v_suma     numeric;
  v_partes   numeric;
begin
  -- Planes: cada cuota entre 0 y su monto; en una cuota abierta, saldo = monto − cobrado; el saldo del plan = la suma de las cuotas abiertas;
  -- cada cobro nombra un pago que existe.
  for r in
    select c.plan_id, c.id, c.monto, c.saldo, c.estado,
           coalesce((select sum((x->>'amount')::numeric) from jsonb_array_elements(c.cobros) x), 0) as cobrado
    from public.cuotas c where c.plan_id = any (p_planes)
  loop
    if r.saldo < 0 or r.saldo > r.monto + 0.01 then
      raise exception 'La cuota % del plan % tiene un saldo que no cuadra (debe estar entre 0 y su monto).', r.id, r.plan_id using errcode = 'EN001';
    end if;
    if r.estado not in ('Anulada', 'Refinanciada') and abs(r.saldo - (r.monto - r.cobrado)) > 0.011 then
      raise exception 'La cuota % del plan % no cuadra: su saldo (%) no es su monto (%) menos lo cobrado (%).', r.id, r.plan_id, r.saldo, r.monto, r.cobrado using errcode = 'EN001';
    end if;
  end loop;

  for r in select pl.id, pl.saldo from public.planes pl where pl.id = any (p_planes) loop
    select coalesce(sum(c.saldo), 0) into v_suma from public.cuotas c where c.plan_id = r.id and c.estado not in ('Anulada', 'Refinanciada');
    if abs(r.saldo - v_suma) > 0.011 then
      raise exception 'El saldo del plan % (%) no es la suma de sus cuotas abiertas (%).', r.id, r.saldo, v_suma using errcode = 'EN001';
    end if;
  end loop;

  for r in
    select c.plan_id, c.id, x->>'paymentId' as pago
    from public.cuotas c, jsonb_array_elements(c.cobros) x
    where c.plan_id = any (p_planes) and coalesce(x->>'paymentId', '') <> ''
  loop
    if not exists (select 1 from public.pagos p where p.id = r.pago) then
      raise exception 'La cuota % del plan % nombra el pago %, que no existe.', r.id, r.plan_id, r.pago using errcode = 'EN001';
    end if;
  end loop;

  -- Pagos: las partes suman el monto (± 0,02 USD); uno anulado tiene su constancia de reversa; las matrículas que cubre existen.
  for r in select p.* from public.pagos p where p.id = any (p_pagos) loop
    if jsonb_array_length(r.partes) > 0 then
      select coalesce(sum(case when x->>'currency' = 'PEN' then (x->>'amount')::numeric / nullif((x->>'exchangeRate')::numeric, 0) else (x->>'amount')::numeric end), 0)
        into v_partes from jsonb_array_elements(r.partes) x;
      if v_partes is null or abs(v_partes - r.monto) > 0.02 then
        raise exception 'Las partes del pago % no suman su monto.', r.id using errcode = 'EN001';
      end if;
    end if;
    if r.estado = 'Anulado' and r.reversa is null then
      raise exception 'El pago anulado % no tiene su constancia de reversa.', r.id using errcode = 'EN001';
    end if;
    if exists (select 1 from unnest(r.matricula_ids) m where not exists (select 1 from public.matriculas x where x.id = m)) then
      raise exception 'El pago % nombra una matrícula que no existe.', r.id using errcode = 'EN001';
    end if;
  end loop;

  -- Movimientos de caja: en dólares el equivalente es el monto; en soles, el monto entre el tipo de cambio (si lo trae).
  for r in select m.* from public.movimientos_caja m where m.id = any (p_movimientos) loop
    if r.moneda = 'USD' and abs(r.monto - r.monto_usd) > 0.01 then
      raise exception 'El movimiento % en dólares no cuadra con su equivalente.', r.id using errcode = 'EN001';
    end if;
    if r.moneda = 'PEN' and r.tipo_cambio is not null and abs(r.monto / r.tipo_cambio - r.monto_usd) > 0.02 then
      raise exception 'El movimiento % en soles no cuadra con su tipo de cambio.', r.id using errcode = 'EN001';
    end if;
  end loop;

  -- Notas de crédito y grupos promocionales: nombran un pago que existe.
  for r in select n.id, n.pago_id from public.notas_credito n where n.id = any (p_notas) loop
    if not exists (select 1 from public.pagos p where p.id = r.pago_id) then
      raise exception 'La nota de crédito % nombra un pago que no existe.', r.id using errcode = 'EN001';
    end if;
  end loop;
  for r in select g.id, g.pago_id from public.grupos_promocionales g where g.id = any (p_grupos) and g.pago_id is not null loop
    if not exists (select 1 from public.pagos p where p.id = r.pago_id) then
      raise exception 'El grupo promocional % nombra un pago que no existe.', r.id using errcode = 'EN001';
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- La función pública: aplica los cambios de una acción, todo o nada.
--   p = { grupos: [fila], matriculas: [fila], planes: [fila + cuotas], pagos: [fila], movimientos: [fila], notas: [fila],
--         stock: [{ op: 'vender' | 'reponer' | 'entregar', ... }] }
-- Una fila NUEVA trae todas sus columnas (con los nombres de las tablas) y `_nueva: true`; un CAMBIO trae su `id` y solo las columnas que cambiaron.
-- El orden respeta las claves foráneas.
-- ---------------------------------------------------------------------------------------------------------------------
create function public.aplicar_cambios_matricula(p_accion text, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_conf       jsonb;
  v_funcs      text[];
  v_fila       jsonb;
  v_perm       text;
  v_extra      text;
  v_stock      jsonb;
  v_op         text;
  v_grupos     text[] := '{}';
  v_matriculas text[] := '{}';
  v_planes     text[] := '{}';
  v_pagos      text[] := '{}';
  v_movs       text[] := '{}';
  v_notas      text[] := '{}';
  v_vieja      text;
  v_nueva      text;
  v_restr      text;
begin
  v_conf := app.acciones_dinero() -> p_accion;
  if v_conf is null then raise exception 'La operación «%» no existe.', coalesce(p_accion, '') using errcode = 'EN001'; end if;
  if jsonb_typeof(p) is distinct from 'object' then raise exception 'No hay cambios para guardar.' using errcode = 'EN001'; end if;

  select array_agg(f) into v_funcs from jsonb_array_elements_text(v_conf->'funciones') f;
  perform app.exigir_alguna(v_funcs, 'Su rol no puede ' || (v_conf->>'mensaje') || ': falta la función correspondiente.');

  -- Qué tablas puede tocar esta acción
  foreach v_op in array array['grupos', 'matriculas', 'planes', 'pagos', 'movimientos', 'notas'] loop
    if jsonb_typeof(p->v_op) = 'array' and jsonb_array_length(p->v_op) > 0 then
      if v_conf->'tablas'->>v_op is null then
        raise exception 'Esta operación no puede modificar % (%).', case v_op when 'grupos' then 'los grupos promocionales' when 'matriculas' then 'las matrículas'
          when 'planes' then 'los planes' when 'pagos' then 'los pagos' when 'movimientos' then 'la caja' else 'las notas de crédito' end, p_accion using errcode = 'EN001';
      end if;
      v_extra := v_conf->'extra'->>v_op;
      if v_extra is not null then perform app.exigir(v_extra, 'Emitir o registrar notas de crédito'); end if;
    end if;
  end loop;

  -- El stock que esta acción puede mover (cada función de stock vuelve a pedir la suya y a comprobar la sede)
  if jsonb_typeof(p->'stock') = 'array' then
    for v_stock in select * from jsonb_array_elements(p->'stock') loop
      v_op := v_stock->>'op';
      if not coalesce((v_conf->'stock') ? v_op, false) then
        raise exception 'Esta operación no puede mover stock (%).', coalesce(v_op, '') using errcode = 'EN001';
      end if;
      if v_op = 'vender' then
        perform public.vender_articulo(v_stock->>'sede', v_stock->>'articulo', (v_stock->>'cantidad')::integer, v_stock->>'documento', v_stock->>'observacion');
      elsif v_op = 'reponer' then
        perform public.reponer_por_reversa(v_stock->>'sede', v_stock->>'articulo', (v_stock->>'cantidad')::integer, v_stock->>'movimiento');
      elsif v_op = 'entregar' then
        perform public.entregar_materiales(v_stock->>'sede', v_stock->>'matricula', v_stock->>'alumno', v_stock->'lineas');
      end if;
    end loop;
  end if;

  -- 1. Grupos promocionales
  for v_fila in select * from jsonb_array_elements(coalesce(p->'grupos', '[]'::jsonb)) loop
    perform app.aplicar_fila('grupos_promocionales', v_fila, array['id'], v_conf->'tablas'->>'grupos');
    v_grupos := v_grupos || (v_fila->>'id');
  end loop;

  -- 2. Matrículas (la sede de antes y la de después deben ser alcanzables: un traslado necesita ambas). Un cambio solo trae las columnas que
  --    cambiaron: si no trae la sede, es la que ya tiene la fila.
  for v_fila in select * from jsonb_array_elements(coalesce(p->'matriculas', '[]'::jsonb)) loop
    select m.sede_id into v_vieja from public.matriculas m where m.id = v_fila->>'id';
    if v_vieja is not null then perform app.exigir_sede(v_vieja, 'matrículas'); end if;
    v_nueva := case when v_fila ? 'sede_id' then v_fila->>'sede_id' else v_vieja end;
    perform app.exigir_sede(v_nueva, 'matrículas');
    perform app.aplicar_fila('matriculas', v_fila, array['id'], v_conf->'tablas'->>'matriculas');
    v_matriculas := v_matriculas || (v_fila->>'id');
  end loop;

  -- 3. Planes y sus cuotas (la sede es la de la matrícula)
  for v_fila in select * from jsonb_array_elements(coalesce(p->'planes', '[]'::jsonb)) loop
    perform app.exigir_sede((select m.sede_id from public.matriculas m
      where m.id = case when v_fila ? 'matricula_id' then v_fila->>'matricula_id' else (select pl.matricula_id from public.planes pl where pl.id = v_fila->>'id') end), 'planes de pago');
    perform app.aplicar_fila('planes', v_fila, array['id'], v_conf->'tablas'->>'planes');
    if v_fila ? 'cuotas' then perform app.aplicar_cuotas(v_fila->>'id', v_fila->'cuotas'); end if;
    v_planes := v_planes || (v_fila->>'id');
  end loop;

  -- 4. Pagos
  for v_fila in select * from jsonb_array_elements(coalesce(p->'pagos', '[]'::jsonb)) loop
    perform app.exigir_sede(case when v_fila ? 'sede_id' then v_fila->>'sede_id' else (select pg.sede_id from public.pagos pg where pg.id = v_fila->>'id') end, 'pagos');
    perform app.aplicar_fila('pagos', v_fila, array['id'], v_conf->'tablas'->>'pagos');
    v_pagos := v_pagos || (v_fila->>'id');
  end loop;

  -- 5. Movimientos de caja
  for v_fila in select * from jsonb_array_elements(coalesce(p->'movimientos', '[]'::jsonb)) loop
    perform app.exigir_sede(case when v_fila ? 'sede_id' then v_fila->>'sede_id' else (select mc.sede_id from public.movimientos_caja mc where mc.id = v_fila->>'id') end, 'movimientos de caja');
    -- Un movimiento NUEVO es del tipo que esa acción registra (un ingreso no se cuela por la acción de egresos)
    if not exists (select 1 from public.movimientos_caja mc where mc.id = v_fila->>'id')
       and coalesce(v_fila->>'tipo', '') is distinct from (v_conf->>'mov_nuevo') then
      raise exception 'Esta operación solo registra movimientos de caja de tipo %.', lower(coalesce(v_conf->>'mov_nuevo', 'ninguno')) using errcode = 'EN001';
    end if;
    perform app.aplicar_fila('movimientos_caja', v_fila, array['id'], v_conf->'tablas'->>'movimientos');
    v_movs := v_movs || (v_fila->>'id');
  end loop;

  -- 6. Notas de crédito
  for v_fila in select * from jsonb_array_elements(coalesce(p->'notas', '[]'::jsonb)) loop
    perform app.aplicar_fila('notas_credito', v_fila, array['id'], v_conf->'tablas'->>'notas');
    v_notas := v_notas || (v_fila->>'id');
  end loop;

  perform app.verificar_dinero(v_planes, v_pagos, v_movs, v_notas, v_grupos);
  return jsonb_build_object('ok', true);
exception
  when unique_violation then
    get stacked diagnostics v_restr = constraint_name;
    if v_restr like '%pkey' then
      raise exception 'Otra persona registró algo al mismo tiempo y el código ya está en uso. Vuelva a intentarlo.' using errcode = 'EN001';
    elsif v_restr = 'planes_matricula_id_key' then
      raise exception 'La matrícula ya tiene un plan de pagos.' using errcode = 'EN001';
    end if;
    raise exception 'Ya existe un registro con esos datos.' using errcode = 'EN001';
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Permisos de tabla y RLS: solo se lee (por sede y con la función que muestra cada cosa); todo lo demás pasa por la función
-- ---------------------------------------------------------------------------------------------------------------------

revoke all on public.grupos_promocionales, public.matriculas, public.planes, public.cuotas, public.pagos, public.movimientos_caja, public.notas_credito
  from public, anon, authenticated;
grant select on public.grupos_promocionales, public.matriculas, public.planes, public.cuotas, public.pagos, public.movimientos_caja, public.notas_credito
  to authenticated;

alter table public.grupos_promocionales enable row level security;
alter table public.matriculas           enable row level security;
alter table public.planes               enable row level security;
alter table public.cuotas               enable row level security;
alter table public.pagos                enable row level security;
alter table public.movimientos_caja     enable row level security;
alter table public.notas_credito        enable row level security;

create policy matriculas_leer on public.matriculas for select to authenticated
  using ((select app.puede_leer_matriculas()) and (select app.ve_sede(sede_id)));
create policy planes_leer on public.planes for select to authenticated
  using ((select app.puede_leer_planes()) and (select app.ve_matricula(matricula_id)));
create policy cuotas_leer on public.cuotas for select to authenticated
  using ((select app.puede_leer_cuotas()) and exists (select 1 from public.planes p where p.id = plan_id));
create policy pagos_leer on public.pagos for select to authenticated
  using ((select app.puede_leer_pagos()) and (select app.ve_sede(sede_id)));
create policy movimientos_leer on public.movimientos_caja for select to authenticated
  using ((select app.puede_leer_caja()) and (select app.ve_sede_o_general(sede_id)));
create policy notas_leer on public.notas_credito for select to authenticated
  using ((select app.puede_leer_pagos()) and (select app.ve_pago(pago_id)));
create policy grupos_leer on public.grupos_promocionales for select to authenticated
  using ((select app.puede_leer_matriculas()) and (select app.ve_grupo(id)));

-- Alumnos y titulares: ahora también por sede
drop policy alumnos_leer on public.alumnos;
drop policy titulares_leer on public.titulares;
drop policy alumno_titulares_leer on public.alumno_titulares;
create policy alumnos_leer on public.alumnos for select to authenticated
  using ((select app.puede_leer_alumnos()) and (select app.ve_alumno(id)));
create policy titulares_leer on public.titulares for select to authenticated
  using ((select app.puede_leer_titulares()) and (select app.ve_titular(id)));
create policy alumno_titulares_leer on public.alumno_titulares for select to authenticated
  using ((select app.puede_leer_alumnos()) and (select app.ve_alumno(alumno_id)));

revoke execute on function public.aplicar_cambios_matricula(text, jsonb) from public, anon;
grant execute on function public.aplicar_cambios_matricula(text, jsonb) to authenticated;
revoke execute on all functions in schema app from public, anon;
grant execute on all functions in schema app to authenticated;

commit;
