/**
 * Reglas de los contratos y neto de un mes regular (funciones puras).
 *
 *  - No existe jornada part time: todo contrato es Full time.
 *  - El neto que guarda el contrato es el de un MES REGULAR y sale del mismo motor que la planilla (`payrollEngine.ts`):
 *    sueldo + asignación familiar − aportes de pensión − renta de 5.ª categoría (o 4.ª en la locación). No incluye
 *    gratificaciones ni descuentos eventuales; esos aparecen en la planilla del mes. Las tasas son referenciales.
 *  - No hay «tipo de comisión»: de cada AFP se usa su tasa total referencial.
 *  - La locación de servicios no tiene pensión ni 5.ª; retiene 4.ª categoría (8 %) si el honorario pasa de S/ 3 300.
 */
import type { Contract, ContractRevisionChange, Staff } from '../context/DataContext';
import { AFP_RATES as ENGINE_AFP_RATES, ONP_RATE as ENGINE_ONP_RATE, RMV, regularMonth, type RegularMonth } from './payrollEngine';

export const CONTRACT_TYPES = ['Indeterminado', 'Plazo Fijo', 'Locación de servicios'] as const;
export type ContractType = (typeof CONTRACT_TYPES)[number];
export const FULL_TIME = 'Full time';

export const PENSION_SYSTEMS = ['AFP', 'ONP'] as const;
export const AFP_FUNDS = ['Integra', 'Prima', 'Habitat', 'Profuturo'] as const;

/** Remuneración mínima vital (S/). Aplica a los contratos dependientes (no a la locación de servicios). */
export const MIN_WAGE = RMV;
export const MAX_GROSS = 100000;
/** Tasas de pensión: se mantienen en `payrollEngine.ts` (las usa también la planilla) y se reexportan aquí. */
export const ONP_RATE = ENGINE_ONP_RATE;
export const AFP_RATES = ENGINE_AFP_RATES as Record<(typeof AFP_FUNDS)[number], { fund: number; insurance: number; commission: number }>;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Tasa total de aporte (0 si no aplica). */
export function pensionRate(type: string, system: string, fund: string): number {
  if (type === 'Locación de servicios') return 0;
  if (system === 'ONP') return ONP_RATE;
  if (system === 'AFP' && fund in AFP_RATES) {
    const r = AFP_RATES[fund as keyof typeof AFP_RATES];
    return r.fund + r.insurance + r.commission;
  }
  return 0;
}

export interface NetEstimate {
  rate: number;
  /** Aporte a pensiones. */
  contribution: number;
  /** Renta de 5.ª categoría (dependientes) o 4.ª (locación) de un mes regular. */
  incomeTax: number;
  taxKind: RegularMonth['taxKind'];
  familyAllowance: number;
  net: number;
}

/** Neto de un mes regular. null si falta el sueldo o el sistema de pensiones lo exige. */
export function estimateNet(
  gross: number, type: string, system: string, fund: string,
  staff: { hasChildren?: boolean } = {}, year: number = new Date().getFullYear(), suspension4ta = false
): NetEstimate | null {
  const r = regularMonth({ type, startDate: `${year}-01-01`, grossSalary: gross, pensionSystem: system, pensionFund: fund, suspension4ta }, staff, year);
  return r ? { rate: r.rate, contribution: r.pension, incomeTax: r.incomeTax, taxKind: r.taxKind, familyAllowance: r.familyAllowance, net: r.net } : null;
}

export interface ContractForm {
  staffId: string;
  type: string;
  startDate: string;
  endDate: string;
  grossSalary: string;
  pensionSystem: string;
  pensionFund: string;
  vacationStart: string;
  vacationEnd: string;
  observations: string;
  /** Locación: el prestador presentó la suspensión de retenciones de 4.ª categoría. */
  suspension4ta: boolean;
}

export type ContractErrors = Partial<Record<keyof ContractForm, string>>;

