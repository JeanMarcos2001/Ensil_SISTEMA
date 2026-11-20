/**
 * Rutas de la mercadería (funciones puras): hay UN almacén central para toda la empresa, aparte de las sedes.
 *
 * Una «ubicación de stock» es el almacén o una sede: el stock, el kardex, los envíos y las transferencias usan su id (los del almacén
 * llevan el prefijo `ALM-`; los de las sedes, el código de la filial).
 *
 *  - El almacén recibe compras, despacha y recibe devoluciones. **No vende**: la venta se registra siempre en una sede (`locationSaleError`).
 *  - Envío: sale siempre del almacén central y llega a una sede (la sede lo pide con un requerimiento).
 *  - Transferencia: lo que una SEDE manda a otra sede (un préstamo) o devuelve al almacén central. **No lleva aprobación**: cada sede es
 *    responsable de lo que manda. Siempre sale de una sede: el almacén manda con los envíos.
 *
 * El almacén central es un dato (`Warehouse`), no un nombre ni un código fijo: Los Olivos es una sede como las demás, con su propio stock.
 */
import type { Branch, Warehouse } from '../context/DataContext';

export type LocationKind = 'almacén' | 'sede';

/** Un lugar donde puede haber stock: el almacén central o una sede. */
export interface StockLocation { id: string; name: string; status: 'Activo' | 'Inactivo'; kind: LocationKind }

/** Los ids de almacén son `ALM-NNN` (`ID_PREFIX.almacen`); nunca chocan con el código de una filial. */
export const WAREHOUSE_ID_PATTERN = /^ALM-\d{3,}$/;
export const isWarehouseId = (id: string): boolean => WAREHOUSE_ID_PATTERN.test(id);

/** Almacenes y sedes como ubicaciones de stock (el almacén primero). */
export const stockLocations = (
  branches: Pick<Branch, 'id' | 'name' | 'status'>[],
  warehouses: Pick<Warehouse, 'id' | 'name' | 'status'>[],
): StockLocation[] => [
  ...warehouses.map(w => ({ id: w.id, name: w.name, status: w.status, kind: 'almacén' as const })),
  ...branches.map(b => ({ id: b.id, name: b.name, status: b.status, kind: 'sede' as const })),
];

/** El almacén central activo (si está definido). */
export const centralWarehouse = <T extends { status: 'Activo' | 'Inactivo' }>(warehouses: T[]): T | undefined => warehouses.find(w => w.status === 'Activo');

const NO_WAREHOUSE = 'No hay un almacén central definido: créelo en Organización → Almacenes.';

const centralOf = (locations: StockLocation[]): StockLocation | undefined => centralWarehouse(locations.filter(l => l.kind === 'almacén'));

/** Debe haber como máximo un almacén central activo. */
export function warehouseDefinitionError(warehouses: Pick<Warehouse, 'name' | 'status'>[]): string | null {
  const active = warehouses.filter(w => w.status === 'Activo');
  if (active.length > 1) return `Solo puede haber un almacén central activo, y hay ${active.length} (${active.map(w => w.name).join(', ')}).`;
  return null;
}

/** El almacén no se inactiva con mercadería dentro: quedaría stock que nadie puede mover. */
export function warehouseInactivationError(
  warehouse: Pick<Warehouse, 'id' | 'name' | 'status'>,
  nextStatus: Warehouse['status'],
  stock: { branchId: string; stock: number }[],
): string | null {
  if (warehouse.status !== 'Activo' || nextStatus !== 'Inactivo') return null;
  const units = stock.filter(s => s.branchId === warehouse.id).reduce((sum, s) => sum + Math.max(0, s.stock), 0);
  return units > 0 ? `No se puede inactivar el almacén «${warehouse.name}»: todavía tiene ${units} unidad${units === 1 ? '' : 'es'} en stock. Envíelas o ajústelas primero.` : null;
}

/** El almacén no vende: la venta de artículos se registra en una sede. */
export function locationSaleError(locationId: string): string | null {
  return isWarehouseId(locationId) ? 'El almacén central no vende: registre la venta en una sede.' : null;
}

/** Un envío sale del almacén central hacia una sede activa. */
export function shipmentRouteError(originId: string, destinationId: string, locations: StockLocation[]): string | null {
  const wh = centralOf(locations);
  if (!wh) return NO_WAREHOUSE;
  if (originId !== wh.id) return `Los envíos salen del almacén central (${wh.name}).`;
  if (!destinationId) return 'Indique la filial de destino.';
  if (destinationId === wh.id) return 'El destino de un envío es una filial, no el propio almacén.';
  const dest = locations.find(l => l.id === destinationId);
  if (!dest) return 'La filial de destino no existe.';
  if (dest.kind !== 'sede') return 'El destino de un envío es una filial, no un almacén.';
  if (dest.status !== 'Activo') return `La filial ${dest.name} está inactiva.`;
  return null;
}

/** Los textos de la ruta de una transferencia (la base de datos dice lo mismo, palabra por palabra). */
export const TRANSFER_ORIGIN_NOT_SEDE = 'Una transferencia sale de una sede: el almacén central envía con los envíos y la sede lo pide con un requerimiento.';
export const TRANSFER_NO_WAREHOUSE = 'No hay un almacén central activo con ese código.';

/** ¿La transferencia vuelve al almacén central (una devolución)? Si no, es un préstamo a otra sede. */
export const isReturnToWarehouse = (destinationId: string): boolean => isWarehouseId(destinationId);

/**
 * Una transferencia sale de una sede activa y llega a otra sede activa (un préstamo) o al almacén central (una devolución). Nunca sale del almacén:
 * lo que el almacén manda a una sede es un envío. No hay aprobación: la sede que manda responde por lo que manda.
 */
export function transferRouteError(originId: string, destinationId: string, locations: StockLocation[]): string | null {
  if (!originId || !destinationId) return 'Indique la sede de origen y la de destino.';
  if (originId === destinationId) return 'El origen y el destino deben ser distintos.';
  if (isWarehouseId(originId)) return TRANSFER_ORIGIN_NOT_SEDE;
  const origin = locations.find(l => l.id === originId);
  if (!origin || origin.kind !== 'sede') return 'La sede de origen no existe.';
  if (origin.status !== 'Activo') return `La sede ${origin.name} está inactiva.`;
  const dest = locations.find(l => l.id === destinationId);
  if (isWarehouseId(destinationId)) {
    if (!dest || dest.kind !== 'almacén' || dest.status !== 'Activo') return TRANSFER_NO_WAREHOUSE;
    return null;
  }
  if (!dest || dest.kind !== 'sede') return 'La sede de destino no existe.';
  if (dest.status !== 'Activo') return `La sede ${dest.name} está inactiva.`;
  return null;
}
