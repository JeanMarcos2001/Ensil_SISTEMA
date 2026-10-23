/**
 * Caída de una matrícula (funciones puras).
 *
 * Contexto: una matrícula registrada tiene un plan de pagos, pagos ya cobrados, asesorías y actividades del alumno, y a veces
 * pertenece a un grupo promocional. «Solicitar caída» NO borra nada: abre una solicitud que alguien con autoridad aprueba o
 * rechaza. Al aprobarla:
 *  - la matrícula pasa a «Caída» (desde la fecha en que el alumno dejó de asistir) y deja de contar como vigente;
 *  - las cuotas **futuras** sin pagar se anulan; las **vencidas** sin pagar se conservan como deuda (o se condonan, a decisión de quien aprueba);
 *  - lo ya pagado se conserva (si hay que devolver dinero se hace con «Reversar pago», que deja constancia en caja);
 *  - las asesorías futuras y las inscripciones en actividades se cancelan, salvo que el alumno tenga otra matrícula activa;
 *  - el alumno pasa a «Inactivo» si no le queda ninguna matrícula activa.
 * La entrega de materiales (verificación) no se revierte: se informa.
 */
import type {
  DropEffects,
  DropRequest,
  Enrollment,
  MonthlySchedule,
  Payment,
  Plan,
  PromotionGroup,
  Schedule,
  Student,
} from '../context/DataContext';
import { parseDisplayDate, roundMoney } from './tariffs';

export const DROP_REASONS = [
  'Motivos económicos',
  'Cambio de domicilio o de sede',
  'Falta de tiempo',
  'No se adaptó al programa',
  'Motivos de salud',
  'Cambió de institución',
  'Otro',
];

export const MIN_DETAIL = 5;

/** Fecha ISO de vencimiento de una cuota (las nuevas la traen; las antiguas solo guardan el texto «15 Abr 2024»). */
export const installmentDueISO = (i: { dueDateISO?: string; dueDate?: string }): string => i.dueDateISO ?? parseDisplayDate(i.dueDate) ?? '';

/** Fecha ISO de una matrícula (`dateISO`, o el texto antiguo). */
export const enrollmentDateISO = (e: Pick<Enrollment, 'dateISO' | 'date'>): string => e.dateISO ?? parseDisplayDate(e.date) ?? '';

const isVoidPayment = (p: Payment) => /anulad|revers/i.test(p.status);

/**
 * Lo realmente cobrado de una matrícula en USD. Con un plan con cuotas, es lo cobrado en sus cuotas (es la fuente más fiable:
 * incluye los registros antiguos y excluye los reversados). Sin cuotas (contado), son los pagos no anulados de la matrícula
 * (en un pago grupal, la parte que le corresponde).
 */
export function enrollmentPaidUSD(enrollmentId: string, payments: Payment[], groups: PromotionGroup[], plan?: Plan): number {
  if (plan && plan.installments.length > 0) {
    return roundMoney(plan.installments.reduce((a, i) => a + (i.payments ?? []).reduce((s: number, x: any) => s + (x.amount ?? 0), 0), 0));
  }
  let total = 0;
  for (const p of payments) {
    if (isVoidPayment(p) || !p.enrollmentIds?.includes(enrollmentId)) continue;
    total += paymentShareUSD(p, enrollmentId, groups);
  }
  return roundMoney(total);
}

/** Parte de un pago que corresponde a una matrícula (todo si es individual; su reparto si es grupal). */
export function paymentShareUSD(p: Payment, enrollmentId: string, groups: PromotionGroup[]): number {
  if (!p.promotionGroupId) return p.enrollmentIds && p.enrollmentIds.length > 1 ? roundMoney(p.amount / p.enrollmentIds.length) : p.amount;
  const group = groups.find(g => g.id === p.promotionGroupId);
  const alloc = group?.allocations.find(a => a.enrollmentId === enrollmentId);
  if (alloc) return alloc.amount;
  return roundMoney(p.amount / Math.max(1, p.enrollmentIds?.length ?? 1));
}

// ---------------------------------------------------------------- Solicitud

export interface DropInput {
  reason: string;
  detail: string;
  effectiveDate: string;
}

