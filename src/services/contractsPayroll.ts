/**
 * Operaciones de Contratos y Planilla sobre la base de datos: validan con las reglas puras (`utils/payroll.ts`, `utils/contractRenewal.ts`,
 * `utils/payrollRun.ts`) y luego guardan. El repositorio se recibe como parámetro (el de Supabase en el sistema, uno en memoria en
 * `scripts/check-contracts-db.ts`), de modo que el orden «validar → guardar → traducir el error» se comprueba sin conexión.
 *
 * Las reglas se aplican aquí para avisar bien y rápido; la base las exige otra vez en sus funciones (nadie escribe las tablas directo),
 * así que lo que se salte la pantalla lo frena la base con su propio mensaje.
 *
 * Los códigos (`CON-NNN`, `AJU-NNN`) los asigna el sistema; si dos personas crean a la vez, se reintenta con el siguiente. El código de una
 * planilla es el de su empresa y su mes (`PLA-AAAA-MM-EMP-NNN`).
 */
import type { Company, Contract, ContractRevisionChange, PayrollAdjustment, PayrollLine, PayrollRun, Staff } from '../context/DataContext';
import { ID_PREFIX, nextSequentialId } from '../utils/ids';
import { buildRenewal, validateRenewal, type RenewalInput } from '../utils/contractRenewal';
import { buildContract, buildContractPatch, diffContract, validateContractEdit, validateContractForm, type ContractForm } from '../utils/payroll';
import { periodLabel, periodOf, round2 } from '../utils/payrollEngine';
import { linesOf, runIdOf, validateAdjustment, validateClose, validateGenerate, validateReopen, type PayrollContext } from '../utils/payrollRun';
import { ceseAgendaError, type AgendaContext } from '../utils/staffAvailability';
import type { OpResult, RepoResult } from './orgDirectory';

export interface ContractsPayrollRepository {
  listContracts(): Promise<RepoResult<Contract[]>>;
  listPayroll(): Promise<RepoResult<PayrollRun[]>>;
  createContract(id: string, contract: Omit<Contract, 'id'>): Promise<RepoResult<null>>;
  editContract(id: string, contract: Omit<Contract, 'id'>, reason: string, changes: ContractRevisionChange[]): Promise<RepoResult<null>>;
  closeContract(id: string, date: string, reason: string): Promise<RepoResult<null>>;
  renewContract(previousId: string, id: string, contract: Omit<Contract, 'id'>): Promise<RepoResult<null>>;
  generatePayroll(id: string, companyId: string, period: string): Promise<RepoResult<null>>;
  deletePayrollDraft(id: string): Promise<RepoResult<null>>;
  addAdjustment(id: string, runId: string, adjustment: PayrollAdjustment, detail: string): Promise<RepoResult<null>>;
  removeAdjustment(runId: string, adjustmentId: string, detail: string): Promise<RepoResult<null>>;
  closePayroll(runId: string, lines: PayrollLine[], detail: string): Promise<RepoResult<null>>;
  reopenPayroll(runId: string, reason: string): Promise<RepoResult<null>>;
}

export interface ContractsPayrollData { contracts: Contract[]; runs: PayrollRun[] }

const fail = (error: string): OpResult<never> => ({ ok: false, error });
const MAX_ID_ATTEMPTS = 3;
const ERR_SAVE = 'No se pudo guardar.';

/** Lee los contratos y las planillas que la cuenta puede ver (la base decide cuáles, y si ve o no los sueldos). */
export async function loadContractsPayroll(repo: ContractsPayrollRepository): Promise<OpResult<ContractsPayrollData>> {
  const [c, p] = await Promise.all([repo.listContracts(), repo.listPayroll()]);
  if (!c.ok || !p.ok) return fail(c.error ?? p.error ?? 'No se pudieron cargar los contratos y las planillas.');
  return { ok: true, value: { contracts: c.data ?? [], runs: p.data ?? [] } };
}

// ------------------------------------------------------------------------------------------------------------------ Contratos

