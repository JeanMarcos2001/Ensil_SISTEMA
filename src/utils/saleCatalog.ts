/**
 * La lista de artículos de la venta en Caja (funciones puras).
 *
 * Todo artículo activo con precio de referencia se puede vender (por ejemplo, un libro que el alumno extravió). Como la lista sería muy larga,
 * se agrupa por tipo y se ordena con lo que más se vende primero: libros, herramientas y adicionales, y kits. El **material educativo** (que
 * casi nunca se vende) queda plegado hasta que se busque por nombre o código: la búsqueda siempre encuentra todo, en todos los tipos.
 *
 * Dentro de cada grupo van primero los artículos que se pueden vender ahora (con stock en la sede y con precio) y después los que no, con el
 * motivo. Nada de esto se guarda: se calcula al mostrar.
 */
import type { Item, ItemPrice, ItemType, StockItem } from '../context/DataContext';
import { availableStock, getCurrentPrice, normalizeName } from './inventory';

/** Orden de los grupos y su título. El material educativo es el que se pliega. */
export const SALE_GROUPS: { type: ItemType; title: string; foldedByDefault: boolean }[] = [
  { type: 'Libro', title: 'Libros', foldedByDefault: false },
  { type: 'Herramienta / adicional', title: 'Herramientas y adicionales', foldedByDefault: false },
  { type: 'Kit', title: 'Kits', foldedByDefault: false },
  { type: 'Material educativo', title: 'Material educativo', foldedByDefault: true },
];

export interface SaleOption {
  item: Item;
  /** Stock en la sede. */
  stock: number;
  /** Precio vigente (excepción de la sede o el general), en USD; `undefined` si no tiene. */
  price?: number;
  /** ¿Se puede vender ahora? (hay stock y precio) */
  ready: boolean;
  /** Por qué no se puede vender ahora. */
  note?: string;
  /** Un kit sin kits armados en la sede: hay que armarlo en Stock. */
  needsAssembly: boolean;
}

export interface SaleGroup {
  type: ItemType;
  title: string;
  options: SaleOption[];
  /** Plegado: no se muestra su contenido hasta que se abra o se busque (solo cuenta cuántos hay). */
  folded: boolean;
}

export function saleOption(item: Item, stock: StockItem[], prices: ItemPrice[], branchId: string): SaleOption {
  const have = availableStock(stock, branchId, item.id);
  const price = getCurrentPrice(prices, item.id, branchId || 'all')?.amount;
  const needsAssembly = item.type === 'Kit' && have <= 0 && price !== undefined;
  const note = price === undefined ? 'Sin precio de referencia' : have <= 0 ? (item.type === 'Kit' ? 'Sin kits armados' : 'Sin stock') : undefined;
  return { item, stock: have, ...(price !== undefined ? { price } : {}), ready: have > 0 && price !== undefined, ...(note ? { note } : {}), needsAssembly };
}

/**
 * Los grupos de la lista de venta para una sede. Con texto de búsqueda se muestran los artículos que lo contienen (nombre o código) en todos los
 * grupos y ninguno queda plegado; sin texto, el material educativo queda plegado (`openFolded` lo abre a mano). Los grupos vacíos no salen.
 */
export function saleGroups(items: Item[], stock: StockItem[], prices: ItemPrice[], branchId: string, query = '', openFolded = false): SaleGroup[] {
  const q = normalizeName(query);
  const active = items.filter(i => i.status === 'Activo');
  const out: SaleGroup[] = [];
  for (const g of SALE_GROUPS) {
    const options = active
      .filter(i => i.type === g.type && (!q || normalizeName(i.name).includes(q) || i.id.toLowerCase().includes(q)))
      .map(i => saleOption(i, stock, prices, branchId))
      .sort((a, b) => Number(b.ready) - Number(a.ready) || a.item.name.localeCompare(b.item.name, 'es'));
    if (options.length === 0) continue;
    out.push({ type: g.type, title: g.title, options, folded: !q && g.foldedByDefault && !openFolded });
  }
  return out;
}
