import { useCallback, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  applyActivities, applyAgenda, applyCapacity, logPsyReminderEntry, refreshActivities, refreshAgenda, refreshPsyReminders, savePsyPolicyVersion,
  type ActivitiesFresh, type ActivitiesPayload, type AgendaPayload,
} from '../services/agenda';
import { createSupabaseAgendaRepository } from '../services/agendaRepository';
import type { OpResult } from '../services/orgDirectory';
import { replaceCronogramas } from '../utils/activitiesDb';
import { agendaFromRows, capacityChanges, mergeAgendaRows, type AgendaLists, type AgendaRows, type AgendaState } from '../utils/agendaDb';
import type { CapacityConfig, PsyReminderLog, PsyReminderPolicy } from '../context/DataContext';
import type { PsyReminder } from '../utils/psyReminders';

/**
 * La agenda de Psicopedagogía (asesorías, historial, seguimiento, cupos, cronogramas mensuales y actividades especiales) guardada en la base de datos: arranca con lo que
 * `AccessGate` leyó al iniciar sesión y, después de CADA operación, vuelve a leer las filas tocadas, así lo que se muestra es lo que de verdad quedó guardado (con los
 * códigos que asignó la base). Las pantallas y las reglas ven la agenda con los nombres derivados (alumno, programa, responsable, sede): salen de las listas al mostrar,
 * nunca se guardan.
 *
 * Las operaciones de la agenda se aplican con `apply` (asesorías) y `applyActivities` (cronogramas y actividades): todo o nada, con la función del registro de esa
 * acción. Lo que la agenda cambia dentro de una operación del dinero (la primera asesoría, las cancelaciones, las inscripciones que salen) viaja con ella (`useMoney`) y
 * aquí solo se vuelve a leer con `refreshFor` y `refreshActivitiesFor`. Cada operación devuelve `{ ok, error }` como las demás acciones del contexto (nunca lanza).
 */
export function useAgenda(initial: AgendaRows, lists: AgendaLists) {
  const repo = useMemo(() => createSupabaseAgendaRepository(supabase), []);
  const [rows, setRows] = useState<AgendaRows>(initial);
  const rowsRef = useRef(rows); rowsRef.current = rows;

  const { students, enrollments, staff, branches } = lists;
  const state: AgendaState = useMemo(() => agendaFromRows(rows, { students, enrollments, staff, branches }), [rows, students, enrollments, staff, branches]);
  const stateRef = useRef(state); stateRef.current = state;

  const merge = useCallback((fresh: Partial<AgendaRows>) => {
    const merged = mergeAgendaRows(rowsRef.current, fresh);
    rowsRef.current = merged; setRows(merged);
  }, []);

  /** Los cronogramas que se acaban de volver a leer reemplazan a los que había (una actividad, un inscrito o un cronograma pueden haber desaparecido); el historial se suma. */
  const mergeActivities = useCallback((ids: string[], fresh: ActivitiesFresh) => {
    const replaced = replaceCronogramas(rowsRef.current, ids, fresh);
    const merged = mergeAgendaRows({ ...rowsRef.current, ...replaced }, { eventos: fresh.eventos });
    const next: AgendaRows = { ...merged, cronogramas: replaced.cronogramas, actividades: replaced.actividades, inscripciones: replaced.inscripciones };
    rowsRef.current = next; setRows(next);
  }, []);

  /** Aplica una acción de la agenda. Devuelve los códigos que asignó la base («borrador → código real»). */
  const apply = useCallback(async (action: string, payload: AgendaPayload): Promise<OpResult<{ codes: Record<string, string> }>> => {
    const res = await applyAgenda(repo, action, payload);
    if (!res.ok || !res.value) return { ok: false, error: res.error };
    merge(res.value.fresh);
    return { ok: true, value: { codes: res.value.codes } };
  }, [repo, merge]);

  /** Aplica una acción de las actividades (`touched` = los cronogramas que toca) y vuelve a leerlos completos. Devuelve los códigos que asignó la base. */
  const applyActivity = useCallback(async (action: string, payload: ActivitiesPayload, touched: string[]): Promise<OpResult<{ codes: Record<string, string> }>> => {
    const res = await applyActivities(repo, action, payload, touched);
    if (!res.ok || !res.value) return { ok: false, error: res.error };
    mergeActivities(res.value.touched, res.value.fresh);
    return { ok: true, value: { codes: res.value.codes } };
  }, [repo, mergeActivities]);

  /** Vuelve a leer las asesorías tocadas por una operación del dinero (sus códigos ya son los reales). */
  const refreshFor = useCallback(async (scheduleIds: string[]): Promise<OpResult> => {
    const res = await refreshAgenda(repo, scheduleIds);
    if (!res.ok || !res.value) return { ok: false, error: res.error };
    merge(res.value);
    return { ok: true };
  }, [repo, merge]);

  /** Vuelve a leer los cronogramas tocados por una operación del dinero (la caída o el traslado sacan al alumno de sus actividades). */
  const refreshActivitiesFor = useCallback(async (cronogramaIds: string[]): Promise<OpResult> => {
    const res = await refreshActivities(repo, cronogramaIds);
    if (!res.ok || !res.value) return { ok: false, error: res.error };
    mergeActivities(cronogramaIds, res.value);
    return { ok: true };
  }, [repo, mergeActivities]);

  /** Vuelve a leer la política de recordatorios y los recordatorios registrados (son pocas filas). Si la lectura falla, se queda lo que había: la operación ya se guardó. */
  const refreshPsy = useCallback(async () => {
    const res = await refreshPsyReminders(repo);
    if (res.ok && res.value) merge(res.value);
  }, [repo, merge]);

  /** Guarda la política de recordatorios de Psicopedagogía (una para todo el grupo; una versión nueva si cambió). */
  const savePsyPolicy = useCallback(async (policy: PsyReminderPolicy): Promise<OpResult> => {
    const res = await savePsyPolicyVersion(repo, policy);
    if (res.ok) await refreshPsy();
    return res;
  }, [repo, refreshPsy]);

  /** Registra un recordatorio de Psicopedagogía enviado u omitido; valida contra lo último que se vio. */
  const logPsyReminder = useCallback(
    async (reminder: Pick<PsyReminder, 'key' | 'kind' | 'refId' | 'studentId' | 'offset'>, channel: PsyReminderLog['channel'], result: PsyReminderLog['result'], note: string): Promise<OpResult> => {
      const res = await logPsyReminderEntry(repo, stateRef.current.psyReminderLogs, reminder, channel, result, note);
      if (res.ok) await refreshPsy();
      return res;
    }, [repo, refreshPsy]);

  /** Guarda lo que cambió en los cupos y vuelve a leerlos. */
  const saveCapacity = useCallback(async (next: CapacityConfig): Promise<OpResult> => {
    const changes = capacityChanges(stateRef.current.capacityConfig, next);
    const res = await applyCapacity(repo, changes);
    if (!res.ok) return res;
    const all = await repo.loadAll();
    if (all.ok && all.data) merge({ capacidad: all.data.capacidad });
    return { ok: true };
  }, [repo, merge]);

  return { ...state, apply, applyActivity, refreshFor, refreshActivitiesFor, saveCapacity, savePsyPolicy, logPsyReminder, current: () => stateRef.current };
}
