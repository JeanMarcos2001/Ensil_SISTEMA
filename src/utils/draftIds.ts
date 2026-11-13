/**
 * Códigos del dinero que asigna la BASE (no la pantalla). Funciones puras.
 *
 * Antes cada pantalla inventaba el código con lo que veía: el más alto de SU sede, más uno. Como cada cuenta ve solo sus sedes, dos sedes podían
 * proponer el mismo código (la base rechazaba el repetido y el reintento volvía a proponer el mismo) y los números de contrato, ficha, lote de
 * depósito y nota de crédito ni siquiera estaban protegidos: dos sedes podían emitir el mismo sin aviso.
 *
 * Ahora la pantalla arma todo con un código de BORRADOR (`MAT-2026-~1~`, `PAG-~2~`, `BC01-~3~`…) donde antes iba el código. Al guardar, la base:
 *  1. se pone en fila (un candado por tipo de código, hasta el final de la operación),
 *  2. mira el código más alto que existe en TODAS las sedes (aunque la cuenta no las vea) y entrega los siguientes, en el orden de los borradores,
 *  3. cambia cada borrador por su código real en todas partes (filas, referencias entre ellas y también dentro de los textos) y guarda,
 *  4. devuelve la lista «borrador → código real».
 * Si algo falla, todo se deshace y los números quedan libres: sin repetidos y sin huecos. La pantalla vuelve a leer lo guardado y completa con el
 * código real lo que sigue solo en memoria (agenda, avisos).
 *
 * Esto es el espejo en TypeScript de `public.aplicar_cambios_matricula` (migración 0019): lo usan el repositorio en memoria de los `check-*` y
 * la pantalla (`replaceDraftIds`); `check-draft-ids.ts` compara ambos con la migración.
 *
 * Personal, asignaciones, contratos de personal y ajustes de planilla funcionan igual (migración 0020, `STAFF_CODE_KINDS`), pero sin envío de
 * cambios: la ficha y la asignación se guardan con un `insert` y la base cambia el borrador del id (y el código de seis dígitos de la ficha) con un
 * disparador; los contratos y los ajustes se guardan con funciones que asignan el código y lo devuelven. Aquí solo se arma el borrador (`draftId`);
 * `check-staff-codes.ts` compara los tipos con la migración.
 */
import type { MoneyRows } from './moneyDb';

/** Qué códigos asigna la base: si llevan año (`MAT-2026-001`) y a cuántos dígitos se rellenan. `BC01` y `FC01` son las series de las notas de crédito. */
export const CODE_KINDS = {
  MAT: { year: true, pad: 3 }, PLN: { year: false, pad: 3 }, PAG: { year: false, pad: 3 }, PGR: { year: false, pad: 3 }, CJ: { year: false, pad: 3 },
  NC: { year: false, pad: 3 }, CAI: { year: false, pad: 3 }, SOL: { year: false, pad: 3 }, COR: { year: false, pad: 3 }, DEP: { year: false, pad: 3 },
  CTR: { year: true, pad: 3 }, FIC: { year: true, pad: 3 },
  BC01: { year: false, pad: 6 }, FC01: { year: false, pad: 6 },
} as const;
export type CodeKind = keyof typeof CODE_KINDS;

/**
 * Los códigos de Personal (migración 0020): la ficha (`STF`), la asignación (`ASG`), el contrato de personal (`CON`) y el ajuste de planilla
 * (`AJU`). No llevan año. Van aparte de `CODE_KINDS` porque no viajan dentro del envío de cambios del dinero: los asigna la base al guardar su fila.
 */
export const STAFF_CODE_KINDS = {
  STF: { year: false, pad: 3 }, ASG: { year: false, pad: 3 }, CON: { year: false, pad: 3 }, AJU: { year: false, pad: 3 },
} as const;
export type StaffCodeKind = keyof typeof STAFF_CODE_KINDS;

/** El borrador tiene el mismo aspecto que el código, con el número entre `~` (`~1~` no es parte de `~10~`: se cierra con el mismo signo). */
const TOKEN = /([A-Z][A-Z0-9]{1,3})-(?:(\d{4})-)?~(\d+)~/g;
const DRAFT_ONLY = /^[A-Z][A-Z0-9]{1,3}-(?:\d{4}-)?~\d+~$/;

