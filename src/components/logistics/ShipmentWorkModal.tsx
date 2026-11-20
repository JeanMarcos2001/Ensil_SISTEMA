import React, { useRef, useState } from 'react';
import { Printer, RefreshCw, TriangleAlert } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { useData, type Shipment, type ShipmentBox, type ShipmentItem } from '../../context/DataContext';
import { centralWarehouse } from '../../utils/logisticsRoutes';
import { etaLabel, SHIPMENT_STALE_MESSAGE, shipmentStageMissing, type TransportCatalog } from '../../utils/logisticsDocs';
import { checklistFromShipment, shipmentChecklistHtml, shipmentShareText, whatsappShareUrl, type ChecklistNames } from '../../utils/shipmentPrint';
import { printHtml } from '../../utils/printTable';
import { localStamp } from '../../utils/stockDb';
import { todayLocalISO } from '../../utils/schedule';
import { ShipmentListEditor, type ListDraft } from './ShipmentListEditor';
import { ShipmentBoxesEditor } from './ShipmentBoxesEditor';
import { ShipmentDispatchEditor, type DispatchDraft } from './ShipmentDispatchEditor';

interface Props {
  /** El envío que se trabaja (su id: siempre se muestra la versión que quedó guardada). */
  shipmentId: string | null;
  /** Crear un envío nuevo (nace en «Por armar»). */
  creating: boolean;
  onClose: () => void;
  onRequestDispatch: (id: string) => void;
  onRequestCancel: (shipment: Shipment) => void;
  onRequestManualEnable: (shipment: Shipment) => void;
  onInfo: (title: string, text: string) => void;
}

export const statusBadge = (status: string): 'neutral' | 'secondary' | 'primary' | 'warning' | 'info' | 'success' | 'danger' => {
  switch (status) {
    case 'Por armar': return 'neutral';
    case 'Empacando': return 'secondary';
    case 'Por despachar': return 'primary';
    case 'En tránsito': return 'warning';
    case 'Listo para recepción': return 'info';
    case 'Recibido': return 'success';
    case 'Recibido con diferencias': return 'warning';
    case 'Cancelado': return 'danger';
    default: return 'neutral';
  }
};

/**
 * La ventana de trabajo de una tarjeta: cada columna del tablero tiene su propio editor (la lista en «Por armar», las cajas en «Empacando», el transporte en
 * «Por despachar»); un envío que ya salió solo se ve. Lo que se guarda es lo que quedó en la base (la lista se vuelve a leer después de cada operación).
 */
