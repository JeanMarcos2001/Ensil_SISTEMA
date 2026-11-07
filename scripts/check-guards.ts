/**
 * Verificación de las guardas (paso 4): toda acción del contexto pide su función, el menú oculta lo que el rol no puede ver y las
 * pantallas consultan `can()` con funciones que existen. Ejecutar: npx tsx scripts/check-guards.ts
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODULE_DATA } from '../src/config/modules';
import { PERM } from '../src/utils/authority';
import { ALL_CAPABILITIES, availability, buildHolders, capabilityById, isKnownCapability } from '../src/utils/capabilities';
import { SETTINGS_SECTION_CAPABILITY, hasSettingsAccess } from '../src/config/settingsSections';
import { MENU_WITHOUT_CAPABILITY, NON_CAPABILITY_ACTIONS } from '../src/utils/capabilityRegistry';
import {
  PermissionError, THROWS_ON_DENIAL, availabilityForViewer, capabilitiesOfAction, denialMessage, guardActions, guardedActionNames, menuCapabilityOf, menuVisible,
  requirementOf, unmetClause, userChangeNeeds,
} from '../src/utils/guards';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : ` -> ${detail}`}`);
  if (!ok) failed++;
};
const list = (xs: string[]) => (xs.length ? xs.slice(0, 8).join(', ') + (xs.length > 8 ? ` … (+${xs.length - 8})` : '') : '');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ctxSrc = readFileSync(join(root, 'src/context/DataContext.tsx'), 'utf8');
const actions = guardedActionNames();
const caps = (...ids: string[]) => (id: string) => ids.includes(id);

// ------------------------------------------------------------------------------------------------------------------ Cobertura
check('Hay acciones registradas', actions.length > 90, String(actions.length));
check('Ninguna acción es a la vez función y «no función»', actions.every(a => !(a in NON_CAPABILITY_ACTIONS)), list(actions.filter(a => a in NON_CAPABILITY_ACTIONS)));
check('Toda acción pide al menos una función que existe', actions.every(a => {
  const req = requirementOf(a, [{}, {}]);
  return !!req && req.length > 0 && req.every(cl => cl.length > 0 && cl.every(isKnownCapability));
}), list(actions.filter(a => !(requirementOf(a, [{}, {}]) ?? []).every(cl => cl.every(isKnownCapability)))));
check('Las consultas y la interfaz no piden función', Object.keys(NON_CAPABILITY_ACTIONS).every(a => requirementOf(a) === null));

// Sin ninguna función no se ejecuta nada; con una de las que la acción admite, sí
const fake: Record<string, (...a: unknown[]) => unknown> = {};
for (const a of actions) fake[a] = () => ({ ok: true, called: a });
const run = (name: string, can: (id: string) => boolean, ...args: unknown[]) => {
  try { return (guardActions(fake, can)[name] as (...a: unknown[]) => any)(...args); } catch (e) { return e; }
};
const isDenied = (r: any, name: string) => (THROWS_ON_DENIAL.has(name) ? r instanceof PermissionError : r && r.ok === false && typeof r.error === 'string' && r.error === r.reason);
check('Sin ninguna función, toda acción se niega (con resultado o con PermissionError)', actions.every(a => isDenied(run(a, caps(), {}, {}), a)), list(actions.filter(a => !isDenied(run(a, caps(), {}, {}), a))));
check('Con una de las funciones que la acción admite, se ejecuta', actions.every(a => {
  const ok = (requirementOf(a, [{}, {}]) ?? []).every(cl => run(a, caps(...(requirementOf(a, [{}, {}]) ?? []).map(c => c[0])), {}, {})?.called === a);
  return ok;
}), list(actions.filter(a => run(a, caps(...(requirementOf(a, [{}, {}]) ?? []).map(c => c[0])), {}, {})?.called !== a)));
check('Con todas las funciones, toda acción se ejecuta', actions.every(a => run(a, () => true, {}, {})?.called === a));
check('Lo que no es acción pasa sin cambios', (() => {
  const g = guardActions({ data: [1, 2], can: () => false, gateOfSchedule: () => 'x' }, caps());
  return g.data.length === 2 && g.gateOfSchedule() === 'x';
})());
check('Los argumentos llegan intactos a la acción', (() => {
  const g = guardActions({ addProgram: (...a: unknown[]) => a }, () => true);
  const r = g.addProgram({ x: 1 }, 'y') as unknown[];
  return r.length === 2 && (r[0] as any).x === 1 && r[1] === 'y';
})());
check('El mensaje de la negativa nombra la función como se ve en Permisos', denialMessage(['op-caja:close_box']) === `Su rol no tiene la función «${capabilityById('op-caja:close_box')!.label}».`);
check('Si basta una de varias, el mensaje las nombra todas', /ninguna de estas funciones/.test(denialMessage(['op-caja:reg_income', 'op-caja:reg_expense'])));
check('unmetClause: cumple todas las cláusulas → null; falta una → esa', unmetClause([['a'], ['b', 'c']], caps('a', 'c')) === null && unmetClause([['a'], ['b', 'c']], caps('a'))?.join() === 'b,c');

// ------------------------------------------------------------------------------------------------------------------ Resolutores por argumentos
const need = (a: string, ...args: unknown[]) => JSON.stringify(requirementOf(a, args));
check('Un ingreso de caja pide «Registrar ingreso»; un egreso, «Registrar egreso»', need('addCashMovement', { kind: 'Ingreso' }) === '[["op-caja:reg_income"]]' && need('addCashMovement', { kind: 'Egreso' }) === '[["op-caja:reg_expense"]]');
check('Quien solo registra ingresos no registra egresos', isDenied(run('addCashMovement', caps('op-caja:reg_income'), { kind: 'Egreso' }), 'addCashMovement') && run('addCashMovement', caps('op-caja:reg_income'), { kind: 'Ingreso' })?.called === 'addCashMovement');
check('Crear un rol pide «Crear rol»; crearlo ya con funciones pide además «Configurar permisos»', need('addRole', { name: 'X' }) === '[["org-roles:create"]]' && need('addRole', { name: 'X', permissions: ['dash-resumen:view'] }) === '[["org-roles:create"],["org-roles:config_perms"]]');
check('Guardar funciones, editar y eliminar un rol devuelven el error (no lanzan): el constructor muestra el motivo', ['savePermissions', 'updateRole', 'deleteRole', 'addRole'].every(a => !THROWS_ON_DENIAL.has(a)));
check('Matricular pide «Crear matrícula»; renovar pide «Renovar matrícula»', need('registerEnrollments', {}) === '[["op-matriculas:create"]]' && need('registerEnrollments', { renewsId: 'MAT-1' }) === '[["op-matriculas:renew"]]');
check('Cerrar la caja pide cerrar caja; el arqueo de caja chica pide el arqueo', need('closeCash', { scope: 'caja' }) === '[["op-caja:close_box"]]' && need('closeCash', { scope: 'caja-chica' }) === '[["op-caja-chica:count"]]');
check('Reversar un pago pide reversar pagos (la nota de crédito la valida la acción)', need('reversePayment', 'PAG-1', {}) === '[["op-pagos:reverse_payment"]]');
check('Guardar una receta nueva pide crear; una existente, editar', need('saveRecipe', { id: '' }) === '[["com-recetas:create"]]' && need('saveRecipe', { id: 'REC-1' }) === '[["com-recetas:edit"]]');
check('Confirmar la recepción de un envío pide «Confirmar la recepción»; la de una transferencia, «Recepcionar»', need('confirmReception', { docType: 'Envío' }) === '[["log-recepciones:confirm"]]' && need('confirmReception', { docType: 'Transferencia' }) === '[["log-transfer:receive"]]');
check('Un almacenero sin «Recepcionar transferencia» no recepciona una transferencia', isDenied(run('confirmReception', caps('log-recepciones:confirm'), { docType: 'Transferencia' }), 'confirmReception'));
const trfStatus: [string, string][] = [['Solicitada', 'log-transfer:req_transfer'], ['Aprobada', 'log-transfer:approve_transfer'], ['Rechazada', 'log-transfer:approve_transfer'], ['En tránsito', 'log-transfer:dispatch'], ['Listo para recepción', 'log-transfer:dispatch'], ['Recibida', 'log-transfer:receive']];
check('Cada estado de una transferencia pide su función', trfStatus.every(([s, c]) => need('updateTransferStatus', 'TRF-1', s) === JSON.stringify([[c]])), list(trfStatus.filter(([s, c]) => need('updateTransferStatus', 'TRF-1', s) !== JSON.stringify([[c]])).map(([s]) => s)));
check('Quien solo solicita no puede aprobar su propia transferencia', isDenied(run('updateTransferStatus', caps('log-transfer:req_transfer'), 'TRF-1', 'Aprobada'), 'updateTransferStatus'));
check('Cancelar una transferencia la puede quien solicita, aprueba o despacha', JSON.parse(need('updateTransferStatus', 'TRF-1', 'Cancelada'))[0].length === 3);
check('Marcar «Asistió» o «Faltó» pide marcar asistencia (la sesión de seguimiento también deja «Asistió»)', need('updateSchedule', 'S1', { status: 'Faltó' }) === '[["psi-prog:mark_attendance"]]' && need('updateSchedule', 'S1', { status: 'Asistió' }) === '[["psi-prog:mark_attendance","psi-prog:reg_tracking"]]');
check('Cancelar o mover una asesoría pide reprogramar', need('updateSchedule', 'S1', { status: 'Cancelado' }) === '[["psi-prog:reschedule"]]' && need('updateSchedule', 'S1', { date: '2026-01-01', status: 'Reprogramado' }) === '[["psi-prog:reschedule"]]');
check('Editar una asesoría ya atendida (formulario completo) pide reprogramar, no marcar asistencia', need('updateSchedule', 'S1', { date: '2026-01-01', time: '10:00', status: 'Asistió' }) === '[["psi-prog:reschedule"]]');
check('Quien solo marca asistencia no puede cancelar ni mover', isDenied(run('updateSchedule', caps('psi-prog:mark_attendance'), 'S1', { status: 'Cancelado' }), 'updateSchedule') && run('updateSchedule', caps('psi-prog:mark_attendance'), 'S1', { status: 'Faltó' })?.called === 'updateSchedule');

// ------------------------------------------------------------------------------------------------------------------ Cambios de una cuenta de usuario
const u = { name: 'Ana', email: 'a@x.pe', role: 'Administrador de sede', branch: 'Piura', status: 'Activo' as const, document: '1', phone: '2', additionalBranches: [] as string[] };
const flat = (r: string[][]) => r.map(c => c.join('|')).sort().join(',');
check('Sin cambios reales no se pide nada (el formulario manda todos los campos)', userChangeNeeds(u, { ...u }).length === 0);
check('Desactivar pide «Desactivar usuario»; activar pide «Editar usuario»', flat(userChangeNeeds(u, { status: 'Inactivo' })) === 'org-usuarios:deactivate' && flat(userChangeNeeds({ ...u, status: 'Inactivo' }, { status: 'Activo' })) === 'org-usuarios:edit');
check('Cambiar el rol pide «Asignar rol»', flat(userChangeNeeds(u, { ...u, role: 'Almacén central' })) === 'org-usuarios:assign_role');
check('Cambiar la sede o las sedes adicionales pide «Asignar sedes»', flat(userChangeNeeds(u, { ...u, branch: 'Chiclayo' })) === 'org-usuarios:assign_branch' && flat(userChangeNeeds(u, { ...u, additionalBranches: ['Piura'] })) === 'org-usuarios:assign_branch');
check('Corregir nombre, correo, documento o teléfono pide «Editar usuario»', ['name', 'email', 'document', 'phone'].every(k => flat(userChangeNeeds(u, { ...u, [k]: 'otro' })) === 'org-usuarios:edit'));
check('Un cambio de rol y de nombre pide las dos funciones', flat(userChangeNeeds(u, { ...u, role: 'Contabilidad', name: 'Ana M.' })) === 'org-usuarios:assign_role,org-usuarios:edit');
check('Las sedes adicionales en otro orden no cuentan como cambio', userChangeNeeds({ ...u, additionalBranches: ['A', 'B'] }, { additionalBranches: ['B', 'A'] }).length === 0);

// ------------------------------------------------------------------------------------------------------------------ Envíos y transferencias
check('Un envío que nace «En tránsito» pide preparar y despachar; un borrador, solo preparar', need('addShipment', { status: 'En tránsito' }) === '[["log-envios:create"],["log-envios:dispatch"]]' && need('addShipment', { status: 'Borrador' }) === '[["log-envios:create"]]');
check('Quien solo prepara no puede despachar creando el envío ya «En tránsito»', isDenied(run('addShipment', caps('log-envios:create'), { status: 'En tránsito' }), 'addShipment') && run('addShipment', caps('log-envios:create'), { status: 'Borrador' })?.called === 'addShipment');
check('Pasar un envío a «En tránsito» pide despachar; cualquier otro cambio, editar', need('updateShipment', 'ENV-1', { status: 'En tránsito' }) === '[["log-envios:dispatch"]]' && need('updateShipment', 'ENV-1', { manualEnable: true }) === '[["log-envios:edit"]]');
check('Completar las cajas y el transporte de una transferencia pide despachar; corregir lo pedido, solicitar', need('updateTransfer', 'TRF-1', { boxes: [], courierId: 'C1' }) === '[["log-transfer:dispatch"]]' && need('updateTransfer', 'TRF-1', { items: [], reason: 'x' }) === '[["log-transfer:req_transfer"]]' && need('updateTransfer', 'TRF-1', { manualEnable: true }) === '[["log-transfer:dispatch"]]');
check('Quien solo solicita transferencias no completa el despacho de una', isDenied(run('updateTransfer', caps('log-transfer:req_transfer'), 'TRF-1', { boxes: [] }), 'updateTransfer'));

// ------------------------------------------------------------------------------------------------------------------ Disponibilidad (contrapartes)
const people = {
  users: [{ id: 'U1', name: 'Rosa', role: 'Administrador de sede', branch: 'Piura', status: 'Activo' as const }],
  roles: [{ id: 'R1', name: 'Administrador de sede', status: 'Activo' as const }],
  permissions: [{ roleId: 'R1', permissions: ['log-recepciones:confirm', 'log-recepciones:view'] }],
  branches: [{ id: 'FIL-002', name: 'Piura' }, { id: 'FIL-003', name: 'Chiclayo' }],
};
const holders = buildHolders(people);
const toPiura = availability('log-envios:dispatch', holders, { branchId: 'FIL-002', branchName: 'Piura' });
const toChiclayo = availability('log-envios:dispatch', holders, { branchId: 'FIL-003', branchName: 'Chiclayo' });
check('Despachar a una sede con quien reciba se ofrece', toPiura.available && !toPiura.reason);
check('Despachar a una sede sin quien reciba no se ofrece y dice por qué', !toChiclayo.available && /Chiclayo/.test(toChiclayo.reason ?? ''), toChiclayo.reason ?? '');
check('A un rol que no es Superusuario se le niega tal cual', availabilityForViewer(toChiclayo, false).available === false);
const forSuper = availabilityForViewer(toChiclayo, true);
check('Al Superusuario se le ofrece igual, con el motivo como aviso', forSuper.available && forSuper.advisories.some(a => /Chiclayo/.test(a) && /Superusuario/.test(a)));
check('Lo que ya está disponible no cambia para nadie', availabilityForViewer(toPiura, true) === toPiura && availabilityForViewer(toPiura, false) === toPiura);

// ------------------------------------------------------------------------------------------------------------------ Configuración
const settingsSrc = readFileSync(join(root, 'src/pages/settings/SettingsPage.tsx'), 'utf8');
const sectionIds = [...settingsSrc.matchAll(/\{ id: '([a-z]+)', label:/g)].map(m => m[1]);
check('Hay secciones de Configuración que revisar', sectionIds.length >= 5, String(sectionIds.length));
check('Toda sección de Configuración tiene su función y existe', sectionIds.every(id => isKnownCapability(SETTINGS_SECTION_CAPABILITY[id] ?? '')), list(sectionIds.filter(id => !isKnownCapability(SETTINGS_SECTION_CAPABILITY[id] ?? ''))));
check('Sin funciones no se ofrece el botón Configuración; con una sola, sí', !hasSettingsAccess(caps()) && hasSettingsAccess(caps('cfg-couriers:view')));

// ------------------------------------------------------------------------------------------------------------------ El contexto usa las guardas
check('El contexto envuelve sus acciones con guardActions', /guardActions\(\s*data\s*,/.test(ctxSrc), 'falta guardActions(data, …) en DataProvider');
check('Las acciones que no devuelven resultado están en THROWS_ON_DENIAL (y solo ellas)', (() => {
  const iface = ctxSrc.slice(ctxSrc.indexOf('interface DataContextType'), ctxSrc.indexOf('export const DataContext ='));
  const returnsResult = (a: string) => {
    const line = iface.split('\n').find(l => new RegExp(`^  ${a}: `).test(l)) ?? '';
    const ret = line.includes('=>') ? line.slice(line.lastIndexOf('=>')) : (iface.slice(iface.indexOf(line)).split(/\n  \w+: /)[0] ?? '');
    return /StockResult|OpResult|ok: boolean/.test(ret) || (a === 'updateEnrollmentVerification');
  };
  const wrong = actions.filter(a => returnsResult(a) === THROWS_ON_DENIAL.has(a));
  if (wrong.length) console.log('     ', list(wrong));
  return wrong.length === 0;
})());

// ------------------------------------------------------------------------------------------------------------------ Menú
const items = Object.entries(MODULE_DATA).flatMap(([m, d]) => d.groups.flatMap(g => g.items.map(i => ({ m, i }))));
check('Todo ítem del menú pide su función de ver (salvo los declarados sin ella)', items.every(({ m, i }) => menuCapabilityOf(m, i) !== undefined || `${m}/${i}` in MENU_WITHOUT_CAPABILITY), list(items.filter(({ m, i }) => menuCapabilityOf(m, i) === undefined && !(`${m}/${i}` in MENU_WITHOUT_CAPABILITY)).map(({ m, i }) => `${m}/${i}`)));
check('Sin funciones no se ve ningún ítem con función; con todas se ven todos', items.filter(({ m, i }) => menuCapabilityOf(m, i)).every(({ m, i }) => !menuVisible(m, i, caps()) && menuVisible(m, i, () => true)));
check('Un ítem sin función (Preferencias) lo decide el menú, no el rol', menuVisible('sistema', 'Preferencias', caps()));
check('Ver Caja y ver el reporte de Caja son ítems distintos', menuCapabilityOf('operacion', 'Caja') === 'op-caja:view' && menuCapabilityOf('reportes', 'Caja') === 'rep-caja:view');
check('Permisos y Roles piden funciones distintas', menuCapabilityOf('organizacion', 'Roles') === 'org-roles:view' && menuCapabilityOf('organizacion', 'Permisos') === 'org-roles:config_perms');

// ------------------------------------------------------------------------------------------------------------------ Pantallas
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap(n => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(n) ? [p] : [];
  });
}
const srcFiles = walk(join(root, 'src')).filter(f => !/[\\/]utils[\\/]/.test(f) && !f.endsWith('DataContext.tsx'));
const text = new Map(srcFiles.map(f => [relative(root, f).replace(/\\/g, '/'), readFileSync(f, 'utf8')]));

const stringIds = [...text.entries()].flatMap(([f, t]) => [...t.matchAll(/\bcan\(\s*'([^']+)'/g)].map(m => `${f}: ${m[1]}`));
check('Toda función que una pantalla consulta con texto existe en el catálogo', stringIds.every(s => isKnownCapability(s.split(': ')[1])), list(stringIds.filter(s => !isKnownCapability(s.split(': ')[1]))));
const permKeys = [...text.entries()].flatMap(([f, t]) => [...t.matchAll(/\bPERM\.(\w+)/g)].map(m => ({ f, k: m[1] })));
check('Toda clave PERM que usa una pantalla existe', permKeys.every(({ k }) => k in PERM), list(permKeys.filter(({ k }) => !(k in PERM)).map(({ f, k }) => `${f}:${k}`)));
check('Toda clave PERM apunta a una función del catálogo', Object.values(PERM).every(isKnownCapability), list(Object.values(PERM).filter(v => !isKnownCapability(v))));

/** ¿El archivo consulta alguna de estas funciones (por texto o por clave PERM)? */
const mentions = (t: string, ids: string[]) => ids.some(id => t.includes(`'${id}'`) || Object.entries(PERM).some(([k, v]) => v === id && new RegExp(`PERM\\.${k}\\b`).test(t)));

