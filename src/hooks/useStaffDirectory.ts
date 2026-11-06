import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Assignment, Staff } from '../context/DataContext';
import { supabase } from '../lib/supabase';
import type { OpResult } from '../services/orgDirectory';
import {
  closeAssignment as closeAssignmentIn, createStaff, editStaff, inactivateStaff as inactivateStaffIn, reactivateStaff as reactivateStaffIn,
  saveAssignment as saveAssignmentIn, type InactivateResult,
} from '../services/staffDirectory';
import { createSupabaseStaffRepository } from '../services/staffRepository';
import type { AssignmentForm, Place } from '../utils/assignments';
import type { InactivationContext } from '../utils/staffStatus';

export type StaffDirectoryStatus = 'loading' | 'ready' | 'error';

/**
 * Personal y Asignaciones guardados en la base de datos: los carga cuando ya están las sedes y los almacenes (el nombre del lugar sale de
 * ellos) y los mantiene al día con cada operación. Las reglas y el orden «validar → guardar» están en `services/staffDirectory.ts`; aquí
 * solo se guarda el estado de React.
 *
 * Lo que la base cambia por su cuenta al guardar (nombre, sedes y almacén de la cuenta de la persona, o su desactivación al darla de baja)
 * se avisa con `onAccountsChanged`, para que el sistema vuelva a leer las cuentas y muestre lo que de verdad quedó.
 */
export function useStaffDirectory(places: Place[], ready: boolean, onAccountsChanged: () => Promise<void>) {
  const repo = useMemo(() => createSupabaseStaffRepository(supabase), []);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [rawAssignments, setRawAssignments] = useState<Assignment[]>([]);
  const [status, setStatus] = useState<StaffDirectoryStatus>('loading');
  const [error, setError] = useState('');

  const placesRef = useRef(places);
  placesRef.current = places;
  // El nombre del lugar se calcula al mostrar: si se renombra una sede, todas las asignaciones lo muestran corregido.
  const assignments = useMemo(
    () => rawAssignments.map(a => ({ ...a, branch: places.find(p => p.id === a.placeId)?.name ?? a.branch })),
    [rawAssignments, places],
  );
  const staffRef = useRef(staff);
  staffRef.current = staff;
  const assignmentsRef = useRef<Assignment[]>([]);
  assignmentsRef.current = assignments;

  const reload = useCallback(async () => {
    setStatus('loading');
    setError('');
    const [s, a] = await Promise.all([repo.listStaff(), repo.listAssignments(placesRef.current)]);
    if (!s.ok || !a.ok) {
      setError(s.error ?? a.error ?? 'No se pudo cargar el personal.');
      setStatus('error');
      return;
    }
    setStaff(s.data ?? []);
    setRawAssignments(a.data ?? []);
    setStatus('ready');
  }, [repo]);

  useEffect(() => { if (ready) void reload(); }, [ready, reload]);

  /** Vuelve a leer las asignaciones (una operación puede haber cambiado la principal de otras) y las cuentas. */
  const refreshAfterChange = useCallback(async () => {
    const a = await repo.listAssignments(placesRef.current);
    if (a.ok) setRawAssignments(a.data ?? []);
    await onAccountsChanged();
  }, [repo, onAccountsChanged]);

  const addStaff = useCallback(async (input: Omit<Staff, 'id' | 'code'>): Promise<OpResult<Staff>> => {
    const res = await createStaff(repo, staffRef.current, input);
    if (res.ok && res.value) setStaff(prev => [...prev, res.value!].sort((a, b) => a.id.localeCompare(b.id)));
    return res;
  }, [repo]);

  const updateStaff = useCallback(async (id: string, patch: Partial<Staff>): Promise<OpResult<Staff>> => {
    const res = await editStaff(repo, staffRef.current, id, patch);
    if (res.ok && res.value) {
      setStaff(prev => prev.map(s => (s.id === id ? res.value! : s)));
      await onAccountsChanged();
    }
    return res;
  }, [repo, onAccountsChanged]);

  const inactivateStaff = useCallback(async (
    id: string, input: { reason: string; detail: string; date: string }, by: string, ctx: InactivationContext, hasActiveAccount: boolean,
  ): Promise<OpResult<InactivateResult>> => {
    const res = await inactivateStaffIn(repo, staffRef.current, assignmentsRef.current, id, input, by, ctx, hasActiveAccount);
    if (res.ok) {
      await reload();
      await onAccountsChanged();
    }
    return res;
  }, [repo, reload, onAccountsChanged]);

  const reactivateStaff = useCallback(async (id: string, detail: string, today: string): Promise<OpResult<Staff>> => {
    const res = await reactivateStaffIn(repo, staffRef.current, id, detail, today);
    if (res.ok && res.value) setStaff(prev => prev.map(s => (s.id === id ? res.value! : s)));
    return res;
  }, [repo]);

  const saveAssignment = useCallback(async (form: AssignmentForm, today: string, editingId?: string): Promise<OpResult> => {
    const res = await saveAssignmentIn(repo, assignmentsRef.current, staffRef.current, placesRef.current, form, today, editingId);
    if (res.ok) await refreshAfterChange();
    return { ok: res.ok, error: res.error };
  }, [repo, refreshAfterChange]);

  const closeAssignment = useCallback(async (
    id: string, date: string, reason: string, by: string, today: string, impactCtx: Parameters<typeof closeAssignmentIn>[9],
  ): Promise<OpResult> => {
    const res = await closeAssignmentIn(repo, assignmentsRef.current, staffRef.current, placesRef.current, id, date, reason, by, today, impactCtx);
    if (res.ok) await refreshAfterChange();
    return { ok: res.ok, error: res.error };
  }, [repo, refreshAfterChange]);

  return { staff, assignments, status, error, reload, addStaff, updateStaff, inactivateStaff, reactivateStaff, saveAssignment, closeAssignment };
}
