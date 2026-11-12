/**
 * Verificación mínima de las reglas del Catálogo de artículos (Etapa 4).
 * Ejecutar: npx tsx scripts/check-inventory.ts
 */
import type { Item, ItemPrice, StockItem } from '../src/context/DataContext';
import {
  availableStock,
  canDeliver,
  defaultUnitFor,
  getCurrentPrice,
  getPriceHistory,
  getRecipeSelectableItems,
  hasReferencePrice,
  ITEM_UNITS,
  itemSummaryLines,
  nextSku,
  normalizeName,
  packageError,
  suggestedKitPrice,
  unpackReasonError,
  UNPACK_REASON_MAX,
  validateItem,
} from '../src/utils/inventory';
import { kitOverlapError, validateRecipe } from '../src/utils/recipes';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : ` -> ${detail}`}`);
  if (!ok) failed++;
};

const base = { status: 'Activo', description: '', unit: 'Unidad', cost: 1, isDeliveredOnEnrollment: false, isPackage: false } as const;
const item = (o: Partial<Item> & { id: string; name: string; type: Item['type'] }): Item => ({ ...base, ...o } as Item);

const anillado = item({ id: 'LIB-A', name: 'Libro Anillado', type: 'Libro', bindingType: 'Anillado', isDeliveredOnEnrollment: true });
const encolado = item({ id: 'LIB-E', name: 'Libro Encolado', type: 'Libro', bindingType: 'Encolado' });
const cronometro = item({ id: 'HER-C', name: 'Cronómetro', type: 'Herramienta / adicional' });
const modulo = item({ id: 'MAT-K2', name: 'Módulo Kids 2', type: 'Material educativo', isDeliveredOnEnrollment: true });
const pack8 = item({ id: 'PACK-8', name: 'Paquete 8 libros KIDS', type: 'Kit', unit: 'Kit', isPackage: true, isDeliveredOnEnrollment: true, composition: [{ itemId: 'LIB-A', name: 'Libro Anillado', quantity: 8 }] });
const inactivo = item({ id: 'OLD', name: 'Antiguo', type: 'Herramienta / adicional', status: 'Inactivo', isDeliveredOnEnrollment: true });
const all = [anillado, encolado, cronometro, modulo, pack8, inactivo];

// --- Validación de artículos ---
check('Libro sin encuadernado → rechazado', validateItem({ item: { ...anillado, bindingType: undefined }, allItems: all, editingId: 'LIB-A' }) !== null);
check('Libro Anillado → válido', validateItem({ item: anillado, allItems: all, editingId: 'LIB-A' }) === null);
check('Libro Encolado → válido', validateItem({ item: encolado, allItems: all, editingId: 'LIB-E' }) === null);
check('Herramienta → válida', validateItem({ item: cronometro, allItems: all, editingId: 'HER-C' }) === null);
check('Kit con composición → válido', validateItem({ item: pack8, allItems: all, editingId: 'PACK-8' }) === null);
check('Kit SIN composición → rechazado (la composición es obligatoria: es la receta para armarlo)',
  /composición/.test(validateItem({ item: { ...pack8, composition: [] }, allItems: all, editingId: 'PACK-8' }) ?? ''));
check('Kit que se contiene a sí mismo → rechazado',
  validateItem({ item: { ...pack8, composition: [{ itemId: 'PACK-8', name: 'x', quantity: 1 }] }, allItems: all, editingId: 'PACK-8' }) !== null);
check('Kit con un componente repetido → rechazado',
  validateItem({ item: { ...pack8, composition: [{ itemId: 'LIB-A', name: 'x', quantity: 1 }, { itemId: 'LIB-A', name: 'x', quantity: 2 }] }, allItems: all, editingId: 'PACK-8' }) !== null);
check('Kit con un componente que no existe → rechazado',
  validateItem({ item: { ...pack8, composition: [{ itemId: 'NO-EXISTE', name: 'x', quantity: 1 }] }, allItems: all, editingId: 'PACK-8' }) !== null);
check('No hay kits dentro de kits → rechazado (y dice cuál)',
  /Paquete 8 libros KIDS/.test(validateItem({ item: { ...pack8, id: 'KIT-2', name: 'Kit grande', composition: [{ itemId: 'PACK-8', name: 'x', quantity: 1 }] }, allItems: all }) ?? ''));
check('Un artículo que no es de tipo Kit no puede marcarse como kit', validateItem({ item: { ...anillado, isPackage: true }, allItems: all, editingId: 'LIB-A' }) !== null);
check('Un kit tiene que estar marcado como kit', validateItem({ item: { ...pack8, isPackage: false }, allItems: all, editingId: 'PACK-8' }) !== null);
check('El material educativo siempre se entrega con la matrícula: sin eso → rechazado',
  validateItem({ item: { ...modulo, isDeliveredOnEnrollment: false }, allItems: all, editingId: 'MAT-K2' }) !== null);
check('La unidad de medida sale de la lista corta (Unidad, Juego, Kit, Caja, Paquete, Par)',
  ITEM_UNITS.length === 6 && ITEM_UNITS.every(u => validateItem({ item: { ...anillado, unit: u }, allItems: all, editingId: 'LIB-A' }) === null)
  && validateItem({ item: { ...anillado, unit: 'Und.' }, allItems: all, editingId: 'LIB-A' }) !== null);
check('Un kit propone «Kit» como unidad y el resto «Unidad»', defaultUnitFor('Kit') === 'Kit' && defaultUnitFor('Libro') === 'Unidad');
check('SKU duplicado → rechazado', validateItem({ item: { ...modulo, id: 'LIB-A' }, allItems: all, editingId: 'MAT-K2' }) !== null);

// --- Recetas: solo artículos activos habilitados para matrícula ---
const selectable = getRecipeSelectableItems(all).map(i => i.id).sort().join(',');
check('Receta ofrece solo activos y habilitados para matrícula', selectable === 'LIB-A,MAT-K2,PACK-8', selectable);
check('Receta conserva un artículo ya incluido aunque hoy no cumpla', getRecipeSelectableItems(all, ['OLD']).some(i => i.id === 'OLD'));
check('Material educativo entregable por matrícula está habilitado', getRecipeSelectableItems(all).some(i => i.id === 'MAT-K2'));

// --- Precios con vigencia ---
const price = (id: string, branchId: string, amount: number, validFrom: string, validTo?: string): ItemPrice =>
  ({ id, itemId: 'HER-C', branchId, amount, validFrom, validTo, createdAt: '', createdBy: 't' });
const prices: ItemPrice[] = [
  price('1', 'all', 35, '2026-01-01', '2026-10-31'),
  price('2', 'all', 40, '2026-11-01'),
  price('3', 'FIL-009', 32, '2026-01-01'),
];
check('Precio general vigente (octubre) = 35', getCurrentPrice(prices, 'HER-C', 'FIL-002', '2026-10-15')?.amount === 35);
check('Nueva vigencia (noviembre) = 40 sin sobrescribir el histórico', getCurrentPrice(prices, 'HER-C', 'FIL-002', '2026-11-02')?.amount === 40);
check('Excepción por sede gana al precio general', getCurrentPrice(prices, 'HER-C', 'FIL-009', '2026-11-02')?.amount === 32);
check('Antes de la primera vigencia no hay precio', getCurrentPrice(prices, 'HER-C', 'FIL-002', '2025-12-31') === undefined);
check('El historial conserva los 3 registros', getPriceHistory(prices, 'HER-C').length === 3);

// --- Stock y entrega (Verificación) ---
const stock: StockItem[] = [
  { id: 's1', itemId: 'PACK-8', branchId: 'FIL-009', stock: 7, minStock: 2 },
  { id: 's2', itemId: 'MAT-K2', branchId: 'FIL-009', stock: 0, minStock: 2 },
];
check('Stock de la sede', availableStock(stock, 'FIL-009', 'PACK-8') === 7);
check('Con stock se puede entregar (1 paquete sellado = 1 unidad)', canDeliver(stock, 'FIL-009', 'PACK-8', 1));
check('Sin stock NO se puede entregar (gris en Verificación)', !canDeliver(stock, 'FIL-009', 'MAT-K2', 1));
check('Artículo sin registro de stock en la sede → no entregable', !canDeliver(stock, 'FIL-003', 'PACK-8', 1));

// ---- SKU automático (nadie lo escribe) y nombre repetido
check('SKU automático: el primero de un tipo es 001 y sigue por tipo (LIB, MAT, HER, KIT)',
  nextSku('Libro', []) === 'ITM-LIB-001' && nextSku('Material educativo', []) === 'ITM-MAT-001' && nextSku('Herramienta / adicional', []) === 'ITM-HER-001' && nextSku('Kit', []) === 'ITM-KIT-001');
check('SKU automático: toma el mayor número usado de ese tipo más uno, sin mirar mayúsculas, y no cuenta los SKU de otro formato ni de otro tipo',
  nextSku('Libro', ['ITM-LIB-001', 'itm-lib-009', 'ITM-LIB-K1', 'ITM-MAT-050', 'LIB-A']) === 'ITM-LIB-010' && nextSku('Material educativo', ['ITM-MAT-01']) === 'ITM-MAT-002' && nextSku('Kit', ['ITM-KIT-BIENV']) === 'ITM-KIT-001');
check('SKU automático: el que asigna cumple el formato que exige la base', ['Libro', 'Material educativo', 'Herramienta / adicional', 'Kit'].every(t => /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/.test(nextSku(t as Item['type'], []))));
check('Nombre: sin tildes, mayúsculas ni espacios de más', normalizeName('  Libro   KIDS Ñandú ') === 'libro kids nandu');
const nuevoLibro = item({ id: 'ITM-LIB-001', name: 'libro  anillado', type: 'Libro', bindingType: 'Anillado' });
check('Crear un artículo con el nombre de otro del mismo tipo se rechaza (y dice cuál)', /LIB-A/.test(validateItem({ item: nuevoLibro, allItems: all }) ?? ''));
check('El mismo nombre en otro tipo sí se permite', validateItem({ item: { ...nuevoLibro, type: 'Herramienta / adicional', bindingType: undefined }, allItems: all }) === null);
check('Editar sin cambiar el nombre no choca (aunque el catálogo ya tuviera dos iguales)', (() => {
  const dup = item({ id: 'LIB-A2', name: 'Libro Anillado', type: 'Libro', bindingType: 'Anillado' });
  return validateItem({ item: { ...dup, status: 'Inactivo' }, allItems: [...all, dup], editingId: 'LIB-A2' }) === null;
})());
check('Renombrar a un nombre que ya usa otro del mismo tipo se rechaza', validateItem({ item: { ...encolado, name: 'Libro Anillado' }, allItems: all, editingId: 'LIB-E' }) !== null);

// ---- Armar y desarmar un kit
check('Armar o desarmar exige un kit con composición', packageError(pack8) === null && packageError(anillado) !== null && packageError({ isPackage: true, composition: [] }) !== null && packageError(undefined) !== null);
check('Desarmar un kit pide siempre su motivo (y no pasa del máximo)',
  unpackReasonError('') !== null && unpackReasonError('   ') !== null && unpackReasonError('Un alumno necesita solo la cartuchera') === null && unpackReasonError('x'.repeat(UNPACK_REASON_MAX + 1)) !== null);

// ---- Precio de referencia: todo artículo lleva uno
const refPrices: ItemPrice[] = [
  { id: 'P1', itemId: 'LIB-A', branchId: 'all', amount: 60, validFrom: '2026-01-01', createdAt: '', createdBy: 't' },
  { id: 'P2', itemId: 'HER-C', branchId: 'all', amount: 45.5, validFrom: '2026-01-01', createdAt: '', createdBy: 't' },
  { id: 'P3', itemId: 'MAT-K2', branchId: 'FIL-009', amount: 15, validFrom: '2026-01-01', createdAt: '', createdBy: 't' },
];
check('Tiene precio de referencia el que tiene precio general vigente; uno solo por sede no cuenta', hasReferencePrice(refPrices, 'LIB-A', '2026-06-01') && !hasReferencePrice(refPrices, 'MAT-K2', '2026-06-01') && !hasReferencePrice(refPrices, 'NO', '2026-06-01'));
check('El precio sugerido de un kit es la suma de los precios de sus artículos por sus cantidades',
  suggestedKitPrice([{ itemId: 'LIB-A', quantity: 2 }, { itemId: 'HER-C', quantity: 1 }], refPrices, '2026-06-01') === 165.5);
check('Sin sugerencia si no hay composición o a algún artículo le falta el precio',
  suggestedKitPrice([], refPrices, '2026-06-01') === undefined && suggestedKitPrice([{ itemId: 'LIB-A', quantity: 1 }, { itemId: 'MAT-K2', quantity: 1 }], refPrices, '2026-06-01') === undefined);
check('El resumen dice en palabras lo que implica lo marcado',
  itemSummaryLines({ type: 'Libro', isDeliveredOnEnrollment: true }, 60).some(l => /recetas de matrícula/.test(l) && !/solo se venderá/.test(l))
  && itemSummaryLines({ type: 'Libro', isDeliveredOnEnrollment: true }, 60).some(l => /USD 60\.00/.test(l))
  && itemSummaryLines({ type: 'Herramienta / adicional', isDeliveredOnEnrollment: false }, undefined).some(l => /solo se venderá/.test(l))
  && itemSummaryLines({ type: 'Herramienta / adicional', isDeliveredOnEnrollment: false }, undefined).some(l => /Falta el precio de referencia/.test(l))
  && itemSummaryLines({ type: 'Kit', isDeliveredOnEnrollment: true }, 10).some(l => /desarmar/.test(l))
  && !itemSummaryLines({ type: 'Libro', isDeliveredOnEnrollment: true }, 10).some(l => /desarmar/.test(l)));

// ---- Recetas: un kit y uno de sus artículos juntos se entregarían dos veces
check('Receta con el kit y uno de sus artículos → aviso (dice cuáles)', /Paquete 8 libros KIDS.*Libro Anillado/.test(kitOverlapError([{ itemId: 'PACK-8' }, { itemId: 'LIB-A' }], all) ?? ''));
check('Receta con el kit y otros artículos que NO están dentro de él → permitida', kitOverlapError([{ itemId: 'PACK-8' }, { itemId: 'HER-C' }], all) === null);
check('Receta solo con artículos sueltos → permitida', kitOverlapError([{ itemId: 'LIB-A' }, { itemId: 'HER-C' }], all) === null);
check('La validación de la receta incluye ese aviso', validateRecipe({
  id: 'REC-9', name: 'Prueba', programId: '1', branchIds: [], applyToAllBranches: true, status: 'Activo', startDate: '2026-01-01',
  items: [{ itemId: 'PACK-8', quantity: 1 }, { itemId: 'LIB-A', quantity: 1 }],
}, [], all).some(e => /dos veces/.test(e)));


console.log(failed === 0 ? '\nTodo correcto.' : `\n${failed} caso(s) fallaron.`);
process.exit(failed === 0 ? 0 : 1);
