/**
 * Persistencia provisional de roles, permisos y cuentas (paso 6 del plan de roles): se guardan en el navegador para que lo armado en
 * Organización → Permisos / Roles / Usuarios no se pierda al recargar. Es un puente hasta la base de datos (paso 10): vive solo en ese
 * navegador, no protege nada y no toca el resto de los datos (matrículas, pagos, stock… siguen en memoria).
 *
 * Lo guardado se trata como no confiable: se valida campo a campo y se descarta lo que ya no cuadra con el resto del sistema.
 * - Los roles del sistema (Superusuario) **nunca** salen de lo guardado: siempre son los de partida.
 * - Una función que ya no existe, o que hoy es reservada, se quita del rol; lo que cada función necesita se vuelve a completar.
 * - Una combinación aceptada solo se conserva si todavía aplica.
 * - Una cuenta se descarta si su rol, su sede o su trabajador ya no existen (esos datos vuelven a los de ejemplo al recargar).
 */
import type { Permission, Role, User } from '../context/DataContext';
import { capabilityById, isKnownCapability, roleClosure, roleWarnings } from './capabilities';
import type { AcceptedRisk } from './roleBuilder';

export const ACCESS_STORAGE_KEY = 'ensil.access';
export const ACCESS_VERSION = 1;

export interface AccessSnapshot { roles: Role[]; permissions: Permission[]; users: User[] }

/** Lo que existe hoy fuera de roles y cuentas, para comprobar que lo guardado todavía apunta a algo real. */
export interface AccessKnown { branchNames: string[]; staffIds: string[] }

export interface AccessRestore {
  snapshot: AccessSnapshot;
  /** `true` si se usó lo guardado en el navegador (aunque se haya depurado). */
  restored: boolean;
  /** Qué se descartó o por qué se volvió a los datos de ejemplo. */
  notes: string[];
}

export const serializeAccess = (s: AccessSnapshot): string =>
  JSON.stringify({ version: ACCESS_VERSION, roles: s.roles, permissions: s.permissions, users: s.users });

// ------------------------------------------------------------------------------------------------------------------ Lectura defensiva

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const STATUS = ['Activo', 'Inactivo'] as const;
const statusOf = (v: unknown): 'Activo' | 'Inactivo' | undefined => STATUS.find(s => s === v);
const strings = (v: unknown): string[] | undefined => (Array.isArray(v) && v.every(x => typeof x === 'string') ? (v as string[]) : undefined);

function readRisks(v: unknown): AcceptedRisk[] {
  if (!Array.isArray(v)) return [];
  const out: AcceptedRisk[] = [];
  for (const x of v) {
    if (!isRec(x)) continue;
    const { ruleId, reason, by, at } = x;
    if (typeof ruleId === 'string' && typeof reason === 'string' && typeof by === 'string' && typeof at === 'string') out.push({ ruleId, reason, by, at });
  }
  return out;
}

function readRole(v: unknown): Role | null {
  if (!isRec(v)) return null;
  const id = text(v.id)?.trim();
  const name = text(v.name)?.trim();
  const status = statusOf(v.status);
  if (!id || !name || name.length > 60 || !status) return null;
  const limit = v.branchUserLimit;
  return {
    id, name, desc: text(v.desc) ?? '', status,
    templateId: text(v.templateId),
    observations: text(v.observations),
    branchUserLimit: typeof limit === 'number' && Number.isInteger(limit) && limit >= 1 && limit <= 50 ? limit : undefined,
    acceptedRisks: readRisks(v.acceptedRisks),
  };
}

function readUser(v: unknown): User | null {
  if (!isRec(v)) return null;
  const id = text(v.id)?.trim();
  const name = text(v.name)?.trim();
  const role = text(v.role);
  const branch = text(v.branch);
  const status = statusOf(v.status);
  if (!id || !name || !role || !branch || !status) return null;
  return {
    id, name, role, branch, status,
    email: text(v.email) ?? '',
    lastAccess: text(v.lastAccess) ?? 'Nunca',
    document: text(v.document), phone: text(v.phone), staffId: text(v.staffId), statusNote: text(v.statusNote), pinHash: text(v.pinHash)?.trim() || undefined,
    additionalBranches: strings(v.additionalBranches),
  };
}

const usable = (id: string): boolean => isKnownCapability(id) && !capabilityById(id)?.reserved;

// ------------------------------------------------------------------------------------------------------------------ Restaurar

