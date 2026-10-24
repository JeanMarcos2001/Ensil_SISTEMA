/**
 * Cambios de una matrícula ya creada (funciones puras): reactivación, cambio de programa/nivel, traslado de sede y renovación.
 *
 * Los tres primeros son SOLICITUDES: las pide quien atiende (con motivo), se ve qué pasaría y las resuelve quien tiene
 * autoridad (ver `utils/authority.ts`). La renovación no necesita aprobación: es una matrícula NUEVA del mismo alumno.
 *
 * REACTIVAR (matrícula «Caída» → «Activa»)
 *  - Solo dentro de `REACTIVATION_WINDOW_DAYS` días desde que dejó de asistir, mientras la vigencia del programa no haya
 *    terminado y el alumno no tenga otra matrícula activa del mismo programa. Pasado ese plazo corresponde RENOVAR.
 *  - Las cuotas que la caída anuló se restituyen con su saldo y su calendario se corre tantos días como duró la ausencia;
 *    la deuda condonada no se restituye; la deuda vencida que se conservó sigue igual. Lo ya cobrado no se toca.
 *  - Las asesorías y actividades canceladas por la caída NO vuelven solas: se vuelven a programar.
 *
 * CAMBIO DE PROGRAMA / NIVEL (matrícula activa, mismo tipo de pago)
 *  - Precio nuevo = tarifario vigente del programa/nivel destino para el MISMO tipo de pago y la sede. Lo ya cobrado se abona
 *    al precio nuevo (no se pierde); si lo cobrado supera el precio nuevo no se aplica (primero se devuelve la diferencia).
 *  - El saldo (precio nuevo − cobrado) se reparte en las cuotas aún sin cobrar; las cuotas con cobros quedan como están.
 *  - Los materiales ya entregados se conservan; la verificación vuelve a «Pendiente» para entregar los del nuevo programa.
 *  - No aplica a matrículas de grupo promocional ni a cronogramas de monto variable.
 *
 * TRASLADO DE SEDE (matrícula activa)
 *  - El programa debe estar habilitado en la sede destino y el horario del alumno existir allí (si no, se elige otro).
 *  - El precio y el plan NO cambian; los pagos y la caja quedan en la sede donde se cobraron. Las asesorías y actividades
 *    futuras de la sede anterior se cancelan para reprogramarlas en la nueva.
 *
 * RENOVAR (matrícula nueva)
 *  - Cuando la base terminó (o la matrícula cayó hace más del plazo de reactivación) se abre el asistente de matrícula con
 *    los datos del alumno y titulares, el nivel siguiente sugerido y el mismo tipo de pago; la nueva matrícula guarda de
 *    cuál viene (`renewsId`).
 */
import type {
  Branch, ChangeRequest, ClassSchedule, Enrollment, Level, MonthlySchedule, Payment, Plan, PromotionGroup, Program, Schedule, Student, Tariff, PaymentType, Guardian,
} from '../context/DataContext';
import { enrollmentPaidUSD, installmentDueISO, MIN_DETAIL } from './enrollmentDrop';
import { emptyDraft, emptyStudent, getAvailablePrograms, getAvailableSchedules, getProgramLevels, type DraftPerson, type EnrollmentDraft } from './enrollment';
import { isClosed, isOpen, recomputePlan } from './planState';
import { addDaysISO } from './schedule';
import { findTariff, formatDisplayDate, roundMoney, tariffTotal } from './tariffs';
import { daysBetween, enrollmentValidity, programOf } from './validity';

export const REACTIVATION_WINDOW_DAYS = 90;
export const MAX_START_AHEAD_DAYS = 30;

export const REACTIVATION_REASONS = ['El alumno retomó el pago', 'Se resolvió el motivo de la caída', 'La caída fue un error', 'Otro'];
export const PROGRAM_CHANGE_REASONS = ['Nivel mal asignado', 'Cambio de objetivos del alumno', 'Recomendación de Psicopedagogía', 'Otro'];
export const TRANSFER_REASONS = ['Cambio de domicilio', 'Cambio de trabajo o de estudios', 'Horario no disponible en su sede', 'Otro'];

