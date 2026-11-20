import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { loadPlaceDirectory } from '../services/placeDirectory';
import { createSupabasePlaceDirectoryRepository } from '../services/placeDirectoryRepository';
import type { StockLocation } from '../utils/logisticsRoutes';
import { PLACE_DIRECTORY_REFRESH_MS } from '../utils/placeDirectory';

/**
 * Las sedes con su nombre y estado, para elegir y nombrar el otro extremo de una transferencia (migración 0032): una cuenta de sede solo lee la suya, y no
 * podía mandar nada a otra sede ni saber de cuál venía lo que le llega. Se lee al abrir el sistema, cada 10 minutos y al volver a la pestaña. Si una
 * lectura falla se queda lo que había (nunca impide abrir el sistema).
 */
export function usePlaceDirectory() {
  const repo = useMemo(() => createSupabasePlaceDirectoryRepository(supabase), []);
  const [sedes, setSedes] = useState<StockLocation[]>([]);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    const res = await loadPlaceDirectory(repo);
    if (!alive.current) return;
    if (res.ok && res.value) setSedes(res.value);
  }, [repo]);

  useEffect(() => {
    alive.current = true;
    void refresh();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, PLACE_DIRECTORY_REFRESH_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { alive.current = false; clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [refresh]);

  return { sedes, refresh };
}
