/**
 * Traducción entre la política de cobranza, los recordatorios registrados y la plantilla del contrato del sistema y las filas de la base (tablas
 * `cobranza_politicas`, `recordatorios_cobranza` y `plantilla_contrato_versiones`), y de los errores de la base a mensajes claros. Funciones puras.
 *
 * La política y la plantilla se guardan **por versiones** (solo se agregan): la vigente es la de número más alto y, si nunca se guardó ninguna, valen
 * los valores de partida (`DEFAULT_POLICY` y `DEFAULT_CONTRACT_TEMPLATE`, versión 1). Cada contrato conserva la versión de la plantilla con la que se
 * generó (`IssuedDocument.templateVersion`): `templateForIssued` devuelve ESA versión para volver a armarlo igual que cuando se firmó.
 */
import type { ContractTemplate, IssuedDocument } from '../context/DataContext';
import { DEFAULT_POLICY, type CollectionPolicy, type ReminderLog } from './collections';
import { DEFAULT_CONTRACT_TEMPLATE } from './enrollmentDocuments';
import { dbErrorMessage, type DbErrorLike } from './orgDirectory';

/** Una versión guardada de la política de cobranza (con quién y cuándo la guardó). */
export interface PolicyVersion extends CollectionPolicy { version: number; createdAt: string; createdBy: string }

export interface PoliticaRow {
  version: number; dias_gracia: number; tasa_mora: number | string; recordar_antes: number[]; recordar_despues: number[]; creada_en: string; creada_por: string;
}
export interface RecordatorioRow {
  id: string; plan_id: string; cuota_id: string; desfase: number; clave: string; sede_id: string; registrado_en: string; registrado_por: string;
  canal: ReminderLog['channel']; resultado: ReminderLog['result']; nota: string | null;
}
export interface PlantillaRow {
  version: number; introduccion: string; clausulas: { id: string; title: string; body: string }[]; cierre: string; revisada: boolean;
  revisada_por: string | null; revisada_en: string | null; creada_en: string; creada_por: string;
}

export const policyFromRow = (r: PoliticaRow): PolicyVersion => ({
  version: r.version, graceDays: r.dias_gracia, moraMonthlyRate: Number(r.tasa_mora), remindBefore: [...r.recordar_antes], remindAfter: [...r.recordar_despues],
  createdAt: r.creada_en, createdBy: r.creada_por,
});

export const reminderFromRow = (r: RecordatorioRow): ReminderLog => ({
  id: r.id, key: r.clave, planId: r.plan_id, installmentId: r.cuota_id, stageOffset: r.desfase, at: r.registrado_en, by: r.registrado_por,
  channel: r.canal, result: r.resultado, ...(r.nota ? { note: r.nota } : {}),
});

export const templateFromRow = (r: PlantillaRow): ContractTemplate => ({
  version: r.version, reviewed: r.revisada, intro: r.introduccion, clauses: r.clausulas.map(c => ({ id: c.id, title: c.title, body: c.body })), closing: r.cierre,
  updatedAt: r.revisada_en ?? r.creada_en, updatedBy: r.revisada_por ?? r.creada_por,
});

/** La versión de número más alto (la vigente), o nada si no hay ninguna. */
const latest = <T extends { version: number }>(versions: T[]): T | undefined => versions.reduce<T | undefined>((a, v) => (!a || v.version > a.version ? v : a), undefined);

/** La política vigente: la última versión guardada o, si nunca se guardó una, la de partida. Sin los datos de quién y cuándo. */
export function currentPolicy(versions: PolicyVersion[]): CollectionPolicy {
  const v = latest(versions);
  return v ? { graceDays: v.graceDays, moraMonthlyRate: v.moraMonthlyRate, remindBefore: [...v.remindBefore], remindAfter: [...v.remindAfter] } : DEFAULT_POLICY;
}

/** La plantilla vigente: la última versión guardada o, si nunca se guardó una, el texto modelo. */
export const currentTemplate = (versions: ContractTemplate[]): ContractTemplate => latest(versions) ?? DEFAULT_CONTRACT_TEMPLATE;

/**
 * La plantilla con la que se arma un contrato ya generado: la versión con la que se generó (así no cambia aunque la plantilla se edite después).
 * Sin contrato generado, o si esa versión no está (un contrato anterior a este registro), la vigente.
 */
export function templateForIssued(versions: ContractTemplate[], issued: Pick<IssuedDocument, 'templateVersion'> | undefined, current: ContractTemplate): ContractTemplate {
  if (!issued?.templateVersion) return current;
  return versions.find(t => t.version === issued.templateVersion) ?? current;
}

/** Mensaje claro para un error de la base en la política, los recordatorios y la plantilla. Los avisos de las funciones propias (código EN001) ya vienen en español. */
export function collectionConfigErrorMessage(e: DbErrorLike | null | undefined): string {
  if (!e) return 'No se pudo guardar. Intente de nuevo.';
  const t = `${e.message ?? ''} ${e.details ?? ''}`.toLowerCase();
  if (e.code === '23505' && t.includes('recordatorios_clave_uq')) return 'Este recordatorio ya fue registrado.';
  if (e.code === '23505') return 'Otra persona guardó algo al mismo tiempo. Actualice la página e intente de nuevo.';
  if (e.code === '23503') return 'El plan ya no existe. Actualice la página e intente de nuevo.';
  if (e.code === '40P01') return 'Otra persona estaba guardando lo mismo en ese instante. Intente de nuevo.';
  return dbErrorMessage(e);
}
