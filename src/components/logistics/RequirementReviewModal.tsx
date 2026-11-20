import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Ban, TriangleAlert } from 'lucide-react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { ReasonDialog } from '../ui/ReasonDialog';
import { RequirementThread } from './RequirementThread';
import { useData, type Shipment } from '../../context/DataContext';
import {
  committedByItem, requirementOpenError, requirementReviewError, requirementReviewRows, REQUIREMENT_STALE_MESSAGE, type Requirement,
} from '../../utils/requirements';

interface Props {
  requirementId: string | null;
  onClose: () => void;
  /** Se pasó a «Empacando»: nació este envío. */
  onMoved?: (shipmentId: string | undefined) => void;
}

const day = (iso: string) => iso.split('-').reverse().join('/');
const initialSends = (req: Requirement): Record<string, string> => Object.fromEntries(req.lines.map(l => [l.itemId, String(l.send ?? l.quantity)]));

/**
 * «Verificar existencia»: lo que pidió la sede frente a lo que hay en el almacén y a lo que ya está comprometido en otras tarjetas. Logística **solo reduce**
 * las cantidades (0 = sin stock) o rechaza el requerimiento con su motivo. No se reserva stock (la base decide al despachar): es una ayuda para repartir lo
 * que hay entre las sedes. Al abrirla, la tarjeta deja de parpadear para todos.
 */
