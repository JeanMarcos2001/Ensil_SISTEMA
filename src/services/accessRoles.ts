/**
 * Operaciones de Roles y Permisos sobre la base de datos. Reciben el repositorio como parámetro (el de Supabase en el sistema, uno en
 * memoria en `scripts/check-access-roles.ts`). Las reglas de negocio (nombre único, rol del sistema, combinaciones a separar) las
 * valida antes `DataContext` con `utils/roleBuilder.ts`; aquí solo se guarda, en el orden que deja menos riesgo:
 *
 * - **Crear un rol con funciones:** primero el rol, luego sus funciones; si las funciones fallan, el rol se borra (nunca queda un rol a
 *   medias).
 * - **Cambiar las funciones de un rol:** primero se QUITAN las que sobran y después se AGREGAN las nuevas, así que un fallo a mitad
 *   deja al rol con MENOS permisos de los pedidos, nunca con más. Quien llama vuelve a leer la base para mostrar lo que quedó.
 */
import type { Permission, Role, User } from '../context/DataContext';
import { ID_PREFIX, nextSequentialId } from '../utils/ids';
import { permissionsFromRows, type RolFuncionRow } from '../utils/accessRoles';
import { usersFromRows } from '../utils/accounts';
import type { AccountsRepository } from './accountsRepository';
import type { AcceptedRisk } from '../utils/roleBuilder';
import type { OpResult, RepoResult } from './orgDirectory';

export interface RolesRepository {
  listRoles(): Promise<RepoResult<Role[]>>;
  listFunctions(): Promise<RepoResult<RolFuncionRow[]>>;
  insertRole(role: Role): Promise<RepoResult<Role>>;
  updateRole(id: string, patch: Partial<Role>): Promise<RepoResult<Role>>;
  deleteRole(id: string): Promise<RepoResult<null>>;
  addFunctions(roleId: string, functionIds: string[]): Promise<RepoResult<null>>;
  removeFunctions(roleId: string, functionIds: string[]): Promise<RepoResult<null>>;
}

/** `partial`: la operación llegó a hacer parte de los cambios; hay que volver a leer la base. */
export type RoleOpResult<T = undefined> = OpResult<T> & { partial?: boolean };

const fail = (error: string, partial = false): RoleOpResult<never> => ({ ok: false, error, partial });
const MAX_ID_ATTEMPTS = 3;

export interface AccessRoles { roles: Role[]; permissions: Permission[] }

/** Lo que el sistema necesita para arrancar: los roles, sus funciones y las cuentas (todo desde la base). */
export interface AccessData extends AccessRoles { users: User[] }

/** Lee las cuentas que la sesión puede ver (la política de la base decide cuáles) y las deja como cuentas del sistema. */
export async function loadUsers(accounts: AccountsRepository, roles: Role[], now: Date = new Date()): Promise<RoleOpResult<User[]>> {
  const rows = await accounts.listAccounts();
  if (!rows.ok || !rows.data) return fail(rows.error ?? 'No se pudieron cargar las cuentas.');
  return { ok: true, value: usersFromRows(rows.data, roles, now) };
}

/** Roles, funciones y cuentas, de una vez. */
export async function loadAccess(rolesRepo: RolesRepository, accountsRepo: AccountsRepository, now: Date = new Date()): Promise<RoleOpResult<AccessData>> {
  const access = await loadAccessRoles(rolesRepo);
  if (!access.ok || !access.value) return fail(access.error ?? 'No se pudieron cargar los roles.');
  const users = await loadUsers(accountsRepo, access.value.roles, now);
  if (!users.ok || !users.value) return fail(users.error ?? 'No se pudieron cargar las cuentas.');
  return { ok: true, value: { ...access.value, users: users.value } };
}

/** Lee los roles y sus funciones (lo que `DataProvider` necesita para arrancar). */
export async function loadAccessRoles(repo: RolesRepository): Promise<RoleOpResult<AccessRoles>> {
  const [roles, functions] = await Promise.all([repo.listRoles(), repo.listFunctions()]);
  if (!roles.ok || !functions.ok) return fail(roles.error ?? functions.error ?? 'No se pudieron cargar los roles.');
  const list = roles.data ?? [];
  return { ok: true, value: { roles: list, permissions: permissionsFromRows(list, functions.data ?? []) } };
}

/** Crea el rol (el sistema asigna `ROL-NNN`) y, si trae funciones, se las da; si algo falla no deja nada. */
export async function persistNewRole(repo: RolesRepository, roles: Role[], draft: Omit<Role, 'id'>, functionIds: string[]): Promise<RoleOpResult<Role>> {
  const taken = roles.map(r => r.id);
  for (let attempt = 0; attempt < MAX_ID_ATTEMPTS; attempt++) {
    const id = nextSequentialId(ID_PREFIX.rol, taken);
    const res = await repo.insertRole({ ...draft, id });
    if (!res.ok || !res.data) {
      if (res.idConflict) { taken.push(id); continue; }
      return fail(res.error ?? 'No se pudo guardar el rol.');
    }
    if (functionIds.length > 0) {
      const granted = await repo.addFunctions(id, functionIds);
      if (!granted.ok) {
        const undone = await repo.deleteRole(id);
        return fail(`No se pudieron guardar las funciones del rol${undone.ok ? ': el rol no se creó' : ' y el rol quedó sin funciones; revíselo en Roles'}. ${granted.error ?? ''}`.trim(), !undone.ok);
      }
    }
    return { ok: true, value: res.data };
  }
  return fail('No se pudo asignar un código al rol. Intente de nuevo.');
}

export async function persistRoleUpdate(repo: RolesRepository, id: string, patch: Partial<Role>): Promise<RoleOpResult<Role>> {
  const res = await repo.updateRole(id, patch);
  return res.ok && res.data ? { ok: true, value: res.data } : fail(res.error ?? 'No se pudo guardar el rol.');
}

export async function persistRoleDelete(repo: RolesRepository, id: string): Promise<RoleOpResult> {
  const res = await repo.deleteRole(id);
  return res.ok ? { ok: true } : fail(res.error ?? 'No se pudo eliminar el rol.');
}

/** Pasa las funciones de un rol de `current` a `next` (quita las que sobran, agrega las nuevas) y guarda los motivos de las combinaciones. */
export async function persistPermissions(
  repo: RolesRepository, roleId: string, current: string[], next: string[], acceptedRisks: AcceptedRisk[],
): Promise<RoleOpResult> {
  const toRemove = current.filter(f => !next.includes(f));
  const toAdd = next.filter(f => !current.includes(f));
  let touched = false;
  if (toRemove.length > 0) {
    const removed = await repo.removeFunctions(roleId, toRemove);
    if (!removed.ok) return fail(removed.error ?? 'No se pudieron guardar las funciones.');
    touched = true;
  }
  if (toAdd.length > 0) {
    const added = await repo.addFunctions(roleId, toAdd);
    if (!added.ok) return fail(`${added.error ?? 'No se pudieron guardar las funciones.'}${touched ? ' Se quitaron las que sobraban pero no se agregaron las nuevas.' : ''}`, touched);
    touched = true;
  }
  const risks = await repo.updateRole(roleId, { acceptedRisks });
  if (!risks.ok) return fail(`Las funciones se guardaron, pero no los motivos de las combinaciones aceptadas. ${risks.error ?? ''}`.trim(), true);
  return { ok: true };
}
