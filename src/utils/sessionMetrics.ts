/**
 * Métricas de la sesión de una asesoría: qué se mide en cada programa, en qué rango y cómo se valida (funciones puras).
 *
 * Flujo:
 *  1. Cada programa define sus métricas (nivel, sesión o módulo, velocidad, comprensión…). El formulario se arma desde
 *     esa definición, así que el registro y la validación no se desacuerdan.
 *  2. Rango DURO: lo imposible (comprensión fuera de 0–100, velocidad ≤ 0, sesión 0 o no entera) NO se guarda.
 *  3. Rango HABITUAL y comparación con la sesión anterior: lo raro (velocidad muy alta para el programa, una caída fuerte,
 *     saltarse sesiones) se AVISA y exige explicarlo en las observaciones; no se prohíbe porque puede ser real.
 *  4. Las obligatorias deben estar completas para cerrar la sesión (sin ellas la asesoría queda «sin sesión»).
 *  5. Se guardan como NÚMEROS (la sesión como «Sesión 5»), para que el reporte pueda promediar y comparar.
 */
import type { Tracking } from '../context/DataContext';

export type MetricKind = 'numero' | 'ordinal' | 'opcion' | 'nivel';

export interface MetricDef {
  key: string;
  label: string;
  kind: MetricKind;
  required: boolean;
  /** Rango duro (números y ordinales). */
  min?: number;
  max?: number;
  integer?: boolean;
  /** Rango habitual: fuera de él se avisa y se pide explicar. */
  usual?: [number, number];
  unit?: string;
  /** Texto delante del número en los ordinales («Sesión », «Módulo »). */
  prefix?: string;
  options?: string[];
  placeholder?: string;
}

const velocidad = (usual: [number, number]): MetricDef => ({ key: 'velocidad', label: 'Velocidad', kind: 'numero', required: true, min: 1, max: 3000, integer: true, usual, unit: 'pxm', placeholder: 'Palabras por minuto' });
const comprension: MetricDef = { key: 'comprension', label: 'Comprensión', kind: 'numero', required: true, min: 0, max: 100, integer: true, unit: '%', placeholder: '0 a 100' };
const nivel: MetricDef = { key: 'nivel', label: 'Nivel', kind: 'nivel', required: true };
const sesion = (required = true): MetricDef => ({ key: 'sesion', label: 'Sesión', kind: 'ordinal', required, min: 1, max: 60, integer: true, prefix: 'Sesión ', placeholder: 'N.º de sesión' });
const yesNo = (key: string, label: string): MetricDef => ({ key, label, kind: 'opcion', required: true, options: ['Sí', 'No', '50%'] });

const ADVANCED: MetricDef[] = [
  { key: 'modulo', label: 'Módulo', kind: 'ordinal', required: true, min: 1, max: 30, integer: true, prefix: 'Módulo ', placeholder: 'N.º de módulo' },
  velocidad([80, 1500]),
  comprension,
];

/** Métricas por programa (nombre del programa tal como figura en la matrícula). */
export const PROGRAM_METRICS: Record<string, MetricDef[]> = {
  Kids: [nivel, sesion(), velocidad([20, 600]), comprension],
  'Pre-Kids': [nivel, { key: 'semana', label: 'Semana', kind: 'ordinal', required: true, min: 1, max: 52, integer: true, prefix: 'Semana ', placeholder: 'N.º de semana' }, yesNo('identifica', '¿Identifica?'), yesNo('leeSolo', '¿Lee solo?')],
  'Pre-lectura': [sesion()],
  'Especialización': ADVANCED,
  Teens: ADVANCED,
  Profesional: ADVANCED,
};

export const METRIC_LABEL: Record<string, string> = {
  modulo: 'Módulo', nivel: 'Nivel', sesion: 'Sesión', semana: 'Semana', velocidad: 'Velocidad (pxm)',
  comprension: 'Comprensión (%)', identifica: '¿Identifica?', leeSolo: '¿Lee solo?',
};

/** Comprensión por debajo de este valor se marca como baja (aviso, no impide guardar). */
export const LOW_COMPREHENSION = 60;
/** Cambios respecto a la sesión anterior que se consideran raros. */
export const BIG_DROP = 0.3;
export const BIG_RISE = 1;
/** Sesiones o módulos que se pueden adelantar sin avisar. */
export const MAX_JUMP = 2;

export const programKey = (program: string): string => program.split(' - ')[0].trim();
export const metricsOf = (program: string): MetricDef[] => PROGRAM_METRICS[programKey(program)] ?? [];

export interface MetricWarning {
  text: string;
  /** Hay que explicarlo en las observaciones. */
  needsNote: boolean;
}

export interface MetricsCheck {
  errors: string[];
  warnings: MetricWarning[];
  /** Valores limpios para guardar (números como número, ordinales con su prefijo). */
  clean: Record<string, string | number>;
  /** Alguna advertencia exige observaciones. */
  needsNote: boolean;
}

const isBlank = (v: unknown) => v === undefined || v === null || String(v).trim() === '';

/** Número que lleva un ordinal («Sesión 5» → 5). */
export const ordinalNumber = (v: unknown): number | undefined => {
  const m = String(v ?? '').match(/(\d+)\s*$/);
  return m ? Number(m[1]) : undefined;
};

