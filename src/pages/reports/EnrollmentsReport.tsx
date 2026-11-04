import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '../../components/ui/Badge';
import { BarsCard, BranchSelect, FilterBar, Kpi, NoAccess, ReportHeader, TableCard, countItems, money, pctText, selectCls, useDefaultBranch, useRange } from '../../components/reports/ReportParts';
import { useData } from '../../context/DataContext';
import { PERM } from '../../utils/authority';
import { csvFileName, downloadCsv } from '../../utils/exportCsv';
import { printTable } from '../../utils/printTable';
import { dmy, isAllTime } from '../../utils/reportCommon';
import { enrollmentsReport } from '../../utils/reportEnrollments';
import { todayLocalISO } from '../../utils/schedule';

const HEADERS = ['Matrícula', 'Fecha', 'Alumno', 'Programa', 'Sede', 'Tipo de pago', 'Precio (USD)', 'Estado', 'Verificación', 'Origen', 'Entrevistador'];

/** Reportes → Matrículas: cuántas se matriculan, de dónde vienen, cuántas llegan a dar su primera asesoría y por qué caen. */
export function EnrollmentsReport() {
  const { enrollments, programs, branches, schedules, dropRequests, changeRequests, can } = useData();
  const navigate = useNavigate();
  const today = todayLocalISO();
  const { range, preset, setPreset, setRange } = useRange('todo');
  const [branchId, setBranchId] = useDefaultBranch();
  const [program, setProgram] = useState('');

  const report = useMemo(
    () => enrollmentsReport({ enrollments, programs, branches, schedules, dropRequests, changeRequests, today }, { range, branchId, program }),
    [enrollments, programs, branches, schedules, dropRequests, changeRequests, today, range, branchId, program]
  );
  if (!can(PERM.reportEnrollments)) return <NoAccess />;

  const { kpis } = report;
  const rows = report.rows.map(e => [e.id, dmy(e.dateISO), e.student, e.level && e.level !== 'Sin nivel' ? `${e.program} · ${e.level}` : e.program, e.sede ?? '', e.paymentTypeName ?? '', e.assignedPrice ?? 0, e.status, e.verificationStatus ?? 'Pendiente', e.origen ?? '', e.asesor ?? '']);
  const period = isAllTime(range) ? 'todo el historial' : `${dmy(range.from)} al ${dmy(range.to)}`;
  const subtitle = `${period}${branchId ? ` · ${branches.find(b => b.id === branchId)?.name}` : ''}${program ? ` · ${program}` : ''}`;

  return (
    <div className="flex flex-col gap-6">
      <ReportHeader
        title="Reporte de matrículas"
        subtitle={`Matrículas registradas en ${period}. Se calcula con lo guardado en Operación → Matrículas.`}
        onPdf={() => printTable('Reporte de matrículas', subtitle, HEADERS, rows)}
        onCsv={() => downloadCsv(csvFileName('Matrículas', today), HEADERS, rows)}
        disabled={rows.length === 0}
      />
      <FilterBar range={range} preset={preset} onPreset={setPreset} onRange={setRange}>
        <BranchSelect value={branchId} onChange={setBranchId} />
        <select className={selectCls} value={program} onChange={e => setProgram(e.target.value)} aria-label="Filtrar por programa">
          <option value="">Todos los programas</option>
          {programs.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
        </select>
      </FilterBar>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Matrículas del período" value={String(kpis.registered)} hint={`${kpis.renewals} son renovaciones`} />
        <Kpi label="Activas hoy" value={String(kpis.active)} hint={`${kpis.dropped} caídas`} />
        <Kpi label="Precio asignado" value={money(kpis.revenueUSD)} hint="Suma del precio de lo matriculado" />
        <Kpi label="Materiales verificados" value={pctText(kpis.verifiedRate)} tone={kpis.verifiedRate !== null && kpis.verifiedRate < 70 ? 'text-warning-text' : undefined} />
        <Kpi label="Caídas aprobadas" value={pctText(kpis.dropRate)} hint={report.pendingDrops > 0 ? `${report.pendingDrops} solicitud(es) por resolver` : 'Sobre las matrículas del período'} tone={kpis.dropRate !== null && kpis.dropRate > 15 ? 'text-danger-text' : undefined} />
        <Kpi label="Cambios aprobados" value={String(report.changes.reduce((n, c) => n + c.count, 0))} hint={report.pendingChanges > 0 ? `${report.pendingChanges} por resolver` : 'Reactivación, programa y traslado'} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <BarsCard title="Embudo: de la matrícula a la asesoría" items={report.funnel.map(s => ({ name: s.step, value: s.count }))} format={n => `${n}${report.kpis.registered ? ` · ${Math.round((n / report.kpis.registered) * 100)} %` : ''}`} />
        <BarsCard title="Vigencia de las activas" items={countItems(report.validity)} tone="bg-success-text" />
      </div>

      <TableCard
        title="Por sede"
        headers={['Sede', 'Matrículas', 'Activas', 'Caídas', 'Precio asignado']}
        right={[1, 2, 3, 4]}
        rows={report.byBranch.map(g => [g.name, g.count, g.active, g.dropped, money(g.revenueUSD)])}
      />
      <TableCard
        title="Por programa y nivel"
        headers={['Programa', 'Matrículas', 'Activas', 'Caídas', 'Precio asignado']}
        right={[1, 2, 3, 4]}
        rows={report.byProgram.map(g => [g.name, g.count, g.active, g.dropped, money(g.revenueUSD)])}
      />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <BarsCard title="Tipo de pago" items={countItems(report.byPaymentType)} />
        <BarsCard title="Origen del contacto" items={countItems(report.byOrigin)} tone="bg-info-text" />
        <BarsCard title="Entrevistador" items={countItems(report.byAdvisor)} />
        <BarsCard title="Motivos de caída (aprobadas en el período)" items={countItems(report.dropReasons)} tone="bg-danger-text" empty="No hay caídas aprobadas en el período." />
      </div>
      <BarsCard title="Cambios aprobados en el período" items={countItems(report.changes)} tone="bg-warning-text" empty="No hay cambios aprobados en el período." />

      <TableCard
        title={`Detalle (${rows.length})`}
        note={rows.length > 100 ? 'Se muestran las 100 más recientes; el CSV trae todas.' : undefined}
        headers={['Matrícula', 'Fecha', 'Alumno', 'Programa', 'Sede', 'Estado', 'Verificación']}
        rows={report.rows.slice(0, 100).map(e => [
          <button key={e.id} type="button" className="font-mono text-xs text-primary-accent hover:underline" onClick={() => navigate(`/operacion/matriculas?ficha=${e.id}`)}>{e.id}</button>,
          dmy(e.dateISO), e.student, e.level && e.level !== 'Sin nivel' ? `${e.program} · ${e.level}` : e.program, e.sede ?? '—',
          <Badge key="s" variant={e.status === 'Activa' ? 'success' : e.status === 'Caída' ? 'danger' : 'neutral'}>{e.status}</Badge>,
          <Badge key="v" variant={e.verificationStatus === 'Verificado Completo' ? 'success' : e.verificationStatus === 'Verificado Incompleto' ? 'warning' : 'neutral'}>{e.verificationStatus ?? 'Pendiente'}</Badge>,
        ])}
      />
    </div>
  );
}
