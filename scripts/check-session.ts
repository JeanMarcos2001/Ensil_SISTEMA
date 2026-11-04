/**
 * Verificación de la sesión provisional (paso 7): cambio rápido de usuario con PIN (y su bloqueo), la sede que ve cada cuenta, las
 * protecciones de las cuentas (la última de Superusuario, la propia) y las cifras del Dashboard por sede.
 * Ejecutar: npx tsx scripts/check-session.ts
 */
import type { Branch, User } from '../src/context/DataContext';
import { SEED_PIN, seedBranches, seedPermissions, seedRoles, seedStaff, seedUsers } from '../src/data/seedCatalog';
import { restoreAccess, serializeAccess } from '../src/utils/accessStore';
import { scopeDashboard, type DashboardContext } from '../src/utils/dashboard';
import { PERM } from '../src/utils/authority';
import {
  PIN_LOCK_MS, PIN_MAX_ATTEMPTS, SESSION_STORAGE_KEY, NO_BRANCH, activeAccount, checkPin, clearStoredSession, defaultViewBranch, hashPin, initialUserId,
  lastAccessLabel, lastSuperuserError, parseSession, pinError, pinLock, pinMatches, pinSetError, readStoredSession, registerPinAttempt, scopeOfUser,
  selfAccountError, serializeSession, tryChangePin, trySwitch, validView, viewBranchError, viewOptions, writeStoredSession, type PinAttempts,
} from '../src/utils/session';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : ` -> ${detail}`}`);
  if (!ok) failed++;
};

const branches = seedBranches();
const roles = seedRoles();
const permissions = seedPermissions();
const users = seedUsers();
const byName = (n: string) => users.find(u => u.name === n)!;
const branchId = (n: string) => branches.find(b => b.name === n)!.id;
const hasAll = (u: User) => {
  const role = roles.find(r => r.name === u.role);
  return !!role && (permissions.find(p => p.roleId === role.id)?.permissions ?? []).includes(PERM.allBranches);
};
const scopeOf = (u: User) => scopeOfUser(u, branches, hasAll(u));
const T0 = 1_000_000;

// ------------------------------------------------------------------------------------------------------------------ PIN
check('El PIN tiene de 4 a 6 dígitos y solo números', ['1234', '123456', '0000'].every(p => pinError(p) === null) && ['', '123', '1234567', '12a4', '12 34', ' 1234'].every(p => pinError(p) !== null));
check('La marca del PIN no es el PIN y siempre sale igual', hashPin('USR-001', '1234') === hashPin('USR-001', '1234') && !hashPin('USR-001', '1234').includes('1234'));
check('La marca depende de la cuenta (el mismo PIN en dos cuentas no deja la misma marca) y del PIN', hashPin('USR-001', '1234') !== hashPin('USR-002', '1234') && hashPin('USR-001', '1234') !== hashPin('USR-001', '1235'));
check('Un PIN solo coincide con su marca', pinMatches({ id: 'USR-001', pinHash: hashPin('USR-001', '4321') }, '4321') && !pinMatches({ id: 'USR-001', pinHash: hashPin('USR-001', '4321') }, '4322') && !pinMatches({ id: 'USR-001' }, '4321'));

const account = { id: 'USR-100', pinHash: hashPin('USR-100', '4321') };
let attempts: PinAttempts = {};
const wrong1 = checkPin(account, '0000', attempts, T0);
check('Un PIN incorrecto se rechaza y dice cuántos intentos quedan', !wrong1.ok && /Le quedan 4 intentos/.test(wrong1.error ?? ''), wrong1.error);
attempts = wrong1.attempts;
check('Al cuarto fallo avisa que queda un solo intento', (() => { let a: PinAttempts = {}; let r = checkPin(account, '0000', a, T0); for (let i = 1; i < PIN_MAX_ATTEMPTS - 1; i++) r = checkPin(account, '0000', r.attempts, T0); return /Le quedan 1 intento\./.test(r.error ?? ''); })());
let locked: PinAttempts = {};
for (let i = 0; i < PIN_MAX_ATTEMPTS; i++) locked = checkPin(account, '0000', locked, T0).attempts;
check(`Tras ${PIN_MAX_ATTEMPTS} fallos la cuenta se bloquea ${PIN_LOCK_MS / 1000} segundos`, pinLock(locked, 'USR-100', T0).locked && pinLock(locked, 'USR-100', T0).remainingMs === PIN_LOCK_MS);
const whileLocked = checkPin(account, '4321', locked, T0 + 5_000);
check('Con la cuenta bloqueada ni el PIN correcto entra (y avisa cuánto falta)', !whileLocked.ok && /Demasiados intentos: espere 55 segundos/.test(whileLocked.error ?? ''), whileLocked.error);
check('Pasado el bloqueo el PIN correcto entra y se limpian los fallos', (() => { const r = checkPin(account, '4321', locked, T0 + PIN_LOCK_MS + 1); return r.ok && r.attempts['USR-100'] === undefined; })());
check('Tras el bloqueo se empieza de cero (otros 5 intentos), no con un fallo y listo', (() => { const r = checkPin(account, '0000', locked, T0 + PIN_LOCK_MS + 1); return !r.ok && /Le quedan 4 intentos/.test(r.error ?? ''); })());
check('Un acierto borra los fallos anteriores', (() => { const r = checkPin(account, '4321', checkPin(account, '0000', {}, T0).attempts, T0); return r.ok && Object.keys(r.attempts).length === 0; })());
check('Un PIN con formato inválido se rechaza sin contar como intento', (() => { const r = checkPin(account, '12', {}, T0); return !r.ok && Object.keys(r.attempts).length === 0; })());
check('Una cuenta sin PIN no puede entrar y dice qué hacer', (() => { const r = checkPin({ id: 'USR-101' }, '1234', {}, T0); return !r.ok && /no tiene PIN/.test(r.error ?? ''); })());
check('Los fallos de una cuenta no bloquean a otra', (() => { let a: PinAttempts = {}; for (let i = 0; i < PIN_MAX_ATTEMPTS; i++) a = registerPinAttempt(a, 'USR-A', false, T0); return pinLock(a, 'USR-A', T0).locked && !pinLock(a, 'USR-B', T0).locked; })());

// ------------------------------------------------------------------------------------------------------------------ Cambio de usuario
check('Todas las cuentas de ejemplo entran con el PIN de ejemplo', users.every(u => !!u.pinHash && pinMatches(u, SEED_PIN)));
const laura = byName('Laura Martínez');
check('Entrar a una cuenta activa con su PIN devuelve la cuenta', (() => { const r = trySwitch(users, laura.id, SEED_PIN, {}, T0); return r.ok && r.user?.id === laura.id; })());
check('Una cuenta inactiva no entra, ni con el PIN correcto', (() => { const r = trySwitch(users, byName('Jorge Torres').id, SEED_PIN, {}, T0); return !r.ok && /inactiva/.test(r.error ?? ''); })());
check('Una cuenta que no existe no entra', !trySwitch(users, 'USR-999', SEED_PIN, {}, T0).ok);
check('El PIN equivocado no entra y se anota el intento', (() => { const r = trySwitch(users, laura.id, '9999', {}, T0); return !r.ok && r.attempts[laura.id]?.failures === 1; })());

// ------------------------------------------------------------------------------------------------------------------ Cambiar el propio PIN
check('Cambiar el PIN propio pide el actual', (() => { const r = tryChangePin(laura, '0000', '5678', {}, T0); return !r.ok && /PIN incorrecto/.test(r.error ?? ''); })());
check('El PIN nuevo debe cumplir el formato y ser distinto del actual', (() => {
  const short = tryChangePin(laura, SEED_PIN, '12', {}, T0);
  const same = tryChangePin(laura, SEED_PIN, SEED_PIN, {}, T0);
  return !short.ok && /PIN nuevo/.test(short.error ?? '') && !same.ok && /distinto/.test(same.error ?? '');
})());
check('Con el PIN actual correcto se guarda la marca del nuevo', (() => { const r = tryChangePin(laura, SEED_PIN, '5678', {}, T0); return r.ok && !!r.pinHash && pinMatches({ id: laura.id, pinHash: r.pinHash }, '5678'); })());
check('Quien no tiene PIN fija el primero sin pedir uno actual', (() => { const bare: User = { ...laura, pinHash: undefined }; const r = tryChangePin(bare, '', '5678', {}, T0); return r.ok && !!r.pinHash; })());
check('Adivinar el PIN actual al cambiarlo también cuenta para el bloqueo', (() => { let a: PinAttempts = {}; for (let i = 0; i < PIN_MAX_ATTEMPTS; i++) a = tryChangePin(laura, '0000', '5678', a, T0).attempts; return pinLock(a, laura.id, T0).locked; })());
check('Cambiar el PIN de un Superusuario solo lo hace otro Superusuario', pinSetError(false, { role: 'Superusuario' }) !== null && pinSetError(true, { role: 'Superusuario' }) === null && pinSetError(false, { role: 'Contabilidad' }) === null);

// ------------------------------------------------------------------------------------------------------------------ Sede que se ve
const superadmin = byName('Superadmin');
const rosa = byName('Rosa Quispe');
const elena = byName('Elena Ramos');
const marco = byName('Marco Salas');
const adminGeneral = byName('Admin Sistema');
check('El Superusuario alcanza todas las sedes activas', scopeOf(superadmin).allBranches && scopeOf(superadmin).branchIds.length === branches.filter(b => b.status === 'Activo').length);
check('Una cuenta de sede «Todas» alcanza todas', scopeOf(adminGeneral).allBranches);
check('El Almacén central y Contabilidad alcanzan todas por su rol, aunque su sede sea Los Olivos', scopeOf(rosa).allBranches && scopeOf(elena).allBranches && rosa.branch === 'Los Olivos');
check('Un administrador de sede alcanza solo su sede', !scopeOf(laura).allBranches && scopeOf(laura).branchIds.join() === branchId('Piura') && scopeOf(marco).branchIds.join() === branchId('Los Olivos'));
check('Las sedes adicionales se suman; una que no existe o está inactiva se ignora', (() => {
  const twin: User = { ...laura, additionalBranches: ['Chiclayo', 'Marte'] };
  const withInactive: Pick<Branch, 'id' | 'name' | 'status'>[] = branches.map(b => (b.name === 'Chiclayo' ? { ...b, status: 'Inactivo' as const } : b));
  return scopeOfUser(twin, branches, false).branchIds.length === 2 && scopeOfUser(twin, withInactive, false).branchIds.join() === branchId('Piura');
})());
check('Con todas las sedes la vista empieza en «Vista global»; con una sola, en su sede', defaultViewBranch(scopeOf(superadmin), superadmin, branches) === 'all' && defaultViewBranch(scopeOf(laura), laura, branches) === branchId('Piura'));
check('Una cuenta sin ninguna sede alcanzable no ve datos de ninguna', (() => { const lost: User = { ...laura, branch: 'Marte' }; const s = scopeOf(lost); return s.branchIds.length === 0 && defaultViewBranch(s, lost, branches) === NO_BRANCH; })());
check('Solo se puede ver una sede que la cuenta alcanza (y la vista global solo si alcanza todas)', viewBranchError(scopeOf(laura), branchId('Piura')) === null && viewBranchError(scopeOf(laura), branchId('Chiclayo')) !== null
  && viewBranchError(scopeOf(laura), 'all') !== null && viewBranchError(scopeOf(superadmin), 'all') === null && viewBranchError(scopeOf(superadmin), branchId('Chiclayo')) === null && viewBranchError(scopeOf(superadmin), 'zzz') !== null);
check('El selector no se ofrece a quien alcanza una sola sede', viewOptions(scopeOf(laura), branches).length === 0);
check('El selector ofrece «Vista global» y las sedes a quien alcanza todas, y solo las suyas a quien alcanza varias', (() => {
  const all = viewOptions(scopeOf(superadmin), branches);
  const two = viewOptions(scopeOfUser({ ...laura, additionalBranches: ['Chiclayo'] }, branches, false), branches);
  return all[0].id === 'all' && all.length === branches.filter(b => b.status === 'Activo').length + 1 && two.length === 2 && !two.some(o => o.id === 'all');
})());
check('Si la sede que se veía deja de alcanzarse, se vuelve a la de la cuenta', validView(scopeOf(laura), branchId('Chiclayo'), laura, branches) === branchId('Piura') && validView(scopeOf(laura), branchId('Piura'), laura, branches) === branchId('Piura'));

// ------------------------------------------------------------------------------------------------------------------ Quién trabaja
check('Solo trabaja una cuenta que existe y está activa', activeAccount(users, laura.id)?.id === laura.id && activeAccount(users, byName('Jorge Torres').id) === null && activeAccount(users, 'USR-999') === null && activeAccount(users, null) === null);
check('La sesión guardada se lee de vuelta (bloqueada, con cuenta, o nada)', parseSession(serializeSession(null)).state === 'locked' && (() => { const s = parseSession(serializeSession('USR-002')); return s.state === 'user' && s.userId === 'USR-002'; })() && parseSession(null).state === 'none' && ['{x', '[]', '{"version":9,"userId":"a"}', '{"version":1,"userId":""}', '{"version":1,"userId":7}'].every(raw => parseSession(raw).state === 'none'));
check('La primera vez entra el Superusuario; después, la cuenta de la última vez', initialUserId({ state: 'none' }, users) === superadmin.id && initialUserId({ state: 'user', userId: laura.id }, users) === laura.id);
check('Si estaba bloqueada, o su cuenta ya no sirve, la sesión empieza bloqueada (no entra otra sola)', initialUserId({ state: 'locked' }, users) === null && initialUserId({ state: 'user', userId: byName('Jorge Torres').id }, users) === null && initialUserId({ state: 'user', userId: 'USR-999' }, users) === null);
check('Sin Superusuario activo y sin sesión guardada, queda bloqueada', initialUserId({ state: 'none' }, users.filter(u => u.role !== 'Superusuario')) === null);
check('La última entrada se anota como «Hoy HH:MM»', lastAccessLabel(new Date(2026, 10, 3, 8, 5)) === 'Hoy 08:05');

// ------------------------------------------------------------------------------------------------------------------ Protecciones de las cuentas
check('La única cuenta activa de Superusuario no se elimina, desactiva ni cambia de rol', lastSuperuserError(users, superadmin.id, 'delete') !== null && lastSuperuserError(users, superadmin.id, { status: 'Inactivo' }) !== null && lastSuperuserError(users, superadmin.id, { role: 'Contabilidad' }) !== null);
check('Con otro Superusuario activo sí se puede quitar uno', (() => { const two: User[] = [...users, { ...superadmin, id: 'USR-009', name: 'Otro' }]; return lastSuperuserError(two, superadmin.id, 'delete') === null; })());
check('Cambios que no le quitan el acceso a un Superusuario no se bloquean', lastSuperuserError(users, superadmin.id, {}) === null && lastSuperuserError(users, superadmin.id, { role: 'Superusuario' }) === null && lastSuperuserError(users, laura.id, 'delete') === null);
check('Nadie elimina ni se cambia el rol o el estado de su propia cuenta', selfAccountError(laura.id, laura.id, 'delete') !== null && selfAccountError(laura.id, laura.id, { role: 'Contabilidad' }) !== null && selfAccountError(laura.id, laura.id, { status: 'Inactivo' }) !== null);
check('Sí puede editar sus otros datos, y tocar las cuentas de los demás', selfAccountError(laura.id, laura.id, {}) === null && selfAccountError(laura.id, marco.id, 'delete') === null && selfAccountError(null, laura.id, 'delete') === null);

// ------------------------------------------------------------------------------------------------------------------ Datos de ejemplo y lo guardado
check('Hay una cuenta de Superusuario activa en los datos de ejemplo, con PIN', users.some(u => u.role === 'Superusuario' && u.status === 'Activo' && !!u.pinHash));
check('Los ids de las cuentas de ejemplo no se repiten', new Set(users.map(u => u.id)).size === users.length);
const seed = { roles, permissions, users };
const known = { branchNames: branches.map(b => b.name), staffIds: seedStaff().map(s => s.id) };
check('El PIN sobrevive a guardar y recuperar', (() => { const r = restoreAccess(serializeAccess(seed), seed, known); return r.snapshot.users.every(u => !!u.pinHash && pinMatches(u, SEED_PIN)); })());
check('Si lo guardado no trae ningún Superusuario activo, vuelve el de partida', (() => {
  const without = { roles, permissions, users: users.filter(u => u.role !== 'Superusuario') };
  const r = restoreAccess(serializeAccess(without), seed, known);
  return r.snapshot.users.some(u => u.role === 'Superusuario' && u.status === 'Activo' && !!u.pinHash);
})());
check('Si lo guardado ya trae un Superusuario activo, no se agrega otro', (() => {
  const r = restoreAccess(serializeAccess(seed), seed, known);
  return r.snapshot.users.filter(u => u.role === 'Superusuario').length === 1;
})());
check('Lo guardado antes de que existiera el PIN recupera el de ejemplo en las cuentas de ejemplo (y no inventa uno a las demás)', (() => {
  const legacy = { roles, permissions, users: [...users.map(u => ({ ...u, pinHash: undefined })), { ...laura, id: 'USR-060', name: 'Cuenta propia', email: 'propia@ensil.edu.pe', pinHash: undefined }] };
  const r = restoreAccess(serializeAccess(legacy), seed, known);
  const own = r.snapshot.users.find(u => u.id === 'USR-060');
  return users.every(u => pinMatches(r.snapshot.users.find(x => x.id === u.id)!, SEED_PIN)) && !!own && own.pinHash === undefined;
})());
check('Una marca de PIN rara (vacía o que no es texto) se descarta; la cuenta no entra', (() => {
  const odd = { roles, permissions, users: [...users.slice(0, 2), { ...laura, id: 'USR-050', name: 'Sin marca', pinHash: '  ' } as User, { ...laura, id: 'USR-051', name: 'Marca numérica', pinHash: 12 as unknown as string } as User] };
  const r = restoreAccess(serializeAccess(odd), seed, known);
  return r.snapshot.users.filter(u => u.id === 'USR-050' || u.id === 'USR-051').every(u => u.pinHash === undefined);
})());

// ------------------------------------------------------------------------------------------------------------------ Dashboard por sede
const pid = branchId('Piura');
const cid = branchId('Chiclayo');
const sample = {
  branches: branches.filter(b => b.status === 'Activo'),
  students: [], guardians: [],
  enrollments: [{ id: 'MAT-1', branchId: pid, status: 'Activa' }, { id: 'MAT-2', branchId: cid, status: 'Activa' }, { id: 'MAT-3', branchId: pid, status: 'Activa' }],
  plans: [{ id: 'PLN-1', mat: 'MAT-1' }, { id: 'PLN-2', mat: 'MAT-2' }],
  payments: [{ id: 'P1', enrollmentIds: ['MAT-1'] }, { id: 'P2', enrollmentIds: ['MAT-2'] }, { id: 'P3' }],
  cashMovements: [{ id: 'C1', branchId: pid }, { id: 'C2', branchId: cid }],
  stockItems: [{ id: 'S1', branchId: pid }, { id: 'S2', branchId: cid }],
  dropRequests: [{ id: 'D1', enrollmentId: 'MAT-2' }],
  changeRequests: [{ id: 'R1', enrollmentId: 'MAT-1' }, { id: 'R2', enrollmentId: 'MAT-3' }],
} as unknown as DashboardContext;
const piura = scopeDashboard(sample, pid);
check('Con «Vista global» el Dashboard usa todos los datos', scopeDashboard(sample, 'all') === sample);
check('Con una sede, cada cifra sale solo de esa sede', piura.enrollments.length === 2 && piura.plans.length === 1 && piura.payments.length === 1 && piura.cashMovements.length === 1 && piura.stockItems.length === 1
  && piura.dropRequests.length === 0 && piura.changeRequests?.length === 2 && piura.branches.length === 1 && piura.branches[0].id === pid);
check('Las sedes de un lado y del otro suman el total (nada se pierde ni se cuenta dos veces)', (() => {
  const a = scopeDashboard(sample, pid), b = scopeDashboard(sample, cid);
  return a.enrollments.length + b.enrollments.length === sample.enrollments.length && a.cashMovements.length + b.cashMovements.length === sample.cashMovements.length
    && a.stockItems.length + b.stockItems.length === sample.stockItems.length && a.plans.length + b.plans.length === sample.plans.length;
})());
check('Sin sede alcanzable el Dashboard queda vacío', (() => { const none = scopeDashboard(sample, NO_BRANCH); return none.enrollments.length === 0 && none.cashMovements.length === 0 && none.stockItems.length === 0 && none.branches.length === 0; })());

// ------------------------------------------------------------------------------------------------------------------ Navegador
const memory = new Map<string, string>();
const fake = { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => { memory.set(k, v); }, removeItem: (k: string) => { memory.delete(k); } };
const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const useStorage = (s: unknown) => Object.defineProperty(globalThis, 'localStorage', { value: s, configurable: true, writable: true });
useStorage(fake);
check('Sin nada guardado, la sesión se lee como «nada»', parseSession(readStoredSession()).state === 'none');
writeStoredSession('USR-002');
check('Se recuerda con quién se estaba trabajando, bajo su propia clave', memory.has(SESSION_STORAGE_KEY) && (() => { const s = parseSession(readStoredSession()); return s.state === 'user' && s.userId === 'USR-002'; })());
writeStoredSession(null);
check('Bloquear también se recuerda', parseSession(readStoredSession()).state === 'locked');
clearStoredSession();
check('Borrar la sesión guardada la deja en «nada»', readStoredSession() === null);
useStorage({ getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('lleno'); }, removeItem: () => { throw new Error('bloqueado'); } });
let threw = false;
try { writeStoredSession('USR-002'); clearStoredSession(); threw = readStoredSession() !== null; } catch { threw = true; }
check('Un almacenamiento que falla no rompe el sistema', !threw);
useStorage(undefined);
let threw2 = false;
try { writeStoredSession('USR-002'); clearStoredSession(); threw2 = readStoredSession() !== null; } catch { threw2 = true; }
check('Sin almacenamiento la sesión sigue en memoria', !threw2);
if (original) Object.defineProperty(globalThis, 'localStorage', original); else delete (globalThis as Record<string, unknown>).localStorage;

console.log(failed === 0 ? '\nTodo en orden.' : `\n${failed} verificaciones fallaron.`);
process.exit(failed === 0 ? 0 : 1);
