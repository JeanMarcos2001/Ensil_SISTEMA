-- Deshace 0004: quita el vínculo de las cuentas con Personal y borra Personal y Asignaciones (se pierden sus datos).
begin;
drop trigger if exists cuentas_despues_trg on public.cuentas;
drop trigger if exists cuentas_validar_personal_trg on public.cuentas;
drop function if exists app.cuentas_despues();
drop function if exists app.cuentas_validar_personal();
drop index if exists public.cuentas_personal_unico;
alter table public.cuentas drop constraint if exists cuentas_personal_fk;
drop function if exists public.inactivar_personal(text, text, text, date, text);
drop table if exists public.asignaciones;
drop table if exists public.personal;
drop function if exists app.asignaciones_despues();
drop function if exists app.asignaciones_validar();
drop function if exists app.personal_sincronizar();
drop function if exists app.personal_validar();
drop function if exists app.asegurar_principal(text);
drop function if exists app.sincronizar_cuenta(text);
drop function if exists app.permite(text);
commit;
