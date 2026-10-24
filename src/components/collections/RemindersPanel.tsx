import React, { useMemo, useState } from 'react';
import { Copy, MessageCircle, Phone } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { ReasonDialog } from '../ui/ReasonDialog';
import { useData } from '../../context/DataContext';
import { PERM } from '../../utils/authority';
import { buildReminders, type Reminder, type ReminderLog } from '../../utils/collections';
import { csvFileName, downloadCsv } from '../../utils/exportCsv';
import { todayLocalISO } from '../../utils/schedule';

const usd = (n: number) => `USD ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const when = (iso: string) => new Date(iso).toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Recordatorios de cobranza de hoy: texto listo, WhatsApp con el mensaje, y registro de lo enviado u omitido. */
export function RemindersPanel() {
  const { plans, enrollments, students, guardians, branches, collectionPolicy, reminderLogs, logReminder, can } = useData();
  const today = todayLocalISO();
  const [note, setNote] = useState<string | null>(null);
  const [skipping, setSkipping] = useState<Reminder | null>(null);
  const [view, setView] = useState<'pendientes' | 'historial'>('pendientes');

  const reminders = useMemo(
    () => buildReminders({ plans, enrollments, students, guardians, branches }, collectionPolicy, reminderLogs, today),
    [plans, enrollments, students, guardians, branches, collectionPolicy, reminderLogs, today]
  );
  const mayRemind = can(PERM.sendReminders);

  const send = (r: Reminder, channel: ReminderLog['channel']) => {
    const res = logReminder(r, channel, 'Enviado', '');
    setNote(res.ok ? `Registrado: recordatorio a ${r.recipient} (${r.installmentName}).` : res.error ?? 'No se pudo registrar.');
  };
  const copy = async (r: Reminder) => {
    try { await navigator.clipboard.writeText(r.message); setNote('Mensaje copiado.'); } catch { setNote('No se pudo copiar: selecciónelo y cópielo a mano.'); }
  };

  const exportCsv = () => downloadCsv(
    csvFileName('Recordatorios de cobranza', today),
    ['Alumno', 'Matrícula', 'Destinatario', 'Teléfono', 'Correo', 'Cuota', 'Vence', 'Saldo (USD)', 'Días desde el vencimiento', 'Etapa', 'Mensaje'],
    reminders.map(r => [r.studentName, r.enrollmentId, r.recipient, r.phone, r.email, r.installmentName, r.dueISO, r.balance, r.daysFromDue, r.stage.label, r.message])
  );

  return (
    <div className="bg-surface border border-border-soft rounded-xl shadow-sm flex-1 flex flex-col overflow-hidden">
      <div className="p-4 border-b border-border-soft flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {([['pendientes', `Por atender (${reminders.length})`], ['historial', `Registrados (${reminderLogs.length})`]] as const).map(([v, label]) => (
            <button key={v} type="button" onClick={() => setView(v)} className={`h-8 px-3 rounded-lg border text-sm font-medium transition-colors ${view === v ? 'bg-primary-accent border-primary-accent text-white' : 'bg-surface border-border-soft text-text-secondary hover:bg-surface-muted'}`}>{label}</button>
          ))}
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
                <th className="px-6 py-3 font-medium">Alumno / Destinatario</th>
                <th className="px-6 py-3 font-medium">Cuota</th>
                <th className="px-6 py-3 font-medium text-right">Saldo</th>
                <th className="px-6 py-3 font-medium">Etapa</th>
                <th className="px-6 py-3 font-medium">Mensaje</th>
                <th className="px-6 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-soft">
              {reminders.length === 0 && <tr><td colSpan={6} className="px-6 py-10 text-center text-text-muted">No hay recordatorios por atender hoy. Se generan según la política de cobranza (Configuración → Política de cobranza).</td></tr>}
              {reminders.map(r => (
                <tr key={r.key} className="hover:bg-surface-muted/50 align-top">
                  <td className="px-6 py-3"><div className="font-medium text-text-primary">{r.studentName}</div><div className="text-xs text-text-muted">{r.recipient}{r.phone ? ` · ${r.phone}` : ' · sin teléfono'}</div></td>
                  <td className="px-6 py-3"><div className="text-text-primary">{r.installmentName}</div><div className="text-xs text-text-muted">{r.enrollmentId} · vence {r.dueISO.split('-').reverse().join('/')}</div></td>
                  <td className="px-6 py-3 text-right font-medium">{usd(r.balance)}</td>
                  <td className="px-6 py-3"><Badge variant={r.daysFromDue > 0 ? 'danger' : r.daysFromDue === 0 ? 'warning' : 'info'}>{r.stage.label}</Badge><div className="text-xs text-text-muted mt-1">{r.daysFromDue > 0 ? `Vencida hace ${r.daysFromDue} d` : r.daysFromDue === 0 ? 'Vence hoy' : `Vence en ${-r.daysFromDue} d`}</div></td>
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
                <th className="px-6 py-3 font-medium">Plan / cuota</th>
                <th className="px-6 py-3 font-medium">Canal</th>
                <th className="px-6 py-3 font-medium">Resultado</th>
                <th className="px-6 py-3 font-medium">Por</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-soft">
              {reminderLogs.length === 0 && <tr><td colSpan={5} className="px-6 py-10 text-center text-text-muted">Todavía no se registró ningún recordatorio.</td></tr>}
              {reminderLogs.map(l => (
                <tr key={l.id}>
                  <td className="px-6 py-3 font-mono text-text-secondary">{l.id}</td>
                  <td className="px-6 py-3">{l.planId} · {l.installmentId}<span className="block text-xs text-text-muted">{l.stageOffset < 0 ? `${-l.stageOffset} d antes` : l.stageOffset === 0 ? 'Día del vencimiento' : `${l.stageOffset} d después`}</span></td>
                  <td className="px-6 py-3">{l.channel}</td>
                  <td className="px-6 py-3"><Badge variant={l.result === 'Enviado' ? 'success' : 'neutral'}>{l.result}</Badge>{l.note && <span className="block text-xs text-text-muted mt-1">{l.note}</span>}</td>
                  <td className="px-6 py-3 text-text-secondary">{l.by}<span className="block text-xs text-text-muted">{when(l.at)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ReasonDialog
        isOpen={!!skipping}
        onClose={() => setSkipping(null)}
        title="Omitir recordatorio"
        confirmLabel="Omitir"
        size="md"
        detailLabel="Motivo"
        detailPlaceholder="Ej: ya pagó, se coordinó por teléfono..."
        onSubmit={({ detail }) => {
          if (!skipping) return;
          const res = logReminder(skipping, 'Otro', 'Omitido', detail);
          if (res.ok) setNote(`Omitido: ${skipping.installmentName} de ${skipping.studentName}.`);
          return res.ok ? null : res.error ?? 'No se pudo omitir.';
        }}
      >
        {skipping && <p className="text-sm text-text-secondary">No se enviará el recordatorio de «{skipping.installmentName}» de {skipping.studentName}. Queda registrado con el motivo.</p>}
      </ReasonDialog>
    </div>
  );
}
