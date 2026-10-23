import React, { useState, useEffect } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { ActionMenu } from '../components/ui/ActionMenu';
import { Search, Filter, Download, FileText, AlertTriangle, Calendar, DollarSign, History, ArrowRight } from 'lucide-react';
import { useTablePagination } from '../hooks/useTablePagination';
import { useData } from '../context/DataContext';
import { RegisterPaymentModal } from '../components/payments/RegisterPaymentModal';
import { DateInput } from '../components/ui/DateInput';
import { useSearchParams } from 'react-router-dom';
import { EnrollmentFichaModal } from '../components/enrollment/EnrollmentFichaModal';

export function Plans() {
  const { plans, refinanceInstallment } = useData();
  const [searchParams, setSearchParams] = useSearchParams();
  // Ficha de la matrícula del plan (Ver detalles de matrícula)
  const [fichaFor, setFichaFor] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<any>(null);
  const [selectedInstallment, setSelectedInstallment] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // UI States
  const [isPlanDetailOpen, setIsPlanDetailOpen] = useState(false);
  const [isInstallmentDetailOpen, setIsInstallmentDetailOpen] = useState(false);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [isRefinanceOpen, setIsRefinanceOpen] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = useTablePagination();

  const filteredPlans = plans.filter(p => 
    p.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.titular.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.mat.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPages = Math.ceil(filteredPlans.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedPlans = filteredPlans.slice(startIndex, endIndex);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  // Form States
  const [refinanceForm, setRefinanceForm] = useState({
    name: '',
    amount: 0,
    dueDate: new Date().toISOString().split('T')[0],
    reason: ''
  });

  // ?plan=PLN-… abre directamente el cronograma de ese plan (desde Matrículas → Ver plan)
  useEffect(() => {
    const id = searchParams.get('plan');
    if (!id) return;
    const target = plans.find(p => p.id === id);
    if (target) { setSelectedPlan(target); setIsPlanDetailOpen(true); }
    const next = new URLSearchParams(searchParams);
    next.delete('plan');
    setSearchParams(next, { replace: true });
  }, [searchParams, plans]);

  const handleOpenPlanDetail = (plan: any) => {
    setSelectedPlan(plan);
    setIsPlanDetailOpen(true);
  };

  const handleOpenInstallmentDetail = (installment: any) => {
    setSelectedInstallment(installment);
    setIsInstallmentDetailOpen(true);
  };

  const handleOpenPayment = (installment: any) => {
    setSelectedInstallment(installment);
    setIsPaymentOpen(true);
  };

  const handleOpenRefinance = (installment: any) => {
    setSelectedInstallment(installment);
    setRefinanceForm({
      ...refinanceForm,
      amount: installment.balance
    });
    setIsRefinanceOpen(true);
  };

  const handleRefinance = () => {
    if (selectedPlan && selectedInstallment) {
      refinanceInstallment(selectedPlan.id, selectedInstallment.id, refinanceForm);
      setIsRefinanceOpen(false);
      setIsPlanDetailOpen(false);
    }
  };

  const getInstallmentBadge = (status: string) => {
    switch (status) {
      case 'Pagada': return 'success';
      case 'Pendiente': return 'neutral';
      case 'Parcial': return 'warning';
      case 'Vencida': return 'danger';
      case 'Refinanciada': return 'info';
      case 'Anulada': return 'neutral';
      default: return 'neutral';
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-text-primary mb-1">Planes y cartera</h2>
          <p className="text-sm text-text-secondary">Seguimiento financiero, cronogramas y refinanciaciones</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" className="hidden sm:flex items-center gap-2">
            <Download size={16} />
            Exportar Cartera
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
                placeholder="Buscar por código de plan, matrícula o titular..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full h-10 bg-surface border border-border-soft rounded-xl pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary-accent focus:ring-1 focus:ring-primary-accent transition-shadow"
              />
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 md:pb-0">
              <select className="h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent min-w-[140px]">
                <option value="">Estado Plan</option>
                <option value="al-dia">Al día</option>
                <option value="atrasado">Atrasado</option>
              </select>
              <select className="h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent min-w-[140px]">
                <option value="">Tipo de Pago</option>
                <option value="contado">Contado</option>
                <option value="cuotas">Cuotas</option>
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
                <th className="px-6 py-3 font-medium">Plan / Matrícula</th>
                <th className="px-6 py-3 font-medium">Titular</th>
                <th className="px-6 py-3 font-medium text-right">Total</th>
                <th className="px-6 py-3 font-medium text-right">Saldo</th>
                <th className="px-6 py-3 font-medium">Próxima Cuota</th>
                <th className="px-6 py-3 font-medium">Estado</th>
                <th className="px-6 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-soft">
              {paginatedPlans.map((row) => (
                <tr key={row.id} className="hover:bg-surface-muted/50 transition-colors even:bg-surface-muted/30">
                  <td className="px-6 py-3 whitespace-nowrap text-sm">
                    <div className="font-medium text-text-primary">{row.id}</div>
                    <div className="text-xs text-text-muted">{row.mat}</div>
                  </td>
                  <td className="px-6 py-3 text-sm text-text-primary">{row.titular}</td>
                  <td className="px-6 py-3 text-sm font-medium text-text-primary text-right">$ {row.total.toFixed(2)}</td>
                  <td className="px-6 py-3 text-sm font-medium text-text-primary text-right">$ {row.balance.toFixed(2)}</td>
                  <td className={`px-6 py-3 text-sm ${row.status === 'Atrasado' ? 'text-danger-text font-medium' : 'text-text-secondary'}`}>
                    {row.next} {row.status === 'Atrasado' && '(Vencida)'}
                  </td>
                  <td className="px-6 py-3 text-sm">
                    <Badge variant={row.status === 'Al día' ? 'success' : row.status === 'Completado' ? 'info' : 'danger'}>{row.status}</Badge>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <ActionMenu 
                      items={[
                        { label: 'Ver cronograma (Cuotas)', onClick: () => handleOpenPlanDetail(row) },
                        { label: 'Ver detalles de matrícula', onClick: () => setFichaFor(row.mat) },
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
            Mostrando {filteredPlans.length > 0 ? startIndex + 1 : 0} a {Math.min(endIndex, filteredPlans.length)} de {filteredPlans.length} registros
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

      <EnrollmentFichaModal enrollmentId={fichaFor} onClose={() => setFichaFor(null)} />

      {/* Modal: Detalle del Plan y Cronograma */}
      <Modal
        isOpen={isPlanDetailOpen}
        onClose={() => setIsPlanDetailOpen(false)}
        title="Cronograma de Pagos"
        size="lg"
      >
        {selectedPlan && (
          <div className="space-y-6">
            {/* Resumen del Plan */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-surface-muted p-4 rounded-xl border border-border-soft">
              <div>
                <span className="block text-xs text-text-muted mb-1">Plan</span>
                <span className="text-sm font-medium text-text-primary">{selectedPlan.id}</span>
              </div>
              <div>
                <span className="block text-xs text-text-muted mb-1">Matrícula</span>
                <span className="text-sm font-medium text-text-primary">{selectedPlan.mat}</span>
              </div>
              <div>
                <span className="block text-xs text-text-muted mb-1">Total del Plan</span>
                <span className="text-sm font-medium text-text-primary">$ {selectedPlan.total.toFixed(2)}</span>
              </div>
              <div>
                <span className="block text-xs text-text-muted mb-1">Saldo Pendiente</span>
                <span className="text-sm font-bold text-danger-text">$ {selectedPlan.balance.toFixed(2)}</span>
              </div>
            </div>

            {/* Lista de Cuotas */}
            <div>
              <h3 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
                <Calendar size={16} className="text-text-muted" />
                Cuotas del Plan
              </h3>
              <div className="border border-border-soft rounded-xl overflow-hidden">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-text-secondary uppercase bg-surface-muted/50">
                    <tr>
                      <th className="px-4 py-3 font-medium">Cuota</th>
                      <th className="px-4 py-3 font-medium">Vencimiento</th>
                      <th className="px-4 py-3 font-medium text-right">Monto</th>
                      <th className="px-4 py-3 font-medium text-right">Saldo</th>
                      <th className="px-4 py-3 font-medium">Estado</th>
                      <th className="px-4 py-3 font-medium text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-soft">
                    {selectedPlan.installments.map((inst: any) => (
                      <tr key={inst.id} className="hover:bg-surface-muted/50 transition-colors">
                        <td className="px-4 py-3 font-medium text-text-primary">{inst.name}{inst.variable && <span className="block text-[11px] font-normal text-text-muted">Monto variable: se define al cobrar</span>}</td>
                        <td className={`px-4 py-3 ${inst.status === 'Vencida' ? 'text-danger-text font-medium' : 'text-text-secondary'}`}>{inst.dueDate}</td>
                        <td className="px-4 py-3 text-right text-text-primary">$ {inst.amount.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right font-medium text-text-primary">$ {inst.balance.toFixed(2)}</td>
                        <td className="px-4 py-3">
                          <Badge variant={getInstallmentBadge(inst.status)}>{inst.status}</Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button variant="secondary" className="px-2 py-1 h-auto text-xs" onClick={() => handleOpenInstallmentDetail(inst)}>
                            Detalle
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal: Detalle de Cuota */}
      <Modal
        isOpen={isInstallmentDetailOpen}
        onClose={() => setIsInstallmentDetailOpen(false)}
        title="Detalle de Cuota"
        size="md"
        footer={
          <div className="flex justify-between items-center w-full">
            <Button variant="ghost" onClick={() => setIsInstallmentDetailOpen(false)}>Cerrar</Button>
            <div className="flex gap-2">
              {selectedInstallment?.status !== 'Pagada' && selectedInstallment?.status !== 'Refinanciada' && selectedInstallment?.status !== 'Anulada' && (
                <>
                  <Button variant="secondary" onClick={() => { setIsInstallmentDetailOpen(false); handleOpenRefinance(selectedInstallment); }}>
                    Refinanciar
                  </Button>
                  <Button variant="primary" onClick={() => { setIsInstallmentDetailOpen(false); handleOpenPayment(selectedInstallment); }}>
                    Registrar Pago
                  </Button>
                </>
              )}
            </div>
          </div>
        }
      >
        {selectedInstallment && (
          <div className="space-y-6">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-xl font-semibold text-text-primary">{selectedInstallment.name}</h3>
                <p className="text-sm text-text-secondary">Vencimiento: {selectedInstallment.dueDate}</p>
              </div>
              <Badge variant={getInstallmentBadge(selectedInstallment.status)}>{selectedInstallment.status}</Badge>
            </div>

            <div className="grid grid-cols-2 gap-4 bg-surface-muted p-4 rounded-xl border border-border-soft">
              <div>
                <span className="block text-xs text-text-muted mb-1">Monto Original</span>
                <span className="text-sm font-medium text-text-primary">$ {selectedInstallment.amount.toFixed(2)}</span>
              </div>
              <div>
                <span className="block text-xs text-text-muted mb-1">Saldo Pendiente</span>
                <span className={`text-sm font-bold ${selectedInstallment.balance > 0 ? 'text-danger-text' : 'text-success-text'}`}>
                  $ {selectedInstallment.balance.toFixed(2)}
                </span>
              </div>
            </div>

            {selectedInstallment.status === 'Parcial' && (
              <div className="bg-warning-tint/50 border border-warning-text/20 rounded-xl p-3 flex gap-2 text-sm text-warning-text">
                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                <p>Esta cuota tiene pagos parciales. El saldo debe regularizarse antes del próximo vencimiento. Máximo 2 pagos parciales permitidos.</p>
              </div>
            )}

            <div>
              <h4 className="text-sm font-medium text-text-primary mb-3 flex items-center gap-2">
                <History size={16} className="text-text-muted" />
                Pagos Registrados
              </h4>
              {selectedInstallment.payments && selectedInstallment.payments.length > 0 ? (
                <div className="border border-border-soft rounded-xl overflow-hidden">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-text-secondary uppercase bg-surface-muted/50">
                      <tr>
                        <th className="px-3 py-2 font-medium">Fecha</th>
                        <th className="px-3 py-2 font-medium">Comprobante</th>
                        <th className="px-3 py-2 font-medium text-right">Monto</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-soft">
                      {selectedInstallment.payments.map((payment: any) => (
                        <tr key={payment.id}>
                          <td className="px-3 py-2 text-text-secondary">{payment.date}</td>
                          <td className="px-3 py-2 text-text-primary">{payment.receipt}</td>
                          <td className="px-3 py-2 text-right font-medium text-success-text">+ $ {payment.amount.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-text-muted italic bg-surface-muted p-3 rounded-xl border border-border-soft text-center">
                  No hay pagos registrados para esta cuota.
                </p>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Modal: Registrar Pago (el mismo formulario que en Pagos y que en la matrícula) */}
      <RegisterPaymentModal
        isOpen={isPaymentOpen}
        onClose={() => setIsPaymentOpen(false)}
        onSaved={() => setIsPlanDetailOpen(false)}
        initialPlanId={selectedPlan?.id}
        initialInstallmentId={selectedInstallment?.id}
      />

      {/* Modal: Refinanciación / Nueva versión de plan */}
      <Modal
        isOpen={isRefinanceOpen}
        onClose={() => setIsRefinanceOpen(false)}
        title="Refinanciar Cuota"
        size="md"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setIsRefinanceOpen(false)}>Cancelar</Button>
            <Button variant="primary" onClick={handleRefinance}>Crear nueva versión de plan</Button>
          </div>
        }
      >
        {selectedInstallment && (
          <div className="space-y-4">
            <div className="bg-info-tint/50 border border-info-text/20 rounded-xl p-3 flex gap-2 text-sm text-info-text mb-2">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <p>La refinanciación anulará las cuotas futuras no ejecutadas y creará una nueva versión del plan de pagos. Esta acción notificará al superadministrador.</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text-secondary">Cuota origen (Solo lectura)</label>
              <input type="text" className="w-full h-10 bg-surface-muted border border-border-soft rounded-xl px-3 text-sm text-text-muted outline-none cursor-not-allowed" value={`${selectedInstallment.name} - Saldo: $ ${selectedInstallment.balance.toFixed(2)}`} disabled />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text-secondary">Motivo de refinanciación *</label>
              <textarea value={refinanceForm.reason} onChange={e => setRefinanceForm({...refinanceForm, reason: e.target.value})} className="w-full h-20 bg-surface border border-border-soft rounded-xl p-3 text-sm focus:border-primary-accent outline-none resize-none" placeholder="Explique el motivo por el cual el alumno solicita la refinanciación..."></textarea>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text-secondary">Nombre nueva cuota *</label>
                <input type="text" value={refinanceForm.name} onChange={e => setRefinanceForm({...refinanceForm, name: e.target.value})} className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none" placeholder="Ej: Cuota extraordinaria 1" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text-secondary">Monto nueva cuota *</label>
                <input type="number" value={refinanceForm.amount} onChange={e => setRefinanceForm({...refinanceForm, amount: parseFloat(e.target.value)})} className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none" placeholder="0.00" />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text-secondary">Nueva fecha de vencimiento *</label>
              <DateInput value={refinanceForm.dueDate} onChange={e => setRefinanceForm({...refinanceForm, dueDate: e.target.value})} className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none" />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text-secondary">Observaciones</label>
              <textarea className="w-full h-20 bg-surface border border-border-soft rounded-xl p-3 text-sm focus:border-primary-accent outline-none resize-none" placeholder="Condiciones adicionales del acuerdo..."></textarea>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
