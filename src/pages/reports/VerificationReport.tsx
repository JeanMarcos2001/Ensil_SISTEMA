import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '../../components/ui/Badge';
import { BarsCard, BranchSelect, FilterBar, Kpi, NoAccess, ReportHeader, TableCard, countItems, selectCls, useDefaultBranch, useRange } from '../../components/reports/ReportParts';
import { useData } from '../../context/DataContext';
import { PERM } from '../../utils/authority';
import { csvFileName, downloadCsv } from '../../utils/exportCsv';
import { printTable } from '../../utils/printTable';
import { dmy, isAllTime } from '../../utils/reportCommon';
import { verificationReport } from '../../utils/reportEnrollments';
import { longDayLabel, todayLocalISO } from '../../utils/schedule';
import { GATE_LABEL } from '../../utils/verificationGate';

const HEADERS = ['Matrícula', 'Fecha', 'Alumno', 'Programa', 'Sede', 'Verificación', 'Primera asesoría', 'Urgencia', 'Artículos faltantes'];

/** Reportes → Verificación: qué falta entregar, cuánto tarda y qué primera asesoría está en riesgo por no tener materiales. */
export function VerificationReport() {
  const { enrollments, recipes, items, branches, programs, pendingFirstSessions, can } = useData();
  const navigate = useNavigate();
  const today = todayLocalISO();
  const { range, preset, setPreset, setRange } = useRange('todo');
  const [branchId, setBranchId] = useDefaultBranch();
  const [program, setProgram] = useState('');

  const report = useMemo(
    () => verificationReport({ enrollments, recipes, items, branches, gates: pendingFirstSessions(), today }, { range, branchId, program }),
    [enrollments, recipes, items, branches, pendingFirstSessions, today, range, branchId, program]
  );
  if (!can(PERM.reportView)) return <NoAccess />;

  const { kpis } = report;
  const all = [...report.pendingRows, ...report.incompleteRows];
  const rows = all.map(r => [
    r.enrollment.id, dmy(r.enrollment.dateISO), r.enrollment.student, r.enrollment.program, r.enrollment.sede ?? '', r.enrollment.verificationStatus ?? 'Pendiente',
    r.gate?.session ? `${r.gate.session.date} ${r.gate.session.time}` : '', r.gate ? GATE_LABEL[r.gate.level] || 'Pendiente' : '', r.missing.join('; '),
  ]);
  const period = isAllTime(range) ? 'todo el historial' : `${dmy(range.from)} al ${dmy(range.to)}`;
  const link = (id: string) => <button key={id} type="button" className="font-mono text-xs text-primary-accent hover:underline" onClick={() => navigate(`/operacion/matriculas?ficha=${id}`)}>{id}</button>;

  return (
    <div className="flex flex-col gap-6">
      <ReportHeader
        title="Reporte de verificación"
        subtitle={`Entrega de materiales de las matrículas activas registradas en ${period}. Un alumno no da su primera asesoría sin sus materiales.`}
        onPdf={() => printTable('Reporte de verificación', `${period}${branchId ? ` · ${branches.find(b => b.id === branchId)?.name}` : ''}`, HEADERS, rows)}
        onCsv={() => downloadCsv(csvFileName('Verificación', today), HEADERS, rows)}
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
        <Kpi label="Matrículas activas" value={String(kpis.total)} hint={`${kpis.complete} completas · ${kpis.incomplete} incompletas`} />
        <Kpi label="Pendientes de verificar" value={String(kpis.pending)} tone={kpis.pending > 0 ? 'text-warning-text' : undefined} hint={kpis.noRecipe > 0 ? `${kpis.noRecipe} sin receta de materiales` : undefined} />
        <Kpi label="Verificadas" value={kpis.rate === null ? '—' : `${kpis.rate.toFixed(1)} %`} />
        <Kpi label="Tarda en promedio" value={kpis.avgDays === null ? '—' : `${kpis.avgDays} días`} hint="De la matrícula a la entrega" />
        <Kpi label="Esperan su primera asesoría" value={String(kpis.waiting)} tone={kpis.waiting > 0 ? 'text-warning-text' : undefined} hint="Sin materiales no la pueden dar" />
        <Kpi label="Por reprogramar" value={String(kpis.overdue)} tone={kpis.overdue > 0 ? 'text-danger-text' : undefined} hint="Su hora ya llegó sin materiales" />
      </div>

      <TableCard
        title={`Pendientes de verificar (${report.pendingRows.length})`}
        note="Primero las que esperan su primera asesoría, la más urgente arriba."
        headers={['Matrícula', 'Alumno', 'Sede', 'Primera asesoría', 'Urgencia']}
        rows={report.pendingRows.map(r => [
          link(r.enrollment.id), r.enrollment.student, r.enrollment.sede ?? '—',
          r.gate?.session ? `${longDayLabel(r.gate.session.date)} · ${r.gate.session.time}` : '—',
          r.gate ? <Badge key="g" variant={r.gate.level === 'planificada' ? 'neutral' : r.gate.level === 'urgente' ? 'warning' : 'danger'}>{r.gate.overdue ? 'Reprogramar' : GATE_LABEL[r.gate.level]}</Badge> : r.hasRecipe ? '—' : <span className="text-xs">Sin receta: no se bloquea</span>,
        ])}
        empty="No hay matrículas pendientes de verificar."
      />
      <TableCard
        title={`Verificación incompleta (${report.incompleteRows.length})`}
        headers={['Matrícula', 'Alumno', 'Sede', 'Falta entregar']}
        rows={report.incompleteRows.map(r => [link(r.enrollment.id), r.enrollment.student, r.enrollment.sede ?? '—', r.missing.join(', ') || 'Sin detalle'])}
        empty="No hay verificaciones incompletas."
      />

      <TableCard
        title="Por sede"
        headers={['Sede', 'Matrículas', 'Pendientes', 'Incompletas', 'Completas']}
        right={[1, 2, 3, 4]}
        rows={report.byBranch.map(b => [b.name, b.total, b.pending, b.incomplete, b.complete])}
      />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <BarsCard title="Verificaciones por verificador" items={countItems(report.byVerifier)} empty="Todavía no hay verificaciones." />
        <BarsCard title="Artículos entregados" items={countItems(report.delivered)} tone="bg-success-text" empty="Todavía no se entregó ningún artículo." />
      </div>
    </div>
  );
}
