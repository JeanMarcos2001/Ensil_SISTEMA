import React from 'react';
import { Field, inputCls } from '../../pages/enrollment/fields';
import { DOC_PREFIX, DOC_TYPES, type DocType, type PaymentDocument } from '../../utils/payments';

interface Props {
  value: PaymentDocument;
  onChange: (value: PaymentDocument) => void;
}

/**
 * Lo que ENTREGA la empresa: el comprobante del pago (boleta o factura, serie y número). Es uno por pago,
 * aunque se haya pagado con varios medios.
 */
export function ReceiptFields({ value, onChange }: Props) {
  const prefix = DOC_PREFIX[value.type];
  return (
    <div className="grid grid-cols-3 gap-3">
      <Field label="Comprobante" required>
        <select className={inputCls} value={value.type} onChange={e => onChange({ ...value, type: e.target.value as DocType })}>
          {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </Field>
      <Field label="Serie" required>
        <input
          className={`${inputCls} uppercase font-mono`}
          maxLength={4}
          value={value.serie}
          placeholder={`${prefix}001`}
          onChange={e => onChange({ ...value, serie: e.target.value.toUpperCase() })}
        />
      </Field>
      <Field label="Número" required>
        <input
          className={`${inputCls} font-mono`}
          inputMode="numeric"
          maxLength={8}
          value={value.number}
          placeholder="000123"
          onChange={e => onChange({ ...value, number: e.target.value.replace(/\D/g, '') })}
        />
      </Field>
    </div>
  );
}
