/**
 * Alta y edición de alumnos y titulares desde Personas (funciones puras). Usa las mismas reglas y la misma forma de datos
 * que el asistente de matrícula, para que una persona creada aquí sea idéntica a una creada al matricular.
 *
 * Modelo (cómo se conectan):
 *  - Titular (Guardian): datos de la persona + dirección + estado civil. Un titular puede tener varios alumnos.
 *  - Alumno (Student): datos de la persona + situación (estudia / trabaja) + `guardianIds` (el primero es el titular
 *    principal) + `relationship` (parentesco con el titular). El parentesco es del vínculo alumno–titular, por eso vive en el alumno.
 *  - Un alumno independiente es su propio titular: `guardianIds` vacío, `titular` = su nombre y su teléfono es obligatorio.
 *  - Un alumno dependiente no tiene teléfono propio: el contacto es el del titular.
 *  - Programa, nivel, horario y sede salen de su matrícula; el alumno creado aquí queda «Sin matrícula» hasta matricularse.
 */
import type { Guardian, Student } from '../context/DataContext';
import {
  ageOn,
  emptyPerson,
  fullName,
  situationData,
  validatePerson,
  validateStudentSituation,
  type DocType,
  type DraftPerson,
  type DraftStudent,
  type Situation,
} from './enrollment';

export const MIN_GUARDIAN_AGE = 18;
export const NO_ENROLLMENT = 'Sin matrícula';
export const RELATIONSHIPS = ['Hijo(a)', 'Nieto(a)', 'Sobrino(a)', 'Hermano(a)', 'Otro familiar', 'Otro'];

export type StudentMode = 'apoderado' | 'independiente';

// ---------------------------------------------------------------- Titulares

const splitName = (name: string) => {
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 1) return { names: parts[0] ?? '', lastNameP: '', lastNameM: '' };
  if (parts.length === 2) return { names: parts[0], lastNameP: parts[1], lastNameM: '' };
  return { names: parts.slice(0, parts.length - 2).join(' '), lastNameP: parts[parts.length - 2], lastNameM: parts[parts.length - 1] };
};

/** Titular guardado → formulario. Si es un registro antiguo sin nombres separados, se deduce del nombre completo. */
export function guardianToPerson(g: Guardian): DraftPerson {
  const parts = g.names || g.lastNameP ? { names: g.names ?? '', lastNameP: g.lastNameP ?? '', lastNameM: g.lastNameM ?? '' } : splitName(g.name);
  return {
    ...emptyPerson(), source: 'nuevo', docType: (g.docType as DocType) || 'DNI', docNumber: g.doc, ...parts,
    birthDate: g.birthDate ?? '', phone: g.phone, email: g.email, address: g.direccion ?? '', civilStatus: g.civilStatus ?? '',
  };
}

export function validateGuardian(person: DraftPerson, guardians: Guardian[], today: string, editingId?: string): string[] {
  const e = validatePerson(person, 'Titular', today, { needsPhone: true, needsAddress: true, needsCivilStatus: true });
  if (person.birthDate && person.birthDate <= today && (ageOn(person.birthDate, today) ?? 0) < MIN_GUARDIAN_AGE) {
    e.push(`Titular: debe ser mayor de ${MIN_GUARDIAN_AGE} años.`);
  }
  if (person.docNumber.trim() && guardians.some(g => g.id !== editingId && g.doc === person.docNumber.trim())) {
    e.push(`Titular: el documento ${person.docNumber.trim()} ya está registrado.`);
  }
  return e;
}

export function buildGuardian(p: DraftPerson): Omit<Guardian, 'id' | 'students' | 'enrollments' | 'balance'> {
  return {
    name: fullName(p), doc: p.docNumber.trim(), phone: p.phone.trim(), email: p.email.trim(), direccion: p.address.trim(),
    docType: p.docType, names: p.names.trim(), lastNameP: p.lastNameP.trim(), lastNameM: p.lastNameM.trim(),
    birthDate: p.birthDate, civilStatus: p.civilStatus,
  };
}

// ---------------------------------------------------------------- Alumnos

