-- =====================================================================================================================
-- 0019 — Los códigos del dinero los asigna la base (no la pantalla)
--
-- El problema: cada pantalla inventaba el código con lo que veía (el más alto de SU sede, más uno). Como una cuenta ve solo sus sedes, dos sedes
-- podían proponer el mismo código: la base rechazaba el repetido y el reintento volvía a proponer el mismo (la cuenta de una sede quedaba atascada).
-- Y los números de contrato, ficha, lote de depósito y nota de crédito ni siquiera estaban protegidos: dos sedes podían emitir el mismo sin aviso.
--
-- La solución: la pantalla arma todo con un código de BORRADOR donde antes iba el código (`MAT-2026-~1~`, `PAG-~2~`, `BC01-~3~`…). Al guardar, la
-- función pública `aplicar_cambios_matricula` (ahora una envoltura de la de 0015/0018, que pasa a `app.aplicar_cambios_matricula_base`):
--   1. comprueba la función del registro de la acción (igual que la base) y que el código de toda fila NUEVA sea un borrador del tipo que le toca
--      (una pantalla desactualizada que mande un código escrito a mano se rechaza: así nadie salta al asignador);
--   2. por cada tipo de código (y año), se pone en fila con un candado que dura hasta el final de la operación y mira el código más alto que existe
--      en TODAS las sedes (`app.codigo_maximo`, sin el filtro por sede) para entregar los siguientes, en el orden de los borradores;
--   3. cambia cada borrador por su código real en todo el envío (filas, referencias y también los textos) y deja el correlativo de una nota de
--      crédito emitida por el sistema como el número de su etiqueta;
--   4. llama a la función base (que valida, aplica y comprueba los invariantes, todo o nada) y devuelve `{ ok, codigos: { borrador: código } }`.
-- Si algo falla, todo se deshace y los números quedan libres: sin repetidos y sin huecos.
--
-- Códigos que asigna: MAT-AAAA-NNN, PLN-NNN, PAG-NNN, PGR-NNN, CJ-NNN, NC-NNN, CAI-NNN, SOL-NNN, COR-NNN, DEP-NNN (lote de depósito), CTR-AAAA-NNN y
-- FIC-AAAA-NNN (contrato y ficha, dentro de `matriculas.documentos`) y el correlativo de las notas (BC01-NNNNNN y FC01-NNNNNN). El espejo en
-- TypeScript es `src/utils/draftIds.ts`; `scripts/check-draft-ids.ts` lo compara con este archivo.
-- =====================================================================================================================

begin;

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. Protecciones que faltaban: ni un contrato, ficha, lote de depósito o nota de crédito repetidos, en ninguna sede
-- ---------------------------------------------------------------------------------------------------------------------
create unique index matriculas_contrato_numero_uq on public.matriculas ((documentos->'contract'->>'number')) where documentos->'contract'->>'number' is not null;
create unique index matriculas_ficha_numero_uq on public.matriculas ((documentos->'ficha'->>'number')) where documentos->'ficha'->>'number' is not null;
create unique index movimientos_deposito_codigo_uq on public.movimientos_caja ((deposito->>'code')) where deposito is not null;
create unique index notas_serie_correlativo_uq on public.notas_credito (serie, correlativo);

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. El código más alto que existe de cada tipo (y año), en toda la base: la función corre con los permisos del dueño y no ve el filtro por sede
-- ---------------------------------------------------------------------------------------------------------------------
create function app.codigo_maximo(p_prefijo text, p_anio integer) returns integer
language plpgsql set search_path = '' as $$
declare
  v_max integer;
  v_re  text := '^' || p_prefijo || '-' || case when p_anio is null then '' else p_anio::text || '-' end || '([0-9]+)$';
