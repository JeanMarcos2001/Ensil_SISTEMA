/**
 * Estado de cuenta de un titular (funciones puras). Se DERIVA de las matrículas, los planes y los pagos de los alumnos a su
 * cargo: nunca se guarda un saldo en el titular (el campo `balance` del registro antiguo se ignora).
 *
 * Por matrícula: total del plan, cobrado, saldo, deuda vencida y próxima cuota. Lo anulado por una caída no es deuda.
 * Todo en USD (moneda de la configuración comercial).
 */
import type { Enrollment, Guardian, Payment, Plan, PromotionGroup, Student } from '../context/DataContext';
import { enrollmentPaidUSD, installmentDueISO, paymentShareUSD } from './enrollmentDrop';
import { roundMoney } from './tariffs';

export interface StatementContext {
  guardians: Guardian[];
  students: Student[];
  enrollments: Enrollment[];
  plans: Plan[];
  payments: Payment[];
  groups: PromotionGroup[];
}

export interface StatementInstallment {
  id: string;
  name: string;
  dueISO: string;
  dueLabel: string;
  amount: number;
  balance: number;
  status: string;
  overdue: boolean;
}

export interface StatementEnrollment {
  enrollment: Enrollment;
  studentName: string;
  plan?: Plan;
  totalUSD: number;
  paidUSD: number;
  balanceUSD: number;
  overdueUSD: number;
  /** Anulado por la caída de la matrícula (no es deuda). */
  annulledUSD: number;
  /** Cuotas con saldo (próximas primero). */
  pending: StatementInstallment[];
  next?: StatementInstallment;
}

export interface StatementPayment {
  payment: Payment;
  enrollmentIds: string[];
  shareUSD: number;
  voided: boolean;
}

export interface GuardianStatement {
  guardian: Guardian;
  students: Student[];
  enrollments: StatementEnrollment[];
  payments: StatementPayment[];
  totals: { totalUSD: number; paidUSD: number; balanceUSD: number; overdueUSD: number; annulledUSD: number };
}

/** Alumnos a cargo del titular: por vínculo; los registros antiguos se reconocen por el nombre del titular. */
export const studentsOfGuardian = (g: Guardian, students: Student[]): Student[] =>
  students.filter(s => (s.guardianIds ? s.guardianIds.includes(g.id) : s.titular === g.name));

const isVoid = (p: Payment) => /anulad|revers/i.test(p.status);

export function buildStatement(ctx: StatementContext, guardianId: string, today: string): GuardianStatement | undefined {
  const guardian = ctx.guardians.find(g => g.id === guardianId);
  if (!guardian) return undefined;
  const students = studentsOfGuardian(guardian, ctx.students);
  const own = ctx.enrollments.filter(e => e.guardianIds?.includes(guardian.id) || students.some(s => (e.studentId ? e.studentId === s.id : e.student === s.name)));

  const rows: StatementEnrollment[] = own.map(enrollment => {
    const plan = ctx.plans.find(p => p.mat === enrollment.id);
    const paid = enrollmentPaidUSD(enrollment.id, ctx.payments, ctx.groups, plan);
    const total = plan?.total ?? enrollment.assignedPrice ?? 0;
    const pending: StatementInstallment[] = (plan?.installments ?? [])
      .filter(i => i.balance > 0 && !['Anulada', 'Refinanciada'].includes(i.status))
      .map(i => {
        const dueISO = installmentDueISO(i);
        return { id: i.id, name: i.name, dueISO, dueLabel: i.dueDate ?? dueISO, amount: i.amount, balance: roundMoney(i.balance), status: i.status, overdue: !!dueISO && dueISO < today };
      })
      .sort((a, b) => (a.dueISO || '9999').localeCompare(b.dueISO || '9999'));
    // Sin cuotas (contado ya cobrado o sin plan): el saldo es lo que falta del precio si la matrícula sigue activa
    const balance = plan ? roundMoney(plan.balance) : enrollment.status === 'Activa' ? roundMoney(Math.max(0, total - paid)) : 0;
    const overdue = roundMoney(pending.filter(i => i.overdue).reduce((a, i) => a + i.balance, 0));
    const annulled = plan && plan.status === 'Caída' ? roundMoney(Math.max(0, total - paid - balance)) : 0;
    return { enrollment, studentName: enrollment.student, plan, totalUSD: roundMoney(total), paidUSD: paid, balanceUSD: balance, overdueUSD: overdue, annulledUSD: annulled, pending, next: pending[0] };
  });

  const ids = new Set(own.map(e => e.id));
  const payments: StatementPayment[] = ctx.payments
    .filter(p => p.enrollmentIds?.some(id => ids.has(id)))
    .map(p => {
      const mine = (p.enrollmentIds ?? []).filter(id => ids.has(id));
      return { payment: p, enrollmentIds: mine, shareUSD: roundMoney(mine.reduce((a, id) => a + paymentShareUSD(p, id, ctx.groups), 0)), voided: isVoid(p) };
    })
    .sort((a, b) => b.payment.date.localeCompare(a.payment.date) || b.payment.id.localeCompare(a.payment.id));

  const sum = (f: (r: StatementEnrollment) => number) => roundMoney(rows.reduce((a, r) => a + f(r), 0));
  return {
    guardian,
    students,
    enrollments: rows,
    payments,
    totals: { totalUSD: sum(r => r.totalUSD), paidUSD: sum(r => r.paidUSD), balanceUSD: sum(r => r.balanceUSD), overdueUSD: sum(r => r.overdueUSD), annulledUSD: sum(r => r.annulledUSD) },
  };
}

/** Saldo por cobrar y deuda vencida de un titular (para la lista). */
export function guardianBalance(ctx: StatementContext, guardianId: string, today: string): { balanceUSD: number; overdueUSD: number; students: number; enrollments: number } {
  const st = buildStatement(ctx, guardianId, today);
  return st
    ? { balanceUSD: st.totals.balanceUSD, overdueUSD: st.totals.overdueUSD, students: st.students.length, enrollments: st.enrollments.length }
    : { balanceUSD: 0, overdueUSD: 0, students: 0, enrollments: 0 };
}
