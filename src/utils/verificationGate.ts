/**
 * La verificación (entrega de materiales) va ANTES de la primera asesoría (funciones puras).
 *
 *  - Para dar la primera asesoría el alumno necesita sus materiales: la matrícula debe estar verificada (completa o
 *    incompleta: lo entregado alcanza para empezar y el resto se completa en otra verificación).
 *  - Sin verificar no se puede marcar «Asistió», «Faltó» ni registrar la sesión de esa asesoría. Si llega su hora sin la
 *    verificación, no es falta del alumno: la asesoría debe reprogramarse (aunque falten menos de 24 horas, porque el
 *    cambio es de la institución).
 *  - La verificación a su vez exige el primer pago; por eso el bloqueo indica cuál de los dos pasos falta.
 *  - No aplica si la matrícula no está activa, si su primera asesoría ya se dio o se canceló, o si no existe una receta
 *    de materiales para ella (no hay nada que entregar).
 */
import type { Enrollment, Plan, Recipe, Schedule } from '../context/DataContext';
import { hoursUntil, longDayLabel, to12h } from './schedule';
import { daysBetween, firstSessionOf } from './validity';
import { checkPaymentGate, recipeForEnrollment } from './verification';

/** Con estos días o menos para la primera asesoría, la verificación pendiente pasa a urgente. */
export const VERIFICATION_ALERT_DAYS = 3;

/** Estados de la asesoría que todavía esperan al alumno. */
const WAITING = ['Reservado', 'Reprogramado'];

/** Estados de verificación que habilitan la primera asesoría. */
const VERIFIED = ['Verificado Completo', 'Verificado Incompleto'];

export const isVerified = (e: Pick<Enrollment, 'verificationStatus'>): boolean => VERIFIED.includes(e.verificationStatus ?? '');

export type GateLevel =
  | 'ok' // verificada, o no aplica
  | 'planificada' // falta verificar, hay tiempo
  | 'urgente' // quedan 3 días o menos
  | 'critica' // la asesoría es hoy o mañana
  | 'vencida'; // la hora de la asesoría ya pasó sin verificar: hay que reprogramar

export type GateBlocker = 'pago' | 'verificacion';

export interface FirstSessionGate {
  /** ¿La primera asesoría de la matrícula espera una verificación? (false = no aplica o ya está verificada) */
  blocked: boolean;
  level: GateLevel;
  session?: Schedule;
  /** Días de calendario que faltan para la primera asesoría (negativo = ya pasó). */
  daysLeft?: number;
  /** Qué paso falta: el primer pago o la entrega de materiales. */
  blocker?: GateBlocker;
  /** La hora de la asesoría ya pasó sin verificar. */
  overdue: boolean;
  message: string;
}

export interface GateContext {
  schedules: Schedule[];
  plans: Plan[];
  recipes: Recipe[];
  today: string;
  now: Date;
}

const NONE: FirstSessionGate = { blocked: false, level: 'ok', overdue: false, message: '' };

const when = (s: Pick<Schedule, 'date' | 'time'>) => `${longDayLabel(s.date)} a las ${to12h(s.time)}`;

/** Estado de la verificación frente a la primera asesoría de una matrícula. */
export function firstSessionGate(enrollment: Enrollment, c: GateContext): FirstSessionGate {
  if (enrollment.status !== 'Activa' || isVerified(enrollment)) return NONE;
  const session = firstSessionOf(enrollment.id, c.schedules);
  if (!session || !WAITING.includes(session.status)) return NONE;
  if (!recipeForEnrollment(enrollment, c.recipes, c.today)) return NONE;

  const daysLeft = daysBetween(c.today, session.date);
  const overdue = hoursUntil(session.date, session.time, c.now) <= 0;
  const level: GateLevel = overdue ? 'vencida' : daysLeft <= 1 ? 'critica' : daysLeft <= VERIFICATION_ALERT_DAYS ? 'urgente' : 'planificada';
  const paid = checkPaymentGate(enrollment, c.plans).ok;
  const blocker: GateBlocker = paid ? 'verificacion' : 'pago';
  const step = paid ? 'verificar la matrícula (entregar los materiales)' : 'registrar el primer pago y verificar la matrícula';

  const message = overdue
    ? `La primera asesoría (${when(session)}) llegó sin materiales entregados: no cuenta como falta del alumno, hay que reprogramarla.`
    : `Falta ${step} antes de la primera asesoría (${when(session)}). Si no se logra a tiempo, se reprograma.`;
  return { blocked: true, level, session, daysLeft, blocker, overdue, message };
}

/** Estado de cada matrícula que espera verificación, por número de matrícula (solo las que están bloqueadas). */
export function blockedFirstSessions(enrollments: Enrollment[], c: GateContext): Record<string, FirstSessionGate> {
  const out: Record<string, FirstSessionGate> = {};
  for (const e of enrollments) {
    const g = firstSessionGate(e, c);
    if (g.blocked) out[e.id] = g;
  }
  return out;
}

/** Estado de una asesoría concreta: solo la primera asesoría vigente de una matrícula puede estar bloqueada. */
export function scheduleGate(schedule: Pick<Schedule, 'id' | 'isFirst' | 'enrollmentId'>, enrollments: Enrollment[], c: GateContext): FirstSessionGate {
  if (!schedule.isFirst || !schedule.enrollmentId) return NONE;
  const enrollment = enrollments.find(e => e.id === schedule.enrollmentId);
  if (!enrollment) return NONE;
  const g = firstSessionGate(enrollment, c);
  return g.session?.id === schedule.id ? g : NONE;
}

/** Motivo por el que NO se puede registrar la asistencia, la falta o la sesión de esta asesoría (null = se puede). */
export function attendanceBlock(schedule: Pick<Schedule, 'id' | 'isFirst' | 'enrollmentId'>, enrollments: Enrollment[], c: GateContext): string | null {
  const g = scheduleGate(schedule, enrollments, c);
  if (!g.blocked) return null;
  return g.blocker === 'pago'
    ? 'No se puede registrar la primera asesoría: la matrícula no tiene el primer pago ni la verificación de materiales. Reprograme la asesoría.'
    : 'No se puede registrar la primera asesoría: la matrícula aún no está verificada (el alumno no tiene sus materiales). Verifique la matrícula o reprograme la asesoría.';
}

/** Anotación que deja la reprogramación de una primera asesoría bloqueada. */
export const gateRescheduleNote = (originalDate: string, originalTime: string): string =>
  `Reprogramada por falta de verificación de materiales (original: ${longDayLabel(originalDate)} a las ${to12h(originalTime)}).`;

const RANK: Record<GateLevel, number> = { vencida: 0, critica: 1, urgente: 2, planificada: 3, ok: 4 };

/** Orden por urgencia: primero lo vencido, luego lo más cercano. Sin primera asesoría pendiente va al final. */
export function compareGates(a: FirstSessionGate, b: FirstSessionGate): number {
  if (RANK[a.level] !== RANK[b.level]) return RANK[a.level] - RANK[b.level];
  return (a.session ? a.session.date + a.session.time : '').localeCompare(b.session ? b.session.date + b.session.time : '');
}

export const GATE_LABEL: Record<GateLevel, string> = {
  ok: '',
  planificada: 'Asesoría próxima',
  urgente: 'Urgente',
  critica: 'Hoy o mañana',
  vencida: 'Reprogramar',
};
