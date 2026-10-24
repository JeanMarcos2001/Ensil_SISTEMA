import React from 'react';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { inputCls, labelCls, selectCls } from './formStyles';
import { metricsOf, ordinalNumber, type MetricDef } from '../../utils/sessionMetrics';

interface Props {
  /** Programa del alumno (la parte anterior a « - » si viene con nivel). */
  program: string;
  metrics: Record<string, any>;
  onChange: (metrics: Record<string, any>) => void;
  /** Niveles del programa (para elegir el nivel de la sesión). */
  levels?: string[];
}

const hint = (def: MetricDef) => {
  if (def.kind === 'numero' || def.kind === 'ordinal') {
    const range = def.min !== undefined && def.max !== undefined ? `${def.min} a ${def.max}` : '';
    const usual = def.usual ? ` · habitual ${def.usual[0]} a ${def.usual[1]}` : '';
    return `${range}${usual}`;
  }
  return '';
};

/**
 * Métricas de la sesión: los campos salen de la definición del programa (`utils/sessionMetrics.ts`), la misma que usa
 * la validación, así que el formulario y las reglas no se desacuerdan.
 */
export function SessionMetricsForm({ program, metrics, onChange, levels = [] }: Props) {
  const defs = metricsOf(program);
  const setMetric = (key: string, value: string) => onChange({ ...metrics, [key]: value });
  if (defs.length === 0) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-4 bg-surface-50 rounded-xl border border-border-soft">
      {defs.map(def => {
        const label = <label className={labelCls}>{def.label}{def.unit ? ` (${def.unit})` : ''}{def.required && <span className="text-error"> *</span>}</label>;
        const note = hint(def);
        if (def.kind === 'opcion') {
          return (
            <div key={def.key}>
              {label}
              <Select className={selectCls} options={(def.options ?? []).map(o => ({ value: o, label: o }))} value={metrics[def.key] || ''} onChange={e => setMetric(def.key, e.target.value)} />
            </div>
          );
        }
        if (def.kind === 'nivel') {
          return (
            <div key={def.key}>
              {label}
              {levels.length > 0 ? (
                <Select className={selectCls} options={levels.map(l => ({ value: l, label: l }))} value={metrics[def.key] || ''} onChange={e => setMetric(def.key, e.target.value)} />
              ) : (
                <Input className={inputCls} placeholder="Ej. Nivel 2" value={metrics[def.key] || ''} onChange={e => setMetric(def.key, e.target.value)} />
              )}
            </div>
          );
        }
        const shown = def.kind === 'ordinal' ? (ordinalNumber(metrics[def.key]) ?? '') : (metrics[def.key] ?? '');
        return (
          <div key={def.key}>
            {label}
            <Input
              className={inputCls}
              type="number"
              inputMode={def.integer ? 'numeric' : 'decimal'}
              step={def.integer ? 1 : 'any'}
              min={def.min}
              max={def.max}
              placeholder={def.placeholder}
              value={shown}
              onChange={e => setMetric(def.key, e.target.value)}
            />
            {note && <p className="text-[11px] text-text-muted mt-1">{note}</p>}
          </div>
        );
      })}
    </div>
  );
}
