import React from 'react';
import { ArrowRight, Ban, Calendar, CheckCircle2, ClipboardList, GripVertical, MapPin, MessageSquare, Package } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { requirementNeedsAttention, requirementTotals, type Requirement } from '../../utils/requirements';

interface Props {
  requirement: Requirement;
  branchName: string;
  /** Cuántos mensajes de otras personas no ha visto esta cuenta. */
  unread: number;
  /** ¿Quién mira puede atender requerimientos (verificar la existencia, rechazar y pasar a «Empacando»)? */
  canAttend: boolean;
  /** Se arrastra a «Empacando» (solo quien puede atender). */
  draggable?: boolean;
  dragging?: boolean;
  onVerify: () => void;
  onMessages: () => void;
  onAdvance: () => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

/**
 * La tarjeta de un requerimiento de una sede en «Por armar». No es un envío: cae aquí y, cuando Logística lo pasa a «Empacando», nace el envío. Mientras nadie
 * haya abierto «Verificar existencia» el contorno parpadea 4 veces al aparecer (no de forma permanente) y queda la marca «Sin revisar». Un requerimiento
 * rechazado (solo se ve en la vista de tarjetas) muestra su motivo.
 */
export function RequirementCard({ requirement: r, branchName, unread, canAttend, draggable = false, dragging = false, onVerify, onMessages, onAdvance, onDragStart, onDragEnd }: Props) {
  const totals = requirementTotals(r);
  const blink = requirementNeedsAttention(r);
  const rejected = r.status === 'Rechazado';
  return (
    <article
      draggable={draggable}
      onDragStart={e => { e.dataTransfer.setData('text/plain', r.id); e.dataTransfer.effectAllowed = 'move'; onDragStart?.(); }}
      onDragEnd={onDragEnd}
      aria-label={`Requerimiento ${r.id}`}
      className={`bg-surface border border-dashed rounded-lg shadow-sm hover:shadow transition-shadow ${rejected ? 'border-error/40' : 'border-primary-accent/50'} ${blink ? 'req-blink' : ''} ${dragging ? 'opacity-50' : ''}`}
    >
      <div className="p-3 space-y-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {draggable && <GripVertical size={14} className="text-text-muted shrink-0 -ml-1" aria-hidden />}
          <ClipboardList size={14} className="text-primary-accent shrink-0" aria-hidden />
          <span className="text-sm font-semibold text-text-primary">{r.id}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-xs text-text-secondary min-w-0"><MapPin size={12} className="shrink-0" /><span className="truncate">{branchName}</span></span>
          {rejected ? <Badge variant="danger">Rechazado</Badge> : <Badge variant="info">Requerimiento</Badge>}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-text-muted">
          <Package size={12} />{totals.lines} art. · pidió {totals.requested} unid.{totals.toSend !== null && !rejected ? ` · se enviará ${totals.toSend}` : ''}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-text-muted"><Calendar size={12} />Pedido el {r.date.split('-').reverse().join('/')}</div>
        {r.note && <p className="text-xs text-text-secondary line-clamp-2" title={r.note}>«{r.note}»</p>}
        {rejected && r.rejectionReason && <p className="text-xs text-danger-text line-clamp-3" title={r.rejectionReason}>Motivo: {r.rejectionReason}</p>}
        {!rejected && (
          <div className="flex flex-wrap items-center gap-1.5">
            {blink && <span className="text-[11px] font-medium text-primary-accent bg-active-tint rounded-md px-2 py-0.5">Sin revisar</span>}
            {!blink && r.reviewedAt && <span className="flex items-center gap-1 text-[11px] text-success-text bg-success-tint rounded-md px-2 py-0.5"><CheckCircle2 size={11} />Existencia verificada</span>}
            {unread > 0 && <span className="flex items-center gap-1 text-[11px] font-medium text-white bg-primary-accent rounded-md px-2 py-0.5"><MessageSquare size={11} />{unread === 1 ? 'Mensaje nuevo' : `${unread} mensajes nuevos`}</span>}
          </div>
        )}
      </div>
      <div className="px-3 pb-3 flex flex-wrap gap-2">
        {canAttend && !rejected && (
          <button type="button" onClick={onVerify} className="flex-1 min-w-[8rem] h-8 flex items-center justify-center text-xs font-medium rounded-md bg-primary-accent text-white hover:opacity-90 transition-opacity">
            Verificar existencia
          </button>
        )}
        <button
          type="button" onClick={onMessages}
          className="flex-1 min-w-[6rem] h-8 flex items-center justify-center gap-1.5 text-xs font-medium rounded-md border border-border-soft text-text-secondary hover:bg-surface-muted hover:text-text-primary transition-colors"
        >
          {rejected ? <Ban size={12} aria-hidden /> : <MessageSquare size={12} aria-hidden />}{rejected ? 'Ver detalle' : 'Mensajes'}
        </button>
        {canAttend && !rejected && r.reviewedAt && (
          <button
            type="button" onClick={onAdvance}
            className="w-full h-8 flex items-center justify-center gap-1.5 text-xs font-medium rounded-md border border-border-soft text-text-secondary hover:bg-surface-muted hover:text-text-primary transition-colors"
          >
            Pasar a «Empacando» <ArrowRight size={12} />
          </button>
        )}
      </div>
    </article>
  );
}
