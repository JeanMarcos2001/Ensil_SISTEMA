/**
 * Verificación de Titulares y Alumnos en la base de datos (Lote 7):
 *  - reglas puras de un titular y de un alumno ya armados (documento, nombres, nacimiento, mayoría de edad del titular, teléfono, correo,
 *    situación, titulares y parentesco, documento sin repetir);
 *  - traducción de filas ↔ modelo (el nombre completo se deriva, los titulares viajan en orden) y lo que se manda a la base;
 *  - las personas de un registro de matrícula: qué se guarda antes de matricular y cómo queda el borrador después (no se vuelven a crear);
 *  - operaciones (con un repositorio en memoria): validan ANTES de llamar a la base, vuelven a leer lo guardado y devuelven el motivo;
 *  - la carga de partida (`supabase/seed/personas_de_ejemplo.sql`) está al día y sus datos cumplen las reglas;
 *  - el cableado: las funciones de la base que llama el repositorio existen en la migración, las funciones del registro que piden existen y
 *    leen lo que dicen, y el contexto ya no guarda titulares ni alumnos en memoria.
 * Lo que hace la base (todo o nada, quién ve y quién crea, el documento sin repetir…) se prueba aparte contra una copia de la base.
 * Ejecutar: npx tsx scripts/check-people-db.ts
 */