export interface ContractsContext {
  contracts: Contract[];
  /** El personal de la base (el contrato es de una persona de Personal). */
  staff: Staff[];
  companies: Pick<Company, 'id' | 'name' | 'status' | 'laborRegime'>[];
  runs: PayrollRun[];
  /** Asesorías y actividades futuras de la persona (los datos de ejemplo de la agenda; una persona de la base aún no tiene). */
  agenda: AgendaContext;
  today: string;
}

/** Crea un contrato. La empresa es obligatoria; el código `CON-NNN` lo asigna el sistema. */
export async function createContract(repo: ContractsPayrollRepository, ctx: ContractsContext, form: ContractForm): Promise<OpResult<{ id: string }>> {
  const problem = Object.values(validateContractForm(form, ctx.contracts, ctx.staff, ctx.today, undefined, ctx.agenda, ctx.companies))[0];
  if (problem) return fail(problem);
  // El neto del contrato sale del mismo motor que la planilla, así que respeta el régimen laboral de su empresa
  const regime = ctx.companies.find(x => x.id === form.companyId)?.laborRegime;
  const built = buildContract(form, ctx.staff.find(s => s.id === form.staffId) ?? {}, Number(ctx.today.slice(0, 4)), regime);
  const taken = ctx.contracts.map(c => c.id);
  for (let attempt = 0; attempt < MAX_ID_ATTEMPTS; attempt++) {
    const id = nextSequentialId(ID_PREFIX.contrato, taken);
    const res = await repo.createContract(id, built);
    if (res.ok) return { ok: true, value: { id } };
    if (!res.idConflict) return fail(res.error ?? ERR_SAVE);
    taken.push(id);
  }
  return fail('No se pudo asignar un código al contrato. Intente de nuevo.');
}

/**
 * Cambia las condiciones de un contrato vigente (con motivo). El trabajador no cambia. La empresa SÍ puede cambiar (no depende de la sede donde
 * trabaja), salvo que una planilla ya cerrada incluya el contrato (esa foto es de la empresa anterior) o que la persona tenga ajustes en el borrador
 * de la planilla de su empresa actual (quedarían escondidos).
 */
export async function editContract(repo: ContractsPayrollRepository, ctx: ContractsContext, id: string, form: ContractForm, reason: string): Promise<OpResult> {
  const current = ctx.contracts.find(c => c.id === id);
  if (!current) return fail('No se encontró el contrato.');
  if (form.staffId !== current.staffId) return fail('No se puede cambiar el trabajador de un contrato.');
  const problem = Object.values(validateContractForm(form, ctx.contracts, ctx.staff, ctx.today, id, ctx.agenda, ctx.companies))[0];
  if (problem) return fail(problem);
  if (form.companyId !== (current.companyId ?? '')) {
    const closed = ctx.runs.find(r => r.status !== 'Borrador' && r.lines?.some(l => l.contractId === id));
    if (closed) return fail(`No se puede cambiar la empresa: la planilla de ${periodLabel(closed.period)} ya está cerrada con este contrato. Reábrala primero o cese este contrato y registre uno nuevo.`);
    const pending = ctx.runs.filter(r => r.status === 'Borrador' && r.companyId === current.companyId).reduce((n, r) => n + r.adjustments.filter(a => a.staffId === current.staffId).length, 0);
    if (pending > 0) return fail(`Tiene ${pending} ajuste(s) en la planilla en borrador de su empresa actual: quítelos o elimine ese borrador antes de cambiar la empresa.`);
  }
  const patch = buildContractPatch(form, ctx.staff.find(s => s.id === current.staffId) ?? {}, Number(ctx.today.slice(0, 4)), ctx.companies.find(x => x.id === form.companyId)?.laborRegime);
  const changes = diffContract(current, patch, id => ctx.companies.find(x => x.id === id)?.name ?? id ?? '');
  const blocked = validateContractEdit(current, changes, reason)[0];
  if (blocked) return fail(blocked);
  const next: Omit<Contract, 'id'> = { ...current, ...patch };
  const res = await repo.editContract(id, next, reason.trim(), changes);
  return res.ok ? { ok: true } : fail(res.error ?? ERR_SAVE);
}

