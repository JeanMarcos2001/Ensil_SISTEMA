/**
 * Rutas de la mercadería (funciones puras): hay UN almacén central para toda la empresa, aparte de las sedes, y todo lo que se mueve
 * entre sedes pasa por él.
 *
 * Una «ubicación de stock» es el almacén o una sede: el stock, el kardex, los envíos y las transferencias usan su id (los del almacén
 * llevan el prefijo `ALM-`; los de las sedes, el código de la filial).
 *
 *  - El almacén recibe compras, despacha y recibe devoluciones. **No vende**: la venta se registra siempre en una sede (`locationSaleError`).
 *  - Envío: sale siempre del almacén central y llega a una sede.
 *  - Transferencia: una solicitud con aprobación; uno de sus extremos es siempre el almacén (reposición hacia una sede o devolución de
 *    una sede). Entre dos sedes no hay transferencia directa: lo que sobra se devuelve al almacén y desde ahí se envía.
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

/** Una transferencia tiene siempre al almacén central en uno de sus extremos. */
export function transferRouteError(originId: string, destinationId: string, locations: StockLocation[]): string | null {
  if (!originId || !destinationId) return 'Indique la sede de origen y la de destino.';
  if (originId === destinationId) return 'El origen y el destino deben ser distintos.';
  const wh = centralOf(locations);
  if (!wh) return NO_WAREHOUSE;
  if (originId !== wh.id && destinationId !== wh.id) {
    return `Entre filiales todo pasa por el almacén central (${wh.name}): devuelva el stock al almacén o pídalo desde allí.`;
  }
  const other = locations.find(l => l.id === (originId === wh.id ? destinationId : originId));
  if (!other) return 'La sede indicada no existe.';
  if (other.kind !== 'sede') return 'La otra punta de una transferencia es una sede, no otro almacén.';
  if (other.status !== 'Activo') return `La sede ${other.name} está inactiva.`;
  return null;
}
