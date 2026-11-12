import { useCallback, useMemo, useRef, useState } from 'react';
import type { Adjustment, Courier, Item, KardexEntry, ReceptionIncident, Shipment, ShippingMethod, StockItem, Transfer } from '../context/DataContext';
import { supabase } from '../lib/supabase';
import {
  addCourier, addShippingMethod, changeShipmentStatus, changeTransferStatus, confirmReception, createShipment, createTransfer, deliverFromStock, editShipment, editTransfer,
  loadLogistics, packItem, registerAdjustment, registerStockEntry, removeShipment, restockReversedSale, sellFromStock, setMinStock, updateCourier, updateShippingMethod,
  type Affects, type LogisticsContext, type LogisticsData, type LogisticsResult, type ReceptionInput,
} from '../services/logistics';
import { createSupabaseLogisticsRepository } from '../services/logisticsRepository';
import type { OpResult } from '../services/orgDirectory';
import type { AdjustmentType } from '../utils/inventory';
import type { StockLocation } from '../utils/logisticsRoutes';
import {
  adjustmentView, kardexView, shipmentPayload, transferPayload, type AdjustmentLine, type KardexLine,
} from '../utils/stockDb';

export interface LogisticsRefs { items: Item[]; locations: StockLocation[] }

/** Un ajuste tal como lo piden las pantallas: el lugar y el artículo salen del registro de stock elegido. */
export type AdjustmentInput = { type: AdjustmentType; qty: number; reason: string; observation?: string };

/**
 * Logística guardada en la base de datos (stock, kardex, ajustes, envíos, transferencias, incidencias de recepción, couriers y métodos de envío):
 * arranca con lo que `AccessGate` leyó al iniciar sesión y, después de CADA operación, vuelve a leer de la base lo que cambió, así lo que se
 * muestra es lo que de verdad quedó guardado. Las reglas y el orden «validar → guardar» están en `services/logistics.ts`; aquí solo se guarda el
 * estado de React. Cada operación devuelve `{ ok, error }` como las demás acciones del contexto (nunca lanza).
 *
 * El stock solo lo mueve la base: cada operación es UNA llamada que descuenta o suma, comprueba que el saldo no quede negativo y deja el
 * kardex, todo o nada. El kardex y los ajustes guardan ids; los nombres del artículo y del lugar se agregan al mostrarlos.
 */
