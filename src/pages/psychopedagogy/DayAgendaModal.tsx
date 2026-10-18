import React from 'react';
import { CalendarDays } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import type { Schedule, Tracking } from '../../context/DataContext';
import {
  availableActions,
  capacityFor,
  groupByBlock,
  longDayLabel,
  rangeLabel,
  slotLabel,
  statusTone,
  ACTIVE_STATUSES,
  type FlatActivity,
  type ScheduleAction,
} from '../../utils/schedule';
import type { CapacityConfig } from '../../context/DataContext';

interface Props {
  /** Día que se muestra; `null` cierra la ventana. */
  date: string | null;
  today: string;
  schedules: Schedule[];
  activities: FlatActivity[];
  capacity: CapacityConfig;
  /** Sede mostrada (vacío = todas). */
  branchId: string;
  branchName: (id?: string) => string;
  trackings: Tracking[];
  onClose: () => void;
  onReserve: (date: string) => void;
  onAction: (action: ScheduleAction, schedule: Schedule) => void;
  onShowActivity: (activityId: string) => void;
}

export const ACTION_LABEL: Record<ScheduleAction, string> = {
  reprogramar: 'Reprogramar',
  asistio: 'Marcar asistencia',
  sesion: 'Registrar sesión',
  falta: 'Marcar falta',
  cancelar: 'Cancelar',
};

/** Agenda de un día: actividades especiales y, por horario, los alumnos con sus acciones. */
export function DayAgendaModal({
  date, today, schedules, activities, capacity, branchId, branchName, trackings, onClose, onReserve, onAction, onShowActivity,
}: Props) {
  if (!date) return null;
  const day = schedules.filter(s => s.date === date);
  const blocks = groupByBlock(day);
  const acts = activities.filter(a => a.date === date);

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Agenda del ${longDayLabel(date)}`}
      size="3xl"
      footer={
        <div className="flex justify-end gap-3 w-full">
          <Button variant="ghost" onClick={onClose}>Cerrar</Button>
          {date >= today && <Button variant="primary" onClick={() => onReserve(date)}>Reservar asesoría</Button>}
        </div>
      }
    >
      <div className="space-y-5 pb-2">
        {acts.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-text-secondary">Actividades especiales</p>
            {acts.map(a => (
              <button
                key={a.id}
                type="button"
                onClick={() => onShowActivity(a.id)}
                className="w-full text-left p-3 border border-primary-accent/30 bg-active-tint/50 rounded-xl hover:shadow-sm transition-shadow flex items-start justify-between gap-3"
              >
                <div>
                  <p className="text-sm font-semibold text-text-primary"><CalendarDays size={14} className="inline -mt-0.5 mr-1.5 text-primary-accent" />{a.name}</p>
                  <p className="text-xs text-text-secondary mt-0.5">{rangeLabel(a.start, a.end)}{!branchId ? ` · ${a.sede}` : ''}{a.responsible ? ` · ${a.responsible}` : ''}</p>
                  <p className="text-xs text-text-muted">Los horarios de ese rango no admiten asesorías.</p>
                </div>
                <Badge variant="info">{a.enrolled.length} {a.enrolled.length === 1 ? 'inscrito' : 'inscritos'}{a.capacity !== null ? ` de ${a.capacity}` : ''}</Badge>
              </button>
            ))}
          </div>
        )}

        {blocks.length === 0 && acts.length === 0 && <p className="text-sm text-text-muted text-center py-6">No hay asesorías ni actividades este día.</p>}

        {blocks.map(g => {
          const active = g.items.filter(s => ACTIVE_STATUSES.includes(s.status)).length;
          const cap = branchId ? capacityFor(capacity, branchId, date, g.time) : null;
          return (
            <div key={g.time} className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-text-primary">{slotLabel(g.time)}</p>
                <Badge variant={cap !== null && active >= cap ? 'warning' : 'neutral'}>
                  {cap !== null ? `${active} de ${cap} ${cap === 1 ? 'cupo' : 'cupos'}` : `${active} ${active === 1 ? 'alumno' : 'alumnos'}`}
                </Badge>
              </div>
              {g.items.map(s => {
                const session = trackings.find(t => t.scheduleId === s.id);
                const actions = availableActions(s, today);
                return (
                  <div key={s.id} className="p-3 border border-border-soft rounded-xl space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-text-primary">{s.student}{s.isFirst && <span className="ml-2 text-xs font-medium text-primary-accent">Primera asesoría</span>}</p>
                        <p className="text-xs text-text-secondary mt-0.5">{s.program} · {s.level}{!branchId ? ` · ${branchName(s.branchId)}` : ''}</p>
                        <p className="text-xs text-text-muted">{s.responsible}</p>
                      </div>
                      <div className="text-right space-y-1">
                        <Badge variant={statusTone(s.status) as any}>{s.status}</Badge>
                        {s.status === 'Asistió' && <p className="text-xs text-text-muted">{session ? 'Sesión registrada' : 'Sin sesión'}</p>}
                      </div>
                    </div>
                    {actions.length > 0 && (
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        {actions.map(a => (
                          <button
                            key={a}
                            type="button"
                            onClick={() => onAction(a, s)}
                            className={`text-xs font-medium hover:underline ${a === 'falta' || a === 'cancelar' ? 'text-danger-text' : 'text-primary-accent'}`}
                          >
                            {a === 'sesion' && session ? 'Ver sesión' : ACTION_LABEL[a]}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
