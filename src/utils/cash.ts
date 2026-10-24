/**
 * Movimientos de caja (funciones puras): origen, reversa y lotes de depósito.
 *
 * Cada movimiento nace de algo distinto y por eso se reversa de forma distinta:
 *  - nacido de un PAGO (cuota o matrícula): no se reversa aquí, sino reversando el pago (así el plan, el comprobante y la caja
 *    quedan coherentes); lo mismo vale para la «Devolución de pago», que es consecuencia de esa reversa;
 *  - VENTA de artículo: al reversarla se devuelve el artículo al stock (Kardex «Devolución»);
 *  - LOTE DE DEPÓSITO (egreso de efectivo hacia el banco): al reversarlo los ingresos del lote vuelven a quedar por depositar;
 *  - un ingreso que ya está en un lote de depósito no se reversa mientras el lote exista;
 *  - EGRESO o ingreso manual: se reversa con motivo y constancia.
 * Un movimiento reversado no se borra: queda marcado «Reversado» con quién, cuándo y por qué, y deja de contar en el saldo.
 */
import type { CashMovement, Plan } from '../context/DataContext';
import { nextSequentialId } from './ids';
import { localDateOf } from './schedule';

export const CASH_REVERSAL_REASONS = [
  'Error de registro (monto, medio o concepto)',
  'Movimiento duplicado',
  'Operación anulada',
  'Otro',
];
export const MIN_DETAIL = 5;

