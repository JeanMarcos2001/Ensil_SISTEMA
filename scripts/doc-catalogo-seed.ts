/**
 * Escribe `supabase/seed/catalogo_comercial.sql`: la carga de partida del catálogo comercial (programas, niveles, tipos de pago,
 * tarifarios, promociones y orígenes de leads) a partir de los datos de ejemplo del sistema (`src/data/seedCatalog.ts`).
 * Ejecutar: npx tsx scripts/doc-catalogo-seed.ts
 */
import { writeFileSync } from 'node:fs';
import { renderCatalogSeedSql } from '../src/utils/catalogSeedSql';

const FILE = 'supabase/seed/catalogo_comercial.sql';
writeFileSync(FILE, renderCatalogSeedSql(), 'utf8');
console.log(`Escrito ${FILE}`);
