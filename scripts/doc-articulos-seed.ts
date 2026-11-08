/**
 * Escribe `supabase/seed/articulos_y_recetas.sql`: la carga de partida de los artículos, sus precios de venta y las recetas de materiales
 * a partir de los datos de ejemplo del sistema (`src/data/seedCatalog.ts`).
 * Ejecutar: npx tsx scripts/doc-articulos-seed.ts
 */
import { writeFileSync } from 'node:fs';
import { renderItemsSeedSql } from '../src/utils/itemsSeedSql';

const FILE = 'supabase/seed/articulos_y_recetas.sql';
writeFileSync(FILE, renderItemsSeedSql(), 'utf8');
console.log(`Escrito ${FILE}`);
