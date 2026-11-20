/**
 * Operaciones de los requerimientos de las sedes (armar, abrir «Verificar existencia», fijar lo que se enviará, rechazar, pasar a «Empacando», escribir y
 * marcar mensajes como vistos) sobre la base de datos: validan con las reglas puras (`utils/requirements.ts`) y luego llaman a la base.
 *
 * Reciben el repositorio como parámetro (el de Supabase en el sistema, uno en memoria en `scripts/check-requirements-db.ts`), de modo que el orden
 * «validar → guardar → traducir el error» se puede comprobar sin conexión. Ninguna toca el estado de React: quien llama (el gancho `useRequirements`)
 * vuelve a leer de la base lo que cambió, así lo que se muestra es lo que de verdad quedó guardado.
 */
import type { Shipment } from '../context/DataContext';
import {
  requirementDraftError, requirementMessageError, requirementOpenError, requirementRejectionError, requirementReviewError, requirementToPackingIssue,
  requirementAcceptsMessages, type ItemRef, type Requirement, type RequirementDraft, type RequirementLine, type RequirementMessage,
} from '../utils/requirements';
import { requirementPayload, reviewPayload } from '../utils/requirementsDb';
import type { OpResult, RepoResult } from './orgDirectory';

export interface RequirementsData { requirements: Requirement[]; messages: RequirementMessage[]; seen: Record<string, number> }
export type RequirementResult = OpResult & { id?: string };

export interface RequirementsRepository {
  loadAll(): Promise<RepoResult<RequirementsData>>;
  create(payload: Record<string, unknown>): Promise<RepoResult<string>>;
  /** Alguien abrió «Verificar existencia»: la tarjeta deja de parpadear para todos. */
  open(id: string): Promise<RepoResult<null>>;
  review(id: string, lines: { articulo_id: string; enviar: number }[], version?: number): Promise<RepoResult<null>>;
  reject(id: string, reason: string, version?: number): Promise<RepoResult<null>>;
  /** Pasa el requerimiento a «Empacando»: nace el envío (devuelve su código). */
  moveToPacking(id: string, version?: number): Promise<RepoResult<string>>;
  sendMessage(id: string, text: string): Promise<RepoResult<number>>;
  markSeen(id: string): Promise<RepoResult<null>>;
}

/** Con qué se comprueban las reglas: lo último que se vio de los requerimientos, de los envíos y del catálogo. */
export interface RequirementsContext {
  requirements: Requirement[];
  shipments: Pick<Shipment, 'id' | 'requirementId' | 'status'>[];
  items: ItemRef[];
  itemName: (id: string) => string;
}

const fail = (error: string): RequirementResult => ({ ok: false, error });
const NOT_FOUND = 'No se encontró el requerimiento. Actualice la pantalla.';

/** Lee de la base los requerimientos que la cuenta puede ver, sus mensajes y hasta dónde leyó cada uno. */
export async function loadRequirements(repo: RequirementsRepository): Promise<OpResult<RequirementsData>> {
  const res = await repo.loadAll();
  return res.ok && res.data ? { ok: true, value: res.data } : { ok: false, error: res.error ?? 'No se pudieron cargar los requerimientos.' };
}

/** La sede arma su requerimiento. Devuelve el código que le asignó la base. */
export async function createRequirement(repo: RequirementsRepository, ctx: RequirementsContext, draft: RequirementDraft): Promise<RequirementResult> {
  const invalid = requirementDraftError(draft, ctx.items);
  if (invalid) return fail(invalid);
  const res = await repo.create(requirementPayload(draft));
  return res.ok ? { ok: true, id: res.data ?? undefined } : fail(res.error ?? 'No se pudo enviar el requerimiento.');
}

/** Alguien abre «Verificar existencia»: si ya se había abierto antes no hace falta avisar a la base. */
export async function openRequirementReview(repo: RequirementsRepository, ctx: RequirementsContext, id: string): Promise<RequirementResult> {
  const req = ctx.requirements.find(r => r.id === id);
  if (!req) return fail(NOT_FOUND);
  if (req.seenAt) return { ok: true };
  const res = await repo.open(id);
  return res.ok ? { ok: true } : fail(res.error ?? 'No se pudo abrir la verificación.');
}

/** Logística fija cuánto enviará de cada artículo pedido (solo reduce). */
export async function reviewRequirement(
  repo: RequirementsRepository, ctx: RequirementsContext, id: string, sends: Record<string, number>, version?: number,
): Promise<RequirementResult> {
  const req = ctx.requirements.find(r => r.id === id);
  if (!req) return fail(NOT_FOUND);
  const closed = requirementOpenError(req, ctx.shipments);
  if (closed) return fail(closed);
  const invalid = requirementReviewError(req, sends, ctx.itemName);
  if (invalid) return fail(invalid);
  const res = await repo.review(id, reviewPayload(req.lines as RequirementLine[], sends), version);
  return res.ok ? { ok: true } : fail(res.error ?? 'No se pudieron guardar las cantidades.');
}

/** Logística rechaza el requerimiento con su motivo (la sede lo verá). */
export async function rejectRequirement(repo: RequirementsRepository, ctx: RequirementsContext, id: string, reason: string, version?: number): Promise<RequirementResult> {
  const req = ctx.requirements.find(r => r.id === id);
  if (!req) return fail(NOT_FOUND);
  const closed = requirementOpenError(req, ctx.shipments);
  if (closed) return fail(closed);
  const invalid = requirementRejectionError(reason);
  if (invalid) return fail(invalid);
  const res = await repo.reject(id, reason.trim(), version);
  return res.ok ? { ok: true } : fail(res.error ?? 'No se pudo rechazar el requerimiento.');
}

/** Pasa el requerimiento a «Empacando»: nace el envío. Devuelve el código del envío. */
export async function moveRequirementToPacking(repo: RequirementsRepository, ctx: RequirementsContext, id: string, version?: number): Promise<RequirementResult> {
  const req = ctx.requirements.find(r => r.id === id);
  if (!req) return fail(NOT_FOUND);
  const issue = requirementToPackingIssue(req, ctx.shipments);
  if (issue) return fail(issue);
  const res = await repo.moveToPacking(id, version);
  return res.ok ? { ok: true, id: res.data ?? undefined } : fail(res.error ?? 'No se pudo pasar el requerimiento a «Empacando».');
}

/** Un mensaje anclado al requerimiento (solo mientras está pendiente). */
export async function sendRequirementMessage(repo: RequirementsRepository, ctx: RequirementsContext, id: string, text: string): Promise<RequirementResult> {
  const req = ctx.requirements.find(r => r.id === id);
  if (!req) return fail(NOT_FOUND);
  if (!requirementAcceptsMessages(req)) return fail('Este requerimiento ya está cerrado: no admite más mensajes.');
  const invalid = requirementMessageError(text);
  if (invalid) return fail(invalid);
  const res = await repo.sendMessage(id, text.trim());
  return res.ok ? { ok: true } : fail(res.error ?? 'No se pudo enviar el mensaje.');
}

/** La cuenta marca como vistos los mensajes de un requerimiento. */
export async function markRequirementSeen(repo: RequirementsRepository, id: string): Promise<RequirementResult> {
  const res = await repo.markSeen(id);
  return res.ok ? { ok: true } : fail(res.error ?? 'No se pudo marcar como visto.');
}
