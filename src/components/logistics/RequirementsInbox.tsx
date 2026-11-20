import React, { useState } from 'react';
import { ClipboardList, MessageSquare, Search } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { useData } from '../../context/DataContext';
import { requirementChanges, requirementMatches, requirementSedeStatus, requirementTotals, unreadMessages } from '../../utils/requirements';

interface Props {
  /** La sede que se está viendo. */
  branchId: string;
  /** Abre el detalle con la conversación. */
  onOpen: (requirementId: string) => void;
}

const day = (iso: string) => iso.split('-').reverse().join('/');

/**
 * Los requerimientos de la sede, tal como los ve ella: sigue en Logística, rechazado (con su motivo) o despachado, y cómo cambió su lista («pidió 30 → se enviará 4»).
 * **Nunca muestra la etapa de la preparación** en que está: hasta que sale, la sede no ve cómo se va armando. Se mantiene al día en vivo.
 */
export function RequirementsInbox({ branchId, onOpen }: Props) {
  const { requirements, shipments, requirementMessages, requirementSeen, items, currentUser } = useData();
  const [query, setQuery] = useState('');
  const itemName = (id: string) => items.find(i => i.id === id)?.name ?? id;
  const mine = requirements
    .filter(r => r.branchId === branchId)
    .filter(r => requirementMatches(r, query, '', itemName))
    .sort((a, b) => b.id.localeCompare(a.id));

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="p-4 border-b border-border-soft">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
          <input
            type="text" placeholder="Buscar por código o artículo…" aria-label="Buscar requerimientos"
            className="w-full h-10 bg-surface border border-border-soft rounded-xl pl-9 pr-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent transition-shadow"
            value={query} onChange={e => setQuery(e.target.value)}
          />
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-border-soft bg-surface-muted/50">
              <th className="py-3 px-4 text-xs font-medium text-text-muted uppercase tracking-wider">Requerimiento</th>
              <th className="py-3 px-4 text-xs font-medium text-text-muted uppercase tracking-wider">Artículos</th>
              <th className="py-3 px-4 text-xs font-medium text-text-muted uppercase tracking-wider">Situación</th>
              <th className="py-3 px-4 text-xs font-medium text-text-muted uppercase tracking-wider text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-soft">
            {mine.map(r => {
              const status = requirementSedeStatus(r, shipments);
              const totals = requirementTotals(r);
              const changes = requirementChanges(r);
              const unread = unreadMessages(requirementMessages, r.id, requirementSeen[r.id] ?? 0, currentUser.id);
              return (
                <tr key={r.id} className="hover:bg-surface-muted/30 transition-colors">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2 mb-1"><ClipboardList size={14} className="text-primary-accent" /><span className="text-sm font-bold text-text-primary">{r.id}</span></div>
                    <span className="text-xs text-text-muted">{day(r.date)}{r.createdBy ? ` · ${r.createdBy}` : ''}</span>
                  </td>
                  <td className="py-3 px-4 text-sm text-text-secondary">
                    <div>{totals.lines} art. · pidió {totals.requested} unid.{totals.toSend !== null ? ` · se enviará ${totals.toSend}` : ''}</div>
                    {changes.length > 0 && (
                      <ul className="mt-1 text-xs text-warning-text space-y-0.5">
                        {changes.slice(0, 3).map(l => <li key={l.itemId}>{itemName(l.itemId)}: pidió {l.quantity} → se enviará {l.send ?? 0}</li>)}
                        {changes.length > 3 && <li>y {changes.length - 3} más (vea el detalle)</li>}
                      </ul>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <Badge variant={status.tone === 'danger' ? 'danger' : status.tone === 'success' ? 'success' : 'neutral'}>{status.label}</Badge>
                    <p className="text-xs text-text-muted mt-1 max-w-xs">{status.detail}</p>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onOpen(r.id)}>
                      <MessageSquare size={14} />Detalle y mensajes
                      {unread > 0 && <span className="ml-1 px-1.5 rounded-full bg-primary-accent text-white text-[10px]">{unread}</span>}
                    </Button>
                  </td>
                </tr>
              );
            })}
            {mine.length === 0 && (
              <tr>
                <td colSpan={4} className="py-12 text-center">
                  <div className="flex flex-col items-center justify-center">
                    <ClipboardList size={40} className="text-text-muted mb-3 opacity-20" />
                    <p className="text-text-muted text-sm">{requirements.some(r => r.branchId === branchId) ? 'Ningún requerimiento coincide con la búsqueda.' : 'Todavía no hay requerimientos. Use «Armar requerimiento» para pedir mercadería al almacén.'}</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
