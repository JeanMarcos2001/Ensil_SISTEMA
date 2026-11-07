import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeft, FileText, Plus, Printer, Trash2 } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Modal } from '../../components/ui/Modal';
import { ReasonDialog } from '../../components/ui/ReasonDialog';
import { useData, type PayrollLine, type PayrollRun } from '../../context/DataContext';
import { PERM } from '../../utils/authority';
import { csvFileName, downloadCsv } from '../../utils/exportCsv';
import { addPeriods, periodLabel, periodOf } from '../../utils/payrollEngine';
import { PAYROLL_HEADERS, payrollRows, payslipHtml, totalsOf } from '../../utils/payrollRun';
import { printHtml, printTable } from '../../utils/printTable';
import { todayLocalISO } from '../../utils/schedule';
import { Field, inputCls } from '../enrollment/fields';

const money = (n: number) => `S/ ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const STATUS_TONE: Record<PayrollRun['status'], 'warning' | 'info'> = { Borrador: 'warning', Cerrada: 'info' };
const when = (iso: string) => new Date(iso).toLocaleString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <Card className="p-4">
      <span className="text-sm font-medium text-text-secondary">{label}</span>
      <h3 className={`text-xl font-semibold mt-2 ${tone ?? 'text-text-primary'}`}>{value}</h3>
      {hint && <p className="text-xs text-text-muted mt-1">{hint}</p>}
    </Card>
  );
}

/**
 * Personas → Planilla: la planilla de cada mes sale de los contratos (sueldo, pensión, renta de 5.ª, gratificación…),
 * se ajusta en borrador (bonos y descuentos con motivo), se cierra como foto, se marca como pagada y emite boletas.
 */
export function Payroll() {
  const {
    payrollRuns, payrollLinesOf, generatePayroll, deletePayrollDraft, addPayrollAdjustment, removePayrollAdjustment, closePayroll, reopenPayroll, companies, staff, can,
  } = useData();
  const today = todayLocalISO();
  const [params, setParams] = useSearchParams();
  const staffFilter = params.get('trabajador') ?? '';
  const [openId, setOpenId] = useState<string | null>(null);
  const [period, setPeriod] = useState(periodOf(today));
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [lineOpen, setLineOpen] = useState<string | null>(null);
  const [adjusting, setAdjusting] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [adjForm, setAdjForm] = useState({ staffId: '', kind: 'Ingreso' as 'Ingreso' | 'Descuento', concept: '', amount: '', taxable: true, reason: '' });
  const [adjError, setAdjError] = useState<string | null>(null);

  const run = payrollRuns.find(r => r.id === openId);
  const built = useMemo(() => (run ? payrollLinesOf(run) : { lines: [] as PayrollLine[], warnings: [] }), [run, payrollLinesOf]);
  const totals = totalsOf(built.lines);
  // El contrato todavía no sabe de qué empresa es (Lote 3): con varias empresas no se adivina una, se rotula «ENSIL».
  const onlyCompany = companies.filter(c => c.status === 'Activo').length === 1 ? companies.find(c => c.status === 'Activo') : undefined;
  const company = onlyCompany?.commercialName || onlyCompany?.name || 'ENSIL';
  const member = staffFilter ? staff.find(s => s.id === staffFilter) : undefined;

  if (!can(PERM.payrollView)) {
    return <div className="flex items-center justify-center h-full text-text-muted"><p>Su rol no tiene permiso para ver las planillas.</p></div>;
  }

  const report = (r: { ok: boolean; error?: string }, okText: string) => setMessage({ ok: r.ok, text: r.ok ? okText : r.error ?? 'No se pudo completar.' });
  const line = run && lineOpen ? built.lines.find(l => `${l.contractId}` === lineOpen) : undefined;
  const editable = run?.status === 'Borrador' && can(PERM.payrollAdjust);

  const openAdjust = (staffId = '') => { setAdjForm({ staffId, kind: 'Ingreso', concept: '', amount: '', taxable: true, reason: '' }); setAdjError(null); setAdjusting(true); };
  const submitAdjust = () => {
    if (!run) return;
    const res = addPayrollAdjustment(run.id, { staffId: adjForm.staffId, kind: adjForm.kind, concept: adjForm.concept, amount: Number(adjForm.amount), taxable: adjForm.taxable, reason: adjForm.reason });
    if (!res.ok) { setAdjError(res.error ?? 'No se pudo agregar el ajuste.'); return; }
    setAdjusting(false);
    setMessage({ ok: true, text: 'Ajuste agregado: la planilla se recalculó.' });
  };

  const exportRun = () => run && downloadCsv(csvFileName(`Planilla ${run.period}`, today), PAYROLL_HEADERS, payrollRows(built.lines));
  const printRun = () => run && printTable(`Planilla de ${periodLabel(run.period)}`, `${company} · ${built.lines.length} trabajador(es) · neto ${money(totals.net)}`, PAYROLL_HEADERS, payrollRows(built.lines));
  const printSlip = (l: PayrollLine) => run && printHtml(payslipHtml(l, run.period, company));

  // ---------------------------------------------------------------- Detalle de una planilla
  if (run) {
    const errors = built.warnings.filter(w => w.level === 'error');
    const notices = built.warnings.filter(w => w.level === 'aviso');
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap justify-between items-start gap-3">
          <div>
            <button type="button" onClick={() => { setOpenId(null); setMessage(null); }} className="text-sm text-primary-accent hover:underline flex items-center gap-1 mb-2"><ArrowLeft size={14} /> Todas las planillas</button>
            <h2 className="text-2xl font-semibold text-text-primary flex items-center gap-3">Planilla de {periodLabel(run.period)} <Badge variant={STATUS_TONE[run.status]}>{run.status}</Badge></h2>
            <p className="text-sm text-text-secondary mt-1">
              {run.status === 'Borrador' ? 'Se recalcula con los contratos. Ajuste lo eventual y ciérrela.' : `Cerrada el ${run.closedAt ? when(run.closedAt) : ''} por ${run.closedBy}. Las líneas son una foto: cambiar un contrato ya no las altera.`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" className="gap-2" onClick={printRun} disabled={built.lines.length === 0}><Printer size={16} /> PDF</Button>
            <Button variant="secondary" onClick={exportRun} disabled={built.lines.length === 0}>Exportar CSV</Button>
            {run.status === 'Borrador' && <Button variant="secondary" className="gap-2" onClick={() => openAdjust()} disabled={!editable || built.lines.length === 0}><Plus size={16} /> Ajuste</Button>}
            {run.status === 'Borrador' && <Button variant="primary" onClick={() => setConfirmClose(true)} disabled={!can(PERM.payrollClose) || built.lines.length === 0 || errors.length > 0}>Cerrar planilla</Button>}
            {run.status === 'Borrador' && <Button variant="ghost" onClick={() => setConfirmDelete(true)} disabled={!can(PERM.payrollGenerate)}>Eliminar borrador</Button>}
            {run.status === 'Cerrada' && <Button variant="secondary" onClick={() => setReopening(true)} disabled={!can(PERM.payrollReopen)}>Reabrir</Button>}
          </div>
        </div>

        {message && <p className={`text-sm ${message.ok ? 'text-success-text' : 'text-danger-text'}`}>{message.text}</p>}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Kpi label="Trabajadores" value={String(totals.headcount)} hint={`${built.lines.length} línea(s) de contrato`} />
          <Kpi label="Total ingresos" value={money(totals.income)} />
          <Kpi label="Descuentos" value={money(totals.pension + totals.incomeTax + totals.otherDeductions)} hint={`Pensión ${money(totals.pension)} · Renta ${money(totals.incomeTax)}`} />
          <Kpi label="Neto a pagar" value={money(totals.net)} tone="text-primary-accent" />
          <Kpi label="EsSalud (empleador)" value={money(totals.essalud)} />
          <Kpi label="Costo del empleador" value={money(totals.employerCost)} hint="Ingresos + EsSalud" />
          <Kpi label="CTS a depositar" value={money(totals.cts)} hint="Mayo y noviembre; no es parte del neto" />
        </div>

        {(errors.length > 0 || notices.length > 0) && (
          <div className="space-y-2">
            {errors.length > 0 && <div className="bg-danger-tint border border-danger-text/20 rounded-xl p-3 text-sm text-danger-text"><p className="font-medium mb-1">Hay que corregir antes de cerrar:</p><ul className="list-disc pl-5">{errors.map(w => <li key={w.text}>{w.text}</li>)}</ul></div>}
            {notices.length > 0 && <div className="bg-warning-tint/60 border border-warning-text/20 rounded-xl p-3 text-sm text-warning-text"><ul className="list-disc pl-5">{notices.map(w => <li key={w.text}>{w.text}</li>)}</ul></div>}
          </div>
        )}

        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-text-secondary uppercase bg-surface-muted/50">
                <tr>
                  <th className="px-4 py-3 font-medium">Trabajador</th>
                  <th className="px-4 py-3 font-medium text-right">Días</th>
                  <th className="px-4 py-3 font-medium text-right">Ingresos</th>
                  <th className="px-4 py-3 font-medium text-right">Pensión</th>
                  <th className="px-4 py-3 font-medium text-right">Renta</th>
                  <th className="px-4 py-3 font-medium text-right">Otros desc.</th>
                  <th className="px-4 py-3 font-medium text-right">Neto</th>
                  <th className="px-4 py-3 font-medium text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-soft">
                {built.lines.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-text-muted">No hay contratos que cubran este mes.</td></tr>}
                {built.lines.map(l => (
                  <tr key={l.contractId} className="hover:bg-surface-muted/50">
                    <td className="px-4 py-3"><div className="font-medium text-text-primary">{l.staffName}</div><div className="text-xs text-text-muted">{l.contractType}{l.branch ? ` · ${l.branch}` : ''}{l.role ? ` · ${l.role}` : ''}</div></td>
                    <td className="px-4 py-3 text-right">{l.calc.days}/{l.calc.daysInMonth}</td>
                    <td className="px-4 py-3 text-right">{money(l.calc.totalIncome)}{l.calc.gratification > 0 && <div className="text-xs text-text-muted">con gratificación</div>}</td>
                    <td className="px-4 py-3 text-right">{money(l.calc.pension)}</td>
                    <td className="px-4 py-3 text-right">{money(l.calc.incomeTax)}</td>
                    <td className="px-4 py-3 text-right">{l.calc.otherDeductions > 0 ? money(l.calc.otherDeductions) : '—'}</td>
                    <td className="px-4 py-3 text-right font-semibold text-text-primary">{money(l.calc.net)}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <Button variant="ghost" size="sm" onClick={() => setLineOpen(l.contractId)}>Detalle</Button>
                      <Button variant="ghost" size="sm" className="gap-1" onClick={() => printSlip(l)}><FileText size={14} /> Boleta</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <h4 className="text-sm font-bold text-text-primary uppercase tracking-wider mb-3">Historial de la planilla</h4>
          <ol className="space-y-1.5 text-sm">
            {[...run.events].reverse().map((e, i) => (
              <li key={i} className="flex flex-wrap gap-x-3"><span className="text-text-muted w-44 shrink-0">{when(e.at)}</span><span className="font-medium text-text-primary">{e.action}</span><span className="text-text-secondary">{e.detail}</span><span className="text-text-muted">· {e.by}</span></li>
            ))}
          </ol>
        </Card>

        {/* Detalle de una línea */}
        <Modal isOpen={!!line} onClose={() => setLineOpen(null)} title={line ? `${line.staffName} · ${periodLabel(run.period)}` : ''} size="2xl" footer={<div className="flex justify-end gap-3 w-full">{line && <Button variant="secondary" className="gap-2" onClick={() => printSlip(line)}><FileText size={16} /> Boleta</Button>}<Button variant="ghost" onClick={() => setLineOpen(null)}>Cerrar</Button></div>}>
          {line && (
            <div className="space-y-5 pb-2 text-sm">
              <p className="text-text-secondary">{line.contractType} · {line.docType} {line.docNumber}{line.pensionSystem ? ` · ${line.pensionSystem}${line.pensionFund ? ` ${line.pensionFund}` : ''}` : ''} · sueldo del contrato {money(line.grossSalary)}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h5 className="text-xs font-bold text-text-primary uppercase tracking-wider mb-2">Ingresos</h5>
                  <table className="w-full"><tbody className="divide-y divide-border-soft">
                    {([['Remuneración', line.calc.basic], ['Asignación familiar', line.calc.familyAllowance], ['Gratificación', line.calc.gratification], ['Bonificación extraordinaria (9 %)', line.calc.gratificationBonus], ['Ingresos eventuales afectos', line.calc.extraTaxable], ['Ingresos eventuales inafectos', line.calc.extraNonTaxable]] as [string, number][]).filter(([, v]) => v > 0).map(([k, v]) => <tr key={k}><td className="py-1.5 text-text-secondary">{k}</td><td className="py-1.5 text-right">{money(v)}</td></tr>)}
                    <tr><td className="py-1.5 font-semibold">Total ingresos</td><td className="py-1.5 text-right font-semibold">{money(line.calc.totalIncome)}</td></tr>
                  </tbody></table>
                </div>
                <div>
                  <h5 className="text-xs font-bold text-text-primary uppercase tracking-wider mb-2">Descuentos</h5>
                  <table className="w-full"><tbody className="divide-y divide-border-soft">
                    {([[line.pensionSystem === 'ONP' ? 'ONP' : 'Aporte AFP', line.calc.pension], [`Renta de ${line.calc.taxKind ?? '5.ª categoría'}`, line.calc.incomeTax], ['Otros descuentos', line.calc.otherDeductions]] as [string, number][]).filter(([, v]) => v > 0).map(([k, v]) => <tr key={k}><td className="py-1.5 text-text-secondary">{k}</td><td className="py-1.5 text-right">{money(v)}</td></tr>)}
                    <tr><td className="py-1.5 font-semibold">Total descuentos</td><td className="py-1.5 text-right font-semibold">{money(line.calc.totalDeductions)}</td></tr>
                    <tr><td className="py-2 font-bold text-primary-accent">Neto a pagar</td><td className="py-2 text-right font-bold text-primary-accent">{money(line.calc.net)}</td></tr>
                  </tbody></table>
                </div>
              </div>
              {line.calc.fifth && (
                <div className="bg-surface-muted rounded-xl p-3 border border-border-soft">
                  <h5 className="text-xs font-bold text-text-primary uppercase tracking-wider mb-2">Cómo se calculó la renta de 5.ª categoría</h5>
                  <p className="text-text-secondary">Ingreso anual proyectado {money(line.calc.fifth.annualIncome)} − 7 UIT ({money(line.calc.fifth.deduction)}) = renta neta {money(line.calc.fifth.netIncome)} → impuesto anual {money(line.calc.fifth.annualTax)}. Ya retenido en el año: {money(line.calc.fifth.alreadyWithheld)}; se divide entre {line.calc.fifth.divisor} → {money(line.calc.incomeTax)} este mes.</p>
                  <p className="text-xs text-text-muted mt-1">Proyección con el sueldo del contrato; los meses previos salen de las planillas cerradas (o se suponen regulares). La valida contabilidad.</p>
                </div>
              )}
              <p className="text-text-secondary">EsSalud (empleador): {money(line.calc.essalud)}{line.calc.ctsDeposit > 0 ? ` · CTS a depositar: ${money(line.calc.ctsDeposit)}` : ''}</p>
              {line.warnings.length > 0 && <ul className="list-disc pl-5 text-text-muted">{line.warnings.map(w => <li key={w}>{w}</li>)}</ul>}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h5 className="text-xs font-bold text-text-primary uppercase tracking-wider">Ajustes eventuales</h5>
                  {editable && <Button variant="ghost" size="sm" className="gap-1" onClick={() => { setLineOpen(null); openAdjust(line.staffId); }}><Plus size={14} /> Agregar</Button>}
                </div>
                {line.adjustments.length === 0 ? <p className="text-text-muted">Sin ajustes.</p> : (
                  <ul className="divide-y divide-border-soft">
                    {line.adjustments.map(a => (
                      <li key={a.id} className="py-2 flex items-start justify-between gap-3">
                        <div><span className="font-medium text-text-primary">{a.kind}: {a.concept}</span> <span className="text-text-secondary">{money(a.amount)}</span>{a.kind === 'Ingreso' && !a.taxable && <span className="text-xs text-text-muted"> · inafecto</span>}<div className="text-xs text-text-muted">{a.reason} · {a.by}</div></div>
                        {editable && <button type="button" className="p-1.5 text-text-muted hover:text-danger-text hover:bg-danger-tint rounded-lg" title="Quitar ajuste" onClick={() => { report(removePayrollAdjustment(run.id, a.id), 'Ajuste quitado.'); }}><Trash2 size={16} /></button>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </Modal>

        {/* Ajuste */}
        <Modal isOpen={adjusting} onClose={() => setAdjusting(false)} title="Ajuste de la planilla" size="lg" footer={<div className="flex justify-end gap-3 w-full"><Button variant="ghost" onClick={() => setAdjusting(false)}>Cancelar</Button><Button variant="primary" onClick={submitAdjust}>Agregar ajuste</Button></div>}>
          <div className="space-y-4 pb-2">
            {adjError && <div className="bg-danger-tint border border-danger-text/20 rounded-xl p-3 text-sm text-danger-text">{adjError}</div>}
            <Field label="Trabajador" required>
              <select className={inputCls} value={adjForm.staffId} onChange={e => setAdjForm({ ...adjForm, staffId: e.target.value })}>
                <option value="">Seleccionar...</option>
                {[...new Map(built.lines.map(l => [l.staffId, l.staffName])).entries()].map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Tipo" required>
                <select className={inputCls} value={adjForm.kind} onChange={e => setAdjForm({ ...adjForm, kind: e.target.value as 'Ingreso' | 'Descuento' })}>
                  <option value="Ingreso">Ingreso (bono, comisión, horas extra)</option>
                  <option value="Descuento">Descuento (adelanto, tardanza)</option>
                </select>
              </Field>
              <Field label="Monto (S/)" required><input type="number" min={0} step="0.01" className={inputCls} value={adjForm.amount} onChange={e => setAdjForm({ ...adjForm, amount: e.target.value })} /></Field>
            </div>
            <Field label="Concepto" required><input className={inputCls} value={adjForm.concept} onChange={e => setAdjForm({ ...adjForm, concept: e.target.value })} placeholder="Ej. Bono por metas de septiembre" /></Field>
            {adjForm.kind === 'Ingreso' && (
              <label className="flex items-start gap-2 text-sm text-text-primary cursor-pointer">
                <input type="checkbox" className="mt-0.5 rounded border-border-soft" checked={adjForm.taxable} onChange={e => setAdjForm({ ...adjForm, taxable: e.target.checked })} />
                <span>Afecto a aportes de pensión y a renta <span className="block text-xs text-text-muted">Un bono o comisión sí; una movilidad o refrigerio inafecto, no.</span></span>
              </label>
            )}
            <Field label="Motivo" required hint="Queda en la planilla y en el historial."><input className={inputCls} value={adjForm.reason} onChange={e => setAdjForm({ ...adjForm, reason: e.target.value })} /></Field>
          </div>
        </Modal>

        <ConfirmDialog
          isOpen={confirmClose}
          onClose={() => setConfirmClose(false)}
          onConfirm={() => report(closePayroll(run.id), 'Planilla cerrada: quedó como foto y alimenta la renta de los meses siguientes.')}
          title="Cerrar la planilla"
          description={`Se cerrará la planilla de ${periodLabel(run.period)}: ${totals.headcount} trabajador(es), neto ${money(totals.net)}. Las líneas quedan como foto (cambiar un contrato ya no las altera) y no se ajustan; para corregir hay que reabrirla con un motivo.`}
          confirmLabel="CERRAR PLANILLA"
        />
        <ConfirmDialog
          isOpen={confirmDelete}
          onClose={() => setConfirmDelete(false)}
          onConfirm={() => { const r = deletePayrollDraft(run.id); report(r, 'Borrador eliminado.'); if (r.ok) setOpenId(null); }}
          title="Eliminar el borrador"
          description={`Se eliminará el borrador de ${periodLabel(run.period)} con sus ajustes. Se puede generar de nuevo.`}
          variant="danger"
          confirmLabel="SÍ, ELIMINAR"
        />
        <ReasonDialog
          isOpen={reopening}
          onClose={() => setReopening(false)}
          title="Reabrir la planilla"
          size="md"
          confirmLabel="Reabrir"
          danger
          detailLabel="Motivo de la reapertura"
          detailPlaceholder="Qué se corregirá y por qué"
          onSubmit={({ detail }) => { const r = reopenPayroll(run.id, detail); if (r.ok) setMessage({ ok: true, text: 'Planilla reabierta: vuelve a ser un borrador.' }); return r.ok ? null : r.error ?? 'No se pudo reabrir.'; }}
        >
          <p className="text-sm text-text-secondary">Vuelve a ser un borrador y se recalcula con los contratos de hoy. Queda en el historial con su motivo.</p>
        </ReasonDialog>
      </div>
    );
  }

  // ---------------------------------------------------------------- Lista de planillas
  const nextPeriod = payrollRuns.length > 0 ? addPeriods(payrollRuns[0].period, 1) : periodOf(today);
  const history = member
    ? payrollRuns.flatMap(r => payrollLinesOf(r).lines.filter(l => l.staffId === member.id).map(l => ({ run: r, line: l })))
    : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap justify-between items-start gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-text-primary mb-1">Planilla</h2>
          <p className="text-sm text-text-secondary">Sueldos mensuales calculados desde los contratos: pensión, renta de 5.ª categoría, gratificaciones y aportes del empleador.</p>
        </div>
        <div className="flex items-end gap-2">
          <div className="w-44">
            <label className="text-xs font-medium text-text-secondary">Mes</label>
            <input type="month" className={inputCls} value={period} max={periodOf(today)} onChange={e => { setPeriod(e.target.value); setMessage(null); }} />
          </div>
          <Button variant="primary" className="gap-2" onClick={() => { const r = generatePayroll(period); report(r, `Planilla de ${periodLabel(period)} generada.`); if (r.ok) setOpenId(`PLA-${period}`); }} disabled={!can(PERM.payrollGenerate)}><Plus size={16} /> Generar planilla</Button>
        </div>
      </div>
      {message && <p className={`text-sm ${message.ok ? 'text-success-text' : 'text-danger-text'}`}>{message.text}</p>}

      {member && (
        <Card className="p-0 overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <h4 className="text-sm font-bold text-text-primary uppercase tracking-wider">Planillas de {member.names} {member.lastNameP}</h4>
            <button type="button" className="text-xs text-primary-accent hover:underline" onClick={() => setParams({}, { replace: true })}>Ver todas</button>
          </div>
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-text-secondary uppercase bg-surface-muted/50"><tr><th className="px-4 py-2 font-medium">Mes</th><th className="px-4 py-2 font-medium">Estado</th><th className="px-4 py-2 font-medium">Contrato</th><th className="px-4 py-2 font-medium text-right">Ingresos</th><th className="px-4 py-2 font-medium text-right">Descuentos</th><th className="px-4 py-2 font-medium text-right">Neto</th><th /></tr></thead>
            <tbody className="divide-y divide-border-soft">
              {history.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-center text-text-muted">Todavía no figura en ninguna planilla.</td></tr>}
              {history.map(({ run: r, line: l }) => (
                <tr key={`${r.id}-${l.contractId}`}>
                  <td className="px-4 py-2">{periodLabel(r.period)}</td>
                  <td className="px-4 py-2"><Badge variant={STATUS_TONE[r.status]}>{r.status}</Badge></td>
                  <td className="px-4 py-2 text-text-secondary">{l.contractId} · {l.contractType}</td>
                  <td className="px-4 py-2 text-right">{money(l.calc.totalIncome)}</td>
                  <td className="px-4 py-2 text-right">{money(l.calc.totalDeductions)}</td>
                  <td className="px-4 py-2 text-right font-semibold">{money(l.calc.net)}</td>
                  <td className="px-4 py-2 text-right"><button type="button" className="text-xs text-primary-accent hover:underline" onClick={() => setOpenId(r.id)}>Abrir</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Card className="p-0 overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-text-secondary uppercase bg-surface-muted/50">
            <tr><th className="px-4 py-3 font-medium">Mes</th><th className="px-4 py-3 font-medium">Estado</th><th className="px-4 py-3 font-medium text-right">Trabajadores</th><th className="px-4 py-3 font-medium text-right">Neto</th><th className="px-4 py-3 font-medium text-right">Costo del empleador</th><th className="px-4 py-3 font-medium text-right">Acciones</th></tr>
          </thead>
          <tbody className="divide-y divide-border-soft">
            {payrollRuns.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-text-muted">Todavía no hay planillas. Elija el mes y pulse «Generar planilla»; se arma con los contratos de ese mes (sugerido: {periodLabel(nextPeriod)}).</td></tr>}
            {payrollRuns.map(r => {
              const t = totalsOf(payrollLinesOf(r).lines);
              return (
                <tr key={r.id} className="hover:bg-surface-muted/50 cursor-pointer" onClick={() => { setOpenId(r.id); setMessage(null); }}>
                  <td className="px-4 py-3 font-medium text-text-primary">{periodLabel(r.period)}<div className="text-xs font-normal text-text-muted font-mono">{r.id}</div></td>
                  <td className="px-4 py-3"><Badge variant={STATUS_TONE[r.status]}>{r.status}</Badge></td>
                  <td className="px-4 py-3 text-right">{t.headcount}</td>
                  <td className="px-4 py-3 text-right font-semibold">{money(t.net)}</td>
                  <td className="px-4 py-3 text-right">{money(t.employerCost)}</td>
                  <td className="px-4 py-3 text-right"><span className="text-xs text-primary-accent">Abrir</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
