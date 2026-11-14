/**
 * Verificación de la agenda de Psicopedagogía en la base de datos (Lote 10A: asesorías, historial, seguimiento y cupos). **Lo que la agenda cambia dentro de una
 * operación del dinero (la primera asesoría al matricular, las cancelaciones al caer o trasladarse) viaja EN esa operación.**
 *  - códigos de borrador de la agenda (`SES`, `EVT`, `TRK`);
 *  - traducción de filas de la base (`utils/agendaDb.ts`): lo derivable (alumno, programa, responsable) sale de las listas, nunca se guarda;
 *  - lo que viaja a la base: filas nuevas y solo lo que cambió, la acción que es cada cambio, el historial y los cupos;
 *  - operaciones (`services/agenda.ts`) contra un repositorio en memoria: guardar → volver a leer lo tocado, sin llamar a la base si no hay nada;
 *  - la migración 0022 (tablas, funciones, lo que pide el registro, las reglas que repite la base, permisos y «deshacer») y el cableado (contexto, inicio de
 *    sesión, matrícula y pantallas).
 * La base se prueba aparte contra una copia (cuentas de dos sedes, personal, vacaciones, cupos, verificación de materiales y los envíos que arma el propio cliente).
 * Ejecutar: npx tsx scripts/check-agenda-db.ts
 */
