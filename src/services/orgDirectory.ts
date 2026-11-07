/**
 * Operaciones de Empresas y Filiales sobre la base de datos: validan con las reglas de `utils/orgDirectory.ts` y luego guardan.
 *
 * Reciben el repositorio como parámetro (el de Supabase en el sistema, uno en memoria en `scripts/check-org-directory.ts`), de modo que
 * el orden "validar → guardar → traducir el error" se puede comprobar sin conexión. Ninguna toca el estado de React: devuelven el
 * registro resultante y quien llama (el gancho `useOrgDirectory`) lo aplica a su lista.
 */
import type { Branch, Company, Warehouse } from '../context/DataContext';
import { ID_PREFIX, nextSequentialId } from '../utils/ids';
import { warehouseInactivationError } from '../utils/logisticsRoutes';
import {
  branchFieldErrors, companyDeletionError, companyFieldErrors, firstError, warehouseFieldErrors, withCompanyNames,
} from '../utils/orgDirectory';

export interface RepoResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
  /** El id generado ya existía (otra persona creó uno a la vez): se reintenta con el siguiente. */
  idConflict?: boolean;
}

export interface OrgRepository {
  listCompanies(): Promise<RepoResult<Company[]>>;
  listBranches(): Promise<RepoResult<Branch[]>>;
  listWarehouses(): Promise<RepoResult<Warehouse[]>>;
  insertCompany(company: Company): Promise<RepoResult<Company>>;
  updateCompany(id: string, patch: Partial<Company>): Promise<RepoResult<Company>>;
  deleteCompany(id: string): Promise<RepoResult<null>>;
  insertBranch(branch: Branch): Promise<RepoResult<Branch>>;
  updateBranch(id: string, patch: Partial<Branch>): Promise<RepoResult<Branch>>;
  deleteBranch(id: string): Promise<RepoResult<null>>;
  insertWarehouse(warehouse: Warehouse): Promise<RepoResult<Warehouse>>;
  updateWarehouse(id: string, patch: Partial<Warehouse>): Promise<RepoResult<Warehouse>>;
}

export interface OpResult<T = undefined> {
  ok: boolean;
  error?: string;
  value?: T;
}

const fail = (error: string): OpResult<never> => ({ ok: false, error });
const MAX_ID_ATTEMPTS = 3;

/** Las empresas, filiales y almacenes tal como los guarda la base (cada filial y almacén con el nombre de su empresa ya completado). */
export interface OrgDirectoryData { companies: Company[]; branches: Branch[]; warehouses: Warehouse[] }

/**
 * Lee de la base las empresas, filiales y almacenes que la cuenta puede ver (la política de seguridad decide cuáles). Es la ÚNICA fuente
 * de sedes, empresas y almacén de todo el sistema: se lee al iniciar sesión, antes de montar las pantallas (`AccessGate`), y lo que
 * Organización cambie se aplica sobre esa misma lista (`useOrgDirectory`).
 */
export async function loadOrgDirectory(repo: OrgRepository): Promise<OpResult<OrgDirectoryData>> {
  const [c, b, w] = await Promise.all([repo.listCompanies(), repo.listBranches(), repo.listWarehouses()]);
  if (!c.ok || !b.ok || !w.ok) return fail(c.error ?? b.error ?? w.error ?? 'No se pudieron cargar las empresas, filiales y almacenes.');
  const companies = c.data ?? [];
  return { ok: true, value: { companies, branches: withCompanyNames(b.data ?? [], companies), warehouses: withCompanyNames(w.data ?? [], companies) } };
}

export async function createCompany(repo: OrgRepository, companies: Company[], input: Omit<Company, 'id'>): Promise<OpResult<Company>> {
  const problem = firstError(companyFieldErrors(input, companies));
  if (problem) return fail(problem);
  const taken = companies.map(c => c.id);
  for (let attempt = 0; attempt < MAX_ID_ATTEMPTS; attempt++) {
    const id = nextSequentialId(ID_PREFIX.empresa, taken);
    const res = await repo.insertCompany({ ...input, id });
    if (res.ok && res.data) return { ok: true, value: res.data };
    if (!res.idConflict) return fail(res.error ?? 'No se pudo guardar la empresa.');
    taken.push(id);
  }
  return fail('No se pudo asignar un código a la empresa. Intente de nuevo.');
}

/** `linked` = las filiales y los almacenes juntos (cualquiera con empresa impide inactivarla o eliminarla). */
export async function editCompany(
  repo: OrgRepository, companies: Company[], linked: { companyId?: string }[], id: string, patch: Partial<Company>,
): Promise<OpResult<Company>> {
  const current = companies.find(c => c.id === id);
  if (!current) return fail('No se encontró la empresa.');
  const next = { ...current, ...patch, id };
  const problem = firstError(companyFieldErrors(next, companies, id, linked));
  if (problem) return fail(problem);
  const res = await repo.updateCompany(id, patch);
  return res.ok && res.data ? { ok: true, value: res.data } : fail(res.error ?? 'No se pudo guardar la empresa.');
}

