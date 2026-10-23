import React, { useState, useEffect } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { ActionMenu } from '../../components/ui/ActionMenu';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Search, Plus, Tag, Calendar, Users, DollarSign, X, AlertCircle } from 'lucide-react';
import { useTablePagination } from '../../hooks/useTablePagination';
import { useData, Promotion } from '../../context/DataContext';
import { eligibleProgramIds } from '../../utils/promotions';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { DateInput } from '../../components/ui/DateInput';

const initialFormData: Omit<Promotion, 'id'> = {
  code: '',
  name: '',
  type: 'Grupal',
  requiredStudents: 2,
  eligibleProgramIds: [],
  requiredBasePrice: undefined,
  allowMultipleGroups: true,
  composition: [],
  paymentTypeIds: [],
  totalPrice: 0,
  currency: 'USD',
  internalDistributionRule: 'Igualitario',
  branchIds: [],
  applyToAllBranches: true,
  startDate: '',
  endDate: '',
  status: 'Activo',
  observations: ''
};

export function Promotions() {
  const { promotions, addPromotion, updatePromotion, deletePromotion, programs, paymentTypes, branches } = useData();
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedPromotion, setSelectedPromotion] = useState<string | null>(null);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [formData, setFormData] = useState<Omit<Promotion, 'id'>>(initialFormData);
  const [formError, setFormError] = useState<string | null>(null);
  const [isLegacyComposition, setIsLegacyComposition] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const shouldReduceMotion = useReducedMotion();

  const filteredPromotions = promotions.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.code.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter ? p.status === statusFilter : true;
    return matchesSearch && matchesStatus;
  });

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = useTablePagination();

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter]);

  const totalPages = Math.ceil(filteredPromotions.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedPromotions = filteredPromotions.slice(startIndex, endIndex);

  // Confirmation Dialog State
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
    variant: 'danger' | 'primary' | 'warning';
    confirmLabel?: string;
    cancelLabel?: string;
    hideCancel?: boolean;
  }>({
    isOpen: false,
    title: '',
    description: '',
    onConfirm: () => {},
    variant: 'primary',
    hideCancel: false
  });

  const openConfirm = (config: Omit<typeof confirmConfig, 'isOpen'>) => {
    setConfirmConfig({ ...config, isOpen: true });
  };

  const handleOpenForm = (id?: string, readOnly: boolean = false) => {
    setFormError(null);
    if (id) {
      const promotion = promotions.find(p => p.id === id);
      if (promotion) {
        // Promociones antiguas (composición rígida): se muestran sus programas como elegibles.
        const legacy = !(promotion.eligibleProgramIds && promotion.eligibleProgramIds.length > 0) && (promotion.composition?.length ?? 0) > 0;
        setIsLegacyComposition(legacy);
        setFormData({
          ...promotion,
          eligibleProgramIds: eligibleProgramIds(promotion),
          allowMultipleGroups: promotion.allowMultipleGroups ?? false,
        });
      }
    } else {
      setIsLegacyComposition(false);
      setFormData(initialFormData);
    }
    setSelectedPromotion(id || null);
    setIsReadOnly(readOnly);
    setIsFormOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    
    // Validations
    if (!formData.code || formData.code.includes(' ')) {
      setFormError("El código es obligatorio y no debe contener espacios.");
      return;
    }
    if (formData.requiredStudents < 2) {
      setFormError("La cantidad de alumnos requerida debe ser mayor a 1.");
      return;
    }
    if (promotions.some(p => p.id !== selectedPromotion && p.code.toLowerCase() === formData.code.toLowerCase())) {
      setFormError("Ya existe una promoción con ese código.");
      return;
    }
    if ((formData.eligibleProgramIds ?? []).length === 0) {
      setFormError("Seleccione al menos un programa elegible.");
      return;
    }
    if (formData.requiredBasePrice !== undefined && !(formData.requiredBasePrice > 0)) {
      setFormError("El precio contado base requerido debe ser mayor a 0 (o déjelo vacío).");
      return;
    }
    if (formData.paymentTypeIds.length === 0) {
      setFormError("Debe seleccionar al menos un tipo de pago permitido.");
      return;
    }
    if (formData.totalPrice <= 0) {
      setFormError("El precio promocional total debe ser mayor a 0.");
      return;
    }
    if (!formData.applyToAllBranches && formData.branchIds.length === 0) {
      setFormError("Debe seleccionar al menos una sede o aplicar a todas.");
      return;
    }
    if (formData.endDate && formData.startDate > formData.endDate) {
      setFormError("La fecha de fin no puede ser menor a la fecha de inicio.");
      return;
    }

    // La elegibilidad dinámica reemplaza a la composición rígida.
    const dataToSave: Omit<Promotion, 'id'> = { ...formData, composition: [], currency: 'USD' };
    if (selectedPromotion) {
      updatePromotion(selectedPromotion, dataToSave);
    } else {
      addPromotion(dataToSave);
    }
    setIsFormOpen(false);
  };

  const togglePaymentType = (id: string) => {
    if (isReadOnly) return;
    setFormData(prev => ({
      ...prev,
      paymentTypeIds: prev.paymentTypeIds.includes(id)
        ? prev.paymentTypeIds.filter(ptId => ptId !== id)
        : [...prev.paymentTypeIds, id]
    }));
  };

  const toggleBranch = (id: string) => {
    if (isReadOnly) return;
    setFormData(prev => ({
      ...prev,
      branchIds: prev.branchIds.includes(id)
        ? prev.branchIds.filter(bId => bId !== id)
        : [...prev.branchIds, id]
    }));
  };

  const toggleProgram = (id: string) => {
    if (isReadOnly) return;
    setFormData(prev => {
      const current = prev.eligibleProgramIds ?? [];
      return {
        ...prev,
        eligibleProgramIds: current.includes(id) ? current.filter(pid => pid !== id) : [...current, id]
      };
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-text-primary mb-1">Promociones</h2>
          <p className="text-sm text-text-secondary">Gestión de promociones grupales y precios especiales</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="primary" className="flex items-center gap-2" onClick={() => handleOpenForm()}>
            <Plus size={16} />
            Nueva Promoción
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
                <th className="px-6 py-3 font-medium">Precio Total</th>
                <th className="px-6 py-3 font-medium">Alumnos Req.</th>
                <th className="px-6 py-3 font-medium">Vigencia</th>
                <th className="px-6 py-3 font-medium">Estado</th>
                <th className="px-6 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-soft">
              {paginatedPromotions.map((row) => (
                <tr key={row.id} className="hover:bg-surface-muted/50 transition-colors even:bg-surface-muted/30">
                  <td className="px-6 py-3 font-mono text-text-secondary">{row.code}</td>
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-primary-accent/10 text-primary-accent flex items-center justify-center">
                        <Tag size={16} />
                      </div>
                      <span className="font-medium text-text-primary">{row.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-1.5 font-medium text-primary-accent">
                      <DollarSign size={14} />
                      {row.currency === 'PEN' ? 'S/' : '$'} {row.totalPrice.toFixed(2)}
                    </div>
                  </td>
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-1.5 text-text-secondary">
                      <Users size={14} />
                      {row.requiredStudents}
                    </div>
                  </td>
                  <td className="px-6 py-3 text-text-secondary">
                    <div className="flex items-center gap-1.5">
                      <Calendar size={14} className="text-text-muted" />
                      {row.startDate} {row.endDate ? `- ${row.endDate}` : ''}
                    </div>
                  </td>
                  <td className="px-6 py-3">
                    <Badge variant={row.status === 'Activo' ? 'success' : 'neutral'}>{row.status}</Badge>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <ActionMenu 
                      items={[
                        { label: 'Ver detalles', onClick: () => handleOpenForm(row.id, true) },
                        { label: 'Editar promoción', onClick: () => handleOpenForm(row.id) },
                        { 
                          label: row.status === 'Activo' ? 'Desactivar' : 'Activar', 
                          onClick: () => openConfirm({
                            title: row.status === 'Activo' ? 'Desactivar Promoción' : 'Activar Promoción',
                            description: `¿Está seguro de que desea ${row.status === 'Activo' ? 'desactivar' : 'activar'} la promoción "${row.name}"?`,
                            onConfirm: () => {
                              updatePromotion(row.id, { status: row.status === 'Activo' ? 'Inactivo' : 'Activo' });
                            },
                            variant: row.status === 'Activo' ? 'warning' : 'primary',
                            confirmLabel: row.status === 'Activo' ? 'SÍ, DESACTIVAR' : 'SÍ, ACTIVAR'
                          }),
                          danger: row.status === 'Activo' 
                        },
                      ]} 
                    />
                  </td>
                </tr>
              ))}
              {paginatedPromotions.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-text-muted">
                    No se encontraron promociones.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-border-soft flex items-center justify-between bg-surface">
            <span className="text-sm text-text-secondary">
              Mostrando {startIndex + 1} a {Math.min(endIndex, filteredPromotions.length)} de {filteredPromotions.length} promociones
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
        onClose={() => {
          setIsFormOpen(false);
          setFormError(null);
        }} 
        title={selectedPromotion ? (isReadOnly ? "Ver Promoción" : "Editar Promoción") : "Crear Nueva Promoción"}
        size="5xl"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => {
              setIsFormOpen(false);
              setFormError(null);
            }}>
              {isReadOnly ? 'Cerrar' : 'Cancelar'}
            </Button>
            {!isReadOnly && (
              <Button variant="primary" onClick={handleSubmit}>Guardar Promoción</Button>
            )}
          </div>
        }
      >
        <form onSubmit={handleSubmit} className="p-4">
          {formError && (
             <div className="bg-danger/10 border border-danger/20 rounded-xl p-3 flex gap-2 text-sm text-danger animate-in fade-in slide-in-from-top-1 mb-6">
               <AlertCircle size={16} className="shrink-0 mt-0.5" />
               <p>{formError}</p>
             </div>
          )}
          <fieldset disabled={isReadOnly} className="grid grid-cols-1 lg:grid-cols-2 gap-x-12 gap-y-10">
            {/* Columna Izquierda */}
            <div className="space-y-10">
              
              {/* BLOQUE 1 — IDENTIFICACIÓN */}
              <section>
                <h3 className="text-base font-semibold text-text-primary mb-4">Identificación</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5 col-span-2">
                    <label className="text-sm font-medium text-text-primary">Código de Promoción <span className="text-error">*</span></label>
                    <input 
                      type="text" 
                      required
                      value={formData.code}
                      onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value.replace(/\s/g, '').toUpperCase() }))}
                      className="w-full h-10 bg-surface border border-border-soft rounded-lg px-3 text-sm focus:outline-none focus:border-primary-accent font-mono uppercase" 
                      placeholder="Ej. PROMO-2KIDS" 
                    />
                    <p className="text-xs text-text-muted">Único, sin espacios</p>
                  </div>
                  <div className="space-y-1.5 col-span-2">
                    <label className="text-sm font-medium text-text-primary">Nombre de la Promoción <span className="text-error">*</span></label>
                    <input 
                      type="text" 
                      required
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full h-10 bg-surface border border-border-soft rounded-lg px-3 text-sm focus:outline-none focus:border-primary-accent" 
                      placeholder="Ej. 2 Kids por 700" 
                    />
                  </div>
                </div>
              </section>

              {/* BLOQUE 2 — ELEGIBILIDAD */}
              <section>
                <h3 className="text-base font-semibold text-text-primary mb-4">Elegibilidad</h3>
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-text-primary">Tipo de Promoción <span className="text-error">*</span></label>
                      <select 
                        disabled
                        value={formData.type}
                        className="w-full h-10 bg-surface-muted border border-border-soft rounded-lg px-3 text-sm text-text-secondary focus:outline-none"
                      >
                        <option value="Grupal">Promoción Grupal</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-text-primary">Cantidad de Alumnos Req. <span className="text-error">*</span></label>
                      <input 
                        type="number" 
                        min="2"
                        required
                        value={formData.requiredStudents}
                        onChange={(e) => setFormData(prev => ({ ...prev, requiredStudents: parseInt(e.target.value) || 2 }))}
                        className="w-full h-10 bg-surface border border-border-soft rounded-lg px-3 text-sm focus:outline-none focus:border-primary-accent" 
                      />
                    </div>
                  </div>

                  {/* Programas elegibles */}
                  <div className="space-y-3">
                    <label className="text-sm font-medium text-text-primary">Programas elegibles <span className="text-error">*</span></label>
                    {isLegacyComposition && (
                      <p className="text-xs text-warning-text bg-warning-tint border border-border-soft rounded-lg p-2">
                        Esta promoción usaba una composición fija. Al guardar se convierte a elegibilidad por programas:
                        cualquier combinación de los programas marcados será válida.
                      </p>
                    )}
                    <div className="p-4 border border-border-soft rounded-xl bg-surface-muted/20 flex flex-wrap gap-2">
                      {programs.map(p => {
                        const selected = (formData.eligibleProgramIds ?? []).includes(p.id);
                        return (
                          <button
                            key={p.id}
                            type="button"
                            disabled={isReadOnly}
                            onClick={() => toggleProgram(p.id)}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                              selected
                                ? 'bg-primary-accent text-white border-primary-accent'
                                : 'bg-surface text-text-secondary border-border-soft hover:border-primary-accent hover:text-primary-accent'
                            }`}
                          >
                            {p.name}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-xs text-text-muted">
                      Cualquier combinación de estos programas (y niveles) forma el grupo, siempre que cada alumno cumpla el tipo de pago y el precio base.
                    </p>
                  </div>

                  {/* Tipos de Pago Permitidos */}
                  <div className="space-y-3">
                    <label className="text-sm font-medium text-text-primary">Tipos de Pago Permitidos <span className="text-error">*</span></label>
                    <div className="p-4 border border-border-soft rounded-xl bg-surface-muted/20 space-y-4">
                      {/* Selected Tags */}
                      <div className="flex flex-wrap gap-2 min-h-[32px]">
                        <AnimatePresence mode="popLayout">
                          {formData.paymentTypeIds.map(ptId => {
                            const pt = paymentTypes.find(p => p.id === ptId);
                            if (!pt) return null;
                            return (
                              <motion.div
                                layout
                                key={pt.id}
                                initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.8, filter: "blur(4px)" }}
                                animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, filter: "blur(0px)" }}
                                exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.8, filter: "blur(4px)" }}
                                transition={{ duration: 0.2, type: "spring", bounce: 0 }}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-accent text-white rounded-lg shadow-sm group"
                              >
                                <span className="text-sm font-medium">{pt.name}</span>
                                {!isReadOnly && (
                                  <button
                                    type="button"
                                    onClick={() => togglePaymentType(pt.id)}
                                    className="p-0.5 rounded-md hover:bg-white/20 transition-colors focus:outline-none focus:ring-2 focus:ring-white/50"
                                  >
                                    <X size={14} />
                                  </button>
                                )}
                              </motion.div>
                            );
                          })}
                        </AnimatePresence>
                        {formData.paymentTypeIds.length === 0 && (
                          <span className="text-sm text-text-muted italic py-1.5">Ningún tipo de pago seleccionado</span>
                        )}
                      </div>

                      {/* Available Payment Types to Add */}
                      {!isReadOnly && formData.paymentTypeIds.length < paymentTypes.length && (
                        <div className="pt-3 border-t border-border-soft/50">
                          <p className="text-[10px] text-text-muted uppercase tracking-wider mb-2 font-medium">Tipos de Pago Disponibles</p>
                          <div className="flex flex-wrap gap-2">
                            <AnimatePresence mode="popLayout">
                              {paymentTypes.filter(pt => !formData.paymentTypeIds.includes(pt.id)).map(pt => (
                                <motion.button
                                  layout
                                  key={pt.id}
                                  initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.8 }}
                                  animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }}
                                  exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.8 }}
                                  transition={{ duration: 0.2 }}
                                  type="button"
                                  onClick={() => togglePaymentType(pt.id)}
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-surface border border-border-soft text-text-secondary rounded-lg hover:border-primary-accent hover:text-primary-accent transition-colors shadow-sm"
                                >
                                  <Plus size={14} />
                                  <span className="text-sm font-medium">{pt.name}</span>
                                </motion.button>
                              ))}
                            </AnimatePresence>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            </div>

            {/* Columna Derecha */}
            <div className="space-y-10">
              
              {/* BLOQUE 3 — CONDICIÓN COMERCIAL */}
              <section>
                <h3 className="text-base font-semibold text-text-primary mb-4">Condición Comercial</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-text-primary">Precio Promocional Total <span className="text-error">*</span></label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-sm">{formData.currency === 'PEN' ? 'S/' : '$'}</span>
                      <input 
                        type="number" 
                        min="0" 
                        step="0.01"
                        required
                        value={formData.totalPrice}
                        onChange={(e) => setFormData(prev => ({ ...prev, totalPrice: parseFloat(e.target.value) || 0 }))}
                        className="w-full h-10 bg-surface border border-border-soft rounded-lg pl-8 pr-3 text-sm focus:outline-none focus:border-primary-accent" 
                        placeholder="0.00" 
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-text-primary">Moneda <span className="text-error">*</span></label>
                    <select 
                      disabled
                      value="USD"
                      className="w-full h-10 bg-surface-muted border border-border-soft rounded-lg px-3 text-sm text-text-secondary focus:outline-none"
                    >
                      <option value="USD">Dólares (USD)</option>
                    </select>
                  </div>
                  <div className="space-y-1.5 col-span-2">
                    <label className="text-sm font-medium text-text-primary">Precio contado base requerido (por alumno)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-sm">{formData.currency === 'PEN' ? 'S/' : '$'}</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={formData.requiredBasePrice ?? ''}
                        onChange={(e) => setFormData(prev => ({ ...prev, requiredBasePrice: e.target.value === '' ? undefined : parseFloat(e.target.value) }))}
                        className="w-full h-10 bg-surface border border-border-soft rounded-lg pl-8 pr-3 text-sm focus:outline-none focus:border-primary-accent"
                        placeholder="Sin condición de precio"
                      />
                    </div>
                    <p className="text-xs text-text-muted">Se compara con el precio del tarifario vigente de cada alumno. Vacío = no se exige un precio.</p>
                  </div>
                  <div className="space-y-1.5 col-span-2">
                    <label className="text-sm font-medium text-text-primary">Regla de Reparto Interno</label>
                    <input 
                      type="text" 
                      disabled
                      value={formData.internalDistributionRule}
                      className="w-full h-10 bg-surface-muted border border-border-soft rounded-lg px-3 text-sm text-text-secondary focus:outline-none" 
                    />
                    <p className="text-xs text-text-muted">El precio total se dividirá equitativamente entre los alumnos del grupo.</p>
                  </div>
                </div>
              </section>

              {/* BLOQUE 4 — ALCANCE Y VIGENCIA */}
              <section>
                <h3 className="text-base font-semibold text-text-primary mb-4">Alcance y Vigencia</h3>
                <div className="space-y-6">
                  {/* Sedes Aplicables */}
                  <div className="space-y-3">
                    <div className="p-5 bg-surface-muted/30 border border-border-soft rounded-xl space-y-5">
                      <div className="flex items-center justify-between cursor-pointer group">
                        <div className="space-y-0.5">
                          <p className="text-sm font-medium text-text-primary group-hover:text-primary-accent transition-colors">Aplica a todas las sedes</p>
                          <p className="text-xs text-text-secondary">Define si esta promoción está disponible en todas las sedes.</p>
                        </div>
                        {!isReadOnly && (
                          <label className="switch">
                            <input 
                              type="checkbox" 
                              checked={formData.applyToAllBranches}
                              onChange={(e) => {
                                const isChecked = e.target.checked;
                                setFormData(prev => ({ 
                                  ...prev, 
                                  applyToAllBranches: isChecked,
                                  branchIds: isChecked ? branches.map(b => b.id) : []
                                }));
                              }}
                            />
                            <span className="slider"></span>
                          </label>
                        )}
                      </div>
                      
                      {!formData.applyToAllBranches && (
                        <div className="pt-4 border-t border-border-soft space-y-4">
                          <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">Sedes Seleccionadas <span className="text-error">*</span></label>
                          <div className="p-4 border border-border-soft rounded-xl bg-surface-muted/20 space-y-4">
                            {/* Selected Tags */}
                            <div className="flex flex-wrap gap-2 min-h-[32px]">
                              <AnimatePresence mode="popLayout">
                                {formData.branchIds.map(branchId => {
                                  const branch = branches.find(b => b.id === branchId);
                                  if (!branch) return null;
                                  return (
                                    <motion.div
                                      layout
                                      key={branch.id}
                                      initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.8, filter: "blur(4px)" }}
                                      animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, filter: "blur(0px)" }}
                                      exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.8, filter: "blur(4px)" }}
                                      transition={{ duration: 0.2, type: "spring", bounce: 0 }}
                                      className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-accent text-white rounded-lg shadow-sm group"
                                    >
                                      <span className="text-sm font-medium">{branch.name}</span>
                                      {!isReadOnly && (
                                        <button
                                          type="button"
                                          onClick={() => toggleBranch(branch.id)}
                                          className="p-0.5 rounded-md hover:bg-white/20 transition-colors focus:outline-none focus:ring-2 focus:ring-white/50"
                                        >
                                          <X size={14} />
                                        </button>
                                      )}
                                    </motion.div>
                                  );
                                })}
                              </AnimatePresence>
                              {formData.branchIds.length === 0 && (
                                <span className="text-sm text-text-muted italic py-1.5">Ninguna sede seleccionada</span>
                              )}
                            </div>

                            {/* Available Branches to Add */}
                            {!isReadOnly && formData.branchIds.length < branches.length && (
                              <div className="pt-3 border-t border-border-soft/50">
                                <p className="text-[10px] text-text-muted uppercase tracking-wider mb-2 font-medium">Sedes Disponibles</p>
                                <div className="flex flex-wrap gap-2">
                                  <AnimatePresence mode="popLayout">
                                    {branches.filter(b => !formData.branchIds.includes(b.id)).map(branch => (
                                      <motion.button
                                        layout
                                        key={branch.id}
                                        initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.8 }}
                                        animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }}
                                        exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.8 }}
                                        transition={{ duration: 0.2 }}
                                        type="button"
                                        onClick={() => toggleBranch(branch.id)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-surface border border-border-soft text-text-secondary rounded-lg hover:border-primary-accent hover:text-primary-accent transition-colors shadow-sm"
                                      >
                                        <Plus size={14} />
                                        <span className="text-sm font-medium">{branch.name}</span>
                                      </motion.button>
                                    ))}
                                  </AnimatePresence>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-text-primary">Fecha Inicio <span className="text-error">*</span></label>
                      <DateInput 
                        
                        required
                        value={formData.startDate}
                        onChange={(e) => setFormData(prev => ({ ...prev, startDate: e.target.value }))}
                        className="w-full h-10 bg-surface border border-border-soft rounded-lg px-3 text-sm focus:outline-none focus:border-primary-accent" 
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-text-primary">Fecha Fin</label>
                      <DateInput 
                        
                        value={formData.endDate}
                        onChange={(e) => setFormData(prev => ({ ...prev, endDate: e.target.value }))}
                        className="w-full h-10 bg-surface border border-border-soft rounded-lg px-3 text-sm focus:outline-none focus:border-primary-accent" 
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-surface-muted/30 border border-border-soft rounded-xl">
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium text-text-primary">Permitir múltiples grupos</p>
                      <p className="text-xs text-text-secondary">Con 4 alumnos y una promoción de 2, se podrían formar 2 grupos.</p>
                    </div>
                    {!isReadOnly && (
                      <label className="switch">
                        <input 
                          type="checkbox" 
                          checked={!!formData.allowMultipleGroups}
                          onChange={(e) => setFormData(prev => ({ ...prev, allowMultipleGroups: e.target.checked }))}
                        />
                        <span className="slider"></span>
                      </label>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-text-primary">Estado <span className="text-error">*</span></label>
                    <select 
                      required
                      value={formData.status}
                      onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value as 'Activo' | 'Inactivo' }))}
                      className="w-full h-10 bg-surface border border-border-soft rounded-lg px-3 text-sm focus:outline-none focus:border-primary-accent"
                    >
                      <option value="Activo">Activo</option>
                      <option value="Inactivo">Inactivo</option>
                    </select>
                  </div>
                </div>
              </section>

              {/* BLOQUE 5 — INTERNO */}
              <section>
                <h3 className="text-base font-semibold text-text-primary mb-4">Interno</h3>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-text-primary">Observaciones</label>
                    <textarea 
                      rows={3}
                      value={formData.observations}
                      onChange={(e) => setFormData(prev => ({ ...prev, observations: e.target.value }))}
                      className="w-full bg-surface border border-border-soft rounded-lg p-3 text-sm focus:outline-none focus:border-primary-accent resize-none" 
                      placeholder="Notas internas sobre la promoción..." 
                    />
                  </div>
                  <div className="flex items-start gap-3 p-4 bg-primary-accent/5 border border-primary-accent/20 rounded-xl">
                    <AlertCircle className="text-primary-accent shrink-0 mt-0.5" size={18} />
                    <div>
                      <h5 className="text-sm font-medium text-primary-accent mb-1">Regla de Exclusividad</h5>
                      <p className="text-xs text-text-secondary leading-relaxed">
                        Un alumno solo puede pertenecer a un grupo promocional dentro del mismo registro. Cada grupo realiza un único pago, que puede componerse de varias partes.
                      </p>
                    </div>
                  </div>
                </div>
              </section>
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
        hideCancel={confirmConfig.hideCancel}
      />
    </div>
  );
}
