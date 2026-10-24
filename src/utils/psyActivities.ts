/**
 * Actividades especiales de Psicopedagogía: responsable y asistencia (funciones puras).
 *
 * Flujo:
 *  1. El cronograma mensual crea la actividad (fecha, horas y cupo) SIN responsable.
 *  2. Desde «Actividades especiales» se asigna el responsable: personal activo con una asignación activa en
 *     Psicopedagogía (de preferencia de la misma sede) y SIN cruces: ni otra actividad ni una asesoría suya a esa hora.
 *     Si faltan `ACTIVITY_LEAD_DAYS` días o menos y no hay responsable, la agenda avisa.
 *  3. Desde el día de la actividad el responsable registra la asistencia de los inscritos (Asistió / Faltó). No se
 *     registra sin responsable, ni a alguien que no está inscrito.
 *  4. Con asistencia ya registrada no se cambia el responsable ni se quitan inscripciones (el registro quedaría roto).
 *  5. Lo registrado alimenta el historial del alumno, los recordatorios y el reporte de Psicopedagogía.
 */
import type { ActivityAttendance, Assignment, Schedule, Staff } from '../context/DataContext';
import { INTERVIEWER_AREA } from './enrollment';
import { ACTIVE_STATUSES, activityOverlaps, type FlatActivity } from './schedule';
import { daysBetween } from './validity';

/** Con estos días o menos para la actividad y sin responsable, se avisa. */
export const ACTIVITY_LEAD_DAYS = 7;

const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const TITLE = /^(lic|licda|ing|dr|dra|mg|mag|psic|psi|prof)\.?\s+/;

/** Nombre sin título (Lic., Dr.…), tildes ni mayúsculas, para comparar a quien figura como responsable. */
export const personKey = (name: string): string => strip(name).replace(TITLE, '').trim();

/** ¿Este texto (el «responsable» de una asesoría o actividad) corresponde a este trabajador? */
export function isStaffNamed(staff: Pick<Staff, 'names' | 'lastNameP' | 'lastNameM'>, text: string): boolean {
  const t = personKey(text);
  if (!t) return false;
  const short = personKey(`${staff.names} ${staff.lastNameP}`);
  const full = personKey(`${staff.names} ${staff.lastNameP} ${staff.lastNameM}`);
  return t === short || t === full || t.startsWith(`${short} `);
}

export const staffLabel = (s: Pick<Staff, 'names' | 'lastNameP'>): string => `${s.names} ${s.lastNameP}`.trim();

// ---------------------------------------------------------------- Responsable

export interface ResponsibleContext {
  schedules: Schedule[];
  activities: FlatActivity[];
  staff: Staff[];
  assignments: Assignment[];
  branches: { id: string; name: string }[];
}

const area = strip(INTERVIEWER_AREA);

/** ¿Tiene una asignación activa en Psicopedagogía? (Devuelve las sedes de esas asignaciones.) */
export const psychopedagogyBranches = (staffId: string, assignments: Assignment[]): string[] =>
  assignments.filter(a => a.staffId === staffId && a.status === 'Activa' && strip(a.area) === area).map(a => a.branch);

/** ¿La actividad ya tiene responsable (asignado o heredado de un registro antiguo)? */
export const hasResponsible = (a: Pick<FlatActivity, 'responsible' | 'responsibleId'>): boolean => !!(a.responsibleId || a.responsible.trim());

/** ¿Falta responsable y la actividad ya está cerca? */
export function needsResponsible(a: Pick<FlatActivity, 'date' | 'responsible' | 'responsibleId'>, today: string): boolean {
  return !hasResponsible(a) && a.date >= today && daysBetween(today, a.date) <= ACTIVITY_LEAD_DAYS;
}

/** Cruces del trabajador con una actividad: otra actividad suya o una asesoría activa a esa hora. */
export function responsibleConflicts(activity: FlatActivity, staff: Staff, ctx: Pick<ResponsibleContext, 'schedules' | 'activities'>): string[] {
  const out: string[] = [];
  const range = { start: activity.start, end: activity.end };
  for (const other of ctx.activities) {
    if (other.id === activity.id || other.date !== activity.date) continue;
    const mine = other.responsibleId === staff.id || (!other.responsibleId && isStaffNamed(staff, other.responsible));
    if (mine && other.start < activity.end && activity.start < other.end) out.push(`ya es responsable de «${other.name}» (${other.start} a ${other.end}) ese día`);
  }
  for (const s of ctx.schedules) {
    if (s.date !== activity.date || !ACTIVE_STATUSES.includes(s.status) || !isStaffNamed(staff, s.responsible)) continue;
    if (activityOverlaps(range, s.time)) out.push(`tiene una asesoría con ${s.student} a las ${s.time}`);
  }
  return out;
}

export interface ResponsibleOption {
  staff: Staff;
  branchNames: string[];
  sameBranch: boolean;
  conflicts: string[];
}

