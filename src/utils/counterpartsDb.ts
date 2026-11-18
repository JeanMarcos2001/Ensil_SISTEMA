/**
 * Las contrapartes que el navegador de una cuenta común no puede ver (función `contrapartes_de_funciones` de la migración 0028): reglas puras.
 *
 * Al crear un envío, el sistema comprueba que alguien pueda recibirlo en la sede destino. Esa comprobación necesita las funciones y las sedes de TODAS
 * las cuentas, y una cuenta común solo lee la suya (`cuentas_leer`, `roles_leer`, `rol_funciones_leer`): la de Logística del almacén no «veía» a quien
 * recibe en Chiclayo y se avisaba, sin ser cierto, que nadie podía recibir. Lo calcula la base: por cada función pedida entrega DÓNDE hay al menos una
 * cuenta activa que la tiene (una sede, un almacén o «*» = alcanza todas las sedes), sin nombres ni ids de cuentas.
 */
import { ALL_CAPABILITIES, type Holder } from './capabilities';
import { isWarehouseId } from './logisticsRoutes';
import { dbErrorMessage, type DbErrorLike } from './orgDirectory';

/** Una fila de `contrapartes_de_funciones()`: hay al menos una cuenta con esa función en ese lugar. */
export interface CounterpartRow {
  funcion_id: string;
  /** Una sede (FIL-…), un almacén (ALM-…) o `*` (alcanza todas las sedes). */
  lugar_id: string;
}

/** Cada cuánto se vuelve a preguntar (alguien puede crear o cambiar una cuenta en otro equipo). */
export const COUNTERPART_REFRESH_MS = 5 * 60_000;

/** El lugar que la base usa para «alcanza todas las sedes». */
export const ALL_BRANCHES_PLACE = '*';

/** Las funciones que otra función necesita de alguien más (las contrapartes del registro): son las únicas que hay que preguntarle a la base. */
export function counterpartCapabilityIds(): string[] {
  return [...new Set(ALL_CAPABILITIES.flatMap(c => c.counterparts.map(x => x.capability)))].sort();
}

/**
 * Las filas de la base como «personas» anónimas para `availability` / `holdersWith`: una por cada función y lugar. No son personas reales (no llevan
 * nombre) ni se mezclan con las que el navegador sí puede leer: solo sirven para responder «¿hay alguien con esta función en esta sede?».
 */
export function holdersFromCounterpartRows(rows: CounterpartRow[]): Holder[] {
  return rows.map((row, i) => ({
    id: `base:${i}`,
    name: '',
    branchIds: row.lugar_id !== ALL_BRANCHES_PLACE && !isWarehouseId(row.lugar_id) ? [row.lugar_id] : [],
    allBranches: row.lugar_id === ALL_BRANCHES_PLACE,
    warehouseIds: isWarehouseId(row.lugar_id) ? [row.lugar_id] : [],
    allWarehouses: false,
    capabilities: new Set([row.funcion_id]),
  }));
}

export function counterpartsErrorMessage(e: DbErrorLike | null | undefined): string {
  if (!e) return 'No se pudo comprobar quién puede recibir en la sede destino.';
  return dbErrorMessage(e);
}
