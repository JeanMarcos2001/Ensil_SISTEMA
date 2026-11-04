import React, { useState } from 'react';
import { Database, RotateCcw } from 'lucide-react';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { useData } from '../../context/DataContext';
import { clearStoredAccess } from '../../utils/accessStore';

/**
 * Aviso de la persistencia provisional (paso 6): roles, permisos y cuentas se guardan en este navegador mientras no haya base de datos.
 * Dice si se recuperó lo guardado, qué se descartó, y permite volver a los datos de ejemplo.
 */
export function AccessStorageBar() {
  const { accessRestore, can } = useData();
  const [confirming, setConfirming] = useState(false);

  const reset = () => {
    clearStoredAccess();
    window.location.reload();
  };

  return (
    <div className="mb-4 rounded-xl border border-border-soft bg-surface-muted px-4 py-3 flex items-start justify-between gap-4">
      <div className="flex items-start gap-3 text-sm text-text-secondary">
        <Database size={16} className="mt-0.5 shrink-0 text-text-muted" />
        <div className="space-y-1">
          <p>
            Los roles, sus permisos y las cuentas se guardan <strong className="text-text-primary font-medium">en este navegador</strong> hasta que exista la base de datos:
            no los ven otras personas ni otros equipos.
            {accessRestore.restored && ' Se recuperó lo guardado la última vez.'}
          </p>
          {accessRestore.notes.map(note => <p key={note} className="text-warning">{note}</p>)}
        </div>
      </div>
      {can('org-roles:config_perms') && (
        <Button variant="ghost" className="flex items-center gap-2 shrink-0" onClick={() => setConfirming(true)}>
          <RotateCcw size={14} />
          Volver a los de ejemplo
        </Button>
      )}
      <ConfirmDialog
        isOpen={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={reset}
        variant="danger"
        title="Volver a los roles y cuentas de ejemplo"
        description="Se borran los roles, permisos y cuentas guardados en este navegador y la página se recarga. Como el resto de los datos (matrículas, pagos, stock…) vive en memoria, también volverán a los de ejemplo."
        confirmLabel="SÍ, VOLVER A LOS DE EJEMPLO"
      />
    </div>
  );
}
