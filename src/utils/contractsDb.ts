/**
 * Contratos y planillas guardados en la base de datos (Lote 3): traducción entre las tablas (`contratos`, `contratos_pago`,
 * `contrato_revisiones`, `planillas`, `planilla_ajustes`, `planilla_lineas`, `planilla_eventos`) y el modelo del sistema (`Contract`,
 * `PayrollRun`), y los cuerpos de las funciones de la base que las escriben.
 *
 * - Lo que es dinero de un contrato vive en `contratos_pago` y solo lo lee quien tiene «Ver remuneraciones»: sin esa función la base no
 *   entrega esas filas y el contrato llega SIN sueldo (los campos de dinero quedan sin definir; las pantallas ya no muestran ninguno).
 * - Una planilla cerrada guarda la FOTO de cada línea (`planilla_lineas.linea`); una en borrador no tiene líneas guardadas: se recalcula.
 * - Nadie escribe las tablas directamente: se llama a las funciones `crear_contrato`, `editar_contrato`, `cesar_contrato`, `renovar_contrato`,
 *   `generar_planilla`, `eliminar_borrador_planilla`, `agregar_ajuste_planilla`, `quitar_ajuste_planilla`, `cerrar_planilla` y `reabrir_planilla`.
 */
import type { Contract, ContractRevision, PayrollAdjustment, PayrollEvent, PayrollLine, PayrollRun } from '../context/DataContext';
import type { ContractStatus } from './statuses';

// ------------------------------------------------------------------------------------------------------------------ Filas de la base

export interface ContratoRow {
  id: string;
  personal_id: string;
  empresa_id: string;
  tipo: string;
  cargo: string;
  fecha_inicio: string;
  fecha_fin: string | null;
  estado: string;
  jornada: string;
  vacaciones_inicio: string | null;
  vacaciones_fin: string | null;
  motivo_cese: string | null;
  renueva_id: string | null;
  observaciones: string | null;
}

export interface ContratoPagoRow {
  contrato_id: string;
  sueldo_bruto: number | string;
  sistema_pension: string | null;
  afp: string | null;
  aporte: number | string;
  renta: number | string;
  asignacion_familiar: number | string;
  neto: number | string;
  suspension_4ta: boolean;
}

export interface RevisionRow {
  id: number;
  contrato_id: string;
  en: string;
  por: string;
  motivo: string;
  cambios: ContractRevision['changes'];
}

export interface PlanillaRow {
  id: string;
  empresa_id: string;
  periodo: string;
  estado: string;
  creada_en: string;
  creada_por: string;
  cerrada_en: string | null;
  cerrada_por: string | null;
}

export interface AjusteRow {
  id: string;
  planilla_id: string;
  personal_id: string;
  tipo: string;
  concepto: string;
  monto: number | string;
  afecto: boolean;
  motivo: string;
  por: string;
  en: string;
}

export interface LineaRow {
  planilla_id: string;
  contrato_id: string;
  personal_id: string;
  neto: number | string;
  linea: PayrollLine;
}

export interface EventoRow {
  id: number;
  planilla_id: string;
  en: string;
  por: string;
  accion: string;
  detalle: string | null;
}

// ------------------------------------------------------------------------------------------------------------------ Contratos

const num = (v: number | string | null | undefined): number | undefined => (v === null || v === undefined ? undefined : Number(v));

const CONTRACT_STATUS: readonly string[] = ['Vigente', 'Cesado', 'Renovado'];

/** El contrato con su parte de dinero (si la cuenta puede verla) y sus modificaciones (la más reciente primero). */
export function contractFromRows(row: ContratoRow, pago?: ContratoPagoRow | null, revisions: RevisionRow[] = []): Contract {
  const own = revisions.filter(r => r.contrato_id === row.id).sort((a, b) => b.en.localeCompare(a.en) || b.id - a.id);
  return {
    id: row.id,
    staffId: row.personal_id,
    companyId: row.empresa_id,
    type: row.tipo,
    position: row.cargo,
    startDate: row.fecha_inicio,
    endDate: row.fecha_fin ?? undefined,
    status: (CONTRACT_STATUS.includes(row.estado) ? row.estado : 'Vigente') as ContractStatus,
    shift: row.jornada,
    pensionSystem: pago?.sistema_pension ?? undefined,
    pensionFund: pago?.afp ?? undefined,
    grossSalary: num(pago?.sueldo_bruto),
    contribution: num(pago?.aporte),
    incomeTax: num(pago?.renta),
    familyAllowance: num(pago?.asignacion_familiar),
    netSalary: num(pago?.neto),
    suspension4ta: pago?.suspension_4ta ? true : undefined,
    vacationStart: row.vacaciones_inicio ?? undefined,
    vacationEnd: row.vacaciones_fin ?? undefined,
    terminationReason: row.motivo_cese ?? undefined,
    renewsId: row.renueva_id ?? undefined,
    observations: row.observaciones ?? undefined,
    revisions: own.length > 0 ? own.map(r => ({ at: r.en, by: r.por, reason: r.motivo, changes: r.cambios })) : undefined,
  };
}

