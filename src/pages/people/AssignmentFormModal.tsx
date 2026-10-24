import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Info } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { DateInput } from '../../components/ui/DateInput';
import { Modal } from '../../components/ui/Modal';
import { useData, type Assignment } from '../../context/DataContext';
import { todayLocalISO } from '../../utils/schedule';
import { INTERVIEWER_AREA } from '../../utils/enrollment';
import {
  AREAS,
  SYSTEM_ROLES,
  assignmentToForm,
  emptyAssignmentForm,
  mainToDemote,
  validateAssignmentForm,
  willBeMain,
  type AssignmentForm,
} from '../../utils/assignments';
import { Field, errorCls, inputCls } from '../enrollment/fields';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Asignación a editar; `null` para crear una nueva. */
  editing: Assignment | null;
  /** Trabajador con el que empieza el formulario (al venir desde Personal). */
  presetStaffId?: string;
}

const textareaCls = 'w-full bg-surface border border-border-soft rounded-xl p-3 text-sm focus:outline-none focus:border-primary-accent resize-none';

/**
 * Nueva asignación o edición de una activa. De las asignaciones salen los responsables de entrevista y asesorías (área
 * Psicopedagogía) y los verificadores de cada sede. Cada trabajador tiene UNA principal.
 */
export function AssignmentFormModal({ isOpen, onClose, editing, presetStaffId }: Props) {
  const { staff, assignments, branches, saveAssignment } = useData();
  const today = todayLocalISO();
  const [form, setForm] = useState<AssignmentForm>(emptyAssignmentForm(today));
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setForm(editing ? assignmentToForm(editing) : { ...emptyAssignmentForm(today), staffId: presetStaffId ?? '' });
    setSubmitted(false);
    setServerError(null);
  }, [isOpen, editing, presetStaffId, today]);

  const errors = useMemo(() => validateAssignmentForm(form, assignments, staff, branches, today, editing?.id), [form, assignments, staff, branches, today, editing?.id]);
  const set = (patch: Partial<AssignmentForm>) => { setForm(f => ({ ...f, ...patch })); setServerError(null); };
  const err = (k: keyof AssignmentForm) => (submitted ? errors[k] : undefined);
  const cls = (k: keyof AssignmentForm) => `${inputCls} ${err(k) ? errorCls : ''}`;

  const demoted = form.staffId ? mainToDemote(form, assignments, editing?.id) : undefined;
  const forcedMain = !!form.staffId && !form.isMain && willBeMain(form, assignments, editing?.id);
  const count = Object.keys(errors).length;
  const isInterviewerArea = form.area === INTERVIEWER_AREA;

  const handleSave = () => {
    setSubmitted(true);
    if (count > 0) return;
    const r = saveAssignment(form, editing?.id);
    if (!r.ok) { setServerError(r.error ?? 'No se pudo guardar la asignación.'); return; }
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editing ? 'Editar asignación' : 'Nueva asignación'}
      size="2xl"
      footer={
        <div className="flex justify-end gap-3 w-full">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={handleSave}>{editing ? 'Guardar cambios' : 'Guardar asignación'}</Button>
        </div>
      }
    >
      <div className="space-y-5 pb-2">
        {(serverError || (submitted && count > 0)) && (
          <div className="bg-danger-tint border border-danger-text/20 rounded-xl p-3 flex gap-2 text-sm text-danger-text">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <p>{serverError ?? `Revise ${count} ${count === 1 ? 'campo marcado' : 'campos marcados'} antes de guardar.`}</p>
          </div>
        )}

        <Field label="Trabajador" required error={err('staffId')} hint={editing ? 'El trabajador de una asignación no se cambia: cierre esta y cree otra.' : undefined}>
          <select className={cls('staffId')} value={form.staffId} disabled={!!editing} onChange={e => set({ staffId: e.target.value })}>
            <option value="">Seleccionar trabajador...</option>
            {staff.filter(s => s.status === 'Activo' || s.id === form.staffId).map(s => (
              <option key={s.id} value={s.id}>{s.names} {s.lastNameP} {s.lastNameM}</option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="Sede" required error={err('branch')}>
            <select className={cls('branch')} value={form.branch} onChange={e => set({ branch: e.target.value })}>
              <option value="">Seleccionar sede...</option>
              {branches.filter(b => b.status === 'Activo' || b.name === form.branch).map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
            </select>
          </Field>
          <Field label="Área" required error={err('area')}>
            <select className={cls('area')} value={form.area} onChange={e => set({ area: e.target.value })}>
              <option value="">Seleccionar área...</option>
              {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </Field>
          <Field label="Cargo" required error={err('role')}>
            <input type="text" className={cls('role')} value={form.role} maxLength={60} onChange={e => set({ role: e.target.value })} placeholder="Ej: Psicólogo Senior" />
          </Field>
          <Field label="Rol del sistema" required error={err('systemRole')}>
            <select className={cls('systemRole')} value={form.systemRole} onChange={e => set({ systemRole: e.target.value })}>
              <option value="">Seleccionar rol...</option>
              {SYSTEM_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="Fecha de inicio" required error={err('startDate')}>
            <DateInput value={form.startDate} onChange={e => set({ startDate: e.target.value })} />
          </Field>
          <Field label="Fecha de fin (opcional)" error={err('endDate')} hint="Solo si la asignación tiene un término previsto.">
            <DateInput min={form.startDate || undefined} value={form.endDate} onChange={e => set({ endDate: e.target.value })} />
          </Field>
        </div>

        <div className="p-4 bg-surface-muted rounded-xl border border-border-soft">
          <label className="flex items-start justify-between gap-4 cursor-pointer">
            <span>
              <span className="block text-sm font-medium text-text-primary">Asignación principal</span>
              <span className="block text-xs text-text-secondary">Es la sede y el cargo base del trabajador (lo que se ve en la lista de Personal).</span>
            </span>
            <input
              type="checkbox"
              className="w-5 h-5 accent-primary-accent mt-0.5"
              checked={form.isMain || forcedMain}
              disabled={forcedMain}
              onChange={e => set({ isMain: e.target.checked })}
            />
          </label>
          {err('isMain') && <p className="text-xs text-danger-text mt-2">{err('isMain')}</p>}
          {forcedMain && <p className="text-xs text-text-muted mt-2">Será la principal porque es la única asignación activa de este trabajador.</p>}
          {demoted && <p className="text-xs text-warning-text mt-2">Al guardar, «{demoted.role} · {demoted.branch}» dejará de ser la principal.</p>}
        </div>

        {isInterviewerArea && (
          <div className="flex gap-2 text-xs text-text-secondary bg-info-tint rounded-xl p-3">
            <Info size={14} className="shrink-0 mt-0.5 text-info-text" />
            <p>Con esta asignación activa, el trabajador aparecerá como responsable de entrevistas y de asesorías en Matrículas y Psicopedagogía.</p>
          </div>
        )}

        <Field label="Observaciones">
          <textarea className={`${textareaCls} h-20`} value={form.observations} onChange={e => set({ observations: e.target.value })} placeholder="Detalles adicionales de la asignación..." />
        </Field>
      </div>
    </Modal>
  );
}
