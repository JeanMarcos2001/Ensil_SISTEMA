-- =====================================================================================================================
-- Matrículas, planes, pagos y caja de ejemplo (generado: NO se edita a mano)
-- ---------------------------------------------------------------------------------------------------------------------
-- Sale de `src/data/seedPeople.ts` con `npx tsx scripts/doc-matriculas-seed.ts`. Requiere las migraciones 0014 (titulares y alumnos) y 0015
-- (matrículas y dinero), los 5 titulares y 5 alumnos de ejemplo (`personas_de_ejemplo.sql`), el catálogo comercial y las sedes reales.
-- Son las 5 matrículas de ejemplo con las que la agenda, la verificación y la cobranza de ejemplo se entienden (llevan los mismos códigos:
-- MAT-2026-001…). Son datos de PRUEBA (nombres y documentos inventados). Las fechas salen de un día fijo (2026-11-10).
-- Es repetible: lo que ya existe (mismo código) no se vuelve a cargar ni se modifica. Se carga con el editor SQL (sin sesión): ahí se respeta quién y
-- cuándo registró cada cosa.
-- =====================================================================================================================

begin;

insert into public.matriculas (id, fecha, alumno_id, sede_id, programa_id, nivel_id, asesor_id, origen_id, observacion, estado, titular_ids, tipo_pago_id, tarifario_id, precio_asignado, grupo_promocional_id, verificacion_estado, verificacion_items, verificacion_fecha, verificador, verificacion_obs, extension_en, extension_por, caida_fecha, caida_solicitud, reactivada_en, reactivacion_solicitud, renueva_id, documentos, creado_en, creado_por) values
  ('MAT-2026-001', '2026-09-21', 'ALU-001', 'FIL-002', '1', '1', null, '1', null, 'Activa', array['TIT-001']::text[], '4', null, 1200, null, null, array[]::text[], null, null, null, null, null, null, null, null, null, null, '{}'::jsonb, '2026-09-21T15:00:00.000Z', 'Ana G.'),
  ('MAT-2026-002', '2026-09-06', 'ALU-002', 'FIL-003', '1', '2', null, '2', null, 'Activa', array['TIT-002']::text[], '4', null, 1200, null, null, array[]::text[], null, null, null, null, null, null, null, null, null, null, '{}'::jsonb, '2026-09-06T15:00:00.000Z', 'Ana G.'),
  ('MAT-2026-003', '2026-08-07', 'ALU-003', 'FIL-002', '1', '3', null, '3', null, 'Caída', array['TIT-003']::text[], '4', null, 2100, null, null, array[]::text[], null, null, null, null, null, '2026-10-21', 'CAI-001', null, null, null, '{}'::jsonb, '2026-08-07T15:00:00.000Z', 'Ana G.'),
  ('MAT-2026-004', '2026-11-08', 'ALU-004', 'FIL-003', '2', '4', null, '4', null, 'Activa', array['TIT-004']::text[], '1', null, 1000, null, null, array[]::text[], null, null, null, null, null, null, null, null, null, null, '{}'::jsonb, '2026-11-08T15:00:00.000Z', 'Ana G.'),
  ('MAT-2026-005', '2026-08-17', 'ALU-005', 'FIL-002', '1', '1', null, '5', null, 'Activa', array['TIT-005']::text[], '1', null, 1500, null, null, array[]::text[], null, null, null, null, null, null, null, null, null, null, '{}'::jsonb, '2026-08-17T15:00:00.000Z', 'Ana G.')
on conflict do nothing;

insert into public.planes (id, matricula_id, tipo, total, saldo, estado) values
  ('PLN-001', 'MAT-2026-001', 'Plan 6', 1200, 800, 'Al día'),
  ('PLN-002', 'MAT-2026-002', 'Plan 6', 1200, 700, 'Atrasado'),
  ('PLN-003', 'MAT-2026-003', 'Plan 6', 2100, 150, 'Caída'),
  ('PLN-004', 'MAT-2026-004', 'Contado', 1000, 0, 'Al día'),
  ('PLN-005', 'MAT-2026-005', 'Contado', 1500, 0, 'Al día')
