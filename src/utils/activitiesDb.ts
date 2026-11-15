/**
 * Traducción entre los cronogramas mensuales y las actividades especiales del sistema y las filas de la base (tablas `cronogramas`, `actividades` y
 * `actividad_inscripciones`; el historial de las actividades está en `psy_eventos` con `tema = 'actividad'`), y lo que viaja a la base. Funciones puras.
 *
 * Lo derivable no se guarda: el nombre de la sede de un cronograma, el mes con su nombre y el nombre del responsable salen de sus ids. El responsable se guarda
 * por su id de Personal. Una actividad nace SIN responsable (se asigna aparte). Lo que viaja a la base son **borradores de código** (`CRO-~1~`, `ACT-~2~`,
 * `EVT-~3~`): la base asigna los reales. El `ref_id` de un evento de actividad es `cronograma:actividad` (`CRO-001:ACT-001`), el mismo `id` plano del sistema.
 */
import type { ChangeInitiator, ChangeMeta, MonthlySchedule, PsyEvent, PsyEventType, ScheduleActivity, Staff } from '../context/DataContext';
import { draftId } from './draftIds';
import { initiatorOfReason } from './psyHistory';
import { staffLabel } from './psyActivities';
import { MONTHS, type FlatActivity } from './schedule';

// ------------------------------------------------------------------------------------------------------------------ Filas de la base

export interface CronogramaRow { id: string; sede_id: string; anio: number; mes: number; titulo: string; observaciones: string }
export interface ActividadRow {
  id: string; cronograma_id: string; sede_id: string; nombre: string; fecha: string; hora_inicio: string; hora_fin: string; cupo: number | null; responsable_id: string | null; orden: number;
}
export interface InscripcionRow {
  actividad_id: string; alumno_id: string; sede_id: string; inscrito_en: string; inscrito_por: string | null; asistencia: 'Asistió' | 'Faltó' | null;
  asistencia_nota: string | null; asistencia_en: string | null; asistencia_por: string | null;
}

export interface ActivityRows { cronogramas: CronogramaRow[]; actividades: ActividadRow[]; inscripciones: InscripcionRow[] }
export const EMPTY_ACTIVITIES: ActivityRows = { cronogramas: [], actividades: [], inscripciones: [] };

/** Con qué se derivan los nombres: el personal y las sedes (las listas salen de la base, cada una con su gancho). */
export interface ActivityLists { staff: Pick<Staff, 'id' | 'names' | 'lastNameP'>[]; branches: { id: string; name: string }[] }

// ------------------------------------------------------------------------------------------------------------------ Filas → modelo

/** Los cronogramas con sus actividades, inscritos y asistencia, como los muestra el sistema (en el orden en que se crearon). */
export function monthlyFromRows(rows: ActivityRows, lists: ActivityLists): MonthlySchedule[] {
  const staffById = new Map(lists.staff.map(s => [s.id, s]));
  const branchName = new Map(lists.branches.map(b => [b.id, b.name]));
  const enrolledBy = new Map<string, InscripcionRow[]>();
  for (const i of rows.inscripciones) enrolledBy.set(i.actividad_id, [...(enrolledBy.get(i.actividad_id) ?? []), i]);
  const activitiesBy = new Map<string, ActividadRow[]>();
  for (const a of rows.actividades) activitiesBy.set(a.cronograma_id, [...(activitiesBy.get(a.cronograma_id) ?? []), a]);

  return [...rows.cronogramas].sort((a, b) => a.id.localeCompare(b.id)).map(c => ({
    id: c.id,
    branchId: c.sede_id,
    sede: branchName.get(c.sede_id) ?? '',
    mes: MONTHS[c.mes - 1] ?? '',
    anio: c.anio,
    titulo: c.titulo,
    observaciones: c.observaciones,
    actividades: (activitiesBy.get(c.id) ?? []).sort((a, b) => a.orden - b.orden || a.id.localeCompare(b.id)).map<ScheduleActivity>(a => {
      const members = (enrolledBy.get(a.id) ?? []).sort((x, y) => x.inscrito_en.localeCompare(y.inscrito_en) || x.alumno_id.localeCompare(y.alumno_id));
      const marked = members.filter(m => m.asistencia);
      const lead = a.responsable_id ? staffById.get(a.responsable_id) : undefined;
      return {
        id: a.id, actividad: a.nombre, fecha: a.fecha, horaInicio: a.hora_inicio, horaFin: a.hora_fin, responsable: lead ? staffLabel(lead) : '', orden: a.orden, cupo: a.cupo,
        inscritos: members.map(m => m.alumno_id),
        ...(a.responsable_id ? { responsableId: a.responsable_id } : {}),
        ...(marked.length > 0
          ? { asistencia: Object.fromEntries(marked.map(m => [m.alumno_id, { status: m.asistencia!, at: m.asistencia_en ?? '', by: m.asistencia_por ?? '', ...(m.asistencia_nota ? { note: m.asistencia_nota } : {}) }])) }
          : {}),
      };
    }),
  }));
}

