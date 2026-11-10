/**
 * Traducción entre el stock, el kardex, los ajustes, los envíos, las transferencias, las incidencias de recepción, los couriers y los métodos de
 * envío del sistema y las filas de la base (tablas `stock`, `kardex`, `ajustes`, `envios`, `transferencias`, `incidencias_recepcion`, `couriers` y
 * `metodos_envio`), y de los errores de la base a mensajes claros. Funciones puras.
 *
 * Lo derivable no se guarda: el kardex y los ajustes guardan los ids del artículo y del lugar; el nombre de cada uno sale de sus listas con
 * `kardexView` y `adjustmentView` (así un cambio de nombre se ve en todo el historial).
 */
import type {
  Adjustment, Courier, KardexEntry, ReceptionIncident, Shipment, ShipmentBox, ShippingMethod, StockItem, Transfer, TransferBox,
} from '../context/DataContext';
import { dbErrorMessage, type DbErrorLike } from './orgDirectory';

type Estado = 'Activo' | 'Inactivo';

export interface StockRow { id: string; articulo_id: string; ubicacion_id: string; cantidad: number; minimo: number }
export interface KardexRow {
  id: string; fecha: string; articulo_id: string; ubicacion_id: string; tipo: KardexEntry['type']; cantidad: number; saldo_anterior: number; saldo_nuevo: number;
  usuario: string; documento: string; observacion: string | null;
}
export interface AjusteRow {
  id: string; fecha: string; articulo_id: string; ubicacion_id: string; tipo: Adjustment['type']; cantidad: number; motivo: string; observacion: string | null; usuario: string;
}
interface LineaRow { articulo_id: string; cantidad: number; observacion?: string | null }
interface CajaRow { id: string; numero: string; observacion?: string | null; items: { articulo_id: string; cantidad: number }[] }
export interface EnvioRow {
  id: string; fecha: string; almacen_origen_id: string; sede_destino_id: string; estado: Shipment['status']; cajas: CajaRow[]; lineas: LineaRow[];
  metodo_envio_id: string | null; courier_id: string | null; numero_guia: string | null; referencia_adicional: string | null; viajero_nombre: string | null;
  viajero_documento: string | null; observacion_envio: string | null; eta: string | null; eta_hora: string | null; borrador_vence: string | null;
  observacion: string | null; adjuntos: string[] | null; recepcion_observacion: string | null; recepcion_fecha: string | null; recibido_por: string | null;
  habilitar_recepcion_manual: boolean;
}
export interface TransferenciaRow {
  id: string; fecha: string; origen_id: string; destino_id: string; estado: Transfer['status']; lineas: LineaRow[]; cajas: CajaRow[]; motivo: string;
  solicitada_por: string | null; solicitada_por_id: string | null; metodo_envio_id: string | null; courier_id: string | null; numero_guia: string | null;
  referencia_adicional: string | null; viajero_nombre: string | null; viajero_documento: string | null; observacion_envio: string | null;
  observacion_interna_logistica: string | null; eta: string | null; observacion: string | null; adjuntos: string[] | null; recepcion_observacion: string | null;
  recepcion_fecha: string | null; recibido_por: string | null; habilitar_recepcion_manual: boolean;
}
export interface IncidenciaRow {
  id: string; fecha: string; doc_tipo: 'Envío' | 'Transferencia'; doc_id: string; articulo_id: string; tipo: ReceptionIncident['type']; cantidad: number;
  observacion: string; ubicacion_id: string;
}
export interface CourierRow { id: string; codigo: string; nombre: string; direccion: string; referencia: string; telefono: string; estado: Estado; observaciones: string }
export interface MetodoEnvioRow { id: string; nombre: string; estado: Estado; observaciones: string }

const opt = <T>(v: T | null | undefined): T | undefined => (v === null || v === undefined || (v as unknown) === '' ? undefined : v);

// ------------------------------------------------------------------------------------------------------------------ Stock, kardex y ajustes