/** Cuerpo de `crear_contrato`, `editar_contrato` y `renovar_contrato`: las condiciones del contrato (sin código ni estado: los pone la base). */
export function contractPayload(c: Omit<Contract, 'id'>): Record<string, unknown> {
  return {
    personal_id: c.staffId,
    empresa_id: c.companyId ?? '',
    tipo: c.type,
    cargo: (c.position ?? '').trim(),
    fecha_inicio: c.startDate,
    fecha_fin: c.endDate ?? null,
    sueldo_bruto: c.grossSalary ?? null,
    sistema_pension: c.pensionSystem ?? null,
    afp: c.pensionFund ?? null,
    aporte: c.contribution ?? 0,
    renta: c.incomeTax ?? 0,
    asignacion_familiar: c.familyAllowance ?? 0,
    neto: c.netSalary ?? c.grossSalary ?? 0,
    suspension_4ta: !!c.suspension4ta,
    vacaciones_inicio: c.vacationStart ?? null,
    vacaciones_fin: c.vacationEnd ?? null,
    observaciones: c.observations ?? null,
  };
}

// ------------------------------------------------------------------------------------------------------------------ Planillas

const ADJUSTMENT_KINDS: readonly string[] = ['Ingreso', 'Descuento'];
const EVENT_ACTIONS: readonly string[] = ['Generada', 'Ajuste', 'Cerrada', 'Reabierta'];

export const adjustmentFromRow = (r: AjusteRow): PayrollAdjustment => ({
  id: r.id,
  staffId: r.personal_id,
  kind: (ADJUSTMENT_KINDS.includes(r.tipo) ? r.tipo : 'Ingreso') as PayrollAdjustment['kind'],
  concept: r.concepto,
  amount: Number(r.monto),
  taxable: r.afecto,
  reason: r.motivo,
  by: r.por,
  at: r.en,
});

/**
 * Las planillas con sus ajustes, la foto de sus líneas (solo las cerradas) y su historial. La más reciente primero; a igual mes, por empresa.
 * Las líneas de una cerrada vuelven en el orden de siempre: por nombre del trabajador.
 */
export function runsFromRows(planillas: PlanillaRow[], ajustes: AjusteRow[], lineas: LineaRow[], eventos: EventoRow[]): PayrollRun[] {
  return planillas.map((p): PayrollRun => {
    const closed = p.estado === 'Cerrada';
    return {
      id: p.id,
      companyId: p.empresa_id,
      period: p.periodo,
      status: closed ? 'Cerrada' : 'Borrador',
      adjustments: ajustes.filter(a => a.planilla_id === p.id).map(adjustmentFromRow).sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id)),
      lines: closed ? lineas.filter(l => l.planilla_id === p.id).map(l => l.linea).sort((a, b) => a.staffName.localeCompare(b.staffName)) : undefined,
      createdAt: p.creada_en,
      createdBy: p.creada_por,
      closedAt: p.cerrada_en ?? undefined,
      closedBy: p.cerrada_por ?? undefined,
      events: eventos.filter(e => e.planilla_id === p.id).sort((a, b) => a.en.localeCompare(b.en) || a.id - b.id).map((e): PayrollEvent => ({
        at: e.en, by: e.por, action: (EVENT_ACTIONS.includes(e.accion) ? e.accion : 'Ajuste') as PayrollEvent['action'], detail: e.detalle ?? undefined,
      })),
    };
  }).sort((a, b) => b.period.localeCompare(a.period) || a.companyId.localeCompare(b.companyId));
}

/** Cuerpo de `agregar_ajuste_planilla`. */
export const adjustmentPayload = (a: PayrollAdjustment): Record<string, unknown> => ({
  personal_id: a.staffId, tipo: a.kind, concepto: a.concept, monto: a.amount, afecto: a.taxable, motivo: a.reason,
});

/** Cuerpo de `cerrar_planilla`: la foto de cada línea, con lo mínimo que la base comprueba (contrato, persona y neto). */
export const linesPayload = (lines: PayrollLine[]): Record<string, unknown>[] => lines.map(l => ({
  contrato_id: l.contractId, personal_id: l.staffId, neto: l.calc.net, linea: l,
}));