begin
  if p_prefijo = 'MAT' then select max(substring(t.id from v_re)::integer) into v_max from public.matriculas t;
  elsif p_prefijo = 'PLN' then select max(substring(t.id from v_re)::integer) into v_max from public.planes t;
  elsif p_prefijo = 'PAG' then select max(substring(t.id from v_re)::integer) into v_max from public.pagos t;
  elsif p_prefijo = 'PGR' then select max(substring(t.id from v_re)::integer) into v_max from public.grupos_promocionales t;
  elsif p_prefijo = 'CJ' then select max(substring(t.id from v_re)::integer) into v_max from public.movimientos_caja t;
  elsif p_prefijo = 'NC' then select max(substring(t.id from v_re)::integer) into v_max from public.notas_credito t;
  elsif p_prefijo in ('CAI', 'SOL') then select max(substring(t.id from v_re)::integer) into v_max from public.solicitudes_matricula t;
  elsif p_prefijo = 'COR' then select max(substring(t.id from v_re)::integer) into v_max from public.correcciones_matricula t;
  elsif p_prefijo = 'CTR' then select max(substring(t.documentos->'contract'->>'number' from v_re)::integer) into v_max from public.matriculas t;
  elsif p_prefijo = 'FIC' then select max(substring(t.documentos->'ficha'->>'number' from v_re)::integer) into v_max from public.matriculas t;
  elsif p_prefijo = 'DEP' then select max(substring(t.deposito->>'code' from v_re)::integer) into v_max from public.movimientos_caja t;
  elsif p_prefijo in ('BC01', 'FC01') then select max(t.correlativo) into v_max from public.notas_credito t where t.serie = p_prefijo;
  else raise exception 'El código «%» no lo asigna el sistema.', p_prefijo using errcode = 'EN001';
  end if;
  return coalesce(v_max, 0);
end;
$$;
comment on function app.codigo_maximo(text, integer) is 'El código más alto de ese tipo (y año) que existe en TODA la base, sin el filtro por sede. Lo usa aplicar_cambios_matricula para asignar los siguientes.';

-- ---------------------------------------------------------------------------------------------------------------------
-- 3. La función de 0015/0018 pasa a ser la base; la pública es la envoltura que asigna los códigos
-- ---------------------------------------------------------------------------------------------------------------------
alter function public.aplicar_cambios_matricula(text, jsonb) set schema app;
alter function app.aplicar_cambios_matricula(text, jsonb) rename to aplicar_cambios_matricula_base;

