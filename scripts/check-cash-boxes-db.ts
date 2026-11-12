/**
 * Verificación de los cierres de caja y la caja chica en la base de datos (Lote 9A). **Cada sede cierra su caja y tiene su fondo de caja chica.**
 *  - reglas puras por sede (`utils/cashClosure.ts`, `utils/pettyCash.ts`, `utils/reportCash.ts`);
 *  - traducción de filas de la base (`utils/cashBoxesDb.ts`) y mensajes de error;
 *  - operaciones (`services/cashBoxes.ts`) contra un repositorio en memoria: validar → guardar, por sede;
 *  - la migración 0017, su carga de partida y el cableado (contexto, inicio de sesión y pantallas).
 * Ejecutar: npx tsx scripts/check-cash-boxes-db.ts
 */
import { readFileSync } from 'node:fs';
import type { CashClosure, CashMovement, PettyCashMovement } from '../src/context/DataContext';
import { SEED_PETTY_BRANCH, seedPettyFunds, seedPettyMovements } from '../src/data/seedPetty';
import {
  addPettyMovement, closeCashBox, fundOf, loadCashBoxes, reopenCashBox, reversePettyMovement, savePettyFund,
  type CashBoxesContext, type CashBoxesData, type CashBoxesRepository, type CloseRequest, type PettyRequest,
} from '../src/services/cashBoxes';
import type { RepoResult } from '../src/services/orgDirectory';
import { cashBoxesErrorMessage, closureFromRow, codeNumber, pettyFundFromRow, pettyMovementFromRow } from '../src/utils/cashBoxesDb';
import { renderCashBoxesSeedSql } from '../src/utils/cashBoxesSeedSql';
import { closedMessage, closedUntil, closureDrift, expectedAt, validateClosure, validateReopen } from '../src/utils/cashClosure';
import { ALL_CAPABILITIES, capabilityById } from '../src/utils/capabilities';
import { DEFAULT_FUND, PETTY_CATEGORIES, PETTY_METHODS, PETTY_REVERSAL_REASONS, MAX_AMOUNT, emptyPettyInput, ofBranch, pettyBalance, type PettyFund } from '../src/utils/pettyCash';
import { combinedFund, pettyReport } from '../src/utils/reportCash';
import { ALL_TIME } from '../src/utils/reportCommon';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : ` -> ${detail}`}`);
  if (!ok) failed++;
};
const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

const TODAY = '2026-11-12';
const mov = (id: string, branchId: string | undefined, date: string, over: Partial<CashMovement> = {}): CashMovement => ({
  id, date: `${date}T15:00:00.000Z`, kind: 'Ingreso', concept: 'c', reference: 'r', currency: 'USD', amount: 100, amountUSD: 100, method: 'Efectivo', user: 'u', status: 'Aplicado',
  ...(branchId ? { branchId } : {}), ...over,
});
const cash: CashMovement[] = [
  mov('CJ-1', 'FIL-002', '2026-11-05'), mov('CJ-2', 'FIL-002', '2026-11-06', { kind: 'Egreso', amount: 30 }), mov('CJ-3', 'FIL-003', '2026-11-06', { amount: 500 }),
  mov('CJ-4', undefined, '2026-11-06', { amount: 7 }), mov('CJ-5', 'FIL-002', '2026-11-06', { amount: 999, status: 'Reversado' }), mov('CJ-6', 'FIL-002', '2026-11-06', { currency: 'PEN', amount: 40 }),
];
const pm = (id: string, branchId: string, over: Partial<PettyCashMovement> = {}): PettyCashMovement => ({
  id, branchId, date: '2026-11-05T17:00:00.000Z', kind: 'Ingreso', category: 'Reposición de fondo', concept: 'Reposición', amount: 1000, method: 'Efectivo', user: 'Admin', status: 'Aplicado', ...over,
});
const petty: PettyCashMovement[] = [
  pm('CCH-001', 'FIL-002'), pm('CCH-002', 'FIL-002', { kind: 'Egreso', category: 'Movilidad', concept: 'Taxi', amount: 25, date: '2026-11-06T17:00:00.000Z' }),
  pm('CCH-003', 'FIL-003', { amount: 300 }), pm('CCH-004', 'FIL-003', { kind: 'Egreso', category: 'Limpieza', concept: 'Jabón', amount: 50, status: 'Reversado' }),
];
const closure = (id: string, over: Partial<CashClosure> = {}): CashClosure => ({
  id, scope: 'caja', currency: 'USD', branchId: 'FIL-002', date: '2026-11-06', expected: 70, counted: 70, difference: 0, note: '', closedAt: '2026-11-06T22:00:00.000Z', closedBy: 'u', status: 'Cerrada', ...over,
});

// ------------------------------------------------------------------------------------------------------------------ Reglas por sede
check('Saldo esperado por sede y moneda: solo lo aplicado de esa caja (Piura USD = 100 − 30; Chiclayo USD = 500; la caja general = 7; soles aparte)',
  expectedAt('caja', 'USD', '2026-11-06', cash, petty, 'FIL-002') === 70 && expectedAt('caja', 'USD', '2026-11-06', cash, petty, 'FIL-003') === 500
  && expectedAt('caja', 'USD', '2026-11-06', cash, petty) === 7 && expectedAt('caja', 'PEN', '2026-11-06', cash, petty, 'FIL-002') === 40 && expectedAt('caja', 'USD', '2026-11-05', cash, petty, 'FIL-002') === 100);
check('Saldo esperado de la caja chica: es de una sede (Piura 975, Chiclayo 300; lo reversado no cuenta)',
  expectedAt('caja-chica', 'PEN', '2026-11-06', cash, petty, 'FIL-002') === 975 && expectedAt('caja-chica', 'PEN', '2026-11-06', cash, petty, 'FIL-003') === 300 && expectedAt('caja-chica', 'PEN', '2026-11-06', cash, petty, 'FIL-009') === 0);
const closures = [closure('CIE-001'), closure('CIE-002', { branchId: undefined, date: '2026-11-04' }), closure('CIE-003', { scope: 'caja-chica', currency: 'PEN', date: '2026-11-03' })];
check('«Cerrada hasta» es de cada caja: la de Piura no cierra la de Chiclayo, ni la caja general, ni la otra moneda',
  closedUntil(closures, 'caja', 'USD', 'FIL-002') === '2026-11-06' && closedUntil(closures, 'caja', 'USD', 'FIL-003') === null && closedUntil(closures, 'caja', 'USD') === '2026-11-04'
  && closedUntil(closures, 'caja', 'PEN', 'FIL-002') === null && closedUntil(closures, 'caja-chica', 'PEN', 'FIL-002') === '2026-11-03' && closedUntil(closures, 'caja-chica', 'PEN', 'FIL-003') === null);
check('Un día cerrado bloquea solo en la caja cerrada (y dice hasta cuándo)',
  /2026-11-06/.test(closedMessage(closures, 'caja', 'USD', '2026-11-06', 'FIL-002') ?? '') && closedMessage(closures, 'caja', 'USD', '2026-11-07', 'FIL-002') === null && closedMessage(closures, 'caja', 'USD', '2026-11-06', 'FIL-003') === null);
check('Cerrar: la caja chica pide la sede; una fecha ya cerrada de ESA caja se rechaza y la de otra sede no',
  validateClosure({ scope: 'caja-chica', currency: 'PEN', date: '2026-11-04', counted: '1', note: '' }, [], 1, TODAY).some(e => /sede/.test(e))
  && validateClosure({ scope: 'caja', currency: 'USD', branchId: 'FIL-002', date: '2026-11-06', counted: '70', note: '' }, closures, 70, TODAY).some(e => /ya está cerrada hasta/.test(e))
  && validateClosure({ scope: 'caja', currency: 'USD', branchId: 'FIL-003', date: '2026-11-06', counted: '500', note: '' }, closures, 500, TODAY).length === 0
  && validateClosure({ scope: 'caja', currency: 'USD', date: '2026-11-04', counted: '7', note: '' }, closures, 7, TODAY).some(e => /ya está cerrada hasta/.test(e))
  && validateClosure({ scope: 'caja', currency: 'USD', date: '2026-11-05', counted: '7', note: '' }, closures, 7, TODAY).length === 0);
check('Reabrir: solo el último cierre de ESA caja (el de Piura no depende del de la caja general)',
  validateReopen(closures[0]!, closures, 'Error de conteo').length === 0 && validateReopen(closure('CIE-009', { date: '2026-11-01' }), [closure('CIE-009', { date: '2026-11-01' }), closures[0]!], 'Error de conteo').some(e => /último cierre/.test(e))
  && validateReopen(closures[1]!, closures, 'Error de conteo').length === 0);
check('«Desactualizado»: un cobro con fecha cubierta después del cierre cambia el saldo de ese día (por sede)',
  closureDrift(closure('CIE-001', { expected: 70 }), [...cash, mov('CJ-9', 'FIL-002', '2026-11-06', { amount: 10 })], petty) === 10 && closureDrift(closure('CIE-001', { expected: 70 }), [...cash, mov('CJ-9', 'FIL-003', '2026-11-06', { amount: 10 })], petty) === 0);
check('Caja chica: los movimientos y el saldo son de una sede', ofBranch(petty, 'FIL-002').length === 2 && pettyBalance(ofBranch(petty, 'FIL-002')) === 975 && pettyBalance(ofBranch(petty, 'FIL-003')) === 300);

const funds: Record<string, PettyFund> = { 'FIL-002': { assigned: 1000, maxExpense: 200 }, 'FIL-003': { assigned: 500, maxExpense: 100 } };
const fo = (id: string) => funds[id] ?? DEFAULT_FUND;
check('El fondo de varias sedes juntas: lo asignado se suma y el tope es el mayor', JSON.stringify(combinedFund(['FIL-002', 'FIL-003'], fo)) === JSON.stringify({ assigned: 1500, maxExpense: 200 }));
const rep = (branchId = '') => pettyReport({ pettyCashMovements: petty, cashClosures: closures, fund: fo(branchId), fundOf: fo }, ALL_TIME, branchId);
check('Reporte de caja chica de una sede: su saldo, su fondo y lo que falta reponer (Piura 1000 − 975 = 25)', rep('FIL-002').balance === 975 && rep('FIL-002').fund.assigned === 1000 && rep('FIL-002').refill === 25 && rep('FIL-002').rows.length === 2);
check('Reporte de caja chica de todas las sedes: se suma por sede (lo que sobra en una no cubre lo que falta en otra); Chiclayo 500 − 300 = 200', rep().balance === 1275 && rep().fund.assigned === 1500 && rep().refill === 225, JSON.stringify([rep().balance, rep().fund, rep().refill]));
check('Las reaperturas y los cierres del reporte de caja chica son de la sede elegida', rep('FIL-002').closures.length === 1 && rep('FIL-003').closures.length === 0);

// ------------------------------------------------------------------------------------------------------------------ Traducción de filas
check('Cierre ↔ fila: el saldo llega como texto y se lee como número; sin sede = caja general; la reapertura se lee',
  (() => {
    const a = closureFromRow({ id: 'CIE-001', ambito: 'caja', moneda: 'USD', sede_id: 'FIL-002', fecha: '2026-11-06', esperado: '70.00', contado: '65.50', diferencia: '-4.50', nota: 'Faltó un vuelto', cerrado_en: '2026-11-06T22:00:00Z', cerrado_por: 'Ana', estado: 'Reabierta', reabierto_en: '2026-11-07T10:00:00Z', reabierto_por: 'Jefe', motivo_reapertura: 'Error de conteo' });
    const b = closureFromRow({ id: 'CIE-002', ambito: 'caja', moneda: 'PEN', sede_id: null, fecha: '2026-11-06', esperado: 1, contado: 1, diferencia: 0, nota: '', cerrado_en: 'x', cerrado_por: 'Ana', estado: 'Cerrada', reabierto_en: null, reabierto_por: null, motivo_reapertura: null });
    return a.expected === 70 && a.counted === 65.5 && a.difference === -4.5 && a.branchId === 'FIL-002' && a.status === 'Reabierta' && a.reopenReason === 'Error de conteo' && a.scope === 'caja' && b.branchId === undefined && !('reopenedAt' in b);
  })());
check('Movimiento de caja chica ↔ fila: sede, monto como número, lo vacío no se inventa y la constancia de la reversa se conserva',
  (() => {
    const m = pettyMovementFromRow({ id: 'CCH-005', sede_id: 'FIL-002', fecha: '2026-11-06T17:00:00Z', tipo: 'Egreso', categoria: 'Movilidad', concepto: 'Taxi', monto: '25.00', medio: 'Efectivo', referencia: null, evidencia: null, observaciones: null, usuario: 'Ana', estado: 'Reversado', reversa: { at: 'x', by: 'Jefe', reason: 'Movimiento duplicado', detail: 'Se registró dos veces' } });
    return m.branchId === 'FIL-002' && m.amount === 25 && !('reference' in m) && m.reversal?.by === 'Jefe' && m.status === 'Reversado';
  })());
check('Fondo ↔ fila: por sede', (() => { const f = pettyFundFromRow({ sede_id: 'FIL-003', asignado: '500.00', tope: '100.00' }); return f.branchId === 'FIL-003' && f.fund.assigned === 500 && f.fund.maxExpense === 100; })());
check('El número de un código se lee bien (CCH-014 → 14)', codeNumber('CCH-014') === 14 && codeNumber('CIE-003') === 3 && codeNumber('X') === 0);
check('Errores de la base: cierre repetido y sede inexistente se traducen; lo técnico no se muestra',
  /ya está cerrada en esa fecha/.test(cashBoxesErrorMessage({ code: '23505', message: 'duplicate key "cierres_caja_vigente_unico"' })) && /ya no existe/.test(cashBoxesErrorMessage({ code: '23503', message: 'x' }))
  && cashBoxesErrorMessage({ code: 'EN001', message: 'La caja ya está cerrada hasta el 2026-11-06: elija una fecha posterior.' }) === 'La caja ya está cerrada hasta el 2026-11-06: elija una fecha posterior.' && !/violates|constraint/i.test(cashBoxesErrorMessage({ code: '99999', message: 'violates something' })));

// ------------------------------------------------------------------------------------------------------------------ Operaciones con un repositorio en memoria
function memoryRepo(initial: CashBoxesData, opts: { fail?: string } = {}) {
  const calls: { fn: string; args: unknown[] }[] = [];
  const reply = async <T>(fn: string, args: unknown[], data: T): Promise<RepoResult<T>> => { calls.push({ fn, args }); return opts.fail ? { ok: false, error: opts.fail } : { ok: true, data }; };
  const repo: CashBoxesRepository = {
    async loadAll() { return { ok: true, data: JSON.parse(JSON.stringify(initial)) as CashBoxesData }; },
    close: (r: CloseRequest) => reply('close', [r], 'CIE-010'),
    reopen: (id, reason) => reply('reopen', [id, reason], null),
    setFund: (b, a, m) => reply('setFund', [b, a, m], null),
    addPetty: (r: PettyRequest) => reply('addPetty', [r], 'CCH-010'),
    reversePetty: (id, reason, detail) => reply('reversePetty', [id, reason, detail], null),
  };
  return { repo, calls };
}
const ctx = (over: Partial<CashBoxesContext> = {}): CashBoxesContext => ({ closures, pettyMovements: petty, pettyFunds: funds, cashMovements: cash, today: TODAY, ...over });

async function run() {
  const loaded = await loadCashBoxes(memoryRepo({ closures, pettyMovements: petty, pettyFunds: funds }).repo);
  check('Cargar: trae cierres, movimientos y fondos', !!loaded.ok && loaded.value!.closures.length === 3 && loaded.value!.pettyMovements.length === 4 && Object.keys(loaded.value!.pettyFunds).length === 2);
  const failing = await loadCashBoxes({ ...memoryRepo({ closures, pettyMovements: petty, pettyFunds: funds }).repo, loadAll: async () => ({ ok: false, error: 'sin conexión' }) });
  check('Cargar: si algo falla, devuelve el motivo', !failing.ok && failing.error === 'sin conexión');
  check('Un fondo no definido usa el de partida (S/ 1 000, tope S/ 200)', JSON.stringify(fundOf({}, 'FIL-009')) === JSON.stringify(DEFAULT_FUND) && fundOf(funds, 'FIL-003').assigned === 500);

  console.log('--- Cierres');
  let m = memoryRepo({ closures, pettyMovements: petty, pettyFunds: funds });
  let r = await closeCashBox(m.repo, ctx(), { scope: 'caja', currency: 'USD', branchId: 'FIL-003', date: '2026-11-06', counted: '500', note: '' });
  check('Cerrar la caja de una sede: llega a la base con su sede y lo contado (el esperado lo calcula la base); devuelve el código', r.ok && r.value!.id === 'CIE-010'
    && JSON.stringify(m.calls[0]!.args[0]) === JSON.stringify({ scope: 'caja', currency: 'USD', branchId: 'FIL-003', date: '2026-11-06', counted: 500, note: '' }), r.error);
  m = memoryRepo({ closures, pettyMovements: petty, pettyFunds: funds });
  r = await closeCashBox(m.repo, ctx(), { scope: 'caja', currency: 'USD', branchId: 'FIL-003', date: '2026-11-06', counted: '450', note: '' });
  check('Con diferencia y sin nota no llega a la base', !r.ok && /diferencia/.test(r.error ?? '') && m.calls.length === 0);
  r = await closeCashBox(m.repo, ctx(), { scope: 'caja', currency: 'USD', branchId: 'FIL-002', date: '2026-11-06', counted: '70', note: '' });
  check('Una fecha ya cerrada de ESA caja no llega a la base', !r.ok && /ya está cerrada hasta/.test(r.error ?? '') && m.calls.length === 0);
  r = await closeCashBox(m.repo, ctx(), { scope: 'caja-chica', currency: 'PEN', date: '2026-11-06', counted: '975', note: '' });
  check('La caja chica sin sede no llega a la base', !r.ok && /sede/.test(r.error ?? '') && m.calls.length === 0);
  r = await closeCashBox(m.repo, ctx(), { scope: 'caja', currency: 'USD', date: '2026-11-06', counted: '7', note: '' });
  check('La caja general se cierra sin sede (el saldo es el de los movimientos sin sede)', !r.ok || m.calls.length === 1);
  m = memoryRepo({ closures, pettyMovements: petty, pettyFunds: funds });
  r = await closeCashBox(m.repo, ctx({ closures: [] }), { scope: 'caja-chica', currency: 'PEN', branchId: 'FIL-002', date: '2026-11-06', counted: '975', note: '' });
  check('Cerrar la caja chica de una sede', r.ok && (m.calls[0]!.args[0] as CloseRequest).branchId === 'FIL-002' && (m.calls[0]!.args[0] as CloseRequest).scope === 'caja-chica', r.error);
  const lost = memoryRepo({ closures, pettyMovements: petty, pettyFunds: funds }, { fail: 'No hay conexión con el servidor.' });
  r = await closeCashBox(lost.repo, ctx({ closures: [] }), { scope: 'caja', currency: 'USD', branchId: 'FIL-003', date: '2026-11-06', counted: '500', note: '' });
  check('Un error de la base se devuelve tal cual', !r.ok && r.error === 'No hay conexión con el servidor.');
  m = memoryRepo({ closures, pettyMovements: petty, pettyFunds: funds });
  let rr = await reopenCashBox(m.repo, ctx(), 'CIE-001', 'Error de conteo');
  check('Reabrir el último cierre con su motivo llega a la base', rr.ok && m.calls[0]!.fn === 'reopen' && m.calls[0]!.args.join() === 'CIE-001,Error de conteo', rr.error);
  rr = await reopenCashBox(m.repo, ctx(), 'CIE-001', 'abc');
  check('Un motivo corto o un cierre que no existe no llegan a la base', !rr.ok && (await reopenCashBox(m.repo, ctx(), 'CIE-099', 'Error de conteo')).error === 'No se encontró el cierre.' && m.calls.length === 1);

  console.log('--- Caja chica');
  m = memoryRepo({ closures, pettyMovements: petty, pettyFunds: funds });
  const pin = (over = {}) => ({ ...emptyPettyInput('Egreso', '2026-11-10'), category: 'Movilidad', concept: 'Taxi a notaría', amount: '25', ...over });
  let pr = await addPettyMovement(m.repo, ctx(), 'FIL-002', pin());
  check('Un gasto válido llega a la base con su sede', pr.ok && (m.calls[0]!.args[0] as PettyRequest).branchId === 'FIL-002' && (m.calls[0]!.args[0] as PettyRequest).amount === 25 && (m.calls[0]!.args[0] as PettyRequest).date === '2026-11-10', pr.error);
  m = memoryRepo({ closures, pettyMovements: petty, pettyFunds: funds });
  pr = await addPettyMovement(m.repo, ctx(), 'FIL-003', pin({ amount: '150' }));
  check('El tope por gasto es el de ESA sede (Chiclayo S/ 100): S/ 150 se rechaza, y en Piura (S/ 200) pasaría', !pr.ok && /tope/.test(pr.error ?? '') && m.calls.length === 0 && (await addPettyMovement(m.repo, ctx(), 'FIL-002', pin({ amount: '150' }))).ok);
  m = memoryRepo({ closures, pettyMovements: petty, pettyFunds: { ...funds, 'FIL-003': { assigned: 500, maxExpense: 500 } } });
  pr = await addPettyMovement(m.repo, ctx({ pettyFunds: { ...funds, 'FIL-003': { assigned: 500, maxExpense: 500 } } }), 'FIL-003', pin({ amount: '400' }));
  check('El saldo es el de ESA sede (Chiclayo tiene S/ 300): un gasto de S/ 400 se rechaza aunque Piura tenga S/ 975', !pr.ok && /supera el saldo/.test(pr.error ?? '') && m.calls.length === 0);
  m = memoryRepo({ closures, pettyMovements: petty, pettyFunds: funds });
  pr = await addPettyMovement(m.repo, ctx({ closures: [closure('CIE-003', { scope: 'caja-chica', currency: 'PEN', branchId: 'FIL-002', date: '2026-11-10' })] }), 'FIL-002', pin({ date: '2026-11-10' }));
  check('Un día cerrado de la caja chica de esa sede no admite movimientos (la de otra sede sí)', !pr.ok && /cerrada hasta/.test(pr.error ?? '') && m.calls.length === 0
    && (await addPettyMovement(m.repo, ctx({ closures: [closure('CIE-003', { scope: 'caja-chica', currency: 'PEN', branchId: 'FIL-002', date: '2026-11-10' })] }), 'FIL-003', pin({ date: '2026-11-10' }))).ok);
  pr = await addPettyMovement(m.repo, ctx(), '', pin());
  check('Sin sede no se registra', !pr.ok && /sede/.test(pr.error ?? ''));
  pr = await addPettyMovement(m.repo, ctx(), 'FIL-002', pin({ category: 'Reposición de fondo' }));
  check('La categoría debe ser del tipo del movimiento', !pr.ok && /categoría/i.test(pr.error ?? ''));
  m = memoryRepo({ closures, pettyMovements: petty, pettyFunds: funds });
  const fr = await savePettyFund(m.repo, 'FIL-003', { assigned: '800', maxExpense: '150' });
  check('Definir el fondo de una sede llega a la base', fr.ok && m.calls[0]!.fn === 'setFund' && m.calls[0]!.args.join() === 'FIL-003,800,150', fr.error);
  check('Un fondo mal armado no llega a la base (tope mayor que el fondo, sin sede)', !(await savePettyFund(m.repo, 'FIL-003', { assigned: '100', maxExpense: '200' })).ok && !(await savePettyFund(m.repo, '', { assigned: '100', maxExpense: '50' })).ok && m.calls.length === 1);
  m = memoryRepo({ closures, pettyMovements: petty, pettyFunds: funds });
  let vr = await reversePettyMovement(m.repo, ctx(), 'CCH-002', { reason: 'Movimiento duplicado', detail: 'Se registró dos veces' });
  check('Reversar un gasto llega a la base con su motivo y detalle', vr.ok && m.calls[0]!.fn === 'reversePetty' && m.calls[0]!.args.join() === 'CCH-002,Movimiento duplicado,Se registró dos veces', vr.error);
  vr = await reversePettyMovement(m.repo, ctx(), 'CCH-001', { reason: 'Movimiento duplicado', detail: 'Se registró dos veces' });
  check('Un ingreso que dejaría el saldo de SU sede en negativo no se reversa (Piura: 975 − 1000)', !vr.ok && /saldo quedaría negativo/.test(vr.error ?? '') && m.calls.length === 1);
  vr = await reversePettyMovement(m.repo, ctx({ closures: [closure('CIE-003', { scope: 'caja-chica', currency: 'PEN', branchId: 'FIL-002', date: '2026-11-06' })] }), 'CCH-002', { reason: 'Movimiento duplicado', detail: 'Se registró dos veces' });
  check('Reversar un movimiento de un día cerrado no llega a la base', !vr.ok && /cerrada hasta/.test(vr.error ?? '') && m.calls.length === 1);
  vr = await reversePettyMovement(m.repo, ctx(), 'CCH-099', { reason: 'Movimiento duplicado', detail: 'Se registró dos veces' });
  check('Un movimiento que no existe devuelve un mensaje', !vr.ok && vr.error === 'No se encontró el movimiento.');

  // ---------------------------------------------------------------------------------------------------------------- La migración, la carga y el cableado
  const migration = read('supabase/migrations/20261112100000_cierres_de_caja_y_caja_chica.sql');
  const down = read('supabase/deshacer/20261112100000_cierres_de_caja_y_caja_chica.down.sql');
  const tables = ['cierres_caja', 'caja_chica_fondos', 'caja_chica_movimientos'];
  check('La migración crea las 3 tablas con seguridad por filas y sin acceso directo (solo lectura para quien tiene sesión)', tables.every(t => migration.includes(`create table public.${t}`) && new RegExp(`alter table public\\.${t}\\s+enable row level security`).test(migration))
    && /revoke all on public\.cierres_caja, public\.caja_chica_fondos, public\.caja_chica_movimientos from public, anon, authenticated/.test(migration) && /grant select on public\.cierres_caja, public\.caja_chica_fondos, public\.caja_chica_movimientos to authenticated/.test(migration) && !/grant[^;]*(insert|update|delete)[^;]*public\.(cierres_caja|caja_chica)/.test(migration));
  const used = [...migration.matchAll(/(?:exigir|permite)\('([a-z-]+:[a-z_]+)'/g)].map(x => x[1]);
  check('Cada función que pide la base existe en el registro de funciones (cerrar, reabrir, configurar, registrar y reversar)', used.length >= 7 && used.every(id => !!capabilityById(id)) && ['op-caja:close_box', 'op-caja:reopen_box', 'op-caja-chica:count', 'op-caja-chica:reopen_box', 'op-caja-chica:config', 'op-caja-chica:reg_movement', 'op-caja-chica:reverse_movement'].every(id => used.includes(id)), used.filter(id => !capabilityById(id)).join());
  const readers = (entity: string) => ALL_CAPABILITIES.filter(c => (c as { reads?: string[] }).reads?.includes(entity)).map(c => c.id).sort().join();
  const listOf = (fn: string) => { const x = new RegExp(`function app\\.${fn}\\(\\)[\\s\\S]*?array\\[([^\\]]*)\\]`).exec(migration); return (x?.[1]!.match(/'([a-z-]+:[a-z_]+)'/g) ?? []).map(s => s.slice(1, -1)).sort().join(); };
  check('Quién lee los cierres y la caja chica son exactamente las funciones que, en el registro, leen eso', listOf('puede_leer_cierres') === readers('cashClosure') && listOf('puede_leer_caja_chica') === readers('pettyCash'), `${listOf('puede_leer_cierres')} ≠ ${readers('cashClosure')} | ${listOf('puede_leer_caja_chica')} ≠ ${readers('pettyCash')}`);
  check('Se ve por sede (la caja general, quien alcanza todas) y con la función que lee cada cosa', /app\.ve_sede_o_general\(sede_id\)/.test(migration) && /app\.puede_leer_cierres\(\)/.test(migration) && /on public\.caja_chica_movimientos for select[\s\S]*?app\.ve_sede\(sede_id\)/.test(migration));
  const sqlList = (re: RegExp) => [...(re.exec(migration)?.[1] ?? '').matchAll(/'([^']+)'/g)].map(x => x[1]).join('|');
  check('Las categorías, los medios y los motivos de la base son los del sistema (no se desfasan)',
    sqlList(/when 'Egreso' then p_categoria in \(([^)]*)\)/) === PETTY_CATEGORIES.Egreso.join('|') && sqlList(/else p_categoria in \(([^)]*)\) end\)/) === PETTY_CATEGORIES.Ingreso.join('|')
    && sqlList(/p_medio not in \(([^)]*)\)/) === PETTY_METHODS.join('|') && sqlList(/p_motivo not in \((.*?)\) then/) === PETTY_REVERSAL_REASONS.join('|'));
  check('El fondo de partida y el máximo de un monto son los del sistema (S/ 1 000 y tope S/ 200; hasta S/ 100 000)', /coalesce\(\(select f\.tope from public\.caja_chica_fondos f where f\.sede_id = p_sede\), 200\)/.test(migration) && DEFAULT_FUND.maxExpense === 200 && DEFAULT_FUND.assigned === 1000
    && new RegExp(`<= ${MAX_AMOUNT}`).test(migration.replace(/100000/g, String(MAX_AMOUNT))) && migration.includes('p_monto > 100000') && MAX_AMOUNT === 100000);
  check('Los cierres y la caja chica no se borran ni se cambian (salvo reabrir y reversar), ni se vacían', /create trigger cierres_no_cambian before update or delete/.test(migration) && /create trigger caja_chica_no_cambia before update or delete/.test(migration) && /before truncate on public\.cierres_caja/.test(migration) && /before truncate on public\.caja_chica_movimientos/.test(migration));
  check('Un día cerrado no admite movimientos a mano (sin pago asociado, ni su reversa), pero los cobros sí; el saldo esperado lo calcula la base', /create trigger movimientos_respetan_cierre before insert or update on public\.movimientos_caja/.test(migration) && /v_mov\.pago_id is not null then return new/.test(migration) && /app\.saldo_caja_hasta\(p_ambito, p_moneda, p_sede, p_fecha\)/.test(migration) && /Hay una diferencia entre lo contado y el sistema/.test(migration));
  check('Solo se reabre el último cierre de la caja, con motivo; hay un solo cierre vigente por caja y fecha', /Solo se puede reabrir el último cierre de la caja/.test(migration) && /create unique index cierres_caja_vigente_unico[\s\S]*?where estado = 'Cerrada'/.test(migration));
  check('Hay script para deshacer', tables.every(t => new RegExp(`drop table if exists public\\.${t}`).test(down)) && /drop trigger if exists movimientos_respetan_cierre/.test(down) && /drop function if exists public\.cerrar_caja/.test(down));
  check('La migración NO toca la función del dinero del Lote 8 (el bloqueo va en un disparador propio)', !/aplicar_cambios_matricula/.test(migration.replace(/--.*$/gm, '')));

  const seedFile = read('supabase/seed/caja_chica_de_ejemplo.sql');
  check('La carga de partida (supabase/seed/caja_chica_de_ejemplo.sql) está al día con los datos de ejemplo', seedFile === renderCashBoxesSeedSql().replace(/\r\n/g, '\n'), 'ejecute: npx tsx scripts/doc-caja-chica-seed.ts');
  check('La carga trae el fondo de Piura y los 3 movimientos de ejemplo (de esa sede), y es repetible', seedPettyFunds().length === 1 && seedPettyFunds()[0]!.branchId === SEED_PETTY_BRANCH && seedPettyMovements('2026-11-10').length === 3 && seedPettyMovements('2026-11-10').every(x => x.branchId === SEED_PETTY_BRANCH) && /on conflict do nothing/.test(seedFile) && /^begin;$/m.test(seedFile) && /^commit;$/m.test(seedFile));

  const ctxSrc = read('src/context/DataContext.tsx');
  check('El contexto ya no guarda cierres ni caja chica en memoria: usa los de la base (useCashBoxes)', /const cashBoxes = useCashBoxes\(cashBoxesData, cashMovements\)/.test(ctxSrc) && !/setCashClosures|setPettyCashMovements|setPettyFund/.test(ctxSrc) && /cashBoxes: cashBoxesData/.test(ctxSrc));
  check('Las acciones de cierres y caja chica son asíncronas y la caja chica es de una sede', /closeCash: \(input: ClosureInput\) => Promise<StockResult>/.test(ctxSrc) && /reopenCash: \(closureId: string, reason: string\) => Promise<StockResult>/.test(ctxSrc)
    && /addPettyCashMovement: \(branchId: string, input: PettyInput\) => Promise<StockResult>/.test(ctxSrc) && /updatePettyFund: \(branchId: string, fund: \{ assigned: string; maxExpense: string \}\) => Promise<StockResult>/.test(ctxSrc) && /pettyFundOf: \(branchId: string\) => PettyFund/.test(ctxSrc));
  check('Venta, reversa y depósito respetan el cierre de SU sede', /closedMessage\(cashClosures, 'caja', input\.currency, todayLocalISO\(\), input\.branchId\)/.test(ctxSrc) && /closedMessage\(cashClosures, 'caja', movement\.currency, localDateOf\(movement\.date\), movement\.branchId\)/.test(ctxSrc));
  const gate = read('src/components/auth/AccessGate.tsx');
  check('Los cierres y la caja chica se leen al iniciar sesión (antes de montar el sistema)', /loadCashBoxes\(cashBoxesRepo\)/.test(gate) && /loaded\.money, loaded\.cashBoxes\)/.test(gate) && /cashBoxes=\{cashBoxes\}/.test(read('src/App.tsx')));
  const hook = read('src/hooks/useCashBoxes.ts');
  check('El gancho arranca con lo ya leído, valida contra lo último que se vio y vuelve a leer después de cada operación', /useCashBoxes\(initial: CashBoxesData/.test(hook) && /useState<CashClosure\[\]>\(initial\.closures\)/.test(hook) && /closuresRef\.current = closures/.test(hook) && /if \(res\.ok\) await refresh\(\)/.test(hook));
  const modal = read('src/components/cash/CloseCashModal.tsx');
  const closuresPage = read('src/pages/system/Closures.tsx');
  const pettyPage = read('src/pages/PettyCash.tsx');
  check('Las pantallas piden la sede y esperan el resultado (no se guarda dos veces): el cierre elige la sede (caja general solo para quien alcanza todas), Cierres filtra y muestra la sede, Caja chica es de la sede que se ve',
    /Caja general \(sin sede\)/.test(modal) && /canGeneral = scope === 'caja' && sessionScope\.allBranches/.test(modal) && /await closeCash\(\{ scope, currency, branchId: target/.test(modal) && /disabled=\{saving\}/.test(modal)
    && /branchName\(c\.branchId\)/.test(closuresPage) && /await reopenCash\(/.test(closuresPage) && /ofBranch\(allPetty, branchId\)/.test(pettyPage) && /await addPettyCashMovement\(branchId, form\)/.test(pettyPage) && /await updatePettyFund\(branchId, fundForm\)/.test(pettyPage) && /await reversePettyCashMovement\(/.test(pettyPage));

  if (failed > 0) { console.log(`\n${failed} comprobaciones fallaron.`); process.exit(1); }
  console.log('\nTodas las comprobaciones pasaron.');
}
void run();
