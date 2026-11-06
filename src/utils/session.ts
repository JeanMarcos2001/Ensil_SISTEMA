/**
 * Sesión: con qué cuenta se trabaja (la que ingresó con correo y contraseña), qué sedes y almacenes alcanza y las protecciones de las cuentas.
 *
 * - La sede que se ve sale de la cuenta: quien alcanza una sola sede queda en ella; quien alcanza varias o todas elige entre las suyas.
 * - Nunca se queda el sistema sin una cuenta de Superusuario activa, y nadie se cambia el rol ni el estado de su propia cuenta.
 * - El cambio rápido de usuario con PIN se retiró: ahora cada persona ingresa con su correo y contraseña (ver `utils/loginAccess.ts`).
 */
import type { Branch, User, Warehouse } from '../context/DataContext';
import { getAllItemsForModule } from '../config/modules';
import { SUPERUSER } from './authority';
import { menuVisible } from './guards';
import { slugify } from './string';

// ------------------------------------------------------------------------------------------------------------------ Sede que se ve

export interface SessionScope {
  allBranches: boolean;
  branchIds: string[];
  /** Almacenes que la cuenta puede VER: todos si alcanza todas las sedes; si no, los que tiene asignados. */
  warehouseIds: string[];
  /** Almacenes en los que puede OPERAR (despachar, ingresar compras, ajustar): los asignados a su cuenta (el Superusuario, todos). Alcanzar todas las sedes no basta. */
  operableWarehouseIds: string[];
}

const ALL = 'Todas';

export const NO_SCOPE: SessionScope = { allBranches: false, branchIds: [], warehouseIds: [], operableWarehouseIds: [] };

/**
 * Las sedes y almacenes que alcanza la cuenta.
 * - Sedes: todas si es Superusuario, si su sede es «Todas» o si su rol tiene el alcance de todas las sedes; si no, su sede principal y
 *   las adicionales (solo las que existen).
 * - Almacenes: quien alcanza todas las sedes los VE (necesita ver el stock total y aprobar reposiciones), pero solo OPERA en los que
 *   tiene asignados (separación de funciones: quien aprueba o consulta no despacha ni ajusta). El Superusuario opera en todos.
 */
export function scopeOfUser(
  user: Pick<User, 'role' | 'branch' | 'additionalBranches' | 'warehouses'>,
  branches: Pick<Branch, 'id' | 'name' | 'status'>[],
  hasAllBranchesScope: boolean,
  warehouses: Pick<Warehouse, 'id' | 'status'>[] = [],
): SessionScope {
  const active = branches.filter(b => b.status === 'Activo');
  const activeWarehouses = warehouses.filter(w => w.status === 'Activo').map(w => w.id);
  const superuser = user.role === SUPERUSER;
  const all = superuser || user.branch === ALL || hasAllBranchesScope;
  const assigned = (user.warehouses ?? []).filter(id => activeWarehouses.includes(id));
  const warehouseIds = all ? activeWarehouses : assigned;
  const operableWarehouseIds = superuser ? activeWarehouses : assigned;
  if (all) return { allBranches: true, branchIds: active.map(b => b.id), warehouseIds, operableWarehouseIds };
  const names = [user.branch, ...(user.additionalBranches ?? [])];
  return { allBranches: false, branchIds: names.map(n => active.find(b => b.name === n)?.id).filter((x): x is string => !!x), warehouseIds, operableWarehouseIds };
}

/** Sin sede alcanzable: las pantallas no muestran datos de ninguna. */
export const NO_BRANCH = 'none';

/** La sede con la que empieza: «Vista global» para quien alcanza todas; para el resto, su sede principal (o su almacén, si solo trabaja en él). */
export function defaultViewBranch(scope: SessionScope, user: Pick<User, 'branch'>, branches: Pick<Branch, 'id' | 'name'>[]): string {
  if (scope.allBranches) return 'all';
  const main = branches.find(b => b.name === user.branch)?.id;
  return main && scope.branchIds.includes(main) ? main : scope.branchIds[0] ?? scope.operableWarehouseIds[0] ?? scope.warehouseIds[0] ?? NO_BRANCH;
}

/** ¿Puede ver esa sede, ese almacén (o la vista global)? */
export function viewBranchError(scope: SessionScope, branchId: string): string | null {
  if (branchId === 'all') return scope.allBranches ? null : 'Su cuenta no alcanza todas las sedes.';
  return scope.branchIds.includes(branchId) || scope.warehouseIds.includes(branchId) ? null : 'Su cuenta no alcanza esa sede.';
}

