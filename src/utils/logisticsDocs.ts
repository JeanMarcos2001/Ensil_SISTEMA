/**
 * Reglas de los envíos, las transferencias y las recepciones (funciones puras, sin estado). La base de datos las vuelve a comprobar
 * (migración 0013); aquí están para que la pantalla avise antes de guardar y para verificarlas sin conexión.
 *
 *  - Un envío sale del almacén central hacia una sede: Borrador → En tránsito → (Listo para recepción) → Recibido (con o sin diferencias); se puede
 *    cancelar mientras no se haya recibido (si ya salió, lo despachado vuelve al origen).
 *  - Una transferencia es una solicitud con aprobación: Borrador → Solicitada → Aprobada → En tránsito → (Listo para recepción) → Recibida (con o sin
 *    diferencias); también Rechazada y Cancelada. Solo se despacha lo aprobado.
 *  - El stock sale del origen UNA sola vez, al despachar; el destino suma al recibir. Una recepción solo se confirma sobre un documento en tránsito.
 *  - Las cantidades de las cajas son el detalle del envío o de la transferencia (`flattenBoxes`).
 */
import type { Courier, Shipment, ShipmentBox, ShippingMethod, Transfer, TransferBox } from '../context/DataContext';

export type ShipmentStatus = Shipment['status'];
export type TransferStatus = Transfer['status'];

/** Los estados desde los que se puede pasar a otro (los terminales no tienen salida). La recepción es una operación aparte. */
export const SHIPMENT_FLOW: Record<ShipmentStatus, ShipmentStatus[]> = {
  Borrador: ['En tránsito', 'Cancelado'],
  'En tránsito': ['Listo para recepción', 'Cancelado'],
  'Listo para recepción': ['Cancelado'],
  Recibido: [],
  'Recibido con diferencias': [],
  Cancelado: [],
};

export const TRANSFER_FLOW: Partial<Record<TransferStatus, TransferStatus[]>> = {
  Borrador: ['Solicitada', 'Cancelada'],
  Solicitada: ['Aprobada', 'Rechazada', 'Cancelada'],
  Aprobada: ['En tránsito', 'Rechazada', 'Cancelada'],
  'En tránsito': ['Listo para recepción', 'Cancelada'],
  'Listo para recepción': ['Cancelada'],
};

/** Un documento «en tránsito»: ya salió del origen y todavía no se recibió. */
export const isInTransit = (status: string): boolean => status === 'En tránsito' || status === 'Listo para recepción';

export function shipmentTransitionError(from: ShipmentStatus, to: ShipmentStatus): string | null {
  return from !== to && SHIPMENT_FLOW[from]?.includes(to) ? null : `Un envío «${from}» no puede pasar a «${to}».`;
}

export function transferTransitionError(from: TransferStatus, to: TransferStatus): string | null {
  return from !== to && TRANSFER_FLOW[from]?.includes(to) ? null : `Una transferencia «${from}» no puede pasar a «${to}».`;
}

/** ¿Este cambio de estado mueve stock del origen? Despachar lo descuenta; cancelar algo ya despachado lo devuelve. */
export const shipmentMovesStock = (from: ShipmentStatus, to: ShipmentStatus): boolean =>
  (from === 'Borrador' && to === 'En tránsito') || (isInTransit(from) && to === 'Cancelado');
export const transferMovesStock = (from: TransferStatus, to: TransferStatus): boolean =>
  (from === 'Aprobada' && to === 'En tránsito') || (isInTransit(from) && to === 'Cancelada');

// ------------------------------------------------------------------------------------------------------------------ Detalle y cajas

export interface Line { itemId: string; quantity: number }

/** La suma por artículo de lo que llevan las cajas (en el orden en que aparecen). */
export function flattenBoxes(boxes: { items: Line[] }[]): Line[] {
  const out: Line[] = [];
  for (const box of boxes) {
    for (const item of box.items) {
      const found = out.find(l => l.itemId === item.itemId);
      if (found) found.quantity += item.quantity; else out.push({ itemId: item.itemId, quantity: item.quantity });
    }
  }
  return out;
}

/**
 * Comprueba el detalle y, si hay, las cajas: al menos un artículo, cada uno elegido, sin repetir y con una cantidad entera mayor a 0; cada caja con
 * al menos un artículo; y la suma de las cajas igual al detalle.
 */
