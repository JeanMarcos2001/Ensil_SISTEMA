import { useCallback, useMemo, useRef, useState } from 'react';
import type { ContractTemplate } from '../context/DataContext';
import { supabase } from '../lib/supabase';
import {
  logReminderEntry, saveContractTemplate, savePolicyVersion, type CollectionConfigData, type PolicyForm, type TemplateInput,
} from '../services/collectionConfig';
import { createSupabaseCollectionConfigRepository } from '../services/collectionConfigRepository';
import type { OpResult } from '../services/orgDirectory';
import type { Reminder, ReminderLog } from '../utils/collections';
import { currentPolicy, currentTemplate, type PolicyVersion } from '../utils/collectionConfigDb';

/**
 * La política de cobranza (una para todo el grupo), los recordatorios registrados y la plantilla del contrato guardados en la base de datos: arranca con
 * lo que `AccessGate` leyó al iniciar sesión y, después de CADA operación, vuelve a leer de la base, así lo que se muestra es lo que de verdad quedó
 * guardado (con el número de versión y el código que asignó, y quién y cuándo). La política y la plantilla se guardan por versiones: la vigente es la de
 * número más alto, y sin ninguna guardada valen los valores de partida. Las reglas y el orden «validar → guardar» están en `services/collectionConfig.ts`;
 * aquí solo se guarda el estado de React. Cada operación devuelve `{ ok, error }` como las demás acciones del contexto (nunca lanza).
 */
export function useCollectionConfig(initial: CollectionConfigData) {
  const repo = useMemo(() => createSupabaseCollectionConfigRepository(supabase), []);
  const [policies, setPolicies] = useState<PolicyVersion[]>(initial.policies);
  const [reminders, setReminders] = useState<ReminderLog[]>(initial.reminders);
  const [templates, setTemplates] = useState<ContractTemplate[]>(initial.templates);

  // Las operaciones validan contra lo último que se vio (no contra la lista de cuando se creó la función).
  const remindersRef = useRef(reminders); remindersRef.current = reminders;
  const templatesRef = useRef(templates); templatesRef.current = templates;

  const policy = useMemo(() => currentPolicy(policies), [policies]);
  const template = useMemo(() => currentTemplate(templates), [templates]);

  /** Vuelve a leer todo (son pocas filas). Si la lectura falla, se queda lo que había: la operación ya se guardó. */
  const refresh = useCallback(async () => {
    const res = await repo.loadAll();
    if (!res.ok || !res.data) return;
    setPolicies(res.data.policies); setReminders(res.data.reminders); setTemplates(res.data.templates);
  }, [repo]);

  const settle = useCallback(async <T,>(res: OpResult<T>): Promise<OpResult<T>> => {
    if (res.ok) await refresh();
    return res;
  }, [refresh]);

  const savePolicy = useCallback(async (form: PolicyForm): Promise<OpResult> => settle(await savePolicyVersion(repo, form)), [repo, settle]);
  const logReminder = useCallback(
    async (reminder: Pick<Reminder, 'key' | 'planId' | 'installmentId' | 'stage'>, channel: ReminderLog['channel'], result: ReminderLog['result'], note: string): Promise<OpResult> =>
      settle(await logReminderEntry(repo, remindersRef.current, reminder, channel, result, note)),
    [repo, settle],
  );
  const saveTemplate = useCallback(async (input: TemplateInput): Promise<OpResult> => settle(await saveContractTemplate(repo, currentTemplate(templatesRef.current), input)), [repo, settle]);

  return { policy, policies, reminders, template, templates, refresh, savePolicy, logReminder, saveTemplate };
}
