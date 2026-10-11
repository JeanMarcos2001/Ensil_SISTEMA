import React from 'react';
import { Plus, Trash2, CalendarClock } from 'lucide-react';
import type { PaymentPart } from '../../context/DataContext';
import {
  PAYMENT_METHODS,
  fullName,
  studentPerson,
  unitPaymentStatus,
  type PaymentUnit,
} from '../../utils/enrollment';
import { buildPlanInstallments } from '../../utils/tariffs';
import { Field, StepHeader, inputCls } from './fields';
import { STEPS, type StepProps } from './types';

const usd = (n: number) => `USD ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const NEEDS_BANK = ['Transferencia', 'Depósito'];
const NEEDS_OPERATION = ['Transferencia', 'Yape', 'Plin', 'Depósito'];

let partCounter = 0;
const newPart = (): PaymentPart => ({
  id: `PT${Date.now().toString(36)}${(partCounter++).toString(36)}`,
  currency: 'USD', amount: 0, method: 'Efectivo',
});

function PartsEditor({
  unit, parts, onChange,
}: { unit: PaymentUnit; parts: PaymentPart[]; onChange: (parts: PaymentPart[]) => void }) {
  const status = unitPaymentStatus(parts, unit.required);
  const setPart = (i: number, patch: Partial<PaymentPart>) => onChange(parts.map((p, k) => (k === i ? { ...p, ...patch } : p)));

  return (
    <div className="p-5 border border-border-soft rounded-xl space-y-4">
      <div className="flex justify-between items-start">
        <div>
          <h4 className="font-semibold text-text-primary">{unit.label}</h4>
          <p className="text-xs text-text-muted">
            {unit.kind === 'group' ? 'Un único pago para todo el grupo.' : 'Pago inmediato.'}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-text-muted uppercase tracking-wide">Total requerido</p>
          <p className="text-lg font-bold text-text-primary">{usd(unit.required)}</p>
        </div>
      </div>

      {parts.map((p, i) => (
        <div key={p.id} className="border border-border-soft rounded-lg p-3 space-y-3 bg-surface-muted/30">
          <div className="flex justify-between items-center">
            <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Parte {i + 1}</span>
            {parts.length > 1 && (
              <button type="button" className="text-text-muted hover:text-danger-text" onClick={() => onChange(parts.filter((_, k) => k !== i))}>
                <Trash2 size={14} />
              </button>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Moneda">
              <select className={inputCls} value={p.currency} onChange={e => setPart(i, { currency: e.target.value as 'PEN' | 'USD', exchangeRate: undefined })}>
                <option value="USD">USD (Dólares)</option>
                <option value="PEN">PEN (Soles)</option>
              </select>
            </Field>
            <Field label="Monto">
              <input
                type="number" min="0" step="0.01" className={inputCls}
                value={p.amount || ''}
                onChange={e => setPart(i, { amount: parseFloat(e.target.value) || 0 })}
              />
            </Field>
            {p.currency === 'PEN' ? (
              <Field label="TC (S/ por USD)">
                <input
                  type="number" min="0" step="0.001" className={inputCls}
                  value={p.exchangeRate ?? ''}
                  onChange={e => setPart(i, { exchangeRate: parseFloat(e.target.value) || undefined })}
                />
              </Field>
            ) : <div />}
            <Field label="Medio de pago">
              <select className={inputCls} value={p.method} onChange={e => setPart(i, { method: e.target.value })}>
                {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
            {NEEDS_BANK.includes(p.method) && (
              <Field label="Banco / entidad">
                <input className={inputCls} value={p.bank ?? ''} onChange={e => setPart(i, { bank: e.target.value })} />
              </Field>
            )}
            {NEEDS_OPERATION.includes(p.method) && (
              <Field label="N° de operación">
                <input className={inputCls} value={p.operationNumber ?? ''} onChange={e => setPart(i, { operationNumber: e.target.value })} />
              </Field>
            )}
            <Field label="Evidencia">
              <input
                type="file"
                className="block w-full text-xs text-text-secondary file:mr-2 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-surface-muted file:text-text-primary"
                onChange={e => setPart(i, { evidence: e.target.files?.[0]?.name })}
              />
              {p.evidence && <p className="text-xs text-text-muted truncate">{p.evidence}</p>}
            </Field>
            <Field label="Nota" className="col-span-3">
              <input className={inputCls} value={p.note ?? ''} onChange={e => setPart(i, { note: e.target.value })} />
            </Field>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={() => onChange([...parts, newPart()])}
        className="w-full py-2.5 border-2 border-dashed border-border-soft rounded-xl text-text-secondary hover:border-primary-accent hover:text-primary-accent transition-all flex items-center justify-center gap-2 text-sm font-medium"
      >
        <Plus size={16} /> Agregar parte de pago
      </button>

      <div className="grid grid-cols-3 gap-3 text-sm">
        <div className="bg-surface-muted rounded-lg p-3">
          <p className="text-xs text-text-muted">Total requerido</p>
          <p className="font-semibold">{usd(unit.required)}</p>
        </div>
        <div className="bg-surface-muted rounded-lg p-3">
          <p className="text-xs text-text-muted">Registrado (equivalente)</p>
          <p className="font-semibold">{status.validTc ? usd(status.registered) : 'Falta TC'}</p>
        </div>
        <div className={`rounded-lg p-3 ${Math.abs(status.pending) <= 0.01 && status.validTc ? 'bg-success-tint' : 'bg-warning-tint'}`}>
          <p className="text-xs text-text-muted">Saldo</p>
          <p className="font-semibold">{usd(status.pending)}</p>
        </div>
      </div>
    </div>
  );
}

export function StepPayment({ draft, update, quote }: StepProps) {
  const setUnitParts = (key: string, parts: PaymentPart[]) =>
    update(d => ({ ...d, payments: { ...d.payments, [key]: parts } }));

  // Inicializa cada unidad con una parte vacía para que el formulario aparezca listo
  React.useEffect(() => {
    const missing = quote.units.filter(u => !draft.payments[u.key] || draft.payments[u.key].length === 0);
    if (missing.length > 0) {
      update(d => {
        const next = { ...d.payments };
        missing.forEach(u => { if (!next[u.key] || next[u.key].length === 0) next[u.key] = [newPart()]; });
        return { ...d, payments: next };
      });
    }
  }, [quote.units.map(u => u.key).join('|')]);

  const planStudents = quote.students.filter(q => q.tariff && q.mode !== 'inmediato');

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
      <StepHeader title={STEPS[4].title} subtitle={STEPS[4].subtitle} />

      {quote.units.map(u => (
        <PartsEditor key={u.key} unit={u} parts={draft.payments[u.key] ?? []} onChange={parts => setUnitParts(u.key, parts)} />
      ))}

      {planStudents.map(q => {
        const s = draft.students[q.index];
        const rows = buildPlanInstallments(q.tariff!, draft.context.date, q.mode === 'fechas_manuales' ? s.dueDates : undefined);
        const total = q.listPrice || q.tariff!.basePrice;
        return (
          <div key={q.key} className="p-5 border border-border-soft rounded-xl space-y-3">
            <div className="flex items-center gap-2">
              <CalendarClock size={18} className="text-primary-accent" />
              <h4 className="font-semibold text-text-primary">
                Cronograma — Alumno {q.index + 1}: {fullName(studentPerson(draft, q.index)) || '—'}
              </h4>
            </div>
            <p className="text-xs text-text-secondary">
              {q.paymentType!.name} · {q.tariff!.name} · Total {usd(total)}
            </p>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-text-muted uppercase">
                  <th className="py-1 font-medium">Concepto</th>
                  <th className="py-1 font-medium">Monto</th>
                  <th className="py-1 font-medium">Vencimiento</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="border-t border-border-soft">
                    <td className="py-2 text-text-primary">{r.name}</td>
                    <td className="py-2 text-text-secondary">{r.variable ? 'Se define al cobrar' : usd(r.amount)}</td>
                    <td className="py-2 text-text-secondary">{r.dueDate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-text-muted">Los pagos serán gestionados desde Planes. No se solicita comprobante en este paso.</p>
          </div>
        );
      })}

      {quote.units.length === 0 && planStudents.length === 0 && (
        <div className="p-6 border border-dashed border-border-soft rounded-xl text-center text-sm text-text-secondary">
          Aún no hay tipos de pago definidos. Complete el paso Programa.
        </div>
      )}
    </div>
  );
}
