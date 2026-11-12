import { useCallback, useMemo, useRef, useState } from 'react';
import type { Branch, Item, ItemPrice, Level, Program, Recipe } from '../context/DataContext';
import { supabase } from '../lib/supabase';
import {
  createItemsAuto, duplicateRecipe, editItem, loadItemCatalog, registerPrice, saveRecipe, setRecipeStatus,
  type ItemCatalogContext, type ItemCatalogData,
} from '../services/itemCatalog';
import { createSupabaseItemCatalogRepository, sortItems, sortRecipes } from '../services/itemCatalogRepository';
import type { OpResult } from '../services/orgDirectory';
import { withComponentNames } from '../utils/itemsDb';
import type { ItemDraft, PriceInput } from '../utils/inventory';
import { todayLocalISO } from '../utils/schedule';

/** Lo que las reglas necesitan saber del catálogo comercial y de las sedes para comprobar las referencias. */
export interface ItemCatalogRefs {
  programs: Pick<Program, 'id' | 'hasLevels'>[];
  levels: Pick<Level, 'id' | 'programId'>[];
  branches: Pick<Branch, 'id'>[];
}

/**
 * Artículos, precios de venta y recetas de materiales guardados en la base de datos: arranca con lo que `AccessGate` leyó al iniciar sesión
 * y se mantiene al día con cada operación. Las reglas y el orden «validar → guardar» están en `services/itemCatalog.ts`; aquí solo se
 * guarda el estado de React. Cada operación devuelve `{ ok, error }` como las demás acciones del contexto (nunca lanza).
 */
export function useItemCatalog(initial: ItemCatalogData, refs: ItemCatalogRefs) {
  const repo = useMemo(() => createSupabaseItemCatalogRepository(supabase), []);
  const [rawItems, setRawItems] = useState<Item[]>(initial.items);
  const [prices, setPrices] = useState<ItemPrice[]>(initial.prices);
  const [recipes, setRecipes] = useState<Recipe[]>(initial.recipes);
  const items = useMemo(() => withComponentNames(rawItems), [rawItems]);

  // Las operaciones validan contra lo último que se vio (no contra la lista de cuando se creó la función).
  const itemsRef = useRef(items); itemsRef.current = items;
  const pricesRef = useRef(prices); pricesRef.current = prices;
  const recipesRef = useRef(recipes); recipesRef.current = recipes;
  const refsRef = useRef(refs); refsRef.current = refs;
  const context = (): ItemCatalogContext => ({ items: itemsRef.current, prices: pricesRef.current, recipes: recipesRef.current, ...refsRef.current });

  const reload = useCallback(async (): Promise<OpResult> => {
    const res = await loadItemCatalog(repo);
    if (!res.ok || !res.value) return { ok: false, error: res.error ?? 'No se pudieron cargar los artículos y las recetas.' };
    setRawItems(res.value.items); setPrices(res.value.prices); setRecipes(res.value.recipes);
    return { ok: true };
  }, [repo]);

  /** Crea artículos sin SKU: el sistema asigna el de cada uno y lo devuelve en `ids` (en el orden de los borradores). */
  const addItems = useCallback(async (drafts: ItemDraft[]): Promise<OpResult & { ids?: string[] }> => {
    const res = await createItemsAuto(repo, context(), drafts, todayLocalISO());
    if (res.ok && res.value) { setRawItems(res.value.items); setPrices(res.value.prices); }
    return { ok: res.ok, error: res.error, ...(res.value ? { ids: res.value.ids } : {}) };
  }, [repo]);

  const updateItem = useCallback(async (id: string, item: Item): Promise<OpResult> => {
    const res = await editItem(repo, context(), id, item);
    if (res.ok && res.value) setRawItems(prev => sortItems(prev.map(i => (i.id === id ? res.value! : i))));
    return { ok: res.ok, error: res.error };
  }, [repo]);

  const addItemPrice = useCallback(async (price: PriceInput): Promise<OpResult> => {
    const res = await registerPrice(repo, context(), price);
    if (res.ok && res.value) setPrices(res.value);
    return { ok: res.ok, error: res.error };
  }, [repo]);

  const saveRecipeOp = useCallback(async (recipe: Recipe): Promise<OpResult & { id?: string }> => {
    const res = await saveRecipe(repo, context(), recipe);
    if (res.ok && res.value) {
      const saved = res.value;
      setRecipes(prev => sortRecipes(prev.some(r => r.id === saved.id) ? prev.map(r => (r.id === saved.id ? saved : r)) : [...prev, saved]));
    }
    return { ok: res.ok, error: res.error, id: res.id };
  }, [repo]);

  const duplicateRecipeOp = useCallback(async (id: string): Promise<OpResult & { id?: string }> => {
    const res = await duplicateRecipe(repo, context(), id);
    if (res.ok && res.value) { const copy = res.value; setRecipes(prev => sortRecipes([...prev, copy])); }
    return { ok: res.ok, error: res.error, id: res.id };
  }, [repo]);

  const setRecipeStatusOp = useCallback(async (id: string, status: Recipe['status']): Promise<OpResult> => {
    const res = await setRecipeStatus(repo, context(), id, status);
    if (res.ok && res.value) { const saved = res.value; setRecipes(prev => prev.map(r => (r.id === id ? saved : r))); }
    return { ok: res.ok, error: res.error };
  }, [repo]);

  return {
    items, itemPrices: prices, recipes, reload,
    addItems, updateItem, addItemPrice, saveRecipe: saveRecipeOp, duplicateRecipe: duplicateRecipeOp, setRecipeStatus: setRecipeStatusOp,
  };
}