export function detailError(lines: Line[], boxes: { boxNumber?: string; items: Line[] }[] = [], knownItemIds?: string[]): string | null {
  if (lines.length === 0) return 'Debe agregar al menos un artículo.';
  const seen = new Set<string>();
  for (const l of lines) {
    if (!l.itemId) return 'Hay un artículo sin seleccionar.';
    if (!Number.isInteger(l.quantity) || l.quantity < 1) return 'La cantidad debe ser un número entero mayor a 0.';
    if (seen.has(l.itemId)) return 'Hay artículos repetidos en el detalle.';
    seen.add(l.itemId);
    if (knownItemIds && !knownItemIds.includes(l.itemId)) return 'Un artículo no existe en el catálogo.';
  }
  for (let i = 0; i < boxes.length; i++) {
    const box = boxes[i];
    const label = box.boxNumber || String(i + 1);
    if (box.items.length === 0) return `La caja ${label} no puede estar vacía.`;
    for (const it of box.items) {
      if (!it.itemId) return `Hay un artículo sin seleccionar en la caja ${label}.`;
      if (!Number.isInteger(it.quantity) || it.quantity < 1) return `La cantidad debe ser mayor a 0 en la caja ${label}.`;
    }
  }
  if (boxes.length > 0) {
    const flat = flattenBoxes(boxes);
    const same = flat.length === lines.length && flat.every(f => lines.find(l => l.itemId === f.itemId)?.quantity === f.quantity);
    if (!same) return 'Las cantidades de las cajas no coinciden con el detalle.';
  }
  return null;
}

// ------------------------------------------------------------------------------------------------------------------ Transporte

const methodKind = (method: Pick<ShippingMethod, 'name'> | undefined): 'courier' | 'viajero' | 'otro' | null => {
  if (!method) return null;
  const name = method.name.toLowerCase();
  return name.includes('courier') ? 'courier' : name.includes('viajero') ? 'viajero' : 'otro';
};

/**
 * El transporte según el método de envío: «Courier» pide courier y número de guía; «Viajero», quién lleva la carga; otro método puede pedir una
 * observación (los envíos la piden; el despacho de una transferencia, no).
 */
export function transportError(
  method: Pick<ShippingMethod, 'name'> | undefined,
  d: { courierId?: string; trackingNumber?: string; travelerName?: string; shippingObservation?: string },
  requireObservation: boolean,
): string | null {
  const kind = methodKind(method);
  if (!kind) return 'Elija el método de envío.';
  if (kind === 'courier' && (!d.courierId || !d.trackingNumber?.trim())) return 'Para envíos por Courier, debe seleccionar el Courier y el número de guía.';
  if (kind === 'viajero' && !d.travelerName?.trim()) return 'Para envíos por Viajero, debe ingresar el nombre de la persona que transporta.';
  if (kind === 'otro' && requireObservation && !d.shippingObservation?.trim()) return 'Debe ingresar una observación para el método de envío seleccionado.';
  return null;
}

// ------------------------------------------------------------------------------------------------------------------ Contenido de un envío y de una transferencia

export interface TransportCatalog { methods: Pick<ShippingMethod, 'id' | 'name'>[]; couriers?: Pick<Courier, 'id'>[]; itemIds?: string[] }

/** Lo que el formulario de un envío exige antes de guardarlo (borrador o para despachar). La ruta se comprueba aparte (`shipmentRouteError`). */
export function shipmentContentError(s: Pick<Shipment, 'eta' | 'etaTime' | 'shippingMethodId' | 'courierId' | 'trackingNumber' | 'travelerName' | 'shippingObservation' | 'items' | 'boxes'>, cat: TransportCatalog): string | null {
  if (!s.eta || !s.etaTime || !s.shippingMethodId) return 'Por favor complete los campos obligatorios (*) en Datos Generales y Método de Envío.';
  const method = cat.methods.find(m => m.id === s.shippingMethodId);
  const transport = transportError(method, s, true);
  if (transport) return transport;
  const detail = detailError(s.items, s.boxes, cat.itemIds);
  if (detail) return detail;
  if (s.boxes.length === 0) return 'Debe agregar al menos una caja con sus artículos.';
  return null;
}

/** Lo que exige la solicitud de una transferencia: motivo y detalle (la ruta se comprueba aparte con `transferRouteError`). */
export function transferRequestError(t: Pick<Transfer, 'reason' | 'items'>, itemIds?: string[]): string | null {
  if (!t.reason?.trim()) return 'Por favor complete los campos obligatorios (*) y agregue al menos un artículo.';
  return detailError(t.items, [], itemIds);
}