export interface ChangeContext {
  enrollments: Enrollment[];
  plans: Plan[];
  students: Student[];
  schedules: Schedule[];
  monthly: MonthlySchedule[];
  programs: Program[];
  levels: Level[];
  tariffs: Tariff[];
  paymentTypes: PaymentType[];
  branches: Branch[];
  classSchedules: ClassSchedule[];
  payments: Payment[];
  groups: PromotionGroup[];
  requests: ChangeRequest[];
  today: string;
}

const sameStudent = (a: Enrollment, b: Enrollment) => (a.studentId && b.studentId ? a.studentId === b.studentId : a.student === b.student);
const studentOf = (e: Enrollment, c: Pick<ChangeContext, 'students'>) => c.students.find(s => s.id === e.studentId) ?? c.students.find(s => s.name === e.student);
const labelOf = (program: string, level?: string) => (level && level !== 'Sin nivel' ? `${program} - ${level}` : program);
const paidOn = (i: { payments?: { amount: number }[] }) => roundMoney((i.payments ?? []).reduce((a, p) => a + p.amount, 0));
const checkReason = (reason: string, detail: string, allowed: string[]): string[] => {
  const e: string[] = [];
  if (!allowed.includes(reason)) e.push('Seleccione el motivo.');
  if (detail.trim().length < MIN_DETAIL) e.push('Describa el motivo: queda como constancia.');
  return e;
};

/** Tipo de pago de la matrícula; en registros antiguos se reconoce por el nombre del plan. */
export function paymentTypeIdOf(e: Enrollment, plan: Plan | undefined, paymentTypes: PaymentType[]): string {
  if (e.paymentTypeId) return e.paymentTypeId;
  const norm = (t: string) => t.toLowerCase().replace(/\bcuotas?\b/g, '').replace(/\s+/g, ' ').trim();
  const name = norm(e.paymentTypeName ?? plan?.type ?? '');
  return name ? paymentTypes.find(pt => norm(pt.name) === name)?.id ?? '' : '';
}

/** Solicitud de cambio pendiente de una matrícula, si la hay. */
export const pendingChangeOf = (enrollmentId: string, requests: ChangeRequest[]) => requests.find(r => r.enrollmentId === enrollmentId && r.status === 'Pendiente');

// ================================================================ Reactivación

export interface ReactivationInput {
  startDate: string;
  reason: string;
  detail: string;
}

/** Por qué NO se puede reactivar esta matrícula (vacío = se puede). */
export function reactivationProblems(e: Enrollment, c: ChangeContext): string[] {
  const out: string[] = [];
  if (e.status !== 'Caída') return [`La matrícula ${e.id} no está caída (${e.status}).`];
  if (pendingChangeOf(e.id, c.requests)) out.push('Ya hay una solicitud pendiente para esta matrícula.');
  const droppedOn = e.dropDate ?? '';
  if (droppedOn && daysBetween(droppedOn, c.today) > REACTIVATION_WINDOW_DAYS) {
    out.push(`Pasaron más de ${REACTIVATION_WINDOW_DAYS} días desde que dejó de asistir (${droppedOn}): corresponde una renovación, es decir, una matrícula nueva.`);
  }
  const program = programOf(e, c.programs);
  if (!program || program.status !== 'Activo' || !getAvailablePrograms(c.programs, e.branchId ?? '').some(p => p.id === program.id)) {
    out.push('El programa ya no está disponible en la sede de la matrícula: corresponde una matrícula nueva.');
  }
  const validity = enrollmentValidity(e, program, c.schedules, c.today);
  if (validity.state === 'finalizada' || (validity.state === 'base-finalizada' && !validity.extensionEnabled)) {
    out.push('La vigencia del programa ya terminó: corresponde una renovación.');
  }
  const other = c.enrollments.find(o => o.id !== e.id && o.status === 'Activa' && sameStudent(e, o) && (o.programId ?? o.program) === (e.programId ?? e.program));
  if (other) out.push(`El alumno ya tiene otra matrícula activa de este programa (${other.id}).`);
  if (!c.plans.some(p => p.mat === e.id)) out.push('La matrícula no tiene plan de pagos.');
  return out;
}

