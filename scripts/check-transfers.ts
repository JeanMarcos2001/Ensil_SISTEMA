/**
 * Verificación de las transferencias entre sedes, sin aprobación (migración 0032): una sede le manda a otra sede (un préstamo) o devuelve al almacén central, y
 * cada sede responde por lo que manda.
 *  - las reglas puras: motivos que se ofrecen, avisos sobre el stock de la sede que manda, cancelación con motivo (`utils/logisticsDocs.ts`, `logisticsRoutes.ts`);
 *  - la lista de sedes que ve cualquier cuenta (`utils/placeDirectory.ts`, `services/placeDirectory.ts`) con un repositorio en memoria;
 *  - la migración 0032 (ruta, estados, quién la ve, quién puede, textos iguales a los del sistema, funciones de los roles, tiempo real y deshacer);
 *  - el registro de funciones, las plantillas de rol, los avisos, la regla de cuentas del almacén y las pantallas (Transferencias, Recepciones, Stock).
 * Ejecutar: npx tsx scripts/check-transfers.ts
 */
import { readFileSync } from 'node:fs';
import {
  TRANSFER_CANCEL_REASON_MESSAGE, TRANSFER_REASONS_TO_SEDE, TRANSFER_REASONS_TO_WAREHOUSE, transferCancelError, transferReasonsFor, transferStockNotes, transferTransitionError,
} from '../src/utils/logisticsDocs';
import { TRANSFER_NO_WAREHOUSE, TRANSFER_ORIGIN_NOT_SEDE, isReturnToWarehouse, stockLocations, transferRouteError } from '../src/utils/logisticsRoutes';
import { mergeLocations, placeDirectoryErrorMessage, placeName, sedeLocationsFromRows, type PlaceRow } from '../src/utils/placeDirectory';
import { loadPlaceDirectory, type PlaceDirectoryRepository } from '../src/services/placeDirectory';
import { ALL_CAPABILITIES, capabilityById } from '../src/utils/capabilities';
import { EVENTS, INCOMPATIBILITIES } from '../src/utils/capabilityRegistry';
import { FUNCIONES_QUE_MUEVEN_ALMACEN } from '../supabase/functions/usuarios/reglas';
import { ROLE_TEMPLATES, templatePermissions } from '../src/utils/roleTemplates';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : ` -> ${detail}`}`);
  if (!ok) failed++;
};
const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

// ------------------------------------------------------------------------------------------------------------------ Reglas puras

const branches = [{ id: 'FIL-002', name: 'Piura', status: 'Activo' as const }, { id: 'FIL-003', name: 'Chiclayo', status: 'Activo' as const }, { id: 'FIL-005', name: 'Ilo', status: 'Inactivo' as const }];
const locs = stockLocations(branches, [{ id: 'ALM-001', name: 'Almacén central', status: 'Activo' as const }]);

function rules() {
  check('Los motivos de un préstamo a otra sede y los de una devolución al almacén son distintos, y sin destino se ofrecen los de una sede',
    JSON.stringify(transferReasonsFor('FIL-003')) === JSON.stringify(TRANSFER_REASONS_TO_SEDE) && JSON.stringify(transferReasonsFor('ALM-001')) === JSON.stringify(TRANSFER_REASONS_TO_WAREHOUSE)
    && JSON.stringify(transferReasonsFor('')) === JSON.stringify(TRANSFER_REASONS_TO_SEDE)
    && TRANSFER_REASONS_TO_WAREHOUSE.every(r => /^Devolución/.test(r)) && TRANSFER_REASONS_TO_SEDE.every(r => !/^Devolución/.test(r)) && TRANSFER_REASONS_TO_SEDE.includes('Préstamo a otra sede'));
  check('Es una devolución cuando el destino es el almacén y un préstamo cuando es otra sede', isReturnToWarehouse('ALM-001') && !isReturnToWarehouse('FIL-003'));
  check('La ruta: de una sede a otra sede o al almacén, nunca desde el almacén, y con las dos puntas activas',
    transferRouteError('FIL-002', 'FIL-003', locs) === null && transferRouteError('FIL-002', 'ALM-001', locs) === null
    && transferRouteError('ALM-001', 'FIL-002', locs) === TRANSFER_ORIGIN_NOT_SEDE && transferRouteError('FIL-002', 'FIL-005', locs) === 'La sede Ilo está inactiva.'
    && transferRouteError('FIL-002', 'ALM-009', locs) === TRANSFER_NO_WAREHOUSE);

  // Cancelar
  check('Cancelar un borrador no pide motivo; cancelar algo que ya salió, sí (al menos 5 letras)',
    transferCancelError('Borrador', undefined) === null && transferCancelError('Borrador', '') === null
    && transferCancelError('En tránsito', '') === TRANSFER_CANCEL_REASON_MESSAGE && transferCancelError('En tránsito', '  ab  ') === TRANSFER_CANCEL_REASON_MESSAGE
    && transferCancelError('Listo para recepción', undefined) === TRANSFER_CANCEL_REASON_MESSAGE && transferCancelError('En tránsito', 'Ya no la necesitan') === null
    && /vuelve a la sede de origen/.test(TRANSFER_CANCEL_REASON_MESSAGE));
  check('Una transferencia ya recibida no se cancela (no hay camino)', !!transferTransitionError('Recibida', 'Cancelada') && !!transferTransitionError('Recibida con diferencias', 'Cancelada') && transferTransitionError('Listo para recepción', 'Cancelada') === null);

  // Stock de la sede que manda
  const stock = [
    { itemId: 'A1', branchId: 'FIL-002', stock: 10, minStock: 4 }, { itemId: 'A2', branchId: 'FIL-002', stock: 3, minStock: 0 }, { itemId: 'A3', branchId: 'FIL-002', stock: 8, minStock: 6 },
    { itemId: 'A1', branchId: 'FIL-003', stock: 99, minStock: 0 },
  ];
  const notes = transferStockNotes([{ itemId: 'A1', quantity: 5 }, { itemId: 'A2', quantity: 5 }, { itemId: 'A3', quantity: 3 }, { itemId: 'A4', quantity: 1 }, { itemId: '', quantity: 2 }, { itemId: 'A1', quantity: 0 }], 'FIL-002', stock);
  check('Si lo que se manda no alcanza se avisa (no se podrá despachar); si deja la sede bajo su mínimo, también (solo se avisa)',
    notes.length === 3 && notes.find(n => n.itemId === 'A2')?.short === true && notes.find(n => n.itemId === 'A2')?.available === 3
    && notes.find(n => n.itemId === 'A3')?.belowMin === true && notes.find(n => n.itemId === 'A3')?.short === false && notes.find(n => n.itemId === 'A3')?.min === 6
    && notes.find(n => n.itemId === 'A4')?.short === true && notes.find(n => n.itemId === 'A4')?.available === 0, JSON.stringify(notes));
  check('Mandar lo que sobra sin tocar el mínimo no avisa nada, y solo cuenta el stock de la sede que manda', transferStockNotes([{ itemId: 'A1', quantity: 5 }], 'FIL-002', stock).length === 0
    && transferStockNotes([{ itemId: 'A1', quantity: 50 }], 'FIL-003', stock).length === 0 && transferStockNotes([{ itemId: 'A1', quantity: 50 }], 'FIL-002', stock)[0]?.short === true);
}

// ------------------------------------------------------------------------------------------------------------------ La lista de sedes

async function directory() {
  const rows: PlaceRow[] = [{ id: 'FIL-002', nombre: 'Piura', estado: 'Activo' }, { id: 'FIL-009', nombre: 'Juliaca', estado: 'Activo' }, { id: 'FIL-005', nombre: 'Ilo', estado: 'Inactivo' }];
  const sedes = sedeLocationsFromRows(rows);
  check('Las sedes de la lista son ubicaciones de tipo sede con su nombre y estado', sedes.length === 3 && sedes.every(s => s.kind === 'sede') && sedes[1].name === 'Juliaca' && sedes[2].status === 'Inactivo');
  const own = stockLocations([{ id: 'FIL-003', name: 'Chiclayo', status: 'Activo' }], [{ id: 'ALM-001', name: 'Almacén central', status: 'Activo' }]);
  const merged = mergeLocations(own, sedes);
  check('Lo que la cuenta ya lee va primero y manda; las demás sedes de la lista se suman sin repetir', merged.length === own.length + 3 && merged.slice(0, own.length).every((l, i) => l.id === own[i].id)
    && merged.filter(l => l.id === 'FIL-003').length === 1 && merged.some(l => l.id === 'FIL-009')
    && mergeLocations([{ id: 'FIL-002', name: 'Piura (propia)', status: 'Activo', kind: 'sede' }], sedes).find(l => l.id === 'FIL-002')?.name === 'Piura (propia)');
  check('Una cuenta de Chiclayo puede elegir a Juliaca como destino y ve su nombre (no su código)', placeName(merged, 'FIL-009') === 'Juliaca' && placeName(merged, 'FIL-777') === 'FIL-777');
  const ok: PlaceDirectoryRepository = { list: async () => ({ ok: true, data: rows }) };
  const bad: PlaceDirectoryRepository = { list: async () => ({ ok: false, error: 'Su cuenta no puede consultar esto.' }) };
  const empty: PlaceDirectoryRepository = { list: async () => ({ ok: false }) };
  const a = await loadPlaceDirectory(ok), b = await loadPlaceDirectory(bad), c = await loadPlaceDirectory(empty);
  check('El servicio trae las sedes, o el motivo si la base no contesta (nunca impide abrir el sistema)', a.ok && a.value?.length === 3 && !b.ok && b.error === 'Su cuenta no puede consultar esto.' && !c.ok && /lista de sedes/.test(c.error ?? ''));
  check('Los errores de la base de datos se traducen a un mensaje claro', placeDirectoryErrorMessage(null) === 'No se pudo leer la lista de sedes.' && /\S/.test(placeDirectoryErrorMessage({ message: 'x', code: 'EN001' })));
  const repo = read('src/services/placeDirectoryRepository.ts'), hook = read('src/hooks/usePlaceDirectory.ts'), util = read('src/utils/placeDirectory.ts');
  check('El repositorio llama a `directorio_sedes` y el gancho la vuelve a leer (al abrir, cada tanto y al volver a la pestaña) sin impedir abrir el sistema',
    /rpc\('directorio_sedes'\)/.test(repo) && /PLACE_DIRECTORY_REFRESH_MS/.test(hook) && /visibilitychange/.test(hook) && /if \(res\.ok && res\.value\) setSedes/.test(hook) && /PLACE_DIRECTORY_REFRESH_MS = 10 \* 60_000/.test(util));
  const ctx = read('src/context/DataContext.tsx');
  check('El contexto ofrece `transferPlaces` (lo que la cuenta lee más la lista de sedes) sin ampliar `stockLocations`, y los avisos nombran las sedes con ella',
    /transferPlaces: StockLocation\[\];/.test(ctx) && /const transferPlaces = useMemo\(\(\) => mergeLocations\(locations, placeDirectory\.sedes\)/.test(ctx) && /stockLocations: locations,\n\s+transferPlaces,/.test(ctx)
    && /const locationName = \(id: string \| undefined\): string => transferPlaces\.find/.test(ctx));
}

// ------------------------------------------------------------------------------------------------------------------ La migración 0032

function migration() {
  const mig = read('supabase/migrations/20261122100000_transferencias_entre_sedes.sql');
  const down = read('supabase/deshacer/20261122100000_transferencias_entre_sedes.down.sql');
  const body = (name: string) => {
    const i = mig.indexOf(name);
    return i < 0 ? '' : mig.slice(i, mig.indexOf('\n$$;', i));
  };
  check('Sale siempre de una sede: la restricción de «un extremo es el almacén» se cambia, y los estados de aprobación se quitan',
    /drop constraint transferencias_check2;/.test(mig) && /check \(origen_almacen_id is null\)/.test(mig) && /check \(estado in \('Borrador', 'En tránsito', 'Listo para recepción', 'Recibida', 'Recibida con diferencias', 'Cancelada'\)\)/.test(mig)
    && !/'Solicitada'\)|'Aprobada'\)/.test(mig.slice(mig.indexOf('add constraint transferencias_estado_check'), mig.indexOf('add constraint transferencias_estado_check') + 260)));
  check('Antes de aplicarla se revisan las reposiciones, y lo que esperaba aprobación se cancela con su explicación',
    /where origen_almacen_id is not null/.test(mig) && /reposiciones/.test(mig) && /set estado = 'Cancelada', motivo_cancelacion = 'Se canceló al dejar de pedir aprobación/.test(mig) && /where estado in \('Solicitada', 'Aprobada', 'Rechazada'\)/.test(mig));
  check('Lo que sale queda con quién y cuándo (`despachado_en`, `despachado_por`) y lo que está en tránsito o recibido debe traer su fecha',
    /add column despachado_en timestamptz/.test(mig) && /despachado_por text/.test(mig) && /motivo_cancelacion text/.test(mig) && /transferencias_despacho_check/.test(mig)
    && /despachado_en = now\(\), despachado_por = app\.quien\(null\)/.test(body('create or replace function app.despachar_transferencia')));
  check('La sede destino solo la ve desde que sale: la política exige `despachado_en` para la punta del destino',
    /create policy transferencias_leer[\s\S]+puede_ver_ubicacion\(origen_sede_id, origen_almacen_id\)[\s\S]+despachado_en is not null and \(select app\.puede_ver_ubicacion\(destino_sede_id, destino_almacen_id\)\)/.test(mig));
  check('Los textos de la ruta, de la cancelación y del despacho son los mismos del sistema', mig.includes(TRANSFER_ORIGIN_NOT_SEDE) && mig.includes(TRANSFER_NO_WAREHOUSE) && mig.includes(TRANSFER_CANCEL_REASON_MESSAGE)
    && mig.includes('Por favor complete el método de envío y la fecha de llegada.') && !/\bETA\b/.test(mig.replace(/\beta\b/g, '').replace(/--.*$/gm, '')) && mig.includes('El origen y el destino deben ser distintos.'));
  const crear = body('create or replace function public.crear_transferencia'), editar = body('create or replace function public.editar_transferencia');
  const estado = body('create function public.cambiar_estado_transferencia');
  check('Prepara quien tiene «Preparar una transferencia» Y alcanza la sede que manda; una nueva nace como borrador',
    /exigir\('log-transfer:create', 'Preparar una transferencia'\)/.test(crear) && /app\.exigir_mover\(v_origen\)/.test(crear) && /<> 'Borrador' then raise exception 'Una transferencia nueva nace como borrador/.test(crear));
  check('Editar, marcar «Listo para recepción», habilitar la recepción y cancelar también exigen alcanzar la sede que manda (ahora todas las sedes despachan lo suyo)',
    /app\.exigir_mover\(t\.origen_id\)/.test(editar) && (estado.match(/app\.exigir_mover\(t\.origen_id\)/g) ?? []).length === 3 && /elsif p_estado = 'Listo para recepción'[\s\S]+exigir_mover\(t\.origen_id\)/.test(estado));
  check('Al cambiar la lista del borrador sin mandar cajas, las cajas se vuelven a armar (no quedan cajas que no sumen)', /when p \? 'lineas' then '\[\]'::jsonb else x\.cajas end/.test(editar));
  check('Cancelar algo que ya salió pide su motivo, devuelve el stock a la sede de origen y lo guarda; cancelar un borrador no mueve nada',
    /length\(btrim\(coalesce\(p_observacion, ''\)\)\) < 5/.test(estado) && /mover_lineas\(t\.origen_id, t\.lineas, 1, 'Ingreso'/.test(estado) && /motivo_cancelacion = btrim\(p_observacion\)/.test(estado)
    && /p_estado = 'Cancelada' and t\.estado = 'Borrador'[\s\S]+?update public\.transferencias x set estado = p_estado[\s\S]+?elsif p_estado = 'Cancelada' and t\.estado in/.test(estado));
  check('La función de estado cambia de firma: se quita la de dos parámetros para que no quede una segunda con las reglas de antes',
    /drop function public\.cambiar_estado_transferencia\(text, text\);/.test(mig) && /p_observacion text default null/.test(mig));
  const despachar = body('create or replace function app.despachar_transferencia');
  check('Al despachar se vuelve a comprobar la ruta (el destino pudo inactivarse) y el stock sale una sola vez', /validar_ruta_transferencia\(t\.origen_id, t\.destino_id\)/.test(despachar) && /mover_lineas\(t\.origen_id, t\.lineas, -1, 'Transferencia Salida'/.test(despachar));
  check('Las funciones que pide la migración existen en el registro', [...mig.matchAll(/(?:exigir|permite)\('([a-z-]+:[a-z_]+)'/g)].every(m => !!capabilityById(m[1])) && !/req_transfer'\)|approve_transfer'\)/.test(mig.replace(/where funcion_id[^;]+;/g, '').replace(/rf\.funcion_id = 'log-transfer:req_transfer'/g, '')));
  check('Quien podía solicitar ahora prepara y despacha, y la aprobación se quita de todos los roles',
    /where rf\.funcion_id = 'log-transfer:req_transfer'/.test(mig) && /'log-transfer:create'\), \('log-transfer:dispatch'\)/.test(mig) && /delete from public\.rol_funciones where funcion_id in \('log-transfer:req_transfer', 'log-transfer:approve_transfer'\)/.test(mig));
  check('La lista de sedes la lee cualquier cuenta con acceso vigente y solo entrega código, nombre y estado (ni dirección, ni teléfonos, ni empresa)',
    /create function public\.directorio_sedes\(\) returns table \(id text, nombre text, estado text\)/.test(mig) && /acceso_vigente\(\)/.test(body('create function public.directorio_sedes')) && !/direccion|telefono|empresa_id|referencia/.test(body('create function public.directorio_sedes'))
    && /grant execute on function[^;]*directorio_sedes\(\)[^;]* to authenticated/.test(mig) && /revoke execute on function[^;]*directorio_sedes\(\)[^;]* from public, anon/.test(mig));
  check('Tiempo real: la tabla de transferencias se agrega a la publicación (si existe) sin repetirla', /pubname = 'supabase_realtime'[\s\S]+tablename = 'transferencias'[\s\S]+alter publication supabase_realtime add table public\.transferencias/.test(mig));
  check('Los eventos que ya no existen se quitan (si ningún aviso los nombra)', /delete from public\.aviso_eventos[\s\S]+'transfer_requested', 'transfer_decided'[\s\S]+not exists \(select 1 from public\.avisos a where a\.evento = e\.id\)/.test(mig));
  check('Se puede deshacer: vuelve lo de antes y se detiene si ya hay transferencias entre dos sedes',
    /entre dos sedes/.test(down) && /create function public\.cambiar_estado_transferencia\(p_id text, p_estado text\) returns void/.test(down) && /drop function public\.directorio_sedes\(\);/.test(down)
    && /drop column despachado_en, drop column despachado_por, drop column motivo_cancelacion/.test(down) && /add constraint transferencias_check2/.test(down) && /drop table public\.transferencias/.test(down));
}

// ------------------------------------------------------------------------------------------------------------------ Registro, roles, avisos y pantallas

/** Los destinatarios de un aviso que se resuelven por función (los que se resuelven por persona no se miran aquí). */
const recipientsOf = (eventId: string) => (EVENTS.find(e => e.id === eventId)?.recipients ?? []).flatMap(r => ('capability' in r ? [r] : []));

function registryAndScreens() {
  const ids = ALL_CAPABILITIES.filter(c => c.id.startsWith('log-transfer:')).map(c => c.id).sort();
  check('Las funciones de transferencias son ver, preparar, despachar y recepcionar (se quitaron «solicitar» y «aprobar»)',
    JSON.stringify(ids) === JSON.stringify(['log-transfer:create', 'log-transfer:dispatch', 'log-transfer:receive', 'log-transfer:view']), ids.join());
  const create = capabilityById('log-transfer:create')!, dispatch = capabilityById('log-transfer:dispatch')!;
  check('«Preparar una transferencia» no tiene contraparte que la apruebe; «Despachar» exige que alguien reciba en el destino y avisa si se cancela',
    create.label === 'Preparar una transferencia' && create.counterparts.length === 0 && create.emits.length === 0
    && dispatch.counterparts.some(c => c.capability === 'log-transfer:receive' && c.where === 'destination-branch' && c.strength === 'required') && dispatch.emits.includes('transfer_dispatched') && dispatch.emits.includes('transfer_cancelled'));
  check('Los avisos: se quitan «solicitada» y «aprobada o rechazada»; el aviso de cancelación llega a quien recibe en el destino',
    !EVENTS.some(e => e.id === 'transfer_requested' || e.id === 'transfer_decided') && recipientsOf('transfer_cancelled').length === 1
    && recipientsOf('transfer_cancelled')[0].capability === 'log-transfer:receive' && recipientsOf('transfer_cancelled')[0].where === 'destination-branch');
  check('«Stock por debajo del mínimo» avisa a quien pide requerimientos en la sede (ya no hay «solicitar transferencia») y a Logística',
    recipientsOf('stock_below_minimum').some(r => r.capability === 'log-requerimientos:create' && r.where === 'subject-branch')
    && !recipientsOf('stock_below_minimum').some(r => r.capability.startsWith('log-transfer:')));
  check('Ya no hay combinación «aprobar, despachar y recibir una transferencia» (no hay aprobación)', !INCOMPATIBILITIES.some(i => i.id === 'transferir-aprobar-recibir' || i.capabilities.some(c => c === 'log-transfer:approve_transfer')));
  const tpl = (id: string) => new Set(templatePermissions(ROLE_TEMPLATES.find(t => t.id === id)!));
  check('El administrador de sede prepara, despacha y recibe transferencias; el almacén solo las recibe (devoluciones)',
    ['log-transfer:create', 'log-transfer:dispatch', 'log-transfer:receive', 'log-transfer:view'].every(f => tpl('admin-sede').has(f))
    && tpl('almacen-central').has('log-transfer:receive') && !tpl('almacen-central').has('log-transfer:dispatch') && !tpl('almacen-central').has('log-transfer:create'));
  check('Despachar una transferencia ya no «mueve el almacén»: si no, cada administrador de sede tendría que estar asignado al almacén', !FUNCIONES_QUE_MUEVEN_ALMACEN.includes('log-transfer:dispatch') && FUNCIONES_QUE_MUEVEN_ALMACEN.includes('log-envios:dispatch'));
  const ctxSrc = read('src/context/DataContext.tsx');
  check('Una transferencia nueva no avisa a nadie (es un borrador); despachar avisa a la sede que recibe y cancelar una que ya salió también, con su motivo',
    !/announceTransfer/.test(ctxSrc) && !/'transfer_requested'|'transfer_decided'/.test(ctxSrc) && /notify\('transfer_dispatched'/.test(ctxSrc) && /notify\('transfer_cancelled'/.test(ctxSrc)
    && /updateTransferStatus: \(id: string, status: Transfer\['status'\], observation\?: string\)/.test(ctxSrc) && /Motivo: \$\{\(observation \?\? ''\)\.trim\(\)\}/.test(ctxSrc));
  const page = read('src/pages/logistics/Transfers.tsx'), recep = read('src/pages/logistics/Receptions.tsx'), stock = read('src/pages/logistics/Stock.tsx');
  check('La pantalla de Transferencias ya no aprueba ni rechaza: nada de «solicitada», «aprobada» ni funciones de solicitar o aprobar',
    !/Aprobar|Rechazar|Solicitada|Aprobada|Rechazada|Enviar Solicitud|Nueva Solicitud|req_transfer|approve_transfer/.test(page) && /can\('log-transfer:create'\)/.test(page) && /Nueva transferencia/.test(page));
  check('Dice que no lleva aprobación y que cada sede responde por lo que manda; elige la sede que manda entre las que la cuenta alcanza y el destino entre la lista de sedes y el almacén',
    /No necesita aprobación/.test(page) && /cada sede responde por lo que manda/.test(page) && /const originOptions = branches\.filter\(b => b\.status === 'Activo'\)/.test(page)
    && /transferPlaces\.filter\(l => l\.kind === 'sede'/.test(page) && /optgroup label="Devolución al almacén"/.test(page) && /optgroup label="Préstamo a otra sede"/.test(page) && /transferReasonsFor\(destinationId\)/.test(page));
  check('Las opciones de cada transferencia las ve solo quien alcanza la sede que manda; cancelar algo que ya salió pide su motivo con un diálogo',
    /const canOperateOrigin = \(t: Transfer\) => branches\.some\(b => b\.id === t\.originId\)/.test(page) && (page.match(/!canOperateOrigin\(transfer\)/g) ?? []).length === 7
    && /<ReasonDialog/.test(page) && /updateTransferStatus\(cancelTarget\.id, 'Cancelada', detail\.trim\(\)\)/.test(page) && /setCancelTarget\(transfer\)/.test(page) && /No hay marcha atrás/.test(page));
  check('Avisa antes de guardar si lo que se manda no alcanza o deja la sede bajo su mínimo, y se actualiza sola (en vivo o cada 30 segundos)',
    /transferStockNotes\(/.test(page) && /No se podrá despachar con esa cantidad/.test(page) && /por debajo de su mínimo/.test(page) && /useLiveShipments\(/.test(page) && /<LiveIndicator connected=\{connected\}/.test(page));
  check('Se puede editar un borrador y guardarlo «y preparar el despacho»; el nombre de cada sede sale de la lista de sedes',
    /handleOpenEdit/.test(page) && /Guardar y preparar despacho/.test(page) && /prepareAfterSave/.test(page) && /const place = \(id: string\) => placeName\(transferPlaces, id\)/.test(page) && !/stockLocations/.test(page));
  check('Recepciones nombra el origen con la lista de sedes (una sede solo lee la suya) y marca «Recibida» como recibida',
    (recep.match(/transferPlaces\.find/g) ?? []).length === 4 && /case 'Recibida': return 'success'/.test(recep));
  check('En Stock, «Transferir» pide «Preparar una transferencia»', /label: 'Transferir', hidden: !can\('log-transfer:create'\)/.test(stock));
  const seedEvents = read('supabase/seed/avisos_eventos.sql');
  check('La carga repetible de eventos trae la cancelación y ya no la solicitud ni la aprobación', /'transfer_cancelled'/.test(seedEvents) && !/'transfer_requested'|'transfer_decided'/.test(seedEvents));
  const reglas = read('supabase/functions/usuarios/reglas.ts');
  check('La regla de cuentas del almacén (servidor) ya no cuenta «despachar transferencia»', !/log-transfer:dispatch/.test(reglas));
}

rules();
await directory();
migration();
registryAndScreens();

if (failed > 0) {
  console.log(`\n${failed} comprobaciones fallaron.`);
  process.exit(1);
}
console.log('\nTodas las comprobaciones pasaron.');
