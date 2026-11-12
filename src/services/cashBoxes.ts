/**
 * Operaciones de los cierres de caja y la caja chica sobre la base de datos: validan con las reglas puras (`utils/cashClosure.ts`, `utils/pettyCash.ts`) y
 * luego guardan. **Cada sede cierra su caja y tiene su fondo de caja chica.**
 *
 * Reciben el repositorio como parámetro (el de Supabase en el sistema, uno en memoria en `scripts/check-cash-boxes-db.ts`), de modo que el orden
 * «validar → guardar → traducir el error» se puede comprobar sin conexión. Ninguna toca el estado de React: quien llama (el gancho `useCashBoxes`) vuelve a
 * leer de la base lo que cambió. La base vuelve a comprobar todo (la fecha, el saldo esperado —lo calcula ella—, el tope, el día cerrado y la sede).
 */
import type { CashClosure, CashMovement, PettyCashMovement } from '../context/DataContext';
import { closedMessage, expectedAt, validateClosure, validateReopen, type ClosureInput } from '../utils/cashClosure';
import {
  DEFAULT_FUND, buildPettyMovement, ofBranch, validateFund, validatePettyInput, validatePettyReversal, type PettyFund, type PettyInput,
} from '../utils/pettyCash';
import { localDateOf } from '../utils/schedule';
import type { OpResult, RepoResult } from './orgDirectory';

export interface CashBoxesData { closures: CashClosure[]; pettyMovements: PettyCashMovement[]; pettyFunds: Record<string, PettyFund> }

/** Lo que la base necesita para cerrar una caja (la base calcula el saldo esperado: aquí solo va lo contado). */
export interface CloseRequest { scope: 'caja' | 'caja-chica'; currency: 'PEN' | 'USD'; branchId?: string; date: string; counted: number; note: string }
/** Un ingreso o gasto de la caja chica tal como lo guarda la base. */
export interface PettyRequest {
  branchId: string; kind: 'Ingreso' | 'Egreso'; date: string; category: string; concept: string; amount: number; method: string; reference: string; evidence: string; observations: string;
}

export interface CashBoxesRepository {
  loadAll(): Promise<RepoResult<CashBoxesData>>;
  close(r: CloseRequest): Promise<RepoResult<string>>;
  reopen(closureId: string, reason: string): Promise<RepoResult<null>>;
  setFund(branchId: string, assigned: number, maxExpense: number): Promise<RepoResult<null>>;
  addPetty(r: PettyRequest): Promise<RepoResult<string>>;
  reversePetty(id: string, reason: string, detail: string): Promise<RepoResult<null>>;
}

/** Con qué se comprueban las reglas: lo último que se vio de los cierres y la caja chica, y la caja (para mostrar el saldo esperado). */
export interface CashBoxesContext extends CashBoxesData { cashMovements: CashMovement[]; today: string }

const fail = (error: string): OpResult<never> => ({ ok: false, error });

/** El fondo de una sede (si no lo definió, valen los de partida). */
export const fundOf = (funds: Record<string, PettyFund>, branchId: string): PettyFund => funds[branchId] ?? DEFAULT_FUND;

/** Lee de la base los cierres, los movimientos y los fondos de caja chica. Se lee al iniciar sesión (`AccessGate`), antes de montar las pantallas. */
export async function loadCashBoxes(repo: CashBoxesRepository): Promise<OpResult<CashBoxesData>> {
  const res = await repo.loadAll();
  return res.ok && res.data ? { ok: true, value: res.data } : fail(res.error ?? 'No se pudieron cargar los cierres de caja y la caja chica.');
}

// ------------------------------------------------------------------------------------------------------------------ Cierres

export async function closeCashBox(repo: CashBoxesRepository, ctx: CashBoxesContext, input: ClosureInput): Promise<OpResult<{ id: string }>> {
  const expected = expectedAt(input.scope, input.currency, input.date, ctx.cashMovements, ctx.pettyMovements, input.branchId);
  const problems = validateClosure(input, ctx.closures, expected, ctx.today);
  if (problems.length > 0) return fail(problems.join(' '));
  const res = await repo.close({ scope: input.scope, currency: input.currency, branchId: input.branchId, date: input.date, counted: Number(input.counted), note: input.note.trim() });
  return res.ok && res.data ? { ok: true, value: { id: res.data } } : fail(res.error ?? 'No se pudo cerrar la caja.');
}

export async function reopenCashBox(repo: CashBoxesRepository, ctx: CashBoxesContext, closureId: string, reason: string): Promise<OpResult> {
  const closure = ctx.closures.find(c => c.id === closureId);
  if (!closure) return fail('No se encontró el cierre.');
  const problems = validateReopen(closure, ctx.closures, reason);
  if (problems.length > 0) return fail(problems.join(' '));
  const res = await repo.reopen(closureId, reason.trim());
  return res.ok ? { ok: true } : fail(res.error ?? 'No se pudo reabrir el cierre.');
}

// ------------------------------------------------------------------------------------------------------------------ Caja chica

/** Define el fondo fijo y el tope por gasto de la caja chica de una sede. */
export async function savePettyFund(repo: CashBoxesRepository, branchId: string, input: { assigned: string; maxExpense: string }): Promise<OpResult> {
  if (!branchId) return fail('Elija la sede de la caja chica.');
  const errors = validateFund(input);
  const first = errors.assigned ?? errors.maxExpense;
  if (first) return fail(first);
  const res = await repo.setFund(branchId, Number(input.assigned), Number(input.maxExpense));
  return res.ok ? { ok: true } : fail(res.error ?? 'No se pudo guardar el fondo.');
}

/** Un ingreso o gasto de la caja chica de una sede (valida con el saldo y el tope de ESA sede, y que el día no esté cerrado). */
export async function addPettyMovement(repo: CashBoxesRepository, ctx: CashBoxesContext, branchId: string, input: PettyInput): Promise<OpResult> {
  if (!branchId) return fail('Elija la sede de la caja chica.');
  const errors = validatePettyInput(input, ofBranch(ctx.pettyMovements, branchId), ctx.today, fundOf(ctx.pettyFunds, branchId));
  const first = Object.values(errors)[0];
  if (first) return fail(first);
  const closed = closedMessage(ctx.closures, 'caja-chica', 'PEN', input.date, branchId);
  if (closed) return fail(closed);
  const built = buildPettyMovement(input, branchId);
  const res = await repo.addPetty({
    branchId, kind: built.kind, date: input.date, category: built.category, concept: built.concept, amount: built.amount, method: built.method,
    reference: built.reference ?? '', evidence: built.evidence ?? '', observations: built.observations ?? '',
  });
  return res.ok ? { ok: true } : fail(res.error ?? 'No se pudo registrar el movimiento.');
}

export async function reversePettyMovement(repo: CashBoxesRepository, ctx: CashBoxesContext, id: string, input: { reason: string; detail: string }): Promise<OpResult> {
  const movement = ctx.pettyMovements.find(m => m.id === id);
  if (!movement) return fail('No se encontró el movimiento.');
  const closed = closedMessage(ctx.closures, 'caja-chica', 'PEN', localDateOf(movement.date), movement.branchId);
  if (closed) return fail(closed);
  const problems = validatePettyReversal(movement, input.reason, input.detail, ofBranch(ctx.pettyMovements, movement.branchId));
  if (problems.length > 0) return fail(problems.join(' '));
  const res = await repo.reversePetty(id, input.reason, input.detail.trim());
  return res.ok ? { ok: true } : fail(res.error ?? 'No se pudo reversar el movimiento.');
}
