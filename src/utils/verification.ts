/**
 * Reglas de Verificación de entrega de artículos (funciones puras).
 *
 *  - La verificación solo se puede registrar si la matrícula ya tiene su primer pago registrado.
 *  - Un kit se entrega completo (una unidad de stock del kit) o «por componentes» (se buscan sus artículos sueltos, cada uno con su
 *    propio stock); nunca se desarma un kit desde esta pantalla (eso se hace en Stock, con motivo). Nada se marca solo: quien entrega
 *    marca lo que de verdad entrega.
 *  - Si no hay stock del kit, la entrega por componentes se abre sola (`initialModes` con el stock de la sede).
 *  - El estado Completo / Incompleto se calcula a partir de lo entregado.
 */
import type { Enrollment, Item, Plan, Recipe, StockItem } from '../context/DataContext';
import { availableStock } from './inventory';

export type DeliveryMode = 'kit' | 'componentes';

// ---------------------------------------------------------------- Condición de pago

export interface PaymentGate {
  ok: boolean;
  /** Texto para la advertencia cuando no se puede verificar. */
  reason?: string;
}

/**
 * ¿Puede verificarse esta matrícula?
 *  - Contado cobrado en el registro de matrícula (sin cuotas y sin saldo) → sí.
 *  - Plan o Contado en 2 partes → solo si la primera cuota ya está cancelada (pago registrado).
 */
export function checkPaymentGate(enrollment: Pick<Enrollment, 'id' | 'planId'>, plans: Plan[]): PaymentGate {
  const plan = plans.find(p => p.id === enrollment.planId) ?? plans.find(p => p.mat === enrollment.id);
  const warning = 'Realice el primer pago antes de realizar la verificación.';
  if (!plan) return { ok: false, reason: `${warning} La matrícula no tiene un plan de pagos registrado.` };

  if (plan.installments.length === 0) {
    return plan.balance <= 0.005
      ? { ok: true }
      : { ok: false, reason: `${warning} El pago al contado aún no figura como registrado.` };
  }

  const first = plan.installments[0];
  const paid = first.balance <= 0.005 && first.status !== 'Refinanciada';
  return paid
    ? { ok: true }
    : { ok: false, reason: `${warning} Falta cancelar «${first.name}» del plan ${plan.id} (${plan.type}).` };
}

// ---------------------------------------------------------------- Receta que le corresponde

/**
 * Receta de materiales activa y vigente para la matrícula: mismo programa, nivel (o todos los niveles) y sede
 * (o todas las sedes), con `today` dentro de su rango de fechas (el último día cuenta).
 */
export function recipeForEnrollment(
  enrollment: Pick<Enrollment, 'programId' | 'levelId' | 'branchId'>,
  recipes: Recipe[],
  today: string
): Recipe | undefined {
  return recipes.find(r => {
    if (r.status !== 'Activo' || r.programId !== enrollment.programId) return false;
    if (r.levelId && r.levelId !== enrollment.levelId) return false;
    if (!r.applyToAllBranches && !(enrollment.branchId && r.branchIds.includes(enrollment.branchId))) return false;
    return r.startDate.slice(0, 10) <= today && (!r.endDate || today <= r.endDate.slice(0, 10));
  });
}

// ---------------------------------------------------------------- Entrega por línea de receta

type Line = Recipe['items'][number];

/** ¿El artículo puede entregarse por componentes? (un kit con composición; no depende de ninguna casilla del artículo) */
export const canSplitKit = (item: Item | undefined): boolean =>
  !!item && item.isPackage && (item.composition?.length ?? 0) > 0;

/** ¿La línea de la receta está entregada con las marcas actuales? */
export function isLineDelivered(line: Line, item: Item | undefined, checked: Record<string, boolean>, mode: DeliveryMode): boolean {
  if (canSplitKit(item) && mode === 'componentes') return item!.composition!.every(c => !!checked[c.itemId]);
  return !!checked[line.itemId];
}

export interface Verification {
  /** Estado calculado automáticamente. */
  status: 'Verificado Completo' | 'Verificado Incompleto';
  complete: boolean;
  /** Ids de artículos entregados (kit o componentes, según el modo). */
  deliveredIds: string[];
  delivered: number;
  total: number;
}

export function computeVerification(
  recipe: Recipe,
  items: Item[],
  checked: Record<string, boolean>,
  modes: Record<string, DeliveryMode>
): Verification {
  const deliveredIds: string[] = [];
  let delivered = 0;
  recipe.items.forEach(line => {
    const item = items.find(i => i.id === line.itemId);
    const mode = modes[line.itemId] ?? 'kit';
    if (canSplitKit(item) && mode === 'componentes') {
      item!.composition!.forEach(c => { if (checked[c.itemId]) deliveredIds.push(c.itemId); });
    } else if (checked[line.itemId]) {
      deliveredIds.push(line.itemId);
    }
    if (isLineDelivered(line, item, checked, mode)) delivered++;
  });
  const complete = delivered === recipe.items.length;
  return {
    status: complete ? 'Verificado Completo' : 'Verificado Incompleto',
    complete,
    deliveredIds,
    delivered,
    total: recipe.items.length,
  };
}