export const stockFromRow = (r: StockRow): StockItem => ({ id: r.id, itemId: r.articulo_id, branchId: r.ubicacion_id, stock: r.cantidad, minStock: r.minimo });

/** Fecha y hora del kardex y de los ajustes como las muestran las pantallas: «AAAA-MM-DD HH:mm», en la hora de quien mira. */
export function localStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Un movimiento del kardex tal como se guarda (con ids): los nombres se agregan al mostrarlo (`kardexView`). */
export interface KardexLine {
  id: string; at: string; locationId: string; itemId: string; type: KardexEntry['type']; qty: number; prevBalance: number; newBalance: number;
  user: string; doc: string; observation?: string;
}
export const kardexFromRow = (r: KardexRow): KardexLine => ({
  id: r.id, at: r.fecha, locationId: r.ubicacion_id, itemId: r.articulo_id, type: r.tipo, qty: r.cantidad, prevBalance: r.saldo_anterior, newBalance: r.saldo_nuevo,
  user: r.usuario, doc: r.documento, observation: opt(r.observacion),
});

/** Un ajuste tal como se guarda (con ids). */
export interface AdjustmentLine {
  id: string; at: string; locationId: string; itemId: string; type: Adjustment['type']; qty: number; reason: string; observation?: string; user: string;
}
export const adjustmentFromRow = (r: AjusteRow): AdjustmentLine => ({
  id: r.id, at: r.fecha, locationId: r.ubicacion_id, itemId: r.articulo_id, type: r.tipo, qty: r.cantidad, reason: r.motivo, observation: opt(r.observacion), user: r.usuario,
});

export interface Namer { locationName: (id: string) => string; itemName: (id: string) => string }

/** El kardex con los nombres del lugar y del artículo (más reciente primero). */
export const kardexView = (lines: KardexLine[], names: Namer): KardexEntry[] => lines.map(l => ({
  id: l.id, date: localStamp(l.at), branch: names.locationName(l.locationId), material: names.itemName(l.itemId), type: l.type, qty: l.qty, prevBalance: l.prevBalance,
  newBalance: l.newBalance, user: l.user, doc: l.doc, observation: l.observation,
}));

export const adjustmentView = (lines: AdjustmentLine[], names: Namer): Adjustment[] => lines.map(l => ({
  id: l.id, date: localStamp(l.at), branch: names.locationName(l.locationId), material: names.itemName(l.itemId), type: l.type, qty: l.qty, reason: l.reason,
  observation: l.observation, user: l.user,
}));

// ------------------------------------------------------------------------------------------------------------------ Envíos

const linesFromRow = (rows: LineaRow[] | null | undefined) => (rows ?? []).map(l => ({ itemId: l.articulo_id, quantity: l.cantidad, ...(opt(l.observacion) ? { observation: l.observacion as string } : {}) }));
const linesToRow = (lines: { itemId: string; quantity: number; observation?: string }[]): LineaRow[] =>
  lines.map(l => ({ articulo_id: l.itemId, cantidad: l.quantity, ...(l.observation ? { observacion: l.observation } : {}) }));
const boxesFromRow = (rows: CajaRow[] | null | undefined): ShipmentBox[] => (rows ?? []).map(b => ({
  id: b.id, boxNumber: b.numero, ...(opt(b.observacion) ? { observation: b.observacion as string } : {}), items: (b.items ?? []).map(i => ({ itemId: i.articulo_id, quantity: i.cantidad })),
}));
const boxesToRow = (boxes: (ShipmentBox | TransferBox)[]): CajaRow[] => boxes.map(b => ({
  id: b.id, numero: b.boxNumber, ...(b.observation ? { observacion: b.observation } : {}), items: b.items.map(i => ({ articulo_id: i.itemId, cantidad: i.quantity })),
}));

