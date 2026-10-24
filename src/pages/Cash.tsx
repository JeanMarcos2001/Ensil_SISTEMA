import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { ActionMenu } from '../components/ui/ActionMenu';
import { Search, Download, Plus, ArrowUpRight, ArrowDownRight, Package, AlertCircle } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useTablePagination } from '../hooks/useTablePagination';
import { getCurrentPrice } from '../utils/inventory';
import { DateInput } from '../components/ui/DateInput';
import { ClearFilters } from '../components/ui/ClearFilters';
import { ReasonDialog } from '../components/ui/ReasonDialog';
import { CashMovementModal } from '../components/cash/CashMovementModal';
import { CloseCashModal } from '../components/cash/CloseCashModal';
import { ReversePaymentModal } from '../components/payments/ReversePaymentModal';
import { Field, errorCls, inputCls } from './enrollment/fields';
import { PERM } from '../utils/authority';
import { closedMessage, closedUntil } from '../utils/cashClosure';
import { EXPENSE_DOCS, EXPENSE_METHODS, EXPENSE_TYPES, buildExpense, emptyExpense, validateExpense, type ExpenseInput } from '../utils/cash';
import { DepositBatchModal } from '../components/cash/DepositBatchModal';
import { CASH_REVERSAL_REASONS, balanceAfterReversal, cashBalance, cashReversalCheck, eligibleForDeposit, movementEnrollmentIds } from '../utils/cash';
import { csvFileName, downloadCsv } from '../utils/exportCsv';
import { localDateOf, todayLocalISO } from '../utils/schedule';

