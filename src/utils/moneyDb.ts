/**
 * Traducción entre las matrículas, los planes, las cuotas, los pagos, la caja, las notas de crédito y los grupos promocionales del sistema y las
 * filas de la base (tablas `matriculas`, `planes`, `cuotas`, `pagos`, `movimientos_caja`, `notas_credito` y `grupos_promocionales`). Funciones puras.
 *
 * Lo derivable no se guarda: el nombre del alumno, del programa, del nivel, de la sede, del asesor, del origen, del tipo de pago y del tarifario
 * salen de sus ids al mostrar (`enrollmentFromRow`); el plan de una matrícula, de la matrícula (`planId`).
 *
 * «El cliente calcula, la base guarda y vigila»: cada acción calcula el estado nuevo con las reglas puras de siempre y `diffMoney` compara el estado
 * de antes con el de después; solo viajan las filas nuevas y las columnas que cambiaron. La base aplica todo junto (todo o nada) con
 * `aplicar_cambios_matricula` y vuelve a comprobar los invariantes del dinero.
 */
import type {
  CashMovement, ChangeRequest, CreditNote, DropRequest, Enrollment, EnrollmentChange, Installment, InstallmentPayment, Level, LeadSource, PaymentType, Payment, Plan, Program,
  PromotionGroup, Staff, Student, Tariff, Branch,
} from '../context/DataContext';
import { correctionFromRow, correctionToRow, requestRowsFromState, requestsFromRows, type CorreccionRow, type SolicitudRow } from './requestsDb';
import type { InstallmentStatus, PlanStatus } from './statuses';

// ------------------------------------------------------------------------------------------------------------------ Filas

export interface MatriculaRow {
  id: string; fecha: string; alumno_id: string; sede_id: string; programa_id: string; nivel_id: string | null; asesor_id: string | null; origen_id: string | null;
  observacion: string | null; estado: Enrollment['status']; titular_ids: string[]; tipo_pago_id: string | null; tarifario_id: string | null; precio_asignado: number | null;
  grupo_promocional_id: string | null; verificacion_estado: NonNullable<Enrollment['verificationStatus']> | null; verificacion_items: string[];
  verificacion_fecha: string | null; verificador: string | null; verificacion_obs: string | null; extension_en: string | null; extension_por: string | null;
  caida_fecha: string | null; caida_solicitud: string | null; reactivada_en: string | null; reactivacion_solicitud: string | null; renueva_id: string | null;
  documentos: NonNullable<Enrollment['documents']>;
  creado_en?: string | null; creado_por?: string | null;
}

export interface CuotaRow {
  plan_id?: string; id: string; orden: number; nombre: string; monto: number; saldo: number; vence: string | null; estado: InstallmentStatus;
  cobros: InstallmentPayment[]; variable: boolean; es_mora: boolean; mora_de: string | null; mora_cobrada: number | null; refinanciada_de: string | null;
  refinanciada_a: string | null; reactivada_desde: string | null; anulada_por_caida: boolean; condonada: boolean; nota: string | null; creada_en: string | null;
}

export interface PlanRow {
  id: string; matricula_id: string; tipo: string; total: number; saldo: number; estado: PlanStatus;
  /** Las cuotas viajan dentro del plan (en la base son filas de `cuotas`). Una lectura que no las trae las deja sin esta clave. */
  cuotas?: CuotaRow[];
}

export interface PagoRow {
  id: string; fecha: string; alumno_nombre: string; concepto: string; monto: number; medio: string; comprobante: string; documento: Payment['document'] | null;
  estado: Payment['status']; reversa: Payment['reversal'] | null; partes: NonNullable<Payment['parts']>; moneda: 'PEN' | 'USD' | null;
  grupo_promocional_id: string | null; matricula_ids: string[]; sede_id: string; comentario: string | null;
  creado_en?: string | null; creado_por?: string | null;
}

