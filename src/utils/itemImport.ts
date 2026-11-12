/**
 * Carga masiva de libros desde un archivo CSV (funciones puras).
 *
 * El archivo se valida COMPLETO antes de guardar: si una fila tiene un error no se guarda nada (así el catálogo no queda a
 * medias) y se informa la línea y el motivo. **Todo libro lleva su precio de referencia** (obligatorio, mayor que cero): es el precio con
 * el que se vende si hace falta, y se registra aparte, con vigencia, como en la carga individual. Los libros se entregan con la
 * matrícula (pueden ir en las recetas); se puede cambiar después en el catálogo.
 *
 * El archivo NO trae SKU: el sistema asigna el de cada libro al guardar (ITM-LIB-004, ITM-LIB-005…). Un archivo con la columna «SKU» de la plantilla
 * anterior sigue sirviendo: esa columna se ignora. Lo que evita cargar dos veces el mismo libro es el nombre (no se repite con un libro del catálogo
 * ni dentro del archivo).
 */
import type { Item } from '../context/DataContext';
import { ITEM_UNITS, normalizeName, type ItemDraft } from './inventory';

export const BULK_HEADERS = ['Nombre del libro', 'Estado', 'Unidad de medida', 'Costo referencial', 'Precio de referencia', 'Descripción', 'Tipo de encuadernado'];
export const BULK_TEMPLATE_ROWS: string[][] = [
  ['Libro Kids Nivel 2', 'Activo', 'Unidad', '42.50', '60', 'Libro de trabajo del nivel 2', 'Encolado'],
  ['Libro Kids Nivel 3', 'Activo', 'Unidad', '45', '55', 'Libro de trabajo del nivel 3', 'Anillado'],
];
export const MAX_ROWS = 500;
export const MAX_BYTES = 5 * 1024 * 1024;

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
  /** Los libros por crear, sin SKU (lo asigna el sistema), cada uno con su precio de referencia general (USD). */
  drafts: ItemDraft[];
  errors: BulkError[];
}

const HEADER_KEYS = ['nombre', 'estado', 'unidad', 'costo', 'precio', 'descripcion', 'encuadernado'];

export function buildBookBatch(rows: string[][], existing: Pick<Item, 'name' | 'type'>[]): BulkResult {
  const result: BulkResult = { drafts: [], errors: [] };
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

  const known = new Set(existing.filter(e => e.type === 'Libro').map(e => normalizeName(e.name)));
  const seen = new Set<string>();
  body.forEach((r, i) => {
    const line = i + 2;
    const get = (k: number) => (r[col[k]!] ?? '').trim();
    const fail = (message: string) => result.errors.push({ line, message });
    const name = get(0);
    const status = norm(get(1)) || 'activo';
    const unitText = get(2) || 'Unidad';
    const unit = ITEM_UNITS.find(u => norm(u) === norm(unitText));
    const costText = get(3).replace(',', '.');
    const priceText = get(4).replace(',', '.');
    const binding = norm(get(6));
    let ok = true;
    const key = normalizeName(name);
    if (!name) { fail('Falta el nombre del libro.'); ok = false; }
    else if (known.has(key)) { fail(`Ya existe un libro con el nombre «${name}» en el catálogo.`); ok = false; }
    else if (seen.has(key)) { fail(`El libro «${name}» está repetido en el archivo.`); ok = false; }
    if (!['activo', 'inactivo'].includes(status)) { fail(`El estado «${get(1)}» no es válido (Activo o Inactivo).`); ok = false; }
    const cost = costText === '' ? 0 : Number(costText);
    if (!Number.isFinite(cost) || cost < 0) { fail(`El costo «${get(3)}» no es un número válido.`); ok = false; }
    const price = priceText === '' ? 0 : Number(priceText);
    if (!Number.isFinite(price) || !(price > 0)) { fail(get(4) === '' ? 'Falta el precio de referencia (mayor a 0).' : `El precio de referencia «${get(4)}» debe ser un número mayor a 0.`); ok = false; }
    if (!unit) { fail(`La unidad de medida «${unitText}» no es válida (${ITEM_UNITS.join(', ')}).`); ok = false; }
    if (!['anillado', 'encolado'].includes(binding)) { fail('El tipo de encuadernado debe ser Anillado o Encolado.'); ok = false; }
    if (name) seen.add(key);
    if (!ok) return;
    result.drafts.push({
      item: {
        name, status: status === 'activo' ? 'Activo' : 'Inactivo', type: 'Libro', description: get(5), unit: unit!,
        cost: Math.round(cost * 100) / 100, isDeliveredOnEnrollment: true, isPackage: false,
        bookType: 'Individual', bindingType: binding === 'anillado' ? 'Anillado' : 'Encolado',
      },
      price: Math.round(price * 100) / 100,
    });
  });
  return result;
}