on conflict do nothing;

insert into public.cuotas (plan_id, id, orden, nombre, monto, saldo, vence, estado, cobros, variable, es_mora, mora_de, mora_cobrada, refinanciada_de, refinanciada_a, reactivada_desde, anulada_por_caida, condonada, nota, creada_en) values
  ('PLN-001', 'C1', 1, 'Cuota 1', 200, 0, '2026-09-21', 'Pagada', '[{"id":"P1","paymentId":"PAG-001","date":"2026-09-21","amount":200,"receipt":"B001-000123"}]'::jsonb, false, false, null, null, null, null, null, false, false, null, null),
  ('PLN-001', 'C2', 2, 'Cuota 2', 200, 0, '2026-10-21', 'Pagada', '[{"id":"P1","paymentId":"PAG-002","date":"2026-10-19","amount":200,"receipt":"B001-000124"}]'::jsonb, false, false, null, null, null, null, null, false, false, null, null),
  ('PLN-001', 'C3', 3, 'Cuota 3', 200, 200, '2026-11-20', 'Pendiente', '[]'::jsonb, false, false, null, null, null, null, null, false, false, null, null),
  ('PLN-001', 'C4', 4, 'Cuota 4', 200, 200, '2026-12-20', 'Pendiente', '[]'::jsonb, false, false, null, null, null, null, null, false, false, null, null),
  ('PLN-001', 'C5', 5, 'Cuota 5', 200, 200, '2027-01-19', 'Pendiente', '[]'::jsonb, false, false, null, null, null, null, null, false, false, null, null),
  ('PLN-001', 'C6', 6, 'Cuota 6', 200, 200, '2027-02-18', 'Pendiente', '[]'::jsonb, false, false, null, null, null, null, null, false, false, null, null),
  ('PLN-002', 'C1', 1, 'Cuota 1', 200, 0, '2026-09-06', 'Pagada', '[{"id":"P1","paymentId":"PAG-003","date":"2026-09-06","amount":200,"receipt":"B001-000125"}]'::jsonb, false, false, null, null, null, null, null, false, false, null, null),
  ('PLN-002', 'C2', 2, 'Cuota 2', 200, 0, '2026-10-06', 'Pagada', '[{"id":"P1","paymentId":"PAG-004","date":"2026-10-04","amount":200,"receipt":"B001-000126"}]'::jsonb, false, false, null, null, null, null, null, false, false, null, null),
  ('PLN-002', 'C3', 3, 'Cuota 3', 200, 100, '2026-11-05', 'Vencida', '[{"id":"P1","paymentId":"PAG-005","date":"2026-11-02","amount":100,"receipt":"B001-000127"}]'::jsonb, false, false, null, null, null, null, null, false, false, null, null),
  ('PLN-002', 'C4', 4, 'Cuota 4', 200, 200, '2026-12-05', 'Pendiente', '[]'::jsonb, false, false, null, null, null, null, null, false, false, null, null),
  ('PLN-002', 'C5', 5, 'Cuota 5', 200, 200, '2027-01-04', 'Pendiente', '[]'::jsonb, false, false, null, null, null, null, null, false, false, null, null),
  ('PLN-002', 'C6', 6, 'Cuota 6', 200, 200, '2027-02-03', 'Pendiente', '[]'::jsonb, false, false, null, null, null, null, null, false, false, null, null),
  ('PLN-003', 'C1', 1, 'Cuota 1', 350, 0, '2026-08-07', 'Pagada', '[{"id":"P1","paymentId":"PAG-006","date":"2026-08-07","amount":350,"receipt":"F001-000890"}]'::jsonb, false, false, null, null, null, null, null, false, false, null, null),
  ('PLN-003', 'C2', 2, 'Cuota 2', 350, 0, '2026-09-06', 'Pagada', '[{"id":"P1","paymentId":"PAG-007","date":"2026-09-04","amount":350,"receipt":"F001-000912"}]'::jsonb, false, false, null, null, null, null, null, false, false, null, null),
  ('PLN-003', 'C3', 3, 'Cuota 3', 350, 150, '2026-10-06', 'Vencida', '[{"id":"P1","paymentId":"PAG-008","date":"2026-10-03","amount":200,"receipt":"B001-000501"}]'::jsonb, false, false, null, null, null, null, null, false, false, null, null),
  ('PLN-003', 'C4', 4, 'Cuota 4', 350, 0, '2026-11-05', 'Anulada', '[]'::jsonb, false, false, null, null, null, null, null, true, false, 'Anulada por caída de la matrícula', null),
  ('PLN-003', 'C5', 5, 'Cuota 5', 350, 0, '2026-12-05', 'Anulada', '[]'::jsonb, false, false, null, null, null, null, null, true, false, 'Anulada por caída de la matrícula', null),
  ('PLN-003', 'C6', 6, 'Cuota 6', 350, 0, '2027-01-04', 'Anulada', '[]'::jsonb, false, false, null, null, null, null, null, true, false, 'Anulada por caída de la matrícula', null)
