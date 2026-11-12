/**
 * Reporte de Caja y Caja chica (funciones puras).
 *
 * Una caja por moneda (PEN o USD) y la caja chica (siempre en soles). Del período salen: ingresos y egresos, lo que se llevó al
 * banco, las devoluciones, por medio de pago y concepto, el flujo por día, las reversas, el efectivo pendiente de depositar y los
 * cierres con su diferencia. El saldo es el actual (todo lo aplicado hasta hoy), no solo el del período.
 */
import type { CashClosure, CashMovement, PettyCashMovement } from '../context/DataContext';
import { cashBalance, eligibleForDeposit, movementOrigin } from './cash';
import { pettyBalance, refillNeeded, type PettyFund } from './pettyCash';
import { dayOf, inRange, round2, sum, type DateRange } from './reportCommon';

export interface CashReportContext {
  cashMovements: CashMovement[];
  pettyCashMovements: PettyCashMovement[];
  cashClosures: CashClosure[];
  branches: { id: string; name: string }[];
  /** El fondo de la caja chica cuando se mira UNA sede (o el de partida si no hay otro). */
  fund: PettyFund;
  /** El fondo de cada sede (cada sede tiene el suyo): sin él, `fund` vale para todo. */
  fundOf?: (branchId: string) => PettyFund;
}

/** El fondo de varias sedes juntas: lo asignado se suma y el tope es el mayor. */
export const combinedFund = (branchIds: string[], fundOf: (branchId: string) => PettyFund): PettyFund =>
  branchIds.reduce<PettyFund>((acc, id) => ({ assigned: round2(acc.assigned + fundOf(id).assigned), maxExpense: Math.max(acc.maxExpense, fundOf(id).maxExpense) }), { assigned: 0, maxExpense: 0 });

export interface CashFilters {
  range: DateRange;
  branchId: string;
  currency: 'PEN' | 'USD';
}

export interface Amount { name: string; count: number; amount: number }
export interface DayFlow { date: string; income: number; expense: number }

export interface ClosureLine { id: string; /** La sede de la caja cerrada (vacía = caja general). */ branchId?: string; date: string; expected: number; counted: number; difference: number; status: CashClosure['status']; closedBy: string }

export interface CashReport {
  /** Ingresos y egresos operativos del período (sin los depósitos al banco ni las devoluciones). */
  income: number;
  expense: number;
  net: number;
  refunds: number;
  deposits: number;
  /** Saldo actual de la caja (todo lo aplicado). */
  balance: number;
  byMethod: Amount[];
  incomeByConcept: Amount[];
  expenseByConcept: Amount[];
  byDay: DayFlow[];
  byBranch: { name: string; income: number; expense: number }[];
  reversed: { count: number; amount: number };
  pendingDeposit: { count: number; amount: number };
  closures: ClosureLine[];
  closureDifference: number;
}

