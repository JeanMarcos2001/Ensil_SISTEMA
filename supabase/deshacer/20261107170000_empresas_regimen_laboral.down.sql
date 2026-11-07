-- Deshace la migración 0009: quita el régimen laboral de las empresas (la planilla referencial vuelve a calcularse como régimen general).

begin;

alter table public.empresas drop column if exists regimen_laboral;

commit;
