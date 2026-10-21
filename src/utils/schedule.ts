/**
 * Reglas de la Programación de asesorías y utilidades del calendario (funciones puras).
 */
import type { CapacityConfig, CapacityOverride, Enrollment, MonthlySchedule, Schedule, ScheduleActivity, Student } from '../context/DataContext';

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

/**
 * Estados de una asesoría:
 *  - Reservado: al registrarla (automático).
 *  - Reprogramado: al cambiar su fecha, hora o responsable (automático).
 *  - Asistió: el alumno acudió (se marca el día de la asesoría o después; al registrar la sesión se marca solo).
 *  - Faltó / Cancelado: se marcan manualmente.
 * Una asesoría Reservada, Reprogramada o con Asistencia ocupa su horario; Faltó y Cancelado lo liberan.
 */
export const ACTIVE_STATUSES = ['Reservado', 'Reprogramado', 'Asistió'];

/**
 * Estados que ocupan el horario (cupo y tipo de bloque): los activos y Faltó. Una falta se marca el día de la asesoría
 * o después, así que su horario ya pasó y queda ocupado como registro. Solo Cancelado libera el horario.
 */
export const OCCUPYING_STATUSES = [...ACTIVE_STATUSES, 'Faltó'];

/** Todas las asesorías duran exactamente 1 hora. */
export const SLOT_DURATION = 60;

const WEEKDAY_SLOTS = ['15:00', '16:00', '17:00', '18:00', '19:00'];
const SATURDAY_SLOTS = ['09:00', '10:00', '11:00', '12:00', '16:00', '17:00', '18:00', '19:00'];

/**
 * Horarios de inicio permitidos para una fecha (cada uno dura 1 hora):
 *  - Lunes a viernes: 3–4, 4–5, 5–6, 6–7 y 7–8 p. m.
 *  - Sábados: 9–10, 10–11, 11–12 y 12–1 p. m.; luego 4–5, 5–6, 6–7 y 7–8 p. m.
 *  - Domingos: no hay atención.
 */
export function slotsForDate(iso: string): string[] {
  const d = weekdayIndex(iso);
  if (d <= 4) return WEEKDAY_SLOTS;
  if (d === 5) return SATURDAY_SLOTS;
  return [];
}

const to12h = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'p. m.' : 'a. m.';
  return `${h % 12 === 0 ? 12 : h % 12}:${pad(m)} ${suffix}`;
};

/** «3:00 p. m. – 4:00 p. m.» */
export const slotLabel = (start: string) => `${to12h(start)} – ${to12h(endTime(start, SLOT_DURATION))}`;

/** «4:00 p. m. – 6:00 p. m.» para un rango cualquiera. */
export const rangeLabel = (start: string, end: string) => `${to12h(start)} – ${to12h(end)}`;

/** Siguiente día con atención (salta los domingos), a partir de una fecha. */
export function nextOpenDay(iso: string): string {
  let d = iso;
  while (weekdayIndex(d) === 6) d = addDaysISO(d, 1);
  return d;
}

export const STATUS_OPTIONS = ['Reservado', 'Reprogramado', 'Asistió', 'Faltó', 'Cancelado'] as const;

export type StatusTone = 'success' | 'info' | 'warning' | 'danger' | 'neutral';
export const statusTone = (status: string): StatusTone => {
  switch (status) {
    case 'Asistió': return 'success';
    case 'Reservado': return 'info';
    case 'Reprogramado': return 'warning';
    case 'Cancelado': return 'danger';
    case 'Faltó': return 'danger';
    default: return 'neutral';
  }
};

// ---------------------------------------------------------------- Acciones permitidas sobre una asesoría

export type ScheduleAction = 'reprogramar' | 'asistio' | 'sesion' | 'falta' | 'cancelar';

/** Anticipación mínima (en horas) para cancelar o reprogramar una sesión: rige para primeras asesorías, asesorías y actividades. */
export const MIN_NOTICE_HOURS = 24;

/** Horas que faltan para una fecha y hora de inicio (negativo si ya pasó). */
export function hoursUntil(date: string, time: string, now: Date): number {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return (new Date(y, m - 1, d, hh || 0, mm || 0).getTime() - now.getTime()) / 3600000;
}

