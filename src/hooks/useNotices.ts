import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NoticeView } from '../context/DataContext';
import { supabase } from '../lib/supabase';
import { emitNotice, loadNotices, markNoticesRead } from '../services/notices';
import { createSupabaseNoticesRepository } from '../services/noticesRepository';
import type { OpResult } from '../services/orgDirectory';
import { NOTICE_REFRESH_MS, withRead, type NoticeInput } from '../utils/noticesDb';

/**
 * Los avisos de la campana guardados en la base de datos: los que le corresponden a la cuenta (la base calcula quién recibe cada uno), con su marca
 * de leído. Se leen al abrir el sistema y se vuelven a leer cada minuto y al volver a la pestaña, porque ahora los avisos los generan otras personas.
 * Si la lectura falla se queda lo que había (la campana no debe impedir trabajar). Emitir y marcar leídos devuelven `{ ok, error }` (nunca lanzan).
 */
export function useNotices() {
  const repo = useMemo(() => createSupabaseNoticesRepository(supabase), []);
  const [notices, setNotices] = useState<NoticeView[]>([]);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    const res = await loadNotices(repo);
    if (alive.current && res.ok && res.value) setNotices(res.value);
  }, [repo]);

  useEffect(() => {
    alive.current = true;
    void refresh();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, NOTICE_REFRESH_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { alive.current = false; clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [refresh]);

  const emit = useCallback(async (eventId: string, notice: NoticeInput): Promise<OpResult<string>> => {
    const res = await emitNotice(repo, eventId, notice);
    if (res.ok) void refresh();
    return res;
  }, [repo, refresh]);

  const markRead = useCallback(async (ids: string[]): Promise<OpResult> => {
    setNotices(prev => withRead(prev, ids));
    const res = await markNoticesRead(repo, ids);
    void refresh();
    return res;
  }, [repo, refresh]);

  return { notices, refresh, emit, markRead };
}