export interface MovimientoRow {
  id: string; fecha: string; tipo: CashMovement['kind']; concepto: string; referencia: string; moneda: 'PEN' | 'USD'; monto: number; tipo_cambio: number | null;
  monto_usd: number; medio: string; banco: string | null; operacion: string | null; sede_id: string | null; pago_id: string | null; matricula_ids: string[];
  estado: CashMovement['status']; reversa: CashMovement['reversal'] | null; lote_deposito: string | null; deposito: CashMovement['deposit'] | null; venta: CashMovement['sale'] | null;
  creado_en?: string | null; creado_por?: string | null;
}

export interface NotaRow {
  id: string; serie: string; correlativo: number; etiqueta: string; origen: CreditNote['origin']; pago_id: string; alumno_nombre: string; matricula_ids: string[];
  tipo_original: CreditNote['originalType']; documento_original: string; monto: number; moneda: 'PEN' | 'USD'; motivo: string; detalle: string; emitida_en: string;
  emitida_por: string; creado_en?: string | null; creado_por?: string | null;
}

export interface GrupoRow {
  id: string; promocion_id: string; moneda: 'PEN' | 'USD'; precio_total: number; reparto: PromotionGroup['allocations']; pago_id: string | null;
}

/** Todo lo que se lee de la base (las filas tal cual). */
export interface MoneyRows {
  matriculas: MatriculaRow[]; planes: PlanRow[]; pagos: PagoRow[]; movimientos: MovimientoRow[]; notas: NotaRow[]; grupos: GrupoRow[];
  /** Solicitudes de caída, reactivación, cambio de programa y traslado (una sola tabla) y el registro de correcciones de las matrículas. */
  solicitudes: SolicitudRow[]; correcciones: CorreccionRow[];
}
export const emptyMoneyRows = (): MoneyRows => ({ matriculas: [], planes: [], pagos: [], movimientos: [], notas: [], grupos: [], solicitudes: [], correcciones: [] });

/** El estado del dinero tal como lo ven las pantallas y las reglas puras (con los nombres derivados). */
export interface MoneyState {
  enrollments: Enrollment[]; plans: Plan[]; payments: Payment[]; cashMovements: CashMovement[]; creditNotes: CreditNote[]; promotionGroups: PromotionGroup[];
  dropRequests: DropRequest[]; changeRequests: ChangeRequest[]; enrollmentChanges: EnrollmentChange[];
}
export const emptyMoneyState = (): MoneyState => ({
  enrollments: [], plans: [], payments: [], cashMovements: [], creditNotes: [], promotionGroups: [], dropRequests: [], changeRequests: [], enrollmentChanges: [],
});

/** Listas con las que se derivan los nombres de una matrícula. */
export interface EnrollmentLists {
  students: Pick<Student, 'id' | 'name'>[]; programs: Pick<Program, 'id' | 'name'>[]; levels: Pick<Level, 'id' | 'name'>[]; branches: Pick<Branch, 'id' | 'name'>[];
  staff: Pick<Staff, 'id' | 'names' | 'lastNameP'>[]; leadSources: Pick<LeadSource, 'id' | 'name'>[]; paymentTypes: Pick<PaymentType, 'id' | 'name'>[];
  tariffs: Pick<Tariff, 'id' | 'name'>[];
}

// ------------------------------------------------------------------------------------------------------------------ Ayudantes

const opt = <T>(v: T | null | undefined): T | undefined => (v === null || v === undefined || (v as unknown) === '' ? undefined : v);
const nul = <T>(v: T | undefined | null): T | null => (v === undefined || v === null || (v as unknown) === '' ? null : v);
/** El instante tal como lo guarda el sistema (`2026-09-21T15:30:00.000Z`); la API devuelve `+00:00`. */
const iso = (v: string | null | undefined): string | undefined => (v ? new Date(v).toISOString() : undefined);
const ymd = (v: string | null | undefined): string | undefined => (v ? String(v).slice(0, 10) : undefined);

export const numberOfCode = (id: string): number => Number(id.split('-').pop()) || 0;

// ------------------------------------------------------------------------------------------------------------------ Matrículas

