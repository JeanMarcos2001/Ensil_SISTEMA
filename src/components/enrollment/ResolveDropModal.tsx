import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { useData } from '../../context/DataContext';
import { previewDrop } from '../../utils/enrollmentDrop';
import { localDateOf, longDayLabel } from '../../utils/schedule';
import { DropEffectsPanel } from './DropEffectsPanel';

interface Props {
  /** Solicitud a resolver; `null` cierra la ventana. */
  requestId: string | null;
  onClose: () => void;
}

const usd = (n: number) => `USD ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Aprobar o rechazar una solicitud de caída. Al aprobar se aplican los efectos (plan, asesorías, actividades y alumno). */
export function ResolveDropModal({ requestId, onClose }: Props) {
  const data = useData();
  const request = data.dropRequests.find(r => r.id === requestId);
  const enrollment = data.enrollments.find(e => e.id === request?.enrollmentId);
  const [forgive, setForgive] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setForgive(false); setNote(''); setError(null); }, [requestId]);

  const preview = useMemo(() => {
    if (!request || !enrollment) return undefined;
    return previewDrop(
      {
        enrollment, plan: data.plans.find(p => p.mat === enrollment.id), schedules: data.schedules, monthly: data.monthlySchedules,
        students: data.students, enrollments: data.enrollments, payments: data.payments, groups: data.promotionGroups,
      },
      request.effectiveDate
    );
  }, [request, enrollment, data.plans, data.schedules, data.monthlySchedules, data.students, data.enrollments, data.payments, data.promotionGroups]);

  if (!request || !enrollment || !preview) return null;
  const pending = request.status === 'Pendiente';

  const resolve = (decision: 'Aprobada' | 'Rechazada') => {
    const r = data.resolveEnrollmentDrop(request.id, decision, { note, forgiveOverdue: forgive });
    if (!r.ok) { setError(r.error ?? 'No se pudo resolver la solicitud.'); return; }
    onClose();
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Solicitud de caída ${request.id}`}
      size="3xl"
      footer={
        <div className="flex justify-end gap-3 w-full">
          <Button variant="ghost" onClick={onClose}>{pending ? 'Cancelar' : 'Cerrar'}</Button>
          {pending && (
            <>
              <Button variant="secondary" onClick={() => resolve('Rechazada')}>Rechazar solicitud</Button>
              <Button variant="primary" onClick={() => resolve('Aprobada')}>Aprobar caída</Button>
            </>
          )}
        </div>
      }
    >
      <div className="space-y-5 pb-2">
        {error && (
          <div className="bg-danger-tint border border-danger-text/20 rounded-xl p-3 flex gap-2 text-sm text-danger-text">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <p>{error}</p>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-surface-muted border border-border-soft rounded-xl p-4 text-sm">
          <div><span className="block text-xs text-text-muted">Matrícula</span><span className="font-medium text-text-primary">{enrollment.id}</span></div>
          <div><span className="block text-xs text-text-muted">Alumno</span><span className="font-medium text-text-primary">{enrollment.student}</span></div>
          <div><span className="block text-xs text-text-muted">Solicitada por</span><span className="font-medium text-text-primary">{request.requestedBy}</span></div>
          <div><span className="block text-xs text-text-muted">Dejó de asistir desde</span><span className="font-medium text-text-primary">{longDayLabel(request.effectiveDate)}</span></div>
          <div className="col-span-2 md:col-span-4">
            <span className="block text-xs text-text-muted">Motivo</span>
            <span className="font-medium text-text-primary">{request.reason}</span>
            <p className="text-text-secondary mt-0.5">{request.detail}</p>
          </div>
        </div>

        {pending ? (
          <>
            <div className="space-y-2">
              <h4 className="text-sm font-bold text-text-primary uppercase tracking-wider">Efectos al aprobar</h4>
              <DropEffectsPanel preview={preview} enrollment={enrollment} forgiveOverdue={forgive} />
            </div>

            {preview.overdue.length > 0 && (
              <label className="flex items-start gap-3 p-3 border border-border-soft rounded-xl cursor-pointer hover:bg-surface-muted transition-colors">
                <input type="checkbox" className="mt-0.5 w-4 h-4 rounded border-border-soft" checked={forgive} onChange={e => setForgive(e.target.checked)} />
                <span className="text-sm">
                  <span className="font-medium text-text-primary">Condonar la deuda vencida ({usd(preview.overdueUSD)})</span>
                  <span className="block text-text-secondary">Si no se marca, esas cuotas siguen en cartera como deuda por cobrar.</span>
                </span>
              </label>
            )}

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text-secondary">Nota de la resolución <span className="text-text-muted font-normal">(obligatoria si se rechaza)</span></label>
              <textarea
                className="w-full h-20 bg-surface border border-border-soft rounded-xl p-3 text-sm focus:outline-none focus:border-primary-accent resize-none"
                value={note}
                onChange={e => { setNote(e.target.value); setError(null); }}
                placeholder="Observaciones de quien resuelve..."
              />
            </div>
            <p className="text-xs text-text-muted">Aprobar la caída no se puede deshacer desde aquí. Los pagos ya cobrados se conservan.</p>
          </>
        ) : (
          <div className="space-y-2 text-sm">
            <p>
              <span className="font-semibold text-text-primary">{request.status}</span> por {request.resolvedBy} el {request.resolvedAt ? localDateOf(request.resolvedAt) : ''}.
              {request.resolutionNote && <span className="text-text-secondary"> {request.resolutionNote}</span>}
            </p>
            {request.effects && (
              <p className="text-text-secondary">
                Efectos: {request.effects.annulledInstallments} cuotas anuladas ({usd(request.effects.annulledUSD)}), deuda que queda {usd(request.effects.overdueUSD)}
                {request.effects.overdueForgiven ? ' (condonada)' : ''}, {request.effects.cancelledSchedules} asesorías canceladas, {request.effects.removedActivities} inscripciones quitadas
                {request.effects.studentDeactivated ? ', alumno inactivado' : ''}.
              </p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