export function ShipmentWorkModal({ shipmentId, creating, onClose, onRequestDispatch, onRequestCancel, onRequestManualEnable, onInfo }: Props) {
  const d = useData();
  const shipment = shipmentId ? d.shipments.find(s => s.id === shipmentId) : undefined;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Cuántas veces se pidió «Actualizar» (vuelve a armar el editor con lo que quedó guardado). */
  const [reloads, setReloads] = useState(0);
  /** La versión de la tarjeta que se vio al abrir el editor de su columna: es la que se manda al guardar (si alguien la cambió en el medio, la base no guarda). */
  const seen = useRef<{ key: string; version?: number }>({ key: '' });

  const open = creating || !!shipment;
  const warehouse = centralWarehouse(d.warehouses);
  const originId = warehouse?.id ?? '';
  const originName = warehouse?.name ?? 'Almacén central';
  const catalog: TransportCatalog = { methods: d.shippingMethods, couriers: d.couriers, itemIds: d.items.map(i => i.id) };
  const itemName = (id: string) => d.items.find(i => i.id === id)?.name ?? 'Artículo desconocido';
  const placeName = (id: string) => d.stockLocations.find(l => l.id === id)?.name ?? id;
  const stockOf = (itemId: string) => d.stockItems.find(s => s.itemId === itemId && s.branchId === originId)?.stock ?? 0;
  const names: ChecklistNames = {
    place: placeName, item: itemName,
    method: id => d.shippingMethods.find(m => m.id === id)?.name ?? '',
    courier: id => d.couriers.find(c => c.id === id)?.name,
  };

  const finish = async (operation: Promise<{ ok: boolean; error?: string }>, onOk: () => void) => {
    if (saving) return;
    setSaving(true); setError(null);
    const res = await operation;
    setSaving(false);
    if (!res.ok) {
      setError(res.error ?? 'No se pudo guardar.');
      if (res.error === SHIPMENT_STALE_MESSAGE) void d.reloadLogisticsDocuments();
      return;
    }
    onOk();
  };
  const close = () => { setError(null); onClose(); };

  const print = (current: Shipment, patch: Partial<Shipment> = {}) => {
    const html = shipmentChecklistHtml(checklistFromShipment({ ...current, ...patch }, names), new Date().toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' }));
    if (!printHtml(html)) onInfo('No se pudo imprimir', 'El navegador no abrió la ventana de impresión. Intente de nuevo.');
  };
  const share = (current: Shipment, patch: Partial<Shipment> = {}) => {
    const text = shipmentShareText(checklistFromShipment({ ...current, ...patch }, names));
    window.open(whatsappShareUrl(text), '_blank', 'noopener,noreferrer');
  };

  if (!open) return null;
  const canEdit = d.can('log-envios:edit');
  const canDispatch = d.can('log-envios:dispatch');

  // ---- Crear
  if (creating) {
    return (
      <Modal isOpen onClose={close} title="Crear envío" size="2xl">
        <ShipmentListEditor
          initial={{ destinationId: '', items: [], observation: '' }}
          originName={originName}
          destinations={d.branches.filter(b => b.status === 'Activo').map(b => ({ id: b.id, name: b.name }))}
          articles={d.items.map(i => ({ id: i.id, name: i.name }))}
          stockOf={stockOf} mode="create" saving={saving} error={error} canAdvance={false}
          onCancel={close}
          onSubmit={draft => finish(
            d.addShipment({ date: todayLocalISO(), originId, destinationId: draft.destinationId, status: 'Por armar', boxes: [], items: draft.items, ...(draft.observation.trim() ? { observation: draft.observation.trim() } : {}) }),
            close,
          )}
        />
      </Modal>
    );
  }
  if (!shipment) return null;

  const editorKey = `${shipment.id}-${shipment.status}-${reloads}`;
  if (seen.current.key !== editorKey) seen.current = { key: editorKey, version: shipment.version };
  const seenVersion = seen.current.version;
  const stale = seenVersion !== undefined && shipment.version !== undefined && shipment.version > seenVersion;
  /** Todo cambio de la tarjeta lleva la versión que se vio al abrir su editor (solo si se conoce: una base anterior a la 0030 no la tiene). */
  const withVersion = (patch: Partial<Shipment>): Partial<Shipment> => (seenVersion !== undefined ? { ...patch, version: seenVersion } : patch);
  const staleBanner = stale && (
    <div role="status" className="mb-4 p-3 bg-warning-tint text-warning-text border border-warning/30 rounded-lg text-sm flex flex-wrap items-center justify-between gap-3">
      <span className="flex items-start gap-2"><TriangleAlert size={16} className="shrink-0 mt-0.5" />Otra persona cambió esta tarjeta mientras la tenía abierta. Actualice para ver lo nuevo (se pierde lo que no guardó).</span>
      <Button variant="secondary" size="sm" className="gap-1.5" onClick={() => { setError(null); setReloads(n => n + 1); }}><RefreshCw size={13} />Actualizar</Button>
    </div>
  );
  const moveTo = (status: Shipment['status']) => finish(d.updateShipment(shipment.id, withVersion({ status })), () => {});
  const header = (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-5 pb-4 border-b border-border-soft">
      <div className="text-sm text-text-secondary space-y-0.5">
        <p><span className="text-text-muted">Ruta:</span> <span className="font-medium text-text-primary">{placeName(shipment.originId)} → {placeName(shipment.destinationId)}</span></p>
        <p><span className="text-text-muted">Creado el</span> {etaLabel(shipment.date)}{shipment.dispatchedAt ? <> · <span className="text-text-muted">Despachado el</span> {localStamp(shipment.dispatchedAt)}</> : null}</p>
      </div>
      <Badge variant={statusBadge(shipment.status)}>{shipment.status}</Badge>
    </div>
  );
  const title = `Envío ${shipment.id}`;

  // ---- Por armar
  if (shipment.status === 'Por armar') {
    return (
      <Modal isOpen onClose={close} title={title} size="2xl">
        {header}
        {staleBanner}
        <ShipmentListEditor
          key={editorKey}
          initial={{ destinationId: shipment.destinationId, items: shipment.items, observation: shipment.observation ?? '' }}
          originName={originName}
          destinations={d.branches.filter(b => b.status === 'Activo' || b.id === shipment.destinationId).map(b => ({ id: b.id, name: b.name }))}
          articles={d.items.map(i => ({ id: i.id, name: i.name }))}
          stockOf={stockOf} mode="edit" saving={saving} error={error} canAdvance={canEdit}
          onCancel={close}
          onSubmit={(draft: ListDraft, advance) => finish(
            d.updateShipment(shipment.id, withVersion({ destinationId: draft.destinationId, items: draft.items, observation: draft.observation.trim() || undefined, ...(advance ? { status: 'Empacando' as const } : {}) })),
            advance ? () => {} : close,
          )}
        />
        {!canEdit && <p className="text-xs text-text-muted mt-3">No tiene permiso para editar envíos: solo puede verlo.</p>}
      </Modal>
    );
  }

  // ---- Empacando
  if (shipment.status === 'Empacando') {
    return (
      <Modal isOpen onClose={close} title={title} size="3xl">
        {header}
        {staleBanner}
        <ShipmentBoxesEditor
          key={editorKey}
          lines={shipment.items} initialBoxes={shipment.boxes} itemName={itemName}
          saving={saving} error={error} canEdit={canEdit}
          onPrint={boxes => print(shipment, { boxes })}
          onBack={() => moveTo('Por armar')}
          onSave={(boxes: ShipmentBox[], advance) => finish(
            d.updateShipment(shipment.id, withVersion({ boxes, ...(advance ? { status: 'Por despachar' as const } : {}) })),
            advance ? () => {} : close,
          )}
        />
      </Modal>
    );
  }

  // ---- Por despachar
  if (shipment.status === 'Por despachar') {
    const dest = d.stockLocations.find(l => l.id === shipment.destinationId);
    const availability = dest ? d.availabilityOf('log-envios:dispatch', { branchId: dest.id, branchName: dest.name }) : null;
    const asShipment = (draft: DispatchDraft): Partial<Shipment> => ({
      eta: draft.eta || undefined, etaTime: draft.etaTime || undefined, shippingMethodId: draft.shippingMethodId || undefined, courierId: draft.courierId || undefined,
      trackingNumber: draft.trackingNumber.trim() || undefined, additionalReference: draft.additionalReference.trim() || undefined, travelerName: draft.travelerName.trim() || undefined,
      travelerDocument: draft.travelerDocument.trim() || undefined, shippingObservation: draft.shippingObservation.trim() || undefined, observation: draft.observation.trim() || undefined,
    });
    return (
      <Modal isOpen onClose={close} title={title} size="3xl">
        {header}
        {staleBanner}
        <ShipmentDispatchEditor
          key={editorKey}
          initial={{
            eta: shipment.eta ?? '', etaTime: shipment.etaTime ?? '', shippingMethodId: shipment.shippingMethodId ?? '', courierId: shipment.courierId ?? '', trackingNumber: shipment.trackingNumber ?? '',
            additionalReference: shipment.additionalReference ?? '', travelerName: shipment.travelerName ?? '', travelerDocument: shipment.travelerDocument ?? '',
            shippingObservation: shipment.shippingObservation ?? '', observation: shipment.observation ?? '',
          }}
          methods={d.shippingMethods.filter(m => m.status === 'Activo' || m.id === shipment.shippingMethodId).map(m => ({ id: m.id, name: m.name }))}
          couriers={d.couriers.filter(c => c.status === 'Activo' || c.id === shipment.courierId).map(c => ({ id: c.id, name: c.name }))}
          pending={draft => shipmentStageMissing({ ...shipment, ...asShipment(draft) }, 'Por despachar', catalog)}
          saving={saving} error={error} canEdit={canEdit} canDispatch={canDispatch}
          dispatchBlocked={availability && !availability.available ? availability.reason ?? 'No se puede despachar a esa sede.' : null}
          dispatchAdvisories={availability?.advisories ?? []}
          onPrint={draft => print(shipment, asShipment(draft))}
          onShare={draft => share(shipment, asShipment(draft))}
          onBack={() => moveTo('Empacando')}
          onSave={(draft, dispatch) => finish(
            d.updateShipment(shipment.id, withVersion(asShipment(draft))),
            dispatch ? () => { onClose(); onRequestDispatch(shipment.id); } : close,
          )}
        />
      </Modal>
    );
  }

  // ---- Ya salió (o se cerró): solo se ve
  const method = d.shippingMethods.find(m => m.id === shipment.shippingMethodId)?.name;
  const courier = d.couriers.find(c => c.id === shipment.courierId)?.name;
  const inTransit = shipment.status === 'En tránsito' || shipment.status === 'Listo para recepción';
  return (
    <Modal isOpen onClose={close} title={title} size="2xl">
      {header}
      <div className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div className="bg-surface-muted p-4 rounded-xl border border-border-soft space-y-2">
            <h4 className="text-xs font-medium text-text-secondary uppercase tracking-wider">Llegada</h4>
            <p><span className="text-xs text-text-muted block">Fecha de llegada</span><span className="font-medium text-text-primary">{shipment.eta ? etaLabel(shipment.eta, shipment.etaTime) : '-'}</span></p>
            {shipment.manualEnable && <p className="text-xs text-text-secondary">Recepción habilitada manualmente.</p>}
          </div>
          <div className="bg-surface-muted p-4 rounded-xl border border-border-soft space-y-2">
            <h4 className="text-xs font-medium text-text-secondary uppercase tracking-wider">Transporte</h4>
            <p><span className="text-xs text-text-muted block">Método</span><span className="font-medium text-text-primary">{method || '-'}</span></p>
            {courier && <p><span className="text-xs text-text-muted block">Courier</span><span className="font-medium text-text-primary">{courier}</span></p>}
            {shipment.trackingNumber && <p><span className="text-xs text-text-muted block">Guía</span><span className="font-medium text-text-primary">{shipment.trackingNumber}</span></p>}
            {shipment.travelerName && <p><span className="text-xs text-text-muted block">Viajero</span><span className="font-medium text-text-primary">{shipment.travelerName}</span></p>}
          </div>
        </div>
        <div>
          <h4 className="text-sm font-medium text-text-primary mb-3">Contenido del envío</h4>
          <div className="space-y-3">
            {shipment.boxes.map(box => (
              <div key={box.id} className="border border-border-soft rounded-xl overflow-hidden">
                <div className="bg-surface-muted px-4 py-2 border-b border-border-soft flex justify-between items-center">
                  <span className="text-sm font-medium text-text-primary">Caja {box.boxNumber}</span>
                  {box.observation && <span className="text-xs text-text-secondary">{box.observation}</span>}
                </div>
                <ul className="p-4 space-y-2">
                  {box.items.map((item: ShipmentItem, idx) => (
                    <li key={idx} className="flex justify-between text-sm"><span className="text-text-secondary">{itemName(item.itemId)}</span><span className="font-medium text-text-primary">{item.quantity} unid.</span></li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        {shipment.observation && (
          <div>
            <h4 className="text-sm font-medium text-text-primary mb-2">Observaciones</h4>
            <p className="text-sm text-text-secondary bg-surface-muted p-3 rounded-xl border border-border-soft whitespace-pre-line">{shipment.observation}</p>
          </div>
        )}
        {inTransit && (
          <p className="flex items-start gap-2 text-xs text-text-muted"><TriangleAlert size={14} className="shrink-0 mt-0.5" />Un envío en tránsito ya no vuelve atrás: si hay un problema, se cancela con su motivo y lo que salió vuelve al almacén.</p>
        )}
        <div className="flex flex-wrap justify-between gap-3 pt-2 border-t border-border-soft">
          <Button variant="secondary" className="gap-2" onClick={() => print(shipment)}><Printer size={16} />Imprimir lista</Button>
          {inTransit && (
            <div className="flex gap-3">
              {canEdit && !shipment.manualEnable && <Button variant="secondary" onClick={() => { onClose(); onRequestManualEnable(shipment); }}>Habilitar recepción manual</Button>}
              {canDispatch && <Button variant="danger" onClick={() => { onClose(); onRequestCancel(shipment); }}>Cancelar envío</Button>}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