/** La fila que se guarda de una matrícula (con `audit` también quién y cuándo, para la carga de partida: con sesión la base los pone ella). */
export function enrollmentToRow(e: Enrollment, audit = false): MatriculaRow {
  const row: MatriculaRow = {
    id: e.id, fecha: e.dateISO, alumno_id: e.studentId, sede_id: e.branchId, programa_id: e.programId, nivel_id: nul(e.levelId), asesor_id: nul(e.asesorId), origen_id: nul(e.origenId),
    observacion: nul(e.observation), estado: e.status, titular_ids: e.guardianIds ?? [], tipo_pago_id: nul(e.paymentTypeId), tarifario_id: nul(e.tariffId),
    precio_asignado: e.assignedPrice ?? null, grupo_promocional_id: nul(e.promotionGroupId), verificacion_estado: e.verificationStatus ?? null,
    verificacion_items: e.verifiedItems ?? [], verificacion_fecha: nul(e.verificationDate), verificador: nul(e.verifier), verificacion_obs: nul(e.verificationObservation),
    extension_en: nul(e.extensionEnabledAt), extension_por: nul(e.extensionEnabledBy), caida_fecha: nul(e.dropDate), caida_solicitud: nul(e.dropRequestId),
    reactivada_en: nul(e.reactivatedAt), reactivacion_solicitud: nul(e.reactivationRequestId), renueva_id: nul(e.renewsId), documentos: e.documents ?? {},
  };
  if (audit) { row.creado_en = e.createdAt ?? null; row.creado_por = e.createdBy ?? null; }
  return row;
}

/** La matrícula con sus nombres derivados. El plan de la matrícula pone su `planId`. */
export function enrollmentFromRow(r: MatriculaRow, planId: string | undefined, lists: EnrollmentLists): Enrollment {
  const asesor = r.asesor_id ? lists.staff.find(s => s.id === r.asesor_id) : undefined;
  const out: Enrollment = {
    id: r.id, dateISO: ymd(r.fecha) ?? r.fecha, studentId: r.alumno_id, student: lists.students.find(s => s.id === r.alumno_id)?.name ?? '',
    programId: r.programa_id, program: lists.programs.find(p => p.id === r.programa_id)?.name ?? '', levelId: opt(r.nivel_id),
    level: (r.nivel_id && lists.levels.find(l => l.id === r.nivel_id)?.name) || 'Sin nivel', branchId: r.sede_id, sede: lists.branches.find(b => b.id === r.sede_id)?.name,
    asesor: asesor ? `${asesor.names} ${asesor.lastNameP}`.replace(/\s+/g, ' ').trim() : undefined, asesorId: opt(r.asesor_id), origen: r.origen_id ? lists.leadSources.find(l => l.id === r.origen_id)?.name : undefined,
    origenId: opt(r.origen_id), status: r.estado, guardianIds: r.titular_ids ?? [],
  };
  const set = <K extends keyof Enrollment>(key: K, value: Enrollment[K] | undefined) => { if (value !== undefined) out[key] = value as Enrollment[K]; };
  set('observation', opt(r.observacion));
  set('planId', planId);
  set('paymentTypeId', opt(r.tipo_pago_id));
  set('paymentTypeName', r.tipo_pago_id ? lists.paymentTypes.find(p => p.id === r.tipo_pago_id)?.name : undefined);
  set('tariffId', opt(r.tarifario_id));
  set('tariffName', r.tarifario_id ? lists.tariffs.find(t => t.id === r.tarifario_id)?.name : undefined);
  set('assignedPrice', r.precio_asignado ?? undefined);
  set('promotionGroupId', opt(r.grupo_promocional_id));
  set('verificationStatus', opt(r.verificacion_estado));
  if ((r.verificacion_items ?? []).length > 0 || r.verificacion_estado) set('verifiedItems', r.verificacion_items ?? []);
  set('verificationDate', ymd(r.verificacion_fecha));
  set('verifier', opt(r.verificador));
  set('verificationObservation', opt(r.verificacion_obs));
  set('createdAt', iso(r.creado_en));
  set('createdBy', opt(r.creado_por));
  set('extensionEnabledAt', iso(r.extension_en));
  set('extensionEnabledBy', opt(r.extension_por));
  set('dropDate', ymd(r.caida_fecha));
  set('dropRequestId', opt(r.caida_solicitud));
  set('reactivatedAt', iso(r.reactivada_en));
  set('reactivationRequestId', opt(r.reactivacion_solicitud));
  set('renewsId', opt(r.renueva_id));
  if (r.documentos && Object.keys(r.documentos).length > 0) set('documents', r.documentos);
  return out;
}

