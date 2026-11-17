/**
 * Verificación de los cronogramas mensuales y las actividades especiales en la base de datos (Lote 10B). **Lo que se cambia en un cronograma o una actividad deja su
 * evento en el historial (la base lo exige) y la caída o el traslado de sede sacan al alumno de sus actividades EN la misma operación del dinero.**
 *  - códigos de borrador (`CRO`, `ACT`) y filas de la base → lo que muestra el sistema (`utils/activitiesDb.ts`): lo derivable (sede, mes, responsable) sale de las listas;
 *  - lo que viaja a la base: cronogramas nuevos y solo lo que cambió, los eventos de cada cambio, responsable, inscripción, asistencia y bajas;
 *  - operaciones (`services/agenda.ts`) contra un repositorio en memoria: guardar → volver a leer los cronogramas tocados, sin llamar a la base si no hay nada;
 *  - la migración 0023 (tablas, funciones, lo que pide el registro, las reglas que repite la base, permisos y «deshacer») y el cableado (contexto, pantallas).
 * La base se prueba aparte contra una copia (cuentas de dos sedes, personal, vacaciones, cupos, 24 horas, asistencia y la caída real del dinero).
 * Ejecutar: npx tsx scripts/check-activities-db.ts
 */
import { readFileSync } from 'node:fs';
import type { MonthlySchedule, ScheduleActivity } from '../src/context/DataContext';
import { applyActivities, refreshActivities, type AgendaRepository } from '../src/services/agenda';
import {
  ACTIVITY_REMOVED_REASON, MONTHLY_REMOVED_REASON, activityEventRow, activityRemovalsPayload, attendanceChange, createMonthlyChange, deleteMonthlyChange, editMonthlyChange, enrollChange,
  monthlyFromRows, monthlyIdOf, monthliesOf, newActivityEvent, removalEvents, replaceCronogramas, responsibleChange, unenrollChange, EMPTY_ACTIVITIES, type ActivityRows,
} from '../src/utils/activitiesDb';
import { ALL_CAPABILITIES, capabilityById } from '../src/utils/capabilities';
import { AGENDA_CODE_KINDS, draftId, isDraftId } from '../src/utils/draftIds';
import { THROWS_ON_DENIAL } from '../src/utils/guards';
import { CHANGE_REASONS } from '../src/utils/psyHistory';
import { MAX_ACTIVITY_HOURS, MAX_CAPACITY, MIN_CAPACITY, MONTHS, activityPastProblem, allActivities, validateActivity } from '../src/utils/schedule';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : ` -> ${detail}`}`);
  if (!ok) failed++;
};
const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

// ------------------------------------------------------------------------------------------------------------------ Códigos de borrador
{
  const ds = [draftId('CRO'), draftId('ACT'), draftId('ACT')];
  check('El cronograma (CRO) y la actividad (ACT) tienen código de borrador, sin año, que la base cambia por el real', /^CRO-~\d+~$/.test(ds[0]!) && /^ACT-~\d+~$/.test(ds[1]!) && ds.every(isDraftId) && new Set(ds).size === 3
    && AGENDA_CODE_KINDS.CRO.pad === 3 && AGENDA_CODE_KINDS.ACT.pad === 3 && !AGENDA_CODE_KINDS.CRO.year && !AGENDA_CODE_KINDS.ACT.year);
}

// ------------------------------------------------------------------------------------------------------------------ Filas → lo que muestra el sistema
const staff = [{ id: 'STF-001', names: 'Ana', lastNameP: 'Pérez' }];
const branches = [{ id: 'FIL-002', name: 'Piura' }, { id: 'FIL-003', name: 'Chiclayo' }];
const rows: ActivityRows = {
  cronogramas: [
    { id: 'CRO-002', sede_id: 'FIL-003', anio: 2026, mes: 12, titulo: 'Chiclayo', observaciones: '' },
    { id: 'CRO-001', sede_id: 'FIL-002', anio: 2026, mes: 11, titulo: 'Cronograma de Piura', observaciones: 'Mes de comprensión' },
  ],
  actividades: [
    { id: 'ACT-002', cronograma_id: 'CRO-001', sede_id: 'FIL-002', nombre: 'Maratón', fecha: '2026-11-25', hora_inicio: '17:00', hora_fin: '19:00', cupo: null, responsable_id: null, orden: 2 },
    { id: 'ACT-001', cronograma_id: 'CRO-001', sede_id: 'FIL-002', nombre: 'Taller de Ortografía', fecha: '2026-11-24', hora_inicio: '16:00', hora_fin: '18:00', cupo: 12, responsable_id: 'STF-001', orden: 1 },
    { id: 'ACT-003', cronograma_id: 'CRO-002', sede_id: 'FIL-003', nombre: 'Taller para padres', fecha: '2026-12-02', hora_inicio: '18:00', hora_fin: '19:00', cupo: 20, responsable_id: null, orden: 1 },
  ],
  inscripciones: [
    { actividad_id: 'ACT-001', alumno_id: 'ALU-005', sede_id: 'FIL-002', inscrito_en: '2026-11-10T15:00:00Z', inscrito_por: 'Ana', asistencia: 'Faltó', asistencia_nota: 'No avisó.', asistencia_en: '2026-11-24T22:00:00Z', asistencia_por: 'Ana' },
    { actividad_id: 'ACT-001', alumno_id: 'ALU-001', sede_id: 'FIL-002', inscrito_en: '2026-11-09T15:00:00Z', inscrito_por: 'Ana', asistencia: 'Asistió', asistencia_nota: null, asistencia_en: '2026-11-24T22:00:00Z', asistencia_por: 'Ana' },
    { actividad_id: 'ACT-002', alumno_id: 'ALU-001', sede_id: 'FIL-002', inscrito_en: '2026-11-11T15:00:00Z', inscrito_por: 'Ana', asistencia: null, asistencia_nota: null, asistencia_en: null, asistencia_por: null },
  ],
};
const monthly = monthlyFromRows(rows, { staff, branches });
const m1 = monthly.find(m => m.id === 'CRO-001')!;
check('Los cronogramas salen en el orden en que se crearon y muestran la sede y el mes con su nombre, DERIVADOS de sus ids (nada de eso se guarda)',
  monthly.map(m => m.id).join() === 'CRO-001,CRO-002' && m1.sede === 'Piura' && m1.branchId === 'FIL-002' && m1.mes === 'Noviembre' && m1.anio === 2026 && monthly[1]!.mes === 'Diciembre' && monthly[1]!.sede === 'Chiclayo'
  && m1.titulo === 'Cronograma de Piura' && m1.observaciones === 'Mes de comprensión');
const a1 = m1.actividades[0]!, a2 = m1.actividades[1]!;
check('Las actividades salen por su orden, con el responsable DERIVADO de su id (y sin responsable si aún no se asignó)',
  m1.actividades.map(a => a.id).join() === 'ACT-001,ACT-002' && a1.responsable === 'Ana Pérez' && a1.responsableId === 'STF-001' && a2.responsable === '' && a2.responsableId === undefined
  && a1.actividad === 'Taller de Ortografía' && a1.fecha === '2026-11-24' && a1.horaInicio === '16:00' && a1.horaFin === '18:00' && a1.cupo === 12 && a2.cupo === null);
check('Los inscritos salen en el orden en que se inscribieron y la asistencia solo aparece de quien tiene marca (con quién, cuándo y su nota)',
  a1.inscritos.join() === 'ALU-001,ALU-005' && a1.asistencia?.['ALU-001']?.status === 'Asistió' && a1.asistencia?.['ALU-005']?.status === 'Faltó' && a1.asistencia?.['ALU-005']?.note === 'No avisó.'
  && a1.asistencia?.['ALU-001']?.note === undefined && a1.asistencia?.['ALU-001']?.by === 'Ana' && a2.inscritos.join() === 'ALU-001' && a2.asistencia === undefined);
const flat = allActivities(monthly);
check('Las actividades planas (lo que usan la agenda y las reglas) son `cronograma:actividad`, de su sede y con sus inscritos y su asistencia',
  flat.find(a => a.id === 'CRO-001:ACT-001')?.branchId === 'FIL-002' && flat.find(a => a.id === 'CRO-001:ACT-001')?.attendance['ALU-005']?.status === 'Faltó' && flat.length === 3 && monthlyIdOf('CRO-001:ACT-001') === 'CRO-001');
check('Sin filas todo está vacío; una sede o un responsable que aún no se leyó no hace perder la actividad (nombre vacío)',
  monthlyFromRows(EMPTY_ACTIVITIES, { staff, branches }).length === 0 && monthlyFromRows(rows, { staff: [], branches: [] })[0]!.sede === '' && monthlyFromRows(rows, { staff: [], branches: [] })[0]!.actividades.length === 2);

// ------------------------------------------------------------------------------------------------------------------ Volver a leer reemplaza lo de esos cronogramas
{
  // La actividad ACT-002 se quitó, ALU-005 salió de ACT-001 y el cronograma CRO-002 se eliminó
  const fresh: Partial<ActivityRows> = {
    cronogramas: [rows.cronogramas[1]!], actividades: [rows.actividades[1]!], inscripciones: [rows.inscripciones[1]!],
  };
  const next = replaceCronogramas(rows, ['CRO-001', 'CRO-002'], fresh);
  check('Al volver a leer unos cronogramas, lo que ya no está (una actividad quitada, una inscripción retirada, un cronograma eliminado) desaparece y el resto se queda',
    next.cronogramas.map(c => c.id).join() === 'CRO-001' && next.actividades.map(a => a.id).join() === 'ACT-001' && next.inscripciones.map(i => `${i.actividad_id}:${i.alumno_id}`).join() === 'ACT-001:ALU-001');
  const other = replaceCronogramas(rows, ['CRO-002'], { cronogramas: [], actividades: [], inscripciones: [] });
  check('Los cronogramas que no se tocaron no cambian (ni sus actividades ni sus inscritos)',
    other.cronogramas.length === 1 && other.actividades.length === 2 && other.inscripciones.length === 3 && other.cronogramas[0]!.id === 'CRO-001');
}

// ------------------------------------------------------------------------------------------------------------------ Lo que viaja a la base
const act = (over: Partial<ScheduleActivity> = {}): ScheduleActivity => ({ id: 'new-1', actividad: '  Taller de Ortografía ', fecha: '2026-11-24', horaInicio: '16:00', horaFin: '18:00', responsable: '', orden: 1, cupo: 12, inscritos: [], ...over });
const draft = (over: Partial<Omit<MonthlySchedule, 'id'>> = {}): Omit<MonthlySchedule, 'id'> => ({
  branchId: 'FIL-002', sede: 'Piura', mes: 'Noviembre', anio: 2026, titulo: ' Cronograma de Piura ', observaciones: ' notas ', actividades: [act(), act({ id: 'new-2', actividad: 'Maratón', cupo: null, fecha: '2026-11-25' })], ...over,
});
{
  const c = createMonthlyChange(draft());
  const cro = (c.payload.cronogramas as Record<string, unknown>[])[0]!;
  const acts = c.payload.actividades as Record<string, unknown>[];
  check('Un cronograma nuevo viaja completo con código de BORRADOR, el mes como número y el texto sin espacios de más; la base asigna los códigos reales',
    isDraftId(String(cro.id)) && String(cro.id).startsWith('CRO-') && cro._nueva === true && cro.sede_id === 'FIL-002' && cro.mes === 11 && cro.anio === 2026 && cro.titulo === 'Cronograma de Piura' && cro.observaciones === 'notas' && c.cronogramaId === cro.id);
  check('Sus actividades nacen con código de borrador, del cronograma que se crea, SIN responsable (se asigna aparte), con el cupo vacío si no hay límite y su orden',
    acts.length === 2 && acts.every(a => isDraftId(String(a.id)) && String(a.id).startsWith('ACT-') && a._nueva === true && a.cronograma_id === cro.id && !('responsable_id' in a)) && acts[0]!.nombre === 'Taller de Ortografía'
    && acts[0]!.cupo === 12 && acts[1]!.cupo === null && acts[0]!.orden === 1 && acts[1]!.orden === 2 && acts[0]!.hora_inicio === '16:00' && acts[0]!.hora_fin === '18:00' && (c.payload.eventos as unknown[]).length === 0);
}
{
  const before = m1;
  const same = editMonthlyChange(before, { branchId: before.branchId, sede: before.sede, mes: before.mes, anio: before.anio, titulo: before.titulo, observaciones: before.observaciones, actividades: before.actividades.map(a => ({ ...a })) });
  check('Si no cambió nada no hay nada que guardar', same.change === null && !same.error);
  const moved = editMonthlyChange(before, { ...draft(), branchId: 'FIL-003', actividades: before.actividades });
  check('La sede de un cronograma no se cambia', !!moved.error && /sede de un cronograma no se cambia/.test(moved.error) && moved.change === null);
  const edited = editMonthlyChange(before, {
    branchId: before.branchId, sede: before.sede, mes: before.mes, anio: before.anio, titulo: 'Otro título', observaciones: before.observaciones,
    actividades: [{ ...before.actividades[0]!, cupo: 15, actividad: 'Taller de Ortografía y Dictado' }, act({ id: 'new-9', actividad: 'Evaluación', fecha: '2026-11-26' })],
  });
  const p = edited.change!.payload;
  const header = (p.cronogramas as Record<string, unknown>[])[0]!;
  const rowsOut = p.actividades as Record<string, unknown>[];
  check('Del cronograma solo viaja lo que cambió (el título); de una actividad existente, solo sus columnas cambiadas (y nunca el responsable); la nueva, completa',
    Object.keys(header).sort().join() === 'id,titulo' && header.id === 'CRO-001' && rowsOut.length === 2 && Object.keys(rowsOut[0]!).sort().join() === 'cupo,id,nombre' && rowsOut[0]!.id === 'ACT-001' && rowsOut[0]!.cupo === 15
    && rowsOut[1]!._nueva === true && isDraftId(String(rowsOut[1]!.id)) && rowsOut[1]!.cronograma_id === 'CRO-001' && !rowsOut.some(r => 'responsable_id' in r));
  check('Las actividades que ya no están se mandan para quitar y cada inscrito que sale deja su evento DE LA INSTITUCIÓN con su motivo (la base lo exige)',
    JSON.stringify(p.quitar_actividades) === JSON.stringify(['ACT-002']) && (p.eventos as Record<string, unknown>[]).length === 1
    && (p.eventos as Record<string, unknown>[])[0]!.ref_id === 'CRO-001:ACT-002' && (p.eventos as Record<string, unknown>[])[0]!.alumno_id === 'ALU-001' && (p.eventos as Record<string, unknown>[])[0]!.tipo === 'Inscripción quitada'
    && (p.eventos as Record<string, unknown>[])[0]!.iniciador === 'Institución' && (p.eventos as Record<string, unknown>[])[0]!.motivo === ACTIVITY_REMOVED_REASON && (p.eventos as Record<string, unknown>[])[0]!.tema === 'actividad');
  const monthChange = editMonthlyChange(before, { branchId: before.branchId, sede: before.sede, mes: 'Diciembre', anio: 2027, titulo: before.titulo, observaciones: before.observaciones, actividades: before.actividades });
  const mh = (monthChange.change!.payload.cronogramas as Record<string, unknown>[])[0]!;
  check('Cambiar el mes o el año manda el número del mes y el año', mh.mes === 12 && mh.anio === 2027 && !('titulo' in mh));
  const del = deleteMonthlyChange(before);
  check('Eliminar un cronograma manda su código y el evento de cada inscrito (de la institución), de todas sus actividades',
    (del.payload.cronogramas as unknown[]).length === 1 && JSON.stringify((del.payload.cronogramas as Record<string, unknown>[])[0]) === JSON.stringify({ id: 'CRO-001' }) && (del.payload.eventos as Record<string, unknown>[]).length === 3
    && (del.payload.eventos as Record<string, unknown>[]).every(e => e.iniciador === 'Institución' && e.motivo === MONTHLY_REMOVED_REASON && e.tipo === 'Inscripción quitada') && del.cronogramaId === 'CRO-001');
}
{
  const f = flat.find(a => a.id === 'CRO-001:ACT-001')!;
  const r1 = responsibleChange(f, staff[0]);
  const r0 = responsibleChange(f, undefined);
  check('Asignar el responsable manda su id y su evento con el nombre de ese día; quitarlo manda vacío y su evento',
    JSON.stringify(r1.payload.actividades) === JSON.stringify([{ id: 'ACT-001', responsable_id: 'STF-001' }]) && (r1.payload.eventos as Record<string, unknown>[])[0]!.tipo === 'Responsable asignado' && (r1.payload.eventos as Record<string, unknown>[])[0]!.detalle === 'Ana Pérez'
    && (r1.payload.eventos as Record<string, unknown>[])[0]!.alumno_id === null && JSON.stringify(r0.payload.actividades) === JSON.stringify([{ id: 'ACT-001', responsable_id: null }]) && (r0.payload.eventos as Record<string, unknown>[])[0]!.detalle === 'Se quitó el responsable' && r1.cronogramaId === 'CRO-001');
  const en = enrollChange(f, 'ALU-003');
  check('Inscribir manda el alumno y su evento (con el alumno)', JSON.stringify(en.payload.inscripciones) === JSON.stringify([{ actividad_id: 'ACT-001', alumno_id: 'ALU-003' }])
    && (en.payload.eventos as Record<string, unknown>[])[0]!.tipo === 'Inscripción' && (en.payload.eventos as Record<string, unknown>[])[0]!.alumno_id === 'ALU-003' && (en.payload.eventos as Record<string, unknown>[])[0]!.ref_id === 'CRO-001:ACT-001');
  const un = unenrollChange(f, 'ALU-003', { reason: 'Enfermedad del alumno', detail: '  ' });
  const unI = unenrollChange(f, 'ALU-003', { reason: 'Institución: otro motivo', detail: ' La sede cierra ' });
  const ue = (un.payload.eventos as Record<string, unknown>[])[0]!, uei = (unI.payload.eventos as Record<string, unknown>[])[0]!;
  check('Retirar manda el alumno y su evento con el motivo y quién lo pidió (sale del motivo: el alumno o la institución), sin el detalle vacío',
    JSON.stringify(un.payload.quitar_inscripciones) === JSON.stringify([{ actividad_id: 'ACT-001', alumno_id: 'ALU-003' }]) && ue.iniciador === 'Alumno o titular' && ue.motivo === 'Enfermedad del alumno' && ue.detalle === null
    && uei.iniciador === 'Institución' && uei.detalle === 'La sede cierra' && CHANGE_REASONS.some(r => r.reason === 'Enfermedad del alumno'));
  const at = attendanceChange(f, ['ALU-001', 'ALU-005'], 'Asistió');
  const ai = at.payload.inscripciones as Record<string, unknown>[];
  check('La asistencia de varios inscritos viaja en UNA operación: una fila y un evento por alumno',
    ai.length === 2 && ai.every(x => x.asistencia === 'Asistió' && x.nota === null && x.actividad_id === 'ACT-001') && (at.payload.eventos as Record<string, unknown>[]).length === 2
    && (at.payload.eventos as Record<string, unknown>[]).every(e => e.tipo === 'Asistencia a actividad' && e.detalle === 'Asistió'));
  const um = attendanceChange(f, ['ALU-005'], null, '  Se marcó por error ');
  check('Quitar una marca manda estado vacío, su explicación y su evento «Marca quitada»',
    (um.payload.inscripciones as Record<string, unknown>[])[0]!.asistencia === null && (um.payload.inscripciones as Record<string, unknown>[])[0]!.nota === 'Se marcó por error'
    && (um.payload.eventos as Record<string, unknown>[])[0]!.detalle === 'Marca quitada' && (um.payload.eventos as Record<string, unknown>[])[0]!.motivo === 'Se marcó por error');
  const ev = activityEventRow(newActivityEvent('CRO-001:ACT-001', 'Inscripción', { studentId: 'ALU-001' }));
  check('Un evento de actividad lleva su tema, la referencia plana, el alumno y un código de borrador (quién y cuándo los pone la base)',
    ev.tema === 'actividad' && ev.ref_id === 'CRO-001:ACT-001' && ev.alumno_id === 'ALU-001' && isDraftId(String(ev.id)) && String(ev.id).startsWith('EVT-') && !('at' in ev) && !('by' in ev));
  check('Los eventos de salida son siempre de la institución', removalEvents([{ flatId: 'CRO-001:ACT-001', studentId: 'ALU-001' }], 'x').every(e => e.iniciador === 'Institución' && e.motivo === 'x'));
}
{
  const none = activityRemovalsPayload([], 'Caída');
  const some = activityRemovalsPayload([{ monthlyId: 'CRO-001', activityId: 'ACT-001', studentId: 'ALU-001' }, { monthlyId: 'CRO-001', activityId: 'ACT-002', studentId: 'ALU-001' }], 'Caída de la matrícula')!;
  check('Lo que viaja DENTRO de la caída o del traslado: sin bajas no hay nada; con bajas, las inscripciones que salen y el evento de la institución de cada una; y se sabe qué cronogramas volver a leer',
    none === undefined && (some.quitar_inscripciones as unknown[]).length === 2 && (some.eventos as Record<string, unknown>[]).length === 2 && (some.eventos as Record<string, unknown>[]).every(e => e.motivo === 'Caída de la matrícula' && e.iniciador === 'Institución')
    && monthliesOf([{ monthlyId: 'CRO-001' }, { monthlyId: 'CRO-001' }, { monthlyId: 'CRO-002' }]).join() === 'CRO-001,CRO-002');
}

// ------------------------------------------------------------------------------------------------------------------ Reglas puras que repite la base
{
  const ok1 = { actividad: 'Taller', fecha: '2026-11-24', horaInicio: '16:00', horaFin: '18:00', cupo: 12 };
  check('Una actividad válida (martes, dos horas de atención, cupo 12) pasa; los domingos, las horas sueltas y los cupos fuera de rango no',
    validateActivity(ok1, { mes: 'Noviembre', anio: 2026 }) === null && !!validateActivity({ ...ok1, fecha: '2026-11-29' }, { mes: 'Noviembre', anio: 2026 }) && !!validateActivity({ ...ok1, horaInicio: '14:00', horaFin: '15:00' }, { mes: 'Noviembre', anio: 2026 })
    && !!validateActivity({ ...ok1, cupo: 99 }, { mes: 'Noviembre', anio: 2026 }) && !!validateActivity(ok1, { mes: 'Diciembre', anio: 2026 }) && MAX_ACTIVITY_HOURS === 3);
  check('Una actividad nueva, o una que cambia de fecha u horario, no puede quedar en el pasado; una que no se mueve (ya realizada) no se revisa',
    !!activityPastProblem(ok1, undefined, '2026-11-25') && /anterior a hoy/.test(activityPastProblem(ok1, undefined, '2026-11-25') ?? '') && activityPastProblem(ok1, undefined, '2026-11-24') === null
    && !!activityPastProblem({ ...ok1, fecha: '2026-11-20' }, ok1, '2026-11-25') && activityPastProblem(ok1, { fecha: '2026-11-24', horaInicio: '16:00', horaFin: '18:00' }, '2026-11-25') === null);
}

// ------------------------------------------------------------------------------------------------------------------ Operaciones con un repositorio en memoria
function memoryRepo(opts: { fail?: string; failRead?: boolean; codes?: Record<string, string> } = {}) {
  const calls: { fn: string; args: unknown[] }[] = [];
  const repo: AgendaRepository = {
    async loadAll() { return { ok: true, data: { asesorias: [], eventos: [], seguimientos: [], capacidad: [], ...EMPTY_ACTIVITIES, psyPoliticas: [], psyRecordatorios: [] } }; },
    async apply() { return { ok: true, data: { codes: {} } }; },
    async loadTouched() { return { ok: true, data: {} }; },
    async saveCapacity() { return { ok: true, data: null }; },
    async savePsyPolicy() { return { ok: true, data: 1 }; },
    async addPsyReminder() { return { ok: true, data: 'PRL-001' }; },
    async loadPsyReminders() { return { ok: true, data: { psyPoliticas: [], psyRecordatorios: [] } }; },
    async applyActivities(action, payload) { calls.push({ fn: 'applyActivities', args: [action, payload] }); return opts.fail ? { ok: false, error: opts.fail } : { ok: true, data: { codes: opts.codes ?? {} } }; },
    async loadActivitiesTouched(ids) {
      calls.push({ fn: 'loadActivitiesTouched', args: [ids] });
      return opts.failRead ? { ok: false, error: 'sin conexión' } : { ok: true, data: { cronogramas: rows.cronogramas.filter(c => ids.includes(c.id)), actividades: [], inscripciones: [], eventos: [] } };
    },
  };
  return { repo, calls };
}
async function run() {
  { const m = memoryRepo(); const r = await applyActivities(m.repo, 'inscribir', { inscripciones: [], eventos: [] }, ['CRO-001']);
    check('Sin nada que guardar no se llama a la base', r.ok && m.calls.length === 0 && r.value?.touched.length === 0); }
  { const m = memoryRepo({ codes: { 'CRO-~1~': 'CRO-007', 'ACT-~2~': 'ACT-020' } });
    const r = await applyActivities(m.repo, 'crear_cronograma', { cronogramas: [{ id: 'CRO-~1~', _nueva: true }], actividades: [{ id: 'ACT-~2~', _nueva: true }] }, ['CRO-~1~']);
    check('Guardar manda la acción y el envío, y vuelve a leer el cronograma con su código REAL (el que asignó la base)',
      r.ok && m.calls[0]!.fn === 'applyActivities' && m.calls[0]!.args[0] === 'crear_cronograma' && m.calls[1]!.fn === 'loadActivitiesTouched' && (m.calls[1]!.args[0] as string[]).join() === 'CRO-007' && r.value?.codes['CRO-~1~'] === 'CRO-007' && r.value?.touched.join() === 'CRO-007', JSON.stringify(m.calls)); }
  { const m = memoryRepo(); const r = await applyActivities(m.repo, 'editar_cronograma', { cronogramas: [{ id: 'CRO-001', titulo: 'x' }] }, ['CRO-001']);
    check('Editar vuelve a leer ese mismo cronograma', r.ok && (m.calls[1]!.args[0] as string[]).join() === 'CRO-001'); }
  { const r = await applyActivities(memoryRepo({ fail: 'Ya existe un cronograma de esa sede para ese mes.' }).repo, 'crear_cronograma', { cronogramas: [{ id: 'CRO-~1~' }] }, ['CRO-~1~']);
    check('Si la base rechaza, se devuelve su motivo y no se lee nada', !r.ok && /Ya existe un cronograma/.test(r.error ?? '')); }
  { const r = await applyActivities(memoryRepo({ failRead: true }).repo, 'inscribir', { inscripciones: [{ actividad_id: 'ACT-001', alumno_id: 'ALU-001' }] }, ['CRO-001']);
    check('Si se guardó pero no se pudo volver a leer, se avisa que se guardó', !r.ok && /Se guardó, pero no se pudo volver a leer/.test(r.error ?? '')); }
  { const m = memoryRepo(); const r = await refreshActivities(m.repo, []); check('Volver a leer sin cronogramas tocados no llama a la base', r.ok && m.calls.length === 0); }
  { const m = memoryRepo(); const r = await refreshActivities(m.repo, ['CRO-001']);
    check('Volver a leer (tras una caída o un traslado) trae los cronogramas pedidos', r.ok && r.value?.cronogramas.length === 1 && m.calls[0]!.fn === 'loadActivitiesTouched'); }
}

// ------------------------------------------------------------------------------------------------------------------ La migración 0023
const sql = read('supabase/migrations/20261114160000_cronogramas_y_actividades.sql');
const down = read('supabase/deshacer/20261114160000_cronogramas_y_actividades.down.sql');
const code = sql.replace(/--[^\n]*/g, '');
const tables = ['cronogramas', 'actividades', 'actividad_inscripciones'];
check('Crea las tres tablas, con seguridad por fila y solo lectura para las cuentas (todo cambia por funciones)',
  tables.every(t => new RegExp(`create table public\\.${t} \\(`).test(sql) && new RegExp(`alter table public\\.${t}\\s+enable row level security`).test(sql))
  && /revoke all on public\.cronogramas, public\.actividades, public\.actividad_inscripciones from public, anon, authenticated;/.test(sql)
  && /grant select on public\.cronogramas, public\.actividades, public\.actividad_inscripciones to authenticated;/.test(sql) && !/grant (insert|update|delete)/i.test(code));
check('Un cronograma es de una sede y un mes (uno por sede y mes, y la sede no cambia); una actividad es de un cronograma y su sede, lleva el responsable por su id de Personal y cupo de 1 a 50 o sin límite',
  /unique \(sede_id, anio, mes\)/.test(sql) && /sede_id\s+text not null references public\.sedes/.test(sql) && /responsable_id\s+text references public\.personal/.test(sql) && /cupo\s+integer check \(cupo is null or cupo between 1 and 50\)/.test(sql)
  && /cronograma_id\s+text not null references public\.cronogramas/.test(sql) && /check \(hora_fin > hora_inicio\)/.test(sql) && /La sede de un cronograma no se cambia/.test(sql));
check('Con asistencia registrada no se cambia el responsable, la fecha ni el horario, ni se quita la inscripción, la actividad ni el cronograma; nada se vacía ni cambia directo',
  /Con asistencia registrada no se cambia el responsable, la fecha ni el horario de la actividad/.test(sql) && /Ya tiene asistencia registrada: no se puede quitar la inscripción/.test(sql) && /Una actividad con asistencia registrada no se quita/.test(sql)
  && /No se elimina un cronograma con asistencia registrada/.test(sql) && ['cronogramas', 'actividades', 'actividad_inscripciones'].every(t => new RegExp(`create trigger ${t}_no_cambian before update or delete on public\\.${t}`).test(sql) && new RegExp(`create trigger ${t}_no_vaciar\\s+before truncate on public\\.${t}`).test(sql))
  && /De una inscripción solo cambia la asistencia/.test(sql));

// Las acciones y lo que cada una pide
const actionMap = JSON.parse(sql.match(/select '(\{\s*"crear_cronograma"[\s\S]*?\})'::jsonb/)![1]!) as Record<string, { funciones: string[] }>;
const has = (id: string, action: string) => ((capabilityById(id) as { actions?: string[] } | undefined)?.actions ?? []).includes(action);
check('Cada acción de las actividades pide una función que existe en el registro, y esa función es la de la acción del sistema (crear, editar, eliminar cronogramas; responsable; inscribir y retirar; asistencia)',
  Object.values(actionMap).every(a => a.funciones.every(id => !!capabilityById(id))) && Object.keys(actionMap).join() === 'crear_cronograma,editar_cronograma,eliminar_cronograma,responsable,inscribir,quitar_inscripcion,asistencia'
  && actionMap.crear_cronograma!.funciones[0] === 'psi-cronogramas:create' && has('psi-cronogramas:create', 'addMonthlySchedule') && actionMap.editar_cronograma!.funciones[0] === 'psi-cronogramas:edit' && has('psi-cronogramas:edit', 'updateMonthlySchedule')
  && actionMap.eliminar_cronograma!.funciones[0] === 'psi-cronogramas:delete' && has('psi-cronogramas:delete', 'deleteMonthlySchedule') && actionMap.responsable!.funciones[0] === 'psi-prog:activity_lead' && has('psi-prog:activity_lead', 'setActivityResponsible')
  && actionMap.inscribir!.funciones[0] === 'psi-prog:activity_enroll' && actionMap.quitar_inscripcion!.funciones[0] === 'psi-prog:activity_enroll' && has('psi-prog:activity_enroll', 'enrollInActivity') && has('psi-prog:activity_enroll', 'unenrollFromActivity')
  && actionMap.asistencia!.funciones[0] === 'psi-prog:activity_attendance' && has('psi-prog:activity_attendance', 'markActivityAttendance'));

const readers = (entity: string) => ALL_CAPABILITIES.filter(c => (c as { reads?: string[] }).reads?.includes(entity)).map(c => c.id).sort().join();
const listOf = (fn: string) => [...(sql.match(new RegExp(`create function app\\.${fn}\\(\\) returns boolean[\\s\\S]*?array\\[([^\\]]+)\\]`))?.[1] ?? '').matchAll(/'([^']+)'/g)].map(m => m[1]).sort().join();
check('Quién lee los cronogramas, las actividades y sus inscritos es lo mismo que dice el registro (y se lee solo lo de las sedes que se alcanzan); lo mismo para el historial de las actividades',
  listOf('puede_leer_actividades') === readers('activity') && readers('activity') === readers('monthlySchedule')
  && /create policy cronogramas_leer on public\.cronogramas for select to authenticated\s+using \(\(select app\.puede_leer_actividades\(\)\) and \(select app\.ve_sede\(sede_id\)\)\)/.test(sql)
  && /create policy actividades_leer on public\.actividades for select to authenticated\s+using \(\(select app\.puede_leer_actividades\(\)\) and \(select app\.ve_sede\(sede_id\)\)\)/.test(sql)
  && /create policy actividad_inscripciones_leer on public\.actividad_inscripciones for select to authenticated\s+using \(\(select app\.puede_leer_actividades\(\)\) and \(select app\.ve_sede\(sede_id\)\)\)/.test(sql)
  && /drop policy psy_eventos_leer on public\.psy_eventos;\s*create policy psy_eventos_leer on public\.psy_eventos for select to authenticated\s+using \(\(\(tema = 'asesoria' and \(select app\.puede_leer_asesorias\(\)\)\) or \(tema = 'actividad' and \(select app\.puede_leer_actividades\(\)\)\)\) and \(select app\.ve_sede\(sede_id\)\)\)/.test(sql),
  `${listOf('puede_leer_actividades')}\n${readers('activity')}\n${readers('monthlySchedule')}`);
check('Quien ve Matrículas, Programación, Recordatorios, Personal, Contratos, Asignaciones, el historial o el reporte de Psicopedagogía ve también los cronogramas y las actividades (sus pantallas y reglas los consultan)',
  ['op-matriculas:view', 'psi-prog:view', 'psi-recordatorios:view', 'per-personal:view', 'per-contratos:view', 'per-asignaciones:view', 'psi-historial:view', 'rep-psicopedagogia:view', 'psi-cronogramas:view']
    .every(id => ((capabilityById(id) as { reads?: string[] } | undefined)?.reads ?? []).includes('activity') && ((capabilityById(id) as { reads?: string[] }).reads ?? []).includes('monthlySchedule')));

// Las reglas que repite la base son las del sistema (mismos textos: así la pantalla y la base dicen lo mismo)
const schedSrc = read('src/utils/schedule.ts'), actSrc = read('src/utils/psyActivities.ts'), histSrc = read('src/utils/psyHistory.ts');
const same = (src: string, texts: string[]) => texts.every(t => src.includes(t) && sql.includes(t));
check('Las reglas de una actividad son las del sistema (`validateActivity`): nombre, mes, domingos, horas, 1 a 3 horas consecutivas y cupo; y las de una actividad nueva o movida en el pasado',
  same(schedSrc, ['Toda actividad necesita un nombre.', 'los domingos no hay atención; elija de lunes a sábado.', 'elija las horas de la actividad.', 'la hora de fin debe ser posterior a la de inicio.',
    'la fecha no puede ser anterior a hoy.'])
  && /el cupo debe ser un número entero entre \$\{MIN_CAPACITY\} y \$\{MAX_CAPACITY\}, o sin límite\./.test(schedSrc) && sql.includes('el cupo debe ser un número entero entre 1 y 50, o sin límite.') && MIN_CAPACITY === 1 && MAX_CAPACITY === 50
  && /elija entre 1 y \$\{MAX_ACTIVITY_HOURS\} horas consecutivas dentro del horario de atención/.test(schedSrc) && /elija entre 1 y 3 horas consecutivas dentro del horario de atención/.test(sql) && /if v_n > 3 then return 0/.test(sql) && MAX_ACTIVITY_HOURS === 3
  && /la fecha debe estar dentro de \$\{period\.mes\} \$\{period\.anio\}/.test(schedSrc) && /la fecha debe estar dentro de ' \|\| v_meses\[p_mes\] \|\| ' ' \|\| p_anio/.test(sql) && MONTHS.length === 12 && /array\['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'\]/.test(sql));
check('Las reglas del responsable son las del sistema (`validateResponsible`): activo, con asignación activa en Psicopedagogía, que trabaje ese día y sin otra actividad ni asesoría a esa hora; y con asistencia no se cambia',
  same(actSrc, ['está inactivo.', 'no tiene una asignación activa en Psicopedagogía.', 'No se encontró al trabajador.', 'Ya hay asistencia registrada: no se cambia el responsable (quedaría registrada a nombre de otra persona).', 'Asigne primero al responsable de la actividad: es quien firma la asistencia.', 'La asistencia se registra desde el día de la actividad.'])
  && /a\.area = 'Psicopedagogía' and a\.estado = 'Activa'/.test(sql) && /app\.personal_disponible\(p_personal, p_fecha\)/.test(sql) && /ya es responsable de «/.test(actSrc) && /ya es responsable de «/.test(sql) && /tiene una asesoría con/.test(sql) && /tiene una asesoría con/.test(actSrc)
  && /s\.estado in \('Reservado', 'Reprogramado', 'Asistió'\)/.test(sql));
check('La inscripción es la del sistema (`validateActivityEnrollment`): la actividad no pasó, no repetir, la sede del alumno, el cupo y sin cruce con una asesoría suya; y retirar o marcar tienen sus reglas',
  /ya está inscrito en «/.test(sql) && /pertenece a otra sede; la actividad es de/.test(sql) && /está completa \(% de % cupos\)/.test(sql) && /Reprográmela antes de inscribirlo/.test(sql) && /ya pasó: no admite inscripciones/.test(sql)
  && /ya está inscrito en «\$\{a\.name\}»/.test(schedSrc) && /pertenece a otra sede; la actividad es de \$\{a\.sede\}/.test(schedSrc) && /está completa \(\$\{a\.enrolled\.length\} de \$\{a\.capacity\} cupos\)/.test(schedSrc) && /Reprográmela antes de inscribirlo/.test(schedSrc)
  && same(read('src/context/DataContext.tsx'), ['La actividad ya pasó: no se quitan inscripciones.', 'Ya tiene asistencia registrada: no se puede quitar la inscripción.', 'Explique por qué se quita la marca: queda en el historial.', 'El alumno no tiene marca de asistencia.'])
  && /order by m\.fecha desc, m\.id desc limit 1/.test(sql) && /Indique si asistió o faltó\./.test(sql) && /Indique si asistió o faltó\./.test(actSrc));
check('La regla de las 24 horas y los motivos son los de siempre (`validateChangeMeta`): el alumno solo con aviso, la institución con su función; y quien lo pidió debe corresponder al motivo',
  same(histSrc, ['Con menos de 24 horas el alumno o su titular ya no puede cambiar la asesoría: si la institución decide el cambio, elija un motivo de la institución.', 'Su rol no puede cambiar una asesoría con menos de 24 horas de anticipación.', 'Seleccione el motivo.', 'Explique brevemente el motivo: queda en el historial.'])
  && /v_horas >= 24/.test(sql) && /app\.permite\('psi-prog:institutional_change'\)/.test(sql) && /America\/Lima/.test(sql) && /Quién pidió el cambio no corresponde al motivo/.test(sql) && CHANGE_REASONS.length === 10);
check('Cada cambio deja su evento y no hay eventos sin cambio; las salidas de la caída, del traslado y de eliminar son de la institución con su motivo',
  /Todo cambio de una actividad deja su evento en el historial/.test(sql) && /Un evento debe corresponder a un cambio de esta operación/.test(sql) && /Un cambio que hace el sistema es de la institución y lleva su motivo/.test(sql)
  && ['Responsable asignado', '|Inscripción', 'Inscripción quitada', 'Asistencia a actividad'].every(t => sql.includes(t)) && /v_inst := v_inst \|\| v_clave/.test(sql) && /array_remove\(v_hechos, v_clave\)/.test(sql));
check('La base vuelve a comprobar: sede alcanzable en cada acción, con la función del registro; y por una pantalla desactualizada (código escrito a mano) se rechaza',
  (sql.match(/perform app\.exigir_sede\(/g) ?? []).length >= 8 && /perform app\.exigir_alguna\(v_funcs, 'Su rol no puede ' \|\| \(v_conf->>'mensaje'\)/.test(sql) && /Esta pantalla está desactualizada: el código de un registro nuevo lo asigna el sistema/.test(sql)
  && /\^CRO-~\[0-9\]\+~\$/.test(sql) && /\^ACT-~\[0-9\]\+~\$/.test(sql) && /\^EVT-~\[0-9\]\+~\$/.test(sql) && /for update/.test(sql));
check('La base asigna los códigos CRO y ACT (el siguiente al más alto de TODA la tabla, con un candado) y NO reutiliza el de un cronograma o una actividad que el historial todavía nombra',
  /if v_tok\.pref not in \('SES', 'EVT', 'TRK', 'CRO', 'ACT'\)/.test(sql) && /pg_advisory_xact_lock\(hashtextextended\('ensil:codigo:' \|\| v_grupo \|\| '\|', 0\)\)/.test(sql) && /when 'CRO' then greatest\(/.test(sql) && /when 'ACT' then greatest\(/.test(sql)
  && /substring\(e\.ref_id from '\^CRO-\(\[0-9\]\+\):'\)/.test(sql) && /substring\(e\.ref_id from ':ACT-\(\[0-9\]\+\)\$'\)/.test(sql) && /create or replace function app\.asignar_codigos_agenda/.test(sql));
check('Una actividad bloquea los horarios de asesoría de su sede: la base lo exige al reservar, mover o reactivar una asesoría y a la primera asesoría (se reemplaza `verificar_asesoria` con ese único cambio)',
  /create or replace function app\.verificar_asesoria/.test(sql) && /v_bloq := app\.actividad_bloqueante\(n\.sede_id, n\.fecha, n\.hora\)/.test(sql) && /Ese horario está ocupado por la actividad %/.test(sql)
  && sql.indexOf('v_bloq := app.actividad_bloqueante') > sql.indexOf('create or replace function app.verificar_asesoria') && sql.indexOf('v_bloq := app.actividad_bloqueante') < sql.indexOf('if n.es_primera then', sql.indexOf('v_bloq := app.actividad_bloqueante'))
  && /ocupado por la actividad/.test(schedSrc));
check('La función del dinero acepta `agenda.actividades` SOLO en caída y traslado, la aplica DESPUÉS del dinero y de las asesorías y en la misma operación; las demás acciones la rechazan',
  /create or replace function public\.aplicar_cambios_matricula/.test(sql) && /v_act := v_agenda->'actividades'/.test(sql) && /p_accion not in \('caida', 'traslado'\) then raise exception 'Esta operación no cambia las actividades\.'/.test(sql)
  && /app\.aplicar_actividades\(p_accion, v_act, true\)/.test(sql) && sql.indexOf('app.aplicar_agenda(p_accion, v_agenda, true)') < sql.indexOf('app.aplicar_actividades(p_accion, v_act, true)') && /app\.verificar_mora\(p\)/.test(sql));
check('Las funciones públicas son de las cuentas con sesión y lo interno no se llama de fuera; no se toca ningún otro permiso del esquema',
  /revoke execute on function public\.aplicar_cambios_actividades\(text, jsonb\) from public, anon;/.test(sql) && /grant execute on function public\.aplicar_cambios_actividades\(text, jsonb\) to authenticated;/.test(sql)
  && /revoke execute on function\s+app\.aplicar_actividades\(text, jsonb, boolean\)[\s\S]*?from public, anon, authenticated;/.test(sql) && !/on all functions in schema app/.test(code));
check('La migración se puede deshacer: quita las tres tablas y las funciones nuevas, y devuelve a la versión de la 0022 la función del dinero, la asignación de códigos y la comprobación de asesorías; el historial no se borra',
  tables.every(t => down.includes(`drop table if exists public.${t};`)) && down.includes('drop function if exists public.aplicar_cambios_actividades(') && /create or replace function public\.aplicar_cambios_matricula/.test(down) && /create or replace function app\.verificar_asesoria/.test(down)
  && /create or replace function app\.asignar_codigos_agenda/.test(down) && !/actividad_bloqueante\(n\./.test(down) && !/'CRO', 'ACT'/.test(down) && !/delete from public\.psy_eventos/.test(down));

// ------------------------------------------------------------------------------------------------------------------ Cableado
const ctxSrc = read('src/context/DataContext.tsx');
const hook = read('src/hooks/useAgenda.ts');
const repoSrc = read('src/services/agendaRepository.ts');
check('El repositorio de Supabase llama a la función de las actividades y lee las tres tablas (los cronogramas tocados se vuelven a leer con su historial)',
  repoSrc.includes("'aplicar_cambios_actividades'") && ["'cronogramas'", "'actividades'", "'actividad_inscripciones'"].every(t => repoSrc.includes(t)) && /like\('ref_id', `\$\{id\}:%`\)/.test(repoSrc) && /eq\('tema', 'actividad'\)/.test(repoSrc));
check('El gancho reemplaza los cronogramas que vuelve a leer (lo quitado desaparece) y expone lo necesario al contexto',
  /replaceCronogramas\(rowsRef\.current, ids, fresh\)/.test(hook) && /applyActivity/.test(hook) && /refreshActivitiesFor/.test(hook) && /mergeActivities\(res\.value\.touched, res\.value\.fresh\)/.test(hook));
check('Las acciones de cronogramas y actividades son asíncronas y devuelven { ok, error } (ya no lanzan error al negar el permiso)',
  /addMonthlySchedule: \(data: Omit<MonthlySchedule, 'id'>\) => Promise<StockResult>/.test(ctxSrc) && /updateMonthlySchedule: \(id: string, data: Omit<MonthlySchedule, 'id'>\) => Promise<StockResult>/.test(ctxSrc)
  && /deleteMonthlySchedule: \(id: string\) => Promise<StockResult>/.test(ctxSrc) && /setActivityResponsible: \([^)]*\) => Promise<StockResult>/.test(ctxSrc) && /enrollInActivity: \([^)]*\) => Promise<StockResult>/.test(ctxSrc)
  && /unenrollFromActivity: \([^)]*\) => Promise<StockResult>/.test(ctxSrc) && /markActivityAttendance: \([^)]*\) => Promise<StockResult>/.test(ctxSrc)
  && !['addMonthlySchedule', 'updateMonthlySchedule', 'deleteMonthlySchedule', 'setActivityResponsible', 'enrollInActivity', 'unenrollFromActivity', 'markActivityAttendance'].some(a => THROWS_ON_DENIAL.has(a)));
check('Cada acción guarda con su función de la base (la acción que pide la función del registro) y solo después de validar con las reglas del sistema',
  /agenda\.applyActivity\('crear_cronograma', change\.payload, \[change\.cronogramaId\]\)/.test(ctxSrc) && /agenda\.applyActivity\('editar_cronograma', built\.change\.payload, \[built\.change\.cronogramaId\]\)/.test(ctxSrc)
  && /agenda\.applyActivity\('eliminar_cronograma', change\.payload, \[change\.cronogramaId\]\)/.test(ctxSrc) && /agenda\.applyActivity\('responsable', change\.payload/.test(ctxSrc) && /agenda\.applyActivity\('inscribir', change\.payload/.test(ctxSrc)
  && /agenda\.applyActivity\('quitar_inscripcion', change\.payload/.test(ctxSrc) && /agenda\.applyActivity\('asistencia', change\.payload/.test(ctxSrc) && /validateResponsible\(a, staffId/.test(ctxSrc) && /validateActivityEnrollment\(\{/.test(ctxSrc)
  && /validateChangeMeta\('cancelar', meta/.test(ctxSrc) && /No se elimina un cronograma con asistencia registrada/.test(ctxSrc));
check('Marcar la asistencia de varios es UNA operación (todo o nada) y asignar al mismo responsable no manda nada',
  /studentId: string \| string\[\]/.test(ctxSrc) && /const ids = Array\.isArray\(studentId\) \? studentId : \[studentId\]/.test(ctxSrc) && /if \(\(member\?\.id \?\? null\) === \(a\.responsibleId \?\? null\)\) return \{ ok: true \}/.test(ctxSrc));
check('La caída y el traslado vuelven a leer los cronogramas que tocaron después de guardar',
  /await agenda\.refreshActivitiesFor\(monthliesOf\(preview\.activityRemovals\)\)/.test(ctxSrc) && /afterSave = \(\) => \{ void agenda\.refreshActivitiesFor\(monthliesOf\(preview\.activityRemovals\)\); \}/.test(ctxSrc));
const screens = { monthly: read('src/pages/psychopedagogy/MonthlySchedules.tsx'), enroll: read('src/pages/psychopedagogy/ActivityEnrollModal.tsx') };
check('Las pantallas de cronogramas e inscripción esperan la respuesta de la base antes de seguir, apagan los botones mientras guardan y muestran el motivo si se rechaza',
  /await updateMonthlySchedule\(selectedSchedule\.id, data\) : await addMonthlySchedule\(data\)/.test(screens.monthly) && /disabled=\{saving\}/.test(screens.monthly) && /await deleteMonthlySchedule\(toDelete\.id\)/.test(screens.monthly)
  && /await enrollInActivity\(selected\.id, studentId\)/.test(screens.enroll) && /await setActivityResponsible\(selected\.id, staffId \|\| null\)/.test(screens.enroll) && /await markActivityAttendance\(selected\.id, studentId, status\)/.test(screens.enroll)
  && /await unenrollFromActivity\(selected\.id, toRemove, \{ reason, detail \}\)/.test(screens.enroll) && /disabled=\{busy\}/.test(screens.enroll) && /setError\(res\.error \?\? 'No se pudo guardar el cronograma\.'\)/.test(screens.monthly));
check('La sede de un cronograma ya creado no se cambia (la pantalla lo apaga) y una actividad nueva o movida al pasado se rechaza antes de guardar',
  /disabled=\{!!selectedSchedule\}/.test(screens.monthly) && /activityPastProblem\(a, before, today\)/.test(screens.monthly));
check('La caída y el traslado no sacan al alumno de una actividad donde ya tiene su asistencia (es historial)',
  /!a\.asistencia\?\.\[studentId\]/.test(read('src/utils/enrollmentDrop.ts')) && /!a\.asistencia\?\.\[student\.id\]/.test(read('src/utils/enrollmentChange.ts')));

run().then(() => {
  if (failed > 0) {
    console.log(`\n${failed} comprobaciones fallaron.`);
    process.exit(1);
  }
  console.log('\nTodo en verde.');
});
