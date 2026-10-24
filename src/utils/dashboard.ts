/**
 * Cifras del Dashboard (funciones puras). Todo se DERIVA de los datos del sistema: matrículas, planes, pagos, caja,
 * stock y solicitudes. No hay números escritos a mano.
 */
import type { Branch, CashMovement, ChangeRequest, DropRequest, Enrollment, Payment, Plan, StockItem } from '../context/DataContext';
import { cashBalance } from './cash';
import { installmentDueISO } from './enrollmentDrop';
import { localDateOf } from './schedule';
import { formatDisplayDate, parseDisplayDate, roundMoney } from './tariffs';

export interface DashboardContext {
  branches: Branch[];
  enrollments: Enrollment[];
  plans: Plan[];
  payments: Payment[];
  cashMovements: CashMovement[];
  stockItems: StockItem[];
  dropRequests: DropRequest[];
  /** Reactivaciones, cambios de programa y traslados. */
  changeRequests?: ChangeRequest[];
}

const isVoidPayment = (p: Payment) => /anulad|revers/i.test(p.status);
/** Fecha ISO de un pago (los registros antiguos guardan «24 Mar 2024»). */
export const paymentDateISO = (p: Pick<Payment, 'date'>): string => (/^\d{4}-\d{2}-\d{2}/.test(p.date) ? p.date.slice(0, 10) : parseDisplayDate(p.date) ?? '');

export interface DueItem {
  planId: string;
  enrollmentId: string;
  titular: string;
  installment: string;
  dueISO: string;
  dueLabel: string;
  balance: number;
  /** Días hasta el vencimiento (negativo = vencida). */
  days: number;
}

const daysBetween = (fromISO: string, toISO: string): number => Math.round((Date.parse(`${toISO}T00:00:00Z`) - Date.parse(`${fromISO}T00:00:00Z`)) / 86400000);

/** Cuotas con saldo que vencen dentro de `horizon` días o ya vencieron (la más urgente primero). */
export function upcomingDues(plans: Plan[], today: string, horizon = 7): DueItem[] {
  const out: DueItem[] = [];
  for (const plan of plans) {
    if (plan.status === 'Completado') continue;
    for (const i of plan.installments) {
      if (!(i.balance > 0) || ['Anulada', 'Refinanciada'].includes(i.status)) continue;
      const dueISO = installmentDueISO(i);
      if (!dueISO) continue;
      const days = daysBetween(today, dueISO);
      if (days > horizon) continue;
      out.push({ planId: plan.id, enrollmentId: plan.mat, titular: plan.titular, installment: i.name, dueISO, dueLabel: i.dueDate ?? dueISO, balance: roundMoney(i.balance), days });
    }
  }
  return out.sort((a, b) => a.dueISO.localeCompare(b.dueISO) || a.enrollmentId.localeCompare(b.enrollmentId));
}

export const dueText = (days: number): string =>
  days < 0 ? `Vencida hace ${-days} día${days === -1 ? '' : 's'}` : days === 0 ? 'Vence hoy' : days === 1 ? 'Vence mañana' : `Vence en ${days} días`;

export interface BranchFigures {
  branch: Branch;
  activeEnrollments: number;
  monthIncomeUSD: number;
  overdueUSD: number;
}

export interface Kpis {
  activeEnrollments: number;
  portfolioUSD: number;
  overdueUSD: number;
  paymentsTodayUSD: number;
  pendingVerifications: number;
  lowStock: number;
  pendingRequests: number;
  cashPEN: number;
  cashUSD: number;
}

