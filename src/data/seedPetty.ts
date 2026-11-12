/**
 * Datos de ejemplo de la caja chica (fondo fijo en soles de cada sede): el fondo de Piura y los tres movimientos que mostraba la pantalla cuando vivía en
 * memoria. Ya viven en la base (`supabase/seed/caja_chica_de_ejemplo.sql`, generado desde aquí con `scripts/doc-caja-chica-seed.ts`): el sistema no
 * lee esta lista para mostrar nada. Las fechas salen de un día de referencia fijo (el mismo de las demás cargas de ejemplo).
 */
import type { PettyCashMovement } from '../context/DataContext';
import type { PettyFund } from '../utils/pettyCash';

/** La sede de los datos de ejemplo de la caja chica (Piura: es donde están las matrículas y los pagos de ejemplo). */
export const SEED_PETTY_BRANCH = 'FIL-002';

export const seedPettyFunds = (): { branchId: string; fund: PettyFund }[] => [{ branchId: SEED_PETTY_BRANCH, fund: { assigned: 1000, maxExpense: 200 } }];

const addDays = (iso: string, n: number): string => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

/** Los tres movimientos de ejemplo (de lo más nuevo a lo más antiguo). `fecha` es la hora de Lima (UTC−5). */
export function seedPettyMovements(referenceDay: string): PettyCashMovement[] {
  const at = (back: number, hh: string) => new Date(`${addDays(referenceDay, -back)}T${hh}:00-05:00`).toISOString();
  return [
    { id: 'CCH-003', branchId: SEED_PETTY_BRANCH, date: at(0, '11:30'), kind: 'Egreso', category: 'Movilidad', concept: 'Taxi a notaría', amount: 25, method: 'Efectivo', user: 'Ana G.', status: 'Aplicado' },
    { id: 'CCH-002', branchId: SEED_PETTY_BRANCH, date: at(1, '15:20'), kind: 'Egreso', category: 'Útiles de oficina', concept: 'Compra de papel bond', amount: 120, method: 'Efectivo', reference: 'Boleta B001-0456', user: 'Carlos R.', status: 'Aplicado' },
    { id: 'CCH-001', branchId: SEED_PETTY_BRANCH, date: at(3, '09:00'), kind: 'Ingreso', category: 'Reposición de fondo', concept: 'Reposición de fondo fijo', amount: 1000, method: 'Efectivo', user: 'Admin', status: 'Aplicado' },
  ];
}
