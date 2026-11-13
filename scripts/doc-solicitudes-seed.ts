/**
 * Escribe `supabase/seed/solicitudes_de_ejemplo.sql`: la carga de partida de las solicitudes sobre matrículas de ejemplo a partir de los datos de ejemplo del
 * sistema (`src/data/seedPeople.ts`).
 * Ejecutar: npx tsx scripts/doc-solicitudes-seed.ts
 */
import { writeFileSync } from 'node:fs';
import { renderRequestsSeedSql } from '../src/utils/requestsSeedSql';

const FILE = 'supabase/seed/solicitudes_de_ejemplo.sql';
writeFileSync(FILE, renderRequestsSeedSql(), 'utf8');
console.log(`Escrito ${FILE}`);
