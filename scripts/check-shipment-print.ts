/**
 * Verificación de la lista de verificación impresa de un envío o una transferencia («Imprimir lista» en la tarjeta del envío desde «Empacando» y en el resumen de la transferencia):
 *  - el documento trae, por cada caja y por cada artículo, su casilla para marcar a mano, con el detalle y los totales correctos;
 *  - los textos van escapados (nada de lo escrito en una observación o en un nombre se ejecuta al imprimir);
 *  - un envío nuevo (sin código todavía) se identifica como «por confirmar»; uno que ya existe trae su código;
 *  - lo opcional (courier, guía, viajero, observación) solo aparece si existe;
 *  - sin cajas todavía (recién en «Empacando») se imprime la lista general de artículos, y una transferencia lleva su propio título;
 *  - el texto para compartir por WhatsApp lleva ruta, llegada, transporte, cajas y totales;
 *  - las pantallas tienen el botón y lo imprimen desde un iframe oculto (`printHtml`).
 * Ejecutar: npx tsx scripts/check-shipment-print.ts
 */
import { readFileSync } from 'node:fs';
import { checklistFromShipment, checklistTotals, shipmentChecklistHtml, shipmentShareText, whatsappShareUrl, type ShipmentChecklist } from '../src/utils/shipmentPrint';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : ` -> ${detail}`}`);
  if (!ok) failed++;
};
const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

const base: ShipmentChecklist = {
  originName: 'Almacén Central',
  destinationName: 'Chiclayo',
  createdLabel: '18/11/2026',
  arrivalLabel: '20/11/2026 6 p. m.',
  methodName: 'Courier',
  courierName: 'Olva Courier',
  trackingNumber: 'TRF-2321',
  boxes: [
    { number: '1', items: [{ name: 'Mochila Institucional', quantity: 5 }, { name: 'Cartuchera', quantity: 5 }] },
    { number: '2', observation: 'Frágil', items: [{ name: 'Libro Nivel 1', quantity: 12 }] },
  ],
};
const html = shipmentChecklistHtml(base, '18/11/26 4:30 p. m.');
const count = (re: RegExp) => (html.match(re) ?? []).length;

const totals = checklistTotals(base.boxes);
check('Los totales: 2 cajas, 3 artículos distintos y 22 unidades', totals.boxes === 2 && totals.lines === 3 && totals.units === 22, JSON.stringify(totals));
check('Una caja sin artículos suma cero y no rompe', JSON.stringify(checklistTotals([{ number: '1', items: [] }])) === JSON.stringify({ boxes: 1, lines: 0, units: 0 }));

check('Es un documento completo en español para imprimir', /^<!doctype html><html lang="es">/.test(html) && /<title>Lista de verificación del envío<\/title>/.test(html) && /@media print/.test(html));
check('Cada artículo tiene su casilla y cada caja la suya (3 artículos + 2 cajas = 5 casillas dibujadas)', count(/<span class="chk"><\/span>/g) === 5, String(count(/<span class="chk"><\/span>/g)));
check('Las casillas son cuadros vacíos para marcar a mano (borde visible, sin relleno)', /\.chk\{[^}]*border:1\.6px solid #1c1c1e[^}]*\}/.test(html) && !/\.chk\{[^}]*background/.test(html));
check('Muestra las cajas con su detalle: artículo y cantidad', /Caja 1/.test(html) && /Caja 2/.test(html) && /Mochila Institucional/.test(html) && /5 unid\./.test(html) && /12 unid\./.test(html));
check('Cada caja dice cuántos artículos y unidades lleva', /2 artículos · 10 unidades/.test(html) && /1 artículo · 12 unidades/.test(html));
check('La observación de la caja sale en su encabezado', /<span class="obs">Frágil<\/span>/.test(html));
check('Una caja no se parte entre dos hojas', /\.box\{[^}]*break-inside:avoid/.test(html) && /page-break-inside:avoid/.test(html));
check('Al final trae el total: cajas, artículos y unidades', /<b>Total:<\/b> 2 cajas · 3 artículos · 22 unidades/.test(html));
check('Trae origen, destino, fechas y método; el courier y la guía cuando existen',
  /Origen<\/span><b>Almacén Central<\/b>/.test(html) && /Destino<\/span><b>Chiclayo<\/b>/.test(html) && /Fecha de creación<\/span><b>18\/11\/2026<\/b>/.test(html)
  && /Fecha de llegada<\/span><b>20\/11\/2026 6 p\. m\.<\/b>/.test(html) && /Courier<\/span><b>Olva Courier<\/b>/.test(html) && /Guía<\/span><b>TRF-2321<\/b>/.test(html));
check('Un envío nuevo se identifica como «por confirmar» (el código lo asigna la base al confirmar) y trae cuándo se imprimió',
  /Envío por confirmar/.test(html) && /Impreso el 18\/11\/26 4:30 p\. m\./.test(html));
check('Un envío que ya existe trae su código', /Envío ENV-2026-004/.test(shipmentChecklistHtml({ ...base, code: 'ENV-2026-004' })));
const minimal = shipmentChecklistHtml({ ...base, courierName: undefined, trackingNumber: undefined, travelerName: undefined, observation: undefined });
check('Lo opcional solo aparece si existe: sin courier, guía, viajero ni observación no hay filas vacías', !/Courier<\/span>/.test(minimal) && !/Guía<\/span>/.test(minimal) && !/Viajero<\/span>/.test(minimal) && !/Observación:/.test(minimal) && !/Impreso el/.test(minimal));
check('Con viajero y observación general, salen', /Viajero<\/span><b>Pedro Ruiz<\/b>/.test(shipmentChecklistHtml({ ...base, travelerName: 'Pedro Ruiz' })) && /<b>Observación:<\/b> Entregar en recepción/.test(shipmentChecklistHtml({ ...base, observation: 'Entregar en recepción' })));

const hostile = shipmentChecklistHtml({
  ...base, destinationName: '<img src=x onerror=alert(1)>', observation: '"><script>alert(2)</script>',
  boxes: [{ number: '1', observation: '<b>x</b>', items: [{ name: '<script>alert(3)</script>', quantity: 1 }] }],
});
check('Los textos van escapados: un nombre u observación con etiquetas no se ejecuta al imprimir',
  !/<script>/.test(hostile) && !/<img /.test(hostile) && /&lt;script&gt;alert\(3\)&lt;\/script&gt;/.test(hostile) && /&lt;img src=x onerror=alert\(1\)&gt;/.test(hostile));

// Sin cajas todavía: la lista general, con su casilla por artículo
const general = shipmentChecklistHtml({ ...base, boxes: [], lines: [{ name: 'Mochila Institucional', quantity: 5 }, { name: 'Libro Nivel 1', quantity: 12 }] });
check('Sin cajas se imprime la lista general de artículos, cada uno con su casilla, y sus totales sin cajas',
  /Artículos a enviar/.test(general) && (general.match(/<span class="chk"><\/span>/g) ?? []).length === 2 && /<b>Total:<\/b> 2 artículos · 17 unidades/.test(general) && !/Caja 1/.test(general));
check('Con cajas no se repite la lista general', !/Artículos a enviar/.test(shipmentChecklistHtml({ ...base, lines: [{ name: 'Mochila Institucional', quantity: 5 }] })));
const trf = shipmentChecklistHtml({ ...base, kind: 'Transferencia', code: 'TRF-2026-003' });
check('Una transferencia lleva su propio título y código', /<title>Lista de verificación de la transferencia<\/title>/.test(trf) && /Transferencia TRF-2026-003/.test(trf) && !/Envío TRF/.test(trf));
check('Una transferencia nueva se identifica como «por confirmar»', /Transferencia por confirmar/.test(shipmentChecklistHtml({ ...base, kind: 'Transferencia' })));

// La hoja de un envío tal como está guardado (o se está editando)
const names = { place: (id: string) => ({ 'ALM-001': 'Almacén Central', 'FIL-003': 'Chiclayo' } as Record<string, string>)[id] ?? id, item: (id: string) => ({ A: 'Mochila', B: 'Libro' } as Record<string, string>)[id] ?? '?', method: (id?: string) => (id === 'SM-1' ? 'Courier' : ''), courier: (id?: string) => (id === 'C-1' ? 'Olva' : undefined) };
const fromShipment = checklistFromShipment({
  id: 'ENV-2026-007', date: '2026-11-18', originId: 'ALM-001', destinationId: 'FIL-003', items: [{ itemId: 'A', quantity: 5 }, { itemId: 'B', quantity: 2 }],
  boxes: [{ id: 'b1', boxNumber: '1', observation: 'Frágil', items: [{ itemId: 'A', quantity: 5 }] }], eta: '2026-11-20', etaTime: '18:00', shippingMethodId: 'SM-1', courierId: 'C-1', trackingNumber: 'G-1',
}, names);
check('La hoja sale de lo guardado con los nombres de lugares, artículos, método y courier (nada de ids)',
  fromShipment.code === 'ENV-2026-007' && fromShipment.originName === 'Almacén Central' && fromShipment.destinationName === 'Chiclayo' && fromShipment.methodName === 'Courier' && fromShipment.courierName === 'Olva'
  && fromShipment.arrivalLabel === '20/11/2026 6 p. m.' && fromShipment.createdLabel === '18/11/2026' && fromShipment.boxes[0].items[0].name === 'Mochila' && fromShipment.lines?.[1].name === 'Libro' && fromShipment.boxes[0].observation === 'Frágil');
check('Sin fecha de llegada (todavía en «Empacando») la hoja sale sin ella y sin método', checklistFromShipment({ id: 'ENV-2026-008', date: '2026-11-18', originId: 'ALM-001', destinationId: 'FIL-003', items: [], boxes: [] }, names).arrivalLabel === '');

// Compartir por WhatsApp
const share = shipmentShareText({ ...fromShipment, observation: 'Entregar en recepción' });
check('El texto para WhatsApp trae el envío, la ruta, la llegada, el transporte, las cajas, el total y la observación',
  /\*Envío ENV-2026-007\*/.test(share) && /Almacén Central → Chiclayo/.test(share) && /Llegada: 20\/11\/2026 6 p\. m\./.test(share) && /Método: Courier \(Olva\) · Guía G-1/.test(share)
  && /Caja 1: 5 × Mochila/.test(share) && /Total: 1 caja · 1 artículo · 5 unidades/.test(share) && /Observación: Entregar en recepción/.test(share), share);
const shareNoBoxes = shipmentShareText({ ...fromShipment, boxes: [], arrivalLabel: '', methodName: '', courierName: undefined, trackingNumber: undefined });
check('Sin cajas comparte la lista general y no inventa llegada ni método', /Artículos: 5 × Mochila, 2 × Libro/.test(shareNoBoxes) && !/Llegada:/.test(shareNoBoxes) && !/Método:/.test(shareNoBoxes) && /Total: 2 artículos · 7 unidades/.test(shareNoBoxes), shareNoBoxes);
check('El enlace abre WhatsApp con el texto codificado (la persona elige a quién se lo manda; el sistema no envía nada)',
  whatsappShareUrl('Hola\nÁbaco & más').startsWith('https://wa.me/?text=') && decodeURIComponent(whatsappShareUrl('Hola\nÁbaco & más').slice('https://wa.me/?text='.length)) === 'Hola\nÁbaco & más');

// Las pantallas
const work = read('src/components/logistics/ShipmentWorkModal.tsx');
const boxesEditor = read('src/components/logistics/ShipmentBoxesEditor.tsx');
const dispatchEditor = read('src/components/logistics/ShipmentDispatchEditor.tsx');
const transfers = read('src/pages/logistics/Transfers.tsx');
check('«Imprimir lista» está en «Empacando» y en «Por despachar» (aún no en «Por armar»: ahí solo se arma la lista) y se arma con lo que se está editando',
  /<Printer size=\{16\} \/>Imprimir lista/.test(boxesEditor) && /<Printer size=\{16\} \/>Imprimir lista/.test(dispatchEditor) && !/Printer/.test(read('src/components/logistics/ShipmentListEditor.tsx'))
  && /onPrint=\{boxes => print\(shipment, \{ boxes \}\)\}/.test(work) && /onPrint=\{draft => print\(shipment, asShipment\(draft\)\)\}/.test(work));
check('También se imprime un envío que ya salió (para consultarlo)', /Imprimir lista<\/Button>/.test(work) && /onClick=\{\(\) => print\(shipment\)\}/.test(work));
check('Se imprime desde un iframe oculto (printHtml) y, si el navegador no abre la impresión, avisa', /printHtml\(html\)/.test(work) && /No se pudo imprimir/.test(work));
check('«Compartir por WhatsApp» abre el chat con el texto ya escrito en una pestaña nueva y sin dar acceso a la ventana del sistema',
  /Compartir por WhatsApp/.test(dispatchEditor) && /window\.open\(whatsappShareUrl\(text\), '_blank', 'noopener,noreferrer'\)/.test(work));
check('El resumen del despacho de una transferencia tiene «Imprimir lista» (con su propio título) y no depende de poder despachar',
  /<Printer size=\{16\} \/>Imprimir lista/.test(transfers) && /kind: 'Transferencia'/.test(transfers) && /printHtml\(html\)/.test(transfers) && !/handlePrintChecklist[^\n]*disabled/.test(transfers));

if (failed > 0) {
  console.log(`\n${failed} comprobaciones fallaron.`);
  process.exit(1);
}
console.log('\nTodas las comprobaciones pasaron.');
