/**
 * Datos de ejemplo de personas, matrículas, planes, pagos y caja (los titulares y alumnos YA viven en la base: se cargan con
 * `supabase/seed/personas_de_ejemplo.sql`, generado desde aquí con `scripts/doc-personas-seed.ts`; el resto sigue en memoria), armados con las MISMAS reglas que el sistema usa al registrar
 * (`buildPaymentRecord`, `recomputePlan`, `installmentState`) para que ninguna pantalla encuentre datos que el flujo real no
 * podría producir. Las fechas son relativas a hoy (siempre hay casos visibles) y se verifican en `scripts/check-integrity.ts`.
 *
 * Los cinco casos que cubren las pantallas:
 *  1. Mateo Ruiz (Piura): plan de 6 cuotas al día; primera asesoría hoy, ya asistida.
 *  2. Sofia Castro (Chiclayo): plan de 6 cuotas con la cuota 3 vencida y pagada a medias (plan atrasado).
 *  3. Lucas Vega (Piura): matrícula caída con su solicitud aprobada; queda una deuda vencida y las cuotas futuras anuladas.
 *  4. Valentina Silva (Chiclayo): contado al día; su primera asesoría es en 2 días y aún no se verifican los materiales.
 *  5. Diego Torres (Piura): contado al día; su duración base está por vencer (alerta de vigencia).
 */
import type { CashMovement, DropRequest, Enrollment, Guardian, Installment, Payment, PaymentPart, Plan, Schedule, Student, Tracking } from '../context/DataContext';
import { buildPaymentRecord } from '../utils/payments';
import { installmentState, recomputePlan } from '../utils/planState';
import { addDaysISO, weekdayIndex } from '../utils/schedule';
import { addMonths } from '../utils/validity';

export interface PeopleSeed {
  guardians: Guardian[];
  students: Student[];
  enrollments: Enrollment[];
  plans: Plan[];
  payments: Payment[];
  cashMovements: CashMovement[];
  dropRequests: DropRequest[];
  /** Inicio de la primera asesoría de Diego Torres (su duración base está por vencer). */
  expiringStart: string;
}

