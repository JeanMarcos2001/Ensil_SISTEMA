-- Deshace 0025 (directorio del equipo): quita la función `directorio_equipo()`. Después de deshacerla, la aplicación debe ser la versión anterior (la que lee
-- el personal solo con «Ver personal» y «Ver asignaciones»); con el código nuevo y sin esta función, el sistema sigue abriendo (el directorio se ignora si falla).
begin;

drop function if exists public.directorio_equipo();

commit;