export const DEPOSIT_BANKS: Record<'PEN' | 'USD', string[]> = {
  PEN: ['BCP - Cuenta Corriente PEN', 'BBVA - Recaudadora PEN'],
  USD: ['BCP - Cuenta Corriente USD'],
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export type MovementOrigin = 'payment' | 'refund' | 'sale' | 'deposit' | 'manual';

export function movementOrigin(m: CashMovement): MovementOrigin {
  if (m.paymentId) return m.concept === 'Devolución de pago' ? 'refund' : 'payment';
  if (m.deposit) return 'deposit';
  if (m.sale || m.concept === 'Venta de artículo') return 'sale';
  return 'manual';
}

export const ORIGIN_LABEL: Record<MovementOrigin, string> = {
  payment: 'Cobro de matrícula o cuota',
  refund: 'Devolución de un pago',
  sale: 'Venta de artículo',
  deposit: 'Depósito al banco',
  manual: 'Registro manual',
};

/** Matrículas a las que se refiere el movimiento: las que trae, o las que se deducen de su referencia (MAT-… o PLN-…). */
export function movementEnrollmentIds(m: Pick<CashMovement, 'enrollmentIds' | 'reference'>, plans: Pick<Plan, 'id' | 'mat'>[]): string[] {
  if (m.enrollmentIds && m.enrollmentIds.length > 0) return m.enrollmentIds;
  const ids = new Set<string>();
  for (const mat of m.reference.match(/MAT-\d{4}-\d{3}/g) ?? []) ids.add(mat);
  for (const pl of m.reference.match(/PLN-[\w-]+/g) ?? []) {
    const plan = plans.find(p => p.id === pl);
    if (plan) ids.add(plan.mat);
  }
  return [...ids];
}

// ---------------------------------------------------------------- Reversa

export interface CashReversalCheck {
  allowed: boolean;
  /** Por qué no se puede reversar desde la caja. */
  reason?: string;
  /** Pago desde el que debe reversarse (movimientos nacidos de un pago). */
  paymentId?: string;
  /** Artículo que vuelve al stock (venta con datos de stock). */
  restock?: { itemId: string; branchId: string; qty: number };
  /** Venta antigua: no se sabe qué artículo se vendió; el stock se ajusta a mano. */
  manualStock?: boolean;
  /** Ingresos que vuelven a estar por depositar (lote de depósito). */
  releases: CashMovement[];
}

export function cashReversalCheck(m: CashMovement, all: CashMovement[]): CashReversalCheck {
  const none = { allowed: false, releases: [] as CashMovement[] };
  if (m.status === 'Reversado') return { ...none, reason: 'Este movimiento ya fue reversado.' };
  const origin = movementOrigin(m);
  if (origin === 'payment') return { ...none, paymentId: m.paymentId, reason: `Nació del cobro ${m.paymentId}: se reversa desde el pago, para que el plan, el comprobante y la caja queden coherentes.` };
  if (origin === 'refund') return { ...none, paymentId: m.paymentId, reason: `Es la devolución de la reversa del pago ${m.paymentId}; no se deshace por separado.` };
  if (m.depositedIn) return { ...none, reason: `Este ingreso ya está en el lote de depósito ${m.depositedIn}. Reverse primero el lote.` };
  if (origin === 'deposit') return { allowed: true, releases: all.filter(x => x.depositedIn === m.deposit!.code) };
  if (origin === 'sale') {
    return m.sale
      ? { allowed: true, restock: m.sale, releases: [] }
      : { allowed: true, manualStock: true, releases: [] };
  }
  return { allowed: true, releases: [] };
}

export function validateCashReversal(m: CashMovement, reason: string, detail: string, all: CashMovement[]): string[] {
  const e: string[] = [];
  const check = cashReversalCheck(m, all);
  if (!check.allowed) e.push(check.reason ?? 'Este movimiento no se puede reversar.');
  if (!CASH_REVERSAL_REASONS.includes(reason)) e.push('Seleccione el motivo de la reversa.');
  if (detail.trim().length < MIN_DETAIL) e.push('Explique qué ocurrió: la reversa queda auditada.');
  return e;
}

/** Saldo de una caja (solo cuenta lo aplicado). */
export function cashBalance(movements: CashMovement[], currency: 'PEN' | 'USD'): number {
  return round2(movements.filter(m => m.currency === currency && m.status === 'Aplicado').reduce((a, m) => a + (m.kind === 'Ingreso' ? m.amount : -m.amount), 0));
}

/** Saldo de la caja después de reversar un movimiento. */
export function balanceAfterReversal(m: CashMovement, movements: CashMovement[]): number {
  return round2(cashBalance(movements, m.currency) + (m.kind === 'Ingreso' ? -m.amount : m.amount));
}

export function applyCashReversal(
  movements: CashMovement[], id: string, info: { reason: string; detail: string; at: string; by: string }
): CashMovement[] {
  const target = movements.find(m => m.id === id);
  if (!target) return movements;
  const code = target.deposit?.code;
  return movements.map(m => {
    if (m.id === id) return { ...m, status: 'Reversado' as const, reversal: { at: info.at, by: info.by, reason: info.reason, detail: info.detail.trim() } };
    if (code && m.depositedIn === code) return { ...m, depositedIn: undefined };
    return m;
  });
}

// ---------------------------------------------------------------- Lote de depósito

/** Ingresos en efectivo que aún no se depositaron en el banco. */
export const eligibleForDeposit = (movements: CashMovement[], currency: 'PEN' | 'USD'): CashMovement[] =>
  movements
    .filter(m => m.kind === 'Ingreso' && m.status === 'Aplicado' && m.currency === currency && m.method === 'Efectivo' && !m.depositedIn)
    .sort((a, b) => b.date.localeCompare(a.date));

export interface DepositInput {
  date: string;
  bank: string;
  currency: 'PEN' | 'USD';
  movementIds: string[];
}

export function validateDeposit(input: DepositInput, movements: CashMovement[], today: string): string[] {
  const e: string[] = [];
  if (!input.date) e.push('Indique la fecha del depósito.');
  else if (input.date > today) e.push('La fecha del depósito no puede ser futura.');
  if (!DEPOSIT_BANKS[input.currency].includes(input.bank)) e.push('Seleccione la cuenta de destino.');
  if (input.movementIds.length === 0) e.push('Seleccione al menos un ingreso para depositar.');
  const pool = eligibleForDeposit(movements, input.currency);
  if (input.movementIds.some(id => !pool.some(m => m.id === id))) e.push('Hay ingresos que ya no están disponibles para depositar.');
  const picked = pool.filter(m => input.movementIds.includes(m.id));
  const latest = picked.map(m => localDateOf(m.date)).sort().pop();
  if (latest && input.date && input.date < latest) e.push('La fecha del depósito no puede ser anterior a los ingresos que se depositan.');
  const total = round2(picked.reduce((a, m) => a + m.amount, 0));
  if (total > cashBalance(movements, input.currency)) e.push('El depósito supera el saldo de la caja.');
  return e;
}

/** Egreso del lote y los ingresos marcados como depositados. */
export function buildDeposit(
  input: DepositInput, movements: CashMovement[], by: string, at: string
): { code: string; egress: Omit<CashMovement, 'id' | 'user' | 'status'>; selected: CashMovement[] } {
  const selected = eligibleForDeposit(movements, input.currency).filter(m => input.movementIds.includes(m.id));
  const code = nextSequentialId('DEP', movements.filter(m => m.deposit).map(m => m.deposit!.code));
  const amount = round2(selected.reduce((a, m) => a + m.amount, 0));
  const amountUSD = round2(selected.reduce((a, m) => a + (m.amountUSD || 0), 0));
  void by;
  return {
    code,
    selected,
    egress: {
      date: at,
      kind: 'Egreso',
      concept: 'Depósito bancario',
      reference: `Lote ${code} → ${input.bank} (${selected.length} ingreso${selected.length === 1 ? '' : 's'})`,
      currency: input.currency,
      amount,
      amountUSD,
      method: 'Depósito',
      bank: input.bank,
      deposit: { code, bank: input.bank, movementIds: selected.map(m => m.id) },
    },
  };
}

// ---------------------------------------------------------------- Egreso manual

export const EXPENSE_TYPES = ['Pago a proveedor', 'Reembolso', 'Ajuste de caja'];
export const EXPENSE_DOCS = ['Factura', 'Boleta', 'Recibo'];
export const EXPENSE_METHODS = ['Efectivo', 'Transferencia'];

export interface ExpenseInput {
  date: string;
  currency: 'PEN' | 'USD';
  tc: string;
  type: string;
  concept: string;
  amount: string;
  docType: string;
  docNumber: string;
  branchId: string;
  method: string;
  bank: string;
  operation: string;
}

export type ExpenseErrors = Partial<Record<keyof ExpenseInput, string>>;

export const emptyExpense = (date: string, branchId = ''): ExpenseInput => ({
  date, currency: 'PEN', tc: '', type: '', concept: '', amount: '', docType: 'Factura', docNumber: '', branchId, method: 'Efectivo', bank: '', operation: '',
});

/** Un egreso en efectivo no puede superar el saldo de esa caja; uno por transferencia sale de una cuenta bancaria y pide banco y operación. */
export function validateExpense(i: ExpenseInput, balance: number, today: string): ExpenseErrors {
  const e: ExpenseErrors = {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.date)) e.date = 'La fecha es obligatoria.';
  else if (i.date > today) e.date = 'La fecha no puede ser futura.';
  if (!EXPENSE_TYPES.includes(i.type)) e.type = 'Seleccione el tipo de egreso.';
  if (i.concept.trim().length < 3) e.concept = 'Describa el egreso.';
  const amount = Number(i.amount);
  if (!i.amount.trim() || !(amount > 0)) e.amount = 'Indique un monto mayor que cero.';
  else if (i.method === 'Efectivo' && round2(amount) > balance) e.amount = `El egreso en efectivo supera el saldo de la caja (${balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}).`;
  if (i.currency === 'PEN' && !(Number(i.tc) > 0)) e.tc = 'Indique el tipo de cambio (TC) para un egreso en soles.';
  if (!i.docNumber.trim()) e.docNumber = 'Indique el N.º de comprobante.';
  if (!i.branchId) e.branchId = 'Seleccione la sede a la que corresponde el gasto.';
  if (!EXPENSE_METHODS.includes(i.method)) e.method = 'Seleccione el medio.';
  if (i.method === 'Transferencia') {
    if (!i.bank.trim()) e.bank = 'Indique el banco.';
    if (!i.operation.trim()) e.operation = 'Indique el N.º de operación.';
  }
  return e;
}

export function buildExpense(i: ExpenseInput): Omit<CashMovement, 'id' | 'user' | 'status'> {
  const amount = round2(Number(i.amount));
  const tc = Number(i.tc);
  return {
    date: new Date(`${i.date}T12:00:00`).toISOString(),
    kind: 'Egreso',
    concept: i.type,
    reference: `${i.concept.trim()} (${i.docType} ${i.docNumber.trim()})`,
    currency: i.currency,
    amount,
    exchangeRate: i.currency === 'PEN' ? tc : undefined,
    amountUSD: i.currency === 'USD' ? amount : round2(amount / tc),
    method: i.method,
    bank: i.method === 'Transferencia' ? i.bank.trim() : undefined,
    operationNumber: i.method === 'Transferencia' ? i.operation.trim() : undefined,
    branchId: i.branchId,
  };
}
