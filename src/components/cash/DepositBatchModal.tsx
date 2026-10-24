import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '../ui/Button';
import { DateInput } from '../ui/DateInput';
import { Modal } from '../ui/Modal';
import { useData } from '../../context/DataContext';
import { DEPOSIT_BANKS, cashBalance, eligibleForDeposit } from '../../utils/cash';
import { localDateOf, todayLocalISO } from '../../utils/schedule';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Caja desde la que se deposita (la que se está viendo). */
  currency: 'PEN' | 'USD';
}

const money = (n: number) => n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Lote de depósito: lleva al banco los ingresos en efectivo de la caja. Registra UN egreso «Depósito bancario» por el total y
 * marca esos ingresos como depositados (no pueden depositarse ni reversarse mientras el lote exista).
 */
export function DepositBatchModal({ isOpen, onClose, currency }: Props) {
  const { cashMovements, createDepositBatch } = useData();
  const today = todayLocalISO();
  const [date, setDate] = useState(today);
  const [bank, setBank] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setDate(todayLocalISO()); setBank(''); setSelected([]); setError(null);
  }, [isOpen, currency]);

  const pool = useMemo(() => eligibleForDeposit(cashMovements, currency), [cashMovements, currency]);
  const sym = currency === 'PEN' ? 'S/' : '$';
  const total = pool.filter(m => selected.includes(m.id)).reduce((a, m) => a + m.amount, 0);
  const balance = cashBalance(cashMovements, currency);
  const allSelected = pool.length > 0 && selected.length === pool.length;
  const toggle = (id: string) => { setSelected(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])); setError(null); };

  const submit = () => {
    const r = createDepositBatch({ date, bank, currency, movementIds: selected });
    if (!r.ok) { setError(r.error ?? 'No se pudo crear el lote.'); return; }
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Crear lote de depósito · Caja ${currency}`}
      size="lg"
      footer={
        <div className="flex justify-end gap-3 w-full">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={submit} disabled={pool.length === 0}>Crear lote y registrar egreso</Button>
        </div>
      }
    >
      <div className="space-y-5 pb-2">
        {error && (
          <div className="bg-danger-tint border border-danger-text/20 rounded-xl p-3 flex gap-2 text-sm text-danger-text">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <p>{error}</p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-secondary">Fecha de depósito <span className="text-error">*</span></label>
            <DateInput max={today} value={date} onChange={e => { setDate(e.target.value); setError(null); }} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-secondary">Banco / cuenta destino <span className="text-error">*</span></label>
            <select
              className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none"
              value={bank}
              onChange={e => { setBank(e.target.value); setError(null); }}
            >
              <option value="">Seleccionar cuenta</option>
              {DEPOSIT_BANKS[currency].map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-text-primary">Ingresos en efectivo por depositar</h3>
          {pool.length === 0 ? (
            <p className="text-sm text-text-muted italic border border-dashed border-border-soft rounded-xl p-4">No hay ingresos en efectivo pendientes de depósito en la caja {currency}. Solo se depositan los cobros en efectivo.</p>
          ) : (
            <div className="border border-border-soft rounded-xl overflow-hidden max-h-72 overflow-y-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-text-secondary uppercase bg-surface-muted/50 sticky top-0">
                  <tr>
                    <th className="px-4 py-2 w-10 text-center">
                      <input type="checkbox" className="rounded border-border-soft" checked={allSelected} onChange={() => setSelected(allSelected ? [] : pool.map(m => m.id))} aria-label="Seleccionar todos" />
                    </th>
                    <th className="px-4 py-2 font-medium">Fecha</th>
                    <th className="px-4 py-2 font-medium">Concepto</th>
                    <th className="px-4 py-2 font-medium text-right">Monto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-soft">
                  {pool.map(m => (
                    <tr key={m.id} className="hover:bg-surface-muted/50 cursor-pointer" onClick={() => toggle(m.id)}>
                      <td className="px-4 py-2 text-center"><input type="checkbox" className="rounded border-border-soft" checked={selected.includes(m.id)} onChange={() => toggle(m.id)} onClick={e => e.stopPropagation()} /></td>
                      <td className="px-4 py-2 whitespace-nowrap">{localDateOf(m.date)}</td>
                      <td className="px-4 py-2"><div className="text-text-primary">{m.concept}</div><div className="text-xs text-text-muted">{m.reference}</div></td>
                      <td className="px-4 py-2 text-right font-medium">{sym} {money(m.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-surface-muted border border-border-soft rounded-xl p-4 flex justify-between items-center">
          <span className="text-sm text-text-secondary">Total a depositar ({selected.length} seleccionado{selected.length === 1 ? '' : 's'})</span>
          <span className="text-lg font-bold text-text-primary">{sym} {money(total)}</span>
        </div>
        <p className="text-xs text-text-muted">Se registrará un egreso «Depósito bancario» por el total. Saldo de la caja antes: {sym} {money(balance)} · después: {sym} {money(balance - total)}.</p>
      </div>
    </Modal>
  );
}
