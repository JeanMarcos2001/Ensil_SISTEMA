-- Deshace 0010 (catálogo comercial en la base). Borra las tablas del catálogo CON sus datos: antes de ejecutarlo, copie lo que quiera conservar.
begin;

drop trigger if exists sedes_catalogo_eliminar on public.sedes;
drop function if exists app.sede_catalogo_eliminar_guarda();

drop table if exists public.tarifarios;
drop table if exists public.promociones;
drop table if exists public.niveles;
drop table if exists public.tipos_pago;
drop table if exists public.programas;
drop table if exists public.origenes_lead;

drop function if exists app.programa_eliminar_guarda();
drop function if exists app.nivel_eliminar_guarda();
drop function if exists app.tipo_pago_eliminar_guarda();
drop function if exists app.programa_validar();
drop function if exists app.nivel_validar();
drop function if exists app.tipo_pago_validar();
drop function if exists app.tarifario_validar();
drop function if exists app.promocion_validar();
drop function if exists app.origen_lead_validar();
drop function if exists app.ids_unicos(text[]);
drop function if exists app.catalogo_huella();

commit;
