import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { RoleEditor } from './builder/RoleEditor';
import { ConnectionMap } from './builder/ConnectionMap';

type Panel = 'editor' | 'map';

const PANELS: { id: Panel; label: string; hint: string }[] = [
  { id: 'editor', label: 'Editor de rol', hint: 'Marque las funciones del rol; el sistema completa lo que necesitan y avisa lo que conviene separar.' },
  { id: 'map', label: 'Mapa de conexiones', hint: 'Qué necesita cada función, qué otra persona debe poder hacer, qué datos toca y qué avisos dispara.' },
];

/**
 * Constructor de roles (Organización → Permisos). Las funciones salen del registro único (`utils/capabilityRegistry.ts`): aquí no se
 * escribe ningún permiso a mano ni se dibuja ninguna conexión. Panel A: mapa de conexiones · Panel B: editor de rol.
 * Las cuentas (panel C) se crean en Organización → Usuarios, donde el rol y su límite por sede se validan.
 */
export function Permissions() {
  const location = useLocation();
  const [panel, setPanel] = useState<Panel>('editor');
  const current = PANELS.find(p => p.id === panel)!;

  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h2 className="text-2xl font-semibold text-text-primary mb-1">Permisos</h2>
          <p className="text-sm text-text-secondary">{current.hint}</p>
        </div>
        <div className="inline-flex rounded-xl border border-border-soft bg-surface p-1" role="tablist">
          {PANELS.map(p => (
            <button
              key={p.id}
              role="tab"
              aria-selected={panel === p.id}
              onClick={() => setPanel(p.id)}
              className={`px-4 h-9 rounded-lg text-sm font-medium transition-colors ${panel === p.id ? 'bg-primary-accent text-white' : 'text-text-secondary hover:bg-surface-muted'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      {panel === 'editor' ? <RoleEditor initialRoleId={location.state?.selectedRoleId} /> : <ConnectionMap />}
    </div>
  );
}
