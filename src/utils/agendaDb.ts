/**
 * Traducción entre la agenda de Psicopedagogía del sistema (asesorías, historial, seguimiento y cupos) y las filas de la base (tablas `asesorias`,
 * `psy_eventos`, `seguimientos` y `capacidad_asesorias`), y de los errores de la base a mensajes claros. Funciones puras.
 *
 * Lo derivable no se guarda: el nombre del alumno, el programa y el nivel de una asesoría salen del alumno y de su matrícula; el responsable se guarda por su
 * id de Personal y su nombre sale de la ficha (`staffLabel`). Una asesoría dura siempre una hora. El historial guarda el nombre del responsable de ESE día
 * (es una constancia). Lo que viaja a la base son **borradores de código** (`SES-~1~`, `EVT-~2~`, `TRK-~3~`): la base asigna los reales.
 */
import type {
  Assignment, CapacityConfig, CapacityOverride, ChangeInitiator, Enrollment, PsyEvent, PsyEventType, Schedule, Staff, Student, Tracking,
} from '../context/DataContext';
import { draftId } from './draftIds';
import { latestEnrollmentOf } from './identity';
import { dbErrorMessage, type DbErrorLike } from './orgDirectory';
import { isStaffNamed, staffLabel } from './psyActivities';
import { DEFAULT_CAPACITY, SLOT_DURATION } from './schedule';

// ------------------------------------------------------------------------------------------------------------------ Filas de la base

export interface AsesoriaRow {
  id: string; alumno_id: string; sede_id: string; fecha: string; hora: string; responsable_id: string | null; estado: string; observaciones: string | null;
  es_primera: boolean; registro_id: string | null; matricula_id: string | null;
}
export interface EventoRow {
  id: string; en: string; por: string; tema: 'asesoria' | 'actividad'; ref_id: string; alumno_id: string | null; sede_id: string; tipo: string; iniciador: string | null;
  motivo: string | null; detalle: string | null; desde: EventPlace | null; hasta: EventPlace | null;
}
export interface SeguimientoRow {
  id: string; alumno_id: string; asesoria_id: string | null; sede_id: string; fecha: string; estado: string; metricas: unknown; observaciones: string; checklist: unknown | null;
}
export interface CapacidadRow { id: string; ambito: 'general' | 'sede' | 'excepcion'; sede_id: string | null; fecha: string | null; hora: string | null; cupo: number | null }
export interface EventPlace { date: string; time: string; responsible: string }

export interface AgendaRows { asesorias: AsesoriaRow[]; eventos: EventoRow[]; seguimientos: SeguimientoRow[]; capacidad: CapacidadRow[] }
export const EMPTY_AGENDA: AgendaRows = { asesorias: [], eventos: [], seguimientos: [], capacidad: [] };

/** Con qué se derivan los nombres: los alumnos, las matrículas y el personal (las listas salen de la base, cada una con su gancho). */
export interface AgendaLists { students: Pick<Student, 'id' | 'name'>[]; enrollments: Enrollment[]; staff: Pick<Staff, 'id' | 'names' | 'lastNameP'>[] }

export interface AgendaState { schedules: Schedule[]; psyEvents: PsyEvent[]; trackings: Tracking[]; capacityConfig: CapacityConfig }

// ------------------------------------------------------------------------------------------------------------------ Filas → modelo

const clean = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

export function capacityFromRows(rows: CapacidadRow[]): CapacityConfig {
  const cfg: CapacityConfig = { defaultCapacity: DEFAULT_CAPACITY, byBranch: {}, overrides: [] };
  for (const r of rows) {
    if (r.ambito === 'general') cfg.defaultCapacity = r.cupo;
    else if (r.ambito === 'sede' && r.sede_id) cfg.byBranch[r.sede_id] = r.cupo;
    else if (r.ambito === 'excepcion' && r.sede_id && r.fecha && r.hora) cfg.overrides.push({ id: overrideId(r.sede_id, r.fecha, r.hora), branchId: r.sede_id, date: r.fecha, time: r.hora, capacity: r.cupo });
  }
  cfg.overrides.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  return cfg;
}