/** Cierra un contrato vigente (cese): fecha y motivo; no si queda a cargo de asesorías futuras ni si una planilla cerrada ya lo pagó en esas fechas. */
export async function closeContract(repo: ContractsPayrollRepository, ctx: ContractsContext, id: string, date: string, reason: string): Promise<OpResult> {
  const contract = ctx.contracts.find(x => x.id === id);
  if (!contract) return fail('No se encontró el contrato.');
  if (contract.status !== 'Vigente') return fail('Solo se cierra un contrato vigente.');
  if (!date) return fail('Indique la fecha de cese.');
  if (date < contract.startDate) return fail('La fecha de cese no puede ser anterior al inicio del contrato.');
  if (reason.trim().length < 5) return fail('Indique el motivo del cese.');
  const leaver = ctx.staff.find(s => s.id === contract.staffId);
  const agendaProblem = leaver ? ceseAgendaError(leaver, date, ctx.agenda) : null;
  if (agendaProblem) return fail(agendaProblem);
  const paid = ctx.runs.find(r => r.status !== 'Borrador' && r.period >= periodOf(date) && r.lines?.some(l => l.contractId === id));
  if (paid) return fail(`La planilla de ${periodLabel(paid.period)} ya está cerrada con este contrato: reábrala o elija una fecha de cese posterior.`);
  const res = await repo.closeContract(id, date, reason.trim());
  return res.ok ? { ok: true } : fail(res.error ?? ERR_SAVE);
}

/** Renueva un contrato con fecha de fin: el anterior queda «Renovado» y nace uno nuevo, de la misma empresa, desde el día siguiente a su fin. */
export async function renewContract(repo: ContractsPayrollRepository, ctx: ContractsContext, id: string, input: RenewalInput): Promise<OpResult<{ id: string }>> {
  const old = ctx.contracts.find(x => x.id === id);
  if (!old) return fail('No se encontró el contrato.');
  const problem = validateRenewal(old, input, ctx.contracts, ctx.staff, ctx.runs, ctx.today)[0];
  if (problem) return fail(problem);
  const member = ctx.staff.find(s => s.id === old.staffId);
  const built = buildRenewal(old, input, member ?? {}, Number(ctx.today.slice(0, 4)), ctx.companies.find(x => x.id === old.companyId)?.laborRegime);
  const taken = ctx.contracts.map(x => x.id);
  for (let attempt = 0; attempt < MAX_ID_ATTEMPTS; attempt++) {
    const newId = nextSequentialId(ID_PREFIX.contrato, taken);
    const res = await repo.renewContract(id, newId, built);
    if (res.ok) return { ok: true, value: { id: newId } };
    if (!res.idConflict) return fail(res.error ?? ERR_SAVE);
    taken.push(newId);
  }
  return fail('No se pudo asignar un código al contrato. Intente de nuevo.');
}

// ------------------------------------------------------------------------------------------------------------------ Planilla

/** Genera la planilla de un mes de una empresa (queda en borrador y se recalcula con los contratos). */
export async function generatePayroll(
  repo: ContractsPayrollRepository, runs: PayrollRun[], companies: Pick<Company, 'id' | 'status'>[], companyId: string, period: string, today: string,
): Promise<OpResult<{ id: string }>> {
  const company = companies.find(c => c.id === companyId);
  if (companyId && !company) return fail('La empresa elegida no existe.');
  if (company && company.status !== 'Activo') return fail('La empresa elegida está inactiva.');
  const problem = validateGenerate(period, companyId, runs, today)[0];
  if (problem) return fail(problem);
  const id = runIdOf(period, companyId);
  const res = await repo.generatePayroll(id, companyId, period);
  return res.ok ? { ok: true, value: { id } } : fail(res.error ?? ERR_SAVE);
}

export async function deletePayrollDraft(repo: ContractsPayrollRepository, runs: PayrollRun[], runId: string): Promise<OpResult> {
  const run = runs.find(r => r.id === runId);
  if (!run) return fail('No se encontró la planilla.');
  if (run.status !== 'Borrador') return fail('Solo se elimina una planilla en borrador.');
  const res = await repo.deletePayrollDraft(runId);
  return res.ok ? { ok: true } : fail(res.error ?? ERR_SAVE);
}