import { readFileSync } from 'node:fs';
import type { Assignment, CapacityConfig, Enrollment, Schedule, Staff, Tracking } from '../src/context/DataContext';
import { applyAgenda, applyCapacity, loadAgenda, realCodes, refreshAgenda, type AgendaRepository } from '../src/services/agenda';
import type { RepoResult } from '../src/services/orgDirectory';
import {
  agendaErrorMessage, agendaFromRows, capacityChanges, capacityFromRows, capacityRowId, eventRow, hasCapacityChanges, mergeAgendaRows, overrideId, resolveResponsibleId,
  scheduleActionOf, scheduleChangeRow, scheduleInsertRow, trackingChangeRow, trackingInsertRow, EMPTY_AGENDA, type AgendaRows,
} from '../src/utils/agendaDb';
import { ALL_CAPABILITIES, capabilityById } from '../src/utils/capabilities';
import { AGENDA_CODE_KINDS, CODE_KINDS, STAFF_CODE_KINDS, draftId, isDraftId } from '../src/utils/draftIds';
import { THROWS_ON_DENIAL } from '../src/utils/guards';
import { CHANGE_REASONS, MATERIALS_REASON, buildScheduleEvents } from '../src/utils/psyHistory';
import { DEFAULT_CAPACITY, SLOT_DURATION, capacityFor, slotsForDate } from '../src/utils/schedule';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : ` -> ${detail}`}`);
  if (!ok) failed++;
};
const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const throws = (fn: () => unknown, re: RegExp) => { try { fn(); return false; } catch (e) { return re.test(String((e as Error).message)); } };

// ------------------------------------------------------------------------------------------------------------------ Códigos de borrador
check('Hay tres códigos de la agenda: asesoría (SES), evento del historial (EVT) y seguimiento (TRK), sin año; ninguno se mezcla con los del dinero ni los del personal',
  Object.keys(AGENDA_CODE_KINDS).join() === 'SES,EVT,TRK' && Object.keys(AGENDA_CODE_KINDS).every(k => !(k in CODE_KINDS) && !(k in STAFF_CODE_KINDS)) && Object.values(AGENDA_CODE_KINDS).every(k => !k.year));
{
  const ds = [draftId('SES'), draftId('EVT'), draftId('TRK'), draftId('SES')];
  check('Un borrador tiene el aspecto del código con el número entre «~» (SES-~1~), se reconoce y dos no se repiten',
    /^SES-~\d+~$/.test(ds[0]!) && /^EVT-~\d+~$/.test(ds[1]!) && /^TRK-~\d+~$/.test(ds[2]!) && ds.every(isDraftId) && new Set(ds).size === 4 && !isDraftId('SES-001'));
  check('Un código de la agenda no lleva año', throws(() => draftId('SES', 2026), /no lleva año/));
}

// ------------------------------------------------------------------------------------------------------------------ Filas → lo que muestra el sistema
const students = [{ id: 'ALU-001', name: 'Mateo Ruiz' }, { id: 'ALU-002', name: 'Sofía Díaz' }];
const enr = (id: string, studentId: string, program: string, level: string, dateISO: string): Enrollment => ({ id, studentId, program, level, dateISO, branchId: 'FIL-002' } as unknown as Enrollment);
const enrollments = [enr('MAT-2026-001', 'ALU-001', 'Kids', 'Nivel 1', '2026-03-01'), enr('MAT-2026-002', 'ALU-001', 'Profesional', 'Sin nivel', '2026-09-01'), enr('MAT-2026-003', 'ALU-002', 'Kids', 'Nivel 2', '2026-08-01')];
const staff = [{ id: 'STF-001', names: 'Ana', lastNameP: 'Pérez' }];
const rows: AgendaRows = {
  asesorias: [
    { id: 'SES-001', alumno_id: 'ALU-001', sede_id: 'FIL-002', fecha: '2026-11-20', hora: '16:00', responsable_id: 'STF-001', estado: 'Reservado', observaciones: null, es_primera: true, registro_id: 'MAT-2026-001', matricula_id: 'MAT-2026-001' },
    { id: 'SES-002', alumno_id: 'ALU-001', sede_id: 'FIL-002', fecha: '2026-11-21', hora: '17:00', responsable_id: null, estado: 'Cancelado', observaciones: 'Cancelada por la caída', es_primera: false, registro_id: null, matricula_id: null },
  ],
  eventos: [
    { id: 'EVT-0001', en: '2026-11-13T15:00:00Z', por: 'Ana', tema: 'asesoria', ref_id: 'SES-001', alumno_id: 'ALU-001', sede_id: 'FIL-002', tipo: 'Reservada', iniciador: null, motivo: null, detalle: null, desde: null, hasta: { date: '2026-11-20', time: '16:00', responsible: 'Ana Pérez' } },
    { id: 'EVT-0002', en: '2026-11-13T16:00:00Z', por: 'Ana', tema: 'asesoria', ref_id: 'SES-002', alumno_id: 'ALU-001', sede_id: 'FIL-002', tipo: 'Cancelada', iniciador: 'Institución', motivo: 'Caída de la matrícula', detalle: null, desde: { date: '2026-11-21', time: '17:00', responsible: '' }, hasta: null },
  ],
  seguimientos: [{ id: 'TRK-001', alumno_id: 'ALU-001', asesoria_id: 'SES-001', sede_id: 'FIL-002', fecha: '2026-11-20', estado: 'Completada', metricas: { velocidad: 220 }, observaciones: 'Bien', checklist: null }],
  capacidad: [
    { id: 'general', ambito: 'general', sede_id: null, fecha: null, hora: null, cupo: 8 }, { id: 'sede:FIL-002', ambito: 'sede', sede_id: 'FIL-002', fecha: null, hora: null, cupo: null },
    { id: 'exc:FIL-002:2026-11-20:16:00', ambito: 'excepcion', sede_id: 'FIL-002', fecha: '2026-11-20', hora: '16:00', cupo: 3 },
  ],
};
const state = agendaFromRows(rows, { students, enrollments, staff });
const s1 = state.schedules.find(s => s.id === 'SES-001')!, s2 = state.schedules.find(s => s.id === 'SES-002')!;
check('La asesoría se muestra con el nombre del alumno y del responsable DERIVADOS de sus ids, una hora de duración y su sede (nada de eso se guarda)',
  s1.student === 'Mateo Ruiz' && s1.responsible === 'Ana Pérez' && s1.responsibleId === 'STF-001' && s1.duration === SLOT_DURATION && s1.branchId === 'FIL-002' && s1.date === '2026-11-20' && s1.time === '16:00' && s1.status === 'Reservado');
check('La primera asesoría muestra el programa de SU matrícula; una asesoría normal, el de la matrícula más reciente del alumno',
  s1.program === 'Kids' && s1.level === 'Nivel 1' && s1.isFirst === true && s1.enrollmentId === 'MAT-2026-001' && s1.registrationId === 'MAT-2026-001' && s2.program === 'Profesional' && s2.level === 'Sin nivel' && s2.isFirst === undefined);
check('Sin responsable queda vacío (no se inventa) y lo que no hay no aparece como clave', s2.responsible === '' && s2.responsibleId === undefined && !('responsibleId' in s2) && s2.observations === 'Cancelada por la caída' && !('observations' in s1));
check('El historial conserva el momento, quién, qué, quién lo pidió, el motivo y de qué a qué (con el nombre del responsable de ese día)',
  state.psyEvents.length === 2 && state.psyEvents[1]!.initiator === 'Institución' && state.psyEvents[1]!.reason === 'Caída de la matrícula' && state.psyEvents[1]!.from?.date === '2026-11-21'
  && state.psyEvents[0]!.to?.responsible === 'Ana Pérez' && state.psyEvents[0]!.at === '2026-11-13T15:00:00Z' && state.psyEvents[0]!.by === 'Ana' && state.psyEvents[0]!.subject === 'asesoria');
check('El seguimiento llega con su asesoría, sus métricas y su fecha', state.trackings.length === 1 && state.trackings[0]!.scheduleId === 'SES-001' && (state.trackings[0]!.metrics as { velocidad: number }).velocidad === 220 && state.trackings[0]!.status === 'Completada');
check('Los cupos: el general, el de una sede (sin límite) y la excepción de una fecha y hora; sin filas vale el cupo de partida (6)',
  state.capacityConfig.defaultCapacity === 8 && state.capacityConfig.byBranch['FIL-002'] === null && state.capacityConfig.overrides[0]!.capacity === 3 && state.capacityConfig.overrides[0]!.id === overrideId('FIL-002', '2026-11-20', '16:00')
  && capacityFromRows([]).defaultCapacity === DEFAULT_CAPACITY && DEFAULT_CAPACITY === 6);
check('El cupo que aplica a un horario sigue siendo excepción > sede > general (las reglas puras no cambian)',
  capacityFor(state.capacityConfig, 'FIL-002', '2026-11-20', '16:00') === 3 && capacityFor(state.capacityConfig, 'FIL-002', '2026-11-20', '17:00') === null && capacityFor(state.capacityConfig, 'FIL-003', '2026-11-20', '17:00') === 8);
check('Si un alumno o una matrícula aún no se leyó, la asesoría no se pierde (nombre vacío)', agendaFromRows({ ...EMPTY_AGENDA, asesorias: rows.asesorias }, { students: [], enrollments: [], staff: [] }).schedules.length === 2);
check('Mezclar lo recién guardado: la fila más nueva de cada código gana, nada se pierde y los cupos se reemplazan',
  (() => {
    const merged = mergeAgendaRows(rows, { asesorias: [{ ...rows.asesorias[0]!, estado: 'Asistió' }, { ...rows.asesorias[0]!, id: 'SES-003' }], eventos: [], capacidad: [] });
    return merged.asesorias.map(a => a.id).join() === 'SES-001,SES-002,SES-003' && merged.asesorias[0]!.estado === 'Asistió' && merged.eventos.length === 2 && merged.capacidad.length === 0
      && mergeAgendaRows(rows, {}).capacidad.length === 3;
  })());

// ------------------------------------------------------------------------------------------------------------------ Lo que viaja a la base
const sched = (over: Partial<Schedule> = {}): Schedule => ({ ...s1, ...over });
check('Una asesoría nueva viaja completa y marcada como nueva (sin nombres: el alumno y el responsable van por su id)',
  (() => {
    const r = scheduleInsertRow(sched({ id: 'SES-~1~', isFirst: false, enrollmentId: undefined, registrationId: undefined, observations: undefined }), 'STF-001');
    return r._nueva === true && r.id === 'SES-~1~' && r.alumno_id === 'ALU-001' && r.sede_id === 'FIL-002' && r.fecha === '2026-11-20' && r.hora === '16:00' && r.responsable_id === 'STF-001' && r.estado === 'Reservado'
      && r.es_primera === false && r.matricula_id === null && !('student' in r) && !('program' in r) && !('responsible' in r) && !('duration' in r);
  })());
check('De una asesoría que ya existe solo viaja lo que cambió (fecha, hora, responsable, estado y observaciones), y nada si nada cambió',
  (() => {
    const mov = scheduleChangeRow(s1, sched({ date: '2026-11-22', time: '18:00', status: 'Reprogramado' }), 'STF-001');
    const resp = scheduleChangeRow(s1, sched({ responsible: 'Otra Persona', responsibleId: 'STF-002' }), 'STF-002');
    const obs = scheduleChangeRow(s1, sched({ observations: 'Trajo su material' }), 'STF-001');
    return Object.keys(mov!).sort().join() === 'estado,fecha,hora,id' && resp!.responsable_id === 'STF-002' && Object.keys(resp!).join() === 'id,responsable_id' && obs!.observaciones === 'Trajo su material' && scheduleChangeRow(s1, sched(), 'STF-001') === null;
  })());
check('Cada cambio es una operación de la agenda (la misma clasificación que hace la base y que pide el registro): cancelar, asistencia, reprogramar u observaciones',
  scheduleActionOf(s1, sched({ status: 'Cancelado' })) === 'cancelar' && scheduleActionOf(s1, sched({ status: 'Asistió' })) === 'asistencia' && scheduleActionOf(s1, sched({ status: 'Faltó' })) === 'asistencia'
  && scheduleActionOf(s1, sched({ time: '17:00', status: 'Reprogramado' })) === 'reprogramar' && scheduleActionOf(s1, sched({ responsible: 'Otra Persona', responsibleId: 'STF-002' })) === 'reprogramar'
  && scheduleActionOf(s1, sched({ observations: 'x' })) === 'observaciones' && scheduleActionOf(sched({ status: 'Cancelado' }), sched({ status: 'Reprogramado', date: '2026-11-30' })) === 'reprogramar');
check('Los eventos que arma el sistema viajan con código de borrador y sin quién ni cuándo (los pone la base)',
  (() => {
    const evs = buildScheduleEvents(s1, sched({ time: '17:00', status: 'Reprogramado' }), { reason: 'Enfermedad del alumno' }, 'Ana', '2026-11-13T15:00:00Z', () => draftId('EVT')).map(eventRow);
    const e = evs[0]!;
    return evs.length === 1 && isDraftId(String(e.id)) && e.tema === 'asesoria' && e.ref_id === 'SES-001' && e.tipo === 'Reprogramada' && e.iniciador === 'Alumno o titular' && e.motivo === 'Enfermedad del alumno'
      && (e.desde as { time: string }).time === '16:00' && (e.hasta as { time: string }).time === '17:00' && !('por' in e) && !('en' in e) && !('at' in e);
  })());
check('Un seguimiento nuevo viaja completo (de la asesoría y del alumno) y de uno existente solo lo que se corrige',
  (() => {
    const t: Omit<Tracking, 'id'> = { studentId: 'ALU-001', scheduleId: 'SES-001', date: '2026-11-20', status: 'Asistió', metrics: { velocidad: 220 }, observations: 'Bien', checklist: { guardianAttended: true, methodologyExplained: true, itemsExplained: true } };
    const n = trackingInsertRow(t);
    const before = state.trackings[0]!;
    const ch = trackingChangeRow(before, { observations: 'Corregido', metrics: { velocidad: 230 } });
    return n._nueva === true && isDraftId(String(n.id)) && n.asesoria_id === 'SES-001' && n.alumno_id === 'ALU-001' && Object.keys(ch!).sort().join() === 'id,metricas,observaciones' && trackingChangeRow(before, { observations: before.observations }) === null;
  })());
check('El responsable que nombra un texto: entre quienes trabajan en Psicopedagogía de esa sede primero; sin nadie, no se inventa',
  (() => {
    const personal = [{ id: 'STF-001', names: 'Ana', lastNameP: 'Pérez', lastNameM: 'Soto' }, { id: 'STF-002', names: 'Ana', lastNameP: 'Pérez', lastNameM: 'Luna' }, { id: 'STF-003', names: 'Luis', lastNameP: 'Mora', lastNameM: 'X' }] as unknown as Staff[];
    const asig = [{ staffId: 'STF-002', status: 'Activa', area: 'Psicopedagogía', branch: 'Piura' }, { staffId: 'STF-001', status: 'Activa', area: 'Administración', branch: 'Piura' }] as unknown as Assignment[];
    return resolveResponsibleId('Luis Mora', personal, asig, 'Piura') === 'STF-003' && resolveResponsibleId('Ana Pérez', personal, asig, 'Piura') === 'STF-002' && resolveResponsibleId('Nadie Más', personal, asig, 'Piura') === undefined && resolveResponsibleId('', personal, asig) === undefined;
  })());

// ------------------------------------------------------------------------------------------------------------------ Cupos
check('Los cupos: solo viaja lo que cambió (general, sede y excepciones) y lo que se quitó',
  (() => {
    const before: CapacityConfig = { defaultCapacity: 6, byBranch: { 'FIL-002': 4, 'FIL-003': 5 }, overrides: [{ id: 'x', branchId: 'FIL-002', date: '2026-11-20', time: '16:00', capacity: 3 }, { id: 'y', branchId: 'FIL-002', date: '2026-11-21', time: '16:00', capacity: 2 }] };
    const after: CapacityConfig = { defaultCapacity: 8, byBranch: { 'FIL-002': 4, 'FIL-004': null }, overrides: [{ id: 'x', branchId: 'FIL-002', date: '2026-11-20', time: '16:00', capacity: 5 }, { id: 'z', branchId: 'FIL-002', date: '2026-11-22', time: '17:00', capacity: null }] };
    const c = capacityChanges(before, after);
    const g = (a: string, s?: string) => c.guardar.find(x => x.ambito === a && x.sede_id === s);
    return c.guardar.length === 4 && g('general')?.cupo === 8 && g('sede', 'FIL-004')?.cupo === null && g('excepcion', 'FIL-002')?.cupo !== undefined && !g('sede', 'FIL-002')
      && c.quitar.sort().join() === ['exc:FIL-002:2026-11-21:16:00', 'sede:FIL-003'].join() && hasCapacityChanges(c) && !hasCapacityChanges(capacityChanges(before, before));
  })());
check('El id de una fila de cupo es general, sede:FIL-NNN o exc:FIL-NNN:fecha:hora (el mismo que arma la base)', capacityRowId('general') === 'general' && capacityRowId('sede', 'FIL-002') === 'sede:FIL-002' && capacityRowId('excepcion', 'FIL-002', '2026-11-20', '16:00') === 'exc:FIL-002:2026-11-20:16:00');
check('Errores de la base: sesión repetida, algo que ya no existe y lo técnico se traducen; los avisos propios (EN001) se muestran tal cual',
  /ya tiene su sesión registrada/.test(agendaErrorMessage({ code: '23505', message: 'x', details: 'seguimientos_asesoria_uq' })) && /Otra persona/.test(agendaErrorMessage({ code: '23505', message: 'x' }))
  && /ya no existe/.test(agendaErrorMessage({ code: '23503', message: 'x' })) && agendaErrorMessage({ code: 'EN001', message: 'El horario está completo.' }) === 'El horario está completo.' && !/violates|constraint/i.test(agendaErrorMessage({ code: '99999', message: 'violates something' })));

// ------------------------------------------------------------------------------------------------------------------ Operaciones con un repositorio en memoria
function memoryRepo(opts: { fail?: string; failRead?: boolean; codes?: Record<string, string> } = {}) {
  const calls: { fn: string; args: unknown[] }[] = [];
  const repo: AgendaRepository = {
    async loadAll() { return { ok: true, data: JSON.parse(JSON.stringify(rows)) as AgendaRows }; },
    async apply(action, payload): Promise<RepoResult<{ codes: Record<string, string> }>> { calls.push({ fn: 'apply', args: [action, payload] }); return opts.fail ? { ok: false, error: opts.fail } : { ok: true, data: { codes: opts.codes ?? {} } }; },
    async loadTouched(ids, trackingIds) { calls.push({ fn: 'loadTouched', args: [ids, trackingIds] }); return opts.failRead ? { ok: false, error: 'sin conexión' } : { ok: true, data: { asesorias: rows.asesorias.filter(a => ids.includes(a.id)) } }; },
    async saveCapacity(changes) { calls.push({ fn: 'saveCapacity', args: [changes] }); return opts.fail ? { ok: false, error: opts.fail } : { ok: true, data: null }; },
  };
  return { repo, calls };
}

async function run() {
  const loaded = await loadAgenda(memoryRepo().repo);
  check('Se lee de la base toda la agenda (asesorías, historial, seguimiento y cupos)', loaded.ok && loaded.value?.asesorias.length === 2 && loaded.value?.capacidad.length === 3);
  const broken = await loadAgenda({ ...memoryRepo().repo, loadAll: async () => ({ ok: false, error: 'sin conexión' }) });
  check('Si la lectura falla se devuelve el motivo (el inicio de sesión ofrece reintentar)', !broken.ok && broken.error === 'sin conexión');
  check('Los borradores se traducen a los códigos reales que asignó la base (y lo que ya era real se queda)', realCodes(['SES-~1~', 'SES-007', 'SES-~1~'], { 'SES-~1~': 'SES-012' }).join() === 'SES-012,SES-007');

  { const m = memoryRepo(); const r = await applyAgenda(m.repo, 'reprogramar', { asesorias: [], seguimientos: [], eventos: [] });
    check('Sin nada que guardar no se llama a la base', r.ok && m.calls.length === 0 && Object.keys(r.value?.fresh ?? {}).length === 0); }
  { const m = memoryRepo({ codes: { 'SES-~1~': 'SES-009' } });
    const r = await applyAgenda(m.repo, 'reservar', { asesorias: [{ id: 'SES-~1~', _nueva: true }], eventos: [{ id: 'EVT-~2~' }] });
    check('Guardar manda la acción y el envío, y vuelve a leer lo tocado con los códigos REALES', r.ok && m.calls[0]!.fn === 'apply' && m.calls[0]!.args[0] === 'reservar' && m.calls[1]!.fn === 'loadTouched' && (m.calls[1]!.args[0] as string[]).join() === 'SES-009' && r.value?.codes['SES-~1~'] === 'SES-009', JSON.stringify(m.calls)); }
  { const m = memoryRepo(); const r = await applyAgenda(m.repo, 'registrar_sesion', { asesorias: [], seguimientos: [{ id: 'TRK-~1~', _nueva: true, asesoria_id: 'SES-001' }], eventos: [{ id: 'EVT-~1~' }] });
    check('Una sesión nueva vuelve a leer también su asesoría y su seguimiento', r.ok && (m.calls[1]!.args[0] as string[]).join() === 'SES-001' && (m.calls[1]!.args[1] as string[]).join() === 'TRK-~1~', JSON.stringify(m.calls)); }
  { const m = memoryRepo(); await applyAgenda(m.repo, 'editar_sesion', { seguimientos: [{ id: 'TRK-001', observaciones: 'x' }] });
    check('Corregir un seguimiento vuelve a leer ese seguimiento', (m.calls[1]!.args[0] as string[]).length === 0 && (m.calls[1]!.args[1] as string[]).join() === 'TRK-001', JSON.stringify(m.calls)); }
  { const r = await applyAgenda(memoryRepo({ fail: 'El horario está completo: 6 de 6 cupos.' }).repo, 'reservar', { asesorias: [{ id: 'SES-~1~' }] });
    check('Si la base rechaza, se devuelve su motivo y no se lee nada', !r.ok && /completo/.test(r.error ?? '')); }
  { const m = memoryRepo({ failRead: true }); const r = await applyAgenda(m.repo, 'reservar', { asesorias: [{ id: 'SES-~1~' }] });
    check('Si se guardó pero no se pudo volver a leer, se avisa que se guardó', !r.ok && /Se guardó, pero no se pudo volver a leer/.test(r.error ?? '')); }
  { const r = await refreshAgenda(memoryRepo().repo, []); check('Volver a leer sin nada tocado no llama a la base', r.ok); }
  { const m = memoryRepo(); const r = await applyCapacity(m.repo, { guardar: [], quitar: [] });
    check('Sin cambios de cupo no se llama a la base', r.ok && m.calls.length === 0); }
  { const m = memoryRepo(); const r = await applyCapacity(m.repo, { guardar: [{ ambito: 'sede', sede_id: 'FIL-002', cupo: 4 }], quitar: ['sede:FIL-003'] });
    check('Guardar los cupos manda lo que cambió', r.ok && m.calls[0]!.fn === 'saveCapacity'); }
  { const r = await applyCapacity(memoryRepo({ fail: 'Solo quien alcanza todas las sedes cambia el cupo general.' }).repo, { guardar: [{ ambito: 'general', cupo: 8 }], quitar: [] });
    check('Si la base rechaza el cupo, se devuelve su motivo', !r.ok && /cupo general/.test(r.error ?? '')); }
}

// ------------------------------------------------------------------------------------------------------------------ La migración 0022
const sql = read('supabase/migrations/20261114100000_agenda_asesorias_y_seguimiento.sql');
const down = read('supabase/deshacer/20261114100000_agenda_asesorias_y_seguimiento.down.sql');
const code = sql.replace(/--[^\n]*/g, '');
const tables = ['asesorias', 'psy_eventos', 'seguimientos', 'capacidad_asesorias'];
check('Crea las cuatro tablas, con seguridad por fila y solo lectura para las cuentas (todo cambia por funciones)',
  tables.every(t => new RegExp(`create table public\\.${t} \\(`).test(sql) && new RegExp(`alter table public\\.${t}\\s+enable row level security`).test(sql))
  && /revoke all on public\.asesorias, public\.psy_eventos, public\.seguimientos, public\.capacidad_asesorias from public, anon, authenticated;/.test(sql)
  && /grant select on public\.asesorias, public\.psy_eventos, public\.seguimientos, public\.capacidad_asesorias to authenticated;/.test(sql) && !/grant (insert|update|delete)/i.test(code));
check('Una asesoría nunca se borra ni se vacía y de ella solo cambian fecha, hora, responsable, estado y observaciones; el historial no cambia ni se borra; un seguimiento no se borra',
  /create trigger asesorias_no_cambian before update or delete on public\.asesorias/.test(sql) && /create trigger asesorias_no_vaciar\s+before truncate on public\.asesorias/.test(sql)
  && /to_jsonb\(old\) - 'fecha' - 'hora' - 'responsable_id' - 'estado' - 'observaciones' - 'actualizado_en' - 'actualizado_por'/.test(sql)
  && /create trigger psy_eventos_no_cambian before update or delete on public\.psy_eventos/.test(sql) && /create trigger psy_eventos_no_vaciar\s+before truncate on public\.psy_eventos/.test(sql)
  && /create trigger seguimientos_no_cambian before update or delete on public\.seguimientos/.test(sql) && /create unique index seguimientos_asesoria_uq on public\.seguimientos \(asesoria_id\) where asesoria_id is not null/.test(sql));
check('Cada asesoría es de un alumno y una sede, lleva el responsable por su id de Personal, dura una hora (no se guarda) y su estado es uno de los cinco',
  /alumno_id\s+text not null references public\.alumnos/.test(sql) && /responsable_id text references public\.personal/.test(sql) && /estado\s+text not null check \(estado in \('Reservado', 'Reprogramado', 'Asistió', 'Faltó', 'Cancelado'\)\)/.test(sql) && !/duracion/.test(code));

// Las funciones públicas y lo que cada acción pide
const actionMap = JSON.parse(sql.match(/select '(\{\s*"reservar"[\s\S]*?\})'::jsonb/)![1]!) as Record<string, { funciones: string[] }>;
const has = (id: string, action: string) => ((capabilityById(id) as { actions?: string[] } | undefined)?.actions ?? []).includes(action);
check('Cada acción de la agenda pide una función que existe en el registro, y esa función es la de la acción del sistema (reservar, reprogramar o cancelar, asistencia, sesión, cupos)',
  Object.values(actionMap).every(a => a.funciones.every(id => !!capabilityById(id)))
  && actionMap.reservar!.funciones[0] === 'psi-prog:create' && has('psi-prog:create', 'addSchedule') && actionMap.reprogramar!.funciones[0] === 'psi-prog:reschedule' && actionMap.cancelar!.funciones[0] === 'psi-prog:reschedule'
  && actionMap.observaciones!.funciones[0] === 'psi-prog:reschedule' && has('psi-prog:reschedule', 'updateSchedule') && actionMap.asistencia!.funciones[0] === 'psi-prog:mark_attendance' && has('psi-prog:mark_attendance', 'updateSchedule')
  && actionMap.registrar_sesion!.funciones[0] === 'psi-prog:reg_tracking' && actionMap.editar_sesion!.funciones[0] === 'psi-prog:reg_tracking' && has('psi-prog:reg_tracking', 'addTracking') && has('psi-prog:reg_tracking', 'updateTracking')
  && /app\.exigir\('psi-prog:capacity', 'Configurar los cupos'\)/.test(sql) && has('psi-prog:capacity', 'setCapacityConfig') && /app\.permite\('psi-prog:institutional_change'\)/.test(sql) && !!capabilityById('psi-prog:institutional_change'));
check('Las acciones de la agenda son las que clasifica el cliente (scheduleActionOf) y las que usa el contexto',
  ['reservar', 'reprogramar', 'cancelar', 'asistencia', 'observaciones', 'registrar_sesion', 'editar_sesion'].every(a => a in actionMap) && Object.keys(actionMap).length === 7
  && ['asistencia', 'reprogramar', 'cancelar', 'observaciones'].every(a => ([scheduleActionOf(s1, sched({ status: 'Cancelado' })), scheduleActionOf(s1, sched({ status: 'Asistió' })), scheduleActionOf(s1, sched({ time: '17:00' })), scheduleActionOf(s1, sched({ observations: 'x' }))] as string[]).includes(a)));

const readers = (entity: string) => ALL_CAPABILITIES.filter(c => (c as { reads?: string[] }).reads?.includes(entity)).map(c => c.id).sort().join();
const listOf = (fn: string) => [...(sql.match(new RegExp(`create function app\\.${fn}\\(\\) returns boolean[\\s\\S]*?array\\[([^\\]]+)\\]`))?.[1] ?? '').matchAll(/'([^']+)'/g)].map(m => m[1]).sort().join();
check('Quién lee las asesorías, el seguimiento y los cupos es lo mismo que dice el registro (y se lee solo lo de las sedes que se alcanzan)',
  listOf('puede_leer_asesorias') === readers('schedule') && listOf('puede_leer_seguimientos') === readers('tracking') && listOf('puede_leer_capacidad') === readers('capacity')
  && /create policy asesorias_leer on public\.asesorias for select to authenticated\s+using \(\(select app\.puede_leer_asesorias\(\)\) and \(select app\.ve_sede\(sede_id\)\)\)/.test(sql)
  && /create policy psy_eventos_leer on public\.psy_eventos for select to authenticated\s+using \(\(select app\.puede_leer_asesorias\(\)\) and \(select app\.ve_sede\(sede_id\)\)\)/.test(sql)
  && /create policy seguimientos_leer on public\.seguimientos for select to authenticated\s+using \(\(select app\.puede_leer_seguimientos\(\)\) and \(select app\.ve_sede\(sede_id\)\)\)/.test(sql),
  `${listOf('puede_leer_asesorias')}\n${readers('schedule')}\n${listOf('puede_leer_seguimientos')} / ${readers('tracking')}\n${listOf('puede_leer_capacidad')} / ${readers('capacity')}`);
check('Quien ve Matrículas, Verificación, Alumnos, Personal, Asignaciones, Contratos, los reportes o la Auditoría ve también la agenda (las pantallas y las reglas de Personal la consultan)',
  ['op-matriculas:view', 'op-verificacion:view', 'per-alumnos:view', 'per-personal:view', 'per-contratos:view', 'per-asignaciones:view', 'rep-matriculas:view', 'rep-verificacion:view', 'sis-auditoria:view', 'dash-resumen:view', 'psi-prog:view', 'psi-historial:view', 'psi-recordatorios:view', 'rep-psicopedagogia:view']
    .every(id => ((capabilityById(id) as { reads?: string[] } | undefined)?.reads ?? []).includes('schedule')) && ((capabilityById('psi-prog:view') as { reads?: string[] }).reads ?? []).includes('tracking'));

// Las reglas que repite la base son las del sistema
const slotSql = (re: RegExp) => [...(sql.match(re)?.[1] ?? '').matchAll(/'([^']+)'/g)].map(m => m[1]!);
const weekdayDates = ['2026-11-23', '2026-11-24', '2026-11-27'], saturday = '2026-11-28', sunday = '2026-11-29';
check('Los horarios de la base son los del sistema: lunes a viernes 3 a 8 p. m.; sábados 9 a 1 y 4 a 8; domingos no hay atención',
  weekdayDates.every(d => slotsForDate(d).join() === slotSql(/else p_hora = any \(array\[([^\]]+)\]\)/).join()) && slotsForDate(saturday).join() === slotSql(/when 6 then p_hora = any \(array\[([^\]]+)\]\)/).join() && slotsForDate(sunday).length === 0 && /when 7 then false/.test(sql));
check('El cupo de partida de la base es el del sistema (6) y el orden es excepción > sede > general', /return 6;/.test(sql) && DEFAULT_CAPACITY === 6 && sql.indexOf("v_id := 'exc:'") < sql.indexOf("v_id := 'sede:'") && sql.indexOf("v_id := 'sede:'") < sql.indexOf("c.id = 'general'") && /cupo is null or cupo between 1 and 50/.test(sql));
check('Los motivos de una cancelación o reprogramación y quién los pide son los del sistema (`CHANGE_REASONS`), y el de «sin materiales» es el mismo',
  (() => {
    const m = [...sql.matchAll(/\('([^']+)', '(Alumno o titular|Institución)', (true|false), (true|false)\)/g)].map(x => ({ reason: x[1]!, initiator: x[2]!, detail: x[3] === 'true', cancelOnly: x[4] === 'true' }));
    return m.length === CHANGE_REASONS.length && CHANGE_REASONS.every(r => m.some(x => x.reason === r.reason && x.initiator === r.initiator && x.detail === !!r.needsDetail && x.cancelOnly === !!r.cancelOnly)) && sql.includes(MATERIALS_REASON);
  })());
check('La regla de las 24 horas y la verificación están en la base: solo se cambia con aviso (24 h), la institución con su función, y sin materiales no se marca la asistencia',
  /v_horas >= 24|v_aviso := v_horas >= 24/.test(sql) && /Con menos de 24 horas el alumno o su titular ya no puede cambiar la asesoría/.test(sql) && /not v_aviso and not v_sin_mat and not app\.permite\('psi-prog:institutional_change'\)/.test(sql)
  && /No se puede registrar la primera asesoría: la matrícula aún no está verificada/.test(sql) && /'Verificado Completo', 'Verificado Incompleto'/.test(sql) && /America\/Lima/.test(sql));
check('Cada cambio exige su evento (reservada, cancelada, reprogramada, asistió, faltó, sesión registrada) y los eventos son solo de las asesorías de la operación',
  /Todo cambio de una asesoría deja su evento en el historial/.test(sql) && /Registrar la sesión deja su evento en el historial/.test(sql) && /Un evento debe ser de una asesoría de esta operación/.test(sql)
  && /v_esperados := array\['Reservada'\]/.test(sql) && /v_esperados := array\['Cancelada'\]/.test(sql) && /v_esperados := array\['Reprogramada'\]/.test(sql));
check('La base vuelve a comprobar: sede alcanzable, horario, no en el pasado, cruce del alumno, cupo, horario de primeras asesorías, responsable (Psicopedagogía de esa sede y disponible)',
  /perform app\.exigir_sede\(n\.sede_id, 'asesorías'\)/.test(sql) && /La fecha no puede ser anterior a hoy/.test(sql) && /El alumno ya tiene una asesoría ese día en ese horario/.test(sql) && /está completo/.test(sql)
  && /reservado para primeras asesorías/.test(sql) && /la primera asesoría necesita un horario libre/.test(sql) && /a\.area = 'Psicopedagogía' and a\.estado = 'Activa'/.test(sql) && /c\.estado = 'Cesado'/.test(sql) && /vacaciones_inicio/.test(sql));
check('El código de toda fila nueva es un borrador (una pantalla desactualizada se rechaza) y la base asigna el siguiente al más alto de TODA la tabla, con un candado hasta el final de la operación',
  /Esta pantalla está desactualizada: el código de un registro nuevo lo asigna el sistema/.test(sql) && /\^SES-~\[0-9\]\+~\$/.test(sql) && /\^EVT-~\[0-9\]\+~\$/.test(sql) && /\^TRK-~\[0-9\]\+~\$/.test(sql)
  && /pg_advisory_xact_lock\(hashtextextended\('ensil:codigo:' \|\| v_grupo \|\| '\|', 0\)\)/.test(sql) && /v_pad := case when v_tok\.pref = 'EVT' then 4 else 3 end/.test(sql)
  && AGENDA_CODE_KINDS.EVT.pad === 4 && AGENDA_CODE_KINDS.SES.pad === 3 && AGENDA_CODE_KINDS.TRK.pad === 3);
check('La función del dinero acepta la clave `agenda` SOLO en matricular, caída y traslado, la aplica DESPUÉS del dinero y en la misma operación, y traduce los borradores de la matrícula',
  /create or replace function public\.aplicar_cambios_matricula/.test(sql) && /p_accion not in \('matricular', 'caida', 'traslado'\)/.test(sql) && /v_res := app\.aplicar_cambios_matricula_con_codigos\(p_accion, p\);/.test(sql)
  && /v_agenda := app\.reemplazar_borradores\(v_agenda, v_res->'codigos'\)/.test(sql) && /app\.aplicar_agenda\(p_accion, v_agenda, true\)/.test(sql) && /app\.verificar_mora\(p\)/.test(sql));
check('Las funciones públicas son de las cuentas con sesión y lo interno no se llama de fuera; no se toca ningún otro permiso del esquema',
  /revoke execute on function public\.aplicar_cambios_agenda\(text, jsonb\), public\.guardar_capacidad\(jsonb\) from public, anon;/.test(sql) && /grant execute on function public\.aplicar_cambios_agenda\(text, jsonb\), public\.guardar_capacidad\(jsonb\) to authenticated;/.test(sql)
  && /revoke execute on function\s+app\.aplicar_agenda\(text, jsonb, boolean\), app\.verificar_asesoria[\s\S]*?from public, anon, authenticated;/.test(sql) && !/on all functions in schema app/.test(code));
check('La migración se puede deshacer: quita las cuatro tablas y las funciones, y devuelve la función del dinero a la de la 0021',
  tables.every(t => down.includes(`drop table if exists public.${t};`)) && /create or replace function public\.aplicar_cambios_matricula/.test(down) && !/agenda/.test(down.slice(down.indexOf('create or replace function public.aplicar_cambios_matricula'), down.indexOf('drop function if exists public.aplicar_cambios_agenda')).replace(/--[^\n]*/g, ''))
  && ['aplicar_cambios_agenda', 'guardar_capacidad'].every(fn => down.includes(`drop function if exists public.${fn}(`)));

// ------------------------------------------------------------------------------------------------------------------ Cableado
const gate = read('src/components/auth/AccessGate.tsx');
const ctxSrc = read('src/context/DataContext.tsx');
const hook = read('src/hooks/useAgenda.ts');
const repoSrc = read('src/services/agendaRepository.ts');
const batch = read('src/utils/enrollment.ts');
check('La agenda se lee al iniciar sesión (antes de montar el sistema), junto con lo demás',
  /loadAgenda\(agendaRepo\)/.test(gate) && /loaded\.collection, loaded\.agenda\)/.test(gate) && /agenda=\{agenda\}/.test(read('src/App.tsx')) && /agenda: agendaData/.test(ctxSrc) && /useAgenda\(agendaData, \{ students, enrollments, staff \}\)/.test(ctxSrc));
check('El repositorio de Supabase llama a las dos funciones de la base y lee las cuatro tablas',
  ["'aplicar_cambios_agenda'", "'guardar_capacidad'"].every(fn => repoSrc.includes(fn)) && ["'asesorias'", "'psy_eventos'", "'seguimientos'", "'capacidad_asesorias'"].every(t => repoSrc.includes(t)));
check('El gancho arranca con lo ya leído, deriva los nombres al mostrar y vuelve a leer lo tocado después de cada operación',
  /useAgenda\(initial: AgendaRows, lists: AgendaLists\)/.test(hook) && /useState<AgendaRows>\(initial\)/.test(hook) && /agendaFromRows\(rows, \{ students, enrollments, staff \}\)/.test(hook) && /merge\(res\.value\.fresh\)/.test(hook) && !/useEffect/.test(hook));
check('Las acciones de la agenda son asíncronas y devuelven { ok, error } (ya no lanzan error al negar el permiso)',
  /addSchedule: \(data: Omit<Schedule, 'id'>\) => Promise<StockResult/.test(ctxSrc) && /updateSchedule: \([^)]*\) => Promise<\{ ok: boolean; reason\?: string \}>/.test(ctxSrc) && /addTracking: \([^)]*\) => Promise<StockResult/.test(ctxSrc)
  && /updateTracking: \([^)]*\) => Promise<StockResult>/.test(ctxSrc) && /setCapacityConfig: \([^)]*\) => Promise<StockResult>/.test(ctxSrc)
  && !['addSchedule', 'addTracking', 'updateTracking', 'setCapacityConfig'].some(a => THROWS_ON_DENIAL.has(a)));
check('El contexto ya no guarda en memoria las asesorías, el seguimiento ni los cupos, ni copia nombres en la agenda; el historial de las actividades sigue aparte hasta su entrega',
  !/setSchedules|setTrackings|setCapacityConfig\] = useState|buildScheduleSeed|buildTrackingSeed|syncStudentName\(|syncCatalogLabels\(|relabelFrom/.test(ctxSrc) && /EVT-L-/.test(ctxSrc) && /\[\.\.\.agenda\.psyEvents, \.\.\.activityEvents\]/.test(ctxSrc));
check('Reservar guarda con la función de la base (la base asigna el código y el responsable va por su id); reprogramar, cancelar y marcar la asistencia mandan solo lo que cambió y su evento',
  /agenda\.apply\('reservar', \{ asesorias: \[scheduleInsertRow\(created, responsibleId\)\], eventos: events\.map\(eventRow\) \}\)/.test(ctxSrc) && /agenda\.apply\(scheduleActionOf\(target, after\), \{ asesorias: \[change\], eventos: events\.map\(eventRow\) \}\)/.test(ctxSrc)
  && /buildScheduleEvents\(undefined, created, undefined, currentUser\.name, new Date\(\)\.toISOString\(\), newEventId\)/.test(ctxSrc));
check('Registrar la sesión es UNA operación (marca la asistencia y guarda la sesión con su evento) y no se registra la primera asesoría sin verificar',
  /agenda\.apply\('registrar_sesion', \{ asesorias: change \? \[change\] : \[\], seguimientos: \[row\], eventos: events\.map\(eventRow\) \}\)/.test(ctxSrc) && /const block = attendanceBlockOf\(sched\)/.test(ctxSrc) && /agenda\.apply\('editar_sesion'/.test(ctxSrc)
  && !/updateSchedule/.test(read('src/pages/psychopedagogy/SessionModal.tsx').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')));
check('Matricular manda la primera asesoría de cada alumno DENTRO de la operación (el código de la asesoría es un borrador y su responsable va por su id), y después vuelve a leer lo tocado',
  /saveMoney\('matricular', d, \[\], \{ asesorias: b\.schedules\.map\(sc => scheduleInsertRow\(sc, sc\.responsibleId\)\), eventos: firstEvents\.map\(eventRow\) \}\)/.test(ctxSrc)
  && /await agenda\.refreshFor\(realCodes\(b\.schedules\.map\(sc => sc\.id\), codes\)\)/.test(ctxSrc) && /id: draftId\('SES'\)/.test(batch) && /responsibleId: interviewer\.id/.test(batch) && !/nextSequentialId\('SES'/.test(batch));
check('La caída y el traslado cancelan las asesorías en la MISMA operación (con el evento de la institución) y el traslado crea la primera de la sede nueva; solo las actividades siguen en memoria',
  /const cancel = systemCancelAgenda\(preview\.scheduleIds, 'Caída de la matrícula'/.test(ctxSrc) && /saveMoney\('caida', d, \[\], cancel\.rows\.length > 0 \? \{ asesorias: cancel\.rows, eventos: cancel\.events \} : undefined\)/.test(ctxSrc)
  && /saveMoney\(CHANGE_ACTIONS\[request\.kind\]\.approve, d, \[\], agendaPayload\)/.test(ctxSrc) && /agendaPayload = \{ asesorias: rows, eventos: events \}/.test(ctxSrc) && /rows\.push\(scheduleInsertRow\(created, responsibleId\)\)/.test(ctxSrc)
  && /initiator: 'Institución'/.test(ctxSrc));
const screens = { schedule: read('src/pages/psychopedagogy/Schedule.tsx'), form: read('src/pages/psychopedagogy/ScheduleFormModal.tsx'), session: read('src/pages/psychopedagogy/SessionModal.tsx'), capacity: read('src/pages/psychopedagogy/CapacityModal.tsx') };
check('Las pantallas esperan la respuesta de la base antes de seguir y apagan el botón mientras guardan',
  /await updateSchedule\(s\.id, \{ status: action === 'asistio'/.test(screens.schedule) && /await updateSchedule\(toCancel\.id/.test(screens.schedule) && /await updateSchedule\(schedule\.id/.test(screens.form) && /await addSchedule\(/.test(screens.form) && /disabled=\{saving\}/.test(screens.form)
  && /await updateTracking\(existing\.id, record\) : await addTracking\(record\)/.test(screens.session) && /disabled=\{saving\}/.test(screens.session) && /await setCapacityConfig\(cfg\)/.test(screens.capacity) && /disabled=\{saving\}/.test(screens.capacity));

run().then(() => {
  if (failed > 0) {
    console.log(`\n${failed} comprobaciones fallaron.`);
    process.exit(1);
  }
  console.log('\nTodo en verde.');
});
