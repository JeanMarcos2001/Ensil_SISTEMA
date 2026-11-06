/**
 * Constructor de roles (reglas puras): lo que valida y calcula la pantalla de Permisos y la de Usuarios.
 *
 * - Un rol es un conjunto de funciones del registro (`capabilities.ts`). Al guardar se completa con lo que cada función necesita.
 * - Las combinaciones a separar (`roleWarnings`) no impiden guardar, pero **piden un motivo** que queda en el rol (quién, cuándo, por qué).
 * - El semáforo de contrapartes dice, con las cuentas de hoy, si lo que el rol hace tiene a quién llegar («Envío: sin receptor en Piura»).
 * - La vista previa del menú sale de las mismas funciones que muestran u ocultan cada ítem.
 * - El límite de cuentas por sede se mide con las cuentas ACTIVAS del rol.
 * - El rol y el usuario se enlazan por nombre (hasta el paso 10): renombrar o eliminar un rol cuida a las cuentas que lo usan.
 */
import type { Branch, Role, User } from '../context/DataContext';
import { MODULE_DATA } from '../config/modules';
import { hasSettingsAccess } from '../config/settingsSections';
import {
  capabilityById, holdersWith, isKnownCapability, menuCapabilities, roleClosure, roleWarnings, type Holder,
} from './capabilities';
import { menuCapabilityOf, menuVisible } from './guards';
import { isWarehouseId, shipmentRouteError, type StockLocation } from './logisticsRoutes';
import { MIN_REASON } from './assignments';

/** Una combinación a separar que se aceptó al guardar el rol, con su motivo. */
export interface AcceptedRisk { ruleId: string; reason: string; by: string; at: string }

// ------------------------------------------------------------------------------------------------------------------ Cuentas del rol

export interface RoleUsage { total: number; active: number }

/** Las cuentas que tienen el rol (todas, y de ellas las activas). El número no se guarda: se calcula. */
export function roleUsage(role: Pick<Role, 'name'>, users: Pick<User, 'role' | 'status'>[]): RoleUsage {
  const own = users.filter(u => u.role === role.name);
  return { total: own.length, active: own.filter(u => u.status === 'Activo').length };
}

const ALL_BRANCHES = 'Todas';
/** Los lugares que ocupa una cuenta: sus sedes (por nombre) y sus almacenes (por id `ALM-NNN`). */
const branchesOf = (u: Pick<User, 'branch' | 'additionalBranches' | 'warehouses'>): string[] => [u.branch, ...(u.additionalBranches ?? []), ...(u.warehouses ?? [])].filter(b => b && b !== ALL_BRANCHES);

/** Cuentas activas del rol que cubren la sede (como principal o adicional), sin contar una cuenta (la que se edita). */
export function seatsUsed(roleName: string, users: Pick<User, 'id' | 'role' | 'status' | 'branch' | 'additionalBranches' | 'warehouses'>[], branchName: string, exceptUserId?: string): number {
  return users.filter(u => u.id !== exceptUserId && u.role === roleName && u.status === 'Activo' && branchesOf(u).includes(branchName)).length;
}

type AccountInput = Pick<User, 'role' | 'status' | 'branch' | 'additionalBranches' | 'warehouses'>;

/**
 * ¿La cuenta cabe en el límite del rol? Solo mira las sedes que la cuenta pasa a ocupar: si ya ocupaba el lugar (misma cuenta, mismo rol
 * y sede, activa), no se le quita por un límite que se bajó después. Devuelve el mensaje, o `null` si cabe.
 */
export function seatLimitError(
  role: Pick<Role, 'name' | 'branchUserLimit'> | undefined,
  users: Pick<User, 'id' | 'role' | 'status' | 'branch' | 'additionalBranches' | 'warehouses'>[],
  next: AccountInput,
  before?: User,
): string | null {
  const limit = role?.branchUserLimit;
  if (!role || !limit || next.status !== 'Activo') return null;
  const already = before && before.status === 'Activo' && before.role === role.name ? branchesOf(before) : [];
  for (const branch of branchesOf(next)) {
    if (already.includes(branch)) continue;
    const used = seatsUsed(role.name, users, branch, before?.id);
    const place = isWarehouseId(branch) ? 'el almacén' : `«${branch}»`;
    if (used + 1 > limit) return `El rol «${role.name}» admite hasta ${limit} cuenta${limit === 1 ? '' : 's'} activa${limit === 1 ? '' : 's'} por sede o almacén y ${place} ya tiene ${used}.`;
  }
  return null;
}

