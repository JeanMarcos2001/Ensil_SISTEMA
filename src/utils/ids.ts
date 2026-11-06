/**
 * Generación de identificadores correlativos (sin `Math.random()`, `Date.now()` ni longitud de lista).
 * El siguiente número es el máximo existente + 1, así no se repite aunque se elimine un registro.
 *
 * Política de ids del sistema (un solo estilo, `PREFIJO-NNN`):
 *  - **Registros que se crean al operar** llevan prefijo y correlativo: ver `ID_PREFIX`. Se generan SIEMPRE con
 *    `nextSequentialId` (o con el asignador `createIdAllocator` cuando se crean varios en un mismo instante).
 *  - **Catálogos de configuración** (programas, niveles, tipos de pago, tarifarios, promociones, orígenes…) usan un número
 *    correlativo (`nextNumericId`): son listas cortas que el administrador mantiene.
 *  - Los ids de borradores de pantalla (claves de React, filas nuevas aún sin guardar) no son ids del sistema.
 */

export const ID_PREFIX = {
  alumno: 'ALU', titular: 'TIT', empresa: 'EMP', filial: 'FIL', rol: 'ROL', almacen: 'ALM', personal: 'STF', contrato: 'CON', asignacion: 'ASG', matricula: 'MAT', plan: 'PLN', pago: 'PAG',
  movimientoCaja: 'CJ', cajaChica: 'CCH', cierre: 'CIE', deposito: 'DEP', notaCredito: 'NC', solicitud: 'SOL', caida: 'CAI',
  correccion: 'COR', sesion: 'SES', seguimiento: 'TRK', recordatorio: 'REC', recordatorioPsi: 'PRL', stock: 'STK', kardex: 'KDX',
  precio: 'PRC', ajuste: 'ADJ', incidencia: 'INC', notificacion: 'NOT', grupoPromocional: 'PGR', ajustePlanilla: 'AJU',
} as const;

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * `nextSequentialId('MAT', ids, { year: 2026 })` → `MAT-2026-001`
 * `nextSequentialId('ALU', ids)` → `ALU-001`
 * Con `year` el correlativo reinicia cada año.
 */
export function nextSequentialId(
  prefix: string,
  existingIds: string[],
  opts: { year?: number; pad?: number } = {}
): string {
  const pad = opts.pad ?? 3;
  const base = opts.year !== undefined ? `${prefix}-${opts.year}-` : `${prefix}-`;
  const re = new RegExp(`^${escapeRegExp(base)}(\\d+)$`);
  let max = 0;
  for (const id of existingIds) {
    const m = re.exec(id);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${base}${String(max + 1).padStart(pad, '0')}`;
}

/**
 * Asignador de ids para el estado en memoria: recuerda los que ya entregó, de modo que dos registros creados en el mismo instante
 * (antes de que React actualice la lista) no reciben el mismo número.
 */
export function createIdAllocator() {
  const issued = new Set<string>();
  return (prefix: string, existingIds: string[], opts: { year?: number; pad?: number } = {}): string => {
    const id = nextSequentialId(prefix, [...existingIds, ...issued], opts);
    issued.add(id);
    return id;
  };
}

/** Siguiente id numérico (como texto) para colecciones con ids '1', '2', … */
export function nextNumericId(existingIds: string[]): string {
  const max = existingIds.reduce((acc, id) => {
    const n = parseInt(id, 10);
    return Number.isFinite(n) ? Math.max(acc, n) : acc;
  }, 0);
  return String(max + 1);
}
