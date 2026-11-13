/**
 * Carga de partida de matrículas, planes, cuotas, pagos y caja en la base (SQL): sale de los mismos datos de ejemplo del sistema
 * (`data/seedPeople.ts`) y de la misma traducción que usa el repositorio (`utils/moneyDb.ts`), así que lo que se carga es exactamente lo que el
 * sistema sabe leer. `scripts/doc-matriculas-seed.ts` la escribe en `supabase/seed/matriculas_de_ejemplo.sql` y `scripts/check-money-db.ts`
 * comprueba que el archivo esté al día. Función pura: no toca archivos.
 *
 * Los vencimientos y las fechas se arman a partir de un día fijo (`SEED_REFERENCE_DAY`): con el paso de los días las cuotas de ejemplo se vuelven
 * «Vencidas», que es lo esperado en una base de prueba. Las solicitudes (caída, cambio, traslado) van en su propio archivo
 * (`solicitudes_de_ejemplo.sql`) y la agenda sigue en memoria: ambas nombran estas matrículas por su código.
 */
import { buildPeopleSeed } from '../data/seedPeople';
import { insert, type Value } from './catalogSeedSql';
import { moneyRowsFromState } from './moneyDb';
import { SEED_REFERENCE_DAY } from './peopleSeedSql';

const rows = (list: object[]) => list as unknown as Record<string, Value>[];

export function renderMoneySeedSql(): string {
  const seed = buildPeopleSeed(SEED_REFERENCE_DAY);
  const data = moneyRowsFromState({
    enrollments: seed.enrollments, plans: seed.plans, payments: seed.payments, cashMovements: seed.cashMovements, creditNotes: [], promotionGroups: [],
    dropRequests: [], changeRequests: [], enrollmentChanges: [],
  }, true);
  const planes = data.planes.map(({ cuotas: _cuotas, ...plan }) => plan);
  const cuotas = data.planes.flatMap(p => (p.cuotas ?? []).map(c => ({ plan_id: p.id, ...c })));
  return `-- =====================================================================================================================
-- Matrículas, planes, pagos y caja de ejemplo (generado: NO se edita a mano)
-- ---------------------------------------------------------------------------------------------------------------------
-- Sale de \`src/data/seedPeople.ts\` con \`npx tsx scripts/doc-matriculas-seed.ts\`. Requiere las migraciones 0014 (titulares y alumnos) y 0015
-- (matrículas y dinero), los 5 titulares y 5 alumnos de ejemplo (\`personas_de_ejemplo.sql\`), el catálogo comercial y las sedes reales.
-- Son las ${data.matriculas.length} matrículas de ejemplo con las que la agenda, la verificación y la cobranza de ejemplo se entienden (llevan los mismos códigos:
-- MAT-2026-001…). Son datos de PRUEBA (nombres y documentos inventados). Las fechas salen de un día fijo (${SEED_REFERENCE_DAY}).
-- Es repetible: lo que ya existe (mismo código) no se vuelve a cargar ni se modifica. Se carga con el editor SQL (sin sesión): ahí se respeta quién y
-- cuándo registró cada cosa.
-- =====================================================================================================================

begin;

${insert('matriculas', rows(data.matriculas))}
${insert('planes', rows(planes))}
${insert('cuotas', rows(cuotas))}
${insert('pagos', rows(data.pagos))}
${insert('movimientos_caja', rows(data.movimientos))}
commit;
`;
}
