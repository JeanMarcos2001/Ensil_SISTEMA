import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { loadCounterparts } from '../services/counterparts';
import { createSupabaseCounterpartsRepository } from '../services/counterpartsRepository';
import type { Holder } from '../utils/capabilities';
import { COUNTERPART_REFRESH_MS } from '../utils/counterpartsDb';

/**
 * Quién cubre las contrapartes (por ejemplo, quién recibe un envío en una sede), según la base de datos: el navegador de una cuenta común no puede leer
 * las demás cuentas y por eso no podía saberlo (migración 0028). Se lee al abrir el sistema y se vuelve a leer cada cinco minutos y al volver a la pestaña.
 * `ready` es verdadero cuando la base ya contestó al menos una vez; mientras no, quien decide si se ofrece una función no debe bloquearla por algo que
 * no pudo comprobar. Si una lectura falla se queda lo que había (nunca impide abrir el sistema).
 */
export function useCounterparts() {
  const repo = useMemo(() => createSupabaseCounterpartsRepository(supabase), []);
  const [holders, setHolders] = useState<Holder[]>([]);
  const [ready, setReady] = useState(false);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    const res = await loadCounterparts(repo);
    if (!alive.current) return;
    if (res.ok && res.value) { setHolders(res.value); setReady(true); }
  }, [repo]);

  useEffect(() => {
    alive.current = true;
    void refresh();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, COUNTERPART_REFRESH_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { alive.current = false; clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [refresh]);

  return { holders, ready, refresh };
}
