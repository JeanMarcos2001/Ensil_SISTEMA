/**
 * Verificación por rol (paso 8): recorre cada cuenta de ejemplo con las mismas reglas que usa el sistema y comprueba qué ve (menú,
 * Dashboard, primera pantalla, sedes, avisos) y qué puede hacer (guardas de las acciones), contra lo que el negocio decidió.
 * La matriz completa se genera en docs/PRUEBAS_POR_ROL.md (`npx tsx scripts/doc-role-matrix.ts`).
 * Ejecutar: npx tsx scripts/check-role-matrix.ts
 */
import { seedBranches, seedPermissions, seedRoles, seedUsers, seedWarehouses } from '../src/data/seedCatalog';
import { PERM, can as canDo } from '../src/utils/authority';
import { ALL_CAPABILITIES, capabilityById } from '../src/utils/capabilities';
import { EVENTS } from '../src/utils/capabilityRegistry';
import { guardActions, menuVisible, PermissionError } from '../src/utils/guards';
import { accountProfiles, canRunAction, KEY_ACTIONS, type AccountProfile } from '../src/utils/roleMatrix';
import { readFileSync } from 'node:fs';
import { getAllItemsForModule } from '../src/config/modules';
import { buildHolders } from '../src/utils/capabilities';
import { resolveRecipients } from '../src/utils/notifications';
import { slugify } from '../src/utils/string';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : ` -> ${detail}`}`);
  if (!ok) failed++;
};
const list = (xs: string[]) => (xs.length ? xs.slice(0, 10).join(', ') + (xs.length > 10 ? ` … (+${xs.length - 10})` : '') : '');

const src = { users: seedUsers(), roles: seedRoles(), permissions: seedPermissions(), branches: seedBranches(), warehouses: seedWarehouses() };
const profiles = accountProfiles(src);
const of = (name: string): AccountProfile => profiles.find(p => p.name === name)!;
const byRole = (role: string) => profiles.filter(p => p.role === role);

const laura = of('Laura Martínez');
const marco = of('Marco Salas');
const juan = of('Juan Pérez');
const rosa = of('Rosa Quispe');
const elena = of('Elena Ramos');
const admin = of('Admin Sistema');
const superadmin = of('Superadmin');
const allKeys = KEY_ACTIONS.map(a => a.id);

const can = (p: AccountProfile, ...ids: string[]) => ids.every(id => p.allowed.includes(id));
const cannot = (p: AccountProfile, ...ids: string[]) => ids.every(id => !p.allowed.includes(id));
const wrong = (p: AccountProfile, yes: string[], no: string[]) => [...yes.filter(id => !p.allowed.includes(id)).map(id => `debería poder «${id}»`), ...no.filter(id => p.allowed.includes(id)).map(id => `no debería poder «${id}»`)];

// ------------------------------------------------------------------------------------------------------------------ Cuentas
check('Cada cuenta de ejemplo activa se evalúa (7 de 8: una está inactiva)', profiles.length === 7 && !profiles.some(p => p.status !== 'Activo'));
check('Todas las acciones clave existen en el sistema (ninguna escrita mal)', KEY_ACTIONS.every(a => a.capability ? !!capabilityById(a.capability) : canRunAction(() => true, a.action!, a.args) === true));
check('Los ids de las acciones clave no se repiten', new Set(allKeys).size === allKeys.length);

// ------------------------------------------------------------------------------------------------------------------ Qué puede hacer cada rol (el plan, §2 y la separación de funciones)
const seedPlan: { who: AccountProfile; yes: string[]; no: string[] }[] = [
  {
    who: laura,
    yes: ['matricular', 'renovar', 'pedir-caida', 'entregar-materiales', 'cobrar', 'ingreso-caja', 'egreso-caja', 'vender', 'cerrar-caja', 'recibir-envio', 'agendar', 'reprogramar'],
    no: ['aprobar-caida', 'reversar-pago', 'reversar-caja', 'reabrir-caja', 'reabrir-caja-chica', 'ingresar-stock', 'preparar-envio', 'despachar-envio', 'ajustar-stock', 'asistencia', 'seguimiento', 'crear-contrato', 'renovar-contrato', 'generar-planilla', 'cerrar-planilla', 'crear-tarifa', 'crear-promocion', 'crear-sede', 'crear-rol', 'configurar-permisos', 'crear-usuario'],
  },
  {
    who: juan,
    yes: ['asistencia', 'seguimiento'],
    no: ['matricular', 'renovar', 'pedir-caida', 'aprobar-caida', 'entregar-materiales', 'cobrar', 'ingreso-caja', 'egreso-caja', 'vender', 'cerrar-caja', 'reversar-pago', 'reversar-caja', 'reabrir-caja', 'reabrir-caja-chica', 'ingresar-stock', 'preparar-envio', 'despachar-envio', 'recibir-envio', 'ajustar-stock', 'agendar', 'reprogramar', 'crear-contrato', 'renovar-contrato', 'generar-planilla', 'cerrar-planilla', 'pagar-planilla', 'crear-tarifa', 'crear-rol', 'crear-usuario'],
  },
  {
    who: rosa,
    yes: ['ingresar-stock', 'preparar-envio', 'despachar-envio', 'ajustar-stock'],
    no: ['recibir-envio', 'matricular', 'cobrar', 'ingreso-caja', 'egreso-caja', 'cerrar-caja', 'reversar-pago', 'reversar-caja', 'reabrir-caja', 'reabrir-caja-chica', 'crear-tarifa', 'asistencia', 'agendar', 'crear-contrato', 'renovar-contrato', 'generar-planilla', 'crear-rol', 'crear-usuario'],
  },
  {
    who: admin,
    yes: ['aprobar-caida', 'reversar-pago', 'reversar-caja', 'reabrir-caja', 'reabrir-caja-chica', 'crear-contrato', 'renovar-contrato', 'generar-planilla', 'cerrar-planilla', 'crear-tarifa', 'crear-promocion'],
    no: ['cobrar', 'ingreso-caja', 'egreso-caja', 'vender', 'cerrar-caja', 'pedir-caida', 'matricular', 'entregar-materiales', 'recibir-envio', 'despachar-envio', 'asistencia', 'crear-rol', 'configurar-permisos', 'crear-usuario'],
  },
  { who: elena, yes: [], no: allKeys },
  { who: superadmin, yes: allKeys, no: [] },
];
for (const { who, yes, no } of seedPlan) {
  const problems = wrong(who, yes, no);
  check(`${who.name} (${who.role}): puede y no puede lo que el negocio decidió`, problems.length === 0, list(problems));
}
check('Dos administradores de sede (Piura y Los Olivos) pueden exactamente lo mismo', laura.allowed.join() === marco.allowed.join() && laura.allowedActions === marco.allowedActions);

// ------------------------------------------------------------------------------------------------------------------ Separación de funciones
const nonSuper = profiles.filter(p => p.role !== 'Superusuario');
check('Nadie cobra y reversa el pago en la misma cuenta', nonSuper.every(p => !(can(p, 'cobrar') && can(p, 'reversar-pago'))));
check('Nadie reversa movimientos de caja y reabre cierres de la caja salvo Administración general (combinación declarada)', nonSuper.filter(p => can(p, 'reversar-caja') && can(p, 'reabrir-caja')).map(p => p.role).join() === 'Administración general');
check('Solo Administración general y el Superusuario reversan pagos y movimientos de caja', profiles.filter(p => can(p, 'reversar-pago') || can(p, 'reversar-caja')).every(p => ['Administración general', 'Superusuario'].includes(p.role)));
check('Solo Administración general y el Superusuario reabren el cierre de la caja y el de la caja chica', profiles.filter(p => can(p, 'reabrir-caja') || can(p, 'reabrir-caja-chica')).every(p => ['Administración general', 'Superusuario'].includes(p.role)));
check('Nadie marca la planilla como pagada: el sistema no registra pagos al personal', !allKeys.includes('pagar-planilla') && !profiles.some(p => p.capabilities.includes('per-planilla:pay')));
check('Solo el Superusuario crea roles, configura permisos y crea cuentas y sedes', profiles.filter(p => can(p, 'crear-rol') || can(p, 'configurar-permisos') || can(p, 'crear-usuario') || can(p, 'crear-sede')).every(p => p.role === 'Superusuario'));
check('Quien cobra no aprueba las caídas que pide, ni quien las pide las aprueba', nonSuper.every(p => !(can(p, 'pedir-caida') && can(p, 'aprobar-caida'))));
check('Quien despacha un envío no confirma su recepción', nonSuper.every(p => !(can(p, 'despachar-envio') && can(p, 'recibir-envio'))));
check('Contabilidad no ejecuta ninguna acción de negocio (solo lectura y exportación; lo único que "hace" es marcar sus avisos como leídos)', elena.allowedActions === 1 && allKeys.every(id => !elena.allowed.includes(id)));
check('Ningún rol que no sea el Superusuario puede ejecutar todas las acciones', nonSuper.every(p => p.allowedActions < superadmin.allowedActions));

// ------------------------------------------------------------------------------------------------------------------ Dinero y sueldos
const holdsAny = (p: AccountProfile, id: string) => p.capabilities.includes(id);
check('Solo Administración general, Contabilidad y el Superusuario ven sueldos', profiles.filter(p => holdsAny(p, 'per-remuneracion:view')).every(p => ['Administración general', 'Contabilidad', 'Superusuario'].includes(p.role)));
check('Psicopedagogía y Almacén no ven ninguna cifra de dinero ni sueldos', [juan, rosa].every(p => !holdsAny(p, 'dash-resumen:view_money') && !holdsAny(p, 'per-remuneracion:view') && !p.menu.some(i => /Pagos|Caja|Cartera|Planilla|Contratos/.test(i))));
const moneyFunctions = (p: AccountProfile) => p.capabilities.filter(id => capabilityById(id)?.sensitive === 'dinero');
check('Psicopedagogía no tiene ninguna función sensible de dinero', moneyFunctions(juan).length === 0);
check('Almacén no tiene ninguna función de dinero: no fija precios (los fija Administración general)', moneyFunctions(rosa).length === 0 && !rosa.capabilities.includes('log-catalogo:edit_price') && admin.capabilities.includes('log-catalogo:edit_price'), moneyFunctions(rosa).join());
check('Quien no ve cifras de dinero no ve esas tarjetas ni paneles del Dashboard', profiles.filter(p => !holdsAny(p, 'dash-resumen:view_money') && p.role !== 'Superusuario').every(p => !p.dashboard.cards.some(c => c === 'cartera' || c === 'pagos') && !p.dashboard.cashPanel && !p.dashboard.activity));
check('Contabilidad ve el dinero de todas las sedes pero no matrículas', elena.scope.allBranches && elena.dashboard.cards.join() === 'cartera,pagos' && !elena.menu.includes('Operación › Matrículas'));

// Una pantalla que muestra saldos o estados de cuenta debe pedir la función de ver pagos (hallazgo del paso 8: Titulares los mostraba a Psicopedagogía)
const page = (file: string) => readFileSync(new URL(`../src/pages/${file}`, import.meta.url), 'utf8');
check('Titulares solo muestra saldos y estado de cuenta a quien puede ver los pagos (Psicopedagogía ve a los titulares, no lo que deben)', (() => {
  const text = page('Guardians.tsx');
  return text.includes("can('op-pagos:view')") && !holdsAny(juan, 'op-pagos:view') && ['seesMoney && <th', 'seesMoney && <td', "hidden: !seesMoney"].every(s => text.includes(s));
})());

// ------------------------------------------------------------------------------------------------------------------ Menú
const items = (p: AccountProfile) => new Set(p.menu);
check('Administrador de sede: ve su operación (matrícula, caja, cobranza, verificación, asesorías, alumnos) y no Organización, Oferta comercial ni Personal',
  ['Operación › Matrículas', 'Operación › Caja', 'Operación › Verificación', 'Operación › Planes y cartera', 'Psicopedagogía › Programación', 'Personas › Alumnos', 'Logística › Recepciones'].every(i => items(laura).has(i))
  && !laura.menu.some(i => /^(Organización|Oferta comercial)/.test(i) || /Personal|Contratos|Planilla|Asignaciones/.test(i)));
check('Psicopedagogía: ve sus pantallas y el reporte de Psicopedagogía, sin dinero ni logística', ['Psicopedagogía › Programación', 'Psicopedagogía › Historial del alumno', 'Reportes › Psicopedagogía'].every(i => items(juan).has(i)) && !juan.menu.some(i => /^(Operación|Logística|Organización|Oferta comercial)/.test(i)));
check('Almacén central: ve su logística y el reporte de stock, sin matrículas ni dinero', ['Logística › Catálogo de artículos', 'Logística › Stock', 'Logística › Envíos', 'Logística › Transferencias', 'Logística › Kardex', 'Logística › Ajustes y mermas', 'Reportes › Stock'].every(i => items(rosa).has(i)) && !rosa.menu.some(i => /^(Operación|Psicopedagogía|Personas|Organización)/.test(i)));
check('Almacén central no ve Recepciones (no confirma envíos)', !items(rosa).has('Logística › Recepciones'));
check('Contabilidad: ve caja, cartera, pagos y planilla en lectura, y esos reportes', ['Operación › Caja', 'Operación › Planes y cartera', 'Operación › Pagos', 'Personas › Planilla', 'Reportes › Caja', 'Reportes › Cartera', 'Reportes › Personal'].every(i => items(elena).has(i)));
check('Administración general ve oferta comercial, personal, planilla, auditoría y todos los reportes, y no Roles, Permisos ni Usuarios', ['Oferta comercial › Tarifarios', 'Personas › Planilla', 'Sistema › Auditoría', 'Sistema › Reaperturas', 'Reportes › Personal', 'Reportes › Stock'].every(i => items(admin).has(i)) && !admin.menu.some(i => /Organización › (Roles|Permisos|Usuarios)/.test(i)));
check('Solo el Superusuario ve Roles, Permisos y Usuarios', profiles.filter(p => p.menu.some(i => /Organización › (Roles|Permisos|Usuarios)/.test(i))).every(p => p.role === 'Superusuario'));
check('El Superusuario ve todo el menú que pide una función', (() => { const total = ALL_CAPABILITIES.filter(c => c.menu && !c.reserved).length; return superadmin.menu.length === total; })(), `${superadmin.menu.length}`);
check('El menú de cada cuenta tiene un ítem por cada función de menú que su rol tiene (ni más ni menos)', profiles.every(p => p.menu.length === ALL_CAPABILITIES.filter(cap => cap.menu && !cap.reserved && p.capabilities.includes(cap.id)).length),
  list(profiles.map(p => `${p.name}:${p.menu.length}/${ALL_CAPABILITIES.filter(cap => cap.menu && !cap.reserved && p.capabilities.includes(cap.id)).length}`)));

// ------------------------------------------------------------------------------------------------------------------ Primera pantalla y Dashboard
check('Toda cuenta entra a una pantalla que su rol puede abrir', profiles.every(p => {
  const [, module, item] = p.firstPath.match(/^\/([^/]+)(?:\/(.+))?$/) ?? [];
  const can = (id: string) => p.capabilities.includes(id);
  return module === 'mensajeria' || module === 'dashboard' ? menuVisible(module, module === 'dashboard' ? 'Resumen general' : 'Mensajería', can) : !!item;
}));
check('Todo rol de ejemplo entra al Dashboard (todos lo ven)', profiles.every(p => p.firstPath === '/dashboard/resumen-general'));
check('Ningún Dashboard queda vacío: cada rol tiene indicadores o accesos a su trabajo', profiles.every(p => p.dashboard.cards.length > 0 || p.dashboard.quickLinks.length > 0));
check('Cada acceso rápido del Dashboard lleva a una pantalla que el rol abre', profiles.every(p => p.dashboard.quickLinks.every(l => {
  const [module, slug] = l.to.slice(1).split('/');
  const item = getAllItemsForModule(module).find(i => slugify(i) === slug);
  return !!item && menuVisible(module, item, id => p.capabilities.includes(id));
})));
check('Los accesos «Nuevo…» del Dashboard se ofrecen solo a quien puede crear eso', profiles.every(p => p.dashboard.quickLinks.every(l => {
  const creates: Record<string, string> = { 'Nueva Promoción': 'crear-promocion', 'Nuevo Tarifario': 'crear-tarifa', 'Nuevo Usuario': 'crear-usuario', 'Nueva Filial': 'crear-sede' };
  return !(l.label in creates) || p.allowed.includes(creates[l.label]);
})));
check('Administración general ve «Nueva Promoción» y «Nuevo Tarifario» (los crea) y no «Nueva Filial» ni «Nuevo Usuario» (no los crea)', admin.dashboard.quickLinks.map(l => l.label).slice(0, 2).join() === 'Nueva Promoción,Nuevo Tarifario' && !admin.dashboard.quickLinks.some(l => /Filial|Usuario/.test(l.label)));
check('Almacén: su Dashboard es el stock y sus accesos son de logística', rosa.dashboard.cards.join() === 'stock' && !rosa.dashboard.sedes && rosa.dashboard.quickLinks.every(l => l.to.startsWith('/logistica/')));
check('Psicopedagogía: su Dashboard son accesos a Programación, Historial, Cronogramas y Recordatorios', juan.dashboard.cards.length === 0 && juan.dashboard.quickLinks.map(l => l.label).join() === 'Programación,Historial del alumno,Cronogramas mensuales,Recordatorios');
check('Administrador de sede: ve sus 6 indicadores y no «Solicitudes» (no aprueba)', laura.dashboard.cards.join() === 'matriculas,cartera,pagos,verificaciones,por-vencer,stock');
check('El Superusuario ve las 7 tarjetas', superadmin.dashboard.cards.length === 7);

// ------------------------------------------------------------------------------------------------------------------ Sedes
check('Administrador de sede y Psicopedagogía alcanzan solo su sede', [laura, marco, juan].every(p => !p.scope.allBranches && p.scope.branchIds.length === 1));
check('Almacén, Contabilidad, Administración general y el Superusuario alcanzan todas las sedes', [rosa, elena, admin, superadmin].every(p => p.scope.allBranches && p.scope.branchIds.length > 1));

// ------------------------------------------------------------------------------------------------------------------ Avisos
check('Toda cuenta que recibe avisos puede verlos (tiene la campana: «Ver la bandeja de avisos»)', profiles.filter(p => p.notices.length > 0).every(p => p.capabilities.includes('sis-avisos:view')), list(profiles.filter(p => p.notices.length > 0 && !p.capabilities.includes('sis-avisos:view')).map(p => p.name)));
const received = new Set(profiles.flatMap(p => p.notices));
check('Los 22 avisos llegan a alguien con las cuentas de ejemplo (en un caso en su sede)', EVENTS.every(e => received.has(e.id)), list(EVENTS.filter(e => !received.has(e.id)).map(e => e.id)));
check('Los avisos de dinero (pagos reversados, cajas reabiertas) llegan a Administración general', ['payment_reversed', 'cash_movement_reversed', 'cash_reopened'].every(id => admin.notices.includes(id)));
check('Los avisos de envíos llegan al administrador de sede (destino) y al almacén, no a Psicopedagogía; esta solo se entera de las primeras asesorías sin materiales de su sede', laura.notices.includes('shipment_dispatched') && rosa.notices.includes('shipment_received') && !juan.notices.includes('shipment_dispatched') && juan.notices.join() === 'first_session_without_materials');
const holders = buildHolders(src);
const branchId = (name: string) => src.branches.find(b => b.name === name)!.id;
const recipientsOf = (eventId: string, scope: Parameters<typeof resolveRecipients>[1]) => resolveRecipients(EVENTS.find(e => e.id === eventId)!, scope, holders).userIds;
check('Un envío despachado a Piura avisa al administrador de Piura y no al de Los Olivos', (() => { const r = recipientsOf('shipment_dispatched', { destinationBranchId: branchId('Piura') }); return r.includes(laura.id) && !r.includes(marco.id); })());
check('Lo mismo hacia Los Olivos avisa a Marco y no a Laura', (() => { const r = recipientsOf('shipment_dispatched', { destinationBranchId: branchId('Los Olivos') }); return r.includes(marco.id) && !r.includes(laura.id); })());
check('Una primera asesoría sin materiales avisa a la sede del alumno y no a otra', (() => { const r = recipientsOf('first_session_without_materials', { subjectBranchId: branchId('Los Olivos') }); return r.includes(marco.id) && !r.includes(laura.id); })());
check('Si en una sede nadie puede recibir el aviso (Chiclayo no tiene cuenta activa), llega a quien tiene la función de respaldo, no se pierde', (() => {
  const event = EVENTS.find(e => e.id === 'shipment_dispatched')!;
  const r = resolveRecipients(event, { destinationBranchId: branchId('Chiclayo') }, holders);
  return r.viaFallback && r.userIds.length > 0 && r.userIds.every(id => holders.find(h => h.id === id)?.capabilities.has(event.fallback));
})());

// ------------------------------------------------------------------------------------------------------------------ Las guardas de verdad
// Se envuelven acciones de mentira con `guardActions` y la función de cada cuenta: lo que `can` niega no se ejecuta.
const fake: Record<string, (...a: unknown[]) => unknown> = {};
for (const a of new Set(KEY_ACTIONS.flatMap(k => (k.action ? [k.action] : [])))) fake[a] = () => ({ ok: true, ran: true });
const guardedFor = (p: AccountProfile) => guardActions(fake, id => canDo({ user: { role: p.role }, roles: src.roles, permissions: src.permissions }, id));
const outcome = (p: AccountProfile, k: (typeof KEY_ACTIONS)[number]): boolean | 'lanza' => {
  if (!k.action) return p.allowed.includes(k.id);
  try { const r = guardedFor(p)[k.action](...(k.args ?? [])) as { ran?: boolean }; return !!r?.ran; } catch (e) { return e instanceof PermissionError ? 'lanza' : false; }
};
check('Lo que la matriz dice que una cuenta puede, la guarda lo deja pasar; lo que no, lo frena', profiles.every(p => KEY_ACTIONS.filter(k => k.action).every(k => (outcome(p, k) === true) === p.allowed.includes(k.id))),
  list(profiles.flatMap(p => KEY_ACTIONS.filter(k => k.action && (outcome(p, k) === true) !== p.allowed.includes(k.id)).map(k => `${p.name}:${k.id}`))));
check('Cuando la guarda frena, el mensaje nombra la función que falta', (() => {
  const r = guardedFor(laura).reversePayment() as { ok: boolean; error?: string };
  return !r.ok && /Su rol no tiene la función «/.test(r.error ?? '');
})());
check('La función de alcance de todas las sedes la tienen Administración general, Almacén y Contabilidad (y el Superusuario)', profiles.filter(p => p.capabilities.includes(PERM.allBranches)).map(p => p.role).sort().join() === ['Administración general', 'Almacén central', 'Contabilidad', 'Superusuario'].sort().join());

console.log(`\n${profiles.length} cuentas · ${KEY_ACTIONS.length} acciones clave · ${EVENTS.length} avisos`);
console.log(failed === 0 ? 'Todo correcto.' : `${failed} verificaciones fallaron.`);
process.exit(failed === 0 ? 0 : 1);
