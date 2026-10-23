import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, AlertTriangle } from 'lucide-react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { useData } from '../../context/DataContext';
import { REFUND_REASON, REVERSAL_REASONS, applyReversalToPlan, reversalTargets, validateReversal } from '../../utils/paymentReversal';
import { todayLocalISO } from '../../utils/schedule';
import { Field, inputCls } from '../../pages/enrollment/fields';

interface Props {
  /** Pago a reversar; `null` cierra la ventana. */
  paymentId: string | null;
  onClose: () => void;
}

const usd = (n: number) => `USD ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Reversar un pago. No borra nada: el pago queda «Anulado» con su constancia, la cuota recupera su saldo, la caja se ajusta
 * (devolución o ingreso reversado) y el comprobante y la operación quedan libres. Se muestra el efecto antes de confirmar.
 */
export function ReversePaymentModal({ paymentId, onClose }: Props) {
  const data = useData();
  const payment = data.payments.find(p => p.id === paymentId);
  const [reason, setReason] = useState('');
  const [detail, setDetail] = useState('');
  const [refunded, setRefunded] = useState(false);
  const [creditNote, setCreditNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const today = todayLocalISO();

  useEffect(() => { setReason(''); setDetail(''); setRefunded(false); setCreditNote(''); setError(null); }, [paymentId]);

  const ctx = useMemo(() => ({ payments: data.payments, plans: data.plans, enrollments: data.enrollments, groups: data.promotionGroups }), [data.payments, data.plans, data.enrollments, data.promotionGroups]);

  // Efecto sobre cada matrícula: cuánto se repone y si se encuentra el cobro en el plan
  const impacts = useMemo(() => {
    if (!payment) return [];
    return reversalTargets(payment, ctx).map(t => {
      const plan = data.plans.find(p => p.id === t.planId);
      const enrollment = data.enrollments.find(e => e.id === t.enrollmentId);
      const applied = plan ? applyReversalToPlan(plan, payment, t.shareUSD, today) : undefined;
      return { ...t, enrollment, plan, applied };
    });
  }, [payment, ctx, data.plans, data.enrollments]);

  if (!payment) return null;
  const refundForced = reason === REFUND_REASON;
  const effectiveRefund = refundForced || refunded;
  const verified = impacts.filter(i => i.enrollment?.verificationStatus && i.enrollment.verificationStatus !== 'Pendiente');
  const problems = validateReversal(payment, { reason, detail, refunded: effectiveRefund, creditNote }, ctx);

  const handleSave = () => {
    const r = data.reversePayment(payment.id, { reason, detail, refunded: effectiveRefund, creditNote });
    if (!r.ok) { setError(r.error ?? 'No se pudo reversar el pago.'); return; }
    onClose();
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Reversar pago ${payment.id}`}
      size="3xl"
      footer={
        <div className="flex justify-end gap-3 w-full">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" className="bg-danger-text hover:bg-danger-text/90 text-white border-none" onClick={handleSave}>Confirmar reversa</Button>
        </div>
      }
    >
      <div className="space-y-5 pb-2">
        <div className="bg-danger-tint/50 border border-danger-text/20 rounded-xl p-4 flex gap-3">
          <AlertTriangle size={20} className="text-danger-text shrink-0" />
          <div className="text-sm text-danger-text">
            <p className="font-semibold mb-1">La reversa no borra el pago: lo anula y queda auditada.</p>
            <p>El pago pasa a «Anulado», la cuota recupera su saldo, la caja se ajusta y el comprobante y la operación quedan libres para usarse de nuevo.</p>
          </div>
        </div>

        {error && (
          <div className="bg-danger-tint border border-danger-text/20 rounded-xl p-3 flex gap-2 text-sm text-danger-text">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <p>{error}</p>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-surface-muted border border-border-soft rounded-xl p-4 text-sm">
          <div><span className="block text-xs text-text-muted">Alumno</span><span className="font-medium text-text-primary">{payment.student}</span></div>
          <div><span className="block text-xs text-text-muted">Concepto</span><span className="font-medium text-text-primary">{payment.concept}</span></div>
          <div><span className="block text-xs text-text-muted">Monto</span><span className="font-medium text-text-primary">{usd(payment.amount)}</span></div>
          <div><span className="block text-xs text-text-muted">Comprobante</span><span className="font-medium text-text-primary">{payment.receipt}</span></div>
          <div><span className="block text-xs text-text-muted">Medio</span><span className="font-medium text-text-primary">{payment.method}</span></div>
          <div><span className="block text-xs text-text-muted">Fecha</span><span className="font-medium text-text-primary">{payment.date}</span></div>
        </div>

        <section className="space-y-2">
          <h4 className="text-sm font-bold text-text-primary uppercase tracking-wider">Qué pasará</h4>
          <div className="border border-border-soft rounded-xl divide-y divide-border-soft overflow-hidden text-sm">
            {impacts.length === 0 && <p className="px-4 py-3 text-text-muted">Este pago no está enlazado a una matrícula: solo se anulará el pago y su caja.</p>}
            {impacts.map(i => (
              <div key={i.enrollmentId} className="px-4 py-2.5">
                <p className="font-medium text-text-primary">{i.enrollmentId} · {i.enrollment?.student}</p>
                <p className="text-text-secondary">
                  {i.applied
                    ? i.applied.matched
                      ? `El plan ${i.plan!.id} recupera ${usd(i.shareUSD)}: su saldo pasa de ${usd(i.plan!.balance)} a ${usd(i.applied.plan.balance)}${i.applied.plan.installments.length > 0 && i.plan!.installments.length === 0 ? ' (se crea un «Pago único» pendiente para cobrarlo de nuevo)' : ''}.`
                      : i.applied.note
                    : 'La matrícula no tiene plan.'}
                </p>
              </div>
            ))}
            <div className="px-4 py-2.5 text-text-secondary">
              <span className="font-medium text-text-primary">Caja: </span>
              {effectiveRefund
                ? 'se registra el egreso de la devolución al cliente (los ingresos originales se conservan).'
                : 'los ingresos de este pago se marcan «Reversados» (el dinero nunca ingresó o se registró por error).'}
            </div>
            {verified.length > 0 && (
              <div className="px-4 py-2.5 bg-warning-tint/40 text-text-primary">
                <span className="font-medium">Materiales: </span>la matrícula {verified.map(v => v.enrollmentId).join(', ')} ya fue verificada; la entrega no se revierte.
              </div>
            )}
          </div>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="Motivo de la reversa" required>
            <select className={inputCls} value={reason} onChange={e => { setReason(e.target.value); setError(null); }}>
              <option value="">Seleccionar...</option>
              {REVERSAL_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="N.º de nota de crédito" hint="Opcional: si ya emitió una para anular el comprobante.">
            <input className={inputCls} value={creditNote} onChange={e => setCreditNote(e.target.value)} placeholder="Ej: BC01-000012" />
          </Field>
          <Field label="Explicación" required className="md:col-span-2" hint="Qué ocurrió. Queda en el historial del pago y de la matrícula.">
            <textarea
              className="w-full h-20 bg-surface border border-border-soft rounded-xl p-3 text-sm focus:outline-none focus:border-primary-accent resize-none"
              value={detail}
              onChange={e => { setDetail(e.target.value); setError(null); }}
            />
          </Field>
          <label className="md:col-span-2 flex items-start gap-3 p-3 border border-border-soft rounded-xl cursor-pointer hover:bg-surface-muted transition-colors">
            <input
              type="checkbox"
              className="mt-0.5 w-4 h-4 rounded border-border-soft"
              checked={effectiveRefund}
              disabled={refundForced}
              onChange={e => setRefunded(e.target.checked)}
            />
            <span className="text-sm">
              <span className="font-medium text-text-primary">Se devolvió el dinero al cliente</span>
              <span className="block text-text-secondary">Marque si el dinero ya había ingresado y ahora sale de caja. Si fue un error de registro, déjelo sin marcar.</span>
            </span>
          </label>
        </section>

        {problems.length > 0 && (reason || detail) && <p className="text-xs text-text-muted">{problems[0]}</p>}
      </div>
    </Modal>
  );
}
