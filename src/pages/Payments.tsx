import React, { useState, useEffect } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { ActionMenu } from '../components/ui/ActionMenu';
import { Search, Filter, Plus, FileText, Download, AlertTriangle, Image as ImageIcon } from 'lucide-react';
import { useTablePagination } from '../hooks/useTablePagination';
import { useData } from '../context/DataContext';
import { RegisterPaymentModal } from '../components/payments/RegisterPaymentModal';
import { documentLabel, parseReceipt } from '../utils/payments';

const norm = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const usd = (n: number) => `$ ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const todayISO = () => new Date().toISOString().slice(0, 10);

const METHOD_OPTIONS = [
  { value: 'Efectivo', label: 'Efectivo' },
  { value: 'Transferencia', label: 'Transferencia' },
  { value: 'Yape / Plin', label: 'Yape / Plin' },
  { value: 'Otros', label: 'Otros' },
];

export function Payments() {
  const { payments } = useData();
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

  // Pagos registrados en el sistema (matrículas y cobros de cuotas), con el formato de la tabla
  const allPayments = payments.map(p => {
    const doc = p.document ?? parseReceipt(p.receipt);
    return {
      id: p.id,
      date: p.date,
      compType: doc ? doc.type : 'Pago',
      compSerie: doc ? doc.serie.toUpperCase() : '',
      compNum: doc ? doc.number : (p.receipt && p.receipt !== 'S/N' ? p.receipt : 'S/N'),
      parts: p.parts ?? [],
      student: p.student,
      mat: p.enrollmentIds?.join(', ') || '—',
      method: p.method,
      amount: p.amount.toFixed(2),
      currency: p.currency ?? 'USD',
      status: p.status === 'Aprobado' ? 'Aplicado' : p.status,
      user: p.user ?? '—',
      comment: p.comment ?? p.concept,
    };
  });

  const filteredPayments = allPayments.filter(p => 
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

      {/* Registrar pago de cuota: mismo formulario que en Planes y cartera */}
      <RegisterPaymentModal isOpen={isNewPaymentOpen} onClose={() => setIsNewPaymentOpen(false)} />

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
                <span className="text-sm font-medium text-text-primary">
                  {selectedPayment.compSerie ? `${selectedPayment.compType} ${selectedPayment.compSerie}-${selectedPayment.compNum}` : selectedPayment.compNum}
                </span>
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

            {selectedPayment.parts.length > 0 && (
              <div>
                <span className="block text-sm font-medium text-text-secondary mb-2">Pago recibido</span>
                <div className="space-y-2">
                  {selectedPayment.parts.map((part: any, i: number) => (
                    <div key={part.id ?? i} className="border border-border-soft rounded-xl p-3 text-sm grid grid-cols-2 gap-x-4 gap-y-1">
                      <span className="font-medium text-text-primary">{part.method}</span>
                      <span className="text-right font-medium text-text-primary">
                        {part.currency === 'PEN' ? `S/ ${part.amount.toFixed(2)}` : `$ ${part.amount.toFixed(2)}`}
                        {part.currency === 'PEN' && part.exchangeRate ? <span className="text-text-muted font-normal"> · TC {part.exchangeRate}</span> : null}
                      </span>
                      {part.bank && <span className="text-text-secondary">Banco: {part.bank}</span>}
                      {part.operationNumber && <span className="text-text-secondary text-right">Operación: {part.operationNumber}</span>}
                      {part.evidence && <span className="text-text-muted text-xs col-span-2 truncate">Evidencia: {part.evidence}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

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
