-- Deshace la migración 0014 (titulares y alumnos). CUIDADO: borra los titulares, los alumnos y sus vínculos guardados.

begin;

drop function if exists public.crear_personas(jsonb);
drop function if exists public.editar_titular(text, jsonb);
drop function if exists public.editar_alumno(text, jsonb);

drop table if exists public.alumno_titulares;
drop table if exists public.alumnos;
drop table if exists public.titulares;

drop function if exists app.alumno_completar(text);
drop function if exists app.vincular_titulares(text, jsonb);
drop function if exists app.titular_eliminar_guarda();
drop function if exists app.alumno_validar();
drop function if exists app.titular_validar();
drop function if exists app.persona_validar_comun(text, text, date, text, text);
drop function if exists app.validar_documento(text, text);
drop function if exists app.edad_en(date, date);
drop function if exists app.puede_leer_titulares();
drop function if exists app.puede_leer_alumnos();
drop function if exists app.exigir_alguna(text[], text);
drop function if exists app.tiene_alguna(text[]);

commit;