export const shipmentFromRow = (r: EnvioRow): Shipment => ({
  id: r.id, date: r.fecha, originId: r.almacen_origen_id, destinationId: r.sede_destino_id, status: r.estado, boxes: boxesFromRow(r.cajas), items: linesFromRow(r.lineas),
  shippingMethodId: opt(r.metodo_envio_id), courierId: opt(r.courier_id), trackingNumber: opt(r.numero_guia), additionalReference: opt(r.referencia_adicional),
  travelerName: opt(r.viajero_nombre), travelerDocument: opt(r.viajero_documento), shippingObservation: opt(r.observacion_envio), eta: opt(r.eta), etaTime: opt(r.eta_hora),
  draftExpiry: opt(r.borrador_vence), observation: opt(r.observacion), attachments: r.adjuntos && r.adjuntos.length > 0 ? r.adjuntos : undefined,
  receptionObservation: opt(r.recepcion_observacion), receptionDate: opt(r.recepcion_fecha), receivedBy: opt(r.recibido_por), manualEnable: r.habilitar_recepcion_manual || undefined,
});

/**
 * Lo que se manda a la base de un envío: solo los campos que vienen (al editar, lo que no viene no se toca; un campo que viene vacío se limpia).
 * Las cajas y el detalle viajan con ids de artículo; el nombre no se guarda.
 */
export function shipmentPayload(s: Partial<Omit<Shipment, 'id'>>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const set = (key: keyof Shipment, column: string, value: unknown) => { if (key in s) out[column] = value === undefined ? null : value; };
  set('date', 'fecha', s.date);
  set('originId', 'almacen_origen_id', s.originId);
  set('destinationId', 'sede_destino_id', s.destinationId);
  set('status', 'estado', s.status);
  if ('boxes' in s) out.cajas = boxesToRow(s.boxes ?? []);
  if ('items' in s) out.lineas = linesToRow(s.items ?? []);
  set('shippingMethodId', 'metodo_envio_id', s.shippingMethodId);
  set('courierId', 'courier_id', s.courierId);
  set('trackingNumber', 'numero_guia', s.trackingNumber);
  set('additionalReference', 'referencia_adicional', s.additionalReference);
  set('travelerName', 'viajero_nombre', s.travelerName);
  set('travelerDocument', 'viajero_documento', s.travelerDocument);
  set('shippingObservation', 'observacion_envio', s.shippingObservation);
  set('eta', 'eta', s.eta);
  set('etaTime', 'eta_hora', s.etaTime);
  set('draftExpiry', 'borrador_vence', s.draftExpiry);
  set('observation', 'observacion', s.observation);
  if ('attachments' in s) out.adjuntos = s.attachments ?? [];
  if ('manualEnable' in s) out.habilitar_recepcion_manual = !!s.manualEnable;
  return out;
}

// ------------------------------------------------------------------------------------------------------------------ Transferencias

export const transferFromRow = (r: TransferenciaRow): Transfer => ({
  id: r.id, date: r.fecha, originId: r.origen_id, destinationId: r.destino_id, status: r.estado, items: linesFromRow(r.lineas),
  boxes: (r.cajas ?? []).length > 0 ? boxesFromRow(r.cajas) : undefined, reason: r.motivo, requestedBy: opt(r.solicitada_por), requestedById: opt(r.solicitada_por_id),
  shippingMethodId: opt(r.metodo_envio_id), courierId: opt(r.courier_id), trackingNumber: opt(r.numero_guia), additionalReference: opt(r.referencia_adicional),
  travelerName: opt(r.viajero_nombre), travelerDocument: opt(r.viajero_documento), shippingObservation: opt(r.observacion_envio),
  internalLogisticsObservation: opt(r.observacion_interna_logistica), eta: opt(r.eta), observation: opt(r.observacion),
  attachments: r.adjuntos && r.adjuntos.length > 0 ? r.adjuntos : undefined, receptionObservation: opt(r.recepcion_observacion), receptionDate: opt(r.recepcion_fecha),
  receivedBy: opt(r.recibido_por), manualEnable: r.habilitar_recepcion_manual || undefined,
});

