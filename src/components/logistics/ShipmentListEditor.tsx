import React, { useState } from 'react';
import { Plus, TriangleAlert, XCircle } from 'lucide-react';
import { Button } from '../ui/Button';
import type { ShipmentItem } from '../../context/DataContext';

export interface ListDraft { destinationId: string; items: ShipmentItem[]; observation: string }

interface Props {
  initial: ListDraft;
  originName: string;
  destinations: { id: string; name: string }[];
  articles: { id: string; name: string }[];
  /** Cuántas unidades hay del artículo en el almacén de origen (solo informa: la base decide al despachar). */
  stockOf: (itemId: string) => number;
  mode: 'create' | 'edit';
  saving: boolean;
  error: string | null;
  canAdvance: boolean;
  onSubmit: (draft: ListDraft, advance: boolean) => void;
  onCancel: () => void;
}

const inputClass = 'w-full h-10 bg-surface border border-border-soft rounded-lg px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent transition-all focus:ring-2 focus:ring-primary-accent/10';

/** «Por armar»: la filial de destino y la lista de lo que se envía. Es el único lugar donde se cambia la lista (las cajas se arman en «Empacando»). */
export function ShipmentListEditor({ initial, originName, destinations, articles, stockOf, mode, saving, error, canAdvance, onSubmit, onCancel }: Props) {
  const [destinationId, setDestinationId] = useState(initial.destinationId);
  const [items, setItems] = useState<ShipmentItem[]>(initial.items.length > 0 ? initial.items : [{ itemId: '', quantity: 1 }]);
  const [observation, setObservation] = useState(initial.observation);

  const setLine = (index: number, patch: Partial<ShipmentItem>) => setItems(items.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  const draft = (): ListDraft => ({ destinationId, items: items.filter(l => l.itemId), observation });
  const chosen = new Set(items.map(l => l.itemId).filter(Boolean));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-text-secondary uppercase tracking-wide">Origen</label>
          <input type="text" className="w-full h-10 bg-surface-muted border border-border-soft rounded-lg px-3 text-sm text-text-muted cursor-not-allowed" value={originName} disabled />
        </div>
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-text-secondary uppercase tracking-wide">Sede destino <span className="text-error">*</span></label>
          <select className={inputClass} value={destinationId} onChange={e => setDestinationId(e.target.value)} aria-label="Sede destino">
            <option value="">Seleccionar filial destino</option>
            {destinations.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-border-soft">
          <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider">Lo que se envía</h3>
          <Button variant="ghost" size="sm" onClick={() => setItems([...items, { itemId: '', quantity: 1 }])} className="gap-1.5 text-primary-accent border border-primary-accent/20">
            <Plus size={14} /> Añadir artículo
          </Button>
        </div>
        <div className="space-y-2">
          {items.map((line, index) => {
            const stock = line.itemId ? stockOf(line.itemId) : null;
            const short = stock !== null && line.quantity > stock;
            return (
              <div key={index} className="space-y-1">
                <div className="flex gap-2 items-center">
                  <select
                    className="flex-1 h-10 bg-surface border border-border-soft rounded-lg px-2 text-sm text-text-primary focus:outline-none focus:border-primary-accent"
                    value={line.itemId}
                    onChange={e => setLine(index, { itemId: e.target.value })}
                    aria-label={`Artículo ${index + 1}`}
                  >
                    <option value="">Artículo…</option>
                    {articles.filter(a => a.id === line.itemId || !chosen.has(a.id)).map(a => (
                      <option key={a.id} value={a.id}>{a.name} ({stockOf(a.id)} en el almacén)</option>
                    ))}
                  </select>
                  <input
                    type="number" min={1}
                    className="w-20 h-10 bg-surface border border-border-soft rounded-lg px-2 text-sm text-center text-text-primary focus:outline-none focus:border-primary-accent"
                    value={line.quantity}
                    onChange={e => setLine(index, { quantity: parseInt(e.target.value, 10) || 0 })}
                    aria-label={`Cantidad del artículo ${index + 1}`}
                  />
                  <button type="button" onClick={() => setItems(items.filter((_, i) => i !== index))} className="text-text-muted hover:text-error transition-colors" aria-label="Quitar artículo" disabled={items.length === 1 && !line.itemId}>
                    <XCircle size={18} />
                  </button>
                </div>
                {short && (
                  <p className="flex items-center gap-1.5 text-[11px] text-warning-text pl-1"><TriangleAlert size={12} />En el almacén hay {stock}: la base no dejará despachar más de lo que hay.</p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">Observación general</label>
        <textarea
          className="w-full bg-surface border border-border-soft rounded-lg p-3 text-sm focus:outline-none focus:border-primary-accent resize-none h-20 transition-all focus:ring-2 focus:ring-primary-accent/10"
          value={observation} onChange={e => setObservation(e.target.value)} placeholder="Notas generales sobre el envío…"
        />
      </div>

      {error && <div role="alert" className="p-3 bg-danger-tint text-danger-text border border-error/20 rounded-lg text-sm flex gap-2 items-start"><TriangleAlert size={16} className="shrink-0 mt-0.5" /><span>{error}</span></div>}

      <div className="flex justify-end gap-3 pt-2 border-t border-border-soft">
        <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
        <Button variant={mode === 'create' ? 'primary' : 'secondary'} onClick={() => onSubmit(draft(), false)} disabled={saving}>
          {saving ? 'Guardando…' : mode === 'create' ? 'Crear envío' : 'Guardar'}
        </Button>
        {mode === 'edit' && canAdvance && <Button variant="primary" onClick={() => onSubmit(draft(), true)} disabled={saving}>Guardar y pasar a «Empacando»</Button>}
      </div>
    </div>
  );
}
