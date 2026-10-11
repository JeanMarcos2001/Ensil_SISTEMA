import React, { useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { AlertTriangle } from 'lucide-react';
import { useData, Item } from '../../context/DataContext';
import { getCurrentPrice, getPriceHistory, todayISO } from '../../utils/inventory';

interface ItemPricesModalProps {
  item: Item | null;
  onClose: () => void;
}

/**
 * Configurar precios de venta (USD): precio general + excepciones por sede, con vigencia e historial.
 * Registrar un precio nuevo cierra la vigencia anterior; nunca se sobrescribe.
 */
export function ItemPricesModal({ item, onClose }: ItemPricesModalProps) {
  const { itemPrices, addItemPrice, branches } = useData();
  const [branchId, setBranchId] = useState('all');
  const [amount, setAmount] = useState('');
  const [validFrom, setValidFrom] = useState(todayISO());
  const [error, setError] = useState<string | null>(null);

  if (!item) return null;

  const today = todayISO();
  const history = getPriceHistory(itemPrices, item.id);
  const branchName = (id: string) => (id === 'all' ? 'General (todas las sedes)' : branches.find(b => b.id === id)?.name ?? id);
  const current = getCurrentPrice(itemPrices, item.id, 'all', today);
  const scopes = ['all', ...branches.map(b => b.id)];

  const handleAdd = () => {
    setError(null);
    const value = parseFloat(amount);
    const result = addItemPrice({ itemId: item.id, branchId, amount: value, validFrom });
    if (!result.ok) {
      setError(result.error ?? 'No se pudo registrar el precio.');
      return;
    }
    setAmount('');
  };

  return (
    <Modal
      isOpen={!!item}
      onClose={onClose}
      title={`Precios de venta — ${item.name}`}
      size="3xl"
      footer={
        <div className="flex justify-end">
          <Button variant="ghost" onClick={onClose}>Cerrar</Button>
        </div>
      }
    >
      <div className="space-y-6 pb-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-surface-muted p-3 rounded-xl border border-border-soft">
            <p className="text-xs text-text-secondary mb-1">Precio general vigente</p>
            <p className="text-sm font-semibold text-text-primary">{current ? `$ ${current.amount.toFixed(2)}` : 'Sin precio'}</p>
          </div>
          <div className="bg-surface-muted p-3 rounded-xl border border-border-soft">
            <p className="text-xs text-text-secondary mb-1">Excepciones por sede vigentes</p>
            <p className="text-sm font-semibold text-text-primary">
              {history.filter(p => p.branchId !== 'all' && p.validFrom <= today && (!p.validTo || today <= p.validTo)).length}
            </p>
          </div>
        </div>

        <section className="space-y-3">
          <h4 className="text-sm font-semibold text-text-primary">Nueva vigencia de precio</h4>
          {error && (
            <div className="bg-danger-tint/50 border border-danger-text/20 rounded-xl p-3 flex gap-2 text-sm text-danger-text">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <p>{error}</p>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">Alcance</label>
              <select
                value={branchId}
                onChange={e => setBranchId(e.target.value)}
                className="w-full h-10 bg-surface border border-border-soft rounded-lg px-3 text-sm focus:outline-none focus:border-primary-accent"
              >
                {scopes.map(id => <option key={id} value={id}>{branchName(id)}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">Precio (USD)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-sm">$</span>
                <input
                  type="number" min="0" step="0.01"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  className="w-full h-10 bg-surface border border-border-soft rounded-lg pl-7 pr-3 text-sm focus:outline-none focus:border-primary-accent"
                  placeholder="0.00"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">Vigente desde</label>
              <input
                type="date"
                value={validFrom}
                onChange={e => setValidFrom(e.target.value)}
                className="w-full h-10 bg-surface border border-border-soft rounded-lg px-3 text-sm focus:outline-none focus:border-primary-accent"
              />
            </div>
          </div>
          <div className="flex justify-between items-center">
            <p className="text-xs text-text-muted">Al registrar un precio se cierra la vigencia anterior del mismo alcance; el historial se conserva.</p>
            <Button variant="primary" onClick={handleAdd}>Registrar precio</Button>
          </div>
        </section>

        <section className="space-y-3">
          <h4 className="text-sm font-semibold text-text-primary">Historial</h4>
          <div className="border border-border-soft rounded-xl overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-text-secondary uppercase bg-surface-muted/50">
                <tr>
                  <th className="px-4 py-2 font-medium">Alcance</th>
                  <th className="px-4 py-2 font-medium">Precio</th>
                  <th className="px-4 py-2 font-medium">Desde</th>
                  <th className="px-4 py-2 font-medium">Hasta</th>
                  <th className="px-4 py-2 font-medium">Registró</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-soft">
                {history.map(p => {
                  const isCurrent = p.validFrom <= today && (!p.validTo || today <= p.validTo);
                  return (
                    <tr key={p.id} className={isCurrent ? 'bg-success-tint/30' : ''}>
                      <td className="px-4 py-2">{branchName(p.branchId)}</td>
                      <td className="px-4 py-2 font-medium">$ {p.amount.toFixed(2)}</td>
                      <td className="px-4 py-2 text-text-secondary">{p.validFrom}</td>
                      <td className="px-4 py-2 text-text-secondary">{p.validTo ?? 'Sin fecha fin'}</td>
                      <td className="px-4 py-2 text-text-secondary">{p.createdBy}</td>
                    </tr>
                  );
                })}
                {history.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-4 text-center text-text-muted text-xs">Aún no hay precios registrados.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </Modal>
  );
}
