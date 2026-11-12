-- =====================================================================================================================
-- 0017 · Cierres de caja y caja chica por sede (Lote 9A)
-- ---------------------------------------------------------------------------------------------------------------------
-- Pasa a la base lo que seguía en memoria de la caja:
--   · `cierres_caja`: el arqueo de un día. **Cada sede cierra su propia caja** (una por moneda: Caja PEN y Caja USD) y cada sede su caja chica
--     (siempre en soles). La caja sin sede («caja general») la cierra quien alcanza todas las sedes. Un cierre cubre todos los movimientos aplicados
--     de esa caja con fecha menor o igual a la suya; **el saldo esperado lo calcula la base** (no se confía en el número de la pantalla); si hay
--     diferencia, la nota es obligatoria. No se borra: solo se REABRE (el último cierre de esa caja, con motivo), y queda en el historial.
--   · `caja_chica_fondos`: el fondo fijo de cada sede (monto asignado y tope por gasto). Sin fila, valen los de partida (S/ 1 000 y tope S/ 200).
--   · `caja_chica_movimientos`: ingresos y gastos de la caja chica de cada sede. **Solo se agregan**: después solo cambian el estado y la constancia
--     de la reversa (un error se corrige reversando, con motivo). Un gasto no pasa del tope ni deja el saldo en negativo.
--   · **Un día cerrado no admite movimientos a mano**: un disparador de `movimientos_caja` rechaza un ingreso, un egreso o una venta nuevos (sin
--     pago asociado), o la reversa de uno, si su fecha ya está cubierta por un cierre de esa sede y moneda. Los cobros y las reversas de pagos
--     (con pago asociado) siguen entrando: el cierre queda «desactualizado» y se avisa (se calcula al mostrar).
--   · Nadie escribe estas tablas directo: solo las funciones `cerrar_caja`, `reabrir_cierre`, `definir_fondo_caja_chica`,
--     `registrar_movimiento_caja_chica` y `reversar_movimiento_caja_chica`, que piden la función del registro (`op-caja:close_box|reopen_box`,
--     `op-caja-chica:count|reopen_box|config|reg_movement|reverse_movement`), comprueban que la sede se alcance y dejan quién y cuándo.
--   · Se ve por sede (la caja general, quien alcanza todas) y con la función que lee cada cosa (comparadas con el registro en `check-cash-boxes-db.ts`).
-- Los errores de negocio usan el código EN001: el sistema muestra su texto tal cual (está en español).
-- Para deshacer: supabase/deshacer/20261112100000_cierres_de_caja_y_caja_chica.down.sql
-- =====================================================================================================================

begin;

-- ---------------------------------------------------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------------------------------------------------

create table public.cierres_caja (
  id                text primary key check (id ~ '^CIE-[0-9]{3,}$'),
  ambito            text not null check (ambito in ('caja', 'caja-chica')),
  moneda            text not null check (moneda in ('PEN', 'USD')),
  sede_id           text references public.sedes (id) on delete restrict,
  fecha             date not null,
  esperado          numeric(14,2) not null,
  contado           numeric(14,2) not null check (contado >= 0),
  diferencia        numeric(14,2) not null,
  nota              text not null default '',
  cerrado_en        timestamptz not null default now(),
  cerrado_por       text not null,
  estado            text not null default 'Cerrada' check (estado in ('Cerrada', 'Reabierta')),
  reabierto_en      timestamptz,
  reabierto_por     text,
  motivo_reapertura text,
  check (ambito = 'caja' or (moneda = 'PEN' and sede_id is not null)),
  check (abs(diferencia - (contado - esperado)) < 0.011),
  check ((estado = 'Reabierta') = (reabierto_en is not null))
);
-- Un solo cierre vigente por caja y fecha (la caja general no tiene sede: se compara con vacío)
create unique index cierres_caja_vigente_unico on public.cierres_caja (ambito, moneda, coalesce(sede_id, ''), fecha) where estado = 'Cerrada';
create index cierres_caja_sede_idx on public.cierres_caja (sede_id, fecha desc);
comment on table public.cierres_caja is 'Arqueo de un día por caja (sede y moneda; la caja chica es de una sede, en soles). `sede_id` vacío = caja general. Solo se reabre (el último de su caja), con motivo.';