/**
 * ¿Se puede dar este rol a una cuenta? Debe existir y estar activo, y un rol del sistema (Superusuario) solo lo da el Superusuario:
 * si no, quien puede asignar roles se daría a sí mismo cualquier acceso. `before` es la cuenta que se edita: si conserva el rol que ya
 * tenía no se le exige nada (una cuenta no queda mal por un rol que se apagó después).
 */
export function accountRoleError(roleName: string, roles: Pick<Role, 'name' | 'status' | 'locked'>[], actorIsSuperuser: boolean, before?: Pick<User, 'role'>): string | null {
  if (before && before.role === roleName) return null;
  const role = roles.find(r => r.name === roleName);
  if (!role) return roleName ? `El rol «${roleName}» no existe.` : 'Elija el rol de la cuenta.';
  if (role.status !== 'Activo') return `El rol «${roleName}» está inactivo: actívelo antes de asignarlo.`;
  if (role.locked && !actorIsSuperuser) return `Solo el Superusuario puede dar el rol «${roleName}».`;
  return null;
}

// ------------------------------------------------------------------------------------------------------------------ Rol: datos, bloqueo y baja

export interface RoleInput { name: string; desc?: string; branchUserLimit?: number }

export function validateRoleInput(input: RoleInput, roles: Pick<Role, 'id' | 'name'>[], editingId?: string): string | null {
  const name = input.name.trim();
  if (!name) return 'El nombre del rol es obligatorio.';
  if (name.length > 60) return 'El nombre del rol es demasiado largo (máximo 60 caracteres).';
  if (roles.some(r => r.id !== editingId && r.name.toLowerCase() === name.toLowerCase())) return 'Ya existe un rol con este nombre.';
  const limit = input.branchUserLimit;
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 50)) return 'El límite de cuentas por sede debe ser un número entero entre 1 y 50 (o vacío si no hay límite).';
  return null;
}

export const roleLockedError = (role: Pick<Role, 'name' | 'locked'>): string | null =>
  role.locked ? `El rol «${role.name}» es del sistema: no se edita, se desactiva ni se elimina.` : null;

/** Un rol con cuentas no se elimina: primero se reasignan (así nadie queda con un rol que ya no existe). */
export function roleDeleteError(role: Pick<Role, 'name' | 'locked'>, users: Pick<User, 'role' | 'status'>[]): string | null {
  const locked = roleLockedError(role);
  if (locked) return locked;
  const { total } = roleUsage(role, users);
  return total > 0 ? `El rol «${role.name}» tiene ${total} cuenta${total === 1 ? '' : 's'}: reasígnelas a otro rol antes de eliminarlo.` : null;
}

// ------------------------------------------------------------------------------------------------------------------ Guardar las funciones de un rol

export interface PermissionPlan {
  ok: boolean;
  error?: string;
  /** Las funciones que se guardan: lo elegido y lo que cada una necesita. */
  permissions: string[];
  /** Lo que se sumó solo. */
  added: string[];
  /** Combinaciones aceptadas que quedan en el rol (las que ya no aplican se descartan). */
  acceptedRisks: AcceptedRisk[];
}

/**
 * Valida y completa el conjunto de funciones de un rol. Las combinaciones a separar piden un motivo (`reasons[ruleId]`); si ya se
 * aceptaron antes con el mismo motivo y siguen igual, no se vuelve a pedir y se conserva quién y cuándo.
 */
export function planPermissions(role: Pick<Role, 'name' | 'locked' | 'acceptedRisks'>, chosen: string[], reasons: Record<string, string>, by: string, at: string): PermissionPlan {
  const fail = (error: string): PermissionPlan => ({ ok: false, error, permissions: [], added: [], acceptedRisks: [] });
  const locked = roleLockedError(role);
  if (locked) return fail(locked);
  const unknown = chosen.filter(id => !isKnownCapability(id));
  if (unknown.length > 0) return fail(`Funciones que no existen: ${unknown.join(', ')}.`);
  const reserved = chosen.filter(id => capabilityById(id)?.reserved);
  if (reserved.length > 0) return fail(`Todavía no se pueden dar: ${reserved.map(id => `«${capabilityById(id)!.label}»`).join(', ')}.`);
  const { all, added } = roleClosure(chosen);
  const accepted: AcceptedRisk[] = [];
  for (const rule of roleWarnings(all)) {
    const reason = (reasons[rule.id] ?? '').trim();
    const prior = role.acceptedRisks?.find(r => r.ruleId === rule.id);
    if (reason.length >= MIN_REASON) accepted.push(prior && prior.reason === reason ? prior : { ruleId: rule.id, reason, by, at });
    else if (prior) accepted.push(prior);
    else return fail(`Falta el motivo (mínimo ${MIN_REASON} letras) para aceptar esta combinación: ${rule.message}`);
  }
  return { ok: true, permissions: all, added, acceptedRisks: accepted };
}

