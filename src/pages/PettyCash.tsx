import React, { useState, useEffect, useMemo } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { ActionMenu } from '../components/ui/ActionMenu';
import { ClearFilters } from '../components/ui/ClearFilters';
import { ReasonDialog } from '../components/ui/ReasonDialog';
import { Search, Download, ArrowUpRight, ArrowDownRight, AlertCircle, Paperclip } from 'lucide-react';
import { useTablePagination } from '../hooks/useTablePagination';
import { DateInput } from '../components/ui/DateInput';
import { useData, type PettyCashMovement } from '../context/DataContext';
import { Field, errorCls, inputCls } from './enrollment/fields';
import { csvFileName, downloadCsv } from '../utils/exportCsv';
import { CloseCashModal } from '../components/cash/CloseCashModal';
import { PERM } from '../utils/authority';
import { closedUntil } from '../utils/cashClosure';
import { localDateOf, todayLocalISO } from '../utils/schedule';
import {
  PETTY_CATEGORIES,
  PETTY_METHODS,
  PETTY_REVERSAL_REASONS,
  emptyPettyInput,
  pettyBalance,
  pettyBalanceAfterReversal,
  refillNeeded,
  validateFund,
  pettyMonthTotals,
  validatePettyInput,
  validatePettyReversal,
  type PettyInput,
  type PettyKind,
} from '../utils/pettyCash';

