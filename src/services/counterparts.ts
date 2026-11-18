/**
 * Consulta de las contrapartes (quién tiene qué función y dónde) sobre la base de datos. Recibe el repositorio como parámetro (el de Supabase en el sistema,
 * uno en memoria en `scripts/check-counterparts-db.ts`). **No toca el estado de React**: quien llama (el gancho `useCounterparts`) guarda el resultado.
 */
import type { Holder } from '../utils/capabilities';
import { counterpartCapabilityIds, holdersFromCounterpartRows, type CounterpartRow } from '../utils/counterpartsDb';
import type { OpResult, RepoResult } from './orgDirectory';

export interface CounterpartsRepository {
  /** Dónde hay al menos una cuenta activa con cada función pedida. */
  list(functionIds: string[]): Promise<RepoResult<CounterpartRow[]>>;
}

/** Las contrapartes que cubre alguien, en forma de «personas» anónimas listas para `availability`. */
export async function loadCounterparts(repo: CounterpartsRepository, functionIds: string[] = counterpartCapabilityIds()): Promise<OpResult<Holder[]>> {
  const res = await repo.list(functionIds);
  return res.ok && res.data
    ? { ok: true, value: holdersFromCounterpartRows(res.data) }
    : { ok: false, error: res.error ?? 'No se pudo comprobar quién puede recibir en la sede destino.' };
}