on conflict do nothing;

insert into public.pagos (id, fecha, alumno_nombre, concepto, monto, medio, comprobante, documento, estado, reversa, partes, moneda, grupo_promocional_id, matricula_ids, sede_id, comentario, creado_por) values
  ('PAG-001', '2026-09-21', 'Mateo Ruiz Paredes', 'Pago de Cuota 1', 200, 'Transferencia', 'B001-000123', '{"type":"Boleta","serie":"B001","number":"000123"}'::jsonb, 'Aprobado', null, '[{"id":"PT1","currency":"USD","amount":200,"method":"Transferencia","bank":"BCP","operationNumber":"OP-4471","evidence":"OP-4471.jpg"}]'::jsonb, 'USD', null, array['MAT-2026-001']::text[], 'FIL-002', null, 'Ana G.'),
  ('PAG-002', '2026-10-19', 'Mateo Ruiz Paredes', 'Pago de Cuota 2', 200, 'Efectivo', 'B001-000124', '{"type":"Boleta","serie":"B001","number":"000124"}'::jsonb, 'Aprobado', null, '[{"id":"PT2","currency":"PEN","amount":750,"exchangeRate":3.75,"method":"Efectivo"}]'::jsonb, 'USD', null, array['MAT-2026-001']::text[], 'FIL-002', null, 'Carlos R.'),
  ('PAG-003', '2026-09-06', 'Sofia Castro Lama', 'Pago de Cuota 1', 200, 'Transferencia', 'B001-000125', '{"type":"Boleta","serie":"B001","number":"000125"}'::jsonb, 'Aprobado', null, '[{"id":"PT3","currency":"USD","amount":200,"method":"Transferencia","bank":"BCP","operationNumber":"OP-4502","evidence":"OP-4502.jpg"}]'::jsonb, 'USD', null, array['MAT-2026-002']::text[], 'FIL-003', null, 'Ana G.'),
  ('PAG-004', '2026-10-04', 'Sofia Castro Lama', 'Pago de Cuota 2', 200, 'Efectivo', 'B001-000126', '{"type":"Boleta","serie":"B001","number":"000126"}'::jsonb, 'Aprobado', null, '[{"id":"PT4","currency":"PEN","amount":750,"exchangeRate":3.75,"method":"Efectivo"}]'::jsonb, 'USD', null, array['MAT-2026-002']::text[], 'FIL-003', null, 'Carlos R.'),
  ('PAG-005', '2026-11-02', 'Sofia Castro Lama', 'Pago de Cuota 3', 100, 'Yape', 'B001-000127', '{"type":"Boleta","serie":"B001","number":"000127"}'::jsonb, 'Aprobado', null, '[{"id":"PT5","currency":"PEN","amount":375,"exchangeRate":3.75,"method":"Yape","operationNumber":"YP-8830","evidence":"YP-8830.jpg"}]'::jsonb, 'USD', null, array['MAT-2026-002']::text[], 'FIL-003', null, 'Ana G.'),
  ('PAG-006', '2026-08-07', 'Lucas Vega Soto', 'Pago de Cuota 1', 350, 'Transferencia', 'F001-000890', '{"type":"Factura","serie":"F001","number":"000890"}'::jsonb, 'Aprobado', null, '[{"id":"PT6","currency":"USD","amount":350,"method":"Transferencia","bank":"BCP","operationNumber":"OP-3911","evidence":"OP-3911.jpg"}]'::jsonb, 'USD', null, array['MAT-2026-003']::text[], 'FIL-002', null, 'Ana G.'),
  ('PAG-007', '2026-09-04', 'Lucas Vega Soto', 'Pago de Cuota 2', 350, 'Transferencia', 'F001-000912', '{"type":"Factura","serie":"F001","number":"000912"}'::jsonb, 'Aprobado', null, '[{"id":"PT7","currency":"USD","amount":350,"method":"Transferencia","bank":"BCP","operationNumber":"OP-3975","evidence":"OP-3975.jpg"}]'::jsonb, 'USD', null, array['MAT-2026-003']::text[], 'FIL-002', null, 'Carlos R.'),
  ('PAG-008', '2026-10-03', 'Lucas Vega Soto', 'Pago de Cuota 3', 200, 'Yape', 'B001-000501', '{"type":"Boleta","serie":"B001","number":"000501"}'::jsonb, 'Aprobado', null, '[{"id":"PT8","currency":"PEN","amount":750,"exchangeRate":3.75,"method":"Yape","operationNumber":"YP-7204","evidence":"YP-7204.jpg"}]'::jsonb, 'USD', null, array['MAT-2026-003']::text[], 'FIL-002', null, 'Ana G.'),
  ('PAG-009', '2026-11-08', 'Valentina Silva Reyes', 'Contado', 1000, 'Transferencia', 'B001-000128', '{"type":"Boleta","serie":"B001","number":"000128"}'::jsonb, 'Aprobado', null, '[{"id":"PT9","currency":"USD","amount":1000,"method":"Transferencia","bank":"BCP","operationNumber":"OP-5120","evidence":"OP-5120.jpg"}]'::jsonb, 'USD', null, array['MAT-2026-004']::text[], 'FIL-003', null, 'Ana G.'),
  ('PAG-010', '2026-08-17', 'Diego Torres Díaz', 'Contado', 1500, 'Efectivo', 'B001-000129', '{"type":"Boleta","serie":"B001","number":"000129"}'::jsonb, 'Aprobado', null, '[{"id":"PT10","currency":"PEN","amount":5625,"exchangeRate":3.75,"method":"Efectivo"}]'::jsonb, 'USD', null, array['MAT-2026-005']::text[], 'FIL-002', null, 'Carlos R.')
