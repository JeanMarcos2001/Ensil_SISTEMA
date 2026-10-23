/**
 * Corrección de datos de una matrícula ya registrada (funciones puras).
 *
 * Una matrícula registrada no se «edita» libremente: cada dato pertenece a algo distinto y cambiarlo tiene consecuencias.
 *  - Datos de la **persona** (documento, nombres, teléfono…): se corrigen en Personas (alumno / titular), una sola vez para todas sus matrículas.
 *  - Datos **comerciales y financieros** (programa, nivel, tarifario, tipo de pago, precio, promoción, cuotas): NO se editan aquí; cambian el
 *    precio, el plan, la caja y las recetas de entrega. Se hacen con sus propios flujos (refinanciar una cuota, solicitar la caída, y a futuro
 *    cambio de programa / traslado de sede).
 *  - Datos **administrativos** de la matrícula: sí se pueden corregir, con motivo y dejando constancia de quién, cuándo, qué había y qué quedó:
 *    observación general, origen del contacto, responsable de la entrevista y horario de clases del alumno.
 */
import type { Enrollment, Student } from '../context/DataContext';
import { MIN_DETAIL } from './enrollmentDrop';

export interface EnrollmentEditValues {
  observation: string;
  originId: string;
  advisorId: string;
  /** Horario de clases (se guarda en la ficha del alumno). */
  schedule: string;
}

export const EDIT_LABELS: Record<keyof EnrollmentEditValues, string> = {
  observation: 'Observación general',
  originId: 'Origen del contacto',
  advisorId: 'Responsable de la entrevista',
  schedule: 'Horario de clases',
};

export const currentEditValues = (e: Enrollment, student?: Pick<Student, 'horario'>): EnrollmentEditValues => ({
  observation: e.observation ?? '',
  originId: e.origenId ?? '',
  advisorId: e.asesorId ?? '',
  schedule: student?.horario ?? '',
});

export interface FieldChange {
  field: keyof EnrollmentEditValues;
  label: string;
  from: string;
  to: string;
}

/** Qué campos cambiaron (con nombres legibles para el historial). `names` traduce los ids de origen y responsable. */
export function diffEnrollmentEdit(
  before: EnrollmentEditValues,
  after: EnrollmentEditValues,
  names: { origin: (id: string) => string; advisor: (id: string) => string }
): FieldChange[] {
  const show = (field: keyof EnrollmentEditValues, v: string) =>
    field === 'originId' ? names.origin(v) : field === 'advisorId' ? names.advisor(v) : v.trim();
  return (Object.keys(EDIT_LABELS) as (keyof EnrollmentEditValues)[])
    .filter(f => before[f].trim() !== after[f].trim())
    .map(f => ({ field: f, label: EDIT_LABELS[f], from: show(f, before[f]) || '—', to: show(f, after[f]) || '—' }));
}

export function validateEnrollmentEdit(enrollment: Enrollment, after: EnrollmentEditValues, changes: FieldChange[], reason: string): string[] {
  const e: string[] = [];
  if (enrollment.status !== 'Activa') e.push('Solo se pueden corregir los datos de una matrícula activa.');
  if (!after.originId) e.push('El origen del contacto es obligatorio.');
  if (!after.advisorId) e.push('El responsable de la entrevista es obligatorio.');
  if (e.length === 0 && changes.length === 0) e.push('No hay cambios que guardar.');
  if (changes.length > 0 && reason.trim().length < MIN_DETAIL) e.push('Indique el motivo de la corrección: queda como constancia.');
  return e;
}

/** Cambios para la matrícula (el horario va a la ficha del alumno). */
export function buildEnrollmentPatch(
  after: EnrollmentEditValues,
  names: { origin: (id: string) => string; advisor: (id: string) => string }
): Partial<Enrollment> {
  return {
    observation: after.observation.trim() || undefined,
    origenId: after.originId,
    origen: names.origin(after.originId),
    asesorId: after.advisorId,
    asesor: names.advisor(after.advisorId),
  };
}
