/**
 * Verificación de los avisos de la campana en la base de datos (Lote 11A).
 *  - filas de la base → lo que muestra el sistema (`utils/noticesDb.ts`) y lo que se manda al emitir (`emitArgs`);
 *  - operaciones (`services/notices.ts`) contra un repositorio en memoria: validar → guardar → traducir el error;
 *  - los eventos de los avisos: el script de la base (`supabase/seed/avisos_eventos.sql`) es el que genera el registro de funciones, todo evento de acción tiene
 *    quién lo emita y el sistema emite solo eventos que existen;
 *  - el aviso a Logística («Sin stock para verificar»): el texto, la clave de una vez por matrícula y por día, y su cableado;
 *  - la migración 0026 (tablas, funciones, lo que pide el registro, permisos y «deshacer») y el cableado (gancho, contexto, campana y pantalla).
 * La base se prueba aparte contra una copia (cuentas de varias sedes y el reparto de avisos comparado con `resolveRecipients` en 8 625 combinaciones).
 * Ejecutar: npx tsx scripts/check-notices-db.ts
 */
import { readFileSync } from 'node:fs';
import { emitNotice, loadNotices, markNoticesRead, type NoticesRepository } from '../src/services/notices';
import { ALL_CAPABILITIES, capabilityById } from '../src/utils/capabilities';
import { EVENTS } from '../src/utils/capabilityRegistry';
import { THROWS_ON_DENIAL } from '../src/utils/guards';
import {
  NOTICE_MESSAGE_MAX, NOTICE_TITLE_MAX, emitArgs, fitText, noticeEventRows, noticeFromRow, noticesErrorMessage, renderNoticeEventsSeedSql, sortNotices, withRead, type NoticeRow,
} from '../src/utils/noticesDb';
import { missingStockLines, missingStockNotice } from '../src/utils/verification';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : ` -> ${detail}`}`);
  if (!ok) failed++;
};
const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

// ------------------------------------------------------------------------------------------------------------------ Filas → lo que muestra el sistema
const rows: NoticeRow[] = [
  { id: 'AVI-000001', evento: 'shipment_dispatched', titulo: 'Envío en tránsito', mensaje: 'El envío ENV-2026-001 salió.', tipo: 'info', destino_id: 'FIL-003', origen_id: 'ALM-001', asunto_id: null,
    solicitante_id: null, solicitante_nombre: null, referencia: 'ENV-2026-001', creado_en: '2026-11-18T15:00:00Z', creado_por_nombre: 'Levi Gonzales', leido: false, via_respaldo: false },
  { id: 'AVI-000003', evento: 'transfer_decided', titulo: 'Transferencia aprobada', mensaje: 'Aprobada.', tipo: 'success', destino_id: 'FIL-003', origen_id: 'ALM-001', asunto_id: null,
    solicitante_id: '00000000-0000-0000-0000-000000000011', solicitante_nombre: 'Carla Campos', referencia: null, creado_en: '2026-11-18T17:00:00Z', creado_por_nombre: null, leido: true, via_respaldo: true },
  { id: 'AVI-000002', evento: null, titulo: 'Aviso general', mensaje: 'Para todos.', tipo: 'warning', destino_id: null, origen_id: null, asunto_id: null,
    solicitante_id: null, solicitante_nombre: null, referencia: null, creado_en: '2026-11-18T17:00:00Z', creado_por_nombre: 'Sistema', leido: false, via_respaldo: false },
];
const views = rows.map(noticeFromRow);
check('Una fila de la base se muestra como aviso del sistema: título, mensaje, tipo, fecha, evento, referencia y quién lo emitió',
  views[0]!.id === 'AVI-000001' && views[0]!.title === 'Envío en tránsito' && views[0]!.message === 'El envío ENV-2026-001 salió.' && views[0]!.type === 'info' && views[0]!.date === '2026-11-18T15:00:00Z'
  && views[0]!.eventId === 'shipment_dispatched' && views[0]!.reference === 'ENV-2026-001' && views[0]!.emittedBy === 'Levi Gonzales', JSON.stringify(views[0]));
check('El lugar del aviso (destino, origen y asunto) y quien lo pidió se guardan como el «alcance» que usa el sistema; lo vacío no se inventa',
  views[0]!.scope?.destinationBranchId === 'FIL-003' && views[0]!.scope?.originBranchId === 'ALM-001' && views[0]!.scope?.subjectBranchId === undefined
  && views[1]!.scope?.requesterId === '00000000-0000-0000-0000-000000000011' && views[1]!.scope?.requesterName === 'Carla Campos' && !('reference' in views[1]!) && !('emittedBy' in views[1]!), JSON.stringify(views[1]));
check('La marca de leído y si le llega por respaldo vienen de la base (por cuenta), y un aviso sin evento (general) no trae evento',
  views[0]!.read === false && views[0]!.viaFallback === false && views[1]!.read === true && views[1]!.viaFallback === true && !('eventId' in views[2]!));
check('Los avisos se muestran del más reciente al más antiguo (y por código si coinciden en la hora)', sortNotices(views).map(v => v.id).join() === 'AVI-000003,AVI-000002,AVI-000001', sortNotices(views).map(v => v.id).join());
check('Marcar como leído cambia solo los avisos indicados', withRead(views, ['AVI-000001']).map(v => v.read).join() === 'true,true,false' && withRead(views, []).map(v => v.read).join() === 'false,true,false');

// ------------------------------------------------------------------------------------------------------------------ Lo que se manda al emitir
const args = emitArgs('transfer_decided', {
  title: '  Transferencia   aprobada  ', message: 'Aprobada por la gerencia', type: 'success', reference: ' TRF-2026-001 ', key: 'TRF-2026-001:2026-11-18',
  scope: { originBranchId: 'ALM-001', destinationBranchId: 'FIL-003', subjectBranchId: 'FIL-003', requesterId: '00000000-0000-0000-0000-000000000011', requesterName: 'Carla Campos' },
});
check('Al emitir se manda el evento, el texto recortado, el tipo, el alcance con los nombres de la base, la referencia y la clave',
  args.p_evento === 'transfer_decided' && args.p_titulo === 'Transferencia aprobada' && args.p_mensaje === 'Aprobada por la gerencia' && args.p_tipo === 'success'
  && JSON.stringify(args.p_alcance) === JSON.stringify({ destino: 'FIL-003', origen: 'ALM-001', asunto: 'FIL-003', solicitante: '00000000-0000-0000-0000-000000000011', solicitante_nombre: 'Carla Campos' })
  && args.p_referencia === 'TRF-2026-001' && args.p_clave === 'TRF-2026-001:2026-11-18', JSON.stringify(args));
const bare = emitArgs('role_permissions_changed', { title: 'Permisos', message: 'Cambiaron', type: 'warning' });
check('Sin alcance, referencia ni clave se mandan vacíos (nulos), no inventados', JSON.stringify(bare.p_alcance) === '{}' && bare.p_referencia === null && bare.p_clave === null);
const long = fitText('Motivo muy largo. '.repeat(100), NOTICE_MESSAGE_MAX);
check('Un texto muy largo (un motivo extenso) se recorta con puntos suspensivos para que la base no lo rechace', long.length <= NOTICE_MESSAGE_MAX && long.length >= NOTICE_MESSAGE_MAX - 2 && long.endsWith('…') && fitText('corto', NOTICE_TITLE_MAX) === 'corto'
  && (emitArgs('shipment_received', { title: 'T'.repeat(300), message: 'm'.repeat(2000), type: 'info' }).p_titulo as string).length === NOTICE_TITLE_MAX, String(long.length));

check('Los errores de la base se traducen: aviso repetido, escritura simultánea y lo que dice la propia función (en español)',
  noticesErrorMessage({ code: '23505', message: 'duplicate key value violates unique constraint "avisos_clave_uq"' }) === 'Este aviso ya se envió.'
  && /Otra persona guardó algo al mismo tiempo/.test(noticesErrorMessage({ code: '23505', message: 'otra' })) && /Otra persona estaba guardando/.test(noticesErrorMessage({ code: '40P01' }))
  && noticesErrorMessage({ code: 'EN001', message: 'Su rol no puede emitir ese aviso.' }) === 'Su rol no puede emitir ese aviso.' && /No se pudo enviar el aviso/.test(noticesErrorMessage(null)));

// ------------------------------------------------------------------------------------------------------------------ Operaciones (repositorio en memoria)
type Call = { kind: 'list' | 'emit' | 'read'; arg?: unknown };
const calls: Call[] = [];
const memory = (over: Partial<NoticesRepository> = {}): NoticesRepository => ({
  async list(days) { calls.push({ kind: 'list', arg: days }); return { ok: true, data: rows }; },
  async emit(eventId, n) { calls.push({ kind: 'emit', arg: { eventId, n } }); return { ok: true, data: 'AVI-000010' }; },
  async markRead(ids) { calls.push({ kind: 'read', arg: ids }); return { ok: true, data: ids.length }; },
  ...over,
});
{
  const res = await loadNotices(memory());
  check('Cargar lee los avisos de los últimos 60 días y los entrega traducidos y ordenados', res.ok && res.value!.map(v => v.id).join() === 'AVI-000003,AVI-000002,AVI-000001' && calls[0]!.arg === 60, JSON.stringify(res));
  const bad = await loadNotices(memory({ async list() { return { ok: false, error: 'Sin conexión' }; } }));
  check('Si la lectura falla devuelve el motivo (la campana se queda con lo que tenía)', !bad.ok && bad.error === 'Sin conexión');

  calls.length = 0;
  const ok1 = await emitNotice(memory(), 'verification_without_stock', { title: 'Sin stock', message: 'Falta todo', type: 'warning', scope: { subjectBranchId: 'FIL-003' }, reference: 'MAT-2026-001', key: 'MAT-2026-001:2026-11-18' });
  check('Emitir guarda y devuelve el código que asignó la base', ok1.ok && ok1.value === 'AVI-000010' && calls.length === 1 && calls[0]!.kind === 'emit');
  calls.length = 0;
  const unknown = await emitNotice(memory(), 'no_existe', { title: 'Hola', message: 'Hola', type: 'info' });
  const byRule = await emitNotice(memory(), 'stock_below_minimum', { title: 'Hola', message: 'Hola', type: 'info' });
  const empty = await emitNotice(memory(), 'shipment_received', { title: '   ', message: 'Algo', type: 'info' });
  check('No se llama a la base con un evento que no existe, con uno que genera una regla (no una acción) o sin título; el motivo es claro',
    !unknown.ok && /no existe/.test(unknown.error ?? '') && !byRule.ok && /regla del sistema/.test(byRule.error ?? '') && !empty.ok && /título y un mensaje/.test(empty.error ?? '') && calls.length === 0, JSON.stringify([unknown, byRule, empty, calls]));
  const dup = await emitNotice(memory({ async emit() { return { ok: false, error: 'Este aviso ya se envió.' }; } }), 'verification_without_stock', { title: 'Sin stock', message: 'Falta', type: 'warning' });
  check('Si la base rechaza el aviso (por ejemplo, repetido) el motivo llega tal cual a quien pulsó el botón', !dup.ok && dup.error === 'Este aviso ya se envió.');

  calls.length = 0;
  const none = await markNoticesRead(memory(), []);
  const many = await markNoticesRead(memory(), ['AVI-000001', 'AVI-000001', 'AVI-000002']);
  check('Marcar leídos no llama a la base sin avisos, no repite ids y manda como mucho 500 a la vez', none.ok && calls.length === 1 && JSON.stringify(calls[0]!.arg) === JSON.stringify(['AVI-000001', 'AVI-000002']) && many.ok);
  calls.length = 0;
  await markNoticesRead(memory(), Array.from({ length: 700 }, (_, i) => `AVI-${i}`));
  check('Con 700 avisos manda solo 500 (la base rechaza más)', (calls[0]!.arg as string[]).length === 500);
}

// ------------------------------------------------------------------------------------------------------------------ Los eventos (lo que usa la base) salen del registro
const seedOnDisk = read('supabase/seed/avisos_eventos.sql');
check('El script de eventos de la base es el que genera el registro de funciones (si falla: npx tsx scripts/doc-avisos-seed.ts)', seedOnDisk === renderNoticeEventsSeedSql());
const eventRows = noticeEventRows();
check('La base recibe todos los eventos del registro, sin repetir', eventRows.length === EVENTS.length && new Set(eventRows.map(e => e.id)).size === EVENTS.length && /Carga 24 eventos|Carga \d+ eventos/.test(seedOnDisk));
const unknownEmitters = eventRows.flatMap(e => e.emiten).filter(id => !capabilityById(id));
check('Todo evento que se dispara desde una acción tiene al menos una función que lo emite (la base exige tener alguna) y las funciones existen',
  eventRows.filter(e => e.disparo === 'accion').every(e => e.emiten.length > 0) && unknownEmitters.length === 0, eventRows.filter(e => e.disparo === 'accion' && e.emiten.length === 0).map(e => e.id).join() || unknownEmitters.join());
check('Los eventos que genera una regla del sistema (alertas) no tienen quien los emita: no se guardan', eventRows.filter(e => e.disparo === 'sistema').every(e => e.emiten.length === 0));
const placeRules = new Set(['destination-branch', 'origin-branch', 'subject-branch', 'any']);
check('Las reglas de destinatario son solo las que sabe repartir la base: función + sede (destino, origen, asunto o cualquiera) o quien lo pidió',
  eventRows.every(e => e.destinatarios.length > 0 && e.destinatarios.every(r => ('capability' in r ? !!capabilityById(r.capability) && placeRules.has(r.where) : r.person === 'requester')) && !!capabilityById(e.respaldo)),
  eventRows.filter(e => e.destinatarios.some(r => 'person' in r && r.person !== 'requester')).map(e => e.id).join());

// ------------------------------------------------------------------------------------------------------------------ El aviso a Logística
const items = [{ id: 'ITM-KIT-001', name: 'Kit Lector 1' }, { id: 'ITM-LIB-001', name: 'Libro Nivel 1' }, { id: 'ITM-MAT-001', name: 'Cuaderno' }] as never[];
const recipe = { id: 'REC-001', name: 'Receta Nivel 1', items: [{ itemId: 'ITM-KIT-001', quantity: 1 }, { itemId: 'ITM-LIB-001', quantity: 2 }, { itemId: 'ITM-MAT-001', quantity: 1 }] } as never;
check('Lo que falta es lo que la receta pide y aún no se entregó, con su cantidad', JSON.stringify(missingStockLines(recipe, items, ['ITM-MAT-001'])) === JSON.stringify([{ name: 'Kit Lector 1', quantity: 1 }, { name: 'Libro Nivel 1', quantity: 2 }]));
const n1 = missingStockNotice({ enrollmentId: 'MAT-2026-001', student: 'Ana Pérez', branchName: 'Chiclayo', recipe, items, delivered: ['ITM-MAT-001'], firstSession: { date: '2026-11-20', time: '16:00' }, today: '2026-11-18' });
check('El aviso nombra la sede, la matrícula, el alumno, lo que falta y la fecha de la primera asesoría (como pidió el usuario)',
  /Chiclayo/.test(n1.title) && /Chiclayo/.test(n1.message) && /MAT-2026-001/.test(n1.message) && /Ana Pérez/.test(n1.message) && /1 × Kit Lector 1, 2 × Libro Nivel 1/.test(n1.message) && /20 de noviembre a las 4:00 p\. m\./.test(n1.message) && n1.message.length <= NOTICE_MESSAGE_MAX && n1.title.length <= NOTICE_TITLE_MAX, n1.message);
const n2 = missingStockNotice({ enrollmentId: 'MAT-2026-001', student: 'Ana Pérez', branchName: 'Chiclayo', recipe, items, delivered: [], today: '2026-11-18' });
check('Sin primera asesoría reservada, el aviso lo dice', /aún no tiene primera asesoría reservada/.test(n2.message));
check('La clave es matrícula + día: el mismo día no se repite y otro día o otra matrícula sí', n1.key === 'MAT-2026-001:2026-11-18' && n1.key === n2.key
  && missingStockNotice({ enrollmentId: 'MAT-2026-001', student: 'A', branchName: 'C', recipe, items, delivered: [], today: '2026-11-19' }).key !== n1.key
  && missingStockNotice({ enrollmentId: 'MAT-2026-002', student: 'A', branchName: 'C', recipe, items, delivered: [], today: '2026-11-18' }).key !== n1.key);

// ------------------------------------------------------------------------------------------------------------------ La migración 0026
const sql = read('supabase/migrations/20261118150000_avisos_en_la_base.sql');
const down = read('supabase/deshacer/20261118150000_avisos_en_la_base.down.sql');
const code = sql.replace(/--.*$/gm, '');
const tables = ['aviso_eventos', 'avisos', 'avisos_lecturas'];
check('La migración crea las tres tablas: los eventos, los avisos y las marcas de leído', tables.every(t => new RegExp(`create table public\\.${t} \\(`).test(sql)));
check('Un aviso NO guarda a quién llega: guarda el evento, los lugares (destino, origen, asunto), quién lo pidió, lo que nombra, la clave y quién lo emitió',
  /evento\s+text references public\.aviso_eventos \(id\)/.test(sql) && /destino_id\s+text/.test(sql) && /origen_id\s+text/.test(sql) && /asunto_id\s+text/.test(sql) && /solicitante_id\s+uuid references public\.cuentas/.test(sql)
  && /referencia\s+text/.test(sql) && /clave\s+text/.test(sql) && /creado_por_nombre\s+text not null/.test(sql) && !/destinatario_id|para_cuenta|cuenta_destino/.test(code));
check('El mismo aviso con la misma clave no se emite dos veces (índice único) y el código AVI lo asigna la base con un candado, sin repetidos ni huecos',
  /create unique index avisos_clave_uq on public\.avisos \(evento, clave\) where clave is not null/.test(sql) && /pg_advisory_xact_lock\(hashtextextended\('ensil:codigo:AVI\|', 0\)\)/.test(sql)
  && /check \(id ~ '\^AVI-\[0-9\]\{6,\}\$'\)/.test(sql) && /app\.numero_con_relleno\(v_n, 6\)/.test(sql));
check('Los avisos y las marcas de leído solo se agregan (no se modifican ni se borran ni se vacían)',
  /create trigger avisos_no_cambian before update or delete on public\.avisos/.test(sql) && /create trigger avisos_no_vaciar\s+before truncate on public\.avisos/.test(sql)
  && /create trigger avisos_lecturas_no_cambian before update or delete on public\.avisos_lecturas/.test(sql) && /create trigger avisos_lecturas_no_vaciar\s+before truncate on public\.avisos_lecturas/.test(sql));
check('El reparto lo hace la base con las cuentas activas de rol activo (sin el Superusuario), por función y sede, con el solicitante y el respaldo, igual que `resolveRecipients`',
  /create function app\.aviso_destinatarios\(/.test(sql) && /where c\.estado = 'Activo' and r\.estado = 'Activo' and not r\.es_sistema/.test(sql) && /'destination-branch' then p_destino when 'origin-branch' then p_origen when 'subject-branch' then p_asunto/.test(sql)
  && /g\.regla->>'person' = 'requester'/.test(sql) && /t\.nombre = p_solicitante_nombre/.test(sql) && /not exists \(select 1 from directos\)/.test(sql) && /rf\.funcion_id = ev\.respaldo/.test(sql)
  && /rf\.funcion_id = 'org-alcance:all_branches'/.test(sql) && /c\.todas_las_sedes/.test(sql) && /p_lugar like 'ALM-%'/.test(sql) && /cuenta_almacenes/.test(sql));
check('Emitir exige alguna de las funciones que lo emiten, un evento de acción, textos de tamaño válido, sedes que existan y que se alcance al menos una; deja quién lo emitió (el nombre sale de la cuenta)',
  /perform app\.exigir_alguna\(v_ev\.emiten, 'Su rol no puede emitir ese aviso\.'\)/.test(sql) && /v_ev\.disparo <> 'accion'/.test(sql) && /between 3 and 120|length\(v_titulo\) < 3 or length\(v_titulo\) > 120/.test(sql) && /length\(v_mensaje\) < 3 or length\(v_mensaje\) > 800/.test(sql)
  && /app\.ve_sede\(v_lugar\)/.test(sql) && /app\.ve_almacen_lectura\(v_lugar\)/.test(sql) && /No puede emitir avisos de una sede que su cuenta no alcanza/.test(sql) && /app\.quien\(null\)/.test(sql));
check('Leer y marcar solo lo que le corresponde a la cuenta; quien lee la bandeja es quien dice el registro («Ver la bandeja de avisos» y sus dos funciones hermanas)',
  /create function app\.aviso_es_para_mi\(/.test(sql) && /app\.puede_leer_avisos\(\) and \(/.test(sql) && /app\.es_superusuario\(\)/.test(sql) && /where a\.id = any \(p_ids\) and app\.aviso_es_para_mi\(/.test(sql));
const readers = ALL_CAPABILITIES.filter(c => (c as { reads?: string[] }).reads?.includes('notification')).map(c => c.id).sort().join();
const listOf = (fn: string) => [...(sql.match(new RegExp(`create function app\\.${fn}\\(\\) returns boolean[\\s\\S]*?array\\[([^\\]]+)\\]`))?.[1] ?? '').matchAll(/'([^']+)'/g)].map(m => m[1]).sort().join();
check('Quién lee los avisos es lo mismo que dice el registro', listOf('puede_leer_avisos') === readers && readers.includes('sis-avisos:view'), `${listOf('puede_leer_avisos')} / ${readers}`);
check('Las tablas solo se leen (con la política de cada una) y todo lo que cambia pasa por las funciones; las funciones públicas son de las cuentas con sesión y lo interno no se llama de fuera; no se toca ningún otro permiso',
  /revoke all on public\.aviso_eventos, public\.avisos, public\.avisos_lecturas from public, anon, authenticated;/.test(sql) && /grant select on public\.aviso_eventos, public\.avisos, public\.avisos_lecturas to authenticated;/.test(sql)
  && /create policy avisos_leer on public\.avisos for select to authenticated\s+using \(app\.aviso_es_para_mi\(evento, destino_id, origen_id, asunto_id, solicitante_id, solicitante_nombre\)\)/.test(sql)
  && /create policy avisos_lecturas_leer on public\.avisos_lecturas for select to authenticated using \(cuenta_id = \(select auth\.uid\(\)\)\)/.test(sql)
  && /revoke execute on function public\.mis_avisos\(integer\), public\.emitir_aviso\(text, text, text, text, jsonb, text, text\), public\.marcar_avisos_leidos\(text\[\]\) from public, anon;/.test(sql)
  && /revoke execute on function app\.aviso_inmutable\(\), app\.aviso_lectura_inmutable\(\), app\.aviso_alcanza\(uuid, text\), app\.aviso_destinatarios\(text, text, text, text, uuid, text\) from public, anon, authenticated;/.test(sql)
  && !/on all functions in schema app/.test(code) && !/insert|update|delete/.test(sql.match(/grant [^;]*to authenticated;/g)?.join(' ') ?? ''));
check('La migración se puede deshacer: quita las tres tablas y las funciones nuevas',
  tables.every(t => down.includes(`drop table if exists public.${t};`)) && ['mis_avisos', 'emitir_aviso', 'marcar_avisos_leidos'].every(f => down.includes(`drop function if exists public.${f}(`))
  && ['aviso_es_para_mi', 'aviso_destinatarios', 'aviso_alcanza', 'puede_leer_avisos', 'aviso_lectura_inmutable', 'aviso_inmutable'].every(f => down.includes(`drop function if exists app.${f}(`)));

// ------------------------------------------------------------------------------------------------------------------ Cableado
const ctxSrc = read('src/context/DataContext.tsx');
const hook = read('src/hooks/useNotices.ts');
const repoSrc = read('src/services/noticesRepository.ts');
const bell = read('src/components/layout/NotificationDropdown.tsx');
const verification = read('src/pages/Verification.tsx');
check('El repositorio llama a las tres funciones de la base con los argumentos de `emitArgs` (no escribe las tablas)',
  /client\.rpc\('mis_avisos', \{ p_dias: days \}\)/.test(repoSrc) && /client\.rpc\('emitir_aviso', emitArgs\(eventId, notice\)\)/.test(repoSrc) && /client\.rpc\('marcar_avisos_leidos', \{ p_ids: ids \}\)/.test(repoSrc) && !/\.from\(/.test(repoSrc));
check('El gancho lee los avisos al abrir el sistema y los vuelve a leer cada minuto y al volver a la pestaña; marcar leído se ve al instante y no lanza',
  /NOTICE_REFRESH_MS/.test(hook) && /visibilitychange/.test(hook) && /withRead\(prev, ids\)/.test(hook) && /clearInterval/.test(hook) && /removeEventListener/.test(hook));
check('El contexto usa los avisos de la base: ya no hay avisos en memoria ni «Bienvenido» de ejemplo; emitir es una consecuencia (no deshace la acción si falla) y marcar leído acepta varios',
  /const notices = useNotices\(\)/.test(ctxSrc) && /void notices\.emit\(eventId, n\)/.test(ctxSrc) && !/setNotifications|NOT-001|Bienvenido al sistema/.test(ctxSrc) && /const myNotifications = notices\.notices/.test(ctxSrc)
  && /markNotificationAsRead = \(id: string \| string\[\]\)/.test(ctxSrc) && /markNotificationAsRead: \(id: string \| string\[\]\) => void;/.test(ctxSrc));
const registryEmits = (capabilityById('op-verificacion:deliver') as { emits?: string[]; actions?: string[] });
check('«Avisar a Logística» es parte de entregar materiales (no hay función nueva): la acción la protege la función de entregar y emite el aviso',
  (registryEmits.emits ?? []).includes('verification_without_stock') && (registryEmits.actions ?? []).includes('notifyMissingStock') && !THROWS_ON_DENIAL.has('notifyMissingStock'));
check('El aviso a Logística llega a quien tiene «Preparar un envío» en cualquier sede (la logística central) y, si nadie, al respaldo',
  JSON.stringify(EVENTS.find(e => e.id === 'verification_without_stock')?.recipients) === JSON.stringify([{ capability: 'log-envios:create', where: 'any' }]) && EVENTS.find(e => e.id === 'verification_without_stock')?.fallback === 'sis-avisos:fallback');
check('La acción comprueba otra vez que no hay stock de nada (no avisa por gusto), arma el texto con las reglas puras y emite con la clave de una vez por matrícula y por día',
  /const notifyMissingStock: DataContextType\['notifyMissingStock'\]/.test(ctxSrc) && /noStockAtAll\(recipe, items, stockItems, enrollment\.branchId \|\| '', delivered\)/.test(ctxSrc) && /missingStockNotice\(\{/.test(ctxSrc)
  && /notices\.emit\('verification_without_stock'/.test(ctxSrc) && /key: notice\.key/.test(ctxSrc) && /reference: enrollment\.id/.test(ctxSrc));
check('La pantalla de verificación muestra el botón solo a quien puede entregar materiales y solo cuando no hay stock de nada; avisa el resultado y apaga el botón mientras envía o después de enviar',
  /\{noStock && \(/.test(verification) && /can\(PERM\.deliverMaterials\) && \(/.test(verification) && /Avisar a Logística/.test(verification) && /disabled=\{notifying \|\| notifyResult\?\.ok === true\}/.test(verification) && /notifyMissingStock\(selectedEnrollment\.id\)/.test(verification));
check('La campana marca todos los avisos con una sola llamada y muestra quién lo emitió', /markNotificationAsRead\(unreadNotices\.map\(n => n\.id\)\)/.test(bell) && /notif\.emittedBy/.test(bell));
check('Cada evento de acción del registro se emite desde algún lugar del contexto (no hay avisos huérfanos)',
  EVENTS.filter(e => e.trigger === 'accion').every(e => ctxSrc.includes(`'${e.id}'`)), EVENTS.filter(e => e.trigger === 'accion' && !ctxSrc.includes(`'${e.id}'`)).map(e => e.id).join());
const emitted = [...ctxSrc.matchAll(/notify\('([a-z_]+)'/g)].map(m => m[1]!);
check('Todo evento que el contexto emite existe en el registro y se dispara desde una acción', emitted.every(id => EVENTS.some(e => e.id === id && e.trigger === 'accion')), emitted.filter(id => !EVENTS.some(e => e.id === id)).join());

console.log(failed === 0 ? '\nTodo en orden.' : `\n${failed} comprobación(es) fallida(s).`);
process.exit(failed === 0 ? 0 : 1);
