/**
 * Repositorio de Logística sobre Supabase (tablas `stock`, `kardex`, `ajustes`, `envios`, `transferencias`, `incidencias_recepcion`, `couriers` y
 * `metodos_envio`, y las funciones de las migraciones 0012 y 0013). Solo traduce: filas ↔ modelo del sistema y errores de la base ↔ mensajes
 * claros. Las reglas y el orden de las operaciones viven en `utils/inventory.ts`, `utils/logisticsDocs.ts` y `services/logistics.ts`.
 * La seguridad no está aquí: la deciden las políticas y las funciones de la base según la cuenta que inició sesión.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Courier, ShippingMethod } from '../context/DataContext';
import {
  adjustmentFromRow, courierFromRow, courierToRow, incidentFromRow, isTransportIdConflict, kardexFromRow, methodFromRow, methodToRow, shipmentFromRow, stockErrorMessage,
  stockFromRow, transferFromRow,
  type AjusteRow, type CourierRow, type EnvioRow, type IncidenciaRow, type KardexRow, type MetodoEnvioRow, type StockRow, type TransferenciaRow,
} from '../utils/stockDb';
import type { RepoResult } from './orgDirectory';
import type { DocumentsData, LedgerData, LogisticsRepository, TransportData } from './logistics';

const failure = <T>(error: { code?: string; message?: string; details?: string } | null): RepoResult<T> =>
  ({ ok: false, error: stockErrorMessage(error), idConflict: isTransportIdConflict(error) });

/** Cuando una actualización no toca ninguna fila, la política de seguridad la ocultó (o ya no existe). */
const NOT_TOUCHED = 'No se pudo completar: el registro ya no existe o su cuenta no tiene permiso para cambiarlo.';

const PAGE = 1000;
/** Del kardex y de los ajustes se leen los últimos movimientos (crecen sin parar); el resto se lee entero. */
export const HISTORY_LIMIT = 1000;

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

/** El número que sigue al prefijo de un código (`KDX-014` → 14). */
const numberOf = (id: string | undefined): number | undefined => {
  const n = id ? parseInt(id.slice(id.indexOf('-') + 1), 10) : NaN;
  return Number.isFinite(n) ? n : undefined;
};

const byId = <T extends { id: string }>(list: T[]): T[] => [...list].sort((a, b) => a.id.localeCompare(b.id));
const newestFirst = <T extends { id: string }>(list: T[]): T[] => [...list].sort((a, b) => (numberOf(b.id) ?? 0) - (numberOf(a.id) ?? 0));

