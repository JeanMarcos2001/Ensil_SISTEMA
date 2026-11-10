/**
 * Escribe `supabase/seed/matriculas_de_ejemplo.sql`: la carga de partida de las matrículas, planes, cuotas, pagos y caja de ejemplo a partir de los
 * datos de ejemplo del sistema (`src/data/seedPeople.ts`).
 * Ejecutar: npx tsx scripts/doc-matriculas-seed.ts
 */
import { writeFileSync } from 'node:fs';
import { renderMoneySeedSql } from '../src/utils/moneySeedSql';

const FILE = 'supabase/seed/matriculas_de_ejemplo.sql';
writeFileSync(FILE, renderMoneySeedSql(), 'utf8');
console.log(`Escrito ${FILE}`);
