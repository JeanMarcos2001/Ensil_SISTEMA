/**
 * Verificación de las reglas de Verificación de entrega.
 * Ejecutar: npx tsx scripts/check-verification.ts
 */
import { readFileSync } from 'node:fs';
import type { Item, Plan, Recipe, StockItem, Installment } from '../src/context/DataContext';
import type { InstallmentStatus } from '../src/utils/statuses';
import {
  availableComponents,
  canSplitKit,
  checkPaymentGate,
  computeVerification,
  findShortage,
  initialModes,
  noStockAtAll,
  pendingDeductions,
  pendingNames,
} from '../src/utils/verification';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : ` -> ${detail}`}`);
  if (!ok) failed++;
};

// ---------------------------------------------------------------- Condición de pago
const inst = (name: string, balance: number, status: InstallmentStatus, variable = false): Installment => ({ id: name, name, amount: 100, balance, dueDateISO: '', status, payments: [], variable });
const plan = (id: string, mat: string, installments: any[], balance: number, type = 'Plan'): Plan =>
  ({ id, mat, type, total: 100, balance, status: 'Al día', installments });
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
  ({ status: 'Activo', type: 'Libro', description: '', unit: 'Unidad', cost: 1, isDeliveredOnEnrollment: true, isPackage: false, ...o } as Item);
const libro = mk({ id: 'LIB', name: 'Libro' });
const kit = mk({ id: 'KIT', name: 'Kit bienvenida', type: 'Kit', isPackage: true,
  composition: [{ itemId: 'MOCH', name: 'Mochila', quantity: 1 }, { itemId: 'CART', name: 'Cartuchera', quantity: 2 }] });
const sellado = mk({ id: 'PACK8', name: 'Paquete 8 libros', type: 'Kit', isPackage: true,
  composition: [{ itemId: 'L1', name: 'Libro 1', quantity: 1 }] });
const items = [libro, kit, sellado, mk({ id: 'MOCH', name: 'Mochila' }), mk({ id: 'CART', name: 'Cartuchera' })];
const recipe: Recipe = {
  id: 'R', name: 'Receta', programId: 'p', branchIds: [], applyToAllBranches: true, status: 'Activo', startDate: '2026-01-01',
  items: [{ itemId: 'LIB', quantity: 1 }, { itemId: 'KIT', quantity: 1 }],
};

check('Un kit con composición permite entregar por componentes (no depende de ninguna casilla del artículo)', canSplitKit(kit) && canSplitKit(sellado));
check('Un kit sin composición, o un artículo que no es kit, no se divide', !canSplitKit(mk({ id: 'K0', name: 'Vacío', type: 'Kit', isPackage: true, composition: [] })) && !canSplitKit(libro) && !canSplitKit(undefined));

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
check('Con el stock de la sede: si hay kits, empieza como kit; si NO hay kits, la lista de componentes se abre sola',
  initialModes(recipe, items, [], { stock: stock.map(s => (s.itemId === 'KIT' ? { ...s, stock: 2 } : s)), branchId: 'B' }).KIT === 'kit'
  && initialModes(recipe, items, [], { stock, branchId: 'B' }).KIT === 'componentes');
check('Un kit ya entregado no pasa a componentes aunque ahora no haya stock', initialModes(recipe, items, ['KIT'], { stock, branchId: 'B' }).KIT === 'kit');

// ---------------------------------------------------------------- Nada se marca solo y lo que falta
check('Con el kit por componentes y solo la mochila marcada, queda pendiente la cartuchera (y no se cuenta el kit)',
  pendingNames(recipe, items, { LIB: true, MOCH: true }, split).join() === 'Cartuchera');
check('Sin marcar nada, todo queda pendiente (el libro y el kit)', pendingNames(recipe, items, {}, {}).join() === 'Libro,Kit bienvenida');
check('Con todo marcado no queda nada pendiente', pendingNames(recipe, items, { LIB: true, KIT: true }, {}).length === 0);
check('«Sin stock de nada»: ni libro, ni kit, ni componentes → se avisa (para pedir a Logística)',
  noStockAtAll(recipe, items, [], 'B', []) === true && noStockAtAll(recipe, items, stock.map(s => ({ ...s, stock: 0 })), 'B', []) === true);
check('Con stock del libro, o de un solo componente suelto, ya no es «sin stock de nada»',
  noStockAtAll(recipe, items, stock, 'B', []) === false
  && noStockAtAll(recipe, items, [{ id: 'x', itemId: 'MOCH', branchId: 'B', stock: 1, minStock: 0 }], 'B', []) === false);
check('Lo ya entregado no cuenta: si solo falta el kit y no hay nada de él, se avisa; si no falta nada, no',
  noStockAtAll(recipe, items, [], 'B', ['LIB']) === true && noStockAtAll(recipe, items, [], 'B', ['LIB', 'KIT']) === false);

// ---------------------------------------------------------------- La pantalla
const page = readFileSync('src/pages/Verification.tsx', 'utf8').replace(/\r\n/g, '\n');
check('La pantalla ofrece «Buscar por componentes» (sin depender de ninguna casilla del artículo), lista todos los componentes (en gris los que no tienen stock) y nada se marca solo',
  /Buscar por componentes/.test(page) && !/allowUnpacking|Entregar por componentes/.test(page) && /Sin stock suficiente en la sede|sin stock suficiente/.test(page) && /useState<Record<string, boolean>>\(\{\}\)/.test(page));
check('Sin stock del kit la lista de componentes se abre sola, y sin stock de nada se avisa en medio de la ventana (el botón «Avisar a Logística» llega con la mensajería)',
  /initialModes\(recipe, items, delivered, \{ stock: stockItems, branchId: enrollment\.branchId \|\| '' \}\)/.test(page) && /noStockAtAll\(/.test(page) && /No hay stock en \{branchName\} de ningún artículo de esta receta/.test(page) && !/Avisar a Logística/.test(page));
check('El resumen dice qué quedaría pendiente con lo marcado', /pendingNames\(/.test(page) && /Quedaría pendiente:/.test(page));

console.log(failed === 0 ? '\nTodo correcto.' : `\n${failed} caso(s) fallaron.`);
process.exit(failed === 0 ? 0 : 1);
