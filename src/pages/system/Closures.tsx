import React, { useState } from 'react';
import { AlertTriangle, Plus } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { ReasonDialog } from '../../components/ui/ReasonDialog';
import { CloseCashModal } from '../../components/cash/CloseCashModal';
import { useData, type CashClosure } from '../../context/DataContext';
import { PERM } from '../../utils/authority';
import { closedUntil, closureDrift, scopeLabel, type ClosureScope } from '../../utils/cashClosure';
import { csvFileName, downloadCsv } from '../../utils/exportCsv';
import { todayLocalISO } from '../../utils/schedule';

const BOXES: { key: string; scope: ClosureScope; currency: 'PEN' | 'USD'; label: string }[] = [
  { key: 'caja-PEN', scope: 'caja', currency: 'PEN', label: 'Caja PEN' },
  { key: 'caja-USD', scope: 'caja', currency: 'USD', label: 'Caja USD' },
  { key: 'chica-PEN', scope: 'caja-chica', currency: 'PEN', label: 'Caja chica' },
];
const sym = (c: 'PEN' | 'USD') => (c === 'PEN' ? 'S/' : '$');
const money = (n: number) => n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const when = (iso: string) => new Date(iso).toLocaleString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Sistema → Cierres: arqueos de las cajas. Un día cerrado bloquea los movimientos manuales de esa fecha hasta reabrir el cierre. */
export function Closures() {
  const { cashClosures, cashMovements, pettyCashMovements, reopenCash, can } = useData();
  const [box, setBox] = useState('');
  const [closing, setClosing] = useState<(typeof BOXES)[number] | null>(null);
  const [toReopen, setToReopen] = useState<CashClosure | null>(null);
  const rows = cashClosures.filter(c => !box || BOXES.find(b => b.key === box && b.scope === c.scope && b.currency === c.currency));
  const canClose = (b: (typeof BOXES)[number]) => can(b.scope === 'caja' ? PERM.closeCash : PERM.closePetty);
  const canReopen = (c: CashClosure) => can(c.scope === 'caja' ? PERM.reopenCash : PERM.closePetty);

  const handleExport = () => downloadCsv(
    csvFileName('Cierres de caja', todayLocalISO()),
    ['Cierre', 'Caja', 'Fecha', 'Sistema', 'Contado', 'Diferencia', 'Nota', 'Cerrado por', 'Cerrado el', 'Estado', 'Reabierto por', 'Motivo de la reapertura'],
    rows.map(c => [c.id, scopeLabel(c.scope, c.currency), c.date, c.expected, c.counted, c.difference, c.note, c.closedBy, c.closedAt, c.status, c.reopenedBy ?? '', c.reopenReason ?? ''])
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-text-primary mb-1">Cierres de caja</h2>
          <p className="text-sm text-text-secondary">Arqueo diario de la Caja PEN, la Caja USD y la Caja chica. Un día cerrado bloquea sus movimientos manuales.</p>
        </div>
        <Button variant="secondary" onClick={handleExport} disabled={rows.length === 0}>Exportar</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {BOXES.map(b => {
          const last = closedUntil(cashClosures, b.scope, b.currency);
          return (
            <div key={b.key} className="border border-border-soft rounded-xl p-4 bg-surface">
              <div className="flex justify-between items-start">
                <span className="text-sm font-medium text-text-secondary">{b.label}</span>
                <Badge variant={last ? 'neutral' : 'success'}>{last ? 'Con cierres' : 'Abierta'}</Badge>
              </div>
              <p className="text-sm text-text-primary mt-2">{last ? `Cerrada hasta el ${last.split('-').reverse().join('/')}` : 'Aún sin cierres'}</p>
              {canClose(b) && (
                <Button variant="primary" size="sm" className="mt-3 gap-1" onClick={() => setClosing(b)}><Plus size={14} /> Nuevo cierre</Button>
              )}
            </div>
          );
        })}
      </div>

      <div className="bg-surface border border-border-soft rounded-xl shadow-sm flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-border-soft flex gap-2 flex-wrap">
          {[{ key: '', label: 'Todas' }, ...BOXES].map(b => (
            <button key={b.key || 'todas'} type="button" onClick={() => setBox(b.key)} className={`h-8 px-3 rounded-lg border text-sm font-medium transition-colors ${box === b.key ? 'bg-primary-accent border-primary-accent text-white' : 'bg-surface border-border-soft text-text-secondary hover:bg-surface-muted'}`}>{b.label}</button>
          ))}
        </div>
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-text-secondary uppercase bg-surface-muted/50 sticky top-0">
              <tr>
                <th className="px-6 py-3 font-medium">Cierre</th>
                <th className="px-6 py-3 font-medium">Caja</th>
                <th className="px-6 py-3 font-medium">Hasta el</th>
                <th className="px-6 py-3 font-medium text-right">Sistema</th>
                <th className="px-6 py-3 font-medium text-right">Contado</th>
                <th className="px-6 py-3 font-medium text-right">Diferencia</th>
                <th className="px-6 py-3 font-medium">Cerrado por</th>
                <th className="px-6 py-3 font-medium">Estado</th>
                <th className="px-6 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-soft">
              {rows.length === 0 && <tr><td colSpan={9} className="px-6 py-10 text-center text-text-muted">Aún no hay cierres.</td></tr>}
              {rows.map(c => {
                const drift = closureDrift(c, cashMovements, pettyCashMovements);
                const latest = c.status === 'Cerrada' && closedUntil(cashClosures, c.scope, c.currency) === c.date;
                return (
                  <tr key={c.id} className="hover:bg-surface-muted/50">
                    <td className="px-6 py-3 font-mono text-text-secondary">{c.id}</td>
                    <td className="px-6 py-3 text-text-primary">{scopeLabel(c.scope, c.currency)}</td>
                    <td className="px-6 py-3 whitespace-nowrap">{c.date.split('-').reverse().join('/')}</td>
                    <td className="px-6 py-3 text-right">{sym(c.currency)} {money(c.expected)}</td>
                    <td className="px-6 py-3 text-right">{sym(c.currency)} {money(c.counted)}</td>
                    <td className={`px-6 py-3 text-right font-medium ${c.difference === 0 ? 'text-success-text' : 'text-danger-text'}`}>{c.difference === 0 ? 'Cuadra' : `${c.difference > 0 ? '+' : ''}${money(c.difference)}`}</td>
                    <td className="px-6 py-3 text-text-secondary">{c.closedBy}<span className="block text-xs text-text-muted">{when(c.closedAt)}</span></td>
                    <td className="px-6 py-3">
                      <Badge variant={c.status === 'Cerrada' ? 'neutral' : 'warning'}>{c.status}</Badge>
                      {drift !== 0 && <span className="flex items-center gap-1 text-xs text-warning-text mt-1"><AlertTriangle size={12} /> Desactualizado ({drift > 0 ? '+' : ''}{money(drift)})</span>}
                    </td>
                    <td className="px-6 py-3 text-right">
                      {latest && canReopen(c) && <Button variant="secondary" size="sm" onClick={() => setToReopen(c)}>Reabrir</Button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <CloseCashModal isOpen={!!closing} onClose={() => setClosing(null)} scope={closing?.scope ?? 'caja'} currency={closing?.currency ?? 'PEN'} />

      <ReasonDialog
        isOpen={!!toReopen}
        onClose={() => setToReopen(null)}
        title={`Reabrir el cierre ${toReopen?.id ?? ''}`}
        confirmLabel="Reabrir cierre"
        danger
        detailLabel="Motivo de la reapertura"
        detailPlaceholder="Por qué hay que reabrir este día..."
        onSubmit={({ detail }) => {
          if (!toReopen) return;
          const r = reopenCash(toReopen.id, detail);
          return r.ok ? null : r.error ?? 'No se pudo reabrir el cierre.';
        }}
      >
        {toReopen && (
          <p className="text-sm text-text-secondary">
            Se reabrirá el cierre de {scopeLabel(toReopen.scope, toReopen.currency)} al {toReopen.date.split('-').reverse().join('/')}. Mientras esté abierto se podrán registrar y reversar movimientos de esa fecha; después hay que volver a cerrar. Queda en <span className="font-medium">Sistema → Reaperturas</span>.
          </p>
        )}
      </ReasonDialog>
    </div>
  );
}

/** Sistema → Reaperturas: historial de los cierres que se reabrieron, quién lo hizo y por qué. */
export function Reopenings() {
  const { cashClosures } = useData();
  const rows = cashClosures.filter(c => c.status === 'Reabierta').sort((a, b) => (b.reopenedAt ?? '').localeCompare(a.reopenedAt ?? ''));
  return (
    <div className="flex flex-col h-full">
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-text-primary mb-1">Reaperturas de caja</h2>
        <p className="text-sm text-text-secondary">Cierres que se reabrieron, con quién lo hizo y el motivo. Cada reapertura también genera una notificación.</p>
      </div>
      <div className="bg-surface border border-border-soft rounded-xl shadow-sm flex-1 overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-text-secondary uppercase bg-surface-muted/50">
            <tr>
              <th className="px-6 py-3 font-medium">Cierre</th>
              <th className="px-6 py-3 font-medium">Caja</th>
              <th className="px-6 py-3 font-medium">Hasta el</th>
              <th className="px-6 py-3 font-medium">Reabierto</th>
              <th className="px-6 py-3 font-medium">Motivo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-soft">
            {rows.length === 0 && <tr><td colSpan={5} className="px-6 py-10 text-center text-text-muted">Todavía no se reabrió ningún cierre.</td></tr>}
            {rows.map(c => (
              <tr key={c.id}>
                <td className="px-6 py-3 font-mono text-text-secondary">{c.id}</td>
                <td className="px-6 py-3 text-text-primary">{scopeLabel(c.scope, c.currency)}</td>
                <td className="px-6 py-3">{c.date.split('-').reverse().join('/')}</td>
                <td className="px-6 py-3 text-text-secondary">{c.reopenedBy}<span className="block text-xs text-text-muted">{c.reopenedAt ? when(c.reopenedAt) : ''}</span></td>
                <td className="px-6 py-3 text-text-primary">{c.reopenReason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
