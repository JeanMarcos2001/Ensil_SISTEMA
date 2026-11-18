/**
 * Avisos de la campana guardados en la base de datos (tablas `avisos`, `avisos_lecturas` y `aviso_eventos`, y las funciones de la migración 0026):
 * traducción entre las filas y el modelo del sistema, armado de lo que se manda al emitir un aviso, errores de la base a mensajes claros y la
 * semilla de los eventos. Funciones puras.
 *
 * Un aviso NO guarda a quién llega: guarda qué pasó (`evento`) y dónde (las sedes) y quién lo pidió. La base calcula el destinatario al leer, con las
 * reglas de cada evento (`EVENTS` del registro de funciones, copiadas a la tabla `aviso_eventos` por `supabase/seed/avisos_eventos.sql`, que se
 * **genera** con `npx tsx scripts/doc-avisos-seed.ts`): lo mismo que `utils/notifications.ts` calcula en el navegador, pero con TODAS las cuentas, que
 * una cuenta común no puede leer.
 */
import type { NoticeView, Notification } from '../context/DataContext';
import { ALL_CAPABILITIES } from './capabilities';
import { EVENTS, type Recipient } from './capabilityRegistry';
import type { NoticeScope } from './notifications';
import { dbErrorMessage, type DbErrorLike } from './orgDirectory';

/** Una fila de `mis_avisos()`: el aviso tal como lo ve la cuenta que lo pide (con su marca de leído y si le llega por respaldo). */
export interface NoticeRow {
  id: string;
  evento: string | null;
  titulo: string;
  mensaje: string;
  tipo: Notification['type'];
  destino_id: string | null;
  origen_id: string | null;
  asunto_id: string | null;
  solicitante_id: string | null;
  solicitante_nombre: string | null;
  referencia: string | null;
  creado_en: string;
  creado_por_nombre: string | null;
  leido: boolean;
  via_respaldo: boolean;
}

/** Cada cuánto se vuelve a leer la campana (los avisos los generan otras personas). */
export const NOTICE_REFRESH_MS = 60_000;
/** Cuántos días hacia atrás muestra la campana. */
export const NOTICE_DAYS = 60;

export function noticeFromRow(r: NoticeRow): NoticeView {
  const scope: NoticeScope = {};
  if (r.destino_id) scope.destinationBranchId = r.destino_id;
  if (r.origen_id) scope.originBranchId = r.origen_id;
  if (r.asunto_id) scope.subjectBranchId = r.asunto_id;
  if (r.solicitante_id) scope.requesterId = r.solicitante_id;
  if (r.solicitante_nombre) scope.requesterName = r.solicitante_nombre;
  return {
    id: r.id, title: r.titulo, message: r.mensaje, type: r.tipo, date: r.creado_en, ...(r.evento ? { eventId: r.evento } : {}), scope,
    ...(r.referencia ? { reference: r.referencia } : {}), ...(r.creado_por_nombre ? { emittedBy: r.creado_por_nombre } : {}),
    read: r.leido, viaFallback: r.via_respaldo,
  };
}

/** Los avisos más recientes primero. */
export const sortNotices = (rows: NoticeView[]): NoticeView[] => [...rows].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

/** Marca como leídos los avisos indicados (en lo que se muestra; la base lo guarda aparte). */
export const withRead = (rows: NoticeView[], ids: string[]): NoticeView[] => rows.map(n => (ids.includes(n.id) ? { ...n, read: true } : n));

// ------------------------------------------------------------------------------------------------------------------ Emitir

/** Lo que el sistema cuenta de un aviso al emitirlo. */
export interface NoticeInput {
  title: string;
  message: string;
  type: Notification['type'];
  scope?: NoticeScope;
  /** Lo que el aviso nombra (el envío, la matrícula…): se muestra y sirve para buscarlo. */
  reference?: string;
  /** Si se indica, no se emite dos veces el mismo aviso con la misma clave (por ejemplo, una vez por matrícula y por día). */
  key?: string;
}

export const NOTICE_TITLE_MAX = 120;
export const NOTICE_MESSAGE_MAX = 800;

