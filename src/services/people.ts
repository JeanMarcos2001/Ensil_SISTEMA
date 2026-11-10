/**
 * Operaciones de Titulares y Alumnos sobre la base de datos: validan con las reglas puras (`utils/people.ts`) y luego guardan.
 *
 * Reciben el repositorio como parámetro (el de Supabase en el sistema, uno en memoria en `scripts/check-people-db.ts`), de modo que el orden
 * «validar → guardar → releer» se puede comprobar sin conexión. Ninguna toca el estado de React: devuelven lo que quedó guardado y quien llama
 * (el gancho `usePeople`) lo aplica a su lista.
 *
 * Los códigos (TIT-NNN y ALU-NNN) los asigna la base. Después de crear o cambiar algo se vuelve a leer esa fila: se muestra lo que de verdad quedó
 * guardado (sin espacios de más, con el código asignado).
 */
import type { Guardian, Student } from '../context/DataContext';
import { guardianRecordError, studentRecordError } from '../utils/people';
import { guardianPayload, studentPayload } from '../utils/peopleDb';
import type { CreatedPeople, PeoplePayload } from '../utils/enrollmentPeople';
import type { OpResult, RepoResult } from './orgDirectory';

export interface PeopleData { guardians: Guardian[]; students: Student[] }

export interface PeopleRepository {
  list(): Promise<RepoResult<PeopleData>>;
  /** Vuelve a leer solo estas filas. */
  fetch(ids: { guardianIds: string[]; studentIds: string[] }): Promise<RepoResult<PeopleData>>;
  /** Crea titulares y alumnos y actualiza alumnos que ya existen, todo o nada. Devuelve el código de cada clave. */
  createPeople(payload: PeoplePayload): Promise<RepoResult<CreatedPeople>>;
  editGuardian(id: string, payload: Record<string, unknown>): Promise<RepoResult<null>>;
  editStudent(id: string, payload: Record<string, unknown>): Promise<RepoResult<null>>;
  removeGuardian(id: string): Promise<RepoResult<null>>;
  removeStudent(id: string): Promise<RepoResult<null>>;
}

/** Lo que las reglas necesitan saber: lo que ya hay y el día de hoy. */
export interface PeopleContext { guardians: Guardian[]; students: Student[]; today: string }

const fail = (error: string): OpResult<never> => ({ ok: false, error });

/** Lee de la base los titulares y los alumnos. Se lee al iniciar sesión (`AccessGate`), antes de montar las pantallas. */
export async function loadPeople(repo: PeopleRepository): Promise<OpResult<PeopleData>> {
  const res = await repo.list();
  return res.ok && res.data ? { ok: true, value: res.data } : fail(res.error ?? 'No se pudieron cargar los titulares y los alumnos.');
}

/** Crea un titular. Devuelve el titular tal como quedó guardado (con su código). */
export async function createGuardian(repo: PeopleRepository, ctx: PeopleContext, data: Omit<Guardian, 'id'>): Promise<OpResult<Guardian>> {
  const problem = guardianRecordError(data, ctx.guardians, ctx.today);
  if (problem) return fail(problem);
  const payload = { clave: 'nuevo', ...guardianPayload(data) };
  const created = await repo.createPeople({ titulares: [payload], alumnos: [], actualizaciones: [] });
  const id = created.data?.titulares.nuevo;
  if (!created.ok || !id) return fail(created.error ?? 'No se pudo guardar el titular.');
  const fresh = await repo.fetch({ guardianIds: [id], studentIds: [] });
  const saved = fresh.data?.guardians[0];
  return saved ? { ok: true, value: saved } : fail(fresh.error ?? 'El titular se guardó, pero no se pudo volver a leer. Actualice la pantalla.');
}

/** Crea un alumno (con sus titulares ya registrados, o sin ninguno si es independiente). */
export async function createStudent(repo: PeopleRepository, ctx: PeopleContext, data: Omit<Student, 'id'>): Promise<OpResult<Student>> {
  const problem = studentRecordError(data, ctx.students, ctx.guardians, ctx.today);
  if (problem) return fail(problem);
  const { titulares, ...fields } = studentPayload(data);
  const created = await repo.createPeople({ titulares: [], alumnos: [{ clave: 'nuevo', ...fields, titulares: titulares ?? [] }], actualizaciones: [] });
  const id = created.data?.alumnos.nuevo;
  if (!created.ok || !id) return fail(created.error ?? 'No se pudo guardar el alumno.');
  const fresh = await repo.fetch({ guardianIds: [], studentIds: [id] });
  const saved = fresh.data?.students[0];
  return saved ? { ok: true, value: saved } : fail(fresh.error ?? 'El alumno se guardó, pero no se pudo volver a leer. Actualice la pantalla.');
}

