/**
 * Imprime una tabla como documento (el navegador permite «Guardar como PDF» en el diálogo de impresión).
 * El HTML se arma con los textos escapados y se imprime desde un iframe oculto, sin tocar la pantalla actual.
 */
export const escapeHtml = (v: unknown): string =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function tableDocumentHtml(title: string, subtitle: string, headers: string[], rows: (string | number | null | undefined)[][]): string {
  const head = headers.map(h => `<th>${escapeHtml(h)}</th>`).join('');
  const body = rows.map(r => `<tr>${r.map(c => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`).join('');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
    body{font-family:Arial,Helvetica,sans-serif;color:#1c1c1e;margin:24px}
    h1{font-size:18px;margin:0 0 4px} p{font-size:12px;color:#666;margin:0 0 16px}
    table{border-collapse:collapse;width:100%;font-size:11px}
    th{background:#f3f3f5;text-align:left;text-transform:uppercase;font-size:10px;letter-spacing:.04em}
    th,td{border:1px solid #d8d8dc;padding:5px 7px;vertical-align:top}
    @media print{body{margin:8mm}}
  </style></head><body><h1>${escapeHtml(title)}</h1><p>${escapeHtml(subtitle)}</p><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></body></html>`;
}

/** Imprime un documento HTML completo desde un iframe oculto (el navegador permite «Guardar como PDF»). */
export function printHtml(html: string): boolean {
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  if (!doc || !iframe.contentWindow) { document.body.removeChild(iframe); return false; }
  doc.open();
  doc.write(html);
  doc.close();
  const win = iframe.contentWindow;
  const cleanup = () => setTimeout(() => { if (iframe.parentNode) document.body.removeChild(iframe); }, 1000);
  win.onafterprint = cleanup;
  setTimeout(() => { win.focus(); win.print(); cleanup(); }, 100);
  return true;
}

/** Abre el diálogo de impresión con la tabla. Devuelve false si no hay filas. */
export function printTable(title: string, subtitle: string, headers: string[], rows: (string | number | null | undefined)[][]): boolean {
  if (rows.length === 0) return false;
  return printHtml(tableDocumentHtml(title, subtitle, headers, rows));
}

/** Descarga la tabla como imagen PNG (se dibuja en un canvas; no necesita librerías). Devuelve false si no hay filas. */
export function downloadTableImage(fileName: string, title: string, subtitle: string, headers: string[], rows: (string | number | null | undefined)[][]): boolean {
  if (rows.length === 0) return false;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  const scale = 2;
  const pad = 24;
  const rowH = 30;
  const font = '13px Arial, Helvetica, sans-serif';
  const bold = 'bold 13px Arial, Helvetica, sans-serif';
  const text = (v: unknown) => String(v ?? '');
  ctx.font = bold;
  const widths = headers.map((h, i) => {
    ctx.font = bold;
    let w = ctx.measureText(h).width;
    ctx.font = font;
    for (const r of rows) w = Math.max(w, ctx.measureText(text(r[i])).width);
    return Math.min(Math.ceil(w) + 20, 360);
  });
  const width = widths.reduce((a, b) => a + b, 0) + pad * 2;
  const height = pad * 2 + 52 + rowH * (rows.length + 1);
  canvas.width = width * scale;
  canvas.height = height * scale;
  ctx.scale(scale, scale);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#1c1c1e';
  ctx.font = 'bold 18px Arial, Helvetica, sans-serif';
  ctx.fillText(title, pad, pad + 14);
  ctx.fillStyle = '#666666';
  ctx.font = '12px Arial, Helvetica, sans-serif';
  ctx.fillText(subtitle, pad, pad + 34);
  const top = pad + 52;
  const clip = (t: string, max: number) => { let s = t; while (s.length > 1 && ctx.measureText(s).width > max) s = s.slice(0, -2); return s === t ? t : `${s}…`; };
  let x = pad;
  ctx.fillStyle = '#f3f3f5';
  ctx.fillRect(pad, top, width - pad * 2, rowH);
  headers.forEach((h, i) => { ctx.fillStyle = '#444444'; ctx.font = bold; ctx.fillText(clip(h, widths[i]! - 12), x + 8, top + 19); x += widths[i]!; });
  rows.forEach((r, ri) => {
    const y = top + rowH * (ri + 1);
    ctx.strokeStyle = '#d8d8dc';
    ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(width - pad, y); ctx.stroke();
    let cx = pad;
    r.forEach((c, i) => { ctx.fillStyle = '#1c1c1e'; ctx.font = font; ctx.fillText(clip(text(c), widths[i]! - 12), cx + 8, y + 19); cx += widths[i]!; });
  });
  ctx.strokeStyle = '#d8d8dc';
  ctx.strokeRect(pad, top, width - pad * 2, rowH * (rows.length + 1));
  canvas.toBlob(blob => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fileName;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 'image/png');
  return true;
}
