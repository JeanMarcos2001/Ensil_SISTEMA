/**
 * Verificación del modelo de datos: identidad por id, datos derivados (no guardados), fechas ISO, ids sin repetir e integridad de los
 * datos de ejemplo de punta a punta (alumno ↔ titular ↔ matrícula ↔ plan ↔ pago ↔ caja ↔ agenda).
 * Ejecutar: npx tsx scripts/check-integrity.ts
 */
import type { Enrollment, Schedule } from '../src/context/DataContext';
import { buildPeopleSeed, buildScheduleSeed, buildTrackingSeed } from '../src/data/seedPeople';
import { seedAssignments, seedBranches, seedContracts, seedLevels, seedPrograms, seedStaff, seedUsers } from '../src/data/seedCatalog';
import { checkIntegrity, type IntegrityData } from '../src/utils/dataIntegrity';
import { ageOn } from '../src/utils/dates';
import {
  ageText, holderNameOfEnrollment, holderNameOfPlan, holderNameOfStudent, studentAge, studentProgramOf, studentStatus, studentsOfGuardian, syncCatalogLabels, syncStudentName,
} from '../src/utils/identity';
import { createIdAllocator, nextSequentialId } from '../src/utils/ids';
import { daysOverdue, installmentState, nextInstallment, planState, recomputePlan } from '../src/utils/planState';
import { guardianBalance } from '../src/utils/guardianStatement';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : ` -> ${detail}`}`);
  if (!ok) failed++;
};

const TODAY = '2026-10-30';
const seed = buildPeopleSeed(TODAY);
const data: IntegrityData = {
  guardians: seed.guardians, students: seed.students, enrollments: seed.enrollments, plans: seed.plans, payments: seed.payments, cashMovements: seed.cashMovements,
  schedules: buildScheduleSeed(seed), trackings: buildTrackingSeed(seed), dropRequests: seed.dropRequests, branches: seedBranches(), programs: seedPrograms(), levels: seedLevels(),
  staff: seedStaff(), contracts: seedContracts(), assignments: seedAssignments(), users: seedUsers(),
};

// ---------------------------------------------------------------- Los datos de ejemplo cumplen el modelo
const issues = checkIntegrity(data, TODAY);
check('Los datos de ejemplo no tienen ninguna inconsistencia', issues.length === 0, issues.slice(0, 5).map(i => `${i.code}: ${i.message}`).join(' | '));
check('Hay datos de ejemplo de cada tipo (el chequeo no es vacío)', seed.students.length === 5 && seed.enrollments.length === 5 && seed.plans.length === 5 && seed.payments.length === 10 && data.schedules.length > 0);

// ---------------------------------------------------------------- El chequeo detecta lo que debe (casos rotos a propósito)
const broken = (patch: (d: IntegrityData) => IntegrityData) => checkIntegrity(patch(structuredClone(data)), TODAY);
const codes = (list: ReturnType<typeof broken>) => [...new Set(list.map(i => i.code))].join();
check('Alumno que apunta a un titular inexistente', codes(broken(d => ({ ...d, students: d.students.map((s, i) => (i === 0 ? { ...s, guardianIds: ['TIT-999'] } : s)) }))).includes('vinculo'));
check('Matrícula sin alumno', broken(d => ({ ...d, enrollments: d.enrollments.map((e, i) => (i === 0 ? { ...e, studentId: 'ALU-999' } : e)) })).some(i => i.code === 'vinculo' && /alumno ALU-999/.test(i.message)));
check('Copia de nombre desfasada en la matrícula y en la agenda', (() => {
  const r = broken(d => ({ ...d, students: d.students.map((s, i) => (i === 0 ? { ...s, name: 'Otro Nombre' } : s)) }));
  return r.some(i => i.code === 'copia-nombre' && i.ref.startsWith('matrícula')) && r.some(i => i.code === 'copia-nombre' && i.ref.startsWith('asesoría'));
})());
check('Saldo y estado del plan desfasados de sus cuotas', (() => {
  const r = broken(d => ({ ...d, plans: d.plans.map((p, i) => (i === 0 ? { ...p, balance: 1, status: 'Atrasado' as const } : p)) }));
  return r.some(i => i.code === 'saldo-plan') && r.some(i => i.code === 'estado-plan');
})());
check('Cobro de una cuota sin pago, o con un pago que no existe', (() => {
  const r = broken(d => ({ ...d, plans: d.plans.map((p, i) => (i === 0 ? { ...p, installments: p.installments.map(x => ({ ...x, payments: x.payments.map(c => ({ ...c, paymentId: 'PAG-999' })) })) } : p)) }));
  return r.some(i => i.code === 'vinculo' && /PAG-999/.test(i.message));
})());
check('Pago cuyo monto no coincide con lo cobrado en las cuotas', broken(d => ({ ...d, payments: d.payments.map((p, i) => (i === 0 ? { ...p, amount: 999 } : p)) })).some(i => i.code === 'pago-cuotas'));
check('Fecha que no es ISO (matrícula con texto «24 Mar 2024»)', broken(d => ({ ...d, enrollments: d.enrollments.map((e, i) => (i === 0 ? { ...e, dateISO: '24 Mar 2024' } : e)) })).some(i => i.code === 'fecha-invalida'));
check('Id repetido y id sin el prefijo de su tipo', (() => {
  const r = broken(d => ({ ...d, students: [...d.students, { ...d.students[0] }, { ...d.students[1], id: 'XYZ-1' }] }));
  return r.some(i => i.code === 'id-repetido') && r.some(i => i.code === 'id-prefijo');
})());
check('Matrícula caída cuyo plan no cayó', broken(d => ({ ...d, plans: d.plans.map(p => (p.mat === d.enrollments[2].id ? { ...p, status: 'Al día' as const } : p)) })).some(i => i.code === 'caida'));
check('Asesoría de otro alumno que su matrícula', broken(d => ({ ...d, schedules: d.schedules.map(s => (s.enrollmentId ? { ...s, studentId: 'ALU-002', student: d.students[1].name } : s)) })).some(i => i.code === 'vinculo' && /otro alumno/.test(i.message)));

// ---------------------------------------------------------------- Lo derivable no se guarda: titular, estado, programa, edad
const [mateo, sofia, lucas, valentina, diego] = seed.students;
check('Titular del alumno: el primer vínculo', holderNameOfStudent(mateo, seed.guardians) === 'Juan Ruiz Paredes' && studentsOfGuardian(seed.guardians[0], seed.students).map(s => s.id).join() === 'ALU-001');
check('Un alumno independiente es su propio titular', holderNameOfStudent({ name: 'Luz Ruiz', guardianIds: [] }, seed.guardians) === 'Luz Ruiz');
check('Si se renombra al titular, todo lo que lo muestra lo muestra nuevo (no hay copia)', (() => {
  const renamed = seed.guardians.map((g, i) => (i === 0 ? { ...g, name: 'Juan Carlos Ruiz Paredes' } : g));
  return holderNameOfStudent(mateo, renamed) === 'Juan Carlos Ruiz Paredes' && holderNameOfEnrollment(seed.enrollments[0], seed.students, renamed) === 'Juan Carlos Ruiz Paredes'
    && holderNameOfPlan(seed.plans[0], seed.enrollments, seed.students, renamed) === 'Juan Carlos Ruiz Paredes';
})());
check('Titular del plan = titular de su matrícula', holderNameOfPlan(seed.plans[1], seed.enrollments, seed.students, seed.guardians) === 'María Castro Lama');
check('Estado del alumno: activo, inactivo (todas caídas) y sin matrícula', studentStatus(mateo.id, seed.enrollments) === 'Activo' && studentStatus(lucas.id, seed.enrollments) === 'Inactivo' && studentStatus('ALU-404', seed.enrollments) === 'Sin matrícula');
check('El estado se mueve solo: si cae la única matrícula activa, el alumno pasa a inactivo y al reactivar vuelve', (() => {
  const dropped: Enrollment[] = seed.enrollments.map(e => (e.studentId === mateo.id ? { ...e, status: 'Caída' as const } : e));
  const back: Enrollment[] = dropped.map(e => (e.studentId === mateo.id ? { ...e, status: 'Activa' as const } : e));
  return studentStatus(mateo.id, dropped) === 'Inactivo' && studentStatus(mateo.id, back) === 'Activo';
})());
check('Con otra matrícula activa el alumno sigue activo', studentStatus('ALU-1', [{ studentId: 'ALU-1', status: 'Caída' }, { studentId: 'ALU-1', status: 'Activa' }] as Enrollment[]) === 'Activo');
check('Programa del alumno = el de su matrícula más reciente', studentProgramOf(mateo.id, seed.enrollments) === 'Kids - Nivel 1' && studentProgramOf(valentina.id, seed.enrollments) === 'Pre-Kids - Nivel 1' && studentProgramOf('ALU-404', seed.enrollments) === '');
check('Si el alumno pasa de nivel, el programa mostrado cambia sin tocar su ficha', (() => {
  const later: Enrollment = { ...seed.enrollments[0], id: 'MAT-X', dateISO: '2026-10-29', level: 'Nivel 2', levelId: '2' };
  return studentProgramOf(mateo.id, [...seed.enrollments, later]) === 'Kids - Nivel 2';
})());
check('La edad se calcula de la fecha de nacimiento y sube sola con los años', studentAge(mateo, TODAY) === 8 && studentAge(sofia, TODAY) === 14 && studentAge({ birthDate: mateo.birthDate }, '2027-12-31') === 9);
check('Edad: cumpleaños, fecha inválida y texto', ageOn('2018-10-30', '2026-10-29') === 7 && ageOn('2018-10-30', '2026-10-30') === 8 && ageOn('x', TODAY) === null && ageText(1) === '1 año' && ageText(8) === '8 años' && ageText(null) === '—');
check('Los alumnos de ejemplo no guardan edad, titular, estado ni programa', seed.students.every(s => !('age' in s) && !('titular' in s) && !('status' in s) && !('program' in s)));
check('Los titulares de ejemplo no guardan contadores ni saldo', seed.guardians.every(g => !('students' in g) && !('enrollments' in g) && !('balance' in g)));
check('Los planes de ejemplo no guardan titular ni próxima cuota', seed.plans.every(p => !('titular' in p) && !('next' in p)));

// ---------------------------------------------------------------- Copias de nombre: una sola puerta
const agenda: Schedule[] = data.schedules;
check('Renombrar al alumno corrige su matrícula y su agenda, y solo las suyas', (() => {
  const r = syncStudentName(mateo.id, 'Mateo A. Ruiz', seed.enrollments, agenda);
  return r.changed && r.enrollments.filter(e => e.student === 'Mateo A. Ruiz').length === 1 && r.schedules.filter(s => s.student === 'Mateo A. Ruiz').every(s => s.studentId === mateo.id)
    && r.enrollments.filter(e => e.studentId !== mateo.id).every((e, i) => e === seed.enrollments.filter(x => x.studentId !== mateo.id)[i]);
})());
check('Sin cambio de nombre no se toca nada', !syncStudentName(mateo.id, mateo.name, seed.enrollments, agenda).changed);
check('El comprobante ya emitido conserva el nombre de ese día', seed.payments[0].student === mateo.name && syncStudentName(mateo.id, 'Nuevo', seed.enrollments, agenda).changed);
check('Renombrar la sede, el programa o el nivel corrige la matrícula (por id)', (() => {
  const r = syncCatalogLabels(seed.enrollments, agenda, {
    branches: data.branches.map(b => (b.id === 'FIL-002' ? { ...b, name: 'Piura Centro' } : b)), programs: data.programs.map(p => (p.id === '1' ? { ...p, name: 'Kids Plus' } : p)), levels: data.levels,
  });
  return r.enrollments[0].sede === 'Piura Centro' && r.enrollments[0].program === 'Kids Plus' && r.enrollments[1].sede === 'Chiclayo' && r.enrollments[3].program === 'Pre-Kids';
})());
check('Si el id del catálogo ya no existe, la matrícula conserva lo que decía', syncCatalogLabels(seed.enrollments, agenda, { branches: [], programs: [], levels: [] }).enrollments[0].sede === 'Piura');

// ---------------------------------------------------------------- Planes: estado calculado, único escritor
check('Los planes de ejemplo cubren al día, atrasado, caído y contado', seed.plans.map(p => planState(p, TODAY)).join() === 'Al día,Atrasado,Caída,Al día,Al día');
check('Saldo del plan = suma de sus cuotas abiertas', seed.plans.map(p => p.balance).join() === '800,700,150,0,0');
check('La próxima cuota se calcula (no se guarda): la más cercana por cobrar', nextInstallment(seed.plans[0])?.name === 'Cuota 3' && nextInstallment(seed.plans[1])?.name === 'Cuota 3' && nextInstallment(seed.plans[3]) === undefined);
check('Plan caído: las cuotas futuras quedan anuladas y la vencida sigue como deuda', seed.plans[2].installments.filter(i => i.status === 'Anulada').length === 3 && nextInstallment(seed.plans[2])?.balance === 150);
check('Cuota vencida: el estado se calcula con la fecha, aunque lo guardado diga otra cosa', (() => {
  const c = seed.plans[1].installments[2];
  return installmentState({ ...c, status: 'Pendiente' }, TODAY) === 'Vencida' && daysOverdue(c, TODAY) === 5 && installmentState({ ...c, status: 'Pendiente' }, '2026-10-20') === 'Parcial';
})());
check('recomputePlan es idempotente', seed.plans.every(p => JSON.stringify(recomputePlan(p, TODAY)) === JSON.stringify(p)));
check('Cada pago de ejemplo tiene su movimiento de caja, con sede y en su moneda', seed.payments.every(p => seed.cashMovements.some(m => m.paymentId === p.id && !!m.branchId)) && seed.cashMovements.filter(m => m.currency === 'PEN' && m.paymentId).every(m => m.exchangeRate === 3.75));

// ---------------------------------------------------------------- Estado de cuenta del titular (todo derivado)
check('El estado de cuenta del titular se arma de matrículas, planes y pagos', (() => {
  const ctx = { guardians: seed.guardians, students: seed.students, enrollments: seed.enrollments, plans: seed.plans, payments: seed.payments, groups: [] };
  const [g1, g2, g3] = ['TIT-001', 'TIT-002', 'TIT-003'].map(id => guardianBalance(ctx, id, TODAY));
  return g1.balanceUSD === 800 && g2.balanceUSD === 700 && g2.overdueUSD === 100 && g3.balanceUSD === 150 && g3.overdueUSD === 150 && g1.students === 1 && g1.enrollments === 1;
})());

// ---------------------------------------------------------------- Ids: un solo estilo, sin repetidos
check('Siguiente id: máximo + 1, aunque se haya eliminado uno', nextSequentialId('ALU', ['ALU-001', 'ALU-003']) === 'ALU-004' && nextSequentialId('MAT', ['MAT-2026-009'], { year: 2026 }) === 'MAT-2026-010' && nextSequentialId('ALU', []) === 'ALU-001');
check('El asignador no repite ids creados en el mismo instante', (() => {
  const alloc = createIdAllocator();
  const a = alloc('CJ', ['CJ-001']); const b = alloc('CJ', ['CJ-001']); const c = alloc('CJ', ['CJ-001']);
  return a === 'CJ-002' && b === 'CJ-003' && c === 'CJ-004';
})());
check('El asignador respeta lo que ya existe en la lista', createIdAllocator()('TRK', ['TRK-001', 'TRK-006']) === 'TRK-007');
check('Un id con otro estilo no confunde al correlativo', nextSequentialId('CJ', ['CJ-1700000000000-ab12', 'CJ-002']) === 'CJ-003');

console.log(failed === 0 ? '\nTodo correcto.' : `\n${failed} caso(s) fallaron.`);
process.exit(failed === 0 ? 0 : 1);
