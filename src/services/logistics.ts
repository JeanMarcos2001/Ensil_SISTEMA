/**
 * Operaciones de Logística (stock, kardex, ajustes, envíos, transferencias, recepciones, couriers y métodos de envío) sobre la base de datos:
 * validan con las reglas puras (`utils/inventory.ts`, `utils/logisticsRoutes.ts`, `utils/logisticsDocs.ts`) y luego llaman a la base.
 *
 * Reciben el repositorio como parámetro (el de Supabase en el sistema, uno en memoria en `scripts/check-stock-db.ts`), de modo que el orden
 * «validar → guardar → traducir el error» se puede comprobar sin conexión. Ninguna toca el estado de React: quien llama (el gancho
 * `useLogistics`) vuelve a leer de la base lo que cambió (`affects`), así lo que se muestra es lo que de verdad quedó guardado.
 *
 * El stock solo lo mueve la base: cada operación que lo toca (ingreso, ajuste, venta, entrega, envío, transferencia, recepción) es UNA llamada que
 * descuenta o suma, comprueba que el saldo no quede negativo y deja el kardex, todo o nada.
 */
import type { Courier, Item, ReceptionIncident, Shipment, ShippingMethod, StockItem, Transfer } from '../context/DataContext';
import {
  adjustmentError, minStockError, packageError, stockEntryError, type AdjustmentType,
} from '../utils/inventory';
import { locationSaleError, shipmentRouteError, transferRouteError, type StockLocation } from '../utils/logisticsRoutes';
import {
  courierError, detailError, methodError, receptionError, shipmentContentError, transferRequestError, transferDispatchError, type ReceivedLine,
} from '../utils/logisticsDocs';
import { nextSequentialId } from '../utils/ids';
import type { AdjustmentLine, KardexLine } from '../utils/stockDb';
import type { OpResult, RepoResult } from './orgDirectory';

export interface LedgerData { stock: StockItem[]; kardex: KardexLine[]; adjustments: AdjustmentLine[] }
export interface DocumentsData { shipments: Shipment[]; transfers: Transfer[]; incidents: ReceptionIncident[] }
export interface TransportData { couriers: Courier[]; methods: ShippingMethod[] }
export type LogisticsData = LedgerData & DocumentsData & TransportData;

/** Qué hay que volver a leer después de una operación. */
export type Affects = 'ledger' | 'documents' | 'both' | 'transport';
export type LogisticsResult = OpResult & { affects?: Affects; id?: string };

export interface LogisticsRepository {
  loadAll(): Promise<RepoResult<LogisticsData>>;
  loadLedger(after?: { kardexId?: string; adjustmentId?: string }): Promise<RepoResult<LedgerData>>;
  loadDocuments(): Promise<RepoResult<DocumentsData>>;
  loadTransport(): Promise<RepoResult<TransportData>>;

  registerEntry(i: { locationId: string; itemId: string; qty: number; doc: string; reason?: string }): Promise<RepoResult<null>>;
  registerAdjustment(i: { locationId: string; itemId: string; type: AdjustmentType; qty: number; reason: string; observation?: string }): Promise<RepoResult<string>>;
  pack(locationId: string, itemId: string): Promise<RepoResult<null>>;
  unpack(locationId: string, itemId: string): Promise<RepoResult<null>>;
  setMinStock(locationId: string, itemId: string, minStock: number): Promise<RepoResult<null>>;
  sell(i: { branchId: string; itemId: string; qty: number; doc: string; observation: string }): Promise<RepoResult<null>>;
  deliver(i: { branchId: string; enrollmentId: string; student: string; lines: { itemId: string; quantity: number }[] }): Promise<RepoResult<null>>;
  restockSale(i: { branchId: string; itemId: string; qty: number; movementId: string }): Promise<RepoResult<null>>;

