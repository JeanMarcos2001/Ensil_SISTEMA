/**
 * Verificación de la entrega 2 del tablero de envíos: la actualización en vivo y el número de versión de cada tarjeta.
 *  - el motor de actualización en vivo (`services/liveRefresh.ts`) con reloj, conexión y lectura simulados: lee al abrir, junta ráfagas de avisos, respalda cada 30 segundos
 *    (solo si la pestaña se ve y no se leyó hace poco), lee al volver a la pestaña y al (re)conectar, nunca lee dos veces a la vez, no se rompe si una lectura falla y se detiene del todo;
 *  - la versión de cada tarjeta: lo que se manda, lo que se lee y que una versión vieja no se guarda (ni siquiera llega a la base);
 *  - la migración 0030 (publicación de tiempo real, versión y el mismo texto de aviso que el sistema);
 *  - las pantallas: Envíos y Recepciones se mantienen al día y lo muestran; el editor de una tarjeta avisa si otra persona la cambió.
 * Ejecutar: npx tsx scripts/check-shipment-live.ts
 */
import { readFileSync } from 'node:fs';
import type { Shipment } from '../src/context/DataContext';
import {
  createLiveRefresher, LIVE_DEBOUNCE_MS, LIVE_POLL_MS, LIVE_RECENT_MS, type LiveDeps,
} from '../src/services/liveRefresh';
import { SHIPMENT_STALE_MESSAGE, shipmentPatchError, shipmentStaleError } from '../src/utils/logisticsDocs';
import { shipmentFromRow, shipmentPayload, type EnvioRow } from '../src/utils/stockDb';
import { editShipment, type LogisticsContext, type LogisticsRepository } from '../src/services/logistics';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : ` -> ${detail}`}`);
  if (!ok) failed++;
};
const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

// ------------------------------------------------------------------------------------------------------------------ El motor, con reloj y conexión simulados
const tick = () => new Promise<void>(resolve => setImmediate(resolve));

function harness(options: { visible?: boolean; refresh?: (n: number) => Promise<void> } = {}) {
  let now = 1_000_000;
  let nextId = 0;
  const timeouts = new Map<number, { at: number; fn: () => void }>();
  const intervals = new Map<number, { every: number; next: number; fn: () => void }>();
  let visible = options.visible ?? true;
  const state = {
    reads: [] as number[], listeners: 0, unsubscribed: 0, visibleHandlers: [] as (() => void)[], onChange: null as null | (() => void), onStatus: null as null | ((c: boolean) => void),
    connection: [] as boolean[],
  };
  const deps: LiveDeps = {
    subscribe: (onChange, onStatus) => { state.onChange = onChange; state.onStatus = onStatus; state.listeners++; return () => { state.unsubscribed++; state.onChange = null; state.onStatus = null; }; },
    refresh: async () => { state.reads.push(now); await options.refresh?.(state.reads.length); },
    isVisible: () => visible,
    onVisible: handler => { state.visibleHandlers.push(handler); return () => { state.visibleHandlers = state.visibleHandlers.filter(h => h !== handler); }; },
    onConnection: c => state.connection.push(c),
    now: () => now,
    timers: {
      setTimeout: (fn, ms) => { const id = ++nextId; timeouts.set(id, { at: now + ms, fn }); return id; },
      clearTimeout: id => { timeouts.delete(id as number); },
      setInterval: (fn, ms) => { const id = ++nextId; intervals.set(id, { every: ms, next: now + ms, fn }); return id; },
      clearInterval: id => { intervals.delete(id as number); },
    },
  };
  /** Avanza el reloj simulado y deja correr todo lo que vence en el camino, en orden. */
  async function advance(ms: number) {
    const target = now + ms;
    for (;;) {
      const due: { at: number; run: () => void }[] = [];
      for (const [id, t] of timeouts) if (t.at <= target) due.push({ at: t.at, run: () => { timeouts.delete(id); t.fn(); } });
      for (const [, i] of intervals) if (i.next <= target) due.push({ at: i.next, run: () => { i.next += i.every; i.fn(); } });
      if (due.length === 0) break;
      due.sort((a, b) => a.at - b.at);
      const first = due[0];
      now = Math.max(now, first.at);
      first.run();
      await tick();
    }
    now = target;
    await tick();
  }
  return {
    deps, state, advance, setVisible: (v: boolean) => { visible = v; },
    pendingTimers: () => timeouts.size + intervals.size, now: () => now,
  };
}

async function engine() {
  // Lee al abrir
  let h = harness();
  let c = createLiveRefresher(h.deps);
  c.start(); await tick();
  check('Al abrir la pantalla se lee de inmediato y se escucha a la base', h.state.reads.length === 1 && h.state.listeners === 1);
  c.stop();

  // Ráfaga de avisos = una lectura
  h = harness(); c = createLiveRefresher(h.deps); c.start(); await tick();
  const before = h.state.reads.length;
  for (let i = 0; i < 5; i++) { h.state.onChange!(); await h.advance(50); }
  check('Varios avisos seguidos se juntan en UNA sola lectura, y no antes de esperar un momento', h.state.reads.length === before, String(h.state.reads.length));
  await h.advance(LIVE_DEBOUNCE_MS);
  check('…que ocurre cuando pasó el momento de espera', h.state.reads.length === before + 1, String(h.state.reads.length));
  await h.advance(LIVE_DEBOUNCE_MS * 3);
  check('y no se repite sola', h.state.reads.length === before + 1);
  c.stop();

  // Respaldo cada 30 s
  h = harness(); c = createLiveRefresher(h.deps); c.start(); await tick();
  await h.advance(LIVE_POLL_MS + 10);
  check('El respaldo vuelve a leer a los 30 segundos aunque no llegue ningún aviso', h.state.reads.length === 2, String(h.state.reads.length));
  await h.advance(LIVE_POLL_MS);
  check('…y cada 30 segundos', h.state.reads.length === 3, String(h.state.reads.length));
  c.stop();

  // El respaldo espera si hace poco que se leyó
  h = harness(); c = createLiveRefresher(h.deps); c.start(); await tick();
  await h.advance(LIVE_POLL_MS - 5_000);
  h.state.onChange!(); await h.advance(LIVE_DEBOUNCE_MS + 50); // lectura por aviso a los ~25 s
  const afterEvent = h.state.reads.length;
  await h.advance(5_000); // llega el respaldo de los 30 s: se leyó hace menos de LIVE_RECENT_MS
  check(`Si hace menos de ${LIVE_RECENT_MS / 1000} segundos que se leyó, el respaldo de ese momento se salta`, h.state.reads.length === afterEvent, `${afterEvent} → ${h.state.reads.length}`);
  c.stop();

  // Pestaña oculta
  h = harness({ visible: false }); c = createLiveRefresher(h.deps); c.start(); await tick();
  const hiddenStart = h.state.reads.length;
  await h.advance(LIVE_POLL_MS * 3);
  check('Con la pestaña oculta el respaldo no lee', h.state.reads.length === hiddenStart, String(h.state.reads.length));
  h.setVisible(true);
  h.state.visibleHandlers.forEach(fn => fn()); await tick();
  check('Al volver a la pestaña se lee de inmediato', h.state.reads.length === hiddenStart + 1, String(h.state.reads.length));
  h.setVisible(false);
  h.state.visibleHandlers.forEach(fn => fn()); await tick();
  check('Un aviso de que la pestaña se ocultó no lee', h.state.reads.length === hiddenStart + 1);
  c.stop();

  // Conexión en vivo
  h = harness(); c = createLiveRefresher(h.deps); c.start(); await tick();
  const connBefore = h.state.reads.length;
  h.state.onStatus!(true); await tick();
  check('Cuando la conexión en vivo se establece se lee de inmediato (así no se pierde lo que pasó antes) y se avisa a la pantalla', h.state.reads.length === connBefore + 1 && c.stats().connected && JSON.stringify(h.state.connection) === '[true]');
  h.state.onStatus!(true); await tick();
  check('Repetir «conectado» no cambia lo que se avisa', JSON.stringify(h.state.connection) === '[true]');
  h.state.onStatus!(false); await tick();
  check('Si la conexión se cae se avisa y se sigue con el respaldo', !c.stats().connected && JSON.stringify(h.state.connection) === '[true,false]');
  const afterDrop = h.state.reads.length;
  await h.advance(LIVE_POLL_MS + 10);
  check('…y el respaldo sigue leyendo cada 30 segundos aunque la conexión en vivo esté caída', h.state.reads.length === afterDrop + 1, `${afterDrop} → ${h.state.reads.length}`);
  h.state.onStatus!(true); await tick();
  check('Al reconectar, se lee otra vez', h.state.reads.length === afterDrop + 2);
  c.stop();
  check('Al detenerse se avisa que ya no está en vivo', h.state.connection[h.state.connection.length - 1] === false);

  // Nunca dos lecturas a la vez
  let release: () => void = () => {};
  let concurrent = 0; let maxConcurrent = 0;
  h = harness({ refresh: n => (n === 2 ? new Promise<void>(res => { release = res; }) : Promise.resolve()) });
  const slowDeps: LiveDeps = { ...h.deps, refresh: async () => { concurrent++; maxConcurrent = Math.max(maxConcurrent, concurrent); try { await h.deps.refresh(); } finally { concurrent--; } } };
  c = createLiveRefresher(slowDeps); c.start(); await tick();
  h.state.onChange!(); await h.advance(LIVE_DEBOUNCE_MS + 10); // empieza la lectura lenta (la 2)
  check('Hay una lectura en curso', c.stats().running);
  h.state.onChange!(); await h.advance(LIVE_DEBOUNCE_MS + 10); // llega otro aviso mientras se lee
  check('Un aviso que llega mientras se lee no abre una segunda lectura a la vez', maxConcurrent === 1 && h.state.reads.length === 2, `max ${maxConcurrent}, lecturas ${h.state.reads.length}`);
  release(); await tick(); await h.advance(LIVE_DEBOUNCE_MS + 10);
  check('…pero se lee UNA vez más al terminar, para no perder ese cambio', h.state.reads.length === 3 && maxConcurrent === 1, `lecturas ${h.state.reads.length}`);
  c.stop();

  // Una lectura que falla no rompe nada
  h = harness({ refresh: n => (n === 1 ? Promise.reject(new Error('sin red')) : Promise.resolve()) });
  c = createLiveRefresher(h.deps);
  let unhandled = false;
  const onRejection = () => { unhandled = true; };
  process.on('unhandledRejection', onRejection);
  c.start(); await tick(); await tick();
  h.state.onChange!(); await h.advance(LIVE_DEBOUNCE_MS + 10);
  process.off('unhandledRejection', onRejection);
  check('Una lectura que falla no rompe nada ni queda sin atrapar: con el siguiente aviso se vuelve a leer', !unhandled && h.state.reads.length === 2 && !c.stats().running, `lecturas ${h.state.reads.length}`);
  c.stop();

  // Detenerse del todo
  h = harness(); c = createLiveRefresher(h.deps); c.start(); c.start(); await tick();
  check('Arrancar dos veces no duplica nada', h.state.listeners === 1 && h.state.visibleHandlers.length === 1 && h.state.reads.length === 1);
  const staleChange = h.state.onChange!;
  c.stop(); c.stop();
  const reads = h.state.reads.length;
  staleChange();
  h.state.visibleHandlers.forEach(fn => fn());
  await h.advance(LIVE_POLL_MS * 4);
  check('Al detenerse deja de escuchar, quita el aviso de pestaña, apaga los temporizadores y ya no lee (ni con un aviso rezagado)', h.state.unsubscribed === 1 && h.state.visibleHandlers.length === 0 && h.pendingTimers() === 0 && h.state.reads.length === reads, `${h.state.unsubscribed} ${h.state.visibleHandlers.length} ${h.pendingTimers()} ${h.state.reads.length}/${reads}`);
  let finish: () => void = () => {};
  h = harness({ refresh: n => (n === 1 ? new Promise<void>(res => { finish = res; }) : Promise.resolve()) });
  c = createLiveRefresher(h.deps); c.start(); await tick();
  h.state.onChange!();
  c.stop(); finish(); await tick(); await h.advance(LIVE_POLL_MS * 2);
  check('Una lectura que termina después de detenerse no programa otra', h.state.reads.length === 1 && h.pendingTimers() === 0);

  check('Los tiempos son los acordados: respaldo cada 30 segundos, espera de 400 ms para juntar avisos', LIVE_POLL_MS === 30_000 && LIVE_DEBOUNCE_MS === 400 && LIVE_RECENT_MS < LIVE_POLL_MS);
}

// ------------------------------------------------------------------------------------------------------------------ La versión de cada tarjeta
function versionRules() {
  check('Si cambió en el medio se avisa; si no, o si no se conoce la versión (una pantalla o una base anteriores), no se compara',
    shipmentStaleError(3, 2) === SHIPMENT_STALE_MESSAGE && shipmentStaleError(2, 3) === SHIPMENT_STALE_MESSAGE && shipmentStaleError(3, 3) === null
    && shipmentStaleError(undefined, 3) === null && shipmentStaleError(3, undefined) === null && shipmentStaleError(undefined, undefined) === null);
  check('El aviso lo explica con claridad', /Otra persona cambió esta tarjeta mientras usted la tenía abierta/.test(SHIPMENT_STALE_MESSAGE) && /Revise y vuelva a intentar/.test(SHIPMENT_STALE_MESSAGE));
  check('La versión no es un dato del envío: viaja en cualquier columna sin que cuente como «dato de otra columna»',
    shipmentPatchError('Por armar', { items: [], version: 3 }) === null && shipmentPatchError('Empacando', { boxes: [], version: 3 }) === null && shipmentPatchError('Por despachar', { eta: '2026-11-20', version: 3 }) === null
    && shipmentPatchError('En tránsito', { manualEnable: true, version: 3 }) === null && shipmentPatchError('Listo para recepción', { manualEnable: true, version: 3 }) === null
    && shipmentPatchError('Por armar', { version: 3 }) === null && !!shipmentPatchError('En tránsito', { items: [], version: 3 }) && !!shipmentPatchError('Por armar', { boxes: [], version: 3 }));

  const row: EnvioRow = {
    id: 'ENV-2026-001', fecha: '2026-11-18', almacen_origen_id: 'ALM-001', sede_destino_id: 'FIL-003', estado: 'Por armar', cajas: [], lineas: [{ articulo_id: 'A', cantidad: 10 }],
    metodo_envio_id: null, courier_id: null, numero_guia: null, referencia_adicional: null, viajero_nombre: null, viajero_documento: null, observacion_envio: null, eta: null, eta_hora: null,
    borrador_vence: null, observacion: null, adjuntos: [], recepcion_observacion: null, recepcion_fecha: null, recibido_por: null, habilitar_recepcion_manual: false,
  };
  check('Un envío de la base trae su versión; una base anterior a la 0030 (sin la columna) se sigue leyendo', shipmentFromRow({ ...row, version: 7 }).version === 7 && shipmentFromRow(row).version === undefined);
  check('La versión viaja a la base solo si se conoce, junto con lo que se cambia',
    JSON.stringify(shipmentPayload({ status: 'Empacando', version: 4 })) === JSON.stringify({ estado: 'Empacando', version: 4 }) && !('version' in shipmentPayload({ status: 'Empacando' }))
    && !('version' in shipmentPayload({ status: 'Empacando', version: undefined })));
}

async function versionService() {
  const base: Shipment = {
    id: 'ENV-2026-001', date: '2026-11-18', originId: 'ALM-001', destinationId: 'FIL-003', status: 'Por armar', boxes: [], items: [{ itemId: 'A', quantity: 10 }], version: 5,
  };
  let calls = 0;
  const repo = { editShipment: async () => { calls++; return { ok: true, data: null }; } } as unknown as LogisticsRepository;
  const ctx = (shipments: Shipment[]): LogisticsContext => ({
    items: [{ id: 'A', name: 'Ábaco', isPackage: false, composition: undefined }], stock: [], shipments, transfers: [], couriers: [], methods: [],
    locations: [{ id: 'ALM-001', name: 'Almacén central', status: 'Activo', kind: 'almacén' }, { id: 'FIL-003', name: 'Chiclayo', status: 'Activo', kind: 'sede' }],
  });
  const edit = (patch: Partial<Shipment>, shipments: Shipment[] = [base]) => editShipment(repo, ctx(shipments), base.id, { ...base, ...patch }, shipmentPayload(patch), patch);
  let r = await edit({ observation: 'x', version: 4 });
  check('Con una versión vieja la edición NO llega a la base y dice por qué', !r.ok && r.error === SHIPMENT_STALE_MESSAGE && calls === 0, `${r.error} / ${calls}`);
  r = await edit({ observation: 'x', version: 5 });
  check('Con la versión al día llega a la base', r.ok && calls === 1);
  calls = 0;
  r = await edit({ observation: 'x' });
  check('Sin versión (no se conoce) tampoco se bloquea: la base decide', r.ok && calls === 1);
  calls = 0;
  r = await edit({ status: 'Empacando', version: 4 });
  check('Mover una tarjeta con una versión vieja también se rechaza antes de llamar a la base', !r.ok && r.error === SHIPMENT_STALE_MESSAGE && calls === 0);
}

// ------------------------------------------------------------------------------------------------------------------ La migración 0030
function migration() {
  const mig = read('supabase/migrations/20261120100000_tiempo_real_de_envios.sql');
  const down = read('supabase/deshacer/20261120100000_tiempo_real_de_envios.down.sql');
  const m29 = read('supabase/migrations/20261119100000_tablero_de_envios.sql');
  check('La tabla de envíos entra a la publicación de tiempo real solo si la publicación existe y si todavía no estaba',
    /pg_publication where pubname = 'supabase_realtime'/.test(mig) && /not exists \(select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'envios'\)/.test(mig)
    && /alter publication supabase_realtime add table public\.envios;/.test(mig) && !/add table public\.(transferencias|stock|kardex|cuentas)/.test(mig));
  check('Cada envío lleva una versión que sube en 1 con cada cambio (un disparador antes de actualizar)',
    /add column version integer not null default 1/.test(mig) && /new\.version := old\.version \+ 1/.test(mig) && /create trigger envios_version before update on public\.envios for each row execute function app\.envio_subir_version\(\)/.test(mig));
  check('`editar_envio` compara la versión que vio quien edita y avisa con el mismo texto que el sistema; la versión no cuenta como dato del envío',
    mig.includes(SHIPMENT_STALE_MESSAGE) && /\(p->>'version'\)::integer is distinct from e\.version/.test(mig) && /v_clave <> 'version' and not \(v_clave = any \(v_validas\)\)/.test(mig)
    && /'habilitar_recepcion_manual', 'estado', 'version'/.test(mig));
  check('Despachar y cancelar no piden la versión (son de un solo paso y ya se comprueban contra el estado)', !/create or replace function public\.cambiar_estado_envio/.test(mig));
  check('Lo demás de `editar_envio` es lo de la migración 0029 (solo se agregó lo de la versión)',
    (() => {
      const body = (s: string) => s.slice(s.indexOf('create or replace function public.editar_envio'), s.indexOf('\n$$;', s.indexOf('create or replace function public.editar_envio')));
      const strip = (s: string) => s.replace(/  -- Quien edita manda la versión[\s\S]*?  end if;\n/, '').replace("v_clave <> 'version' and not", 'not').replace(", 'estado', 'version'", ", 'estado'");
      return strip(body(mig)) === body(m29);
    })());
  check('Se puede deshacer: sale de la publicación, quita la versión y devuelve `editar_envio` de la 0029',
    /alter publication supabase_realtime drop table public\.envios/.test(down) && /drop trigger envios_version/.test(down) && /drop column version/.test(down) && !down.includes(SHIPMENT_STALE_MESSAGE));
}

// ------------------------------------------------------------------------------------------------------------------ Las pantallas
function screens() {
  const shipments = read('src/pages/logistics/Shipments.tsx');
  const receptions = read('src/pages/logistics/Receptions.tsx');
  const hook = read('src/hooks/useLiveShipments.ts');
  const work = read('src/components/logistics/ShipmentWorkModal.tsx');
  const logistics = read('src/hooks/useLogistics.ts');
  const ctx = read('src/context/DataContext.tsx');
  const registry = read('src/utils/capabilityRegistry.ts');
  check('Envíos y Recepciones se mantienen al día solos y lo muestran (En vivo / cada 30 segundos)',
    /useLiveShipments\(reloadLogisticsDocuments\)/.test(shipments) && /<LiveIndicator connected=\{connected\} \/>/.test(shipments)
    && /useLiveShipments\(reloadLogisticsDocuments\)/.test(receptions) && /<LiveIndicator connected=\{connected\} \/>/.test(receptions)
    && /En vivo/.test(read('src/components/logistics/LiveIndicator.tsx')) && /Se actualiza cada 30 segundos/.test(read('src/components/logistics/LiveIndicator.tsx')));
  check('El gancho escucha los cambios de la tabla de envíos, avisa si la conexión está arriba, se desconecta al salir y respalda con el motor (30 s)',
    /\.on\('postgres_changes', \{ event: '\*', schema: 'public', table: 'envios' \}/.test(hook) && /status === 'SUBSCRIBED'/.test(hook) && /removeChannel\(channel\)/.test(hook)
    && /createLiveRefresher\(/.test(hook) && /supabaseConfigured/.test(hook) && /controller\.stop\(\)/.test(hook));
  check('Solo se escucha una tabla (envíos); Recepciones recibe lo demás con el respaldo de 30 segundos', (hook.match(/table: '/g) ?? []).length === 1);
  check('La relectura es una consulta del contexto (no una acción con permiso) y no vuelve a dibujar el tablero si no cambió nada',
    /reloadLogisticsDocuments: \(\) => Promise<void>;/.test(ctx) && /reloadLogisticsDocuments: log\.refreshDocuments/.test(ctx) && /reloadLogisticsDocuments: 'Consulta/.test(registry)
    && /JSON\.stringify\(a\) === JSON\.stringify\(b\)/.test(logistics) && /if \(!same\(shipmentsRef\.current, res\.data\.shipments\)\) setShipments/.test(logistics));
  check('El editor de una tarjeta recuerda la versión que vio al abrirlo, la manda en cada guardado y avisa si otra persona la cambió (con «Actualizar»)',
    /const seen = useRef</.test(work) && /seen\.current = \{ key: editorKey, version: shipment\.version \}/.test(work) && /shipment\.version > seenVersion/.test(work) && /withVersion\(\{ boxes, /.test(work)
    && /withVersion\(\{ destinationId: draft\.destinationId/.test(work) && /withVersion\(asShipment\(draft\)\)/.test(work) && /withVersion\(\{ status \}\)/.test(work)
    && /Otra persona cambió esta tarjeta mientras la tenía abierta/.test(work) && /setReloads\(n => n \+ 1\)/.test(work) && /key=\{editorKey\}/.test(work));
  check('Si la base dice que la tarjeta cambió, se vuelve a leer para mostrarlo', /res\.error === SHIPMENT_STALE_MESSAGE\) void d\.reloadLogisticsDocuments\(\)/.test(work));
  check('Arrastrar una tarjeta manda la versión que se ve (si cambió en el medio, no se mueve y se explica)', /\.\.\.\(s\.version !== undefined \? \{ version: s\.version \} : \{\}\)/.test(shipments));
}

await engine();
versionRules();
await versionService();
migration();
screens();

if (failed > 0) {
  console.log(`\n${failed} comprobaciones fallaron.`);
  process.exit(1);
}
console.log('\nTodas las comprobaciones pasaron.');
