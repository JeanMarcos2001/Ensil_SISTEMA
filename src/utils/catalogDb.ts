/**
 * Traducción entre el catálogo comercial del sistema y las filas de la base (tablas `programas`, `niveles`, `tipos_pago`, `tarifarios`,
 * `promociones` y `origenes_lead`), y de los errores de la base a mensajes claros. Funciones puras.
 *
 * Al guardar un cambio se manda la fila completa (ya mezclada con lo que cambió y validada): así los valores que dependen entre sí
 * (modalidad y cuotas de un tipo de pago, «todas las sedes» y la lista de sedes) nunca llegan a medias.
 */
import type { LeadSource, Level, PaymentType, Program, Promotion, Tariff, TariffInstallment } from '../context/DataContext';
import { resolveScheduleMode } from './tariffs';
import { dbErrorMessage, type DbErrorLike } from './orgDirectory';
import type { CatalogKind } from './catalog';

type Estado = 'Activo' | 'Inactivo';

export interface ProgramaRow {
  id: string; codigo: string; nombre: string; alias: string | null; descripcion: string | null; tiene_niveles: boolean;
  duracion_base: number; garantia: number; todas_las_sedes: boolean; sedes_habilitadas: string[]; estado: Estado; observaciones: string | null;
}
export interface NivelRow {
  id: string; programa_id: string; codigo: string; nombre: string; orden: number; estado: Estado; descripcion: string | null;
}
export interface TipoPagoRow {
  id: string; codigo: string; nombre: string; cuotas: number; intervalo_dias: number; modalidad: 'inmediato' | 'intervalo_fijo' | 'fechas_manuales';
  estado: Estado; descripcion: string | null;
}
export interface LineaRow { numero: number; concepto: string; monto: number; dias: number; tipo: 'matricula' | 'cuota' | 'unica' | 'parte'; variable: boolean }
export interface TarifarioRow {
  id: string; nombre: string; programa_id: string; nivel_id: string | null; tipo_pago_id: string; sede_id: string | null; moneda: 'PEN' | 'USD';
  precio_base: number | string; lineas: LineaRow[]; vigencia_inicio: string; vigencia_fin: string | null; estado: Estado;
}
export interface PromocionRow {
  id: string; codigo: string; nombre: string; tipo: 'Grupal'; alumnos_requeridos: number; programas_elegibles: string[];
  precio_base_requerido: number | string | null; permite_varios_grupos: boolean; tipos_pago: string[]; precio_total: number | string;
  moneda: 'PEN' | 'USD'; regla_reparto: 'Igualitario'; todas_las_sedes: boolean; sedes: string[]; vigencia_inicio: string; vigencia_fin: string | null;
  estado: Estado; observaciones: string | null;
}
export interface OrigenLeadRow { id: string; nombre: string; estado: Estado }

const blankToNull = (s: string | undefined): string | null => (s && s.trim() ? s.trim() : null);

// ------------------------------------------------------------------------------------------------------------------ Programas

export const programFromRow = (r: ProgramaRow): Program => ({
  id: r.id, code: r.codigo, name: r.nombre,
  ...(r.alias ? { alias: r.alias } : {}), ...(r.descripcion ? { description: r.descripcion } : {}),
  hasLevels: r.tiene_niveles, durationBase: Number(r.duracion_base), warranty: Number(r.garantia),
  allBranches: r.todas_las_sedes, ...(r.todas_las_sedes ? {} : { enabledBranches: [...r.sedes_habilitadas] }),
  status: r.estado, ...(r.observaciones ? { observations: r.observaciones } : {}),
});

export const programToRow = (p: Program): ProgramaRow => ({
  id: p.id, codigo: p.code.trim(), nombre: p.name.trim(), alias: blankToNull(p.alias), descripcion: blankToNull(p.description),
  tiene_niveles: p.hasLevels, duracion_base: p.durationBase, garantia: p.warranty,
  todas_las_sedes: p.allBranches, sedes_habilitadas: p.allBranches ? [] : [...(p.enabledBranches ?? [])],
  estado: p.status, observaciones: blankToNull(p.observations),
});

// ------------------------------------------------------------------------------------------------------------------ Niveles