/** Personal que puede encargarse de la actividad (los de su sede primero) y, de cada uno, sus cruces. */
export function responsibleOptions(activity: FlatActivity, ctx: ResponsibleContext): ResponsibleOption[] {
  const branchName = ctx.branches.find(b => b.id === activity.branchId)?.name ?? activity.sede;
  return ctx.staff
    .filter(s => s.status === 'Activo')
    .map(s => ({ staff: s, branchNames: psychopedagogyBranches(s.id, ctx.assignments) }))
    .filter(o => o.branchNames.length > 0)
    .map(o => ({ ...o, sameBranch: o.branchNames.includes(branchName), conflicts: responsibleConflicts(activity, o.staff, ctx) }))
    .sort((a, b) => Number(b.sameBranch) - Number(a.sameBranch) || a.staff.lastNameP.localeCompare(b.staff.lastNameP) || a.staff.names.localeCompare(b.staff.names));
}

export function validateResponsible(activity: FlatActivity, staffId: string | null, ctx: ResponsibleContext): string[] {
  const e: string[] = [];
  if (Object.keys(activity.attendance).length > 0) {
    e.push('Ya hay asistencia registrada: no se cambia el responsable (quedaría registrada a nombre de otra persona).');
    return e;
  }
  if (staffId === null) return e;
  const staff = ctx.staff.find(s => s.id === staffId);
  if (!staff) return ['No se encontró al trabajador.'];
  if (staff.status !== 'Activo') e.push(`${staffLabel(staff)} está inactivo.`);
  if (psychopedagogyBranches(staff.id, ctx.assignments).length === 0) e.push(`${staffLabel(staff)} no tiene una asignación activa en Psicopedagogía.`);
  const clashes = responsibleConflicts(activity, staff, ctx);
  if (clashes.length > 0) e.push(`${staffLabel(staff)} ${clashes.join(' y ')}.`);
  return e;
}

/** Actividades futuras (o de hoy) a cargo de este trabajador: impiden darlo de baja o cerrar su última asignación. */
export function futureActivitiesOf(staff: Pick<Staff, 'id' | 'names' | 'lastNameP' | 'lastNameM'>, activities: FlatActivity[], today: string): FlatActivity[] {
  return activities.filter(a => a.date >= today && (a.responsibleId === staff.id || (!a.responsibleId && isStaffNamed(staff, a.responsible))));
}

// ---------------------------------------------------------------- Asistencia

/** Por qué todavía no se puede registrar la asistencia de la actividad (null = se puede). */
export function attendanceBlock(a: Pick<FlatActivity, 'date' | 'responsible' | 'responsibleId'>, today: string): string | null {
  if (!hasResponsible(a)) return 'Asigne primero al responsable de la actividad: es quien firma la asistencia.';
  if (a.date > today) return 'La asistencia se registra desde el día de la actividad.';
  return null;
}

export function validateAttendance(a: FlatActivity, studentId: string, status: string, today: string): string[] {
  const e: string[] = [];
  const block = attendanceBlock(a, today);
  if (block) e.push(block);
  if (!a.enrolled.includes(studentId)) e.push('El alumno no está inscrito en la actividad.');
  if (status !== 'Asistió' && status !== 'Faltó') e.push('Indique si asistió o faltó.');
  return e;
}

export const withAttendance = (a: FlatActivity['attendance'], studentId: string, record: ActivityAttendance): FlatActivity['attendance'] => ({ ...a, [studentId]: record });

export function withoutAttendance(a: FlatActivity['attendance'], studentId: string): FlatActivity['attendance'] {
  const { [studentId]: _removed, ...rest } = a;
  return rest;
}

export interface AttendanceSummary {
  enrolled: number;
  present: number;
  absent: number;
  /** Inscritos sin marcar. */
  pending: number;
  /** Asistencia sobre los ya marcados (null si nadie está marcado). */
  rate: number | null;
}

export function attendanceSummary(a: Pick<FlatActivity, 'enrolled' | 'attendance'>): AttendanceSummary {
  const marks = a.enrolled.map(id => a.attendance[id]?.status);
  const present = marks.filter(m => m === 'Asistió').length;
  const absent = marks.filter(m => m === 'Faltó').length;
  const marked = present + absent;
  return { enrolled: a.enrolled.length, present, absent, pending: a.enrolled.length - marked, rate: marked === 0 ? null : Math.round((present / marked) * 1000) / 10 };
}

/** ¿Se puede quitar la inscripción? No si ya tiene asistencia registrada. */
export const canRemoveEnrollment = (a: Pick<FlatActivity, 'attendance'>, studentId: string): boolean => !a.attendance[studentId];

/** Estado de la actividad para mostrar. */
export type ActivityState = 'Próxima' | 'Hoy' | 'Realizada';
export const activityState = (a: Pick<FlatActivity, 'date'>, today: string): ActivityState => (a.date > today ? 'Próxima' : a.date === today ? 'Hoy' : 'Realizada');