export interface Deduction {
  itemId: string;
  quantity: number;
}

/** Salidas de stock de esta verificación: solo lo entregado ahora (no lo ya entregado antes). */
export function pendingDeductions(
  recipe: Recipe,
  items: Item[],
  deliveredIds: string[],
  alreadyDelivered: string[],
  modes: Record<string, DeliveryMode>
): Deduction[] {
  const before = new Set(alreadyDelivered);
  const out: Deduction[] = [];
  recipe.items.forEach(line => {
    const item = items.find(i => i.id === line.itemId);
    if (canSplitKit(item) && (modes[line.itemId] ?? 'kit') === 'componentes') {
      item!.composition!.forEach(c => {
        if (deliveredIds.includes(c.itemId) && !before.has(c.itemId)) out.push({ itemId: c.itemId, quantity: line.quantity * c.quantity });
      });
    } else if (deliveredIds.includes(line.itemId) && !before.has(line.itemId)) {
      out.push({ itemId: line.itemId, quantity: line.quantity });
    }
  });
  return out;
}

/** Primer artículo sin stock suficiente en la sede para las salidas indicadas, o `null`. */
export function findShortage(stock: StockItem[], branchId: string, deductions: Deduction[], items: Item[]): string | null {
  const needed = new Map<string, number>();
  deductions.forEach(d => needed.set(d.itemId, (needed.get(d.itemId) ?? 0) + d.quantity));
  for (const [itemId, qty] of needed) {
    if (availableStock(stock, branchId, itemId) < qty) return items.find(i => i.id === itemId)?.name ?? itemId;
  }
  return null;
}

/**
 * Modo inicial de cada kit según lo ya entregado en verificaciones anteriores y, si se pasa el stock, según lo que hay en la sede: sin
 * stock del kit la lista de componentes se abre sola (es la única salida); con stock del kit se entrega el kit.
 */
export function initialModes(recipe: Recipe, items: Item[], alreadyDelivered: string[], where?: { stock: StockItem[]; branchId: string }): Record<string, DeliveryMode> {
  const modes: Record<string, DeliveryMode> = {};
  recipe.items.forEach(line => {
    const item = items.find(i => i.id === line.itemId);
    if (!canSplitKit(item)) return;
    const kitDelivered = alreadyDelivered.includes(line.itemId);
    const someComponents = item!.composition!.some(c => alreadyDelivered.includes(c.itemId));
    const noKitStock = !!where && !kitDelivered && availableStock(where.stock, where.branchId, line.itemId) < line.quantity;
    modes[line.itemId] = !kitDelivered && (someComponents || noKitStock) ? 'componentes' : 'kit';
  });
  return modes;
}

/** Componentes del kit con stock suficiente en la sede (para sugerir la entrega por componentes si falta el kit). */
export function availableComponents(stock: StockItem[], branchId: string, line: Line, item: Item) {
  return (item.composition ?? []).filter(c => availableStock(stock, branchId, c.itemId) >= line.quantity * c.quantity);
}

/**
 * ¿No hay stock de nada de lo que falta entregar? Ni del kit, ni de sus componentes, ni de ningún otro artículo de la receta.
 * (Con las líneas ya entregadas no se cuenta. `false` si no queda nada por entregar.)
 */
export function noStockAtAll(recipe: Recipe, items: Item[], stock: StockItem[], branchId: string, alreadyDelivered: string[]): boolean {
  let pending = 0;
  for (const line of recipe.items) {
    if (alreadyDelivered.includes(line.itemId)) continue;
    pending++;
    const item = items.find(i => i.id === line.itemId);
    if (availableStock(stock, branchId, line.itemId) >= line.quantity) return false;
    if (canSplitKit(item) && item!.composition!.some(c => !alreadyDelivered.includes(c.itemId) && availableStock(stock, branchId, c.itemId) >= line.quantity * c.quantity)) return false;
  }
  return pending > 0;
}

/** Nombres de lo que quedaría sin entregar con las marcas actuales (un kit por componentes lista los componentes que faltan). */
export function pendingNames(recipe: Recipe, items: Item[], checked: Record<string, boolean>, modes: Record<string, DeliveryMode>): string[] {
  const out: string[] = [];
  recipe.items.forEach(line => {
    const item = items.find(i => i.id === line.itemId);
    if (canSplitKit(item) && (modes[line.itemId] ?? 'kit') === 'componentes') {
      item!.composition!.forEach(c => { if (!checked[c.itemId]) out.push(c.name); });
    } else if (!checked[line.itemId]) {
      out.push(item?.name ?? line.itemId);
    }
  });
  return out;
}