let sequence = 0;

/** Un código de borrador nuevo (el número solo ordena: la base entrega los códigos reales en ese orden). */
export function draftId(kind: CodeKind | StaffCodeKind, year?: number): string {
  const k: { year: boolean } | undefined = (CODE_KINDS as Record<string, { year: boolean }>)[kind] ?? (STAFF_CODE_KINDS as Record<string, { year: boolean }>)[kind];
  if (!k) throw new Error(`El código «${kind}» no lo asigna la base.`);
  if (k.year && (year === undefined || !Number.isInteger(year))) throw new Error(`El código «${kind}» lleva año.`);
  if (!k.year && year !== undefined) throw new Error(`El código «${kind}» no lleva año.`);
  sequence += 1;
  return `${kind}-${k.year ? `${year}-` : ''}~${sequence}~`;
}

export const isDraftId = (id: string | undefined | null): boolean => !!id && DRAFT_ONLY.test(id);

export interface DraftToken { token: string; prefix: string; year?: number; n: number }

/** Los borradores distintos que hay en un texto, ordenados por tipo, año y número (el orden en que la base entrega los códigos). */
export function draftTokens(text: string): DraftToken[] {
  const seen = new Map<string, DraftToken>();
  for (const m of text.matchAll(TOKEN)) {
    if (!seen.has(m[0])) seen.set(m[0], { token: m[0], prefix: m[1], ...(m[2] ? { year: Number(m[2]) } : {}), n: Number(m[3]) });
  }
  return [...seen.values()].sort((a, b) => (a.prefix < b.prefix ? -1 : a.prefix > b.prefix ? 1 : (a.year ?? 0) - (b.year ?? 0) || a.n - b.n));
}

/** El código más alto que existe para un tipo (y año), en toda la base. */
export type Highest = (prefix: string, year?: number) => number;

const padded = (n: number, pad: number) => String(n).padStart(pad, '0');

/** Cambia en un valor (texto, lista u objeto, a cualquier profundidad) cada borrador por su código real. Lo que no esté en la lista no se toca. */
export function replaceDraftIds<T>(value: T, codes: Record<string, string>): T {
  if (Object.keys(codes).length === 0) return value;
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return v.replace(TOKEN, t => codes[t] ?? t);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(value) as T;
}

/**
 * Entrega los códigos reales de todos los borradores del envío y los pone en su lugar. `highest` dice cuál es el más alto que existe hoy.
 * En las notas de crédito del sistema, el correlativo sale del código recién entregado (la serie y el número son uno solo).
 */
export function assignDraftIds<P>(payload: P, highest: Highest): { payload: P; codes: Record<string, string> } {
  const tokens = draftTokens(JSON.stringify(payload));
  const codes: Record<string, string> = {};
  let group = '';
  let base = 0;
  let given = 0;
  for (const t of tokens) {
    const kind = CODE_KINDS[t.prefix as CodeKind];
    if (!kind) throw new Error(`El código «${t.prefix}» no lo asigna el sistema.`);
    if (kind.year && t.year === undefined) throw new Error(`El código «${t.prefix}» lleva año.`);
    if (!kind.year && t.year !== undefined) throw new Error(`El código «${t.prefix}» no lleva año.`);
    const key = `${t.prefix}|${t.year ?? ''}`;
    if (key !== group) { group = key; base = highest(t.prefix, t.year); given = 0; }
    given += 1;
    codes[t.token] = `${t.prefix}-${t.year !== undefined ? `${t.year}-` : ''}${padded(base + given, kind.pad)}`;
  }
  const out = replaceDraftIds(payload, codes) as P & { notas?: Record<string, unknown>[] };
  // El correlativo de una nota emitida por el sistema es el número de su etiqueta (BC01-000012 → 12)
  if (Array.isArray(out.notas)) {
    out.notas = out.notas.map(n => (n._nueva && n.origen === 'sistema' ? { ...n, correlativo: Number(/-(\d+)$/.exec(String(n.etiqueta))?.[1] ?? 0) } : n));
  }
  return { payload: out, codes };
}

