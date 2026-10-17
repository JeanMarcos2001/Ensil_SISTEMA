import React from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import type { Schedule } from '../../context/DataContext';
import {
  MONTHS,
  WEEKDAYS_SHORT,
  endTime,
  longDayLabel,
  monthGrid,
  monthTitle,
  statusTone,
  timeToMinutes,
  weekOf,
  type StatusTone,
} from '../../utils/schedule';

export type CalendarMode = 'month' | 'week';

interface Props {
  schedules: Schedule[];
  mode: CalendarMode;
  onModeChange: (m: CalendarMode) => void;
  /** Cualquier fecha del mes / semana que se muestra. */
  cursor: string;
  onNavigate: (dir: -1 | 0 | 1) => void;
  today: string;
  onCreate: (date: string) => void;
  onEdit: (s: Schedule) => void;
  onShowDay: (date: string) => void;
}

const TONE: Record<StatusTone, string> = {
  success: 'bg-success-tint text-success-text border-success-text/30',
  info: 'bg-info-tint text-info-text border-info-text/30',
  warning: 'bg-warning-tint text-warning-text border-warning-text/30',
  danger: 'bg-danger-tint text-danger-text border-danger-text/30',
  neutral: 'bg-surface-muted text-text-secondary border-border-soft',
};
const DOT: Record<StatusTone, string> = {
  success: 'bg-success-text', info: 'bg-info-text', warning: 'bg-warning-text', danger: 'bg-danger-text', neutral: 'bg-text-muted',
};
const LEGEND = ['Confirmado', 'Reservado', 'Reprogramado', 'Cancelado', 'No reservó'];

const byTime = (a: Schedule, b: Schedule) => timeToMinutes(a.time) - timeToMinutes(b.time);

function EventChip({ s, onEdit }: { s: Schedule; onEdit: (s: Schedule) => void }) {
  const tone = statusTone(s.status);
  const dead = s.status === 'Cancelado' || s.status === 'No reservó';
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onEdit(s); }}
      title={`${s.time} · ${s.student} · ${s.type} · ${s.status}`}
      className={`w-full text-left px-2 py-1 rounded-lg border text-xs font-medium truncate transition-shadow hover:shadow-sm ${TONE[tone]} ${dead ? 'opacity-70' : ''}`}
    >
      <span className="font-semibold">{s.time}</span>{' '}
      <span className={dead ? 'line-through' : ''}>{s.student}</span>
    </button>
  );
}

