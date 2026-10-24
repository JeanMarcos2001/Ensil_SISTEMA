import React, { useMemo, useState } from 'react';
import { Copy, MessageCircle, Phone } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { ClearFilters } from '../../components/ui/ClearFilters';
import { ReasonDialog } from '../../components/ui/ReasonDialog';
import { Card } from '../../components/ui/Card';
import { useData } from '../../context/DataContext';
import { PERM } from '../../utils/authority';
import { KIND_LABEL, buildPsyReminders, type PsyReminder, type PsyReminderKind } from '../../utils/psyReminders';
import { csvFileName, downloadCsv } from '../../utils/exportCsv';
import { allActivities, longDayLabel, todayLocalISO } from '../../utils/schedule';
import { nativeFieldCls } from './formStyles';

const when = (iso: string) => new Date(iso).toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const dayText = (days: number) => (days === 0 ? 'Hoy' : days === 1 ? 'Mañana' : `En ${days} días`);
const KIND_TONE: Record<PsyReminderKind, 'info' | 'primary' | 'warning'> = { asesoria: 'info', actividad: 'primary', vigencia: 'warning' };

/**
 * Psicopedagogía → Recordatorios: avisos al titular de las asesorías de mañana, de las actividades en las que está
 * inscrito y de la vigencia por vencer. El sistema prepara el texto y abre WhatsApp; aquí queda el registro.
 */
