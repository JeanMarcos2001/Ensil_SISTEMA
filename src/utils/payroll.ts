/**
 * Reglas de los contratos y estimación del sueldo neto (funciones puras).
 *
 *  - No existe jornada part time: todo contrato es Full time.
 *  - El sueldo neto es una ESTIMACIÓN: sueldo bruto − aportes al sistema de pensiones. No incluye renta de 5.ª categoría
 *    ni descuentos propios de la planilla. Las tasas son referenciales y se mantienen aquí para actualizarlas en un solo lugar.
 *  - No hay «tipo de comisión»: de cada AFP se usa su tasa total referencial.
 *  - La locación de servicios no tiene aportes a pensiones: el neto es igual al bruto.
 */
import type { Contract, Staff } from '../context/DataContext';

export const CONTRACT_TYPES = ['Indeterminado', 'Plazo Fijo', 'Locación de servicios'] as const;
export type ContractType = (typeof CONTRACT_TYPES)[number];
export const FULL_TIME = 'Full time';

export const PENSION_SYSTEMS = ['AFP', 'ONP'] as const;
export const AFP_FUNDS = ['Integra', 'Prima', 'Habitat', 'Profuturo'] as const;

/** Remuneración mínima vital (S/). Aplica a los contratos dependientes (no a la locación de servicios). */
export const MIN_WAGE = 1130;
export const MAX_GROSS = 100000;
export const ONP_RATE = 0.13;
/** AFP: aporte al fondo (10 %) + prima de seguro + comisión de cada AFP. */
export const AFP_RATES: Record<(typeof AFP_FUNDS)[number], { fund: number; insurance: number; commission: number }> = {
  Integra: { fund: 0.10, insurance: 0.0137, commission: 0.0155 },
  Prima: { fund: 0.10, insurance: 0.0137, commission: 0.0160 },
  Habitat: { fund: 0.10, insurance: 0.0137, commission: 0.0147 },
  Profuturo: { fund: 0.10, insurance: 0.0137, commission: 0.0169 },
};

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

/** Aportes y sueldo neto estimados. null si falta el sueldo o el sistema de pensiones lo exige. */
export function estimateNet(gross: number, type: string, system: string, fund: string): { rate: number; contribution: number; net: number } | null {
  if (!(gross > 0)) return null;
  if (type !== 'Locación de servicios' && (!system || (system === 'AFP' && !(fund in AFP_RATES)))) return null;
  const rate = pensionRate(type, system, fund);
  const contribution = round2(gross * rate);
  return { rate, contribution, net: round2(gross - contribution) };
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
}

export type ContractErrors = Partial<Record<keyof ContractForm, string>>;

export const emptyContractForm = (): ContractForm => ({
  staffId: '', type: '', startDate: '', endDate: '', grossSalary: '', pensionSystem: '', pensionFund: '',
  vacationStart: '', vacationEnd: '', observations: '',
});

/** El contrato de plazo fijo o la locación necesitan fecha de fin; el indeterminado no la tiene. */
export const needsEndDate = (type: string) => type === 'Plazo Fijo' || type === 'Locación de servicios';
export const hasPension = (type: string) => type !== 'Locación de servicios';
export const hasVacations = (type: string) => type !== 'Locación de servicios';

/** Estado real de un contrato: un contrato vigente cuya fecha de fin ya pasó está vencido. */
export const contractStatus = (c: Pick<Contract, 'status' | 'endDate'>, today: string): string =>
  c.status === 'Vigente' && c.endDate && c.endDate < today ? 'Vencido' : c.status;

export function validateContractForm(f: ContractForm, contracts: Contract[], staff: Staff[], today: string): ContractErrors {
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
  if (f.staffId && contracts.some(c => c.staffId === f.staffId && contractStatus(c, today) === 'Vigente')) {
    e.staffId = 'Este trabajador ya tiene un contrato vigente. Ciérrelo antes de crear otro.';
  }
  return e;
}

/** Contrato listo para guardar (el neto y los aportes se calculan; nunca se escriben a mano). */
export function buildContract(f: ContractForm): Omit<Contract, 'id'> {
  const gross = Number(f.grossSalary);
  const est = estimateNet(gross, f.type, f.pensionSystem, f.pensionFund);
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
    netSalary: est?.net ?? gross,
    vacationStart: hasVacations(f.type) ? f.vacationStart || undefined : undefined,
    vacationEnd: hasVacations(f.type) ? f.vacationEnd || undefined : undefined,
    observations: f.observations.trim() || undefined,
  };
}
