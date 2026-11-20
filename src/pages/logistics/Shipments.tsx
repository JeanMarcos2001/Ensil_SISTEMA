import React, { useMemo, useState } from 'react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { ActionMenu } from '../../components/ui/ActionMenu';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { ReasonDialog } from '../../components/ui/ReasonDialog';
import { DateInput } from '../../components/ui/DateInput';
import { ShipmentBoard } from '../../components/logistics/ShipmentBoard';
import { ShipmentWorkModal, statusBadge } from '../../components/logistics/ShipmentWorkModal';
import { LiveIndicator } from '../../components/logistics/LiveIndicator';
import { useLiveShipments } from '../../hooks/useLiveShipments';
import { Search, Plus, Calendar, Clock, MapPin, Package, Truck, LayoutGrid, Columns3, TriangleAlert, TrafficCone } from 'lucide-react';
import { useData, type Shipment } from '../../context/DataContext';
import { centralWarehouse } from '../../utils/logisticsRoutes';
import { etaLabel, isPreDispatch, stockShortages, type TransportCatalog } from '../../utils/logisticsDocs';
import { boardMove, cardPending, type BoardColumnId } from '../../utils/shipmentBoard';

type View = 'board' | 'cards';
const VIEW_KEY = 'ensil.envios.vista';

/** La vista que se eligió la última vez (solo una comodidad de quien mira: si el navegador no guarda, se abre en el tablero). */
function readView(): View {
  try { return localStorage.getItem(VIEW_KEY) === 'cards' ? 'cards' : 'board'; } catch { return 'board'; }
}