// ------------------------------------------------------------------------------------------------------------------ Planes y cuotas

export function installmentToRow(i: Installment, index: number): CuotaRow {
  return {
    id: i.id, orden: index + 1, nombre: i.name, monto: i.amount, saldo: i.balance, vence: nul(i.dueDateISO), estado: i.status, cobros: i.payments ?? [],
    variable: !!i.variable, es_mora: !!i.isMora, mora_de: nul(i.moraOf), mora_cobrada: i.moraCharged ?? null, refinanciada_de: nul(i.refinancedFrom),
    refinanciada_a: nul(i.refinancedTo), reactivada_desde: nul(i.reactivatedFrom), anulada_por_caida: !!i.dropAnnulled, condonada: !!i.forgiven, nota: nul(i.note),
    creada_en: nul(i.createdAt),
  };
}

export function installmentFromRow(r: CuotaRow): Installment {
  const out: Installment = {
    id: r.id, name: r.nombre, amount: r.monto, balance: r.saldo, dueDateISO: ymd(r.vence) ?? '', status: r.estado, payments: (r.cobros ?? []).map(c => ({ ...c })),
  };
  if (r.variable) out.variable = true;
  if (r.es_mora) out.isMora = true;
  if (r.mora_de) out.moraOf = r.mora_de;
  if (r.mora_cobrada !== null && r.mora_cobrada !== undefined) out.moraCharged = r.mora_cobrada;
  if (r.refinanciada_de) out.refinancedFrom = r.refinanciada_de;
  if (r.refinanciada_a) out.refinancedTo = r.refinanciada_a;
  if (r.reactivada_desde) out.reactivatedFrom = ymd(r.reactivada_desde);
  if (r.anulada_por_caida) out.dropAnnulled = true;
  if (r.condonada) out.forgiven = true;
  if (r.nota) out.note = r.nota;
  if (r.creada_en) out.createdAt = iso(r.creada_en);
  return out;
}

export const planToRow = (p: Plan): PlanRow => ({
  id: p.id, matricula_id: p.mat, tipo: p.type ?? '', total: p.total, saldo: p.balance, estado: p.status, cuotas: p.installments.map(installmentToRow),
});

export const planFromRow = (r: PlanRow): Plan => ({
  id: r.id, mat: r.matricula_id, type: r.tipo, total: r.total, balance: r.saldo, status: r.estado,
  installments: [...(r.cuotas ?? [])].sort((a, b) => a.orden - b.orden).map(installmentFromRow),
});

// ------------------------------------------------------------------------------------------------------------------ Pagos, caja, notas y grupos

/** La sede donde se cobró un pago: la que trae, o la de su primera matrícula. */
export const paymentBranchOf = (p: Payment, enrollments: Pick<Enrollment, 'id' | 'branchId'>[]): string =>
  p.branchId ?? enrollments.find(e => e.id === p.enrollmentIds?.[0])?.branchId ?? '';

export function paymentToRow(p: Payment, branchId: string, audit = false): PagoRow {
  const row: PagoRow = {
    id: p.id, fecha: p.date, alumno_nombre: p.student, concepto: p.concept, monto: p.amount, medio: p.method ?? '', comprobante: p.receipt ?? '', documento: p.document ?? null,
    estado: p.status, reversa: p.reversal ?? null, partes: p.parts ?? [], moneda: p.currency ?? null, grupo_promocional_id: nul(p.promotionGroupId),
    matricula_ids: p.enrollmentIds ?? [], sede_id: branchId, comentario: nul(p.comment),
  };
  if (audit) { row.creado_por = p.user ?? null; }
  return row;
}

