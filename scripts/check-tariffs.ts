/**
 * Verificación mínima de las reglas de Tarifario y cronogramas (Etapa 2).
 * Ejecutar: npx tsx scripts/check-tariffs.ts
 * No requiere framework de pruebas. Sale con código 1 si algún caso falla.
 */
import type { PaymentType, Tariff } from '../src/context/DataContext';
import {
  addDays,
  buildPlanInstallments,
  generateBreakdown,
  getAvailablePaymentTypes,
  resolveScheduleMode,
  sumBreakdown,
  sumPaymentParts,
  tariffTotal,
} from '../src/utils/tariffs';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : ` -> ${detail}`}`);
  if (!ok) failed++;
};

const pt = (id: string, name: string, installments: number, scheduleMode: PaymentType['scheduleMode'], termDays = 30): PaymentType => ({
  id, code: id, name, installments, termDays, scheduleMode, status: 'Activo',
});
const PT = {
  contado: pt('contado', 'Contado', 1, 'inmediato', 0),
  c2p: pt('c2p', 'Contado en 2 partes', 2, 'fechas_manuales'),
  p3: pt('p3', 'Plan 3', 3, 'intervalo_fijo'),
  p6: pt('p6', 'Plan 6', 6, 'intervalo_fijo'),
  p9: pt('p9', 'Plan 9', 9, 'intervalo_fijo'),
};

const mkTariff = (id: string, programId: string, type: PaymentType, extra: Partial<Tariff> & { amount?: number; enrollment?: number } = {}): Tariff => {
  const lines = generateBreakdown({
    mode: resolveScheduleMode(type), count: type.installments, intervalDays: type.termDays || 30,
    amount: extra.amount ?? 0, enrollmentAmount: extra.enrollment,
  });
  return {
    id, name: id, programId, paymentTypeId: type.id, branchId: 'all', currency: 'USD',
    basePrice: extra.basePrice ?? sumBreakdown(lines), installments: lines,
    startDate: '2026-01-01', endDate: '2026-12-31', status: 'Activo', ...extra,
  } as Tariff;
};

// --- Profesional Plan 3 / 6 / 9 (matrícula + cuotas, 30 días exactos) ---
const t3 = mkTariff('prof-p3', 'prof', PT.p3, { amount: 300, enrollment: 300 });
check('Profesional Plan 3: total 1200', tariffTotal(t3) === 1200, String(tariffTotal(t3)));
check('Plan 3: líneas Matrícula, C1 (día 0), C2 (día 30), C3 (día 60)',
  JSON.stringify(t3.installments.map(l => [l.concept, l.dueDays])) === JSON.stringify([['Matrícula', 0], ['Cuota 1', 0], ['Cuota 2', 30], ['Cuota 3', 60]]));

const t6 = mkTariff('prof-p6', 'prof', PT.p6, { amount: 200, enrollment: 200 });
check('Profesional Plan 6: total 1400', tariffTotal(t6) === 1400, String(tariffTotal(t6)));
check('Plan 6: última cuota al día 150', t6.installments[t6.installments.length - 1].dueDays === 150);

const t9 = mkTariff('prof-p9', 'prof', PT.p9, { amount: 150, enrollment: 150 });
check('Profesional Plan 9: total 1500', tariffTotal(t9) === 1500, String(tariffTotal(t9)));

// --- 30 días exactos (no «mismo día del mes siguiente») ---
const sched = buildPlanInstallments(t3, '2026-01-31');
check('Fechas: 31-ene + 30 = 02-mar (30 días exactos)', sched[2].dueDateISO === '2026-03-02', sched[2].dueDateISO);
check('addDays cruza fin de año', addDays('2026-12-15', 30) === '2027-01-14');

// --- Contado ---
const tc = mkTariff('kids-contado', 'kids', PT.contado, { amount: 500 });
check('Contado: una obligación inmediata', tc.installments.length === 1 && tc.installments[0].dueDays === 0);
check('Contado: total 500', tariffTotal(tc) === 500);

// --- Contado en 2 partes ---
const t2 = mkTariff('kids-c2p', 'kids', PT.c2p, { basePrice: 500 });
check('Contado en 2 partes: 2 obligaciones variables', t2.installments.length === 2 && t2.installments.every(l => l.variable));
check('Contado en 2 partes: total objetivo 500 (no se suman líneas)', tariffTotal(t2) === 500);
const plan2 = buildPlanInstallments(t2, '2026-03-01');
check('Plan 2 partes: parte 1 con tope = total, parte 2 en 0 hasta cobrar', plan2[0].amount === 500 && plan2[1].amount === 0);

// --- Disponibilidad ---
const allTypes = Object.values(PT);
const ctx = { programId: 'kids', branchId: 'FIL-PIU', date: '2026-06-01' };
const names = (r: ReturnType<typeof getAvailablePaymentTypes>) => r.map(x => x.paymentType.id).sort().join(',');

check('Solo aparecen tipos con tarifario vigente', names(getAvailablePaymentTypes([tc, t2], allTypes, ctx)) === 'c2p,contado');
check('Sin tarifario para el programa: no aparece nada', names(getAvailablePaymentTypes([t3], allTypes, ctx)) === '');
check('Tarifario inactivo no disponible', names(getAvailablePaymentTypes([{ ...tc, status: 'Inactivo' }], allTypes, ctx)) === '');
check('Tarifario fuera de vigencia no disponible', names(getAvailablePaymentTypes([tc], allTypes, { ...ctx, date: '2027-02-01' })) === '');
check('Tarifario aún no vigente no disponible', names(getAvailablePaymentTypes([tc], allTypes, { ...ctx, date: '2025-12-31' })) === '');
check('Tarifario con nivel solo aplica a ese nivel',
  names(getAvailablePaymentTypes([{ ...tc, levelId: 'L2' }], allTypes, { ...ctx, levelId: 'L1' })) === '' &&
  names(getAvailablePaymentTypes([{ ...tc, levelId: 'L2' }], allTypes, { ...ctx, levelId: 'L2' })) === 'contado');
check('Tarifario de otra sede no aplica', names(getAvailablePaymentTypes([{ ...tc, branchId: 'FIL-CHI' }], allTypes, ctx)) === '');

// --- Partes de un pago contado (no son cuotas) ---
const parts = [
  { id: 'a', currency: 'PEN' as const, amount: 1900, exchangeRate: 3.8, method: 'Yape' },
  { id: 'b', currency: 'USD' as const, amount: 0, method: 'Efectivo' },
  { id: 'c', currency: 'USD' as const, amount: 0, method: 'Transferencia' },
];
check('Partes: 1900 PEN a TC 3.8 = USD 500', sumPaymentParts(parts, 'USD') === 500, String(sumPaymentParts(parts, 'USD')));
check('Partes en PEN sin TC → inválido (null)', sumPaymentParts([{ id: 'x', currency: 'PEN', amount: 100, method: 'Yape' }], 'USD') === null);
check('Un tarifario contado sigue siendo UNA obligación aunque tenga varias partes', tc.installments.length === 1 && parts.length === 3);

console.log(failed === 0 ? '\nTodo correcto.' : `\n${failed} caso(s) fallaron.`);
process.exit(failed === 0 ? 0 : 1);
