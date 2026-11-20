/**
 * Reglas de los envíos, las transferencias y las recepciones (funciones puras, sin estado). La base de datos las vuelve a comprobar
 * (migración 0013); aquí están para que la pantalla avise antes de guardar y para verificarlas sin conexión.
 *
 *  - Un envío sale del almacén central hacia una sede y avanza por las columnas del tablero de Logística:
 *    Por armar → Empacando → Por despachar → En tránsito → (Listo para recepción) → Recibido (con o sin diferencias). Cada columna tiene sus datos
 *    (la lista de artículos, las cajas, el transporte y la fecha de llegada) y no se avanza sin ellos; hacia atrás se vuelve libremente hasta
 *    «Por despachar» (el stock todavía no salió). Se puede cancelar mientras no se haya recibido (si ya salió, lo despachado vuelve al origen).
 *  - Una transferencia es una solicitud con aprobación: Borrador → Solicitada → Aprobada → En tránsito → (Listo para recepción) → Recibida (con o sin
 *    diferencias); también Rechazada y Cancelada. Solo se despacha lo aprobado.
 *  - El stock sale del origen UNA sola vez, al despachar; el destino suma al recibir. Una recepción solo se confirma sobre un documento en tránsito
 *    y **solo desde la fecha (y hora) estimada de llegada**, salvo que Logística la habilite antes (`receptionWindow`).
 *  - Las cantidades de las cajas son el detalle del envío o de la transferencia (`flattenBoxes`).
 */
import type { Courier, Shipment, ShipmentBox, ShippingMethod, Transfer, TransferBox } from '../context/DataContext';

export type ShipmentStatus = Shipment['status'];
export type TransferStatus = Transfer['status'];