export const emptyContractForm = (): ContractForm => ({
  staffId: '', type: '', startDate: '', endDate: '', grossSalary: '', pensionSystem: '', pensionFund: '',
  vacationStart: '', vacationEnd: '', observations: '', suspension4ta: false,
});

/** El contrato de plazo fijo o la locación necesitan fecha de fin; el indeterminado no la tiene. */
export const needsEndDate = (type: string) => type === 'Plazo Fijo' || type === 'Locación de servicios';
export const hasPension = (type: string) => type !== 'Locación de servicios';
export const hasVacations = (type: string) => type !== 'Locación de servicios';

/** Estado real de un contrato: un contrato vigente cuya fecha de fin ya pasó está vencido. */
export const contractStatus = (c: Pick<Contract, 'status' | 'endDate'>, today: string): string =>
  c.status === 'Vigente' && c.endDate && c.endDate < today ? 'Vencido' : c.status;

export function validateContractForm(f: ContractForm, contracts: Contract[], staff: Staff[], today: string, editingId?: string): ContractErrors {
  const e: ContractErrors = {};
  if (!f.staffId || !staff.some(s => s.id === f.staffId)) e.staffId = 'Seleccione al trabajador.';
  if (!(CONTRACT_TYPES as readonly string[]).includes(f.type)) e.type = 'Seleccione el tipo de contrato.';
  if (!f.startDate) e.startDate = 'La fecha de inicio es obligatoria.';
  if (needsEndDate(f.type)) {
    if (!f.endDate) e.endDate = 'La fecha de fin es obligatoria para este tipo de contrato.';
    else if (f.startDate && f.endDate <= f.startDate) e.endDate = 'La fecha de fin debe ser posterior a la de inicio.';
  }
  const gross = Number(f.grossSalary);
  if (!f.grossSalary.trim() || !(gross > 0)) e.grossSalary = 'Indique el sueldo bruto.';
  else if (gross > MAX_GROSS) e.grossSalary = 'Revise el sueldo bruto.';
  else if (hasPension(f.type) && f.type && gross < MIN_WAGE) e.grossSalary = `No puede ser menor a la remuneración mínima vital (S/ ${MIN_WAGE.toLocaleString('en-US')}).`;
  if (hasPension(f.type) && f.type) {
    if (!f.pensionSystem) e.pensionSystem = 'Seleccione el sistema de pensiones.';
    else if (f.pensionSystem === 'AFP' && !(AFP_FUNDS as readonly string[]).includes(f.pensionFund)) e.pensionFund = 'Seleccione la AFP.';
  }
  if (hasVacations(f.type)) {
    if (f.vacationStart && !f.vacationEnd) e.vacationEnd = 'Indique la fecha de retorno.';
    else if (!f.vacationStart && f.vacationEnd) e.vacationStart = 'Indique la fecha de inicio de las vacaciones.';
    else if (f.vacationStart && f.vacationEnd && f.vacationEnd < f.vacationStart) e.vacationEnd = 'El retorno no puede ser anterior al inicio.';
    if (f.vacationStart && f.startDate && f.vacationStart < f.startDate) e.vacationStart = 'Las vacaciones no pueden empezar antes del contrato.';
    if (f.vacationEnd && f.endDate && f.vacationEnd > f.endDate) e.vacationEnd = 'Las vacaciones no pueden terminar después del contrato.';
  }
  // Un trabajador tiene un solo contrato vigente
  if (f.staffId && contracts.some(c => c.id !== editingId && c.staffId === f.staffId && contractStatus(c, today) === 'Vigente')) {
    e.staffId = 'Este trabajador ya tiene un contrato vigente. Ciérrelo antes de crear otro.';
  }
  return e;
}

