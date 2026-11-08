/**
 * Reglas del Catálogo de artículos, precios de venta vigentes y disponibilidad para entrega.
 * Funciones puras (sin estado). El Catálogo de Logística es la ÚNICA fuente de artículos.
 */
import type { Item, ItemPrice, StockItem } from '../context/DataContext';
import { todayLocalISO } from './schedule';

export const todayISO = (): string => todayLocalISO();

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

/** El SKU de un artículo: letras, números, punto, guion y guion bajo; hasta 40 caracteres (la base de datos lo exige igual). */
export const SKU_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/;

/** Valida un artículo del catálogo. Devuelve el mensaje de error o `null`. */
export function validateItem({ item, allItems, editingId }: ItemValidationInput): string | null {
  if (!item.id?.trim()) return 'El código SKU es obligatorio.';
  if (!SKU_PATTERN.test(item.id.trim())) return 'El SKU solo admite letras, números, punto, guion y guion bajo (máximo 40 caracteres).';
  if (!item.name?.trim()) return 'El nombre del artículo es obligatorio.';
  if (allItems.some(i => i.id.toLowerCase() === item.id!.trim().toLowerCase() && i.id !== editingId)) return 'El código SKU ya existe en el sistema.';
  if (item.cost !== undefined && !(item.cost >= 0)) return 'El costo no puede ser negativo.';

  if (item.type === 'Libro' && !item.bindingType) return 'Seleccione el tipo de libro (Anillado o Encolado).';

  // Material con entrenamientos variables: la tabla debe traer una fila por sesión
  if (item.type === 'Material educativo' && item.trainingMode === 'Variable' && (item.sessions ?? 0) > 0 && (item.variableTrainings ?? []).length !== item.sessions) {
    return 'Configure la tabla de sesiones: indique los entrenamientos de cada sesión del material.';
  }

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

export interface PriceInput { itemId: string; branchId: string; amount: number; validFrom: string }

/**
 * ¿Se puede registrar este precio? Mayor a 0, con fecha de inicio, de un artículo y una sede que existen, y sin chocar con el historial
 * del mismo alcance (artículo y sede): no repetir la fecha de inicio ni registrarlo antes de una vigencia posterior.
 */
export function priceError(input: PriceInput, prices: ItemPrice[], known: { itemIds?: string[]; branchIds?: string[] } = {}): string | null {
  if (!(input.amount > 0)) return 'El precio debe ser mayor a 0.';
  if (!input.validFrom) return 'Indique desde cuándo rige el precio.';
  if (known.itemIds && !known.itemIds.includes(input.itemId)) return 'No se encontró el artículo.';
  if (input.branchId !== 'all' && known.branchIds && !known.branchIds.includes(input.branchId)) return 'La sede elegida no existe.';
  const sameScope = prices.filter(p => p.itemId === input.itemId && p.branchId === input.branchId);
  if (sameScope.some(p => p.validFrom === input.validFrom)) return 'Ya existe un precio con esa fecha de inicio. Use una fecha posterior.';
  if (sameScope.some(p => p.validFrom > input.validFrom)) return 'Existe un precio con vigencia posterior. Registre el nuevo precio después de esa fecha.';
  return null;
}

/** El día anterior a una fecha ISO (el cierre de la vigencia abierta cuando entra un precio nuevo). */
export function dayBefore(iso: string): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
}

/** El historial después de registrar un precio: cierra la vigencia abierta del mismo alcance (no la sobrescribe) y agrega el nuevo. */
export function withNewPrice(prices: ItemPrice[], created: ItemPrice): ItemPrice[] {
  return [
    ...prices.map(p => (p.itemId === created.itemId && p.branchId === created.branchId && !p.validTo ? { ...p, validTo: dayBefore(created.validFrom) } : p)),
    created,
  ];
}

export interface StockMove { branchId: string; itemId: string; qty: number }

/**
 * Comprueba de una vez varios movimientos de stock: ninguno deja un saldo negativo (se suman los movimientos de un mismo artículo
 * y sede). Sirve para que una operación con varias líneas (entregar los materiales de una receta) se aplique entera o no se aplique.
 */
export function stockMovesError(stockItems: StockItem[], moves: StockMove[], nameOf: (itemId: string) => string = id => id): string | null {
  const net = new Map<string, number>();
  for (const m of moves) net.set(`${m.branchId}|${m.itemId}`, (net.get(`${m.branchId}|${m.itemId}`) ?? 0) + m.qty);
  for (const [key, delta] of net) {
    if (delta >= 0) continue;
    const [branchId, itemId] = key.split('|');
    const have = availableStock(stockItems, branchId, itemId);
    if (have + delta < 0) return `Stock insuficiente de "${nameOf(itemId)}": disponible ${have}, se intentó descontar ${-delta}.`;
  }
  return null;
}

/** Un ingreso de stock (compra o reposición) pide sede, artículo, una cantidad entera y el documento que lo respalda. */
export function stockEntryError(input: { branchId: string; itemId: string; qty: number; doc: string }): string | null {
  if (!input.branchId || !input.itemId) return 'Elija la sede y el artículo.';
  if (!Number.isInteger(input.qty) || input.qty < 1) return 'La cantidad debe ser un número entero mayor a 0.';
  if (!input.doc.trim()) return 'Indique el documento que respalda el ingreso (factura, guía o acta).';
  return null;
}

/** Una venta de artículo en caja: cantidad entera, stock suficiente y, si se cobra en soles, el tipo de cambio. */
export function itemSaleError(input: { qty: number; available: number; currency: 'PEN' | 'USD'; exchangeRate?: number }): string | null {
  if (!Number.isInteger(input.qty) || input.qty < 1) return 'La cantidad debe ser un número entero mayor a 0.';
  if (input.available < input.qty) return 'No hay stock suficiente para realizar la venta.';
  if (input.currency === 'PEN' && !((input.exchangeRate ?? 0) > 0)) return 'Indique el tipo de cambio (TC) para cobrar en soles.';
  return null;
}
