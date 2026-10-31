/**
 * Integridad del modelo de datos (funciones puras): detecta lo que el flujo real nunca debería producir.
 *
 * Las reglas del modelo (ver `identity.ts`) son tres: las relaciones se hacen por id, lo derivable no se guarda y las fechas se
 * guardan solo en ISO. Aquí se comprueban de punta a punta:
 *  - **Vínculos:** todo id apunta a un registro que existe (alumno ↔ titular ↔ matrícula ↔ plan ↔ pago ↔ caja ↔ agenda).
 *  - **Copias de nombre:** la copia que guardan la matrícula y la agenda coincide con el nombre de origen.
 *  - **Plan:** el saldo y el estado guardados coinciden con lo que calculan las cuotas; cada cobro de una cuota existe como pago.
 *  - **Fechas:** ISO válidas. **Ids:** sin repetidos y con el prefijo de su tipo.
 *
 * Lo usan `scripts/check-integrity.ts` (sobre los datos de ejemplo) y cualquier carga futura de datos reales.
 */
import type {
  Assignment, Branch, CashMovement, Contract, DropRequest, Enrollment, Guardian, Level, Payment, Plan, Program, Schedule, Staff, Student, Tracking, User,
} from '../context/DataContext';
import { ID_PREFIX } from './ids';
import { isOpen, recomputePlan } from './planState';

export interface IntegrityData {
  guardians: Guardian[];
  students: Student[];
  enrollments: Enrollment[];
  plans: Plan[];
  payments: Payment[];
  cashMovements: CashMovement[];
  schedules: Schedule[];
  trackings: Tracking[];
  dropRequests: DropRequest[];
  branches: Branch[];
  programs: Program[];
  levels: Level[];
  staff: Staff[];
  contracts: Contract[];
  assignments: Assignment[];
  users: User[];
}

