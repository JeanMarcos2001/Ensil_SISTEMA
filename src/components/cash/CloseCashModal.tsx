import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '../ui/Button';
import { DateInput } from '../ui/DateInput';
import { Modal } from '../ui/Modal';
import { useData } from '../../context/DataContext';
import { closedUntil, expectedAt, scopeLabel, validateClosure, type ClosureScope } from '../../utils/cashClosure';
import { todayLocalISO } from '../../utils/schedule';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  scope: ClosureScope;
  currency: 'PEN' | 'USD';
}

/** Arqueo y cierre de una caja: lo que dice el sistema hasta la fecha, lo contado, la diferencia y la nota. */
export function CloseCashModal({ isOpen, onClose, scope, currency }: Props) {
  const { cashMovements, pettyCashMovements, cashClosures, closeCash } = useData();
  const today = todayLocalISO();
  const [date, setDate] = useState(today);
  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const sym = currency === 'PEN' ? 'S/' : '$';
  const money = (n: number) => n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  useEffect(() => {
    if (!isOpen) return;
    setDate(todayLocalISO()); setCounted(''); setNote(''); setError(null);
  }, [isOpen, scope, currency]);

  const expected = useMemo(() => expectedAt(scope, currency, date, cashMovements, pettyCashMovements), [scope, currency, date, cashMovements, pettyCashMovements]);
  const last = closedUntil(cashClosures, scope, currency);
  const diff = counted.trim() !== '' && Number.isFinite(Number(counted)) ? Math.round((Number(counted) - expected) * 100) / 100 : null;

  const submit = () => {
    const r = closeCash({ scope, currency, date, counted, note });
    if (!r.ok) { setError(r.error ?? 'No se pudo cerrar la caja.'); return; }
    onClose();
  };
  const problems = validateClosure({ scope, currency, date, counted, note }, cashClosures, expected, today);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Arqueo y cierre · ${scopeLabel(scope, currency)}`}
      size="md"
      footer={
        <div className="flex justify-end gap-3 w-full">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={submit}>Cerrar {scope === 'caja' ? 'caja' : 'caja chica'}</Button>
        </div>
      }
    >
      <div className="space-y-4 pb-2">
        {error && (
          <div className="bg-danger-tint border border-danger-text/20 rounded-xl p-3 flex gap-2 text-sm text-danger-text">
            <AlertCircle size={16} className="shrink-0 mt-0.5" /><p>{error}</p>
          </div>
        )}
        <p className="text-sm text-text-secondary">
          Cuente el dinero y compárelo con el saldo del sistema. {last ? `Último cierre: ${last}.` : 'Esta caja aún no tiene cierres.'} Después de cerrar, los movimientos de esa fecha y anteriores quedan bloqueados hasta que se reabra el cierre.
        </p>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-text-secondary">Cerrar hasta el día <span className="text-error">*</span></label>
          <DateInput max={today} value={date} onChange={e => { setDate(e.target.value); setError(null); }} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-surface-muted border border-border-soft rounded-xl p-3">
            <span className="block text-xs text-text-muted">Saldo del sistema</span>
            <span className="text-lg font-semibold text-text-primary">{sym} {money(expected)}</span>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-secondary">Dinero contado <span className="text-error">*</span></label>
            <input type="number" min={0} step="0.01" className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none" value={counted} onChange={e => { setCounted(e.target.value); setError(null); }} placeholder="0.00" />
          </div>
        </div>
        {diff !== null && (
          <p className={`text-sm font-medium ${diff === 0 ? 'text-success-text' : 'text-danger-text'}`}>
            {diff === 0 ? 'La caja cuadra.' : diff > 0 ? `Sobrante de ${sym} ${money(diff)}.` : `Faltante de ${sym} ${money(-diff)}.`}
          </p>
        )}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-text-secondary">Nota {diff !== null && diff !== 0 && <span className="text-error">*</span>}</label>
          <textarea className="w-full h-20 bg-surface border border-border-soft rounded-xl p-3 text-sm focus:outline-none focus:border-primary-accent resize-none" value={note} onChange={e => { setNote(e.target.value); setError(null); }} placeholder="Observaciones del arqueo..." />
        </div>
        {problems.length > 0 && counted !== '' && <p className="text-xs text-text-muted">{problems[0]}</p>}
      </div>
    </Modal>
  );
}