export function validateReactivationRequest(e: Enrollment, input: ReactivationInput, c: ChangeContext): string[] {
  const errors = [...reactivationProblems(e, c), ...checkReason(input.reason, input.detail, REACTIVATION_REASONS)];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate)) errors.push('Indique desde cuándo se reactiva.');
  else {
    if (input.startDate < c.today) errors.push('La fecha de reactivación no puede ser anterior a hoy.');
    if (input.startDate > addDaysISO(c.today, MAX_START_AHEAD_DAYS)) errors.push(`La reactivación puede programarse hasta ${MAX_START_AHEAD_DAYS} días hacia adelante.`);
  }
  return errors;
}

export interface ReactivationPreview {
  /** Días que se corre el calendario de las cuotas restituidas (lo que duró la ausencia). */
  shiftDays: number;
  restored: { id: string; name: string; balance: number; oldDue: string; newDue: string }[];
  restoredUSD: number;
  /** Deuda vencida que se conservó al caer y sigue pendiente. */
  keptDebt: { id: string; name: string; balance: number }[];
  keptDebtUSD: number;
  forgivenCount: number;
  paidUSD: number;
  studentReactivates: boolean;
  notes: string[];
}

export function previewReactivation(e: Enrollment, c: ChangeContext, startDate: string): ReactivationPreview {
  const plan = c.plans.find(p => p.mat === e.id);
  const shiftDays = Math.max(0, e.dropDate ? daysBetween(e.dropDate, startDate) : 0);
  const restored: ReactivationPreview['restored'] = [];
  const keptDebt: ReactivationPreview['keptDebt'] = [];
  let forgivenCount = 0;
  for (const i of plan?.installments ?? []) {
    if (i.forgiven) { forgivenCount++; continue; }
    const wasDropped = i.dropAnnulled || (i.status === 'Anulada' && /ca[ií]da/i.test(i.note ?? ''));
    if (wasDropped) {
      const balance = roundMoney(i.amount - paidOn(i));
      if (balance <= 0) continue;
      const oldDue = installmentDueISO(i);
      restored.push({ id: i.id, name: i.name, balance, oldDue, newDue: oldDue ? addDaysISO(oldDue, shiftDays) : startDate });
    } else if (isOpen(i)) keptDebt.push({ id: i.id, name: i.name, balance: roundMoney(i.balance) });
  }
  const student = studentOf(e, c);
  const otherActive = c.enrollments.some(o => o.id !== e.id && o.status === 'Activa' && sameStudent(e, o));
  const notes = [
    'Las asesorías y actividades que se cancelaron por la caída no vuelven solas: hay que programarlas de nuevo (Psicopedagogía → Programación).',
    'La vigencia del programa sigue contando desde la primera asesoría original.',
  ];
  if (forgivenCount > 0) notes.push(`${forgivenCount} cuota(s) condonada(s) al caer no se restituyen.`);
  return {
    shiftDays,
    restored,
    restoredUSD: roundMoney(restored.reduce((a, r) => a + r.balance, 0)),
    keptDebt,
    keptDebtUSD: roundMoney(keptDebt.reduce((a, r) => a + r.balance, 0)),
    forgivenCount,
    paidUSD: enrollmentPaidUSD(e.id, c.payments, c.groups, plan),
    studentReactivates: !!student && student.status !== 'Activo' && !otherActive,
    notes,
  };
}

/** Plan después de reactivar: cuotas restituidas con su nuevo calendario. */
export function applyReactivationToPlan(plan: Plan, preview: ReactivationPreview, today: string): Plan {
  const byId = new Map(preview.restored.map(r => [r.id, r]));
  const installments = plan.installments.map(i => {
    const r = byId.get(i.id);
    if (!r) return i;
    const { dropAnnulled: _d, note: _n, ...rest } = i;
    return { ...rest, status: 'Pendiente', balance: r.balance, dueDate: formatDisplayDate(r.newDue || today), dueDateISO: r.newDue || today, reactivatedFrom: r.oldDue };
  });
  return recomputePlan({ ...plan, installments, status: 'Al día' }, today);
}

// ================================================================ Cambio de programa / nivel

export interface ProgramChangeInput {
  programId: string;
  levelId: string;
  reason: string;
  detail: string;
}

