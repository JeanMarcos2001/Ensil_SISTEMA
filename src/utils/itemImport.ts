/**
 * Carga masiva de libros desde un archivo CSV (funciones puras).
 *
 * El archivo se valida COMPLETO antes de guardar: si una fila tiene un error no se guarda nada (así el catálogo no queda a
 * medias) y se informa la línea y el motivo. Un libro con precio de venta mayor que cero queda marcado como vendible y su
 * precio general (USD) se registra aparte, con vigencia, como en la carga individual.
 */
import type { Item } from '../context/DataContext';

export const BULK_HEADERS = ['SKU', 'Nombre del libro', 'Estado', 'Unidad de medida', 'Costo referencial', 'Precio de venta', 'Descripción', 'Tipo de encuadernado'];
export const BULK_TEMPLATE_ROWS: string[][] = [
  ['LIB-K2-001', 'Libro Kids Nivel 2', 'Activo', 'Unidad', '42.50', '60', 'Libro de trabajo del nivel 2', 'Encolado'],
  ['LIB-K3-001', 'Libro Kids Nivel 3', 'Activo', 'Unidad', '45', '0', 'Material del programa (no se vende)', 'Anillado'],
];
export const MAX_ROWS = 500;
export const MAX_BYTES = 5 * 1024 * 1024;

const SKU_RE = /^[A-Z0-9][A-Z0-9._-]*$/;
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/** Lee un CSV (separador coma o punto y coma; comillas dobles; BOM). */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(x => x.trim() !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some(x => x.trim() !== '')) rows.push(row);
  return rows;
}

export interface BulkError {
  /** Número de línea en el archivo (la 1 es el encabezado). */
  line: number;
  message: string;
}

export interface BulkResult {
  items: Item[];
  /** Precios generales (USD) a registrar. */
  prices: { itemId: string; amount: number }[];
  errors: BulkError[];
}

const HEADER_KEYS = ['sku', 'nombre', 'estado', 'unidad', 'costo', 'precio', 'descripcion', 'encuadernado'];

export function buildBookBatch(rows: string[][], existing: Pick<Item, 'id'>[]): BulkResult {
  const result: BulkResult = { items: [], prices: [], errors: [] };
  if (rows.length === 0) { result.errors.push({ line: 1, message: 'El archivo está vacío.' }); return result; }
  const header = rows[0]!.map(norm);
  const col = HEADER_KEYS.map(key => header.findIndex(h => h.includes(key)));
  const missing = HEADER_KEYS.map((k, i) => (col[i]! < 0 ? BULK_HEADERS[i] : null)).filter(Boolean);
  if (missing.length > 0) {
    result.errors.push({ line: 1, message: `Faltan columnas en el encabezado: ${missing.join(', ')}.` });
    return result;
  }
  const body = rows.slice(1);
  if (body.length === 0) { result.errors.push({ line: 2, message: 'El archivo no tiene filas de libros.' }); return result; }
  if (body.length > MAX_ROWS) { result.errors.push({ line: 1, message: `El archivo tiene ${body.length} filas: el máximo es ${MAX_ROWS} por carga.` }); return result; }

  const seen = new Set<string>();
  body.forEach((r, i) => {
    const line = i + 2;
    const get = (k: number) => (r[col[k]!] ?? '').trim();
    const fail = (message: string) => result.errors.push({ line, message });
    const sku = get(0).toUpperCase();
    const name = get(1);
    const status = norm(get(2)) || 'activo';
    const unit = get(3) || 'Unidad';
    const costText = get(4).replace(',', '.');
    const priceText = get(5).replace(',', '.');
    const binding = norm(get(7));
    let ok = true;
    if (!sku) { fail('Falta el SKU.'); ok = false; }
    else if (!SKU_RE.test(sku) || sku.length > 30) { fail(`El SKU «${get(0)}» no es válido (solo letras, números, punto, guion; máximo 30).`); ok = false; }
    else if (existing.some(e => e.id.toUpperCase() === sku)) { fail(`El SKU ${sku} ya existe en el catálogo.`); ok = false; }
    else if (seen.has(sku)) { fail(`El SKU ${sku} está repetido en el archivo.`); ok = false; }
    if (!name) { fail('Falta el nombre del libro.'); ok = false; }
    if (!['activo', 'inactivo'].includes(status)) { fail(`El estado «${get(2)}» no es válido (Activo o Inactivo).`); ok = false; }
    const cost = costText === '' ? 0 : Number(costText);
    if (!Number.isFinite(cost) || cost < 0) { fail(`El costo «${get(4)}» no es un número válido.`); ok = false; }
    const price = priceText === '' ? 0 : Number(priceText);
    if (!Number.isFinite(price) || price < 0) { fail(`El precio de venta «${get(5)}» no es un número válido.`); ok = false; }
    if (!['anillado', 'encolado'].includes(binding)) { fail('El tipo de encuadernado debe ser Anillado o Encolado.'); ok = false; }
    if (sku) seen.add(sku);
    if (!ok) return;
    result.items.push({
      id: sku, name, status: status === 'activo' ? 'Activo' : 'Inactivo', type: 'Libro', description: get(6), unit,
      cost: Math.round(cost * 100) / 100, isSold: price > 0, isDeliveredOnEnrollment: false, isPackage: false, allowUnpacking: false,
      bookType: 'Individual', bindingType: binding === 'anillado' ? 'Anillado' : 'Encolado',
    });
    if (price > 0) result.prices.push({ itemId: sku, amount: Math.round(price * 100) / 100 });
  });
  return result;
}
