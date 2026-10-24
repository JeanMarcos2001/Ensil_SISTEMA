import React, { useState, useEffect } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { ActionMenu } from '../../components/ui/ActionMenu';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { useTablePagination } from '../../hooks/useTablePagination';
import { useData, Tariff, TariffInstallment } from '../../context/DataContext';
import { generateBreakdown, countObligations, resolveScheduleMode, sumBreakdown, roundMoney } from '../../utils/tariffs';
import { Search, Plus, DollarSign, Calendar, AlertCircle } from 'lucide-react';
import { DateInput } from '../../components/ui/DateInput';
import { todayLocalISO } from '../../utils/schedule';

export function Tariffs() {
  const { tariffs, programs, levels, paymentTypes, branches, addTariff, updateTariff, deleteTariff } = useData();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [selectedTariff, setSelectedTariff] = useState<Tariff | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [programFilter, setProgramFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
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

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    programId: '',
    levelId: '',
    paymentTypeId: '',
    branchId: 'all',
    currency: 'USD' as 'PEN' | 'USD',
    basePrice: 0,
    installments: [] as TariffInstallment[],
    startDate: '',
    endDate: '',
    status: 'Activo' as 'Activo' | 'Inactivo'
  });

  // Parámetros del generador de desglose (no se persisten; el desglose es la fuente del total)
  const [genEnrollment, setGenEnrollment] = useState(0);
  const [genAmount, setGenAmount] = useState(0);

  useEffect(() => {
    setGenEnrollment(0);
    setGenAmount(0);
    if (selectedTariff) {
      setFormData({
        name: selectedTariff.name,
        programId: selectedTariff.programId,
        levelId: selectedTariff.levelId || '',
        paymentTypeId: selectedTariff.paymentTypeId,
        branchId: selectedTariff.branchId,
        currency: selectedTariff.currency,
        basePrice: selectedTariff.basePrice,
        installments: selectedTariff.installments,
        startDate: selectedTariff.startDate,
        endDate: selectedTariff.endDate || '',
        status: selectedTariff.status
      });
    } else {
      setFormData({
        name: '',
        programId: '',
        levelId: '',
        paymentTypeId: '',
        branchId: 'all',
        currency: 'USD',
        basePrice: 0,
        installments: [],
        startDate: todayLocalISO(),
        endDate: '',
        status: 'Activo'
      });
    }
  }, [selectedTariff]);

  const handleOpenForm = (tariff?: Tariff, readOnly = false) => {
    setFormError(null);
    setSelectedTariff(tariff || null);
    setIsReadOnly(readOnly);
    setIsFormOpen(true);
  };

  const handleDuplicate = (tariff: Tariff) => {
    const { id, ...rest } = tariff;
    addTariff({
      ...rest,
      name: `${rest.name} (Copia)`
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) return;
    setFormError(null);

    if (!formData.name.trim()) {
      setFormError("El nombre de la tarifa es obligatorio.");
      return;
    }
    if (!formData.programId) {
      setFormError("Debe seleccionar un programa.");
      return;
    }
    const selectedProgram = programs.find(p => p.id === formData.programId);
    if (formData.levelId) {
      const level = levels.find(l => l.id === formData.levelId);
      if (!selectedProgram?.hasLevels || !level || level.programId !== formData.programId) {
        setFormError("El nivel seleccionado no pertenece al programa.");
        return;
      }
    }
    if (!formData.paymentTypeId) {
      setFormError("Debe seleccionar un tipo de pago.");
      return;
    }
    const paymentType = paymentTypes.find(pt => pt.id === formData.paymentTypeId);
    if (formData.installments.length === 0) {
      setFormError("Genere el desglose antes de guardar.");
      return;
    }
    if (paymentType && countObligations(formData.installments) !== paymentType.installments) {
      setFormError(`El tipo de pago "${paymentType.name}" requiere ${paymentType.installments} obligación(es) además de la matrícula. Regenere el desglose.`);
      return;
    }
    const hasVariable = formData.installments.some(l => l.variable);
    if (!hasVariable && formData.installments.some(l => !(l.amount > 0))) {
      setFormError("Todas las líneas del desglose deben tener un monto mayor a 0.");
      return;
    }
    const total = hasVariable ? roundMoney(formData.basePrice) : sumBreakdown(formData.installments);
    if (!(total > 0)) {
      setFormError(hasVariable ? "Indique el total objetivo (mayor a 0)." : "El total del desglose debe ser mayor a 0.");
      return;
    }

    const dataToSave = {
      ...formData,
      currency: 'USD' as const, // La configuración comercial es siempre en dólares
      basePrice: total, // Con montos fijos el total siempre es la suma del desglose
      levelId: selectedProgram?.hasLevels && formData.levelId ? formData.levelId : undefined,
      endDate: formData.endDate || undefined,
    };

    if (selectedTariff) {
      updateTariff(selectedTariff.id, dataToSave);
    } else {
      addTariff(dataToSave);
    }
    setIsFormOpen(false);
  };

  const generateInstallments = () => {
    const paymentType = paymentTypes.find(pt => pt.id === formData.paymentTypeId);
    if (!paymentType) {
      setFormError("Seleccione un tipo de pago para generar el desglose.");
      return;
    }
    setFormError(null);
    const mode = resolveScheduleMode(paymentType);
    const lines = generateBreakdown({
      mode,
      count: paymentType.installments,
      intervalDays: paymentType.termDays || 30,
      amount: genAmount,
      enrollmentAmount: genEnrollment,
    });
    setFormData(prev => ({
      ...prev,
      installments: lines,
      basePrice: lines.some(l => l.variable) ? prev.basePrice : sumBreakdown(lines),
    }));
  };

  const updateInstallment = (index: number, field: keyof TariffInstallment, value: any) => {
    const newInstallments = [...formData.installments];
    newInstallments[index] = { ...newInstallments[index], [field]: value };
    setFormData(prev => ({
      ...prev,
      installments: newInstallments,
      basePrice: newInstallments.some(l => l.variable) ? prev.basePrice : sumBreakdown(newInstallments),
    }));
  };

  const filteredTariffs = tariffs.filter(t => {
    const matchesSearch = t.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesProgram = programFilter ? t.programId === programFilter : true;
    const matchesBranch = branchFilter ? t.branchId === branchFilter : true;
    const matchesStatus = statusFilter ? t.status === statusFilter : true;
    return matchesSearch && matchesProgram && matchesBranch && matchesStatus;
  });

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = useTablePagination();

  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, programFilter, branchFilter, statusFilter]);

  const totalPages = Math.ceil(filteredTariffs.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedTariffs = filteredTariffs.slice(startIndex, endIndex);

  const getProgramName = (id: string) => programs.find(p => p.id === id)?.name || 'N/A';
  const getPaymentTypeName = (id: string) => paymentTypes.find(pt => pt.id === id)?.name || 'N/A';
  const getBranchName = (id: string) => id === 'all' ? 'Todas' : branches.find(b => b.id === id)?.name || 'N/A';

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-text-primary mb-1">Tarifarios</h2>
          <p className="text-sm text-text-secondary">Precios base por programa, sede y tipo de pago</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="primary" className="flex items-center gap-2" onClick={() => handleOpenForm()}>
            <Plus size={16} />
            Nuevo Tarifario
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
                placeholder="Buscar por nombre..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full h-10 bg-surface border border-border-soft rounded-xl pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary-accent focus:ring-1 focus:ring-primary-accent transition-shadow"
              />
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 md:pb-0">
              <select 
                value={programFilter}
                onChange={(e) => setProgramFilter(e.target.value)}
                className="h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent min-w-[140px]"
              >
                <option value="">Programa</option>
                {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select 
                value={branchFilter}
                onChange={(e) => setBranchFilter(e.target.value)}
                className="h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent min-w-[140px]"
              >
                <option value="">Sede</option>
                <option value="all">Todas</option>
                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
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
                <th className="px-6 py-3 font-medium">Nombre</th>
                <th className="px-6 py-3 font-medium">Programa</th>
                <th className="px-6 py-3 font-medium">Tipo Pago</th>
                <th className="px-6 py-3 font-medium">Sede</th>
                <th className="px-6 py-3 font-medium">Precio Base</th>
                <th className="px-6 py-3 font-medium">Vigencia</th>
                <th className="px-6 py-3 font-medium">Estado</th>
                <th className="px-6 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-soft">
              {paginatedTariffs.map((row) => (
                <tr key={row.id} className="hover:bg-surface-muted/50 transition-colors even:bg-surface-muted/30">
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-primary-accent/10 text-primary-accent flex items-center justify-center">
                        <DollarSign size={16} />
                      </div>
                      <span className="font-medium text-text-primary">{row.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-3 text-text-secondary">{getProgramName(row.programId)}{row.levelId ? ` · ${levels.find(l => l.id === row.levelId)?.name ?? ''}` : ''}</td>
                  <td className="px-6 py-3 text-text-secondary">{getPaymentTypeName(row.paymentTypeId)}</td>
                  <td className="px-6 py-3 text-text-secondary">{getBranchName(row.branchId)}</td>
                  <td className="px-6 py-3 font-medium text-text-primary">
                    {row.currency === 'PEN' ? 'S/' : '$'} {row.basePrice.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-6 py-3 text-text-secondary">
                    <div className="flex items-center gap-1.5">
                      <Calendar size={14} className="text-text-muted" />
                      {row.startDate} - {row.endDate || 'Indefinido'}
                    </div>
                  </td>
                  <td className="px-6 py-3">
                    <Badge variant={row.status === 'Activo' ? 'success' : 'neutral'}>{row.status}</Badge>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <ActionMenu 
                      items={[
                        { label: 'Ver detalles', onClick: () => handleOpenForm(row, true) },
                        { label: 'Editar tarifario', onClick: () => handleOpenForm(row) },
                        { 
                          label: 'Duplicar', 
                          onClick: () => openConfirm({
                            title: 'Duplicar Tarifario',
                            description: `¿Está seguro de que desea duplicar el tarifario "${row.name}"?`,
                            onConfirm: () => handleDuplicate(row),
                            variant: 'primary',
                            confirmLabel: 'SÍ, DUPLICAR'
                          }) 
                        },
                        { 
                          label: row.status === 'Activo' ? 'Desactivar' : 'Activar', 
                          onClick: () => openConfirm({
                            title: row.status === 'Activo' ? 'Desactivar Tarifario' : 'Activar Tarifario',
                            description: `¿Está seguro de que desea ${row.status === 'Activo' ? 'desactivar' : 'activar'} el tarifario "${row.name}"?`,
                            onConfirm: () => updateTariff(row.id, { status: row.status === 'Activo' ? 'Inactivo' : 'Activo' }),
                            variant: row.status === 'Activo' ? 'warning' : 'primary',
                            confirmLabel: row.status === 'Activo' ? 'SÍ, DESACTIVAR' : 'SÍ, ACTIVAR'
                          }),
                          danger: row.status === 'Activo' 
                        },
                        { 
                          label: 'Eliminar', 
                          onClick: () => openConfirm({
                            title: 'Eliminar Tarifario',
                            description: `¿Está seguro de que desea eliminar el tarifario "${row.name}"? Esta acción no se puede deshacer.`,
                            onConfirm: () => deleteTariff(row.id),
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
              Mostrando {startIndex + 1} a {Math.min(endIndex, filteredTariffs.length)} de {filteredTariffs.length} tarifarios
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
        title={isReadOnly ? "Detalles del Tarifario" : selectedTariff ? "Editar Tarifario" : "Crear Nuevo Tarifario"}
        size="5xl"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => {
              setIsFormOpen(false);
              setFormError(null);
            }}>
              {isReadOnly ? "Cerrar" : "Cancelar"}
            </Button>
            {!isReadOnly && (
              <Button variant="primary" onClick={handleSubmit}>Guardar Tarifario</Button>
            )}
          </div>
        }
      >
        <form onSubmit={handleSubmit} className="pb-4">
          {formError && (
             <div className="bg-danger/10 border border-danger/20 rounded-xl p-3 flex gap-2 text-sm text-danger animate-in fade-in slide-in-from-top-1 mb-6">
               <AlertCircle size={16} className="shrink-0 mt-0.5" />
               <p>{formError}</p>
             </div>
          )}
          <fieldset disabled={isReadOnly} className="grid grid-cols-1 lg:grid-cols-2 gap-x-12 gap-y-10">
            {/* Columna Izquierda */}
            <div className="space-y-10">
              {/* General Info */}
              <section>
                <h3 className="text-base font-semibold text-text-primary mb-4">Información General</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5 col-span-2">
                    <label className="text-sm font-medium text-text-primary">Nombre del Tarifario <span className="text-error">*</span></label>
                    <input 
                      type="text" 
                      required
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full h-10 bg-surface border border-border-soft rounded-lg px-3 text-sm focus:outline-none focus:border-primary-accent" 
                      placeholder="Ej. Kids - Contado 2024" 
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-text-primary">Programa <span className="text-error">*</span></label>
                    <select 
                      required
                      value={formData.programId}
                      onChange={(e) => setFormData(prev => ({ ...prev, programId: e.target.value, levelId: '' }))}
                      className="w-full h-10 bg-surface border border-border-soft rounded-lg px-3 text-sm focus:outline-none focus:border-primary-accent"
                    >
                      <option value="">Seleccionar...</option>
                      {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  {programs.find(p => p.id === formData.programId)?.hasLevels && (
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-text-primary">Nivel</label>
                      <select
                        value={formData.levelId}
                        onChange={(e) => setFormData(prev => ({ ...prev, levelId: e.target.value }))}
                        className="w-full h-10 bg-surface border border-border-soft rounded-lg px-3 text-sm focus:outline-none focus:border-primary-accent"
                      >
                        <option value="">Todos los niveles</option>
                        {levels
                          .filter(l => l.programId === formData.programId && (l.status === 'Activo' || l.id === formData.levelId))
                          .sort((a, b) => a.order - b.order)
                          .map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                      </select>
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-text-primary">Tipo de Pago <span className="text-error">*</span></label>
                    <select 
                      required
                      value={formData.paymentTypeId}
                      onChange={(e) => setFormData(prev => ({ ...prev, paymentTypeId: e.target.value }))}
                      className="w-full h-10 bg-surface border border-border-soft rounded-lg px-3 text-sm focus:outline-none focus:border-primary-accent"
                    >
                      <option value="">Seleccionar...</option>
                      {paymentTypes.map(pt => <option key={pt.id} value={pt.id}>{pt.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-text-primary">Sede <span className="text-error">*</span></label>
                    <select 
                      required
                      value={formData.branchId}
                      onChange={(e) => setFormData(prev => ({ ...prev, branchId: e.target.value }))}
                      className="w-full h-10 bg-surface border border-border-soft rounded-lg px-3 text-sm focus:outline-none focus:border-primary-accent"
                    >
                      <option value="all">Todas</option>
                      {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
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

              {/* Validity */}
              <section>
                <h3 className="text-base font-semibold text-text-primary mb-4">Vigencia</h3>
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
                    <p className="text-xs text-text-muted">Dejar en blanco para vigencia indefinida</p>
                  </div>
                </div>
              </section>
            </div>

            {/* Columna Derecha */}
            <div className="space-y-10">
              {/* Pricing */}
              <section>
                <h3 className="text-base font-semibold text-text-primary mb-4">Moneda y total</h3>
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-text-primary">Moneda <span className="text-error">*</span></label>
                    <select 
                      disabled
                      value="USD"
                      className="w-full h-10 bg-surface-muted border border-border-soft rounded-lg px-3 text-sm text-text-secondary focus:outline-none"
                    >
                      <option value="USD">Dólares (USD)</option>
                    </select>
                    <p className="text-xs text-text-muted">Toda la configuración comercial se expresa en dólares. El tipo de cambio se aplica solo al cobrar.</p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-text-primary">
                      {formData.installments.some(l => l.variable) ? 'Total objetivo' : 'Precio total (suma del desglose)'}
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-sm">{formData.currency === 'PEN' ? 'S/' : '$'}</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        readOnly={!formData.installments.some(l => l.variable)}
                        value={formData.installments.some(l => l.variable) ? formData.basePrice : sumBreakdown(formData.installments)}
                        onChange={(e) => setFormData(prev => ({ ...prev, basePrice: parseFloat(e.target.value) || 0 }))}
                        className="w-full h-10 bg-surface-muted border border-border-soft rounded-lg pl-8 pr-3 text-sm focus:outline-none focus:border-primary-accent read-only:text-text-secondary"
                        placeholder="0.00"
                      />
                    </div>
                    <p className="text-xs text-text-muted">
                      {formData.installments.some(l => l.variable)
                        ? 'En este cronograma el monto de cada parte se define al cobrar.'
                        : 'Se calcula automáticamente a partir del desglose.'}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 p-4 border border-border-soft rounded-xl bg-surface-muted/30">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-text-primary">Matrícula (opcional)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-sm">{formData.currency === 'PEN' ? 'S/' : '$'}</span>
                      <input
                        type="number" min="0" step="0.01"
                        value={genEnrollment}
                        onChange={(e) => setGenEnrollment(parseFloat(e.target.value) || 0)}
                        className="w-full h-10 bg-surface border border-border-soft rounded-lg pl-8 pr-3 text-sm focus:outline-none focus:border-primary-accent"
                        placeholder="0.00"
                      />
                    </div>
                    <p className="text-xs text-text-muted">Línea propia con vencimiento día 0.</p>
                  </div>
                  {(() => {
                    const pt = paymentTypes.find(x => x.id === formData.paymentTypeId);
                    const mode = pt ? resolveScheduleMode(pt) : null;
                    if (mode === 'fechas_manuales') {
                      return (
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium text-text-primary">Montos</label>
                          <p className="text-xs text-text-muted pt-2">Se definen al cobrar en Planes; la última parte es el saldo.</p>
                        </div>
                      );
                    }
                    return (
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-text-primary">{mode === 'inmediato' ? 'Monto del pago único' : 'Monto por cuota'}</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-sm">{formData.currency === 'PEN' ? 'S/' : '$'}</span>
                          <input
                            type="number" min="0" step="0.01"
                            value={genAmount}
                            onChange={(e) => setGenAmount(parseFloat(e.target.value) || 0)}
                            className="w-full h-10 bg-surface border border-border-soft rounded-lg pl-8 pr-3 text-sm focus:outline-none focus:border-primary-accent"
                            placeholder="0.00"
                          />
                        </div>
                      </div>
                    );
                  })()}
                </div>
                <p className="text-xs text-text-muted mt-2">
                  Los materiales no forman parte del tarifario: se resuelven por Programa/Nivel → Receta → Catálogo de artículos.
                </p>
              </section>

              {/* Installments Breakdown (Dynamic) */}
              <section>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-base font-semibold text-text-primary">Desglose de obligaciones</h3>
                  {!isReadOnly && (
                    <Button type="button" variant="outline" size="sm" onClick={generateInstallments}>Generar desglose</Button>
                  )}
                </div>
                <div className="border border-border-soft rounded-xl overflow-hidden">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-text-secondary uppercase bg-surface-muted/50">
                      <tr>
                        <th className="px-4 py-3 font-medium">N°</th>
                        <th className="px-4 py-3 font-medium">Concepto</th>
                        <th className="px-4 py-3 font-medium">Monto ({formData.currency === 'PEN' ? 'S/' : '$'})</th>
                        <th className="px-4 py-3 font-medium">Días Vencimiento</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-soft">
                      {formData.installments.map((inst, idx) => (
                        <tr key={idx} className="bg-surface">
                          <td className="px-4 py-3 text-text-secondary">{inst.number}</td>
                          <td className="px-4 py-3 text-text-primary font-medium">
                            <input 
                              type="text" 
                              className="w-full h-8 bg-surface border border-border-soft rounded px-2 text-sm focus:outline-none focus:border-primary-accent" 
                              value={inst.concept}
                              onChange={(e) => updateInstallment(idx, 'concept', e.target.value)}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <input 
                              type="number" 
                              step="0.01"
                              className="w-full h-8 bg-surface border border-border-soft rounded px-2 text-sm focus:outline-none focus:border-primary-accent" 
                              value={inst.variable ? '' : inst.amount}
                              disabled={inst.variable}
                              placeholder={inst.variable ? 'Al cobrar' : undefined}
                              onChange={(e) => updateInstallment(idx, 'amount', parseFloat(e.target.value) || 0)}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <input 
                              type="number" 
                              className="w-full h-8 bg-surface border border-border-soft rounded px-2 text-sm focus:outline-none focus:border-primary-accent" 
                              value={inst.dueDays}
                              onChange={(e) => updateInstallment(idx, 'dueDays', parseInt(e.target.value) || 0)}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-surface-muted/30">
                      <tr>
                        <td colSpan={2} className="px-4 py-3 text-right font-medium text-text-primary">
                          {formData.installments.some(l => l.variable) ? 'Total objetivo:' : 'Total del desglose:'}
                        </td>
                        <td className="px-4 py-3 font-bold text-primary-accent">
                          {formData.currency === 'PEN' ? 'S/' : '$'} {(
                            formData.installments.some(l => l.variable) ? formData.basePrice : sumBreakdown(formData.installments)
                          ).toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <p className="text-xs text-text-muted mt-2">
                  El desglose es la fuente del total. En planes fijos cada cuota posterior vence exactamente el intervalo de días del tipo de pago.
                </p>
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
      />
    </div>
  );
}