const money = (n: number) => `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const when = (iso: string) => new Date(iso).toLocaleString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function PettyCash() {
  const { pettyCashMovements, addPettyCashMovement, reversePettyCashMovement, pettyFund, updatePettyFund, cashClosures, can } = useData();
  const today = todayLocalISO();
  const [isNewMovementOpen, setIsNewMovementOpen] = useState(false);
  const [form, setForm] = useState<PettyInput>(emptyPettyInput('Egreso', today));
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [kindFilter, setKindFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [toReverseId, setToReverseId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = useTablePagination();
  const canReverse = can(PERM.reversePetty);
  const [closeOpen, setCloseOpen] = useState(false);
  const [fundOpen, setFundOpen] = useState(false);
  const [fundForm, setFundForm] = useState({ assigned: '', maxExpense: '' });
  const [fundError, setFundError] = useState<string | null>(null);
  const lastClosed = closedUntil(cashClosures, 'caja-chica', 'PEN');
  const toRefill = refillNeeded(pettyFund, pettyCashMovements);

  const balance = pettyBalance(pettyCashMovements);
  const month = pettyMonthTotals(pettyCashMovements, today);
  const allCategories = useMemo(() => [...PETTY_CATEGORIES.Egreso, ...PETTY_CATEGORIES.Ingreso], []);

  const sorted = useMemo(() => [...pettyCashMovements].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)), [pettyCashMovements]);
  const filteredMovements = sorted.filter(row =>
    (!kindFilter || row.kind === kindFilter) &&
    (!categoryFilter || row.category === categoryFilter) &&
    (row.concept.toLowerCase().includes(searchTerm.toLowerCase()) ||
      row.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (row.reference ?? '').toLowerCase().includes(searchTerm.toLowerCase()))
  );
  const hasFilters = !!(searchTerm || kindFilter || categoryFilter);
  const clearFilters = () => { setSearchTerm(''); setKindFilter(''); setCategoryFilter(''); };

  const totalPages = Math.ceil(filteredMovements.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedMovements = filteredMovements.slice(startIndex, endIndex);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, kindFilter, categoryFilter]);

  const detail = pettyCashMovements.find(m => m.id === detailId);
  const toReverse = pettyCashMovements.find(m => m.id === toReverseId);
  const reverseProblems = toReverse ? validatePettyReversal(toReverse, PETTY_REVERSAL_REASONS[0], 'xxxxx', pettyCashMovements) : [];

  const openFund = () => {
    setFundForm({ assigned: String(pettyFund.assigned), maxExpense: String(pettyFund.maxExpense) });
    setFundError(null);
    setFundOpen(true);
  };
  const saveFund = () => {
    const r = updatePettyFund(fundForm);
    if (!r.ok) { setFundError(r.error ?? 'No se pudo guardar el fondo.'); return; }
    setFundOpen(false);
  };
  const fundErrors = validateFund(fundForm);

  /** Reposición: ingreso por lo que falta para volver al fondo asignado. */
  const handleRefill = () => {
    setForm({ ...emptyPettyInput('Ingreso', todayLocalISO()), category: 'Reposición de fondo', concept: 'Reposición de fondo fijo', amount: String(toRefill) });
    setSubmitted(false);
    setServerError(null);
    setIsNewMovementOpen(true);
  };

  const handleOpenMovement = (kind: PettyKind) => {
    setForm(emptyPettyInput(kind, todayLocalISO()));
    setSubmitted(false);
    setServerError(null);
    setIsNewMovementOpen(true);
  };

  const errors = useMemo(() => validatePettyInput(form, pettyCashMovements, today, pettyFund), [form, pettyCashMovements, today, pettyFund]);
  const set = (patch: Partial<PettyInput>) => { setForm(f => ({ ...f, ...patch })); setServerError(null); };
  const err = (k: keyof PettyInput) => (submitted ? errors[k] : undefined);
  const cls = (k: keyof PettyInput) => `${inputCls} ${err(k) ? errorCls : ''}`;
  const errorCount = Object.keys(errors).length;

  const handleSave = () => {
    setSubmitted(true);
    if (errorCount > 0) return;
    const r = addPettyCashMovement(form);
    if (!r.ok) { setServerError(r.error ?? 'No se pudo guardar el movimiento.'); return; }
    setIsNewMovementOpen(false);
  };

  const handleExport = () => {
    downloadCsv(
      csvFileName('Caja chica', today),
      ['Código', 'Fecha', 'Tipo', 'Categoría', 'Concepto', 'Monto (S/)', 'Medio', 'Comprobante / referencia', 'Evidencia', 'Usuario', 'Estado'],
      filteredMovements.map(m => [m.id, localDateOf(m.date), m.kind, m.category, m.concept, m.amount, m.method, m.reference ?? '', m.evidence ?? '', m.user, m.status])
    );
  };

  const rowActions = (m: PettyCashMovement) => [
    { label: 'Ver detalle', onClick: () => setDetailId(m.id) },
    { label: 'Ver comprobante', onClick: () => setDetailId(m.id) },
    m.status === 'Reversado'
      ? { label: 'Reversado', onClick: () => {}, disabled: true }
      : canReverse
        ? { label: 'Reversar movimiento', onClick: () => setToReverseId(m.id), danger: true }
        : { label: 'Reversar (requiere autorización)', onClick: () => {}, danger: true, disabled: true },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-text-primary mb-1">Caja Chica</h2>
          <p className="text-sm text-text-secondary">Control de gastos e ingresos menores de la operación diaria</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" className="hidden sm:flex items-center gap-2" onClick={handleExport} disabled={filteredMovements.length === 0}>
            <Download size={16} />
            Exportar
          </Button>
          {toRefill > 0 && (
            <Button variant="secondary" className="hidden lg:flex items-center gap-2" onClick={handleRefill}>
              Solicitar reposición ({money(toRefill)})
            </Button>
          )}
          <Button variant="secondary" className="flex items-center gap-2" onClick={() => handleOpenMovement('Ingreso')}>
            <ArrowUpRight size={16} className="text-success-text" />
            Registrar ingreso
          </Button>
          <Button variant="primary" className="flex items-center gap-2" onClick={() => handleOpenMovement('Egreso')}>
            <ArrowDownRight size={16} />
            Registrar egreso
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card className="p-4">
          <span className="text-sm font-medium text-text-secondary">Ingresos (Mes actual)</span>
          <div className="flex items-center gap-2 mt-2">
            <ArrowUpRight size={18} className="text-success-text" />
            <h3 className="text-xl font-semibold text-text-primary">{money(month.income)}</h3>
          </div>
        </Card>
        <Card className="p-4">
          <span className="text-sm font-medium text-text-secondary">Egresos (Mes actual)</span>
          <div className="flex items-center gap-2 mt-2">
            <ArrowDownRight size={18} className="text-danger-text" />
            <h3 className="text-xl font-semibold text-text-primary">{money(month.expense)}</h3>
          </div>
        </Card>
        <Card className="p-4 bg-surface-muted border-primary-accent/20">
          <span className="text-sm font-medium text-text-secondary">Saldo Actual</span>
          <div className="mt-2">
            <h3 className="text-xl font-semibold text-text-primary">{money(balance)}</h3>
          </div>
          <p className="text-xs text-text-muted mt-1">Fondo {money(pettyFund.assigned)} · tope por gasto {money(pettyFund.maxExpense)}</p>
        </Card>
        <Card className="p-4">
          <div className="flex justify-between items-start">
            <span className="text-sm font-medium text-text-secondary">Estado</span>
            <Badge variant={lastClosed ? 'neutral' : 'success'}>{lastClosed ? `Cerrada al ${lastClosed.split('-').reverse().join('/')}` : 'Abierta'}</Badge>
          </div>
          <p className="text-xs text-text-muted mt-2">{toRefill > 0 ? `Por reponer: ${money(toRefill)}` : 'El fondo está completo'}</p>
          <div className="flex gap-3 mt-1">
            {can(PERM.closePetty) && <button type="button" className="text-xs font-medium text-primary-accent hover:underline" onClick={() => setCloseOpen(true)}>Arqueo y cierre</button>}
            {can(PERM.configPetty) && <button type="button" className="text-xs font-medium text-primary-accent hover:underline" onClick={openFund}>Configurar fondo</button>}
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
                placeholder="Buscar por concepto, categoría o comprobante..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full h-10 bg-surface border border-border-soft rounded-xl pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary-accent focus:ring-1 focus:ring-primary-accent transition-shadow"
              />
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 md:pb-0">
              <select
                value={kindFilter}
                onChange={(e) => setKindFilter(e.target.value)}
                className="h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent min-w-[140px]"
              >
                <option value="">Tipo</option>
                <option value="Ingreso">Ingreso</option>
                <option value="Egreso">Egreso</option>
              </select>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent min-w-[140px]"
              >
                <option value="">Categoría</option>
                {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
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
                <th className="px-6 py-3 font-medium">Categoría</th>
                <th className="px-6 py-3 font-medium">Concepto</th>
                <th className="px-6 py-3 font-medium text-right">Monto</th>
                <th className="px-6 py-3 font-medium">Usuario</th>
                <th className="px-6 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-soft">
              {paginatedMovements.map((row) => {
                const reversed = row.status === 'Reversado';
                return (
                  <tr key={row.id} className="hover:bg-surface-muted/50 transition-colors even:bg-surface-muted/30">
                    <td className="px-6 py-3 text-text-secondary whitespace-nowrap">{when(row.date)}</td>
                    <td className="px-6 py-3">
                      <Badge variant={reversed ? 'danger' : row.kind === 'Ingreso' ? 'success' : 'neutral'}>{reversed ? 'Reversado' : row.kind}</Badge>
                    </td>
                    <td className="px-6 py-3 text-text-secondary">{row.category}</td>
                    <td className={`px-6 py-3 font-medium ${reversed ? 'text-text-muted line-through' : 'text-text-primary'}`}>
                      {row.concept}
                      {row.reference && <div className="text-xs font-normal text-text-muted no-underline">{row.reference}</div>}
                    </td>
                    <td className={`px-6 py-3 text-right font-medium ${reversed ? 'text-text-muted line-through' : row.kind === 'Ingreso' ? 'text-success-text' : 'text-text-primary'}`}>
                      {row.kind === 'Ingreso' ? '+' : '-'}{money(row.amount)}
                    </td>
                    <td className="px-6 py-3 text-text-secondary">{row.user}</td>
                    <td className="px-6 py-3 text-right">
                      <ActionMenu items={rowActions(row)} />
                    </td>
                  </tr>
                );
              })}
              {paginatedMovements.length === 0 && (
                <tr><td colSpan={7} className="px-6 py-10 text-center text-text-muted">No hay movimientos con esos filtros.</td></tr>
              )}
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
        title={`Registrar ${form.kind === 'Ingreso' ? 'Ingreso' : 'Egreso'} - Caja Chica`}
        size="md"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setIsNewMovementOpen(false)}>Cancelar</Button>
            <Button variant="primary" onClick={handleSave}>Guardar movimiento</Button>
          </div>
        }
      >
        <div className="space-y-4">
          {(serverError || (submitted && errorCount > 0)) && (
            <div className="bg-danger-tint border border-danger-text/20 rounded-xl p-3 flex gap-2 text-sm text-danger-text">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <p>{serverError ?? `Revise ${errorCount} ${errorCount === 1 ? 'campo marcado' : 'campos marcados'} antes de guardar.`}</p>
            </div>
          )}
          <p className="text-xs text-text-muted">Saldo actual de la caja chica: <span className="font-medium text-text-primary">{money(balance)}</span></p>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Fecha" required error={err('date')}>
              <DateInput max={today} value={form.date} onChange={e => set({ date: e.target.value })} />
            </Field>
            <Field label="Categoría" required error={err('category')}>
              <select className={cls('category')} value={form.category} onChange={e => set({ category: e.target.value })}>
                <option value="">Seleccionar...</option>
                {PETTY_CATEGORIES[form.kind].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Concepto" required error={err('concept')}>
            <input type="text" className={cls('concept')} maxLength={120} value={form.concept} onChange={e => set({ concept: e.target.value })} placeholder={`Descripción del ${form.kind.toLowerCase()}`} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Monto (PEN)" required error={err('amount')}>
              <input type="number" min={0} step="0.01" className={cls('amount')} value={form.amount} onChange={e => set({ amount: e.target.value })} placeholder="0.00" />
            </Field>
            <Field label="Medio" required error={err('method')}>
              <select className={cls('method')} value={form.method} onChange={e => set({ method: e.target.value })}>
                {PETTY_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Comprobante / Referencia">
            <input type="text" className={inputCls} value={form.reference} onChange={e => set({ reference: e.target.value })} placeholder="N° de boleta, recibo, etc." />
          </Field>
          <Field label="Evidencia (adjunto)" hint="El sistema guarda el nombre del archivo; el almacenamiento de archivos aún no está activo.">
            <label className="w-full h-16 border-2 border-dashed border-border-soft rounded-xl flex items-center justify-center gap-2 text-sm text-text-muted hover:bg-surface-muted transition-colors cursor-pointer">
              <Paperclip size={16} />
              {form.evidence || 'Click para elegir archivo o foto'}
              <input type="file" accept="image/*,.pdf" className="hidden" onChange={e => set({ evidence: e.target.files?.[0]?.name ?? '' })} />
            </label>
          </Field>
          <Field label="Observaciones">
            <textarea className="w-full h-20 bg-surface border border-border-soft rounded-xl p-3 text-sm focus:border-primary-accent outline-none resize-none" value={form.observations} onChange={e => set({ observations: e.target.value })} placeholder="Notas adicionales..." />
          </Field>
        </div>
      </Modal>

      <CloseCashModal isOpen={closeOpen} onClose={() => setCloseOpen(false)} scope="caja-chica" currency="PEN" />

      <Modal
        isOpen={fundOpen}
        onClose={() => setFundOpen(false)}
        title="Configurar fondo de la caja chica"
        size="md"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setFundOpen(false)}>Cancelar</Button>
            <Button variant="primary" onClick={saveFund}>Guardar</Button>
          </div>
        }
      >
        <div className="space-y-4">
          {fundError && <div className="bg-danger-tint border border-danger-text/20 rounded-xl p-3 text-sm text-danger-text">{fundError}</div>}
          <Field label="Fondo fijo asignado (S/)" required error={fundOpen ? fundErrors.assigned : undefined} hint="Es lo que debe haber en caja chica después de cada reposición.">
            <input type="number" min={0} step="0.01" className={inputCls} value={fundForm.assigned} onChange={e => { setFundForm(f => ({ ...f, assigned: e.target.value })); setFundError(null); }} />
          </Field>
          <Field label="Tope por gasto (S/)" required error={fundOpen ? fundErrors.maxExpense : undefined} hint="Un gasto mayor se registra como egreso en Caja, con su comprobante.">
            <input type="number" min={0} step="0.01" className={inputCls} value={fundForm.maxExpense} onChange={e => { setFundForm(f => ({ ...f, maxExpense: e.target.value })); setFundError(null); }} />
          </Field>
        </div>
      </Modal>

      {/* Detalle / comprobante */}
      <Modal isOpen={!!detail} onClose={() => setDetailId(null)} title="Detalle del movimiento" size="lg" footer={<div className="flex justify-end w-full"><Button variant="ghost" onClick={() => setDetailId(null)}>Cerrar</Button></div>}>
        {detail && (
          <div className="space-y-5 pb-2">
            <div className="flex flex-wrap items-center justify-between gap-3 bg-surface-muted border border-border-soft rounded-xl p-4">
              <div>
                <p className="font-semibold text-text-primary">{detail.concept}</p>
                <p className="text-xs text-text-muted">{detail.id} · {detail.category}</p>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={detail.status === 'Reversado' ? 'danger' : detail.kind === 'Ingreso' ? 'success' : 'neutral'}>{detail.status === 'Reversado' ? 'Reversado' : detail.kind}</Badge>
                <span className={`text-xl font-semibold ${detail.status === 'Reversado' ? 'line-through text-text-muted' : detail.kind === 'Ingreso' ? 'text-success-text' : 'text-text-primary'}`}>{detail.kind === 'Ingreso' ? '+' : '-'}{money(detail.amount)}</span>
              </div>
            </div>
            {detail.reversal && (
              <div className="bg-danger-tint border border-danger-text/20 rounded-xl p-3 text-sm text-danger-text">
                <p className="font-semibold">Reversado por {detail.reversal.by} el {when(detail.reversal.at)}</p>
                <p>{detail.reversal.reason} — {detail.reversal.detail}</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4 text-sm">
              {[
                ['Fecha y hora', when(detail.date)],
                ['Registrado por', detail.user],
                ['Medio', detail.method],
                ['Comprobante / referencia', detail.reference ?? '—'],
                ['Evidencia', detail.evidence ?? 'Sin archivo adjunto'],
                ['Observaciones', detail.observations ?? '—'],
              ].map(([label, value]) => (
                <div key={label}>
                  <span className="block text-xs text-text-muted uppercase tracking-wider">{label}</span>
                  <span className="font-medium text-text-primary">{value}</span>
                </div>
              ))}
            </div>
            {detail.evidence && <p className="text-xs text-text-muted">La vista previa del archivo estará disponible cuando se active el almacenamiento.</p>}
          </div>
        )}
      </Modal>

      {/* Reversa */}
      <ReasonDialog
        isOpen={!!toReverse}
        onClose={() => setToReverseId(null)}
        title="Reversar movimiento de caja chica"
        confirmLabel="Reversar movimiento"
        danger
        reasons={PETTY_REVERSAL_REASONS}
        reasonLabel="Motivo de la reversa"
        blocked={toReverse && reverseProblems.length > 0 ? reverseProblems[0] : null}
        onSubmit={({ reason, detail: why }) => {
          if (!toReverse) return;
          const r = reversePettyCashMovement(toReverse.id, { reason, detail: why });
          return r.ok ? null : r.error ?? 'No se pudo reversar el movimiento.';
        }}
      >
        {toReverse && (
          <div className="space-y-3 text-sm">
            <div className="bg-surface-muted border border-border-soft rounded-xl p-3">
              <p className="font-medium text-text-primary">{toReverse.concept} · {toReverse.kind === 'Ingreso' ? '+' : '-'}{money(toReverse.amount)}</p>
              <p className="text-xs text-text-muted">{toReverse.id} · {toReverse.category}</p>
            </div>
            <ul className="space-y-1 text-text-secondary list-disc pl-5">
              <li>No se borra: queda marcado «Reversado» con quién, cuándo y por qué, y deja de contar.</li>
              <li>Saldo de la caja chica: {money(balance)} → {money(pettyBalanceAfterReversal(toReverse, pettyCashMovements))}.</li>
            </ul>
          </div>
        )}
      </ReasonDialog>
    </div>
  );
}
