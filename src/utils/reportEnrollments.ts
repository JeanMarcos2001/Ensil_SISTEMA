/**
 * Reportes de Matrículas y de Verificación (funciones puras).
 *
 *  - **Matrículas:** embudo (matriculadas → verificadas → primera asesoría dada → activas hoy), por sede, programa, tipo de pago,
 *    origen del contacto y entrevistador; vigencia de las activas, motivos de caída y cambios aprobados (reactivación,
 *    cambio de programa y traslado).
 *  - **Verificación:** cuántas faltan, cuántas están completas o incompletas, cuánto tarda la entrega, qué artículos faltan y
 *    cuáles esperan su primera asesoría (con urgencia). Solo cuenta matrículas activas.
 */
import type { ChangeRequest, DropRequest, Enrollment, Item, Program, Recipe, Schedule } from '../context/DataContext';
import { VALIDITY_LABEL, enrollmentValidity, programOf } from './validity';
import { canSplitKit, initialModes, isLineDelivered, recipeForEnrollment } from './verification';
import { compareGates, isVerified, type FirstSessionGate } from './verificationGate';
import { daysApart, dayOf, inRange, pct, round1, sum, tally, type Count, type DateRange } from './reportCommon';

export interface ReportFilters {
  range: DateRange;
  branchId: string;
  /** Nombre del programa («» = todos). */
  program: string;
}

const branchName = (branches: { id: string; name: string }[], id?: string, fallback?: string) => branches.find(b => b.id === id)?.name ?? fallback ?? 'Sin sede';
const labelOf = (e: Pick<Enrollment, 'program' | 'level'>) => (e.level && e.level !== 'Sin nivel' ? `${e.program} · ${e.level}` : e.program);

// ---------------------------------------------------------------- Matrículas
export interface EnrollmentReportContext {
  enrollments: Enrollment[];
  programs: Program[];
  branches: { id: string; name: string }[];
  schedules: Schedule[];
  dropRequests: DropRequest[];
  changeRequests: ChangeRequest[];
  today: string;
}

export interface GroupLine { name: string; count: number; active: number; dropped: number; revenueUSD: number }

export interface EnrollmentReport {
  kpis: { registered: number; active: number; dropped: number; revenueUSD: number; renewals: number; verifiedRate: number | null; dropRate: number | null };
  funnel: { step: string; count: number; share: number | null }[];
  byBranch: GroupLine[];
  byProgram: GroupLine[];
  byPaymentType: Count[];
  byOrigin: Count[];
  byAdvisor: Count[];
  validity: Count[];
  dropReasons: Count[];
  pendingDrops: number;
  changes: Count[];
  pendingChanges: number;
  rows: Enrollment[];
}

/** Matrículas que cumplen sede y programa (sin mirar la fecha). */
export const scopeOf = (enrollments: Enrollment[], f: Pick<ReportFilters, 'branchId' | 'program'>): Enrollment[] =>
  enrollments.filter(e => (!f.branchId || e.branchId === f.branchId) && (!f.program || e.program === f.program));

