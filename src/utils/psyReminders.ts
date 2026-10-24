/**
 * Recordatorios de Psicopedagogía (funciones puras): asesorías, actividades especiales y vigencia por vencer.
 *
 * Igual que en cobranza, el sistema NO envía mensajes: prepara el texto, abre WhatsApp con el mensaje listo y deja el
 * registro de quién y cuándo (o por qué se omitió). Cada pendiente muestra, como máximo, el recordatorio MÁS CERCANO a la
 * fecha que ya le corresponde y no se atendió; así, aunque nadie abra el sistema unos días, no se acumulan repetidos.
 *
 *  - Asesoría: los días antes que indique la política (por defecto, el día anterior). No se recuerda una primera asesoría
 *    cuya matrícula sigue sin verificar: ahí lo que corresponde es verificar o reprogramar, no pedir que asista.
 *  - Actividad: a cada alumno inscrito que aún no tiene asistencia marcada.
 *  - Vigencia: a las matrículas «por vencer» sin extensión habilitada, con el fin de su duración base.
 *  - Destinatario: el titular principal del alumno (o el propio alumno si es independiente).
 */
import type { Enrollment, Guardian, Program, PsyReminderLog, PsyReminderPolicy, Schedule, Student } from '../context/DataContext';
import { whatsappUrl } from './collections';
import { longDayLabel, to12h, type FlatActivity } from './schedule';
import { daysBetween, enrollmentValidity, programOf } from './validity';

export const DEFAULT_PSY_POLICY: PsyReminderPolicy = { sessionBefore: [1], activityBefore: [2], validityBefore: [14, 7, 1] };

type PolicyText = { sessionBefore: string; activityBefore: string; validityBefore: string };

const list = (text: string) => [...new Set(text.split(/[,;\s]+/).filter(Boolean).map(Number))];

export function validatePsyPolicy(p: PolicyText): string[] {
  const e: string[] = [];
  const check = (label: string, text: string, max: number) => {
    const n = list(text);
    if (n.length === 0) e.push(`Defina al menos un día para ${label}.`);
    else if (n.some(x => !Number.isInteger(x) || x < 0 || x > max)) e.push(`Los días de ${label} deben ser enteros entre 0 y ${max} (0 = el mismo día).`);
  };
  check('las asesorías', p.sessionBefore, 14);
  check('las actividades', p.activityBefore, 30);
  check('la vigencia por vencer', p.validityBefore, 60);
  return e;
}

export const parsePsyPolicy = (p: PolicyText): PsyReminderPolicy => ({
  sessionBefore: list(p.sessionBefore).sort((a, b) => b - a),
  activityBefore: list(p.activityBefore).sort((a, b) => b - a),
  validityBefore: list(p.validityBefore).sort((a, b) => b - a),
});

export const policyText = (p: PsyReminderPolicy): PolicyText => ({
  sessionBefore: p.sessionBefore.join(', '), activityBefore: p.activityBefore.join(', '), validityBefore: p.validityBefore.join(', '),
});

export type PsyReminderKind = PsyReminderLog['kind'];

export interface PsyReminder {
  key: string;
  kind: PsyReminderKind;
  /** Asesoría, actividad o matrícula a la que se refiere. */
  refId: string;
  studentId: string;
  studentName: string;
  recipient: string;
  phone: string;
  email: string;
  /** Días que faltan para la fecha (0 = hoy). */
  daysLeft: number;
  /** Fecha del hecho (asesoría, actividad o fin de la vigencia). */
  dateISO: string;
  offset: number;
  label: string;
  message: string;
  whatsappUrl?: string;
  branchName: string;
}

export const KIND_LABEL: Record<PsyReminderKind, string> = { asesoria: 'Asesoría', actividad: 'Actividad', vigencia: 'Vigencia por vencer' };

export const psyReminderKey = (kind: PsyReminderKind, refId: string, offset: number, studentId = '') =>
  `${kind}:${refId}${kind === 'actividad' ? `:${studentId}` : ''}:${offset}`;

export interface PsyReminderContext {
  schedules: Schedule[];
  activities: FlatActivity[];
  enrollments: Enrollment[];
  students: Student[];
  guardians: Guardian[];
  programs: Program[];
  branches: { id: string; name: string }[];
  /** Primeras asesorías que esperan la verificación de materiales (no se recuerdan). */
  blockedScheduleIds: Set<string>;
}

const when = (days: number, date: string) => (days === 0 ? 'hoy' : days === 1 ? 'mañana' : `el ${longDayLabel(date)}`);

export function recipientOf(student: Student | undefined, guardians: Guardian[]): { name: string; phone: string; email: string } {
  const guardian = student?.guardianIds?.map(id => guardians.find(g => g.id === id)).find(Boolean) ?? guardians.find(g => g.name === student?.titular);
  return { name: guardian?.name ?? student?.name ?? '', phone: guardian?.phone ?? student?.phone ?? '', email: guardian?.email ?? student?.email ?? '' };
}

/** Etapa que corresponde hoy: la de menos días entre las que ya llegaron (null si todavía no llega ninguna). */
export const currentOffset = (offsets: number[], daysLeft: number): number | null => {
  const reached = offsets.filter(o => daysLeft <= o);
  return reached.length === 0 ? null : Math.min(...reached);
};