export interface MetricsContext {
  /** Métricas de la sesión anterior del alumno. */
  previous?: Record<string, any> | null;
  /** Niveles del programa (para elegir el nivel del alumno). */
  levels?: string[];
  /** Nivel de su matrícula (si es otro, se avisa). */
  enrollmentLevel?: string;
}

export function validateMetrics(program: string, raw: Record<string, any>, ctx: MetricsContext = {}): MetricsCheck {
  const errors: string[] = [];
  const warnings: MetricWarning[] = [];
  const clean: Record<string, string | number> = {};
  const prev = ctx.previous ?? undefined;

  for (const def of metricsOf(program)) {
    const value = raw[def.key];
    if (isBlank(value)) {
      if (def.required) errors.push(`${def.label} es obligatorio.`);
      continue;
    }
    const unit = def.unit ? ` ${def.unit}` : '';

    if (def.kind === 'numero' || def.kind === 'ordinal') {
      const n = def.kind === 'ordinal' ? ordinalNumber(value) : Number(String(value).replace(',', '.'));
      if (n === undefined || !Number.isFinite(n)) { errors.push(`${def.label} debe ser un número.`); continue; }
      if (def.integer && !Number.isInteger(n)) { errors.push(`${def.label} debe ser un número entero.`); continue; }
      if ((def.min !== undefined && n < def.min) || (def.max !== undefined && n > def.max)) {
        errors.push(`${def.label} debe estar entre ${def.min} y ${def.max}${unit}.`);
        continue;
      }
      clean[def.key] = def.kind === 'ordinal' ? `${def.prefix ?? ''}${n}` : n;

      if (def.usual && (n < def.usual[0] || n > def.usual[1])) {
        warnings.push({ text: `${def.label} de ${n}${unit} es inusual para ${programKey(program)} (lo habitual es de ${def.usual[0]} a ${def.usual[1]}${unit}): confirme el dato.`, needsNote: true });
      }
      if (def.key === 'comprension' && n < LOW_COMPREHENSION) {
        warnings.push({ text: `Comprensión baja (${n} %): considere reforzar y dejarlo anotado.`, needsNote: false });
      }
      const before = prev ? (def.kind === 'ordinal' ? ordinalNumber(prev[def.key]) : Number(prev[def.key])) : undefined;
      if (before !== undefined && Number.isFinite(before) && before > 0) {
        if (def.kind === 'ordinal') {
          const unitName = def.label.toLowerCase();
          if (n < before) warnings.push({ text: `El avance retrocede: la sesión anterior estaba en ${unitName} ${before} y esta es ${unitName} ${n}.`, needsNote: true });
          else if (n - before > MAX_JUMP) warnings.push({ text: `Salta de ${unitName} ${before} a ${unitName} ${n}: se omiten ${n - before - 1}.`, needsNote: true });
        } else if (def.key === 'velocidad') {
          const change = (n - before) / before;
          if (change <= -BIG_DROP) warnings.push({ text: `La velocidad bajó ${Math.round(-change * 100)} % respecto a la sesión anterior (${before} → ${n} pxm).`, needsNote: true });
          else if (change >= BIG_RISE) warnings.push({ text: `La velocidad se multiplicó por ${(1 + change).toFixed(1)} respecto a la sesión anterior (${before} → ${n} pxm).`, needsNote: true });
        }
      }
    } else if (def.kind === 'opcion') {
      if (!def.options?.includes(String(value))) { errors.push(`${def.label}: elija una de las opciones.`); continue; }
      clean[def.key] = String(value);
    } else {
      const text = String(value).trim();
      if (ctx.levels && ctx.levels.length > 0 && !ctx.levels.includes(text)) { errors.push(`${def.label}: elija un nivel del programa.`); continue; }
      clean[def.key] = text;
      if (ctx.enrollmentLevel && text !== ctx.enrollmentLevel) {
        warnings.push({ text: `El nivel de la sesión (${text}) no es el de su matrícula (${ctx.enrollmentLevel}).`, needsNote: false });
      }
    }
  }
  return { errors, warnings, clean, needsNote: warnings.some(w => w.needsNote) };
}

/** Métricas de la sesión anterior del alumno (la última con asistencia y métricas antes de esta fecha). */
export function previousMetrics(trackings: Tracking[], studentId: string, beforeDate: string, ignoreScheduleId?: string): Record<string, any> | null {
  const earlier = trackings
    .filter(t => t.studentId === studentId && t.status === 'Asistió' && t.metrics && t.date < beforeDate && t.scheduleId !== ignoreScheduleId)
    .sort((a, b) => b.date.localeCompare(a.date));
  return earlier[0]?.metrics ?? null;
}

export const MIN_NOTE = 5;

/** Observaciones obligatorias cuando algún aviso lo exige. */
export const noteProblem = (check: Pick<MetricsCheck, 'needsNote'>, observations: string): string | null =>
  check.needsNote && observations.trim().length < MIN_NOTE ? 'Hay valores fuera de lo habitual: explíquelos en las observaciones antes de guardar.' : null;

/** Valor numérico de una métrica de la sesión (undefined si no hay). */
export const metricNumber = (t: Pick<Tracking, 'metrics'>, key: string): number | undefined => {
  const raw = t.metrics?.[key];
  if (raw === undefined || raw === null || raw === '') return undefined;
  const n = key === 'sesion' || key === 'modulo' || key === 'semana' ? ordinalNumber(raw) : Number(raw);
  return n !== undefined && Number.isFinite(n) ? n : undefined;
};
