/**
 * Reglas de la Programación de asesorías y utilidades del calendario (funciones puras).
 */
import type { Schedule } from '../context/DataContext';

export const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
export const WEEKDAYS_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
export const WEEKDAYS_LONG = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

const pad = (n: number) => String(n).padStart(2, '0');

/** Fecha local de hoy (YYYY-MM-DD), sin desfase por zona horaria. */
export function todayLocalISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const parse = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d };
};

export function addDaysISO(iso: string, days: number): string {
  const { y, m, d } = parse(iso);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** 0 = lunes … 6 = domingo. */
export function weekdayIndex(iso: string): number {
  const { y, m, d } = parse(iso);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/** Los 7 días (lunes a domingo) de la semana que contiene la fecha. */
export function weekOf(iso: string): string[] {
  const monday = addDaysISO(iso, -weekdayIndex(iso));
  return Array.from({ length: 7 }, (_, i) => addDaysISO(monday, i));
}

/** Cuadrícula del mes: semanas (lunes a domingo) que cubren todos sus días. */
export function monthGrid(year: number, month: number): string[][] {
  const first = `${year}-${pad(month)}-01`;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lead = weekdayIndex(first);
  const weeks = Math.ceil((lead + daysInMonth) / 7);
  const start = addDaysISO(first, -lead);
  return Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, d) => addDaysISO(start, w * 7 + d)));
}

export const monthTitle = (year: number, month: number) => `${MONTHS[month - 1]} ${year}`;

/** «15 de octubre» */
export function longDayLabel(iso: string): string {
  const { m, d } = parse(iso);
  return `${d} de ${MONTHS[m - 1].toLowerCase()}`;
}

export const timeToMinutes = (t: string): number => {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

export const endTime = (time: string, duration: number): string => {
  const total = timeToMinutes(time) + duration;
  return `${pad(Math.floor(total / 60) % 24)}:${pad(total % 60)}`;
};

/** Estados que ocupan el horario (los cancelados, reprogramados o que no reservaron lo liberan). */
export const ACTIVE_STATUSES = ['Reservado', 'Confirmado'];

export const STATUS_OPTIONS = ['Reservado', 'Confirmado', 'Reprogramado', 'Cancelado', 'No reservó'] as const;
export const TYPE_OPTIONS = ['Primera asesoría', 'Seguimiento', 'Reprogramación'] as const;

export type StatusTone = 'success' | 'info' | 'warning' | 'danger' | 'neutral';
export const statusTone = (status: string): StatusTone => {
  switch (status) {
    case 'Confirmado': return 'success';
    case 'Reservado': return 'info';
    case 'Reprogramado': return 'warning';
    case 'Cancelado': return 'danger';
    default: return 'neutral';
  }
};

export interface ScheduleCandidate {
  student: string;
  studentId?: string;
  responsible: string;
  date: string;
  time: string;
  duration: number;
  status: string;
}

const sameText = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
/** Mismo profesional aunque uno lleve título («Lic. María Torres» = «María Torres»). */
const stripTitle = (n: string) => n.trim().replace(/^(lic|licda|mg|ps|psic|dr|dra)\.?\s+/i, '');
const sameResponsible = (a: string, b: string) => sameText(stripTitle(a), stripTitle(b));

/**
 * Cita que se cruza con la propuesta (mismo día, horarios que se solapan) para el mismo responsable o el mismo alumno.
 * Solo cuentan las citas que ocupan horario (Reservado / Confirmado).
 */
export function findScheduleConflict(
  schedules: Schedule[],
  cand: ScheduleCandidate,
  ignoreId?: string
): { schedule: Schedule; who: 'responsable' | 'alumno' } | undefined {
  if (!ACTIVE_STATUSES.includes(cand.status)) return undefined;
  const start = timeToMinutes(cand.time);
  const end = start + cand.duration;
  for (const s of schedules) {
    if (s.id === ignoreId || s.date !== cand.date || !ACTIVE_STATUSES.includes(s.status)) continue;
    const sStart = timeToMinutes(s.time);
    const sEnd = sStart + s.duration;
    if (!(start < sEnd && sStart < end)) continue;
    if (sameResponsible(s.responsible, cand.responsible)) return { schedule: s, who: 'responsable' };
    if ((cand.studentId && s.studentId === cand.studentId) || sameText(s.student, cand.student)) return { schedule: s, who: 'alumno' };
  }
  return undefined;
}

export function validateSchedule(c: ScheduleCandidate & { isNew: boolean }, today: string): string | null {
  if (!c.student.trim()) return 'Seleccione al alumno.';
  if (!c.date) return 'La fecha es obligatoria.';
  if (c.isNew && c.date < today) return 'La fecha de una nueva reserva no puede ser anterior a hoy.';
  if (!c.time) return 'La hora es obligatoria.';
  if (!(c.duration >= 5 && c.duration <= 240)) return 'La duración debe estar entre 5 y 240 minutos.';
  if (!c.responsible.trim()) return 'Seleccione al responsable.';
  return null;
}
