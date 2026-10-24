/**
 * Cobranza y cartera (funciones puras): mora, recordatorios y reportes.
 *
 * Política de cobranza (editable en Configuración → Política de cobranza):
 *  - Días de gracia: una cuota vencida no genera mora hasta pasados estos días.
 *  - Tasa de mora mensual: 0 % por defecto (sin interés); si se define, la mora se calcula sobre el saldo vencido,
 *    proporcional a los días fuera de gracia (tasa × días / 30). Se COBRA generando una cuota «Mora» (ver `chargeMoraOn`),
 *    solo por lo acumulado que aún no se cobró; la mora no genera más mora.
 *  - Recordatorios: antes del vencimiento, el día del vencimiento y después (escalonados). Cada cuota abierta muestra,
 *    como máximo, el recordatorio MÁS AVANZADO que ya le corresponde y que todavía no se registró; así, aunque nadie
 *    abra el sistema unos días, no se acumulan mensajes repetidos. Registrar el envío (o la omisión) lo da por atendido.
 *  - El sistema NO envía mensajes: prepara el texto, abre WhatsApp con el mensaje listo y deja el registro de quién y cuándo.
 *
 * Cartera: se construye a partir de las cuotas abiertas de los planes (con matrícula activa, o caída con deuda conservada).
 */
import type { Branch, Enrollment, Guardian, Payment, Plan, Student } from '../context/DataContext';
import { installmentDueISO } from './enrollmentDrop';
import { daysOverdue, isOpen } from './planState';
import { roundMoney, formatDisplayDate } from './tariffs';
import { addDaysISO, localDateOf } from './schedule';

export interface CollectionPolicy {
  graceDays: number;
  /** Tasa de mora mensual (0.02 = 2 %). 0 = sin mora. */
  moraMonthlyRate: number;
  /** Días antes del vencimiento en que se recuerda (p. ej. [3, 0] = 3 días antes y el mismo día). */
  remindBefore: number[];
  /** Días después del vencimiento en que se vuelve a recordar. */
  remindAfter: number[];
}

export const DEFAULT_POLICY: CollectionPolicy = { graceDays: 3, moraMonthlyRate: 0, remindBefore: [3, 0], remindAfter: [1, 7, 15, 30] };

export function validatePolicy(p: { graceDays: string; moraMonthlyRatePct: string; remindBefore: string; remindAfter: string }): string[] {
  const e: string[] = [];
  const grace = Number(p.graceDays);
  if (p.graceDays.trim() === '' || !Number.isInteger(grace) || grace < 0 || grace > 60) e.push('Los días de gracia deben ser un número entero entre 0 y 60.');
  const rate = Number(p.moraMonthlyRatePct);
  if (p.moraMonthlyRatePct.trim() === '' || !Number.isFinite(rate) || rate < 0 || rate > 10) e.push('La tasa de mora mensual debe estar entre 0 % y 10 %.');
  const list = (text: string) => text.split(/[,;\s]+/).filter(Boolean).map(Number);
  const before = list(p.remindBefore);
  const after = list(p.remindAfter);
  if (before.some(n => !Number.isInteger(n) || n < 0 || n > 30)) e.push('Los días previos deben ser enteros entre 0 y 30 (0 = el día del vencimiento).');
  if (after.some(n => !Number.isInteger(n) || n < 1 || n > 180)) e.push('Los días posteriores deben ser enteros entre 1 y 180.');
  if (before.length + after.length === 0) e.push('Defina al menos un día de recordatorio.');
  return e;
}

export function parsePolicy(p: { graceDays: string; moraMonthlyRatePct: string; remindBefore: string; remindAfter: string }): CollectionPolicy {
  const list = (text: string) => [...new Set(text.split(/[,;\s]+/).filter(Boolean).map(Number))];
  return {
    graceDays: Number(p.graceDays),
    moraMonthlyRate: Math.round(Number(p.moraMonthlyRatePct) * 100) / 10000,
    remindBefore: list(p.remindBefore).sort((a, b) => b - a),
    remindAfter: list(p.remindAfter).sort((a, b) => a - b),
  };
}

// ================================================================ Mora

export interface MoraInfo {
  daysOverdue: number;
  chargeableDays: number;
  /** Mora acumulada hasta hoy (según la tasa). */
  accrued: number;
  /** Lo ya cobrado como cuota «Mora». */
  charged: number;
  /** Lo que falta cobrar. */
  pending: number;
}

