import React from 'react';
import { getInterviewerOptions } from '../../utils/enrollment';
import { Field, StepHeader, inputCls } from './fields';
import { STEPS, type StepProps } from './types';

interface Props extends StepProps {
  /** Si la sesión pertenece a una sede, no se puede cambiar. */
  lockedBranchId: string;
  onContextChange: (patch: Partial<StepProps['draft']['context']>) => void;
}

export function StepContext({ draft, catalogs, today, lockedBranchId, onContextChange }: Props) {
  const x = draft.context;
  const interviewers = getInterviewerOptions(catalogs, x.branchId);
  const branches = catalogs.branches.filter(b => b.status === 'Activo' || b.id === x.branchId);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
      <StepHeader title={STEPS[0].title} subtitle={STEPS[0].subtitle} />
      <div className="grid grid-cols-2 gap-4">
        <Field
          label="Sede"
          required
          hint={lockedBranchId ? 'Definida por tu sesión.' : 'Como Superadmin puedes registrar en nombre de una sede.'}
        >
          <select
            className={inputCls}
            value={x.branchId}
            disabled={!!lockedBranchId}
            onChange={e => onContextChange({ branchId: e.target.value })}
          >
            <option value="">Seleccionar sede...</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Field>
        <Field label="Fecha de matrícula" required hint="No puede ser futura. La fecha y hora de registro se guardan automáticamente.">
          <input type="date" max={today} className={inputCls} value={x.date} onChange={e => onContextChange({ date: e.target.value })} />
        </Field>
        <Field label="Origen del contacto" required className="col-span-2">
          <select className={inputCls} value={x.leadSourceId} onChange={e => onContextChange({ leadSourceId: e.target.value })}>
            <option value="">Seleccionar origen...</option>
            {catalogs.leadSources.filter(s => s.status === 'active').map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field
          label="Responsable de la entrevista"
          required
          className="col-span-2"
          hint={
            interviewers.length === 0
              ? 'No hay personal activo asignado al área de Psicopedagogía. Regístrelo en Personas → Asignaciones.'
              : 'Todo el personal activo asignado a Psicopedagogía; primero el de la sede elegida.'
          }
        >
          <select
            className={inputCls}
            value={x.interviewerId}
            onChange={e => onContextChange({ interviewerId: e.target.value })}
          >
            <option value="">Seleccionar responsable...</option>
            {interviewers.map(o => (
              <option key={o.staff.id} value={o.staff.id}>
                {o.staff.names} {o.staff.lastNameP} {o.staff.lastNameM} — {o.branchName}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Observación general" className="col-span-2">
          <textarea
            className="w-full h-24 bg-surface border border-border-soft rounded-xl p-3 text-sm focus:border-primary-accent outline-none resize-none"
            placeholder="Opcional..."
            value={x.observation}
            onChange={e => onContextChange({ observation: e.target.value })}
          />
        </Field>
      </div>
    </div>
  );
}