/** Archivos que llaman acciones pero cuya guarda está en la pantalla que los abre (ventanas que se abren desde un botón ya filtrado). */
const GATED_BY_PARENT: Record<string, string> = {
  'components/enrollment/DropRequestModal.tsx': 'Se abre desde las acciones de la matrícula (useChangeActions), que ya consultan la función.',
  'components/enrollment/ChangeRequestModal.tsx': 'Se abre desde las acciones de la matrícula (useChangeActions).',
  'components/enrollment/ResolveDropModal.tsx': 'Se abre desde Solicitudes pendientes y la ficha de la matrícula, donde se consulta la autoridad.',
  'components/enrollment/ResolveChangeModal.tsx': 'Se abre desde Solicitudes pendientes y la ficha de la matrícula, donde se consulta la autoridad.',
  'components/enrollment/EditEnrollmentModal.tsx': 'Se abre desde las acciones de la matrícula (useChangeActions).',
  'components/payments/RegisterPaymentModal.tsx': 'Se abre desde Pagos, que oculta el botón sin la función.',
  'components/payments/ReversePaymentModal.tsx': 'Se abre desde Pagos, que oculta el botón sin la función.',
  'components/cash/CloseCashModal.tsx': 'Se abre desde Caja y Caja chica, que ocultan el botón sin la función.',
  'components/cash/DepositBatchModal.tsx': 'Se abre desde Caja, que oculta el botón sin la función.',
  'components/collections/RemindersPanel.tsx': 'Se muestra dentro de Planes y cartera.',
  'components/enrollment/EnrollmentDocumentsPanel.tsx': 'Se muestra dentro de la ficha de la matrícula.',
  'components/enrollment/EnrollmentFichaModal.tsx': 'Se abre desde Matrículas.',
  'components/layout/NotificationDropdown.tsx': 'La campana solo se muestra con «Ver la bandeja de avisos» (Topbar).',
  'pages/NewEnrollmentWizard.tsx': 'Se abre desde el botón «Nueva matrícula», que se muestra solo con la función.',
  'pages/enrollment/StepStudents.tsx': 'Paso del asistente de matrícula.',
  'pages/people/StudentFormModal.tsx': 'Se abre desde Alumnos, que oculta el botón sin la función.',
  'pages/people/GuardianFormModal.tsx': 'Se abre desde Titulares, que oculta el botón sin la función.',
  'pages/people/StaffFormModal.tsx': 'Se abre desde Personal, que oculta el botón sin la función.',
  'pages/people/ContractFormModal.tsx': 'Se abre desde Contratos, que oculta el botón sin la función.',
  'pages/people/AssignmentFormModal.tsx': 'Se abre desde Asignaciones, que oculta el botón sin la función.',
  'pages/logistics/ItemPricesModal.tsx': 'Se abre desde Catálogo de artículos.',
  'pages/psychopedagogy/ScheduleFormModal.tsx': 'Se abre desde Programación, que oculta el botón sin la función.',
  'pages/psychopedagogy/SessionModal.tsx': 'Se abre desde Programación, que oculta el botón sin la función.',
  'pages/psychopedagogy/ActivityEnrollModal.tsx': 'Se abre desde Programación y Cronogramas mensuales.',
  'pages/psychopedagogy/CapacityModal.tsx': 'Se abre desde Programación, que oculta el botón sin la función.',
  'pages/settings/CollectionsConfig.tsx': 'Ventana de Configuración: SettingsPage solo ofrece la sección con la función.',
  'pages/settings/DocumentTemplatesConfig.tsx': 'Ventana de Configuración: SettingsPage solo ofrece la sección con la función.',
  'pages/settings/LeadsConfig.tsx': 'Ventana de Configuración: SettingsPage solo ofrece la sección con la función.',
  'pages/settings/PsyRemindersConfig.tsx': 'Ventana de Configuración: SettingsPage solo ofrece la sección con la función.',
};
check('Las excepciones declaradas existen', Object.keys(GATED_BY_PARENT).every(f => text.has(`src/${f}`)), list(Object.keys(GATED_BY_PARENT).filter(f => !text.has(`src/${f}`))));