  createShipment(payload: Record<string, unknown>): Promise<RepoResult<string>>;
  editShipment(id: string, payload: Record<string, unknown>): Promise<RepoResult<null>>;
  changeShipmentStatus(id: string, status: string, observation?: string): Promise<RepoResult<null>>;
  removeShipment(id: string): Promise<RepoResult<null>>;
  createTransfer(payload: Record<string, unknown>): Promise<RepoResult<string>>;
  editTransfer(id: string, payload: Record<string, unknown>): Promise<RepoResult<null>>;
  changeTransferStatus(id: string, status: string): Promise<RepoResult<null>>;
  confirmReception(kind: 'Envío' | 'Transferencia', docId: string, lines: { articulo_id: string; cantidad: number; estado: string; observacion?: string }[], observation?: string): Promise<RepoResult<null>>;

  insertCourier(courier: Courier): Promise<RepoResult<Courier>>;
  updateCourier(courier: Courier): Promise<RepoResult<Courier>>;
  insertMethod(method: ShippingMethod): Promise<RepoResult<ShippingMethod>>;
  updateMethod(method: ShippingMethod): Promise<RepoResult<ShippingMethod>>;
}

/** Con qué se comprueban las reglas: lo último que se vio del stock, de los documentos y de los catálogos. */
export interface LogisticsContext {
  items: Pick<Item, 'id' | 'name' | 'isPackage' | 'allowUnpacking' | 'composition'>[];
  locations: StockLocation[];
  stock: StockItem[];
  shipments: Shipment[];
  transfers: Transfer[];
  couriers: Courier[];
  methods: ShippingMethod[];
}

const fail = (error: string): LogisticsResult => ({ ok: false, error });
const done = (affects: Affects, id?: string): LogisticsResult => ({ ok: true, affects, ...(id ? { id } : {}) });
const MAX_ID_ATTEMPTS = 3;

/** Lee de la base todo Logística. Se lee al iniciar sesión (`AccessGate`), antes de montar las pantallas. */
export async function loadLogistics(repo: LogisticsRepository): Promise<OpResult<LogisticsData>> {
  const res = await repo.loadAll();
  return res.ok && res.data ? { ok: true, value: res.data } : { ok: false, error: res.error ?? 'No se pudo cargar Logística (stock, kardex, envíos y transferencias).' };
}

const itemIds = (ctx: LogisticsContext) => ctx.items.map(i => i.id);

// ------------------------------------------------------------------------------------------------------------------ Stock

export async function registerStockEntry(
  repo: LogisticsRepository, input: { branchId: string; itemId: string; qty: number; doc: string; reason?: string },
): Promise<LogisticsResult> {
  const invalid = stockEntryError(input);
  if (invalid) return fail(invalid);
  const res = await repo.registerEntry({ locationId: input.branchId, itemId: input.itemId, qty: input.qty, doc: input.doc.trim(), reason: input.reason?.trim() || undefined });
  return res.ok ? done('ledger') : fail(res.error ?? 'No se pudo registrar el ingreso.');
}

/** Un ajuste, una merma, una devolución o una regularización. `qty` ya viene con el signo de su tipo (`signedAdjustment`). */
export async function registerAdjustment(
  repo: LogisticsRepository, ctx: LogisticsContext, input: { stockId: string; type: AdjustmentType; qty: number; reason: string; observation?: string },
): Promise<LogisticsResult> {
  const stock = ctx.stock.find(s => s.id === input.stockId);
  if (!stock) return fail('No se encontró el registro de stock.');
  const invalid = adjustmentError({ locationId: stock.branchId, itemId: stock.itemId, type: input.type, qty: input.qty, reason: input.reason });
  if (invalid) return fail(invalid);
  const res = await repo.registerAdjustment({ locationId: stock.branchId, itemId: stock.itemId, type: input.type, qty: input.qty, reason: input.reason.trim(), observation: input.observation?.trim() || undefined });
  return res.ok ? done('ledger', res.data) : fail(res.error ?? 'No se pudo registrar el ajuste.');
}

/** Primer componente sin saldo suficiente en la ubicación, o `null` si hay para todos. */
function packShortage(ctx: LogisticsContext, locationId: string, item: Pick<Item, 'composition'>): string | null {
  for (const comp of item.composition ?? []) {
    const have = ctx.stock.find(s => s.branchId === locationId && s.itemId === comp.itemId)?.stock ?? 0;
    if (have < comp.quantity) {
      const name = ctx.items.find(i => i.id === comp.itemId)?.name ?? comp.itemId;
      const place = ctx.locations.find(l => l.id === locationId)?.name ?? locationId;
      return `No hay stock suficiente de todos los componentes para empaquetar. Stock insuficiente de "${name}" en ${place}: disponible ${have}, requerido ${comp.quantity}.`;
    }
  }
  return null;
}

