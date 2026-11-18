/**
 * Verificación de la lista de verificación impresa de un envío (resumen del envío → «Imprimir lista»):
 *  - el documento trae, por cada caja y por cada artículo, su casilla para marcar a mano, con el detalle y los totales correctos;
 *  - los textos van escapados (nada de lo escrito en una observación o en un nombre se ejecuta al imprimir);
 *  - un envío nuevo (sin código todavía) se identifica como «por confirmar»; uno que ya existe trae su código;
 *  - lo opcional (courier, guía, viajero, observación) solo aparece si existe;
 *  - la pantalla del envío tiene el botón y lo imprime desde un iframe oculto (`printHtml`).
 * Ejecutar: npx tsx scripts/check-shipment-print.ts
 */
import { readFileSync } from 'node:fs';
import { checklistTotals, shipmentChecklistHtml, type ShipmentChecklist } from '../src/utils/shipmentPrint';

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

const page = read('src/pages/logistics/Shipments.tsx');
check('El resumen del envío tiene el botón «Imprimir lista» y arma la hoja con las cajas y los artículos del formulario',
  /<Printer size=\{16\} \/>Imprimir lista/.test(page) && /onClick=\{handlePrintChecklist\}/.test(page) && /shipmentChecklistHtml\(\{/.test(page) && /boxes: boxes\.map\(b => \(\{/.test(page));
check('Se imprime desde un iframe oculto (printHtml) y, si el navegador no abre la impresión, avisa', /printHtml\(html\)/.test(page) && /No se pudo imprimir/.test(page));
check('El botón de imprimir está en el pie del resumen junto a «Volver a editar» y no depende de poder despachar',
  /<Button variant="secondary" onClick=\{handlePrintChecklist\}/.test(page) && !/handlePrintChecklist[^\n]*disabled/.test(page));

if (failed > 0) {
  console.log(`\n${failed} comprobaciones fallaron.`);
  process.exit(1);
}
console.log('\nTodas las comprobaciones pasaron.');
