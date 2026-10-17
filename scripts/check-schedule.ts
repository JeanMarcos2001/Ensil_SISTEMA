/**
 * Verificación de las reglas de la Programación de asesorías y del calendario.
 * Ejecutar: npx tsx scripts/check-schedule.ts
 */
import type { Schedule } from '../src/context/DataContext';
import {
  addDaysISO,
  endTime,
  findScheduleConflict,
  monthGrid,
  monthTitle,
  validateSchedule,
  weekOf,
  weekdayIndex,
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
check('Febrero 2026 (empieza en domingo) ocupa 5 semanas, sin duplicar días', (() => {
  const g = monthGrid(2026, 2).flat();
  return monthGrid(2026, 2).length === 5 && new Set(g).size === g.length;
})());
check('Un mes que necesita 6 semanas (marzo 2025)', monthGrid(2025, 3).length === 6);
check('Cruce de fin de año', addDaysISO('2026-12-30', 3) === '2027-01-02');
check('Título del mes', monthTitle(2026, 10) === 'Octubre 2026');
check('Hora de fin', endTime('15:30', 45) === '16:15' && endTime('23:30', 45) === '00:15');

// ---------------------------------------------------------------- Conflictos
const base: Schedule = {
  id: '1', student: 'Mateo Ruiz', studentId: 'ALU-001', program: 'Kids', level: 'Nivel 1', type: 'Primera asesoría',
  date: '2026-10-20', time: '10:00', duration: 45, responsible: 'María Torres', modality: 'Presencial', status: 'Confirmado',
};
const list = [base];
const cand = (o: Partial<Schedule>) => ({ student: 'Otro', studentId: 'ALU-009', responsible: 'Juan Pérez', date: '2026-10-20', time: '12:00', duration: 30, status: 'Reservado', ...o });

check('Sin cruce: otro responsable y otra hora → libre', !findScheduleConflict(list, cand({})));
check('Mismo responsable, horario solapado → conflicto', findScheduleConflict(list, cand({ responsible: 'maría torres', time: '10:30' }))?.who === 'responsable');
check('Mismo responsable, justo al terminar la anterior (10:45) → libre', !findScheduleConflict(list, cand({ responsible: 'María Torres', time: '10:45' })));
check('Mismo responsable, termina justo al empezar la otra (09:15–10:00) → libre', !findScheduleConflict(list, cand({ responsible: 'María Torres', time: '09:15', duration: 45 })));
check('Mismo alumno en el mismo horario → conflicto', findScheduleConflict(list, cand({ student: 'Mateo Ruiz', studentId: 'ALU-001', time: '10:15' }))?.who === 'alumno');
check('El título no distingue al responsable (Lic. María Torres = María Torres)', findScheduleConflict([{ ...base, responsible: 'Lic. María Torres' }], cand({ responsible: 'María Torres', time: '10:10' }))?.who === 'responsable');
check('Otro día no cruza', !findScheduleConflict(list, cand({ responsible: 'María Torres', date: '2026-10-21', time: '10:00' })));
check('Editar la misma reserva no cuenta como conflicto consigo misma', !findScheduleConflict(list, cand({ responsible: 'María Torres', time: '10:00' }), '1'));
check('Una cita cancelada libera el horario', !findScheduleConflict([{ ...base, status: 'Cancelado' }], cand({ responsible: 'María Torres', time: '10:00' })));
check('Una propuesta cancelada no bloquea', !findScheduleConflict(list, cand({ responsible: 'María Torres', time: '10:00', status: 'Cancelado' })));

// ---------------------------------------------------------------- Validación
const ok = { student: 'Mateo', responsible: 'Ana', date: '2026-10-20', time: '10:00', duration: 45, status: 'Reservado', isNew: true };
check('Reserva completa → válida', validateSchedule(ok, '2026-10-16') === null);
check('Sin alumno → rechazada', /alumno/i.test(validateSchedule({ ...ok, student: '' }, '2026-10-16') ?? ''));
check('Nueva reserva en el pasado → rechazada', /anterior a hoy/.test(validateSchedule({ ...ok, date: '2026-10-10' }, '2026-10-16') ?? ''));
check('Editar una reserva pasada sí se permite', validateSchedule({ ...ok, date: '2026-10-10', isNew: false }, '2026-10-16') === null);
check('Sin hora → rechazada', /hora/i.test(validateSchedule({ ...ok, time: '' }, '2026-10-16') ?? ''));
check('Duración inválida → rechazada', /duración/i.test(validateSchedule({ ...ok, duration: 0 }, '2026-10-16') ?? ''));
check('Sin responsable → rechazada', /responsable/i.test(validateSchedule({ ...ok, responsible: '' }, '2026-10-16') ?? ''));

console.log(failed === 0 ? '\nTodo correcto.' : `\n${failed} caso(s) fallaron.`);
process.exit(failed === 0 ? 0 : 1);
