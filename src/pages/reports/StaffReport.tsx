import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '../../components/ui/Badge';
import { BarsCard, BranchSelect, FilterBar, Kpi, NoAccess, ReportHeader, TableCard, countItems, money, useDefaultBranch, useRange } from '../../components/reports/ReportParts';
import { useData } from '../../context/DataContext';
import { PERM } from '../../utils/authority';
import { csvFileName, downloadCsv } from '../../utils/exportCsv';
import { printTable } from '../../utils/printTable';
import { dmy, isAllTime } from '../../utils/reportCommon';
import { EXPIRY_DAYS, VACATION_HORIZON_DAYS, staffReport } from '../../utils/reportStaff';
import { periodLabel } from '../../utils/payrollEngine';
import { todayLocalISO } from '../../utils/schedule';

const HEADERS = ['Trabajador', 'Documento', 'Sede', 'Área', 'Cargo', 'Estado', 'Contrato', 'Cuenta de acceso'];

/** Reportes → Personal: la plantilla, quién tiene contrato y cuenta, qué contratos vencen y cuánto costó la última planilla. */
export function StaffReport() {
  const { staff, contracts, assignments, users, branches, payrollRuns, can } = useData();
  const navigate = useNavigate();
  const today = todayLocalISO();
  const { range, preset, setPreset, setRange } = useRange('anio');
  const [branchId, setBranchId] = useDefaultBranch();

  const report = useMemo(
    () => staffReport({ staff, contracts, assignments, users, branches, payrollRuns, today }, { branchId, range }),
    [staff, contracts, assignments, users, branches, payrollRuns, today, branchId, range]
  );
  if (!can(PERM.reportStaff)) return <NoAccess />;

  const { kpis } = report;
  const rows = report.rows.map(r => [r.name, `${r.staff.docType} ${r.staff.docNumber}`, r.branch, r.area, r.role, r.staff.status, r.contractState, r.account ? `${r.account.id} (${r.account.status})` : 'Sin cuenta']);
  const period = isAllTime(range) ? 'todo el historial' : `${dmy(range.from)} al ${dmy(range.to)}`;
  const sede = branchId ? branches.find(b => b.id === branchId)?.name : undefined;

  return (
    <div className="flex flex-col gap-6">
      <ReportHeader
        title="Reporte de personal"
        subtitle="Plantilla de hoy, con su asignación, contrato y cuenta de acceso. Las bajas se cuentan en el período elegido."
        onPdf={() => printTable('Reporte de personal', `Al ${dmy(today)}${sede ? ` · ${sede}` : ''}`, HEADERS, rows)}
        onCsv={() => downloadCsv(csvFileName('Personal', today), HEADERS, rows)}
        disabled={rows.length === 0}
      />
      <FilterBar range={range} preset={preset} onPreset={setPreset} onRange={setRange} presets={['mes', 'anio', 'todo']}>
        <BranchSelect value={branchId} onChange={setBranchId} />
      </FilterBar>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Personal activo" value={String(kpis.active)} hint={`${kpis.inactive} inactivo(s)`} />
        <Kpi label="Con contrato vigente" value={String(kpis.withContract)} hint={`${kpis.withoutContract} sin contrato vigente`} tone={kpis.withoutContract > 0 ? 'text-warning-text' : undefined} />
        <Kpi label="Contratos por vencer" value={String(kpis.expiring)} hint={`En ${EXPIRY_DAYS} días o menos · ${kpis.expired} vencido(s)`} tone={kpis.expiring + kpis.expired > 0 ? 'text-warning-text' : undefined} />
        <Kpi label="Bajas del período" value={String(kpis.leavers)} hint={period} />
        <Kpi label="Con cuenta de acceso" value={String(kpis.withAccount)} hint={`${kpis.withoutAccount} sin cuenta activa`} />
        <Kpi label="Sin asignación" value={String(kpis.withoutAssignment)} tone={kpis.withoutAssignment > 0 ? 'text-warning-text' : undefined} hint="No figuran en ninguna sede" />
        {report.payroll && can(PERM.payView) && <Kpi label={`Planilla ${periodLabel(report.payroll.period)}`} value={money(report.payroll.employerCost, 'PEN')} hint={`Costo referencial · neto referencial ${money(report.payroll.net, 'PEN')} · ${report.payroll.status}`} />}
      </div>

      <TableCard
        title="Contratos por vencer o vencidos"
        headers={['Trabajador', 'Contrato', 'Tipo', 'Vence', 'Estado']}
        rows={report.alerts.map(a => [a.staffName, a.contractId, a.type, dmy(a.endDate), <Badge key="s" variant={a.state === 'Vencido' ? 'danger' : 'warning'}>{a.state === 'Vencido' ? `Vencido hace ${-a.days} d` : a.days === 0 ? 'Vence hoy' : `Vence en ${a.days} d`}</Badge>])}
        empty="No hay contratos por vencer ni vencidos."
        action={<button type="button" className="text-xs text-primary-accent hover:underline" onClick={() => navigate('/personas/contratos')}>Ir a Contratos</button>}
      />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <TableCard title="Activos sin contrato vigente" headers={['Trabajador', 'Contrato']} rows={report.withoutContract.map(r => [r.name, r.contractState])} empty="Todo el personal activo tiene contrato vigente." />
        <TableCard title="Activos sin asignación" headers={['Trabajador', 'Cuenta de acceso']} rows={report.withoutAssignment.map(r => [r.name, r.account ? r.account.status : 'Sin cuenta'])} empty="Todo el personal activo tiene una asignación." />
      </div>
      <TableCard
        title={`Vacaciones programadas (próximos ${VACATION_HORIZON_DAYS} días)`}
        headers={['Trabajador', 'Desde', 'Retorno']}
        rows={report.vacations.map(v => [v.staffName, dmy(v.from), dmy(v.to)])}
        empty="No hay vacaciones programadas."
        note="Quien está de vacaciones no puede ser responsable de asesorías ni actividades esos días: antes de programarlas se reasigna su agenda."
      />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <BarsCard title="Personal activo por sede" items={countItems(report.byBranch)} />
        <BarsCard title="Por área" items={countItems(report.byArea)} tone="bg-info-text" />
        <BarsCard title="Por cargo" items={countItems(report.byRole)} />
        <BarsCard title="Contratos vigentes por tipo" items={countItems(report.contractTypes)} tone="bg-success-text" />
      </div>

      {report.payroll && can(PERM.payView) && (
        <TableCard
          title={`Costo de la planilla de ${periodLabel(report.payroll.period)} por sede`}
          headers={['Sede', 'Trabajadores', 'Neto referencial', 'Costo referencial de planilla']}
          right={[1, 2, 3]}
          rows={report.payroll.byBranch.map(b => [b.name, b.headcount, money(b.net, 'PEN'), money(b.employerCost, 'PEN')])}
          action={<button type="button" className="text-xs text-primary-accent hover:underline" onClick={() => navigate('/personas/planilla')}>Ir a Planilla</button>}
        />
      )}

      <TableCard
        title={`Detalle (${rows.length})`}
        headers={['Trabajador', 'Sede', 'Cargo', 'Estado', 'Contrato', 'Cuenta']}
        rows={report.rows.slice(0, 100).map(r => [r.name, r.branch || '—', r.role || '—', <Badge key="e" variant={r.staff.status === 'Activo' ? 'success' : 'danger'}>{r.staff.status}</Badge>, r.contractState, r.account ? `${r.account.id} · ${r.account.status}` : 'Sin cuenta'])}
      />
    </div>
  );
}