export function validateDropRequest(enrollment: Enrollment, input: DropInput, requests: DropRequest[], today: string): string[] {
  const e: string[] = [];
  if (enrollment.status !== 'Activa') e.push(`La matrícula ${enrollment.id} no está activa (${enrollment.status}).`);
  if (requests.some(r => r.enrollmentId === enrollment.id && r.status === 'Pendiente')) e.push('Ya hay una solicitud de caída pendiente para esta matrícula.');
  if (!DROP_REASONS.includes(input.reason)) e.push('Seleccione el motivo de la caída.');
  if (input.detail.trim().length < MIN_DETAIL) e.push('Describa el motivo (al menos unas palabras): queda como constancia.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveDate)) e.push('Indique desde cuándo dejó de asistir.');
  else {
    if (input.effectiveDate > today) e.push('La fecha no puede ser futura.');
    const start = enrollmentDateISO(enrollment);
    if (start && input.effectiveDate < start) e.push('La fecha no puede ser anterior a la matrícula.');
  }
  return e;
}

export function validateDropResolution(request: DropRequest, decision: 'Aprobada' | 'Rechazada', note: string): string[] {
  const e: string[] = [];
  if (request.status !== 'Pendiente') e.push('Esta solicitud ya fue resuelta.');
  if (decision === 'Rechazada' && note.trim().length < MIN_DETAIL) e.push('Indique por qué se rechaza la solicitud.');
  return e;
}

// ---------------------------------------------------------------- Efectos

export interface DropContext {
  enrollment: Enrollment;
  plan?: Plan;
  schedules: Schedule[];
  monthly: MonthlySchedule[];
  students: Student[];
  enrollments: Enrollment[];
  payments: Payment[];
  groups: PromotionGroup[];
}

export interface DropPreview {
  paidUSD: number;
  planTotal: number;
  /** Cuotas futuras sin pagar: se anulan. */
  annulled: { id: string; name: string; balance: number }[];
  /** Cuotas vencidas sin pagar: deuda (se conserva o se condona). */
  overdue: { id: string; name: string; balance: number }[];
  annulledUSD: number;
  overdueUSD: number;
  /** Asesorías futuras que se cancelan. */
  scheduleIds: string[];
  /** Inscripciones en actividades que se quitan. */
  activityRemovals: { monthlyId: string; activityId: string; studentId: string }[];
  otherActiveEnrollments: string[];
  studentDeactivated: boolean;
  groupMembers: number;
  deliveredItems: number;
}

const sameStudent = (e: Enrollment, other: Enrollment) => (e.studentId && other.studentId ? e.studentId === other.studentId : e.student === other.student);

export function previewDrop(ctx: DropContext, effectiveDate: string): DropPreview {
  const { enrollment, plan } = ctx;
  const own = ctx.students.find(s => s.id === enrollment.studentId) ?? ctx.students.find(s => s.name === enrollment.student);
  const studentId = own?.id ?? enrollment.studentId;
  const otherActive = ctx.enrollments.filter(o => o.id !== enrollment.id && o.status === 'Activa' && sameStudent(enrollment, o)).map(o => o.id);

  const annulled: DropPreview['annulled'] = [];
  const overdue: DropPreview['overdue'] = [];
  for (const i of plan?.installments ?? []) {
    if (!(i.balance > 0) || i.status === 'Refinanciada' || i.status === 'Anulada') continue;
    const due = installmentDueISO(i);
    const row = { id: i.id, name: i.name, balance: roundMoney(i.balance) };
    (due && due <= effectiveDate ? overdue : annulled).push(row);
  }

  // Si el alumno sigue con otra matrícula activa, solo se cancela lo propio de esta (su primera asesoría)
  const mine = (s: Schedule) => (studentId && s.studentId ? s.studentId === studentId : s.student === enrollment.student);
  const scheduleIds = ctx.schedules
    .filter(s => ['Reservado', 'Reprogramado'].includes(s.status) && s.date >= effectiveDate)
    .filter(s => (otherActive.length === 0 ? mine(s) : s.isFirst && s.enrollmentId === enrollment.id))
    .map(s => s.id);

  const activityRemovals: DropPreview['activityRemovals'] = [];
  if (otherActive.length === 0 && studentId) {
    for (const m of ctx.monthly) {
      for (const a of m.actividades) {
        if (a.fecha >= effectiveDate && a.inscritos.includes(studentId)) activityRemovals.push({ monthlyId: m.id, activityId: a.id, studentId });
      }
    }
  }

  return {
    paidUSD: enrollmentPaidUSD(enrollment.id, ctx.payments, ctx.groups, plan),
    planTotal: plan?.total ?? 0,
    annulled,
    overdue,
    annulledUSD: roundMoney(annulled.reduce((a, r) => a + r.balance, 0)),
    overdueUSD: roundMoney(overdue.reduce((a, r) => a + r.balance, 0)),
    scheduleIds,
    activityRemovals,
    otherActiveEnrollments: otherActive,
    studentDeactivated: otherActive.length === 0 && own?.status === 'Activo',
    groupMembers: enrollment.promotionGroupId ? ctx.enrollments.filter(o => o.id !== enrollment.id && o.promotionGroupId === enrollment.promotionGroupId && o.status === 'Activa').length : 0,
    deliveredItems: enrollment.verifiedItems?.length ?? 0,
  };
}

/** Plan después de la caída: cuotas futuras anuladas (y las vencidas, si se condonan); el saldo es lo que queda como deuda. */
export function applyDropToPlan(plan: Plan, preview: DropPreview, forgiveOverdue: boolean): Plan {
  const kill = new Set([...preview.annulled.map(r => r.id), ...(forgiveOverdue ? preview.overdue.map(r => r.id) : [])]);
  const installments = plan.installments.map(i => (kill.has(i.id) ? { ...i, status: 'Anulada', balance: 0, note: 'Anulada por caída de la matrícula' } : i));
  const balance = roundMoney(installments.reduce((a, i) => a + (i.balance > 0 && i.status !== 'Refinanciada' ? i.balance : 0), 0));
  return { ...plan, installments, balance, status: 'Caída', next: '-' };
}

export function summarizeDrop(preview: DropPreview, forgiveOverdue: boolean): DropEffects {
  return {
    annulledInstallments: preview.annulled.length + (forgiveOverdue ? preview.overdue.length : 0),
    annulledUSD: roundMoney(preview.annulledUSD + (forgiveOverdue ? preview.overdueUSD : 0)),
    overdueInstallments: forgiveOverdue ? 0 : preview.overdue.length,
    overdueUSD: forgiveOverdue ? 0 : preview.overdueUSD,
    overdueForgiven: forgiveOverdue && preview.overdue.length > 0,
    paidUSD: preview.paidUSD,
    cancelledSchedules: preview.scheduleIds.length,
    removedActivities: preview.activityRemovals.length,
    studentDeactivated: preview.studentDeactivated,
  };
}

/** Solicitud pendiente de una matrícula, si la hay. */
export const pendingDropOf = (enrollmentId: string, requests: DropRequest[]) => requests.find(r => r.enrollmentId === enrollmentId && r.status === 'Pendiente');
