import React, { useMemo, useState } from 'react';
import { Printer } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { DateInput } from '../../components/ui/DateInput';
import { useData } from '../../context/DataContext';
import { PERM } from '../../utils/authority';
import { csvFileName, downloadCsv } from '../../utils/exportCsv';
import { printTable } from '../../utils/printTable';
import { rescheduleCount } from '../../utils/psyHistory';
import { RISK_ABSENCES, RISK_GAP_DAYS, filterSchedules, psyReport, type GroupRow } from '../../utils/psyReport';
import { addDaysISO, allActivities, todayLocalISO } from '../../utils/schedule';

const dmy = (iso: string) => iso.split('-').reverse().join('/');
const pct = (n: number | null) => (n === null ? '—' : `${n.toFixed(1)} %`);
const monthStart = (iso: string) => `${iso.slice(0, 8)}01`;
const monthEnd = (iso: string) => { const [y, m] = iso.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
const prevMonth = (iso: string) => addDaysISO(monthStart(iso), -1);

function Kpi({ label, value, tone, hint }: { label: string; value: string; tone?: string; hint?: string }) {
  return (
    <Card className="p-4">
      <span className="text-sm font-medium text-text-secondary">{label}</span>
      <h3 className={`text-xl font-semibold mt-2 ${tone ?? 'text-text-primary'}`}>{value}</h3>
      {hint && <p className="text-xs text-text-muted mt-1">{hint}</p>}
    </Card>
  );
}

function GroupTable({ title, rows }: { title: string; rows: GroupRow[] }) {
  return (
    <Card className="p-0 overflow-hidden">
      <h4 className="text-sm font-bold text-text-primary uppercase tracking-wider px-4 pt-4 pb-2">{title}</h4>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-text-secondary uppercase bg-surface-muted/50">
            <tr>
              <th className="px-4 py-2 font-medium">{title.replace('Por ', '')}</th>
              <th className="px-4 py-2 font-medium text-right">Total</th>
              <th className="px-4 py-2 font-medium text-right">Asistidas</th>
              <th className="px-4 py-2 font-medium text-right">Faltas</th>
              <th className="px-4 py-2 font-medium text-right">Canceladas</th>
              <th className="px-4 py-2 font-medium text-right">Asistencia</th>
              <th className="px-4 py-2 font-medium text-right">Sin sesión</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-soft">
            {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-center text-text-muted">Sin datos.</td></tr>}
            {rows.map(r => (
              <tr key={r.name}>
                <td className="px-4 py-2 text-text-primary">{r.name}</td>
                <td className="px-4 py-2 text-right">{r.total}</td>
                <td className="px-4 py-2 text-right">{r.attended}</td>
                <td className={`px-4 py-2 text-right ${r.absent > 0 ? 'text-danger-text' : ''}`}>{r.absent}</td>
                <td className="px-4 py-2 text-right">{r.cancelled}</td>
                <td className="px-4 py-2 text-right font-medium">{pct(r.attendanceRate)}</td>
                <td className={`px-4 py-2 text-right ${r.withoutSession > 0 ? 'text-warning-text font-medium' : ''}`}>{r.withoutSession}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/**
 * Reportes → Psicopedagogía: asistencia y cumplimiento del registro de sesiones, cambios con su motivo (quién los pidió),
 * progreso de los alumnos, actividades especiales y alumnos en riesgo. Todo sale de lo que ya guarda el sistema.
 */
export function PsychopedagogyReport() {
  const { schedules, trackings, psyEvents, monthlySchedules, enrollments, students, programs, branches, pendingFirstSessions, can } = useData();
  const today = todayLocalISO();
  const [branchId, setBranchId] = useState('');
  const [program, setProgram] = useState('');
  const [from, setFrom] = useState(monthStart(today));
  const [to, setTo] = useState(monthEnd(today));

  const report = useMemo(() => {
    const blocked = new Set(Object.values(pendingFirstSessions()).map(g => g.session?.id).filter((x): x is string => !!x));
    return psyReport(
      { schedules, trackings, events: psyEvents, activities: allActivities(monthlySchedules), enrollments, students, programs, branches, blockedScheduleIds: blocked, today },
      { from, to, branchId, program }
    );
  }, [schedules, trackings, psyEvents, monthlySchedules, enrollments, students, programs, branches, today, from, to, branchId, program, pendingFirstSessions]);

  if (!can(PERM.psiReport)) {
    return <div className="flex items-center justify-center h-full text-text-muted"><p>Su rol no tiene permiso para ver los reportes.</p></div>;
  }

  const { kpis, changes, activityKpis } = report;
  const maxReason = Math.max(1, ...changes.motivos.map(m => m.count));
  const period = `${dmy(from)} al ${dmy(to)}`;

  const detailHeaders = ['Fecha', 'Hora', 'Alumno', 'Programa', 'Nivel', 'Sede', 'Responsable', 'Estado', 'Primera asesoría', 'Sesión registrada', 'Reprogramaciones'];
  const detail = () => filterSchedules({ schedules }, { from, to, branchId, program })
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
    .map(s => [dmy(s.date), s.time, s.student, s.program, s.level, branches.find(b => b.id === s.branchId)?.name ?? '', s.responsible, s.status, s.isFirst ? 'Sí' : '', s.status === 'Asistió' ? (trackings.some(t => t.scheduleId === s.id) ? 'Sí' : 'No') : '', rescheduleCount(psyEvents, s.id)]);
  const subtitle = `${period}${branchId ? ` · ${branches.find(b => b.id === branchId)?.name}` : ''}${program ? ` · ${program}` : ''}`;

  const setRange = (a: string, b: string) => { setFrom(a); setTo(b); };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap justify-between items-start gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-text-primary mb-1">Reporte de Psicopedagogía</h2>
          <p className="text-sm text-text-secondary">Asesorías con fecha del {period}. El detalle se calcula con lo registrado en Programación, Historial y Cronogramas.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" className="gap-2" onClick={() => printTable('Reporte de Psicopedagogía', subtitle, detailHeaders, detail())} disabled={kpis.total === 0}><Printer size={16} /> PDF</Button>
          <Button variant="secondary" onClick={() => downloadCsv(csvFileName('Asesorías del período', today), detailHeaders, detail())} disabled={kpis.total === 0}>Exportar CSV</Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 items-end">
        <div className="w-40"><label className="text-xs font-medium text-text-secondary">Desde</label><DateInput value={from} max={to} onChange={e => setFrom(e.target.value)} /></div>
        <div className="w-40"><label className="text-xs font-medium text-text-secondary">Hasta</label><DateInput value={to} min={from} onChange={e => setTo(e.target.value)} /></div>
        <div className="flex gap-1.5 pb-0.5">
          <Button variant="ghost" size="sm" onClick={() => setRange(monthStart(today), monthEnd(today))}>Este mes</Button>
          <Button variant="ghost" size="sm" onClick={() => setRange(monthStart(prevMonth(today)), prevMonth(today))}>Mes anterior</Button>
          <Button variant="ghost" size="sm" onClick={() => setRange(addDaysISO(today, -29), today)}>Últimos 30 días</Button>
        </div>
        <select className="h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:outline-none focus:border-primary-accent" value={branchId} onChange={e => setBranchId(e.target.value)}>
          <option value="">Todas las sedes</option>
          {branches.filter(b => b.status === 'Activo').map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select className="h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:outline-none focus:border-primary-accent" value={program} onChange={e => setProgram(e.target.value)}>
          <option value="">Todos los programas</option>
          {programs.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
        </select>
        {(branchId || program) && <Button variant="ghost" onClick={() => { setBranchId(''); setProgram(''); }}>Limpiar</Button>}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Asesorías del período" value={String(kpis.total)} hint={`${kpis.pending} por dar · ${kpis.unmarked} vencidas sin marcar`} tone={kpis.unmarked > 0 ? 'text-warning-text' : undefined} />
        <Kpi label="Asistencia" value={pct(kpis.attendanceRate)} hint={`${kpis.attended} asistidas · ${kpis.absent} faltas`} tone={kpis.attendanceRate !== null && kpis.attendanceRate < 80 ? 'text-danger-text' : undefined} />
        <Kpi label="Sesiones registradas" value={pct(kpis.sessionRate)} hint={kpis.withoutSession > 0 ? `${kpis.withoutSession} asistida(s) sin sesión` : 'Todas las asistidas tienen sesión'} tone={kpis.withoutSession > 0 ? 'text-warning-text' : undefined} />
        <Kpi label="Primeras asesorías" value={String(kpis.firstSessions)} hint={kpis.firstBlocked > 0 ? `${kpis.firstBlocked} esperan la verificación de materiales` : 'Ninguna espera la verificación'} tone={kpis.firstBlocked > 0 ? 'text-danger-text' : undefined} />
        <Kpi label="Canceladas" value={String(kpis.cancelled)} hint={`${changes.canceladas} con motivo registrado`} />
        <Kpi label="Reprogramaciones" value={String(changes.reprogramadas)} hint={changes.repetidas > 0 ? `${changes.repetidas} asesoría(s) reprogramada(s) más de una vez` : undefined} />
        <Kpi label="Pedidas por el alumno o titular" value={String(changes.porAlumno)} />
        <Kpi label="Pedidas por la institución" value={String(changes.porInstitucion)} tone={changes.porInstitucion > changes.porAlumno ? 'text-warning-text' : undefined} hint={changes.sinMotivo > 0 ? `${changes.sinMotivo} sin motivo (antes del historial)` : undefined} />
      </div>

      <Card>
        <h4 className="text-sm font-bold text-text-primary uppercase tracking-wider mb-4">Motivos de cancelaciones y reprogramaciones</h4>
        {changes.motivos.length === 0 ? <p className="text-sm text-text-muted">No hay cambios registrados en el período.</p> : (
          <div className="space-y-3">
            {changes.motivos.map(m => (
              <div key={m.reason} className="grid grid-cols-[minmax(160px,320px)_1fr_40px] items-center gap-3 text-sm">
                <span className="text-text-secondary truncate" title={m.reason}>{m.reason}</span>
                <div className="h-3 bg-surface-muted rounded-full overflow-hidden"><div className={`h-full ${m.reason.startsWith('Institución') ? 'bg-warning-text' : 'bg-primary-accent'}`} style={{ width: `${(m.count / maxReason) * 100}%` }} /></div>
                <span className="text-right text-text-primary font-medium">{m.count}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <GroupTable title="Por sede" rows={report.byBranch} />
        <GroupTable title="Por programa" rows={report.byProgram} />
      </div>
      <GroupTable title="Por responsable" rows={report.byResponsible} />

      <Card className="p-0 overflow-hidden">
        <h4 className="text-sm font-bold text-text-primary uppercase tracking-wider px-4 pt-4 pb-2">Progreso por programa (sesiones del período)</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-text-secondary uppercase bg-surface-muted/50">
              <tr>
                <th className="px-4 py-2 font-medium">Programa</th>
                <th className="px-4 py-2 font-medium text-right">Sesiones</th>
                <th className="px-4 py-2 font-medium text-right">Alumnos</th>
                <th className="px-4 py-2 font-medium text-right">Velocidad prom. (pxm)</th>
                <th className="px-4 py-2 font-medium text-right">Comprensión prom.</th>
                <th className="px-4 py-2 font-medium text-right">Mejora de velocidad</th>
                <th className="px-4 py-2 font-medium text-right">Mejora de comprensión</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-soft">
              {report.progress.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-center text-text-muted">No hay sesiones con métricas en el período.</td></tr>}
              {report.progress.map(r => (
                <tr key={r.program}>
                  <td className="px-4 py-2 text-text-primary">{r.program}</td>
                  <td className="px-4 py-2 text-right">{r.sessions}</td>
                  <td className="px-4 py-2 text-right">{r.students}</td>
                  <td className="px-4 py-2 text-right">{r.avgSpeed ?? '—'}</td>
                  <td className="px-4 py-2 text-right">{r.avgComprehension === null ? '—' : `${r.avgComprehension} %`}</td>
                  <td className={`px-4 py-2 text-right ${r.speedGain !== null && r.speedGain < 0 ? 'text-danger-text' : ''}`}>{r.speedGain === null ? '—' : `${r.speedGain > 0 ? '+' : ''}${r.speedGain}`}<span className="block text-[11px] text-text-muted">{r.measured} alumno(s) con 2 o más sesiones</span></td>
                  <td className={`px-4 py-2 text-right ${r.comprehensionGain !== null && r.comprehensionGain < 0 ? 'text-danger-text' : ''}`}>{r.comprehensionGain === null ? '—' : `${r.comprehensionGain > 0 ? '+' : ''}${r.comprehensionGain} pts`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="flex justify-between items-center px-4 pt-4 pb-2">
          <h4 className="text-sm font-bold text-text-primary uppercase tracking-wider">Alumnos en riesgo ({report.risk.length})</h4>
          <Button variant="ghost" size="sm" disabled={report.risk.length === 0} onClick={() => downloadCsv(csvFileName('Alumnos en riesgo', today), ['Alumno', 'Sede', 'Programa', 'Motivos'], report.risk.map(r => [r.student, r.branchName, r.program, r.reasons.join('; ')]))}>CSV</Button>
        </div>
        <p className="px-4 pb-2 text-xs text-text-muted">{RISK_ABSENCES} o más faltas seguidas, {RISK_GAP_DAYS} días o más sin asesoría y sin ninguna reservada, o asesorías asistidas sin la sesión registrada. No depende del rango de fechas.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-text-secondary uppercase bg-surface-muted/50"><tr><th className="px-4 py-2 font-medium">Alumno</th><th className="px-4 py-2 font-medium">Sede</th><th className="px-4 py-2 font-medium">Programa</th><th className="px-4 py-2 font-medium">Motivos</th></tr></thead>
            <tbody className="divide-y divide-border-soft">
              {report.risk.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-text-muted">Ningún alumno en riesgo.</td></tr>}
              {report.risk.map(r => (
                <tr key={r.studentId}>
                  <td className="px-4 py-2 text-text-primary">{r.student}</td>
                  <td className="px-4 py-2 text-text-secondary">{r.branchName}</td>
                  <td className="px-4 py-2 text-text-secondary">{r.program}</td>
                  <td className="px-4 py-2"><div className="flex flex-wrap gap-1.5">{r.reasons.map(x => <Badge key={x} variant="warning">{x}</Badge>)}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Actividades del período" value={String(activityKpis.total)} hint={`${activityKpis.held} realizadas`} />
        <Kpi label="Inscritos" value={String(activityKpis.enrolled)} hint={activityKpis.occupancy === null ? 'Sin cupo definido' : `${pct(activityKpis.occupancy)} del cupo ocupado`} />
        <Kpi label="Asistencia a actividades" value={pct(activityKpis.attendanceRate)} />
        <Kpi label="Sin responsable" value={String(activityKpis.withoutResponsible)} tone={activityKpis.withoutResponsible > 0 ? 'text-warning-text' : undefined} hint="Sin responsable no se registra la asistencia" />
      </div>
      <Card className="p-0 overflow-hidden">
        <div className="flex justify-between items-center px-4 pt-4 pb-2">
          <h4 className="text-sm font-bold text-text-primary uppercase tracking-wider">Actividades especiales ({report.activities.length})</h4>
          <Button variant="ghost" size="sm" disabled={report.activities.length === 0} onClick={() => downloadCsv(csvFileName('Actividades especiales', today), ['Fecha', 'Actividad', 'Sede', 'Responsable', 'Cupo', 'Inscritos', 'Asistieron', 'Faltaron', 'Sin marcar', 'Asistencia'], report.activities.map(a => [dmy(a.date), a.name, a.sede, a.responsible || 'Por asignar', a.capacity ?? 'Sin límite', a.enrolled, a.present, a.absent, a.pending, a.rate === null ? '' : `${a.rate} %`]))}>CSV</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-text-secondary uppercase bg-surface-muted/50">
              <tr><th className="px-4 py-2 font-medium">Actividad</th><th className="px-4 py-2 font-medium">Fecha</th><th className="px-4 py-2 font-medium">Responsable</th><th className="px-4 py-2 font-medium text-right">Inscritos</th><th className="px-4 py-2 font-medium text-right">Asistieron</th><th className="px-4 py-2 font-medium text-right">Faltaron</th><th className="px-4 py-2 font-medium text-right">Sin marcar</th><th className="px-4 py-2 font-medium text-right">Asistencia</th></tr>
            </thead>
            <tbody className="divide-y divide-border-soft">
              {report.activities.length === 0 && <tr><td colSpan={8} className="px-4 py-6 text-center text-text-muted">No hay actividades en el período.</td></tr>}
              {report.activities.map(a => (
                <tr key={a.id}>
                  <td className="px-4 py-2"><div className="text-text-primary">{a.name}</div><div className="text-xs text-text-muted">{a.sede}</div></td>
                  <td className="px-4 py-2 whitespace-nowrap">{dmy(a.date)}</td>
                  <td className={`px-4 py-2 ${a.responsible ? 'text-text-secondary' : 'text-warning-text font-medium'}`}>{a.responsible || 'Por asignar'}</td>
                  <td className="px-4 py-2 text-right">{a.enrolled}{a.capacity !== null ? ` / ${a.capacity}` : ''}</td>
                  <td className="px-4 py-2 text-right">{a.present}</td>
                  <td className={`px-4 py-2 text-right ${a.absent > 0 ? 'text-danger-text' : ''}`}>{a.absent}</td>
                  <td className="px-4 py-2 text-right">{a.pending}</td>
                  <td className="px-4 py-2 text-right font-medium">{pct(a.rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
