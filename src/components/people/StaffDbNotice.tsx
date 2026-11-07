import React from 'react';
import { Database, Loader2, AlertTriangle } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { Button } from '../ui/Button';

/**
 * Estado del Personal y las Asignaciones guardados en la base de datos: cargando, con error de conexión (reintentar) o listo.
 * Depende también de las sedes y el almacén (el lugar de una asignación sale de ellos), así que avisa si cualquiera de los dos falla.
 */
export function StaffDbNotice() {
  const { orgDirectory, reloadOrgDirectory, staffDirectory, reloadStaffDirectory } = useData();
  const failed = orgDirectory.status === 'error' ? orgDirectory : staffDirectory.status === 'error' ? staffDirectory : null;
  const loading = orgDirectory.status === 'loading' || staffDirectory.status === 'loading';

  if (failed) {
    return (
      <div className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-danger-text/20 bg-danger-tint px-4 py-3" role="alert">
        <div className="flex items-start gap-2 text-sm text-danger-text">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{failed.error}</span>
        </div>
        <Button variant="secondary" size="sm" onClick={() => void (failed === orgDirectory ? reloadOrgDirectory() : reloadStaffDirectory())}>Reintentar</Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mb-4 flex items-center gap-2 rounded-xl border border-border-soft bg-surface px-4 py-3 text-sm text-text-secondary" role="status">
        <Loader2 size={16} className="animate-spin" />Cargando desde la base de datos…
      </div>
    );
  }

  return (
    <div className="mb-4 flex items-start gap-2 rounded-xl border border-info-text/15 bg-info-tint px-4 py-3 text-sm text-info-text">
      <Database size={16} className="mt-0.5 shrink-0" />
      <span>El personal y las asignaciones están guardados en la base de datos, igual que los contratos y la planilla. La agenda y el resto del sistema siguen usando datos de ejemplo hasta que se pasen.</span>
    </div>
  );
}
