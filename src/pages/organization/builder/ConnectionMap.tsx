import React, { useMemo, useState } from 'react';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { Search } from 'lucide-react';
import { useData } from '../../../context/DataContext';
import { capabilityById, connectionsOf, permissionCatalog } from '../../../utils/capabilities';
import { INCOMPATIBILITIES } from '../../../utils/capabilityRegistry';

const MODULES = permissionCatalog({ includeReserved: true });
const label = (id: string) => capabilityById(id)?.label ?? id;

/** Cómo se relaciona cada función con la que está elegida (colorea la lista). */
type Relation = 'self' | 'requires' | 'neededBy' | 'counterpart' | 'counterpartOf';
const RELATION_STYLE: Record<Relation, string> = {
  self: 'bg-primary-accent text-white border-primary-accent',
  requires: 'bg-info-tint text-info-text border-info-text/30',
  neededBy: 'bg-warning-tint text-warning-text border-warning-text/30',
  counterpart: 'bg-success-tint text-success-text border-success-text/30',
  counterpartOf: 'bg-success-tint text-success-text border-success-text/30 border-dashed',
};

function List({ title, empty, children }: { title: string; empty?: string; children?: React.ReactNode[] }) {
  const items = (children ?? []).filter(Boolean);
  return (
    <div>
      <h5 className="text-xs font-bold text-text-primary uppercase tracking-wider mb-1.5">{title}</h5>
      {items.length === 0 ? <p className="text-xs text-text-muted">{empty ?? '—'}</p> : <ul className="space-y-1 text-sm text-text-secondary">{items}</ul>}
    </div>
  );
}

