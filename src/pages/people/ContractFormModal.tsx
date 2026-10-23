import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { DateInput } from '../../components/ui/DateInput';
import { Modal } from '../../components/ui/Modal';
import { useData } from '../../context/DataContext';
import { todayLocalISO } from '../../utils/schedule';
import {
  AFP_FUNDS,
  CONTRACT_TYPES,
  MIN_WAGE,
  PENSION_SYSTEMS,
  buildContract,
  emptyContractForm,
  estimateNet,
  hasPension,
  hasVacations,
  needsEndDate,
  validateContractForm,
  type ContractForm,
} from '../../utils/payroll';
import { Field, errorCls, inputCls } from '../enrollment/fields';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const money = (n: number) => `S/ ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const textareaCls = 'w-full bg-surface border border-border-soft rounded-xl p-3 text-sm focus:outline-none focus:border-primary-accent resize-none';

/**
 * Nuevo contrato. Todos los contratos son Full time. El sueldo neto es una estimación (bruto − aportes a pensiones)
 * y se calcula solo; no hay «tipo de comisión». Los campos con asterisco son obligatorios.
 */
export function ContractFormModal({ isOpen, onClose }: Props) {
  const { staff, contracts, addContract } = useData();
  const today = todayLocalISO();
  const [form, setForm] = useState<ContractForm>(emptyContractForm());
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setForm(emptyContractForm());
    setSubmitted(false);
  }, [isOpen]);

  const errors = useMemo(() => validateContractForm(form, contracts, staff, today), [form, contracts, staff, today]);
  const set = (patch: Partial<ContractForm>) => setForm(f => ({ ...f, ...patch }));
  const err = (k: keyof ContractForm) => (submitted ? errors[k] : undefined);
  const cls = (k: keyof ContractForm) => `${inputCls} ${err(k) ? errorCls : ''}`;

  const pension = hasPension(form.type) && !!form.type;
  const estimate = estimateNet(Number(form.grossSalary), form.type, form.pensionSystem, form.pensionFund);

  const changeType = (type: string) => {
    // Al cambiar de tipo se limpian los datos que ya no aplican
    set({
      type,
      endDate: needsEndDate(type) ? form.endDate : '',
      pensionSystem: hasPension(type) ? form.pensionSystem : '',
      pensionFund: hasPension(type) ? form.pensionFund : '',
      vacationStart: hasVacations(type) ? form.vacationStart : '',
      vacationEnd: hasVacations(type) ? form.vacationEnd : '',
    });
  };

  const handleSave = () => {
    setSubmitted(true);
    if (Object.keys(errors).length > 0) return;
    addContract(buildContract(form));
    onClose();
  };

  const count = Object.keys(errors).length;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Nuevo Contrato"
      size="3xl"
      footer={
        <div className="flex justify-end gap-3 w-full">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={handleSave}>Guardar Contrato</Button>
        </div>
      }
    >
      <div className="space-y-6 pb-2">
        {submitted && count > 0 && (
          <div className="bg-danger-tint border border-danger-text/20 rounded-xl p-3 flex gap-2 text-sm text-danger-text">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <p>Revise {count} {count === 1 ? 'campo marcado' : 'campos marcados'} antes de guardar.</p>
          </div>
        )}

        <section className="space-y-4">
          <h4 className="text-sm font-bold text-text-primary uppercase tracking-wider">Condiciones laborales</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Field label="Trabajador" required className="md:col-span-2" error={err('staffId')}>
              <select className={cls('staffId')} value={form.staffId} onChange={e => set({ staffId: e.target.value })}>
                <option value="">Seleccionar trabajador...</option>
                {staff.filter(s => s.status === 'Activo').map(s => (
                  <option key={s.id} value={s.id}>{s.names} {s.lastNameP} {s.lastNameM}</option>
                ))}
              </select>
            </Field>
            <Field label="Tipo de contrato" required error={err('type')} hint="Jornada: Full time">
              <select className={cls('type')} value={form.type} onChange={e => changeType(e.target.value)}>
                <option value="">Seleccionar...</option>
                {CONTRACT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <div />
            <Field label="Fecha de inicio" required error={err('startDate')}>
              <DateInput value={form.startDate} onChange={e => set({ startDate: e.target.value })} />
            </Field>
            <Field
              label="Fecha de fin"
              required={needsEndDate(form.type)}
              error={err('endDate')}
              hint={!form.type ? undefined : needsEndDate(form.type) ? undefined : 'El contrato indeterminado no tiene fecha de fin.'}
            >
              <DateInput
                min={form.startDate || undefined}
                disabled={!needsEndDate(form.type)}
                value={form.endDate}
                onChange={e => set({ endDate: e.target.value })}
              />
            </Field>
          </div>
        </section>

        <section className="space-y-4 border-t border-border-soft pt-6">
          <h4 className="text-sm font-bold text-text-primary uppercase tracking-wider">Remuneración y pensiones</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Field
              label="Sueldo bruto (S/)"
              required
              error={err('grossSalary')}
              hint={form.type && pension ? `Mínimo S/ ${MIN_WAGE.toLocaleString('en-US')} (remuneración mínima vital)` : undefined}
            >
              <input type="number" min={0} step="0.01" className={cls('grossSalary')} value={form.grossSalary} onChange={e => set({ grossSalary: e.target.value })} placeholder="Ej: 3500" />
            </Field>
            <Field label="Sueldo neto estimado (S/)" hint="Se calcula solo: sueldo bruto menos los aportes a pensiones.">
              <div className="w-full h-10 bg-surface-muted border border-border-soft rounded-xl px-3 text-sm flex items-center font-semibold text-primary-accent">
                {estimate ? money(estimate.net) : <span className="font-normal text-text-muted">—</span>}
              </div>
            </Field>
            {pension ? (
              <>
                <Field label="Sistema de pensiones" required error={err('pensionSystem')}>
                  <select
                    className={cls('pensionSystem')}
                    value={form.pensionSystem}
                    onChange={e => set({ pensionSystem: e.target.value, pensionFund: e.target.value === 'AFP' ? form.pensionFund : '' })}
                  >
                    <option value="">Seleccionar...</option>
                    {PENSION_SYSTEMS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </Field>
                <Field label="AFP" required={form.pensionSystem === 'AFP'} error={err('pensionFund')} hint={form.pensionSystem === 'ONP' ? 'La ONP no tiene AFP.' : undefined}>
                  <select className={cls('pensionFund')} disabled={form.pensionSystem !== 'AFP'} value={form.pensionFund} onChange={e => set({ pensionFund: e.target.value })}>
                    <option value="">Seleccionar...</option>
                    {AFP_FUNDS.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </Field>
                <div className="md:col-span-2 text-xs text-text-muted">
                  {estimate
                    ? `Aportes estimados: ${money(estimate.contribution)} (${(estimate.rate * 100).toFixed(2)} % del bruto). Es una estimación: no incluye renta de 5.ª categoría ni otros descuentos de planilla.`
                    : 'Elija el sistema de pensiones para estimar los aportes.'}
                </div>
              </>
            ) : (
              <p className="md:col-span-2 text-sm text-text-secondary bg-surface-muted rounded-xl px-3 py-2.5">
                La locación de servicios no tiene aportes a pensiones: el neto es igual al bruto.
              </p>
            )}
          </div>
        </section>

        {hasVacations(form.type) && (
          <section className="space-y-4 border-t border-border-soft pt-6">
            <h4 className="text-sm font-bold text-text-primary uppercase tracking-wider">Vacaciones programadas (opcional)</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Field label="Fecha de inicio" required={!!form.vacationEnd} error={err('vacationStart')}>
                <DateInput min={form.startDate || undefined} value={form.vacationStart} onChange={e => set({ vacationStart: e.target.value })} />
              </Field>
              <Field label="Fecha de retorno" required={!!form.vacationStart} error={err('vacationEnd')}>
                <DateInput min={form.vacationStart || form.startDate || undefined} value={form.vacationEnd} onChange={e => set({ vacationEnd: e.target.value })} />
              </Field>
            </div>
          </section>
        )}

        <section className="border-t border-border-soft pt-6">
          <Field label="Observaciones">
            <textarea className={`${textareaCls} h-20`} value={form.observations} onChange={e => set({ observations: e.target.value })} placeholder="Detalles adicionales del contrato..." />
          </Field>
        </section>
      </div>
    </Modal>
  );
}