create function public.aplicar_cambios_matricula(p_accion text, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_conf     jsonb;
  v_funcs    text[];
  v_tabla    record;
  v_tok      record;
  v_fila     jsonb;
  v_pref     text;
  v_texto    text;
  v_grupo    text := '';
  v_token    text;
  v_real     text;
  v_numero   text;
  v_base     integer := 0;
  v_dado     integer := 0;
  v_pad      integer;
  v_codigos  jsonb := '{}'::jsonb;
  v_desact   constant text := 'Esta pantalla está desactualizada: el código de un registro nuevo lo asigna el sistema. Recargue la página e intente de nuevo.';
begin
  -- La función del registro de la acción (la base la vuelve a pedir; aquí se pide antes para no asignar nada a quien no puede)
  v_conf := app.acciones_dinero() -> p_accion;
  if v_conf is null then raise exception 'La operación «%» no existe.', coalesce(p_accion, '') using errcode = 'EN001'; end if;
  if jsonb_typeof(p) is distinct from 'object' then raise exception 'No hay cambios para guardar.' using errcode = 'EN001'; end if;
  select array_agg(f) into v_funcs from jsonb_array_elements_text(v_conf->'funciones') f;
  perform app.exigir_alguna(v_funcs, 'Su rol no puede ' || (v_conf->>'mensaje') || ': falta la función correspondiente.');

  -- El código de toda fila NUEVA es un borrador del tipo que le toca (una solicitud de caída es CAI; las demás, SOL)
  for v_tabla in select * from (values ('grupos', 'PGR', false), ('matriculas', 'MAT', true), ('planes', 'PLN', false), ('pagos', 'PAG', false),
                                       ('movimientos', 'CJ', false), ('notas', 'NC', false), ('solicitudes', '', false), ('correcciones', 'COR', false)) as t(tabla, pref, anio) loop
    if jsonb_typeof(p->v_tabla.tabla) = 'array' then
      for v_fila in select * from jsonb_array_elements(p->v_tabla.tabla) loop
        if coalesce((v_fila->>'_nueva')::boolean, false) then
          v_pref := case when v_tabla.tabla = 'solicitudes' then case when v_fila->>'tipo' = 'Caída' then 'CAI' else 'SOL' end else v_tabla.pref end;
          if coalesce((v_fila->>'id') ~ ('^' || v_pref || '-' || case when v_tabla.anio then '[0-9]{4}-' else '' end || '~[0-9]+~$'), false) is not true then
            raise exception '%', v_desact using errcode = 'EN001';
          end if;
          if v_tabla.tabla = 'notas' and v_fila->>'origen' = 'sistema' then
            if coalesce(v_fila->>'serie', '') not in ('BC01', 'FC01')
               or coalesce((v_fila->>'etiqueta') ~ ('^' || (v_fila->>'serie') || '-~[0-9]+~$'), false) is not true then
              raise exception '%', v_desact using errcode = 'EN001';
            end if;
          elsif v_tabla.tabla = 'notas' and v_fila->>'origen' = 'externa' then
            -- Una nota ya emitida en otro sistema trae su número: no puede repetir uno que ya está registrado (en cualquier sede)
            if exists (select 1 from public.notas_credito n where n.serie = v_fila->>'serie' and n.correlativo = (v_fila->>'correlativo')::integer) then
              raise exception 'La nota de crédito % ya está registrada.', coalesce(v_fila->>'etiqueta', '') using errcode = 'EN001';
            end if;
          end if;
        end if;
      end loop;
    end if;
  end loop;

  -- Se asignan los códigos: por cada tipo (y año), en orden, el candado y los siguientes al más alto que existe en toda la base
  v_texto := p::text;
  for v_tok in
    select distinct m[1] as pref, m[2] as anio, m[3] as numero, m[3]::bigint as n
    from regexp_matches(v_texto, '([A-Z][A-Z0-9]{1,3})-(?:([0-9]{4})-)?~([0-9]+)~', 'g') as m
    order by 1, 2 nulls first, 4
  loop
    if v_tok.pref || '|' || coalesce(v_tok.anio, '') is distinct from v_grupo then
      v_grupo := v_tok.pref || '|' || coalesce(v_tok.anio, '');
      if v_tok.pref not in ('MAT', 'PLN', 'PAG', 'PGR', 'CJ', 'NC', 'CAI', 'SOL', 'COR', 'DEP', 'CTR', 'FIC', 'BC01', 'FC01') then
        raise exception 'El código «%» no lo asigna el sistema.', v_tok.pref using errcode = 'EN001';
      end if;
      if (v_tok.pref in ('MAT', 'CTR', 'FIC')) is distinct from (v_tok.anio is not null) then
        raise exception 'El código «%» % año.', v_tok.pref, case when v_tok.anio is null then 'lleva' else 'no lleva' end using errcode = 'EN001';
      end if;
      -- Un candado por tipo y año, siempre en el mismo orden (no se traban entre sí); se suelta solo al terminar la operación
      perform pg_advisory_xact_lock(hashtextextended('ensil:codigo:' || v_grupo, 0));
      v_base := app.codigo_maximo(v_tok.pref, v_tok.anio::integer);
      v_dado := 0;
    end if;
    v_dado := v_dado + 1;
    v_pad := case when v_tok.pref in ('BC01', 'FC01') then 6 else 3 end;
    v_numero := (v_base + v_dado)::text;
    v_token := v_tok.pref || '-' || coalesce(v_tok.anio || '-', '') || '~' || v_tok.numero || '~';
    v_real := v_tok.pref || '-' || coalesce(v_tok.anio || '-', '') || case when length(v_numero) >= v_pad then v_numero else lpad(v_numero, v_pad, '0') end;
    v_codigos := v_codigos || jsonb_build_object(v_token, v_real);
    v_texto := replace(v_texto, v_token, v_real);
  end loop;
  p := v_texto::jsonb;

  -- El correlativo de una nota emitida por el sistema es el número de su etiqueta (BC01-000012 → 12)
  if jsonb_typeof(p->'notas') = 'array' then
    p := jsonb_set(p, '{notas}', (
      select coalesce(jsonb_agg(case when coalesce((e.fila->>'_nueva')::boolean, false) and e.fila->>'origen' = 'sistema'
                                     then e.fila || jsonb_build_object('correlativo', substring(e.fila->>'etiqueta' from '-([0-9]+)$')::integer) else e.fila end
                                order by e.ord), '[]'::jsonb)
      from jsonb_array_elements(p->'notas') with ordinality as e(fila, ord)));
  end if;

  return app.aplicar_cambios_matricula_base(p_accion, p) || jsonb_build_object('codigos', v_codigos);
end;
$$;
comment on function public.aplicar_cambios_matricula(text, jsonb) is 'Aplica los cambios de una acción del dinero, todo o nada, y asigna los códigos de los registros nuevos (los borradores del envío) con el más alto de TODA la base. Devuelve { ok, codigos }.';

-- ---------------------------------------------------------------------------------------------------------------------
-- Permisos: la pública es de las cuentas con sesión; la base no se llama de fuera (la envoltura sí puede: corre con los permisos del dueño)
-- ---------------------------------------------------------------------------------------------------------------------
revoke execute on function public.aplicar_cambios_matricula(text, jsonb) from public, anon;
grant execute on function public.aplicar_cambios_matricula(text, jsonb) to authenticated;

revoke execute on all functions in schema app from public, anon;
grant execute on all functions in schema app to authenticated;
revoke execute on function app.aplicar_cambios_matricula_base(text, jsonb) from authenticated;

commit;
