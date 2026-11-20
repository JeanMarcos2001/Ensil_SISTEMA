import React, { useState } from 'react';
import { Package, Plus, Printer, Trash2, TriangleAlert, XCircle } from 'lucide-react';
import { Button } from '../ui/Button';
import type { ShipmentBox, ShipmentItem } from '../../context/DataContext';
import { boxesRemaining } from '../../utils/logisticsDocs';

interface Props {
  /** La lista del envío (lo que hay que repartir en cajas). */
  lines: ShipmentItem[];
  initialBoxes: ShipmentBox[];
  itemName: (id: string) => string;
  saving: boolean;
  error: string | null;
  canEdit: boolean;
  onSave: (boxes: ShipmentBox[], advance: boolean) => void;
  onPrint: (boxes: ShipmentBox[]) => void;
  onBack: () => void;
}

const newBox = (n: number): ShipmentBox => ({ id: `box-${Date.now()}-${n}`, boxNumber: String(n), items: [] });

/** Las cajas sin artículos no se guardan y las que quedan se numeran de nuevo. */
const clean = (boxes: ShipmentBox[]): ShipmentBox[] => boxes.filter(b => b.items.some(i => i.itemId)).map((b, i) => ({ ...b, boxNumber: String(i + 1), items: b.items.filter(it => it.itemId) }));

/**
 * «Empacando»: repartir la lista en cajas. Muestra cuánto falta repartir de cada artículo; el avance se puede guardar a medias, pero para pasar a «Por despachar»
 * todo debe estar repartido (las cajas suman justo la lista). Aquí se habilita la lista impresa para ir marcando lo que se junta en el almacén.
 */
