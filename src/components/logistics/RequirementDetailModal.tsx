import React from 'react';
import { ArrowRight, Info, TriangleAlert } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { RequirementThread } from './RequirementThread';
import { useData } from '../../context/DataContext';
import { liveShipmentOf, requirementChanges, requirementSedeStatus, requirementTotals } from '../../utils/requirements';

interface Props { requirementId: string | null; onClose: () => void }

const day = (iso: string) => iso.split('-').reverse().join('/');

/**
 * El detalle de un requerimiento con su conversación. La sede lo ve como le corresponde (sigue en Logística, rechazado con su motivo o despachado, y cómo cambió
 * su lista: «pidió 30 → se enviará 4») **sin la etapa en que está**; quien atiende requerimientos ve además quién lo revisó y si ya se arma como envío.
 */
export function RequirementDetailModal({ requirementId, onClose }: Props) {
  const { requirements, shipments, items, stockLocations, can } = useData();
  const req = requirementId ? requirements.find(r => r.id === requirementId) : undefined;
  if (!req) return <Modal isOpen={false} onClose={onClose} title=""><span /></Modal>;

  const asLogistics = can('log-requerimientos:attend');
  const itemName = (id: string) => items.find(i => i.id === id)?.name ?? id;
  const branchName = stockLocations.find(l => l.id === req.branchId)?.name ?? req.branchId;
  const sede = requirementSedeStatus(req, shipments);
  const live = liveShipmentOf(req, shipments);
  const totals = requirementTotals(req);
  const changed = new Set(requirementChanges(req).map(l => l.itemId));
  const showSend = totals.toSend !== null;

  return (
    <Modal
      isOpen onClose={onClose} size="2xl" title={`Requerimiento ${req.id}`}
      footer={<div className="flex justify-end w-full"><Button variant="ghost" onClick={onClose}>Cerrar</Button></div>}
    >
      <div className="space-y-5">
        <div className="bg-surface-muted p-4 rounded-xl border border-border-soft grid grid-cols-2 gap-4 text-sm">
          <div><span className="text-text-secondary block mb-1">Sede que pide:</span><span className="font-medium text-text-primary">{branchName}</span></div>
          <div><span className="text-text-secondary block mb-1">Fecha:</span><span className="font-medium text-text-primary">{day(req.date)}</span></div>
          <div><span className="text-text-secondary block mb-1">Lo armó:</span><span className="font-medium text-text-primary">{req.createdBy ?? '—'}</span></div>
          <div>
            <span className="text-text-secondary block mb-1">Situación:</span>
            <Badge variant={sede.tone === 'danger' ? 'danger' : sede.tone === 'success' ? 'success' : 'neutral'}>{asLogistics ? req.status : sede.label}</Badge>
          </div>
          {req.note && <div className="col-span-2"><span className="text-text-secondary block mb-1">Nota de la sede:</span><span className="text-text-primary whitespace-pre-wrap">{req.note}</span></div>}
        </div>

        {req.status === 'Rechazado' && (
          <div role="status" className="p-3 bg-danger-tint text-danger-text border border-error/20 rounded-lg text-sm flex gap-2 items-start">
            <TriangleAlert size={16} className="shrink-0 mt-0.5" />
            <span><strong>Rechazado{req.resolvedBy ? ` por ${req.resolvedBy}` : ''}.</strong> {req.rejectionReason ? `Motivo: ${req.rejectionReason}` : ''}</span>
          </div>
        )}
        {req.status !== 'Rechazado' && (
          <div role="status" className="p-3 bg-info-tint text-info-text border border-info-text/20 rounded-lg text-sm flex gap-2 items-start">
            <Info size={16} className="shrink-0 mt-0.5" />
            <span>
              {asLogistics
                ? live ? `Se está armando como el envío ${live.id}.` : req.reviewedAt ? `Existencia verificada${req.reviewedBy ? ` por ${req.reviewedBy}` : ''}: falta pasarlo a «Empacando».` : 'Falta verificar la existencia.'
                : sede.detail}
            </span>
          </div>
        )}

        <section className="space-y-2" aria-label="Artículos del requerimiento">
          <div className="flex items-center justify-between pb-2 border-b border-border-soft">
            <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider">Artículos</h3>
            <span className="text-xs text-text-muted">{totals.lines} art. · pidió {totals.requested} unid.{showSend ? ` · se enviará ${totals.toSend}` : ''}</span>
          </div>
          <ul className="divide-y divide-border-soft">
            {req.lines.map(l => (
              <li key={l.itemId} className="py-2 flex items-center justify-between gap-3 text-sm">
                <span className="text-text-primary min-w-0 truncate">{itemName(l.itemId)}</span>
                {showSend && changed.has(l.itemId) ? (
                  <span className="flex items-center gap-1.5 shrink-0 text-warning-text font-medium">pidió {l.quantity}<ArrowRight size={12} aria-hidden />se enviará {l.send ?? 0}</span>
                ) : (
                  <span className="shrink-0 text-text-secondary">{showSend ? `pidió ${l.quantity} · se enviará ${l.send ?? l.quantity}` : `pidió ${l.quantity}`}</span>
                )}
              </li>
            ))}
          </ul>
        </section>

        <RequirementThread requirementId={req.id} />
      </div>
    </Modal>
  );
}
