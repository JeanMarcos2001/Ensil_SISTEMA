import React from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import type { CapacityConfig, Schedule } from '../../context/DataContext';
import {
  ACTIVE_STATUSES,
  MONTHS,
  WEEKDAYS_SHORT,
  capacityFor,
  groupByBlock,
  longDayLabel,
  monthGrid,
  monthTitle,
  rangeLabel,
  slotLabel,
  slotsForDate,
  weekOf,
  type FlatActivity,
} from '../../utils/schedule';

export type CalendarMode = 'month' | 'week';

interface Props {
  /** Asesorías ya filtradas por sede / búsqueda. */
  schedules: Schedule[];
  /** Actividades especiales de los cronogramas (ya filtradas por sede). */
  activities: FlatActivity[];
  capacity: CapacityConfig;
  /** Sede mostrada; vacío = todas (no se compara con el cupo porque cada sede tiene el suyo). */
  branchId: string;
  mode: CalendarMode;
  onModeChange: (m: CalendarMode) => void;
  /** Cualquier fecha del mes / semana que se muestra. */
  cursor: string;
  onNavigate: (dir: -1 | 0 | 1) => void;
  today: string;
  onCreate: (date: string) => void;
  onShowDay: (date: string) => void;
  onShowActivity: (activityId: string) => void;
}

interface Block {
  time: string;
  count: number;
  /** null = sin límite o sin sede elegida. */
  capacity: number | null;
  full: boolean;
  /** Horario de primera asesoría (sin cupo; no se mezcla con asesorías). */
  first: boolean;
  names: string[];
}

const ACTIVITY_CHIP = 'bg-active-tint text-primary-accent border-primary-accent/30';
const OPEN_CHIP = 'bg-info-tint text-info-text border-info-text/30';
const FULL_CHIP = 'bg-warning-tint text-warning-text border-warning-text/30';
const FIRST_CHIP = 'bg-success-tint text-success-text border-success-text/30';
const chipOf = (b: { first: boolean; full: boolean }) => (b.first ? FIRST_CHIP : b.full ? FULL_CHIP : OPEN_CHIP);

