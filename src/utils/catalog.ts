/**
 * Reglas del catálogo comercial (funciones puras, sin estado): programas, niveles, tipos de pago, tarifarios, promociones y orígenes de
 * leads. Son las que antes vivían dentro de cada pantalla de Oferta comercial; ahora las comparten las pantallas, las acciones del contexto
 * y los `check-*`, y la base de datos las vuelve a comprobar (`supabase/migrations/20261107190000_catalogo_comercial.sql`).
 *
 * Cada `…FieldErrors` devuelve un objeto campo → mensaje (vacío si todo está bien); `firstError` toma el primero. Los mensajes están en
 * español, listos para mostrar.
 */
import type { Branch, LeadSource, Level, PaymentType, Program, Promotion, Tariff } from '../context/DataContext';
import { countObligations, resolveScheduleMode, roundMoney, sumBreakdown } from './tariffs';
import type { FieldErrors } from './orgDirectory';

export { firstError, type FieldErrors } from './orgDirectory';

export interface CatalogEntities {
  program: Program; level: Level; paymentType: PaymentType; tariff: Tariff; promotion: Promotion; leadSource: LeadSource;
}
export type CatalogKind = keyof CatalogEntities;

export interface CatalogData {
  programs: Program[]; levels: Level[]; paymentTypes: PaymentType[]; tariffs: Tariff[]; promotions: Promotion[]; leadSources: LeadSource[];
}

export const EMPTY_CATALOG: CatalogData = { programs: [], levels: [], paymentTypes: [], tariffs: [], promotions: [], leadSources: [] };

/** En qué lista de `CatalogData` vive cada tipo de registro. */
export const CATALOG_LIST: Record<CatalogKind, keyof CatalogData> = {
  program: 'programs', level: 'levels', paymentType: 'paymentTypes', tariff: 'tariffs', promotion: 'promotions', leadSource: 'leadSources',
};

/** Cómo se nombra cada tipo de registro en los mensajes («No se encontró el programa.»). */
export const CATALOG_NOUN: Record<CatalogKind, string> = {
  program: 'programa', level: 'nivel', paymentType: 'tipo de pago', tariff: 'tarifario', promotion: 'promoción', leadSource: 'origen de lead',
};

/** Con qué se validan las referencias: el catálogo y las sedes (que vienen de Organización). */
export interface CatalogContext extends CatalogData { branches: Pick<Branch, 'id' | 'name'>[] }

const norm = (s: string | undefined): string => (s ?? '').trim().toLowerCase();
const isWhole = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n);

// ------------------------------------------------------------------------------------------------------------------ Programas

export function programFieldErrors(input: Omit<Program, 'id'>, ctx: CatalogContext, selfId?: string): FieldErrors {
  const e: FieldErrors = {};
  const others = ctx.programs.filter(p => p.id !== selfId);
  if (!input.code?.trim()) e.code = 'El código oficial es obligatorio.';
  else if (others.some(p => norm(p.code) === norm(input.code))) e.code = 'El código oficial ya está en uso.';
  if (!input.name?.trim()) e.name = 'El nombre oficial es obligatorio.';
  else if (input.status === 'Activo' && others.some(p => p.status === 'Activo' && norm(p.name) === norm(input.name))) e.name = 'El nombre oficial ya existe en el catálogo activo.';
  if (!isWhole(input.durationBase) || input.durationBase < 1) e.durationBase = 'La duración base debe ser un número entero de meses, al menos 1.';
  if (!isWhole(input.warranty)) e.warranty = 'La garantía debe ser un número entero de meses.';
  else if (input.warranty < 0) e.warranty = 'La garantía no puede ser negativa.';
  if (!input.allBranches) {
    const enabled = input.enabledBranches ?? [];
    if (enabled.length === 0) e.enabledBranches = 'Debe seleccionar al menos una sede.';
    else if (enabled.some(id => !ctx.branches.some(b => b.id === id))) e.enabledBranches = 'Una de las sedes elegidas no existe.';
  }
  return e;
}

// ------------------------------------------------------------------------------------------------------------------ Niveles