/** ¿Se puede cancelar / reprogramar con la anticipación mínima? */
export const canChangeWithNotice = (date: string, time: string, now: Date) => hoursUntil(date, time, now) >= MIN_NOTICE_HOURS;

/** «Solo se puede cancelar o reprogramar con 24 horas de anticipación (es el 21 de octubre a las 4:00 p. m.).» */
export function noticeMessage(date: string, time: string): string {
  return `Solo se puede cancelar o reprogramar con ${MIN_NOTICE_HOURS} horas de anticipación (es el ${longDayLabel(date)} a las ${to12h(time)}).`;
}

/** Sesión activa que ya no admite cambios por quedar a menos de 24 horas (o haber pasado). */
export const changeBlockedByNotice = (s: Pick<Schedule, 'status' | 'date' | 'time'>, now: Date) =>
  ACTIVE_STATUSES.includes(s.status) && s.status !== 'Asistió' && !canChangeWithNotice(s.date, s.time, now);

/**
 * Qué se puede hacer con una asesoría según su estado, su fecha y la hora actual:
 *  - Reprogramar y Cancelar: solo con 24 horas de anticipación (ver MIN_NOTICE_HOURS). Si el alumno faltó o la asesoría
 *    se canceló, se puede reprogramar a una fecha nueva (su horario original ya pasó).
 *  - Asistió y Registrar sesión: desde el día de la asesoría (la sesión solo existe si hubo asesoría).
 *  - Faltó: desde el día de la asesoría.
 */
export function availableActions(s: Pick<Schedule, 'status' | 'date' | 'time'>, today: string, now: Date = new Date()): ScheduleAction[] {
  const active = ACTIVE_STATUSES.includes(s.status);
  const attended = s.status === 'Asistió';
  const due = s.date <= today;
  const withNotice = canChangeWithNotice(s.date, s.time, now);
  const out: ScheduleAction[] = [];
  if ((active && !attended && withNotice) || !active) out.push('reprogramar');
  if (active && !attended && due) out.push('asistio');
  if (active && due) out.push('sesion');
  if (active && !attended && due) out.push('falta');
  if (active && !attended && withNotice) out.push('cancelar');
  return out;
}

// ---------------------------------------------------------------- Sede del alumno

/** Matrícula más reciente del alumno. */
export function latestEnrollment(student: Pick<Student, 'id' | 'name'>, enrollments: Enrollment[]): Enrollment | undefined {
  return enrollments
    .filter(e => e.studentId === student.id || e.student === student.name)
    .sort((a, b) => (a.dateISO ?? '').localeCompare(b.dateISO ?? ''))
    .pop();
}

/** Sede del alumno = sede de su matrícula más reciente. */
export const branchOfStudent = (student: Pick<Student, 'id' | 'name'>, enrollments: Enrollment[]): string | undefined =>
  latestEnrollment(student, enrollments)?.branchId;

// ---------------------------------------------------------------- Conflictos del alumno

export interface ScheduleCandidate {
  student: string;
  studentId?: string;
  responsible: string;
  date: string;
  time: string;
  status: string;
}

const sameText = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Asesoría del mismo alumno que se cruza con la propuesta (mismo día, horarios que se solapan).
 * Un mismo responsable puede atender a varios alumnos a la vez (cada horario es un salón con cupo),
 * por eso solo se vigila al alumno. Solo cuentan las asesorías que ocupan horario.
 */
export function findScheduleConflict(
  schedules: Schedule[],
  cand: ScheduleCandidate,
  ignoreId?: string
): { schedule: Schedule; who: 'alumno' } | undefined {
  if (!ACTIVE_STATUSES.includes(cand.status)) return undefined;
  const start = timeToMinutes(cand.time);
  const end = start + SLOT_DURATION;
  for (const s of schedules) {
    if (s.id === ignoreId || s.date !== cand.date || !ACTIVE_STATUSES.includes(s.status)) continue;
    const sStart = timeToMinutes(s.time);
    if (!(start < sStart + SLOT_DURATION && sStart < end)) continue;
    if ((cand.studentId && s.studentId === cand.studentId) || sameText(s.student, cand.student)) return { schedule: s, who: 'alumno' };
  }
  return undefined;
}

