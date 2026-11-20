-- =====================================================================================================================
-- 0030 · Tiempo real en los envíos y número de versión de cada tarjeta (entrega 2 del tablero de envíos)
-- ---------------------------------------------------------------------------------------------------------------------
-- 1) Tiempo real. La tabla `envios` se agrega a la publicación `supabase_realtime`: la pantalla de Envíos (y la bandeja de Recepciones) escuchan los cambios y se
--    vuelven a leer solas, sin recargar la página. La base solo avisa a cada cuenta de lo que esa cuenta puede leer (la seguridad por fila se evalúa por cada cuenta
--    que escucha): la sede destino no recibe avisos de lo que se está preparando, solo desde que el envío sale (migración 0029). Si la publicación no existe
--    (una base de pruebas sin Supabase Realtime) no se hace nada, y si la tabla ya estaba, tampoco.
-- 2) Versión de cada tarjeta. `envios.version` sube en 1 con cada cambio (un disparador). Quien edita una tarjeta manda la versión que vio al abrirla y, si alguien la
--    cambió en el medio, `editar_envio` no la guarda y lo explica («Otra persona cambió esta tarjeta mientras usted la tenía abierta…»), en vez de pisar el cambio
--    ajeno sin que nadie se entere. Despachar y cancelar no la piden: son operaciones de un solo paso que ya se comprueban contra el estado actual.
-- Para deshacer: supabase/deshacer/20261120100000_tiempo_real_de_envios.down.sql
-- =====================================================================================================================

begin;

-- ---------------------------------------------------------------------------------------------------------------------
-- 1) Versión de cada tarjeta
-- ---------------------------------------------------------------------------------------------------------------------

alter table public.envios add column version integer not null default 1;
comment on column public.envios.version is 'Sube en 1 con cada cambio del envío. Quien edita una tarjeta manda la versión que vio; si cambió en el medio, no se guarda.';

create function app.envio_subir_version() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.version := old.version + 1;
  return new;
end;
$$;
create trigger envios_version before update on public.envios for each row execute function app.envio_subir_version();

