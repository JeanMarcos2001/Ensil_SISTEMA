/**
 * Actualización en vivo de una pantalla (el tablero de envíos y Recepciones): cuando la base avisa que un envío cambió, se vuelve a leer lo que la cuenta puede ver.
 * No guarda estado de React ni conoce a Supabase: recibe todo lo que toca (cómo escuchar los cambios, cómo releer, el reloj y los temporizadores), de modo que se
 * comprueba sin conexión (`scripts/check-shipment-live.ts`). El gancho `hooks/useLiveShipments.ts` lo conecta con Supabase Realtime.
 *
 * Reglas:
 *  - Al abrir la pantalla se lee de inmediato (lo que había al iniciar sesión pudo envejecer).
 *  - Un aviso de cambio no lee al instante: espera un momento (`LIVE_DEBOUNCE_MS`) para juntar una ráfaga de cambios en una sola lectura.
 *  - **Respaldo:** cada 30 segundos (`LIVE_POLL_MS`) se vuelve a leer aunque no llegue ningún aviso (un seguro por si la conexión en vivo se corta o no
 *    funciona), pero solo si la pestaña se ve, y se salta si hace poco que se leyó (`LIVE_RECENT_MS`).
 *  - Al volver a la pestaña y cada vez que la conexión en vivo se (re)establece se lee de inmediato: así no se pierde lo que pasó mientras no se miraba.
 *  - Nunca hay dos lecturas a la vez: si llega otro aviso mientras se lee, se lee una vez más al terminar.
 *  - Una lectura que falla no rompe nada: se sigue mostrando lo que había y se intenta de nuevo con el siguiente aviso o respaldo.
 */

/** Cada cuánto se vuelve a leer aunque no llegue ningún aviso. */
export const LIVE_POLL_MS = 30_000;
/** Cuánto se espera después de un aviso para juntar los que lleguen seguidos. */
export const LIVE_DEBOUNCE_MS = 400;
/** Si ya se leyó hace menos que esto, el respaldo espera a su siguiente vuelta. */
export const LIVE_RECENT_MS = 10_000;

export interface LiveTimers {
  setInterval: (handler: () => void, ms: number) => unknown;
  clearInterval: (id: unknown) => void;
  setTimeout: (handler: () => void, ms: number) => unknown;
  clearTimeout: (id: unknown) => void;
}

export interface LiveDeps {
  /** Escucha los cambios de la base: `onChange` por cada aviso y `onStatus(true|false)` cuando la conexión en vivo se establece o se cae. Devuelve cómo dejar de escuchar. */
  subscribe: (onChange: () => void, onStatus: (connected: boolean) => void) => () => void;
  /** Vuelve a leer lo que se muestra. */
  refresh: () => Promise<void>;
  /** ¿La pestaña se está viendo? */
  isVisible: () => boolean;
  /** Avisa cuando la pestaña vuelve a verse; devuelve cómo dejar de escuchar. */
  onVisible: (handler: () => void) => () => void;
  /** Se llama cuando cambia si la conexión en vivo está arriba (para mostrarlo). */
  onConnection?: (connected: boolean) => void;
  now: () => number;
  timers: LiveTimers;
}

export interface LiveController {
  start: () => void;
  stop: () => void;
  /** Cuántas lecturas se han hecho (para comprobar) y si hay una en curso. */
  stats: () => { reads: number; running: boolean; connected: boolean };
}

export function createLiveRefresher(deps: LiveDeps): LiveController {
  const { timers } = deps;
  let started = false;
  let running = false;
  let again = false;
  let reads = 0;
  let connected = false;
  let lastReadAt = -Infinity;
  let debounce: unknown = null;
  let poll: unknown = null;
  let unsubscribe: (() => void) | null = null;
  let unwatchVisible: (() => void) | null = null;

  const clearDebounce = () => { if (debounce !== null) { timers.clearTimeout(debounce); debounce = null; } };

  async function run(): Promise<void> {
    if (!started) return;
    if (running) { again = true; return; }
    running = true;
    try {
      await deps.refresh();
    } catch {
      // una lectura que falla no rompe nada: se sigue con lo que había
    } finally {
      lastReadAt = deps.now();
      reads++;
      running = false;
    }
    if (started && again) { again = false; schedule(); }
  }

  /** Lee dentro de un momento (junta los avisos que lleguen seguidos). */
  function schedule(): void {
    clearDebounce();
    debounce = timers.setTimeout(() => { debounce = null; void run(); }, LIVE_DEBOUNCE_MS);
  }

  function setConnected(next: boolean): void {
    if (next === connected) return;
    connected = next;
    deps.onConnection?.(next);
  }

  return {
    start() {
      if (started) return;
      started = true;
      unsubscribe = deps.subscribe(
        () => schedule(),
        isUp => { setConnected(isUp); if (isUp) void run(); },
      );
      poll = timers.setInterval(() => {
        if (!deps.isVisible()) return;
        if (deps.now() - lastReadAt < LIVE_RECENT_MS) return;
        void run();
      }, LIVE_POLL_MS);
      unwatchVisible = deps.onVisible(() => { if (deps.isVisible()) void run(); });
      void run();
    },
    stop() {
      if (!started) return;
      started = false;
      again = false;
      clearDebounce();
      if (poll !== null) { timers.clearInterval(poll); poll = null; }
      unsubscribe?.(); unsubscribe = null;
      unwatchVisible?.(); unwatchVisible = null;
      if (connected) { connected = false; deps.onConnection?.(false); }
    },
    stats: () => ({ reads, running, connected }),
  };
}
