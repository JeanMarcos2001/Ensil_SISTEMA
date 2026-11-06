/**
 * Genera `supabase/seed/roles_de_partida.sql` desde las plantillas de rol. Ejecutar: npx tsx scripts/doc-roles-seed.ts
 */
import { writeFileSync } from 'node:fs';
import { renderRolesSeedSql, seededRoles } from '../src/utils/rolesSeedSql';

const file = 'supabase/seed/roles_de_partida.sql';
writeFileSync(file, renderRolesSeedSql(), 'utf8');
console.log(`Escrito ${file}: ${seededRoles().map(r => `${r.id} ${r.template.name} (${r.functions.length})`).join(' · ')}`);
