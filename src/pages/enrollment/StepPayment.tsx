import React from 'react';
import { CalendarClock } from 'lucide-react';
import type { PaymentPart } from '../../context/DataContext';
import { PaymentPartsEditor, newPart } from '../../components/payments/PaymentPartsEditor';
import { ReceiptFields } from '../../components/payments/ReceiptFields';
import { fullName, studentPerson, type PaymentUnit } from '../../utils/enrollment';
import { emptyDocument, type PaymentDocument } from '../../utils/payments';
import { buildPlanInstallments } from '../../utils/tariffs';
import { StepHeader } from './fields';
import { STEPS, type StepProps } from './types';

const usd = (n: number) => `USD ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Una unidad de pago (alumno contado o grupo promocional): sus partes (lo que recibe la empresa) y su comprobante (lo que entrega). */
function UnitPayment({
  unit, parts, document, onParts, onDocument,
}: {
  unit: PaymentUnit;
  parts: PaymentPart[];
  document: PaymentDocument;
  onParts: (parts: PaymentPart[]) => void;
  onDocument: (doc: PaymentDocument) => void;
}) {
  return (
    <div className="p-5 border border-border-soft rounded-xl space-y-4">
      <div className="flex justify-between items-start">
        <div>
          <h4 className="font-semibold text-text-primary">{unit.label}</h4>
          <p className="text-xs text-text-muted">
            {unit.kind === 'group' ? 'Un único pago y un único comprobante para todo el grupo.' : 'Pago inmediato.'}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-text-muted uppercase tracking-wide">Total requerido</p>
          <p className="text-lg font-bold text-text-primary">{usd(unit.required)}</p>
        </div>
      </div>

      <PaymentPartsEditor parts={parts} onChange={onParts} required={unit.required} mode="exact" />

      <div className="space-y-2 pt-4 border-t border-border-soft">
        <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Comprobante entregado</p>
        <ReceiptFields value={document} onChange={onDocument} />
        <p className="text-xs text-text-muted">Un solo comprobante por el total del pago, aunque se haya pagado con varios medios.</p>
      </div>
    </div>
  );
}

export function StepPayment({ draft, update, quote }: StepProps) {
  const setUnitParts = (key: string, parts: PaymentPart[]) =>
    update(d => ({ ...d, payments: { ...d.payments, [key]: parts } }));
  const setUnitDocument = (key: string, doc: PaymentDocument) =>
    update(d => ({ ...d, paymentDocs: { ...d.paymentDocs, [key]: doc } }));

  // Inicializa cada unidad con una parte vacía para que el formulario aparezca listo
  React.useEffect(() => {
    const missing = quote.units.filter(u => !draft.payments[u.key] || draft.payments[u.key].length === 0 || !draft.paymentDocs[u.key]);
    if (missing.length > 0) {
      update(d => {
        const next = { ...d.payments };
        const docs = { ...d.paymentDocs };
        missing.forEach(u => {
          if (!next[u.key] || next[u.key].length === 0) next[u.key] = [newPart()];
          if (!docs[u.key]) docs[u.key] = emptyDocument();
        });
        return { ...d, payments: next, paymentDocs: docs };
      });
    }
  }, [quote.units.map(u => u.key).join('|')]);

  const planStudents = quote.students.filter(q => q.tariff && q.mode !== 'inmediato');

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
      <StepHeader title={STEPS[4].title} subtitle={STEPS[4].subtitle} />

      {quote.units.map(u => (
        <UnitPayment
          key={u.key}
          unit={u}
          parts={draft.payments[u.key] ?? []}
          document={draft.paymentDocs[u.key] ?? emptyDocument()}
          onParts={parts => setUnitParts(u.key, parts)}
          onDocument={doc => setUnitDocument(u.key, doc)}
        />
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
