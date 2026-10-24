/**
 * Caja chica (funciones puras): fondo fijo en soles para gastos menores.
 *
 * El saldo es lo aplicado (ingresos − egresos); un egreso no puede dejarlo en negativo y un ingreso solo se reversa si el
 * saldo que queda alcanza para cubrir lo que ya se gastó. Un movimiento reversado no se borra: queda marcado con quién, cuándo
 * y por qué, y deja de contar.
 */
import type { PettyCashMovement } from '../context/DataContext';
import { localDateOf } from './schedule';

export type PettyKind = 'Ingreso' | 'Egreso';

export const PETTY_CATEGORIES: Record<PettyKind, string[]> = {
  Egreso: ['Movilidad', 'Útiles de oficina', 'Limpieza', 'Otros gastos'],
  Ingreso: ['Reposición de fondo', 'Devolución de sobrante', 'Otros ingresos'],
};
export const PETTY_METHODS = ['Efectivo', 'Transferencia', 'Otros'];
export const PETTY_REVERSAL_REASONS = [
  'Error de registro (monto, categoría o concepto)',
  'Movimiento duplicado',
  'Gasto no realizado',
  'Otro',
];
export const MIN_TEXT = 3;
export const MIN_DETAIL = 5;
export const MAX_AMOUNT = 100000;

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface PettyInput {
  kind: PettyKind;
  /** Fecha del movimiento (YYYY-MM-DD). */
  date: string;
  category: string;
  concept: string;
  amount: string;
  method: string;
  reference: string;
  evidence: string;
  observations: string;
}

export type PettyErrors = Partial<Record<keyof PettyInput, string>>;

export const emptyPettyInput = (kind: PettyKind, date: string): PettyInput => ({
  kind, date, category: '', concept: '', amount: '', method: 'Efectivo', reference: '', evidence: '', observations: '',
});

export const pettyBalance = (movements: PettyCashMovement[]): number =>
  round2(movements.filter(m => m.status === 'Aplicado').reduce((a, m) => a + (m.kind === 'Ingreso' ? m.amount : -m.amount), 0));

export function pettyMonthTotals(movements: PettyCashMovement[], today: string): { income: number; expense: number } {
  const month = today.slice(0, 7);
  const own = movements.filter(m => m.status === 'Aplicado' && localDateOf(m.date).slice(0, 7) === month);
  return {
    income: round2(own.filter(m => m.kind === 'Ingreso').reduce((a, m) => a + m.amount, 0)),
    expense: round2(own.filter(m => m.kind === 'Egreso').reduce((a, m) => a + m.amount, 0)),
  };
}

/** Fondo fijo: monto asignado y tope por gasto (un egreso mayor al tope se hace desde Caja con su comprobante). */
export interface PettyFund {
  assigned: number;
  maxExpense: number;
}
export const DEFAULT_FUND: PettyFund = { assigned: 1000, maxExpense: 200 };

export function validateFund(f: { assigned: string; maxExpense: string }): { assigned?: string; maxExpense?: string } {
  const e: { assigned?: string; maxExpense?: string } = {};
  const a = Number(f.assigned);
  const m = Number(f.maxExpense);
  if (!f.assigned.trim() || !(a > 0) || a > MAX_AMOUNT) e.assigned = 'Indique el monto del fondo fijo (mayor que cero).';
  if (!f.maxExpense.trim() || !(m > 0)) e.maxExpense = 'Indique el tope por gasto (mayor que cero).';
  else if (a > 0 && m > a) e.maxExpense = 'El tope por gasto no puede superar el fondo.';
  return e;
}

/** Lo que falta para volver al fondo asignado (0 si el saldo ya lo alcanza). */
export const refillNeeded = (fund: PettyFund, movements: PettyCashMovement[]): number => Math.max(0, round2(fund.assigned - pettyBalance(movements)));

export function validatePettyInput(i: PettyInput, movements: PettyCashMovement[], today: string, fund?: PettyFund): PettyErrors {
  const e: PettyErrors = {};
  if (!i.date) e.date = 'La fecha es obligatoria.';
  else if (i.date > today) e.date = 'La fecha no puede ser futura.';
  if (!PETTY_CATEGORIES[i.kind].includes(i.category)) e.category = 'Seleccione la categoría.';
  if (i.concept.trim().length < MIN_TEXT) e.concept = 'Describa el movimiento.';
  else if (i.concept.trim().length > 120) e.concept = 'El concepto es demasiado largo (máximo 120 caracteres).';
  const amount = Number(i.amount);
  if (!i.amount.trim() || !(amount > 0)) e.amount = 'Indique un monto mayor que cero.';
  else if (amount > MAX_AMOUNT) e.amount = 'Revise el monto.';
  else if (i.kind === 'Egreso' && fund && round2(amount) > fund.maxExpense) e.amount = `El gasto supera el tope de la caja chica (S/ ${fund.maxExpense.toLocaleString('en-US', { minimumFractionDigits: 2 })}): regístrelo como egreso en Caja, con su comprobante.`;
  else if (i.kind === 'Egreso' && round2(amount) > pettyBalance(movements)) e.amount = `El egreso supera el saldo de la caja chica (S/ ${pettyBalance(movements).toLocaleString('en-US', { minimumFractionDigits: 2 })}).`;
  if (!PETTY_METHODS.includes(i.method)) e.method = 'Seleccione el medio.';
  return e;
}

export function buildPettyMovement(i: PettyInput): Omit<PettyCashMovement, 'id' | 'user' | 'status'> {
  return {
    date: new Date(`${i.date}T12:00:00`).toISOString(),
    kind: i.kind,
    category: i.category,
    concept: i.concept.trim(),
    amount: round2(Number(i.amount)),
    method: i.method,
    reference: i.reference.trim() || undefined,
    evidence: i.evidence.trim() || undefined,
    observations: i.observations.trim() || undefined,
  };
}

export function validatePettyReversal(m: PettyCashMovement, reason: string, detail: string, movements: PettyCashMovement[]): string[] {
  const e: string[] = [];
  if (m.status === 'Reversado') e.push('Este movimiento ya fue reversado.');
  if (!PETTY_REVERSAL_REASONS.includes(reason)) e.push('Seleccione el motivo de la reversa.');
  if (detail.trim().length < MIN_DETAIL) e.push('Explique qué ocurrió: la reversa queda auditada.');
  if (m.kind === 'Ingreso' && m.status === 'Aplicado' && round2(pettyBalance(movements) - m.amount) < 0) {
    e.push('No se puede reversar este ingreso: el saldo quedaría negativo porque ya se gastó parte de ese dinero. Reverse antes los egresos que corresponda.');
  }
  return e;
}

/** Saldo de la caja chica después de reversar un movimiento. */
export const pettyBalanceAfterReversal = (m: PettyCashMovement, movements: PettyCashMovement[]): number =>
  round2(pettyBalance(movements) + (m.kind === 'Ingreso' ? -m.amount : m.amount));
