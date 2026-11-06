/**
 * Verificación de la sesión provisional (paso 7): cambio rápido de usuario con PIN (y su bloqueo), la sede que ve cada cuenta, las
 * protecciones de las cuentas (la última de Superusuario, la propia) y las cifras del Dashboard por sede.
 * Ejecutar: npx tsx scripts/check-session.ts
 */
import type { Branch, User } from '../src/context/DataContext';
import { seedBranches, seedPermissions, seedRoles, seedUsers, seedWarehouses } from '../src/data/seedCatalog';
import { buildHolders, holdersWith } from '../src/utils/capabilities';
import { scopeDashboard, type DashboardContext } from '../src/utils/dashboard';
import { PERM } from '../src/utils/authority';
import {
  NO_BRANCH, activeAccount, defaultViewBranch, lastSuperuserError, scopeOfUser, selfAccountError, validView, viewBranchError, viewOptions, warehouseOperationError,
} from '../src/utils/session';
import { stockLocations } from '../src/utils/logisticsRoutes';

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
const warehouses = seedWarehouses();
const locations = stockLocations(branches, warehouses);
const scopeOf = (u: User) => scopeOfUser(u, branches, hasAll(u), warehouses);


const laura = byName('Laura Martínez');

// ------------------------------------------------------------------------------------------------------------------ Sede que se ve
const superadmin = byName('Superadmin');
const rosa = byName('Rosa Quispe');
const elena = byName('Elena Ramos');
const marco = byName('Marco Salas');
const adminGeneral = byName('Admin Sistema');
check('El Superusuario alcanza todas las sedes activas', scopeOf(superadmin).allBranches && scopeOf(superadmin).branchIds.length === branches.filter(b => b.status === 'Activo').length);
check('Una cuenta de sede «Todas» alcanza todas', scopeOf(adminGeneral).allBranches);
check('El Almacén central y Contabilidad alcanzan todas las sedes por su rol; la cuenta del almacén ya no tiene sede (trabaja en el almacén)', scopeOf(rosa).allBranches && scopeOf(elena).allBranches && rosa.branch === '' && (rosa.warehouses ?? []).join() === 'ALM-001' && elena.branch === 'Los Olivos');
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
check('El selector no se ofrece a quien alcanza una sola sede', viewOptions(scopeOf(laura), locations).length === 0);
check('El selector ofrece «Vista global» y las sedes a quien alcanza todas, y solo las suyas a quien alcanza varias', (() => {
  const all = viewOptions(scopeOf(superadmin), locations);
  const two = viewOptions(scopeOfUser({ ...laura, additionalBranches: ['Chiclayo'] }, branches, false, warehouses), locations);
  return all[0].id === 'all' && all[1].id === 'ALM-001' && all.length === branches.filter(b => b.status === 'Activo').length + warehouses.length + 1 && two.length === 2 && !two.some(o => o.id === 'all' || o.id === 'ALM-001');
})());
check('Si la sede que se veía deja de alcanzarse, se vuelve a la de la cuenta', validView(scopeOf(laura), branchId('Chiclayo'), laura, branches) === branchId('Piura') && validView(scopeOf(laura), branchId('Piura'), laura, branches) === branchId('Piura'));

