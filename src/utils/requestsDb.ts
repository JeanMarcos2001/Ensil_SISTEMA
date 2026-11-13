/**
 * Traducción entre las solicitudes sobre una matrícula (caída, reactivación, cambio de programa y traslado de sede), el registro de correcciones y las
 * filas de la base (tablas `solicitudes_matricula` y `correcciones_matricula`). Funciones puras.
 *
 * Las cuatro clases de solicitud viven en UNA tabla (`tipo`); el sistema las sigue mostrando como dos listas (`DropRequest` y `ChangeRequest`) porque
 * tienen datos propios (la caída, su fecha y su resumen de efectos; las demás, su `payload` y sus líneas de historial).
 *
 * Lo derivable no se guarda: el alumno de una solicitud sale de su matrícula. Quién y cuándo pidieron y resolvieron salen de la cuenta con la que se inició
 * sesión (los pone la base): al guardar no se mandan (`audit = false`); solo la carga de partida los lleva (`audit = true`).
 */
import type { ChangeRequest, DropEffects, DropRequest, EnrollmentChange } from '../context/DataContext';

export type SolicitudTipo = 'Caída' | ChangeRequest['kind'];

export interface SolicitudRow {
  id: string; tipo: SolicitudTipo; matricula_id: string; motivo: string; detalle: string; fecha_efecto: string | null; datos: Record<string, string>;
  estado: DropRequest['status']; resuelta_en: string | null; resuelta_por: string | null; nota_resolucion: string | null; efectos: DropEffects | string[] | null;
  creado_en?: string | null; creado_por?: string | null;
}

export interface CorreccionRow {
  id: string; matricula_id: string; campo: string; etiqueta: string; antes: string; despues: string; motivo: string;
  creado_en?: string | null; creado_por?: string | null;
}

const nul = <T>(v: T | undefined | null): T | null => (v === undefined || v === null || (v as unknown) === '' ? null : v);
/** El instante tal como lo guarda el sistema (`2026-09-21T15:30:00.000Z`); la API devuelve `+00:00`. */
const iso = (v: string | null | undefined): string | undefined => (v ? new Date(v).toISOString() : undefined);
const ymd = (v: string | null | undefined): string | undefined => (v ? String(v).slice(0, 10) : undefined);

// ------------------------------------------------------------------------------------------------------------------ Caídas

/** La fila de una solicitud de caída (con `audit`, también quién y cuándo pidió y resolvió, para la carga de partida: con sesión los pone la base). */
export function dropRequestToRow(r: DropRequest, audit = false): SolicitudRow {
  const row: SolicitudRow = {
    id: r.id, tipo: 'Caída', matricula_id: r.enrollmentId, motivo: r.reason, detalle: r.detail ?? '', fecha_efecto: r.effectiveDate, datos: {}, estado: r.status,
    resuelta_en: null, resuelta_por: null, nota_resolucion: nul(r.resolutionNote), efectos: r.effects ?? null,
  };
  if (audit) { row.resuelta_en = nul(r.resolvedAt); row.resuelta_por = nul(r.resolvedBy); row.creado_en = r.requestedAt; row.creado_por = r.requestedBy; }
  return row;
}

export function dropRequestFromRow(r: SolicitudRow, studentId?: string): DropRequest {
  const out: DropRequest = {
    id: r.id, enrollmentId: r.matricula_id, requestedAt: iso(r.creado_en) ?? '', requestedBy: r.creado_por ?? '', reason: r.motivo, detail: r.detalle ?? '',
    effectiveDate: ymd(r.fecha_efecto) ?? '', status: r.estado,
  };
  if (studentId) out.studentId = studentId;
  if (r.resuelta_en) out.resolvedAt = iso(r.resuelta_en);
  if (r.resuelta_por) out.resolvedBy = r.resuelta_por;
  if (r.nota_resolucion) out.resolutionNote = r.nota_resolucion;
  if (r.efectos && !Array.isArray(r.efectos)) out.effects = r.efectos;
  return out;
}

// ------------------------------------------------------------------------------------------------------------------ Reactivación, cambio de programa y traslado

export function changeRequestToRow(r: ChangeRequest, audit = false): SolicitudRow {
  const row: SolicitudRow = {
    id: r.id, tipo: r.kind, matricula_id: r.enrollmentId, motivo: r.reason, detalle: r.detail ?? '', fecha_efecto: null, datos: r.payload ?? {}, estado: r.status,
    resuelta_en: null, resuelta_por: null, nota_resolucion: nul(r.resolutionNote), efectos: r.effects ?? null,
  };
  if (audit) { row.resuelta_en = nul(r.resolvedAt); row.resuelta_por = nul(r.resolvedBy); row.creado_en = r.requestedAt; row.creado_por = r.requestedBy; }
  return row;
}

export function changeRequestFromRow(r: SolicitudRow, studentId?: string): ChangeRequest {
  const out: ChangeRequest = {
    id: r.id, kind: r.tipo as ChangeRequest['kind'], enrollmentId: r.matricula_id, requestedAt: iso(r.creado_en) ?? '', requestedBy: r.creado_por ?? '', reason: r.motivo,
    detail: r.detalle ?? '', payload: { ...(r.datos ?? {}) }, status: r.estado,
  };
  if (studentId) out.studentId = studentId;
  if (r.resuelta_en) out.resolvedAt = iso(r.resuelta_en);
  if (r.resuelta_por) out.resolvedBy = r.resuelta_por;
  if (r.nota_resolucion) out.resolutionNote = r.nota_resolucion;
  if (Array.isArray(r.efectos)) out.effects = [...r.efectos];
  return out;
}

// ------------------------------------------------------------------------------------------------------------------ Correcciones

export function correctionToRow(c: EnrollmentChange, audit = false): CorreccionRow {
  const row: CorreccionRow = { id: c.id, matricula_id: c.enrollmentId, campo: c.field, etiqueta: c.label, antes: c.from ?? '', despues: c.to ?? '', motivo: c.reason };
  if (audit) { row.creado_en = c.at; row.creado_por = c.by; }
  return row;
}

export const correctionFromRow = (r: CorreccionRow): EnrollmentChange => ({
  id: r.id, enrollmentId: r.matricula_id, at: iso(r.creado_en) ?? '', by: r.creado_por ?? '', field: r.campo, label: r.etiqueta, from: r.antes, to: r.despues, reason: r.motivo,
});

// ------------------------------------------------------------------------------------------------------------------ Las dos listas de solicitudes

/** Las filas de solicitudes, repartidas en caídas y cambios (con el alumno que sale de la matrícula de cada una). */
export function requestsFromRows(rows: SolicitudRow[], studentOf: (enrollmentId: string) => string | undefined): { dropRequests: DropRequest[]; changeRequests: ChangeRequest[] } {
  const dropRequests: DropRequest[] = [];
  const changeRequests: ChangeRequest[] = [];
  for (const r of rows) {
    if (r.tipo === 'Caída') dropRequests.push(dropRequestFromRow(r, studentOf(r.matricula_id)));
    else changeRequests.push(changeRequestFromRow(r, studentOf(r.matricula_id)));
  }
  return { dropRequests, changeRequests };
}

export const requestRowsFromState = (drops: DropRequest[], changes: ChangeRequest[], audit = false): SolicitudRow[] =>
  [...drops.map(d => dropRequestToRow(d, audit)), ...changes.map(c => changeRequestToRow(c, audit))];
