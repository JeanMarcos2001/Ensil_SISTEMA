/**
 * Identidad de las personas y de la matrícula (funciones puras): «el id manda, el nombre se muestra».
 *
 * Reglas del modelo de datos:
 *  1. Las relaciones se hacen SOLO por id (`guardianIds`, `studentId`, `enrollmentId`, `branchId`, `programId`).
 *  2. Lo que se puede calcular NO se guarda: titular de un alumno o de un plan, estado del alumno, programa y nivel vigentes,
 *     edad, y contadores y saldo del titular. Si se guardaran, se desactualizarían solos.
 *  3. Hay dos clases de nombres guardados, y las dos tienen una regla única:
 *       · **Copia de visualización** de un registro vivo (`Enrollment.student`, `Schedule.student`, `Enrollment.sede/program/level`):
 *         existe para listar y buscar sin cruces; se corrige en un solo lugar (`syncStudentName`, `syncCatalogLabels`) cada vez que
 *         cambia el nombre de origen.
 *       · **Constancia** de un documento ya emitido (`Payment.student`, notas de crédito, contrato y ficha generados): conserva lo
 *         que decía el día de la emisión y NO se reescribe, porque un comprobante no cambia aunque la persona cambie de nombre.
 */
import type { Branch, Enrollment, Guardian, Level, Plan, Program, Schedule, Staff, Student } from '../context/DataContext';
import { ageOn } from './dates';

// ---------------------------------------------------------------- Titular

/** Titular principal del alumno: el primero de sus vínculos. `undefined` si es independiente. */
export const holderOfStudent = (student: Pick<Student, 'guardianIds'> | undefined, guardians: Guardian[]): Guardian | undefined =>
  guardians.find(g => g.id === student?.guardianIds?.[0]);

/** Nombre del titular del alumno; un alumno independiente es su propio titular. */
export const holderNameOfStudent = (student: Pick<Student, 'guardianIds' | 'name'> | undefined, guardians: Guardian[]): string =>
  holderOfStudent(student, guardians)?.name ?? student?.name ?? '';

/** Titular que firmó la matrícula (el de la matrícula y, si no lo trae, el del alumno). */
export function holderOfEnrollment(
  enrollment: Pick<Enrollment, 'guardianIds' | 'studentId'> | undefined, students: Student[], guardians: Guardian[]
): Guardian | undefined {
  const own = guardians.find(g => g.id === enrollment?.guardianIds?.[0]);
  return own ?? holderOfStudent(students.find(s => s.id === enrollment?.studentId), guardians);
}

export function holderNameOfEnrollment(
  enrollment: Pick<Enrollment, 'guardianIds' | 'studentId' | 'student'> | undefined, students: Student[], guardians: Guardian[]
): string {
  return holderOfEnrollment(enrollment, students, guardians)?.name ?? enrollment?.student ?? '';
}

/** Titular de un plan: el de su matrícula (`plan.mat`). */
export function holderNameOfPlan(plan: Pick<Plan, 'mat'>, enrollments: Enrollment[], students: Student[], guardians: Guardian[]): string {
  return holderNameOfEnrollment(enrollments.find(e => e.id === plan.mat), students, guardians);
}

/** Alumnos a cargo de un titular. */
export const studentsOfGuardian = (guardian: Pick<Guardian, 'id'>, students: Student[]): Student[] =>
  students.filter(s => s.guardianIds?.includes(guardian.id));

// ---------------------------------------------------------------- Matrícula más reciente, estado y programa

/** Matrículas de un alumno (por id), de la más antigua a la más reciente. */
export const enrollmentsOfStudent = (studentId: string, enrollments: Enrollment[]): Enrollment[] =>
  enrollments.filter(e => e.studentId === studentId).sort((a, b) => a.dateISO.localeCompare(b.dateISO) || a.id.localeCompare(b.id));

/** Matrícula más reciente del alumno. */
export const latestEnrollmentOf = (studentId: string, enrollments: Enrollment[]): Enrollment | undefined =>
  enrollmentsOfStudent(studentId, enrollments).pop();

export type StudentStatus = 'Activo' | 'Inactivo' | 'Sin matrícula';
export const STUDENT_STATUSES: readonly StudentStatus[] = ['Activo', 'Inactivo', 'Sin matrícula'];
export const NO_ENROLLMENT: StudentStatus = 'Sin matrícula';

