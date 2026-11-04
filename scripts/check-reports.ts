/**
 * Verificación de los reportes: rangos, conteos y los cálculos de Matrículas, Verificación, Caja, Stock, Personal y Auditoría.
 * Ejecutar: npx tsx scripts/check-reports.ts
 */
import type { CashClosure, CashMovement, Enrollment, PettyCashMovement } from '../src/context/DataContext';
import { buildAudit, filterAudit, auditUsers, type AuditContext } from '../src/utils/audit';
import { cashReport, pettyReport } from '../src/utils/reportCash';
import { ALL_TIME, dayOf, daysApart, dmy, isAllTime, pct, presetRange, tally, timeOf } from '../src/utils/reportCommon';
import { enrollmentsReport, missingItems, scopeOf, verificationReport } from '../src/utils/reportEnrollments';
import { staffReport } from '../src/utils/reportStaff';
import { STALE_DAYS, stockReport } from '../src/utils/reportStock';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : ` -> ${detail}`}`);
  if (!ok) failed++;
};
// Los datos de prueba solo llevan los campos que cada regla lee
const fx = <T,>(x: unknown) => x as T;

const TODAY = '2026-10-30';
const branches = [{ id: 'S1', name: 'Lima' }, { id: 'S2', name: 'Arequipa' }];

// ---------------------------------------------------------------- Rangos y piezas comunes
check('Preset «mes» = del 1 al 31', JSON.stringify(presetRange('mes', TODAY)) === JSON.stringify({ from: '2026-10-01', to: '2026-10-31' }));
check('Preset «mes anterior» cruza al mes de septiembre', JSON.stringify(presetRange('mes-anterior', TODAY)) === JSON.stringify({ from: '2026-09-01', to: '2026-09-30' }));
check('Mes anterior de enero es diciembre del año anterior', JSON.stringify(presetRange('mes-anterior', '2026-01-15')) === JSON.stringify({ from: '2025-12-01', to: '2025-12-31' }));
check('Preset «año» = todo el año', JSON.stringify(presetRange('anio', TODAY)) === JSON.stringify({ from: '2026-01-01', to: '2026-12-31' }));
check('Preset «30 días» incluye hoy y 29 días atrás', JSON.stringify(presetRange('30d', TODAY)) === JSON.stringify({ from: '2026-10-01', to: TODAY }));
check('Preset «todo» es el historial completo', isAllTime(presetRange('todo', TODAY)) && isAllTime(ALL_TIME));
check('Febrero bisiesto termina el 29', presetRange('mes', '2028-02-10').to === '2028-02-29');
check('dayOf deja las fechas sin hora y toma el día local del instante', dayOf('2026-10-20') === '2026-10-20' && dayOf('2026-10-20T12:00:00') === '2026-10-20');
check('timeOf entiende «AAAA-MM-DD HH:mm» y devuelve 0 si no es fecha', timeOf('2026-10-20 08:30') > timeOf('2026-10-20 08:00') && timeOf('basura') === 0);
check('pct: sin base devuelve null y redondea a un decimal', pct(1, 0) === null && pct(1, 3) === 33.3);
check('daysApart con signo y cruce de año', daysApart('2026-12-30', '2027-01-02') === 3 && daysApart('2026-10-30', '2026-10-20') === -10);
check('dmy da dd/mm/aaaa', dmy('2026-10-05') === '05/10/2026' && dmy('') === '—');
const t = tally(['b', 'a', 'b', '', undefined], x => x, 'Sin dato');
check('tally ordena de mayor a menor y agrupa lo vacío', t[0].name === 'b' && t[0].count === 2 && t.find(x => x.name === 'Sin dato')?.count === 2, JSON.stringify(t));

// ---------------------------------------------------------------- Matrículas
const enr = (id: string, over: Partial<Enrollment> = {}): Enrollment => fx<Enrollment>({
  id, date: '', dateISO: '2026-10-10', student: `Alumno ${id}`, studentId: `ALU-${id}`, program: 'Kids', programId: '1', level: 'N1', status: 'Activa', plan: 'Al día',
  branchId: 'S1', sede: 'Lima', assignedPrice: 100, ...over,
});
const enrollments: Enrollment[] = [
  enr('M1', { verificationStatus: 'Verificado Completo', verificationDate: '2026-10-12', verifier: 'Ana', verifiedItems: ['I1'], paymentTypeName: 'Contado', origen: 'Facebook', asesor: 'Luis' }),
  enr('M2', { branchId: 'S2', sede: 'Arequipa', program: 'Profesional', verificationStatus: 'Verificado Incompleto', verificationDate: '2026-10-20', verifier: 'Ana', verifiedItems: ['I1'], dateISO: '2026-10-05' }),
  enr('M3', { status: 'Caída', dateISO: '2026-10-15' }),
  enr('M4', { dateISO: '2026-08-01' }),
  enr('M5', { renewsId: 'M0', dateISO: '2026-10-28' }),
];
const ectx = {
  enrollments, programs: [], branches, schedules: [],
  dropRequests: [
    { id: 'D1', enrollmentId: 'M3', status: 'Aprobada', reason: 'Viaje', requestedAt: '2026-10-16T10:00:00', requestedBy: 'Caja', resolvedAt: '2026-10-17T10:00:00', resolvedBy: 'Jefe' },
    { id: 'D2', enrollmentId: 'M1', status: 'Pendiente', reason: 'Costo', requestedAt: '2026-10-18T10:00:00', requestedBy: 'Caja' },
  ] as never,
  changeRequests: [{ id: 'C1', enrollmentId: 'M2', kind: 'Traslado', status: 'Aprobada', reason: 'Mudanza', requestedAt: '2026-10-20T10:00:00', requestedBy: 'Caja', resolvedAt: '2026-10-21T10:00:00', resolvedBy: 'Jefe' }] as never,
  today: TODAY,
};
const octubre = { from: '2026-10-01', to: '2026-10-31' };
const er = enrollmentsReport(ectx, { range: octubre, branchId: '', program: '' });
check('Matrículas: solo cuenta las del rango (4 de 5)', er.kpis.registered === 4, String(er.kpis.registered));
check('Matrículas: activas y caídas por separado', er.kpis.active === 3 && er.kpis.dropped === 1, JSON.stringify(er.kpis));
check('Matrículas: ingreso = suma del precio asignado', er.kpis.revenueUSD === 400, String(er.kpis.revenueUSD));
check('Matrículas: cuenta las renovaciones', er.kpis.renewals === 1);
check('Matrículas: % verificadas sobre las registradas', er.kpis.verifiedRate === 50, String(er.kpis.verifiedRate));
check('Matrículas: la caída aprobada del período entra a la tasa; la pendiente no', er.kpis.dropRate === 25 && er.pendingDrops === 1, `${er.kpis.dropRate} ${er.pendingDrops}`);
check('Matrículas: motivos de caída solo de las aprobadas', er.dropReasons.length === 1 && er.dropReasons[0].name === 'Viaje');
check('Matrículas: cambios aprobados por tipo', er.changes[0]?.name === 'Traslado' && er.changes[0].count === 1);
check('Matrículas: embudo empieza en el 100 % y termina en las activas', er.funnel[0].share === 100 && er.funnel[3].count === 3);
check('Matrículas: por sede suma el total', er.byBranch.reduce((n, b) => n + b.count, 0) === 4);
check('Matrículas: sin entrevistador cae en «Sin entrevistador»', er.byAdvisor.some(a => a.name === 'Sin entrevistador'));
const erLima = enrollmentsReport(ectx, { range: octubre, branchId: 'S1', program: '' });
check('Matrículas: el filtro por sede deja solo las de esa sede', erLima.kpis.registered === 3 && erLima.rows.every(e => e.branchId === 'S1'));
check('Matrículas: el filtro por programa', enrollmentsReport(ectx, { range: octubre, branchId: '', program: 'Profesional' }).kpis.registered === 1);
check('Matrículas: todo el historial incluye la de agosto', enrollmentsReport(ectx, { range: ALL_TIME, branchId: '', program: '' }).kpis.registered === 5);
check('Matrículas: lista ordenada de la más reciente a la más antigua', er.rows[0].id === 'M5' && er.rows[er.rows.length - 1].id === 'M2');
check('Matrículas: rango vacío no divide entre cero', enrollmentsReport(ectx, { range: { from: '2020-01-01', to: '2020-01-31' }, branchId: '', program: '' }).kpis.verifiedRate === null);
check('scopeOf no mira la fecha', scopeOf(enrollments, { branchId: 'S1', program: '' }).length === 4);

// ---------------------------------------------------------------- Verificación
const items = [{ id: 'I1', name: 'Libro', type: 'Material' }, { id: 'I2', name: 'Mochila', type: 'Material' }] as never;
const recipes = [{ id: 'R1', programId: '1', items: [{ itemId: 'I1', quantity: 1 }, { itemId: 'I2', quantity: 1 }], status: 'Activo', applyToAllBranches: true, branchIds: [], startDate: '2020-01-01' }] as never;
const vctx = { enrollments, recipes, items, branches, gates: {} as never, today: TODAY };
const vr = verificationReport(vctx, { range: ALL_TIME, branchId: '', program: '' });
check('Verificación: solo cuenta matrículas activas (4 de 5)', vr.kpis.total === 4, String(vr.kpis.total));
check('Verificación: pendientes, completas e incompletas', vr.kpis.pending === 2 && vr.kpis.complete === 1 && vr.kpis.incomplete === 1, JSON.stringify(vr.kpis));
check('Verificación: % verificadas', vr.kpis.rate === 50, String(vr.kpis.rate));
check('Verificación: promedio de días de matrícula a entrega', vr.kpis.avgDays === 8.5, String(vr.kpis.avgDays));
check('Verificación: por verificador', vr.byVerifier[0].name === 'Ana' && vr.byVerifier[0].count === 2);
check('Verificación: por sede suma el total', vr.byBranch.reduce((n, b) => n + b.total, 0) === 4);
check('Verificación: la caída no figura entre las pendientes', !vr.pendingRows.some(r => r.enrollment.id === 'M3'));
check('Verificación: lista de incompletas trae lo que falta entregar', vr.incompleteRows[0]?.enrollment.id === 'M2', JSON.stringify(vr.incompleteRows.map(r => r.missing)));
check('Verificación: filtro por rango', verificationReport(vctx, { range: octubre, branchId: '', program: '' }).kpis.total === 3);
check('missingItems sin receta no inventa faltantes', missingItems(enrollments[0], undefined, items).length === 0);

// ---------------------------------------------------------------- Caja y caja chica
const mov = (id: string, over: Partial<CashMovement>): CashMovement => fx<CashMovement>({
  id, date: '2026-10-10T12:00:00', kind: 'Ingreso', currency: 'PEN', amount: 100, method: 'Efectivo', concept: 'Pago de cuota', reference: '', user: 'Caja', branchId: 'S1', status: 'Aplicado', ...over,
});
const movements: CashMovement[] = [
  mov('K1', {}),
  mov('K2', { method: 'Yape', amount: 50, concept: 'Matrícula' }),
  mov('K3', { kind: 'Egreso', amount: 30, concept: 'Compra menor' }),
  mov('K4', { kind: 'Egreso', amount: 70, concept: 'Depósito al banco', deposit: { code: 'D1', bank: 'BCP' } as never }),
  mov('K5', { kind: 'Egreso', amount: 20, concept: 'Devolución de pago', paymentId: 'P1' }),
  mov('K6', { status: 'Reversado', amount: 40, reversal: { at: '2026-10-12T12:00:00', by: 'Jefe', reason: 'Error' } as never }),
  mov('K7', { currency: 'USD', amount: 500 }),
  mov('K8', { branchId: 'S2', amount: 10, date: '2026-09-10T12:00:00' }),
  mov('K9', { amount: 25, depositedIn: 'D1' as never }),
];
const closures = [
  fx<CashClosure>({ id: 'X1', scope: 'caja', currency: 'PEN', date: '2026-10-11', expected: 100, counted: 95, difference: -5, status: 'Cerrada', closedBy: 'Jefe', closedAt: '2026-10-11T20:00:00' }),
  fx<CashClosure>({ id: 'X2', scope: 'caja-chica', currency: 'PEN', date: '2026-10-11', expected: 10, counted: 10, difference: 0, status: 'Cerrada', closedBy: 'Jefe', closedAt: '2026-10-11T20:00:00' }),
];
const petty: PettyCashMovement[] = [
  fx<PettyCashMovement>({ id: 'P1', date: '2026-10-05T10:00:00', kind: 'Ingreso', amount: 200, category: 'Reposición', concept: 'Fondo', status: 'Aplicado' }),
  fx<PettyCashMovement>({ id: 'P2', date: '2026-10-06T10:00:00', kind: 'Egreso', amount: 45, category: 'Limpieza', concept: 'Detergente', status: 'Aplicado' }),
  fx<PettyCashMovement>({ id: 'P3', date: '2026-10-07T10:00:00', kind: 'Egreso', amount: 15, category: 'Limpieza', concept: 'Escoba', status: 'Reversado', reversal: { at: '2026-10-08T10:00:00', by: 'Jefe', reason: 'Duplicado' } as never }),
];
const fund = { assigned: 300, maxExpense: 100 } as never;
const cctx = { cashMovements: movements, pettyCashMovements: petty, cashClosures: closures, branches, fund };
const cr = cashReport(cctx, { range: octubre, branchId: '', currency: 'PEN' });
check('Caja: ingresos del período (solo aplicados, sin la reversa ni otra moneda)', cr.income === 175, String(cr.income));
check('Caja: egresos operativos excluyen depósito y devolución', cr.expense === 30, String(cr.expense));
check('Caja: devoluciones y depósitos aparte', cr.refunds === 20 && cr.deposits === 70, `${cr.refunds} ${cr.deposits}`);
check('Caja: resultado = ingresos − egresos operativos', cr.net === 145, String(cr.net));
check('Caja: el saldo es el actual de todo lo aplicado (incluye septiembre y descuenta depósito y devolución)', cr.balance === 65, String(cr.balance));
check('Caja: reversas del período con su monto', cr.reversed.count === 1 && cr.reversed.amount === 40);
check('Caja: efectivo sin depositar no cuenta lo ya depositado ni lo no efectivo', cr.pendingDeposit.count === 2 && cr.pendingDeposit.amount === 110, JSON.stringify(cr.pendingDeposit));
check('Caja: por medio de pago', cr.byMethod[0].name === 'Efectivo' && cr.byMethod[0].amount === 125, JSON.stringify(cr.byMethod));
check('Caja: flujo por día sin los depósitos', cr.byDay.length === 1 && cr.byDay[0].income === 175 && cr.byDay[0].expense === 50, JSON.stringify(cr.byDay));
check('Caja: solo el cierre de caja, no el de caja chica', cr.closures.length === 1 && cr.closures[0].id === 'X1' && cr.closureDifference === -5);
check('Caja: el filtro por sede', cashReport(cctx, { range: ALL_TIME, branchId: 'S2', currency: 'PEN' }).income === 10);
check('Caja: la caja en dólares va aparte', cashReport(cctx, { range: octubre, branchId: '', currency: 'USD' }).income === 500);
const pr = pettyReport(cctx, octubre);
check('Caja chica: ingresos, gastos y saldo', pr.income === 200 && pr.expense === 45 && pr.balance === 155, JSON.stringify([pr.income, pr.expense, pr.balance]));
check('Caja chica: gastos por categoría sin la reversa', pr.byCategory.length === 1 && pr.byCategory[0].amount === 45);
check('Caja chica: reversas y cierres', pr.reversed.count === 1 && pr.closures.length === 1 && pr.closures[0].id === 'X2');
check('Caja chica: falta reponer lo gastado del fondo', pr.refill === 145, String(pr.refill));

// ---------------------------------------------------------------- Stock
const sItems = [{ id: 'I1', name: 'Libro', cost: 10 }, { id: 'I2', name: 'Mochila', cost: 20 }, { id: 'I3', name: 'Lápiz', cost: 1 }] as never;
const stockItems = [
  { id: 'a', branchId: 'S1', itemId: 'I1', stock: 0, minStock: 2 },
  { id: 'b', branchId: 'S1', itemId: 'I2', stock: 2, minStock: 2 },
  { id: 'c', branchId: 'S1', itemId: 'I3', stock: 50, minStock: 5 },
  { id: 'd', branchId: 'S2', itemId: 'I1', stock: 10, minStock: 2 },
] as never;
const kardex = [
  { id: 'k1', date: '2026-10-20 10:00', branch: 'Lima', material: 'Libro', type: 'Entrega por Verificación', qty: -1 },
  { id: 'k2', date: '2026-10-21 10:00', branch: 'Lima', material: 'Libro', type: 'Entrega por Verificación', qty: -2 },
  { id: 'k3', date: '2026-10-22 10:00', branch: 'Lima', material: 'Mochila', type: 'Entrada', qty: 5 },
  { id: 'k4', date: '2026-01-02 10:00', branch: 'Lima', material: 'Lápiz', type: 'Entrada', qty: 50 },
] as never;
const sctx = {
  stockItems, items: sItems, branches, recipes, enrollments: [enr('N1'), enr('N2'), enr('N3', { verificationStatus: 'Verificado Completo' })], kardex,
  transfers: [{ id: 'T1', status: 'En tránsito', originId: 'S1', destinationId: 'S2', items: [{ quantity: 3 }] }] as never,
  shipments: [{ id: 'E1', status: 'Recibido', originId: 'S1', destinationId: 'S2', items: [{ quantity: 9 }] }] as never,
  today: TODAY,
};
const sr = stockReport(sctx, { range: octubre, branchId: '' });
check('Stock: estados sin stock / bajo el mínimo / normal', sr.rows.find(r => r.itemId === 'I1' && r.branchId === 'S1')?.state === 'Sin stock' && sr.rows.find(r => r.itemId === 'I2')?.state === 'Bajo el mínimo' && sr.rows.find(r => r.itemId === 'I3')?.state === 'Normal');
check('Stock: valor a costo y unidades', sr.kpis.valueUSD === 40 + 50 + 100 && sr.kpis.units === 62, JSON.stringify(sr.kpis));
check('Stock: faltante de la receta frente a las matrículas sin verificar (2 matrículas piden 2 libros y hay 0 en Lima)', sr.shortfalls.some(s => s.branch === 'Lima' && s.item === 'Libro' && s.required === 2 && s.stock === 0 && s.missing === 2 && s.enrollments === 2), JSON.stringify(sr.shortfalls));
check('Stock: la verificada no pide materiales', sr.shortfalls.every(s => s.required <= 2));
check('Stock: movimientos del período por tipo', sr.movements.find(m => m.type === 'Entrega por Verificación')?.qty === 3 && !sr.movements.some(m => m.type === 'Entrada' && m.count > 1), JSON.stringify(sr.movements));
check('Stock: entregas por artículo', sr.delivered[0]?.item === 'Libro' && sr.delivered[0].qty === 3);
check('Stock: sin movimiento hace 90 días o más', STALE_DAYS === 90 && sr.stale.some(r => r.item === 'Lápiz') && !sr.stale.some(r => r.item === 'Mochila'), JSON.stringify(sr.stale.map(r => r.item)));
check('Stock: lo que no se recibió está en camino; lo recibido no', sr.inTransit.length === 1 && sr.inTransit[0].id === 'T1' && sr.inTransit[0].units === 3);
check('Stock: el filtro por sede', stockReport(sctx, { range: octubre, branchId: 'S2' }).rows.length === 1);

// ---------------------------------------------------------------- Personal
const person = (id: string, over: Record<string, unknown> = {}) => ({ id, names: id, lastNameP: 'Pérez', lastNameM: 'Soto', docType: 'DNI', docNumber: '1', status: 'Activo', ...over });
const staff = [person('Ana'), person('Beto'), person('Carla'), person('Dani', { status: 'Inactivo', statusDate: '2026-10-05' }), person('Eli')] as never;
const asg = (staffId: string, branch: string, over: Record<string, unknown> = {}) => ({ id: `A-${staffId}`, staffId, branch, area: 'Operaciones', role: 'Asesor', isMain: true, status: 'Activa', ...over });
const assignments = [asg('Ana', 'Lima'), asg('Beto', 'Arequipa'), asg('Carla', 'Lima', { role: 'Cajera' }), asg('Dani', 'Lima')] as never;
const contract = (staffId: string, over: Record<string, unknown> = {}) => ({ id: `C-${staffId}`, staffId, type: 'Plazo fijo', status: 'Vigente', endDate: '2027-12-31', ...over });
const contracts = [
  contract('Ana'),
  contract('Beto', { endDate: '2026-11-15' }),
  contract('Carla', { endDate: '2026-10-01' }),
  contract('Dani'),
] as never;
const users = [{ id: 'u1', staffId: 'Ana', status: 'Activo' }, { id: 'u2', staffId: 'Beto', status: 'Inactivo' }] as never;
const payrollRuns = [{
  id: 'PL1', period: '2026-09', status: 'Cerrada', events: [],
  lines: [
    { staffId: 'Ana', branch: 'Lima', calc: { net: 900, totalIncome: 1000, essalud: 90 } },
    { staffId: 'Beto', branch: 'Arequipa', calc: { net: 1800, totalIncome: 2000, essalud: 180 } },
  ],
}, { id: 'PL2', period: '2026-10', status: 'Borrador', events: [] }] as never;
const stctx = { staff, contracts, assignments, users, branches, payrollRuns, today: TODAY };
const sf = staffReport(stctx, { branchId: '', range: octubre });
check('Personal: activos e inactivos', sf.kpis.active === 4 && sf.kpis.inactive === 1, JSON.stringify(sf.kpis));
check('Personal: contrato vigente solo si no venció (Carla venció el 1-oct)', sf.kpis.withContract === 2 && sf.kpis.expired === 1, JSON.stringify(sf.kpis));
check('Personal: por vencer dentro de 30 días (Beto vence el 15-nov)', sf.kpis.expiring === 1 && sf.alerts[0].state === 'Vencido' && sf.alerts[1].staffName.startsWith('Beto'), JSON.stringify(sf.alerts));
check('Personal: activos sin asignación (Eli)', sf.kpis.withoutAssignment === 1 && sf.withoutAssignment[0].name.startsWith('Eli'));
check('Personal: activos sin contrato vigente (Carla y Eli)', sf.withoutContract.map(r => r.staff.id).sort().join() === 'Carla,Eli', sf.withoutContract.map(r => r.staff.id).join());
check('Personal: cuenta de acceso solo si está activa', sf.kpis.withAccount === 1 && sf.kpis.withoutAccount === 3);
check('Personal: las bajas se cuentan por la fecha de estado en el rango', sf.kpis.leavers === 1 && staffReport(stctx, { branchId: '', range: { from: '2026-01-01', to: '2026-01-31' } }).kpis.leavers === 0);
check('Personal: planilla = última cerrada, no el borrador', sf.payroll?.period === '2026-09' && sf.payroll.net === 2700 && sf.payroll.employerCost === 3270, JSON.stringify(sf.payroll));
check('Personal: costo de planilla por sede', sf.payroll?.byBranch[0].name === 'Arequipa' && sf.payroll.byBranch[0].employerCost === 2180);
check('Personal: filtro por sede', staffReport(stctx, { branchId: 'S1', range: octubre }).kpis.active === 2 && staffReport(stctx, { branchId: 'S1', range: octubre }).payroll?.headcount === 1);
check('Personal: por sede cuenta sin asignación aparte', sf.byBranch.some(b => b.name === 'Sin asignación' && b.count === 1));

// ---------------------------------------------------------------- Auditoría
const actx: AuditContext = {
  enrollmentChanges: [{ id: 'EC1', enrollmentId: 'M1', at: '2026-10-11T09:00:00', label: 'Teléfono', from: '1', to: '2', reason: 'Error de digitación', by: 'Ana' }] as never,
  changeRequests: ectx.changeRequests, dropRequests: ectx.dropRequests, enrollments,
  payments: [{ id: 'PG1', student: 'Mateo', receipt: 'B-1', reversal: { at: '2026-10-13T09:00:00', by: 'Jefe', reason: 'Duplicado', refunded: true } }] as never,
  creditNotes: [], cashMovements: movements, pettyCashMovements: petty, cashClosures: closures, psyEvents: [], psyReminderLogs: [], reminderLogs: [],
  payrollRuns: [{ id: 'PL1', period: '2026-09', status: 'Cerrada', events: [{ at: '2026-10-02T09:00:00', action: 'Cerrada', by: 'Contadora', detail: '' }] }] as never,
  contracts: [{ id: 'C1', staffId: 'Ana', revisions: [{ at: '2026-10-03T09:00:00', by: 'RRHH', reason: 'Aumento', changes: [{ label: 'Sueldo', from: '1000', to: '1100' }] }] }] as never,
  adjustments: [{ id: 'AJ1', date: '2026-10-04T09:00:00', type: 'Merma', material: 'Libro', branch: 'Lima', qty: 1, reason: 'Dañado', user: 'Almacén' }] as never,
  staffName: id => id, studentName: id => id, showPay: true,
};
const audit = buildAudit(actx);
check('Auditoría: reúne las fuentes de varios módulos', ['Matrículas', 'Pagos', 'Caja', 'Caja chica', 'Planilla', 'Contratos', 'Logística'].every(m => audit.some(e => e.module === m)), [...new Set(audit.map(e => e.module))].join());
check('Auditoría: ordenada de lo más reciente a lo más antiguo', audit.every((e, i) => i === 0 || audit[i - 1].ts >= e.ts));
check('Auditoría: sin identificadores repetidos', new Set(audit.map(e => e.id)).size === audit.length);
check('Auditoría: la reversa del pago conserva usuario y motivo', audit.some(e => e.module === 'Pagos' && e.by === 'Jefe' && e.detail.includes('Duplicado')));
check('Auditoría: el depósito y la reapertura aparecen como acciones de Caja', audit.some(e => e.action === 'Depósito al banco') && audit.some(e => e.action === 'Cierre de caja'));
check('Auditoría: la solicitud pendiente aparece, y la resuelta suma otro registro', audit.filter(e => e.ref === 'M3').length === 2 && audit.filter(e => e.ref === 'M1' && e.action === 'Solicitud de caída').length === 1);
check('Auditoría: cada registro con enlace apunta a una pantalla', audit.filter(e => e.link).every(e => e.link!.startsWith('/')));
const todo = { range: ALL_TIME, module: '' as const, user: '', text: '' };
check('Filtro: por módulo', filterAudit(audit, { ...todo, module: 'Planilla' }).every(e => e.module === 'Planilla') && filterAudit(audit, { ...todo, module: 'Planilla' }).length === 1);
check('Filtro: por usuario', filterAudit(audit, { ...todo, user: 'Jefe' }).every(e => e.by === 'Jefe'));
check('Filtro: por texto sin importar tildes ni mayúsculas', filterAudit(audit, { ...todo, text: 'DIGITACION' }).length === 1);
check('Filtro: por rango', filterAudit(audit, { ...todo, range: { from: '2026-10-03', to: '2026-10-04' } }).length === 2, String(filterAudit(audit, { ...todo, range: { from: '2026-10-03', to: '2026-10-04' } }).length));
check('Usuarios del filtro sin repetir ni vacíos', new Set(auditUsers(audit)).size === auditUsers(audit).length && !auditUsers(audit).includes(''));

// Sueldos: sin la función «Ver remuneraciones» los importes de contratos y planilla se ocultan
const payCtx: AuditContext = {
  ...actx,
  payrollRuns: [{ id: 'PL2', period: '2026-09', status: 'Cerrada', events: [{ at: '2026-10-02T09:00:00', action: 'Cerrada', by: 'Contadora', detail: '3 trabajador(es) · neto S/ 8 207.51' }] }] as never,
  contracts: [{ id: 'C2', staffId: 'Ana', revisions: [{ at: '2026-10-03T09:00:00', by: 'RRHH', reason: 'Aumento por desempeño', changes: [{ label: 'Sueldo bruto', from: '1000', to: '1100' }, { label: 'Jornada', from: 'Mañana', to: 'Tarde' }] }] }] as never,
};
const withPay = buildAudit({ ...payCtx, showPay: true });
const noPay = buildAudit({ ...payCtx, showPay: false });
const planillaOf = (rows: typeof audit) => rows.find(e => e.module === 'Planilla')!.detail;
const contratoOf = (rows: typeof audit) => rows.find(e => e.module === 'Contratos')!.detail;
check('Sueldos: con permiso se ve el neto de la planilla y el cambio de sueldo', planillaOf(withPay).includes('8 207.51') && contratoOf(withPay).includes('1000 → 1100'));
check('Sueldos: sin permiso la planilla oculta el importe', !planillaOf(noPay).includes('8 207') && planillaOf(noPay).includes('S/ ••••') && planillaOf(noPay).includes('3 trabajador(es)'), planillaOf(noPay));
check('Sueldos: sin permiso el contrato oculta el valor del sueldo pero deja ver que cambió', !contratoOf(noPay).includes('1000') && !contratoOf(noPay).includes('1100') && contratoOf(noPay).includes('Sueldo bruto: ••••'), contratoOf(noPay));
check('Sueldos: lo que no es remuneración se sigue viendo (jornada y motivo)', contratoOf(noPay).includes('Jornada: Mañana → Tarde') && contratoOf(noPay).includes('Aumento por desempeño'));
check('Sueldos: ocultar importes no cambia cuántos registros hay ni quién los hizo', withPay.length === noPay.length && withPay.every((e, i) => e.by === noPay[i].by && e.at === noPay[i].at));

console.log(failed === 0 ? '\nTodo en verde.' : `\n${failed} verificación(es) fallaron.`);
process.exit(failed === 0 ? 0 : 1);
