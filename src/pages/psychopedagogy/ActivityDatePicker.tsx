import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays } from 'lucide-react';
import { MONTHS, WEEKDAYS_SHORT, longDayLabel, monthGrid, weekdayIndex } from '../../utils/schedule';

interface Props {
  /** Fecha elegida (YYYY-MM-DD) o vacío. */
  value: string;
  onChange: (iso: string) => void;
  /** Mes (nombre) y año del cronograma: solo se pueden elegir días de ese mes. */
  mes: string;
  anio: number;
  /** Los días anteriores a esta fecha no se pueden elegir. */
  minDate: string;
}

/**
 * Selector de fecha de una actividad: solo muestra el mes del cronograma y deja los domingos (sin atención)
 * y los días pasados bloqueados.
 */
export function ActivityDatePicker({ value, onChange, mes, anio, minDate }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const month = MONTHS.indexOf(mes) + 1;

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    };
    const dismiss = () => setOpen(false);
    document.addEventListener('mousedown', close);
    window.addEventListener('resize', dismiss);
    window.addEventListener('scroll', dismiss, true);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('scroll', dismiss, true);
    };
  }, [open]);

  const toggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const width = 288;
      setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)) });
    }
    setOpen(o => !o);
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-left flex items-center justify-between gap-2 focus:outline-none focus:border-primary-accent"
      >
        <span className={value ? 'text-text-primary' : 'text-text-muted'}>{value ? longDayLabel(value) : 'Seleccionar fecha'}</span>
        <CalendarDays size={16} className="text-text-muted shrink-0" />
      </button>
      {open && createPortal(
        <div
          ref={popRef}
          style={{ top: pos.top, left: pos.left }}
          className="fixed z-[100] w-72 bg-surface border border-border-soft rounded-xl shadow-lg p-3"
        >
          <p className="text-sm font-semibold text-text-primary text-center mb-2">{mes} {anio}</p>
          <div className="grid grid-cols-7 gap-1 text-center">
            {WEEKDAYS_SHORT.map(d => <span key={d} className="text-[11px] font-semibold text-text-muted uppercase py-1">{d}</span>)}
            {month > 0 && monthGrid(anio, month).flat().map(date => {
              const inMonth = Number(date.split('-')[1]) === month;
              if (!inMonth) return <span key={date} />;
              const sunday = weekdayIndex(date) === 6;
              const past = date < minDate;
              const blocked = sunday || past;
              const selected = date === value;
              return (
                <button
                  key={date}
                  type="button"
                  disabled={blocked}
                  title={sunday ? 'Domingo: sin atención' : past ? 'Fecha pasada' : undefined}
                  onClick={() => { onChange(date); setOpen(false); }}
                  className={`h-9 rounded-lg text-sm transition-colors ${
                    selected
                      ? 'bg-primary-accent text-white font-semibold'
                      : blocked
                        ? 'text-text-muted/50 bg-surface-muted/60 cursor-not-allowed line-through'
                        : 'text-text-primary hover:bg-active-tint'
                  }`}
                >
                  {Number(date.split('-')[2])}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-text-muted mt-2">Los domingos no hay atención.</p>
        </div>,
        document.body
      )}
    </>
  );
}
