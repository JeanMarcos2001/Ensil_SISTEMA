/**
 * Reglas de la ficha del trabajador (funciones puras). Los trabajadores no tienen correo institucional:
 * el único correo es el personal (opcional).
 */
import type { Staff } from '../context/DataContext';
import { ageOn, validateDocument, type DocType } from './enrollment';

export const STAFF_DOC_TYPES: DocType[] = ['DNI', 'CE', 'Pasaporte'];
export const GENDERS = ['Masculino', 'Femenino', 'Otro'];
export const CIVIL_STATUSES = ['Soltero(a)', 'Casado(a)', 'Conviviente', 'Divorciado(a)', 'Viudo(a)'];
export const EDUCATION_LEVELS = ['Técnico', 'Universitario', 'Licenciado', 'Magíster', 'Doctor'];
export const MIN_STAFF_AGE = 18;
export const MAX_STAFF_AGE = 80;
export const MAX_CHILDREN = 20;

export interface StaffForm {
  docType: DocType;
  docNumber: string;
  gender: string;
  names: string;
  lastNameP: string;
  lastNameM: string;
  birthDate: string;
  civilStatus: string;
  hasChildren: boolean;
  childrenCount: string;
  phone: string;
  personalEmail: string;
  address: string;
  educationLevel: string;
  profession: string;
  specialty: string;
  observations: string;
}

export type StaffErrors = Partial<Record<keyof StaffForm, string>>;

export const emptyStaffForm = (): StaffForm => ({
  docType: 'DNI', docNumber: '', gender: '', names: '', lastNameP: '', lastNameM: '', birthDate: '', civilStatus: '',
  hasChildren: false, childrenCount: '', phone: '', personalEmail: '', address: '', educationLevel: '', profession: '',
  specialty: '', observations: '',
});

export const staffToForm = (s: Staff): StaffForm => ({
  docType: (s.docType as DocType) || 'DNI', docNumber: s.docNumber, gender: s.gender ?? '', names: s.names, lastNameP: s.lastNameP,
  lastNameM: s.lastNameM, birthDate: s.birthDate, civilStatus: s.civilStatus ?? '', hasChildren: !!s.hasChildren,
  childrenCount: s.hasChildren && s.childrenCount ? String(s.childrenCount) : '', phone: s.phone, personalEmail: s.personalEmail ?? '',
  address: s.address ?? '', educationLevel: s.educationLevel ?? '', profession: s.profession ?? '', specialty: s.specialty ?? '',
  observations: s.observations ?? '',
});

const NAME_RE = /^[\p{L}][\p{L}\s'.-]*$/u;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Errores por campo (vacío = válido). */
export function validateStaffForm(f: StaffForm, staff: Staff[], today: string, editingId?: string): StaffErrors {
  const e: StaffErrors = {};
  const doc = validateDocument(f.docType, f.docNumber);
  if (doc) e.docNumber = doc;
  else if (staff.some(s => s.id !== editingId && s.docNumber.trim().toLowerCase() === f.docNumber.trim().toLowerCase())) {
    e.docNumber = 'Este documento ya está registrado en el personal.';
  }
  if (!f.gender) e.gender = 'Seleccione el género.';
  if (!f.names.trim()) e.names = 'Los nombres son obligatorios.';
  else if (!NAME_RE.test(f.names.trim())) e.names = 'Solo letras y espacios.';
  if (!f.lastNameP.trim()) e.lastNameP = 'El apellido paterno es obligatorio.';
  else if (!NAME_RE.test(f.lastNameP.trim())) e.lastNameP = 'Solo letras y espacios.';
  if (f.lastNameM.trim() && !NAME_RE.test(f.lastNameM.trim())) e.lastNameM = 'Solo letras y espacios.';
  if (!f.birthDate) e.birthDate = 'La fecha de nacimiento es obligatoria.';
  else if (f.birthDate > today) e.birthDate = 'La fecha de nacimiento no puede ser futura.';
  else {
    const age = ageOn(f.birthDate, today) ?? 0;
    if (age < MIN_STAFF_AGE) e.birthDate = `El trabajador debe ser mayor de ${MIN_STAFF_AGE} años.`;
    else if (age > MAX_STAFF_AGE) e.birthDate = 'Revise la fecha de nacimiento.';
  }
  if (!f.civilStatus) e.civilStatus = 'Seleccione el estado civil.';
  if (f.hasChildren) {
    const n = Number(f.childrenCount);
    if (!Number.isInteger(n) || n < 1 || n > MAX_CHILDREN) e.childrenCount = `Indique cuántos hijos (1 a ${MAX_CHILDREN}).`;
  }
  if (!/^9\d{8}$/.test(f.phone.trim())) e.phone = 'El celular debe tener 9 dígitos y empezar con 9.';
  if (f.personalEmail.trim() && !EMAIL_RE.test(f.personalEmail.trim())) e.personalEmail = 'El correo no es válido.';
  if (f.address.trim().length < 5) e.address = 'Indique la dirección completa.';
  if (!f.educationLevel) e.educationLevel = 'Seleccione el grado de instrucción.';
  if (!f.profession.trim()) e.profession = 'La profesión es obligatoria.';
  return e;
}

/** Siguiente código correlativo de seis dígitos («000003»). */
export function nextStaffCode(staff: Pick<Staff, 'code'>[]): string {
  const max = staff.reduce((m, s) => Math.max(m, parseInt(s.code, 10) || 0), 0);
  return String(max + 1).padStart(6, '0');
}

/** Ficha lista para guardar (la edad se calcula de la fecha de nacimiento). */
export function buildStaff(f: StaffForm, today: string, base?: Pick<Staff, 'code' | 'status'>, staff: Pick<Staff, 'code'>[] = []): Omit<Staff, 'id'> {
  return {
    code: base?.code ?? nextStaffCode(staff),
    status: base?.status ?? 'Activo',
    docType: f.docType,
    docNumber: f.docNumber.trim(),
    names: f.names.trim(),
    lastNameP: f.lastNameP.trim(),
    lastNameM: f.lastNameM.trim(),
    birthDate: f.birthDate,
    age: ageOn(f.birthDate, today) ?? 0,
    gender: f.gender,
    civilStatus: f.civilStatus,
    hasChildren: f.hasChildren,
    childrenCount: f.hasChildren ? Number(f.childrenCount) : 0,
    educationLevel: f.educationLevel,
    profession: f.profession.trim(),
    specialty: f.specialty.trim() || undefined,
    phone: f.phone.trim(),
    personalEmail: f.personalEmail.trim() || undefined,
    address: f.address.trim(),
    observations: f.observations.trim() || undefined,
  };
}
