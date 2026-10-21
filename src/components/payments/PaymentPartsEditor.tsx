import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { PaymentPart } from '../../context/DataContext';
import { Field, inputCls } from '../../pages/enrollment/fields';
import { PAYMENT_METHODS, needsBank, needsEvidence, needsOperation, totalUSD } from '../../utils/payments';
import { roundMoney } from '../../utils/tariffs';

const usd = (n: number) => `USD ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

let partCounter = 0;
export const newPart = (): PaymentPart => ({
  id: `PT${Date.now().toString(36)}${(partCounter++).toString(36)}`,
  currency: 'USD', amount: 0, method: 'Efectivo',
});

interface Props {
  parts: PaymentPart[];
  onChange: (parts: PaymentPart[]) => void;
  /** Monto en USD que se debe cubrir. */
  required: number;
  /**
   * exact: la suma de las partes debe ser exactamente lo requerido (cobro de la matrícula).
   * upTo: puede pagarse una parte del saldo, sin excederlo (cobro de una cuota).
   */
  mode: 'exact' | 'upTo';
}

/**
 * Lo que RECIBE la empresa: una parte por cada medio de pago usado (moneda, monto, TC, medio, banco, N.º de operación,
 * evidencia y nota). Es el mismo editor en la matrícula, en Pagos y en Planes.
 */
export function PaymentPartsEditor({ parts, onChange, required, mode }: Props) {
  const setPart = (i: number, patch: Partial<PaymentPart>) => onChange(parts.map((p, k) => (k === i ? { ...p, ...patch } : p)));
  const total = parts.length ? totalUSD(parts) : 0;
  const validTc = total !== null;
  const registered = validTc ? total! : 0;
  const pending = roundMoney(required - registered);
  const ok = validTc && (mode === 'exact' ? Math.abs(pending) <= 0.01 : registered > 0 && pending >= -0.01);

  // Completa la última parte con lo que falta (en su moneda, con su TC si es en soles)
  const fillRemaining = () => {
    if (parts.length === 0) return;
    const last = parts[parts.length - 1];
    const others = totalUSD(parts.slice(0, -1));
    if (others === null) return;
    const missingUSD = Math.max(0, roundMoney(required - others));
    if (last.currency === 'USD') setPart(parts.length - 1, { amount: missingUSD });
    else if (last.exchangeRate && last.exchangeRate > 0) setPart(parts.length - 1, { amount: roundMoney(missingUSD * last.exchangeRate) });
  };

  const labels = mode === 'exact'
    ? ['Total requerido', 'Registrado (equivalente)', 'Saldo']
    : ['Saldo de la cuota', 'Este pago (equivalente)', 'Saldo restante'];

  return (
    <div className="space-y-4">
      {parts.map((p, i) => (
        <div key={p.id} className="border border-border-soft rounded-lg p-3 space-y-3 bg-surface-muted/30">
          <div className="flex justify-between items-center">
            <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
              {parts.length > 1 ? `Medio de pago ${i + 1}` : 'Medio de pago'}
            </span>
            {parts.length > 1 && (
              <button type="button" className="text-text-muted hover:text-danger-text" onClick={() => onChange(parts.filter((_, k) => k !== i))} aria-label="Quitar parte">
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
            <Field label="Monto" required>
              <input
                type="number" min="0" step="0.01" className={inputCls}
                value={p.amount || ''}
                onChange={e => setPart(i, { amount: parseFloat(e.target.value) || 0 })}
              />
            </Field>
            {p.currency === 'PEN' ? (
              <Field label="TC (S/ por USD)" required>
                <input
                  type="number" min="0" step="0.001" className={inputCls}
                  value={p.exchangeRate ?? ''}
                  onChange={e => setPart(i, { exchangeRate: parseFloat(e.target.value) || undefined })}
                />
              </Field>
            ) : <div />}
            <Field label="Medio de pago" required>
              <select className={inputCls} value={p.method} onChange={e => setPart(i, { method: e.target.value })}>
                {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
            {needsBank(p.method) && (
              <Field label="Banco / entidad" required>
                <input className={inputCls} value={p.bank ?? ''} onChange={e => setPart(i, { bank: e.target.value })} />
              </Field>
            )}
            {needsOperation(p.method) && (
              <Field label="N° de operación" required>
                <input className={inputCls} value={p.operationNumber ?? ''} onChange={e => setPart(i, { operationNumber: e.target.value })} />
              </Field>
            )}
            <Field label="Evidencia (voucher o captura)" required={needsEvidence(p.method)} hint={needsEvidence(p.method) ? undefined : 'Opcional en efectivo'}>
              <input
                type="file"
                accept="image/*,.pdf"
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

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => onChange([...parts, newPart()])}
          className="flex-1 py-2.5 border-2 border-dashed border-border-soft rounded-xl text-text-secondary hover:border-primary-accent hover:text-primary-accent transition-all flex items-center justify-center gap-2 text-sm font-medium"
        >
          <Plus size={16} /> Agregar otro medio de pago
        </button>
        {mode === 'upTo' && parts.length > 0 && (
          <button
            type="button"
            onClick={fillRemaining}
            className="px-4 py-2.5 border border-border-soft rounded-xl text-sm font-medium text-primary-accent hover:bg-active-tint transition-colors"
          >
            Pagar el saldo
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3 text-sm">
        <div className="bg-surface-muted rounded-lg p-3">
          <p className="text-xs text-text-muted">{labels[0]}</p>
          <p className="font-semibold">{usd(required)}</p>
        </div>
        <div className="bg-surface-muted rounded-lg p-3">
          <p className="text-xs text-text-muted">{labels[1]}</p>
          <p className="font-semibold">{validTc ? usd(registered) : 'Falta TC'}</p>
        </div>
        <div className={`rounded-lg p-3 ${ok ? 'bg-success-tint' : 'bg-warning-tint'}`}>
          <p className="text-xs text-text-muted">{labels[2]}</p>
          <p className="font-semibold">{usd(pending)}</p>
        </div>
      </div>
    </div>
  );
}
