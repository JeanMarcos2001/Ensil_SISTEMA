import React, { useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Search, Filter, Plus, AlertTriangle, ArrowUpRight, ArrowDownRight, RefreshCw, Package, FileText, Info, Calendar, MapPin, User, Hash } from 'lucide-react';
import { useData, Adjustment } from '../../context/DataContext';
import { DateInput } from '../../components/ui/DateInput';

export function Adjustments() {
  const { adjustments, stockItems, items, branches, addAdjustment } = useData();
  const [isNewAdjustmentOpen, setIsNewAdjustmentOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedAdjustment, setSelectedAdjustment] = useState<Adjustment | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  
  // Form State
  const [selectedStockId, setSelectedStockId] = useState<string>('');
  const [qty, setQty] = useState<number>(0);
  const [type, setType] = useState<Adjustment['type']>('Merma');
  const [reason, setReason] = useState<string>('');
  const [observation, setObservation] = useState<string>('');

  // Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBranch, setFilterBranch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterDate, setFilterDate] = useState('');

  const handleSaveAdjustment = () => {
    if (!selectedStockId || qty === 0 || !reason) {
      setFormError('Por favor complete los campos obligatorios (Artículo, Cantidad y Motivo)');
      return;
    }

    const stock = stockItems.find(s => s.id === selectedStockId);
    if (!stock) return;

    const item = items.find(i => i.id === stock.itemId);
    const branch = branches.find(b => b.id === stock.branchId);

    // El signo lo define el tipo de operación; en Regularización administrativa se respeta el signo ingresado.
    const signedQty = type === 'Ajuste Positivo' || type === 'Devolución'
      ? Math.abs(qty)
      : type === 'Ajuste Negativo' || type === 'Merma'
        ? -Math.abs(qty)
        : qty;

    const result = addAdjustment({
      branch: branch?.name || 'Desconocida',
      material: item?.name || 'Artículo desconocido',
      type: type as Adjustment['type'],
      qty: signedQty,
      reason,
      observation
    }, selectedStockId);

    if (!result.ok) {
      setFormError(result.error || 'No se pudo registrar el ajuste.');
      return;
    }

    setIsNewAdjustmentOpen(false);
    setFormError(null);
    
    // Reset form
    setSelectedStockId('');
    setQty(0);
    setType('Merma');
    setReason('');
    setObservation('');
  };

  const handleOpenDetail = (adj: Adjustment) => {
    setSelectedAdjustment(adj);
    setIsDetailOpen(true);
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'Ajuste Positivo': return 'success';
      case 'Ajuste Negativo': return 'warning';
      case 'Merma': return 'danger';
      case 'Regularización Administrativa': return 'info';
      default: return 'neutral';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'Ajuste Positivo': return <ArrowUpRight size={14} className="text-success-text" />;
      case 'Ajuste Negativo': return <ArrowDownRight size={14} className="text-warning-text" />;
      case 'Merma': return <ArrowDownRight size={14} className="text-danger-text" />;
      case 'Regularización Administrativa': return <RefreshCw size={14} className="text-info-text" />;
      default: return <RefreshCw size={14} className="text-text-muted" />;
    }
  };

  const filteredAdjustments = adjustments.filter(adj => {
    const matchesSearch = adj.material.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          adj.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesBranch = !filterBranch || adj.branch === filterBranch;
    const matchesType = !filterType || adj.type === filterType;
    const matchesDate = !filterDate || adj.date.startsWith(filterDate);

    return matchesSearch && matchesBranch && matchesType && matchesDate;
  });

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-text-primary mb-1">Ajustes y Mermas</h2>
          <p className="text-sm text-text-secondary">Regularización de inventario por diferencias, pérdidas o deterioro</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="primary" className="flex items-center gap-2" onClick={() => setIsNewAdjustmentOpen(true)}>
            <Plus size={16} />
            Nueva regularización
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
                placeholder="Buscar por ID o material..." 
                className="w-full h-10 bg-surface border border-border-soft rounded-xl pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary-accent focus:ring-1 focus:ring-primary-accent transition-shadow"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 md:pb-0">
              <select 
                className="h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent min-w-[130px]"
                value={filterBranch}
                onChange={(e) => setFilterBranch(e.target.value)}
              >
                <option value="">Todas las sedes</option>
                {branches.map(b => (
                  <option key={b.id} value={b.name}>{b.name}</option>
                ))}
              </select>
              <select 
                className="h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent min-w-[130px]"
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
              >
                <option value="">Tipo</option>
                <option value="Ajuste Positivo">Ajuste Positivo</option>
                <option value="Ajuste Negativo">Ajuste Negativo</option>
                <option value="Merma">Merma</option>
                <option value="Regularización Administrativa">Regularización Administrativa</option>
              </select>
              <DateInput 
                
                className="h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent" 
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
              />
              <Button 
                variant="secondary" 
                className="shrink-0 px-3 h-10 rounded-xl"
                onClick={() => {
                  setSearchTerm('');
                  setFilterBranch('');
                  setFilterType('');
                  setFilterDate('');
                }}
              >
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
                <th className="px-6 py-3 font-medium">Fecha</th>
                <th className="px-6 py-3 font-medium">Sede</th>
                <th className="px-6 py-3 font-medium">Material</th>
                <th className="px-6 py-3 font-medium">Tipo</th>
                <th className="px-6 py-3 font-medium text-right">Cant.</th>
                <th className="px-6 py-3 font-medium">Motivo</th>
                <th className="px-6 py-3 font-medium">Usuario</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-soft">
              {filteredAdjustments.map((row) => (
                <tr 
                  key={row.id} 
                  className="hover:bg-surface-muted/50 transition-colors even:bg-surface-muted/30 cursor-pointer"
                  onClick={() => handleOpenDetail(row)}
                >
                  <td className="px-6 py-3 text-text-secondary whitespace-nowrap">{row.date}</td>
                  <td className="px-6 py-3 text-text-primary">{row.branch}</td>
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-2">
                      <Package size={14} className="text-text-muted" />
                      <span className="font-medium text-text-primary">{row.material}</span>
                    </div>
                  </td>
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-2">
                      {getTypeIcon(row.type)}
                      <Badge variant={getTypeBadge(row.type)} className="text-xs">{row.type}</Badge>
                    </div>
                  </td>
                  <td className={`px-6 py-3 text-right font-medium ${row.qty > 0 ? 'text-success-text' : 'text-danger-text'}`}>
                    {row.qty > 0 ? `+${row.qty}` : row.qty}
                  </td>
                  <td className="px-6 py-3 text-text-secondary truncate max-w-[200px]">{row.reason}</td>
                  <td className="px-6 py-3 text-text-secondary">{row.user}</td>
                </tr>
              ))}
              {filteredAdjustments.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-text-muted">
                    No se encontraron registros de ajustes o mermas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="p-4 border-t border-border-soft flex items-center justify-between bg-surface">
          <span className="text-sm text-text-secondary">Mostrando 1 a {adjustments.length} de {adjustments.length} registros</span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" disabled>Anterior</Button>
            <div className="flex items-center gap-1">
              <button className="w-8 h-8 rounded-lg text-sm font-medium transition-colors bg-primary-accent text-white">1</button>
            </div>
            <Button variant="ghost" disabled>Siguiente</Button>
          </div>
        </div>
      </div>

      {/* Modal: Nuevo Ajuste/Merma */}
      <Modal
        isOpen={isNewAdjustmentOpen}
        onClose={() => {
          setIsNewAdjustmentOpen(false);
          setFormError(null);
        }}
        title="Nuevo Ajuste o Merma"
        size="5xl"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => {
              setIsNewAdjustmentOpen(false);
              setFormError(null);
            }}>Cancelar</Button>
            <Button variant="primary" onClick={handleSaveAdjustment}>Guardar movimiento</Button>
          </div>
        }
      >
        <div className="space-y-4 mb-6">
          {formError && (
             <div className="bg-danger-tint/50 border border-danger-text/20 rounded-xl p-3 flex gap-2 text-sm text-danger-text animate-in fade-in slide-in-from-top-1">
               <AlertTriangle size={16} className="shrink-0 mt-0.5" />
               <p>{formError}</p>
             </div>
          )}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-12 gap-y-10 pb-4">
          {/* Columna Izquierda */}
          <div className="space-y-10">
            <section className="space-y-6">
              <div className="flex items-center gap-2 pb-2 border-b border-border-soft">
                <div className="w-1 h-4 bg-primary-accent rounded-full" />
                <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider">Origen del Movimiento</h3>
              </div>
              
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">Artículo en Sede <span className="text-error">*</span></label>
                  <select 
                    className="w-full h-10 bg-surface border border-border-soft rounded-lg px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent transition-all focus:ring-2 focus:ring-primary-accent/10"
                    value={selectedStockId}
                    onChange={(e) => setSelectedStockId(e.target.value)}
                  >
                    <option value="">Seleccionar artículo y sede...</option>
                    {stockItems.map(s => {
                      const item = items.find(i => i.id === s.itemId);
                      const branch = branches.find(b => b.id === s.branchId);
                      return (
                        <option key={s.id} value={s.id}>
                          {item?.name} - {branch?.name} (Saldo: {s.stock})
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">Tipo Operación <span className="text-error">*</span></label>
                    <select 
                      className="w-full h-10 bg-surface border border-border-soft rounded-lg px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent transition-all focus:ring-2 focus:ring-primary-accent/10"
                      value={type}
                      onChange={(e) => setType(e.target.value as any)}
                    >
                      <option value="Ajuste Positivo">Ajuste Positivo</option>
                      <option value="Ajuste Negativo">Ajuste Negativo</option>
                      <option value="Merma">Merma</option>
                      <option value="Regularización Administrativa">Regularización Administrativa</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">Cantidad <span className="text-error">*</span></label>
                    <input 
                      type="number" 
                      className="w-full h-10 bg-surface border border-border-soft rounded-lg px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent transition-all focus:ring-2 focus:ring-primary-accent/10" 
                      placeholder="Cantidad (el signo lo define el tipo)"
                      value={qty}
                      onChange={(e) => setQty(parseInt(e.target.value))}
                    />
                  </div>
                </div>
              </div>
            </section>

            <div className="bg-warning-tint/10 border border-warning-text/10 rounded-xl p-4 flex gap-3 text-xs text-warning-text italic">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <p>Todo ajuste o merma impactará el stock de la sede y generará un movimiento automático en el Kardex.</p>
            </div>
          </div>

          {/* Columna Derecha */}
          <div className="space-y-10">
            <section className="space-y-6">
              <div className="flex items-center gap-2 pb-2 border-b border-border-soft">
                <div className="w-1 h-4 bg-primary-accent rounded-full" />
                <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider">Justificación</h3>
              </div>

              <div className="space-y-6">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">Motivo <span className="text-error">*</span></label>
                  <input 
                    type="text"
                    className="w-full h-10 bg-surface border border-border-soft rounded-lg px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent transition-all focus:ring-2 focus:ring-primary-accent/10" 
                    placeholder="Ej: Error en conteo, Producto dañado..."
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">Observación Detallada</label>
                  <textarea 
                    maxLength={500} 
                    className="w-full bg-surface border border-border-soft rounded-lg p-3 text-sm focus:outline-none focus:border-primary-accent resize-none h-24 transition-all focus:ring-2 focus:ring-primary-accent/10" 
                    placeholder="Detalles adicionales sobre la regularización..."
                    value={observation}
                    onChange={(e) => setObservation(e.target.value)}
                  ></textarea>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">Evidencia / Adjunto</label>
                  <div className="w-full h-24 border border-dashed border-border-soft rounded-xl flex flex-col items-center justify-center text-[11px] text-text-muted hover:bg-surface-muted/30 transition-all cursor-pointer group">
                    <FileText size={20} className="mb-1 group-hover:text-primary-accent transition-colors" />
                    <span className="font-semibold uppercase tracking-wide group-hover:text-primary-accent">Subir Foto o Documento</span>
                    <span className="opacity-60">(Opcional)</span>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </Modal>

      {/* Detail Modal */}
      <Modal
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        title="Detalle de Ajuste / Merma"
        size="md"
        footer={
          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => setIsDetailOpen(false)}>Cerrar</Button>
          </div>
        }
      >
        {selectedAdjustment && (
          <div className="space-y-6">
            <div className="flex items-center justify-between bg-surface-muted p-4 rounded-xl border border-border-soft">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-surface flex items-center justify-center border border-border-soft">
                  {getTypeIcon(selectedAdjustment.type)}
                </div>
                <div>
                  <div className="text-sm font-semibold text-text-primary">{selectedAdjustment.type}</div>
                  <div className="text-xs text-text-muted">{selectedAdjustment.date}</div>
                </div>
              </div>
              <Badge variant={getTypeBadge(selectedAdjustment.type)}>{selectedAdjustment.type}</Badge>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <Package size={18} className="text-text-muted mt-0.5" />
                  <div>
                    <div className="text-xs text-text-muted uppercase font-semibold tracking-wider">Material / Artículo</div>
                    <div className="text-sm font-medium text-text-primary">{selectedAdjustment.material}</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <MapPin size={18} className="text-text-muted mt-0.5" />
                  <div>
                    <div className="text-xs text-text-muted uppercase font-semibold tracking-wider">Sede</div>
                    <div className="text-sm font-medium text-text-primary">{selectedAdjustment.branch}</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <User size={18} className="text-text-muted mt-0.5" />
                  <div>
                    <div className="text-xs text-text-muted uppercase font-semibold tracking-wider">Usuario Responsable</div>
                    <div className="text-sm font-medium text-text-primary">{selectedAdjustment.user}</div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <Hash size={18} className="text-text-muted mt-0.5" />
                  <div>
                    <div className="text-xs text-text-muted uppercase font-semibold tracking-wider">Cantidad</div>
                    <div className={`text-sm font-bold ${selectedAdjustment.qty > 0 ? 'text-success-text' : 'text-danger-text'}`}>
                      {selectedAdjustment.qty > 0 ? `+${selectedAdjustment.qty}` : selectedAdjustment.qty}
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Calendar size={18} className="text-text-muted mt-0.5" />
                  <div>
                    <div className="text-xs text-text-muted uppercase font-semibold tracking-wider">Fecha de Registro</div>
                    <div className="text-sm font-medium text-text-primary">{selectedAdjustment.date}</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <FileText size={18} className="text-text-muted mt-0.5" />
                  <div>
                    <div className="text-xs text-text-muted uppercase font-semibold tracking-wider">ID Registro</div>
                    <div className="text-sm font-mono text-text-primary">{selectedAdjustment.id}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-surface-muted p-4 rounded-xl border border-border-soft">
                <div className="flex items-center gap-2 mb-2">
                  <Info size={16} className="text-text-muted" />
                  <div className="text-xs text-text-muted uppercase font-semibold tracking-wider">Motivo</div>
                </div>
                <p className="text-sm text-text-primary font-medium">
                  {selectedAdjustment.reason}
                </p>
              </div>

              <div className="bg-surface-muted p-4 rounded-xl border border-border-soft">
                <div className="flex items-center gap-2 mb-2">
                  <FileText size={16} className="text-text-muted" />
                  <div className="text-xs text-text-muted uppercase font-semibold tracking-wider">Observación Detallada</div>
                </div>
                <p className="text-sm text-text-secondary italic">
                  {selectedAdjustment.observation || 'Sin observaciones adicionales registradas.'}
                </p>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
