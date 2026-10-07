import React, { useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { ActionMenu } from '../../components/ui/ActionMenu';
import { Search, Filter, Plus, ArrowRightLeft, AlertTriangle, CheckCircle2, XCircle, FileText, Package, Truck, Trash2 } from 'lucide-react';
import { useData, ShippingMethod, Courier, TransferItem, Transfer, TransferBox, TransferBoxItem } from '../../context/DataContext';

export function Transfers() {
  const { 
    transfers, 
    shippingMethods, 
    couriers, 
    stockItems, 
    items, 
    branches,
    addTransfer,
    updateTransferStatus,
    updateTransfer,
    currentBranchId
  } = useData();
  const [isNewTransferOpen, setIsNewTransferOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedTransfer, setSelectedTransfer] = useState<Transfer | null>(null);
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);
  const [isPreparationOpen, setIsPreparationOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Filters State
  const [searchQuery, setSearchQuery] = useState('');
  const [filterOrigin, setFilterOrigin] = useState('');
  const [filterDestination, setFilterDestination] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterDate, setFilterDate] = useState('');

  // Form State
  const [originId, setOriginId] = useState('');
  const [destinationId, setDestinationId] = useState('');
  const [reason, setReason] = useState('');
  const [observation, setObservation] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [eta, setEta] = useState('');
  
  const [selectedShippingMethod, setSelectedShippingMethod] = useState<string>('');
  const [selectedCourier, setSelectedCourier] = useState<string>('');
  const [trackingNumber, setTrackingNumber] = useState<string>('');
  const [additionalReference, setAdditionalReference] = useState<string>('');
  const [travelerName, setTravelerName] = useState<string>('');
  const [travelerDocument, setTravelerDocument] = useState<string>('');
  const [shippingObservation, setShippingObservation] = useState<string>('');
  
  const [formItems, setFormItems] = useState<TransferItem[]>([]);
  const [boxes, setBoxes] = useState<TransferBox[]>([{ id: 'box-1', boxNumber: '1', items: [] }]);
  const [attachments, setAttachments] = useState<File[]>([]);

  const activeShippingMethods = shippingMethods.filter(m => m.status === 'Activo');
  const activeCouriers = couriers.filter(c => c.status === 'Activo');

  const handleAddItem = () => {
    setFormItems([...formItems, { itemId: '', quantity: 1, observation: '' }]);
  };

  const handleRemoveItem = (index: number) => {
    setFormItems(formItems.filter((_, i) => i !== index));
  };

  const handleUpdateItem = (index: number, field: keyof TransferItem, value: any) => {
    const newItems = [...formItems];
    newItems[index] = { ...newItems[index], [field]: value };
    setFormItems(newItems);
  };

  const handleAddBox = () => {
    const nextNum = boxes.length + 1;
    const newBoxId = `box-${Date.now()}`;
    setBoxes([...boxes, { id: newBoxId, boxNumber: `${nextNum}`, items: [] }]);
  };

  const handleRemoveBox = (boxId: string) => {
    if (boxes.length > 1) {
      const filtered = boxes.filter(b => b.id !== boxId);
      const renumbered = filtered.map((b, i) => ({
        ...b,
        boxNumber: `${i + 1}`
      }));
      setBoxes(renumbered);
    }
  };

  const handleAddItemToBox = (boxId: string) => {
    setBoxes(boxes.map(b => {
      if (b.id === boxId) {
        return { ...b, items: [...b.items, { itemId: '', quantity: 1 }] };
      }
      return b;
    }));
  };

  const handleRemoveItemFromBox = (boxId: string, itemIndex: number) => {
    setBoxes(boxes.map(b => {
      if (b.id === boxId) {
        return { ...b, items: b.items.filter((_, i) => i !== itemIndex) };
      }
      return b;
    }));
  };

  const handleUpdateBoxItem = (boxId: string, itemIndex: number, field: keyof TransferBoxItem, value: any) => {
    setBoxes(boxes.map(b => {
      if (b.id === boxId) {
        const newItems = [...b.items];
        newItems[itemIndex] = { ...newItems[itemIndex], [field]: value };
        return { ...b, items: newItems };
      }
      return b;
    }));
  };

  const handleUpdateBoxObservation = (boxId: string, observation: string) => {
    setBoxes(boxes.map(b => b.id === boxId ? { ...b, observation } : b));
  };

  const validateRequestForm = () => {
    setFormError(null);
    if (!originId || !destinationId || !reason || formItems.length === 0) {
      setFormError('Por favor complete los campos obligatorios (*) y agregue al menos un artículo.');
      return false;
    }
    if (originId === destinationId) {
      setFormError('La sede de origen y destino no pueden ser la misma.');
      return false;
    }
    for (const item of formItems) {
      if (!item.itemId || item.quantity <= 0) {
        setFormError('Hay artículos sin seleccionar o con cantidad inválida.');
        return false;
      }
    }
    return true;
  };

  const validateDispatchForm = () => {
    setFormError(null);
    if (!selectedShippingMethod || !eta) {
      setFormError('Por favor complete el método de envío y el ETA.');
      return false;
    }

    const method = shippingMethods.find(m => m.id === selectedShippingMethod);
    const isCourier = method?.name.toLowerCase().includes('courier');
    const isTraveler = method?.name.toLowerCase().includes('viajero');

    if (isCourier && (!selectedCourier || !trackingNumber)) {
      setFormError('Para envíos por Courier, debe seleccionar el Courier y el número de guía.');
      return false;
    }

    if (isTraveler && !travelerName) {
      setFormError('Para envíos por Viajero, debe ingresar el nombre de la persona que transporta.');
      return false;
    }

    let hasItems = false;
    for (const box of boxes) {
      if (box.items.length === 0) {
        setFormError(`La caja ${box.boxNumber} no puede estar vacía.`);
        return false;
      }
      for (const item of box.items) {
        if (!item.itemId || item.quantity <= 0) {
          setFormError(`Hay artículos inválidos en la caja ${box.boxNumber}.`);
          return false;
        }
        hasItems = true;
      }
    }

    if (!hasItems) {
      setFormError('Debe agregar al menos un artículo en las cajas.');
      return false;
    }

    return true;
  };

  const handleSaveRequest = (status: 'Borrador' | 'Solicitada') => {
    if (!validateRequestForm()) return;

    const newTransfer: Omit<Transfer, 'id'> = {
      date,
      originId,
      destinationId,
      status,
      items: formItems,
      reason,
      observation
    };

    addTransfer(newTransfer);
    setIsNewTransferOpen(false);
    resetForm();
  };

  const handleOpenPreparation = (transfer: Transfer) => {
    setSelectedTransfer(transfer);
    setOriginId(transfer.originId);
    setDestinationId(transfer.destinationId);
    setReason(transfer.reason);
    setObservation(transfer.observation || '');
    setFormItems(transfer.items);
    
    // Pre-fill boxes with items from the request if possible, or just start fresh
    setBoxes([{ id: 'box-1', boxNumber: '1', items: transfer.items.map(i => ({ itemId: i.itemId, quantity: i.quantity })) }]);
    
    setIsPreparationOpen(true);
  };

  const handleConfirmDispatch = () => {
    if (!validateDispatchForm()) return;
    setIsSummaryOpen(true);
  };

  const handleFinalizeDispatch = () => {
    if (!selectedTransfer) return;

    // Aggregate items from boxes to update the transfer items list
    const flatItems: TransferItem[] = [];
    boxes.forEach(box => {
      box.items.forEach(item => {
        const existing = flatItems.find(f => f.itemId === item.itemId);
        if (existing) {
          existing.quantity += item.quantity;
        } else {
          flatItems.push({ itemId: item.itemId, quantity: item.quantity });
        }
      });
    });

    // Update transfer data
    updateTransfer(selectedTransfer.id, {
      items: flatItems,
      boxes,
      shippingMethodId: selectedShippingMethod,
      courierId: selectedCourier || undefined,
      trackingNumber: trackingNumber || undefined,
      additionalReference: additionalReference || undefined,
      travelerName: travelerName || undefined,
      travelerDocument: travelerDocument || undefined,
      shippingObservation: shippingObservation || undefined,
      eta,
      observation
    });

    // Change status to En tránsito (this triggers stock deduction in DataContext)
    updateTransferStatus(selectedTransfer.id, 'En tránsito');

    setIsSummaryOpen(false);
    setIsPreparationOpen(false);
    setSelectedTransfer(null);
    resetForm();
  };

  const resetForm = () => {
    setOriginId('');
    setDestinationId('');
    setReason('');
    setObservation('');
    setSelectedShippingMethod('');
    setSelectedCourier('');
    setTrackingNumber('');
    setAdditionalReference('');
    setTravelerName('');
    setTravelerDocument('');
    setShippingObservation('');
    setEta('');
    setFormItems([]);
    setBoxes([{ id: 'box-1', boxNumber: '1', items: [] }]);
    setAttachments([]);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Borrador': return 'neutral';
      case 'Solicitada': return 'info';
      case 'Aprobada': return 'success';
      case 'En tránsito': return 'warning';
      case 'Listo para recepción': return 'info';
      case 'Recibida': return 'success';
      case 'Recibida con diferencias': return 'warning';
      case 'Rechazada': return 'danger';
      case 'Cancelada': return 'danger';
      default: return 'neutral';
    }
  };

  const filteredTransfers = transfers.filter(t => {
    const matchesSearch = t.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesOrigin = filterOrigin ? t.originId === filterOrigin : true;
    const matchesDestination = filterDestination ? t.destinationId === filterDestination : true;
    const matchesStatus = filterStatus ? t.status.toLowerCase() === filterStatus.toLowerCase() : true;
    const matchesDate = filterDate ? t.date === filterDate : true;

    const matchesBranch = currentBranchId === 'all'
      ? true
      : (t.originId === currentBranchId || t.destinationId === currentBranchId);

    return matchesSearch && matchesOrigin && matchesDestination && matchesStatus && matchesDate && matchesBranch;
  });

  const handleOpenDetail = (transfer: any) => {
    setSelectedTransfer(transfer);
    setIsDetailOpen(true);
  };

  const renderShippingMethodFields = () => {
    const method = shippingMethods.find(m => m.id === selectedShippingMethod);
    if (!method) return null;

    const isCourier = method.name.toLowerCase().includes('courier');
    const isTraveler = method.name.toLowerCase().includes('viajero');

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 bg-surface-muted p-4 rounded-xl border border-border-soft">
        {isCourier && (
          <>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Courier *</label>
              <select 
                className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent"
                value={selectedCourier}
                onChange={(e) => setSelectedCourier(e.target.value)}
              >
                <option value="">Seleccionar courier</option>
                {activeCouriers.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Número de Guía *</label>
              <input 
                type="text" 
                className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent"
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
                placeholder="Ej. TRK-123456"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-text-secondary mb-1">Código Adicional / Referencia</label>
              <input 
                type="text" 
                className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent"
                value={additionalReference}
                onChange={(e) => setAdditionalReference(e.target.value)}
                placeholder="Opcional"
              />
            </div>
          </>
        )}

        {isTraveler && (
          <>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Nombre del Viajero *</label>
              <input 
                type="text" 
                className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent"
                value={travelerName}
                onChange={(e) => setTravelerName(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Documento del Viajero</label>
              <input 
                type="text" 
                className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent"
                value={travelerDocument}
                onChange={(e) => setTravelerDocument(e.target.value)}
                placeholder="Opcional"
              />
            </div>
          </>
        )}

        {!isCourier && !isTraveler && (
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-text-secondary mb-1">Observación Logística *</label>
            <input 
              type="text" 
              className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent"
              value={shippingObservation}
              onChange={(e) => setShippingObservation(e.target.value)}
              placeholder="Detalles del recojo o método alternativo"
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-text-primary mb-1">Transferencias</h2>
          <p className="text-sm text-text-secondary">Movimiento de stock entre filiales</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="primary" className="flex items-center gap-2" onClick={() => setIsNewTransferOpen(true)}>
            <Plus size={16} />
            Nueva Solicitud
          </Button>
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
                placeholder="Buscar por ID de transferencia..." 
                className="w-full h-10 bg-surface border border-border-soft rounded-xl pl-9 pr-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 md:pb-0">
              <select 
                className="h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent min-w-[130px]"
                value={filterOrigin}
                onChange={(e) => setFilterOrigin(e.target.value)}
              >
                <option value="">Sede origen</option>
                {branches.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              <select 
                className="h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent min-w-[130px]"
                value={filterDestination}
                onChange={(e) => setFilterDestination(e.target.value)}
              >
                <option value="">Sede destino</option>
                {branches.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              <select 
                className="h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent min-w-[130px]"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
              >
                <option value="">Todos los estados</option>
                <option value="borrador">Borrador</option>
                <option value="solicitada">Solicitada</option>
                <option value="aprobada">Aprobada</option>
                <option value="en tránsito">En tránsito</option>
                <option value="listo para recepción">Listo para recepción</option>
                <option value="recibida">Recibida</option>
                <option value="rechazada">Rechazada</option>
                <option value="cancelada">Cancelada</option>
              </select>
              <input 
                type="date" 
                className="h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border-soft bg-surface-muted/50">
                <th className="py-3 px-4 text-xs font-medium text-text-muted uppercase tracking-wider">ID</th>
                <th className="py-3 px-4 text-xs font-medium text-text-muted uppercase tracking-wider">Fecha</th>
                <th className="py-3 px-4 text-xs font-medium text-text-muted uppercase tracking-wider">Origen</th>
                <th className="py-3 px-4 text-xs font-medium text-text-muted uppercase tracking-wider">Destino</th>
                <th className="py-3 px-4 text-xs font-medium text-text-muted uppercase tracking-wider">Artículos</th>
                <th className="py-3 px-4 text-xs font-medium text-text-muted uppercase tracking-wider">Estado</th>
                <th className="py-3 px-4 text-xs font-medium text-text-muted uppercase tracking-wider text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-soft">
              {filteredTransfers.map((transfer) => {
                const origin = branches.find(b => b.id === transfer.originId)?.name || transfer.originId;
                const destination = branches.find(b => b.id === transfer.destinationId)?.name || transfer.destinationId;
                const totalItems = transfer.items.reduce((sum, item) => sum + item.quantity, 0);

                return (
                  <tr key={transfer.id} className="hover:bg-surface-muted/30 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <ArrowRightLeft size={14} className="text-text-muted" />
                        <span className="text-sm font-medium text-text-primary">{transfer.id}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-sm text-text-secondary">{transfer.date}</td>
                    <td className="py-3 px-4 text-sm text-text-secondary">{origin}</td>
                    <td className="py-3 px-4 text-sm text-text-secondary">{destination}</td>
                    <td className="py-3 px-4 text-sm text-text-secondary">{totalItems} unid.</td>
                    <td className="py-3 px-4">
                      <Badge variant={getStatusBadge(transfer.status)}>{transfer.status}</Badge>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <ActionMenu 
                        items={[
                          { label: 'Ver detalles', onClick: () => handleOpenDetail(transfer) },
                          ...(transfer.status === 'Borrador' ? [
                            { label: 'Enviar solicitud', onClick: () => updateTransferStatus(transfer.id, 'Solicitada') },
                            { label: 'Cancelar', onClick: () => updateTransferStatus(transfer.id, 'Cancelada'), danger: true }
                          ] : []),
                          ...(transfer.status === 'Solicitada' ? [
                            { label: 'Aprobar', onClick: () => updateTransferStatus(transfer.id, 'Aprobada') },
                            { label: 'Rechazar', onClick: () => updateTransferStatus(transfer.id, 'Rechazada'), danger: true }
                          ] : []),
                          ...(transfer.status === 'Aprobada' ? [
                            { label: 'Preparar despacho', onClick: () => handleOpenPreparation(transfer) },
                            { label: 'Rechazar', onClick: () => updateTransferStatus(transfer.id, 'Rechazada'), danger: true }
                          ] : []),
                          ...(transfer.status === 'En tránsito' ? [
                            { label: 'Marcar listo para recepción', onClick: () => updateTransferStatus(transfer.id, 'Listo para recepción') },
                            { label: 'Habilitar recepción manual', onClick: () => updateTransfer(transfer.id, { manualEnable: true }) },
                            { label: 'Cancelar', onClick: () => updateTransferStatus(transfer.id, 'Cancelada'), danger: true }
                          ] : []),
                        ]}
                      />
                    </td>
                  </tr>
                );
              })}
              {filteredTransfers.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-text-muted">
                    No se encontraron transferencias.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Request Modal */}
      <Modal
        isOpen={isNewTransferOpen}
        onClose={() => setIsNewTransferOpen(false)}
        title="Nueva Solicitud de Transferencia"
        size="5xl"
        footer={
          <div className="flex flex-col gap-3 w-full">
            {formError && (
              <div className="p-3 bg-red-50 text-error border border-red-100 rounded-lg text-sm flex gap-2 items-center">
                <AlertTriangle size={16} />
                <span>{formError}</span>
              </div>
            )}
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setIsNewTransferOpen(false)}>Cancelar</Button>
              <Button variant="secondary" onClick={() => handleSaveRequest('Borrador')}>Guardar Borrador</Button>
              <Button variant="primary" onClick={() => handleSaveRequest('Solicitada')}>Enviar Solicitud</Button>
            </div>
          </div>
        }
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-12 gap-y-10 pb-4">
          {/* Columna Izquierda */}
          <div className="space-y-10">
            {/* Bloque 1: General */}
            <section className="space-y-6">
              <div className="flex items-center gap-2 pb-2 border-b border-border-soft">
                <div className="w-1 h-4 bg-primary-accent rounded-full" />
                <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider">Configuración</h3>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">Sede Origen <span className="text-error">*</span></label>
                  <select 
                    className="w-full h-10 bg-surface border border-border-soft rounded-lg px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent transition-all focus:ring-2 focus:ring-primary-accent/10"
                    value={originId}
                    onChange={(e) => setOriginId(e.target.value)}
                  >
                    <option value="">Seleccionar sede origen</option>
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">Sede Destino <span className="text-error">*</span></label>
                  <select 
                    className="w-full h-10 bg-surface border border-border-soft rounded-lg px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent transition-all focus:ring-2 focus:ring-primary-accent/10"
                    value={destinationId}
                    onChange={(e) => setDestinationId(e.target.value)}
                  >
                    <option value="">Seleccionar sede destino</option>
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">Motivo <span className="text-error">*</span></label>
                  <select 
                    className="w-full h-10 bg-surface border border-border-soft rounded-lg px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent transition-all focus:ring-2 focus:ring-primary-accent/10"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  >
                    <option value="">Seleccionar motivo</option>
                    <option value="Reposición de stock">Reposición de stock</option>
                    <option value="Pedido especial">Pedido especial</option>
                    <option value="Redistribución">Redistribución</option>
                    <option value="Apoyo temporal">Apoyo temporal</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">Fecha Solicitud</label>
                  <input 
                    type="date" 
                    className="w-full h-10 bg-surface-muted border border-border-soft rounded-lg px-3 text-sm text-text-muted cursor-not-allowed"
                    value={date}
                    disabled
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">Observación</label>
                <textarea 
                  className="w-full bg-surface border border-border-soft rounded-lg p-3 text-sm focus:outline-none focus:border-primary-accent resize-none h-24 transition-all focus:ring-2 focus:ring-primary-accent/10"
                  value={observation}
                  onChange={(e) => setObservation(e.target.value)}
                  placeholder="Notas adicionales sobre la solicitud..."
                />
              </div>
            </section>
          </div>

          {/* Columna Derecha */}
          <div className="space-y-10">
            {/* Bloque 2: Artículos */}
            <section className="space-y-6">
              <div className="flex justify-between items-center pb-2 border-b border-border-soft">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-4 bg-primary-accent rounded-full" />
                  <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider">Artículos Solicitados</h3>
                </div>
                <Button variant="ghost" size="sm" onClick={handleAddItem} className="h-8 text-primary-accent hover:bg-primary-accent/5 gap-2 border border-primary-accent/20">
                  <Plus size={14} />
                  Añadir Artículo
                </Button>
              </div>

              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                {formItems.map((item, index) => (
                  <div key={index} className="flex gap-3 items-center bg-surface-muted/30 p-2 rounded-lg border border-border-soft">
                    <div className="flex-1">
                      <select 
                        className="w-full h-9 bg-surface border border-border-soft rounded-lg px-2 text-sm text-text-primary focus:outline-none focus:border-primary-accent"
                        value={item.itemId}
                        onChange={(e) => handleUpdateItem(index, 'itemId', e.target.value)}
                      >
                        <option value="">Articulo...</option>
                        {items.map(i => {
                          const stock = originId ? (stockItems.find(s => s.itemId === i.id && s.branchId === originId)?.stock || 0) : null;
                          return (
                            <option key={i.id} value={i.id}>
                              {i.name} {stock !== null ? `(${stock} disponibles en origen)` : ''}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                    <div className="w-20">
                      <input 
                        type="number" 
                        min="1"
                        className="w-full h-9 bg-surface border border-border-soft rounded-lg px-2 text-sm text-text-primary focus:outline-none focus:border-primary-accent text-center"
                        value={item.quantity}
                        onChange={(e) => handleUpdateItem(index, 'quantity', parseInt(e.target.value) || 0)}
                      />
                    </div>
                    <button 
                      onClick={() => handleRemoveItem(index)}
                      className="text-text-muted hover:text-danger transition-colors p-1"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
                {formItems.length === 0 && (
                  <p className="text-xs text-text-muted text-center py-8 bg-surface-muted/10 rounded-xl border border-dashed border-border-soft">
                    No has agregado artículos aún.
                  </p>
                )}
              </div>
            </section>
          </div>
        </div>
      </Modal>

      {/* Preparation Modal (Phase 3) */}
      <Modal
        isOpen={isPreparationOpen}
        onClose={() => setIsPreparationOpen(false)}
        title="Preparar Despacho de Transferencia"
        size="5xl"
        footer={
          <div className="flex flex-col gap-3 w-full">
            {formError && (
              <div className="p-3 bg-red-50 text-error border border-red-100 rounded-lg text-sm flex gap-2 items-center">
                <AlertTriangle size={16} />
                <span>{formError}</span>
              </div>
            )}
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setIsPreparationOpen(false)}>Cancelar</Button>
              <Button variant="primary" onClick={handleConfirmDispatch}>Siguiente</Button>
            </div>
          </div>
        }
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-12 gap-y-10 pb-4">
          {/* Columna Izquierda */}
          <div className="space-y-10">
            <div className="bg-primary-accent/5 p-4 rounded-xl border border-primary-accent/20 flex gap-3 text-sm text-primary-accent">
              <Package size={20} className="shrink-0 mt-0.5" />
              <div>
                <p className="font-medium mb-1 uppercase tracking-wider text-[10px]">Fase de Preparación</p>
                <p className="text-xs opacity-90 leading-relaxed">Estás preparando el envío para la solicitud {selectedTransfer?.id}. Define las cajas y el método de envío.</p>
              </div>
            </div>

            {/* Bloque 1: General */}
            <section className="space-y-6">
              <div className="flex items-center gap-2 pb-2 border-b border-border-soft">
                <div className="w-1 h-4 bg-primary-accent rounded-full" />
                <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider">Logística de Despacho</h3>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">Origen</label>
                  <input 
                    type="text" 
                    className="w-full h-10 bg-surface-muted border border-border-soft rounded-lg px-3 text-sm text-text-muted cursor-not-allowed"
                    value={branches.find(b => b.id === originId)?.name || ''}
                    disabled
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">Destino</label>
                  <input 
                    type="text" 
                    className="w-full h-10 bg-surface-muted border border-border-soft rounded-lg px-3 text-sm text-text-muted cursor-not-allowed"
                    value={branches.find(b => b.id === destinationId)?.name || ''}
                    disabled
                  />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">ETA Estimada <span className="text-error">*</span></label>
                  <input 
                    type="date" 
                    className="w-full h-10 bg-surface border border-border-soft rounded-lg px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent transition-all focus:ring-2 focus:ring-primary-accent/10"
                    value={eta}
                    onChange={(e) => setEta(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">Observación de Despacho</label>
                <textarea 
                  className="w-full bg-surface border border-border-soft rounded-lg p-3 text-sm focus:outline-none focus:border-primary-accent resize-none h-20 transition-all focus:ring-2 focus:ring-primary-accent/10"
                  value={observation}
                  onChange={(e) => setObservation(e.target.value)}
                  placeholder="Notas sobre el despacho..."
                />
              </div>
            </section>

            {/* Bloque 2: Método */}
            <section className="space-y-6">
              <div className="flex items-center gap-2 pb-2 border-b border-border-soft">
                <div className="w-1 h-4 bg-primary-accent rounded-full" />
                <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider">Método de Envío</h3>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">Seleccionar Método <span className="text-error">*</span></label>
                <select 
                  className="w-full h-10 bg-surface border border-border-soft rounded-lg px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent transition-all focus:ring-2 focus:ring-primary-accent/10"
                  value={selectedShippingMethod}
                  onChange={(e) => setSelectedShippingMethod(e.target.value)}
                >
                  <option value="">Seleccionar método</option>
                  {activeShippingMethods.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
              {renderShippingMethodFields()}
            </section>
          </div>

          {/* Columna Derecha */}
          <div className="space-y-10">
            {/* Bloque 3: Cajas */}
            <section className="space-y-6">
              <div className="flex justify-between items-center pb-2 border-b border-border-soft">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-4 bg-primary-accent rounded-full" />
                  <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider">Cajas de Transferencia</h3>
                </div>
                <Button variant="ghost" size="sm" onClick={handleAddBox} className="h-8 text-primary-accent hover:bg-primary-accent/5 gap-2 border border-primary-accent/20">
                  <Package size={14} />
                  Añadir Caja
                </Button>
              </div>

              <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                {boxes.map((box) => (
                  <div key={box.id} className="bg-surface border border-border-soft rounded-xl overflow-hidden shadow-sm">
                    <div className="bg-surface-muted px-4 py-2 border-b border-border-soft flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-bold text-text-primary uppercase tracking-wider">Caja {box.boxNumber}</span>
                        <input 
                          type="text" 
                          placeholder="Obs. caja"
                          className="h-7 bg-surface border border-border-soft rounded-lg px-2 text-[11px] text-text-primary focus:outline-none focus:border-primary-accent w-44"
                          value={box.observation || ''}
                          onChange={(e) => handleUpdateBoxObservation(box.id, e.target.value)}
                        />
                      </div>
                      <button 
                        onClick={() => handleRemoveBox(box.id)}
                        className={`text-text-muted hover:text-danger transition-colors ${boxes.length === 1 ? 'hidden' : ''}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <div className="p-3 space-y-2">
                      {box.items.map((item, itemIndex) => (
                        <div key={itemIndex} className="flex gap-2 items-center">
                          <div className="flex-1">
                            <select 
                              className="w-full h-8 bg-surface border border-border-soft rounded-lg px-2 text-xs text-text-primary focus:outline-none focus:border-primary-accent"
                              value={item.itemId}
                              onChange={(e) => handleUpdateBoxItem(box.id, itemIndex, 'itemId', e.target.value)}
                            >
                              <option value="">Artículo...</option>
                              {items.map(i => {
                                const stock = stockItems.find(s => s.itemId === i.id && s.branchId === originId)?.stock || 0;
                                return (
                                  <option key={i.id} value={i.id}>
                                    {i.name} ({stock} disponibles)
                                  </option>
                                );
                              })}
                            </select>
                          </div>
                          <div className="w-16">
                            <input 
                              type="number" 
                              min="1"
                              className="w-full h-8 bg-surface border border-border-soft rounded-lg px-2 text-xs text-text-primary focus:outline-none focus:border-primary-accent text-center"
                              value={item.quantity}
                              onChange={(e) => handleUpdateBoxItem(box.id, itemIndex, 'quantity', parseInt(e.target.value) || 0)}
                            />
                          </div>
                          <button 
                            onClick={() => handleRemoveItemFromBox(box.id, itemIndex)}
                            className="text-text-muted hover:text-danger transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                      <button 
                        onClick={() => handleAddItemToBox(box.id)} 
                        className="w-full py-1.5 border border-dashed border-border-soft rounded-lg text-[11px] text-text-muted hover:text-primary-accent hover:border-primary-accent/40 transition-all flex items-center justify-center gap-1.5"
                      >
                        <Plus size={12} /> Añadir artículo
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </Modal>

      {/* Summary Modal (Phase 5) */}
      <Modal
        isOpen={isSummaryOpen}
        onClose={() => setIsSummaryOpen(false)}
        title="Resumen de Despacho de Transferencia"
        size="lg"
      >
        <div className="space-y-6">
          <div className="bg-surface-muted p-4 rounded-xl border border-border-soft grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-text-secondary block mb-1">Origen:</span>
              <span className="font-medium text-text-primary">{branches.find(b => b.id === originId)?.name}</span>
            </div>
            <div>
              <span className="text-text-secondary block mb-1">Destino:</span>
              <span className="font-medium text-text-primary">{branches.find(b => b.id === destinationId)?.name}</span>
            </div>
            <div>
              <span className="text-text-secondary block mb-1">Método de Envío:</span>
              <span className="font-medium text-text-primary">{shippingMethods.find(m => m.id === selectedShippingMethod)?.name}</span>
            </div>
            <div>
              <span className="text-text-secondary block mb-1">ETA:</span>
              <span className="font-medium text-text-primary">{eta}</span>
            </div>
          </div>

          <div>
            <h4 className="font-medium text-text-primary mb-3">Detalle de Cajas ({boxes.length})</h4>
            <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
              {boxes.map(box => (
                <div key={box.id} className="border border-border-soft rounded-lg p-3">
                  <div className="font-medium text-sm text-text-primary mb-2">Caja {box.boxNumber} {box.observation ? `- ${box.observation}` : ''}</div>
                  <ul className="space-y-1">
                    {box.items.map((item, idx) => {
                      const itemObj = items.find(i => i.id === item.itemId);
                      return (
                        <li key={idx} className="text-sm flex justify-between text-text-secondary">
                          <span>{itemObj?.name || 'Artículo desconocido'}</span>
                          <span className="font-medium">{item.quantity} unid.</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-warning-tint/20 p-4 rounded-xl flex items-start gap-3 text-warning-text border border-warning-text/20">
            <AlertTriangle size={20} className="shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium mb-1">Confirmación de Salida de Stock</p>
              <p>Al confirmar, el stock será descontado de la sede origen ({branches.find(b => b.id === originId)?.name}) y el documento pasará a estado "En tránsito".</p>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-border-soft">
            <Button variant="secondary" onClick={() => setIsSummaryOpen(false)}>Volver a editar</Button>
            <Button variant="primary" onClick={handleFinalizeDispatch}>Confirmar Despacho</Button>
          </div>
        </div>
      </Modal>

      {/* Detail Modal */}
      <Modal
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        title={`Detalle de Transferencia ${selectedTransfer?.id}`}
        size="lg"
      >
        {selectedTransfer && (
          <div className="space-y-6">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-lg font-semibold text-text-primary">{selectedTransfer.id}</h3>
                <p className="text-sm text-text-secondary">Solicitada el {selectedTransfer.date}</p>
              </div>
              <Badge variant={getStatusBadge(selectedTransfer.status)}>{selectedTransfer.status}</Badge>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-surface-muted p-4 rounded-xl border border-border-soft">
                <h4 className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-3">Ruta</h4>
                <div className="space-y-2">
                  <div>
                    <span className="text-xs text-text-muted block">Origen</span>
                    <span className="text-sm font-medium text-text-primary">{branches.find(b => b.id === selectedTransfer.originId)?.name}</span>
                  </div>
                  <div>
                    <span className="text-xs text-text-muted block">Destino</span>
                    <span className="text-sm font-medium text-text-primary">{branches.find(b => b.id === selectedTransfer.destinationId)?.name}</span>
                  </div>
                  <div>
                    <span className="text-xs text-text-muted block">ETA</span>
                    <span className="text-sm font-medium text-text-primary">{selectedTransfer.eta || '-'}</span>
                  </div>
                </div>
              </div>

              <div className="bg-surface-muted p-4 rounded-xl border border-border-soft">
                <h4 className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-3">Logística</h4>
                <div className="space-y-2">
                  <div>
                    <span className="text-xs text-text-muted block">Método</span>
                    <span className="text-sm font-medium text-text-primary">{shippingMethods.find(m => m.id === selectedTransfer.shippingMethodId)?.name || '-'}</span>
                  </div>
                  {selectedTransfer.courierId && (
                    <div>
                      <span className="text-xs text-text-muted block">Courier</span>
                      <span className="text-sm font-medium text-text-primary">{couriers.find(c => c.id === selectedTransfer.courierId)?.name}</span>
                    </div>
                  )}
                  {selectedTransfer.trackingNumber && (
                    <div>
                      <span className="text-xs text-text-muted block">Guía</span>
                      <span className="text-sm font-medium text-text-primary">{selectedTransfer.trackingNumber}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-medium text-text-primary mb-3">Contenido de la Transferencia</h4>
              {selectedTransfer.boxes && selectedTransfer.boxes.length > 0 ? (
                <div className="space-y-3">
                  {selectedTransfer.boxes.map(box => (
                    <div key={box.id} className="border border-border-soft rounded-xl overflow-hidden">
                      <div className="bg-surface-muted px-4 py-2 border-b border-border-soft flex justify-between items-center">
                        <span className="text-sm font-medium text-text-primary">Caja {box.boxNumber}</span>
                        {box.observation && <span className="text-xs text-text-secondary">{box.observation}</span>}
                      </div>
                      <div className="p-4">
                        <ul className="space-y-2">
                          {box.items.map((item, idx) => {
                            const itemObj = items.find(i => i.id === item.itemId);
                            return (
                              <li key={idx} className="flex justify-between text-sm">
                                <span className="text-text-secondary">{itemObj?.name || item.itemId}</span>
                                <span className="font-medium text-text-primary">{item.quantity} unid.</span>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="border border-border-soft rounded-xl p-4">
                  <ul className="space-y-2">
                    {selectedTransfer.items.map((item, idx) => {
                      const itemObj = items.find(i => i.id === item.itemId);
                      return (
                        <li key={idx} className="flex justify-between text-sm">
                          <span className="text-text-secondary">{itemObj?.name || item.itemId}</span>
                          <span className="font-medium text-text-primary">{item.quantity} unid.</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>

            {selectedTransfer.observation && (
              <div>
                <h4 className="text-sm font-medium text-text-primary mb-2">Observaciones</h4>
                <p className="text-sm text-text-secondary bg-surface-muted p-3 rounded-xl border border-border-soft">
                  {selectedTransfer.observation}
                </p>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
