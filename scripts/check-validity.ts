/**
 * Verificación de la vigencia de las matrículas: duración base + garantía desde la primera asesoría,
 * alerta, extensión y qué alumnos aparecen para programar asesorías.
 * Ejecutar: npx tsx scripts/check-validity.ts
 */
import type { Enrollment, Program, Schedule, Student } from '../src/context/DataContext';
import {
  EXPIRY_ALERT_DAYS,
  addMonths,
  canEnableExtension,
  daysBetween,
  enrollmentValidity,
  firstSessionOf,
  isStudentWorkable,
  studentExpiring,
  studentLimit,
  validityCounts,
} from '../src/utils/validity';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : ` -> ${detail}`}`);
  if (!ok) failed++;
};

// ---------------------------------------------------------------- Meses de calendario
check('15-oct + 3 meses = 15-ene', addMonths('2026-10-15', 3) === '2027-01-15');
check('Cruce de año', addMonths('2026-11-30', 3) === '2027-02-28');
check('31-ene + 1 mes = fin de febrero (28 / 29 en bisiesto)', addMonths('2026-01-31', 1) === '2026-02-28' && addMonths('2028-01-31', 1) === '2028-02-29');
check('31-ago + 6 meses = 28-feb', addMonths('2026-08-31', 6) === '2027-02-28');
check('12 meses = mismo día del año siguiente', addMonths('2026-10-15', 12) === '2027-10-15');
check('29-feb bisiesto + 12 meses = 28-feb', addMonths('2028-02-29', 12) === '2029-02-28');
check('Días entre fechas', daysBetween('2026-10-20', '2026-10-30') === 10 && daysBetween('2026-10-30', '2026-10-20') === -10 && daysBetween('2026-12-30', '2027-01-02') === 3);

// ---------------------------------------------------------------- Datos
const kids: Program = { id: '1', code: 'K', name: 'Kids', hasLevels: true, durationBase: 3, warranty: 3, allBranches: true, status: 'Activo' };
const prof: Program = { id: '5', code: 'P', name: 'Profesional', hasLevels: false, durationBase: 6, warranty: 6, allBranches: true, status: 'Activo' };
const noWarranty: Program = { ...kids, id: '9', warranty: 0 };
const enr = (id: string, over: Partial<Enrollment> = {}): Enrollment => ({
  id, date: '', student: 'Mateo', studentId: 'ALU-1', program: 'Kids', programId: '1', level: 'N1', status: 'Activa', plan: 'Al día', ...over,
});
const first = (enrollmentId: string, date: string, over: Partial<Schedule> = {}): Schedule => ({
  id: `S-${enrollmentId}-${date}`, student: 'Mateo', studentId: 'ALU-1', program: 'Kids', level: 'N1', date, time: '16:00', duration: 60,
  responsible: 'Ana', status: 'Asistió', branchId: 'FIL-PIU', isFirst: true, registrationId: 'REG', enrollmentId, ...over,
});
const V = (e: Enrollment, program: Program | undefined, schedules: Schedule[], today: string) => enrollmentValidity(e, program, schedules, today);

// ---------------------------------------------------------------- Inicio = primera asesoría
const s1 = first('M1', '2026-10-15');
check('Sin primera asesoría vinculada → sin inicio (y se le sigue programando)', V(enr('M1'), kids, [], '2026-10-20').state === 'sin-inicio' && V(enr('M1'), kids, [], '2026-10-20').working);
check('Sin programa → sin inicio', V(enr('M1'), undefined, [s1], '2026-10-20').state === 'sin-inicio');
check('La primera asesoría cancelada no cuenta', V(enr('M1'), kids, [first('M1', '2026-10-15', { status: 'Cancelado' })], '2026-10-20').state === 'sin-inicio');
check('La primera asesoría de otra matrícula no cuenta', V(enr('M2'), kids, [s1], '2026-10-20').state === 'sin-inicio');
check('Una asesoría normal no inicia la vigencia', V(enr('M1'), kids, [first('M1', '2026-10-15', { isFirst: false })], '2026-10-20').state === 'sin-inicio');
check('Si hay una cancelada y una reprogramada, vale la vigente', firstSessionOf('M1', [first('M1', '2026-10-01', { status: 'Cancelado' }), first('M1', '2026-10-22', { status: 'Reprogramado' })])?.date === '2026-10-22');
check('Una primera asesoría con falta cuenta (la fecha ya pasó)', firstSessionOf('M1', [first('M1', '2026-10-01', { status: 'Faltó' })])?.date === '2026-10-01');

// ---------------------------------------------------------------- Fechas de fin
const v0 = V(enr('M1'), kids, [s1], '2026-10-20');
check('Kids 3 + 3 desde el 15-oct: base hasta el 14-ene y extensión hasta el 14-abr', v0.start === '2026-10-15' && v0.baseEnd === '2027-01-14' && v0.extensionEnd === '2027-04-14');
const vp = V(enr('M1', { programId: '5' }), prof, [s1], '2026-10-20');
check('Profesional 6 + 6 desde el 15-oct: base hasta el 14-abr y extensión hasta el 14-oct del año siguiente', vp.baseEnd === '2027-04-14' && vp.extensionEnd === '2027-10-14');
check('Inicio el 31-ago (Kids): como noviembre no tiene día 31, la base termina el 29-nov y la extensión el 27-feb', (() => {
  const v = V(enr('M1'), kids, [first('M1', '2026-08-31')], '2026-09-10');
  return v.baseEnd === '2026-11-29' && v.extensionEnd === '2027-02-27';
})());

// ---------------------------------------------------------------- Estados
check('Antes de la primera asesoría → por iniciar', V(enr('M1'), kids, [s1], '2026-10-14').state === 'por-iniciar' && V(enr('M1'), kids, [s1], '2026-10-14').working);
check('El día de la primera asesoría → vigente', V(enr('M1'), kids, [s1], '2026-10-15').state === 'vigente');
check('En plena duración base → vigente', V(enr('M1'), kids, [s1], '2026-12-01').state === 'vigente');
check('Alerta: 14 días antes del fin de la base (31-dic) → por vencer', EXPIRY_ALERT_DAYS === 14 && V(enr('M1'), kids, [s1], '2026-12-31').state === 'por-vencer' && V(enr('M1'), kids, [s1], '2026-12-31').daysToBaseEnd === 14);
check('Un día antes de la alerta (30-dic) → vigente', V(enr('M1'), kids, [s1], '2026-12-30').state === 'vigente');
check('Último día de la base (14-ene) → por vencer, 0 días', V(enr('M1'), kids, [s1], '2027-01-14').state === 'por-vencer' && V(enr('M1'), kids, [s1], '2027-01-14').daysToBaseEnd === 0);
check('Pasó la base sin extensión → base finalizada: ya no aparece', V(enr('M1'), kids, [s1], '2027-01-15').state === 'base-finalizada' && !V(enr('M1'), kids, [s1], '2027-01-15').working);

const ext = enr('M1', { extensionEnabledAt: '2027-01-10T10:00:00Z', extensionEnabledBy: 'Admin' });
check('Con la extensión habilitada, la alerta desaparece', V(ext, kids, [s1], '2027-01-10').state === 'vigente');
check('Pasó la base con extensión → en extensión: sigue apareciendo', V(ext, kids, [s1], '2027-01-15').state === 'extension' && V(ext, kids, [s1], '2027-01-15').working);
check('Último día de la extensión (14-abr) → en extensión', V(ext, kids, [s1], '2027-04-14').state === 'extension');
check('Pasó la extensión → finalizada: ya no aparece', V(ext, kids, [s1], '2027-04-15').state === 'finalizada' && !V(ext, kids, [s1], '2027-04-15').working);

// ---------------------------------------------------------------- Habilitar extensión
check('Se puede habilitar cuando está por vencer', canEnableExtension(V(enr('M1'), kids, [s1], '2026-12-31')));
check('Se puede habilitar cuando terminó la base', canEnableExtension(V(enr('M1'), kids, [s1], '2027-02-01')));
check('No antes de la alerta', !canEnableExtension(V(enr('M1'), kids, [s1], '2026-11-01')));
check('No si ya está habilitada', !canEnableExtension(V(ext, kids, [s1], '2027-02-01')));
check('No si el programa no tiene garantía', !canEnableExtension(V(enr('M1'), noWarranty, [s1], '2026-12-31')));
check('No si ya terminó también el período de extensión (finalizada)', V(enr('M1'), kids, [s1], '2027-06-01').state === 'finalizada' && !canEnableExtension(V(enr('M1'), kids, [s1], '2027-06-01')));
check('Todavía dentro del período de extensión sin habilitarla → base finalizada, se puede habilitar', V(enr('M1'), kids, [s1], '2027-03-01').state === 'base-finalizada' && canEnableExtension(V(enr('M1'), kids, [s1], '2027-03-01')));
check('Sin inicio no se puede habilitar', !canEnableExtension(V(enr('M1'), kids, [], '2026-12-31')));

// ---------------------------------------------------------------- Alumnos que aparecen para programar
const student = (over: Partial<Student> = {}): Student => ({ id: 'ALU-1', doc: '1', name: 'Mateo', age: 9, program: 'Kids', titular: 'T', status: 'Activo', ...over });
const cat = (enrollments: Enrollment[], schedules: Schedule[]) => ({ enrollments, programs: [kids, prof], schedules });
check('Alumno con matrícula vigente → aparece', isStudentWorkable(student(), cat([enr('M1')], [s1]), '2026-12-01'));
check('Alumno con la base terminada y sin extensión → deja de aparecer (sus datos siguen)', !isStudentWorkable(student(), cat([enr('M1')], [s1]), '2027-02-01'));
check('Con la extensión habilitada → vuelve a aparecer', isStudentWorkable(student(), cat([ext], [s1]), '2027-02-01'));
check('Alumno inactivo → no aparece', !isStudentWorkable(student({ status: 'Inactivo' }), cat([enr('M1')], [s1]), '2026-12-01'));
check('Alumno sin matrículas registradas → no se altera (aparece)', isStudentWorkable(student(), cat([], []), '2026-12-01'));
check('Matrícula sin primera asesoría → aparece', isStudentWorkable(student(), cat([enr('M1')], []), '2027-02-01'));
check('Con otra matrícula vigente (renovación) → aparece aunque la anterior terminó',
  isStudentWorkable(student(), cat([enr('M1'), enr('M2', { programId: '5', program: 'Profesional' })], [s1, first('M2', '2027-01-20')]), '2027-02-01'));
check('Matrícula caída no cuenta', !isStudentWorkable(student(), cat([enr('M1', { status: 'Caída' })], [s1]), '2026-12-01'));
check('Se reconoce al alumno por nombre cuando la matrícula no trae su id', isStudentWorkable(student(), cat([enr('M1', { studentId: undefined })], [s1]), '2026-12-01'));

// ---------------------------------------------------------------- Límite para programar y aviso
check('Límite para programar: fin de la base', studentLimit(student(), cat([enr('M1')], [s1]), '2026-12-01') === '2027-01-14');
check('Límite con extensión: fin de la extensión', studentLimit(student(), cat([ext], [s1]), '2027-02-01') === '2027-04-14');
check('Sin inicio → sin límite', studentLimit(student(), cat([enr('M1')], []), '2026-12-01') === undefined);
check('El límite es el más lejano entre matrículas vigentes', studentLimit(student(), cat([enr('M1'), enr('M2', { programId: '5' })], [s1, first('M2', '2026-11-01')]), '2026-12-01') === '2027-04-30');
check('Aviso «por vencer» del alumno', studentExpiring(student(), cat([enr('M1')], [s1]), '2026-12-31')?.state === 'por-vencer' && !studentExpiring(student(), cat([enr('M1')], [s1]), '2026-12-01'));

// ---------------------------------------------------------------- Conteos (filtros y Dashboard)
const counts = validityCounts(
  { enrollments: [enr('M1'), enr('M2'), enr('M3'), enr('M4', { status: 'Caída' })], programs: [kids], schedules: [first('M1', '2026-10-15'), first('M2', '2026-12-31')] },
  '2026-12-31'
);
check('Conteos por estado (las caídas no cuentan)', counts['por-vencer'] === 1 && counts['por-iniciar'] === 0 && counts.vigente === 1 && counts['sin-inicio'] === 1 && Object.values(counts).reduce((a, b) => a + b, 0) === 3, JSON.stringify(counts));

console.log(failed === 0 ? '\nTodo correcto.' : `\n${failed} caso(s) fallaron.`);
process.exit(failed === 0 ? 0 : 1);