export function Shipments() {
  const {
    shipments, shippingMethods, couriers, stockItems, items, branches, warehouses, stockLocations,
    updateShipmentStatus, updateShipment, deleteShipment, currentBranchId, can, availabilityOf, reloadLogisticsDocuments,
  } = useData();
  // Lo que hacen otras personas aparece solo (Supabase Realtime) y, si la conexión en vivo falla, se vuelve a leer cada 30 segundos
  const { connected } = useLiveShipments(reloadLogisticsDocuments);

  const [view, setViewState] = useState<View>(readView);
  const setView = (v: View) => { setViewState(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* sin almacenamiento: no pasa nada */ } };

  const [workId, setWorkId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [dispatchId, setDispatchId] = useState<string | null>(null);
  const [dispatching, setDispatching] = useState(false);
  const [dispatchError, setDispatchError] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Shipment | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterDestination, setFilterDestination] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterDate, setFilterDate] = useState('');

  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean; title: string; description: string; onConfirm: () => void; variant: 'danger' | 'primary' | 'warning'; confirmLabel?: string; cancelLabel?: string; hideCancel?: boolean;
  }>({ isOpen: false, title: '', description: '', onConfirm: () => {}, variant: 'primary' });
  const openConfirm = (config: Omit<typeof confirmConfig, 'isOpen'>) => setConfirmConfig({ ...config, isOpen: true });
  const info = (title: string, description: string) => openConfirm({ title, description, variant: 'warning', confirmLabel: 'Entendido', hideCancel: true, onConfirm: () => {} });

  /** Espera la respuesta de la base de datos; si rechazó la operación, muestra el motivo. */
  const runOperation = async (operation: Promise<{ ok: boolean; error?: string }>, title: string) => {
    const result = await operation;
    if (!result.ok) info(title, result.error ?? 'No se pudo completar la operación.');
  };

  const warehouse = centralWarehouse(warehouses);
  const originId = warehouse?.id ?? '';
  const catalog: TransportCatalog = useMemo(() => ({ methods: shippingMethods, couriers, itemIds: items.map(i => i.id) }), [shippingMethods, couriers, items]);
  const placeName = (id: string) => stockLocations.find(l => l.id === id)?.name ?? id;
  const itemName = (id: string) => items.find(i => i.id === id)?.name ?? 'Artículo desconocido';
  const stockOf = (itemId: string) => stockItems.find(s => s.itemId === itemId && s.branchId === originId)?.stock ?? 0;
  const canEdit = can('log-envios:edit');

  const filtered = shipments.filter(s => {
    const matchesSearch = s.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDestination = filterDestination ? s.destinationId === filterDestination : true;
    const matchesStatus = view === 'cards' && filterStatus ? s.status.toLowerCase() === filterStatus.toLowerCase() : true;
    const matchesDate = filterDate ? s.date === filterDate : true;
    const matchesBranch = currentBranchId === 'all' ? true : (s.originId === currentBranchId || s.destinationId === currentBranchId);
    return matchesSearch && matchesDestination && matchesStatus && matchesDate && matchesBranch;
  });

  /** Se soltó una tarjeta en una columna (o se pulsó «avanzar»): las reglas dicen si se puede y la base lo vuelve a comprobar. */
  const handleMove = async (s: Shipment, target: BoardColumnId) => {
    const move = boardMove(s, target, catalog);
    if (!move) return;
    if (!move.ok) {
      const incomplete = !!move.missing;
      openConfirm({
        title: incomplete ? 'Faltan datos para pasar la tarjeta' : 'No se puede mover la tarjeta',
        description: incomplete ? `${s.id}: ${move.missing!.join(' ')}` : move.error ?? 'No se puede mover la tarjeta.',
        variant: 'warning',
        confirmLabel: incomplete ? 'Completar datos' : 'Entendido',
        cancelLabel: 'Cerrar',
        hideCancel: !incomplete,
        onConfirm: () => { if (incomplete) setWorkId(s.id); },
      });
      return;
    }
    if (move.confirm === 'dispatch') { setDispatchError(null); setDispatchId(s.id); return; }
    if (!canEdit) { info('No puede mover la tarjeta', 'Su cuenta no tiene la función «Editar un envío».'); return; }
    // Con la versión que se ve: si alguien cambió la tarjeta en el medio, la base no la mueve y lo explica
    await runOperation(updateShipment(s.id, { status: move.to, ...(s.version !== undefined ? { version: s.version } : {}) }), 'No se pudo mover la tarjeta');
  };

  const handleManualEnable = (shipment: Shipment) => {
    let description = '¿Estás seguro de que deseas habilitar la recepción manualmente?';
    if (shipment.eta) {
      const etaDate = new Date(shipment.etaTime ? `${shipment.eta}T${shipment.etaTime}` : `${shipment.eta}T00:00:00`);
      const diffMs = etaDate.getTime() - Date.now();
      if (diffMs > 0) {
        const hrs = Math.floor(diffMs / 3_600_000);
        const mins = Math.floor((diffMs % 3_600_000) / 60_000);
        let timeText = '';
        if (hrs > 0) timeText += `${hrs} hora${hrs !== 1 ? 's' : ''}`;
        if (hrs > 0 && mins > 0) timeText += ' y ';
        if (mins > 0) timeText += `${mins} minuto${mins !== 1 ? 's' : ''}`;
        if (hrs === 0 && mins === 0) timeText = 'menos de un minuto';
        description = `Faltan aproximadamente ${timeText} para la llegada programada. Esta opción debe usarse solo si el envío llegó antes de tiempo a la filial destino. ¿Confirmas que ya se encuentra físicamente en el local y deseas habilitar su recepción?`;
      } else {
        description = 'El tiempo estimado de llegada ya se ha cumplido. ¿Deseas habilitar manualmente el ingreso para la filial destino?';
      }
    }
    openConfirm({
      title: 'Habilitar recepción manual', description, confirmLabel: 'Aceptar', cancelLabel: 'Cancelar', variant: 'primary',
      onConfirm: () => runOperation(updateShipment(shipment.id, { manualEnable: true }), 'No se pudo habilitar la recepción manual'),
    });
  };

  /** Cancelar: antes de salir no mueve stock y basta confirmar; ya despachado pide su motivo y devuelve lo que salió. */
  const requestCancel = (shipment: Shipment) => {
    if (isPreDispatch(shipment.status)) {
      openConfirm({
        title: 'Cancelar envío', description: `¿Seguro que desea cancelar el envío ${shipment.id}? Todavía no salió del almacén, así que no se mueve stock.`,
        confirmLabel: 'Cancelar envío', cancelLabel: 'No', variant: 'danger',
        onConfirm: () => runOperation(updateShipmentStatus(shipment.id, 'Cancelado'), 'No se pudo cancelar el envío'),
      });
    } else {
      setCancelTarget(shipment);
    }
  };

  const dispatchShipment = dispatchId ? shipments.find(s => s.id === dispatchId) : undefined;
  const dispatchDestination = dispatchShipment ? stockLocations.find(l => l.id === dispatchShipment.destinationId) : undefined;
  const dispatchAvailability = dispatchDestination ? availabilityOf('log-envios:dispatch', { branchId: dispatchDestination.id, branchName: dispatchDestination.name }) : null;
  const shortages = dispatchShipment ? stockShortages(dispatchShipment.items, stockOf) : [];

  const confirmDispatch = async () => {
    if (!dispatchShipment || dispatching) return;
    setDispatching(true); setDispatchError(null);
    const res = await updateShipmentStatus(dispatchShipment.id, 'En tránsito');
    setDispatching(false);
    if (!res.ok) { setDispatchError(res.error ?? 'No se pudo despachar el envío.'); return; }
    setDispatchId(null);
  };

  const toggle = (value: View, label: string, icon: React.ReactNode) => (
    <button
      type="button" onClick={() => setView(value)} aria-pressed={view === value} aria-label={label} title={label}
      className={`h-8 px-3 rounded-md flex items-center gap-1.5 text-sm font-medium transition-colors ${view === value ? 'bg-surface shadow-sm text-text-primary' : 'text-text-muted hover:text-text-primary'}`}
    >
      {icon}<span className="hidden sm:inline">{label}</span>
    </button>
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-wrap justify-between items-start gap-3 mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-text-primary mb-1">Envíos</h2>
          <p className="text-sm text-text-secondary">Gestión de envíos desde el almacén central hacia las filiales</p>
          <LiveIndicator connected={connected} />
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-surface-muted p-1 rounded-xl h-10" role="group" aria-label="Vista de los envíos">
            {toggle('cards', 'Tarjetas', <LayoutGrid size={16} />)}
            {toggle('board', 'Tablero', <Columns3 size={16} />)}
          </div>
          {can('log-envios:create') && (
            <Button variant="primary" className="flex items-center gap-2" onClick={() => setCreating(true)}>
              <Plus size={16} />
              Crear envío
            </Button>
          )}
        </div>
      </div>

      <div className="bg-surface border border-border-soft rounded-xl shadow-sm flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-border-soft">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
              <input
                type="text" placeholder="Buscar por ID de envío..."
                className="w-full h-10 bg-surface border border-border-soft rounded-xl pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary-accent focus:ring-1 focus:ring-primary-accent transition-shadow"
                value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 md:pb-0">
              <select
                className="h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent min-w-[130px]"
                value={filterDestination} onChange={e => setFilterDestination(e.target.value)} aria-label="Sede destino"
              >
                <option value="">Sede destino</option>
                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              {view === 'cards' && (
                <select
                  className="h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent min-w-[130px]"
                  value={filterStatus} onChange={e => setFilterStatus(e.target.value)} aria-label="Estado"
                >
                  <option value="">Todos los estados</option>
                  <option value="por armar">Por armar</option>
                  <option value="empacando">Empacando</option>
                  <option value="por despachar">Por despachar</option>
                  <option value="en tránsito">En tránsito</option>
                  <option value="listo para recepción">Listo para recepción</option>
                  <option value="recibido">Recibido</option>
                  <option value="recibido con diferencias">Recibido con diferencias</option>
                  <option value="cancelado">Cancelado</option>
                </select>
              )}
              <DateInput
                className="h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent"
                value={filterDate} onChange={e => setFilterDate(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4 bg-surface-muted/30">
          {view === 'board' ? (
            <ShipmentBoard
              shipments={filtered.filter(s => s.status !== 'Cancelado')}
              catalog={catalog} placeName={placeName} canMove={canEdit}
              onOpen={s => setWorkId(s.id)} onMove={handleMove}
            />
          ) : filtered.length === 0 ? (
            <div className="text-center text-text-muted py-8">No se encontraron envíos con los filtros aplicados.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
              {filtered.map(shipment => {
                const method = shippingMethods.find(m => m.id === shipment.shippingMethodId)?.name;
                const totalItems = shipment.items.reduce((sum, item) => sum + item.quantity, 0);
                const pending = cardPending(shipment, catalog);
                const closed = shipment.status === 'Recibido' || shipment.status === 'Recibido con diferencias' || shipment.status === 'Cancelado';
                return (
                  <div key={shipment.id} className="bg-surface border border-border-soft rounded-xl shadow-sm overflow-hidden flex flex-col">
                    <div className="p-4 border-b border-border-soft flex justify-between items-start bg-surface-muted/10">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <button type="button" onClick={() => setWorkId(shipment.id)} className="text-sm font-semibold text-text-primary hover:text-primary-accent">{shipment.id}</button>
                          <Badge variant={statusBadge(shipment.status)}>{shipment.status}</Badge>
                        </div>
                        <div className="flex items-center text-xs text-text-muted gap-1"><Calendar size={12} /><span>{shipment.date}</span></div>
                      </div>
                      <ActionMenu
                        items={[
                          { label: isPreDispatch(shipment.status) ? 'Abrir y trabajar' : 'Ver detalles', onClick: () => setWorkId(shipment.id) },
                          { label: 'Eliminar', danger: true, hidden: shipment.status !== 'Por armar' || !can('log-envios:delete'), onClick: () => openConfirm({
                            title: 'Eliminar envío', description: `Se eliminará el envío ${shipment.id} y su lista. ¿Deseas continuar?`, confirmLabel: 'Eliminar', variant: 'danger',
                            onConfirm: () => runOperation(deleteShipment(shipment.id), 'No se pudo eliminar el envío'),
                          }) },
                          { label: 'Habilitar recepción manual', hidden: shipment.status !== 'En tránsito' || !canEdit || !!shipment.manualEnable, onClick: () => handleManualEnable(shipment) },
                          { label: 'Cancelar envío', danger: true, hidden: closed || !can('log-envios:dispatch'), onClick: () => requestCancel(shipment) },
                        ]}
                      />
                    </div>
                    <div className="p-4 flex-1 flex flex-col gap-3">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 p-1.5 bg-blue-50 text-blue-600 rounded-lg shrink-0"><MapPin size={16} /></div>
                        <div><p className="text-xs text-text-muted">Destino</p><p className="text-sm font-medium text-text-primary">{placeName(shipment.destinationId)}</p></div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 p-1.5 bg-indigo-50 text-indigo-600 rounded-lg shrink-0"><Truck size={16} /></div>
                        <div>
                          <p className="text-xs text-text-muted">Método de envío</p>
                          <p className="text-sm font-medium text-text-primary line-clamp-1">{method || 'Por definir'}</p>
                          {(shipment.trackingNumber || shipment.travelerName) && (
                            <p className="text-xs text-text-muted mt-0.5">{shipment.trackingNumber ? `Guía: ${shipment.trackingNumber}` : shipment.travelerName}</p>
                          )}
                        </div>
                      </div>
                      {pending.length > 0 && (
                        <div className="flex items-start gap-1.5 text-[11px] text-warning-text bg-warning-tint border border-warning/30 rounded-md px-2 py-1" title={pending.join('\n')}>
                          <TriangleAlert size={12} className="shrink-0 mt-0.5" /><span>Datos pendientes: {pending[0]}</span>
                        </div>
                      )}
                    </div>
                    <div className="px-4 py-3 border-t border-border-soft bg-surface-muted/30 flex justify-between items-center text-xs">
                      <div className="flex items-center gap-1.5 font-medium text-text-secondary">
                        <Package size={14} className="text-primary-accent" />
                        <span>{shipment.boxes.length} cajas / {totalItems} art.</span>
                      </div>
                      {shipment.eta && (
                        <div className="flex items-center gap-1 text-text-muted"><Clock size={12} /><span>Llegada: {etaLabel(shipment.eta, shipment.etaTime)}</span></div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <ShipmentWorkModal
        shipmentId={workId} creating={creating}
        onClose={() => { setWorkId(null); setCreating(false); }}
        onRequestDispatch={id => { setDispatchError(null); setDispatchId(id); }}
        onRequestCancel={requestCancel} onRequestManualEnable={handleManualEnable} onInfo={info}
      />

      {/* Despachar: aquí sale el stock y ya no hay marcha atrás */}
      <Modal
        isOpen={!!dispatchShipment} onClose={() => setDispatchId(null)} title={`Despachar el envío ${dispatchShipment?.id ?? ''}`} size="lg"
        footer={
          <div className="flex flex-col items-end gap-2 w-full">
            {dispatchAvailability && !dispatchAvailability.available && <p className="self-start text-sm text-danger-text">{dispatchAvailability.reason}</p>}
            {dispatchAvailability?.advisories.map(a => <p key={a} className="self-start text-xs text-warning-text">{a}</p>)}
            {dispatchError && <p role="alert" className="self-start text-sm text-danger-text">{dispatchError}</p>}
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setDispatchId(null)}>Todavía no</Button>
              <Button variant="primary" onClick={confirmDispatch} disabled={dispatching || !can('log-envios:dispatch') || dispatchAvailability?.available === false}>{dispatching ? 'Despachando…' : 'Despachar ahora'}</Button>
            </div>
          </div>
        }
      >
        {dispatchShipment && (
          <div className="space-y-5">
            <div className="bg-surface-muted p-4 rounded-xl border border-border-soft grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-text-secondary block mb-1">Origen:</span><span className="font-medium text-text-primary">{placeName(dispatchShipment.originId)} (almacén central)</span></div>
              <div><span className="text-text-secondary block mb-1">Destino:</span><span className="font-medium text-text-primary">{placeName(dispatchShipment.destinationId)}</span></div>
              <div><span className="text-text-secondary block mb-1">Método de envío:</span><span className="font-medium text-text-primary">{shippingMethods.find(m => m.id === dispatchShipment.shippingMethodId)?.name ?? '-'}</span></div>
              <div><span className="text-text-secondary block mb-1">Fecha de llegada:</span><span className="font-medium text-text-primary">{dispatchShipment.eta ? etaLabel(dispatchShipment.eta, dispatchShipment.etaTime) : '-'}</span></div>
              <div className="col-span-2"><span className="text-text-secondary block mb-1">Contenido:</span><span className="font-medium text-text-primary">{dispatchShipment.boxes.length} cajas · {dispatchShipment.items.length} artículos · {dispatchShipment.items.reduce((n, i) => n + i.quantity, 0)} unidades</span></div>
            </div>
            {shortages.length > 0 && (
              <div className="p-3 bg-warning-tint text-warning-text border border-warning/30 rounded-lg text-sm">
                <p className="font-medium flex items-center gap-1.5"><TriangleAlert size={14} />El stock del almacén no alcanza para:</p>
                <ul className="list-disc pl-6 mt-1">{shortages.map(s => <li key={s.itemId}>{itemName(s.itemId)}: se necesitan {s.needed} y hay {s.available}</li>)}</ul>
                <p className="mt-1">La base no dejará despachar más de lo que hay: ajuste la lista o ingrese stock antes.</p>
              </div>
            )}
            <div className="bg-primary-accent/10 p-4 rounded-xl flex items-start gap-3 text-primary-accent">
              <TrafficCone size={20} className="shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium mb-1">Desde aquí no hay marcha atrás</p>
                <p>Al despachar, el envío pasa a «En tránsito», el stock sale del almacén y la sede destino lo verá en sus Recepciones. Si después hay un problema, solo se podrá cancelar con su motivo y lo que salió volverá al almacén.</p>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Cancelar algo que ya salió: pide su motivo y devuelve lo despachado al almacén */}
      <ReasonDialog
        isOpen={!!cancelTarget} onClose={() => setCancelTarget(null)} title={`Cancelar el envío ${cancelTarget?.id ?? ''}`} size="lg"
        confirmLabel="Cancelar envío" danger detailLabel="Motivo de la cancelación" detailPlaceholder="Qué pasó y por qué se cancela…"
        onSubmit={async ({ detail }) => {
          if (!cancelTarget) return;
          if (detail.trim().length < 5) return 'Indique el motivo de la cancelación (al menos 5 letras).';
          const res = await updateShipmentStatus(cancelTarget.id, 'Cancelado', detail.trim());
          return res.ok ? undefined : res.error ?? 'No se pudo cancelar el envío.';
        }}
      >
        <p className="text-sm text-text-secondary">El envío ya salió del almacén. Al cancelarlo, lo que salió vuelve al stock del almacén y la sede destino verá que se canceló. El motivo queda anotado en el envío.</p>
      </ReasonDialog>

      <ConfirmDialog
        isOpen={confirmConfig.isOpen} title={confirmConfig.title} description={confirmConfig.description}
        onConfirm={() => confirmConfig.onConfirm()} onClose={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
        variant={confirmConfig.variant} confirmLabel={confirmConfig.confirmLabel} cancelLabel={confirmConfig.cancelLabel} hideCancel={confirmConfig.hideCancel}
      />
    </div>
  );
}
