/**
 * Cierre y reapertura de caja (funciones puras).
 *
 * Cerrar una caja es hacer el ARQUEO de un día: se compara el saldo que dice el sistema hasta esa fecha con el dinero contado.
 *  - **Cada sede cierra la suya**: hay una caja por sede y moneda (Caja PEN y Caja USD de cada sede) y la Caja chica de cada sede (PEN); cada una cierra
 *    por separado. La caja sin sede («caja general») la cierra quien alcanza todas las sedes (`branchId` vacío).
 *  - Un cierre cubre todos los movimientos con fecha menor o igual a la del cierre.
 *  - Si hay diferencia (sobrante o faltante) la nota es obligatoria.
 *  - Con un día cerrado no se registran ni se reversan movimientos de esa fecha o anteriores a mano; para hacerlo hay que
 *    reabrir. Solo se reabre el ÚLTIMO cierre (para no dejar huecos), con motivo y permiso, y queda en el historial.
 *  - Si después del cierre entra un movimiento automático con fecha cubierta (p. ej. un cobro), el cierre queda
 *    «desactualizado» y se avisa: conviene reabrirlo y volver a cerrar.
 */
import type { CashClosure, CashMovement, PettyCashMovement } from '../context/DataContext';
import { localDateOf } from './schedule';

export type ClosureScope = 'caja' | 'caja-chica';
export const MIN_NOTE = 5;

const round2 = (n: number) => Math.round(n * 100) / 100;

export const scopeLabel = (scope: ClosureScope, currency: 'PEN' | 'USD') => (scope === 'caja' ? `Caja ${currency}` : 'Caja chica');

/** ¿El cierre es de esa caja? (mismo tipo, moneda y sede; sin sede = caja general). */
const sameBox = (c: Pick<CashClosure, 'scope' | 'currency' | 'branchId'>, scope: ClosureScope, currency: 'PEN' | 'USD', branchId?: string) =>
  c.scope === scope && c.currency === currency && (c.branchId ?? '') === (branchId ?? '');

/** Última fecha cerrada de una caja (null si nunca se cerró o se reabrió todo). */
export function closedUntil(closures: CashClosure[], scope: ClosureScope, currency: 'PEN' | 'USD', branchId?: string): string | null {
  const dates = closures.filter(c => sameBox(c, scope, currency, branchId) && c.status === 'Cerrada').map(c => c.date).sort();
  return dates.length > 0 ? dates[dates.length - 1] : null;
}

/** ¿La fecha ya está cubierta por un cierre? */
export function isDateClosed(closures: CashClosure[], scope: ClosureScope, currency: 'PEN' | 'USD', isoDate: string, branchId?: string): boolean {
  const last = closedUntil(closures, scope, currency, branchId);
  return last !== null && isoDate <= last;
}

/** Mensaje de bloqueo si la fecha está cerrada (para mostrarlo tal cual). */
export function closedMessage(closures: CashClosure[], scope: ClosureScope, currency: 'PEN' | 'USD', isoDate: string, branchId?: string): string | null {
  const last = closedUntil(closures, scope, currency, branchId);
  return last !== null && isoDate <= last
    ? `${scopeLabel(scope, currency)} está cerrada hasta el ${last}. Para registrar o reversar movimientos de esa fecha, un usuario con permiso debe reabrir el cierre (Sistema → Cierres).`
    : null;
}

/**
 * Saldo que dice el sistema de una caja hasta una fecha (incluida): solo los movimientos de esa sede (sin sede = caja general). Es lo que se muestra al
 * cerrar; la base lo vuelve a calcular y es ese el que guarda el cierre.
 */
export function expectedAt(
  scope: ClosureScope,
  currency: 'PEN' | 'USD',
  isoDate: string,
  cash: CashMovement[],
  petty: PettyCashMovement[],
  branchId?: string
): number {
  const total = scope === 'caja'
    ? cash.filter(m => m.currency === currency && (m.branchId ?? '') === (branchId ?? '') && m.status === 'Aplicado' && localDateOf(m.date) <= isoDate).reduce((a, m) => a + (m.kind === 'Ingreso' ? m.amount : -m.amount), 0)
    : petty.filter(m => m.branchId === branchId && m.status === 'Aplicado' && localDateOf(m.date) <= isoDate).reduce((a, m) => a + (m.kind === 'Ingreso' ? m.amount : -m.amount), 0);
  return round2(total);
}

export interface ClosureInput {
  scope: ClosureScope;
  currency: 'PEN' | 'USD';
  /** La sede de la caja (sin sede = caja general; la caja chica siempre es de una sede). */
  branchId?: string;
  date: string;
  counted: string;
  note: string;
}

export function validateClosure(input: ClosureInput, closures: CashClosure[], expected: number, today: string): string[] {
  const e: string[] = [];
  if (input.scope === 'caja-chica' && !input.branchId) e.push('La caja chica es de una sede: elija la sede.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) e.push('Indique la fecha del cierre.');
  else {
    if (input.date > today) e.push('No se puede cerrar una fecha futura.');
    const last = closedUntil(closures, input.scope, input.currency, input.branchId);
    if (last && input.date <= last) e.push(`La caja ya está cerrada hasta el ${last}: elija una fecha posterior.`);
  }
  const counted = Number(input.counted);
  if (!input.counted.trim() || !Number.isFinite(counted) || counted < 0) e.push('Indique el dinero contado (puede ser 0).');
  else if (round2(counted - expected) !== 0 && input.note.trim().length < MIN_NOTE) e.push('Hay una diferencia entre lo contado y el sistema: explíquela en la nota.');
  return e;
}

export function buildClosure(input: ClosureInput, expected: number, by: string, at: string): Omit<CashClosure, 'id'> {
  const counted = round2(Number(input.counted));
  return {
    scope: input.scope, currency: input.currency, ...(input.branchId ? { branchId: input.branchId } : {}), date: input.date, expected, counted, difference: round2(counted - expected),
    note: input.note.trim(), closedAt: at, closedBy: by, status: 'Cerrada',
  };
}

/** Solo se reabre el último cierre vigente de esa caja. */
export function validateReopen(closure: CashClosure, closures: CashClosure[], reason: string): string[] {
  const e: string[] = [];
  if (closure.status !== 'Cerrada') e.push('Este cierre ya fue reabierto.');
  else if (closedUntil(closures, closure.scope, closure.currency, closure.branchId) !== closure.date) e.push('Solo se puede reabrir el último cierre de la caja (reabra primero el más reciente).');
  if (reason.trim().length < MIN_NOTE) e.push('Indique el motivo de la reapertura: queda en el historial.');
  return e;
}

/** ¿Entraron movimientos cubiertos por el cierre después de hacerlo? (el saldo de hoy ya no coincide) */
export function closureDrift(closure: CashClosure, cash: CashMovement[], petty: PettyCashMovement[]): number {
  if (closure.status !== 'Cerrada') return 0;
  return round2(expectedAt(closure.scope, closure.currency, closure.date, cash, petty, closure.branchId) - closure.expected);
}