export interface StudentInput {
  mode: StudentMode;
  /** Datos de la persona, parentesco y situación (la misma forma que en el asistente). */
  student: DraftStudent;
  /** Titulares (el primero es el principal). Solo en modo apoderado. */
  guardianIds: string[];
}

export function studentToInput(s: Student, guardians: Guardian[]): StudentInput {
  const independent = !s.guardianIds || s.guardianIds.length === 0;
  const parts = s.names || s.lastNameP ? { names: s.names ?? '', lastNameP: s.lastNameP ?? '', lastNameM: s.lastNameM ?? '' } : splitName(s.name);
  return {
    mode: independent ? 'independiente' : 'apoderado',
    guardianIds: (s.guardianIds ?? []).filter(id => guardians.some(g => g.id === id)),
    student: {
      key: s.id,
      person: {
        ...emptyPerson(), source: 'nuevo', docType: (s.docType as DocType) || 'DNI', docNumber: s.doc, ...parts,
        birthDate: s.birthDate ?? '', phone: s.phone ?? '', email: s.email ?? '', address: s.address ?? '',
      },
      relationship: s.relationship ?? '',
      situation: (s.occupationStatus ?? (s.colegio || s.grado ? 'estudiando' : '')) as Situation | '',
      institutionType: s.institutionType ?? (s.colegio ? 'Colegio' : ''),
      school: s.colegio ?? '', grade: s.grado ?? '', occupation: s.occupation ?? '', workplace: s.workplace ?? '',
      programId: '', levelId: '', paymentTypeId: '', schedule: '', startDate: '', counselingDate: '', counselingTime: '', dueDates: [],
    },
  };
}

export function validateStudentInput(input: StudentInput, students: Student[], guardians: Guardian[], today: string, editingId?: string): string[] {
  const { mode, student: ds, guardianIds } = input;
  const label = 'Alumno';
  const e: string[] = [];
  if (mode === 'apoderado') {
    if (guardianIds.length === 0) e.push(`${label}: seleccione al menos un titular, o cambie a «Independiente».`);
    else if (guardianIds.some(id => !guardians.some(g => g.id === id))) e.push(`${label}: algún titular elegido ya no existe.`);
    if (!ds.relationship) e.push(`${label}: indique el parentesco con el titular.`);
  }
  // Un independiente es su propio titular: necesita teléfono; un dependiente no lo tiene
  e.push(...validatePerson(ds.person, label, today, mode === 'independiente' ? { needsPhone: true } : {}));
  e.push(...validateStudentSituation(ds, label));
  if (ds.person.docNumber.trim() && students.some(s => s.id !== editingId && s.doc === ds.person.docNumber.trim())) {
    e.push(`${label}: el documento ${ds.person.docNumber.trim()} ya está registrado.`);
  }
  return e;
}

/** Alumno listo para guardar (sin id). Al crearlo queda «Sin matrícula»; al editarlo se conservan programa, horario y estado. */
export function buildStudent(
  input: StudentInput, guardians: Guardian[], today: string, existing?: Pick<Student, 'program' | 'horario' | 'fechaInicio' | 'status'>
): Omit<Student, 'id'> {
  const { mode, student: ds, guardianIds } = input;
  const p = ds.person;
  const ids = mode === 'apoderado' ? guardianIds : [];
  const principal = guardians.find(g => g.id === ids[0]);
  return {
    doc: p.docNumber.trim(), docType: p.docType, name: fullName(p),
    names: p.names.trim(), lastNameP: p.lastNameP.trim(), lastNameM: p.lastNameM.trim(),
    birthDate: p.birthDate, age: p.birthDate ? (ageOn(p.birthDate, today) ?? 0) : 0,
    phone: mode === 'apoderado' ? '' : p.phone.trim(), email: p.email.trim(), address: p.address.trim(),
    guardianIds: ids, relationship: mode === 'apoderado' ? ds.relationship : '',
    titular: mode === 'apoderado' ? principal?.name ?? '' : fullName(p),
    ...situationData(ds),
    program: existing?.program ?? '', horario: existing?.horario, fechaInicio: existing?.fechaInicio,
    status: existing?.status ?? NO_ENROLLMENT,
  };
}