export function programChangeProblems(e: Enrollment, input: Pick<ProgramChangeInput, 'programId' | 'levelId'>, c: ChangeContext): string[] {
  const out: string[] = [];
  if (e.status !== 'Activa') return [`La matrícula ${e.id} no está activa (${e.status}).`];
  if (pendingChangeOf(e.id, c.requests)) out.push('Ya hay una solicitud pendiente para esta matrícula.');
  if (e.promotionGroupId) out.push('La matrícula pertenece a un grupo promocional: el cambio de programa rompería la promoción.');
  const plan = c.plans.find(p => p.mat === e.id);
  if (!plan) { out.push('La matrícula no tiene plan de pagos.'); return out; }
  if (plan.installments.some(i => i.variable)) out.push('Los cronogramas de monto variable (contado en 2 partes) no admiten cambio de programa.');
  const program = c.programs.find(p => p.id === input.programId);
  if (!program) { out.push('Seleccione el programa.'); return out; }
  if (!getAvailablePrograms(c.programs, e.branchId ?? '').some(p => p.id === program.id)) out.push('El programa no está habilitado en la sede de la matrícula.');
  const levels = getProgramLevels(c.levels, program);
  if (program.hasLevels && !levels.some(l => l.id === input.levelId)) out.push('Seleccione el nivel.');
  if (!program.hasLevels && input.levelId) out.push('Este programa no usa niveles.');
  if ((input.programId === (e.programId ?? '')) && (input.levelId || '') === (e.levelId ?? '')) out.push('Elija un programa o nivel distinto al actual.');
  const dup = c.enrollments.find(o => o.id !== e.id && o.status === 'Activa' && sameStudent(e, o) && o.programId === input.programId && (o.levelId ?? '') === (input.levelId || ''));
  if (dup) out.push(`El alumno ya tiene una matrícula activa en ese programa y nivel (${dup.id}).`);
  const paymentTypeId = paymentTypeIdOf(e, plan, c.paymentTypes);
  if (!paymentTypeId) out.push('La matrícula no registra su tipo de pago: no se puede calcular el precio nuevo.');
  else if (!findTariff(c.tariffs, { programId: input.programId, levelId: input.levelId || undefined, branchId: e.branchId, date: c.today }, paymentTypeId)) {
    out.push(`No hay un tarifario vigente para ese programa y nivel con el tipo de pago «${e.paymentTypeName ?? 'de la matrícula'}».`);
  }
  return out;
}

export function validateProgramChangeRequest(e: Enrollment, input: ProgramChangeInput, c: ChangeContext): string[] {
  const out = [...programChangeProblems(e, input, c), ...checkReason(input.reason, input.detail, PROGRAM_CHANGE_REASONS)];
  if (out.length > 0) return out;
  const preview = previewProgramChange(e, input, c);
  if (preview && preview.remaining < 0) out.push(`Ya se cobró USD ${preview.paidUSD.toFixed(2)}, más que el precio del programa nuevo (USD ${preview.newTotal.toFixed(2)}): primero devuelva la diferencia (reverse el pago con devolución) o elija otro programa.`);
  return out;
}

export interface ProgramChangePreview {
  fromLabel: string;
  toLabel: string;
  tariff: Tariff;
  program: Program;
  level?: Level;
  oldTotal: number;
  newTotal: number;
  paidUSD: number;
  /** Lo que queda por cobrar con el precio nuevo (negativo = se cobró de más). */
  remaining: number;
  /** Cuotas del plan después del cambio. */
  installments: Plan['installments'];
  /** Cuotas con cobros parciales que se cierran por lo cobrado. */
  frozenPartials: string[];
  verificationReset: boolean;
  notes: string[];
}

