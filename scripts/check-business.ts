/**
 * Verificación de las reglas de negocio: autoridad, notas de crédito, cierres de caja, estado de planes, reactivación,
 * cambio de programa, traslado de sede, renovación, contrato y ficha, mora, recordatorios y cartera.
 * Ejecutar: npx tsx scripts/check-business.ts
 */
import type { Branch, CashClosure, CashMovement, ChangeRequest, ClassSchedule, ContractTemplate, Enrollment, Guardian, Level, Payment, PettyCashMovement, Plan, Program, Role, Schedule, Student, Tariff, PaymentType } from '../src/context/DataContext';
import { APPROVAL_POLICY, PERM, canRequest, canResolve, can } from '../src/utils/authority';
import { NOTE_SERIES, allowedNoteModes, buildCreditNote, documentOf, nextNoteNumber, noteLabel, parseNoteNumber, validateNoteChoice } from '../src/utils/creditNotes';
import { buildClosure, closedMessage, closedUntil, closureDrift, expectedAt, isDateClosed, validateClosure, validateReopen } from '../src/utils/cashClosure';
import { DEFAULT_FUND, refillNeeded, validateFund, validatePettyInput, emptyPettyInput } from '../src/utils/pettyCash';
import { daysOverdue, installmentState, planState, recomputePlan } from '../src/utils/planState';
import { applyDropToPlan, previewDrop, enrollmentPaidUSD } from '../src/utils/enrollmentDrop';
import {
  REACTIVATION_WINDOW_DAYS, applyProgramChangeToPlan, applyReactivationToPlan, buildRenewalDraft, nextLevel, previewProgramChange, previewReactivation, previewTransfer,
  programChangeProblems, reactivationProblems, renewalCheck, transferProblems, validateProgramChangeRequest, validateReactivationRequest, validateTransferRequest, type ChangeContext,
} from '../src/utils/enrollmentChange';
import {
  DEFAULT_CONTRACT_TEMPLATE, buildContractDocument, buildFichaDocument, docState, documentAlert, documentHtml, documentProblems, issueDocument, renderTemplateText, templateVars, unknownTokens,
  validateSignature, validateTemplate, type DocContext,
} from '../src/utils/enrollmentDocuments';
import { enrollmentValidity } from '../src/utils/validity';
import {
  DEFAULT_POLICY, agingSummary, bucketOf, buildReminders, chargeMoraOn, dueCalendar, groupBy, moraOf, parsePolicy, portfolioKpis, portfolioRows, stagesOf, topDebtors, validateMoraCharge, validatePolicy,
  validateReminderLog, whatsappUrl,
} from '../src/utils/collections';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : ` -> ${detail}`}`);
  if (!ok) failed++;
};
const TODAY = '2026-10-23';

// ================================================================ Autoridad
const roles: Role[] = [{ id: 'ROL-2', name: 'Administrador de sede', desc: '', users: 0, status: 'Activo' }];
const perms = [{ roleId: 'ROL-2', permissions: [PERM.dropRequest, PERM.reactivationRequest] }];
const su = { user: { role: 'Superusuario', name: 'Root' }, roles, permissions: perms };
const adm = { user: { role: 'Administrador de sede', name: 'Ana' }, roles, permissions: perms };
check('El Superusuario puede todo', can(su, PERM.reverseCash) && can(su, 'cualquier:cosa'));
check('Un rol solo puede lo que tiene marcado', can(adm, PERM.dropRequest) && !can(adm, PERM.dropApprove) && !can(adm, PERM.reversePayment));
check('Un rol inexistente no puede nada', !can({ ...adm, user: { role: 'Fantasma' } }, PERM.dropRequest));
check('Pedir y resolver usan permisos distintos', canRequest(adm, 'Caída').ok && !canRequest(adm, 'Traslado de sede').ok && !canResolve(adm, 'Caída', 'Otro').ok && canResolve(su, 'Traslado de sede', 'Root').ok);
check('Hoy se permite resolver la propia solicitud (un solo usuario)', APPROVAL_POLICY.allowSelfApproval === true);

// ================================================================ Notas de crédito
const pay = (over: Partial<Payment> = {}): Payment => ({ id: 'PAG-1', date: '2026-10-01', student: 'Mateo', concept: 'Cuota 1', amount: 200, method: 'Efectivo', receipt: 'B001-000123', status: 'Aprobado', currency: 'USD', enrollmentIds: ['MAT-1'], ...over });
check('Comprobante leído del texto o estructurado', documentOf(pay())?.type === 'Boleta' && documentOf(pay({ receipt: 'F001-9' }))?.type === 'Factura' && documentOf(pay({ receipt: 'S/N' })) === undefined);
check('Sin comprobante no corresponde nota; con comprobante hay 3 caminos', allowedNoteModes(pay({ receipt: 'S/N' })).join() === 'ninguna' && allowedNoteModes(pay()).join() === 'emitir,externa,no-entregado');
check('Número de nota: formato, tipo y correlativo', parseNoteNumber('bc01-000012', 'Boleta')?.sequence === 12 && parseNoteNumber('FC01-000003', 'Boleta') === null && parseNoteNumber('BC01-', 'Boleta') === null && noteLabel('BC01', 7) === 'BC01-000007');
check('El correlativo sigue al mayor de la serie', nextNoteNumber([{ series: 'BC01', sequence: 3 }, { series: 'BC01', sequence: 9 }, { series: 'FC01', sequence: 20 }], 'BC01') === 10 && nextNoteNumber([], 'FC01') === 1);
check('Validación de la elección de nota', validateNoteChoice(pay(), 'emitir', '', 'x', []).length === 0 && validateNoteChoice(pay(), 'ninguna', '', 'x', []).length === 1 && validateNoteChoice(pay({ receipt: 'S/N' }), 'emitir', '', '', []).length === 1
  && validateNoteChoice(pay(), 'externa', 'BC01-000002', '', [{ series: 'BC01', sequence: 2 }]).length === 1 && validateNoteChoice(pay(), 'externa', 'FC01-000002', '', []).length === 1 && validateNoteChoice(pay(), 'externa', 'BC01-000002', '', []).length === 0
  && validateNoteChoice(pay(), 'no-entregado', '', 'ok', []).length === 1);
check('La nota emitida lleva el siguiente número y el monto del pago', (() => {
  const n = buildCreditNote({ payment: pay({ amount: 250 }), mode: 'emitir', external: '', reason: 'Pago duplicado', detail: 'Duplicado', by: 'Admin', at: '2026-10-23T10:00:00Z' }, [{ series: 'BC01', sequence: 4 }]);
  return n.label === 'BC01-000005' && n.amount === 250 && n.originalDocument === 'B001-000123' && n.origin === 'sistema' && n.series === NOTE_SERIES.Boleta;
})());
check('La nota registrada conserva el número que trae', buildCreditNote({ payment: pay(), mode: 'externa', external: 'bc01-000042', reason: 'r', detail: 'd', by: 'A', at: 'x' }, []).label === 'BC01-000042');

// ================================================================ Cierre de caja
const cm = (id: string, date: string, over: Partial<CashMovement> = {}): CashMovement => ({ id, date, kind: 'Ingreso', concept: 'c', reference: 'r', currency: 'PEN', amount: 100, amountUSD: 27, method: 'Efectivo', user: 'u', status: 'Aplicado', ...over });
const cash = [cm('1', '2026-10-20T15:00:00.000Z'), cm('2', '2026-10-21T15:00:00.000Z', { kind: 'Egreso', amount: 30 }), cm('3', '2026-10-22T15:00:00.000Z', { amount: 50 }), cm('4', '2026-10-22T16:00:00.000Z', { currency: 'USD', amount: 99 }), cm('5', '2026-10-22T16:00:00.000Z', { amount: 500, status: 'Reversado' })];
const petty: PettyCashMovement[] = [{ id: 'CCH-1', date: '2026-10-20T15:00:00.000Z', kind: 'Ingreso', category: 'Reposición de fondo', concept: 'x', amount: 1000, method: 'Efectivo', user: 'u', status: 'Aplicado' }];
check('Saldo esperado a una fecha: por caja, solo lo aplicado', expectedAt('caja', 'PEN', '2026-10-21', cash, petty) === 70 && expectedAt('caja', 'PEN', '2026-10-22', cash, petty) === 120 && expectedAt('caja', 'USD', '2026-10-22', cash, petty) === 99 && expectedAt('caja-chica', 'PEN', '2026-10-22', cash, petty) === 1000);
const closure = (date: string, over: Partial<CashClosure> = {}): CashClosure => ({ id: 'CIE-1', scope: 'caja', currency: 'PEN', date, expected: 70, counted: 70, difference: 0, note: '', closedAt: 'x', closedBy: 'u', status: 'Cerrada', ...over });
check('Cierre: fecha válida, contado obligatorio, nota si hay diferencia', validateClosure({ scope: 'caja', currency: 'PEN', date: '2026-10-21', counted: '70', note: '' }, [], 70, TODAY).length === 0
  && validateClosure({ scope: 'caja', currency: 'PEN', date: '2026-12-01', counted: '70', note: '' }, [], 70, TODAY).length === 1 && validateClosure({ scope: 'caja', currency: 'PEN', date: '2026-10-21', counted: '', note: '' }, [], 70, TODAY).length === 1
  && validateClosure({ scope: 'caja', currency: 'PEN', date: '2026-10-21', counted: '65', note: '' }, [], 70, TODAY).length === 1 && validateClosure({ scope: 'caja', currency: 'PEN', date: '2026-10-21', counted: '65', note: 'Faltó un vuelto' }, [], 70, TODAY).length === 0);
check('No se cierra una fecha ya cerrada ni una anterior', validateClosure({ scope: 'caja', currency: 'PEN', date: '2026-10-20', counted: '70', note: '' }, [closure('2026-10-21')], 70, TODAY).length === 1);
check('El cierre guarda diferencia (sobrante +, faltante −)', buildClosure({ scope: 'caja', currency: 'PEN', date: '2026-10-21', counted: '65', note: ' n ' }, 70, 'A', 'now').difference === -5 && buildClosure({ scope: 'caja', currency: 'PEN', date: '2026-10-21', counted: '75', note: '' }, 70, 'A', 'now').difference === 5);
check('Fechas cerradas bloquean, cada caja por separado', isDateClosed([closure('2026-10-21')], 'caja', 'PEN', '2026-10-21') && !isDateClosed([closure('2026-10-21')], 'caja', 'PEN', '2026-10-22') && !isDateClosed([closure('2026-10-21')], 'caja', 'USD', '2026-10-20') && !isDateClosed([closure('2026-10-21')], 'caja-chica', 'PEN', '2026-10-20')
  && /cerrada hasta el 2026-10-21/.test(closedMessage([closure('2026-10-21')], 'caja', 'PEN', '2026-10-20') ?? ''));
check('Un cierre reabierto ya no bloquea', closedUntil([closure('2026-10-21', { status: 'Reabierta' })], 'caja', 'PEN') === null);
check('Solo se reabre el último cierre, con motivo', (() => {
  const list = [closure('2026-10-21', { id: 'CIE-2' }), closure('2026-10-20', { id: 'CIE-1' })];
  return validateReopen(list[0], list, 'Error en un cobro').length === 0 && validateReopen(list[1], list, 'Error en un cobro').length === 1 && validateReopen(list[0], list, 'x').length === 1 && validateReopen({ ...list[0], status: 'Reabierta' }, list, 'Error en un cobro').length === 1;
})());
check('Cierre desactualizado si entró un movimiento cubierto', closureDrift(closure('2026-10-21'), cash, petty) === 0 && closureDrift(closure('2026-10-21'), [...cash, cm('9', '2026-10-21T20:00:00.000Z', { amount: 40 })], petty) === 40);

// ================================================================ Caja chica: fondo
check('Fondo: valores válidos y tope dentro del fondo', Object.keys(validateFund({ assigned: '1000', maxExpense: '200' })).length === 0 && !!validateFund({ assigned: '', maxExpense: '200' }).assigned && !!validateFund({ assigned: '100', maxExpense: '200' }).maxExpense);
check('Reposición = fondo − saldo (nunca negativa)', refillNeeded(DEFAULT_FUND, petty) === 0 && refillNeeded(DEFAULT_FUND, [{ ...petty[0], amount: 300 }]) === 700);
check('Un gasto no supera el tope del fondo', !!validatePettyInput({ ...emptyPettyInput('Egreso', TODAY), category: 'Movilidad', concept: 'Taxi', amount: '250' }, petty, TODAY, DEFAULT_FUND).amount && !validatePettyInput({ ...emptyPettyInput('Egreso', TODAY), category: 'Movilidad', concept: 'Taxi', amount: '150' }, petty, TODAY, DEFAULT_FUND).amount);

// ================================================================ Estado derivado de cuotas y planes
const inst = (id: string, amount: number, balance: number, due: string, status: string, payments: any[] = [], extra: Record<string, unknown> = {}) => ({ id, name: `Cuota ${id.slice(1)}`, amount, balance, dueDate: due, dueDateISO: due, status, payments, ...extra });
check('Una cuota «Pendiente» vencida se ve «Vencida»', installmentState(inst('C1', 100, 100, '2026-10-01', 'Pendiente'), TODAY) === 'Vencida' && installmentState(inst('C1', 100, 100, '2026-11-01', 'Pendiente'), TODAY) === 'Pendiente');
check('Parcial, pagada y cerradas', installmentState(inst('C1', 100, 40, '2026-11-01', 'Pendiente', [{ amount: 60 }]), TODAY) === 'Parcial' && installmentState(inst('C1', 100, 0, '2026-10-01', 'Pendiente'), TODAY) === 'Pagada' && installmentState(inst('C1', 100, 0, '2026-10-01', 'Anulada'), TODAY) === 'Anulada');
check('Días de atraso', daysOverdue(inst('C1', 100, 100, '2026-10-13', 'Pendiente'), TODAY) === 10 && daysOverdue(inst('C1', 100, 100, '2026-11-13', 'Pendiente'), TODAY) === 0 && daysOverdue(inst('C1', 100, 0, '2026-10-13', 'Pagada'), TODAY) === 0);
const basePlan = (over: Partial<Plan> = {}): Plan => ({
  id: 'PLN-1', mat: 'MAT-1', titular: 'Juan Ruiz', type: 'Plan 4 cuotas', total: 800, balance: 400, next: '-', status: 'Al día',
  installments: [
    inst('C1', 200, 0, '2026-09-01', 'Pagada', [{ id: 'P1', paymentId: 'PAG-1', date: '2026-09-01', amount: 200, receipt: 'B001-1' }]),
    inst('C2', 200, 0, '2026-10-01', 'Pagada', [{ id: 'P2', paymentId: 'PAG-2', date: '2026-10-01', amount: 200, receipt: 'B001-2' }]),
    inst('C3', 200, 200, '2026-10-15', 'Pendiente'),
    inst('C4', 200, 200, '2026-11-15', 'Pendiente'),
  ], ...over,
});
check('El plan se recalcula: atrasado, al día, completado, caída', planState(basePlan(), TODAY) === 'Atrasado' && planState(basePlan({ installments: basePlan().installments.map(i => (i.id === 'C3' ? { ...i, dueDate: '2026-11-01', dueDateISO: '2026-11-01' } : i)) }), TODAY) === 'Al día'
  && planState(basePlan({ installments: basePlan().installments.map(i => ({ ...i, balance: 0 })) }), TODAY) === 'Completado' && planState(basePlan({ status: 'Caída' }), TODAY) === 'Caída');
check('recomputePlan: saldo y próxima cuota', (() => { const r = recomputePlan(basePlan(), TODAY); return r.balance === 400 && r.next === '2026-10-15' && r.status === 'Atrasado'; })());

// ================================================================ Reactivación, cambio de programa, traslado, renovación
const branches: Branch[] = [
  { id: 'FIL-PIU', name: 'Piura', company: 'Empresa S.A.C.', status: 'Activo', address: 'Av. Sullana 280', district: 'Piura', province: 'Piura', department: 'Piura' } as Branch,
  { id: 'FIL-CHI', name: 'Chiclayo', company: 'Empresa S.A.C.', status: 'Activo', address: 'Av. Balta 100', district: 'Chiclayo', province: 'Chiclayo', department: 'Lambayeque' } as Branch,
];
const programs: Program[] = [
  { id: 'P-K', code: 'K', name: 'Kids', hasLevels: true, durationBase: 6, warranty: 3, allBranches: true, status: 'Activo' },
  { id: 'P-T', code: 'T', name: 'Teens', hasLevels: true, durationBase: 4, warranty: 0, allBranches: false, enabledBranches: ['FIL-PIU'], status: 'Activo' },
  { id: 'P-A', code: 'A', name: 'Adultos', hasLevels: false, durationBase: 3, warranty: 0, allBranches: true, status: 'Activo' },
];
const levels: Level[] = [
  { id: 'L-K1', programId: 'P-K', code: 'N1', name: 'Nivel 1', order: 1, status: 'Activo' }, { id: 'L-K2', programId: 'P-K', code: 'N2', name: 'Nivel 2', order: 2, status: 'Activo' },
  { id: 'L-T1', programId: 'P-T', code: 'N1', name: 'Nivel 1', order: 1, status: 'Activo' },
];
const paymentTypes: PaymentType[] = [{ id: 'PT-4', code: 'P4', name: 'Plan 4 cuotas', installments: 4, termDays: 30, status: 'Activo' }];
const tariff = (id: string, programId: string, levelId: string | undefined, total: number, over: Partial<Tariff> = {}): Tariff => ({
  id, name: `Tarifa ${id}`, programId, levelId, paymentTypeId: 'PT-4', branchId: 'all', currency: 'USD', basePrice: total, installments: [{ number: 1, concept: 'Pago', amount: total, dueDays: 0 }], startDate: '2026-01-01', status: 'Activo', ...over,
});
const tariffs = [tariff('T-K1', 'P-K', 'L-K1', 800), tariff('T-K2', 'P-K', 'L-K2', 900), tariff('T-T1', 'P-T', 'L-T1', 1000), tariff('T-A', 'P-A', undefined, 300)];
const classSchedules: ClassSchedule[] = [
  { id: 'H1', name: 'L-M-V 4:00 PM', allBranches: false, branchIds: ['FIL-PIU'], status: 'Activo' }, { id: 'H2', name: 'Sábados 9:00 AM', allBranches: true, branchIds: [], status: 'Activo' },
];
const student = (over: Partial<Student> = {}): Student => ({ id: 'ALU-1', doc: '12345678', name: 'Mateo Ruiz', age: 9, program: 'Kids', titular: 'Juan Ruiz', status: 'Activo', guardianIds: ['G1'], horario: 'L-M-V 4:00 PM', ...over });
const enrollment = (over: Partial<Enrollment> = {}): Enrollment => ({
  id: 'MAT-1', date: '01 Sep 2026', dateISO: '2026-09-01', student: 'Mateo Ruiz', studentId: 'ALU-1', program: 'Kids', programId: 'P-K', level: 'Nivel 1', levelId: 'L-K1', status: 'Activa', plan: 'Al día',
  branchId: 'FIL-PIU', sede: 'Piura', paymentTypeId: 'PT-4', paymentTypeName: 'Plan 4 cuotas', assignedPrice: 800, planId: 'PLN-1', verificationStatus: 'Pendiente', ...over,
});
const schedule = (id: string, over: Partial<Schedule> = {}): Schedule => ({ id, student: 'Mateo Ruiz', studentId: 'ALU-1', program: 'Kids', level: 'Nivel 1', date: '2026-10-28', time: '16:00', duration: 60, responsible: 'Ana', status: 'Reservado', branchId: 'FIL-PIU', ...over });
const ctxOf = (over: Partial<ChangeContext> = {}): ChangeContext => ({
  enrollments: [enrollment()], plans: [basePlan()], students: [student()], schedules: [], monthly: [], programs, levels, tariffs, paymentTypes, branches, classSchedules, payments: [], groups: [], requests: [], today: TODAY, ...over,
});

// --- Reactivación
const dropped = (over: Partial<Enrollment> = {}) => enrollment({ status: 'Caída', plan: 'Caída', dropDate: '2026-10-20', ...over });
const droppedPlan = () => applyDropToPlan(basePlan(), previewDrop({ enrollment: dropped(), plan: basePlan(), schedules: [], monthly: [], students: [student()], enrollments: [dropped()], payments: [], groups: [] }, '2026-10-20'), false);
check('La caída marca lo anulado y lo condonado por separado', (() => {
  const p = applyDropToPlan(basePlan(), previewDrop({ enrollment: enrollment(), plan: basePlan(), schedules: [], monthly: [], students: [student()], enrollments: [enrollment()], payments: [], groups: [] }, '2026-10-20'), true);
  return p.installments.find(i => i.id === 'C4')!.dropAnnulled === true && p.installments.find(i => i.id === 'C3')!.forgiven === true;
})());
const rc = (e: Enrollment, p: Plan) => ctxOf({ enrollments: [e], plans: [p], students: [student({ status: 'Inactivo' })] });
check('Reactivar: se puede dentro del plazo', reactivationProblems(dropped(), rc(dropped(), droppedPlan())).length === 0);
check('Reactivar: solo matrículas caídas', reactivationProblems(enrollment(), ctxOf()).length === 1);
check('Reactivar: fuera de plazo corresponde renovar', /renovación/.test(reactivationProblems(dropped({ dropDate: '2026-06-01' }), rc(dropped({ dropDate: '2026-06-01' }), droppedPlan())).join(' ')) && REACTIVATION_WINDOW_DAYS === 90);
check('Reactivar: otra matrícula activa del mismo programa lo impide', reactivationProblems(dropped(), ctxOf({ enrollments: [dropped(), enrollment({ id: 'MAT-2' })], plans: [droppedPlan()] })).some(p => /otra matrícula activa/.test(p)));
check('Reactivar: programa no habilitado en la sede lo impide', reactivationProblems(dropped({ programId: 'P-T', program: 'Teens', branchId: 'FIL-CHI' }), ctxOf({ enrollments: [dropped({ programId: 'P-T', program: 'Teens', branchId: 'FIL-CHI' })], plans: [droppedPlan()] })).some(p => /no está disponible/.test(p)));
check('Reactivar: no si hay una solicitud pendiente', reactivationProblems(dropped(), ctxOf({ enrollments: [dropped()], plans: [droppedPlan()], requests: [{ id: 'SOL-1', enrollmentId: 'MAT-1', status: 'Pendiente' } as ChangeRequest] })).some(p => /solicitud pendiente/.test(p)));
check('Reactivar: validación de fecha y motivo', (() => {
  const c = rc(dropped(), droppedPlan());
  const ok = { startDate: TODAY, reason: 'El alumno retomó el pago', detail: 'Pagó la deuda pendiente' };
  return validateReactivationRequest(dropped(), ok, c).length === 0 && validateReactivationRequest(dropped(), { ...ok, startDate: '2026-10-01' }, c).length === 1 && validateReactivationRequest(dropped(), { ...ok, startDate: '2026-12-30' }, c).length === 1
    && validateReactivationRequest(dropped(), { ...ok, reason: '' }, c).length === 1 && validateReactivationRequest(dropped(), { ...ok, detail: 'x' }, c).length === 1;
})());
check('Reactivar: restituye lo anulado con el calendario corrido y respeta lo condonado', (() => {
  const dp = droppedPlan();
  const forgiving = applyDropToPlan(basePlan(), previewDrop({ enrollment: enrollment(), plan: basePlan(), schedules: [], monthly: [], students: [student()], enrollments: [enrollment()], payments: [], groups: [] }, '2026-10-20'), true);
  const pv = previewReactivation(dropped(), rc(dropped(), dp), '2026-10-30');
  const pvForgiven = previewReactivation(dropped(), rc(dropped(), forgiving), '2026-10-30');
  const after = applyReactivationToPlan(dp, pv, TODAY);
  const c4 = after.installments.find(i => i.id === 'C4')!;
  return pv.shiftDays === 10 && pv.restored.length === 1 && pv.restored[0].id === 'C4' && c4.dueDateISO === '2026-11-25' && c4.balance === 200 && c4.status === 'Pendiente' && !c4.dropAnnulled
    && pv.keptDebt.length === 1 && pv.keptDebtUSD === 200 && pvForgiven.forgivenCount === 1 && pvForgiven.keptDebt.length === 0 && after.status !== 'Caída' && pv.studentReactivates;
})());
check('Reactivar: lo cobrado no se toca ni se vuelve a cobrar', (() => {
  const dp = droppedPlan();
  const after = applyReactivationToPlan(dp, previewReactivation(dropped(), rc(dropped(), dp), TODAY), TODAY);
  return enrollmentPaidUSD('MAT-1', [], [], after) === 400;
})());

// --- Cambio de programa
const pcInput = (over = {}) => ({ programId: 'P-K', levelId: 'L-K2', reason: 'Nivel mal asignado', detail: 'El alumno ya domina el nivel 1', ...over });
check('Cambio de nivel: válido con tarifario del mismo tipo de pago', programChangeProblems(enrollment(), pcInput(), ctxOf()).length === 0 && validateProgramChangeRequest(enrollment(), pcInput(), ctxOf()).length === 0);
check('Cambio: igual al actual, sin nivel o sin tarifario', programChangeProblems(enrollment(), pcInput({ levelId: 'L-K1' }), ctxOf()).length === 1 && programChangeProblems(enrollment(), pcInput({ levelId: '' }), ctxOf()).length >= 1
  && programChangeProblems(enrollment(), pcInput({ programId: 'P-A', levelId: '' }), ctxOf({ tariffs: tariffs.filter(t => t.id !== 'T-A') })).some(p => /tarifario vigente/.test(p)));
check('Cambio: programa no habilitado en la sede', programChangeProblems(enrollment({ branchId: 'FIL-CHI' }), pcInput({ programId: 'P-T', levelId: 'L-T1' }), ctxOf({ enrollments: [enrollment({ branchId: 'FIL-CHI' })] })).some(p => /no está habilitado/.test(p)));
check('Cambio: no en grupo promocional, ni caída, ni cronograma variable', programChangeProblems(enrollment({ promotionGroupId: 'PGR-1' }), pcInput(), ctxOf({ enrollments: [enrollment({ promotionGroupId: 'PGR-1' })] })).some(p => /grupo promocional/.test(p))
  && programChangeProblems(dropped(), pcInput(), ctxOf()).length === 1 && programChangeProblems(enrollment(), pcInput(), ctxOf({ plans: [basePlan({ installments: basePlan().installments.map(i => ({ ...i, variable: true })) })] })).some(p => /monto variable/.test(p)));
check('Cambio: lo cobrado se abona y el saldo se reparte en las cuotas libres', (() => {
  const pv = previewProgramChange(enrollment(), pcInput(), ctxOf())!;
  const open = pv.installments.filter(i => i.balance > 0);
  return pv.newTotal === 900 && pv.paidUSD === 400 && pv.remaining === 500 && open.length === 2 && open.reduce((a, i) => a + i.balance, 0) === 500 && open[0].balance === 250;
})());
check('Cambio: el plan nuevo suma el precio nuevo', (() => {
  const pv = previewProgramChange(enrollment(), pcInput(), ctxOf())!;
  const plan = applyProgramChangeToPlan(basePlan(), pv, TODAY);
  return plan.total === 900 && plan.balance === 500 && enrollmentPaidUSD('MAT-1', [], [], plan) === 400;
})());
check('Cambio: si ya se cobró más que el precio nuevo, no se aplica', (() => {
  const c = ctxOf({ tariffs: [...tariffs.filter(t => t.id !== 'T-K2'), tariff('T-K2', 'P-K', 'L-K2', 300)] });
  const pv = previewProgramChange(enrollment(), pcInput(), c)!;
  return pv.remaining === -100 && validateProgramChangeRequest(enrollment(), pcInput(), c).some(p => /devuelva la diferencia/.test(p));
})());
check('Cambio: un cobro parcial se congela y su saldo pasa al plan nuevo', (() => {
  const partial = basePlan({ installments: basePlan().installments.map(i => (i.id === 'C3' ? { ...i, balance: 120, payments: [{ id: 'PX', amount: 80, date: '2026-10-05', receipt: 'B' }] } : i)) });
  const pv = previewProgramChange(enrollment(), pcInput(), ctxOf({ plans: [partial] }))!;
  const c3 = pv.installments.find(i => i.id === 'C3')!;
  const c4 = pv.installments.find(i => i.id === 'C4')!;
  return pv.paidUSD === 480 && c3.amount === 80 && c3.balance === 0 && c3.status === 'Pagada' && c4.balance === 420 && pv.frozenPartials.length === 1;
})());
check('Cambio: sin cuotas libres se crea «Saldo por cambio de programa»', (() => {
  const allPaid = basePlan({ installments: basePlan().installments.slice(0, 2) });
  const pv = previewProgramChange(enrollment(), pcInput(), ctxOf({ plans: [allPaid] }))!;
  return pv.remaining === 500 && pv.installments.some(i => i.name === 'Saldo por cambio de programa' && i.balance === 500);
})());
check('Cambio: con precio igual al cobrado, las cuotas libres se anulan', (() => {
  const pv = previewProgramChange(enrollment(), pcInput(), ctxOf({ tariffs: [...tariffs.filter(t => t.id !== 'T-K2'), tariff('T-K2', 'P-K', 'L-K2', 400)] }))!;
  return pv.remaining === 0 && pv.installments.filter(i => i.id === 'C3' || i.id === 'C4').every(i => i.status === 'Anulada');
})());
check('Cambio: una verificación hecha vuelve a pendiente', previewProgramChange(enrollment({ verificationStatus: 'Verificado Completo' }), pcInput(), ctxOf())!.verificationReset && !previewProgramChange(enrollment(), pcInput(), ctxOf())!.verificationReset);

// --- Traslado de sede
const tInput = (over = {}) => ({ branchId: 'FIL-CHI', schedule: 'Sábados 9:00 AM', reason: 'Cambio de domicilio', detail: 'La familia se mudó a Chiclayo', ...over });
check('Traslado: válido eligiendo un horario de la sede destino', transferProblems(enrollment(), tInput(), ctxOf()).length === 0 && validateTransferRequest(enrollment(), tInput(), ctxOf()).length === 0);
check('Traslado: el horario actual no existe allí → hay que elegir otro', transferProblems(enrollment(), tInput({ schedule: '' }), ctxOf()).some(p => /elija uno/.test(p)) && transferProblems(enrollment(), tInput({ schedule: 'Martes 8 PM' }), ctxOf()).some(p => /no está disponible/.test(p)));
check('Traslado: si el horario existe en la sede destino se conserva', (() => { const pv = previewTransfer(enrollment(), tInput({ schedule: '' }), ctxOf({ students: [student({ horario: 'Sábados 9:00 AM' })] }))!; return pv.schedule === 'Sábados 9:00 AM' && !pv.scheduleChanged; })());
check('Traslado: no a la misma sede, ni a una sede donde el programa no está', transferProblems(enrollment(), tInput({ branchId: 'FIL-PIU' }), ctxOf()).some(p => /misma/.test(p)) && transferProblems(enrollment({ programId: 'P-T', program: 'Teens' }), tInput(), ctxOf({ enrollments: [enrollment({ programId: 'P-T', program: 'Teens' })] })).some(p => /no está habilitado/.test(p)));
check('Traslado: se cancelan las asesorías y actividades futuras de la sede anterior', (() => {
  const monthly = [{ id: 'M1', branchId: 'FIL-PIU', actividades: [{ id: 'A1', fecha: '2026-11-05', inscritos: ['ALU-1'] }, { id: 'A2', fecha: '2026-09-05', inscritos: ['ALU-1'] }] }, { id: 'M2', branchId: 'FIL-CHI', actividades: [{ id: 'A3', fecha: '2026-11-05', inscritos: ['ALU-1'] }] }] as any;
  const pv = previewTransfer(enrollment(), tInput(), ctxOf({ schedules: [schedule('S1'), schedule('S2', { date: '2026-09-01', status: 'Asistió' }), schedule('S3', { isFirst: true, enrollmentId: 'MAT-1', date: '2026-10-30' })], monthly }))!;
  return pv.scheduleIds.sort().join() === 'S1,S3' && pv.activityRemovals.length === 1 && pv.activityRemovals[0].activityId === 'A1' && pv.firstSessionLost && pv.scheduleChanged;
})());
check('Traslado: con otra matrícula activa en la sede solo se cancela la primera asesoría de esta', (() => {
  const pv = previewTransfer(enrollment(), tInput(), ctxOf({ enrollments: [enrollment(), enrollment({ id: 'MAT-2', programId: 'P-A', program: 'Adultos' })], schedules: [schedule('S1'), schedule('S3', { isFirst: true, enrollmentId: 'MAT-1', date: '2026-10-30' })] }))!;
  return pv.scheduleIds.join() === 'S3' && pv.activityRemovals.length === 0;
})());

// --- Renovación
const renewCtx = (e: Enrollment, over: Partial<ChangeContext> = {}) => ({ enrollments: [e], programs, levels, schedules: [schedule('F1', { isFirst: true, enrollmentId: e.id, date: '2026-03-01', status: 'Asistió' })], today: TODAY, ...over });
check('Renovar: una matrícula vigente aún no se renueva', !renewalCheck(enrollment(), { enrollments: [enrollment()], programs, levels, schedules: [schedule('F1', { isFirst: true, enrollmentId: 'MAT-1', date: '2026-10-01', status: 'Asistió' })], today: TODAY }).ok);
check('Renovar: con la base terminada (o por vencer) sí', renewalCheck(enrollment(), renewCtx(enrollment())).ok && renewalCheck(enrollment(), { ...renewCtx(enrollment()), schedules: [schedule('F1', { isFirst: true, enrollmentId: 'MAT-1', date: '2026-04-20', status: 'Asistió' })] }).ok);
check('Renovar: una caída se renueva pasado el plazo de reactivación', !renewalCheck(dropped(), renewCtx(dropped())).ok && renewalCheck(dropped({ dropDate: '2026-05-01' }), renewCtx(dropped({ dropDate: '2026-05-01' }))).ok);
check('Renovar: no dos veces', !renewalCheck(enrollment(), renewCtx(enrollment(), { enrollments: [enrollment(), enrollment({ id: 'MAT-2', renewsId: 'MAT-1' })] })).ok);
check('Renovar: sugiere el nivel siguiente y repite el último', nextLevel(levels, programs[0], 'L-K1').levelId === 'L-K2' && nextLevel(levels, programs[0], 'L-K2').levelId === 'L-K2' && nextLevel(levels, programs[2], undefined).levelId === '');
check('Renovar: el borrador trae alumno, titular, nivel siguiente y tipo de pago', (() => {
  const g = { id: 'G1', name: 'Juan Ruiz', doc: '45678901', phone: '999888777', email: 'j@x.pe', direccion: 'Calle 1', names: 'Juan', lastNameP: 'Ruiz', lastNameM: 'Soto', students: 1, enrollments: 1, balance: '$0' } as Guardian;
  const e = enrollment();
  const draft = buildRenewalDraft(e, renewalCheck(e, renewCtx(e)), [student({ names: 'Mateo', lastNameP: 'Ruiz', lastNameM: 'Soto' })], [g], TODAY)!;
  return draft.mode === 'apoderado' && draft.holders[0].existingId === 'G1' && draft.students[0].person.existingId === 'ALU-1' && draft.students[0].levelId === 'L-K2' && draft.students[0].paymentTypeId === 'PT-4' && draft.renewsId === 'MAT-1' && draft.context.branchId === 'FIL-PIU' && /Renovación/.test(draft.context.observation);
})());
check('Renovar: un alumno independiente se renueva como independiente', (() => {
  const e = enrollment({ guardianIds: [] });
  const draft = buildRenewalDraft(e, renewalCheck(e, renewCtx(e)), [student({ guardianIds: [] })], [], TODAY)!;
  return draft.mode === 'independiente' && draft.holders.length === 1 && draft.holders[0].existingId === 'ALU-1';
})());

// ================================================================ Contrato y ficha
const company = { id: '1', ruc: '20123456789', name: 'Empresa S.A.C.', commercialName: 'ENSIL', status: 'Activo' as const };
const guardian = { id: 'G1', name: 'Juan Ruiz Soto', doc: '45678901', docType: 'DNI', phone: '999888777', email: 'j@x.pe', direccion: 'Calle 1 N.° 23', parentesco: 'Padre', students: 1, enrollments: 1, balance: '$0' } as Guardian;
const docCtx = (over: Partial<DocContext> = {}): DocContext => {
  const e = enrollment();
  const plan = basePlan();
  return {
    enrollment: e, student: student({ doc: '88776655', address: 'Calle 1' }), guardians: [guardian], program: programs[0], level: levels[0], plan, branch: branches[0], company,
    firstSession: schedule('F1', { isFirst: true, enrollmentId: 'MAT-1', date: '2026-09-08', status: 'Asistió' }),
    validity: enrollmentValidity(e, programs[0], [schedule('F1', { isFirst: true, enrollmentId: 'MAT-1', date: '2026-09-08', status: 'Asistió' })], TODAY), template: DEFAULT_CONTRACT_TEMPLATE, today: TODAY, ...over,
  };
};
check('La plantilla modelo es válida y trae solo campos conocidos', validateTemplate(DEFAULT_CONTRACT_TEMPLATE).length === 0 && !DEFAULT_CONTRACT_TEMPLATE.reviewed);
check('Campos desconocidos y plantilla vacía se detectan', unknownTokens('Hola {{alumno}} {{inventado}}').join() === 'inventado' && validateTemplate({ ...DEFAULT_CONTRACT_TEMPLATE, clauses: [] }).length === 1 && validateTemplate({ ...DEFAULT_CONTRACT_TEMPLATE, closing: '{{xx}}' }).length === 1);
check('Los campos se completan con datos de la matrícula', (() => {
  const v = templateVars(docCtx());
  return v.alumno === 'Mateo Ruiz' && v.contratante === 'Juan Ruiz Soto' && v.calidad === 'padre' && v.empresa === 'Empresa S.A.C.' && v.ruc === '20123456789' && v.duracion === '6 meses' && /3 meses adicionales/.test(v.garantia)
    && v.precio === 'USD 800.00' && v.inicio === '8 de septiembre de 2026' && v.fin_base === '7 de marzo de 2027' && /4 pagos/.test(v.plan_pagos) && v.fecha_contrato === '23 de octubre de 2026';
})());
check('renderTemplateText respeta lo que no conoce', renderTemplateText('A {{alumno}} B {{zzz}}', { alumno: 'X' }) === 'A X B {{zzz}}');
check('El contrato no deja campos sin completar y trae cronograma y firmas', (() => {
  const d = buildContractDocument(docCtx());
  const text = JSON.stringify(d.sections);
  return !/\{\{/.test(text) && d.sections.some(s => s.table && s.table.rows.length === 4) && d.signatures.length === 2 && d.signatures[0].name === 'Juan Ruiz Soto' && d.signatures[1].doc === 'RUC 20123456789';
})());
check('La ficha trae alumno, titular, programa, plan y la primera asesoría', (() => {
  const d = buildFichaDocument(docCtx());
  const text = JSON.stringify(d.sections);
  return /Mateo Ruiz/.test(text) && /Juan Ruiz Soto/.test(text) && /Plan 4 cuotas/.test(text) && /8 de septiembre de 2026/.test(text) && d.signatures.length === 1;
})());
check('Contrato: qué falta para generarlo', documentProblems('contract', docCtx()).length === 0
  && documentProblems('contract', docCtx({ guardians: [{ ...guardian, direccion: '' }] })).some(p => /dirección/.test(p))
  && documentProblems('contract', docCtx({ company: undefined })).some(p => /empresa/.test(p))
  && documentProblems('contract', docCtx({ company: { ...company, ruc: '' } })).some(p => /RUC/.test(p))
  && documentProblems('contract', docCtx({ plan: undefined })).some(p => /plan de pagos/.test(p))
  && documentProblems('contract', docCtx({ enrollment: dropped() })).some(p => /activas/.test(p)));
check('Un menor sin titular no puede ser su propio contratante', documentProblems('contract', docCtx({ guardians: [], student: student({ age: 12, address: 'Calle' }) })).some(p => /menor de edad/.test(p)) && documentProblems('contract', docCtx({ guardians: [], student: student({ age: 30, address: 'Calle' }) })).length === 0);
check('La ficha solo exige tener al alumno', documentProblems('ficha', docCtx({ student: undefined })).length === 1 && documentProblems('ficha', docCtx({ plan: undefined, company: undefined })).length === 0);
check('Numeración y versión: nuevo, igual, cambió', (() => {
  const built = buildContractDocument(docCtx());
  const first = issueDocument('contract', undefined, built, 'Ana', '2026-10-23T10:00:00Z', []);
  const same = issueDocument('contract', first, built, 'Ana', '2026-10-24T10:00:00Z', [first.number]);
  const changed = buildContractDocument(docCtx({ plan: basePlan({ total: 900, installments: basePlan().installments.slice(0, 3) }) }));
  const second = issueDocument('contract', { ...first, signedAt: '2026-10-23', signedFile: 'x.pdf' }, changed, 'Ana', '2026-10-25T10:00:00Z', [first.number]);
  const other = issueDocument('contract', undefined, built, 'Ana', '2026-10-25T10:00:00Z', [first.number]);
  return first.number === 'CTR-2026-001' && first.version === 1 && same === first && second.number === first.number && second.version === 2 && !second.signedAt && other.number === 'CTR-2026-002';
})());
check('Estado del documento y alertas', (() => {
  const built = buildContractDocument(docCtx());
  const issued = issueDocument('contract', undefined, built, 'Ana', '2026-10-23T10:00:00Z', []);
  return docState(undefined, built.fingerprint) === 'sin-generar' && docState(issued, built.fingerprint) === 'vigente' && docState(issued, 'otro') === 'desactualizado'
    && documentAlert({ status: 'Activa' }) === 'sin-contrato' && documentAlert({ status: 'Activa', documents: { contract: issued } }) === 'sin-firma' && documentAlert({ status: 'Activa', documents: { contract: { ...issued, signedAt: '2026-10-23' } } }) === null
    && documentAlert({ status: 'Caída' }) === null && documentAlert({ status: 'Activa', documents: { contract: issued } }, 'otro') === 'desactualizado';
})());
check('Firma: documento vigente, fecha y archivo', (() => {
  const built = buildContractDocument(docCtx());
  const issued = issueDocument('contract', undefined, built, 'Ana', '2026-10-23T10:00:00Z', []);
  const ok = { date: '2026-10-23', file: 'contrato_firmado.pdf' };
  return validateSignature(issued, 'vigente', ok, TODAY).length === 0 && validateSignature(undefined, 'sin-generar', ok, TODAY).length === 1 && validateSignature(issued, 'desactualizado', ok, TODAY).length === 1
    && validateSignature(issued, 'vigente', { ...ok, date: '2026-12-01' }, TODAY).length === 1 && validateSignature(issued, 'vigente', { ...ok, date: '2026-10-20' }, TODAY).length === 1 && validateSignature(issued, 'vigente', { ...ok, file: '' }, TODAY).length === 1
    && validateSignature({ ...issued, signedAt: '2026-10-23' }, 'vigente', ok, TODAY).length === 1;
})());
check('El HTML del documento escapa el texto y trae número y firmas', (() => {
  const d = buildFichaDocument(docCtx({ enrollment: enrollment({ observation: '<script>x</script>' }) }));
  const html = documentHtml(d, { number: 'FIC-2026-001', version: 2, generatedAt: '2026-10-23T10:00:00Z', generatedBy: 'Ana', fingerprint: 'x' });
  return !html.includes('<script>') && html.includes('&lt;script&gt;') && html.includes('FIC-2026-001') && html.includes('versión 2') && html.includes('class="sign"');
})());

// ================================================================ Cobranza: política, mora, recordatorios, cartera
const policyForm = { graceDays: '3', moraMonthlyRatePct: '2', remindBefore: '3, 0', remindAfter: '1, 7, 15, 30' };
check('Política: valores válidos y errores', validatePolicy(policyForm).length === 0 && validatePolicy({ ...policyForm, graceDays: '-1' }).length === 1 && validatePolicy({ ...policyForm, moraMonthlyRatePct: '50' }).length === 1 && validatePolicy({ ...policyForm, remindBefore: '', remindAfter: '' }).length === 1 && validatePolicy({ ...policyForm, remindAfter: '0' }).length === 1);
check('La política se interpreta en orden y la tasa en fracción', (() => { const p = parsePolicy({ ...policyForm, remindBefore: '0, 3', remindAfter: '30, 1' }); return p.moraMonthlyRate === 0.02 && p.remindBefore.join() === '3,0' && p.remindAfter.join() === '1,30'; })());
check('Etapas del calendario', stagesOf(DEFAULT_POLICY).map(s => s.offset).join() === '-3,0,1,7,15,30');
const withMora = { ...DEFAULT_POLICY, moraMonthlyRate: 0.02 };
const late = inst('C3', 200, 200, '2026-09-23', 'Pendiente');
check('Mora: días fuera de gracia × tasa / 30', (() => { const m = moraOf(late, withMora, TODAY); return m.daysOverdue === 30 && m.chargeableDays === 27 && m.accrued === 3.6 && m.pending === 3.6; })());
check('Mora: sin tasa no hay mora; dentro de gracia tampoco', moraOf(late, DEFAULT_POLICY, TODAY).accrued === 0 && moraOf(inst('C3', 200, 200, '2026-10-21', 'Pendiente'), withMora, TODAY).chargeableDays === 0 && moraOf({ ...late, isMora: true }, withMora, TODAY).daysOverdue === 0);
check('Cobrar mora: validaciones', validateMoraCharge(basePlan({ installments: [late] }), 'C3', withMora, TODAY).length === 0 && validateMoraCharge(basePlan({ installments: [late] }), 'C3', DEFAULT_POLICY, TODAY).length === 1
  && validateMoraCharge(basePlan({ installments: [inst('C3', 200, 200, '2026-11-20', 'Pendiente')] }), 'C3', withMora, TODAY).length === 1 && validateMoraCharge(basePlan({ installments: [inst('C3', 200, 0, '2026-09-01', 'Pagada')] }), 'C3', withMora, TODAY).length === 1);
check('Cobrar mora: crea la cuota «Mora», sube el saldo y no se cobra dos veces', (() => {
  const plan = basePlan({ installments: [late] });
  const after = chargeMoraOn(plan, 'C3', withMora, TODAY);
  const m1 = after.installments.find(i => i.isMora)!;
  const again = validateMoraCharge(after, 'C3', withMora, TODAY);
  return m1.amount === 3.6 && m1.dueDateISO === TODAY && after.installments.find(i => i.id === 'C3')!.moraCharged === 3.6 && after.balance === 203.6 && again.length === 1 && validateMoraCharge(after, m1.id, withMora, TODAY)[0] === 'La mora no genera más mora.';
})());
check('La mora cobrada no cuenta como cobrado del programa', enrollmentPaidUSD('MAT-1', [], [], basePlan({ installments: [inst('M1', 5, 0, '2026-10-23', 'Pagada', [{ amount: 5 }], { isMora: true }), inst('C1', 200, 0, '2026-09-01', 'Pagada', [{ amount: 200 }])] })) === 200);

const remCtx = (plans: Plan[], e: Enrollment[] = [enrollment()]) => ({ plans, enrollments: e, students: [student()], guardians: [guardian], branches });
const pl = (due: string, status = 'Pendiente') => basePlan({ installments: [inst('C3', 200, 200, due, status)] });
check('Recordatorio: una cuota que vence en 3 días entra en «3 días antes»', (() => { const r = buildReminders(remCtx([pl('2026-10-26')]), DEFAULT_POLICY, [], TODAY); return r.length === 1 && r[0].stage.offset === -3 && r[0].daysFromDue === -3 && /vence el 26 Oct 2026/.test(r[0].message); })());
check('Recordatorio: nada si faltan más de 3 días', buildReminders(remCtx([pl('2026-10-30')]), DEFAULT_POLICY, [], TODAY).length === 0);
check('Recordatorio: el día del vencimiento y después', buildReminders(remCtx([pl('2026-10-23')]), DEFAULT_POLICY, [], TODAY)[0].stage.kind === 'vencimiento' && buildReminders(remCtx([pl('2026-10-16')]), DEFAULT_POLICY, [], TODAY)[0].stage.offset === 7);
check('Recordatorio: solo la etapa más avanzada alcanzada (sin acumular)', (() => { const r = buildReminders(remCtx([pl('2026-08-01')]), DEFAULT_POLICY, [], TODAY); return r.length === 1 && r[0].stage.offset === 30 && /hace 83 días/.test(r[0].message); })());
check('Recordatorio: lo registrado deja de aparecer; la etapa siguiente sí', (() => {
  const first = buildReminders(remCtx([pl('2026-10-16')]), DEFAULT_POLICY, [], TODAY)[0];
  const done = buildReminders(remCtx([pl('2026-10-16')]), DEFAULT_POLICY, [{ key: first.key }], TODAY);
  const later = buildReminders(remCtx([pl('2026-10-16')]), DEFAULT_POLICY, [{ key: first.key }], '2026-10-31');
  return done.length === 0 && later.length === 1 && later[0].stage.offset === 15;
})());
check('Recordatorio: no para planes completados, matrículas caídas sin deuda ni cuotas cerradas', buildReminders(remCtx([pl('2026-10-26')].map(p => ({ ...p, status: 'Completado' }))), DEFAULT_POLICY, [], TODAY).length === 0
  && buildReminders(remCtx([pl('2026-10-26')], [dropped()]), DEFAULT_POLICY, [], TODAY).length === 0 && buildReminders(remCtx([basePlan({ installments: [inst('C3', 200, 0, '2026-10-26', 'Anulada')] })]), DEFAULT_POLICY, [], TODAY).length === 0);
check('Recordatorio: destinatario, teléfono y enlace de WhatsApp', (() => { const r = buildReminders(remCtx([pl('2026-10-26')]), DEFAULT_POLICY, [], TODAY)[0]; return r.recipient === 'Juan Ruiz Soto' && r.phone === '999888777' && r.whatsappUrl!.startsWith('https://wa.me/51999888777?text=') && whatsappUrl('123', 'x') === undefined; })());
check('Registrar un recordatorio: canal, resultado y motivo si se omite', validateReminderLog({ key: 'k' }, 'WhatsApp', 'Enviado', '', []).length === 0 && validateReminderLog({ key: 'k' }, 'WhatsApp', 'Enviado', '', [{ key: 'k' }]).length === 1 && validateReminderLog({ key: 'k' }, 'Paloma', 'Enviado', '', []).length === 1 && validateReminderLog({ key: 'k' }, 'Otro', 'Omitido', '', []).length === 1);

const pf = remCtx([
  basePlan(),
  basePlan({ id: 'PLN-2', mat: 'MAT-2', titular: 'Ana Silva', installments: [inst('C1', 300, 300, '2026-07-01', 'Pendiente'), inst('C2', 300, 300, '2026-11-20', 'Pendiente')] }),
  basePlan({ id: 'PLN-3', mat: 'MAT-3', status: 'Completado', installments: [] }),
  basePlan({ id: 'PLN-4', mat: 'MAT-4', status: 'Caída', installments: [inst('C1', 100, 100, '2026-08-01', 'Pendiente'), inst('C2', 100, 100, '2026-12-01', 'Anulada')] }),
], [enrollment(), enrollment({ id: 'MAT-2', student: 'Ana Silva', studentId: 'ALU-2', branchId: 'FIL-CHI', sede: 'Chiclayo' }), enrollment({ id: 'MAT-3' }), enrollment({ id: 'MAT-4', status: 'Caída' })]);
const rows = portfolioRows(pf, TODAY);
check('Cartera: cuotas abiertas de activas y solo la deuda vencida de las caídas', rows.length === 5 && rows.filter(r => r.enrollmentId === 'MAT-4').length === 1 && !rows.some(r => r.enrollmentId === 'MAT-3'));
check('Cartera: antigüedad por tramos', bucketOf(0) === 'Por vencer' && bucketOf(1) === '1 a 30 días' && bucketOf(30) === '1 a 30 días' && bucketOf(31) === '31 a 60 días' && bucketOf(91) === 'Más de 90 días');
check('Cartera: indicadores', (() => {
  const k = portfolioKpis(rows, [{ id: 'P', date: '2026-10-05', student: 's', concept: 'c', amount: 120, method: 'Efectivo', receipt: 'B', status: 'Aprobado' }, { id: 'Q', date: '2026-10-06', student: 's', concept: 'c', amount: 999, method: 'Efectivo', receipt: 'B', status: 'Anulado' }, { id: 'R', date: '2026-09-06', student: 's', concept: 'c', amount: 50, method: 'Efectivo', receipt: 'B', status: 'Aprobado' }], TODAY);
  return k.total === 1100 && k.overdue === 600 && k.current === 500 && k.delinquencyRate === 54.55 && k.debtors === 3 && k.collectedMonth === 120 && k.dueIn.d7 === 0 && k.dueIn.d30 === 500 && k.dueIn.d90 === 500 && k.installments === 5;
})());
check('Cartera: resumen por antigüedad suma el total', (() => { const a = agingSummary(rows); return a.length === 5 && a.reduce((s, x) => s + x.amount, 0) === 1100 && a.find(x => x.bucket === 'Más de 90 días')!.amount === 300 && a.find(x => x.bucket === '61 a 90 días')!.amount === 100; })());
check('Cartera: por sede y principales deudores', (() => {
  const g = groupBy(rows, r => r.branchName);
  const d = topDebtors(rows, 2);
  return g[0].name === 'Chiclayo' && g[0].overdue === 300 && g[1].name === 'Piura' && g[1].overdue === 300 && d.length === 2 && d[0].enrollmentId === 'MAT-2' && d[0].overdue === 300 && d[1].enrollmentId === 'MAT-1' && d.every(x => x.overdue > 0);
})());
check('Cartera: calendario de las próximas semanas', (() => { const c = dueCalendar(rows, TODAY, 4); return c.length === 4 && c[0].from === TODAY && c.reduce((s, w) => s + w.amount, 0) === 200 + 300; })());

console.log(failed === 0 ? '\nTodo correcto.' : `\n${failed} caso(s) fallaron.`);
process.exit(failed === 0 ? 0 : 1);
