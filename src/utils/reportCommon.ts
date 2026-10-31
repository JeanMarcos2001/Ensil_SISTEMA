/**
 * Piezas comunes de los reportes (funciones puras): rangos de fechas, conteos y porcentajes.
 *
 * Principio de los reportes de ENSIL: **no tienen datos propios**. Todo se calcula en el momento con lo que ya guardan
 * Matrículas, Caja, Logística, Personas y Psicopedagogía, así que un reporte nunca puede contradecir a su pantalla de origen.
 * Cada reporte arranca con la sede elegida en el selector del encabezado y deja cambiarla.
 */
import { addDaysISO, localDateOf } from './schedule';

export interface DateRange {
  from: string;
  to: string;
}

export type RangePreset = 'mes' | 'mes-anterior' | 'anio' | '30d' | 'todo';

export const PRESET_LABEL: Record<RangePreset, string> = {
  mes: 'Este mes', 'mes-anterior': 'Mes anterior', anio: 'Este año', '30d': 'Últimos 30 días', todo: 'Todo el historial',
};

export const ALL_TIME: DateRange = { from: '2000-01-01', to: '2999-12-31' };
export const isAllTime = (r: DateRange) => r.from === ALL_TIME.from && r.to === ALL_TIME.to;

const monthStart = (iso: string) => `${iso.slice(0, 8)}01`;
const monthEnd = (iso: string) => {
  const [y, m] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

export function presetRange(preset: RangePreset, today: string): DateRange {
  switch (preset) {
    case 'mes': return { from: monthStart(today), to: monthEnd(today) };
    case 'mes-anterior': { const last = addDaysISO(monthStart(today), -1); return { from: monthStart(last), to: last }; }
    case 'anio': return { from: `${today.slice(0, 4)}-01-01`, to: `${today.slice(0, 4)}-12-31` };
    case '30d': return { from: addDaysISO(today, -29), to: today };
    default: return ALL_TIME;
  }
}

export const inRange = (iso: string | undefined, r: DateRange): boolean => !!iso && iso >= r.from && iso <= r.to;
/** Día local (AAAA-MM-DD) de un instante ISO. */
export const dayOf = (instant: string): string => (!instant.includes('T') ? instant.slice(0, 10) : localDateOf(instant));
/** Instante en milisegundos de una fecha ISO, de una fecha con hora «AAAA-MM-DD HH:mm» o de una fecha sola (para ordenar). */
export const timeOf = (text: string): number => { const t = new Date(text.includes(' ') ? text.replace(' ', 'T') : text).getTime(); return Number.isNaN(t) ? 0 : t; };

export const round1 = (n: number) => Math.round(n * 10) / 10;
export const round2 = (n: number) => Math.round(n * 100) / 100;
export const pct = (n: number, d: number): number | null => (d === 0 ? null : round1((n / d) * 100));
export const sum = <T,>(list: T[], f: (x: T) => number): number => round2(list.reduce((s, x) => s + f(x), 0));

export interface Count { name: string; count: number }

/** Cuenta ocurrencias por clave, de mayor a menor. */
export function tally<T>(list: T[], key: (x: T) => string | undefined, fallback = 'Sin dato'): Count[] {
  const map = new Map<string, number>();
  for (const x of list) { const k = (key(x) ?? '').trim() || fallback; map.set(k, (map.get(k) ?? 0) + 1); }
  return [...map.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** Fecha corta dd/mm/aaaa. */
export const dmy = (iso: string): string => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—');

/** Días entre dos fechas AAAA-MM-DD (negativo si `to` es anterior). */
export function daysApart(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
}