/** De qué tipo es el código de cada fila nueva de cada tabla del envío (una solicitud: CAI si es de caída, SOL si es de otro cambio). */
const NEW_ROW_KIND: Record<string, (fila: Record<string, unknown>) => CodeKind> = {
  grupos: () => 'PGR', matriculas: () => 'MAT', planes: () => 'PLN', pagos: () => 'PAG', movimientos: () => 'CJ', notas: () => 'NC',
  solicitudes: f => (f.tipo === 'Caída' ? 'CAI' : 'SOL'), correcciones: () => 'COR',
};

/**
 * Lo que la base exige antes de asignar: el código de toda fila NUEVA debe ser un borrador del tipo que le toca (nadie escribe un código a mano,
 * tampoco una pantalla desactualizada), y una nota del sistema lleva el borrador de su serie. Devuelve el motivo, o `null` si todo está bien.
 */
export function draftPayloadProblem(payload: Record<string, unknown>): string | null {
  const STALE = 'Esta pantalla está desactualizada: el código de un registro nuevo lo asigna el sistema. Recargue la página e intente de nuevo.';
  for (const [table, kindOf] of Object.entries(NEW_ROW_KIND)) {
    const rows = payload[table];
    if (!Array.isArray(rows)) continue;
    for (const row of rows as Record<string, unknown>[]) {
      if (!row._nueva) continue;
      const kind = kindOf(row);
      const re = new RegExp(`^${kind}-${CODE_KINDS[kind].year ? '\\d{4}-' : ''}~\\d+~$`);
      if (!re.test(String(row.id ?? ''))) return STALE;
      if (table === 'notas' && row.origen === 'sistema') {
        const serie = String(row.serie ?? '');
        if (serie !== 'BC01' && serie !== 'FC01') return STALE;
        if (!new RegExp(`^${serie}-~\\d+~$`).test(String(row.etiqueta ?? ''))) return STALE;
      }
    }
  }
  return null;
}

const maxOfMatches = (values: (string | undefined | null)[], re: RegExp): number =>
  values.reduce<number>((a, v) => { const m = v ? re.exec(v) : null; return m ? Math.max(a, Number(m[1])) : a; }, 0);

/**
 * El código más alto de cada tipo que hay en unas filas (para el repositorio en memoria de los `check-*`; la base lo calcula con
 * `app.codigo_maximo` sobre todas las tablas, sin el filtro por sede). Las fuentes son las mismas.
 */
export function highestOfRows(rows: MoneyRows): Highest {
  return (prefix, year) => {
    const y = year !== undefined ? `${year}-` : '';
    const re = new RegExp(`^${prefix}-${y}(\\d+)$`);
    switch (prefix) {
      case 'MAT': return maxOfMatches(rows.matriculas.map(r => r.id), re);
      case 'PLN': return maxOfMatches(rows.planes.map(r => r.id), re);
      case 'PAG': return maxOfMatches(rows.pagos.map(r => r.id), re);
      case 'PGR': return maxOfMatches(rows.grupos.map(r => r.id), re);
      case 'CJ': return maxOfMatches(rows.movimientos.map(r => r.id), re);
      case 'NC': return maxOfMatches(rows.notas.map(r => r.id), re);
      case 'CAI': case 'SOL': return maxOfMatches(rows.solicitudes.map(r => r.id), re);
      case 'COR': return maxOfMatches(rows.correcciones.map(r => r.id), re);
      case 'CTR': return maxOfMatches(rows.matriculas.map(r => r.documentos?.contract?.number), re);
      case 'FIC': return maxOfMatches(rows.matriculas.map(r => r.documentos?.ficha?.number), re);
      case 'DEP': return maxOfMatches(rows.movimientos.map(r => r.deposito?.code), re);
      case 'BC01': case 'FC01': return rows.notas.filter(n => n.serie === prefix).reduce((a, n) => Math.max(a, n.correlativo), 0);
      default: throw new Error(`El código «${prefix}» no lo asigna el sistema.`);
    }
  };
}