// ------------------------------------------------------------------------------------------------------------------ Almacén: quién lo ve y quién lo mueve
const sup = scopeOf(superadmin);
check('El Superusuario ve y opera el almacén', sup.warehouseIds.join() === 'ALM-001' && sup.operableWarehouseIds.join() === 'ALM-001' && warehouseOperationError(sup, 'ALM-001') === null);
check('La cuenta asignada al almacén lo ve y lo opera', scopeOf(rosa).warehouseIds.join() === 'ALM-001' && warehouseOperationError(scopeOf(rosa), 'ALM-001') === null);
check('Quien alcanza todas las sedes (Contabilidad) VE el almacén pero NO lo opera: ver no autoriza a mover', (() => {
  const s = scopeOf(elena);
  return s.allBranches && s.warehouseIds.join() === 'ALM-001' && s.operableWarehouseIds.length === 0 && /no está asignada/.test(warehouseOperationError(s, 'ALM-001') ?? '');
})());
check('Un administrador de sede ni ve ni opera el almacén', scopeOf(laura).warehouseIds.length === 0 && warehouseOperationError(scopeOf(laura), 'ALM-001') !== null && viewBranchError(scopeOf(laura), 'ALM-001') !== null);
check('La sede «Todas» de una cuenta también ve el almacén, sin operarlo', (() => {
  const s = scopeOfUser({ ...laura, branch: 'Todas' }, branches, false, warehouses);
  return s.warehouseIds.join() === 'ALM-001' && s.operableWarehouseIds.length === 0;
})());
check('Una cuenta solo de almacén (sin sede ni alcance total) empieza en su almacén y no necesita selector', (() => {
  const s = scopeOfUser({ ...rosa }, branches, false, warehouses);
  return s.branchIds.length === 0 && defaultViewBranch(s, rosa, locations) === 'ALM-001' && viewBranchError(s, 'ALM-001') === null && viewOptions(s, locations).length === 0 && viewBranchError(s, 'all') !== null;
})());
check('Un almacén inactivo o que no existe se ignora', (() => {
  const off = scopeOfUser({ ...rosa }, branches, false, [{ id: 'ALM-001', status: 'Inactivo' }]);
  const ghost = scopeOfUser({ ...rosa, warehouses: ['ALM-099'] }, branches, false, warehouses);
  return off.warehouseIds.length === 0 && ghost.warehouseIds.length === 0 && defaultViewBranch(ghost, rosa, locations) === NO_BRANCH;
})());
check('El selector de un almacén más sedes ofrece ambos, sin vista global', (() => {
  const s = scopeOfUser({ ...laura, warehouses: ['ALM-001'] }, branches, false, warehouses);
  const o = viewOptions(s, locations);
  return o.length === 2 && o[0].id === 'ALM-001' && o[1].id === branchId('Piura');
})());
const peopleAt = (id: string, cap: string, hs = buildHolders({ users, roles, permissions, branches })) => holdersWith(cap, hs, id).map(h => h.name);
check('Contraparte en el almacén: lo cubre quien está asignado, no quien alcanza todas las sedes', (() => {
  const dispatchers = peopleAt('ALM-001', 'log-envios:dispatch');
  return dispatchers.includes('Rosa Quispe') && dispatchers.length === 1;
})());
check('Contraparte en una sede: sigue cubriéndola quien alcanza todas las sedes (y quien la tiene asignada)', (() => {
  const atChiclayo = peopleAt(branchId('Chiclayo'), 'log-stock:view');
  const atPiura = peopleAt(branchId('Piura'), 'log-stock:view');
  return atChiclayo.join() === 'Rosa Quispe' && atPiura.includes('Rosa Quispe') && atPiura.includes('Laura Martínez');
})());
check('Las devoluciones que llegan al almacén las recibe la cuenta del almacén (el otro extremo siempre es una sede)', peopleAt('ALM-001', 'log-transfer:receive').join() === 'Rosa Quispe' && peopleAt(branchId('Piura'), 'log-transfer:receive').join() === 'Laura Martínez,Rosa Quispe');
check('El Superusuario, cuando se incluye, cubre cualquier almacén', holdersWith('log-envios:dispatch', buildHolders({ users, roles, permissions, branches }, { includeSuperuser: true }), 'ALM-001').some(h => h.name === 'Superadmin'));

// ------------------------------------------------------------------------------------------------------------------ Quién trabaja
check('Solo trabaja una cuenta que existe y está activa', activeAccount(users, laura.id)?.id === laura.id && activeAccount(users, byName('Jorge Torres').id) === null && activeAccount(users, 'USR-999') === null && activeAccount(users, null) === null);

// ------------------------------------------------------------------------------------------------------------------ Protecciones de las cuentas
check('La única cuenta activa de Superusuario no se elimina, desactiva ni cambia de rol', lastSuperuserError(users, superadmin.id, 'delete') !== null && lastSuperuserError(users, superadmin.id, { status: 'Inactivo' }) !== null && lastSuperuserError(users, superadmin.id, { role: 'Contabilidad' }) !== null);
check('Con otro Superusuario activo sí se puede quitar uno', (() => { const two: User[] = [...users, { ...superadmin, id: 'USR-009', name: 'Otro' }]; return lastSuperuserError(two, superadmin.id, 'delete') === null; })());
check('Cambios que no le quitan el acceso a un Superusuario no se bloquean', lastSuperuserError(users, superadmin.id, {}) === null && lastSuperuserError(users, superadmin.id, { role: 'Superusuario' }) === null && lastSuperuserError(users, laura.id, 'delete') === null);
check('Nadie elimina ni se cambia el rol o el estado de su propia cuenta', selfAccountError(laura.id, laura.id, 'delete') !== null && selfAccountError(laura.id, laura.id, { role: 'Contabilidad' }) !== null && selfAccountError(laura.id, laura.id, { status: 'Inactivo' }) !== null);
check('Sí puede editar sus otros datos, y tocar las cuentas de los demás', selfAccountError(laura.id, laura.id, {}) === null && selfAccountError(laura.id, marco.id, 'delete') === null && selfAccountError(null, laura.id, 'delete') === null);


// ------------------------------------------------------------------------------------------------------------------ Datos de ejemplo
check('Los ids de las cuentas de ejemplo no se repiten', new Set(users.map(u => u.id)).size === users.length);
check('Hay una cuenta de Superusuario activa en los datos de ejemplo', users.some(u => u.role === 'Superusuario' && u.status === 'Activo'));
check('Las cuentas de ejemplo ya no llevan PIN (el cambio rápido de usuario se retiró)', users.every(u => !('pinHash' in u)));

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



console.log(failed === 0 ? '\nTodo en orden.' : `\n${failed} verificaciones fallaron.`);
process.exit(failed === 0 ? 0 : 1);