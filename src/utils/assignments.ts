/**
 * Asignaciones del personal (funciones puras).
 *
 * Una asignación vincula a un trabajador con una sede, un área y un cargo. De ellas salen los responsables de la entrevista
 * y de las asesorías (área Psicopedagogía) y los verificadores de la sede, así que crearlas, editarlas y cerrarlas tiene
 * efecto en esas listas. Reglas:
 *  - solo el personal activo recibe asignaciones; un trabajador no repite sede + área mientras la anterior siga activa;
 *  - cada trabajador tiene UNA asignación principal; la primera lo es siempre y, si se marca otra, la anterior pasa a secundaria;
 *  - una asignación no se borra: se CIERRA con fecha y motivo (queda en el historial) y, si era la principal, la activa más
 *    antigua pasa a ser la principal;
 *  - no se cierra la última asignación de Psicopedagogía de quien tiene asesorías futuras: primero se reasignan.
 */
import type { Assignment, Branch, Schedule, Staff } from '../context/DataContext';
import { INTERVIEWER_AREA } from './enrollment';
import { futureActivitiesOf } from './psyActivities';
import type { FlatActivity } from './schedule';
import { nextSequentialId } from './ids';

export const AREAS = ['Administración', 'Psicopedagogía', 'Logística', 'Ventas'];
export const SYSTEM_ROLES = ['Administración', 'Psicopedagogía', 'Ventas', 'Sin acceso'];
export const MIN_TEXT = 3;
export const MIN_REASON = 5;
export const ACTIVE = 'Activa';
export const CLOSED = 'Cerrada';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

export interface AssignmentForm {
  staffId: string;
  branch: string;
  area: string;
  role: string;
  systemRole: string;
  startDate: string;
  endDate: string;
  isMain: boolean;
  observations: string;
}

export type AssignmentErrors = Partial<Record<keyof AssignmentForm, string>>;

export const emptyAssignmentForm = (startDate = ''): AssignmentForm => ({
  staffId: '', branch: '', area: '', role: '', systemRole: '', startDate, endDate: '', isMain: false, observations: '',
});

export const assignmentToForm = (a: Assignment): AssignmentForm => ({
  staffId: a.staffId, branch: a.branch, area: a.area, role: a.role, systemRole: a.systemRole ?? '', startDate: a.startDate,
  endDate: a.endDate ?? '', isMain: a.isMain, observations: a.observations ?? '',
});

export const isActive = (a: Pick<Assignment, 'status'>) => a.status === ACTIVE;
export const activeOf = (staffId: string, assignments: Assignment[]) => assignments.filter(a => a.staffId === staffId && isActive(a));

export function validateAssignmentForm(
  f: AssignmentForm,
  assignments: Assignment[],
  staff: Staff[],
  branches: Pick<Branch, 'name'>[],
  today: string,
  editingId?: string
): AssignmentErrors {
  const e: AssignmentErrors = {};
  const member = staff.find(s => s.id === f.staffId);
  if (!member) e.staffId = 'Seleccione al trabajador.';
  else if (member.status !== 'Activo' && !editingId) e.staffId = 'El trabajador está inactivo: reactívelo antes de asignarlo.';
  if (!branches.some(b => b.name === f.branch)) e.branch = 'Seleccione la sede.';
  if (!AREAS.includes(f.area)) e.area = 'Seleccione el área.';
  if (f.role.trim().length < MIN_TEXT) e.role = 'Indique el cargo (ej.: Psicólogo Senior).';
  else if (f.role.trim().length > 60) e.role = 'El cargo es demasiado largo (máximo 60 caracteres).';
  if (!SYSTEM_ROLES.includes(f.systemRole)) e.systemRole = 'Seleccione el rol del sistema.';
  if (!f.startDate) e.startDate = 'La fecha de inicio es obligatoria.';
  if (f.endDate) {
    if (f.startDate && f.endDate <= f.startDate) e.endDate = 'La fecha de fin debe ser posterior a la de inicio.';
    else if (f.endDate < today) e.endDate = 'La fecha de fin ya pasó: para terminar una asignación use «Cerrar asignación».';
  }
  if (member && f.branch && f.area && assignments.some(a => a.id !== editingId && a.staffId === f.staffId && isActive(a) && a.branch === f.branch && norm(a.area) === norm(f.area))) {
    e.area = 'Este trabajador ya tiene una asignación activa en esa sede y área.';
  }
  // La principal no se desmarca: para cambiarla se marca otra
  if (editingId && !f.isMain) {
    const current = assignments.find(a => a.id === editingId);
    if (current?.isMain && activeOf(f.staffId, assignments).some(a => a.id !== editingId)) {
      e.isMain = 'Es la asignación principal: para cambiarla marque otra como principal.';
    }
  }
  return e;
}

/** ¿La asignación que se guarda será la principal? (la primera de un trabajador siempre lo es) */
export const willBeMain = (f: Pick<AssignmentForm, 'staffId' | 'isMain'>, assignments: Assignment[], editingId?: string) =>
  f.isMain || !activeOf(f.staffId, assignments).some(a => a.id !== editingId);

/** La principal actual que dejaría de serlo al guardar esta, si la hay. */
export function mainToDemote(f: Pick<AssignmentForm, 'staffId' | 'isMain'>, assignments: Assignment[], editingId?: string): Assignment | undefined {
  if (!willBeMain(f, assignments, editingId)) return undefined;
  return activeOf(f.staffId, assignments).find(a => a.isMain && a.id !== editingId);
}

