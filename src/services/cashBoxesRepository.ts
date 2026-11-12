/**
 * Repositorio de los cierres de caja y la caja chica sobre Supabase (tablas `cierres_caja`, `caja_chica_movimientos` y `caja_chica_fondos`, y las funciones de
 * la migración 0017). Solo traduce: filas ↔ modelo del sistema y errores de la base ↔ mensajes claros. Las reglas y el orden de las operaciones viven en
 * `utils/cashClosure.ts`, `utils/pettyCash.ts` y `services/cashBoxes.ts`. La seguridad no está aquí: la deciden las políticas y las funciones de la base
 * según la cuenta que inició sesión (quién ve y cierra la caja de cada sede).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  cashBoxesErrorMessage, closureFromRow, codeNumber, pettyFundFromRow, pettyMovementFromRow,
  type CajaChicaFondoRow, type CajaChicaMovimientoRow, type CierreRow,
} from '../utils/cashBoxesDb';
import type { PettyFund } from '../utils/pettyCash';
import type { CashBoxesRepository } from './cashBoxes';
import type { RepoResult } from './orgDirectory';

const failure = <T>(error: { code?: string; message?: string; details?: string } | null): RepoResult<T> => ({ ok: false, error: cashBoxesErrorMessage(error) });

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

export function createSupabaseCashBoxesRepository(client: SupabaseClient): CashBoxesRepository {
  const rpc = async <T = null>(fn: string, args: Record<string, unknown>): Promise<RepoResult<T>> => {
    const { data, error } = await client.rpc(fn, args);
    return error ? failure(error) : { ok: true, data: (data ?? null) as T };
  };

  return {
    async loadAll() {
      const [c, m, f] = await Promise.all([fetchAll<CierreRow>(client, 'cierres_caja', 'id'), fetchAll<CajaChicaMovimientoRow>(client, 'caja_chica_movimientos', 'id'), client.from('caja_chica_fondos').select('*')]);
      const error = c.error ?? m.error ?? f.error;
      if (error) return failure(error);
      const funds: Record<string, PettyFund> = {};
      for (const row of (f.data ?? []) as CajaChicaFondoRow[]) { const { branchId, fund } = pettyFundFromRow(row); funds[branchId] = fund; }
      return {
        ok: true,
        data: {
          closures: (c.data as CierreRow[]).map(closureFromRow).sort((a, b) => codeNumber(b.id) - codeNumber(a.id)),
          pettyMovements: (m.data as CajaChicaMovimientoRow[]).map(pettyMovementFromRow).sort((a, b) => b.date.localeCompare(a.date) || codeNumber(b.id) - codeNumber(a.id)),
          pettyFunds: funds,
        },
      };
    },

    close: r => rpc<string>('cerrar_caja', { p_ambito: r.scope, p_moneda: r.currency, p_sede: r.branchId ?? null, p_fecha: r.date, p_contado: r.counted, p_nota: r.note }),
    reopen: (closureId, reason) => rpc('reabrir_cierre', { p_cierre: closureId, p_motivo: reason }),
    setFund: (branchId, assigned, maxExpense) => rpc('definir_fondo_caja_chica', { p_sede: branchId, p_asignado: assigned, p_tope: maxExpense }),
    addPetty: r => rpc<string>('registrar_movimiento_caja_chica', {
      p_sede: r.branchId, p_tipo: r.kind, p_fecha: r.date, p_categoria: r.category, p_concepto: r.concept, p_monto: r.amount, p_medio: r.method,
      p_referencia: r.reference || null, p_evidencia: r.evidence || null, p_observaciones: r.observations || null,
    }),
    reversePetty: (id, reason, detail) => rpc('reversar_movimiento_caja_chica', { p_id: id, p_motivo: reason, p_detalle: detail }),
  };
}
