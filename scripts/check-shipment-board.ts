/**
 * Verificación del tablero de envíos de Logística (Por armar → Empacando → Por despachar → En tránsito → Recibido):
 *  - las columnas y en cuál cae cada envío; el orden de las tarjetas;
 *  - qué datos pide cada columna para salir de ella y qué se puede cambiar en cada una (la base lo repite: migración 0029, con los mismos textos);
 *  - qué tarjeta se puede mover a dónde: de a una columna hacia adelante con los datos completos, libre hacia atrás hasta «Por despachar»,
 *    despachar pide confirmación y desde «En tránsito» no hay marcha atrás;
 *  - lo que viaja a la base y cómo se lee de ella;
 *  - la pantalla: el interruptor Tarjetas ↔ Tablero a la izquierda de «Crear envío», el tablero como vista principal, arrastrar y soltar, y la sede destino que
 *    no ve la preparación.
 * Ejecutar: npx tsx scripts/check-shipment-board.ts
 */
import { readFileSync } from 'node:fs';
import type { Shipment } from '../src/context/DataContext';
import {
  boxesProgressError, boxesRemaining, isPreDispatch, PRE_DISPATCH_STATUSES, SHIPMENT_FLOW, SHIPMENT_EDITABLE_FIELDS, shipmentContentError, shipmentMovesStock, shipmentPatchError,
  shipmentStageError, shipmentStageMissing, shipmentTransitionError, stockShortages, transportError, detailError, type TransportCatalog,
} from '../src/utils/logisticsDocs';
import { BOARD_COLUMNS, BOARD_RECEIVED_LIMIT, boardMove, cardPending, columnOf, groupByColumn, shipmentTotals } from '../src/utils/shipmentBoard';
import { shipmentFromRow, shipmentPayload, type EnvioRow } from '../src/utils/stockDb';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : ` -> ${detail}`}`);
  if (!ok) failed++;
};
const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

const cat: TransportCatalog = { methods: [{ id: 'SM-001', name: 'Courier' }, { id: 'SM-002', name: 'Viajero' }, { id: 'SM-003', name: 'Recojo en agencia' }], couriers: [{ id: 'COUR-001' }], itemIds: ['A', 'B'] };
const box = (n: number, lines: { itemId: string; quantity: number }[]) => ({ id: `box-${n}`, boxNumber: String(n), items: lines });
const ship = (status: Shipment['status'], extra: Partial<Shipment> = {}): Shipment => ({
  id: 'ENV-2026-001', date: '2026-11-18', originId: 'ALM-001', destinationId: 'FIL-003', status,
  items: [{ itemId: 'A', quantity: 10 }, { itemId: 'B', quantity: 5 }],
  boxes: [box(1, [{ itemId: 'A', quantity: 7 }, { itemId: 'B', quantity: 5 }]), box(2, [{ itemId: 'A', quantity: 3 }])],
  shippingMethodId: 'SM-001', courierId: 'COUR-001', trackingNumber: 'G-1', eta: '2026-11-20', etaTime: '18:00', ...extra,
});
const armar = ship('Por armar', { boxes: [], shippingMethodId: undefined, courierId: undefined, trackingNumber: undefined, eta: undefined, etaTime: undefined });
const empacando = ship('Empacando', { shippingMethodId: undefined, courierId: undefined, trackingNumber: undefined, eta: undefined, etaTime: undefined });
const despachar = ship('Por despachar');

// ------------------------------------------------------------------------------------------------------------------ Columnas
check('Las columnas son Por armar, Empacando, Por despachar, En tránsito y Recibido, en ese orden', BOARD_COLUMNS.map(c => c.id).join() === 'Por armar,Empacando,Por despachar,En tránsito,Recibido');
check('Cada columna dice para qué sirve', BOARD_COLUMNS.every(c => c.hint.length > 5));
check('«Listo para recepción» se ve dentro de «En tránsito» y «Recibido con diferencias» dentro de «Recibido»; lo cancelado no está en el tablero',
  columnOf('Listo para recepción') === 'En tránsito' && columnOf('Recibido con diferencias') === 'Recibido' && columnOf('Cancelado') === null && columnOf('Por armar') === 'Por armar' && columnOf('En tránsito') === 'En tránsito');
check('Los estados de preparación son los tres primeros y el stock todavía no salió',
  PRE_DISPATCH_STATUSES.join() === 'Por armar,Empacando,Por despachar' && isPreDispatch('Empacando') && !isPreDispatch('En tránsito') && !isPreDispatch('Recibido')
  && PRE_DISPATCH_STATUSES.every(s => !SHIPMENT_FLOW[s].includes('Recibido')) && !shipmentMovesStock('Por armar', 'Empacando'));

const many: Shipment[] = [
  ship('Por armar', { id: 'ENV-2026-003', date: '2026-11-19' }), ship('Por armar', { id: 'ENV-2026-001', date: '2026-11-17' }), ship('Por armar', { id: 'ENV-2026-002', date: '2026-11-17' }),
  ship('En tránsito', { id: 'ENV-2026-010', eta: '2026-11-25' }), ship('En tránsito', { id: 'ENV-2026-011', eta: '2026-11-21' }), ship('Listo para recepción', { id: 'ENV-2026-012', eta: '2026-11-21', etaTime: '09:00' }),
  ship('Cancelado', { id: 'ENV-2026-020' }), ship('Recibido con diferencias', { id: 'ENV-2026-030', date: '2026-11-01' }),
  ...Array.from({ length: 14 }, (_, i) => ship('Recibido', { id: `ENV-2026-1${String(i).padStart(2, '0')}`, date: `2026-10-${String(i + 1).padStart(2, '0')}` })),
];
const g = groupByColumn(many);
check('Lo que se prepara va del más antiguo al más nuevo (primero en entrar, primero en salir)', g['Por armar'].map(s => s.id).join() === 'ENV-2026-001,ENV-2026-002,ENV-2026-003');
check('Lo que viaja va por fecha de llegada (lo que llega antes, primero)', g['En tránsito'].map(s => s.id).join() === 'ENV-2026-012,ENV-2026-011,ENV-2026-010');
check('Lo cancelado no entra en ninguna columna', Object.values(g).every(list => !list.some(s => s.id === 'ENV-2026-020')));
check(`De lo recibido solo se muestran los últimos ${BOARD_RECEIVED_LIMIT} (lo más reciente primero)`, g.Recibido.length === BOARD_RECEIVED_LIMIT && g.Recibido[0].id === 'ENV-2026-030' && g.Recibido[1].id === 'ENV-2026-113', g.Recibido.map(s => s.id).join());
check('Una tarjeta dice cuántas cajas, artículos y unidades lleva', JSON.stringify(shipmentTotals(despachar)) === JSON.stringify({ boxes: 2, lines: 2, units: 15 }));

// ------------------------------------------------------------------------------------------------------------------ Datos de cada columna
check('«Por armar» pide la filial de destino y al menos un artículo válido',
  shipmentStageMissing(armar, 'Por armar', cat).length === 0 && shipmentStageMissing({ ...armar, destinationId: '' }, 'Por armar', cat)[0] === 'Indique la filial de destino.'
  && shipmentStageMissing({ ...armar, items: [] }, 'Por armar', cat)[0] === 'Debe agregar al menos un artículo.' && !!shipmentStageError({ ...armar, items: [{ itemId: 'A', quantity: 0 }] }, 'Por armar', cat)
  && !!shipmentStageError({ ...armar, items: [{ itemId: 'A', quantity: 1 }, { itemId: 'A', quantity: 2 }] }, 'Por armar', cat) && !!shipmentStageError({ ...armar, items: [{ itemId: 'NO', quantity: 1 }] }, 'Por armar', cat));
check('«Empacando» pide todo repartido en cajas: sin cajas o con cajas que no suman la lista no se sale',
  shipmentStageMissing(empacando, 'Empacando', cat).length === 0 && shipmentStageMissing({ ...empacando, boxes: [] }, 'Empacando', cat)[0] === 'Debe agregar al menos una caja con sus artículos.'
  && shipmentStageMissing({ ...empacando, boxes: [box(1, [{ itemId: 'A', quantity: 6 }])] }, 'Empacando', cat)[0] === 'Las cantidades de las cajas no coinciden con el detalle.');
check('«Por despachar» pide fecha y hora de llegada y el transporte del método elegido',
  shipmentStageMissing(despachar, 'Por despachar', cat).length === 0
  && shipmentStageMissing({ ...despachar, eta: undefined }, 'Por despachar', cat)[0] === 'Indique la fecha y la hora de llegada.' && shipmentStageMissing({ ...despachar, etaTime: undefined }, 'Por despachar', cat)[0] === 'Indique la fecha y la hora de llegada.'
  && shipmentStageMissing({ ...despachar, shippingMethodId: undefined }, 'Por despachar', cat).includes('Elija el método de envío.')
  && shipmentStageMissing({ ...despachar, courierId: undefined }, 'Por despachar', cat).includes(transportError({ name: 'Courier' }, {}, true)!)
  && shipmentStageMissing({ ...despachar, shippingMethodId: 'SM-002', courierId: undefined, trackingNumber: undefined }, 'Por despachar', cat)[0] === 'Para envíos por Viajero, debe ingresar el nombre de la persona que transporta.'
  && shipmentStageMissing({ ...despachar, shippingMethodId: 'SM-003', courierId: undefined, trackingNumber: undefined }, 'Por despachar', cat)[0] === 'Debe ingresar una observación para el método de envío seleccionado.');
check('Una tarjeta recién llegada a «Empacando» o a «Por despachar» sin sus datos tiene la marca de «datos pendientes»; en «Por armar» (completa) y las que ya salieron, no',
  cardPending(armar, cat).length === 0 && cardPending({ ...empacando, boxes: [] }, cat).length > 0 && cardPending({ ...despachar, eta: undefined }, cat).length > 0 && cardPending(ship('En tránsito'), cat).length === 0
  && cardPending(ship('Recibido'), cat).length === 0 && cardPending(despachar, cat).length === 0);
check('Para despachar hacen falta los datos de las tres columnas (y el primero que falta es el que se avisa)',
  shipmentContentError(despachar, cat) === null && shipmentContentError({ ...despachar, boxes: [] }, cat) === 'Debe agregar al menos una caja con sus artículos.'
  && shipmentContentError({ ...despachar, items: [] }, cat) === 'Debe agregar al menos un artículo.' && shipmentContentError({ ...despachar, eta: undefined }, cat) === 'Indique la fecha y la hora de llegada.');
check('Cuánto falta repartir en cajas, por artículo', JSON.stringify(boxesRemaining(armar.items, [box(1, [{ itemId: 'A', quantity: 4 }])])) === JSON.stringify([{ itemId: 'A', quantity: 6 }, { itemId: 'B', quantity: 5 }])
  && boxesRemaining(despachar.items, despachar.boxes).length === 0);
check('Las cajas a medias se guardan mientras no tengan más que la lista ni artículos de otra lista ni cajas vacías',
  boxesProgressError(armar.items, [box(1, [{ itemId: 'A', quantity: 3 }])]) === null
  && boxesProgressError(armar.items, [box(1, [{ itemId: 'A', quantity: 11 }])]) === 'Hay más unidades en las cajas que en la lista del envío.'
  && boxesProgressError(armar.items, [box(1, [{ itemId: 'A', quantity: 6 }]), box(2, [{ itemId: 'A', quantity: 5 }])]) === 'Hay más unidades en las cajas que en la lista del envío.'
  && boxesProgressError(armar.items, [box(1, [{ itemId: 'Z', quantity: 1 }])]) === 'Hay un artículo en las cajas que no está en la lista del envío.'
  && boxesProgressError(armar.items, [box(1, [])]) === 'La caja 1 no puede estar vacía.' && boxesProgressError(armar.items, [box(1, [{ itemId: 'A', quantity: 0 }])]) === 'La cantidad debe ser mayor a 0 en la caja 1.');
check('El stock que no alcanza solo avisa (la base decide al despachar)', JSON.stringify(stockShortages(despachar.items, id => (id === 'A' ? 4 : 99))) === JSON.stringify([{ itemId: 'A', needed: 10, available: 4 }]) && stockShortages(despachar.items, () => 99).length === 0
  && stockShortages(despachar.items, () => -3).length === 2);

// ------------------------------------------------------------------------------------------------------------------ Qué se cambia en cada columna
check('En cada columna solo se cambian sus datos: la lista en «Por armar», las cajas en «Empacando», el transporte y la llegada en «Por despachar»',
  shipmentPatchError('Por armar', { items: [] }) === null && shipmentPatchError('Por armar', { destinationId: 'FIL-002', observation: 'x', status: 'Empacando' }) === null
  && /solo se arman en «Empacando»/.test(shipmentPatchError('Por armar', { boxes: [] }) ?? '') && /«Por despachar»/.test(shipmentPatchError('Por armar', { eta: '2026-11-20' }) ?? '')
  && shipmentPatchError('Empacando', { boxes: [] }) === null && /solo se cambian en «Por armar»/.test(shipmentPatchError('Empacando', { items: [] }) ?? '') && /«Por despachar»/.test(shipmentPatchError('Empacando', { trackingNumber: 'x' }) ?? '')
  && shipmentPatchError('Por despachar', { eta: '2026-11-20', etaTime: '09:00', shippingMethodId: 'SM-001', courierId: 'COUR-001', trackingNumber: 'x', travelerName: 'y', shippingObservation: 'z' }) === null
  && /solo se cambian en «Por armar»/.test(shipmentPatchError('Por despachar', { destinationId: 'FIL-002' }) ?? '') && /solo se arman en «Empacando»/.test(shipmentPatchError('Por despachar', { boxes: [] }) ?? ''));
check('Un envío despachado solo habilita la recepción manual; uno cerrado no se toca',
  shipmentPatchError('En tránsito', { manualEnable: true }) === null && shipmentPatchError('Listo para recepción', { manualEnable: true }) === null
  && /ya no se edita/.test(shipmentPatchError('En tránsito', { items: [] }) ?? '') && /ya no se edita/.test(shipmentPatchError('En tránsito', { status: 'Empacando' }) ?? '')
  && shipmentPatchError('En tránsito', { status: 'En tránsito' }) === null && /cerrado/.test(shipmentPatchError('Recibido', { manualEnable: true }) ?? '') && /cerrado/.test(shipmentPatchError('Cancelado', { items: [] }) ?? ''));
check('Los datos editables de cada columna no se pisan entre sí (la lista, las cajas y el transporte son de una sola columna)',
  (['items', 'destinationId'] as const).every(k => SHIPMENT_EDITABLE_FIELDS['Por armar'].includes(k) && !SHIPMENT_EDITABLE_FIELDS.Empacando.includes(k) && !SHIPMENT_EDITABLE_FIELDS['Por despachar'].includes(k))
  && SHIPMENT_EDITABLE_FIELDS.Empacando.includes('boxes') && !SHIPMENT_EDITABLE_FIELDS['Por armar'].includes('boxes') && !SHIPMENT_EDITABLE_FIELDS['Por despachar'].includes('boxes')
  && (['eta', 'etaTime', 'shippingMethodId', 'courierId', 'trackingNumber'] as const).every(k => SHIPMENT_EDITABLE_FIELDS['Por despachar'].includes(k) && !SHIPMENT_EDITABLE_FIELDS['Por armar'].includes(k) && !SHIPMENT_EDITABLE_FIELDS.Empacando.includes(k)));

// ------------------------------------------------------------------------------------------------------------------ Mover tarjetas
check('Soltar una tarjeta donde ya está no hace nada', boardMove(armar, 'Por armar', cat) === null && boardMove(ship('Listo para recepción'), 'En tránsito', cat) === null);
const m1 = boardMove(armar, 'Empacando', cat);
check('Con la lista completa, «Por armar» pasa a «Empacando»', !!m1 && m1.ok && m1.to === 'Empacando' && !m1.confirm);
const m2 = boardMove({ ...armar, items: [] }, 'Empacando', cat);
check('Sin la lista no pasa y dice qué falta', !!m2 && !m2.ok && m2.error === 'Debe agregar al menos un artículo.' && m2.missing?.length === 1);
const m3 = boardMove(armar, 'Por despachar', cat);
check('No se salta una columna: se avanza de a una', !!m3 && !m3.ok && /Avance de a una columna: pase la tarjeta a «Empacando» primero/.test(m3.error ?? ''));
check('Con todo en cajas, «Empacando» pasa a «Por despachar»; con cajas incompletas, no',
  boardMove(empacando, 'Por despachar', cat)?.ok === true && boardMove(empacando, 'Por despachar', cat)?.to === 'Por despachar' && boardMove({ ...empacando, boxes: [box(1, [{ itemId: 'A', quantity: 1 }])] }, 'Por despachar', cat)?.ok === false);
const m4 = boardMove(despachar, 'En tránsito', cat);
check('Despachar (soltar en «En tránsito») pide confirmación: ya no hay marcha atrás', !!m4 && m4.ok && m4.to === 'En tránsito' && m4.confirm === 'dispatch');
const m5 = boardMove({ ...despachar, eta: undefined }, 'En tránsito', cat);
check('No se despacha sin fecha y hora de llegada', !!m5 && !m5.ok && /fecha y la hora de llegada/.test(m5.error ?? '') && !m5.confirm);
check('No se despacha sin el transporte', boardMove({ ...despachar, courierId: undefined }, 'En tránsito', cat)?.ok === false && boardMove({ ...despachar, shippingMethodId: undefined }, 'En tránsito', cat)?.ok === false);
check('Hacia atrás se vuelve libremente hasta «Por despachar» (no se piden datos)',
  boardMove(despachar, 'Empacando', cat)?.to === 'Empacando' && boardMove(despachar, 'Por armar', cat)?.to === 'Por armar' && boardMove(empacando, 'Por armar', cat)?.to === 'Por armar'
  && boardMove({ ...despachar, eta: undefined, boxes: [] }, 'Por armar', cat)?.ok === true);
const back = boardMove(ship('En tránsito'), 'Por despachar', cat);
check('Desde «En tránsito» no hay marcha atrás: solo se cancela con su motivo', !!back && !back.ok && /no vuelve atrás/.test(back.error ?? '') && /cancélelo con su motivo/.test(back.error ?? '')
  && boardMove(ship('Listo para recepción'), 'Empacando', cat)?.ok === false);
check('«Recibido» no se arrastra: lo mueve la sede al confirmar la recepción; lo recibido y lo cancelado no se mueven',
  boardMove(despachar, 'Recibido', cat)?.ok === false && boardMove(ship('En tránsito'), 'Recibido', cat)?.ok === false && boardMove(ship('Recibido'), 'Por armar', cat)?.ok === false && boardMove(ship('Cancelado'), 'Por armar', cat)?.ok === false);
check('Lo que el tablero permite coincide con el flujo de estados (nunca ofrece un paso que el flujo prohíbe)',
  (['Por armar', 'Empacando', 'Por despachar'] as const).every(from => (['Por armar', 'Empacando', 'Por despachar', 'En tránsito'] as const).every(to => {
    const s = ship(from);
    const move = boardMove(s, to, cat);
    return move === null || !move.ok || shipmentTransitionError(from, move.to!) === null;
  })));

// ------------------------------------------------------------------------------------------------------------------ Lo que viaja a la base
const row: EnvioRow = {
  id: 'ENV-2026-001', fecha: '2026-11-18', almacen_origen_id: 'ALM-001', sede_destino_id: 'FIL-003', estado: 'Por armar', cajas: [], lineas: [{ articulo_id: 'A', cantidad: 10 }],
  metodo_envio_id: null, courier_id: null, numero_guia: null, referencia_adicional: null, viajero_nombre: null, viajero_documento: null, observacion_envio: null, eta: null, eta_hora: null,
  borrador_vence: null, observacion: null, adjuntos: [], recepcion_observacion: null, recepcion_fecha: null, recibido_por: null, habilitar_recepcion_manual: false, despachado_en: null,
};
const fromRow = shipmentFromRow(row);
check('Un envío «Por armar» de la base llega sin cajas, sin transporte y sin fecha de despacho', fromRow.status === 'Por armar' && fromRow.boxes.length === 0 && fromRow.items[0].quantity === 10 && fromRow.eta === undefined && fromRow.dispatchedAt === undefined);
check('Uno despachado trae cuándo salió', shipmentFromRow({ ...row, estado: 'En tránsito', despachado_en: '2026-11-19T15:00:00Z' }).dispatchedAt === '2026-11-19T15:00:00Z');
check('Una base anterior a la 0029 (sin esa columna) sigue leyéndose', shipmentFromRow({ ...row, despachado_en: undefined }).dispatchedAt === undefined);
check('Mover una tarjeta manda solo el estado; guardar la lista, solo la lista',
  JSON.stringify(shipmentPayload({ status: 'Empacando' })) === JSON.stringify({ estado: 'Empacando' }) && JSON.stringify(shipmentPayload({ items: [{ itemId: 'A', quantity: 3 }] })) === JSON.stringify({ lineas: [{ articulo_id: 'A', cantidad: 3 }] })
  && JSON.stringify(shipmentPayload({ boxes: [box(1, [{ itemId: 'A', quantity: 3 }])], status: 'Por despachar' })) === JSON.stringify({ estado: 'Por despachar', cajas: [{ id: 'box-1', numero: '1', items: [{ articulo_id: 'A', cantidad: 3 }] }] }));

// ------------------------------------------------------------------------------------------------------------------ La migración 0029
const mig = read('supabase/migrations/20261119100000_tablero_de_envios.sql');
const down = read('supabase/deshacer/20261119100000_tablero_de_envios.down.sql');
check('La migración trae los estados del tablero, sin «Borrador», y un envío nuevo parte en «Por armar»',
  /check \(estado in \('Por armar', 'Empacando', 'Por despachar', 'En tránsito', 'Listo para recepción', 'Recibido', 'Recibido con diferencias', 'Cancelado'\)\)/.test(mig)
  && /alter column estado set default 'Por armar'/.test(mig) && /set estado = 'Por armar' where estado = 'Borrador'/.test(mig));
check('Guarda cuándo y quién despachó, y la sede destino solo lee un envío desde que salió',
  /add column despachado_en timestamptz/.test(mig) && /add column despachado_por text/.test(mig) && /create policy envios_leer/.test(mig)
  && /envios\.despachado_en is not null and \(select app\.puede_ver_ubicacion\(envios\.sede_destino_id, null::text\)\)/.test(mig) && /app\.puede_ver_ubicacion\(null::text, envios\.almacen_origen_id\)/.test(mig));
check('Los textos de la base son los mismos que los del sistema',
  mig.includes("'Indique la fecha y la hora de llegada.'") && mig.includes("'Debe agregar al menos una caja con sus artículos.'") && mig.includes("'Hay más unidades en las cajas que en la lista del envío.'")
  && mig.includes("'Hay un artículo en las cajas que no está en la lista del envío.'") && mig.includes("'Avance de a una columna: pase la tarjeta a «Empacando» primero.'")
  && mig.includes('La lista de artículos y el destino solo se cambian en «Por armar»: devuelva la tarjeta a esa columna.') && mig.includes('Las cajas solo se arman en «Empacando»: devuelva la tarjeta a esa columna.')
  && mig.includes('El transporte y la fecha de llegada se registran en «Por despachar»: pase la tarjeta a esa columna.') && mig.includes('Un envío despachado ya no se edita: cancélelo y prepare otro.')
  && detailError([]) === 'Debe agregar al menos un artículo.' && mig.includes("'La caja % no puede estar vacía.'"));
check('Cada columna exige sus datos para salir y despachar exige los de las tres',
  /create function app\.envio_validar_etapa\(e public\.envios, p_etapa text\)/.test(mig) && /perform app\.envio_validar_etapa\(e, 'Por armar'\);\s+perform app\.envio_validar_etapa\(e, 'Empacando'\);\s+perform app\.envio_validar_etapa\(e, 'Por despachar'\);/.test(mig)
  && /create function app\.validar_cajas_avance/.test(mig) && /perform app\.validar_cajas_avance\(n\.lineas, n\.cajas\)/.test(mig));
check('Despachar solo desde «Por despachar», una sola vez, y deja cuándo y quién; cancelar algo ya despachado pide su motivo y devuelve lo que salió',
  /if e\.estado <> 'Por despachar' then raise exception 'Solo se despacha un envío que está en «Por despachar»\.'/.test(mig) && /despachado_en = now\(\), despachado_por = app\.quien\(null\)/.test(mig)
  && /length\(btrim\(coalesce\(p_observacion, ''\)\)\) < 5 then raise exception 'Indique el motivo de la cancelación/.test(mig) && /app\.mover_lineas\(e\.almacen_origen_id, e\.lineas, 1, 'Ingreso'/.test(mig));
check('Los permisos no cambian: mover entre las columnas de preparación pide «Editar un envío»; despachar y cancelar, «Realizar el envío»; las funciones de la base no las llama quien no inició sesión',
  /else perform app\.exigir\('log-envios:edit', 'Editar un envío'\)/.test(mig) && /v_a = 'En tránsito' then perform app\.exigir\('log-envios:dispatch'/.test(mig)
  && /create or replace function public\.cambiar_estado_envio[\s\S]*?perform app\.exigir\('log-envios:dispatch'/.test(mig) && /revoke execute on function app\.validar_cajas_avance\(jsonb, jsonb\), app\.envio_validar_etapa\(public\.envios, text\), app\.mover_envio\(text, text\) from public, anon/.test(mig));
check('Un envío nuevo nace solo en «Por armar», con destino y lista, y una tarjeta no vence sola', /Un envío nuevo nace en «Por armar»\./.test(mig) && !/borrador_vence = case/.test(mig) && /borrador_vence = null/.test(mig));
check('Se puede deshacer: vuelve «Borrador», la lectura anterior de la sede destino y las funciones de la migración 0013',
  /set estado = 'Borrador' where estado in \('Por armar', 'Empacando', 'Por despachar'\)/.test(down) && /drop column despachado_en/.test(down) && /create policy envios_leer/.test(down) && !/despachado_en is not null/.test(down.replace(/drop column despachado_en/, ''))
  && (down.match(/create or replace function (app|public)\./g) ?? []).length === 6 && /drop function app\.mover_envio/.test(down));

// ------------------------------------------------------------------------------------------------------------------ Las pantallas
const page = read('src/pages/logistics/Shipments.tsx');
const boardSrc = read('src/components/logistics/ShipmentBoard.tsx');
const work = read('src/components/logistics/ShipmentWorkModal.tsx');
const receptions = read('src/pages/logistics/Receptions.tsx');
const ctxSrc = read('src/context/DataContext.tsx');
const iToggle = page.indexOf("role=\"group\" aria-label=\"Vista de los envíos\"");
const iCreate = page.indexOf("onClick={() => setCreating(true)}");
check('El interruptor Tarjetas ↔ Tablero está a la izquierda de «Crear envío», con la misma altura del botón (h-10)',
  iToggle > 0 && iCreate > iToggle && /bg-surface-muted p-1 rounded-xl h-10/.test(page) && /\{toggle\('cards', 'Tarjetas'/.test(page) && /\{toggle\('board', 'Tablero'/.test(page) && /aria-pressed=\{view === value\}/.test(page));
check('El tablero es la vista principal (se abre en el tablero; si el navegador no guarda la preferencia, también)',
  /localStorage\.getItem\(VIEW_KEY\) === 'cards' \? 'cards' : 'board'/.test(page) && /catch \{ return 'board'; \}/.test(page) && /try \{ localStorage\.setItem\(VIEW_KEY, v\); \} catch/.test(page));
check('Las tarjetas se arrastran de una columna a otra y también se avanzan con un botón; las reglas dicen si se puede soltar y se muestra en verde o en rojo',
  /draggable=\{draggable\}/.test(boardSrc) && /onDrop=\{e => \{ e\.preventDefault\(\); drop\(col\.id\); \}\}/.test(boardSrc) && /boardMove\(dragged, over, catalog\)/.test(boardSrc)
  && /border-success-text ring-2/.test(boardSrc) && /border-error ring-2/.test(boardSrc) && /Pasar a «\$\{next\}»/.test(boardSrc) && /return 'Despachar…'/.test(boardSrc));
check('Solo se arrastra lo que se prepara y solo quien puede editar; lo que ya salió o se cerró no se arrastra', /const draggable = canMove && \(column === 'Por armar' \|\| column === 'Empacando' \|\| column === 'Por despachar'\)/.test(boardSrc));
check('Soltar con datos incompletos explica qué falta y ofrece completarlos; no se mueve nada', /Faltan datos para pasar la tarjeta/.test(page) && /confirmLabel: incomplete \? 'Completar datos'/.test(page) && /onConfirm: \(\) => \{ if \(incomplete\) setWorkId\(s\.id\); \}/.test(page));
check('Pasar a «En tránsito» abre antes una ventana que dice que no hay marcha atrás y avisa del stock que no alcanza',
  /if \(move\.confirm === 'dispatch'\) \{ setDispatchError\(null\); setDispatchId\(s\.id\); return; \}/.test(page) && /Desde aquí no hay marcha atrás/.test(page) && /stockShortages\(dispatchShipment\.items, stockOf\)/.test(page)
  && /El stock del almacén no alcanza para/.test(page) && /Despachar ahora/.test(page));
check('Cancelar algo que ya salió pide su motivo (al menos 5 letras); antes de salir basta confirmar', /detail\.trim\(\)\.length < 5/.test(page) && /Cancelar el envío/.test(page) && /Todavía no salió del almacén, así que no se mueve stock/.test(page));
check('Cada columna se trabaja con su propio editor y un envío que ya salió solo se ve',
  /shipment\.status === 'Por armar'/.test(work) && /shipment\.status === 'Empacando'/.test(work) && /shipment\.status === 'Por despachar'/.test(work) && /<ShipmentListEditor/.test(work) && /<ShipmentBoxesEditor/.test(work) && /<ShipmentDispatchEditor/.test(work)
  && /Ya salió \(o se cerró\): solo se ve/.test(work) && /addShipment\(\{ date: todayLocalISO\(\), originId, destinationId: draft\.destinationId, status: 'Por armar'/.test(work));
check('Guardar y pasar de columna es UNA operación (cajas + estado; lista + estado)', /updateShipment\(shipment\.id, withVersion\(\{ boxes, \.\.\.\(advance \? \{ status: 'Por despachar' as const \} : \{\}\) \}\)\)/.test(work)
  && /status: 'Empacando' as const/.test(work));
check('La sede destino no ve un envío en preparación: Recepciones lo oculta (y la base ya no se lo deja leer)', /'Por armar', 'Empacando', 'Por despachar'/.test(receptions));
check('Ya no hay borradores que vencen ni el formulario de un solo paso: sin «draftExpiry» ni «Guardar Borrador» en la pantalla', !/draftExpiry|Guardar Borrador|Borrador/.test(page) && !/Guardar Borrador/.test(work));
check('Despachar desde la edición avisa a la sede (el aviso sale al pasar de «Por despachar» a «En tránsito»)', /prev\.status === 'Por despachar' && shipment\.status === 'En tránsito'/.test(ctxSrc) && !/prev\.status === 'Borrador'/.test(ctxSrc));
check('El envío nuevo no mueve stock ni avisa (nace en «Por armar»)', /const addShipment: DataContextType\['addShipment'\] = async shipment => \{\s+const res = await log\.addShipment\(shipment\);\s+if \(!res\.ok\) return \{ ok: false, error: res\.error \};\s+return \{ ok: true, id: res\.id \};/.test(ctxSrc));

if (failed > 0) {
  console.log(`\n${failed} comprobaciones fallaron.`);
  process.exit(1);
}
console.log('\nTodas las comprobaciones pasaron.');
