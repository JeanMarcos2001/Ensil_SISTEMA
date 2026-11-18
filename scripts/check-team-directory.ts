/**
 * Verificación del directorio del equipo (migración 0025): lo mínimo que cualquier cuenta con acceso vigente puede leer del equipo de las sedes que alcanza para
 * ELEGIR y NOMBRAR responsables (una asesoría, una actividad, una entrevista, quien atiende una matrícula) sin tener «Ver personal» ni «Ver asignaciones».
 *  - traducción de las filas del directorio al modelo (`utils/staffDb.ts`): los datos personales que no entrega quedan vacíos;
 *  - la mezcla con lo que la cuenta ya lee: la ficha completa manda, el directorio solo agrega a quien falta;
 *  - lo que pasa en las pantallas: la lista de responsables, el nombre del responsable de una asesoría y la resolución de su id, con SOLO el directorio;
 *  - la migración 0025 (lo que entrega y lo que NO, quién ve a quién, permisos y «deshacer») y el cableado del repositorio.
 * La base se prueba aparte contra una copia (cuentas sin «Ver personal», de dos sedes, personas inactivas y asignaciones cerradas).
 * Ejecutar: npx tsx scripts/check-team-directory.ts
 */
import { readFileSync } from 'node:fs';
import type { Assignment, Staff } from '../src/context/DataContext';
import { agendaFromRows, EMPTY_AGENDA, resolveResponsibleId } from '../src/utils/agendaDb';
import { getInterviewerOptions } from '../src/utils/enrollment';
import { responsiblesByBranch } from '../src/utils/enrollmentChange';
import { assignmentFromDirectory, mergeAssignmentsWithDirectory, mergeStaffWithDirectory, staffFromDirectory, EMPTY_DIRECTORY, type DirectorioAsignacionRow, type DirectorioPersonaRow } from '../src/utils/staffDb';
import type { Place } from '../src/utils/assignments';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : ` -> ${detail}`}`);
  if (!ok) failed++;
};
const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

const places: Place[] = [{ id: 'FIL-001', name: 'Los Olivos', kind: 'sede', status: 'Activo' }, { id: 'FIL-003', name: 'Chiclayo', kind: 'sede', status: 'Activo' }];
const branches = [{ id: 'FIL-001', name: 'Los Olivos', status: 'Activo' }, { id: 'FIL-003', name: 'Chiclayo', status: 'Activo' }];
const people: DirectorioPersonaRow[] = [
  { id: 'STF-003', codigo: '000003', nombres: 'Carla', apellido_paterno: 'Campos', apellido_materno: null, estado: 'Activo' },
  { id: 'STF-004', codigo: '000004', nombres: 'Julieta', apellido_paterno: 'Rivas', apellido_materno: 'Soto', estado: 'Activo' },
];
const asg: DirectorioAsignacionRow[] = [
  { id: 'ASG-003', personal_id: 'STF-003', sede_id: 'FIL-003', area: 'Administración', fecha_inicio: '2026-11-10', es_principal: true, estado: 'Activa' },
  { id: 'ASG-004', personal_id: 'STF-004', sede_id: 'FIL-003', area: 'Psicopedagogía', fecha_inicio: '2026-11-18', es_principal: true, estado: 'Activa' },
];

// ------------------------------------------------------------------------------------------------------------------ Filas → modelo
const julieta = staffFromDirectory(people[1]!);
check('Una persona del directorio sale con su código, nombres, apellidos y estado; lo personal que el directorio no entrega (documento, nacimiento, teléfono) queda vacío',
  julieta.id === 'STF-004' && julieta.code === '000004' && julieta.names === 'Julieta' && julieta.lastNameP === 'Rivas' && julieta.lastNameM === 'Soto' && julieta.status === 'Activo'
  && julieta.docNumber === '' && julieta.docType === '' && julieta.birthDate === '' && julieta.phone === '' && julieta.personalEmail === undefined && julieta.address === undefined && staffFromDirectory(people[0]!).lastNameM === '');
const a4 = assignmentFromDirectory(asg[1]!, places);
check('Una asignación del directorio sale activa, con el nombre de su sede, su área y si es la principal; sin acceso al sistema ni datos de cierre',
  a4.id === 'ASG-004' && a4.staffId === 'STF-004' && a4.branch === 'Chiclayo' && a4.placeId === 'FIL-003' && a4.placeKind === 'sede' && a4.area === 'Psicopedagogía' && a4.status === 'Activa' && a4.isMain === true
  && a4.startDate === '2026-11-18' && a4.endDate === undefined && a4.hasAccess === false && a4.closeReason === undefined && a4.closedBy === undefined);

// ------------------------------------------------------------------------------------------------------------------ La mezcla con lo que la cuenta ya lee
const full: Staff[] = [{ ...staffFromDirectory(people[0]!), docNumber: '33333333', birthDate: '1990-05-01', phone: '987654321' }];
const merged = mergeStaffWithDirectory(full, people);
check('La ficha completa manda: quien la cuenta ya leyó conserva todos sus datos y del directorio solo se agrega a quien falta, en el orden de su código',
  merged.map(s => s.id).join() === 'STF-003,STF-004' && merged[0]!.docNumber === '33333333' && merged[0]!.phone === '987654321' && merged[1]!.docNumber === '' && merged[1]!.names === 'Julieta');
check('Si no falta nadie la lista queda tal cual (la misma, sin copiar), y sin directorio también', mergeStaffWithDirectory(full, [people[0]!]) === full && mergeStaffWithDirectory(full, EMPTY_DIRECTORY.personal) === full);
const fullAsg: Assignment[] = [{ ...assignmentFromDirectory(asg[0]!, places), hasAccess: true, observations: 'Con acceso' }];
const mergedAsg = mergeAssignmentsWithDirectory(fullAsg, asg, places);
check('Lo mismo con las asignaciones: la completa manda (conserva su acceso y sus observaciones) y se agregan las activas que faltan',
  mergedAsg.map(a => a.id).join() === 'ASG-003,ASG-004' && mergedAsg[0]!.hasAccess === true && mergedAsg[0]!.observations === 'Con acceso' && mergedAsg[1]!.area === 'Psicopedagogía'
  && mergeAssignmentsWithDirectory(fullAsg, [asg[0]!], places) === fullAsg);

// ------------------------------------------------------------------------------------------------------------------ Lo que pasa en las pantallas, con SOLO el directorio
const staffOnly = mergeStaffWithDirectory([], people);
const asgOnly = mergeAssignmentsWithDirectory([], asg, places);
const options = getInterviewerOptions({ staff: staffOnly, assignments: asgOnly, branches: branches as never }, 'FIL-003');
check('Con SOLO el directorio (una cuenta sin «Ver personal»), la lista de responsables de Psicopedagogía trae a Julieta Rivas, de Chiclayo: el caso de la pantalla de Reservar asesoría',
  options.length === 1 && options[0]!.staff.id === 'STF-004' && options[0]!.branchName === 'Chiclayo' && getInterviewerOptions({ staff: [], assignments: [], branches: branches as never }, 'FIL-003').length === 0,
  JSON.stringify(options));
check('El personal de Administración no aparece como responsable de Psicopedagogía', !options.some(o => o.staff.id === 'STF-003') && responsiblesByBranch(staffOnly, asgOnly, branches as never)['FIL-003']!.join() === 'Julieta Rivas');
check('El nombre que se guarda con la asesoría se resuelve a su id de Personal (y ese id es el que la base exige)', resolveResponsibleId('Julieta Rivas', staffOnly, asgOnly, 'Chiclayo') === 'STF-004');
{
  const state = agendaFromRows({ ...EMPTY_AGENDA, asesorias: [{ id: 'SES-001', alumno_id: 'ALU-002', sede_id: 'FIL-003', fecha: '2026-11-25', hora: '16:00', responsable_id: 'STF-004', estado: 'Reservado', observaciones: null, es_primera: false, registro_id: null, matricula_id: null }] },
    { students: [{ id: 'ALU-002', name: 'Sofía Díaz' }], enrollments: [], staff: staffOnly, branches: [] });
  const none = agendaFromRows({ ...EMPTY_AGENDA, asesorias: [{ id: 'SES-001', alumno_id: 'ALU-002', sede_id: 'FIL-003', fecha: '2026-11-25', hora: '16:00', responsable_id: 'STF-004', estado: 'Reservado', observaciones: null, es_primera: false, registro_id: null, matricula_id: null }] },
    { students: [{ id: 'ALU-002', name: 'Sofía Díaz' }], enrollments: [], staff: [], branches: [] });
  check('El responsable de cada asesoría se muestra con su nombre aunque la cuenta no tenga «Ver personal» (sin el directorio salía en blanco)',
    state.schedules[0]!.responsible === 'Julieta Rivas' && state.schedules[0]!.responsibleId === 'STF-004' && none.schedules[0]!.responsible === '' && none.schedules[0]!.responsibleId === 'STF-004');
}

// ------------------------------------------------------------------------------------------------------------------ La migración 0025
const sql = read('supabase/migrations/20261118100000_directorio_del_equipo.sql');
const down = read('supabase/deshacer/20261118100000_directorio_del_equipo.down.sql');
const code = sql.replace(/--[^\n]*/g, '');
check('La función es de la base, corre con los permisos del dueño y la pueden llamar solo las cuentas con sesión',
  /create function public\.directorio_equipo\(\) returns jsonb\s+language plpgsql stable security definer set search_path = ''/.test(sql) && /revoke execute on function public\.directorio_equipo\(\) from public, anon;/.test(sql)
  && /grant execute on function public\.directorio_equipo\(\) to authenticated;/.test(sql) && !/on all functions in schema app/.test(code));
const personSelect = code.match(/select p\.id, p\.codigo[^\n]*from public\.personal p/)?.[0] ?? '';
const asgSelect = code.match(/select a\.id, a\.personal_id[^\n]*\n/)?.[0] ?? '';
check('De cada persona entrega SOLO código, nombres, apellidos y estado; de cada asignación, la persona, la sede, el área, desde cuándo, si es la principal y su estado',
  /select p\.id, p\.codigo, p\.nombres, p\.apellido_paterno, p\.apellido_materno, p\.estado\s+from public\.personal p/.test(code) && /select a\.id, a\.personal_id, a\.sede_id, a\.area, a\.fecha_inicio, a\.es_principal, a\.estado/.test(code), `${personSelect}\n${asgSelect}`);
check('NO entrega documento, nacimiento, teléfono, correo, dirección, observaciones, contratos ni sueldos',
  !/numero_documento|tipo_documento|fecha_nacimiento|telefono|correo_personal|direccion|observaciones|motivo|cerrada_por|con_acceso|public\.contratos|contratos_pago|sueldo/i.test(code.replace(/comment on function[^;]*;/g, '')));
check('Quién ve a quién: las personas ACTIVAS de las sedes que la cuenta alcanza (`app.ve_sede`) y la propia; solo asignaciones ACTIVAS en una sede (el almacén no se incluye); sin acceso vigente devuelve vacío',
  /a\.estado = 'Activa' and a\.sede_id is not null and p\.estado = 'Activo' and app\.ve_sede\(a\.sede_id\)/.test(code) && /where p\.estado = 'Activo' and \(/.test(code)
  && /c\.id = auth\.uid\(\) and c\.personal_id = p\.id/.test(code) && /if auth\.uid\(\) is null or not app\.acceso_vigente\(\) then\s+return jsonb_build_object\('personal', '\[\]'::jsonb, 'asignaciones', '\[\]'::jsonb\)/.test(code));
check('La migración se puede deshacer (quita la función)', /drop function if exists public\.directorio_equipo\(\);/.test(down));

// ------------------------------------------------------------------------------------------------------------------ Cableado
const repoSrc = read('src/services/staffRepository.ts');
const hookSrc = read('src/hooks/useStaffDirectory.ts');
check('El repositorio llama al directorio al leer el personal y las asignaciones y solo AGREGA a lo que la cuenta ya leyó (la ficha completa gana)',
  /client\.rpc\('directorio_equipo'\)/.test(repoSrc) && /mergeStaffWithDirectory\(\(full\.data as PersonalRow\[\]\)\.map\(staffFromRow\), directory\.personal\)/.test(repoSrc)
  && /mergeAssignmentsWithDirectory\(\(full\.data as AsignacionRow\[\]\)\.map\(r => assignmentFromRow\(r, places\)\), directory\.asignaciones, places\)/.test(repoSrc));
check('Si el directorio falla o la función todavía no existe, el sistema sigue con lo que la cuenta leyó (no bloquea el inicio de sesión)',
  /if \(error \|\| !data \|\| typeof data !== 'object'\) return EMPTY_DIRECTORY;/.test(repoSrc) && /full\.error \? failure\(full\.error\)/.test(repoSrc));
check('El gancho no cambia: carga con el repositorio cuando ya están las sedes y vuelve a leer las asignaciones después de cada cambio', /repo\.listStaff\(\)/.test(hookSrc) && /repo\.listAssignments\(placesRef\.current\)/.test(hookSrc));

if (failed > 0) {
  console.log(`\n${failed} comprobaciones fallaron.`);
  process.exit(1);
}
console.log('\nTodo en verde.');
