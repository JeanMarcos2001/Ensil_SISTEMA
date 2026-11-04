/**
 * Avisos con destinatario (funciones puras).
 *
 * Un aviso NO guarda a quién llega: guarda qué pasó (`eventId`) y dónde (`scope`). Quién lo recibe se calcula al mostrar, con las
 * cuentas activas y las funciones de su rol (`EVENTS` en `capabilityRegistry.ts`): llega a quien tenga la función indicada en la sede
 * que corresponde (destino, origen o la sede del alumno), no a un nombre de rol. Así, al crear un usuario con «Confirmar la recepción de
 * un envío» en Piura, empieza a ver los envíos que ya iban hacia Piura.
 *
 * Si nadie cumple la regla, el aviso llega a quien tenga «Recibir los avisos que nadie más puede recibir» (respaldo). El Superusuario
 * (rol técnico) ve todos los avisos para dar soporte.
 */
import { SUPERUSER } from './authority';
import { holdersWith, eventById, type Holder } from './capabilities';
import type { EventDef, Recipient } from './capabilityRegistry';

/** Dónde ocurrió y quién lo pidió; con eso se resuelven los destinatarios. */
export interface NoticeScope {
  destinationBranchId?: string;
  originBranchId?: string;
  /** La sede del alumno, del documento o de la caja a la que se refiere el aviso. */
  subjectBranchId?: string;
  requesterId?: string;
  /** Mientras las solicitudes guarden solo el nombre de quien las pidió. */
  requesterName?: string;
}

export interface NoticeLike {
  eventId?: string;
  scope?: NoticeScope;
}

export interface Recipients {
  userIds: string[];
  /** Nadie cumplía la regla del aviso: lo recibe quien tenga la función de respaldo. */
  viaFallback: boolean;
}

const branchOf = (r: Extract<Recipient, { capability: string }>, scope: NoticeScope): string | undefined => {
  if (r.where === 'destination-branch') return scope.destinationBranchId;
  if (r.where === 'origin-branch') return scope.originBranchId;
  if (r.where === 'subject-branch') return scope.subjectBranchId;
  return undefined;
};

/**
 * Quiénes reciben un aviso. Si el aviso no trae la sede que su regla pide, se entrega a todos los que tengan la función (es mejor que
 * llegue de más a que no llegue).
 */
export function resolveRecipients(event: EventDef, scope: NoticeScope, holders: Holder[]): Recipients {
  const ids = new Set<string>();
  for (const r of event.recipients) {
    if ('person' in r) {
      for (const h of holders) {
        if (r.person === 'requester' && (scope.requesterId ? h.id === scope.requesterId : !!scope.requesterName && h.name === scope.requesterName)) ids.add(h.id);
      }
    } else {
      for (const h of holdersWith(r.capability, holders, branchOf(r, scope))) ids.add(h.id);
    }
  }
  if (ids.size > 0) return { userIds: [...ids], viaFallback: false };
  const fallback = holdersWith(event.fallback, holders).map(h => h.id);
  return { userIds: fallback, viaFallback: fallback.length > 0 };
}

export interface Viewer { id: string; role: string }

export interface Visibility {
  visible: boolean;
  /** Lo ve porque nadie más podía recibirlo. */
  viaFallback: boolean;
}

/** ¿Ve este usuario el aviso? Un aviso sin evento (general) lo ve todo el mundo; el Superusuario ve todos. */
export function visibility(viewer: Viewer, notice: NoticeLike, holders: Holder[]): Visibility {
  if (viewer.role === SUPERUSER) return { visible: true, viaFallback: false };
  const event = notice.eventId ? eventById(notice.eventId) : undefined;
  if (!event) return { visible: true, viaFallback: false };
  const r = resolveRecipients(event, notice.scope ?? {}, holders);
  return { visible: r.userIds.includes(viewer.id), viaFallback: r.viaFallback && r.userIds.includes(viewer.id) };
}

/** Los avisos que le corresponden al usuario, con la marca de si ya los leyó. */
export function noticesFor<T extends NoticeLike & { readBy?: string[] }>(viewer: Viewer, notices: T[], holders: Holder[]): (T & { read: boolean; viaFallback: boolean })[] {
  const out: (T & { read: boolean; viaFallback: boolean })[] = [];
  for (const n of notices) {
    const v = visibility(viewer, n, holders);
    if (v.visible) out.push({ ...n, read: (n.readBy ?? []).includes(viewer.id), viaFallback: v.viaFallback });
  }
  return out;
}

/** Marca un aviso como leído por un usuario (sin repetirlo). */
export function markRead<T extends { id: string; readBy?: string[] }>(notices: T[], noticeId: string, userId: string): T[] {
  return notices.map(n => (n.id === noticeId && !(n.readBy ?? []).includes(userId) ? { ...n, readBy: [...(n.readBy ?? []), userId] } : n));
}
