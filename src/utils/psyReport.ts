/**
 * Reporte de Psicopedagogía (funciones puras): asistencia, cumplimiento del registro de sesiones, cambios y su motivo,
 * progreso, actividades especiales y alumnos en riesgo.
 *
 * Todo se calcula de lo que ya guarda el sistema (asesorías, sesiones, historial de cambios, actividades y matrículas):
 * el reporte no tiene datos propios. Las asesorías se filtran por la FECHA de la asesoría, la sede y el programa.
 */
import type { Enrollment, Program, PsyEvent, Schedule, Student, Tracking } from '../context/DataContext';
import { historyOf } from './psyHistory';
import { attendanceSummary } from './psyActivities';
import { branchOfStudent, type FlatActivity } from './schedule';
import { metricNumber } from './sessionMetrics';
import { daysBetween, isStudentWorkable } from './validity';

/** Faltas seguidas a partir de las cuales un alumno se marca en riesgo. */
export const RISK_ABSENCES = 2;
/** Días sin asesoría (y sin una próxima) a partir de los cuales un alumno se marca en riesgo. */
export const RISK_GAP_DAYS = 14;

export interface PsyReportFilters {
  from: string;
  to: string;
  branchId: string;
  program: string;
}

export interface PsyReportContext {
  schedules: Schedule[];
  trackings: Tracking[];
  events: PsyEvent[];
  activities: FlatActivity[];
  enrollments: Enrollment[];
  students: Student[];
  programs: Program[];
  branches: { id: string; name: string }[];
  /** Primeras asesorías que esperan la verificación de materiales. */
  blockedScheduleIds: Set<string>;
  today: string;
}

export interface SessionKpis {
  total: number;
  attended: number;
  absent: number;
  cancelled: number;
  /** Futuras o de hoy, aún sin marcar. */
  pending: number;
  /** Vencidas sin marcar asistencia ni falta. */
  unmarked: number;
  /** Asistencia sobre las ya marcadas (null si ninguna). */
  attendanceRate: number | null;
  /** Asistidas con sesión registrada (null si ninguna asistida). */
  sessionRate: number | null;
  withoutSession: number;
  firstSessions: number;
  firstBlocked: number;
}

export interface GroupRow {
  name: string;
  total: number;
  attended: number;
  absent: number;
  cancelled: number;
  attendanceRate: number | null;
  withoutSession: number;
}

export interface ChangeSummary {
  reprogramadas: number;
  canceladas: number;
  porAlumno: number;
  porInstitucion: number;
  sinMotivo: number;
  motivos: { reason: string; count: number }[];
  /** Asesorías reprogramadas más de una vez. */
  repetidas: number;
}

export interface ProgressRow {
  program: string;
  sessions: number;
  students: number;
  avgSpeed: number | null;
  avgComprehension: number | null;
  /** Alumnos con 2 o más sesiones medidas y el promedio de lo que ganaron entre la primera y la última. */
  measured: number;
  speedGain: number | null;
  comprehensionGain: number | null;
}

export interface RiskRow {
  studentId: string;
  student: string;
  branchName: string;
  program: string;
  reasons: string[];
}

export interface ActivityRow {
  id: string;
  name: string;
  sede: string;
  date: string;
  responsible: string;
  capacity: number | null;
  enrolled: number;
  present: number;
  absent: number;
  pending: number;
  rate: number | null;
}

export interface ActivityKpis {
  total: number;
  held: number;
  withoutResponsible: number;
  enrolled: number;
  occupancy: number | null;
  attendanceRate: number | null;
}

export interface PsyReport {
  kpis: SessionKpis;
  byBranch: GroupRow[];
  byProgram: GroupRow[];
  byResponsible: GroupRow[];
  changes: ChangeSummary;
  progress: ProgressRow[];
  risk: RiskRow[];
  activities: ActivityRow[];
  activityKpis: ActivityKpis;
}

const pct = (n: number, d: number): number | null => (d === 0 ? null : Math.round((n / d) * 1000) / 10);
const avg = (xs: number[]): number | null => (xs.length === 0 ? null : Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10);
const ACTIVE_PENDING = ['Reservado', 'Reprogramado'];

export function filterSchedules(ctx: Pick<PsyReportContext, 'schedules'>, f: PsyReportFilters): Schedule[] {
  return ctx.schedules.filter(s => s.date >= f.from && s.date <= f.to && (!f.branchId || s.branchId === f.branchId) && (!f.program || s.program === f.program));
}

