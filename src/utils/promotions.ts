/**
 * Motor de promociones grupales (funciones puras, sin estado).
 *
 * - La elegibilidad se calcula con el tarifario vigente de cada alumno (programa, tipo de pago,
 *   precio base), no con una composición rígida.
 * - Un alumno pertenece a un solo grupo dentro del mismo registro.
 * - Un grupo = un único pago (con una o varias partes). Las partes NO son cuotas.
 */
import type { PaymentPart, Promotion, PromotionGroup } from '../context/DataContext';
import { roundMoney, sumPaymentParts } from './tariffs';

/** Alumno/matrícula en proceso, tal como lo entrega el paso Programa del asistente. */
export interface PromoStudent {
  /** Clave estable del alumno dentro del registro (aún no hay matrícula definitiva). */
  key: string;
  programId: string;
  levelId?: string;
  paymentTypeId: string;
  tariffId: string;
  /** Precio contado/base del tarifario vigente usado para la regla. */
  basePrice: number;
  currency: 'PEN' | 'USD';
}

export interface PromoContext {
  branchId: string;
  /** Fecha de matrícula ISO (YYYY-MM-DD). */
  date: string;
}

/** Resultado de validación. (El proyecto no usa `strict`, por eso no es una unión discriminada.) */
export interface ValidationResult {
  ok: boolean;
  error?: string;
}

export interface PromotionOffer {
  promotion: Promotion;
  /** Alumnos que cumplen las condiciones individuales de la promoción. */
  eligibleKeys: string[];
  /** Cantidad máxima de grupos formables con los elegibles (respeta `allowMultipleGroups`). */
  maxGroups: number;
}

/** ¿La promoción está activa, vigente y habilitada para la sede? */
export function isPromotionAvailable(promo: Promotion, ctx: PromoContext): boolean {
  if (promo.status !== 'Activo') return false;
  if (ctx.date < promo.startDate) return false;
  if (promo.endDate && ctx.date > promo.endDate) return false;
  if (!promo.applyToAllBranches && !promo.branchIds.includes(ctx.branchId)) return false;
  return true;
}

/** Programas elegibles: explícitos o, en promociones antiguas, los de la composición fija. */
export function eligibleProgramIds(promo: Promotion): string[] {
  if (promo.eligibleProgramIds && promo.eligibleProgramIds.length > 0) return promo.eligibleProgramIds;
  return Array.from(new Set((promo.composition ?? []).map(c => c.programId).filter(Boolean)));
}

/** Condiciones individuales de un alumno frente a una promoción. */
export function isStudentEligible(promo: Promotion, student: PromoStudent): boolean {
  if (!promo.paymentTypeIds.includes(student.paymentTypeId)) return false;
  if (!eligibleProgramIds(promo).includes(student.programId)) return false;
  if (student.currency !== promo.currency) return false;
  if (promo.requiredBasePrice !== undefined && promo.requiredBasePrice > 0) {
    if (roundMoney(student.basePrice) !== roundMoney(promo.requiredBasePrice)) return false;
  }
  return true;
}

const usesFixedComposition = (promo: Promotion) =>
  !(promo.eligibleProgramIds && promo.eligibleProgramIds.length > 0) && (promo.composition?.length ?? 0) > 0;

/** Valida que un conjunto concreto de alumnos forme un grupo válido para la promoción. */
export function validateGroup(
  promo: Promotion,
  members: PromoStudent[],
  ctx: PromoContext
): ValidationResult {
  if (!isPromotionAvailable(promo, ctx)) return { ok: false, error: 'La promoción no está disponible para la sede o fecha.' };
  if (members.length !== promo.requiredStudents) {
    return { ok: false, error: `La promoción requiere exactamente ${promo.requiredStudents} alumnos.` };
  }
  if (new Set(members.map(m => m.key)).size !== members.length) {
    return { ok: false, error: 'Un alumno no puede repetirse dentro del grupo.' };
  }
  const notEligible = members.find(m => !isStudentEligible(promo, m));
  if (notEligible) return { ok: false, error: 'Hay alumnos que no cumplen programa, tipo de pago o precio base de la promoción.' };
  // Un grupo = un único pago: todos deben compartir tipo de pago.
  if (new Set(members.map(m => m.paymentTypeId)).size > 1) {
    return { ok: false, error: 'Los alumnos del grupo deben usar el mismo tipo de pago (se paga una sola vez).' };
  }
  // Promociones antiguas con composición rígida (programa × cantidad).
  if (usesFixedComposition(promo)) {
    const need = new Map<string, number>();
    promo.composition!.forEach(c => need.set(c.programId, (need.get(c.programId) ?? 0) + c.quantity));
    const have = new Map<string, number>();
    members.forEach(m => have.set(m.programId, (have.get(m.programId) ?? 0) + 1));
    const same = need.size === have.size && Array.from(need).every(([pid, q]) => have.get(pid) === q);
    if (!same) return { ok: false, error: 'La combinación de programas no coincide con la composición de la promoción.' };
  }
  return { ok: true };
}

/** Reparto igualitario; el resto de centavos va a los primeros alumnos. La suma siempre es exacta. */
export function distributeEqually(total: number, count: number): number[] {
  if (count <= 0) return [];
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / count);
  const remainder = cents - base * count;
  return Array.from({ length: count }, (_, i) => (base + (i < remainder ? 1 : 0)) / 100);
}

