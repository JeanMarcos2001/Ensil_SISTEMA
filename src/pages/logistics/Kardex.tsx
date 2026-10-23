import React, { useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Search, Filter, Download, ArrowUpRight, ArrowDownRight, RefreshCw, Package, FileText, ArrowRightLeft, User, Calendar, MapPin, Hash, Info } from 'lucide-react';
import { useData, KardexEntry } from '../../context/DataContext';
import { DateInput } from '../../components/ui/DateInput';

export function Kardex() {
  const { kardex, branches, currentBranchId } = useData();

  // Filters State
  const [searchQuery, setSearchQuery] = useState('');
  const [filterBranch, setFilterBranch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterDateStart, setFilterDateStart] = useState('');
  const [filterDateEnd, setFilterDateEnd] = useState('');
  const [selectedEntry, setSelectedEntry] = useState<KardexEntry | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'Ingreso':
      case 'Ajuste Positivo':
      case 'Transferencia Entrada':
        return <ArrowUpRight size={14} className="text-success-text" />;
      case 'Salida':
      case 'Ajuste Negativo':
      case 'Merma':
      case 'Venta':
      case 'Entrega por Verificación':
      case 'Transferencia Salida':
        return <ArrowDownRight size={14} className="text-danger-text" />;
      case 'Empaquetado':
      case 'Desempaquetado':
        return <Package size={14} className="text-primary-text" />;
      default: return <FileText size={14} className="text-text-muted" />;
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'Ingreso':
      case 'Ajuste Positivo':
      case 'Transferencia Entrada':
        return 'success';
      case 'Salida':
      case 'Ajuste Negativo':
      case 'Merma':
      case 'Venta':
      case 'Entrega por Verificación':
      case 'Transferencia Salida':
        return 'danger';
      case 'Empaquetado':
      case 'Desempaquetado':
        return 'info';
      default: return 'neutral';
    }
  };

  const filteredKardex = kardex.filter(row => {
    const matchesSearch = 
      row.material.toLowerCase().includes(searchQuery.toLowerCase()) ||
      row.doc.toLowerCase().includes(searchQuery.toLowerCase()) ||
      row.user.toLowerCase().includes(searchQuery.toLowerCase());
    
    const currentBranch = branches.find(b => b.id === currentBranchId);
    const matchesBranch = currentBranchId === 'all'
      ? (filterBranch ? row.branch === filterBranch : true)
      : row.branch === currentBranch?.name;

    const matchesType = filterType ? row.type === filterType : true;
    
    const rowDate = row.date.split(' ')[0]; // Get YYYY-MM-DD
    const matchesDateStart = filterDateStart ? rowDate >= filterDateStart : true;
    const matchesDateEnd = filterDateEnd ? rowDate <= filterDateEnd : true;

    return matchesSearch && matchesBranch && matchesType && matchesDateStart && matchesDateEnd;
  });

  const handleOpenDetail = (entry: KardexEntry) => {
    setSelectedEntry(entry);
    setIsDetailOpen(true);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-text-primary mb-1">Kardex</h2>
          <p className="text-sm text-text-secondary">Historial cronológico de movimientos de inventario</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" className="flex items-center gap-2">
            <Download size={16} />
            Exportar Excel
          </Button>
          <Button variant="secondary" className="flex items-center gap-2">
            <Download size={16} />
            Exportar PDF
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
                placeholder="Buscar por material, documento o usuario..." 
                className="w-full h-10 bg-surface border border-border-soft rounded-xl pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary-accent focus:ring-1 focus:ring-primary-accent transition-shadow"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
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
                <option value="">Tipo movimiento</option>
                <option value="Ingreso">Ingreso</option>
                <option value="Salida">Salida</option>
                <option value="Transferencia Salida">Transferencia Salida</option>
                <option value="Transferencia Entrada">Transferencia Entrada</option>
                <option value="Ajuste Positivo">Ajuste Positivo</option>
                <option value="Ajuste Negativo">Ajuste Negativo</option>
                <option value="Merma">Merma</option>
                <option value="Venta">Venta</option>
                <option value="Entrega por Verificación">Entrega por Verificación</option>
                <option value="Empaquetado">Empaquetado</option>
                <option value="Desempaquetado">Desempaquetado</option>
              </select>
              <div className="flex items-center gap-2">
                <DateInput 
                  
                  className="h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent" 
                  value={filterDateStart}
                  onChange={(e) => setFilterDateStart(e.target.value)}
                />
                <span className="text-text-muted">-</span>
                <DateInput 
                  
                  className="h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent" 
                  value={filterDateEnd}
                  onChange={(e) => setFilterDateEnd(e.target.value)}
                />
              </div>
              <Button 
                variant="secondary" 
                className="shrink-0 px-3 h-10 rounded-xl"
                onClick={() => {
                  setSearchQuery('');
                  setFilterBranch('');
                  setFilterType('');
                  setFilterDateStart('');
                  setFilterDateEnd('');
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
                <th className="px-6 py-3 font-medium">Fecha / Hora</th>
                <th className="px-6 py-3 font-medium">Sede</th>
                <th className="px-6 py-3 font-medium">Artículo</th>
                <th className="px-6 py-3 font-medium">Tipo Movimiento</th>
                <th className="px-6 py-3 font-medium text-right">Cant.</th>
                <th className="px-6 py-3 font-medium text-right">Saldo Resultante</th>
                <th className="px-6 py-3 font-medium">Referencia Origen</th>
                <th className="px-6 py-3 font-medium">Usuario</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-soft">
              {filteredKardex.map((row) => (
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
                  <td className="px-6 py-3 text-right font-medium text-text-primary">{row.newBalance}</td>
                  <td className="px-6 py-3">
                    <div className="text-primary-accent hover:underline flex items-center gap-1">
                      <FileText size={14} />
                      {row.doc}
                    </div>
                  </td>
                  <td className="px-6 py-3 text-text-secondary">{row.user}</td>
                </tr>
              ))}
              {filteredKardex.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-text-muted">
                    No se encontraron movimientos en el Kardex.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="p-4 border-t border-border-soft flex items-center justify-between bg-surface">
          <span className="text-sm text-text-secondary">Mostrando 1 a {filteredKardex.length} de {filteredKardex.length} registros</span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" disabled>Anterior</Button>
            <div className="flex items-center gap-1">
              <button className="w-8 h-8 rounded-lg text-sm font-medium transition-colors bg-primary-accent text-white">1</button>
            </div>
            <Button variant="ghost" disabled>Siguiente</Button>
          </div>
        </div>
      </div>
      {/* Detail Modal */}
      <Modal
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        title="Detalle de Movimiento"
        size="md"
        footer={
          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => setIsDetailOpen(false)}>Cerrar</Button>
          </div>
        }
      >
        {selectedEntry && (
          <div className="space-y-6">
            <div className="flex items-center justify-between bg-surface-muted p-4 rounded-xl border border-border-soft">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-surface flex items-center justify-center border border-border-soft">
                  {getTypeIcon(selectedEntry.type)}
                </div>
                <div>
                  <div className="text-sm font-semibold text-text-primary">{selectedEntry.type}</div>
                  <div className="text-xs text-text-muted">{selectedEntry.date}</div>
                </div>
              </div>
              <Badge variant={getTypeBadge(selectedEntry.type)}>{selectedEntry.type}</Badge>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <Package size={18} className="text-text-muted mt-0.5" />
                  <div>
                    <div className="text-xs text-text-muted uppercase font-semibold tracking-wider">Material / Artículo</div>
                    <div className="text-sm font-medium text-text-primary">{selectedEntry.material}</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <MapPin size={18} className="text-text-muted mt-0.5" />
                  <div>
                    <div className="text-xs text-text-muted uppercase font-semibold tracking-wider">Sede</div>
                    <div className="text-sm font-medium text-text-primary">{selectedEntry.branch}</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <User size={18} className="text-text-muted mt-0.5" />
                  <div>
                    <div className="text-xs text-text-muted uppercase font-semibold tracking-wider">Usuario Responsable</div>
                    <div className="text-sm font-medium text-text-primary">{selectedEntry.user}</div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <Hash size={18} className="text-text-muted mt-0.5" />
                  <div>
                    <div className="text-xs text-text-muted uppercase font-semibold tracking-wider">Cantidad</div>
                    <div className={`text-sm font-bold ${selectedEntry.qty > 0 ? 'text-success-text' : 'text-danger-text'}`}>
                      {selectedEntry.qty > 0 ? `+${selectedEntry.qty}` : selectedEntry.qty}
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <RefreshCw size={18} className="text-text-muted mt-0.5" />
                  <div>
                    <div className="text-xs text-text-muted uppercase font-semibold tracking-wider">Saldo Resultante</div>
                    <div className="text-sm font-bold text-text-primary">{selectedEntry.newBalance}</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <FileText size={18} className="text-text-muted mt-0.5" />
                  <div>
                    <div className="text-xs text-text-muted uppercase font-semibold tracking-wider">Documento Origen</div>
                    <div className="text-sm font-medium text-primary-accent">{selectedEntry.doc}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-surface-muted p-4 rounded-xl border border-border-soft">
              <div className="flex items-center gap-2 mb-2">
                <Info size={16} className="text-text-muted" />
                <div className="text-xs text-text-muted uppercase font-semibold tracking-wider">Observación</div>
              </div>
              <p className="text-sm text-text-secondary italic">
                {selectedEntry.observation || 'Sin observaciones adicionales registradas.'}
              </p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
