import React, { useState, useEffect } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { ActionMenu } from '../../components/ui/ActionMenu';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { useTablePagination } from '../../hooks/useTablePagination';
import { useData, Level } from '../../context/DataContext';
import { Search, Plus, Layers, BookOpen, AlertCircle } from 'lucide-react';

export function Levels() {
  const { levels, programs, addLevel, updateLevel, deleteLevel } = useData();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [selectedLevel, setSelectedLevel] = useState<Level | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [programFilter, setProgramFilter] = useState('');
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
    programId: '',
    code: '',
    name: '',
    order: 1,
    status: 'Activo' as 'Activo' | 'Inactivo',
    description: ''
  });

  useEffect(() => {
    if (selectedLevel) {
      setFormData({
        programId: selectedLevel.programId,
        code: selectedLevel.code,
        name: selectedLevel.name,
        order: selectedLevel.order,
        status: selectedLevel.status,
        description: selectedLevel.description || ''
      });
    } else {
      setFormData({
        programId: '',
        code: '',
        name: '',
        order: levels.length + 1,
        status: 'Activo',
        description: ''
      });
    }
  }, [selectedLevel, levels.length]);

  const handleOpenForm = (level?: Level, readOnly = false) => {
    setFormError(null);
    setSelectedLevel(level || null);
    setIsReadOnly(readOnly);
    setIsFormOpen(true);
  };

  const handleDuplicate = (level: Level) => {
    const { id, ...rest } = level;
    addLevel({
      ...rest,
      name: `${rest.name} (Copia)`,
      code: `${rest.code}-COPY`
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) return;
    setFormError(null);

    if (!formData.programId) {
      setFormError("Debe seleccionar un programa padre.");
      return;
    }
    const parentProgram = programs.find(p => p.id === formData.programId);
    if (!parentProgram) {
      setFormError("El programa seleccionado no existe.");
      return;
    }
    if (!parentProgram.hasLevels) {
      setFormError(`El programa "${parentProgram.name}" no está habilitado para gestionar niveles. Solo se permiten programas configurados con 'Tiene niveles' en la sección Programas.`);
      return;
    }
    if (!formData.name.trim()) {
      setFormError("El nombre del nivel es obligatorio.");
      return;
    }
    if (!formData.code.trim()) {
      setFormError("El código del nivel es obligatorio.");
      return;
    }

    if (selectedLevel) {
      updateLevel(selectedLevel.id, formData);
    } else {
      addLevel(formData);
    }
    setIsFormOpen(false);
  };

  const filteredLevels = levels.filter(l => {
    const matchesSearch = l.name.toLowerCase().includes(searchTerm.toLowerCase()) || l.code.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesProgram = programFilter ? l.programId === programFilter : true;
    const matchesStatus = statusFilter ? l.status === statusFilter : true;
    return matchesSearch && matchesProgram && matchesStatus;
  });

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = useTablePagination();

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, programFilter, statusFilter]);

  const totalPages = Math.ceil(filteredLevels.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedLevels = filteredLevels.slice(startIndex, endIndex);

  const getProgramName = (programId: string) => {
    const program = programs.find(p => p.id === programId);
    return program ? program.name : 'Desconocido';
  };

  const getProgramDuration = (programId: string) => {
    const program = programs.find(p => p.id === programId);
    return program ? `${program.durationBase} meses` : '-';
  };

  // Solo programas que se crearon habilitados con niveles (hasLevels === true)
  const eligiblePrograms = programs.filter(p => p.hasLevels || (selectedLevel && p.id === selectedLevel.programId));

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-text-primary mb-1">Niveles</h2>
          <p className="text-sm text-text-secondary">Estructura interna por programa</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="primary" className="flex items-center gap-2" onClick={() => handleOpenForm()}>
            <Plus size={16} />
            Nuevo Nivel
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
                value={programFilter}
                onChange={(e) => setProgramFilter(e.target.value)}
                className="h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent min-w-[140px]"
              >
                <option value="">Programa</option>
                {programs.filter(p => p.hasLevels).map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
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
                <th className="px-6 py-3 font-medium">Programa</th>
                <th className="px-6 py-3 font-medium">Código</th>
                <th className="px-6 py-3 font-medium">Nivel</th>
                <th className="px-6 py-3 font-medium">Orden</th>
                <th className="px-6 py-3 font-medium">Duración (Prog.)</th>
                <th className="px-6 py-3 font-medium">Estado</th>
                <th className="px-6 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-soft">
              {paginatedLevels.map((row) => (
                <tr key={row.id} className="hover:bg-surface-muted/50 transition-colors even:bg-surface-muted/30">
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-2">
                      <BookOpen size={14} className="text-text-muted" />
                      <span className="font-medium text-text-primary">{getProgramName(row.programId)}</span>
                    </div>
                  </td>
                  <td className="px-6 py-3 font-mono text-text-secondary">{row.code}</td>
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-primary-accent/10 text-primary-accent flex items-center justify-center">
                        <Layers size={16} />
                      </div>
                      <span className="font-medium text-text-primary">{row.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-3 text-text-secondary">{row.order}</td>
                  <td className="px-6 py-3 text-text-secondary">{getProgramDuration(row.programId)}</td>
                  <td className="px-6 py-3">
                    <Badge variant={row.status === 'Activo' ? 'success' : 'neutral'}>{row.status}</Badge>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <ActionMenu 
                      items={[
                        { label: 'Ver detalles', onClick: () => handleOpenForm(row, true) },
                        { label: 'Editar nivel', onClick: () => handleOpenForm(row) },
                        { 
                          label: 'Duplicar', 
                          onClick: () => openConfirm({
                            title: 'Duplicar Nivel',
                            description: `¿Está seguro de que desea duplicar el nivel "${row.name}"?`,
                            onConfirm: () => handleDuplicate(row),
                            variant: 'primary',
                            confirmLabel: 'SÍ, DUPLICAR'
                          }) 
                        },
                        { 
                          label: row.status === 'Activo' ? 'Desactivar' : 'Activar', 
                          onClick: () => openConfirm({
                            title: row.status === 'Activo' ? 'Desactivar Nivel' : 'Activar Nivel',
                            description: `¿Está seguro de que desea ${row.status === 'Activo' ? 'desactivar' : 'activar'} el nivel "${row.name}"?`,
                            onConfirm: () => updateLevel(row.id, { status: row.status === 'Activo' ? 'Inactivo' : 'Activo' }),
                            variant: row.status === 'Activo' ? 'warning' : 'primary',
                            confirmLabel: row.status === 'Activo' ? 'SÍ, DESACTIVAR' : 'SÍ, ACTIVAR'
                          }),
                          danger: row.status === 'Activo' 
                        },
                        { 
                          label: 'Eliminar', 
                          onClick: () => openConfirm({
                            title: 'Eliminar Nivel',
                            description: `¿Está seguro de que desea eliminar el nivel "${row.name}"? Esta acción no se puede deshacer.`,
                            onConfirm: () => deleteLevel(row.id),
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
              Mostrando {startIndex + 1} a {Math.min(endIndex, filteredLevels.length)} de {filteredLevels.length} niveles
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
        title={isReadOnly ? "Detalles del Nivel" : selectedLevel ? "Editar Nivel" : "Crear Nuevo Nivel"}
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
              <Button variant="primary" onClick={handleSubmit}>Guardar Nivel</Button>
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
          <fieldset disabled={isReadOnly} className="grid grid-cols-1 lg:grid-cols-2 gap-x-12 gap-y-8">
            {/* Columna Izquierda */}
            <div className="space-y-6">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-text-primary">Programa Padre <span className="text-error">*</span></label>
                  <span className="text-[10px] font-medium text-primary-accent bg-primary-accent/10 px-2 py-0.5 rounded-full">
                    Habilitados con niveles
                  </span>
                </div>
                <select 
                  required
                  value={formData.programId}
                  onChange={(e) => setFormData(prev => ({ ...prev, programId: e.target.value }))}
                  className="w-full h-10 bg-surface border border-border-soft rounded-lg px-3 text-sm focus:outline-none focus:border-primary-accent"
                >
                  <option value="">Seleccionar programa...</option>
                  {eligiblePrograms.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                {formData.programId ? (
                  <p className="text-xs text-text-secondary mt-1">
                    Duración del programa: {getProgramDuration(formData.programId)}
                  </p>
                ) : (
                  <p className="text-[11px] text-text-muted mt-1">
                    Solo se muestran programas creados con la opción "Tiene niveles" activada en la sección Programas.
                  </p>
                )}
                {eligiblePrograms.length === 0 && (
                  <p className="text-xs text-error mt-1">
                    No existen programas habilitados para niveles. Vaya a Configuración &gt; Programas y active "Tiene niveles".
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text-primary">Código de Nivel <span className="text-error">*</span></label>
                <input 
                  type="text" 
                  required
                  value={formData.code}
                  onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value }))}
                  className="w-full h-10 bg-surface border border-border-soft rounded-lg px-3 text-sm focus:outline-none focus:border-primary-accent font-mono uppercase" 
                  placeholder="Ej. NVL-KIDS-1" 
                />
                <p className="text-xs text-text-muted">Único dentro del programa</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text-primary">Nombre del Nivel <span className="text-error">*</span></label>
                <input 
                  type="text" 
                  required
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full h-10 bg-surface border border-border-soft rounded-lg px-3 text-sm focus:outline-none focus:border-primary-accent" 
                  placeholder="Ej. Nivel 1" 
                />
              </div>
            </div>

            {/* Columna Derecha */}
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-text-primary">Orden <span className="text-error">*</span></label>
                  <input 
                    type="number" 
                    min="1" 
                    required
                    value={formData.order}
                    onChange={(e) => setFormData(prev => ({ ...prev, order: parseInt(e.target.value) || 1 }))}
                    className="w-full h-10 bg-surface border border-border-soft rounded-lg px-3 text-sm focus:outline-none focus:border-primary-accent" 
                    placeholder="1" 
                  />
                  <p className="text-xs text-text-muted">Secuencia de visualización</p>
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
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text-primary">Descripción</label>
                <textarea 
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full bg-surface border border-border-soft rounded-lg p-3 text-sm focus:outline-none focus:border-primary-accent resize-none h-32" 
                  placeholder="Detalle opcional..."
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
