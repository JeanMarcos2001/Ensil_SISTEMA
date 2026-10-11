/**
 * Verificación mínima de las reglas del Catálogo de artículos (Etapa 4).
 * Ejecutar: npx tsx scripts/check-inventory.ts
 */
import type { Item, ItemPrice, StockItem } from '../src/context/DataContext';
import {
  availableStock,
  canDeliver,
  getCurrentPrice,
  getPriceHistory,
  getRecipeSelectableItems,
  validateItem,
} from '../src/utils/inventory';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : ` -> ${detail}`}`);
  if (!ok) failed++;
};

const base = { status: 'Activo', description: '', unit: 'Unidad', cost: 1, isSold: false, isDeliveredOnEnrollment: false, isPackage: false, allowUnpacking: false } as const;
const item = (o: Partial<Item> & { id: string; name: string; type: Item['type'] }): Item => ({ ...base, ...o } as Item);

const anillado = item({ id: 'LIB-A', name: 'Libro Anillado', type: 'Libro', bindingType: 'Anillado', isDeliveredOnEnrollment: true });
const encolado = item({ id: 'LIB-E', name: 'Libro Encolado', type: 'Libro', bindingType: 'Encolado', isSold: true });
const cronometro = item({ id: 'HER-C', name: 'Cronómetro', type: 'Herramienta / adicional', isSold: true });
const modulo = item({ id: 'MAT-K2', name: 'Módulo Kids 2', type: 'Material educativo', isDeliveredOnEnrollment: true });
const pack8 = item({ id: 'PACK-8', name: 'Paquete 8 libros KIDS', type: 'Paquete / kit logístico', isPackage: true, isDeliveredOnEnrollment: true, allowUnpacking: false });
const inactivo = item({ id: 'OLD', name: 'Antiguo', type: 'Herramienta / adicional', status: 'Inactivo', isDeliveredOnEnrollment: true });
const all = [anillado, encolado, cronometro, modulo, pack8, inactivo];

// --- Validación de artículos ---
check('Libro sin tipo de libro → rechazado', validateItem({ item: { ...anillado, bindingType: undefined }, allItems: all, editingId: 'LIB-A' }) !== null);
check('Libro Anillado → válido', validateItem({ item: anillado, allItems: all, editingId: 'LIB-A' }) === null);
check('Libro Encolado vendible → válido', validateItem({ item: encolado, allItems: all, editingId: 'LIB-E' }) === null);
check('Herramienta vendible → válida', validateItem({ item: cronometro, allItems: all, editingId: 'HER-C' }) === null);
check('Paquete 8 libros SIN desempaquetado y sin composición → válido', validateItem({ item: pack8, allItems: all, editingId: 'PACK-8' }) === null);
check('Paquete CON desempaquetado y sin composición → rechazado',
  validateItem({ item: { ...pack8, allowUnpacking: true, composition: [] }, allItems: all, editingId: 'PACK-8' }) !== null);
check('Paquete CON desempaquetado y composición → válido',
  validateItem({ item: { ...pack8, allowUnpacking: true, composition: [{ itemId: 'LIB-A', name: 'x', quantity: 2 }] }, allItems: all, editingId: 'PACK-8' }) === null);
check('Paquete que se contiene a sí mismo → rechazado',
  validateItem({ item: { ...pack8, composition: [{ itemId: 'PACK-8', name: 'x', quantity: 1 }] }, allItems: all, editingId: 'PACK-8' }) !== null);
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
  price('3', 'FIL-JUL', 32, '2026-01-01'),
];
check('Precio general vigente (octubre) = 35', getCurrentPrice(prices, 'HER-C', 'FIL-PIU', '2026-10-15')?.amount === 35);
check('Nueva vigencia (noviembre) = 40 sin sobrescribir el histórico', getCurrentPrice(prices, 'HER-C', 'FIL-PIU', '2026-11-02')?.amount === 40);
check('Excepción por sede gana al precio general', getCurrentPrice(prices, 'HER-C', 'FIL-JUL', '2026-11-02')?.amount === 32);
check('Antes de la primera vigencia no hay precio', getCurrentPrice(prices, 'HER-C', 'FIL-PIU', '2025-12-31') === undefined);
check('El historial conserva los 3 registros', getPriceHistory(prices, 'HER-C').length === 3);

// --- Stock y entrega (Verificación) ---
const stock: StockItem[] = [
  { id: 's1', itemId: 'PACK-8', branchId: 'FIL-JUL', stock: 7, minStock: 2 },
  { id: 's2', itemId: 'MAT-K2', branchId: 'FIL-JUL', stock: 0, minStock: 2 },
];
check('Stock de la sede', availableStock(stock, 'FIL-JUL', 'PACK-8') === 7);
check('Con stock se puede entregar (1 paquete sellado = 1 unidad)', canDeliver(stock, 'FIL-JUL', 'PACK-8', 1));
check('Sin stock NO se puede entregar (gris en Verificación)', !canDeliver(stock, 'FIL-JUL', 'MAT-K2', 1));
check('Artículo sin registro de stock en la sede → no entregable', !canDeliver(stock, 'FIL-CHI', 'PACK-8', 1));

console.log(failed === 0 ? '\nTodo correcto.' : `\n${failed} caso(s) fallaron.`);
process.exit(failed === 0 ? 0 : 1);
