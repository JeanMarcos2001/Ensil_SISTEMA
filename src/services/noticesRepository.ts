/**
 * Repositorio de los avisos sobre Supabase (funciones `mis_avisos`, `emitir_aviso` y `marcar_avisos_leidos` de la migración 0026). Solo traduce: filas ↔
 * modelo del sistema y errores de la base ↔ mensajes claros. Las reglas y el orden de las operaciones viven en `services/notices.ts`. La seguridad no está
 * aquí: la deciden las funciones de la base según la cuenta que inició sesión.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { emitArgs, noticesErrorMessage, type NoticeRow } from '../utils/noticesDb';
import type { RepoResult } from './orgDirectory';
import type { NoticesRepository } from './notices';

const failure = <T>(error: { code?: string; message?: string; details?: string } | null): RepoResult<T> => ({ ok: false, error: noticesErrorMessage(error) });

export function createSupabaseNoticesRepository(client: SupabaseClient): NoticesRepository {
  return {
    async list(days) {
      const { data, error } = await client.rpc('mis_avisos', { p_dias: days });
      if (error) return failure(error);
      return { ok: true, data: (data ?? []) as NoticeRow[] };
    },
    async emit(eventId, notice) {
      const { data, error } = await client.rpc('emitir_aviso', emitArgs(eventId, notice));
      if (error) return failure(error);
      if (typeof data !== 'string' || data === '') return { ok: false, error: 'La base no devolvió el código del aviso. Actualice la página e intente de nuevo.' };
      return { ok: true, data };
    },
    async markRead(ids) {
      const { data, error } = await client.rpc('marcar_avisos_leidos', { p_ids: ids });
      if (error) return failure(error);
      return { ok: true, data: typeof data === 'number' ? data : 0 };
    },
  };
}
