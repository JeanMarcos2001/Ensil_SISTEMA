/**
 * Verificación de las reglas de Personal, Caja, Caja chica, estado de cuenta, refinanciación, carga masiva y Dashboard.
 * Ejecutar: npx tsx scripts/check-operations.ts
 */
import type { Assignment, Branch, CashMovement, Contract, DropRequest, Enrollment, Guardian, Payment, PettyCashMovement, Plan, Schedule, Staff, StockItem, Student } from '../src/context/DataContext';
import {
  closeAllOf, closeAssignmentIn, closeImpact, emptyAssignmentForm, futureSessionsOf, mainToDemote, saveAssignment, validateAssignmentClose, validateAssignmentForm, willBeMain,
} from '../src/utils/assignments';
import { inactivationCheck, validateInactivation, validateReactivation } from '../src/utils/staffStatus';
import { buildContractPatch, contractToForm, diffContract, validateContractEdit, validateContractForm } from '../src/utils/payroll';
import {
  applyCashReversal, balanceAfterReversal, buildDeposit, cashBalance, cashReversalCheck, eligibleForDeposit, movementEnrollmentIds, movementOrigin, validateCashReversal, validateDeposit,
} from '../src/utils/cash';
import { emptyPettyInput, pettyBalance, pettyMonthTotals, validatePettyInput, validatePettyReversal } from '../src/utils/pettyCash';
import { buildStatement, guardianBalance } from '../src/utils/guardianStatement';
import { applyRefinance, validateRefinance } from '../src/utils/refinance';
import { BULK_HEADERS, buildBookBatch, parseCsv } from '../src/utils/itemImport';
import { csvFileName, toCsv } from '../src/utils/exportCsv';
import { tableDocumentHtml } from '../src/utils/printTable';
import { branchFigures, dashboardKpis, dueText, initials, recentActivity, relativeTime, upcomingDues } from '../src/utils/dashboard';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : ` -> ${detail}`}`);
  if (!ok) failed++;
};
const TODAY = '2026-10-23';

// ================================================================ Datos
const staff = (id: string, over: Partial<Staff> = {}): Staff => ({
  id, code: `TRB-${id}`, docType: 'DNI', docNumber: `1000000${id}`, names: 'Ana', lastNameP: 'Quispe', lastNameM: 'Rojas', birthDate: '1990-01-01', age: 36, phone: '999999999', status: 'Activo', ...over,
});
const members = [staff('1'), staff('2', { names: 'Luis', lastNameP: 'Pérez' }), staff('3', { names: 'Eva', lastNameP: 'Soto', status: 'Inactivo' })];
const branches: Branch[] = [
  { id: 'FIL-PIU', name: 'Piura', company: 'X', status: 'Activo', address: '', department: '', province: '', district: '', phoneFixed: '', phoneMobile: '' } as Branch,
  { id: 'FIL-CHI', name: 'Chiclayo', company: 'X', status: 'Activo', address: '', department: '', province: '', district: '', phoneFixed: '', phoneMobile: '' } as Branch,
];
const asg = (id: string, over: Partial<Assignment> = {}): Assignment => ({
  id, staffId: '1', branch: 'Piura', area: 'Psicopedagogía', role: 'Psicóloga', systemRole: 'Psicopedagogía', startDate: '2026-01-01', isMain: true, status: 'Activa', ...over,
});
const form = (over = {}) => ({ ...emptyAssignmentForm('2026-10-01'), staffId: '2', branch: 'Chiclayo', area: 'Logística', role: 'Encargado', systemRole: 'Administración', ...over });

// ================================================================ Asignaciones
const base = [asg('ASG-001'), asg('ASG-002', { staffId: '2', branch: 'Chiclayo', area: 'Administración', isMain: true })];
check('Asignación válida', Object.keys(validateAssignmentForm(form(), base, members, branches, TODAY)).length === 0);
check('Trabajador inactivo no recibe asignaciones', !!validateAssignmentForm(form({ staffId: '3' }), base, members, branches, TODAY).staffId);
check('Sede, área, cargo, rol y fecha obligatorios', (() => {
  const e = validateAssignmentForm(form({ branch: '', area: '', role: 'x', systemRole: '', startDate: '' }), base, members, branches, TODAY);
  return !!e.branch && !!e.area && !!e.role && !!e.systemRole && !!e.startDate;
})());
check('Fin posterior al inicio y no pasado', !!validateAssignmentForm(form({ endDate: '2026-09-01' }), base, members, branches, TODAY).endDate && !!validateAssignmentForm(form({ startDate: '2026-01-01', endDate: '2026-06-01' }), base, members, branches, TODAY).endDate && !validateAssignmentForm(form({ endDate: '2027-01-01' }), base, members, branches, TODAY).endDate);
check('No repite sede + área activas', !!validateAssignmentForm(form({ staffId: '1', branch: 'Piura', area: 'Psicopedagogía' }), base, members, branches, TODAY).area);
check('Editarse a sí misma no cuenta como repetida', !validateAssignmentForm(form({ staffId: '1', branch: 'Piura', area: 'Psicopedagogía', isMain: true }), base, members, branches, TODAY, 'ASG-001').area);
check('La primera asignación es principal aunque no se marque', willBeMain({ staffId: '9', isMain: false }, base) && !willBeMain({ staffId: '1', isMain: false }, base));
check('La nueva principal desplaza a la anterior', (() => {
  const r = saveAssignment(base, form({ staffId: '1', branch: 'Chiclayo', area: 'Ventas', isMain: true }));
  return r.saved.isMain && r.assignments.find(a => a.id === 'ASG-001')!.isMain === false && r.saved.id === 'ASG-003' && mainToDemote({ staffId: '1', isMain: true }, base)?.id === 'ASG-001';
})());
check('La principal no se desmarca si hay otras activas', (() => {
  const two = [...base, asg('ASG-003', { isMain: false, branch: 'Chiclayo', area: 'Ventas' })];
  return !!validateAssignmentForm({ ...form({ staffId: '1', branch: 'Piura', area: 'Psicopedagogía' }), isMain: false }, two, members, branches, TODAY, 'ASG-001').isMain;
})());
check('Editar conserva id y estado', (() => {
  const r = saveAssignment(base, form({ staffId: '1', branch: 'Piura', area: 'Psicopedagogía', role: 'Psicóloga Senior', isMain: true }), 'ASG-001');
  return r.saved.id === 'ASG-001' && r.saved.role === 'Psicóloga Senior' && r.assignments.length === 2 && r.saved.status === 'Activa';
})());

const sessions: Schedule[] = [
  { id: 'S1', student: 'X', program: 'Kids', level: 'N1', date: '2026-10-30', time: '16:00', duration: 60, responsible: 'Ana Quispe', status: 'Reservado' },
  { id: 'S2', student: 'Y', program: 'Kids', level: 'N1', date: '2026-10-01', time: '16:00', duration: 60, responsible: 'Ana Quispe', status: 'Reservado' },
  { id: 'S3', student: 'Z', program: 'Kids', level: 'N1', date: '2026-10-30', time: '17:00', duration: 60, responsible: 'Luis Pérez', status: 'Cancelado' },
];
check('Asesorías futuras a su nombre', futureSessionsOf(members[0], sessions, TODAY).length === 1);
check('Cerrar: fecha no futura ni anterior al inicio y motivo', validateAssignmentClose(base[0], '2026-12-01', 'Motivo válido', TODAY).length > 0 && validateAssignmentClose(base[0], '2025-12-01', 'Motivo válido', TODAY).length > 0 && validateAssignmentClose(base[0], '2026-10-20', 'x', TODAY).length > 0 && validateAssignmentClose(base[0], '2026-10-20', 'Cambio de área', TODAY).length === 0);
check('No se cierra la última de Psicopedagogía con asesorías futuras', closeImpact(base[0], base, members[0], sessions, TODAY).blocked === true && closeImpact(base[1], base, members[1], sessions, TODAY).blocked === false);
check('Cerrar la principal asciende a la activa más antigua', (() => {
  const three = [asg('A', { isMain: true, startDate: '2026-05-01' }), asg('B', { isMain: false, branch: 'Chiclayo', area: 'Ventas', startDate: '2026-03-01' }), asg('C', { isMain: false, branch: 'Chiclayo', area: 'Logística', startDate: '2026-04-01' })];
  const r = closeAssignmentIn(three, 'A', '2026-10-20', 'Cambio de área', 'Admin');
  return r.promotedId === 'B' && r.assignments.find(a => a.id === 'A')!.status === 'Cerrada' && r.assignments.find(a => a.id === 'B')!.isMain && !r.assignments.find(a => a.id === 'C')!.isMain;
})());
check('Cerrar todas al inactivar', closeAllOf(base, '1', '2026-10-20', 'Renuncia', 'Admin').filter(a => a.status === 'Cerrada').length === 1);

// ================================================================ Baja del personal
const contract = (id: string, over: Partial<Contract> = {}): Contract => ({
  id, staffId: '1', type: 'Indeterminado', startDate: '2026-01-01', status: 'Vigente', shift: 'Full time', pensionSystem: 'ONP', grossSalary: 2000, contribution: 260, netSalary: 1740, ...over,
});
const ictx = { contracts: [contract('CON-001')], assignments: base, schedules: sessions, today: TODAY };
check('No se inactiva con contrato vigente ni asesorías futuras', validateInactivation(members[0], 'Renuncia', 'Se retira', '2026-10-20', ictx).length === 2 && inactivationCheck(members[0], ictx).blocked);
check('Se inactiva sin obstáculos', (() => {
  const free = { ...ictx, contracts: [contract('CON-001', { status: 'Cesado' })], schedules: [] };
  return validateInactivation(members[0], 'Renuncia', 'Se retira de la institución', '2026-10-20', free).length === 0 && inactivationCheck(members[0], free).assignmentsToClose.length === 1;
})());
check('Baja: motivo, explicación y fecha', validateInactivation(members[1], 'xx', '', '', { ...ictx, schedules: [], contracts: [] }).length >= 3);
check('Un contrato vencido por fecha no impide la baja', validateInactivation(members[0], 'Fin de contrato', 'Terminó su plazo', '2026-10-20', { ...ictx, schedules: [], contracts: [contract('CON-001', { type: 'Plazo Fijo', endDate: '2026-09-01' })] }).length === 0);
check('Reactivar: solo inactivos y con motivo', validateReactivation(members[2], 'Reingreso').length === 0 && validateReactivation(members[0], 'Reingreso').length > 0 && validateReactivation(members[2], '').length > 0);

// ================================================================ Edición de contratos
const c1 = contract('CON-001');
const cform = contractToForm(c1);
check('Contrato → formulario y vuelta sin cambios', diffContract(c1, buildContractPatch(cform)).length === 0);
check('Un cambio de sueldo se detecta con su etiqueta', (() => {
  const d = diffContract(c1, buildContractPatch({ ...cform, grossSalary: '2500' }));
  return d.length === 1 && d[0].label === 'Sueldo bruto' && d[0].to.includes('2,500');
})());
check('El neto se recalcula al editar', buildContractPatch({ ...cform, grossSalary: '2500' }).netSalary === 2175);
check('Editar exige cambios, motivo y contrato vigente', validateContractEdit(c1, [], 'Motivo').length === 1 && validateContractEdit(c1, [{ label: 'a', from: 'b', to: 'c' }], '').length === 1 && validateContractEdit(contract('X', { status: 'Cesado' }), [{ label: 'a', from: 'b', to: 'c' }], 'Motivo válido').length === 1 && validateContractEdit(c1, [{ label: 'a', from: 'b', to: 'c' }], 'Ajuste acordado').length === 0);
check('Editar su propio contrato no choca con «un solo vigente»', !validateContractForm(cform, [c1], members, TODAY, 'CON-001').staffId && !!validateContractForm(cform, [c1], members, TODAY).staffId);

// ================================================================ Caja
const mv = (id: string, over: Partial<CashMovement> = {}): CashMovement => ({
  id, date: '2026-10-22T15:00:00.000Z', kind: 'Ingreso', concept: 'Ingreso', reference: 'ref', currency: 'PEN', amount: 100, amountUSD: 27, method: 'Efectivo', user: 'Admin', status: 'Aplicado', ...over,
});
const plans: Plan[] = [{ id: 'PLN-001', mat: 'MAT-2024-001', titular: 'Juan', type: 'Plan 6 Cuotas', total: 1200, balance: 800, next: '15 Abr 2024', status: 'Al día', installments: [] }];
const cash: CashMovement[] = [
  mv('CJ-1', { paymentId: 'PAG-1', enrollmentIds: ['MAT-1'], concept: 'Cobro' }),
  mv('CJ-2', { kind: 'Egreso', amount: 30, concept: 'Pago a proveedor', reference: 'Limpieza (Factura F1)' }),
  mv('CJ-3', { kind: 'Egreso', paymentId: 'PAG-9', concept: 'Devolución de pago' }),
  mv('CJ-4', { concept: 'Venta de artículo', sale: { itemId: 'ITM-1', branchId: 'FIL-PIU', qty: 2 }, amount: 120 }),
  mv('CJ-5', { concept: 'Venta de artículo', amount: 60 }),
  mv('CJ-6', { amount: 250 }),
  mv('CJ-7', { method: 'Transferencia', amount: 500 }),
  mv('CJ-8', { currency: 'USD', amount: 50 }),
];
check('Origen del movimiento', movementOrigin(cash[0]) === 'payment' && movementOrigin(cash[2]) === 'refund' && movementOrigin(cash[3]) === 'sale' && movementOrigin(cash[4]) === 'sale' && movementOrigin(cash[1]) === 'manual');
check('Matrículas del movimiento: las propias o las de la referencia', movementEnrollmentIds(cash[0], plans).join() === 'MAT-1' && movementEnrollmentIds(mv('x', { reference: 'MAT-2024-002 / María' }), plans).join() === 'MAT-2024-002' && movementEnrollmentIds(mv('y', { reference: 'PLN-001 / Juan' }), plans).join() === 'MAT-2024-001' && movementEnrollmentIds(cash[1], plans).length === 0);
check('Lo nacido de un pago se reversa desde el pago', (() => { const c = cashReversalCheck(cash[0], cash); return !c.allowed && c.paymentId === 'PAG-1'; })() && !cashReversalCheck(cash[2], cash).allowed);
check('Egreso manual y venta se pueden reversar', cashReversalCheck(cash[1], cash).allowed && cashReversalCheck(cash[3], cash).restock?.qty === 2 && cashReversalCheck(cash[4], cash).manualStock === true);
check('Reversa: motivo y explicación obligatorios', validateCashReversal(cash[1], '', '', cash).length === 2 && validateCashReversal(cash[1], 'Movimiento duplicado', 'Se registró dos veces', cash).length === 0);
check('Un reversado no se reversa otra vez', (() => { const r = applyCashReversal(cash, 'CJ-1', { reason: 'x', detail: 'y', at: 'now', by: 'A' }); return !cashReversalCheck(r.find(m => m.id === 'CJ-1')!, r).allowed; })());
check('Saldo: solo cuenta lo aplicado y su efecto al reversar', cashBalance(cash, 'PEN') === 900 && balanceAfterReversal(cash[1], cash) === cashBalance(cash, 'PEN') + 30);
check('Reversar marca el movimiento y deja constancia', (() => { const r = applyCashReversal(cash, 'CJ-2', { reason: 'Error', detail: 'Monto mal', at: 'now', by: 'Admin' }); const m = r.find(x => x.id === 'CJ-2')!; return m.status === 'Reversado' && m.reversal?.by === 'Admin' && cashBalance(r, 'PEN') === cashBalance(cash, 'PEN') + 30; })());
check('Solo el efectivo del día va al depósito', eligibleForDeposit(cash, 'PEN').map(m => m.id).sort().join() === 'CJ-1,CJ-4,CJ-5,CJ-6'.split(',').sort().join() && eligibleForDeposit(cash, 'USD').length === 1);
check('Depósito: cuenta, selección, fecha y saldo', (() => {
  const ok = { date: TODAY, bank: 'BCP - Cuenta Corriente PEN', currency: 'PEN' as const, movementIds: ['CJ-6'] };
  return validateDeposit(ok, cash, TODAY).length === 0 && validateDeposit({ ...ok, bank: '' }, cash, TODAY).length > 0 && validateDeposit({ ...ok, movementIds: [] }, cash, TODAY).length > 0
    && validateDeposit({ ...ok, date: '2026-12-01' }, cash, TODAY).length > 0 && validateDeposit({ ...ok, date: '2026-10-01' }, cash, TODAY).length > 0 && validateDeposit({ ...ok, movementIds: ['CJ-7'] }, cash, TODAY).length > 0;
})());
check('El lote suma, nombra y marca los ingresos', (() => {
  const b = buildDeposit({ date: TODAY, bank: 'BCP - Cuenta Corriente PEN', currency: 'PEN', movementIds: ['CJ-5', 'CJ-6'] }, cash, 'Admin', '2026-10-23T12:00:00.000Z');
  return b.code === 'DEP-001' && b.egress.amount === 310 && b.egress.kind === 'Egreso' && b.egress.deposit?.movementIds.length === 2 && b.selected.length === 2;
})());
check('Un ingreso depositado no se reversa; reversar el lote lo libera', (() => {
  const b = buildDeposit({ date: TODAY, bank: 'BCP - Cuenta Corriente PEN', currency: 'PEN', movementIds: ['CJ-6'] }, cash, 'Admin', '2026-10-23T12:00:00.000Z');
  const egress = { ...b.egress, id: 'CJ-D', user: 'Admin', status: 'Aplicado' as const };
  const after = [egress, ...cash.map(m => (m.id === 'CJ-6' ? { ...m, depositedIn: b.code } : m))];
  const income = after.find(m => m.id === 'CJ-6')!;
  const rev = applyCashReversal(after, 'CJ-D', { reason: 'Error', detail: 'Lote mal armado', at: 'now', by: 'Admin' });
  return !cashReversalCheck(income, after).allowed && cashReversalCheck(egress, after).releases.length === 1 && rev.find(m => m.id === 'CJ-6')!.depositedIn === undefined && eligibleForDeposit(rev, 'PEN').some(m => m.id === 'CJ-6');
})());

// ================================================================ Caja chica
const pm = (id: string, over: Partial<PettyCashMovement> = {}): PettyCashMovement => ({ id, date: '2026-10-20T17:00:00.000Z', kind: 'Ingreso', category: 'Reposición de fondo', concept: 'Reposición', amount: 1000, method: 'Efectivo', user: 'Admin', status: 'Aplicado', ...over });
const petty = [pm('CCH-1'), pm('CCH-2', { kind: 'Egreso', category: 'Movilidad', concept: 'Taxi', amount: 25 }), pm('CCH-3', { kind: 'Egreso', category: 'Limpieza', concept: 'Jabón', amount: 120, date: '2026-09-28T17:00:00.000Z' }), pm('CCH-4', { kind: 'Egreso', amount: 50, status: 'Reversado' })];
check('Saldo de caja chica: solo lo aplicado', pettyBalance(petty) === 855);
check('Totales del mes actual', (() => { const t = pettyMonthTotals(petty, TODAY); return t.income === 1000 && t.expense === 25; })());
const pin = (over = {}) => ({ ...emptyPettyInput('Egreso', TODAY), category: 'Movilidad', concept: 'Taxi a notaría', amount: '25', ...over });
check('Movimiento válido', Object.keys(validatePettyInput(pin(), petty, TODAY)).length === 0);
check('Campos obligatorios y fecha no futura', (() => { const e = validatePettyInput(pin({ category: '', concept: '', amount: '', date: '2026-12-01' }), petty, TODAY); return !!e.category && !!e.concept && !!e.amount && !!e.date; })());
check('La categoría debe ser del tipo', !!validatePettyInput(pin({ category: 'Reposición de fondo' }), petty, TODAY).category && !validatePettyInput(pin({ kind: 'Ingreso', category: 'Reposición de fondo' }), petty, TODAY).category);
check('El egreso no supera el saldo', !!validatePettyInput(pin({ amount: '900' }), petty, TODAY).amount && !validatePettyInput(pin({ amount: '855' }), petty, TODAY).amount);
check('Reversar un ingreso ya gastado deja el saldo negativo → no', validatePettyReversal(petty[0], 'Movimiento duplicado', 'Duplicado en el registro', petty).length === 1 && validatePettyReversal(pm('CCH-5', { amount: 500 }), 'Movimiento duplicado', 'Duplicado en el registro', [...petty, pm('CCH-5', { amount: 500 })]).length === 0);
check('Reversar un egreso siempre se puede (con motivo)', validatePettyReversal(petty[1], 'Gasto no realizado', 'No se hizo el viaje', petty).length === 0 && validatePettyReversal(petty[3], 'Gasto no realizado', 'No se hizo el viaje', petty).length === 1);

// ================================================================ Estado de cuenta
const guardian = { id: 'G1', name: 'Juan Ruiz', doc: '1', phone: '9', email: 'a@b.c', students: 0, enrollments: 0, balance: '$0' } as Guardian;
const stu: Student[] = [{ id: 'ALU-1', doc: '1', name: 'Mateo Ruiz', age: 9, program: 'Kids', titular: 'Juan Ruiz', status: 'Activo', guardianIds: ['G1'] }, { id: 'ALU-2', doc: '2', name: 'Otro', age: 9, program: 'Kids', titular: 'Otro', status: 'Activo', guardianIds: ['G9'] }];
const enr = (id: string, over: Partial<Enrollment> = {}): Enrollment => ({ id, date: '01 Sep 2026', student: 'Mateo Ruiz', studentId: 'ALU-1', program: 'Kids', level: 'Nivel 1', status: 'Activa', plan: 'Al día', ...over });
const inst = (id: string, amount: number, balance: number, due: string, status: string, payments: any[] = []) => ({ id, name: `Cuota ${id.slice(1)}`, amount, balance, dueDate: due, dueDateISO: due, status, payments });
const sPlan: Plan = {
  id: 'PLN-1', mat: 'MAT-1', titular: 'Juan Ruiz', type: 'Plan 4', total: 800, balance: 400, next: '-', status: 'Atrasado',
  installments: [inst('C1', 200, 0, '2026-09-01', 'Pagada', [{ id: 'P', amount: 200 }]), inst('C2', 200, 0, '2026-10-01', 'Pagada', [{ id: 'P', amount: 200 }]), inst('C3', 200, 200, '2026-10-15', 'Vencida'), inst('C4', 200, 200, '2026-11-15', 'Pendiente')],
};
const pays: Payment[] = [
  { id: 'PAG-1', date: '2026-09-01', student: 'Mateo Ruiz', concept: 'C1', amount: 200, method: 'Efectivo', receipt: 'B1', status: 'Aprobado', enrollmentIds: ['MAT-1'] },
  { id: 'PAG-2', date: '2026-10-01', student: 'Mateo Ruiz', concept: 'C2', amount: 200, method: 'Efectivo', receipt: 'B2', status: 'Aprobado', enrollmentIds: ['MAT-1'] },
  { id: 'PAG-3', date: '2026-10-02', student: 'Mateo Ruiz', concept: 'Error', amount: 50, method: 'Efectivo', receipt: 'B3', status: 'Anulado', enrollmentIds: ['MAT-1'] },
];
const sctx = { guardians: [guardian], students: stu, enrollments: [enr('MAT-1'), enr('MAT-2', { student: 'Otro', studentId: 'ALU-2' })], plans: [sPlan], payments: pays, groups: [] };
const st = buildStatement(sctx, 'G1', TODAY)!;
check('Estado de cuenta: solo las matrículas de sus alumnos', st.enrollments.length === 1 && st.students.length === 1 && st.enrollments[0].enrollment.id === 'MAT-1');
check('Total, cobrado, saldo y deuda vencida', st.totals.totalUSD === 800 && st.totals.paidUSD === 400 && st.totals.balanceUSD === 400 && st.totals.overdueUSD === 200);
check('Cuotas pendientes: la vencida primero', st.enrollments[0].pending.map(p => p.name).join() === 'Cuota 3,Cuota 4' && st.enrollments[0].pending[0].overdue && st.enrollments[0].next?.name === 'Cuota 3');
check('Los pagos anulados se muestran pero no suman', st.payments.length === 3 && st.payments.filter(p => p.voided).length === 1 && st.totals.paidUSD === 400);
check('Titular sin matrículas: todo en cero', (() => { const e = buildStatement({ ...sctx, enrollments: [] }, 'G1', TODAY)!; return e.enrollments.length === 0 && e.totals.balanceUSD === 0; })());
check('Titular inexistente → sin estado', buildStatement(sctx, 'G404', TODAY) === undefined);
check('Saldo del titular para la lista', guardianBalance(sctx, 'G1', TODAY).balanceUSD === 400 && guardianBalance(sctx, 'G1', TODAY).enrollments === 1);
check('Caída: lo anulado no es deuda', (() => {
  const dropped = { ...sPlan, status: 'Caída', balance: 200, installments: [...sPlan.installments.slice(0, 3), { ...sPlan.installments[3], status: 'Anulada', balance: 0 }] };
  const d = buildStatement({ ...sctx, plans: [dropped], enrollments: [enr('MAT-1', { status: 'Caída' })] }, 'G1', TODAY)!;
  return d.totals.balanceUSD === 200 && d.totals.annulledUSD === 200 && d.totals.paidUSD === 400;
})());

// ================================================================ Refinanciación
const rin = { name: 'Cuota 3 (refinanciada)', dueDate: '2026-11-30', reason: 'Dificultad económica' };
check('Refinanciar: datos válidos', validateRefinance(sPlan, 'C3', rin, TODAY).length === 0);
check('Refinanciar: nombre, fecha futura y motivo', validateRefinance(sPlan, 'C3', { name: '', dueDate: '2026-01-01', reason: '' }, TODAY).length === 3);
check('No se refinancia una cuota pagada, anulada o ya refinanciada', validateRefinance(sPlan, 'C1', rin, TODAY).length > 0 && validateRefinance({ ...sPlan, installments: sPlan.installments.map(i => (i.id === 'C4' ? { ...i, status: 'Anulada', balance: 0 } : i)) }, 'C4', rin, TODAY).length > 0);
check('No se refinancia en un plan caído ni una cuota variable', validateRefinance({ ...sPlan, status: 'Caída' }, 'C3', rin, TODAY).length > 0 && validateRefinance({ ...sPlan, installments: sPlan.installments.map(i => (i.id === 'C3' ? { ...i, variable: true } : i)) }, 'C3', rin, TODAY).length > 0);
check('El saldo se traslada sin duplicarse', (() => {
  const r = applyRefinance(sPlan, 'C3', rin, TODAY, '2026-10-23T10:00:00Z');
  const old = r.installments.find(i => i.id === 'C3')!;
  const created = r.installments.find(i => i.refinancedFrom === 'C3')!;
  return old.status === 'Refinanciada' && old.balance === 0 && created.amount === 200 && created.balance === 200 && created.dueDateISO === '2026-11-30' && r.balance === 400 && r.installments.length === 5;
})());
check('Tras refinanciar, ya no está atrasado y la próxima cuota es la más cercana', (() => {
  const r = applyRefinance(sPlan, 'C3', rin, TODAY, 'x');
  return r.status === 'Al día' && r.next === '2026-11-15';
})());
check('Si queda otra vencida, sigue atrasado', (() => {
  const two = { ...sPlan, installments: sPlan.installments.map(i => (i.id === 'C4' ? { ...i, dueDate: '2026-10-20', dueDateISO: '2026-10-20', status: 'Vencida' } : i)) };
  return applyRefinance(two, 'C3', rin, TODAY, 'x').status === 'Atrasado';
})());

// ================================================================ Carga masiva de libros
check('CSV: comas, comillas y punto y coma', parseCsv('a,b\r\n"x, y",2\r\n').length === 2 && parseCsv('a;b\nx;"y;z"').pop()?.[1] === 'y;z' && parseCsv('﻿a,b\n1,2')[0][0] === 'a');
const header = BULK_HEADERS.join(',');
const rowsOf = (body: string) => parseCsv(`${header}\n${body}`);
check('Lote válido: libros, precios y vendible', (() => {
  const r = buildBookBatch(rowsOf('lib-1,Libro Uno,Activo,Unidad,40,60,Desc,Encolado\nLIB-2,Libro Dos,,,10,0,,Anillado'), [{ id: 'X' }]);
  return r.errors.length === 0 && r.items.length === 2 && r.items[0].id === 'LIB-1' && r.items[0].isSold && !r.items[1].isSold && r.items[1].unit === 'Unidad' && r.prices.length === 1 && r.prices[0].amount === 60;
})());
check('Lote con errores: línea y motivo, nada se guarda', (() => {
  const r = buildBookBatch(rowsOf('X,Repetido,Activo,Unidad,1,1,,Encolado\nLIB-3,,Activo,Unidad,abc,1,,Otro\nLIB-4,Bien,Activo,Unidad,1,1,,Anillado\nLIB-4,Repite,Activo,Unidad,1,1,,Anillado'), [{ id: 'X' }]);
  return r.errors.some(e => e.line === 2 && /ya existe/.test(e.message)) && r.errors.some(e => e.line === 3 && /nombre/.test(e.message)) && r.errors.some(e => e.line === 3 && /costo/.test(e.message)) && r.errors.some(e => e.line === 3 && /encuadernado/.test(e.message)) && r.errors.some(e => e.line === 5 && /repetido/.test(e.message));
})());
check('Archivo sin columnas o vacío', buildBookBatch(parseCsv('a,b\n1,2'), []).errors.length === 1 && buildBookBatch([], []).errors.length === 1 && buildBookBatch(parseCsv(header), []).errors.length === 1);

// ================================================================ CSV y documento imprimible
check('CSV: entrecomilla y neutraliza fórmulas', toCsv(['A', 'B'], [['x,y', 'ok'], ['=SUMA(1)', 'dice "hola"']]) === 'A,B\r\n"x,y",ok\r\n\'=SUMA(1),"dice ""hola"""' && toCsv(['n'], [[-5], ['-texto']]) === 'n\r\n-5\r\n\'-texto');
check('Nombre de archivo seguro', csvFileName('Caja USD', '2026-10-23') === 'caja_usd_2026-10-23.csv' && csvFileName('Estado de cuenta Ñandú Pérez', '2026-10-23') === 'estado_de_cuenta_nandu_perez_2026-10-23.csv');
check('Documento imprimible escapa el HTML', (() => { const h = tableDocumentHtml('T <b>', 'S', ['H'], [['<script>x</script>']]); return !h.includes('<script>') && h.includes('&lt;script&gt;') && h.includes('<th>H</th>'); })());

// ================================================================ Dashboard
const dctx = {
  branches,
  enrollments: [enr('MAT-1', { branchId: 'FIL-PIU', verificationStatus: 'Pendiente' }), enr('MAT-2', { branchId: 'FIL-CHI', verificationStatus: 'Verificado Completo' }), enr('MAT-3', { branchId: 'FIL-PIU', status: 'Caída' })],
  plans: [sPlan, { ...sPlan, id: 'PLN-2', mat: 'MAT-2', status: 'Completado', balance: 0, installments: [] }],
  payments: [...pays, { id: 'PAG-9', date: TODAY, student: 'X', concept: 'c', amount: 70, method: 'Efectivo', receipt: 'B9', status: 'Aprobado', enrollmentIds: ['MAT-1'] }, { id: 'PAG-10', date: '23 Oct 2026', student: 'X', concept: 'c', amount: 30, method: 'Efectivo', receipt: 'B10', status: 'Aprobado', enrollmentIds: ['MAT-1'] }, { id: 'PAG-11', date: TODAY, student: 'X', concept: 'c', amount: 999, method: 'Efectivo', receipt: 'B11', status: 'Anulado', enrollmentIds: ['MAT-1'] }],
  cashMovements: [mv('A', { branchId: 'FIL-PIU', currency: 'USD', amount: 100, amountUSD: 100, date: '2026-10-05T15:00:00Z' }), mv('B', { branchId: 'FIL-PIU', amountUSD: 40, date: '2026-10-06T15:00:00Z' }), mv('C', { branchId: 'FIL-CHI', amountUSD: 10, date: '2026-09-06T15:00:00Z' })],
  stockItems: [{ id: 's1', itemId: 'i', branchId: 'FIL-PIU', stock: 3, minStock: 5 }, { id: 's2', itemId: 'i', branchId: 'FIL-CHI', stock: 9, minStock: 5 }] as StockItem[],
  dropRequests: [{ id: 'CAI-1', status: 'Pendiente', enrollmentId: 'MAT-1', requestedAt: '2026-10-23T09:00:00Z', requestedBy: 'Ana', reason: 'x', detail: 'y', effectiveDate: TODAY, requestedByUser: '' } as unknown as DropRequest],
};
const k = dashboardKpis(dctx, TODAY);
check('KPIs: matrículas activas, cartera, verificaciones, stock y solicitudes', k.activeEnrollments === 2 && k.portfolioUSD === 400 && k.overdueUSD === 200 && k.pendingVerifications === 1 && k.lowStock === 1 && k.pendingRequests === 1);
check('Pagos del día: ISO y texto, sin anulados', k.paymentsTodayUSD === 100);
check('Saldos de caja por moneda', k.cashUSD === 100 && k.cashPEN === 200);
check('Resumen por sede: matrículas, ingresos del mes y mora', (() => {
  const b = branchFigures(dctx, TODAY);
  const piu = b.find(x => x.branch.id === 'FIL-PIU')!;
  const chi = b.find(x => x.branch.id === 'FIL-CHI')!;
  return piu.activeEnrollments === 1 && piu.monthIncomeUSD === 140 && piu.overdueUSD === 200 && chi.activeEnrollments === 1 && chi.monthIncomeUSD === 0 && chi.overdueUSD === 0;
})());
check('Vencimientos: la vencida primero y el horizonte', (() => {
  const d = upcomingDues(dctx.plans, TODAY, 7);
  return d.length === 1 && d[0].installment === 'Cuota 3' && d[0].days === -8 && upcomingDues(dctx.plans, TODAY, 30).length === 2;
})());
check('Texto de vencimiento', dueText(-1) === 'Vencida hace 1 día' && dueText(-8) === 'Vencida hace 8 días' && dueText(0) === 'Vence hoy' && dueText(1) === 'Vence mañana' && dueText(5) === 'Vence en 5 días');
check('Actividad reciente ordenada y con reversas', (() => {
  const a = recentActivity({ ...dctx, cashMovements: [mv('Z', { date: '2026-10-23T08:00:00Z', reversal: { at: '2026-10-23T09:30:00Z', by: 'Boss', reason: 'r', detail: 'd' }, status: 'Reversado' })] }, 6);
  return a.length >= 3 && a[0].at >= a[a.length - 1].at && a.some(x => x.user === 'Boss' && /reversó/.test(x.text)) && a.some(x => /solicitó la caída/.test(x.text));
})());
check('Tiempo relativo', relativeTime('2026-10-23T11:50:00Z', new Date('2026-10-23T12:00:00Z')) === 'Hace 10 min' && relativeTime('2026-10-23T09:00:00Z', new Date('2026-10-23T12:00:00Z')) === 'Hace 3 horas' && relativeTime('2026-10-22T09:00:00Z', new Date('2026-10-23T12:00:00Z')) === 'Ayer' && initials('Ana García') === 'AG' && initials('') === '·');

console.log(failed === 0 ? '\nTodo correcto.' : `\n${failed} caso(s) fallaron.`);
process.exit(failed === 0 ? 0 : 1);