function groupRows(list: Schedule[], key: (s: Schedule) => string, hasSession: (s: Schedule) => boolean): GroupRow[] {
  const map = new Map<string, Schedule[]>();
  for (const s of list) { const k = key(s) || 'Sin dato'; map.set(k, [...(map.get(k) ?? []), s]); }
  return [...map.entries()].map(([name, items]) => {
    const attended = items.filter(s => s.status === 'Asistió');
    const absent = items.filter(s => s.status === 'Faltó').length;
    return {
      name, total: items.length, attended: attended.length, absent, cancelled: items.filter(s => s.status === 'Cancelado').length,
      attendanceRate: pct(attended.length, attended.length + absent), withoutSession: attended.filter(s => !hasSession(s)).length,
    };
  }).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

export function psyReport(ctx: PsyReportContext, f: PsyReportFilters): PsyReport {
  const list = filterSchedules(ctx, f);
  const ids = new Set(list.map(s => s.id));
  const sessionIds = new Set(ctx.trackings.filter(t => t.scheduleId).map(t => t.scheduleId as string));
  const hasSession = (s: Schedule) => sessionIds.has(s.id);

  const attended = list.filter(s => s.status === 'Asistió');
  const absent = list.filter(s => s.status === 'Faltó');
  const pendingAll = list.filter(s => ACTIVE_PENDING.includes(s.status));
  const withoutSession = attended.filter(s => !hasSession(s)).length;
  const kpis: SessionKpis = {
    total: list.length,
    attended: attended.length,
    absent: absent.length,
    cancelled: list.filter(s => s.status === 'Cancelado').length,
    pending: pendingAll.filter(s => s.date >= ctx.today).length,
    unmarked: pendingAll.filter(s => s.date < ctx.today).length,
    attendanceRate: pct(attended.length, attended.length + absent.length),
    sessionRate: pct(attended.length - withoutSession, attended.length),
    withoutSession,
    firstSessions: list.filter(s => s.isFirst && s.status !== 'Cancelado').length,
    firstBlocked: list.filter(s => ctx.blockedScheduleIds.has(s.id)).length,
  };

  const branchName = (id?: string) => ctx.branches.find(b => b.id === id)?.name ?? '';

  // ---- Cambios: reprogramaciones y cancelaciones de las asesorías del período, con su motivo
  const own = ctx.events.filter(e => e.subject === 'asesoria' && ids.has(e.refId) && (e.type === 'Reprogramada' || e.type === 'Cancelada'));
  const reasons = new Map<string, number>();
  for (const e of own) reasons.set(e.reason ?? 'Sin motivo registrado', (reasons.get(e.reason ?? 'Sin motivo registrado') ?? 0) + 1);
  const changes: ChangeSummary = {
    reprogramadas: own.filter(e => e.type === 'Reprogramada').length,
    canceladas: own.filter(e => e.type === 'Cancelada').length,
    porAlumno: own.filter(e => e.initiator === 'Alumno o titular').length,
    porInstitucion: own.filter(e => e.initiator === 'Institución').length,
    sinMotivo: own.filter(e => !e.reason).length,
    motivos: [...reasons.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
    repetidas: [...ids].filter(id => historyOf(ctx.events, 'asesoria', id).filter(e => e.type === 'Reprogramada').length > 1).length,
  };

  // ---- Progreso: sesiones con métricas dentro del período
  const programOfSchedule = new Map(list.map(s => [s.id, s.program]));
  const measured = ctx.trackings.filter(t => t.status === 'Asistió' && t.metrics && t.date >= f.from && t.date <= f.to && (
    t.scheduleId ? programOfSchedule.has(t.scheduleId) : false
  ));
  const progress: ProgressRow[] = [...new Set(measured.map(t => programOfSchedule.get(t.scheduleId as string) as string))].sort().map(program => {
    const rows = measured.filter(t => programOfSchedule.get(t.scheduleId as string) === program);
    const speeds = rows.map(t => metricNumber(t, 'velocidad')).filter((n): n is number => n !== undefined);
    const comps = rows.map(t => metricNumber(t, 'comprension')).filter((n): n is number => n !== undefined);
    const byStudent = new Map<string, Tracking[]>();
    for (const t of rows) byStudent.set(t.studentId, [...(byStudent.get(t.studentId) ?? []), t].sort((a, b) => a.date.localeCompare(b.date)));
    const speedGains: number[] = []; const compGains: number[] = []; let multi = 0;
    for (const ts of byStudent.values()) {
      if (ts.length < 2) continue;
      multi++;
      const [a, b] = [ts[0], ts[ts.length - 1]];
      const s1 = metricNumber(a, 'velocidad'); const s2 = metricNumber(b, 'velocidad');
      const c1 = metricNumber(a, 'comprension'); const c2 = metricNumber(b, 'comprension');
      if (s1 !== undefined && s2 !== undefined) speedGains.push(s2 - s1);
      if (c1 !== undefined && c2 !== undefined) compGains.push(c2 - c1);
    }
    return { program, sessions: rows.length, students: byStudent.size, avgSpeed: avg(speeds), avgComprehension: avg(comps), measured: multi, speedGain: avg(speedGains), comprehensionGain: avg(compGains) };
  });

  // ---- Alumnos en riesgo (según sede y programa; no depende del rango de fechas)
  const risk: RiskRow[] = [];
  for (const student of ctx.students) {
    if (!isStudentWorkable(student, { enrollments: ctx.enrollments, programs: ctx.programs, schedules: ctx.schedules }, ctx.today)) continue;
    const branchId = branchOfStudent(student, ctx.enrollments);
    const enrollment = ctx.enrollments.filter(e => e.studentId === student.id || e.student === student.name).filter(e => e.status === 'Activa')[0];
    if ((f.branchId && branchId !== f.branchId) || (f.program && enrollment?.program !== f.program)) continue;
    const own = ctx.schedules.filter(s => s.studentId === student.id || s.student === student.name);
    const done = own.filter(s => s.status === 'Asistió' || s.status === 'Faltó').sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
    let streak = 0;
    for (const s of done) { if (s.status === 'Faltó') streak++; else break; }
    const reasonsList: string[] = [];
    if (streak >= RISK_ABSENCES) reasonsList.push(`${streak} faltas seguidas`);
    const lastAttended = done.find(s => s.status === 'Asistió');
    const hasNext = own.some(s => ACTIVE_PENDING.includes(s.status) && s.date >= ctx.today);
    if (!hasNext) {
      const gap = lastAttended ? daysBetween(lastAttended.date, ctx.today) : null;
      if (gap !== null && gap >= RISK_GAP_DAYS) reasonsList.push(`${gap} días sin asesoría y ninguna reservada`);
    }
    const unregistered = own.filter(s => s.status === 'Asistió' && !hasSession(s)).length;
    if (unregistered > 0) reasonsList.push(`${unregistered} asesoría${unregistered === 1 ? '' : 's'} sin sesión registrada`);
    if (reasonsList.length > 0) risk.push({ studentId: student.id, student: student.name, branchName: branchName(branchId), program: enrollment?.program ?? student.program, reasons: reasonsList });
  }
  risk.sort((a, b) => b.reasons.length - a.reasons.length || a.student.localeCompare(b.student));

  // ---- Actividades del período
  const acts = ctx.activities.filter(a => a.date >= f.from && a.date <= f.to && (!f.branchId || a.branchId === f.branchId));
  const activities: ActivityRow[] = acts.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)).map(a => {
    const sum = attendanceSummary(a);
    return { id: a.id, name: a.name, sede: a.sede, date: a.date, responsible: a.responsible, capacity: a.capacity, enrolled: sum.enrolled, present: sum.present, absent: sum.absent, pending: sum.pending, rate: sum.rate };
  });
  const held = acts.filter(a => a.date <= ctx.today);
  const sums = held.map(a => attendanceSummary(a));
  const presentTotal = sums.reduce((n, x) => n + x.present, 0);
  const markedTotal = sums.reduce((n, x) => n + x.present + x.absent, 0);
  const limited = acts.filter(a => a.capacity !== null);
  const activityKpis: ActivityKpis = {
    total: acts.length,
    held: held.length,
    withoutResponsible: acts.filter(a => !a.responsibleId && !a.responsible.trim()).length,
    enrolled: acts.reduce((n, a) => n + a.enrolled.length, 0),
    occupancy: pct(limited.reduce((n, a) => n + a.enrolled.length, 0), limited.reduce((n, a) => n + (a.capacity ?? 0), 0)),
    attendanceRate: pct(presentTotal, markedTotal),
  };

  return {
    kpis,
    byBranch: groupRows(list, s => branchName(s.branchId), hasSession),
    byProgram: groupRows(list, s => s.program, hasSession),
    byResponsible: groupRows(list, s => s.responsible, hasSession),
    changes, progress, risk, activities, activityKpis,
  };
}
