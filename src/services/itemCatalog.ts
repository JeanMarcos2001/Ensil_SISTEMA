/**
 * Operaciones del Catálogo de artículos, sus precios de venta y las recetas de materiales sobre la base de datos: validan con las reglas
 * puras (`utils/inventory.ts`, `utils/recipes.ts`) y luego guardan.
 *
 * Reciben el repositorio como parámetro (el de Supabase en el sistema, uno en memoria en `scripts/check-items-db.ts`), de modo que el
 * orden «validar → guardar → traducir el error» se puede comprobar sin conexión. Ninguna toca el estado de React: devuelven lo que quedó
 * guardado y quien llama (el gancho `useItemCatalog`) lo aplica a su lista.
 */
import type { Branch, Item, ItemPrice, Level, Program, Recipe } from '../context/DataContext';
import { priceError, validateItem, type PriceInput } from '../utils/inventory';
import { nextSequentialId } from '../utils/ids';
import { duplicateRecipe as copyRecipe, recipeStatusError, validateRecipe } from '../utils/recipes';
import type { OpResult, RepoResult } from './orgDirectory';

export interface ItemCatalogData { items: Item[]; prices: ItemPrice[]; recipes: Recipe[] }

/** Con qué se comprueban las referencias: lo que ya hay y el catálogo comercial (programas, niveles) y las sedes. */
export interface ItemCatalogContext extends ItemCatalogData {
  programs: Pick<Program, 'id' | 'hasLevels'>[];
  levels: Pick<Level, 'id' | 'programId'>[];
  branches: Pick<Branch, 'id'>[];
}

export interface NewPrice { itemId: string; amount: number; validFrom: string }

export interface ItemCatalogRepository {
  list(): Promise<RepoResult<ItemCatalogData>>;
  /** Crea los artículos y sus precios generales, todo o nada; devuelve artículos y precios tal como quedaron guardados. */
  createItems(items: Item[], prices: NewPrice[]): Promise<RepoResult<{ items: Item[]; prices: ItemPrice[] }>>;
  updateItem(item: Item): Promise<RepoResult<Item>>;
  /** Registra un precio (cierra la vigencia abierta del mismo alcance); devuelve todos los precios tal como quedaron. */
  addPrice(price: PriceInput): Promise<RepoResult<ItemPrice[]>>;
  insertRecipe(recipe: Recipe): Promise<RepoResult<Recipe>>;
  updateRecipe(recipe: Recipe): Promise<RepoResult<Recipe>>;
}

const fail = (error: string): OpResult<never> => ({ ok: false, error });
const MAX_ID_ATTEMPTS = 3;

/** Lee de la base los artículos, sus precios y las recetas. Se lee al iniciar sesión (`AccessGate`), antes de montar las pantallas. */
export async function loadItemCatalog(repo: ItemCatalogRepository): Promise<OpResult<ItemCatalogData>> {
  const res = await repo.list();
  return res.ok && res.data ? { ok: true, value: res.data } : fail(res.error ?? 'No se pudieron cargar los artículos y las recetas.');
}

/**
 * Crea artículos (uno o una carga masiva) y los precios generales de los que se venden: todo o nada. `prices` son los precios generales
 * (USD) por artículo; rigen desde `today`.
 */
export async function createItems(
  repo: ItemCatalogRepository, ctx: ItemCatalogContext, newItems: Item[], prices: { itemId: string; amount: number }[], today: string,
): Promise<OpResult<{ items: Item[]; prices: ItemPrice[] }>> {
  if (newItems.length === 0) return fail('No hay artículos para guardar.');
  const accepted: Item[] = [];
  for (const item of newItems) {
    const problem = validateItem({ item, allItems: [...ctx.items, ...accepted] });
    if (problem) return fail(newItems.length > 1 ? `${item.id || 'Artículo'}: ${problem}` : problem);
    accepted.push(item);
  }
  const badPrice = prices.find(p => !(p.amount > 0) || !accepted.some(i => i.id === p.itemId));
  const unpriced = accepted.some(i => i.isSold && !prices.some(p => p.itemId === i.id));
  if (badPrice || unpriced) return fail('Indique el precio general de venta (USD) para un artículo que se vende.');
  const res = await repo.createItems(accepted, prices.map(p => ({ itemId: p.itemId, amount: Math.round(p.amount * 100) / 100, validFrom: today })));
  return res.ok && res.data ? { ok: true, value: res.data } : fail(res.error ?? 'No se pudo guardar el artículo.');
}