export function moraOf(inst: { balance: number; status: string; amount: number; dueDate?: string; dueDateISO?: string; moraCharged?: number; isMora?: boolean; payments?: { amount: number }[] }, policy: CollectionPolicy, today: string): MoraInfo {
  const days = inst.isMora ? 0 : daysOverdue(inst, today);
  const chargeable = Math.max(0, days - policy.graceDays);
  const accrued = policy.moraMonthlyRate > 0 ? roundMoney(inst.balance * policy.moraMonthlyRate * chargeable / 30) : 0;
  const charged = roundMoney(inst.moraCharged ?? 0);
  return { daysOverdue: days, chargeableDays: chargeable, accrued, charged, pending: Math.max(0, roundMoney(accrued - charged)) };
}

export function validateMoraCharge(plan: Plan, installmentId: string, policy: CollectionPolicy, today: string): string[] {
  const inst = plan.installments.find(i => i.id === installmentId);
  if (!inst) return ['No se encontró la cuota.'];
  if (inst.isMora) return ['La mora no genera más mora.'];
  if (!isOpen(inst)) return ['La cuota no tiene saldo por cobrar.'];
  if (policy.moraMonthlyRate <= 0) return ['La política de cobranza no cobra mora (tasa 0 %). Defínala en Configuración → Política de cobranza.'];
  const mora = moraOf(inst, policy, today);
  if (mora.daysOverdue === 0) return ['La cuota aún no venció.'];
  if (mora.chargeableDays === 0) return [`La cuota está dentro de los ${policy.graceDays} días de gracia.`];
  if (mora.pending < 0.01) return ['No hay mora pendiente de cobrar en esta cuota.'];
  return [];
}

/** Agrega al plan la cuota «Mora» por lo acumulado y marca lo cobrado en la cuota origen. */
export function chargeMoraOn(plan: Plan, installmentId: string, policy: CollectionPolicy, today: string): Plan {
  const inst = plan.installments.find(i => i.id === installmentId)!;
  const mora = moraOf(inst, policy, today);
  const id = `M${plan.installments.filter(i => i.isMora).length + 1}`;
  const installments = plan.installments.map(i => (i.id === installmentId ? { ...i, moraCharged: roundMoney((i.moraCharged ?? 0) + mora.pending) } : i));
  installments.push({
    id, name: `Mora · ${inst.name}`, amount: mora.pending, balance: mora.pending, dueDate: formatDisplayDate(today), dueDateISO: today, status: 'Pendiente',
    payments: [], isMora: true, moraOf: installmentId, note: `Mora de ${mora.chargeableDays} día(s) sobre ${inst.balance.toFixed(2)} a ${(policy.moraMonthlyRate * 100).toFixed(2)} % mensual`,
  });
  const open = installments.filter(isOpen);
  return { ...plan, installments, balance: roundMoney(open.reduce((a, i) => a + i.balance, 0)) };
}

// ================================================================ Recordatorios

export interface ReminderStage {
  kind: 'previo' | 'vencimiento' | 'mora';
  /** Días respecto al vencimiento (−3 = tres días antes; 0 = el día; 7 = siete días después). */
  offset: number;
  label: string;
}

export const stagesOf = (policy: CollectionPolicy): ReminderStage[] => [
  ...policy.remindBefore.filter(n => n > 0).map(n => ({ kind: 'previo' as const, offset: -n, label: `${n} día${n === 1 ? '' : 's'} antes` })),
  ...(policy.remindBefore.includes(0) ? [{ kind: 'vencimiento' as const, offset: 0, label: 'El día del vencimiento' }] : []),
  ...policy.remindAfter.map(n => ({ kind: 'mora' as const, offset: n, label: `${n} día${n === 1 ? '' : 's'} después` })),
].sort((a, b) => a.offset - b.offset);

export interface ReminderLog {
  id: string;
  key: string;
  planId: string;
  installmentId: string;
  stageOffset: number;
  at: string;
  by: string;
  channel: 'WhatsApp' | 'Correo' | 'Llamada' | 'Otro';
  result: 'Enviado' | 'Omitido';
  note?: string;
}

export const reminderKey = (planId: string, installmentId: string, offset: number) => `${planId}:${installmentId}:${offset}`;

