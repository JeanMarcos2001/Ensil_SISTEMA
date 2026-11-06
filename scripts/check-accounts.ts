/**
 * Verificación de las cuentas en la base de datos (paso 10): cómo se leen las filas (`cuentas`, `cuenta_sedes`, `cuenta_almacenes`) como
 * cuentas del sistema y cómo se arman las peticiones a la Edge Function `usuarios` (la cuenta nace de una persona; solo lo que cambió).
 * Ejecutar: npx tsx scripts/check-accounts.ts
 */
import type { Role, User } from '../src/context/DataContext';
import {
  accountFromRows, changeNeeds, editBody, inviteBody, lastAccessText, usersFromRows, type AccountForm, type CuentaAlmacenRow, type CuentaRow, type CuentaSedeRow, type SedeRef,
} from '../src/utils/accounts';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : ` -> ${detail}`}`);
  if (!ok) failed++;
};

const roles: Pick<Role, 'id' | 'name' | 'locked'>[] = [
  { id: 'ROL-001', name: 'Superusuario', locked: true }, { id: 'ROL-002', name: 'Administrador de sede' }, { id: 'ROL-003', name: 'Psicopedagogía' }, { id: 'ROL-004', name: 'Almacén central' },
];
const sedes: SedeRef[] = [{ id: 'FIL-001', nombre: 'Los Olivos' }, { id: 'FIL-002', nombre: 'Piura' }, { id: 'FIL-003', nombre: 'Chiclayo' }];
const now = new Date('2026-11-05T20:00:00Z'); // 15:00 en Lima
const row = (id: string, rol: string, extra: Partial<CuentaRow> = {}): CuentaRow => ({
  id, nombre: `Cuenta ${id}`, correo: `${id}@x.com`, rol_id: rol, estado: 'Activo', todas_las_sedes: false, nota_estado: null, personal_id: null, documento: null, telefono: null, ultimo_acceso: null, ...extra,
});
const cs = (cuenta: string, ...ids: string[]): CuentaSedeRow[] => ids.map((sede_id, i) => ({ cuenta_id: cuenta, sede_id, es_principal: i === 0 }));
const ca = (cuenta: string, ...ids: string[]): CuentaAlmacenRow[] => ids.map(almacen_id => ({ cuenta_id: cuenta, almacen_id }));
const user = (r: CuentaRow, sedeRows: CuentaSedeRow[] = [], almRows: CuentaAlmacenRow[] = []) => accountFromRows(r, roles, sedes, sedeRows, almRows, now);

// ------------------------------------------------------------------------------------------------ Último acceso
check('Sin acceso o con una fecha inválida: «Nunca»', lastAccessText(null, now) === 'Nunca' && lastAccessText(undefined, now) === 'Nunca' && lastAccessText('no es fecha', now) === 'Nunca');
check('Hoy y ayer se muestran con la hora de Lima (no la del servidor)', lastAccessText('2026-11-05T13:10:00Z', now) === 'Hoy 08:10' && lastAccessText('2026-11-04T19:30:00Z', now) === 'Ayer 14:30');
check('Un día de Lima no es un día UTC (a las 02:00 UTC todavía es la noche anterior en Lima)', lastAccessText('2026-11-05T02:00:00Z', now) === 'Ayer 21:00');
check('Una fecha más vieja se muestra con día, mes y año', /^1 oct 2026$/.test(lastAccessText('2026-10-01T15:00:00Z', now)), lastAccessText('2026-10-01T15:00:00Z', now));

// ------------------------------------------------------------------------------------------------ De la base al sistema
const piura = user(row('a', 'ROL-003', { documento: '123', telefono: '999', nota_estado: null, ultimo_acceso: '2026-11-05T13:10:00Z' }), cs('a', 'FIL-002'))!;
check('Una cuenta de una sede se lee con su rol por nombre, su sede y sus datos', piura.role === 'Psicopedagogía' && piura.branch === 'Piura' && piura.additionalBranches === undefined && piura.document === '123' && piura.phone === '999' && piura.lastAccess === 'Hoy 08:10' && piura.status === 'Activo' && piura.email === 'a@x.com');
const dos = user(row('b', 'ROL-002'), [{ cuenta_id: 'b', sede_id: 'FIL-001', es_principal: false }, { cuenta_id: 'b', sede_id: 'FIL-003', es_principal: true }, { cuenta_id: 'b', sede_id: 'FIL-002', es_principal: false }])!;
check('La sede principal es la marcada; las demás quedan como adicionales en orden', dos.branch === 'Chiclayo' && dos.additionalBranches?.join() === 'Los Olivos,Piura');
check('Una cuenta solo de almacén no tiene sede y conserva su almacén', (() => { const u = user(row('c', 'ROL-004'), [], ca('c', 'ALM-001'))!; return u.branch === '' && u.warehouses?.join() === 'ALM-001' && u.additionalBranches === undefined; })());
check('Sede y almacén a la vez', (() => { const u = user(row('d', 'ROL-004'), cs('d', 'FIL-001'), ca('d', 'ALM-001'))!; return u.branch === 'Los Olivos' && u.warehouses?.join() === 'ALM-001'; })());
check('«Todas las sedes» se muestra como «Todas» y no lista sedes sueltas', (() => { const u = user(row('e', 'ROL-002', { todas_las_sedes: true }), cs('e', 'FIL-001', 'FIL-002'))!; return u.branch === 'Todas' && u.additionalBranches === undefined; })());
check('El Superusuario, sin sedes, se muestra con «Todas»', user(row('f', 'ROL-001'))!.branch === 'Todas');
check('Una cuenta inactiva conserva su constancia', (() => { const u = user(row('g', 'ROL-003', { estado: 'Inactivo', nota_estado: 'Desactivado por Admin el 2026-11-05.' }), cs('g', 'FIL-002'))!; return u.status === 'Inactivo' && u.statusNote === 'Desactivado por Admin el 2026-11-05.'; })());
check('Una cuenta cuyo rol ya no existe no se muestra', user(row('h', 'ROL-999'), cs('h', 'FIL-002')) === null);
check('Una sede que ya no existe se ignora sin romper la cuenta', user(row('i', 'ROL-003'), cs('i', 'FIL-999'))!.branch === '');
check('Los datos de otra cuenta no se mezclan', (() => { const u = user(row('j', 'ROL-003'), [...cs('j', 'FIL-002'), ...cs('otra', 'FIL-001')], [...ca('otra', 'ALM-001')])!; return u.branch === 'Piura' && u.warehouses === undefined; })());
check('Lista de cuentas: ordenada por nombre y sin las de rol inexistente', (() => {
  const rows = { cuentas: [row('z', 'ROL-003', { nombre: 'Zoila' }), row('m', 'ROL-999', { nombre: 'Maria' }), row('a', 'ROL-003', { nombre: 'Ana' })], cuentaSedes: [], cuentaAlmacenes: [], sedes };
  return usersFromRows(rows, roles, now).map(u => u.name).join() === 'Ana,Zoila';
})());

// ------------------------------------------------------------------------------------------------ Invitar
const form = (extra: Partial<AccountForm> = {}): AccountForm => ({ staffId: 'STF-004', email: ' Laura@Ensilperu.COM ', role: 'Psicopedagogía', ...extra });
const inv = inviteBody(form(), roles, 'http://localhost:3000');
check('La invitación de una persona lleva su id, el rol por id y el correo en minúsculas; sin nombre ni lugares (salen de Personal)', inv.ok && JSON.stringify(inv.body) === JSON.stringify({
  accion: 'invitar', personalId: 'STF-004', correo: 'laura@ensilperu.com', rolId: 'ROL-003', redirectTo: 'http://localhost:3000',
}), JSON.stringify(inv.body));
check('Una cuenta técnica (sin persona) lleva el nombre recortado y pide uno', (() => {
  const ok = inviteBody({ name: '  Soporte Técnico ', email: 'soporte@ensilperu.com', role: 'Superusuario' }, roles).body!;
  const sinNombre = inviteBody({ name: '  ', email: 'a@b.co', role: 'Superusuario' }, roles);
  return ok.nombre === 'Soporte Técnico' && ok.personalId === undefined && ok.rolId === 'ROL-001' && !sinNombre.ok && /nombre de la cuenta técnica/.test(sinNombre.error!);
})());
check('Un rol que no existe se avisa; sin rol, se pide elegirlo', inviteBody(form({ role: 'Fantasma' }), roles).error === 'El rol «Fantasma» no existe.' && inviteBody(form({ role: '' }), roles).error === 'Elija el rol de la cuenta.');

// ------------------------------------------------------------------------------------------------ Editar
const before: User = { ...piura, staffId: 'STF-004', branch: 'Piura', additionalBranches: undefined, warehouses: undefined };
const same = (extra: Partial<AccountForm> = {}): AccountForm => ({ staffId: 'STF-004', name: before.name, email: before.email, role: before.role, status: 'Activo', ...extra });
const ed = (f: AccountForm, b: User = before) => editBody(b, f, roles);
check('Sin cambios no se manda nada', ed(same()).ok && Object.keys(ed(same()).body!.cambios).length === 0 && ed(same()).body!.cuentaId === 'a');
check('Cambiar el rol manda el id del rol y nada más', JSON.stringify(ed(same({ role: 'Administrador de sede' })).body!.cambios) === '{"rolId":"ROL-002"}');
check('Cambiar el estado manda solo el estado', JSON.stringify(ed(same({ status: 'Inactivo' })).body!.cambios) === '{"estado":"Inactivo"}');
check('El nombre de una cuenta de persona no se manda (sale de la ficha), aunque el formulario lo traiga distinto', Object.keys(ed(same({ name: 'Otro Nombre' })).body!.cambios).length === 0);
check('El nombre de una cuenta técnica sí se edita (recortado)', (() => { const su: User = { ...before, staffId: undefined, role: 'Superusuario', branch: 'Todas' }; return JSON.stringify(ed(same({ staffId: undefined, role: 'Superusuario', name: '  Soporte ' }), su).body!.cambios) === '{"nombre":"Soporte"}'; })());
check('Editar con un rol inexistente da error claro', ed(same({ role: 'Fantasma' })).error === 'El rol «Fantasma» no existe.');
check('Rol y estado a la vez mandan los dos', (() => { const c = ed(same({ role: 'Almacén central', status: 'Inactivo' })).body!.cambios; return c.rolId === 'ROL-004' && c.estado === 'Inactivo' && Object.keys(c).length === 2; })());
check('changeNeeds: cada campo pide su función', JSON.stringify(changeNeeds({ estado: 'Inactivo', rolId: 'ROL-002' })) === '[["org-usuarios:deactivate"],["org-usuarios:assign_role"]]' && JSON.stringify(changeNeeds({ estado: 'Activo' })) === '[["org-usuarios:edit"]]' && changeNeeds({}).length === 0);

if (failed > 0) {
  console.log(`\n${failed} comprobaciones fallaron.`);
  process.exit(1);
}
console.log('\nTodas las comprobaciones pasaron.');