export function previewProgramChange(e: Enrollment, input: Pick<ProgramChangeInput, 'programId' | 'levelId'>, c: ChangeContext): ProgramChangePreview | undefined {
  const plan = c.plans.find(p => p.mat === e.id);
  const program = c.programs.find(p => p.id === input.programId);
  const paymentTypeId = plan ? paymentTypeIdOf(e, plan, c.paymentTypes) : '';
  if (!plan || !program || !paymentTypeId) return undefined;
  const tariff = findTariff(c.tariffs, { programId: input.programId, levelId: input.levelId || undefined, branchId: e.branchId, date: c.today }, paymentTypeId);
  if (!tariff) return undefined;
  const level = c.levels.find(l => l.id === input.levelId);
  const newTotal = tariffTotal(tariff);
  const paidUSD = enrollmentPaidUSD(e.id, c.payments, c.groups, plan);
  const remaining = roundMoney(newTotal - paidUSD);
  const frozenPartials: string[] = [];

  // Cuotas con cobros se conservan; las abiertas sin cobros reparten el saldo
  const kept = plan.installments.map(i => {
    if (isClosed(i) || i.isMora) return i;
    const paid = paidOn(i);
    if (paid > 0 && i.balance > 0) { frozenPartials.push(i.name); return { ...i, amount: paid, balance: 0, status: 'Pagada', note: 'Cobro parcial: el saldo pasó al nuevo programa' }; }
    return i;
  });
  const free = kept.filter(i => isOpen(i) && !i.isMora && paidOn(i) === 0);
  let installments = kept;
  if (remaining <= 0) {
    installments = kept.map(i => (free.includes(i) ? { ...i, status: 'Anulada', balance: 0, note: 'Anulada por el cambio de programa (ya está cobrado el precio nuevo)' } : i));
  } else if (free.length > 0) {
    const base = Math.floor((remaining / free.length) * 100) / 100;
    let left = remaining;
    installments = kept.map(i => {
      const idx = free.indexOf(i);
      if (idx < 0) return i;
      const amount = idx === free.length - 1 ? roundMoney(left) : base;
      left = roundMoney(left - amount);
      return { ...i, amount, balance: amount };
    });
  } else {
    const due = addDaysISO(c.today, 7);
    installments = [...kept, { id: `S${kept.length + 1}`, name: 'Saldo por cambio de programa', amount: remaining, balance: remaining, dueDate: formatDisplayDate(due), dueDateISO: due, status: 'Pendiente', payments: [] }];
  }
  const verified = !!e.verificationStatus && e.verificationStatus !== 'Pendiente';
  const notes = [
    'Los materiales ya entregados se conservan; la verificación vuelve a «Pendiente» para entregar los del programa nuevo.',
    'Las asesorías futuras del alumno pasan a mostrar el programa nuevo.',
  ];
  if (frozenPartials.length > 0) notes.push(`Las cuotas con cobro parcial (${frozenPartials.join(', ')}) se cierran por lo cobrado y su saldo pasa al plan nuevo.`);
  return {
    fromLabel: labelOf(e.program, e.level), toLabel: labelOf(program.name, level?.name), tariff, program, level,
    oldTotal: plan.total, newTotal, paidUSD, remaining, installments, frozenPartials, verificationReset: verified, notes,
  };
}

/** Plan después del cambio de programa. */
export function applyProgramChangeToPlan(plan: Plan, preview: ProgramChangePreview, today: string): Plan {
  return recomputePlan({ ...plan, total: preview.newTotal, installments: preview.installments }, today);
}

// ================================================================ Traslado de sede

export interface TransferInput {
  branchId: string;
  /** Horario de clases en la sede destino (si el actual no existe allí). */
  schedule: string;
  reason: string;
  detail: string;
}

export function transferProblems(e: Enrollment, input: Pick<TransferInput, 'branchId' | 'schedule'>, c: ChangeContext): string[] {
  const out: string[] = [];
  if (e.status !== 'Activa') return [`La matrícula ${e.id} no está activa (${e.status}).`];
  if (pendingChangeOf(e.id, c.requests)) out.push('Ya hay una solicitud pendiente para esta matrícula.');
  const target = c.branches.find(b => b.id === input.branchId && b.status === 'Activo');
  if (!target) { out.push('Seleccione la sede destino.'); return out; }
  if (target.id === e.branchId) out.push('La sede destino es la misma de la matrícula.');
  if (!getAvailablePrograms(c.programs, target.id).some(p => p.id === e.programId)) out.push(`El programa ${e.program} no está habilitado en ${target.name}.`);
  const student = studentOf(e, c);
  const options = getAvailableSchedules(c.classSchedules, target.id).map(h => h.name);
  const current = student?.horario;
  if (!current || !options.includes(current)) {
    if (!input.schedule) out.push(`El horario del alumno${current ? ` (${current})` : ''} no existe en ${target.name}: elija uno de esa sede.`);
    else if (!options.includes(input.schedule)) out.push(`El horario elegido no está disponible en ${target.name}.`);
  }
  return out;
}