/**
 * Promociones que podrían aplicar al registro actual. Con 1 alumno no hay beneficio grupal.
 * Devuelve solo las que tienen al menos un grupo formable.
 */
export function findPromotionOffers(
  promotions: Promotion[],
  students: PromoStudent[],
  ctx: PromoContext
): PromotionOffer[] {
  if (students.length < 2) return [];
  const offers: PromotionOffer[] = [];
  for (const promotion of promotions) {
    if (!isPromotionAvailable(promotion, ctx)) continue;
    const eligibleKeys = students.filter(s => isStudentEligible(promotion, s)).map(s => s.key);
    if (eligibleKeys.length < promotion.requiredStudents) continue;
    // Los grupos exigen tipo de pago común: se toma el mayor subconjunto compatible.
    const byPayment = new Map<string, string[]>();
    eligibleKeys.forEach(k => {
      const pt = students.find(s => s.key === k)!.paymentTypeId;
      byPayment.set(pt, [...(byPayment.get(pt) ?? []), k]);
    });
    const best = Math.max(...Array.from(byPayment.values()).map(v => Math.floor(v.length / promotion.requiredStudents)));
    if (best < 1) continue;
    // Promociones de composición rígida: se comprueba al validar el grupo concreto.
    offers.push({
      promotion,
      eligibleKeys,
      maxGroups: promotion.allowMultipleGroups ? best : 1,
    });
  }
  return offers;
}

/** Sugerencia automática de grupos (greedy por orden de ingreso) para una promoción. */
export function suggestGroups(
  promo: Promotion,
  students: PromoStudent[],
  ctx: PromoContext,
  alreadyUsedKeys: string[] = []
): string[][] {
  const used = new Set(alreadyUsedKeys);
  const groups: string[][] = [];
  const pool = students.filter(s => !used.has(s.key) && isStudentEligible(promo, s));
  const limit = promo.allowMultipleGroups ? Infinity : 1;
  const remaining = [...pool];
  while (remaining.length >= promo.requiredStudents && groups.length < limit) {
    const first = remaining[0];
    const mates = remaining.filter(s => s.paymentTypeId === first.paymentTypeId).slice(0, promo.requiredStudents);
    if (mates.length < promo.requiredStudents) { remaining.shift(); continue; }
    if (!validateGroup(promo, mates, ctx).ok) { remaining.shift(); continue; }
    groups.push(mates.map(m => m.key));
    mates.forEach(m => remaining.splice(remaining.findIndex(r => r.key === m.key), 1));
  }
  return groups;
}

/**
 * Construye los grupos promocionales a partir de una selección de alumnos por grupo.
 * Garantiza: cada grupo es válido, ningún alumno está en dos grupos y se respeta `allowMultipleGroups`.
 */
export function buildPromotionGroups(
  promo: Promotion,
  selections: string[][],
  students: PromoStudent[],
  ctx: PromoContext
): ValidationResult & { groups?: Omit<PromotionGroup, 'id'>[] } {
  if (selections.length === 0) return { ok: false, error: 'Seleccione al menos un grupo.' };
  if (selections.length > 1 && !promo.allowMultipleGroups) {
    return { ok: false, error: 'La promoción no permite formar varios grupos en un mismo registro.' };
  }
  const seen = new Set<string>();
  const groups: Omit<PromotionGroup, 'id'>[] = [];
  for (const keys of selections) {
    for (const k of keys) {
      if (seen.has(k)) return { ok: false, error: 'Un alumno no puede pertenecer a dos grupos promocionales.' };
      seen.add(k);
    }
    const members = keys.map(k => students.find(s => s.key === k)).filter((s): s is PromoStudent => !!s);
    if (members.length !== keys.length) return { ok: false, error: 'Alumno no encontrado en el registro.' };
    const check = validateGroup(promo, members, ctx);
    if (!check.ok) return { ok: false, error: check.error };
    const amounts = distributeEqually(promo.totalPrice, members.length);
    groups.push({
      promotionId: promo.id,
      currency: promo.currency,
      totalPrice: promo.totalPrice,
      allocations: members.map((m, i) => ({ studentKey: m.key, amount: amounts[i] })),
    });
  }
  return { ok: true, groups };
}

/** Pago grupal preparado: un único pago por grupo con sus partes; sin pagos individuales por alumno. */
export interface GroupPaymentDraft {
  promotionId: string;
  currency: 'PEN' | 'USD';
  total: number;
  parts: PaymentPart[];
  studentKeys: string[];
}

export function prepareGroupPayment(
  group: Omit<PromotionGroup, 'id'>,
  parts: PaymentPart[]
): ValidationResult & { draft?: GroupPaymentDraft } {
  if (parts.length === 0) return { ok: false, error: 'Registre al menos una parte de pago.' };
  const paid = sumPaymentParts(parts, group.currency);
  if (paid === null) return { ok: false, error: 'Falta el tipo de cambio en alguna parte con otra moneda.' };
  if (Math.abs(paid - group.totalPrice) > 0.01) {
    return { ok: false, error: `La suma de las partes (${paid.toFixed(2)}) no coincide con el total del grupo (${group.totalPrice.toFixed(2)}).` };
  }
  return {
    ok: true,
    draft: {
      promotionId: group.promotionId,
      currency: group.currency,
      total: group.totalPrice,
      parts,
      studentKeys: group.allocations.map(a => a.studentKey),
    },
  };
}
