/**
 * Estado derivado de cuotas y planes (funciones puras).
 *
 * El estado de una cuota o de un plan NO se guarda como verdad: se calcula con lo cobrado y la fecha de vencimiento. Así una
 * cuota «Pendiente» de ayer aparece «Vencida» sin que nadie tenga que actualizarla, y todas las pantallas (Planes, Titulares,
 * Dashboard, cobranza) dicen lo mismo.
 */
import type { Installment, Plan } from '../context/DataContext';
import { roundMoney } from './tariffs';

export type InstallmentLike = Pick<Installment, 'amount' | 'balance' | 'status' | 'dueDateISO'> & Partial<Pick<Installment, 'payments' | 'variable'>>;

export const isClosed = (i: Pick<InstallmentLike, 'status'>) => i.status === 'Anulada' || i.status === 'Refinanciada';
/** Cuota con saldo por cobrar. */
export const isOpen = (i: InstallmentLike) => !isClosed(i) && i.balance > 0;

export type InstallmentState = 'Pagada' | 'Parcial' | 'Vencida' | 'Pendiente' | 'Anulada' | 'Refinanciada';

/** Estado real de una cuota a una fecha. */
export function installmentState(i: InstallmentLike, today: string): InstallmentState {
  if (i.status === 'Anulada' || i.status === 'Refinanciada') return i.status;
  if (i.balance <= 0) return 'Pagada';
  const due = i.dueDateISO;
  if (due && due < today) return 'Vencida';
  const paid = (i.payments ?? []).reduce((a, p) => a + p.amount, 0);
  return paid > 0 || i.balance < i.amount ? 'Parcial' : 'Pendiente';
}

/** Días de atraso de una cuota abierta (0 si no venció). */
export function daysOverdue(i: InstallmentLike, today: string): number {
  if (!isOpen(i)) return 0;
  const due = i.dueDateISO;
  if (!due || due >= today) return 0;
  return Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${due}T00:00:00Z`)) / 86400000);
}

export type PlanState = 'Al día' | 'Atrasado' | 'Completado' | 'Caída';

export function planState(plan: Pick<Plan, 'status' | 'installments'>, today: string): PlanState {
  if (plan.status === 'Caída') return 'Caída';
  const open = plan.installments.filter(isOpen);
  if (open.length === 0) return plan.installments.length === 0 && plan.status !== 'Completado' ? (plan.status as PlanState) : 'Completado';
  return open.some(i => daysOverdue(i, today) > 0) ? 'Atrasado' : 'Al día';
}

/** Próxima cuota por cobrar (la de vencimiento más cercano). No se guarda en el plan: se calcula cuando se muestra. */
export const nextInstallment = (plan: Pick<Plan, 'installments'>): Installment | undefined =>
  [...plan.installments.filter(isOpen)].sort((a, b) => (a.dueDateISO || '9999').localeCompare(b.dueDateISO || '9999'))[0];

/**
 * Saldo y estado del plan a partir de sus cuotas. Es la ÚNICA función que escribe `balance` y `status` del plan: cobros,
 * reversas, refinanciaciones, caídas, reactivaciones y cambios de programa la llaman al terminar de tocar las cuotas.
 */
export function recomputePlan(plan: Plan, today: string): Plan {
  return {
    ...plan,
    balance: roundMoney(plan.installments.filter(isOpen).reduce((a, i) => a + i.balance, 0)),
    status: planState(plan, today),
  };
}