/** Recorta un texto largo (un motivo muy extenso) para que el aviso no sea rechazado por pasarse del límite. */
export function fitText(text: string, max: number): string {
  const t = text.trim().replace(/\s+/g, ' ');
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

/** Los argumentos de la función `emitir_aviso` de la base. */
export function emitArgs(eventId: string, n: NoticeInput): Record<string, unknown> {
  const s = n.scope ?? {};
  const alcance: Record<string, string> = {};
  if (s.destinationBranchId) alcance.destino = s.destinationBranchId;
  if (s.originBranchId) alcance.origen = s.originBranchId;
  if (s.subjectBranchId) alcance.asunto = s.subjectBranchId;
  if (s.requesterId) alcance.solicitante = s.requesterId;
  if (s.requesterName) alcance.solicitante_nombre = s.requesterName;
  return {
    p_evento: eventId, p_titulo: fitText(n.title, NOTICE_TITLE_MAX), p_mensaje: fitText(n.message, NOTICE_MESSAGE_MAX), p_tipo: n.type, p_alcance: alcance,
    p_referencia: n.reference?.trim() || null, p_clave: n.key?.trim() || null,
  };
}

/** Mensaje claro para un error de la base en los avisos. Los de las funciones propias (código EN001) ya vienen en español. */
export function noticesErrorMessage(e: DbErrorLike | null | undefined): string {
  if (!e) return 'No se pudo enviar el aviso. Intente de nuevo.';
  const t = `${e.message ?? ''} ${e.details ?? ''}`.toLowerCase();
  if (e.code === '23505' && t.includes('avisos_clave_uq')) return 'Este aviso ya se envió.';
  if (e.code === '23505') return 'Otra persona guardó algo al mismo tiempo. Intente de nuevo.';
  if (e.code === '40P01') return 'Otra persona estaba guardando lo mismo en ese instante. Intente de nuevo.';
  return dbErrorMessage(e);
}

// ------------------------------------------------------------------------------------------------------------------ Eventos (semilla)

/** Una fila de `aviso_eventos`: las reglas de destinatario de un evento y quién puede emitirlo. */
export interface NoticeEventRow {
  id: string;
  etiqueta: string;
  disparo: 'accion' | 'sistema';
  destinatarios: Recipient[];
  respaldo: string;
  /** Las funciones que, según el registro, emiten el aviso (declaran `emits`): quien lo emite debe tener alguna. */
  emiten: string[];
}

/** Los eventos del registro tal como se guardan en la base. */
export function noticeEventRows(): NoticeEventRow[] {
  return EVENTS.map(e => ({
    id: e.id, etiqueta: e.label, disparo: e.trigger, destinatarios: e.recipients, respaldo: e.fallback,
    emiten: ALL_CAPABILITIES.filter(c => c.emits.includes(e.id)).map(c => c.id).sort(),
  }));
}

const lit = (s: string): string => `'${s.replace(/'/g, "''")}'`;

/**
 * Script SQL de los eventos de los avisos (`supabase/seed/avisos_eventos.sql`), generado desde el registro: así lo que la base usa para repartir los
 * avisos es exactamente lo que dice el código. Es repetible (inserta o actualiza cada evento); se vuelve a cargar cuando cambia un evento del registro.
 * `scripts/doc-avisos-seed.ts` lo escribe y `scripts/check-notices-db.ts` comprueba que el archivo no se desfase.
 */
export function renderNoticeEventsSeedSql(rows: NoticeEventRow[] = noticeEventRows()): string {
  const values = rows.map(r => `    (${lit(r.id)}, ${lit(r.etiqueta)}, ${lit(r.disparo)}, ${lit(JSON.stringify(r.destinatarios))}::jsonb, ${lit(r.respaldo)}, ${r.emiten.length > 0 ? `array[${r.emiten.map(lit).join(', ')}]` : 'array[]::text[]'})`);
  return `-- Eventos de los avisos (generado desde src/utils/capabilityRegistry.ts con \`npx tsx scripts/doc-avisos-seed.ts\`; no se edita a mano).
-- NO es una migración: son datos de configuración que se cargan después de la migración 0026 (avisos) y cada vez que cambia un evento del registro.
--
-- Cargar: pegar este script en el SQL Editor del proyecto \`ensil-sistema\` (NO el de la web).
-- Es seguro repetirlo: cada evento se inserta o se actualiza. Carga ${rows.length} eventos.

insert into public.aviso_eventos (id, etiqueta, disparo, destinatarios, respaldo, emiten)
values
${values.join(',\n')}
on conflict (id) do update set
  etiqueta = excluded.etiqueta, disparo = excluded.disparo, destinatarios = excluded.destinatarios, respaldo = excluded.respaldo, emiten = excluded.emiten;

-- Comprobación: cada evento con cuántas funciones lo pueden emitir.
select id, disparo, cardinality(emiten) as funciones_que_lo_emiten from public.aviso_eventos order by id;
`;
}