/** Lo que se manda a la base de una transferencia (solo los campos que vienen; ver `shipmentPayload`). */
export function transferPayload(t: Partial<Omit<Transfer, 'id'>>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const set = (key: keyof Transfer, column: string, value: unknown) => { if (key in t) out[column] = value === undefined ? null : value; };
  set('date', 'fecha', t.date);
  set('originId', 'origen_id', t.originId);
  set('destinationId', 'destino_id', t.destinationId);
  set('status', 'estado', t.status);
  if ('items' in t) out.lineas = linesToRow(t.items ?? []);
  if ('boxes' in t) out.cajas = boxesToRow(t.boxes ?? []);
  set('reason', 'motivo', t.reason);
  set('observation', 'observacion', t.observation);
  set('shippingMethodId', 'metodo_envio_id', t.shippingMethodId);
  set('courierId', 'courier_id', t.courierId);
  set('trackingNumber', 'numero_guia', t.trackingNumber);
  set('additionalReference', 'referencia_adicional', t.additionalReference);
  set('travelerName', 'viajero_nombre', t.travelerName);
  set('travelerDocument', 'viajero_documento', t.travelerDocument);
  set('shippingObservation', 'observacion_envio', t.shippingObservation);
  set('internalLogisticsObservation', 'observacion_interna_logistica', t.internalLogisticsObservation);
  set('eta', 'eta', t.eta);
  if ('attachments' in t) out.adjuntos = t.attachments ?? [];
  if ('manualEnable' in t) out.habilitar_recepcion_manual = !!t.manualEnable;
  return out;
}

// ------------------------------------------------------------------------------------------------------------------ Incidencias, couriers y métodos

export const incidentFromRow = (r: IncidenciaRow): ReceptionIncident => ({
  id: r.id, docId: r.doc_id, docType: r.doc_tipo, itemId: r.articulo_id, type: r.tipo, quantity: r.cantidad, observation: r.observacion ?? '', date: r.fecha, branchId: r.ubicacion_id,
});

export const courierFromRow = (r: CourierRow): Courier => ({
  id: r.id, code: r.codigo, name: r.nombre, address: r.direccion ?? '', reference: r.referencia ?? '', phone: r.telefono ?? '', status: r.estado, observations: r.observaciones ?? '',
});
export const courierToRow = (c: Courier): CourierRow => ({
  id: c.id, codigo: c.code.trim(), nombre: c.name.trim(), direccion: c.address ?? '', referencia: c.reference ?? '', telefono: c.phone ?? '', estado: c.status, observaciones: c.observations ?? '',
});
export const methodFromRow = (r: MetodoEnvioRow): ShippingMethod => ({ id: r.id, name: r.nombre, status: r.estado, observations: r.observaciones ?? '' });
export const methodToRow = (m: ShippingMethod): MetodoEnvioRow => ({ id: m.id, nombre: m.name.trim(), estado: m.status, observaciones: m.observations ?? '' });

// ------------------------------------------------------------------------------------------------------------------ Errores

/** ¿El id generado ya existía (dos personas crearon a la vez)? Se reintenta con el siguiente. */
export const isTransportIdConflict = (e: DbErrorLike | null | undefined): boolean =>
  !!e && e.code === '23505' && /(couriers|metodos_envio)_pkey/.test(`${e.message ?? ''} ${e.details ?? ''}`.toLowerCase());

/** Mensaje claro para un error de la base en Logística. Los avisos de las funciones propias (código EN001) ya vienen en español. */
export function stockErrorMessage(e: DbErrorLike | null | undefined): string {
  if (!e) return 'No se pudo guardar. Intente de nuevo.';
  const t = `${e.message ?? ''} ${e.details ?? ''}`.toLowerCase();
  if (e.code === '23505' && t.includes('couriers_codigo_unico')) return 'Ya existe un courier con ese código.';
  if (e.code === '23503') return 'Algo de lo elegido ya no existe (un artículo, una sede o un método de envío). Actualice la pantalla e intente de nuevo.';
  if (e.code === '40P01') return 'Otra persona estaba moviendo el mismo stock en ese instante. Intente de nuevo.';
  if (e.code === '23514' && t.includes('cantidad')) return 'La cantidad no es válida o dejaría el stock en negativo.';
  return dbErrorMessage(e);
}
