-- Deshace 0021 (política de cobranza, recordatorios registrados y plantilla del contrato en la base): se quitan las tres tablas (con lo que tengan
-- guardado: las versiones de la política, los recordatorios y las versiones de la plantilla) y `aplicar_cambios_matricula` vuelve a ser la envoltura de
-- la 0019 (sin vigilar la mora). Los contratos ya generados siguen guardando su `templateVersion` dentro de la matrícula, pero la aplicación anterior
-- no lo usa.
-- Después de deshacerla, la aplicación debe ser la versión anterior (la que guarda la política, los recordatorios y la plantilla en memoria).
begin;

drop function if exists public.aplicar_cambios_matricula(text, jsonb);
alter function app.aplicar_cambios_matricula_con_codigos(text, jsonb) rename to aplicar_cambios_matricula;
alter function app.aplicar_cambios_matricula(text, jsonb) set schema public;
revoke execute on function public.aplicar_cambios_matricula(text, jsonb) from public, anon;
grant execute on function public.aplicar_cambios_matricula(text, jsonb) to authenticated;

drop function if exists public.guardar_politica_cobranza(integer, numeric, integer[], integer[]);
drop function if exists public.registrar_recordatorio(text, text, integer, text, text, text);
drop function if exists public.guardar_plantilla_contrato(text, jsonb, text, boolean);
drop function if exists app.verificar_mora(jsonb);

drop policy if exists politicas_leer on public.cobranza_politicas;
drop policy if exists plantilla_leer on public.plantilla_contrato_versiones;
drop policy if exists recordatorios_leer on public.recordatorios_cobranza;

drop trigger if exists politicas_no_cambian on public.cobranza_politicas;
drop trigger if exists politicas_no_vaciar on public.cobranza_politicas;
drop trigger if exists recordatorios_no_cambian on public.recordatorios_cobranza;
drop trigger if exists recordatorios_no_vaciar on public.recordatorios_cobranza;
drop trigger if exists plantilla_no_cambia on public.plantilla_contrato_versiones;
drop trigger if exists plantilla_no_vaciar on public.plantilla_contrato_versiones;

drop table if exists public.recordatorios_cobranza;
drop table if exists public.cobranza_politicas;
drop table if exists public.plantilla_contrato_versiones;

drop function if exists app.politica_cobranza_vigente();
drop function if exists app.puede_leer_recordatorios();
drop function if exists app.politica_inmutable();
drop function if exists app.recordatorio_inmutable();
drop function if exists app.plantilla_inmutable();

commit;
