import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const WEEKDAYS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const parse = (s: string) => { const [y, m, d] = s.split('-').map(Number); return { y, m, d }; };
const isISO = (s?: string): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
const todayISO = () => { const t = new Date(); return iso(t.getFullYear(), t.getMonth() + 1, t.getDate()); };
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
/** 0 = lunes … 6 = domingo. */
const weekday = (y: number, m: number, d: number) => (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;

/** «20 oct 2026» */
export const formatDateShort = (value: string) => {
  if (!isISO(value)) return '';
  const { y, m, d } = parse(value);
  return `${d} ${MONTHS[m - 1].slice(0, 3).toLowerCase()} ${y}`;
};

export interface DateChangeEvent {
  target: { value: string; name?: string };
  currentTarget: { value: string; name?: string };
}

export interface DateInputProps {
  value?: string;
  defaultValue?: string;
  /** Recibe un evento con `target.value` (YYYY-MM-DD o vacío), igual que un `<input type="date">`. */
  onChange?: (e: DateChangeEvent) => void;
  /** Fecha mínima y máxima elegibles (YYYY-MM-DD). */
  min?: string;
  max?: string;
  name?: string;
  id?: string;
  required?: boolean;
  disabled?: boolean;
  /** Se acepta por compatibilidad con `<input>`; el aspecto es siempre el del sistema. */
  className?: string;
  placeholder?: string;
  /** Días no elegibles (p. ej. domingos). Se muestran tachados. */
  isDateDisabled?: (iso: string) => boolean;
  /** Muestra solo ese mes (sin navegación). */
  lockMonth?: { year: number; month: number };
  'aria-label'?: string;
}

/**
 * Selector de fecha del sistema (reemplaza al `<input type="date">` del navegador): calendario con mes y año
 * elegibles, días no disponibles tachados, «Hoy» y «Borrar». Mismo formato en todas las pantallas.
 */
export function DateInput({
  value, defaultValue, onChange, min, max, name, id, required, disabled, className: _className, placeholder = 'Seleccionar fecha', isDateDisabled, lockMonth, ...rest
}: DateInputProps) {
  const controlled = value !== undefined;
  const [inner, setInner] = useState(defaultValue ?? '');
  const current = (controlled ? value : inner) ?? '';
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number }>({ left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const today = todayISO();
  const base = isISO(current) ? parse(current) : parse(isISO(min) && today < min ? min : isISO(max) && today > max ? max : today);
  const [view, setView] = useState({ y: lockMonth?.year ?? base.y, m: lockMonth?.month ?? base.m });

  // Al abrir, el calendario muestra el mes de la fecha elegida
  useEffect(() => {
    if (!open) return;
    setView({ y: lockMonth?.year ?? base.y, m: lockMonth?.month ?? base.m });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const outside = (e: Event) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    // Al desplazar o redimensionar, el calendario sigue al campo (y se cierra si el campo sale de la vista)
    const follow = (e: Event) => {
      if (popRef.current?.contains(e.target as Node)) return;
      const r = btnRef.current?.getBoundingClientRect();
      if (!r || r.bottom < 0 || r.top > window.innerHeight) { setOpen(false); return; }
      place();
    };
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', esc);
    window.addEventListener('resize', follow);
    window.addEventListener('scroll', follow, true);
    return () => {
      document.removeEventListener('mousedown', outside);
      document.removeEventListener('keydown', esc);
      window.removeEventListener('resize', follow);
      window.removeEventListener('scroll', follow, true);
    };
  }, [open]);

  /** Coloca el calendario junto al campo (debajo; si no cabe, arriba). */
  const place = () => {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const width = 304, height = 372;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    setPos(window.innerHeight - r.bottom < height + 12 && r.top > height ? { bottom: window.innerHeight - r.top + 6, left } : { top: r.bottom + 6, left });
  };

  const toggle = () => {
    if (disabled) return;
    if (!open) place();
    setOpen(o => !o);
  };

  const emit = (v: string) => {
    if (!controlled) setInner(v);
    onChange?.({ target: { value: v, name }, currentTarget: { value: v, name } });
  };

  const allowed = (d: string) => (!isISO(min) || d >= min) && (!isISO(max) || d <= max) && !isDateDisabled?.(d);
  const clamp = (y: number, m: number) => {
    let yy = y, mm = m;
    if (mm < 1) { mm = 12; yy--; }
    if (mm > 12) { mm = 1; yy++; }
    return { y: yy, m: mm };
  };
  const prev = clamp(view.y, view.m - 1), next = clamp(view.y, view.m + 1);
  const canPrev = !isISO(min) || iso(prev.y, prev.m, daysIn(prev.y, prev.m)) >= min;
  const canNext = !isISO(max) || iso(next.y, next.m, 1) <= max;

  const yearFrom = isISO(min) ? parse(min).y : parseInt(today.slice(0, 4), 10) - 100;
  const yearTo = isISO(max) ? parse(max).y : parseInt(today.slice(0, 4), 10) + 10;
  const years = useMemo(() => Array.from({ length: Math.max(1, yearTo - yearFrom + 1) }, (_, i) => yearFrom + i), [yearFrom, yearTo]);

  const lead = weekday(view.y, view.m, 1);
  const cells = [...Array(lead).fill(null), ...Array.from({ length: daysIn(view.y, view.m) }, (_, i) => i + 1)];

  const selectCls = 'h-8 bg-surface border border-border-soft rounded-lg px-2 text-sm font-medium text-text-primary focus:outline-none focus:border-primary-accent';
  const navBtn = 'h-8 w-8 rounded-lg flex items-center justify-center text-text-secondary hover:bg-surface-muted disabled:opacity-30 disabled:hover:bg-transparent transition-colors';

  return (
    <div className="relative">
      <button
        ref={btnRef}
        id={id}
        type="button"
        disabled={disabled}
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={rest['aria-label']}
        className={`w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-left flex items-center justify-between gap-2 focus:outline-none focus:border-primary-accent disabled:bg-surface-muted disabled:text-text-muted disabled:cursor-not-allowed transition-colors`}
      >
        <span className={`truncate ${current ? 'text-text-primary' : 'text-text-muted'}`}>{current ? formatDateShort(current) : placeholder}</span>
        <CalendarDays size={16} className="text-text-muted shrink-0" />
      </button>
      {name && <input type="hidden" name={name} value={current} />}
      {required && (
        <input tabIndex={-1} aria-hidden="true" required value={current} onChange={() => {}} className="absolute left-0 right-0 bottom-0 h-px opacity-0 pointer-events-none" />
      )}
      {open && createPortal(
        <div
          ref={popRef}
          role="dialog"
          aria-label="Calendario"
          style={{ top: pos.top, bottom: pos.bottom, left: pos.left }}
          className="fixed z-[100] w-[304px] bg-surface border border-border-soft rounded-2xl shadow-xl p-3"
        >
          <div className="flex items-center justify-between gap-1 mb-2">
            {lockMonth ? (
              <p className="flex-1 text-center text-sm font-semibold text-text-primary">{MONTHS[view.m - 1]} {view.y}</p>
            ) : (
              <>
                <button type="button" className={navBtn} disabled={!canPrev} onClick={() => setView(prev)} aria-label="Mes anterior"><ChevronLeft size={16} /></button>
                <div className="flex items-center gap-1.5">
                  <select className={selectCls} value={view.m} onChange={e => setView({ y: view.y, m: Number(e.target.value) })} aria-label="Mes">
                    {MONTHS.map((n, i) => <option key={n} value={i + 1}>{n}</option>)}
                  </select>
                  <select className={selectCls} value={view.y} onChange={e => setView({ y: Number(e.target.value), m: view.m })} aria-label="Año">
                    {years.includes(view.y) ? null : <option value={view.y}>{view.y}</option>}
                    {years.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <button type="button" className={navBtn} disabled={!canNext} onClick={() => setView(next)} aria-label="Mes siguiente"><ChevronRight size={16} /></button>
              </>
            )}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {WEEKDAYS.map(d => <span key={d} className="h-8 flex items-center justify-center text-[11px] font-semibold text-text-muted uppercase">{d}</span>)}
            {cells.map((d, i) => {
              if (d === null) return <span key={`b${i}`} className="h-9" />;
              const date = iso(view.y, view.m, d);
              const ok = allowed(date);
              const selected = date === current;
              const isToday = date === today;
              const struck = !!isDateDisabled?.(date);
              return (
                <button
                  key={date}
                  type="button"
                  disabled={!ok}
                  aria-pressed={selected}
                  onClick={() => { emit(date); setOpen(false); }}
                  className={`h-9 rounded-lg text-sm tabular-nums flex items-center justify-center transition-colors ${
                    selected
                      ? 'bg-primary-accent text-white font-semibold shadow-sm'
                      : !ok
                        ? `text-text-muted/40 cursor-not-allowed ${struck ? 'line-through' : ''}`
                        : `text-text-primary hover:bg-active-tint ${isToday ? 'ring-1 ring-primary-accent/60 font-semibold text-primary-accent' : ''}`
                  }`}
                >
                  {d}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between mt-3 pt-2 border-t border-border-soft">
            <button
              type="button"
              disabled={!allowed(today)}
              onClick={() => { emit(today); setOpen(false); }}
              className="text-sm font-medium text-primary-accent hover:underline disabled:opacity-40 disabled:no-underline"
            >
              Hoy
            </button>
            {!required && current && (
              <button type="button" onClick={() => { emit(''); setOpen(false); }} className="text-sm text-text-secondary hover:text-danger-text hover:underline">
                Borrar
              </button>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