/** Contrato listo para guardar (el neto y los aportes se calculan; nunca se escriben a mano). */
export function buildContract(f: ContractForm, staff: { hasChildren?: boolean } = {}, year: number = new Date().getFullYear()): Omit<Contract, 'id'> {
  const gross = Number(f.grossSalary);
  const est = estimateNet(gross, f.type, f.pensionSystem, f.pensionFund, staff, year, f.suspension4ta);
  return {
    staffId: f.staffId,
    type: f.type,
    startDate: f.startDate,
    endDate: needsEndDate(f.type) ? f.endDate : undefined,
    status: 'Vigente',
    shift: FULL_TIME,
    pensionSystem: hasPension(f.type) ? f.pensionSystem : undefined,
    pensionFund: hasPension(f.type) && f.pensionSystem === 'AFP' ? f.pensionFund : undefined,
    grossSalary: gross,
    contribution: est?.contribution ?? 0,
    incomeTax: est?.incomeTax ?? 0,
    familyAllowance: est?.familyAllowance ?? 0,
    netSalary: est?.net ?? gross,
    suspension4ta: f.type === 'Locación de servicios' && f.suspension4ta ? true : undefined,
    vacationStart: hasVacations(f.type) ? f.vacationStart || undefined : undefined,
    vacationEnd: hasVacations(f.type) ? f.vacationEnd || undefined : undefined,
    observations: f.observations.trim() || undefined,
  };
}

// ---------------------------------------------------------------- Edición de un contrato vigente

export const contractToForm = (c: Contract): ContractForm => ({
  staffId: c.staffId, type: c.type, startDate: c.startDate, endDate: c.endDate ?? '', grossSalary: c.grossSalary !== undefined ? String(c.grossSalary) : '',
  pensionSystem: c.pensionSystem ?? '', pensionFund: c.pensionFund ?? '', vacationStart: c.vacationStart ?? '', vacationEnd: c.vacationEnd ?? '',
  observations: c.observations ?? '', suspension4ta: !!c.suspension4ta,
});

/** Cambios que se guardan al editar (no toca al trabajador ni el estado del contrato). */
export function buildContractPatch(f: ContractForm, staff: { hasChildren?: boolean } = {}): Partial<Omit<Contract, 'id'>> {
  const { staffId: _staffId, status: _status, ...patch } = buildContract(f, staff);
  return patch;
}

const fmtMoney = (n: number | undefined) => (n === undefined ? '—' : `S/ ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const txt = (v: string | undefined) => (v && v.trim() ? v : '—');

/** Qué cambia al editar un contrato (con etiquetas legibles, para la constancia). */
export function diffContract(before: Contract, after: Partial<Omit<Contract, 'id'>>): ContractRevisionChange[] {
  const rows: [string, string, string][] = [
    ['Tipo de contrato', txt(before.type), txt(after.type)],
    ['Fecha de inicio', txt(before.startDate), txt(after.startDate)],
    ['Fecha de fin', txt(before.endDate), txt(after.endDate)],
    ['Sueldo bruto', fmtMoney(before.grossSalary), fmtMoney(after.grossSalary)],
    ['Sistema de pensiones', txt(before.pensionSystem), txt(after.pensionSystem)],
    ['AFP', txt(before.pensionFund), txt(after.pensionFund)],
    ['Vacaciones: inicio', txt(before.vacationStart), txt(after.vacationStart)],
    ['Vacaciones: retorno', txt(before.vacationEnd), txt(after.vacationEnd)],
    ['Suspensión de retenciones de 4.ª categoría', before.suspension4ta ? 'Sí' : 'No', after.suspension4ta ? 'Sí' : 'No'],
    ['Observaciones', txt(before.observations), txt(after.observations)],
  ];
  return rows.filter(([, from, to]) => from !== to).map(([label, from, to]) => ({ label, from, to }));
}

export const MIN_REASON_LEN = 5;

export function validateContractEdit(c: Contract, changes: ContractRevisionChange[], reason: string): string[] {
  const e: string[] = [];
  if (c.status !== 'Vigente') e.push('Solo se puede editar un contrato vigente. Un contrato cesado queda como historial: registre uno nuevo.');
  if (changes.length === 0) e.push('No hay cambios que guardar.');
  if (changes.length > 0 && reason.trim().length < MIN_REASON_LEN) e.push('Indique el motivo de la modificación: queda en el historial del contrato.');
  return e;
}