/**
 * Valida una reserva. `checkPast`: la fecha no puede ser anterior a hoy (al reservar o al cambiar de fecha/hora;
 * no aplica si solo se editan las observaciones de una asesoría pasada).
 */
export function validateSchedule(c: ScheduleCandidate & { checkPast: boolean }, today: string): string | null {
  if (!c.student.trim()) return 'Seleccione al alumno.';
  if (!c.date) return 'La fecha es obligatoria.';
  if (c.checkPast && c.date < today) return 'La fecha no puede ser anterior a hoy.';
  if (weekdayIndex(c.date) === 6) return 'Los domingos no hay atención. Elija de lunes a sábado.';
  if (!c.time) return 'Seleccione el horario.';
  if (!slotsForDate(c.date).includes(c.time)) return 'El horario elegido no está disponible para esa fecha.';
  if (!c.responsible.trim()) return 'Seleccione al responsable.';
  return null;
}

// ---------------------------------------------------------------- Cupo por horario

/** Cupo habitual propuesto (los salones atienden entre 5 y 8 alumnos). */
export const DEFAULT_CAPACITY = 6;
export const MIN_CAPACITY = 1;
export const MAX_CAPACITY = 50;

/** Cupo aplicable a un horario: excepción de esa fecha y hora > cupo de la sede > cupo general. null = sin límite. */
export function capacityFor(cfg: CapacityConfig, branchId: string, date: string, time: string): number | null {
  const override = cfg.overrides.find(o => o.branchId === branchId && o.date === date && o.time === time);
  if (override) return override.capacity;
  if (Object.prototype.hasOwnProperty.call(cfg.byBranch, branchId)) return cfg.byBranch[branchId];
  return cfg.defaultCapacity;
}

export const capacityLabel = (c: number | null) => (c === null ? 'Sin límite' : `${c} ${c === 1 ? 'alumno' : 'alumnos'}`);

/** ¿Es un cupo válido? (entero entre 1 y 50, o null = sin límite) */
export const isValidCapacity = (c: number | null) => c === null || (Number.isInteger(c) && c >= MIN_CAPACITY && c <= MAX_CAPACITY);

/** Alumnos que ocupan un horario de una sede (asesorías activas). */
export function occupancy(schedules: Schedule[], branchId: string, date: string, time: string, ignoreId?: string): number {
  return schedules.filter(s =>
    s.id !== ignoreId && s.branchId === branchId && s.date === date && s.time === time && OCCUPYING_STATUSES.includes(s.status)
  ).length;
}

/** Agrega o reemplaza la excepción de cupo de una fecha y horario de una sede. */
export function upsertOverride(cfg: CapacityConfig, o: Omit<CapacityOverride, 'id'>): CapacityConfig {
  const rest = cfg.overrides.filter(x => !(x.branchId === o.branchId && x.date === o.date && x.time === o.time));
  const id = `CUP-${o.branchId}-${o.date}-${o.time}`;
  return { ...cfg, overrides: [...rest, { ...o, id }].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)) };
}

export const removeOverride = (cfg: CapacityConfig, id: string): CapacityConfig => ({ ...cfg, overrides: cfg.overrides.filter(o => o.id !== id) });

/** Fija (o quita, con `undefined`) el cupo propio de una sede. */
export function setBranchCapacity(cfg: CapacityConfig, branchId: string, capacity: number | null | undefined): CapacityConfig {
  const byBranch = { ...cfg.byBranch };
  if (capacity === undefined) delete byBranch[branchId];
  else byBranch[branchId] = capacity;
  return { ...cfg, byBranch };
}

// ---------------------------------------------------------------- Actividades de los cronogramas mensuales

/** Actividad de un cronograma, lista para cruzarla con la agenda. */
export interface FlatActivity {
  id: string; // `${cronograma}:${actividad}`
  monthlyId: string;
  activityId: string;
  branchId: string;
  sede: string;
  name: string;
  date: string;
  start: string;
  end: string;
  responsible: string;
  capacity: number | null;
  enrolled: string[];
}