create table public.caja_chica_fondos (
  sede_id        text primary key references public.sedes (id) on delete restrict,
  asignado       numeric(12,2) not null check (asignado > 0 and asignado <= 100000),
  tope           numeric(12,2) not null check (tope > 0),
  actualizado_en timestamptz not null default now(),
  actualizado_por text,
  check (tope <= asignado)
);
comment on table public.caja_chica_fondos is 'Fondo fijo de la caja chica de cada sede: monto asignado y tope por gasto. Sin fila valen los de partida (S/ 1 000 y tope S/ 200).';

create table public.caja_chica_movimientos (
  id            text primary key check (id ~ '^CCH-[0-9]{3,}$'),
  sede_id       text not null references public.sedes (id) on delete restrict,
  fecha         timestamptz not null,
  tipo          text not null check (tipo in ('Ingreso', 'Egreso')),
  categoria     text not null,
  concepto      text not null check (length(btrim(concepto)) between 3 and 120),
  monto         numeric(12,2) not null check (monto > 0 and monto <= 100000),
  medio         text not null,
  referencia    text,
  evidencia     text,
  observaciones text,
  usuario       text not null,
  estado        text not null default 'Aplicado' check (estado in ('Aplicado', 'Reversado')),
  reversa       jsonb,
  creado_en     timestamptz not null default now(),
  check ((estado = 'Reversado') = (reversa is not null))
);
create index caja_chica_movimientos_sede_idx on public.caja_chica_movimientos (sede_id, fecha desc);
comment on table public.caja_chica_movimientos is 'Movimientos de la caja chica de cada sede (soles). Solo se agregan: después solo cambian el estado y la constancia de la reversa `reversa` = { at, by, reason, detail }.';

-- ---------------------------------------------------------------------------------------------------------------------
-- Lo que no se cambia ni se borra
-- ---------------------------------------------------------------------------------------------------------------------

create function app.cierre_inmutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Un cierre de caja no se borra: se reabre con su motivo.' using errcode = 'EN001';
  end if;
  if (to_jsonb(old) - 'estado' - 'reabierto_en' - 'reabierto_por' - 'motivo_reapertura') is distinct from (to_jsonb(new) - 'estado' - 'reabierto_en' - 'reabierto_por' - 'motivo_reapertura') then
    raise exception 'Un cierre de caja no se modifica: solo se reabre.' using errcode = 'EN001';
  end if;
  if old.estado = 'Reabierta' then
    raise exception 'Este cierre ya fue reabierto.' using errcode = 'EN001';
  end if;
  return new;
end;
$$;
create trigger cierres_no_cambian before update or delete on public.cierres_caja for each row execute function app.cierre_inmutable();

create function app.caja_chica_inmutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Un movimiento de caja chica no se borra: se reversa con su constancia.' using errcode = 'EN001';
  end if;
  if (to_jsonb(old) - 'estado' - 'reversa') is distinct from (to_jsonb(new) - 'estado' - 'reversa') then
    raise exception 'Un movimiento de caja chica no se modifica: solo se reversa.' using errcode = 'EN001';
  end if;
  if old.estado = 'Reversado' then
    raise exception 'Este movimiento ya fue reversado.' using errcode = 'EN001';
  end if;
  return new;
end;
$$;
create trigger caja_chica_no_cambia before update or delete on public.caja_chica_movimientos for each row execute function app.caja_chica_inmutable();

