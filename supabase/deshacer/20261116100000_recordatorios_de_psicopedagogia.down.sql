-- Deshace 0024 (agenda de Psicopedagogía, tercera entrega: política y registro de recordatorios de Psicopedagogía en la base): se quitan las dos tablas (con lo que
-- tengan guardado: las versiones de la política y los recordatorios registrados) y las funciones nuevas. Después de deshacerla, la aplicación debe ser la versión
-- anterior (la que guarda la política y los recordatorios en memoria).
begin;

drop function if exists public.guardar_politica_recordatorios_psy(integer[], integer[], integer[]);
drop function if exists public.registrar_recordatorio_psy(text, text, text, integer, text, text, text);

drop policy if exists psy_politicas_leer on public.psy_recordatorio_politicas;
drop policy if exists psy_recordatorios_leer on public.psy_recordatorios;

drop trigger if exists psy_politicas_no_cambian on public.psy_recordatorio_politicas;
drop trigger if exists psy_politicas_no_vaciar on public.psy_recordatorio_politicas;
drop trigger if exists psy_recordatorios_no_cambian on public.psy_recordatorios;
drop trigger if exists psy_recordatorios_no_vaciar on public.psy_recordatorios;

drop table if exists public.psy_recordatorios;
drop table if exists public.psy_recordatorio_politicas;

drop function if exists app.psy_politica_vigente();
drop function if exists app.puede_leer_recordatorios_psy();
drop function if exists app.psy_politica_inmutable();
drop function if exists app.psy_recordatorio_inmutable();

commit;