export function paymentFromRow(r: PagoRow): Payment {
  const out: Payment = {
    id: r.id, date: ymd(r.fecha) ?? r.fecha, student: r.alumno_nombre, concept: r.concepto, amount: r.monto, method: r.medio, receipt: r.comprobante, status: r.estado,
    branchId: r.sede_id,
  };
  if (r.documento) out.document = r.documento;
  if (r.reversa) out.reversal = r.reversa;
  if ((r.partes ?? []).length > 0) out.parts = r.partes;
  if (r.moneda) out.currency = r.moneda;
  if (r.grupo_promocional_id) out.promotionGroupId = r.grupo_promocional_id;
  if ((r.matricula_ids ?? []).length > 0) out.enrollmentIds = r.matricula_ids;
  if (r.creado_por) out.user = r.creado_por;
  if (r.comentario) out.comment = r.comentario;
  return out;
}

export function movementToRow(m: CashMovement, audit = false): MovimientoRow {
  const row: MovimientoRow = {
    id: m.id, fecha: m.date, tipo: m.kind, concepto: m.concept, referencia: m.reference ?? '', moneda: m.currency, monto: m.amount, tipo_cambio: m.exchangeRate ?? null,
    monto_usd: m.amountUSD, medio: m.method ?? '', banco: nul(m.bank), operacion: nul(m.operationNumber), sede_id: nul(m.branchId), pago_id: nul(m.paymentId),
    matricula_ids: m.enrollmentIds ?? [], estado: m.status, reversa: m.reversal ?? null, lote_deposito: nul(m.depositedIn), deposito: m.deposit ?? null, venta: m.sale ?? null,
  };
  if (audit) { row.creado_en = m.date; row.creado_por = m.user ?? null; }
  return row;
}

export function movementFromRow(r: MovimientoRow): CashMovement {
  const out: CashMovement = {
    id: r.id, date: iso(r.fecha) ?? r.fecha, kind: r.tipo, concept: r.concepto, reference: r.referencia, currency: r.moneda, amount: r.monto, amountUSD: r.monto_usd,
    method: r.medio, user: r.creado_por ?? '', status: r.estado,
  };
  if (r.tipo_cambio !== null && r.tipo_cambio !== undefined) out.exchangeRate = r.tipo_cambio;
  if (r.banco) out.bank = r.banco;
  if (r.operacion) out.operationNumber = r.operacion;
  if (r.sede_id) out.branchId = r.sede_id;
  if (r.pago_id) out.paymentId = r.pago_id;
  if ((r.matricula_ids ?? []).length > 0) out.enrollmentIds = r.matricula_ids;
  if (r.reversa) out.reversal = r.reversa;
  if (r.lote_deposito) out.depositedIn = r.lote_deposito;
  if (r.deposito) out.deposit = r.deposito;
  if (r.venta) out.sale = r.venta;
  return out;
}

export const noteToRow = (n: CreditNote): NotaRow => ({
  id: n.id, serie: n.series, correlativo: n.sequence, etiqueta: n.label, origen: n.origin, pago_id: n.paymentId, alumno_nombre: n.studentName ?? '', matricula_ids: n.enrollmentIds ?? [],
  tipo_original: n.originalType, documento_original: n.originalDocument ?? '', monto: n.amount, moneda: n.currency, motivo: n.reason, detalle: n.detail ?? '', emitida_en: n.issuedAt,
  emitida_por: n.issuedBy,
});

export const noteFromRow = (r: NotaRow): CreditNote => ({
  id: r.id, series: r.serie, sequence: r.correlativo, label: r.etiqueta, origin: r.origen, paymentId: r.pago_id, studentName: r.alumno_nombre, enrollmentIds: r.matricula_ids ?? [],
  originalType: r.tipo_original, originalDocument: r.documento_original, amount: r.monto, currency: r.moneda, reason: r.motivo, detail: r.detalle, issuedAt: iso(r.emitida_en) ?? r.emitida_en,
  issuedBy: r.emitida_por,
});

