/**
 * Requerimientos de las sedes (funciones puras).
 *
 * Una sede PIDE mercadería al almacén central. El requerimiento NO es el envío: cae como tarjeta en «Por armar» del tablero de Logística, donde se
 * abre «Verificar existencia» (se compara lo pedido con el stock del almacén y con lo ya comprometido en otras tarjetas), Logística **solo reduce** las
 * cantidades (0 = sin stock) o lo **rechaza con motivo**, y al pasarlo a «Empacando» nace el envío. Mientras tanto la sede ve cómo cambia su lista
 * («pidió 30 → se enviará 4») **sin ver la etapa**: solo si sigue en Logística, si se rechazó (con su motivo) o si ya se despachó.
 *
 * Las reglas de validación se repiten en la base con los MISMOS textos (migración 0031): la pantalla avisa antes y la base decide.
 */
import type { Shipment } from '../context/DataContext';
import { PRE_DISPATCH_STATUSES } from './logisticsDocs';

export type RequirementStatus = 'Pendiente' | 'Rechazado' | 'Despachado';

export interface RequirementLine {
  itemId: string;
  /** Lo que pidió la sede (no cambia). */
  quantity: number;
  /** Lo que se enviará: vacío hasta que Logística verifica la existencia; solo puede reducir lo pedido. */
  send?: number;
}

export interface Requirement {
  id: string;
  date: string;
  /** La sede que pide (y a la que se envía). */
  branchId: string;
  /** El almacén al que se pide. */
  warehouseId: string;
  lines: RequirementLine[];
  note?: string;
  status: RequirementStatus;
  rejectionReason?: string;
  /** La primera vez que alguien abrió «Verificar existencia» (apaga el parpadeo de la tarjeta para todos). */
  seenAt?: string;
  seenBy?: string;
  /** La última vez que se guardaron las cantidades que se enviarán. */
  reviewedAt?: string;
  reviewedBy?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  /** Sube en 1 con cada cambio de contenido: quien edita manda la que vio. */
  version: number;
  createdById?: string;
  createdAt?: string;
  createdBy?: string;
}

export interface RequirementMessage {
  /** El número que le da la base (crece con cada mensaje). */
  id: number;
  requirementId: string;
  /** De qué lado escribe: la sede que pidió o Logística. */
  side: 'sede' | 'logistica';
  text: string;
  authorId?: string;
  authorName: string;
  createdAt: string;
}

/** Lo que arma la sede. */
export interface RequirementDraft {
  branchId: string;
  warehouseId: string;
  lines: { itemId: string; quantity: number }[];
  note?: string;
}

export const REQUIREMENT_LIMITS = { maxLines: 60, maxQuantity: 99999, noteMax: 500, messageMax: 800, rejectionMin: 5, rejectionMax: 300 } as const;

/** El mismo texto que da la base cuando otra persona cambió el requerimiento mientras se tenía abierto. */
export const REQUIREMENT_STALE_MESSAGE = 'Otra persona cambió este requerimiento mientras usted lo tenía abierto: ya se actualizó en pantalla. Revise y vuelva a intentar.';

export interface ItemRef { id: string; name: string; status?: string }

const isWhole = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && Number.isInteger(n);

/** Lo que se pide: al menos un artículo (hasta 60), cada uno del catálogo y activo, sin repetir y con cantidad entera de 1 a 99 999. `null` si está bien. */
export function requirementDraftError(draft: RequirementDraft, items: ItemRef[]): string | null {
  if (!draft.branchId) return 'Indique la sede que pide.';
  if (!draft.warehouseId) return 'Los requerimientos se piden al almacén central.';
  if (draft.note && draft.note.trim().length > REQUIREMENT_LIMITS.noteMax) return `La nota no puede pasar de ${REQUIREMENT_LIMITS.noteMax} letras.`;
  if (draft.lines.length === 0) return 'Agregue al menos un artículo al requerimiento.';
  if (draft.lines.length > REQUIREMENT_LIMITS.maxLines) return `Un requerimiento admite hasta ${REQUIREMENT_LIMITS.maxLines} artículos distintos.`;
  const seen = new Set<string>();
  for (const line of draft.lines) {
    if (!line.itemId) return 'Hay un artículo sin seleccionar.';
    if (!isWhole(line.quantity) || line.quantity < 1) return 'La cantidad debe ser un número entero mayor a 0.';
    if (line.quantity > REQUIREMENT_LIMITS.maxQuantity) return 'La cantidad pedida no puede pasar de 99 999 unidades por artículo.';
    if (seen.has(line.itemId)) return 'Hay artículos repetidos en el requerimiento.';
    seen.add(line.itemId);
    const item = items.find(i => i.id === line.itemId);
    if (!item) return 'Un artículo no existe en el catálogo.';
    if (item.status && item.status !== 'Activo') return `El artículo «${item.name}» está inactivo.`;
  }
  return null;
}