export function levelFieldErrors(input: Omit<Level, 'id'>, ctx: CatalogContext, selfId?: string): FieldErrors {
  const e: FieldErrors = {};
  const parent = ctx.programs.find(p => p.id === input.programId);
  if (!input.programId) e.programId = 'Debe seleccionar un programa padre.';
  else if (!parent) e.programId = 'El programa seleccionado no existe.';
  else if (!parent.hasLevels) e.programId = `El programa "${parent.name}" no está habilitado para gestionar niveles. Solo se permiten programas configurados con «Tiene niveles» en la sección Programas.`;
  if (!input.name?.trim()) e.name = 'El nombre del nivel es obligatorio.';
  if (!input.code?.trim()) e.code = 'El código del nivel es obligatorio.';
  else if (ctx.levels.some(l => l.id !== selfId && l.programId === input.programId && norm(l.code) === norm(input.code))) e.code = 'Ya existe un nivel con ese código en este programa.';
  if (!isWhole(input.order) || input.order < 1) e.order = 'El orden del nivel debe ser un número entero desde 1.';
  return e;
}

// ------------------------------------------------------------------------------------------------------------------ Tipos de pago

export function paymentTypeFieldErrors(input: Omit<PaymentType, 'id'>, ctx: CatalogContext, selfId?: string): FieldErrors {
  const e: FieldErrors = {};
  if (!input.code?.trim()) e.code = 'El código es obligatorio.';
  else if (ctx.paymentTypes.some(t => t.id !== selfId && norm(t.code) === norm(input.code))) e.code = 'El código ya está en uso.';
  if (!input.name?.trim()) e.name = 'El nombre es obligatorio.';
  const mode = resolveScheduleMode(input);
  if (!isWhole(input.installments)) e.installments = 'La cantidad de obligaciones debe ser un número entero.';
  else if (mode === 'inmediato' && input.installments !== 1) e.installments = 'El pago inmediato tiene una sola obligación.';
  else if (mode !== 'inmediato' && input.installments < 2) e.installments = 'Esta modalidad requiere al menos 2 obligaciones.';
  if (mode === 'intervalo_fijo' && !(isWhole(input.termDays) && input.termDays >= 1)) e.termDays = 'El intervalo entre cuotas debe ser de al menos 1 día.';
  else if (!isWhole(input.termDays) || input.termDays < 0) e.termDays = 'El intervalo debe ser un número entero de días.';
  return e;
}

// ------------------------------------------------------------------------------------------------------------------ Tarifarios

export function tariffFieldErrors(input: Omit<Tariff, 'id'>, ctx: CatalogContext, selfId?: string): FieldErrors {
  void selfId;
  const e: FieldErrors = {};
  if (!input.name?.trim()) e.name = 'El nombre de la tarifa es obligatorio.';
  const program = ctx.programs.find(p => p.id === input.programId);
  if (!input.programId) e.programId = 'Debe seleccionar un programa.';
  else if (!program) e.programId = 'El programa seleccionado no existe.';
  if (input.levelId) {
    const level = ctx.levels.find(l => l.id === input.levelId);
    if (!program?.hasLevels || !level || level.programId !== input.programId) e.levelId = 'El nivel seleccionado no pertenece al programa.';
  }
  const paymentType = ctx.paymentTypes.find(t => t.id === input.paymentTypeId);
  if (!input.paymentTypeId) e.paymentTypeId = 'Debe seleccionar un tipo de pago.';
  else if (!paymentType) e.paymentTypeId = 'El tipo de pago seleccionado no existe.';
  if (input.branchId && input.branchId !== 'all' && !ctx.branches.some(b => b.id === input.branchId)) e.branchId = 'La sede elegida no existe.';

  const lines = input.installments ?? [];
  const hasVariable = lines.some(l => l.variable);
  if (lines.length === 0) e.installments = 'Genere el desglose antes de guardar.';
  else if (paymentType && countObligations(lines) !== paymentType.installments) {
    e.installments = `El tipo de pago "${paymentType.name}" requiere ${paymentType.installments} obligación(es) además de la matrícula. Regenere el desglose.`;
  } else if (!hasVariable && lines.some(l => !(l.amount > 0))) e.installments = 'Todas las líneas del desglose deben tener un monto mayor a 0.';
  else {
    const total = hasVariable ? roundMoney(input.basePrice) : sumBreakdown(lines);
    if (!(total > 0)) e.basePrice = hasVariable ? 'Indique el total objetivo (mayor a 0).' : 'El total del desglose debe ser mayor a 0.';
    else if (!hasVariable && Math.abs(roundMoney(input.basePrice) - total) > 0.005) e.basePrice = 'El precio base debe ser la suma del desglose.';
  }
  if (!input.startDate) e.startDate = 'La fecha de inicio es obligatoria.';
  else if (input.endDate && input.endDate < input.startDate) e.endDate = 'La fecha de fin no puede ser menor a la fecha de inicio.';
  return e;
}

