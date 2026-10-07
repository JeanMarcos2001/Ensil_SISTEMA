import React, { useState, useEffect } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { ActionMenu } from '../components/ui/ActionMenu';
import { Search, Filter, Plus, FileText, Download, AlertTriangle, Image as ImageIcon } from 'lucide-react';
import { useTablePagination } from '../hooks/useTablePagination';

export function Payments() {
  const [isNewPaymentOpen, setIsNewPaymentOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isReverseOpen, setIsReverseOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = useTablePagination();

  const handleOpenDetail = (payment: any) => {
    setSelectedPayment(payment);
    setIsDetailOpen(true);
  };

  const handleOpenReverse = (payment: any) => {
    setSelectedPayment(payment);
    setIsReverseOpen(true);
  };

  const mockPayments = [
    { id: 1, date: '15 Mar 2024', compType: 'Boleta', compSerie: 'B001', compNum: '000452', student: 'Juan Pérez', mat: 'MAT-2024-001', method: 'Transferencia', amount: '450.00', currency: 'PEN', status: 'Aplicado', user: 'Ana G.', comment: 'Pago de primera cuota' },
    { id: 2, date: '14 Mar 2024', compType: 'Factura', compSerie: 'F001', compNum: '000128', student: 'María Castro', mat: 'MAT-2024-002', method: 'Efectivo', amount: '950.00', currency: 'PEN', status: 'Aplicado', user: 'Carlos R.', comment: 'Pago al contado' },
    { id: 3, date: '14 Mar 2024', compType: 'Boleta', compSerie: 'B001', compNum: '000451', student: 'Carlos Ruiz', mat: 'MAT-2024-003', method: 'Yape', amount: '300.00', currency: 'PEN', status: 'Reversado', user: 'Admin', comment: 'Error en monto' },
  ];

  const filteredPayments = mockPayments.filter(p => 
    p.student.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.mat.toLowerCase().includes(searchTerm.toLowerCase()) ||
    `${p.compSerie}-${p.compNum}`.includes(searchTerm)
  );

  const totalPages = Math.ceil(filteredPayments.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedPayments = filteredPayments.slice(startIndex, endIndex);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-text-primary mb-1">Pagos</h2>
          <p className="text-sm text-text-secondary">Registro y control de comprobantes de pago</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" className="hidden sm:flex items-center gap-2">
            <Download size={16} />
            Exportar
          </Button>
          <Button variant="primary" className="flex items-center gap-2" onClick={() => setIsNewPaymentOpen(true)}>
            <Plus size={16} />
            Registrar pago
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
                placeholder="Buscar por alumno, comprobante o matrícula..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full h-10 bg-surface border border-border-soft rounded-xl pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary-accent focus:ring-1 focus:ring-primary-accent transition-shadow"
              />
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 md:pb-0">
              <select className="h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent min-w-[140px]">
                <option value="">Medio de pago</option>
                <option value="efectivo">Efectivo</option>
                <option value="transferencia">Transferencia</option>
                <option value="yape">Yape/Plin</option>
              </select>
              <select className="h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent min-w-[140px]">
                <option value="">Estado</option>
                <option value="aplicado">Aplicado</option>
                <option value="reversado">Reversado</option>
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
                <th className="px-6 py-3 font-medium">Comprobante</th>
                <th className="px-6 py-3 font-medium">Alumno / Matrícula</th>
                <th className="px-6 py-3 font-medium">Medio</th>
                <th className="px-6 py-3 font-medium text-right">Monto</th>
                <th className="px-6 py-3 font-medium">Estado</th>
                <th className="px-6 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-soft">
              {paginatedPayments.map((row) => (
                <tr key={row.id} className="hover:bg-surface-muted/50 transition-colors even:bg-surface-muted/30">
                  <td className="px-6 py-3 text-text-secondary whitespace-nowrap">{row.date}</td>
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-2">
                      <FileText size={14} className="text-text-muted" />
                      <span className="font-medium text-text-primary">{row.compType} {row.compSerie}-{row.compNum}</span>
                    </div>
                  </td>
                  <td className="px-6 py-3">
                    <div className="font-medium text-text-primary">{row.student}</div>
                    <div className="text-xs text-text-muted">{row.mat}</div>
                  </td>
                  <td className="px-6 py-3 text-text-secondary">{row.method}</td>
                  <td className="px-6 py-3 text-right font-medium text-text-primary">{row.currency === 'PEN' ? 'S/' : '$'} {row.amount}</td>
                  <td className="px-6 py-3">
                    <Badge variant={row.status === 'Aplicado' ? 'success' : 'neutral'}>{row.status}</Badge>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <ActionMenu 
                      items={[
                        { label: 'Ver detalle', onClick: () => handleOpenDetail(row) },
                        { label: 'Ver comprobante (Foto)', onClick: () => {} },
                        { label: 'Ir a matrícula', onClick: () => {} },
                        ...(row.status === 'Aplicado' ? [{ label: 'Reversar pago', onClick: () => handleOpenReverse(row), danger: true }] : []),
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
            Mostrando {filteredPayments.length > 0 ? startIndex + 1 : 0} a {Math.min(endIndex, filteredPayments.length)} de {filteredPayments.length} registros
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

      {/* Registrar Pago Modal */}
      <Modal 
        isOpen={isNewPaymentOpen} 
        onClose={() => setIsNewPaymentOpen(false)} 
        title="Registrar Nuevo Pago"
        size="md"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setIsNewPaymentOpen(false)}>Cancelar</Button>
            <Button variant="primary">Guardar y aplicar</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="bg-primary-accent/10 border border-primary-accent/20 rounded-xl p-3 text-sm text-primary-accent flex gap-2">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <p>El pago se aplicará a la cuota seleccionada y generará un movimiento en caja automáticamente.</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-secondary">Matrícula *</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
              <input type="text" className="w-full h-10 bg-surface border border-border-soft rounded-xl pl-9 pr-3 text-sm focus:border-primary-accent outline-none" placeholder="Buscar matrícula o alumno..." />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-secondary">Cuota a aplicar *</label>
            <select className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none">
              <option value="">Seleccione una matrícula primero</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text-secondary">Fecha de pago *</label>
              <input type="date" className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text-secondary">Moneda *</label>
              <select className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none">
                <option value="PEN">PEN (Soles)</option>
                <option value="USD">USD (Dólares)</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text-secondary">Monto *</label>
              <input type="number" className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none" placeholder="0.00" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text-secondary">Medio de pago *</label>
              <select className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none">
                <option value="efectivo">Efectivo</option>
                <option value="transferencia">Transferencia</option>
                <option value="yape">Yape / Plin</option>
                <option value="otros">Otros</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text-secondary">Tipo comprob. *</label>
              <select className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none">
                <option value="boleta">Boleta</option>
                <option value="factura">Factura</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text-secondary">Serie *</label>
              <input type="text" className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none uppercase" placeholder="B001" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text-secondary">Número *</label>
              <input type="text" className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none" placeholder="000123" />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-secondary">Foto del comprobante *</label>
            <div className="w-full h-32 border-2 border-dashed border-border-soft rounded-xl flex flex-col items-center justify-center text-sm text-text-muted hover:bg-surface-muted transition-colors cursor-pointer gap-2">
              <ImageIcon size={24} className="text-text-muted opacity-50" />
              <span>Click para subir imagen (Obligatorio)</span>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-secondary">Comentario</label>
            <textarea className="w-full h-20 bg-surface border border-border-soft rounded-xl p-3 text-sm focus:border-primary-accent outline-none resize-none" placeholder="Detalles adicionales..."></textarea>
          </div>
        </div>
      </Modal>

      {/* Detalle de Pago Modal */}
      <Modal 
        isOpen={isDetailOpen} 
        onClose={() => setIsDetailOpen(false)} 
        title="Detalle de Pago"
        size="md"
        footer={
          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => setIsDetailOpen(false)}>Cerrar</Button>
          </div>
        }
      >
        {selectedPayment && (
          <div className="space-y-6">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-xl font-semibold text-text-primary">{selectedPayment.currency === 'PEN' ? 'S/' : '$'} {selectedPayment.amount}</h3>
                <p className="text-sm text-text-secondary">{selectedPayment.date}</p>
              </div>
              <Badge variant={selectedPayment.status === 'Aplicado' ? 'success' : 'neutral'}>{selectedPayment.status}</Badge>
            </div>

            <div className="grid grid-cols-2 gap-4 bg-surface-muted p-4 rounded-xl border border-border-soft">
              <div>
                <span className="block text-xs text-text-muted mb-1">Comprobante</span>
                <span className="text-sm font-medium text-text-primary">{selectedPayment.compType} {selectedPayment.compSerie}-{selectedPayment.compNum}</span>
              </div>
              <div>
                <span className="block text-xs text-text-muted mb-1">Medio de pago</span>
                <span className="text-sm font-medium text-text-primary">{selectedPayment.method}</span>
              </div>
              <div>
                <span className="block text-xs text-text-muted mb-1">Alumno</span>
                <span className="text-sm font-medium text-text-primary">{selectedPayment.student}</span>
              </div>
              <div>
                <span className="block text-xs text-text-muted mb-1">Matrícula</span>
                <span className="text-sm font-medium text-text-primary">{selectedPayment.mat}</span>
              </div>
            </div>

            <div>
              <span className="block text-sm font-medium text-text-secondary mb-2">Comentario</span>
              <p className="text-sm text-text-primary bg-surface border border-border-soft p-3 rounded-xl">
                {selectedPayment.comment || 'Sin comentarios'}
              </p>
            </div>

            <div>
              <span className="block text-sm font-medium text-text-secondary mb-2">Evidencia adjunta</span>
              <div className="w-full h-48 bg-surface-muted border border-border-soft rounded-xl flex items-center justify-center">
                <ImageIcon size={32} className="text-text-muted opacity-30" />
                <span className="ml-2 text-sm text-text-muted">Vista previa no disponible</span>
              </div>
            </div>

            <div className="pt-4 border-t border-border-soft text-xs text-text-muted flex justify-between">
              <span>Registrado por: {selectedPayment.user}</span>
              <span>ID: {selectedPayment.id}</span>
            </div>
          </div>
        )}
      </Modal>

      {/* Reversar Pago Modal */}
      <Modal
        isOpen={isReverseOpen}
        onClose={() => setIsReverseOpen(false)}
        title="Reversar Pago"
        size="md"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setIsReverseOpen(false)}>Cancelar</Button>
            <Button variant="primary" className="bg-danger-tint text-danger-text hover:bg-danger-tint/80 border-none">Confirmar reversa</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="bg-danger-tint/50 border border-danger-text/20 rounded-xl p-4 flex gap-3">
            <AlertTriangle size={20} className="text-danger-text shrink-0" />
            <div className="text-sm text-danger-text">
              <p className="font-semibold mb-1">¿Estás seguro de reversar este pago?</p>
              <p>Esta acción anulará el pago, devolverá la cuota a estado pendiente y registrará un movimiento de salida en caja. Esta acción requiere permisos especiales y quedará auditada.</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-secondary">Motivo de la reversa *</label>
            <textarea 
              className="w-full h-24 bg-surface border border-border-soft rounded-xl p-3 text-sm focus:border-danger-text outline-none resize-none" 
              placeholder="Explica detalladamente por qué se está reversando este pago..."
            ></textarea>
          </div>
        </div>
      </Modal>
    </div>
  );
}
