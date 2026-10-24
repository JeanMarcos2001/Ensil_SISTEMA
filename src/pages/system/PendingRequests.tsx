import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { ResolveDropModal } from '../../components/enrollment/ResolveDropModal';
import { ResolveChangeModal } from '../../components/enrollment/ResolveChangeModal';
import { useData } from '../../context/DataContext';
import { canResolve, type ChangeKind } from '../../utils/authority';
import { localDateOf, longDayLabel } from '../../utils/schedule';

type Filter = 'Pendiente' | 'Aprobada' | 'Rechazada' | '';

interface Row {
  id: string;
  kind: ChangeKind;
  enrollmentId: string;
  reason: string;
  note: string;
  requestedAt: string;
  requestedBy: string;
  status: string;
  /** Solo en caídas se resuelve con su propia ventana. */
  isDrop: boolean;
}

/**
 * Solicitudes sobre las matrículas: caída, reactivación, cambio de programa y traslado de sede. Las pide quien atiende y las
 * resuelve quien tenga el permiso de aprobar ese tipo (ver Organización → Permisos).
 */
export function PendingRequests() {
  const { dropRequests, changeRequests, enrollments, currentUser, roles, permissions } = useData();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('Pendiente');
  const [kindFilter, setKindFilter] = useState<'' | ChangeKind>('');
  const [query, setQuery] = useState('');
  const [resolving, setResolving] = useState<Row | null>(null);

  const all: Row[] = useMemo(() => [
    ...dropRequests.map(r => ({ id: r.id, kind: 'Caída' as ChangeKind, enrollmentId: r.enrollmentId, reason: r.reason, note: `Desde el ${longDayLabel(r.effectiveDate)}`, requestedAt: r.requestedAt, requestedBy: r.requestedBy, status: r.status, isDrop: true })),
    ...changeRequests.map(r => ({ id: r.id, kind: r.kind as ChangeKind, enrollmentId: r.enrollmentId, reason: r.reason, note: r.detail, requestedAt: r.requestedAt, requestedBy: r.requestedBy, status: r.status, isDrop: false })),
  ].sort((a, b) => b.requestedAt.localeCompare(a.requestedAt)), [dropRequests, changeRequests]);

  const count = (s: Filter) => all.filter(r => !s || r.status === s).length;
  const rows = all
    .filter(r => !filter || r.status === filter)
    .filter(r => !kindFilter || r.kind === kindFilter)
    .filter(r => {
      const e = enrollments.find(x => x.id === r.enrollmentId);
      return `${r.id} ${r.enrollmentId} ${e?.student ?? ''} ${r.reason} ${r.kind}`.toLowerCase().includes(query.trim().toLowerCase());
    });

  const tone = (s: string) => (s === 'Pendiente' ? 'warning' : s === 'Aprobada' ? 'danger' : 'neutral');
  const authority = { user: currentUser, roles, permissions };

  return (
    <div className="flex flex-col h-full">
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-text-primary mb-1">Solicitudes pendientes</h2>
        <p className="text-sm text-text-secondary">Caídas, reactivaciones, cambios de programa y traslados de sede por aprobar o rechazar</p>
      </div>

      <div className="bg-surface border border-border-soft rounded-xl shadow-sm flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-border-soft flex flex-col lg:flex-row gap-3 lg:items-center justify-between">
          <div className="flex gap-3 flex-1">
            <div className="relative md:w-96 flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
              <input
                className="w-full h-10 bg-surface border border-border-soft rounded-xl pl-9 pr-3 text-sm focus:outline-none focus:border-primary-accent"
                placeholder="Buscar por solicitud, matrícula, alumno o motivo..."
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
            </div>
            <select className="h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:outline-none focus:border-primary-accent" value={kindFilter} onChange={e => setKindFilter(e.target.value as '' | ChangeKind)}>
              <option value="">Todos los tipos</option>
              {(['Caída', 'Reactivación', 'Cambio de programa', 'Traslado de sede'] as ChangeKind[]).map(k => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            {([['Pendiente', 'Pendientes'], ['Aprobada', 'Aprobadas'], ['Rechazada', 'Rechazadas'], ['', 'Todas']] as const).map(([v, label]) => (
              <button
                key={label}
                type="button"
                onClick={() => setFilter(v)}
                className={`h-8 px-3 rounded-lg border text-sm font-medium transition-colors ${
                  filter === v ? 'bg-primary-accent border-primary-accent text-white' : 'bg-surface border-border-soft text-text-secondary hover:bg-surface-muted'
                }`}
              >
                {label} <span className="opacity-80">({count(v)})</span>
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto flex-1">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-text-secondary uppercase bg-surface-muted/50 sticky top-0">
              <tr>
                <th className="px-6 py-3 font-medium">Solicitud</th>
                <th className="px-6 py-3 font-medium">Tipo</th>
                <th className="px-6 py-3 font-medium">Matrícula / Alumno</th>
                <th className="px-6 py-3 font-medium">Motivo</th>
                <th className="px-6 py-3 font-medium">Solicitada</th>
                <th className="px-6 py-3 font-medium">Estado</th>
                <th className="px-6 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-soft">
              {rows.length === 0 && <tr><td colSpan={7} className="px-6 py-10 text-center text-text-muted">No hay solicitudes {filter ? filter.toLowerCase() + 's' : ''}.</td></tr>}
              {rows.map(r => {
                const e = enrollments.find(x => x.id === r.enrollmentId);
                const mayResolve = canResolve(authority, r.kind, r.requestedBy).ok;
                return (
                  <tr key={r.id} className="hover:bg-surface-muted/50 transition-colors">
                    <td className="px-6 py-3 font-mono text-text-secondary">{r.id}</td>
                    <td className="px-6 py-3 text-text-primary">{r.kind}</td>
                    <td className="px-6 py-3">
                      <button type="button" className="text-left hover:underline" onClick={() => navigate(`/operacion/matriculas?ficha=${r.enrollmentId}`)}>
                        <span className="font-medium text-text-primary">{r.enrollmentId}</span>
                        <span className="block text-xs text-text-muted">{e?.student ?? '—'}</span>
                      </button>
                    </td>
                    <td className="px-6 py-3 max-w-xs">
                      <span className="text-text-primary">{r.reason}</span>
                      <span className="block text-xs text-text-muted truncate">{r.note}</span>
                    </td>
                    <td className="px-6 py-3 text-text-secondary">{localDateOf(r.requestedAt)}<span className="block text-xs text-text-muted">{r.requestedBy}</span></td>
                    <td className="px-6 py-3"><Badge variant={tone(r.status)}>{r.status}</Badge></td>
                    <td className="px-6 py-3 text-right">
                      <Button variant={r.status === 'Pendiente' && mayResolve ? 'primary' : 'secondary'} size="sm" onClick={() => setResolving(r)} title={r.status === 'Pendiente' && !mayResolve ? 'Su rol no puede resolver este tipo de solicitud' : undefined}>
                        {r.status === 'Pendiente' ? (mayResolve ? 'Resolver' : 'Ver') : 'Ver'}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <ResolveDropModal requestId={resolving?.isDrop ? resolving.id : null} onClose={() => setResolving(null)} />
      <ResolveChangeModal requestId={resolving && !resolving.isDrop ? resolving.id : null} onClose={() => setResolving(null)} />
    </div>
  );
}
