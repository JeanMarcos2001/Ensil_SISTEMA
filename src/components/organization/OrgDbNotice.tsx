import React from 'react';
import { Database, Loader2, AlertTriangle } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { Button } from '../ui/Button';

/**
 * Estado de Empresas, Filiales y Almacenes guardados en la base de datos: cargando, con error de conexión (reintentar) o listo.
 * Con `quiet` solo aparece cuando hay algo que avisar (cargando o con error); listo no muestra nada.
 */
export function OrgDbNotice({ quiet = false }: { quiet?: boolean }) {
  const { orgDirectory, reloadOrgDirectory } = useData();

  if (orgDirectory.status === 'loading') {
    return (
      <div className="mb-4 flex items-center gap-2 rounded-xl border border-border-soft bg-surface px-4 py-3 text-sm text-text-secondary" role="status">
        <Loader2 size={16} className="animate-spin" />Cargando desde la base de datos…
      </div>
    );
  }

  if (orgDirectory.status === 'error') {
    return (
      <div className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-danger-text/20 bg-danger-tint px-4 py-3" role="alert">
        <div className="flex items-start gap-2 text-sm text-danger-text">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{orgDirectory.error}</span>
        </div>
        <Button variant="secondary" size="sm" onClick={() => void reloadOrgDirectory()}>Reintentar</Button>
      </div>
    );
  }

  if (quiet) return null;

  return (
    <div className="mb-4 flex items-start gap-2 rounded-xl border border-info-text/15 bg-info-tint px-4 py-3 text-sm text-info-text">
      <Database size={16} className="mt-0.5 shrink-0" />
      <span>Estos datos están guardados en la base de datos. El resto del sistema sigue usando datos de ejemplo hasta que se pasen.</span>
    </div>
  );
}
