-- =====================================================================================================================
-- Catálogo comercial de partida (generado: NO se edita a mano)
-- ---------------------------------------------------------------------------------------------------------------------
-- Sale de `src/data/seedCatalog.ts` con `npx tsx scripts/doc-catalogo-seed.ts`. Requiere la migración 0010 (catálogo comercial) y las sedes
-- reales cargadas (`empresas_y_sedes_reales.sql`): «Pre-lectura» solo se ofrece en Piura y Chiclayo.
-- Es repetible: lo que ya existe (mismo id o mismo código) no se vuelve a cargar ni se modifica.
-- No incluye «Especialización»: el programa avanzado es solo «Profesional».
-- =====================================================================================================================

begin;

insert into public.programas (id, codigo, nombre, alias, descripcion, tiene_niveles, duracion_base, garantia, todas_las_sedes, sedes_habilitadas, estado, observaciones) values
  ('1', 'PRG-KIDS', 'Kids', null, null, true, 3, 3, true, array[]::text[], 'Activo', null),
  ('2', 'PRG-PK', 'Pre-Kids', null, null, true, 3, 3, true, array[]::text[], 'Activo', null),
  ('3', 'PRG-PL', 'Pre-lectura', null, null, false, 3, 3, false, array['FIL-002', 'FIL-003']::text[], 'Activo', null),
  ('5', 'PRG-PROF', 'Profesional', null, null, false, 6, 6, true, array[]::text[], 'Activo', null)
on conflict do nothing;

insert into public.niveles (id, programa_id, codigo, nombre, orden, estado, descripcion) values
  ('1', '1', 'NVL-KIDS-1', 'Nivel 1', 1, 'Activo', null),
  ('2', '1', 'NVL-KIDS-2', 'Nivel 2', 2, 'Activo', null),
  ('3', '1', 'NVL-KIDS-3', 'Nivel 3', 3, 'Activo', null),
  ('4', '2', 'NVL-PK-1', 'Nivel 1', 1, 'Activo', null)
on conflict do nothing;

insert into public.tipos_pago (id, codigo, nombre, cuotas, intervalo_dias, modalidad, estado, descripcion) values
  ('1', 'TP-CONT', 'Contado', 1, 0, 'inmediato', 'Activo', null),
  ('2', 'TP-C2P', 'Contado en 2 partes', 2, 30, 'fechas_manuales', 'Activo', null),
  ('3', 'TP-P3', 'Plan 3', 3, 30, 'intervalo_fijo', 'Activo', null),
  ('4', 'TP-P6', 'Plan 6', 6, 30, 'intervalo_fijo', 'Activo', null),
  ('5', 'TP-P9', 'Plan 9', 9, 30, 'intervalo_fijo', 'Activo', null)
on conflict do nothing;