/** Lee lo guardado y lo depura contra los datos de partida (`seed`) y lo que existe hoy (`known`). Nunca lanza. */
export function restoreAccess(raw: string | null, seed: AccessSnapshot, known: AccessKnown): AccessRestore {
  const fallback = (notes: string[] = []): AccessRestore => ({ snapshot: seed, restored: false, notes });
  if (raw === null) return fallback();
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return fallback(['Lo guardado en el navegador no se pudo leer: se usan los roles y cuentas de ejemplo.']); }
  if (!isRec(data) || data.version !== ACCESS_VERSION || !Array.isArray(data.roles) || !Array.isArray(data.permissions) || !Array.isArray(data.users)) {
    return fallback(['Lo guardado en el navegador es de otra versión: se usan los roles y cuentas de ejemplo.']);
  }

  const notes: string[] = [];

  // Roles: los del sistema salen siempre de la partida (en el lugar donde estaban); el resto, de lo guardado.
  const systemRoles = seed.roles.filter(r => r.locked);
  const roles: Role[] = [];
  const names = new Set(systemRoles.map(r => r.name.toLowerCase()));
  const ids = new Set(systemRoles.map(r => r.id));
  const placed = new Set<string>();
  let badRoles = 0;
  for (const item of data.roles) {
    const stamped = isRec(item) && item.locked === true;
    const system = stamped ? systemRoles.find(r => r.id === text(item.id) && !placed.has(r.id)) : undefined;
    if (system) { placed.add(system.id); roles.push(system); continue; }
    const role = stamped ? null : readRole(item);
    if (!role || ids.has(role.id) || names.has(role.name.toLowerCase())) { if (!stamped) badRoles++; continue; }
    ids.add(role.id); names.add(role.name.toLowerCase());
    roles.push(role);
  }
  for (const system of systemRoles) if (!placed.has(system.id)) roles.push(system);
  if (badRoles > 0) notes.push(`Se descartaron ${badRoles} rol${badRoles === 1 ? '' : 'es'} guardado${badRoles === 1 ? '' : 's'} con datos no válidos o repetidos.`);

  // Permisos: solo funciones que existen y se pueden dar, completadas con lo que cada una necesita.
  const permissions: Permission[] = [];
  const withPerms = new Set<string>();
  for (const item of data.permissions) {
    if (!isRec(item)) continue;
    const roleId = text(item.roleId);
    const list = strings(item.permissions);
    const role = roles.find(r => r.id === roleId);
    if (!role || !list || withPerms.has(role.id)) continue;
    withPerms.add(role.id);
    permissions.push(role.locked
      ? seed.permissions.find(p => p.roleId === role.id) ?? { roleId: role.id, permissions: [] }
      : { roleId: role.id, permissions: roleClosure(list.filter(usable)).all });
  }
  for (const role of systemRoles) if (!withPerms.has(role.id)) permissions.push(seed.permissions.find(p => p.roleId === role.id) ?? { roleId: role.id, permissions: [] });

  // Combinaciones aceptadas: solo las que todavía aplican con las funciones que quedaron.
  for (const role of roles) {
    if (role.locked) continue;
    const granted = permissions.find(p => p.roleId === role.id)?.permissions ?? [];
    const applying = new Set(roleWarnings(granted).map(w => w.id));
    const kept = (role.acceptedRisks ?? []).filter(r => applying.has(r.ruleId));
    role.acceptedRisks = kept.length > 0 ? kept : undefined;
  }

  // Cuentas: el rol, la sede y el trabajador deben existir hoy.
  const users: User[] = [];
  const userIds = new Set<string>();
  let badUsers = 0;
  for (const item of data.users) {
    const user = readUser(item);
    const places = user ? [user.branch, ...(user.additionalBranches ?? [])] : [];
    const ok = !!user && !userIds.has(user.id)
      && roles.some(r => r.name === user.role)
      && places.every(b => b === 'Todas' || known.branchNames.includes(b))
      && (!user.staffId || known.staffIds.includes(user.staffId));
    if (!ok) { badUsers++; continue; }
    userIds.add(user!.id);
    // Lo guardado antes de que existiera el PIN: las cuentas de ejemplo vuelven a tener el suyo (el de ejemplo)
    const original = user!.pinHash ? undefined : seed.users.find(u => u.id === user!.id && u.email === user!.email);
    users.push(original?.pinHash ? { ...user!, pinHash: original.pinHash } : user!);
  }
  // Siempre hay una cuenta de Superusuario activa: si lo guardado no la trae (otra versión, borrada a mano), vuelve la de partida.
  if (!users.some(u => u.status === 'Activo' && roles.some(r => r.locked && r.name === u.role))) {
    for (const account of seed.users) {
      if (!roles.some(r => r.locked && r.name === account.role) || userIds.has(account.id)) continue;
      users.push(account); userIds.add(account.id);
    }
  }
  if (badUsers > 0) notes.push(`Se descartaron ${badUsers} cuenta${badUsers === 1 ? '' : 's'} guardada${badUsers === 1 ? '' : 's'} cuyo rol, sede o trabajador ya no existe.`);

  return { snapshot: { roles, permissions, users }, restored: true, notes };
}

// ------------------------------------------------------------------------------------------------------------------ Navegador

function storage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

/** Lo guardado en el navegador, o `null` si no hay (o no hay almacenamiento). */
export function readStoredAccess(): string | null {
  try { return storage()?.getItem(ACCESS_STORAGE_KEY) ?? null; } catch { return null; }
}

/** Guarda roles, permisos y cuentas. Sin almacenamiento disponible no hace nada: el sistema sigue funcionando en memoria. */
export function writeStoredAccess(s: AccessSnapshot): void {
  try { storage()?.setItem(ACCESS_STORAGE_KEY, serializeAccess(s)); } catch { /* sin almacenamiento o sin espacio: no se guarda */ }
}

/** Borra lo guardado: al recargar vuelven los roles y cuentas de ejemplo. */
export function clearStoredAccess(): void {
  try { storage()?.removeItem(ACCESS_STORAGE_KEY); } catch { /* ignorar */ }
}
