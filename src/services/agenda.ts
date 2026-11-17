/**
 * Operaciones de la agenda de Psicopedagogía (asesorías, historial, seguimiento y cupos) sobre la base de datos. Reciben el repositorio como parámetro (el de
 * Supabase en el sistema, uno en memoria en `scripts/check-agenda-db.ts`), de modo que el orden «guardar → volver a leer lo tocado → traducir el error» se
 * puede comprobar sin conexión. Las reglas de la agenda son funciones puras (`utils/schedule.ts`, `utils/psyHistory.ts`, `utils/verificationGate.ts`…): quien
 * llama (el contexto) las aplica ANTES y arma el envío con `utils/agendaDb.ts`; la base vuelve a comprobarlas, asigna los códigos y deja quién y cuándo.
 *
 * Lo que la agenda cambia dentro de una operación del dinero (la primera asesoría al matricular, las cancelaciones al caer o trasladarse) viaja en la clave
 * `agenda` de esa misma operación (`useMoney`): se guarda todo o nada, y aquí solo se vuelve a leer lo tocado (`refreshAgenda`).
 */
import type { ActivityRows } from '../utils/activitiesDb';
import type { CapacityChanges, AgendaRows, EventoRow } from '../utils/agendaDb';
import { policyText, validatePsyPolicy, validatePsyReminderLog, type PsyReminder } from '../utils/psyReminders';
import type { PsyReminderRows } from '../utils/psyRemindersDb';
import type { PsyReminderLog, PsyReminderPolicy } from '../context/DataContext';
import type { OpResult, RepoResult } from './orgDirectory';

/** Lo que viaja a la base: filas nuevas (completas, con `_nueva`) o con lo que cambió, y los eventos del historial. Los códigos son borradores. */
export interface AgendaPayload {
  asesorias?: Record<string, unknown>[];
  seguimientos?: Record<string, unknown>[];
  eventos?: Record<string, unknown>[];
}

export interface AgendaApplied { codes: Record<string, string>; fresh: Partial<AgendaRows> }

/** Un recordatorio de Psicopedagogía tal como lo guarda la base: la sede, quién y cuándo los pone ella. */
export interface PsyReminderRequest { kind: PsyReminderLog['kind']; refId: string; studentId: string; offset: number; channel: PsyReminderLog['channel']; result: PsyReminderLog['result']; note: string }

/** Lo que viaja para cambiar cronogramas y actividades (migración 0023): filas nuevas completas (`_nueva`) o con lo que cambió, y los eventos del historial. */
export interface ActivitiesPayload {
  cronogramas?: Record<string, unknown>[];
  actividades?: Record<string, unknown>[];
  quitar_actividades?: string[];
  inscripciones?: Record<string, unknown>[];
  quitar_inscripciones?: Record<string, unknown>[];
  eventos?: Record<string, unknown>[];
}

/** Lo que se vuelve a leer de unos cronogramas: ellos, sus actividades, sus inscritos y el historial de sus actividades. */
export interface ActivitiesFresh extends ActivityRows { eventos: EventoRow[] }
export interface ActivitiesApplied { codes: Record<string, string>; touched: string[]; fresh: ActivitiesFresh }

export interface AgendaRepository {
  loadAll(): Promise<RepoResult<AgendaRows>>;
  /** Aplica una acción de la agenda y devuelve «borrador → código real». */
  apply(action: string, payload: AgendaPayload): Promise<RepoResult<{ codes: Record<string, string> }>>;
  /** Vuelve a leer las asesorías (con su historial y su seguimiento) de esos códigos reales. */
  loadTouched(scheduleIds: string[], trackingIds?: string[]): Promise<RepoResult<Partial<AgendaRows>>>;
  saveCapacity(changes: CapacityChanges): Promise<RepoResult<null>>;
  /** Aplica una acción de las actividades (migración 0023) y devuelve «borrador → código real». */
  applyActivities(action: string, payload: ActivitiesPayload): Promise<RepoResult<{ codes: Record<string, string> }>>;
  /** Vuelve a leer esos cronogramas completos (con sus actividades, inscritos e historial). Los que ya no existen no vuelven. */
  loadActivitiesTouched(cronogramaIds: string[]): Promise<RepoResult<ActivitiesFresh>>;
  /** Guarda la política de recordatorios de Psicopedagogía (una versión nueva si cambió) y devuelve el número de la vigente. */
  savePsyPolicy(policy: PsyReminderPolicy): Promise<RepoResult<number>>;
  /** Registra un recordatorio de Psicopedagogía y devuelve su código. */
  addPsyReminder(r: PsyReminderRequest): Promise<RepoResult<string>>;
  /** Vuelve a leer las versiones de la política y los recordatorios registrados (son pocas filas). */
  loadPsyReminders(): Promise<RepoResult<PsyReminderRows>>;
}

