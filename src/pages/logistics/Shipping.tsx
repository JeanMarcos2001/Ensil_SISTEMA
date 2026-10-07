import React, { useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { ActionMenu } from '../../components/ui/ActionMenu';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Search, Plus, Truck, MapPin } from 'lucide-react';
import { useData, Courier, ShippingMethod } from '../../context/DataContext';

export function Shipping() {
  const { couriers, setCouriers, shippingMethods, setShippingMethods } = useData();
  const [activeTab, setActiveTab] = useState<'couriers' | 'methods'>('couriers');

  // Courier Form State
  const [isCourierFormOpen, setIsCourierFormOpen] = useState(false);
  const [selectedCourier, setSelectedCourier] = useState<Courier | null>(null);
  const [courierFormData, setCourierFormData] = useState<Partial<Courier>>({
    status: 'Activo'
  });

  // Method Form State
  const [isMethodFormOpen, setIsMethodFormOpen] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<ShippingMethod | null>(null);
  const [methodFormData, setMethodFormData] = useState<Partial<ShippingMethod>>({
    status: 'Activo'
  });

  const [searchTerm, setSearchTerm] = useState('');

  // Confirmation Dialog State
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
    variant: 'danger' | 'primary' | 'warning';
    confirmLabel?: string;
    cancelLabel?: string;
  }>({
    isOpen: false,
    title: '',
    description: '',
    onConfirm: () => {},
    variant: 'primary'
  });

  const openConfirm = (config: Omit<typeof confirmConfig, 'isOpen'>) => {
    setConfirmConfig({ ...config, isOpen: true });
  };

  // --- Courier Handlers ---
  const handleOpenCourierForm = (courier?: Courier) => {
    if (courier) {
      setCourierFormData({ ...courier });
    } else {
      setCourierFormData({ status: 'Activo' });
    }
    setSelectedCourier(courier || null);
    setIsCourierFormOpen(true);
  };

  const handleSaveCourier = () => {
    if (!courierFormData.code || !courierFormData.name) {
      openConfirm({
        title: 'Error de validación',
        description: 'El código y nombre son obligatorios.',
        variant: 'danger',
        confirmLabel: 'Entendido',
        onConfirm: () => {}
      });
      return;
    }

    if (selectedCourier) {
      setCouriers(couriers.map(c => c.id === selectedCourier.id ? { ...courierFormData as Courier } : c));
    } else {
      const newId = `COUR-${Date.now()}`;
      setCouriers([...couriers, { ...courierFormData as Courier, id: newId }]);
    }
    setIsCourierFormOpen(false);
  };

  // --- Method Handlers ---
  const handleOpenMethodForm = (method?: ShippingMethod) => {
    if (method) {
      setMethodFormData({ ...method });
    } else {
      setMethodFormData({ status: 'Activo' });
    }
    setSelectedMethod(method || null);
    setIsMethodFormOpen(true);
  };

  const handleSaveMethod = () => {
    if (!methodFormData.name) {
      openConfirm({
        title: 'Error de validación',
        description: 'El nombre del método es obligatorio.',
        variant: 'danger',
        confirmLabel: 'Entendido',
        onConfirm: () => {}
      });
      return;
    }

    if (selectedMethod) {
      setShippingMethods(shippingMethods.map(m => m.id === selectedMethod.id ? { ...methodFormData as ShippingMethod } : m));
    } else {
      const newId = `SM-${Date.now()}`;
      setShippingMethods([...shippingMethods, { ...methodFormData as ShippingMethod, id: newId }]);
    }
    setIsMethodFormOpen(false);
  };

  const filteredCouriers = couriers.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredMethods = shippingMethods.filter(m => 
    m.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-text-primary mb-1">Couriers y métodos de envío</h2>
          <p className="text-sm text-text-secondary">Gestión de agencias de transporte y métodos de envío para transferencias</p>
        </div>
        <div className="flex items-center gap-3">
          {activeTab === 'couriers' ? (
            <Button variant="primary" className="flex items-center gap-2" onClick={() => handleOpenCourierForm()}>
              <Plus size={16} />
              Nuevo Courier
            </Button>
          ) : (
            <Button variant="primary" className="flex items-center gap-2" onClick={() => handleOpenMethodForm()}>
              <Plus size={16} />
              Nuevo Método
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-6 border-b border-border-soft mb-6">
        <button
          className={`pb-3 text-sm font-medium transition-colors relative ${
            activeTab === 'couriers' ? 'text-primary-accent' : 'text-text-secondary hover:text-text-primary'
          }`}
          onClick={() => setActiveTab('couriers')}
        >
          Directorio de Couriers
          {activeTab === 'couriers' && (
            <div className="absolute bottom-0 left-0 w-full h-0.5 bg-primary-accent rounded-t-full" />
          )}
        </button>
        <button
          className={`pb-3 text-sm font-medium transition-colors relative ${
            activeTab === 'methods' ? 'text-primary-accent' : 'text-text-secondary hover:text-text-primary'
          }`}
          onClick={() => setActiveTab('methods')}
        >
          Métodos de Envío
          {activeTab === 'methods' && (
            <div className="absolute bottom-0 left-0 w-full h-0.5 bg-primary-accent rounded-t-full" />
          )}
        </button>
      </div>

      {/* Main Content Card */}
      <div className="bg-surface border border-border-soft rounded-xl shadow-sm flex-1 flex flex-col overflow-hidden">
        {/* Filters */}
        <div className="p-4 border-b border-border-soft">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
            <input 
              type="text" 
              placeholder={`Buscar ${activeTab === 'couriers' ? 'courier' : 'método'}...`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-10 bg-surface border border-border-soft rounded-xl pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary-accent focus:ring-1 focus:ring-primary-accent transition-shadow"
            />
          </div>
        </div>

        {/* Data Table */}
        <div className="overflow-x-auto flex-1">
          {activeTab === 'couriers' ? (
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-text-secondary uppercase bg-surface-muted/50 sticky top-0 z-10">
                <tr>
                  <th className="px-6 py-3 font-medium">Código</th>
                  <th className="px-6 py-3 font-medium">Nombre</th>
                  <th className="px-6 py-3 font-medium">Teléfono</th>
                  <th className="px-6 py-3 font-medium">Dirección</th>
                  <th className="px-6 py-3 font-medium">Estado</th>
                  <th className="px-6 py-3 font-medium text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-soft">
                {filteredCouriers.map((row) => (
                  <tr key={row.id} className="hover:bg-surface-muted/50 transition-colors even:bg-surface-muted/30">
                    <td className="px-6 py-3 font-mono text-text-secondary">{row.code}</td>
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary-accent/10 text-primary-accent flex items-center justify-center">
                          <Truck size={16} />
                        </div>
                        <span className="font-medium text-text-primary">{row.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-3 text-text-secondary">{row.phone || '-'}</td>
                    <td className="px-6 py-3 text-text-secondary truncate max-w-[200px]">{row.address || '-'}</td>
                    <td className="px-6 py-3">
                      <Badge variant={row.status === 'Activo' ? 'success' : 'neutral'}>{row.status}</Badge>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <ActionMenu 
                        items={[
                          { label: 'Editar courier', onClick: () => handleOpenCourierForm(row) },
                          { 
                            label: row.status === 'Activo' ? 'Desactivar' : 'Activar', 
                            onClick: () => {
                              const newStatus = row.status === 'Activo' ? 'Inactivo' : 'Activo';
                              setCouriers(couriers.map(c => c.id === row.id ? { ...c, status: newStatus } : c));
                            },
                            danger: row.status === 'Activo' 
                          },
                        ]} 
                      />
                    </td>
                  </tr>
                ))}
                {filteredCouriers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-text-secondary">
                      No se encontraron couriers.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-text-secondary uppercase bg-surface-muted/50 sticky top-0 z-10">
                <tr>
                  <th className="px-6 py-3 font-medium">Nombre del Método</th>
                  <th className="px-6 py-3 font-medium">Observaciones</th>
                  <th className="px-6 py-3 font-medium">Estado</th>
                  <th className="px-6 py-3 font-medium text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-soft">
                {filteredMethods.map((row) => (
                  <tr key={row.id} className="hover:bg-surface-muted/50 transition-colors even:bg-surface-muted/30">
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary-accent/10 text-primary-accent flex items-center justify-center">
                          <MapPin size={16} />
                        </div>
                        <span className="font-medium text-text-primary">{row.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-3 text-text-secondary truncate max-w-[300px]">{row.observations || '-'}</td>
                    <td className="px-6 py-3">
                      <Badge variant={row.status === 'Activo' ? 'success' : 'neutral'}>{row.status}</Badge>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <ActionMenu 
                        items={[
                          { label: 'Editar método', onClick: () => handleOpenMethodForm(row) },
                          { 
                            label: row.status === 'Activo' ? 'Desactivar' : 'Activar', 
                            onClick: () => {
                              const newStatus = row.status === 'Activo' ? 'Inactivo' : 'Activo';
                              setShippingMethods(shippingMethods.map(m => m.id === row.id ? { ...m, status: newStatus } : m));
                            },
                            danger: row.status === 'Activo' 
                          },
                        ]} 
                      />
                    </td>
                  </tr>
                ))}
                {filteredMethods.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-text-secondary">
                      No se encontraron métodos de envío.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Courier Form Modal */}
      <Modal 
        isOpen={isCourierFormOpen} 
        onClose={() => setIsCourierFormOpen(false)} 
        title={selectedCourier ? "Editar Courier" : "Nuevo Courier"}
        size="2xl"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setIsCourierFormOpen(false)}>Cancelar</Button>
            <Button variant="primary" onClick={handleSaveCourier}>Guardar Courier</Button>
          </div>
        }
      >
        <div className="grid grid-cols-2 gap-4 pb-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-primary">Código <span className="text-error">*</span></label>
            <input 
              type="text" 
              className="w-full h-10 bg-surface border border-border-soft rounded-lg px-3 text-sm focus:outline-none focus:border-primary-accent font-mono uppercase" 
              placeholder="Ej. C-001" 
              value={courierFormData.code || ''}
              onChange={(e) => setCourierFormData({...courierFormData, code: e.target.value})}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-primary">Nombre <span className="text-error">*</span></label>
            <input 
              type="text" 
              className="w-full h-10 bg-surface border border-border-soft rounded-lg px-3 text-sm focus:outline-none focus:border-primary-accent" 
              placeholder="Nombre de la agencia" 
              value={courierFormData.name || ''}
              onChange={(e) => setCourierFormData({...courierFormData, name: e.target.value})}
            />
          </div>
          <div className="space-y-1.5 col-span-2">
            <label className="text-sm font-medium text-text-primary">Dirección</label>
            <input 
              type="text" 
              className="w-full h-10 bg-surface border border-border-soft rounded-lg px-3 text-sm focus:outline-none focus:border-primary-accent" 
              placeholder="Dirección principal" 
              value={courierFormData.address || ''}
              onChange={(e) => setCourierFormData({...courierFormData, address: e.target.value})}
            />
          </div>
          <div className="space-y-1.5 col-span-2">
            <label className="text-sm font-medium text-text-primary">Referencia</label>
            <input 
              type="text" 
              className="w-full h-10 bg-surface border border-border-soft rounded-lg px-3 text-sm focus:outline-none focus:border-primary-accent" 
              placeholder="Referencia de ubicación" 
              value={courierFormData.reference || ''}
              onChange={(e) => setCourierFormData({...courierFormData, reference: e.target.value})}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-primary">Teléfono</label>
            <input 
              type="text" 
              className="w-full h-10 bg-surface border border-border-soft rounded-lg px-3 text-sm focus:outline-none focus:border-primary-accent" 
              placeholder="Teléfono de contacto" 
              value={courierFormData.phone || ''}
              onChange={(e) => setCourierFormData({...courierFormData, phone: e.target.value})}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-primary">Estado <span className="text-error">*</span></label>
            <select 
              className="w-full h-10 bg-surface border border-border-soft rounded-lg px-3 text-sm focus:outline-none focus:border-primary-accent"
              value={courierFormData.status}
              onChange={(e) => setCourierFormData({...courierFormData, status: e.target.value as 'Activo' | 'Inactivo'})}
            >
              <option value="Activo">Activo</option>
              <option value="Inactivo">Inactivo</option>
            </select>
          </div>
          <div className="space-y-1.5 col-span-2">
            <label className="text-sm font-medium text-text-primary">Observaciones</label>
            <textarea 
              className="w-full bg-surface border border-border-soft rounded-lg p-3 text-sm focus:outline-none focus:border-primary-accent resize-none h-20" 
              placeholder="Notas adicionales..."
              value={courierFormData.observations || ''}
              onChange={(e) => setCourierFormData({...courierFormData, observations: e.target.value})}
            ></textarea>
          </div>
        </div>
      </Modal>

      {/* Method Form Modal */}
      <Modal 
        isOpen={isMethodFormOpen} 
        onClose={() => setIsMethodFormOpen(false)} 
        title={selectedMethod ? "Editar Método de Envío" : "Nuevo Método de Envío"}
        size="md"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setIsMethodFormOpen(false)}>Cancelar</Button>
            <Button variant="primary" onClick={handleSaveMethod}>Guardar Método</Button>
          </div>
        }
      >
        <div className="space-y-4 pb-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-primary">Nombre del Método <span className="text-error">*</span></label>
            <input 
              type="text" 
              className="w-full h-10 bg-surface border border-border-soft rounded-lg px-3 text-sm focus:outline-none focus:border-primary-accent" 
              placeholder="Ej. Courier, Viajero..." 
              value={methodFormData.name || ''}
              onChange={(e) => setMethodFormData({...methodFormData, name: e.target.value})}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-primary">Estado <span className="text-error">*</span></label>
            <select 
              className="w-full h-10 bg-surface border border-border-soft rounded-lg px-3 text-sm focus:outline-none focus:border-primary-accent"
              value={methodFormData.status}
              onChange={(e) => setMethodFormData({...methodFormData, status: e.target.value as 'Activo' | 'Inactivo'})}
            >
              <option value="Activo">Activo</option>
              <option value="Inactivo">Inactivo</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-primary">Observaciones</label>
            <textarea 
              className="w-full bg-surface border border-border-soft rounded-lg p-3 text-sm focus:outline-none focus:border-primary-accent resize-none h-24" 
              placeholder="Descripción del método..."
              value={methodFormData.observations || ''}
              onChange={(e) => setMethodFormData({...methodFormData, observations: e.target.value})}
            ></textarea>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={confirmConfig.isOpen}
        onClose={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmConfig.onConfirm}
        title={confirmConfig.title}
        description={confirmConfig.description}
        variant={confirmConfig.variant}
        confirmLabel={confirmConfig.confirmLabel}
        cancelLabel={confirmConfig.cancelLabel}
      />
    </div>
  );
}
