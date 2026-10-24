/**
 * Estado derivado de cuotas y planes (funciones puras).
 *
 * El estado de una cuota o de un plan NO se guarda como verdad: se calcula con lo cobrado y la fecha de vencimiento. Así una
 * cuota «Pendiente» de ayer aparece «Vencida» sin que nadie tenga que actualizarla, y todas las pantallas (Planes, Titulares,
 * Dashboard, cobranza) dicen lo mismo.
 */
import type { Plan } from '../context/DataContext';
import { installmentDueISO } from './enrollmentDrop';
import { roundMoney } from './tariffs';

export type InstallmentLike = {
  amount: number;
  balance: number;
  status: string;
  dueDate?: string;
  dueDateISO?: string;
  payments?: { amount: number }[];
  variable?: boolean;
};

export const isClosed = (i: Pick<InstallmentLike, 'status'>) => i.status === 'Anulada' || i.status === 'Refinanciada';
/** Cuota con saldo por cobrar. */
export const isOpen = (i: InstallmentLike) => !isClosed(i) && i.balance > 0;

export type InstallmentState = 'Pagada' | 'Parcial' | 'Vencida' | 'Pendiente' | 'Anulada' | 'Refinanciada';

/** Estado real de una cuota a una fecha. */
export function installmentState(i: InstallmentLike, today: string): InstallmentState {
  if (i.status === 'Anulada' || i.status === 'Refinanciada') return i.status;
  if (i.balance <= 0) return 'Pagada';
  const due = installmentDueISO(i);
  if (due && due < today) return 'Vencida';
  const paid = (i.payments ?? []).reduce((a, p) => a + p.amount, 0);
  return paid > 0 || i.balance < i.amount ? 'Parcial' : 'Pendiente';
}

/** Días de atraso de una cuota abierta (0 si no venció). */
export function daysOverdue(i: InstallmentLike, today: string): number {
  if (!isOpen(i)) return 0;
  const due = installmentDueISO(i);
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

/** Saldo, próxima cuota y estado del plan a partir de sus cuotas. */
export function recomputePlan(plan: Plan, today: string): Plan {
  const open = plan.installments.filter(isOpen);
  const next = [...open].sort((a, b) => (installmentDueISO(a) || '9999').localeCompare(installmentDueISO(b) || '9999'))[0];
  return {
    ...plan,
    balance: roundMoney(open.reduce((a, i) => a + i.balance, 0)),
    next: next?.dueDate ?? '-',
    status: planState(plan, today),
  };
}