/** El mismo id de una excepción que arma la pantalla (`upsertOverride`). */
export const overrideId = (branchId: string, date: string, time: string): string => `CUP-${branchId}-${date}-${time}`;

/** Lo derivado de las filas: las asesorías con el nombre del alumno, su programa y su responsable; el historial; los seguimientos y los cupos. */
export function agendaFromRows(rows: AgendaRows, lists: AgendaLists): AgendaState {
  const studentName = new Map(lists.students.map(s => [s.id, s.name]));
  const enrollmentById = new Map(lists.enrollments.map(e => [e.id, e]));
  const latest = new Map<string, Enrollment>();
  for (const s of lists.students) { const e = latestEnrollmentOf(s.id, lists.enrollments); if (e) latest.set(s.id, e); }
  const staffById = new Map(lists.staff.map(s => [s.id, s]));

  const schedules: Schedule[] = rows.asesorias.map(r => {
    const e = r.es_primera ? enrollmentById.get(r.matricula_id ?? '') : latest.get(r.alumno_id);
    const member = r.responsable_id ? staffById.get(r.responsable_id) : undefined;
    return clean<Schedule>({
      id: r.id, student: studentName.get(r.alumno_id) ?? '', studentId: r.alumno_id, program: e?.program ?? '', level: e?.level ?? 'Sin nivel', date: r.fecha, time: r.hora,
      duration: SLOT_DURATION, responsible: member ? staffLabel(member) : '', responsibleId: r.responsable_id ?? undefined, status: r.estado, branchId: r.sede_id,
      observations: r.observaciones ?? undefined, isFirst: r.es_primera ? true : undefined, registrationId: r.registro_id ?? undefined, enrollmentId: r.matricula_id ?? undefined,
    });
  });
  const psyEvents: PsyEvent[] = rows.eventos.map(r => clean<PsyEvent>({
    id: r.id, at: r.en, by: r.por, subject: r.tema, refId: r.ref_id, studentId: r.alumno_id ?? undefined, type: r.tipo as PsyEventType,
    initiator: (r.iniciador ?? undefined) as ChangeInitiator | undefined, reason: r.motivo ?? undefined, detail: r.detalle ?? undefined, from: r.desde ?? undefined, to: r.hasta ?? undefined,
  }));
  const trackings: Tracking[] = rows.seguimientos.map(r => clean<Tracking>({
    id: r.id, studentId: r.alumno_id, scheduleId: r.asesoria_id ?? undefined, date: r.fecha, status: r.estado, metrics: r.metricas ?? {}, observations: r.observaciones,
    checklist: (r.checklist ?? undefined) as Tracking['checklist'],
  }));
  return { schedules, psyEvents, trackings, capacityConfig: capacityFromRows(rows.capacidad) };
}

const byId = <T extends { id: string }>(a: T, b: T) => a.id.localeCompare(b.id);

/** Mezcla las filas que acaban de guardarse (o de leerse de nuevo) con las que ya había: la más nueva de cada código gana. */
export function mergeAgendaRows(current: AgendaRows, fresh: Partial<AgendaRows>): AgendaRows {
  const merge = <T extends { id: string }>(a: T[], b: T[] | undefined) => (b && b.length > 0 ? [...new Map([...a, ...b].map(r => [r.id, r])).values()].sort(byId) : a);
  return {
    asesorias: merge(current.asesorias, fresh.asesorias), eventos: merge(current.eventos, fresh.eventos), seguimientos: merge(current.seguimientos, fresh.seguimientos),
    capacidad: fresh.capacidad ?? current.capacidad,
  };
}

// ------------------------------------------------------------------------------------------------------------------ Modelo → lo que viaja

