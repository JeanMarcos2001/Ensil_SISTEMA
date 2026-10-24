import React, { useState, useEffect } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
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
  AlertCircle
} from 'lucide-react';
import { useData, Shipment, Transfer, Item } from '../../context/DataContext';
import { todayLocalISO } from '../../utils/schedule';

interface ReceivedItem {
  itemId: string;
  name: string;
  expected: number;
  received: number;
  status: 'ok' | 'missing' | 'damaged' | 'extra';
  observation: string;
}

export function Receptions() {
  const { 
    shipments, 
    transfers,
    branches,
    items,
    shippingMethods,
    couriers,
    currentBranchId,
    setCurrentBranchId,
    currentUser,
    confirmReception
  } = useData();
  
  const [isReceptionOpen, setIsReceptionOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<{ type: 'Envío' | 'Transferencia', data: Shipment | Transfer } | null>(null);
  const [receptionItems, setReceptionItems] = useState<ReceivedItem[]>([]);
  const [generalObservation, setGeneralObservation] = useState('');
  const [isAddingExtra, setIsAddingExtra] = useState(false);
  const [extraItemSearch, setExtraItemSearch] = useState('');

  // Filters State
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // Access Control
  const isGlobalView = currentBranchId === 'all';
  const isSuperUser = currentUser.role === 'Superusuario';
  const canAccess = !isGlobalView || !isSuperUser;

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

  const handleOpenReception = (doc: any) => {
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

  const handleConfirmReception = () => {
    if (!selectedDocument) return;

    confirmReception({
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

    setIsReceptionOpen(false);
  };

  const isReadyToReceive = (doc: any) => {
    if (doc.manualEnable) return true;
    if (doc.status === 'Listo para recepción') return true;

    const etaDate = 'eta' in doc ? doc.eta : doc.date; // Fallback to date if no ETA
    if (!etaDate) return false;

    if (doc.etaTime) {
      // Create a Date object from ETA and ETA time (using local timezone)
      const etaDateTime = new Date(`${etaDate}T${doc.etaTime}:00`);
      return new Date() >= etaDateTime;
    } else {
      const today = todayLocalISO();
      return etaDate <= today;
    }
  };

  if (isGlobalView && isSuperUser) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-center p-8">
        <div className="w-20 h-20 bg-surface-muted rounded-full flex items-center justify-center mb-6 border border-border-soft shadow-sm">
          <Lock size={32} className="text-text-muted" />
        </div>
        <h2 className="text-2xl font-semibold text-text-primary mb-2">Módulo deshabilitado en Vista Global</h2>
        <p className="text-text-secondary max-w-md mb-8">
          Para gestionar recepciones, por favor selecciona una filial específica en el selector de contexto superior.
        </p>
        <div className="flex gap-4">
          {branches.slice(0, 3).map(branch => (
            <button
              key={branch.id}
              onClick={() => setCurrentBranchId(branch.id)}
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
            Bandeja única de recepción para <span className="font-medium text-primary-accent">{branches.find(b => b.id === currentBranchId)?.name}</span>
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
                <th className="py-3 px-4 text-xs font-medium text-text-muted uppercase tracking-wider">ETA / Fecha</th>
                <th className="py-3 px-4 text-xs font-medium text-text-muted uppercase tracking-wider">Método / Courier</th>
                <th className="py-3 px-4 text-xs font-medium text-text-muted uppercase tracking-wider">Estado</th>
                <th className="py-3 px-4 text-xs font-medium text-text-muted uppercase tracking-wider text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-soft">
              {filteredDocuments.map((doc) => {
                const origin = branches.find(b => b.id === doc.originId)?.name || 'Sede Central (Piura)';
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
                const ready = isReadyToReceive(doc);

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
                        {eta}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-sm text-text-secondary">{methodDisplay}</td>
                    <td className="py-3 px-4">
                      <Badge variant={getStatusBadge(doc.status)}>{doc.status}</Badge>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => handleOpenReception(doc)}>
                          Ver ticket
                        </Button>
                        {['En tránsito', 'Listo para recepción'].includes(doc.status) && (
                          <div title={!ready ? 'Documento no habilitado para recepción (ETA pendiente)' : ''}>
                            <Button 
                              variant="primary" 
                              size="sm" 
                              onClick={() => handleOpenReception(doc)}
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

      {/* Reception Modal */}
      <Modal
        isOpen={isReceptionOpen}
        onClose={() => setIsReceptionOpen(false)}
        title={`Recepción de ${selectedDocument?.type}: ${selectedDocument?.data.id}`}
        size="6xl"
      >
        {selectedDocument && (
          <div className="flex flex-col h-[75vh]">
            <div className="flex-1 overflow-y-auto pr-2 space-y-6">
              {/* Header Info */}
              <div className="grid grid-cols-4 gap-4 bg-surface-muted p-4 rounded-xl border border-border-soft">
                <div>
                  <p className="text-[10px] text-text-muted uppercase font-bold tracking-wider mb-1">Origen</p>
                  <p className="text-sm font-semibold text-text-primary">
                    {branches.find(b => b.id === selectedDocument.data.originId)?.name || selectedDocument.data.originId}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-text-muted uppercase font-bold tracking-wider mb-1">Destino</p>
                  <p className="text-sm font-semibold text-text-primary">
                    {branches.find(b => b.id === selectedDocument.data.destinationId)?.name || selectedDocument.data.destinationId}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-text-muted uppercase font-bold tracking-wider mb-1">Fecha / ETA</p>
                  <p className="text-sm font-semibold text-text-primary">
                    {'eta' in selectedDocument.data ? selectedDocument.data.eta : selectedDocument.data.date}
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
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-8 text-xs border-dashed"
                    onClick={() => setIsAddingExtra(true)}
                  >
                    <Plus size={14} className="mr-1" />
                    Agregar artículo extra
                  </Button>
                </div>

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
              </div>

              {/* General Observation */}
              <div>
                <h3 className="text-sm font-bold text-text-primary mb-2">Observaciones de Recepción</h3>
                <textarea 
                  placeholder="Escribe aquí cualquier observación general sobre la recepción de este documento..."
                  className="w-full h-24 bg-surface border border-border-soft rounded-xl p-4 text-sm text-text-primary focus:border-primary-accent focus:ring-1 focus:ring-primary-accent transition-all resize-none"
                  value={generalObservation}
                  onChange={(e) => setGeneralObservation(e.target.value)}
                />
              </div>
            </div>

            {/* Footer Actions */}
            <div className="pt-6 border-t border-border-soft flex justify-between items-center">
              <div className="flex items-center gap-2 text-xs text-text-muted">
                <AlertCircle size={14} />
                <span>Al confirmar, se actualizará el stock local y se generará el Kardex.</span>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setIsReceptionOpen(false)}>Cancelar</Button>
                <Button 
                  variant="primary" 
                  onClick={handleConfirmReception}
                  className="px-8"
                >
                  Confirmar recepción y cargar stock
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>

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