const ungated: string[] = [];
for (const a of actions) {
  const accepted = [...new Set([...capabilitiesOfAction(a), ...(requirementOf(a, [{}, {}]) ?? []).flat()])];
  for (const [file, t] of text) {
    // Solo cuenta si la pantalla toma la acción del contexto (no un nombre local que se le parezca)
    const taken = [...t.matchAll(/const \{([^}]*)\} = useData\(\)/g)].some(m => new RegExp(`\\b${a}\\b`).test(m[1])) || new RegExp(`useData\\(\\)\\.${a}\\b`).test(t);
    if (!taken) continue;
    if (file.replace(/^src\//, '') in GATED_BY_PARENT) continue;
    if (!mentions(t, accepted)) ungated.push(`${file.replace(/^src\//, '')}→${a}`);
  }
}
check('Toda pantalla que llama una acción consulta alguna función que la cubre', ungated.length === 0, list(ungated));
if (ungated.length) console.log(ungated.map(x => `      ${x}`).join('\n'));

// ------------------------------------------------------------------------------------------------------------------ Resumen
const fnCount = ALL_CAPABILITIES.filter(c => c.actions.length > 0).length;
console.log(`\n${actions.length} acciones guardadas (${THROWS_ON_DENIAL.size} lanzan PermissionError; el resto devuelven el error) · ${fnCount} funciones con acciones · ${items.length} ítems de menú`);
console.log(failed === 0 ? '\nTodo correcto.' : `\n${failed} caso(s) fallaron.`);
process.exit(failed === 0 ? 0 : 1);
