import { useCallback, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { applyAgenda, applyCapacity, refreshAgenda, type AgendaPayload } from '../services/agenda';
import { createSupabaseAgendaRepository } from '../services/agendaRepository';
import type { OpResult } from '../services/orgDirectory';
import { agendaFromRows, capacityChanges, mergeAgendaRows, type AgendaLists, type AgendaRows, type AgendaState } from '../utils/agendaDb';
import type { CapacityConfig } from '../context/DataContext';

/**
 * La agenda de Psicopedagogía (asesorías, historial, seguimiento y cupos) guardada en la base de datos: arranca con lo que `AccessGate` leyó al iniciar sesión y,
 * después de CADA operación, vuelve a leer las filas tocadas, así lo que se muestra es lo que de verdad quedó guardado (con los códigos que asignó la base). Las
 * pantallas y las reglas ven la agenda con los nombres derivados (alumno, programa, responsable): salen de las listas al mostrar, nunca se guardan.
 *
 * Las operaciones de la agenda se aplican con `apply` (todo o nada, con la función del registro de esa acción). Lo que la agenda cambia dentro de una operación
 * del dinero (la primera asesoría, las cancelaciones) viaja con ella (`useMoney`) y aquí solo se vuelve a leer con `refreshFor`.
 * Cada operación devuelve `{ ok, error }` como las demás acciones del contexto (nunca lanza).
 */
export function useAgenda(initial: AgendaRows, lists: AgendaLists) {
  const repo = useMemo(() => createSupabaseAgendaRepository(supabase), []);
  const [rows, setRows] = useState<AgendaRows>(initial);
  const rowsRef = useRef(rows); rowsRef.current = rows;

  const { students, enrollments, staff } = lists;
  const state: AgendaState = useMemo(() => agendaFromRows(rows, { students, enrollments, staff }), [rows, students, enrollments, staff]);
  const stateRef = useRef(state); stateRef.current = state;

  const merge = useCallback((fresh: Partial<AgendaRows>) => {
    const merged = mergeAgendaRows(rowsRef.current, fresh);
    rowsRef.current = merged; setRows(merged);
  }, []);

  /** Aplica una acción de la agenda. Devuelve los códigos que asignó la base («borrador → código real»). */
  const apply = useCallback(async (action: string, payload: AgendaPayload): Promise<OpResult<{ codes: Record<string, string> }>> => {
    const res = await applyAgenda(repo, action, payload);
    if (!res.ok || !res.value) return { ok: false, error: res.error };
    merge(res.value.fresh);
    return { ok: true, value: { codes: res.value.codes } };
  }, [repo, merge]);

  /** Vuelve a leer las asesorías tocadas por una operación del dinero (sus códigos ya son los reales). */
  const refreshFor = useCallback(async (scheduleIds: string[]): Promise<OpResult> => {
    const res = await refreshAgenda(repo, scheduleIds);
    if (!res.ok || !res.value) return { ok: false, error: res.error };
    merge(res.value);
    return { ok: true };
  }, [repo, merge]);

  /** Guarda lo que cambió en los cupos y vuelve a leerlos. */
  const saveCapacity = useCallback(async (next: CapacityConfig): Promise<OpResult> => {
    const changes = capacityChanges(stateRef.current.capacityConfig, next);
    const res = await applyCapacity(repo, changes);
    if (!res.ok) return res;
    const all = await repo.loadAll();
    if (all.ok && all.data) merge({ capacidad: all.data.capacidad });
    return { ok: true };
  }, [repo, merge]);

  return { ...state, apply, refreshFor, saveCapacity, current: () => stateRef.current };
}
