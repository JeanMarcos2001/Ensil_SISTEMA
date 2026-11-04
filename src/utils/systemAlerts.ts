/**
 * Alertas del sistema (funciones puras): los avisos que dispara una REGLA por fecha o por estado, no una acción de alguien
 * (cuotas vencidas, primera asesoría sin materiales, contratos por vencer, stock bajo el mínimo).
 *
 * Nada de esto se guarda: se calcula con lo que ya existe y desaparece solo cuando se corrige la causa. Cada alerta lleva el mismo
 * `eventId` y la misma sede (`subjectBranchId`) que un aviso, así que llega a quien corresponde con las reglas de `notifications.ts`.
 */
import type { Branch, Contract, Enrollment, Item, Plan, StockItem } from '../context/DataContext';
import { daysBetween } from './validity';
import type { FirstSessionGate } from './verificationGate';
import { installmentState } from './planState';
import { contractStatus } from './payroll';
import { EXPIRY_DAYS } from './reportStaff';
import type { NoticeLike } from './notifications';

export interface SystemAlert extends NoticeLike {
  /** Estable: la misma causa en la misma sede es siempre la misma alerta. */
  key: string;
  eventId: string;
  title: string;
  message: string;
  count: number;
  type: 'info' | 'warning' | 'danger';
  /** Pantalla donde se resuelve. */
  link: string;
}

export interface AlertInput {
  plans: Plan[];
  enrollments: Pick<Enrollment, 'id' | 'branchId'>[];
  contracts: Contract[];
  stockItems: StockItem[];
  items: Pick<Item, 'id' | 'name'>[];
  branches: Pick<Branch, 'id' | 'name'>[];
  /** Resultado de `blockedFirstSessions`: primeras asesorías que esperan su verificación. */
  blockedSessions: Record<string, FirstSessionGate>;
}

const usd = (n: number) => `USD ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function deriveAlerts(input: AlertInput, today: string): SystemAlert[] {
  const branchName = (id: string) => input.branches.find(b => b.id === id)?.name ?? id;
  const branchOfEnrollment = (id: string) => input.enrollments.find(e => e.id === id)?.branchId ?? '';
  const out: SystemAlert[] = [];

  // Cuotas vencidas por sede (las matrículas caídas no se cobran como cartera activa)
  const overdue = new Map<string, { count: number; amount: number }>();
  for (const plan of input.plans) {
    if (plan.status === 'Caída') continue;
    const branchId = branchOfEnrollment(plan.mat);
    for (const i of plan.installments) {
      if (installmentState(i, today) !== 'Vencida') continue;
      const cur = overdue.get(branchId) ?? { count: 0, amount: 0 };
      overdue.set(branchId, { count: cur.count + 1, amount: cur.amount + i.balance });
    }
  }
  for (const [branchId, v] of overdue) {
    out.push({
      key: `installment_overdue:${branchId}`, eventId: 'installment_overdue', scope: { subjectBranchId: branchId }, count: v.count, type: 'warning',
      title: `${plural(v.count, 'cuota vencida', 'cuotas vencidas')} en ${branchName(branchId)}`, message: `Suman ${usd(v.amount)} por cobrar.`, link: '/operacion/planes-y-cartera',
    });
  }

  // Primera asesoría que espera sus materiales, por sede
  const blocked = new Map<string, { count: number; worst: 'planificada' | 'urgente' | 'critica' | 'vencida' }>();
  const ORDER = ['planificada', 'urgente', 'critica', 'vencida'] as const;
  for (const [enrollmentId, gate] of Object.entries(input.blockedSessions)) {
    if (!gate.blocked || gate.level === 'ok') continue;
    const branchId = branchOfEnrollment(enrollmentId);
    const cur = blocked.get(branchId) ?? { count: 0, worst: 'planificada' as const };
    const level = gate.level as (typeof ORDER)[number];
    blocked.set(branchId, { count: cur.count + 1, worst: ORDER.indexOf(level) > ORDER.indexOf(cur.worst) ? level : cur.worst });
  }
  for (const [branchId, v] of blocked) {
    out.push({
      key: `first_session_without_materials:${branchId}`, eventId: 'first_session_without_materials', scope: { subjectBranchId: branchId }, count: v.count,
      type: v.worst === 'critica' || v.worst === 'vencida' ? 'danger' : 'warning',
      title: `${plural(v.count, 'primera asesoría espera', 'primeras asesorías esperan')} sus materiales en ${branchName(branchId)}`,
      message: v.worst === 'vencida' ? 'Alguna ya pasó de hora sin verificar: hay que reprogramarla.' : 'Entregue los materiales antes de la asesoría para poder marcar asistencia.', link: '/operacion/verificacion',
    });
  }

  // Contratos vigentes que vencen pronto (alcance de toda la empresa)
  const expiring = input.contracts.filter(c => contractStatus(c, today) === 'Vigente' && !!c.endDate && daysBetween(today, c.endDate) <= EXPIRY_DAYS);
  if (expiring.length > 0) {
    out.push({
      key: 'contract_expiring:all', eventId: 'contract_expiring', scope: {}, count: expiring.length, type: 'warning',
      title: `${plural(expiring.length, 'contrato vence', 'contratos vencen')} en ${EXPIRY_DAYS} días o menos`, message: 'Renueve o cierre cada contrato antes de que venza.', link: '/personas/contratos',
    });
  }

  // Stock por debajo del mínimo, por sede
  const low = new Map<string, number>();
  for (const s of input.stockItems) if (s.minStock > 0 && s.stock < s.minStock) low.set(s.branchId, (low.get(s.branchId) ?? 0) + 1);
  for (const [branchId, count] of low) {
    out.push({
      key: `stock_below_minimum:${branchId}`, eventId: 'stock_below_minimum', scope: { subjectBranchId: branchId }, count, type: 'warning',
      title: `${plural(count, 'artículo bajo el mínimo', 'artículos bajo el mínimo')} en ${branchName(branchId)}`, message: 'Solicite la reposición al almacén central.', link: '/logistica/stock',
    });
  }

  return out;
}
