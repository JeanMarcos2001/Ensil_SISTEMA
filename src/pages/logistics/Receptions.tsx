import React, { useState, useEffect } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { ActionMenu } from '../../components/ui/ActionMenu';
import { 
  Search, 
  Filter, 
  CheckCircle2, 
  AlertTriangle, 
  Package, 
  Truck, 
  ArrowRightLeft, 
  Lock, 
  Calendar,
  ChevronRight,
  Plus,
  Trash2,
  Check,
  X,
  AlertCircle,
  Eye
} from 'lucide-react';
import { useData, Shipment, Transfer, Item } from '../../context/DataContext';
import { clockNow, etaLabel, isInTransit, receptionError as receptionCheck, receptionOutcome, receptionWindow, type ReceivedLine } from '../../utils/logisticsDocs';

interface ReceivedItem {
  itemId: string;
  name: string;
  expected: number;
  received: number;
  status: 'ok' | 'missing' | 'damaged' | 'extra';
  observation: string;
}

/** Ver el ticket (solo lectura) o recepcionar (editar lo recibido y confirmar). Antes de la ETA solo se puede ver. */
type TicketMode = 'view' | 'receive';

const INCIDENT_LABEL = { missing: 'Faltante', damaged: 'Dañado', extra: 'Extra' } as const;

/** Lo que decide si ya se puede recibir un documento de la lista (la ETA real, sin suplir la de la fecha del documento). */
const timingOf = (doc: { status: string; manualEnable?: boolean }) => ({
  status: doc.status, eta: (doc as { eta?: string }).eta, etaTime: (doc as { etaTime?: string }).etaTime, manualEnable: doc.manualEnable,
});

/** La función que se necesita para recibir ese documento. */
const receiveCapability = (docType: string) => (docType === 'Transferencia' ? 'log-transfer:receive' : 'log-recepciones:confirm');