export function dashboardKpis(ctx: DashboardContext, today: string): Kpis {
  const active = ctx.enrollments.filter(e => e.status === 'Activa');
  const overdue = upcomingDues(ctx.plans, today, -1).reduce((a, d) => a + d.balance, 0);
  return {
    activeEnrollments: active.length,
    portfolioUSD: roundMoney(ctx.plans.filter(p => p.status !== 'Completado').reduce((a, p) => a + (p.balance > 0 ? p.balance : 0), 0)),
    overdueUSD: roundMoney(overdue),
    paymentsTodayUSD: roundMoney(ctx.payments.filter(p => !isVoidPayment(p) && paymentDateISO(p) === today).reduce((a, p) => a + p.amount, 0)),
    pendingVerifications: active.filter(e => !e.verificationStatus || e.verificationStatus === 'Pendiente').length,
    lowStock: ctx.stockItems.filter(s => s.stock <= s.minStock).length,
    pendingRequests: ctx.dropRequests.filter(r => r.status === 'Pendiente').length + (ctx.changeRequests ?? []).filter(r => r.status === 'Pendiente').length,
    cashPEN: cashBalance(ctx.cashMovements, 'PEN'),
    cashUSD: cashBalance(ctx.cashMovements, 'USD'),
  };
}

/** Matrículas activas, ingresos del mes (USD) y deuda vencida de cada sede. */
export function branchFigures(ctx: DashboardContext, today: string): BranchFigures[] {
  const month = today.slice(0, 7);
  const overdueByPlan = new Map<string, number>();
  for (const d of upcomingDues(ctx.plans, today, -1)) overdueByPlan.set(d.enrollmentId, (overdueByPlan.get(d.enrollmentId) ?? 0) + d.balance);
  return ctx.branches
    .filter(b => b.status === 'Activo')
    .map(branch => {
      const mine = ctx.enrollments.filter(e => (e.branchId ? e.branchId === branch.id : e.sede === branch.name));
      const income = ctx.cashMovements
        .filter(m => m.branchId === branch.id && m.kind === 'Ingreso' && m.status === 'Aplicado' && localDateOf(m.date).slice(0, 7) === month)
        .reduce((a, m) => a + (m.amountUSD || (m.currency === 'USD' ? m.amount : 0)), 0);
      return {
        branch,
        activeEnrollments: mine.filter(e => e.status === 'Activa').length,
        monthIncomeUSD: roundMoney(income),
        overdueUSD: roundMoney(mine.reduce((a, e) => a + (overdueByPlan.get(e.id) ?? 0), 0)),
      };
    });
}

export interface ActivityItem {
  at: string;
  user: string;
  text: string;
}

/** Últimos hechos del sistema (caja, solicitudes de caída y reversas), el más reciente primero. */
export function recentActivity(ctx: DashboardContext, limit = 6): ActivityItem[] {
  const items: ActivityItem[] = [];
  for (const m of ctx.cashMovements) {
    items.push({ at: m.date, user: m.user, text: `${m.status === 'Reversado' ? 'tiene reversado' : m.kind === 'Ingreso' ? 'registró un ingreso' : 'registró un egreso'} en la caja ${m.currency}: ${m.concept}` });
    if (m.reversal) items.push({ at: m.reversal.at, user: m.reversal.by, text: `reversó el movimiento ${m.id} (${m.concept})` });
  }
  for (const r of ctx.dropRequests) {
    items.push({ at: r.requestedAt, user: r.requestedBy, text: `solicitó la caída de la matrícula ${r.enrollmentId}` });
    if (r.resolvedAt && r.resolvedBy) items.push({ at: r.resolvedAt, user: r.resolvedBy, text: `${r.status === 'Aprobada' ? 'aprobó' : 'rechazó'} la caída de la matrícula ${r.enrollmentId}` });
  }
  for (const p of ctx.payments) {
    if (p.reversal) items.push({ at: p.reversal.at, user: p.reversal.by, text: `reversó el pago ${p.id} de ${p.student}` });
  }
  return items.filter(i => i.at && !Number.isNaN(Date.parse(i.at))).sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

/** «Hace 10 min», «Hace 2 horas», «Ayer», o la fecha. */
export function relativeTime(iso: string, now: Date): string {
  const diff = now.getTime() - Date.parse(iso);
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'Ahora mismo';
  if (min < 60) return `Hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `Hace ${h} hora${h === 1 ? '' : 's'}`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'Ayer';
  if (d < 7) return `Hace ${d} días`;
  return formatDisplayDate(localDateOf(iso));
}

export const initials = (name: string): string => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join('') || '·';