export function createSupabaseLogisticsRepository(client: SupabaseClient): LogisticsRepository {
  const rpc = async <T = null>(fn: string, args: Record<string, unknown>): Promise<RepoResult<T>> => {
    const { data, error } = await client.rpc(fn, args);
    return error ? failure(error) : { ok: true, data: (data ?? null) as T };
  };

  async function loadLedger(after: { kardexId?: string; adjustmentId?: string } = {}): Promise<RepoResult<LedgerData>> {
    const history = (table: string, afterId?: string) => {
      let q = client.from(table).select('*').order('numero', { ascending: false }).limit(HISTORY_LIMIT);
      const n = numberOf(afterId);
      if (n !== undefined) q = q.gt('numero', n);
      return q;
    };
    const [stock, kardex, adjustments] = await Promise.all([fetchAll<StockRow>(client, 'stock', 'numero'), history('kardex', after.kardexId), history('ajustes', after.adjustmentId)]);
    const error = stock.error ?? kardex.error ?? adjustments.error;
    if (error) return failure(error);
    return {
      ok: true,
      data: {
        stock: byId((stock.data as StockRow[]).map(stockFromRow)),
        kardex: (kardex.data as KardexRow[]).map(kardexFromRow),
        adjustments: (adjustments.data as AjusteRow[]).map(adjustmentFromRow),
      },
    };
  }

  async function loadDocuments(): Promise<RepoResult<DocumentsData>> {
    const [e, t, i] = await Promise.all([fetchAll<EnvioRow>(client, 'envios', 'id'), fetchAll<TransferenciaRow>(client, 'transferencias', 'id'), fetchAll<IncidenciaRow>(client, 'incidencias_recepcion', 'numero')]);
    const error = e.error ?? t.error ?? i.error;
    if (error) return failure(error);
    return {
      ok: true,
      data: {
        shipments: newestFirst((e.data as EnvioRow[]).map(shipmentFromRow)),
        transfers: newestFirst((t.data as TransferenciaRow[]).map(transferFromRow)),
        incidents: (i.data as IncidenciaRow[]).map(incidentFromRow),
      },
    };
  }

  async function loadTransport(): Promise<RepoResult<TransportData>> {
    const [c, m] = await Promise.all([client.from('couriers').select('*'), client.from('metodos_envio').select('*')]);
    const error = c.error ?? m.error;
    if (error) return failure(error);
    return { ok: true, data: { couriers: byId((c.data as CourierRow[]).map(courierFromRow)), methods: byId((m.data as MetodoEnvioRow[]).map(methodFromRow)) } };
  }

  return {
    async loadAll() {
      const [ledger, docs, transport] = await Promise.all([loadLedger(), loadDocuments(), loadTransport()]);
      if (!ledger.ok || !ledger.data) return { ok: false, error: ledger.error };
      if (!docs.ok || !docs.data) return { ok: false, error: docs.error };
      if (!transport.ok || !transport.data) return { ok: false, error: transport.error };
      return { ok: true, data: { ...ledger.data, ...docs.data, ...transport.data } };
    },
    loadLedger,
    loadDocuments,
    loadTransport,

    registerEntry: i => rpc('registrar_ingreso_stock', { p_ubicacion: i.locationId, p_articulo: i.itemId, p_cantidad: i.qty, p_documento: i.doc, p_motivo: i.reason ?? null }),
    registerAdjustment: i => rpc<string>('registrar_ajuste_stock', {
      p_ubicacion: i.locationId, p_articulo: i.itemId, p_tipo: i.type, p_cantidad: i.qty, p_motivo: i.reason, p_observacion: i.observation ?? null,
    }),
    pack: (locationId, itemId) => rpc('empaquetar_articulo', { p_ubicacion: locationId, p_articulo: itemId }),
    unpack: (locationId, itemId, reason) => rpc('desempaquetar_articulo', { p_ubicacion: locationId, p_articulo: itemId, p_motivo: reason }),
    setMinStock: (locationId, itemId, minStock) => rpc('definir_stock_minimo', { p_ubicacion: locationId, p_articulo: itemId, p_minimo: minStock }),
    sell: i => rpc('vender_articulo', { p_sede: i.branchId, p_articulo: i.itemId, p_cantidad: i.qty, p_documento: i.doc, p_observacion: i.observation }),
    deliver: i => rpc('entregar_materiales', {
      p_sede: i.branchId, p_matricula: i.enrollmentId, p_alumno: i.student, p_lineas: i.lines.map(l => ({ articulo_id: l.itemId, cantidad: l.quantity })),
    }),
    restockSale: i => rpc('reponer_por_reversa', { p_sede: i.branchId, p_articulo: i.itemId, p_cantidad: i.qty, p_movimiento: i.movementId }),

    createShipment: payload => rpc<string>('crear_envio', { p: payload }),
    editShipment: (id, payload) => rpc('editar_envio', { p_id: id, p: payload }),
    changeShipmentStatus: (id, status, observation) => rpc('cambiar_estado_envio', { p_id: id, p_estado: status, p_observacion: observation ?? null }),
    removeShipment: id => rpc('eliminar_envio', { p_id: id }),
    createTransfer: payload => rpc<string>('crear_transferencia', { p: payload }),
    editTransfer: (id, payload) => rpc('editar_transferencia', { p_id: id, p: payload }),
    changeTransferStatus: (id, status) => rpc('cambiar_estado_transferencia', { p_id: id, p_estado: status }),
    confirmReception: (kind, docId, lines, observation) => rpc('confirmar_recepcion', { p_tipo: kind, p_doc: docId, p_lineas: lines, p_observacion: observation ?? null }),

    async insertCourier(courier: Courier) {
      const { data, error } = await client.from('couriers').insert(courierToRow(courier)).select().single();
      return error ? failure(error) : { ok: true, data: courierFromRow(data as CourierRow) };
    },
    async updateCourier(courier: Courier) {
      const { id, ...row } = courierToRow(courier);
      const { data, error } = await client.from('couriers').update(row).eq('id', id).select();
      if (error) return failure(error);
      return data && data.length === 1 ? { ok: true, data: courierFromRow(data[0] as CourierRow) } : { ok: false, error: NOT_TOUCHED };
    },
    async insertMethod(method: ShippingMethod) {
      const { data, error } = await client.from('metodos_envio').insert(methodToRow(method)).select().single();
      return error ? failure(error) : { ok: true, data: methodFromRow(data as MetodoEnvioRow) };
    },
    async updateMethod(method: ShippingMethod) {
      const { id, ...row } = methodToRow(method);
      const { data, error } = await client.from('metodos_envio').update(row).eq('id', id).select();
      if (error) return failure(error);
      return data && data.length === 1 ? { ok: true, data: methodFromRow(data[0] as MetodoEnvioRow) } : { ok: false, error: NOT_TOUCHED };
    },
  };
}
