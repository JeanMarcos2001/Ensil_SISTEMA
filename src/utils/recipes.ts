/**
 * Recetas de materiales (funciones puras): qué se valida al guardar, cuándo dos recetas se solapan y cómo nace una copia.
 *
 * Regla de fondo: para un mismo programa, nivel, sede y período solo puede haber UNA receta activa; si no, la verificación no sabría qué
 * entregar. Por eso una receta duplicada nace **inactiva** y activar una receta vuelve a comprobar el solape.
 */
import type { Item, Recipe } from '../context/DataContext';
import { getRecipeSelectableItems } from './inventory';

const FOREVER = '9999-12-31';

/** ¿Las dos recetas piden lo mismo para el mismo programa, nivel, sede y período? (sin mirar su estado) */
export function recipesOverlap(a: Pick<Recipe, 'programId' | 'levelId' | 'applyToAllBranches' | 'branchIds' | 'startDate' | 'endDate'>, b: Pick<Recipe, 'programId' | 'levelId' | 'applyToAllBranches' | 'branchIds' | 'startDate' | 'endDate'>): boolean {
  if (a.programId !== b.programId) return false;
  // Sin nivel = todos los niveles: se solapa con cualquiera
  if (a.levelId && b.levelId && a.levelId !== b.levelId) return false;
  const sharedBranch = a.applyToAllBranches || b.applyToAllBranches || a.branchIds.some(id => b.branchIds.includes(id));
  if (!sharedBranch) return false;
  return b.startDate <= (a.endDate || FOREVER) && (b.endDate || FOREVER) >= a.startDate;
}

/** La receta activa con la que choca (si la receta a guardar está activa). */
export function overlappingRecipe(recipe: Recipe, recipes: Recipe[]): Recipe | undefined {
  if (recipe.status !== 'Activo') return undefined;
  return recipes.find(r => r.id !== recipe.id && r.status === 'Activo' && recipesOverlap(r, recipe));
}

/** Todos los errores de una receta, juntos (vacío = se puede guardar). `recipes` son las demás recetas del sistema. */
export function validateRecipe(recipe: Recipe, recipes: Recipe[], items: Item[], previous?: Recipe): string[] {
  const errors: string[] = [];
  if (!recipe.name?.trim()) errors.push('El nombre es obligatorio.');
  if (!recipe.programId) errors.push('El programa es obligatorio.');
  const lines = recipe.items ?? [];
  if (lines.length === 0) errors.push('Debe agregar al menos un artículo.');
  if (lines.some(l => !l.itemId)) errors.push('Seleccione el artículo en todas las filas.');
  if (new Set(lines.map(l => l.itemId)).size !== lines.length) errors.push('Hay artículos repetidos en la receta.');
  if (lines.some(l => !(l.quantity >= 1))) errors.push('Las cantidades deben ser mayores a 0.');
  const selectable = getRecipeSelectableItems(items, previous?.items.map(l => l.itemId) ?? []);
  if (lines.some(l => l.itemId && !selectable.some(i => i.id === l.itemId))) errors.push('Hay artículos inactivos o no habilitados para matrícula en la receta.');
  if (!recipe.startDate) errors.push('La fecha de inicio es obligatoria.');
  if (recipe.endDate && recipe.startDate && recipe.endDate < recipe.startDate) errors.push('La fecha de fin no puede ser anterior a la de inicio.');
  if (!recipe.applyToAllBranches && (recipe.branchIds ?? []).length === 0) errors.push('Elija al menos una sede o aplique la receta a todas.');
  const clash = overlappingRecipe(recipe, recipes);
  if (clash) errors.push(`Ya existe una receta activa ("${clash.name}") que se solapa en programa, nivel, sede y período.`);
  return errors;
}

/** Copia de una receta: nace inactiva (si no, chocaría con la original) y con su propio id. */
export function duplicateRecipe(recipe: Recipe, id: string): Recipe {
  return { ...recipe, id, name: `${recipe.name} (Copia)`, status: 'Inactivo', items: recipe.items.map(l => ({ ...l })), branchIds: [...recipe.branchIds] };
}

/** ¿Se puede cambiar el estado de la receta? Activarla exige que no choque con otra activa. */
export function recipeStatusError(recipe: Recipe, next: Recipe['status'], recipes: Recipe[]): string | null {
  if (next === recipe.status) return null;
  if (next === 'Activo') {
    const clash = overlappingRecipe({ ...recipe, status: 'Activo' }, recipes);
    if (clash) return `No se puede activar: se solapa con la receta activa "${clash.name}". Desactívela primero o ajuste el período.`;
  }
  return null;
}
