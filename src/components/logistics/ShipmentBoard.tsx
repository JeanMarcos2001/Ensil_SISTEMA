import React, { useState } from 'react';
import { ArrowRight, Calendar, ClipboardList, Clock, GripVertical, MapPin, Package, TriangleAlert } from 'lucide-react';
import type { Shipment } from '../../context/DataContext';
import { Badge } from '../ui/Badge';
import { BOARD_COLUMNS, BOARD_RECEIVED_LIMIT, boardMove, cardPending, columnOf, groupByColumn, shipmentTotals, type BoardColumnId } from '../../utils/shipmentBoard';
import { etaLabel, type TransportCatalog } from '../../utils/logisticsDocs';
import { requirementMove, type Requirement } from '../../utils/requirements';
import { RequirementCard } from './RequirementCard';

interface Props {
  /** Los envíos ya filtrados (búsqueda, destino, fecha y sede); los cancelados no se muestran en el tablero. */
  shipments: Shipment[];
  catalog: TransportCatalog;
  placeName: (id: string) => string;
  /** ¿Quién mira puede mover tarjetas entre las columnas de preparación? */
  canMove: boolean;
  onOpen: (shipment: Shipment) => void;
  onMove: (shipment: Shipment, target: BoardColumnId) => void;
  /** Las tarjetas de requerimiento de «Por armar» (los pendientes que todavía no tienen envío, ya filtrados). No son envíos: al pasarlos a «Empacando» nace el envío. */
  requirements?: Requirement[];
  /** Todos los envíos, sin filtros: sirven para saber si un requerimiento ya se está armando como envío. */
  allShipments?: Shipment[];
  /** ¿Quién mira puede atender requerimientos (verificar la existencia, rechazar y pasar a «Empacando»)? */
  canAttend?: boolean;
  /** Cuántos mensajes nuevos tiene un requerimiento para esta cuenta. */
  unreadOf?: (requirementId: string) => number;
  onRequirementVerify?: (requirement: Requirement) => void;
  onRequirementMessages?: (requirement: Requirement) => void;
  onRequirementMove?: (requirement: Requirement, target: BoardColumnId) => void;
}

const COLUMN_ORDER = BOARD_COLUMNS.map(c => c.id);

/** El texto del botón de avanzar de una tarjeta (la última columna de preparación despacha). */
const advanceLabel = (column: BoardColumnId): string | null => {
  const next = COLUMN_ORDER[COLUMN_ORDER.indexOf(column) + 1];
  if (column === 'Por despachar') return 'Despachar…';
  if (column === 'Por armar' || column === 'Empacando') return `Pasar a «${next}»`;
  return null;
};

/**
 * El tablero de envíos: una columna por etapa (Por armar, Empacando, Por despachar, En tránsito y Recibido). Las tarjetas se arrastran de una columna a otra
 * (o con el botón de avanzar); las reglas de qué se puede mover y a dónde son puras (`utils/shipmentBoard.ts`) y la base las vuelve a comprobar.
 */