// ------------------------------------------------------------------------------------------------------------------ Promociones

export function promotionFieldErrors(input: Omit<Promotion, 'id'>, ctx: CatalogContext, selfId?: string): FieldErrors {
  const e: FieldErrors = {};
  if (!input.code?.trim() || /\s/.test(input.code.trim())) e.code = 'El código es obligatorio y no debe contener espacios.';
  else if (ctx.promotions.some(p => p.id !== selfId && norm(p.code) === norm(input.code))) e.code = 'Ya existe una promoción con ese código.';
  if (!input.name?.trim()) e.name = 'El nombre de la promoción es obligatorio.';
  if (!isWhole(input.requiredStudents) || input.requiredStudents < 2) e.requiredStudents = 'La cantidad de alumnos requerida debe ser mayor a 1.';
  const programIds = input.eligibleProgramIds ?? [];
  if (programIds.length === 0) e.eligibleProgramIds = 'Seleccione al menos un programa elegible.';
  else if (programIds.some(id => !ctx.programs.some(p => p.id === id))) e.eligibleProgramIds = 'Uno de los programas elegidos no existe.';
  if (input.requiredBasePrice !== undefined && !(input.requiredBasePrice > 0)) e.requiredBasePrice = 'El precio contado base requerido debe ser mayor a 0 (o déjelo vacío).';
  if ((input.paymentTypeIds ?? []).length === 0) e.paymentTypeIds = 'Debe seleccionar al menos un tipo de pago permitido.';
  else if (input.paymentTypeIds.some(id => !ctx.paymentTypes.some(t => t.id === id))) e.paymentTypeIds = 'Uno de los tipos de pago elegidos no existe.';
  if (!(input.totalPrice > 0)) e.totalPrice = 'El precio promocional total debe ser mayor a 0.';
  if (!input.applyToAllBranches) {
    if ((input.branchIds ?? []).length === 0) e.branchIds = 'Debe seleccionar al menos una sede o aplicar a todas.';
    else if (input.branchIds.some(id => !ctx.branches.some(b => b.id === id))) e.branchIds = 'Una de las sedes elegidas no existe.';
  }
  if (!input.startDate) e.startDate = 'La fecha de inicio es obligatoria.';
  else if (input.endDate && input.startDate > input.endDate) e.endDate = 'La fecha de fin no puede ser menor a la fecha de inicio.';
  return e;
}

// ------------------------------------------------------------------------------------------------------------------ Orígenes de leads

export function leadSourceFieldErrors(input: Omit<LeadSource, 'id'>, ctx: CatalogContext, selfId?: string): FieldErrors {
  const e: FieldErrors = {};
  if (!input.name?.trim()) e.name = 'El nombre del origen es obligatorio.';
  else if (ctx.leadSources.some(s => s.id !== selfId && norm(s.name) === norm(input.name))) e.name = 'Ya existe un origen con ese nombre.';
  return e;
}

/** Los errores de un registro nuevo o editado, según su tipo. */
export function catalogFieldErrors<K extends CatalogKind>(kind: K, input: Omit<CatalogEntities[K], 'id'>, ctx: CatalogContext, selfId?: string): FieldErrors {
  switch (kind) {
    case 'program': return programFieldErrors(input as Omit<Program, 'id'>, ctx, selfId);
    case 'level': return levelFieldErrors(input as Omit<Level, 'id'>, ctx, selfId);
    case 'paymentType': return paymentTypeFieldErrors(input as Omit<PaymentType, 'id'>, ctx, selfId);
    case 'tariff': return tariffFieldErrors(input as Omit<Tariff, 'id'>, ctx, selfId);
    case 'promotion': return promotionFieldErrors(input as Omit<Promotion, 'id'>, ctx, selfId);
    default: return leadSourceFieldErrors(input as Omit<LeadSource, 'id'>, ctx, selfId);
  }
}