function amounts(list: CashMovement[], key: (m: CashMovement) => string): Amount[] {
  const map = new Map<string, Amount>();
  for (const m of list) {
    const k = key(m).trim() || 'Sin dato';
    const cur = map.get(k) ?? { name: k, count: 0, amount: 0 };
    map.set(k, { name: k, count: cur.count + 1, amount: round2(cur.amount + m.amount) });
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
}

const closureLine = (c: CashClosure): ClosureLine => ({ id: c.id, branchId: c.branchId, date: c.date, expected: c.expected, counted: c.counted, difference: c.difference, status: c.status, closedBy: c.closedBy });

export function cashReport(ctx: CashReportContext, f: CashFilters): CashReport {
  const mine = ctx.cashMovements.filter(m => m.currency === f.currency && (!f.branchId || m.branchId === f.branchId));
  const applied = mine.filter(m => m.status === 'Aplicado');
  const period = applied.filter(m => inRange(dayOf(m.date), f.range));
  const origin = (m: CashMovement) => movementOrigin(m);
  const income = period.filter(m => m.kind === 'Ingreso');
  const outflow = period.filter(m => m.kind === 'Egreso');
  const operative = outflow.filter(m => origin(m) !== 'deposit' && origin(m) !== 'refund');
  const reversed = mine.filter(m => m.status === 'Reversado' && inRange(m.reversal ? dayOf(m.reversal.at) : undefined, f.range));
  const pending = eligibleForDeposit(applied, f.currency);

  const days = new Map<string, DayFlow>();
  for (const m of period) {
    if (origin(m) === 'deposit') continue;
    const d = dayOf(m.date);
    const cur = days.get(d) ?? { date: d, income: 0, expense: 0 };
    if (m.kind === 'Ingreso') cur.income = round2(cur.income + m.amount); else cur.expense = round2(cur.expense + m.amount);
    days.set(d, cur);
  }

  const branches = new Map<string, { name: string; income: number; expense: number }>();
  for (const m of period) {
    if (origin(m) === 'deposit') continue;
    const name = ctx.branches.find(b => b.id === m.branchId)?.name ?? 'Sin sede';
    const cur = branches.get(name) ?? { name, income: 0, expense: 0 };
    if (m.kind === 'Ingreso') cur.income = round2(cur.income + m.amount); else if (origin(m) !== 'refund') cur.expense = round2(cur.expense + m.amount);
    branches.set(name, cur);
  }

  const closures = ctx.cashClosures.filter(c => c.scope === 'caja' && c.currency === f.currency && (!f.branchId || c.branchId === f.branchId) && inRange(c.date, f.range)).map(closureLine).sort((a, b) => b.date.localeCompare(a.date));
  const totalIncome = sum(income, m => m.amount);
  const totalExpense = sum(operative, m => m.amount);
  return {
    income: totalIncome,
    expense: totalExpense,
    net: round2(totalIncome - totalExpense),
    refunds: sum(outflow.filter(m => origin(m) === 'refund'), m => m.amount),
    deposits: sum(outflow.filter(m => origin(m) === 'deposit'), m => m.amount),
    balance: cashBalance(applied, f.currency),
    byMethod: amounts(income, m => m.method),
    incomeByConcept: amounts(income, m => m.concept),
    expenseByConcept: amounts(operative, m => m.concept),
    byDay: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)),
    byBranch: [...branches.values()].sort((a, b) => b.income - a.income || a.name.localeCompare(b.name)),
    reversed: { count: reversed.length, amount: sum(reversed, m => m.amount) },
    pendingDeposit: { count: pending.length, amount: sum(pending, m => m.amount) },
    closures,
    closureDifference: sum(closures.filter(c => c.status === 'Cerrada'), c => c.difference),
  };
}

// ---------------------------------------------------------------- Caja chica
export interface PettyReport {
  income: number;
  expense: number;
  balance: number;
  fund: PettyFund;
  refill: number;
  byCategory: { name: string; count: number; amount: number }[];
  reversed: { count: number; amount: number };
  closures: ClosureLine[];
  rows: PettyCashMovement[];
}

/**
 * El reporte de la caja chica: de UNA sede si se indica (`branchId`) o de todas las que se ven (el saldo, el fondo y lo que falta reponer se suman por sede:
 * lo que sobra en una no cubre lo que falta en otra).
 */
export function pettyReport(ctx: Pick<CashReportContext, 'pettyCashMovements' | 'cashClosures' | 'fund' | 'fundOf'>, range: DateRange, branchId = ''): PettyReport {
  const all = branchId ? ctx.pettyCashMovements.filter(m => m.branchId === branchId) : ctx.pettyCashMovements;
  const ids = [...new Set(all.map(m => m.branchId))];
  const fund = ctx.fundOf ? (branchId ? ctx.fundOf(branchId) : combinedFund(ids, ctx.fundOf)) : ctx.fund;
  const refill = ctx.fundOf && !branchId
    ? round2(ids.reduce((acc, id) => acc + refillNeeded(ctx.fundOf!(id), all.filter(m => m.branchId === id)), 0))
    : refillNeeded(fund, all);
  const period = all.filter(m => m.status === 'Aplicado' && inRange(dayOf(m.date), range));
  const expenses = period.filter(m => m.kind === 'Egreso');
  const cats = new Map<string, { name: string; count: number; amount: number }>();
  for (const m of expenses) {
    const cur = cats.get(m.category) ?? { name: m.category, count: 0, amount: 0 };
    cats.set(m.category, { name: m.category, count: cur.count + 1, amount: round2(cur.amount + m.amount) });
  }
  const reversed = all.filter(m => m.status === 'Reversado' && inRange(m.reversal ? dayOf(m.reversal.at) : undefined, range));
  return {
    income: sum(period.filter(m => m.kind === 'Ingreso'), m => m.amount),
    expense: sum(expenses, m => m.amount),
    balance: pettyBalance(all),
    fund,
    refill,
    byCategory: [...cats.values()].sort((a, b) => b.amount - a.amount),
    reversed: { count: reversed.length, amount: sum(reversed, m => m.amount) },
    closures: ctx.cashClosures.filter(c => c.scope === 'caja-chica' && (!branchId || c.branchId === branchId) && inRange(c.date, range)).map(closureLine).sort((a, b) => b.date.localeCompare(a.date)),
    rows: [...period].sort((a, b) => b.date.localeCompare(a.date)),
  };
}