export async function packItem(repo: LogisticsRepository, ctx: LogisticsContext, stockId: string, action: 'pack' | 'unpack'): Promise<LogisticsResult> {
  const stock = ctx.stock.find(s => s.id === stockId);
  if (!stock) return fail('No se encontró el registro de stock.');
  const item = ctx.items.find(i => i.id === stock.itemId);
  const invalid = packageError(item, action);
  if (invalid) return fail(invalid);
  if (action === 'pack') {
    const shortage = packShortage(ctx, stock.branchId, item!);
    if (shortage) return fail(shortage);
  }
  const res = action === 'pack' ? await repo.pack(stock.branchId, stock.itemId) : await repo.unpack(stock.branchId, stock.itemId);
  return res.ok ? done('ledger') : fail(res.error ?? (action === 'pack' ? 'No se pudo empaquetar.' : 'No se pudo desempaquetar.'));
}

export async function setMinStock(repo: LogisticsRepository, ctx: LogisticsContext, stockId: string, minStock: number): Promise<LogisticsResult> {
  const stock = ctx.stock.find(s => s.id === stockId);
  if (!stock) return fail('No se encontró el registro de stock.');
  const invalid = minStockError(minStock);
  if (invalid) return fail(invalid);
  const res = await repo.setMinStock(stock.branchId, stock.itemId, minStock);
  return res.ok ? done('ledger') : fail(res.error ?? 'No se pudo guardar el stock mínimo.');
}

/** La parte de stock de una venta en caja (la caja la registra quien llama, después de que esto salga bien). */
export async function sellFromStock(
  repo: LogisticsRepository, input: { branchId: string; itemId: string; qty: number; doc: string; observation: string },
): Promise<LogisticsResult> {
  const notSold = locationSaleError(input.branchId);
  if (notSold) return fail(notSold);
  const res = await repo.sell(input);
  return res.ok ? done('ledger') : fail(res.error ?? 'No se pudo descontar el stock de la venta.');
}

/** La parte de stock de la entrega de materiales de una matrícula: todas las líneas o ninguna. */
export async function deliverFromStock(
  repo: LogisticsRepository, input: { branchId: string; enrollmentId: string; student: string; lines: { itemId: string; quantity: number }[] },
): Promise<LogisticsResult> {
  if (input.lines.length === 0) return done('ledger');
  const res = await repo.deliver(input);
  return res.ok ? done('ledger') : fail(res.error ?? 'No se pudo descontar el stock de la entrega.');
}

/** Devuelve al stock lo que vendió un movimiento de caja que se reversa. */
export async function restockReversedSale(
  repo: LogisticsRepository, input: { branchId: string; itemId: string; qty: number; movementId: string },
): Promise<LogisticsResult> {
  const res = await repo.restockSale(input);
  return res.ok ? done('ledger') : fail(res.error ?? 'No se pudo devolver el stock de la venta.');
}

// ------------------------------------------------------------------------------------------------------------------ Envíos

const transportCatalog = (ctx: LogisticsContext) => ({ methods: ctx.methods, couriers: ctx.couriers, itemIds: itemIds(ctx) });

export async function createShipment(repo: LogisticsRepository, ctx: LogisticsContext, shipment: Omit<Shipment, 'id'>, payload: Record<string, unknown>): Promise<LogisticsResult> {
  const route = shipmentRouteError(shipment.originId, shipment.destinationId, ctx.locations);
  if (route) return fail(route);
  const invalid = shipmentContentError(shipment, transportCatalog(ctx));
  if (invalid) return fail(invalid);
  const res = await repo.createShipment(payload);
  return res.ok && res.data ? done(shipment.status === 'En tránsito' ? 'both' : 'documents', res.data) : fail(res.error ?? 'No se pudo guardar el envío.');
}

