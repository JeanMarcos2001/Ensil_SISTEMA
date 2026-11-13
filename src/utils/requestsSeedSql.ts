/**
 * Carga de partida de las solicitudes sobre las matrículas en la base (SQL): sale de los mismos datos de ejemplo del sistema (`data/seedPeople.ts`) y de la
 * misma traducción que usa el repositorio (`utils/requestsDb.ts`), así que lo que se carga es exactamente lo que el sistema sabe leer.
 * `scripts/doc-solicitudes-seed.ts` la escribe en `supabase/seed/solicitudes_de_ejemplo.sql` y `scripts/check-requests-db.ts` comprueba que el archivo esté
 * al día. Función pura: no toca archivos. El registro de correcciones no se carga: nace cuando alguien corrige una matrícula.
 */
import { buildPeopleSeed } from '../data/seedPeople';
import { insert, type Value } from './catalogSeedSql';
import { SEED_REFERENCE_DAY } from './peopleSeedSql';
import { dropRequestToRow } from './requestsDb';

export function renderRequestsSeedSql(): string {
  const seed = buildPeopleSeed(SEED_REFERENCE_DAY);
  const solicitudes = seed.dropRequests.map(r => dropRequestToRow(r, true)) as unknown as Record<string, Value>[];
  return `-- =====================================================================================================================
-- Solicitudes sobre matrículas de ejemplo (generado: NO se edita a mano)
-- ---------------------------------------------------------------------------------------------------------------------
-- Sale de \`src/data/seedPeople.ts\` con \`npx tsx scripts/doc-solicitudes-seed.ts\`. Requiere la migración 0018 (solicitudes y correcciones de matrículas) y las
-- matrículas de ejemplo (\`matriculas_de_ejemplo.sql\`). Es la solicitud de caída de ejemplo (${solicitudes.length === 1 ? 'CAI-001' : `${solicitudes.length} solicitudes`}, ya aprobada) que la matrícula MAT-2026-003
-- ya nombra. Son datos de PRUEBA. Las fechas salen de un día fijo (${SEED_REFERENCE_DAY}). Es repetible: lo que ya existe (mismo código) no se vuelve a cargar ni
-- se modifica. Se carga con el editor SQL (sin sesión): ahí se respeta quién pidió y quién resolvió cada solicitud.
-- =====================================================================================================================

begin;

${insert('solicitudes_matricula', solicitudes)}
commit;
`;
}