function groupLines(list: Enrollment[], key: (e: Enrollment) => string): GroupLine[] {
  const map = new Map<string, Enrollment[]>();
  for (const e of list) { const k = key(e) || 'Sin dato'; map.set(k, [...(map.get(k) ?? []), e]); }
  return [...map.entries()].map(([name, items]) => ({
    name, count: items.length, active: items.filter(e => e.status === 'Activa').length, dropped: items.filter(e => e.status === 'Caída').length,
    revenueUSD: sum(items, e => e.assignedPrice ?? 0),
  })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function enrollmentsReport(ctx: EnrollmentReportContext, f: ReportFilters): EnrollmentReport {
  const scope = scopeOf(ctx.enrollments, f);
  const list = scope.filter(e => inRange(e.dateISO, f.range));
  const ids = new Set(scope.map(e => e.id));
  const active = list.filter(e => e.status === 'Activa');
  const verified = list.filter(e => isVerified(e));
  const firstGiven = list.filter(e => ctx.schedules.some(s => s.isFirst && s.enrollmentId === e.id && s.status === 'Asistió'));

  const validityMap = new Map<string, number>();
  for (const e of active) {
    const label = VALIDITY_LABEL[enrollmentValidity(e, programOf(e, ctx.programs), ctx.schedules, ctx.today).state];
    validityMap.set(label, (validityMap.get(label) ?? 0) + 1);
  }

  const drops = ctx.dropRequests.filter(d => ids.has(d.enrollmentId));
  const changes = ctx.changeRequests.filter(c => ids.has(c.enrollmentId));
  const approvedDrops = drops.filter(d => d.status === 'Aprobada' && inRange(d.resolvedAt ? dayOf(d.resolvedAt) : undefined, f.range));
  const approvedChanges = changes.filter(c => c.status === 'Aprobada' && inRange(c.resolvedAt ? dayOf(c.resolvedAt) : undefined, f.range));

  return {
    kpis: {
      registered: list.length, active: active.length, dropped: list.filter(e => e.status === 'Caída').length, revenueUSD: sum(list, e => e.assignedPrice ?? 0),
      renewals: list.filter(e => !!e.renewsId).length, verifiedRate: pct(verified.length, list.length), dropRate: pct(approvedDrops.length, list.length),
    },
    funnel: [
      { step: 'Matriculadas', count: list.length, share: list.length ? 100 : null },
      { step: 'Con materiales verificados', count: verified.length, share: pct(verified.length, list.length) },
      { step: 'Con primera asesoría dada', count: firstGiven.length, share: pct(firstGiven.length, list.length) },
      { step: 'Activas hoy', count: active.length, share: pct(active.length, list.length) },
    ],
    byBranch: groupLines(list, e => branchName(ctx.branches, e.branchId, e.sede)),
    byProgram: groupLines(list, labelOf),
    byPaymentType: tally(list, e => e.paymentTypeName, 'Sin tipo de pago'),
    byOrigin: tally(list, e => e.origen, 'Sin origen'),
    byAdvisor: tally(list, e => e.asesor, 'Sin entrevistador'),
    validity: [...validityMap.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    dropReasons: tally(approvedDrops, d => d.reason, 'Sin motivo'),
    pendingDrops: drops.filter(d => d.status === 'Pendiente').length,
    changes: tally(approvedChanges, c => c.kind),
    pendingChanges: changes.filter(c => c.status === 'Pendiente').length,
    rows: [...list].sort((a, b) => b.dateISO.localeCompare(a.dateISO) || b.id.localeCompare(a.id)),
  };
}

// ---------------------------------------------------------------- Verificación
export interface VerificationReportContext {
  enrollments: Enrollment[];
  recipes: Recipe[];
  items: Item[];
  branches: { id: string; name: string }[];
  /** Primeras asesorías que esperan la verificación, por matrícula. */
  gates: Record<string, FirstSessionGate>;
  today: string;
}

export interface VerificationRow {
  enrollment: Enrollment;
  gate?: FirstSessionGate;
  hasRecipe: boolean;
  /** Artículos de la receta aún sin entregar (solo matrículas incompletas). */
  missing: string[];
}

export interface VerificationReport {
  kpis: { total: number; pending: number; incomplete: number; complete: number; rate: number | null; avgDays: number | null; waiting: number; overdue: number; noRecipe: number };
  byBranch: { name: string; total: number; pending: number; incomplete: number; complete: number }[];
  byVerifier: Count[];
  delivered: Count[];
  pendingRows: VerificationRow[];
  incompleteRows: VerificationRow[];
}

/** Líneas de la receta que faltan entregar (kit o componentes, según como se entregó). */
export function missingItems(e: Enrollment, recipe: Recipe | undefined, items: Item[]): string[] {
  if (!recipe) return [];
  const delivered = e.verifiedItems ?? [];
  const checked = Object.fromEntries(delivered.map(id => [id, true]));
  const modes = initialModes(recipe, items, delivered);
  return recipe.items
    .filter(line => {
      const item = items.find(i => i.id === line.itemId);
      return !isLineDelivered(line, item, checked, canSplitKit(item) ? modes[line.itemId] ?? 'kit' : 'kit');
    })
    .map(line => items.find(i => i.id === line.itemId)?.name ?? line.itemId);
}

export function verificationReport(ctx: VerificationReportContext, f: ReportFilters): VerificationReport {
  const list = scopeOf(ctx.enrollments, f).filter(e => e.status === 'Activa' && inRange(e.dateISO, f.range));
  const row = (e: Enrollment): VerificationRow => {
    const recipe = recipeForEnrollment(e, ctx.recipes, ctx.today);
    return { enrollment: e, gate: ctx.gates[e.id], hasRecipe: !!recipe, missing: e.verificationStatus === 'Verificado Incompleto' ? missingItems(e, recipe, ctx.items) : [] };
  };
  const pending = list.filter(e => !isVerified(e)).map(row);
  const incomplete = list.filter(e => e.verificationStatus === 'Verificado Incompleto').map(row);
  const complete = list.filter(e => e.verificationStatus === 'Verificado Completo');
  const verified = list.filter(e => isVerified(e));
  const days = verified
    .filter(e => e.verificationDate && e.dateISO)
    .map(e => Math.max(0, daysApart(e.dateISO, (e.verificationDate as string).slice(0, 10))));
  const gates = list.map(e => ctx.gates[e.id]).filter((g): g is FirstSessionGate => !!g);
  const deliveredIds = verified.flatMap(e => e.verifiedItems ?? []);

  const byBranch = new Map<string, Enrollment[]>();
  for (const e of list) { const k = branchName(ctx.branches, e.branchId, e.sede); byBranch.set(k, [...(byBranch.get(k) ?? []), e]); }

  return {
    kpis: {
      total: list.length, pending: pending.length, incomplete: incomplete.length, complete: complete.length, rate: pct(verified.length, list.length),
      avgDays: days.length ? round1(days.reduce((a, b) => a + b, 0) / days.length) : null,
      waiting: gates.length, overdue: gates.filter(g => g.overdue).length, noRecipe: pending.filter(r => !r.hasRecipe).length,
    },
    byBranch: [...byBranch.entries()].map(([name, items]) => ({
      name, total: items.length, pending: items.filter(e => !isVerified(e)).length,
      incomplete: items.filter(e => e.verificationStatus === 'Verificado Incompleto').length, complete: items.filter(e => e.verificationStatus === 'Verificado Completo').length,
    })).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name)),
    byVerifier: tally(verified, e => e.verifier, 'Sin verificador'),
    delivered: tally(deliveredIds, id => ctx.items.find(i => i.id === id)?.name ?? id),
    // Primero las que esperan su primera asesoría (la más urgente arriba) y luego las más antiguas
    pendingRows: pending.sort((a, b) => {
      if (a.gate && b.gate) return compareGates(a.gate, b.gate);
      if (a.gate) return -1;
      if (b.gate) return 1;
      return a.enrollment.dateISO.localeCompare(b.enrollment.dateISO);
    }),
    incompleteRows: incomplete,
  };
}
