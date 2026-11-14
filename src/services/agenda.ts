/**
 * Operaciones de la agenda de Psicopedagogía (asesorías, historial, seguimiento y cupos) sobre la base de datos. Reciben el repositorio como parámetro (el de
 * Supabase en el sistema, uno en memoria en `scripts/check-agenda-db.ts`), de modo que el orden «guardar → volver a leer lo tocado → traducir el error» se
 * puede comprobar sin conexión. Las reglas de la agenda son funciones puras (`utils/schedule.ts`, `utils/psyHistory.ts`, `utils/verificationGate.ts`…): quien
 * llama (el contexto) las aplica ANTES y arma el envío con `utils/agendaDb.ts`; la base vuelve a comprobarlas, asigna los códigos y deja quién y cuándo.
 *
 * Lo que la agenda cambia dentro de una operación del dinero (la primera asesoría al matricular, las cancelaciones al caer o trasladarse) viaja en la clave
 * `agenda` de esa misma operación (`useMoney`): se guarda todo o nada, y aquí solo se vuelve a leer lo tocado (`refreshAgenda`).
 */
import type { CapacityChanges, AgendaRows } from '../utils/agendaDb';
import type { OpResult, RepoResult } from './orgDirectory';

/** Lo que viaja a la base: filas nuevas (completas, con `_nueva`) o con lo que cambió, y los eventos del historial. Los códigos son borradores. */
export interface AgendaPayload {
  asesorias?: Record<string, unknown>[];
  seguimientos?: Record<string, unknown>[];
  eventos?: Record<string, unknown>[];
}

export interface AgendaApplied { codes: Record<string, string>; fresh: Partial<AgendaRows> }

export interface AgendaRepository {
  loadAll(): Promise<RepoResult<AgendaRows>>;
  /** Aplica una acción de la agenda y devuelve «borrador → código real». */
  apply(action: string, payload: AgendaPayload): Promise<RepoResult<{ codes: Record<string, string> }>>;
  /** Vuelve a leer las asesorías (con su historial y su seguimiento) de esos códigos reales. */
  loadTouched(scheduleIds: string[], trackingIds?: string[]): Promise<RepoResult<Partial<AgendaRows>>>;
  saveCapacity(changes: CapacityChanges): Promise<RepoResult<null>>;
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
