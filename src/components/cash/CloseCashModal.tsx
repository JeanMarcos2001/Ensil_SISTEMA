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
  /** La sede cuya caja se cierra (la que se está viendo). Sin ella se elige en la ventana; «Caja general» solo la ofrece quien alcanza todas las sedes. */
  branchId?: string;
}

const GENERAL = 'general';

/**
 * Arqueo y cierre de una caja: lo que dice el sistema hasta la fecha, lo contado, la diferencia y la nota. **Cada sede cierra la suya** (y su caja chica);
 * la base vuelve a calcular el saldo esperado y es el que queda guardado.
 */
export function CloseCashModal({ isOpen, onClose, scope, currency, branchId }: Props) {
  const { cashMovements, pettyCashMovements, cashClosures, closeCash, branches, sessionScope } = useData();
  const today = todayLocalISO();
  const [date, setDate] = useState(today);
  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');
  const [sede, setSede] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sym = currency === 'PEN' ? 'S/' : '$';
  const money = (n: number) => n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Las sedes que esta cuenta alcanza (la base solo le entrega esas)
  const options = branches.filter(b => b.status === 'Activo' && (sessionScope.allBranches || sessionScope.branchIds.includes(b.id)));
  const canGeneral = scope === 'caja' && sessionScope.allBranches;
  const locked = !!branchId;

  useEffect(() => {
    if (!isOpen) return;
    setDate(todayLocalISO()); setCounted(''); setNote(''); setError(null); setSaving(false);
    setSede(branchId ?? (options.length === 1 ? options[0]!.id : ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, scope, currency, branchId]);

  const target = sede === GENERAL ? undefined : sede || undefined;
  const chosen = sede !== '';
  const boxName = sede === GENERAL ? 'Caja general' : options.find(b => b.id === sede)?.name ?? '';

  const expected = useMemo(() => expectedAt(scope, currency, date, cashMovements, pettyCashMovements, target), [scope, currency, date, cashMovements, pettyCashMovements, target]);
  const last = closedUntil(cashClosures, scope, currency, target);
  const diff = counted.trim() !== '' && Number.isFinite(Number(counted)) ? Math.round((Number(counted) - expected) * 100) / 100 : null;

  const submit = async () => {
    if (saving) return;
    if (!chosen) { setError('Elija la sede cuya caja va a cerrar.'); return; }
    setSaving(true);
    const r = await closeCash({ scope, currency, branchId: target, date, counted, note });
    setSaving(false);
    if (!r.ok) { setError(r.error ?? 'No se pudo cerrar la caja.'); return; }
    onClose();
  };
  const problems = chosen ? validateClosure({ scope, currency, branchId: target, date, counted, note }, cashClosures, expected, today) : [];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Arqueo y cierre · ${scopeLabel(scope, currency)}${boxName ? ` · ${boxName}` : ''}`}
      size="md"
      footer={
        <div className="flex justify-end gap-3 w-full">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={submit} disabled={saving}>{saving ? 'Guardando…' : `Cerrar ${scope === 'caja' ? 'caja' : 'caja chica'}`}</Button>
        </div>
      }
    >
      <div className="space-y-4 pb-2">
        {error && (
          <div className="bg-danger-tint border border-danger-text/20 rounded-xl p-3 flex gap-2 text-sm text-danger-text" role="alert">
            <AlertCircle size={16} className="shrink-0 mt-0.5" /><p>{error}</p>
          </div>
        )}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-text-secondary">Sede <span className="text-error">*</span></label>
          <select
            className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none disabled:bg-surface-muted"
            value={sede}
            disabled={locked}
            onChange={e => { setSede(e.target.value); setError(null); }}
          >
            <option value="">Seleccionar sede...</option>
            {options.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            {canGeneral && <option value={GENERAL}>Caja general (sin sede)</option>}
          </select>
          <p className="text-xs text-text-muted">Cada sede cierra su propia caja: el saldo y los movimientos son solo de la sede elegida.</p>
        </div>
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
            <span className="text-lg font-semibold text-text-primary">{chosen ? `${sym} ${money(expected)}` : '—'}</span>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-secondary">Dinero contado <span className="text-error">*</span></label>
            <input type="number" min={0} step="0.01" className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none" value={counted} onChange={e => { setCounted(e.target.value); setError(null); }} placeholder="0.00" />
          </div>
        </div>
        {diff !== null && chosen && (
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
