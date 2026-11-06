/**
 * Verificación del constructor de roles (paso 5): las 6 plantillas, el plan de permisos con motivos, el límite de cuentas por sede, quién
 * puede dar qué rol, la vista previa del menú y el semáforo de contrapartes. Ejecutar: npx tsx scripts/check-roles.ts
 */
import type { Role, User } from '../src/context/DataContext';
import { seedBranches, seedPermissions, seedRoles, seedUsers, seedWarehouses } from '../src/data/seedCatalog';
import { stockLocations } from '../src/utils/logisticsRoutes';
import { ALL_CAPABILITIES, availability, buildHolders, capabilityById, isKnownCapability, roleClosure, roleWarnings } from '../src/utils/capabilities';
import { ROLE_TEMPLATES, templateById, templatePermissions } from '../src/utils/roleTemplates';
import {
  accountRoleError, counterpartStatus, menuPreview, planPermissions, roleDeleteError, roleLockedError, roleUsage, seatLimitError, seatsUsed, validateRoleInput,
} from '../src/utils/roleBuilder';
import { menuCapabilities } from '../src/utils/capabilities';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : ` -> ${detail}`}`);
  if (!ok) failed++;
};
const list = (xs: string[]) => (xs.length ? xs.slice(0, 8).join(', ') + (xs.length > 8 ? ` … (+${xs.length - 8})` : '') : '');

const T = (id: string) => templateById(id)!;
const perms = (id: string) => new Set(templatePermissions(T(id)));
const menuOf = (id: string) => menuPreview(perms(id));
const itemsOf = (id: string) => menuOf(id).modules.flatMap(m => m.items.map(i => `${m.id}/${i}`));
const has = (id: string, ...caps: string[]) => caps.every(c => perms(id).has(c));
const lacks = (id: string, ...caps: string[]) => caps.every(c => !perms(id).has(c));

// ------------------------------------------------------------------------------------------------------------------ Plantillas
check('Hay 6 plantillas con identificador y nombre únicos', ROLE_TEMPLATES.length === 6 && new Set(ROLE_TEMPLATES.map(t => t.id)).size === 6 && new Set(ROLE_TEMPLATES.map(t => t.name)).size === 6);
check('Los 6 roles de partida del plan', ['Administrador de sede', 'Psicopedagogía', 'Almacén central', 'Administración general', 'Contabilidad', 'Superusuario'].every(n => ROLE_TEMPLATES.some(t => t.name === n)));
const unknown = ROLE_TEMPLATES.flatMap(t => t.capabilities.filter(c => !isKnownCapability(c)).map(c => `${t.id}:${c}`));
check('Toda función de toda plantilla existe en el registro', unknown.length === 0, list(unknown));
const reserved = ROLE_TEMPLATES.flatMap(t => t.capabilities.filter(c => capabilityById(c)?.reserved).map(c => `${t.id}:${c}`));
check('Ninguna plantilla da una función reservada (todavía sin proceso)', reserved.length === 0, list(reserved));
check('Cada plantilla queda completa: lo que sus funciones necesitan ya está', ROLE_TEMPLATES.every(t => { const all = templatePermissions(t); return roleClosure(all).added.length === 0; }));
const noisy = ROLE_TEMPLATES.filter(t => !t.locked && !t.risks && roleWarnings(templatePermissions(t)).length > 0).map(t => t.id);
check('Solo reúne combinaciones a separar quien lo declara con su motivo (Administración general y el almacén)', noisy.length === 0 && ROLE_TEMPLATES.filter(t => t.risks).map(t => t.id).join() === 'almacen-central,admin-general', list(noisy));
check('El Superusuario tiene todas las funciones y es un rol del sistema', T('superusuario').locked === true && templatePermissions(T('superusuario')).length === ALL_CAPABILITIES.filter(c => !c.reserved).length);
check('Solo el Superusuario es del sistema; los límites por sede son 3 (sede), 3 (Psicopedagogía) y 3 (almacén)', ROLE_TEMPLATES.filter(t => t.locked).length === 1 && T('admin-sede').branchUserLimit === 3 && T('almacen-central').branchUserLimit === 3);

// Separación de funciones del plan
check('La sede cobra, cierra la caja y recibe, pero no reversa, no emite notas de crédito ni reabre cierres', has('admin-sede', 'op-pagos:register', 'op-caja:close_box', 'log-recepciones:confirm') && lacks('admin-sede', 'op-pagos:reverse_payment', 'op-pagos:credit_note', 'op-caja:reverse_movement', 'op-caja:reopen_box', 'op-cobranza:refinance'));
check('La sede pide caídas, reactivaciones, cambios y traslados, pero no los aprueba', has('admin-sede', 'op-matriculas:req_drop', 'op-matriculas:req_transfer') && lacks('admin-sede', 'op-matriculas:approve_drop', 'op-matriculas:approve_reactivation', 'op-matriculas:approve_program_change', 'op-matriculas:approve_transfer'));
check('La sede verifica y entrega materiales y agenda las asesorías', has('admin-sede', 'op-verificacion:deliver', 'psi-prog:create', 'psi-prog:reschedule'));
check('Psicopedagogía marca asistencia y registra el seguimiento, no agenda y no ve dinero', has('psicopedagogia', 'psi-prog:mark_attendance', 'psi-prog:reg_tracking') && lacks('psicopedagogia', 'psi-prog:create', 'psi-prog:reschedule') && !templatePermissions(T('psicopedagogia')).some(c => capabilityById(c)?.sensitive === 'dinero'));
check('El almacén despacha pero no confirma recepciones de envíos (los envíos nunca llegan a él); aprueba, despacha y recibe transferencias, y lo declara con su motivo', has('almacen-central', 'log-envios:dispatch', 'log-transfer:approve_transfer', 'log-transfer:dispatch', 'log-transfer:receive') && lacks('almacen-central', 'log-recepciones:confirm') && /sede con su propio responsable/.test(ROLE_TEMPLATES.find(t => t.id === 'almacen-central')?.risks?.['transferir-aprobar-recibir'] ?? ''));
check('El almacén ve el stock de todas las sedes y no toca dinero (ni fija precios: los fija Administración general)', has('almacen-central', 'org-alcance:all_branches', 'log-stock:view') && !templatePermissions(T('almacen-central')).some(c => capabilityById(c)?.sensitive === 'dinero'));
check('Administración general aprueba y reversa con devolución, pero no cobra; también fija los precios y reabre los cierres de ambas cajas', has('admin-general', 'op-matriculas:approve_drop', 'op-pagos:reverse_payment', 'op-caja:reopen_box', 'op-caja-chica:reopen_box', 'log-catalogo:edit_price', 'per-planilla:generate', 'per-planilla:close') && lacks('admin-general', 'op-pagos:register'));
check('Contabilidad solo mira y exporta: no arma la planilla, no cobra ni registra movimientos', has('contabilidad', 'rep-general:export', 'op-caja:view', 'per-planilla:view') && lacks('contabilidad', 'per-planilla:generate', 'op-pagos:register', 'op-caja:reg_income') && !templatePermissions(T('contabilidad')).some(c => ['crear', 'editar', 'eliminar', 'operar', 'aprobar'].includes(capabilityById(c)?.kind ?? '')));
check('La planilla es informativa: ninguna plantilla marca ni registra pagos al personal', ROLE_TEMPLATES.every(t => !t.capabilities.some(c => c.startsWith('per-planilla:pay'))));
const seeSalary = ROLE_TEMPLATES.filter(t => perms(t.id).has('per-remuneracion:view')).map(t => t.id);
check('Solo ven sueldos Administración general, Contabilidad y el Superusuario', seeSalary.join() === 'admin-general,contabilidad,superusuario', seeSalary.join());
check('Crear usuarios y asignar roles es solo del Superusuario', ROLE_TEMPLATES.filter(t => perms(t.id).has('org-usuarios:assign_role') || perms(t.id).has('org-roles:config_perms')).map(t => t.id).join() === 'superusuario');

// ------------------------------------------------------------------------------------------------------------------ Menú por plantilla
const menuItems = menuCapabilities();
check('El Superusuario ve todos los ítems del menú que piden función', menuItems.every(m => itemsOf('superusuario').includes(`${m.module}/${m.item}`)));
const sede = itemsOf('admin-sede');
check('La sede ve matrículas, pagos, caja, verificación, recepciones y programación; no planilla, usuarios, permisos ni oferta comercial',
  ['operacion/Matrículas', 'operacion/Pagos', 'operacion/Caja', 'operacion/Verificación', 'logistica/Recepciones', 'psicopedagogia/Programación'].every(i => sede.includes(i))
  && !['personas/Planilla', 'organizacion/Usuarios', 'organizacion/Permisos', 'configuracion/Programas', 'logistica/Envíos', 'sistema/Auditoría'].some(i => sede.includes(i)), list(sede));
const psi = itemsOf('psicopedagogia');
check('Psicopedagogía ve programación, historial y su reporte; ni caja, ni pagos, ni cartera', ['psicopedagogia/Programación', 'psicopedagogia/Historial del alumno', 'reportes/Psicopedagogía'].every(i => psi.includes(i)) && !['operacion/Caja', 'operacion/Pagos', 'operacion/Planes y cartera'].some(i => psi.includes(i)), list(psi));
const alm = itemsOf('almacen-central');
check('El almacén ve catálogo, stock, envíos, transferencias, kardex y ajustes; ni caja ni matrículas', ['logistica/Catálogo de artículos', 'logistica/Stock', 'logistica/Envíos', 'logistica/Transferencias', 'logistica/Kardex', 'logistica/Ajustes y mermas'].every(i => alm.includes(i)) && !['operacion/Caja', 'operacion/Matrículas'].some(i => alm.includes(i)), list(alm));
const gen = itemsOf('admin-general');
check('Administración general ve personal, planilla, oferta comercial y auditoría; no usuarios ni permisos', ['personas/Personal', 'personas/Planilla', 'configuracion/Programas', 'sistema/Auditoría', 'sistema/Solicitudes pendientes'].every(i => gen.includes(i)) && !['organizacion/Usuarios', 'organizacion/Permisos'].some(i => gen.includes(i)), list(gen));
const con = itemsOf('contabilidad');
check('Contabilidad ve caja, cartera y planilla; no matrículas ni stock', ['operacion/Caja', 'operacion/Planes y cartera', 'personas/Planilla'].every(i => con.includes(i)) && !['operacion/Matrículas', 'logistica/Stock'].some(i => con.includes(i)), list(con));
check('Sin funciones no se ve ninguna pantalla ni Configuración', menuPreview([]).modules.length === 0 && !menuPreview([]).settings);
check('Con una función de Configuración se ofrece el botón', menuPreview(['cfg-leads:view']).settings);

// ------------------------------------------------------------------------------------------------------------------ Datos de ejemplo
const roles = seedRoles();
const users = seedUsers();
const permissions = seedPermissions();
check('Los roles de ejemplo son las plantillas, con su límite y su bloqueo', roles.length === 6 && roles.every((r, i) => r.name === ROLE_TEMPLATES[i].name && r.templateId === ROLE_TEMPLATES[i].id && r.branchUserLimit === ROLE_TEMPLATES[i].branchUserLimit && !!r.locked === !!ROLE_TEMPLATES[i].locked));
check('Cada rol de ejemplo tiene sus funciones', roles.every(r => (permissions.find(p => p.roleId === r.id)?.permissions.length ?? 0) > 0));
const orphans = users.filter(u => !roles.some(r => r.name === u.role && r.status === 'Activo')).map(u => `${u.id}:${u.role}`);
check('Toda cuenta de ejemplo tiene un rol que existe y está activo', orphans.length === 0, list(orphans));
const over = roles.filter(r => r.branchUserLimit).flatMap(r => seedBranches().filter(b => seatsUsed(r.name, users, b.name) > r.branchUserLimit!).map(b => `${r.name}@${b.name}`));
check('Las cuentas de ejemplo respetan el límite por sede de su rol', over.length === 0, list(over));
check('Hay una sola cuenta de Superusuario de ejemplo y está activa', users.filter(u => u.role === 'Superusuario').length === 1 && users.some(u => u.role === 'Superusuario' && u.status === 'Activo'));

// ------------------------------------------------------------------------------------------------------------------ Uso del rol (derivado)
check('Las cuentas de un rol se cuentan, no se guardan: activas y total', (() => { const u = roleUsage({ name: 'Administrador de sede' }, users); return u.total === 3 && u.active === 2; })());
check('Un rol sin cuentas tiene cero', roleUsage({ name: 'Contabilidad' }, []).total === 0);

// ------------------------------------------------------------------------------------------------------------------ Datos del rol
const base: Pick<Role, 'id' | 'name'>[] = [{ id: 'ROL-001', name: 'Administrador de sede' }];
check('El rol necesita nombre', validateRoleInput({ name: '   ' }, base) !== null);
check('El nombre no se repite (sin distinguir mayúsculas), salvo el propio rol', validateRoleInput({ name: 'administrador DE sede' }, base) !== null && validateRoleInput({ name: 'Administrador de sede' }, base, 'ROL-001') === null);
check('El nombre no es larguísimo', validateRoleInput({ name: 'x'.repeat(61) }, base) !== null);
check('El límite es un entero de 1 a 50, o vacío', [0, 2.5, 51, -1].every(n => validateRoleInput({ name: 'Nuevo', branchUserLimit: n }, base) !== null) && validateRoleInput({ name: 'Nuevo', branchUserLimit: 3 }, base) === null && validateRoleInput({ name: 'Nuevo' }, base) === null);
check('Un rol del sistema no se edita', roleLockedError({ name: 'Superusuario', locked: true }) !== null && roleLockedError({ name: 'Otro' }) === null);
check('Un rol con cuentas no se elimina; sin cuentas sí; el del sistema nunca', roleDeleteError({ name: 'Administrador de sede' }, users) !== null && roleDeleteError({ name: 'Contabilidad' }, []) === null && roleDeleteError({ name: 'Superusuario', locked: true }, []) !== null);
check('Una cuenta inactiva también impide eliminar el rol (se reasigna antes)', roleDeleteError({ name: 'Administrador de sede' }, [{ role: 'Administrador de sede', status: 'Inactivo' }]) !== null);

// ------------------------------------------------------------------------------------------------------------------ Guardar las funciones (con motivos)
const plain = { name: 'Rol de prueba' } as Pick<Role, 'name' | 'locked' | 'acceptedRisks'>;
const plan = (chosen: string[], reasons: Record<string, string> = {}, role: Pick<Role, 'name' | 'locked' | 'acceptedRisks'> = plain) => planPermissions(role, chosen, reasons, 'Superadmin', '2026-11-02');
const sent = plan(['log-envios:dispatch']);
check('Al guardar se suma lo que cada función necesita', sent.ok && sent.permissions.includes('log-stock:view') && sent.added.includes('log-stock:view'), JSON.stringify(sent));
check('Un conjunto vacío se guarda (el rol queda sin funciones)', plan([]).ok && plan([]).permissions.length === 0);
check('No se guardan funciones que no existen', !plan(['no-existe:nada']).ok && /no existen/.test(plan(['no-existe:nada']).error ?? ''));
check('No se guardan funciones reservadas', !plan(['op-matriculas:confirm']).ok && /Todavía no/.test(plan(['op-matriculas:confirm']).error ?? ''));
check('Un rol del sistema no cambia sus funciones', !plan(['dash-resumen:view'], {}, { name: 'Superusuario', locked: true }).ok);
const combo = ['op-matriculas:req_drop', 'op-matriculas:approve_drop'];
const noReason = plan(combo);
check('Una combinación a separar sin motivo no se guarda y dice cuál', !noReason.ok && /pide una caída y la aprueba/.test(noReason.error ?? ''), noReason.error);
check('Un motivo demasiado corto no vale', !plan(combo, { 'pedir-aprobar-caida': 'no' }).ok);
const withReason = plan(combo, { 'pedir-aprobar-caida': '  Sede única con una sola administradora  ' });
check('Con motivo se guarda y queda escrito: regla, motivo, quién y cuándo', withReason.ok && withReason.acceptedRisks.length === 1 && withReason.acceptedRisks[0].reason === 'Sede única con una sola administradora' && withReason.acceptedRisks[0].by === 'Superadmin' && withReason.acceptedRisks[0].at === '2026-11-02', JSON.stringify(withReason.acceptedRisks));
const accepted = { name: 'Rol de prueba', acceptedRisks: withReason.acceptedRisks } as Pick<Role, 'name' | 'locked' | 'acceptedRisks'>;
const again = planPermissions(accepted, combo, {}, 'Otra persona', '2026-12-01');
check('Lo ya aceptado no se vuelve a pedir y conserva quién y cuándo', again.ok && again.acceptedRisks[0].by === 'Superadmin' && again.acceptedRisks[0].at === '2026-11-02');
const renewed = planPermissions(accepted, combo, { 'pedir-aprobar-caida': 'Ahora lo aprueba la gerencia en la misma sede' }, 'Otra persona', '2026-12-01');
check('Un motivo nuevo reemplaza al anterior con su autor y fecha', renewed.ok && renewed.acceptedRisks[0].by === 'Otra persona' && /gerencia/.test(renewed.acceptedRisks[0].reason));
const dropped = planPermissions(accepted, ['op-matriculas:req_drop'], {}, 'Otra persona', '2026-12-01');
check('Si la combinación ya no aplica, el motivo se descarta', dropped.ok && dropped.acceptedRisks.length === 0);
const several = plan(['op-pagos:register', 'op-pagos:reverse_payment', 'op-caja:close_box', 'op-pagos:credit_note'], { 'cobrar-reversar-cerrar': 'Una sola persona atiende la sede', 'cobrar-nota-credito': 'Una sola persona atiende la sede' });
check('Cada combinación pide su propio motivo', several.ok && several.acceptedRisks.length === 2 && !plan(['op-pagos:register', 'op-pagos:reverse_payment', 'op-caja:close_box', 'op-pagos:credit_note'], { 'cobrar-reversar-cerrar': 'Una sola persona atiende la sede' }).ok);
check('Las plantillas se pueden guardar con los motivos que declaran', ROLE_TEMPLATES.filter(t => !t.locked).every(t => plan(templatePermissions(t), t.risks).ok));
check('Una plantilla sin sus motivos declarados no se guardaría: solo reúne lo que declara', ROLE_TEMPLATES.filter(t => !t.locked).every(t => roleWarnings(templatePermissions(t)).map(w => w.id).sort().join() === Object.keys(t.risks ?? {}).sort().join()));

// ------------------------------------------------------------------------------------------------------------------ Límite de cuentas por sede
const acc = (id: string, role: string, branch: string, status: 'Activo' | 'Inactivo' = 'Activo', extra: string[] = []): User => ({ id, name: id, email: `${id}@x.pe`, role, branch, additionalBranches: extra, lastAccess: '', status });
const limitRole: Pick<Role, 'name' | 'branchUserLimit'> = { name: 'Administrador de sede', branchUserLimit: 2 };
const crew = [acc('A', 'Administrador de sede', 'Piura'), acc('B', 'Administrador de sede', 'Piura'), acc('C', 'Administrador de sede', 'Chiclayo', 'Activo', ['Piura']), acc('D', 'Administrador de sede', 'Tacna', 'Inactivo'), acc('E', 'Contabilidad', 'Piura')];
check('Cuenta las activas del rol que cubren la sede (principal o adicional)', seatsUsed('Administrador de sede', crew, 'Piura') === 3 && seatsUsed('Administrador de sede', crew, 'Tacna') === 0 && seatsUsed('Administrador de sede', crew, 'Piura', 'A') === 2);
check('Una cuenta nueva no cabe si la sede ya llegó al límite', seatLimitError(limitRole, crew, acc('N', 'Administrador de sede', 'Piura')) !== null && /hasta 2/.test(seatLimitError(limitRole, crew, acc('N', 'Administrador de sede', 'Piura')) ?? ''));
check('Cabe en otra sede, o si el rol no tiene límite, o si la cuenta nace inactiva', seatLimitError(limitRole, crew, acc('N', 'Administrador de sede', 'Tacna')) === null && seatLimitError({ name: 'X' }, crew, acc('N', 'X', 'Piura')) === null && seatLimitError(limitRole, crew, acc('N', 'Administrador de sede', 'Piura', 'Inactivo')) === null);
check('Una sede adicional también ocupa lugar', seatLimitError(limitRole, crew, acc('N', 'Administrador de sede', 'Tacna', 'Activo', ['Piura'])) !== null);
check('Quien ya ocupa su lugar no se bloquea al editar otra cosa', seatLimitError(limitRole, crew, acc('A', 'Administrador de sede', 'Piura'), crew[0]) === null);
check('Mover una cuenta a una sede llena sí se bloquea; si ya la ocupaba como adicional, no', seatLimitError(limitRole, crew, acc('G', 'Administrador de sede', 'Piura'), acc('G', 'Administrador de sede', 'Chiclayo')) !== null && seatLimitError(limitRole, crew, acc('C', 'Administrador de sede', 'Piura'), crew[2]) === null);
check('Reactivar una cuenta en una sede llena se bloquea', seatLimitError(limitRole, [...crew, acc('F', 'Administrador de sede', 'Piura', 'Inactivo')], acc('F', 'Administrador de sede', 'Piura'), acc('F', 'Administrador de sede', 'Piura', 'Inactivo')) !== null);
check('Cambiar una cuenta a este rol cuenta como cuenta nueva del rol', seatLimitError(limitRole, crew, acc('E', 'Administrador de sede', 'Piura'), crew[4]) !== null);
check('El límite también cuenta por almacén: la cuenta que trabaja en él ocupa un lugar (por almacén, no por sede)', (() => {
  const wh = (id: string, ws: string[]): User => ({ ...acc(id, 'Almacén central', ''), warehouses: ws });
  const role = { name: 'Almacén central', branchUserLimit: 2 };
  const team = [wh('W1', ['ALM-001']), wh('W2', ['ALM-001'])];
  return seatsUsed('Almacén central', team, 'ALM-001') === 2 && /por sede o almacén y el almacén ya tiene 2/.test(seatLimitError(role, team, wh('W3', ['ALM-001'])) ?? '')
    && seatLimitError(role, team, wh('W3', ['ALM-002'])) === null && seatLimitError(role, [wh('W1', ['ALM-001'])], wh('W2', ['ALM-001'])) === null;
})());
check('La sede «Todas» no ocupa lugar en ninguna sede', seatLimitError(limitRole, crew, acc('N', 'Administrador de sede', 'Todas')) === null);

// ------------------------------------------------------------------------------------------------------------------ Qué rol se puede dar
const catalog: Pick<Role, 'name' | 'status' | 'locked'>[] = [{ name: 'Administrador de sede', status: 'Activo' }, { name: 'Apagado', status: 'Inactivo' }, { name: 'Superusuario', status: 'Activo', locked: true }];
check('El rol debe existir', accountRoleError('Fantasma', catalog, true) !== null && accountRoleError('', catalog, true) !== null);
check('El rol debe estar activo', accountRoleError('Apagado', catalog, true) !== null);
check('El rol del sistema solo lo da el Superusuario (no se escala el acceso)', accountRoleError('Superusuario', catalog, false) !== null && accountRoleError('Superusuario', catalog, true) === null);
check('Un rol activo se puede dar', accountRoleError('Administrador de sede', catalog, false) === null);
check('Quien conserva su rol no se bloquea aunque se haya apagado después', accountRoleError('Apagado', catalog, false, { role: 'Apagado' }) === null && accountRoleError('Administrador de sede', catalog, false, { role: 'Apagado' }) === null);

// ------------------------------------------------------------------------------------------------------------------ Semáforo de contrapartes
const branches = seedBranches();
const locations = stockLocations(branches, seedWarehouses());
const idOf = (name: string) => branches.find(b => b.name === name)!.id;
const holders = buildHolders({ users, roles, permissions, branches });
const dispatchRows = counterpartStatus(['log-envios:dispatch'], holders, locations, []);
const dispatchGap = dispatchRows.find(r => r.counterpartId === 'log-recepciones:confirm')!;
check('Envío: dice en qué sedes no hay quien reciba (con las cuentas de ejemplo)', dispatchGap.state === 'falta' && dispatchGap.strength === 'required' && dispatchGap.missingIn.includes('Chiclayo') && !dispatchGap.missingIn.includes('Piura'), JSON.stringify(dispatchGap));
check('Envío: el almacén no cuenta como destino (un envío nunca llega a él), pero Los Olivos sí es una sede destino', !dispatchGap.missingIn.includes('Almacén central') && dispatchRows.length > 0 && !dispatchGap.missingIn.includes('Los Olivos'));
check('Una cuenta inactiva no cubre su sede', dispatchGap.missingIn.includes('Chiclayo') && users.find(u => u.id === 'USR-003')!.status === 'Inactivo');
const extra = buildHolders({ users: [...users, acc('USR-100', 'Administrador de sede', 'Chiclayo')], roles, permissions, branches });
check('Al crear al receptor de la sede, la sede deja de faltar', !counterpartStatus(['log-envios:dispatch'], extra, locations, []).find(r => r.counterpartId === 'log-recepciones:confirm')!.missingIn.includes('Chiclayo'));
check('Contraparte «en cualquier sede»: cubierta si alguien la tiene', counterpartStatus(['op-matriculas:req_drop'], holders, locations, []).every(r => r.state === 'ok'));
check('Contraparte «en cualquier sede»: sin nadie, falta en toda la empresa', counterpartStatus(['op-matriculas:req_drop'], buildHolders({ users: [], roles, permissions, branches }), locations, [])[0].missingIn[0] === 'toda la empresa');
const sameBranch = counterpartStatus(['op-matriculas:create'], holders, locations, []);
check('Contraparte «en la misma sede»: sin cuentas del rol todavía no se puede medir', sameBranch.length > 0 && sameBranch.every(r => r.state === 'sin-cuentas'));
check('Contraparte «en la misma sede»: con cuentas se mide en sus sedes (Piura, cubierta por la sede misma)', counterpartStatus(['op-matriculas:create'], holders, locations, [idOf('Piura')]).every(r => r.state === 'ok'));
const contId = roles.find(r => r.name === 'Contabilidad')!.id;
const lonely = buildHolders({ users: [acc('Z', 'Contabilidad', 'Piura')], roles, permissions: permissions.map(p => (p.roleId === contId ? { ...p, permissions: ['op-matriculas:create', 'op-matriculas:view', 'op-pagos:view', 'op-pagos:register'] } : p)), branches });
check('Un rol con matrícula pero sin quien verifique ni agende en su sede lo muestra', counterpartStatus(['op-matriculas:create'], lonely, locations, [idOf('Piura')]).some(r => r.state === 'falta' && r.strength === 'advisory' && r.missingIn.includes('Piura')));

// ------------------------------------------------------------------------------------------------------------------ Con las cuentas de ejemplo, lo que se ofrece
const target = (name: string) => ({ branchId: idOf(name), branchName: name });
check('Despachar a Piura se ofrece (hay quien reciba) y a Chiclayo no (su cuenta está inactiva)', availability('log-envios:dispatch', holders, target('Piura')).available && !availability('log-envios:dispatch', holders, target('Chiclayo')).available);
check('Transferir hacia el almacén se ofrece (Los Olivos tiene quien reciba)', availability('log-transfer:dispatch', holders, target('Los Olivos')).available);

// ------------------------------------------------------------------------------------------------------------------ Resumen
console.log(`\n${ROLE_TEMPLATES.length} plantillas · ${ALL_CAPABILITIES.filter(c => !c.reserved).length} funciones ofrecidas · ${users.length} cuentas de ejemplo`);
console.log(failed === 0 ? '\nTodo correcto.' : `\n${failed} caso(s) fallaron.`);
process.exit(failed === 0 ? 0 : 1);
