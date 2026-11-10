/**
 * Las personas de un registro de matrícula (funciones puras): qué titulares y alumnos hay que crear o actualizar en la base antes de matricular,
 * y cómo queda el borrador cuando ya existen.
 *
 * Matricular crea personas y matrículas. Las personas viven en la base (con códigos que asigna ella) y la matrícula todavía en memoria, así que
 * el orden es: (1) comprobar todo el borrador, (2) guardar las personas nuevas y los cambios de los alumnos que ya existían en UNA sola
 * operación de la base (todo o nada) y (3) matricular a esas personas como «ya registradas» (`withCreatedPeople`).
 */
import type { DraftPerson, EnrollmentDraft } from './enrollment';
import { situationData, studentPerson } from './enrollment';

/** Clave con la que se nombra a cada titular nuevo dentro del lote (la base la cambia por el código TIT-NNN). */
export const holderKey = (index: number): string => `H${index}`;

export interface PeoplePayload {
  titulares: Record<string, unknown>[];
  alumnos: Record<string, unknown>[];
  actualizaciones: Record<string, unknown>[];
}

export interface PeoplePlan {
  payload: PeoplePayload;
  /** `true` si no hay nada que guardar (todas las personas ya existían y no cambia ningún dato). */
  empty: boolean;
}

/** Lo que devuelve la base: el código que recibió cada clave. */
export interface CreatedPeople { titulares: Record<string, string>; alumnos: Record<string, string> }

const base = (p: DraftPerson) => ({
  tipo_doc: p.docType, documento: p.docNumber.trim(), nombres: p.names.trim(), apellido_paterno: p.lastNameP.trim(), apellido_materno: p.lastNameM.trim(),
  fecha_nacimiento: p.birthDate, correo: p.email.trim(),
});

const situation = (ds: Parameters<typeof situationData>[0]) => {
  const s = situationData(ds);
  return { situacion: s.occupationStatus ?? null, tipo_institucion: s.institutionType ?? null, colegio: s.colegio ?? null, grado: s.grado ?? null, ocupacion: s.occupation ?? null, centro_trabajo: s.workplace ?? null };
};

/** Qué guardar en la base antes de matricular: los titulares y alumnos nuevos y los datos de inicio y situación de los alumnos que ya existían. */
export function planEnrollmentPeople(draft: EnrollmentDraft): PeoplePlan {
  const apoderado = draft.mode === 'apoderado';
  const titulares: Record<string, unknown>[] = [];
  if (apoderado) {
    draft.holders.forEach((h, i) => {
      if (h.existingId) return;
      titulares.push({
        clave: holderKey(i), ...base(h), estado_civil: h.civilStatus, telefono: h.phone.trim(), direccion: h.address.trim(),
        parentesco: i === 0 ? draft.students[0]?.relationship || null : null,
      });
    });
  }
  const holderRefs = apoderado ? draft.holders.map((h, i) => h.existingId ?? holderKey(i)) : [];

  const alumnos: Record<string, unknown>[] = [];
  const actualizaciones: Record<string, unknown>[] = [];
  draft.students.forEach((ds, i) => {
    const person = studentPerson(draft, i);
    if (person.existingId) {
      actualizaciones.push({ id: person.existingId, fecha_inicio: ds.startDate || null, ...situation(ds) });
      return;
    }
    alumnos.push({
      clave: ds.key, ...base(person), telefono: apoderado ? '' : person.phone.trim(), direccion: person.address.trim(), parentesco: apoderado ? ds.relationship : '',
      fecha_inicio: ds.startDate || null, ...situation(ds), titulares: holderRefs,
    });
  });
  return { payload: { titulares, alumnos, actualizaciones }, empty: titulares.length === 0 && alumnos.length === 0 && actualizaciones.length === 0 };
}

/** El borrador con las personas que acaban de crearse ya registradas (con su código): al matricular no se vuelven a crear. */
export function withCreatedPeople(draft: EnrollmentDraft, created: CreatedPeople): EnrollmentDraft {
  const independent = draft.mode === 'independiente';
  const holders = draft.holders.map((h, i) => {
    if (h.existingId) return h;
    // En modo independiente el único «titular» es la propia persona del alumno 1
    const id = independent ? (i === 0 ? created.alumnos[draft.students[0]?.key ?? ''] : undefined) : created.titulares[holderKey(i)];
    return id ? { ...h, existingId: id, source: 'existente' as const } : h;
  });
  const students = draft.students.map((ds, i) => {
    if (independent && i === 0) return ds;
    const id = created.alumnos[ds.key];
    return id && !ds.person.existingId ? { ...ds, person: { ...ds.person, existingId: id, source: 'existente' as const } } : ds;
  });
  return { ...draft, holders, students };
}
