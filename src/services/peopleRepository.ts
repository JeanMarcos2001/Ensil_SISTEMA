/**
 * Repositorio de Titulares y Alumnos sobre Supabase (tablas `titulares`, `alumnos` y `alumno_titulares`, y las funciones `crear_personas`,
 * `editar_titular` y `editar_alumno`). Solo traduce: filas ↔ modelo del sistema y errores de la base ↔ mensajes claros. Las reglas y el orden de
 * las operaciones viven en `utils/people.ts` y `services/people.ts`. La seguridad no está aquí: la deciden las políticas y las funciones de la
 * base según la cuenta que inició sesión.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CreatedPeople } from '../utils/enrollmentPeople';
import {
  guardianFromRow, numberOfId, peopleErrorMessage, studentsFromRows, type AlumnoRow, type TitularRow, type VinculoRow,
} from '../utils/peopleDb';
import type { RepoResult } from './orgDirectory';
import type { PeopleData, PeopleRepository } from './people';

const failure = <T>(error: { code?: string; message?: string; details?: string } | null): RepoResult<T> => ({ ok: false, error: peopleErrorMessage(error) });

/** Cuando un borrado no toca ninguna fila, la política de seguridad la ocultó (o ya no existe). */
const NOT_TOUCHED = 'No se pudo completar: el registro ya no existe o su cuenta no tiene permiso para cambiarlo.';

const PAGE = 1000;
type DbError = { code?: string; message?: string; details?: string };

/** Lee TODA una tabla de a mil filas (la API entrega mil por vez) en un orden estable. */
async function fetchAll<T>(client: SupabaseClient, table: string, order: string): Promise<{ data: T[]; error: null } | { data: null; error: DbError }> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client.from(table).select('*').order(order).range(from, from + PAGE - 1);
    if (error) return { data: null, error };
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) return { data: out, error: null };
  }
}

const byNumber = <T extends { id: string }>(list: T[]): T[] => [...list].sort((a, b) => numberOfId(a.id) - numberOfId(b.id));

export function createSupabasePeopleRepository(client: SupabaseClient): PeopleRepository {
  const rpc = async <T = null>(fn: string, args: Record<string, unknown>): Promise<RepoResult<T>> => {
    const { data, error } = await client.rpc(fn, args);
    return error ? failure(error) : { ok: true, data: (data ?? null) as T };
  };

  return {
    async list(): Promise<RepoResult<PeopleData>> {
      const [t, a, l] = await Promise.all([
        fetchAll<TitularRow>(client, 'titulares', 'numero'), fetchAll<AlumnoRow>(client, 'alumnos', 'numero'), fetchAll<VinculoRow>(client, 'alumno_titulares', 'alumno_id'),
      ]);
      const error = t.error ?? a.error ?? l.error;
      if (error) return failure(error);
      return {
        ok: true,
        data: { guardians: byNumber((t.data as TitularRow[]).map(guardianFromRow)), students: byNumber(studentsFromRows(a.data as AlumnoRow[], l.data as VinculoRow[])) },
      };
    },
    async fetch(ids): Promise<RepoResult<PeopleData>> {
      const [t, a] = await Promise.all([
        ids.guardianIds.length > 0 ? client.from('titulares').select('*').in('id', ids.guardianIds) : Promise.resolve({ data: [] as TitularRow[], error: null }),
        ids.studentIds.length > 0 ? client.from('alumnos').select('*').in('id', ids.studentIds) : Promise.resolve({ data: [] as AlumnoRow[], error: null }),
      ]);
      const error = t.error ?? a.error;
      if (error) return failure(error);
      const links = ids.studentIds.length > 0 ? await client.from('alumno_titulares').select('*').in('alumno_id', ids.studentIds) : { data: [] as VinculoRow[], error: null };
      if (links.error) return failure(links.error);
      return {
        ok: true,
        data: { guardians: byNumber((t.data as TitularRow[]).map(guardianFromRow)), students: byNumber(studentsFromRows(a.data as AlumnoRow[], links.data as VinculoRow[])) },
      };
    },
    createPeople: payload => rpc<CreatedPeople>('crear_personas', { p: payload }),
    editGuardian: (id, payload) => rpc('editar_titular', { p_id: id, p: payload }),
    editStudent: (id, payload) => rpc('editar_alumno', { p_id: id, p: payload }),
    async removeGuardian(id) {
      const { data, error } = await client.from('titulares').delete().eq('id', id).select();
      if (error) return failure(error);
      return data && data.length === 1 ? { ok: true, data: null } : { ok: false, error: NOT_TOUCHED };
    },
    async removeStudent(id) {
      const { data, error } = await client.from('alumnos').delete().eq('id', id).select();
      if (error) return failure(error);
      return data && data.length === 1 ? { ok: true, data: null } : { ok: false, error: NOT_TOUCHED };
    },
  };
}
