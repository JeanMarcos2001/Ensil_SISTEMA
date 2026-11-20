-- Deshace la migración 0031: se quitan los requerimientos de las sedes, sus mensajes y marcas de lectura, el enlace de los envíos con su requerimiento y las funciones nuevas.
-- ATENCIÓN: se pierden los requerimientos y los mensajes que se hayan guardado (los envíos que nacieron de un requerimiento se conservan, sin el enlace).
begin;

-- Fuera de la publicación de tiempo real
do $$
begin
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'requerimientos') then
    alter publication supabase_realtime drop table public.requerimientos;
  end if;
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'requerimiento_mensajes') then
    alter publication supabase_realtime drop table public.requerimiento_mensajes;
  end if;
end;
$$;

-- Las funciones nuevas que reciben los roles
delete from public.rol_funciones where funcion_id in ('log-requerimientos:view', 'log-requerimientos:create', 'log-requerimientos:attend', 'log-requerimientos:message');

-- Funciones públicas
drop function public.crear_requerimiento(jsonb);
drop function public.abrir_verificacion_requerimiento(text);
drop function public.verificar_requerimiento(text, jsonb, integer);
drop function public.rechazar_requerimiento(text, text, integer);
drop function public.pasar_requerimiento_a_empacando(text, integer);
drop function public.enviar_mensaje_requerimiento(text, text);
drop function public.marcar_mensajes_requerimiento_vistos(text);

-- El enlace del envío con su requerimiento
drop trigger envios_requerimiento_sync on public.envios;
drop trigger envios_requerimiento_guardar on public.envios;
drop function app.envio_sincronizar_requerimiento();
drop function app.envio_requerimiento_guardar();
drop index public.envios_requerimiento_vivo_uq;
alter table public.envios drop column requerimiento_id;

-- Esta función recibe una fila de requerimientos como parámetro: debe irse antes que la tabla
drop function app.requerimiento_abierto(public.requerimientos, integer);

-- Tablas (primero las que dependen de requerimientos)
drop table public.requerimiento_lecturas;
drop table public.requerimiento_mensajes;
drop table public.requerimientos;

-- Reglas de apoyo
drop function app.validar_lineas_requerimiento(jsonb);
drop function app.siguiente_codigo_requerimiento();
drop function app.requerimiento_visible(text);
drop function app.requerimiento_mensaje_inmutable();
drop function app.requerimiento_subir_version();

commit;