export function validateTransferRequest(e: Enrollment, input: TransferInput, c: ChangeContext): string[] {
  return [...transferProblems(e, input, c), ...checkReason(input.reason, input.detail, TRANSFER_REASONS)];
}

export interface TransferPreview {
  fromName: string;
  toName: string;
  /** Horario del alumno después del traslado. */
  schedule: string;
  scheduleChanged: boolean;
  /** Asesorías futuras de la sede anterior que se cancelan. */
  scheduleIds: string[];
  /** Inscripciones en actividades de la sede anterior que se quitan. */
  activityRemovals: { monthlyId: string; activityId: string; studentId: string }[];
  firstSessionLost: boolean;
  verificationPending: boolean;
  notes: string[];
}

export function previewTransfer(e: Enrollment, input: Pick<TransferInput, 'branchId' | 'schedule'>, c: ChangeContext): TransferPreview | undefined {
  const target = c.branches.find(b => b.id === input.branchId);
  if (!target) return undefined;
  const student = studentOf(e, c);
  const options = getAvailableSchedules(c.classSchedules, target.id).map(h => h.name);
  const keep = !!student?.horario && options.includes(student.horario);
  const schedule = keep ? student!.horario! : input.schedule;
  const otherHere = c.enrollments.some(o => o.id !== e.id && o.status === 'Activa' && sameStudent(e, o) && o.branchId === e.branchId);
  const mine = (s: Schedule) => (student?.id && s.studentId ? s.studentId === student.id : s.student === e.student);
  const scheduleIds = c.schedules
    .filter(s => ['Reservado', 'Reprogramado'].includes(s.status) && s.date >= c.today && (!s.branchId || s.branchId === e.branchId))
    .filter(s => (otherHere ? s.isFirst && s.enrollmentId === e.id : mine(s)))
    .map(s => s.id);
  const activityRemovals: TransferPreview['activityRemovals'] = [];
  if (!otherHere && student) {
    for (const m of c.monthly) {
      if (m.branchId !== e.branchId) continue;
      for (const a of m.actividades) if (a.fecha >= c.today && a.inscritos.includes(student.id)) activityRemovals.push({ monthlyId: m.id, activityId: a.id, studentId: student.id });
    }
  }
  const firstSessionLost = c.schedules.some(s => scheduleIds.includes(s.id) && s.isFirst && s.enrollmentId === e.id);
  const verificationPending = !e.verificationStatus || e.verificationStatus === 'Pendiente';
  const notes = [
    'El precio y el plan de pagos no cambian; los pagos y la caja quedan registrados en la sede donde se cobraron.',
    'Las asesorías y actividades que se cancelan hay que programarlas de nuevo en la sede destino (Psicopedagogía → Programación).',
  ];
  if (firstSessionLost) notes.push('Se cancela su primera asesoría: la vigencia no empieza a contar hasta programar la nueva.');
  if (verificationPending) notes.push('Los materiales aún no se entregaron: se entregarán con el stock de la sede destino.');
  return {
    fromName: e.sede ?? c.branches.find(b => b.id === e.branchId)?.name ?? '', toName: target.name, schedule, scheduleChanged: !!student && schedule !== student.horario,
    scheduleIds, activityRemovals, firstSessionLost, verificationPending, notes,
  };
}

// ================================================================ Renovación

export interface RenewalCheck {
  ok: boolean;
  reasons: string[];
  /** Programa y nivel sugeridos para la nueva matrícula. */
  suggestedProgramId: string;
  suggestedLevelId: string;
  suggestionNote: string;
}

/** Nivel siguiente del programa (o el mismo si ya es el último). */
export function nextLevel(levels: Level[], program: Program | undefined, currentLevelId: string | undefined): { levelId: string; note: string } {
  const list = getProgramLevels(levels, program);
  if (list.length === 0) return { levelId: '', note: 'El programa no usa niveles.' };
  const i = list.findIndex(l => l.id === currentLevelId);
  if (i >= 0 && i < list.length - 1) return { levelId: list[i + 1].id, note: `Nivel siguiente: ${list[i + 1].name}.` };
  if (i >= 0) return { levelId: list[i].id, note: `Ya cursó el último nivel (${list[i].name}): se sugiere repetirlo o elegir otro programa.` };
  return { levelId: list[0].id, note: `Se sugiere empezar en ${list[0].name}.` };
}