// ------------------------------------------------------------------------------------------------------------------ Vista previa del menú

export interface MenuPreviewModule { id: string; title: string; items: string[] }

/**
 * El menú que vería una cuenta con estas funciones (los módulos sin ítems visibles no aparecen). Solo cuenta lo que pide una función:
 * lo que ve todo el mundo (Preferencias) no distingue a un rol de otro.
 */
export function menuPreview(selected: Iterable<string>): { modules: MenuPreviewModule[]; settings: boolean } {
  const have = new Set(selected);
  const can = (id: string) => have.has(id);
  const modules: MenuPreviewModule[] = Object.entries(MODULE_DATA)
    .map(([id, m]) => ({ id, title: m.title, items: m.groups.flatMap(g => g.items).filter(item => menuCapabilityOf(id, item) !== undefined && menuVisible(id, item, can)) }))
    .filter(m => m.items.length > 0);
  // Los módulos de un solo ítem que no están en `MODULE_DATA` (Mensajería) van después del Dashboard
  const direct = menuCapabilities().filter(m => !(m.module in MODULE_DATA) && can(m.capability)).map(m => ({ id: m.module, title: m.item, items: [m.item] }));
  modules.splice(modules[0]?.id === 'dashboard' ? 1 : 0, 0, ...direct);
  return { modules, settings: hasSettingsAccess(can) };
}

// ------------------------------------------------------------------------------------------------------------------ Semáforo de contrapartes

export type CounterpartState = 'ok' | 'falta' | 'sin-cuentas';

export interface CounterpartRow {
  /** La función del rol que necesita a otra persona. */
  capabilityId: string;
  counterpartId: string;
  strength: 'required' | 'advisory';
  why: string;
  state: CounterpartState;
  /** Dónde falta (nombres de sede) o «toda la empresa». */
  missingIn: string[];
}

type LocationLike = Pick<StockLocation, 'id' | 'name' | 'status' | 'kind'>;

/**
 * Para cada contraparte de las funciones del rol: ¿hay quien la cubra con las cuentas de hoy? `holders` ya debe traer el rol con las
 * funciones que se están armando. `roleBranchIds` son las sedes donde el rol tiene cuentas activas (para lo que debe cubrirse «en la
 * misma sede»); sin cuentas todavía no se puede medir y se dice así.
 */
export function counterpartStatus(selected: string[], holders: Holder[], locations: LocationLike[], roleBranchIds: string[]): CounterpartRow[] {
  const active = locations.filter(b => b.status === 'Activo');
  // Las contrapartes se miden en las sedes; el almacén solo es el origen de los envíos
  const sedes = active.filter(b => b.kind === 'sede');
  const warehouse = active.find(b => b.kind === 'almacén');
  const rows: CounterpartRow[] = [];
  for (const id of selected) {
    for (const cp of capabilityById(id)?.counterparts ?? []) {
      const base = { capabilityId: id, counterpartId: cp.capability, strength: cp.strength, why: cp.why };
      if (cp.where === 'any') {
        const covered = holdersWith(cp.capability, holders).length > 0;
        rows.push({ ...base, state: covered ? 'ok' : 'falta', missingIn: covered ? [] : ['toda la empresa'] });
        continue;
      }
      let targets: LocationLike[];
      if (cp.where === 'same-branch') {
        targets = sedes.filter(b => roleBranchIds.includes(b.id));
        if (targets.length === 0) { rows.push({ ...base, state: 'sin-cuentas', missingIn: [] }); continue; }
      } else {
        // Un envío sale siempre del almacén central: nunca llega a él ni entre sedes (`shipmentRouteError`)
        targets = id.startsWith('log-envios:') && warehouse ? sedes.filter(b => shipmentRouteError(warehouse.id, b.id, locations as StockLocation[]) === null) : sedes;
      }
      const missing = targets.filter(b => holdersWith(cp.capability, holders, b.id).length === 0).map(b => b.name);
      rows.push({ ...base, state: missing.length === 0 ? 'ok' : 'falta', missingIn: missing });
    }
  }
  return rows;
}
