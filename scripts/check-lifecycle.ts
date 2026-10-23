/**
 * Verificación del ciclo de vida de una matrícula: solicitud y aprobación de caída, reversa de pagos, corrección de datos
 * administrativos y ficha de la matrícula.
 * Ejecutar: npx tsx scripts/check-lifecycle.ts
 */
import type { DropRequest, Enrollment, EnrollmentChange, Guardian, MonthlySchedule, Payment, Plan, Program, PromotionGroup, Schedule, Student, Tracking } from '../src/context/DataContext';
import {
  DROP_REASONS,
  applyDropToPlan,
  enrollmentPaidUSD,
  installmentDueISO,
  paymentShareUSD,
  pendingDropOf,
  previewDrop,
  summarizeDrop,
  validateDropRequest,
  validateDropResolution,
  type DropContext,
} from '../src/utils/enrollmentDrop';
import { EDIT_LABELS, buildEnrollmentPatch, currentEditValues, diffEnrollmentEdit, validateEnrollmentEdit } from '../src/utils/enrollmentEdit';
import { buildFicha, type FichaContext } from '../src/utils/enrollmentFicha';
import { REFUND_REASON, REVERSAL_REASONS, applyReversalToPlan, reversalTargets, validateReversal } from '../src/utils/paymentReversal';
import { parseDisplayDate } from '../src/utils/tariffs';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : ` -> ${detail}`}`);
  if (!ok) failed++;
};
const TODAY = '2026-10-22';

// ================================================================ Fechas
check('Fecha de texto → ISO', parseDisplayDate('15 Abr 2024') === '2024-04-15' && parseDisplayDate('05 Ene 2024') === '2024-01-05' && parseDisplayDate('5 dic 2026') === '2026-12-05');
check('Texto inválido → null', parseDisplayDate('mañana') === null && parseDisplayDate('15 Xyz 2024') === null && parseDisplayDate(undefined) === null);
check('Vencimiento de una cuota (ISO o texto)', installmentDueISO({ dueDateISO: '2026-11-01', dueDate: 'x' }) === '2026-11-01' && installmentDueISO({ dueDate: '15 Feb 2024' }) === '2024-02-15' && installmentDueISO({}) === '');

// ================================================================ Datos
const enrollment = (id: string, over: Partial<Enrollment> = {}): Enrollment => ({
  id, date: '01 Sep 2026', dateISO: '2026-09-01', student: 'Mateo Ruiz', studentId: 'ALU-1', program: 'Kids', programId: '1', level: 'Nivel 1', status: 'Activa', plan: 'Al día',
  branchId: 'FIL-PIU', origenId: '1', origen: 'Facebook', asesorId: 'E1', asesor: 'Ana Quispe', ...over,
});
const inst = (id: string, amount: number, balance: number, due: string, status: string, payments: any[] = [], extra: Record<string, unknown> = {}) => ({
  id, name: `Cuota ${id.slice(1)}`, amount, balance, dueDate: due, dueDateISO: due, status, payments, ...extra,
});
const plan = (over: Partial<Plan> = {}): Plan => ({
  id: 'PLN-1', mat: 'MAT-1', titular: 'Juan', type: 'Plan 4 cuotas', total: 800, balance: 400, next: '-', status: 'Al día',
  installments: [
    inst('C1', 200, 0, '2026-09-01', 'Pagada', [{ id: 'P1', paymentId: 'PAG-001', date: '2026-09-01', amount: 200, receipt: 'B001-1' }]),
    inst('C2', 200, 0, '2026-10-01', 'Pagada', [{ id: 'P2', paymentId: 'PAG-002', date: '2026-10-01', amount: 200, receipt: 'B001-2' }]),
    inst('C3', 200, 200, '2026-10-15', 'Vencida'),
    inst('C4', 200, 200, '2026-11-15', 'Pendiente'),
  ], ...over,
});
const payment = (id: string, over: Partial<Payment> = {}): Payment => ({
  id, date: '01 Sep 2026', student: 'Mateo Ruiz', concept: 'Pago de Cuota 1', amount: 200, method: 'Efectivo', receipt: 'B001-1', status: 'Aprobado',
  enrollmentIds: ['MAT-1'], currency: 'USD', parts: [{ id: 'p', currency: 'USD', amount: 200, method: 'Efectivo' }], ...over,
});
const student = (over: Partial<Student> = {}): Student => ({ id: 'ALU-1', doc: '1', name: 'Mateo Ruiz', age: 9, program: 'Kids - Nivel 1', titular: 'Juan', status: 'Activo', guardianIds: ['G1'], horario: 'L-M-V 4:00 PM', ...over });
const sch = (id: string, over: Partial<Schedule> = {}): Schedule => ({
  id, student: 'Mateo Ruiz', studentId: 'ALU-1', program: 'Kids', level: 'Nivel 1', date: '2026-10-28', time: '16:00', duration: 60, responsible: 'Ana', status: 'Reservado', branchId: 'FIL-PIU', ...over,
});
const monthly = (): MonthlySchedule[] => [{
  id: 'M1', branchId: 'FIL-PIU', sede: 'Piura', mes: 'Octubre', anio: 2026, titulo: 'x', observaciones: '',
  actividades: [
    { id: 'a1', actividad: 'Maratón', fecha: '2026-10-30', horaInicio: '16:00', horaFin: '18:00', responsable: '', orden: 1, cupo: null, inscritos: ['ALU-1', 'ALU-2'] },
    { id: 'a2', actividad: 'Taller pasado', fecha: '2026-10-10', horaInicio: '16:00', horaFin: '18:00', responsable: '', orden: 2, cupo: null, inscritos: ['ALU-1'] },
  ],
}];
const ctxOf = (over: Partial<DropContext> = {}): DropContext => ({
  enrollment: enrollment('MAT-1'), plan: plan(),
  schedules: [sch('S1'), sch('S2', { date: '2026-11-04', status: 'Reprogramado' }), sch('S3', { date: '2026-10-10', status: 'Asistió' }), sch('S4', { status: 'Cancelado' }), sch('S5', { studentId: 'ALU-9', student: 'Otra' })],
  monthly: monthly(), students: [student()],
  enrollments: [enrollment('MAT-1')], payments: [payment('PAG-001'), payment('PAG-002', { receipt: 'B001-2' })], groups: [], ...over,
});

// ================================================================ Solicitud de caída
const input = { reason: DROP_REASONS[0], detail: 'No puede pagar las cuotas', effectiveDate: '2026-10-20' };
const dv = (e: Enrollment, i = input, reqs: DropRequest[] = []) => validateDropRequest(e, i, reqs, TODAY);
check('Solicitud completa → válida', dv(enrollment('MAT-1')).length === 0);
check('Solo una matrícula activa puede caer', dv(enrollment('MAT-1', { status: 'Caída' })).some(m => /no está activa/.test(m)));
check('No se duplica la solicitud pendiente (sí tras una rechazada)',
  dv(enrollment('MAT-1'), input, [{ id: 'CAI-1', enrollmentId: 'MAT-1', requestedAt: '', requestedBy: '', reason: '', detail: '', effectiveDate: '', status: 'Pendiente' }]).some(m => /pendiente/.test(m)) &&
  dv(enrollment('MAT-1'), input, [{ id: 'CAI-1', enrollmentId: 'MAT-1', requestedAt: '', requestedBy: '', reason: '', detail: '', effectiveDate: '', status: 'Rechazada' }]).length === 0);
check('Motivo del catálogo y detalle obligatorios', dv(enrollment('MAT-1'), { ...input, reason: 'x' }).length === 1 && dv(enrollment('MAT-1'), { ...input, detail: ' ' }).length === 1);
check('Fecha: obligatoria, no futura, no anterior a la matrícula', dv(enrollment('MAT-1'), { ...input, effectiveDate: '' }).length === 1 && dv(enrollment('MAT-1'), { ...input, effectiveDate: '2026-10-30' }).some(m => /futura/.test(m)) && dv(enrollment('MAT-1'), { ...input, effectiveDate: '2026-08-01' }).some(m => /anterior a la matrícula/.test(m)));
check('Matrícula antigua con fecha de texto también valida la fecha', dv(enrollment('MAT-1', { dateISO: undefined, date: '01 Sep 2026' }), { ...input, effectiveDate: '2026-08-01' }).some(m => /anterior a la matrícula/.test(m)));
const req: DropRequest = { id: 'CAI-1', enrollmentId: 'MAT-1', requestedAt: '2026-10-22T10:00:00Z', requestedBy: 'Ana', reason: 'x', detail: 'y', effectiveDate: '2026-10-20', status: 'Pendiente' };
check('Resolver: rechazar exige motivo; aprobar no; una solicitud resuelta no se vuelve a resolver',
  validateDropResolution(req, 'Rechazada', '').length === 1 && validateDropResolution(req, 'Aprobada', '').length === 0 && validateDropResolution({ ...req, status: 'Aprobada' }, 'Aprobada', '').length === 1);
check('Solicitud pendiente de una matrícula', pendingDropOf('MAT-1', [req])?.id === 'CAI-1' && !pendingDropOf('MAT-2', [req]) && !pendingDropOf('MAT-1', [{ ...req, status: 'Rechazada' }]));

// ================================================================ Efectos de la caída
const pv = previewDrop(ctxOf(), '2026-10-20');
check('Cuotas vencidas sin pagar = deuda; cuotas futuras = se anulan', pv.overdue.map(r => r.id).join() === 'C3' && pv.annulled.map(r => r.id).join() === 'C4' && pv.overdueUSD === 200 && pv.annulledUSD === 200);
check('Lo ya cobrado se informa y se conserva', pv.paidUSD === 400 && pv.planTotal === 800);
check('Asesorías futuras activas se cancelan (no las pasadas, canceladas ni de otro alumno)', pv.scheduleIds.join() === 'S1,S2');
check('Inscripciones futuras en actividades se quitan (no las pasadas)', pv.activityRemovals.length === 1 && pv.activityRemovals[0].activityId === 'a1' && pv.activityRemovals[0].studentId === 'ALU-1');
check('Sin otra matrícula activa, el alumno pasa a inactivo', pv.studentDeactivated && pv.otherActiveEnrollments.length === 0);
const withOther = previewDrop(ctxOf({ enrollments: [enrollment('MAT-1'), enrollment('MAT-2', { programId: '5', program: 'Profesional' })], schedules: [sch('S1'), sch('F1', { isFirst: true, enrollmentId: 'MAT-1', date: '2026-10-25' })] }), '2026-10-20');
check('Con otra matrícula activa: solo se cancela lo propio (su primera asesoría), no se tocan actividades ni el estado del alumno',
  withOther.scheduleIds.join() === 'F1' && withOther.activityRemovals.length === 0 && !withOther.studentDeactivated && withOther.otherActiveEnrollments.join() === 'MAT-2');
check('Una cuota que vence el mismo día de la caída cuenta como vencida', previewDrop(ctxOf(), '2026-10-15').overdue.some(r => r.id === 'C3'));
check('Plan sin cuotas (contado): nada que anular', previewDrop(ctxOf({ plan: plan({ installments: [], balance: 0 }) }), '2026-10-20').annulled.length === 0);
check('Se informan materiales entregados y grupo promocional',
  previewDrop(ctxOf({ enrollment: enrollment('MAT-1', { verifiedItems: ['a', 'b'], promotionGroupId: 'PGR-1' }), enrollments: [enrollment('MAT-1', { promotionGroupId: 'PGR-1' }), enrollment('MAT-3', { promotionGroupId: 'PGR-1' })] }), '2026-10-20').deliveredItems === 2 &&
  previewDrop(ctxOf({ enrollment: enrollment('MAT-1', { promotionGroupId: 'PGR-1' }), enrollments: [enrollment('MAT-1', { promotionGroupId: 'PGR-1' }), enrollment('MAT-3', { promotionGroupId: 'PGR-1' })] }), '2026-10-20').groupMembers === 1);

const after = applyDropToPlan(plan(), pv, false);
check('Aprobar sin condonar: cuotas futuras anuladas, la vencida sigue como deuda, plan «Caída»', after.installments.find(i => i.id === 'C4')?.status === 'Anulada' && after.installments.find(i => i.id === 'C4')?.balance === 0 && after.installments.find(i => i.id === 'C3')?.balance === 200 && after.balance === 200 && after.status === 'Caída');
const forgiven = applyDropToPlan(plan(), pv, true);
check('Condonando la deuda vencida el saldo queda en cero', forgiven.balance === 0 && forgiven.installments.find(i => i.id === 'C3')?.status === 'Anulada');
check('Lo pagado no se toca', after.installments.find(i => i.id === 'C1')?.status === 'Pagada' && after.installments.find(i => i.id === 'C1')?.payments.length === 1);
check('Resumen de efectos (sin y con condonación)', summarizeDrop(pv, false).overdueUSD === 200 && summarizeDrop(pv, false).annulledInstallments === 1 && summarizeDrop(pv, true).overdueForgiven && summarizeDrop(pv, true).annulledInstallments === 2 && summarizeDrop(pv, true).cancelledSchedules === 2);

// ================================================================ Pagos de una matrícula
const groups: PromotionGroup[] = [{ id: 'PGR-1', promotionId: 'PR1', currency: 'USD', totalPrice: 700, allocations: [{ studentKey: 'k0', enrollmentId: 'MAT-1', amount: 350 }, { studentKey: 'k1', enrollmentId: 'MAT-2', amount: 350 }], paymentId: 'PAG-009' }];
const grp = payment('PAG-009', { amount: 700, enrollmentIds: ['MAT-1', 'MAT-2'], promotionGroupId: 'PGR-1' });
check('Pago individual: todo es de la matrícula; pago grupal: su reparto', paymentShareUSD(payment('PAG-001'), 'MAT-1', []) === 200 && paymentShareUSD(grp, 'MAT-2', groups) === 350);
check('Cobrado de una matrícula: suma pagos no anulados', enrollmentPaidUSD('MAT-1', [payment('PAG-001'), payment('PAG-002'), payment('PAG-003', { status: 'Anulado' }), grp], groups) === 750);

// ================================================================ Reversa de pagos
const rctx = { payments: [payment('PAG-001'), payment('PAG-002', { receipt: 'B001-2' })], plans: [plan()], enrollments: [enrollment('MAT-1')], groups: [] as PromotionGroup[] };
const rin = { reason: REVERSAL_REASONS[0], detail: 'Se registró el monto equivocado', refunded: false, creditNote: '' };
check('Reversa completa → válida', validateReversal(rctx.payments[1], rin, rctx).length === 0);
check('Un pago ya reversado no se reversa otra vez', validateReversal({ ...rctx.payments[1], status: 'Anulado' }, rin, rctx).some(m => /ya fue reversado/.test(m)));
check('Motivo del catálogo y explicación obligatorios', validateReversal(rctx.payments[1], { ...rin, reason: '' }, rctx).length === 1 && validateReversal(rctx.payments[1], { ...rin, detail: '' }, rctx).length === 1);
check('Devolución al cliente implica que el dinero salió de caja', validateReversal(rctx.payments[1], { ...rin, reason: REFUND_REASON, refunded: false }, rctx).some(m => /salió de caja/.test(m)) && validateReversal(rctx.payments[1], { ...rin, reason: REFUND_REASON, refunded: true }, rctx).length === 0);
check('A qué matrículas afecta y cuánto repone', reversalTargets(grp, { ...rctx, groups }).map(t => `${t.enrollmentId}:${t.shareUSD}`).join() === 'MAT-1:350,MAT-2:350' && reversalTargets(rctx.payments[0], rctx)[0].planId === 'PLN-1');

const r1 = applyReversalToPlan(plan(), rctx.payments[1], 200, TODAY);
const c2 = r1.plan.installments.find(i => i.id === 'C2')!;
check('Reversar el cobro de una cuota: vuelve a tener saldo, sin el cobro, y el plan recalcula', r1.matched && c2.balance === 200 && c2.payments.length === 0 && r1.plan.balance === 600 && c2.status === 'Vencida');
check('La cuota repuesta que aún no vence queda «Pendiente»', applyReversalToPlan(plan({ installments: [inst('C1', 200, 0, '2027-01-01', 'Pagada', [{ id: 'P1', paymentId: 'PAG-001', amount: 200, receipt: 'B001-1' }])], total: 200, balance: 0 }), rctx.payments[0], 200, TODAY).plan.installments[0].status === 'Pendiente');
const partial = plan({ installments: [inst('C1', 200, 100, '2026-12-01', 'Parcial', [{ id: 'P1', paymentId: 'PAG-001', amount: 100, receipt: 'B001-1' }])], total: 200, balance: 100 });
check('Reversar un pago parcial: la cuota vuelve a su monto completo', applyReversalToPlan(partial, payment('PAG-001', { amount: 100 }), 100, TODAY).plan.installments[0].balance === 200);
check('Registros antiguos (sin vínculo con el pago) se reconocen por comprobante y monto', (() => {
  const legacy = plan({ installments: [inst('C1', 200, 0, '2026-12-01', 'Pagada', [{ id: 'P1', amount: 200, receipt: 'B001-1' }])], total: 200, balance: 0 });
  return applyReversalToPlan(legacy, payment('PAG-001'), 200, TODAY).matched;
})());
check('Si el cobro no se encuentra se avisa y el plan no cambia', (() => {
  const other = applyReversalToPlan(plan(), payment('PAG-077', { receipt: 'B999-9' }), 77, TODAY);
  return !other.matched && /No se encontró el cobro/.test(other.note ?? '') && other.plan.balance === 400;
})());
const contado = plan({ id: 'PLN-2', total: 500, balance: 0, status: 'Completado', installments: [] });
const rc = applyReversalToPlan(contado, payment('PAG-010', { amount: 500 }), 500, TODAY);
check('Matrícula de contado: se crea el «Pago único» pendiente para poder cobrar de nuevo', rc.matched && rc.plan.installments.length === 1 && rc.plan.installments[0].name === 'Pago único' && rc.plan.installments[0].balance === 500 && rc.plan.balance === 500 && rc.plan.status === 'Al día');
check('Un plan «Caída» sigue «Caída» tras reversar', applyReversalToPlan(plan({ status: 'Caída' }), rctx.payments[1], 200, TODAY).plan.status === 'Caída');
check('El plan completado vuelve a «Al día» (o «Atrasado» si hay vencidas)', applyReversalToPlan(plan({ status: 'Completado', total: 200, balance: 0, installments: [inst('C1', 200, 0, '2027-01-01', 'Pagada', [{ id: 'P1', paymentId: 'PAG-001', amount: 200, receipt: 'B001-1' }])] }), rctx.payments[0], 200, TODAY).plan.status === 'Al día' && r1.plan.status === 'Atrasado');
// Contado en 2 partes (monto variable)
const c2p = (): Plan => plan({
  id: 'PLN-3', mat: 'MAT-3', total: 500, balance: 200, installments: [
    inst('C1', 300, 0, '2026-09-01', 'Pagada', [{ id: 'P1', paymentId: 'PAG-020', amount: 300, receipt: 'B001-20' }], { variable: true }),
    inst('C2', 200, 200, '2026-12-01', 'Pendiente', [], { variable: true }),
  ],
});
const pay20 = payment('PAG-020', { amount: 300, enrollmentIds: ['MAT-3'], receipt: 'B001-20' });
const pay21 = payment('PAG-021', { amount: 200, enrollmentIds: ['MAT-3'], receipt: 'B001-21' });
const c2pCtx = { payments: [pay20, pay21], plans: [c2p()], enrollments: [enrollment('MAT-3')], groups: [] as PromotionGroup[] };
check('Contado en 2 partes: se reversa del pago más reciente al más antiguo', validateReversal(pay20, rin, c2pCtx).some(m => /pago posterior \(PAG-021\)/.test(m)) && validateReversal(pay21, rin, c2pCtx).length === 0);
const c2pBack = applyReversalToPlan(c2p(), pay20, 300, TODAY).plan;
check('Contado en 2 partes: reversar la parte 1 repone el esquema inicial (parte 1 con el total, parte 2 en 0)', c2pBack.installments[0].amount === 500 && c2pBack.installments[0].balance === 500 && c2pBack.installments[1].amount === 0 && c2pBack.balance === 500);

// ================================================================ Corrección de datos
const names = { origin: (id: string) => ({ '1': 'Facebook', '2': 'Referido' } as Record<string, string>)[id] ?? '', advisor: (id: string) => ({ E1: 'Ana Quispe', E2: 'Luis Mamani' } as Record<string, string>)[id] ?? '' };
const before = currentEditValues(enrollment('MAT-1', { observation: 'Nota' }), student());
check('Valores actuales editables', before.observation === 'Nota' && before.originId === '1' && before.advisorId === 'E1' && before.schedule === 'L-M-V 4:00 PM');
check('Solo cuatro datos administrativos son corregibles', Object.keys(EDIT_LABELS).join() === 'observation,originId,advisorId,schedule');
const afterEdit = { ...before, originId: '2', schedule: 'M-J 5:00 PM' };
const diff = diffEnrollmentEdit(before, afterEdit, names);
check('El historial guarda qué había y qué quedó (con nombres legibles)', diff.length === 2 && diff[0].from === 'Facebook' && diff[0].to === 'Referido' && diff[1].label === 'Horario de clases');
check('Sin cambios no se guarda', validateEnrollmentEdit(enrollment('MAT-1'), before, [], 'x').some(m => /No hay cambios/.test(m)));
check('Con cambios el motivo es obligatorio', validateEnrollmentEdit(enrollment('MAT-1'), afterEdit, diff, '').some(m => /motivo/.test(m)) && validateEnrollmentEdit(enrollment('MAT-1'), afterEdit, diff, 'Corrección de origen').length === 0);
check('Solo se corrige una matrícula activa; origen y responsable son obligatorios', validateEnrollmentEdit(enrollment('MAT-1', { status: 'Caída' }), afterEdit, diff, 'Motivo válido').length === 1 && validateEnrollmentEdit(enrollment('MAT-1'), { ...afterEdit, originId: '' }, diff, 'Motivo válido').some(m => /origen/.test(m)));
check('La corrección actualiza los nombres junto con los ids', (() => { const p = buildEnrollmentPatch(afterEdit, names); return p.origenId === '2' && p.origen === 'Referido' && p.asesor === 'Ana Quispe'; })());

// ================================================================ Ficha de la matrícula
const g: Guardian = { id: 'G1', name: 'Juan Ruiz', doc: '4', phone: '9', email: '', students: 1, enrollments: 1, balance: '$0' };
const prog: Program = { id: '1', code: 'K', name: 'Kids', hasLevels: true, durationBase: 3, warranty: 3, allBranches: true, status: 'Activo' };
const fctx = (over: Partial<FichaContext> = {}): FichaContext => ({
  enrollments: [enrollment('MAT-1', { createdAt: '2026-09-01T10:00:00Z', createdBy: 'Ana', verificationDate: '2026-09-05', verificationStatus: 'Verificado Completo', verifier: 'Luis' })],
  students: [student()], guardians: [g], programs: [prog], plans: [plan()],
  payments: [payment('PAG-001'), payment('PAG-002', { date: '01 Oct 2026', receipt: 'B001-2' }), payment('PAG-003', { status: 'Anulado', date: '15 Oct 2026', reversal: { at: '2026-10-16T09:00:00Z', by: 'Admin', reason: 'Pago duplicado', detail: 'x', refunded: false } })],
  groups: [], schedules: [sch('F1', { isFirst: true, enrollmentId: 'MAT-1', date: '2026-09-08', status: 'Asistió' }), sch('S1'), sch('S2', { status: 'Faltó', date: '2026-10-01' })],
  trackings: [{ id: 't', studentId: 'ALU-1', scheduleId: 'F1', date: '2026-09-08', status: 'Asistió', metrics: {}, observations: '' } as Tracking],
  dropRequests: [], changes: [], today: TODAY, ...over,
});
const f = buildFicha(fctx(), 'MAT-1')!;
check('La ficha reúne alumno, titulares, programa y plan', f.student?.id === 'ALU-1' && f.guardians[0].name === 'Juan Ruiz' && f.program?.name === 'Kids' && f.plan?.id === 'PLN-1');
check('Cobrado (sin el anulado), total y saldo', f.paidUSD === 400 && f.totalUSD === 800 && f.balanceUSD === 400 && f.payments.length === 3 && f.payments.filter(p => p.voided).length === 1);
check('Primera asesoría, asesorías y sesiones registradas', f.firstSession?.id === 'F1' && f.sessions.attended === 1 && f.sessions.missed === 1 && f.sessions.upcoming.length === 1 && f.sessions.recorded === 1);
check('Vigencia desde la primera asesoría', f.validity.start === '2026-09-08' && f.validity.state === 'vigente' && f.validity.baseEnd === '2026-12-07');
check('Línea de tiempo ordenada: registro, pagos, reversa, primera asesoría, verificación', f.events.map(e => e.title).includes('Matrícula registrada') && f.events.some(e => /reversado/.test(e.title)) && f.events.some(e => /Verificación/.test(e.title)) && f.events.some(e => e.title === 'Primera asesoría') && f.events[0].date >= f.events[f.events.length - 1].date);
const fd = buildFicha(fctx({ dropRequests: [{ ...req, status: 'Aprobada', resolvedAt: '2026-10-22T11:00:00Z', resolvedBy: 'Admin' }, { ...req, id: 'CAI-0', requestedAt: '2026-09-30T10:00:00Z', status: 'Rechazada' }], changes: [{ id: 'c1', enrollmentId: 'MAT-1', at: '2026-10-05T10:00:00Z', by: 'Ana', field: 'originId', label: 'Origen del contacto', from: 'Facebook', to: 'Referido', reason: 'Error' } as EnrollmentChange] }), 'MAT-1')!;
check('La caída y las correcciones aparecen en el historial', fd.drop?.id === 'CAI-1' && !fd.pendingDrop && fd.events.some(e => e.title === 'Caída aprobada') && fd.events.some(e => /Corrección: Origen/.test(e.title)) && fd.changes.length === 1);
check('Solicitud pendiente a la vista', buildFicha(fctx({ dropRequests: [req] }), 'MAT-1')!.pendingDrop?.id === 'CAI-1');
check('Matrícula de grupo: sus compañeros y su parte del pago', (() => {
  const gf = buildFicha(fctx({ enrollments: [enrollment('MAT-1', { promotionGroupId: 'PGR-1' }), enrollment('MAT-2', { promotionGroupId: 'PGR-1', student: 'Otro', studentId: 'ALU-2' })], payments: [grp], groups, plans: [] }), 'MAT-1')!;
  return gf.group?.members.length === 2 && gf.paidUSD === 350 && gf.totalUSD === 0 && gf.payments[0].shareUSD === 350;
})());
check('Matrícula inexistente → sin ficha', buildFicha(fctx(), 'MAT-99') === undefined);

console.log(failed === 0 ? '\nTodo correcto.' : `\n${failed} caso(s) fallaron.`);
process.exit(failed === 0 ? 0 : 1);
