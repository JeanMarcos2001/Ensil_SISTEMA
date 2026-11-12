/**
 * Escribe `supabase/seed/caja_chica_de_ejemplo.sql`: la carga de partida del fondo y los movimientos de caja chica de ejemplo a partir de los datos de
 * ejemplo del sistema (`src/data/seedPetty.ts`).
 * Ejecutar: npx tsx scripts/doc-caja-chica-seed.ts
 */
import { writeFileSync } from 'node:fs';
import { renderCashBoxesSeedSql } from '../src/utils/cashBoxesSeedSql';

const FILE = 'supabase/seed/caja_chica_de_ejemplo.sql';
writeFileSync(FILE, renderCashBoxesSeedSql(), 'utf8');
console.log(`Escrito ${FILE}`);