/** Quién es el responsable que nombra un texto («Ana Pérez»): entre quienes trabajan en Psicopedagogía de esa sede, y si no, entre todo el personal. */
export function resolveResponsibleId(text: string, staff: Staff[], assignments: Assignment[], branchName?: string): string | undefined {
  const named = text.trim() ? staff.filter(s => isStaffNamed(s, text)) : [];
  if (named.length <= 1) return named[0]?.id;
  const here = named.find(s => assignments.some(a => a.staffId === s.id && a.status === 'Activa' && a.area === 'Psicopedagogía' && (!branchName || a.branch === branchName)));
  return (here ?? named[0])?.id;
}

const orNull = (v: string | undefined | null) => (v === undefined || v === null || v === '' ? null : v);

/** Una asesoría nueva, completa, con su código de borrador. */
export function scheduleInsertRow(s: Schedule, responsibleId: string | undefined): Record<string, unknown> {
  return {
    id: s.id, _nueva: true, alumno_id: s.studentId, sede_id: s.branchId, fecha: s.date, hora: s.time, responsable_id: orNull(responsibleId), estado: s.status,
    observaciones: orNull(s.observations), es_primera: !!s.isFirst, registro_id: orNull(s.registrationId), matricula_id: orNull(s.enrollmentId),
  };
}

/** Lo que cambió en una asesoría (solo fecha, hora, responsable, estado y observaciones); `null` si no cambió nada. */
export function scheduleChangeRow(before: Schedule, after: Schedule, responsibleId: string | undefined): Record<string, unknown> | null {
  const row: Record<string, unknown> = { id: before.id };
  if (after.date !== before.date) row.fecha = after.date;
  if (after.time !== before.time) row.hora = after.time;
  if ((responsibleId ?? null) !== (before.responsibleId ?? null)) row.responsable_id = orNull(responsibleId);
  if (after.status !== before.status) row.estado = after.status;
  if ((after.observations ?? '') !== (before.observations ?? '')) row.observaciones = orNull(after.observations);
  return Object.keys(row).length > 1 ? row : null;
}

export type ScheduleAgendaAction = 'reservar' | 'reprogramar' | 'cancelar' | 'asistencia' | 'observaciones';

/** Qué operación de la agenda es este cambio (la misma clasificación que hace la base y que pide el registro de funciones). */
export function scheduleActionOf(before: Schedule, after: Schedule): ScheduleAgendaAction {
  if (after.status === 'Cancelado' && before.status !== 'Cancelado') return 'cancelar';
  if ((after.status === 'Asistió' || after.status === 'Faltó') && after.status !== before.status) return 'asistencia';
  const moved = after.date !== before.date || after.time !== before.time || (after.responsibleId ?? '') !== (before.responsibleId ?? '') || after.responsible.trim() !== before.responsible.trim();
  return moved ? 'reprogramar' : 'observaciones';
}

/** Un evento del historial, listo para viajar (su código es un borrador; quién y cuándo los pone la base). */
export function eventRow(e: PsyEvent): Record<string, unknown> {
  return {
    id: e.id, tema: e.subject, ref_id: e.refId, tipo: e.type, iniciador: orNull(e.initiator), motivo: orNull(e.reason), detalle: orNull(e.detail),
    desde: e.from ?? null, hasta: e.to ?? null,
  };
}

/** Un seguimiento nuevo, completo, con su código de borrador. */
export function trackingInsertRow(t: Omit<Tracking, 'id'>): Record<string, unknown> {
  return {
    id: draftId('TRK'), _nueva: true, alumno_id: t.studentId, asesoria_id: orNull(t.scheduleId), fecha: t.date, estado: t.status, metricas: t.metrics ?? {},
    observaciones: t.observations ?? '', checklist: t.checklist ?? null,
  };
}