/** Lo que exige despachar una transferencia aprobada: método de envío, ETA, transporte y cajas coherentes con el detalle. */
export function transferDispatchError(
  t: Pick<Transfer, 'eta' | 'shippingMethodId' | 'courierId' | 'trackingNumber' | 'travelerName' | 'shippingObservation' | 'items' | 'boxes'>, cat: TransportCatalog,
): string | null {
  if (!t.shippingMethodId || !t.eta) return 'Por favor complete el método de envío y el ETA.';
  const transport = transportError(cat.methods.find(m => m.id === t.shippingMethodId), t, false);
  if (transport) return transport;
  return detailError(t.items, (t.boxes ?? []) as (ShipmentBox | TransferBox)[], cat.itemIds);
}

// ------------------------------------------------------------------------------------------------------------------ Recepción

export type ReceivedStatus = 'ok' | 'missing' | 'damaged' | 'extra';
export interface ReceivedLine { itemId: string; quantity: number; status: ReceivedStatus; observation?: string }
export type DocKind = 'Envío' | 'Transferencia';

export interface ReceptionOutcome {
  hasDifferences: boolean;
  finalStatus: 'Recibido' | 'Recibido con diferencias' | 'Recibida' | 'Recibida con diferencias';
  /** Una incidencia por cada línea que no llegó bien: lo que faltó, llegó dañado o llegó de más. */
  incidents: { itemId: string; type: Exclude<ReceivedStatus, 'ok'>; quantity: number; observation: string }[];
  /** Lo que suma al stock del destino (todo lo recibido, aunque venga con una incidencia). */
  stockIn: Line[];
}

/** Qué resulta de recibir un documento: si hubo diferencias, en qué estado queda, qué incidencias se anotan y qué suma al stock. */
export function receptionOutcome(kind: DocKind, expected: Line[], received: ReceivedLine[]): ReceptionOutcome {
  const expectedOf = (itemId: string) => expected.find(l => l.itemId === itemId)?.quantity ?? 0;
  const hasDifferences = received.some(r => r.status !== 'ok' || r.quantity !== expectedOf(r.itemId));
  return {
    hasDifferences,
    finalStatus: kind === 'Envío' ? (hasDifferences ? 'Recibido con diferencias' : 'Recibido') : (hasDifferences ? 'Recibida con diferencias' : 'Recibida'),
    incidents: received.filter(r => r.status !== 'ok').map(r => ({
      itemId: r.itemId, type: r.status as Exclude<ReceivedStatus, 'ok'>, observation: r.observation ?? '',
      quantity: r.status === 'missing' ? Math.max(expectedOf(r.itemId) - r.quantity, 0) : r.quantity,
    })),
    stockIn: received.filter(r => r.quantity > 0).map(r => ({ itemId: r.itemId, quantity: r.quantity })),
  };
}

/** ¿Se puede confirmar esta recepción? El documento debe estar en tránsito (no se recibe dos veces) y cada línea traer una cantidad entera de 0 en adelante. */
export function receptionError(docStatus: string, received: ReceivedLine[], knownItemIds?: string[]): string | null {
  if (!isInTransit(docStatus)) return `El documento está «${docStatus}»: solo se recibe lo que está en tránsito.`;
  if (received.length === 0) return 'Indique lo que se recibió.';
  const seen = new Set<string>();
  for (const r of received) {
    if (!r.itemId || !Number.isInteger(r.quantity) || r.quantity < 0) return 'Cada artículo recibido necesita su cantidad (un entero de 0 en adelante).';
    if (seen.has(r.itemId)) return 'Hay artículos repetidos en la recepción.';
    seen.add(r.itemId);
    if (knownItemIds && !knownItemIds.includes(r.itemId)) return 'Un artículo recibido no existe en el catálogo.';
  }
  return null;
}

// ------------------------------------------------------------------------------------------------------------------ Couriers y métodos de envío

export function courierError(c: Pick<Courier, 'code' | 'name'>, others: Pick<Courier, 'id' | 'code'>[], selfId?: string): string | null {
  if (!c.code?.trim() || !c.name?.trim()) return 'El código y nombre son obligatorios.';
  if (others.some(o => o.id !== selfId && o.code.trim().toLowerCase() === c.code.trim().toLowerCase())) return 'Ya existe un courier con ese código.';
  return null;
}

export const methodError = (m: Pick<ShippingMethod, 'name'>): string | null => (m.name?.trim() ? null : 'El nombre del método es obligatorio.');