export interface Reminder {
  key: string;
  planId: string;
  enrollmentId: string;
  installmentId: string;
  installmentName: string;
  studentName: string;
  recipient: string;
  phone: string;
  email: string;
  balance: number;
  dueISO: string;
  /** Días desde el vencimiento (negativo = falta). */
  daysFromDue: number;
  stage: ReminderStage;
  message: string;
  whatsappUrl?: string;
  branchName: string;
}

export interface ReminderContext {
  plans: Plan[];
  enrollments: Enrollment[];
  students: Student[];
  guardians: Guardian[];
  branches: Branch[];
}

const usd = (n: number) => `USD ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function reminderMessage(stage: ReminderStage, v: { recipient: string; student: string; installment: string; balance: number; due: string; days: number; branch: string }): string {
  const head = `Estimado(a) ${v.recipient}:`;
  const tail = `Si ya realizó el pago, por favor ignore este mensaje y envíenos su comprobante. Atentamente, ENSIL ${v.branch}.`;
  if (stage.kind === 'previo') return `${head} le recordamos que la ${v.installment.toLowerCase()} de ${v.student}, por ${usd(v.balance)}, vence el ${v.due} (en ${-v.days} día${v.days === -1 ? '' : 's'}). ${tail}`;
  if (stage.kind === 'vencimiento') return `${head} le recordamos que hoy vence la ${v.installment.toLowerCase()} de ${v.student}, por ${usd(v.balance)}. ${tail}`;
  return `${head} la ${v.installment.toLowerCase()} de ${v.student}, por ${usd(v.balance)}, venció el ${v.due} (hace ${v.days} día${v.days === 1 ? '' : 's'}). Le pedimos regularizar su pago a la brevedad o comunicarse con nosotros para coordinar. ${tail}`;
}

/** Titular que atiende la cobranza: el vinculado a la matrícula o al alumno; en registros antiguos, el del nombre guardado. */
export function collectionGuardian(e: Enrollment, student: Student | undefined, plan: Plan, guardians: Guardian[]): Guardian | undefined {
  const ids = e.guardianIds?.length ? e.guardianIds : student?.guardianIds ?? [];
  return guardians.find(g => g.id === ids[0]) ?? guardians.find(g => g.name === (student?.titular ?? plan.titular));
}

const phoneDigits = (p: string) => p.replace(/\D/g, '');
export const whatsappUrl = (phone: string, text: string): string | undefined => {
  const d = phoneDigits(phone);
  if (d.length < 9) return undefined;
  return `https://wa.me/${d.length === 9 ? `51${d}` : d}?text=${encodeURIComponent(text)}`;
};