const fail = (error: string): OpResult<never> => ({ ok: false, error });

/** Lee de la base toda la agenda. Se lee al iniciar sesión (`AccessGate`), antes de montar las pantallas. */
export async function loadAgenda(repo: AgendaRepository): Promise<OpResult<AgendaRows>> {
  const res = await repo.loadAll();
  return res.ok && res.data ? { ok: true, value: res.data } : fail(res.error ?? 'No se pudo cargar la agenda de Psicopedagogía.');
}

/** Los códigos reales de lo que acaba de guardarse: los borradores del envío se traducen con lo que asignó la base. */
export const realCodes = (ids: string[], codes: Record<string, string>): string[] => [...new Set(ids.map(id => codes[id] ?? id))];

/** Vuelve a leer lo tocado (asesorías y su historial y seguimiento). Si la lectura falla, la operación ya se guardó: se avisa. */
export async function refreshAgenda(repo: AgendaRepository, scheduleIds: string[], trackingIds: string[] = []): Promise<OpResult<Partial<AgendaRows>>> {
  if (scheduleIds.length === 0 && trackingIds.length === 0) return { ok: true, value: {} };
  const fresh = await repo.loadTouched(scheduleIds, trackingIds);
  return fresh.ok && fresh.data ? { ok: true, value: fresh.data } : fail('Se guardó, pero no se pudo volver a leer. Actualice la pantalla para ver lo que quedó.');
}

/**
 * Aplica una acción de la agenda (reservar, reprogramar, cancelar, asistencia, observaciones, registrar o editar la sesión): todo o nada, con la función del
 * registro de esa acción y las reglas de la base. Devuelve los códigos reales y las filas como quedaron. Sin nada que guardar, no llama a la base.
 */
export async function applyAgenda(repo: AgendaRepository, action: string, payload: AgendaPayload): Promise<OpResult<AgendaApplied>> {
  const rows = payload.asesorias ?? [];
  const sessions = payload.seguimientos ?? [];
  if (rows.length === 0 && sessions.length === 0) return { ok: true, value: { codes: {}, fresh: {} } };
  const saved = await repo.apply(action, payload);
  if (!saved.ok) return fail(saved.error ?? 'No se pudo guardar.');
  const codes = saved.data?.codes ?? {};
  const scheduleIds = realCodes([...rows.map(r => String(r.id)), ...sessions.filter(s => s.asesoria_id).map(s => String(s.asesoria_id))], codes);
  const trackingIds = realCodes(sessions.map(s => String(s.id)), codes);
  const fresh = await refreshAgenda(repo, scheduleIds, trackingIds);
  if (!fresh.ok || !fresh.value) return fail(fresh.error ?? 'Se guardó, pero no se pudo volver a leer.');
  return { ok: true, value: { codes, fresh: fresh.value } };
}

/** Guarda los cupos que cambiaron (general, por sede y excepciones por fecha y hora) y vuelve a leer todos los cupos. */
export async function applyCapacity(repo: AgendaRepository, changes: CapacityChanges): Promise<OpResult> {
  if (changes.guardar.length === 0 && changes.quitar.length === 0) return { ok: true };
  const saved = await repo.saveCapacity(changes);
  return saved.ok ? { ok: true } : fail(saved.error ?? 'No se pudo guardar el cupo.');
}