export function Receptions() {
  const { 
    shipments, 
    transfers,
    stockLocations,
    items,
    incidents,
    shippingMethods,
    couriers,
    currentBranchId,
    selectBranch,
    sessionScope,
    currentUser,
    confirmReception,
    can
  } = useData();
  
  const [isReceptionOpen, setIsReceptionOpen] = useState(false);
  const [mode, setMode] = useState<TicketMode>('view');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<{ type: 'Envío' | 'Transferencia', data: Shipment | Transfer } | null>(null);
  const [receptionItems, setReceptionItems] = useState<ReceivedItem[]>([]);
  const [generalObservation, setGeneralObservation] = useState('');
  const [isAddingExtra, setIsAddingExtra] = useState(false);
  const [extraItemSearch, setExtraItemSearch] = useState('');
  const [receptionError, setReceptionError] = useState<string | null>(null);

  // Filters State
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // Access Control
  // La recepción es siempre de una sede: quien alcanza todas elige primero cuál
  const isGlobalView = currentBranchId === 'all';

  // Combine and format data
  const allDocuments = [
    ...shipments.map(s => ({ ...s, docType: 'Envío' as const })),
    ...transfers.map(t => ({ ...t, docType: 'Transferencia' as const }))
  ].filter(doc => {
    // Only show documents for the current branch
    if (currentBranchId !== 'all' && doc.destinationId !== currentBranchId) return false;
    // Hide drafts and canceled
    return !['Borrador', 'Cancelada', 'Cancelado'].includes(doc.status);
  });

  // Sort by date descending
  allDocuments.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const filteredDocuments = allDocuments.filter(doc => {
    const matchesSearch = doc.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType ? doc.docType === filterType : true;
    const matchesStatus = filterStatus ? doc.status.toLowerCase() === filterStatus.toLowerCase() : true;
    return matchesSearch && matchesType && matchesStatus;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'En tránsito': return 'warning';
      case 'Listo para recepción': return 'info';
      case 'Recibido': 
      case 'Recepcionada': return 'success';
      case 'Recibido con diferencias': 
      case 'Recibida con diferencias': return 'warning';
      case 'Rechazada': return 'danger';
      default: return 'neutral';
    }
  };

  const handleOpenReception = (doc: any, nextMode: TicketMode) => {
    // Recepcionar solo se abre cuando ya llegó la fecha (o Logística la habilitó); antes, el ticket solo se ve
    const open = nextMode === 'receive' && receptionWindow(timingOf(doc), clockNow()).open;
    setMode(open ? 'receive' : 'view');
    setSelectedDocument({ type: doc.docType, data: doc });
    
    // Initialize reception items from document items
    const initialItems: ReceivedItem[] = doc.items.map((item: any) => {
      const itemObj = items.find(i => i.id === item.itemId);
      return {
        itemId: item.itemId,
        name: itemObj?.name || item.itemId,
        expected: item.quantity,
        received: item.quantity, // Default received = expected
        status: 'ok',
        observation: ''
      };
    });
    
    setReceptionItems(initialItems);
    setGeneralObservation('');
    setReceptionError(null);
    setConfirmOpen(false);
    setIsAddingExtra(false);
    setIsReceptionOpen(true);
  };

  const updateItemQty = (index: number, qty: number) => {
    setReceptionItems(prev => prev.map((item, i) => {
      if (i === index) {
        const status = qty === item.expected ? 'ok' : (qty < item.expected ? 'missing' : 'extra');
        return { ...item, received: qty, status };
      }
      return item;
    }));
  };

  const updateItemStatus = (index: number, status: ReceivedItem['status']) => {
    setReceptionItems(prev => prev.map((item, i) => i === index ? { ...item, status } : item));
  };

  const updateItemObservation = (index: number, obs: string) => {
    setReceptionItems(prev => prev.map((item, i) => i === index ? { ...item, observation: obs } : item));
  };

  const addExtraItem = (item: Item) => {
    const newItem: ReceivedItem = {
      itemId: item.id,
      name: item.name,
      expected: 0,
      received: 1,
      status: 'extra',
      observation: ''
    };
    setReceptionItems(prev => [...prev, newItem]);
    setIsAddingExtra(false);
    setExtraItemSearch('');
  };

  const removeExtraItem = (index: number) => {
    setReceptionItems(prev => prev.filter((_, i) => i !== index));
  };

  const [saving, setSaving] = useState(false);

  const receivedLines = (): ReceivedLine[] => receptionItems.map(ri => ({ itemId: ri.itemId, quantity: ri.received, status: ri.status, observation: ri.observation }));

  /** Antes de pedir la confirmación se revisa que se pueda: ya llegó la fecha y las cantidades son válidas. La base lo vuelve a comprobar. */
  const askConfirmation = () => {
    if (!selectedDocument || saving || mode !== 'receive') return;
    const gate = receptionWindow(timingOf(selectedDocument.data), clockNow());
    if (!gate.open) { setReceptionError(gate.reason ?? 'Todavía no se puede recibir este documento.'); return; }
    const invalid = receptionCheck(selectedDocument.data.status, receivedLines(), items.map(i => i.id));
    if (invalid) { setReceptionError(invalid); return; }
    setReceptionError(null);
    setConfirmOpen(true);
  };

  /** Lo que se le dice a quien va a confirmar: cuánto stock se carga, las diferencias y que no hay marcha atrás. */
  const confirmationText = (): string => {
    if (!selectedDocument) return '';
    const outcome = receptionOutcome(selectedDocument.type, selectedDocument.data.items, receivedLines());
    const units = outcome.stockIn.reduce((a, l) => a + l.quantity, 0);
    const dest = stockLocations.find(b => b.id === selectedDocument.data.destinationId)?.name || selectedDocument.data.destinationId;
    const diffs = outcome.hasDifferences
      ? `y se registrarán ${outcome.incidents.length} diferencia${outcome.incidents.length === 1 ? '' : 's'} (faltantes, dañados o extras)`
      : 'sin diferencias';
    return `Va a confirmar la recepción de ${selectedDocument.type.toLowerCase()} ${selectedDocument.data.id} en ${dest}: se cargarán al stock ${units} unidad${units === 1 ? '' : 'es'} de ${outcome.stockIn.length} artículo${outcome.stockIn.length === 1 ? '' : 's'}, ${diffs}. `
      + 'Esta acción no se puede deshacer: el stock se carga de inmediato y, si algo quedó mal, solo se corrige con un ajuste de stock con su motivo.';
  };

  const handleConfirmReception = async () => {
    if (!selectedDocument || saving || mode !== 'receive') return;

    // La base suma lo recibido al stock del destino, anota las incidencias y deja el documento recibido, todo o nada
    setSaving(true);
    const result = await confirmReception({
      docId: selectedDocument.data.id,
      docType: selectedDocument.type,
      receivedItems: receptionItems.map(ri => ({
        itemId: ri.itemId,
        quantity: ri.received,
        status: ri.status,
        observation: ri.observation
      })),
      generalObservation
    });
    setSaving(false);
    if (!result.ok) { setReceptionError(result.error ?? 'No se pudo confirmar la recepción.'); return; }

    setReceptionError(null);
    setIsReceptionOpen(false);
  };

  // --- Solo lectura (Ver ticket): lo esperado y, si ya se recibió, lo que quedó registrado (las incidencias)
  const ticketReadOnly = mode === 'view';
  const docIncidents = selectedDocument ? incidents.filter(i => i.docId === selectedDocument.data.id && i.docType === selectedDocument.type) : [];
  const docClosed = !!selectedDocument && !isInTransit(selectedDocument.data.status);
  const viewRows: { itemId: string; expected: number }[] = selectedDocument
    ? [
        ...selectedDocument.data.items.map(it => ({ itemId: it.itemId, expected: it.quantity })),
        ...[...new Set(docIncidents.map(i => i.itemId))].filter(id => !selectedDocument.data.items.some(it => it.itemId === id)).map(id => ({ itemId: id, expected: 0 })),
      ]
    : [];
  const ticketWindow = selectedDocument ? receptionWindow(timingOf(selectedDocument.data), clockNow()) : null;
  const closedInfo = (selectedDocument?.data ?? {}) as { receivedBy?: string; receptionDate?: string; receptionObservation?: string };

  if (isGlobalView) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-center p-8">
        <div className="w-20 h-20 bg-surface-muted rounded-full flex items-center justify-center mb-6 border border-border-soft shadow-sm">
          <Lock size={32} className="text-text-muted" />
        </div>
        <h2 className="text-2xl font-semibold text-text-primary mb-2">Módulo deshabilitado en Vista Global</h2>
        <p className="text-text-secondary max-w-md mb-8">
          Para gestionar recepciones, elige una filial específica.
        </p>
        <div className="flex gap-4">
          {stockLocations.filter(b => sessionScope.branchIds.includes(b.id) || sessionScope.warehouseIds.includes(b.id)).map(branch => (
            <button
              key={branch.id}
              onClick={() => selectBranch(branch.id)}
              className="px-4 py-2 bg-surface border border-border-soft rounded-xl text-sm font-medium text-text-primary hover:border-primary-accent hover:text-primary-accent transition-all shadow-sm"
            >
              {branch.name}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-text-primary mb-1">Recepciones</h2>
          <p className="text-sm text-text-secondary">
            Bandeja única de recepción para <span className="font-medium text-primary-accent">{stockLocations.find(b => b.id === currentBranchId)?.name}</span>
          </p>
        </div>
      </div>

      {/* Main Content Card */}
      <div className="bg-surface border border-border-soft rounded-xl shadow-sm flex-1 flex flex-col overflow-hidden">
        {/* Filters */}
        <div className="p-4 border-b border-border-soft">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
              <input 
                type="text" 
                placeholder="Buscar por ID de documento..." 
                className="w-full h-10 bg-surface border border-border-soft rounded-xl pl-9 pr-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent transition-shadow"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex gap-3">
              <select 
                className="h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent min-w-[150px]"
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
              >
                <option value="">Todos los tipos</option>
                <option value="Envío">Envío</option>
                <option value="Transferencia">Transferencia</option>
              </select>
              <select 
                className="h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent min-w-[150px]"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
              >
                <option value="">Todos los estados</option>
                <option value="En tránsito">En tránsito</option>
                <option value="Listo para recepción">Listo para recepción</option>
                <option value="Recibido">Recibido</option>
                <option value="Recibido con diferencias">Con diferencias</option>
              </select>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border-soft bg-surface-muted/50">
                <th className="py-3 px-4 text-xs font-medium text-text-muted uppercase tracking-wider">Documento</th>
                <th className="py-3 px-4 text-xs font-medium text-text-muted uppercase tracking-wider">Origen</th>
                <th className="py-3 px-4 text-xs font-medium text-text-muted uppercase tracking-wider">Fecha de llegada</th>
                <th className="py-3 px-4 text-xs font-medium text-text-muted uppercase tracking-wider">Método / Courier</th>
                <th className="py-3 px-4 text-xs font-medium text-text-muted uppercase tracking-wider">Estado</th>
                <th className="py-3 px-4 text-xs font-medium text-text-muted uppercase tracking-wider text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-soft">
              {filteredDocuments.map((doc) => {
                const origin = stockLocations.find(b => b.id === doc.originId)?.name || doc.originId;
                const eta = 'eta' in doc ? doc.eta : doc.date;
                const sm = 'shippingMethodId' in doc ? shippingMethods.find(m => m.id === doc.shippingMethodId) : null;
                const cr = 'courierId' in doc ? couriers.find(c => c.id === doc.courierId) : null;
                let methodDisplay = '-';
                if (sm) {
                  if (cr) {
                    methodDisplay = `${sm.name} (${cr.name})`;
                  } else if ('travelerName' in doc && doc.travelerName) {
                    methodDisplay = `${sm.name} (${doc.travelerName})`;
                  } else {
                    methodDisplay = sm.name;
                  }
                }
                const gate = receptionWindow(timingOf(doc), clockNow());
                const ready = gate.open;

                return (
                  <tr key={doc.id} className="hover:bg-surface-muted/30 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2 mb-1">
                          {doc.docType === 'Envío' ? <Truck size={14} className="text-primary-accent" /> : <ArrowRightLeft size={14} className="text-info-text" />}
                          <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">{doc.docType}</span>
                        </div>
                        <span className="text-sm font-bold text-text-primary">{doc.id}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-sm text-text-secondary">{origin}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2 text-sm text-text-secondary">
                        <Calendar size={14} />
                        {eta ? etaLabel(eta, (doc as { etaTime?: string }).etaTime) : 'Sin fecha de llegada'}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-sm text-text-secondary">{methodDisplay}</td>
                    <td className="py-3 px-4">
                      <Badge variant={getStatusBadge(doc.status)}>{doc.status}</Badge>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => handleOpenReception(doc, 'view')}>
                          Ver ticket
                        </Button>
                        {['En tránsito', 'Listo para recepción'].includes(doc.status) && can(receiveCapability(doc.docType)) && (
                          <div title={!ready ? (gate.reason ?? 'Documento no habilitado para recepción') : ''}>
                            <Button 
                              variant="primary" 
                              size="sm" 
                              onClick={() => handleOpenReception(doc, 'receive')}
                              disabled={!ready}
                            >
                              Recepcionar
                            </Button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredDocuments.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <Package size={40} className="text-text-muted mb-3 opacity-20" />
                      <p className="text-text-muted text-sm">No se encontraron documentos pendientes de recepción.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Ticket / Recepción */}
      <Modal
        isOpen={isReceptionOpen}
        onClose={() => setIsReceptionOpen(false)}
        title={`${ticketReadOnly ? 'Ticket de' : 'Recepción de'} ${selectedDocument?.type.toLowerCase()}: ${selectedDocument?.data.id}`}
        size="6xl"
      >
        {selectedDocument && (
          <div className="flex flex-col h-[75vh]">
            <div className="flex-1 overflow-y-auto pr-2 space-y-6">
              {/* Aviso del modo: antes de la ETA (o sin habilitación) solo se ve */}
              {ticketReadOnly ? (
                <div className="flex gap-3 items-start rounded-xl border border-info-text/20 bg-info-tint/40 p-4 text-sm text-info-text" role="status">
                  <Eye size={18} className="shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">Solo vista: desde aquí no se puede cambiar nada.</p>
                    {!docClosed && ticketWindow && !ticketWindow.open && <p className="mt-1 text-xs">{ticketWindow.reason}</p>}
                    {!docClosed && ticketWindow?.open && <p className="mt-1 text-xs">Ya se puede recibir: use el botón «Recepcionar» de la lista.</p>}
                    {docClosed && (
                      <p className="mt-1 text-xs">
                        Recepción registrada{closedInfo.receivedBy ? ` por ${closedInfo.receivedBy}` : ''}{closedInfo.receptionDate ? ` el ${new Date(closedInfo.receptionDate).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''}.
                        {closedInfo.receptionObservation ? ` Observación: ${closedInfo.receptionObservation}` : ''}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex gap-3 items-start rounded-xl border border-warning-text/20 bg-warning-tint/50 p-4 text-sm text-warning-text" role="status">
                  <AlertCircle size={18} className="shrink-0 mt-0.5" />
                  <p>Revise bien lo recibido antes de confirmar: al confirmar se carga el stock de inmediato y <span className="font-semibold">no se puede deshacer</span>.</p>
                </div>
              )}

              {/* Header Info */}
              <div className="grid grid-cols-4 gap-4 bg-surface-muted p-4 rounded-xl border border-border-soft">
                <div>
                  <p className="text-[10px] text-text-muted uppercase font-bold tracking-wider mb-1">Origen</p>
                  <p className="text-sm font-semibold text-text-primary">
                    {stockLocations.find(b => b.id === selectedDocument.data.originId)?.name || selectedDocument.data.originId}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-text-muted uppercase font-bold tracking-wider mb-1">Destino</p>
                  <p className="text-sm font-semibold text-text-primary">
                    {stockLocations.find(b => b.id === selectedDocument.data.destinationId)?.name || selectedDocument.data.destinationId}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-text-muted uppercase font-bold tracking-wider mb-1">Fecha de llegada</p>
                  <p className="text-sm font-semibold text-text-primary">
                    {(selectedDocument.data as { eta?: string }).eta
                      ? etaLabel((selectedDocument.data as { eta?: string }).eta!, (selectedDocument.data as { etaTime?: string }).etaTime)
                      : 'Sin fecha de llegada'}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-text-muted uppercase font-bold tracking-wider mb-1">Estado Actual</p>
                  <Badge variant={getStatusBadge(selectedDocument.data.status)}>{selectedDocument.data.status}</Badge>
                </div>
              </div>

              {/* Items Table */}
              <div>
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
                    <Package size={16} className="text-primary-accent" />
                    Detalle de Artículos y Cajas
                  </h3>
                  {!ticketReadOnly && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs border-dashed"
                      onClick={() => setIsAddingExtra(true)}
                    >
                      <Plus size={14} className="mr-1" />
                      Agregar artículo extra
                    </Button>
                  )}
                </div>

                {ticketReadOnly ? (
                  <div className="bg-surface border border-border-soft rounded-xl overflow-hidden">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-border-soft bg-surface-muted/50">
                          <th className="py-3 px-4 text-[10px] font-bold text-text-muted uppercase tracking-wider">Artículo</th>
                          <th className="py-3 px-4 text-[10px] font-bold text-text-muted uppercase tracking-wider text-center w-24">Esperado</th>
                          <th className="py-3 px-4 text-[10px] font-bold text-text-muted uppercase tracking-wider w-56">{docClosed ? 'Resultado de la recepción' : 'Recepción'}</th>
                          <th className="py-3 px-4 text-[10px] font-bold text-text-muted uppercase tracking-wider">Observación</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border-soft">
                        {viewRows.map(row => {
                          const found = docIncidents.filter(i => i.itemId === row.itemId);
                          return (
                            <tr key={row.itemId} className={found.length > 0 ? 'bg-warning-tint/20' : ''}>
                              <td className="py-3 px-4">
                                <div className="flex flex-col">
                                  <span className="text-sm font-medium text-text-primary">{items.find(i => i.id === row.itemId)?.name || row.itemId}</span>
                                  <span className="text-[10px] text-text-muted font-mono">{row.itemId}</span>
                                </div>
                              </td>
                              <td className="py-3 px-4 text-center"><span className="text-sm font-bold text-text-secondary">{row.expected}</span></td>
                              <td className="py-3 px-4 text-sm">
                                {!docClosed
                                  ? <span className="text-text-muted">Pendiente de recepción</span>
                                  : found.length === 0
                                    ? <span className="text-success-text font-medium">Conforme</span>
                                    : found.map(i => <span key={i.id} className="block text-warning-text font-medium">{INCIDENT_LABEL[i.type]}: {i.quantity}</span>)}
                              </td>
                              <td className="py-3 px-4 text-xs text-text-secondary">{found.map(i => i.observation).filter(Boolean).join(' · ') || '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                <div className="bg-surface border border-border-soft rounded-xl overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-border-soft bg-surface-muted/50">
                        <th className="py-3 px-4 text-[10px] font-bold text-text-muted uppercase tracking-wider">Artículo</th>
                        <th className="py-3 px-4 text-[10px] font-bold text-text-muted uppercase tracking-wider text-center w-24">Esperado</th>
                        <th className="py-3 px-4 text-[10px] font-bold text-text-muted uppercase tracking-wider text-center w-32">Recibido</th>
                        <th className="py-3 px-4 text-[10px] font-bold text-text-muted uppercase tracking-wider w-40">Estado</th>
                        <th className="py-3 px-4 text-[10px] font-bold text-text-muted uppercase tracking-wider">Observación</th>
                        <th className="py-3 px-4 w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-soft">
                      {receptionItems.map((item, idx) => (
                        <tr key={idx} className={item.status !== 'ok' ? 'bg-warning-tint/20' : ''}>
                          <td className="py-3 px-4">
                            <div className="flex flex-col">
                              <span className="text-sm font-medium text-text-primary">{item.name}</span>
                              <span className="text-[10px] text-text-muted font-mono">{item.itemId}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className="text-sm font-bold text-text-secondary">{item.expected}</span>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center justify-center gap-2">
                              {item.expected === 1 ? (
                                <button
                                  onClick={() => updateItemQty(idx, item.received === 1 ? 0 : 1)}
                                  className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                                    item.received === 1
                                      ? 'bg-success-text text-white shadow-sm'
                                      : 'bg-surface border border-border-soft text-text-muted hover:border-success-text hover:text-success-text'
                                  }`}
                                >
                                  {item.received === 1 ? <Check size={16} /> : <X size={16} />}
                                </button>
                              ) : (
                                <input
                                  type="number"
                                  min={0}
                                  value={item.received}
                                  onChange={(e) => updateItemQty(idx, parseInt(e.target.value) || 0)}
                                  className="w-20 h-9 bg-surface border border-border-soft rounded-lg text-center text-sm font-bold text-text-primary focus:border-primary-accent focus:ring-1 focus:ring-primary-accent"
                                />
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <select
                              value={item.status}
                              onChange={(e) => updateItemStatus(idx, e.target.value as any)}
                              className={`w-full h-9 bg-surface border border-border-soft rounded-lg px-2 text-xs font-medium focus:outline-none ${
                                item.status === 'ok' ? 'text-success-text' :
                                item.status === 'missing' ? 'text-danger-text' :
                                item.status === 'damaged' ? 'text-warning-text' : 'text-info-text'
                              }`}
                            >
                              <option value="ok">Conforme</option>
                              <option value="missing">Faltante</option>
                              <option value="damaged">Dañado</option>
                              <option value="extra">Extra</option>
                            </select>
                          </td>
                          <td className="py-3 px-4">
                            <input
                              type="text"
                              placeholder="Nota..."
                              value={item.observation}
                              onChange={(e) => updateItemObservation(idx, e.target.value)}
                              className="w-full h-9 bg-transparent border-b border-transparent hover:border-border-soft focus:border-primary-accent focus:outline-none text-xs text-text-secondary transition-colors"
                            />
                          </td>
                          <td className="py-3 px-4">
                            {item.expected === 0 && (
                              <button
                                onClick={() => removeExtraItem(idx)}
                                className="p-1.5 text-text-muted hover:text-danger-text transition-colors"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                )}
              </div>

              {/* General Observation (solo al recepcionar) */}
              {!ticketReadOnly && (
                <div>
                  <h3 className="text-sm font-bold text-text-primary mb-2">Observaciones de Recepción</h3>
                  <textarea
                    placeholder="Escribe aquí cualquier observación general sobre la recepción de este documento..."
                    className="w-full h-24 bg-surface border border-border-soft rounded-xl p-4 text-sm text-text-primary focus:border-primary-accent focus:ring-1 focus:ring-primary-accent transition-all resize-none"
                    value={generalObservation}
                    onChange={(e) => setGeneralObservation(e.target.value)}
                  />
                </div>
              )}
            </div>

            {receptionError && <p className="mt-4 text-sm text-danger-text" role="alert">{receptionError}</p>}

            {/* Footer Actions */}
            <div className="pt-6 border-t border-border-soft flex justify-between items-center">
              <div className="flex items-center gap-2 text-xs text-text-muted">
                <AlertCircle size={14} />
                <span>{ticketReadOnly ? 'Esta vista no modifica datos.' : 'Al confirmar, se actualizará el stock y se generará el Kardex. No se puede deshacer.'}</span>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setIsReceptionOpen(false)}>{ticketReadOnly ? 'Cerrar' : 'Cancelar'}</Button>
                {!ticketReadOnly && can(receiveCapability(selectedDocument.type)) && (
                  <Button
                    variant="primary"
                    onClick={askConfirmation}
                    disabled={saving}
                    className="px-8"
                  >
                    {saving ? 'Guardando…' : 'Confirmar recepción y cargar stock'}
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Confirmación: cargar el stock no tiene marcha atrás */}
      <ConfirmDialog
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleConfirmReception}
        title="Confirmar recepción y cargar stock"
        description={confirmationText()}
        confirmLabel="SÍ, CONFIRMAR RECEPCIÓN"
        cancelLabel="NO, REVISAR"
        variant="warning"
      />

      {/* Add Extra Item Modal */}
      <Modal
        isOpen={isAddingExtra}
        onClose={() => setIsAddingExtra(false)}
        title="Agregar artículo extra"
        size="md"
      >
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
            <input 
              type="text" 
              placeholder="Buscar artículo por nombre o código..." 
              className="w-full h-10 bg-surface border border-border-soft rounded-xl pl-9 pr-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent"
              value={extraItemSearch}
              onChange={(e) => setExtraItemSearch(e.target.value)}
            />
          </div>
          <div className="max-h-60 overflow-y-auto border border-border-soft rounded-xl divide-y divide-border-soft">
            {items
              .filter(item => 
                item.name.toLowerCase().includes(extraItemSearch.toLowerCase()) || 
                item.id.toLowerCase().includes(extraItemSearch.toLowerCase())
              )
              .map(item => (
                <button
                  key={item.id}
                  onClick={() => addExtraItem(item)}
                  className="w-full px-4 py-3 text-left hover:bg-surface-muted transition-colors flex justify-between items-center group"
                >
                  <div>
                    <p className="text-sm font-medium text-text-primary group-hover:text-primary-accent transition-colors">{item.name}</p>
                    <p className="text-[10px] text-text-muted font-mono">{item.id}</p>
                  </div>
                  <ChevronRight size={14} className="text-text-muted group-hover:text-primary-accent transition-all" />
                </button>
              ))
            }
          </div>
        </div>
      </Modal>
    </div>
  );
}