on conflict do nothing;

insert into public.movimientos_caja (id, fecha, tipo, concepto, referencia, moneda, monto, tipo_cambio, monto_usd, medio, banco, operacion, sede_id, pago_id, matricula_ids, estado, reversa, lote_deposito, deposito, venta, creado_en, creado_por) values
  ('CJ-001', '2026-09-21T15:30:00.000Z', 'Ingreso', 'Ingreso cuota', 'MAT-2026-001 / Mateo Ruiz Paredes', 'USD', 200, null, 200, 'Transferencia', 'BCP', 'OP-4471', 'FIL-002', 'PAG-001', array['MAT-2026-001']::text[], 'Aplicado', null, null, null, null, '2026-09-21T15:30:00.000Z', 'Ana G.'),
  ('CJ-002', '2026-10-19T15:30:00.000Z', 'Ingreso', 'Ingreso cuota', 'MAT-2026-001 / Mateo Ruiz Paredes', 'PEN', 750, 3.75, 200, 'Efectivo', null, null, 'FIL-002', 'PAG-002', array['MAT-2026-001']::text[], 'Aplicado', null, null, null, null, '2026-10-19T15:30:00.000Z', 'Carlos R.'),
  ('CJ-003', '2026-09-06T15:30:00.000Z', 'Ingreso', 'Ingreso cuota', 'MAT-2026-002 / Sofia Castro Lama', 'USD', 200, null, 200, 'Transferencia', 'BCP', 'OP-4502', 'FIL-003', 'PAG-003', array['MAT-2026-002']::text[], 'Aplicado', null, null, null, null, '2026-09-06T15:30:00.000Z', 'Ana G.'),
  ('CJ-004', '2026-10-04T15:30:00.000Z', 'Ingreso', 'Ingreso cuota', 'MAT-2026-002 / Sofia Castro Lama', 'PEN', 750, 3.75, 200, 'Efectivo', null, null, 'FIL-003', 'PAG-004', array['MAT-2026-002']::text[], 'Aplicado', null, null, null, null, '2026-10-04T15:30:00.000Z', 'Carlos R.'),
  ('CJ-005', '2026-11-02T15:30:00.000Z', 'Ingreso', 'Ingreso cuota', 'MAT-2026-002 / Sofia Castro Lama', 'PEN', 375, 3.75, 100, 'Yape', null, 'YP-8830', 'FIL-003', 'PAG-005', array['MAT-2026-002']::text[], 'Aplicado', null, null, null, null, '2026-11-02T15:30:00.000Z', 'Ana G.'),
  ('CJ-006', '2026-08-07T15:30:00.000Z', 'Ingreso', 'Ingreso cuota', 'MAT-2026-003 / Lucas Vega Soto', 'USD', 350, null, 350, 'Transferencia', 'BCP', 'OP-3911', 'FIL-002', 'PAG-006', array['MAT-2026-003']::text[], 'Aplicado', null, null, null, null, '2026-08-07T15:30:00.000Z', 'Ana G.'),
  ('CJ-007', '2026-09-04T15:30:00.000Z', 'Ingreso', 'Ingreso cuota', 'MAT-2026-003 / Lucas Vega Soto', 'USD', 350, null, 350, 'Transferencia', 'BCP', 'OP-3975', 'FIL-002', 'PAG-007', array['MAT-2026-003']::text[], 'Aplicado', null, null, null, null, '2026-09-04T15:30:00.000Z', 'Carlos R.'),
  ('CJ-008', '2026-10-03T15:30:00.000Z', 'Ingreso', 'Ingreso cuota', 'MAT-2026-003 / Lucas Vega Soto', 'PEN', 750, 3.75, 200, 'Yape', null, 'YP-7204', 'FIL-002', 'PAG-008', array['MAT-2026-003']::text[], 'Aplicado', null, null, null, null, '2026-10-03T15:30:00.000Z', 'Ana G.'),
  ('CJ-009', '2026-11-08T15:30:00.000Z', 'Ingreso', 'Ingreso matrícula (contado)', 'MAT-2026-004 / Valentina Silva Reyes', 'USD', 1000, null, 1000, 'Transferencia', 'BCP', 'OP-5120', 'FIL-003', 'PAG-009', array['MAT-2026-004']::text[], 'Aplicado', null, null, null, null, '2026-11-08T15:30:00.000Z', 'Ana G.'),
  ('CJ-010', '2026-08-17T15:30:00.000Z', 'Ingreso', 'Ingreso matrícula (contado)', 'MAT-2026-005 / Diego Torres Díaz', 'PEN', 5625, 3.75, 1500, 'Efectivo', null, null, 'FIL-002', 'PAG-010', array['MAT-2026-005']::text[], 'Aplicado', null, null, null, null, '2026-08-17T15:30:00.000Z', 'Carlos R.'),
  ('CJ-011', '2026-11-07T22:45:00.000Z', 'Egreso', 'Egreso', 'Pago Proveedor Limpieza', 'PEN', 350, 3.75, 93.33, 'Efectivo', null, null, 'FIL-002', null, array[]::text[], 'Aplicado', null, null, null, null, '2026-11-07T22:45:00.000Z', 'Admin')
on conflict do nothing;

commit;
