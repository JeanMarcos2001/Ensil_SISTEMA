/**
 * Verificación de Personas: trabajadores, contratos (sueldo neto estimado), titulares y alumnos.
 * Ejecutar: npx tsx scripts/check-people.ts
 */
import type { Contract, Guardian, Staff, Student } from '../src/context/DataContext';
import { emptyPerson } from '../src/utils/enrollment';
import {
  AFP_FUNDS,
  CONTRACT_TYPES,
  MIN_WAGE,
  buildContract,
  contractStatus,
  emptyContractForm,
  estimateNet,
  hasPension,
  hasVacations,
  needsEndDate,
  pensionRate,
  validateContractForm,
  type ContractForm,
} from '../src/utils/payroll';
import {
  NO_ENROLLMENT,
  buildGuardian,
  buildStudent,
  guardianToPerson,
  studentToInput,
  validateGuardian,
  validateStudentInput,
  type StudentInput,
} from '../src/utils/people';
import {
  buildStaff,
  emptyStaffForm,
  nextStaffCode,
  staffToForm,
  validateStaffForm,
  type StaffForm,
} from '../src/utils/staff';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : ` -> ${detail}`}`);
  if (!ok) failed++;
};
const TODAY = '2026-10-22';

// ================================================================ Trabajadores
const existing: Staff[] = [
  { id: '1', code: '000001', docType: 'DNI', docNumber: '12345678', names: 'Juan', lastNameP: 'Pérez', lastNameM: 'García', birthDate: '1985-05-15', age: 41, phone: '987654321', status: 'Activo' },
  { id: '2', code: '000007', docType: 'DNI', docNumber: '87654321', names: 'María', lastNameP: 'Torres', lastNameM: 'López', birthDate: '1990-08-20', age: 36, phone: '912345678', status: 'Activo' },
];
const goodStaff = (over: Partial<StaffForm> = {}): StaffForm => ({
  ...emptyStaffForm(), docNumber: '70112233', gender: 'Femenino', names: 'Ana María', lastNameP: 'Quispe', lastNameM: 'Rojas',
  birthDate: '1992-03-04', civilStatus: 'Soltero(a)', phone: '987123456', address: 'Av. Las Flores 123, Lima',
  educationLevel: 'Licenciado', profession: 'Psicóloga', ...over,
});
const errs = (f: StaffForm, editingId?: string) => validateStaffForm(f, existing, TODAY, editingId);

check('Ficha completa → sin errores', Object.keys(errs(goodStaff())).length === 0);
check('Ficha vacía → marca todos los obligatorios (documento, género, nombres, apellido paterno, nacimiento, estado civil, celular, dirección, grado, profesión)',
  ['docNumber', 'gender', 'names', 'lastNameP', 'birthDate', 'civilStatus', 'phone', 'address', 'educationLevel', 'profession'].every(k => k in errs(emptyStaffForm())));
check('El correo, el apellido materno, la especialidad y las observaciones son opcionales', (() => { const e = errs(goodStaff({ lastNameM: '', personalEmail: '', specialty: '', observations: '' })); return !('lastNameM' in e) && !('personalEmail' in e); })());
check('No existe el correo institucional en la ficha', !('institutionalEmail' in emptyStaffForm()) && !('institutionalEmail' in buildStaff(goodStaff(), TODAY)));
check('DNI de 8 dígitos', !!errs(goodStaff({ docNumber: '1234' })).docNumber && !errs(goodStaff({ docNumber: '70112233' })).docNumber);
check('CE o pasaporte: 6 a 12 caracteres', !errs(goodStaff({ docType: 'CE', docNumber: 'AB1234567' })).docNumber && !!errs(goodStaff({ docType: 'CE', docNumber: 'AB1' })).docNumber);
check('Documento repetido en el personal → rechazado; al editar a la misma persona → permitido', /ya está registrado/.test(errs(goodStaff({ docNumber: '12345678' })).docNumber ?? '') && !errs(goodStaff({ docNumber: '12345678' }), '1').docNumber);
check('Nombres solo con letras', !!errs(goodStaff({ names: 'Ana 2' })).names && !errs(goodStaff({ names: "D'Angelo-Ruiz" })).names);
check('Menor de 18 años → rechazado; justo 18 → permitido', !!errs(goodStaff({ birthDate: '2010-01-01' })).birthDate && !errs(goodStaff({ birthDate: '2008-10-22' })).birthDate);
check('Nacimiento futuro o de hace más de 80 años → rechazado', !!errs(goodStaff({ birthDate: '2027-01-01' })).birthDate && !!errs(goodStaff({ birthDate: '1930-01-01' })).birthDate);
check('Celular: 9 dígitos y empieza con 9', !!errs(goodStaff({ phone: '12345' })).phone && !!errs(goodStaff({ phone: '887654321' })).phone && !errs(goodStaff({ phone: '912345678' })).phone);
check('Correo personal con formato', !!errs(goodStaff({ personalEmail: 'juan@' })).personalEmail && !errs(goodStaff({ personalEmail: 'juan@gmail.com' })).personalEmail);
check('Dirección muy corta → rechazada', !!errs(goodStaff({ address: 'Lima' })).address);
check('Con hijos: el número es obligatorio (1 a 20)', !!errs(goodStaff({ hasChildren: true, childrenCount: '' })).childrenCount && !!errs(goodStaff({ hasChildren: true, childrenCount: '0' })).childrenCount && !errs(goodStaff({ hasChildren: true, childrenCount: '2' })).childrenCount);
check('Sin hijos no se pide el número', !('childrenCount' in errs(goodStaff({ hasChildren: false }))));
check('Código correlativo de 6 dígitos (sigue al más alto)', nextStaffCode(existing) === '000008' && nextStaffCode([]) === '000001');
const built = buildStaff(goodStaff({ hasChildren: true, childrenCount: '2', specialty: ' ' }), TODAY, undefined, existing);
check('La edad se calcula de la fecha de nacimiento, el estado queda Activo y se recortan los textos', built.age === 34 && built.status === 'Activo' && built.code === '000008' && built.childrenCount === 2 && built.specialty === undefined);
check('Editar conserva código y estado', buildStaff(goodStaff(), TODAY, { code: '000002', status: 'Inactivo' }).code === '000002' && buildStaff(goodStaff(), TODAY, { code: '000002', status: 'Inactivo' }).status === 'Inactivo');
check('Ida y vuelta ficha → formulario', staffToForm({ ...existing[0], hasChildren: true, childrenCount: 3, gender: 'Masculino' }).childrenCount === '3');

// ================================================================ Contratos y sueldo neto
check('No existe la jornada part time: todos los contratos son Full time', buildContract({ ...emptyContractForm(), staffId: '1', type: 'Indeterminado', startDate: '2026-11-01', grossSalary: '3000', pensionSystem: 'ONP' }).shift === 'Full time');
check('Tipos de contrato', CONTRACT_TYPES.join() === 'Indeterminado,Plazo Fijo,Locación de servicios');
check('ONP: 13 % del bruto', pensionRate('Indeterminado', 'ONP', '') === 0.13 && estimateNet(2800, 'Plazo Fijo', 'ONP', '')?.net === 2436 && estimateNet(2800, 'Plazo Fijo', 'ONP', '')?.contribution === 364);
check('AFP: fondo 10 % + seguro + comisión de la AFP elegida (sin «tipo de comisión»)', Math.abs(pensionRate('Indeterminado', 'AFP', 'Integra') - 0.1292) < 1e-9 && Math.abs(pensionRate('Indeterminado', 'AFP', 'Habitat') - 0.1284) < 1e-9);
check('Cada AFP tiene su tasa', AFP_FUNDS.every(f => pensionRate('Indeterminado', 'AFP', f) > 0.12 && pensionRate('Indeterminado', 'AFP', f) < 0.14));
check('Neto estimado AFP Integra sobre 3500', estimateNet(3500, 'Indeterminado', 'AFP', 'Integra')?.net === 3047.8 && estimateNet(3500, 'Indeterminado', 'AFP', 'Integra')?.contribution === 452.2);
check('Locación de servicios: sin aportes, neto = bruto', estimateNet(2000, 'Locación de servicios', '', '')?.net === 2000 && pensionRate('Locación de servicios', 'ONP', '') === 0);
check('Sin sueldo, sin sistema o AFP sin fondo → sin estimación', estimateNet(0, 'Indeterminado', 'ONP', '') === null && estimateNet(2000, 'Indeterminado', '', '') === null && estimateNet(2000, 'Indeterminado', 'AFP', '') === null);

const contracts: Contract[] = [
  { id: 'C1', staffId: '1', type: 'Indeterminado', startDate: '2023-01-01', status: 'Vigente' },
  { id: 'C2', staffId: '2', type: 'Plazo Fijo', startDate: '2023-06-01', endDate: '2024-06-01', status: 'Vigente' },
];
const goodContract = (over: Partial<ContractForm> = {}): ContractForm => ({
  ...emptyContractForm(), staffId: '1', type: 'Plazo Fijo', startDate: '2026-11-01', endDate: '2027-10-31', grossSalary: '2500', pensionSystem: 'AFP', pensionFund: 'Prima', ...over,
});
const cerrs = (f: ContractForm, list: Contract[] = []) => validateContractForm(f, list, existing, TODAY);
check('Contrato completo → sin errores', Object.keys(cerrs(goodContract())).length === 0);
check('Vacío → trabajador, tipo, inicio y sueldo son obligatorios', ['staffId', 'type', 'startDate', 'grossSalary'].every(k => k in cerrs(emptyContractForm())));
check('Plazo fijo y locación exigen fecha de fin posterior al inicio; el indeterminado no la tiene',
  !!cerrs(goodContract({ endDate: '' })).endDate && !!cerrs(goodContract({ endDate: '2026-11-01' })).endDate &&
  !!cerrs(goodContract({ type: 'Locación de servicios', endDate: '', pensionSystem: '' })).endDate &&
  !('endDate' in cerrs(goodContract({ type: 'Indeterminado', endDate: '' }))) && !needsEndDate('Indeterminado'));
check('Sueldo mínimo S/ 1,130 en contratos dependientes; la locación solo pide mayor a 0', MIN_WAGE === 1130 && !!cerrs(goodContract({ grossSalary: '1000' })).grossSalary && !('grossSalary' in cerrs(goodContract({ type: 'Locación de servicios', grossSalary: '500', pensionSystem: '' }))));
check('Sueldo en cero, negativo o desmedido → rechazado', !!cerrs(goodContract({ grossSalary: '0' })).grossSalary && !!cerrs(goodContract({ grossSalary: '-5' })).grossSalary && !!cerrs(goodContract({ grossSalary: '999999' })).grossSalary);
check('Sistema de pensiones obligatorio salvo locación; con AFP, la AFP es obligatoria', !!cerrs(goodContract({ pensionSystem: '' })).pensionSystem && !!cerrs(goodContract({ pensionFund: '' })).pensionFund && !('pensionFund' in cerrs(goodContract({ pensionSystem: 'ONP', pensionFund: '' }))) && !hasPension('Locación de servicios'));
check('Vacaciones: las dos fechas o ninguna; el retorno no antes del inicio; dentro del contrato',
  !!cerrs(goodContract({ vacationStart: '2027-01-10' })).vacationEnd && !!cerrs(goodContract({ vacationEnd: '2027-01-20' })).vacationStart &&
  !!cerrs(goodContract({ vacationStart: '2027-01-20', vacationEnd: '2027-01-10' })).vacationEnd && !!cerrs(goodContract({ vacationStart: '2026-10-01', vacationEnd: '2026-10-10' })).vacationStart &&
  !!cerrs(goodContract({ vacationStart: '2027-10-20', vacationEnd: '2027-11-10' })).vacationEnd && Object.keys(cerrs(goodContract({ vacationStart: '2027-01-10', vacationEnd: '2027-01-24' }))).length === 0);
check('La locación no tiene vacaciones', !hasVacations('Locación de servicios'));
check('Un trabajador con contrato vigente no puede tener otro', /ya tiene un contrato vigente/.test(cerrs(goodContract({ staffId: '1' }), contracts).staffId ?? ''));
check('Un contrato de plazo fijo vencido ya no impide crear otro', !('staffId' in cerrs(goodContract({ staffId: '2' }), contracts)) && contractStatus(contracts[1], TODAY) === 'Vencido');
check('Estado real: vigente con fecha de fin futura sigue vigente; cesado se mantiene', contractStatus({ status: 'Vigente', endDate: '2027-01-01' }, TODAY) === 'Vigente' && contractStatus({ status: 'Cesado', endDate: '2020-01-01' }, TODAY) === 'Cesado');
const bc = buildContract(goodContract({ grossSalary: '2500', vacationStart: '2027-01-10', vacationEnd: '2027-01-24' }));
check('El neto y los aportes se calculan, no se escriben', bc.grossSalary === 2500 && bc.contribution === 324.25 && bc.netSalary === 2175.75 && bc.status === 'Vigente' && bc.pensionFund === 'Prima');
check('Indeterminado: sin fecha de fin guardada; locación: sin pensión ni vacaciones',
  buildContract(goodContract({ type: 'Indeterminado', endDate: '2030-01-01' })).endDate === undefined &&
  (() => { const l = buildContract(goodContract({ type: 'Locación de servicios', pensionSystem: 'AFP', vacationStart: '2027-01-10', vacationEnd: '2027-01-12' })); return l.pensionSystem === undefined && l.pensionFund === undefined && l.vacationStart === undefined && l.netSalary === 2500 && l.contribution === 0; })());

// ================================================================ Titulares
const guardians: Guardian[] = [
  { id: '1', name: 'Juan Ruiz', doc: '40111222', phone: '987654321', email: 'j@x.com', students: 1, enrollments: 1, balance: '$0' },
  { id: '2', name: 'María del Carmen Castro Pérez', doc: '40333444', phone: '912345678', email: 'm@x.com', students: 0, enrollments: 0, balance: '$0' },
];
const goodGuardian = (over: Record<string, unknown> = {}) => ({
  ...emptyPerson(), docNumber: '41555666', names: 'Rosa', lastNameP: 'Vega', lastNameM: 'Díaz', birthDate: '1988-02-10', phone: '987000111',
  address: 'Jr. Lima 100', civilStatus: 'Casado(a)', email: 'rosa@gmail.com', ...over,
});
const gerrs = (p: ReturnType<typeof goodGuardian>, id?: string) => validateGuardian(p, guardians, TODAY, id);
check('Titular completo → válido', gerrs(goodGuardian()).length === 0);
check('Titular: teléfono (9 dígitos), dirección y estado civil son obligatorios', gerrs(goodGuardian({ phone: '' })).length === 1 && gerrs(goodGuardian({ address: '' })).length === 1 && gerrs(goodGuardian({ civilStatus: '' })).length === 1);
check('El titular debe ser mayor de edad', gerrs(goodGuardian({ birthDate: '2012-01-01' })).some(m => /mayor de 18/.test(m)));
check('Documento ya registrado → rechazado; al editar a sí mismo → permitido', gerrs(goodGuardian({ docNumber: '40111222' })).some(m => /ya está registrado/.test(m)) && gerrs(goodGuardian({ docNumber: '40111222' }), '1').length === 0);
const gb = buildGuardian(goodGuardian());
check('Titular guardado con la misma forma que el asistente', gb.name === 'Rosa Vega Díaz' && gb.doc === '41555666' && gb.direccion === 'Jr. Lima 100' && gb.civilStatus === 'Casado(a)' && gb.docType === 'DNI');
check('Titular antiguo sin nombres separados → se deducen del nombre', (() => { const p = guardianToPerson(guardians[1]); return p.names === 'María del Carmen' && p.lastNameP === 'Castro' && p.lastNameM === 'Pérez'; })());

// ================================================================ Alumnos
const students: Student[] = [
  { id: 'ALU-001', doc: '76543210', name: 'Mateo Ruiz', age: 8, program: 'Kids - Nivel 1', titular: 'Juan Ruiz', status: 'Activo', guardianIds: ['1'], relationship: 'Hijo(a)' },
];
const input = (over: Partial<StudentInput> = {}, studentOver: Record<string, unknown> = {}): StudentInput => ({
  mode: 'apoderado',
  guardianIds: ['1'],
  student: {
    key: 'k', person: { ...emptyPerson(), docNumber: '70555666', names: 'Luz', lastNameP: 'Ruiz', lastNameM: 'Soto', birthDate: '2016-05-05' },
    relationship: 'Hijo(a)', situation: 'estudiando', institutionType: 'Colegio', school: 'I.E. San Martín', grade: '4° Primaria', occupation: '', workplace: '',
    programId: '', levelId: '', paymentTypeId: '', schedule: '', startDate: '', counselingDate: '', counselingTime: '', dueDates: [],
    ...studentOver,
  },
  ...over,
});
const serrs = (i: StudentInput, id?: string) => validateStudentInput(i, students, guardians, TODAY, id);
check('Alumno dependiente completo (sin teléfono) → válido', serrs(input()).length === 0);
check('Dependiente: titular y parentesco son obligatorios', serrs(input({ guardianIds: [] })).some(m => /titular/.test(m)) && serrs(input({}, { relationship: '' })).some(m => /parentesco/.test(m)));
check('Titular inexistente → rechazado', serrs(input({ guardianIds: ['99'] })).some(m => /ya no existe/.test(m)));
check('Independiente: teléfono obligatorio y sin titular ni parentesco', serrs(input({ mode: 'independiente', guardianIds: [] }, { relationship: '' })).some(m => /teléfono/.test(m)) &&
  serrs(input({ mode: 'independiente', guardianIds: [] }, { relationship: '', person: { ...emptyPerson(), docNumber: '70555666', names: 'Luz', lastNameP: 'Ruiz', birthDate: '1999-05-05', phone: '987654321' } })).length === 0);
check('Situación obligatoria; estudiando pide institución y grado; trabajando pide ocupación',
  serrs(input({}, { situation: '' })).some(m => /estudiando, trabajando/.test(m)) && serrs(input({}, { school: '' })).some(m => /institución/.test(m)) &&
  serrs(input({}, { situation: 'trabajando', occupation: '' })).some(m => /ocupación/.test(m)) && serrs(input({}, { situation: 'ninguna' })).length === 0);
check('Documento ya registrado → rechazado; al editar al mismo alumno → permitido', serrs(input({}, { person: { ...emptyPerson(), docNumber: '76543210', names: 'X', lastNameP: 'Y', birthDate: '2016-01-01' } })).some(m => /ya está registrado/.test(m)) &&
  serrs(input({}, { person: { ...emptyPerson(), docNumber: '76543210', names: 'X', lastNameP: 'Y', birthDate: '2016-01-01' } }), 'ALU-001').length === 0);
const sb = buildStudent(input(), guardians, TODAY);
check('Alumno nuevo: queda «Sin matrícula», con su titular principal, parentesco, edad y sin teléfono propio', sb.status === NO_ENROLLMENT && sb.program === '' && sb.titular === 'Juan Ruiz' && sb.guardianIds?.join() === '1' && sb.relationship === 'Hijo(a)' && sb.age === 10 && sb.phone === '');
check('Situación guardada solo lo que corresponde', sb.colegio === 'I.E. San Martín' && sb.grado === '4° Primaria' && sb.occupation === undefined && sb.occupationStatus === 'estudiando');
const sbi = buildStudent(input({ mode: 'independiente', guardianIds: ['1'] }, { relationship: 'Hijo(a)', person: { ...emptyPerson(), docNumber: '70555666', names: 'Luz', lastNameP: 'Ruiz', birthDate: '1999-05-05', phone: '987654321' } }), guardians, TODAY);
check('Independiente: es su propio titular, sin vínculos y con su teléfono', sbi.titular === 'Luz Ruiz' && sbi.guardianIds?.length === 0 && sbi.relationship === '' && sbi.phone === '987654321');
check('Editar conserva programa, horario y estado', (() => { const b = buildStudent(input(), guardians, TODAY, { program: 'Kids - Nivel 1', horario: 'L-M-V 4:00 PM', status: 'Activo' }); return b.program === 'Kids - Nivel 1' && b.horario === 'L-M-V 4:00 PM' && b.status === 'Activo'; })());
check('Ida y vuelta alumno → formulario', (() => { const i = studentToInput(students[0], guardians); return i.mode === 'apoderado' && i.guardianIds.join() === '1' && i.student.relationship === 'Hijo(a)' && i.student.person.names === 'Mateo'; })());

console.log(failed === 0 ? '\nTodo correcto.' : `\n${failed} caso(s) fallaron.`);
process.exit(failed === 0 ? 0 : 1);
