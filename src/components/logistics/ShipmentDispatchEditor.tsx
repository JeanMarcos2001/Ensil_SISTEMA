import React, { useState } from 'react';
import { Printer, Share2, TriangleAlert } from 'lucide-react';
import { Button } from '../ui/Button';
import { DateInput } from '../ui/DateInput';
import { arrivalHourOptions } from '../../utils/logisticsDocs';

export interface DispatchDraft {
  eta: string; etaTime: string; shippingMethodId: string; courierId: string; trackingNumber: string; additionalReference: string;
  travelerName: string; travelerDocument: string; shippingObservation: string; observation: string;
}

interface Props {
  initial: DispatchDraft;
  methods: { id: string; name: string }[];
  couriers: { id: string; name: string }[];
  /** Lo que todavía falta para despachar (se calcula con las reglas; solo informa). */
  pending: (draft: DispatchDraft) => string[];
  saving: boolean;
  error: string | null;
  canEdit: boolean;
  canDispatch: boolean;
  /** Por qué no se puede despachar (por ejemplo, nadie recibiría en la sede destino) y avisos que no impiden. */
  dispatchBlocked: string | null;
  dispatchAdvisories: string[];
  onSave: (draft: DispatchDraft, dispatch: boolean) => void;
  onPrint: (draft: DispatchDraft) => void;
  onShare: (draft: DispatchDraft) => void;
  onBack: () => void;
}

const inputClass = 'w-full h-10 bg-surface border border-border-soft rounded-lg px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent transition-all focus:ring-2 focus:ring-primary-accent/10 disabled:bg-surface-muted disabled:text-text-muted';
const label = (text: string, required = false) => <label className="block truncate text-xs font-medium text-text-secondary uppercase tracking-wide">{text}{required && <span className="text-error"> *</span>}</label>;

