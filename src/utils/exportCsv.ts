/**
 * Exportación a CSV (funciones puras + descarga). El archivo lleva BOM para que Excel respete las tildes.
 * Las celdas con comas, comillas o saltos de línea se entrecomillan; los valores que empiezan con = + - @ se neutralizan
 * para que Excel no los interprete como fórmulas.
 */
export type CsvCell = string | number | boolean | null | undefined;

const cell = (v: CsvCell): string => {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (/^[=+@]/.test(s) || (/^-/.test(s) && Number.isNaN(Number(s)))) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(headers: string[], rows: CsvCell[][]): string {
  return [headers, ...rows].map(r => r.map(cell).join(',')).join('\r\n');
}

/** Nombre de archivo seguro: «Pagos» + fecha → `pagos_2026-10-23.csv`. */
export function csvFileName(base: string, isoDate: string): string {
  const slug = base.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return `${slug || 'exportacion'}_${isoDate}.csv`;
}

/** Descarga el CSV en el navegador. Devuelve false si no hay filas que exportar. */
export function downloadCsv(fileName: string, headers: string[], rows: CsvCell[][]): boolean {
  if (rows.length === 0) return false;
  const blob = new Blob(['﻿', toCsv(headers, rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return true;
}