export const groupToRow = (g: PromotionGroup): GrupoRow => ({
  id: g.id, promocion_id: g.promotionId, moneda: g.currency, precio_total: g.totalPrice, reparto: g.allocations ?? [], pago_id: nul(g.paymentId),
});

export const groupFromRow = (r: GrupoRow): PromotionGroup => {
  const out: PromotionGroup = { id: r.id, promotionId: r.promocion_id, currency: r.moneda, totalPrice: r.precio_total, allocations: r.reparto ?? [] };
  if (r.pago_id) out.paymentId = r.pago_id;
  return out;
};

// ------------------------------------------------------------------------------------------------------------------ Del estado a las filas y al revés

/** Las filas que se leen de la base, vueltas el estado que usan las pantallas (con los nombres derivados). */
export function moneyStateFromRows(rows: MoneyRows, lists: EnrollmentLists): MoneyState {
  const planOf = new Map(rows.planes.map(p => [p.matricula_id, p.id]));
  const studentOf = new Map(rows.matriculas.map(m => [m.id, m.alumno_id]));
  return {
    enrollments: rows.matriculas.map(m => enrollmentFromRow(m, planOf.get(m.id), lists)),
    plans: rows.planes.map(planFromRow),
    payments: rows.pagos.map(paymentFromRow),
    cashMovements: rows.movimientos.map(movementFromRow),
    creditNotes: rows.notas.map(noteFromRow),
    promotionGroups: rows.grupos.map(groupFromRow),
    ...requestsFromRows(rows.solicitudes, id => studentOf.get(id)),
    enrollmentChanges: rows.correcciones.map(correctionFromRow),
  };
}

/** El estado, vuelto las filas que se guardan. */
export function moneyRowsFromState(s: MoneyState, audit = false): MoneyRows {
  return {
    matriculas: s.enrollments.map(e => enrollmentToRow(e, audit)),
    planes: s.plans.map(planToRow),
    pagos: s.payments.map(p => paymentToRow(p, paymentBranchOf(p, s.enrollments), audit)),
    movimientos: s.cashMovements.map(m => movementToRow(m, audit)),
    notas: s.creditNotes.map(noteToRow),
    grupos: s.promotionGroups.map(groupToRow),
    solicitudes: requestRowsFromState(s.dropRequests, s.changeRequests, audit),
    correcciones: s.enrollmentChanges.map(c => correctionToRow(c, audit)),
  };
}

// ------------------------------------------------------------------------------------------------------------------ Comparador

/** Movimientos de stock que una acción pide junto con sus cambios (los aplica la misma llamada de la base, en la misma transacción). */
export type StockOp =
  | { op: 'vender'; sede: string; articulo: string; cantidad: number; documento: string; observacion: string }
  | { op: 'reponer'; sede: string; articulo: string; cantidad: number; movimiento: string }
  | { op: 'entregar'; sede: string; matricula: string; alumno: string; lineas: { articulo_id: string; cantidad: number }[] };

/** Lo que se manda a `aplicar_cambios_matricula`: por tabla, las filas nuevas (completas y marcadas con `_nueva`) y las cambiadas (su clave y solo las columnas que cambiaron). */
export interface MoneyPayload {
  grupos: Record<string, unknown>[]; matriculas: Record<string, unknown>[]; planes: Record<string, unknown>[]; pagos: Record<string, unknown>[];
  movimientos: Record<string, unknown>[]; notas: Record<string, unknown>[]; solicitudes: Record<string, unknown>[]; correcciones: Record<string, unknown>[]; stock?: StockOp[];
  /** Lo que la operación cambia en la agenda de Psicopedagogía (la primera asesoría al matricular, las cancelaciones al caer o trasladarse): se guarda en la MISMA operación. */
  agenda?: Record<string, unknown>;
}

/** Los códigos de las filas tocadas (para volver a leerlas después de guardar). */
export interface MoneyTouched {
  matriculas: string[]; planes: string[]; pagos: string[]; movimientos: string[]; notas: string[]; grupos: string[]; solicitudes: string[]; correcciones: string[];
}

