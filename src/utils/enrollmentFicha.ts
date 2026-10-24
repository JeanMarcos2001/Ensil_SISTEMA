/**
 * Ficha de una matrícula (funciones puras): reúne en un solo lugar todo lo que el sistema sabe de ella, venga de donde venga
 * (matrícula, alumno, titulares, programa, plan, pagos, grupo promocional, asesorías, vigencia, verificación, caída y correcciones).
 */
import type {
  DropRequest,
  Enrollment,
  EnrollmentChange,
  Guardian,
  Payment,
  Plan,
  Program,
  PromotionGroup,
  Schedule,
  Student,
  Tracking,
} from '../context/DataContext';
import { enrollmentDateISO, enrollmentPaidUSD, paymentShareUSD } from './enrollmentDrop';
import { localDateOf } from './schedule';
import { parseDisplayDate, roundMoney } from './tariffs';
import { enrollmentValidity, programOf, type Validity } from './validity';

export interface FichaContext {
  enrollments: Enrollment[];
  students: Student[];
  guardians: Guardian[];
  programs: Program[];
  plans: Plan[];
  payments: Payment[];
  groups: PromotionGroup[];
  schedules: Schedule[];
  trackings: Tracking[];
  dropRequests: DropRequest[];
  changes: EnrollmentChange[];
  today: string;
}

export interface FichaPayment {
  payment: Payment;
  shareUSD: number;
  voided: boolean;
}

export interface FichaEvent {
  /** Fecha (YYYY-MM-DD) para ordenar. */
  date: string;
  title: string;
  detail?: string;
  tone: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
}

export interface Ficha {
  enrollment: Enrollment;
  student?: Student;
  guardians: Guardian[];
  program?: Program;
  plan?: Plan;
  group?: { group: PromotionGroup; members: Enrollment[] };
  payments: FichaPayment[];
  /** Cobrado, en USD (sin pagos anulados). */
  paidUSD: number;
  /** Total de la matrícula (precio asignado o total del plan) en USD. */
  totalUSD: number;
  balanceUSD: number;
  firstSession?: Schedule;
  sessions: { attended: number; missed: number; upcoming: Schedule[]; recorded: number };
  validity: Validity;
  /** Última solicitud de caída. */
  drop?: DropRequest;
  pendingDrop?: DropRequest;
  changes: EnrollmentChange[];
  events: FichaEvent[];
}

const isoOf = (v: string | undefined) => (v ? (/^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : parseDisplayDate(v) ?? '') : '');