export function allActivities(monthly: MonthlySchedule[]): FlatActivity[] {
  return monthly.flatMap(m =>
    m.actividades
      .filter(a => a.fecha && a.horaInicio && a.horaFin)
      .map(a => ({
        id: `${m.id}:${a.id}`, monthlyId: m.id, activityId: a.id, branchId: m.branchId, sede: m.sede,
        name: a.actividad, date: a.fecha, start: a.horaInicio, end: a.horaFin,
        responsible: a.responsable, capacity: a.cupo, enrolled: a.inscritos,
      }))
  );
}

/** ¿La actividad (de `start` a `end`) pisa el horario de 1 hora que empieza en `time`? */
export const activityOverlaps = (a: { start: string; end: string }, time: string) =>
  timeToMinutes(a.start) < timeToMinutes(time) + SLOT_DURATION && timeToMinutes(time) < timeToMinutes(a.end);

/** Actividad de la sede que bloquea ese horario, si la hay. */
export const blockingActivity = (activities: FlatActivity[], branchId: string, date: string, time: string) =>
  activities.find(a => a.branchId === branchId && a.date === date && activityOverlaps(a, time));

/** Asesorías activas de la sede que quedan tapadas por una actividad. */
export function affectedSchedules(
  schedules: Schedule[],
  branchId: string,
  a: { fecha: string; horaInicio: string; horaFin: string }
): Schedule[] {
  return schedules.filter(s =>
    s.branchId === branchId && s.date === a.fecha && ACTIVE_STATUSES.includes(s.status) &&
    activityOverlaps({ start: a.horaInicio, end: a.horaFin }, s.time)
  );
}

/** Una actividad puede ocupar hasta 3 horas consecutivas de la agenda. */
export const MAX_ACTIVITY_HOURS = 3;

const sortTimes = (times: string[]) => [...times].sort((a, b) => timeToMinutes(a) - timeToMinutes(b));
const consecutive = (a: string, b: string) => timeToMinutes(b) - timeToMinutes(a) === SLOT_DURATION;

/**
 * Marca o desmarca una hora al armar una actividad. La selección siempre son horas consecutivas (máximo 3):
 * una hora contigua se suma; una hora lejana (o si ya hay 3) empieza una selección nueva; tocar un extremo lo quita.
 */
export function toggleActivitySlot(date: string, selected: string[], slot: string): string[] {
  if (!slotsForDate(date).includes(slot)) return selected;
  const cur = sortTimes(selected);
  if (cur.includes(slot)) return slot === cur[0] || slot === cur[cur.length - 1] ? cur.filter(t => t !== slot) : [slot];
  if (cur.length === 0) return [slot];
  const touches = consecutive(slot, cur[0]) || consecutive(cur[cur.length - 1], slot);
  return touches && cur.length < MAX_ACTIVITY_HOURS ? sortTimes([...cur, slot]) : [slot];
}

/** Rango (inicio y fin) de las horas elegidas; null si no hay ninguna. */
export function slotsToRange(selected: string[]): { horaInicio: string; horaFin: string } | null {
  if (selected.length === 0) return null;
  const cur = sortTimes(selected);
  return { horaInicio: cur[0], horaFin: endTime(cur[cur.length - 1], SLOT_DURATION) };
}

/** Horas de la agenda que cubre un rango; vacío si el rango no coincide exactamente con horas de atención consecutivas. */
export function rangeToSlots(date: string, horaInicio: string, horaFin: string): string[] {
  if (!date || !horaInicio || !horaFin) return [];
  const slots = slotsForDate(date).filter(t => timeToMinutes(t) >= timeToMinutes(horaInicio) && timeToMinutes(t) + SLOT_DURATION <= timeToMinutes(horaFin));
  const range = slotsToRange(slots);
  const contiguous = slots.every((t, i) => i === 0 || consecutive(slots[i - 1], t));
  return range && contiguous && range.horaInicio === horaInicio && range.horaFin === horaFin ? slots : [];
}