export const levelFromRow = (r: NivelRow): Level => ({
  id: r.id, programId: r.programa_id, code: r.codigo, name: r.nombre, order: Number(r.orden), status: r.estado,
  ...(r.descripcion ? { description: r.descripcion } : {}),
});

export const levelToRow = (l: Level): NivelRow => ({
  id: l.id, programa_id: l.programId, codigo: l.code.trim(), nombre: l.name.trim(), orden: l.order, estado: l.status, descripcion: blankToNull(l.description),
});

// ------------------------------------------------------------------------------------------------------------------ Tipos de pago

export const paymentTypeFromRow = (r: TipoPagoRow): PaymentType => ({
  id: r.id, code: r.codigo, name: r.nombre, installments: Number(r.cuotas), termDays: Number(r.intervalo_dias), scheduleMode: r.modalidad, status: r.estado,
  ...(r.descripcion ? { description: r.descripcion } : {}),
});

export const paymentTypeToRow = (t: PaymentType): TipoPagoRow => {
  const mode = resolveScheduleMode(t);
  return {
    id: t.id, codigo: t.code.trim(), nombre: t.name.trim(), cuotas: t.installments, intervalo_dias: mode === 'inmediato' ? 0 : t.termDays,
    modalidad: mode, estado: t.status, descripcion: blankToNull(t.description),
  };
};

// ------------------------------------------------------------------------------------------------------------------ Tarifarios

const lineFromRow = (l: LineaRow): TariffInstallment => ({
  number: Number(l.numero), concept: l.concepto, amount: Number(l.monto), dueDays: Number(l.dias), kind: l.tipo, ...(l.variable ? { variable: true } : {}),
});
const lineToRow = (l: TariffInstallment): LineaRow => ({
  numero: l.number, concepto: l.concept, monto: l.amount, dias: l.dueDays, tipo: l.kind ?? (l.number === 0 ? 'matricula' : 'cuota'), variable: !!l.variable,
});

export const tariffFromRow = (r: TarifarioRow): Tariff => ({
  id: r.id, name: r.nombre, programId: r.programa_id, ...(r.nivel_id ? { levelId: r.nivel_id } : {}), paymentTypeId: r.tipo_pago_id,
  branchId: r.sede_id ?? 'all', currency: r.moneda, basePrice: Number(r.precio_base), installments: (r.lineas ?? []).map(lineFromRow),
  startDate: r.vigencia_inicio, ...(r.vigencia_fin ? { endDate: r.vigencia_fin } : {}), status: r.estado,
});

export const tariffToRow = (t: Tariff): TarifarioRow => ({
  id: t.id, nombre: t.name.trim(), programa_id: t.programId, nivel_id: t.levelId || null, tipo_pago_id: t.paymentTypeId,
  sede_id: !t.branchId || t.branchId === 'all' ? null : t.branchId, moneda: t.currency, precio_base: t.basePrice,
  lineas: [...t.installments].sort((a, b) => a.number - b.number).map(lineToRow),
  vigencia_inicio: t.startDate, vigencia_fin: t.endDate || null, estado: t.status,
});

// ------------------------------------------------------------------------------------------------------------------ Promociones

export const promotionFromRow = (r: PromocionRow): Promotion => ({
  id: r.id, code: r.codigo, name: r.nombre, type: r.tipo, requiredStudents: Number(r.alumnos_requeridos), eligibleProgramIds: [...r.programas_elegibles],
  ...(r.precio_base_requerido !== null && r.precio_base_requerido !== undefined ? { requiredBasePrice: Number(r.precio_base_requerido) } : {}),
  allowMultipleGroups: r.permite_varios_grupos, paymentTypeIds: [...r.tipos_pago], totalPrice: Number(r.precio_total), currency: r.moneda,
  internalDistributionRule: r.regla_reparto, branchIds: r.todas_las_sedes ? [] : [...r.sedes], applyToAllBranches: r.todas_las_sedes,
  startDate: r.vigencia_inicio, endDate: r.vigencia_fin ?? '', status: r.estado, ...(r.observaciones ? { observations: r.observaciones } : {}),
});

