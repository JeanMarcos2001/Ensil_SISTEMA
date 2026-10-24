/**
 * Reversa (anulación) de un pago (funciones puras).
 *
 * Un pago registrado toca cuatro cosas: el propio pago, la cuota del plan que cubrió, la caja y el comprobante. Reversarlo es
 * una decisión de control (por eso pide motivo, queda auditada y no se borra nada):
 *  - el pago pasa a «Anulado» con quién, cuándo y por qué; su comprobante y su operación quedan libres para usarse de nuevo;
 *  - la cuota vuelve a tener saldo (o, en una matrícula de contado, se crea un «Pago único» pendiente) y se recalcula el plan;
 *  - en caja: si el dinero se devolvió al cliente, se registra el egreso de la devolución; si nunca ingresó (error de registro),
 *    los ingresos del pago se marcan «Reversados»;
 *  - un pago grupal repone la parte de cada matrícula del grupo.
 * En los cronogramas de monto variable (Contado en 2 partes) los pagos se reversan del más reciente al más antiguo.
 * La nota de crédito de un comprobante ya emitido no se genera aquí: solo se registra su número.
 */
import type { Enrollment, Payment, Plan, PromotionGroup } from '../context/DataContext';
import { installmentDueISO, MIN_DETAIL, paymentShareUSD } from './enrollmentDrop';
import { formatDisplayDate, roundMoney } from './tariffs';

export const REVERSAL_REASONS = [
  'Error de registro (monto, medio o alumno)',
  'Pago duplicado',
  'Transferencia o depósito no recibido',
  'Devolución al cliente',
  'Otro',
];
export const REFUND_REASON = 'Devolución al cliente';

export interface ReversalInput {
  reason: string;
  detail: string;
  /** ¿Se devolvió el dinero al cliente? */
  refunded: boolean;
  /** Número de una nota de crédito ya emitida fuera del sistema (modo «externa»). */
  creditNote: string;
  /** Qué hacer con el comprobante del pago (ver `utils/creditNotes.ts`). Si falta, se decide por la presencia del comprobante. */
  creditNoteMode?: 'emitir' | 'externa' | 'no-entregado' | 'ninguna';
}

const numberOf = (id: string) => parseInt(id.replace(/\D/g, ''), 10) || 0;
const isVoid = (p: Payment) => /anulad|revers/i.test(p.status);

export interface ReversalContext {
  payments: Payment[];
  plans: Plan[];
  enrollments: Enrollment[];
  groups: PromotionGroup[];
}

export function validateReversal(payment: Payment, input: ReversalInput, ctx: ReversalContext): string[] {
  const e: string[] = [];
  if (isVoid(payment) || payment.reversal) e.push('Este pago ya fue reversado.');
  if (!REVERSAL_REASONS.includes(input.reason)) e.push('Seleccione el motivo de la reversa.');
  if (input.detail.trim().length < MIN_DETAIL) e.push('Explique qué ocurrió: la reversa queda auditada.');
  if (input.reason === REFUND_REASON && !input.refunded) e.push('Una devolución al cliente implica que el dinero salió de caja: marque «Se devolvió el dinero».');
  // Cronogramas de monto variable: del pago más reciente al más antiguo
  for (const enrollmentId of payment.enrollmentIds ?? []) {
    const plan = ctx.plans.find(p => p.mat === enrollmentId);
    if (!plan?.installments.some(i => i.variable)) continue;
    const later = ctx.payments.find(p => p.id !== payment.id && !isVoid(p) && p.enrollmentIds?.includes(enrollmentId) && numberOf(p.id) > numberOf(payment.id));
    if (later) e.push(`La matrícula ${enrollmentId} tiene un pago posterior (${later.id}). Reverse primero el más reciente.`);
  }
  return e;
}

export interface ReversalTarget {
  enrollmentId: string;
  planId?: string;
  shareUSD: number;
}

/** A qué matrículas (y planes) afecta el pago y cuánto repone a cada una. */
export function reversalTargets(payment: Payment, ctx: ReversalContext): ReversalTarget[] {
  return (payment.enrollmentIds ?? []).map(enrollmentId => ({
    enrollmentId,
    planId: ctx.plans.find(p => p.mat === enrollmentId)?.id,
    shareUSD: paymentShareUSD(payment, enrollmentId, ctx.groups),
  }));
}

const balanceOf = (installments: any[]) =>
  roundMoney(installments.reduce((a, i) => a + (i.balance > 0 && i.status !== 'Refinanciada' && i.status !== 'Anulada' ? i.balance : 0), 0));