/** Validación de una actividad al guardar el cronograma. */
export function validateActivity(
  a: { actividad: string; fecha: string; horaInicio: string; horaFin: string; cupo: number | null },
  period: { mes: string; anio: number }
): string | null {
  const name = a.actividad.trim() || 'La actividad';
  if (!a.actividad.trim()) return 'Toda actividad necesita un nombre.';
  if (!a.fecha) return `${name}: indique la fecha.`;
  const [y, m] = a.fecha.split('-').map(Number);
  if (MONTHS[m - 1] !== period.mes || y !== period.anio) return `${name}: la fecha debe estar dentro de ${period.mes} ${period.anio}.`;
  if (weekdayIndex(a.fecha) === 6) return `${name}: los domingos no hay atención; elija de lunes a sábado.`;
  if (!a.horaInicio || !a.horaFin) return `${name}: elija las horas de la actividad.`;
  if (timeToMinutes(a.horaFin) <= timeToMinutes(a.horaInicio)) return `${name}: la hora de fin debe ser posterior a la de inicio.`;
  const hours = rangeToSlots(a.fecha, a.horaInicio, a.horaFin).length;
  if (hours < 1 || hours > MAX_ACTIVITY_HOURS) return `${name}: elija entre 1 y ${MAX_ACTIVITY_HOURS} horas consecutivas dentro del horario de atención.`;
  if (!isValidCapacity(a.cupo)) return `${name}: el cupo debe ser un número entero entre ${MIN_CAPACITY} y ${MAX_CAPACITY}, o sin límite.`;
  return null;
}

/** Cupos libres de una actividad (null = sin límite). */
export const seatsLeft = (a: Pick<FlatActivity, 'capacity' | 'enrolled'>): number | null =>
  a.capacity === null ? null : Math.max(0, a.capacity - a.enrolled.length);

/** Validación de la inscripción de un alumno en una actividad. */
export function validateActivityEnrollment(args: {
  activity: FlatActivity;
  studentId: string;
  studentName: string;
  studentBranchId?: string;
  schedules: Schedule[];
}): string | null {
  const { activity: a, studentId, studentName, studentBranchId, schedules } = args;
  if (a.enrolled.includes(studentId)) return `${studentName} ya está inscrito en «${a.name}».`;
  if (studentBranchId && studentBranchId !== a.branchId) return `${studentName} pertenece a otra sede; la actividad es de ${a.sede}.`;
  if (a.capacity !== null && a.enrolled.length >= a.capacity) return `«${a.name}» está completa (${a.enrolled.length} de ${a.capacity} cupos).`;
  const clash = schedules.find(s =>
    s.date === a.date && ACTIVE_STATUSES.includes(s.status) && (s.studentId === studentId || s.student === studentName) &&
    activityOverlaps({ start: a.start, end: a.end }, s.time)
  );
  if (clash) return `${studentName} tiene una asesoría ese día de ${slotLabel(clash.time)}. Reprográmela antes de inscribirlo.`;
  return null;
}

export const withEnrollment = (a: ScheduleActivity, studentId: string): ScheduleActivity =>
  a.inscritos.includes(studentId) ? a : { ...a, inscritos: [...a.inscritos, studentId] };

export const withoutEnrollment = (a: ScheduleActivity, studentId: string): ScheduleActivity =>
  ({ ...a, inscritos: a.inscritos.filter(id => id !== studentId) });

// ---------------------------------------------------------------- Estado de un horario (cupo + actividades)

export interface SchedulingContext {
  schedules: Schedule[];
  capacity: CapacityConfig;
  activities: FlatActivity[];
}

/**
 * Un horario es de UN solo tipo de sesión: actividad especial (blocked), primera asesoría (first) o asesoría (open / full).
 * Nunca se mezclan.
 */
export type BlockKind = 'closed' | 'blocked' | 'first' | 'full' | 'open';

export interface BlockState {
  kind: BlockKind;
  used: number;
  /** null = sin límite. */
  capacity: number | null;
  activity?: FlatActivity;
}

const inBlock = (schedules: Schedule[], branchId: string, date: string, time: string, ignoreId?: string) =>
  schedules.filter(s => s.id !== ignoreId && s.branchId === branchId && s.date === date && s.time === time && OCCUPYING_STATUSES.includes(s.status));

