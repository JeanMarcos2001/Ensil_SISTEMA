/**
 * Reglas del Catálogo de artículos, precios de venta vigentes y disponibilidad para entrega.
 * Funciones puras (sin estado). El Catálogo de Logística es la ÚNICA fuente de artículos.
 */
import type { Item, ItemPrice, ItemType, StockItem } from '../context/DataContext';
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

/** Un artículo por crear: SIN SKU (lo asigna el sistema al guardar) y con su precio de referencia general (USD), obligatorio en todo artículo. */
export interface ItemDraft { item: Omit<Item, 'id'>; price: number }

/** Unidades de medida permitidas (lista corta: el texto libre hacía que «Unidad», «unidad» y «Und.» salieran distintos). */
export const ITEM_UNITS = ['Unidad', 'Juego', 'Kit', 'Caja', 'Paquete', 'Par'] as const;
export type ItemUnit = (typeof ITEM_UNITS)[number];
/** La unidad que se propone al elegir el tipo: un kit propone «Kit»; el resto, «Unidad». */
export const defaultUnitFor = (type: ItemType): ItemUnit => (type === 'Kit' ? 'Kit' : 'Unidad');

/** Prefijo del SKU que el sistema asigna a cada tipo de artículo (ITM-LIB-001, ITM-MAT-001, ITM-HER-001, ITM-KIT-001). */
export const SKU_PREFIX: Record<ItemType, string> = {
  'Material educativo': 'ITM-MAT',
  'Herramienta / adicional': 'ITM-HER',
  'Libro': 'ITM-LIB',
  'Kit': 'ITM-KIT',
};

/**
 * El siguiente SKU libre de un tipo: el mayor número ya usado con su prefijo, más uno (de tres cifras). Los SKU que no siguen el formato
 * (ITM-LIB-K1, ITM-KIT-BIENV…) no cuentan para la numeración, pero tampoco se pisan. Nadie escribe un SKU: lo asigna el sistema.
 */
export function nextSku(type: ItemType, existingIds: string[]): string {
  const prefix = SKU_PREFIX[type];
  const re = new RegExp(`^${prefix}-(\\d+)$`, 'i');
  let max = 0;
  for (const id of existingIds) {
    const m = re.exec(id.trim());
    if (m) max = Math.max(max, parseInt(m[1]!, 10));
  }
  return `${prefix}-${String(max + 1).padStart(3, '0')}`;
}

/** El nombre sin tildes, mayúsculas ni espacios de más: «Libro  Kids» y «libro kids» son el mismo. */
export const normalizeName = (s: string): string => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

