/**
 * Repositorio de Personal y Asignaciones sobre Supabase (tablas `personal` y `asignaciones`, y la función `inactivar_personal`). Solo
 * traduce: filas ↔ modelo del sistema y errores de la base ↔ mensajes claros. Las reglas y el orden de las operaciones viven en
 * `services/staffDirectory.ts`; la seguridad la deciden las políticas RLS y los disparadores de la base según la cuenta que inició sesión.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Assignment, Staff } from '../context/DataContext';
import type { Place } from '../utils/assignments';
import { dbErrorMessage, isIdConflict } from '../utils/orgDirectory';
import { assignmentFromRow, assignmentToRow, staffFromRow, staffPatchToRow, staffToRow, type AsignacionRow, type PersonalRow } from '../utils/staffDb';
import type { RepoResult } from './orgDirectory';
import type { StaffRepository } from './staffDirectory';

const failure = <T>(error: { code?: string; message?: string; details?: string } | null): RepoResult<T> =>
  ({ ok: false, error: dbErrorMessage(error), idConflict: isIdConflict(error) });

const NOT_TOUCHED = 'No se pudo completar: el registro ya no existe o su cuenta no tiene permiso para cambiarlo.';

export function createSupabaseStaffRepository(client: SupabaseClient): StaffRepository {
  return {
    async listStaff() {
      const { data, error } = await client.from('personal').select('*').order('id');
      return error ? failure(error) : { ok: true, data: (data as PersonalRow[]).map(staffFromRow) };
    },
    async listAssignments(places: Place[]) {
      const { data, error } = await client.from('asignaciones').select('*').order('id');
      return error ? failure(error) : { ok: true, data: (data as AsignacionRow[]).map(r => assignmentFromRow(r, places)) };
    },
    async insertStaff(staff: Staff) {
      const { data, error } = await client.from('personal').insert(staffToRow(staff)).select().single();
      return error ? failure(error) : { ok: true, data: staffFromRow(data as PersonalRow) };
    },
    async updateStaff(id: string, patch: Partial<Staff>) {
      const { data, error } = await client.from('personal').update(staffPatchToRow(patch)).eq('id', id).select();
      if (error) return failure(error);
      return data && data.length === 1 ? { ok: true, data: staffFromRow(data[0] as PersonalRow) } : { ok: false, error: NOT_TOUCHED };
    },
    async inactivateStaff(id, input) {
      const { error } = await client.rpc('inactivar_personal', { p_id: id, p_motivo: input.reason, p_detalle: input.detail, p_fecha: input.date, p_por: input.by });
      return error ? failure(error) : { ok: true, data: null };
    },
    async insertAssignment(assignment: Assignment, places: Place[]) {
      const { data, error } = await client.from('asignaciones').insert(assignmentToRow(assignment)).select().single();
      return error ? failure(error) : { ok: true, data: assignmentFromRow(data as AsignacionRow, places) };
    },
    async updateAssignment(id: string, assignment: Assignment, places: Place[]) {
      const { personal_id: _p, id: _i, ...row } = assignmentToRow(assignment);
      const { data, error } = await client.from('asignaciones').update(row).eq('id', id).select();
      if (error) return failure(error);
      return data && data.length === 1 ? { ok: true, data: assignmentFromRow(data[0] as AsignacionRow, places) } : { ok: false, error: NOT_TOUCHED };
    },
  };
}