/** Reemplaza lo que había de esos cronogramas (sus actividades e inscripciones incluidas) por las filas que acaban de leerse; los que ya no existen desaparecen. */
export function replaceCronogramas(current: ActivityRows, ids: string[], fresh: Partial<ActivityRows>): ActivityRows {
  const touched = new Set(ids);
  const gone = new Set(current.actividades.filter(a => touched.has(a.cronograma_id)).map(a => a.id));
  return {
    cronogramas: [...current.cronogramas.filter(c => !touched.has(c.id)), ...(fresh.cronogramas ?? [])].sort((a, b) => a.id.localeCompare(b.id)),
    actividades: [...current.actividades.filter(a => !touched.has(a.cronograma_id)), ...(fresh.actividades ?? [])].sort((a, b) => a.id.localeCompare(b.id)),
    inscripciones: [...current.inscripciones.filter(i => !gone.has(i.actividad_id)), ...(fresh.inscripciones ?? [])],
  };
}

/** El cronograma al que pertenece una actividad plana (`CRO-001:ACT-001` → `CRO-001`). */
export const monthlyIdOf = (flatId: string): string => flatId.split(':')[0] ?? flatId;

// ------------------------------------------------------------------------------------------------------------------ Eventos del historial

/** Un evento de actividad, listo para viajar (su código es un borrador; quién y cuándo los pone la base). Lleva el alumno al que se refiere. */
export function activityEventRow(e: PsyEvent): Record<string, unknown> {
  return {
    id: e.id, tema: 'actividad', ref_id: e.refId, alumno_id: e.studentId ?? null, tipo: e.type, iniciador: e.initiator ?? null, motivo: e.reason ?? null, detalle: e.detail ?? null,
  };
}

/** Un evento de actividad (con código de borrador). */
export function newActivityEvent(flatId: string, type: PsyEventType, extra: Partial<PsyEvent> = {}): PsyEvent {
  return { id: draftId('EVT'), at: new Date().toISOString(), by: '', subject: 'actividad', refId: flatId, type, ...extra };
}

/** Los eventos de institución cuando una actividad, un cronograma, una caída o un traslado sacan a los alumnos de una actividad. */
export function removalEvents(removals: { flatId: string; studentId: string }[], reason: string): Record<string, unknown>[] {
  return removals.map(r => activityEventRow(newActivityEvent(r.flatId, 'Inscripción quitada', { studentId: r.studentId, initiator: 'Institución' as ChangeInitiator, reason })));
}

// ------------------------------------------------------------------------------------------------------------------ Cronogramas: crear, editar, eliminar

export interface MonthlyChange { cronogramaId: string; payload: Record<string, unknown> }

const orNull = <T>(v: T | undefined | '' | null): T | null => (v === undefined || v === '' || v === null ? null : v);

const monthNumber = (mes: string): number => MONTHS.indexOf(mes) + 1;

