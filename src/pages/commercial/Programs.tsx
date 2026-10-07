import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { ActionMenu } from '../../components/ui/ActionMenu';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { useTablePagination } from '../../hooks/useTablePagination';
import { useData, Program } from '../../context/DataContext';
import { Search, Plus, BookOpen, Layers, X, AlertCircle } from 'lucide-react';

export function Programs() {
  const { programs, addProgram, updateProgram, deleteProgram, branches } = useData();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [selectedProgram, setSelectedProgram] = useState<Program | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const shouldReduceMotion = useReducedMotion();

  // Confirmation Dialog State
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
    variant: 'danger' | 'primary' | 'warning';
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
    code: '',
    name: '',
    alias: '',
    description: '',
    hasLevels: true,
    durationBase: '' as number | '',
    warranty: '' as number | '',
    allBranches: true,
    enabledBranches: [] as string[],
    status: 'Activo' as 'Activo' | 'Inactivo',
    observations: ''
  });

  const [aliasTags, setAliasTags] = useState<string[]>([]);
  const [aliasInput, setAliasInput] = useState('');

  useEffect(() => {
    if (selectedProgram) {
      setFormData({
        code: selectedProgram.code,
        name: selectedProgram.name,
        alias: selectedProgram.alias || '',
        description: selectedProgram.description || '',
        hasLevels: selectedProgram.hasLevels,
        durationBase: selectedProgram.durationBase,
        warranty: selectedProgram.warranty,
        allBranches: selectedProgram.allBranches,
        enabledBranches: selectedProgram.enabledBranches || [],
        status: selectedProgram.status,
        observations: selectedProgram.observations || ''
      });
      setAliasTags(selectedProgram.alias ? selectedProgram.alias.split(',').map(t => t.trim()).filter(Boolean) : []);
    } else {
      setFormData({
        code: '',
        name: '',
        alias: '',
        description: '',
        hasLevels: true,
        durationBase: '' as number | '',
        warranty: 0,
        allBranches: true,
        enabledBranches: [],
        status: 'Activo',
        observations: ''
      });
      setAliasTags([]);
    }
    setAliasInput('');
  }, [selectedProgram]);

  const handleAddAlias = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const tag = aliasInput.trim().replace(/,$/, '');
      if (tag && !aliasTags.includes(tag)) {
        const newTags = [...aliasTags, tag];
        setAliasTags(newTags);
        setFormData(prev => ({ ...prev, alias: newTags.join(', ') }));
      }
      setAliasInput('');
    }
  };

  const removeAlias = (tagToRemove: string) => {
    const newTags = aliasTags.filter(tag => tag !== tagToRemove);
    setAliasTags(newTags);
    setFormData(prev => ({ ...prev, alias: newTags.join(', ') }));
  };

  const validateForm = () => {
    if (!formData.code.trim()) return "El código oficial es obligatorio.";
    if (!formData.name.trim()) return "El nombre oficial es obligatorio.";
    if (formData.durationBase === '' || formData.durationBase < 1) return "La duración base debe ser al menos 1 mes.";
    if (formData.warranty === '' || formData.warranty < 0) return "La garantía no puede ser negativa.";
    if (!formData.allBranches && formData.enabledBranches.length === 0) return "Debe seleccionar al menos una sede.";

    // Unique checks
    const isCodeDuplicate = programs.some(p => p.code.toLowerCase() === formData.code.toLowerCase() && p.id !== selectedProgram?.id);
    if (isCodeDuplicate) return "El código oficial ya está en uso.";

    const isNameDuplicate = programs.some(p => p.name.toLowerCase() === formData.name.toLowerCase() && p.status === 'Activo' && p.id !== selectedProgram?.id);
    if (isNameDuplicate) return "El nombre oficial ya existe en el catálogo activo.";

    return null;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) return;

    const error = validateForm();
    if (error) {
      setFormError(error);
      return;
    }

    const finalData = {
      ...formData,
      durationBase: Number(formData.durationBase),
      warranty: Number(formData.warranty)
    };

    if (selectedProgram) {
      updateProgram(selectedProgram.id, finalData);
    } else {
      addProgram(finalData);
    }
    setIsFormOpen(false);
  };

  const handleOpenForm = (program?: Program, readOnly = false) => {
    setSelectedProgram(program || null);
    setIsReadOnly(readOnly);
    setIsFormOpen(true);
  };

  const handleDuplicate = (program: Program) => {
    const { id, ...rest } = program;
    addProgram({
      ...rest,
      name: `${rest.name} (Copia)`,
      code: `${rest.code}-COPY`
    });
  };

  const filteredPrograms = programs.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.code.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter ? p.status === statusFilter : true;
    return matchesSearch && matchesStatus;
  });

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = useTablePagination();

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter]);

  const totalPages = Math.ceil(filteredPrograms.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedPrograms = filteredPrograms.slice(startIndex, endIndex);

  const toggleBranch = (branchId: string) => {
    setFormData(prev => {
      const newEnabled = prev.enabledBranches.includes(branchId)
        ? prev.enabledBranches.filter(id => id !== branchId)
        : [...prev.enabledBranches, branchId];
      return {
        ...prev,
        enabledBranches: newEnabled,
        allBranches: newEnabled.length === branches.length
      };
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-text-primary mb-1">Programas</h2>
          <p className="text-sm text-text-secondary">Gestión de la oferta académica base del sistema</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="primary" className="flex items-center gap-2" onClick={() => handleOpenForm()}>
            <Plus size={16} />
            Nuevo Programa
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
                <th className="px-6 py-3 font-medium">Programa</th>
                <th className="px-6 py-3 font-medium">Estructura</th>
                <th className="px-6 py-3 font-medium">Duración Base</th>
                <th className="px-6 py-3 font-medium">Sedes</th>
                <th className="px-6 py-3 font-medium">Estado</th>
                <th className="px-6 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-soft">
              {paginatedPrograms.map((row) => (
                <tr key={row.id} className="hover:bg-surface-muted/50 transition-colors even:bg-surface-muted/30">
                  <td className="px-6 py-3 font-mono text-text-secondary">{row.code}</td>
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-primary-accent/10 text-primary-accent flex items-center justify-center">
                        <BookOpen size={16} />
                      </div>
                      <span className="font-medium text-text-primary">{row.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-3 text-text-secondary">
                    <div className="flex items-center gap-1.5">
                      <Layers size={14} className="text-text-muted" />
                      {row.hasLevels ? 'Tiene niveles' : 'Paquete único'}
                    </div>
                  </td>
                  <td className="px-6 py-3 text-text-secondary">{row.durationBase} meses</td>
                  <td className="px-6 py-3 text-text-secondary">
                    {row.allBranches ? 'Todas' : row.enabledBranches?.length ? `${row.enabledBranches.length} sedes` : 'Ninguna'}
                  </td>
                  <td className="px-6 py-3">
                    <Badge variant={row.status === 'Activo' ? 'success' : 'neutral'}>{row.status}</Badge>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <ActionMenu 
                      items={[
                        { label: 'Ver detalles', onClick: () => handleOpenForm(row, true) },
                        { label: 'Editar programa', onClick: () => handleOpenForm(row) },
                        { 
                          label: 'Duplicar', 
                          onClick: () => openConfirm({
                            title: 'Duplicar Programa',
                            description: `¿Está seguro de que desea duplicar el programa "${row.name}"?`,
                            onConfirm: () => handleDuplicate(row),
                            variant: 'primary'
                          }) 
                        },
                        { 
                          label: row.status === 'Activo' ? 'Desactivar' : 'Activar', 
                          onClick: () => openConfirm({
                            title: row.status === 'Activo' ? 'Desactivar Programa' : 'Activar Programa',
                            description: `¿Está seguro de que desea ${row.status === 'Activo' ? 'desactivar' : 'activar'} el programa "${row.name}"?`,
                            onConfirm: () => updateProgram(row.id, { status: row.status === 'Activo' ? 'Inactivo' : 'Activo' }),
                            variant: row.status === 'Activo' ? 'warning' : 'primary'
                          }),
                          danger: row.status === 'Activo' 
                        },
                        { 
                          label: 'Eliminar', 
                          onClick: () => openConfirm({
                            title: 'Eliminar Programa',
                            description: `¿Está seguro de que desea eliminar el programa "${row.name}"? Esta acción no se puede deshacer.`,
                            onConfirm: () => deleteProgram(row.id),
                            variant: 'danger'
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
              Mostrando {startIndex + 1} a {Math.min(endIndex, filteredPrograms.length)} de {filteredPrograms.length} programas
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
        title={isReadOnly ? "Detalles del Programa" : selectedProgram ? "Editar Programa" : "Crear Nuevo Programa"}
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
              <Button variant="primary" onClick={handleSubmit}>Guardar Programa</Button>
            )}
          </div>
        }
      >
        <form onSubmit={handleSubmit} className="pb-4">
          {formError && (
             <div className="bg-danger-tint/50 border border-danger-text/20 rounded-xl p-3 flex gap-2 text-sm text-danger-text animate-in fade-in slide-in-from-top-1 mb-6">
               <AlertCircle size={16} className="shrink-0 mt-0.5" />
               <p>{formError}</p>
             </div>
          )}
          <fieldset disabled={isReadOnly} className="grid grid-cols-1 lg:grid-cols-2 gap-x-12 gap-y-10">
            {/* Columna Izquierda */}
            <div className="space-y-10">
              {/* Bloque 1: Identidad */}
              <section className="space-y-6">
                <div className="flex items-center gap-2 pb-2 border-b border-border-soft">
                  <div className="w-1 h-4 bg-primary-accent rounded-full" />
                  <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider">Identidad</h3>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">Código Oficial <span className="text-error">*</span></label>
                    <input 
                      type="text" 
                      required
                      value={formData.code}
                      onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value }))}
                      className="w-full h-10 bg-surface border border-border-soft rounded-lg px-3 text-sm focus:outline-none focus:border-primary-accent font-mono uppercase transition-all focus:ring-2 focus:ring-primary-accent/10" 
                      placeholder="Ej. PRG-KIDS" 
                    />
                    <p className="text-[10px] text-text-muted">Identificador único en el catálogo.</p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">Nombre Oficial <span className="text-error">*</span></label>
                    <input 
                      type="text" 
                      required
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full h-10 bg-surface border border-border-soft rounded-lg px-3 text-sm focus:outline-none focus:border-primary-accent transition-all focus:ring-2 focus:ring-primary-accent/10" 
                      placeholder="Ej. Programa Kids" 
                    />
                    <p className="text-[10px] text-text-muted">Nombre comercial y académico.</p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">Alias / Nombres heredados</label>
                  <div className="min-h-[42px] p-1.5 bg-surface border border-border-soft rounded-lg focus-within:border-primary-accent focus-within:ring-2 focus-within:ring-primary-accent/10 transition-all flex flex-wrap gap-1.5 items-center">
                    {aliasTags.map(tag => (
                      <div key={tag}>
                        <Badge variant="primary" className="pl-2 pr-1 py-0.5 flex items-center gap-1 text-[11px]">
                          {tag}
                          {!isReadOnly && (
                            <button 
                              type="button" 
                              onClick={() => removeAlias(tag)}
                              className="hover:bg-white/20 rounded-full p-0.5 transition-colors"
                            >
                              <Plus size={12} className="rotate-45" />
                            </button>
                          )}
                        </Badge>
                      </div>
                    ))}
                    {!isReadOnly && (
                      <input 
                        type="text"
                        value={aliasInput}
                        onChange={(e) => setAliasInput(e.target.value)}
                        onKeyDown={handleAddAlias}
                        placeholder={aliasTags.length === 0 ? "Presiona Enter o Coma para añadir..." : ""}
                        className="flex-1 min-w-[120px] bg-transparent border-none focus:ring-0 text-sm h-7"
                      />
                    )}
                  </div>
                  <p className="text-[10px] text-text-muted">Útil para búsquedas e importaciones de sistemas anteriores.</p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">Descripción</label>
                  <textarea 
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    className="w-full bg-surface border border-border-soft rounded-lg p-3 text-sm focus:outline-none focus:border-primary-accent resize-none h-20 transition-all focus:ring-2 focus:ring-primary-accent/10" 
                    placeholder="Resumen pedagógico o comercial del programa..."
                  ></textarea>
                </div>
              </section>

              {/* Bloque 4: Interno */}
              <section className="space-y-6">
                <div className="flex items-center gap-2 pb-2 border-b border-border-soft">
                  <div className="w-1 h-4 bg-primary-accent rounded-full" />
                  <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider">Interno</h3>
                </div>
                
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">Observaciones</label>
                  <textarea 
                    value={formData.observations}
                    onChange={(e) => setFormData(prev => ({ ...prev, observations: e.target.value }))}
                    className="w-full bg-surface border border-border-soft rounded-lg p-3 text-sm focus:outline-none focus:border-primary-accent resize-none h-24 transition-all focus:ring-2 focus:ring-primary-accent/10" 
                    placeholder="Notas internas, restricciones operativas o detalles adicionales..."
                  ></textarea>
                  <p className="text-[10px] text-text-muted">Esta información no será visible para los clientes.</p>
                </div>
              </section>
            </div>

            {/* Columna Derecha */}
            <div className="space-y-10">
              {/* Bloque 2: Estructura */}
              <section className="space-y-6">
                <div className="flex items-center gap-2 pb-2 border-b border-border-soft">
                  <div className="w-1 h-4 bg-primary-accent rounded-full" />
                  <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider">Estructura</h3>
                </div>
                
                <div className="p-5 bg-surface-muted/30 border border-border-soft rounded-xl space-y-5">
                  <div className="flex items-center justify-between cursor-pointer group">
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium text-text-primary group-hover:text-primary-accent transition-colors">Tiene niveles</p>
                      <p className="text-xs text-text-secondary">Define si el programa se divide en etapas correlativas.</p>
                    </div>
                    <label className="switch">
                      <input 
                        type="checkbox" 
                        checked={formData.hasLevels}
                        onChange={(e) => setFormData(prev => ({ ...prev, hasLevels: e.target.checked }))}
                      />
                      <span className="slider"></span>
                    </label>
                  </div>

                  {!formData.hasLevels && (
                    <div className="p-3 bg-primary-accent/5 border border-primary-accent/10 rounded-lg flex gap-3 items-start">
                      <div className="mt-0.5 text-primary-accent">
                        <Layers size={14} />
                      </div>
                      <p className="text-xs text-primary-accent/80 leading-relaxed">
                        Al desactivar niveles, el sistema gestionará este programa como un <span className="font-semibold">"Paquete único"</span> o <span className="font-semibold">"Nivel único"</span> de forma automática.
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">Duración base <span className="text-error">*</span></label>
                      <div className="relative">
                        <input 
                          type="number" 
                          min="1" 
                          required
                          value={formData.durationBase}
                          onChange={(e) => setFormData(prev => ({ ...prev, durationBase: e.target.value === '' ? '' : parseInt(e.target.value) }))}
                          className="w-full h-10 bg-surface border border-border-soft rounded-lg pl-3 pr-14 text-sm focus:outline-none focus:border-primary-accent transition-all focus:ring-2 focus:ring-primary-accent/10" 
                          placeholder="Ej. 6" 
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted text-[11px] font-medium uppercase">meses</span>
                      </div>
                      <p className="text-[10px] text-text-muted">Tiempo estándar de cursado.</p>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">Garantía <span className="text-error">*</span></label>
                      <div className="relative">
                        <input 
                          type="number" 
                          min="0" 
                          required
                          value={formData.warranty}
                          onChange={(e) => setFormData(prev => ({ ...prev, warranty: e.target.value === '' ? '' : parseInt(e.target.value) }))}
                          className="w-full h-10 bg-surface border border-border-soft rounded-lg pl-3 pr-14 text-sm focus:outline-none focus:border-primary-accent transition-all focus:ring-2 focus:ring-primary-accent/10" 
                          placeholder="Ej. 1" 
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted text-[11px] font-medium uppercase">meses</span>
                      </div>
                      <p className="text-[10px] text-text-muted">Periodo de cobertura adicional.</p>
                    </div>
                  </div>
                </div>
              </section>

              {/* Bloque 3: Disponibilidad */}
              <section className="space-y-6">
                <div className="flex items-center gap-2 pb-2 border-b border-border-soft">
                  <div className="w-1 h-4 bg-primary-accent rounded-full" />
                  <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider">Disponibilidad</h3>
                </div>
                
                <div className="space-y-5">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">Sedes Habilitadas <span className="text-error">*</span></label>
                      {!isReadOnly && (
                        <div className="flex items-center gap-2 cursor-pointer group">
                          <span className="text-xs font-medium text-text-secondary group-hover:text-text-primary transition-colors">Seleccionar todas</span>
                          <label className="switch">
                            <input 
                              type="checkbox" 
                              checked={formData.enabledBranches.length === branches.length}
                              onChange={(e) => {
                                const isChecked = e.target.checked;
                                setFormData(prev => ({ 
                                  ...prev, 
                                  allBranches: isChecked,
                                  enabledBranches: isChecked ? branches.map(b => b.id) : [] 
                                }));
                              }}
                            />
                            <span className="slider"></span>
                          </label>
                        </div>
                      )}
                    </div>
                    
                    <div className="p-4 border border-border-soft rounded-xl bg-surface-muted/20 space-y-4">
                      {/* Selected Tags */}
                      <div className="flex flex-wrap gap-2 min-h-[32px]">
                        <AnimatePresence mode="popLayout">
                          {formData.enabledBranches.map(branchId => {
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
                        {formData.enabledBranches.length === 0 && (
                          <span className="text-sm text-text-muted italic py-1.5">Ninguna sede seleccionada</span>
                        )}
                      </div>

                      {/* Available Branches to Add */}
                      {!isReadOnly && formData.enabledBranches.length < branches.length && (
                        <div className="pt-3 border-t border-border-soft/50">
                          <p className="text-[10px] text-text-muted uppercase tracking-wider mb-2 font-medium">Sedes Disponibles</p>
                          <div className="flex flex-wrap gap-2">
                            <AnimatePresence mode="popLayout">
                              {branches.filter(b => !formData.enabledBranches.includes(b.id)).map(branch => (
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
                    
                    {formData.enabledBranches.length === 0 && (
                      <p className="text-[10px] text-error font-medium">Debe seleccionar al menos una sede para continuar.</p>
                    )}
                  </div>

                  <div className="space-y-2 pt-2">
                    <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">Estado del Programa <span className="text-error">*</span></label>
                    <div className="flex gap-4">
                      {['Activo', 'Inactivo'].map((status) => (
                        <label key={status} className="flex-1 flex items-center justify-center gap-2 p-3 border border-border-soft rounded-xl cursor-pointer hover:bg-surface-muted/30 transition-all has-[:checked]:border-primary-accent has-[:checked]:bg-primary-accent/5">
                          <input 
                            type="radio" 
                            name="status"
                            value={status}
                            checked={formData.status === status}
                            onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value as 'Activo' | 'Inactivo' }))}
                            className="w-4 h-4 text-primary-accent border-border-strong focus:ring-primary-accent"
                          />
                          <span className={`text-sm font-medium ${formData.status === status ? 'text-primary-accent' : 'text-text-secondary'}`}>{status}</span>
                        </label>
                      ))}
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
      />
    </div>
  );
}