export function buildFicha(ctx: FichaContext, enrollmentId: string): Ficha | undefined {
  const enrollment = ctx.enrollments.find(e => e.id === enrollmentId);
  if (!enrollment) return undefined;
  const student = ctx.students.find(s => s.id === enrollment.studentId) ?? ctx.students.find(s => s.name === enrollment.student);
  const guardians = (student?.guardianIds ?? enrollment.guardianIds ?? []).map(id => ctx.guardians.find(g => g.id === id)).filter((g): g is Guardian => !!g);
  const plan = ctx.plans.find(p => p.mat === enrollment.id);
  const program = programOf(enrollment, ctx.programs);

  const payments: FichaPayment[] = ctx.payments
    .filter(p => p.enrollmentIds?.includes(enrollment.id))
    .map(p => ({ payment: p, shareUSD: paymentShareUSD(p, enrollment.id, ctx.groups), voided: /anulad|revers/i.test(p.status) }));
  const paidUSD = enrollmentPaidUSD(enrollment.id, ctx.payments, ctx.groups, plan);
  const totalUSD = plan?.total ?? enrollment.assignedPrice ?? 0;
  const balanceUSD = plan ? plan.balance : roundMoney(Math.max(0, totalUSD - paidUSD));

  const group = enrollment.promotionGroupId ? ctx.groups.find(g => g.id === enrollment.promotionGroupId) : undefined;
  const members = group ? ctx.enrollments.filter(e => e.promotionGroupId === group.id) : [];

  const own = ctx.schedules.filter(s => (student?.id && s.studentId ? s.studentId === student.id : s.student === enrollment.student));
  const firstSession = own.filter(s => s.isFirst && s.enrollmentId === enrollment.id && s.status !== 'Cancelado').sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0];
  const sessions = {
    attended: own.filter(s => s.status === 'Asistió').length,
    missed: own.filter(s => s.status === 'Faltó').length,
    upcoming: own.filter(s => ['Reservado', 'Reprogramado'].includes(s.status) && s.date >= ctx.today).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)),
    recorded: ctx.trackings.filter(t => t.studentId === student?.id && t.scheduleId).length,
  };

  const validity = enrollmentValidity(enrollment, program, ctx.schedules, ctx.today);
  const requests = ctx.dropRequests.filter(r => r.enrollmentId === enrollment.id).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  const changes = ctx.changes.filter(c => c.enrollmentId === enrollment.id).sort((a, b) => b.at.localeCompare(a.at));

  // ---- Línea de tiempo (derivada de los datos; no hay bitácora)
  const events: FichaEvent[] = [];
  const created = enrollment.createdAt ? localDateOf(enrollment.createdAt) : enrollmentDateISO(enrollment);
  if (created) events.push({ date: created, title: 'Matrícula registrada', detail: enrollment.createdBy ? `Por ${enrollment.createdBy}` : undefined, tone: 'info' });
  for (const { payment: p, shareUSD, voided } of payments) {
    const d = isoOf(p.date);
    if (d) events.push({ date: d, title: `Pago ${p.id}${p.concept ? ` · ${p.concept}` : ''}`, detail: `USD ${shareUSD.toFixed(2)} · ${p.method}${p.receipt && p.receipt !== 'S/N' ? ` · ${p.receipt}` : ''}`, tone: voided ? 'neutral' : 'success' });
    if (p.reversal) events.push({ date: localDateOf(p.reversal.at), title: `Pago ${p.id} reversado`, detail: `${p.reversal.reason} · por ${p.reversal.by}${p.reversal.refunded ? ' · se devolvió el dinero' : ''}`, tone: 'danger' });
  }
  if (firstSession) events.push({ date: firstSession.date, title: 'Primera asesoría', detail: `${firstSession.status} · ${firstSession.responsible}`, tone: 'info' });
  if (enrollment.verificationDate) events.push({ date: enrollment.verificationDate.slice(0, 10), title: `Verificación: ${enrollment.verificationStatus ?? 'Pendiente'}`, detail: enrollment.verifier ? `Verificador: ${enrollment.verifier}` : undefined, tone: 'success' });
  if (enrollment.extensionEnabledAt) events.push({ date: localDateOf(enrollment.extensionEnabledAt), title: 'Extensión habilitada', detail: enrollment.extensionEnabledBy ? `Por ${enrollment.extensionEnabledBy}` : undefined, tone: 'warning' });
  for (const r of requests) {
    events.push({ date: localDateOf(r.requestedAt), title: 'Caída solicitada', detail: `${r.reason} · por ${r.requestedBy}`, tone: 'warning' });
    if (r.resolvedAt) events.push({ date: localDateOf(r.resolvedAt), title: r.status === 'Aprobada' ? 'Caída aprobada' : 'Caída rechazada', detail: `${r.resolvedBy ?? ''}${r.resolutionNote ? ` · ${r.resolutionNote}` : ''}`.replace(/^ · /, ''), tone: r.status === 'Aprobada' ? 'danger' : 'neutral' });
  }
  for (const c of changes) events.push({ date: localDateOf(c.at), title: ['reactivation', 'program', 'branch'].includes(c.field) ? c.label : `Corrección: ${c.label}`, detail: `«${c.from}» → «${c.to}» · ${c.reason} · por ${c.by}`, tone: 'neutral' });
  events.sort((a, b) => b.date.localeCompare(a.date));

  return {
    enrollment, student, guardians, program, plan, group: group ? { group, members } : undefined, payments, paidUSD, totalUSD, balanceUSD,
    firstSession, sessions, validity, drop: requests[0], pendingDrop: requests.find(r => r.status === 'Pendiente'), changes, events,
  };
}
