/**
 * Verificación mínima del motor de promociones (Etapa 3).
 * Ejecutar: npx tsx scripts/check-promotions.ts
 */
import type { Promotion } from '../src/context/DataContext';
import {
  buildPromotionGroups,
  distributeEqually,
  findPromotionOffers,
  prepareGroupPayment,
  suggestGroups,
  type PromoContext,
  type PromoStudent,
} from '../src/utils/promotions';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : ` -> ${detail}`}`);
  if (!ok) failed++;
};

const PRE = 'prekids', KIDS = 'kids', PROF = 'prof';
const promo: Promotion = {
  id: 'p1', code: 'PROMO-2X700', name: '2 matrículas por 700', type: 'Grupal',
  requiredStudents: 2, eligibleProgramIds: [PRE, KIDS], requiredBasePrice: 500,
  allowMultipleGroups: true, paymentTypeIds: ['contado'], totalPrice: 700, currency: 'USD',
  internalDistributionRule: 'Igualitario', branchIds: [], applyToAllBranches: true,
  startDate: '2026-01-01', endDate: '2026-12-31', status: 'Activo',
};
const ctx: PromoContext = { branchId: 'FIL-AYA', date: '2026-06-01' };
const st = (key: string, programId: string, basePrice = 500, paymentTypeId = 'contado'): PromoStudent =>
  ({ key, programId, paymentTypeId, tariffId: `t-${programId}`, basePrice, currency: 'USD' });
const offers = (ps: Promotion[], ss: PromoStudent[], c = ctx) => findPromotionOffers(ps, ss, c).length;

check('1 alumno → sin promoción', offers([promo], [st('a', KIDS)]) === 0);
check('PreKids + Kids (500 + 500) → disponible', offers([promo], [st('a', PRE), st('b', KIDS)]) === 1);
check('Kids + Kids → disponible', offers([promo], [st('a', KIDS), st('b', KIDS)]) === 1);
check('PreKids 500 + Profesional 1000 → no disponible', offers([promo], [st('a', PRE), st('b', PROF, 1000)]) === 0);
check('Mismo programa pero precio base distinto → no disponible', offers([promo], [st('a', KIDS), st('b', KIDS, 450)]) === 0);
check('Tipo de pago no permitido → no disponible', offers([promo], [st('a', KIDS, 500, 'plan6'), st('b', KIDS, 500, 'plan6')]) === 0);
check('Promoción inactiva → no disponible', offers([{ ...promo, status: 'Inactivo' }], [st('a', KIDS), st('b', KIDS)]) === 0);
check('Promoción fuera de vigencia → no disponible', offers([promo], [st('a', KIDS), st('b', KIDS)], { ...ctx, date: '2027-01-02' }) === 0);
check('Promoción aún no vigente → no disponible', offers([promo], [st('a', KIDS), st('b', KIDS)], { ...ctx, date: '2025-12-31' }) === 0);
check('Sede no incluida → no disponible',
  offers([{ ...promo, applyToAllBranches: false, branchIds: ['FIL-PIU'] }], [st('a', KIDS), st('b', KIDS)]) === 0);
check('Sede incluida → disponible',
  offers([{ ...promo, applyToAllBranches: false, branchIds: ['FIL-AYA'] }], [st('a', KIDS), st('b', KIDS)]) === 1);

// Selección entre 3 alumnos
const three = [st('a', KIDS), st('b', PRE), st('c', KIDS)];
const sel = buildPromotionGroups(promo, [['a', 'c']], three, ctx);
check('3 alumnos: seleccionar 2 forma un grupo válido', sel.ok && sel.groups.length === 1 && sel.groups[0].allocations.length === 2);
check('3 alumnos: el no seleccionado queda fuera', sel.ok && !sel.groups[0].allocations.some(a => a.studentKey === 'b'));
const wrongSize = buildPromotionGroups(promo, [['a', 'b', 'c']], three, ctx);
check('Grupo con cantidad distinta a la requerida → rechazado', !wrongSize.ok);

// Un alumno solo en un grupo
const four = [st('a', KIDS), st('b', KIDS), st('c', PRE), st('d', PRE)];
const dup = buildPromotionGroups(promo, [['a', 'b'], ['b', 'c']], four, ctx);
check('Alumno duplicado en dos grupos → rechazado', !dup.ok);
const two = buildPromotionGroups(promo, [['a', 'b'], ['c', 'd']], four, ctx);
check('4 alumnos → 2 grupos válidos si se permite', two.ok && two.groups.length === 2);
const noMulti = buildPromotionGroups({ ...promo, allowMultipleGroups: false }, [['a', 'b'], ['c', 'd']], four, ctx);
check('Varios grupos con la regla desactivada → rechazado', !noMulti.ok);
check('Sugerencia automática: 2 grupos sin repetir alumnos',
  (() => { const g = suggestGroups(promo, four, ctx); return g.length === 2 && new Set(g.flat()).size === 4; })());
check('Sugerencia respeta los alumnos ya usados',
  suggestGroups(promo, four, ctx, ['a', 'b']).flat().sort().join('') === 'cd');

// Reparto
check('Reparto 700 entre 2 = 350 / 350', JSON.stringify(distributeEqually(700, 2)) === '[350,350]');
check('Reparto 100 entre 3 suma exacta', distributeEqually(100, 3).reduce((a, b) => a + b, 0).toFixed(2) === '100.00');
check('Costo asignado por alumno = 350', sel.ok && sel.groups![0].allocations.every(a => a.amount === 350));

// Pago grupal: un solo pago con partes
if (sel.ok) {
  const parts = [
    { id: '1', currency: 'PEN' as const, amount: 1140, exchangeRate: 3.8, method: 'Yape' },      // 300 USD
    { id: '2', currency: 'USD' as const, amount: 200, method: 'Efectivo' },                       // 200 USD
    { id: '3', currency: 'USD' as const, amount: 200, method: 'Transferencia', operationNumber: '123' },
  ];
  const pay = prepareGroupPayment(sel.groups[0], parts);
  check('Pago grupal 700 USD con 3 partes → un solo pago preparado', pay.ok && pay.draft.total === 700 && pay.draft.parts.length === 3);
  check('Pago grupal cubre a ambos alumnos sin pagos individuales', pay.ok && pay.draft.studentKeys.length === 2);
  const short = prepareGroupPayment(sel.groups[0], parts.slice(0, 2));
  check('Partes que no suman el total → rechazado', !short.ok);
}

// Compatibilidad: promoción antigua con composición rígida
const legacy: Promotion = { ...promo, id: 'legacy', eligibleProgramIds: undefined, requiredBasePrice: undefined, composition: [{ programId: KIDS, quantity: 1 }, { programId: PRE, quantity: 1 }] };
check('Composición antigua: Kids + PreKids válido', buildPromotionGroups(legacy, [['a', 'b']], [st('a', KIDS), st('b', PRE)], ctx).ok);
check('Composición antigua: Kids + Kids rechazado', !buildPromotionGroups(legacy, [['a', 'b']], [st('a', KIDS), st('b', KIDS)], ctx).ok);

console.log(failed === 0 ? '\nTodo correcto.' : `\n${failed} caso(s) fallaron.`);
process.exit(failed === 0 ? 0 : 1);
