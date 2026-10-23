import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Lock } from 'lucide-react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { useData } from '../../context/DataContext';
import { getAvailableSchedules, getInterviewerOptions } from '../../utils/enrollment';
import { EDIT_LABELS, currentEditValues, diffEnrollmentEdit, type EnrollmentEditValues } from '../../utils/enrollmentEdit';
import { Field, inputCls } from '../../pages/enrollment/fields';

interface Props {
  /** Matrícula cuyos datos administrativos se corrigen; `null` cierra la ventana. */
  enrollmentId: string | null;
  onClose: () => void;
}

const usd = (n?: number) => (n == null ? '—' : `USD ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

/**
 * Corregir datos de una matrícula registrada. Solo los datos administrativos (observación, origen, responsable de la entrevista
 * y horario de clases), con motivo y constancia. El resto tiene su propio camino y aquí se muestra bloqueado con el porqué.
 */
export function EditEnrollmentModal({ enrollmentId, onClose }: Props) {
  const data = useData();
  const enrollment = data.enrollments.find(e => e.id === enrollmentId);
  const student = enrollment ? data.students.find(s => s.id === enrollment.studentId) ?? data.students.find(s => s.name === enrollment.student) : undefined;
  const [values, setValues] = useState<EnrollmentEditValues>({ observation: '', originId: '', advisorId: '', schedule: '' });
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enrollment) return;
    setValues(currentEditValues(enrollment, student));
    setReason('');
    setError(null);
  }, [enrollmentId]);

  const branchId = enrollment?.branchId ?? '';
  const advisors = useMemo(() => getInterviewerOptions({ staff: data.staff, assignments: data.assignments, branches: data.branches }, branchId), [data.staff, data.assignments, data.branches, branchId]);
  const schedules = useMemo(() => getAvailableSchedules(data.classSchedules, branchId), [data.classSchedules, branchId]);

  const names = useMemo(() => ({
    origin: (id: string) => data.leadSources.find(l => l.id === id)?.name ?? '',
    advisor: (id: string) => { const m = data.staff.find(x => x.id === id); return m ? `${m.names} ${m.lastNameP}`.trim() : ''; },
  }), [data.leadSources, data.staff]);

  if (!enrollment) return null;
  const changes = diffEnrollmentEdit(currentEditValues(enrollment, student), values, names);
  const set = (patch: Partial<EnrollmentEditValues>) => { setValues(v => ({ ...v, ...patch })); setError(null); };
  const advisorOptions = values.advisorId && !advisors.some(a => String(a.staff.id) === values.advisorId)
    ? [{ id: values.advisorId, label: names.advisor(values.advisorId) || values.advisorId }, ...advisors.map(a => ({ id: a.staff.id, label: `${a.staff.names} ${a.staff.lastNameP} — ${a.branchName}` }))]
    : advisors.map(a => ({ id: a.staff.id, label: `${a.staff.names} ${a.staff.lastNameP} — ${a.branchName}` }));

  const handleSave = () => {
    const r = data.updateEnrollmentData(enrollment.id, values, reason);
    if (!r.ok) { setError(r.error ?? 'No se pudo guardar.'); return; }
    onClose();
  };

  const locked: [string, string, string][] = [
    ['Alumno y titulares', `${enrollment.student}`, 'Se corrigen en Personas → Alumnos / Titulares, una sola vez para todas sus matrículas.'],
    ['Programa y nivel', `${enrollment.program}${enrollment.level ? ` - ${enrollment.level}` : ''}`, 'Cambia el precio, el plan y los materiales: se hará con un flujo propio de cambio de programa (aún no existe).'],
    ['Tarifario, tipo de pago y precio', `${enrollment.paymentTypeName ?? '—'} · ${usd(enrollment.assignedPrice)}`, 'Afecta cuotas y caja. Una cuota se puede refinanciar desde Planes y cartera.'],
    ['Sede', enrollment.sede ?? '—', 'Un traslado de sede mueve stock, caja y agenda: requiere su propio flujo (aún no existe).'],
  ];

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Corregir datos · ${enrollment.id}`}
      size="3xl"
      footer={
        <div className="flex justify-end gap-3 w-full">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={handleSave}>Guardar corrección</Button>
        </div>
      }
    >
      <div className="space-y-6 pb-2">
        {error && (
          <div className="bg-danger-tint border border-danger-text/20 rounded-xl p-3 flex gap-2 text-sm text-danger-text">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <p>{error}</p>
          </div>
        )}

        <section className="space-y-3">
          <h4 className="text-sm font-bold text-text-primary uppercase tracking-wider">Datos que se pueden corregir</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Field label={EDIT_LABELS.originId} required>
              <select className={inputCls} value={values.originId} onChange={e => set({ originId: e.target.value })}>
                <option value="">Seleccionar...</option>
                {data.leadSources.filter(l => l.status === 'active' || l.id === values.originId).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </Field>
            <Field label={EDIT_LABELS.advisorId} required>
              <select className={inputCls} value={values.advisorId} onChange={e => set({ advisorId: e.target.value })}>
                <option value="">Seleccionar...</option>
                {advisorOptions.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
            </Field>
            <Field label={EDIT_LABELS.schedule} hint="Se guarda en la ficha del alumno.">
              <select className={inputCls} value={values.schedule} onChange={e => set({ schedule: e.target.value })}>
                <option value="">Sin horario</option>
                {values.schedule && !schedules.some(h => h.name === values.schedule) && <option value={values.schedule}>{values.schedule}</option>}
                {schedules.map(h => <option key={h.id} value={h.name}>{h.name}</option>)}
              </select>
            </Field>
            <Field label={EDIT_LABELS.observation} className="md:col-span-2">
              <textarea
                className="w-full h-20 bg-surface border border-border-soft rounded-xl p-3 text-sm focus:outline-none focus:border-primary-accent resize-none"
                value={values.observation}
                onChange={e => set({ observation: e.target.value })}
              />
            </Field>
          </div>
        </section>

        {changes.length > 0 && (
          <section className="space-y-3">
            <h4 className="text-sm font-bold text-text-primary uppercase tracking-wider">Cambios a registrar</h4>
            <div className="border border-border-soft rounded-xl divide-y divide-border-soft overflow-hidden text-sm">
              {changes.map(c => (
                <div key={c.field} className="flex gap-4 px-4 py-2">
                  <span className="w-48 shrink-0 font-medium text-text-secondary">{c.label}</span>
                  <span className="text-text-muted line-through">{c.from}</span>
                  <span className="text-text-primary">→ {c.to}</span>
                </div>
              ))}
            </div>
            <Field label="Motivo de la corrección" required hint="Queda como constancia: quién, cuándo, qué había y qué quedó.">
              <input className={inputCls} value={reason} onChange={e => { setReason(e.target.value); setError(null); }} placeholder="Ej: Se registró mal el origen al matricular" />
            </Field>
          </section>
        )}

        <section className="space-y-3 border-t border-border-soft pt-5">
          <h4 className="flex items-center gap-2 text-sm font-bold text-text-primary uppercase tracking-wider"><Lock size={14} /> Datos que no se editan aquí</h4>
          <div className="border border-border-soft rounded-xl divide-y divide-border-soft overflow-hidden text-sm bg-surface-muted/40">
            {locked.map(([title, value, why]) => (
              <div key={title} className="px-4 py-2.5">
                <p><span className="font-medium text-text-primary">{title}:</span> <span className="text-text-secondary">{value}</span></p>
                <p className="text-xs text-text-muted">{why}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </Modal>
  );
}