-- Guarda los datos de la columna en que está el envío y, si trae un `estado` distinto, lo mueve de columna (como en la 0029); ahora además comprueba la versión que vio
-- quien edita (el dato `version` no es del envío: se ignora al revisar qué se cambia).
create or replace function public.editar_envio(p_id text, p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  e         public.envios;
  n         public.envios;
  v_a       text := app.jtexto(p, 'estado');
  v_clave   text;
  v_validas text[];
begin
  select * into e from public.envios x where x.id = p_id for update;
  if not found then raise exception 'Envío no encontrado.' using errcode = 'EN001'; end if;
  if v_a = 'En tránsito' then perform app.exigir('log-envios:dispatch', 'Realizar el envío (despachar)'); else perform app.exigir('log-envios:edit', 'Editar un envío'); end if;
  -- Quien edita manda la versión que vio al abrir la tarjeta; si alguien la cambió en el medio, no se guarda
  if p ? 'version' and app.jtexto(p, 'version') is not null and (p->>'version')::integer is distinct from e.version then
    raise exception 'Otra persona cambió esta tarjeta mientras usted la tenía abierta: ya se actualizó en pantalla. Revise y vuelva a intentar.' using errcode = 'EN001';
  end if;

  if e.estado in ('Por armar', 'Empacando', 'Por despachar') then
    v_validas := case e.estado
      when 'Por armar' then array['almacen_origen_id', 'sede_destino_id', 'lineas', 'observacion', 'adjuntos', 'estado']
      when 'Empacando' then array['cajas', 'observacion', 'adjuntos', 'estado']
      else array['metodo_envio_id', 'courier_id', 'numero_guia', 'referencia_adicional', 'viajero_nombre', 'viajero_documento', 'observacion_envio', 'eta', 'eta_hora', 'observacion', 'adjuntos', 'estado']
    end;
    for v_clave in select k from jsonb_object_keys(p) k loop
      if v_clave <> 'version' and not (v_clave = any (v_validas)) then
        raise exception '%', case
          when v_clave in ('almacen_origen_id', 'sede_destino_id', 'lineas') then 'La lista de artículos y el destino solo se cambian en «Por armar»: devuelva la tarjeta a esa columna.'
          when v_clave = 'cajas' then 'Las cajas solo se arman en «Empacando»: devuelva la tarjeta a esa columna.'
          when v_clave in ('metodo_envio_id', 'courier_id', 'numero_guia', 'referencia_adicional', 'viajero_nombre', 'viajero_documento', 'observacion_envio', 'eta', 'eta_hora')
            then 'El transporte y la fecha de llegada se registran en «Por despachar»: pase la tarjeta a esa columna.'
          else 'Ese dato no se puede cambiar en «' || e.estado || '».'
        end using errcode = 'EN001';
      end if;
    end loop;

    update public.envios x set
      almacen_origen_id = case when p ? 'almacen_origen_id' then coalesce(app.jtexto(p, 'almacen_origen_id'), x.almacen_origen_id) else x.almacen_origen_id end,
      sede_destino_id = case when p ? 'sede_destino_id' then coalesce(app.jtexto(p, 'sede_destino_id'), x.sede_destino_id) else x.sede_destino_id end,
      cajas = case when p ? 'cajas' then coalesce(p->'cajas', '[]'::jsonb) else x.cajas end,
      lineas = case when p ? 'lineas' then coalesce(p->'lineas', '[]'::jsonb) else x.lineas end,
      metodo_envio_id = case when p ? 'metodo_envio_id' then app.jtexto(p, 'metodo_envio_id') else x.metodo_envio_id end,
      courier_id = case when p ? 'courier_id' then app.jtexto(p, 'courier_id') else x.courier_id end,
      numero_guia = case when p ? 'numero_guia' then app.jtexto(p, 'numero_guia') else x.numero_guia end,
      referencia_adicional = case when p ? 'referencia_adicional' then app.jtexto(p, 'referencia_adicional') else x.referencia_adicional end,
      viajero_nombre = case when p ? 'viajero_nombre' then app.jtexto(p, 'viajero_nombre') else x.viajero_nombre end,
      viajero_documento = case when p ? 'viajero_documento' then app.jtexto(p, 'viajero_documento') else x.viajero_documento end,
      observacion_envio = case when p ? 'observacion_envio' then app.jtexto(p, 'observacion_envio') else x.observacion_envio end,
      eta = case when p ? 'eta' then nullif(p->>'eta', '')::date else x.eta end,
      eta_hora = case when p ? 'eta_hora' then app.jtexto(p, 'eta_hora') else x.eta_hora end,
      observacion = case when p ? 'observacion' then app.jtexto(p, 'observacion') else x.observacion end,
      adjuntos = case when p ? 'adjuntos' then coalesce(array(select jsonb_array_elements_text(coalesce(p->'adjuntos', '[]'::jsonb))), '{}') else x.adjuntos end
    where x.id = p_id;
    select * into n from public.envios x where x.id = p_id;
    if p ? 'lineas' or p ? 'almacen_origen_id' or p ? 'sede_destino_id' then perform app.envio_validar_etapa(n, 'Por armar'); end if;
    if p ? 'cajas' then perform app.validar_cajas_avance(n.lineas, n.cajas); end if;
    if v_a is not null and v_a is distinct from e.estado then perform app.mover_envio(p_id, v_a); end if;
    return;
  end if;

  -- Ya despachado, el contenido no cambia: solo se habilita la recepción manual
  if (select count(*) from jsonb_object_keys(p) k where k not in ('habilitar_recepcion_manual', 'estado', 'version')) > 0 or (p ? 'estado' and app.jtexto(p, 'estado') is distinct from e.estado) then
    raise exception 'Un envío despachado ya no se edita: cancélelo y prepare otro.' using errcode = 'EN001';
  end if;
  if e.estado not in ('En tránsito', 'Listo para recepción') then raise exception 'Este envío ya está cerrado.' using errcode = 'EN001'; end if;
  update public.envios x set habilitar_recepcion_manual = coalesce((p->>'habilitar_recepcion_manual')::boolean, x.habilitar_recepcion_manual) where x.id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- 2) Tiempo real
-- ---------------------------------------------------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'envios') then
    alter publication supabase_realtime add table public.envios;
  end if;
end;
$$;

commit;
