/**
 * Traducción entre los titulares y los alumnos del sistema y las filas de la base (tablas `titulares`, `alumnos` y `alumno_titulares`), y de los
 * errores de la base a mensajes claros. Funciones puras.
 *
 * Lo derivable no se guarda: el nombre completo sale de nombres y apellidos (`fullNameOf`), la edad de la fecha de nacimiento, y el estado, el
 * programa y la sede del alumno de sus matrículas. Los titulares de un alumno viajan como lista de ids (`guardianIds`): en la base son filas de
 * `alumno_titulares`, con su orden (el primero es el titular principal).
 */
import type { Guardian, Student } from '../context/DataContext';
import { dbErrorMessage, type DbErrorLike } from './orgDirectory';

export interface TitularRow {
  id: string; tipo_doc: string; documento: string; nombres: string; apellido_paterno: string; apellido_materno: string; fecha_nacimiento: string;
  estado_civil: string; telefono: string; correo: string; direccion: string; parentesco: string | null;
}
export interface AlumnoRow {
  id: string; tipo_doc: string; documento: string; nombres: string; apellido_paterno: string; apellido_materno: string; fecha_nacimiento: string;
  telefono: string; correo: string; direccion: string; parentesco: string; fecha_inicio: string | null; situacion: NonNullable<Student['occupationStatus']>;
  tipo_institucion: string | null; colegio: string | null; grado: string | null; ocupacion: string | null; centro_trabajo: string | null;
}
export interface VinculoRow { alumno_id: string; titular_id: string; orden: number }

/** «Juan Ruiz Paredes»: nombres y apellidos, sin espacios de más. */
export const fullNameOf = (p: { names?: string; lastNameP?: string; lastNameM?: string }): string =>
  [p.names, p.lastNameP, p.lastNameM].map(x => (x ?? '').trim()).filter(Boolean).join(' ');

const opt = <T>(v: T | null | undefined): T | undefined => (v === null || v === undefined || (v as unknown) === '' ? undefined : v);

// ------------------------------------------------------------------------------------------------------------------ Titulares

export const guardianFromRow = (r: TitularRow): Guardian => ({
  id: r.id, name: fullNameOf({ names: r.nombres, lastNameP: r.apellido_paterno, lastNameM: r.apellido_materno }), doc: r.documento, docType: r.tipo_doc,
  names: r.nombres, lastNameP: r.apellido_paterno, lastNameM: r.apellido_materno, birthDate: r.fecha_nacimiento, civilStatus: opt(r.estado_civil),
  phone: r.telefono, email: r.correo, direccion: r.direccion, parentesco: opt(r.parentesco),
});

/** Lo que se manda a la base de un titular: solo los campos que vienen (al editar, lo que no viene no se toca; uno vacío se limpia). */
export function guardianPayload(g: Partial<Guardian>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const set = (key: keyof Guardian, column: string, value: unknown) => { if (key in g) out[column] = value === undefined ? null : value; };
  set('docType', 'tipo_doc', g.docType);
  set('doc', 'documento', g.doc);
  set('names', 'nombres', g.names);
  set('lastNameP', 'apellido_paterno', g.lastNameP);
  set('lastNameM', 'apellido_materno', g.lastNameM);
  set('birthDate', 'fecha_nacimiento', g.birthDate);
  set('civilStatus', 'estado_civil', g.civilStatus);
  set('phone', 'telefono', g.phone);
  set('email', 'correo', g.email);
  set('direccion', 'direccion', g.direccion);
  set('parentesco', 'parentesco', g.parentesco);
  return out;
}

// ------------------------------------------------------------------------------------------------------------------ Alumnos

export const studentFromRow = (r: AlumnoRow, guardianIds: string[]): Student => ({
  id: r.id, doc: r.documento, docType: r.tipo_doc, name: fullNameOf({ names: r.nombres, lastNameP: r.apellido_paterno, lastNameM: r.apellido_materno }),
  names: r.nombres, lastNameP: r.apellido_paterno, lastNameM: r.apellido_materno, birthDate: r.fecha_nacimiento, phone: r.telefono, email: r.correo, address: r.direccion,
  guardianIds, relationship: r.parentesco, fechaInicio: opt(r.fecha_inicio), occupationStatus: r.situacion, institutionType: opt(r.tipo_institucion),
  colegio: opt(r.colegio), grado: opt(r.grado), occupation: opt(r.ocupacion), workplace: opt(r.centro_trabajo),
});

