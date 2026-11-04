import React, { useMemo, useState } from 'react';
import { Badge } from '../../components/ui/Badge';
import { BarsCard, BranchSelect, FilterBar, Kpi, NoAccess, ReportHeader, TableCard, money, selectCls, useDefaultBranch, useRange } from '../../components/reports/ReportParts';
import { useData } from '../../context/DataContext';
import { PERM } from '../../utils/authority';
import { csvFileName, downloadCsv } from '../../utils/exportCsv';
import { printTable } from '../../utils/printTable';
import { cashReport, pettyReport } from '../../utils/reportCash';
import { dmy, isAllTime, dayOf } from '../../utils/reportCommon';
import { todayLocalISO } from '../../utils/schedule';

const HEADERS = ['Fecha', 'Tipo', 'Concepto', 'Referencia', 'Medio', 'Sede', 'Monto', 'Usuario', 'Estado'];

/** Reportes → Caja: ingresos y egresos por moneda, lo depositado, las reversas, los cierres con su diferencia y la caja chica. */
export function CashReport() {
  const { cashMovements, pettyCashMovements, cashClosures, branches, pettyFund, can } = useData();
  const today = todayLocalISO();
  const { range, preset, setPreset, setRange } = useRange('mes');
  const [branchId, setBranchId] = useDefaultBranch();
  const [currency, setCurrency] = useState<'PEN' | 'USD'>('PEN');

  const ctx = useMemo(() => ({ cashMovements, pettyCashMovements, cashClosures, branches, fund: pettyFund }), [cashMovements, pettyCashMovements, cashClosures, branches, pettyFund]);
  const caja = useMemo(() => cashReport(ctx, { range, branchId, currency }), [ctx, range, branchId, currency]);
  const chica = useMemo(() => pettyReport(ctx, range), [ctx, range]);
  if (!can(PERM.reportCash)) return <NoAccess />;

  const sym = currency;
  const rows = cashMovements
    .filter(m => m.currency === currency && (!branchId || m.branchId === branchId) && dayOf(m.date) >= range.from && dayOf(m.date) <= range.to)
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(m => [dmy(dayOf(m.date)), m.kind, m.concept, m.reference, m.method, branches.find(b => b.id === m.branchId)?.name ?? '', m.amount, m.user, m.status]);
  const period = isAllTime(range) ? 'todo el historial' : `${dmy(range.from)} al ${dmy(range.to)}`;
  const diffTone = (n: number) => (n === 0 ? '' : n > 0 ? 'text-success-text' : 'text-danger-text');

  return (
    <div className="flex flex-col gap-6">
      <ReportHeader
        title="Reporte de caja"
        subtitle={`Caja en ${currency === 'PEN' ? 'soles' : 'dólares'} y caja chica del ${period}. El saldo es el actual, no solo el del período.`}
        onPdf={() => printTable(`Reporte de caja (${currency})`, `${period}${branchId ? ` · ${branches.find(b => b.id === branchId)?.name}` : ''}`, HEADERS, rows)}
        onCsv={() => downloadCsv(csvFileName(`Caja ${currency}`, today), HEADERS, rows)}
        disabled={rows.length === 0}
      />
      <FilterBar range={range} preset={preset} onPreset={setPreset} onRange={setRange}>
        <BranchSelect value={branchId} onChange={setBranchId} />
        <select className={selectCls} value={currency} onChange={e => setCurrency(e.target.value as 'PEN' | 'USD')} aria-label="Moneda de la caja">
          <option value="PEN">Caja en soles (PEN)</option>
          <option value="USD">Caja en dólares (USD)</option>
        </select>
      </FilterBar>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Ingresos" value={money(caja.income, sym)} tone="text-success-text" />
        <Kpi label="Egresos operativos" value={money(caja.expense, sym)} hint={`Devoluciones ${money(caja.refunds, sym)}`} />
        <Kpi label="Resultado del período" value={money(caja.net, sym)} tone={caja.net < 0 ? 'text-danger-text' : 'text-primary-accent'} hint={`Depositado al banco ${money(caja.deposits, sym)}`} />
        <Kpi label="Saldo actual" value={money(caja.balance, sym)} />
        <Kpi label="Efectivo sin depositar" value={money(caja.pendingDeposit.amount, sym)} tone={caja.pendingDeposit.count > 0 ? 'text-warning-text' : undefined} hint={`${caja.pendingDeposit.count} ingreso(s) en efectivo`} />
        <Kpi label="Reversas del período" value={String(caja.reversed.count)} tone={caja.reversed.count > 0 ? 'text-warning-text' : undefined} hint={money(caja.reversed.amount, sym)} />
        <Kpi label="Cierres del período" value={String(caja.closures.length)} hint={`Diferencia acumulada ${money(caja.closureDifference, sym)}`} tone={caja.closureDifference !== 0 ? 'text-warning-text' : undefined} />
        <Kpi label="Caja chica: saldo" value={money(chica.balance, 'PEN')} hint={chica.refill > 0 ? `Falta reponer ${money(chica.refill, 'PEN')}` : `Fondo ${money(chica.fund.assigned, 'PEN')}`} tone={chica.refill > 0 ? 'text-warning-text' : undefined} />
      </div>

      <TableCard
        title="Flujo por día"
        headers={['Día', 'Ingresos', 'Egresos', 'Neto']}
        right={[1, 2, 3]}
        rows={caja.byDay.map(d => [dmy(d.date), money(d.income, sym), money(d.expense, sym), <span key="n" className={d.income - d.expense < 0 ? 'text-danger-text' : ''}>{money(d.income - d.expense, sym)}</span>])}
        empty="No hay movimientos en el período."
      />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <BarsCard title="Ingresos por medio de pago" items={caja.byMethod.map(a => ({ name: a.name, value: a.amount }))} format={n => money(n, sym)} tone="bg-success-text" />
        <BarsCard title="Ingresos por concepto" items={caja.incomeByConcept.map(a => ({ name: a.name, value: a.amount }))} format={n => money(n, sym)} />
        <BarsCard title="Egresos por concepto" items={caja.expenseByConcept.map(a => ({ name: a.name, value: a.amount }))} format={n => money(n, sym)} tone="bg-danger-text" empty="No hubo egresos operativos." />
        <TableCard title="Por sede" headers={['Sede', 'Ingresos', 'Egresos']} right={[1, 2]} rows={caja.byBranch.map(b => [b.name, money(b.income, sym), money(b.expense, sym)])} empty="Sin movimientos." />
      </div>

      <TableCard
        title="Cierres de caja"
        headers={['Fecha', 'Según el sistema', 'Contado', 'Diferencia', 'Estado', 'Cerró']}
        right={[1, 2, 3]}
        rows={caja.closures.map(c => [dmy(c.date), money(c.expected, sym), money(c.counted, sym), <span key="d" className={diffTone(c.difference)}>{money(c.difference, sym)}</span>, <Badge key="s" variant={c.status === 'Cerrada' ? 'success' : 'warning'}>{c.status}</Badge>, c.closedBy])}
        empty="No hubo cierres de esta caja en el período."
      />

      <div className="pt-2"><h3 className="text-lg font-semibold text-text-primary">Caja chica (soles)</h3><p className="text-sm text-text-secondary">Fondo asignado {money(chica.fund.assigned, 'PEN')} · tope por gasto {money(chica.fund.maxExpense, 'PEN')}. No se filtra por sede.</p></div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Ingresos (reposiciones)" value={money(chica.income, 'PEN')} tone="text-success-text" />
        <Kpi label="Gastos" value={money(chica.expense, 'PEN')} />
        <Kpi label="Saldo actual" value={money(chica.balance, 'PEN')} />
        <Kpi label="Reversas" value={String(chica.reversed.count)} hint={money(chica.reversed.amount, 'PEN')} />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <BarsCard title="Gastos por categoría" items={chica.byCategory.map(c => ({ name: c.name, value: c.amount }))} format={n => money(n, 'PEN')} tone="bg-danger-text" empty="No hubo gastos en el período." />
        <TableCard title="Cierres de caja chica" headers={['Fecha', 'Contado', 'Diferencia', 'Estado']} right={[1, 2]} rows={chica.closures.map(c => [dmy(c.date), money(c.counted, 'PEN'), <span key="d" className={diffTone(c.difference)}>{money(c.difference, 'PEN')}</span>, c.status])} empty="Sin cierres en el período." />
      </div>
    </div>
  );
}
