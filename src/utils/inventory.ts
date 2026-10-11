/**
 * Reglas del Catálogo de artículos, precios de venta vigentes y disponibilidad para entrega.
 * Funciones puras (sin estado). El Catálogo de Logística es la ÚNICA fuente de artículos.
 */
import type { Item, ItemPrice, StockItem } from '../context/DataContext';

export const todayISO = (): string => new Date().toISOString().slice(0, 10);

/**
 * Precio de venta vigente (USD) de un artículo en una sede y fecha.
 * Una excepción por sede vigente gana sobre el precio general.
 */
export function getCurrentPrice(
  prices: ItemPrice[],
  itemId: string,
  branchId: string,
  date: string = todayISO()
): ItemPrice | undefined {
  const valid = prices.filter(
    p => p.itemId === itemId && p.validFrom <= date && (!p.validTo || date <= p.validTo)
  );
  const pick = (scope: string) =>
    valid.filter(p => p.branchId === scope).sort((a, b) => b.validFrom.localeCompare(a.validFrom))[0];
  return (branchId !== 'all' ? pick(branchId) : undefined) ?? pick('all');
}

/** Historial de precios de un artículo (más reciente primero). */
export function getPriceHistory(prices: ItemPrice[], itemId: string): ItemPrice[] {
  return prices
    .filter(p => p.itemId === itemId)
    .sort((a, b) => b.validFrom.localeCompare(a.validFrom) || b.createdAt.localeCompare(a.createdAt));
}

/** Stock disponible de un artículo en una sede. */
export function availableStock(stockItems: StockItem[], branchId: string, itemId: string): number {
  return stockItems.find(s => s.branchId === branchId && s.itemId === itemId)?.stock ?? 0;
}

/**
 * Artículos que pueden elegirse en una Receta: activos y habilitados para matrícula.
 * `keepIds` conserva artículos ya presentes en la receta que se edita, aunque hoy no cumplan.
 */
export function getRecipeSelectableItems(items: Item[], keepIds: string[] = []): Item[] {
  return items.filter(i => (i.status === 'Activo' && i.isDeliveredOnEnrollment) || keepIds.includes(i.id));
}

/**
 * Un artículo requerido por una receta se puede marcar como entregado solo si hay stock suficiente
 * en la sede (o si ya fue entregado antes).
 */
export function canDeliver(stockItems: StockItem[], branchId: string, itemId: string, quantity: number): boolean {
  return availableStock(stockItems, branchId, itemId) >= quantity;
}

export interface ItemValidationInput {
  item: Partial<Item>;
  allItems: Item[];
  /** SKU del artículo que se está editando (para no marcarlo como duplicado). */
  editingId?: string;
}

/** Valida un artículo del catálogo. Devuelve el mensaje de error o `null`. */
export function validateItem({ item, allItems, editingId }: ItemValidationInput): string | null {
  if (!item.id?.trim()) return 'El código SKU es obligatorio.';
  if (!item.name?.trim()) return 'El nombre del artículo es obligatorio.';
  if (allItems.some(i => i.id === item.id && i.id !== editingId)) return 'El código SKU ya existe en el sistema.';

  if (item.type === 'Libro' && !item.bindingType) return 'Seleccione el tipo de libro (Anillado o Encolado).';

  if (item.type === 'Paquete / kit logístico') {
    const composition = item.composition ?? [];
    if (item.allowUnpacking && composition.length === 0) {
      return 'Un paquete que permite desempaquetado debe definir su composición (artículos y cantidades).';
    }
    if (composition.some(c => !c.itemId || !(c.quantity >= 1))) {
      return 'Cada componente del paquete debe tener un artículo y una cantidad mayor a 0.';
    }
    if (composition.some(c => c.itemId === item.id)) return 'Un paquete no puede contenerse a sí mismo.';
    if (new Set(composition.map(c => c.itemId)).size !== composition.length) {
      return 'La composición tiene artículos repetidos.';
    }
  }
  return null;
}
