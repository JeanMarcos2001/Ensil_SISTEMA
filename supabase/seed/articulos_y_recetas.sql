-- =====================================================================================================================
-- Artículos, precios de venta y recetas de partida (generado: NO se edita a mano)
-- ---------------------------------------------------------------------------------------------------------------------
-- Sale de `src/data/seedCatalog.ts` con `npx tsx scripts/doc-articulos-seed.ts`. Requiere la migración 0011 (artículos y recetas) y el
-- catálogo comercial cargado (`catalogo_comercial.sql`): las recetas nombran programas y niveles por su id.
-- Es repetible: lo que ya existe (mismo SKU o mismo id) no se vuelve a cargar ni se modifica.
-- Los paquetes se cargan después de los demás artículos porque nombran a sus componentes.
-- =====================================================================================================================

begin;

insert into public.articulos (id, nombre, estado, tipo, descripcion, unidad, costo, se_vende, se_entrega_en_matricula, es_paquete, permite_desempaquetar, sesiones, gimnasia_por_sesion, entrenamientos_por_sesion, modo_entrenamiento, entrenamientos_variables, tipo_libro, encuadernado, composicion) values
  ('ITM-LIB-K1', 'Libro Kids Nivel 1', 'Activo', 'Libro', 'Libro de nivel 1 para programa Kids', 'Unidad', 45, true, true, false, false, null, null, null, null, null, 'Individual', 'Encolado', null),
  ('ITM-MAT-01', 'Material Lógico Matemático', 'Activo', 'Material educativo', 'Material para desarrollo lógico', 'Unidad', 20, false, true, false, false, 12, 2, 3, 'General', null, null, null, null),
  ('ITM-HER-01', 'Mochila Institucional', 'Activo', 'Herramienta / adicional', 'Mochila con logo ENSIL', 'Unidad', 25, true, true, false, false, null, null, null, null, null, null, null, null),
  ('ITM-HER-02', 'Cartuchera', 'Activo', 'Herramienta / adicional', 'Cartuchera básica', 'Unidad', 5, true, true, false, false, null, null, null, null, null, null, null, null)
on conflict do nothing;

insert into public.articulos (id, nombre, estado, tipo, descripcion, unidad, costo, se_vende, se_entrega_en_matricula, es_paquete, permite_desempaquetar, sesiones, gimnasia_por_sesion, entrenamientos_por_sesion, modo_entrenamiento, entrenamientos_variables, tipo_libro, encuadernado, composicion) values
  ('ITM-KIT-BIENV', 'Kit Bienvenida (Mochila + Útiles)', 'Activo', 'Paquete / kit logístico', 'Kit entregado al matricular', 'Kit', 80, false, true, true, true, null, null, null, null, null, null, null, '[{"articulo_id":"ITM-HER-01","cantidad":1},{"articulo_id":"ITM-HER-02","cantidad":1}]'::jsonb)
on conflict do nothing;

insert into public.articulo_precios (id, articulo_id, sede_id, monto, vigente_desde, vigente_hasta, creado_por) values
  ('PRC-001', 'ITM-LIB-K1', null, 60, '2026-01-01', null, 'Sistema'),
  ('PRC-002', 'ITM-HER-01', null, 45, '2026-01-01', null, 'Sistema'),
  ('PRC-003', 'ITM-HER-02', null, 10, '2026-01-01', null, 'Sistema')
on conflict do nothing;

insert into public.recetas (id, nombre, programa_id, nivel_id, todas_las_sedes, sedes, estado, articulos, vigencia_inicio, vigencia_fin) values
  ('REC-001', 'Pack Kids Nivel 1 2024', '1', '1', true, array[]::text[], 'Activo', '[{"articulo_id":"ITM-LIB-K1","cantidad":1},{"articulo_id":"ITM-KIT-BIENV","cantidad":1}]'::jsonb, '2026-01-01', '2026-12-31'),
  ('REC-002', 'Pack Kids Nivel 2 2024', '1', '2', true, array[]::text[], 'Activo', '[{"articulo_id":"ITM-LIB-K1","cantidad":1},{"articulo_id":"ITM-MAT-01","cantidad":1}]'::jsonb, '2026-01-01', '2026-12-31'),
  ('REC-003', 'Pack Pre-Kids Nivel 1 2026', '2', '4', true, array[]::text[], 'Activo', '[{"articulo_id":"ITM-KIT-BIENV","cantidad":1},{"articulo_id":"ITM-MAT-01","cantidad":1}]'::jsonb, '2026-01-01', '2026-12-31')
on conflict do nothing;

commit;
