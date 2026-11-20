import { useEffect, useRef, useState } from 'react';
import { supabase, supabaseConfigured } from '../lib/supabase';
import { createLiveRefresher } from '../services/liveRefresh';

/**
 * Mantiene al día los envíos de una pantalla (Envíos y Recepciones): escucha los cambios de la tabla `envios` con Supabase Realtime (la base solo avisa de lo que la
 * cuenta puede leer: la sede destino no recibe avisos de lo que se prepara) y vuelve a leer con `refresh`. Si la conexión en vivo no funciona o se cae, se
 * sigue leyendo cada 30 segundos. Solo está activo mientras la pantalla está abierta (una conexión por pestaña). Devuelve si la conexión en vivo está arriba.
 */
export function useLiveShipments(refresh: () => Promise<void>, enabled = true): { connected: boolean } {
  const [connected, setConnected] = useState(false);
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    if (!enabled || !supabaseConfigured) return;
    const controller = createLiveRefresher({
      subscribe: (onChange, onStatus) => {
        const channel = supabase
          .channel(`envios-${Math.random().toString(36).slice(2, 10)}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'envios' }, () => onChange())
          .subscribe(status => onStatus(status === 'SUBSCRIBED'));
        return () => { void supabase.removeChannel(channel); };
      },
      refresh: () => refreshRef.current(),
      isVisible: () => document.visibilityState === 'visible',
      onVisible: handler => { document.addEventListener('visibilitychange', handler); return () => document.removeEventListener('visibilitychange', handler); },
      onConnection: setConnected,
      now: () => Date.now(),
      timers: {
        setInterval: (h, ms) => setInterval(h, ms),
        clearInterval: id => clearInterval(id as ReturnType<typeof setInterval>),
        setTimeout: (h, ms) => setTimeout(h, ms),
        clearTimeout: id => clearTimeout(id as ReturnType<typeof setTimeout>),
      },
    });
    controller.start();
    return () => { controller.stop(); };
  }, [enabled]);

  return { connected };
}