export function buildAssignment(f: AssignmentForm, id: string, assignments: Assignment[], editingId?: string): Assignment {
  return {
    id,
    staffId: f.staffId,
    branch: f.branch,
    area: f.area,
    role: f.role.trim(),
    systemRole: f.systemRole,
    startDate: f.startDate,
    endDate: f.endDate || undefined,
    isMain: willBeMain(f, assignments, editingId),
    status: ACTIVE,
    observations: f.observations.trim() || undefined,
  };
}

/** Lista de asignaciones tras crear o editar una (la nueva principal desplaza a la anterior). */
export function saveAssignment(assignments: Assignment[], f: AssignmentForm, editingId?: string): { assignments: Assignment[]; saved: Assignment } {
  const id = editingId ?? nextSequentialId('ASG', assignments.map(a => a.id));
  const built = buildAssignment(f, id, assignments, editingId);
  const previous = editingId ? assignments.find(a => a.id === editingId) : undefined;
  const saved: Assignment = previous ? { ...previous, ...built } : built;
  const next = editingId ? assignments.map(a => (a.id === editingId ? saved : a)) : [...assignments, saved];
  return {
    assignments: saved.isMain ? next.map(a => (a.id !== saved.id && a.staffId === saved.staffId && isActive(a) && a.isMain ? { ...a, isMain: false } : a)) : next,
    saved,
  };
}

// ---------------------------------------------------------------- Cierre

export function validateAssignmentClose(a: Assignment, date: string, reason: string, today: string): string[] {
  const e: string[] = [];
  if (!isActive(a)) e.push('La asignación ya está cerrada.');
  if (!date) e.push('Indique la fecha de cierre.');
  else {
    if (date < a.startDate) e.push('La fecha de cierre no puede ser anterior al inicio de la asignación.');
    if (date > today) e.push('La fecha de cierre no puede ser futura.');
  }
  if (reason.trim().length < MIN_REASON) e.push('Indique el motivo del cierre.');
  return e;
}

/** Asesorías futuras (pendientes) cuyo responsable es este trabajador. */
export function futureSessionsOf(member: Pick<Staff, 'names' | 'lastNameP'>, schedules: Schedule[], today: string): Schedule[] {
  const full = norm(`${member.names} ${member.lastNameP}`);
  return schedules.filter(s => ['Reservado', 'Reprogramado'].includes(s.status) && s.date >= today && norm(s.responsible).includes(full));
}

export interface CloseImpact {
  /** Actividades especiales futuras a su cargo (también impiden cerrar su última asignación de Psicopedagogía). */
  futureActivities: FlatActivity[];
  /** Asignación que pasará a ser la principal (si se cierra la principal y quedan otras activas). */
  promoted?: Assignment;
  /** Quedará sin ninguna asignación activa. */
  noneLeft: boolean;
  /** Era la última de Psicopedagogía: dejará de salir como responsable de entrevistas y asesorías. */
  leavesInterviewers: boolean;
  /** Asesorías futuras que seguirían a su nombre. */
  futureSessions: Schedule[];
  /** Impide el cierre: es su última asignación de Psicopedagogía y tiene asesorías futuras. */
  blocked: boolean;
}

export function closeImpact(a: Assignment, assignments: Assignment[], member: Staff | undefined, schedules: Schedule[], today: string, activities: FlatActivity[] = []): CloseImpact {
  const others = activeOf(a.staffId, assignments).filter(x => x.id !== a.id);
  const promoted = a.isMain ? [...others].sort((x, y) => x.startDate.localeCompare(y.startDate))[0] : undefined;
  const isInterviewer = norm(a.area) === norm(INTERVIEWER_AREA);
  const leavesInterviewers = isInterviewer && !others.some(x => norm(x.area) === norm(INTERVIEWER_AREA));
  const futureSessions = member && leavesInterviewers ? futureSessionsOf(member, schedules, today) : [];
  const futureActivities = member && leavesInterviewers ? futureActivitiesOf(member, activities, today) : [];
  return { promoted, noneLeft: others.length === 0, leavesInterviewers, futureSessions, futureActivities, blocked: futureSessions.length > 0 || futureActivities.length > 0 };
}

export function closeAssignmentIn(assignments: Assignment[], id: string, date: string, reason: string, by: string): { assignments: Assignment[]; promotedId?: string } {
  const target = assignments.find(a => a.id === id);
  if (!target) return { assignments };
  const others = activeOf(target.staffId, assignments).filter(x => x.id !== id);
  const promotedId = target.isMain ? [...others].sort((x, y) => x.startDate.localeCompare(y.startDate))[0]?.id : undefined;
  return {
    promotedId,
    assignments: assignments.map(a => {
      if (a.id === id) return { ...a, status: CLOSED, isMain: false, endDate: date, closeReason: reason.trim(), closedBy: by };
      if (a.id === promotedId) return { ...a, isMain: true };
      return a;
    }),
  };
}

/** Cierra todas las asignaciones activas de un trabajador (al inactivarlo). */
export function closeAllOf(assignments: Assignment[], staffId: string, date: string, reason: string, by: string): Assignment[] {
  return assignments.map(a => (a.staffId === staffId && isActive(a) ? { ...a, status: CLOSED, isMain: false, endDate: date, closeReason: reason.trim(), closedBy: by } : a));
}