/** Vuelve a leer unos cronogramas (con todo lo suyo). Si la lectura falla, la operación ya se guardó: se avisa. */
export async function refreshActivities(repo: AgendaRepository, cronogramaIds: string[]): Promise<OpResult<ActivitiesFresh>> {
  const empty: ActivitiesFresh = { cronogramas: [], actividades: [], inscripciones: [], eventos: [] };
  if (cronogramaIds.length === 0) return { ok: true, value: empty };
  const fresh = await repo.loadActivitiesTouched(cronogramaIds);
  return fresh.ok && fresh.data ? { ok: true, value: fresh.data } : fail('Se guardó, pero no se pudo volver a leer. Actualice la pantalla para ver lo que quedó.');
}

/**
 * Aplica una acción de las actividades (crear, editar o eliminar un cronograma, asignar el responsable, inscribir, retirar la inscripción, registrar la asistencia):
 * todo o nada, con la función del registro de esa acción y las reglas de la base. `touched` son los cronogramas que la acción toca (con su código real o de borrador):
 * después de guardar se vuelven a leer completos. Sin nada que guardar no llama a la base.
 */
export async function applyActivities(repo: AgendaRepository, action: string, payload: ActivitiesPayload, touched: string[]): Promise<OpResult<ActivitiesApplied>> {
  const hasChanges = Object.values(payload).some(v => Array.isArray(v) && v.length > 0);
  if (!hasChanges) return { ok: true, value: { codes: {}, touched: [], fresh: { cronogramas: [], actividades: [], inscripciones: [], eventos: [] } } };
  const saved = await repo.applyActivities(action, payload);
  if (!saved.ok) return fail(saved.error ?? 'No se pudo guardar.');
  const codes = saved.data?.codes ?? {};
  const ids = realCodes(touched, codes);
  const fresh = await refreshActivities(repo, ids);
  if (!fresh.ok || !fresh.value) return fail(fresh.error ?? 'Se guardó, pero no se pudo volver a leer.');
  return { ok: true, value: { codes, touched: ids, fresh: fresh.value } };
}

// ------------------------------------------------------------------------------------------------------------------ Recordatorios de Psicopedagogía

/** Guarda la política de recordatorios del grupo (días antes de las asesorías, de las actividades y del fin de la vigencia). Una versión nueva solo si cambió. */
export async function savePsyPolicyVersion(repo: AgendaRepository, policy: PsyReminderPolicy): Promise<OpResult> {
  const problems = validatePsyPolicy(policyText(policy));
  if (problems.length > 0) return fail(problems[0]!);
  const res = await repo.savePsyPolicy(policy);
  return res.ok ? { ok: true } : fail(res.error ?? 'No se pudo guardar la política de recordatorios.');
}

/** Registra que un recordatorio se envió o se omitió (quién y cuándo los pone la base). Un mismo recordatorio no se registra dos veces. */
export async function logPsyReminderEntry(
  repo: AgendaRepository, logs: Pick<PsyReminderLog, 'key'>[], reminder: Pick<PsyReminder, 'key' | 'kind' | 'refId' | 'studentId' | 'offset'>,
  channel: PsyReminderLog['channel'], result: PsyReminderLog['result'], note: string,
): Promise<OpResult> {
  const problems = validatePsyReminderLog(reminder, channel, result, note, logs);
  if (problems.length > 0) return fail(problems[0]!);
  const res = await repo.addPsyReminder({ kind: reminder.kind, refId: reminder.refId, studentId: reminder.studentId, offset: reminder.offset, channel, result, note: note.trim() });
  return res.ok ? { ok: true } : fail(res.error ?? 'No se pudo registrar el recordatorio.');
}

/** Vuelve a leer la política y los recordatorios. Si la lectura falla, la operación ya se guardó: se avisa. */
export async function refreshPsyReminders(repo: AgendaRepository): Promise<OpResult<PsyReminderRows>> {
  const res = await repo.loadPsyReminders();
  return res.ok && res.data ? { ok: true, value: res.data } : fail('Se guardó, pero no se pudo volver a leer. Actualice la pantalla para ver lo que quedó.');
}
