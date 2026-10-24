import React from 'react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { useData, type PsyEvent, type Schedule } from '../../context/DataContext';
import { describeEvent, historyOf, rescheduleCount } from '../../utils/psyHistory';
import { longDayLabel, statusTone } from '../../utils/schedule';

const stamp = (iso: string) => new Date(iso).toLocaleString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const TONE: Partial<Record<PsyEvent['type'], 'danger' | 'warning' | 'success' | 'info' | 'neutral'>> = {
  Cancelada: 'danger', Reprogramada: 'warning', Asistió: 'success', 'Sesión registrada': 'success', Faltó: 'danger', Reservada: 'info',
};

/** Historial de una asesoría: reserva, reprogramaciones y cancelación, con quién lo hizo, quién lo pidió y el motivo. */
export function ScheduleHistoryModal({ schedule, onClose }: { schedule: Schedule | null; onClose: () => void }) {
  const { psyEvents } = useData();
  if (!schedule) return null;
  const events = historyOf(psyEvents, 'asesoria', schedule.id);
  const moves = rescheduleCount(psyEvents, schedule.id);

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Historial de la asesoría"
      size="2xl"
      footer={<div className="flex justify-end w-full"><Button variant="ghost" onClick={onClose}>Cerrar</Button></div>}
    >
      <div className="space-y-4 pb-2">
        <div className="bg-surface-muted p-4 rounded-xl border border-border-soft flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-text-primary">{schedule.student}{schedule.isFirst && <span className="ml-2 text-xs font-medium text-primary-accent">Primera asesoría</span>}</p>
            <p className="text-sm text-text-secondary mt-0.5">{schedule.program}{schedule.level ? ` · ${schedule.level}` : ''}</p>
            <p className="text-xs text-text-muted mt-1">Hoy figura el {longDayLabel(schedule.date)} a las {schedule.time}{schedule.responsible ? ` · ${schedule.responsible}` : ''}</p>
          </div>
          <div className="text-right space-y-1">
            <Badge variant={statusTone(schedule.status) as any}>{schedule.status}</Badge>
            {moves > 0 && <p className="text-xs text-warning-text font-medium">Reprogramada {moves} {moves === 1 ? 'vez' : 'veces'}</p>}
          </div>
        </div>

        {events.length === 0 ? (
          <p className="text-sm text-text-muted text-center py-8 border border-dashed border-border-soft rounded-xl">
            No hay cambios registrados para esta asesoría (los de antes de activar el historial no figuran).
          </p>
        ) : (
          <ol className="space-y-3">
            {events.map(e => (
              <li key={e.id} className="border border-border-soft rounded-xl p-3 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant={TONE[e.type] ?? 'neutral'}>{e.type}</Badge>
                  <span className="text-xs text-text-muted">{stamp(e.at)} · {e.by}</span>
                </div>
                <p className="text-sm text-text-primary">{describeEvent(e)}</p>
                {e.initiator && <p className="text-xs text-text-secondary">Lo pidió: <span className="font-medium">{e.initiator}</span></p>}
                {e.reason && <p className="text-xs text-text-secondary">Motivo: {e.reason}</p>}
                {e.detail && <p className="text-xs text-text-muted">{e.detail}</p>}
              </li>
            ))}
          </ol>
        )}
      </div>
    </Modal>
  );
}
