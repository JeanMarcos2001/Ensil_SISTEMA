-- Deshace 0019 (códigos del dinero asignados por la base): la función pública vuelve a ser la de 0018 (la base de la 0019 recupera su lugar y su
-- nombre) y se quitan el asignador y las protecciones contra repetidos. Los códigos que ya se asignaron quedan como están.
-- Después de deshacerla, la aplicación debe ser la versión anterior (la que inventa los códigos en la pantalla).
begin;

drop function if exists public.aplicar_cambios_matricula(text, jsonb);
alter function app.aplicar_cambios_matricula_base(text, jsonb) rename to aplicar_cambios_matricula;
alter function app.aplicar_cambios_matricula(text, jsonb) set schema public;
revoke execute on function public.aplicar_cambios_matricula(text, jsonb) from public, anon;
grant execute on function public.aplicar_cambios_matricula(text, jsonb) to authenticated;

drop function if exists app.codigo_maximo(text, integer);

drop index if exists public.matriculas_contrato_numero_uq;
drop index if exists public.matriculas_ficha_numero_uq;
drop index if exists public.movimientos_deposito_codigo_uq;
drop index if exists public.notas_serie_correlativo_uq;

commit;
