/**
 * Operaciones de la política de cobranza, los recordatorios registrados y la plantilla del contrato sobre la base de datos: validan con las reglas puras
 * (`utils/collections.ts`, `utils/enrollmentDocuments.ts`) y luego guardan. La política es **una para todo el grupo** y la plantilla **una sola**; las dos
 * se guardan por versiones (solo se agregan) y la vigente es la más alta.
 *
 * Reciben el repositorio como parámetro (el de Supabase en el sistema, uno en memoria en `scripts/check-collection-db.ts`), de modo que el orden
 * «validar → guardar → traducir el error» se puede comprobar sin conexión. Ninguna toca el estado de React: quien llama (el gancho `useCollectionConfig`)
 * vuelve a leer de la base lo que cambió. La base vuelve a comprobar todo (rangos de la política, etapa vigente y cuota con saldo del recordatorio, campos
 * y cláusulas de la plantilla) y calcula quién y cuándo (el nombre sale de la cuenta, no de la pantalla).
 */
import type { ContractTemplate } from '../context/DataContext';
import { parsePolicy, validatePolicy, validateReminderLog, type CollectionPolicy, type Reminder, type ReminderLog } from '../utils/collections';
import type { PolicyVersion } from '../utils/collectionConfigDb';
import { validateTemplate } from '../utils/enrollmentDocuments';
import type { OpResult, RepoResult } from './orgDirectory';

export interface CollectionConfigData { policies: PolicyVersion[]; reminders: ReminderLog[]; templates: ContractTemplate[] }

/** Un recordatorio tal como lo guarda la base: la sede, quién y cuándo los pone ella. */
export interface ReminderRequest { planId: string; installmentId: string; stageOffset: number; channel: ReminderLog['channel']; result: ReminderLog['result']; note: string }
/** El texto de la plantilla que se guarda (la versión, quién y cuándo los pone la base). */
export type TemplateInput = Pick<ContractTemplate, 'intro' | 'clauses' | 'closing' | 'reviewed'>;
/** La política tal como se escribe en la pantalla (texto). */
export interface PolicyForm { graceDays: string; moraMonthlyRatePct: string; remindBefore: string; remindAfter: string }

export interface CollectionConfigRepository {
  loadAll(): Promise<RepoResult<CollectionConfigData>>;
  /** Guarda la política (una versión nueva si cambió) y devuelve el número de la vigente. */
  savePolicy(policy: CollectionPolicy): Promise<RepoResult<number>>;
  /** Registra un recordatorio y devuelve su código. */
  addReminder(r: ReminderRequest): Promise<RepoResult<string>>;
  /** Guarda el texto del contrato (una versión nueva si cambió el texto) y devuelve el número de la vigente. */
  saveTemplate(t: TemplateInput): Promise<RepoResult<number>>;
}

const fail = (error: string): OpResult<never> => ({ ok: false, error });

/** Lee de la base las versiones de la política, los recordatorios y las versiones de la plantilla. Se lee al iniciar sesión (`AccessGate`). */
export async function loadCollectionConfig(repo: CollectionConfigRepository): Promise<OpResult<CollectionConfigData>> {
  const res = await repo.loadAll();
  return res.ok && res.data ? { ok: true, value: res.data } : fail(res.error ?? 'No se pudieron cargar la política de cobranza, los recordatorios y la plantilla del contrato.');
}

// ------------------------------------------------------------------------------------------------------------------ Política

/** Guarda la política de cobranza del grupo (días de gracia, mora y etapas de recordatorio). */
export async function savePolicyVersion(repo: CollectionConfigRepository, form: PolicyForm): Promise<OpResult> {
  const problems = validatePolicy(form);
  if (problems.length > 0) return fail(problems[0]!);
  const res = await repo.savePolicy(parsePolicy(form));
  return res.ok ? { ok: true } : fail(res.error ?? 'No se pudo guardar la política de cobranza.');
}

// ------------------------------------------------------------------------------------------------------------------ Recordatorios

/** Registra que un recordatorio se envió o se omitió (quién y cuándo los pone la base). Un mismo recordatorio no se registra dos veces. */
export async function logReminderEntry(
  repo: CollectionConfigRepository, logs: Pick<ReminderLog, 'key'>[], reminder: Pick<Reminder, 'key' | 'planId' | 'installmentId' | 'stage'>,
  channel: ReminderLog['channel'], result: ReminderLog['result'], note: string,
): Promise<OpResult> {
  const problems = validateReminderLog(reminder, channel, result, note, logs);
  if (problems.length > 0) return fail(problems[0]!);
  const res = await repo.addReminder({ planId: reminder.planId, installmentId: reminder.installmentId, stageOffset: reminder.stage.offset, channel, result, note: note.trim() });
  return res.ok ? { ok: true } : fail(res.error ?? 'No se pudo registrar el recordatorio.');
}

// ------------------------------------------------------------------------------------------------------------------ Plantilla

/**
 * Guarda el texto del contrato. Si el texto cambió se guarda como una versión nueva (los contratos ya generados conservan la suya); si solo cambió la marca
 * de «revisada por el área legal», se anota en la vigente. Si no cambió nada, no se llama a la base.
 */
export async function saveContractTemplate(repo: CollectionConfigRepository, current: ContractTemplate, input: TemplateInput): Promise<OpResult> {
  const problems = validateTemplate({ ...input, version: current.version });
  if (problems.length > 0) return fail(problems[0]!);
  const sameText = JSON.stringify([input.intro, input.clauses, input.closing]) === JSON.stringify([current.intro, current.clauses, current.closing]);
  if (sameText && input.reviewed === current.reviewed) return { ok: true };
  const res = await repo.saveTemplate(input);
  return res.ok ? { ok: true } : fail(res.error ?? 'No se pudo guardar la plantilla del contrato.');
}
