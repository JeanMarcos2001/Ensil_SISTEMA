/**
 * Carga de partida de los artículos, sus precios de venta y las recetas de materiales en la base (SQL): sale de los mismos datos de
 * ejemplo del sistema (`data/seedCatalog.ts`) y de la misma traducción que usa el repositorio (`utils/itemsDb.ts`).
 * `scripts/doc-articulos-seed.ts` la escribe en `supabase/seed/articulos_y_recetas.sql` y `scripts/check-items-db.ts` comprueba que el
 * archivo esté al día. Función pura: no toca archivos.
 */
import { seedItemPrices, seedItems, seedRecipes } from '../data/seedCatalog';
import { insert, type Value } from './catalogSeedSql';
import { itemToRow, recipeToRow } from './itemsDb';

const rows = (list: object[]) => list as unknown as Record<string, Value>[];

export function renderItemsSeedSql(): string {
  const items = seedItems();
  const priceRows = seedItemPrices().map(p => ({
    id: p.id, articulo_id: p.itemId, sede_id: p.branchId === 'all' ? null : p.branchId, monto: p.amount, vigente_desde: p.validFrom,
    vigente_hasta: p.validTo ?? null, creado_por: p.createdBy,
  }));
  return `-- =====================================================================================================================
-- Artículos, precios de venta y recetas de partida (generado: NO se edita a mano)
-- ---------------------------------------------------------------------------------------------------------------------
-- Sale de \`src/data/seedCatalog.ts\` con \`npx tsx scripts/doc-articulos-seed.ts\`. Requiere la migración 0011 (artículos y recetas) y el
-- catálogo comercial cargado (\`catalogo_comercial.sql\`): las recetas nombran programas y niveles por su id.
-- Es repetible: lo que ya existe (mismo SKU o mismo id) no se vuelve a cargar ni se modifica.
-- Los paquetes se cargan después de los demás artículos porque nombran a sus componentes.
-- =====================================================================================================================

begin;

${insert('articulos', rows(items.filter(i => !i.isPackage).map(itemToRow)))}
${insert('articulos', rows(items.filter(i => i.isPackage).map(itemToRow)))}
${insert('articulo_precios', rows(priceRows))}
${insert('recetas', rows(seedRecipes().map(recipeToRow)))}
commit;
`;
}
