/**
 * Sesión provisional (paso 7 del plan de roles): quién está trabajando, el cambio rápido de usuario con PIN y la sede que ve.
 *
 * No es seguridad real (llega con el servidor, paso 10): el PIN se guarda con una marca irreversible para que no quede a la vista en el
 * almacenamiento del navegador, pero un PIN de 4 a 6 dígitos se adivina sin esfuerzo si alguien lee esa marca. Sirve para lo que pide el
 * negocio: una laptop por sede, cuentas por persona, cambio rápido y que cada movimiento quede a nombre de quien lo hizo.
 *
 * - Una cuenta entra con su PIN; tras 5 intentos fallidos se bloquea 60 segundos.
 * - La sede que se ve sale de la cuenta: quien alcanza una sola sede queda en ella; quien alcanza varias o todas elige entre las suyas.
 * - Nunca se queda el sistema sin una cuenta de Superusuario activa, y nadie se cambia el rol ni el estado de su propia cuenta.
 */
import type { Branch, User } from '../context/DataContext';
import { getAllItemsForModule } from '../config/modules';
import { SUPERUSER } from './authority';
import { menuVisible } from './guards';
import { slugify } from './string';

export const SESSION_STORAGE_KEY = 'ensil.session';
export const SESSION_VERSION = 1;

// ------------------------------------------------------------------------------------------------------------------ PIN

export const PIN_PATTERN = /^\d{4,6}$/;
export const PIN_MAX_ATTEMPTS = 5;
export const PIN_LOCK_MS = 60_000;

export const pinError = (pin: string): string | null => (PIN_PATTERN.test(pin) ? null : 'El PIN debe tener de 4 a 6 dígitos (solo números).');