/** Panel A · Mapa de conexiones: el cuadro de referencia en solo lectura (es el mismo registro, no una copia). */
export function ConnectionMap() {
  const { roles, permissions } = useData();
  const [moduleId, setModuleId] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string>('');

  const info = selected ? connectionsOf(selected) : undefined;
  const relation = useMemo(() => {
    const map = new Map<string, Relation>();
    if (!info) return map;
    info.neededBy.forEach(c => map.set(c.id, 'neededBy'));
    info.counterpartOf.forEach(c => map.set(c.id, 'counterpartOf'));
    info.counterparts.forEach(c => map.set(c.capability.id, 'counterpart'));
    info.requires.forEach(c => map.set(c.id, 'requires'));
    map.set(selected, 'self');
    return map;
  }, [info, selected]);

  const q = query.trim().toLowerCase();
  const modules = MODULES.filter(m => !moduleId || m.id === moduleId)
    .map(m => ({
      ...m,
      functionalities: m.functionalities
        .map(f => ({ ...f, actions: f.actions.filter(a => !q || a.label.toLowerCase().includes(q) || f.name.toLowerCase().includes(q)) }))
        .filter(f => f.actions.length > 0),
    }))
    .filter(m => m.functionalities.length > 0);

  const rolesWith = info ? roles.filter(r => permissions.find(p => p.roleId === r.id)?.permissions.includes(info.capability.id)) : [];
  const rules = info ? INCOMPATIBILITIES.filter(r => r.capabilities.includes(info.capability.id)) : [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 flex-1 min-h-0">
      <Card className="lg:col-span-3 flex flex-col p-0 h-full overflow-hidden">
        <div className="p-4 border-b border-border-soft space-y-3">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
              <input
                type="text"
                placeholder="Buscar una función..."
                value={query}
                onChange={e => setQuery(e.target.value)}
                className="w-full h-10 bg-surface border border-border-soft rounded-xl pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary-accent"
              />
            </div>
            <select value={moduleId} onChange={e => setModuleId(e.target.value)} className="h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent min-w-[180px]">
              <option value="">Todos los módulos</option>
              {MODULES.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div className="flex flex-wrap gap-2 text-[11px]">
            <span className="px-2 py-0.5 rounded-md border bg-primary-accent text-white border-primary-accent">Elegida</span>
            <span className="px-2 py-0.5 rounded-md border bg-info-tint text-info-text border-info-text/30">La necesita</span>
            <span className="px-2 py-0.5 rounded-md border bg-warning-tint text-warning-text border-warning-text/30">La necesitan</span>
            <span className="px-2 py-0.5 rounded-md border bg-success-tint text-success-text border-success-text/30">Contraparte</span>
            <span className="px-2 py-0.5 rounded-md border border-dashed bg-success-tint text-success-text border-success-text/30">Es su contraparte</span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {modules.map(m => (
            <section key={m.id}>
              <h4 className="text-sm font-semibold text-text-primary mb-2">{m.name}</h4>
              <div className="space-y-3">
                {m.functionalities.map(f => (
                  <div key={f.id}>
                    <p className="text-xs text-text-muted mb-1">{f.name}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {f.actions.map(a => {
                        const id = `${f.id}:${a.id}`;
                        const rel = relation.get(id);
                        const reserved = capabilityById(id)?.reserved;
                        return (
                          <button
                            key={id}
                            onClick={() => setSelected(id)}
                            className={`px-2.5 py-1 rounded-lg border text-xs transition-colors ${rel ? RELATION_STYLE[rel] : 'bg-surface border-border-soft text-text-secondary hover:border-primary-accent/40'} ${reserved ? 'opacity-60' : ''}`}
                          >
                            {a.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
          {modules.length === 0 && <p className="text-sm text-text-muted">Ninguna función coincide con la búsqueda.</p>}
        </div>
      </Card>

      <Card className="lg:col-span-2 p-4 h-full overflow-y-auto space-y-5">
        {!info ? (
          <p className="text-sm text-text-secondary">Elija una función para ver qué necesita, qué otra persona debe poder hacer, qué datos toca y qué avisos dispara. Este cuadro es el mismo registro que usa el sistema: no se dibuja a mano.</p>
        ) : (
          <>
            <div>
              <h3 className="text-base font-semibold text-text-primary">{info.capability.label}</h3>
              <p className="text-xs text-text-muted font-mono">{info.capability.id}</p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                <Badge variant="neutral">{info.capability.kind}</Badge>
                {info.capability.sensitive === 'dinero' && <Badge variant="warning">💲 dinero</Badge>}
                {info.capability.sensitive === 'control' && <Badge variant="danger">🛡 control</Badge>}
                {info.capability.sensitive === 'remuneracion' && <Badge variant="info">👁‍🗨 sueldos</Badge>}
                {info.capability.reserved && <Badge variant="secondary">Reservada</Badge>}
                {info.capability.menu && <Badge variant="primary">Menú «{info.capability.menu.item}»</Badge>}
              </div>
              {info.capability.note && <p className="text-xs text-text-secondary mt-2">{info.capability.note}</p>}
            </div>
            <List title="La misma persona necesita" empty="Nada más.">{info.requires.map(c => <li key={c.id}>{c.label}</li>)}</List>
            <List title="La necesitan otras funciones" empty="Ninguna.">{info.neededBy.map(c => <li key={c.id}>{c.label}</li>)}</List>
            <List title="Otra persona debe poder" empty="No depende de otra persona.">
              {info.counterparts.map(c => (
                <li key={c.capability.id}>
                  <span className="text-text-primary">{c.capability.label}</span>{' '}
                  <Badge variant={c.strength === 'required' ? 'danger' : 'warning'}>{c.strength === 'required' ? 'obligatoria' : 'recomendada'}</Badge>
                  <span className="block text-xs text-text-muted">{c.where === 'destination-branch' ? 'En la sede destino' : c.where === 'same-branch' ? 'En la misma sede' : 'En cualquier sede'}. {c.why}</span>
                </li>
              ))}
            </List>
            <List title="Es la contraparte de" empty="Ninguna.">{info.counterpartOf.map(c => <li key={c.id}>{c.label}</li>)}</List>
            <List title="Lee" empty="—">{info.reads.map(x => <li key={x}>{x}</li>)}</List>
            <List title="Escribe" empty="—">{info.writes.map(x => <li key={x}>{x}</li>)}</List>
            <List title="Avisos que dispara" empty="Ninguno.">{info.events.map(e => <li key={e.id}>{e.label}</li>)}</List>
            <List title="Avisos que recibe" empty="Ninguno.">{info.receives.map(e => <li key={e.id}>{e.label}</li>)}</List>
            <List title="Combinaciones a separar" empty="Ninguna.">{rules.map(r => <li key={r.id}>{r.message}</li>)}</List>
            <List title="Roles que la tienen" empty="Ningún rol.">{rolesWith.map(r => <li key={r.id}>{r.name}</li>)}</List>
          </>
        )}
      </Card>
    </div>
  );
}