insert into public.tarifarios (id, nombre, programa_id, nivel_id, tipo_pago_id, sede_id, moneda, precio_base, lineas, vigencia_inicio, vigencia_fin, estado) values
  ('1', 'Kids - Contado 2026', '1', null, '1', null, 'USD', 500, '[{"numero":1,"concepto":"Pago único","monto":500,"dias":0,"tipo":"unica","variable":false}]'::jsonb, '2026-01-01', '2026-12-31', 'Activo'),
  ('2', 'Kids - Contado en 2 partes 2026', '1', null, '2', null, 'USD', 500, '[{"numero":1,"concepto":"Parte 1","monto":0,"dias":0,"tipo":"parte","variable":true},{"numero":2,"concepto":"Parte 2 (saldo)","monto":0,"dias":30,"tipo":"parte","variable":true}]'::jsonb, '2026-01-01', '2026-12-31', 'Activo'),
  ('3', 'Pre-Kids - Contado 2026', '2', null, '1', null, 'USD', 500, '[{"numero":1,"concepto":"Pago único","monto":500,"dias":0,"tipo":"unica","variable":false}]'::jsonb, '2026-01-01', '2026-12-31', 'Activo'),
  ('4', 'Pre-lectura - Plan 3 2026', '3', null, '3', null, 'USD', 1000, '[{"numero":0,"concepto":"Matrícula","monto":100,"dias":0,"tipo":"matricula","variable":false},{"numero":1,"concepto":"Cuota 1","monto":300,"dias":0,"tipo":"cuota","variable":false},{"numero":2,"concepto":"Cuota 2","monto":300,"dias":30,"tipo":"cuota","variable":false},{"numero":3,"concepto":"Cuota 3","monto":300,"dias":60,"tipo":"cuota","variable":false}]'::jsonb, '2026-01-01', null, 'Activo'),
  ('5', 'Profesional - Contado 2026', '5', null, '1', null, 'USD', 1000, '[{"numero":1,"concepto":"Pago único","monto":1000,"dias":0,"tipo":"unica","variable":false}]'::jsonb, '2026-01-01', '2026-12-31', 'Activo'),
  ('6', 'Profesional - Plan 3 2026', '5', null, '3', null, 'USD', 1200, '[{"numero":0,"concepto":"Matrícula","monto":300,"dias":0,"tipo":"matricula","variable":false},{"numero":1,"concepto":"Cuota 1","monto":300,"dias":0,"tipo":"cuota","variable":false},{"numero":2,"concepto":"Cuota 2","monto":300,"dias":30,"tipo":"cuota","variable":false},{"numero":3,"concepto":"Cuota 3","monto":300,"dias":60,"tipo":"cuota","variable":false}]'::jsonb, '2026-01-01', '2026-12-31', 'Activo'),
  ('7', 'Profesional - Plan 6 2026', '5', null, '4', null, 'USD', 1400, '[{"numero":0,"concepto":"Matrícula","monto":200,"dias":0,"tipo":"matricula","variable":false},{"numero":1,"concepto":"Cuota 1","monto":200,"dias":0,"tipo":"cuota","variable":false},{"numero":2,"concepto":"Cuota 2","monto":200,"dias":30,"tipo":"cuota","variable":false},{"numero":3,"concepto":"Cuota 3","monto":200,"dias":60,"tipo":"cuota","variable":false},{"numero":4,"concepto":"Cuota 4","monto":200,"dias":90,"tipo":"cuota","variable":false},{"numero":5,"concepto":"Cuota 5","monto":200,"dias":120,"tipo":"cuota","variable":false},{"numero":6,"concepto":"Cuota 6","monto":200,"dias":150,"tipo":"cuota","variable":false}]'::jsonb, '2026-01-01', '2026-12-31', 'Activo'),
  ('8', 'Profesional - Plan 9 2026', '5', null, '5', null, 'USD', 1500, '[{"numero":0,"concepto":"Matrícula","monto":150,"dias":0,"tipo":"matricula","variable":false},{"numero":1,"concepto":"Cuota 1","monto":150,"dias":0,"tipo":"cuota","variable":false},{"numero":2,"concepto":"Cuota 2","monto":150,"dias":30,"tipo":"cuota","variable":false},{"numero":3,"concepto":"Cuota 3","monto":150,"dias":60,"tipo":"cuota","variable":false},{"numero":4,"concepto":"Cuota 4","monto":150,"dias":90,"tipo":"cuota","variable":false},{"numero":5,"concepto":"Cuota 5","monto":150,"dias":120,"tipo":"cuota","variable":false},{"numero":6,"concepto":"Cuota 6","monto":150,"dias":150,"tipo":"cuota","variable":false},{"numero":7,"concepto":"Cuota 7","monto":150,"dias":180,"tipo":"cuota","variable":false},{"numero":8,"concepto":"Cuota 8","monto":150,"dias":210,"tipo":"cuota","variable":false},{"numero":9,"concepto":"Cuota 9","monto":150,"dias":240,"tipo":"cuota","variable":false}]'::jsonb, '2026-01-01', '2026-12-31', 'Activo')
on conflict do nothing;

insert into public.promociones (id, codigo, nombre, tipo, alumnos_requeridos, programas_elegibles, precio_base_requerido, permite_varios_grupos, tipos_pago, precio_total, moneda, regla_reparto, todas_las_sedes, sedes, vigencia_inicio, vigencia_fin, estado, observaciones) values
  ('1', 'PROMO-2X700', '2 matrículas Pre-Kids / Kids por USD 700', 'Grupal', 2, array['2', '1']::text[], 500, true, array['1']::text[], 700, 'USD', 'Igualitario', true, array[]::text[], '2026-01-01', '2026-12-31', 'Activo', null),
  ('2', 'PROMO-PROF-2X1700', '2 matrículas Profesional por USD 1700', 'Grupal', 2, array['5']::text[], 1000, true, array['1']::text[], 1700, 'USD', 'Igualitario', true, array[]::text[], '2026-01-01', '2026-12-31', 'Activo', null)
on conflict do nothing;

insert into public.origenes_lead (id, nombre, estado) values
  ('1', 'Facebook Ads', 'Activo'),
  ('2', 'Orgánico', 'Activo'),
  ('3', 'Referido', 'Activo'),
  ('4', 'Instagram', 'Activo'),
  ('5', 'WhatsApp', 'Activo')
on conflict do nothing;

commit;
