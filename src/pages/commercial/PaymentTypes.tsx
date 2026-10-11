import React, { useState, useEffect } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { ActionMenu } from '../../components/ui/ActionMenu';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { useTablePagination } from '../../hooks/useTablePagination';
import { useData, PaymentType, ScheduleMode } from '../../context/DataContext';
import { resolveScheduleMode } from '../../utils/tariffs';
import { Search, Plus, CreditCard, Calendar, AlertCircle } from 'lucide-react';

const SCHEDULE_MODE_LABELS: Record<ScheduleMode, string> = {
  inmediato: 'Pago inmediato',
  intervalo_fijo: 'Cuotas con intervalo fijo',
  fechas_manuales: 'Fechas manuales',
};

export function PaymentTypes() {
  const { paymentTypes, addPaymentType, updatePaymentType, deletePaymentType } = useData();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [selectedPaymentType, setSelectedPaymentType] = useState<PaymentType | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

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

  const [formError, setFormError] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    installments: 1,
    termDays: 30,
    scheduleMode: 'intervalo_fijo' as ScheduleMode,
    status: 'Activo' as 'Activo' | 'Inactivo',
    description: ''
  });

  useEffect(() => {
    if (selectedPaymentType) {
      setFormData({
        code: selectedPaymentType.code,
        name: selectedPaymentType.name,
        installments: selectedPaymentType.installments,
        termDays: selectedPaymentType.termDays,
        scheduleMode: resolveScheduleMode(selectedPaymentType),
        status: selectedPaymentType.status,
        description: selectedPaymentType.description || ''
      });
    } else {
      setFormData({
        code: '',
        name: '',
        installments: 1,
        termDays: 30,
        scheduleMode: 'intervalo_fijo',
        status: 'Activo',
        description: ''
      });
    }
  }, [selectedPaymentType]);

  const handleOpenForm = (paymentType?: PaymentType, readOnly = false) => {
    setFormError(null);
    setSelectedPaymentType(paymentType || null);
    setIsReadOnly(readOnly);
    setIsFormOpen(true);
  };

  const handleDuplicate = (paymentType: PaymentType) => {
    const { id, ...rest } = paymentType;
    addPaymentType({
      ...rest,
      code: `${rest.code}-COPY`,
      name: `${rest.name} (Copia)`
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) return;
    setFormError(null);

    if (formData.scheduleMode === 'inmediato' && formData.installments !== 1) {
      setFormError('El pago inmediato tiene una sola obligación.');
      return;
    }
    if (formData.scheduleMode !== 'inmediato' && formData.installments < 2) {
      setFormError('Esta modalidad requiere al menos 2 obligaciones.');
      return;
    }
    if (formData.scheduleMode === 'intervalo_fijo' && formData.termDays < 1) {
      setFormError('El intervalo entre cuotas debe ser de al menos 1 día.');
      return;
    }

    const dataToSave = {
      ...formData,
      termDays: formData.scheduleMode === 'inmediato' ? 0 : formData.termDays,
    };
    if (selectedPaymentType) {
      updatePaymentType(selectedPaymentType.id, dataToSave);
    } else {
      addPaymentType(dataToSave);
    }
    setIsFormOpen(false);
  };

  const filteredPaymentTypes = paymentTypes.filter(pt => {
    const matchesSearch = pt.name.toLowerCase().includes(searchTerm.toLowerCase()) || pt.code.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter ? pt.status === statusFilter : true;
    return matchesSearch && matchesStatus;
  });

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = useTablePagination();

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter]);

  const totalPages = Math.ceil(filteredPaymentTypes.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedPaymentTypes = filteredPaymentTypes.slice(startIndex, endIndex);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-text-primary mb-1">Tipos de Pago</h2>
          <p className="text-sm text-text-secondary">Modalidades comerciales base para tarifarios</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="primary" className="flex items-center gap-2" onClick={() => handleOpenForm()}>
            <Plus size={16} />
            Nuevo Tipo de Pago
          </Button>
        </div>
      </div>

      {/* Main Content Card (Filters + Table + Pagination) */}
      <div className="bg-surface border border-border-soft rounded-xl shadow-sm flex-1 flex flex-col overflow-hidden">
        {/* Filters */}
        <div className="p-4 border-b border-border-soft">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
              <input 
                type="text" 
                placeholder="Buscar por código o nombre..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full h-10 bg-surface border border-border-soft rounded-xl pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary-accent focus:ring-1 focus:ring-primary-accent transition-shadow"
              />
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 md:pb-0">
              <select 
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent min-w-[140px]"
              >
                <option value="">Estado</option>
                <option value="Activo">Activo</option>
                <option value="Inactivo">Inactivo</option>
              </select>
            </div>
          </div>
        </div>

        {/* Data Table */}
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-text-secondary uppercase bg-surface-muted/50 sticky top-0 z-10">
              <tr>
                <th className="px-6 py-3 font-medium">Código</th>
                <th className="px-6 py-3 font-medium">Nombre</th>
                <th className="px-6 py-3 font-medium">Obligaciones</th>
                <th className="px-6 py-3 font-medium">Intervalo</th>
                <th className="px-6 py-3 font-medium">Modalidad</th>
                <th className="px-6 py-3 font-medium">Estado</th>
                <th className="px-6 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-soft">
              {paginatedPaymentTypes.map((row) => (
                <tr key={row.id} className="hover:bg-surface-muted/50 transition-colors even:bg-surface-muted/30">
                  <td className="px-6 py-3 font-mono text-text-secondary">{row.code}</td>
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-primary-accent/10 text-primary-accent flex items-center justify-center">
                        <CreditCard size={16} />
                      </div>
                      <span className="font-medium text-text-primary">{row.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-3 text-text-secondary">{row.installments}</td>
                  <td className="px-6 py-3 text-text-secondary">
                    <div className="flex items-center gap-1.5">
                      <Calendar size={14} className="text-text-muted" />
                      {resolveScheduleMode(row) === 'intervalo_fijo' && row.termDays > 0 ? `${row.termDays} días` : 'N/A'}
                    </div>
                  </td>
                  <td className="px-6 py-3 text-text-secondary">
                    {SCHEDULE_MODE_LABELS[resolveScheduleMode(row)]}
                  </td>
                  <td className="px-6 py-3">
                    <Badge variant={row.status === 'Activo' ? 'success' : 'neutral'}>{row.status}</Badge>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <ActionMenu 
                      items={[
                        { label: 'Ver detalles', onClick: () => handleOpenForm(row, true) },
                        { label: 'Editar tipo de pago', onClick: () => handleOpenForm(row) },
                        { 
                          label: 'Duplicar', 
                          onClick: () => openConfirm({
                            title: 'Duplicar Tipo de Pago',
                            description: `¿Está seguro de que desea duplicar el tipo de pago "${row.name}"?`,
                            onConfirm: () => handleDuplicate(row),
                            variant: 'primary',
                            confirmLabel: 'SÍ, DUPLICAR'
                          }) 
                        },
                        { 
                          label: row.status === 'Activo' ? 'Desactivar' : 'Activar', 
                          onClick: () => openConfirm({
                            title: row.status === 'Activo' ? 'Desactivar Tipo de Pago' : 'Activar Tipo de Pago',
                            description: `¿Está seguro de que desea ${row.status === 'Activo' ? 'desactivar' : 'activar'} el tipo de pago "${row.name}"?`,
                            onConfirm: () => updatePaymentType(row.id, { status: row.status === 'Activo' ? 'Inactivo' : 'Activo' }),
                            variant: row.status === 'Activo' ? 'warning' : 'primary',
                            confirmLabel: row.status === 'Activo' ? 'SÍ, DESACTIVAR' : 'SÍ, ACTIVAR'
                          }),
                          danger: row.status === 'Activo' 
                        },
                        { 
                          label: 'Eliminar', 
                          onClick: () => openConfirm({
                            title: 'Eliminar Tipo de Pago',
                            description: `¿Está seguro de que desea eliminar el tipo de pago "${row.name}"? Esta acción no se puede deshacer.`,
                            onConfirm: () => deletePaymentType(row.id),
                            variant: 'danger',
                            confirmLabel: 'SÍ, ELIMINAR'
                          }), 
                          danger: true 
                        },
                      ]} 
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-border-soft flex items-center justify-between bg-surface">
            <span className="text-sm text-text-secondary">
              Mostrando {startIndex + 1} a {Math.min(endIndex, filteredPaymentTypes.length)} de {filteredPaymentTypes.length} tipos de pago
            </span>
            <div className="flex items-center gap-2">
              <Button 
                variant="ghost" 
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
              >
                Anterior
              </Button>
              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }).map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentPage(i + 1)}
                    className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                      currentPage === i + 1 
                        ? 'bg-primary-accent text-white' 
                        : 'text-text-secondary hover:bg-surface-muted'
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
              <Button 
                variant="ghost" 
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
              >
                Siguiente
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Form Modal */}
      <Modal 
        isOpen={isFormOpen} 
        onClose={() => setIsFormOpen(false)} 
        title={isReadOnly ? "Detalles del Tipo de Pago" : selectedPaymentType ? "Editar Tipo de Pago" : "Crear Nuevo Tipo de Pago"}
        size="5xl"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setIsFormOpen(false)}>
              {isReadOnly ? "Cerrar" : "Cancelar"}
            </Button>
            {!isReadOnly && (
              <Button variant="primary" onClick={handleSubmit}>Guardar Tipo de Pago</Button>
            )}
          </div>
        }
      >
        <form onSubmit={handleSubmit} className="pb-4">
          {formError && (
            <div className="mb-6 bg-danger-tint border border-danger-text/20 rounded-xl p-3 flex items-center gap-3 text-danger-text text-sm font-medium">
              <AlertCircle size={16} />
              <p>{formError}</p>
            </div>
          )}
          <fieldset disabled={isReadOnly} className="grid grid-cols-1 lg:grid-cols-2 gap-x-12 gap-y-8">
            {/* Columna Izquierda */}
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-text-primary">Código <span className="text-error">*</span></label>
                  <input 
                    type="text" 
                    required
                    value={formData.code}
                    onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value }))}
                    className="w-full h-10 bg-surface border border-border-soft rounded-lg px-3 text-sm focus:outline-none focus:border-primary-accent font-mono uppercase" 
                    placeholder="Ej. TP-CONT" 
                  />
                  <p className="text-xs text-text-muted">Único</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-text-primary">Nombre <span className="text-error">*</span></label>
                  <input 
                    type="text" 
                    required
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full h-10 bg-surface border border-border-soft rounded-lg px-3 text-sm focus:outline-none focus:border-primary-accent" 
                    placeholder="Ej. Contado" 
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text-primary">Modalidad del cronograma <span className="text-error">*</span></label>
                <select
                  value={formData.scheduleMode}
                  onChange={(e) => {
                    const mode = e.target.value as ScheduleMode;
                    setFormData(prev => ({
                      ...prev,
                      scheduleMode: mode,
                      installments: mode === 'inmediato' ? 1 : Math.max(prev.installments, 2),
                      termDays: mode === 'inmediato' ? 0 : (prev.termDays || 30),
                    }));
                  }}
                  className="w-full h-10 bg-surface border border-border-soft rounded-lg px-3 text-sm focus:outline-none focus:border-primary-accent"
                >
                  {(Object.keys(SCHEDULE_MODE_LABELS) as ScheduleMode[]).map(m => (
                    <option key={m} value={m}>{SCHEDULE_MODE_LABELS[m]}</option>
                  ))}
                </select>
                <p className="text-xs text-text-muted">
                  {formData.scheduleMode === 'inmediato' && 'Una obligación que se paga al momento (Contado).'}
                  {formData.scheduleMode === 'intervalo_fijo' && 'Cuotas separadas por un intervalo exacto de días (Plan 3, 6, 9…).'}
                  {formData.scheduleMode === 'fechas_manuales' && 'Obligaciones con fechas acordadas (Contado en 2 partes).'}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-text-primary">Cantidad de obligaciones <span className="text-error">*</span></label>
                  <input
                    type="number"
                    min="1"
                    required
                    disabled={formData.scheduleMode === 'inmediato'}
                    value={formData.installments}
                    onChange={(e) => setFormData(prev => ({ ...prev, installments: parseInt(e.target.value) || 1 }))}
                    className="w-full h-10 bg-surface border border-border-soft rounded-lg px-3 text-sm focus:outline-none focus:border-primary-accent disabled:bg-surface-muted disabled:text-text-muted"
                    placeholder="1"
                  />
                  <p className="text-xs text-text-muted">Sin contar la matrícula, que se define en el Tarifario.</p>
                </div>
                {formData.scheduleMode === 'intervalo_fijo' && (
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-text-primary">Intervalo entre cuotas <span className="text-error">*</span></label>
                    <div className="relative">
                      <input
                        type="number"
                        min="1"
                        required
                        value={formData.termDays}
                        onChange={(e) => setFormData(prev => ({ ...prev, termDays: parseInt(e.target.value) || 0 }))}
                        className="w-full h-10 bg-surface border border-border-soft rounded-lg pl-3 pr-12 text-sm focus:outline-none focus:border-primary-accent"
                        placeholder="30"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted text-sm">días</span>
                    </div>
                  </div>
                )}
              </div>

            </div>

            {/* Columna Derecha */}
            <div className="space-y-6">
              <div className="p-5 bg-info-tint/40 border border-border-soft rounded-xl space-y-2">
                <h4 className="text-sm font-bold text-text-primary">Cuotas y partes de pago</h4>
                <p className="text-xs text-text-secondary">
                  Una <strong>cuota</strong> es una obligación programada en el tiempo. Una <strong>parte de pago</strong> es una fracción de
                  un mismo pago hecho en el mismo momento (por ejemplo, una parte por Yape y otra en efectivo).
                  Las partes se registran en el pago, no en el tipo de pago.
                </p>
                <p className="text-xs text-text-secondary">
                  Qué programas y niveles pueden usar este tipo de pago lo define el <strong>Tarifario</strong>.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text-primary">Estado <span className="text-error">*</span></label>
                <select 
                  value={formData.status}
                  onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value as 'Activo' | 'Inactivo' }))}
                  className="w-full h-10 bg-surface border border-border-soft rounded-lg px-3 text-sm focus:outline-none focus:border-primary-accent"
                >
                  <option value="Activo">Activo</option>
                  <option value="Inactivo">Inactivo</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text-primary">Descripción</label>
                <textarea 
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full bg-surface border border-border-soft rounded-lg p-3 text-sm focus:outline-none focus:border-primary-accent resize-none h-32" 
                  placeholder="Notas comerciales..."
                ></textarea>
              </div>
            </div>
          </fieldset>
        </form>
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