/** Una actividad nueva, completa, con su código de borrador (nace sin responsable). */
function activityInsertRow(a: ScheduleActivity, cronogramaId: string, order: number): Record<string, unknown> {
  return {
    id: draftId('ACT'), _nueva: true, cronograma_id: cronogramaId, nombre: a.actividad.trim(), fecha: a.fecha, hora_inicio: a.horaInicio, hora_fin: a.horaFin, cupo: orNull(a.cupo), orden: order,
  };
}

/** Lo que viaja para crear un cronograma con sus actividades. */
export function createMonthlyChange(data: Omit<MonthlySchedule, 'id'>): MonthlyChange {
  const id = draftId('CRO');
  return {
    cronogramaId: id,
    payload: {
      cronogramas: [{ id, _nueva: true, sede_id: data.branchId, anio: data.anio, mes: monthNumber(data.mes), titulo: data.titulo.trim(), observaciones: data.observaciones.trim() }],
      actividades: data.actividades.map((a, i) => activityInsertRow(a, id, i + 1)),
      eventos: [],
    },
  };
}

/** Los motivos con los que el sistema saca a los inscritos cuando se quita una actividad o se elimina un cronograma. */
export const ACTIVITY_REMOVED_REASON = 'Se quitó la actividad del cronograma';
export const MONTHLY_REMOVED_REASON = 'Se eliminó el cronograma';

/**
 * Lo que viaja para guardar los cambios de un cronograma que ya existe: del cronograma, solo título, mes, año y observaciones; de cada actividad, solo lo que cambió
 * (nombre, fecha, horas, cupo y orden; el responsable se asigna aparte); las nuevas, completas; las que se quitan (con el evento de cada inscrito que sale).
 * `error` si se pide cambiar la sede (no se cambia); `null` si no cambió nada.
 */
export function editMonthlyChange(before: MonthlySchedule, after: Omit<MonthlySchedule, 'id'>): { change: MonthlyChange | null; error?: string } {
  if (after.branchId !== before.branchId) return { change: null, error: 'La sede de un cronograma no se cambia: cree otro cronograma para esa sede.' };
  const header: Record<string, unknown> = { id: before.id };
  if (after.titulo.trim() !== before.titulo) header.titulo = after.titulo.trim();
  if (after.observaciones.trim() !== before.observaciones) header.observaciones = after.observaciones.trim();
  if (after.anio !== before.anio) header.anio = after.anio;
  if (after.mes !== before.mes) header.mes = monthNumber(after.mes);

  const known = new Map(before.actividades.map(a => [a.id, a]));
  const keptIds = new Set<string>();
  const rows: Record<string, unknown>[] = [];
  after.actividades.forEach((a, i) => {
    const order = i + 1;
    const was = known.get(a.id);
    if (!was) { rows.push(activityInsertRow(a, before.id, order)); return; }
    keptIds.add(a.id);
    const row: Record<string, unknown> = { id: a.id };
    if (a.actividad.trim() !== was.actividad) row.nombre = a.actividad.trim();
    if (a.fecha !== was.fecha) row.fecha = a.fecha;
    if (a.horaInicio !== was.horaInicio) row.hora_inicio = a.horaInicio;
    if (a.horaFin !== was.horaFin) row.hora_fin = a.horaFin;
    if (a.cupo !== was.cupo) row.cupo = orNull(a.cupo);
    if (order !== was.orden) row.orden = order;
    if (Object.keys(row).length > 1) rows.push(row);
  });
  const removed = before.actividades.filter(a => !keptIds.has(a.id));
  const events = removalEvents(removed.flatMap(a => a.inscritos.map(studentId => ({ flatId: `${before.id}:${a.id}`, studentId }))), ACTIVITY_REMOVED_REASON);
  const changed = Object.keys(header).length > 1 || rows.length > 0 || removed.length > 0;
  if (!changed) return { change: null };
  return {
    change: {
      cronogramaId: before.id,
      payload: { cronogramas: [header], actividades: rows, ...(removed.length > 0 ? { quitar_actividades: removed.map(a => a.id) } : {}), eventos: events },
    },
  };
}