/** Las cantidades que Logística quiere enviar: de cada artículo pedido, un entero de 0 a lo pedido (solo se reduce). `null` si está bien. */
export function requirementReviewError(req: Pick<Requirement, 'lines'>, sends: Record<string, number | undefined>, itemName: (id: string) => string): string | null {
  for (const line of req.lines) {
    const name = itemName(line.itemId);
    const value = sends[line.itemId];
    if (value === undefined || value === null) return `Falta indicar cuánto se enviará de «${name}».`;
    if (!isWhole(value) || value < 0) return `La cantidad a enviar de «${name}» debe ser un número entero de 0 o más.`;
    if (value > line.quantity) return `Solo se puede reducir lo pedido: de «${name}» pidieron ${line.quantity} y no se puede enviar más.`;
  }
  return null;
}

/** El motivo del rechazo (la sede lo verá). */
export function requirementRejectionError(reason: string): string | null {
  const text = reason.trim();
  if (text.length < REQUIREMENT_LIMITS.rejectionMin) return 'Indique el motivo del rechazo (al menos 5 letras): la sede lo verá.';
  if (text.length > REQUIREMENT_LIMITS.rejectionMax) return `El motivo del rechazo no puede pasar de ${REQUIREMENT_LIMITS.rejectionMax} letras.`;
  return null;
}

/** Un mensaje anclado: de 1 a 800 letras. */
export function requirementMessageError(text: string): string | null {
  const t = text.trim();
  if (t.length < 1) return 'Escriba el mensaje.';
  if (t.length > REQUIREMENT_LIMITS.messageMax) return `El mensaje no puede pasar de ${REQUIREMENT_LIMITS.messageMax} letras.`;
  return null;
}

// ------------------------------------------------------------------------------------------------------------------------- Tablero

/** El envío que se está armando a partir de este requerimiento (los cancelados no cuentan). */
export const liveShipmentOf = (req: Pick<Requirement, 'id'>, shipments: Pick<Shipment, 'id' | 'requirementId' | 'status'>[]) =>
  shipments.find(s => s.requirementId === req.id && s.status !== 'Cancelado');