import { readFileSync } from 'node:fs';
import { buildPeopleSeed } from '../src/data/seedPeople';
import type { Guardian, Student } from '../src/context/DataContext';
import { guardianPayload, guardianFromRow, guardianToSeedRow, numberOfId, peopleErrorMessage, studentFromRow, studentPayload, studentToSeedRow, studentsFromRows, fullNameOf } from '../src/utils/peopleDb';
import { emptyDraft, emptyPerson, emptyStudent, type EnrollmentDraft } from '../src/utils/enrollment';
import { holderKey, planEnrollmentPeople, withCreatedPeople } from '../src/utils/enrollmentPeople';
import { guardianRecordError, studentRecordError } from '../src/utils/people';
import { renderPeopleSeedSql, SEED_REFERENCE_DAY } from '../src/utils/peopleSeedSql';
import { capabilityById } from '../src/utils/capabilities';
import { ALL_CAPABILITIES } from '../src/utils/capabilities';
import { THROWS_ON_DENIAL } from '../src/utils/guards';
import {
  changeGuardian, changeStudent, createGuardian, createStudent, deleteGuardian, deleteStudent, loadPeople, savePeopleForEnrollment,
  type PeopleContext, type PeopleRepository,
} from '../src/services/people';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : ` -> ${detail}`}`);
  if (!ok) failed++;
};
const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

const TODAY = '2026-11-10';
const seed = buildPeopleSeed(SEED_REFERENCE_DAY);

// ------------------------------------------------------------------------------------------------------------------ Datos de prueba
const guardian = (extra: Partial<Guardian> = {}): Omit<Guardian, 'id'> => ({
  name: 'Rosa León Vera', doc: '40111222', docType: 'DNI', names: 'Rosa', lastNameP: 'León', lastNameM: 'Vera', birthDate: '1985-03-04', civilStatus: 'Soltero(a)',
  phone: '987000111', email: 'rosa@mail.com', direccion: 'Jr. Lima 10', parentesco: 'Madre', ...extra,
});
const student = (extra: Partial<Student> = {}): Omit<Student, 'id'> => ({
  doc: '70111222', docType: 'DNI', name: 'Ana León Vera', names: 'Ana', lastNameP: 'León', lastNameM: 'Vera', birthDate: '2016-05-06', phone: '', email: '', address: '',
  guardianIds: ['TIT-001'], relationship: 'Hijo(a)', occupationStatus: 'estudiando', institutionType: 'Colegio', colegio: 'I.E. Prueba', grado: '2.º primaria', ...extra,
});
const G = seed.guardians;
const S = seed.students;

// ------------------------------------------------------------------------------------------------------------------ Reglas de un titular
check('Un titular válido no tiene error', guardianRecordError(guardian(), G, TODAY) === null);
check('Un titular pide documento válido, nombres, nacimiento (no futuro), teléfono de 9 dígitos y correo bien escrito',
  !!guardianRecordError(guardian({ doc: '123' }), G, TODAY) && !!guardianRecordError(guardian({ doc: '' }), G, TODAY) && !!guardianRecordError(guardian({ names: ' ' }), G, TODAY)
  && !!guardianRecordError(guardian({ lastNameP: '' }), G, TODAY) && !!guardianRecordError(guardian({ birthDate: '' }), G, TODAY) && !!guardianRecordError(guardian({ birthDate: '2999-01-01' }), G, TODAY)
  && !!guardianRecordError(guardian({ phone: '12345' }), G, TODAY) && !!guardianRecordError(guardian({ phone: '' }), G, TODAY) && !!guardianRecordError(guardian({ email: 'sin-arroba' }), G, TODAY)
  && guardianRecordError(guardian({ email: '' }), G, TODAY) === null);
check('Un titular es mayor de 18 años', /mayor de 18/.test(guardianRecordError(guardian({ birthDate: '2015-01-01' }), G, TODAY) ?? '') && guardianRecordError(guardian({ birthDate: '2008-11-10' }), G, TODAY) === null && !!guardianRecordError(guardian({ birthDate: '2008-11-11' }), G, TODAY));
check('El documento de un titular no se repite (sin mirar mayúsculas), salvo con él mismo',
  /ya está registrado/.test(guardianRecordError(guardian({ doc: G[0].doc }), G, TODAY) ?? '') && guardianRecordError({ ...guardian({ doc: G[0].doc }) }, G, TODAY, G[0].id) === null
  && !!guardianRecordError(guardian({ docType: 'Pasaporte', doc: 'abc12345' }), [{ ...G[0], doc: 'ABC12345' }], TODAY));
check('El carné y el pasaporte piden de 6 a 12 letras o números', guardianRecordError(guardian({ docType: 'CE', doc: 'AB1234' }), G, TODAY) === null && !!guardianRecordError(guardian({ docType: 'CE', doc: 'AB12' }), G, TODAY));

// ------------------------------------------------------------------------------------------------------------------ Reglas de un alumno
check('Un alumno válido (con apoderado) no tiene error', studentRecordError(student(), S, G, TODAY) === null);
check('Un alumno pide documento válido, nombres, nacimiento (no futuro), teléfono (si lo tiene) y correo bien escrito',
  !!studentRecordError(student({ doc: '12' }), S, G, TODAY) && !!studentRecordError(student({ names: '' }), S, G, TODAY) && !!studentRecordError(student({ birthDate: '' }), S, G, TODAY)
  && !!studentRecordError(student({ birthDate: '2999-01-01' }), S, G, TODAY) && !!studentRecordError(student({ phone: '123' }), S, G, TODAY) && !!studentRecordError(student({ email: 'x' }), S, G, TODAY)
  && studentRecordError(student({ phone: '987654321' }), S, G, TODAY) === null);
check('Qué hace el alumno: estudia (tipo, institución y grado o ciclo), trabaja (ocupación), ambas o ninguna',
  !!studentRecordError(student({ occupationStatus: undefined }), S, G, TODAY) && !!studentRecordError(student({ institutionType: undefined }), S, G, TODAY)
  && !!studentRecordError(student({ colegio: '' }), S, G, TODAY) && !!studentRecordError(student({ grado: '' }), S, G, TODAY)
  && !!studentRecordError(student({ occupationStatus: 'trabajando' }), S, G, TODAY) && studentRecordError(student({ occupationStatus: 'trabajando', occupation: 'Contador' }), S, G, TODAY) === null
  && studentRecordError(student({ occupationStatus: 'ninguna', institutionType: undefined, colegio: undefined, grado: undefined }), S, G, TODAY) === null
  && /ciclo/.test(studentRecordError(student({ institutionType: 'Universidad', grado: '' }), S, G, TODAY) ?? ''));
check('Con apoderado: los titulares existen, no se repiten y el parentesco es obligatorio',
  /ya no existe/.test(studentRecordError(student({ guardianIds: ['TIT-999'] }), S, G, TODAY) ?? '') && /repetido/.test(studentRecordError(student({ guardianIds: ['TIT-001', 'TIT-001'] }), S, G, TODAY) ?? '')
  && /parentesco/.test(studentRecordError(student({ relationship: '' }), S, G, TODAY) ?? '') && studentRecordError(student({ guardianIds: ['TIT-001', 'TIT-002'] }), S, G, TODAY) === null);
check('Independiente (sin titulares): su teléfono es obligatorio', /independiente necesita su teléfono/.test(studentRecordError(student({ guardianIds: [], relationship: '' }), S, G, TODAY) ?? '')
  && studentRecordError(student({ guardianIds: [], relationship: '', phone: '987654321' }), S, G, TODAY) === null);
check('El documento de un alumno no se repite, salvo con él mismo', /ya está registrado/.test(studentRecordError(student({ doc: S[0].doc }), S, G, TODAY) ?? '') && studentRecordError(student({ doc: S[0].doc }), S, G, TODAY, S[0].id) === null);

// ------------------------------------------------------------------------------------------------------------------ Traducción
const gRow = { id: 'TIT-007', tipo_doc: 'DNI', documento: '40111222', nombres: 'Rosa', apellido_paterno: 'León', apellido_materno: 'Vera', fecha_nacimiento: '1985-03-04', estado_civil: 'Soltero(a)',
  telefono: '987000111', correo: 'rosa@mail.com', direccion: 'Jr. Lima 10', parentesco: null };
const g = guardianFromRow(gRow);
check('Un titular de la base es el modelo del sistema; el nombre completo sale de nombres y apellidos (no se guarda)', g.id === 'TIT-007' && g.name === 'Rosa León Vera' && g.doc === '40111222' && g.docType === 'DNI'
  && g.civilStatus === 'Soltero(a)' && g.phone === '987000111' && g.parentesco === undefined && fullNameOf({ names: ' Rosa ', lastNameP: 'León', lastNameM: '' }) === 'Rosa León');
const aRow = { id: 'ALU-009', tipo_doc: 'DNI', documento: '70111222', nombres: 'Ana', apellido_paterno: 'León', apellido_materno: 'Vera', fecha_nacimiento: '2016-05-06', telefono: '', correo: '', direccion: '',
  parentesco: 'Hijo(a)', fecha_inicio: null, situacion: 'estudiando' as const, tipo_institucion: 'Colegio', colegio: 'I.E. Prueba', grado: '2.º primaria', ocupacion: null, centro_trabajo: null };
const s = studentFromRow(aRow, ['TIT-001', 'TIT-002']);
check('Un alumno de la base es el modelo del sistema, con sus titulares en orden', s.name === 'Ana León Vera' && s.guardianIds.join() === 'TIT-001,TIT-002' && s.relationship === 'Hijo(a)' && s.occupationStatus === 'estudiando'
  && s.colegio === 'I.E. Prueba' && s.occupation === undefined && s.fechaInicio === undefined);
const rebuilt = studentsFromRows([aRow, { ...aRow, id: 'ALU-010', documento: '70111223' }], [
  { alumno_id: 'ALU-009', titular_id: 'TIT-002', orden: 2 }, { alumno_id: 'ALU-009', titular_id: 'TIT-001', orden: 1 }, { alumno_id: 'ALU-010', titular_id: 'TIT-005', orden: 1 },
]);
check('Los titulares de cada alumno se arman por el orden de sus vínculos (el primero es el principal)', rebuilt[0].guardianIds.join() === 'TIT-001,TIT-002' && rebuilt[1].guardianIds.join() === 'TIT-005');
const gp = guardianPayload({ phone: '999888777', parentesco: undefined, email: '' });
check('Lo que se manda de un titular son solo los campos que vienen; uno vacío se limpia', gp.telefono === '999888777' && gp.parentesco === null && gp.correo === '' && !('nombres' in gp) && !('documento' in gp));
const sp = studentPayload({ fechaInicio: '2026-12-01', colegio: undefined, guardianIds: ['TIT-002', 'TIT-001'] });
check('Lo que se manda de un alumno: solo lo que viene; los titulares, en orden', sp.fecha_inicio === '2026-12-01' && sp.colegio === null && JSON.stringify(sp.titulares) === JSON.stringify(['TIT-002', 'TIT-001']) && !('nombres' in sp));
check('El nombre completo no viaja a la base (se deriva)', !('name' in guardianPayload(guardian())) && !('name' in studentPayload(student())) && !('nombre' in guardianPayload(guardian())));
const canon = (o: object) => JSON.stringify(o, Object.keys(o).sort());
check('Los datos de ejemplo van y vuelven por la traducción sin perder nada',
  G.every(x => canon(guardianFromRow({ id: x.id, tipo_doc: x.docType!, documento: x.doc, nombres: x.names!, apellido_paterno: x.lastNameP!, apellido_materno: x.lastNameM!, fecha_nacimiento: x.birthDate!, estado_civil: x.civilStatus!,
    telefono: x.phone, correo: x.email, direccion: x.direccion!, parentesco: x.parentesco! })) === canon(x)));
check('Los códigos tienen su número (ALU-014 → 14)', numberOfId('ALU-014') === 14 && numberOfId('TIT-001') === 1);
check('Errores de la base: lo propio (EN001) tal cual; el documento repetido, el titular con alumnos y lo técnico se traducen',
  peopleErrorMessage({ code: 'EN001', message: 'El DNI debe tener 8 dígitos.' }) === 'El DNI debe tener 8 dígitos.'
  && /documento ya está registrado/.test(peopleErrorMessage({ code: '23505', message: 'duplicate key value violates unique constraint "alumnos_documento_unico"' }))
  && /alumnos a su cargo/.test(peopleErrorMessage({ code: '23503', message: 'violates foreign key constraint on table "alumno_titulares"' }))
  && !/constraint|violates|duplicate/i.test(peopleErrorMessage({ code: 'XX000', message: 'violates constraint x duplicate' })) && /permiso/.test(peopleErrorMessage({ code: '42501', message: 'permission denied' })));

// ------------------------------------------------------------------------------------------------------------------ Las personas de una matrícula
const person = (extra: Partial<ReturnType<typeof emptyPerson>> = {}) => ({ ...emptyPerson(), docType: 'DNI' as const, docNumber: '40111222', names: 'Rosa', lastNameP: 'León', lastNameM: 'Vera', birthDate: '1985-03-04', phone: '987000111', address: 'Jr. Lima 10', civilStatus: 'Soltero(a)', ...extra });
const ds = (key: string, p: ReturnType<typeof emptyPerson>, extra: Record<string, unknown> = {}) => ({
  ...emptyStudent(), key, person: p, relationship: 'Hijo(a)', situation: 'estudiando' as const, institutionType: 'Colegio', school: 'I.E. Prueba', grade: '2.º primaria', startDate: '2026-11-20', ...extra,
});
const draftOf = (extra: Partial<EnrollmentDraft> = {}): EnrollmentDraft => ({ ...emptyDraft(TODAY, 'FIL-002'), ...extra });

const nuevoTodo = draftOf({ holders: [person(), person({ docNumber: '40222333', names: 'Luis', phone: '987000222' })], students: [ds('S1', person({ docNumber: '70111222', names: 'Ana', birthDate: '2016-05-06', phone: '' })), ds('S2', person({ docNumber: '70111223', names: 'Beto', birthDate: '2014-02-03', phone: '' }), { relationship: 'Sobrino(a)' })] });
let plan = planEnrollmentPeople(nuevoTodo);
check('Un registro con titulares y alumnos nuevos guarda a todos, con sus vínculos por clave, y nada más',
  !plan.empty && plan.payload.titulares.length === 2 && plan.payload.alumnos.length === 2 && plan.payload.actualizaciones.length === 0
  && plan.payload.titulares[0].clave === holderKey(0) && plan.payload.titulares[1].clave === holderKey(1) && plan.payload.titulares[0].parentesco === 'Hijo(a)' && plan.payload.titulares[1].parentesco === null
  && JSON.stringify((plan.payload.alumnos[0] as { titulares: string[] }).titulares) === JSON.stringify(['H0', 'H1']) && (plan.payload.alumnos[0] as { telefono: string }).telefono === ''
  && (plan.payload.alumnos[1] as { parentesco: string }).parentesco === 'Sobrino(a)' && (plan.payload.alumnos[0] as { fecha_inicio: string }).fecha_inicio === '2026-11-20');
const created = { titulares: { H0: 'TIT-006', H1: 'TIT-007' }, alumnos: { S1: 'ALU-006', S2: 'ALU-007' } };
const after = withCreatedPeople(nuevoTodo, created);
check('Con las personas ya guardadas, el borrador las trae como «ya registradas» (con su código) y no se vuelven a crear',
  after.holders[0].existingId === 'TIT-006' && after.holders[1].existingId === 'TIT-007' && after.students[0].person.existingId === 'ALU-006' && after.students[1].person.existingId === 'ALU-007'
  && after.holders.every(h => h.source === 'existente') && planEnrollmentPeople(after).payload.titulares.length === 0 && planEnrollmentPeople(after).payload.alumnos.length === 0);
check('Al matricular a alguien que ya existía solo se actualiza su fecha de inicio y su situación', (() => {
  const p = planEnrollmentPeople(after).payload.actualizaciones;
  return p.length === 2 && p[0].id === 'ALU-006' && p[0].fecha_inicio === '2026-11-20' && p[0].situacion === 'estudiando' && p[0].colegio === 'I.E. Prueba';
})());
const mixto = draftOf({ holders: [person({ existingId: 'TIT-001', source: 'existente' })], students: [ds('S1', person({ existingId: 'ALU-001', source: 'existente', docNumber: S[0].doc }), { situation: 'ninguna', startDate: '' }), ds('S2', person({ docNumber: '70555666', names: 'Cris', birthDate: '2015-01-02', phone: '' }))] });
plan = planEnrollmentPeople(mixto);
check('Con un titular que ya existía no se crea otro, y el alumno nuevo se vincula a él por su código',
  plan.payload.titulares.length === 0 && plan.payload.alumnos.length === 1 && JSON.stringify((plan.payload.alumnos[0] as { titulares: string[] }).titulares) === JSON.stringify(['TIT-001']));
check('Un alumno que ya existía y cambia a «ninguna» limpia lo que ya no corresponde', (() => {
  const u = plan.payload.actualizaciones[0];
  return plan.payload.actualizaciones.length === 1 && u.id === 'ALU-001' && u.situacion === 'ninguna' && u.colegio === null && u.grado === null && u.tipo_institucion === null && u.fecha_inicio === null;
})());
const indep = draftOf({ mode: 'independiente', holders: [person({ docNumber: '70333444', names: 'Dora', birthDate: '2000-01-01', phone: '987333444' })], students: [ds('S1', person(), { relationship: '' })] });
plan = planEnrollmentPeople(indep);
check('Un alumno independiente se guarda sin titulares y con su propio teléfono', plan.payload.titulares.length === 0 && plan.payload.alumnos.length === 1
  && (plan.payload.alumnos[0] as { telefono: string }).telefono === '987333444' && (plan.payload.alumnos[0] as { titulares: string[] }).titulares.length === 0 && (plan.payload.alumnos[0] as { parentesco: string }).parentesco === ''
  && (plan.payload.alumnos[0] as { documento: string }).documento === '70333444');
const afterIndep = withCreatedPeople(indep, { titulares: {}, alumnos: { S1: 'ALU-008' } });
check('En modo independiente la persona del alumno 1 queda registrada con su código', afterIndep.holders[0].existingId === 'ALU-008' && planEnrollmentPeople(afterIndep).payload.alumnos.length === 0);
check('Si todas las personas ya existían y no cambia nada, no hay nada que guardar', planEnrollmentPeople(draftOf({ holders: [person({ existingId: 'TIT-001', source: 'existente' })], students: [] })).empty);

// ------------------------------------------------------------------------------------------------------------------ Operaciones con un repositorio en memoria
type Call = { fn: string; args: unknown[] };
const calls: Call[] = [];
let nextFail: string | null = null;
let rows = { guardians: [...G], students: [...S] };
const resultOf = <T,>(fn: string, args: unknown[], data: T) => { calls.push({ fn, args }); if (nextFail) { const e = nextFail; nextFail = null; return { ok: false, error: e } as { ok: boolean; data?: T; error?: string }; } return { ok: true, data }; };
const repo: PeopleRepository = {
  list: async () => resultOf('list', [], { guardians: rows.guardians, students: rows.students }),
  fetch: async ids => resultOf('fetch', [ids], { guardians: rows.guardians.filter(x => ids.guardianIds.includes(x.id)), students: rows.students.filter(x => ids.studentIds.includes(x.id)) }),
  createPeople: async payload => {
    const out = resultOf('createPeople', [payload], { titulares: {} as Record<string, string>, alumnos: {} as Record<string, string> });
    if (out.ok && out.data) {
      payload.titulares.forEach((t, i) => { const id = `TIT-0${60 + i}`; out.data!.titulares[String(t.clave)] = id; rows.guardians.push({ ...guardian(), id, doc: String(t.documento ?? id) }); });
      payload.alumnos.forEach((a, i) => { const id = `ALU-0${60 + i}`; out.data!.alumnos[String(a.clave)] = id; rows.students.push({ ...student(), id, doc: String(a.documento ?? id) }); });
    }
    return out;
  },
  editGuardian: async (id, payload) => resultOf('editGuardian', [id, payload], null),
  editStudent: async (id, payload) => resultOf('editStudent', [id, payload], null),
  removeGuardian: async id => resultOf('removeGuardian', [id], null),
  removeStudent: async id => resultOf('removeStudent', [id], null),
};
const ctx = (): PeopleContext => ({ guardians: rows.guardians, students: rows.students, today: TODAY });
const reset = () => { calls.length = 0; nextFail = null; rows = { guardians: [...G], students: [...S] }; };
const fns = () => calls.map(c => c.fn).join(',');

reset();
let res = await loadPeople(repo);
check('Se leen de la base los titulares y los alumnos', res.ok && res.value?.guardians.length === 5 && res.value?.students.length === 5);
reset(); nextFail = 'No hay conexión con el servidor. Revise su internet e intente de nuevo.';
res = await loadPeople(repo);
check('Si la lectura falla, se devuelve el motivo', !res.ok && /conexión/.test(res.error ?? ''));

reset();
let gr = await createGuardian(repo, ctx(), guardian({ phone: '1' }));
check('Un titular inválido no llega a la base', !gr.ok && calls.length === 0);
gr = await createGuardian(repo, ctx(), guardian({ doc: G[0].doc }));
check('Un titular con un documento ya registrado no llega a la base', !gr.ok && /ya está registrado/.test(gr.error ?? '') && calls.length === 0);
gr = await createGuardian(repo, ctx(), guardian());
check('Un titular válido se guarda y se vuelve a leer: se devuelve tal como quedó, con su código', gr.ok && gr.value?.id === 'TIT-060' && fns() === 'createPeople,fetch');
reset(); nextFail = 'El documento 40111222 ya está registrado.';
gr = await createGuardian(repo, ctx(), guardian());
check('Si la base rechaza, el motivo llega tal cual y no se relee nada', !gr.ok && /ya está registrado/.test(gr.error ?? '') && fns() === 'createPeople');

reset();
let st = await createStudent(repo, ctx(), student({ guardianIds: [] }));
check('Un alumno independiente sin teléfono no llega a la base', !st.ok && calls.length === 0);
st = await createStudent(repo, ctx(), student({ guardianIds: ['TIT-001', 'TIT-002'] }));
check('Un alumno con titulares se guarda con ellos en orden, y se vuelve a leer', st.ok && st.value?.id === 'ALU-060' && fns() === 'createPeople,fetch'
  && JSON.stringify((calls[0].args[0] as { alumnos: { titulares: string[] }[] }).alumnos[0].titulares) === JSON.stringify(['TIT-001', 'TIT-002']));

reset();
let ch = await changeGuardian(repo, ctx(), 'TIT-999', { phone: '987654321' });
check('Editar un titular que no existe se rechaza', !ch.ok && /No se encontró/.test(ch.error ?? '') && calls.length === 0);
ch = await changeGuardian(repo, ctx(), 'TIT-001', { doc: G[1].doc });
check('No se le pone a un titular el documento de otro', !ch.ok && calls.length === 0);
ch = await changeGuardian(repo, ctx(), 'TIT-001', { phone: '987654321' });
check('Se edita solo lo que viene y se vuelve a leer', ch.ok && fns() === 'editGuardian,fetch' && JSON.stringify(calls[0].args[1]) === JSON.stringify({ telefono: '987654321' }));
reset();
let cs = await changeStudent(repo, ctx(), 'ALU-001', { guardianIds: [] });
check('Quitarle los titulares a un alumno sin darle teléfono no llega a la base', !cs.ok && calls.length === 0);
cs = await changeStudent(repo, ctx(), 'ALU-001', { guardianIds: [], relationship: '', phone: '987654321' });
check('Un alumno puede pasar a independiente con su teléfono', cs.ok && fns() === 'editStudent,fetch');
reset();
cs = await changeStudent(repo, ctx(), 'ALU-001', { name: 'Mateo Nuevo Ruiz', names: 'Mateo Nuevo' });
check('Cambiar el nombre de un alumno se guarda y devuelve el alumno releído', cs.ok && cs.value?.id === 'ALU-001');

reset();
let del = await deleteGuardian(repo, ctx(), 'TIT-001');
check('Un titular con alumnos no se elimina y no llega a la base', !del.ok && /alumnos/.test(del.error ?? '') && calls.length === 0);
del = await deleteGuardian(repo, ctx(), 'TIT-999');
check('Eliminar un titular que no existe se rechaza', !del.ok);
rows.students = rows.students.filter(x => !x.guardianIds.includes('TIT-001'));
del = await deleteGuardian(repo, ctx(), 'TIT-001');
check('Un titular sin alumnos se elimina', del.ok && fns() === 'removeGuardian');
reset();
del = await deleteStudent(repo, ctx(), 'ALU-001');
check('Un alumno se elimina (lo que sigue en memoria lo comprueba quien llama)', del.ok && fns() === 'removeStudent');
del = await deleteStudent(repo, ctx(), 'ALU-999');
check('Eliminar un alumno que no existe se rechaza', !del.ok);

reset();
const saved = await savePeopleForEnrollment(repo, planEnrollmentPeople(nuevoTodo).payload);
check('Las personas de una matrícula se guardan en UNA operación y se devuelve el código de cada una y lo guardado',
  saved.ok && fns() === 'createPeople,fetch' && saved.value?.created.titulares.H0 === 'TIT-060' && saved.value?.created.alumnos.S2 === 'ALU-061' && saved.value?.fresh.guardians.length === 2 && saved.value?.fresh.students.length === 2);
reset(); nextFail = 'El documento 70111222 ya está registrado.';
const savedFail = await savePeopleForEnrollment(repo, planEnrollmentPeople(nuevoTodo).payload);
check('Si la base rechaza, no se relee nada y el motivo llega tal cual', !savedFail.ok && fns() === 'createPeople' && /ya está registrado/.test(savedFail.error ?? ''));

// ------------------------------------------------------------------------------------------------------------------ La carga de partida
const seedFile = read('supabase/seed/personas_de_ejemplo.sql');
check('La carga de partida está al día con los datos de ejemplo (npx tsx scripts/doc-personas-seed.ts)', seedFile === renderPeopleSeedSql());
check('Los 5 titulares y 5 alumnos de ejemplo cumplen las reglas (documento válido, titulares mayores de edad, situación y parentesco)',
  G.every(x => guardianRecordError(x, G, SEED_REFERENCE_DAY, x.id) === null) && S.every(x => studentRecordError(x, S, G, SEED_REFERENCE_DAY, x.id) === null),
  [...G.map(x => guardianRecordError(x, G, SEED_REFERENCE_DAY, x.id)), ...S.map(x => studentRecordError(x, S, G, SEED_REFERENCE_DAY, x.id))].filter(Boolean).join(' | '));
check('Los códigos de ejemplo se conservan en la carga (TIT-001…, ALU-001…) porque las matrículas de ejemplo en memoria los nombran',
  G.every(x => guardianToSeedRow(x).numero === numberOfId(x.id)) && S.every(x => studentToSeedRow(x).numero === numberOfId(x.id))
  && seed.enrollments.every(e => S.some(x => x.id === e.studentId) && e.guardianIds.every(id => G.some(x => x.id === id))));
check('La carga es repetible y no pisa nada: solo se carga si todavía no hay personas, y los códigos siguientes continúan', /if exists \(select 1 from public\.titulares\) or exists \(select 1 from public\.alumnos\)/.test(seedFile)
  && /perform setval\(pg_get_serial_sequence\('public\.titulares'/.test(seedFile) && /perform setval\(pg_get_serial_sequence\('public\.alumnos'/.test(seedFile));
check('La carga lleva solo personas (sin matrículas, planes ni pagos)', !/insert into public\.(matriculas|planes|pagos)/.test(seedFile));

// ------------------------------------------------------------------------------------------------------------------ Cableado
const migration = read('supabase/migrations/20261110100000_titulares_y_alumnos.sql');
const down = read('supabase/deshacer/20261110100000_titulares_y_alumnos.down.sql');
const repoSrc = read('src/services/peopleRepository.ts');
const rpcNames = [...repoSrc.matchAll(/rpc(?:<[^>]*>)?\('([a-z_]+)'/g)].map(x => x[1]);
const publicFns = new Set([...migration.matchAll(/create function public\.([a-z_]+)\(/g)].map(x => x[1]));
check('Las funciones de la base que llama el repositorio existen en la migración y no sobra ninguna', rpcNames.length === 3 && rpcNames.every(n => publicFns.has(n)) && [...publicFns].every(n => rpcNames.includes(n)));
check('Las tablas que lee o escribe el repositorio existen en la migración', ['titulares', 'alumnos', 'alumno_titulares'].every(t => new RegExp(`create table public\\.${t} \\(`).test(migration) && repoSrc.includes(`'${t}'`)));
const required = [...new Set([...migration.matchAll(/(?:array\[|tiene_funcion\(|, )'([a-z-]+:[a-z_]+)'/g)].map(x => x[1]))];
check('Las funciones del registro que nombra la migración existen', required.length >= 15 && required.every(id => !!capabilityById(id)), required.filter(id => !capabilityById(id)).join());
const readers = (entity: string) => ALL_CAPABILITIES.filter(c => (c as { reads?: string[] }).reads?.includes(entity)).map(c => c.id).sort().join();
const listOf = (fn: string) => {
  const m = new RegExp(`function app\\.${fn}\\(\\)[\\s\\S]*?array\\[([^\\]]*)\\]`).exec(migration);
  return (m?.[1].match(/'([a-z-]+:[a-z_]+)'/g) ?? []).map(x => x.slice(1, -1)).sort().join();
};
check('Quién lee a los alumnos y a los titulares son exactamente las funciones que, en el registro, leen un alumno o un titular (si se agrega una, la lista de la base se actualiza)',
  listOf('puede_leer_alumnos') === readers('student') && listOf('puede_leer_titulares') === readers('guardian'), `${listOf('puede_leer_alumnos')} ≠ ${readers('student')} | ${listOf('puede_leer_titulares')} ≠ ${readers('guardian')}`);
check('Nadie escribe las tablas directo (solo se leen y se elimina con función); todo cambia por funciones', /grant select, delete on public\.titulares, public\.alumnos to authenticated/.test(migration) && /grant select on public\.alumno_titulares to authenticated/.test(migration)
  && !/\.from\('(titulares|alumnos|alumno_titulares)'\)\s*\.(insert|update|upsert)/.test(repoSrc));
check('Un titular con alumnos no se elimina y un alumno no se queda sin su vínculo huérfano (la base lo impide)', /create trigger titulares_no_eliminar before delete/.test(migration) && /on delete cascade/.test(migration));
check('Lo derivable no se guarda: ni el nombre completo, ni la edad, ni el estado, ni el programa ni la sede', !/nombre_completo|\bedad\b\s+(integer|int)|\bestado\b\s+text|programa_id|sede_id/.test(migration.split('create function app.persona_validar_comun')[0].split('create table public.titulares')[1] ?? ''));
check('Hay script para deshacer', /drop table if exists public\.alumnos/.test(down) && /drop function if exists public\.crear_personas/.test(down));

const ctxSrc = read('src/context/DataContext.tsx');
check('El contexto ya no guarda titulares ni alumnos en memoria: usa los de la base (usePeople)', !/useState<Guardian\[\]>|useState<Student\[\]>|setGuardians|setStudents/.test(ctxSrc) && /const people = usePeople\(peopleData\)/.test(ctxSrc));
const iface = ctxSrc.slice(ctxSrc.indexOf('interface DataContextType'), ctxSrc.indexOf('export const DataContext ='));
check('Las acciones de personas y matricular son asíncronas y devuelven { ok, error }', ['addStudent', 'updateStudent', 'deleteStudent', 'addGuardian', 'updateGuardian', 'deleteGuardian', 'registerEnrollments']
  .every(a => new RegExp(`\\n  ${a}: .*=> Promise<`).test(iface)));
check('Esas acciones ya no están entre las que lanzan error al negar el permiso (ahora devuelven resultado)', ['addStudent', 'updateStudent', 'addGuardian', 'updateGuardian'].every(a => !THROWS_ON_DENIAL.has(a)));
check('Matricular guarda primero las personas en la base (todo o nada) y después matricula a esas personas ya registradas; antes de guardar a nadie comprueba todo el borrador',
  /planEnrollmentPeople\(draft\)/.test(ctxSrc) && /people\.saveForEnrollment\(plan\.payload\)/.test(ctxSrc) && /withCreatedPeople\(draft, saved\.value\.created\)/.test(ctxSrc)
  && ctxSrc.indexOf('const checked = buildEnrollmentBatch') < ctxSrc.indexOf('people.saveForEnrollment'));
check('Cambiar el nombre de un alumno sigue corrigiendo la copia en matrículas y agenda (una sola puerta)', /syncStudentName\(id, res\.value\.name, enrollments, schedules\)/.test(ctxSrc));
const gate = read('src/components/auth/AccessGate.tsx');
check('Titulares y alumnos se leen de la base al iniciar sesión, junto con lo demás', /loadPeople\(peopleRepo\)/.test(gate) && /loaded\.logistics, loaded\.people, loaded\.money, loaded\.cashBoxes\)/.test(gate) && /people=\{people\}/.test(read('src/App.tsx')));
check('Las pantallas esperan la respuesta de la base antes de seguir (formularios y asistente) y apagan el botón mientras guardan',
  /await data\.registerEnrollments\(draft\)/.test(read('src/pages/NewEnrollmentWizard.tsx')) && /await (updateStudent|addStudent)/.test(read('src/pages/people/StudentFormModal.tsx'))
  && /await (updateGuardian|addGuardian)/.test(read('src/pages/people/GuardianFormModal.tsx')) && /disabled=\{saving\}/.test(read('src/pages/people/GuardianFormModal.tsx')) && /disabled=\{saving\}/.test(read('src/pages/people/StudentFormModal.tsx')));
check('El asistente exige que un titular nuevo sea mayor de 18 años (igual que la base)', /debe ser mayor de 18 años/.test(read('src/utils/enrollment.ts')));

if (failed > 0) {
  console.log(`\n${failed} comprobaciones fallaron.`);
  process.exit(1);
}
console.log('\nTodas las comprobaciones pasaron.');
