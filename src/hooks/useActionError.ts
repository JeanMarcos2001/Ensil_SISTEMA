import { useCallback, useState } from 'react';

export interface ActionOutcome { ok: boolean; error?: string }

/**
 * Para las acciones de una tabla (activar, desactivar, duplicar, eliminar): como el catálogo vive en la base, cada acción puede
 * rechazarse (un nombre repetido, algo que todavía se usa, sin conexión). `run` espera el resultado y, si falló, deja el motivo en `error`
 * para mostrarlo en la pantalla; si salió bien, lo borra.
 */
export function useActionError() {
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async (operation: ActionOutcome | Promise<ActionOutcome>): Promise<ActionOutcome> => {
    setError(null);
    const result = await operation;
    if (!result.ok) setError(result.error ?? 'No se pudo completar la operación.');
    return result;
  }, []);
  const clear = useCallback(() => setError(null), []);
  return { error, run, clear };
}