create function app.cajas_no_se_vacian() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Los cierres y los movimientos de caja chica no se vacían.' using errcode = 'EN001';
end;
$$;
create trigger cierres_no_vaciar    before truncate on public.cierres_caja            for each statement execute function app.cajas_no_se_vacian();
create trigger caja_chica_no_vaciar before truncate on public.caja_chica_movimientos for each statement execute function app.cajas_no_se_vacian();

-- ---------------------------------------------------------------------------------------------------------------------
-- Ayudas
-- ---------------------------------------------------------------------------------------------------------------------

-- Última fecha cerrada de una caja (nula si nunca se cerró o se reabrió todo).
create function app.cerrado_hasta(p_ambito text, p_moneda text, p_sede text) returns date
language sql stable security definer set search_path = '' as $$
  select max(c.fecha) from public.cierres_caja c
  where c.ambito = p_ambito and c.moneda = p_moneda and c.sede_id is not distinct from p_sede and c.estado = 'Cerrada';
$$;

-- Saldo que dice el sistema de una caja hasta una fecha (incluida): ingresos − egresos aplicados (la fecha es la de Lima).
create function app.saldo_caja_hasta(p_ambito text, p_moneda text, p_sede text, p_fecha date) returns numeric
language sql stable security definer set search_path = '' as $$
  select round(coalesce(case when p_ambito = 'caja' then
      (select sum(case when m.tipo = 'Ingreso' then m.monto else -m.monto end) from public.movimientos_caja m
       where m.moneda = p_moneda and m.sede_id is not distinct from p_sede and m.estado = 'Aplicado' and (m.fecha at time zone 'America/Lima')::date <= p_fecha)
    else
      (select sum(case when m.tipo = 'Ingreso' then m.monto else -m.monto end) from public.caja_chica_movimientos m
       where m.sede_id = p_sede and m.estado = 'Aplicado' and (m.fecha at time zone 'America/Lima')::date <= p_fecha)
    end, 0), 2);
$$;

-- Saldo de la caja chica de una sede (todo lo aplicado).
create function app.saldo_caja_chica(p_sede text) returns numeric
language sql stable security definer set search_path = '' as $$
  select round(coalesce(sum(case when m.tipo = 'Ingreso' then m.monto else -m.monto end), 0), 2)
  from public.caja_chica_movimientos m where m.sede_id = p_sede and m.estado = 'Aplicado';
$$;

create function app.mensaje_caja_cerrada(p_etiqueta text, p_hasta date) returns text
language sql immutable set search_path = '' as $$
  select p_etiqueta || ' está cerrada hasta el ' || to_char(p_hasta, 'YYYY-MM-DD') || '. Para registrar o reversar movimientos de esa fecha, un usuario con permiso debe reabrir el cierre (Sistema → Cierres).';
$$;

-- El próximo código CIE-NNN / CCH-NNN (máximo + 1; quien llama ya tiene el cerrojo de la tabla).
create function app.codigo_siguiente_caja(p_prefijo text, p_tabla text) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  v_max integer;
begin
  if p_tabla = 'cierres_caja' then
    select coalesce(max(substring(id from 5)::integer), 0) into v_max from public.cierres_caja;
  else
    select coalesce(max(substring(id from 5)::integer), 0) into v_max from public.caja_chica_movimientos;
  end if;
  return p_prefijo || '-' || lpad((v_max + 1)::text, 3, '0');
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Un día cerrado no admite movimientos a mano (ingreso, egreso o venta nuevos, ni la reversa de uno), pero los cobros sí entran
-- ---------------------------------------------------------------------------------------------------------------------

create function app.movimiento_respeta_cierre() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_mov   public.movimientos_caja;
  v_hasta date;