/** Edita un titular (los campos que vienen). Devuelve el titular tal como quedó. */
export async function changeGuardian(repo: PeopleRepository, ctx: PeopleContext, id: string, patch: Partial<Guardian>): Promise<OpResult<Guardian>> {
  const current = ctx.guardians.find(g => g.id === id);
  if (!current) return fail('No se encontró al titular.');
  const next = { ...current, ...patch };
  const problem = guardianRecordError(next, ctx.guardians, ctx.today, id);
  if (problem) return fail(problem);
  const res = await repo.editGuardian(id, guardianPayload(patch));
  if (!res.ok) return fail(res.error ?? 'No se pudo guardar el titular.');
  const fresh = await repo.fetch({ guardianIds: [id], studentIds: [] });
  const saved = fresh.data?.guardians[0];
  return saved ? { ok: true, value: saved } : fail(fresh.error ?? 'El titular se guardó, pero no se pudo volver a leer. Actualice la pantalla.');
}

/** Edita un alumno (los campos que vienen; si vienen sus titulares, quedan exactamente como se indican). */
export async function changeStudent(repo: PeopleRepository, ctx: PeopleContext, id: string, patch: Partial<Student>): Promise<OpResult<Student>> {
  const current = ctx.students.find(s => s.id === id);
  if (!current) return fail('No se encontró al alumno.');
  const next = { ...current, ...patch };
  const problem = studentRecordError(next, ctx.students, ctx.guardians, ctx.today, id);
  if (problem) return fail(problem);
  const res = await repo.editStudent(id, studentPayload(patch));
  if (!res.ok) return fail(res.error ?? 'No se pudo guardar el alumno.');
  const fresh = await repo.fetch({ guardianIds: [], studentIds: [id] });
  const saved = fresh.data?.students[0];
  return saved ? { ok: true, value: saved } : fail(fresh.error ?? 'El alumno se guardó, pero no se pudo volver a leer. Actualice la pantalla.');
}

/** Elimina un titular. Lo que sigue en memoria (matrículas) lo comprueba quien llama; la base impide eliminar uno con alumnos. */
export async function deleteGuardian(repo: PeopleRepository, ctx: PeopleContext, id: string): Promise<OpResult> {
  if (!ctx.guardians.some(g => g.id === id)) return fail('No se encontró al titular.');
  if (ctx.students.some(s => s.guardianIds.includes(id))) return fail('El titular tiene alumnos o matrículas a su cargo: no se puede eliminar.');
  const res = await repo.removeGuardian(id);
  return res.ok ? { ok: true } : fail(res.error ?? 'No se pudo eliminar al titular.');
}

/** Elimina un alumno. Lo que sigue en memoria (matrículas, asesorías, seguimiento) lo comprueba quien llama. */
export async function deleteStudent(repo: PeopleRepository, ctx: PeopleContext, id: string): Promise<OpResult> {
  if (!ctx.students.some(s => s.id === id)) return fail('No se encontró al alumno.');
  const res = await repo.removeStudent(id);
  return res.ok ? { ok: true } : fail(res.error ?? 'No se pudo eliminar al alumno.');
}

/**
 * Guarda las personas de un registro de matrícula (titulares y alumnos nuevos, y los datos de inicio y situación de los alumnos que ya existían)
 * en UNA operación de la base, todo o nada, y devuelve el código de cada una junto con lo que quedó guardado.
 */
export async function savePeopleForEnrollment(repo: PeopleRepository, payload: PeoplePayload): Promise<OpResult<{ created: CreatedPeople; fresh: PeopleData }>> {
  const res = await repo.createPeople(payload);
  if (!res.ok || !res.data) return fail(res.error ?? 'No se pudieron guardar las personas de la matrícula.');
  const guardianIds = Object.values(res.data.titulares);
  const studentIds = [...Object.values(res.data.alumnos), ...payload.actualizaciones.map(u => String(u.id))];
  const fresh = await repo.fetch({ guardianIds, studentIds });
  if (!fresh.ok || !fresh.data) return fail(fresh.error ?? 'Las personas se guardaron, pero no se pudieron volver a leer. Actualice la pantalla.');
  return { ok: true, value: { created: res.data, fresh: fresh.data } };
}
