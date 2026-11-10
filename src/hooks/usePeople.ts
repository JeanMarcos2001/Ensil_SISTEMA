import { useCallback, useMemo, useRef, useState } from 'react';
import type { Guardian, Student } from '../context/DataContext';
import { supabase } from '../lib/supabase';
import {
  changeGuardian, changeStudent, createGuardian, createStudent, deleteGuardian, deleteStudent, loadPeople, savePeopleForEnrollment,
  type PeopleContext, type PeopleData,
} from '../services/people';
import { createSupabasePeopleRepository } from '../services/peopleRepository';
import type { OpResult } from '../services/orgDirectory';
import type { CreatedPeople, PeoplePayload } from '../utils/enrollmentPeople';
import { numberOfId } from '../utils/peopleDb';
import { todayLocalISO } from '../utils/schedule';

const sortById = <T extends { id: string }>(list: T[]): T[] => [...list].sort((a, b) => numberOfId(a.id) - numberOfId(b.id));
/** Pone en la lista lo recién leído: reemplaza la fila si ya estaba (mismo código) y agrega la que es nueva. */
const merge = <T extends { id: string }>(list: T[], fresh: T[]): T[] =>
  sortById([...list.filter(x => !fresh.some(f => f.id === x.id)), ...fresh]);

/**
 * Titulares y alumnos guardados en la base de datos: arranca con lo que `AccessGate` leyó al iniciar sesión y se mantiene al día con cada
 * operación (después de guardar se vuelve a leer la fila, así se muestra lo que de verdad quedó). Las reglas y el orden «validar → guardar → releer»
 * están en `services/people.ts`; aquí solo se guarda el estado de React. Cada operación devuelve `{ ok, error }` como las demás acciones del
 * contexto (nunca lanza).
 */
export function usePeople(initial: PeopleData) {
  const repo = useMemo(() => createSupabasePeopleRepository(supabase), []);
  const [guardians, setGuardians] = useState<Guardian[]>(initial.guardians);
  const [students, setStudents] = useState<Student[]>(initial.students);

  // Las operaciones validan contra lo último que se vio (no contra la lista de cuando se creó la función).
  const guardiansRef = useRef(guardians); guardiansRef.current = guardians;
  const studentsRef = useRef(students); studentsRef.current = students;
  const context = (): PeopleContext => ({ guardians: guardiansRef.current, students: studentsRef.current, today: todayLocalISO() });

  const reload = useCallback(async (): Promise<OpResult> => {
    const res = await loadPeople(repo);
    if (!res.ok || !res.value) return { ok: false, error: res.error };
    setGuardians(res.value.guardians); setStudents(res.value.students);
    return { ok: true };
  }, [repo]);

  const addGuardian = useCallback(async (data: Omit<Guardian, 'id'>): Promise<OpResult<Guardian>> => {
    const res = await createGuardian(repo, context(), data);
    if (res.ok && res.value) { const saved = res.value; setGuardians(prev => merge(prev, [saved])); }
    return res;
  }, [repo]);

  const addStudent = useCallback(async (data: Omit<Student, 'id'>): Promise<OpResult<Student>> => {
    const res = await createStudent(repo, context(), data);
    if (res.ok && res.value) { const saved = res.value; setStudents(prev => merge(prev, [saved])); }
    return res;
  }, [repo]);

  const updateGuardian = useCallback(async (id: string, patch: Partial<Guardian>): Promise<OpResult<Guardian>> => {
    const res = await changeGuardian(repo, context(), id, patch);
    if (res.ok && res.value) { const saved = res.value; setGuardians(prev => merge(prev, [saved])); }
    return res;
  }, [repo]);

  const updateStudent = useCallback(async (id: string, patch: Partial<Student>): Promise<OpResult<Student>> => {
    const res = await changeStudent(repo, context(), id, patch);
    if (res.ok && res.value) { const saved = res.value; setStudents(prev => merge(prev, [saved])); }
    return res;
  }, [repo]);

  const removeGuardian = useCallback(async (id: string): Promise<OpResult> => {
    const res = await deleteGuardian(repo, context(), id);
    if (res.ok) setGuardians(prev => prev.filter(g => g.id !== id));
    return res;
  }, [repo]);

  const removeStudent = useCallback(async (id: string): Promise<OpResult> => {
    const res = await deleteStudent(repo, context(), id);
    if (res.ok) setStudents(prev => prev.filter(s => s.id !== id));
    return res;
  }, [repo]);

  /** Guarda las personas de un registro de matrícula (todo o nada) y devuelve el código de cada una y las listas ya al día. */
  const saveForEnrollment = useCallback(async (payload: PeoplePayload): Promise<OpResult<{ created: CreatedPeople; guardians: Guardian[]; students: Student[] }>> => {
    const res = await savePeopleForEnrollment(repo, payload);
    if (!res.ok || !res.value) return { ok: false, error: res.error };
    const { created, fresh } = res.value;
    const nextGuardians = merge(guardiansRef.current, fresh.guardians);
    const nextStudents = merge(studentsRef.current, fresh.students);
    setGuardians(nextGuardians); setStudents(nextStudents);
    guardiansRef.current = nextGuardians; studentsRef.current = nextStudents;
    return { ok: true, value: { created, guardians: nextGuardians, students: nextStudents } };
  }, [repo]);

  return { guardians, students, reload, addGuardian, addStudent, updateGuardian, updateStudent, removeGuardian, removeStudent, saveForEnrollment };
}