export function blockState(ctx: SchedulingContext, branchId: string, date: string, time: string, ignoreId?: string): BlockState {
  if (!slotsForDate(date).includes(time)) return { kind: 'closed', used: 0, capacity: null };
  const used = occupancy(ctx.schedules, branchId, date, time, ignoreId);
  const capacity = capacityFor(ctx.capacity, branchId, date, time);
  const activity = blockingActivity(ctx.activities, branchId, date, time);
  if (activity) return { kind: 'blocked', used, capacity, activity };
  // Un horario con primeras asesorías es solo de primeras asesorías (y no tiene cupo)
  if (inBlock(ctx.schedules, branchId, date, time, ignoreId).some(s => s.isFirst)) return { kind: 'first', used, capacity: null };
  if (capacity !== null && used >= capacity) return { kind: 'full', used, capacity };
  return { kind: 'open', used, capacity };
}

/** Texto corto para listas: «2 de 6 cupos», «Completo (6 de 6)», «Bloqueado: Maratón de Lectura». */
export function blockText(b: BlockState): string {
  if (b.kind === 'closed') return 'No disponible';
  if (b.kind === 'blocked') return `Bloqueado: ${b.activity!.name}`;
  if (b.kind === 'first') return 'Reservado para primera asesoría';
  if (b.kind === 'full') return `Completo (${b.used} de ${b.capacity})`;
  return b.capacity === null ? `${b.used} ${b.used === 1 ? 'alumno' : 'alumnos'} · sin límite` : `${b.used} de ${b.capacity} ${b.capacity === 1 ? 'cupo' : 'cupos'}`;
}

/** Mensaje de error si el horario no admite una reserva más; null si hay lugar. */
export function checkBlock(ctx: SchedulingContext, branchId: string, date: string, time: string, ignoreId?: string): string | null {
  const b = blockState(ctx, branchId, date, time, ignoreId);
  if (b.kind === 'closed') return 'El horario elegido no está disponible para esa fecha.';
  if (b.kind === 'blocked') return `Ese horario está ocupado por la actividad «${b.activity!.name}» (${rangeLabel(b.activity!.start, b.activity!.end)}).`;
  if (b.kind === 'first') return 'Ese horario está reservado para primeras asesorías; no admite asesorías normales.';
  if (b.kind === 'full') return `El horario está completo: ${b.used} de ${b.capacity} cupos. Elija otro horario o amplíe el cupo.`;
  return null;
}

// ---------------------------------------------------------------- Horarios de primera asesoría

/**
 * Estado de un horario para una PRIMERA asesoría:
 *  - free: totalmente vacío (la única forma de elegirlo por primera vez).
 *  - own: ya tiene primeras asesorías del mismo registro de matrícula (hermanos), que pueden compartirlo.
 *  - taken: tiene asesorías normales o primeras asesorías de otro registro.
 *  - blocked: una actividad especial lo ocupa. closed: fuera de la agenda.
 * La primera asesoría no tiene cupo.
 */
export type FirstBlockKind = 'closed' | 'blocked' | 'taken' | 'own' | 'free';

export interface FirstBlockState {
  kind: FirstBlockKind;
  used: number;
  activity?: FlatActivity;
  /** Para `taken`: qué lo ocupa. */
  takenBy?: 'asesorias' | 'otro-registro';
}

export function firstSessionBlock(
  ctx: SchedulingContext, branchId: string, date: string, time: string, registrationId?: string, ignoreId?: string
): FirstBlockState {
  if (!slotsForDate(date).includes(time)) return { kind: 'closed', used: 0 };
  const activity = blockingActivity(ctx.activities, branchId, date, time);
  const here = inBlock(ctx.schedules, branchId, date, time, ignoreId);
  if (activity) return { kind: 'blocked', used: here.length, activity };
  if (here.length === 0) return { kind: 'free', used: 0 };
  if (registrationId && here.every(s => s.isFirst && s.registrationId === registrationId)) return { kind: 'own', used: here.length };
  return { kind: 'taken', used: here.length, takenBy: here.some(s => !s.isFirst) ? 'asesorias' : 'otro-registro' };
}

