-- Deshace la migración 0026 (avisos de la campana en la base). Borra los avisos y sus marcas de leído guardados.
begin;

drop function if exists public.mis_avisos(integer);
drop function if exists public.emitir_aviso(text, text, text, text, jsonb, text, text);
drop function if exists public.marcar_avisos_leidos(text[]);
drop table if exists public.avisos_lecturas;
drop table if exists public.avisos;
drop table if exists public.aviso_eventos;
drop function if exists app.aviso_es_para_mi(text, text, text, text, uuid, text);
drop function if exists app.aviso_destinatarios(text, text, text, text, uuid, text);
drop function if exists app.aviso_alcanza(uuid, text);
drop function if exists app.puede_leer_avisos();
drop function if exists app.aviso_lectura_inmutable();
drop function if exists app.aviso_inmutable();

commit;
