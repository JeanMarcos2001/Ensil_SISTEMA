import React from 'react';
import {
  INSTITUTION_TYPES,
  SCHOOL_GRADES,
  SITUATIONS,
  studies,
  works,
  type DraftStudent,
  type Situation,
} from '../../utils/enrollment';
import { Field, inputCls } from './fields';

interface Props {
  student: DraftStudent;
  onChange: (patch: Partial<DraftStudent>) => void;
}

/**
 * ¿Qué hace el alumno? Define qué datos se piden:
 *  - Estudiando → tipo de institución, institución y grado (colegio) o ciclo (instituto/universidad).
 *  - Trabajando → ocupación y centro de trabajo.
 *  - Ambos → los dos bloques.
 */
export function StudentSituation({ student: s, onChange }: Props) {
  const isSchool = s.institutionType === 'Colegio';

  return (
    <div className="space-y-4 pt-4 border-t border-border-soft">
      <Field label="Situación del alumno" required hint="Indica si el alumno estudia, trabaja o ambas cosas.">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {SITUATIONS.map(opt => (
            <button
              key={opt.id}
              type="button"
              aria-pressed={s.situation === opt.id}
              onClick={() => onChange({ situation: opt.id as Situation })}
              className={`px-3 py-2 rounded-xl border text-sm font-medium transition-colors text-center ${
                s.situation === opt.id
                  ? 'bg-primary-accent text-white border-primary-accent'
                  : 'bg-surface text-text-secondary border-border-soft hover:border-primary-accent hover:text-primary-accent'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </Field>

      {studies(s) && (
        <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-1">
          <Field label="Tipo de institución" required>
            <select
              className={inputCls}
              value={s.institutionType}
              onChange={e => onChange({ institutionType: e.target.value, grade: '' })}
            >
              <option value="">Seleccionar...</option>
              {INSTITUTION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Colegio / institución" required>
            <input
              className={inputCls}
              value={s.school}
              placeholder={isSchool ? 'Nombre del colegio' : 'Nombre de la institución'}
              onChange={e => onChange({ school: e.target.value })}
            />
          </Field>
          <Field label={isSchool ? 'Grado' : 'Ciclo'} required className="col-span-2">
            {isSchool ? (
              <select className={inputCls} value={s.grade} onChange={e => onChange({ grade: e.target.value })}>
                <option value="">Seleccionar grado...</option>
                {SCHOOL_GRADES.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            ) : (
              <input
                className={inputCls}
                value={s.grade}
                disabled={!s.institutionType}
                placeholder={s.institutionType ? 'Ej. 3.er ciclo' : 'Seleccione primero el tipo de institución'}
                onChange={e => onChange({ grade: e.target.value })}
              />
            )}
          </Field>
        </div>
      )}

      {works(s) && (
        <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-1">
          <Field label="Ocupación" required>
            <input
              className={inputCls}
              value={s.occupation}
              placeholder="Ej. Contador, vendedor…"
              onChange={e => onChange({ occupation: e.target.value })}
            />
          </Field>
          <Field label="Centro de trabajo">
            <input
              className={inputCls}
              value={s.workplace}
              placeholder="Opcional"
              onChange={e => onChange({ workplace: e.target.value })}
            />
          </Field>
        </div>
      )}
    </div>
  );
}
