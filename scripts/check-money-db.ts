/**
 * Verificación de Matrículas y dinero en la base de datos (Lote 8):
 *  - traducción filas ↔ modelo (matrículas, planes con sus cuotas, pagos, caja, notas de crédito y grupos): ida y vuelta con los datos de ejemplo,
 *    y lo derivable no se guarda (los nombres del alumno, programa, nivel, sede, asesor, origen, tipo de pago y tarifario salen de sus ids);
 *  - el comparador `diffMoney`: solo viajan las filas nuevas (marcadas) y las columnas que cambiaron; no se pueden quitar registros;
 *  - las operaciones (con un repositorio en memoria): comparan, aplican UNA vez, vuelven a leer lo tocado y devuelven el motivo si algo falla;
 *  - la carga de partida (`supabase/seed/matriculas_de_ejemplo.sql`) está al día;
 *  - el cableado: las acciones de la base existen y piden las funciones del registro, las listas de quién lee coinciden con el registro, las tablas
 *    no se escriben directo, y el contexto ya no guarda matrículas, planes, pagos ni caja en memoria: cada acción las entrega a la base con la
 *    acción que le corresponde.
 * Lo que hace la base (todo o nada, quién ve por sede, lo que no se cambia, los invariantes del dinero y el stock en la misma operación) se prueba
 * aparte contra una copia de la base (cobrar, reversar, refinanciar, mora, caja, venta, matricular, caída y reactivación, con rechazos por rol y sede).
 * Ejecutar: npx tsx scripts/check-money-db.ts
 */
