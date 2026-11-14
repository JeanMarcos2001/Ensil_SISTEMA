/**
 * Verificación del catálogo comercial en la base de datos (Lote 4): programas, niveles, tipos de pago, tarifarios, promociones y orígenes
 * de leads.
 *  - reglas puras (`utils/catalog.ts`): validación de cada tipo, eliminar lo que ya se usa, copias;
 *  - traducción de filas de la base (`utils/catalogDb.ts`) y mensajes de error;
 *  - operaciones (`services/catalog.ts`) contra un repositorio en memoria: validar → guardar, ids correlativos, reintento, eliminar;
 *  - la migración, su carga de partida y las pantallas: al día con el registro de funciones y el código.
 * Ejecutar: npx tsx scripts/check-catalog-db.ts
 */
import { readFileSync } from 'node:fs';
import { seedBranches, seedLeadSources, seedLevels, seedPaymentTypes, seedPrograms, seedPromotions, seedTariffs } from '../src/data/seedCatalog';
import { buildPeopleSeed } from '../src/data/seedPeople';
import {
  createCatalogEntry, editCatalogEntry, loadCatalog, removeCatalogEntry, type CatalogRepository,
} from '../src/services/catalog';
import type { RepoResult } from '../src/services/orgDirectory';
import {
  CATALOG_LIST, NO_LINKS, catalogDeletionError, catalogFieldErrors, copyCode, copyName, firstError, leadSourceFieldErrors, levelFieldErrors,
  paymentTypeFieldErrors, programFieldErrors, promotionFieldErrors, tariffFieldErrors,
  type CatalogContext, type CatalogData, type CatalogEntities, type CatalogKind,
} from '../src/utils/catalog';
import {
  CATALOG_TABLES, byNumericId, catalogErrorMessage, isCatalogIdConflict, leadSourceFromRow, leadSourceToRow, levelFromRow, levelToRow,
  paymentTypeFromRow, paymentTypeToRow, programFromRow, programToRow, promotionFromRow, promotionToRow, tariffFromRow, tariffToRow,
} from '../src/utils/catalogDb';
import { renderCatalogSeedSql } from '../src/utils/catalogSeedSql';
import { capabilityById } from '../src/utils/capabilities';
import { THROWS_ON_DENIAL } from '../src/utils/guards';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : ` -> ${detail}`}`);
  if (!ok) failed++;
};
const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const branches = seedBranches().map(b => ({ id: b.id, name: b.name }));
const base = (): CatalogData => ({
  programs: seedPrograms(), levels: seedLevels(), paymentTypes: seedPaymentTypes(), tariffs: seedTariffs(), promotions: seedPromotions(), leadSources: seedLeadSources(),
});
const ctxOf = (data: CatalogData = base()): CatalogContext => ({ ...data, branches });
const strip = <T extends { id: string }>(e: T): Omit<T, 'id'> => { const { id: _id, ...rest } = e; return rest; };

// ------------------------------------------------------------------------------------------------------------------ Datos de partida
const ctx0 = ctxOf();
check('Los datos de partida son 4 programas, 4 niveles, 5 tipos de pago, 8 tarifarios, 2 promociones y 5 orígenes', ctx0.programs.length === 4 && ctx0.levels.length === 4 && ctx0.paymentTypes.length === 5 && ctx0.tariffs.length === 8 && ctx0.promotions.length === 2 && ctx0.leadSources.length === 5);
check('No existe «Especialización»: el programa avanzado es solo «Profesional»', !ctx0.programs.some(p => /especializaci/i.test(p.name)) && ctx0.programs.some(p => p.name === 'Profesional'));
check('Todo registro de partida cumple las reglas de su tipo (sin errores)', (Object.keys(CATALOG_LIST) as CatalogKind[]).every(k =>
  (ctx0[CATALOG_LIST[k]] as { id: string }[]).every(e => firstError(catalogFieldErrors(k, strip(e) as never, ctx0, e.id)) === null)),
  (Object.keys(CATALOG_LIST) as CatalogKind[]).flatMap(k => (ctx0[CATALOG_LIST[k]] as { id: string }[]).map(e => firstError(catalogFieldErrors(k, strip(e) as never, ctx0, e.id)))).filter(Boolean).join(' | '));
check('Los ids son números como texto y no se repiten dentro de cada lista', (Object.keys(CATALOG_LIST) as CatalogKind[]).every(k => {
  const ids = (ctx0[CATALOG_LIST[k]] as { id: string }[]).map(e => e.id);
  return ids.every(id => /^\d{1,9}$/.test(id)) && new Set(ids).size === ids.length;
}));
check('Pre-lectura solo se ofrece en Piura y Chiclayo (sedes que existen)', (() => {
  const p = ctx0.programs.find(x => x.name === 'Pre-lectura')!;
  return !p.allBranches && p.enabledBranches!.length === 2 && p.enabledBranches!.every(id => branches.some(b => b.id === id));
})());
const people = buildPeopleSeed('2026-10-30');
check('Las matrículas de ejemplo (en memoria) apuntan a programas, niveles y tipos de pago que existen en el catálogo', people.enrollments.every(e =>
  ctx0.programs.some(p => p.id === e.programId) && (!e.levelId || ctx0.levels.some(l => l.id === e.levelId)) && ctx0.paymentTypes.some(t => t.id === e.paymentTypeId)));

// ------------------------------------------------------------------------------------------------------------------ Programas
const prog = { ...strip(ctx0.programs[0]), code: 'PRG-PLANTILLA', name: 'Plantilla' };
const pErr = (over: object, selfId?: string, c = ctx0) => firstError(programFieldErrors({ ...prog, ...over } as never, c, selfId));
check('Programa: código y nombre obligatorios', pErr({ code: ' ' }) === 'El código oficial es obligatorio.' && pErr({ name: '' }) === 'El nombre oficial es obligatorio.');
check('Programa: el código no se repite (sin importar mayúsculas ni espacios), salvo el propio', pErr({ code: ' prg-pk ' }) === 'El código oficial ya está en uso.' && pErr({ code: 'PRG-KIDS' }, '1') === null);
check('Programa: el nombre no se repite entre activos; un inactivo sí puede repetirlo', pErr({ code: 'X', name: 'kids' }) === 'El nombre oficial ya existe en el catálogo activo.' && pErr({ code: 'X', name: 'kids', status: 'Inactivo' }) === null);
check('Programa: duración entera desde 1 mes y garantía entera desde 0', !!pErr({ durationBase: 0 }) && !!pErr({ durationBase: 1.5 }) && !!pErr({ durationBase: NaN }) && pErr({ warranty: -1 }) === 'La garantía no puede ser negativa.' && !!pErr({ warranty: 2.5 }) && pErr({ warranty: 0 }) === null);
check('Programa: si no es de todas las sedes, debe tener sedes y todas deben existir', pErr({ allBranches: false, enabledBranches: [] }) === 'Debe seleccionar al menos una sede.' && pErr({ allBranches: false, enabledBranches: ['FIL-999'] }) === 'Una de las sedes elegidas no existe.' && pErr({ allBranches: false, enabledBranches: ['FIL-002'] }) === null);

// ------------------------------------------------------------------------------------------------------------------ Niveles
const lvl = { ...strip(ctx0.levels[0]) };
const lErr = (over: object, selfId?: string) => firstError(levelFieldErrors({ ...lvl, ...over } as never, ctx0, selfId));
check('Nivel: programa obligatorio, existente y con niveles', lErr({ programId: '' }) === 'Debe seleccionar un programa padre.' && lErr({ programId: '99' }) === 'El programa seleccionado no existe.' && /no está habilitado para gestionar niveles/.test(lErr({ programId: '5' }) ?? ''));
check('Nivel: nombre y código obligatorios; el código no se repite dentro del programa', lErr({ name: ' ' }) === 'El nombre del nivel es obligatorio.' && lErr({ code: '' }) === 'El código del nivel es obligatorio.' && lErr({ code: 'nvl-kids-2' }, '1') === 'Ya existe un nivel con ese código en este programa.' && lErr({ code: 'NVL-KIDS-2', programId: '2' }, '1') === null);
check('Nivel: el orden es un entero desde 1', !!lErr({ order: 0 }) && !!lErr({ order: 1.5 }) && lErr({ order: 5 }, '1') === null);

// ------------------------------------------------------------------------------------------------------------------ Tipos de pago
const pt = { ...strip(ctx0.paymentTypes[2]), code: 'TP-PLANTILLA' }; // como el Plan 3, con su propio código
const tErr = (over: object, selfId?: string) => firstError(paymentTypeFieldErrors({ ...pt, ...over } as never, ctx0, selfId));
check('Tipo de pago: código y nombre obligatorios; el código no se repite', tErr({ code: '' }) === 'El código es obligatorio.' && tErr({ name: ' ' }) === 'El nombre es obligatorio.' && tErr({ code: 'tp-cont' }) === 'El código ya está en uso.' && tErr({ code: 'TP-P3' }, '3') === null);
check('Tipo de pago: inmediato = 1 obligación; las demás modalidades, 2 o más', tErr({ scheduleMode: 'inmediato' }) === 'El pago inmediato tiene una sola obligación.' && tErr({ installments: 1 }) === 'Esta modalidad requiere al menos 2 obligaciones.' && tErr({ scheduleMode: 'inmediato', installments: 1, termDays: 0 }) === null);
check('Tipo de pago: en cuotas con intervalo, mínimo 1 día', tErr({ termDays: 0 }) === 'El intervalo entre cuotas debe ser de al menos 1 día.' && tErr({ scheduleMode: 'fechas_manuales', installments: 2, termDays: 0 }) === null);

// ------------------------------------------------------------------------------------------------------------------ Tarifarios
const tar = { ...strip(ctx0.tariffs[5]) }; // Profesional - Plan 3
const fErr = (over: object, c = ctx0) => firstError(tariffFieldErrors({ ...tar, ...over } as never, c));
check('Tarifario: nombre, programa y tipo de pago obligatorios y existentes', fErr({ name: '' }) === 'El nombre de la tarifa es obligatorio.' && fErr({ programId: '' }) === 'Debe seleccionar un programa.' && fErr({ programId: '99' }) === 'El programa seleccionado no existe.' && fErr({ paymentTypeId: '' }) === 'Debe seleccionar un tipo de pago.' && fErr({ paymentTypeId: '99' }) === 'El tipo de pago seleccionado no existe.');
const kidsContado = strip(ctx0.tariffs[0]); // programa Kids (con niveles), contado
check('Tarifario: el nivel debe ser del programa y el programa debe tener niveles', firstError(tariffFieldErrors({ ...kidsContado, levelId: '4' }, ctx0)) === 'El nivel seleccionado no pertenece al programa.'
  && fErr({ levelId: '1' }) === 'El nivel seleccionado no pertenece al programa.' && firstError(tariffFieldErrors({ ...kidsContado, levelId: '2' }, ctx0)) === null);
check('Tarifario: el desglose es obligatorio y debe tener las obligaciones del tipo de pago', fErr({ installments: [] }) === 'Genere el desglose antes de guardar.'
  && /requiere 3 obligación/.test(fErr({ installments: tar.installments.slice(0, 3) }) ?? ''));
check('Tarifario: las líneas fijas llevan monto mayor a 0 y el precio base es la suma', /monto mayor a 0/.test(fErr({ installments: tar.installments.map((l, i) => (i === 1 ? { ...l, amount: 0 } : l)) }) ?? '') && fErr({ basePrice: 999 }) === 'El precio base debe ser la suma del desglose.' && fErr({}) === null);
const tarVar = strip(ctx0.tariffs[1]); // Kids - Contado en 2 partes (montos variables)
check('Tarifario: con montos variables rige el total objetivo (mayor a 0)', firstError(tariffFieldErrors({ ...tarVar, basePrice: 0 }, ctx0)) === 'Indique el total objetivo (mayor a 0).' && firstError(tariffFieldErrors(tarVar, ctx0)) === null);
check('Tarifario: la sede debe existir ("all" = todas) y la vigencia no puede terminar antes de empezar', fErr({ branchId: 'FIL-999' }) === 'La sede elegida no existe.' && fErr({ branchId: 'FIL-002' }) === null && fErr({ startDate: '' }) === 'La fecha de inicio es obligatoria.' && fErr({ startDate: '2026-06-01', endDate: '2026-05-01' }) === 'La fecha de fin no puede ser menor a la fecha de inicio.');

// ------------------------------------------------------------------------------------------------------------------ Promociones
const promo = { ...strip(ctx0.promotions[0]), code: 'PROMO-PLANTILLA' };
const mErr = (over: object, selfId?: string) => firstError(promotionFieldErrors({ ...promo, ...over } as never, ctx0, selfId));
check('Promoción: código sin espacios y único', mErr({ code: '' }) === 'El código es obligatorio y no debe contener espacios.' && mErr({ code: 'CON ESPACIO' }) === 'El código es obligatorio y no debe contener espacios.' && mErr({ code: 'promo-2x700' }) === 'Ya existe una promoción con ese código.' && mErr({ code: 'PROMO-2X700' }, '1') === null);
check('Promoción: al menos 2 alumnos, un programa elegible y un tipo de pago, todos existentes', mErr({ requiredStudents: 1 }) === 'La cantidad de alumnos requerida debe ser mayor a 1.' && mErr({ eligibleProgramIds: [] }) === 'Seleccione al menos un programa elegible.' && mErr({ eligibleProgramIds: ['99'] }) === 'Uno de los programas elegidos no existe.' && mErr({ paymentTypeIds: [] }) === 'Debe seleccionar al menos un tipo de pago permitido.' && mErr({ paymentTypeIds: ['99'] }) === 'Uno de los tipos de pago elegidos no existe.');
check('Promoción: precio total y precio base requerido mayores a 0 (el segundo puede quedar vacío)', mErr({ totalPrice: 0 }) === 'El precio promocional total debe ser mayor a 0.' && mErr({ requiredBasePrice: 0 }) === 'El precio contado base requerido debe ser mayor a 0 (o déjelo vacío).' && mErr({ requiredBasePrice: undefined }) === null);
check('Promoción: sedes (si no es de todas) y fechas', mErr({ applyToAllBranches: false, branchIds: [] }) === 'Debe seleccionar al menos una sede o aplicar a todas.' && mErr({ applyToAllBranches: false, branchIds: ['FIL-999'] }) === 'Una de las sedes elegidas no existe.' && mErr({ applyToAllBranches: false, branchIds: ['FIL-003'] }) === null && mErr({ startDate: '2026-06-01', endDate: '2026-05-01' }) === 'La fecha de fin no puede ser menor a la fecha de inicio.' && mErr({ endDate: '' }) === null);

// ------------------------------------------------------------------------------------------------------------------ Orígenes de leads
const sErr = (name: string, selfId?: string) => firstError(leadSourceFieldErrors({ name, status: 'active' }, ctx0, selfId));
check('Origen de lead: nombre obligatorio y único (sin importar mayúsculas)', sErr(' ') === 'El nombre del origen es obligatorio.' && sErr('facebook ads') === 'Ya existe un origen con ese nombre.' && sErr('Facebook Ads', '1') === null && sErr('TikTok') === null);

// ------------------------------------------------------------------------------------------------------------------ Eliminar lo que ya se usa
const del = (kind: CatalogKind, id: string, links = NO_LINKS, data = base()) => catalogDeletionError(kind, id, data, links);
check('Programa: con niveles, tarifarios o promociones no se elimina', /tiene niveles/.test(del('program', '1') ?? '') && /tiene tarifarios/.test(del('program', '3') ?? '') && (() => {
  const d = base(); d.tariffs = []; d.levels = []; return /promociones que lo usan/.test(del('program', '5', NO_LINKS, d) ?? '');
})());
check('Programa: con matrículas o recetas (en memoria) no se elimina; sin nada, sí', (() => {
  const d = base(); d.tariffs = []; d.levels = []; d.promotions = [];
  return /matrículas o recetas/.test(del('program', '5', { ...NO_LINKS, enrollments: [{ programId: '5' }] }, d) ?? '') && /matrículas o recetas/.test(del('program', '5', { ...NO_LINKS, recipes: [{ programId: '5' }] }, d) ?? '') && del('program', '5', NO_LINKS, d) === null;
})());
check('Nivel y tipo de pago: con tarifarios, promociones o matrículas no se eliminan', (() => {
  const d = base(); d.tariffs = [];
  return /tarifarios que lo usan/.test(del('level', '1', NO_LINKS, { ...d, tariffs: [{ ...ctx0.tariffs[0], id: '99', levelId: '1' }] }) ?? '')
    && del('level', '1', NO_LINKS, d) === null
    && /matrículas o recetas/.test(del('level', '1', { ...NO_LINKS, enrollments: [{ levelId: '1' }] }, d) ?? '')
    && /tarifarios que lo usan/.test(del('paymentType', '1') ?? '')
    && /promociones que lo usan/.test(del('paymentType', '1', NO_LINKS, d) ?? '')
    && /matrículas que lo usan/.test(del('paymentType', '5', { ...NO_LINKS, enrollments: [{ paymentTypeId: '5' }] }, d) ?? '');
})());
check('Promoción: ya aplicada en matrículas no se elimina; tarifarios y orígenes se eliminan sin condiciones', /ya se aplicó en matrículas/.test(del('promotion', '1', { ...NO_LINKS, promotionGroups: [{ promotionId: '1' }] }) ?? '') && del('promotion', '1') === null && del('tariff', '1') === null && del('leadSource', '1') === null);

// ------------------------------------------------------------------------------------------------------------------ Copias
check('Copias: «(Copia)», «(Copia 2)»… y «-COPY», «-COPY-2»…', copyName('Kids', ['Kids']) === 'Kids (Copia)' && copyName('Kids', ['Kids', 'kids (copia)']) === 'Kids (Copia 2)' && copyCode('PRG-KIDS', ['PRG-KIDS']) === 'PRG-KIDS-COPY' && copyCode('PRG-KIDS', ['x', 'prg-kids-copy']) === 'PRG-KIDS-COPY-2');
check('Duplicar dos veces un programa produce códigos y nombres distintos que cumplen las reglas', (() => {
  let data = base();
  for (let i = 0; i < 2; i++) {
    const original = data.programs[0];
    const copy = { ...strip(original), name: copyName(original.name, data.programs.map(p => p.name)), code: copyCode(original.code, data.programs.map(p => p.code)) };
    if (firstError(programFieldErrors(copy, ctxOf(data)))) return false;
    data = { ...data, programs: [...data.programs, { ...copy, id: String(10 + i) }] };
  }
  return true;
})());

// ------------------------------------------------------------------------------------------------------------------ Traducción de filas
check('Programa ↔ fila: ida y vuelta sin perder nada (con y sin sedes elegidas)', ctx0.programs.every(p => same(programFromRow(programToRow(p)), p)));
check('Programa: «todas las sedes» guarda la lista de sedes vacía; vacío se guarda como nulo', programToRow({ ...ctx0.programs[0], allBranches: true, enabledBranches: ['FIL-002'], alias: '  ', description: '' }).sedes_habilitadas.length === 0 && programToRow({ ...ctx0.programs[0], alias: '  ' }).alias === null);
check('Nivel, tipo de pago y origen ↔ fila: ida y vuelta', ctx0.levels.every(l => same(levelFromRow(levelToRow(l)), l)) && ctx0.paymentTypes.every(t => same(paymentTypeFromRow(paymentTypeToRow(t)), t)) && ctx0.leadSources.every(s => same(leadSourceFromRow(leadSourceToRow(s)), s)));
check('Tarifario ↔ fila: ida y vuelta (desglose, sede «todas», vigencia abierta)', ctx0.tariffs.every(t => same(tariffFromRow(tariffToRow(t)), t)), JSON.stringify(ctx0.tariffs.filter(t => !same(tariffFromRow(tariffToRow(t)), t)).map(t => t.id)));
check('Tarifario: «all» ↔ sede nula; una sede concreta se conserva; el desglose lleva claves en español', (() => {
  const row = tariffToRow({ ...ctx0.tariffs[0], branchId: 'FIL-002' });
  return tariffToRow(ctx0.tariffs[0]).sede_id === null && tariffFromRow({ ...tariffToRow(ctx0.tariffs[0]), sede_id: 'FIL-002' }).branchId === 'FIL-002' && row.sede_id === 'FIL-002' && 'numero' in row.lineas[0] && 'concepto' in row.lineas[0];
})());
check('Tarifario: una línea sin tipo se guarda como matrícula (número 0) o cuota; los montos que llegan como texto se leen como número', (() => {
  const t = { ...ctx0.tariffs[3], installments: [{ number: 0, concept: 'M', amount: 1, dueDays: 0 }, { number: 1, concept: 'C', amount: 1, dueDays: 0 }] };
  const row = tariffToRow(t);
  return row.lineas[0].tipo === 'matricula' && row.lineas[1].tipo === 'cuota' && tariffFromRow({ ...row, precio_base: '1000.00' }).basePrice === 1000;
})());
check('Promoción ↔ fila: ida y vuelta (sin sedes, fin abierto, precio base requerido)', ctx0.promotions.every(p => same(promotionFromRow(promotionToRow(p)), p)) && (() => {
  const p = { ...ctx0.promotions[0], applyToAllBranches: false, branchIds: ['FIL-002'], endDate: '', requiredBasePrice: undefined };
  const { requiredBasePrice: _r, ...expected } = p;
  return same(promotionFromRow(promotionToRow(p)), expected);
})());
check('Los ids se ordenan como números («2» antes que «10»)', ['10', '2', '1'].map(id => ({ id })).sort(byNumericId).map(x => x.id).join() === '1,2,10');
check('Cada tipo de registro tiene su tabla', (Object.keys(CATALOG_LIST) as CatalogKind[]).every(k => !!CATALOG_TABLES[k]) && CATALOG_TABLES.program.table === 'programas' && CATALOG_TABLES.leadSource.table === 'origenes_lead');

// ------------------------------------------------------------------------------------------------------------------ Mensajes de error de la base
check('Errores de la base: los nombres de los índices únicos se traducen a mensajes claros', catalogErrorMessage({ code: '23505', message: 'duplicate key value violates unique constraint "programas_codigo_unico"' }) === 'El código oficial ya está en uso.'
  && catalogErrorMessage({ code: '23505', message: 'duplicate key value violates unique constraint "programas_nombre_activo_unico"' }) === 'El nombre oficial ya existe en el catálogo activo.'
  && catalogErrorMessage({ code: '23505', message: 'duplicate key "niveles_codigo_unico"' }) === 'Ya existe un nivel con ese código en este programa.'
  && catalogErrorMessage({ code: '23505', message: 'duplicate key "promociones_codigo_unico"' }) === 'Ya existe una promoción con ese código.'
  && catalogErrorMessage({ code: '23505', message: 'duplicate key "origenes_lead_nombre_unico"' }) === 'Ya existe un origen con ese nombre.');
check('Errores de la base: los avisos propios (EN001) se muestran tal cual y lo técnico no se muestra', catalogErrorMessage({ code: 'EN001', message: 'El nivel seleccionado no pertenece al programa.' }) === 'El nivel seleccionado no pertenece al programa.'
  && !/violates|constraint|relation/i.test(catalogErrorMessage({ code: '23503', message: 'violates foreign key constraint "x"' })) && !/violates|constraint/i.test(catalogErrorMessage({ code: '99999', message: 'violates something' })));
check('Un id repetido por dos personas que crean a la vez se reconoce (y un código repetido no)', isCatalogIdConflict({ code: '23505', message: 'duplicate key value violates unique constraint "programas_pkey"' }) && !isCatalogIdConflict({ code: '23505', message: 'duplicate key "programas_codigo_unico"' }));

// ------------------------------------------------------------------------------------------------------------------ Operaciones con un repositorio en memoria
function memoryRepo(initial: CatalogData, opts: { conflicts?: number; failInsert?: string } = {}) {
  const data: CatalogData = JSON.parse(JSON.stringify(initial));
  let conflicts = opts.conflicts ?? 0;
  const calls = { insert: 0, update: 0, remove: 0 };
  const list = (kind: CatalogKind) => data[CATALOG_LIST[kind]] as { id: string }[];
  const repo: CatalogRepository = {
    async list<K extends CatalogKind>(kind: K): Promise<RepoResult<CatalogEntities[K][]>> { return { ok: true, data: JSON.parse(JSON.stringify(list(kind))) }; },
    async insert<K extends CatalogKind>(kind: K, entity: CatalogEntities[K]): Promise<RepoResult<CatalogEntities[K]>> {
      calls.insert++;
      if (opts.failInsert) return { ok: false, error: opts.failInsert };
      if (conflicts > 0) { conflicts--; return { ok: false, error: 'id repetido', idConflict: true }; }
      if (list(kind).some(x => x.id === entity.id)) return { ok: false, error: 'id repetido', idConflict: true };
      list(kind).push(entity);
      return { ok: true, data: entity };
    },
    async update<K extends CatalogKind>(kind: K, entity: CatalogEntities[K]): Promise<RepoResult<CatalogEntities[K]>> {
      calls.update++;
      const l = list(kind); const i = l.findIndex(x => x.id === entity.id);
      if (i < 0) return { ok: false, error: 'ya no existe' };
      l[i] = entity; return { ok: true, data: entity };
    },
    async remove(kind: CatalogKind, id: string): Promise<RepoResult<null>> {
      calls.remove++;
      const l = list(kind); const i = l.findIndex(x => x.id === id);
      if (i < 0) return { ok: false, error: 'ya no existe' };
      l.splice(i, 1); return { ok: true, data: null };
    },
  };
  return { repo, data, calls };
}

async function run() {
  const m = memoryRepo(base());
  const loaded = await loadCatalog(m.repo);
  check('Cargar: trae los seis listados completos', !!loaded.ok && loaded.value!.programs.length === 4 && loaded.value!.tariffs.length === 8 && loaded.value!.leadSources.length === 5);
  const failing = await loadCatalog({ ...m.repo, list: async () => ({ ok: false, error: 'sin conexión' }) } as CatalogRepository);
  check('Cargar: si algo falla, devuelve el motivo', !failing.ok && failing.error === 'sin conexión');

  const input = { code: 'PRG-NEW', name: 'Nuevo', hasLevels: false, durationBase: 4, warranty: 2, allBranches: true, status: 'Activo' as const };
  const created = await createCatalogEntry(m.repo, 'program', ctxOf(m.data), input);
  check('Crear: asigna el siguiente número (hoy el 6, porque el 4 no existe y el 5 sí) y guarda', created.ok && created.value!.id === '6' && m.data.programs.some(p => p.id === '6'), created.error);
  const bad = await createCatalogEntry(m.repo, 'program', ctxOf(m.data), { ...input, code: 'PRG-KIDS' });
  check('Crear: si no cumple las reglas, no llega a la base', !bad.ok && bad.error === 'El código oficial ya está en uso.' && m.calls.insert === 1);
  const retry = memoryRepo(base(), { conflicts: 2 });
  const retried = await createCatalogEntry(retry.repo, 'program', ctxOf(retry.data), input);
  check('Crear: si dos personas crean a la vez (id repetido), reintenta con el siguiente', retried.ok && retry.calls.insert === 3);
  const noLuck = memoryRepo(base(), { conflicts: 9 });
  const gaveUp = await createCatalogEntry(noLuck.repo, 'program', ctxOf(noLuck.data), input);
  check('Crear: tras 3 intentos fallidos se rinde con un mensaje', !gaveUp.ok && /No se pudo asignar un código al programa/.test(gaveUp.error ?? '') && noLuck.calls.insert === 3);
  const down = memoryRepo(base(), { failInsert: 'No hay conexión con el servidor.' });
  const lost = await createCatalogEntry(down.repo, 'leadSource', ctxOf(down.data), { name: 'TikTok', status: 'active' });
  check('Crear: un error de la base se devuelve como está (ya traducido)', !lost.ok && lost.error === 'No hay conexión con el servidor.' && down.calls.insert === 1);

  const lead = await createCatalogEntry(m.repo, 'leadSource', ctxOf(m.data), { name: 'TikTok', status: 'active' });
  check('Crear un origen de lead: id correlativo y guardado', lead.ok && lead.value!.id === '6');
  const level = await createCatalogEntry(m.repo, 'level', ctxOf(m.data), { programId: '5', code: 'N1', name: 'N1', order: 1, status: 'Activo' });
  check('Crear un nivel en un programa sin niveles se rechaza antes de guardar', !level.ok && /no está habilitado para gestionar niveles/.test(level.error ?? ''));

  const edited = await editCatalogEntry(m.repo, 'program', ctxOf(m.data), '6', { name: 'Nuevo 2', durationBase: 5 });
  check('Editar: mezcla el cambio con lo guardado y guarda la fila completa', edited.ok && edited.value!.name === 'Nuevo 2' && edited.value!.code === 'PRG-NEW' && m.data.programs.find(p => p.id === '6')!.durationBase === 5);
  const own = await editCatalogEntry(m.repo, 'program', ctxOf(m.data), '1', { name: 'Kids' });
  check('Editar: dejar el mismo código o nombre no choca consigo mismo', own.ok);
  const clash = await editCatalogEntry(m.repo, 'program', ctxOf(m.data), '1', { code: 'PRG-PK' });
  check('Editar: no puede tomar el código de otro', !clash.ok && clash.error === 'El código oficial ya está en uso.');
  const missing = await editCatalogEntry(m.repo, 'tariff', ctxOf(m.data), '99', { name: 'x' });
  check('Editar: un registro que no existe devuelve un mensaje', !missing.ok && missing.error === 'No se encontró el tarifario.');
  const unset = await editCatalogEntry(m.repo, 'tariff', ctxOf(m.data), '4', { endDate: undefined });
  check('Editar: un valor «sin fecha de fin» (undefined) se aplica', unset.ok && unset.value!.endDate === undefined);
  const toggled = await editCatalogEntry(m.repo, 'promotion', ctxOf(m.data), '1', { status: 'Inactivo' });
  check('Editar: activar o desactivar cambia solo el estado', toggled.ok && toggled.value!.status === 'Inactivo' && toggled.value!.code === 'PROMO-2X700');

  const used = await removeCatalogEntry(m.repo, 'program', ctxOf(m.data), '1');
  check('Eliminar: lo que ya se usa no llega a la base', !used.ok && /tiene niveles/.test(used.error ?? '') && m.calls.remove === 0);
  const linked = await removeCatalogEntry(m.repo, 'program', ctxOf(m.data), '6', { ...NO_LINKS, enrollments: [{ programId: '6' }] });
  check('Eliminar: lo que usan las matrículas en memoria tampoco', !linked.ok && /matrículas o recetas/.test(linked.error ?? '') && m.calls.remove === 0);
  const gone = await removeCatalogEntry(m.repo, 'program', ctxOf(m.data), '6');
  check('Eliminar: lo que nadie usa se elimina', gone.ok && !m.data.programs.some(p => p.id === '6') && m.calls.remove === 1);
  const none = await removeCatalogEntry(m.repo, 'program', ctxOf(m.data), '99');
  check('Eliminar: un registro que no existe devuelve un mensaje', !none.ok && none.error === 'No se encontró el programa.');

  // -------------------------------------------------------------------------------------------------------------------- La migración, la carga y las pantallas
  const migration = read('supabase/migrations/20261107190000_catalogo_comercial.sql');
  const tables = ['programas', 'niveles', 'tipos_pago', 'tarifarios', 'promociones', 'origenes_lead'];
  check('La migración crea las 6 tablas con seguridad por filas y sin acceso para anon', tables.every(t => migration.includes(`create table public.${t}`) && migration.includes(`alter table public.${t}`) && /enable row level security/.test(migration)) && /revoke all on public\.programas/.test(migration) && !/to anon/.test(migration.replace(/from public, anon, authenticated/g, '')));
  const used2 = [...migration.matchAll(/app\.tiene_funcion\('([a-z-]+:[a-z_]+)'\)/g)].map(x => x[1]);
  check('Cada función que pide la base existe en el registro de funciones (no se desfasan)', used2.length >= 20 && used2.every(id => !!capabilityById(id)), used2.filter(id => !capabilityById(id)).join());
  check('Leer el catálogo lo puede cualquier cuenta vigente; escribir pide la función de cada pantalla', tables.every(t => new RegExp(`create policy ${t}_leer on public\\.${t} for select to authenticated using \\(\\(select app\\.acceso_vigente\\(\\)\\)\\)`).test(migration))
    && /com-programas:create/.test(migration) && /com-niveles:delete/.test(migration) && /com-tipos-pago:edit/.test(migration) && /com-tarifarios:edit/.test(migration) && /com-promociones:create/.test(migration) && /cfg-leads:delete/.test(migration));
  check('La migración tiene su archivo para deshacer', /drop table if exists public\.programas/.test(read('supabase/deshacer/20261107190000_catalogo_comercial.down.sql')) && /drop trigger if exists sedes_catalogo_eliminar/.test(read('supabase/deshacer/20261107190000_catalogo_comercial.down.sql')));

  const seedFile = read('supabase/seed/catalogo_comercial.sql');
  check('La carga de partida (supabase/seed/catalogo_comercial.sql) está al día con los datos de ejemplo', seedFile === renderCatalogSeedSql().replace(/\r\n/g, '\n'), 'ejecute: npx tsx scripts/doc-catalogo-seed.ts');
  check('La carga es repetible, todo o nada, y no incluye «Especialización»', /on conflict do nothing/.test(seedFile) && /^begin;$/m.test(seedFile) && /^commit;$/m.test(seedFile) && !/Especializaci[oó]n'/.test(seedFile.split('\n').filter(l => !l.startsWith('--')).join('\n')));

  const ctxSrc = read('src/context/DataContext.tsx');
  check('El contexto ya no guarda el catálogo en memoria: lo toma de la base con useCatalog', /const catalog = useCatalog\(catalogData, branches\)/.test(ctxSrc) && !/useState<(Program|Level|PaymentType|Tariff|Promotion|LeadSource)\[\]>/.test(ctxSrc) && !/setPrograms|setLevels|setTariffs|setPromotions|setPaymentTypes|setLeadSources/.test(ctxSrc) && !/seedPrograms|seedLevels/.test(ctxSrc));
  check('Las acciones del catálogo son asíncronas y devuelven { ok, error }', /addProgram: \(program: Omit<Program, 'id'>\) => Promise<OpResult<Program>>/.test(ctxSrc) && /deleteLeadSource: \(id: string\) => Promise<OpResult>/.test(ctxSrc) && /catalog\.remove\('program', id, catalogLinks\(\)\)/.test(ctxSrc));
  check('Eliminar mira lo que sigue en memoria (matrículas, recetas, grupos promocionales)', /enrollments, recipes, promotionGroups/.test(ctxSrc));
  check('Renombrar un programa o nivel no necesita corregir copias: el programa de una matrícula y de la agenda se deriva de su id', !/relabelFrom|syncCatalogLabels/.test(ctxSrc) && /updateProgram[\s\S]{0,300}catalog\.edit\('program'/.test(ctxSrc) && /updateLevel[\s\S]{0,300}catalog\.edit\('level'/.test(ctxSrc));
  check('Ninguna acción del catálogo queda en la lista de las que lanzan error al negar el permiso (ahora devuelven resultado)',
    !['addProgram', 'updateProgram', 'deleteProgram', 'addLevel', 'updateLevel', 'deleteLevel', 'addPaymentType', 'updatePaymentType', 'deletePaymentType', 'addTariff', 'updateTariff', 'deleteTariff', 'addPromotion', 'updatePromotion', 'deletePromotion', 'addLeadSource', 'updateLeadSource', 'deleteLeadSource'].some(a => THROWS_ON_DENIAL.has(a)));

  const gate = read('src/components/auth/AccessGate.tsx');
  check('El catálogo se lee al iniciar sesión (antes de montar el sistema), junto con roles, cuentas y sedes', /loadCatalog\(catalogRepo\)/.test(gate) && /children\(loaded\.access, account\.id, loaded\.org, loaded\.catalog, loaded\.items, loaded\.logistics, loaded\.people, loaded\.money, loaded\.cashBoxes, loaded\.collection, loaded\.agenda\)/.test(gate) && /catalog=\{catalog\}/.test(read('src/App.tsx')));
  const hook = read('src/hooks/useCatalog.ts');
  check('El gancho arranca con lo ya leído y valida contra lo último que se vio', /useCatalog\(initial: CatalogData/.test(hook) && /useState<CatalogData>\(initial\)/.test(hook) && /dataRef\.current = data/.test(hook) && !/useEffect/.test(hook));

  const pages = ['Programs', 'Levels', 'PaymentTypes', 'Tariffs', 'Promotions'].map(n => [n, read(`src/pages/commercial/${n}.tsx`)] as const);
  check('Las pantallas de Oferta comercial esperan el resultado, muestran el motivo y no repiten las reglas', pages.every(([, s]) => /async \(e: React\.FormEvent\)|async \(e\)/.test(s) || /const handleSubmit = async/.test(s))
    && pages.every(([, s]) => /useActionError/.test(s) && /role="alert"/.test(s) && /disabled=\{saving\}/.test(s))
    && pages.every(([, s]) => !/\b(updateProgram|updateLevel|updatePaymentType|updateTariff|updatePromotion|deleteProgram|deleteLevel|deletePaymentType|deleteTariff)\(row\.id[^)]*\),?\s*$/m.test(s.replace(/actionError\.run\([^\n]*\n/g, ''))),
    pages.filter(([, s]) => !/const handleSubmit = async/.test(s)).map(([n]) => n).join());
  const leads = read('src/pages/settings/LeadsConfig.tsx');
  check('Orígenes de leads: espera el resultado y muestra el motivo si falla', /useActionError/.test(leads) && /await actionError\.run\(addLeadSource/.test(leads) && /role="alert"/.test(leads));
  check('Duplicar crea nombres y códigos que no chocan (copyName / copyCode)', ['Programs', 'Levels', 'PaymentTypes', 'Tariffs'].every(n => /copyName\(/.test(read(`src/pages/commercial/${n}.tsx`))) && ['Programs', 'Levels', 'PaymentTypes'].every(n => /copyCode\(/.test(read(`src/pages/commercial/${n}.tsx`))));
  check('«Especialización» ya no queda en el código (ni en los datos ni en las métricas de sesión)', !/Especializaci[oó]n/.test(read('src/data/seedCatalog.ts').replace(/\/\/[^\n]*/g, '')) && !/Especializaci[oó]n/.test(read('src/utils/sessionMetrics.ts')));

  if (failed > 0) {
    console.log(`\n${failed} comprobaciones fallaron.`);
    process.exit(1);
  }
  console.log('\nTodas las comprobaciones pasaron.');
}

run().catch(e => { console.error(e); process.exit(1); });
