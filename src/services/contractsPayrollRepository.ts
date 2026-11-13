/**
 * Repositorio de Contratos y Planilla sobre Supabase: las 7 tablas se LEEN directamente (la política de seguridad de la base decide qué ve
 * cada cuenta: sin «Ver remuneraciones» no llegan los sueldos) y se ESCRIBEN solo con las funciones de la base (`crear_contrato`,
 * `generar_planilla`, `cerrar_planilla`…), que validan, piden la función que corresponde y dejan constancia de quién y cuándo. Aquí solo se
 * traduce: filas ↔ modelo del sistema y errores de la base ↔ mensajes claros. Las reglas y el orden viven en `services/contractsPayroll.ts`.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  adjustmentPayload, contractFromRows, contractPayload, linesPayload, runsFromRows,
  type AjusteRow, type ContratoPagoRow, type ContratoRow, type EventoRow, type LineaRow, type PlanillaRow, type RevisionRow,
} from '../utils/contractsDb';
import { dbErrorMessage, isIdConflict } from '../utils/orgDirectory';
import type { ContractsPayrollRepository } from './contractsPayroll';
import type { RepoResult } from './orgDirectory';

const failure = <T>(error: { code?: string; message?: string; details?: string } | null): RepoResult<T> =>
  ({ ok: false, error: dbErrorMessage(error), idConflict: isIdConflict(error) });

const PAGE = 1000;

/** Lee TODA una tabla de a mil filas (la API entrega mil por vez) en un orden estable. */
async function fetchAll<T>(client: SupabaseClient, table: string, order: string[]): Promise<{ data: T[]; error: null } | { data: null; error: { code?: string; message?: string; details?: string } }> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    let query = client.from(table).select('*');
    for (const column of order) query = query.order(column);
    const { data, error } = await query.range(from, from + PAGE - 1);
    if (error) return { data: null, error };
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) return { data: out, error: null };
  }
}

export function createSupabaseContractsPayrollRepository(client: SupabaseClient): ContractsPayrollRepository {
  const rpc = async (fn: string, args: Record<string, unknown>): Promise<RepoResult<null>> => {
    const { error } = await client.rpc(fn, args);
    return error ? failure(error) : { ok: true, data: null };
  };
  // Las funciones que CREAN algo (migración 0020) asignan el código y lo devuelven
  const rpcCreate = async (fn: string, args: Record<string, unknown>): Promise<RepoResult<{ id: string }>> => {
    const { data, error } = await client.rpc(fn, args);
    if (error) return failure(error);
    return typeof data === 'string' && data ? { ok: true, data: { id: data } } : { ok: false, error: 'La base no devolvió el código asignado. Actualice la página e intente de nuevo.' };
  };

  return {
    async listContracts() {
      const [c, p, r] = await Promise.all([
        fetchAll<ContratoRow>(client, 'contratos', ['id']),
        fetchAll<ContratoPagoRow>(client, 'contratos_pago', ['contrato_id']),
        fetchAll<RevisionRow>(client, 'contrato_revisiones', ['id']),
      ]);
      if (c.error) return failure(c.error);
      if (p.error) return failure(p.error);
      if (r.error) return failure(r.error);
      const pagos = new Map(p.data.map(x => [x.contrato_id, x]));
      return { ok: true, data: c.data.map(row => contractFromRows(row, pagos.get(row.id), r.data)) };
    },

    async listPayroll() {
      const [p, a, l, e] = await Promise.all([
        fetchAll<PlanillaRow>(client, 'planillas', ['id']),
        fetchAll<AjusteRow>(client, 'planilla_ajustes', ['id']),
        fetchAll<LineaRow>(client, 'planilla_lineas', ['planilla_id', 'contrato_id']),
        fetchAll<EventoRow>(client, 'planilla_eventos', ['id']),
      ]);
      if (p.error) return failure(p.error);
      if (a.error) return failure(a.error);
      if (l.error) return failure(l.error);
      if (e.error) return failure(e.error);
      return { ok: true, data: runsFromRows(p.data, a.data, l.data, e.data) };
    },

    createContract: (id, contract) => rpcCreate('crear_contrato', { p_id: id, p: contractPayload(contract) }),
    editContract: (id, contract, reason, changes) => rpc('editar_contrato', { p_id: id, p: contractPayload(contract), p_motivo: reason, p_cambios: changes }),
    closeContract: (id, date, reason) => rpc('cesar_contrato', { p_id: id, p_fecha: date, p_motivo: reason }),
    renewContract: (previousId, id, contract) => rpcCreate('renovar_contrato', { p_anterior: previousId, p_id: id, p: contractPayload(contract) }),

    generatePayroll: (id, companyId, period) => rpc('generar_planilla', { p_id: id, p_empresa: companyId, p_periodo: period }),
    deletePayrollDraft: id => rpc('eliminar_borrador_planilla', { p_id: id }),
    addAdjustment: (id, runId, adjustment, detail) => rpcCreate('agregar_ajuste_planilla', { p_id: id, p_planilla: runId, p: adjustmentPayload(adjustment), p_detalle: detail }),
    removeAdjustment: (runId, adjustmentId, detail) => rpc('quitar_ajuste_planilla', { p_planilla: runId, p_ajuste: adjustmentId, p_detalle: detail }),
    closePayroll: (runId, lines, detail) => rpc('cerrar_planilla', { p_id: runId, p_lineas: linesPayload(lines), p_detalle: detail }),
    reopenPayroll: (runId, reason) => rpc('reabrir_planilla', { p_id: runId, p_motivo: reason }),
  };
}
