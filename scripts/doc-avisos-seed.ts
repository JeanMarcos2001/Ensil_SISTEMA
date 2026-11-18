/**
 * Genera `supabase/seed/avisos_eventos.sql` desde los eventos del registro de funciones. Ejecutar: npx tsx scripts/doc-avisos-seed.ts
 */
import { writeFileSync } from 'node:fs';
import { noticeEventRows, renderNoticeEventsSeedSql } from '../src/utils/noticesDb';

const file = 'supabase/seed/avisos_eventos.sql';
writeFileSync(file, renderNoticeEventsSeedSql(), 'utf8');
console.log(`Escrito ${file}: ${noticeEventRows().length} eventos`);
