/**
 * Verificación de Logística en la base de datos (Lote 6): el stock, el kardex, los ajustes, los envíos, las transferencias, las recepciones, los
 * couriers y los métodos de envío.
 *  - reglas puras: ajustes (el tipo define el signo), paquetes, mínimo, estados permitidos de un envío y de una transferencia, detalle y cajas,
 *    transporte según el método, recepción (diferencias, incidencias, qué suma al stock);
 *  - traducción de filas ↔ modelo, mensajes que se envían a la base y errores de la base ↔ mensajes claros;
 *  - operaciones (con un repositorio en memoria): validan ANTES de llamar a la base, devuelven el motivo y dicen qué volver a leer;
 *  - la carga de partida (`supabase/seed/logistica_inicial.sql`) está al día y sus datos son coherentes;
 *  - el cableado: las funciones de la base que llama el repositorio existen en las migraciones, las funciones del registro que piden existen,
 *    el contexto ya no guarda stock en memoria y las acciones son asíncronas.
 * Lo que hace la base (todo o nada, el kardex que no se toca, quién mueve el stock…) se prueba aparte, contra una copia de la base: ver
 * `docs/PLANTILLA_SUPABASE.md`.
 * Ejecutar: npx tsx scripts/check-stock-db.ts
 */
import { readFileSync } from 'node:fs';
import { seedCouriers, seedItems, seedShippingMethods, seedStock, seedWarehouses } from '../src/data/seedCatalog';
import { REAL_BRANCHES, realBranchId } from '../src/data/realOrg';
import type { Courier, Item, Shipment, ShippingMethod, StockItem, Transfer } from '../src/context/DataContext';
import {
  addCourier, addShippingMethod, changeShipmentStatus, changeTransferStatus, confirmReception, createShipment, createTransfer, deliverFromStock, editShipment, editTransfer,
  packItem, registerAdjustment, registerStockEntry, removeShipment, restockReversedSale, sellFromStock, setMinStock, updateCourier, updateShippingMethod,
  type LogisticsContext, type LogisticsRepository,
} from '../src/services/logistics';
import { capabilityById } from '../src/utils/capabilities';
import { adjustmentError, minStockError, packageError, signedAdjustment, stockEntryError } from '../src/utils/inventory';
import { stockLocations } from '../src/utils/logisticsRoutes';
import {
  SHIPMENT_FLOW, TRANSFER_FLOW, courierError, detailError, flattenBoxes, isInTransit, methodError, receptionError, receptionOutcome, shipmentContentError, shipmentMovesStock,
  shipmentTransitionError, transferDispatchError, transferMovesStock, transferRequestError, transferTransitionError, transportError,
} from '../src/utils/logisticsDocs';
import { renderLogisticsSeedSql } from '../src/utils/logisticsSeedSql';
import {
  adjustmentFromRow, adjustmentView, courierFromRow, courierToRow, incidentFromRow, isTransportIdConflict, kardexFromRow, kardexView, localStamp, methodFromRow, methodToRow,
  shipmentFromRow, shipmentPayload, stockErrorMessage, stockFromRow, transferFromRow, transferPayload,
  type EnvioRow, type TransferenciaRow,
} from '../src/utils/stockDb';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : ` -> ${detail}`}`);
  if (!ok) failed++;
};
const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

// ------------------------------------------------------------------------------------------------------------------ Datos de prueba
const items = seedItems();
const itemOf = (id: string) => items.find(i => i.id === id)!;
const locations = stockLocations(
  REAL_BRANCHES.map(b => ({ id: realBranchId(b.name), name: b.name, status: 'Activo' as const })),
  seedWarehouses().map(w => ({ id: w.id, name: w.name, status: 'Activo' as const })),
);
const methods: ShippingMethod[] = seedShippingMethods();
const couriers: Courier[] = seedCouriers();
const stock: StockItem[] = seedStock().map((s, i) => ({ id: `STK-${String(i + 1).padStart(3, '0')}`, itemId: s.itemId, branchId: s.branchId, stock: s.stock, minStock: s.minStock }));
const stockOf = (branchId: string, itemId: string) => stock.find(s => s.branchId === branchId && s.itemId === itemId)!;

const box = (n: number, lines: { itemId: string; quantity: number }[]) => ({ id: `box-${n}`, boxNumber: String(n), items: lines });
const shipment = (extra: Partial<Shipment> = {}): Shipment => ({
  id: 'ENV-2026-001', date: '2026-11-09', originId: 'ALM-001', destinationId: 'FIL-002', status: 'Borrador',
  boxes: [box(1, [{ itemId: 'ITM-LIB-K1', quantity: 5 }]), box(2, [{ itemId: 'ITM-HER-01', quantity: 3 }])],
  items: [{ itemId: 'ITM-LIB-K1', quantity: 5 }, { itemId: 'ITM-HER-01', quantity: 3 }],
  shippingMethodId: 'SM-001', courierId: 'COUR-001', trackingNumber: 'TRK-1', eta: '2026-11-12', etaTime: '15:00', ...extra,
});
const transfer = (extra: Partial<Transfer> = {}): Transfer => ({
  id: 'TRF-2026-001', date: '2026-11-09', originId: 'ALM-001', destinationId: 'FIL-002', status: 'Borrador', items: [{ itemId: 'ITM-HER-02', quantity: 4 }], reason: 'Reposición', ...extra,
});

// ------------------------------------------------------------------------------------------------------------------ Ajustes, mínimo y paquetes
check('El tipo define el signo: positivo y devolución suman; negativo y merma descuentan; la regularización respeta el signo',
  signedAdjustment('Ajuste Positivo', -5) === 5 && signedAdjustment('Devolución', -2) === 2 && signedAdjustment('Merma', 4) === -4 && signedAdjustment('Ajuste Negativo', 3) === -3
  && signedAdjustment('Regularización Administrativa', -7) === -7 && signedAdjustment('Regularización Administrativa', 7) === 7);
const adj = (o: Partial<Parameters<typeof adjustmentError>[0]> = {}) => adjustmentError({ locationId: 'ALM-001', itemId: 'ITM-LIB-K1', type: 'Merma', qty: -2, reason: 'Deterioro', ...o });
check('Un ajuste válido no tiene error', adj() === null);
check('Un ajuste pide el registro de stock, una cantidad entera distinta de 0, el signo de su tipo y el motivo',
  !!adj({ locationId: '' }) && !!adj({ qty: 0 }) && !!adj({ qty: 1.5 }) && !!adj({ qty: 3 }) && !!adj({ type: 'Ajuste Positivo', qty: -3 }) && !!adj({ reason: '  ' }) && adj({ type: 'Regularización Administrativa', qty: 3 }) === null);
check('El stock mínimo es un entero de 0 en adelante', minStockError(0) === null && minStockError(12) === null && !!minStockError(-1) && !!minStockError(2.5));
check('Solo un kit con composición se arma o se desarma (ya no hay casilla «permite desempaquetado»: todo kit se puede desarmar, con motivo)',
  packageError(itemOf('ITM-KIT-BIENV')) === null && !!packageError(itemOf('ITM-LIB-K1')) && !!packageError(undefined)
  && !!packageError({ ...itemOf('ITM-KIT-BIENV'), composition: [] }));
const stockPage = read('src/pages/logistics/Stock.tsx');
check('La pantalla de Stock separa «Armar kits» de «Desarmar kits» y al desarmar pide el motivo (obligatorio) antes de llamar a la base',
  /can\('log-stock:pack'\)/.test(stockPage) && /can\('log-stock:unpack'\)/.test(stockPage) && !/allowUnpacking/.test(stockPage) && /unpackReasonError\(unpackReason\)/.test(stockPage)
  && /unpackPackage\(selectedStock\.id, unpackReason\.trim\(\)\)/.test(stockPage) && /Motivo del desempaquetado \*/.test(stockPage));
check('Un ingreso de stock sigue pidiendo sede, artículo, cantidad entera y documento', stockEntryError({ branchId: 'ALM-001', itemId: 'ITM-LIB-K1', qty: 5, doc: 'F-1' }) === null
  && !!stockEntryError({ branchId: '', itemId: 'x', qty: 5, doc: 'F' }) && !!stockEntryError({ branchId: 'a', itemId: 'x', qty: 0, doc: 'F' }) && !!stockEntryError({ branchId: 'a', itemId: 'x', qty: 5, doc: ' ' }));

// ------------------------------------------------------------------------------------------------------------------ Estados de envíos y transferencias
check('Un envío: borrador → en tránsito o cancelado; en tránsito → listo para recepción o cancelado; lo recibido y lo cancelado no tienen salida',
  shipmentTransitionError('Borrador', 'En tránsito') === null && shipmentTransitionError('Borrador', 'Cancelado') === null && shipmentTransitionError('En tránsito', 'Listo para recepción') === null
  && shipmentTransitionError('En tránsito', 'Cancelado') === null && shipmentTransitionError('Listo para recepción', 'Cancelado') === null
  && !!shipmentTransitionError('Borrador', 'Recibido') && !!shipmentTransitionError('Recibido', 'Cancelado') && !!shipmentTransitionError('Cancelado', 'Borrador') && !!shipmentTransitionError('En tránsito', 'En tránsito'));
check('Ningún estado terminal de un envío tiene salida', SHIPMENT_FLOW.Recibido.length === 0 && SHIPMENT_FLOW['Recibido con diferencias'].length === 0 && SHIPMENT_FLOW.Cancelado.length === 0);
check('Una transferencia: borrador → solicitada; solicitada → aprobada o rechazada; solo lo aprobado se despacha',
  transferTransitionError('Borrador', 'Solicitada') === null && transferTransitionError('Solicitada', 'Aprobada') === null && transferTransitionError('Solicitada', 'Rechazada') === null
  && transferTransitionError('Aprobada', 'En tránsito') === null && transferTransitionError('En tránsito', 'Listo para recepción') === null && transferTransitionError('En tránsito', 'Cancelada') === null
  && !!transferTransitionError('Solicitada', 'En tránsito') && !!transferTransitionError('Borrador', 'Aprobada') && !!transferTransitionError('Rechazada', 'Aprobada') && !!transferTransitionError('Cancelada', 'Solicitada'));
check('Lo rechazado, lo cancelado y lo recibido no tienen salida', !TRANSFER_FLOW.Rechazada && !TRANSFER_FLOW.Cancelada && !TRANSFER_FLOW.Recibida && !TRANSFER_FLOW['Recibida con diferencias']);
check('Solo despachar y cancelar algo ya despachado mueven stock del origen',
  shipmentMovesStock('Borrador', 'En tránsito') && shipmentMovesStock('En tránsito', 'Cancelado') && shipmentMovesStock('Listo para recepción', 'Cancelado')
  && !shipmentMovesStock('Borrador', 'Cancelado') && !shipmentMovesStock('En tránsito', 'Listo para recepción')
  && transferMovesStock('Aprobada', 'En tránsito') && transferMovesStock('En tránsito', 'Cancelada') && !transferMovesStock('Borrador', 'Cancelada') && !transferMovesStock('Solicitada', 'Aprobada'));
check('«En tránsito» es lo que ya salió y todavía no se recibió', isInTransit('En tránsito') && isInTransit('Listo para recepción') && !isInTransit('Borrador') && !isInTransit('Recibido'));

// ------------------------------------------------------------------------------------------------------------------ Detalle, cajas y transporte
check('Las cajas se suman por artículo', JSON.stringify(flattenBoxes([box(1, [{ itemId: 'a', quantity: 2 }, { itemId: 'b', quantity: 1 }]), box(2, [{ itemId: 'a', quantity: 3 }])])) === JSON.stringify([{ itemId: 'a', quantity: 5 }, { itemId: 'b', quantity: 1 }]));
const ids = items.map(i => i.id);
check('El detalle pide al menos un artículo, cada uno elegido, sin repetir y con cantidad entera mayor a 0',
  detailError([{ itemId: 'ITM-LIB-K1', quantity: 2 }], [], ids) === null && !!detailError([], [], ids) && !!detailError([{ itemId: '', quantity: 1 }]) && !!detailError([{ itemId: 'ITM-LIB-K1', quantity: 0 }])
  && !!detailError([{ itemId: 'ITM-LIB-K1', quantity: 1.5 }]) && !!detailError([{ itemId: 'ITM-LIB-K1', quantity: 1 }, { itemId: 'ITM-LIB-K1', quantity: 2 }]) && !!detailError([{ itemId: 'XX', quantity: 1 }], [], ids));
check('Cada caja lleva al menos un artículo y las cajas suman el detalle',
  detailError(shipment().items, shipment().boxes, ids) === null && /caja 2 no puede estar vacía/.test(detailError(shipment().items, [shipment().boxes[0], box(2, [])]) ?? '')
  && /no coinciden/.test(detailError([{ itemId: 'ITM-LIB-K1', quantity: 6 }, { itemId: 'ITM-HER-01', quantity: 3 }], shipment().boxes) ?? ''));
const m = (id: string) => methods.find(x => x.id === id);
check('«Courier» pide courier y guía; «Viajero», quién lleva la carga; otro método, una observación (si se exige)',
  transportError(m('SM-001'), { courierId: 'COUR-001', trackingNumber: 'T' }, true) === null && !!transportError(m('SM-001'), { trackingNumber: 'T' }, true) && !!transportError(m('SM-001'), { courierId: 'COUR-001' }, true)
  && transportError(m('SM-002'), { travelerName: 'Juan' }, true) === null && !!transportError(m('SM-002'), {}, true)
  && !!transportError(m('SM-003'), {}, true) && transportError(m('SM-003'), { shippingObservation: 'x' }, true) === null && transportError(m('SM-003'), {}, false) === null && !!transportError(undefined, {}, false));
const cat = { methods, couriers, itemIds: ids };
check('Un envío válido no tiene error de contenido', shipmentContentError(shipment(), cat) === null);
check('Un envío pide fecha y hora de llegada, método, transporte, detalle y al menos una caja',
  !!shipmentContentError(shipment({ eta: undefined }), cat) && !!shipmentContentError(shipment({ etaTime: undefined }), cat) && !!shipmentContentError(shipment({ shippingMethodId: undefined }), cat)
  && !!shipmentContentError(shipment({ courierId: undefined }), cat) && !!shipmentContentError(shipment({ items: [], boxes: [] }), cat) && /al menos una caja/.test(shipmentContentError(shipment({ boxes: [] }), cat) ?? ''));
check('Una solicitud de transferencia pide motivo y detalle', transferRequestError(transfer(), ids) === null && !!transferRequestError(transfer({ reason: ' ' }), ids) && !!transferRequestError(transfer({ items: [] }), ids));
const ready = transfer({ status: 'Aprobada', shippingMethodId: 'SM-003', eta: '2026-11-12', boxes: [box(1, [{ itemId: 'ITM-HER-02', quantity: 4 }])] });
check('Despachar una transferencia pide método, ETA y cajas que sumen el detalle (la observación no se exige)',
  transferDispatchError(ready, cat) === null && !!transferDispatchError({ ...ready, eta: undefined }, cat) && !!transferDispatchError({ ...ready, shippingMethodId: undefined }, cat)
  && !!transferDispatchError({ ...ready, shippingMethodId: 'SM-001' }, cat) && !!transferDispatchError({ ...ready, boxes: [box(1, [{ itemId: 'ITM-HER-02', quantity: 9 }])] }, cat));

// ------------------------------------------------------------------------------------------------------------------ Recepción
const expected = [{ itemId: 'ITM-LIB-K1', quantity: 5 }, { itemId: 'ITM-HER-01', quantity: 3 }];
let outcome = receptionOutcome('Envío', expected, [{ itemId: 'ITM-LIB-K1', quantity: 5, status: 'ok' }, { itemId: 'ITM-HER-01', quantity: 3, status: 'ok' }]);
check('Sin diferencias: queda «Recibido», sin incidencias, y todo suma al stock', !outcome.hasDifferences && outcome.finalStatus === 'Recibido' && outcome.incidents.length === 0 && outcome.stockIn.length === 2);
outcome = receptionOutcome('Transferencia', expected, [{ itemId: 'ITM-LIB-K1', quantity: 5, status: 'ok' }, { itemId: 'ITM-HER-01', quantity: 1, status: 'missing', observation: 'faltan 2' }, { itemId: 'ITM-HER-02', quantity: 2, status: 'extra' }]);
check('Con diferencias: «Recibida con diferencias»; faltaron 2 y llegaron 2 de más; lo recibido suma al stock',
  outcome.hasDifferences && outcome.finalStatus === 'Recibida con diferencias' && outcome.incidents.length === 2
  && outcome.incidents[0].type === 'missing' && outcome.incidents[0].quantity === 2 && outcome.incidents[0].observation === 'faltan 2' && outcome.incidents[1].type === 'extra' && outcome.incidents[1].quantity === 2
  && outcome.stockIn.length === 3 && outcome.stockIn.find(l => l.itemId === 'ITM-HER-01')?.quantity === 1);
check('Una cantidad distinta de la esperada cuenta como diferencia aunque el estado diga «ok»', receptionOutcome('Envío', expected, [{ itemId: 'ITM-LIB-K1', quantity: 4, status: 'ok' }]).hasDifferences);
check('Lo que llegó dañado también queda como incidencia y suma al stock', (() => { const o = receptionOutcome('Envío', expected, [{ itemId: 'ITM-LIB-K1', quantity: 5, status: 'damaged' }]); return o.incidents[0]?.type === 'damaged' && o.incidents[0].quantity === 5 && o.stockIn.length === 1; })());
check('Una cantidad 0 no suma al stock', receptionOutcome('Envío', expected, [{ itemId: 'ITM-LIB-K1', quantity: 0, status: 'missing' }]).stockIn.length === 0);
check('Solo se recibe lo que está en tránsito, con cantidades enteras de 0 en adelante y sin repetir',
  receptionError('En tránsito', [{ itemId: 'a', quantity: 1, status: 'ok' }]) === null && receptionError('Listo para recepción', [{ itemId: 'a', quantity: 0, status: 'missing' }]) === null
  && !!receptionError('Recibido', [{ itemId: 'a', quantity: 1, status: 'ok' }]) && !!receptionError('Borrador', [{ itemId: 'a', quantity: 1, status: 'ok' }]) && !!receptionError('En tránsito', [])
  && !!receptionError('En tránsito', [{ itemId: 'a', quantity: -1, status: 'ok' }]) && !!receptionError('En tránsito', [{ itemId: 'a', quantity: 1.5, status: 'ok' }])
  && !!receptionError('En tránsito', [{ itemId: 'a', quantity: 1, status: 'ok' }, { itemId: 'a', quantity: 2, status: 'ok' }]) && !!receptionError('En tránsito', [{ itemId: 'zz', quantity: 1, status: 'ok' }], ['a']));
check('Un courier pide código y nombre, y el código no se repite', courierError({ code: 'C-9', name: 'Nuevo' }, couriers) === null && !!courierError({ code: '', name: 'x' }, couriers) && !!courierError({ code: 'c-001', name: 'x' }, couriers)
  && courierError({ code: 'C-001', name: 'Olva' }, couriers, 'COUR-001') === null);
check('Un método de envío pide nombre', methodError({ name: 'Otro' }) === null && !!methodError({ name: '  ' }));

// ------------------------------------------------------------------------------------------------------------------ Traducción
const names = { locationName: (id: string) => locations.find(l => l.id === id)?.name ?? id, itemName: (id: string) => itemOf(id)?.name ?? id };
const k = kardexFromRow({ id: 'KDX-014', fecha: '2026-11-09T15:30:00-05:00', articulo_id: 'ITM-LIB-K1', ubicacion_id: 'ALM-001', tipo: 'Ingreso', cantidad: 10, saldo_anterior: 400, saldo_nuevo: 410, usuario: 'Alma', documento: 'FAC-1', observacion: null });
const kv = kardexView([k], names)[0];
check('El kardex guarda ids y los nombres salen del artículo y del lugar al mostrarlo', k.itemId === 'ITM-LIB-K1' && k.locationId === 'ALM-001' && kv.material === itemOf('ITM-LIB-K1').name && kv.branch === seedWarehouses()[0].name && kv.qty === 10 && kv.prevBalance === 400 && kv.newBalance === 410 && kv.doc === 'FAC-1' && kv.observation === undefined);
check('Un cambio de nombre se ve en todo el historial (los nombres no se guardan)', kardexView([k], { ...names, itemName: () => 'Otro nombre' })[0].material === 'Otro nombre');
check('La fecha del kardex se muestra como «AAAA-MM-DD HH:mm»', /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(kv.date) && localStamp('no es fecha') === 'no es fecha');
const aj = adjustmentView([adjustmentFromRow({ id: 'ADJ-001', fecha: '2026-11-09T10:00:00-05:00', articulo_id: 'ITM-HER-02', ubicacion_id: 'FIL-002', tipo: 'Merma', cantidad: -2, motivo: 'Deterioro', observacion: 'x', usuario: 'Pía' })], names)[0];
check('Un ajuste se muestra con los nombres y su motivo', aj.id === 'ADJ-001' && aj.material === itemOf('ITM-HER-02').name && aj.reason === 'Deterioro' && aj.qty === -2 && aj.user === 'Pía' && aj.observation === 'x');
const st = stockFromRow({ id: 'STK-001', articulo_id: 'ITM-LIB-K1', ubicacion_id: 'FIL-002', cantidad: 100, minimo: 50 });
check('El stock de la base es el modelo del sistema (la ubicación es la sede o el almacén)', st.id === 'STK-001' && st.itemId === 'ITM-LIB-K1' && st.branchId === 'FIL-002' && st.stock === 100 && st.minStock === 50);

const envioRow: EnvioRow = {
  id: 'ENV-2026-001', fecha: '2026-11-09', almacen_origen_id: 'ALM-001', sede_destino_id: 'FIL-002', estado: 'En tránsito',
  cajas: [{ id: 'box-1', numero: '1', observacion: 'frágil', items: [{ articulo_id: 'ITM-LIB-K1', cantidad: 5 }] }], lineas: [{ articulo_id: 'ITM-LIB-K1', cantidad: 5 }],
  metodo_envio_id: 'SM-001', courier_id: 'COUR-001', numero_guia: 'TRK-1', referencia_adicional: null, viajero_nombre: null, viajero_documento: null, observacion_envio: null,
  eta: '2026-11-12', eta_hora: '15:00', borrador_vence: null, observacion: null, adjuntos: [], recepcion_observacion: null, recepcion_fecha: null, recibido_por: null, habilitar_recepcion_manual: true,
};
const s1 = shipmentFromRow(envioRow);
check('Un envío de la base es el modelo del sistema (cajas, detalle, transporte, ETA)',
  s1.id === 'ENV-2026-001' && s1.originId === 'ALM-001' && s1.destinationId === 'FIL-002' && s1.status === 'En tránsito' && s1.boxes[0].boxNumber === '1' && s1.boxes[0].observation === 'frágil'
  && s1.boxes[0].items[0].itemId === 'ITM-LIB-K1' && s1.items[0].quantity === 5 && s1.shippingMethodId === 'SM-001' && s1.courierId === 'COUR-001' && s1.trackingNumber === 'TRK-1'
  && s1.etaTime === '15:00' && s1.manualEnable === true && s1.travelerName === undefined && s1.attachments === undefined);
const p1 = shipmentPayload({ date: '2026-11-09', originId: 'ALM-001', destinationId: 'FIL-002', status: 'Borrador', boxes: s1.boxes, items: s1.items, courierId: undefined, etaTime: '15:00', attachments: ['guia.pdf'] });
check('Lo que se manda de un envío son solo los campos que vienen; uno vacío se limpia; cajas y detalle van por id de artículo',
  p1.fecha === '2026-11-09' && p1.almacen_origen_id === 'ALM-001' && p1.sede_destino_id === 'FIL-002' && p1.estado === 'Borrador' && p1.courier_id === null && p1.eta_hora === '15:00'
  && JSON.stringify(p1.cajas) === JSON.stringify([{ id: 'box-1', numero: '1', observacion: 'frágil', items: [{ articulo_id: 'ITM-LIB-K1', cantidad: 5 }] }]) && JSON.stringify(p1.lineas) === JSON.stringify([{ articulo_id: 'ITM-LIB-K1', cantidad: 5 }])
  && JSON.stringify(p1.adjuntos) === JSON.stringify(['guia.pdf']) && !('metodo_envio_id' in p1) && !('numero_guia' in p1) && !('habilitar_recepcion_manual' in p1));
check('Editar solo la recepción manual manda solo ese campo', JSON.stringify(shipmentPayload({ manualEnable: true })) === JSON.stringify({ habilitar_recepcion_manual: true }));
check('Los nombres de los artículos no viajan a la base (ni en el detalle ni en las cajas)', !JSON.stringify(p1).includes('Libro') && !JSON.stringify(p1).includes('name'));

const trfRow: TransferenciaRow = {
  id: 'TRF-2026-001', fecha: '2026-11-09', origen_id: 'FIL-002', destino_id: 'ALM-001', estado: 'Solicitada', lineas: [{ articulo_id: 'ITM-HER-01', cantidad: 2 }], cajas: [], motivo: 'Devolución',
  solicitada_por: 'Pía', solicitada_por_id: '00000000-0000-0000-0000-000000000042', metodo_envio_id: null, courier_id: null, numero_guia: null, referencia_adicional: null, viajero_nombre: null,
  viajero_documento: null, observacion_envio: null, observacion_interna_logistica: 'Vehículo propio', eta: null, observacion: 'Urgente', adjuntos: null, recepcion_observacion: null, recepcion_fecha: null,
  recibido_por: null, habilitar_recepcion_manual: false,
};
const t1 = transferFromRow(trfRow);
check('Una transferencia de la base es el modelo del sistema (origen y destino pueden ser el almacén o una sede)',
  t1.originId === 'FIL-002' && t1.destinationId === 'ALM-001' && t1.items[0].itemId === 'ITM-HER-01' && t1.reason === 'Devolución' && t1.requestedBy === 'Pía' && t1.requestedById === trfRow.solicitada_por_id
  && t1.boxes === undefined && t1.internalLogisticsObservation === 'Vehículo propio' && t1.manualEnable === undefined);
const p2 = transferPayload({ date: '2026-11-09', originId: 'FIL-002', destinationId: 'ALM-001', status: 'Solicitada', items: t1.items, reason: 'Devolución', observation: undefined });
check('Lo que se manda de una transferencia: ruta, detalle y motivo; lo que no viene no se toca',
  p2.origen_id === 'FIL-002' && p2.destino_id === 'ALM-001' && p2.estado === 'Solicitada' && p2.motivo === 'Devolución' && p2.observacion === null && JSON.stringify(p2.lineas) === JSON.stringify([{ articulo_id: 'ITM-HER-01', cantidad: 2 }])
  && !('cajas' in p2) && !('eta' in p2));
const inc = incidentFromRow({ id: 'INC-001', fecha: '2026-11-09T10:00:00-05:00', doc_tipo: 'Envío', doc_id: 'ENV-2026-001', articulo_id: 'ITM-HER-01', tipo: 'missing', cantidad: 2, observacion: 'faltan', ubicacion_id: 'FIL-002' });
check('Una incidencia de recepción se traduce al modelo del sistema', inc.docId === 'ENV-2026-001' && inc.docType === 'Envío' && inc.type === 'missing' && inc.quantity === 2 && inc.branchId === 'FIL-002');
const c1 = couriers[0];
check('Un courier y un método de envío van y vuelven de la base sin cambios', JSON.stringify(courierFromRow(courierToRow(c1))) === JSON.stringify(c1) && JSON.stringify(methodFromRow(methodToRow(methods[0]))) === JSON.stringify(methods[0]));
check('Errores de la base: lo propio (EN001) se muestra tal cual; el código repetido del courier, el id repetido, el bloqueo y lo técnico se traducen',
  stockErrorMessage({ code: 'EN001', message: 'Stock insuficiente de "X" en Y: disponible 1, se intentó descontar 5.' }) === 'Stock insuficiente de "X" en Y: disponible 1, se intentó descontar 5.'
  && /courier con ese código/.test(stockErrorMessage({ code: '23505', message: 'duplicate key value violates unique constraint "couriers_codigo_unico"' }))
  && isTransportIdConflict({ code: '23505', message: 'duplicate key value violates unique constraint "couriers_pkey"' }) && !isTransportIdConflict({ code: '23505', message: 'couriers_codigo_unico' })
  && /otra persona|Otra persona/.test(stockErrorMessage({ code: '40P01', message: 'deadlock detected' })) && !/deadlock|constraint|violates/i.test(stockErrorMessage({ code: 'XX000', message: 'violates constraint "x" deadlock' }))
  && /permiso/.test(stockErrorMessage({ code: '42501', message: 'permission denied for table stock' })));

// ------------------------------------------------------------------------------------------------------------------ Operaciones con un repositorio en memoria
type Call = { fn: string; args: unknown[] };
const calls: Call[] = [];
let nextFail: string | null = null;
let idConflicts = 0;
const reply = <T,>(fn: string, args: unknown[], data: T): { ok: boolean; data?: T; error?: string; idConflict?: boolean } => {
  calls.push({ fn, args });
  if (nextFail) { const e = nextFail; nextFail = null; return { ok: false, error: e }; }
  return { ok: true, data };
};
const repo: LogisticsRepository = {
  loadAll: async () => reply('loadAll', [], undefined as never),
  loadLedger: async () => reply('loadLedger', [], undefined as never),
  loadDocuments: async () => reply('loadDocuments', [], undefined as never),
  loadTransport: async () => reply('loadTransport', [], undefined as never),
  registerEntry: async (...a) => reply('registerEntry', a, null),
  registerAdjustment: async (...a) => reply('registerAdjustment', a, 'ADJ-007'),
  pack: async (...a) => reply('pack', a, null),
  unpack: async (...a) => reply('unpack', a, null),
  setMinStock: async (...a) => reply('setMinStock', a, null),
  sell: async (...a) => reply('sell', a, null),
  deliver: async (...a) => reply('deliver', a, null),
  restockSale: async (...a) => reply('restockSale', a, null),
  createShipment: async (...a) => reply('createShipment', a, 'ENV-2026-009'),
  editShipment: async (...a) => reply('editShipment', a, null),
  changeShipmentStatus: async (...a) => reply('changeShipmentStatus', a, null),
  removeShipment: async (...a) => reply('removeShipment', a, null),
  createTransfer: async (...a) => reply('createTransfer', a, 'TRF-2026-009'),
  editTransfer: async (...a) => reply('editTransfer', a, null),
  changeTransferStatus: async (...a) => reply('changeTransferStatus', a, null),
  confirmReception: async (...a) => reply('confirmReception', a, null),
  insertCourier: async c => {
    calls.push({ fn: 'insertCourier', args: [c] });
    if (idConflicts > 0) { idConflicts--; return { ok: false, error: 'Ya existe un registro con esos datos.', idConflict: true }; }
    return { ok: true, data: c };
  },
  updateCourier: async c => reply('updateCourier', [c], c),
  insertMethod: async mt => reply('insertMethod', [mt], mt),
  updateMethod: async mt => reply('updateMethod', [mt], mt),
};
const ctx = (extra: Partial<LogisticsContext> = {}): LogisticsContext => ({ items, locations, stock, shipments: [], transfers: [], couriers, methods, ...extra });
const reset = () => { calls.length = 0; nextFail = null; idConflicts = 0; };
const names2 = () => calls.map(c => c.fn).join(',');

reset();
let r = await registerStockEntry(repo, { branchId: 'ALM-001', itemId: 'ITM-LIB-K1', qty: 0, doc: 'F' });
check('Un ingreso inválido no llega a la base', !r.ok && calls.length === 0);
r = await registerStockEntry(repo, { branchId: 'ALM-001', itemId: 'ITM-LIB-K1', qty: 10, doc: ' FAC-1 ', reason: ' Compra ' });
check('Un ingreso válido llega limpio y se vuelve a leer el stock y el kardex', r.ok && r.affects === 'ledger' && JSON.stringify(calls[0].args[0]) === JSON.stringify({ locationId: 'ALM-001', itemId: 'ITM-LIB-K1', qty: 10, doc: 'FAC-1', reason: 'Compra' }));
reset(); nextFail = 'Su cuenta no está asignada a ese almacén: ver su stock no autoriza a moverlo.';
r = await registerStockEntry(repo, { branchId: 'ALM-001', itemId: 'ITM-LIB-K1', qty: 10, doc: 'F' });
check('Si la base rechaza, el motivo llega tal cual y no se pide releer nada', !r.ok && /no autoriza a moverlo/.test(r.error ?? '') && r.affects === undefined);

reset();
r = await registerAdjustment(repo, ctx(), { stockId: 'STK-999', type: 'Merma', qty: -1, reason: 'x' });
check('Un ajuste de un registro de stock que no existe no llega a la base', !r.ok && /registro de stock/.test(r.error ?? '') && calls.length === 0);
const libAlm = stockOf('ALM-001', 'ITM-LIB-K1');
r = await registerAdjustment(repo, ctx(), { stockId: libAlm.id, type: 'Merma', qty: 3, reason: 'x' });
check('Una merma con cantidad positiva no llega a la base', !r.ok && calls.length === 0);
r = await registerAdjustment(repo, ctx(), { stockId: libAlm.id, type: 'Merma', qty: -3, reason: ' Deterioro ', observation: ' Desde Stock ' });
check('Un ajuste válido llega con el lugar y el artículo del registro de stock, y devuelve su código',
  r.ok && r.id === 'ADJ-007' && r.affects === 'ledger' && JSON.stringify(calls[0].args[0]) === JSON.stringify({ locationId: 'ALM-001', itemId: 'ITM-LIB-K1', type: 'Merma', qty: -3, reason: 'Deterioro', observation: 'Desde Stock' }));

reset();
const kitAlm = { id: 'STK-900', itemId: 'ITM-KIT-BIENV', branchId: 'ALM-001', stock: 80, minStock: 20 };
r = await packItem(repo, ctx({ stock: [...stock, kitAlm] }), 'STK-900', 'pack');
check('Armar un paquete con componentes suficientes llega a la base', r.ok && names2() === 'pack' && JSON.stringify(calls[0].args) === JSON.stringify(['ALM-001', 'ITM-KIT-BIENV']));
reset();
const sinComponentes = stock.map(s => (s.branchId === 'ALM-001' && s.itemId === 'ITM-HER-02' ? { ...s, stock: 0 } : s));
r = await packItem(repo, ctx({ stock: [...sinComponentes, kitAlm] }), 'STK-900', 'pack');
check('Sin componentes suficientes no se empaqueta (con el componente y lo que falta) y no llega a la base', !r.ok && /Cartuchera/.test(r.error ?? '') && /disponible 0, requerido 1/.test(r.error ?? '') && calls.length === 0);
reset();
r = await packItem(repo, ctx({ stock: [...stock, kitAlm] }), 'STK-900', 'unpack');
check('Desarmar un kit SIN motivo no llega a la base', !r.ok && /motivo/.test(r.error ?? '') && calls.length === 0);
r = await packItem(repo, ctx({ stock: [...stock, kitAlm] }), 'STK-900', 'unpack', '   ');
check('Un motivo en blanco tampoco', !r.ok && /motivo/.test(r.error ?? '') && calls.length === 0);
r = await packItem(repo, ctx({ stock: [...stock, kitAlm] }), 'STK-900', 'unpack', ' Un alumno necesita solo la cartuchera ');
check('Desarmar un kit con su motivo llega a la base (lugar, artículo y motivo sin espacios de más)', r.ok && names2() === 'unpack' && JSON.stringify(calls[0].args) === JSON.stringify(['ALM-001', 'ITM-KIT-BIENV', 'Un alumno necesita solo la cartuchera']));
reset();
r = await packItem(repo, ctx(), libAlm.id, 'pack');
check('Un artículo que no es kit no se empaqueta', !r.ok && /no es un kit/.test(r.error ?? '') && calls.length === 0);
r = await setMinStock(repo, ctx(), libAlm.id, -1);
check('Un mínimo negativo no llega a la base', !r.ok && calls.length === 0);
r = await setMinStock(repo, ctx(), libAlm.id, 120);
check('Un mínimo válido llega a la base', r.ok && JSON.stringify(calls[0].args) === JSON.stringify(['ALM-001', 'ITM-LIB-K1', 120]));

reset();
r = await sellFromStock(repo, { branchId: 'ALM-001', itemId: 'ITM-LIB-K1', qty: 1, doc: 'B001', observation: 'x' });
check('El almacén no vende: no llega a la base', !r.ok && /almacén central no vende/.test(r.error ?? '') && calls.length === 0);
r = await sellFromStock(repo, { branchId: 'FIL-002', itemId: 'ITM-LIB-K1', qty: 2, doc: 'B001-1', observation: 'Venta' });
check('La venta de una sede llega a la base y se vuelve a leer el stock', r.ok && r.affects === 'ledger' && names2() === 'sell');
reset();
r = await deliverFromStock(repo, { branchId: 'FIL-002', enrollmentId: 'MAT-2026-001', student: 'Ana', lines: [] });
check('Entregar sin materiales no llama a la base', r.ok && calls.length === 0);
r = await deliverFromStock(repo, { branchId: 'FIL-002', enrollmentId: 'MAT-2026-001', student: 'Ana', lines: [{ itemId: 'ITM-LIB-K1', quantity: 1 }, { itemId: 'ITM-KIT-BIENV', quantity: 1 }] });
check('La entrega de varios materiales es UNA llamada (todo o nada)', r.ok && calls.length === 1 && names2() === 'deliver' && (calls[0].args[0] as { lines: unknown[] }).lines.length === 2);
reset();
r = await restockReversedSale(repo, { branchId: 'FIL-002', itemId: 'ITM-LIB-K1', qty: 2, movementId: 'CJ-014' });
check('Reponer una venta reversada llega a la base', r.ok && names2() === 'restockSale');

// Envíos
reset();
let sh = shipment();
const { id: _id, ...shNew } = sh;
r = await createShipment(repo, ctx(), shNew, shipmentPayload(shNew));
check('Un envío válido en borrador llega a la base, devuelve su código y solo se vuelven a leer los documentos', r.ok && r.id === 'ENV-2026-009' && r.affects === 'documents' && names2() === 'createShipment');
reset();
r = await createShipment(repo, ctx(), { ...shNew, status: 'En tránsito' }, shipmentPayload({ ...shNew, status: 'En tránsito' }));
check('Un envío creado ya despachado mueve stock: se vuelve a leer también el stock', r.ok && r.affects === 'both');
reset();
r = await createShipment(repo, ctx(), { ...shNew, originId: 'FIL-002' }, {});
check('Un envío que no sale del almacén no llega a la base', !r.ok && /salen del almacén central/.test(r.error ?? '') && calls.length === 0);
r = await createShipment(repo, ctx(), { ...shNew, courierId: undefined }, {});
check('Un envío por courier sin courier no llega a la base', !r.ok && /Courier/.test(r.error ?? '') && calls.length === 0);
r = await createShipment(repo, ctx(), { ...shNew, destinationId: 'ALM-001' }, {});
check('Un envío cuyo destino es el almacén no llega a la base', !r.ok && calls.length === 0);
r = await editShipment(repo, ctx({ shipments: [sh] }), 'ENV-NO-EXISTE', sh, {});
check('Editar un envío que no existe se rechaza', !r.ok && /no encontrado/.test(r.error ?? ''));
r = await editShipment(repo, ctx({ shipments: [sh] }), sh.id, { ...sh, items: [{ itemId: 'ITM-LIB-K1', quantity: 9 }] }, {});
check('Editar un borrador con cajas que no suman el detalle no llega a la base', !r.ok && /no coinciden/.test(r.error ?? '') && calls.length === 0);
reset();
r = await editShipment(repo, ctx({ shipments: [sh] }), sh.id, { ...sh, status: 'En tránsito' }, shipmentPayload({ status: 'En tránsito' }));
check('Despachar un borrador desde la edición mueve stock', r.ok && r.affects === 'both' && names2() === 'editShipment');
reset();
const sent = shipment({ status: 'En tránsito' });
r = await editShipment(repo, ctx({ shipments: [sent] }), sent.id, { ...sent, manualEnable: true }, shipmentPayload({ manualEnable: true }));
check('Habilitar la recepción manual de un envío despachado no revalida el contenido y solo relee los documentos', r.ok && r.affects === 'documents' && names2() === 'editShipment');
reset();
r = await changeShipmentStatus(repo, ctx({ shipments: [sent] }), sent.id, 'Cancelado', 'Se canceló');
check('Cancelar un envío despachado llega a la base y relee stock y documentos', r.ok && r.affects === 'both' && JSON.stringify(calls[0].args) === JSON.stringify([sent.id, 'Cancelado', 'Se canceló']));
r = await removeShipment(repo, ctx({ shipments: [sh] }), sh.id);
check('Eliminar un borrador llega a la base', r.ok && r.affects === 'documents');
r = await removeShipment(repo, ctx(), 'ENV-NO-EXISTE');
check('Eliminar un envío que no existe se rechaza', !r.ok);

// Transferencias
reset();
const { id: _tid, ...trNew } = transfer({ status: 'Solicitada' });
r = await createTransfer(repo, ctx(), trNew, transferPayload(trNew));
check('Una solicitud válida llega a la base y devuelve su código', r.ok && r.id === 'TRF-2026-009' && r.affects === 'documents');
reset();
r = await createTransfer(repo, ctx(), { ...trNew, originId: 'FIL-002', destinationId: 'FIL-003' }, {});
check('Entre dos sedes no hay transferencia: no llega a la base', !r.ok && /almacén central/.test(r.error ?? '') && calls.length === 0);
r = await createTransfer(repo, ctx(), { ...trNew, reason: '' }, {});
check('Una solicitud sin motivo no llega a la base', !r.ok && calls.length === 0);
r = await createTransfer(repo, ctx(), { ...trNew, items: [] }, {});
check('Una solicitud sin artículos no llega a la base', !r.ok && calls.length === 0);
const approved = transfer({ status: 'Aprobada' });
r = await changeTransferStatus(repo, ctx({ transfers: [approved] }), approved.id, 'En tránsito');
check('Despachar sin método de envío ni ETA no llega a la base', !r.ok && /método de envío y el ETA/.test(r.error ?? '') && calls.length === 0);
const full = { ...approved, shippingMethodId: 'SM-003', eta: '2026-11-12', boxes: [box(1, [{ itemId: 'ITM-HER-02', quantity: 4 }])] };
r = await changeTransferStatus(repo, ctx({ transfers: [full] }), full.id, 'En tránsito');
check('Despachar con todo completo llega a la base y relee stock y documentos', r.ok && r.affects === 'both' && names2() === 'changeTransferStatus');
reset();
const requested = transfer({ status: 'Solicitada' });
r = await changeTransferStatus(repo, ctx({ transfers: [requested] }), requested.id, 'Aprobada');
check('Aprobar no pide datos de despacho', r.ok && names2() === 'changeTransferStatus');
r = await changeTransferStatus(repo, ctx(), 'TRF-NO-EXISTE', 'Aprobada');
check('Cambiar el estado de una transferencia que no existe se rechaza', !r.ok);
reset();
const draft = transfer();
r = await editTransfer(repo, ctx({ transfers: [draft] }), draft.id, { ...draft, reason: '' }, { motivo: '' });
check('Editar un borrador sin motivo no llega a la base', !r.ok && calls.length === 0);
r = await editTransfer(repo, ctx({ transfers: [draft] }), draft.id, { ...draft, originId: 'FIL-002', destinationId: 'FIL-003' }, {});
check('Cambiar la ruta de una transferencia a dos sedes no llega a la base', !r.ok && calls.length === 0);
r = await editTransfer(repo, ctx({ transfers: [approved] }), approved.id, { ...approved, boxes: [box(1, [{ itemId: 'ITM-HER-02', quantity: 9 }])] }, { cajas: [] });
check('Guardar cajas que no suman el detalle de una transferencia aprobada no llega a la base', !r.ok && /no coinciden/.test(r.error ?? '') && calls.length === 0);
r = await editTransfer(repo, ctx({ transfers: [full] }), full.id, { ...full, manualEnable: true }, transferPayload({ manualEnable: true }));
check('Habilitar la recepción manual de una transferencia llega a la base', r.ok && names2() === 'editTransfer');

// Recepción
reset();
const inTransit = shipment({ status: 'En tránsito' });
const lines = [{ itemId: 'ITM-LIB-K1', quantity: 5, status: 'ok' as const }, { itemId: 'ITM-HER-01', quantity: 1, status: 'missing' as const, observation: 'faltan 2' }];
r = await confirmReception(repo, ctx({ shipments: [inTransit] }), { docId: inTransit.id, docType: 'Envío', receivedItems: lines, generalObservation: 'Llegó incompleto' });
check('Una recepción válida llega a la base con ids de artículo y relee stock y documentos',
  r.ok && r.affects === 'both' && calls[0].args[0] === 'Envío' && calls[0].args[1] === inTransit.id && JSON.stringify(calls[0].args[2]) === JSON.stringify([
    { articulo_id: 'ITM-LIB-K1', cantidad: 5, estado: 'ok', observacion: undefined }, { articulo_id: 'ITM-HER-01', cantidad: 1, estado: 'missing', observacion: 'faltan 2' }]) && calls[0].args[3] === 'Llegó incompleto');
reset();
const received = shipment({ status: 'Recibido' });
r = await confirmReception(repo, ctx({ shipments: [received] }), { docId: received.id, docType: 'Envío', receivedItems: lines });
check('Un envío ya recibido no se vuelve a recibir (no suma dos veces al stock)', !r.ok && /solo se recibe lo que está en tránsito/.test(r.error ?? '') && calls.length === 0);
r = await confirmReception(repo, ctx(), { docId: 'ENV-NO-EXISTE', docType: 'Envío', receivedItems: lines });
check('Un documento que no existe no se recibe', !r.ok && /No se encontró el documento/.test(r.error ?? ''));
r = await confirmReception(repo, ctx({ transfers: [transfer({ status: 'En tránsito' })] }), { docId: 'TRF-2026-001', docType: 'Transferencia', receivedItems: [{ itemId: 'ITM-HER-02', quantity: 4, status: 'ok' }] });
check('También se recibe una transferencia en tránsito', r.ok && calls[0].args[0] === 'Transferencia');

// Couriers y métodos
reset();
let cr = await addCourier(repo, ctx(), { code: 'C-9', name: 'Nuevo', address: '', reference: '', phone: '', status: 'Activo', observations: '' });
check('Un courier nuevo recibe el código siguiente (COUR-003)', cr.ok && cr.value?.id === 'COUR-003');
reset(); idConflicts = 2;
cr = await addCourier(repo, ctx(), { code: 'C-9', name: 'Nuevo', address: '', reference: '', phone: '', status: 'Activo', observations: '' });
check('Si dos personas crean a la vez, se reintenta con el código siguiente (COUR-005)', cr.ok && cr.value?.id === 'COUR-005' && calls.length === 3);
reset(); idConflicts = 5;
cr = await addCourier(repo, ctx(), { code: 'C-9', name: 'Nuevo', address: '', reference: '', phone: '', status: 'Activo', observations: '' });
check('Tras tres intentos fallidos se rinde con un mensaje claro', !cr.ok && /No se pudo asignar un código/.test(cr.error ?? '') && calls.length === 3);
reset();
cr = await addCourier(repo, ctx(), { code: 'c-001', name: 'Repetido', address: '', reference: '', phone: '', status: 'Activo', observations: '' });
check('El código repetido de un courier no llega a la base', !cr.ok && /Ya existe un courier/.test(cr.error ?? '') && calls.length === 0);
cr = await updateCourier(repo, ctx(), 'COUR-001', { status: 'Inactivo' });
check('Inactivar un courier llega a la base con el resto de sus datos', cr.ok && cr.value?.status === 'Inactivo' && cr.value?.name === 'Olva Courier');
cr = await updateCourier(repo, ctx(), 'COUR-NO', { status: 'Inactivo' });
check('Editar un courier que no existe se rechaza', !cr.ok);
const mr = await addShippingMethod(repo, ctx(), { name: 'Aéreo', status: 'Activo', observations: '' });
check('Un método nuevo recibe el código siguiente (SM-005)', mr.ok && mr.value?.id === 'SM-005');
check('Un método sin nombre no llega a la base', !(await addShippingMethod(repo, ctx(), { name: ' ', status: 'Activo', observations: '' })).ok);
check('Se puede inactivar un método', (await updateShippingMethod(repo, ctx(), 'SM-001', { status: 'Inactivo' })).value?.status === 'Inactivo');

// ------------------------------------------------------------------------------------------------------------------ La carga de partida
const seedFile = read('supabase/seed/logistica_inicial.sql');
check('La carga de partida está al día con los datos de ejemplo (npx tsx scripts/doc-logistica-seed.ts)', seedFile === renderLogisticsSeedSql());
const pairs = seedStock().map(s => `${s.branchId}|${s.itemId}`);
check('El stock de partida no repite un artículo en un mismo lugar y todo es de artículos y lugares que existen',
  new Set(pairs).size === pairs.length && seedStock().every(s => items.some(i => i.id === s.itemId) && locations.some(l => l.id === s.branchId) && Number.isInteger(s.stock) && s.stock >= 0 && Number.isInteger(s.minStock) && s.minStock >= 0));
check('El almacén y las sedes de Los Olivos, Piura y Chiclayo tienen stock de partida', ['ALM-001', 'FIL-001', 'FIL-002', 'FIL-003'].every(id => seedStock().some(s => s.branchId === id)));
check('La carga es repetible y todo o nada: solo carga el stock si todavía no hay filas, y entra por el movimiento (kardex)', /if exists \(select 1 from public\.stock\)/.test(seedFile) && /app\.mover_stock/.test(seedFile) && /SALDO-INICIAL/.test(seedFile) && /on conflict do nothing/.test(seedFile));
check('La carga no trae envíos, transferencias ni ajustes de ejemplo (dejarían un historial que no cuadra con el kardex)', !/insert into public\.(envios|transferencias|ajustes|kardex)/.test(seedFile));
check('Los couriers y métodos de partida son los de ejemplo', seedCouriers().length === 2 && seedShippingMethods().length === 4 && seedShippingMethods().some(x => /courier/i.test(x.name)) && seedShippingMethods().some(x => /viajero/i.test(x.name)));

// ------------------------------------------------------------------------------------------------------------------ Cableado
const mig12 = read('supabase/migrations/20261109100000_stock_y_kardex.sql');
const mig13 = read('supabase/migrations/20261109120000_envios_transferencias_y_recepciones.sql');
const repoSrc = read('src/services/logisticsRepository.ts');
const rpcNames = [...repoSrc.matchAll(/rpc(?:<[^>]*>)?\('([a-z_]+)'/g)].map(x => x[1]);
const publicFns = new Set([...(mig12 + mig13).matchAll(/create function public\.([a-z_]+)\(/g)].map(x => x[1]));
check('Las funciones de la base que llama el repositorio existen en las migraciones', rpcNames.length >= 15 && rpcNames.every(n => publicFns.has(n)), rpcNames.filter(n => !publicFns.has(n)).join());
check('Toda función pública de las migraciones la usa el repositorio (no quedan sin usar)', [...publicFns].every(n => rpcNames.includes(n)), [...publicFns].filter(n => !rpcNames.includes(n)).join());
const tables = ['stock', 'kardex', 'ajustes', 'envios', 'transferencias', 'incidencias_recepcion', 'couriers', 'metodos_envio'];
check('Las tablas que lee o escribe el repositorio existen en las migraciones', tables.every(t => new RegExp(`create table public\\.${t} \\(`).test(mig12 + mig13) && repoSrc.includes(`'${t}'`)));
const required = [...new Set([...(mig12 + mig13).matchAll(/(?:exigir|tiene_funcion|permite)\('([a-z-]+:[a-z_]+)'/g)].map(x => x[1]))];
check('Las funciones del registro que piden las migraciones existen', required.length >= 15 && required.every(id => !!capabilityById(id)), required.filter(id => !capabilityById(id)).join());
check('Nadie escribe las tablas de stock, kardex, ajustes, envíos y transferencias directo (solo se leen; todo cambia por funciones)',
  /grant select on public\.stock, public\.kardex, public\.ajustes to authenticated/.test(mig12) && /grant select on public\.envios, public\.transferencias, public\.incidencias_recepcion to authenticated/.test(mig13)
  && !/\.(from)\('(stock|kardex|ajustes|envios|transferencias|incidencias_recepcion)'\)\s*\.(insert|update|delete|upsert)/.test(repoSrc));
check('El kardex y los ajustes solo se agregan: la base lo impide aunque se escriba a mano', /create trigger kardex_no_cambia before update or delete/.test(mig12) && /create trigger ajustes_no_cambian before update or delete/.test(mig12) && /create trigger incidencias_no_cambian/.test(mig13));
check('La cantidad en stock solo cambia con un movimiento (la base lo impide aunque se escriba a mano)', /app\.mueve_stock/.test(mig12) && /create trigger stock_solo_movimientos/.test(mig12));
const down12 = read('supabase/deshacer/20261109100000_stock_y_kardex.down.sql');
const down13 = read('supabase/deshacer/20261109120000_envios_transferencias_y_recepciones.down.sql');
check('Cada migración tiene su script para deshacer', /drop table if exists public\.kardex/.test(down12) && /drop table if exists public\.envios/.test(down13));

const ctxSrc = read('src/context/DataContext.tsx');
check('El contexto ya no guarda stock, kardex, ajustes, envíos ni transferencias en memoria: usa los de la base (useLogistics)',
  !/useState<StockItem\[\]>|useState<KardexEntry\[\]>|useState<Transfer\[\]>|useState<Shipment\[\]>|useState<Adjustment\[\]>|useState<Courier\[\]>|useState<ShippingMethod\[\]>|useState<ReceptionIncident\[\]>/.test(ctxSrc)
  && /const log = useLogistics\(logisticsData, \{ items, locations \}\)/.test(ctxSrc) && !/\bupdateStock\(/.test(ctxSrc) && !/stockRef/.test(ctxSrc));
const iface = ctxSrc.slice(ctxSrc.indexOf('interface DataContextType'), ctxSrc.indexOf('export const DataContext ='));
const asyncActions = ['reverseCashMovement', 'addCourier', 'updateCourier', 'addShippingMethod', 'updateShippingMethod', 'addAdjustment', 'unpackPackage', 'packPackage', 'registerItemSale', 'registerStockEntry',
  'updateMinStock', 'updateTransferStatus', 'updateTransfer', 'addTransfer', 'updateEnrollmentVerification', 'addShipment', 'updateShipmentStatus', 'updateShipment', 'deleteShipment', 'confirmReception'];
check('Las acciones que mueven stock o guardan Logística son asíncronas y devuelven { ok, error }', asyncActions.every(a => {
  const at = iface.indexOf(`\n  ${a}: `);
  const decl = iface.slice(at, at + 700).split('\n  ').slice(1).find(l => l.startsWith(`${a}: `)) ?? '';
  const end = iface.slice(at + 1).search(/\n  \w+: /);
  const block = iface.slice(at, end > 0 ? at + 1 + end : at + 700);
  return decl !== '' && /Promise<StockResult/.test(block);
}), asyncActions.filter(a => !new RegExp(`\\n  ${a}: [\\s\\S]*?Promise<StockResult`).test(iface)).join());
const gate = read('src/components/auth/AccessGate.tsx');
check('Logística se lee de la base al iniciar sesión (antes de montar el sistema), junto con roles, cuentas, sedes, catálogo y artículos',
  /loadLogistics\(logisticsRepo\)/.test(gate) && /loaded\.items, loaded\.logistics, loaded\.people, loaded\.money, loaded\.cashBoxes\)/.test(gate) && /logistics=\{logistics\}/.test(read('src/App.tsx')));
const hook = read('src/hooks/useLogistics.ts');
check('Después de cada operación se vuelve a leer lo que cambió (se muestra lo que de verdad quedó guardado) y el kardex solo pide lo nuevo',
  /settle/.test(hook) && /refreshLedger/.test(hook) && /kardexId: kardexRef\.current\[0\]\?\.id/.test(hook) && /kardexView\(kardexLines, names\)/.test(hook));
const kardexPage = read('src/pages/logistics/Kardex.tsx');
check('El Kardex muestra el historial que entrega el contexto (el de la base, con los nombres del artículo y del lugar)', /const \{[^}]*kardex[^}]*\} = useData\(\)/.test(kardexPage));

// Las pantallas esperan la respuesta de la base (no leen .ok de una promesa)
const pages = ['Stock', 'Adjustments', 'Receptions', 'Shipments', 'Transfers', 'Shipping'].map(n => [n, read(`src/pages/logistics/${n}.tsx`)] as const);
check('Las pantallas de Logística esperan (await) las acciones que guardan y apagan el botón mientras guardan', pages.every(([name, src]) => /await /.test(src) && (name === 'Shipping' || /disabled=\{[^}]*(saving|busy)/.test(src))), pages.filter(([name, src]) => !(/await /.test(src) && (name === 'Shipping' || /disabled=\{[^}]*(saving|busy)/.test(src)))).map(([n]) => n).join());
check('Caja y Verificación esperan la respuesta de la base antes de seguir', /await registerItemSale/.test(read('src/pages/Cash.tsx')) && /await reverseCashMovement/.test(read('src/pages/Cash.tsx')) && /await updateEnrollmentVerification/.test(read('src/pages/Verification.tsx')));
check('Ajustes y Stock dejan que el tipo defina el signo del ajuste (antes, en Stock, una merma con cantidad positiva sumaba stock)', /signedAdjustment/.test(read('src/pages/logistics/Stock.tsx')) && /signedAdjustment/.test(read('src/pages/logistics/Adjustments.tsx')));

if (failed > 0) {
  console.log(`\n${failed} comprobaciones fallaron.`);
  process.exit(1);
}
console.log('\nTodas las comprobaciones pasaron.');
void (null as unknown as Item);
