/**
 * Verificación de la regla «la verificación va antes de la primera asesoría»: bloqueo de la asistencia, urgencia,
 * reprogramación sin las 24 horas y receta que corresponde a la matrícula.
 * Ejecutar: npx tsx scripts/check-first-session.ts
 */
import type { Enrollment, Plan, Recipe, Schedule } from '../src/context/DataContext';
import { availableActions } from '../src/utils/schedule';
import { recipeForEnrollment } from '../src/utils/verification';
import {
  VERIFICATION_ALERT_DAYS,
  attendanceBlock,
  blockedFirstSessions,
  compareGates,
  firstSessionGate,
  gateRescheduleNote,
  isVerified,
  scheduleGate,
  type GateContext,
} from '../src/utils/verificationGate';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : ` -> ${detail}`}`);
  if (!ok) failed++;
};

const today = '2026-10-23';
const now = new Date(2026, 9, 23, 10, 0); // viernes 23-oct-2026, 10:00

const recipe: Recipe = {
  id: 'R1', name: 'Receta Kids', programId: 'P-KIDS', levelId: undefined, branchIds: [], applyToAllBranches: true,
  status: 'Activo', items: [{ itemId: 'LIB', quantity: 1 }], startDate: '2026-01-01',
};
const paidPlan: Plan = { id: 'PL1', mat: 'MAT-1', titular: 'T', type: 'Contado', total: 100, balance: 0, next: '-', status: 'Al día', installments: [] };
const unpaidPlan: Plan = { ...paidPlan, id: 'PL2', mat: 'MAT-2', balance: 100 };

const enrollment = (id: string, o: Partial<Enrollment> = {}): Enrollment =>
  ({ id, student: 'Alumno', studentId: 'ALU-1', programId: 'P-KIDS', program: 'Kids', levelId: 'N1', level: 'Nivel 1', branchId: 'B1', status: 'Activa', planId: id === 'MAT-2' ? 'PL2' : 'PL1', ...o } as Enrollment);
const first = (enrollmentId: string, date: string, time = '16:00', o: Partial<Schedule> = {}): Schedule =>
  ({ id: `S-${enrollmentId}-${date}`, student: 'Alumno', program: 'Kids', level: 'Nivel 1', date, time, duration: 60, responsible: 'R', status: 'Reservado', isFirst: true, enrollmentId, ...o });

const ctx = (schedules: Schedule[], over: Partial<GateContext> = {}): GateContext =>
  ({ schedules, plans: [paidPlan, unpaidPlan], recipes: [recipe], today, now, ...over });
const gateOf = (e: Enrollment, s: Schedule, over: Partial<GateContext> = {}) => firstSessionGate(e, ctx([s], over));

// ---------------------------------------------------------------- Cuándo aplica
const e1 = enrollment('MAT-1');
check('Estados que habilitan: Completo e Incompleto', isVerified({ verificationStatus: 'Verificado Completo' }) && isVerified({ verificationStatus: 'Verificado Incompleto' }));
check('Pendiente o sin dato no habilitan', !isVerified({ verificationStatus: 'Pendiente' }) && !isVerified({}));
check('Sin verificar y con primera asesoría reservada: bloqueada', gateOf(e1, first('MAT-1', '2026-10-30')).blocked);
check('Verificada completa: no se bloquea', !gateOf(enrollment('MAT-1', { verificationStatus: 'Verificado Completo' }), first('MAT-1', '2026-10-30')).blocked);
check('Verificada incompleta: tampoco (lo entregado alcanza para empezar)', !gateOf(enrollment('MAT-1', { verificationStatus: 'Verificado Incompleto' }), first('MAT-1', '2026-10-30')).blocked);
check('Matrícula caída: no aplica', !gateOf(enrollment('MAT-1', { status: 'Caída' }), first('MAT-1', '2026-10-30')).blocked);
check('Primera asesoría ya dada, faltada o cancelada: no aplica', ['Asistió', 'Faltó', 'Cancelado'].every(st => !gateOf(e1, first('MAT-1', '2026-10-30', '16:00', { status: st })).blocked));
check('Reprogramada sigue esperando la verificación', gateOf(e1, first('MAT-1', '2026-10-30', '16:00', { status: 'Reprogramado' })).blocked);
check('Sin primera asesoría vinculada: no aplica', !firstSessionGate(e1, ctx([])).blocked);
check('Sin receta de materiales no hay nada que entregar: no aplica', !gateOf(e1, first('MAT-1', '2026-10-30'), { recipes: [] }).blocked);
check('Receta de otro programa no cuenta', !gateOf(e1, first('MAT-1', '2026-10-30'), { recipes: [{ ...recipe, programId: 'P-OTRO' }] }).blocked);

// ---------------------------------------------------------------- Urgencia según lo que falta
const level = (date: string, time = '16:00') => gateOf(e1, first('MAT-1', date, time)).level;
check(`Con más de ${VERIFICATION_ALERT_DAYS} días hay tiempo (planificada)`, level('2026-10-28') === 'planificada' && level('2026-11-15') === 'planificada');
check('Ejemplo del negocio: la asesoría es en 2 días → urgente', level('2026-10-25') === 'urgente' && gateOf(e1, first('MAT-1', '2026-10-25')).daysLeft === 2);
check('A 3 días todavía es urgente, no crítica', level('2026-10-26') === 'urgente');
check('Mañana → crítica', level('2026-10-24') === 'critica');
check('Hoy más tarde → crítica', level('2026-10-23', '16:00') === 'critica');
check('Hoy y la hora ya pasó → vencida (hay que reprogramar)', level('2026-10-23', '09:00') === 'vencida' && gateOf(e1, first('MAT-1', '2026-10-23', '09:00')).overdue);
check('Fecha pasada sin atender → vencida', level('2026-10-20') === 'vencida');
check('Antes de la hora no está vencida', !gateOf(e1, first('MAT-1', '2026-10-23', '16:00')).overdue);

// ---------------------------------------------------------------- Qué paso falta
check('Con el primer pago hecho falta solo la verificación', gateOf(e1, first('MAT-1', '2026-10-30')).blocker === 'verificacion');
const e2 = enrollment('MAT-2');
check('Sin el primer pago falta primero pagar', gateOf(e2, first('MAT-2', '2026-10-30')).blocker === 'pago' && /primer pago/.test(gateOf(e2, first('MAT-2', '2026-10-30')).message));
check('El mensaje de vencida dice que no es falta del alumno', /no cuenta como falta/.test(gateOf(e1, first('MAT-1', '2026-10-20')).message));

// ---------------------------------------------------------------- Bloqueo de la asistencia
const s1 = first('MAT-1', '2026-10-23', '16:00');
const c1 = ctx([s1]);
check('Sin verificar no se puede marcar asistencia, falta ni sesión', attendanceBlock(s1, [e1], c1) !== null);
check('Verificada: se puede registrar', attendanceBlock(s1, [enrollment('MAT-1', { verificationStatus: 'Verificado Completo' })], c1) === null);
check('Una asesoría que no es primera no se bloquea', attendanceBlock({ ...s1, isFirst: false }, [e1], c1) === null);
check('Una primera asesoría sin matrícula vinculada no se bloquea', attendanceBlock({ ...s1, enrollmentId: undefined }, [e1], c1) === null);
const early = first('MAT-1', '2026-10-30');
const later = first('MAT-1', '2026-11-05', '16:00', { id: 'S-otra' });
check('Solo la primera asesoría vigente de la matrícula queda bloqueada', scheduleGate(early, [e1], ctx([early, later])).blocked && !scheduleGate(later, [e1], ctx([early, later])).blocked);
check('El mensaje de bloqueo por pago es distinto al de verificación',
  attendanceBlock(first('MAT-2', '2026-10-23'), [e2], ctx([first('MAT-2', '2026-10-23')])) !== attendanceBlock(s1, [e1], c1));

// ---------------------------------------------------------------- Acciones de la agenda
const act = (date: string, time: string, unverified: boolean, status = 'Reservado') => availableActions({ status, date, time }, today, now, unverified).join();
check('Sin la regla, el comportamiento anterior no cambia', act('2026-10-23', '16:00', false) === 'asistio,sesion,falta' && act('2026-10-30', '16:00', false) === 'reprogramar,cancelar');
check('Bloqueada y con tiempo: reprogramar o cancelar, sin registrar', act('2026-10-30', '16:00', true) === 'reprogramar,cancelar');
check('Bloqueada a menos de 24 h: se puede reprogramar igual (cambio de la institución)', act('2026-10-24', '09:00', true) === 'reprogramar' && act('2026-10-23', '16:00', true) === 'reprogramar');
check('Bloqueada y ya vencida: solo reprogramar (no asistió/falta/sesión)', act('2026-10-20', '16:00', true) === 'reprogramar');

// ---------------------------------------------------------------- Seguimiento y orden
const eA = enrollment('MAT-A'); const eB = enrollment('MAT-B'); const eC = enrollment('MAT-C'); const eD = enrollment('MAT-D', { verificationStatus: 'Verificado Completo' });
const sch = [first('MAT-A', '2026-10-30'), first('MAT-B', '2026-10-20'), first('MAT-C', '2026-10-24'), first('MAT-D', '2026-10-24')];
const blocked = blockedFirstSessions([eA, eB, eC, eD], ctx(sch, { plans: [{ ...paidPlan, id: 'PL1' }] }));
check('Solo aparecen las matrículas bloqueadas', Object.keys(blocked).sort().join() === 'MAT-A,MAT-B,MAT-C');
check('Orden por urgencia: vencida, crítica, planificada', Object.values(blocked).sort(compareGates).map(g => g.level).join() === 'vencida,critica,planificada');

// ---------------------------------------------------------------- Reprogramar y verificar
const moved = first('MAT-1', '2026-11-12');
check('Al reprogramar a una fecha lejana vuelve a haber tiempo', gateOf(e1, moved).level === 'planificada');
check('Verificar libera la asesoría', !gateOf(enrollment('MAT-1', { verificationStatus: 'Verificado Completo' }), moved).blocked);
check('La reprogramación deja constancia', gateRescheduleNote('2026-10-23', '16:00') === 'Reprogramada por falta de verificación de materiales (original: 23 de octubre a las 4:00 p. m.).');

// ---------------------------------------------------------------- Receta que le corresponde
const rc = (o: Partial<Recipe>): Recipe => ({ ...recipe, ...o });
const target = { programId: 'P-KIDS', levelId: 'N1', branchId: 'B1' };
check('Receta de todos los niveles y sedes', recipeForEnrollment(target, [recipe], today)?.id === 'R1');
check('Receta de otro nivel no corresponde; la de todos los niveles sí', !recipeForEnrollment(target, [rc({ levelId: 'N2' })], today) && !!recipeForEnrollment(target, [rc({ levelId: 'N1' })], today));
check('Receta de otra sede no corresponde; la de su sede sí', !recipeForEnrollment(target, [rc({ applyToAllBranches: false, branchIds: ['B2'] })], today) && !!recipeForEnrollment(target, [rc({ applyToAllBranches: false, branchIds: ['B1'] })], today));
check('Receta inactiva o aún no vigente no corresponde', !recipeForEnrollment(target, [rc({ status: 'Inactivo' })], today) && !recipeForEnrollment(target, [rc({ startDate: '2026-11-01' })], today));
check('El último día de la receta todavía cuenta; al día siguiente ya no', !!recipeForEnrollment(target, [rc({ endDate: '2026-10-23' })], today) && !recipeForEnrollment(target, [rc({ endDate: '2026-10-22' })], today));

console.log(failed === 0 ? '\nTodo correcto.' : `\n${failed} caso(s) fallaron.`);
process.exit(failed === 0 ? 0 : 1);