/** Lo que se manda a la base de un alumno (ver `guardianPayload`). Los titulares viajan como lista ordenada de códigos. */
export function studentPayload(s: Partial<Student>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const set = (key: keyof Student, column: string, value: unknown) => { if (key in s) out[column] = value === undefined ? null : value; };
  set('docType', 'tipo_doc', s.docType);
  set('doc', 'documento', s.doc);
  set('names', 'nombres', s.names);
  set('lastNameP', 'apellido_paterno', s.lastNameP);
  set('lastNameM', 'apellido_materno', s.lastNameM);
  set('birthDate', 'fecha_nacimiento', s.birthDate);
  set('phone', 'telefono', s.phone);
  set('email', 'correo', s.email);
  set('address', 'direccion', s.address);
  set('relationship', 'parentesco', s.relationship);
  set('fechaInicio', 'fecha_inicio', s.fechaInicio);
  set('occupationStatus', 'situacion', s.occupationStatus);
  set('institutionType', 'tipo_institucion', s.institutionType);
  set('colegio', 'colegio', s.colegio);
  set('grado', 'grado', s.grado);
  set('occupation', 'ocupacion', s.occupation);
  set('workplace', 'centro_trabajo', s.workplace);
  if ('guardianIds' in s) out.titulares = s.guardianIds ?? [];
  return out;
}

/** Arma los alumnos de la base: cada uno con sus titulares en el orden de sus vínculos. */
export function studentsFromRows(rows: AlumnoRow[], links: VinculoRow[]): Student[] {
  const byStudent = new Map<string, VinculoRow[]>();
  for (const l of links) byStudent.set(l.alumno_id, [...(byStudent.get(l.alumno_id) ?? []), l]);
  return rows.map(r => studentFromRow(r, (byStudent.get(r.id) ?? []).sort((a, b) => a.orden - b.orden).map(l => l.titular_id)));
}

// ------------------------------------------------------------------------------------------------------------------ Carga de partida

/** El número del código (`ALU-014` → 14): la base lo usa como orden y para numerar lo siguiente. */
export const numberOfId = (id: string): number => parseInt(id.slice(id.indexOf('-') + 1), 10);

/** Fila de un titular para cargar la base de partida (con su número: así los códigos de los datos de ejemplo se conservan). */
export const guardianToSeedRow = (g: Guardian) => ({
  numero: numberOfId(g.id), tipo_doc: g.docType ?? 'DNI', documento: g.doc, nombres: g.names ?? '', apellido_paterno: g.lastNameP ?? '', apellido_materno: g.lastNameM ?? '',
  fecha_nacimiento: g.birthDate ?? null, estado_civil: g.civilStatus ?? '', telefono: g.phone, correo: g.email, direccion: g.direccion ?? '', parentesco: g.parentesco ?? null,
});
export const studentToSeedRow = (s: Student) => ({
  numero: numberOfId(s.id), tipo_doc: s.docType ?? 'DNI', documento: s.doc, nombres: s.names ?? '', apellido_paterno: s.lastNameP ?? '', apellido_materno: s.lastNameM ?? '',
  fecha_nacimiento: s.birthDate, telefono: s.phone ?? '', correo: s.email ?? '', direccion: s.address ?? '', parentesco: s.relationship ?? '', fecha_inicio: s.fechaInicio ?? null,
  situacion: s.occupationStatus ?? 'ninguna', tipo_institucion: s.institutionType ?? null, colegio: s.colegio ?? null, grado: s.grado ?? null, ocupacion: s.occupation ?? null,
  centro_trabajo: s.workplace ?? null,
});

// ------------------------------------------------------------------------------------------------------------------ Errores

/** Mensaje claro para un error de la base en Titulares y Alumnos. Los avisos de las funciones propias (código EN001) ya vienen en español. */
export function peopleErrorMessage(e: DbErrorLike | null | undefined): string {
  if (!e) return 'No se pudo guardar. Intente de nuevo.';
  const t = `${e.message ?? ''} ${e.details ?? ''}`.toLowerCase();
  if (e.code === '23505' && (t.includes('titulares_documento_unico') || t.includes('alumnos_documento_unico'))) return 'Ese documento ya está registrado.';
  if (e.code === '23001' || (e.code === '23503' && t.includes('alumno_titulares'))) return 'El titular tiene alumnos a su cargo: no se puede eliminar.';
  if (e.code === '23514') return 'Algún dato no cumple el formato que exige la base de datos.';
  return dbErrorMessage(e);
}
