/**
 * Traducción entre la política de recordatorios de Psicopedagogía y los recordatorios registrados del sistema y las filas de la base (tablas
 * `psy_recordatorio_politicas` y `psy_recordatorios`), y de los errores de la base a mensajes claros. Funciones puras.
 *
 * La política es **una para todo el grupo** y se guarda **por versiones** (solo se agregan): la vigente es la de número más alto y, si nunca se guardó
 * ninguna, valen los valores de partida (`DEFAULT_PSY_POLICY`). Los recordatorios registrados solo se agregan; su clave (`PsyReminderLog.key`) la genera la base
 * con la misma fórmula que `psyReminderKey` (`utils/psyReminders.ts`) y así un mismo recordatorio no se registra dos veces.
 */
import type { PsyReminderLog, PsyReminderPolicy } from '../context/DataContext';
import { dbErrorMessage, type DbErrorLike } from './orgDirectory';
import { DEFAULT_PSY_POLICY } from './psyReminders';

/** Una versión guardada de la política de recordatorios (con quién y cuándo la guardó). */
export interface PsyPolicyVersion extends PsyReminderPolicy { version: number; createdAt: string; createdBy: string }

export interface PsyPoliticaRow {
  version: number; asesorias_antes: number[]; actividades_antes: number[]; vigencia_antes: number[]; creada_en: string; creada_por: string;
}
export interface PsyRecordatorioRow {
  id: string; tipo: PsyReminderLog['kind']; ref_id: string; alumno_id: string; etapa: number; clave: string; sede_id: string; registrado_en: string; registrado_por: string;
  canal: PsyReminderLog['channel']; resultado: PsyReminderLog['result']; nota: string | null;
}

export interface PsyReminderRows { psyPoliticas: PsyPoliticaRow[]; psyRecordatorios: PsyRecordatorioRow[] }
export const EMPTY_PSY_REMINDERS: PsyReminderRows = { psyPoliticas: [], psyRecordatorios: [] };

export const psyPolicyFromRow = (r: PsyPoliticaRow): PsyPolicyVersion => ({
  version: r.version, sessionBefore: [...r.asesorias_antes], activityBefore: [...r.actividades_antes], validityBefore: [...r.vigencia_antes], createdAt: r.creada_en, createdBy: r.creada_por,
});

export const psyReminderFromRow = (r: PsyRecordatorioRow): PsyReminderLog => ({
  id: r.id, key: r.clave, kind: r.tipo, refId: r.ref_id, studentId: r.alumno_id, offset: r.etapa, at: r.registrado_en, by: r.registrado_por,
  channel: r.canal, result: r.resultado, ...(r.nota ? { note: r.nota } : {}),
});

/** La versión de número más alto (la vigente), o nada si no hay ninguna. */
const latest = (versions: PsyPolicyVersion[]): PsyPolicyVersion | undefined => versions.reduce<PsyPolicyVersion | undefined>((a, v) => (!a || v.version > a.version ? v : a), undefined);

/** La política vigente: la última versión guardada o, si nunca se guardó una, la de partida. Sin los datos de quién y cuándo. */
export function currentPsyPolicy(versions: PsyPolicyVersion[]): PsyReminderPolicy {
  const v = latest(versions);
  return v ? { sessionBefore: [...v.sessionBefore], activityBefore: [...v.activityBefore], validityBefore: [...v.validityBefore] } : DEFAULT_PSY_POLICY;
}

/** Los recordatorios registrados, el más reciente primero. */
export const sortPsyReminders = (logs: PsyReminderLog[]): PsyReminderLog[] => [...logs].sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id));

/** Mensaje claro para un error de la base en la política y los recordatorios. Los avisos de las funciones propias (código EN001) ya vienen en español. */
export function psyRemindersErrorMessage(e: DbErrorLike | null | undefined): string {
  if (!e) return 'No se pudo guardar. Intente de nuevo.';
  const t = `${e.message ?? ''} ${e.details ?? ''}`.toLowerCase();
  if (e.code === '23505' && t.includes('psy_recordatorios_clave_uq')) return 'Este recordatorio ya fue registrado.';
  if (e.code === '23505') return 'Otra persona guardó algo al mismo tiempo. Actualice la página e intente de nuevo.';
  if (e.code === '23503') return 'Algo de lo que se nombra ya no existe (el alumno o la sede). Actualice la página e intente de nuevo.';
  if (e.code === '40P01') return 'Otra persona estaba guardando lo mismo en ese instante. Intente de nuevo.';
  return dbErrorMessage(e);
}