/** Los estados desde los que se puede pasar a otro (los terminales no tienen salida). La recepción es una operación aparte. */
export const SHIPMENT_FLOW: Record<ShipmentStatus, ShipmentStatus[]> = {
  'Por armar': ['Empacando', 'Cancelado'],
  Empacando: ['Por despachar', 'Por armar', 'Cancelado'],
  'Por despachar': ['En tránsito', 'Empacando', 'Por armar', 'Cancelado'],
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
  (from === 'Por despachar' && to === 'En tránsito') || (isInTransit(from) && to === 'Cancelado');

/** Los estados de un envío que todavía no salió del almacén: el stock no se ha movido y la tarjeta puede cambiar y volver atrás. */
export const PRE_DISPATCH_STATUSES = ['Por armar', 'Empacando', 'Por despachar'] as const;
export type PreDispatchStatus = typeof PRE_DISPATCH_STATUSES[number];
export const isPreDispatch = (status: string): status is PreDispatchStatus => (PRE_DISPATCH_STATUSES as readonly string[]).includes(status);
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

// ------------------------------------------------------------------------------------------------------------------ Datos de cada columna del tablero

type StageShipment = Pick<Shipment, 'destinationId' | 'eta' | 'etaTime' | 'shippingMethodId' | 'courierId' | 'trackingNumber' | 'travelerName' | 'shippingObservation' | 'items' | 'boxes'>;

/** Lo que todavía no se repartió en cajas, por artículo (solo los que tienen unidades sin caja). */
export function boxesRemaining(lines: Line[], boxes: { items: Line[] }[]): Line[] {
  const packed = flattenBoxes(boxes);
  return lines
    .map(l => ({ itemId: l.itemId, quantity: l.quantity - (packed.find(p => p.itemId === l.itemId)?.quantity ?? 0) }))
    .filter(l => l.quantity > 0);
}

/**
 * Mientras se arman las cajas (avance que se guarda a medias): cada caja con sus artículos, cada artículo de la lista y nunca más unidades en las cajas
 * que en la lista. Que las cajas sumen justo la lista se exige recién al pasar a «Por despachar» (`shipmentStageMissing`).
 */
export function boxesProgressError(lines: Line[], boxes: { boxNumber?: string; items: Line[] }[]): string | null {
  for (let i = 0; i < boxes.length; i++) {
    const box = boxes[i];
    const label = box.boxNumber || String(i + 1);
    if (box.items.length === 0) return `La caja ${label} no puede estar vacía.`;
    for (const it of box.items) {
      if (!it.itemId) return `Hay un artículo sin seleccionar en la caja ${label}.`;
      if (!Number.isInteger(it.quantity) || it.quantity < 1) return `La cantidad debe ser mayor a 0 en la caja ${label}.`;
    }
  }
  for (const p of flattenBoxes(boxes)) {
    const line = lines.find(l => l.itemId === p.itemId);
    if (!line) return 'Hay un artículo en las cajas que no está en la lista del envío.';
    if (p.quantity > line.quantity) return 'Hay más unidades en las cajas que en la lista del envío.';
  }
  return null;
}

/**
 * Lo que falta para SALIR de una columna del tablero (vacío = completa); la base repite estas mismas comprobaciones (migración 0029).
 *  - «Por armar»: la filial de destino y la lista de artículos.
 *  - «Empacando»: todo repartido en cajas (las cajas suman justo la lista).
 *  - «Por despachar»: el método de envío con su transporte y la fecha y hora de llegada.
 * Para una tarjeta que está en esa columna, lo que falta es lo que muestra su marca de «datos pendientes» (se calcula, no se guarda).
 */
export function shipmentStageMissing(s: StageShipment, stage: PreDispatchStatus, cat: TransportCatalog): string[] {
  const missing: string[] = [];
  if (stage === 'Por armar') {
    if (!s.destinationId) missing.push('Indique la filial de destino.');
    const detail = detailError(s.items, [], cat.itemIds);
    if (detail) missing.push(detail);
  } else if (stage === 'Empacando') {
    if (s.boxes.length === 0) missing.push('Debe agregar al menos una caja con sus artículos.');
    else {
      const detail = detailError(s.items, s.boxes, cat.itemIds);
      if (detail) missing.push(detail);
    }
  } else {
    if (!s.eta || !s.etaTime) missing.push('Indique la fecha y la hora de llegada.');
    const transport = transportError(cat.methods.find(m => m.id === s.shippingMethodId), s, true);
    if (transport) missing.push(transport);
  }
  return missing;
}

/** Lo primero que falta para pasar a la columna siguiente (o `null` si ya se puede). */
export const shipmentStageError = (s: StageShipment, stage: PreDispatchStatus, cat: TransportCatalog): string | null => shipmentStageMissing(s, stage, cat)[0] ?? null;

/** Lo que falta para despachar: los datos de las tres columnas. La ruta se comprueba aparte (`shipmentRouteError`). */
export function shipmentContentError(s: StageShipment, cat: TransportCatalog): string | null {
  for (const stage of PRE_DISPATCH_STATUSES) {
    const error = shipmentStageError(s, stage, cat);
    if (error) return error;
  }
  return null;
}

/** Los datos que se pueden cambiar en cada columna (la base lo exige igual): la lista en «Por armar», las cajas en «Empacando» y el transporte en «Por despachar». */
export const SHIPMENT_EDITABLE_FIELDS: Record<PreDispatchStatus, (keyof Shipment)[]> = {
  'Por armar': ['originId', 'destinationId', 'items', 'observation', 'attachments', 'status'],
  Empacando: ['boxes', 'observation', 'attachments', 'status'],
  'Por despachar': ['shippingMethodId', 'courierId', 'trackingNumber', 'additionalReference', 'travelerName', 'travelerDocument', 'shippingObservation', 'eta', 'etaTime', 'observation', 'attachments', 'status'],
};

const FIELD_COLUMN: Partial<Record<keyof Shipment, PreDispatchStatus>> = {
  originId: 'Por armar', destinationId: 'Por armar', items: 'Por armar',
  boxes: 'Empacando',
  shippingMethodId: 'Por despachar', courierId: 'Por despachar', trackingNumber: 'Por despachar', additionalReference: 'Por despachar', travelerName: 'Por despachar',
  travelerDocument: 'Por despachar', shippingObservation: 'Por despachar', eta: 'Por despachar', etaTime: 'Por despachar',
};
const COLUMN_HINT: Record<PreDispatchStatus, string> = {
  'Por armar': 'La lista de artículos y el destino solo se cambian en «Por armar»: devuelva la tarjeta a esa columna.',
  Empacando: 'Las cajas solo se arman en «Empacando»: devuelva la tarjeta a esa columna.',
  'Por despachar': 'El transporte y la fecha de llegada se registran en «Por despachar»: pase la tarjeta a esa columna.',
};

/** ¿Este cambio de datos es de la columna en que está el envío? Un envío ya despachado no se edita (solo se habilita su recepción manual). */
export function shipmentPatchError(status: ShipmentStatus, patch: Partial<Shipment>): string | null {
  // La versión no es un dato del envío: es lo que se vio al abrir la tarjeta (ver `shipmentStaleError`)
  const keys = (Object.keys(patch) as (keyof Shipment)[]).filter(k => k !== 'version');
  if (isPreDispatch(status)) {
    const allowed = SHIPMENT_EDITABLE_FIELDS[status];
    const refused = keys.find(k => !allowed.includes(k));
    return refused ? COLUMN_HINT[FIELD_COLUMN[refused] ?? status] : null;
  }
  if (status === 'En tránsito' || status === 'Listo para recepción') {
    const changesStatus = patch.status !== undefined && patch.status !== status;
    return changesStatus || keys.some(k => k !== 'manualEnable' && k !== 'status') ? 'Un envío despachado ya no se edita: cancélelo y prepare otro.' : null;
  }
  return 'Este envío ya está cerrado.';
}

/**
 * Cada cambio de un envío sube su número de versión (la base lo hace con un disparador, migración 0030). Quien edita una tarjeta manda la versión que vio al abrirla; si
 * alguien la cambió en el medio, no se guarda y se avisa, en vez de pisar el cambio ajeno sin que nadie se entere. La base dice lo mismo con las mismas palabras.
 */
export const SHIPMENT_STALE_MESSAGE = 'Otra persona cambió esta tarjeta mientras usted la tenía abierta: ya se actualizó en pantalla. Revise y vuelva a intentar.';
export const shipmentStaleError = (current: number | undefined, seen: number | undefined): string | null =>
  current !== undefined && seen !== undefined && current !== seen ? SHIPMENT_STALE_MESSAGE : null;

/** Los artículos de la lista que no alcanzan con el stock del origen (avisa; quien decide es Logística y la base lo vuelve a comprobar al despachar). */
export function stockShortages(lines: Line[], stockOf: (itemId: string) => number): { itemId: string; needed: number; available: number }[] {
  return lines.map(l => ({ itemId: l.itemId, needed: l.quantity, available: Math.max(0, stockOf(l.itemId)) })).filter(l => l.needed > l.available);
}

/** Lo que exige la solicitud de una transferencia: motivo y detalle (la ruta se comprueba aparte con `transferRouteError`). */
export function transferRequestError(t: Pick<Transfer, 'reason' | 'items'>, itemIds?: string[]): string | null {
  if (!t.reason?.trim()) return 'Por favor complete los campos obligatorios (*) y agregue al menos un artículo.';
  return detailError(t.items, [], itemIds);
}

/** Lo que exige despachar una transferencia aprobada: método de envío, fecha de llegada, transporte y cajas coherentes con el detalle. */
export function transferDispatchError(
  t: Pick<Transfer, 'eta' | 'shippingMethodId' | 'courierId' | 'trackingNumber' | 'travelerName' | 'shippingObservation' | 'items' | 'boxes'>, cat: TransportCatalog,
): string | null {
  if (!t.shippingMethodId || !t.eta) return 'Por favor complete el método de envío y la fecha de llegada.';
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

// ------------------------------------------------------------------------------------------------------------------ Cuándo se puede recibir

/** Lo que decide si ya se puede recibir un documento en tránsito. */
export interface ReceptionTiming { status: string; eta?: string; etaTime?: string; manualEnable?: boolean }

/** Hoy y la hora (AAAA-MM-DD y HH:MM), en la hora del lugar (Lima). La base usa la hora de Lima. */
export interface ClockParts { date: string; time: string }

export const RECEPTION_NO_ETA = 'Este documento no tiene fecha de llegada: pida a Logística que la registre o que habilite la recepción manual.';
/** El aviso cuando todavía no llega la fecha de llegada. La base dice lo mismo con la fecha puesta en el «%». */
export const receptionTooEarlyMessage = (etaLabel: string): string =>
  `La recepción se habilita desde la fecha de llegada (${etaLabel}). Si llegó antes, pida a Logística que habilite la recepción manual.`;

const dmy = (iso: string): string => iso.split('-').reverse().join('/');
/** La hora en 12 horas: «6 p. m.» en punto; con minutos, «4:10 p. m.». */
export const hm12 = (t: string): string => {
  const [h = 0, m = 0] = t.split(':').map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}${m === 0 ? '' : `:${String(m).padStart(2, '0')}`} ${h >= 12 ? 'p. m.' : 'a. m.'}`;
};
/** La fecha de llegada como se muestra: 19/11/2026 4:10 p. m. (sin hora, solo la fecha). */
export const etaLabel = (eta: string, etaTime?: string): string => (etaTime ? `${dmy(eta)} ${hm12(etaTime)}` : dmy(eta));

/** Las horas de llegada que se pueden elegir al despachar un envío: de 6 a. m. a 10 p. m., en punto (no hay minutos). */
export const ARRIVAL_FIRST_HOUR = 6;
export const ARRIVAL_LAST_HOUR = 22;
export interface HourOption { value: string; label: string }
/**
 * La lista de horas para elegir la hora de llegada: «6 a. m.», «7 a. m.» … «12 p. m.» … «10 p. m.» (el valor es «HH:00»). Si el envío ya trae una hora
 * fuera de la lista (uno anterior a esta regla, por ejemplo 4:10 p. m.), se agrega para no perderla al editarlo.
 */
export function arrivalHourOptions(current?: string): HourOption[] {
  const options: HourOption[] = [];
  for (let h = ARRIVAL_FIRST_HOUR; h <= ARRIVAL_LAST_HOUR; h++) {
    const value = `${String(h).padStart(2, '0')}:00`;
    options.push({ value, label: hm12(value) });
  }
  if (current && !options.some(o => o.value === current)) {
    options.push({ value: current, label: hm12(current) });
    options.sort((a, b) => a.value.localeCompare(b.value));
  }
  return options;
}

export interface ReceptionWindow {
  open: boolean;
  /** Por qué todavía no se puede recibir (solo si `open` es falso). */
  reason?: string;
}

/**
 * ¿Ya se puede recibir este documento? La recepción se habilita **desde la fecha (y la hora) de llegada** (en el código, `eta`); antes de eso el documento solo se ve.
 * Si llegó antes, Logística la habilita a mano (recepción manual) o lo marca «Listo para recepción». Sin fecha de llegada ni habilitación, tampoco se recibe.
 * La base vuelve a comprobarlo al confirmar (`confirmar_recepcion`, migraciones 0027 y 0028).
 */
export function receptionWindow(doc: ReceptionTiming, now: ClockParts): ReceptionWindow {
  if (doc.manualEnable || doc.status === 'Listo para recepción') return { open: true };
  if (!doc.eta) return { open: false, reason: RECEPTION_NO_ETA };
  const reached = doc.etaTime ? doc.eta < now.date || (doc.eta === now.date && doc.etaTime <= now.time) : doc.eta <= now.date;
  return reached ? { open: true } : { open: false, reason: receptionTooEarlyMessage(etaLabel(doc.eta, doc.etaTime)) };
}

/** Hoy y la hora del equipo en que corre el sistema (el del navegador; en Perú es la hora de Lima). */
export function clockNow(d: Date = new Date()): ClockParts {
  const p = (n: number) => String(n).padStart(2, '0');
  return { date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, time: `${p(d.getHours())}:${p(d.getMinutes())}` };
}

// ------------------------------------------------------------------------------------------------------------------ Couriers y métodos de envío

export function courierError(c: Pick<Courier, 'code' | 'name'>, others: Pick<Courier, 'id' | 'code'>[], selfId?: string): string | null {
  if (!c.code?.trim() || !c.name?.trim()) return 'El código y nombre son obligatorios.';
  if (others.some(o => o.id !== selfId && o.code.trim().toLowerCase() === c.code.trim().toLowerCase())) return 'Ya existe un courier con ese código.';
  return null;
}

export const methodError = (m: Pick<ShippingMethod, 'name'>): string | null => (m.name?.trim() ? null : 'El nombre del método es obligatorio.');
