import React, { useState, useEffect } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { ActionMenu } from '../components/ui/ActionMenu';
import { Search, Filter, Plus, FileText, Download, AlertTriangle, Image as ImageIcon } from 'lucide-react';
import { useTablePagination } from '../hooks/useTablePagination';
import { useData } from '../context/DataContext';

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
  const { plans, enrollments, payments, registerPayment } = useData();
  const [isNewPaymentOpen, setIsNewPaymentOpen] = useState(false);

  // ---- Formulario «Registrar pago»
  const [planQuery, setPlanQuery] = useState('');
  const [planId, setPlanId] = useState('');
  const [installmentId, setInstallmentId] = useState('');
  const [payDate, setPayDate] = useState(todayISO());
  const [payCurrency, setPayCurrency] = useState<'PEN' | 'USD'>('USD');
  const [payTC, setPayTC] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('Efectivo');
  const [docType, setDocType] = useState<'Boleta' | 'Factura'>('Boleta');
  const [docSerie, setDocSerie] = useState('');
  const [docNumber, setDocNumber] = useState('');
  const [evidence, setEvidence] = useState('');
  const [payComment, setPayComment] = useState('');
  const [payError, setPayError] = useState<string | null>(null);

  const resetPaymentForm = () => {
    setPlanQuery(''); setPlanId(''); setInstallmentId(''); setPayDate(todayISO()); setPayCurrency('USD'); setPayTC('');
    setPayAmount(''); setPayMethod('Efectivo'); setDocType('Boleta'); setDocSerie(''); setDocNumber(''); setEvidence('');
    setPayComment(''); setPayError(null);
  };

  useEffect(() => {
    if (isNewPaymentOpen) resetPaymentForm();
  }, [isNewPaymentOpen]);

  // Todas las matrículas que figuran en Planes y cartera (cada una con su plan)
  const planOptions = plans.map(plan => {
    const enrollment = enrollments.find(e => e.id === plan.mat);
    return { plan, student: enrollment?.student ?? plan.titular, enrollment };
  });
  const q = norm(planQuery.trim());
  const planMatches = planOptions
    .filter(o => !q || norm(`${o.plan.mat} ${o.plan.id} ${o.student} ${o.plan.titular}`).includes(q))
    .sort((a, b) => Number(b.plan.balance > 0) - Number(a.plan.balance > 0))
    .slice(0, 8);
  const selectedPlan = plans.find(p => p.id === planId);
  const selectedPlanInfo = planOptions.find(o => o.plan.id === planId);
  const payableInstallments = (selectedPlan?.installments ?? []).filter((i: any) => i.balance > 0 && i.status !== 'Refinanciada');
  const selectedInstallment = payableInstallments.find((i: any) => i.id === installmentId);
  // En cronogramas de monto variable (Contado en 2 partes) lo adeudado al cobrar es el saldo del plan
  const owed = selectedInstallment ? (selectedInstallment.variable ? selectedPlan!.balance : selectedInstallment.balance) : 0;
  const tcNumber = parseFloat(payTC);
  const amountNumber = parseFloat(payAmount);
  const equivalentUSD = payCurrency === 'USD' ? amountNumber : amountNumber / tcNumber;

  const pickPlan = (id: string) => {
    const plan = plans.find(p => p.id === id);
    setPlanId(id);
    setPlanQuery('');
    setPayError(null);
    const first = plan?.installments.find((i: any) => i.balance > 0 && i.status !== 'Refinanciada');
    setInstallmentId(first ? first.id : '');
    setPayAmount('');
  };

  const fillBalance = () => {
    if (!owed) return;
    if (payCurrency === 'USD') setPayAmount(owed.toFixed(2));
    else if (tcNumber > 0) setPayAmount((owed * tcNumber).toFixed(2));
  };

  const handleSavePayment = () => {
    setPayError(null);
    if (!selectedPlan || !selectedInstallment) { setPayError('Seleccione la matrícula y la cuota a la que se aplicará el pago.'); return; }
    if (!payDate || payDate > todayISO()) { setPayError('La fecha de pago es obligatoria y no puede ser futura.'); return; }
    if (!(amountNumber > 0)) { setPayError('Ingrese un monto mayor a 0.'); return; }
    if (payCurrency === 'PEN' && !(tcNumber > 0)) { setPayError('Indique el tipo de cambio (TC) para pagos en soles.'); return; }
    if (equivalentUSD > owed + 0.01) { setPayError(`El monto equivale a ${usd(equivalentUSD)} y supera el saldo de ${usd(owed)}.`); return; }
    const serie = docSerie.trim().toUpperCase();
    const prefix = docType === 'Boleta' ? 'B' : 'F';
    if (!serie || !docNumber.trim()) { setPayError('Ingrese la serie y el número del comprobante.'); return; }
    if (!serie.startsWith(prefix)) { setPayError(`La serie de una ${docType.toLowerCase()} debe comenzar con «${prefix}».`); return; }
    if (!evidence) { setPayError('Adjunte la foto del comprobante.'); return; }

    const result = registerPayment(selectedPlan.id, selectedInstallment.id, {
      date: payDate,
      amount: Math.round(equivalentUSD * 100) / 100, // la deuda es en USD
      currency: payCurrency,
      exchangeRate: payCurrency === 'PEN' ? tcNumber : undefined,
      originalAmount: payCurrency === 'PEN' ? amountNumber : undefined,
      method: payMethod,
      receipt: `${serie}-${docNumber.trim()}`,
      evidence,
      note: payComment.trim(),
    });
    if (!result.ok) { setPayError(result.error || 'No se pudo registrar el pago.'); return; }
    setIsNewPaymentOpen(false);
  };
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
    const [serie = '', ...rest] = (p.receipt || '').split('-');
    const isDoc = rest.length > 0 && /^[BF]\d*/i.test(serie);
    return {
      id: p.id,
      date: p.date,
      compType: isDoc ? (serie.toUpperCase().startsWith('F') ? 'Factura' : 'Boleta') : 'Pago',
      compSerie: isDoc ? serie.toUpperCase() : '',
      compNum: isDoc ? rest.join('-') : (p.receipt && p.receipt !== 'S/N' ? p.receipt : 'S/N'),
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

      {/* Registrar Pago Modal */}
      <Modal
        isOpen={isNewPaymentOpen}
        onClose={() => setIsNewPaymentOpen(false)}
        title="Registrar Nuevo Pago"
        size="md"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setIsNewPaymentOpen(false)}>Cancelar</Button>
            <Button variant="primary" onClick={handleSavePayment}>Guardar y aplicar</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="bg-primary-accent/10 border border-primary-accent/20 rounded-xl p-3 text-sm text-primary-accent flex gap-2">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <p>El pago se aplicará a la cuota seleccionada del plan (Planes y cartera) y generará un movimiento en caja automáticamente.</p>
          </div>

          {payError && (
            <div className="bg-danger-tint border border-danger-text/20 rounded-xl p-3 text-sm text-danger-text flex gap-2">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <p>{payError}</p>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-secondary">Matrícula *</label>
            {selectedPlan ? (
              <div className="flex items-start justify-between gap-3 bg-surface-muted border border-border-soft rounded-xl p-3">
                <div className="text-sm">
                  <p className="font-semibold text-text-primary">{selectedPlanInfo?.student}</p>
                  <p className="text-text-secondary">{selectedPlan.mat} · {selectedPlan.id} · {selectedPlan.type}</p>
                  <p className="text-xs text-text-muted">Saldo del plan: {usd(selectedPlan.balance)} de {usd(selectedPlan.total)}</p>
                </div>
                <button
                  type="button"
                  className="text-xs text-primary-accent hover:underline shrink-0"
                  onClick={() => { setPlanId(''); setInstallmentId(''); setPayAmount(''); }}
                >
                  Cambiar
                </button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
                  <input
                    type="text"
                    value={planQuery}
                    onChange={e => setPlanQuery(e.target.value)}
                    className="w-full h-10 bg-surface border border-border-soft rounded-xl pl-9 pr-3 text-sm focus:border-primary-accent outline-none"
                    placeholder="Buscar por alumno, titular, matrícula o plan..."
                  />
                </div>
                <div className="border border-border-soft rounded-xl overflow-hidden bg-surface max-h-56 overflow-y-auto">
                  {planMatches.map(o => {
                    const hasBalance = o.plan.balance > 0;
                    return (
                      <button
                        key={o.plan.id}
                        type="button"
                        disabled={!hasBalance}
                        onClick={() => pickPlan(o.plan.id)}
                        className={`w-full text-left px-3 py-2 text-sm border-b border-border-soft last:border-0 ${
                          hasBalance ? 'hover:bg-surface-muted' : 'opacity-50 cursor-not-allowed'
                        }`}
                      >
                        <span className="font-medium text-text-primary">{o.student}</span>
                        <span className="text-text-muted"> · {o.plan.mat} · {o.plan.type}</span>
                        <span className={`block text-xs ${hasBalance ? 'text-danger-text' : 'text-text-muted'}`}>
                          {hasBalance ? `Saldo pendiente ${usd(o.plan.balance)}` : 'Sin saldo pendiente'}
                        </span>
                      </button>
                    );
                  })}
                  {planMatches.length === 0 && (
                    <p className="px-3 py-3 text-xs text-text-muted">
                      No hay matrículas con plan que coincidan. Solo se pagan matrículas registradas en Planes y cartera.
                    </p>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-secondary">Cuota a aplicar *</label>
            <select
              value={installmentId}
              disabled={!selectedPlan || payableInstallments.length === 0}
              onChange={e => { setInstallmentId(e.target.value); setPayAmount(''); }}
              className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none disabled:bg-surface-muted disabled:text-text-muted"
            >
              {!selectedPlan && <option value="">Seleccione una matrícula primero</option>}
              {selectedPlan && payableInstallments.length === 0 && <option value="">El plan no tiene cuotas con saldo</option>}
              {payableInstallments.map((i: any) => (
                <option key={i.id} value={i.id}>
                  {i.name} · vence {i.dueDate} · {i.variable ? `monto variable (saldo del plan ${usd(selectedPlan!.balance)})` : `saldo ${usd(i.balance)}`}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text-secondary">Fecha de pago *</label>
              <input type="date" max={todayISO()} value={payDate} onChange={e => setPayDate(e.target.value)} className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text-secondary">Moneda *</label>
              <select value={payCurrency} onChange={e => { setPayCurrency(e.target.value as 'PEN' | 'USD'); setPayAmount(''); }} className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none">
                <option value="USD">USD (Dólares)</option>
                <option value="PEN">PEN (Soles)</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text-secondary">Monto *</label>
              <input type="number" min="0" step="0.01" value={payAmount} onChange={e => setPayAmount(e.target.value)} className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none" placeholder="0.00" />
              {selectedInstallment && (
                <button type="button" onClick={fillBalance} className="text-xs text-primary-accent hover:underline">
                  Pagar el saldo ({usd(owed)})
                </button>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text-secondary">Medio de pago *</label>
              <select value={payMethod} onChange={e => setPayMethod(e.target.value)} className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none">
                {METHOD_OPTIONS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
          </div>
          {payCurrency === 'PEN' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text-secondary">TC (S/ por USD) *</label>
                <input type="number" min="0" step="0.001" value={payTC} onChange={e => setPayTC(e.target.value)} className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text-secondary">Equivale a</label>
                <div className="w-full h-10 bg-surface-muted border border-border-soft rounded-xl px-3 text-sm flex items-center text-text-secondary">
                  {amountNumber > 0 && tcNumber > 0 ? usd(equivalentUSD) : '—'}
                </div>
              </div>
            </div>
          )}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text-secondary">Tipo comprob. *</label>
              <select value={docType} onChange={e => setDocType(e.target.value as 'Boleta' | 'Factura')} className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none">
                <option value="Boleta">Boleta</option>
                <option value="Factura">Factura</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text-secondary">Serie *</label>
              <input type="text" value={docSerie} onChange={e => setDocSerie(e.target.value)} className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none uppercase" placeholder={docType === 'Boleta' ? 'B001' : 'F001'} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text-secondary">Número *</label>
              <input type="text" value={docNumber} onChange={e => setDocNumber(e.target.value)} className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none" placeholder="000123" />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-secondary">Foto del comprobante *</label>
            <label className="w-full h-28 border-2 border-dashed border-border-soft rounded-xl flex flex-col items-center justify-center text-sm text-text-muted hover:bg-surface-muted transition-colors cursor-pointer gap-2">
              <ImageIcon size={24} className="text-text-muted opacity-50" />
              <span>{evidence || 'Click para subir imagen (Obligatorio)'}</span>
              <input type="file" accept="image/*,.pdf" className="hidden" onChange={e => setEvidence(e.target.files?.[0]?.name ?? '')} />
            </label>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-secondary">Comentario</label>
            <textarea value={payComment} onChange={e => setPayComment(e.target.value)} className="w-full h-20 bg-surface border border-border-soft rounded-xl p-3 text-sm focus:border-primary-accent outline-none resize-none" placeholder="Detalles adicionales..."></textarea>
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