import { readFileSync } from 'node:fs';
import { buildPeopleSeed } from '../src/data/seedPeople';
import { ALL_CAPABILITIES, capabilityById } from '../src/utils/capabilities';
import { capabilitiesOfAction, THROWS_ON_DENIAL } from '../src/utils/guards';
import {
  diffMoney, emptyMoneyRows, enrollmentFromRow, enrollmentToRow, mergeMoneyRows, mergeRows, MONEY_ACTIONS, moneyErrorMessage, moneyRowsFromState, moneyStateFromRows,
  numberOfCode, paymentBranchOf, sortMoneyState, type EnrollmentLists, type MoneyRows, type MoneyState, type StockOp,
} from '../src/utils/moneyDb';
import { renderMoneySeedSql } from '../src/utils/moneySeedSql';
import { SEED_REFERENCE_DAY } from '../src/utils/peopleSeedSql';
import { seedBranches, seedLeadSources, seedLevels, seedPaymentTypes, seedPrograms, seedTariffs } from '../src/data/seedCatalog';
import { applyMoney, loadMoney, type MoneyRepository } from '../src/services/money';
import type { RepoResult } from '../src/services/orgDirectory';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : ` -> ${detail}`}`);
  if (!ok) failed++;
};
const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

const seed = buildPeopleSeed(SEED_REFERENCE_DAY);
const lists: EnrollmentLists = {
  students: seed.students, programs: seedPrograms(), levels: seedLevels(), branches: seedBranches(), staff: [], leadSources: seedLeadSources(),
  paymentTypes: seedPaymentTypes(), tariffs: seedTariffs(),
};
const world = (): MoneyState => structuredClone({
  enrollments: seed.enrollments, plans: seed.plans, payments: seed.payments, cashMovements: seed.cashMovements, creditNotes: [], promotionGroups: [],
});

/** Sin claves vacías ni falsas, con las claves en orden: lo que no es información no cuenta al comparar. */
const norm = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(norm);
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>)
      .filter(([, x]) => x !== undefined && x !== null && x !== false && x !== '' && !(Array.isArray(x) && x.length === 0))
      .sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, x]) => [k, norm(x)]));
  }
  return v;
};
const same = (a: unknown, b: unknown) => JSON.stringify(norm(a)) === JSON.stringify(norm(b));

// ------------------------------------------------------------------------------------------------------------------ Traducción
const w = world();
// Con quién y cuándo (como en la carga de partida): con sesión los pone la base y vuelven al leer
const rows = moneyRowsFromState(w, true);
const back = moneyStateFromRows(rows, lists);
check('Los planes y sus cuotas vuelven iguales de las filas', same(back.plans, w.plans));
check('Los pagos vuelven iguales (con su sede de cobro)', same(back.payments.map(p => ({ ...p, branchId: undefined })), w.payments.map(p => ({ ...p, branchId: undefined }))) && back.payments.every(p => !!p.branchId));
check('Los movimientos de caja vuelven iguales', same(back.cashMovements, w.cashMovements));
// El nombre del origen sale de su id: las matrículas de ejemplo tenían copias desactualizadas (decían «Referido» con el id de «Orgánico»)
check('Las matrículas vuelven iguales (el asesor solo se muestra si es personal de la base; el origen sale del id)',
  same(back.enrollments.map(e => ({ ...e, planId: undefined })), w.enrollments.map(e => ({ ...e, asesor: undefined, planId: undefined, origen: lists.leadSources.find(l => l.id === e.origenId)?.name }))));
check('Cada matrícula sabe su plan (sale del plan, no se guarda en la matrícula)', back.enrollments.every(e => e.planId === back.plans.find(p => p.mat === e.id)?.id) && !('plan_id' in rows.matriculas[0]));
check('Lo derivable no se guarda: la matrícula no lleva nombres (alumno, programa, nivel, sede, asesor, origen, tipo de pago ni tarifario)',
  !Object.keys(rows.matriculas[0]).some(k => /nombre|^student|^program$|^level$|^sede$|^asesor$|^origen$/.test(k)) && rows.matriculas[0].alumno_id === 'ALU-001');
check('Los nombres se derivan de los ids al leer (alumno, programa, nivel, sede, tipo de pago)',
  back.enrollments[0].student === seed.students[0].name && back.enrollments[0].program === 'Kids' && back.enrollments[0].sede === 'Piura' && back.enrollments[0].paymentTypeName === 'Plan 6');
const renamed = enrollmentFromRow(rows.matriculas[0], undefined, { ...lists, programs: [{ id: '1', name: 'Kids Plus' }] });
check('Si un programa cambia de nombre, la matrícula lo muestra al instante (no queda una copia vieja)', renamed.program === 'Kids Plus');
check('Un nivel sin nombre se muestra «Sin nivel»', enrollmentFromRow({ ...rows.matriculas[0], nivel_id: null }, undefined, lists).level === 'Sin nivel');
check('La cuota «Vencida» no la escribe nadie: viaja como el estado que se le dio (el cálculo lo hace la pantalla con la fecha)', rows.planes.every(p => (p.cuotas ?? []).every(c => ['Pendiente', 'Parcial', 'Pagada', 'Vencida', 'Anulada', 'Refinanciada'].includes(c.estado))));
check('Las cuotas viajan dentro del plan, en orden', rows.planes.every(p => (p.cuotas ?? []).every((c, i) => c.orden === i + 1)));
check('La fecha de un movimiento vuelve como el sistema la guarda (ISO con milisegundos), aunque la API la entregue con +00:00',
  moneyStateFromRows({ ...rows, movimientos: [{ ...rows.movimientos[0], fecha: '2026-09-21T15:30:00+00:00' }] }, lists).cashMovements[0].date === '2026-09-21T15:30:00.000Z');
check('Los códigos se ordenan por su número', numberOfCode('PAG-010') === 10 && numberOfCode('MAT-2026-003') === 3);
const sorted = sortMoneyState(w);
check('Pagos y caja se muestran del más nuevo al más antiguo; matrículas y planes, por código', sorted.payments[0].id === 'PAG-010' && sorted.cashMovements[0].id === 'CJ-011' && sorted.enrollments[0].id === 'MAT-2026-001' && sorted.plans[0].id === 'PLN-001');
check('La sede de un pago es la que trae o la de su primera matrícula', paymentBranchOf({ ...w.payments[0], branchId: undefined }, w.enrollments) === w.enrollments[0].branchId && paymentBranchOf({ ...w.payments[0], branchId: 'FIL-009' }, w.enrollments) === 'FIL-009');
check('La fila de una matrícula con quién y cuándo (para la carga de partida) lleva su autor; sin eso, no (con sesión lo pone la base)',
  enrollmentToRow(w.enrollments[0], true).creado_por === w.enrollments[0].createdBy && !('creado_por' in enrollmentToRow(w.enrollments[0])));

// ------------------------------------------------------------------------------------------------------------------ Comparador
const noChange = diffMoney(w, { ...w });
check('Sin cambios no hay nada que guardar', noChange.empty && noChange.payload.pagos.length === 0);
check('Un cambio de solo referencia (una copia igual) tampoco manda nada', diffMoney(w, structuredClone(w)).empty);
{
  const after = { ...w, enrollments: w.enrollments.map(e => (e.id === 'MAT-2026-005' ? { ...e, extensionEnabledAt: '2026-11-10T10:00:00.000Z', extensionEnabledBy: 'Ana' } : e)) };
  const d = diffMoney(w, after);
  check('Una fila que cambió manda su código y SOLO las columnas que cambiaron (y no va marcada como nueva)',
    d.payload.matriculas.length === 1 && Object.keys(d.payload.matriculas[0]).sort().join() === 'extension_en,extension_por,id' && !('_nueva' in d.payload.matriculas[0]) && d.touched.matriculas.join() === 'MAT-2026-005');
}
{
  const nuevo = { ...w.payments[0], id: 'PAG-011' };
  const d = diffMoney(w, { ...w, payments: [nuevo, ...w.payments] });
  check('Una fila nueva viaja completa y marcada como nueva', d.payload.pagos.length === 1 && d.payload.pagos[0]._nueva === true && d.payload.pagos[0].id === 'PAG-011' && 'monto' in d.payload.pagos[0] && 'partes' in d.payload.pagos[0] && d.touched.pagos.join() === 'PAG-011');
  check('Lo que no se tocó no viaja', d.payload.matriculas.length === 0 && d.payload.planes.length === 0 && d.payload.movimientos.length === 0);
}
{
  const plan = w.plans.find(p => p.id === 'PLN-001')!;
  const after = { ...w, plans: w.plans.map(p => (p.id === 'PLN-001' ? { ...plan, installments: plan.installments.map((i, k) => (k === 0 ? { ...i, note: 'x' } : i)) } : p)) };
  const d = diffMoney(w, after);
  check('Si cambia una cuota, el plan manda sus cuotas completas (la base las reemplaza) y no las columnas del plan que no cambiaron', d.payload.planes.length === 1 && Array.isArray(d.payload.planes[0].cuotas) && !('saldo' in d.payload.planes[0]) && (d.payload.planes[0].cuotas as unknown[]).length === plan.installments.length);
}
{
  const d = diffMoney(w, { ...w, payments: w.payments.slice(1) });
  check('Quitar un registro es un error (ninguna acción borra pagos, caja ni matrículas)', !!d.error && /quitar/.test(d.error));
}
{
  const stock: StockOp[] = [{ op: 'vender', sede: 'FIL-002', articulo: 'SKU-1', cantidad: 1, documento: 'B001-1', observacion: 'x' }];
  const d = diffMoney(w, { ...w }, stock);
  check('Una acción que solo mueve stock (sin otros cambios) sí se manda, con su movimiento', !d.empty && d.payload.stock?.length === 1);
}
{
  const grp = { id: 'PGR-001', promotionId: '1', currency: 'USD' as const, totalPrice: 600, allocations: [{ studentKey: 'k', enrollmentId: 'MAT-2026-001', amount: 600 }], paymentId: 'PAG-001' };
  const d = diffMoney(w, { ...w, promotionGroups: [grp] });
  check('Los grupos promocionales viajan con su reparto', d.payload.grupos.length === 1 && Array.isArray(d.payload.grupos[0].reparto));
}
check('mergeRows reemplaza las filas leídas de nuevo y agrega las nuevas, sin tocar el resto', (() => {
  const a = [{ id: 'A', v: 1 }, { id: 'B', v: 2 }];
  const m = mergeRows(a, [{ id: 'B', v: 9 }, { id: 'C', v: 3 }]);
  return m.map(x => `${x.id}${x.v}`).join() === 'A1,B9,C3' && mergeRows(a, []) === a;
})());

// ------------------------------------------------------------------------------------------------------------------ Mensajes de error
check('Los avisos propios de la base (EN001) se muestran tal cual', moneyErrorMessage({ code: 'EN001', message: 'Su rol no puede cobrar.' }) === 'Su rol no puede cobrar.');
check('Un código repetido o un permiso negado se explican sin texto técnico',
  /al mismo tiempo/.test(moneyErrorMessage({ code: '23505', message: 'duplicate key' })) && /permiso/.test(moneyErrorMessage({ code: '42501', message: 'permission denied' })) && !/duplicate|violates/.test(moneyErrorMessage({ code: '23503', message: 'violates foreign key' })));

// ------------------------------------------------------------------------------------------------------------------ Operaciones con un repositorio en memoria
function memoryRepo(initial: MoneyRows) {
  const calls: { fn: string; args?: unknown }[] = [];
  let db = structuredClone(initial);
  const apply: { fail?: string; failFetch?: boolean } = {};
  const repo: MoneyRepository = {
    async list(): Promise<RepoResult<MoneyRows>> { calls.push({ fn: 'list' }); return { ok: true, data: structuredClone(db) }; },
    async fetch(t): Promise<RepoResult<MoneyRows>> {
      calls.push({ fn: 'fetch', args: t });
      if (apply.failFetch) return { ok: false, error: 'sin conexión' };
      return {
        ok: true,
        data: {
          matriculas: db.matriculas.filter(r => t.matriculas.includes(r.id)), planes: db.planes.filter(r => t.planes.includes(r.id)), pagos: db.pagos.filter(r => t.pagos.includes(r.id)),
          movimientos: db.movimientos.filter(r => t.movimientos.includes(r.id)), notas: db.notas.filter(r => t.notas.includes(r.id)), grupos: db.grupos.filter(r => t.grupos.includes(r.id)),
        },
      };
    },
    async apply(action, payload): Promise<RepoResult<null>> {
      calls.push({ fn: 'apply', args: { action, payload } });
      if (apply.fail) return { ok: false, error: apply.fail };
      // «La base»: agrega las filas nuevas y cambia las columnas que vienen
      const put = <R extends { id: string }>(list: R[], news: Record<string, unknown>[]) => {
        for (const row of news) {
          const { _nueva, ...rest } = row;
          const at = list.findIndex(x => x.id === row.id);
          if (_nueva) list.push(rest as unknown as R); else if (at >= 0) Object.assign(list[at], rest);
        }
      };
      put(db.matriculas, payload.matriculas); put(db.planes, payload.planes); put(db.pagos, payload.pagos); put(db.movimientos, payload.movimientos);
      put(db.notas, payload.notas); put(db.grupos, payload.grupos);
      return { ok: true, data: null };
    },
  };
  return { repo, calls, apply, db: () => db };
}

{
  const m = memoryRepo(rows);
  const loaded = await loadMoney(m.repo);
  check('Cargar: trae todo el dinero de una vez', !!loaded.ok && loaded.value!.matriculas.length === 5 && loaded.value!.pagos.length === 10 && loaded.value!.movimientos.length === 11);
  const after = { ...w, payments: [{ ...w.payments[0], id: 'PAG-011' }, ...w.payments] };
  const r = await applyMoney(m.repo, 'cobrar', w, after);
  check('Guardar: compara, aplica UNA vez, vuelve a leer lo tocado y devuelve lo que quedó',
    !!r.ok && m.calls.filter(c => c.fn === 'apply').length === 1 && m.calls.at(-1)?.fn === 'fetch' && r.value!.fresh.pagos.length === 1 && r.value!.fresh.pagos[0].id === 'PAG-011');
  check('Guardar manda la acción que corresponde', (m.calls.find(c => c.fn === 'apply')!.args as { action: string }).action === 'cobrar');
}
{
  const m = memoryRepo(rows);
  const r = await applyMoney(m.repo, 'cobrar', w, { ...w });
  check('Sin cambios no se llama a la base', !!r.ok && m.calls.length === 0);
}
{
  const m = memoryRepo(rows); m.apply.fail = 'Su rol no puede registrar pagos.';
  const r = await applyMoney(m.repo, 'cobrar', w, { ...w, payments: [{ ...w.payments[0], id: 'PAG-011' }, ...w.payments] });
  check('Si la base rechaza, se devuelve el motivo y no se vuelve a leer nada', !r.ok && r.error === 'Su rol no puede registrar pagos.' && !m.calls.some(c => c.fn === 'fetch'));
}
{
  const m = memoryRepo(rows); m.apply.failFetch = true;
  const r = await applyMoney(m.repo, 'cobrar', w, { ...w, payments: [{ ...w.payments[0], id: 'PAG-011' }, ...w.payments] });
  check('Si se guardó pero no se pudo volver a leer, lo dice (no finge que no pasó nada)', !r.ok && /se guardó/i.test(r.error ?? ''));
}
{
  const m = memoryRepo(rows);
  const r = await applyMoney(m.repo, 'cobrar', w, { ...w, payments: w.payments.slice(1) });
  check('Quitar registros se rechaza antes de llamar a la base', !r.ok && !m.calls.some(c => c.fn === 'apply'));
}
check('Dos fusiones seguidas dejan el mismo resultado que una lectura completa', (() => {
  const fresh: MoneyRows = { ...emptyMoneyRows(), pagos: [rows.pagos[0]] };
  const m = mergeMoneyRows(mergeMoneyRows(emptyMoneyRows(), fresh), fresh);
  return m.pagos.length === 1;
})());

// ------------------------------------------------------------------------------------------------------------------ Carga de partida
const seedFile = read('supabase/seed/matriculas_de_ejemplo.sql');
check('La carga de partida está al día (se genera con npx tsx scripts/doc-matriculas-seed.ts)', renderMoneySeedSql() === seedFile);
check('La carga trae las 5 matrículas, sus 5 planes, los 10 pagos y los 11 movimientos de ejemplo, en un orden que respeta las claves foráneas',
  ['matriculas', 'planes', 'cuotas', 'pagos', 'movimientos_caja'].every(t => new RegExp(`insert into public\\.${t} `).test(seedFile))
  && seedFile.indexOf('insert into public.matriculas') < seedFile.indexOf('insert into public.planes') && seedFile.indexOf('insert into public.planes') < seedFile.indexOf('insert into public.cuotas')
  && seedFile.indexOf('insert into public.pagos') < seedFile.indexOf('insert into public.movimientos_caja') && (seedFile.match(/\('PAG-0\d\d'/g) ?? []).length === 10);
check('La carga es repetible (no pisa nada) y no lleva datos de personas ni de stock', (seedFile.match(/on conflict do nothing/g) ?? []).length === 5 && !/insert into public\.(alumnos|titulares|stock|kardex)/.test(seedFile));

// ------------------------------------------------------------------------------------------------------------------ Cableado
const migration = read('supabase/migrations/20261110140000_matriculas_y_dinero.sql');
const down = read('supabase/deshacer/20261110140000_matriculas_y_dinero.down.sql');
const repoSrc = read('src/services/moneyRepository.ts');
const tables = ['matriculas', 'planes', 'cuotas', 'pagos', 'movimientos_caja', 'notas_credito', 'grupos_promocionales'];
check('Las tablas que lee el repositorio existen en la migración', tables.every(t => new RegExp(`create table public\\.${t} \\(`).test(migration)) && ['matriculas', 'planes', 'pagos', 'movimientos_caja', 'notas_credito', 'grupos_promocionales'].every(t => repoSrc.includes(`'${t}'`)));
check('La función de la base que llama el repositorio existe en la migración', /rpc\('aplicar_cambios_matricula'/.test(repoSrc) && /create function public\.aplicar_cambios_matricula\(p_accion text, p jsonb\)/.test(migration));
check('Nadie escribe las tablas directo: solo se leen (y la escritura pasa por la función); el repositorio tampoco las escribe',
  /grant select on public\.grupos_promocionales, public\.matriculas, public\.planes, public\.cuotas, public\.pagos, public\.movimientos_caja, public\.notas_credito\s+to authenticated/.test(migration)
  && !/grant (insert|update|delete)/.test(migration) && !/\.from\('[a-z_]+'\)\s*\.(insert|update|upsert|delete)/.test(repoSrc));

const block = /create function app\.acciones_dinero\(\)[\s\S]*?select '(\{[\s\S]*?\})'::jsonb;/.exec(migration)?.[1] ?? '{}';
const config = JSON.parse(block) as Record<string, { mensaje: string; funciones: string[]; tablas: Record<string, string>; extra?: Record<string, string>; stock?: string[]; mov_nuevo?: string }>;
check('Las acciones de la base son exactamente las que conoce el cliente', Object.keys(config).sort().join() === [...MONEY_ACTIONS].sort().join(), `${Object.keys(config).sort().join()} ≠ ${[...MONEY_ACTIONS].sort().join()}`);
const allFns = [...new Set(Object.values(config).flatMap(c => [...c.funciones, ...Object.values(c.extra ?? {})]))];
check('Las funciones del registro que piden las acciones existen', allFns.length >= 15 && allFns.every(id => !!capabilityById(id)), allFns.filter(id => !capabilityById(id)).join());
const sameSet = (a: string[], b: string[]) => [...a].sort().join() === [...b].sort().join();
const direct: [string, string][] = [
  ['cobrar', 'registerPayment'], ['refinanciar', 'refinanceInstallment'], ['mora', 'chargeMora'], ['reversar_movimiento', 'reverseCashMovement'], ['deposito', 'createDepositBatch'],
  ['venta', 'registerItemSale'], ['caida', 'resolveEnrollmentDrop'], ['corregir', 'updateEnrollmentData'], ['extension', 'enableExtension'], ['documentos', 'generateEnrollmentDocument'],
  ['verificacion', 'updateEnrollmentVerification'],
];
check('Cada acción de la base pide la misma función que el contexto pide a la pantalla (una sola fuente: el registro)',
  direct.every(([a, ctx]) => sameSet(config[a].funciones, capabilitiesOfAction(ctx))), direct.filter(([a, ctx]) => !sameSet(config[a].funciones, capabilitiesOfAction(ctx))).map(([a, ctx]) => `${a}: ${config[a].funciones} ≠ ${capabilitiesOfAction(ctx)}`).join(' | '));
check('Matricular pide crear o renovar; reversar un pago, «Reversar pago» (y las notas, «Nota de crédito»); ingreso y egreso de caja, cada una la suya',
  sameSet(config.matricular.funciones, ['op-matriculas:create', 'op-matriculas:renew']) && sameSet(config.reversar_pago.funciones, ['op-pagos:reverse_payment']) && config.reversar_pago.extra?.notas === 'op-pagos:credit_note'
  && sameSet(config.ingreso_caja.funciones, ['op-caja:reg_income']) && sameSet(config.egreso_caja.funciones, ['op-caja:reg_expense']));
check('Reactivar, cambiar de programa y trasladar piden cada una su función de aprobar (y el contexto pide cualquiera de las tres a la pantalla)',
  sameSet([...config.reactivacion.funciones, ...config.cambio_programa.funciones, ...config.traslado.funciones], capabilitiesOfAction('resolveChangeRequest')));
check('Cada acción solo toca las tablas que le corresponden: cobrar no toca matrículas; refinanciar, mora y traslado no tocan pagos ni caja; caja no toca planes',
  !config.cobrar.tablas.matriculas && !config.refinanciar.tablas.pagos && !config.refinanciar.tablas.movimientos && !config.mora.tablas.pagos && !config.traslado.tablas.planes
  && !config.ingreso_caja.tablas.planes && !config.deposito.tablas.planes && !config.corregir.tablas.planes && !config.corregir.tablas.pagos);
check('Los pagos, los movimientos y las notas solo se agregan; lo único que se cambia es la anulación de un pago, la reversa de un movimiento y su lote de depósito',
  Object.values(config).every(c => !c.tablas.pagos?.includes('u') || /reversar_pago/.test(Object.keys(config).find(k => config[k] === c) ?? '')) && Object.values(config).every(c => !c.tablas.notas?.includes('u')));
check('El stock solo lo piden la venta (vender), la reversa de un movimiento (reponer) y la verificación (entregar)',
  sameSet(config.venta.stock ?? [], ['vender']) && sameSet(config.reversar_movimiento.stock ?? [], ['reponer']) && sameSet(config.verificacion.stock ?? [], ['entregar']) && Object.entries(config).every(([k, c]) => !c.stock || ['venta', 'reversar_movimiento', 'verificacion'].includes(k)));
check('Cada acción que agrega movimientos de caja dice de qué tipo (un ingreso no se cuela por la acción de egresos)',
  Object.entries(config).filter(([, c]) => c.tablas.movimientos?.includes('i')).every(([, c]) => c.mov_nuevo === 'Ingreso' || c.mov_nuevo === 'Egreso') && config.egreso_caja.mov_nuevo === 'Egreso' && config.ingreso_caja.mov_nuevo === 'Ingreso');

const readers = (entity: string) => ALL_CAPABILITIES.filter(c => (c as { reads?: string[] }).reads?.includes(entity)).map(c => c.id).sort().join();
const listOf = (fn: string) => {
  const m = new RegExp(`function app\\.${fn}\\(\\)[\\s\\S]*?array\\[([^\\]]*)\\]`).exec(migration);
  return (m?.[1].match(/'([a-z-]+:[a-z_]+)'/g) ?? []).map(x => x.slice(1, -1)).sort().join();
};
const readerPairs: [string, string][] = [['puede_leer_matriculas', 'enrollment'], ['puede_leer_planes', 'plan'], ['puede_leer_cuotas', 'installment'], ['puede_leer_pagos', 'payment'], ['puede_leer_caja', 'cashMovement']];
check('Quién lee matrículas, planes, cuotas, pagos y caja son exactamente las funciones que, en el registro, leen eso (si se agrega una, la lista de la base se actualiza)',
  readerPairs.every(([fn, entity]) => listOf(fn) === readers(entity)), readerPairs.filter(([fn, entity]) => listOf(fn) !== readers(entity)).map(([fn, entity]) => `${fn}: ${listOf(fn)} ≠ ${readers(entity)}`).join(' | '));
check('Se ve por sede: matrículas, pagos, caja y planes dependen de la sede, y los alumnos y titulares también', /app\.ve_sede\(sede_id\)/.test(migration) && /app\.ve_alumno\(id\)/.test(migration) && /app\.ve_titular\(id\)/.test(migration) && /app\.ve_sede_o_general\(sede_id\)/.test(migration));
check('Los pagos, los movimientos de caja y las notas de crédito no se borran ni se cambian (salvo la anulación y la reversa), ni se vacían',
  /create trigger pagos_no_cambian before update or delete/.test(migration) && /create trigger movimientos_no_cambian before update or delete/.test(migration) && /create trigger notas_no_cambian before update or delete/.test(migration) && /before truncate on public\.pagos/.test(migration));
check('La base vuelve a comprobar el dinero: saldo de cuota, saldo del plan, partes del pago, reversa y notas', /create function app\.verificar_dinero/.test(migration) && /perform app\.verificar_dinero\(/.test(migration));
check('Cada cuota abierta cuadra: saldo = monto − cobrado; y una anulada o refinanciada puede tener saldo 0', /r\.estado not in \('Anulada', 'Refinanciada'\) and abs\(r\.saldo - \(r\.monto - r\.cobrado\)\) > 0\.011/.test(migration));
check('Hay script para deshacer', tables.every(t => new RegExp(`drop table if exists public\\.${t}`).test(down)) && /drop function if exists public\.aplicar_cambios_matricula/.test(down) && /create policy alumnos_leer/.test(down));

// ------------------------------------------------------------------------------------------------------------------ Contexto y pantallas
const ctxSrc = read('src/context/DataContext.tsx');
check('El contexto ya no guarda matrículas, planes, pagos, caja, notas ni grupos en memoria: usa los de la base (useMoney)',
  !/setEnrollments|setPlans\(|setPayments|setCashMovements|setCreditNotes|setPromotionGroups/.test(ctxSrc) && /const money = useMoney\(moneyData/.test(ctxSrc) && /const \{ enrollments, plans, payments, cashMovements, creditNotes, promotionGroups \} = money/.test(ctxSrc));
const actionUsed = (a: string) => new RegExp(`saveMoney\\('${a}'`).test(ctxSrc);
check('Cada acción del dinero se guarda con la acción de la base que le corresponde',
  ['matricular', 'cobrar', 'refinanciar', 'mora', 'reversar_pago', 'reversar_movimiento', 'deposito', 'venta', 'caida', 'reactivacion', 'cambio_programa', 'traslado', 'corregir', 'extension', 'documentos', 'verificacion'].every(actionUsed)
  && /saveMoney\(m\.kind === 'Egreso' \? 'egreso_caja' : 'ingreso_caja', d\)/.test(ctxSrc), ['matricular', 'cobrar', 'refinanciar', 'mora', 'reversar_pago', 'reversar_movimiento', 'deposito', 'venta', 'caida', 'reactivacion', 'cambio_programa', 'traslado', 'corregir', 'extension', 'documentos', 'verificacion'].filter(a => !actionUsed(a)).join());
check('Venta, reversa de una venta y entrega de materiales mueven el stock en la MISMA llamada que guarda el dinero (no hay dos pasos que puedan quedar a medias)',
  /op: 'vender'/.test(ctxSrc) && /op: 'reponer'/.test(ctxSrc) && /op: 'entregar'/.test(ctxSrc) && !/log\.sellFromStock|log\.restockReversedSale|log\.deliverFromStock/.test(ctxSrc) && /\(\) => log\.refreshStock\(\)/.test(ctxSrc));
check('Cada acción valida con las reglas puras ANTES de llamar a la base y no se guarda nada si falla (el estado nuevo solo se entrega al final)',
  ctxSrc.indexOf("validatePaymentInput({ parts: input.parts") < ctxSrc.indexOf("saveMoney('cobrar'") && ctxSrc.indexOf('validateReversal(payment, input, ctx)') < ctxSrc.indexOf("saveMoney('reversar_pago'") && ctxSrc.indexOf('validateRefinance(plan, installmentId') < ctxSrc.indexOf("saveMoney('refinanciar'"));
check('En una aprobación (caída, reactivación, cambio de programa, traslado) lo de la agenda y las solicitudes se aplica solo DESPUÉS de que la base guardó',
  ctxSrc.indexOf("saveMoney('caida', d)") < ctxSrc.indexOf("Cancelada por la caída de la matrícula") && ctxSrc.indexOf("saveMoney('traslado', d)") < ctxSrc.indexOf('Cancelada por el traslado de sede')
  && ctxSrc.indexOf("saveMoney('reactivacion', d)") < ctxSrc.indexOf("log('reactivation'"));
check('Matricular guarda matrícula, plan, pago, caja y grupo juntos y avisa que las personas ya se guardaron si eso falla',
  /d\.promotionGroups = \[\.\.\.d\.promotionGroups, \.\.\.b\.promotionGroups\]/.test(ctxSrc) && /Las personas se guardaron, pero no se pudo matricular: \$\{saved\.error\}/.test(ctxSrc));
check('Reversar un pago guarda el plan, el pago anulado, la nota de crédito y la caja en UNA operación', /d\.creditNotes = \[note, \.\.\.d\.creditNotes\]/.test(ctxSrc) && (ctxSrc.match(/saveMoney\('reversar_pago'/g) ?? []).length === 1);
check('Un depósito lleva la sede de los ingresos que se depositan (si vienen de una sola)', /sedes\.length === 1 && sedes\[0\] \? \{ branchId: sedes\[0\] \}/.test(ctxSrc));
const iface = ctxSrc.slice(ctxSrc.indexOf('interface DataContextType'), ctxSrc.indexOf('export const DataContext ='));
const asyncActions = ['addCashMovement', 'createDepositBatch', 'reverseCashMovement', 'registerItemSale', 'registerEnrollments', 'registerPayment', 'refinanceInstallment', 'chargeMora', 'reversePayment',
  'resolveEnrollmentDrop', 'resolveChangeRequest', 'updateEnrollmentData', 'enableExtension', 'generateEnrollmentDocument', 'registerDocumentSignature', 'updateEnrollmentVerification'];
check('Las acciones del dinero son asíncronas y devuelven { ok, error }', asyncActions.every(a => new RegExp(`\\n  ${a}: .*=> Promise<`).test(iface) || new RegExp(`\\n  ${a}: \\([^)]*\\) => Promise<`).test(iface) || new RegExp(`\\n  ${a}: \\([\\s\\S]*?\\) => Promise<`).test(iface)), asyncActions.filter(a => !new RegExp(`\\n  ${a}: [\\s\\S]*?=> Promise<`).test(iface)).join());
check('Esas acciones no están entre las que lanzan error al negar el permiso (devuelven resultado)', asyncActions.every(a => !THROWS_ON_DENIAL.has(a)));

const gate = read('src/components/auth/AccessGate.tsx');
check('Las matrículas y el dinero se leen de la base al iniciar sesión, junto con lo demás', /loadMoney\(moneyRepo\)/.test(gate) && /loaded\.people, loaded\.money, loaded\.cashBoxes\)/.test(gate) && /money=\{money\}/.test(read('src/App.tsx')) && /money: moneyData/.test(ctxSrc));
const awaits = (file: string, re: RegExp) => re.test(read(file));
check('Las pantallas esperan la respuesta de la base antes de seguir y apagan el botón mientras guardan',
  awaits('src/components/payments/RegisterPaymentModal.tsx', /await registerPayment\(/) && awaits('src/components/payments/RegisterPaymentModal.tsx', /disabled=\{saving\}/)
  && awaits('src/components/payments/ReversePaymentModal.tsx', /await data\.reversePayment\(/) && awaits('src/components/payments/ReversePaymentModal.tsx', /disabled=\{saving\}/)
  && awaits('src/components/cash/DepositBatchModal.tsx', /await createDepositBatch\(/) && awaits('src/components/cash/DepositBatchModal.tsx', /saving/)
  && awaits('src/pages/Cash.tsx', /await addCashMovement\(/) && awaits('src/pages/Cash.tsx', /savingExpense/)
  && awaits('src/pages/Plans.tsx', /await refinanceInstallment\(/) && awaits('src/pages/Plans.tsx', /await chargeMora\(/)
  && awaits('src/components/enrollment/ResolveDropModal.tsx', /await data\.resolveEnrollmentDrop\(/) && awaits('src/components/enrollment/ResolveChangeModal.tsx', /await data\.resolveChangeRequest\(/)
  && awaits('src/components/enrollment/EditEnrollmentModal.tsx', /await data\.updateEnrollmentData\(/) && awaits('src/components/enrollment/EnrollmentDocumentsPanel.tsx', /await data\.generateEnrollmentDocument\(/)
  && awaits('src/components/enrollment/EnrollmentDocumentsPanel.tsx', /await data\.registerDocumentSignature\(/) && awaits('src/components/enrollment/EnrollmentFichaModal.tsx', /await data\.enableExtension\(/)
  && awaits('src/pages/Enrollments.tsx', /await enableExtension\(/));
check('El hook guarda el estado de la base y entrega un borrador; si algo falla el estado no cambia', /export function useMoney/.test(read('src/hooks/useMoney.ts')) && /const draft = useCallback/.test(read('src/hooks/useMoney.ts')) && /if \(!res\.ok \|\| !res\.value\) return \{ ok: false, error: res\.error \}/.test(read('src/hooks/useMoney.ts')));

if (failed > 0) {
  console.log(`\n${failed} comprobaciones fallaron.`);
  process.exit(1);
}
console.log('\nTodo en verde.');
