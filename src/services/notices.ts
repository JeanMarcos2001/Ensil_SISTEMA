/**
 * Operaciones de los avisos de la campana sobre la base de datos: leer los que le corresponden a la cuenta, emitir uno y marcarlos leídos.
 *
 * Reciben el repositorio como parámetro (el de Supabase en el sistema, uno en memoria en `scripts/check-notices-db.ts`), de modo que el orden
 * «validar → guardar → traducir el error» se puede comprobar sin conexión. Ninguna toca el estado de React: quien llama (el gancho `useNotices`)
 * vuelve a leer de la base. **Quién recibe cada aviso lo decide la base** al leer (con las funciones y sedes de TODAS las cuentas, que el navegador de
 * una cuenta común no puede leer); la base también vuelve a comprobar quién puede emitir cada aviso y desde qué sede.
 */
import type { NoticeView } from '../context/DataContext';
import { eventById } from '../utils/capabilities';
import { NOTICE_DAYS, noticeFromRow, sortNotices, type NoticeInput, type NoticeRow } from '../utils/noticesDb';
import type { OpResult, RepoResult } from './orgDirectory';

export interface NoticesRepository {
  /** Los avisos de los últimos `days` días que le corresponden a la cuenta, con su marca de leído. */
  list(days: number): Promise<RepoResult<NoticeRow[]>>;
  /** Guarda un aviso y devuelve su código. */
  emit(eventId: string, notice: NoticeInput): Promise<RepoResult<string>>;
  /** Marca como leídos (por esta cuenta) los avisos indicados y devuelve cuántos eran nuevos. */
  markRead(ids: string[]): Promise<RepoResult<number>>;
}

const fail = (error: string): OpResult<never> => ({ ok: false, error });

/** Lee los avisos de la cuenta, el más reciente primero. */
export async function loadNotices(repo: NoticesRepository, days = NOTICE_DAYS): Promise<OpResult<NoticeView[]>> {
  const res = await repo.list(days);
  return res.ok && res.data ? { ok: true, value: sortNotices(res.data.map(noticeFromRow)) } : fail(res.error ?? 'No se pudieron leer los avisos.');
}

/** Emite un aviso: guarda qué pasó y dónde (quién lo recibe lo calcula la base al leer). Devuelve el código del aviso. */
export async function emitNotice(repo: NoticesRepository, eventId: string, notice: NoticeInput): Promise<OpResult<string>> {
  const event = eventById(eventId);
  if (!event) return fail('Ese aviso no existe.');
  if (event.trigger !== 'accion') return fail('Ese aviso lo genera una regla del sistema, no una acción.');
  if (!notice.title.trim() || !notice.message.trim()) return fail('El aviso necesita un título y un mensaje.');
  const res = await repo.emit(eventId, notice);
  return res.ok && res.data ? { ok: true, value: res.data } : fail(res.error ?? 'No se pudo enviar el aviso.');
}

/** Marca avisos como leídos por la cuenta. */
export async function markNoticesRead(repo: NoticesRepository, ids: string[]): Promise<OpResult> {
  const unique = [...new Set(ids)].slice(0, 500);
  if (unique.length === 0) return { ok: true };
  const res = await repo.markRead(unique);
  return res.ok ? { ok: true } : fail(res.error ?? 'No se pudieron marcar los avisos como leídos.');
}
