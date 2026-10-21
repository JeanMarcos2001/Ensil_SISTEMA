/**
 * Vigencia de una matrícula (funciones puras): duración base + período de garantía (extensión) del programa.
 *
 *  - El tiempo se cuenta desde la fecha de la PRIMERA ASESORÍA de la matrícula (no se guarda: se deriva de la asesoría,
 *    así que si se reprograma la vigencia se recalcula sola).
 *  - Fin de la duración base = inicio + `durationBase` meses − 1 día. Fin con extensión = inicio + (`durationBase` + `warranty`) meses − 1 día.
 *  - Faltando `EXPIRY_ALERT_DAYS` días o menos para terminar la duración base, la matrícula está «por vencer».
 *  - Al terminar la duración base sin extensión habilitada, el alumno deja de aparecer para programarle asesorías
 *    (sus datos y su matrícula siguen en el sistema). Habilitar la extensión lo mantiene hasta el fin con extensión.
 */
import type { Enrollment, Program, Schedule, Student } from '../context/DataContext';
import { addDaysISO } from './schedule';

/** Días antes del fin de la duración base en que empieza la alerta. */
export const EXPIRY_ALERT_DAYS = 14;

export type ValidityState =
  | 'sin-inicio' // sin primera asesoría vinculada (matrículas antiguas, o cancelada sin reprogramar)
  | 'por-iniciar' // la primera asesoría aún no llega
  | 'vigente'
  | 'por-vencer'
  | 'base-finalizada' // terminó la duración base y no se habilitó la extensión
  | 'extension' // extensión habilitada, dentro de su período
  | 'finalizada'; // terminó también la extensión

export const VALIDITY_LABEL: Record<ValidityState, string> = {
  'sin-inicio': 'Sin inicio',
  'por-iniciar': 'Por iniciar',
  vigente: 'Vigente',
  'por-vencer': 'Por vencer',
  'base-finalizada': 'Base finalizada',
  extension: 'En extensión',
  finalizada: 'Finalizada',
};

