import React from 'react';
import { MAX_CAPACITY, MIN_CAPACITY } from '../../utils/schedule';
import { nativeFieldCls } from './formStyles';

interface Props {
  /** null = sin límite. */
  value: number | null;
  onChange: (value: number | null) => void;
  className?: string;
  disabled?: boolean;
}

/** Cupo de alumnos: un número (aumentar / reducir) o «Sin límite». */
export function CapacityInput({ value, onChange, className = '', disabled }: Props) {
  const unlimited = value === null;
  const step = (delta: number) => onChange(Math.min(MAX_CAPACITY, Math.max(MIN_CAPACITY, (value ?? MIN_CAPACITY) + delta)));
  const btn =
    'h-10 w-10 shrink-0 rounded-xl border border-border-soft bg-surface text-lg font-medium text-text-secondary hover:bg-surface-muted disabled:opacity-40 disabled:hover:bg-surface transition-colors';

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className="flex items-center gap-1.5">
        <button type="button" className={btn} disabled={disabled || unlimited || (value ?? 0) <= MIN_CAPACITY} onClick={() => step(-1)} aria-label="Reducir cupo">−</button>
        <input
          type="number"
          min={MIN_CAPACITY}
          max={MAX_CAPACITY}
          disabled={disabled || unlimited}
          value={unlimited ? '' : value}
          placeholder="∞"
          onChange={e => {
            const n = parseInt(e.target.value, 10);
            onChange(Number.isNaN(n) ? MIN_CAPACITY : Math.min(MAX_CAPACITY, Math.max(MIN_CAPACITY, n)));
          }}
          className={`${nativeFieldCls} w-16 text-center disabled:bg-surface-muted`}
          aria-label="Cupo de alumnos"
        />
        <button type="button" className={btn} disabled={disabled || unlimited || (value ?? 0) >= MAX_CAPACITY} onClick={() => step(1)} aria-label="Aumentar cupo">+</button>
      </div>
      <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer select-none">
        <input
          type="checkbox"
          disabled={disabled}
          checked={unlimited}
          onChange={e => onChange(e.target.checked ? null : 6)}
          className="w-4 h-4 text-primary-accent border-border-soft rounded focus:ring-primary-accent"
        />
        Sin límite
      </label>
    </div>
  );
}
