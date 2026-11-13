/**
 * Operaciones de Personal y Asignaciones sobre la base de datos: validan con las reglas puras (`utils/staff.ts`, `utils/assignments.ts`,
 * `utils/staffStatus.ts`) y luego guardan. El repositorio se recibe como parámetro (el de Supabase en el sistema, uno en memoria en
 * `scripts/check-staff-db.ts`), de modo que el orden «validar → guardar → traducir el error» se comprueba sin conexión.
 *
 * Lo que la base mantiene sola (disparadores): la asignación principal, el nombre/documento/teléfono y las sedes/almacén de la cuenta de la
 * persona, y la desactivación de su cuenta al inactivarla. Aquí no se repite: se confía en ella y se muestra su mensaje si rechaza algo.
 */
import type { Assignment, Staff } from '../context/DataContext';
import {
  type AssignmentForm, buildAssignment, closeAssignmentIn, closeImpact, isActive, type Place, validateAssignmentClose, validateAssignmentForm,
} from '../utils/assignments';
import { draftId } from '../utils/draftIds';
import { firstError } from '../utils/orgDirectory';
import { type InactivationContext, validateInactivation, validateReactivation } from '../utils/staffStatus';
import type { OpResult, RepoResult } from './orgDirectory';

export interface StaffRepository {
  listStaff(): Promise<RepoResult<Staff[]>>;
  listAssignments(places: Place[]): Promise<RepoResult<Assignment[]>>;
  insertStaff(staff: Staff): Promise<RepoResult<Staff>>;
  updateStaff(id: string, patch: Partial<Staff>): Promise<RepoResult<Staff>>;
  /** Inactiva la ficha, cierra sus asignaciones y desactiva su cuenta, todo o nada. */
  inactivateStaff(id: string, input: { reason: string; detail: string; date: string; by: string }): Promise<RepoResult<null>>;
  insertAssignment(assignment: Assignment, places: Place[]): Promise<RepoResult<Assignment>>;
  updateAssignment(id: string, assignment: Assignment, places: Place[]): Promise<RepoResult<Assignment>>;
}

const fail = (error: string): OpResult<never> => ({ ok: false, error });

// ------------------------------------------------------------------------------------------------------------------ Personal

/**
 * El id `STF-NNN` y el código de seis dígitos los asigna la BASE al guardar (el siguiente al más alto de todo el personal, aunque esta cuenta solo
 * vea el de sus sedes): la pantalla manda un borrador de id y el código vacío, y el repositorio devuelve la ficha con los reales.
 */
export async function createStaff(repo: StaffRepository, staff: Staff[], input: Omit<Staff, 'id' | 'code'>): Promise<OpResult<Staff>> {
  const doc = input.docNumber.trim().toLowerCase();
  if (staff.some(s => s.docNumber.trim().toLowerCase() === doc)) return fail('Este documento ya está registrado en el personal.');
  const res = await repo.insertStaff({ ...input, id: draftId('STF'), code: '', status: 'Activo' });
  return res.ok && res.data ? { ok: true, value: res.data } : fail(res.error ?? 'No se pudo guardar la ficha.');
}

/** El id, el código y el estado no se cambian aquí (el estado se cambia con inactivar y reactivar). */
export async function editStaff(repo: StaffRepository, staff: Staff[], id: string, patch: Partial<Staff>): Promise<OpResult<Staff>> {
  const current = staff.find(s => s.id === id);
  if (!current) return fail('No se encontró al trabajador.');
  const { id: _id, code: _code, status: _status, statusDate: _date, statusReason: _reason, ...changes } = patch;
  if (changes.docNumber !== undefined) {
    const doc = changes.docNumber.trim().toLowerCase();
    if (staff.some(s => s.id !== id && s.docNumber.trim().toLowerCase() === doc)) return fail('Este documento ya está registrado en el personal.');
  }
  const res = await repo.updateStaff(id, changes);
  return res.ok && res.data ? { ok: true, value: res.data } : fail(res.error ?? 'No se pudo guardar la ficha.');
}

export interface InactivateResult { closedAssignmentIds: string[]; deactivatedAccount: boolean }

/**
 * Da de baja a la persona: valida contra los contratos, asesorías y actividades (`ctx`) y la base lo hace todo de una vez. Devuelve qué
 * asignaciones se cerraron para que quien llama las refleje, y si había una cuenta activa que se desactivó.
 */
