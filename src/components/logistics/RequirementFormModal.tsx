import React, { useEffect, useState } from 'react';
import { Plus, TriangleAlert, XCircle } from 'lucide-react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { useData } from '../../context/DataContext';
import { centralWarehouse } from '../../utils/logisticsRoutes';
import { requirementDraftError, REQUIREMENT_LIMITS } from '../../utils/requirements';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** La sede que pide (la que se está viendo). */
  branchId: string;
  /** Se envió: el código que le asignó la base. */
  onCreated: (id: string | undefined) => void;
}

interface Line { itemId: string; quantity: number }

/**
 * «Armar requerimiento»: la sede pide mercadería al almacén central (artículos y cantidades, y una nota opcional). Una vez enviado la sede ya no lo edita: si algo
 * cambia, escribe un mensaje anclado desde el detalle. Logística revisa la existencia y solo puede reducir lo pedido o rechazarlo con su motivo.
 */
export function RequirementFormModal({ isOpen, onClose, branchId, onCreated }: Props) {
  const { items, warehouses, stockLocations, addRequirement, can } = useData();
  const [lines, setLines] = useState<Line[]>([{ itemId: '', quantity: 1 }]);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) { setLines([{ itemId: '', quantity: 1 }]); setNote(''); setError(null); setSaving(false); }
  }, [isOpen]);

  const warehouse = centralWarehouse(warehouses);
  const branchName = stockLocations.find(l => l.id === branchId)?.name ?? branchId;
  const articles = items.filter(i => i.status === 'Activo').sort((a, b) => a.name.localeCompare(b.name));
  const chosen = new Set(lines.map(l => l.itemId).filter(Boolean));
  const setLine = (index: number, patch: Partial<Line>) => setLines(lines.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  const inputClass = 'w-full h-10 bg-surface border border-border-soft rounded-lg px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent transition-all focus:ring-2 focus:ring-primary-accent/10';

  const submit = async () => {
    if (saving) return;
    const draft = { branchId, warehouseId: warehouse?.id ?? '', lines: lines.filter(l => l.itemId), note };
    const invalid = requirementDraftError(draft, items.map(i => ({ id: i.id, name: i.name, status: i.status })));
    if (invalid) { setError(invalid); return; }
    setSaving(true); setError(null);
    const res = await addRequirement(draft);
    setSaving(false);
    if (!res.ok) { setError(res.error ?? 'No se pudo enviar el requerimiento.'); return; }
    onCreated(res.id);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen} onClose={onClose} size="2xl" title="Armar requerimiento"
      footer={
        <div className="flex justify-end gap-3 w-full">
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button variant="primary" onClick={() => void submit()} disabled={saving || !can('log-requerimientos:create')}>{saving ? 'Enviando…' : 'Enviar a Logística'}</Button>
        </div>
      }
    >
      <div className="space-y-6">
        <p className="text-sm text-text-secondary">
          Pida al almacén central lo que necesita su sede. Logística revisará la existencia y podrá reducir las cantidades o rechazarlo con su motivo; usted verá aquí cómo
          cambia su lista. Una vez enviado ya no se edita: si algo cambia, escriba un mensaje desde el detalle.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-text-secondary uppercase tracking-wide">Sede que pide</label>
            <input type="text" className="w-full h-10 bg-surface-muted border border-border-soft rounded-lg px-3 text-sm text-text-muted cursor-not-allowed" value={branchName} disabled aria-label="Sede que pide" />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-text-secondary uppercase tracking-wide">Se pide a</label>
            <input type="text" className="w-full h-10 bg-surface-muted border border-border-soft rounded-lg px-3 text-sm text-text-muted cursor-not-allowed" value={warehouse?.name ?? 'Sin almacén central activo'} disabled aria-label="Se pide a" />
          </div>
        </div>

        <section className="space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-border-soft">
            <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider">Lo que se pide</h3>
            <Button variant="ghost" size="sm" onClick={() => setLines([...lines, { itemId: '', quantity: 1 }])} disabled={lines.length >= REQUIREMENT_LIMITS.maxLines} className="gap-1.5 text-primary-accent border border-primary-accent/20">
              <Plus size={14} /> Añadir artículo
            </Button>
          </div>
          <div className="space-y-2">
            {lines.map((line, index) => (
              <div key={index} className="flex gap-2 items-center">
                <select
                  className="flex-1 h-10 bg-surface border border-border-soft rounded-lg px-2 text-sm text-text-primary focus:outline-none focus:border-primary-accent"
                  value={line.itemId} onChange={e => setLine(index, { itemId: e.target.value })} aria-label={`Artículo ${index + 1}`}
                >
                  <option value="">Artículo…</option>
                  {articles.filter(a => a.id === line.itemId || !chosen.has(a.id)).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <input
                  type="number" min={1} max={REQUIREMENT_LIMITS.maxQuantity}
                  className="w-24 h-10 bg-surface border border-border-soft rounded-lg px-2 text-sm text-center text-text-primary focus:outline-none focus:border-primary-accent"
                  value={line.quantity} onChange={e => setLine(index, { quantity: parseInt(e.target.value, 10) || 0 })} aria-label={`Cantidad del artículo ${index + 1}`}
                />
                <button type="button" onClick={() => setLines(lines.filter((_, i) => i !== index))} className="text-text-muted hover:text-error transition-colors" aria-label="Quitar artículo" disabled={lines.length === 1 && !line.itemId}>
                  <XCircle size={18} />
                </button>
              </div>
            ))}
          </div>
        </section>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-text-secondary uppercase tracking-wide" htmlFor="requirement-note">Nota para Logística (opcional)</label>
          <textarea
            id="requirement-note"
            className="w-full bg-surface border border-border-soft rounded-lg p-3 text-sm focus:outline-none focus:border-primary-accent resize-none h-20 transition-all focus:ring-2 focus:ring-primary-accent/10"
            value={note} onChange={e => setNote(e.target.value)} maxLength={REQUIREMENT_LIMITS.noteMax} placeholder="Para qué lo necesita o para cuándo…"
          />
        </div>

        {error && <div role="alert" className="p-3 bg-danger-tint text-danger-text border border-error/20 rounded-lg text-sm flex gap-2 items-start"><TriangleAlert size={16} className="shrink-0 mt-0.5" /><span>{error}</span></div>}
      </div>
    </Modal>
  );
}