export interface IntegrityIssue {
  /** Código estable de la regla (para filtrar y para las pruebas). */
  code: string;
  /** Registro afectado (`tipo:id`). */
  ref: string;
  message: string;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const money = (n: number) => Math.round(n * 100) / 100;

export function checkIntegrity(d: IntegrityData, today: string): IntegrityIssue[] {
  const out: IntegrityIssue[] = [];
  const add = (code: string, ref: string, message: string) => out.push({ code, ref, message });
  const has = <T extends { id: string }>(list: T[], id: string | undefined) => !!id && list.some(x => x.id === id);

  // ---- Ids: sin repetidos y con el prefijo de su tipo
  const prefixed: [string, { id: string }[], string][] = [
    ['alumno', d.students, ID_PREFIX.alumno], ['titular', d.guardians, ID_PREFIX.titular], ['personal', d.staff, ID_PREFIX.personal],
    ['matrícula', d.enrollments, ID_PREFIX.matricula], ['plan', d.plans, ID_PREFIX.plan], ['pago', d.payments, ID_PREFIX.pago],
    ['movimiento de caja', d.cashMovements, ID_PREFIX.movimientoCaja], ['asesoría', d.schedules, ID_PREFIX.sesion], ['seguimiento', d.trackings, ID_PREFIX.seguimiento],
    ['contrato', d.contracts, ID_PREFIX.contrato], ['asignación', d.assignments, ID_PREFIX.asignacion],
  ];
  for (const [label, list, prefix] of prefixed) {
    const seen = new Set<string>();
    for (const x of list) {
      if (seen.has(x.id)) add('id-repetido', `${label}:${x.id}`, `El id ${x.id} está repetido entre los registros de ${label}.`);
      seen.add(x.id);
      if (!new RegExp(`^${prefix}-`).test(x.id)) add('id-prefijo', `${label}:${x.id}`, `El id ${x.id} no lleva el prefijo ${prefix}- de ${label}.`);
    }
  }

  // ---- Alumnos y titulares
  for (const s of d.students) {
    if (!ISO.test(s.birthDate ?? '')) add('fecha-invalida', `alumno:${s.id}`, `El alumno ${s.id} no tiene una fecha de nacimiento ISO.`);
    for (const g of s.guardianIds) if (!has(d.guardians, g)) add('vinculo', `alumno:${s.id}`, `El alumno ${s.id} apunta al titular ${g}, que no existe.`);
    if (s.guardianIds.length > 0 && !s.relationship) add('parentesco', `alumno:${s.id}`, `El alumno ${s.id} tiene titular pero no indica el parentesco.`);
  }

  // ---- Matrículas
  for (const e of d.enrollments) {
    const ref = `matrícula:${e.id}`;
    const student = d.students.find(s => s.id === e.studentId);
    if (!student) add('vinculo', ref, `La matrícula ${e.id} apunta al alumno ${e.studentId}, que no existe.`);
    else if (student.name !== e.student) add('copia-nombre', ref, `La matrícula ${e.id} copia el nombre «${e.student}» pero el alumno se llama «${student.name}».`);
    for (const g of e.guardianIds) if (!has(d.guardians, g)) add('vinculo', ref, `La matrícula ${e.id} apunta al titular ${g}, que no existe.`);
    if (!ISO.test(e.dateISO)) add('fecha-invalida', ref, `La matrícula ${e.id} no tiene fecha ISO.`);
    const program = d.programs.find(p => p.id === e.programId);
    if (!program) add('vinculo', ref, `La matrícula ${e.id} apunta al programa ${e.programId}, que no existe.`);
    else if (program.name !== e.program) add('copia-nombre', ref, `La matrícula ${e.id} copia el programa «${e.program}» pero es «${program.name}».`);
    if (e.levelId) {
      const level = d.levels.find(l => l.id === e.levelId);
      if (!level) add('vinculo', ref, `La matrícula ${e.id} apunta al nivel ${e.levelId}, que no existe.`);
      else {
        if (level.name !== e.level) add('copia-nombre', ref, `La matrícula ${e.id} copia el nivel «${e.level}» pero es «${level.name}».`);
        if (level.programId !== e.programId) add('vinculo', ref, `El nivel ${e.levelId} de la matrícula ${e.id} no pertenece a su programa.`);
      }
    }
    const branch = d.branches.find(b => b.id === e.branchId);
    if (!branch) add('vinculo', ref, `La matrícula ${e.id} apunta a la sede ${e.branchId}, que no existe.`);
    else if (e.sede !== undefined && branch.name !== e.sede) add('copia-nombre', ref, `La matrícula ${e.id} copia la sede «${e.sede}» pero es «${branch.name}».`);
    if (e.status === 'Caída') {
      if (!e.dropDate) add('caida', ref, `La matrícula ${e.id} está caída pero no tiene fecha de caída.`);
      if (e.dropRequestId && !has(d.dropRequests, e.dropRequestId)) add('vinculo', ref, `La matrícula ${e.id} apunta a la solicitud ${e.dropRequestId}, que no existe.`);
      const plan = d.plans.find(p => p.mat === e.id);
      if (plan && plan.status !== 'Caída') add('caida', ref, `La matrícula ${e.id} cayó pero su plan ${plan.id} sigue «${plan.status}».`);
    }
  }

  // ---- Planes, cuotas y cobros
  const planOf = new Map<string, string>();
  for (const p of d.plans) {
    const ref = `plan:${p.id}`;
    if (!has(d.enrollments, p.mat)) add('vinculo', ref, `El plan ${p.id} apunta a la matrícula ${p.mat}, que no existe.`);
    if (planOf.has(p.mat)) add('plan-duplicado', ref, `La matrícula ${p.mat} tiene más de un plan (${planOf.get(p.mat)} y ${p.id}).`);
    planOf.set(p.mat, p.id);
    const calc = recomputePlan(p, today);
    if (money(calc.balance) !== money(p.balance)) add('saldo-plan', ref, `El plan ${p.id} guarda saldo ${p.balance} pero sus cuotas suman ${calc.balance}.`);
    if (calc.status !== p.status) add('estado-plan', ref, `El plan ${p.id} guarda el estado «${p.status}» pero sus cuotas dicen «${calc.status}».`);
    const seen = new Set<string>();
    for (const i of p.installments) {
      const iref = `cuota:${p.id}/${i.id}`;
      if (seen.has(i.id)) add('id-repetido', iref, `La cuota ${i.id} está repetida en el plan ${p.id}.`);
      seen.add(i.id);
      if (!ISO.test(i.dueDateISO)) add('fecha-invalida', iref, `La cuota ${i.id} del plan ${p.id} no tiene vencimiento ISO.`);
      const paid = money(i.payments.reduce((a, x) => a + x.amount, 0));
      if (isOpen(i) || i.status === 'Pagada' || i.status === 'Parcial') {
        if (!i.variable && money(i.amount - paid) !== money(i.balance)) add('saldo-cuota', iref, `La cuota ${i.id} del plan ${p.id}: monto ${i.amount} − cobrado ${paid} no da su saldo ${i.balance}.`);
      }
      for (const c of i.payments) {
        if (!c.paymentId) add('cobro-sin-pago', iref, `Un cobro de la cuota ${i.id} del plan ${p.id} no está ligado a un pago.`);
        else if (!has(d.payments, c.paymentId)) add('vinculo', iref, `Un cobro de la cuota ${i.id} apunta al pago ${c.paymentId}, que no existe.`);
        if (!ISO.test(c.date)) add('fecha-invalida', iref, `Un cobro de la cuota ${i.id} no tiene fecha ISO.`);
      }
    }
  }

  // ---- Pagos y caja
  const collected = new Map<string, number>();
  for (const p of d.plans) for (const i of p.installments) for (const c of i.payments) if (c.paymentId) collected.set(c.paymentId, money((collected.get(c.paymentId) ?? 0) + c.amount));
  const hasInstallments = (paymentId: string) => d.plans.some(p => p.installments.some(i => i.payments.some(c => c.paymentId === paymentId)));
  for (const p of d.payments) {
    const ref = `pago:${p.id}`;
    if (!ISO.test(p.date)) add('fecha-invalida', ref, `El pago ${p.id} no tiene fecha ISO.`);
    for (const id of p.enrollmentIds ?? []) if (!has(d.enrollments, id)) add('vinculo', ref, `El pago ${p.id} apunta a la matrícula ${id}, que no existe.`);
    if (p.status === 'Aprobado' && hasInstallments(p.id) && money(collected.get(p.id) ?? 0) !== money(p.amount)) {
      add('pago-cuotas', ref, `El pago ${p.id} es de ${p.amount} pero las cuotas registran ${collected.get(p.id) ?? 0}.`);
    }
    if (p.status === 'Aprobado' && !d.cashMovements.some(m => m.paymentId === p.id && m.kind === 'Ingreso')) add('pago-sin-caja', ref, `El pago ${p.id} no dejó movimiento de caja.`);
  }
  for (const m of d.cashMovements) {
    const ref = `caja:${m.id}`;
    if (m.paymentId && !has(d.payments, m.paymentId)) add('vinculo', ref, `El movimiento ${m.id} apunta al pago ${m.paymentId}, que no existe.`);
    if (m.branchId && !has(d.branches, m.branchId)) add('vinculo', ref, `El movimiento ${m.id} apunta a la sede ${m.branchId}, que no existe.`);
    if (!m.branchId) add('caja-sin-sede', ref, `El movimiento ${m.id} no tiene sede.`);
  }

  // ---- Agenda y seguimiento
  for (const s of d.schedules) {
    const ref = `asesoría:${s.id}`;
    const student = d.students.find(x => x.id === s.studentId);
    if (!student) add('vinculo', ref, `La asesoría ${s.id} apunta al alumno ${s.studentId}, que no existe.`);
    else if (student.name !== s.student) add('copia-nombre', ref, `La asesoría ${s.id} copia el nombre «${s.student}» pero el alumno se llama «${student.name}».`);
    if (s.branchId && !has(d.branches, s.branchId)) add('vinculo', ref, `La asesoría ${s.id} apunta a la sede ${s.branchId}, que no existe.`);
    if (!ISO.test(s.date)) add('fecha-invalida', ref, `La asesoría ${s.id} no tiene fecha ISO.`);
    if (s.enrollmentId) {
      const e = d.enrollments.find(x => x.id === s.enrollmentId);
      if (!e) add('vinculo', ref, `La asesoría ${s.id} apunta a la matrícula ${s.enrollmentId}, que no existe.`);
      else if (e.studentId !== s.studentId) add('vinculo', ref, `La asesoría ${s.id} es de otro alumno que su matrícula ${e.id}.`);
    }
    if (s.isFirst && !s.enrollmentId) add('primera-sin-matricula', ref, `La primera asesoría ${s.id} no indica su matrícula.`);
  }
  for (const t of d.trackings) {
    if (!has(d.students, t.studentId)) add('vinculo', `seguimiento:${t.id}`, `El seguimiento ${t.id} apunta al alumno ${t.studentId}, que no existe.`);
    if (t.scheduleId && !has(d.schedules, t.scheduleId)) add('vinculo', `seguimiento:${t.id}`, `El seguimiento ${t.id} apunta a la asesoría ${t.scheduleId}, que no existe.`);
  }

  // ---- Personal
  for (const c of d.contracts) if (!has(d.staff, c.staffId)) add('vinculo', `contrato:${c.id}`, `El contrato ${c.id} apunta al trabajador ${c.staffId}, que no existe.`);
  for (const a of d.assignments) {
    if (!has(d.staff, a.staffId)) add('vinculo', `asignación:${a.id}`, `La asignación ${a.id} apunta al trabajador ${a.staffId}, que no existe.`);
    if (!d.branches.some(b => b.name === a.branch)) add('vinculo', `asignación:${a.id}`, `La asignación ${a.id} apunta a la sede «${a.branch}», que no existe.`);
  }
  for (const u of d.users) if (u.staffId && !has(d.staff, u.staffId)) add('vinculo', `usuario:${u.id}`, `La cuenta ${u.id} apunta al trabajador ${u.staffId}, que no existe.`);
  for (const s of d.staff) if (!ISO.test(s.birthDate)) add('fecha-invalida', `personal:${s.id}`, `El trabajador ${s.id} no tiene fecha de nacimiento ISO.`);

  return out;
}
