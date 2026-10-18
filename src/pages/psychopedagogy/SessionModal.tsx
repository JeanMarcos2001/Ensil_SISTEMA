import React, { useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { useData, type FirstSessionChecklist, type Schedule } from '../../context/DataContext';
import { longDayLabel, slotLabel } from '../../utils/schedule';
import { SessionMetricsForm } from './SessionMetricsForm';
import { labelCls, textareaCls } from './formStyles';

interface Props {
  /** Asesoría a la que corresponde la sesión; `null` cierra la ventana. */
  schedule: Schedule | null;
  onClose: () => void;
}

const emptyChecklist = (): FirstSessionChecklist => ({ guardianAttended: false, methodologyExplained: false, itemsExplained: false });

const CHECKS: { key: keyof FirstSessionChecklist; label: string; required: boolean }[] = [
  { key: 'guardianAttended', label: 'Asistió el apoderado (si corresponde)', required: false },
  { key: 'methodologyExplained', label: 'Metodología explicada', required: true },
  { key: 'itemsExplained', label: 'Uso de artículos explicado', required: true },
];

/**
 * Registro de la sesión de una asesoría: avance y métricas según el programa. Si es la primera asesoría,
 * incluye el checklist de cierre. Guardar marca la asesoría como «Asistió».
 */
export function SessionModal({ schedule, onClose }: Props) {
  const { students, trackings, addTracking, updateTracking, updateSchedule } = useData();
  const existing = schedule ? trackings.find(t => t.scheduleId === schedule.id) : undefined;
  const [metrics, setMetrics] = useState<Record<string, any>>({});
  const [observations, setObservations] = useState('');
  const [checklist, setChecklist] = useState<FirstSessionChecklist>(emptyChecklist());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!schedule) return;
    setError(null);
    setMetrics(existing?.metrics ?? {});
    setObservations(existing?.observations ?? '');
    setChecklist(existing?.checklist ?? emptyChecklist());
  }, [schedule?.id]);

  if (!schedule) return null;

  const student = students.find(s => s.id === schedule.studentId) ?? students.find(s => s.name === schedule.student);
  const pendingChecks = schedule.isFirst ? CHECKS.filter(c => c.required && !checklist[c.key]) : [];

  const handleSave = () => {
    if (!student) { setError('La asesoría no está vinculada a una ficha de alumno; no se puede registrar la sesión.'); return; }
    if (pendingChecks.length > 0) {
      setError(`Para cerrar la primera asesoría marque: ${pendingChecks.map(c => c.label.toLowerCase()).join(' y ')}.`);
      return;
    }
    const record = {
      studentId: student.id, scheduleId: schedule.id, date: schedule.date, status: 'Asistió',
      metrics, observations: observations.trim(), checklist: schedule.isFirst ? checklist : undefined,
    };
    if (existing) updateTracking(existing.id, record);
    else addTracking(record);
    if (schedule.status !== 'Asistió') updateSchedule(schedule.id, { status: 'Asistió' });
    onClose();
  };

  const info: [string, string][] = [
    ['Alumno', schedule.student],
    ['Programa', `${schedule.program}${schedule.level ? ` - ${schedule.level}` : ''}`],
    ['Fecha', longDayLabel(schedule.date)],
    ['Horario', slotLabel(schedule.time)],
    ['Responsable', schedule.responsible],
  ];

  return (
    <Modal
      isOpen={!!schedule}
      onClose={onClose}
      title={existing ? 'Sesión registrada' : 'Registrar Sesión'}
      size="4xl"
      footer={
        <div className="flex justify-end gap-3 w-full">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={handleSave}>{existing ? 'Guardar Cambios' : 'Guardar Sesión'}</Button>
        </div>
      }
    >
      <div className="space-y-6 pb-4">
        {error && (
          <div className="bg-danger-tint border border-danger-text/20 rounded-xl p-3 flex gap-2 text-sm text-danger-text">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <p>{error}</p>
          </div>
        )}

        <div className="bg-surface-muted p-4 rounded-xl border border-border-soft">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {info.map(([k, v]) => (
              <div key={k}>
                <p className="text-xs text-text-muted uppercase tracking-wider mb-1">{k}</p>
                <p className="text-sm font-medium text-text-primary">{v}</p>
              </div>
            ))}
            {schedule.isFirst && (
              <div>
                <p className="text-xs text-text-muted uppercase tracking-wider mb-1">Tipo</p>
                <Badge variant="info">Primera asesoría</Badge>
              </div>
            )}
          </div>
        </div>

        {schedule.status !== 'Asistió' && !existing && (
          <p className="text-sm text-text-secondary">Al guardar la sesión, la asesoría quedará marcada como «Asistió».</p>
        )}

        {schedule.isFirst && (
          <div className="space-y-3">
            <div className="pb-2 border-b border-border-soft">
              <h3 className="text-base font-semibold text-text-primary">Cierre de la primera asesoría</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {CHECKS.map(c => (
                <label key={c.key} className="flex items-center gap-3 p-3 border border-border-soft rounded-xl hover:bg-surface-muted cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    className="w-4 h-4 text-primary-accent border-border-soft rounded focus:ring-primary-accent"
                    checked={checklist[c.key]}
                    onChange={e => { setError(null); setChecklist({ ...checklist, [c.key]: e.target.checked }); }}
                  />
                  <span className="text-sm text-text-primary">{c.label}{c.required && <span className="text-error"> *</span>}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-3">
          <div className="pb-2 border-b border-border-soft">
            <h3 className="text-base font-semibold text-text-primary">Avance de la sesión</h3>
          </div>
          <SessionMetricsForm program={schedule.program} metrics={metrics} onChange={setMetrics} />
          <div>
            <label className={labelCls}>Observaciones</label>
            <textarea
              className={`${textareaCls} h-28`}
              placeholder="¿Qué trabajó el alumno? ¿Cómo avanzó?"
              value={observations}
              onChange={e => setObservations(e.target.value)}
            ></textarea>
          </div>
        </div>
      </div>
    </Modal>
  );
}