begin
  v_mov := new;
  -- Lo automático (cobros y reversas de pagos: llevan su pago) no se frena: el cierre queda «desactualizado»
  if v_mov.pago_id is not null then return new; end if;
  if tg_op = 'UPDATE' then
    -- Solo importa la reversa (cambiar de lote de depósito no es un movimiento nuevo)
    if not (old.estado = 'Aplicado' and new.estado = 'Reversado') then return new; end if;
    v_mov := old;
  elsif v_mov.deposito is not null then
    return new;   -- el lote de depósito es una operación de tesorería, no un movimiento a mano
  end if;
  v_hasta := app.cerrado_hasta('caja', v_mov.moneda, v_mov.sede_id);
  if v_hasta is not null and (v_mov.fecha at time zone 'America/Lima')::date <= v_hasta then
    raise exception '%', app.mensaje_caja_cerrada('Caja ' || v_mov.moneda || coalesce(' de la sede ' || (select s.nombre from public.sedes s where s.id = v_mov.sede_id), ''), v_hasta) using errcode = 'EN001';
  end if;
  return new;
end;
$$;
create trigger movimientos_respetan_cierre before insert or update on public.movimientos_caja for each row execute function app.movimiento_respeta_cierre();

-- ---------------------------------------------------------------------------------------------------------------------
-- Cerrar y reabrir una caja
-- ---------------------------------------------------------------------------------------------------------------------

