import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Info } from 'lucide-react';
import { Button } from '../ui/Button';
import { DateInput } from '../ui/DateInput';
import { Modal } from '../ui/Modal';
import { useData } from '../../context/DataContext';
import { DROP_REASONS, enrollmentDateISO, previewDrop } from '../../utils/enrollmentDrop';
import { todayLocalISO } from '../../utils/schedule';
import { Field, errorCls, inputCls } from '../../pages/enrollment/fields';
import { DropEffectsPanel } from './DropEffectsPanel';

interface Props {
  /** Matrícula de la que se solicita la caída; `null` cierra la ventana. */
  enrollmentId: string | null;
  onClose: () => void;
}

/**
 * Solicitar la caída de una matrícula. No cambia nada todavía: abre una solicitud que se aprueba o rechaza en
 * Solicitudes pendientes. Aquí se muestra qué ocurrirá si se aprueba.
 */
export function DropRequestModal({ enrollmentId, onClose }: Props) {
  const data = useData();
  const today = todayLocalISO();
  const enrollment = data.enrollments.find(e => e.id === enrollmentId);
  const [reason, setReason] = useState('');
  const [detail, setDetail] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(today);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enrollmentId) return;
    setReason(''); setDetail(''); setEffectiveDate(today); setError(null);
  }, [enrollmentId]);

  const preview = useMemo(() => {
    if (!enrollment) return undefined;
    return previewDrop(
      {
        enrollment, plan: data.plans.find(p => p.mat === enrollment.id), schedules: data.schedules, monthly: data.monthlySchedules,
        students: data.students, enrollments: data.enrollments, payments: data.payments, groups: data.promotionGroups,
      },
      effectiveDate || today
    );
  }, [enrollment, data.plans, data.schedules, data.monthlySchedules, data.students, data.enrollments, data.payments, data.promotionGroups, effectiveDate]);

  if (!enrollment) return null;

  const handleSave = () => {
    const r = data.requestEnrollmentDrop(enrollment.id, { reason, detail, effectiveDate });
    if (!r.ok) { setError(r.error ?? 'No se pudo registrar la solicitud.'); return; }
    onClose();
  };

  const start = enrollmentDateISO(enrollment);

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Solicitar caída de matrícula"
      size="3xl"
      footer={
        <div className="flex justify-end gap-3 w-full">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={handleSave}>Enviar solicitud</Button>
        </div>
      }
    >
      <div className="space-y-5 pb-2">
        <div className="bg-surface-muted border border-border-soft rounded-xl p-3 text-sm">
          <p className="font-semibold text-text-primary">{enrollment.id} · {enrollment.student}</p>
          <p className="text-text-secondary">{enrollment.program}{enrollment.level ? ` - ${enrollment.level}` : ''} · {enrollment.sede ?? '—'}</p>
        </div>

        <div className="flex gap-2 text-sm text-info-text bg-info-tint/60 border border-info-text/20 rounded-xl p-3">
          <Info size={16} className="shrink-0 mt-0.5" />
          <p>La solicitud <strong>no cambia nada todavía</strong>: queda pendiente en «Solicitudes pendientes» hasta que alguien con autoridad la apruebe o la rechace.</p>
        </div>

        {error && (
          <div className="bg-danger-tint border border-danger-text/20 rounded-xl p-3 flex gap-2 text-sm text-danger-text">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <p>{error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="Motivo de la caída" required>
            <select className={`${inputCls} ${error && !reason ? errorCls : ''}`} value={reason} onChange={e => { setReason(e.target.value); setError(null); }}>
              <option value="">Seleccionar...</option>
              {DROP_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="Dejó de asistir desde" required hint="Define qué cuotas ya vencieron y qué asesorías se cancelan.">
            <DateInput min={start || undefined} max={today} value={effectiveDate} onChange={e => { setEffectiveDate(e.target.value); setError(null); }} />
          </Field>
          <Field label="Detalle" required className="md:col-span-2" hint="Queda como constancia en el historial de la matrícula.">
            <textarea
              className="w-full h-24 bg-surface border border-border-soft rounded-xl p-3 text-sm focus:outline-none focus:border-primary-accent resize-none"
              value={detail}
              onChange={e => { setDetail(e.target.value); setError(null); }}
              placeholder="Explique qué ocurrió y qué se conversó con el titular..."
            />
          </Field>
        </div>

        {preview && (
          <div className="space-y-2">
            <h4 className="text-sm font-bold text-text-primary uppercase tracking-wider">Si se aprueba</h4>
            <DropEffectsPanel preview={preview} enrollment={enrollment} />
          </div>
        )}
      </div>
    </Modal>
  );
}
