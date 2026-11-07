/**
 * Verificación de Contratos y Planilla en la base de datos (Lote 3): traducción de filas, operaciones (validar → guardar) con una base en memoria
 * que imita las reglas de las funciones de la base, y que la migración 0007, el código y las pantallas dicen lo mismo.
 * (La migración se prueba además contra Postgres en memoria con 121 casos antes de aplicarla; ver docs/PLANTILLA_SUPABASE.md.)
 * Ejecutar: npx tsx scripts/check-contracts-db.ts
 */
import { readFileSync, readdirSync } from 'node:fs';
import type { Assignment, Contract, PayrollRun, Staff } from '../src/context/DataContext';
import {
  addPayrollAdjustment, closeContract, closePayroll, createContract, deletePayrollDraft, editContract, generatePayroll, loadContractsPayroll, removePayrollAdjustment,
  renewContract, reopenPayroll, type ContractsContext, type ContractsPayrollRepository,
} from '../src/services/contractsPayroll';
import type { RepoResult } from '../src/services/orgDirectory';
import {
  adjustmentPayload, contractFromRows, contractPayload, linesPayload, runsFromRows, type AjusteRow, type ContratoPagoRow, type ContratoRow, type EventoRow, type LineaRow, type PlanillaRow, type RevisionRow,
} from '../src/utils/contractsDb';
import { companyInactivationError, dbErrorMessage, isIdConflict } from '../src/utils/orgDirectory';
import { AFP_FUNDS, CONTRACT_TYPES, PENSION_SYSTEMS, POSITION_MAX, POSITION_MIN, emptyContractForm, validateContractForm, type ContractForm } from '../src/utils/payroll';
import { linesOf, runIdOf, type PayrollContext } from '../src/utils/payrollRun';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : ` -> ${detail}`}`);
  if (!ok) failed++;
};
const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const today = '2026-11-07';

// ------------------------------------------------------------------------------------------------ Traducción de filas
const row = (o: Partial<ContratoRow> = {}): ContratoRow => ({
  id: 'CON-001', personal_id: 'STF-001', empresa_id: 'EMP-001', tipo: 'Plazo Fijo', cargo: 'Psicólogo Senior', fecha_inicio: '2026-01-01', fecha_fin: '2027-12-31', estado: 'Vigente', jornada: 'Full time',
  vacaciones_inicio: null, vacaciones_fin: null, motivo_cese: null, renueva_id: null, observaciones: null, ...o,
});
const pago = (o: Partial<ContratoPagoRow> = {}): ContratoPagoRow => ({ contrato_id: 'CON-001', sueldo_bruto: '3500.00', sistema_pension: 'AFP', afp: 'Integra', aporte: 452.2, renta: '84.88', asignacion_familiar: 113, neto: '3061.32', suspension_4ta: false, ...o });
const rev = (id: number, en: string): RevisionRow => ({ id, contrato_id: 'CON-001', en, por: 'Rosa', motivo: 'Promoción', cambios: [{ label: 'Cargo', from: 'A', to: 'B' }] });

const full = contractFromRows(row(), pago());
check('El contrato llega con su empresa, su cargo y su dinero (los números de la base, aunque vengan como texto)', full.companyId === 'EMP-001' && full.position === 'Psicólogo Senior' && full.grossSalary === 3500 && full.netSalary === 3061.32 && full.incomeTax === 84.88 && full.contribution === 452.2 && full.pensionFund === 'Integra' && full.shift === 'Full time' && full.status === 'Vigente');
const noPay = contractFromRows(row(), undefined);
check('Sin «Ver remuneraciones» la base no entrega el dinero: el contrato llega SIN sueldo ni pensión (pero con cargo y empresa)', noPay.grossSalary === undefined && noPay.netSalary === undefined && noPay.contribution === undefined && noPay.pensionSystem === undefined && noPay.position === 'Psicólogo Senior' && noPay.companyId === 'EMP-001');
check('Las modificaciones llegan con la más reciente primero y solo las de ese contrato', (() => {
  const c = contractFromRows(row(), pago(), [rev(1, '2026-03-01T10:00:00Z'), rev(2, '2026-05-01T10:00:00Z'), { ...rev(3, '2026-06-01T10:00:00Z'), contrato_id: 'CON-002' }]);
  return c.revisions?.length === 2 && c.revisions[0].at === '2026-05-01T10:00:00Z' && c.revisions[0].by === 'Rosa' && c.revisions[0].reason === 'Promoción' && contractFromRows(row(), pago(), []).revisions === undefined;
})());
check('Cesado, renovado, vacaciones y renovación se traducen', (() => {
  const c = contractFromRows(row({ estado: 'Cesado', motivo_cese: 'Renuncia', renueva_id: 'CON-000', vacaciones_inicio: '2026-07-01', vacaciones_fin: '2026-07-15', fecha_fin: '2026-10-01' }), pago({ suspension_4ta: true }));
  return c.status === 'Cesado' && c.terminationReason === 'Renuncia' && c.renewsId === 'CON-000' && c.vacationStart === '2026-07-01' && c.vacationEnd === '2026-07-15' && c.endDate === '2026-10-01' && c.suspension4ta === true;
})());
check('Un estado desconocido no rompe: se toma como vigente (la base ya lo restringe)', contractFromRows(row({ estado: 'Raro' }), pago()).status === 'Vigente');
check('El cuerpo que se manda a la base lleva la empresa y NO lleva código ni estado (los pone la base)', (() => {
  const p = contractPayload({ ...full, id: undefined } as never);
  return p.empresa_id === 'EMP-001' && p.personal_id === 'STF-001' && p.cargo === 'Psicólogo Senior' && p.sueldo_bruto === 3500 && p.neto === 3061.32 && p.fecha_fin === '2027-12-31' && !('id' in p) && !('estado' in p) && p.afp === 'Integra';
})());

const planilla = (o: Partial<PlanillaRow> = {}): PlanillaRow => ({ id: 'PLA-2026-10-EMP-001', empresa_id: 'EMP-001', periodo: '2026-10', estado: 'Cerrada', creada_en: '2026-11-01T10:00:00Z', creada_por: 'Paula', cerrada_en: '2026-11-02T10:00:00Z', cerrada_por: 'Paula', ...o });
const lineaOf = (name: string, contractId: string, staffId: string): never => ({ staffName: name, contractId, staffId, calc: { net: 1000 } }) as never;
const lineas: LineaRow[] = [
  { planilla_id: 'PLA-2026-10-EMP-001', contrato_id: 'CON-002', personal_id: 'STF-002', neto: 1000, linea: lineaOf('María Torres', 'CON-002', 'STF-002') },
  { planilla_id: 'PLA-2026-10-EMP-001', contrato_id: 'CON-001', personal_id: 'STF-001', neto: 1000, linea: lineaOf('Ana Cruz', 'CON-001', 'STF-001') },
  { planilla_id: 'PLA-2026-09-EMP-001', contrato_id: 'CON-001', personal_id: 'STF-001', neto: 1000, linea: lineaOf('Ana Cruz', 'CON-001', 'STF-001') },
];
const ajustes: AjusteRow[] = [{ id: 'AJU-001', planilla_id: 'PLA-2026-11-EMP-001', personal_id: 'STF-001', tipo: 'Ingreso', concepto: 'Bono', monto: '200.00', afecto: true, motivo: 'Metas', por: 'Paula', en: '2026-11-03T10:00:00Z' }];
const eventos: EventoRow[] = [
  { id: 2, planilla_id: 'PLA-2026-10-EMP-001', en: '2026-11-02T10:00:00Z', por: 'Paula', accion: 'Cerrada', detalle: '2 trabajador(es)' },
  { id: 1, planilla_id: 'PLA-2026-10-EMP-001', en: '2026-11-01T10:00:00Z', por: 'Paula', accion: 'Generada', detalle: null },
];
const runs = runsFromRows(
  [planilla(), planilla({ id: 'PLA-2026-11-EMP-001', periodo: '2026-11', estado: 'Borrador', cerrada_en: null, cerrada_por: null }), planilla({ id: 'PLA-2026-10-EMP-002', empresa_id: 'EMP-002' })],
  ajustes, lineas, eventos,
);
check('Las planillas llegan de la más reciente a la más antigua y, a igual mes, por empresa', runs.map(r => r.id).join() === 'PLA-2026-11-EMP-001,PLA-2026-10-EMP-001,PLA-2026-10-EMP-002');
check('Una cerrada trae la foto de sus líneas (por nombre), con quién y cuándo; no mezcla las de otra planilla', (() => {
  const r = runs.find(x => x.id === 'PLA-2026-10-EMP-001')!;
  return r.status === 'Cerrada' && r.companyId === 'EMP-001' && r.lines?.map(l => l.staffName).join() === 'Ana Cruz,María Torres' && r.closedBy === 'Paula' && r.closedAt === '2026-11-02T10:00:00Z' && r.createdBy === 'Paula';
})());
check('Un borrador no trae líneas (se recalcula con los contratos) pero sí sus ajustes; el monto llega como número', (() => {
  const r = runs.find(x => x.id === 'PLA-2026-11-EMP-001')!;
  return r.status === 'Borrador' && r.lines === undefined && r.adjustments.length === 1 && r.adjustments[0].amount === 200 && r.adjustments[0].taxable === true && r.adjustments[0].by === 'Paula' && r.closedAt === undefined;
})());
check('El historial va en orden y se traduce', (() => {
  const ev = runs.find(x => x.id === 'PLA-2026-10-EMP-001')!.events;
  return ev.length === 2 && ev[0].action === 'Generada' && ev[1].action === 'Cerrada' && ev[1].detail === '2 trabajador(es)' && ev[0].detail === undefined;
})());
check('Cuerpos de las funciones: el ajuste (sin quién ni cuándo) y la foto de las líneas con lo que la base comprueba', (() => {
  const a = adjustmentPayload({ id: 'AJU-001', staffId: 'STF-001', kind: 'Descuento', concept: 'Adelanto', amount: 100, taxable: true, reason: 'Pedido', by: 'x', at: 'y' });
  const l = linesPayload([lineaOf('A', 'CON-009', 'STF-009')]) as { contrato_id: string; personal_id: string; neto: number }[];
  return a.tipo === 'Descuento' && a.monto === 100 && !('por' in a) && !('by' in a) && l[0].contrato_id === 'CON-009' && l[0].personal_id === 'STF-009' && l[0].neto === 1000;
})());

// ------------------------------------------------------------------------------------------------ Base en memoria
function memoryRepo(initialContracts: Contract[] = [], initialRuns: PayrollRun[] = [], opts: { failList?: boolean } = {}) {
  const st = { contracts: structuredClone(initialContracts), runs: structuredClone(initialRuns), calls: [] as string[] };
  const dup = (id: string): RepoResult<null> => ({ ok: false, error: 'Este código de contrato ya está en uso.', idConflict: true, data: undefined });
  const repo: ContractsPayrollRepository = {
    async listContracts() { return opts.failList ? { ok: false, error: 'Sin conexión.' } : { ok: true, data: structuredClone(st.contracts) }; },
    async listPayroll() { return { ok: true, data: structuredClone(st.runs) }; },
    async createContract(id, c) { st.calls.push('createContract'); if (st.contracts.some(x => x.id === id)) return dup(id); st.contracts.push({ ...c, id }); return { ok: true, data: null }; },
    async editContract(id, c, reason, changes) { st.calls.push('editContract'); st.contracts = st.contracts.map(x => (x.id === id ? { ...x, ...c, id, revisions: [{ at: 'now', by: 'Rosa', reason, changes }, ...(x.revisions ?? [])] } : x)); return { ok: true, data: null }; },
    async closeContract(id, date, reason) { st.calls.push('closeContract'); st.contracts = st.contracts.map(x => (x.id === id ? { ...x, status: 'Cesado', endDate: date, terminationReason: reason } : x)); return { ok: true, data: null }; },
    async renewContract(prev, id, c) {
      st.calls.push('renewContract');
      if (st.contracts.some(x => x.id === id)) return dup(id);
      st.contracts = [...st.contracts.map(x => (x.id === prev ? { ...x, status: 'Renovado' as const } : x)), { ...c, id }];
      return { ok: true, data: null };
    },
    async generatePayroll(id, companyId, period) {
      st.calls.push('generatePayroll');
      st.runs.unshift({ id, companyId, period, status: 'Borrador', adjustments: [], createdAt: 'now', createdBy: 'Paula', events: [{ at: 'now', by: 'Paula', action: 'Generada' }] });
      return { ok: true, data: null };
    },
    async deletePayrollDraft(id) { st.calls.push('deletePayrollDraft'); st.runs = st.runs.filter(r => r.id !== id); return { ok: true, data: null }; },
    async addAdjustment(id, runId, a, detail) {
      st.calls.push('addAdjustment');
      if (st.runs.some(r => r.adjustments.some(x => x.id === id))) return { ok: false, error: 'dup', idConflict: true };
      st.runs = st.runs.map(r => (r.id === runId ? { ...r, adjustments: [...r.adjustments, { ...a, by: 'Paula', at: 'now' }], events: [...r.events, { at: 'now', by: 'Paula', action: 'Ajuste', detail }] } : r));
      return { ok: true, data: null };
    },
    async removeAdjustment(runId, adjId, detail) {
      st.calls.push('removeAdjustment');
      st.runs = st.runs.map(r => (r.id === runId ? { ...r, adjustments: r.adjustments.filter(a => a.id !== adjId), events: [...r.events, { at: 'now', by: 'Paula', action: 'Ajuste', detail }] } : r));
      return { ok: true, data: null };
    },
    async closePayroll(runId, lines, detail) {
      st.calls.push('closePayroll');
      st.runs = st.runs.map(r => (r.id === runId ? { ...r, status: 'Cerrada', lines, closedAt: 'now', closedBy: 'Paula', events: [...r.events, { at: 'now', by: 'Paula', action: 'Cerrada', detail }] } : r));
      return { ok: true, data: null };
    },
    async reopenPayroll(runId, reason) {
      st.calls.push('reopenPayroll');
      st.runs = st.runs.map(r => (r.id === runId ? { ...r, status: 'Borrador', lines: undefined, closedAt: undefined, closedBy: undefined, events: [...r.events, { at: 'now', by: 'Paula', action: 'Reabierta', detail: reason }] } : r));
      return { ok: true, data: null };
    },
  };
  return { repo, st };
}

const staff: Staff[] = [
  { id: 'STF-001', code: '000001', docType: 'DNI', docNumber: '10000001', names: 'Juan', lastNameP: 'Pérez', lastNameM: 'García', status: 'Activo', phone: '900000001', hasChildren: true } as Staff,
  { id: 'STF-002', code: '000002', docType: 'DNI', docNumber: '10000002', names: 'María', lastNameP: 'Torres', lastNameM: 'López', status: 'Activo', phone: '900000002' } as Staff,
];
const companies = [{ id: 'EMP-001', name: 'SILEE E.I.R.L.', ruc: '20610010289', status: 'Activo' as const }, { id: 'EMP-002', name: 'ENSIL EVOLUTION S.R.L.', ruc: '20612459313', status: 'Activo' as const }, { id: 'EMP-003', name: 'CERRADA', ruc: '20699999999', status: 'Inactivo' as const }];
const noAgenda = { schedules: [], activities: [] };
const ctxOf = (m: ReturnType<typeof memoryRepo>, o: Partial<ContractsContext> = {}): ContractsContext => ({ contracts: m.st.contracts, staff, companies, runs: m.st.runs, agenda: noAgenda, today, ...o });
const form = (o: Partial<ContractForm> = {}): ContractForm => ({
  ...emptyContractForm(), staffId: 'STF-001', companyId: 'EMP-001', type: 'Plazo Fijo', position: 'Psicólogo Senior', startDate: '2026-01-01', endDate: '2027-12-31', grossSalary: '3500', pensionSystem: 'AFP', pensionFund: 'Integra', ...o,
});

(async () => {
  // ---------------------------------------------------------------------------------------------- Empresa del contrato
  console.log('— Crear un contrato');
  const m1 = memoryRepo();
  let r = await createContract(m1.repo, ctxOf(m1), form({ companyId: '' }));
  check('La empresa es obligatoria (no llega a la base)', !r.ok && r.error === 'Seleccione la empresa que emplea al trabajador.' && m1.st.calls.length === 0);
  r = await createContract(m1.repo, ctxOf(m1), form({ companyId: 'EMP-099' }));
  check('La empresa debe existir', !r.ok && /no existe/.test(r.error!) && m1.st.calls.length === 0);
  r = await createContract(m1.repo, ctxOf(m1), form({ companyId: 'EMP-003' }));
  check('Y estar activa', !r.ok && /inactiva/.test(r.error!) && m1.st.calls.length === 0);
  r = await createContract(m1.repo, ctxOf(m1), form({ grossSalary: '100' }));
  check('Las reglas del contrato siguen valiendo (sueldo menor a la RMV)', !r.ok && /remuneración mínima/.test(r.error!) && m1.st.calls.length === 0);
  r = await createContract(m1.repo, ctxOf(m1), form());
  check('Se crea con el código CON-001 y su empresa', r.ok && r.value?.id === 'CON-001' && m1.st.contracts[0].companyId === 'EMP-001' && m1.st.contracts[0].position === 'Psicólogo Senior');
  check('El neto y los aportes se calculan con el motor de la planilla (nunca se escriben a mano)', m1.st.contracts[0].grossSalary === 3500 && m1.st.contracts[0].netSalary! > 0 && m1.st.contracts[0].netSalary! < 3500 + (m1.st.contracts[0].familyAllowance ?? 0) && (m1.st.contracts[0].contribution ?? 0) > 0);
  r = await createContract(m1.repo, ctxOf(m1), form({ companyId: 'EMP-002' }));
  check('Un trabajador tiene un solo contrato vigente (aunque sea de otra empresa)', !r.ok && /ya tiene un contrato vigente/.test(r.error!) && m1.st.contracts.length === 1);
  const m2 = memoryRepo([{ id: 'CON-001', staffId: 'STF-002', companyId: 'EMP-001', type: 'Indeterminado', startDate: '2025-01-01', status: 'Vigente' } as Contract]);
  r = await createContract(m2.repo, ctxOf(m2, { contracts: [] }), form());
  check('Si otra persona creó el mismo código a la vez, se reintenta con el siguiente', r.ok && r.value?.id === 'CON-002' && m2.st.calls.filter(c => c === 'createContract').length === 2, JSON.stringify(r));
  const m3 = memoryRepo(['CON-001', 'CON-002', 'CON-003'].map((id, i) => ({ id, staffId: `STF-9${i}`, companyId: 'EMP-001', type: 'Indeterminado', startDate: '2025-01-01', status: 'Vigente' }) as Contract));
  r = await createContract(m3.repo, ctxOf(m3, { contracts: [] }), form());
  check('Tras varios choques seguidos se rinde con un mensaje claro', !r.ok && /No se pudo asignar un código/.test(r.error!) && m3.st.calls.length === 3);

  // ---------------------------------------------------------------------------------------------- Editar
  console.log('— Editar un contrato');
  const cur = m1.st.contracts[0];
  const mEmp = memoryRepo();
  await createContract(mEmp.repo, ctxOf(mEmp), form());
  r = await editContract(mEmp.repo, ctxOf(mEmp), 'CON-001', form({ companyId: 'EMP-002' }), 'Lo emplea la otra empresa');
  check('La empresa de un contrato SÍ se puede cambiar (no depende de la sede donde trabaja): queda en el historial como «Empresa»', r.ok && mEmp.st.contracts[0].companyId === 'EMP-002' && mEmp.st.contracts[0].revisions?.[0].changes.some(x => x.label === 'Empresa' && x.from === 'SILEE E.I.R.L.' && x.to === 'ENSIL EVOLUTION S.R.L.') === true, JSON.stringify(r));
  r = await editContract(mEmp.repo, ctxOf(mEmp), 'CON-001', form({ companyId: 'EMP-003' }), 'A una empresa cerrada');
  check('No se cambia a una empresa inactiva ni que no existe', !r.ok && /inactiva/.test(r.error!) && !(await editContract(mEmp.repo, ctxOf(mEmp), 'CON-001', form({ companyId: 'EMP-099' }), 'Empresa inexistente')).ok);
  const withClosedLine: PayrollRun = { id: 'PLA-2026-10-EMP-002', companyId: 'EMP-002', period: '2026-10', status: 'Cerrada', adjustments: [], lines: [lineaOf('Juan', 'CON-001', 'STF-001')], createdAt: 'x', createdBy: 'u', events: [] };
  r = await editContract(mEmp.repo, ctxOf(mEmp, { runs: [withClosedLine] }), 'CON-001', form({ companyId: 'EMP-001' }), 'Vuelve a la primera');
  check('Con una planilla cerrada que incluye el contrato NO se cambia la empresa (esa foto es de la anterior)', !r.ok && /ya está cerrada con este contrato\. Reábrala primero/.test(r.error!));
  const withDraftAdj: PayrollRun = { id: 'PLA-2026-10-EMP-002', companyId: 'EMP-002', period: '2026-10', status: 'Borrador', adjustments: [{ id: 'AJU-001', staffId: 'STF-001', kind: 'Ingreso', concept: 'Bono', amount: 100, taxable: true, reason: 'Metas', by: 'x', at: 'x' }], createdAt: 'x', createdBy: 'u', events: [] };
  r = await editContract(mEmp.repo, ctxOf(mEmp, { runs: [withDraftAdj] }), 'CON-001', form({ companyId: 'EMP-001' }), 'Vuelve a la primera');
  check('Con ajustes en el borrador de su empresa actual NO se cambia (quedarían escondidos)', !r.ok && /1 ajuste\(s\) en la planilla en borrador/.test(r.error!));
  r = await editContract(mEmp.repo, ctxOf(mEmp, { runs: [{ ...withDraftAdj, companyId: 'EMP-001', id: 'PLA-2026-10-EMP-001' }] }), 'CON-001', form({ companyId: 'EMP-001' }), 'Vuelve a la primera');
  check('Los ajustes del borrador de OTRA empresa no estorban', r.ok && mEmp.st.contracts[0].companyId === 'EMP-001');
  r = await editContract(m1.repo, ctxOf(m1), 'CON-001', form({ staffId: 'STF-002' }), 'Otra persona');
  check('Tampoco el trabajador', !r.ok && /cambiar el trabajador/.test(r.error!));
  r = await editContract(m1.repo, ctxOf(m1), 'CON-001', form(), 'Sin cambios reales');
  check('Sin cambios no se guarda', !r.ok && /No hay cambios/.test(r.error!));
  r = await editContract(m1.repo, ctxOf(m1), 'CON-001', form({ position: 'Psicólogo Líder' }), 'no');
  check('Pide el motivo', !r.ok && /motivo/.test(r.error!));
  r = await editContract(m1.repo, ctxOf(m1), 'CON-001', form({ position: 'Psicólogo Líder', grossSalary: '3800' }), 'Promoción acordada');
  check('Con motivo se guarda; queda la constancia y la empresa sigue siendo la misma', r.ok && m1.st.contracts[0].position === 'Psicólogo Líder' && m1.st.contracts[0].grossSalary === 3800 && m1.st.contracts[0].companyId === 'EMP-001'
    && m1.st.contracts[0].revisions?.[0].reason === 'Promoción acordada' && m1.st.contracts[0].revisions![0].changes.some(c => c.label === 'Cargo'));
  r = await editContract(m1.repo, ctxOf(m1), 'CON-099', form(), 'Algo');
  check('Un contrato que no existe da un mensaje claro', !r.ok && r.error === 'No se encontró el contrato.');
  check('Un contrato cuya empresa se inactivó después se puede seguir editando (conserva la suya)', Object.keys(validateContractForm(form({ companyId: 'EMP-003' }), [{ ...cur, companyId: 'EMP-003' }], staff, today, 'CON-001', noAgenda, companies)).length === 0
    && validateContractForm(form({ companyId: 'EMP-003' }), [], staff, today, undefined, noAgenda, companies).companyId === 'La empresa elegida está inactiva.');

  // ---------------------------------------------------------------------------------------------- Cesar
  console.log('— Cesar un contrato');
  const m4 = memoryRepo();
  await createContract(m4.repo, ctxOf(m4), form());
  r = await closeContract(m4.repo, ctxOf(m4), 'CON-001', '2025-12-31', 'Renuncia voluntaria');
  check('La fecha de cese no puede ser anterior al inicio', !r.ok && /anterior al inicio/.test(r.error!));
  r = await closeContract(m4.repo, ctxOf(m4), 'CON-001', today, 'no');
  check('El cese pide motivo', !r.ok && /motivo del cese/.test(r.error!));
  const futureSession = { id: 'SES-1', status: 'Reservado', date: '2026-12-15', responsible: 'Juan Pérez García', studentId: 'x' } as never;
  r = await closeContract(m4.repo, ctxOf(m4, { agenda: { schedules: [futureSession], activities: [] } }), 'CON-001', today, 'Renuncia voluntaria');
  check('Quien cesa no queda como responsable de asesorías posteriores al cese', !r.ok && /asesor|cese/.test(r.error!) && m4.st.calls.every(c => c !== 'closeContract'), r.error);
  const closedRun: PayrollRun = { id: 'PLA-2026-11-EMP-001', companyId: 'EMP-001', period: '2026-11', status: 'Cerrada', adjustments: [], lines: [lineaOf('Juan', 'CON-001', 'STF-001')], createdAt: 'x', createdBy: 'u', events: [] };
  r = await closeContract(m4.repo, ctxOf(m4, { runs: [closedRun] }), 'CON-001', today, 'Renuncia voluntaria');
  check('No se cesa dentro de una planilla ya cerrada con ese contrato', !r.ok && /ya está cerrada con este contrato/.test(r.error!));
  r = await closeContract(m4.repo, ctxOf(m4), 'CON-001', today, 'Renuncia voluntaria');
  check('Se cesa con fecha y motivo', r.ok && m4.st.contracts[0].status === 'Cesado' && m4.st.contracts[0].endDate === today && m4.st.contracts[0].terminationReason === 'Renuncia voluntaria');
  r = await closeContract(m4.repo, ctxOf(m4), 'CON-001', today, 'Renuncia voluntaria');
  check('Un contrato cesado no se vuelve a cesar', !r.ok && /Solo se cierra un contrato vigente/.test(r.error!));

  // ---------------------------------------------------------------------------------------------- Renovar
  console.log('— Renovar un contrato');
  const m5 = memoryRepo();
  // El contrato vence el 30 de noviembre: se renueva desde 30 días antes de su fin (hoy es 7 de noviembre)
  await createContract(m5.repo, ctxOf(m5), form({ startDate: '2026-01-01', endDate: '2026-11-30' }));
  const renewal = { endDate: '2027-11-30', grossSalary: '', reason: 'Buen desempeño' };
  r = await renewContract(m5.repo, ctxOf(m5, { today: '2026-06-01' }), 'CON-001', renewal);
  check('No se renueva con mucha anticipación', !r.ok && /Todavía falta mucho/.test(r.error!) && m5.st.calls.filter(c => c === 'renewContract').length === 0);
  r = await renewContract(m5.repo, ctxOf(m5), 'CON-001', { ...renewal, reason: 'no' });
  check('La renovación pide motivo', !r.ok && /motivo de la renovación/.test(r.error!));
  const otherCompanyRun: PayrollRun = { ...closedRun, id: 'PLA-2026-12-EMP-002', companyId: 'EMP-002', period: '2026-12', lines: [] };
  r = await renewContract(m5.repo, ctxOf(m5, { runs: [{ ...closedRun, period: '2026-12', id: 'PLA-2026-12-EMP-001' }] }), 'CON-001', renewal);
  check('Con una planilla cerrada de SU empresa de ese mes o posterior se pide reabrirla primero', !r.ok && /planilla cerrada/.test(r.error!));
  r = await renewContract(m5.repo, ctxOf(m5, { runs: [otherCompanyRun] }), 'CON-001', renewal);
  check('Pero la planilla cerrada de OTRA empresa no estorba', r.ok && r.value?.id === 'CON-002', r.error);
  check('El anterior queda «Renovado» y el nuevo es de la misma empresa, desde el día siguiente, con el mismo cargo', m5.st.contracts[0].status === 'Renovado' && m5.st.contracts[1].renewsId === 'CON-001' && m5.st.contracts[1].companyId === 'EMP-001' && m5.st.contracts[1].startDate === '2026-12-01' && m5.st.contracts[1].position === 'Psicólogo Senior' && m5.st.contracts[1].endDate === '2027-11-30');
  const m6 = memoryRepo();
  await createContract(m6.repo, ctxOf(m6), form({ type: 'Indeterminado', endDate: '' }));
  r = await renewContract(m6.repo, ctxOf(m6), 'CON-001', renewal);
  check('Un contrato indeterminado no se renueva', !r.ok && /indeterminado no se renueva/.test(r.error!));

  // ---------------------------------------------------------------------------------------------- Planilla
  console.log('— Planilla por empresa y mes');
  const m7 = memoryRepo();
  await createContract(m7.repo, ctxOf(m7), form());
  await createContract(m7.repo, ctxOf(m7), form({ staffId: 'STF-002', companyId: 'EMP-002', type: 'Indeterminado', endDate: '', grossSalary: '2800', pensionSystem: 'ONP', pensionFund: '', position: 'Coordinadora' }));
  const pctx = (m: ReturnType<typeof memoryRepo>): PayrollContext => ({
    contracts: m.st.contracts, staff, assignments: [] as Assignment[], runs: m.st.runs, companies,
  });
  let g = await generatePayroll(m7.repo, m7.st.runs, companies, '', '2026-10', today);
  check('Generar pide la empresa', !g.ok && /Elija la empresa/.test(g.error!));
  g = await generatePayroll(m7.repo, m7.st.runs, companies, 'EMP-003', '2026-10', today);
  check('No se genera para una empresa inactiva', !g.ok && /inactiva/.test(g.error!));
  g = await generatePayroll(m7.repo, m7.st.runs, companies, 'EMP-001', '2026-12', today);
  check('No se genera un mes futuro', !g.ok && /aún no empieza/.test(g.error!));
  g = await generatePayroll(m7.repo, m7.st.runs, companies, 'EMP-001', '2026-10', today);
  check('Se genera con el código del mes y la empresa', g.ok && g.value?.id === 'PLA-2026-10-EMP-001' && g.value?.id === runIdOf('2026-10', 'EMP-001') && m7.st.runs[0].companyId === 'EMP-001');
  g = await generatePayroll(m7.repo, m7.st.runs, companies, 'EMP-001', '2026-10', today);
  check('No se genera dos veces la misma de la misma empresa', !g.ok && /Ya existe/.test(g.error!));
  g = await generatePayroll(m7.repo, m7.st.runs, companies, 'EMP-002', '2026-10', today);
  check('Pero la otra empresa tiene la suya del mismo mes', g.ok && g.value?.id === 'PLA-2026-10-EMP-002');

  const run1 = () => m7.st.runs.find(x => x.id === 'PLA-2026-10-EMP-001')!;
  const own = linesOf(run1(), pctx(m7));
  check('La planilla de cada empresa solo lleva a sus trabajadores', own.lines.length === 1 && own.lines[0].staffId === 'STF-001' && own.lines[0].companyRuc === '20610010289' && linesOf(m7.st.runs.find(x => x.id === 'PLA-2026-10-EMP-002')!, pctx(m7)).lines.map(l => l.staffId).join() === 'STF-002');
  let a = await addPayrollAdjustment(m7.repo, pctx(m7), 'PLA-2026-10-EMP-001', { staffId: 'STF-002', kind: 'Ingreso', concept: 'Bono por metas', amount: 200, taxable: true, reason: 'Metas del mes' }, 'María Torres');
  check('No se ajusta a quien no figura en la planilla de esa empresa (María es de la otra)', !a.ok && /no figura en esta planilla/.test(a.error!) && !m7.st.calls.includes('addAdjustment'));
  a = await addPayrollAdjustment(m7.repo, pctx(m7), 'PLA-2026-10-EMP-001', { staffId: 'STF-001', kind: 'Ingreso', concept: 'Bono por metas', amount: 200, taxable: true, reason: 'no' }, 'Juan Pérez');
  check('El ajuste pide motivo', !a.ok && /motivo/.test(a.error!));
  a = await addPayrollAdjustment(m7.repo, pctx(m7), 'PLA-2026-10-EMP-001', { staffId: 'STF-001', kind: 'Ingreso', concept: 'Bono por metas', amount: 200, taxable: true, reason: 'Metas del mes' }, 'Juan Pérez');
  check('Se agrega con su código y queda en el historial con el nombre del trabajador', a.ok && a.value?.id === 'AJU-001' && run1().adjustments[0].amount === 200 && run1().events.some(e => e.action === 'Ajuste' && /Bono por metas S\/ 200\.00 \(Juan Pérez\)/.test(e.detail ?? '')));
  check('El ajuste cambia la línea (la planilla en borrador se recalcula)', linesOf(run1(), pctx(m7)).lines[0].adjustments.length === 1 && linesOf(run1(), pctx(m7)).lines[0].calc.totalIncome > own.lines[0].calc.totalIncome);
  const mDup = memoryRepo([...m7.st.contracts], [{ ...m7.st.runs[0], id: 'PLA-2026-09-EMP-001', period: '2026-09', adjustments: [{ id: 'AJU-001', staffId: 'STF-001', kind: 'Ingreso', concept: 'x', amount: 1, taxable: true, reason: 'x', by: 'x', at: 'x' }] }, ...m7.st.runs.slice(0, 0)]);
  a = await addPayrollAdjustment(mDup.repo, { ...pctx(m7), runs: [...mDup.st.runs.map(x => ({ ...x, adjustments: [] })), { ...run1(), adjustments: [] }] }, 'PLA-2026-10-EMP-001', { staffId: 'STF-001', kind: 'Ingreso', concept: 'Bono', amount: 5, taxable: true, reason: 'Metas del mes' }, 'Juan');
  check('Un código de ajuste repetido se reintenta con el siguiente', !a.ok || a.value?.id === 'AJU-002' || /código/.test(a.error ?? ''));
  const rm = await removePayrollAdjustment(m7.repo, m7.st.runs, 'PLA-2026-10-EMP-001', 'AJU-001');
  check('Se quita un ajuste y queda constancia', rm.ok && run1().adjustments.length === 0 && run1().events.some(e => /Se quitó: Bono por metas/.test(e.detail ?? '')));
  check('Quitar uno que no existe da un mensaje claro', (await removePayrollAdjustment(m7.repo, m7.st.runs, 'PLA-2026-10-EMP-001', 'AJU-099')).error === 'No se encontró el ajuste.');

  const emptyRepo = memoryRepo();
  await generatePayroll(emptyRepo.repo, emptyRepo.st.runs, companies, 'EMP-001', '2026-10', today);
  let cl = await closePayroll(emptyRepo.repo, pctx(emptyRepo), 'PLA-2026-10-EMP-001', today);
  check('Una planilla sin contratos de la empresa no se cierra', !cl.ok && /no tiene trabajadores/.test(cl.error!) && !emptyRepo.st.calls.includes('closePayroll'));
  cl = await closePayroll(m7.repo, pctx(m7), 'PLA-2026-10-EMP-001', today);
  check('Se cierra con la foto de sus líneas y el detalle en el historial', cl.ok && run1().status === 'Cerrada' && run1().lines?.length === 1 && run1().lines![0].companyName === 'SILEE E.I.R.L.' && run1().events.at(-1)?.action === 'Cerrada' && /1 trabajador\(es\) · neto S\/ /.test(run1().events.at(-1)?.detail ?? ''));
  cl = await closePayroll(m7.repo, pctx(m7), 'PLA-2026-10-EMP-001', today);
  check('No se cierra dos veces', !cl.ok && /ya está cerrada/.test(cl.error!));
  check('Una cerrada no se ajusta ni se elimina', !(await addPayrollAdjustment(m7.repo, pctx(m7), 'PLA-2026-10-EMP-001', { staffId: 'STF-001', kind: 'Ingreso', concept: 'Bono', amount: 5, taxable: true, reason: 'Metas del mes' }, 'x')).ok
    && (await deletePayrollDraft(m7.repo, m7.st.runs, 'PLA-2026-10-EMP-001')).error === 'Solo se elimina una planilla en borrador.');
  let ro = await reopenPayroll(m7.repo, m7.st.runs, 'PLA-2026-10-EMP-001', 'no');
  check('Reabrir pide motivo', !ro.ok && /motivo de la reapertura/.test(ro.error!));
  ro = await reopenPayroll(m7.repo, m7.st.runs, 'PLA-2026-10-EMP-001', 'Corrección de un bono');
  check('Se reabre: vuelve a borrador, la foto se descarta y queda el motivo', ro.ok && run1().status === 'Borrador' && run1().lines === undefined && run1().events.at(-1)?.action === 'Reabierta' && run1().events.at(-1)?.detail === 'Corrección de un bono');
  const del = await deletePayrollDraft(m7.repo, m7.st.runs, 'PLA-2026-10-EMP-002');
  check('Se elimina un borrador', del.ok && !m7.st.runs.some(x => x.id === 'PLA-2026-10-EMP-002'));
  check('Eliminar una que no existe da un mensaje claro', (await deletePayrollDraft(m7.repo, m7.st.runs, 'PLA-2000-01-EMP-001')).error === 'No se encontró la planilla.');

  // ---------------------------------------------------------------------------------------------- Lectura inicial
  console.log('— Lectura');
  const okLoad = await loadContractsPayroll(m7.repo);
  check('Se leen los contratos y las planillas juntos', okLoad.ok && okLoad.value?.contracts.length === 2 && okLoad.value?.runs.length === 1);
  const badLoad = await loadContractsPayroll(memoryRepo([], [], { failList: true }).repo);
  check('Si una lectura falla se devuelve el error (no se muestra nada a medias)', !badLoad.ok && badLoad.error === 'Sin conexión.' && badLoad.value === undefined);
  check('La empresa del contrato NO se deduce de la sede (alguien puede trabajar en Juliaca y estar contratado por otra empresa del grupo): no hay sugerencia por sede', !/suggestedCompanyOf/.test(read('src/utils/payroll.ts')) && !/suggestedCompanyOf|orgAssignments/.test(read('src/pages/people/ContractFormModal.tsx')) && !/places/.test(read('src/utils/payrollRun.ts')));
  check('Los errores de la base se traducen: planilla repetida, contrato repetido y su reintento de código', dbErrorMessage({ code: '23505', message: 'duplicate key value violates unique constraint "planillas_pkey"' }) === 'Ya existe la planilla de ese mes de esa empresa.'
    && dbErrorMessage({ code: '23505', message: 'duplicate key value violates unique constraint "contratos_pkey"' }) === 'Este código de contrato ya está en uso.'
    && isIdConflict({ code: '23505', message: 'duplicate key value violates unique constraint "contratos_pkey"' }) && isIdConflict({ code: '23505', message: 'duplicate key value violates unique constraint "planilla_ajustes_pkey"' })
    && !isIdConflict({ code: '23505', message: 'duplicate key value violates unique constraint "planillas_pkey"' })
    && dbErrorMessage({ code: 'EN001', message: 'Este trabajador ya tiene un contrato vigente. Ciérrelo antes de crear otro.' }) === 'Este trabajador ya tiene un contrato vigente. Ciérrelo antes de crear otro.');

  // ---------------------------------------------------------------------------------------------- La migración, el código y las pantallas dicen lo mismo
  console.log('— Migración 0007');
  const file = readdirSync('supabase/migrations').find(f => f.endsWith('_contratos_y_planilla.sql'))!;
  const sql = read(`supabase/migrations/${file}`);
  const down = read('supabase/deshacer/20261107120000_contratos_y_planilla.down.sql');
  const tables = ['contratos', 'contratos_pago', 'contrato_revisiones', 'planillas', 'planilla_ajustes', 'planilla_lineas', 'planilla_eventos'];
  check('La migración crea las 7 tablas, con seguridad por filas y sin escritura directa', tables.every(t => sql.includes(`create table public.${t} `) && sql.includes(`alter table public.${t} enable row level security`)) && /revoke all on public\.contratos,/.test(sql) && /grant select on public\.contratos,/.test(sql) && !/grant (insert|update|delete)/.test(sql));
  check('Los sueldos viven aparte y solo los lee quien tiene «Ver remuneraciones»', /create policy contratos_pago_leer[\s\S]*per-remuneracion:view/.test(sql) && !/sueldo|neto|renta|aporte|pension/.test(sql.slice(sql.indexOf('create table public.contratos ('), sql.indexOf('\n);', sql.indexOf('create table public.contratos ('))).toLowerCase()));
  check('La planilla solo la lee quien tiene la función, «Ver remuneraciones» y alcanza todas las sedes', ['planillas', 'planilla_ajustes', 'planilla_lineas', 'planilla_eventos'].every(t => new RegExp(`create policy ${t}_leer[\\s\\S]*?per-planilla:view[\\s\\S]*?per-remuneracion:view[\\s\\S]*?alcance_total`).test(sql)));
  const fns = ['crear_contrato', 'editar_contrato', 'cesar_contrato', 'renovar_contrato', 'generar_planilla', 'eliminar_borrador_planilla', 'agregar_ajuste_planilla', 'quitar_ajuste_planilla', 'cerrar_planilla', 'reabrir_planilla'];
  const repoSrc = read('src/services/contractsPayrollRepository.ts');
  check('Cada función de la base está en la migración, en el repositorio y en el «deshacer»', fns.every(f => sql.includes(`create function public.${f}(`) && repoSrc.includes(`'${f}'`) && down.includes(`drop function if exists public.${f}(`)));
  check('Cada función pide la función del registro que le corresponde', /app\.permite\('per-contratos:create'\)/.test(sql) && /app\.permite\('per-contratos:edit'\)/.test(sql) && /app\.permite\('per-contratos:close'\)/.test(sql) && /app\.permite\('per-contratos:renew'\)/.test(sql)
    && /app\.permite\('per-planilla:generate'\)/.test(sql) && /app\.permite\('per-planilla:adjust'\)/.test(sql) && /app\.permite\('per-planilla:close'\)/.test(sql) && /app\.permite\('per-planilla:reopen'\)/.test(sql));
  check('Los tipos, sistemas de pensión y AFP de la base son los del código', CONTRACT_TYPES.every(t => sql.includes(`'${t}'`)) && PENSION_SYSTEMS.every(p => sql.includes(`'${p}'`)) && AFP_FUNDS.every(f => sql.includes(`'${f}'`)));
  check('El largo del cargo es el mismo en la base y en el formulario', sql.includes(`between ${POSITION_MIN} and ${POSITION_MAX}`) && sql.includes('Indique el cargo (ej.: Psicólogo Senior).'));
  const sharedMessages = [
    'Este trabajador ya tiene un contrato vigente. Ciérrelo antes de crear otro.', 'La fecha de fin es obligatoria para este tipo de contrato.', 'La fecha de fin debe ser posterior a la de inicio.',
    'Solo se puede editar un contrato vigente.', 'No se puede cambiar el trabajador de un contrato.', 'Indique el motivo de la modificación: queda en el historial del contrato.',
    'La fecha de cese no puede ser anterior al inicio del contrato.', 'Indique el motivo del cese.', 'Solo se cierra un contrato vigente.', 'Un contrato indeterminado no se renueva: no tiene fecha de fin.',
    'No se genera la planilla de un mes que aún no empieza.', 'Solo se elimina una planilla en borrador.', 'La planilla ya está cerrada.', 'La planilla no tiene trabajadores: no hay contratos que cubran el mes.',
    'Indique el motivo de la reapertura: queda en el historial.', 'La planilla ya está en borrador.', 'Indique el concepto (p. ej. «Bono por metas»).', 'Indique el motivo: queda en la planilla.',
  ];
  const tsSrc = ['src/utils/payroll.ts', 'src/utils/payrollRun.ts', 'src/services/contractsPayroll.ts', 'src/utils/contractRenewal.ts'].map(read).join('\n');
  check('Los mensajes que la pantalla y la base comparten dicen lo mismo, palabra por palabra', sharedMessages.every(m => sql.includes(m) && tsSrc.includes(m)), sharedMessages.filter(m => !sql.includes(m) || !tsSrc.includes(m)).join(' | '));
  check('La base exige que quien se da de baja no tenga contrato vigente (y el código también)', /Tiene un contrato vigente: ciérrelo primero en Personas → Contratos\./.test(sql) && /Tiene un contrato vigente: ciérrelo primero en Personas → Contratos\./.test(read('src/utils/staffStatus.ts')) && !/contrato vigente/.test(down.slice(down.indexOf('create or replace function public.inactivar_personal'), down.indexOf('drop function if exists public.reabrir_planilla'))));
  check('Cesar un contrato y renovarlo miran las planillas cerradas (de la empresa, al renovar) también en la base', /planilla_lineas l join public\.planillas pl[\s\S]*pl\.estado = 'Cerrada'[\s\S]*to_char\(p_fecha/.test(sql) && /pl\.empresa_id = c\.empresa_id and pl\.estado = 'Cerrada'/.test(sql));
  check('El «deshacer» quita las 7 tablas y las funciones de ayuda', tables.every(t => down.includes(`drop table if exists public.${t};`)) && ['app.contrato_validar', 'app.contrato_insertar', 'app.quien', 'app.hoy'].every(f => down.includes(`drop function if exists ${f}(`)));

  console.log('— Migración 0008 (la empresa del contrato se puede cambiar)');
  const f8 = readdirSync('supabase/migrations').find(f => f.endsWith('_contrato_cambiar_empresa.sql'))!;
  const sql8 = read(`supabase/migrations/${f8}`);
  const down8 = read('supabase/deshacer/20261107150000_contrato_cambiar_empresa.down.sql');
  check('La 0008 permite cambiar la empresa y ya no la declara fija; la 0007 se queda como se aplicó', /empresa_id = p->>'empresa_id', tipo = p->>'tipo'/.test(sql8) && !/No se puede cambiar la empresa de un contrato/.test(sql8) && /No se puede cambiar la empresa de un contrato: cese este/.test(sql));
  check('La 0008 frena el cambio si una planilla cerrada incluye el contrato o si hay ajustes en el borrador de su empresa actual (y la pantalla dice lo mismo)', /pl\.estado = 'Cerrada' order by pl\.periodo limit 1/.test(sql8) && /pl\.estado = 'Borrador'/.test(sql8)
    && sql8.includes('ya está cerrada con este contrato. Reábrala primero o cese este contrato y registre uno nuevo.') && tsSrc.includes('ya está cerrada con este contrato. Reábrala primero o cese este contrato y registre uno nuevo.')
    && sql8.includes('ajuste(s) en la planilla en borrador de su empresa actual: quítelos o elimine ese borrador antes de cambiar la empresa.') && tsSrc.includes('ajuste(s) en la planilla en borrador de su empresa actual: quítelos o elimine ese borrador antes de cambiar la empresa.'));
  check('Un contrato conserva su empresa aunque se haya inactivado después (la base y la pantalla); uno nuevo no puede nacer en una empresa inactiva', /k\.id = p_propio and k\.empresa_id = e\.id/.test(sql8) && /unchanged = !!editingId/.test(read('src/utils/payroll.ts')));
  check('El «deshacer» de la 0008 devuelve las dos funciones a como estaban en la 0007', down8.includes('No se puede cambiar la empresa de un contrato: cese este y registre uno nuevo.') && /create or replace function app\.contrato_validar/.test(down8) && /create or replace function public\.editar_contrato/.test(down8));

  console.log('— Cableado en el sistema');
  const ctx = read('src/context/DataContext.tsx');
  check('El contexto toma contratos y planillas de la base y deja los de ejemplo solo para la agenda', /const cp = useContractsPayroll\(\)/.test(ctx) && /const contracts = cp\.contracts/.test(ctx) && /const payrollRuns = cp\.runs/.test(ctx) && !/setContracts|setPayrollRuns/.test(ctx) && /const \[agendaContracts\] = useState<Contract\[\]>\(\(\) => seedContracts\(\)\)/.test(ctx));
  check('La agenda usa los contratos de ejemplo (su personal es el de ejemplo) y nunca los de la base', /sessionResponsibleUnavailable\(next\.responsible, next\.date, staff, agendaContracts\)/.test(ctx) && /unavailableOn\(sid, date, agendaContracts\)/.test(ctx) && !/unavailableOn\([^)]*[^s]contracts\)/.test(ctx));
  check('La planilla y los contratos usan el personal y las asignaciones de la base', /staff: staffDir\.staff, companies, today/.test(ctx) && /contracts, staff: staffDir\.staff, assignments: staffDir\.assignments, companies,?\s*\}\)/.test(ctx));
  check('Las acciones de contratos y planilla son asíncronas y no quedan acciones sueltas que cambien el estado (updateContract)', /addContract: \(form: ContractForm\) => Promise</.test(ctx) && /closePayroll: \(runId: string\) => Promise</.test(ctx) && !/updateContract\b/.test(ctx) && !/updateContract\b/.test(read('src/utils/capabilityRegistry.ts')));
  check('Una empresa con contratos vigentes no se inactiva ni se elimina (igual que con filiales o almacenes); una sin ellos, sí', companyInactivationError({ id: 'EMP-001' }, [m1.st.contracts[0]]) === 'No se puede inactivar una empresa con filiales, almacenes o contratos vigentes vinculados.'
    && companyInactivationError({ id: 'EMP-002' }, [m1.st.contracts[0]]) === null && /org\.updateCompany\(id, companyData, contracts\.filter\(k => k\.status === 'Vigente'\)\)/.test(ctx) && /org\.deleteCompany\(id, contracts\.filter\(k => k\.status === 'Vigente'\)\)/.test(ctx));
  const pages = ['src/pages/Contracts.tsx', 'src/pages/people/ContractFormModal.tsx', 'src/pages/people/Payroll.tsx', 'src/pages/reports/StaffReport.tsx'].map(read);
  check('Contratos, planilla y el reporte de personal leen el personal y las asignaciones de la base (orgStaff, orgAssignments)', pages.every(p => /orgStaff/.test(p)) && !pages.some(p => p.split('\n').some(l => /= useData\(\)/.test(l) && /[{,]\s*(staff|assignments)\s*[,}]/.test(l))));
  check('La pantalla de contratos pide la empresa (sin sugerirla por la sede, y se puede cambiar al editar), y la de planilla la elige antes de generar', /companyId/.test(pages[1]) && !/suggestedCompanyOf/.test(pages[1]) && !/companyId[^\n]*disabled=\{!!editing\}|disabled=\{!!editing\}[^>]*onChange=\{e => set\(\{ companyId/.test(pages[1]) && /generatePayroll\(genCompanyId, period\)/.test(pages[2]));
  check('Las pantallas esperan el resultado de las operaciones (son asíncronas)', /await addContract\(form\)/.test(pages[1]) && /await editContract\(/.test(pages[1]) && /await renewContract\(/.test(pages[0]) && /await closeContract\(/.test(pages[0]) && /await addPayrollAdjustment\(/.test(pages[2]) && /await reopenPayroll\(/.test(pages[2]));
  check('La boleta lleva la empresa del contrato (nombre y RUC) y no se rotula «ENSIL» a ciegas', !/'ENSIL'/.test(pages[2]) && /payslipHtml\(l, run\.period\)/.test(pages[2]));
  check('Una cuenta nueva sin función de contratos ve el cargo pero no el sueldo: lo decide la base, no la pantalla (ver la política de contratos_pago)', /create policy contratos_leer[\s\S]*per-personal:view/.test(sql));

  if (failed > 0) {
    console.log(`\n${failed} comprobaciones fallaron.`);
    process.exit(1);
  }
  console.log('\nTodas las comprobaciones pasaron.');
})();
