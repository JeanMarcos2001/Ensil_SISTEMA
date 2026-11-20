/**
 * Traducción entre los requerimientos de las sedes, sus mensajes y las marcas de lectura del sistema y las filas de la base (tablas `requerimientos`,
 * `requerimiento_mensajes` y `requerimiento_lecturas`, migración 0031). Funciones puras.
 *
 * Lo derivable no se guarda: las líneas llevan ids de artículo (el nombre sale del catálogo) y la situación que ve la sede se calcula
 * (`requirementSedeStatus`). El enlace con el envío vive en el envío (`Shipment.requirementId`).
 */
import type { Requirement, RequirementDraft, RequirementLine, RequirementMessage, RequirementStatus } from './requirements';

export interface RequerimientoRow {
  id: string; fecha: string; sede_id: string; almacen_id: string;
  lineas: { articulo_id: string; cantidad: number; enviar?: number | null }[];
  nota: string | null; estado: RequirementStatus; motivo_rechazo: string | null;
  visto_en: string | null; visto_por: string | null; verificado_en: string | null; verificado_por: string | null; resuelto_en: string | null; resuelto_por: string | null;
  version: number; creado_por_id: string | null; creado_en: string; creado_por: string | null;
}
export interface RequerimientoMensajeRow {
  numero: number | string; requerimiento_id: string; lado: 'sede' | 'logistica'; texto: string; autor_id: string | null; autor_nombre: string; creado_en: string;
}
export interface RequerimientoLecturaRow { requerimiento_id: string; cuenta_id: string; visto_hasta: number | string }

const opt = <T>(v: T | null | undefined): T | undefined => (v === null || v === undefined || (v as unknown) === '' ? undefined : v);

export const requirementFromRow = (r: RequerimientoRow): Requirement => ({
  id: r.id, date: r.fecha, branchId: r.sede_id, warehouseId: r.almacen_id,
  lines: (r.lineas ?? []).map((l): RequirementLine => ({ itemId: l.articulo_id, quantity: l.cantidad, ...(l.enviar === null || l.enviar === undefined ? {} : { send: l.enviar }) })),
  note: opt(r.nota), status: r.estado, rejectionReason: opt(r.motivo_rechazo),
  seenAt: opt(r.visto_en), seenBy: opt(r.visto_por), reviewedAt: opt(r.verificado_en), reviewedBy: opt(r.verificado_por), resolvedAt: opt(r.resuelto_en), resolvedBy: opt(r.resuelto_por),
  version: r.version, createdById: opt(r.creado_por_id), createdAt: opt(r.creado_en), createdBy: opt(r.creado_por),
});

export const messageFromRow = (r: RequerimientoMensajeRow): RequirementMessage => ({
  id: Number(r.numero), requirementId: r.requerimiento_id, side: r.lado, text: r.texto, authorId: opt(r.autor_id), authorName: r.autor_nombre, createdAt: r.creado_en,
});

/** Hasta qué mensaje leyó esta cuenta cada requerimiento. */
export const seenFromRows = (rows: RequerimientoLecturaRow[]): Record<string, number> =>
  Object.fromEntries(rows.map(r => [r.requerimiento_id, Number(r.visto_hasta)]));

/** Lo que se manda a la base al armar un requerimiento (los artículos viajan por id; el código lo asigna la base). */
export const requirementPayload = (draft: RequirementDraft): Record<string, unknown> => ({
  sede_id: draft.branchId, almacen_id: draft.warehouseId,
  lineas: draft.lines.map(l => ({ articulo_id: l.itemId, cantidad: l.quantity })),
  ...(draft.note?.trim() ? { nota: draft.note.trim() } : {}),
});

/** Lo que se manda a la base al verificar la existencia: de cada artículo pedido, cuánto se enviará. */
export const reviewPayload = (lines: RequirementLine[], sends: Record<string, number>): { articulo_id: string; enviar: number }[] =>
  lines.map(l => ({ articulo_id: l.itemId, enviar: sends[l.itemId] }));
