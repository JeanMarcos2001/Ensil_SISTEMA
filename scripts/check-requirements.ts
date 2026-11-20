/**
 * Verificación de la entrega 3 del tablero de envíos: los requerimientos de las sedes, «Verificar existencia», el rechazo con motivo y los mensajes anclados.
 *  - las reglas puras (`utils/requirements.ts`): qué se puede pedir, cómo se reduce, qué ve la sede (nunca la etapa), lo comprometido en otras tarjetas, los mensajes nuevos;
 *  - la traducción de filas de la base (`utils/requirementsDb.ts`) y las operaciones (`services/requirements.ts`) con un repositorio en memoria: valida antes de guardar y
 *    manda la versión que se vio;
 *  - la migración 0031 (tablas, funciones, textos iguales a los del sistema, funciones del registro, tiempo real y deshacer);
 *  - el registro de funciones, las plantillas de rol, los avisos y las pantallas (tablero, Recepciones, parpadeo de la tarjeta).
 * Ejecutar: npx tsx scripts/check-requirements.ts
 */
import { readFileSync } from 'node:fs';
import type { Shipment } from '../src/context/DataContext';
import {
  boardRequirements, committedByItem, liveShipmentOf, messagesOf, requirementAcceptsMessages, requirementChanges, requirementDraftError, requirementMatches,
  requirementMessageError, requirementMove, requirementNeedsAttention, requirementOpenError, requirementRejectionError, requirementReviewError, requirementReviewRows,
  requirementSedeStatus, requirementSentLines, requirementToPackingIssue, requirementTotals, unreadMessages, REQUIREMENT_LIMITS, REQUIREMENT_STALE_MESSAGE,
  type Requirement, type RequirementMessage,
} from '../src/utils/requirements';
import { messageFromRow, requirementFromRow, requirementPayload, reviewPayload, seenFromRows, type RequerimientoRow } from '../src/utils/requirementsDb';
import { shipmentFromRow, type EnvioRow } from '../src/utils/stockDb';
import {
  createRequirement, markRequirementSeen, moveRequirementToPacking, openRequirementReview, rejectRequirement, reviewRequirement, sendRequirementMessage,
  type RequirementsContext, type RequirementsRepository,
} from '../src/services/requirements';
import { ALL_CAPABILITIES, capabilityById } from '../src/utils/capabilities';
import { EVENTS, NON_CAPABILITY_ACTIONS } from '../src/utils/capabilityRegistry';
import { ROLE_TEMPLATES } from '../src/utils/roleTemplates';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : ` -> ${detail}`}`);
  if (!ok) failed++;
};
const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

const items = [
  { id: 'A1', name: 'Libro 1', status: 'Activo' }, { id: 'A2', name: 'Libro 2', status: 'Activo' }, { id: 'A3', name: 'Tablero', status: 'Activo' }, { id: 'X9', name: 'Viejo', status: 'Inactivo' },
];
const itemName = (id: string) => items.find(i => i.id === id)?.name ?? id;

const req = (over: Partial<Requirement> = {}): Requirement => ({
  id: 'REQ-2026-001', date: '2026-11-20', branchId: 'FIL-003', warehouseId: 'ALM-001', lines: [{ itemId: 'A1', quantity: 10 }, { itemId: 'A2', quantity: 5 }],
  status: 'Pendiente', version: 1, createdById: 'u-chi', createdBy: 'Carla', ...over,
});
const reviewed = (over: Partial<Requirement> = {}): Requirement => req({ reviewedAt: '2026-11-20T15:00:00Z', seenAt: '2026-11-20T14:00:00Z', lines: [{ itemId: 'A1', quantity: 10, send: 8 }, { itemId: 'A2', quantity: 5, send: 0 }], ...over });
const ship = (over: Partial<Shipment> = {}): Shipment => ({
  id: 'ENV-2026-001', date: '2026-11-20', originId: 'ALM-001', destinationId: 'FIL-003', status: 'Empacando', boxes: [], items: [{ itemId: 'A1', quantity: 8 }], requirementId: 'REQ-2026-001', ...over,
});

// ------------------------------------------------------------------------------------------------------------------ Lo que se puede pedir
function draftRules() {
  const ok = { branchId: 'FIL-003', warehouseId: 'ALM-001', lines: [{ itemId: 'A1', quantity: 10 }] };
  check('Un pedido bien armado no tiene error', requirementDraftError(ok, items) === null);
  check('Sin sede o sin almacén central se dice', requirementDraftError({ ...ok, branchId: '' }, items) === 'Indique la sede que pide.' && /almacén central/.test(requirementDraftError({ ...ok, warehouseId: '' }, items) ?? ''));
  check('Sin artículos se pide al menos uno', requirementDraftError({ ...ok, lines: [] }, items) === 'Agregue al menos un artículo al requerimiento.');
  check('Un artículo sin elegir, con cantidad 0, con decimales o repetido se rechaza',
    requirementDraftError({ ...ok, lines: [{ itemId: '', quantity: 1 }] }, items) === 'Hay un artículo sin seleccionar.'
    && requirementDraftError({ ...ok, lines: [{ itemId: 'A1', quantity: 0 }] }, items) === 'La cantidad debe ser un número entero mayor a 0.'
    && requirementDraftError({ ...ok, lines: [{ itemId: 'A1', quantity: 2.5 }] }, items) === 'La cantidad debe ser un número entero mayor a 0.'
    && requirementDraftError({ ...ok, lines: [{ itemId: 'A1', quantity: 1 }, { itemId: 'A1', quantity: 2 }] }, items) === 'Hay artículos repetidos en el requerimiento.');
  check('Más de 99 999 unidades, más de 60 artículos o una nota de más de 500 letras se rechazan',
    requirementDraftError({ ...ok, lines: [{ itemId: 'A1', quantity: 100000 }] }, items) === 'La cantidad pedida no puede pasar de 99 999 unidades por artículo.'
    && /hasta 60/.test(requirementDraftError({ ...ok, lines: Array.from({ length: 61 }, (_, i) => ({ itemId: `Z${i}`, quantity: 1 })) }, items) ?? '')
    && /500/.test(requirementDraftError({ ...ok, note: 'x'.repeat(501) }, items) ?? ''));
  check('Un artículo que no existe o que está inactivo se rechaza',
    requirementDraftError({ ...ok, lines: [{ itemId: 'NO', quantity: 1 }] }, items) === 'Un artículo no existe en el catálogo.'
    && requirementDraftError({ ...ok, lines: [{ itemId: 'X9', quantity: 1 }] }, items) === 'El artículo «Viejo» está inactivo.');
  check('Los límites son los de la base (60 artículos, 99 999 unidades, 500 y 800 letras, motivo de 5 a 300)',
    REQUIREMENT_LIMITS.maxLines === 60 && REQUIREMENT_LIMITS.maxQuantity === 99999 && REQUIREMENT_LIMITS.noteMax === 500 && REQUIREMENT_LIMITS.messageMax === 800
    && REQUIREMENT_LIMITS.rejectionMin === 5 && REQUIREMENT_LIMITS.rejectionMax === 300);
}

// ------------------------------------------------------------------------------------------------------------------ Verificar existencia: solo se reduce
function reviewRules() {
  const r = req();
  check('Reducir (incluso a 0) es válido; lo pedido tal cual también', requirementReviewError(r, { A1: 8, A2: 0 }, itemName) === null && requirementReviewError(r, { A1: 10, A2: 5 }, itemName) === null);
  check('Más de lo pedido se rechaza con el nombre del artículo', requirementReviewError(r, { A1: 11, A2: 0 }, itemName) === 'Solo se puede reducir lo pedido: de «Libro 1» pidieron 10 y no se puede enviar más.');
  check('Falta una cantidad, un negativo o un decimal se rechazan',
    requirementReviewError(r, { A1: 8 }, itemName) === 'Falta indicar cuánto se enviará de «Libro 2».'
    && /0 o más/.test(requirementReviewError(r, { A1: -1, A2: 0 }, itemName) ?? '') && /0 o más/.test(requirementReviewError(r, { A1: 1.5, A2: 0 }, itemName) ?? ''));
  check('El motivo del rechazo pide 5 letras y no más de 300', requirementRejectionError('Ya') === 'Indique el motivo del rechazo (al menos 5 letras): la sede lo verá.' && requirementRejectionError('No hay stock') === null && /300/.test(requirementRejectionError('x'.repeat(301)) ?? ''));
  check('Un mensaje no puede estar vacío ni pasar de 800 letras', requirementMessageError('  ') === 'Escriba el mensaje.' && /800/.test(requirementMessageError('x'.repeat(801)) ?? '') && requirementMessageError('hola') === null);

  const rows = requirementReviewRows(r, id => ({ A1: 20, A2: 3 }[id] ?? 0), new Map([['A1', 15]]), itemName);
  check('Lo disponible es lo que hay menos lo ya comprometido (nunca negativo), y se sugiere lo pedido o lo que alcanza',
    rows[0].available === 5 && rows[0].suggested === 5 && rows[0].short && rows[1].available === 3 && rows[1].suggested === 3 && rows[1].short
    && requirementReviewRows(r, () => 100, new Map(), itemName).every(x => !x.short && x.suggested === x.requested)
    && requirementReviewRows(r, () => 2, new Map([['A1', 9]]), itemName)[0].available === 0);

  const committed = committedByItem(
    [ship({ id: 'E1', requirementId: undefined, status: 'Por armar', items: [{ itemId: 'A1', quantity: 4 }] }), ship({ id: 'E2', requirementId: undefined, status: 'En tránsito', items: [{ itemId: 'A1', quantity: 50 }] }),
      ship({ id: 'E3', requirementId: undefined, status: 'Empacando', items: [{ itemId: 'A1', quantity: 2 }, { itemId: 'A3', quantity: 1 }] })],
    [reviewed({ id: 'REQ-2026-002' }), req({ id: 'REQ-2026-003' }), reviewed({ id: 'REQ-2026-004', status: 'Rechazado' })],
  );
  check('Se cuentan las listas de los envíos que todavía no salieron y lo que se enviará de los otros requerimientos ya verificados (no los sin verificar, rechazados ni lo que ya viaja)',
    committed.get('A1') === 4 + 2 + 8 && committed.get('A3') === 1 && !committed.has('A2'));
  check('Al verificar un requerimiento no se cuenta a sí mismo ni a su propio envío',
    committedByItem([ship({ id: 'E9', status: 'Empacando' })], [reviewed({ id: 'REQ-2026-001' })], 'REQ-2026-001').size === 0);
  check('Un requerimiento verificado que ya es envío cuenta una sola vez (por su envío)',
    committedByItem([ship({ id: 'E9', requirementId: 'REQ-2026-005', status: 'Empacando', items: [{ itemId: 'A1', quantity: 8 }] })], [reviewed({ id: 'REQ-2026-005' })]).get('A1') === 8);
}

// ------------------------------------------------------------------------------------------------------------------ El tablero
function boardRules() {
  const r1 = req({ id: 'REQ-2026-001' });
  const r2 = req({ id: 'REQ-2026-002', date: '2026-11-19' });
  const rejected = req({ id: 'REQ-2026-003', status: 'Rechazado', rejectionReason: 'No hay' });
  const sent = req({ id: 'REQ-2026-004', status: 'Despachado' });
  const withShipment = req({ id: 'REQ-2026-005' });
  const shipments = [ship({ id: 'E5', requirementId: 'REQ-2026-005' }), ship({ id: 'E6', requirementId: 'REQ-2026-001', status: 'Cancelado' })];
  const board = boardRequirements([r1, r2, rejected, sent, withShipment], shipments);
  check('El tablero muestra los pendientes que todavía no son envío (un envío cancelado no cuenta), del más antiguo al más nuevo', board.map(r => r.id).join() === 'REQ-2026-002,REQ-2026-001');
  check('El envío vivo de un requerimiento es el que no está cancelado', liveShipmentOf(withShipment, shipments)?.id === 'E5' && liveShipmentOf(r1, shipments) === undefined);

  check('Parpadea solo mientras nadie abrió «Verificar existencia» y está pendiente',
    requirementNeedsAttention(r1) && !requirementNeedsAttention({ ...r1, seenAt: '2026-11-20T10:00:00Z' }) && !requirementNeedsAttention(rejected));
  check('Los totales: lo pedido y, ya verificado, lo que se enviará', requirementTotals(r1).requested === 15 && requirementTotals(r1).toSend === null
    && requirementTotals(reviewed()).toSend === 8 && requirementTotals(reviewed()).lines === 2);
  check('Lo que se envía deja afuera lo que quedó en 0', JSON.stringify(requirementSentLines(reviewed())) === JSON.stringify([{ itemId: 'A1', quantity: 8 }]));

  check('Un requerimiento solo se atiende pendiente y sin envío en preparación',
    requirementOpenError(r1, []) === null && requirementOpenError(rejected, []) === 'Este requerimiento ya fue rechazado.' && requirementOpenError(sent, []) === 'Este requerimiento ya se despachó.'
    && /ya se está armando como el envío E5/.test(requirementOpenError(withShipment, shipments) ?? ''));
  check('No pasa a «Empacando» sin verificar la existencia ni con todo en 0',
    requirementToPackingIssue(r1, []) === 'Antes de pasar el requerimiento a «Empacando» verifique la existencia: abra «Verificar existencia» y guarde las cantidades.'
    && requirementToPackingIssue(reviewed({ lines: [{ itemId: 'A1', quantity: 10, send: 0 }] }), []) === 'No hay nada que enviar: todas las cantidades están en 0. Rechace el requerimiento con su motivo.'
    && requirementToPackingIssue(reviewed(), []) === null);
  check('Solo avanza a «Empacando»: ninguna otra columna, y soltarlo donde está no hace nada',
    requirementMove(reviewed(), 'Por armar', []) === null && requirementMove(reviewed(), 'Empacando', [])?.ok === true
    && requirementMove(reviewed(), 'Por despachar', [])?.ok === false && requirementMove(reviewed(), 'En tránsito', [])?.ok === false && requirementMove(reviewed(), 'Recibido', [])?.ok === false
    && requirementMove(r1, 'Empacando', [])?.ok === false);
}

// ------------------------------------------------------------------------------------------------------------------ Lo que ve la sede
function sedeRules() {
  const shipments = [ship({ id: 'E5', requirementId: 'REQ-2026-001', status: 'En tránsito' })];
  const labels = [
    requirementSedeStatus(req(), []), requirementSedeStatus(reviewed(), []), requirementSedeStatus(req({ status: 'Rechazado', rejectionReason: 'No hay stock' }), []),
    requirementSedeStatus(reviewed({ status: 'Despachado' }), shipments),
  ];
  check('La sede ve solo tres situaciones: en Logística, rechazado (con su motivo) o despachado (con su envío)',
    labels[0].label === 'En Logística' && labels[1].label === 'En Logística' && labels[2].label === 'Rechazado' && /No hay stock/.test(labels[2].detail)
    && labels[3].label === 'Despachado' && labels[3].shipmentId === 'E5' && /E5/.test(labels[3].detail));
  const stages = ['Por armar', 'Empacando', 'Por despachar', 'En tránsito'];
  check('Lo que ve la sede nunca nombra la etapa en que está (ni antes ni después de verificar)',
    labels.slice(0, 3).every(l => !stages.some(s => l.detail.includes(s) || l.label.includes(s))));
  check('«Pidió 30 → se enviará 4»: solo aparecen las líneas que cambiaron y solo si ya se verificó',
    requirementChanges(req()).length === 0 && requirementChanges(reviewed()).map(l => l.itemId).join() === 'A1,A2'
    && requirementChanges(reviewed({ lines: [{ itemId: 'A1', quantity: 10, send: 10 }] })).length === 0);

  const messages: RequirementMessage[] = [
    { id: 1, requirementId: 'REQ-2026-001', side: 'sede', text: 'a', authorId: 'u-chi', authorName: 'Carla', createdAt: '2026-11-20T10:00:00Z' },
    { id: 3, requirementId: 'REQ-2026-001', side: 'logistica', text: 'b', authorId: 'u-alm', authorName: 'Levi', createdAt: '2026-11-20T11:00:00Z' },
    { id: 2, requirementId: 'REQ-2026-002', side: 'logistica', text: 'c', authorId: 'u-alm', authorName: 'Levi', createdAt: '2026-11-20T11:30:00Z' },
  ];
  check('Los mensajes nuevos son los de otras personas posteriores a lo último que se vio (los propios no cuentan)',
    unreadMessages(messages, 'REQ-2026-001', 0, 'u-chi') === 1 && unreadMessages(messages, 'REQ-2026-001', 0, 'u-alm') === 1 && unreadMessages(messages, 'REQ-2026-001', 3, 'u-chi') === 0
    && unreadMessages(messages, 'REQ-2026-002', 0, 'u-chi') === 1 && unreadMessages(messages, 'REQ-2026-001', 0, undefined) === 2);
  check('La conversación sale del más antiguo al más nuevo y solo admite mensajes pendiente',
    messagesOf(messages, 'REQ-2026-001').map(m => m.id).join() === '1,3' && requirementAcceptsMessages(req()) && !requirementAcceptsMessages(req({ status: 'Rechazado' })) && !requirementAcceptsMessages(req({ status: 'Despachado' })));
  check('Se busca por código, sede, artículo o quién lo armó', requirementMatches(req(), 'carla', 'Chiclayo', itemName) && requirementMatches(req(), 'chiclayo', 'Chiclayo', itemName)
    && requirementMatches(req(), 'libro 2', 'Chiclayo', itemName) && requirementMatches(req(), '2026-001', 'Chiclayo', itemName) && !requirementMatches(req(), 'piura', 'Chiclayo', itemName) && requirementMatches(req(), '  ', '', itemName));
}

// ------------------------------------------------------------------------------------------------------------------ Filas de la base y operaciones
async function dbAndService() {
  const row: RequerimientoRow = {
    id: 'REQ-2026-007', fecha: '2026-11-20', sede_id: 'FIL-003', almacen_id: 'ALM-001', lineas: [{ articulo_id: 'A1', cantidad: 10, enviar: 8 }, { articulo_id: 'A2', cantidad: 5, enviar: null }],
    nota: 'Para el lunes', estado: 'Pendiente', motivo_rechazo: null, visto_en: '2026-11-20T14:00:00Z', visto_por: 'Levi', verificado_en: null, verificado_por: null, resuelto_en: null, resuelto_por: null,
    version: 3, creado_por_id: 'u-chi', creado_en: '2026-11-20T13:00:00Z', creado_por: 'Carla',
  };
  const model = requirementFromRow(row);
  check('Una fila se traduce al modelo: sin «enviar» mientras no se verifica, con la versión y quién lo armó',
    model.id === 'REQ-2026-007' && model.branchId === 'FIL-003' && model.warehouseId === 'ALM-001' && model.lines[0].send === 8 && model.lines[1].send === undefined
    && model.note === 'Para el lunes' && model.version === 3 && model.createdById === 'u-chi' && model.seenBy === 'Levi' && model.reviewedAt === undefined && model.rejectionReason === undefined);
  check('Un mensaje y las marcas de lectura se traducen (el número de la base puede llegar como texto)',
    messageFromRow({ numero: '12', requerimiento_id: 'REQ-2026-007', lado: 'sede', texto: 'hola', autor_id: null, autor_nombre: 'Carla', creado_en: '2026-11-20T10:00:00Z' }).id === 12
    && seenFromRows([{ requerimiento_id: 'REQ-2026-007', cuenta_id: 'u', visto_hasta: '12' }])['REQ-2026-007'] === 12);
  check('Lo que se manda al armar: sede, almacén, artículos por id y la nota (sin código: lo asigna la base)',
    JSON.stringify(requirementPayload({ branchId: 'FIL-003', warehouseId: 'ALM-001', lines: [{ itemId: 'A1', quantity: 2 }], note: ' hola ' })) === JSON.stringify({ sede_id: 'FIL-003', almacen_id: 'ALM-001', lineas: [{ articulo_id: 'A1', cantidad: 2 }], nota: 'hola' })
    && !('nota' in requirementPayload({ branchId: 'FIL-003', warehouseId: 'ALM-001', lines: [{ itemId: 'A1', quantity: 2 }], note: '  ' })));
  check('Lo que se manda al verificar: de cada artículo pedido, cuánto se enviará', JSON.stringify(reviewPayload(model.lines, { A1: 4, A2: 0 })) === JSON.stringify([{ articulo_id: 'A1', enviar: 4 }, { articulo_id: 'A2', enviar: 0 }]));
  const envio = shipmentFromRow({ id: 'E1', fecha: '2026-11-20', almacen_origen_id: 'ALM-001', sede_destino_id: 'FIL-003', estado: 'Empacando', cajas: [], lineas: [], requerimiento_id: 'REQ-2026-007' } as unknown as EnvioRow);
  check('Un envío trae el requerimiento del que nació (y uno anterior no)', envio.requirementId === 'REQ-2026-007'
    && shipmentFromRow({ id: 'E2', fecha: '2026-11-20', almacen_origen_id: 'ALM-001', sede_destino_id: 'FIL-003', estado: 'Empacando', cajas: [], lineas: [] } as unknown as EnvioRow).requirementId === undefined);

  // Un repositorio en memoria que anota cada llamada
  const calls: [string, unknown[]][] = [];
  let respond: { ok: boolean; data?: unknown; error?: string } = { ok: true, data: null };
  const call = (name: string) => (...args: unknown[]) => { calls.push([name, args]); return Promise.resolve(respond as never); };
  const repo: RequirementsRepository = {
    loadAll: call('loadAll'), create: call('create'), open: call('open'), review: call('review'), reject: call('reject'), moveToPacking: call('moveToPacking'), sendMessage: call('sendMessage'), markSeen: call('markSeen'),
  };
  const ctx = (requirements: Requirement[], shipments: RequirementsContext['shipments'] = []): RequirementsContext => ({ requirements, shipments, items, itemName });
  const reset = () => { calls.length = 0; respond = { ok: true, data: null }; };

  reset(); respond = { ok: true, data: 'REQ-2026-010' };
  let res = await createRequirement(repo, ctx([]), { branchId: 'FIL-003', warehouseId: 'ALM-001', lines: [{ itemId: 'A1', quantity: 3 }] });
  check('Armar: valida, guarda y devuelve el código que asignó la base', res.ok && res.id === 'REQ-2026-010' && calls.length === 1 && calls[0][0] === 'create');
  reset(); res = await createRequirement(repo, ctx([]), { branchId: 'FIL-003', warehouseId: 'ALM-001', lines: [] });
  check('Armar vacío no llega a la base', !res.ok && calls.length === 0 && res.error === 'Agregue al menos un artículo al requerimiento.');
  reset(); respond = { ok: false, error: 'Su rol no tiene la función «Armar un requerimiento».' };
  res = await createRequirement(repo, ctx([]), { branchId: 'FIL-003', warehouseId: 'ALM-001', lines: [{ itemId: 'A1', quantity: 3 }] });
  check('Si la base rechaza, se muestra su motivo', !res.ok && /Armar un requerimiento/.test(res.error ?? ''));

  reset(); res = await openRequirementReview(repo, ctx([req()]), 'REQ-2026-001');
  check('Abrir «Verificar existencia» avisa a la base la primera vez', res.ok && calls.length === 1 && calls[0][0] === 'open');
  reset(); res = await openRequirementReview(repo, ctx([req({ seenAt: '2026-11-20T10:00:00Z' })]), 'REQ-2026-001');
  check('Si ya se había abierto, no hace falta avisar otra vez', res.ok && calls.length === 0);
  reset(); res = await openRequirementReview(repo, ctx([]), 'REQ-2026-001');
  check('Un requerimiento que no se ve se explica', !res.ok && /No se encontró el requerimiento/.test(res.error ?? '') && calls.length === 0);

  reset(); res = await reviewRequirement(repo, ctx([req({ version: 4 })]), 'REQ-2026-001', { A1: 8, A2: 0 }, 4);
  check('Verificar manda las cantidades y la versión que se vio', res.ok && calls.length === 1 && JSON.stringify(calls[0][1]) === JSON.stringify(['REQ-2026-001', [{ articulo_id: 'A1', enviar: 8 }, { articulo_id: 'A2', enviar: 0 }], 4]));
  reset(); res = await reviewRequirement(repo, ctx([req()]), 'REQ-2026-001', { A1: 11, A2: 0 });
  check('Verificar con más de lo pedido no llega a la base', !res.ok && calls.length === 0 && /Solo se puede reducir/.test(res.error ?? ''));
  reset(); res = await reviewRequirement(repo, ctx([req({ status: 'Rechazado' })]), 'REQ-2026-001', { A1: 8, A2: 0 });
  check('Un requerimiento rechazado ya no se verifica', !res.ok && calls.length === 0);
  reset(); respond = { ok: false, error: REQUIREMENT_STALE_MESSAGE };
  res = await reviewRequirement(repo, ctx([req()]), 'REQ-2026-001', { A1: 8, A2: 0 }, 1);
  check('Si otra persona lo cambió, se muestra el aviso de la base', !res.ok && res.error === REQUIREMENT_STALE_MESSAGE);

  reset(); res = await rejectRequirement(repo, ctx([req()]), 'REQ-2026-001', 'Ya', 1);
  check('Rechazar sin motivo suficiente no llega a la base', !res.ok && calls.length === 0 && res.error === requirementRejectionError('Ya'));
  reset(); res = await rejectRequirement(repo, ctx([req()]), 'REQ-2026-001', '  No hay stock hasta fin de mes ', 2);
  check('Rechazar manda el motivo (sin espacios) y la versión', res.ok && JSON.stringify(calls[0]) === JSON.stringify(['reject', ['REQ-2026-001', 'No hay stock hasta fin de mes', 2]]));

  reset(); res = await moveRequirementToPacking(repo, ctx([req()]), 'REQ-2026-001');
  check('Pasar a «Empacando» sin verificar la existencia no llega a la base', !res.ok && calls.length === 0 && /verifique la existencia/.test(res.error ?? ''));
  reset(); respond = { ok: true, data: 'ENV-2026-004' };
  res = await moveRequirementToPacking(repo, ctx([reviewed({ version: 6 })]), 'REQ-2026-001', 6);
  check('Pasar a «Empacando» devuelve el código del envío que nació y manda la versión', res.ok && res.id === 'ENV-2026-004' && JSON.stringify(calls[0]) === JSON.stringify(['moveToPacking', ['REQ-2026-001', 6]]));
  reset(); res = await moveRequirementToPacking(repo, ctx([reviewed()], [ship({ id: 'E7' })]), 'REQ-2026-001');
  check('Si ya se arma como envío, se explica cuál y no se crea otro', !res.ok && calls.length === 0 && /envío E7/.test(res.error ?? ''));

  reset(); res = await sendRequirementMessage(repo, ctx([req()]), 'REQ-2026-001', '  Necesito 2 más ');
  check('Un mensaje se manda sin espacios sobrantes', res.ok && JSON.stringify(calls[0]) === JSON.stringify(['sendMessage', ['REQ-2026-001', 'Necesito 2 más']]));
  reset(); res = await sendRequirementMessage(repo, ctx([req({ status: 'Despachado' })]), 'REQ-2026-001', 'hola');
  check('Un requerimiento cerrado no admite mensajes (y no llega a la base)', !res.ok && calls.length === 0 && /ya está cerrado/.test(res.error ?? ''));
  reset(); res = await sendRequirementMessage(repo, ctx([req()]), 'REQ-2026-001', '   ');
  check('Un mensaje vacío no llega a la base', !res.ok && calls.length === 0 && res.error === 'Escriba el mensaje.');
  reset(); res = await markRequirementSeen(repo, 'REQ-2026-001');
  check('Marcar como visto llama a la base', res.ok && calls[0][0] === 'markSeen');
}

// ------------------------------------------------------------------------------------------------------------------ La migración 0031
function migration() {
  const mig = read('supabase/migrations/20261121100000_requerimientos_de_las_sedes.sql');
  const down = read('supabase/deshacer/20261121100000_requerimientos_de_las_sedes.down.sql');
  const fns = [...mig.matchAll(/app\.exigir\('([a-z0-9-]+:[a-z_]+)'/g)].map(m => m[1]);
  check('La base pide solo funciones que existen en el registro (ver, armar, atender, escribir y preparar envíos)',
    fns.length > 0 && fns.every(f => !!capabilityById(f)) && ['log-requerimientos:create', 'log-requerimientos:attend', 'log-requerimientos:message', 'log-envios:create'].every(f => fns.includes(f)));
  check('Hay tres tablas y ninguna se escribe directo: solo lectura con seguridad por fila',
    /create table public\.requerimientos \(/.test(mig) && /create table public\.requerimiento_mensajes \(/.test(mig) && /create table public\.requerimiento_lecturas \(/.test(mig)
    && /grant select on public\.requerimientos, public\.requerimiento_mensajes, public\.requerimiento_lecturas to authenticated/.test(mig) && !/grant (insert|update|delete)[^;]*requerimiento/.test(mig)
    && /alter table public\.requerimientos\s+enable row level security/.test(mig) && /alter table public\.requerimiento_mensajes\s+enable row level security/.test(mig) && /alter table public\.requerimiento_lecturas\s+enable row level security/.test(mig));
  check('La sede lee los suyos y Logística todos (ver requerimientos + alcanzar la sede o ver el almacén); cada cuenta lee solo sus marcas de lectura',
    /app\.tiene_funcion\('log-requerimientos:view'\)/.test(mig) && /app\.puede_ver_ubicacion\(requerimientos\.sede_id, null::text\)/.test(mig) && /app\.puede_ver_ubicacion\(null::text, requerimientos\.almacen_id\)/.test(mig)
    && /requerimiento_lecturas_leer on public\.requerimiento_lecturas for select to authenticated using \(cuenta_id = \(select auth\.uid\(\)\)\)/.test(mig));
  check('Los textos de la base son los mismos que los del sistema (la pantalla avisa antes y la base decide)',
    [
      'Agregue al menos un artículo al requerimiento.', 'Hay un artículo sin seleccionar.', 'La cantidad debe ser un número entero mayor a 0.', 'La cantidad pedida no puede pasar de 99 999 unidades por artículo.',
      'Hay artículos repetidos en el requerimiento.', 'Un artículo no existe en el catálogo.', 'Indique el motivo del rechazo (al menos 5 letras): la sede lo verá.', 'Escriba el mensaje.',
      REQUIREMENT_STALE_MESSAGE, 'Este requerimiento ya fue rechazado.', 'Este requerimiento ya se despachó.', 'Indique la sede que pide.', 'Los requerimientos se piden al almacén central.',
      requirementToPackingIssue(req(), []) as string, requirementToPackingIssue(reviewed({ lines: [{ itemId: 'A1', quantity: 1, send: 0 }] }), []) as string,
    ].every(t => mig.includes(t)));
  check('La base repite los mismos límites (60 artículos, 99 999 unidades, 500 de nota, 800 de mensaje, motivo de 5 a 300)',
    /> 60 then/.test(mig) && /v_cant > 99999/.test(mig) && /length\(v_nota\) > 500/.test(mig) && /length\(v_texto\) > 800/.test(mig) && /length\(v_motivo\) < 5/.test(mig) && /length\(v_motivo\) > 300/.test(mig));
  check('Solo se reduce: «enviar» no puede pasar de lo pedido, y no se atiende lo rechazado, lo despachado ni lo que ya se arma como envío',
    /if v_enviar > v_cant then/.test(mig) && /r\.estado = 'Rechazado'/.test(mig) && /r\.estado = 'Despachado'/.test(mig) && /e\.requerimiento_id = r\.id and e\.estado <> 'Cancelado'/.test(mig));
  check('Pasar a «Empacando» crea el envío enlazado, en «Empacando», con lo que se enviará (lo que quedó en 0 no entra), y exige haber verificado la existencia',
    /insert into public\.envios[\s\S]*'Empacando'[\s\S]*requerimiento_id/.test(mig) && /where coalesce\(\(l->>'enviar'\)::integer, 0\) > 0/.test(mig) && /if r\.verificado_en is null then/.test(mig));
  check('Un envío vivo por requerimiento; su destino y su requerimiento no cambian; al despachar el requerimiento pasa a «Despachado» con lo que salió y al cancelar vuelve a «Pendiente»',
    /create unique index envios_requerimiento_vivo_uq on public\.envios \(requerimiento_id\) where requerimiento_id is not null and estado <> 'Cancelado'/.test(mig)
    && /create trigger envios_requerimiento_guardar before update on public\.envios/.test(mig) && /estado = 'Despachado'/.test(mig) && /set estado = 'Pendiente' where r\.id = new\.requerimiento_id and r\.estado = 'Despachado'/.test(mig));
  check('Abrir «Verificar existencia» no cambia la versión; el contenido sí', /- 'visto_en' - 'visto_por' - 'version'/.test(mig) && /new\.version := old\.version \+ 1/.test(mig));
  check('Un mensaje no se modifica ni se borra, solo se escribe con el requerimiento pendiente y lo propio no cuenta como nuevo',
    /create trigger requerimiento_mensajes_no_cambian before update or delete/.test(mig) && /create trigger requerimiento_mensajes_no_vaciar  before truncate/.test(mig)
    && /if r\.estado <> 'Pendiente' then raise exception 'Este requerimiento ya está cerrado: no admite más mensajes\.'/.test(mig) && /insert into public\.requerimiento_lecturas as l/.test(mig));
  check('Los roles que ya recibían envíos reciben ver, armar y escribir, y los que ya preparaban envíos, ver, atender y escribir',
    /where rf\.funcion_id = 'log-recepciones:confirm'/.test(mig) && /where rf\.funcion_id = 'log-envios:create'/.test(mig) && /\('log-requerimientos:create'\), \('log-requerimientos:message'\)/.test(mig) && /\('log-requerimientos:attend'\)/.test(mig));
  check('Las dos tablas entran a la publicación de tiempo real solo si existe y si todavía no estaban',
    /pg_publication where pubname = 'supabase_realtime'/.test(mig) && /alter publication supabase_realtime add table public\.requerimientos;/.test(mig) && /alter publication supabase_realtime add table public\.requerimiento_mensajes;/.test(mig)
    && /not exists \(select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'requerimientos'\)/.test(mig));
  check('Las funciones públicas son de las cuentas con sesión (no de los anónimos) y lo interno no se llama de fuera',
    /revoke execute on function\s+public\.crear_requerimiento\(jsonb\)[\s\S]*from public, anon;/.test(mig) && /grant execute on function\s+public\.crear_requerimiento\(jsonb\)[\s\S]*to authenticated;/.test(mig)
    && /revoke execute on function\s+app\.requerimiento_subir_version\(\)[\s\S]*from public, anon, authenticated;/.test(mig));
  check('Se puede deshacer: tablas, funciones, enlace del envío, funciones de los roles y publicación',
    /drop table public\.requerimientos;/.test(down) && /drop table public\.requerimiento_mensajes;/.test(down) && /drop table public\.requerimiento_lecturas;/.test(down) && /drop column requerimiento_id/.test(down)
    && /delete from public\.rol_funciones where funcion_id in \('log-requerimientos:view'/.test(down) && /alter publication supabase_realtime drop table public\.requerimientos/.test(down)
    && /drop function public\.crear_requerimiento\(jsonb\)/.test(down) && /drop function app\.requerimiento_abierto\(public\.requerimientos, integer\);\n/.test(down) && down.indexOf('drop function app.requerimiento_abierto') < down.indexOf('\ndrop table public.requerimientos;'));
}

// ------------------------------------------------------------------------------------------------------------------ Registro, roles, avisos y pantallas
function registryAndScreens() {
  const caps = ALL_CAPABILITIES.filter(c => c.functionality === 'log-requerimientos');
  check('El registro tiene las cuatro funciones de requerimientos con sus acciones del contexto',
    caps.map(c => c.id).sort().join() === 'log-requerimientos:attend,log-requerimientos:create,log-requerimientos:message,log-requerimientos:view'
    && capabilityById('log-requerimientos:create')?.actions.join() === 'addRequirement' && capabilityById('log-requerimientos:message')?.actions.join() === 'addRequirementMessage'
    && ['openRequirementReview', 'reviewRequirement', 'rejectRequirement', 'moveRequirementToPacking'].every(a => capabilityById('log-requerimientos:attend')?.actions.includes(a)));
  check('Atender requerimientos necesita ver envíos, preparar un envío (nace uno) y ver el stock; armar uno necesita ver Recepciones',
    ['log-envios:view', 'log-envios:create', 'log-stock:view'].every(f => capabilityById('log-requerimientos:attend')?.requires.includes(f)) && capabilityById('log-requerimientos:create')?.requires.includes('log-recepciones:view'));
  check('Ver el requerimiento y marcar como vistos los mensajes son consultas propias (no funciones que se repartan)', 'reloadRequirements' in NON_CAPABILITY_ACTIONS && 'markRequirementMessagesSeen' in NON_CAPABILITY_ACTIONS);
  const admin = ROLE_TEMPLATES.find(t => t.id === 'admin-sede')!;
  const store = ROLE_TEMPLATES.find(t => t.id === 'almacen-central')!;
  check('El administrador de sede arma, ve y escribe; el almacén atiende, ve y escribe (y la sede NO atiende ni el almacén arma)',
    ['log-requerimientos:view', 'log-requerimientos:create', 'log-requerimientos:message'].every(f => admin.capabilities.includes(f)) && !admin.capabilities.includes('log-requerimientos:attend')
    && ['log-requerimientos:view', 'log-requerimientos:attend', 'log-requerimientos:message'].every(f => store.capabilities.includes(f)) && !store.capabilities.includes('log-requerimientos:create'));
  const events = ['requirement_created', 'requirement_rejected', 'requirement_message_to_logistics', 'requirement_message_to_sede'];
  check('Los cuatro avisos existen, los dispara alguna función y están en el archivo de eventos que carga la base',
    events.every(e => EVENTS.some(x => x.id === e) && ALL_CAPABILITIES.some(c => c.emits.includes(e)) && read('supabase/seed/avisos_eventos.sql').includes(`'${e}'`)));
  const ctx = read('src/context/DataContext.tsx');
  check('El contexto avisa al armar, al rechazar y al escribir (una consecuencia: si falla no deshace la acción) y refresca los envíos al pasar a «Empacando»',
    /notify\('requirement_created'/.test(ctx) && /notify\('requirement_rejected'/.test(ctx) && /fromLogistics \? 'requirement_message_to_sede' : 'requirement_message_to_logistics'/.test(ctx)
    && /const moved[\s\S]*await log\.refreshDocuments\(\)/.test(ctx.replace('moveRequirementToPacking: DataContextType', 'const moved')));

  const board = read('src/components/logistics/ShipmentBoard.tsx');
  const shipments = read('src/pages/logistics/Shipments.tsx');
  const card = read('src/components/logistics/RequirementCard.tsx');
  const css = read('src/index.css');
  check('El tablero muestra los requerimientos solo en «Por armar», con su tarjeta; se arrastran a «Empacando» y la columna cuenta ambas clases',
    /col\.id === 'Por armar' \? requirements : \[\]/.test(board) && /<RequirementCard/.test(board) && /requirementMove\(draggedReq, over, everyShipment\)/.test(board) && /\+ reqCards\.length/.test(board)
    && /onRequirementMove\?\.\(r, column\)/.test(board));
  check('Envíos pasa solo los pendientes sin envío al tablero y mueve el requerimiento con su versión; «Verificar existencia» y el detalle se abren desde la tarjeta',
    /boardRequirements\(requirements, shipments\)/.test(shipments) && /moveRequirementToPacking\(r\.id, r\.version\)/.test(shipments) && /<RequirementReviewModal requirementId=\{reviewId\}/.test(shipments) && /<RequirementDetailModal/.test(shipments)
    && /Falta verificar la existencia/.test(shipments));
  check('La tarjeta parpadea solo mientras nadie abrió «Verificar existencia» y solo 4 veces (no permanente); respeta a quien pide menos movimiento',
    /requirementNeedsAttention\(r\)/.test(card) && /\$\{blink \? 'req-blink' : ''\}/.test(card) && /\.req-blink \{ animation: req-blink 1\.2s ease-in-out 4; \}/.test(css) && /prefers-reduced-motion: reduce\) \{\s*\.req-blink \{ animation: none/.test(css));
  const review = read('src/components/logistics/RequirementReviewModal.tsx');
  check('«Verificar existencia» avisa a la base al abrirla, no deja subir lo pedido, pide la versión vista, avisa si otra persona la cambió y rechaza con motivo',
    /openRequirementReview\(requirementId\)/.test(review) && /max=\{r\.requested\}/.test(review) && /requirementReviewError\(req, values, itemName\)/.test(review) && /reviewRequirement\(req\.id, values, seenVersion\.current\)/.test(review)
    && /REQUIREMENT_STALE_MESSAGE/.test(review) && /<ReasonDialog/.test(review) && /rejectRequirement\(req\.id, detail, seenVersion\.current\)/.test(review));
  const inbox = read('src/components/logistics/RequirementsInbox.tsx');
  const detail = read('src/components/logistics/RequirementDetailModal.tsx');
  check('Lo que ve la sede (su lista y el detalle) nunca nombra una etapa de la preparación',
    !/Por armar|Empacando|Por despachar/.test(inbox) && /requirementSedeStatus/.test(inbox) && /requirementChanges/.test(inbox)
    && !/Por armar|Por despachar/.test(detail) && !/Empacando/.test(detail.replace(/falta pasarlo a «Empacando»/, '')));
  const receptions = read('src/pages/logistics/Receptions.tsx');
  check('Recepciones tiene «Armar requerimiento» (solo con la función), la pestaña «Requerimientos» y se mantiene al día en vivo; los envíos pedidos por la sede lo dicen',
    /can\('log-requerimientos:create'\)/.test(receptions) && /Armar requerimiento/.test(receptions) && /<RequirementsInbox branchId=\{currentBranchId\}/.test(receptions) && /Pedido por la sede/.test(receptions)
    && /reloadRequirements\(\)\]\); \}\)/.test(receptions));
  const thread = read('src/components/logistics/RequirementThread.tsx');
  check('La conversación marca como vistos los mensajes que llegan mientras está abierta y solo deja escribir con la función y con el requerimiento pendiente',
    /markRequirementMessagesSeen\(requirementId\)/.test(thread) && /can\('log-requerimientos:message'\) && !!req && requirementAcceptsMessages\(req\)/.test(thread) && /Nuevo/.test(thread));
  const work = read('src/components/logistics/ShipmentWorkModal.tsx');
  check('La ventana del envío dice de qué requerimiento viene y abre su detalle con los mensajes', /shipment\.requirementId &&/.test(work) && /<RequirementDetailModal requirementId=\{requirementOpen \? shipment\.requirementId : null\}/.test(work));
}

draftRules();
reviewRules();
boardRules();
sedeRules();
await dbAndService();
migration();
registryAndScreens();

if (failed > 0) {
  console.log(`\n${failed} comprobaciones fallaron.`);
  process.exit(1);
}
console.log('\nTodas las comprobaciones pasaron.');
