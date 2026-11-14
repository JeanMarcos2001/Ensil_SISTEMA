/**
 * Verificación de los artículos, sus precios de venta y las recetas de materiales en la base de datos (Lote 5).
 *  - reglas puras (`utils/inventory.ts`, `utils/recipes.ts`): SKU, costo, precios con historial, recetas con sus referencias;
 *  - traducción de filas de la base (`utils/itemsDb.ts`) y mensajes de error;
 *  - operaciones (`services/itemCatalog.ts`) contra un repositorio en memoria: validar → guardar, todo o nada, historial de precios;
 *  - la migración, su carga de partida y el cableado (contexto, inicio de sesión y pantallas).
 * Ejecutar: npx tsx scripts/check-items-db.ts
 */
import { readFileSync } from 'node:fs';
import { seedBranches, seedItemPrices, seedItems, seedLevels, seedPrograms, seedRecipes } from '../src/data/seedCatalog';
import type { Item, ItemPrice, Recipe } from '../src/context/DataContext';
import {
  createItems, createItemsAuto, duplicateRecipe, editItem, loadItemCatalog, registerPrice, saveRecipe, setRecipeStatus,
  type ItemCatalogContext, type ItemCatalogData, type ItemCatalogRepository, type NewPrice,
} from '../src/services/itemCatalog';
import type { RepoResult } from '../src/services/orgDirectory';
import { ITEM_UNITS, SKU_PATTERN, UNPACK_REASON_MAX, dayBefore, getCurrentPrice, getPriceHistory, nextSku, priceError, validateItem, withNewPrice, type ItemDraft } from '../src/utils/inventory';
import { BULK_HEADERS } from '../src/utils/itemImport';
import { capabilityById } from '../src/utils/capabilities';
import {
  isItemIdConflict, isRecipeIdConflict, itemFromRow, itemToRow, itemsErrorMessage, priceFromRow, recipeFromRow, recipeToRow, withComponentNames,
} from '../src/utils/itemsDb';
import { renderItemsSeedSql } from '../src/utils/itemsSeedSql';
import { THROWS_ON_DENIAL } from '../src/utils/guards';
import { validateRecipe } from '../src/utils/recipes';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : ` -> ${detail}`}`);
  if (!ok) failed++;
};
const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
/** Igualdad profunda sin importar el orden de las claves. */
const canon = (x: unknown): unknown => (Array.isArray(x) ? x.map(canon) : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x as object).sort(([k], [l]) => k.localeCompare(l)).map(([k, v]) => [k, canon(v)])) : x);
const same = (a: unknown, b: unknown) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

const branches = seedBranches().map(b => ({ id: b.id }));
const refs = { programs: seedPrograms().map(p => ({ id: p.id, hasLevels: p.hasLevels })), levels: seedLevels().map(l => ({ id: l.id, programId: l.programId })), branches };
const base = (): ItemCatalogData => ({ items: withComponentNames(seedItems()), prices: seedItemPrices(), recipes: seedRecipes() });
const ctxOf = (data: ItemCatalogData = base()): ItemCatalogContext => ({ ...data, ...refs });
const book = (id: string, over: Partial<Item> = {}): Item => ({
  id, name: `Libro ${id}`, type: 'Libro', cost: 10, status: 'Activo', description: '', unit: 'Unidad', isDeliveredOnEnrollment: false,
  isPackage: false, bookType: 'Individual', bindingType: 'Anillado', ...over,
});
const recipe = (over: Partial<Recipe> = {}): Recipe => ({
  id: '', name: 'Pack nuevo', programId: '1', levelId: '3', branchIds: [], applyToAllBranches: true, status: 'Activo',
  items: [{ itemId: 'ITM-MAT-01', quantity: 1 }], startDate: '2026-01-01', endDate: '2026-12-31', ...over,
});

// ------------------------------------------------------------------------------------------------------------------ Datos de partida
const seed = base();
check('Los datos de partida son 5 artículos, 3 precios y 3 recetas', seed.items.length === 5 && seed.prices.length === 3 && seed.recipes.length === 3);
check('Los SKU de partida son los que usan el stock, el kardex y las recetas de ejemplo (no cambiaron)', seed.items.map(i => i.id).sort().join() === 'ITM-HER-01,ITM-HER-02,ITM-KIT-BIENV,ITM-LIB-K1,ITM-MAT-01');
check('Todo artículo de partida cumple las reglas (SKU, costo, composición…)', seed.items.every(i => validateItem({ item: i, allItems: seed.items, editingId: i.id }) === null));
check('Los artículos con precio de referencia de partida son los tres que ya lo tenían; el material y el kit de partida quedan «sin precio de referencia» (no se inventan precios)',
  seed.items.filter(i => getCurrentPrice(seed.prices, i.id, 'all', '2026-06-01') === undefined).map(i => i.id).sort().join() === 'ITM-KIT-BIENV,ITM-MAT-01');
check('Toda receta de partida es válida (programa y nivel del catálogo comercial, artículos habilitados) y no choca con otra', seed.recipes.every(r => {
  const errors = validateRecipe(r, seed.recipes.filter(x => x.id !== r.id), seed.items, r, refs);
  return errors.length === 0;
}), seed.recipes.map(r => validateRecipe(r, seed.recipes.filter(x => x.id !== r.id), seed.items, r, refs).join('|')).join(' ; '));
check('El kit de bienvenida nombra a sus componentes y estos existen', (() => {
  const kitItem = seed.items.find(i => i.id === 'ITM-KIT-BIENV')!;
  return kitItem.composition!.length === 2 && kitItem.composition!.every(c => seed.items.some(i => i.id === c.itemId && i.name === c.name));
})());

// ------------------------------------------------------------------------------------------------------------------ Reglas de artículos
const okItem = (over: Partial<Item>, editing?: string) => validateItem({ item: { ...book('LIB-1'), ...over }, allItems: seed.items, editingId: editing });
check('SKU: letras, números, punto, guion y guion bajo; hasta 40 caracteres', SKU_PATTERN.test('ITM-LIB-K1') && SKU_PATTERN.test('A') && SKU_PATTERN.test('LIB.K2_001') && !SKU_PATTERN.test('LIB 1') && !SKU_PATTERN.test('-LIB') && !SKU_PATTERN.test('A'.repeat(41)) && SKU_PATTERN.test('A'.repeat(40)));
check('Artículo: un SKU con espacios se rechaza con un mensaje claro', /solo admite letras/.test(okItem({ id: 'LIB 1' }) ?? ''));
check('Artículo: el SKU repetido se rechaza sin importar mayúsculas, salvo el propio', /ya existe/.test(okItem({ id: 'itm-lib-k1' }) ?? '') && okItem({ id: 'ITM-LIB-K1' }, 'ITM-LIB-K1') === null);
check('Artículo: el costo no puede ser negativo (vacío se acepta: queda en 0)', okItem({ cost: -1 }) === 'El costo no puede ser negativo.' && okItem({ cost: 0 }) === null && okItem({ cost: undefined }) === null);
check('Artículo: las reglas de siempre siguen (libro con encuadernado, kit con composición)', /Anillado o Encolado/.test(okItem({ bindingType: undefined }) ?? '') && /composición/.test(validateItem({ item: { ...book('K'), type: 'Kit', unit: 'Kit', isPackage: true, composition: [] }, allItems: seed.items }) ?? ''));

// ------------------------------------------------------------------------------------------------------------------ Reglas de precios
const pe = (over: object, prices: ItemPrice[] = seed.prices) => priceError({ itemId: 'ITM-LIB-K1', branchId: 'all', amount: 70, validFrom: '2026-06-01', ...over }, prices, { itemIds: seed.items.map(i => i.id), branchIds: branches.map(b => b.id) });
check('Precio: mayor a 0, con fecha, de un artículo y una sede que existen', pe({ amount: 0 }) === 'El precio debe ser mayor a 0.' && pe({ amount: NaN }) === 'El precio debe ser mayor a 0.' && pe({ validFrom: '' }) === 'Indique desde cuándo rige el precio.' && pe({ itemId: 'NO' }) === 'No se encontró el artículo.' && pe({ branchId: 'FIL-999' }) === 'La sede elegida no existe.' && pe({}) === null && pe({ branchId: 'FIL-002' }) === null);
check('Precio: no repite la fecha de inicio ni se registra antes de una vigencia posterior (en el mismo alcance)', /esa fecha de inicio/.test(pe({ validFrom: '2026-01-01' }) ?? '') && /vigencia posterior/.test(pe({ validFrom: '2025-12-01' }) ?? '') && pe({ validFrom: '2025-12-01', branchId: 'FIL-002' }) === null);
check('Precio: el día anterior a una fecha (también al cambiar de mes y de año)', dayBefore('2026-06-01') === '2026-05-31' && dayBefore('2026-01-01') === '2025-12-31' && dayBefore('2024-03-01') === '2024-02-29');
check('Precio: uno nuevo CIERRA la vigencia abierta del mismo alcance en lugar de sobrescribirla', (() => {
  const created: ItemPrice = { id: 'PRC-004', itemId: 'ITM-LIB-K1', branchId: 'all', amount: 70, validFrom: '2026-06-01', createdAt: '', createdBy: 'x' };
  const after = withNewPrice(seed.prices, created);
  const old = after.find(p => p.id === 'PRC-001')!;
  return after.length === 4 && old.amount === 60 && old.validTo === '2026-05-31' && !after.find(p => p.id === 'PRC-004')!.validTo && after.find(p => p.id === 'PRC-002')!.validTo === undefined;
})());
check('Precio: con el historial se conoce el precio de cada fecha (la excepción por sede gana sobre el general)', (() => {
  const prices = withNewPrice(withNewPrice(seed.prices, { id: 'PRC-004', itemId: 'ITM-LIB-K1', branchId: 'all', amount: 70, validFrom: '2026-06-01', createdAt: '', createdBy: 'x' }),
    { id: 'PRC-005', itemId: 'ITM-LIB-K1', branchId: 'FIL-003', amount: 65, validFrom: '2026-06-15', createdAt: '', createdBy: 'x' });
  return getCurrentPrice(prices, 'ITM-LIB-K1', 'FIL-002', '2026-05-01')?.amount === 60 && getCurrentPrice(prices, 'ITM-LIB-K1', 'FIL-002', '2026-07-01')?.amount === 70
    && getCurrentPrice(prices, 'ITM-LIB-K1', 'FIL-003', '2026-07-01')?.amount === 65 && getPriceHistory(prices, 'ITM-LIB-K1').length === 3;
})());

// ------------------------------------------------------------------------------------------------------------------ Reglas de recetas con referencias
const re = (over: Partial<Recipe>, prev?: Recipe, others: Recipe[] = seed.recipes) => validateRecipe(recipe(over), others, seed.items, prev, refs);
check('Receta: una receta completa es válida (otro nivel del mismo programa)', re({}).length === 0, re({}).join('|'));
check('Receta: el programa debe existir y el nivel ser de ese programa', re({ programId: '99', levelId: undefined }).includes('El programa seleccionado no existe.') && re({ levelId: '4' }).includes('El nivel seleccionado no pertenece al programa.') && re({ programId: '5', levelId: '1' }).includes('El nivel seleccionado no pertenece al programa.'));
check('Receta: las sedes elegidas deben existir', re({ applyToAllBranches: false, branchIds: ['FIL-999'] }).includes('Una de las sedes elegidas no existe.') && re({ applyToAllBranches: false, branchIds: ['FIL-002'] }).length === 0);
check('Receta: sin las referencias (llamada de antes) las reglas de siempre siguen valiendo', validateRecipe(recipe({ programId: '99' }), [], seed.items).length === 0);

// ------------------------------------------------------------------------------------------------------------------ Traducción de filas
const roundTrip = withComponentNames(seed.items.map(i => itemFromRow(itemToRow(i))));
check('Artículo ↔ fila: ida y vuelta sin perder nada (con los nombres de los componentes resueltos)', seed.items.every(i => same(roundTrip.find(x => x.id === i.id), i)),
  seed.items.filter(i => !same(roundTrip.find(x => x.id === i.id), i)).map(i => i.id).join());
check('El nombre de un componente NO se guarda: se completa con el nombre actual de su artículo', (() => {
  const row = itemToRow(seed.items.find(i => i.id === 'ITM-KIT-BIENV')!);
  const renamed = withComponentNames([...seed.items.map(i => (i.id === 'ITM-HER-01' ? { ...i, name: 'Mochila Nueva' } : i)).filter(i => i.id !== 'ITM-HER-02'), { ...itemFromRow(row) }]).find(i => i.id === 'ITM-KIT-BIENV')!;
  return !('nombre' in row.composicion![0]) && renamed.composition![0].name === 'Mochila Nueva' && renamed.composition![1].name === 'ITM-HER-02';
})());
check('Artículo: lo vacío se guarda como nulo, la unidad vacía como «Unidad» y la composición solo en los paquetes', (() => {
  const row = itemToRow(book('B-1', { unit: '  ', composition: [], variableTrainings: [] }));
  return row.unidad === 'Unidad' && row.composicion === null && row.entrenamientos_variables === null && row.sesiones === null && row.costo === 10;
})());
check('Artículo: el material con entrenamientos variables conserva su tabla de sesiones', (() => {
  const m: Item = { ...seed.items[1], trainingMode: 'Variable', sessions: 2, variableTrainings: [{ session: 1, trainings: 2 }, { session: 2, trainings: 3 }] };
  return same(itemFromRow(itemToRow(m)).variableTrainings, m.variableTrainings);
})());
check('Precio ↔ fila: general = sede vacía; los montos que llegan como texto se leen como número', (() => {
  const p = priceFromRow({ id: 'PRC-009', articulo_id: 'A', sede_id: null, monto: '60.00', vigente_desde: '2026-01-01', vigente_hasta: null, creado_en: '2026-01-01T00:00:00Z', creado_por: 'Sistema' });
  const q = priceFromRow({ id: 'PRC-010', articulo_id: 'A', sede_id: 'FIL-002', monto: 5, vigente_desde: '2026-01-01', vigente_hasta: '2026-02-01', creado_en: '', creado_por: null });
  return p.branchId === 'all' && p.amount === 60 && p.validTo === undefined && q.branchId === 'FIL-002' && q.validTo === '2026-02-01' && q.createdBy === '';
})());
check('Receta ↔ fila: ida y vuelta (todas las sedes, fin abierto, sin nivel)', seed.recipes.every(r => same(recipeFromRow(recipeToRow(r)), r)) && (() => {
  const r = recipe({ id: 'REC-009', applyToAllBranches: false, branchIds: ['FIL-002'], levelId: undefined, endDate: undefined });
  return same(recipeFromRow(recipeToRow(r)), r) && recipeToRow({ ...r, applyToAllBranches: true }).sedes.length === 0;
})());
check('Errores de la base: SKU repetido, fecha de precio repetida y SKU mal escrito se traducen; lo técnico no se muestra', itemsErrorMessage({ code: '23505', message: 'duplicate key value violates unique constraint "articulos_pkey"' }) === 'El código SKU ya existe en el sistema.'
  && itemsErrorMessage({ code: '23505', message: 'duplicate key "articulos_id_unico"' }) === 'El código SKU ya existe en el sistema.'
  && /esa fecha de inicio/.test(itemsErrorMessage({ code: '23505', message: 'duplicate key "articulo_precios_inicio_unico"' }))
  && /solo admite letras/.test(itemsErrorMessage({ code: '23514', message: 'violates check constraint "articulos_id_check"' }))
  && itemsErrorMessage({ code: 'EN001', message: 'Hay artículos repetidos en la receta.' }) === 'Hay artículos repetidos en la receta.'
  && !/violates|constraint/i.test(itemsErrorMessage({ code: '99999', message: 'violates something' })));
check('Un SKU repetido por dos personas que crean a la vez se reconoce (y un id de receta repetido no)', isItemIdConflict({ code: '23505', message: 'duplicate key value violates unique constraint "articulos_pkey"' })
  && isItemIdConflict({ code: '23505', message: 'violates unique constraint "articulos_id_unico"' }) && !isItemIdConflict({ code: '23505', message: 'violates unique constraint "recetas_pkey"' }) && !isItemIdConflict({ code: '23514', message: 'articulos_pkey' }));
check('Un id de receta repetido por dos personas que crean a la vez se reconoce (y un SKU repetido no)', isRecipeIdConflict({ code: '23505', message: 'duplicate key value violates unique constraint "recetas_pkey"' }) && !isRecipeIdConflict({ code: '23505', message: 'duplicate key "articulos_pkey"' }));

// ------------------------------------------------------------------------------------------------------------------ Operaciones con un repositorio en memoria
function memoryRepo(initial: ItemCatalogData, opts: { conflicts?: number; fail?: string; skuConflicts?: number } = {}) {
  const data = clone(initial);
  let conflicts = opts.conflicts ?? 0;
  let skuConflicts = opts.skuConflicts ?? 0;
  const calls = { createItems: 0, updateItem: 0, addPrice: 0, insertRecipe: 0, updateRecipe: 0 };
  const nextPriceId = () => `PRC-${String(Math.max(0, ...data.prices.map(p => Number(p.id.slice(4)))) + 1).padStart(3, '0')}`;
  const repo: ItemCatalogRepository = {
    async list(): Promise<RepoResult<ItemCatalogData>> { return { ok: true, data: clone(data) }; },
    async createItems(items: Item[], prices: NewPrice[]) {
      calls.createItems++;
      if (opts.fail) return { ok: false, error: opts.fail };
      if (skuConflicts > 0) { skuConflicts--; return { ok: false, error: 'El código SKU ya existe en el sistema.', idConflict: true }; }
      if (items.some(i => data.items.some(x => x.id.toLowerCase() === i.id.toLowerCase()))) return { ok: false, error: 'El código SKU ya existe en el sistema.' };
      data.items = withComponentNames([...data.items, ...items]);
      for (const p of prices) data.prices = withNewPrice(data.prices, { id: nextPriceId(), itemId: p.itemId, branchId: 'all', amount: p.amount, validFrom: p.validFrom, createdAt: '', createdBy: 'Prueba' });
      return { ok: true, data: { items: clone(data.items), prices: clone(data.prices) } };
    },
    async updateItem(item: Item) {
      calls.updateItem++;
      if (!data.items.some(i => i.id === item.id)) return { ok: false, error: 'ya no existe' };
      data.items = withComponentNames(data.items.map(i => (i.id === item.id ? item : i)));
      return { ok: true, data: item };
    },
    async addPrice(price) {
      calls.addPrice++;
      data.prices = withNewPrice(data.prices, { id: nextPriceId(), itemId: price.itemId, branchId: price.branchId, amount: price.amount, validFrom: price.validFrom, createdAt: '', createdBy: 'Prueba' });
      return { ok: true, data: clone(data.prices) };
    },
    async insertRecipe(r: Recipe) {
      calls.insertRecipe++;
      if (opts.fail) return { ok: false, error: opts.fail };
      if (conflicts > 0) { conflicts--; return { ok: false, error: 'id repetido', idConflict: true }; }
      if (data.recipes.some(x => x.id === r.id)) return { ok: false, error: 'id repetido', idConflict: true };
      data.recipes.unshift(r); return { ok: true, data: r };
    },
    async updateRecipe(r: Recipe) {
      calls.updateRecipe++;
      const i = data.recipes.findIndex(x => x.id === r.id);
      if (i < 0) return { ok: false, error: 'ya no existe' };
      data.recipes[i] = r; return { ok: true, data: r };
    },
  };
  return { repo, data, calls };
}

async function run() {
  const m = memoryRepo(base());
  const loaded = await loadItemCatalog(m.repo);
  check('Cargar: trae artículos, precios y recetas', !!loaded.ok && loaded.value!.items.length === 5 && loaded.value!.prices.length === 3 && loaded.value!.recipes.length === 3);
  const failing = await loadItemCatalog({ ...m.repo, list: async () => ({ ok: false, error: 'sin conexión' }) } as ItemCatalogRepository);
  check('Cargar: si algo falla, devuelve el motivo', !failing.ok && failing.error === 'sin conexión');

  console.log('--- Crear artículos');
  const today = '2026-11-07';
  const created = await createItems(m.repo, ctxOf(m.data), [book('LIB-1')], [{ itemId: 'LIB-1', amount: 60 }], today);
  check('Crear: un artículo se guarda con su precio de referencia general', created.ok && m.data.items.some(i => i.id === 'LIB-1') && m.data.prices.length === 4, created.error);
  const dup = await createItems(m.repo, ctxOf(m.data), [book('lib-1')], [{ itemId: 'lib-1', amount: 60 }], today);
  check('Crear: un SKU repetido no llega a la base', !dup.ok && /ya existe/.test(dup.error ?? '') && m.calls.createItems === 1);
  const unpriced = await createItems(m.repo, ctxOf(m.data), [book('LIB-2')], [], today);
  check('Crear: TODO artículo debe traer su precio de referencia general (USD), se venda o no por ahora', !unpriced.ok && /precio de referencia/.test(unpriced.error ?? '') && m.calls.createItems === 1);
  const zeroPrice = await createItems(m.repo, ctxOf(m.data), [book('LIB-2')], [{ itemId: 'LIB-2', amount: 0 }], today);
  const strayPrice = await createItems(m.repo, ctxOf(m.data), [book('LIB-2')], [{ itemId: 'OTRO', amount: 5 }], today);
  check('Crear: un precio de 0, o de un artículo que no se crea, se rechaza', !zeroPrice.ok && !strayPrice.ok && m.calls.createItems === 1);
  const sold = await createItems(m.repo, ctxOf(m.data), [book('LIB-2')], [{ itemId: 'LIB-2', amount: 55.555 }], today);
  check('Crear: con su precio se guarda; el precio se redondea y rige desde hoy', sold.ok && m.data.prices.some(p => p.itemId === 'LIB-2' && p.amount === 55.56 && p.validFrom === today && p.branchId === 'all'), sold.error);
  const batch = await createItems(m.repo, ctxOf(m.data), [book('LIB-3'), book('LIB-4', { bindingType: undefined })], [{ itemId: 'LIB-3', amount: 10 }, { itemId: 'LIB-4', amount: 10 }], today);
  check('Crear (carga masiva): una fila mala no guarda ninguna y el mensaje dice cuál', !batch.ok && /^LIB-4:/.test(batch.error ?? '') && !m.data.items.some(i => i.id === 'LIB-3'));
  const same2 = await createItems(m.repo, ctxOf(m.data), [book('LIB-5'), book('LIB-5')], [{ itemId: 'LIB-5', amount: 10 }], today);
  check('Crear (carga masiva): el mismo SKU dos veces en el archivo se rechaza', !same2.ok && /ya existe/.test(same2.error ?? ''));
  const none = await createItems(m.repo, ctxOf(m.data), [], [], today);
  check('Crear: sin artículos no hace nada', !none.ok && none.error === 'No hay artículos para guardar.');
  const lost = memoryRepo(base(), { fail: 'No hay conexión con el servidor.' });
  const noNet = await createItems(lost.repo, ctxOf(lost.data), [book('LIB-9')], [{ itemId: 'LIB-9', amount: 10 }], today);
  check('Crear: un error de la base se devuelve tal cual (ya traducido)', !noNet.ok && noNet.error === 'No hay conexión con el servidor.');

  console.log('--- Crear artículos con SKU automático');
  const draft = (name: string, over: Partial<Item> = {}, price = 50): ItemDraft => {
    const { id: _id, ...rest } = book('X', { name, ...over });
    return { item: rest, price };
  };
  const au = memoryRepo(base());
  const a1 = await createItemsAuto(au.repo, ctxOf(au.data), [draft('Libro Nuevo')], today);
  check('Automático: el sistema asigna el primer SKU del tipo (ITM-LIB-001) y lo devuelve', a1.ok && a1.value!.ids.join() === 'ITM-LIB-001' && au.data.items.some(i => i.id === 'ITM-LIB-001' && i.name === 'Libro Nuevo'), a1.error);
  const a2 = await createItemsAuto(au.repo, ctxOf(au.data), [draft('Libro Dos')], today);
  check('Automático: el siguiente continúa la numeración (ITM-LIB-002)', a2.ok && a2.value!.ids.join() === 'ITM-LIB-002');
  const a3 = await createItemsAuto(au.repo, ctxOf(au.data), [
    draft('Cuaderno de apoyo', { type: 'Material educativo', bindingType: undefined, isDeliveredOnEnrollment: true }),
    draft('Cronómetro', { type: 'Herramienta / adicional', bindingType: undefined }),
    draft('Kit escolar', { type: 'Kit', unit: 'Kit', bindingType: undefined, isPackage: true, composition: [{ itemId: 'ITM-HER-01', name: 'Mochila Institucional', quantity: 1 }] }),
  ], today);
  check('Automático: cada tipo lleva su propia numeración (los SKU de partida con otro formato no se pisan)', a3.ok && a3.value!.ids.join() === 'ITM-MAT-002,ITM-HER-003,ITM-KIT-001', a3.error ?? a3.value?.ids.join());
  const before = au.data.prices.length;
  const a4 = await createItemsAuto(au.repo, ctxOf(au.data), [draft('Libro Tres', {}, 50), draft('Libro Cuatro', {}, 70), draft('Libro Cinco', {}, 99)], today);
  check('Automático (varios a la vez): SKU consecutivos y el precio de referencia de cada libro queda enlazado con SU SKU',
    a4.ok && a4.value!.ids.join() === 'ITM-LIB-003,ITM-LIB-004,ITM-LIB-005' && au.data.prices.length === before + 3
    && au.data.prices.some(p => p.itemId === 'ITM-LIB-003' && p.amount === 50) && au.data.prices.some(p => p.itemId === 'ITM-LIB-004' && p.amount === 70) && au.data.prices.some(p => p.itemId === 'ITM-LIB-005' && p.amount === 99), a4.error);
  const callsBefore = au.calls.createItems;
  const noPrice = await createItemsAuto(au.repo, ctxOf(au.data), [draft('Libro Seis', {}, 0)], today);
  check('Automático: un artículo sin precio de referencia no llega a la base', !noPrice.ok && /precio de referencia/.test(noPrice.error ?? '') && au.calls.createItems === callsBefore);
  const sameName = await createItemsAuto(au.repo, ctxOf(au.data), [draft('  libro NUEVO ')], today);
  check('Automático: el mismo nombre de otro artículo del tipo se rechaza antes de llamar a la base (ya no hay SKU escrito que lo frene)', !sameName.ok && /Ya existe un artículo de este tipo con ese nombre \(ITM-LIB-001\)/.test(sameName.error ?? '') && au.calls.createItems === callsBefore);
  const emptyAuto = await createItemsAuto(au.repo, ctxOf(au.data), [], today);
  check('Automático: sin artículos no hace nada', !emptyAuto.ok && emptyAuto.error === 'No hay artículos para guardar.');
  const race = memoryRepo(base(), { skuConflicts: 1 });
  const r1 = await createItemsAuto(race.repo, ctxOf(race.data), [draft('Libro Carrera')], today);
  check('Automático: si otra persona tomó ese SKU a la vez, se reintenta con el siguiente', r1.ok && race.calls.createItems === 2 && r1.value!.ids.join() === 'ITM-LIB-002' && race.data.items.some(i => i.id === 'ITM-LIB-002'), r1.error);
  const race3 = memoryRepo(base(), { skuConflicts: 3 });
  const r3 = await createItemsAuto(race3.repo, ctxOf(race3.data), [draft('Libro Carrera')], today);
  check('Automático: tras tres intentos sin lograrlo, pide intentar de nuevo (y no deja nada a medias)', !r3.ok && /No se pudo asignar un código/.test(r3.error ?? '') && race3.calls.createItems === 3 && !race3.data.items.some(i => i.name === 'Libro Carrera'));
  const lostAuto = memoryRepo(base(), { fail: 'No hay conexión con el servidor.' });
  const noNetAuto = await createItemsAuto(lostAuto.repo, ctxOf(lostAuto.data), [draft('Libro Sin Red')], today);
  check('Automático: un error de la base (que no es un SKU repetido) se devuelve tal cual, sin reintentar', !noNetAuto.ok && noNetAuto.error === 'No hay conexión con el servidor.' && lostAuto.calls.createItems === 1);
  check('El SKU que asigna el sistema se calcula con lo que hay (nextSku) y cumple el formato', nextSku('Libro', seed.items.map(i => i.id)) === 'ITM-LIB-001' && SKU_PATTERN.test(nextSku('Libro', [])));

  console.log('--- Editar artículos');
  const target = m.data.items.find(i => i.id === 'LIB-1')!;
  const edited = await editItem(m.repo, ctxOf(m.data), 'LIB-1', { ...target, name: 'Libro Uno', cost: 12 });
  check('Editar: guarda el artículo completo', edited.ok && m.data.items.find(i => i.id === 'LIB-1')!.name === 'Libro Uno' && m.data.items.find(i => i.id === 'LIB-1')!.cost === 12, edited.error);
  const toggled = await editItem(m.repo, ctxOf(m.data), 'LIB-1', { ...m.data.items.find(i => i.id === 'LIB-1')!, status: 'Inactivo' });
  check('Editar: desactivar un artículo no lo elimina', toggled.ok && m.data.items.find(i => i.id === 'LIB-1')!.status === 'Inactivo');
  const resku = await editItem(m.repo, ctxOf(m.data), 'LIB-1', { ...target, id: 'LIB-X' });
  check('Editar: el SKU no se puede cambiar', !resku.ok && /no se puede cambiar/.test(resku.error ?? ''));
  const nope = await editItem(m.repo, ctxOf(m.data), 'NO-EXISTE', { ...target, id: 'NO-EXISTE' });
  check('Editar: un artículo que no existe devuelve un mensaje', !nope.ok && nope.error === 'No se encontró el artículo.');
  const badEdit = await editItem(m.repo, ctxOf(m.data), 'LIB-1', { ...target, bindingType: undefined });
  check('Editar: no cumple las reglas, no llega a la base', !badEdit.ok && m.calls.updateItem === 2);

  console.log('--- Precios');
  const p1 = await registerPrice(m.repo, ctxOf(m.data), { itemId: 'ITM-LIB-K1', branchId: 'all', amount: 70, validFrom: '2026-06-01' });
  const old = m.data.prices.find(p => p.id === 'PRC-001')!;
  check('Precio nuevo: cierra la vigencia anterior el día anterior y deja el historial', p1.ok && old.validTo === '2026-05-31' && old.amount === 60 && m.data.prices.some(p => p.amount === 70 && !p.validTo), p1.error);
  const p2 = await registerPrice(m.repo, ctxOf(m.data), { itemId: 'ITM-LIB-K1', branchId: 'all', amount: 70, validFrom: '2026-06-01' });
  const p3 = await registerPrice(m.repo, ctxOf(m.data), { itemId: 'ITM-LIB-K1', branchId: 'all', amount: 75, validFrom: '2026-03-01' });
  const p4 = await registerPrice(m.repo, ctxOf(m.data), { itemId: 'ITM-LIB-K1', branchId: 'all', amount: 0, validFrom: '2026-08-01' });
  check('Precio nuevo: fecha repetida, anterior a una vigencia posterior o de 0 no llegan a la base', !p2.ok && !p3.ok && !p4.ok && m.calls.addPrice === 1);
  const p5 = await registerPrice(m.repo, ctxOf(m.data), { itemId: 'ITM-LIB-K1', branchId: 'FIL-003', amount: 65, validFrom: '2026-06-15' });
  check('Precio por sede: no cierra el general', p5.ok && !m.data.prices.find(p => p.amount === 70)!.validTo);
  const p6 = await registerPrice(m.repo, ctxOf(m.data), { itemId: 'NO', branchId: 'all', amount: 10, validFrom: '2026-08-01' });
  check('Precio nuevo: de un artículo que no existe, se rechaza', !p6.ok && p6.error === 'No se encontró el artículo.');

  console.log('--- Recetas');
  const rc = await saveRecipe(m.repo, ctxOf(m.data), recipe({ name: 'Pack Kids Nivel 3', levelId: '3' }));
  check('Crear receta: el sistema asigna REC-004 (la siguiente) y la guarda', rc.ok && rc.id === 'REC-004' && m.data.recipes.some(r => r.id === 'REC-004'), rc.error);
  const clash = await saveRecipe(m.repo, ctxOf(m.data), recipe({ name: 'Otra del nivel 3', levelId: '3' }));
  check('Crear receta: si choca con una activa, avisa con su nombre y no llega a la base', !clash.ok && /Pack Kids Nivel 3/.test(clash.error ?? '') && /se solapa/.test(clash.error ?? '') && m.calls.insertRecipe === 1);
  const many = await saveRecipe(m.repo, ctxOf(m.data), recipe({ name: '', programId: '99', levelId: undefined, items: [] }));
  check('Crear receta: los errores vienen juntos, separados por saltos de línea', !many.ok && (many.error ?? '').split('\n').length >= 3);
  const retry = memoryRepo(base(), { conflicts: 2 });
  const retried = await saveRecipe(retry.repo, ctxOf(retry.data), recipe());
  check('Crear receta: si dos personas crean a la vez (id repetido), reintenta con el siguiente', retried.ok && retry.calls.insertRecipe === 3);
  const giveUp = memoryRepo(base(), { conflicts: 9 });
  const gaveUp = await saveRecipe(giveUp.repo, ctxOf(giveUp.data), recipe());
  check('Crear receta: tras 3 intentos fallidos se rinde con un mensaje', !gaveUp.ok && /asignar un código a la receta/.test(gaveUp.error ?? '') && giveUp.calls.insertRecipe === 3);
  const upd = await saveRecipe(m.repo, ctxOf(m.data), { ...m.data.recipes.find(r => r.id === 'REC-004')!, name: 'Pack Kids 3 (renombrado)' });
  check('Editar receta: se guarda con su mismo id', upd.ok && upd.id === 'REC-004' && m.data.recipes.find(r => r.id === 'REC-004')!.name === 'Pack Kids 3 (renombrado)');
  const ghost = await saveRecipe(m.repo, ctxOf(m.data), recipe({ id: 'REC-099' }));
  check('Editar receta: una que no existe devuelve un mensaje', !ghost.ok && ghost.error === 'No se encontró la receta.');
  const dupe = await duplicateRecipe(m.repo, ctxOf(m.data), 'REC-001');
  const copy = m.data.recipes.find(r => r.id === dupe.id)!;
  check('Duplicar receta: la copia nace inactiva, con otro id y «(Copia)» en el nombre', dupe.ok && copy.status === 'Inactivo' && copy.id !== 'REC-001' && /\(Copia\)$/.test(copy.name) && same(copy.items, m.data.recipes.find(r => r.id === 'REC-001')!.items));
  const noSource = await duplicateRecipe(m.repo, ctxOf(m.data), 'REC-099');
  check('Duplicar receta: una que no existe devuelve un mensaje', !noSource.ok && noSource.error === 'No se encontró la receta.');
  const activate = await setRecipeStatus(m.repo, ctxOf(m.data), copy.id, 'Activo');
  check('Activar receta: si choca con otra activa, no se activa y el mensaje la nombra', !activate.ok && /No se puede activar/.test(activate.error ?? '') && /Pack Kids Nivel 1 2024/.test(activate.error ?? '') && m.data.recipes.find(r => r.id === copy.id)!.status === 'Inactivo');
  const off = await setRecipeStatus(m.repo, ctxOf(m.data), 'REC-001', 'Inactivo');
  const on = await setRecipeStatus(m.repo, ctxOf(m.data), copy.id, 'Activo');
  check('Activar receta: sí cuando se desactiva la que chocaba', off.ok && on.ok && m.data.recipes.find(r => r.id === copy.id)!.status === 'Activo');
  const same3 = await setRecipeStatus(m.repo, ctxOf(m.data), copy.id, 'Activo');
  check('Cambiar el estado al que ya tiene no hace falta (sin error)', same3.ok);

  // -------------------------------------------------------------------------------------------------------------------- La migración, la carga y el cableado
  const migration = read('supabase/migrations/20261107210000_articulos_y_recetas.sql');
  const tables = ['articulos', 'articulo_precios', 'recetas'];
  check('La migración crea las 3 tablas con seguridad por filas y sin acceso para anon', tables.every(t => migration.includes(`create table public.${t}`) && new RegExp(`alter table public\\.${t}\\s+enable row level security`).test(migration)) && /revoke all on public\.articulos, public\.articulo_precios, public\.recetas from public, anon, authenticated/.test(migration) && !/to anon/.test(migration.replace(/from public, anon(, authenticated)?/g, '')));
  const used = [...migration.matchAll(/(?:tiene_funcion|permite)\('([a-z-]+:[a-z_]+)'\)/g)].map(x => x[1]);
  check('Cada función que pide la base existe en el registro de funciones (no se desfasan)', used.length >= 6 && used.every(id => !!capabilityById(id)), used.filter(id => !capabilityById(id)).join());
  check('Los artículos y los precios no se escriben directo: las altas y los precios pasan por funciones; nada se elimina', /grant select, update on public\.articulos to authenticated/.test(migration) && /grant select on public\.articulo_precios to authenticated/.test(migration) && /grant select, insert, update on public\.recetas to authenticated/.test(migration) && !/grant[^;]*delete[^;]*public\.(articulos|articulo_precios|recetas)/.test(migration));
  check('Leer lo puede cualquier cuenta vigente; escribir pide la función de cada pantalla', tables.every(t => new RegExp(`create policy ${t}_leer on public\\.${t} for select to authenticated using \\(\\(select app\\.acceso_vigente\\(\\)\\)\\)`).test(migration))
    && /log-catalogo:create/.test(migration) && /log-catalogo:edit_price/.test(migration) && /log-catalogo:edit/.test(migration) && /com-recetas:create/.test(migration) && /com-recetas:edit/.test(migration) && /com-recetas:deactivate/.test(migration));
  check('La base vuelve a comprobar la regla de «una sola receta activa» y el historial de precios', /se solapa en programa, nivel, sede y período/.test(migration) && /pg_advisory_xact_lock/.test(migration) && /vigente_hasta = p_desde - 1/.test(migration));
  check('La migración tiene su archivo para deshacer (y devuelve los guardias de la 0010)', /drop table if exists public\.recetas/.test(read('supabase/deshacer/20261107210000_articulos_y_recetas.down.sql')) && /create or replace function app\.programa_eliminar_guarda/.test(read('supabase/deshacer/20261107210000_articulos_y_recetas.down.sql')));

  // -------------------------------------------------------------------------------------------------------------------- La migración 0016 (reglas de artículos y kits)
  const m16 = read('supabase/migrations/20261111100000_reglas_de_articulos_y_kits.sql');
  const d16 = read('supabase/deshacer/20261111100000_reglas_de_articulos_y_kits.down.sql');
  const unitsIn = [...m16.matchAll(/not in \(('Unidad'[^)]*)\)/g)].map(x => x[1].split(',').map(u => u.trim().replace(/'/g, '')).join());
  check('0016: el tipo pasa a «Kit» y se quitan «se_vende» y «permite_desempaquetar»', /update public\.articulos set tipo = 'Kit' where tipo = 'Paquete \/ kit logístico'/.test(m16) && /check \(tipo in \('Material educativo', 'Herramienta \/ adicional', 'Libro', 'Kit'\)\)/.test(m16) && /drop column se_vende, drop column permite_desempaquetar/.test(m16));
  check('0016: la lista de unidades de la base es la del sistema (ITEM_UNITS)', unitsIn.length >= 1 && unitsIn.every(u => u === ITEM_UNITS.join()), unitsIn.join(' | '));
  check('0016: un kit exige composición, sin kits dentro de kits, y solo un Kit es kit; el material educativo siempre se entrega con la matrícula',
    /Un kit debe definir su composición/.test(m16) && /Un kit no puede contener otro kit/.test(m16) && /Solo un artículo de tipo Kit puede ser un kit/.test(m16) && /El material educativo siempre se entrega con la matrícula/.test(m16));
  check('0016: todo artículo se crea con su precio de referencia (y se vende sin mirar «se vende»)', /Indique el precio de referencia \(USD\) de cada artículo/.test(m16) && !/se_vende/.test(m16.replace(/--.*$/gm, '').replace(/drop column se_vende[^;]*;/, '')));
  check('0016: desarmar un kit pide siempre el motivo (máximo igual al del sistema) y tiene su función propia; armar, la suya',
    /desempaquetar_articulo\(p_ubicacion text, p_articulo text, p_motivo text\)/.test(m16) && /Indique el motivo del desempaquetado/.test(m16) && new RegExp(`length\\(v_mot\\) > ${UNPACK_REASON_MAX}`).test(m16)
    && /app\.exigir\('log-stock:unpack'/.test(m16) && /app\.exigir\('log-stock:pack'/.test(m16) && !!capabilityById('log-stock:unpack') && !!capabilityById('log-stock:pack')
    && capabilityById('log-stock:unpack')!.actions?.includes('unpackPackage') && !capabilityById('log-stock:pack')!.actions?.includes('unpackPackage'));
  check('0016: los roles que ya podían armar reciben la función de desarmar', /select rf\.rol_id, 'log-stock:unpack' from public\.rol_funciones rf where rf\.funcion_id = 'log-stock:pack'/.test(m16));
  check('0016: una receta activa no puede llevar un kit y uno de sus artículos', /create trigger recetas_kit_componente/.test(m16) && /se entregaría dos veces/.test(m16));
  check('0016: cada función que pide la base existe en el registro de funciones', [...m16.matchAll(/(?:exigir|permite)\('([a-z-]+:[a-z_]+)'/g)].every(x => !!capabilityById(x[1])));
  check('0016: tiene su archivo para deshacer (vuelven las columnas, el tipo viejo y las funciones de antes)', /add column se_vende boolean/.test(d16) && /permite_desempaquetar boolean/.test(d16) && /'Paquete \/ kit logístico'/.test(d16) && /create function app\.paquete_de/.test(d16) && /drop function if exists app\.receta_kit_componente/.test(d16));
  check('La función de usuarios cuenta «Desarmar kits» entre las que mueven el almacén', /'log-stock:unpack'/.test(read('supabase/functions/usuarios/reglas.ts')));
  check('El repositorio de Supabase manda el motivo al desarmar', /p_motivo: reason/.test(read('src/services/logisticsRepository.ts')));

  const seedFile = read('supabase/seed/articulos_y_recetas.sql');
  check('La carga de partida (supabase/seed/articulos_y_recetas.sql) está al día con los datos de ejemplo', seedFile === renderItemsSeedSql().replace(/\r\n/g, '\n'), 'ejecute: npx tsx scripts/doc-articulos-seed.ts');
  check('La carga es repetible, todo o nada, y carga los paquetes después de sus componentes', /on conflict do nothing/.test(seedFile) && /^begin;$/m.test(seedFile) && /^commit;$/m.test(seedFile) && seedFile.indexOf("'ITM-HER-01'") < seedFile.indexOf("'ITM-KIT-BIENV'"));

  const ctxSrc = read('src/context/DataContext.tsx');
  check('El contexto ya no guarda artículos, precios ni recetas en memoria: los toma de la base con useItemCatalog', /const itemCat = useItemCatalog\(itemCatalogData, \{ programs, levels, branches \}\)/.test(ctxSrc) && /const \{ items, itemPrices, recipes \} = itemCat/.test(ctxSrc) && !/useState<(Item|ItemPrice|Recipe)\[\]>/.test(ctxSrc) && !/setItems|setItemPrices|setRecipes/.test(ctxSrc));
  check('Las acciones de artículos, precios y recetas son asíncronas', /addItems: \(drafts: ItemDraft\[\]\) => Promise<StockResult & \{ ids\?: string\[\] \}>/.test(ctxSrc) && /addItemPrice: \(price: [^)]*\) => Promise</.test(ctxSrc) && /saveRecipe: \(recipe: Recipe\) => Promise</.test(ctxSrc) && /setRecipeStatus: \(id: string, status: Recipe\['status'\]\) => Promise<StockResult>/.test(ctxSrc));
  check('Ninguna de estas acciones queda en la lista de las que lanzan error al negar el permiso', !['addItems', 'updateItem', 'addItemPrice', 'saveRecipe', 'duplicateRecipe', 'setRecipeStatus'].some(a => THROWS_ON_DENIAL.has(a)));
  const gate = read('src/components/auth/AccessGate.tsx');
  check('Los artículos y las recetas se leen al iniciar sesión (antes de montar el sistema)', /loadItemCatalog\(itemRepo\)/.test(gate) && /loaded\.catalog, loaded\.items, loaded\.logistics, loaded\.people, loaded\.money, loaded\.cashBoxes, loaded\.collection, loaded\.agenda\)/.test(gate) && /itemCatalog=\{itemCatalog\}/.test(read('src/App.tsx')));
  const hook = read('src/hooks/useItemCatalog.ts');
  check('El gancho arranca con lo ya leído y valida contra lo último que se vio', /useItemCatalog\(initial: ItemCatalogData/.test(hook) && /useState<Item\[\]>\(initial\.items\)/.test(hook) && /itemsRef\.current = items/.test(hook) && !/useEffect/.test(hook));
  const catalogPage = read('src/pages/logistics/ItemCatalog.tsx');
  const pricesPage = read('src/pages/logistics/ItemPricesModal.tsx');
  const recipesPage = read('src/pages/commercial/Recipes.tsx');
  check('Las pantallas esperan el resultado (artículos, precios y recetas) y no se guarda dos veces', /const handleSave = async/.test(catalogPage) && /await addItems\(/.test(catalogPage) && /disabled=\{saving\}/.test(catalogPage) && /const handleAdd = async/.test(pricesPage) && /await addItemPrice\(/.test(pricesPage) && /const handleSaveRecipe = async/.test(recipesPage) && /await saveRecipe\(/.test(recipesPage) && /await duplicateRecipe\(/.test(recipesPage) && /await setRecipeStatus\(/.test(recipesPage));
  check('Nadie escribe el SKU: el formulario ya no lo pide (al crear lo asigna el sistema; al editar se ve y no cambia), la carga masiva no lo trae y se avisa con el código asignado',
    !/placeholder="Ej\. ART-001"/.test(catalogPage) && /nextSku\(/.test(catalogPage) && /Lo asignó el sistema y no cambia/.test(catalogPage) && /addItems\(\[\{ item: withoutSku/.test(catalogPage) && /Artículo creado con el código/.test(catalogPage)
    && /await addItems\(bulk\.result\.drafts\)/.test(catalogPage) && !BULK_HEADERS.some(h => /sku/i.test(h)) && /createItemsAuto\(repo/.test(hook));
  check('Activar o desactivar un artículo muestra el motivo si falla', /useActionError/.test(catalogPage) && /actionError\.run\(updateItem\(/.test(catalogPage) && /role="alert"/.test(catalogPage));
  check('El formulario ya no tiene «¿Se vende?» ni «¿Permite desempaquetado?»: una sola pregunta («¿Se entrega con la matrícula?», fija en sí para el material educativo) y el resumen en vivo',
    !/isSold|allowUnpacking|¿Se vende\?|Permite desempaquetado/.test(catalogPage) && /¿Se entrega con la matrícula\?/.test(catalogPage) && /disabled=\{formData\.type === 'Material educativo'\}/.test(catalogPage) && /itemSummaryLines\(/.test(catalogPage));
  check('Todo artículo pide su precio de referencia al crearlo (el kit propone la suma de sus artículos) y se marcan los que no lo tienen',
    /Precio de referencia \(USD\)/.test(catalogPage) && /Indique el precio de referencia \(USD\) del artículo/.test(catalogPage) && /addItems\(\[\{ item: withoutSku, price: priceValue \}\]\)/.test(catalogPage)
    && /suggestedKitPrice\(/.test(catalogPage) && /Sin precio de referencia/.test(catalogPage) && /value="missing"/.test(catalogPage));
  check('La unidad de medida es una lista corta y un kit propone «Kit»; el libro dice «Encuadernado» (solo información); el kit no admite kits dentro y lleva su composición obligatoria',
    /ITEM_UNITS\.map/.test(catalogPage) && /defaultUnitFor\(type\)/.test(catalogPage) && /Encuadernado <span/.test(catalogPage) && /i\.type !== 'Kit'/.test(catalogPage) && /Composición del kit/.test(catalogPage) && !/Paquete \/ kit logístico|Paquete logístico/.test(catalogPage));

  if (failed > 0) {
    console.log(`\n${failed} comprobaciones fallaron.`);
    process.exit(1);
  }
  console.log('\nTodas las comprobaciones pasaron.');
}

run().catch(e => { console.error(e); process.exit(1); });