/** «Por despachar»: el transporte, la fecha y la hora de llegada. Aquí se imprime la lista completa y se puede compartir por WhatsApp; pasar a «En tránsito» despacha. */
export function ShipmentDispatchEditor({ initial, methods, couriers, pending, saving, error, canEdit, canDispatch, dispatchBlocked, dispatchAdvisories, onSave, onPrint, onShare, onBack }: Props) {
  const [d, setD] = useState<DispatchDraft>(initial);
  const set = (patch: Partial<DispatchDraft>) => setD({ ...d, ...patch });
  const method = methods.find(m => m.id === d.shippingMethodId);
  const name = method?.name.toLowerCase() ?? '';
  const isCourier = name.includes('courier');
  const isTraveler = name.includes('viajero');
  const missing = pending(d);

  return (
    <div className="space-y-6">
      {missing.length > 0 && (
        <div className="p-3 bg-warning-tint text-warning-text border border-warning/30 rounded-lg text-sm">
          <p className="font-medium flex items-center gap-1.5"><TriangleAlert size={14} />Datos pendientes para despachar</p>
          <ul className="list-disc pl-6 mt-1 space-y-0.5">{missing.map(m => <li key={m}>{m}</li>)}</ul>
        </div>
      )}

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider pb-2 border-b border-border-soft">Llegada</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5 min-w-0">
            {label('Fecha de llegada', true)}
            <DateInput className={inputClass} value={d.eta} placeholder="Elegir fecha" disabled={!canEdit} onChange={e => set({ eta: e.target.value })} />
          </div>
          <div className="space-y-1.5 min-w-0">
            {label('Hora de llegada', true)}
            <select aria-label="Hora de llegada" className={inputClass} value={d.etaTime} disabled={!canEdit} onChange={e => set({ etaTime: e.target.value })}>
              <option value="">Elegir hora</option>
              {arrivalHourOptions(d.etaTime).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>
        <p className="text-[11px] text-text-muted">La sede podrá recibirlo desde esa fecha y hora (de 6 a. m. a 10 p. m.).</p>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider pb-2 border-b border-border-soft">Transporte</h3>
        <div className="space-y-1.5">
          {label('Método de envío', true)}
          <select className={inputClass} value={d.shippingMethodId} disabled={!canEdit} onChange={e => set({ shippingMethodId: e.target.value })} aria-label="Método de envío">
            <option value="">Seleccionar método</option>
            {methods.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        {method && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-surface-muted p-4 rounded-xl border border-border-soft">
            {isCourier && (
              <>
                <div className="space-y-1.5">{label('Courier', true)}
                  <select className={inputClass} value={d.courierId} disabled={!canEdit} onChange={e => set({ courierId: e.target.value })} aria-label="Courier">
                    <option value="">Seleccionar courier</option>
                    {couriers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">{label('Número de guía', true)}
                  <input type="text" className={inputClass} value={d.trackingNumber} disabled={!canEdit} onChange={e => set({ trackingNumber: e.target.value })} placeholder="Ej. TRK-123456" />
                </div>
                <div className="space-y-1.5 md:col-span-2">{label('Código adicional / referencia')}
                  <input type="text" className={inputClass} value={d.additionalReference} disabled={!canEdit} onChange={e => set({ additionalReference: e.target.value })} placeholder="Opcional" />
                </div>
              </>
            )}
            {isTraveler && (
              <>
                <div className="space-y-1.5">{label('Nombre del viajero', true)}
                  <input type="text" className={inputClass} value={d.travelerName} disabled={!canEdit} onChange={e => set({ travelerName: e.target.value })} />
                </div>
                <div className="space-y-1.5">{label('Documento del viajero')}
                  <input type="text" className={inputClass} value={d.travelerDocument} disabled={!canEdit} onChange={e => set({ travelerDocument: e.target.value })} placeholder="Opcional" />
                </div>
                <div className="space-y-1.5 md:col-span-2">{label('Observación')}
                  <input type="text" className={inputClass} value={d.shippingObservation} disabled={!canEdit} onChange={e => set({ shippingObservation: e.target.value })} />
                </div>
              </>
            )}
            {!isCourier && !isTraveler && (
              <div className="space-y-1.5 md:col-span-2">{label('Observación', true)}
                <input type="text" className={inputClass} value={d.shippingObservation} disabled={!canEdit} onChange={e => set({ shippingObservation: e.target.value })} placeholder="Detalles del recojo o método alternativo" />
              </div>
            )}
          </div>
        )}
      </section>

      <div className="space-y-1.5">
        {label('Observación general')}
        <textarea
          className="w-full bg-surface border border-border-soft rounded-lg p-3 text-sm focus:outline-none focus:border-primary-accent resize-none h-16 disabled:bg-surface-muted"
          value={d.observation} disabled={!canEdit} onChange={e => set({ observation: e.target.value })} placeholder="Notas generales sobre el envío…"
        />
      </div>

      {error && <div role="alert" className="p-3 bg-danger-tint text-danger-text border border-error/20 rounded-lg text-sm flex gap-2 items-start"><TriangleAlert size={16} className="shrink-0 mt-0.5" /><span>{error}</span></div>}
      {canDispatch && dispatchBlocked && <p className="text-sm text-danger-text">{dispatchBlocked}</p>}
      {canDispatch && dispatchAdvisories.map(a => <p key={a} className="text-xs text-warning-text">{a}</p>)}

      <div className="flex flex-wrap justify-between items-center gap-3 pt-2 border-t border-border-soft">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => onPrint(d)} className="gap-2"><Printer size={16} />Imprimir lista</Button>
          <Button variant="secondary" onClick={() => onShare(d)} className="gap-2"><Share2 size={16} />Compartir por WhatsApp</Button>
          {canEdit && <Button variant="ghost" onClick={onBack}>Volver a «Empacando»</Button>}
        </div>
        <div className="flex gap-3">
          {canEdit && <Button variant="secondary" onClick={() => onSave(d, false)} disabled={saving}>{saving ? 'Guardando…' : 'Guardar datos'}</Button>}
          {canDispatch && <Button variant="primary" onClick={() => onSave(d, true)} disabled={saving || !!dispatchBlocked}>Guardar y despachar…</Button>}
        </div>
      </div>
    </div>
  );
}