const TC = 3.75;
const plain = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function buildPeopleSeed(today: string): PeopleSeed {
  const d = (offset: number) => addDaysISO(today, offset);
  const year = today.slice(0, 4);
  const expiringStart = (() => {
    const base = addMonths(addDaysISO(today, 10), -3);
    return weekdayIndex(base) === 6 ? addDaysISO(base, 1) : base; // domingo: sin atención
  })();
  const at = (iso: string, hh: string) => new Date(`${iso}T${hh}:00`).toISOString();
  const birth = (years: number) => addMonths(today, -(years * 12 + 4));

  // ------------------------------------------------------------ Titulares (el saldo, los alumnos y las matrículas se derivan)
  const holder = (n: number, names: string, lastNameP: string, lastNameM: string, doc: string, address: string, age: number): Guardian => ({
    id: `TIT-00${n}`, name: `${names} ${lastNameP} ${lastNameM}`, doc, docType: 'DNI', names, lastNameP, lastNameM, birthDate: birth(age),
    civilStatus: 'Casado(a)', phone: `98765432${n}`, email: `${plain(names.split(' ')[0])}.${plain(lastNameP)}@email.com`, parentesco: 'Padre/Madre', direccion: address,
  });
  const guardians: Guardian[] = [
    holder(1, 'Juan', 'Ruiz', 'Paredes', '45678901', 'Av. Grau 450, Piura', 38),
    holder(2, 'María', 'Castro', 'Lama', '45678902', 'Calle Lima 218, Chiclayo', 41),
    holder(3, 'Pedro', 'Vega', 'Soto', '45678903', 'Jr. Tacna 120, Piura', 44),
    holder(4, 'Ana', 'Silva', 'Reyes', '45678904', 'Av. Balta 905, Chiclayo', 33),
    holder(5, 'Carlos', 'Torres', 'Díaz', '45678905', 'Av. Sánchez Cerro 77, Piura', 46),
  ];

  // ------------------------------------------------------------ Alumnos (edad, estado, programa y titular se derivan)
  const pupil = (n: number, names: string, lastNameP: string, lastNameM: string, doc: string, age: number, guardianId: string, school: string, grade: string): Student => ({
    id: `ALU-00${n}`, doc, docType: 'DNI', name: `${names} ${lastNameP} ${lastNameM}`, names, lastNameP, lastNameM, birthDate: birth(age),
    guardianIds: [guardianId], relationship: 'Hijo(a)', occupationStatus: 'estudiando', institutionType: 'Colegio', colegio: school, grado: grade,
  });
  const students: Student[] = [
    pupil(1, 'Mateo', 'Ruiz', 'Paredes', '76543210', 8, 'TIT-001', 'I.E. San Miguel', '3.º primaria'),
    pupil(2, 'Sofia', 'Castro', 'Lama', '76543211', 14, 'TIT-002', 'I.E. Santa Rosa', '2.º secundaria'),
    pupil(3, 'Lucas', 'Vega', 'Soto', '76543212', 9, 'TIT-003', 'I.E. Cristo Rey', '4.º primaria'),
    pupil(4, 'Valentina', 'Silva', 'Reyes', '76543213', 5, 'TIT-004', 'Inicial Los Pinos', '5 años'),
    pupil(5, 'Diego', 'Torres', 'Díaz', '76543214', 15, 'TIT-005', 'I.E. Nuestra Señora', '4.º secundaria'),
  ];

  // ------------------------------------------------------------ Matrículas
  const mat = (n: number) => `MAT-${year}-00${n}`;
  const enrollment = (n: number, student: Student, programId: string, program: string, levelId: string, level: string, branchId: string, sede: string,
    dateISO: string, price: number, paymentTypeId: string, paymentTypeName: string, status: Enrollment['status'] = 'Activa'): Enrollment => ({
    id: mat(n), dateISO, studentId: student.id, student: student.name, guardianIds: [...(student.guardianIds)], programId, program, levelId, level, branchId, sede,
    asesor: 'María Torres', origen: ['Facebook Ads', 'Referido', 'Orgánico', 'Instagram', 'WhatsApp'][n - 1], origenId: String(n),
    status, assignedPrice: price, paymentTypeId, paymentTypeName, createdAt: at(dateISO, '10:00'), createdBy: 'Ana G.',
  });
  const dates = [d(-50), d(-65), d(-95), d(-2), addDaysISO(expiringStart, -3)];
  const enrollments: Enrollment[] = [
    enrollment(1, students[0], '1', 'Kids', '1', 'Nivel 1', 'FIL-002', 'Piura', dates[0], 1200, '4', 'Plan 6'),
    enrollment(2, students[1], '1', 'Kids', '2', 'Nivel 2', 'FIL-003', 'Chiclayo', dates[1], 1200, '4', 'Plan 6'),
    { ...enrollment(3, students[2], '1', 'Kids', '3', 'Nivel 3', 'FIL-002', 'Piura', dates[2], 2100, '4', 'Plan 6', 'Caída'), dropDate: d(-20), dropRequestId: 'CAI-001' },
    enrollment(4, students[3], '2', 'Pre-Kids', '4', 'Nivel 1', 'FIL-003', 'Chiclayo', dates[3], 1000, '1', 'Contado'),
    enrollment(5, students[4], '1', 'Kids', '1', 'Nivel 1', 'FIL-002', 'Piura', dates[4], 1500, '1', 'Contado'),
  ];

  // ------------------------------------------------------------ Cobros: de cada uno salen el pago, su caja y el cobro de la cuota
  interface Collection {
    id: string; enrollment: number; installment?: number; usd: number; date: string; user: string;
    parts: PaymentPart[]; serie: string; number: string; branchId: string;
  }
  const bank = (id: string, usd: number, op: string): PaymentPart[] => [{ id, currency: 'USD', amount: usd, method: 'Transferencia', bank: 'BCP', operationNumber: op, evidence: `${op}.jpg` }];
  const cash = (id: string, usd: number): PaymentPart[] => [{ id, currency: 'PEN', amount: Math.round(usd * TC * 100) / 100, exchangeRate: TC, method: 'Efectivo' }];
  const yape = (id: string, usd: number, op: string): PaymentPart[] => [{ id, currency: 'PEN', amount: Math.round(usd * TC * 100) / 100, exchangeRate: TC, method: 'Yape', operationNumber: op, evidence: `${op}.jpg` }];
  const collections: Collection[] = [
    { id: 'PAG-001', enrollment: 1, installment: 1, usd: 200, date: dates[0], user: 'Ana G.', parts: bank('PT1', 200, 'OP-4471'), serie: 'B001', number: '000123', branchId: 'FIL-002' },
    { id: 'PAG-002', enrollment: 1, installment: 2, usd: 200, date: d(-22), user: 'Carlos R.', parts: cash('PT2', 200), serie: 'B001', number: '000124', branchId: 'FIL-002' },
    { id: 'PAG-003', enrollment: 2, installment: 1, usd: 200, date: dates[1], user: 'Ana G.', parts: bank('PT3', 200, 'OP-4502'), serie: 'B001', number: '000125', branchId: 'FIL-003' },
    { id: 'PAG-004', enrollment: 2, installment: 2, usd: 200, date: d(-37), user: 'Carlos R.', parts: cash('PT4', 200), serie: 'B001', number: '000126', branchId: 'FIL-003' },
    { id: 'PAG-005', enrollment: 2, installment: 3, usd: 100, date: d(-8), user: 'Ana G.', parts: yape('PT5', 100, 'YP-8830'), serie: 'B001', number: '000127', branchId: 'FIL-003' },
    { id: 'PAG-006', enrollment: 3, installment: 1, usd: 350, date: dates[2], user: 'Ana G.', parts: bank('PT6', 350, 'OP-3911'), serie: 'F001', number: '000890', branchId: 'FIL-002' },
    { id: 'PAG-007', enrollment: 3, installment: 2, usd: 350, date: d(-67), user: 'Carlos R.', parts: bank('PT7', 350, 'OP-3975'), serie: 'F001', number: '000912', branchId: 'FIL-002' },
    { id: 'PAG-008', enrollment: 3, installment: 3, usd: 200, date: d(-38), user: 'Ana G.', parts: yape('PT8', 200, 'YP-7204'), serie: 'B001', number: '000501', branchId: 'FIL-002' },
    { id: 'PAG-009', enrollment: 4, usd: 1000, date: dates[3], user: 'Ana G.', parts: bank('PT9', 1000, 'OP-5120'), serie: 'B001', number: '000128', branchId: 'FIL-003' },
    { id: 'PAG-010', enrollment: 5, usd: 1500, date: dates[4], user: 'Carlos R.', parts: cash('PT10', 1500), serie: 'B001', number: '000129', branchId: 'FIL-002' },
  ];

  const payments: Payment[] = [];
  const cashMovements: CashMovement[] = [];
  for (const c of collections) {
    const e = enrollments[c.enrollment - 1];
    const built = buildPaymentRecord({
      id: c.id, date: c.date, student: e.student, user: c.user, enrollmentIds: [e.id], branchId: c.branchId, cashDate: at(c.date, '10:30'),
      concept: c.installment ? `Pago de Cuota ${c.installment}` : 'Contado',
      amountUSD: c.usd, parts: c.parts, document: { type: c.serie.startsWith('F') ? 'Factura' : 'Boleta', serie: c.serie, number: c.number },
      cashConcept: c.installment ? 'Ingreso cuota' : 'Ingreso matrícula (contado)', cashReference: `${e.id} / ${e.student}`,
    });
    payments.push(built.payment);
    for (const m of built.cashMovements) cashMovements.push({ ...m, id: `CJ-${String(cashMovements.length + 1).padStart(3, '0')}`, user: c.user });
  }
  // Egreso manual de la caja en soles (no viene de un pago)
  cashMovements.push({
    id: `CJ-${String(cashMovements.length + 1).padStart(3, '0')}`, date: at(d(-3), '17:45'), kind: 'Egreso', concept: 'Egreso', reference: 'Pago Proveedor Limpieza',
    currency: 'PEN', amount: 350, amountUSD: Math.round((350 / TC) * 100) / 100, exchangeRate: TC, branchId: 'FIL-002', method: 'Efectivo', user: 'Admin', status: 'Aplicado',
  });

  // ------------------------------------------------------------ Planes: cuotas con su cobro; el saldo y el estado los escribe recomputePlan
  const planOf = (n: number, id: string, type: string, total: number, installments: Installment[], status: Plan['status'] = 'Al día'): Plan =>
    recomputePlan({ id, mat: mat(n), type, total, balance: total, status, installments }, today);
  const cuota = (n: number, amount: number, due: string, annulledByDrop = false): Installment =>
    ({ id: `C${n}`, name: `Cuota ${n}`, amount, balance: amount, dueDateISO: due, status: 'Pendiente', payments: [], ...(annulledByDrop ? { dropAnnulled: true } : {}) });
  const schedule = (count: number, amount: number, startISO: string): Installment[] =>
    Array.from({ length: count }, (_, i) => cuota(i + 1, amount, addDaysISO(startISO, 30 * i)));
  /** Aplica a las cuotas lo cobrado (cada cobro lleva el id del pago global) y deja su estado calculado a hoy. */
  const withCollections = (enrollmentN: number, list: Installment[]): Installment[] => list.map(i => {
    const own = collections.filter(c => c.enrollment === enrollmentN && c.installment === Number(i.id.slice(1)));
    const payments = own.map((c, k) => ({ id: `P${k + 1}`, paymentId: c.id, date: c.date, amount: c.usd, receipt: `${c.serie}-${c.number}` }));
    const paid = payments.reduce((a, p) => a + p.amount, 0);
    const next: Installment = { ...i, payments, balance: Math.max(0, Math.round((i.amount - paid) * 100) / 100) };
    return i.dropAnnulled ? { ...next, status: 'Anulada', balance: 0, note: 'Anulada por caída de la matrícula' } : { ...next, status: installmentState(next, today) };
  });

  const plans: Plan[] = [
    planOf(1, 'PLN-001', 'Plan 6', 1200, withCollections(1, schedule(6, 200, dates[0]))),
    planOf(2, 'PLN-002', 'Plan 6', 1200, withCollections(2, schedule(6, 200, dates[1]))),
    planOf(3, 'PLN-003', 'Plan 6', 2100, withCollections(3, [
      ...schedule(3, 350, dates[2]),
      ...[4, 5, 6].map(n => cuota(n, 350, addDaysISO(dates[2], 30 * (n - 1)), true)),
    ]), 'Caída'),
    planOf(4, 'PLN-004', 'Contado', 1000, []),
    planOf(5, 'PLN-005', 'Contado', 1500, []),
  ];

  const dropRequests: DropRequest[] = [{
    id: 'CAI-001', enrollmentId: mat(3), studentId: students[2].id, requestedAt: at(d(-19), '11:00'), requestedBy: 'Ana G.', reason: 'Motivos económicos',
    detail: 'El titular indica que no podrá continuar con los pagos.', effectiveDate: d(-20), status: 'Aprobada', resolvedAt: at(d(-18), '09:30'), resolvedBy: 'Superadmin',
    resolutionNote: 'Aprobada. Las cuotas futuras se anularon; queda pendiente la cuota 3.',
    effects: { annulledInstallments: 3, annulledUSD: 1050, overdueInstallments: 1, overdueUSD: 150, overdueForgiven: false, paidUSD: 900, cancelledSchedules: 1, removedActivities: 0, studentDeactivated: true },
  }];

  return { guardians, students, enrollments, plans, payments, cashMovements, dropRequests, expiringStart };
}

