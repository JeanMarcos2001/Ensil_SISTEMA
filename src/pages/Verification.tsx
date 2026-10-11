import React, { useState, useEffect } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { ActionMenu } from '../components/ui/ActionMenu';
import { Search, Filter, CheckCircle, Package, AlertCircle, ArrowRight } from 'lucide-react';
import { useTablePagination } from '../hooks/useTablePagination';
import { useData, Enrollment, Recipe } from '../context/DataContext';
import { availableStock, canDeliver } from '../utils/inventory';

export function Verification() {
  const { enrollments, recipes, items, programs, levels, branches, stockItems, updateStock, updateEnrollmentVerification } = useData();
  const [isVerifyOpen, setIsVerifyOpen] = useState(false);
  const [selectedEnrollment, setSelectedEnrollment] = useState<Enrollment | null>(null);
  const [activeRecipe, setActiveRecipe] = useState<Recipe | null>(null);
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  const [verificationStatus, setVerificationStatus] = useState<'Verificado Completo' | 'Verificado Incompleto'>('Verificado Completo');
  const [observation, setObservation] = useState('');
  const [verificationDate, setVerificationDate] = useState(new Date().toISOString().slice(0, 16));
  const [formError, setFormError] = useState<string | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = useTablePagination();

  const handleSaveVerification = () => {
    if (!selectedEnrollment || !activeRecipe) return;
    setFormError(null);

    const branchId = selectedEnrollment.branchId || '';
    const deliveredItemIds: string[] = [];
    const missing: string[] = [];

    // Cada artículo requerido solo se entrega si hay stock suficiente en la sede.
    // Un paquete sellado (sin desempaquetado) se entrega y descuenta como UNA unidad.
    activeRecipe.items.forEach(recipeItem => {
      const item = items.find(i => i.id === recipeItem.itemId);
      const wasAlreadyDelivered = selectedEnrollment.verifiedItems?.includes(recipeItem.itemId);

      if (wasAlreadyDelivered) {
        deliveredItemIds.push(recipeItem.itemId);
        return;
      }

      if (checkedItems[recipeItem.itemId]) {
        if (!canDeliver(stockItems, branchId, recipeItem.itemId, recipeItem.quantity)) {
          missing.push(item?.name || recipeItem.itemId);
          return;
        }
        deliveredItemIds.push(recipeItem.itemId);
        updateStock(
          branchId,
          recipeItem.itemId,
          -recipeItem.quantity,
          'Entrega por Verificación',
          `Entrega a alumno ${selectedEnrollment.student} (Matrícula: ${selectedEnrollment.id})`,
          selectedEnrollment.id
        );
      } else if (item?.isPackage && item.allowUnpacking && item.composition) {
        // Paquete que SÍ permite desempaquetado: se pueden entregar sus componentes por separado.
        item.composition.forEach(comp => {
          const needed = recipeItem.quantity * comp.quantity;
          if (selectedEnrollment.verifiedItems?.includes(comp.itemId)) {
            deliveredItemIds.push(comp.itemId);
          } else if (checkedItems[comp.itemId]) {
            if (!canDeliver(stockItems, branchId, comp.itemId, needed)) {
              missing.push(comp.name);
              return;
            }
            deliveredItemIds.push(comp.itemId);
            updateStock(
              branchId,
              comp.itemId,
              -needed,
              'Entrega por Verificación',
              `Entrega a alumno ${selectedEnrollment.student} (Matrícula: ${selectedEnrollment.id})`,
              selectedEnrollment.id
            );
          }
        });
      }
    });

    if (missing.length > 0) {
      setFormError(`Sin stock suficiente en la sede para: ${missing.join(', ')}. Desmárquelos o registre un ingreso de stock.`);
      return;
    }

    if (verificationStatus === 'Verificado Completo') {
      const allDelivered = activeRecipe.items.every(ri => {
        const it = items.find(i => i.id === ri.itemId);
        if (deliveredItemIds.includes(ri.itemId)) return true;
        return !!(it?.isPackage && it.allowUnpacking && it.composition?.length &&
          it.composition.every(c => deliveredItemIds.includes(c.itemId)));
      });
      if (!allDelivered) {
        setFormError('No puede marcar la verificación como completa: faltan artículos por entregar.');
        return;
      }
    }

    updateEnrollmentVerification(selectedEnrollment.id, {
      status: verificationStatus,
      items: deliveredItemIds,
      observation,
      date: verificationDate,
      verifier: 'Admin (Usuario actual)'
    });

    setIsVerifyOpen(false);
    setFormError(null);
  };

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [programFilter, setProgramFilter] = useState('');

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, programFilter]);

  const handleOpenVerify = (enrollment: Enrollment) => {
    setSelectedEnrollment(enrollment);
    
    // Buscar receta coincidente
    const now = new Date().getTime();
    const recipe = recipes.find(r => {
      if (r.status !== 'Activo') return false;
      if (r.programId !== enrollment.programId) return false;
      
      // Nivel: coincide si es el mismo o si la receta es para todos los niveles
      const matchesLevel = !r.levelId || r.levelId === enrollment.levelId;
      if (!matchesLevel) return false;

      // Sede: coincide si aplica a todas o si la sede está en la lista
      const matchesBranch = r.applyToAllBranches || (enrollment.branchId && r.branchIds.includes(enrollment.branchId));
      if (!matchesBranch) return false;

      // Vigencia: la fecha actual debe estar dentro del rango
      const start = new Date(r.startDate).getTime();
      const end = r.endDate ? new Date(r.endDate).getTime() : Infinity;
      
      return now >= start && now <= end;
    });
    
    setActiveRecipe(recipe || null);
    
    // Initialize checked items from enrollment if already verified
    const initialChecked: Record<string, boolean> = {};
    if (enrollment.verifiedItems) {
      enrollment.verifiedItems.forEach(id => {
        initialChecked[id] = true;
      });
    }
    setCheckedItems(initialChecked);
    setVerificationStatus(enrollment.verificationStatus === 'Verificado Completo' ? 'Verificado Completo' : 'Verificado Incompleto');
    setObservation(enrollment.verificationObservation || '');
    setVerificationDate(enrollment.verificationDate || new Date().toISOString().slice(0, 16));
    setIsVerifyOpen(true);
  };

  const filteredEnrollments = enrollments.filter(e => {
    const matchesSearch = e.student.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         e.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesProgram = !programFilter || e.programId === programFilter;
    
    const matchesStatus = !statusFilter || 
                         (statusFilter === 'pendiente' && !e.verificationStatus) ||
                         (statusFilter === 'incompleta' && e.verificationStatus === 'Verificado Incompleto') ||
                         (statusFilter === 'completa' && e.verificationStatus === 'Verificado Completo');

    return matchesSearch && matchesProgram && matchesStatus;
  });

  const totalPages = Math.ceil(filteredEnrollments.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedEnrollments = filteredEnrollments.slice(startIndex, endIndex);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-text-primary mb-1">Verificación</h2>
          <p className="text-sm text-text-secondary">Control de entrega de artículos y activación de matrículas</p>
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
                placeholder="Buscar por alumno o matrícula..." 
                className="w-full h-10 bg-surface border border-border-soft rounded-xl pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary-accent focus:ring-1 focus:ring-primary-accent transition-shadow"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 md:pb-0">
              <select 
                className="h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent min-w-[140px]"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">Estado Entrega</option>
                <option value="pendiente">Pendiente</option>
                <option value="incompleta">Incompleta</option>
                <option value="completa">Completa</option>
              </select>
              <select 
                className="h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent min-w-[140px]"
                value={programFilter}
                onChange={(e) => setProgramFilter(e.target.value)}
              >
                <option value="">Programa</option>
                {programs.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <Button variant="secondary" className="shrink-0 px-3 h-10 rounded-xl">
                <Filter size={16} />
              </Button>
            </div>
          </div>
        </div>

        {/* Data Table */}
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-text-secondary uppercase bg-surface-muted/50 sticky top-0 z-10">
              <tr>
                <th className="px-6 py-3 font-medium">Matrícula</th>
                <th className="px-6 py-3 font-medium">Alumno</th>
                <th className="px-6 py-3 font-medium">Programa/Nivel</th>
                <th className="px-6 py-3 font-medium">Fecha Matrícula</th>
                <th className="px-6 py-3 font-medium">Estado Entrega</th>
                <th className="px-6 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-soft">
              {paginatedEnrollments.map((row) => (
                <tr key={row.id} className="hover:bg-surface-muted/50 transition-colors even:bg-surface-muted/30">
                  <td className="px-6 py-3 font-mono text-text-primary text-xs">{row.id}</td>
                  <td className="px-6 py-3">
                    <div className="font-medium text-text-primary">{row.student}</div>
                    <div className="text-[10px] text-text-muted">{row.sede}</div>
                  </td>
                  <td className="px-6 py-3 text-text-secondary">
                    <div>{row.program}</div>
                    <div className="text-xs text-text-muted">{row.level || 'N/A'}</div>
                  </td>
                  <td className="px-6 py-3 text-text-secondary text-xs">{row.date}</td>
                  <td className="px-6 py-3">
                    <Badge 
                      variant={
                        row.verificationStatus === 'Verificado Completo' ? 'success' : 
                        row.verificationStatus === 'Verificado Incompleto' ? 'warning' : 
                        'neutral'
                      }
                    >
                      {row.verificationStatus || 'Pendiente'}
                    </Badge>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <Button variant="primary" className="text-xs py-1.5 px-3 flex items-center gap-2 ml-auto" onClick={() => handleOpenVerify(row)}>
                      <span>Verificar</span>
                      <ArrowRight size={14} />
                    </Button>
                  </td>
                </tr>
              ))}
              {paginatedEnrollments.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-text-muted">
                    No se encontraron matrículas pendientes de verificación
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="p-4 border-t border-border-soft flex items-center justify-between bg-surface">
          <span className="text-sm text-text-secondary text-xs">
            Mostrando {filteredEnrollments.length > 0 ? startIndex + 1 : 0} a {Math.min(endIndex, filteredEnrollments.length)} de {filteredEnrollments.length} registros
          </span>
          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="h-8 px-3 text-xs"
            >
              Anterior
            </Button>
            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }).map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentPage(i + 1)}
                  className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${
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
              disabled={currentPage === totalPages || totalPages === 0}
              className="h-8 px-3 text-xs"
            >
              Siguiente
            </Button>
          </div>
        </div>
      </div>

      {/* Verificar Entrega Modal */}
      <Modal 
        isOpen={isVerifyOpen} 
        onClose={() => {
          setIsVerifyOpen(false);
          setFormError(null);
        }} 
        title="Verificar Entrega de Artículos"
        size="2xl"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => {
              setIsVerifyOpen(false);
              setFormError(null);
            }}>Cancelar</Button>
            <Button 
              variant="primary" 
              disabled={!activeRecipe}
              onClick={handleSaveVerification}
            >
              Guardar verificación
            </Button>
          </div>
        }
      >
        {selectedEnrollment && (
          <div className="space-y-6">
            {formError && (
              <div className="bg-danger-tint/50 border border-danger-text/20 rounded-xl p-3 flex gap-2 text-sm text-danger-text animate-in fade-in slide-in-from-top-1">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <p>{formError}</p>
              </div>
            )}
            <div className="bg-surface-muted p-4 rounded-xl border border-border-soft">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-text-primary">{selectedEnrollment.id}</h3>
                  <p className="text-sm text-text-secondary mt-1">Alumno: {selectedEnrollment.student}</p>
                  <p className="text-sm text-text-secondary">
                    Programa: {selectedEnrollment.program} {selectedEnrollment.level ? `- ${selectedEnrollment.level}` : ''}
                  </p>
                  <p className="text-xs text-text-muted mt-1">Sede: {selectedEnrollment.sede}</p>
                </div>
                <Badge 
                  variant={
                    selectedEnrollment.verificationStatus === 'Verificado Completo' ? 'success' : 
                    selectedEnrollment.verificationStatus === 'Verificado Incompleto' ? 'warning' : 
                    'neutral'
                  }
                >
                  {selectedEnrollment.verificationStatus || 'Pendiente'}
                </Badge>
              </div>
            </div>

            {!activeRecipe ? (
              <div className="p-4 bg-danger/10 border border-danger/20 rounded-xl flex gap-3 items-start">
                <AlertCircle className="text-danger shrink-0" size={20} />
                <div>
                  <h4 className="text-sm font-semibold text-danger">No se encontró una receta vigente</h4>
                  <p className="text-xs text-danger/80 mt-1">
                    No existe una receta de materiales activa para este programa, nivel y sede en la fecha actual. 
                    Debe configurar una receta en "Configuración comercial" para proceder.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-text-secondary">Fecha de verificación *</label>
                    <input 
                      type="datetime-local" 
                      className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none" 
                      value={verificationDate}
                      onChange={(e) => setVerificationDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-text-secondary">Verificador *</label>
                    <input type="text" className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none" value="Admin (Usuario actual)" disabled />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                      <Package size={16} />
                      Checklist de Artículos (Receta: {activeRecipe.name})
                    </h3>
                    <span className="text-xs text-text-muted">Descuenta stock al guardar</span>
                  </div>
                  
                  <div className="border border-border-soft rounded-xl overflow-hidden">
                    <table className="w-full text-sm text-left">
                      <thead className="text-xs text-text-secondary uppercase bg-surface-muted/50">
                        <tr>
                          <th className="px-4 py-3 w-10 text-center">Entregado</th>
                          <th className="px-4 py-3 font-medium">Artículo / Componente</th>
                          <th className="px-4 py-3 font-medium text-center">Cant.</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border-soft">
                        {activeRecipe.items.map((recipeItem, idx) => {
                          const item = items.find(i => i.id === recipeItem.itemId);
                          const isPackage = item?.isPackage;
                          const branchId = selectedEnrollment.branchId || '';
                          const alreadyDelivered = !!selectedEnrollment.verifiedItems?.includes(recipeItem.itemId);
                          const hasStock = canDeliver(stockItems, branchId, recipeItem.itemId, recipeItem.quantity);
                          const blocked = !alreadyDelivered && !hasStock;
                          const showComponents = !!(isPackage && item?.allowUnpacking);
                          
                          return (
                            <React.Fragment key={idx}>
                              <tr className={`hover:bg-surface-muted/50 ${isPackage ? 'bg-surface-muted/20' : ''} ${blocked ? 'opacity-60 bg-surface-muted' : ''}`}>
                                <td className="px-4 py-3 text-center">
                                  <input 
                                    type="checkbox" 
                                    className="rounded border-border-soft text-primary-accent focus:ring-primary-accent"
                                    checked={!blocked && (checkedItems[recipeItem.itemId] || false)}
                                    disabled={blocked}
                                    title={blocked ? 'Sin stock suficiente en la sede' : undefined}
                                    onChange={(e) => {
                                      const newChecked = { ...checkedItems, [recipeItem.itemId]: e.target.checked };
                                      // If it's a package, we might want to auto-check components, 
                                      // but the user says "no puede asumir que siempre hay kit completo cerrado"
                                      // so we let them check individually.
                                      setCheckedItems(newChecked);
                                    }}
                                  />
                                </td>
                                <td className="px-4 py-3">
                                  <div className={`font-medium ${isPackage ? 'text-primary-accent font-bold' : 'text-text-primary'}`}>
                                    {item?.name || 'Artículo no encontrado'}
                                    {isPackage && <span className="ml-2 text-[10px] uppercase bg-primary-accent/10 px-1.5 py-0.5 rounded">Kit</span>}
                                  </div>
                                  <div className={`text-xs ${blocked ? 'text-danger-text font-medium' : 'text-text-muted'}`}>
                                    Stock disponible: {availableStock(stockItems, branchId, recipeItem.itemId)}
                                    {blocked && ' — sin stock suficiente, no puede entregarse'}
                                    {alreadyDelivered && ' — ya entregado'}
                                  </div>
                                  {isPackage && !item?.allowUnpacking && item?.composition && item.composition.length > 0 && (
                                    <div className="text-[11px] text-text-muted mt-0.5">
                                      Paquete sellado (una unidad): {item.composition.map(c => `${c.quantity}× ${c.name}`).join(', ')}
                                    </div>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-center font-medium">{recipeItem.quantity}</td>
                              </tr>
                              {showComponents && item?.composition?.map((comp, cIdx) => (
                                <tr key={`${idx}-${cIdx}`} className="bg-surface/50 hover:bg-surface-muted/30">
                                  <td className="px-4 py-2 text-center pl-8">
                                    <input 
                                      type="checkbox" 
                                      className="rounded border-border-soft text-primary-accent focus:ring-primary-accent scale-90"
                                      checked={checkedItems[comp.itemId] || false}
                                      onChange={(e) => setCheckedItems({
                                        ...checkedItems,
                                        [comp.itemId]: e.target.checked
                                      })}
                                    />
                                  </td>
                                  <td className="px-4 py-2 text-xs text-text-secondary italic flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-border-soft" />
                                    {comp.name}
                                    <span className="text-[10px] text-text-muted">(Componente)</span>
                                  </td>
                                  <td className="px-4 py-2 text-center text-xs text-text-muted">{comp.quantity}</td>
                                </tr>
                              ))}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-text-secondary">Estado de verificación *</label>
                  <select 
                    className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none"
                    value={verificationStatus}
                    onChange={(e) => setVerificationStatus(e.target.value as any)}
                  >
                    <option value="Verificado Completo">Completa (Todo entregado)</option>
                    <option value="Verificado Incompleto">Incompleta (Faltan artículos)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-text-secondary">Observaciones / Incidencias</label>
                  <textarea 
                    className="w-full h-20 bg-surface border border-border-soft rounded-xl p-3 text-sm focus:border-primary-accent outline-none resize-none" 
                    placeholder="Ej. Polo pendiente por falta de stock en talla S..."
                    value={observation}
                    onChange={(e) => setObservation(e.target.value)}
                  ></textarea>
                </div>
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
