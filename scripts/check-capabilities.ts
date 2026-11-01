/**
 * Verificación del registro de funciones: estructura, conexiones (requiere, contraparte, datos, avisos), cobertura del menú y de las
 * acciones del contexto, compatibilidad con los permisos que ya existen y reglas de roles (cierre de dependencias, advertencias,
 * contrapartes). Ejecutar: npx tsx scripts/check-capabilities.ts
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODULE_DATA } from '../src/config/modules';
import { PERM } from '../src/utils/authority';
import {
  ALL_CAPABILITIES, availability, buildHolders, capabilityById, connectionsOf, eventById, holdersWith, menuCapabilities, permissionCatalog,
  removalBlockers, requiredBy, roleClosure, roleWarnings, toggleCapability,
} from '../src/utils/capabilities';
import {
  CATALOG_MODULES, ENTITIES, EVENTS, FUNCTIONALITIES, INCOMPATIBILITIES, MENU_WITHOUT_CAPABILITY, NON_CAPABILITY_ACTIONS,
} from '../src/utils/capabilityRegistry';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : ` -> ${detail}`}`);
  if (!ok) failed++;
};
const list = (xs: string[]) => (xs.length ? xs.slice(0, 8).join(', ') + (xs.length > 8 ? ` … (+${xs.length - 8})` : '') : '');

const ids = ALL_CAPABILITIES.map(c => c.id);
const idSet = new Set(ids);

// ------------------------------------------------------------------------------------------------------------------ Estructura
check('Los identificadores no se repiten', idSet.size === ids.length, list(ids.filter((x, i) => ids.indexOf(x) !== i)));
check('Cada función es «funcionalidad:acción» y su funcionalidad existe', ALL_CAPABILITIES.every(c => c.id === `${c.functionality}:${c.action}` && FUNCTIONALITIES.some(f => f.id === c.functionality)));
check('Cada funcionalidad pertenece a un módulo del catálogo', FUNCTIONALITIES.every(f => CATALOG_MODULES.some(m => m.id === f.module)));
check('Las funcionalidades no se repiten', new Set(FUNCTIONALITIES.map(f => f.id)).size === FUNCTIONALITIES.length);
check('Cada función tiene nombre y tipo', ALL_CAPABILITIES.every(c => c.label.trim() && c.kind));

// ------------------------------------------------------------------------------------------------------------------ Conexiones
check('Todo lo que una función requiere existe', ALL_CAPABILITIES.every(c => c.requires.every(r => idSet.has(r))), list(ALL_CAPABILITIES.flatMap(c => c.requires.filter(r => !idSet.has(r)).map(r => `${c.id}→${r}`))));
check('Ninguna función se requiere a sí misma (ni en ciclo)', ALL_CAPABILITIES.every(c => !requiredBy(c.id).includes(c.id)), list(ALL_CAPABILITIES.filter(c => requiredBy(c.id).includes(c.id)).map(c => c.id)));
check('Ninguna función requiere una reservada', ALL_CAPABILITIES.every(c => c.requires.every(r => !capabilityById(r)?.reserved)));
check('Toda contraparte existe y no es la misma función', ALL_CAPABILITIES.every(c => !c.counterpart || (idSet.has(c.counterpart.capability) && c.counterpart.capability !== c.id)));
check('Toda contraparte explica por qué', ALL_CAPABILITIES.every(c => !c.counterpart || c.counterpart.why.trim().length > 10));
check('Los datos que lee y escribe cada función existen', ALL_CAPABILITIES.every(c => [...c.reads, ...c.writes].every(e => e in ENTITIES)), list(ALL_CAPABILITIES.flatMap(c => [...c.reads, ...c.writes].filter(e => !(e in ENTITIES)).map(e => `${c.id}:${e}`))));
check('Los avisos que dispara cada función existen', ALL_CAPABILITIES.every(c => c.emits.every(e => !!eventById(e))));
check('Todo aviso tiene destinatario y respaldo que existen', EVENTS.every(e => ('person' in e.recipients || idSet.has(e.recipients.capability)) && idSet.has(e.fallback)), list(EVENTS.filter(e => !('person' in e.recipients) && !idSet.has(e.recipients.capability)).map(e => e.id)));
check('Los avisos no se repiten', new Set(EVENTS.map(e => e.id)).size === EVENTS.length);
check('Todo aviso de acción lo dispara alguna función', EVENTS.filter(e => e.trigger === 'accion').every(e => ALL_CAPABILITIES.some(c => c.emits.includes(e.id))), list(EVENTS.filter(e => e.trigger === 'accion' && !ALL_CAPABILITIES.some(c => c.emits.includes(e.id))).map(e => e.id)));
check('Las combinaciones incompatibles usan funciones que existen', INCOMPATIBILITIES.every(r => r.capabilities.length >= 2 && r.capabilities.every(c => idSet.has(c))));

// Cada función depende de poder «ver» su pantalla: sin ver no se puede operar
const withoutView = FUNCTIONALITIES.filter(f => !f.capabilities.some(c => c.action === 'view')).map(f => f.id);
check('Solo «Alcance por sede» no tiene función «ver»', withoutView.length === 1 && withoutView[0] === 'org-alcance', list(withoutView));
const orphans = ALL_CAPABILITIES.filter(c => {
  if (c.kind === 'ver' || c.reserved) return false;
  const hasView = FUNCTIONALITIES.find(f => f.id === c.functionality)!.capabilities.some(x => x.action === 'view');
  return hasView && !requiredBy(c.id).includes(`${c.functionality}:view`);
});
check('Toda función que no es «ver» exige poder ver su pantalla', orphans.length === 0, list(orphans.map(c => c.id)));

// ------------------------------------------------------------------------------------------------------------------ Menú
const menuItems = Object.entries(MODULE_DATA).flatMap(([module, info]) => info.groups.flatMap(g => g.items.map(item => ({ module, item }))));
const mapped = menuCapabilities();
const key = (m: { module: string; item: string }) => `${m.module}/${m.item}`;
const mappedKeys = mapped.map(key);
check('Ningún ítem del menú se repite en el registro', new Set(mappedKeys).size === mappedKeys.length, list(mappedKeys.filter((x, i) => mappedKeys.indexOf(x) !== i)));
const missingMenu = menuItems.filter(m => !mappedKeys.includes(key(m)) && !(key(m) in MENU_WITHOUT_CAPABILITY));
check('Todo ítem del menú tiene su función «ver»', missingMenu.length === 0, list(missingMenu.map(key)));
const extraMenu = mapped.filter(m => m.module !== 'mensajeria' && !menuItems.some(x => key(x) === key(m)));
check('Toda función con menú apunta a un ítem que existe', extraMenu.length === 0, list(extraMenu.map(key)));
check('Las excepciones del menú siguen siendo ítems reales', Object.keys(MENU_WITHOUT_CAPABILITY).every(k => menuItems.some(m => key(m) === k)));
check('Las funciones con menú son de tipo «ver» o «configurar»', ALL_CAPABILITIES.filter(c => c.menu).every(c => c.kind === 'ver' || c.kind === 'configurar'));

// ------------------------------------------------------------------------------------------------------------------ Acciones del contexto
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ctxSrc = readFileSync(join(ROOT, 'src/context/DataContext.tsx'), 'utf-8');
const iface = ctxSrc.slice(ctxSrc.indexOf('interface DataContextType'), ctxSrc.indexOf('export const DataContext = createContext'));
const ctxActions = [...iface.matchAll(/^\s{2}([a-zA-Z]+): \(/gm)].map(m => m[1]);
const covered = new Set(ALL_CAPABILITIES.flatMap(c => c.actions));
const uncovered = ctxActions.filter(a => !covered.has(a) && !(a in NON_CAPABILITY_ACTIONS));
check(`Las ${ctxActions.length} acciones del contexto están dentro de una función o declaradas como no-función`, uncovered.length === 0, list(uncovered));
const unknownActions = [...covered].filter(a => !new RegExp(`\\b${a}\\b`).test(ctxSrc));
check('Toda acción que una función protege existe en el contexto', unknownActions.length === 0, list(unknownActions));
check('Las acciones declaradas como no-función existen', Object.keys(NON_CAPABILITY_ACTIONS).every(a => ctxActions.includes(a)), list(Object.keys(NON_CAPABILITY_ACTIONS).filter(a => !ctxActions.includes(a))));
check('Ninguna acción es a la vez función y no-función', [...covered].every(a => !(a in NON_CAPABILITY_ACTIONS)));

// ------------------------------------------------------------------------------------------------------------------ Compatibilidad con lo que ya existe
const permValues = Object.values(PERM) as string[];
check('Todo permiso de `PERM` existe en el registro', permValues.every(p => idSet.has(p)), list(permValues.filter(p => !idSet.has(p))));
check('Ningún permiso de `PERM` es una función reservada', permValues.every(p => !capabilityById(p)?.reserved));

const LEGACY_67 = [
  'org-usuarios:view', 'org-usuarios:create', 'org-usuarios:edit', 'org-usuarios:deactivate', 'org-usuarios:reset_access', 'org-usuarios:assign_role', 'org-usuarios:assign_branch',
  'org-roles:view', 'org-roles:create', 'org-roles:edit', 'org-roles:config_perms',
  'op-matriculas:view', 'op-matriculas:create', 'op-matriculas:edit_draft', 'op-matriculas:confirm', 'op-matriculas:req_drop', 'op-matriculas:approve_drop', 'op-matriculas:req_reactivation',
  'op-matriculas:approve_reactivation', 'op-matriculas:req_program_change', 'op-matriculas:approve_program_change', 'op-matriculas:req_transfer', 'op-matriculas:approve_transfer',
  'op-matriculas:renew', 'op-matriculas:edit_data', 'op-matriculas:documents',
  'op-pagos:view', 'op-pagos:reverse_payment', 'op-pagos:credit_note',
  'op-caja:view', 'op-caja:reg_income', 'op-caja:reg_expense', 'op-caja:reverse_movement', 'op-caja:deposit', 'op-caja:close_box', 'op-caja:reopen_box',
  'op-caja-chica:view', 'op-caja-chica:reverse_movement', 'op-caja-chica:count', 'op-caja-chica:config',
  'op-cobranza:view', 'op-cobranza:remind', 'op-cobranza:charge_mora', 'op-cobranza:config',
  'log-transfer:req_transfer', 'log-transfer:approve_transfer', 'log-transfer:dispatch', 'log-transfer:receive',
  'per-planilla:view', 'per-planilla:generate', 'per-planilla:adjust', 'per-planilla:close', 'per-planilla:pay', 'per-planilla:reopen',
  'psi-prog:view', 'psi-prog:create', 'psi-prog:reg_tracking', 'psi-prog:export_schedule', 'psi-prog:activity_lead', 'psi-prog:activity_attendance', 'psi-prog:institutional_change',
  'psi-recordatorios:view', 'psi-recordatorios:remind', 'psi-recordatorios:config',
  'rep-general:view', 'rep-general:export', 'rep-general:save_views',
];
check('Los 67 permisos del catálogo anterior siguen existiendo con el mismo identificador', LEGACY_67.length === 67 && LEGACY_67.every(p => idSet.has(p)), list(LEGACY_67.filter(p => !idSet.has(p))));

// Ningún permiso escrito a mano en el código apunta a algo que no existe
const SRC_DIR = join(ROOT, 'src');
const walk = (dir: string): string[] => readdirSync(dir).flatMap(n => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
});
const literal = /['"`]((?:op|org|log|per|psi|rep|com|dash|msg|sis|cfg)-[a-z-]+:[a-z_]+)['"`]/g;
const unknownLiterals: string[] = [];
for (const file of walk(SRC_DIR)) {
  const rel = relative(ROOT, file).replace(/\\/g, '/');
  if (rel.endsWith('capabilityRegistry.ts')) continue;
  const text = readFileSync(file, 'utf-8');
  for (const m of text.matchAll(literal)) if (!idSet.has(m[1])) unknownLiterals.push(`${rel}: ${m[1]}`);
}
check('Ningún permiso escrito a mano en el código falta en el registro', unknownLiterals.length === 0, list(unknownLiterals));

// ------------------------------------------------------------------------------------------------------------------ Catálogo derivado
const catalog = permissionCatalog();
const catalogIds = catalog.flatMap(m => m.functionalities.flatMap(f => f.actions.map(a => `${f.id}:${a.id}`)));
check('El catálogo ofrece todas las funciones salvo las reservadas', catalogIds.length === ALL_CAPABILITIES.filter(c => !c.reserved).length);
check('El catálogo no ofrece funciones reservadas', catalogIds.every(id => !capabilityById(id)?.reserved));
check('El catálogo con reservadas las incluye todas', permissionCatalog({ includeReserved: true }).flatMap(m => m.functionalities.flatMap(f => f.actions)).length === ALL_CAPABILITIES.length);
check('Cada módulo del catálogo tiene funcionalidades', catalog.every(m => m.functionalities.length > 0));

// ------------------------------------------------------------------------------------------------------------------ Reglas de roles
const closure = roleClosure(['log-envios:dispatch']);
check('Marcar «Realizar el envío» marca solas «Ver envíos» y «Ver el stock»', closure.added.includes('log-envios:view') && closure.added.includes('log-stock:view') && closure.all.length === 3, list(closure.added));
check('El cierre es transitivo (la planilla arrastra las remuneraciones)', roleClosure(['per-planilla:pay']).all.includes('per-remuneracion:view'));
check('El cierre conserva permisos desconocidos y no repite', roleClosure(['x-y:z', 'op-caja:view', 'op-caja:view']).all.filter(x => x === 'op-caja:view').length === 1 && roleClosure(['x-y:z']).all.includes('x-y:z'));
check('No se puede quitar «Ver el stock» mientras «Realizar el envío» lo necesite', removalBlockers('log-stock:view', closure.all).includes('log-envios:dispatch'));
check('Sí se puede quitar lo que nadie necesita', removalBlockers('log-envios:dispatch', closure.all).length === 0);
const t1 = toggleCapability([], 'log-envios:dispatch');
check('Marcar con `toggleCapability` suma las dependencias', t1.selected.length === 3 && (t1.added ?? []).length === 2);
const t2 = toggleCapability(t1.selected, 'log-envios:view');
check('Desmarcar algo necesario se rechaza y dice por quién', !!t2.blockedBy?.includes('log-envios:dispatch') && t2.selected.length === 3);
check('Desmarcar lo último quita solo esa función', toggleCapability(t1.selected, 'log-envios:dispatch').selected.length === 2);

check('Quien cobra, reversa y cierra caja recibe la advertencia', roleWarnings(['op-pagos:register', 'op-pagos:reverse_payment', 'op-caja:close_box']).some(r => r.id === 'cobrar-reversar-cerrar'));
check('Quien solo cobra no recibe advertencia', roleWarnings(['op-pagos:register', 'op-caja:view']).length === 0);
check('Pedir y aprobar caídas se advierte', roleWarnings(['op-matriculas:req_drop', 'op-matriculas:approve_drop']).some(r => r.id === 'pedir-aprobar-caida'));

// ------------------------------------------------------------------------------------------------------------------ Contrapartes (el caso del almacenero)
const branches = [{ id: 'SED-001', name: 'Los Olivos' }, { id: 'SED-002', name: 'Piura' }, { id: 'SED-003', name: 'Arequipa' }];
const roles = [
  { id: 'R-ALM', name: 'Almacén central', status: 'Activo' as const },
  { id: 'R-ADM', name: 'Administrador de sede', status: 'Activo' as const },
  { id: 'R-GEN', name: 'Administración general', status: 'Activo' as const },
  { id: 'R-OFF', name: 'Rol apagado', status: 'Inactivo' as const },
];
const permissions = [
  { roleId: 'R-ALM', permissions: ['log-envios:view', 'log-stock:view', 'log-envios:dispatch'] },
  { roleId: 'R-ADM', permissions: ['log-recepciones:view', 'log-recepciones:confirm', 'op-matriculas:create', 'op-verificacion:deliver'] },
  { roleId: 'R-GEN', permissions: ['log-recepciones:confirm', 'org-alcance:all_branches'] },
  { roleId: 'R-OFF', permissions: ['log-recepciones:confirm'] },
];
const user = (id: string, name: string, role: string, branch: string, status: 'Activo' | 'Inactivo' = 'Activo', additionalBranches: string[] = []) => ({ id, name, role, branch, status, additionalBranches });
const target = (id: string) => ({ branchId: id, branchName: branches.find(b => b.id === id)!.name });

const onlyStore = buildHolders({ users: [user('U1', 'Almacenero', 'Almacén central', 'Los Olivos'), user('U0', 'Dueño', 'Superusuario', 'Los Olivos')], roles, permissions, branches });
check('El Superusuario no cuenta como contraparte', onlyStore.every(h => h.name !== 'Dueño') && onlyStore.length === 1);
const noReceiver = availability('log-envios:dispatch', onlyStore, target('SED-002'));
check('Sin receptor en Piura no se ofrece «Realizar el envío» y se explica', !noReceiver.available && /Piura/.test(noReceiver.reason ?? '') && /Confirmar la recepción/.test(noReceiver.reason ?? ''), noReceiver.reason);

const piura = buildHolders({ users: [user('U1', 'Almacenero', 'Almacén central', 'Los Olivos'), user('U2', 'Admin Piura', 'Administrador de sede', 'Piura')], roles, permissions, branches });
check('Con un receptor en Piura se ofrece el envío a Piura', availability('log-envios:dispatch', piura, target('SED-002')).available);
const arequipa = availability('log-envios:dispatch', piura, target('SED-003'));
check('El receptor de Piura no sirve para enviar a Arequipa', !arequipa.available && /Arequipa/.test(arequipa.reason ?? ''));
check('Una cuenta inactiva no cuenta como receptor', !availability('log-envios:dispatch', buildHolders({ users: [user('U2', 'Admin Piura', 'Administrador de sede', 'Piura', 'Inactivo')], roles, permissions, branches }), target('SED-002')).available);
check('Un rol inactivo no cuenta como receptor', !availability('log-envios:dispatch', buildHolders({ users: [user('U3', 'Alguien', 'Rol apagado', 'Piura')], roles, permissions, branches }), target('SED-002')).available);
check('Quien ve todas las sedes recibe en cualquiera', availability('log-envios:dispatch', buildHolders({ users: [user('U4', 'Gerente', 'Administración general', 'Los Olivos')], roles, permissions, branches }), target('SED-003')).available);
check('Una sede adicional de la cuenta también cuenta', availability('log-envios:dispatch', buildHolders({ users: [user('U5', 'Admin doble', 'Administrador de sede', 'Piura', 'Activo', ['Arequipa'])], roles, permissions, branches }), target('SED-003')).available);
check('Con el Superusuario incluido sí cuenta (opción explícita)', availability('log-envios:dispatch', buildHolders({ users: [user('U0', 'Dueño', 'Superusuario', 'Los Olivos')], roles: [...roles, { id: 'R-SU', name: 'Superusuario', status: 'Activo' }], permissions: [...permissions, { roleId: 'R-SU', permissions: ['log-recepciones:confirm'] }], branches }, { includeSuperuser: true }), target('SED-002')).available);
check('Una función sin contraparte siempre se ofrece', availability('op-caja:view', []).available);
check('Sin sede destino no se puede juzgar y se ofrece', availability('log-envios:dispatch', []).available);

const advisory = availability('op-matriculas:create', buildHolders({ users: [user('U6', 'Secretaria', 'Rol apagado', 'Piura')], roles, permissions, branches }), target('SED-002'));
check('Una contraparte recomendada avisa pero no bloquea', advisory.available && /entregue|Nadie tiene/.test(advisory.advisory ?? ''), JSON.stringify(advisory));
check('Con quien entregue materiales en la sede ya no avisa', availability('op-matriculas:create', piura, target('SED-002')).advisory === undefined);
check('`holdersWith` filtra por sede', holdersWith('log-recepciones:confirm', piura, 'SED-002').length === 1 && holdersWith('log-recepciones:confirm', piura, 'SED-001').length === 0);

// ------------------------------------------------------------------------------------------------------------------ Mapa de conexiones
const conn = connectionsOf('log-envios:dispatch')!;
check('El mapa de «Realizar el envío» muestra lo que necesita', conn.requires.map(c => c.id).sort().join() === 'log-envios:view,log-stock:view');
check('El mapa muestra su contraparte, lo que lee y escribe y el aviso', conn.counterpart?.capability.id === 'log-recepciones:confirm' && conn.reads.includes('Stock') && conn.writes.includes('Kardex') && conn.events.some(e => e.id === 'shipment_dispatched'));
check('El mapa de «Confirmar la recepción» sabe que es la contraparte del envío y que recibe el aviso', connectionsOf('log-recepciones:confirm')!.counterpartOf.some(c => c.id === 'log-envios:dispatch') && connectionsOf('log-recepciones:confirm')!.receives.some(e => e.id === 'shipment_dispatched'));
check('«Ver el stock» sabe quién lo necesita', connectionsOf('log-stock:view')!.neededBy.some(c => c.id === 'log-envios:dispatch'));
check('Una función desconocida no tiene mapa', connectionsOf('no:existe') === undefined);

// ------------------------------------------------------------------------------------------------------------------ Resumen
const sensitive = ALL_CAPABILITIES.filter(c => c.sensitive).length;
console.log(`\n${FUNCTIONALITIES.length} funcionalidades · ${ALL_CAPABILITIES.length} funciones (${ALL_CAPABILITIES.filter(c => c.reserved).length} reservadas) · ${sensitive} sensibles · ${EVENTS.length} avisos · ${INCOMPATIBILITIES.length} combinaciones a separar · ${Object.keys(ENTITIES).length} datos`);
console.log(failed === 0 ? '\nTodo correcto.' : `\n${failed} caso(s) fallaron.`);
process.exit(failed === 0 ? 0 : 1);
