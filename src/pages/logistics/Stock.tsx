import React, { useState, useEffect } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { ActionMenu } from '../../components/ui/ActionMenu';
import { Search, Filter, Plus, Download, Package, AlertTriangle, History, ArrowRight, ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { useTablePagination } from '../../hooks/useTablePagination';
import { useData } from '../../context/DataContext';

export function Stock() {
  const { stockItems, items, branches, unpackPackage, packPackage, updateStock, addAdjustment, updateMinStock, currentBranchId } = useData();
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isNewEntryOpen, setIsNewEntryOpen] = useState(false);
  const [isUnpackOpen, setIsUnpackOpen] = useState(false);
  const [isPackOpen, setIsPackOpen] = useState(false);
  const [isAdjustOpen, setIsAdjustOpen] = useState(false);
  const [isEditMinStockOpen, setIsEditMinStockOpen] = useState(false);
  const [selectedStock, setSelectedStock] = useState<any>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = useTablePagination();
  
  // New Entry Form State
  const [entryBranchId, setEntryBranchId] = useState('');
  const [entryItemId, setEntryItemId] = useState('');

  const handleOpenDetail = (stock: any) => {
    setSelectedStock(stock);
    setIsDetailOpen(true);
  };

  const handleOpenNewEntry = (stock?: any) => {
    setSelectedStock(stock || null);
    setIsNewEntryOpen(true);
  };

  const handleOpenUnpack = (stock: any) => {
    setSelectedStock(stock);
    setIsUnpackOpen(true);
  };

  const handleOpenPack = (stock: any) => {
    setSelectedStock(stock);
    setIsPackOpen(true);
  };

  const handleOpenAdjust = (stock: any) => {
    setSelectedStock(stock);
    setIsAdjustOpen(true);
  };

  const handleOpenEditMinStock = (stock: any) => {
    setSelectedStock(stock);
    setIsEditMinStockOpen(true);
  };

  const getStockStatus = (stock: number, minStock: number) => {
    if (stock <= 0) return 'Sin stock';
    if (stock <= minStock) return 'Bajo mínimo';
    return 'Normal';
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Normal': return 'success';
      case 'Bajo mínimo': return 'warning';
      case 'Sin stock': return 'danger';
      default: return 'neutral';
    }
  };

  const filteredStocks = stockItems.filter(s => {
    const item = items.find(i => i.id === s.itemId);
    const branch = branches.find(b => b.id === s.branchId);
    
    const matchesSearch = item?.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          item?.id.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesBranch = currentBranchId === 'all' 
      ? (!branchFilter || s.branchId === branchFilter)
      : s.branchId === currentBranchId;

    const matchesType = !typeFilter || item?.type === typeFilter;
    
    const status = getStockStatus(s.stock, s.minStock);
    const matchesStatus = !statusFilter || status === statusFilter;

    return matchesSearch && matchesBranch && matchesType && matchesStatus;
  });

  const totalPages = Math.ceil(filteredStocks.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedStock = filteredStocks.slice(startIndex, endIndex);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, branchFilter, typeFilter, statusFilter]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-text-primary mb-1">Stock de Artículos</h2>
          <p className="text-sm text-text-secondary">Monitoreo de inventario y registro de ingresos por sede</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" className="hidden sm:flex items-center gap-2">
            <Download size={16} />
            Exportar
          </Button>
          <Button variant="primary" className="flex items-center gap-2" onClick={() => handleOpenNewEntry()}>
            <Plus size={16} />
            Registrar ingreso
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
                placeholder="Buscar por nombre o SKU..." 
                className="w-full h-10 bg-surface border border-border-soft rounded-xl pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary-accent focus:ring-1 focus:ring-primary-accent transition-shadow"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 md:pb-0">
              <select 
                className="h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent min-w-[130px]"
                value={branchFilter}
                onChange={(e) => setBranchFilter(e.target.value)}
              >
                <option value="">Todas las sedes</option>
                {branches.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              <select 
                className="h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent min-w-[130px]"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
              >
                <option value="">Tipo artículo</option>
                <option value="Libro">Libro</option>
                <option value="Material educativo">Material educativo</option>
                <option value="Herramienta / adicional">Herramienta</option>
                <option value="Paquete / kit logístico">Paquete</option>
              </select>
              <select 
                className="h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent min-w-[130px]"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">Estado</option>
                <option value="Normal">Normal</option>
                <option value="Bajo mínimo">Bajo mínimo</option>
                <option value="Sin stock">Sin stock</option>
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
                <th className="px-6 py-3 font-medium">Artículo / SKU</th>
                <th className="px-6 py-3 font-medium">Sede</th>
                <th className="px-6 py-3 font-medium">Tipo</th>
                <th className="px-6 py-3 font-medium text-right">Stock Actual</th>
                <th className="px-6 py-3 font-medium text-right">Mínimo</th>
                <th className="px-6 py-3 font-medium">Estado</th>
                <th className="px-6 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-soft">
              {paginatedStock.map((row) => {
                const item = items.find(i => i.id === row.itemId);
                const branch = branches.find(b => b.id === row.branchId);
                const status = getStockStatus(row.stock, row.minStock);
                
                return (
                  <tr key={row.id} className="hover:bg-surface-muted/50 transition-colors even:bg-surface-muted/30">
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-surface-muted flex items-center justify-center shrink-0">
                          <Package size={16} className="text-text-muted" />
                        </div>
                        <div>
                          <div className="font-medium text-text-primary">{item?.name}</div>
                          <div className="text-xs text-text-muted">{item?.id}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-3 text-sm text-text-secondary">{branch?.name}</td>
                    <td className="px-6 py-3 text-sm text-text-secondary">{item?.type}</td>
                    <td className={`px-6 py-3 text-sm text-right font-medium ${row.stock === 0 ? 'text-danger-text' : row.stock <= row.minStock ? 'text-warning-text' : 'text-text-primary'}`}>
                      {row.stock}
                    </td>
                    <td className="px-6 py-3 text-sm text-right text-text-secondary">{row.minStock}</td>
                    <td className="px-6 py-3 text-sm">
                      <Badge variant={getStatusBadge(status)}>{status}</Badge>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <ActionMenu 
                        items={[
                          { label: 'Ver detalle', onClick: () => handleOpenDetail(row) },
                          { label: 'Registrar ingreso', onClick: () => handleOpenNewEntry(row) },
                          { label: 'Ajustar stock', onClick: () => handleOpenAdjust(row) },
                          { label: 'Transferir', onClick: () => { window.location.href = '/logistics/transfers'; } },
                          ...(item?.isPackage ? [
                            { label: 'Empaquetar', onClick: () => handleOpenPack(row) }
                          ] : []),
                          ...(item?.isPackage && item?.allowUnpacking ? [
                            { label: 'Desempaquetar', onClick: () => handleOpenUnpack(row) }
                          ] : []),
                          { label: 'Ver en Kardex', onClick: () => { window.location.href = '/logistics/kardex'; } },
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
        <div className="p-4 border-t border-border-soft flex items-center justify-between bg-surface">
          <span className="text-sm text-text-secondary">
            Mostrando {filteredStocks.length > 0 ? startIndex + 1 : 0} a {Math.min(endIndex, filteredStocks.length)} de {filteredStocks.length} registros
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
              disabled={currentPage === totalPages || totalPages === 0}
            >
              Siguiente
            </Button>
          </div>
        </div>
      </div>

      {/* Modal: Detalle del Artículo */}
      <Modal
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        title="Detalle de Stock"
        size="md"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setIsDetailOpen(false)}>Cerrar</Button>
            <Button variant="primary" onClick={() => { setIsDetailOpen(false); handleOpenNewEntry(selectedStock); }}>
              Registrar ingreso
            </Button>
          </div>
        }
      >
        {selectedStock && (() => {
          const item = items.find(i => i.id === selectedStock.itemId);
          const branch = branches.find(b => b.id === selectedStock.branchId);
          const status = getStockStatus(selectedStock.stock, selectedStock.minStock);
          
          return (
            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 rounded-xl bg-surface-muted flex items-center justify-center shrink-0 border border-border-soft">
                  <Package size={32} className="text-text-muted" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-text-primary">{item?.name}</h3>
                  <p className="text-sm text-text-secondary">{item?.id} • {item?.type}</p>
                  <div className="mt-2">
                    <Badge variant={getStatusBadge(status)}>{status}</Badge>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 bg-surface-muted p-4 rounded-xl border border-border-soft">
                <div>
                  <span className="block text-xs text-text-muted mb-1">Sede</span>
                  <span className="text-sm font-medium text-text-primary">{branch?.name}</span>
                </div>
                <div>
                  <span className="block text-xs text-text-muted mb-1">Unidad de medida</span>
                  <span className="text-sm font-medium text-text-primary">{item?.unit}</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="bg-surface border border-border-soft rounded-xl p-4 text-center">
                  <span className="block text-xs text-text-muted mb-1">Stock Actual</span>
                  <span className={`text-2xl font-bold ${selectedStock.stock === 0 ? 'text-danger-text' : selectedStock.stock <= selectedStock.minStock ? 'text-warning-text' : 'text-text-primary'}`}>
                    {selectedStock.stock}
                  </span>
                </div>
                <div className="bg-surface border border-border-soft rounded-xl p-4 text-center relative group">
                  <span className="block text-xs text-text-muted mb-1">Mínimo</span>
                  <span className="text-2xl font-bold text-text-secondary">{selectedStock.minStock}</span>
                  <Button 
                    variant="ghost" 
                    className="absolute top-1 right-1 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => handleOpenEditMinStock(selectedStock)}
                  >
                    <Plus size={12} />
                  </Button>
                </div>
                <div className="bg-surface border border-border-soft rounded-xl p-4 text-center">
                  <span className="block text-xs text-text-muted mb-1">Disponible</span>
                  <span className="text-2xl font-bold text-text-secondary">{selectedStock.stock}</span>
                </div>
              </div>

              {item?.isPackage && (
                <div className="bg-primary-accent/5 border border-primary-accent/20 rounded-xl p-4">
                  <h4 className="text-sm font-semibold text-primary-accent mb-2 flex items-center gap-2">
                    <Package size={16} />
                    Composición del Paquete
                  </h4>
                  <ul className="space-y-2">
                    {item.composition?.map((comp, idx) => (
                      <li key={idx} className="flex justify-between text-sm">
                        <span className="text-text-secondary">{comp.name}</span>
                        <span className="font-medium text-text-primary">x{comp.quantity}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <div className="flex justify-between items-center mb-3">
                  <h4 className="text-sm font-medium text-text-primary flex items-center gap-2">
                    <History size={16} className="text-text-muted" />
                    Últimos Movimientos
                  </h4>
                  <Button variant="ghost" className="text-xs h-auto py-1 px-2 text-primary-accent">Ver Kardex completo</Button>
                </div>
                <div className="border border-border-soft rounded-xl overflow-hidden">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-text-secondary uppercase bg-surface-muted/50">
                      <tr>
                        <th className="px-3 py-2 font-medium">Fecha</th>
                        <th className="px-3 py-2 font-medium">Tipo</th>
                        <th className="px-3 py-2 font-medium text-right">Cant.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-soft">
                      <tr>
                        <td className="px-3 py-2 text-text-secondary">15 Abr 2024</td>
                        <td className="px-3 py-2">
                          <span className="flex items-center gap-1 text-danger-text">
                            <ArrowDownRight size={14} /> Entrega a alumno
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-danger-text">-1</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 text-text-secondary">10 Abr 2024</td>
                        <td className="px-3 py-2">
                          <span className="flex items-center gap-1 text-success-text">
                            <ArrowUpRight size={14} /> Ingreso por compra
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-success-text">+50</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* Modal: Registrar Ingreso */}
      <Modal
        isOpen={isNewEntryOpen}
        onClose={() => {
          setIsNewEntryOpen(false);
          setEntryBranchId('');
          setEntryItemId('');
          setFormError(null);
        }}
        title="Registrar Ingreso de Stock"
        size="md"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => {
              setIsNewEntryOpen(false);
              setEntryBranchId('');
              setEntryItemId('');
              setFormError(null);
            }}>Cancelar</Button>
            <Button variant="primary" onClick={() => {
              const qtyInput = document.getElementById('entry-qty') as HTMLInputElement;
              const typeInput = document.getElementById('entry-type') as HTMLSelectElement;
              const docInput = document.getElementById('entry-doc') as HTMLInputElement;
              const reasonInput = document.getElementById('entry-reason') as HTMLTextAreaElement;
              
              const branchIdToUse = selectedStock ? selectedStock.branchId : entryBranchId;
              const itemIdToUse = selectedStock ? selectedStock.itemId : entryItemId;

              if (!branchIdToUse || !itemIdToUse || !qtyInput.value) {
                setFormError('Por favor complete los campos obligatorios (Sede, Artículo y Cantidad)');
                return;
              }

              // Find or create stock item
              let stockItem = stockItems.find(s => s.branchId === branchIdToUse && s.itemId === itemIdToUse);
              
              if (!stockItem) {
                // In a real app, this would be an API call to create the stock item first
                setFormError('No se encontró el registro de stock para esta sede y artículo. En un entorno real, se crearía automáticamente.');
                return;
              }

              updateStock(
                branchIdToUse,
                itemIdToUse, 
                parseInt(qtyInput.value), 
                'Ingreso', 
                reasonInput.value || 'Ingreso manual de stock',
                docInput.value
              );
              
              setIsNewEntryOpen(false);
              setEntryBranchId('');
              setEntryItemId('');
              setFormError(null);
            }}>Guardar movimiento</Button>
          </div>
        }
      >
        <div className="space-y-4">
          {formError && (
            <div className="bg-danger-tint/50 border border-danger-text/20 rounded-xl p-3 flex gap-2 text-sm text-danger-text animate-in fade-in slide-in-from-top-1">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <p>{formError}</p>
            </div>
          )}
          <div className="bg-info-tint/50 border border-info-text/20 rounded-xl p-3 flex gap-2 text-sm text-info-text mb-2">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <p>Todo ingreso generará un movimiento auditable en el Kardex y actualizará el saldo disponible automáticamente.</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text-secondary">Sede destino *</label>
              <select 
                className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none" 
                disabled={!!selectedStock} 
                value={selectedStock ? selectedStock.branchId : entryBranchId}
                onChange={(e) => setEntryBranchId(e.target.value)}
              >
                <option value="">Seleccionar sede...</option>
                {branches.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text-secondary">Fecha del movimiento *</label>
              <input type="date" className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none" defaultValue={new Date().toISOString().split('T')[0]} />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-secondary">Tipo de ingreso *</label>
            <select id="entry-type" className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none">
              <option value="Ingreso por compra">Compra</option>
              <option value="Ingreso por producción">Producción</option>
              <option value="Devolución">Devolución</option>
              <option value="Transferencia recibida">Transferencia recibida</option>
              <option value="Ajuste positivo">Ajuste positivo</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-secondary">Artículo *</label>
            {selectedStock ? (() => {
              const item = items.find(i => i.id === selectedStock.itemId);
              return (
                <div className="flex items-center justify-between bg-surface-muted border border-border-soft rounded-xl p-2 px-3">
                  <div className="flex items-center gap-2">
                    <Package size={16} className="text-text-muted" />
                    <span className="text-sm font-medium text-text-primary">{item?.name}</span>
                  </div>
                </div>
              );
            })() : (
              <select 
                className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none"
                value={entryItemId}
                onChange={(e) => setEntryItemId(e.target.value)}
              >
                <option value="">Seleccionar artículo...</option>
                {items.map(i => (
                  <option key={i.id} value={i.id}>{i.name}</option>
                ))}
              </select>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text-secondary">Cantidad *</label>
              <input id="entry-qty" type="number" min="1" className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none" placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text-secondary">Costo unitario ref.</label>
              <input type="number" min="0" step="0.01" className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none" placeholder="0.00" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-secondary">Documento (Opcional)</label>
            <input id="entry-doc" type="text" maxLength={50} className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none" placeholder="N° de guía, factura, etc." />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-secondary">Observación</label>
            <textarea id="entry-reason" maxLength={500} className="w-full h-20 bg-surface border border-border-soft rounded-xl p-3 text-sm focus:border-primary-accent outline-none resize-none" placeholder="Justificación o detalle adicional..."></textarea>
          </div>
        </div>
      </Modal>

      {/* Modal: Desempaquetar */}
      <Modal
        isOpen={isUnpackOpen}
        onClose={() => setIsUnpackOpen(false)}
        title="Confirmar Desempaquetado"
        size="sm"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setIsUnpackOpen(false)}>Cancelar</Button>
            <Button variant="primary" onClick={() => {
              if (selectedStock) {
                unpackPackage(selectedStock.id);
                setIsUnpackOpen(false);
              }
            }}>Confirmar desempaquetado</Button>
          </div>
        }
      >
        {selectedStock && (() => {
          const item = items.find(i => i.id === selectedStock.itemId);
          return (
            <div className="space-y-4">
              <p className="text-sm text-text-secondary">
                ¿Está seguro que desea desempaquetar una unidad de <strong>{item?.name}</strong>?
              </p>
              <div className="bg-warning-tint/30 border border-warning-text/20 rounded-xl p-3 text-xs text-warning-text">
                Esta acción restará 1 unidad del paquete y sumará sus componentes al stock individual de esta sede.
              </div>
              <div className="space-y-2">
                <span className="text-xs font-semibold text-text-muted uppercase">Componentes a ingresar:</span>
                <ul className="space-y-1">
                  {item?.composition?.map((comp, idx) => (
                    <li key={idx} className="text-sm flex justify-between">
                      <span>{comp.name}</span>
                      <span className="font-medium">+{comp.quantity}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* Modal: Empaquetar */}
      <Modal
        isOpen={isPackOpen}
        onClose={() => setIsPackOpen(false)}
        title="Confirmar Empaquetado"
        size="sm"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setIsPackOpen(false)}>Cancelar</Button>
            <Button variant="primary" onClick={() => {
              if (selectedStock) {
                packPackage(selectedStock.id);
                setIsPackOpen(false);
              }
            }}>Confirmar empaquetado</Button>
          </div>
        }
      >
        {selectedStock && (() => {
          const item = items.find(i => i.id === selectedStock.itemId);
          return (
            <div className="space-y-4">
              <p className="text-sm text-text-secondary">
                ¿Está seguro que desea empaquetar una unidad de <strong>{item?.name}</strong>?
              </p>
              <div className="bg-info-tint/30 border border-info-text/20 rounded-xl p-3 text-xs text-info-text">
                Esta acción restará los componentes necesarios del stock individual y sumará 1 unidad al paquete en esta sede.
              </div>
              <div className="space-y-2">
                <span className="text-xs font-semibold text-text-muted uppercase">Componentes a descontar:</span>
                <ul className="space-y-1">
                  {item?.composition?.map((comp, idx) => (
                    <li key={idx} className="text-sm flex justify-between">
                      <span>{comp.name}</span>
                      <span className="font-medium">-{comp.quantity}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* Modal: Ajustar Stock */}
      <Modal
        isOpen={isAdjustOpen}
        onClose={() => setIsAdjustOpen(false)}
        title="Ajustar Stock (Merma / Corrección)"
        size="md"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setIsAdjustOpen(false)}>Cancelar</Button>
            <Button variant="primary" onClick={() => {
              if (selectedStock) {
                const qtyInput = document.getElementById('adjust-qty') as HTMLInputElement;
                const typeInput = document.getElementById('adjust-type') as HTMLSelectElement;
                const reasonInput = document.getElementById('adjust-reason') as HTMLTextAreaElement;
                
                if (qtyInput.value) {
                  const qty = parseInt(qtyInput.value);
                  const selectedType = typeInput.value;
                  
                  let finalType: any = 'Merma';
                  if (selectedType === 'Ajuste Positivo') finalType = 'Ajuste Positivo';
                  else if (selectedType === 'Ajuste Negativo') finalType = 'Ajuste Negativo';
                  else if (selectedType === 'Regularización Administrativa') finalType = 'Regularización Administrativa';
                  else if (selectedType === 'Merma') finalType = 'Merma';
                  else {
                    // Fallback to sign-based if it was one of the descriptive ones
                    finalType = qty > 0 ? 'Ajuste Positivo' : 'Ajuste Negativo';
                  }
                  
                  const item = items.find(i => i.id === selectedStock.itemId);
                  const branch = branches.find(b => b.id === selectedStock.branchId);

                  addAdjustment({
                    branch: branch?.name || 'Desconocida',
                    material: item?.name || 'Artículo desconocido',
                    type: finalType,
                    qty,
                    reason: reasonInput.value || 'Ajuste manual desde Stock',
                    observation: 'Registro generado desde el módulo de Stock'
                  }, selectedStock.id);
                  
                  setIsAdjustOpen(false);
                }
              }
            }}>Guardar ajuste</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="bg-warning-tint/30 border border-warning-text/20 rounded-xl p-3 flex gap-2 text-sm text-warning-text mb-2">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <p>Use valores negativos para mermas o pérdidas, y positivos para correcciones de inventario.</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-secondary">Artículo</label>
            <div className="flex items-center gap-2 bg-surface-muted border border-border-soft rounded-xl p-2 px-3">
              <Package size={16} className="text-text-muted" />
              <span className="text-sm font-medium text-text-primary">
                {items.find(i => i.id === selectedStock?.itemId)?.name}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text-secondary">Tipo de ajuste *</label>
              <select id="adjust-type" className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none">
                <option value="Merma">Merma / Pérdida</option>
                <option value="Ajuste Positivo">Ajuste Positivo (Sobrante)</option>
                <option value="Ajuste Negativo">Ajuste Negativo (Faltante)</option>
                <option value="Regularización Administrativa">Regularización Administrativa</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text-secondary">Cantidad (ej: -5) *</label>
              <input id="adjust-qty" type="number" className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none" placeholder="0" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-secondary">Observación / Justificación *</label>
            <textarea id="adjust-reason" maxLength={500} className="w-full h-20 bg-surface border border-border-soft rounded-xl p-3 text-sm focus:border-primary-accent outline-none resize-none" placeholder="Explique el motivo del ajuste..."></textarea>
          </div>
        </div>
      </Modal>

      {/* Modal: Editar Stock Mínimo */}
      <Modal
        isOpen={isEditMinStockOpen}
        onClose={() => setIsEditMinStockOpen(false)}
        title="Configurar Stock Mínimo"
        size="sm"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setIsEditMinStockOpen(false)}>Cancelar</Button>
            <Button variant="primary" onClick={() => {
              if (selectedStock) {
                const minQtyInput = document.getElementById('min-stock-qty') as HTMLInputElement;
                if (minQtyInput.value) {
                  updateMinStock(selectedStock.id, parseInt(minQtyInput.value));
                  setIsEditMinStockOpen(false);
                }
              }
            }}>Actualizar mínimo</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            Defina el nivel de stock mínimo para <strong>{items.find(i => i.id === selectedStock?.itemId)?.name}</strong> en esta sede.
          </p>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-secondary">Cantidad mínima de alerta</label>
            <input 
              id="min-stock-qty" 
              type="number" 
              min="0" 
              className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none" 
              defaultValue={selectedStock?.minStock || 0}
            />
          </div>
          <p className="text-xs text-text-muted italic">
            El sistema marcará el artículo como "Bajo mínimo" cuando el stock actual sea igual o menor a este valor.
          </p>
        </div>
      </Modal>
    </div>
  );
}
