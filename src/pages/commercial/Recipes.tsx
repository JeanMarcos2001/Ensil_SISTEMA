import React, { useState, useEffect } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { ActionMenu } from '../../components/ui/ActionMenu';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Search, Plus, ClipboardList, Calendar, Trash2, AlertCircle } from 'lucide-react';
import { useTablePagination } from '../../hooks/useTablePagination';
import { useData, Recipe, RecipeItem } from '../../context/DataContext';
import { getRecipeSelectableItems } from '../../utils/inventory';
import { DateInput } from '../../components/ui/DateInput';

export function Recipes() {
  const { recipes, setRecipes, programs, levels, branches, items } = useData();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [programFilter, setProgramFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Form State
  const [formData, setFormData] = useState<Partial<Recipe>>({
    name: '',
    programId: '',
    levelId: '',
    branchIds: [],
    applyToAllBranches: true,
    status: 'Activo',
    items: [],
    startDate: new Date().toISOString().split('T')[0],
    endDate: ''
  });

  const [formErrors, setFormErrors] = useState<string[]>([]);

  const filteredRecipes = recipes.filter(r => {
    const program = programs.find(p => p.id === r.programId);
    const matchesSearch = r.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesProgram = programFilter ? r.programId === programFilter : true;
    const matchesBranch = branchFilter 
      ? (r.applyToAllBranches || r.branchIds.includes(branchFilter)) 
      : true;
    const matchesStatus = statusFilter ? r.status === statusFilter : true;
    return matchesSearch && matchesProgram && matchesBranch && matchesStatus;
  });

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = useTablePagination();

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, programFilter, branchFilter, statusFilter]);

  const totalPages = Math.ceil(filteredRecipes.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedRecipes = filteredRecipes.slice(startIndex, endIndex);

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

  const handleOpenForm = (recipe?: Recipe) => {
    if (recipe) {
      setSelectedRecipe(recipe);
      setFormData({ ...recipe });
    } else {
      setSelectedRecipe(null);
      setFormData({
        name: '',
        programId: '',
        levelId: '',
        branchIds: [],
        applyToAllBranches: true,
        status: 'Activo',
        items: [],
        startDate: new Date().toISOString().split('T')[0],
        endDate: ''
      });
    }
    setFormErrors([]);
    setIsFormOpen(true);
  };

  const validateOverlap = (data: Partial<Recipe>) => {
    const errors: string[] = [];
    
    // Check for overlaps with other active recipes
    const overlapping = recipes.find(r => {
      if (r.id === selectedRecipe?.id) return false;
      if (r.status !== 'Activo' || data.status !== 'Activo') return false;
      if (r.programId !== data.programId) return false;
      
      // Check level overlap: 
      // - If both are 'All Levels' (empty) -> Overlap
      // - If one is 'All Levels' and the other is specific -> Overlap
      // - If both are specific and same -> Overlap
      const levelOverlap = !r.levelId || !data.levelId || r.levelId === data.levelId;
      if (!levelOverlap) return false;

      // Check branches
      const branchOverlap = data.applyToAllBranches || r.applyToAllBranches || 
        data.branchIds?.some(id => r.branchIds.includes(id));

      if (!branchOverlap) return false;

      // Check dates
      const startA = new Date(r.startDate).getTime();
      const endA = r.endDate ? new Date(r.endDate).getTime() : Infinity;
      const startB = new Date(data.startDate!).getTime();
      const endB = data.endDate ? new Date(data.endDate).getTime() : Infinity;

      return (startB <= endA && endB >= startA);
    });

    if (overlapping) {
      errors.push(`Ya existe una receta activa ("${overlapping.name}") que se solapa en programa, nivel, sede y período.`);
    }

    return errors;
  };

  const handleSaveRecipe = () => {
    const errors: string[] = [];
    if (!formData.name) errors.push('El nombre es obligatorio.');
    if (!formData.programId) errors.push('El programa es obligatorio.');
    if (formData.items?.length === 0) errors.push('Debe agregar al menos un artículo.');
    const recipeItems = formData.items ?? [];
    if (recipeItems.some(ri => !ri.itemId)) errors.push('Seleccione el artículo en todas las filas.');
    if (new Set(recipeItems.map(ri => ri.itemId)).size !== recipeItems.length) errors.push('Hay artículos repetidos en la receta.');
    if (recipeItems.some(ri => !(ri.quantity >= 1))) errors.push('Las cantidades deben ser mayores a 0.');
    const previousIds = selectedRecipe?.items.map(ri => ri.itemId) ?? [];
    const invalid = recipeItems.filter(ri => ri.itemId && !getRecipeSelectableItems(items, previousIds).some(i => i.id === ri.itemId));
    if (invalid.length > 0) errors.push('Hay artículos inactivos o no habilitados para matrícula en la receta.');
    if (!formData.startDate) errors.push('La fecha de inicio es obligatoria.');

    const overlapErrors = validateOverlap(formData);
    const allErrors = [...errors, ...overlapErrors];

    if (allErrors.length > 0) {
      setFormErrors(allErrors);
      return;
    }

    if (selectedRecipe) {
      setRecipes(recipes.map(r => r.id === selectedRecipe.id ? { ...formData as Recipe } : r));
    } else {
      const newRecipe: Recipe = {
        ...formData as Recipe,
        id: `REC-${Date.now()}`
      };
      setRecipes([newRecipe, ...recipes]);
    }
    setIsFormOpen(false);
  };

  const addItem = () => {
    setFormData({
      ...formData,
      items: [...(formData.items || []), { itemId: '', quantity: 1 }]
    });
  };

  const updateItem = (index: number, field: keyof RecipeItem, value: any) => {
    const newItems = [...(formData.items || [])];
    newItems[index] = { ...newItems[index], [field]: value };
    setFormData({ ...formData, items: newItems });
  };

  const removeItem = (index: number) => {
    setFormData({
      ...formData,
      items: formData.items?.filter((_, i) => i !== index)
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-text-primary mb-1">Recetas de materiales</h2>
          <p className="text-sm text-text-secondary">Reglas de entrega de artículos por matrícula</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="primary" className="flex items-center gap-2" onClick={() => handleOpenForm()}>
            <Plus size={16} />
            Nueva Receta
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
                {programs.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <select 
                value={branchFilter}
                onChange={(e) => setBranchFilter(e.target.value)}
                className="h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent min-w-[140px]"
              >
                <option value="">Sede</option>
                {branches.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
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
                <th className="px-6 py-3 font-medium">Nombre</th>
                <th className="px-6 py-3 font-medium">Programa / Nivel</th>
                <th className="px-6 py-3 font-medium">Sede</th>
                <th className="px-6 py-3 font-medium">Items</th>
                <th className="px-6 py-3 font-medium">Vigencia</th>
                <th className="px-6 py-3 font-medium">Estado</th>
                <th className="px-6 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-soft">
              {paginatedRecipes.map((row) => {
                const program = programs.find(p => p.id === row.programId);
                const level = levels.find(l => l.id === row.levelId);
                return (
                  <tr key={row.id} className="hover:bg-surface-muted/50 transition-colors even:bg-surface-muted/30">
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary-accent/10 text-primary-accent flex items-center justify-center">
                          <ClipboardList size={16} />
                        </div>
                        <span className="font-medium text-text-primary">{row.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex flex-col">
                        <span className="text-text-primary font-medium">{program?.name || 'N/A'}</span>
                        <span className="text-xs text-text-secondary">{level?.name || 'Todos los niveles'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      {row.applyToAllBranches ? (
                        <Badge variant="primary">Todas las sedes</Badge>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {row.branchIds.map(bid => {
                            const branch = branches.find(b => b.id === bid);
                            return <span key={bid}><Badge variant="neutral">{branch?.name || bid}</Badge></span>;
                          })}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-3 text-text-secondary">{row.items.length} artículos</td>
                    <td className="px-6 py-3 text-text-secondary">
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1.5">
                          <Calendar size={12} className="text-text-muted" />
                          <span className="text-xs">Desde: {row.startDate}</span>
                        </div>
                        {row.endDate && (
                          <div className="flex items-center gap-1.5">
                            <Calendar size={12} className="text-text-muted" />
                            <span className="text-xs">Hasta: {row.endDate}</span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      <Badge variant={row.status === 'Activo' ? 'success' : 'neutral'}>{row.status}</Badge>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <ActionMenu 
                        items={[
                          { label: 'Editar receta', onClick: () => handleOpenForm(row) },
                          { 
                            label: 'Duplicar', 
                            onClick: () => openConfirm({
                              title: 'Duplicar Receta',
                              description: `¿Está seguro de que desea duplicar la receta "${row.name}"?`,
                              onConfirm: () => {
                                const newRecipe = {
                                  ...row,
                                  id: `REC-${Date.now()}`,
                                  name: `${row.name} (Copia)`
                                };
                                setRecipes([newRecipe, ...recipes]);
                              },
                              variant: 'primary',
                              confirmLabel: 'SÍ, DUPLICAR'
                            }) 
                          },
                          { 
                            label: row.status === 'Activo' ? 'Desactivar' : 'Activar', 
                            onClick: () => openConfirm({
                              title: row.status === 'Activo' ? 'Desactivar Receta' : 'Activar Receta',
                              description: `¿Está seguro de que desea ${row.status === 'Activo' ? 'desactivar' : 'activar'} la receta "${row.name}"?`,
                              onConfirm: () => {
                                setRecipes(recipes.map(r => r.id === row.id ? { ...r, status: r.status === 'Activo' ? 'Inactivo' : 'Activo' } : r));
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
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-border-soft flex items-center justify-between bg-surface">
            <span className="text-sm text-text-secondary">
              Mostrando {startIndex + 1} a {Math.min(endIndex, filteredRecipes.length)} de {filteredRecipes.length} recetas
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
        title={selectedRecipe ? "Editar Receta" : "Crear Nueva Receta"}
        size="lg"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setIsFormOpen(false)}>Cancelar</Button>
            <Button variant="primary" onClick={handleSaveRecipe}>Guardar Receta</Button>
          </div>
        }
      >
        <div className="space-y-8">
          {formErrors.length > 0 && (
            <div className="p-4 bg-error/10 border border-error/20 rounded-xl flex gap-3">
              <AlertCircle className="text-error shrink-0" size={20} />
              <div className="space-y-1">
                <p className="text-sm font-medium text-error">No se pudo guardar la receta:</p>
                <ul className="text-xs text-error/80 list-disc list-inside">
                  {formErrors.map((err, i) => <li key={i}>{err}</li>)}
                </ul>
              </div>
            </div>
          )}

          {/* General Info */}
          <section>
            <h3 className="text-base font-semibold text-text-primary mb-4">Información General</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5 col-span-2">
                <label className="text-sm font-medium text-text-primary">Nombre de la Receta <span className="text-error">*</span></label>
                <input 
                  type="text" 
                  className="w-full h-10 bg-surface border border-border-soft rounded-lg px-3 text-sm focus:outline-none focus:border-primary-accent" 
                  placeholder="Ej. Pack Kids Nivel 1 2024" 
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text-primary">Programa <span className="text-error">*</span></label>
                <select 
                  className="w-full h-10 bg-surface border border-border-soft rounded-lg px-3 text-sm focus:outline-none focus:border-primary-accent"
                  value={formData.programId}
                  onChange={(e) => setFormData({ ...formData, programId: e.target.value, levelId: '' })}
                >
                  <option value="">Seleccionar...</option>
                  {programs.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text-primary">Nivel</label>
                <select 
                  className="w-full h-10 bg-surface border border-border-soft rounded-lg px-3 text-sm focus:outline-none focus:border-primary-accent"
                  value={formData.levelId}
                  onChange={(e) => setFormData({ ...formData, levelId: e.target.value })}
                  disabled={!formData.programId}
                >
                  <option value="">Todos los niveles</option>
                  {levels.filter(l => l.programId === formData.programId).map(l => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
                <p className="text-xs text-text-muted">Opcional si aplica a todo el programa</p>
              </div>
              <div className="space-y-1.5 col-span-2">
                <label className="text-sm font-medium text-text-primary">Sedes <span className="text-error">*</span></label>
                <div className="space-y-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={formData.applyToAllBranches}
                      onChange={(e) => setFormData({ ...formData, applyToAllBranches: e.target.checked, branchIds: [] })}
                      className="w-4 h-4 rounded border-border-soft text-primary-accent focus:ring-primary-accent"
                    />
                    <span className="text-sm text-text-secondary">Aplicar a todas las sedes</span>
                  </label>
                  
                  {!formData.applyToAllBranches && (
                    <div className="grid grid-cols-2 gap-2 p-3 bg-surface-muted/30 rounded-xl border border-border-soft">
                      {branches.map(b => (
                        <label key={b.id} className="flex items-center gap-2 cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={formData.branchIds?.includes(b.id)}
                            onChange={(e) => {
                              const newIds = e.target.checked 
                                ? [...(formData.branchIds || []), b.id]
                                : (formData.branchIds || []).filter(id => id !== b.id);
                              setFormData({ ...formData, branchIds: newIds });
                            }}
                            className="w-4 h-4 rounded border-border-soft text-primary-accent focus:ring-primary-accent"
                          />
                          <span className="text-sm text-text-secondary">{b.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text-primary">Estado <span className="text-error">*</span></label>
                <select 
                  className="w-full h-10 bg-surface border border-border-soft rounded-lg px-3 text-sm focus:outline-none focus:border-primary-accent"
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                >
                  <option value="Activo">Activo</option>
                  <option value="Inactivo">Inactivo</option>
                </select>
              </div>
            </div>
          </section>

          <hr className="border-border-soft" />

          {/* Items List */}
          <section>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-base font-semibold text-text-primary">Lista de Artículos</h3>
              <Button variant="outline" size="sm" className="flex items-center gap-2" onClick={addItem}>
                <Plus size={14} />
                Agregar Artículo
              </Button>
            </div>
            <div className="border border-border-soft rounded-xl overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-text-secondary uppercase bg-surface-muted/50">
                  <tr>
                    <th className="px-4 py-3 font-medium">Artículo (Físico o Paquete)</th>
                    <th className="px-4 py-3 font-medium w-32">Cantidad</th>
                    <th className="px-4 py-3 font-medium w-16 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-soft">
                  {formData.items?.map((item, index) => (
                    <tr key={index} className="bg-surface">
                      <td className="px-4 py-3">
                        <select 
                          className="w-full h-8 bg-surface border border-border-soft rounded px-2 text-sm focus:outline-none focus:border-primary-accent"
                          value={item.itemId}
                          onChange={(e) => updateItem(index, 'itemId', e.target.value)}
                        >
                          <option value="">Seleccionar artículo...</option>
                          {getRecipeSelectableItems(items, [item.itemId, ...(selectedRecipe?.items.map(ri => ri.itemId) ?? [])]).map(i => (
                            <option key={i.id} value={i.id}>
                              {i.name} ({i.isPackage ? 'Paquete' : 'Individual'})
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <input 
                          type="number" 
                          min="1" 
                          className="w-full h-8 bg-surface border border-border-soft rounded px-2 text-sm focus:outline-none focus:border-primary-accent" 
                          value={item.quantity}
                          onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value))}
                        />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button 
                          className="text-text-muted hover:text-error transition-colors p-1"
                          onClick={() => removeItem(index)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(!formData.items || formData.items.length === 0) && (
                <div className="p-8 text-center bg-surface">
                  <p className="text-sm text-text-muted italic">No hay artículos agregados a esta receta.</p>
                </div>
              )}
            </div>
          </section>

          <hr className="border-border-soft" />

          {/* Validity */}
          <section>
            <h3 className="text-base font-semibold text-text-primary mb-4">Vigencia</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text-primary">Fecha Inicio <span className="text-error">*</span></label>
                <DateInput 
                  
                  className="w-full h-10 bg-surface border border-border-soft rounded-lg px-3 text-sm focus:outline-none focus:border-primary-accent" 
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text-primary">Fecha Fin</label>
                <DateInput 
                  
                  className="w-full h-10 bg-surface border border-border-soft rounded-lg px-3 text-sm focus:outline-none focus:border-primary-accent" 
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                />
                <p className="text-xs text-text-muted">Dejar en blanco para vigencia indefinida</p>
              </div>
            </div>
          </section>

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
