/**
 * Repositorio de la agenda de Psicopedagogía sobre Supabase (tablas `asesorias`, `psy_eventos`, `seguimientos` y `capacidad_asesorias`, y las funciones de la
 * migración 0022). Solo traduce: filas ↔ modelo y errores de la base ↔ mensajes claros. Las reglas viven en `utils/schedule.ts` y compañía; la seguridad no
 * está aquí: la deciden las políticas y las funciones de la base según la cuenta que inició sesión (quién ve y cambia la agenda de cada sede).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { agendaErrorMessage, type AgendaRows, type AsesoriaRow, type CapacidadRow, type EventoRow, type SeguimientoRow } from '../utils/agendaDb';
import type { AgendaRepository } from './agenda';
import type { RepoResult } from './orgDirectory';

const failure = <T>(error: { code?: string; message?: string; details?: string } | null): RepoResult<T> => ({ ok: false, error: agendaErrorMessage(error) });

const PAGE = 1000;
type DbError = { code?: string; message?: string; details?: string };

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

/** Lee las filas de una lista de códigos, en tandas (la dirección de la consulta tiene un largo máximo). */
async function fetchIn<T>(client: SupabaseClient, table: string, column: string, ids: string[]): Promise<{ data: T[]; error: null } | { data: null; error: DbError }> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await client.from(table).select('*').in(column, ids.slice(i, i + 100));
    if (error) return { data: null, error };
    out.push(...((data ?? []) as T[]));
  }
  return { data: out, error: null };
}

export function createSupabaseAgendaRepository(client: SupabaseClient): AgendaRepository {
  return {
    async loadAll() {
      const [a, e, s, c] = await Promise.all([
        fetchAll<AsesoriaRow>(client, 'asesorias', 'id'), fetchAll<EventoRow>(client, 'psy_eventos', 'id'), fetchAll<SeguimientoRow>(client, 'seguimientos', 'id'),
        client.from('capacidad_asesorias').select('*'),
      ]);
      const error = a.error ?? e.error ?? s.error ?? c.error;
      if (error) return failure(error);
      return { ok: true, data: { asesorias: a.data as AsesoriaRow[], eventos: e.data as EventoRow[], seguimientos: s.data as SeguimientoRow[], capacidad: (c.data ?? []) as CapacidadRow[] } satisfies AgendaRows };
    },

    async apply(action, payload) {
      const { data, error } = await client.rpc('aplicar_cambios_agenda', { p_accion: action, p: payload });
      if (error) return failure(error);
      const codes = (data as { codigos?: Record<string, string> } | null)?.codigos ?? {};
      return { ok: true, data: { codes } };
    },

    async loadTouched(scheduleIds, trackingIds = []) {
      const [a, e, sBySession, sById] = await Promise.all([
        fetchIn<AsesoriaRow>(client, 'asesorias', 'id', scheduleIds), fetchIn<EventoRow>(client, 'psy_eventos', 'ref_id', scheduleIds),
        fetchIn<SeguimientoRow>(client, 'seguimientos', 'asesoria_id', scheduleIds), fetchIn<SeguimientoRow>(client, 'seguimientos', 'id', trackingIds),
      ]);
      const error = a.error ?? e.error ?? sBySession.error ?? sById.error;
      if (error) return failure(error);
      return { ok: true, data: { asesorias: a.data as AsesoriaRow[], eventos: e.data as EventoRow[], seguimientos: [...(sBySession.data as SeguimientoRow[]), ...(sById.data as SeguimientoRow[])] } };
    },

    async saveCapacity(changes) {
      const { error } = await client.rpc('guardar_capacidad', { p_cambios: changes });
      return error ? failure(error) : { ok: true, data: null };
    },
  };
}