/** Recordatorios pendientes de atender hoy (uno por cuota, el más avanzado que corresponde y no está registrado). */
export function buildReminders(ctx: ReminderContext, policy: CollectionPolicy, logs: Pick<ReminderLog, 'key'>[], today: string): Reminder[] {
  const stages = stagesOf(policy);
  const done = new Set(logs.map(l => l.key));
  const out: Reminder[] = [];
  for (const plan of ctx.plans) {
    const enrollment = ctx.enrollments.find(e => e.id === plan.mat);
    if (!enrollment || plan.status === 'Completado') continue;
    if (enrollment.status !== 'Activa' && plan.status !== 'Caída') continue;
    const student = ctx.students.find(s => s.id === enrollment.studentId) ?? ctx.students.find(s => s.name === enrollment.student);
    const guardian = collectionGuardian(enrollment, student, plan, ctx.guardians);
    const recipient = guardian?.name ?? student?.name ?? plan.titular;
    const phone = guardian?.phone ?? student?.phone ?? '';
    const email = guardian?.email ?? student?.email ?? '';
    const branchName = ctx.branches.find(b => b.id === enrollment.branchId)?.name ?? enrollment.sede ?? '';
    for (const inst of plan.installments) {
      if (!isOpen(inst)) continue;
      // Una cuota de un plan caído solo se recuerda si ya venció (es deuda); las demás ya fueron anuladas
      const due = installmentDueISO(inst);
      if (!due) continue;
      const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${due}T00:00:00Z`)) / 86400000);
      const reached = stages.filter(s => s.offset <= days);
      const stage = reached[reached.length - 1];
      if (!stage || done.has(reminderKey(plan.id, inst.id, stage.offset))) continue;
      const message = reminderMessage(stage, { recipient, student: enrollment.student, installment: inst.name, balance: roundMoney(inst.balance), due: formatDisplayDate(due), days, branch: branchName });
      out.push({
        key: reminderKey(plan.id, inst.id, stage.offset), planId: plan.id, enrollmentId: enrollment.id, installmentId: inst.id, installmentName: inst.name, studentName: enrollment.student,
        recipient, phone, email, balance: roundMoney(inst.balance), dueISO: due, daysFromDue: days, stage, message, whatsappUrl: whatsappUrl(phone, message), branchName,
      });
    }
  }
  return out.sort((a, b) => b.daysFromDue - a.daysFromDue || a.studentName.localeCompare(b.studentName));
}

export function validateReminderLog(r: Pick<Reminder, 'key'>, channel: string, result: string, note: string, logs: Pick<ReminderLog, 'key'>[]): string[] {
  const e: string[] = [];
  if (logs.some(l => l.key === r.key)) e.push('Este recordatorio ya fue registrado.');
  if (!['WhatsApp', 'Correo', 'Llamada', 'Otro'].includes(channel)) e.push('Seleccione el canal.');
  if (!['Enviado', 'Omitido'].includes(result)) e.push('Indique si se envió o se omitió.');
  if (result === 'Omitido' && note.trim().length < 5) e.push('Explique por qué se omite el recordatorio.');
  return e;
}

// ================================================================ Cartera

export const BUCKETS = ['Por vencer', '1 a 30 días', '31 a 60 días', '61 a 90 días', 'Más de 90 días'] as const;
export type Bucket = (typeof BUCKETS)[number];

export const bucketOf = (days: number): Bucket => (days <= 0 ? 'Por vencer' : days <= 30 ? '1 a 30 días' : days <= 60 ? '31 a 60 días' : days <= 90 ? '61 a 90 días' : 'Más de 90 días');

export interface PortfolioRow {
  planId: string;
  enrollmentId: string;
  student: string;
  titular: string;
  phone: string;
  branchId: string;
  branchName: string;
  programId: string;
  program: string;
  installmentId: string;
  installment: string;
  dueISO: string;
  balance: number;
  days: number;
  bucket: Bucket;
  planStatus: string;
  isMora: boolean;
}

export function portfolioRows(ctx: ReminderContext, today: string): PortfolioRow[] {
  const rows: PortfolioRow[] = [];
  for (const plan of ctx.plans) {
    const e = ctx.enrollments.find(x => x.id === plan.mat);
    if (!e) continue;
    if (e.status !== 'Activa' && plan.status !== 'Caída') continue;
    const student = ctx.students.find(s => s.id === e.studentId) ?? ctx.students.find(s => s.name === e.student);
    const guardian = collectionGuardian(e, student, plan, ctx.guardians);
    for (const i of plan.installments) {
      if (!isOpen(i)) continue;
      const due = installmentDueISO(i);
      const days = due ? Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${due}T00:00:00Z`)) / 86400000) : 0;
      // Plan caído: solo cuenta la deuda ya vencida
      if (plan.status === 'Caída' && days <= 0) continue;
      rows.push({
        planId: plan.id, enrollmentId: e.id, student: e.student, titular: guardian?.name ?? plan.titular, phone: guardian?.phone ?? student?.phone ?? '',
        branchId: e.branchId ?? '', branchName: ctx.branches.find(b => b.id === e.branchId)?.name ?? e.sede ?? '—', programId: e.programId ?? e.program, program: e.level && e.level !== 'Sin nivel' ? `${e.program} - ${e.level}` : e.program,
        installmentId: i.id, installment: i.name, dueISO: due, balance: roundMoney(i.balance), days, bucket: bucketOf(days), planStatus: plan.status, isMora: !!i.isMora,
      });
    }
  }
  return rows.sort((a, b) => b.days - a.days || b.balance - a.balance);
}

export interface PortfolioKpis {
  total: number;
  current: number;
  overdue: number;
  /** Cartera vencida / cartera total. */
  delinquencyRate: number;
  debtors: number;
  installments: number;
  overdueInstallments: number;
  collectedMonth: number;
  /** Lo que vence en los próximos 7 / 30 / 60 / 90 días (sin lo ya vencido). */
  dueIn: { d7: number; d30: number; d60: number; d90: number };
  avgDaysOverdue: number;
}

