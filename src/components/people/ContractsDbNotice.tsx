import React from 'react';
import { Database, Loader2, AlertTriangle } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { Button } from '../ui/Button';

/**
 * Estado de los Contratos y la Planilla guardados en la base de datos: cargando, con error de conexión (reintentar) o listo.
 * Dependen también de las empresas y del personal (la empresa y el nombre salen de ellos), así que avisa si cualquiera de los tres falla.
 */
export function ContractsDbNotice() {
  const { orgDirectory, reloadOrgDirectory, staffDirectory, reloadStaffDirectory, contractsPayroll, reloadContractsPayroll } = useData();
  const failed = contractsPayroll.status === 'error' ? { error: contractsPayroll.error, retry: reloadContractsPayroll }
    : staffDirectory.status === 'error' ? { error: staffDirectory.error, retry: reloadStaffDirectory }
    : orgDirectory.status === 'error' ? { error: orgDirectory.error, retry: reloadOrgDirectory } : null;
  const loading = contractsPayroll.status === 'loading' || staffDirectory.status === 'loading' || orgDirectory.status === 'loading';

  if (failed) {
    return (
      <div className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-danger-text/20 bg-danger-tint px-4 py-3" role="alert">
        <div className="flex items-start gap-2 text-sm text-danger-text">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{failed.error}</span>
        </div>
        <Button variant="secondary" size="sm" onClick={() => void failed.retry()}>Reintentar</Button>
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
      <span>Los contratos (cada uno con su empresa) y las planillas (una por empresa y mes) están guardados en la base de datos. Los sueldos solo los ve quien tiene «Ver remuneraciones».</span>
    </div>
  );
}
