/**
 * El tablero de envíos de Logística (funciones puras): las columnas, en qué columna cae cada envío, qué tarjeta se puede mover a dónde y qué datos le faltan.
 *
 *   Por armar → Empacando → Por despachar → En tránsito → Recibido
 *
 * Reglas del movimiento (la base las repite al guardar, migración 0029):
 *  - Hacia adelante se avanza **de a una columna** y solo con los datos de la columna de la que sale: la lista de artículos (Por armar), las cajas (Empacando)
 *    y el transporte con la fecha y hora de llegada (Por despachar).
 *  - Hacia atrás se vuelve **libremente hasta «Por despachar»**: el stock todavía no salió. Si falta un artículo, la tarjeta vuelve a «Por armar».
 *  - Pasar a «En tránsito» es despachar: el stock sale del almacén y **ya no hay marcha atrás** (solo se cancela, con motivo, y lo que salió vuelve).
 *  - «Recibido» no se arrastra: lo mueve la sede al confirmar la recepción. «Listo para recepción» es una etiqueta dentro de «En tránsito».
 */
import type { Shipment } from '../context/DataContext';
import { isPreDispatch, PRE_DISPATCH_STATUSES, shipmentContentError, shipmentStageMissing, type PreDispatchStatus, type TransportCatalog } from './logisticsDocs';

export const BOARD_COLUMNS = [
  { id: 'Por armar', title: 'Por armar', hint: 'Qué se envía y a dónde' },
  { id: 'Empacando', title: 'Empacando', hint: 'Repartir en cajas e imprimir la lista' },
  { id: 'Por despachar', title: 'Por despachar', hint: 'Transporte y fecha de llegada' },
  { id: 'En tránsito', title: 'En tránsito', hint: 'Ya salió del almacén' },
  { id: 'Recibido', title: 'Recibido', hint: 'La sede ya lo recibió' },
] as const;

export type BoardColumnId = typeof BOARD_COLUMNS[number]['id'];
const COLUMN_ORDER: BoardColumnId[] = BOARD_COLUMNS.map(c => c.id);

/** La columna donde se ve un envío (un envío cancelado no está en el tablero). */
export function columnOf(status: Shipment['status']): BoardColumnId | null {
  if (status === 'Cancelado') return null;
  if (status === 'Listo para recepción') return 'En tránsito';
  if (status === 'Recibido con diferencias') return 'Recibido';
  return status;
}

/** Cuántos envíos recibidos se muestran en la última columna (los demás se ven en la vista de tarjetas). */
export const BOARD_RECEIVED_LIMIT = 12;

/** Los envíos repartidos por columna: lo que se prepara, del más antiguo al más nuevo; lo que viaja, por fecha de llegada; lo recibido, lo más reciente primero. */
export function groupByColumn(shipments: Shipment[], receivedLimit = BOARD_RECEIVED_LIMIT): Record<BoardColumnId, Shipment[]> {
  const out: Record<BoardColumnId, Shipment[]> = { 'Por armar': [], Empacando: [], 'Por despachar': [], 'En tránsito': [], Recibido: [] };
  for (const s of shipments) {
    const col = columnOf(s.status);
    if (col) out[col].push(s);
  }
  const byDate = (a: Shipment, b: Shipment) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id);
  for (const col of PRE_DISPATCH_STATUSES) out[col].sort(byDate);
  out['En tránsito'].sort((a, b) => (a.eta ?? '9999').localeCompare(b.eta ?? '9999') || (a.etaTime ?? '').localeCompare(b.etaTime ?? '') || byDate(a, b));
  out.Recibido.sort((a, b) => byDate(b, a));
  out.Recibido = out.Recibido.slice(0, receivedLimit);
  return out;
}

/** Lo que falta en la columna donde está la tarjeta (la marca de «datos pendientes»; se calcula, no se guarda). */
export function cardPending(s: Shipment, cat: TransportCatalog): string[] {
  return isPreDispatch(s.status) ? shipmentStageMissing(s, s.status, cat) : [];
}

export interface BoardMove {
  /** ¿Se puede soltar la tarjeta en esa columna? */
  ok: boolean;
  /** El estado al que pasa. */
  to?: Shipment['status'];
  /** Por qué no (o lo primero que falta). */
  error?: string;
  /** Todo lo que falta, para mostrar la lista completa. */
  missing?: string[];
  /** Pasar a «En tránsito» pide una confirmación: ya no hay marcha atrás. */
  confirm?: 'dispatch';
}

/** ¿Qué pasa si se suelta esta tarjeta en esta columna? (`null`: se soltó donde ya estaba). */
export function boardMove(s: Shipment, target: BoardColumnId, cat: TransportCatalog): BoardMove | null {
  const from = columnOf(s.status);
  if (!from) return { ok: false, error: 'Un envío cancelado ya no se mueve.' };
  if (from === target) return null;
  if (from === 'Recibido') return { ok: false, error: 'Un envío recibido ya está cerrado.' };
  if (target === 'Recibido') return { ok: false, error: 'La sede lo pasa a «Recibido» cuando confirma la recepción.' };
  if (from === 'En tránsito') {
    return { ok: false, error: 'Un envío en tránsito no vuelve atrás: si hay un problema, cancélelo con su motivo (lo que salió vuelve al almacén) y prepare otro.' };
  }
  const fromIndex = COLUMN_ORDER.indexOf(from);
  const toIndex = COLUMN_ORDER.indexOf(target);
  if (toIndex < fromIndex) return { ok: true, to: target as PreDispatchStatus };
  if (toIndex > fromIndex + 1) return { ok: false, error: `Avance de a una columna: pase la tarjeta a «${COLUMN_ORDER[fromIndex + 1]}» primero.` };
  // Un paso adelante: la columna de la que sale debe estar completa
  const missing = shipmentStageMissing(s, from as PreDispatchStatus, cat);
  if (missing.length > 0) return { ok: false, error: missing[0], missing };
  if (target === 'En tránsito') {
    const all = shipmentContentError(s, cat);
    if (all) return { ok: false, error: all, missing: [all] };
    return { ok: true, to: 'En tránsito', confirm: 'dispatch' };
  }
  return { ok: true, to: target as PreDispatchStatus };
}

/** Cuántas cajas y unidades lleva un envío (para la tarjeta). */
export const shipmentTotals = (s: Pick<Shipment, 'boxes' | 'items'>): { boxes: number; lines: number; units: number } => ({
  boxes: s.boxes.length, lines: s.items.length, units: s.items.reduce((n, i) => n + i.quantity, 0),
});
