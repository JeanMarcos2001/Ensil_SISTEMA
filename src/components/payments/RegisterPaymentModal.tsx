import React, { useEffect, useState } from 'react';
import { AlertTriangle, Search } from 'lucide-react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { useData, type PaymentPart } from '../../context/DataContext';
import { emptyDocument, type PaymentDocument } from '../../utils/payments';
import { PaymentPartsEditor, newPart } from './PaymentPartsEditor';
import { ReceiptFields } from './ReceiptFields';

const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const usd = (n: number) => `$ ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const todayISO = () => new Date().toISOString().slice(0, 10);
const fieldCls = 'w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none disabled:bg-surface-muted disabled:text-text-muted';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Matrícula (plan) con la que se abre, p. ej. desde Planes y cartera. */
  initialPlanId?: string;
  /** Cuota con la que se abre; si falta, se propone la primera con saldo. */
  initialInstallmentId?: string;
  /** Se llama cuando el pago se guardó (antes de cerrar). */
  onSaved?: () => void;
}

/**
 * Único formulario para cobrar una cuota (lo usan Pagos y Planes y cartera). Pide lo mismo que el asistente de matrícula:
 * lo que recibe la empresa (una parte por medio: moneda, monto, TC, medio, banco, operación, evidencia) y lo que entrega
 * (comprobante). Al guardar, la cuota, el pago y la caja quedan consistentes.
 */
export function RegisterPaymentModal({ isOpen, onClose, initialPlanId, initialInstallmentId, onSaved }: Props) {
  const { plans, enrollments, registerPayment } = useData();
  const [planQuery, setPlanQuery] = useState('');
  const [planId, setPlanId] = useState('');
  const [installmentId, setInstallmentId] = useState('');
  const [payDate, setPayDate] = useState(todayISO());
  const [parts, setParts] = useState<PaymentPart[]>([newPart()]);
  const [document, setDocument] = useState<PaymentDocument>(emptyDocument());
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const firstPayable = (id: string) =>
    plans.find(p => p.id === id)?.installments.find((i: any) => i.balance > 0 && i.status !== 'Refinanciada')?.id ?? '';

  useEffect(() => {
    if (!isOpen) return;
    setPlanQuery('');
    setPlanId(initialPlanId ?? '');
    setInstallmentId(initialPlanId ? initialInstallmentId ?? firstPayable(initialPlanId) : '');
    setPayDate(todayISO());
    setParts([newPart()]);
    setDocument(emptyDocument());
    setNote('');
    setError(null);
  }, [isOpen, initialPlanId, initialInstallmentId]);

  // Todas las matrículas que figuran en Planes y cartera (cada una con su plan)
  const planOptions = plans.map(plan => {
    const enrollment = enrollments.find(e => e.id === plan.mat);
    return { plan, student: enrollment?.student ?? plan.titular };
  });
  const q = norm(planQuery.trim());
  const planMatches = planOptions
    .filter(o => !q || norm(`${o.plan.mat} ${o.plan.id} ${o.student} ${o.plan.titular}`).includes(q))
    .sort((a, b) => Number(b.plan.balance > 0) - Number(a.plan.balance > 0))
    .slice(0, 8);
  const selectedPlan = plans.find(p => p.id === planId);
  const selectedInfo = planOptions.find(o => o.plan.id === planId);
  const payable = (selectedPlan?.installments ?? []).filter((i: any) => i.balance > 0 && i.status !== 'Refinanciada');
  const installment = payable.find((i: any) => i.id === installmentId);
  // En cronogramas de monto variable (Contado en 2 partes) lo adeudado al cobrar es el saldo del plan
  const owed = installment ? (installment.variable ? selectedPlan!.balance : installment.balance) : 0;

  const pickPlan = (id: string) => {
    setPlanId(id);
    setPlanQuery('');
    setError(null);
    setInstallmentId(firstPayable(id));
  };

  const handleSave = () => {
    setError(null);
    if (!selectedPlan || !installment) { setError('Seleccione la matrícula y la cuota a la que se aplicará el pago.'); return; }
    const result = registerPayment(selectedPlan.id, installment.id, { date: payDate, parts, document, note });
    if (!result.ok) { setError(result.error || 'No se pudo registrar el pago.'); return; }
    onSaved?.();
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Registrar Pago de Cuota"
      size="3xl"
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={handleSave}>Guardar y aplicar</Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="bg-primary-accent/10 border border-primary-accent/20 rounded-xl p-3 text-sm text-primary-accent flex gap-2">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <p>El pago se aplicará a la cuota seleccionada del plan (Planes y cartera) y generará un movimiento en caja por cada medio de pago.</p>
        </div>

        {error && (
          <div className="bg-danger-tint border border-danger-text/20 rounded-xl p-3 text-sm text-danger-text flex gap-2">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <p>{error}</p>
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-text-secondary">Matrícula *</label>
          {selectedPlan ? (
            <div className="flex items-start justify-between gap-3 bg-surface-muted border border-border-soft rounded-xl p-3">
              <div className="text-sm">
                <p className="font-semibold text-text-primary">{selectedInfo?.student}</p>
                <p className="text-text-secondary">{selectedPlan.mat} · {selectedPlan.id} · {selectedPlan.type}</p>
                <p className="text-xs text-text-muted">Saldo del plan: {usd(selectedPlan.balance)} de {usd(selectedPlan.total)}</p>
              </div>
              {!initialPlanId && (
                <button type="button" className="text-xs text-primary-accent hover:underline shrink-0" onClick={() => { setPlanId(''); setInstallmentId(''); }}>
                  Cambiar
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
                <input
                  type="text"
                  value={planQuery}
                  onChange={e => setPlanQuery(e.target.value)}
                  className={`${fieldCls} pl-9`}
                  placeholder="Buscar por alumno, titular, matrícula o plan..."
                />
              </div>
              <div className="border border-border-soft rounded-xl overflow-hidden bg-surface max-h-56 overflow-y-auto">
                {planMatches.map(o => {
                  const hasBalance = o.plan.balance > 0;
                  return (
                    <button
                      key={o.plan.id}
                      type="button"
                      disabled={!hasBalance}
                      onClick={() => pickPlan(o.plan.id)}
                      className={`w-full text-left px-3 py-2 text-sm border-b border-border-soft last:border-0 ${hasBalance ? 'hover:bg-surface-muted' : 'opacity-50 cursor-not-allowed'}`}
                    >
                      <span className="font-medium text-text-primary">{o.student}</span>
                      <span className="text-text-muted"> · {o.plan.mat} · {o.plan.type}</span>
                      <span className={`block text-xs ${hasBalance ? 'text-danger-text' : 'text-text-muted'}`}>
                        {hasBalance ? `Saldo pendiente ${usd(o.plan.balance)}` : 'Sin saldo pendiente'}
                      </span>
                    </button>
                  );
                })}
                {planMatches.length === 0 && (
                  <p className="px-3 py-3 text-xs text-text-muted">No hay matrículas con plan que coincidan. Solo se pagan matrículas registradas en Planes y cartera.</p>
                )}
              </div>
            </>
          )}
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1.5 col-span-2">
            <label className="text-sm font-medium text-text-secondary">Cuota a aplicar *</label>
            <select
              value={installmentId}
              disabled={!selectedPlan || payable.length === 0}
              onChange={e => setInstallmentId(e.target.value)}
              className={fieldCls}
            >
              {!selectedPlan && <option value="">Seleccione una matrícula primero</option>}
              {selectedPlan && payable.length === 0 && <option value="">El plan no tiene cuotas con saldo</option>}
              {payable.map((i: any) => (
                <option key={i.id} value={i.id}>
                  {i.name} · vence {i.dueDate} · {i.variable ? `monto variable (saldo del plan ${usd(selectedPlan!.balance)})` : `saldo ${usd(i.balance)}`}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-secondary">Fecha de pago *</label>
            <input type="date" max={todayISO()} value={payDate} onChange={e => setPayDate(e.target.value)} className={fieldCls} />
          </div>
        </div>

        <div className="space-y-3 pt-4 border-t border-border-soft">
          <h4 className="text-base font-semibold text-text-primary">Pago recibido</h4>
          <PaymentPartsEditor parts={parts} onChange={setParts} required={owed} mode="upTo" />
        </div>

        <div className="space-y-3 pt-4 border-t border-border-soft">
          <h4 className="text-base font-semibold text-text-primary">Comprobante entregado</h4>
          <ReceiptFields value={document} onChange={setDocument} />
          <p className="text-xs text-text-muted">Un solo comprobante por el total del pago, aunque se haya pagado con varios medios.</p>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-text-secondary">Comentario</label>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            className="w-full h-20 bg-surface border border-border-soft rounded-xl p-3 text-sm focus:border-primary-accent outline-none resize-none"
            placeholder="Detalles adicionales..."
          ></textarea>
        </div>
      </div>
    </Modal>
  );
}
