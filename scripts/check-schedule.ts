/**
 * Verificación de las reglas de la Programación de asesorías: calendario, horarios, estados, cupo por horario,
 * actividades de los cronogramas mensuales (bloqueo por sede), inscripciones y frecuencia semanal.
 * Ejecutar: npx tsx scripts/check-schedule.ts
 */
import type { CapacityConfig, Enrollment, MonthlySchedule, Schedule, Student } from '../src/context/DataContext';
import {
  ACTIVE_STATUSES,
  SLOT_DURATION,
  MIN_NOTICE_HOURS,
  addDaysISO,
  affectedSchedules,
  allActivities,
  availableActions,
  blockState,
  blockText,
  blockingActivity,
  branchOfStudent,
  canChangeWithNotice,
  capacityFor,
  changeBlockedByNotice,
  checkBlock,
  checkFirstSessionBlock,
  endTime,
  findScheduleConflict,
  firstBlockText,
  firstSessionBlock,
  groupByBlock,
  hoursUntil,
  isValidCapacity,
  monthGrid,
  monthTitle,
  nextOpenDay,
  noticeMessage,
  occupancy,
  OCCUPYING_STATUSES,
  rangeLabel,
  removeOverride,
  seatsLeft,
  setBranchCapacity,
  slotLabel,
  slotsForDate,
  statusTone,
  slotsToRange,
  rangeToSlots,
  toggleActivitySlot,
  studentsWithoutSession,
  suggestedResponsible,
  upsertOverride,
  validateActivity,
  validateActivityEnrollment,
  validateReservation,
  validateSchedule,
  weekOf,
  weekdayIndex,
  withEnrollment,
  withoutEnrollment,
} from '../src/utils/schedule';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : ` -> ${detail}`}`);
  if (!ok) failed++;
};

// ---------------------------------------------------------------- Calendario
check('16-oct-2026 es viernes (índice 4, lunes = 0)', weekdayIndex('2026-10-16') === 4);
check('Semana de un viernes: lunes 12 a domingo 18', JSON.stringify([weekOf('2026-10-16')[0], weekOf('2026-10-16')[6]]) === JSON.stringify(['2026-10-12', '2026-10-18']));
const oct = monthGrid(2026, 10);
check('Octubre 2026 ocupa 5 semanas', oct.length === 5, String(oct.length));
check('La cuadrícula empieza en lunes 28-sep y termina en domingo 1-nov', oct[0][0] === '2026-09-28' && oct[4][6] === '2026-11-01');
check('Todas las semanas tienen 7 días', oct.every(w => w.length === 7));
check('Febrero 2026 ocupa 5 semanas, sin duplicar días', (() => {
  const g = monthGrid(2026, 2).flat();
  return monthGrid(2026, 2).length === 5 && new Set(g).size === g.length;
})());
check('Un mes que necesita 6 semanas (marzo 2025)', monthGrid(2025, 3).length === 6);
check('Cruce de fin de año', addDaysISO('2026-12-30', 3) === '2027-01-02');
check('Título del mes', monthTitle(2026, 10) === 'Octubre 2026');

// ---------------------------------------------------------------- Horarios permitidos (1 hora exacta)
check('Toda asesoría dura 60 minutos', SLOT_DURATION === 60);
const lunes = '2026-10-19', viernes = '2026-10-16', sabado = '2026-10-17', domingo = '2026-10-18';
check('Lunes a viernes: 3-4, 4-5, 5-6, 6-7 y 7-8 p. m.', JSON.stringify(slotsForDate(lunes)) === JSON.stringify(['15:00', '16:00', '17:00', '18:00', '19:00']));
check('El viernes tiene los mismos horarios que el lunes', JSON.stringify(slotsForDate(viernes)) === JSON.stringify(slotsForDate(lunes)));
check('Sábado: 9-10, 10-11, 11-12, 12-1 y luego 4-5, 5-6, 6-7, 7-8 p. m.',
  JSON.stringify(slotsForDate(sabado)) === JSON.stringify(['09:00', '10:00', '11:00', '12:00', '16:00', '17:00', '18:00', '19:00']));
check('Sábado no hay 1-4 p. m.', !slotsForDate(sabado).some(t => ['13:00', '14:00', '15:00'].includes(t)));
check('Domingo no hay atención', slotsForDate(domingo).length === 0);
check('Etiqueta de horario', slotLabel('15:00') === '3:00 p. m. – 4:00 p. m.' && slotLabel('12:00') === '12:00 p. m. – 1:00 p. m.' && slotLabel('09:00') === '9:00 a. m. – 10:00 a. m.');
check('Hora de fin = inicio + 1 hora', endTime('19:00', SLOT_DURATION) === '20:00');
check('El siguiente día con atención salta el domingo', nextOpenDay(domingo) === '2026-10-19' && nextOpenDay(sabado) === sabado);

// ---------------------------------------------------------------- Estados
check('Reservado, Reprogramado y Asistió ocupan horario', ['Reservado', 'Reprogramado', 'Asistió'].every(s => ACTIVE_STATUSES.includes(s)));
check('Ya no existe el estado Confirmado', !ACTIVE_STATUSES.includes('Confirmado') && statusTone('Confirmado') === 'neutral');
check('Faltó y Cancelado liberan el horario', !ACTIVE_STATUSES.includes('Faltó') && !ACTIVE_STATUSES.includes('Cancelado'));
check('Tonos de estado', statusTone('Asistió') === 'success' && statusTone('Reprogramado') === 'warning' && statusTone('Faltó') === 'danger' && statusTone('Reservado') === 'info');

// ---------------------------------------------------------------- Acciones según estado y fecha (+ regla de 24 horas)
const hoy = '2026-10-16';
const ahora = new Date(2026, 9, 16, 10, 0); // viernes 16-oct-2026, 10:00
const acts = (status: string, date: string, time = '16:00') => availableActions({ status, date, time }, hoy, ahora).join();
check('Reserva futura (más de 24 h): reprogramar y cancelar', acts('Reservado', '2026-10-20') === 'reprogramar,cancelar');
check('Reprogramada futura: igual que una reserva', acts('Reprogramado', '2026-10-20') === 'reprogramar,cancelar');
check('Mañana a las 15:00 (29 h) → todavía se puede cambiar', acts('Reservado', '2026-10-17', '15:00') === 'reprogramar,cancelar');
check('Mañana a las 9:00 (23 h) → ya no se puede cambiar', acts('Reservado', '2026-10-17', '09:00') === '');
check('Justo 24 h antes (mañana a las 10:00) → se puede', acts('Reservado', '2026-10-17', '10:00') === 'reprogramar,cancelar');
check('Reserva de hoy: solo asistencia, sesión o falta (sin cambios)', acts('Reservado', hoy) === 'asistio,sesion,falta');
check('Reserva vencida sin marcar: igual que la de hoy (primero se marca la falta)', acts('Reservado', '2026-10-10') === 'asistio,sesion,falta');
check('Con asistencia: solo registrar/ver sesión', acts('Asistió', '2026-10-14') === 'sesion');
check('Faltó o cancelada: se puede reprogramar a una fecha nueva (sin la regla de 24 h)', acts('Faltó', '2026-10-14') === 'reprogramar' && acts('Cancelado', '2026-10-20') === 'reprogramar' && acts('Cancelado', '2026-10-17', '09:00') === 'reprogramar');
check('No se puede registrar sesión antes de la asesoría', !availableActions({ status: 'Reservado', date: '2026-10-20', time: '16:00' }, hoy, ahora).includes('sesion'));
check('Horas hasta una sesión', hoursUntil('2026-10-17', '10:00', ahora) === 24 && hoursUntil('2026-10-16', '09:00', ahora) === -1);
check('Regla de 24 horas', MIN_NOTICE_HOURS === 24 && canChangeWithNotice('2026-10-17', '10:00', ahora) && !canChangeWithNotice('2026-10-17', '09:59', ahora));
check('Se avisa con el motivo y la fecha', /24 horas de anticipación \(es el 17 de octubre a las 9:00 a\. m\.\)/.test(noticeMessage('2026-10-17', '09:00')));
check('Sesión activa a menos de 24 h queda bloqueada para cambios; una con asistencia o cancelada no cuenta',
  changeBlockedByNotice({ status: 'Reservado', date: '2026-10-17', time: '09:00' }, ahora) && !changeBlockedByNotice({ status: 'Reservado', date: '2026-10-20', time: '16:00' }, ahora) &&
  !changeBlockedByNotice({ status: 'Asistió', date: hoy, time: '09:00' }, ahora) && !changeBlockedByNotice({ status: 'Cancelado', date: hoy, time: '09:00' }, ahora));

// ---------------------------------------------------------------- Conflictos del alumno
const base: Schedule = {
  id: '1', student: 'Mateo Ruiz', studentId: 'ALU-001', program: 'Kids', level: 'Nivel 1',
  date: '2026-10-20', time: '16:00', duration: 60, responsible: 'María Torres', status: 'Asistió', branchId: 'FIL-PIU',
};
const list = [base];
const cand = (o: Partial<Parameters<typeof findScheduleConflict>[1]> = {}) =>
  ({ student: 'Otro', studentId: 'ALU-009', responsible: 'Juan Pérez', date: '2026-10-20', time: '18:00', status: 'Reservado', ...o });
const mateo = { student: 'Mateo Ruiz', studentId: 'ALU-001' };

check('Otro alumno y otro horario → libre', !findScheduleConflict(list, cand()));
check('El mismo responsable atiende a varios alumnos a la vez (salón con cupo)', !findScheduleConflict(list, cand({ responsible: 'maría torres', time: '16:00' })));
check('Mismo alumno en el mismo horario → conflicto', findScheduleConflict(list, cand({ ...mateo, time: '16:00' }))?.who === 'alumno');
check('Mismo alumno (por nombre) en el mismo horario → conflicto', findScheduleConflict(list, cand({ student: 'mateo ruiz', studentId: undefined, time: '16:00' }))?.who === 'alumno');
check('Mismo alumno en otro horario del día → libre', !findScheduleConflict(list, cand({ ...mateo, time: '17:00' })));
check('Otro día no cruza', !findScheduleConflict(list, cand({ ...mateo, date: '2026-10-21', time: '16:00' })));
check('Editar la misma asesoría no choca consigo misma', !findScheduleConflict(list, cand({ ...mateo, time: '16:00' }), '1'));
check('Una asesoría cancelada libera el horario', !findScheduleConflict([{ ...base, status: 'Cancelado' }], cand({ ...mateo, time: '16:00' })));
check('Una asesoría con falta libera el horario', !findScheduleConflict([{ ...base, status: 'Faltó' }], cand({ ...mateo, time: '16:00' })));
check('Una asesoría reprogramada sigue ocupando su nuevo horario', findScheduleConflict([{ ...base, status: 'Reprogramado' }], cand({ ...mateo, time: '16:00' }))?.who === 'alumno');

// ---------------------------------------------------------------- Validación
const ok = { student: 'Mateo', responsible: 'Ana', date: '2026-10-20', time: '16:00', status: 'Reservado', checkPast: true };
check('Reserva completa → válida', validateSchedule(ok, '2026-10-16') === null);
check('Sin alumno → rechazada', /alumno/i.test(validateSchedule({ ...ok, student: '' }, '2026-10-16') ?? ''));
check('Fecha pasada → rechazada', /anterior a hoy/.test(validateSchedule({ ...ok, date: '2026-10-10' }, '2026-10-16') ?? ''));
check('Solo editar observaciones de una asesoría pasada → permitido', validateSchedule({ ...ok, date: '2026-10-14', checkPast: false }, '2026-10-16') === null);
check('Domingo → rechazado', /domingos/.test(validateSchedule({ ...ok, date: '2026-10-18' }, '2026-10-16') ?? ''));
check('Sin horario → rechazada', /horario/i.test(validateSchedule({ ...ok, time: '' }, '2026-10-16') ?? ''));
check('Hora fuera de los bloques (15:30) → rechazada', /no está disponible/.test(validateSchedule({ ...ok, time: '15:30' }, '2026-10-16') ?? ''));
check('Lunes a las 9:00 → rechazado (solo los sábados)', /no está disponible/.test(validateSchedule({ ...ok, time: '09:00' }, '2026-10-16') ?? ''));
check('Sábado 13:00 → rechazado', /no está disponible/.test(validateSchedule({ ...ok, date: '2026-10-24', time: '13:00' }, '2026-10-16') ?? ''));
check('Sábado 9:00 → válido', validateSchedule({ ...ok, date: '2026-10-24', time: '09:00' }, '2026-10-16') === null);
check('Sin responsable → rechazada', /responsable/i.test(validateSchedule({ ...ok, responsible: '' }, '2026-10-16') ?? ''));

// ---------------------------------------------------------------- Cupo por horario
const cfg: CapacityConfig = { defaultCapacity: 6, byBranch: {}, overrides: [] };
check('Cupo general', capacityFor(cfg, 'FIL-PIU', '2026-10-20', '16:00') === 6);
const cfgB = setBranchCapacity(cfg, 'FIL-CHI', 8);
check('Cupo propio de la sede prevalece sobre el general', capacityFor(cfgB, 'FIL-CHI', '2026-10-20', '16:00') === 8 && capacityFor(cfgB, 'FIL-PIU', '2026-10-20', '16:00') === 6);
check('Una sede puede quedar sin límite', capacityFor(setBranchCapacity(cfg, 'FIL-PIU', null), 'FIL-PIU', '2026-10-20', '16:00') === null);
check('Quitar el cupo propio vuelve al general', capacityFor(setBranchCapacity(cfgB, 'FIL-CHI', undefined), 'FIL-CHI', '2026-10-20', '16:00') === 6);
const cfgO = upsertOverride(cfgB, { branchId: 'FIL-CHI', date: '2026-10-20', time: '16:00', capacity: 5 });
check('La excepción por fecha y horario prevalece', capacityFor(cfgO, 'FIL-CHI', '2026-10-20', '16:00') === 5 && capacityFor(cfgO, 'FIL-CHI', '2026-10-20', '17:00') === 8);
check('Una excepción puede ser «sin límite»', capacityFor(upsertOverride(cfgO, { branchId: 'FIL-CHI', date: '2026-10-20', time: '16:00', capacity: null }), 'FIL-CHI', '2026-10-20', '16:00') === null);
check('Repetir la excepción la reemplaza (no se duplica)', upsertOverride(cfgO, { branchId: 'FIL-CHI', date: '2026-10-20', time: '16:00', capacity: 7 }).overrides.length === 1);
check('Quitar la excepción vuelve al cupo de la sede', capacityFor(removeOverride(cfgO, cfgO.overrides[0].id), 'FIL-CHI', '2026-10-20', '16:00') === 8);
check('Cupos válidos: 1 a 50 o sin límite', isValidCapacity(5) && isValidCapacity(null) && isValidCapacity(50) && !isValidCapacity(0) && !isValidCapacity(51) && !isValidCapacity(2.5));

const mk = (id: string, over: Partial<Schedule> = {}): Schedule => ({
  id, student: `Alumno ${id}`, studentId: `ALU-${id}`, program: 'Kids', level: 'Nivel 1', date: '2026-10-20', time: '16:00',
  duration: 60, responsible: 'María Torres', status: 'Reservado', branchId: 'FIL-PIU', ...over,
});
const five = ['1', '2', '3', '4', '5'].map(i => mk(i));
check('Ocupación: cuenta activas y faltas (el horario ya pasó); Cancelado libera; otra sede u horario no cuenta',
  occupancy([...five, mk('6', { status: 'Cancelado' }), mk('7', { status: 'Faltó' }), mk('8', { branchId: 'FIL-CHI' }), mk('9', { time: '17:00' })], 'FIL-PIU', '2026-10-20', '16:00') === 6);
check('Faltó ocupa el horario; Cancelado no; Faltó no cuenta como asistencia', OCCUPYING_STATUSES.includes('Faltó') && !OCCUPYING_STATUSES.includes('Cancelado') && !ACTIVE_STATUSES.includes('Faltó'));
check('Ocupación: ignora la asesoría que se edita', occupancy(five, 'FIL-PIU', '2026-10-20', '16:00', '1') === 4);

const ctx = (schedules: Schedule[], capacity: CapacityConfig = cfg, monthly: MonthlySchedule[] = []) => ({ schedules, capacity, activities: allActivities(monthly) });
check('Horario con lugar → abierto (5 de 6)',
  blockState(ctx(five), 'FIL-PIU', '2026-10-20', '16:00').kind === 'open' && blockText(blockState(ctx(five), 'FIL-PIU', '2026-10-20', '16:00')) === '5 de 6 cupos');
const six = [...five, mk('6')];
check('Horario completo → lleno (6 de 6)',
  blockState(ctx(six), 'FIL-PIU', '2026-10-20', '16:00').kind === 'full' && /Completo \(6 de 6\)/.test(blockText(blockState(ctx(six), 'FIL-PIU', '2026-10-20', '16:00'))));
check('Horario completo → se rechaza una reserva más', /completo: 6 de 6/.test(checkBlock(ctx(six), 'FIL-PIU', '2026-10-20', '16:00') ?? ''));
check('Aumentar el cupo habilita el horario', checkBlock(ctx(six, { ...cfg, defaultCapacity: 8 }), 'FIL-PIU', '2026-10-20', '16:00') === null);
check('Reducir el cupo por debajo de lo ocupado lo cierra', blockState(ctx(five, { ...cfg, defaultCapacity: 4 }), 'FIL-PIU', '2026-10-20', '16:00').kind === 'full');
check('Sin límite: nunca se llena',
  checkBlock(ctx([...six, mk('7'), mk('8'), mk('9')], { ...cfg, defaultCapacity: null }), 'FIL-PIU', '2026-10-20', '16:00') === null &&
  blockText(blockState(ctx(six, { ...cfg, defaultCapacity: null }), 'FIL-PIU', '2026-10-20', '16:00')) === '6 alumnos · sin límite');
check('El cupo es por sede: otra sede tiene lugar', checkBlock(ctx(six), 'FIL-CHI', '2026-10-20', '16:00') === null);
check('Al reprogramar, la propia asesoría no cuenta contra el cupo', checkBlock(ctx(six), 'FIL-PIU', '2026-10-20', '16:00', '6') === null);
check('Fuera de los bloques → no disponible',
  blockState(ctx([]), 'FIL-PIU', '2026-10-18', '16:00').kind === 'closed' && checkBlock(ctx([]), 'FIL-PIU', '2026-10-20', '09:00') !== null);

// ---------------------------------------------------------------- Actividades de los cronogramas (bloqueo por sede)
const monthly: MonthlySchedule[] = [
  {
    id: 'C1', branchId: 'FIL-PIU', sede: 'Piura', mes: 'Noviembre', anio: 2026, titulo: 'Piura', observaciones: '',
    actividades: [
      { id: 'a1', actividad: 'Maratón', fecha: '2026-11-10', horaInicio: '16:00', horaFin: '18:00', responsable: 'Equipo', orden: 1, cupo: 2, inscritos: ['ALU-1'] },
      { id: 'a2', actividad: 'Taller', fecha: '2026-11-10', horaInicio: '', horaFin: '', responsable: '', orden: 2, cupo: null, inscritos: [] },
    ],
  },
];
const acti = allActivities(monthly);
check('Solo se cruzan actividades con fecha y horas completas', acti.length === 1 && acti[0].id === 'C1:a1' && acti[0].branchId === 'FIL-PIU');
check('La maratón de 4 a 6 p. m. bloquea 4–5 y 5–6', !!blockingActivity(acti, 'FIL-PIU', '2026-11-10', '16:00') && !!blockingActivity(acti, 'FIL-PIU', '2026-11-10', '17:00'));
check('No bloquea 3–4 ni 6–7 (justo antes y después)', !blockingActivity(acti, 'FIL-PIU', '2026-11-10', '15:00') && !blockingActivity(acti, 'FIL-PIU', '2026-11-10', '18:00'));
check('El bloqueo es solo de su sede', !blockingActivity(acti, 'FIL-CHI', '2026-11-10', '16:00'));
check('El bloqueo es solo de su fecha', !blockingActivity(acti, 'FIL-PIU', '2026-11-11', '16:00'));
check('Una actividad que arranca a mitad de un bloque lo bloquea (15:30–16:30 → 3–4 y 4–5)',
  !!blockingActivity([{ ...acti[0], start: '15:30', end: '16:30' }], 'FIL-PIU', '2026-11-10', '15:00') &&
  !!blockingActivity([{ ...acti[0], start: '15:30', end: '16:30' }], 'FIL-PIU', '2026-11-10', '16:00'));
check('Reservar en un horario bloqueado → rechazado con el nombre de la actividad',
  /ocupado por la actividad «Maratón» \(4:00 p\. m\. – 6:00 p\. m\.\)/.test(checkBlock(ctx([], cfg, monthly), 'FIL-PIU', '2026-11-10', '16:00') ?? ''));
check('El horario bloqueado aparece como tal', blockText(blockState(ctx([], cfg, monthly), 'FIL-PIU', '2026-11-10', '17:00')) === 'Bloqueado: Maratón');
check('El horario libre de la misma fecha sigue disponible', checkBlock(ctx([], cfg, monthly), 'FIL-PIU', '2026-11-10', '15:00') === null);
check('Asesorías ya reservadas que la actividad tapa',
  affectedSchedules(
    [
      mk('1', { date: '2026-11-10', time: '16:00' }),
      mk('2', { date: '2026-11-10', time: '17:00', status: 'Cancelado' }),
      mk('3', { date: '2026-11-10', time: '19:00' }),
      mk('4', { date: '2026-11-10', time: '17:00', branchId: 'FIL-CHI' }),
    ],
    'FIL-PIU', { fecha: '2026-11-10', horaInicio: '16:00', horaFin: '18:00' }
  ).map(x => x.id).join() === '1');
check('Rango de horas', rangeLabel('16:00', '18:00') === '4:00 p. m. – 6:00 p. m.');

const okAct = { actividad: 'Maratón', fecha: '2026-11-10', horaInicio: '16:00', horaFin: '18:00', cupo: 20 as number | null };
const period = { mes: 'Noviembre', anio: 2026 };
check('Actividad completa → válida', validateActivity(okAct, period) === null);
check('Sin nombre → rechazada', /nombre/.test(validateActivity({ ...okAct, actividad: ' ' }, period) ?? ''));
check('Sin fecha → rechazada', /fecha/.test(validateActivity({ ...okAct, fecha: '' }, period) ?? ''));
check('Fecha fuera del mes del cronograma → rechazada', /dentro de Noviembre 2026/.test(validateActivity({ ...okAct, fecha: '2026-12-01' }, period) ?? ''));
check('Sin horas → rechazada', /elija las horas/.test(validateActivity({ ...okAct, horaFin: '' }, period) ?? ''));
check('Fin anterior al inicio → rechazada', /posterior a la de inicio/.test(validateActivity({ ...okAct, horaInicio: '18:00', horaFin: '16:00' }, period) ?? ''));
check('Cupo inválido → rechazada; sin límite → válida', /cupo/.test(validateActivity({ ...okAct, cupo: 0 }, period) ?? '') && validateActivity({ ...okAct, cupo: null }, period) === null);

check('Actividad en domingo → rechazada', /domingos/.test(validateActivity({ ...okAct, fecha: '2026-11-01' }, { mes: 'Noviembre', anio: 2026 }) ?? ''));
check('Actividad de 4 horas → rechazada (máximo 3)', /entre 1 y 3 horas/.test(validateActivity({ ...okAct, horaInicio: '15:00', horaFin: '19:00' }, period) ?? ''));
check('Actividad de 3 horas → válida', validateActivity({ ...okAct, horaInicio: '15:00', horaFin: '18:00' }, period) === null);
check('Actividad con horas fuera de la agenda (15:30–16:30) → rechazada', /entre 1 y 3 horas/.test(validateActivity({ ...okAct, horaInicio: '15:30', horaFin: '16:30' }, period) ?? ''));
check('Actividad que cruza el almuerzo del sábado (12:00–14:00) → rechazada', /entre 1 y 3 horas/.test(validateActivity({ ...okAct, fecha: '2026-11-14', horaInicio: '12:00', horaFin: '14:00' }, period) ?? ''));
check('Sábado por la mañana (9:00–12:00) → válida', validateActivity({ ...okAct, fecha: '2026-11-14', horaInicio: '09:00', horaFin: '12:00' }, period) === null);

// ---------------------------------------------------------------- Horas de una actividad (hasta 3 consecutivas)
const martes = '2026-11-10', sab14 = '2026-11-14';
check('Elegir una hora', toggleActivitySlot(martes, [], '16:00').join() === '16:00');
check('Sumar la hora siguiente y la anterior', toggleActivitySlot(martes, ['16:00'], '17:00').join() === '16:00,17:00' && toggleActivitySlot(martes, ['16:00'], '15:00').join() === '15:00,16:00');
check('Máximo 3 consecutivas: la cuarta empieza una selección nueva', toggleActivitySlot(martes, ['15:00', '16:00', '17:00'], '18:00').join() === '18:00');
check('Una hora lejana empieza una selección nueva', toggleActivitySlot(martes, ['15:00'], '18:00').join() === '18:00');
check('Tocar un extremo lo quita; tocar el del medio deja solo esa hora',
  toggleActivitySlot(martes, ['15:00', '16:00', '17:00'], '17:00').join() === '15:00,16:00' && toggleActivitySlot(martes, ['15:00', '16:00', '17:00'], '16:00').join() === '16:00');
check('Sábado: 12:00 y 16:00 no son consecutivas (la tarde empieza una selección nueva)', toggleActivitySlot(sab14, ['12:00'], '16:00').join() === '16:00');
check('Una hora que no existe ese día se ignora (9:00 en lunes)', toggleActivitySlot(martes, ['16:00'], '09:00').join() === '16:00');
check('Rango de las horas elegidas', JSON.stringify(slotsToRange(['17:00', '15:00', '16:00'])) === JSON.stringify({ horaInicio: '15:00', horaFin: '18:00' }) && slotsToRange([]) === null);
check('Rango → horas (ida y vuelta)', rangeToSlots(martes, '16:00', '18:00').join() === '16:00,17:00' && rangeToSlots(martes, '15:30', '17:00').length === 0 && rangeToSlots(sab14, '12:00', '14:00').length === 0);

// ---------------------------------------------------------------- Tipos de sesión: primera asesoría, asesoría y actividad no se mezclan
const first = (id: string, reg: string, over: Partial<Schedule> = {}) => mk(id, { isFirst: true, registrationId: reg, enrollmentId: `MAT-${id}`, ...over });
const f1 = [first('11', 'REG-A'), first('12', 'REG-A')];
const FB = (schedules: Schedule[], reg?: string, time = '16:00', branch = 'FIL-PIU', date = '2026-10-20', list: MonthlySchedule[] = []) =>
  firstSessionBlock(ctx(schedules, cfg, list), branch, date, time, reg);
check('Horario vacío → libre para primera asesoría', FB([]).kind === 'free' && firstBlockText(FB([])) === 'Libre' && checkFirstSessionBlock(ctx([]), 'FIL-PIU', '2026-10-20', '16:00') === null);
check('Horario con asesorías → ocupado (la primera necesita un horario vacío)', FB(five).kind === 'taken' && FB(five).takenBy === 'asesorias' && /ya tiene asesorías/.test(checkFirstSessionBlock(ctx(five), 'FIL-PIU', '2026-10-20', '16:00') ?? ''));
check('Una sola asesoría normal ya lo ocupa', FB([mk('1')]).kind === 'taken');
check('Primeras asesorías de otro registro → ocupado', FB(f1, 'REG-B').kind === 'taken' && FB(f1, 'REG-B').takenBy === 'otro-registro' && /otro registro/.test(checkFirstSessionBlock(ctx(f1), 'FIL-PIU', '2026-10-20', '16:00', 'REG-B') ?? ''));
check('Con un registro nuevo (asistente), las primeras ya registradas no se comparten', FB(f1).kind === 'taken');
check('Los alumnos del mismo registro comparten el horario', FB(f1, 'REG-A').kind === 'own' && firstBlockText(FB(f1, 'REG-A')) === 'Con alumnos de este registro' && checkFirstSessionBlock(ctx(f1), 'FIL-PIU', '2026-10-20', '16:00', 'REG-A') === null);
check('Un horario mixto (primera + asesoría normal) no es «propio»', FB([...f1, mk('1')], 'REG-A').kind === 'taken');
check('La primera asesoría no tiene cupo: 10 alumnos del mismo registro caben', FB(Array.from({ length: 10 }, (_, i) => first(`2${i}`, 'REG-A')), 'REG-A').kind === 'own');
check('Cancelar libera el horario de primera asesoría', FB([first('11', 'REG-A', { status: 'Cancelado' })], 'REG-B').kind === 'free');
check('Faltó NO lo libera (el horario ya pasó)', FB([first('11', 'REG-A', { status: 'Faltó' })], 'REG-B').kind === 'taken');
check('Es por sede: otra sede lo tiene libre', FB(f1, 'REG-B', '16:00', 'FIL-CHI').kind === 'free');
check('Es por fecha y horario', FB(f1, 'REG-B', '17:00').kind === 'free' && FB(f1, 'REG-B', '16:00', 'FIL-PIU', '2026-10-21').kind === 'free');
check('Al reprogramar, su propia asesoría no cuenta', firstSessionBlock(ctx([first('11', 'REG-A')]), 'FIL-PIU', '2026-10-20', '16:00', 'REG-A', '11').kind === 'free');
check('Fuera de la agenda → no disponible', FB([], undefined, '09:00').kind === 'closed' && FB([], undefined, '16:00', 'FIL-PIU', '2026-10-18').kind === 'closed');
check('Con una actividad encima → bloqueado',
  FB([], undefined, '16:00', 'FIL-PIU', '2026-11-10', monthly).kind === 'blocked' &&
  /Maratón/.test(checkFirstSessionBlock(ctx([], cfg, monthly), 'FIL-PIU', '2026-11-10', '17:00') ?? ''));

// Para una asesoría normal, el horario con primeras asesorías está cerrado (y no cuenta cupo)
check('Horario de primera asesoría → cerrado para asesorías normales',
  blockState(ctx(f1), 'FIL-PIU', '2026-10-20', '16:00').kind === 'first' && blockText(blockState(ctx(f1), 'FIL-PIU', '2026-10-20', '16:00')) === 'Reservado para primera asesoría');
check('La asesoría normal se rechaza ahí con el motivo', /reservado para primeras asesorías/.test(checkBlock(ctx(f1), 'FIL-PIU', '2026-10-20', '16:00') ?? ''));
check('Una primera asesoría cancelada devuelve el horario a las asesorías normales', checkBlock(ctx([first('11', 'REG-A', { status: 'Cancelado' })]), 'FIL-PIU', '2026-10-20', '16:00') === null);
check('Una primera con falta mantiene el horario cerrado', blockState(ctx([first('11', 'REG-A', { status: 'Faltó' })]), 'FIL-PIU', '2026-10-20', '16:00').kind === 'first');
check('Otra sede no se ve afectada', checkBlock(ctx(f1), 'FIL-CHI', '2026-10-20', '16:00') === null);
check('Una actividad gana sobre cualquier otro tipo', blockState(ctx(f1, cfg, monthly), 'FIL-PIU', '2026-11-10', '16:00').kind === 'blocked');

// Reprogramar una primera asesoría: mismo horario del registro o uno vacío; nunca uno con asesorías
const vr = (over: Record<string, unknown>, schedules: Schedule[]) =>
  validateReservation(
    ctx(schedules),
    { student: 'Alumno 11', studentId: 'ALU-11', responsible: 'María Torres', date: '2026-10-20', time: '16:00', status: 'Reprogramado', branchId: 'FIL-PIU', checkPast: true, isFirst: true, registrationId: 'REG-A', ...over },
    '2026-10-16', '11'
  );
check('Primera asesoría → horario vacío → permitido', vr({ time: '17:00' }, f1) === null);
check('Primera asesoría → horario con hermanos del registro → permitido', vr({ time: '16:00' }, [first('13', 'REG-A', { studentId: 'ALU-13', student: 'Hermano' })]) === null);
check('Primera asesoría → horario con asesorías → rechazado', /necesita un horario vacío/.test(vr({ time: '16:00' }, [mk('1')]) ?? ''));
check('Primera asesoría → horario de otro registro → rechazado', /otro registro/.test(vr({ time: '16:00' }, [first('30', 'REG-B')]) ?? ''));

// ---------------------------------------------------------------- Inscripción en actividades
const act = acti[0];
const enroll = (studentId: string, over: Record<string, unknown> = {}) =>
  validateActivityEnrollment({ activity: act, studentId, studentName: `Alumno ${studentId}`, studentBranchId: 'FIL-PIU', schedules: [], ...over });
const asesoria = (over: Partial<Schedule> = {}) => [mk('1', { studentId: 'ALU-2', student: 'Alumno ALU-2', date: '2026-11-10', time: '17:00', ...over })];
check('Inscribir a un alumno de la sede con cupo → permitido', enroll('ALU-2') === null);
check('Ya inscrito → rechazado', /ya está inscrito/.test(enroll('ALU-1') ?? ''));
check('Alumno de otra sede → rechazado', /otra sede/.test(enroll('ALU-2', { studentBranchId: 'FIL-CHI' }) ?? ''));
check('Actividad completa → rechazado',
  /completa \(2 de 2/.test(validateActivityEnrollment({ activity: { ...act, enrolled: ['ALU-1', 'ALU-2'] }, studentId: 'ALU-3', studentName: 'A3', studentBranchId: 'FIL-PIU', schedules: [] }) ?? ''));
check('Cupos libres', seatsLeft(act) === 1 && seatsLeft({ capacity: null, enrolled: ['x'] }) === null && seatsLeft({ capacity: 1, enrolled: ['x', 'y'] }) === 0);
check('Alumno con una asesoría que se cruza ese día → rechazado',
  /tiene una asesoría ese día de 5:00 p\. m\. – 6:00 p\. m\./.test(enroll('ALU-2', { schedules: asesoria() }) ?? ''));
check('Su asesoría cancelada no impide inscribirse', enroll('ALU-2', { schedules: asesoria({ status: 'Cancelado' }) }) === null);
check('Su asesoría de otro horario no impide inscribirse', enroll('ALU-2', { schedules: asesoria({ time: '19:00' }) }) === null);
const raw = monthly[0].actividades[0];
check('Inscribir y quitar (sin duplicar)',
  withEnrollment(withEnrollment(raw, 'ALU-2'), 'ALU-2').inscritos.join() === 'ALU-1,ALU-2' && withoutEnrollment(raw, 'ALU-1').inscritos.length === 0);

// ---------------------------------------------------------------- Reserva completa (cupo + alumno + validación básica)
const res = (over: Record<string, unknown> = {}, c = ctx(five)) =>
  validateReservation(
    c,
    { student: 'Nuevo', studentId: 'ALU-N', responsible: 'María Torres', date: '2026-10-20', time: '16:00', status: 'Reservado', branchId: 'FIL-PIU', checkPast: true, ...over },
    '2026-10-16'
  );
check('Reserva con lugar → válida', res() === null);
check('Reserva sin sede → rechazada', /sede/.test(res({ branchId: '' }) ?? ''));
check('Reserva en horario completo → rechazada', /completo/.test(res({}, ctx(six)) ?? ''));
check('Reserva del alumno que ya tiene asesoría a esa hora → rechazada', /ya tiene una asesoría/.test(res({ studentId: 'ALU-1', student: 'Alumno 1' }) ?? ''));
check('Reserva en domingo → rechazada por la regla básica', /domingos/.test(res({ date: '2026-10-18' }) ?? ''));
check('Reserva de la semana pasada → rechazada', /anterior a hoy/.test(res({ date: '2026-10-10' }) ?? ''));

// ---------------------------------------------------------------- Sede del alumno, responsable sugerido y agrupación
const enrol = (id: string, studentId: string, branchId: string, dateISO: string): Enrollment => ({
  id, date: '', student: `Alumno ${studentId}`, studentId, branchId, dateISO, program: 'Kids', level: 'N1', status: 'Activa', plan: 'Al día',
});
check('Sede del alumno = la de su matrícula más reciente',
  branchOfStudent({ id: 'ALU-1', name: 'A' }, [enrol('1', 'ALU-1', 'FIL-PIU', '2026-01-01'), enrol('2', 'ALU-1', 'FIL-CHI', '2026-06-01')]) === 'FIL-CHI');
check('Sin matrícula → sin sede', branchOfStudent({ id: 'ALU-9', name: 'Z' }, []) === undefined);
check('Responsable sugerido: el que ya atiende ese horario',
  suggestedResponsible([mk('1', { responsible: 'Ana' }), mk('2', { responsible: 'Ana' }), mk('3', { responsible: 'Luis' })], 'FIL-PIU', '2026-10-20', '16:00') === 'Ana');
check('Responsable sugerido: vacío si el horario está libre', suggestedResponsible(five, 'FIL-PIU', '2026-10-20', '17:00') === '');
const groups = groupByBlock([mk('1', { time: '17:00' }), mk('2'), mk('3', { time: '17:00' })]);
check('Agrupar por horario, en orden', groups.map(g => `${g.time}:${g.items.length}`).join() === '16:00:1,17:00:2');

// ---------------------------------------------------------------- Frecuencia semanal
const stu = (id: string, status = 'Activo'): Student => ({ id, doc: id, name: `Alumno ${id}`, age: 10, program: 'Kids', titular: 'T', status });
const week = weekOf('2026-10-20').slice(0, 6);
const pend = studentsWithoutSession(
  {
    students: [stu('ALU-1'), stu('ALU-2'), stu('ALU-3'), stu('ALU-4', 'Inactivo'), stu('ALU-5')],
    schedules: [
      mk('1', { studentId: 'ALU-1', student: 'Alumno ALU-1' }),
      mk('2', { studentId: 'ALU-2', student: 'Alumno ALU-2', status: 'Cancelado' }),
      mk('3', { studentId: 'ALU-5', student: 'Alumno ALU-5', date: '2026-10-28' }),
    ],
    enrollments: [enrol('1', 'ALU-1', 'FIL-PIU', ''), enrol('2', 'ALU-2', 'FIL-PIU', ''), enrol('3', 'ALU-3', 'FIL-CHI', ''), enrol('5', 'ALU-5', 'FIL-PIU', '')],
  },
  week
);
check('Sin asesoría esta semana: activos que no reservaron (cancelada no cuenta; otra semana no cuenta; inactivos fuera)',
  pend.map(x => x.student.id).join() === 'ALU-2,ALU-3,ALU-5');
check('Filtrar por sede',
  studentsWithoutSession(
    { students: [stu('ALU-2'), stu('ALU-3')], schedules: [], enrollments: [enrol('2', 'ALU-2', 'FIL-PIU', ''), enrol('3', 'ALU-3', 'FIL-CHI', '')] },
    week, 'FIL-CHI'
  ).map(x => x.student.id).join() === 'ALU-3');

console.log(failed === 0 ? '\nTodo correcto.' : `\n${failed} caso(s) fallaron.`);
process.exit(failed === 0 ? 0 : 1);
