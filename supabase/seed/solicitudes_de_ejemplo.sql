-- =====================================================================================================================
-- Solicitudes sobre matrículas de ejemplo (generado: NO se edita a mano)
-- ---------------------------------------------------------------------------------------------------------------------
-- Sale de `src/data/seedPeople.ts` con `npx tsx scripts/doc-solicitudes-seed.ts`. Requiere la migración 0018 (solicitudes y correcciones de matrículas) y las
-- matrículas de ejemplo (`matriculas_de_ejemplo.sql`). Es la solicitud de caída de ejemplo (CAI-001, ya aprobada) que la matrícula MAT-2026-003
-- ya nombra. Son datos de PRUEBA. Las fechas salen de un día fijo (2026-11-10). Es repetible: lo que ya existe (mismo código) no se vuelve a cargar ni
-- se modifica. Se carga con el editor SQL (sin sesión): ahí se respeta quién pidió y quién resolvió cada solicitud.
-- =====================================================================================================================

begin;

insert into public.solicitudes_matricula (id, tipo, matricula_id, motivo, detalle, fecha_efecto, datos, estado, resuelta_en, resuelta_por, nota_resolucion, efectos, creado_en, creado_por) values
  ('CAI-001', 'Caída', 'MAT-2026-003', 'Motivos económicos', 'El titular indica que no podrá continuar con los pagos.', '2026-10-21', '{}'::jsonb, 'Aprobada', '2026-10-23T14:30:00.000Z', 'Superadmin', 'Aprobada. Las cuotas futuras se anularon; queda pendiente la cuota 3.', '{"annulledInstallments":3,"annulledUSD":1050,"overdueInstallments":1,"overdueUSD":150,"overdueForgiven":false,"paidUSD":900,"cancelledSchedules":1,"removedActivities":0,"studentDeactivated":true}'::jsonb, '2026-10-22T16:00:00.000Z', 'Ana G.')
on conflict do nothing;

commit;
