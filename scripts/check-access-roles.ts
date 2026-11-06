/**
 * Verificación de Roles y Permisos en la base de datos (paso 10): traducción de filas, lectura defensiva, y las operaciones de guardado
 * (orden, compensación y fallos a mitad de camino) con un repositorio en memoria que imita las tablas `roles` y `rol_funciones`.
 * Ejecutar: npx tsx scripts/check-access-roles.ts
 */
import type { Role } from '../src/context/DataContext';
import { ALL_CAPABILITIES } from '../src/utils/capabilities';
import {
  isGrantable, permissionsFromRows, readAcceptedRisks, roleFromRow, rolePatchToRow, roleToRow, type RolFuncionRow, type RolRow,
} from '../src/utils/accessRoles';
import { dbErrorMessage, isIdConflict } from '../src/utils/orgDirectory';
import { loadAccessRoles, persistNewRole, persistPermissions, persistRoleDelete, persistRoleUpdate, type RolesRepository } from '../src/services/accessRoles';
import type { RepoResult } from '../src/services/orgDirectory';
import { ROLE_TEMPLATES, templateById, templatePermissions } from '../src/utils/roleTemplates';
import { renderRolesSeedSql, seededRoles } from '../src/utils/rolesSeedSql';
import { readFileSync } from 'node:fs';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : ` -> ${detail}`}`);
  if (!ok) failed++;
};

/** Forma comparable: claves ordenadas y sin valores indefinidos. */
const canon = (v: unknown): string => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x));
const role = (patch: Partial<Role> = {}): Role => ({ id: 'ROL-002', name: 'Administrador de sede', desc: 'Matrículas y caja', status: 'Activo', templateId: 'admin-sede', branchUserLimit: 3, ...patch });
const risk = { ruleId: 'reversar-reabrir-caja', reason: 'Es el único rol que reversa.', by: 'Plantilla de partida', at: '2026-11-05' };
const anyFn = ALL_CAPABILITIES.find(c => !c.reserved)!.id;
const reserved = ALL_CAPABILITIES.find(c => c.reserved)?.id;

// ------------------------------------------------------------------------------------------------ Filas
const row: RolRow = { id: 'ROL-005', nombre: 'Administración general', descripcion: 'Aprobaciones', estado: 'Activo', plantilla_id: 'admin-general', observaciones: null, limite_cuentas_por_sede: null, es_sistema: false, riesgos_aceptados: [risk] };
const r1 = roleFromRow(row);
check('Una fila de rol se lee con su plantilla, motivos y sin límite', r1.id === 'ROL-005' && r1.name === 'Administración general' && r1.templateId === 'admin-general' && r1.branchUserLimit === undefined && r1.locked === undefined && r1.acceptedRisks?.length === 1);
check('La marca del sistema se lee como locked', roleFromRow({ ...row, id: 'ROL-001', es_sistema: true }).locked === true);
check('Ida y vuelta de un rol sin pérdida', canon(roleFromRow(roleToRow(role({ observations: 'Piloto', acceptedRisks: [risk] })))) === canon(role({ observations: 'Piloto', acceptedRisks: [risk] })));
check('Un rol creado desde el sistema nunca se guarda como del sistema (aunque llegue locked)', roleToRow({ ...role(), locked: true }).es_sistema === false);
check('Los textos vacíos se guardan como nulos y los motivos ausentes como lista vacía', (() => { const x = roleToRow(role({ observations: '  ', templateId: undefined, branchUserLimit: undefined })); return x.observaciones === null && x.plantilla_id === null && x.limite_cuentas_por_sede === null && Array.isArray(x.riesgos_aceptados) && (x.riesgos_aceptados as unknown[]).length === 0; })());
check('Un cambio solo envía lo que viene; quitar un valor opcional lo deja en blanco; el id nunca viaja', (() => {
  const p = rolePatchToRow({ id: 'X', name: ' Nuevo ', branchUserLimit: undefined, ...{ templateId: undefined } });
  return p.nombre === 'Nuevo' && p.limite_cuentas_por_sede === null && p.plantilla_id === null && !('id' in p) && !('estado' in p) && !('descripcion' in p);
})());
check('Los motivos mal formados se ignoran y los bien formados se conservan', readAcceptedRisks([risk, { ruleId: 'x' }, 'x', null, 5, { ...risk, at: 7 }]).length === 1 && readAcceptedRisks('no es lista').length === 0 && readAcceptedRisks(undefined).length === 0);
check('Un estado desconocido se lee como Activo y un límite que no es número se ignora', roleFromRow({ ...row, estado: 'Raro', limite_cuentas_por_sede: null }).status === 'Activo');

// ------------------------------------------------------------------------------------------------ Funciones
const roles = [roleFromRow({ ...row, id: 'ROL-001', nombre: 'Superusuario', es_sistema: true, riesgos_aceptados: [] }), r1];
const rows: RolFuncionRow[] = [
  { rol_id: 'ROL-005', funcion_id: anyFn }, { rol_id: 'ROL-005', funcion_id: anyFn }, { rol_id: 'ROL-005', funcion_id: 'no-existe:ver' },
  ...(reserved ? [{ rol_id: 'ROL-005', funcion_id: reserved }] : []), { rol_id: 'ROL-099', funcion_id: anyFn },
];
const perms = permissionsFromRows(roles, rows);
const superPerms = perms.find(p => p.roleId === 'ROL-001')!.permissions;
check('Al Superusuario se le muestran todas las funciones que se pueden dar, aunque la base no guarde ninguna', superPerms.length === ALL_CAPABILITIES.filter(c => !c.reserved).length && (!reserved || !superPerms.includes(reserved)));
const adminPerms = perms.find(p => p.roleId === 'ROL-005')!.permissions;
check('Una función repetida, inexistente o reservada no se carga; las de un rol que no existe se ignoran', adminPerms.length === 1 && adminPerms[0] === anyFn && !perms.some(p => p.roleId === 'ROL-099'));
check('Lo que se carga de la base no se completa con lo que cada función necesita (la base manda)', permissionsFromRows([r1], [{ rol_id: 'ROL-005', funcion_id: 'op-matriculas:renew' }])[0].permissions.join() === 'op-matriculas:renew');
check('Cada rol tiene su lista (aunque esté vacía)', perms.length === roles.length && permissionsFromRows([r1], []).every(p => p.permissions.length === 0));
check('isGrantable: existe y no es reservada', isGrantable(anyFn) && !isGrantable('no-existe:ver') && (!reserved || !isGrantable(reserved)));

// ------------------------------------------------------------------------------------------------ Repositorio en memoria
interface Faults { addFunctions?: boolean; removeFunctions?: boolean; deleteRole?: boolean; updateRole?: boolean; insertRole?: boolean }
function memoryRepo(initial: Role[] = [], initialFunctions: RolFuncionRow[] = [], faults: Faults = {}) {
  const store: RolRow[] = initial.map(roleToRow);
  const funcs: RolFuncionRow[] = [...initialFunctions];
  const calls: string[] = [];
  const bad = (msg = 'Failed to fetch'): RepoResult<never> => ({ ok: false, error: dbErrorMessage({ message: msg }) });
  const repo: RolesRepository = {
    async listRoles() { return { ok: true, data: store.map(roleFromRow) }; },
    async listFunctions() { return { ok: true, data: [...funcs] }; },
    async insertRole(r) {
      calls.push('insertRole'); if (faults.insertRole) return bad();
      const x = roleToRow(r);
      if (store.some(s => s.id === x.id)) { const e = { code: '23505', message: 'duplicate key value violates unique constraint "roles_pkey"' }; return { ok: false, error: dbErrorMessage(e), idConflict: isIdConflict(e) }; }
      if (store.some(s => s.nombre.toLowerCase() === x.nombre.toLowerCase())) return { ok: false, error: dbErrorMessage({ code: '23505', message: 'duplicate key value violates unique constraint "roles_nombre_unico"' }) };
      store.push(x); return { ok: true, data: roleFromRow(x) };
    },
    async updateRole(id, patch) {
      calls.push('updateRole'); if (faults.updateRole) return bad();
      const i = store.findIndex(s => s.id === id); if (i < 0) return { ok: false, error: 'no existe' };
      store[i] = { ...store[i], ...rolePatchToRow(patch) }; return { ok: true, data: roleFromRow(store[i]) };
    },
    async deleteRole(id) {
      calls.push('deleteRole'); if (faults.deleteRole) return bad();
      const i = store.findIndex(s => s.id === id); if (i < 0) return { ok: false, error: 'no existe' };
      store.splice(i, 1); for (let k = funcs.length - 1; k >= 0; k--) if (funcs[k].rol_id === id) funcs.splice(k, 1);
      return { ok: true, data: null };
    },
    async addFunctions(id, ids) { calls.push(`add:${ids.join('|')}`); if (faults.addFunctions) return bad(); ids.forEach(f => funcs.push({ rol_id: id, funcion_id: f })); return { ok: true, data: null }; },
    async removeFunctions(id, ids) { calls.push(`remove:${ids.join('|')}`); if (faults.removeFunctions) return bad(); for (let k = funcs.length - 1; k >= 0; k--) if (funcs[k].rol_id === id && ids.includes(funcs[k].funcion_id)) funcs.splice(k, 1); return { ok: true, data: null }; },
  };
  return { repo, store, funcs, calls };
}

(async () => {
  const sys = role({ id: 'ROL-001', name: 'Superusuario', locked: true, templateId: undefined, branchUserLimit: undefined });

  // Leer
  const m0 = memoryRepo([sys, role()], [{ rol_id: 'ROL-002', funcion_id: anyFn }]);
  const loaded = await loadAccessRoles(m0.repo);
  check('Cargar los roles trae cada rol con sus funciones', loaded.ok && loaded.value?.roles.length === 2 && loaded.value?.permissions.find(p => p.roleId === 'ROL-002')?.permissions.join() === anyFn);
  const broken = await loadAccessRoles({ ...m0.repo, listRoles: async () => ({ ok: false, error: 'No hay conexión con el servidor. Revise su internet e intente de nuevo.' }) });
  check('Si la base no responde, se informa sin cargar nada', !broken.ok && /No hay conexión/.test(broken.error!) && !broken.value);

  // Crear
  const m1 = memoryRepo([sys]);
  const draft: Omit<Role, 'id'> = { name: 'Contabilidad', desc: 'Lectura', status: 'Activo', templateId: 'contabilidad', acceptedRisks: [risk] };
  const created = await persistNewRole(m1.repo, [sys], draft, ['dash-resumen:view', 'op-pagos:view']);
  check('Crear un rol le asigna ROL-002, guarda sus motivos y sus funciones', created.ok && created.value?.id === 'ROL-002' && created.value?.acceptedRisks?.length === 1 && m1.funcs.length === 2, JSON.stringify(created));
  const callsBefore = m1.calls.length;
  const noFns = await persistNewRole(m1.repo, [sys, created.value!], { ...draft, name: 'Sin funciones', acceptedRisks: undefined }, []);
  check('Un rol sin funciones no llama a guardar funciones', noFns.ok && noFns.value?.id === 'ROL-003' && !m1.calls.slice(callsBefore).some(c => c.startsWith('add:')));
  const dup = await persistNewRole(m1.repo, [sys, created.value!, noFns.value!], { ...draft, name: 'contabilidad' }, []);
  check('Un nombre repetido (aunque cambie la mayúscula) lo rechaza la base con un mensaje claro', !dup.ok && dup.error === 'Ya existe un rol con este nombre.');

  const m2 = memoryRepo([sys], [], { addFunctions: true });
  const comp = await persistNewRole(m2.repo, [sys], draft, ['dash-resumen:view']);
  check('Si fallan las funciones, el rol se borra: nunca queda un rol a medias', !comp.ok && /el rol no se creó/.test(comp.error!) && !comp.partial && m2.store.length === 1 && m2.calls.includes('deleteRole'), JSON.stringify(comp));
  const m3 = memoryRepo([sys], [], { addFunctions: true, deleteRole: true });
  const comp2 = await persistNewRole(m3.repo, [sys], draft, ['dash-resumen:view']);
  check('Si además falla el borrado, se avisa que quedó un rol sin funciones y que hay que volver a leer la base', !comp2.ok && comp2.partial === true && /sin funciones/.test(comp2.error!) && m3.store.length === 2);
  const m4 = memoryRepo([sys, role({ id: 'ROL-002', name: 'Creado por otra persona' })]);
  const retry = await persistNewRole(m4.repo, [sys], { ...draft, name: 'Mío' }, []);
  check('Si otra persona creó ROL-002 a la vez, se reintenta con ROL-003', retry.ok && retry.value?.id === 'ROL-003' && m4.calls.filter(c => c === 'insertRole').length === 2, JSON.stringify(retry));
  const m5 = memoryRepo([sys, role({ id: 'ROL-002', name: 'A' }), role({ id: 'ROL-003', name: 'B' }), role({ id: 'ROL-004', name: 'C' })]);
  const exhausted = await persistNewRole(m5.repo, [sys], { ...draft, name: 'Nuevo' }, []);
  check('Tras varios choques seguidos se rinde con un mensaje claro', !exhausted.ok && /No se pudo asignar un código/.test(exhausted.error!) && m5.calls.length === 3);

  // Editar y borrar
  const m6 = memoryRepo([sys, role()]);
  const upd = await persistRoleUpdate(m6.repo, 'ROL-002', { name: 'Administrador de sede 2', observations: 'Nota' });
  check('Cambiar los datos de un rol los guarda', upd.ok && upd.value?.name === 'Administrador de sede 2' && m6.store[1].observaciones === 'Nota');
  check('Cambiar o borrar un rol que ya no existe da un mensaje claro', !(await persistRoleUpdate(m6.repo, 'ROL-099', { name: 'X' })).ok && !(await persistRoleDelete(m6.repo, 'ROL-099')).ok);
  const del = await persistRoleDelete(m6.repo, 'ROL-002');
  check('Eliminar un rol lo quita junto con sus funciones', del.ok && m6.store.length === 1);

  // Funciones
  const m7 = memoryRepo([sys, role()], [{ rol_id: 'ROL-002', funcion_id: 'a:1' }, { rol_id: 'ROL-002', funcion_id: 'b:1' }, { rol_id: 'ROL-002', funcion_id: 'c:1' }]);
  const saved = await persistPermissions(m7.repo, 'ROL-002', ['a:1', 'b:1', 'c:1'], ['b:1', 'c:1', 'd:1', 'e:1'], [risk]);
  check('Cambiar las funciones quita las que sobran y agrega las nuevas, sin tocar las que siguen', saved.ok && m7.funcs.map(f => f.funcion_id).sort().join() === 'b:1,c:1,d:1,e:1');
  check('Primero se QUITAN y después se AGREGAN (un fallo nunca deja al rol con más permisos de los pedidos)', m7.calls.join(',') === 'remove:a:1,add:d:1|e:1,updateRole');
  check('Y los motivos de las combinaciones aceptadas se guardan con el rol', m7.store[1].riesgos_aceptados !== undefined && (m7.store[1].riesgos_aceptados as unknown[]).length === 1);
  const same = memoryRepo([sys, role()], [{ rol_id: 'ROL-002', funcion_id: 'a:1' }]);
  await persistPermissions(same.repo, 'ROL-002', ['a:1'], ['a:1'], []);
  check('Sin cambios de funciones no se llama a quitar ni a agregar', same.calls.join(',') === 'updateRole');

  const f1 = memoryRepo([sys, role()], [{ rol_id: 'ROL-002', funcion_id: 'a:1' }], { removeFunctions: true });
  const fail1 = await persistPermissions(f1.repo, 'ROL-002', ['a:1'], ['b:1'], []);
  check('Si falla al quitar, no se agrega nada y no hay nada que releer', !fail1.ok && !fail1.partial && f1.funcs.map(f => f.funcion_id).join() === 'a:1' && !f1.calls.some(c => c.startsWith('add:')));
  const f2 = memoryRepo([sys, role()], [{ rol_id: 'ROL-002', funcion_id: 'a:1' }], { addFunctions: true });
  const fail2 = await persistPermissions(f2.repo, 'ROL-002', ['a:1'], ['b:1'], []);
  check('Si falla al agregar tras quitar, el rol queda con MENOS permisos, se avisa y se pide releer', !fail2.ok && fail2.partial === true && /Se quitaron las que sobraban/.test(fail2.error!) && f2.funcs.length === 0);
  const f3 = memoryRepo([sys, role()], [{ rol_id: 'ROL-002', funcion_id: 'a:1' }], { addFunctions: true });
  const fail3 = await persistPermissions(f3.repo, 'ROL-002', ['a:1'], ['a:1', 'b:1'], []);
  check('Si falla al agregar sin haber quitado nada, no hay nada que releer', !fail3.ok && !fail3.partial && f3.funcs.length === 1);
  const f4 = memoryRepo([sys, role()], [], { updateRole: true });
  const fail4 = await persistPermissions(f4.repo, 'ROL-002', [], ['a:1'], [risk]);
  check('Si las funciones se guardan pero no los motivos, se avisa y se pide releer', !fail4.ok && fail4.partial === true && /no los motivos/.test(fail4.error!) && f4.funcs.length === 1);

  // Una plantilla completa de partida se guarda tal cual
  const tpl = templateById('admin-sede')!;
  const all = templatePermissions(tpl);
  const m8 = memoryRepo([sys]);
  const fromTemplate = await persistNewRole(m8.repo, [sys], { name: tpl.name, desc: tpl.desc, status: 'Activo', templateId: tpl.id, branchUserLimit: tpl.branchUserLimit }, all);
  check('Un rol de plantilla se guarda con todas sus funciones', fromTemplate.ok && m8.funcs.length === all.length && all.length > 50, `${m8.funcs.length}/${all.length}`);
  check('Las 6 plantillas de partida solo traen funciones que se pueden dar', ROLE_TEMPLATES.every(t => templatePermissions(t).every(isGrantable)));

  // El script SQL de los roles de partida sale de las plantillas y no se desfasa
  const onDisk = readFileSync('supabase/seed/roles_de_partida.sql', 'utf8').replace(/\r\n/g, '\n');
  check('El script de roles de partida del repositorio es el que generan las plantillas (si falla: npx tsx scripts/doc-roles-seed.ts)', onDisk === renderRolesSeedSql());
  check('Carga las 5 plantillas que no son del sistema, con ids ROL-002 a ROL-006 y sin el Superusuario', seededRoles().map(r => r.id).join() === 'ROL-002,ROL-003,ROL-004,ROL-005,ROL-006' && !seededRoles().some(r => r.template.locked));
  check('Las funciones de cada rol de partida son exactamente las de su plantilla (completas y sin repetir)', seededRoles().every(r => r.functions.join() === [...new Set(templatePermissions(r.template))].sort().join()));

  // Mensajes de la base para roles
  check('Rol repetido, rol del sistema y último Superusuario', dbErrorMessage({ code: '23505', message: 'duplicate key value violates unique constraint "roles_nombre_unico"' }) === 'Ya existe un rol con este nombre.'
    && dbErrorMessage({ code: 'P0001', message: 'El rol del sistema no se puede modificar.' }) === 'El rol del sistema no se puede modificar.'
    && dbErrorMessage({ code: 'P0001', message: 'Debe quedar al menos una cuenta de Superusuario activa.' }) === 'Debe quedar al menos una cuenta de Superusuario activa.');
  check('Un error P0001 que no es nuestro no se muestra tal cual', dbErrorMessage({ code: 'P0001', message: 'algo interno secreto' }) === 'No se pudo completar la operación en la base de datos. Intente de nuevo.');
  check('Borrar un rol con cuentas: se explica y se propone inactivar', /Inactívelo/.test(dbErrorMessage({ code: '23001', message: 'update or delete on table "roles" violates RESTRICT setting of foreign key constraint "cuentas_rol_id_fkey" on table "cuentas"' })));
  check('Un choque de ROL-NNN generado se reintenta', isIdConflict({ code: '23505', message: 'duplicate key value violates unique constraint "roles_pkey"' }));

  if (failed > 0) {
    console.log(`\n${failed} comprobaciones fallaron.`);
    process.exit(1);
  }
  console.log('\nTodas las comprobaciones pasaron.');
})();