export async function editShipment(repo: LogisticsRepository, ctx: LogisticsContext, id: string, next: Shipment, payload: Record<string, unknown>): Promise<LogisticsResult> {
  const prev = ctx.shipments.find(s => s.id === id);
  if (!prev) return fail('Envío no encontrado.');
  if (prev.status === 'Borrador') {
    const route = shipmentRouteError(next.originId, next.destinationId, ctx.locations);
    if (route) return fail(route);
    const invalid = shipmentContentError(next, transportCatalog(ctx));
    if (invalid) return fail(invalid);
  }
  const res = await repo.editShipment(id, payload);
  return res.ok ? done(next.status === 'En tránsito' && prev.status === 'Borrador' ? 'both' : 'documents') : fail(res.error ?? 'No se pudo guardar el envío.');
}

export async function changeShipmentStatus(repo: LogisticsRepository, ctx: LogisticsContext, id: string, status: Shipment['status'], observation?: string): Promise<LogisticsResult> {
  const prev = ctx.shipments.find(s => s.id === id);
  if (!prev) return fail('Envío no encontrado.');
  const res = await repo.changeShipmentStatus(id, status, observation);
  return res.ok ? done('both') : fail(res.error ?? 'No se pudo cambiar el estado del envío.');
}

export async function removeShipment(repo: LogisticsRepository, ctx: LogisticsContext, id: string): Promise<LogisticsResult> {
  if (!ctx.shipments.some(s => s.id === id)) return fail('Envío no encontrado.');
  const res = await repo.removeShipment(id);
  return res.ok ? done('documents') : fail(res.error ?? 'No se pudo eliminar el envío.');
}

// ------------------------------------------------------------------------------------------------------------------ Transferencias

export async function createTransfer(repo: LogisticsRepository, ctx: LogisticsContext, transfer: Omit<Transfer, 'id'>, payload: Record<string, unknown>): Promise<LogisticsResult> {
  const route = transferRouteError(transfer.originId, transfer.destinationId, ctx.locations);
  if (route) return fail(route);
  const invalid = transferRequestError(transfer, itemIds(ctx));
  if (invalid) return fail(invalid);
  const res = await repo.createTransfer(payload);
  return res.ok && res.data ? done('documents', res.data) : fail(res.error ?? 'No se pudo guardar la transferencia.');
}

export async function editTransfer(repo: LogisticsRepository, ctx: LogisticsContext, id: string, next: Transfer, payload: Record<string, unknown>): Promise<LogisticsResult> {
  const prev = ctx.transfers.find(t => t.id === id);
  if (!prev) return fail('Transferencia no encontrada.');
  if (next.originId !== prev.originId || next.destinationId !== prev.destinationId) {
    const route = transferRouteError(next.originId, next.destinationId, ctx.locations);
    if (route) return fail(route);
  }
  if (prev.status === 'Borrador') {
    const invalid = transferRequestError(next, itemIds(ctx));
    if (invalid) return fail(invalid);
  } else if (prev.status === 'Aprobada' && ('items' in payload || 'cajas' in payload)) {
    const invalid = detailError(next.items, next.boxes ?? [], itemIds(ctx));
    if (invalid) return fail(invalid);
  }
  const res = await repo.editTransfer(id, payload);
  return res.ok ? done('documents') : fail(res.error ?? 'No se pudo guardar la transferencia.');
}

export async function changeTransferStatus(repo: LogisticsRepository, ctx: LogisticsContext, id: string, status: Transfer['status']): Promise<LogisticsResult> {
  const transfer = ctx.transfers.find(t => t.id === id);
  if (!transfer) return fail('Transferencia no encontrada.');
  if (status === 'En tránsito') {
    const invalid = transferDispatchError(transfer, transportCatalog(ctx));
    if (invalid) return fail(invalid);
  }
  const res = await repo.changeTransferStatus(id, status);
  return res.ok ? done('both') : fail(res.error ?? 'No se pudo cambiar el estado de la transferencia.');
}

// ------------------------------------------------------------------------------------------------------------------ Recepción