export interface AdjustmentInput { staffId: string; kind: 'Ingreso' | 'Descuento'; concept: string; amount: number; taxable: boolean; reason: string }

/** Agrega un ingreso o descuento eventual a una planilla en borrador. `staffName` es solo para la constancia del historial. */
export async function addPayrollAdjustment(
  repo: ContractsPayrollRepository, ctx: PayrollContext, runId: string, input: AdjustmentInput, staffName: string,
): Promise<OpResult<{ id: string }>> {
  const run = ctx.runs.find(r => r.id === runId);
  if (!run) return fail('No se encontró la planilla.');
  const inLines = linesOf(run, ctx).lines.some(l => l.staffId === input.staffId);
  const problem = validateAdjustment(run, input, inLines)[0];
  if (problem) return fail(problem);
  const taken = ctx.runs.flatMap(r => r.adjustments.map(a => a.id));
  const detail = `${input.kind}: ${input.concept.trim()} S/ ${round2(input.amount).toFixed(2)}${staffName ? ` (${staffName})` : ''}`;
  for (let attempt = 0; attempt < MAX_ID_ATTEMPTS; attempt++) {
    const id = nextSequentialId(ID_PREFIX.ajustePlanilla, taken);
    // `by` y `at` los pone la base con la cuenta con la que se ingresó (no se pueden falsear desde la pantalla)
    const adjustment: PayrollAdjustment = {
      id, staffId: input.staffId, kind: input.kind, concept: input.concept.trim(), amount: round2(input.amount),
      taxable: input.kind === 'Ingreso' ? input.taxable : true, reason: input.reason.trim(), by: '', at: '',
    };
    const res = await repo.addAdjustment(id, runId, adjustment, detail);
    if (res.ok) return { ok: true, value: { id } };
    if (!res.idConflict) return fail(res.error ?? ERR_SAVE);
    taken.push(id);
  }
  return fail('No se pudo asignar un código al ajuste. Intente de nuevo.');
}

export async function removePayrollAdjustment(repo: ContractsPayrollRepository, runs: PayrollRun[], runId: string, adjustmentId: string): Promise<OpResult> {
  const run = runs.find(r => r.id === runId);
  const adjustment = run?.adjustments.find(a => a.id === adjustmentId);
  if (!run || !adjustment) return fail('No se encontró el ajuste.');
  if (run.status !== 'Borrador') return fail('Solo se ajusta una planilla en borrador.');
  const res = await repo.removeAdjustment(runId, adjustmentId, `Se quitó: ${adjustment.concept} S/ ${adjustment.amount.toFixed(2)}`);
  return res.ok ? { ok: true } : fail(res.error ?? ERR_SAVE);
}

/** Cierra la planilla: guarda la FOTO de sus líneas tal como se calculan hoy (la base lo hace todo de una vez). */
export async function closePayroll(repo: ContractsPayrollRepository, ctx: PayrollContext, runId: string, today: string): Promise<OpResult> {
  const run = ctx.runs.find(r => r.id === runId);
  if (!run) return fail('No se encontró la planilla.');
  const built = linesOf(run, ctx);
  const problem = validateClose(run, built, today)[0];
  if (problem) return fail(problem);
  const net = round2(built.lines.reduce((s, l) => s + l.calc.net, 0));
  const res = await repo.closePayroll(runId, built.lines, `${built.lines.length} trabajador(es) · neto S/ ${net.toFixed(2)}`);
  return res.ok ? { ok: true } : fail(res.error ?? ERR_SAVE);
}

/** Reabre una planilla cerrada (con motivo): vuelve a ser borrador y la foto se descarta. */
export async function reopenPayroll(repo: ContractsPayrollRepository, runs: PayrollRun[], runId: string, reason: string): Promise<OpResult> {
  const run = runs.find(r => r.id === runId);
  if (!run) return fail('No se encontró la planilla.');
  const problem = validateReopen(run, runs, reason)[0];
  if (problem) return fail(problem);
  const res = await repo.reopenPayroll(runId, reason.trim());
  return res.ok ? { ok: true } : fail(res.error ?? ERR_SAVE);
}
