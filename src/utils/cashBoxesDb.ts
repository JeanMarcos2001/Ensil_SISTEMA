/**
 * Traducción entre los cierres de caja, los movimientos y fondos de la caja chica del sistema y las filas de la base (tablas `cierres_caja`,
 * `caja_chica_movimientos` y `caja_chica_fondos`), y de los errores de la base a mensajes claros. Funciones puras.
 *
 * Lo derivable no se guarda: el saldo esperado de un cierre lo calcula la base al cerrar (y es el que queda guardado); «desactualizado» (entró un cobro con
 * fecha cubierta) se calcula al mostrar con `closureDrift`. Cada caja es de una sede: `branchId` vacío en un cierre = caja general.
 */
import type { CashClosure, PettyCashMovement } from '../context/DataContext';
import { dbErrorMessage, type DbErrorLike } from './orgDirectory';
import type { PettyFund } from './pettyCash';

type Money = number | string;

export interface CierreRow {
  id: string; ambito: 'caja' | 'caja-chica'; moneda: 'PEN' | 'USD'; sede_id: string | null; fecha: string; esperado: Money; contado: Money; diferencia: Money; nota: string;
  cerrado_en: string; cerrado_por: string; estado: 'Cerrada' | 'Reabierta'; reabierto_en: string | null; reabierto_por: string | null; motivo_reapertura: string | null;
}
export interface CajaChicaMovimientoRow {
  id: string; sede_id: string; fecha: string; tipo: 'Ingreso' | 'Egreso'; categoria: string; concepto: string; monto: Money; medio: string; referencia: string | null;
  evidencia: string | null; observaciones: string | null; usuario: string; estado: 'Aplicado' | 'Reversado'; reversa: { at: string; by: string; reason: string; detail: string } | null;
}
export interface CajaChicaFondoRow { sede_id: string; asignado: Money; tope: Money }

export const closureFromRow = (r: CierreRow): CashClosure => ({
  id: r.id, scope: r.ambito, currency: r.moneda, ...(r.sede_id ? { branchId: r.sede_id } : {}), date: r.fecha, expected: Number(r.esperado), counted: Number(r.contado),
  difference: Number(r.diferencia), note: r.nota ?? '', closedAt: r.cerrado_en, closedBy: r.cerrado_por, status: r.estado,
  ...(r.reabierto_en ? { reopenedAt: r.reabierto_en } : {}), ...(r.reabierto_por ? { reopenedBy: r.reabierto_por } : {}), ...(r.motivo_reapertura ? { reopenReason: r.motivo_reapertura } : {}),
});

export const pettyMovementFromRow = (r: CajaChicaMovimientoRow): PettyCashMovement => ({
  id: r.id, branchId: r.sede_id, date: r.fecha, kind: r.tipo, category: r.categoria, concept: r.concepto, amount: Number(r.monto), method: r.medio,
  ...(r.referencia ? { reference: r.referencia } : {}), ...(r.evidencia ? { evidence: r.evidencia } : {}), ...(r.observaciones ? { observations: r.observaciones } : {}),
  user: r.usuario, status: r.estado, ...(r.reversa ? { reversal: r.reversa } : {}),
});

export const pettyFundFromRow = (r: CajaChicaFondoRow): { branchId: string; fund: PettyFund } => ({ branchId: r.sede_id, fund: { assigned: Number(r.asignado), maxExpense: Number(r.tope) } });

/** El número que sigue al prefijo de un código (`CCH-014` → 14). */
export const codeNumber = (id: string): number => {
  const n = parseInt(id.slice(id.indexOf('-') + 1), 10);
  return Number.isFinite(n) ? n : 0;
};

/** Mensaje claro para un error de la base en cierres y caja chica. Los avisos de las funciones propias (código EN001) ya vienen en español. */
export function cashBoxesErrorMessage(e: DbErrorLike | null | undefined): string {
  if (!e) return 'No se pudo guardar. Intente de nuevo.';
  const t = `${e.message ?? ''} ${e.details ?? ''}`.toLowerCase();
  if (e.code === '23505' && t.includes('cierres_caja_vigente_unico')) return 'Esa caja ya está cerrada en esa fecha.';
  if (e.code === '23505') return 'Otra persona registró algo al mismo tiempo. Intente de nuevo.';
  if (e.code === '23503') return 'La sede elegida ya no existe. Actualice la pantalla e intente de nuevo.';
  if (e.code === '40P01') return 'Otra persona estaba registrando en la misma caja en ese instante. Intente de nuevo.';
  return dbErrorMessage(e);
}
