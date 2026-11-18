/**
 * La lista de verificación impresa de un envío: las cajas y los artículos de cada una, cada uno con su casilla para marcar a mano, de modo que quien
 * prepara el envío compruebe que lo que sale del almacén es lo que dice el sistema. Función pura: arma el HTML (con los textos escapados); quien llama lo
 * imprime con `printHtml` (`utils/printTable.ts`), desde un iframe oculto, sin tocar la pantalla.
 */
import { escapeHtml } from './printTable';

export interface ChecklistItem { name: string; quantity: number }
export interface ChecklistBox { number: string; observation?: string; items: ChecklistItem[] }

export interface ShipmentChecklist {
  /** Código del envío, si ya existe (un envío nuevo todavía no lo tiene: lo asigna la base al confirmar). */
  code?: string;
  originName: string;
  destinationName: string;
  /** Las fechas ya con su formato de pantalla (por ejemplo «18/11/2026» y «20/11/2026 6 p. m.»). */
  createdLabel: string;
  arrivalLabel: string;
  methodName: string;
  courierName?: string;
  trackingNumber?: string;
  travelerName?: string;
  observation?: string;
  boxes: ChecklistBox[];
}

export interface ChecklistTotals { boxes: number; lines: number; units: number }

/** Cuántas cajas, artículos distintos (líneas) y unidades salen en total. */
export function checklistTotals(boxes: ChecklistBox[]): ChecklistTotals {
  return {
    boxes: boxes.length,
    lines: boxes.reduce((n, b) => n + b.items.length, 0),
    units: boxes.reduce((n, b) => n + b.items.reduce((u, i) => u + (Number(i.quantity) || 0), 0), 0),
  };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** El documento completo (HTML) de la lista de verificación. `printedAt` es la fecha y hora de impresión, ya con su formato. */
export function shipmentChecklistHtml(s: ShipmentChecklist, printedAt?: string): string {
  const totals = checklistTotals(s.boxes);
  const meta: [string, string | undefined][] = [
    ['Origen', s.originName],
    ['Destino', s.destinationName],
    ['Fecha de creación', s.createdLabel],
    ['Fecha de llegada', s.arrivalLabel],
    ['Método de envío', s.methodName],
    ['Courier', s.courierName],
    ['Guía', s.trackingNumber],
    ['Viajero', s.travelerName],
  ];
  const metaHtml = meta
    .filter(([, value]) => !!value && String(value).trim() !== '')
    .map(([label, value]) => `<div class="m"><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`)
    .join('');

  const boxesHtml = s.boxes.map(box => {
    const units = box.items.reduce((u, i) => u + (Number(i.quantity) || 0), 0);
    const rows = box.items.map(i =>
      `<tr><td class="c"><span class="chk"></span></td><td>${escapeHtml(i.name)}</td><td class="q">${escapeHtml(i.quantity)} unid.</td></tr>`).join('');
    return `<section class="box">
      <div class="bh"><span class="chk"></span><b>Caja ${escapeHtml(box.number)}</b><span class="sub">${escapeHtml(plural(box.items.length, 'artículo', 'artículos'))} · ${escapeHtml(plural(units, 'unidad', 'unidades'))}</span>${box.observation ? `<span class="obs">${escapeHtml(box.observation)}</span>` : ''}</div>
      <table><thead><tr><th class="c"></th><th>Artículo</th><th class="q">Cantidad</th></tr></thead><tbody>${rows}</tbody></table>
    </section>`;
  }).join('');

  const title = 'Lista de verificación del envío';
  const code = s.code ? `Envío ${s.code}` : 'Envío por confirmar';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
    *{box-sizing:border-box}
    body{font-family:Arial,Helvetica,sans-serif;color:#1c1c1e;margin:24px}
    h1{font-size:18px;margin:0 0 2px} .sub0{font-size:12px;color:#666;margin:0 0 14px}
    .meta{display:grid;grid-template-columns:repeat(2,1fr);gap:6px 24px;border:1px solid #d8d8dc;border-radius:6px;padding:10px 12px;margin-bottom:14px}
    .m{font-size:12px;display:flex;gap:8px} .m span{color:#666;min-width:104px}
    .note{font-size:12px;margin:0 0 14px} .note b{color:#444}
    .box{border:1px solid #bdbdc2;border-radius:6px;margin-bottom:12px;break-inside:avoid;page-break-inside:avoid;overflow:hidden}
    .bh{display:flex;align-items:center;gap:10px;background:#f3f3f5;padding:8px 10px;font-size:13px;border-bottom:1px solid #bdbdc2}
    .bh .sub{color:#666;font-size:11px} .bh .obs{margin-left:auto;font-size:11px;color:#444;font-style:italic}
    table{border-collapse:collapse;width:100%;font-size:12px}
    th{text-align:left;text-transform:uppercase;font-size:10px;letter-spacing:.04em;color:#666;padding:5px 10px;border-bottom:1px solid #d8d8dc}
    td{padding:7px 10px;border-bottom:1px solid #ececef} tr:last-child td{border-bottom:0}
    .c{width:34px} .q{width:90px;text-align:right}
    .chk{display:inline-block;width:15px;height:15px;border:1.6px solid #1c1c1e;border-radius:3px;vertical-align:middle;flex:none}
    .tot{font-size:13px;margin-top:6px;text-align:right}
    @media print{body{margin:10mm}}
  </style></head><body>
    <h1>${escapeHtml(title)}</h1>
    <p class="sub0">${escapeHtml(code)}${printedAt ? ` · Impreso el ${escapeHtml(printedAt)}` : ''}</p>
    <div class="meta">${metaHtml}</div>
    ${s.observation && s.observation.trim() ? `<p class="note"><b>Observación:</b> ${escapeHtml(s.observation)}</p>` : ''}
    ${boxesHtml}
    <p class="tot"><b>Total:</b> ${escapeHtml(plural(totals.boxes, 'caja', 'cajas'))} · ${escapeHtml(plural(totals.lines, 'artículo', 'artículos'))} · ${escapeHtml(plural(totals.units, 'unidad', 'unidades'))}</p>
  </body></html>`;
}