export function firstBlockText(b: FirstBlockState): string {
  switch (b.kind) {
    case 'free': return 'Libre';
    case 'own': return 'Con alumnos de este registro';
    case 'blocked': return `Bloqueado: ${b.activity!.name}`;
    case 'taken': return b.takenBy === 'otro-registro' ? 'Primera asesoría de otro registro' : 'Ocupado por asesorías';
    default: return 'No disponible';
  }
}

/** Mensaje de error si el horario no puede ser de primera asesoría; null si está libre o es del mismo registro. */
export function checkFirstSessionBlock(
  ctx: SchedulingContext, branchId: string, date: string, time: string, registrationId?: string, ignoreId?: string
): string | null {
  const b = firstSessionBlock(ctx, branchId, date, time, registrationId, ignoreId);
  if (b.kind === 'closed') return 'El horario elegido no está disponible para esa fecha.';
  if (b.kind === 'blocked') return `Ese horario está ocupado por la actividad «${b.activity!.name}» (${rangeLabel(b.activity!.start, b.activity!.end)}).`;
  if (b.kind === 'taken') {
    return b.takenBy === 'otro-registro'
      ? 'Ese horario ya es de la primera asesoría de otro registro. Elija un horario libre.'
      : 'Ese horario ya tiene asesorías. La primera asesoría necesita un horario vacío.';
  }
  return null;
}

/** Reserva completa: datos válidos, horario con cupo y sin cruce del alumno. */
export function validateReservation(
  ctx: SchedulingContext,
  cand: ScheduleCandidate & { branchId: string; checkPast: boolean; isFirst?: boolean; registrationId?: string },
  today: string,
  ignoreId?: string
): string | null {
  const basic = validateSchedule(cand, today);
  if (basic) return basic;
  if (!cand.branchId) return 'El alumno no tiene una sede asignada (no se encontró su matrícula).';
  const clash = findScheduleConflict(ctx.schedules, cand, ignoreId);
  if (clash) return `${clash.schedule.student} ya tiene una asesoría ese día de ${slotLabel(clash.schedule.time)}.`;
  return cand.isFirst
    ? checkFirstSessionBlock(ctx, cand.branchId, cand.date, cand.time, cand.registrationId, ignoreId)
    : checkBlock(ctx, cand.branchId, cand.date, cand.time, ignoreId);
}

/** Responsable que ya atiende ese horario (el más frecuente), para proponerlo al reservar. */
export function suggestedResponsible(schedules: Schedule[], branchId: string, date: string, time: string): string {
  const count = new Map<string, number>();
  for (const s of schedules) {
    if (s.branchId === branchId && s.date === date && s.time === time && ACTIVE_STATUSES.includes(s.status)) {
      count.set(s.responsible, (count.get(s.responsible) ?? 0) + 1);
    }
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
}

/** Agrupa las asesorías de un día por horario (ordenadas). */
export function groupByBlock(schedules: Schedule[]): { time: string; items: Schedule[] }[] {
  const map = new Map<string, Schedule[]>();
  for (const s of schedules) map.set(s.time, [...(map.get(s.time) ?? []), s]);
  return [...map.entries()].sort((a, b) => timeToMinutes(a[0]) - timeToMinutes(b[0])).map(([time, items]) => ({ time, items }));
}

// ---------------------------------------------------------------- Frecuencia semanal

/**
 * Alumnos activos sin ninguna asesoría (reservada, reprogramada o con asistencia) en la semana indicada.
 * Cada alumno debe asistir al menos una vez por semana.
 */
export function studentsWithoutSession(
  data: { students: Student[]; schedules: Schedule[]; enrollments: Enrollment[] },
  week: string[],
  branchId?: string
): { student: Student; branchId?: string }[] {
  const inWeek = new Set(week);
  return data.students
    .filter(st => st.status === 'Activo')
    .map(student => ({ student, branchId: branchOfStudent(student, data.enrollments) }))
    .filter(x => !branchId || x.branchId === branchId)
    .filter(x => !data.schedules.some(s =>
      inWeek.has(s.date) && ACTIVE_STATUSES.includes(s.status) && (s.studentId === x.student.id || s.student === x.student.name)
    ));
}