export function ShipmentBoard({
  shipments, catalog, placeName, canMove, onOpen, onMove, requirements = [], allShipments, canAttend = false, unreadOf, onRequirementVerify, onRequirementMessages, onRequirementMove,
}: Props) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragReqId, setDragReqId] = useState<string | null>(null);
  const [over, setOver] = useState<BoardColumnId | null>(null);

  const grouped = groupByColumn(shipments, Number.MAX_SAFE_INTEGER);
  const receivedTotal = grouped.Recibido.length;
  const columns = { ...grouped, Recibido: grouped.Recibido.slice(0, BOARD_RECEIVED_LIMIT) };
  const dragged = dragId ? shipments.find(s => s.id === dragId) : undefined;
  const draggedReq = dragReqId ? requirements.find(r => r.id === dragReqId) : undefined;
  const everyShipment = allShipments ?? shipments;
  const overMove = dragged && over ? boardMove(dragged, over, catalog) : draggedReq && over ? requirementMove(draggedReq, over, everyShipment) : null;
  const dragging = !!dragged || !!draggedReq;

  const drop = (column: BoardColumnId) => {
    const s = dragId ? shipments.find(x => x.id === dragId) : undefined;
    const r = dragReqId ? requirements.find(x => x.id === dragReqId) : undefined;
    setDragId(null);
    setDragReqId(null);
    setOver(null);
    if (s && columnOf(s.status) !== column) onMove(s, column);
    if (r && column !== 'Por armar') onRequirementMove?.(r, column);
  };

  return (
    <div className="flex gap-4 overflow-x-auto pb-2 h-full items-stretch" role="list" aria-label="Tablero de envíos">
      {BOARD_COLUMNS.map(col => {
        const cards = columns[col.id];
        const reqCards = col.id === 'Por armar' ? requirements : [];
        const total = (col.id === 'Recibido' ? receivedTotal : cards.length) + reqCards.length;
        const highlight = over === col.id && dragging
          ? overMove === null ? 'border-border-soft'
            : overMove.ok ? 'border-success-text ring-2 ring-success-text/20' : 'border-error ring-2 ring-error/20'
          : 'border-border-soft';
        return (
          <section
            key={col.id}
            role="listitem"
            aria-label={col.title}
            onDragOver={e => { if (dragging) { e.preventDefault(); if (over !== col.id) setOver(col.id); } }}
            onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null) && over === col.id) setOver(null); }}
            onDrop={e => { e.preventDefault(); drop(col.id); }}
            className={`flex flex-col min-w-[260px] w-[260px] lg:w-auto lg:flex-1 rounded-xl border bg-surface-muted/40 transition-shadow ${highlight}`}
          >
            <header className="px-3 pt-3 pb-2 border-b border-border-soft">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-text-primary">{col.title}</h3>
                <span className="text-xs font-medium text-text-secondary bg-surface border border-border-soft rounded-full px-2 py-0.5">{total}</span>
              </div>
              <p className="text-[11px] text-text-muted mt-0.5">{col.hint}</p>
            </header>
            <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[120px]">
              {cards.length === 0 && reqCards.length === 0 && <p className="text-xs text-text-muted text-center py-6">Sin tarjetas</p>}
              {reqCards.map(r => (
                <RequirementCard
                  key={r.id}
                  requirement={r}
                  branchName={placeName(r.branchId)}
                  unread={unreadOf?.(r.id) ?? 0}
                  canAttend={canAttend}
                  draggable={canAttend}
                  dragging={dragReqId === r.id}
                  onVerify={() => onRequirementVerify?.(r)}
                  onMessages={() => onRequirementMessages?.(r)}
                  onAdvance={() => onRequirementMove?.(r, 'Empacando')}
                  onDragStart={() => setDragReqId(r.id)}
                  onDragEnd={() => { setDragReqId(null); setOver(null); }}
                />
              ))}
              {cards.map(s => (
                <BoardCard
                  key={s.id}
                  shipment={s}
                  column={col.id}
                  catalog={catalog}
                  placeName={placeName}
                  canMove={canMove}
                  dragging={dragId === s.id}
                  onOpen={onOpen}
                  onAdvance={() => onMove(s, COLUMN_ORDER[COLUMN_ORDER.indexOf(col.id) + 1])}
                  onDragStart={() => setDragId(s.id)}
                  onDragEnd={() => { setDragId(null); setOver(null); }}
                />
              ))}
              {col.id === 'Recibido' && receivedTotal > BOARD_RECEIVED_LIMIT && (
                <p className="text-[11px] text-text-muted text-center pt-1">Se muestran los últimos {BOARD_RECEIVED_LIMIT} de {receivedTotal}; el resto, en la vista de tarjetas.</p>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

interface CardProps {
  shipment: Shipment;
  column: BoardColumnId;
  catalog: TransportCatalog;
  placeName: (id: string) => string;
  canMove: boolean;
  dragging: boolean;
  onOpen: (shipment: Shipment) => void;
  onAdvance: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}

function BoardCard({ shipment: s, column, catalog, placeName, canMove, dragging, onOpen, onAdvance, onDragStart, onDragEnd }: CardProps) {
  const pending = cardPending(s, catalog);
  const totals = shipmentTotals(s);
  const draggable = canMove && (column === 'Por armar' || column === 'Empacando' || column === 'Por despachar');
  const advance = canMove ? advanceLabel(column) : null;
  return (
    <article
      draggable={draggable}
      onDragStart={e => { e.dataTransfer.setData('text/plain', s.id); e.dataTransfer.effectAllowed = 'move'; onDragStart(); }}
      onDragEnd={onDragEnd}
      className={`bg-surface border border-border-soft rounded-lg shadow-sm hover:shadow transition-shadow ${dragging ? 'opacity-50' : ''}`}
    >
      <button type="button" onClick={() => onOpen(s)} className="w-full text-left p-3 space-y-2" aria-label={`Abrir el envío ${s.id}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            {draggable && <GripVertical size={14} className="text-text-muted shrink-0 -ml-1" aria-hidden />}
            <span className="text-sm font-semibold text-text-primary truncate">{s.id}</span>
          </div>
          {s.status === 'Listo para recepción' && <Badge variant="info">Listo para recepción</Badge>}
          {s.status === 'Recibido con diferencias' && <Badge variant="warning">Con diferencias</Badge>}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-text-secondary"><MapPin size={12} className="shrink-0" />{placeName(s.destinationId)}</div>
        {s.requirementId && <div className="flex items-center gap-1.5 text-[11px] text-primary-accent"><ClipboardList size={11} className="shrink-0" />Pedido por la sede ({s.requirementId})</div>}
        <div className="flex items-center justify-between text-xs text-text-muted">
          <span className="flex items-center gap-1.5"><Package size={12} />{totals.boxes > 0 ? `${totals.boxes} caja${totals.boxes === 1 ? '' : 's'} · ` : ''}{totals.lines} art. · {totals.units} unid.</span>
        </div>
        {s.eta ? (
          <div className="flex items-center gap-1.5 text-xs text-text-muted"><Clock size={12} />Llegada: {etaLabel(s.eta, s.etaTime)}</div>
        ) : (
          <div className="flex items-center gap-1.5 text-xs text-text-muted"><Calendar size={12} />Creado el {s.date.split('-').reverse().join('/')}</div>
        )}
        {pending.length > 0 && (
          <div className="flex items-start gap-1.5 text-[11px] text-warning-text bg-warning-tint border border-warning/30 rounded-md px-2 py-1" title={pending.join('\n')}>
            <TriangleAlert size={12} className="shrink-0 mt-0.5" />
            <span>Datos pendientes: {pending[0]}</span>
          </div>
        )}
      </button>
      {advance && (
        <div className="px-3 pb-3">
          <button
            type="button"
            onClick={onAdvance}
            className="w-full h-8 flex items-center justify-center gap-1.5 text-xs font-medium rounded-md border border-border-soft text-text-secondary hover:bg-surface-muted hover:text-text-primary transition-colors"
          >
            {advance} <ArrowRight size={12} />
          </button>
        </div>
      )}
    </article>
  );
}