/** Lo que cambió en un seguimiento; `null` si no cambió nada. */
export function trackingChangeRow(before: Tracking, after: Partial<Omit<Tracking, 'id'>>): Record<string, unknown> | null {
  const row: Record<string, unknown> = { id: before.id };
  if (after.date !== undefined && after.date !== before.date) row.fecha = after.date;
  if (after.status !== undefined && after.status !== before.status) row.estado = after.status;
  if (after.metrics !== undefined && JSON.stringify(after.metrics) !== JSON.stringify(before.metrics)) row.metricas = after.metrics ?? {};
  if (after.observations !== undefined && after.observations !== before.observations) row.observaciones = after.observations;
  if (after.checklist !== undefined && JSON.stringify(after.checklist) !== JSON.stringify(before.checklist)) row.checklist = after.checklist ?? null;
  return Object.keys(row).length > 1 ? row : null;
}

/** Un evento nuevo para una asesoría, con código de borrador. */
export const newEventId = (): string => draftId('EVT');

// ------------------------------------------------------------------------------------------------------------------ Cupos

export interface CapacityChanges { guardar: { ambito: string; sede_id?: string; fecha?: string; hora?: string; cupo: number | null }[]; quitar: string[] }

/** El id de la fila de la base de un cupo: `general`, `sede:FIL-002` o `exc:FIL-002:2026-11-20:16:00`. */
export const capacityRowId = (kind: 'general' | 'sede' | 'excepcion', branchId?: string, date?: string, time?: string): string =>
  kind === 'general' ? 'general' : kind === 'sede' ? `sede:${branchId}` : `exc:${branchId}:${date}:${time}`;

/** Lo que hay que guardar y quitar para pasar de un cupo a otro (solo lo que cambió). */
export function capacityChanges(before: CapacityConfig, after: CapacityConfig): CapacityChanges {
  const out: CapacityChanges = { guardar: [], quitar: [] };
  if (after.defaultCapacity !== before.defaultCapacity) out.guardar.push({ ambito: 'general', cupo: after.defaultCapacity });
  for (const [branchId, cupo] of Object.entries(after.byBranch)) {
    if (!Object.prototype.hasOwnProperty.call(before.byBranch, branchId) || before.byBranch[branchId] !== cupo) out.guardar.push({ ambito: 'sede', sede_id: branchId, cupo });
  }
  for (const branchId of Object.keys(before.byBranch)) if (!Object.prototype.hasOwnProperty.call(after.byBranch, branchId)) out.quitar.push(capacityRowId('sede', branchId));
  const key = (o: CapacityOverride) => `${o.branchId}|${o.date}|${o.time}`;
  const was = new Map(before.overrides.map(o => [key(o), o]));
  const is = new Map(after.overrides.map(o => [key(o), o]));
  for (const [k, o] of is) if (!was.has(k) || was.get(k)!.capacity !== o.capacity) out.guardar.push({ ambito: 'excepcion', sede_id: o.branchId, fecha: o.date, hora: o.time, cupo: o.capacity });
  for (const [k, o] of was) if (!is.has(k)) out.quitar.push(capacityRowId('excepcion', o.branchId, o.date, o.time));
  return out;
}

export const hasCapacityChanges = (c: CapacityChanges): boolean => c.guardar.length > 0 || c.quitar.length > 0;

// ------------------------------------------------------------------------------------------------------------------ Errores

/** Mensaje claro para un error de la base en la agenda. Los avisos de las funciones propias (código EN001) ya vienen en español. */
export function agendaErrorMessage(e: DbErrorLike | null | undefined): string {
  if (!e) return 'No se pudo guardar. Intente de nuevo.';
  const t = `${e.message ?? ''} ${e.details ?? ''}`.toLowerCase();
  if (e.code === '23505' && t.includes('seguimientos_asesoria_uq')) return 'Esta asesoría ya tiene su sesión registrada.';
  if (e.code === '23505') return 'Otra persona guardó algo al mismo tiempo. Actualice la página e intente de nuevo.';
  if (e.code === '23503') return 'Algo de lo que se nombra ya no existe (el alumno, la sede o el responsable). Actualice la página e intente de nuevo.';
  if (e.code === '40P01') return 'Otra persona estaba guardando en la misma agenda en ese instante. Intente de nuevo.';
  return dbErrorMessage(e);
}
