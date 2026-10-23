import React, { useState } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { ActionMenu } from '../components/ui/ActionMenu';
import { Search, Filter, Download, Plus, ArrowUpRight, ArrowDownRight, Package, AlertCircle } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useTablePagination } from '../hooks/useTablePagination';
import { getCurrentPrice } from '../utils/inventory';
import { DateInput } from '../components/ui/DateInput';

export function Cash() {
  const { stockItems, items, branches, updateStock, payments, itemPrices, cashMovements, addCashMovement } = useData();
  const [currency, setCurrency] = useState<'PEN' | 'USD'>('USD');
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
  const boxMovements = cashMovements
    .filter(m => m.currency === currency)
    .sort((a, b) => b.date.localeCompare(a.date));
  const applied = boxMovements.filter(m => m.status === 'Aplicado');
  const totalIn = applied.filter(m => m.kind === 'Ingreso').reduce((acc, m) => acc + m.amount, 0);
  const totalOut = applied.filter(m => m.kind === 'Egreso').reduce((acc, m) => acc + m.amount, 0);

  const movements = boxMovements.map(m => ({
    id: m.id,
    date: formatDate(m.date),
    kind: m.kind,
    type: m.concept,
    ref: m.reference,
    in: m.kind === 'Ingreso' ? money(m.amount) : '-',
    out: m.kind === 'Egreso' ? money(m.amount) : '-',
    user: m.user,
  }));

  const filteredMovements = movements.filter(row =>
    row.ref.toLowerCase().includes(searchTerm.toLowerCase()) ||
    row.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
    row.user.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPages = Math.ceil(filteredMovements.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedMovements = filteredMovements.slice(startIndex, endIndex);

  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);
  
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
  const [egDate, setEgDate] = useState(new Date().toISOString().slice(0, 10));
  const [egCurrency, setEgCurrency] = useState<'PEN' | 'USD'>('PEN');
  const [egTC, setEgTC] = useState('');
  const [egType, setEgType] = useState('');
  const [egConcept, setEgConcept] = useState('');
  const [egAmount, setEgAmount] = useState('');
  const [egDocType, setEgDocType] = useState('Factura');
  const [egDocNumber, setEgDocNumber] = useState('');
  const [egError, setEgError] = useState<string | null>(null);

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

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-text-primary mb-1">Caja</h2>
          <p className="text-sm text-text-secondary">Movimientos en {currency}</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" className="hidden sm:flex items-center gap-2">
            <Download size={16} />
            Exportar
          </Button>
          <Button variant="secondary" onClick={() => { setIsSaleOpen(true); setFormError(null); }} className="flex items-center gap-2">
            <Package size={16} />
            Venta de artículo
          </Button>
          <Button variant="secondary" onClick={() => { setIsLoteOpen(true); setFormError(null); }}>Crear lote de depósito</Button>
          <Button variant="primary" className="flex items-center gap-2" onClick={() => { setIsEgresoOpen(true); setFormError(null); }}>
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
              <h3 className="text-xl font-semibold text-text-primary">{currency === 'PEN' ? 'S/' : '$'} {money(totalIn - totalOut)}</h3>
            </div>
          </Card>
          <Card className="p-4 bg-surface-muted border-primary-accent/20">
            <div className="flex justify-between items-start">
              <span className="text-sm font-medium text-text-secondary">Estado</span>
              <Badge variant="success">Abierta</Badge>
            </div>
            <div className="mt-2 text-xs text-text-muted">
              Último cierre: Ayer, 18:30
            </div>
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
              <select className="h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent min-w-[140px]">
                <option value="">Tipo Movimiento</option>
                <option value="ingreso">Ingreso</option>
                <option value="egreso">Egreso</option>
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
                    <Badge variant={row.kind === 'Ingreso' ? 'success' : 'neutral'}>{row.type}</Badge>
                  </td>
                  <td className="px-6 py-3 font-medium text-text-primary">{row.ref}</td>
                  <td className="px-6 py-3 text-right font-medium text-success-text">{row.in !== '-' ? `${currency === 'PEN' ? 'S/' : '$'} ${row.in}` : '-'}</td>
                  <td className="px-6 py-3 text-right font-medium text-text-primary">{row.out !== '-' ? `${currency === 'PEN' ? 'S/' : '$'} ${row.out}` : '-'}</td>
                  <td className="px-6 py-3 text-text-secondary">{row.user}</td>
                  <td className="px-6 py-3 text-right">
                    <ActionMenu 
                      items={[
                        { label: 'Ver detalle', onClick: () => {} },
                        { label: 'Ver comprobante', onClick: () => {} },
                        { label: 'Ver matrícula/cuota', onClick: () => {} },
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

      {/* Registrar Egreso Modal */}
      <Modal
        isOpen={isEgresoOpen}
        onClose={() => setIsEgresoOpen(false)}
        title="Registrar Egreso Manual"
        size="md"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setIsEgresoOpen(false)}>Cancelar</Button>
            <Button
              variant="primary"
              onClick={() => {
                setEgError(null);
                const amount = parseFloat(egAmount);
                const tc = parseFloat(egTC);
                if (!egDate || !egType || !egConcept.trim() || !(amount > 0) || !egDocNumber.trim()) {
                  setEgError('Complete fecha, tipo, concepto, monto y N° de comprobante.');
                  return;
                }
                if (egCurrency === 'PEN' && !(tc > 0)) {
                  setEgError('Indique el tipo de cambio (TC) para un egreso en soles.');
                  return;
                }
                addCashMovement({
                  date: new Date(`${egDate}T12:00:00`).toISOString(),
                  kind: 'Egreso',
                  concept: egType,
                  reference: `${egConcept.trim()} (${egDocType} ${egDocNumber.trim()})`,
                  currency: egCurrency,
                  amount,
                  exchangeRate: egCurrency === 'PEN' ? tc : undefined,
                  amountUSD: egCurrency === 'USD' ? amount : Math.round((amount / tc) * 100) / 100,
                  method: 'Efectivo',
                });
                setCurrency(egCurrency);
                setEgConcept(''); setEgAmount(''); setEgDocNumber(''); setEgTC(''); setEgType('');
                setIsEgresoOpen(false);
              }}
            >
              Registrar egreso
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {egError && (
            <div className="bg-danger/10 border border-danger/20 rounded-xl p-3 flex gap-2 text-sm text-danger">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <p>{egError}</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text-secondary">Fecha *</label>
              <DateInput value={egDate} onChange={e => setEgDate(e.target.value)} className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text-secondary">Moneda *</label>
              <select value={egCurrency} onChange={e => setEgCurrency(e.target.value as 'PEN' | 'USD')} className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none">
                <option value="PEN">PEN (Soles)</option>
                <option value="USD">USD (Dólares)</option>
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-secondary">Tipo de egreso *</label>
            <select value={egType} onChange={e => setEgType(e.target.value)} className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none">
              <option value="">Seleccionar tipo</option>
              <option value="Pago a proveedor">Pago a proveedor</option>
              <option value="Reembolso">Reembolso</option>
              <option value="Ajuste de caja">Ajuste de caja</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-secondary">Concepto *</label>
            <input type="text" value={egConcept} onChange={e => setEgConcept(e.target.value)} className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none" placeholder="Descripción del egreso" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text-secondary">Monto *</label>
              <input type="number" min="0" step="0.01" value={egAmount} onChange={e => setEgAmount(e.target.value)} className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none" placeholder="0.00" />
            </div>
            {egCurrency === 'PEN' && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text-secondary">TC (S/ por USD) *</label>
                <input type="number" min="0" step="0.001" value={egTC} onChange={e => setEgTC(e.target.value)} className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none" />
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text-secondary">Comprobante *</label>
              <select value={egDocType} onChange={e => setEgDocType(e.target.value)} className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none">
                <option value="Factura">Factura</option>
                <option value="Boleta">Boleta</option>
                <option value="Recibo">Recibo</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text-secondary">N° Comprobante *</label>
              <input type="text" value={egDocNumber} onChange={e => setEgDocNumber(e.target.value)} className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none" />
            </div>
          </div>
        </div>
      </Modal>

      {/* Crear Lote Modal */}
      <Modal 
        isOpen={isLoteOpen} 
        onClose={() => setIsLoteOpen(false)} 
        title="Crear Lote de Depósito"
        size="lg"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setIsLoteOpen(false)}>Cancelar</Button>
            <Button variant="primary">Crear lote y registrar egreso</Button>
          </div>
        }
      >
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text-secondary">Fecha de depósito *</label>
              <DateInput className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text-secondary">Banco / Cuenta destino *</label>
              <select className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none">
                <option value="">Seleccionar cuenta</option>
                <option value="bcp">BCP - Cuenta Corriente PEN</option>
                <option value="bbva">BBVA - Recaudadora PEN</option>
              </select>
            </div>
          </div>
          
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-text-primary">Ingresos elegibles para depósito</h3>
            <div className="border border-border-soft rounded-xl overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-text-secondary uppercase bg-surface-muted/50">
                  <tr>
                    <th className="px-4 py-3 w-10 text-center"><input type="checkbox" className="rounded border-border-soft text-primary-accent focus:ring-primary-accent" /></th>
                    <th className="px-4 py-3 font-medium">Fecha</th>
                    <th className="px-4 py-3 font-medium">Concepto</th>
                    <th className="px-4 py-3 font-medium text-right">Monto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-soft">
                  <tr className="hover:bg-surface-muted/50">
                    <td className="px-4 py-3 text-center"><input type="checkbox" className="rounded border-border-soft text-primary-accent focus:ring-primary-accent" /></td>
                    <td className="px-4 py-3">Hoy, 10:30</td>
                    <td className="px-4 py-3">Ingreso Cuota (PLN-001)</td>
                    <td className="px-4 py-3 text-right font-medium">S/ 1,200</td>
                  </tr>
                  <tr className="hover:bg-surface-muted/50">
                    <td className="px-4 py-3 text-center"><input type="checkbox" className="rounded border-border-soft text-primary-accent focus:ring-primary-accent" /></td>
                    <td className="px-4 py-3">Hoy, 09:15</td>
                    <td className="px-4 py-3">Ingreso Matrícula (MAT-2024-002)</td>
                    <td className="px-4 py-3 text-right font-medium">S/ 950</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-surface-muted border border-border-soft rounded-xl p-4 flex justify-between items-center">
            <span className="text-sm text-text-secondary">Total a depositar (0 seleccionados)</span>
            <span className="text-lg font-bold text-text-primary">S/ 0.00</span>
          </div>
        </div>
      </Modal>

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
