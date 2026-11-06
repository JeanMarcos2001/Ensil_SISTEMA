/**
 * Acceso al sistema del personal (funciones puras): cómo se vincula una cuenta de Usuarios con la ficha de Personal.
 *
 * Reglas:
 *  - La cuenta nace DE la ficha: nombre, documento y teléfono salen de Personal (se editan allí, no en Usuarios) y las sedes
 *    salen de las asignaciones activas. Un trabajador tiene como máximo UNA cuenta.
 *  - Solo el personal ACTIVO, con una asignación activa marcada «con acceso al sistema», puede tener cuenta. El rol de la cuenta se
 *    elige una sola vez, en Usuarios (no se sugiere desde la asignación).
 *  - La sede principal de la cuenta es la de su asignación principal; las adicionales, las de sus otras asignaciones con acceso.
 *  - Al INACTIVAR al trabajador, su cuenta se desactiva sola (con constancia). Al reactivarlo, la cuenta NO se reactiva sola:
 *    se hace a propósito en Usuarios (no se devuelve un acceso sin que alguien lo decida).
 *  - Si cambian sus asignaciones, la sede de la cuenta se corrige para no quedar en una sede donde ya no trabaja.
 *  - Las cuentas sin ficha (administradores externos) siguen existiendo, sin estas restricciones.
 */
import type { Assignment, Staff, User } from '../context/DataContext';

export const staffDisplayName = (s: Pick<Staff, 'names' | 'lastNameP'>) => `${s.names} ${s.lastNameP}`.replace(/\s+/g, ' ').trim();

export const userOfStaff = (staffId: string, users: User[]): User | undefined => users.find(u => u.staffId === staffId);

/** Asignaciones activas que dan acceso (principal primero). */
export function accessAssignments(staffId: string, assignments: Assignment[]): Assignment[] {
  return assignments
    .filter(a => a.staffId === staffId && a.status === 'Activa' && a.hasAccess)
    .sort((a, b) => Number(b.isMain) - Number(a.isMain) || a.startDate.localeCompare(b.startDate));
}

export interface AccessCheck {
  /** ¿Se le puede crear una cuenta ahora? */
  ok: boolean;
  reasons: string[];
  /** Sede principal propuesta (la de su asignación principal con acceso). */
  mainBranch: string;
  /** Sedes de todas sus asignaciones con acceso (la principal primero). */
  branches: string[];
}

export function accessCheck(staff: Staff, assignments: Assignment[], users: User[]): AccessCheck {
  const reasons: string[] = [];
  const own = accessAssignments(staff.id, assignments);
  const existing = userOfStaff(staff.id, users);
  if (staff.status !== 'Activo') reasons.push('El trabajador está inactivo.');
  if (existing) reasons.push(`Ya tiene la cuenta ${existing.id}.`);
  if (own.length === 0) {
    const anyActive = assignments.some(a => a.staffId === staff.id && a.status === 'Activa');
    reasons.push(anyActive ? 'Sus asignaciones activas están marcadas «sin acceso al sistema».' : 'No tiene una asignación activa: defina su lugar de trabajo y su área en Personas → Asignaciones.');
  }
  const branches = [...new Set(own.map(a => a.branch))];
  return {
    ok: reasons.length === 0, reasons, mainBranch: branches[0] ?? '', branches,
  };
}

export interface LinkedDefaults {
  name: string;
  document: string;
  phone: string;
  branch: string;
  additionalBranches: string[];
}

/** Datos con los que se abre la cuenta de un trabajador. */
export function defaultsFromStaff(staff: Staff, assignments: Assignment[], users: User[]): LinkedDefaults {
  const check = accessCheck(staff, assignments, users);
  return { name: staffDisplayName(staff), document: staff.docNumber, phone: staff.phone, branch: check.mainBranch, additionalBranches: check.branches.slice(1) };
}

export interface UserInput {
  staffId?: string;
  email: string;
  role: string;
  branch: string;
  additionalBranches?: string[];
  status: string;
}

/** Validación de una cuenta vinculada a una ficha (las cuentas sin ficha no se validan aquí). */
export function validateLinkedUser(input: UserInput, staff: Staff[], assignments: Assignment[], users: User[], editingId?: string): string[] {
  if (!input.staffId) return [];
  const e: string[] = [];
  const member = staff.find(s => s.id === input.staffId);
  if (!member) return ['No se encontró la ficha de personal.'];
  if (users.some(u => u.id !== editingId && u.staffId === member.id)) e.push(`${staffDisplayName(member)} ya tiene una cuenta: un trabajador tiene una sola.`);
  if (input.status === 'Activo' && member.status !== 'Activo') e.push(`${staffDisplayName(member)} está inactivo: reactívelo en Personas → Personal antes de activar su cuenta.`);
  const allowed = accessAssignments(member.id, assignments).map(a => a.branch);
  if (input.status === 'Activo' && allowed.length === 0) e.push('No tiene una asignación activa con acceso al sistema (Personas → Asignaciones).');
  if (allowed.length > 0) {
    if (!allowed.includes(input.branch)) e.push(`La sede principal debe ser una de sus asignaciones activas: ${allowed.join(', ')}.`);
    const extra = (input.additionalBranches ?? []).filter(b => !allowed.includes(b));
    if (extra.length > 0) e.push(`No tiene asignación en: ${extra.join(', ')}.`);
  }
  return e;
}

/**
 * Cambios que hay que aplicar a una cuenta vinculada para que siga de acuerdo con la ficha y las asignaciones.
 * null si ya está al día.
 */
export function syncPatch(user: User, staff: Staff, assignments: Assignment[]): Partial<User> | null {
  const patch: Partial<User> = {};
  const name = staffDisplayName(staff);
  if (user.name !== name) patch.name = name;
  if ((user.document ?? '') !== staff.docNumber) patch.document = staff.docNumber;
  if ((user.phone ?? '') !== staff.phone) patch.phone = staff.phone;
  const allowed = accessAssignments(staff.id, assignments).map(a => a.branch);
  if (allowed.length > 0) {
    const branch = allowed.includes(user.branch) ? user.branch : allowed[0];
    if (branch !== user.branch) patch.branch = branch;
    const extra = (user.additionalBranches ?? []).filter(b => allowed.includes(b) && b !== branch);
    if (extra.length !== (user.additionalBranches ?? []).length) patch.additionalBranches = extra;
  }
  return Object.keys(patch).length > 0 ? patch : null;
}

/** Nota que deja la desactivación automática de la cuenta al inactivar al trabajador. */
export const deactivationNote = (date: string, note: string): string => `Se desactivó al inactivar al trabajador el ${date} (${note}).`;
