/**
 * Renovación de contratos (funciones puras).
 *
 * Renovar es seguir con la misma persona y la misma empresa sin pasar por un cese: el contrato que vence queda **«Renovado»** (historial, con su fecha de
 * fin intacta) y nace uno nuevo que empieza **el día siguiente** a su fin, con las mismas condiciones salvo lo que se indique (la nueva
 * fecha de fin y, si cambia, el sueldo). Las vacaciones no se copian (son de cada período). El nuevo contrato guarda de cuál viene
 * (`renewsId`); el contrato anterior no guarda a cuál dio paso (se deduce).
 *
 * Solo se renueva un contrato **con fecha de fin** (plazo fijo o locación) que ya venció o vence dentro de la ventana de alerta
 * (`EXPIRY_DAYS`, los mismos días de la alerta «contratos por vencer»). Renovar pide un motivo y queda en el historial.
 */
import type { Contract, PayrollRun, Staff } from '../context/DataContext';
import { MIN_REASON } from './assignments';
import { periodOf } from './payrollEngine';
import { buildContract, contractStatus, emptyContractForm, needsEndDate, validateContractForm, type ContractForm } from './payroll';
import { EXPIRY_DAYS } from './reportStaff';
import { addDaysISO } from './schedule';
import type { LaborRegime } from './statuses';

export interface RenewalInput {
  /** Nueva fecha de fin. */
  endDate: string;
  /** Sueldo bruto nuevo; vacío = el mismo. */
  grossSalary: string;
  reason: string;
}

const dayDiff = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

/** ¿Se puede renovar este contrato hoy? (Solo el estado del contrato, sin mirar lo que se escribe.) */
export function renewalBlock(c: Contract, today: string): string | null {
  if (c.status !== 'Vigente') return 'Solo se renueva un contrato vigente o vencido sin cerrar.';
  if (!needsEndDate(c.type) || !c.endDate) return 'Un contrato indeterminado no se renueva: no tiene fecha de fin.';
  if (contractStatus(c, today) !== 'Vencido' && dayDiff(today, c.endDate) > EXPIRY_DAYS) return `Todavía falta mucho: se renueva desde ${EXPIRY_DAYS} días antes de su fin (${c.endDate}).`;
  return null;
}

/** El contrato nuevo en forma de formulario (para reutilizar las mismas validaciones y el mismo cálculo del neto). */
export function renewalForm(c: Contract, input: RenewalInput): ContractForm {
  return {
    ...emptyContractForm(),
    staffId: c.staffId, companyId: c.companyId ?? '', type: c.type, position: c.position ?? '', startDate: addDaysISO(c.endDate ?? '', 1), endDate: input.endDate,
    grossSalary: input.grossSalary.trim() || String(c.grossSalary ?? ''),
    pensionSystem: c.pensionSystem ?? '', pensionFund: c.pensionFund ?? '',
    observations: '', suspension4ta: !!c.suspension4ta,
  };
}

/** Todo lo que impide renovar con estos datos (el primero va al usuario). */
export function validateRenewal(c: Contract, input: RenewalInput, contracts: Contract[], staff: Staff[], runs: Pick<PayrollRun, 'status' | 'period' | 'companyId'>[], today: string): string[] {
  const block = renewalBlock(c, today);
  if (block) return [block];
  const e: string[] = [];
  if (input.reason.trim().length < MIN_REASON) e.push('Indique el motivo de la renovación: queda en el historial.');
  const form = renewalForm(c, input);
  if (!input.endDate) e.push('Indique la nueva fecha de fin.');
  else if (input.endDate <= form.startDate) e.push(`La nueva fecha de fin debe ser posterior al inicio del contrato nuevo (${form.startDate}).`);
  // Las mismas reglas de un contrato nuevo; «un solo contrato vigente» se mira sin contar el que se renueva
  const errors = validateContractForm(form, contracts.filter(x => x.id !== c.id), staff, today);
  const first = errors.grossSalary ?? errors.pensionSystem ?? errors.pensionFund ?? errors.endDate ?? errors.staffId;
  if (first && !e.includes(first)) e.push(first);
  if (contracts.some(x => x.id !== c.id && x.staffId === c.staffId && x.startDate >= form.startDate)) e.push('Ya hay un contrato de esta persona que empieza después del fin de este: no se puede renovar encima.');
  // La planilla es de cada empresa: solo cuentan las cerradas de la empresa del contrato
  if (runs.some(r => r.status !== 'Borrador' && r.period >= periodOf(form.startDate) && (!c.companyId || r.companyId === c.companyId))) {
    e.push(`Ya hay una planilla cerrada de ${periodOf(form.startDate)} o posterior: reábrala antes de renovar con fecha de inicio ${form.startDate}.`);
  }
  return e;
}

/** El contrato nuevo, listo para guardar. */
export function buildRenewal(c: Contract, input: RenewalInput, staff: { hasChildren?: boolean } = {}, year: number = new Date().getFullYear(), regime?: LaborRegime): Omit<Contract, 'id'> {
  return { ...buildContract(renewalForm(c, input), staff, year, regime), renewsId: c.id, observations: `Renovación de ${c.id}: ${input.reason.trim()}` };
}

/** El contrato anterior, ya renovado. */
export const markRenewed = (c: Contract): Contract => ({ ...c, status: 'Renovado' });

/** El contrato al que dio paso (se deduce; no se guarda en el anterior). */
export const renewedBy = (c: Pick<Contract, 'id'>, contracts: Pick<Contract, 'id' | 'renewsId'>[]): string | undefined => contracts.find(x => x.renewsId === c.id)?.id;