/** Estado del alumno: Activo con alguna matrícula activa, Inactivo si todas cayeron y «Sin matrícula» si no tiene. */
export function studentStatus(studentId: string, enrollments: Enrollment[]): StudentStatus {
  const own = enrollments.filter(e => e.studentId === studentId);
  if (own.length === 0) return NO_ENROLLMENT;
  return own.some(e => e.status === 'Activa') ? 'Activo' : 'Inactivo';
}

/** «Kids - Nivel 1» (o solo el programa si no tiene nivel). */
export const programLabelOf = (e: Pick<Enrollment, 'program' | 'level'>): string =>
  e.level && e.level !== 'Sin nivel' ? `${e.program} - ${e.level}` : e.program;

/** Programa y nivel vigentes del alumno = los de su matrícula más reciente. Vacío si no tiene. */
export const studentProgramOf = (studentId: string, enrollments: Enrollment[]): string => {
  const latest = latestEnrollmentOf(studentId, enrollments);
  return latest ? programLabelOf(latest) : '';
};

// ---------------------------------------------------------------- Edad

/** Edad del alumno a una fecha; `null` si no se registró su nacimiento. */
export const studentAge = (student: Pick<Student, 'birthDate'>, today: string): number | null =>
  student.birthDate ? ageOn(student.birthDate, today) : null;

export const staffAge = (member: Pick<Staff, 'birthDate'>, today: string): number | null =>
  member.birthDate ? ageOn(member.birthDate, today) : null;

/** «8 años» (o «—» si no hay fecha de nacimiento). */
export const ageText = (age: number | null): string => (age === null || age < 0 ? '—' : `${age} ${age === 1 ? 'año' : 'años'}`);

// ---------------------------------------------------------------- Copias de nombre: una sola puerta de corrección

/** Corrige el nombre de un alumno en los registros vivos que lo copian (matrículas y agenda). */
export function syncStudentName(
  studentId: string, name: string, enrollments: Enrollment[], schedules: Schedule[]
): { enrollments: Enrollment[]; schedules: Schedule[]; changed: boolean } {
  let changed = false;
  const nextEnrollments = enrollments.map(e => {
    if (e.studentId !== studentId || e.student === name) return e;
    changed = true;
    return { ...e, student: name };
  });
  const nextSchedules = schedules.map(s => {
    if (s.studentId !== studentId || s.student === name) return s;
    changed = true;
    return { ...s, student: name };
  });
  return { enrollments: nextEnrollments, schedules: nextSchedules, changed };
}

export interface CatalogLabels {
  branches: Pick<Branch, 'id' | 'name'>[];
  programs: Pick<Program, 'id' | 'name'>[];
  levels: Pick<Level, 'id' | 'name'>[];
}

/**
 * Corrige el nombre de la sede, el programa y el nivel que la matrícula y la agenda copian (se llama al renombrar un catálogo).
 * Si el id ya no existe, el texto se deja como estaba: el registro conserva lo que decía.
 */
export function syncCatalogLabels(
  enrollments: Enrollment[], schedules: Schedule[], catalogs: CatalogLabels
): { enrollments: Enrollment[]; schedules: Schedule[] } {
  const branchName = (id?: string) => catalogs.branches.find(b => b.id === id)?.name;
  const programName = (id?: string) => catalogs.programs.find(p => p.id === id)?.name;
  const levelName = (id?: string) => catalogs.levels.find(l => l.id === id)?.name;
  return {
    enrollments: enrollments.map(e => {
      const sede = branchName(e.branchId) ?? e.sede;
      const program = programName(e.programId) ?? e.program;
      const level = e.levelId ? levelName(e.levelId) ?? e.level : e.level;
      return sede === e.sede && program === e.program && level === e.level ? e : { ...e, sede, program, level };
    }),
    schedules: schedules.map(s => {
      const enrollment = s.enrollmentId ? enrollments.find(e => e.id === s.enrollmentId) : undefined;
      if (!enrollment) return s;
      const program = programName(enrollment.programId) ?? s.program;
      const level = enrollment.levelId ? levelName(enrollment.levelId) ?? s.level : s.level;
      return program === s.program && level === s.level ? s : { ...s, program, level };
    }),
  };
}
