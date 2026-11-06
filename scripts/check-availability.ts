/**
 * Verificación de las reglas del paso 9: vacaciones y ceses frente a la agenda, y renovación de contratos.
 * Ejecutar: npx tsx scripts/check-availability.ts
 */
import type { Contract, PayrollRun, Schedule, Staff } from '../src/context/DataContext';
import { validateContractForm, contractStatus, emptyContractForm } from '../src/utils/payroll';
import { responsibleOptions, validateResponsible } from '../src/utils/psyActivities';
import { buildRenewal, markRenewed, renewalBlock, renewalForm, renewedBy, validateRenewal } from '../src/utils/contractRenewal';
import type { FlatActivity } from '../src/utils/schedule';
import {
  absencesOf, absentBetween, agendaBetween, ceseAgendaError, responsibleUnavailable, sessionResponsibleUnavailable, unavailableOn, vacationAgendaError,
} from '../src/utils/staffAvailability';
import { CONTRACT_STATUSES } from '../src/utils/statuses';
import { EXPIRY_DAYS } from '../src/utils/reportStaff';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : ` -> ${detail}`}`);
  if (!ok) failed++;
};

const today = '2026-10-23';

// ------------------------------------------------------------------------------------------------------------------ Datos de prueba
const staff = (id: string, names: string, lastNameP: string, o: Partial<Staff> = {}): Staff => ({ id, names, lastNameP, lastNameM: 'X', status: 'Activo', ...o } as Staff);
const juan = staff('1', 'Juan', 'Pérez');
const maria = staff('2', 'María', 'Torres');
const luis = staff('3', 'Luis', 'Rojas');
const contract = (id: string, staffId: string, o: Partial<Contract> = {}): Contract => ({
  id, staffId, type: 'Plazo Fijo', startDate: '2026-01-01', endDate: '2026-12-31', status: 'Vigente', pensionSystem: 'ONP', grossSalary: 2500, ...o,
} as Contract);
const sch = (id: string, o: Partial<Schedule> = {}): Schedule => ({
  id, student: 'Alumno', studentId: 'S1', program: 'Kids', level: 'Nivel 1', date: '2026-11-12', time: '16:00', duration: 60, responsible: 'Lic. Juan Pérez', status: 'Reservado', branchId: 'PIU', ...o,
});
const act = (id: string, o: Partial<FlatActivity> = {}): FlatActivity => ({
  id, monthlyId: '1', activityId: id, branchId: 'PIU', sede: 'Piura', name: `Act ${id}`, date: '2026-11-14', start: '16:00', end: '18:00', responsible: '', responsibleId: '1', capacity: 10, enrolled: [], attendance: {}, ...o,
});
const withVacations = (o: Partial<Contract> = {}) => contract('C1', '1', { vacationStart: '2026-11-10', vacationEnd: '2026-11-20', ...o });

// ------------------------------------------------------------------------------------------------------------------ Quién no está cuándo
const vac = [withVacations()];
check('De vacaciones: ausente del inicio al retorno, ambos días incluidos', ['2026-11-10', '2026-11-15', '2026-11-20'].every(d => unavailableOn('1', d, vac) !== null) && ['2026-11-09', '2026-11-21'].every(d => unavailableOn('1', d, vac) === null));
check('El mensaje dice cuándo son las vacaciones', /vacaciones del 10 Nov 2026 al 20 Nov 2026/.test(unavailableOn('1', '2026-11-12', vac) ?? ''), unavailableOn('1', '2026-11-12', vac) ?? '');
check('Las vacaciones de un contrato ya cesado o renovado no cuentan como vacaciones', absencesOf('1', [withVacations({ status: 'Cesado', endDate: '2026-06-30' })]).every(x => x.kind !== 'Vacaciones') && absencesOf('1', [withVacations({ status: 'Renovado' })]).length === 0);
check('Las vacaciones de otra persona no afectan', unavailableOn('2', '2026-11-12', vac) === null);
check('Un contrato sin vacaciones no ausenta a nadie', absencesOf('1', [contract('C1', '1')]).length === 0);

const ceased = [contract('C1', '1', { status: 'Cesado', endDate: '2026-10-31', terminationReason: 'Renuncia' })];
check('Tras el cese no está: desde el día siguiente, sin fin', unavailableOn('1', '2026-11-01', ceased) !== null && unavailableOn('1', '2027-06-01', ceased) !== null && unavailableOn('1', '2026-10-31', ceased) === null);
check('El mensaje del cese dice cuándo cesó', /cesó el 31 Oct 2026/.test(unavailableOn('1', '2026-11-05', ceased) ?? ''));
check('Si vuelve con otro contrato, solo falta entre medio', (() => {
  const back = [...ceased, contract('C2', '1', { startDate: '2026-12-01' })];
  return unavailableOn('1', '2026-11-15', back) !== null && unavailableOn('1', '2026-12-01', back) === null && unavailableOn('1', '2026-11-30', back) !== null;
})());
check('Un contrato vencido sin cerrar ni renovar NO ausenta a la persona (lo avisa la alerta de contratos)', unavailableOn('1', '2027-02-01', [contract('C1', '1')]) === null);
check('Un rango se cruza con las vacaciones si se toca aunque sea un día', absentBetween('1', '2026-11-18', '2026-11-25', vac) !== undefined && absentBetween('1', '2026-11-21', '2026-11-25', vac) === undefined && absentBetween('1', '2026-11-01', undefined, vac) !== undefined);

// ------------------------------------------------------------------------------------------------------------------ Responsable
check('Una persona de vacaciones no puede ser responsable ese día, y el mensaje la nombra', (() => {
  const m = responsibleUnavailable(juan, '2026-11-12', vac) ?? '';
  return /Juan Pérez/.test(m) && /vacaciones/.test(m) && /no puede ser responsable/.test(m);
})());
check('Sí puede serlo fuera de sus vacaciones', responsibleUnavailable(juan, '2026-11-21', vac) === null);
check('El responsable de una asesoría (texto con título) se reconoce y se revisa', sessionResponsibleUnavailable('Lic. Juan Pérez', '2026-11-12', [juan, maria], vac) !== null && sessionResponsibleUnavailable('Lic. María Torres', '2026-11-12', [juan, maria], vac) === null);
check('Un responsable que no es del personal, o vacío, no se bloquea (no hay ficha que revisar)', sessionResponsibleUnavailable('Externo Ninguno', '2026-11-12', [juan], vac) === null && sessionResponsibleUnavailable('', '2026-11-12', [juan], vac) === null);
check('Quien cesó no puede ser responsable de una asesoría posterior', sessionResponsibleUnavailable('Juan Pérez', '2026-11-05', [juan], ceased) !== null);

const area = (id: string, staffId: string, branch = 'Piura') => ({ id, staffId, branch, area: 'Psicopedagogía', hasAccess: true, startDate: '2023-01-01', isMain: true, status: 'Activa' }) as never;
const rctx = (unavailable?: (id: string, date: string) => string | null) => ({ schedules: [] as Schedule[], activities: [] as FlatActivity[], staff: [juan, maria], assignments: [area('a1', '1'), area('a2', '2')], branches: [{ id: 'PIU', name: 'Piura' }], unavailable });
const activity = act('a', { responsibleId: undefined });
check('Asignar como responsable de una actividad a quien está de vacaciones se rechaza', validateResponsible(activity, '1', rctx((id, d) => unavailableOn(id, d, vac))).length === 1 && /vacaciones/.test(validateResponsible(activity, '1', rctx((id, d) => unavailableOn(id, d, vac)))[0]));
check('Sin la regla de disponibilidad, todo sigue como antes (compatibilidad)', validateResponsible(activity, '1', rctx()).length === 0);
check('En la lista de responsables, quien está de vacaciones aparece con el cruce marcado', (() => {
  const o = responsibleOptions(activity, rctx((id, d) => unavailableOn(id, d, vac)));
  return o.find(x => x.staff.id === '1')!.conflicts.some(c => /vacaciones/.test(c)) && o.find(x => x.staff.id === '2')!.conflicts.length === 0;
})());

// ------------------------------------------------------------------------------------------------------------------ Agenda frente a vacaciones y cese
const agenda = (o: { schedules?: Schedule[]; activities?: FlatActivity[] } = {}) => ({ schedules: o.schedules ?? [], activities: o.activities ?? [] });
check('La agenda de una persona entre dos fechas: asesorías pendientes y actividades a su cargo', (() => {
  const a = agendaBetween(juan, '2026-11-10', '2026-11-20', agenda({ schedules: [sch('s1'), sch('s2', { status: 'Cancelado' }), sch('s3', { status: 'Asistió' }), sch('s4', { date: '2026-12-01' }), sch('s5', { responsible: 'Lic. María Torres' })], activities: [act('a1'), act('a2', { date: '2026-12-10' })] }));
  return a.sessions.map(s => s.id).join() === 's1' && a.activities.map(x => x.id).join() === 'a1';
})());
check('No se programan vacaciones sobre su agenda: el mensaje cuenta asesorías y actividades y dice qué hacer', (() => {
  const m = vacationAgendaError(juan, '2026-11-10', '2026-11-20', today, agenda({ schedules: [sch('s1'), sch('s6', { date: '2026-11-13' })], activities: [act('a1')] })) ?? '';
  return /2 asesorías y 1 actividad durante esas vacaciones/.test(m) && /reasígnelas primero en Psicopedagogía → Programación/.test(m);
})());
check('Sin agenda en esas fechas, las vacaciones se pueden programar', vacationAgendaError(juan, '2026-11-10', '2026-11-20', today, agenda({ schedules: [sch('s4', { date: '2026-12-01' })] })) === null);
check('Una asesoría que ya pasó o ya se atendió no impide programar vacaciones', vacationAgendaError(juan, '2026-11-10', '2026-11-20', today, agenda({ schedules: [sch('s3', { status: 'Asistió' })] })) === null);
check('El formulario del contrato rechaza vacaciones que cruzan la agenda', (() => {
  const form = { ...emptyContractForm(), staffId: '1', type: 'Plazo Fijo', startDate: '2026-01-01', endDate: '2026-12-31', grossSalary: '2500', pensionSystem: 'ONP', vacationStart: '2026-11-10', vacationEnd: '2026-11-20' };
  const crossed = validateContractForm(form, [], [juan], today, undefined, agenda({ schedules: [sch('s1')] }));
  const clean = validateContractForm(form, [], [juan], today, undefined, agenda());
  return !!crossed.vacationStart && /asesoría/.test(crossed.vacationStart) && !clean.vacationStart;
})());
check('Al editar un contrato sin tocar las vacaciones no se vuelve a exigir lo que ya estaba', (() => {
  const c = withVacations();
  const form = { ...emptyContractForm(), staffId: '1', type: 'Plazo Fijo', startDate: '2026-01-01', endDate: '2026-12-31', grossSalary: '2500', pensionSystem: 'ONP', vacationStart: '2026-11-10', vacationEnd: '2026-11-20' };
  return !validateContractForm(form, [c], [juan], today, 'C1', agenda({ schedules: [sch('s1')] })).vacationStart;
})());
check('Cesar: la agenda posterior al cese lo impide; la del día del cese y antes, no', (() => {
  const after = ceseAgendaError(juan, '2026-11-01', agenda({ schedules: [sch('s1')], activities: [act('a1')] })) ?? '';
  const sameDay = ceseAgendaError(juan, '2026-11-12', agenda({ schedules: [sch('s1')] }));
  return /1 asesoría y 1 actividad después de su cese/.test(after) && sameDay === null;
})());
check('Cesar a quien no tiene agenda posterior se puede', ceseAgendaError(luis, '2026-11-01', agenda({ schedules: [sch('s1')] })) === null);

// ------------------------------------------------------------------------------------------------------------------ Renovación de contratos
check('«Renovado» es un estado del contrato (además de Vigente y Cesado)', (CONTRACT_STATUSES as readonly string[]).includes('Renovado') && contractStatus({ status: 'Renovado', endDate: '2026-01-01' }, today) === 'Renovado');
const expiring = contract('C1', '1', { endDate: '2026-11-10' });
const expired = contract('C1', '1', { endDate: '2026-09-30' });
check(`Se renueva un contrato que vence en ${EXPIRY_DAYS} días o menos, o que ya venció`, renewalBlock(expiring, today) === null && renewalBlock(expired, today) === null);
check('No se renueva uno que vence más adelante, ni uno indeterminado, ni uno cesado o ya renovado', renewalBlock(contract('C1', '1', { endDate: '2027-06-30' }), today) !== null
  && renewalBlock(contract('C1', '1', { type: 'Indeterminado', endDate: undefined }), today) !== null && renewalBlock(contract('C1', '1', { status: 'Cesado' }), today) !== null && renewalBlock(contract('C1', '1', { status: 'Renovado' }), today) !== null);
const input = { endDate: '2027-11-10', grossSalary: '', reason: 'Buen desempeño' };
const none: PayrollRun[] = [];
check('Un contrato nuevo empieza el día siguiente al fin del anterior, con las mismas condiciones', (() => {
  const f = renewalForm(expiring, input);
  return f.startDate === '2026-11-11' && f.endDate === '2027-11-10' && f.grossSalary === '2500' && f.pensionSystem === 'ONP' && f.type === 'Plazo Fijo' && f.vacationStart === '';
})());
check('La renovación válida no tiene problemas', validateRenewal(expiring, input, [expiring], [juan], none, today).length === 0, validateRenewal(expiring, input, [expiring], [juan], none, today).join(' | '));
check('Pide el motivo (mínimo 5 letras) y la nueva fecha de fin', validateRenewal(expiring, { ...input, reason: 'ok' }, [expiring], [juan], none, today).length > 0 && validateRenewal(expiring, { ...input, endDate: '' }, [expiring], [juan], none, today).length > 0);
check('La nueva fecha de fin debe ser posterior al inicio del contrato nuevo', validateRenewal(expiring, { ...input, endDate: '2026-11-11' }, [expiring], [juan], none, today).some(m => /posterior/.test(m)));
check('Un sueldo nuevo se valida como el de un contrato (no menor a la RMV)', validateRenewal(expiring, { ...input, grossSalary: '100' }, [expiring], [juan], none, today).some(m => /remuneración mínima/.test(m)));
check('No se renueva encima de otro contrato posterior de la misma persona', validateRenewal(expiring, input, [expiring, contract('C9', '1', { startDate: '2026-12-01', status: 'Cesado' })], [juan], none, today).some(m => /empieza después/.test(m)));
check('Con una planilla cerrada de ese mes o posterior, se pide reabrirla primero', validateRenewal(expiring, input, [expiring], [juan], [{ status: 'Cerrada', period: '2026-11' }], today).some(m => /planilla cerrada/.test(m)));
check('Una planilla en borrador o de un mes anterior no estorba', validateRenewal(expiring, input, [expiring], [juan], [{ status: 'Borrador', period: '2026-11' }, { status: 'Cerrada', period: '2026-10' }], today).length === 0);
check('El contrato anterior sigue siendo el único «vigente» hasta renovar (la regla de un solo vigente no estorba a la renovación)', validateRenewal(expiring, input, [expiring], [juan], none, today).length === 0);
const built = buildRenewal(expiring, { ...input, grossSalary: '3000' }, juan, 2026);
check('El contrato nuevo nace vigente, con el sueldo nuevo, el neto calculado, sin vacaciones y con el vínculo y el motivo', built.status === 'Vigente' && built.grossSalary === 3000 && (built.netSalary ?? 0) > 0 && built.vacationStart === undefined && built.renewsId === 'C1' && /Buen desempeño/.test(built.observations ?? ''));
check('Sin sueldo nuevo se mantiene el anterior', buildRenewal(expiring, input, juan, 2026).grossSalary === 2500);
check('La renovación conserva el cargo del contrato anterior', buildRenewal({ ...expiring, position: 'Psicólogo Senior' }, input, juan, 2026).position === 'Psicólogo Senior');
check('El anterior queda «Renovado» sin perder su fecha de fin; a cuál dio paso se deduce', (() => {
  const old = markRenewed(expiring);
  const next = { ...built, id: 'C2' } as Contract;
  return old.status === 'Renovado' && old.endDate === '2026-11-10' && renewedBy(old, [old, next]) === 'C2' && renewedBy(next, [old, next]) === undefined;
})());
check('Tras renovar, la persona tiene un solo contrato vigente y el nuevo cubre desde el día siguiente (la planilla los toma por fechas)', (() => {
  const all = [markRenewed(expiring), { ...built, id: 'C2' } as Contract];
  const vigentes = all.filter(c => contractStatus(c, today) === 'Vigente');
  return vigentes.length === 1 && vigentes[0].startDate === '2026-11-11' && all[0].endDate === '2026-11-10';
})());

console.log(failed === 0 ? '\nTodo en orden.' : `\n${failed} verificaciones fallaron.`);
process.exit(failed === 0 ? 0 : 1);
