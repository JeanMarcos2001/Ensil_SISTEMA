import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { ResolveDropModal } from '../../components/enrollment/ResolveDropModal';
import { useData } from '../../context/DataContext';
import { localDateOf, longDayLabel } from '../../utils/schedule';

type Filter = 'Pendiente' | 'Aprobada' | 'Rechazada' | '';

/**
 * Solicitudes pendientes de resolver. Por ahora solo hay un tipo: la caída de una matrícula
 * (la pide quien atiende y se aprueba o rechaza aquí).
 */
export function PendingRequests() {
  const { dropRequests, enrollments } = useData();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('Pendiente');
  const [query, setQuery] = useState('');
  const [resolving, setResolving] = useState<string | null>(null);

  const count = (s: Filter) => dropRequests.filter(r => !s || r.status === s).length;
  const rows = dropRequests
    .filter(r => !filter || r.status === filter)
    .filter(r => {
      const e = enrollments.find(x => x.id === r.enrollmentId);
      return `${r.id} ${r.enrollmentId} ${e?.student ?? ''} ${r.reason}`.toLowerCase().includes(query.trim().toLowerCase());
    });

  const tone = (s: string) => (s === 'Pendiente' ? 'warning' : s === 'Aprobada' ? 'danger' : 'neutral');

  return (
    <div className="flex flex-col h-full">
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-text-primary mb-1">Solicitudes pendientes</h2>
        <p className="text-sm text-text-secondary">Solicitudes de caída de matrícula por aprobar o rechazar</p>
      </div>

      <div className="bg-surface border border-border-soft rounded-xl shadow-sm flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-border-soft flex flex-col md:flex-row gap-3 md:items-center justify-between">
          <div className="relative md:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
            <input
              className="w-full h-10 bg-surface border border-border-soft rounded-xl pl-9 pr-3 text-sm focus:outline-none focus:border-primary-accent"
              placeholder="Buscar por solicitud, matrícula, alumno o motivo..."
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
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
                return (
                  <tr key={r.id} className="hover:bg-surface-muted/50 transition-colors">
                    <td className="px-6 py-3 font-mono text-text-secondary">{r.id}</td>
                    <td className="px-6 py-3 text-text-primary">Caída de matrícula</td>
                    <td className="px-6 py-3">
                      <button type="button" className="text-left hover:underline" onClick={() => navigate(`/operacion/matriculas?ficha=${r.enrollmentId}`)}>
                        <span className="font-medium text-text-primary">{r.enrollmentId}</span>
                        <span className="block text-xs text-text-muted">{e?.student ?? '—'}</span>
                      </button>
                    </td>
                    <td className="px-6 py-3">
                      <span className="text-text-primary">{r.reason}</span>
                      <span className="block text-xs text-text-muted">Desde el {longDayLabel(r.effectiveDate)}</span>
                    </td>
                    <td className="px-6 py-3 text-text-secondary">{localDateOf(r.requestedAt)}<span className="block text-xs text-text-muted">{r.requestedBy}</span></td>
                    <td className="px-6 py-3"><Badge variant={tone(r.status)}>{r.status}</Badge></td>
                    <td className="px-6 py-3 text-right">
                      <Button variant={r.status === 'Pendiente' ? 'primary' : 'secondary'} size="sm" onClick={() => setResolving(r.id)}>
                        {r.status === 'Pendiente' ? 'Resolver' : 'Ver'}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <ResolveDropModal requestId={resolving} onClose={() => setResolving(null)} />
    </div>
  );
}