export function ScheduleCalendar({ schedules, mode, onModeChange, cursor, onNavigate, today, onCreate, onEdit, onShowDay }: Props) {
  const [year, month] = cursor.split('-').map(Number);
  const week = weekOf(cursor);

  const eventsOf = (date: string) => schedules.filter(s => s.date === date).sort(byTime);

  const title = mode === 'month'
    ? monthTitle(year, month)
    : (() => {
        const [a, b] = [week[0], week[6]];
        const [, am, ad] = a.split('-').map(Number);
        const [by, bm, bd] = b.split('-').map(Number);
        return am === bm ? `${ad} – ${bd} de ${MONTHS[bm - 1].toLowerCase()} ${by}` : `${ad} ${MONTHS[am - 1].slice(0, 3).toLowerCase()} – ${bd} ${MONTHS[bm - 1].slice(0, 3).toLowerCase()} ${by}`;
      })();

  const countInView = mode === 'month'
    ? schedules.filter(s => s.date.startsWith(`${year}-${String(month).padStart(2, '0')}`)).length
    : week.reduce((acc, d) => acc + eventsOf(d).length, 0);

  const iconBtn = 'h-9 w-9 rounded-xl border border-border-soft bg-surface flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-surface-muted transition-colors';

  return (
    <div className="p-4 space-y-4">
      {/* Barra del calendario */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button type="button" className={iconBtn} onClick={() => onNavigate(-1)} aria-label="Anterior"><ChevronLeft size={18} /></button>
          <button type="button" className={iconBtn} onClick={() => onNavigate(1)} aria-label="Siguiente"><ChevronRight size={18} /></button>
          <button
            type="button"
            onClick={() => onNavigate(0)}
            className="h-9 px-4 rounded-xl border border-border-soft bg-surface text-sm font-medium text-text-primary hover:bg-surface-muted transition-colors"
          >
            Hoy
          </button>
          <h3 className="text-lg font-semibold text-text-primary ml-2 min-w-[11rem]">{title}</h3>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-text-secondary hidden md:inline">{countInView} {countInView === 1 ? 'cita' : 'citas'}</span>
          <div className="flex bg-surface-muted p-1 rounded-xl border border-border-soft">
            {([['month', 'Mes'], ['week', 'Semana']] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => onModeChange(id)}
                className={`px-4 h-8 rounded-lg text-sm font-medium transition-colors ${
                  mode === id ? 'bg-surface shadow-sm text-text-primary' : 'text-text-muted hover:text-text-primary'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {mode === 'month' ? (
        <div className="border border-border-soft rounded-xl overflow-hidden bg-surface">
          <div className="grid grid-cols-7 bg-surface-muted/60 border-b border-border-soft">
            {WEEKDAYS_SHORT.map(d => (
              <div key={d} className="py-2.5 text-center text-xs font-semibold text-text-secondary uppercase tracking-wider">{d}</div>
            ))}
          </div>
          {monthGrid(year, month).map((weekDays, wi) => (
            <div key={wi} className="grid grid-cols-7">
              {weekDays.map((date, di) => {
                const inMonth = Number(date.split('-')[1]) === month;
                const isToday = date === today;
                const isPast = date < today;
                const events = eventsOf(date);
                const shown = events.slice(0, 3);
                return (
                  <div
                    key={date}
                    onClick={() => !isPast && onCreate(date)}
                    className={`group relative min-h-[120px] p-2 border-b border-r border-border-soft last:border-r-0 flex flex-col gap-1 transition-colors ${
                      !inMonth ? 'bg-surface-muted/40' : di >= 5 ? 'bg-surface-muted/20' : 'bg-surface'
                    } ${isPast ? 'cursor-default' : 'cursor-pointer hover:bg-active-tint/40'}`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`inline-flex items-center justify-center text-sm font-medium h-7 min-w-7 px-1 rounded-full ${
                          isToday ? 'bg-primary-accent text-white font-semibold' : inMonth ? 'text-text-primary' : 'text-text-muted'
                        }`}
                      >
                        {Number(date.split('-')[2])}
                      </span>
                      {!isPast && (
                        <Plus size={14} className="text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                      )}
                    </div>
                    {shown.map(s => <EventChip key={s.id} s={s} onEdit={onEdit} />)}
                    {events.length > 3 && (
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); onShowDay(date); }}
                        className="text-xs font-medium text-primary-accent hover:underline text-left px-1"
                      >
                        +{events.length - 3} más
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-7 border border-border-soft rounded-xl overflow-hidden bg-surface">
          {week.map((date, di) => {
            const isToday = date === today;
            const isPast = date < today;
            const events = eventsOf(date);
            return (
              <div key={date} className={`flex flex-col border-b md:border-b-0 md:border-r border-border-soft last:border-r-0 ${di >= 5 ? 'bg-surface-muted/20' : ''}`}>
                <div className={`flex items-center justify-between px-3 py-2.5 border-b border-border-soft ${isToday ? 'bg-active-tint' : 'bg-surface-muted/60'}`}>
                  <div>
                    <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider">{WEEKDAYS_SHORT[di]}</p>
                    <p className={`text-lg font-semibold leading-tight ${isToday ? 'text-primary-accent' : 'text-text-primary'}`}>{Number(date.split('-')[2])}</p>
                  </div>
                  {!isPast && (
                    <button
                      type="button"
                      onClick={() => onCreate(date)}
                      className="h-7 w-7 rounded-lg flex items-center justify-center text-text-muted hover:text-primary-accent hover:bg-surface transition-colors"
                      title={`Nueva reserva el ${longDayLabel(date)}`}
                    >
                      <Plus size={16} />
                    </button>
                  )}
                </div>
                <div className="p-2 space-y-2 min-h-[260px]">
                  {events.length === 0 && <p className="text-xs text-text-muted text-center pt-4">Sin citas</p>}
                  {events.map(s => {
                    const tone = statusTone(s.status);
                    const dead = s.status === 'Cancelado' || s.status === 'No reservó';
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => onEdit(s)}
                        className={`w-full text-left p-2.5 rounded-xl border space-y-0.5 transition-shadow hover:shadow-sm ${TONE[tone]} ${dead ? 'opacity-70' : ''}`}
                      >
                        <p className="text-xs font-semibold">{s.time} – {endTime(s.time, s.duration)}</p>
                        <p className={`text-sm font-semibold text-text-primary ${dead ? 'line-through' : ''}`}>{s.student}</p>
                        <p className="text-xs">{s.program} · {s.level}</p>
                        <p className="text-xs">{s.type} · {s.modality}</p>
                        <p className="text-xs">{s.responsible}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Leyenda */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1">
        {LEGEND.map(l => (
          <span key={l} className="flex items-center gap-2 text-sm text-text-secondary">
            <span className={`w-2.5 h-2.5 rounded-full ${DOT[statusTone(l)]}`} />
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}