/** Las tarjetas de requerimiento de «Por armar»: los pendientes que todavía no tienen envío, del más antiguo al más nuevo. */
export function boardRequirements(requirements: Requirement[], shipments: Pick<Shipment, 'id' | 'requirementId' | 'status'>[]): Requirement[] {
  return requirements
    .filter(r => r.status === 'Pendiente' && !liveShipmentOf(r, shipments))
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

/** ¿Debe parpadear la tarjeta? Mientras nadie haya abierto «Verificar existencia» (es global: al abrirla deja de parpadear para todos). */
export const requirementNeedsAttention = (req: Pick<Requirement, 'status' | 'seenAt'>): boolean => req.status === 'Pendiente' && !req.seenAt;

/** Las cantidades que se enviarán (las que quedaron en 0 no entran al envío). */
export const requirementSentLines = (req: Pick<Requirement, 'lines'>): { itemId: string; quantity: number }[] =>
  req.lines.filter(l => (l.send ?? 0) > 0).map(l => ({ itemId: l.itemId, quantity: l.send as number }));

export interface RequirementTotals { lines: number; requested: number; toSend: number | null }

/** Cuántos artículos y unidades se pidieron y, si ya se verificó, cuántas se enviarán. */
export function requirementTotals(req: Pick<Requirement, 'lines' | 'reviewedAt'>): RequirementTotals {
  const reviewed = !!req.reviewedAt || req.lines.some(l => l.send !== undefined);
  return {
    lines: req.lines.length,
    requested: req.lines.reduce((n, l) => n + l.quantity, 0),
    toSend: reviewed ? req.lines.reduce((n, l) => n + (l.send ?? 0), 0) : null,
  };
}

/** ¿Se puede todavía verificar, rechazar o pasar a «Empacando»? Solo mientras está pendiente y sin envío en preparación (`null` si se puede). */
export function requirementOpenError(req: Requirement, shipments: Pick<Shipment, 'id' | 'requirementId' | 'status'>[]): string | null {
  if (req.status === 'Rechazado') return 'Este requerimiento ya fue rechazado.';
  if (req.status === 'Despachado') return 'Este requerimiento ya se despachó.';
  const live = liveShipmentOf(req, shipments);
  if (live) return `Este requerimiento ya se está armando como el envío ${live.id}: trabaje desde la tarjeta del envío.`;
  return null;
}

/** Lo que falta para pasar el requerimiento a «Empacando» (`null` si se puede). */
export function requirementToPackingIssue(req: Requirement, shipments: Pick<Shipment, 'id' | 'requirementId' | 'status'>[]): string | null {
  const closed = requirementOpenError(req, shipments);
  if (closed) return closed;
  if (!req.reviewedAt) return 'Antes de pasar el requerimiento a «Empacando» verifique la existencia: abra «Verificar existencia» y guarde las cantidades.';
  if (requirementSentLines(req).length === 0) return 'No hay nada que enviar: todas las cantidades están en 0. Rechace el requerimiento con su motivo.';
  return null;
}

export interface RequirementMove { ok: boolean; error?: string }

/** ¿Qué pasa si se suelta la tarjeta de un requerimiento en esa columna? Solo avanza de «Por armar» a «Empacando» (y entonces nace el envío). */
export function requirementMove(req: Requirement, target: string, shipments: Pick<Shipment, 'id' | 'requirementId' | 'status'>[]): RequirementMove | null {
  if (target === 'Por armar') return null;
  if (target !== 'Empacando') return { ok: false, error: 'Un requerimiento solo avanza a «Empacando» (entonces nace el envío): antes no tiene caja, transporte ni salida.' };
  const issue = requirementToPackingIssue(req, shipments);
  return issue ? { ok: false, error: issue } : { ok: true };
}

// ------------------------------------------------------------------------------------------------------------- Verificar existencia

/**
 * Cuánto hay ya comprometido de cada artículo en OTRAS tarjetas del almacén: las listas de los envíos que todavía no salieron (Por armar, Empacando y
 * Por despachar) y lo que se enviará de los demás requerimientos ya verificados que aún no son envío. No se reserva stock (la base decide al despachar):
 * es una ayuda para repartir lo que hay entre las sedes.
 */
export function committedByItem(
  shipments: Pick<Shipment, 'id' | 'requirementId' | 'status' | 'items'>[], requirements: Requirement[], exceptRequirementId?: string,
): Map<string, number> {
  const out = new Map<string, number>();
  const add = (itemId: string, qty: number) => out.set(itemId, (out.get(itemId) ?? 0) + qty);
  for (const s of shipments) {
    if (!(PRE_DISPATCH_STATUSES as readonly string[]).includes(s.status)) continue;
    if (exceptRequirementId && s.requirementId === exceptRequirementId) continue;
    for (const line of s.items) add(line.itemId, line.quantity);
  }
  for (const r of requirements) {
    if (r.id === exceptRequirementId || r.status !== 'Pendiente' || !r.reviewedAt || liveShipmentOf(r, shipments)) continue;
    for (const line of r.lines) if ((line.send ?? 0) > 0) add(line.itemId, line.send as number);
  }
  return out;
}

export interface ReviewRow {
  itemId: string;
  name: string;
  requested: number;
  /** Lo que hay hoy en el almacén. */
  stock: number;
  /** Lo que ya está comprometido en otras tarjetas. */
  committed: number;
  /** Lo que queda para este requerimiento (nunca negativo). */
  available: number;
  /** Lo que conviene enviar: lo pedido o, si no alcanza, lo disponible. */
  suggested: number;
  /** ¿No alcanza para todo lo pedido? */
  short: boolean;
}

/** Las filas de «Verificar existencia»: lo pedido frente a lo que hay y lo ya comprometido. */
export function requirementReviewRows(req: Pick<Requirement, 'lines'>, stockOf: (itemId: string) => number, committed: Map<string, number>, itemName: (id: string) => string): ReviewRow[] {
  return req.lines.map(l => {
    const stock = stockOf(l.itemId);
    const taken = committed.get(l.itemId) ?? 0;
    const available = Math.max(0, stock - taken);
    return {
      itemId: l.itemId, name: itemName(l.itemId), requested: l.quantity, stock, committed: taken, available,
      suggested: Math.min(l.quantity, available), short: l.quantity > available,
    };
  });
}

// ------------------------------------------------------------------------------------------------------------------ Lo que ve la sede

export interface SedeStatus {
  /** Lo único que ve la sede de la situación (nunca la etapa en que está). */
  label: 'En Logística' | 'Rechazado' | 'Despachado';
  tone: 'neutral' | 'danger' | 'success';
  detail: string;
  shipmentId?: string;
}

/** La situación de un requerimiento tal como la ve la sede: sigue en Logística, se rechazó (con su motivo) o ya se despachó. */
export function requirementSedeStatus(req: Requirement, shipments: Pick<Shipment, 'id' | 'requirementId' | 'status'>[]): SedeStatus {
  if (req.status === 'Rechazado') return { label: 'Rechazado', tone: 'danger', detail: req.rejectionReason ? `Motivo: ${req.rejectionReason}` : 'Logística lo rechazó.' };
  if (req.status === 'Despachado') {
    const shipment = shipments.find(s => s.requirementId === req.id && s.status !== 'Cancelado');
    return {
      label: 'Despachado', tone: 'success', shipmentId: shipment?.id,
      detail: shipment ? `Ya salió en el envío ${shipment.id}: recíbalo desde «Por recibir».` : 'Ya salió: recíbalo desde «Por recibir».',
    };
  }
  return { label: 'En Logística', tone: 'neutral', detail: req.reviewedAt ? 'Logística revisó la existencia: vea abajo cuánto se enviará.' : 'Logística lo revisará.' };
}

/** Las líneas donde lo que se enviará es distinto de lo pedido («pidió 30 → se enviará 4»). Vacío mientras no se haya verificado. */
export const requirementChanges = (req: Pick<Requirement, 'lines'>): RequirementLine[] => req.lines.filter(l => l.send !== undefined && l.send !== l.quantity);

// ------------------------------------------------------------------------------------------------------------------------ Mensajes

/** Cuántos mensajes de otras personas no ha visto esta cuenta en ese requerimiento (la marca de «mensaje nuevo»). */
export function unreadMessages(messages: RequirementMessage[], requirementId: string, seenUpTo: number, myId?: string): number {
  return messages.filter(m => m.requirementId === requirementId && m.id > seenUpTo && (!myId || m.authorId !== myId)).length;
}

/** Los mensajes de un requerimiento, del más antiguo al más nuevo. */
export const messagesOf = (messages: RequirementMessage[], requirementId: string): RequirementMessage[] =>
  messages.filter(m => m.requirementId === requirementId).sort((a, b) => a.id - b.id);

/** ¿El requerimiento admite mensajes? Solo mientras está pendiente. */
export const requirementAcceptsMessages = (req: Pick<Requirement, 'status'>): boolean => req.status === 'Pendiente';

/** ¿Coincide con lo que se busca? (código, sede, artículos o quién lo armó). */
export function requirementMatches(req: Requirement, query: string, branchName: string, itemName: (id: string) => string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [req.id, branchName, req.createdBy ?? '', ...req.lines.map(l => itemName(l.itemId))].some(t => t.toLowerCase().includes(q));
}
