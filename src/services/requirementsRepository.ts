/**
 * Repositorio de los requerimientos de las sedes sobre Supabase (tablas `requerimientos`, `requerimiento_mensajes` y `requerimiento_lecturas` y las funciones
 * de la migración 0031). Solo traduce: filas ↔ modelo del sistema y errores de la base ↔ mensajes claros. Las reglas y el orden de las operaciones viven en
 * `utils/requirements.ts` y `services/requirements.ts`. La seguridad no está aquí: la deciden las políticas y las funciones de la base según la cuenta que inició sesión.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  messageFromRow, requirementFromRow, seenFromRows, type RequerimientoLecturaRow, type RequerimientoMensajeRow, type RequerimientoRow,
} from '../utils/requirementsDb';
import { stockErrorMessage } from '../utils/stockDb';
import type { RepoResult } from './orgDirectory';
import type { RequirementsData, RequirementsRepository } from './requirements';

const PAGE = 1000;
type DbError = { code?: string; message?: string; details?: string };

const failure = <T>(error: DbError | null): RepoResult<T> => ({ ok: false, error: stockErrorMessage(error) });

/** Lee TODA una tabla de a mil filas (la API entrega mil por vez) en un orden estable. */
async function fetchAll<T>(client: SupabaseClient, table: string, order: string): Promise<{ data: T[]; error: null } | { data: null; error: DbError }> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client.from(table).select('*').order(order).range(from, from + PAGE - 1);
    if (error) return { data: null, error };
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) return { data: out, error: null };
  }
}

export function createSupabaseRequirementsRepository(client: SupabaseClient): RequirementsRepository {
  const rpc = async <T = null>(fn: string, args: Record<string, unknown>): Promise<RepoResult<T>> => {
    const { data, error } = await client.rpc(fn, args);
    return error ? failure(error) : { ok: true, data: (data ?? null) as T };
  };

  return {
    async loadAll(): Promise<RepoResult<RequirementsData>> {
      const [req, msg, seen] = await Promise.all([
        fetchAll<RequerimientoRow>(client, 'requerimientos', 'id'),
        fetchAll<RequerimientoMensajeRow>(client, 'requerimiento_mensajes', 'numero'),
        fetchAll<RequerimientoLecturaRow>(client, 'requerimiento_lecturas', 'requerimiento_id'),
      ]);
      const error = req.error ?? msg.error ?? seen.error;
      if (error) return failure(error);
      return {
        ok: true,
        data: {
          requirements: (req.data as RequerimientoRow[]).map(requirementFromRow).sort((a, b) => b.id.localeCompare(a.id)),
          messages: (msg.data as RequerimientoMensajeRow[]).map(messageFromRow),
          seen: seenFromRows(seen.data as RequerimientoLecturaRow[]),
        },
      };
    },
    create: payload => rpc<string>('crear_requerimiento', { p: payload }),
    open: id => rpc('abrir_verificacion_requerimiento', { p_id: id }),
    review: (id, lines, version) => rpc('verificar_requerimiento', { p_id: id, p_lineas: lines, p_version: version ?? null }),
    reject: (id, reason, version) => rpc('rechazar_requerimiento', { p_id: id, p_motivo: reason, p_version: version ?? null }),
    moveToPacking: (id, version) => rpc<string>('pasar_requerimiento_a_empacando', { p_id: id, p_version: version ?? null }),
    async sendMessage(id, text) {
      const res = await rpc<number | string>('enviar_mensaje_requerimiento', { p_id: id, p_texto: text });
      return res.ok ? { ok: true, data: Number(res.data) } : { ok: false, error: res.error };
    },
    markSeen: id => rpc('marcar_mensajes_requerimiento_vistos', { p_id: id }),
  };
}
