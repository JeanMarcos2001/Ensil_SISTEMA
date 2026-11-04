/**
 * Verificación de la persistencia provisional de roles, permisos y cuentas (paso 6): ida y vuelta sin pérdida, lo guardado se trata como
 * no confiable (corrupto, de otra versión, alterado o desfasado) y el almacenamiento del navegador nunca rompe el sistema.
 * Ejecutar: npx tsx scripts/check-access-store.ts
 */
import type { Permission, Role, User } from '../src/context/DataContext';
import { seedBranches, seedPermissions, seedRoles, seedStaff, seedUsers } from '../src/data/seedCatalog';
import { ALL_CAPABILITIES, roleClosure, roleWarnings } from '../src/utils/capabilities';
import { ROLE_TEMPLATES, templateById, templatePermissions } from '../src/utils/roleTemplates';
import {
  ACCESS_STORAGE_KEY, ACCESS_VERSION, clearStoredAccess, readStoredAccess, restoreAccess, serializeAccess, writeStoredAccess, type AccessSnapshot,
} from '../src/utils/accessStore';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : ` -> ${detail}`}`);
  if (!ok) failed++;
};

const seed = (): AccessSnapshot => ({ roles: seedRoles(), permissions: seedPermissions(), users: seedUsers() });
const known = { branchNames: seedBranches().map(b => b.name), staffIds: seedStaff().map(s => s.id) };
/** Forma comparable: claves ordenadas y sin valores indefinidos. */
const canon = (v: unknown): string => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x));
const restore = (s: unknown, base = seed()) => restoreAccess(typeof s === 'string' ? s : JSON.stringify(s), base, known);
const stored = (s: Partial<Record<'roles' | 'permissions' | 'users', unknown>>, base = seed()) =>
  ({ version: ACCESS_VERSION, roles: base.roles, permissions: base.permissions, users: base.users, ...s });

const newRole = (id: string, name: string, extra: Partial<Role> = {}): Role => ({ id, name, desc: 'Rol de prueba', status: 'Activo', ...extra });
const newUser = (id: string, role: string, extra: Partial<User> = {}): User => ({ id, name: `Cuenta ${id}`, email: `${id}@ensil.edu.pe`, role, branch: 'Piura', lastAccess: 'Nunca', status: 'Activo', ...extra });

// ------------------------------------------------------------------------------------------------------------------ Ida y vuelta
const none = restoreAccess(null, seed(), known);
check('Sin nada guardado se usan los datos de ejemplo y no se avisa nada', !none.restored && none.notes.length === 0 && canon(none.snapshot) === canon(seed()));

const round = restoreAccess(serializeAccess(seed()), seed(), known);
check('Guardar y leer los datos de ejemplo no cambia nada', round.restored && round.notes.length === 0 && canon(round.snapshot) === canon(seed()),
  `${round.notes.join(' | ')} ${canon(round.snapshot).slice(0, 120)}`);

// Un rol, sus funciones y una cuenta nuevos sobreviven.
const base = seed();
const custom = newRole('ROL-007', 'Ventas Norte', { branchUserLimit: 2, observations: 'Piloto' });
const withCustom: AccessSnapshot = {
  roles: [...base.roles, custom],
  permissions: [...base.permissions, { roleId: 'ROL-007', permissions: roleClosure(['op-pagos:view']).all }],
  users: [...base.users, newUser('USR-020', 'Ventas Norte', { additionalBranches: ['Chiclayo'] })],
};
const roundCustom = restoreAccess(serializeAccess(withCustom), seed(), known);
check('Un rol nuevo con sus funciones y una cuenta nueva sobreviven a la recarga', roundCustom.snapshot.roles.some(r => r.id === 'ROL-007' && r.branchUserLimit === 2 && r.observations === 'Piloto')
  && roundCustom.snapshot.permissions.find(p => p.roleId === 'ROL-007')?.permissions.includes('op-pagos:view') === true
  && roundCustom.snapshot.users.some(u => u.id === 'USR-020' && u.additionalBranches?.join() === 'Chiclayo'), roundCustom.notes.join(' | '));
check('Lo borrado también se queda borrado (un rol de partida eliminado no vuelve solo)', (() => {
  const s = seed();
  const out = restoreAccess(serializeAccess({ roles: s.roles.filter(r => r.name !== 'Contabilidad'), permissions: s.permissions, users: s.users.filter(u => u.role !== 'Contabilidad') }), seed(), known);
  return !out.snapshot.roles.some(r => r.name === 'Contabilidad') && out.notes.length === 0;
})());

// ------------------------------------------------------------------------------------------------------------------ Lo guardado no es confiable
const garbage = restoreAccess('{no es json', seed(), known);
check('Un texto que no es JSON se descarta con aviso y se usan los datos de ejemplo', !garbage.restored && garbage.notes.length === 1 && canon(garbage.snapshot) === canon(seed()));
check('Una versión distinta se descarta con aviso', !restore({ version: ACCESS_VERSION + 1, roles: [], permissions: [], users: [] }).restored && restore({ version: 99, roles: [], permissions: [], users: [] }).notes.length === 1);
check('Algo que no es un objeto, o le faltan listas, se descarta con aviso', ['null', '[]', '"x"', '7', '{"version":1}', '{"version":1,"roles":{},"permissions":[],"users":[]}'].every(raw => { const r = restore(raw); return !r.restored && r.notes.length === 1; }));

const tampered = seed();
const superRole = tampered.roles.find(r => r.locked)!;
const forged = restore(stored({
  roles: [{ ...superRole, name: 'Súper', status: 'Inactivo', locked: true }, ...tampered.roles.filter(r => !r.locked)],
  permissions: [{ roleId: superRole.id, permissions: ['dash-resumen:view'] }, ...tampered.permissions.filter(p => p.roleId !== superRole.id)],
}));
check('El rol del sistema nunca sale de lo guardado: si se alteró, vuelve a ser el de partida', canon(forged.snapshot.roles.find(r => r.locked)) === canon(superRole)
  && canon(forged.snapshot.permissions.find(p => p.roleId === superRole.id)) === canon(seedPermissions().find(p => p.roleId === superRole.id)) && forged.notes.length === 0);
check('Un rol guardado que se hace pasar por del sistema (locked) o se llama como uno no entra', (() => {
  const out = restore(stored({ roles: [...seed().roles, newRole('ROL-009', 'superusuario'), { ...newRole('ROL-010', 'Falso'), locked: true }] }));
  return out.snapshot.roles.length === 6 && out.snapshot.roles.filter(r => r.locked).length === 1;
})());
check('Un rol con id o nombre repetido, vacío, sin estado válido o muy largo se descarta con aviso', (() => {
  const s = seed();
  const out = restore(stored({ roles: [...s.roles, newRole('ROL-001', 'Otro'), newRole('ROL-020', 'CONTABILIDAD'), newRole('ROL-021', '   '), { ...newRole('ROL-022', 'X'), status: 'Raro' }, newRole('ROL-023', 'N'.repeat(61)), 5, null] }));
  return out.snapshot.roles.length === 6 && out.notes.some(n => n.includes('rol')) ;
})());
check('Un límite por sede fuera de 1–50 o no entero se quita', (() => {
  const out = restore(stored({ roles: [...seed().roles, newRole('ROL-030', 'Limite A', { branchUserLimit: 0 }), newRole('ROL-031', 'Limite B', { branchUserLimit: 2.5 }), newRole('ROL-032', 'Limite C', { branchUserLimit: 51 }), newRole('ROL-033', 'Limite D', { branchUserLimit: 4 })] }));
  const lim = (n: string) => out.snapshot.roles.find(r => r.name === n)?.branchUserLimit;
  return lim('Limite A') === undefined && lim('Limite B') === undefined && lim('Limite C') === undefined && lim('Limite D') === 4;
})());

// ------------------------------------------------------------------------------------------------------------------ Funciones
const needing = ALL_CAPABILITIES.find(c => !c.reserved && roleClosure([c.id]).added.length > 0)!;
const reservedCap = ALL_CAPABILITIES.find(c => c.reserved)?.id;
const dirty = restore(stored({
  roles: [...seed().roles, newRole('ROL-040', 'Sucio')],
  permissions: [...seed().permissions, { roleId: 'ROL-040', permissions: [needing.id, 'no-existe:ver', ...(reservedCap ? [reservedCap] : []), 7 as unknown as string].filter(x => typeof x === 'string') }, { roleId: 'ROL-999', permissions: ['dash-resumen:view'] }],
}));
const dirtyPerms = dirty.snapshot.permissions.find(p => p.roleId === 'ROL-040')?.permissions ?? [];
check('Una función que ya no existe o es reservada se quita del rol', !dirtyPerms.includes('no-existe:ver') && (!reservedCap || !dirtyPerms.includes(reservedCap)));
check('Lo que cada función necesita se vuelve a completar', roleClosure([needing.id]).all.every(id => dirtyPerms.includes(id)), `${needing.id} -> ${dirtyPerms.join(',')}`);
check('Las funciones de un rol que no existe se descartan', !dirty.snapshot.permissions.some(p => p.roleId === 'ROL-999'));
check('Permisos con la lista mal formada se ignoran sin romper', restore(stored({ permissions: [...seed().permissions, { roleId: 'ROL-001', permissions: 'x' }, 3, null] })).snapshot.permissions.length === 6);
check('Dos entradas de permisos para el mismo rol: gana la primera', (() => {
  const out = restore(stored({ roles: [...seed().roles, newRole('ROL-041', 'Doble')], permissions: [...seed().permissions, { roleId: 'ROL-041', permissions: ['dash-resumen:view'] }, { roleId: 'ROL-041', permissions: ['op-pagos:view'] }] }));
  const mine = out.snapshot.permissions.filter(p => p.roleId === 'ROL-041');
  return mine.length === 1 && mine[0].permissions.includes('dash-resumen:view') && !mine[0].permissions.includes('op-pagos:view');
})());

// ------------------------------------------------------------------------------------------------------------------ Combinaciones aceptadas
const adminGeneral = seed().roles.find(r => r.templateId === 'admin-general')!;
const adminPerms = templatePermissions(templateById('admin-general')!);
const rule = roleWarnings(adminPerms)[0];
const risk = { ruleId: rule.id, reason: 'Motivo de prueba', by: 'Prueba', at: '2026-11-03' };
check('Una combinación aceptada que todavía aplica se conserva con su motivo, autor y fecha', (() => {
  const out = restore(stored({ roles: [...seed().roles, newRole('ROL-050', 'Combo', { acceptedRisks: [risk] })], permissions: [...seed().permissions, { roleId: 'ROL-050', permissions: adminPerms }] }));
  return canon(out.snapshot.roles.find(r => r.name === 'Combo')?.acceptedRisks) === canon([risk]);
})());
check('Una combinación aceptada que ya no aplica se descarta', (() => {
  const out = restore(stored({ roles: [...seed().roles, newRole('ROL-051', 'Sin combo', { acceptedRisks: [risk] })], permissions: [...seed().permissions, { roleId: 'ROL-051', permissions: ['dash-resumen:view'] }] }));
  return out.snapshot.roles.find(r => r.name === 'Sin combo')?.acceptedRisks === undefined;
})());
check('Los motivos mal formados se ignoran', (() => {
  const out = restore(stored({ roles: [...seed().roles, newRole('ROL-052', 'Raro', { acceptedRisks: [{ ruleId: rule.id }, 'x', null] as never })], permissions: [...seed().permissions, { roleId: 'ROL-052', permissions: adminPerms }] }));
  return out.snapshot.roles.find(r => r.name === 'Raro')?.acceptedRisks === undefined;
})());
check('El rol de ejemplo Administración general conserva su combinación declarada', canon(round.snapshot.roles.find(r => r.id === adminGeneral.id)?.acceptedRisks) === canon(adminGeneral.acceptedRisks) && (adminGeneral.acceptedRisks?.length ?? 0) > 0);

// ------------------------------------------------------------------------------------------------------------------ Cuentas
const accounts = (list: unknown[]) => restore(stored({ roles: [...seed().roles, newRole('ROL-060', 'Operador')], users: list }));
const survivors = (list: unknown[]) => accounts(list).snapshot.users.filter(u => u.role !== 'Superusuario').map(u => u.id);
check('Una cuenta con un rol que ya no existe se descarta con aviso', (() => { const out = accounts([newUser('USR-100', 'Rol fantasma'), newUser('USR-101', 'Operador')]); return out.snapshot.users.filter(u => u.role !== 'Superusuario').map(u => u.id).join() === 'USR-101' && out.notes.length === 1; })());
check('Una cuenta en una sede que ya no existe se descarta (principal o adicional)', survivors([newUser('USR-110', 'Operador', { branch: 'Marte' }), newUser('USR-111', 'Operador', { additionalBranches: ['Marte'] }), newUser('USR-112', 'Operador', { branch: 'Todas' })]).join() === 'USR-112');
check('Una cuenta de un trabajador que ya no existe se descarta; con ficha vigente se conserva', survivors([newUser('USR-120', 'Operador', { staffId: 'STF-999' }), newUser('USR-121', 'Operador', { staffId: 'STF-002' })]).join() === 'USR-121');
check('Una cuenta con id repetido o con datos que faltan se descarta', survivors([newUser('USR-130', 'Operador'), newUser('USR-130', 'Operador'), { id: 'USR-131', name: 'Sin rol' }, 'x', null, { ...newUser('USR-132', 'Operador'), status: 'Raro' }]).join() === 'USR-130');
check('Una cuenta conserva sus campos opcionales (documento, teléfono, nota de estado, sedes adicionales)', (() => {
  const u = newUser('USR-140', 'Operador', { document: '12345678', phone: '999888777', statusNote: 'Desactivado el 2026-11-01.', status: 'Inactivo', additionalBranches: ['Chiclayo'], staffId: 'STF-001' });
  return canon(accounts([u]).snapshot.users[0]) === canon(u);
})());
check('Un rol descartado arrastra a sus cuentas con aviso, sin dejarlas con un rol inexistente', (() => {
  const out = restore(stored({ roles: [...seed().roles, newRole('ROL-070', 'Operador'), newRole('ROL-070', 'Duplicado')], users: [newUser('USR-150', 'Duplicado')] }));
  return out.snapshot.users.filter(u => u.role !== 'Superusuario').length === 0 && out.notes.length === 2;
})());
check('Todas las cuentas guardadas apuntan a un rol que existe', (() => {
  const out = restore(stored({ users: [...seed().users, newUser('USR-160', 'Nadie')] }));
  return out.snapshot.users.every(u => out.snapshot.roles.some(r => r.name === u.role));
})());

// ------------------------------------------------------------------------------------------------------------------ Navegador
const memory = new Map<string, string>();
const fake = { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => { memory.set(k, v); }, removeItem: (k: string) => { memory.delete(k); } };
const g = globalThis as unknown as Record<string, unknown>;
const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const useStorage = (s: unknown) => Object.defineProperty(globalThis, 'localStorage', { value: s, configurable: true, writable: true });

useStorage(fake);
check('Sin nada guardado, leer devuelve null', readStoredAccess() === null);
writeStoredAccess(withCustom);
check('Guardar escribe bajo la clave del sistema y leer lo devuelve', memory.has(ACCESS_STORAGE_KEY) && readStoredAccess() === serializeAccess(withCustom));
check('Lo escrito se restaura completo al "recargar"', restoreAccess(readStoredAccess(), seed(), known).snapshot.users.some(u => u.id === 'USR-020'));
clearStoredAccess();
check('Borrar lo guardado deja los datos de ejemplo', readStoredAccess() === null && !memory.has(ACCESS_STORAGE_KEY));

const broken = { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('lleno'); }, removeItem: () => { throw new Error('bloqueado'); } };
useStorage(broken);
let threw = false;
try { writeStoredAccess(withCustom); clearStoredAccess(); threw = readStoredAccess() !== null; } catch { threw = true; }
check('Un almacenamiento que falla (lleno, bloqueado) nunca rompe el sistema', !threw);

useStorage(undefined);
let threw2 = false;
try { writeStoredAccess(withCustom); clearStoredAccess(); threw2 = readStoredAccess() !== null; } catch { threw2 = true; }
check('Sin almacenamiento disponible todo sigue funcionando en memoria', !threw2);
if (original) Object.defineProperty(globalThis, 'localStorage', original); else delete g.localStorage;

check('Las 6 plantillas de partida están en los datos de ejemplo que se restauran', seed().roles.length === ROLE_TEMPLATES.length);
check('La clave guardada es propia de este módulo y no pisa el borrador de la matrícula', ACCESS_STORAGE_KEY.startsWith('ensil.') && !/draft|view/i.test(ACCESS_STORAGE_KEY));

console.log(failed === 0 ? '\nTodo en orden.' : `\n${failed} verificaciones fallaron.`);
process.exit(failed === 0 ? 0 : 1);
