/**
 * Repositorio de la política de cobranza, los recordatorios y la plantilla del contrato sobre Supabase (tablas `cobranza_politicas`,
 * `recordatorios_cobranza` y `plantilla_contrato_versiones`, y las funciones de la migración 0021). Solo traduce: filas ↔ modelo del sistema y errores de
 * la base ↔ mensajes claros. Las reglas y el orden de las operaciones viven en `utils/collections.ts`, `utils/enrollmentDocuments.ts` y
 * `services/collectionConfig.ts`. La seguridad no está aquí: la deciden las políticas y las funciones de la base según la cuenta que inició sesión.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  collectionConfigErrorMessage, policyFromRow, reminderFromRow, templateFromRow, type PlantillaRow, type PoliticaRow, type RecordatorioRow,
} from '../utils/collectionConfigDb';
import type { CollectionConfigRepository } from './collectionConfig';
import type { RepoResult } from './orgDirectory';

const failure = <T>(error: { code?: string; message?: string; details?: string } | null): RepoResult<T> => ({ ok: false, error: collectionConfigErrorMessage(error) });

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

export function createSupabaseCollectionConfigRepository(client: SupabaseClient): CollectionConfigRepository {
  /** Llama a una función de la base que devuelve un valor (el número de la versión vigente o el código asignado). */
  const rpcValue = async <T extends string | number>(fn: string, args: Record<string, unknown>, kind: 'number' | 'string'): Promise<RepoResult<T>> => {
    const { data, error } = await client.rpc(fn, args);
    if (error) return failure(error);
    if (typeof data !== kind || data === '' || data === null) return { ok: false, error: 'La base no devolvió la respuesta esperada. Actualice la página e intente de nuevo.' };
    return { ok: true, data: data as T };
  };

  return {
    async loadAll() {
      const [p, r, t] = await Promise.all([
        fetchAll<PoliticaRow>(client, 'cobranza_politicas', 'version'), fetchAll<RecordatorioRow>(client, 'recordatorios_cobranza', 'id'),
        fetchAll<PlantillaRow>(client, 'plantilla_contrato_versiones', 'version'),
      ]);
      const error = p.error ?? r.error ?? t.error;
      if (error) return failure(error);
      return {
        ok: true,
        data: {
          policies: (p.data as PoliticaRow[]).map(policyFromRow).sort((a, b) => b.version - a.version),
          reminders: (r.data as RecordatorioRow[]).map(reminderFromRow).sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id)),
          templates: (t.data as PlantillaRow[]).map(templateFromRow).sort((a, b) => b.version - a.version),
        },
      };
    },

    savePolicy: policy => rpcValue<number>('guardar_politica_cobranza', {
      p_dias_gracia: policy.graceDays, p_tasa_mora: policy.moraMonthlyRate, p_antes: policy.remindBefore, p_despues: policy.remindAfter,
    }, 'number'),
    addReminder: r => rpcValue<string>('registrar_recordatorio', {
      p_plan: r.planId, p_cuota: r.installmentId, p_desfase: r.stageOffset, p_canal: r.channel, p_resultado: r.result, p_nota: r.note || null,
    }, 'string'),
    saveTemplate: t => rpcValue<number>('guardar_plantilla_contrato', {
      p_introduccion: t.intro, p_clausulas: t.clauses.map(c => ({ id: c.id, title: c.title, body: c.body })), p_cierre: t.closing, p_revisada: t.reviewed,
    }, 'number'),
  };
}