/** Valida un artículo del catálogo. Devuelve el mensaje de error o `null`. */
export function validateItem({ item, allItems, editingId }: ItemValidationInput): string | null {
  if (!item.id?.trim()) return 'El código SKU es obligatorio.';
  if (!SKU_PATTERN.test(item.id.trim())) return 'El SKU solo admite letras, números, punto, guion y guion bajo (máximo 40 caracteres).';
  if (!item.name?.trim()) return 'El nombre del artículo es obligatorio.';
  if (allItems.some(i => i.id.toLowerCase() === item.id!.trim().toLowerCase() && i.id !== editingId)) return 'El código SKU ya existe en el sistema.';
  // Como el SKU ya no lo escribe nadie, lo que evita crear dos veces lo mismo (p. ej. subir dos veces el mismo archivo) es el nombre. Al editar solo se
  // comprueba si el nombre cambió (un catálogo que ya tuviera dos iguales no impide desactivar uno de ellos).
  const original = editingId ? allItems.find(i => i.id === editingId) : undefined;
  if (item.type && (!original || normalizeName(original.name) !== normalizeName(item.name))) {
    const same = allItems.find(i => i.id !== editingId && i.type === item.type && normalizeName(i.name) === normalizeName(item.name));
    if (same) return `Ya existe un artículo de este tipo con ese nombre (${same.id}). Use otro nombre o edite el que ya existe.`;
  }
  if (item.cost !== undefined && !(item.cost >= 0)) return 'El costo no puede ser negativo.';

  if (item.unit !== undefined && !(ITEM_UNITS as readonly string[]).includes(item.unit)) return `La unidad de medida debe ser una de estas: ${ITEM_UNITS.join(', ')}.`;
  if (item.type && item.isPackage !== undefined && (item.type === 'Kit') !== item.isPackage) return 'Solo un artículo de tipo Kit puede ser un kit.';
  if (item.type === 'Material educativo' && item.isDeliveredOnEnrollment === false) return 'El material educativo siempre se entrega con la matrícula.';

  if (item.type === 'Libro' && !item.bindingType) return 'Seleccione el encuadernado del libro (Anillado o Encolado).';

  // Material con entrenamientos variables: la tabla debe traer una fila por sesión
  if (item.type === 'Material educativo' && item.trainingMode === 'Variable' && (item.sessions ?? 0) > 0 && (item.variableTrainings ?? []).length !== item.sessions) {
    return 'Configure la tabla de sesiones: indique los entrenamientos de cada sesión del material.';
  }

  // Un kit se arma con sus artículos: la composición es obligatoria (es la «receta» para armarlo) y no hay kits dentro de kits
  if (item.type === 'Kit') {
    const composition = item.composition ?? [];
    if (composition.length === 0) return 'Un kit debe definir su composición (los artículos y cantidades con los que se arma).';
    if (composition.some(c => !c.itemId || !(c.quantity >= 1))) {
      return 'Cada componente del kit debe tener un artículo y una cantidad mayor a 0.';
    }
    if (composition.some(c => c.itemId === item.id)) return 'Un kit no puede contenerse a sí mismo.';
    if (new Set(composition.map(c => c.itemId)).size !== composition.length) {
      return 'La composición tiene artículos repetidos.';
    }
    for (const c of composition) {
      const part = allItems.find(i => i.id === c.itemId);
      if (!part) return 'Un componente del kit no existe en el catálogo de artículos.';
      if (part.type === 'Kit') return `Un kit no puede contener otro kit («${part.name}»). Use sus artículos sueltos.`;
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

/** Los tipos de ajuste de stock. */
export type AdjustmentType = 'Ajuste Positivo' | 'Ajuste Negativo' | 'Merma' | 'Regularización Administrativa' | 'Devolución';

/**
 * El signo lo define el tipo de operación: un ajuste positivo o una devolución suman; un ajuste negativo o una merma descuentan; solo la
 * regularización administrativa respeta el signo que se escribió. La cantidad que llega puede venir con cualquier signo.
 */
export function signedAdjustment(type: AdjustmentType, qty: number): number {
  if (type === 'Ajuste Positivo' || type === 'Devolución') return Math.abs(qty);
  if (type === 'Ajuste Negativo' || type === 'Merma') return -Math.abs(qty);
  return qty;
}

/** Un ajuste pide ubicación y artículo, una cantidad entera distinta de 0 con el signo de su tipo y el motivo. */
export function adjustmentError(input: { locationId: string; itemId: string; type: AdjustmentType; qty: number; reason: string }): string | null {
  if (!input.locationId || !input.itemId) return 'No se encontró el registro de stock.';
  if (!Number.isInteger(input.qty) || input.qty === 0) return 'La cantidad debe ser un número entero distinto de 0.';
  if ((input.type === 'Ajuste Positivo' || input.type === 'Devolución') && input.qty < 0) return 'Un ajuste positivo o una devolución suma unidades: la cantidad debe ser mayor a 0.';
  if ((input.type === 'Ajuste Negativo' || input.type === 'Merma') && input.qty > 0) return 'Un ajuste negativo o una merma descuenta unidades: la cantidad debe ser menor a 0.';
  if (!input.reason.trim()) return 'Indique el motivo del ajuste.';
  return null;
}

/** El stock mínimo es un entero de 0 en adelante. */
export function minStockError(minStock: number): string | null {
  return Number.isInteger(minStock) && minStock >= 0 ? null : 'El stock mínimo debe ser un número entero de 0 en adelante.';
}

/** ¿Se puede armar o desarmar este kit? Debe ser un kit con composición (todo kit se puede desarmar en Stock, con motivo). */
export function packageError(item: Pick<Item, 'isPackage' | 'composition'> | undefined): string | null {
  if (!item || !item.isPackage || !item.composition) return 'El artículo no es un kit con composición.';
  if (item.composition.length === 0) return 'El kit no tiene composición definida.';
  return null;
}

/** Desarmar un kit siempre queda registrado: el motivo es obligatorio (queda en el kardex junto a quién y cuándo). */
export const UNPACK_REASON_MAX = 300;
export function unpackReasonError(reason: string): string | null {
  const r = (reason ?? '').trim();
  if (!r) return 'Indique el motivo del desempaquetado.';
  if (r.length > UNPACK_REASON_MAX) return `El motivo no puede pasar de ${UNPACK_REASON_MAX} caracteres.`;
  return null;
}

/** ¿Tiene el artículo su precio de referencia general vigente? Todo artículo debe tenerlo (los de partida sin precio se marcan hasta completarlo). */
export const hasReferencePrice = (prices: ItemPrice[], itemId: string, date: string = todayISO()): boolean =>
  getCurrentPrice(prices, itemId, 'all', date) !== undefined;

/**
 * Precio sugerido de un kit: la suma de los precios vigentes de sus artículos por sus cantidades (se puede cambiar).
 * `undefined` si no hay composición o a algún artículo le falta el precio.
 */
export function suggestedKitPrice(composition: { itemId: string; quantity: number }[], prices: ItemPrice[], date: string = todayISO()): number | undefined {
  if (composition.length === 0) return undefined;
  let total = 0;
  for (const c of composition) {
    const price = getCurrentPrice(prices, c.itemId, 'all', date)?.amount;
    if (price === undefined) return undefined;
    total += price * c.quantity;
  }
  return Math.round(total * 100) / 100;
}

/** Una venta de artículo en caja: cantidad entera, stock suficiente y, si se cobra en soles, el tipo de cambio. */
export function itemSaleError(input: { qty: number; available: number; currency: 'PEN' | 'USD'; exchangeRate?: number }): string | null {
  if (!Number.isInteger(input.qty) || input.qty < 1) return 'La cantidad debe ser un número entero mayor a 0.';
  if (input.available < input.qty) return 'No hay stock suficiente para realizar la venta.';
  if (input.currency === 'PEN' && !((input.exchangeRate ?? 0) > 0)) return 'Indique el tipo de cambio (TC) para cobrar en soles.';
  return null;
}

/** Lo que implica lo marcado en el formulario de un artículo, en palabras (el «resumen en vivo»). `price` es el precio de referencia general (USD). */
export function itemSummaryLines(item: Pick<Item, 'type' | 'isDeliveredOnEnrollment'>, price: number | undefined): string[] {
  const lines: string[] = [];
  lines.push(
    item.isDeliveredOnEnrollment
      ? 'Se podrá elegir en las recetas de matrícula: la verificación lo entrega y descuenta su stock.'
      : 'No irá en recetas de matrícula: solo se venderá.'
  );
  lines.push(
    price !== undefined && price > 0
      ? `Se podrá vender en Caja a USD ${price.toFixed(2)} (precio de referencia general).`
      : 'Falta el precio de referencia: sin él no se puede vender.'
  );
  if (item.type === 'Kit') {
    lines.push('Se arma en Stock con sus artículos (descuenta cada uno y suma una unidad al stock del kit) y se puede desarmar en Stock, siempre con motivo.');
  }
  return lines;
}