/** Día de ejemplo a `offset` días de hoy (nunca domingo: no hay atención). */
export const seedDay = (offset: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  while (d.getDay() === 0) d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Asesorías de ejemplo: la primera de Mateo es hoy, la de Valentina en 2 días y la de Diego fue hace casi 3 meses. */
export const buildScheduleSeed = (people: PeopleSeed): Schedule[] => [
    { id: 'SES-001', student: people.students[0].name, studentId: people.students[0].id, branchId: 'FIL-002', program: 'Kids', level: 'Nivel 1', date: seedDay(0), time: '16:00', duration: 60, responsible: 'Lic. María Torres', status: 'Asistió', isFirst: true, registrationId: 'REG-SEED-1', enrollmentId: people.enrollments[0].id },
    { id: 'SES-002', student: people.students[1].name, studentId: people.students[1].id, branchId: 'FIL-003', program: 'Kids', level: 'Nivel 2', date: seedDay(0), time: '17:00', duration: 60, responsible: 'Lic. Juan Pérez', status: 'Reservado' },
    { id: 'SES-003', student: people.students[2].name, studentId: people.students[2].id, branchId: 'FIL-002', program: 'Kids', level: 'Nivel 3', date: seedDay(1), time: '16:00', duration: 60, responsible: 'Lic. María Torres', status: 'Cancelado' },
    { id: 'SES-004', student: people.students[3].name, studentId: people.students[3].id, branchId: 'FIL-003', program: 'Pre-Kids', level: 'Nivel 1', date: seedDay(2), time: '17:00', duration: 60, responsible: 'Lic. Juan Pérez', status: 'Reservado', isFirst: true, registrationId: 'REG-SEED-2', enrollmentId: people.enrollments[3].id },
    { id: 'SES-005', student: people.students[4].name, studentId: people.students[4].id, branchId: 'FIL-002', program: 'Kids', level: 'Nivel 1', date: seedDay(3), time: '18:00', duration: 60, responsible: 'Lic. María Torres', status: 'Reservado' },
    { id: 'SES-006', student: people.students[4].name, studentId: people.students[4].id, branchId: 'FIL-002', program: 'Kids', level: 'Nivel 1', date: people.expiringStart, time: '16:00', duration: 60, responsible: 'Lic. María Torres', status: 'Asistió', isFirst: true, registrationId: 'REG-SEED-3', enrollmentId: people.enrollments[4].id },
  ];

/** Sesiones registradas de ejemplo (seguimiento de los alumnos). */
export const buildTrackingSeed = (people: PeopleSeed): Tracking[] => [
    { id: 'TRK-001', studentId: 'ALU-001', date: '2026-03-24', status: 'Asistió', metrics: { modulo: 'Módulo 3', velocidad: 250, comprension: 85 }, observations: 'Buen progreso en lectura rápida.' },
    { id: 'TRK-002', studentId: 'ALU-001', date: '2026-03-17', status: 'Asistió', metrics: { modulo: 'Módulo 3', velocidad: 220, comprension: 80 }, observations: 'Se recomienda repasar ejercicios de fijación.' },
    { id: 'TRK-003', studentId: 'ALU-001', date: '2026-03-10', status: 'Faltó', metrics: null, observations: 'Avisó con anticipación por motivos de salud.' },
    { id: 'TRK-004', studentId: 'ALU-002', date: '2026-03-25', status: 'Asistió', metrics: { modulo: 'Módulo 5', velocidad: 300, comprension: 90 }, observations: 'Excelente comprensión.' },
    { id: 'TRK-006', studentId: 'ALU-005', scheduleId: 'SES-006', date: people.expiringStart, status: 'Asistió', metrics: { nivel: 'Nivel 1', sesion: 'Sesión 1', velocidad: 110, comprension: 75 }, observations: 'Primera asesoría: diagnóstico inicial.', checklist: { guardianAttended: true, methodologyExplained: true, itemsExplained: true } },
    { id: 'TRK-005', studentId: 'ALU-004', date: '2026-03-26', status: 'Asistió', metrics: { nivel: 'Nivel 1', sesion: 'Sesión 2', velocidad: 100, comprension: 70 }, observations: 'Mejorando la pronunciación.' },
  ];