export async function removeCompany(repo: OrgRepository, companies: Company[], linked: { companyId?: string }[], id: string): Promise<OpResult> {
  const current = companies.find(c => c.id === id);
  if (!current) return fail('No se encontró la empresa.');
  const problem = companyDeletionError(current, linked);
  if (problem) return fail(problem);
  const res = await repo.deleteCompany(id);
  return res.ok ? { ok: true } : fail(res.error ?? 'No se pudo eliminar la empresa.');
}

/** El código `FIL-NNN` lo asigna el sistema (si llega un `id`, se ignora); si dos personas crean a la vez, se reintenta con el siguiente. */
export async function createBranch(repo: OrgRepository, branches: Branch[], companies: Company[], input: Omit<Branch, 'id'>): Promise<OpResult<Branch>> {
  const problem = firstError(branchFieldErrors(input, branches, companies));
  if (problem) return fail(problem);
  const { id: _ignored, company: _name, ...data } = input as Branch;
  const taken = branches.map(b => b.id);
  for (let attempt = 0; attempt < MAX_ID_ATTEMPTS; attempt++) {
    const id = nextSequentialId(ID_PREFIX.filial, taken);
    const res = await repo.insertBranch({ ...data, company: '', id });
    if (res.ok && res.data) return { ok: true, value: withCompanyNames([res.data], companies)[0] };
    if (!res.idConflict) return fail(res.error ?? 'No se pudo guardar la filial.');
    taken.push(id);
  }
  return fail('No se pudo asignar un código a la filial. Intente de nuevo.');
}

/** El código y la empresa de una filial no cambian: si llegan en el cambio, se ignoran. */
export async function editBranch(
  repo: OrgRepository, branches: Branch[], companies: Company[], id: string, patch: Partial<Branch>,
): Promise<OpResult<Branch>> {
  const current = branches.find(b => b.id === id);
  if (!current) return fail('No se encontró la filial.');
  const { id: _id, companyId: _companyId, company: _company, ...changes } = patch;
  const problem = firstError(branchFieldErrors({ ...current, ...changes }, branches, companies, id));
  if (problem) return fail(problem);
  const res = await repo.updateBranch(id, changes);
  return res.ok && res.data ? { ok: true, value: withCompanyNames([res.data], companies)[0] } : fail(res.error ?? 'No se pudo guardar la filial.');
}

export async function removeBranch(repo: OrgRepository, branches: Branch[], id: string): Promise<OpResult> {
  if (!branches.some(b => b.id === id)) return fail('No se encontró la filial.');
  const res = await repo.deleteBranch(id);
  return res.ok ? { ok: true } : fail(res.error ?? 'No se pudo eliminar la filial.');
}

/** El código `ALM-NNN` lo asigna el sistema; si dos personas crean a la vez, se reintenta con el siguiente. */
export async function createWarehouse(repo: OrgRepository, warehouses: Warehouse[], companies: Company[], input: Omit<Warehouse, 'id'>): Promise<OpResult<Warehouse>> {
  const problem = firstError(warehouseFieldErrors(input, warehouses, companies));
  if (problem) return fail(problem);
  const { company: _name, ...data } = input;
  const taken = warehouses.map(w => w.id);
  for (let attempt = 0; attempt < MAX_ID_ATTEMPTS; attempt++) {
    const id = nextSequentialId(ID_PREFIX.almacen, taken);
    const res = await repo.insertWarehouse({ ...data, name: input.name.trim(), id });
    if (res.ok && res.data) return { ok: true, value: withCompanyNames([res.data], companies)[0] };
    if (!res.idConflict) return fail(res.error ?? 'No se pudo guardar el almacén.');
    taken.push(id);
  }
  return fail('No se pudo asignar un código al almacén. Intente de nuevo.');
}

/**
 * `stock` = las existencias que ya conoce el sistema (unidades por ubicación): un almacén con mercadería no se inactiva.
 * Mientras el stock no esté en la base, quien llama no lo pasa y esa regla no tiene con qué compararse.
 */
export async function editWarehouse(
  repo: OrgRepository, warehouses: Warehouse[], companies: Company[], id: string, patch: Partial<Omit<Warehouse, 'id'>>,
  stock: { branchId: string; stock: number }[] = [],
): Promise<OpResult<Warehouse>> {
  const current = warehouses.find(w => w.id === id);
  if (!current) return fail('No se encontró el almacén.');
  const { company: _name, ...changes } = patch;
  const next: Warehouse = { ...current, ...changes, id, name: (changes.name ?? current.name).trim() };
  const problem = firstError(warehouseFieldErrors(next, warehouses, companies, id)) ?? warehouseInactivationError(current, next.status, stock);
  if (problem) return fail(problem);
  const res = await repo.updateWarehouse(id, changes);
  return res.ok && res.data ? { ok: true, value: withCompanyNames([res.data], companies)[0] } : fail(res.error ?? 'No se pudo guardar el almacén.');
}
