-- =====================================================================================================================
-- Caja chica de ejemplo (generado: NO se edita a mano)
-- ---------------------------------------------------------------------------------------------------------------------
-- Sale de `src/data/seedPetty.ts` con `npx tsx scripts/doc-caja-chica-seed.ts`. Requiere la migración 0017 (cierres de caja y caja chica) y las sedes
-- reales cargadas (`empresas_y_sedes_reales.sql`). Es el fondo de la caja chica de Piura (FIL-002) con los tres movimientos de ejemplo que mostraba la
-- pantalla. Son datos de PRUEBA. Las fechas salen de un día fijo (2026-11-10). Es repetible: lo que ya existe (mismo código) no se vuelve a cargar ni se
-- modifica. Se carga con el editor SQL (sin sesión): ahí se respeta quién registró cada cosa.
-- =====================================================================================================================

begin;

insert into public.caja_chica_fondos (sede_id, asignado, tope, actualizado_por) values
  ('FIL-002', 1000, 200, 'Sistema')
on conflict do nothing;

insert into public.caja_chica_movimientos (id, sede_id, fecha, tipo, categoria, concepto, monto, medio, referencia, evidencia, observaciones, usuario, estado) values
  ('CCH-003', 'FIL-002', '2026-11-10T16:30:00.000Z', 'Egreso', 'Movilidad', 'Taxi a notaría', 25, 'Efectivo', null, null, null, 'Ana G.', 'Aplicado'),
  ('CCH-002', 'FIL-002', '2026-11-09T20:20:00.000Z', 'Egreso', 'Útiles de oficina', 'Compra de papel bond', 120, 'Efectivo', 'Boleta B001-0456', null, null, 'Carlos R.', 'Aplicado'),
  ('CCH-001', 'FIL-002', '2026-11-07T14:00:00.000Z', 'Ingreso', 'Reposición de fondo', 'Reposición de fondo fijo', 1000, 'Efectivo', null, null, null, 'Admin', 'Aplicado')
on conflict do nothing;

commit;
