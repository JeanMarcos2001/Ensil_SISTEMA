-- Deshace 0020 (códigos de Personal, Asignaciones y Contratos de personal asignados por la base): los disparadores y el asignador se quitan y
-- `crear_contrato`, `renovar_contrato` y `agregar_ajuste_planilla` vuelven a ser las de la 0007 (sin devolver nada). Los códigos que ya se asignaron
-- quedan como están.
-- Después de deshacerla, la aplicación debe ser la versión anterior (la que inventa estos códigos en la pantalla).
begin;

drop trigger if exists personal_asignar_codigo_trg on public.personal;
drop trigger if exists asignaciones_asignar_codigo_trg on public.asignaciones;
drop function if exists app.personal_asignar_codigo();
drop function if exists app.asignaciones_asignar_codigo();

drop function if exists public.crear_contrato(text, jsonb);
alter function app.crear_contrato_base(text, jsonb) rename to crear_contrato;
alter function app.crear_contrato(text, jsonb) set schema public;

drop function if exists public.renovar_contrato(text, text, jsonb);
alter function app.renovar_contrato_base(text, text, jsonb) rename to renovar_contrato;
alter function app.renovar_contrato(text, text, jsonb) set schema public;

drop function if exists public.agregar_ajuste_planilla(text, text, jsonb, text);
alter function app.agregar_ajuste_planilla_base(text, text, jsonb, text) rename to agregar_ajuste_planilla;
alter function app.agregar_ajuste_planilla(text, text, jsonb, text) set schema public;

revoke execute on function public.crear_contrato(text, jsonb), public.renovar_contrato(text, text, jsonb), public.agregar_ajuste_planilla(text, text, jsonb, text) from public, anon;
grant execute on function public.crear_contrato(text, jsonb), public.renovar_contrato(text, text, jsonb), public.agregar_ajuste_planilla(text, text, jsonb, text) to authenticated;

drop function if exists app.numero_con_relleno(integer, integer);
drop function if exists app.siguiente_numero(text);

commit;
