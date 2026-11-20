/**
 * Repositorio de la lista de sedes sobre Supabase (función `directorio_sedes` de la migración 0032). Solo traduce: filas y errores de la base a mensajes
 * claros. La seguridad no está aquí: la función de la base entrega solo código, nombre y estado, a cualquier cuenta con acceso vigente.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { placeDirectoryErrorMessage, type PlaceRow } from '../utils/placeDirectory';
import type { PlaceDirectoryRepository } from './placeDirectory';

export function createSupabasePlaceDirectoryRepository(client: SupabaseClient): PlaceDirectoryRepository {
  return {
    async list() {
      const { data, error } = await client.rpc('directorio_sedes');
      if (error) return { ok: false, error: placeDirectoryErrorMessage(error) };
      return { ok: true, data: (data ?? []) as PlaceRow[] };
    },
  };
}
