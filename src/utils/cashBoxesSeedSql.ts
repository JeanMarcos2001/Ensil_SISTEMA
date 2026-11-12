/**
 * Carga de partida de la caja chica en la base (SQL): sale de los mismos datos de ejemplo del sistema (`data/seedPetty.ts`). `scripts/doc-caja-chica-seed.ts`
 * la escribe en `supabase/seed/caja_chica_de_ejemplo.sql` y `scripts/check-cash-boxes-db.ts` comprueba que el archivo esté al día. Función pura: no toca archivos.
 * Los cierres de caja no se cargan: nacen cuando una sede cierra su caja.
 */
import { SEED_PETTY_BRANCH, seedPettyFunds, seedPettyMovements } from '../data/seedPetty';
import { insert, type Value } from './catalogSeedSql';
import { SEED_REFERENCE_DAY } from './peopleSeedSql';

const rows = (list: object[]) => list as unknown as Record<string, Value>[];

export function renderCashBoxesSeedSql(): string {
  const fondos = seedPettyFunds().map(f => ({ sede_id: f.branchId, asignado: f.fund.assigned, tope: f.fund.maxExpense, actualizado_por: 'Sistema' }));
  const movimientos = seedPettyMovements(SEED_REFERENCE_DAY).map(m => ({
    id: m.id, sede_id: m.branchId, fecha: m.date, tipo: m.kind, categoria: m.category, concepto: m.concept, monto: m.amount, medio: m.method,
    referencia: m.reference ?? null, evidencia: m.evidence ?? null, observaciones: m.observations ?? null, usuario: m.user, estado: m.status,
  }));
  return `-- =====================================================================================================================
-- Caja chica de ejemplo (generado: NO se edita a mano)
-- ---------------------------------------------------------------------------------------------------------------------
-- Sale de \`src/data/seedPetty.ts\` con \`npx tsx scripts/doc-caja-chica-seed.ts\`. Requiere la migración 0017 (cierres de caja y caja chica) y las sedes
-- reales cargadas (\`empresas_y_sedes_reales.sql\`). Es el fondo de la caja chica de Piura (${SEED_PETTY_BRANCH}) con los tres movimientos de ejemplo que mostraba la
-- pantalla. Son datos de PRUEBA. Las fechas salen de un día fijo (${SEED_REFERENCE_DAY}). Es repetible: lo que ya existe (mismo código) no se vuelve a cargar ni se
-- modifica. Se carga con el editor SQL (sin sesión): ahí se respeta quién registró cada cosa.
-- =====================================================================================================================

begin;

${insert('caja_chica_fondos', rows(fondos))}
${insert('caja_chica_movimientos', rows(movimientos))}
commit;
`;
}
