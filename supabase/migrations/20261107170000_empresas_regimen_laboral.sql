-- =====================================================================================================================
-- 0009 · Régimen laboral de cada empresa
-- ---------------------------------------------------------------------------------------------------------------------
--   · `empresas.regimen_laboral`: MYPE (micro y pequeña empresa) o General. Las 6 empresas actuales son MYPE (así lo confirmó el usuario el
--     2026-11-07): las filas que ya existen y las que se creen sin indicarlo quedan como MYPE.
--   · Solo orienta la planilla REFERENCIAL: en MYPE muestra únicamente lo ordinario (sueldo, asignación familiar, aportes de pensión, renta y
--     ajustes) y la gratificación, la CTS y el aporte de salud del empleador los calcula contabilidad; en General el sistema los estima.
--     El sistema no paga ni liquida al personal.
-- Para deshacer: supabase/deshacer/20261107170000_empresas_regimen_laboral.down.sql
-- =====================================================================================================================

begin;

alter table public.empresas
  add column regimen_laboral text not null default 'MYPE' check (regimen_laboral in ('MYPE', 'General'));

comment on column public.empresas.regimen_laboral is 'Régimen laboral de la empresa (MYPE o General). Orienta la planilla referencial: en MYPE no se calculan gratificación, CTS ni aporte de salud del empleador.';

commit;
