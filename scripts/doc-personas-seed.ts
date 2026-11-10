/**
 * Escribe `supabase/seed/personas_de_ejemplo.sql`: la carga de partida de los titulares y alumnos de ejemplo a partir de los datos de ejemplo del
 * sistema (`src/data/seedPeople.ts`).
 * Ejecutar: npx tsx scripts/doc-personas-seed.ts
 */
import { writeFileSync } from 'node:fs';
import { renderPeopleSeedSql } from '../src/utils/peopleSeedSql';

const FILE = 'supabase/seed/personas_de_ejemplo.sql';
writeFileSync(FILE, renderPeopleSeedSql(), 'utf8');
console.log(`Escrito ${FILE}`);
