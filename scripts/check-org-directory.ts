/**
 * Verificación de Empresas y Filiales en la base de datos (paso 10): reglas puras, traducción de filas, mensajes de error de la base
 * y las operaciones (validar → guardar) con un repositorio en memoria que imita las restricciones reales de las tablas.
 * Ejecutar: npx tsx scripts/check-org-directory.ts
 */
import { readFileSync, readdirSync } from 'node:fs';
import type { Branch, Company, Warehouse } from '../src/context/DataContext';
import {
  BRANCH_CODE_PATTERN, RUC_PATTERN, branchFieldErrors, branchFromRow, branchPatchToRow, branchToRow, companyDeletionError, companyFieldErrors,
  companyFromRow, companyInactivationError, companyPatchToRow, companyToRow, dbErrorMessage, firstError, isIdConflict, warehouseFieldErrors, warehouseFromRow,
  warehousePatchToRow, warehouseToRow, withCompanyNames, type AlmacenRow, type DbErrorLike, type EmpresaRow, type SedeRow,
} from '../src/utils/orgDirectory';
import {
  createBranch, createCompany, createWarehouse, editBranch, editCompany, editWarehouse, removeBranch, removeCompany, type OrgRepository, type RepoResult,
} from '../src/services/orgDirectory';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : ` -> ${detail}`}`);
  if (!ok) failed++;
};

// ------------------------------------------------------------------------------------------------ Las mismas reglas que la base
const migration = (suffix: string) => readFileSync(`supabase/migrations/${readdirSync('supabase/migrations').find(f => f.endsWith(suffix))!}`, 'utf8');
const sql = migration('_acceso_base.sql');
const sql2 = migration('_sedes_codigo_automatico.sql');
const sql3 = migration('_almacenes_funciones.sql');
check('El RUC del código es el mismo patrón de la base', sql.includes(`ruc ~ '^[0-9]{11}$'`) && RUC_PATTERN.source === '^\\d{11}$');
check('El código de filial del código es el mismo patrón de la base (0002: FIL-NNN automático)', sql2.includes(`check (id ~ '${BRANCH_CODE_PATTERN.source.split('\\d').join('[0-9]')}')`), BRANCH_CODE_PATTERN.source);
check('La base hace cumplir un solo almacén central activo (0003)', sql3.includes('almacenes_un_activo on public.almacenes ((true)) where estado = \'Activo\''));
check('Crear y editar almacenes depende de sus funciones del registro (0003)', sql3.includes("tiene_funcion('org-almacenes:create')") && sql3.includes("tiene_funcion('org-almacenes:edit')"));
check('La base ya no tiene la columna id_web (enlace innecesario con otro proyecto)', sql2.includes('drop column id_web'));
check('El patrón del código: FIL- y al menos tres dígitos', ['FIL-001', 'FIL-999', 'FIL-1000'].every(c => BRANCH_CODE_PATTERN.test(c)) && ['PIU', 'FIL-1', 'fil-001', 'FIL-ABC', 'FIL 001', 'FIL-001 '].every(c => !BRANCH_CODE_PATTERN.test(c)));
check('La base no deja repetir código ni nombre de filial sin distinguir mayúsculas', sql.includes('sedes_id_unico on public.sedes (lower(id))') && sql.includes('sedes_nombre_unico on public.sedes (lower(nombre))'));

// ------------------------------------------------------------------------------------------------ Datos de partida
const emp = (id: string, ruc: string, name: string, estado: 'Activo' | 'Inactivo' = 'Activo'): Company => ({ id, ruc, name, commercialName: '', status: estado, observaciones: '' });
const sede = (patch: Partial<Branch> = {}): Branch => ({
  id: 'FIL-001', name: 'Piura', company: '', companyId: 'EMP-001', status: 'Activo', address: 'Av. Grau 100', reference: '', department: 'Piura', province: 'Piura', district: 'Piura',
  phoneFixed: '', phoneMobile: '', email: '', observations: '', ...patch,
});

const alm = (patch: Partial<Warehouse> = {}): Warehouse => ({ id: 'ALM-001', name: 'Almacén central', companyId: 'EMP-001', status: 'Activo', address: 'Av. 1', observations: undefined, ...patch });

// ------------------------------------------------------------------------------------------------ Traducción de filas
const company = { ...emp('EMP-001', '20123456789', 'Colegio Ensil De Las Américas E.I.R.L.'), commercialName: ' ', observaciones: '' };
const row = companyToRow(company);
check('Los textos vacíos de una empresa se guardan como nulos y se leen como vacíos', row.nombre_comercial === null && row.observaciones === null && companyFromRow(row).commercialName === '');
check('Empresa: ida y vuelta sin pérdida', JSON.stringify(companyFromRow(companyToRow(emp('EMP-002', '20987654321', 'SILEE EIRL')))) === JSON.stringify(emp('EMP-002', '20987654321', 'SILEE EIRL')));
check('Un cambio de empresa solo envía los campos que cambian y nunca el id', JSON.stringify(companyPatchToRow({ id: 'X', status: 'Inactivo' })) === '{"estado":"Inactivo"}');
const b = sede({ reference: ' frente al parque ', phoneMobile: '999 888 777', email: 'piura@ensilperu.com' });
const srow = branchToRow(b);
check('Filial: guarda el id de la empresa y no su nombre', srow.empresa_id === 'EMP-001' && !('company' in srow) && srow.referencia === 'frente al parque');
check('Filial: ida y vuelta sin pérdida (el nombre de la empresa se completa aparte)', JSON.stringify(branchFromRow(branchToRow(sede()))) === JSON.stringify(sede()));
check('Un cambio de filial nunca envía el código ni la empresa', !('id' in branchPatchToRow({ id: 'X', companyId: 'EMP-009', name: 'Nuevo' })) && !('empresa_id' in branchPatchToRow({ companyId: 'EMP-009' })) && branchPatchToRow({ name: ' Nuevo ' }).nombre === 'Nuevo');
check('El nombre de la empresa se calcula al mostrar y sigue a la razón social', withCompanyNames([sede()], [emp('EMP-001', '20123456789', 'Nombre corregido')])[0].company === 'Nombre corregido' && withCompanyNames([sede({ companyId: undefined })], [])[0].company === '');

const arow = warehouseToRow(alm({ address: ' ', observations: 'Nota' }));
check('Almacén: los textos vacíos se guardan como nulos y guarda el id de la empresa, no su nombre', arow.direccion === null && arow.observaciones === 'Nota' && arow.empresa_id === 'EMP-001' && !('company' in arow));
check('Almacén: ida y vuelta sin pérdida', JSON.stringify(warehouseFromRow(warehouseToRow(alm()))) === JSON.stringify(alm()));
check('Un cambio de almacén no envía el id; quitar la empresa la deja en blanco; sin tocarla no se envía', !('id' in warehousePatchToRow({ id: 'X', name: ' Nuevo ' })) && warehousePatchToRow({ name: ' Nuevo ' }).nombre === 'Nuevo'
  && warehousePatchToRow({ companyId: undefined }).empresa_id === null && !('empresa_id' in warehousePatchToRow({ status: 'Inactivo' })));
check('El nombre de la empresa del almacén se calcula al mostrar', withCompanyNames([alm()], [emp('EMP-001', '20123456789', 'SILEE')])[0].company === 'SILEE');

// ------------------------------------------------------------------------------------------------ Reglas de empresa
const companies = [emp('EMP-001', '20123456789', 'Colegio Ensil'), emp('EMP-002', '20987654321', 'SILEE EIRL')];
check('RUC obligatorio, de 11 dígitos y sin repetir', companyFieldErrors({ ruc: '', name: 'X', status: 'Activo' }, companies).ruc === 'El RUC es obligatorio.'
  && /11 dígitos/.test(companyFieldErrors({ ruc: '123', name: 'X', status: 'Activo' }, companies).ruc)
  && /ya está registrado/.test(companyFieldErrors({ ruc: '20123456789', name: 'X', status: 'Activo' }, companies).ruc));
check('Editar una empresa no choca con su propio RUC', !companyFieldErrors({ ruc: '20123456789', name: 'Colegio Ensil', status: 'Activo' }, companies, 'EMP-001').ruc);
check('La razón social es obligatoria', companyFieldErrors({ ruc: '20111111111', name: '  ', status: 'Activo' }, companies).name === 'La razón social es obligatoria.');
const linked = [sede()];
check('No se inactiva ni se elimina una empresa con filiales; sin filiales sí', companyInactivationError(companies[0], linked) !== null && companyDeletionError(companies[0], linked) !== null
  && companyInactivationError(companies[1], linked) === null && companyDeletionError(companies[1], linked) === null);
check('La inactivación con filiales se avisa en el formulario solo al editar y si estaba activa', !!companyFieldErrors({ ruc: '20123456789', name: 'Colegio Ensil', status: 'Inactivo' }, companies, 'EMP-001', linked).status
  && !companyFieldErrors({ ruc: '20111111111', name: 'Nueva', status: 'Inactivo' }, companies, undefined, linked).status
  && !companyFieldErrors({ ruc: '20123456789', name: 'X', status: 'Inactivo' }, [emp('EMP-001', '20123456789', 'X', 'Inactivo')], 'EMP-001', linked).status);

// ------------------------------------------------------------------------------------------------ Reglas de filial
const ok = sede({ id: 'FIL-002', name: 'Los Olivos', companyId: 'EMP-002' });
const branches = [sede()];
check('Una filial completa y válida no tiene errores', firstError(branchFieldErrors(ok, branches, companies)) === null);
check('El código lo asigna el sistema: el formulario no lo pide ni lo valida', !('id' in branchFieldErrors({ ...ok, id: '' }, branches, companies)) && !('id' in branchFieldErrors({ ...ok, id: 'cualquier cosa' }, branches, companies)));
check('Nombre obligatorio y sin repetir (sin distinguir mayúsculas)', branchFieldErrors({ ...ok, name: '' }, branches, companies).name === 'El nombre es obligatorio.' && branchFieldErrors({ ...ok, name: ' PIURA ' }, branches, companies).name === 'Ya existe una filial con ese nombre.');
check('La empresa es obligatoria, debe existir y estar activa', branchFieldErrors({ ...ok, companyId: undefined }, branches, companies).companyId === 'Debe seleccionar una empresa.'
  && branchFieldErrors({ ...ok, companyId: 'EMP-099' }, branches, companies).companyId === 'La empresa elegida no existe.'
  && branchFieldErrors(ok, branches, [emp('EMP-002', '20987654321', 'SILEE', 'Inactivo')]).companyId === 'La empresa elegida está inactiva.');
check('Dirección, departamento, provincia y distrito son obligatorios; el correo, si se escribe, debe ser válido', ['address', 'department', 'province', 'district'].every(k => !!branchFieldErrors({ ...ok, [k]: ' ' }, branches, companies)[k])
  && branchFieldErrors({ ...ok, email: 'sin-arroba' }, branches, companies).email === 'Formato de correo inválido.' && !branchFieldErrors({ ...ok, email: '' }, branches, companies).email);
check('Al editar no se vuelve a revisar la empresa, pero el nombre no puede chocar con otra', !branchFieldErrors({ ...sede(), companyId: undefined }, branches, companies, 'FIL-001').companyId
  && !branchFieldErrors(sede(), branches, companies, 'FIL-001').name
  && branchFieldErrors({ ...sede({ id: 'FIL-002', name: 'Piura' }) }, branches, companies, 'FIL-002').name === 'Ya existe una filial con ese nombre.');

// ------------------------------------------------------------------------------------------------ Reglas de almacén
const almacenes = [alm()];
check('Un almacén válido no tiene errores (empresa opcional)', firstError(warehouseFieldErrors({ name: 'Segundo', status: 'Inactivo', companyId: undefined }, almacenes, companies)) === null);
check('El nombre del almacén es obligatorio, de hasta 80 caracteres y sin repetir (sin distinguir mayúsculas)', warehouseFieldErrors({ name: ' ', status: 'Inactivo' }, almacenes, companies).name === 'El nombre del almacén es obligatorio.'
  && !!warehouseFieldErrors({ name: 'x'.repeat(81), status: 'Inactivo' }, almacenes, companies).name
  && warehouseFieldErrors({ name: 'ALMACÉN CENTRAL', status: 'Inactivo' }, almacenes, companies).name === 'Ya existe un almacén con ese nombre.'
  && !warehouseFieldErrors({ name: 'Almacén central', status: 'Activo' }, almacenes, companies, 'ALM-001').name);
check('Solo un almacén central activo: otro activo se rechaza y uno inactivo no', !!warehouseFieldErrors({ name: 'Otro', status: 'Activo' }, almacenes, companies).status
  && !warehouseFieldErrors({ name: 'Otro', status: 'Inactivo' }, almacenes, companies).status && !warehouseFieldErrors({ name: 'Almacén central', status: 'Activo' }, almacenes, companies, 'ALM-001').status);
check('La empresa del almacén debe existir y estar activa, salvo que ya la tuviera', warehouseFieldErrors({ name: 'Nuevo', status: 'Inactivo', companyId: 'EMP-099' }, almacenes, companies).companyId === 'La empresa elegida no existe.'
  && warehouseFieldErrors({ name: 'Nuevo', status: 'Inactivo', companyId: 'EMP-X' }, almacenes, [emp('EMP-X', '20000000000', 'Inactiva', 'Inactivo')]).companyId === 'La empresa elegida está inactiva.'
  && !warehouseFieldErrors({ name: 'Almacén central', status: 'Activo', companyId: 'EMP-001' }, [alm({ companyId: 'EMP-001' })], [emp('EMP-001', '20123456789', 'Colegio', 'Inactivo')], 'ALM-001').companyId);
check('Una empresa con un almacén vinculado tampoco se inactiva ni se elimina', companyInactivationError(companies[0], [alm({ companyId: 'EMP-001' })]) !== null && companyDeletionError(companies[0], [alm({ companyId: 'EMP-001' })]) !== null
  && /almacenes/.test(companyDeletionError(companies[0], [alm({ companyId: 'EMP-001' })])!));

// ------------------------------------------------------------------------------------------------ Mensajes de la base
const pg = (code: string, message: string, details = ''): DbErrorLike => ({ code, message, details });
check('Nombre de almacén repetido y un segundo almacén activo', dbErrorMessage(pg('23505', 'duplicate key value violates unique constraint "almacenes_nombre_unico"')) === 'Ya existe un almacén con ese nombre.'
  && /almacén central activo/.test(dbErrorMessage(pg('23505', 'duplicate key value violates unique constraint "almacenes_un_activo"'))));
check('RUC repetido', dbErrorMessage(pg('23505', 'duplicate key value violates unique constraint "empresas_ruc_key"')) === 'Este RUC ya está registrado en otra empresa.');
check('Código y nombre de filial repetidos', dbErrorMessage(pg('23505', 'duplicate key value violates unique constraint "sedes_id_unico"')) === 'Este código ya está en uso.'
  && dbErrorMessage(pg('23505', 'duplicate key value violates unique constraint "sedes_nombre_unico"')) === 'Ya existe una filial con ese nombre.');
// El error real de Postgres al borrar con clave RESTRICT (comprobado contra la migración): código 23001, no 23503
check('Eliminar algo que se usa: se explica y se propone inactivar', /Inactívelo/.test(dbErrorMessage(pg('23001', 'update or delete on table "empresas" violates RESTRICT setting of foreign key constraint "sedes_empresa_id_fkey" on table "sedes"', 'Key (id)=(EMP-001) is referenced from table "sedes".')))
  && /Inactívelo/.test(dbErrorMessage(pg('23503', 'update or delete on table "empresas" violates foreign key constraint', 'Key (id)=(EMP-001) is still referenced from table "sedes".'))));
check('Empresa inexistente al crear una filial', dbErrorMessage(pg('23503', 'insert or update on table "sedes" violates foreign key constraint', 'Key (empresa_id)=(EMP-9) is not present in table "empresas".')) === 'La empresa elegida no existe.');
check('Formato que exige la base', /11 dígitos/.test(dbErrorMessage(pg('23514', 'new row for relation "empresas" violates check constraint "empresas_ruc_check"'))) && /2 a 20/.test(dbErrorMessage(pg('23514', 'new row violates check constraint "sedes_id_check"'))));
check('Sin permiso (RLS), sin red y sesión vencida', /no tiene permiso/.test(dbErrorMessage(pg('42501', 'new row violates row-level security policy for table "sedes"'))) && /No hay conexión/.test(dbErrorMessage({ message: 'TypeError: Failed to fetch' })) && /sesión venció/.test(dbErrorMessage({ code: 'PGRST301', message: 'JWT expired' })));
check('Un error desconocido no muestra texto técnico', dbErrorMessage(pg('XX000', 'internal stack trace secret')) === 'No se pudo completar la operación en la base de datos. Intente de nuevo.');
check('Solo un choque de id generado se reintenta', isIdConflict(pg('23505', 'duplicate key value violates unique constraint "empresas_pkey"')) && isIdConflict(pg('23505', 'duplicate key value violates unique constraint "sedes_pkey"')) && isIdConflict(pg('23505', 'duplicate key value violates unique constraint "sedes_id_unico"')) && !isIdConflict(pg('23505', 'duplicate key value violates unique constraint "empresas_ruc_key"')) && !isIdConflict(null));

// ------------------------------------------------------------------------------------------------ Operaciones con un repositorio en memoria
/** Imita las restricciones reales: claves, RUC único, código y nombre únicos sin mayúsculas, claves que no se borran si algo depende de ellas. */
function memoryRepo(initialCompanies: Company[] = [], initialBranches: Branch[] = [], hooks: { onInsertCompany?: () => void } = {}, initialWarehouses: Warehouse[] = []) {
  const emps: EmpresaRow[] = initialCompanies.map(companyToRow);
  const seds: SedeRow[] = initialBranches.map(branchToRow);
  const alms: AlmacenRow[] = initialWarehouses.map(warehouseToRow);
  const calls: string[] = [];
  const err = (code: string, message: string, details = ''): RepoResult<never> => ({ ok: false, error: dbErrorMessage({ code, message, details }), idConflict: isIdConflict({ code, message, details }) });
  const repo: OrgRepository = {
    async listCompanies() { return { ok: true, data: emps.map(companyFromRow) }; },
    async listWarehouses() { return { ok: true, data: alms.map(warehouseFromRow) }; },
    async insertWarehouse(w) {
      calls.push('insertWarehouse'); const r = warehouseToRow(w);
      if (alms.some(a => a.id === r.id)) return err('23505', 'duplicate key value violates unique constraint "almacenes_pkey"');
      if (alms.some(a => a.nombre.toLowerCase() === r.nombre.toLowerCase())) return err('23505', 'duplicate key value violates unique constraint "almacenes_nombre_unico"');
      if (r.estado === 'Activo' && alms.some(a => a.estado === 'Activo')) return err('23505', 'duplicate key value violates unique constraint "almacenes_un_activo"');
      if (r.empresa_id && !emps.some(e => e.id === r.empresa_id)) return err('23503', 'insert or update on table "almacenes" violates foreign key constraint', 'is not present in table "empresas".');
      alms.push(r); return { ok: true, data: warehouseFromRow(r) };
    },
    async updateWarehouse(id, patch) {
      calls.push('updateWarehouse'); const i = alms.findIndex(a => a.id === id);
      if (i < 0) return { ok: false, error: 'no existe' };
      const p = warehousePatchToRow(patch);
      if (p.estado === 'Activo' && alms.some(a => a.id !== id && a.estado === 'Activo')) return err('23505', 'duplicate key value violates unique constraint "almacenes_un_activo"');
      alms[i] = { ...alms[i], ...p }; return { ok: true, data: warehouseFromRow(alms[i]) };
    },
    async listBranches() { return { ok: true, data: seds.map(branchFromRow) }; },
    async insertCompany(c) {
      calls.push('insertCompany'); hooks.onInsertCompany?.();
      const r = companyToRow(c);
      if (emps.some(e => e.id === r.id)) return err('23505', 'duplicate key value violates unique constraint "empresas_pkey"');
      if (emps.some(e => e.ruc === r.ruc)) return err('23505', 'duplicate key value violates unique constraint "empresas_ruc_key"');
      emps.push(r); return { ok: true, data: companyFromRow(r) };
    },
    async updateCompany(id, patch) {
      calls.push('updateCompany'); const i = emps.findIndex(e => e.id === id);
      if (i < 0) return { ok: false, error: 'no existe' };
      const p = companyPatchToRow(patch);
      if (p.ruc && emps.some(e => e.id !== id && e.ruc === p.ruc)) return err('23505', 'duplicate key value violates unique constraint "empresas_ruc_key"');
      emps[i] = { ...emps[i], ...p }; return { ok: true, data: companyFromRow(emps[i]) };
    },
    async deleteCompany(id) {
      calls.push('deleteCompany');
      if (seds.some(s => s.empresa_id === id)) return err('23001', 'update or delete on table "empresas" violates RESTRICT setting of foreign key constraint "sedes_empresa_id_fkey" on table "sedes"', `Key (id)=(${id}) is referenced from table "sedes".`);
      const i = emps.findIndex(e => e.id === id); if (i < 0) return { ok: false, error: 'no existe' };
      emps.splice(i, 1); return { ok: true, data: null };
    },
    async insertBranch(br) {
      calls.push('insertBranch'); const r = branchToRow(br);
      if (seds.some(s => s.id === r.id)) return err('23505', 'duplicate key value violates unique constraint "sedes_pkey"');
      if (seds.some(s => s.nombre.toLowerCase() === r.nombre.toLowerCase())) return err('23505', 'duplicate key value violates unique constraint "sedes_nombre_unico"');
      if (r.empresa_id && !emps.some(e => e.id === r.empresa_id)) return err('23503', 'insert or update on table "sedes" violates foreign key constraint', 'is not present in table "empresas".');
      seds.push(r); return { ok: true, data: branchFromRow(r) };
    },
    async updateBranch(id, patch) {
      calls.push('updateBranch'); const i = seds.findIndex(s => s.id === id);
      if (i < 0) return { ok: false, error: 'no existe' };
      seds[i] = { ...seds[i], ...branchPatchToRow(patch) }; return { ok: true, data: branchFromRow(seds[i]) };
    },
    async deleteBranch(id) {
      calls.push('deleteBranch'); const i = seds.findIndex(s => s.id === id); if (i < 0) return { ok: false, error: 'no existe' };
      seds.splice(i, 1); return { ok: true, data: null };
    },
  };
  return { repo, emps, seds, alms, calls };
}

(async () => {
  // Empresas: crear
  const m1 = memoryRepo();
  const c1 = await createCompany(m1.repo, [], { ruc: '20123456789', name: 'Colegio Ensil De Las Américas E.I.R.L.', commercialName: '', status: 'Activo' });
  check('Crear la primera empresa le asigna EMP-001', c1.ok && c1.value?.id === 'EMP-001' && m1.emps.length === 1);
  const c2 = await createCompany(m1.repo, [c1.value!], { ruc: '20987654321', name: 'SILEE EIRL', commercialName: '', status: 'Activo' });
  check('La segunda es EMP-002', c2.ok && c2.value?.id === 'EMP-002');
  const bad = await createCompany(m1.repo, [c1.value!, c2.value!], { ruc: '123', name: 'X', commercialName: '', status: 'Activo' });
  check('Una empresa inválida no llega a la base', !bad.ok && /11 dígitos/.test(bad.error!) && m1.calls.filter(c => c === 'insertCompany').length === 2);
  const dup = await createCompany(m1.repo, [], { ruc: '20123456789', name: 'Otra', commercialName: '', status: 'Activo' });
  check('Si la lista local estaba desactualizada, la base rechaza el RUC repetido con un mensaje claro', !dup.ok && dup.error === 'Este RUC ya está registrado en otra empresa.');

  // Choque de id generado: otra persona creó EMP-001 mientras esta pantalla aún no lo veía → se reintenta con EMP-002
  const m2 = memoryRepo([emp('EMP-001', '20555555555', 'Creada por otra persona')]);
  const retry = await createCompany(m2.repo, [], { ruc: '20666666666', name: 'Mía', commercialName: '', status: 'Activo' });
  check('Si otra persona creó el mismo id a la vez, se reintenta con el siguiente', retry.ok && retry.value?.id === 'EMP-002' && m2.calls.filter(c => c === 'insertCompany').length === 2, JSON.stringify(retry));
  const m3 = memoryRepo(Array.from({ length: 5 }, (_, i) => emp(`EMP-00${i + 1}`, `2000000000${i}`, `E${i}`)));
  const exhausted = await createCompany(m3.repo, [], { ruc: '20999999999', name: 'Nueva', commercialName: '', status: 'Activo' });
  check('Tras varios choques seguidos se rinde con un mensaje claro y sin texto técnico', !exhausted.ok && /No se pudo asignar un código/.test(exhausted.error!) && m3.calls.length === 3);

  // Empresas: editar, inactivar, eliminar
  const m4 = memoryRepo([emp('EMP-001', '20123456789', 'Colegio Ensil'), emp('EMP-002', '20987654321', 'SILEE EIRL')], [sede()]);
  const cs = (await m4.repo.listCompanies()).data!;
  const bs = (await m4.repo.listBranches()).data!;
  const edit = await editCompany(m4.repo, cs, bs, 'EMP-002', { name: 'SILEE E.I.R.L.' });
  check('Editar la razón social guarda el cambio', edit.ok && edit.value?.name === 'SILEE E.I.R.L.' && m4.emps[1].razon_social === 'SILEE E.I.R.L.');
  const updatesBefore = m4.calls.filter(c => c === 'updateCompany').length;
  const inact1 = await editCompany(m4.repo, cs, bs, 'EMP-001', { status: 'Inactivo' });
  check('No se inactiva una empresa con filiales (no llega a la base)', !inact1.ok && /filiales o almacenes vinculados/.test(inact1.error!) && m4.emps[0].estado === 'Activo' && m4.calls.filter(c => c === 'updateCompany').length === updatesBefore);
  const inact2 = await editCompany(m4.repo, cs, bs, 'EMP-002', { status: 'Inactivo' });
  check('Una empresa sin filiales sí se inactiva', inact2.ok && inact2.value?.status === 'Inactivo');
  const del1 = await removeCompany(m4.repo, cs, bs, 'EMP-001');
  check('No se elimina una empresa con filiales', !del1.ok && /filiales o almacenes/.test(del1.error!) && m4.emps.length === 2);
  const del2 = await removeCompany(m4.repo, cs, bs, 'EMP-002');
  check('Una empresa sin filiales se elimina', del2.ok && m4.emps.length === 1);
  check('La base también protege si la pantalla tenía la lista desactualizada (sin filiales a la vista)', await (async () => {
    const r = await removeCompany(m4.repo, cs, [], 'EMP-001');
    return !r.ok && /Inactívelo/.test(r.error!) && m4.emps.length === 1;
  })());
  check('Editar o eliminar algo que ya no existe da un mensaje claro', !(await editCompany(m4.repo, cs, bs, 'EMP-099', { name: 'X' })).ok && (await removeCompany(m4.repo, cs, bs, 'EMP-099')).error === 'No se encontró la empresa.');

  // Filiales
  const m5 = memoryRepo([emp('EMP-001', '20123456789', 'Colegio Ensil De Las Américas E.I.R.L.'), emp('EMP-002', '20987654321', 'SILEE EIRL')]);
  const cList = (await m5.repo.listCompanies()).data!;
  const piura = await createBranch(m5.repo, [], cList, sede({ name: 'Piura', companyId: 'EMP-001' }));
  check('Crear la primera filial le asigna FIL-001 y devuelve el nombre de su empresa', piura.ok && piura.value?.id === 'FIL-001' && piura.value?.company === 'Colegio Ensil De Las Américas E.I.R.L.' && m5.seds.length === 1, JSON.stringify(piura));
  const olivos = await createBranch(m5.repo, [piura.value!], cList, sede({ name: 'Los Olivos', companyId: 'EMP-002', department: 'Lima', province: 'Lima', district: 'Los Olivos' }));
  check('La segunda es FIL-002, en la otra empresa', olivos.ok && olivos.value?.id === 'FIL-002' && olivos.value?.company === 'SILEE EIRL' && m5.seds.length === 2);
  const typed = await createBranch(m5.repo, [piura.value!, olivos.value!], cList, sede({ id: 'MI-CODIGO', name: 'Chiclayo', companyId: 'EMP-001' }));
  check('Un código escrito a mano se ignora: el sistema asigna el siguiente', typed.ok && typed.value?.id === 'FIL-003' && !m5.seds.some(x => x.id === 'MI-CODIGO'));
  const sameName = await createBranch(m5.repo, [piura.value!], cList, sede({ name: 'PIURA', companyId: 'EMP-001' }));
  check('Un nombre repetido (aunque cambie la mayúscula) no llega a la base', !sameName.ok && sameName.error === 'Ya existe una filial con ese nombre.' && m5.calls.filter(c => c === 'insertBranch').length === 3);
  check('La base también rechaza el nombre repetido si la lista de la pantalla estaba desactualizada', await (async () => {
    // lista desactualizada: aún ve «Piura» con otro nombre, así que valida y asigna un código libre; la base rechaza el nombre
    const r = await createBranch(m5.repo, [{ ...piura.value!, name: 'Nombre viejo' }, olivos.value!, typed.value!], cList, sede({ name: 'piura', companyId: 'EMP-001' }));
    return !r.ok && r.error === 'Ya existe una filial con ese nombre.';
  })());
  const m6 = memoryRepo([emp('EMP-001', '20123456789', 'Colegio Ensil')], [sede({ name: 'Creada por otra persona' })]);
  const stale = await createBranch(m6.repo, [], [emp('EMP-001', '20123456789', 'Colegio Ensil')], sede({ name: 'Mía', companyId: 'EMP-001' }));
  check('Si otra persona creó FIL-001 a la vez, se reintenta con FIL-002', stale.ok && stale.value?.id === 'FIL-002' && m6.calls.filter(c => c === 'insertBranch').length === 2, JSON.stringify(stale));
  const incomplete = await createBranch(m5.repo, [], cList, sede({ name: 'Chiclayo 2', companyId: 'EMP-001', address: '' }));
  check('Una filial incompleta no llega a la base', !incomplete.ok && incomplete.error === 'La dirección es obligatoria.');
  const bList = (await m5.repo.listBranches()).data!;
  const editB = await editBranch(m5.repo, withCompanyNames(bList, cList), cList, 'FIL-001', { phoneMobile: '999111222', companyId: 'EMP-002', id: 'HACK', status: 'Inactivo' });
  check('Editar una filial cambia sus datos pero ni su código ni su empresa', editB.ok && editB.value?.phoneMobile === '999111222' && editB.value?.status === 'Inactivo' && editB.value?.id === 'FIL-001' && editB.value?.companyId === 'EMP-001' && m5.seds[0].empresa_id === 'EMP-001');
  const renameClash = await editBranch(m5.repo, bList, cList, 'FIL-002', { name: 'piura' });
  check('No se renombra una filial con el nombre de otra', !renameClash.ok && renameClash.error === 'Ya existe una filial con ese nombre.');
  const delB = await removeBranch(m5.repo, bList, 'FIL-002');
  check('Eliminar una filial', delB.ok && m5.seds.length === 2 && (await removeBranch(m5.repo, bList, 'ZZZ')).error === 'No se encontró la filial.');

  // Almacenes
  const m7 = memoryRepo([emp('EMP-001', '20123456789', 'Colegio Ensil'), emp('EMP-002', '20987654321', 'SILEE EIRL', 'Inactivo')]);
  const c7 = (await m7.repo.listCompanies()).data!;
  const a1 = await createWarehouse(m7.repo, [], c7, { name: ' Almacén central ', companyId: 'EMP-001', status: 'Activo', address: 'Av. 1' });
  check('Crear el primer almacén le asigna ALM-001, recorta el nombre y devuelve el de su empresa', a1.ok && a1.value?.id === 'ALM-001' && a1.value?.name === 'Almacén central' && a1.value?.company === 'Colegio Ensil' && m7.alms.length === 1, JSON.stringify(a1));
  const a2 = await createWarehouse(m7.repo, [a1.value!], c7, { name: 'Segundo', status: 'Activo' });
  check('Un segundo almacén activo no llega a la base', !a2.ok && /Solo puede haber un almacén central activo/.test(a2.error!) && m7.calls.filter(c => c === 'insertWarehouse').length === 1);
  const a3 = await createWarehouse(m7.repo, [a1.value!], c7, { name: 'Segundo', status: 'Inactivo' });
  check('Uno inactivo sí se crea (ALM-002)', a3.ok && a3.value?.id === 'ALM-002');
  const a4 = await createWarehouse(m7.repo, [a1.value!, a3.value!], c7, { name: 'Con empresa inactiva', status: 'Inactivo', companyId: 'EMP-002' });
  check('No se crea con una empresa inactiva', !a4.ok && a4.error === 'La empresa elegida está inactiva.');
  const m8 = memoryRepo([emp('EMP-001', '20123456789', 'Colegio Ensil')], [], {}, [alm({ id: 'ALM-001', name: 'Hecho por otra persona', status: 'Inactivo' })]);
  const a5 = await createWarehouse(m8.repo, [], [emp('EMP-001', '20123456789', 'Colegio Ensil')], { name: 'Mío', status: 'Inactivo' });
  check('Si otra persona creó ALM-001 a la vez, se reintenta con ALM-002', a5.ok && a5.value?.id === 'ALM-002' && m8.calls.filter(c => c === 'insertWarehouse').length === 2, JSON.stringify(a5));
  const wList = (await m7.repo.listWarehouses()).data!;
  const e1 = await editWarehouse(m7.repo, withCompanyNames(wList, c7), c7, 'ALM-001', { address: 'Av. Nueva 99', observations: 'Con rampa' });
  check('Editar la dirección y las observaciones guarda el cambio', e1.ok && e1.value?.address === 'Av. Nueva 99' && e1.value?.observations === 'Con rampa' && m7.alms[0].direccion === 'Av. Nueva 99');
  const e2 = await editWarehouse(m7.repo, wList, c7, 'ALM-002', { status: 'Activo' });
  check('No se activa otro almacén mientras el central siga activo', !e2.ok && /almacén central activo/.test(e2.error!));
  const e3 = await editWarehouse(m7.repo, wList, c7, 'ALM-001', { status: 'Inactivo' }, [{ branchId: 'ALM-001', stock: 40 }]);
  check('Un almacén con mercadería no se inactiva (cuando se conoce su stock)', !e3.ok && /40 unidades/.test(e3.error!) && m7.alms[0].estado === 'Activo');
  const e4 = await editWarehouse(m7.repo, wList, c7, 'ALM-001', { status: 'Inactivo' });
  check('Sin stock conocido, se inactiva', e4.ok && e4.value?.status === 'Inactivo');
  const e5 = await editWarehouse(m7.repo, (await m7.repo.listWarehouses()).data!, c7, 'ALM-002', { status: 'Activo', companyId: undefined });
  check('Y entonces el otro puede pasar a ser el central (cambio de almacén)', e5.ok && e5.value?.status === 'Activo' && m7.alms[1].empresa_id === null, JSON.stringify(e5));
  const e6 = await editWarehouse(m7.repo, wList, c7, 'ALM-001', { name: 'segundo' });
  check('No se renombra con el nombre de otro almacén', !e6.ok && e6.error === 'Ya existe un almacén con ese nombre.');
  check('Editar un almacén que no existe da un mensaje claro', (await editWarehouse(m7.repo, wList, c7, 'ALM-099', { name: 'X' })).error === 'No se encontró el almacén.');
  // Una empresa con un almacén vinculado no se elimina ni se inactiva (la lista combinada de filiales y almacenes)
  const m9 = memoryRepo([emp('EMP-001', '20123456789', 'Colegio Ensil')], [], {}, [alm({ companyId: 'EMP-001' })]);
  const c9 = (await m9.repo.listCompanies()).data!;
  const w9 = (await m9.repo.listWarehouses()).data!;
  const d9 = await removeCompany(m9.repo, c9, w9, 'EMP-001');
  check('No se elimina una empresa con un almacén vinculado', !d9.ok && /almacenes/.test(d9.error!) && m9.emps.length === 1);
  const i9 = await editCompany(m9.repo, c9, w9, 'EMP-001', { status: 'Inactivo' });
  check('Ni se inactiva', !i9.ok && /almacenes/.test(i9.error!));

  if (failed > 0) {
    console.log(`\n${failed} comprobaciones fallaron.`);
    process.exit(1);
  }
  console.log('\nTodas las comprobaciones pasaron.');
})();
