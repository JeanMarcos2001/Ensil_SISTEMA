/**
 * Rutas de la mercadería (funciones puras): hay UN almacén central para toda la empresa y todo lo que se mueve entre sedes pasa por él.
 *
 *  - Envío: sale siempre del almacén central y llega a una filial.
 *  - Transferencia: una solicitud con aprobación; uno de sus extremos es siempre el almacén (reposición hacia una filial o devolución de
 *    una filial). Entre dos filiales no hay transferencia directa: lo que sobra se devuelve al almacén y desde ahí se envía.
 *
 * El almacén central se define por dato (`Branch.isWarehouse`), no por un nombre ni un código fijo.
 */
import type { Branch } from '../context/DataContext';

type WarehouseBranch = Pick<Branch, 'id' | 'name' | 'status'> & { isWarehouse?: boolean };

/** El almacén central activo (si está definido). */
export const centralWarehouse = <T extends WarehouseBranch>(branches: T[]): T | undefined => branches.find(b => b.isWarehouse && b.status === 'Activo');

const NO_WAREHOUSE = 'No hay un almacén central definido: márquelo en Organización → Filiales.';

/** Debe haber como máximo un almacén central. */
export function warehouseDefinitionError(branches: WarehouseBranch[]): string | null {
  const marked = branches.filter(b => b.isWarehouse);
  if (marked.length > 1) return `Solo puede haber un almacén central, y hay ${marked.length} marcados (${marked.map(b => b.name).join(', ')}).`;
  return null;
}

/** El almacén no se puede inactivar mientras siga siendo el almacén (la empresa se quedaría sin abastecimiento). */
export function warehouseInactivationError(branch: WarehouseBranch, nextStatus: Branch['status']): string | null {
  return branch.isWarehouse && nextStatus === 'Inactivo' ? 'No se puede inactivar el almacén central: primero marque otra filial como almacén.' : null;
}

/** Un envío sale del almacén central hacia una filial activa. */
export function shipmentRouteError(originId: string, destinationId: string, branches: WarehouseBranch[]): string | null {
  const wh = centralWarehouse(branches);
  if (!wh) return NO_WAREHOUSE;
  if (originId !== wh.id) return `Los envíos salen del almacén central (${wh.name}).`;
  if (!destinationId) return 'Indique la filial de destino.';
  if (destinationId === wh.id) return 'El destino de un envío es una filial, no el propio almacén.';
  const dest = branches.find(b => b.id === destinationId);
  if (!dest) return 'La filial de destino no existe.';
  if (dest.status !== 'Activo') return `La filial ${dest.name} está inactiva.`;
  return null;
}

/** Una transferencia tiene siempre al almacén central en uno de sus extremos. */
export function transferRouteError(originId: string, destinationId: string, branches: WarehouseBranch[]): string | null {
  if (!originId || !destinationId) return 'Indique la sede de origen y la de destino.';
  if (originId === destinationId) return 'El origen y el destino deben ser distintos.';
  const wh = centralWarehouse(branches);
  if (!wh) return NO_WAREHOUSE;
  if (originId !== wh.id && destinationId !== wh.id) {
    return `Entre filiales todo pasa por el almacén central (${wh.name}): devuelva el stock al almacén o pídalo desde allí.`;
  }
  const other = branches.find(b => b.id === (originId === wh.id ? destinationId : originId));
  if (!other) return 'La sede indicada no existe.';
  if (other.status !== 'Activo') return `La sede ${other.name} está inactiva.`;
  return null;
}