export function buildPsyReminders(ctx: PsyReminderContext, policy: PsyReminderPolicy, logs: Pick<PsyReminderLog, 'key'>[], today: string): PsyReminder[] {
  const done = new Set(logs.map(l => l.key));
  const out: PsyReminder[] = [];
  const studentOf = (id?: string, name?: string) => ctx.students.find(s => s.id === id) ?? ctx.students.find(s => s.name === name);
  const branchName = (id?: string) => ctx.branches.find(b => b.id === id)?.name ?? '';

  const push = (r: Omit<PsyReminder, 'whatsappUrl'>) => { if (!done.has(r.key)) out.push({ ...r, whatsappUrl: whatsappUrl(r.phone, r.message) }); };

  // ---- Asesorías
  for (const s of ctx.schedules) {
    if (!['Reservado', 'Reprogramado'].includes(s.status) || s.date < today || ctx.blockedScheduleIds.has(s.id)) continue;
    const daysLeft = daysBetween(today, s.date);
    const offset = currentOffset(policy.sessionBefore, daysLeft);
    if (offset === null) continue;
    const student = studentOf(s.studentId, s.student);
    const to = recipientOf(student, ctx.guardians);
    const lead = daysLeft === 0 ? 'Le esperamos.' : 'Si no puede asistir, avísenos con 24 horas de anticipación para reprogramarla.';
    push({
      key: psyReminderKey('asesoria', s.id, offset), kind: 'asesoria', refId: s.id, studentId: student?.id ?? s.studentId ?? '', studentName: s.student,
      recipient: to.name, phone: to.phone, email: to.email, daysLeft, dateISO: s.date, offset, label: `${offset === 0 ? 'El mismo día' : `${offset} día${offset === 1 ? '' : 's'} antes`}`,
      branchName: branchName(s.branchId),
      message: `Hola ${to.name || 'estimado titular'}, le recordamos la ${s.isFirst ? 'primera ' : ''}asesoría de ${s.student} (${s.program}${s.level ? ` · ${s.level}` : ''}) ${when(daysLeft, s.date)} a las ${to12h(s.time)} en ENSIL ${branchName(s.branchId)}${s.responsible ? `, con ${s.responsible}` : ''}. ${lead}`,
    });
  }

  // ---- Actividades especiales
  for (const a of ctx.activities) {
    if (a.date < today) continue;
    const daysLeft = daysBetween(today, a.date);
    const offset = currentOffset(policy.activityBefore, daysLeft);
    if (offset === null) continue;
    for (const studentId of a.enrolled) {
      if (a.attendance[studentId]) continue;
      const student = ctx.students.find(s => s.id === studentId);
      if (!student) continue;
      const to = recipientOf(student, ctx.guardians);
      push({
        key: psyReminderKey('actividad', a.id, offset, studentId), kind: 'actividad', refId: a.id, studentId, studentName: student.name,
        recipient: to.name, phone: to.phone, email: to.email, daysLeft, dateISO: a.date, offset, label: `${offset === 0 ? 'El mismo día' : `${offset} día${offset === 1 ? '' : 's'} antes`}`,
        branchName: a.sede,
        message: `Hola ${to.name || 'estimado titular'}, le recordamos que ${student.name} está inscrito en «${a.name}» ${when(daysLeft, a.date)}, de ${to12h(a.start)} a ${to12h(a.end)}, en ENSIL ${a.sede}.${a.responsible ? ` Estará a cargo de ${a.responsible}.` : ''}`,
      });
    }
  }

  // ---- Vigencia por vencer
  for (const e of ctx.enrollments) {
    if (e.status !== 'Activa') continue;
    const program = programOf(e, ctx.programs);
    const v = enrollmentValidity(e, program, ctx.schedules, today);
    if (v.state !== 'por-vencer' || v.extensionEnabled || v.daysToBaseEnd === undefined || !v.baseEnd) continue;
    const offset = currentOffset(policy.validityBefore, v.daysToBaseEnd);
    if (offset === null) continue;
    const student = studentOf(e.studentId, e.student);
    const to = recipientOf(student, ctx.guardians);
    const extension = v.extensionMonths > 0
      ? ` Si necesita más tiempo, consulte en la sede por la extensión de ${v.extensionMonths} ${v.extensionMonths === 1 ? 'mes' : 'meses'} que incluye su programa.`
      : ' Consulte en la sede por la renovación para continuar sin interrupciones.';
    push({
      key: psyReminderKey('vigencia', e.id, offset), kind: 'vigencia', refId: e.id, studentId: student?.id ?? e.studentId ?? '', studentName: e.student,
      recipient: to.name, phone: to.phone, email: to.email, daysLeft: v.daysToBaseEnd, dateISO: v.baseEnd, offset, label: `${offset} día${offset === 1 ? '' : 's'} antes del fin`,
      branchName: e.sede ?? branchName(e.branchId),
      message: `Hola ${to.name || 'estimado titular'}, la duración base de la matrícula de ${e.student} (${e.program}${e.level ? ` · ${e.level}` : ''}) termina el ${longDayLabel(v.baseEnd)}${v.daysToBaseEnd <= 0 ? ' (hoy)' : ` (en ${v.daysToBaseEnd} día${v.daysToBaseEnd === 1 ? '' : 's'})`}.${extension}`,
    });
  }

  return out.sort((a, b) => a.daysLeft - b.daysLeft || a.studentName.localeCompare(b.studentName));
}

export function validatePsyReminderLog(r: Pick<PsyReminder, 'key'>, channel: string, result: string, note: string, logs: Pick<PsyReminderLog, 'key'>[]): string[] {
  const e: string[] = [];
  if (logs.some(l => l.key === r.key)) e.push('Este recordatorio ya fue registrado.');
  if (!['WhatsApp', 'Correo', 'Llamada', 'Otro'].includes(channel)) e.push('Seleccione el canal.');
  if (!['Enviado', 'Omitido'].includes(result)) e.push('Indique si se envió o se omitió.');
  if (result === 'Omitido' && note.trim().length < 5) e.push('Explique por qué se omite el recordatorio.');
  return e;
}