/** Suma meses de calendario; si el día no existe en el mes de llegada, usa el último día de ese mes. */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const total = (m - 1) + months;
  const year = y + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(Math.min(d, lastDay)).padStart(2, '0')}`;
}

/** Días de calendario desde `from` hasta `to` (negativo si `to` es anterior). */
export function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
}

/** Primera asesoría vigente de la matrícula (la que no está cancelada). */
export function firstSessionOf(enrollmentId: string, schedules: Schedule[]): Schedule | undefined {
  return schedules
    .filter(s => s.isFirst && s.enrollmentId === enrollmentId && s.status !== 'Cancelado')
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0];
}

export interface Validity {
  state: ValidityState;
  /** Fecha de la primera asesoría. */
  start?: string;
  /** Último día de la duración base. */
  baseEnd?: string;
  /** Último día con la extensión. */
  extensionEnd?: string;
  baseMonths: number;
  extensionMonths: number;
  extensionEnabled: boolean;
  /** Días que faltan para terminar la duración base (0 = hoy es el último día; negativo = ya terminó). */
  daysToBaseEnd?: number;
  /** ¿Aparece para programarle asesorías? */
  working: boolean;
  /** Último día en que se le puede programar una asesoría (undefined si no se puede calcular). */
  limit?: string;
}

export function enrollmentValidity(
  enrollment: Pick<Enrollment, 'id' | 'extensionEnabledAt'>,
  program: Pick<Program, 'durationBase' | 'warranty'> | undefined,
  schedules: Schedule[],
  today: string
): Validity {
  const baseMonths = program?.durationBase ?? 0;
  const extensionMonths = program?.warranty ?? 0;
  const extensionEnabled = !!enrollment.extensionEnabledAt;
  const first = firstSessionOf(enrollment.id, schedules);
  const base = { baseMonths, extensionMonths, extensionEnabled };
  if (!program || !first) return { ...base, state: 'sin-inicio', working: true };

  const start = first.date;
  const baseEnd = addDaysISO(addMonths(start, baseMonths), -1);
  const extensionEnd = addDaysISO(addMonths(start, baseMonths + extensionMonths), -1);
  const daysToBaseEnd = daysBetween(today, baseEnd);
  const limit = extensionEnabled ? extensionEnd : baseEnd;
  const dates = { ...base, start, baseEnd, extensionEnd, daysToBaseEnd, limit };

  if (today < start) return { ...dates, state: 'por-iniciar', working: true };
  if (today <= baseEnd) {
    // Con la extensión ya habilitada no hay nada que decidir: no se alerta
    const alert = !extensionEnabled && daysToBaseEnd <= EXPIRY_ALERT_DAYS;
    return { ...dates, state: alert ? 'por-vencer' : 'vigente', working: true };
  }
  if (today > extensionEnd) return { ...dates, state: 'finalizada', working: false };
  return extensionEnabled ? { ...dates, state: 'extension', working: true } : { ...dates, state: 'base-finalizada', working: false };
}

/** El botón «Habilitar extensión» solo aplica si hay garantía, no se habilitó y la matrícula está por vencer o ya terminó la base. */
export const canEnableExtension = (v: Validity): boolean =>
  !v.extensionEnabled && v.extensionMonths > 0 && (v.state === 'por-vencer' || v.state === 'base-finalizada');

interface Catalog {
  enrollments: Enrollment[];
  programs: Program[];
  schedules: Schedule[];
}

const ownEnrollments = (student: Pick<Student, 'id' | 'name'>, enrollments: Enrollment[]) =>
  enrollments.filter(e => e.studentId === student.id || e.student === student.name);

const programOf = (e: Enrollment, programs: Program[]) =>
  programs.find(p => p.id === e.programId) ?? programs.find(p => p.name === e.program);

/** Vigencia de cada matrícula activa del alumno. */
export function studentValidities(student: Pick<Student, 'id' | 'name'>, c: Catalog, today: string) {
  return ownEnrollments(student, c.enrollments)
    .filter(e => e.status === 'Activa')
    .map(e => ({ enrollment: e, validity: enrollmentValidity(e, programOf(e, c.programs), c.schedules, today) }));
}

/**
 * ¿Aparece el alumno para programarle asesorías y actividades? Sí si está activo y tiene al menos una matrícula activa
 * vigente (o sin inicio, o en extensión). Sin matrículas registradas no se altera su comportamiento.
 */
export function isStudentWorkable(student: Pick<Student, 'id' | 'name' | 'status'>, c: Catalog, today: string): boolean {
  if (student.status !== 'Activo') return false;
  if (ownEnrollments(student, c.enrollments).length === 0) return true;
  return studentValidities(student, c, today).some(x => x.validity.working);
}

/**
 * Último día en que se le puede programar una asesoría: el más lejano entre sus matrículas vigentes.
 * undefined si no hay límite calculable (p. ej. una matrícula sin primera asesoría vinculada).
 */
export function studentLimit(student: Pick<Student, 'id' | 'name'>, c: Catalog, today: string): string | undefined {
  const working = studentValidities(student, c, today).filter(x => x.validity.working);
  if (working.length === 0 || working.some(x => !x.validity.limit)) return undefined;
  return working.map(x => x.validity.limit!).sort().pop();
}

/** Alumno cuya matrícula más cercana está por vencer (para avisar sin salir de Programación). */
export function studentExpiring(student: Pick<Student, 'id' | 'name'>, c: Catalog, today: string): Validity | undefined {
  return studentValidities(student, c, today).map(x => x.validity).find(v => v.state === 'por-vencer');
}

/** Conteo por estado de las matrículas activas (para los filtros y el Dashboard). */
export function validityCounts(c: Catalog, today: string): Record<ValidityState, number> {
  const counts = Object.fromEntries((Object.keys(VALIDITY_LABEL) as ValidityState[]).map(k => [k, 0])) as Record<ValidityState, number>;
  for (const e of c.enrollments) {
    if (e.status !== 'Activa') continue;
    counts[enrollmentValidity(e, programOf(e, c.programs), c.schedules, today).state]++;
  }
  return counts;
}

export { programOf };
