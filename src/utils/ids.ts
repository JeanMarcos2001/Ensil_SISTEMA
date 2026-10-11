/**
 * Generación de identificadores correlativos (sin `Math.random()` ni longitud de lista).
 * El siguiente número es el máximo existente + 1, así no se repite aunque se elimine un registro.
 */

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

/** Siguiente id numérico (como texto) para colecciones con ids '1', '2', … */
export function nextNumericId(existingIds: string[]): string {
  const max = existingIds.reduce((acc, id) => {
    const n = parseInt(id, 10);
    return Number.isFinite(n) ? Math.max(acc, n) : acc;
  }, 0);
  return String(max + 1);
}