/** ¿Puede operar (mover stock) en ese almacén? Las sedes se rigen por su alcance de siempre. */
export function warehouseOperationError(scope: SessionScope, warehouseId: string): string | null {
  return scope.operableWarehouseIds.includes(warehouseId) ? null : 'Su cuenta no está asignada a ese almacén: ver su stock no autoriza a moverlo.';
}

/** «Piura», «Almacén central» o «Los Olivos + Almacén central»: dónde trabaja la cuenta, para mostrarlo. */
export const accountPlaceLabel = (user: Pick<User, 'branch' | 'warehouses'>, warehouses: Pick<Warehouse, 'id' | 'name'>[]): string =>
  [user.branch, ...(user.warehouses ?? []).map(id => warehouses.find(w => w.id === id)?.name ?? id)].filter(Boolean).join(' + ');

export interface ViewOption { id: string; name: string }

/** Lo que ofrece el selector del encabezado: nada si solo hay un lugar posible, y nunca más de lo que alcanza la cuenta. */
export function viewOptions(scope: SessionScope, locations: Pick<Branch, 'id' | 'name'>[]): ViewOption[] {
  const ids = [...scope.warehouseIds, ...scope.branchIds];
  const own = ids.map(id => locations.find(b => b.id === id)).filter((b): b is Pick<Branch, 'id' | 'name'> => !!b).map(b => ({ id: b.id, name: b.name }));
  const options = scope.allBranches ? [{ id: 'all', name: 'Vista global' }, ...own] : own;
  return options.length > 1 ? options : [];
}

/** Si la vista actual dejó de ser válida (cambió la cuenta o desapareció la sede), a cuál volver. */
export const validView = (scope: SessionScope, view: string, user: Pick<User, 'branch'>, branches: Pick<Branch, 'id' | 'name'>[]): string =>
  viewBranchError(scope, view) === null ? view : defaultViewBranch(scope, user, branches);

// ------------------------------------------------------------------------------------------------------------------ Quién trabaja

/** La cuenta con la que se trabaja, solo si sigue existiendo y activa (si no, la sesión queda bloqueada hasta entrar con un PIN). */
export const activeAccount = (users: User[], userId: string | null): User | null =>
  (userId ? users.find(u => u.id === userId && u.status === 'Activo') ?? null : null);

const MODULE_ORDER = ['operacion', 'logistica', 'psicopedagogia', 'personas', 'configuracion', 'organizacion', 'reportes', 'sistema'];

/** La primera pantalla a la que puede entrar la cuenta: Dashboard, Mensajería o el primer ítem del menú que su rol ve. */
export function firstPathFor(can: (capabilityId: string) => boolean): string {
  if (menuVisible('dashboard', 'Resumen general', can)) return '/dashboard/resumen-general';
  if (menuVisible('mensajeria', 'Mensajería', can)) return '/mensajeria';
  for (const moduleId of MODULE_ORDER) {
    const item = getAllItemsForModule(moduleId).find(i => !(moduleId === 'sistema' && i === 'Ayuda') && menuVisible(moduleId, i, can));
    if (item) return `/${moduleId}/${slugify(item)}`;
  }
  return '/dashboard/resumen-general';
}

// ------------------------------------------------------------------------------------------------------------------ Protecciones de las cuentas

type Change = { role?: string; status?: string };

/** Nunca se queda el sistema sin una cuenta de Superusuario activa: sin ella nadie podría administrar roles ni cuentas. */
export function lastSuperuserError(users: Pick<User, 'id' | 'role' | 'status'>[], userId: string, change: Change | 'delete'): string | null {
  const target = users.find(u => u.id === userId);
  if (!target || target.role !== SUPERUSER || target.status !== 'Activo') return null;
  const leaves = change === 'delete' || (change.role !== undefined && change.role !== SUPERUSER) || change.status === 'Inactivo';
  if (!leaves) return null;
  const others = users.filter(u => u.id !== userId && u.role === SUPERUSER && u.status === 'Activo').length;
  return others > 0 ? null : 'Es la única cuenta activa de Superusuario: sin ella nadie podría administrar roles ni cuentas.';
}

/** Nadie se cambia el rol ni el estado de su propia cuenta, ni la elimina: lo hace otra persona con autoridad. */
export function selfAccountError(activeUserId: string | null, userId: string, change: Change | 'delete'): string | null {
  if (!activeUserId || activeUserId !== userId) return null;
  if (change === 'delete') return 'No puede eliminar la cuenta con la que está trabajando.';
  const touches = (change.role !== undefined) || (change.status !== undefined);
  return touches ? 'No puede cambiar el rol ni el estado de su propia cuenta: pídaselo a otra persona.' : null;
}
