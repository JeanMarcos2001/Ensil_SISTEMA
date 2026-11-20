/**
 * Lectura de la lista de sedes que ve cualquier cuenta (nombre y estado, para elegir y nombrar el otro extremo de una transferencia). Recibe el repositorio
 * como parámetro (el de Supabase en el sistema, uno en memoria en `scripts/check-transfers.ts`). **No toca el estado de React**: quien llama (el gancho
 * `usePlaceDirectory`) guarda el resultado.
 */
import { sedeLocationsFromRows, type PlaceRow } from '../utils/placeDirectory';
import type { StockLocation } from '../utils/logisticsRoutes';
import type { OpResult, RepoResult } from './orgDirectory';

export interface PlaceDirectoryRepository {
  /** Todas las sedes con su nombre y estado. */
  list(): Promise<RepoResult<PlaceRow[]>>;
}

export async function loadPlaceDirectory(repo: PlaceDirectoryRepository): Promise<OpResult<StockLocation[]>> {
  const res = await repo.list();
  return res.ok && res.data ? { ok: true, value: sedeLocationsFromRows(res.data) } : { ok: false, error: res.error ?? 'No se pudo leer la lista de sedes.' };
}