create function public.cerrar_caja(p_ambito text, p_moneda text, p_sede text, p_fecha date, p_contado numeric, p_nota text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_ultima   date;
  v_esperado numeric;
  v_dif      numeric;
  v_nota     text := btrim(coalesce(p_nota, ''));
  v_id       text;
begin
  if p_ambito = 'caja' then
    perform app.exigir('op-caja:close_box', 'Cerrar caja');
  elsif p_ambito = 'caja-chica' then
    perform app.exigir('op-caja-chica:count', 'Hacer arqueo y cierre');
  else
    raise exception 'El tipo de caja no es válido.' using errcode = 'EN001';
  end if;
  if p_moneda is null or p_moneda not in ('PEN', 'USD') then raise exception 'La moneda no es válida.' using errcode = 'EN001'; end if;
  if p_ambito = 'caja-chica' and p_moneda <> 'PEN' then raise exception 'La caja chica es en soles.' using errcode = 'EN001'; end if;
  if p_ambito = 'caja-chica' and p_sede is null then raise exception 'La caja chica es de una sede: elija la sede.' using errcode = 'EN001'; end if;
  if p_sede is not null and not exists (select 1 from public.sedes s where s.id = p_sede) then raise exception 'La sede elegida no existe.' using errcode = 'EN001'; end if;
  perform app.exigir_sede(p_sede, 'cierres de caja');
  if p_fecha is null then raise exception 'Indique la fecha del cierre.' using errcode = 'EN001'; end if;
  if p_fecha > app.hoy() then raise exception 'No se puede cerrar una fecha futura.' using errcode = 'EN001'; end if;
  if p_contado is null or p_contado < 0 then raise exception 'Indique el dinero contado (puede ser 0).' using errcode = 'EN001'; end if;

  perform pg_advisory_xact_lock(hashtext('cierres_caja'));
  v_ultima := app.cerrado_hasta(p_ambito, p_moneda, p_sede);
  if v_ultima is not null and p_fecha <= v_ultima then
    raise exception 'La caja ya está cerrada hasta el %: elija una fecha posterior.', to_char(v_ultima, 'YYYY-MM-DD') using errcode = 'EN001';
  end if;
  v_esperado := app.saldo_caja_hasta(p_ambito, p_moneda, p_sede, p_fecha);
  v_dif := round(round(p_contado, 2) - v_esperado, 2);
  if v_dif <> 0 and length(v_nota) < 5 then
    raise exception 'Hay una diferencia entre lo contado y el sistema: explíquela en la nota.' using errcode = 'EN001';
  end if;
  v_id := app.codigo_siguiente_caja('CIE', 'cierres_caja');
  insert into public.cierres_caja (id, ambito, moneda, sede_id, fecha, esperado, contado, diferencia, nota, cerrado_por)
  values (v_id, p_ambito, p_moneda, p_sede, p_fecha, v_esperado, round(p_contado, 2), v_dif, v_nota, app.quien(null));
  return v_id;
end;
$$;

create function public.reabrir_cierre(p_cierre text, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c        public.cierres_caja;
  v_motivo text := btrim(coalesce(p_motivo, ''));
begin
  select * into c from public.cierres_caja x where x.id = p_cierre;
  if not found then raise exception 'No se encontró el cierre.' using errcode = 'EN001'; end if;
  if c.ambito = 'caja' then
    perform app.exigir('op-caja:reopen_box', 'Reabrir caja');
  else
    perform app.exigir('op-caja-chica:reopen_box', 'Reabrir cierre de caja chica');
  end if;
  perform app.exigir_sede(c.sede_id, 'cierres de caja');
  perform pg_advisory_xact_lock(hashtext('cierres_caja'));
  select * into c from public.cierres_caja x where x.id = p_cierre;
  if c.estado <> 'Cerrada' then raise exception 'Este cierre ya fue reabierto.' using errcode = 'EN001'; end if;
  if app.cerrado_hasta(c.ambito, c.moneda, c.sede_id) is distinct from c.fecha then
    raise exception 'Solo se puede reabrir el último cierre de la caja (reabra primero el más reciente).' using errcode = 'EN001';
  end if;
  if length(v_motivo) < 5 then raise exception 'Indique el motivo de la reapertura: queda en el historial.' using errcode = 'EN001'; end if;
  update public.cierres_caja x set estado = 'Reabierta', reabierto_en = now(), reabierto_por = app.quien(null), motivo_reapertura = v_motivo where x.id = p_cierre;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Caja chica: fondo, ingresos y gastos, reversas
-- ---------------------------------------------------------------------------------------------------------------------

create function public.definir_fondo_caja_chica(p_sede text, p_asignado numeric, p_tope numeric) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.exigir('op-caja-chica:config', 'Configurar fondo y tope por gasto');
  if p_sede is null or not exists (select 1 from public.sedes s where s.id = p_sede) then raise exception 'Elija la sede de la caja chica.' using errcode = 'EN001'; end if;
  perform app.exigir_sede(p_sede, 'la caja chica');
  if p_asignado is null or not (p_asignado > 0) or p_asignado > 100000 then raise exception 'Indique el monto del fondo fijo (mayor que cero).' using errcode = 'EN001'; end if;
  if p_tope is null or not (p_tope > 0) then raise exception 'Indique el tope por gasto (mayor que cero).' using errcode = 'EN001'; end if;
  if p_tope > p_asignado then raise exception 'El tope por gasto no puede superar el fondo.' using errcode = 'EN001'; end if;
  insert into public.caja_chica_fondos (sede_id, asignado, tope, actualizado_por) values (p_sede, round(p_asignado, 2), round(p_tope, 2), app.quien(null))
  on conflict (sede_id) do update set asignado = excluded.asignado, tope = excluded.tope, actualizado_en = now(), actualizado_por = excluded.actualizado_por;
end;
$$;

create function public.registrar_movimiento_caja_chica(
  p_sede text, p_tipo text, p_fecha date, p_categoria text, p_concepto text, p_monto numeric, p_medio text,
  p_referencia text, p_evidencia text, p_observaciones text
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_concepto text := btrim(coalesce(p_concepto, ''));
  v_tope     numeric;
  v_hasta    date;
  v_id       text;
begin
  perform app.exigir('op-caja-chica:reg_movement', 'Registrar ingreso o gasto de caja chica');
  if p_sede is null or not exists (select 1 from public.sedes s where s.id = p_sede) then raise exception 'Elija la sede de la caja chica.' using errcode = 'EN001'; end if;
  perform app.exigir_sede(p_sede, 'la caja chica');
  if p_tipo is null or p_tipo not in ('Ingreso', 'Egreso') then raise exception 'Indique si es un ingreso o un gasto.' using errcode = 'EN001'; end if;
  if p_fecha is null then raise exception 'La fecha es obligatoria.' using errcode = 'EN001'; end if;
  if p_fecha > app.hoy() then raise exception 'La fecha no puede ser futura.' using errcode = 'EN001'; end if;
  if p_categoria is null or not (case p_tipo
       when 'Egreso' then p_categoria in ('Movilidad', 'Útiles de oficina', 'Limpieza', 'Otros gastos')
       else p_categoria in ('Reposición de fondo', 'Devolución de sobrante', 'Otros ingresos') end) then
    raise exception 'Seleccione la categoría.' using errcode = 'EN001';
  end if;
  if length(v_concepto) < 3 then raise exception 'Describa el movimiento.' using errcode = 'EN001'; end if;
  if length(v_concepto) > 120 then raise exception 'El concepto es demasiado largo (máximo 120 caracteres).' using errcode = 'EN001'; end if;
  if p_monto is null or not (p_monto > 0) then raise exception 'Indique un monto mayor que cero.' using errcode = 'EN001'; end if;
  if p_monto > 100000 then raise exception 'Revise el monto.' using errcode = 'EN001'; end if;
  if p_medio is null or p_medio not in ('Efectivo', 'Transferencia', 'Otros') then raise exception 'Seleccione el medio.' using errcode = 'EN001'; end if;

  perform pg_advisory_xact_lock(hashtext('caja_chica_movimientos'));
  v_hasta := app.cerrado_hasta('caja-chica', 'PEN', p_sede);
  if v_hasta is not null and p_fecha <= v_hasta then
    raise exception '%', app.mensaje_caja_cerrada('Caja chica', v_hasta) using errcode = 'EN001';
  end if;
  if p_tipo = 'Egreso' then
    v_tope := coalesce((select f.tope from public.caja_chica_fondos f where f.sede_id = p_sede), 200);
    if round(p_monto, 2) > v_tope then
      raise exception 'El gasto supera el tope de la caja chica (S/ %): regístrelo como egreso en Caja, con su comprobante.', to_char(v_tope, 'FM999,990.00') using errcode = 'EN001';
    end if;
    if round(p_monto, 2) > app.saldo_caja_chica(p_sede) then
      raise exception 'El egreso supera el saldo de la caja chica (S/ %).', to_char(app.saldo_caja_chica(p_sede), 'FM999,990.00') using errcode = 'EN001';
    end if;
  end if;
  v_id := app.codigo_siguiente_caja('CCH', 'caja_chica_movimientos');
  insert into public.caja_chica_movimientos (id, sede_id, fecha, tipo, categoria, concepto, monto, medio, referencia, evidencia, observaciones, usuario)
  values (v_id, p_sede, ((p_fecha::text || ' 12:00:00')::timestamp at time zone 'America/Lima'), p_tipo, p_categoria, v_concepto, round(p_monto, 2), p_medio,
    nullif(btrim(coalesce(p_referencia, '')), ''), nullif(btrim(coalesce(p_evidencia, '')), ''), nullif(btrim(coalesce(p_observaciones, '')), ''), app.quien(null));
  return v_id;
end;
$$;

create function public.reversar_movimiento_caja_chica(p_id text, p_motivo text, p_detalle text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  m         public.caja_chica_movimientos;
  v_detalle text := btrim(coalesce(p_detalle, ''));
  v_hasta   date;
begin
  perform app.exigir('op-caja-chica:reverse_movement', 'Reversar movimiento');
  perform pg_advisory_xact_lock(hashtext('caja_chica_movimientos'));
  select * into m from public.caja_chica_movimientos x where x.id = p_id;
  if not found then raise exception 'No se encontró el movimiento.' using errcode = 'EN001'; end if;
  perform app.exigir_sede(m.sede_id, 'la caja chica');
  if m.estado = 'Reversado' then raise exception 'Este movimiento ya fue reversado.' using errcode = 'EN001'; end if;
  if p_motivo is null or p_motivo not in ('Error de registro (monto, categoría o concepto)', 'Movimiento duplicado', 'Gasto no realizado', 'Otro') then
    raise exception 'Seleccione el motivo de la reversa.' using errcode = 'EN001';
  end if;
  if length(v_detalle) < 5 then raise exception 'Explique qué ocurrió: la reversa queda auditada.' using errcode = 'EN001'; end if;
  v_hasta := app.cerrado_hasta('caja-chica', 'PEN', m.sede_id);
  if v_hasta is not null and (m.fecha at time zone 'America/Lima')::date <= v_hasta then
    raise exception '%', app.mensaje_caja_cerrada('Caja chica', v_hasta) using errcode = 'EN001';
  end if;
  if m.tipo = 'Ingreso' and round(app.saldo_caja_chica(m.sede_id) - m.monto, 2) < 0 then
    raise exception 'No se puede reversar este ingreso: el saldo quedaría negativo porque ya se gastó parte de ese dinero. Reverse antes los egresos que corresponda.' using errcode = 'EN001';
  end if;
  update public.caja_chica_movimientos x set estado = 'Reversado',
    reversa = jsonb_build_object('at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'by', app.quien(null), 'reason', p_motivo, 'detail', v_detalle)
  where x.id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Quién ve qué (check-cash-boxes-db.ts compara estas listas con el registro)
-- ---------------------------------------------------------------------------------------------------------------------

create function app.puede_leer_cierres() returns boolean
language sql stable security definer set search_path = '' as $$
  select app.tiene_alguna(array['op-caja:view', 'op-caja-chica:view', 'rep-caja:view', 'sis-cierres:view', 'sis-cierres:view_reopenings']);
$$;

create function app.puede_leer_caja_chica() returns boolean
language sql stable security definer set search_path = '' as $$
  select app.tiene_alguna(array['op-caja-chica:view', 'rep-caja:view']);
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Permisos de tabla y RLS: solo se lee; todo lo que cambia pasa por las funciones de arriba
-- ---------------------------------------------------------------------------------------------------------------------

revoke all on public.cierres_caja, public.caja_chica_fondos, public.caja_chica_movimientos from public, anon, authenticated;
grant select on public.cierres_caja, public.caja_chica_fondos, public.caja_chica_movimientos to authenticated;

alter table public.cierres_caja             enable row level security;
alter table public.caja_chica_fondos        enable row level security;
alter table public.caja_chica_movimientos   enable row level security;

create policy cierres_leer on public.cierres_caja for select to authenticated
  using ((select app.puede_leer_cierres()) and (select app.ve_sede_o_general(sede_id)));
create policy caja_chica_fondos_leer on public.caja_chica_fondos for select to authenticated
  using ((select app.puede_leer_caja_chica()) and (select app.ve_sede(sede_id)));
create policy caja_chica_movimientos_leer on public.caja_chica_movimientos for select to authenticated
  using ((select app.puede_leer_caja_chica()) and (select app.ve_sede(sede_id)));

revoke execute on function
  public.cerrar_caja(text, text, text, date, numeric, text), public.reabrir_cierre(text, text), public.definir_fondo_caja_chica(text, numeric, numeric),
  public.registrar_movimiento_caja_chica(text, text, date, text, text, numeric, text, text, text, text), public.reversar_movimiento_caja_chica(text, text, text)
  from public, anon;
grant execute on function
  public.cerrar_caja(text, text, text, date, numeric, text), public.reabrir_cierre(text, text), public.definir_fondo_caja_chica(text, numeric, numeric),
  public.registrar_movimiento_caja_chica(text, text, date, text, text, numeric, text, text, text, text), public.reversar_movimiento_caja_chica(text, text, text)
  to authenticated;
revoke execute on all functions in schema app from public, anon;
grant execute on all functions in schema app to authenticated;

commit;