export function renewalCheck(e: Enrollment, c: Pick<ChangeContext, 'enrollments' | 'programs' | 'levels' | 'schedules' | 'today'>): RenewalCheck {
  const reasons: string[] = [];
  const program = programOf(e, c.programs);
  const validity = enrollmentValidity(e, program, c.schedules, c.today);
  if (e.status === 'Activa') {
    if (!['por-vencer', 'base-finalizada', 'extension', 'finalizada'].includes(validity.state)) reasons.push('La matrícula sigue vigente: se puede renovar cuando esté por vencer o haya terminado.');
  } else if (e.status === 'Caída') {
    if (!e.dropDate || daysBetween(e.dropDate, c.today) <= REACTIVATION_WINDOW_DAYS) reasons.push(`Una matrícula caída se reactiva durante los primeros ${REACTIVATION_WINDOW_DAYS} días; después se renueva.`);
  } else reasons.push(`La matrícula está ${e.status.toLowerCase()}.`);
  const already = c.enrollments.find(o => o.renewsId === e.id && o.status !== 'Caída');
  if (already) reasons.push(`Ya fue renovada con la matrícula ${already.id}.`);
  const next = nextLevel(c.levels, program, e.levelId);
  return { ok: reasons.length === 0, reasons, suggestedProgramId: program?.id ?? e.programId ?? '', suggestedLevelId: next.levelId, suggestionNote: next.note };
}

const personFromStudent = (s: Student): DraftPerson => ({
  existingId: s.id, source: 'existente', docType: (s.docType as DraftPerson['docType']) ?? 'DNI', docNumber: s.doc, names: s.names ?? s.name, lastNameP: s.lastNameP ?? '',
  lastNameM: s.lastNameM ?? '', birthDate: s.birthDate ?? '', phone: s.phone ?? '', email: s.email ?? '', address: s.address ?? '', civilStatus: '',
});
const personFromGuardian = (g: Guardian): DraftPerson => ({
  existingId: g.id, source: 'existente', docType: (g.docType as DraftPerson['docType']) ?? 'DNI', docNumber: g.doc, names: g.names ?? g.name, lastNameP: g.lastNameP ?? '',
  lastNameM: g.lastNameM ?? '', birthDate: g.birthDate ?? '', phone: g.phone, email: g.email, address: g.direccion ?? '', civilStatus: g.civilStatus ?? '',
});

/** Borrador del asistente de matrícula para renovar: datos del alumno y titulares, nivel sugerido y mismo tipo de pago. */
export function buildRenewalDraft(
  e: Enrollment, check: RenewalCheck, students: Student[], guardians: Guardian[], today: string, paymentTypeId = e.paymentTypeId ?? ''
): EnrollmentDraft | undefined {
  const student = students.find(s => s.id === e.studentId) ?? students.find(s => s.name === e.student);
  if (!student) return undefined;
  const holderIds = e.guardianIds && e.guardianIds.length > 0 ? e.guardianIds : student.guardianIds ?? [];
  const holders = holderIds.map(id => guardians.find(g => g.id === id)).filter((g): g is Guardian => !!g).map(personFromGuardian);
  const draft = emptyDraft(today, e.branchId ?? '');
  const base = emptyStudent();
  const mode = holders.length > 0 ? 'apoderado' : 'independiente';
  const person = personFromStudent(student);
  return {
    ...draft,
    mode,
    context: { ...draft.context, observation: `Renovación de la matrícula ${e.id}` },
    holders: mode === 'apoderado' ? holders : [person],
    students: [{
      ...base,
      person: mode === 'apoderado' ? person : { ...person },
      relationship: mode === 'apoderado' ? student.relationship ?? '' : '',
      situation: student.occupationStatus ?? '',
      institutionType: student.institutionType ?? '',
      school: student.colegio ?? '',
      grade: student.grado ?? '',
      occupation: student.occupation ?? '',
      workplace: student.workplace ?? '',
      programId: check.suggestedProgramId,
      levelId: check.suggestedLevelId,
      paymentTypeId,
      schedule: student.horario ?? '',
    }],
    renewsId: e.id,
  };
}