export function useLogistics(initial: LogisticsData, refs: LogisticsRefs) {
  const repo = useMemo(() => createSupabaseLogisticsRepository(supabase), []);
  const [stock, setStock] = useState<StockItem[]>(initial.stock);
  const [kardexLines, setKardexLines] = useState<KardexLine[]>(initial.kardex);
  const [adjustmentLines, setAdjustmentLines] = useState<AdjustmentLine[]>(initial.adjustments);
  const [shipments, setShipments] = useState<Shipment[]>(initial.shipments);
  const [transfers, setTransfers] = useState<Transfer[]>(initial.transfers);
  const [incidents, setIncidents] = useState<ReceptionIncident[]>(initial.incidents);
  const [couriers, setCouriers] = useState<Courier[]>(initial.couriers);
  const [methods, setMethods] = useState<ShippingMethod[]>(initial.methods);

  // Las operaciones validan contra lo último que se vio (no contra la lista de cuando se creó la función).
  const stockRef = useRef(stock); stockRef.current = stock;
  const kardexRef = useRef(kardexLines); kardexRef.current = kardexLines;
  const adjustmentsRef = useRef(adjustmentLines); adjustmentsRef.current = adjustmentLines;
  const shipmentsRef = useRef(shipments); shipmentsRef.current = shipments;
  const transfersRef = useRef(transfers); transfersRef.current = transfers;
  const couriersRef = useRef(couriers); couriersRef.current = couriers;
  const methodsRef = useRef(methods); methodsRef.current = methods;
  const refsRef = useRef(refs); refsRef.current = refs;
  const context = (): LogisticsContext => ({
    items: refsRef.current.items, locations: refsRef.current.locations, stock: stockRef.current, shipments: shipmentsRef.current, transfers: transfersRef.current,
    couriers: couriersRef.current, methods: methodsRef.current,
  });

  const names = useMemo(() => ({
    locationName: (id: string) => refs.locations.find(l => l.id === id)?.name ?? id,
    itemName: (id: string) => refs.items.find(i => i.id === id)?.name ?? id,
  }), [refs.items, refs.locations]);
  const kardex: KardexEntry[] = useMemo(() => kardexView(kardexLines, names), [kardexLines, names]);
  const adjustments: Adjustment[] = useMemo(() => adjustmentView(adjustmentLines, names), [adjustmentLines, names]);

  /** Vuelve a leer el stock y los movimientos nuevos (el kardex y los ajustes crecen: solo se piden los que faltan). */
  const refreshLedger = useCallback(async () => {
    const res = await repo.loadLedger({ kardexId: kardexRef.current[0]?.id, adjustmentId: adjustmentsRef.current[0]?.id });
    if (!res.ok || !res.data) return;
    const fresh = res.data;
    setStock(fresh.stock);
    if (fresh.kardex.length > 0) setKardexLines(prev => [...fresh.kardex, ...prev]);
    if (fresh.adjustments.length > 0) setAdjustmentLines(prev => [...fresh.adjustments, ...prev]);
  }, [repo]);
  const refreshDocuments = useCallback(async () => {
    const res = await repo.loadDocuments();
    if (!res.ok || !res.data) return;
    setShipments(res.data.shipments); setTransfers(res.data.transfers); setIncidents(res.data.incidents);
  }, [repo]);
  const refreshTransport = useCallback(async () => {
    const res = await repo.loadTransport();
    if (!res.ok || !res.data) return;
    setCouriers(res.data.couriers); setMethods(res.data.methods);
  }, [repo]);

  const reload = useCallback(async (): Promise<OpResult> => {
    const res = await loadLogistics(repo);
    if (!res.ok || !res.value) return { ok: false, error: res.error };
    const v = res.value;
    setStock(v.stock); setKardexLines(v.kardex); setAdjustmentLines(v.adjustments); setShipments(v.shipments); setTransfers(v.transfers);
    setIncidents(v.incidents); setCouriers(v.couriers); setMethods(v.methods);
    return { ok: true };
  }, [repo]);

  /** Después de una operación que salió bien, vuelve a leer lo que cambió; el resultado es el de la operación (aunque la lectura falle). */
  const settle = useCallback(async (res: LogisticsResult): Promise<OpResult & { id?: string }> => {
    if (res.ok) {
      const what: Affects = res.affects ?? 'both';
      const jobs: Promise<void>[] = [];
      if (what === 'ledger' || what === 'both') jobs.push(refreshLedger());
      if (what === 'documents' || what === 'both') jobs.push(refreshDocuments());
      if (what === 'transport') jobs.push(refreshTransport());
      await Promise.all(jobs);
    }
    return { ok: res.ok, error: res.error, ...(res.id ? { id: res.id } : {}) };
  }, [refreshLedger, refreshDocuments, refreshTransport]);

  // ---- Stock
  const entry = useCallback(async (input: { branchId: string; itemId: string; qty: number; doc: string; reason?: string }) => settle(await registerStockEntry(repo, input)), [repo, settle]);
  const adjust = useCallback(async (input: AdjustmentInput, stockId: string) => settle(await registerAdjustment(repo, context(), { stockId, ...input })), [repo, settle]);
  const pack = useCallback(async (stockId: string) => settle(await packItem(repo, context(), stockId, 'pack')), [repo, settle]);
  const unpack = useCallback(async (stockId: string, reason: string) => settle(await packItem(repo, context(), stockId, 'unpack', reason)), [repo, settle]);
  const minStock = useCallback(async (stockId: string, value: number) => settle(await setMinStock(repo, context(), stockId, value)), [repo, settle]);
  const sell = useCallback(async (input: { branchId: string; itemId: string; qty: number; doc: string; observation: string }) => settle(await sellFromStock(repo, input)), [repo, settle]);
  const deliver = useCallback(async (input: { branchId: string; enrollmentId: string; student: string; lines: { itemId: string; quantity: number }[] }) => settle(await deliverFromStock(repo, input)), [repo, settle]);
  const restock = useCallback(async (input: { branchId: string; itemId: string; qty: number; movementId: string }) => settle(await restockReversedSale(repo, input)), [repo, settle]);

  // ---- Envíos
  const addShipment = useCallback(async (shipment: Omit<Shipment, 'id'>) => settle(await createShipment(repo, context(), shipment, shipmentPayload(shipment))), [repo, settle]);
  const updateShipment = useCallback(async (id: string, patch: Partial<Shipment>) => {
    const prev = shipmentsRef.current.find(s => s.id === id);
    if (!prev) return { ok: false, error: 'Envío no encontrado.' } as OpResult;
    const { id: _ignored, ...fields } = patch;
    return settle(await editShipment(repo, context(), id, { ...prev, ...fields }, shipmentPayload(fields)));
  }, [repo, settle]);
  const updateShipmentStatus = useCallback(async (id: string, status: Shipment['status'], observation?: string) => settle(await changeShipmentStatus(repo, context(), id, status, observation)), [repo, settle]);
  const deleteShipment = useCallback(async (id: string) => settle(await removeShipment(repo, context(), id)), [repo, settle]);

  // ---- Transferencias
  const addTransfer = useCallback(async (transfer: Omit<Transfer, 'id'>) => settle(await createTransfer(repo, context(), transfer, transferPayload(transfer))), [repo, settle]);
  const updateTransfer = useCallback(async (id: string, patch: Partial<Transfer>) => {
    const prev = transfersRef.current.find(t => t.id === id);
    if (!prev) return { ok: false, error: 'Transferencia no encontrada.' } as OpResult;
    const { id: _ignored, ...fields } = patch;
    return settle(await editTransfer(repo, context(), id, { ...prev, ...fields }, transferPayload(fields)));
  }, [repo, settle]);
  const updateTransferStatus = useCallback(async (id: string, status: Transfer['status']) => settle(await changeTransferStatus(repo, context(), id, status)), [repo, settle]);

  // ---- Recepción
  const receive = useCallback(async (input: ReceptionInput) => settle(await confirmReception(repo, context(), input)), [repo, settle]);

  // ---- Couriers y métodos de envío
  const saveCourier = useCallback(async (courier: Omit<Courier, 'id'>): Promise<OpResult> => {
    const res = await addCourier(repo, context(), courier);
    if (res.ok && res.value) { const saved = res.value; setCouriers(prev => [...prev, saved].sort((a, b) => a.id.localeCompare(b.id))); }
    return { ok: res.ok, error: res.error };
  }, [repo]);
  const changeCourier = useCallback(async (id: string, patch: Partial<Omit<Courier, 'id'>>): Promise<OpResult> => {
    const res = await updateCourier(repo, context(), id, patch);
    if (res.ok && res.value) { const saved = res.value; setCouriers(prev => prev.map(c => (c.id === id ? saved : c))); }
    return { ok: res.ok, error: res.error };
  }, [repo]);
  const saveMethod = useCallback(async (method: Omit<ShippingMethod, 'id'>): Promise<OpResult> => {
    const res = await addShippingMethod(repo, context(), method);
    if (res.ok && res.value) { const saved = res.value; setMethods(prev => [...prev, saved].sort((a, b) => a.id.localeCompare(b.id))); }
    return { ok: res.ok, error: res.error };
  }, [repo]);
  const changeMethod = useCallback(async (id: string, patch: Partial<Omit<ShippingMethod, 'id'>>): Promise<OpResult> => {
    const res = await updateShippingMethod(repo, context(), id, patch);
    if (res.ok && res.value) { const saved = res.value; setMethods(prev => prev.map(m => (m.id === id ? saved : m))); }
    return { ok: res.ok, error: res.error };
  }, [repo]);

  return {
    stockItems: stock, kardex, adjustments, shipments, transfers, incidents, couriers, shippingMethods: methods, reload,
    /** Vuelve a leer el stock y el kardex (lo usa quien movió stock dentro de otra operación de la base, como la venta en caja o la reversa). */
    refreshStock: refreshLedger,
    registerStockEntry: entry, addAdjustment: adjust, packPackage: pack, unpackPackage: unpack, updateMinStock: minStock,
    sellFromStock: sell, deliverFromStock: deliver, restockReversedSale: restock,
    addShipment, updateShipment, updateShipmentStatus, deleteShipment,
    addTransfer, updateTransfer, updateTransferStatus, confirmReception: receive,
    addCourier: saveCourier, updateCourier: changeCourier, addShippingMethod: saveMethod, updateShippingMethod: changeMethod,
  };
}