export function Cash() {
  const { stockItems, items, branches, updateStock, payments, plans, itemPrices, cashMovements, addCashMovement, reverseCashMovement, cashClosures, can, currentBranchId } = useData();
  const navigate = useNavigate();
  const [currency, setCurrency] = useState<'PEN' | 'USD'>('USD');
  const [typeFilter, setTypeFilter] = useState('');
  const [detail, setDetail] = useState<{ id: string; focus: 'detail' | 'receipt' } | null>(null);
  const [toReverseId, setToReverseId] = useState<string | null>(null);
  const canReverse = can(PERM.reverseCash);
  const [closeOpen, setCloseOpen] = useState(false);
  const [reversePaymentId, setReversePaymentId] = useState<string | null>(null);
  // Período de los totales de arriba (por defecto, el mes en curso)
  const [dateFrom, setDateFrom] = useState(() => `${todayLocalISO().slice(0, 8)}01`);
  const [dateTo, setDateTo] = useState(() => todayLocalISO());
  const [isEgresoOpen, setIsEgresoOpen] = useState(false);
  const [isLoteOpen, setIsLoteOpen] = useState(false);
  const [isSaleOpen, setIsSaleOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = useTablePagination();

  const money = (n: number) => n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  // Libro de caja: cada movimiento está en la moneda de su caja (PEN o USD).
  const inPeriod = (iso: string) => (!dateFrom || localDateOf(iso) >= dateFrom) && (!dateTo || localDateOf(iso) <= dateTo);
  const boxMovements = cashMovements
    .filter(m => m.currency === currency && inPeriod(m.date))
    .sort((a, b) => b.date.localeCompare(a.date));
  const applied = boxMovements.filter(m => m.status === 'Aplicado');
  const totalIn = applied.filter(m => m.kind === 'Ingreso').reduce((acc, m) => acc + m.amount, 0);
  const totalOut = applied.filter(m => m.kind === 'Egreso').reduce((acc, m) => acc + m.amount, 0);
  // El saldo es el de toda la historia de la caja, no solo el del período
  const balance = cashBalance(cashMovements, currency);
  const lastClosed = closedUntil(cashClosures, 'caja', currency);
  const movements = boxMovements.map(m => ({
    id: m.id,
    date: formatDate(m.date),
    kind: m.kind,
    status: m.status,
    type: m.concept,
    ref: m.reference,
    in: m.kind === 'Ingreso' ? money(m.amount) : '-',
    out: m.kind === 'Egreso' ? money(m.amount) : '-',
    user: m.user,
  }));

  const filteredMovements = movements.filter(row =>
    (!typeFilter || row.kind === typeFilter) &&
    (row.ref.toLowerCase().includes(searchTerm.toLowerCase()) ||
    row.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
    row.user.toLowerCase().includes(searchTerm.toLowerCase()))
  );
  const defaultFrom = `${todayLocalISO().slice(0, 8)}01`;
  const hasFilters = !!(searchTerm || typeFilter || dateFrom !== defaultFrom || dateTo !== todayLocalISO());
  const clearFilters = () => { setSearchTerm(''); setTypeFilter(''); setDateFrom(defaultFrom); setDateTo(todayLocalISO()); };
  const toDeposit = eligibleForDeposit(cashMovements, currency).reduce((a, m) => a + m.amount, 0);
  const toReverse = cashMovements.find(m => m.id === toReverseId);
  const reverseCheck = toReverse ? cashReversalCheck(toReverse, cashMovements) : undefined;

  const handleExport = () => {
    downloadCsv(
      csvFileName(`Caja ${currency}`, todayLocalISO()),
      ['Código', 'Fecha', 'Tipo', 'Concepto', 'Referencia', 'Medio', 'Banco', 'N.º operación', 'Ingreso', 'Egreso', 'Equivalente USD', 'Usuario', 'Estado'],
      boxMovements.filter(m => !typeFilter || m.kind === typeFilter).map(m => [
        m.id, localDateOf(m.date), m.kind, m.concept, m.reference, m.method, m.bank ?? '', m.operationNumber ?? '',
        m.kind === 'Ingreso' ? m.amount : '', m.kind === 'Egreso' ? m.amount : '', m.amountUSD || '', m.user, m.status,
      ])
    );
  };

  const totalPages = Math.ceil(filteredMovements.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedMovements = filteredMovements.slice(startIndex, endIndex);

  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, typeFilter, currency, dateFrom, dateTo]);
  
  // Sale state
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [selectedItemId, setSelectedItemId] = useState('');
  const [saleQty, setSaleQty] = useState(1);
  const [customerName, setCustomerName] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Efectivo');
  const [receiptType, setReceiptType] = useState('Boleta');
  const [receiptNumber, setReceiptNumber] = useState('');
  const [observation, setObservation] = useState('');
  const [saleCurrency, setSaleCurrency] = useState<'USD' | 'PEN'>('USD');
  const [saleTC, setSaleTC] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Egreso manual
  const [exp, setExp] = useState<ExpenseInput>(() => emptyExpense(todayLocalISO()));
  const [expSubmitted, setExpSubmitted] = useState(false);
  const [expError, setExpError] = useState<string | null>(null);
  const expErrors = validateExpense(exp, cashBalance(cashMovements, exp.currency), todayLocalISO());
  const setE = (patch: Partial<ExpenseInput>) => { setExp(x => ({ ...x, ...patch })); setExpError(null); };
  const eErr = (k: keyof ExpenseInput) => (expSubmitted ? expErrors[k] : undefined);
  const eCls = (k: keyof ExpenseInput) => `${inputCls} ${eErr(k) ? errorCls : ''}`;
  const openExpense = () => {
    setExp(emptyExpense(todayLocalISO(), currentBranchId !== 'all' ? currentBranchId : ''));
    setExp(x => ({ ...x, currency }));
    setExpSubmitted(false); setExpError(null); setIsEgresoOpen(true);
  };
  const submitExpense = () => {
    setExpSubmitted(true);
    if (Object.keys(expErrors).length > 0) return;
    const closed = closedMessage(cashClosures, 'caja', exp.currency, exp.date);
    if (closed) { setExpError(closed); return; }
    addCashMovement(buildExpense(exp));
    setCurrency(exp.currency);
    setIsEgresoOpen(false);
  };

  const selectedItem = items.find(i => i.id === selectedItemId);
  const currentStock = stockItems.find(s => s.itemId === selectedItemId && s.branchId === selectedBranchId);
  // Precio de venta vigente (USD): excepción de la sede si existe, si no el general.
  const unitPrice = selectedItem ? getCurrentPrice(itemPrices, selectedItem.id, selectedBranchId || 'all')?.amount ?? 0 : 0;
  const totalAmount = unitPrice * saleQty;

  const handleSaveSale = () => {
    setFormError(null);
    if (!selectedBranchId || !selectedItemId || saleQty <= 0) {
      setFormError('Por favor complete todos los campos obligatorios.');
      return;
    }
    const saleClosed = closedMessage(cashClosures, 'caja', saleCurrency, todayLocalISO());
    if (saleClosed) { setFormError(saleClosed); return; }

    if (!(unitPrice > 0)) {
      setFormError('El artículo no tiene un precio de venta vigente. Configúrelo en Logística → Catálogo de artículos.');
      return;
    }

    if (!currentStock || currentStock.stock < saleQty) {
      setFormError('No hay stock suficiente para realizar la venta.');
      return;
    }
    
    const tc = parseFloat(saleTC);
    if (saleCurrency === 'PEN' && !(tc > 0)) {
      setFormError('Indique el tipo de cambio (TC) para cobrar en soles.');
      return;
    }

    // 1. Deduct stock and generate Kardex
    const stockResult = updateStock(
      selectedBranchId,
      selectedItemId,
      -saleQty, 
      'Venta', 
      `Venta directa en caja a ${customerName || 'Cliente General'}. Comprobante: ${receiptType} ${receiptNumber}`,
      receiptNumber
    );
    if (!stockResult.ok) {
      setFormError(stockResult.error || 'No se pudo descontar el stock.');
      return;
    }

    // 2. Ingreso a caja: el precio es en USD; si se cobra en soles se registra con su TC.
    addCashMovement({
      kind: 'Ingreso',
      concept: 'Venta de artículo',
      reference: `${receiptType} ${receiptNumber || 'S/N'} / ${customerName || 'Cliente General'}`,
      currency: saleCurrency,
      amount: saleCurrency === 'USD' ? totalAmount : Math.round(totalAmount * tc * 100) / 100,
      exchangeRate: saleCurrency === 'PEN' ? tc : undefined,
      amountUSD: totalAmount,
      method: paymentMethod,
      branchId: selectedBranchId,
      sale: { itemId: selectedItemId, branchId: selectedBranchId, qty: saleQty },
    });
    setCurrency(saleCurrency);
    setSaleTC('');

    // 3. Close modal and reset
    setIsSaleOpen(false);
    setSelectedItemId('');
    setSaleQty(1);
    setCustomerName('');
    setReceiptNumber('');
    setObservation('');
    setFormError(null);
  };

  const sellableItems = items.filter(i => i.isSold && i.status === 'Activo');

  const rowActions = (id: string) => {
    const m = cashMovements.find(x => x.id === id)!;
    const enrollmentIds = movementEnrollmentIds(m, plans);
    const plan = enrollmentIds.map(e => plans.find(p => p.mat === e)).find(Boolean);
    const check = cashReversalCheck(m, cashMovements);
    const reverse = m.status === 'Reversado'
      ? { label: 'Reversado', onClick: () => {}, disabled: true }
      : !canReverse
        ? { label: 'Reversar (requiere autorización)', onClick: () => {}, danger: true, disabled: true }
        : check.paymentId
          ? { label: 'Reversar desde el pago', onClick: () => setReversePaymentId(check.paymentId!), danger: true }
          : { label: 'Reversar movimiento', onClick: () => setToReverseId(m.id), danger: true };
    return [
      { label: 'Ver detalle', onClick: () => setDetail({ id: m.id, focus: 'detail' as const }) },
      { label: 'Ver comprobante', onClick: () => setDetail({ id: m.id, focus: 'receipt' as const }) },
      ...(enrollmentIds.length === 1 ? [{ label: 'Ver matrícula', onClick: () => navigate(`/operacion/matriculas?ficha=${enrollmentIds[0]}`) }] : []),
      ...(enrollmentIds.length > 1 ? [{ label: 'Ver matrículas del pago', onClick: () => setDetail({ id: m.id, focus: 'detail' as const }) }] : []),
      ...(plan ? [{ label: 'Ver cuota (plan)', onClick: () => navigate(`/operacion/planes-y-cartera?plan=${plan.id}`) }] : []),
      reverse,
    ];
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-text-primary mb-1">Caja</h2>
          <p className="text-sm text-text-secondary">Movimientos en {currency}</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" className="hidden sm:flex items-center gap-2" onClick={handleExport} disabled={boxMovements.length === 0}>
            <Download size={16} />
            Exportar
          </Button>
          <Button variant="secondary" onClick={() => { setIsSaleOpen(true); setFormError(null); }} className="flex items-center gap-2">
            <Package size={16} />
            Venta de artículo
          </Button>
          <Button variant="secondary" onClick={() => { setIsLoteOpen(true); setFormError(null); }}>Crear lote de depósito</Button>
          <Button variant="primary" className="flex items-center gap-2" onClick={() => { openExpense(); setFormError(null); }}>
            <Plus size={16} />
            Registrar egreso
          </Button>
        </div>
      </div>

      {/* Currency Tabs & KPIs */}
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex bg-surface-muted p-1 rounded-xl w-fit border border-border-soft">
          <button 
            onClick={() => setCurrency('PEN')}
            className={`px-6 py-2 rounded-lg text-sm font-medium transition-colors ${currency === 'PEN' ? 'bg-surface shadow-sm text-text-primary' : 'text-text-secondary hover:text-text-primary'}`}
          >
            Caja PEN (Soles)
          </button>
          <button 
            onClick={() => setCurrency('USD')}
            className={`px-6 py-2 rounded-lg text-sm font-medium transition-colors ${currency === 'USD' ? 'bg-surface shadow-sm text-text-primary' : 'text-text-secondary hover:text-text-primary'}`}
          >
            Caja USD (Dólares)
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="p-4">
            <span className="text-sm font-medium text-text-secondary">Ingresos del período</span>
            <div className="flex items-center gap-2 mt-2">
              <ArrowUpRight size={18} className="text-success-text" />
              <h3 className="text-xl font-semibold text-text-primary">{currency === 'PEN' ? 'S/' : '$'} {money(totalIn)}</h3>
            </div>
          </Card>
          <Card className="p-4">
            <span className="text-sm font-medium text-text-secondary">Egresos del período</span>
            <div className="flex items-center gap-2 mt-2">
              <ArrowDownRight size={18} className="text-danger-text" />
              <h3 className="text-xl font-semibold text-text-primary">{currency === 'PEN' ? 'S/' : '$'} {money(totalOut)}</h3>
            </div>
          </Card>
          <Card className="p-4">
            <span className="text-sm font-medium text-text-secondary">Saldo de caja</span>
            <div className="mt-2">
              <h3 className="text-xl font-semibold text-text-primary">{currency === 'PEN' ? 'S/' : '$'} {money(balance)}</h3>
            </div>
          </Card>
          <Card className="p-4 bg-surface-muted border-primary-accent/20">
            <div className="flex justify-between items-start">
              <span className="text-sm font-medium text-text-secondary">Estado</span>
              <Badge variant={lastClosed ? 'neutral' : 'success'}>{lastClosed ? `Cerrada al ${lastClosed.split('-').reverse().join('/')}` : 'Abierta'}</Badge>
            </div>
            <div className="mt-2 text-xs text-text-muted">
              Efectivo por depositar: {currency === 'PEN' ? 'S/' : '$'} {money(toDeposit)}
            </div>
            {can(PERM.closeCash) && (
              <button type="button" className="mt-1 text-xs font-medium text-primary-accent hover:underline" onClick={() => setCloseOpen(true)}>Arqueo y cierre</button>
            )}
          </Card>
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
                placeholder="Buscar por concepto, comprobante o usuario..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full h-10 bg-surface border border-border-soft rounded-xl pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary-accent focus:ring-1 focus:ring-primary-accent transition-shadow"
              />
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 md:pb-0">
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent min-w-[140px]"
              >
                <option value="">Tipo de movimiento</option>
                <option value="Ingreso">Ingreso</option>
                <option value="Egreso">Egreso</option>
              </select>
              <div className="flex items-center gap-2">
                <DateInput value={dateFrom} max={dateTo || undefined} onChange={e => setDateFrom(e.target.value)} className="w-36 h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none" />
                <span className="text-text-muted">-</span>
                <DateInput value={dateTo} min={dateFrom || undefined} onChange={e => setDateTo(e.target.value)} className="w-36 h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none" />
              </div>
              <ClearFilters active={hasFilters} onClear={clearFilters} className="h-10 rounded-xl" />
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
                <th className="px-6 py-3 font-medium">Concepto / Referencia</th>
                <th className="px-6 py-3 font-medium text-right">Ingreso</th>
                <th className="px-6 py-3 font-medium text-right">Egreso</th>
                <th className="px-6 py-3 font-medium">Usuario</th>
                <th className="px-6 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-soft">
              {paginatedMovements.map((row) => (
                <tr key={row.id} className="hover:bg-surface-muted/50 transition-colors even:bg-surface-muted/30">
                  <td className="px-6 py-3 text-text-secondary whitespace-nowrap">{row.date}</td>
                  <td className="px-6 py-3">
                    <Badge variant={row.status === 'Reversado' ? 'danger' : row.kind === 'Ingreso' ? 'success' : 'neutral'}>{row.type}</Badge>
                    {row.status === 'Reversado' && <span className="ml-2 text-xs text-danger-text">Reversado</span>}
                  </td>
                  <td className={`px-6 py-3 font-medium ${row.status === 'Reversado' ? 'text-text-muted line-through' : 'text-text-primary'}`}>{row.ref}</td>
                  <td className={`px-6 py-3 text-right font-medium ${row.status === 'Reversado' ? 'text-text-muted line-through' : 'text-success-text'}`}>{row.in !== '-' ? `${currency === 'PEN' ? 'S/' : '$'} ${row.in}` : '-'}</td>
                  <td className={`px-6 py-3 text-right font-medium ${row.status === 'Reversado' ? 'text-text-muted line-through' : 'text-text-primary'}`}>{row.out !== '-' ? `${currency === 'PEN' ? 'S/' : '$'} ${row.out}` : '-'}</td>
                  <td className="px-6 py-3 text-text-secondary">{row.user}</td>
                  <td className="px-6 py-3 text-right">
                    <ActionMenu items={rowActions(row.id)} />
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

      {/* Registrar Egreso Modal */}
      <Modal
        isOpen={isEgresoOpen}
        onClose={() => setIsEgresoOpen(false)}
        title="Registrar Egreso Manual"
        size="lg"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setIsEgresoOpen(false)}>Cancelar</Button>
            <Button variant="primary" onClick={submitExpense}>Registrar egreso</Button>
          </div>
        }
      >
        <div className="space-y-4">
          {(expError || (expSubmitted && Object.keys(expErrors).length > 0)) && (
            <div className="bg-danger-tint border border-danger-text/20 rounded-xl p-3 flex gap-2 text-sm text-danger-text">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <p>{expError ?? `Revise ${Object.keys(expErrors).length} ${Object.keys(expErrors).length === 1 ? 'campo marcado' : 'campos marcados'} antes de guardar.`}</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Fecha" required error={eErr('date')}>
              <DateInput max={todayLocalISO()} value={exp.date} onChange={e => setE({ date: e.target.value })} />
            </Field>
            <Field label="Sede" required error={eErr('branchId')}>
              <select className={eCls('branchId')} value={exp.branchId} onChange={e => setE({ branchId: e.target.value })}>
                <option value="">Seleccionar sede...</option>
                {branches.filter(b => b.status === 'Activo').map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </Field>
            <Field label="Moneda" required>
              <select className={inputCls} value={exp.currency} onChange={e => setE({ currency: e.target.value as 'PEN' | 'USD' })}>
                <option value="PEN">PEN (Soles)</option>
                <option value="USD">USD (Dólares)</option>
              </select>
            </Field>
            <Field label="Tipo de egreso" required error={eErr('type')}>
              <select className={eCls('type')} value={exp.type} onChange={e => setE({ type: e.target.value })}>
                <option value="">Seleccionar tipo</option>
                {EXPENSE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Concepto" required error={eErr('concept')}>
            <input type="text" className={eCls('concept')} value={exp.concept} onChange={e => setE({ concept: e.target.value })} placeholder="Descripción del egreso" />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Monto" required error={eErr('amount')} hint={`Saldo de la caja ${exp.currency}: ${exp.currency === 'PEN' ? 'S/' : '$'} ${money(cashBalance(cashMovements, exp.currency))}`}>
              <input type="number" min="0" step="0.01" className={eCls('amount')} value={exp.amount} onChange={e => setE({ amount: e.target.value })} placeholder="0.00" />
            </Field>
            {exp.currency === 'PEN' && (
              <Field label="TC (S/ por USD)" required error={eErr('tc')}>
                <input type="number" min="0" step="0.001" className={eCls('tc')} value={exp.tc} onChange={e => setE({ tc: e.target.value })} />
              </Field>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Comprobante" required>
              <select className={inputCls} value={exp.docType} onChange={e => setE({ docType: e.target.value })}>
                {EXPENSE_DOCS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </Field>
            <Field label="N° Comprobante" required error={eErr('docNumber')}>
              <input type="text" className={eCls('docNumber')} value={exp.docNumber} onChange={e => setE({ docNumber: e.target.value })} />
            </Field>
            <Field label="Medio de pago" required error={eErr('method')}>
              <select className={eCls('method')} value={exp.method} onChange={e => setE({ method: e.target.value })}>
                {EXPENSE_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
          </div>
          {exp.method === 'Transferencia' && (
            <div className="grid grid-cols-2 gap-4">
              <Field label="Banco" required error={eErr('bank')}>
                <input type="text" className={eCls('bank')} value={exp.bank} onChange={e => setE({ bank: e.target.value })} placeholder="Ej: BCP" />
              </Field>
              <Field label="N° de operación" required error={eErr('operation')}>
                <input type="text" className={eCls('operation')} value={exp.operation} onChange={e => setE({ operation: e.target.value })} />
              </Field>
            </div>
          )}
        </div>
      </Modal>

      <DepositBatchModal isOpen={isLoteOpen} onClose={() => setIsLoteOpen(false)} currency={currency} />
      <CloseCashModal isOpen={closeOpen} onClose={() => setCloseOpen(false)} scope="caja" currency={currency} />
      <ReversePaymentModal paymentId={reversePaymentId} onClose={() => setReversePaymentId(null)} />

      <CashMovementModal movementId={detail?.id ?? null} focus={detail?.focus} onClose={() => setDetail(null)} />

      <ReasonDialog
        isOpen={!!toReverse}
        onClose={() => setToReverseId(null)}
        title="Reversar movimiento de caja"
        confirmLabel="Reversar movimiento"
        danger
        reasons={CASH_REVERSAL_REASONS}
        reasonLabel="Motivo de la reversa"
        blocked={reverseCheck && !reverseCheck.allowed ? reverseCheck.reason : null}
        onSubmit={({ reason, detail: why }) => {
          if (!toReverse) return;
          const r = reverseCashMovement(toReverse.id, { reason, detail: why });
          return r.ok ? null : r.error ?? 'No se pudo reversar el movimiento.';
        }}
      >
        {toReverse && reverseCheck && (
          <div className="space-y-3 text-sm">
            <div className="bg-surface-muted border border-border-soft rounded-xl p-3">
              <p className="font-medium text-text-primary">{toReverse.concept} · {toReverse.kind === 'Ingreso' ? '+' : '-'}{toReverse.currency === 'PEN' ? 'S/' : '$'} {money(toReverse.amount)}</p>
              <p className="text-xs text-text-muted">{toReverse.reference} · {toReverse.id}</p>
            </div>
            <ul className="space-y-1 text-text-secondary list-disc pl-5">
              <li>No se borra: queda marcado «Reversado» con quién, cuándo y por qué, y deja de contar en el saldo.</li>
              <li>Saldo de la caja {toReverse.currency}: {toReverse.currency === 'PEN' ? 'S/' : '$'} {money(cashBalance(cashMovements, toReverse.currency))} → {toReverse.currency === 'PEN' ? 'S/' : '$'} {money(balanceAfterReversal(toReverse, cashMovements))}.</li>
              {reverseCheck.restock && <li>El artículo vendido ({reverseCheck.restock.qty} unidad(es)) vuelve al stock de la sede, con su registro en el Kardex.</li>}
              {reverseCheck.manualStock && <li>Es una venta antigua sin detalle del artículo: el stock no se repone solo; ajústelo en Logística → Ajustes y mermas.</li>}
              {reverseCheck.releases.length > 0 && <li>Los {reverseCheck.releases.length} ingreso(s) del lote vuelven a quedar por depositar.</li>}
            </ul>
          </div>
        )}
      </ReasonDialog>

      {/* Modal: Venta de artículo */}
      <Modal
        isOpen={isSaleOpen}
        onClose={() => setIsSaleOpen(false)}
        title="Registrar Venta de Artículo"
        size="md"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setIsSaleOpen(false)}>Cancelar</Button>
            <Button variant="primary" onClick={handleSaveSale}>Confirmar Venta</Button>
          </div>
        }
      >
        <div className="space-y-6">
          {formError && (
             <div className="bg-danger/10 border border-danger/20 rounded-xl p-3 flex gap-2 text-sm text-danger animate-in fade-in slide-in-from-top-1">
               <AlertCircle size={16} className="shrink-0 mt-0.5" />
               <p>{formError}</p>
             </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text-secondary">Sede *</label>
              <select 
                className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none"
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
              >
                <option value="">Seleccionar sede...</option>
                {branches.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text-secondary">Cliente / Referencia</label>
              <input 
                type="text" 
                className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none"
                placeholder="Nombre del cliente"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-4 p-4 bg-surface-muted rounded-xl border border-border-soft">
            <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <Package size={16} />
              Detalle de Venta
            </h3>
            
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text-secondary">Artículo Vendible *</label>
                <select 
                  className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none"
                  value={selectedItemId}
                  onChange={(e) => setSelectedItemId(e.target.value)}
                >
                  <option value="">Seleccionar artículo...</option>
                  {sellableItems.map(i => (
                    <option key={i.id} value={i.id}>{i.name} - {(() => { const pr = getCurrentPrice(itemPrices, i.id, selectedBranchId || 'all'); return pr ? `$ ${pr.amount.toFixed(2)}` : 'sin precio'; })()}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-text-secondary">Cantidad *</label>
                  <input 
                    type="number" 
                    min="1" 
                    className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none"
                    value={saleQty}
                    onChange={(e) => setSaleQty(parseInt(e.target.value) || 0)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-text-secondary">Precio Unit.</label>
                  <div className="w-full h-10 bg-surface-muted border border-border-soft rounded-xl px-3 text-sm flex items-center text-text-muted">
                    $ {unitPrice.toFixed(2)}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-text-secondary">Subtotal</label>
                  <div className="w-full h-10 bg-surface-muted border border-border-soft rounded-xl px-3 text-sm flex items-center font-bold text-text-primary">
                    {totalAmount.toFixed(2)}
                  </div>
                </div>
              </div>

              {selectedItemId && selectedBranchId && (
                <div className={`text-xs p-2 rounded-lg flex items-center gap-2 ${(!currentStock || currentStock.stock < saleQty) ? 'bg-danger/10 text-danger' : 'bg-success/10 text-success-text'}`}>
                  <AlertCircle size={14} />
                  Stock en sede: {currentStock?.stock || 0} unidades disponibles.
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text-secondary">Método de Pago *</label>
              <select 
                className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              >
                <option value="Efectivo">Efectivo</option>
                <option value="Transferencia">Transferencia</option>
                <option value="Yape/Plin">Yape / Plin</option>
                <option value="Tarjeta">Tarjeta Débito/Crédito</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text-secondary">Cobro en *</label>
              <div className="flex gap-2">
                <select
                  className="flex-1 h-10 bg-surface border border-border-soft rounded-xl px-2 text-sm focus:border-primary-accent outline-none"
                  value={saleCurrency}
                  onChange={(e) => setSaleCurrency(e.target.value as 'USD' | 'PEN')}
                >
                  <option value="USD">USD (Dólares)</option>
                  <option value="PEN">PEN (Soles)</option>
                </select>
                {saleCurrency === 'PEN' && (
                  <input
                    type="number" min="0" step="0.001"
                    className="w-28 h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none"
                    placeholder="TC"
                    value={saleTC}
                    onChange={(e) => setSaleTC(e.target.value)}
                  />
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text-secondary">Comprobante *</label>
              <div className="flex gap-2">
                <select 
                  className="w-24 h-10 bg-surface border border-border-soft rounded-xl px-2 text-sm focus:border-primary-accent outline-none"
                  value={receiptType}
                  onChange={(e) => setReceiptType(e.target.value)}
                >
                  <option value="Boleta">Boleta</option>
                  <option value="Factura">Factura</option>
                  <option value="Recibo">Recibo</option>
                </select>
                <input 
                  type="text" 
                  className="flex-1 h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none"
                  placeholder="N° Comprobante"
                  value={receiptNumber}
                  onChange={(e) => setReceiptNumber(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-secondary">Observación</label>
            <textarea 
              className="w-full h-20 bg-surface border border-border-soft rounded-xl p-3 text-sm focus:border-primary-accent outline-none resize-none"
              placeholder="Notas adicionales..."
              value={observation}
              onChange={(e) => setObservation(e.target.value)}
            />
          </div>

          <div className="bg-primary-accent/5 border border-primary-accent/20 rounded-xl p-4 flex justify-between items-center">
            <span className="text-sm font-bold text-text-primary uppercase tracking-wider">Total a Pagar</span>
            <span className="text-2xl font-black text-primary-accent text-right">
              $ {totalAmount.toFixed(2)}
              {saleCurrency === 'PEN' && parseFloat(saleTC) > 0 && (
                <span className="block text-sm font-semibold text-text-secondary">
                  S/ {(totalAmount * parseFloat(saleTC)).toFixed(2)} (TC {saleTC})
                </span>
              )}
            </span>
          </div>
        </div>
      </Modal>
    </div>
  );
}