// ------------------------------------------------------------------------------------------------------------------ Eliminar

/**
 * Lo que vive FUERA del catálogo y todavía apunta a él: las matrículas, las recetas de materiales y los grupos promocionales siguen en
 * memoria hasta que pasen a la base. Lo que sí está en el catálogo (niveles de un programa, tarifarios, promociones) se mira en `CatalogData`.
 */
export interface CatalogLinks {
  enrollments: { programId?: string; levelId?: string; paymentTypeId?: string }[];
  recipes: { programId?: string; levelId?: string }[];
  promotionGroups: { promotionId: string }[];
}
export const NO_LINKS: CatalogLinks = { enrollments: [], recipes: [], promotionGroups: [] };

/**
 * ¿Se puede eliminar? Lo que ya se usa no se elimina: se inactiva (así no desaparece de las matrículas y los planes que lo nombran).
 * Devuelve el motivo, o `null` si nada depende del registro.
 */
export function catalogDeletionError(kind: CatalogKind, id: string, data: CatalogData, links: CatalogLinks = NO_LINKS): string | null {
  switch (kind) {
    case 'program': {
      if (data.levels.some(l => l.programId === id)) return 'No se puede eliminar el programa: tiene niveles. Elimínelos primero o inactive el programa.';
      if (data.tariffs.some(t => t.programId === id)) return 'No se puede eliminar el programa: tiene tarifarios. Elimínelos primero o inactive el programa.';
      if (data.promotions.some(p => (p.eligibleProgramIds ?? []).includes(id))) return 'No se puede eliminar el programa: hay promociones que lo usan. Quítelo de ellas o inactive el programa.';
      if (links.enrollments.some(m => m.programId === id) || links.recipes.some(r => r.programId === id)) return 'No se puede eliminar el programa: hay matrículas o recetas de materiales que lo usan. Inactívelo si ya no se ofrece.';
      return null;
    }
    case 'level': {
      if (data.tariffs.some(t => t.levelId === id)) return 'No se puede eliminar el nivel: hay tarifarios que lo usan. Elimínelos primero o inactive el nivel.';
      if (links.enrollments.some(m => m.levelId === id) || links.recipes.some(r => r.levelId === id)) return 'No se puede eliminar el nivel: hay matrículas o recetas de materiales que lo usan. Inactívelo si ya no se ofrece.';
      return null;
    }
    case 'paymentType': {
      if (data.tariffs.some(t => t.paymentTypeId === id)) return 'No se puede eliminar el tipo de pago: hay tarifarios que lo usan. Elimínelos primero o inactive el tipo de pago.';
      if (data.promotions.some(p => (p.paymentTypeIds ?? []).includes(id))) return 'No se puede eliminar el tipo de pago: hay promociones que lo usan. Quítelo de ellas o inactive el tipo de pago.';
      if (links.enrollments.some(m => m.paymentTypeId === id)) return 'No se puede eliminar el tipo de pago: hay matrículas que lo usan. Inactívelo si ya no se ofrece.';
      return null;
    }
    case 'promotion':
      return links.promotionGroups.some(g => g.promotionId === id) ? 'No se puede eliminar la promoción: ya se aplicó en matrículas. Inactívela si ya no se ofrece.' : null;
    default:
      return null;
  }
}

// ------------------------------------------------------------------------------------------------------------------ Duplicar

/** `Kids (Copia)`; si ya existe, `Kids (Copia 2)`, `Kids (Copia 3)`… */
export function copyName(name: string, existing: string[]): string {
  const taken = new Set(existing.map(norm));
  let candidate = `${name} (Copia)`;
  for (let n = 2; taken.has(norm(candidate)); n++) candidate = `${name} (Copia ${n})`;
  return candidate;
}

/** `PRG-KIDS-COPY`; si ya existe, `PRG-KIDS-COPY-2`… */
export function copyCode(code: string, existing: string[]): string {
  const taken = new Set(existing.map(norm));
  let candidate = `${code}-COPY`;
  for (let n = 2; taken.has(norm(candidate)); n++) candidate = `${code}-COPY-${n}`;
  return candidate;
}
