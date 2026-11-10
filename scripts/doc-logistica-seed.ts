/**
 * Escribe `supabase/seed/logistica_inicial.sql`: la carga de partida del stock, los couriers y los métodos de envío a partir de los datos de
 * ejemplo del sistema (`src/data/seedCatalog.ts`).
 * Ejecutar: npx tsx scripts/doc-logistica-seed.ts
 */
import { writeFileSync } from 'node:fs';
import { renderLogisticsSeedSql } from '../src/utils/logisticsSeedSql';

const FILE = 'supabase/seed/logistica_inicial.sql';
writeFileSync(FILE, renderLogisticsSeedSql(), 'utf8');
console.log(`Escrito ${FILE}`);