export function ScheduleCalendar({
  schedules, activities, capacity, branchId, mode, onModeChange, cursor, onNavigate, today, onCreate, onShowDay, onShowActivity,
}: Props) {
  const [year, month] = cursor.split('-').map(Number);
  const week = weekOf(cursor);

  const activitiesOf = (date: string) => activities.filter(a => a.date === date).sort((a, b) => a.start.localeCompare(b.start));

  /** Horarios del día con alumnos (solo asesorías que ocupan horario), con su cupo si hay una sede elegida. */
  const blocksOf = (date: string): Block[] =>
    groupByBlock(schedules.filter(s => s.date === date && ACTIVE_STATUSES.includes(s.status))).map(g => {
      const first = g.items.some(i => i.isFirst);
      const cap = branchId && !first ? capacityFor(capacity, branchId, date, g.time) : null;
      return { time: g.time, count: g.items.length, capacity: cap, full: cap !== null && g.items.length >= cap, first, names: g.items.map(i => i.student) };
    });

  const blockText = (b: Block) => (b.capacity === null ? `${b.count}` : `${b.count}/${b.capacity}`);

  const title = mode === 'month'
    ? monthTitle(year, month)
    : (() => {
        const [a, b] = [week[0], week[6]];
        const [, am, ad] = a.split('-').map(Number);
        const [by, bm, bd] = b.split('-').map(Number);
        return am === bm ? `${ad} – ${bd} de ${MONTHS[bm - 1].toLowerCase()} ${by}` : `${ad} ${MONTHS[am - 1].slice(0, 3).toLowerCase()} – ${bd} ${MONTHS[bm - 1].slice(0, 3).toLowerCase()} ${by}`;
      })();

  const inView = (d: string) => (mode === 'month' ? d.startsWith(`${year}-${String(month).padStart(2, '0')}`) : week.includes(d));
  const countInView = schedules.filter(s => inView(s.date) && ACTIVE_STATUSES.includes(s.status)).length;

  const iconBtn = 'h-9 w-9 rounded-xl border border-border-soft bg-surface flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-surface-muted transition-colors';

  const ActivityChip = ({ a }: { a: FlatActivity }) => (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onShowActivity(a.id); }}
      title={`${a.name} · ${rangeLabel(a.start, a.end)} · ${a.sede}`}
      className={`w-full text-left px-2 py-1 rounded-lg border text-xs font-medium truncate transition-shadow hover:shadow-sm ${ACTIVITY_CHIP}`}
    >
      <CalendarDays size={11} className="inline -mt-0.5 mr-1" />
      <span className="font-semibold">{a.start}</span> {a.name}
    </button>
  );

  const BlockChip = ({ date, b }: { date: string; b: Block }) => (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onShowDay(date); }}
      title={`${slotLabel(b.time)} · ${b.names.join(', ')}`}
      className={`w-full text-left px-2 py-1 rounded-lg border text-xs font-medium truncate transition-shadow hover:shadow-sm ${chipOf(b)}`}
    >
      <span className="font-semibold">{b.time}</span> · {blockText(b)} {b.count === 1 ? 'alumno' : 'alumnos'}
      {b.first && <span className="ml-1 text-[10px] font-semibold uppercase">1.ª asesoría</span>}
      {b.full && <span className="ml-1 text-[10px] font-semibold uppercase">Lleno</span>}
    </button>
  );

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
          <span className="text-sm text-text-secondary hidden md:inline">{countInView} {countInView === 1 ? 'asesoría' : 'asesorías'}</span>
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
              {weekDays.map(date => {
                const inMonth = Number(date.split('-')[1]) === month;
                const isToday = date === today;
                const closed = slotsForDate(date).length === 0;
                const isPast = date < today || closed;
                const acts = activitiesOf(date);
                const blocks = blocksOf(date);
                const total = acts.length + blocks.length;
                const shownActs = acts.slice(0, 3);
                const shownBlocks = blocks.slice(0, Math.max(0, 3 - shownActs.length));
                return (
                  <div
                    key={date}
                    onClick={() => !isPast && onCreate(date)}
                    className={`group relative min-h-[120px] p-2 border-b border-r border-border-soft last:border-r-0 flex flex-col gap-1 transition-colors ${
                      closed ? 'bg-surface-muted/60' : !inMonth ? 'bg-surface-muted/40' : 'bg-surface'
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
                      {!isPast && <Plus size={14} className="text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />}
                    </div>
                    {closed && total === 0 && inMonth && <span className="text-xs text-text-muted px-1">Sin atención</span>}
                    {shownActs.map(a => <ActivityChip key={a.id} a={a} />)}
                    {shownBlocks.map(b => <BlockChip key={b.time} date={date} b={b} />)}
                    {total > shownActs.length + shownBlocks.length && (
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); onShowDay(date); }}
                        className="text-xs font-medium text-primary-accent hover:underline text-left px-1"
                      >
                        +{total - shownActs.length - shownBlocks.length} más
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
            const closed = slotsForDate(date).length === 0;
            const isPast = date < today || closed;
            const acts = activitiesOf(date);
            const blocks = blocksOf(date);
            return (
              <div key={date} className={`flex flex-col border-b md:border-b-0 md:border-r border-border-soft last:border-r-0 ${closed ? 'bg-surface-muted/50' : ''}`}>
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
                  {acts.length === 0 && blocks.length === 0 && (
                    <p className="text-xs text-text-muted text-center pt-4">{closed ? 'Sin atención' : 'Sin asesorías'}</p>
                  )}
                  {acts.map(a => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => onShowActivity(a.id)}
                      className={`w-full text-left p-2.5 rounded-xl border space-y-0.5 transition-shadow hover:shadow-sm ${ACTIVITY_CHIP}`}
                    >
                      <p className="text-xs font-semibold">{rangeLabel(a.start, a.end)}</p>
                      <p className="text-sm font-semibold text-text-primary">{a.name}</p>
                      <p className="text-xs">{a.enrolled.length} {a.enrolled.length === 1 ? 'inscrito' : 'inscritos'}{a.capacity !== null ? ` de ${a.capacity}` : ''}</p>
                    </button>
                  ))}
                  {blocks.map(b => (
                    <button
                      key={b.time}
                      type="button"
                      onClick={() => onShowDay(date)}
                      className={`w-full text-left p-2.5 rounded-xl border space-y-0.5 transition-shadow hover:shadow-sm ${chipOf(b)}`}
                    >
                      <p className="text-xs font-semibold">{slotLabel(b.time)}{b.first ? ' · Primera asesoría' : ''}</p>
                      <p className="text-sm font-semibold text-text-primary">{blockText(b)} {b.count === 1 ? 'alumno' : 'alumnos'}{b.full ? ' · Lleno' : ''}</p>
                      <p className="text-xs">{b.names.slice(0, 3).join(', ')}{b.names.length > 3 ? ` y ${b.names.length - 3} más` : ''}</p>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Leyenda */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1">
        <span className="flex items-center gap-2 text-sm text-text-secondary"><span className="w-2.5 h-2.5 rounded-full bg-info-text" />Horario con lugar</span>
        <span className="flex items-center gap-2 text-sm text-text-secondary"><span className="w-2.5 h-2.5 rounded-full bg-warning-text" />Horario lleno</span>
        <span className="flex items-center gap-2 text-sm text-text-secondary"><span className="w-2.5 h-2.5 rounded-full bg-success-text" />Primera asesoría (sin cupo)</span>
        <span className="flex items-center gap-2 text-sm text-text-secondary"><span className="w-2.5 h-2.5 rounded-full bg-primary-accent" />Actividad especial (bloquea horarios)</span>
        {!branchId && <span className="text-xs text-text-muted">Elija una sede para ver el cupo de cada horario.</span>}
      </div>
    </div>
  );
}