export const MONEY_ACTIONS = [
  'matricular', 'cobrar', 'refinanciar', 'mora', 'reversar_pago', 'reversar_movimiento', 'deposito', 'ingreso_caja', 'egreso_caja', 'venta', 'caida', 'reactivacion',
  'cambio_programa', 'traslado', 'corregir', 'extension', 'documentos', 'verificacion',
  'solicitar_caida', 'solicitar_reactivacion', 'solicitar_cambio_programa', 'solicitar_traslado',
  'rechazar_caida', 'rechazar_reactivacion', 'rechazar_cambio_programa', 'rechazar_traslado',
] as const;
export type MoneyAction = (typeof MONEY_ACTIONS)[number];

const canon = (v: unknown): string => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1))) : x));

/**
 * Compara dos listas de filas por su `id`: las que no estaban se mandan completas; las que cambiaron, con su `id` y solo las columnas que cambiaron.
 * Si una fila estaba y ya no está, es un error de programación (ninguna acción quita registros): se devuelve en `missing`.
 */
function diffRows<R extends { id: string }>(before: R[], after: R[]): { changes: Record<string, unknown>[]; missing: string[] } {
  const prev = new Map(before.map(r => [r.id, r]));
  const changes: Record<string, unknown>[] = [];
  for (const row of after) {
    const old = prev.get(row.id);
    if (!old) { changes.push({ ...(row as unknown as Record<string, unknown>), _nueva: true }); continue; }
    if (old === row) continue;
    const a = old as unknown as Record<string, unknown>;
    const b = row as unknown as Record<string, unknown>;
    const changed = Object.keys(b).filter(k => canon(a[k]) !== canon(b[k]));
    if (changed.length > 0) changes.push({ id: row.id, ...Object.fromEntries(changed.map(k => [k, b[k]])) });
  }
  const now = new Set(after.map(r => r.id));
  return { changes, missing: before.filter(r => !now.has(r.id)).map(r => r.id) };
}

export interface MoneyDiff { payload: MoneyPayload; touched: MoneyTouched; empty: boolean; error?: string }

/** Compara el estado de antes con el de después y arma lo que se manda a la base. */
export function diffMoney(before: MoneyState, after: MoneyState, stock: StockOp[] = []): MoneyDiff {
  const b = moneyRowsFromState(before);
  const a = moneyRowsFromState(after);
  // Una fila de una lista que no cambió de referencia no se compara de nuevo (las listas grandes suelen quedar iguales)
  const same = <T>(x: T[], y: T[]) => x === y;
  const run = <R extends { id: string }>(x: R[], y: R[], bx: unknown[], ay: unknown[]) => (same(bx, ay) ? { changes: [], missing: [] as string[] } : diffRows(x, y));
  const g = run(b.grupos, a.grupos, before.promotionGroups, after.promotionGroups);
  const m = run(b.matriculas, a.matriculas, before.enrollments, after.enrollments);
  const p = run(b.planes, a.planes, before.plans, after.plans);
  const pa = run(b.pagos, a.pagos, before.payments, after.payments);
  const mo = run(b.movimientos, a.movimientos, before.cashMovements, after.cashMovements);
  const n = run(b.notas, a.notas, before.creditNotes, after.creditNotes);
  // Las solicitudes viven en dos listas del estado (caídas y cambios) y una sola tabla: si ninguna de las dos cambió, no se compara
  const so = before.dropRequests === after.dropRequests && before.changeRequests === after.changeRequests ? { changes: [], missing: [] as string[] } : diffRows(b.solicitudes, a.solicitudes);
  const co = run(b.correcciones, a.correcciones, before.enrollmentChanges, after.enrollmentChanges);
  const missing = [...g.missing, ...m.missing, ...p.missing, ...pa.missing, ...mo.missing, ...n.missing, ...so.missing, ...co.missing];
  const payload: MoneyPayload = {
    grupos: g.changes, matriculas: m.changes, planes: p.changes, pagos: pa.changes, movimientos: mo.changes, notas: n.changes, solicitudes: so.changes, correcciones: co.changes,
  };
  if (stock.length > 0) payload.stock = stock;
  const ids = (rows: Record<string, unknown>[]) => rows.map(r => String(r.id));
  const touched: MoneyTouched = {
    grupos: ids(g.changes), matriculas: ids(m.changes), planes: ids(p.changes), pagos: ids(pa.changes), movimientos: ids(mo.changes), notas: ids(n.changes),
    solicitudes: ids(so.changes), correcciones: ids(co.changes),
  };
  const empty = Object.values(touched).every(l => l.length === 0) && stock.length === 0;
  return { payload, touched, empty, ...(missing.length > 0 ? { error: `No se pueden quitar registros del dinero (${missing.slice(0, 3).join(', ')}).` } : {}) };
}

