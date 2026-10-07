import React, { useState, useEffect } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { ActionMenu } from '../components/ui/ActionMenu';
import { Search, Filter, Plus, ArrowUpRight, ArrowDownRight, AlertTriangle } from 'lucide-react';
import { useTablePagination } from '../hooks/useTablePagination';

export function PettyCash() {
  const [isNewMovementOpen, setIsNewMovementOpen] = useState(false);
  const [movementType, setMovementType] = useState<'ingreso' | 'egreso'>('egreso');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = useTablePagination();

  const mockMovements = [
    { date: 'Hoy, 11:30', type: 'Egreso', cat: 'Movilidad', concept: 'Taxi a notaría', amount: 'S/ 25.00', user: 'Ana G.' },
    { date: 'Ayer, 15:20', type: 'Egreso', cat: 'Útiles de oficina', concept: 'Compra de papel bond', amount: 'S/ 120.00', user: 'Carlos R.' },
    { date: '14 Mar 2024', type: 'Ingreso', cat: 'Reposición', concept: 'Reposición de fondo fijo', amount: 'S/ 1,000.00', user: 'Admin' },
  ];

  const filteredMovements = mockMovements.filter(row => 
    row.concept.toLowerCase().includes(searchTerm.toLowerCase()) ||
    row.cat.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPages = Math.ceil(filteredMovements.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedMovements = filteredMovements.slice(startIndex, endIndex);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const handleOpenMovement = (type: 'ingreso' | 'egreso') => {
    setMovementType(type);
    setIsNewMovementOpen(true);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-text-primary mb-1">Caja Chica</h2>
          <p className="text-sm text-text-secondary">Control de gastos e ingresos menores de la operación diaria</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" className="flex items-center gap-2" onClick={() => handleOpenMovement('ingreso')}>
            <ArrowUpRight size={16} className="text-success-text" />
            Registrar ingreso
          </Button>
          <Button variant="primary" className="flex items-center gap-2" onClick={() => handleOpenMovement('egreso')}>
            <ArrowDownRight size={16} />
            Registrar egreso
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card className="p-4">
          <span className="text-sm font-medium text-text-secondary">Ingresos (Mes actual)</span>
          <div className="flex items-center gap-2 mt-2">
            <ArrowUpRight size={18} className="text-success-text" />
            <h3 className="text-xl font-semibold text-text-primary">S/ 1,500.00</h3>
          </div>
        </Card>
        <Card className="p-4">
          <span className="text-sm font-medium text-text-secondary">Egresos (Mes actual)</span>
          <div className="flex items-center gap-2 mt-2">
            <ArrowDownRight size={18} className="text-danger-text" />
            <h3 className="text-xl font-semibold text-text-primary">S/ 450.00</h3>
          </div>
        </Card>
        <Card className="p-4 bg-surface-muted border-primary-accent/20">
          <span className="text-sm font-medium text-text-secondary">Saldo Actual</span>
          <div className="mt-2">
            <h3 className="text-xl font-semibold text-text-primary">S/ 1,050.00</h3>
          </div>
        </Card>
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
                placeholder="Buscar por concepto o comprobante..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full h-10 bg-surface border border-border-soft rounded-xl pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary-accent focus:ring-1 focus:ring-primary-accent transition-shadow"
              />
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 md:pb-0">
              <select className="h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent min-w-[140px]">
                <option value="">Tipo</option>
                <option value="ingreso">Ingreso</option>
                <option value="egreso">Egreso</option>
              </select>
              <select className="h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent min-w-[140px]">
                <option value="">Categoría</option>
                <option value="movilidad">Movilidad</option>
                <option value="oficina">Útiles de oficina</option>
                <option value="limpieza">Limpieza</option>
                <option value="otros">Otros</option>
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
                <th className="px-6 py-3 font-medium">Fecha</th>
                <th className="px-6 py-3 font-medium">Tipo</th>
                <th className="px-6 py-3 font-medium">Categoría</th>
                <th className="px-6 py-3 font-medium">Concepto</th>
                <th className="px-6 py-3 font-medium text-right">Monto</th>
                <th className="px-6 py-3 font-medium">Usuario</th>
                <th className="px-6 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-soft">
              {paginatedMovements.map((row, idx) => (
                <tr key={idx} className="hover:bg-surface-muted/50 transition-colors even:bg-surface-muted/30">
                  <td className="px-6 py-3 text-text-secondary whitespace-nowrap">{row.date}</td>
                  <td className="px-6 py-3">
                    <Badge variant={row.type === 'Ingreso' ? 'success' : 'neutral'}>{row.type}</Badge>
                  </td>
                  <td className="px-6 py-3 text-text-secondary">{row.cat}</td>
                  <td className="px-6 py-3 font-medium text-text-primary">{row.concept}</td>
                  <td className={`px-6 py-3 text-right font-medium ${row.type === 'Ingreso' ? 'text-success-text' : 'text-text-primary'}`}>
                    {row.type === 'Ingreso' ? '+' : '-'}{row.amount}
                  </td>
                  <td className="px-6 py-3 text-text-secondary">{row.user}</td>
                  <td className="px-6 py-3 text-right">
                    <ActionMenu 
                      items={[
                        { label: 'Ver detalle', onClick: () => {} },
                        { label: 'Ver comprobante', onClick: () => {} },
                        { label: 'Reversar movimiento', onClick: () => {}, danger: true },
                      ]} 
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="p-4 border-t border-border-soft flex items-center justify-between bg-surface">
          <span className="text-sm text-text-secondary">
            Mostrando {filteredMovements.length > 0 ? startIndex + 1 : 0} a {Math.min(endIndex, filteredMovements.length)} de {filteredMovements.length} registros
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

      {/* Registrar Movimiento Modal */}
      <Modal 
        isOpen={isNewMovementOpen} 
        onClose={() => setIsNewMovementOpen(false)} 
        title={`Registrar ${movementType === 'ingreso' ? 'Ingreso' : 'Egreso'} - Caja Chica`}
        size="md"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setIsNewMovementOpen(false)}>Cancelar</Button>
            <Button variant="primary">Guardar movimiento</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text-secondary">Fecha *</label>
              <input type="date" className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text-secondary">Categoría *</label>
              <select className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none">
                <option value="">Seleccionar...</option>
                {movementType === 'egreso' ? (
                  <>
                    <option value="movilidad">Movilidad</option>
                    <option value="oficina">Útiles de oficina</option>
                    <option value="limpieza">Limpieza</option>
                    <option value="otros">Otros gastos</option>
                  </>
                ) : (
                  <>
                    <option value="reposicion">Reposición de fondo</option>
                    <option value="devolucion">Devolución de sobrante</option>
                    <option value="otros">Otros ingresos</option>
                  </>
                )}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-secondary">Concepto *</label>
            <input type="text" className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none" placeholder={`Descripción del ${movementType}`} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text-secondary">Monto (PEN) *</label>
              <input type="number" className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none" placeholder="0.00" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text-secondary">Medio *</label>
              <select className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none">
                <option value="efectivo">Efectivo</option>
                <option value="transferencia">Transferencia</option>
                <option value="otros">Otros</option>
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-secondary">Comprobante / Referencia</label>
            <input type="text" className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none" placeholder="N° de boleta, recibo, etc." />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-secondary">Evidencia (Adjunto)</label>
            <div className="w-full h-24 border-2 border-dashed border-border-soft rounded-xl flex items-center justify-center text-sm text-text-muted hover:bg-surface-muted transition-colors cursor-pointer">
              Click para subir archivo o foto
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-secondary">Observaciones</label>
            <textarea className="w-full h-20 bg-surface border border-border-soft rounded-xl p-3 text-sm focus:border-primary-accent outline-none resize-none" placeholder="Notas adicionales..."></textarea>
          </div>
        </div>
      </Modal>
    </div>
  );
}