const restoredStatus = (i: { amount: number; balance: number }, due: string, today: string) =>
  i.balance <= 0 ? 'Pagada' : i.balance < i.amount ? 'Parcial' : due && due < today ? 'Vencida' : 'Pendiente';

export interface ReversalApplied {
  plan: Plan;
  /** ¿Se encontró en el plan el cobro de este pago? */
  matched: boolean;
  /** Mensaje si hubo que ajustar el plan de otra forma o no se pudo. */
  note?: string;
}

/** Repone en el plan lo que cubrió el pago. */
export function applyReversalToPlan(plan: Plan, payment: Pick<Payment, 'id' | 'receipt'>, shareUSD: number, today: string): ReversalApplied {
  let installments = plan.installments.map(i => ({ ...i, payments: [...(i.payments ?? [])] }));
  let matched = false;
  let note: string | undefined;

  const idx = installments.findIndex(i => i.payments.some((x: any) => x.paymentId === payment.id));
  const idxLegacy = idx >= 0 ? idx : installments.findIndex(i => i.payments.some((x: any) => !x.paymentId && x.receipt === payment.receipt && Math.abs(x.amount - shareUSD) < 0.01));

  if (idxLegacy >= 0) {
    matched = true;
    const inst = installments[idxLegacy];
    const entryAt = inst.payments.findIndex((x: any) => x.paymentId === payment.id || (!x.paymentId && x.receipt === payment.receipt && Math.abs(x.amount - shareUSD) < 0.01));
    const entry = inst.payments[entryAt];
    inst.payments.splice(entryAt, 1);
    const due = installmentDueISO(inst);

    if (inst.status === 'Anulada' || inst.status === 'Refinanciada') {
      note = 'La cuota ya estaba anulada o refinanciada: solo se quitó el cobro.';
    } else if (inst.variable) {
      // Contado en 2 partes: se reponen las dos partes a su estado inicial (el pago anterior ya fue reversado primero)
      const variables = installments.filter(i => i.variable);
      const first = variables[0];
      if (inst.id === first.id) {
        const paidFirst = inst.payments.reduce((a: number, x: any) => a + x.amount, 0);
        Object.assign(inst, { amount: plan.total, balance: roundMoney(plan.total - paidFirst), status: paidFirst > 0 ? 'Parcial' : 'Pendiente' });
        variables.slice(1).forEach(v => Object.assign(v, { amount: 0, balance: 0, status: 'Pendiente' }));
      } else {
        const paidBefore = variables.filter(v => v.id !== inst.id).reduce((a, v) => a + v.payments.reduce((s: number, x: any) => s + x.amount, 0), 0);
        const remaining = roundMoney(plan.total - paidBefore);
        const paidHere = inst.payments.reduce((a: number, x: any) => a + x.amount, 0);
        Object.assign(inst, { amount: remaining, balance: roundMoney(remaining - paidHere), status: paidHere > 0 ? 'Parcial' : due && due < today ? 'Vencida' : 'Pendiente' });
      }
    } else {
      inst.balance = roundMoney(Math.min(inst.amount, inst.balance + entry.amount));
      inst.status = restoredStatus(inst, due, today);
    }
  } else if (installments.length === 0) {
    // Matrícula de contado: el plan no tenía cuotas; se crea el pago único pendiente para poder cobrarlo de nuevo
    matched = true;
    installments = [{
      id: 'C1', name: 'Pago único', amount: plan.total, balance: roundMoney(shareUSD), dueDate: formatDisplayDate(today), dueDateISO: today,
      status: 'Pendiente', payments: [],
    }];
  } else {
    note = 'No se encontró el cobro de este pago en el plan (registro antiguo): ajuste el plan con una refinanciación si corresponde.';
  }

  const balance = balanceOf(installments);
  const overdue = installments.some(i => i.balance > 0 && !['Anulada', 'Refinanciada'].includes(i.status) && (installmentDueISO(i) || '9999') < today);
  const status = plan.status === 'Caída' ? 'Caída' : balance === 0 ? 'Completado' : overdue ? 'Atrasado' : plan.status === 'Completado' || plan.status === 'Atrasado' ? 'Al día' : plan.status;
  const next = installments.find(i => i.balance > 0 && !['Anulada', 'Refinanciada'].includes(i.status))?.dueDate ?? '-';
  return { plan: { ...plan, installments, balance, status, next }, matched, note };
}