export function Reminders() {
  const {
    schedules, monthlySchedules, enrollments, students, guardians, programs, branches, psyReminderPolicy, psyReminderLogs, logPsyReminder, pendingFirstSessions, can,
  } = useData();
  const today = todayLocalISO();
  const [view, setView] = useState<'pendientes' | 'historial'>('pendientes');
  const [kind, setKind] = useState<'' | PsyReminderKind>('');
  const [branchFilter, setBranchFilter] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [skipping, setSkipping] = useState<PsyReminder | null>(null);
  const mayRemind = can(PERM.psiRemind);

  const all = useMemo(() => {
    const blocked = new Set(Object.values(pendingFirstSessions()).map(g => g.session?.id).filter((x): x is string => !!x));
    return buildPsyReminders(
      { schedules, activities: allActivities(monthlySchedules), enrollments, students, guardians, programs, branches, blockedScheduleIds: blocked },
      psyReminderPolicy, psyReminderLogs, today
    );
  }, [schedules, monthlySchedules, enrollments, students, guardians, programs, branches, psyReminderPolicy, psyReminderLogs, today, pendingFirstSessions]);

  const branchName = (id: string) => branches.find(b => b.id === id)?.name ?? '';
  const reminders = all.filter(r => (!kind || r.kind === kind) && (!branchFilter || r.branchName === branchName(branchFilter)));
  const count = (k: PsyReminderKind) => all.filter(r => r.kind === k).length;

  const send = (r: PsyReminder, channel: 'WhatsApp' | 'Llamada') => {
    const res = logPsyReminder(r, channel, 'Enviado', '');
    setNote(res.ok ? `Registrado: ${KIND_LABEL[r.kind].toLowerCase()} de ${r.studentName}.` : res.error ?? 'No se pudo registrar.');
  };
  const copy = async (r: PsyReminder) => {
    try { await navigator.clipboard.writeText(r.message); setNote('Mensaje copiado.'); } catch { setNote('No se pudo copiar: selecciónelo y cópielo a mano.'); }
  };
  const exportCsv = () => downloadCsv(
    csvFileName('Recordatorios de Psicopedagogía', today),
    ['Tipo', 'Alumno', 'Destinatario', 'Teléfono', 'Correo', 'Fecha', 'Cuándo', 'Etapa', 'Sede', 'Mensaje'],
    reminders.map(r => [KIND_LABEL[r.kind], r.studentName, r.recipient, r.phone, r.email, r.dateISO, dayText(r.daysLeft), r.label, r.branchName, r.message])
  );
  const studentName = (id: string) => students.find(s => s.id === id)?.name ?? id;

  return (
    <div className="flex flex-col h-full space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Recordatorios</h1>
        <p className="text-text-secondary mt-1">Avisos al titular de las asesorías próximas, de las actividades en las que está inscrito el alumno y de la vigencia por vencer. Los días se configuran en Configuración → Recordatorios de Psicopedagogía.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {(['asesoria', 'actividad', 'vigencia'] as const).map(k => (
          <Card key={k} className="p-4">
            <span className="text-sm font-medium text-text-secondary">{KIND_LABEL[k]}</span>
            <h3 className="text-2xl font-semibold mt-2 text-text-primary">{count(k)}</h3>
            <p className="text-xs text-text-muted mt-1">por atender hoy</p>
          </Card>
        ))}
      </div>

      <div className="bg-surface border border-border-soft rounded-xl shadow-sm flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-border-soft flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2 items-center">
            {([['pendientes', `Por atender (${all.length})`], ['historial', `Registrados (${psyReminderLogs.length})`]] as const).map(([v, label]) => (
              <button key={v} type="button" onClick={() => setView(v)} className={`h-8 px-3 rounded-lg border text-sm font-medium transition-colors ${view === v ? 'bg-primary-accent border-primary-accent text-white' : 'bg-surface border-border-soft text-text-secondary hover:bg-surface-muted'}`}>{label}</button>
            ))}
            {view === 'pendientes' && (
              <>
                <select className={`${nativeFieldCls} w-44`} value={kind} onChange={e => setKind(e.target.value as '' | PsyReminderKind)} aria-label="Filtrar por tipo">
                  <option value="">Todos los tipos</option>
                  {(Object.keys(KIND_LABEL) as PsyReminderKind[]).map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                </select>
                <select className={`${nativeFieldCls} w-40`} value={branchFilter} onChange={e => setBranchFilter(e.target.value)} aria-label="Filtrar por sede">
                  <option value="">Todas las sedes</option>
                  {branches.filter(b => b.status === 'Activo').map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
                <ClearFilters active={!!(kind || branchFilter)} onClear={() => { setKind(''); setBranchFilter(''); }} className="h-10 rounded-xl" />
              </>
            )}
          </div>
          <div className="flex items-center gap-3">
            {note && <span className="text-xs text-text-secondary">{note}</span>}
            {view === 'pendientes' && <Button variant="secondary" size="sm" onClick={exportCsv} disabled={reminders.length === 0}>Exportar</Button>}
          </div>
        </div>

        {view === 'pendientes' ? (
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-text-secondary uppercase bg-surface-muted/50 sticky top-0">
                <tr>
                  <th className="px-6 py-3 font-medium">Tipo</th>
                  <th className="px-6 py-3 font-medium">Alumno / Destinatario</th>
                  <th className="px-6 py-3 font-medium">Cuándo</th>
                  <th className="px-6 py-3 font-medium">Mensaje</th>
                  <th className="px-6 py-3 font-medium text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-soft">
                {reminders.length === 0 && <tr><td colSpan={5} className="px-6 py-10 text-center text-text-muted">No hay recordatorios por atender. Aparecen cuando una asesoría, una actividad o una vigencia entra en los días de aviso.</td></tr>}
                {reminders.map(r => (
                  <tr key={r.key} className="hover:bg-surface-muted/50 align-top">
                    <td className="px-6 py-3"><Badge variant={KIND_TONE[r.kind]}>{KIND_LABEL[r.kind]}</Badge><div className="text-xs text-text-muted mt-1">{r.label}</div></td>
                    <td className="px-6 py-3"><div className="font-medium text-text-primary">{r.studentName}</div><div className="text-xs text-text-muted">{r.recipient}{r.phone ? ` · ${r.phone}` : ' · sin teléfono'}</div><div className="text-xs text-text-muted">{r.branchName}</div></td>
                    <td className="px-6 py-3"><div className="text-text-primary">{dayText(r.daysLeft)}</div><div className="text-xs text-text-muted">{longDayLabel(r.dateISO)}{r.kind === 'vigencia' ? ' (fin de la duración base)' : ''}</div></td>
                    <td className="px-6 py-3 max-w-md"><p className="text-xs text-text-secondary line-clamp-3" title={r.message}>{r.message}</p></td>
                    <td className="px-6 py-3 text-right whitespace-nowrap">
                      <div className="flex justify-end gap-1.5 flex-wrap">
                        {r.whatsappUrl
                          ? <a href={r.whatsappUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 h-8 px-3 rounded-xl text-xs font-medium bg-surface border border-border-soft hover:bg-surface-muted"><MessageCircle size={14} /> WhatsApp</a>
                          : <span className="inline-flex items-center h-8 px-2 text-xs text-text-muted" title="El titular no tiene un celular válido registrado">Sin celular</span>}
                        <Button variant="secondary" size="sm" className="gap-1" onClick={() => copy(r)}><Copy size={14} /> Copiar</Button>
                        <Button variant="primary" size="sm" disabled={!mayRemind} onClick={() => send(r, 'WhatsApp')} title="Registra que el mensaje se envió por WhatsApp">Marcar enviado</Button>
                        <Button variant="ghost" size="sm" className="gap-1" disabled={!mayRemind} onClick={() => send(r, 'Llamada')} title="Registra una llamada"><Phone size={14} /></Button>
                        <Button variant="ghost" size="sm" disabled={!mayRemind} onClick={() => setSkipping(r)}>Omitir</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-text-secondary uppercase bg-surface-muted/50 sticky top-0">
                <tr>
                  <th className="px-6 py-3 font-medium">Registro</th>
                  <th className="px-6 py-3 font-medium">Tipo / alumno</th>
                  <th className="px-6 py-3 font-medium">Canal</th>
                  <th className="px-6 py-3 font-medium">Resultado</th>
                  <th className="px-6 py-3 font-medium">Por</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-soft">
                {psyReminderLogs.length === 0 && <tr><td colSpan={5} className="px-6 py-10 text-center text-text-muted">Todavía no se registró ningún recordatorio.</td></tr>}
                {psyReminderLogs.map(l => (
                  <tr key={l.id}>
                    <td className="px-6 py-3 font-mono text-text-secondary">{l.id}</td>
                    <td className="px-6 py-3"><Badge variant={KIND_TONE[l.kind]}>{KIND_LABEL[l.kind]}</Badge><span className="block text-xs text-text-muted mt-1">{studentName(l.studentId)} · {l.offset === 0 ? 'el mismo día' : `${l.offset} d antes`}</span></td>
                    <td className="px-6 py-3">{l.channel}</td>
                    <td className="px-6 py-3"><Badge variant={l.result === 'Enviado' ? 'success' : 'neutral'}>{l.result}</Badge>{l.note && <span className="block text-xs text-text-muted mt-1">{l.note}</span>}</td>
                    <td className="px-6 py-3 text-text-secondary">{l.by}<span className="block text-xs text-text-muted">{when(l.at)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ReasonDialog
        isOpen={!!skipping}
        onClose={() => setSkipping(null)}
        title="Omitir recordatorio"
        confirmLabel="Omitir"
        size="md"
        detailLabel="Motivo"
        detailPlaceholder="Ej: ya confirmó por teléfono, el alumno se retiró..."
        onSubmit={({ detail }) => {
          if (!skipping) return;
          const res = logPsyReminder(skipping, 'Otro', 'Omitido', detail);
          if (res.ok) setNote(`Omitido: ${KIND_LABEL[skipping.kind].toLowerCase()} de ${skipping.studentName}.`);
          return res.ok ? null : res.error ?? 'No se pudo omitir.';
        }}
      >
        {skipping && <p className="text-sm text-text-secondary">No se enviará el recordatorio de {KIND_LABEL[skipping.kind].toLowerCase()} de {skipping.studentName}. Queda registrado con el motivo.</p>}
      </ReasonDialog>
    </div>
  );
}
