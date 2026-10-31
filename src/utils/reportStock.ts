/**
 * Reporte de Stock (funciones puras): foto del inventario y su cobertura frente a lo que ya se debe entregar.
 *
 *  - **Foto:** por sede y artículo: stock, mínimo y estado (sin stock, bajo el mínimo, normal), con su valor a costo (USD).
 *  - **Cobertura:** lo que piden las recetas de las matrículas que aún esperan sus materiales, comparado con el stock de su sede;
 *    lo que falta es lo que hay que pedir o transferir. Es el cruce que une Matrículas, Verificación, Recetas y Logística.
 *  - **Movimientos del período** (kardex): por tipo, entregas por verificación por artículo y artículos sin movimiento.
 *  - **En camino:** envíos y transferencias que todavía no llegan.
 */
import type { Enrollment, Item, KardexEntry, Recipe, Shipment, StockItem, Transfer } from '../context/DataContext';
import { availableStock } from './inventory';
import { dayOf, daysApart, inRange, round2, sum, type DateRange } from './reportCommon';
import { recipeForEnrollment } from './verification';
import { isVerified } from './verificationGate';

export const STALE_DAYS = 90;

export interface StockReportContext {
  stockItems: StockItem[];
  items: Item[];
  branches: { id: string; name: string }[];
  recipes: Recipe[];
  enrollments: Enrollment[];
  kardex: KardexEntry[];
  transfers: Transfer[];
  shipments: Shipment[];
  today: string;
}

export interface StockFilters {
  range: DateRange;
  branchId: string;
}

export type StockState = 'Sin stock' | 'Bajo el mínimo' | 'Normal';

export interface StockRow {
  branchId: string;
  branch: string;
  itemId: string;
  item: string;
  stock: number;
  min: number;
  state: StockState;
  valueUSD: number;
  /** Último movimiento del kardex (AAAA-MM-DD), si lo hay. */
  lastMove?: string;
}

export interface Shortfall { branch: string; item: string; required: number; stock: number; missing: number; enrollments: number }
export interface MoveLine { type: string; count: number; qty: number }

export interface StockReport {
  kpis: { references: number; units: number; low: number; empty: number; valueUSD: number; shortfalls: number; inTransit: number };
  rows: StockRow[];
  shortfalls: Shortfall[];
  movements: MoveLine[];
  delivered: { item: string; qty: number }[];
  stale: StockRow[];
  inTransit: { kind: 'Envío' | 'Transferencia'; id: string; status: string; to: string; units: number }[];
}

const stateOf = (stock: number, min: number): StockState => (stock <= 0 ? 'Sin stock' : stock <= min ? 'Bajo el mínimo' : 'Normal');

