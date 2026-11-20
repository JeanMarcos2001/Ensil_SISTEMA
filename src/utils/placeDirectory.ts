/**
 * La lista de sedes que puede ver cualquier cuenta (función `directorio_sedes` de la migración 0032): reglas puras.
 *
 * Una cuenta de sede solo lee su propia sede (`sedes_leer`). Para mandar una transferencia a otra sede, o ver de qué sede viene una que le llega, necesita
 * conocer a las demás. La función de la base entrega solo el código, el nombre y el estado de cada sede (ni dirección, ni teléfonos, ni empresa) a cualquier
 * cuenta con acceso vigente. Esto NO amplía lo que la cuenta ve en el resto del sistema: solo sirve para elegir y nombrar el otro extremo de una transferencia.
 */
import { dbErrorMessage, type DbErrorLike } from './orgDirectory';
import type { StockLocation } from './logisticsRoutes';

/** Una fila de `directorio_sedes()`. */
export interface PlaceRow { id: string; nombre: string; estado: 'Activo' | 'Inactivo' }

/** Cada cuánto se vuelve a leer (una sede puede crearse o inactivarse en otro equipo). */
export const PLACE_DIRECTORY_REFRESH_MS = 10 * 60_000;

/** Las sedes de la base como ubicaciones de stock. */
export const sedeLocationsFromRows = (rows: PlaceRow[]): StockLocation[] => rows.map(r => ({ id: r.id, name: r.nombre, status: r.estado, kind: 'sede' as const }));

/** Lo que la cuenta ya lee (sus sedes y el almacén) más las demás sedes de la lista; lo que la cuenta lee manda y las ubicaciones propias van primero. */
export function mergeLocations(own: StockLocation[], directory: StockLocation[]): StockLocation[] {
  const known = new Set(own.map(l => l.id));
  return [...own, ...directory.filter(l => !known.has(l.id))];
}

/** El nombre de un lugar, o su código si todavía no se conoce. */
export const placeName = (locations: StockLocation[], id: string): string => locations.find(l => l.id === id)?.name ?? id;

export function placeDirectoryErrorMessage(e: DbErrorLike | null | undefined): string {
  if (!e) return 'No se pudo leer la lista de sedes.';
  return dbErrorMessage(e);
}
