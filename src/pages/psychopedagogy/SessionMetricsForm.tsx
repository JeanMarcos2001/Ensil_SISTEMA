import React from 'react';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { inputCls, labelCls, selectCls } from './formStyles';

interface Props {
  /** Programa del alumno (la parte anterior a « - » si viene con nivel). */
  program: string;
  metrics: Record<string, any>;
  onChange: (metrics: Record<string, any>) => void;
}

/** Métricas de la sesión según el programa del alumno. */
export function SessionMetricsForm({ program: rawProgram, metrics, onChange }: Props) {
  const program = rawProgram.split(' - ')[0];
  const setMetric = (key: string, value: string) => onChange({ ...metrics, [key]: value });

  if (program === 'Especialización' || program === 'Teens') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 bg-surface-50 rounded-xl border border-border-soft">
        <div>
          <label className={labelCls}>Módulo</label>
          <Input className={inputCls} 
            placeholder="Ej. Módulo 4" 
            value={metrics.modulo || ''}
            onChange={(e) => setMetric('modulo', e.target.value)}
          />
        </div>
        <div>
          <label className={labelCls}>Velocidad (pxm)</label>
          <Input className={inputCls} 
            type="number" 
            placeholder="0" 
            value={metrics.velocidad || ''}
            onChange={(e) => setMetric('velocidad', e.target.value)}
          />
        </div>
        <div>
          <label className={labelCls}>Comprensión (%)</label>
          <Input className={inputCls} 
            type="number" 
            placeholder="0-100" 
            min="0" max="100"
            value={metrics.comprension || ''}
            onChange={(e) => setMetric('comprension', e.target.value)}
          />
        </div>
      </div>
    );
  }

  if (program === 'Kids') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-4 bg-surface-50 rounded-xl border border-border-soft">
        <div>
          <label className={labelCls}>Nivel</label>
          <Input className={inputCls} 
            placeholder="Ej. Nivel 2" 
            value={metrics.nivel || ''}
            onChange={(e) => setMetric('nivel', e.target.value)}
          />
        </div>
        <div>
          <label className={labelCls}>Sesión</label>
          <Input className={inputCls} 
            placeholder="Ej. Sesión 5" 
            value={metrics.sesion || ''}
            onChange={(e) => setMetric('sesion', e.target.value)}
          />
        </div>
        <div>
          <label className={labelCls}>Velocidad (pxm)</label>
          <Input className={inputCls} 
            type="number" 
            placeholder="0" 
            value={metrics.velocidad || ''}
            onChange={(e) => setMetric('velocidad', e.target.value)}
          />
        </div>
        <div>
          <label className={labelCls}>Comprensión (%)</label>
          <Input className={inputCls} 
            type="number" 
            placeholder="0-100" 
            min="0" max="100"
            value={metrics.comprension || ''}
            onChange={(e) => setMetric('comprension', e.target.value)}
          />
        </div>
      </div>
    );
  }

  if (program === 'Pre-Kids') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-4 bg-surface-50 rounded-xl border border-border-soft">
        <div>
          <label className={labelCls}>Nivel</label>
          <Input className={inputCls} 
            placeholder="Ej. Nivel 1" 
            value={metrics.nivel || ''}
            onChange={(e) => setMetric('nivel', e.target.value)}
          />
        </div>
        <div>
          <label className={labelCls}>Semana</label>
          <Input className={inputCls} 
            placeholder="Ej. Semana 3" 
            value={metrics.semana || ''}
            onChange={(e) => setMetric('semana', e.target.value)}
          />
        </div>
        <div>
          <label className={labelCls}>¿Identifica?</label>
          <Select className={selectCls} 
            options={[
              { value: 'Sí', label: 'Sí' },
              { value: 'No', label: 'No' },
              { value: '50%', label: '50%' },
            ]}
            value={metrics.identifica || ''}
            onChange={(e) => setMetric('identifica', e.target.value)}
          />
        </div>
        <div>
          <label className={labelCls}>¿Lee solo?</label>
          <Select className={selectCls} 
            options={[
              { value: 'Sí', label: 'Sí' },
              { value: 'No', label: 'No' },
              { value: '50%', label: '50%' },
            ]}
            value={metrics.leeSolo || ''}
            onChange={(e) => setMetric('leeSolo', e.target.value)}
          />
        </div>
      </div>
    );
  }

  if (program === 'Pre-lectura') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-surface-50 rounded-xl border border-border-soft">
        <div>
          <label className={labelCls}>Sesión / Semana</label>
          <Input className={inputCls} 
            placeholder="Ej. Sesión 2" 
            value={metrics.sesion || ''}
            onChange={(e) => setMetric('sesion', e.target.value)}
          />
        </div>
      </div>
    );
  }

  return null;
}
