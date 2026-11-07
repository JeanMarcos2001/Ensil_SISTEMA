/**
 * Verificación de Personal y Asignaciones en la base de datos (paso 10) y de las cuentas ancladas a una persona: traducción de filas,
 * las mismas reglas que la migración 0004, las operaciones (validar → guardar) con un repositorio en memoria y las reglas de la cuenta
 * de una persona (lugares que salen de sus asignaciones, coherencia rol ↔ lugar, correo institucional).
 * Ejecutar: npx tsx scripts/check-staff-db.ts
 */
import { readFileSync, readdirSync } from 'node:fs';
import type { Assignment, Permission, Role, Schedule, Staff, User } from '../src/context/DataContext';
import {
  AREAS, WAREHOUSE_AREA, areasForPlace, assignablePlaces, emptyAssignmentForm, placeAreaError, validateAssignmentForm, type AssignmentForm, type Place,
} from '../src/utils/assignments';
import { dbErrorMessage, isIdConflict } from '../src/utils/orgDirectory';
import { positionOf } from '../src/utils/payroll';
import { ROL_SISTEMA_SOLO_TECNICO } from '../supabase/functions/usuarios/reglas.ts';
import {
  accountPlaceWarning, assignmentFromRow, assignmentToRow, derivedPlaces, placesOf, staffFromRow, staffPatchToRow, staffToRow, type AsignacionRow, type PersonalRow,
} from '../src/utils/staffDb';
import {
  INSTITUTIONAL_DOMAIN, accountCreateCheck, accountEditCheck, accountPlacesOf, emailDomainWarning, roleFitError, rolesFor, worksInWarehouse, workPlacesText, type AccountRulesContext,
} from '../src/utils/accountRules';
import {
  closeAssignment, createStaff, editStaff, inactivateStaff, reactivateStaff, saveAssignment, type StaffRepository,
} from '../src/services/staffDirectory';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : ` -> ${detail}`}`);
  if (!ok) failed++;
};

// ------------------------------------------------------------------------------------------------ Las mismas reglas que la base (0004)
const sql = readFileSync(`supabase/migrations/${readdirSync('supabase/migrations').find(f => f.endsWith('_personal_y_asignaciones.sql'))!}`, 'utf8');
check('Las áreas del sistema son las que admite la base', AREAS.every(a => sql.includes(`'${a}'`)) && /area in \('Administración', 'Psicopedagogía', 'Logística', 'Ventas'\)/.test(sql));
check('La base exige: el lugar de una asignación es una sede O el almacén (nunca los dos ni ninguno)', sql.includes('check ((sede_id is null) <> (almacen_id is null))'));
const sql6 = readFileSync(`supabase/migrations/${readdirSync('supabase/migrations').find(f => f.endsWith('_acceso_en_asignacion_y_alcance.sql'))!}`, 'utf8');
check('La base (migración 0006): la asignación guarda «con acceso» (Sí/No) y no un rol del sistema', sql6.includes('add column con_acceso boolean not null default true') && /drop column rol_sistema/.test(sql6) && /a\.con_acceso/.test(sql6));
check('La base (migración 0006): el rol del sistema es solo para cuentas técnicas', sql6.includes('es solo para cuentas técnicas, sin persona') && ROL_SISTEMA_SOLO_TECNICO.includes('solo para cuentas técnicas, sin persona'));
check('La base (migración 0006): Personal y Asignaciones se ven y se editan por sede', ['app.ve_persona', 'app.ve_asignacion', 'app.opera_lugar'].every(f => sql6.includes(`create function ${f}`)) && ['personal_leer', 'personal_editar', 'asignaciones_leer', 'asignaciones_crear', 'asignaciones_editar'].every(p => sql6.includes(`create policy ${p}`)) && /ve_persona\(p_id\)/.test(sql6));
const sql5 = readFileSync(`supabase/migrations/${readdirSync('supabase/migrations').find(f => f.endsWith('_asignaciones_sin_cargo.sql'))!}`, 'utf8');
check('La base exige: el almacén solo admite el área Logística (migración 0005) y la asignación ya no guarda cargo',
  sql5.includes(`check (almacen_id is null or area = '${WAREHOUSE_AREA}')`) && sql5.includes('asignaciones_almacen_solo_logistica') && /drop column cargo/.test(sql5)
  && dbErrorMessage({ code: '23514', message: 'violates check constraint "asignaciones_almacen_solo_logistica"' }) === 'En el almacén central solo se trabaja en el área «Logística».');
check('La base tiene una sola principal activa por persona y no repite lugar + área activos', sql.includes('asignaciones_una_principal on public.asignaciones (personal_id) where es_principal and estado = \'Activa\'') && sql.includes('asignaciones_sin_duplicar'));
check('Una persona, una cuenta; el documento no se repite sin distinguir mayúsculas ni espacios', sql.includes('cuentas_personal_unico') && sql.includes('personal_documento_unico on public.personal (lower(btrim(numero_documento)))'));
check('Los errores de los disparadores usan EN001 (el sistema los muestra tal cual)', (sql.match(/errcode = 'EN001'/g) ?? []).length >= 15 && dbErrorMessage({ code: 'EN001', message: 'La asignación está cerrada: no se edita. Cree una nueva.' }) === 'La asignación está cerrada: no se edita. Cree una nueva.');
check('Los tipos de documento de la ficha son los de la base', ['DNI', 'CE', 'Pasaporte'].every(t => sql.includes(`'${t}'`)));
check('Los mensajes de unicidad de Personal son claros y un id repetido se reintenta', dbErrorMessage({ code: '23505', message: 'duplicate key value violates unique constraint "personal_documento_unico"' }) === 'Este documento ya está registrado en el personal.'
  && /ya tiene una asignación activa/.test(dbErrorMessage({ code: '23505', message: 'violates unique constraint "asignaciones_sin_duplicar"' }))
  && isIdConflict({ code: '23505', message: 'violates unique constraint "personal_pkey"' }) && isIdConflict({ code: '23505', message: 'violates unique constraint "personal_codigo_key"' }) && !isIdConflict({ code: '23505', message: 'violates unique constraint "personal_documento_unico"' }));

// ------------------------------------------------------------------------------------------------ Datos de partida
const staffRow = (extra: Partial<PersonalRow> = {}): PersonalRow => ({
  id: 'STF-001', codigo: '000001', tipo_documento: 'DNI', numero_documento: '45123456', nombres: 'Laura', apellido_paterno: 'Martínez', apellido_materno: 'Rojas', fecha_nacimiento: '1990-05-01',
  genero: 'Femenino', estado_civil: 'Soltero(a)', tiene_hijos: true, numero_hijos: 2, nivel_educativo: 'Licenciado', profesion: 'Psicóloga', especialidad: null, telefono: '987654321',
  correo_personal: 'laura@gmail.com', direccion: 'Av. Grau 100', estado: 'Activo', observaciones: null, fecha_estado: null, motivo_estado: null, ...extra,
});
const member = (extra: Partial<Staff> = {}): Staff => ({ ...staffFromRow(staffRow()), ...extra });
const FIL: Place[] = [
  { id: 'FIL-001', name: 'Los Olivos', kind: 'sede', status: 'Activo' }, { id: 'FIL-002', name: 'Piura', kind: 'sede', status: 'Activo' },
  { id: 'FIL-003', name: 'Cerrada', kind: 'sede', status: 'Inactivo' }, { id: 'ALM-001', name: 'Almacén central', kind: 'almacen', status: 'Activo' },
];
const today = '2026-11-06';

// ------------------------------------------------------------------------------------------------ Traducción de filas
check('Ficha: ida y vuelta sin pérdida', JSON.stringify(staffToRow(staffFromRow(staffRow()))) === JSON.stringify(staffRow()));
check('Ficha: los textos vacíos son nulos en la base y vacíos o ausentes en el sistema', staffFromRow(staffRow({ apellido_materno: null })).lastNameM === '' && staffToRow(member({ lastNameM: '  ', specialty: ' ', personalEmail: '' })).apellido_materno === null && staffToRow(member({ specialty: ' ' })).especialidad === null);
check('Sin hijos, el número de hijos se guarda en cero', staffToRow(member({ hasChildren: false, childrenCount: 3 })).numero_hijos === 0);
check('Un cambio solo envía lo que cambia y nunca el id ni el código', JSON.stringify(staffPatchToRow({ id: 'X', code: '9', phone: ' 999888777 ' })) === '{"telefono":"999888777"}');
check('Un campo opcional vacío se borra (texto vacío → nulo); si no viene, no se toca', staffPatchToRow({ specialty: '' }).especialidad === null && staffPatchToRow({ personalEmail: '' }).correo_personal === null && !('especialidad' in staffPatchToRow({ phone: '999888777' })));
check('Dejar de tener hijos pone el número en cero', staffPatchToRow({ hasChildren: false }).numero_hijos === 0 && staffPatchToRow({ hasChildren: true, childrenCount: 2 }).numero_hijos === 2);
check('Sedes y almacén juntos como lugares; un nombre repetido entre sede y almacén se distingue', (() => {
  const p = placesOf([{ id: 'FIL-001', name: 'Los Olivos', status: 'Activo' }], [{ id: 'ALM-001', name: 'Los Olivos', status: 'Activo' }]);
  return p.length === 2 && p[0].kind === 'sede' && p[1].kind === 'almacen' && p[1].name === 'Los Olivos (almacén)' && p[0].name === 'Los Olivos';
})());
const asgRow = (extra: Partial<AsignacionRow> = {}): AsignacionRow => ({
  id: 'ASG-001', personal_id: 'STF-001', sede_id: 'FIL-002', almacen_id: null, area: 'Psicopedagogía', con_acceso: true, fecha_inicio: '2026-01-01', fecha_fin: null,
  es_principal: true, estado: 'Activa', observaciones: null, motivo_cierre: null, cerrada_por: null, ...extra,
});
check('Asignación: ida y vuelta; el lugar sale por id y su nombre se calcula al mostrar', (() => {
  const a = assignmentFromRow(asgRow(), FIL);
  return a.branch === 'Piura' && a.placeId === 'FIL-002' && a.placeKind === 'sede' && JSON.stringify(assignmentToRow(a)) === JSON.stringify(asgRow());
})());
check('Asignación al almacén: se guarda como almacén (nunca como sede)', (() => {
  const a = assignmentFromRow(asgRow({ sede_id: null, almacen_id: 'ALM-001', area: 'Logística' }), FIL);
  const back = assignmentToRow(a);
  return a.placeKind === 'almacen' && a.branch === 'Almacén central' && back.almacen_id === 'ALM-001' && back.sede_id === null;
})());
check('Si el lugar ya no existe se muestra su id, sin romper la lista', assignmentFromRow(asgRow({ sede_id: 'FIL-999' }), FIL).branch === 'FIL-999');

// ------------------------------------------------------------------------------------------------ Repositorio en memoria (imita lo que hacen la tabla y sus disparadores)
interface Fallos { insertStaff?: string; updateStaff?: string; inactivate?: string; insertAssignment?: string; updateAssignment?: string; conflictOnce?: boolean }
function fakeRepo(initialStaff: Staff[], initialAssignments: Assignment[], fallos: Fallos = {}) {
  const staff = initialStaff.map(s => ({ ...s }));
  const asg = initialAssignments.map(a => ({ ...a }));
  const calls: string[] = [];
  let conflicted = false;
  const repo: StaffRepository = {
    async listStaff() { return { ok: true, data: staff }; },
    async listAssignments() { return { ok: true, data: asg }; },
    async insertStaff(s) {
      calls.push(`insertStaff:${s.id}:${s.code}`);
      if (fallos.insertStaff) return { ok: false, error: fallos.insertStaff };
      if (fallos.conflictOnce && !conflicted) { conflicted = true; return { ok: false, error: 'dup', idConflict: true }; }
      staff.push(s);
      return { ok: true, data: s };
    },
    async updateStaff(id, patch) {
      calls.push(`updateStaff:${id}:${Object.keys(patch).join('+')}`);
      if (fallos.updateStaff) return { ok: false, error: fallos.updateStaff };
      const i = staff.findIndex(s => s.id === id);
      if (i < 0) return { ok: false, error: 'no existe' };
      staff[i] = { ...staff[i], ...patch };
      return { ok: true, data: staff[i] };
    },
    async inactivateStaff(id, input) {
      calls.push(`inactivate:${id}`);
      if (fallos.inactivate) return { ok: false, error: fallos.inactivate };
      const i = staff.findIndex(s => s.id === id);
      staff[i] = { ...staff[i], status: 'Inactivo', statusDate: input.date, statusReason: `${input.reason} — ${input.detail.trim()}` };
      for (const a of asg) if (a.staffId === id && a.status === 'Activa') Object.assign(a, { status: 'Cerrada', isMain: false, endDate: input.date, closeReason: input.reason, closedBy: input.by });
      return { ok: true, data: null };
    },
    async insertAssignment(a) {
      calls.push(`insertAssignment:${a.id}:${a.placeKind}`);
      if (fallos.insertAssignment) return { ok: false, error: fallos.insertAssignment };
      if (a.isMain) for (const x of asg) if (x.staffId === a.staffId && x.isMain && x.status === 'Activa') x.isMain = false;
      asg.push(a);
      return { ok: true, data: a };
    },
    async updateAssignment(id, a) {
      calls.push(`updateAssignment:${id}:${a.status}`);
      if (fallos.updateAssignment) return { ok: false, error: fallos.updateAssignment };
      const i = asg.findIndex(x => x.id === id);
      asg[i] = a;
      return { ok: true, data: a };
    },
  };
  return { repo, staff, asg, calls };
}

(async () => {
  // ---------------------------------------------------------------------------------------------- createStaff / editStaff
  const base = member();
  const { id: _id, code: _code, ...newData } = member({ docNumber: '70123456', names: 'Ana', lastNameP: 'Ruiz' });
  const r1 = fakeRepo([base], []);
  const c1 = await createStaff(r1.repo, [base], newData);
  check('Crear: el id y el código los asigna el sistema (siguientes al mayor) y nace activa', c1.ok && c1.value?.id === 'STF-002' && c1.value.code === '000002' && c1.value.status === 'Activo' && r1.staff.length === 2);
  const dup = await createStaff(r1.repo, [base], { ...newData, docNumber: ' 45123456 ' });
  check('Crear: un documento repetido se rechaza antes de guardar', !dup.ok && /ya está registrado/.test(dup.error!) && r1.calls.length === 1);
  const r2 = fakeRepo([base], [], { conflictOnce: true });
  const c2 = await createStaff(r2.repo, [base], newData);
  check('Crear: si dos personas crean a la vez (id repetido) se reintenta con el siguiente', c2.ok && r2.calls.length === 2, r2.calls.join());
  const r3 = fakeRepo([base], [], { insertStaff: 'Su cuenta no tiene permiso en la base de datos para esta operación.' });
  const c3 = await createStaff(r3.repo, [base], newData);
  check('Crear: el error de la base se muestra', !c3.ok && /no tiene permiso/.test(c3.error!));

  const e1 = fakeRepo([base], []);
  const ed1 = await editStaff(e1.repo, [base], 'STF-001', { phone: '999888777', status: 'Inactivo', code: '9', id: 'X', statusReason: 'x' });
  check('Editar: no cambia el id, el código ni el estado (el estado va por inactivar y reactivar)', ed1.ok && e1.calls[0] === 'updateStaff:STF-001:phone' && e1.staff[0].status === 'Activo' && e1.staff[0].code === '000001');
  check('Editar: un documento de otra persona se rechaza; el propio no', !(await editStaff(fakeRepo([base, member({ id: 'STF-002', code: '000002', docNumber: '70123456' })], []).repo, [base, member({ id: 'STF-002', code: '000002', docNumber: '70123456' })], 'STF-001', { docNumber: '70123456' })).ok
    && (await editStaff(e1.repo, [base], 'STF-001', { docNumber: '45123456' })).ok);
  check('Editar: una persona que no existe da un mensaje claro', (await editStaff(e1.repo, [base], 'STF-099', { phone: '999888777' })).error === 'No se encontró al trabajador.');

  // ---------------------------------------------------------------------------------------------- Inactivar y reactivar
  const a1 = assignmentFromRow(asgRow(), FIL);
  const a2 = assignmentFromRow(asgRow({ id: 'ASG-002', sede_id: 'FIL-001', es_principal: false, area: 'Administración' }), FIL);
  const ctx = { contracts: [], assignments: [], schedules: [] as Schedule[], activities: [], today };
  const i1 = fakeRepo([base], [a1, a2]);
  const inact = await inactivateStaff(i1.repo, [base], [a1, a2], 'STF-001', { reason: 'Renuncia', detail: 'Se fue a otra ciudad', date: today }, 'Admin', ctx, true);
  check('Dar de baja: cierra sus asignaciones y avisa que su cuenta se desactiva', inact.ok && inact.value?.closedAssignmentIds.join() === 'ASG-001,ASG-002' && inact.value.deactivatedAccount && i1.staff[0].status === 'Inactivo' && i1.asg.every(a => a.status === 'Cerrada'));
  check('Dar de baja: sin motivo, sin explicación o con fecha futura no se guarda nada', (await Promise.all([
    inactivateStaff(fakeRepo([base], []).repo, [base], [], 'STF-001', { reason: '', detail: 'xxxxxx', date: today }, 'A', ctx, false),
    inactivateStaff(fakeRepo([base], []).repo, [base], [], 'STF-001', { reason: 'Renuncia', detail: 'x', date: today }, 'A', ctx, false),
    inactivateStaff(fakeRepo([base], []).repo, [base], [], 'STF-001', { reason: 'Renuncia', detail: 'xxxxxx', date: '2099-01-01' }, 'A', ctx, false),
  ])).every(r => !r.ok));
  const rBlocked = fakeRepo([base], []);
  const blocked = await inactivateStaff(rBlocked.repo, [base], [], 'STF-001', { reason: 'Renuncia', detail: 'Se fue', date: today }, 'A', { ...ctx, contracts: [{ id: 'CON-1', staffId: 'STF-001', type: 'Plazo fijo', startDate: '2026-01-01', endDate: '2027-01-01', status: 'Vigente' } as never] }, false);
  check('Dar de baja: un contrato vigente lo impide y no se llama a la base', !blocked.ok && /contrato vigente/.test(blocked.error!) && rBlocked.calls.length === 0);
  const rFail = fakeRepo([base], [], { inactivate: 'Su rol no tiene la función «Inactivar a un trabajador».' });
  check('Dar de baja: el error de la base se muestra', /Inactivar a un trabajador/.test((await inactivateStaff(rFail.repo, [base], [], 'STF-001', { reason: 'Renuncia', detail: 'Se fue', date: today }, 'A', ctx, false)).error!));
  check('Dar de baja: quien ya está inactivo no se vuelve a dar de baja', !(await inactivateStaff(fakeRepo([member({ status: 'Inactivo' })], []).repo, [member({ status: 'Inactivo' })], [], 'STF-001', { reason: 'Renuncia', detail: 'Se fue', date: today }, 'A', ctx, false)).ok);

  const inactive = member({ status: 'Inactivo', statusDate: '2026-10-01', statusReason: 'Renuncia — x' });
  const re = fakeRepo([inactive], []);
  const react = await reactivateStaff(re.repo, [inactive], 'STF-001', 'Reingresa a la sede Piura', today);
  check('Reactivar: vuelve a estar activa con constancia; no toca asignaciones ni cuenta', react.ok && re.staff[0].status === 'Activo' && re.staff[0].statusReason === 'Reactivado — Reingresa a la sede Piura' && re.calls.join() === 'updateStaff:STF-001:status+statusDate+statusReason');
  check('Reactivar: pide motivo y no reactiva a quien ya está activa', !(await reactivateStaff(re.repo, [inactive], 'STF-001', 'x', today)).ok && !(await reactivateStaff(re.repo, [base], 'STF-001', 'Motivo válido', today)).ok);

  // ---------------------------------------------------------------------------------------------- Asignaciones
  const asgForm = (extra: Partial<AssignmentForm> = {}): AssignmentForm => ({ ...emptyAssignmentForm('2026-11-01'), staffId: 'STF-001', branch: 'Piura', area: 'Psicopedagogía', ...extra });
  const s1 = fakeRepo([base], []);
  const sv1 = await saveAssignment(s1.repo, [], [base], FIL, asgForm(), today);
  check('Crear una asignación en una sede: la primera es la principal; guarda el id del lugar', sv1.ok && sv1.value?.saved.id === 'ASG-001' && sv1.value.saved.isMain && sv1.value.saved.placeId === 'FIL-002' && sv1.value.saved.placeKind === 'sede' && s1.calls[0] === 'insertAssignment:ASG-001:sede');
  const sv2 = await saveAssignment(s1.repo, s1.asg, [base], FIL, asgForm({ branch: 'Almacén central', area: 'Logística' }), today);
  check('Crear una asignación al almacén: queda como almacén y la principal anterior sigue siéndolo', sv2.ok && sv2.value?.saved.placeKind === 'almacen' && sv2.value.saved.placeId === 'ALM-001' && !sv2.value.saved.isMain && s1.asg[0].isMain);
  const sv3 = await saveAssignment(s1.repo, s1.asg, [base], FIL, asgForm({ branch: 'Los Olivos', area: 'Ventas', isMain: true }), today);
  check('Marcar otra como principal la desplaza (la base lo hace; aquí se manda la nueva como principal)', sv3.ok && sv3.value?.saved.isMain === true && s1.asg.filter(a => a.isMain).length === 1);

  const bad = (extra: Partial<AssignmentForm>, existing: Assignment[] = []) => validateAssignmentForm(asgForm(extra), existing, [base], FIL, today);
  check('El acceso al sistema es Sí o No en cualquier lugar (el rol real se elige en Usuarios)', !validateAssignmentForm(asgForm({ branch: 'Almacén central', area: 'Logística', hasAccess: false }), [], [base], FIL, today).area
    && Object.keys(validateAssignmentForm(asgForm({ branch: 'Almacén central', area: 'Logística', hasAccess: true }), [], [base], FIL, today)).length === 0 && Object.keys(validateAssignmentForm(asgForm({ hasAccess: false }), [], [base], FIL, today)).length === 0);
  check('En el almacén solo se trabaja en Logística; una sede admite todas las áreas', !!bad({ branch: 'Almacén central', area: 'Psicopedagogía' }).area && !!bad({ branch: 'Almacén central', area: 'Administración' }).area
    && !bad({ branch: 'Almacén central', area: 'Logística' }).area && AREAS.every(a => !bad({ branch: 'Piura', area: a }).area || /ya tiene/.test(bad({ branch: 'Piura', area: a }).area!)));
  check('areasForPlace / placeAreaError: el almacén ofrece solo Logística; sin saber el tipo de lugar no opina', areasForPlace('almacen').join() === 'Logística' && areasForPlace('sede').length === AREAS.length && areasForPlace(undefined).length === AREAS.length
    && placeAreaError(undefined, 'Ventas') === undefined && placeAreaError('almacen', 'Ventas') !== undefined && placeAreaError('almacen', 'Logística') === undefined && placeAreaError('sede', 'Logística') === undefined);
  check('Hay UN solo personal, el de la base: la agenda, la verificación y las matrículas lo leen (ya no hay listas de ejemplo aparte ni «NOT_YET_IN_DB»)', (() => {
    const seedContract = { id: 'CON-001', staffId: 'STF-001', type: 'Indeterminado', position: 'Psicólogo Senior', startDate: '2023-01-01', status: 'Vigente' } as never;
    const ctx = readFileSync('src/context/DataContext.tsx', 'utf8');
    return positionOf('STF-001', [], today) === undefined && positionOf('STF-001', [seedContract], today) === 'Psicólogo Senior'
      && !/NOT_YET_IN_DB/.test(readFileSync('src/utils/staffDb.ts', 'utf8')) && !/NOT_YET_IN_DB|seedStaff|seedAssignments|seedContracts/.test(ctx)
      && /const staff = staffDir\.staff;/.test(ctx) && /const assignments = staffDir\.assignments;/.test(ctx) && !/orgStaff|orgAssignments|agendaContracts/.test(ctx);
  })());
  check('La asignación ya no guarda cargo ni rol del sistema (el cargo sale del contrato; el rol, de Usuarios)', !('cargo' in asgRow()) && !('rol_sistema' in asgRow()) && !('role' in assignmentFromRow(asgRow(), FIL)) && !('systemRole' in assignmentFromRow(asgRow(), FIL))
    && !('role' in emptyAssignmentForm('2026-11-01')) && !('systemRole' in emptyAssignmentForm('2026-11-01')) && assignmentFromRow(asgRow(), FIL).hasAccess === true && assignmentToRow(assignmentFromRow(asgRow({ con_acceso: false }), FIL)).con_acceso === false);
  check('assignablePlaces: una sede solo si se alcanza; el almacén solo el Superusuario o quien trabaja en él (alcanzar todas las sedes no basta)', (() => {
    const names = (who: Parameters<typeof assignablePlaces>[1], keep?: string) => assignablePlaces(FIL, who, keep).map(p => p.id).join();
    const base0 = { allBranches: false, isSuperuser: false, branchNames: [] as string[], warehouseIds: [] as string[] };
    return names({ ...base0, branchNames: ['Piura'] }) === 'FIL-002' && names({ ...base0, allBranches: true }) === 'FIL-001,FIL-002,FIL-003'
      && names({ ...base0, allBranches: true, warehouseIds: ['ALM-001'] }) === 'FIL-001,FIL-002,FIL-003,ALM-001' && names({ allBranches: true, isSuperuser: true, branchNames: [], warehouseIds: [] }) === 'FIL-001,FIL-002,FIL-003,ALM-001'
      && names(base0) === '' && names(base0, 'Almacén central') === 'ALM-001';
  })());
  check('Un lugar inactivo no se ofrece para una asignación nueva (sí al editar la que ya estaba)', !!bad({ branch: 'Cerrada' }).branch && !validateAssignmentForm(asgForm({ branch: 'Cerrada' }), [], [base], FIL, today, 'ASG-009').branch);
  check('No repite lugar + área activos; en otro lugar o con otra área sí', !!bad({}, [a1]).area && !bad({ branch: 'Los Olivos' }, [a1]).area && !bad({ area: 'Ventas' }, [a1]).area);
  check('El trabajador inactivo no recibe asignaciones; y hay que elegir lugar', !!validateAssignmentForm(asgForm(), [], [member({ status: 'Inactivo' })], FIL, today).staffId && !!bad({ branch: '' }).branch);
  check('Crear: el error de la base se muestra; no se crea nada si la validación falla', (await saveAssignment(fakeRepo([base], [], { insertAssignment: 'Su rol no tiene la función «Crear o editar una asignación».' }).repo, [], [base], FIL, asgForm(), today)).error?.includes('Crear o editar una asignación') === true
    && !(await saveAssignment(s1.repo, [], [base], FIL, asgForm({ branch: 'Almacén central', area: 'Ventas' }), today)).ok);

  const ed2 = fakeRepo([base], [a1]);
  const edOk = await saveAssignment(ed2.repo, [a1], [base], FIL, asgForm({ observations: 'Cambio de turno', isMain: true }), today, 'ASG-001');
  check('Editar una asignación activa la actualiza (el trabajador no cambia)', edOk.ok && ed2.calls[0] === 'updateAssignment:ASG-001:Activa' && ed2.asg[0].observations === 'Cambio de turno');
  check('Editar: no se cambia el trabajador, ni una cerrada, ni una que no existe', !(await saveAssignment(ed2.repo, [a1], [base, member({ id: 'STF-002', code: '2', docNumber: '1' })], FIL, asgForm({ staffId: 'STF-002' }), today, 'ASG-001')).ok
    && /cerrada/.test((await saveAssignment(ed2.repo, [{ ...a1, status: 'Cerrada' }], [base], FIL, asgForm(), today, 'ASG-001')).error!)
    && (await saveAssignment(ed2.repo, [a1], [base], FIL, asgForm(), today, 'ASG-777')).error === 'No se encontró la asignación.');

  const impactCtx = { schedules: [] as Schedule[], activities: [] };
  const cl = fakeRepo([base], [a1, a2]);
  const closed = await closeAssignment(cl.repo, [a1, a2], [base], FIL, 'ASG-001', today, 'Cambio de sede — traslado', 'Admin', today, impactCtx);
  check('Cerrar una asignación: queda cerrada con fecha, motivo y quién; la otra pasa a ser la principal', closed.ok && closed.value?.promotedId === 'ASG-002' && cl.asg[0].status === 'Cerrada' && cl.asg[0].endDate === today && cl.asg[0].closedBy === 'Admin' && !cl.asg[0].isMain);
  check('Cerrar: sin motivo, con fecha futura o ya cerrada se rechaza', (await Promise.all([
    closeAssignment(fakeRepo([base], [a1]).repo, [a1], [base], FIL, 'ASG-001', today, 'x', 'A', today, impactCtx),
    closeAssignment(fakeRepo([base], [a1]).repo, [a1], [base], FIL, 'ASG-001', '2099-01-01', 'Motivo válido', 'A', today, impactCtx),
    closeAssignment(fakeRepo([base], [a1]).repo, [{ ...a1, status: 'Cerrada' }], [base], FIL, 'ASG-001', today, 'Motivo válido', 'A', today, impactCtx),
  ])).every(r => !r.ok));
  const futureSession = { id: 'SES-1', student: 'X', program: 'P', level: 'N', date: '2026-12-01', time: '10:00', duration: 60, responsible: 'Laura Martínez', status: 'Reservado', studentId: 'ALU-1' } as Schedule;
  const clBlocked = fakeRepo([base], [a1]);
  const blockedClose = await closeAssignment(clBlocked.repo, [a1], [base], FIL, 'ASG-001', today, 'Fin del encargo — x', 'A', today, { schedules: [futureSession], activities: [] });
  check('Cerrar la última de Psicopedagogía de quien tiene asesorías futuras se impide', !blockedClose.ok && /asesoría/.test(blockedClose.error!) && clBlocked.calls.length === 0);

  // ---------------------------------------------------------------------------------------------- Lugares derivados de las asignaciones
  const A = (extra: Partial<Assignment> & { id: string }): Assignment => ({ ...assignmentFromRow(asgRow(), FIL), ...extra });
  const mix: Assignment[] = [
    A({ id: 'ASG-101', isMain: false, placeId: 'FIL-001', placeKind: 'sede', startDate: '2026-03-01' }),
    A({ id: 'ASG-102', isMain: true, placeId: 'FIL-002', placeKind: 'sede', startDate: '2026-05-01' }),
    A({ id: 'ASG-103', isMain: false, placeId: 'ALM-001', placeKind: 'almacen', area: 'Logística' }),
    A({ id: 'ASG-104', isMain: false, placeId: 'FIL-003', placeKind: 'sede', hasAccess: false }),
    A({ id: 'ASG-105', isMain: false, status: 'Cerrada', placeId: 'FIL-003', placeKind: 'sede' }),
    A({ id: 'ASG-106', staffId: 'STF-002', placeId: 'FIL-001', placeKind: 'sede' }),
  ];
  const d = derivedPlaces('STF-001', mix);
  check('Los lugares de la cuenta: solo asignaciones activas con acceso; la principal primero; el almacén aparte', d.branches.join() === 'FIL-002,FIL-001' && d.mainBranch === 'FIL-002' && d.warehouses.join() === 'ALM-001');
  check('Los lugares como los guarda la cuenta (nombres de sede, ids de almacén) y como se muestran', JSON.stringify(accountPlacesOf('STF-001', mix, FIL)) === JSON.stringify({ branch: 'Piura', additionalBranches: ['Los Olivos'], warehouses: ['ALM-001'] })
    && workPlacesText('STF-001', mix, FIL) === 'Piura, Los Olivos · Almacén central' && /Ninguno/.test(workPlacesText('STF-099', mix, FIL)));
  check('worksInWarehouse', worksInWarehouse('STF-001', mix) && !worksInWarehouse('STF-002', mix));

  // ---------------------------------------------------------------------------------------------- Cuenta de una persona
  const role = (id: string, name: string, extra: Partial<Role> = {}): Role => ({ id, name, desc: '', status: 'Activo', ...extra });
  const roles: Role[] = [
    role('ROL-001', 'Superusuario', { locked: true }), role('ROL-002', 'Administrador de sede'), role('ROL-003', 'Psicopedagogía', { branchUserLimit: 1 }),
    role('ROL-004', 'Almacén central'), role('ROL-005', 'Apagado', { status: 'Inactivo' }), role('ROL-007', 'Jefe de sede y almacén'),
  ];
  const permissions: Permission[] = [
    { roleId: 'ROL-002', permissions: ['dash-resumen:view'] }, { roleId: 'ROL-003', permissions: ['dash-resumen:view'] },
    { roleId: 'ROL-004', permissions: ['log-envios:dispatch', 'log-stock:entry'] }, { roleId: 'ROL-007', permissions: ['log-ajustes:create'] },
  ];
  const people: Staff[] = [
    member(), member({ id: 'STF-002', code: '000002', docNumber: '2', names: 'Ana', personalEmail: undefined }), member({ id: 'STF-003', code: '000003', docNumber: '3', names: 'Rosa' }),
    member({ id: 'STF-004', code: '000004', docNumber: '4', names: 'Marco' }), member({ id: 'STF-005', code: '000005', docNumber: '5', names: 'Baja', status: 'Inactivo' }),
    member({ id: 'STF-006', code: '000006', docNumber: '6', names: 'Sin asignación' }), member({ id: 'STF-007', code: '000007', docNumber: '7', names: 'Limpieza' }),
  ];
  const sede = (staffId: string, placeId: string, extra: Partial<Assignment> = {}): Assignment => A({ id: `ASG-${staffId}-${placeId}`, staffId, placeId, placeKind: placeId.startsWith('ALM') ? 'almacen' : 'sede', isMain: !placeId.startsWith('ALM'), ...extra });
  const asignaciones: Assignment[] = [
    sede('STF-001', 'FIL-002'), sede('STF-002', 'FIL-002'), sede('STF-003', 'ALM-001'), sede('STF-004', 'FIL-001'), sede('STF-004', 'ALM-001'),
    sede('STF-007', 'FIL-002', { hasAccess: false }),
  ];
  const user = (id: string, roleName: string, extra: Partial<User> = {}): User => ({ id, name: id, email: `${id}@ensilperu.com`, role: roleName, branch: '', lastAccess: 'Nunca', status: 'Activo', ...extra });
  const ctxFor = (users: User[] = [], actorIsSuperuser = true): AccountRulesContext => ({ staff: people, assignments: asignaciones, places: FIL, users, roles, permissions, actorIsSuperuser });
  const create = (staffId: string | undefined, roleName: string, email = 'x@ensilperu.com', users: User[] = [], actor = true, name?: string) => accountCreateCheck({ staffId, role: roleName, email, name }, ctxFor(users, actor));

  check('Una persona de una sede con un rol de sede puede recibir cuenta', create('STF-001', 'Administrador de sede').error === undefined);
  check('Una persona inactiva, sin asignación o solo «sin acceso al sistema» no recibe cuenta, y se explica por qué',
    /inactivo/.test(create('STF-005', 'Administrador de sede').error!) && /no tiene una asignación activa.*Personas → Asignaciones/.test(create('STF-006', 'Administrador de sede').error!) && /sin acceso al sistema/.test(create('STF-007', 'Administrador de sede').error!));
  check('Una persona con cuenta no recibe otra; una persona que no existe se rechaza', /ya tiene una cuenta/.test(create('STF-001', 'Administrador de sede', 'otro@ensilperu.com', [user('USR-1', 'Administrador de sede', { staffId: 'STF-001' })]).error!) && /no existe en Personal/.test(create('STF-099', 'Administrador de sede').error!));
  check('Correo: obligatorio, válido y sin repetir (aunque cambie la mayúscula)', /obligatorio/.test(create('STF-001', 'Administrador de sede', '  ').error!) && /no es válido/.test(create('STF-001', 'Administrador de sede', 'sin-arroba').error!)
    && /ya está registrado/.test(create('STF-001', 'Administrador de sede', 'USR-9@ENSILPERU.com', [user('USR-9', 'Administrador de sede')]).error!));
  check('El correo de ingreso nunca es el personal de la ficha (bloquea, sin distinguir mayúsculas)', /correo personal de la ficha/.test(create('STF-001', 'Administrador de sede', ' LAURA@gmail.com ').error!) && create('STF-002', 'Administrador de sede', 'laura@gmail.com').error === undefined);
  check('Un correo que no es @ensilperu.com avisa pero no bloquea; uno institucional no avisa', (() => {
    const gmail = create('STF-002', 'Administrador de sede', 'ana@gmail.com');
    const inst = create('STF-002', 'Administrador de sede', 'Ana@EnsilPeru.com');
    return gmail.error === undefined && /@ensilperu\.com/.test(gmail.warning!) && inst.error === undefined && inst.warning === undefined && INSTITUTIONAL_DOMAIN === 'ensilperu.com'
      && emailDomainWarning('mal') === undefined && emailDomainWarning('ana@ensilperu.com') === undefined;
  })());
  check('El rol debe existir y estar activo; el del sistema solo lo da un Superusuario', /no existe/.test(create('STF-001', 'Fantasma').error!) && /inactivo/.test(create('STF-001', 'Apagado').error!) && /Solo el Superusuario/.test(create('STF-001', 'Superusuario', 'x@ensilperu.com', [], false).error!));

  check('Quien trabaja en el almacén no recibe un rol que no lo mueve; y un rol que lo mueve exige trabajar en él', /trabaja en el almacén/.test(create('STF-003', 'Psicopedagogía').error!) && /mueve el almacén/.test(create('STF-001', 'Almacén central').error!)
    && create('STF-003', 'Almacén central').error === undefined);
  check('Quien trabaja en una sede y en el almacén necesita un rol que lo mueva', /trabaja en el almacén/.test(create('STF-004', 'Administrador de sede').error!) && create('STF-004', 'Jefe de sede y almacén').error === undefined);
  check('El rol del sistema es solo para cuentas técnicas: ni a una persona de una sede ni a una del almacén', /solo para cuentas técnicas, sin persona/.test(create('STF-003', 'Superusuario').error!) && /solo para cuentas técnicas, sin persona/.test(create('STF-001', 'Superusuario').error!)
    && /solo para cuentas técnicas, sin persona/.test(accountEditCheck(user('USR-3', 'Almacén central', { staffId: 'STF-003' }), { role: 'Superusuario' }, ctxFor()) ?? ''));
  check('El límite del rol por sede se cuenta con los lugares que salen de las asignaciones', /admite hasta 1 cuenta.*«Piura» ya tiene 1/.test(create('STF-001', 'Psicopedagogía', 'z@ensilperu.com', [user('USR-2', 'Psicopedagogía', { staffId: 'STF-002', branch: 'Piura' })]).error!)
    && create('STF-001', 'Psicopedagogía', 'z@ensilperu.com', [user('USR-2', 'Psicopedagogía', { staffId: 'STF-002', branch: 'Piura', status: 'Inactivo' })]).error === undefined);

  check('Cuenta técnica: solo un Superusuario, con nombre y rol del sistema', create(undefined, 'Superusuario', 'soporte@ensilperu.com', [], true, 'Soporte').error === undefined
    && /Solo un Superusuario crea una cuenta sin persona/.test(create(undefined, 'Superusuario', 'soporte@ensilperu.com', [], false, 'Soporte').error!)
    && /nombre de la cuenta técnica/.test(create(undefined, 'Superusuario', 'soporte@ensilperu.com', [], true, ' ').error!)
    && /solo puede tener un rol del sistema/.test(create(undefined, 'Administrador de sede', 'soporte@ensilperu.com', [], true, 'Soporte').error!));

  check('Los roles que se ofrecen a una persona son los coherentes con su lugar (almacenera: solo los que mueven el almacén)', rolesFor('STF-003', ctxFor()).map(r => r.name).sort().join() === 'Almacén central,Jefe de sede y almacén'
    && rolesFor('STF-001', ctxFor()).map(r => r.name).sort().join() === 'Administrador de sede,Psicopedagogía'
    && rolesFor('STF-001', ctxFor(undefined, false)).every(r => r.name !== 'Superusuario') && rolesFor('STF-003', ctxFor()).every(r => r.name !== 'Superusuario') && rolesFor('STF-001', ctxFor(), 'Apagado').some(r => r.name === 'Apagado'));
  check('roleFitError: devuelve el mensaje de la regla compartida con el servidor', roleFitError(roles[3], 'STF-001', asignaciones, permissions)?.includes('asignación al almacén') === true && roleFitError(roles[1], 'STF-001', asignaciones, permissions) === null);

  // Editar
  const ana = user('USR-2', 'Administrador de sede', { staffId: 'STF-002', branch: 'Piura' });
  const edit = (before: User, change: { role?: string; status?: 'Activo' | 'Inactivo' }, users: User[] = [before], actor = true) => accountEditCheck(before, change, ctxFor(users, actor));
  check('Cambiar el rol a uno coherente se puede; a uno que mueve el almacén sin trabajar en él, no', edit(ana, { role: 'Psicopedagogía' }) === null && /mueve el almacén/.test(edit(ana, { role: 'Almacén central' })!));
  const rosa = user('USR-3', 'Almacén central', { staffId: 'STF-003', warehouses: ['ALM-001'] });
  check('Quitarle el rol de almacén a quien trabaja en el almacén no se puede', /trabaja en el almacén/.test(edit(rosa, { role: 'Administrador de sede' })!));
  const inactiva = { ...ana, status: 'Inactivo' as const };
  check('Reactivar pide lo mismo que crear: persona activa y con asignación con acceso', edit(inactiva, { status: 'Activo' }) === null
    && /inactivo/.test(accountEditCheck({ ...inactiva, staffId: 'STF-005' }, { status: 'Activo' }, ctxFor([{ ...inactiva, staffId: 'STF-005' }]))!)
    && /no tiene una asignación activa/.test(accountEditCheck({ ...inactiva, staffId: 'STF-006' }, { status: 'Activo' }, ctxFor([{ ...inactiva, staffId: 'STF-006' }]))!));
  check('Reactivar una cuenta cuyo lugar se llenó pide plaza de nuevo; conservar la que ya tenía no', (() => { const llena = { ...inactiva, id: 'USR-6', role: 'Psicopedagogía', staffId: 'STF-001', branch: 'Piura' }; return /ya tiene 1/.test(accountEditCheck(llena, { status: 'Activo' }, ctxFor([user('USR-5', 'Psicopedagogía', { staffId: 'STF-002', branch: 'Piura' }), llena]))!); })()
    && accountEditCheck(user('USR-5', 'Psicopedagogía', { staffId: 'STF-002', branch: 'Piura' }), { role: 'Psicopedagogía' }, ctxFor([user('USR-5', 'Psicopedagogía', { staffId: 'STF-002', branch: 'Piura' })])) === null);
  check('La cuenta técnica no tiene restricción de lugar; el rol del sistema solo lo da un Superusuario', edit(user('USR-0', 'Superusuario'), { status: 'Inactivo' }) === null && /Solo el Superusuario/.test(edit(ana, { role: 'Superusuario' }, [ana], false)!));

  // Aviso al editar asignaciones (no bloquea)
  check('Aviso: si tras el cambio el rol y el lugar no se corresponden, se dice; si coinciden, no', (() => {
    const quitaAlmacen = asignaciones.filter(a => !(a.staffId === 'STF-003'));
    const w = accountPlaceWarning(rosa, [...quitaAlmacen], roles, permissions);
    const ok = accountPlaceWarning(rosa, asignaciones, roles, permissions);
    const trabajaEnAlm = accountPlaceWarning(ana, [...asignaciones, A({ id: 'ASG-900', staffId: 'STF-002', placeId: 'ALM-001', placeKind: 'almacen', isMain: false })], roles, permissions);
    return /mueve el almacén/.test(w!) && ok === undefined && /trabaja en el almacén/.test(trabajaEnAlm!)
      && accountPlaceWarning(undefined, asignaciones, roles, permissions) === undefined && accountPlaceWarning(user('X', 'Superusuario'), asignaciones, roles, permissions) === undefined
      && accountPlaceWarning({ role: 'Superusuario', staffId: 'STF-003' }, asignaciones, roles, permissions) === undefined;
  })());

  if (failed > 0) {
    console.log(`\n${failed} comprobaciones fallaron.`);
    process.exit(1);
  }
  console.log('\nTodas las comprobaciones pasaron.');
})();