export const promotionToRow = (p: Promotion): PromocionRow => ({
  id: p.id, codigo: p.code.trim(), nombre: p.name.trim(), tipo: 'Grupal', alumnos_requeridos: p.requiredStudents,
  programas_elegibles: [...(p.eligibleProgramIds ?? [])], precio_base_requerido: p.requiredBasePrice ?? null,
  permite_varios_grupos: !!p.allowMultipleGroups, tipos_pago: [...p.paymentTypeIds], precio_total: p.totalPrice, moneda: p.currency,
  regla_reparto: 'Igualitario', todas_las_sedes: p.applyToAllBranches, sedes: p.applyToAllBranches ? [] : [...p.branchIds],
  vigencia_inicio: p.startDate, vigencia_fin: p.endDate || null, estado: p.status, observaciones: blankToNull(p.observations),
});

// ------------------------------------------------------------------------------------------------------------------ Orígenes de leads

export const leadSourceFromRow = (r: OrigenLeadRow): LeadSource => ({ id: r.id, name: r.nombre, status: r.estado === 'Activo' ? 'active' : 'inactive' });
export const leadSourceToRow = (s: LeadSource): OrigenLeadRow => ({ id: s.id, nombre: s.name.trim(), estado: s.status === 'active' ? 'Activo' : 'Inactivo' });

// ------------------------------------------------------------------------------------------------------------------ Tablas

/** La tabla de cada tipo de registro y cómo se traduce. */
export const CATALOG_TABLES = {
  program: { table: 'programas', fromRow: programFromRow, toRow: programToRow },
  level: { table: 'niveles', fromRow: levelFromRow, toRow: levelToRow },
  paymentType: { table: 'tipos_pago', fromRow: paymentTypeFromRow, toRow: paymentTypeToRow },
  tariff: { table: 'tarifarios', fromRow: tariffFromRow, toRow: tariffToRow },
  promotion: { table: 'promociones', fromRow: promotionFromRow, toRow: promotionToRow },
  leadSource: { table: 'origenes_lead', fromRow: leadSourceFromRow, toRow: leadSourceToRow },
} as const satisfies Record<CatalogKind, { table: string; fromRow: (r: never) => unknown; toRow: (e: never) => unknown }>;

/** Los ids son números como texto: se ordenan como números ('2' antes que '10'). */
export const byNumericId = <T extends { id: string }>(a: T, b: T): number => Number(a.id) - Number(b.id) || a.id.localeCompare(b.id);

// ------------------------------------------------------------------------------------------------------------------ Errores de la base

/** ¿El error es que ya existe una fila con ese id generado (dos personas crearon a la vez)? Se reintenta con el id siguiente. */
export const isCatalogIdConflict = (e: DbErrorLike | null | undefined): boolean =>
  !!e && e.code === '23505' && /(programas|niveles|tipos_pago|tarifarios|promociones|origenes_lead)_pkey/.test(`${e.message ?? ''} ${e.details ?? ''}`.toLowerCase());

export function catalogErrorMessage(e: DbErrorLike | null | undefined): string {
  if (!e) return 'No se pudo guardar. Intente de nuevo.';
  const t = `${e.message ?? ''} ${e.details ?? ''}`.toLowerCase();
  if (e.code === '23505') {
    if (t.includes('programas_codigo_unico')) return 'El código oficial ya está en uso.';
    if (t.includes('programas_nombre_activo_unico')) return 'El nombre oficial ya existe en el catálogo activo.';
    if (t.includes('niveles_codigo_unico')) return 'Ya existe un nivel con ese código en este programa.';
    if (t.includes('tipos_pago_codigo_unico')) return 'El código ya está en uso.';
    if (t.includes('promociones_codigo_unico')) return 'Ya existe una promoción con ese código.';
    if (t.includes('origenes_lead_nombre_unico')) return 'Ya existe un origen con ese nombre.';
  }
  if (e.code === '23503') return 'Algo de lo elegido ya no existe en el catálogo. Actualice la pantalla e intente de nuevo.';
  if (e.code === '23514') return 'Algún dato no cumple el formato que exige la base de datos.';
  return dbErrorMessage(e);
}