export function ShipmentBoxesEditor({ lines, initialBoxes, itemName, saving, error, canEdit, onSave, onPrint, onBack }: Props) {
  const [boxes, setBoxes] = useState<ShipmentBox[]>(initialBoxes);

  const remaining = boxesRemaining(lines, boxes);
  const remainingOf = (itemId: string) => remaining.find(r => r.itemId === itemId)?.quantity ?? 0;
  const packedOf = (itemId: string) => boxes.reduce((n, b) => n + b.items.filter(i => i.itemId === itemId).reduce((m, i) => m + i.quantity, 0), 0);
  const update = (boxId: string, fn: (b: ShipmentBox) => ShipmentBox) => setBoxes(boxes.map(b => (b.id === boxId ? fn(b) : b)));
  const addBox = () => setBoxes([...boxes, newBox(boxes.length + 1)]);
  const removeBox = (boxId: string) => setBoxes(boxes.filter(b => b.id !== boxId).map((b, i) => ({ ...b, boxNumber: String(i + 1) })));
  const everythingInOneBox = () => setBoxes([{ id: `box-${Date.now()}-1`, boxNumber: '1', items: lines.map(l => ({ itemId: l.itemId, quantity: l.quantity })) }]);

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <div className="flex items-center justify-between pb-2 border-b border-border-soft">
          <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider">Lista del envío</h3>
          {canEdit && boxes.length === 0 && <Button variant="ghost" size="sm" onClick={everythingInOneBox} className="gap-1.5 text-primary-accent border border-primary-accent/20"><Package size={14} />Todo en una sola caja</Button>}
        </div>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-[11px] uppercase tracking-wide text-text-muted"><th className="py-1 font-medium">Artículo</th><th className="py-1 font-medium text-right">En la lista</th><th className="py-1 font-medium text-right">En cajas</th><th className="py-1 font-medium text-right">Falta</th></tr></thead>
          <tbody>
            {lines.map(l => {
              const missing = remainingOf(l.itemId);
              const over = packedOf(l.itemId) > l.quantity;
              return (
                <tr key={l.itemId} className="border-t border-border-soft">
                  <td className="py-1.5 text-text-primary">{itemName(l.itemId)}</td>
                  <td className="py-1.5 text-right text-text-secondary">{l.quantity}</td>
                  <td className="py-1.5 text-right text-text-secondary">{packedOf(l.itemId)}</td>
                  <td className={`py-1.5 text-right font-medium ${over ? 'text-error' : missing > 0 ? 'text-warning-text' : 'text-success-text'}`}>{over ? `+${packedOf(l.itemId) - l.quantity} de más` : missing > 0 ? missing : 'Completo'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-border-soft">
          <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider">Cajas</h3>
          {canEdit && <Button variant="ghost" size="sm" onClick={addBox} className="gap-1.5 text-primary-accent border border-primary-accent/20"><Package size={14} />Añadir caja</Button>}
        </div>
        {boxes.length === 0 && <p className="text-sm text-text-muted text-center py-4">Todavía no hay cajas. Imprima la lista, junte los artículos y arme las cajas aquí.</p>}
        <div className="space-y-3">
          {boxes.map(box => (
            <div key={box.id} className="bg-surface border border-border-soft rounded-xl overflow-hidden shadow-sm">
              <div className="bg-surface-muted px-4 py-2 border-b border-border-soft flex justify-between items-center gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-text-primary uppercase tracking-wider">Caja {box.boxNumber}</span>
                  <input
                    type="text" placeholder="Obs. caja" disabled={!canEdit}
                    className="h-7 bg-surface border border-border-soft rounded-lg px-2 text-[11px] text-text-primary focus:outline-none focus:border-primary-accent w-40"
                    value={box.observation || ''} onChange={e => update(box.id, b => ({ ...b, observation: e.target.value }))}
                  />
                </div>
                {canEdit && <button type="button" onClick={() => removeBox(box.id)} className="text-text-muted hover:text-error transition-colors" aria-label={`Quitar la caja ${box.boxNumber}`}><Trash2 size={16} /></button>}
              </div>
              <div className="p-3 space-y-2">
                {box.items.map((item, index) => (
                  <div key={index} className="flex gap-2 items-center">
                    <select
                      className="flex-1 h-9 bg-surface border border-border-soft rounded-lg px-2 text-xs text-text-primary focus:outline-none focus:border-primary-accent" disabled={!canEdit}
                      value={item.itemId} aria-label={`Artículo de la caja ${box.boxNumber}`}
                      onChange={e => {
                        const itemId = e.target.value;
                        update(box.id, b => ({ ...b, items: b.items.map((it, i) => (i === index ? { itemId, quantity: Math.max(1, remainingOf(itemId) || 1) } : it)) }));
                      }}
                    >
                      <option value="">Artículo…</option>
                      {lines.map(l => <option key={l.itemId} value={l.itemId}>{itemName(l.itemId)} (falta {remainingOf(l.itemId)})</option>)}
                    </select>
                    <input
                      type="number" min={1} disabled={!canEdit}
                      className="w-20 h-9 bg-surface border border-border-soft rounded-lg px-2 text-xs text-center text-text-primary focus:outline-none focus:border-primary-accent"
                      value={item.quantity} aria-label={`Cantidad en la caja ${box.boxNumber}`}
                      onChange={e => update(box.id, b => ({ ...b, items: b.items.map((it, i) => (i === index ? { ...it, quantity: parseInt(e.target.value, 10) || 0 } : it)) }))}
                    />
                    {canEdit && <button type="button" onClick={() => update(box.id, b => ({ ...b, items: b.items.filter((_, i) => i !== index) }))} className="text-text-muted hover:text-error transition-colors" aria-label="Quitar artículo de la caja"><XCircle size={16} /></button>}
                  </div>
                ))}
                {canEdit && (
                  <button type="button" onClick={() => update(box.id, b => ({ ...b, items: [...b.items, { itemId: '', quantity: 1 }] }))} className="w-full py-1.5 border border-dashed border-border-soft rounded-lg text-[11px] text-text-muted hover:text-primary-accent hover:border-primary-accent/40 transition-all flex items-center justify-center gap-1.5">
                    <Plus size={12} /> Añadir artículo
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {error && <div role="alert" className="p-3 bg-danger-tint text-danger-text border border-error/20 rounded-lg text-sm flex gap-2 items-start"><TriangleAlert size={16} className="shrink-0 mt-0.5" /><span>{error}</span></div>}

      <div className="flex flex-wrap justify-between items-center gap-3 pt-2 border-t border-border-soft">
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => onPrint(clean(boxes))} className="gap-2"><Printer size={16} />Imprimir lista</Button>
          {canEdit && <Button variant="ghost" onClick={onBack}>Volver a «Por armar»</Button>}
        </div>
        {canEdit && (
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => onSave(clean(boxes), false)} disabled={saving}>{saving ? 'Guardando…' : 'Guardar cajas'}</Button>
            <Button variant="primary" onClick={() => onSave(clean(boxes), true)} disabled={saving}>Guardar y pasar a «Por despachar»</Button>
          </div>
        )}
      </div>
    </div>
  );
}
