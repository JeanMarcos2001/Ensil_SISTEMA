import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Printer } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { useData } from '../../context/DataContext';
import { PERM } from '../../utils/authority';
import { BUCKETS, agingSummary, dueCalendar, groupBy, portfolioKpis, portfolioRows, topDebtors, type GroupFigure } from '../../utils/collections';
import { csvFileName, downloadCsv } from '../../utils/exportCsv';
import { printTable } from '../../utils/printTable';
import { todayLocalISO } from '../../utils/schedule';

const usd = (n: number) => `$ ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dmy = (iso: string) => iso.split('-').reverse().join('/');
const BAR: Record<string, string> = { 'Por vencer': 'bg-success-text', '1 a 30 días': 'bg-warning-text', '31 a 60 días': 'bg-warning-text', '61 a 90 días': 'bg-danger-text', 'Más de 90 días': 'bg-danger-text' };

function Kpi({ label, value, tone, hint }: { label: string; value: string; tone?: string; hint?: string }) {
  return (
    <Card className="p-4">
      <span className="text-sm font-medium text-text-secondary">{label}</span>
      <h3 className={`text-xl font-semibold mt-2 ${tone ?? 'text-text-primary'}`}>{value}</h3>
      {hint && <p className="text-xs text-text-muted mt-1">{hint}</p>}
    </Card>
  );
}

function GroupTable({ title, rows }: { title: string; rows: GroupFigure[] }) {
  return (
    <Card className="p-0 overflow-hidden">
      <h4 className="text-sm font-bold text-text-primary uppercase tracking-wider px-4 pt-4 pb-2">{title}</h4>
      <table className="w-full text-sm text-left">
        <thead className="text-xs text-text-secondary uppercase bg-surface-muted/50"><tr><th className="px-4 py-2 font-medium">{title.replace('Por ', '')}</th><th className="px-4 py-2 font-medium text-right">Cartera</th><th className="px-4 py-2 font-medium text-right">Vencida</th><th className="px-4 py-2 font-medium text-right">Morosidad</th></tr></thead>
        <tbody className="divide-y divide-border-soft">
          {rows.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-text-muted">Sin datos.</td></tr>}
          {rows.map(r => <tr key={r.name}><td className="px-4 py-2 text-text-primary">{r.name}</td><td className="px-4 py-2 text-right">{usd(r.total)}</td><td className={`px-4 py-2 text-right ${r.overdue > 0 ? 'text-danger-text font-medium' : ''}`}>{usd(r.overdue)}</td><td className="px-4 py-2 text-right">{r.rate.toFixed(1)} %</td></tr>)}
        </tbody>
      </table>
    </Card>
  );
}

/** Reportes → Cartera: cartera vigente y vencida, antigüedad de la deuda, morosidad, proyección de cobro y principales deudores. */
export function PortfolioReport() {
  const { plans, enrollments, students, guardians, branches, payments, can } = useData();
  const navigate = useNavigate();
  const today = todayLocalISO();
  const [branchId, setBranchId] = useState('');
  const [program, setProgram] = useState('');
  const [state, setState] = useState<'' | 'vencida' | 'vigente'>('');
  const all = useMemo(() => portfolioRows({ plans, enrollments, students, guardians, branches }, today), [plans, enrollments, students, guardians, branches, today]);
  const programs = useMemo(() => [...new Set(all.map(r => r.program))].sort(), [all]);
  const rows = useMemo(() => all.filter(r => (!branchId || r.branchId === branchId) && (!program || r.program === program) && (!state || (state === 'vencida' ? r.days > 0 : r.days <= 0))), [all, branchId, program, state]);
  const scoped = useMemo(() => all.filter(r => (!branchId || r.branchId === branchId) && (!program || r.program === program)), [all, branchId, program]);
  const kpis = useMemo(() => portfolioKpis(scoped, payments, today), [scoped, payments, today]);
  const aging = useMemo(() => agingSummary(scoped), [scoped]);
  const calendar = useMemo(() => dueCalendar(scoped, today), [scoped, today]);
  const debtors = useMemo(() => topDebtors(scoped, 10), [scoped]);
  const maxAging = Math.max(1, ...aging.map(a => a.amount));

  if (!can(PERM.collections)) {
    return <div className="flex items-center justify-center h-full text-text-muted"><p>Su rol no tiene permiso para ver los reportes de cartera.</p></div>;
  }

  const headers = ['Matrícula', 'Alumno', 'Titular', 'Teléfono', 'Sede', 'Programa', 'Plan', 'Cuota', 'Vence', 'Saldo (USD)', 'Días de atraso', 'Antigüedad'];
  const body = () => rows.map(r => [r.enrollmentId, r.student, r.titular, r.phone, r.branchName, r.program, r.planId, r.installment, dmy(r.dueISO), r.balance, r.days > 0 ? r.days : 0, r.bucket]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap justify-between items-start gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-text-primary mb-1">Reporte de cartera</h2>
          <p className="text-sm text-text-secondary">Al {dmy(today)} · cuotas por cobrar de matrículas activas y deuda vencida de matrículas caídas (USD)</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" className="gap-2" onClick={() => printTable('Reporte de cartera', `Al ${dmy(today)} · ${rows.length} cuota(s) · ${usd(rows.reduce((a, r) => a + r.balance, 0))}`, headers, body())} disabled={rows.length === 0}><Printer size={16} /> PDF</Button>
          <Button variant="secondary" onClick={() => downloadCsv(csvFileName('Cartera por cuota', today), headers, body())} disabled={rows.length === 0}>Exportar CSV</Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <select className="h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:outline-none focus:border-primary-accent" value={branchId} onChange={e => setBranchId(e.target.value)}>
          <option value="">Todas las sedes</option>
          {branches.filter(b => b.status === 'Activo').map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select className="h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:outline-none focus:border-primary-accent" value={program} onChange={e => setProgram(e.target.value)}>
          <option value="">Todos los programas</option>
          {programs.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select className="h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:outline-none focus:border-primary-accent" value={state} onChange={e => setState(e.target.value as '' | 'vencida' | 'vigente')}>
          <option value="">Vencida y por vencer</option>
          <option value="vencida">Solo vencida</option>
          <option value="vigente">Solo por vencer</option>
        </select>
        {(branchId || program || state) && <Button variant="ghost" onClick={() => { setBranchId(''); setProgram(''); setState(''); }}>Limpiar</Button>}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Cartera total" value={usd(kpis.total)} hint={`${kpis.installments} cuota(s)`} />
        <Kpi label="Por vencer" value={usd(kpis.current)} tone="text-success-text" />
        <Kpi label="Vencida" value={usd(kpis.overdue)} tone={kpis.overdue > 0 ? 'text-danger-text' : undefined} hint={`${kpis.overdueInstallments} cuota(s) · ${kpis.debtors} matrícula(s)`} />
        <Kpi label="Morosidad" value={`${kpis.delinquencyRate.toFixed(1)} %`} tone={kpis.delinquencyRate > 20 ? 'text-danger-text' : undefined} hint={`Atraso promedio: ${kpis.avgDaysOverdue} días`} />
        <Kpi label="Cobrado este mes" value={usd(kpis.collectedMonth)} hint="Pagos aplicados del mes (todas las sedes)" />
        <Kpi label="Vence en 7 días" value={usd(kpis.dueIn.d7)} />
        <Kpi label="Vence en 30 días" value={usd(kpis.dueIn.d30)} />
        <Kpi label="Vence en 90 días" value={usd(kpis.dueIn.d90)} hint={`60 días: ${usd(kpis.dueIn.d60)}`} />
      </div>

      <Card>
        <h4 className="text-sm font-bold text-text-primary uppercase tracking-wider mb-4">Antigüedad de la cartera</h4>
        <div className="space-y-3">
          {aging.map(a => (
            <div key={a.bucket} className="grid grid-cols-[130px_1fr_160px] items-center gap-3 text-sm">
              <span className="text-text-secondary">{a.bucket}</span>
              <div className="h-3 bg-surface-muted rounded-full overflow-hidden"><div className={`h-full ${BAR[a.bucket]}`} style={{ width: `${(a.amount / maxAging) * 100}%` }} /></div>
              <span className="text-right text-text-primary">{usd(a.amount)} <span className="text-xs text-text-muted">({a.share.toFixed(1)} % · {a.count})</span></span>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <GroupTable title="Por sede" rows={groupBy(scoped, r => r.branchName)} />
        <GroupTable title="Por programa" rows={groupBy(scoped, r => r.program)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-0 overflow-hidden">
          <h4 className="text-sm font-bold text-text-primary uppercase tracking-wider px-4 pt-4 pb-2">Principales deudores</h4>
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-text-secondary uppercase bg-surface-muted/50"><tr><th className="px-4 py-2 font-medium">Alumno / titular</th><th className="px-4 py-2 font-medium text-right">Vencido</th><th className="px-4 py-2 font-medium text-right">Atraso</th><th /></tr></thead>
            <tbody className="divide-y divide-border-soft">
              {debtors.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-text-muted">No hay deuda vencida.</td></tr>}
              {debtors.map(d => (
                <tr key={d.enrollmentId}>
                  <td className="px-4 py-2"><div className="text-text-primary">{d.student}</div><div className="text-xs text-text-muted">{d.titular} · {d.branchName}</div></td>
                  <td className="px-4 py-2 text-right font-medium text-danger-text">{usd(d.overdue)}<div className="text-xs font-normal text-text-muted">{d.installments} cuota(s)</div></td>
                  <td className="px-4 py-2 text-right">{d.oldestDays} d</td>
                  <td className="px-4 py-2 text-right"><button className="text-xs text-primary-accent hover:underline" onClick={() => navigate(`/operacion/matriculas?ficha=${d.enrollmentId}`)}>Ver matrícula</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card className="p-0 overflow-hidden">
          <h4 className="text-sm font-bold text-text-primary uppercase tracking-wider px-4 pt-4 pb-2">Vencimientos de las próximas semanas</h4>
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-text-secondary uppercase bg-surface-muted/50"><tr><th className="px-4 py-2 font-medium">Semana</th><th className="px-4 py-2 font-medium text-right">Cuotas</th><th className="px-4 py-2 font-medium text-right">Por cobrar</th></tr></thead>
            <tbody className="divide-y divide-border-soft">
              {calendar.map(w => <tr key={w.from}><td className="px-4 py-2">{dmy(w.from)} al {dmy(w.to)}</td><td className="px-4 py-2 text-right">{w.count}</td><td className="px-4 py-2 text-right font-medium">{usd(w.amount)}</td></tr>)}
            </tbody>
          </table>
        </Card>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="flex justify-between items-center px-4 pt-4 pb-2">
          <h4 className="text-sm font-bold text-text-primary uppercase tracking-wider">Detalle por cuota ({rows.length})</h4>
          {rows.length > 100 && <span className="text-xs text-text-muted">Se muestran las 100 con más atraso; el CSV trae todas.</span>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-text-secondary uppercase bg-surface-muted/50">
              <tr><th className="px-4 py-2 font-medium">Alumno</th><th className="px-4 py-2 font-medium">Cuota</th><th className="px-4 py-2 font-medium">Sede</th><th className="px-4 py-2 font-medium">Vence</th><th className="px-4 py-2 font-medium text-right">Saldo</th><th className="px-4 py-2 font-medium">Antigüedad</th></tr>
            </thead>
            <tbody className="divide-y divide-border-soft">
              {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-text-muted">No hay cuotas con esos filtros.</td></tr>}
              {rows.slice(0, 100).map(r => (
                <tr key={`${r.planId}-${r.installmentId}`} className="hover:bg-surface-muted/50">
                  <td className="px-4 py-2"><div className="text-text-primary">{r.student}</div><div className="text-xs text-text-muted">{r.enrollmentId} · {r.titular}</div></td>
                  <td className="px-4 py-2">{r.installment}{r.isMora && <Badge variant="neutral" className="ml-2">Mora</Badge>}</td>
                  <td className="px-4 py-2 text-text-secondary">{r.branchName}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{dmy(r.dueISO)}</td>
                  <td className="px-4 py-2 text-right font-medium">{usd(r.balance)}</td>
                  <td className="px-4 py-2"><Badge variant={r.days <= 0 ? 'success' : r.days <= 30 ? 'warning' : 'danger'}>{r.days > 0 ? `${r.days} d · ${r.bucket}` : 'Por vencer'}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="text-xs text-text-muted">Antigüedad: {BUCKETS.join(' · ')}. La morosidad es la cartera vencida entre la cartera total. «Cobrado este mes» suma los pagos aplicados (sin anulados) de todas las sedes.</p>
    </div>
  );
}