/** Lo que viaja para eliminar un cronograma: su código y el evento de cada inscrito que sale. */
export function deleteMonthlyChange(m: MonthlySchedule): MonthlyChange {
  const removals = m.actividades.flatMap(a => a.inscritos.map(studentId => ({ flatId: `${m.id}:${a.id}`, studentId })));
  return { cronogramaId: m.id, payload: { cronogramas: [{ id: m.id }], eventos: removalEvents(removals, MONTHLY_REMOVED_REASON) } };
}

// ------------------------------------------------------------------------------------------------------------------ Responsable, inscripciones y asistencia

/** Asignar (o quitar, con `null`) el responsable de una actividad. */
export function responsibleChange(a: Pick<FlatActivity, 'id' | 'activityId' | 'monthlyId'>, member: Pick<Staff, 'id' | 'names' | 'lastNameP'> | undefined): MonthlyChange {
  return {
    cronogramaId: a.monthlyId,
    payload: {
      actividades: [{ id: a.activityId, responsable_id: member?.id ?? null }],
      eventos: [activityEventRow(newActivityEvent(a.id, 'Responsable asignado', { detail: member ? staffLabel(member) : 'Se quitó el responsable' }))],
    },
  };
}

/** Inscribir a un alumno en una actividad. */
export function enrollChange(a: Pick<FlatActivity, 'id' | 'activityId' | 'monthlyId'>, studentId: string): MonthlyChange {
  return {
    cronogramaId: a.monthlyId,
    payload: { inscripciones: [{ actividad_id: a.activityId, alumno_id: studentId }], eventos: [activityEventRow(newActivityEvent(a.id, 'Inscripción', { studentId }))] },
  };
}

/** Retirar a un alumno de una actividad, con su motivo y quién lo pidió (sale del motivo). */
export function unenrollChange(a: Pick<FlatActivity, 'id' | 'activityId' | 'monthlyId'>, studentId: string, meta: Partial<ChangeMeta>): MonthlyChange {
  return {
    cronogramaId: a.monthlyId,
    payload: {
      quitar_inscripciones: [{ actividad_id: a.activityId, alumno_id: studentId }],
      eventos: [activityEventRow(newActivityEvent(a.id, 'Inscripción quitada', {
        studentId, reason: meta.reason, detail: meta.detail?.trim() || undefined, initiator: initiatorOfReason(meta.reason ?? ''),
      }))],
    },
  };
}

/** Registrar la asistencia de uno o varios inscritos (`status` nulo quita la marca y pide su nota). */
export function attendanceChange(a: Pick<FlatActivity, 'id' | 'activityId' | 'monthlyId'>, studentIds: string[], status: 'Asistió' | 'Faltó' | null, note?: string): MonthlyChange {
  const text = (note ?? '').trim();
  return {
    cronogramaId: a.monthlyId,
    payload: {
      inscripciones: studentIds.map(studentId => ({ actividad_id: a.activityId, alumno_id: studentId, asistencia: status, nota: orNull(text) })),
      eventos: studentIds.map(studentId => activityEventRow(newActivityEvent(a.id, 'Asistencia a actividad', { studentId, detail: status ?? 'Marca quitada', reason: text || undefined }))),
    },
  };
}

// ------------------------------------------------------------------------------------------------------------------ Caída y traslado

/** Lo que viaja dentro de la operación del dinero (clave `agenda.actividades`) para sacar al alumno de sus actividades; `undefined` si no hay ninguna. */
export function activityRemovalsPayload(removals: { monthlyId: string; activityId: string; studentId: string }[], reason: string): Record<string, unknown> | undefined {
  if (removals.length === 0) return undefined;
  return {
    quitar_inscripciones: removals.map(r => ({ actividad_id: r.activityId, alumno_id: r.studentId })),
    eventos: removalEvents(removals.map(r => ({ flatId: `${r.monthlyId}:${r.activityId}`, studentId: r.studentId })), reason),
  };
}

/** Los cronogramas que tocan esas bajas (para volver a leerlos después de guardar). */
export const monthliesOf = (removals: { monthlyId: string }[]): string[] => [...new Set(removals.map(r => r.monthlyId))];
