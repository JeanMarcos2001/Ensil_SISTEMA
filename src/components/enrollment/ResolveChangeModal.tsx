import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { useData } from '../../context/DataContext';
import { canResolve } from '../../utils/authority';
import { programChangeProblems, reactivationProblems, transferProblems, previewProgramChange, type ChangeContext } from '../../utils/enrollmentChange';
import { localDateOf } from '../../utils/schedule';
import { Blocked, ChangePreviewPanel } from './ChangePreviewPanel';

interface Props {
  /** Solicitud a resolver; `null` cierra la ventana. */
  requestId: string | null;
  onClose: () => void;
}

/** Aprobar o rechazar una solicitud de reactivación, cambio de programa o traslado de sede. */
export function ResolveChangeModal({ requestId, onClose }: Props) {
  const data = useData();
  const request = data.changeRequests.find(r => r.id === requestId);
  const enrollment = data.enrollments.find(e => e.id === request?.enrollmentId);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setNote(''); setError(null); }, [requestId]);

  const ctx: ChangeContext | undefined = useMemo(() => {
    if (!request) return undefined;
    return {
      enrollments: data.enrollments, plans: data.plans, students: data.students, schedules: data.schedules, monthly: data.monthlySchedules, programs: data.programs,
      levels: data.levels, tariffs: data.tariffs, paymentTypes: data.paymentTypes, branches: data.branches, classSchedules: data.classSchedules,
      payments: data.payments, groups: data.promotionGroups, requests: data.changeRequests.filter(r => r.id !== request.id), today: localDateOf(new Date().toISOString()),
    };
  }, [request, data.enrollments, data.plans, data.students, data.schedules, data.monthlySchedules, data.programs, data.levels, data.tariffs, data.paymentTypes, data.branches, data.classSchedules, data.payments, data.promotionGroups, data.changeRequests]);

  if (!request || !enrollment || !ctx) return null;
  const pending = request.status === 'Pendiente';
  const blockers = !pending ? [] : request.kind === 'Reactivación' ? reactivationProblems(enrollment, ctx)
    : request.kind === 'Cambio de programa'
      ? [...programChangeProblems(enrollment, { programId: request.payload.programId, levelId: request.payload.levelId }, ctx),
         ...(() => { const pv = previewProgramChange(enrollment, { programId: request.payload.programId, levelId: request.payload.levelId }, ctx); return pv && pv.remaining < 0 ? [`Se cobró USD ${(-pv.remaining).toFixed(2)} más que el precio nuevo: devuelva la diferencia primero.`] : []; })()]
      : transferProblems(enrollment, { branchId: request.payload.branchId, schedule: request.payload.schedule }, ctx);
  const authority = canResolve({ user: data.currentUser, roles: data.roles, permissions: data.permissions }, request.kind, request.requestedBy);

  const resolve = (decision: 'Aprobada' | 'Rechazada') => {
    const r = data.resolveChangeRequest(request.id, decision, note);
    if (!r.ok) { setError(r.error ?? 'No se pudo resolver la solicitud.'); return; }
    onClose();
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Solicitud de ${request.kind.toLowerCase()} ${request.id}`}
      size="3xl"
      footer={
        <div className="flex justify-end gap-3 w-full">
          <Button variant="ghost" onClick={onClose}>{pending ? 'Cancelar' : 'Cerrar'}</Button>
          {pending && (
            <>
              <Button variant="secondary" onClick={() => resolve('Rechazada')} disabled={!authority.ok}>Rechazar solicitud</Button>
              <Button variant="primary" onClick={() => resolve('Aprobada')} disabled={!authority.ok || blockers.length > 0}>Aprobar</Button>
            </>
          )}
        </div>
      }
    >
      <div className="space-y-5 pb-2">
        {error && (
          <div className="bg-danger-tint border border-danger-text/20 rounded-xl p-3 flex gap-2 text-sm text-danger-text">
            <AlertCircle size={16} className="shrink-0 mt-0.5" /><p>{error}</p>
          </div>
        )}
        {!authority.ok && pending && <Blocked problems={[authority.reason ?? 'No tiene autoridad para resolver esta solicitud.']} />}
        <Blocked problems={blockers} />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-surface-muted border border-border-soft rounded-xl p-4 text-sm">
          <div><span className="block text-xs text-text-muted">Matrícula</span><span className="font-medium text-text-primary">{enrollment.id}</span></div>
          <div><span className="block text-xs text-text-muted">Alumno</span><span className="font-medium text-text-primary">{enrollment.student}</span></div>
          <div><span className="block text-xs text-text-muted">Solicitada por</span><span className="font-medium text-text-primary">{request.requestedBy}</span></div>
          <div><span className="block text-xs text-text-muted">El</span><span className="font-medium text-text-primary">{localDateOf(request.requestedAt)}</span></div>
          <div className="col-span-2 md:col-span-4"><span className="block text-xs text-text-muted">Motivo</span><span className="font-medium text-text-primary">{request.reason}</span><p className="text-text-secondary mt-0.5">{request.detail}</p></div>
        </div>

        {pending ? (
          <>
            <section className="space-y-2">
              <h4 className="text-sm font-bold text-text-primary uppercase tracking-wider">Efectos al aprobar</h4>
              <ChangePreviewPanel kind={request.kind} enrollment={enrollment} payload={request.payload} ctx={ctx} />
            </section>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text-secondary">Nota de la resolución <span className="text-text-muted font-normal">(obligatoria si se rechaza)</span></label>
              <textarea className="w-full h-20 bg-surface border border-border-soft rounded-xl p-3 text-sm focus:outline-none focus:border-primary-accent resize-none" value={note} onChange={e => { setNote(e.target.value); setError(null); }} />
            </div>
          </>
        ) : (
          <div className="space-y-2 text-sm">
            <p><span className="font-semibold text-text-primary">{request.status}</span> por {request.resolvedBy} el {request.resolvedAt ? localDateOf(request.resolvedAt) : ''}.{request.resolutionNote && <span className="text-text-secondary"> {request.resolutionNote}</span>}</p>
            {request.effects && <ul className="list-disc pl-5 text-text-secondary space-y-0.5">{request.effects.map(x => <li key={x}>{x}</li>)}</ul>}
          </div>
        )}
      </div>
    </Modal>
  );
}
