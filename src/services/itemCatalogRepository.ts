/**
 * Repositorio de artículos, precios y recetas sobre Supabase (tablas `articulos`, `articulo_precios` y `recetas`, y las funciones
 * `crear_articulos` y `agregar_precio_articulo`). Solo traduce: filas ↔ modelo del sistema y errores de la base ↔ mensajes claros. Las
 * reglas y el orden de las operaciones viven en `utils/inventory.ts`, `utils/recipes.ts` y `services/itemCatalog.ts`. La seguridad no está
 * aquí: la deciden las políticas y las funciones de la base según la cuenta que inició sesión.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Item, ItemPrice, Recipe } from '../context/DataContext';
import type { PriceInput } from '../utils/inventory';
import {
  isItemIdConflict, isRecipeIdConflict, itemFromRow, itemToRow, itemsErrorMessage, priceFromRow, recipeFromRow, recipeToRow, withComponentNames,
  type ArticuloRow, type PrecioRow, type RecetaRow,
} from '../utils/itemsDb';
import type { RepoResult } from './orgDirectory';
import type { ItemCatalogData, ItemCatalogRepository } from './itemCatalog';

const failure = <T>(error: { code?: string; message?: string; details?: string } | null): RepoResult<T> =>
  ({ ok: false, error: itemsErrorMessage(error), idConflict: isRecipeIdConflict(error) || isItemIdConflict(error) });

/** Cuando una actualización no toca ninguna fila, la política de seguridad la ocultó (o ya no existe). */
const NOT_TOUCHED = 'No se pudo completar: el registro ya no existe o su cuenta no tiene permiso para cambiarlo.';

/** Los artículos por SKU, los precios del más antiguo al más nuevo y las recetas con la más reciente primero. */
export const sortItems = (items: Item[]): Item[] => [...items].sort((a, b) => a.id.localeCompare(b.id));
export const sortRecipes = (recipes: Recipe[]): Recipe[] => [...recipes].sort((a, b) => b.id.localeCompare(a.id));
export const sortPrices = (prices: ItemPrice[]): ItemPrice[] => [...prices].sort((a, b) => a.id.localeCompare(b.id));

export function createSupabaseItemCatalogRepository(client: SupabaseClient): ItemCatalogRepository {
  async function listAll(): Promise<RepoResult<ItemCatalogData>> {
    const [a, p, r] = await Promise.all([
      client.from('articulos').select('*'), client.from('articulo_precios').select('*'), client.from('recetas').select('*'),
    ]);
    const error = a.error ?? p.error ?? r.error;
    if (error) return failure(error);
    return {
      ok: true,
      data: {
        items: withComponentNames(sortItems((a.data as ArticuloRow[]).map(itemFromRow))),
        prices: sortPrices((p.data as PrecioRow[]).map(priceFromRow)),
        recipes: sortRecipes((r.data as RecetaRow[]).map(recipeFromRow)),
      },
    };
  }

  return {
    list: listAll,
    async createItems(items, prices) {
      const { error } = await client.rpc('crear_articulos', {
        p_articulos: items.map(itemToRow),
        p_precios: prices.map(p => ({ articulo_id: p.itemId, monto: p.amount, desde: p.validFrom })),
      });
      if (error) return failure(error);
      const all = await listAll();
      return all.ok && all.data ? { ok: true, data: { items: all.data.items, prices: all.data.prices } } : failure(null);
    },
    async updateItem(item) {
      const { id, ...row } = itemToRow(item);
      const { data, error } = await client.from('articulos').update(row).eq('id', id).select();
      if (error) return failure(error);
      return data && data.length === 1 ? { ok: true, data: itemFromRow(data[0] as ArticuloRow) } : { ok: false, error: NOT_TOUCHED };
    },
    async addPrice(price: PriceInput) {
      const { error } = await client.rpc('agregar_precio_articulo', {
        p_articulo: price.itemId, p_sede: price.branchId === 'all' ? null : price.branchId, p_monto: price.amount, p_desde: price.validFrom,
      });
      if (error) return failure(error);
      const { data, error: listError } = await client.from('articulo_precios').select('*');
      return listError ? failure(listError) : { ok: true, data: sortPrices((data as PrecioRow[]).map(priceFromRow)) };
    },
    async insertRecipe(recipe) {
      const { data, error } = await client.from('recetas').insert(recipeToRow(recipe)).select().single();
      return error ? failure(error) : { ok: true, data: recipeFromRow(data as RecetaRow) };
    },
    async updateRecipe(recipe) {
      const { id, ...row } = recipeToRow(recipe);
      const { data, error } = await client.from('recetas').update(row).eq('id', id).select();
      if (error) return failure(error);
      return data && data.length === 1 ? { ok: true, data: recipeFromRow(data[0] as RecetaRow) } : { ok: false, error: NOT_TOUCHED };
    },
  };
}