const isVoidPayment = (p: Payment) => /anulad|revers/i.test(p.status);
const paymentISO = (p: Payment) => (/^\d{4}-\d{2}-\d{2}/.test(p.date) ? p.date.slice(0, 10) : '');

export function portfolioKpis(rows: PortfolioRow[], payments: Payment[], today: string): PortfolioKpis {
  const sum = (list: PortfolioRow[]) => roundMoney(list.reduce((a, r) => a + r.balance, 0));
  const overdue = rows.filter(r => r.days > 0);
  const upcoming = (n: number) => sum(rows.filter(r => r.days <= 0 && r.dueISO <= addDaysISO(today, n)));
  const month = today.slice(0, 7);
  const total = sum(rows);
  return {
    total, current: sum(rows.filter(r => r.days <= 0)), overdue: sum(overdue),
    delinquencyRate: total > 0 ? roundMoney((sum(overdue) / total) * 100) : 0,
    debtors: new Set(overdue.map(r => r.enrollmentId)).size, installments: rows.length, overdueInstallments: overdue.length,
    collectedMonth: roundMoney(payments.filter(p => !isVoidPayment(p) && (paymentISO(p) || localDateOf(p.date)).slice(0, 7) === month).reduce((a, p) => a + p.amount, 0)),
    dueIn: { d7: upcoming(7), d30: upcoming(30), d60: upcoming(60), d90: upcoming(90) },
    avgDaysOverdue: overdue.length > 0 ? Math.round(overdue.reduce((a, r) => a + r.days, 0) / overdue.length) : 0,
  };
}

export function agingSummary(rows: PortfolioRow[]): { bucket: Bucket; count: number; amount: number; share: number }[] {
  const total = rows.reduce((a, r) => a + r.balance, 0);
  return BUCKETS.map(bucket => {
    const list = rows.filter(r => r.bucket === bucket);
    const amount = roundMoney(list.reduce((a, r) => a + r.balance, 0));
    return { bucket, count: list.length, amount, share: total > 0 ? Math.round((amount / total) * 1000) / 10 : 0 };
  });
}

export interface GroupFigure { name: string; total: number; overdue: number; rate: number; installments: number }

export function groupBy(rows: PortfolioRow[], key: (r: PortfolioRow) => string): GroupFigure[] {
  const map = new Map<string, PortfolioRow[]>();
  rows.forEach(r => map.set(key(r), [...(map.get(key(r)) ?? []), r]));
  return [...map.entries()].map(([name, list]) => {
    const total = roundMoney(list.reduce((a, r) => a + r.balance, 0));
    const overdue = roundMoney(list.filter(r => r.days > 0).reduce((a, r) => a + r.balance, 0));
    return { name, total, overdue, rate: total > 0 ? Math.round((overdue / total) * 1000) / 10 : 0, installments: list.length };
  }).sort((a, b) => b.overdue - a.overdue || b.total - a.total);
}

export interface DebtorFigure { enrollmentId: string; student: string; titular: string; phone: string; branchName: string; overdue: number; oldestDays: number; installments: number }

export function topDebtors(rows: PortfolioRow[], limit = 10): DebtorFigure[] {
  const map = new Map<string, PortfolioRow[]>();
  rows.filter(r => r.days > 0).forEach(r => map.set(r.enrollmentId, [...(map.get(r.enrollmentId) ?? []), r]));
  return [...map.values()].map(list => ({
    enrollmentId: list[0].enrollmentId, student: list[0].student, titular: list[0].titular, phone: list[0].phone, branchName: list[0].branchName,
    overdue: roundMoney(list.reduce((a, r) => a + r.balance, 0)), oldestDays: Math.max(...list.map(r => r.days)), installments: list.length,
  })).sort((a, b) => b.overdue - a.overdue).slice(0, limit);
}

/** Lo que vence semana a semana (las próximas `weeks`). */
export function dueCalendar(rows: PortfolioRow[], today: string, weeks = 8): { from: string; to: string; amount: number; count: number }[] {
  return Array.from({ length: weeks }, (_, w) => {
    const from = addDaysISO(today, w * 7 + (w === 0 ? 0 : 1));
    const to = addDaysISO(today, w * 7 + 7);
    const list = rows.filter(r => r.days <= 0 && r.dueISO >= from && r.dueISO <= to);
    return { from, to, amount: roundMoney(list.reduce((a, r) => a + r.balance, 0)), count: list.length };
  });
}