/** Marca irreversible del PIN (con la cuenta como sal). No es cifrado fuerte: ver la nota del archivo. */
export function hashPin(userId: string, pin: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  const text = `ensil:${userId}:${pin}`;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

export const pinMatches = (user: Pick<User, 'id' | 'pinHash'>, pin: string): boolean => !!user.pinHash && user.pinHash === hashPin(user.id, pin);

/** Intentos fallidos por cuenta (en memoria: recargar la página los reinicia). */
export type PinAttempts = Record<string, { failures: number; lockedUntil?: number }>;

export interface PinLock { locked: boolean; remainingMs: number }

export function pinLock(attempts: PinAttempts, userId: string, now: number): PinLock {
  const until = attempts[userId]?.lockedUntil ?? 0;
  return until > now ? { locked: true, remainingMs: until - now } : { locked: false, remainingMs: 0 };
}

const seconds = (ms: number) => Math.max(1, Math.ceil(ms / 1000));

/** Anota un intento: el acierto limpia los fallos; el fallo número 5 bloquea la cuenta 60 segundos. */
export function registerPinAttempt(attempts: PinAttempts, userId: string, ok: boolean, now: number): PinAttempts {
  const { [userId]: before, ...rest } = attempts;
  if (ok) return rest;
  const failures = (before?.lockedUntil && before.lockedUntil <= now ? 0 : before?.failures ?? 0) + 1;
  return failures >= PIN_MAX_ATTEMPTS ? { ...rest, [userId]: { failures: 0, lockedUntil: now + PIN_LOCK_MS } } : { ...rest, [userId]: { failures } };
}

export interface PinResult { ok: boolean; error?: string; attempts: PinAttempts }

/** Comprueba el PIN de una cuenta aplicando el bloqueo. Con el bloqueo vigente ni siquiera se mira el PIN. */
export function checkPin(user: Pick<User, 'id' | 'pinHash'>, pin: string, attempts: PinAttempts, now: number): PinResult {
  const lock = pinLock(attempts, user.id, now);
  if (lock.locked) return { ok: false, error: `Demasiados intentos: espere ${seconds(lock.remainingMs)} segundos.`, attempts };
  if (!user.pinHash) return { ok: false, error: 'Esta cuenta no tiene PIN: pídale al Superusuario que se lo asigne.', attempts };
  if (!PIN_PATTERN.test(pin)) return { ok: false, error: pinError(pin)!, attempts };
  const ok = pinMatches(user, pin);
  const next = registerPinAttempt(attempts, user.id, ok, now);
  if (ok) return { ok: true, attempts: next };
  const after = pinLock(next, user.id, now);
  if (after.locked) return { ok: false, error: `PIN incorrecto. La cuenta se bloquea ${seconds(after.remainingMs)} segundos.`, attempts: next };
  const left = PIN_MAX_ATTEMPTS - (next[user.id]?.failures ?? 0);
  return { ok: false, error: `PIN incorrecto. Le quedan ${left} intento${left === 1 ? '' : 's'}.`, attempts: next };
}

/** Entrar a una cuenta: debe existir, estar activa y tener el PIN correcto. */
export function trySwitch(users: User[], userId: string, pin: string, attempts: PinAttempts, now: number): PinResult & { user?: User } {
  const user = users.find(u => u.id === userId);
  if (!user || user.status !== 'Activo') return { ok: false, error: 'La cuenta no existe o está inactiva.', attempts };
  const res = checkPin(user, pin, attempts, now);
  return res.ok ? { ...res, user } : res;
}

/** Cambiar el PIN propio: pide el actual, el nuevo debe cumplir el formato y ser distinto. */
export function tryChangePin(user: User, currentPin: string, nextPin: string, attempts: PinAttempts, now: number): PinResult & { pinHash?: string } {
  if (user.pinHash) {
    const res = checkPin(user, currentPin, attempts, now);
    if (!res.ok) return res;
    attempts = res.attempts;
  }
  const bad = pinError(nextPin);
  if (bad) return { ok: false, error: bad.replace('El PIN', 'El PIN nuevo'), attempts };
  if (user.pinHash && pinMatches(user, nextPin)) return { ok: false, error: 'El PIN nuevo debe ser distinto del actual.', attempts };
  return { ok: true, attempts, pinHash: hashPin(user.id, nextPin) };
}

/** ¿Quién puede fijar el PIN de una cuenta? Cambiar el de un Superusuario es tomar su acceso: solo lo hace otro Superusuario. */
export function pinSetError(actorIsSuperuser: boolean, target: Pick<User, 'role'>): string | null {
  return target.role === SUPERUSER && !actorIsSuperuser ? 'Solo un Superusuario puede cambiar el PIN de una cuenta de Superusuario.' : null;
}

// ------------------------------------------------------------------------------------------------------------------ Sede que se ve

export interface SessionScope { allBranches: boolean; branchIds: string[] }

const ALL = 'Todas';

/**
 * Las sedes que alcanza la cuenta: todas si es Superusuario, si su sede es «Todas» o si su rol tiene el alcance de todas las sedes;
 * si no, su sede principal y las adicionales (solo las que existen).
 */
export function scopeOfUser(user: Pick<User, 'role' | 'branch' | 'additionalBranches'>, branches: Pick<Branch, 'id' | 'name' | 'status'>[], hasAllBranchesScope: boolean): SessionScope {
  const active = branches.filter(b => b.status === 'Activo');
  const all = user.role === SUPERUSER || user.branch === ALL || hasAllBranchesScope;
  if (all) return { allBranches: true, branchIds: active.map(b => b.id) };
  const names = [user.branch, ...(user.additionalBranches ?? [])];
  return { allBranches: false, branchIds: names.map(n => active.find(b => b.name === n)?.id).filter((x): x is string => !!x) };
}

/** Sin sede alcanzable: las pantallas no muestran datos de ninguna. */
export const NO_BRANCH = 'none';

/** La sede con la que empieza: «Vista global» para quien alcanza todas; para el resto, su sede principal. */
export function defaultViewBranch(scope: SessionScope, user: Pick<User, 'branch'>, branches: Pick<Branch, 'id' | 'name'>[]): string {
  if (scope.allBranches) return 'all';
  const main = branches.find(b => b.name === user.branch)?.id;
  return main && scope.branchIds.includes(main) ? main : scope.branchIds[0] ?? NO_BRANCH;
}

/** ¿Puede ver esa sede (o la vista global)? */
export function viewBranchError(scope: SessionScope, branchId: string): string | null {
  if (branchId === 'all') return scope.allBranches ? null : 'Su cuenta no alcanza todas las sedes.';
  return scope.branchIds.includes(branchId) ? null : 'Su cuenta no alcanza esa sede.';
}

export interface ViewOption { id: string; name: string }

/** Lo que ofrece el selector del encabezado: nada si solo hay una sede posible, y nunca más de lo que alcanza la cuenta. */
export function viewOptions(scope: SessionScope, branches: Pick<Branch, 'id' | 'name'>[]): ViewOption[] {
  const own = scope.branchIds.map(id => branches.find(b => b.id === id)).filter((b): b is Pick<Branch, 'id' | 'name'> => !!b).map(b => ({ id: b.id, name: b.name }));
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

export type StoredSession = { state: 'none' } | { state: 'locked' } | { state: 'user'; userId: string };

export const serializeSession = (userId: string | null): string => JSON.stringify({ version: SESSION_VERSION, userId });

export function parseSession(raw: string | null): StoredSession {
  if (raw === null) return { state: 'none' };
  try {
    const data = JSON.parse(raw) as { version?: unknown; userId?: unknown };
    if (data?.version !== SESSION_VERSION) return { state: 'none' };
    if (data.userId === null) return { state: 'locked' };
    return typeof data.userId === 'string' && data.userId ? { state: 'user', userId: data.userId } : { state: 'none' };
  } catch {
    return { state: 'none' };
  }
}

/**
 * Con quién empieza el sistema: con la cuenta de la última vez si sigue activa; bloqueado si estaba bloqueado o esa cuenta ya no sirve.
 * La primera vez (nada guardado) entra el Superusuario sin PIN: es la comodidad de la etapa de pruebas, hasta el inicio de sesión real.
 */
export function initialUserId(stored: StoredSession, users: User[]): string | null {
  if (stored.state === 'locked') return null;
  if (stored.state === 'user') return activeAccount(users, stored.userId)?.id ?? null;
  return users.find(u => u.role === SUPERUSER && u.status === 'Activo')?.id ?? null;
}

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

/** «Hoy 08:10» para la última entrada de una cuenta. */
export function lastAccessLabel(now: Date): string {
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return `Hoy ${hh}:${mm}`;
}

// ------------------------------------------------------------------------------------------------------------------ Navegador

function storage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

export function readStoredSession(): string | null {
  try { return storage()?.getItem(SESSION_STORAGE_KEY) ?? null; } catch { return null; }
}

/** Recuerda con quién se estaba trabajando (`null` = sesión bloqueada). Sin almacenamiento no hace nada. */
export function writeStoredSession(userId: string | null): void {
  try { storage()?.setItem(SESSION_STORAGE_KEY, serializeSession(userId)); } catch { /* sin almacenamiento: no se recuerda */ }
}

export function clearStoredSession(): void {
  try { storage()?.removeItem(SESSION_STORAGE_KEY); } catch { /* ignorar */ }
}
