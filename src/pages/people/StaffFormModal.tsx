import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { DateInput } from '../../components/ui/DateInput';
import { Modal } from '../../components/ui/Modal';
import { useData, type Staff } from '../../context/DataContext';
import { ageOn } from '../../utils/enrollment';
import { todayLocalISO } from '../../utils/schedule';
import {
  CIVIL_STATUSES,
  EDUCATION_LEVELS,
  GENDERS,
  MAX_CHILDREN,
  MIN_STAFF_AGE,
  STAFF_DOC_TYPES,
  buildStaff,
  emptyStaffForm,
  staffToForm,
  validateStaffForm,
  type StaffForm,
} from '../../utils/staff';
import { Field, errorCls, inputCls } from '../enrollment/fields';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Trabajador a editar; `null` para registrar uno nuevo. */
  editing: Staff | null;
}

const textareaCls = 'w-full bg-surface border border-border-soft rounded-xl p-3 text-sm focus:outline-none focus:border-primary-accent resize-none';

/** Alta y edición de un trabajador. No hay correo institucional; los campos con asterisco son obligatorios. */
export function StaffFormModal({ isOpen, onClose, editing }: Props) {
  const { staff, addStaff, updateStaff } = useData();
  const today = todayLocalISO();
  const [form, setForm] = useState<StaffForm>(emptyStaffForm());
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setForm(editing ? staffToForm(editing) : emptyStaffForm());
    setSubmitted(false);
  }, [isOpen, editing]);

  const errors = useMemo(() => validateStaffForm(form, staff, today, editing?.id), [form, staff, today, editing?.id]);
  const set = (patch: Partial<StaffForm>) => setForm(f => ({ ...f, ...patch }));
  const err = (k: keyof StaffForm) => (submitted ? errors[k] : undefined);
  const cls = (k: keyof StaffForm) => `${inputCls} ${err(k) ? errorCls : ''}`;
  const age = form.birthDate ? ageOn(form.birthDate, today) : null;
  const maxBirth = (() => { const [y, m, d] = today.split('-').map(Number); return `${y - MIN_STAFF_AGE}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`; })();

  const handleSave = () => {
    setSubmitted(true);
    if (Object.keys(errors).length > 0) return;
    if (editing) updateStaff(editing.id, buildStaff(form, today, { code: editing.code, status: editing.status }));
    else addStaff(buildStaff(form, today, undefined, staff));
    onClose();
  };

  const count = Object.keys(errors).length;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editing ? 'Editar Trabajador' : 'Nuevo Trabajador'}
      size="4xl"
      footer={
        <div className="flex justify-end gap-3 w-full">
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="button" variant="primary" onClick={handleSave}>Guardar Trabajador</Button>
        </div>
      }
    >
      <div className="space-y-6 pb-4">
        {submitted && count > 0 && (
          <div className="bg-danger-tint border border-danger-text/20 rounded-xl p-3 flex gap-2 text-sm text-danger-text">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <p>Revise {count} {count === 1 ? 'campo marcado' : 'campos marcados'} antes de guardar.</p>
          </div>
        )}

        <section className="space-y-4">
          <h4 className="text-sm font-bold text-text-primary uppercase tracking-wider">Datos personales</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            <Field label="Tipo de documento" required>
              <select className={inputCls} value={form.docType} onChange={e => set({ docType: e.target.value as StaffForm['docType'] })}>
                {STAFF_DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="N° de documento" required hint={form.docType === 'DNI' ? '8 dígitos' : '6 a 12 caracteres'} error={err('docNumber')}>
              <input className={`${cls('docNumber')} font-mono`} value={form.docNumber} maxLength={12} onChange={e => set({ docNumber: e.target.value })} />
            </Field>
            <Field label="Género" required error={err('gender')}>
              <select className={cls('gender')} value={form.gender} onChange={e => set({ gender: e.target.value })}>
                <option value="">Seleccionar...</option>
                {GENDERS.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </Field>
            <Field label="Nombres" required error={err('names')}>
              <input className={cls('names')} value={form.names} onChange={e => set({ names: e.target.value })} placeholder="Ej: Juan Carlos" />
            </Field>
            <Field label="Apellido paterno" required error={err('lastNameP')}>
              <input className={cls('lastNameP')} value={form.lastNameP} onChange={e => set({ lastNameP: e.target.value })} placeholder="Ej: Pérez" />
            </Field>
            <Field label="Apellido materno" error={err('lastNameM')}>
              <input className={cls('lastNameM')} value={form.lastNameM} onChange={e => set({ lastNameM: e.target.value })} placeholder="Ej: García" />
            </Field>
            <Field
              label="Fecha de nacimiento"
              required
              hint={age !== null && age >= 0 ? `Edad: ${age} años` : `Mayor de ${MIN_STAFF_AGE} años`}
              error={err('birthDate')}
            >
              <DateInput max={maxBirth} value={form.birthDate} onChange={e => set({ birthDate: e.target.value })} />
            </Field>
            <Field label="Estado civil" required error={err('civilStatus')}>
              <select className={cls('civilStatus')} value={form.civilStatus} onChange={e => set({ civilStatus: e.target.value })}>
                <option value="">Seleccionar...</option>
                {CIVIL_STATUSES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="¿Tiene hijos?">
                <select
                  className={inputCls}
                  value={form.hasChildren ? 'si' : 'no'}
                  onChange={e => set({ hasChildren: e.target.value === 'si', childrenCount: e.target.value === 'si' ? form.childrenCount : '' })}
                >
                  <option value="no">No</option>
                  <option value="si">Sí</option>
                </select>
              </Field>
              <Field label="N° de hijos" required={form.hasChildren} error={err('childrenCount')}>
                <input
                  type="number"
                  min={1}
                  max={MAX_CHILDREN}
                  className={cls('childrenCount')}
                  disabled={!form.hasChildren}
                  value={form.childrenCount}
                  onChange={e => set({ childrenCount: e.target.value })}
                />
              </Field>
            </div>
          </div>
        </section>

        <section className="space-y-4 border-t border-border-soft pt-6">
          <h4 className="text-sm font-bold text-text-primary uppercase tracking-wider">Contacto</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Field label="Celular" required hint="9 dígitos, empieza con 9" error={err('phone')}>
              <input className={cls('phone')} inputMode="numeric" maxLength={9} value={form.phone} onChange={e => set({ phone: e.target.value.replace(/\D/g, '') })} placeholder="Ej: 987654321" />
            </Field>
            <Field label="Correo personal" error={err('personalEmail')}>
              <input type="email" className={cls('personalEmail')} value={form.personalEmail} onChange={e => set({ personalEmail: e.target.value })} placeholder="Ej: juan@gmail.com" />
            </Field>
            <Field label="Dirección completa" required className="md:col-span-2" error={err('address')}>
              <input className={cls('address')} value={form.address} onChange={e => set({ address: e.target.value })} placeholder="Ej: Av. Las Flores 123, Lima" />
            </Field>
          </div>
        </section>

        <section className="space-y-4 border-t border-border-soft pt-6">
          <h4 className="text-sm font-bold text-text-primary uppercase tracking-wider">Formación académica</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            <Field label="Grado de instrucción" required error={err('educationLevel')}>
              <select className={cls('educationLevel')} value={form.educationLevel} onChange={e => set({ educationLevel: e.target.value })}>
                <option value="">Seleccionar...</option>
                {EDUCATION_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </Field>
            <Field label="Profesión" required error={err('profession')}>
              <input className={cls('profession')} value={form.profession} onChange={e => set({ profession: e.target.value })} placeholder="Ej: Psicólogo" />
            </Field>
            <Field label="Especialidad">
              <input className={inputCls} value={form.specialty} onChange={e => set({ specialty: e.target.value })} placeholder="Ej: Psicología Educativa" />
            </Field>
          </div>
        </section>

        <section className="space-y-2 border-t border-border-soft pt-6">
          <Field label="Observaciones">
            <textarea className={`${textareaCls} h-20`} value={form.observations} onChange={e => set({ observations: e.target.value })} placeholder="Notas internas..." />
          </Field>
        </section>
      </div>
    </Modal>
  );
}