/** Mete en la lista lo recién leído: reemplaza la fila si ya estaba y agrega la que es nueva (en el orden de la lista). */
export function mergeRows<R extends { id: string }>(list: R[], fresh: R[]): R[] {
  if (fresh.length === 0) return list;
  const byId = new Map(fresh.map(r => [r.id, r]));
  const out = list.map(r => byId.get(r.id) ?? r);
  const have = new Set(list.map(r => r.id));
  return [...out, ...fresh.filter(r => !have.has(r.id))];
}

export const mergeMoneyRows = (current: MoneyRows, fresh: MoneyRows): MoneyRows => ({
  matriculas: mergeRows(current.matriculas, fresh.matriculas), planes: mergeRows(current.planes, fresh.planes), pagos: mergeRows(current.pagos, fresh.pagos),
  movimientos: mergeRows(current.movimientos, fresh.movimientos), notas: mergeRows(current.notas, fresh.notas), grupos: mergeRows(current.grupos, fresh.grupos),
  solicitudes: mergeRows(current.solicitudes, fresh.solicitudes), correcciones: mergeRows(current.correcciones, fresh.correcciones),
});

/** El orden en que se muestran: lo más reciente primero (pagos y caja) y por código (matrículas, planes, grupos). */
export function sortMoneyState(s: MoneyState): MoneyState {
  const byCode = <T extends { id: string }>(list: T[]) => [...list].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  const newestFirst = <T extends { id: string }>(list: T[]) => [...list].sort((x, y) => numberOfCode(y.id) - numberOfCode(x.id));
  return {
    enrollments: byCode(s.enrollments), plans: byCode(s.plans), payments: newestFirst(s.payments), cashMovements: newestFirst(s.cashMovements),
    creditNotes: newestFirst(s.creditNotes), promotionGroups: byCode(s.promotionGroups),
    dropRequests: newestFirst(s.dropRequests), changeRequests: newestFirst(s.changeRequests), enrollmentChanges: newestFirst(s.enrollmentChanges),
  };
}

// ------------------------------------------------------------------------------------------------------------------ Mensajes de error

type DbErrorLike = { code?: string; message?: string; details?: string };

/** Mensaje claro para un error de la base al guardar dinero. Los avisos propios (EN001) ya vienen en español. */
export function moneyErrorMessage(e: DbErrorLike | null | undefined): string {
  if (!e) return 'No se pudo guardar. Intente de nuevo.';
  if (e.code === 'EN001' && e.message) return e.message;
  const t = `${e.message ?? ''} ${e.details ?? ''}`.toLowerCase();
  if (e.code === '42501' || t.includes('row-level security') || t.includes('permission denied')) return 'Su cuenta no tiene permiso para hacer esto.';
  if (e.code === '23505') return 'Otra persona registró algo al mismo tiempo y el código ya está en uso. Vuelva a intentarlo.';
  if (e.code === '23503') return 'Algún dato que nombra este registro ya no existe (alumno, sede, programa, titular o pago). Actualice la pantalla.';
  if (e.code === '23514' || e.code === '23502') return 'Algún dato no cumple lo que exige la base de datos.';
  if (t.includes('failed to fetch') || t.includes('network')) return 'No se pudo conectar. Revise su conexión e intente de nuevo.';
  return 'No se pudo guardar. Intente de nuevo.';
}
