import React from 'react';
import { ShieldOff } from 'lucide-react';
import { capabilityById } from '../../utils/capabilities';
import { menuCapabilityOf } from '../../utils/guards';

/** Lo que se ve al abrir (por la barra de direcciones o un enlace) una pantalla cuya función no tiene el rol. */
export function NoAccess({ moduleId, item }: { moduleId: string; item: string }) {
  const capability = capabilityById(menuCapabilityOf(moduleId, item) ?? '');
  return (
    <div className="flex flex-col items-center justify-center h-full text-center gap-3 px-6">
      <div className="w-12 h-12 rounded-full bg-surface-muted flex items-center justify-center">
        <ShieldOff size={22} className="text-text-muted" />
      </div>
      <p className="text-base font-semibold text-text-primary">Su rol no tiene acceso a «{item}»</p>
      {capability && (
        <p className="text-sm text-text-muted max-w-md">
          Para entrar se necesita la función «{capability.label}». Pídasela a quien administra los roles.
        </p>
      )}
    </div>
  );
}
