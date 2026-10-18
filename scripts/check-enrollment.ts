/**
 * Verificación de extremo a extremo del registro de matrícula (Etapa 5) sobre las reglas puras.
 * Ejecutar: npx tsx scripts/check-enrollment.ts
 */
import type {
  Assignment, Branch, ClassSchedule, LeadSource, Level, PaymentPart, PaymentType, Program, Promotion, Staff, Tariff,
} from '../src/context/DataContext';
import {
  buildEnrollmentBatch, emptyDraft, emptyPerson, emptyStudent, getInterviewerOptions, quoteEnrollment,
  validateContext, validatePayments, validateProgram,
  type DraftPerson, type EnrollmentCatalogs, type EnrollmentDraft, type ExistingState,
} from '../src/utils/enrollment';
import { generateBreakdown, resolveScheduleMode, sumBreakdown } from '../src/utils/tariffs';
import { validateStudents } from '../src/utils/enrollment';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : ` -> ${detail}`}`);
  if (!ok) failed++;
};

// ---------- Catálogos de prueba (mismas reglas que la semilla)
const branches: Branch[] = [
  { id: 'FIL-AYA', name: 'Ayacucho', company: 'X', status: 'Activo', address: '', department: '', province: '', district: '' },
  { id: 'FIL-PIU', name: 'Piura', company: 'X', status: 'Activo', address: '', department: '', province: '', district: '' },
];
const leadSources: LeadSource[] = [{ id: 'L1', name: 'Facebook', status: 'active' }];
const staff: Staff[] = [
  { id: 'E1', code: '1', docType: 'DNI', docNumber: '1', names: 'Ana', lastNameP: 'Quispe', lastNameM: 'Rojas', birthDate: '', age: 30, phone: '', institutionalEmail: '', status: 'Activo' },
  { id: 'E2', code: '2', docType: 'DNI', docNumber: '2', names: 'Luis', lastNameP: 'Mamani', lastNameM: 'Soto', birthDate: '', age: 30, phone: '', institutionalEmail: '', status: 'Activo' },
];
const assignments: Assignment[] = [
  { id: 'A1', staffId: 'E1', branch: 'Ayacucho', area: 'Psicopedagogía', role: 'x', startDate: '2026-01-01', isMain: true, status: 'Activa' },
  { id: 'A2', staffId: 'E2', branch: 'Piura', area: 'Psicopedagogia', role: 'x', startDate: '2026-01-01', isMain: true, status: 'Activa' },
];
const programs: Program[] = [
  { id: 'KIDS', code: 'K', name: 'Kids', hasLevels: true, durationBase: 3, warranty: 3, allBranches: true, status: 'Activo' },
  { id: 'PK', code: 'PK', name: 'Pre-Kids', hasLevels: true, durationBase: 3, warranty: 3, allBranches: true, status: 'Activo' },
  { id: 'PROF', code: 'P', name: 'Profesional', hasLevels: false, durationBase: 6, warranty: 6, allBranches: true, status: 'Activo' },
];
const levels: Level[] = [
  { id: 'K1', programId: 'KIDS', code: 'K1', name: 'Kids 1', order: 1, status: 'Activo' },
  { id: 'K2', programId: 'KIDS', code: 'K2', name: 'Kids 2', order: 2, status: 'Activo' },
  { id: 'P1', programId: 'PK', code: 'P1', name: 'Pre-Kids 1', order: 1, status: 'Activo' },
];
const pt = (id: string, name: string, n: number, mode: PaymentType['scheduleMode'], term = 30): PaymentType =>
  ({ id, code: id, name, installments: n, termDays: term, scheduleMode: mode, status: 'Activo' });
const paymentTypes: PaymentType[] = [
  pt('CONT', 'Contado', 1, 'inmediato', 0), pt('C2P', 'Contado en 2 partes', 2, 'fechas_manuales'),
  pt('P3', 'Plan 3', 3, 'intervalo_fijo'), pt('P6', 'Plan 6', 6, 'intervalo_fijo'),
];
const tariff = (id: string, programId: string, type: PaymentType, o: { amount?: number; enrollment?: number; total?: number; levelId?: string } = {}): Tariff => {
  const lines = generateBreakdown({ mode: resolveScheduleMode(type), count: type.installments, intervalDays: type.termDays || 30, amount: o.amount ?? 0, enrollmentAmount: o.enrollment });
  return {
    id, name: id, programId, levelId: o.levelId, paymentTypeId: type.id, branchId: 'all', currency: 'USD',
    basePrice: o.total ?? sumBreakdown(lines), installments: lines, startDate: '2026-01-01', endDate: '2026-12-31', status: 'Activo',
  };
};
const tariffs: Tariff[] = [
  tariff('T-KIDS-CONT', 'KIDS', paymentTypes[0], { amount: 500 }),
  tariff('T-KIDS-C2P', 'KIDS', paymentTypes[1], { total: 500 }),
  tariff('T-PK-CONT', 'PK', paymentTypes[0], { amount: 500 }),
  tariff('T-PROF-CONT', 'PROF', paymentTypes[0], { amount: 1000 }),
  tariff('T-PROF-P3', 'PROF', paymentTypes[2], { amount: 300, enrollment: 300 }),
  tariff('T-PROF-P6', 'PROF', paymentTypes[3], { amount: 200, enrollment: 200 }),
];
const promo: Promotion = {
  id: 'PR1', code: 'PROMO-2X700', name: '2 matrículas Pre-Kids/Kids USD 700', type: 'Grupal', requiredStudents: 2,
  eligibleProgramIds: ['PK', 'KIDS'], requiredBasePrice: 500, allowMultipleGroups: true, paymentTypeIds: ['CONT'],
  totalPrice: 700, currency: 'USD', internalDistributionRule: 'Igualitario', branchIds: [], applyToAllBranches: true,
  startDate: '2026-01-01', endDate: '2026-12-31', status: 'Activo',
};

const classSchedules: ClassSchedule[] = [
  { id: 'H1', name: 'L-M-V 4:00 PM', allBranches: true, branchIds: [], status: 'Activo' },
  { id: 'H2', name: 'Sábados 9:00 AM', allBranches: false, branchIds: ['FIL-PIU'], status: 'Activo' },
  { id: 'H3', name: 'Antiguo', allBranches: true, branchIds: [], status: 'Inactivo' },
];

const catalogs = (over: Partial<EnrollmentCatalogs> = {}): EnrollmentCatalogs => ({
  branches, leadSources, staff, assignments, programs, levels, tariffs, paymentTypes,
  promotions: [promo], guardians: [], students: [], classSchedules, ...over,
});
const empty: ExistingState = { guardians: [], students: [], enrollments: [], plans: [], payments: [], promotionGroups: [], schedules: [] };
const NOW = '2026-10-10T15:00:00.000Z';
const TODAY = '2026-10-10';

const person = (n: number, over: Partial<DraftPerson> = {}): DraftPerson => ({
  ...emptyPerson(), docNumber: String(70000000 + n), names: `Nombre${n}`, lastNameP: `ApellidoP${n}`, lastNameM: `ApellidoM${n}`,
  birthDate: '2015-05-05', phone: '987654321', ...over,
});
const holder = (n = 90): DraftPerson => person(n, { birthDate: '1985-01-01', address: 'Av. Principal 123', civilStatus: 'Casado(a)', email: 'a@b.com' });

function draftWith(students: { program: string; level?: string; type: string; dueDates?: string[] }[], mode: 'apoderado' | 'independiente' = 'apoderado'): EnrollmentDraft {
  const d = emptyDraft(TODAY, 'FIL-AYA');
  d.context = { branchId: 'FIL-AYA', date: TODAY, leadSourceId: 'L1', interviewerId: 'E1', observation: '' };
  d.mode = mode;
  d.holders = [holder()];
  d.students = students.map((s, i) => ({
    ...emptyStudent(), key: `k${i}`, person: person(i + 1), relationship: mode === 'apoderado' ? 'Hijo(a)' : '',
    situation: 'estudiando' as const, institutionType: 'Colegio', school: 'I.E. San Martín', grade: '4° Primaria',
    counselingDate: '2026-10-14', counselingTime: '16:00',
    programId: s.program, levelId: s.level ?? '', paymentTypeId: s.type, dueDates: s.dueDates ?? [],
  }));
  return d;
}
const usdPart = (amount: number, method = 'Efectivo', extra: Partial<PaymentPart> = {}): PaymentPart =>
  ({ id: `p${Math.random()}`, currency: 'USD', amount, method, ...extra });
const build = (d: EnrollmentDraft, c = catalogs(), s = empty) => buildEnrollmentBatch(d, c, s, { now: NOW, userName: 'Tester' });

// ---------- Caso 1: 1 alumno Kids, Contado
{
  const d = draftWith([{ program: 'KIDS', level: 'K1', type: 'CONT' }]);
  const q = quoteEnrollment(d, catalogs());
  check('Caso 1: sin promoción con 1 alumno', q.offers.length === 0 && q.groups.length === 0);
  check('Caso 1: una unidad de pago de USD 500', q.units.length === 1 && q.units[0].required === 500);
  d.payments[q.units[0].key] = [usdPart(500)];
  const r = build(d);
  check('Caso 1: se guarda', r.ok, r.error);
  const b = r.batch!;
  check('Caso 1: matrícula MAT-2026-001 con verificación Pendiente', b.enrollments[0].id === 'MAT-2026-001' && b.enrollments[0].verificationStatus === 'Pendiente');
  check('Caso 1: guarda programId, levelId y branchId (compatible con Verificación)',
    b.enrollments[0].programId === 'KIDS' && b.enrollments[0].levelId === 'K1' && b.enrollments[0].branchId === 'FIL-AYA');
  check('Caso 1: un pago, un movimiento de caja y plan de contado en saldo 0',
    b.payments.length === 1 && b.cashMovements.length === 1 && b.plans[0].balance === 0 && b.plans[0].installments.length === 0);
  check('Caso 1: guarda sede, responsable y origen reales',
    b.enrollments[0].sede === 'Ayacucho' && b.enrollments[0].asesor?.startsWith('Ana') === true && b.enrollments[0].origen === 'Facebook');
  check('Caso 1: el apoderado y el alumno se crean y vinculan por ID', b.newGuardians.length === 1 && b.newStudents[0].guardianIds?.[0] === b.newGuardians[0].id);
}

// ---------- Caso 2: 2 alumnos con promoción, Contado, pago grupal
{
  const d = draftWith([{ program: 'PK', level: 'P1', type: 'CONT' }, { program: 'KIDS', level: 'K2', type: 'CONT' }]);
  let q = quoteEnrollment(d, catalogs());
  check('Caso 2: promoción disponible (PreKids 1 + Kids 2)', q.offers.length === 1);
  d.promotion = { promotionId: 'PR1', groups: [['k0', 'k1']] };
  q = quoteEnrollment(d, catalogs());
  check('Caso 2: costo asignado 350 + 350', q.students.every(s => s.assignedPrice === 350));
  check('Caso 2: un solo pago grupal de 700', q.units.length === 1 && q.units[0].kind === 'group' && q.units[0].required === 700);
  d.payments[q.units[0].key] = [
    { id: 'a', currency: 'PEN', amount: 1140, exchangeRate: 3.8, method: 'Yape', operationNumber: '123' }, // 300 USD
    usdPart(200, 'Efectivo'),
    usdPart(200, 'Transferencia', { bank: 'BCP', operationNumber: '999' }),
  ];
  const r = build(d);
  check('Caso 2: se guarda', r.ok, r.error);
  const b = r.batch!;
  check('Caso 2: 2 matrículas, 1 grupo, 1 pago con 3 partes y sin pagos individuales',
    b.enrollments.length === 2 && b.promotionGroups.length === 1 && b.payments.length === 1 && b.payments[0].parts!.length === 3);
  check('Caso 2: el pago referencia ambas matrículas y el grupo',
    b.payments[0].enrollmentIds!.length === 2 && b.payments[0].promotionGroupId === b.promotionGroups[0].id && b.promotionGroups[0].paymentId === b.payments[0].id);
  check('Caso 2: 3 movimientos de caja (uno por parte, en su moneda)',
    b.cashMovements.length === 3 && b.cashMovements.some(m => m.currency === 'PEN' && m.amount === 1140));
  check('Caso 2: ambas matrículas guardan costo asignado 350 y el grupo', b.enrollments.every(e => e.assignedPrice === 350 && e.promotionGroupId === b.promotionGroups[0].id));
}

// ---------- Caso 3: 2 alumnos no elegibles por precio base distinto
{
  const d = draftWith([{ program: 'PK', level: 'P1', type: 'CONT' }, { program: 'PROF', type: 'CONT' }]);
  const q = quoteEnrollment(d, catalogs());
  check('Caso 3: PreKids 500 + Profesional 1000 → sin promoción', q.offers.length === 0);
  check('Caso 3: dos pagos individuales (500 y 1000)', q.units.length === 2 && q.units[0].required === 500 && q.units[1].required === 1000);
}

// ---------- Casos 4 y 5: Profesional Plan 3 / Plan 6
{
  const d3 = draftWith([{ program: 'PROF', type: 'P3' }]);
  const r3 = build(d3);
  check('Caso 4: Profesional Plan 3 se guarda sin pedir pago', r3.ok, r3.error);
  const p3 = r3.batch!.plans[0];
  check('Caso 4: total 1200, Matrícula + 3 cuotas (día 0, 0, 30, 60)',
    p3.total === 1200 && p3.installments.length === 4 &&
    JSON.stringify(p3.installments.map((i: any) => i.name)) === JSON.stringify(['Matrícula', 'Cuota 1', 'Cuota 2', 'Cuota 3']));
  check('Caso 4: fechas a 30 días exactos de la matrícula',
    JSON.stringify(p3.installments.map((i: any) => i.dueDateISO)) === JSON.stringify(['2026-10-10', '2026-10-10', '2026-11-09', '2026-12-09']));
  check('Caso 4: sin pagos ni movimientos de caja; saldo = total', r3.batch!.payments.length === 0 && r3.batch!.cashMovements.length === 0 && p3.balance === 1200);

  const r6 = build(draftWith([{ program: 'PROF', type: 'P6' }]));
  check('Caso 5: Profesional Plan 6 total 1400 con 7 líneas', r6.ok && r6.batch!.plans[0].total === 1400 && r6.batch!.plans[0].installments.length === 7, r6.error);
}

// ---------- Caso 6: Contado con varios medios (validaciones de partes)
{
  const d = draftWith([{ program: 'KIDS', level: 'K1', type: 'CONT' }]);
  const key = quoteEnrollment(d, catalogs()).units[0].key;
  d.payments[key] = [{ id: 'a', currency: 'PEN', amount: 380, method: 'Yape', operationNumber: '1' }, usdPart(400)];
  check('Caso 6: parte en PEN sin TC → rechazada', validatePayments(d, quoteEnrollment(d, catalogs())).some(m => /TC/.test(m)));
  d.payments[key] = [{ id: 'a', currency: 'PEN', amount: 380, exchangeRate: 3.8, method: 'Yape', operationNumber: '1' }, usdPart(300)];
  check('Caso 6: 100 + 300 ≠ 500 → rechazado', validatePayments(d, quoteEnrollment(d, catalogs())).some(m => /exactamente/.test(m)));
  d.payments[key] = [{ id: 'a', currency: 'PEN', amount: 380, exchangeRate: 3.8, method: 'Yape', operationNumber: '1' }, usdPart(400)];
  check('Caso 6: 100 + 400 = 500 → válido', validatePayments(d, quoteEnrollment(d, catalogs())).length === 0);
  d.payments[key] = [{ id: 'a', currency: 'USD', amount: 500, method: 'Transferencia' }];
  check('Caso 6: transferencia sin banco ni operación → rechazada', validatePayments(d, quoteEnrollment(d, catalogs())).length >= 2);
}

// ---------- Casos 7 y 8: con y sin niveles
{
  const noLevel = draftWith([{ program: 'KIDS', type: 'CONT' }]);
  check('Caso 7: programa con niveles sin nivel → rechazado', validateProgram(noLevel, catalogs(), quoteEnrollment(noLevel, catalogs())).some(m => /nivel/i.test(m)));
  const prof = draftWith([{ program: 'PROF', type: 'CONT' }]);
  check('Caso 8: programa sin niveles no exige nivel', validateProgram(prof, catalogs(), quoteEnrollment(prof, catalogs())).length === 0);
  const r = build({ ...prof, payments: { [quoteEnrollment(prof, catalogs()).units[0].key]: [usdPart(1000)] } });
  check('Caso 8: matrícula sin levelId', r.ok && r.batch!.enrollments[0].levelId === undefined, r.error);
}

// ---------- Caso 9: tarifario vencido / inactivo
{
  const expired = tariffs.map(t => (t.id === 'T-KIDS-CONT' ? { ...t, endDate: '2026-06-30' } : t));
  const d = draftWith([{ program: 'KIDS', level: 'K1', type: 'CONT' }]);
  const q = quoteEnrollment(d, catalogs({ tariffs: expired }));
  check('Caso 9: tarifario vencido → sin precio y con error', !q.students[0].tariff && validateProgram(d, catalogs({ tariffs: expired }), q).length > 0);
  const inactive = tariffs.map(t => (t.id === 'T-KIDS-CONT' ? { ...t, status: 'Inactivo' as const } : t));
  check('Caso 9: tarifario inactivo → sin precio', !quoteEnrollment(d, catalogs({ tariffs: inactive })).students[0].tariff);
}

// ---------- Caso 10: promoción vencida / inactiva
{
  const d = draftWith([{ program: 'PK', level: 'P1', type: 'CONT' }, { program: 'KIDS', level: 'K2', type: 'CONT' }]);
  check('Caso 10: promoción inactiva → no disponible', quoteEnrollment(d, catalogs({ promotions: [{ ...promo, status: 'Inactivo' }] })).offers.length === 0);
  check('Caso 10: promoción vencida → no disponible', quoteEnrollment(d, catalogs({ promotions: [{ ...promo, endDate: '2026-06-30' }] })).offers.length === 0);
}

// ---------- Adicionales
{
  const d = draftWith([{ program: 'PK', level: 'P1', type: 'CONT' }, { program: 'KIDS', level: 'K2', type: 'CONT' }, { program: 'KIDS', level: 'K1', type: 'CONT' }]);
  d.promotion = { promotionId: 'PR1', groups: [['k0', 'k2']] };
  const q = quoteEnrollment(d, catalogs());
  check('3 alumnos: la promoción cubre solo a los seleccionados', q.groups.length === 1 && q.students[1].assignedPrice === 500);
  check('3 alumnos: 1 pago grupal (700) + 1 individual (500)', q.units.length === 2 && q.units.map(u => u.required).sort().join() === '500,700');

  const d4 = draftWith([{ program: 'PK', level: 'P1', type: 'CONT' }, { program: 'KIDS', level: 'K1', type: 'CONT' }, { program: 'KIDS', level: 'K2', type: 'CONT' }, { program: 'PK', level: 'P1', type: 'CONT' }]);
  d4.promotion = { promotionId: 'PR1', groups: [['k0', 'k1'], ['k2', 'k3']] };
  const q4 = quoteEnrollment(d4, catalogs());
  check('4 alumnos: 2 grupos sin repetir alumnos', q4.groups.length === 2 && new Set(q4.groups.flatMap(g => g.studentKeys)).size === 4);
  d4.promotion = { promotionId: 'PR1', groups: [['k0', 'k1'], ['k1', 'k2']] };
  const bad = quoteEnrollment(d4, catalogs());
  check('Un alumno en dos grupos → promoción inválida', bad.groups.length === 0 && bad.warnings.length > 0);
}
{
  // Contado en 2 partes: fechas acordadas, sin pago en el asistente
  const d = draftWith([{ program: 'KIDS', level: 'K1', type: 'C2P' }]);
  check('C2P: sin fechas acordadas → rechazado', validateProgram(d, catalogs(), quoteEnrollment(d, catalogs())).some(m => /fechas/i.test(m)));
  d.students[0].dueDates = ['2026-10-10', '2026-11-20'];
  const r = build(d);
  check('C2P: se guarda con 2 obligaciones y sin pago', r.ok && r.batch!.payments.length === 0 && r.batch!.plans[0].installments.length === 2, r.error);
  const inst = r.batch!.plans[0].installments;
  check('C2P: fechas acordadas respetadas; parte 1 con tope = total; parte 2 en 0',
    inst[0].dueDateISO === '2026-10-10' && inst[1].dueDateISO === '2026-11-20' && inst[0].amount === 500 && inst[1].amount === 0);
}
{
  // Independiente: una sola persona, sin titular duplicado
  const d = draftWith([{ program: 'PROF', type: 'P3' }], 'independiente');
  d.holders = [person(50, { birthDate: '1990-01-01' })];
  const r = build(d);
  check('Independiente: crea una persona (alumno) y ningún titular', r.ok && r.batch!.newStudents.length === 1 && r.batch!.newGuardians.length === 0, r.error);
  check('Independiente: el alumno es su propio titular', r.batch!.newStudents[0].titular === r.batch!.newStudents[0].name);
}
{
  // Reglas de contexto
  const d = draftWith([{ program: 'KIDS', level: 'K1', type: 'CONT' }]);
  d.context.date = '2026-12-31';
  check('Fecha futura → rechazada', validateContext(d, catalogs(), TODAY).some(m => /futura/.test(m)));
  d.context.date = TODAY;
  d.context.interviewerId = 'E2'; // Psicopedagogía de Piura: válido aunque la matrícula sea en Ayacucho
  check('Responsable de Psicopedagogía de otra sede → válido', validateContext(d, catalogs(), TODAY).length === 0);
  const opts = getInterviewerOptions(catalogs(), 'FIL-AYA');
  check('Lista = todo el personal de Psicopedagogía, primero el de la sede', opts.length === 2 && opts[0].staff.id === 'E1' && opts[1].branchName === 'Piura');
  check('Personal de otra área no aparece',
    getInterviewerOptions(catalogs({ assignments: [{ ...assignments[0], area: 'Administración' }, assignments[1]] }), 'FIL-AYA').length === 1);
  check('Personal inactivo o con asignación inactiva no aparece',
    getInterviewerOptions(catalogs({ staff: [{ ...staff[0], status: 'Inactivo' }, staff[1]] }), 'FIL-AYA').length === 1 &&
    getInterviewerOptions(catalogs({ assignments: [{ ...assignments[0], status: 'Inactiva' }, assignments[1]] }), 'FIL-AYA').length === 1);
  d.context.interviewerId = 'E3';
  check('Responsable inexistente → rechazado', validateContext(d, catalogs(), TODAY).some(m => /Psicopedagog/.test(m)));
  d.context.interviewerId = 'E1';
  const r = build({ ...draftWith([{ program: 'KIDS', level: 'K1', type: 'CONT' }]), payments: {} });
  check('Guardado atómico: con datos incompletos no se crea nada', !r.ok && !r.batch);
  const dup = draftWith([{ program: 'KIDS', level: 'K1', type: 'CONT' }]);
  dup.students[0].person.docNumber = '123';
  check('DNI inválido → rechazado', build(dup).ok === false);
  const existing: ExistingState = { ...empty, enrollments: [{ id: 'MAT-2026-007' } as any] };
  const dd = draftWith([{ program: 'KIDS', level: 'K1', type: 'CONT' }]);
  dd.payments[quoteEnrollment(dd, catalogs()).units[0].key] = [usdPart(500)];
  check('Correlativo continúa desde el máximo existente (MAT-2026-008)', build(dd, catalogs(), existing).batch?.enrollments[0].id === 'MAT-2026-008');
}

// ---------- Tarjeta de alumno: existente / nuevo, situación, horario
{
  const base = () => draftWith([{ program: 'KIDS', level: 'K1', type: 'CONT' }]);
  const cat = catalogs();

  const d1 = base();
  d1.students[0].person = { ...emptyPerson(), source: 'existente' };
  check('Existente sin elegir a nadie → rechazado', validateStudents(d1, cat, TODAY).some(m => /ya registrada|Nuevo/.test(m)));

  const d2 = base();
  d2.students[0].situation = '';
  check('Sin situación → rechazado', validateStudents(d2, cat, TODAY).some(m => /estudiando, trabajando/.test(m)));

  const d3 = base();
  d3.students[0].school = ''; d3.students[0].grade = '';
  check('Estudiando sin institución ni grado → rechazado', validateStudents(d3, cat, TODAY).filter(m => /institución|grado/.test(m)).length === 2);

  const d4 = base();
  Object.assign(d4.students[0], { situation: 'trabajando', school: '', grade: '', institutionType: '', occupation: '' });
  check('Trabajando sin ocupación → rechazado', validateStudents(d4, cat, TODAY).some(m => /ocupación/.test(m)));
  d4.students[0].occupation = 'Contador';
  check('Trabajando con ocupación → válido (sin pedir colegio)', validateStudents(d4, cat, TODAY).length === 0);

  const d5 = base();
  Object.assign(d5.students[0], { situation: 'ambos', occupation: 'Vendedor' });
  check('Estudiando y trabajando exige ambos bloques', validateStudents(d5, cat, TODAY).length === 0);
  d5.students[0].occupation = '';
  check('Estudiando y trabajando sin ocupación → rechazado', validateStudents(d5, cat, TODAY).some(m => /ocupación/.test(m)));

  const d6 = base();
  Object.assign(d6.students[0], { situation: 'ninguna', school: '', grade: '', institutionType: '' });
  check('Ninguna → no pide institución ni ocupación', validateStudents(d6, cat, TODAY).length === 0);

  // Solo se guarda lo que corresponde a la situación elegida
  const d7 = base();
  Object.assign(d7.students[0], { situation: 'trabajando', occupation: 'Chofer', school: 'Colegio viejo', grade: '1° Secundaria', institutionType: 'Colegio' });
  d7.payments[quoteEnrollment(d7, cat).units[0].key] = [usdPart(500)];
  const saved = build(d7).batch!.newStudents[0];
  check('Trabajando: guarda ocupación y descarta colegio/grado sobrantes', saved.occupation === 'Chofer' && saved.colegio === undefined && saved.grado === undefined && saved.occupationStatus === 'trabajando');

  const d8 = base();
  d8.payments[quoteEnrollment(d8, cat).units[0].key] = [usdPart(500)];
  const st = build(d8).batch!.newStudents[0];
  check('Estudiando: guarda colegio, grado y tipo de institución', st.colegio === 'I.E. San Martín' && st.grado === '4° Primaria' && st.institutionType === 'Colegio');

  // Horarios configurados
  const h1 = base();
  h1.context.branchId = 'FIL-AYA';
  h1.students[0].schedule = 'Sábados 9:00 AM'; // solo Piura
  check('Horario de otra sede → rechazado', validateProgram(h1, cat, quoteEnrollment(h1, cat)).some(m => /horario/i.test(m)));
  h1.students[0].schedule = 'Antiguo'; // inactivo
  check('Horario inactivo → rechazado', validateProgram(h1, cat, quoteEnrollment(h1, cat)).some(m => /horario/i.test(m)));
  h1.students[0].schedule = 'L-M-V 4:00 PM';
  check('Horario disponible en todas las sedes → válido', !validateProgram(h1, cat, quoteEnrollment(h1, cat)).some(m => /horario/i.test(m)));
  h1.students[0].schedule = '';
  check('El horario es opcional', !validateProgram(h1, cat, quoteEnrollment(h1, cat)).some(m => /horario/i.test(m)));
}

// ---------- Primera asesoría: fecha y hora específicas
{
  const base = () => draftWith([{ program: 'KIDS', level: 'K1', type: 'CONT' }]);
  const cat = catalogs();
  const probe = (d: EnrollmentDraft) => validateProgram(d, cat, quoteEnrollment(d, cat));

  const a1 = base(); a1.students[0].counselingDate = '';
  check('Sin fecha de primera asesoría → rechazado', probe(a1).some(m => /fecha de la primera asesoría/.test(m)));
  const a2 = base(); a2.students[0].counselingTime = '';
  check('Sin horario de primera asesoría → rechazado', probe(a2).some(m => /horario de la primera asesoría/.test(m)));
  const a3 = base(); a3.students[0].counselingDate = '2026-10-09';
  check('Asesoría anterior a la matrícula → rechazada', probe(a3).some(m => /anterior a la fecha de matrícula/.test(m)));
  const a4 = base(); a4.students[0].counselingDate = TODAY;
  check('Asesoría el mismo día de la matrícula → válida', !probe(a4).some(m => /asesoría/.test(m)));
  const a5 = base(); a5.students[0].paymentTypeId = '';
  check('La asesoría se valida aunque falte el tipo de pago', probe({ ...a5, students: [{ ...a5.students[0], counselingDate: '' }] }).some(m => /asesoría/.test(m)));

  // Mismos bloques que la agenda: 1 hora exacta, sin domingos
  const sab = base(); sab.students[0].counselingDate = '2026-10-17'; sab.students[0].counselingTime = '09:00';
  check('Sábado 9:00 → válido', !probe(sab).some(m => /asesoría/.test(m)));
  const dom = base(); dom.students[0].counselingDate = '2026-10-18';
  check('Domingo → rechazado', probe(dom).some(m => /domingos no hay atención/.test(m)));
  const fuera = base(); fuera.students[0].counselingTime = '16:30';
  check('Hora fuera de los bloques (16:30) → rechazada', probe(fuera).some(m => /no está disponible para esa fecha/.test(m)));
  const lun9 = base(); lun9.students[0].counselingTime = '09:00';
  check('Lunes–viernes a las 9:00 → rechazado (solo sábado)', probe(lun9).some(m => /no está disponible para esa fecha/.test(m)));

  // Cupo y actividades de la agenda de la sede
  const sch = (id: string, over: Record<string, unknown> = {}) => ({
    id, student: `Otro ${id}`, studentId: `X${id}`, branchId: 'FIL-AYA', program: 'Kids', level: 'K1', date: '2026-10-14', time: '16:00',
    duration: 60, responsible: 'Ana', status: 'Reservado', ...over,
  }) as any;
  const sched = (schedules: any[], activities: any[] = [], defaultCapacity: number | null = 2) =>
    catalogs({ scheduling: { schedules, capacity: { defaultCapacity, byBranch: {}, overrides: [] }, activities } });
  const probeIn = (c: EnrollmentCatalogs, d: EnrollmentDraft) => validateProgram(d, c, quoteEnrollment(d, c));

  check('Horario con lugar → válido', !probeIn(sched([sch('1')]), base()).some(m => /asesoría/.test(m)));
  check('Horario completo (2 de 2) → rechazado', probeIn(sched([sch('1'), sch('2')]), base()).some(m => /completo: 2 de 2/.test(m)));
  check('Una asesoría cancelada no ocupa cupo', !probeIn(sched([sch('1'), sch('2', { status: 'Cancelado' })]), base()).some(m => /asesoría/.test(m)));
  check('Sin límite → siempre hay lugar', !probeIn(sched([sch('1'), sch('2'), sch('3'), sch('4')], [], null), base()).some(m => /asesoría/.test(m)));
  check('Cupo de otra sede no cuenta', !probeIn(sched([sch('1', { branchId: 'FIL-PIU' }), sch('2', { branchId: 'FIL-PIU' })]), base()).some(m => /asesoría/.test(m)));
  const marathon = { id: 'm:1', monthlyId: 'm', activityId: '1', branchId: 'FIL-AYA', sede: 'Ayacucho', name: 'Maratón', date: '2026-10-14', start: '15:30', end: '17:00', responsible: '', capacity: null, enrolled: [] };
  check('Actividad de la sede encima del horario → rechazado', probeIn(sched([], [marathon]), base()).some(m => /ocupado por la actividad «Maratón»/.test(m)));
  check('Actividad de otra sede no bloquea', !probeIn(sched([], [{ ...marathon, branchId: 'FIL-PIU' }]), base()).some(m => /asesoría/.test(m)));
  check('Actividad que termina antes del bloque no bloquea', !probeIn(sched([], [{ ...marathon, start: '14:00', end: '16:00' }]), base()).some(m => /asesoría/.test(m)));
  const dup = draftWith([{ program: 'PK', level: 'P1', type: 'CONT' }, { program: 'KIDS', level: 'K2', type: 'CONT' }, { program: 'KIDS', level: 'K1', type: 'CONT' }]);
  check('Los alumnos del mismo registro también ocupan cupo (3.º con cupo 2 → rechazado)',
    probeIn(sched([]), dup).filter(m => /completo/.test(m)).length === 1 && /Alumno 3/.test(probeIn(sched([]), dup).find(m => /completo/.test(m)) ?? ''));
  const same = base(); same.students[0].person = { ...same.students[0].person, existingId: 'ALU-9' };
  check('Alumno existente con otra asesoría a la misma hora → rechazado', probeIn(sched([sch('1', { studentId: 'ALU-9' })]), same).some(m => /ya tiene una asesoría/.test(m)));

  // Se crea una asesoría real de la agenda por alumno (Reservado, primera asesoría, sede de la matrícula)
  const two = draftWith([{ program: 'PK', level: 'P1', type: 'CONT' }, { program: 'KIDS', level: 'K2', type: 'CONT' }]);
  two.students[0].counselingDate = '2026-10-12'; two.students[0].counselingTime = '15:00';
  two.students[1].counselingDate = '2026-10-13'; two.students[1].counselingTime = '17:00';
  two.promotion = { promotionId: 'PR1', groups: [['k0', 'k1']] };
  two.payments[quoteEnrollment(two, cat).units[0].key] = [usdPart(700)];
  const b = build(two, cat, { ...empty, schedules: [{ id: '5' } as any] });
  check('Guarda una primera asesoría por alumno', b.ok && b.batch!.schedules.length === 2, b.error);
  check('Asesoría con la fecha y hora de cada alumno',
    b.batch!.schedules[0].date === '2026-10-12' && b.batch!.schedules[0].time === '15:00' &&
    b.batch!.schedules[1].date === '2026-10-13' && b.batch!.schedules[1].time === '17:00');
  check('Asesoría: Reservado, primera, 60 min, programa/nivel y correlativo continuo',
    b.batch!.schedules.every(x => x.status === 'Reservado' && x.isFirst === true && x.duration === 60) &&
    b.batch!.schedules[0].program === 'Pre-Kids' && b.batch!.schedules[1].level === 'Kids 2' && b.batch!.schedules.map(x => x.id).join() === '6,7');
  check('Asesoría: sede de la matrícula, alumno vinculado y responsable = quien entrevistó',
    b.batch!.schedules.every(x => x.branchId === 'FIL-AYA') &&
    b.batch!.schedules[0].studentId === b.batch!.newStudents[0].id && b.batch!.schedules[1].studentId === b.batch!.newStudents[1].id &&
    b.batch!.schedules.every(x => x.responsible.length > 0 && x.responsible !== 'Por asignar'));
  const blocked = build(two, sched([sch('1', { date: '2026-10-12', time: '15:00' }), sch('2', { date: '2026-10-12', time: '15:00' })]), empty);
  check('Si el horario se llenó, no se guarda nada', !blocked.ok && /completo/.test(blocked.error ?? ''), blocked.error);
}

console.log(failed === 0 ? '\nTodo correcto.' : `\n${failed} caso(s) fallaron.`);
process.exit(failed === 0 ? 0 : 1);
