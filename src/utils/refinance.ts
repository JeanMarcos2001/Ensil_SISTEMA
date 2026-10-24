/**
 * Refinanciación de una cuota (funciones puras).
 *
 * Refinanciar traslada el SALDO PENDIENTE de una cuota a una cuota nueva con otra fecha de vencimiento. La cuota origen queda
 * «Refinanciada» (sin saldo; conserva lo que ya se cobró), la nueva cuota nace por el mismo monto (no se condona ni se
 * recarga nada) y el plan recalcula su saldo, su próxima cuota y su estado. El motivo es obligatorio y queda en ambas cuotas.
 * No se refinancian cuotas de monto variable (contado en 2 partes), anuladas o ya refinanciadas.
 */
import type { Plan } from '../context/DataContext';
import { installmentDueISO, MIN_DETAIL } from './enrollmentDrop';
import { formatDisplayDate, roundMoney } from './tariffs';

export interface RefinanceInput {
  /** Nombre de la nueva cuota. */
  name: string;
  /** Nuevo vencimiento (YYYY-MM-DD). */
  dueDate: string;
  reason: string;
}

const closedStatus = (s: string) => s === 'Anulada' || s === 'Refinanciada';

export function validateRefinance(plan: Plan, installmentId: string, input: RefinanceInput, today: string): string[] {
  const e: string[] = [];
  const inst = plan.installments.find(i => i.id === installmentId);
  if (!inst) return ['No se encontró la cuota.'];
  if (plan.status === 'Caída') e.push('La matrícula del plan cayó: no se refinancian sus cuotas.');
  if (closedStatus(inst.status)) e.push(`La cuota está ${inst.status.toLowerCase()}: no se puede refinanciar.`);
  else if (!(inst.balance > 0)) e.push('La cuota no tiene saldo pendiente.');
  if (inst.variable) e.push('Las cuotas de monto variable (contado en 2 partes) no se refinancian.');
  if (input.name.trim().length < 3) e.push('Indique el nombre de la nueva cuota.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) e.push('Indique la nueva fecha de vencimiento.');
  else if (input.dueDate < today) e.push('La nueva fecha de vencimiento no puede ser anterior a hoy.');
  if (input.reason.trim().length < MIN_DETAIL) e.push('Indique el motivo de la refinanciación: queda como constancia.');
  return e;
}

const balanceOf = (installments: any[]) => roundMoney(installments.reduce((a, i) => a + (i.balance > 0 && !closedStatus(i.status) ? i.balance : 0), 0));

export function applyRefinance(plan: Plan, installmentId: string, input: RefinanceInput, today: string, at: string): Plan {
  const inst = plan.installments.find(i => i.id === installmentId)!;
  const newId = `R${plan.installments.filter(i => i.refinancedFrom).length + 1}`;
  const moved = roundMoney(inst.balance);
  const installments = plan.installments.map(i => (i.id === installmentId
    ? { ...i, status: 'Refinanciada', balance: 0, refinancedTo: newId, note: `Refinanciada: ${input.reason.trim()}` }
    : i));
  installments.push({
    id: newId,
    name: input.name.trim(),
    amount: moved,
    balance: moved,
    dueDate: formatDisplayDate(input.dueDate),
    dueDateISO: input.dueDate,
    status: 'Pendiente',
    payments: [],
    refinancedFrom: installmentId,
    note: `Refinanciación de «${inst.name}» (${input.reason.trim()})`,
    createdAt: at,
  });
  const open = installments.filter(i => i.balance > 0 && !closedStatus(i.status));
  const next = [...open].sort((a, b) => (installmentDueISO(a) || '9999').localeCompare(installmentDueISO(b) || '9999'))[0];
  const overdue = open.some(i => (installmentDueISO(i) || '9999') < today);
  return {
    ...plan,
    installments,
    balance: balanceOf(installments),
    next: next?.dueDate ?? '-',
    status: plan.status === 'Completado' ? plan.status : overdue ? 'Atrasado' : 'Al día',
  };
}