export function stockReport(ctx: StockReportContext, f: StockFilters): StockReport {
  const branchName = (id: string) => ctx.branches.find(b => b.id === id)?.name ?? id;
  const branchId = (name: string) => ctx.branches.find(b => b.name === name)?.id;
  const rowsAll = ctx.stockItems.filter(s => !f.branchId || s.branchId === f.branchId);

  // Último movimiento por sede y artículo (el kardex guarda nombres)
  const last = new Map<string, string>();
  for (const k of ctx.kardex) {
    const id = ctx.items.find(i => i.name === k.material)?.id;
    const b = branchId(k.branch);
    if (!id || !b) continue;
    const key = `${b}|${id}`;
    const d = dayOf(k.date);
    if (!last.has(key) || d > (last.get(key) as string)) last.set(key, d);
  }

  const rows: StockRow[] = rowsAll.map(s => {
    const item = ctx.items.find(i => i.id === s.itemId);
    return {
      branchId: s.branchId, branch: branchName(s.branchId), itemId: s.itemId, item: item?.name ?? s.itemId, stock: s.stock, min: s.minStock,
      state: stateOf(s.stock, s.minStock), valueUSD: round2(s.stock * (item?.cost ?? 0)), lastMove: last.get(`${s.branchId}|${s.itemId}`),
    };
  }).sort((a, b) => a.branch.localeCompare(b.branch) || a.item.localeCompare(b.item));

  // Cobertura: lo que piden las matrículas activas que aún no se verifican
  const need = new Map<string, { branchId: string; itemId: string; required: number; enrollments: Set<string> }>();
  for (const e of ctx.enrollments) {
    if (e.status !== 'Activa' || isVerified(e) || !e.branchId || (f.branchId && e.branchId !== f.branchId)) continue;
    const recipe = recipeForEnrollment(e, ctx.recipes, ctx.today);
    if (!recipe) continue;
    for (const line of recipe.items) {
      const key = `${e.branchId}|${line.itemId}`;
      const cur = need.get(key) ?? { branchId: e.branchId, itemId: line.itemId, required: 0, enrollments: new Set<string>() };
      cur.required += line.quantity;
      cur.enrollments.add(e.id);
      need.set(key, cur);
    }
  }
  const shortfalls: Shortfall[] = [...need.values()]
    .map(n => ({ branch: branchName(n.branchId), item: ctx.items.find(i => i.id === n.itemId)?.name ?? n.itemId, required: n.required, stock: availableStock(ctx.stockItems, n.branchId, n.itemId), enrollments: n.enrollments.size }))
    .map(n => ({ ...n, missing: Math.max(0, n.required - n.stock) }))
    .filter(n => n.missing > 0)
    .sort((a, b) => b.missing - a.missing || a.branch.localeCompare(b.branch));

  // Movimientos del período
  const moves = ctx.kardex.filter(k => inRange(dayOf(k.date), f.range) && (!f.branchId || branchId(k.branch) === f.branchId));
  const byType = new Map<string, MoveLine>();
  for (const k of moves) {
    const cur = byType.get(k.type) ?? { type: k.type, count: 0, qty: 0 };
    byType.set(k.type, { type: k.type, count: cur.count + 1, qty: cur.qty + Math.abs(k.qty) });
  }
  const delivered = new Map<string, number>();
  for (const k of moves.filter(x => x.type === 'Entrega por Verificación')) delivered.set(k.material, (delivered.get(k.material) ?? 0) + Math.abs(k.qty));

  const stale = rows.filter(r => r.stock > 0 && (!r.lastMove || daysApart(r.lastMove, ctx.today) >= STALE_DAYS));

  const open = ['En tránsito', 'Listo para recepción'];
  const inTransit = [
    ...ctx.shipments.filter(s => open.includes(s.status) && (!f.branchId || s.destinationId === f.branchId || s.originId === f.branchId))
      .map(s => ({ kind: 'Envío' as const, id: s.id, status: s.status, to: branchName(s.destinationId), units: s.items.reduce((n, i) => n + i.quantity, 0) })),
    ...ctx.transfers.filter(t => open.includes(t.status) && (!f.branchId || t.destinationId === f.branchId || t.originId === f.branchId))
      .map(t => ({ kind: 'Transferencia' as const, id: t.id, status: t.status, to: branchName(t.destinationId), units: t.items.reduce((n, i) => n + i.quantity, 0) })),
  ];

  return {
    kpis: {
      references: rows.length, units: rows.reduce((n, r) => n + r.stock, 0), low: rows.filter(r => r.state === 'Bajo el mínimo').length,
      empty: rows.filter(r => r.state === 'Sin stock').length, valueUSD: sum(rows, r => r.valueUSD), shortfalls: shortfalls.length, inTransit: inTransit.length,
    },
    rows,
    shortfalls,
    movements: [...byType.values()].sort((a, b) => b.count - a.count),
    delivered: [...delivered.entries()].map(([item, qty]) => ({ item, qty })).sort((a, b) => b.qty - a.qty),
    stale,
    inTransit,
  };
}