export interface ReceptionInput { docId: string; docType: 'Envío' | 'Transferencia'; receivedItems: ReceivedLine[]; generalObservation?: string }

export async function confirmReception(repo: LogisticsRepository, ctx: LogisticsContext, input: ReceptionInput): Promise<LogisticsResult> {
  const doc = input.docType === 'Envío' ? ctx.shipments.find(s => s.id === input.docId) : ctx.transfers.find(t => t.id === input.docId);
  if (!doc) return fail('No se encontró el documento a recepcionar.');
  const invalid = receptionError(doc.status, input.receivedItems, itemIds(ctx));
  if (invalid) return fail(invalid);
  const res = await repo.confirmReception(
    input.docType, input.docId,
    input.receivedItems.map(r => ({ articulo_id: r.itemId, cantidad: r.quantity, estado: r.status, observacion: r.observation })),
    input.generalObservation,
  );
  return res.ok ? done('both') : fail(res.error ?? 'No se pudo confirmar la recepción.');
}

// ------------------------------------------------------------------------------------------------------------------ Couriers y métodos de envío

/** El id lo asigna el sistema (`COUR-NNN`, `SM-NNN`); si dos personas crean a la vez, se reintenta con el siguiente. */
async function insertWithNewId<T extends { id: string }>(
  taken: string[], prefix: string, entity: Omit<T, 'id'>, insert: (e: T) => Promise<RepoResult<T>>, errorText: string,
): Promise<OpResult<T>> {
  const ids = [...taken];
  for (let attempt = 0; attempt < MAX_ID_ATTEMPTS; attempt++) {
    const id = nextSequentialId(prefix, ids);
    const res = await insert({ ...entity, id } as T);
    if (res.ok && res.data) return { ok: true, value: res.data };
    if (!res.idConflict) return { ok: false, error: res.error ?? errorText };
    ids.push(id);
  }
  return { ok: false, error: 'No se pudo asignar un código. Intente de nuevo.' };
}

export async function addCourier(repo: LogisticsRepository, ctx: LogisticsContext, courier: Omit<Courier, 'id'>): Promise<OpResult<Courier>> {
  const invalid = courierError(courier, ctx.couriers);
  if (invalid) return { ok: false, error: invalid };
  return insertWithNewId<Courier>(ctx.couriers.map(c => c.id), 'COUR', courier, c => repo.insertCourier(c), 'No se pudo guardar el courier.');
}

export async function updateCourier(repo: LogisticsRepository, ctx: LogisticsContext, id: string, patch: Partial<Omit<Courier, 'id'>>): Promise<OpResult<Courier>> {
  const current = ctx.couriers.find(c => c.id === id);
  if (!current) return { ok: false, error: 'No se encontró el courier.' };
  const next = { ...current, ...patch };
  const invalid = courierError(next, ctx.couriers, id);
  if (invalid) return { ok: false, error: invalid };
  const res = await repo.updateCourier(next);
  return res.ok && res.data ? { ok: true, value: res.data } : { ok: false, error: res.error ?? 'No se pudo guardar el courier.' };
}

export async function addShippingMethod(repo: LogisticsRepository, ctx: LogisticsContext, method: Omit<ShippingMethod, 'id'>): Promise<OpResult<ShippingMethod>> {
  const invalid = methodError(method);
  if (invalid) return { ok: false, error: invalid };
  return insertWithNewId<ShippingMethod>(ctx.methods.map(m => m.id), 'SM', method, m => repo.insertMethod(m), 'No se pudo guardar el método.');
}

export async function updateShippingMethod(repo: LogisticsRepository, ctx: LogisticsContext, id: string, patch: Partial<Omit<ShippingMethod, 'id'>>): Promise<OpResult<ShippingMethod>> {
  const current = ctx.methods.find(m => m.id === id);
  if (!current) return { ok: false, error: 'No se encontró el método de envío.' };
  const next = { ...current, ...patch };
  const invalid = methodError(next);
  if (invalid) return { ok: false, error: invalid };
  const res = await repo.updateMethod(next);
  return res.ok && res.data ? { ok: true, value: res.data } : { ok: false, error: res.error ?? 'No se pudo guardar el método.' };
}
