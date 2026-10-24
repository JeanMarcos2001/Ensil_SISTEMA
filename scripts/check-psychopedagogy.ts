/**
 * Verificación de las reglas de Psicopedagogía: responsable y asistencia de actividades, historial de cambios,
 * métricas de la sesión, recordatorios y reporte.
 * Ejecutar: npx tsx scripts/check-psychopedagogy.ts
 */
import type { Assignment, Enrollment, Guardian, Program, PsyEvent, Schedule, Staff, Student, Tracking } from '../src/context/DataContext';
import {
  ACTIVITY_LEAD_DAYS, activityState, attendanceBlock, attendanceSummary, canRemoveEnrollment, futureActivitiesOf, isStaffNamed, needsResponsible,
  personKey, responsibleOptions, validateAttendance, validateResponsible, withAttendance, withoutAttendance,
} from '../src/utils/psyActivities';
import {
  MATERIALS_REASON, buildScheduleEvents, cancellationOf, describeEvent, historyOf, initiatorOfReason, reasonsFor, rescheduleCount, validateChangeMeta,
} from '../src/utils/psyHistory';
import { buildPsyReminders, currentOffset, parsePsyPolicy, validatePsyPolicy, validatePsyReminderLog, DEFAULT_PSY_POLICY } from '../src/utils/psyReminders';
import { RISK_ABSENCES, psyReport, type PsyReportContext } from '../src/utils/psyReport';
import { availableActions, allActivities, withoutEnrollment, type FlatActivity } from '../src/utils/schedule';
import { MAX_JUMP, metricsOf, noteProblem, ordinalNumber, previousMetrics, validateMetrics } from '../src/utils/sessionMetrics';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : ` -> ${detail}`}`);
  if (!ok) failed++;
};

const today = '2026-10-23';
const now = new Date(2026, 9, 23, 10, 0);

// ---------------------------------------------------------------- Datos de prueba
const staff = (id: string, names: string, lastNameP: string, o: Partial<Staff> = {}): Staff =>
  ({ id, names, lastNameP, lastNameM: 'X', status: 'Activo', ...o } as Staff);
const juan = staff('1', 'Juan', 'Pérez');
const maria = staff('2', 'María', 'Torres');
const luis = staff('3', 'Luis', 'Rojas');
const ana = staff('4', 'Ana', 'Cruz', { status: 'Inactivo' });
const asg = (id: string, staffId: string, branch: string, area = 'Psicopedagogía', status = 'Activa'): Assignment =>
  ({ id, staffId, branch, area, role: 'R', systemRole: 'S', startDate: '2023-01-01', isMain: true, status } as Assignment);
const assignments = [asg('a1', '1', 'Piura'), asg('a2', '2', 'Chiclayo'), asg('a3', '3', 'Piura', 'Administración'), asg('a4', '4', 'Piura')];
const branches = [{ id: 'PIU', name: 'Piura' }, { id: 'CHI', name: 'Chiclayo' }];

const activity = (id: string, o: Partial<FlatActivity> = {}): FlatActivity => ({
  id, monthlyId: '1', activityId: id, branchId: 'PIU', sede: 'Piura', name: `Act ${id}`, date: '2026-10-26', start: '16:00', end: '18:00',
  responsible: '', capacity: 10, enrolled: ['S1', 'S2'], attendance: {}, ...o,
});
const sch = (id: string, o: Partial<Schedule> = {}): Schedule => ({
  id, student: 'Alumno', studentId: 'S1', program: 'Kids', level: 'Nivel 1', date: '2026-10-26', time: '16:00', duration: 60,
  responsible: 'Lic. Juan Pérez', status: 'Reservado', branchId: 'PIU', ...o,
});
const rctx = (o: Partial<Parameters<typeof responsibleOptions>[1]> = {}) => ({ schedules: [] as Schedule[], activities: [] as FlatActivity[], staff: [juan, maria, luis, ana], assignments, branches, ...o });

// ---------------------------------------------------------------- Responsable de actividades
check('Nombre sin título, tildes ni mayúsculas', personKey('Lic. María  Torres') === 'maria torres' && personKey('DR. Juan Pérez') === 'juan perez');
check('El «responsable» de una asesoría se reconoce en la ficha del personal', isStaffNamed(juan, 'Lic. Juan Pérez') && isStaffNamed(juan, 'Juan Pérez X') && !isStaffNamed(juan, 'Lic. María Torres') && !isStaffNamed(juan, ''));
check('Falta responsable y la actividad está a 7 días o menos → se avisa', needsResponsible(activity('a', { date: '2026-10-30' }), today) && ACTIVITY_LEAD_DAYS === 7);
check('A más de 7 días, con responsable, o ya pasada → no se avisa', !needsResponsible(activity('a', { date: '2026-11-05' }), today) && !needsResponsible(activity('a', { date: '2026-10-25', responsible: 'X' }), today) && !needsResponsible(activity('a', { date: '2026-10-20' }), today));

const opts = responsibleOptions(activity('a'), rctx());
check('Solo personal activo con asignación activa en Psicopedagogía', opts.map(o => o.staff.id).sort().join() === '1,2', opts.map(o => o.staff.id).join());
check('Los de la sede de la actividad van primero', opts[0].staff.id === '1' && opts[0].sameBranch && !opts[1].sameBranch);
const other = activity('b', { date: '2026-10-26', start: '17:00', end: '19:00', responsibleId: '1', responsible: 'Juan Pérez' });
check('Cruce con otra actividad suya a esa hora', validateResponsible(activity('a'), '1', rctx({ activities: [activity('a'), other] })).length === 1);
check('Sin cruce si la otra actividad es a otra hora', validateResponsible(activity('a'), '1', rctx({ activities: [activity('a'), { ...other, start: '18:00', end: '20:00' }] })).length === 0);
check('Cruce con una asesoría suya a esa hora', validateResponsible(activity('a'), '1', rctx({ schedules: [sch('s', { time: '17:00' })] })).length === 1);
check('Una asesoría cancelada o a otra hora no cruza', validateResponsible(activity('a'), '1', rctx({ schedules: [sch('s', { time: '17:00', status: 'Cancelado' }), sch('t', { time: '19:00' })] })).length === 0);
check('Personal inactivo o sin asignación de Psicopedagogía no puede', validateResponsible(activity('a'), '4', rctx()).length >= 1 && validateResponsible(activity('a'), '3', rctx()).length === 1);
check('Quitar el responsable siempre se puede (sin asistencia)', validateResponsible(activity('a'), null, rctx()).length === 0);
const marked = activity('a', { responsible: 'Juan Pérez', responsibleId: '1', attendance: { S1: { status: 'Asistió', at: 'x', by: 'u' } } });
check('Con asistencia registrada no se cambia el responsable', validateResponsible(marked, '2', rctx()).length === 1 && validateResponsible(marked, null, rctx()).length === 1);

// ---------------------------------------------------------------- Asistencia a actividades
check('Sin responsable no se registra la asistencia', /responsable/.test(attendanceBlock(activity('a', { date: today }), today) ?? ''));
check('Antes del día de la actividad no se registra', /desde el día/.test(attendanceBlock(activity('a', { date: '2026-10-26', responsible: 'Juan Pérez' }), today) ?? ''));
check('El día de la actividad, con responsable, sí', attendanceBlock(activity('a', { date: today, responsible: 'Juan Pérez' }), today) === null);
const today1 = activity('a', { date: today, responsible: 'Juan Pérez' });
check('Solo los inscritos tienen asistencia', validateAttendance(today1, 'S9', 'Asistió', today).length === 1 && validateAttendance(today1, 'S1', 'Asistió', today).length === 0);
check('El estado debe ser Asistió o Faltó', validateAttendance(today1, 'S1', 'Tarde', today).length === 1);
const att = withAttendance(withAttendance({}, 'S1', { status: 'Asistió', at: 'x', by: 'u' }), 'S2', { status: 'Faltó', at: 'x', by: 'u' });
check('Resumen: asistieron, faltaron, sin marcar y porcentaje', JSON.stringify(attendanceSummary({ enrolled: ['S1', 'S2', 'S3'], attendance: att })) === JSON.stringify({ enrolled: 3, present: 1, absent: 1, pending: 1, rate: 50 }));
check('Sin marcas el porcentaje no se inventa', attendanceSummary({ enrolled: ['S1'], attendance: {} }).rate === null);
check('Quitar una marca', Object.keys(withoutAttendance(att, 'S1')).join() === 'S2');
check('Con asistencia no se quita la inscripción', !canRemoveEnrollment({ attendance: att }, 'S1') && canRemoveEnrollment({ attendance: att }, 'S3'));
const scheduleActivity = { id: 'x', actividad: 'T', fecha: today, horaInicio: '16:00', horaFin: '18:00', responsable: '', orden: 1, cupo: null, inscritos: ['S1', 'S2'], asistencia: att };
check('Al quitar la inscripción se borra su marca', Object.keys(withoutEnrollment(scheduleActivity, 'S1').asistencia ?? {}).join() === 'S2' && withoutEnrollment(scheduleActivity, 'S1').inscritos.join() === 'S2');
check('Estado de la actividad', activityState({ date: '2026-10-25' }, today) === 'Próxima' && activityState({ date: today }, today) === 'Hoy' && activityState({ date: '2026-10-20' }, today) === 'Realizada');
const mine = [activity('a', { responsibleId: '1', responsible: 'Juan Pérez' }), activity('b', { date: '2026-10-20', responsibleId: '1' }), activity('c', { responsible: 'Lic. María Torres' })];
check('Actividades futuras a cargo de alguien (por id o por nombre)', futureActivitiesOf(juan, mine, today).map(a => a.id).join() === 'a' && futureActivitiesOf(maria, mine, today).map(a => a.id).join() === 'c');

// ---------------------------------------------------------------- Acciones con la institución
const act = (date: string, time: string, institutional: boolean) => availableActions({ status: 'Reservado', date, time }, today, now, false, institutional).join();
check('Con menos de 24 h el alumno ya no cambia; la institución sí (con permiso)', act('2026-10-24', '09:00', false) === '' && act('2026-10-24', '09:00', true) === 'reprogramar,cancelar');
check('Con más de 24 h todo sigue igual', act('2026-10-30', '16:00', false) === 'reprogramar,cancelar' && act('2026-10-30', '16:00', true) === 'reprogramar,cancelar');

// ---------------------------------------------------------------- Motivos y quién lo pidió
const rule = (o: Partial<Parameters<typeof validateChangeMeta>[2]> = {}) => ({ withNotice: true, canInstitutional: false, ...o });
check('Reprogramar no ofrece los motivos solo de cancelación', !reasonsFor('reprogramar').some(r => r.cancelOnly) && reasonsFor('cancelar').some(r => r.cancelOnly));
check('Sin motivo no se cambia', validateChangeMeta('cancelar', undefined, rule()).length === 1 && validateChangeMeta('cancelar', { reason: 'Inventado' }, rule()).length === 1);
check('Motivo del alumno con 24 h o más: correcto', validateChangeMeta('cancelar', { reason: 'Enfermedad del alumno' }, rule()).length === 0);
check('Motivo del alumno con menos de 24 h: no', validateChangeMeta('cancelar', { reason: 'Enfermedad del alumno' }, rule({ withNotice: false })).length === 1);
check('Con menos de 24 h la institución solo con permiso', validateChangeMeta('reprogramar', { reason: 'Institución: personal no disponible' }, rule({ withNotice: false })).length === 1 && validateChangeMeta('reprogramar', { reason: 'Institución: personal no disponible' }, rule({ withNotice: false, canInstitutional: true })).length === 0);
check('«Otro motivo» exige explicación', validateChangeMeta('cancelar', { reason: 'Institución: otro motivo' }, rule()).length === 1 && validateChangeMeta('cancelar', { reason: 'Institución: otro motivo', detail: 'Corte de luz en la sede' }, rule()).length === 0);
check('Sin materiales el cambio es de la institución', validateChangeMeta('reprogramar', { reason: 'Enfermedad del alumno' }, rule({ materialsMissing: true })).length === 1 && validateChangeMeta('reprogramar', { reason: MATERIALS_REASON }, rule({ withNotice: false, materialsMissing: true })).length === 0);
check('El motivo define quién lo pidió', initiatorOfReason('Enfermedad del alumno') === 'Alumno o titular' && initiatorOfReason(MATERIALS_REASON) === 'Institución');

// ---------------------------------------------------------------- Historial
let seq = 0;
const nextId = () => `E${++seq}`;
const original = sch('1', { studentId: 'S1' });
check('Una reserva nueva deja el evento «Reservada»', buildScheduleEvents(undefined, original, undefined, 'u', 't', nextId)[0].type === 'Reservada');
const movedEvents = buildScheduleEvents(original, { ...original, date: '2026-10-28', time: '17:00', status: 'Reprogramado' }, { reason: 'Enfermedad del alumno', detail: 'Avisó ayer' }, 'u', '2026-10-23T10:00:00Z', nextId);
check('Reprogramar deja de qué a qué, el motivo y quién lo pidió', movedEvents.length === 1 && movedEvents[0].type === 'Reprogramada' && movedEvents[0].from?.date === '2026-10-26' && movedEvents[0].to?.time === '17:00' && movedEvents[0].initiator === 'Alumno o titular' && movedEvents[0].reason === 'Enfermedad del alumno');
const cancelEvents = buildScheduleEvents(original, { ...original, status: 'Cancelado' }, { reason: 'Institución: feriado o cierre de la sede' }, 'ana', '2026-10-23T11:00:00Z', nextId);
check('Cancelar deja quién la canceló y quién lo pidió', cancelEvents.length === 1 && cancelEvents[0].type === 'Cancelada' && cancelEvents[0].by === 'ana' && cancelEvents[0].initiator === 'Institución');
check('Cambiar solo las observaciones no deja evento', buildScheduleEvents(original, { ...original, observations: 'nota' }, undefined, 'u', 't', nextId).length === 0);
check('Cambiar solo el responsable cuenta como reprogramación', buildScheduleEvents(original, { ...original, responsible: 'Lic. María Torres' }, { reason: 'Institución: personal no disponible' }, 'u', 't', nextId)[0]?.type === 'Reprogramada');
check('Asistió y Faltó dejan su evento', buildScheduleEvents(original, { ...original, status: 'Asistió' }, undefined, 'u', 't', nextId)[0].type === 'Asistió' && buildScheduleEvents(original, { ...original, status: 'Faltó' }, undefined, 'u', 't', nextId)[0].type === 'Faltó');
const log: PsyEvent[] = [...movedEvents, ...cancelEvents, { ...movedEvents[0], id: 'E99', at: '2026-10-22T10:00:00Z' }];
check('Historial ordenado, cantidad de reprogramaciones y última cancelación', historyOf(log, 'asesoria', '1')[0].id === 'E99' && rescheduleCount(log, '1') === 2 && cancellationOf(log, '1')?.by === 'ana');
check('Texto del evento', /Reprogramada: 26 de octubre 16:00 → 28 de octubre 17:00/.test(describeEvent(movedEvents[0])) && /Cancelada \(era 26 de octubre 16:00\)/.test(describeEvent(cancelEvents[0])));

// ---------------------------------------------------------------- Métricas de la sesión
const kids = { nivel: 'Nivel 1', sesion: '5', velocidad: '120', comprension: '80' };
check('Cada programa define sus métricas (también Profesional)', metricsOf('Kids').length === 4 && metricsOf('Pre-Kids').length === 4 && metricsOf('Pre-lectura').length === 1 && metricsOf('Profesional').length === 3 && metricsOf('Kids - Nivel 2').length === 4);
const ok = validateMetrics('Kids', kids, { levels: ['Nivel 1', 'Nivel 2'], enrollmentLevel: 'Nivel 1' });
check('Valores correctos: sin errores, números como números y la sesión con su prefijo', ok.errors.length === 0 && ok.clean.velocidad === 120 && ok.clean.comprension === 80 && ok.clean.sesion === 'Sesión 5' && ok.warnings.length === 0, JSON.stringify(ok));
check('Una sesión escrita como «Sesión 7» también vale', validateMetrics('Kids', { ...kids, sesion: 'Sesión 7' }, {}).clean.sesion === 'Sesión 7' && ordinalNumber('Módulo 12') === 12);
check('Las obligatorias deben estar completas', validateMetrics('Kids', { nivel: 'Nivel 1' }, {}).errors.length === 3);
check('Comprensión fuera de 0–100 no se guarda', validateMetrics('Kids', { ...kids, comprension: '120' }, {}).errors.length === 1 && validateMetrics('Kids', { ...kids, comprension: '-5' }, {}).errors.length === 1);
check('Comprensión y velocidad deben ser enteros y velocidad mayor que 0', validateMetrics('Kids', { ...kids, comprension: '85.5' }, {}).errors.length === 1 && validateMetrics('Kids', { ...kids, velocidad: '0' }, {}).errors.length === 1 && validateMetrics('Kids', { ...kids, velocidad: 'mucho' }, {}).errors.length === 1);
check('Sesión 0 o negativa no vale', validateMetrics('Kids', { ...kids, sesion: '0' }, {}).errors.length === 1);
check('El nivel debe ser uno del programa', validateMetrics('Kids', { ...kids, nivel: 'Nivel 9' }, { levels: ['Nivel 1', 'Nivel 2'] }).errors.length === 1);
check('Otro nivel que el de la matrícula solo avisa', (() => { const r = validateMetrics('Kids', { ...kids, nivel: 'Nivel 2' }, { levels: ['Nivel 1', 'Nivel 2'], enrollmentLevel: 'Nivel 1' }); return r.errors.length === 0 && r.warnings.length === 1 && !r.needsNote; })());
const unusual = validateMetrics('Kids', { ...kids, velocidad: '900' }, {});
check('Velocidad fuera de lo habitual: avisa y exige explicarlo, pero se puede guardar', unusual.errors.length === 0 && unusual.needsNote && noteProblem(unusual, '') !== null && noteProblem(unusual, 'Es lector avanzado') === null);
const lowComp = validateMetrics('Kids', { ...kids, comprension: '50' }, {});
check('Comprensión baja solo avisa', lowComp.errors.length === 0 && lowComp.warnings.length === 1 && !lowComp.needsNote);
const before = { nivel: 'Nivel 1', sesion: 'Sesión 4', velocidad: 200, comprension: 80 };
check('Caída fuerte de velocidad frente a la sesión anterior: avisa', validateMetrics('Kids', { ...kids, sesion: '5', velocidad: '120' }, { previous: before }).warnings.some(w => /bajó 40 %/.test(w.text)));
check('Saltarse sesiones o retroceder: avisa', validateMetrics('Kids', { ...kids, sesion: String(4 + MAX_JUMP + 1), velocidad: '200' }, { previous: before }).warnings.some(w => /Salta/.test(w.text)) && validateMetrics('Kids', { ...kids, sesion: '2', velocidad: '200' }, { previous: before }).warnings.some(w => /retrocede/.test(w.text)));
check('Avance normal frente a la anterior: sin avisos', validateMetrics('Kids', { ...kids, sesion: '5', velocidad: '210' }, { previous: before }).warnings.length === 0);
check('Pre-Kids: semana y respuestas Sí / No / 50%', validateMetrics('Pre-Kids', { nivel: 'Nivel 1', semana: '3', identifica: 'Sí', leeSolo: '50%' }, {}).errors.length === 0 && validateMetrics('Pre-Kids', { nivel: 'Nivel 1', semana: '3', identifica: 'Quizá', leeSolo: 'No' }, {}).errors.length === 1);
check('Profesional ya tiene métricas (módulo, velocidad y comprensión)', validateMetrics('Profesional', { modulo: '2', velocidad: '400', comprension: '90' }, {}).errors.length === 0);
const trks: Tracking[] = [
  { id: 't1', studentId: 'S1', scheduleId: 'x1', date: '2026-10-01', status: 'Asistió', metrics: { velocidad: 100 }, observations: '' },
  { id: 't2', studentId: 'S1', scheduleId: 'x2', date: '2026-10-10', status: 'Asistió', metrics: { velocidad: 150 }, observations: '' },
  { id: 't3', studentId: 'S1', scheduleId: 'x3', date: '2026-10-20', status: 'Faltó', metrics: null, observations: '' },
];
check('La sesión anterior es la última con asistencia y métricas antes de esa fecha', previousMetrics(trks, 'S1', '2026-10-23')?.velocidad === 150 && previousMetrics(trks, 'S1', '2026-10-05')?.velocidad === 100 && previousMetrics(trks, 'S1', '2026-10-01') === null);

// ---------------------------------------------------------------- Recordatorios
check('Política: validar y leer', validatePsyPolicy({ sessionBefore: '1', activityBefore: '2', validityBefore: '14, 7, 1' }).length === 0 && validatePsyPolicy({ sessionBefore: '', activityBefore: '2', validityBefore: '7' }).length === 1 && validatePsyPolicy({ sessionBefore: '1', activityBefore: '99', validityBefore: '7' }).length === 1);
check('Los días se ordenan de mayor a menor', JSON.stringify(parsePsyPolicy({ sessionBefore: '0, 1', activityBefore: '2', validityBefore: '1, 14, 7' })) === JSON.stringify({ sessionBefore: [1, 0], activityBefore: [2], validityBefore: [14, 7, 1] }));
check('Etapa vigente: la más cercana a la fecha que ya llegó', currentOffset([14, 7, 1], 10) === 14 && currentOffset([14, 7, 1], 5) === 7 && currentOffset([14, 7, 1], 0) === 1 && currentOffset([1], 3) === null && currentOffset([1, 0], 0) === 0);

const guardian = { id: 'G1', name: 'Rosa Pérez', phone: '987654321', email: 'r@x.com' } as Guardian;
const students = [
  { id: 'S1', name: 'Alumno Uno', guardianIds: ['G1'], phone: '', email: '', titular: 'Rosa Pérez' },
  { id: 'S2', name: 'Alumno Dos', guardianIds: [], phone: '912345678', email: 'a2@x.com', titular: '' },
] as unknown as Student[];
const program = { id: 'P1', name: 'Kids', durationBase: 3, warranty: 2 } as Program;
const rbase = (o: Partial<Parameters<typeof buildPsyReminders>[0]> = {}) => ({
  schedules: [] as Schedule[], activities: [] as FlatActivity[], enrollments: [] as Enrollment[], students, guardians: [guardian], programs: [program], branches, blockedScheduleIds: new Set<string>(), ...o,
});
const tomorrow = sch('r1', { date: '2026-10-24', time: '16:00' });
const r1 = buildPsyReminders(rbase({ schedules: [tomorrow] }), DEFAULT_PSY_POLICY, [], today);
check('Asesoría de mañana: un recordatorio al titular con el texto listo', r1.length === 1 && r1[0].kind === 'asesoria' && r1[0].recipient === 'Rosa Pérez' && /mañana a las 4:00 p\. m\./.test(r1[0].message) && /24 horas de anticipación/.test(r1[0].message) && !!r1[0].whatsappUrl, JSON.stringify(r1[0]));
check('Todavía no corresponde (3 días antes)', buildPsyReminders(rbase({ schedules: [sch('r2', { date: '2026-10-26' })] }), DEFAULT_PSY_POLICY, [], today).length === 0);
check('Una primera asesoría sin verificar no se recuerda', buildPsyReminders(rbase({ schedules: [tomorrow], blockedScheduleIds: new Set(['r1']) }), DEFAULT_PSY_POLICY, [], today).length === 0);
check('Una asesoría cancelada o ya dada no se recuerda', buildPsyReminders(rbase({ schedules: [{ ...tomorrow, status: 'Cancelado' }, sch('r3', { date: '2026-10-24', status: 'Asistió' })] }), DEFAULT_PSY_POLICY, [], today).length === 0);
check('Lo ya registrado no vuelve a salir', buildPsyReminders(rbase({ schedules: [tomorrow] }), DEFAULT_PSY_POLICY, [{ key: r1[0].key }], today).length === 0);
check('Sin titular se escribe al propio alumno', buildPsyReminders(rbase({ schedules: [sch('r4', { date: '2026-10-24', studentId: 'S2', student: 'Alumno Dos' })] }), DEFAULT_PSY_POLICY, [], today)[0].phone === '912345678');
const ar = buildPsyReminders(rbase({ activities: [activity('z', { date: '2026-10-25', enrolled: ['S1', 'S2'], attendance: { S2: { status: 'Asistió', at: 'x', by: 'u' } } })] }), DEFAULT_PSY_POLICY, [], today);
check('Actividad en 2 días: un recordatorio por inscrito sin asistencia marcada', ar.length === 1 && ar[0].kind === 'actividad' && ar[0].studentId === 'S1' && /«Act z»/.test(ar[0].message));
const enroll = { id: 'M1', student: 'Alumno Uno', studentId: 'S1', programId: 'P1', program: 'Kids', level: 'Nivel 1', status: 'Activa', sede: 'Piura', branchId: 'PIU' } as unknown as Enrollment;
const firstSession = sch('f1', { isFirst: true, enrollmentId: 'M1', status: 'Asistió', date: '2026-08-03' });
const vr = buildPsyReminders(rbase({ schedules: [firstSession], enrollments: [enroll] }), DEFAULT_PSY_POLICY, [], today);
check('Vigencia por vencer (a 10 días de terminar la base): avisa con el fin de la duración base y la extensión', vr.length === 1 && vr[0].kind === 'vigencia' && vr[0].offset === 14 && vr[0].dateISO === '2026-11-02' && /extensión de 2 meses/.test(vr[0].message), JSON.stringify(vr[0]));
check('Con la extensión ya habilitada no se avisa', buildPsyReminders(rbase({ schedules: [firstSession], enrollments: [{ ...enroll, extensionEnabledAt: '2026-10-01' } as Enrollment] }), DEFAULT_PSY_POLICY, [], today).length === 0);
check('Registrar el recordatorio: no repetir, canal válido y motivo al omitir', validatePsyReminderLog({ key: 'k' }, 'WhatsApp', 'Enviado', '', [{ key: 'k' }]).length === 1 && validatePsyReminderLog({ key: 'k' }, 'Fax', 'Enviado', '', []).length === 1 && validatePsyReminderLog({ key: 'k' }, 'Otro', 'Omitido', 'ya', []).length === 1 && validatePsyReminderLog({ key: 'k' }, 'Otro', 'Omitido', 'ya confirmó', []).length === 0);

// ---------------------------------------------------------------- Reporte
const rs = [
  sch('p1', { date: '2026-10-05', status: 'Asistió', studentId: 'S1', student: 'Alumno Uno', responsible: 'Lic. Juan Pérez' }),
  sch('p2', { date: '2026-10-12', status: 'Asistió', studentId: 'S1', student: 'Alumno Uno', responsible: 'Lic. Juan Pérez' }),
  sch('p3', { date: '2026-10-19', status: 'Faltó', studentId: 'S1', student: 'Alumno Uno', responsible: 'Lic. Juan Pérez' }),
  sch('p4', { date: '2026-10-21', status: 'Faltó', studentId: 'S1', student: 'Alumno Uno', responsible: 'Lic. Juan Pérez' }),
  sch('p5', { date: '2026-10-08', status: 'Cancelado', studentId: 'S2', student: 'Alumno Dos', responsible: 'Lic. María Torres', branchId: 'CHI' }),
  sch('p6', { date: '2026-10-28', status: 'Reservado', studentId: 'S2', student: 'Alumno Dos', responsible: 'Lic. María Torres', branchId: 'CHI' }),
  sch('p7', { date: '2026-10-15', status: 'Asistió', studentId: 'S2', student: 'Alumno Dos', responsible: 'Lic. María Torres', branchId: 'CHI', program: 'Pre-Kids' }),
  sch('p8', { date: '2026-09-10', status: 'Asistió' }),
];
const sessions: Tracking[] = [
  { id: 'k1', studentId: 'S1', scheduleId: 'p1', date: '2026-10-05', status: 'Asistió', metrics: { velocidad: 100, comprension: 70 }, observations: '' },
  { id: 'k2', studentId: 'S1', scheduleId: 'p2', date: '2026-10-12', status: 'Asistió', metrics: { velocidad: 160, comprension: 85 }, observations: '' },
];
const evts: PsyEvent[] = [
  { id: 'e1', at: '2026-10-07T10:00:00Z', by: 'u', subject: 'asesoria', refId: 'p5', type: 'Cancelada', initiator: 'Alumno o titular', reason: 'Enfermedad del alumno' },
  { id: 'e2', at: '2026-10-10T10:00:00Z', by: 'u', subject: 'asesoria', refId: 'p2', type: 'Reprogramada', initiator: 'Institución', reason: 'Institución: personal no disponible' },
  { id: 'e3', at: '2026-10-11T10:00:00Z', by: 'u', subject: 'asesoria', refId: 'p2', type: 'Reprogramada', initiator: 'Institución', reason: 'Institución: personal no disponible' },
];
const acts: FlatActivity[] = [
  activity('h1', { date: '2026-10-20', responsible: 'Juan Pérez', responsibleId: '1', capacity: 10, enrolled: ['S1', 'S2'], attendance: { S1: { status: 'Asistió', at: 'x', by: 'u' }, S2: { status: 'Faltó', at: 'x', by: 'u' } } }),
  activity('h2', { date: '2026-10-27', capacity: 4, enrolled: ['S1'] }),
];
const rctxReport: PsyReportContext = {
  schedules: rs, trackings: sessions, events: evts, activities: acts,
  enrollments: [{ ...enroll, studentId: 'S1', program: 'Kids' } as Enrollment, { ...enroll, id: 'M2', studentId: 'S2', student: 'Alumno Dos', program: 'Pre-Kids', branchId: 'CHI' } as Enrollment],
  students: [{ ...students[0], status: 'Activo', doc: '1', age: 9, program: 'Kids' }, { ...students[1], status: 'Activo', doc: '2', age: 9, program: 'Pre-Kids' }] as Student[],
  programs: [program], branches, blockedScheduleIds: new Set(['p6']), today,
};
const rep = psyReport(rctxReport, { from: '2026-10-01', to: '2026-10-31', branchId: '', program: '' });
check('Solo cuentan las asesorías del período', rep.kpis.total === 7, String(rep.kpis.total));
check('Asistencia = asistidas / (asistidas + faltas)', rep.kpis.attended === 3 && rep.kpis.absent === 2 && rep.kpis.attendanceRate === 60, JSON.stringify(rep.kpis));
check('Canceladas, por dar y primeras bloqueadas', rep.kpis.cancelled === 1 && rep.kpis.pending === 1 && rep.kpis.firstBlocked === 1);
check('Asistidas sin sesión registrada (p7)', rep.kpis.withoutSession === 1 && rep.kpis.sessionRate === 66.7, JSON.stringify(rep.kpis));
check('Cambios: reprogramaciones, cancelaciones, quién las pidió y las repetidas', rep.changes.reprogramadas === 2 && rep.changes.canceladas === 1 && rep.changes.porAlumno === 1 && rep.changes.porInstitucion === 2 && rep.changes.repetidas === 1 && rep.changes.motivos[0].count === 2);
check('Por responsable y por sede', rep.byResponsible.find(r => r.name === 'Lic. Juan Pérez')?.attended === 2 && rep.byBranch.find(r => r.name === 'Chiclayo')?.total === 3);
check('Filtro por sede y por programa', psyReport(rctxReport, { from: '2026-10-01', to: '2026-10-31', branchId: 'CHI', program: '' }).kpis.total === 3 && psyReport(rctxReport, { from: '2026-10-01', to: '2026-10-31', branchId: '', program: 'Pre-Kids' }).kpis.total === 1);
const prog = rep.progress.find(r => r.program === 'Kids');
check('Progreso: promedios y mejora entre la primera y la última sesión', prog?.sessions === 2 && prog.avgSpeed === 130 && prog.speedGain === 60 && prog.comprehensionGain === 15 && prog.measured === 1, JSON.stringify(prog));
const risk = rep.risk.find(r => r.studentId === 'S1');
check(`Alumno en riesgo: ${RISK_ABSENCES} faltas seguidas`, !!risk && risk.reasons.some(x => /2 faltas seguidas/.test(x)), JSON.stringify(rep.risk));
check('Actividades: asistencia, cupo ocupado y sin responsable', rep.activityKpis.total === 2 && rep.activityKpis.held === 1 && rep.activityKpis.attendanceRate === 50 && rep.activityKpis.withoutResponsible === 1 && rep.activityKpis.occupancy === 21.4, JSON.stringify(rep.activityKpis));
check('Se leen las actividades del cronograma con responsable y asistencia', allActivities([{ id: '1', branchId: 'PIU', sede: 'Piura', mes: 'Octubre', anio: 2026, titulo: 't', observaciones: '', actividades: [scheduleActivity] }])[0].attendance.S1.status === 'Asistió');

console.log(failed === 0 ? '\nTodo correcto.' : `\n${failed} caso(s) fallaron.`);
process.exit(failed === 0 ? 0 : 1);
