import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '../../components/ui/Badge';
import { BarsCard, FilterBar, Kpi, NoAccess, ReportHeader, TableCard, selectCls, useRange } from '../../components/reports/ReportParts';
import { useData } from '../../context/DataContext';
import { AUDIT_MODULES, auditUsers, buildAudit, filterAudit, type AuditModule } from '../../utils/audit';
import { PERM } from '../../utils/authority';
import { csvFileName, downloadCsv } from '../../utils/exportCsv';
import { printTable } from '../../utils/printTable';
import { dayOf, dmy, isAllTime } from '../../utils/reportCommon';
import { todayLocalISO } from '../../utils/schedule';

const HEADERS = ['Fecha', 'Hora', 'Módulo', 'Acción', 'Detalle', 'Usuario', 'Referencia'];
const hour = (at: string) => (at.includes('T') ? new Date(at).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }) : at.length > 11 ? at.slice(11, 16) : '');

/**
 * Auditoría (Sistema y Reportes): quién hizo qué y cuándo, en una sola línea de tiempo. Reúne las constancias que ya guarda cada
 * módulo (matrículas, pagos, cajas, agenda, planilla, contratos, cobranza y stock); no tiene datos propios.
 */
export function AuditReport() {
  const d = useData();
  const navigate = useNavigate();
  const today = todayLocalISO();
  const { range, preset, setPreset, setRange } = useRange('30d');
  const [module, setModule] = useState<'' | AuditModule>('');
  const [user, setUser] = useState('');
  const [text, setText] = useState('');

  const all = useMemo(() => buildAudit({
    enrollmentChanges: d.enrollmentChanges, changeRequests: d.changeRequests, dropRequests: d.dropRequests, enrollments: d.enrollments, payments: d.payments, creditNotes: d.creditNotes,
    cashMovements: d.cashMovements, pettyCashMovements: d.pettyCashMovements, cashClosures: d.cashClosures, psyEvents: d.psyEvents, psyReminderLogs: d.psyReminderLogs,
    reminderLogs: d.reminderLogs, payrollRuns: d.payrollRuns, contracts: d.contracts, adjustments: d.adjustments,
    staffName: id => { const s = d.staff.find(x => x.id === id); return s ? `${s.names} ${s.lastNameP}` : id; },
    studentName: id => d.students.find(x => x.id === id)?.name ?? id,
  }), [d.enrollmentChanges, d.changeRequests, d.dropRequests, d.enrollments, d.payments, d.creditNotes, d.cashMovements, d.pettyCashMovements, d.cashClosures, d.psyEvents, d.psyReminderLogs, d.reminderLogs, d.payrollRuns, d.contracts, d.adjustments, d.staff, d.students]);
  const entries = useMemo(() => filterAudit(all, { range, module, user, text }), [all, range, module, user, text]);
  if (!d.can(PERM.reportView)) return <NoAccess />;

  const rows = entries.map(e => [dmy(dayOf(e.at)), hour(e.at), e.module, e.action, e.detail, e.by, e.ref ?? '']);
  const byModule = AUDIT_MODULES.map(m => ({ name: m, value: entries.filter(e => e.module === m).length })).filter(x => x.value > 0).sort((a, b) => b.value - a.value);
  const byUser = [...new Map(entries.map(e => [e.by || 'Sin usuario', 0])).keys()].map(name => ({ name, value: entries.filter(e => (e.by || 'Sin usuario') === name).length })).sort((a, b) => b.value - a.value);
  const period = isAllTime(range) ? 'todo el historial' : `${dmy(range.from)} al ${dmy(range.to)}`;
  const sensitive = entries.filter(e => /revers|anulad|cierre|reapertura|ca[ií]da|corrección/i.test(`${e.action}`)).length;

  return (
    <div className="flex flex-col gap-6">
      <ReportHeader
        title="Auditoría"
        subtitle={`Acciones con control registradas en el sistema, del ${period}. Reúne las constancias de cada módulo en una sola línea de tiempo.`}
        onPdf={() => printTable('Auditoría', period, HEADERS, rows)}
        onCsv={() => downloadCsv(csvFileName('Auditoría', today), HEADERS, rows)}
        disabled={rows.length === 0}
      />
      <FilterBar range={range} preset={preset} onPreset={setPreset} onRange={setRange} presets={['mes', '30d', 'anio', 'todo']}>
        <select className={selectCls} value={module} onChange={e => setModule(e.target.value as '' | AuditModule)} aria-label="Filtrar por módulo">
          <option value="">Todos los módulos</option>
          {AUDIT_MODULES.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select className={selectCls} value={user} onChange={e => setUser(e.target.value)} aria-label="Filtrar por usuario">
          <option value="">Todos los usuarios</option>
          {auditUsers(all).map(u => <option key={u} value={u}>{u}</option>)}
        </select>
        <input className={`${selectCls} w-64`} placeholder="Buscar en la acción, el detalle o la referencia..." value={text} onChange={e => setText(e.target.value)} />
      </FilterBar>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Registros" value={String(entries.length)} hint={`${all.length} en total`} />
        <Kpi label="Módulos con actividad" value={String(byModule.length)} />
        <Kpi label="Usuarios" value={String(byUser.length)} />
        <Kpi label="Reversas, cierres y bajas" value={String(sensitive)} tone={sensitive > 0 ? 'text-warning-text' : undefined} hint="Las acciones que más se revisan" />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <BarsCard title="Registros por módulo" items={byModule} />
        <BarsCard title="Registros por usuario" items={byUser} tone="bg-info-text" />
      </div>

      <TableCard
        title={`Línea de tiempo (${entries.length})`}
        note={entries.length > 200 ? 'Se muestran los 200 más recientes; el CSV trae todos.' : undefined}
        headers={['Fecha', 'Módulo', 'Acción', 'Detalle', 'Usuario', '']}
        rows={entries.slice(0, 200).map(e => [
          <span key="f" className="whitespace-nowrap">{dmy(dayOf(e.at))} <span className="text-text-muted">{hour(e.at)}</span></span>,
          <Badge key="m" variant="neutral">{e.module}</Badge>, <span key="a" className="font-medium text-text-primary">{e.action}</span>, e.detail || '—', e.by || '—',
          e.link ? <button key="v" type="button" className="text-xs text-primary-accent hover:underline whitespace-nowrap" onClick={() => navigate(e.link as string)}>Ver {e.ref ?? ''}</button> : '',
        ])}
        empty="No hay registros con esos filtros."
      />
    </div>
  );
}