/** Edita un artículo (también activarlo o desactivarlo). El SKU no cambia. */
export async function editItem(repo: ItemCatalogRepository, ctx: ItemCatalogContext, id: string, item: Item): Promise<OpResult<Item>> {
  if (!ctx.items.some(i => i.id === id)) return fail('No se encontró el artículo.');
  if (item.id !== id) return fail('El código SKU de un artículo no se puede cambiar.');
  const problem = validateItem({ item, allItems: ctx.items, editingId: id });
  if (problem) return fail(problem);
  const res = await repo.updateItem(item);
  return res.ok && res.data ? { ok: true, value: res.data } : fail(res.error ?? 'No se pudo guardar el artículo.');
}

/** Registra un precio de venta nuevo: cierra la vigencia abierta del mismo alcance en lugar de sobrescribirla. */
export async function registerPrice(repo: ItemCatalogRepository, ctx: ItemCatalogContext, input: PriceInput): Promise<OpResult<ItemPrice[]>> {
  const problem = priceError(input, ctx.prices, { itemIds: ctx.items.map(i => i.id), branchIds: ctx.branches.map(b => b.id) });
  if (problem) return fail(problem);
  const res = await repo.addPrice({ ...input, amount: Math.round(input.amount * 100) / 100 });
  return res.ok && res.data ? { ok: true, value: res.data } : fail(res.error ?? 'No se pudo registrar el precio.');
}

const refsOf = (ctx: ItemCatalogContext) => ({ programs: ctx.programs, levels: ctx.levels, branches: ctx.branches });

/** Crea (id vacío) o edita una receta; valida los datos y que no se solape con otra activa. Los errores vienen separados por saltos de línea. */
export async function saveRecipe(repo: ItemCatalogRepository, ctx: ItemCatalogContext, recipe: Recipe): Promise<OpResult<Recipe> & { id?: string }> {
  const previous = recipe.id ? ctx.recipes.find(r => r.id === recipe.id) : undefined;
  if (recipe.id && !previous) return fail('No se encontró la receta.');
  const errors = validateRecipe(recipe, ctx.recipes.filter(r => r.id !== recipe.id), ctx.items, previous, refsOf(ctx));
  if (errors.length > 0) return fail(errors.join('\n'));
  if (previous) {
    const res = await repo.updateRecipe(recipe);
    return res.ok && res.data ? { ok: true, value: res.data, id: res.data.id } : fail(res.error ?? 'No se pudo guardar la receta.');
  }
  return insertWithNewId(repo, ctx, recipe);
}

/** El id `REC-NNN` lo asigna el sistema; si dos personas crean a la vez, se reintenta con el siguiente. */
async function insertWithNewId(repo: ItemCatalogRepository, ctx: ItemCatalogContext, recipe: Recipe): Promise<OpResult<Recipe> & { id?: string }> {
  const taken = ctx.recipes.map(r => r.id);
  for (let attempt = 0; attempt < MAX_ID_ATTEMPTS; attempt++) {
    const id = nextSequentialId('REC', taken);
    const res = await repo.insertRecipe({ ...recipe, id });
    if (res.ok && res.data) return { ok: true, value: res.data, id };
    if (!res.idConflict) return fail(res.error ?? 'No se pudo guardar la receta.');
    taken.push(id);
  }
  return fail('No se pudo asignar un código a la receta. Intente de nuevo.');
}

/** La copia nace inactiva (si no, chocaría con la original). */
export async function duplicateRecipe(repo: ItemCatalogRepository, ctx: ItemCatalogContext, id: string): Promise<OpResult<Recipe> & { id?: string }> {
  const source = ctx.recipes.find(r => r.id === id);
  if (!source) return fail('No se encontró la receta.');
  return insertWithNewId(repo, ctx, copyRecipe(source, ''));
}

/** Activar una receta exige que no choque con otra activa. */
export async function setRecipeStatus(repo: ItemCatalogRepository, ctx: ItemCatalogContext, id: string, status: Recipe['status']): Promise<OpResult<Recipe>> {
  const recipe = ctx.recipes.find(r => r.id === id);
  if (!recipe) return fail('No se encontró la receta.');
  const problem = recipeStatusError(recipe, status, ctx.recipes);
  if (problem) return fail(problem);
  const res = await repo.updateRecipe({ ...recipe, status });
  return res.ok && res.data ? { ok: true, value: res.data } : fail(res.error ?? 'No se pudo cambiar el estado de la receta.');
}
