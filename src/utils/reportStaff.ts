/**
 * Reporte de Personal (funciones puras): plantilla, contratos, accesos, bajas y costo de planilla.
 *
 * Cruza las cuatro piezas de Personas que antes se miraban por separado: la ficha, su asignación (sede, área y cargo), su contrato
 * (vigente, por vencer o vencido) y su cuenta de acceso; y le suma lo que costó la última planilla cerrada. Señala lo que hay que
 * corregir: personal activo sin contrato, sin asignación o con el contrato vencido.
 */
import type { Assignment, Contract, PayrollRun, Staff, User } from '../context/DataContext';
import { contractStatus } from './payroll';
import { addDaysISO } from './schedule';
import { daysApart, inRange, round2, sum, tally, type Count, type DateRange } from './reportCommon';

export const EXPIRY_DAYS = 30;
export const VACATION_HORIZON_DAYS = 60;

export interface StaffReportContext {
  staff: Staff[];
  contracts: Contract[];
  assignments: Assignment[];
  users: User[];
  branches: { id: string; name: string }[];
  payrollRuns: PayrollRun[];
  today: string;
}

export interface StaffFilters {
  /** Sede de su asignación principal («» = todas, incluido el personal sin asignación). */
  branchId: string;
  /** Rango en el que se cuentan las bajas. */
  range: DateRange;
}

export interface StaffRow {
  staff: Staff;
  name: string;
  branch: string;
  area: string;
  role: string;
  contract?: Contract;
  contractState: string;
  account?: User;
}

export interface ContractAlert { staffName: string; contractId: string; type: string; endDate: string; days: number; state: 'Por vencer' | 'Vencido' }

export interface StaffReport {
  kpis: { active: number; inactive: number; withContract: number; withoutContract: number; expiring: number; expired: number; withAccount: number; withoutAccount: number; withoutAssignment: number; leavers: number };
  byBranch: Count[];
  byArea: Count[];
  byRole: Count[];
  contractTypes: Count[];
  alerts: ContractAlert[];
  withoutContract: StaffRow[];
  withoutAssignment: StaffRow[];
  vacations: { staffName: string; from: string; to: string }[];
  payroll?: {
    period: string; status: string; headcount: number; net: number; employerCost: number;
    byBranch: { name: string; headcount: number; net: number; employerCost: number }[];
  };
  rows: StaffRow[];
}

const fullName = (s: Staff) => `${s.names} ${s.lastNameP} ${s.lastNameM}`.replace(/\s+/g, ' ').trim();

export function staffReport(ctx: StaffReportContext, f: StaffFilters): StaffReport {
  const rowOf = (s: Staff): StaffRow => {
    const own = ctx.assignments.filter(a => a.staffId === s.id && a.status === 'Activa');
    const main = own.find(a => a.isMain) ?? own[0];
    const contracts = ctx.contracts.filter(c => c.staffId === s.id);
    const current = contracts.find(c => contractStatus(c, ctx.today) === 'Vigente') ?? contracts.filter(c => contractStatus(c, ctx.today) === 'Vencido').sort((a, b) => (b.endDate ?? '').localeCompare(a.endDate ?? ''))[0];
    return {
      staff: s, name: fullName(s), branch: main?.branch ?? '', area: main?.area ?? '', role: main?.role ?? '', contract: current,
      contractState: current ? contractStatus(current, ctx.today) : 'Sin contrato', account: ctx.users.find(u => u.staffId === s.id),
    };
  };

  const branchName = ctx.branches.find(b => b.id === f.branchId)?.name;
  const all = ctx.staff.map(rowOf);
  const scoped = all.filter(r => !f.branchId || r.branch === branchName);
  const active = scoped.filter(r => r.staff.status === 'Activo');
  const inactive = scoped.filter(r => r.staff.status !== 'Activo');

  const alerts: ContractAlert[] = [];
  for (const r of active) {
    const c = r.contract;
    if (!c?.endDate) continue;
    const days = daysApart(ctx.today, c.endDate);
    if (r.contractState === 'Vencido') alerts.push({ staffName: r.name, contractId: c.id, type: c.type, endDate: c.endDate, days, state: 'Vencido' });
    else if (r.contractState === 'Vigente' && days <= EXPIRY_DAYS) alerts.push({ staffName: r.name, contractId: c.id, type: c.type, endDate: c.endDate, days, state: 'Por vencer' });
  }
  alerts.sort((a, b) => a.days - b.days);

  const horizon = addDaysISO(ctx.today, VACATION_HORIZON_DAYS);
  const vacations = active
    .filter(r => r.contractState === 'Vigente' && r.contract?.vacationStart && r.contract.vacationEnd && r.contract.vacationEnd >= ctx.today && r.contract.vacationStart <= horizon)
    .map(r => ({ staffName: r.name, from: r.contract!.vacationStart as string, to: r.contract!.vacationEnd as string }))
    .sort((a, b) => a.from.localeCompare(b.from));

  // Última planilla cerrada (o pagada): costo por sede
  const run = [...ctx.payrollRuns].filter(r => r.status !== 'Borrador' && r.lines).sort((a, b) => b.period.localeCompare(a.period))[0];
  let payroll: StaffReport['payroll'];
  if (run?.lines) {
    const lines = run.lines.filter(l => !f.branchId || l.branch === branchName);
    const groups = new Map<string, { name: string; staff: Set<string>; net: number; employerCost: number }>();
    for (const l of lines) {
      const name = l.branch || 'Sin sede';
      const cur = groups.get(name) ?? { name, staff: new Set<string>(), net: 0, employerCost: 0 };
      cur.staff.add(l.staffId);
      cur.net = round2(cur.net + l.calc.net);
      cur.employerCost = round2(cur.employerCost + l.calc.totalIncome + l.calc.essalud);
      groups.set(name, cur);
    }
    payroll = {
      period: run.period, status: run.status, headcount: new Set(lines.map(l => l.staffId)).size, net: sum(lines, l => l.calc.net), employerCost: sum(lines, l => l.calc.totalIncome + l.calc.essalud),
      byBranch: [...groups.values()].map(g => ({ name: g.name, headcount: g.staff.size, net: g.net, employerCost: g.employerCost })).sort((a, b) => b.employerCost - a.employerCost),
    };
  }

  return {
    kpis: {
      active: active.length, inactive: inactive.length,
      withContract: active.filter(r => r.contractState === 'Vigente').length,
      withoutContract: active.filter(r => r.contractState === 'Sin contrato' || r.contractState === 'Vencido' || r.contractState === 'Cesado').length,
      expiring: alerts.filter(a => a.state === 'Por vencer').length, expired: alerts.filter(a => a.state === 'Vencido').length,
      withAccount: active.filter(r => r.account?.status === 'Activo').length, withoutAccount: active.filter(r => r.account?.status !== 'Activo').length,
      withoutAssignment: active.filter(r => !r.branch).length,
      leavers: inactive.filter(r => inRange(r.staff.statusDate, f.range)).length,
    },
    byBranch: tally(active, r => r.branch, 'Sin asignación'),
    byArea: tally(active, r => r.area, 'Sin asignación'),
    byRole: tally(active, r => r.role, 'Sin asignación'),
    contractTypes: tally(active.filter(r => r.contractState === 'Vigente'), r => r.contract?.type),
    alerts,
    withoutContract: active.filter(r => r.contractState !== 'Vigente'),
    withoutAssignment: active.filter(r => !r.branch),
    vacations,
    payroll,
    rows: [...scoped].sort((a, b) => a.name.localeCompare(b.name)),
  };
}
