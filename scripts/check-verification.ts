/**
 * Verificación de las reglas de Verificación de entrega.
 * Ejecutar: npx tsx scripts/check-verification.ts
 */
import type { Item, Plan, Recipe, StockItem } from '../src/context/DataContext';
import {
  availableComponents,
  canSplitKit,
  checkPaymentGate,
  computeVerification,
  findShortage,
  initialModes,
  pendingDeductions,
} from '../src/utils/verification';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : ` -> ${detail}`}`);
  if (!ok) failed++;
};

// ---------------------------------------------------------------- Condición de pago
const inst = (name: string, balance: number, status: string, variable = false) => ({ id: name, name, amount: 100, balance, dueDate: '', status, payments: [], variable });
const plan = (id: string, mat: string, installments: any[], balance: number, type = 'Plan'): Plan =>
  ({ id, mat, titular: 'T', type, total: 100, balance, next: '-', status: 'Al día', installments });
const enr = (id: string) => ({ id, planId: undefined as string | undefined });

check('Contado cobrado en la matrícula (sin cuotas, saldo 0) → puede verificar',
  checkPaymentGate(enr('M1'), [plan('P1', 'M1', [], 0, 'Contado')]).ok);
check('Contado sin cobrar (saldo > 0) → bloqueado', !checkPaymentGate(enr('M1'), [plan('P1', 'M1', [], 100, 'Contado')]).ok);
check('Plan con la primera cuota pagada → puede verificar',
  checkPaymentGate(enr('M2'), [plan('P2', 'M2', [inst('Cuota 1', 0, 'Pagada'), inst('Cuota 2', 100, 'Pendiente')], 100)]).ok);
const unpaid = checkPaymentGate(enr('M3'), [plan('P3', 'M3', [inst('Cuota 1', 100, 'Pendiente'), inst('Cuota 2', 100, 'Pendiente')], 200)]);
check('Plan sin ninguna cuota pagada → bloqueado con advertencia', !unpaid.ok && /primer pago/i.test(unpaid.reason!), unpaid.reason);
check('Parcial en la primera cuota (saldo > 0) → bloqueado',
  !checkPaymentGate(enr('M4'), [plan('P4', 'M4', [inst('Cuota 1', 40, 'Parcial')], 40)]).ok);
check('Contado en 2 partes: Parte 1 sin cobrar → bloqueado',
  !checkPaymentGate(enr('M5'), [plan('P5', 'M5', [inst('Parte 1', 500, 'Pendiente', true), inst('Parte 2 (saldo)', 0, 'Pendiente', true)], 500, 'Contado en 2 partes')]).ok);
check('Contado en 2 partes: Parte 1 cobrada → puede verificar',
  checkPaymentGate(enr('M5'), [plan('P5', 'M5', [inst('Parte 1', 0, 'Pagada', true), inst('Parte 2 (saldo)', 250, 'Pendiente', true)], 250, 'Contado en 2 partes')]).ok);
check('Matrícula sin plan → bloqueada', !checkPaymentGate(enr('MX'), []).ok);
check('Se enlaza por planId cuando existe', checkPaymentGate({ id: 'otro', planId: 'P1' }, [plan('P1', 'M1', [], 0)]).ok);

// ---------------------------------------------------------------- Entrega y estado automático
const mk = (o: Partial<Item> & { id: string; name: string }): Item =>
  ({ status: 'Activo', type: 'Libro', description: '', unit: 'U', cost: 1, isSold: false, isDeliveredOnEnrollment: true, isPackage: false, allowUnpacking: false, ...o } as Item);
const libro = mk({ id: 'LIB', name: 'Libro' });
const kit = mk({ id: 'KIT', name: 'Kit bienvenida', type: 'Paquete / kit logístico', isPackage: true, allowUnpacking: true,
  composition: [{ itemId: 'MOCH', name: 'Mochila', quantity: 1 }, { itemId: 'CART', name: 'Cartuchera', quantity: 2 }] });
const sellado = mk({ id: 'PACK8', name: 'Paquete 8 libros', type: 'Paquete / kit logístico', isPackage: true, allowUnpacking: false,
  composition: [{ itemId: 'L1', name: 'Libro 1', quantity: 1 }] });
const items = [libro, kit, sellado, mk({ id: 'MOCH', name: 'Mochila' }), mk({ id: 'CART', name: 'Cartuchera' })];
const recipe: Recipe = {
  id: 'R', name: 'Receta', programId: 'p', branchIds: [], applyToAllBranches: true, status: 'Activo', startDate: '2026-01-01',
  items: [{ itemId: 'LIB', quantity: 1 }, { itemId: 'KIT', quantity: 1 }],
};

check('Kit con desempaquetado permite entregar por componentes', canSplitKit(kit));
check('Paquete sellado NO se divide desde Verificación', !canSplitKit(sellado));

let v = computeVerification(recipe, items, {}, {});
check('Nada marcado → Incompleta', !v.complete && v.status === 'Verificado Incompleto' && v.delivered === 0);
v = computeVerification(recipe, items, { LIB: true }, {});
check('Solo el libro → Incompleta (1 de 2)', !v.complete && v.delivered === 1 && v.total === 2);
v = computeVerification(recipe, items, { LIB: true, KIT: true }, {});
check('Libro + kit completo → Completa automáticamente', v.complete && v.status === 'Verificado Completo');
check('Kit completo: se registra el kit (no sus componentes)', v.deliveredIds.join() === 'LIB,KIT');

const split = { KIT: 'componentes' as const };
v = computeVerification(recipe, items, { LIB: true, MOCH: true }, split);
check('Por componentes con uno solo marcado → Incompleta', !v.complete && v.deliveredIds.join() === 'LIB,MOCH');
v = computeVerification(recipe, items, { LIB: true, MOCH: true, CART: true }, split);
check('Por componentes con todos marcados → Completa', v.complete && v.deliveredIds.join() === 'LIB,MOCH,CART');
v = computeVerification(recipe, items, { LIB: true, KIT: true, MOCH: true }, split);
check('En modo componentes la marca del kit no cuenta', v.deliveredIds.join() === 'LIB,MOCH' && !v.complete);

// ---------------------------------------------------------------- Salidas de stock
let d = pendingDeductions(recipe, items, ['LIB', 'KIT'], [], {});
check('Kit completo descuenta 1 unidad del kit', JSON.stringify(d) === JSON.stringify([{ itemId: 'LIB', quantity: 1 }, { itemId: 'KIT', quantity: 1 }]));
d = pendingDeductions(recipe, items, ['LIB', 'MOCH', 'CART'], [], split);
check('Por componentes descuenta cada componente (1 mochila, 2 cartucheras)',
  JSON.stringify(d) === JSON.stringify([{ itemId: 'LIB', quantity: 1 }, { itemId: 'MOCH', quantity: 1 }, { itemId: 'CART', quantity: 2 }]));
d = pendingDeductions(recipe, items, ['LIB', 'MOCH', 'CART'], ['LIB', 'MOCH'], split);
check('Lo ya entregado antes no se vuelve a descontar', JSON.stringify(d) === JSON.stringify([{ itemId: 'CART', quantity: 2 }]));

const stock: StockItem[] = [
  { id: 's1', itemId: 'LIB', branchId: 'B', stock: 5, minStock: 0 },
  { id: 's2', itemId: 'KIT', branchId: 'B', stock: 0, minStock: 0 },
  { id: 's3', itemId: 'MOCH', branchId: 'B', stock: 3, minStock: 0 },
  { id: 's4', itemId: 'CART', branchId: 'B', stock: 1, minStock: 0 },
];
check('Sin stock del kit se detecta', findShortage(stock, 'B', [{ itemId: 'KIT', quantity: 1 }], items) === 'Kit bienvenida');
check('Con stock no hay faltante', findShortage(stock, 'B', [{ itemId: 'LIB', quantity: 1 }, { itemId: 'MOCH', quantity: 1 }], items) === null);
check('Sin stock del kit se sugieren los componentes con stock (solo la mochila alcanza)',
  availableComponents(stock, 'B', { itemId: 'KIT', quantity: 1 }, kit).map(c => c.itemId).join() === 'MOCH');

// ---------------------------------------------------------------- Modo inicial en re-verificaciones
check('Sin entregas previas el kit empieza completo', initialModes(recipe, items, []).KIT === 'kit');
check('Si ya se entregaron componentes sueltos, sigue por componentes', initialModes(recipe, items, ['MOCH']).KIT === 'componentes');
check('Si ya se entregó el kit, sigue como kit', initialModes(recipe, items, ['KIT']).KIT === 'kit');

console.log(failed === 0 ? '\nTodo correcto.' : `\n${failed} caso(s) fallaron.`);
process.exit(failed === 0 ? 0 : 1);
