/**
 * Repositorio de Roles y Funciones sobre Supabase (tablas `roles` y `rol_funciones`). Solo traduce filas ↔ modelo del sistema y errores
 * de la base ↔ mensajes claros. La seguridad no está aquí: la deciden las políticas RLS (`org-roles:*`) según la cuenta que inició sesión.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Role } from '../context/DataContext';
import { roleFromRow, rolePatchToRow, roleToRow, type RolFuncionRow, type RolRow } from '../utils/accessRoles';
import { dbErrorMessage, isIdConflict } from '../utils/orgDirectory';
import type { RepoResult } from './orgDirectory';
import type { RolesRepository } from './accessRoles';

const failure = <T>(error: { code?: string; message?: string; details?: string } | null): RepoResult<T> =>
  ({ ok: false, error: dbErrorMessage(error), idConflict: isIdConflict(error) });

const NOT_TOUCHED = 'No se pudo completar: el rol ya no existe o su cuenta no tiene permiso para cambiarlo.';

export function createSupabaseRolesRepository(client: SupabaseClient): RolesRepository {
  return {
    async listRoles() {
      const { data, error } = await client.from('roles').select('*').order('id');
      return error ? failure(error) : { ok: true, data: (data as RolRow[]).map(roleFromRow) };
    },
    async listFunctions() {
      // Hay cientos de filas (una por función de cada rol): se lee por tramos para no toparse con el límite de filas por consulta.
      const rows: RolFuncionRow[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await client.from('rol_funciones').select('rol_id, funcion_id').order('rol_id').order('funcion_id').range(from, from + 999);
        if (error) return failure(error);
        rows.push(...(data as RolFuncionRow[]));
        if ((data ?? []).length < 1000) break;
      }
      return { ok: true, data: rows };
    },
    async insertRole(role: Role) {
      const { data, error } = await client.from('roles').insert(roleToRow(role)).select().single();
      return error ? failure(error) : { ok: true, data: roleFromRow(data as RolRow) };
    },
    async updateRole(id: string, patch: Partial<Role>) {
      const { data, error } = await client.from('roles').update(rolePatchToRow(patch)).eq('id', id).select();
      if (error) return failure(error);
      return data && data.length === 1 ? { ok: true, data: roleFromRow(data[0] as RolRow) } : { ok: false, error: NOT_TOUCHED };
    },
    async deleteRole(id: string) {
      const { data, error } = await client.from('roles').delete().eq('id', id).select('id');
      if (error) return failure(error);
      return data && data.length === 1 ? { ok: true, data: null } : { ok: false, error: NOT_TOUCHED };
    },
    async addFunctions(roleId: string, functionIds: string[]) {
      const { error } = await client.from('rol_funciones').insert(functionIds.map(funcion_id => ({ rol_id: roleId, funcion_id })));
      return error ? failure(error) : { ok: true, data: null };
    },
    async removeFunctions(roleId: string, functionIds: string[]) {
      const { error } = await client.from('rol_funciones').delete().eq('rol_id', roleId).in('funcion_id', functionIds);
      return error ? failure(error) : { ok: true, data: null };
    },
  };
}