export function RequirementReviewModal({ requirementId, onClose, onMoved }: Props) {
  const {
    requirements, shipments, stockItems, items, stockLocations, openRequirementReview, reviewRequirement, rejectRequirement, moveRequirementToPacking, can,
  } = useData();
  const req = requirementId ? requirements.find(r => r.id === requirementId) : undefined;
  const [sends, setSends] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  // La versión del requerimiento que se vio al abrirlo: si otra persona lo cambia mientras tanto, se avisa y no se pisa
  const seenVersion = useRef<number | undefined>(undefined);
  const openedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!requirementId || !req) { openedFor.current = null; return; }
    if (openedFor.current === requirementId) return;
    openedFor.current = requirementId;
    setSends(initialSends(req)); setError(null); setRejecting(false);
    seenVersion.current = req.version;
    void openRequirementReview(requirementId);
  }, [requirementId, req, openRequirementReview]);

  const itemName = (id: string) => items.find(i => i.id === id)?.name ?? id;
  const stockOf = (itemId: string) => (req ? stockItems.find(s => s.itemId === itemId && s.branchId === req.warehouseId)?.stock ?? 0 : 0);
  const committed = useMemo(() => (req ? committedByItem(shipments as Shipment[], requirements, req.id) : new Map<string, number>()), [req, shipments, requirements]);
  const rows = req ? requirementReviewRows(req, stockOf, committed, itemName) : [];
  const branchName = req ? stockLocations.find(l => l.id === req.branchId)?.name ?? req.branchId : '';

  const stale = !!req && seenVersion.current !== undefined && req.version !== seenVersion.current;
  const closed = req ? requirementOpenError(req, shipments) : null;
  const parsed = (): Record<string, number> => Object.fromEntries((req?.lines ?? []).map(l => [l.itemId, sends[l.itemId]?.trim() === '' ? NaN : Number(sends[l.itemId])]));
  const sendTotal = rows.reduce((n, r) => n + (Number.isFinite(Number(sends[r.itemId])) ? Number(sends[r.itemId]) : 0), 0);

  const refresh = () => {
    if (!req) return;
    setSends(initialSends(req)); setError(null); seenVersion.current = req.version;
  };

  const fitToAvailable = () => setSends(Object.fromEntries(rows.map(r => [r.itemId, String(r.suggested)])));

  /** Guarda las cantidades (y, si se pide, pasa el requerimiento a «Empacando»). Con la versión que se vio al abrirlo. */
  const save = async (advance: boolean) => {
    if (!req || saving) return;
    const values = parsed();
    const invalid = requirementReviewError(req, values, itemName);
    if (invalid) { setError(invalid); return; }
    setSaving(true); setError(null);
    const saved = await reviewRequirement(req.id, values, seenVersion.current);
    if (!saved.ok) { setSaving(false); setError(saved.error ?? 'No se pudieron guardar las cantidades.'); return; }
    if (!advance) { setSaving(false); onClose(); return; }
    // Las cantidades guardadas subieron la versión: el paso siguiente no debe compararla con la que se vio antes de guardar
    const moved = await moveRequirementToPacking(req.id);
    setSaving(false);
    if (!moved.ok) { setError(moved.error ?? 'Se guardaron las cantidades, pero no se pudo pasar el requerimiento a «Empacando».'); return; }
    onMoved?.(moved.id);
    onClose();
  };

  return (
    <>
      <Modal
        isOpen={!!req && !rejecting} onClose={onClose} size="4xl" title={`Verificar existencia · ${req?.id ?? ''}`}
        footer={
          <div className="flex flex-col items-end gap-2 w-full">
            {error && <p role="alert" className="self-start text-sm text-danger-text flex items-start gap-1.5"><TriangleAlert size={14} className="shrink-0 mt-0.5" />{error}</p>}
            <div className="flex flex-wrap justify-between gap-3 w-full">
              <Button variant="ghost" className="gap-1.5 text-danger-text" onClick={() => setRejecting(true)} disabled={saving || !!closed || !can('log-requerimientos:attend')}>
                <Ban size={14} />Rechazar…
              </Button>
              <div className="flex flex-wrap justify-end gap-3">
                <Button variant="ghost" onClick={onClose}>Cerrar</Button>
                <Button variant="secondary" onClick={() => void save(false)} disabled={saving || !!closed || stale || !can('log-requerimientos:attend')}>{saving ? 'Guardando…' : 'Guardar cantidades'}</Button>
                <Button variant="primary" onClick={() => void save(true)} disabled={saving || !!closed || stale || sendTotal === 0 || !can('log-requerimientos:attend') || !can('log-envios:create')}
                  title={sendTotal === 0 ? 'Todas las cantidades están en 0: rechace el requerimiento con su motivo.' : undefined}>
                  Guardar y pasar a «Empacando»
                </Button>
              </div>
            </div>
          </div>
        }
      >
        {req && (
          <div className="space-y-5">
            <div className="bg-surface-muted p-4 rounded-xl border border-border-soft grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-text-secondary block mb-1">Sede que pide:</span><span className="font-medium text-text-primary">{branchName}</span></div>
              <div><span className="text-text-secondary block mb-1">Fecha:</span><span className="font-medium text-text-primary">{day(req.date)}{req.createdBy ? ` · ${req.createdBy}` : ''}</span></div>
              {req.note && <div className="col-span-2"><span className="text-text-secondary block mb-1">Nota de la sede:</span><span className="text-text-primary whitespace-pre-wrap">{req.note}</span></div>}
            </div>

            {(stale || closed) && (
              <div role="alert" className="p-3 bg-warning-tint text-warning-text border border-warning/30 rounded-lg text-sm flex flex-wrap items-center gap-3 justify-between">
                <span className="flex items-start gap-1.5"><TriangleAlert size={14} className="shrink-0 mt-0.5" />{closed ?? REQUIREMENT_STALE_MESSAGE}</span>
                {!closed && <Button variant="secondary" size="sm" onClick={refresh}>Actualizar</Button>}
              </div>
            )}

            <section className="space-y-2" aria-label="Lo pedido frente a lo que hay">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-border-soft">
                <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider">Lo pedido frente a lo que hay</h3>
                <Button variant="ghost" size="sm" className="text-primary-accent border border-primary-accent/20" onClick={fitToAvailable} disabled={saving || !!closed}>Ajustar a lo disponible</Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-text-muted uppercase tracking-wider">
                      <th className="py-2 pr-3 font-medium">Artículo</th>
                      <th className="py-2 px-2 font-medium text-right">Pidió</th>
                      <th className="py-2 px-2 font-medium text-right">En el almacén</th>
                      <th className="py-2 px-2 font-medium text-right" title="Lo que ya está en las listas de otros envíos que todavía no salieron y en otros requerimientos ya verificados">Ya en otras tarjetas</th>
                      <th className="py-2 px-2 font-medium text-right">Disponible</th>
                      <th className="py-2 pl-2 font-medium text-right">Se enviará</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-soft">
                    {rows.map(r => {
                      const value = Number(sends[r.itemId]);
                      const over = Number.isFinite(value) && value > r.available;
                      return (
                        <tr key={r.itemId}>
                          <td className="py-2 pr-3 text-text-primary">{r.name}</td>
                          <td className="py-2 px-2 text-right text-text-secondary">{r.requested}</td>
                          <td className="py-2 px-2 text-right text-text-secondary">{r.stock}</td>
                          <td className="py-2 px-2 text-right text-text-secondary">{r.committed}</td>
                          <td className={`py-2 px-2 text-right font-medium ${r.short ? 'text-warning-text' : 'text-success-text'}`}>{r.available}</td>
                          <td className="py-2 pl-2 text-right">
                            <input
                              type="number" min={0} max={r.requested} inputMode="numeric"
                              className={`w-20 h-9 bg-surface border rounded-lg px-2 text-sm text-center text-text-primary focus:outline-none focus:border-primary-accent ${over ? 'border-warning' : 'border-border-soft'}`}
                              value={sends[r.itemId] ?? ''} disabled={saving || !!closed}
                              onChange={e => setSends(prev => ({ ...prev, [r.itemId]: e.target.value }))}
                              aria-label={`Cantidad que se enviará de ${r.name}`}
                            />
                            {over && <p className="text-[11px] text-warning-text mt-0.5">Supera lo disponible</p>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-text-muted">
                Solo se puede reducir lo pedido (0 = sin stock). No se reserva stock: la base decide al despachar, así que es solo una ayuda para repartir lo que hay entre las sedes.
                Se enviará en total {sendTotal} unidad{sendTotal === 1 ? '' : 'es'}.
              </p>
            </section>

            <RequirementThread requirementId={req.id} />
          </div>
        )}
      </Modal>

      <ReasonDialog
        isOpen={rejecting && !!req} onClose={() => setRejecting(false)} title={`Rechazar el requerimiento ${req?.id ?? ''}`} size="lg"
        confirmLabel="Rechazar requerimiento" danger detailLabel="Motivo del rechazo" detailPlaceholder="Por qué no se atenderá (la sede lo verá)…"
        onSubmit={async ({ detail }) => {
          if (!req) return;
          const res = await rejectRequirement(req.id, detail, seenVersion.current);
          if (!res.ok) return res.error ?? 'No se pudo rechazar el requerimiento.';
          onClose();
        }}
      >
        <p className="text-sm text-text-secondary">La sede verá que se rechazó y el motivo que escriba aquí. El requerimiento deja de estar en «Por armar» y ya no admite mensajes.</p>
      </ReasonDialog>
    </>
  );
}