export async function inactivateStaff(
  repo: StaffRepository, staff: Staff[], assignments: Assignment[], id: string, input: { reason: string; detail: string; date: string }, by: string,
  ctx: InactivationContext, hasActiveAccount: boolean,
): Promise<OpResult<InactivateResult>> {
  const member = staff.find(s => s.id === id);
  if (!member) return fail('No se encontró al trabajador.');
  const problem = validateInactivation(member, input.reason, input.detail, input.date, { ...ctx, assignments })[0];
  if (problem) return fail(problem);
  const res = await repo.inactivateStaff(id, { ...input, by });
  if (!res.ok) return fail(res.error ?? 'No se pudo dar de baja al trabajador.');
  return { ok: true, value: { closedAssignmentIds: assignments.filter(a => a.staffId === id && isActive(a)).map(a => a.id), deactivatedAccount: hasActiveAccount } };
}

/** Reactivar solo devuelve el estado «Activo»: no restituye asignaciones, contrato ni la cuenta (se hacen a propósito). */
export async function reactivateStaff(repo: StaffRepository, staff: Staff[], id: string, detail: string, today: string): Promise<OpResult<Staff>> {
  const member = staff.find(s => s.id === id);
  if (!member) return fail('No se encontró al trabajador.');
  const problem = validateReactivation(member, detail)[0];
  if (problem) return fail(problem);
  const res = await repo.updateStaff(id, { status: 'Activo', statusDate: today, statusReason: `Reactivado — ${detail.trim()}` });
  return res.ok && res.data ? { ok: true, value: res.data } : fail(res.error ?? 'No se pudo reactivar al trabajador.');
}

// ------------------------------------------------------------------------------------------------------------------ Asignaciones

export interface SaveAssignmentResult { saved: Assignment }

/** Crea o edita una asignación. La base le asigna el código, hace pasar la principal anterior a secundaria y deja las sedes de la cuenta al día. */
export async function saveAssignment(
  repo: StaffRepository, assignments: Assignment[], staff: Staff[], places: Place[], form: AssignmentForm, today: string, editingId?: string,
): Promise<OpResult<SaveAssignmentResult>> {
  if (editingId) {
    const current = assignments.find(a => a.id === editingId);
    if (!current) return fail('No se encontró la asignación.');
    if (!isActive(current)) return fail('La asignación está cerrada: no se edita. Cree una nueva.');
    if (current.staffId !== form.staffId) return fail('No se puede cambiar el trabajador de una asignación.');
  }
  const problem = firstError(validateAssignmentForm(form, assignments, staff, places, today, editingId));
  if (problem) return fail(problem);
  const place = places.find(p => p.name === form.branch)!;
  const previous = editingId ? assignments.find(a => a.id === editingId) : undefined;

  if (previous) {
    const built: Assignment = { ...previous, ...buildAssignment(form, previous.id, assignments, editingId), placeId: place.id, placeKind: place.kind, branch: place.name };
    const res = await repo.updateAssignment(previous.id, built, places);
    return res.ok && res.data ? { ok: true, value: { saved: res.data } } : fail(res.error ?? 'No se pudo guardar la asignación.');
  }
  // El código `ASG-NNN` lo asigna la base al guardar (el siguiente al más alto de todas las asignaciones, no de las que esta cuenta ve)
  const built: Assignment = { ...buildAssignment(form, draftId('ASG'), assignments), placeId: place.id, placeKind: place.kind, branch: place.name };
  const res = await repo.insertAssignment(built, places);
  return res.ok && res.data ? { ok: true, value: { saved: res.data } } : fail(res.error ?? 'No se pudo guardar la asignación.');
}

/**
 * Cierra una asignación con fecha y motivo. `schedules`/`activities` (datos de ejemplo de Psicopedagogía) impiden cerrar la última de
 * Psicopedagogía de quien tiene asesorías o actividades futuras.
 */
export async function closeAssignment(
  repo: StaffRepository, assignments: Assignment[], staff: Staff[], places: Place[], id: string, date: string, reason: string, by: string, today: string,
  impactCtx: { schedules: Parameters<typeof closeImpact>[3]; activities: Parameters<typeof closeImpact>[5] },
): Promise<OpResult<{ promotedId?: string }>> {
  const target = assignments.find(a => a.id === id);
  if (!target) return fail('No se encontró la asignación.');
  const problem = validateAssignmentClose(target, date, reason, today)[0];
  if (problem) return fail(problem);
  const impact = closeImpact(target, assignments, staff.find(s => s.id === target.staffId), impactCtx.schedules, today, impactCtx.activities);
  if (impact.blocked) {
    return fail(`Es su última asignación de Psicopedagogía y tiene ${impact.futureSessions.length} asesoría(s) y ${impact.futureActivities.length} actividad(es) futura(s): reasígnelas primero.`);
  }
  const closed = closeAssignmentIn(assignments, id, date, reason, by);
  const next = closed.assignments.find(a => a.id === id)!;
  const res = await repo.updateAssignment(id, next, places);
  return res.ok ? { ok: true, value: { promotedId: closed.promotedId } } : fail(res.error ?? 'No se pudo cerrar la asignación.');
}
