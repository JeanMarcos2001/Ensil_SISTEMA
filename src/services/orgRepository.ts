/**
 * Repositorio de Empresas y Filiales sobre Supabase (tablas `empresas` y `sedes`). Solo traduce: filas ↔ modelo del sistema y errores
 * de la base ↔ mensajes claros. Las reglas y el orden de las operaciones viven en `utils/orgDirectory.ts` y `services/orgDirectory.ts`.
 * La seguridad no está aquí: la deciden las políticas RLS de la base según la cuenta que inició sesión.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Branch, Company, Warehouse } from '../context/DataContext';
import {
  branchFromRow, branchPatchToRow, branchToRow, companyFromRow, companyPatchToRow, companyToRow, dbErrorMessage, isIdConflict,
  warehouseFromRow, warehousePatchToRow, warehouseToRow, type AlmacenRow, type EmpresaRow, type SedeRow,
} from '../utils/orgDirectory';
import type { OrgRepository, RepoResult } from './orgDirectory';

const failure = <T>(error: { code?: string; message?: string; details?: string } | null): RepoResult<T> =>
  ({ ok: false, error: dbErrorMessage(error), idConflict: isIdConflict(error) });

/** Cuando una actualización o un borrado no toca ninguna fila, la política de seguridad la ocultó (o ya no existe). */
const NOT_TOUCHED = 'No se pudo completar: el registro ya no existe o su cuenta no tiene permiso para cambiarlo.';

export function createSupabaseOrgRepository(client: SupabaseClient): OrgRepository {
  return {
    async listCompanies() {
      const { data, error } = await client.from('empresas').select('*').order('id');
      return error ? failure(error) : { ok: true, data: (data as EmpresaRow[]).map(companyFromRow) };
    },
    async listBranches() {
      const { data, error } = await client.from('sedes').select('*').order('id');
      return error ? failure(error) : { ok: true, data: (data as SedeRow[]).map(branchFromRow) };
    },
    async listWarehouses() {
      const { data, error } = await client.from('almacenes').select('*').order('id');
      return error ? failure(error) : { ok: true, data: (data as AlmacenRow[]).map(warehouseFromRow) };
    },
    async insertWarehouse(warehouse: Warehouse) {
      const { data, error } = await client.from('almacenes').insert(warehouseToRow(warehouse)).select().single();
      return error ? failure(error) : { ok: true, data: warehouseFromRow(data as AlmacenRow) };
    },
    async updateWarehouse(id: string, patch: Partial<Warehouse>) {
      const { data, error } = await client.from('almacenes').update(warehousePatchToRow(patch)).eq('id', id).select();
      if (error) return failure(error);
      return data && data.length === 1 ? { ok: true, data: warehouseFromRow(data[0] as AlmacenRow) } : { ok: false, error: NOT_TOUCHED };
    },
    async insertCompany(company: Company) {
      const { data, error } = await client.from('empresas').insert(companyToRow(company)).select().single();
      return error ? failure(error) : { ok: true, data: companyFromRow(data as EmpresaRow) };
    },
    async updateCompany(id: string, patch: Partial<Company>) {
      const { data, error } = await client.from('empresas').update(companyPatchToRow(patch)).eq('id', id).select();
      if (error) return failure(error);
      return data && data.length === 1 ? { ok: true, data: companyFromRow(data[0] as EmpresaRow) } : { ok: false, error: NOT_TOUCHED };
    },
    async deleteCompany(id: string) {
      const { data, error } = await client.from('empresas').delete().eq('id', id).select('id');
      if (error) return failure(error);
      return data && data.length === 1 ? { ok: true, data: null } : { ok: false, error: NOT_TOUCHED };
    },
    async insertBranch(branch: Branch) {
      const { data, error } = await client.from('sedes').insert(branchToRow(branch)).select().single();
      return error ? failure(error) : { ok: true, data: branchFromRow(data as SedeRow) };
    },
    async updateBranch(id: string, patch: Partial<Branch>) {
      const { data, error } = await client.from('sedes').update(branchPatchToRow(patch)).eq('id', id).select();
      if (error) return failure(error);
      return data && data.length === 1 ? { ok: true, data: branchFromRow(data[0] as SedeRow) } : { ok: false, error: NOT_TOUCHED };
    },
    async deleteBranch(id: string) {
      const { data, error } = await client.from('sedes').delete().eq('id', id).select('id');
      if (error) return failure(error);
      return data && data.length === 1 ? { ok: true, data: null } : { ok: false, error: NOT_TOUCHED };
    },
  };
}
