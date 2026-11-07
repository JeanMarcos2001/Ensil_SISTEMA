/**
 * Planilla mensual (funciones puras): cómo se genera desde los contratos, se ajusta, se cierra, se paga y se reabre.
 *
 * **Una planilla es de UNA empresa y UN mes**: cada RUC presenta la suya, con sus boletas, y se cierra y reabre por separado (un problema
 * en los contratos de una empresa no frena el cierre de las demás). Solo entran los contratos de esa empresa.
 *
 * Flujo:
 *  1. GENERAR el período (AAAA-MM) de una empresa: una línea por contrato suyo que cubre algún día del mes, calculada con `payrollEngine`
 *     (prorrateo por días, asignación familiar, pensión, renta de 5.ª / 4.ª, gratificación). El contrato es la fuente:
 *     mientras la planilla es BORRADOR, si el contrato cambia, la línea se recalcula.
 *  2. AJUSTAR (solo en borrador): ingresos eventuales (bonos, comisiones, horas extra) y descuentos (adelantos, tardanzas),
 *     cada uno con concepto y motivo. Un ingreso afecto suma a la base de pensión y de renta.
 *  3. CERRAR: la planilla guarda una FOTO de cada línea (con el contrato tal como estaba). Desde entonces cambiar el contrato
 *     no la altera, y alimenta la renta de 5.ª de los meses siguientes (lo realmente cobrado y retenido).
 *  4. NO HAY «PAGAR»: el sistema no registra pagos al personal (la planilla es referencial; ver CLAUDE.md).
 *  5. REABRIR (con motivo): solo una planilla cerrada, y solo si no hay una planilla posterior cerrada del mismo año.
 *
 * Fuera del sistema por decisión (2026-11-07, no es un pendiente): pagos de sueldos, liquidación de beneficios al cese, PLAME / T-Registro,
 * ni ingresos de otros empleadores. Ver `docs/REGLAS_DE_NEGOCIO.md`.
 */
import type { Assignment, Company, Contract, PayrollAdjustment, PayrollLine, PayrollRun, Staff } from '../context/DataContext';
import { addPeriods, computeLine, coveredDays, isFreelance, isPeriod, periodEnd, periodLabel, periodOf, periodStart, periodYear, round2, type PriorMonth } from './payrollEngine';
import { escapeHtml } from './printTable';
import type { LaborRegime } from './statuses';

export const MIN_TEXT = 5;
export const MAX_ADJUSTMENT = 100000;

/** `PLA-AAAA-MM-EMP-NNN`: la planilla de ese mes de esa empresa (el mismo código que guarda la base). */
export const runIdOf = (period: string, companyId: string) => `PLA-${period}-${companyId}`;

export interface PayrollContext {
  contracts: Contract[];
  staff: Staff[];
  assignments: Assignment[];
  runs: PayrollRun[];
  /** Las empresas (para rotular las líneas con su nombre y RUC). */
  companies: Pick<Company, 'id' | 'name' | 'ruc' | 'laborRegime'>[];
}

export interface PayrollWarning {
  level: 'error' | 'aviso';
  staffId?: string;
  text: string;
}

export interface BuiltPayroll {
  lines: PayrollLine[];
  warnings: PayrollWarning[];
}

const fullName = (s: Pick<Staff, 'names' | 'lastNameP' | 'lastNameM'>) => `${s.names} ${s.lastNameP} ${s.lastNameM}`.replace(/\s+/g, ' ').trim();

/** Contratos que cubren algún día del período (vigentes, vencidos que aún cubrían el mes o cesados dentro de él); de una empresa si se indica. */
export function contractsInPeriod(contracts: Contract[], period: string, companyId?: string): Contract[] {
  return contracts.filter(c => (c.grossSalary ?? 0) > 0 && coveredDays(c, period) > 0 && (!companyId || c.companyId === companyId));
}

/** Lo realmente cobrado y retenido por el trabajador en los meses anteriores del año, según las planillas cerradas. */
export function priorMonths(runs: PayrollRun[], staffId: string, period: string): PriorMonth[] {
  const out = new Map<string, PriorMonth>();
  for (const r of runs) {
    if (r.status === 'Borrador' || !r.lines || periodYear(r.period) !== periodYear(period) || r.period >= period) continue;
    for (const l of r.lines.filter(x => x.staffId === staffId)) {
      const income = l.calc.taxKind === '5.ª categoría' ? round2(l.calc.pensionBase + l.calc.gratification + l.calc.gratificationBonus) : 0;
      const withheld = l.calc.taxKind === '5.ª categoría' ? l.calc.incomeTax : 0;
      const prev = out.get(r.period);
      out.set(r.period, { period: r.period, income: round2((prev?.income ?? 0) + income), withheld: round2((prev?.withheld ?? 0) + withheld) });
    }
  }
  return [...out.values()];
}

const mainAssignment = (staffId: string, assignments: Assignment[]): Assignment | undefined => {
  const own = assignments.filter(a => a.staffId === staffId && a.status === 'Activa');
  return own.find(a => a.isMain) ?? own[0];
};

/** Construye las líneas de un período de UNA empresa a partir de sus contratos y de los ajustes cargados. */
export function buildLines(period: string, companyId: string, ctx: PayrollContext, adjustments: PayrollAdjustment[]): BuiltPayroll {
  const lines: PayrollLine[] = [];
  const warnings: PayrollWarning[] = [];
  const company = ctx.companies.find(x => x.id === companyId);
  /** Régimen de la empresa: en MYPE no hay gratificación, bonificación, CTS ni aporte de salud del empleador (los calcula contabilidad). */
  const regime: LaborRegime = company?.laborRegime ?? 'General';
  const covered = contractsInPeriod(ctx.contracts, period, companyId);
  const coveredAnywhere = contractsInPeriod(ctx.contracts, period);

  for (const contract of covered) {
    const member = ctx.staff.find(s => s.id === contract.staffId);
    if (!member) { warnings.push({ level: 'error', text: `El contrato ${contract.id} no tiene ficha de personal.` }); continue; }
    const own = adjustments.filter(a => a.staffId === member.id);
    // Con dos contratos en el mes (uno cesa y otro empieza) los ajustes van al más reciente
    const latest = covered.filter(c => c.staffId === member.id).sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
    const calc = computeLine({
      contract: { type: contract.type, startDate: contract.startDate, endDate: contract.endDate, grossSalary: contract.grossSalary, pensionSystem: contract.pensionSystem, pensionFund: contract.pensionFund, suspension4ta: contract.suspension4ta, regime },
      staff: member,
      period,
      adjustments: latest.id === contract.id ? own.map(a => ({ kind: a.kind, amount: a.amount, taxable: a.taxable })) : [],
      prior: priorMonths(ctx.runs, member.id, period),
    });
    const assignment = mainAssignment(member.id, ctx.assignments);
    const lineWarnings: string[] = [];
    if (!isFreelance(contract.type) && !contract.pensionSystem) { lineWarnings.push('Falta el sistema de pensiones del contrato.'); warnings.push({ level: 'error', staffId: member.id, text: `${fullName(member)}: falta el sistema de pensiones en su contrato.` }); }
    if (!isFreelance(contract.type) && contract.pensionSystem === 'AFP' && !contract.pensionFund) { lineWarnings.push('Falta la AFP.'); warnings.push({ level: 'error', staffId: member.id, text: `${fullName(member)}: falta la AFP en su contrato.` }); }
    if (calc.net < 0) { lineWarnings.push('El neto es negativo.'); warnings.push({ level: 'error', staffId: member.id, text: `${fullName(member)}: los descuentos superan el ingreso del mes.` }); }
    if (!assignment) warnings.push({ level: 'aviso', staffId: member.id, text: `${fullName(member)}: no tiene una asignación activa (la sede de la boleta queda vacía).` });
    if (calc.days < calc.daysInMonth) lineWarnings.push(`Pagado ${calc.days} de ${calc.daysInMonth} días (${contract.startDate > periodStart(period) ? 'ingresó' : 'cesa'} dentro del mes).`);
    if (contract.status === 'Vigente' && contract.endDate && contract.endDate < periodEnd(period)) warnings.push({ level: 'aviso', staffId: member.id, text: `${fullName(member)}: su contrato vence el ${contract.endDate}. Renuévelo para el mes siguiente.` });
    if (calc.ctsDeposit > 0) lineWarnings.push(`CTS a depositar este mes: S/ ${calc.ctsDeposit.toFixed(2)} (no forma parte del neto).`);
    lines.push({
      staffId: member.id, staffName: fullName(member), docType: member.docType, docNumber: member.docNumber, contractId: contract.id, contractType: contract.type,
      companyId, companyName: company?.name ?? '', companyRuc: company?.ruc ?? '', regime,
      branch: assignment?.branch ?? '', role: contract.position?.trim() ?? '', pensionSystem: contract.pensionSystem, pensionFund: contract.pensionFund,
      grossSalary: contract.grossSalary ?? 0, calc, adjustments: latest.id === contract.id ? own : [], warnings: lineWarnings,
    });
  }

  // Personal activo sin contrato que cubra el mes en NINGUNA empresa: no entra a ninguna planilla. Como la empresa que emplea a alguien no depende de
  // la sede donde trabaja, no se puede saber a cuál le tocaría: se avisa una sola vez, con sus nombres, en la planilla de cualquier empresa.
  const without = ctx.staff.filter(s => s.status === 'Activo' && !coveredAnywhere.some(c => c.staffId === s.id));
  if (without.length > 0) {
    const who = without.map(fullName).join(', ');
    warnings.push({ level: 'aviso', text: `${without.length === 1 ? '1 persona activa no tiene contrato' : `${without.length} personas activas no tienen contrato`} que cubra ${periodLabel(period)} en ninguna empresa (no entra${without.length === 1 ? '' : 'n'} a ninguna planilla): ${who}.` });
  }
  lines.sort((a, b) => a.staffName.localeCompare(b.staffName));
  return { lines, warnings };
}

/** Líneas de una planilla: la foto si ya se cerró; si es borrador, se recalculan con el contrato actual. */
export function linesOf(run: PayrollRun, ctx: PayrollContext): BuiltPayroll {
  if (run.status !== 'Borrador' && run.lines) return { lines: run.lines, warnings: [] };
  return buildLines(run.period, run.companyId, { ...ctx, runs: ctx.runs.filter(r => r.id !== run.id) }, run.adjustments);
}

export interface PayrollTotals {
  headcount: number;
  income: number;
  pension: number;
  incomeTax: number;
  otherDeductions: number;
  net: number;
  essalud: number;
  /** Costo del empleador: ingresos + EsSalud. */
  employerCost: number;
  cts: number;
}

export function totalsOf(lines: PayrollLine[]): PayrollTotals {
  const sum = (f: (l: PayrollLine) => number) => round2(lines.reduce((s, l) => s + f(l), 0));
  const income = sum(l => l.calc.totalIncome);
  const essalud = sum(l => l.calc.essalud);
  return {
    headcount: new Set(lines.map(l => l.staffId)).size, income, pension: sum(l => l.calc.pension), incomeTax: sum(l => l.calc.incomeTax),
    otherDeductions: sum(l => l.calc.otherDeductions), net: sum(l => l.calc.net), essalud, employerCost: round2(income + essalud), cts: sum(l => l.calc.ctsDeposit),
  };
}

// ---------------------------------------------------------------- Validaciones del flujo
export function validateGenerate(period: string, companyId: string, runs: Pick<PayrollRun, 'companyId' | 'period' | 'status'>[], today: string): string[] {
  const e: string[] = [];
  if (!companyId) return ['Elija la empresa de la planilla.'];
  if (!isPeriod(period)) return ['Elija el mes de la planilla.'];
  const own = runs.filter(r => r.companyId === companyId);
  if (period > periodOf(today)) e.push('No se genera la planilla de un mes que aún no empieza.');
  if (own.some(r => r.period === period)) e.push(`Ya existe la planilla de ${periodLabel(period)} de esa empresa.`);
  const previous = addPeriods(period, -1);
  if (periodYear(previous) === periodYear(period) && own.some(r => r.period === previous && r.status === 'Borrador')) {
    e.push(`Cierre primero la planilla de ${periodLabel(previous)} de esa empresa: la renta de 5.ª categoría de este mes depende de lo retenido en el anterior.`);
  }
  return e;
}

export function validateAdjustment(run: Pick<PayrollRun, 'status'>, input: { kind: string; concept: string; amount: number; reason: string }, staffInLines: boolean): string[] {
  const e: string[] = [];
  if (run.status !== 'Borrador') e.push('Solo se ajusta una planilla en borrador. Si ya se cerró, reábrala con un motivo.');
  if (!staffInLines) e.push('El trabajador no figura en esta planilla.');
  if (input.kind !== 'Ingreso' && input.kind !== 'Descuento') e.push('Indique si es un ingreso o un descuento.');
  if (input.concept.trim().length < 3) e.push('Indique el concepto (p. ej. «Bono por metas»).');
  if (!(input.amount > 0)) e.push('El monto debe ser mayor que cero.');
  else if (input.amount > MAX_ADJUSTMENT) e.push('Revise el monto.');
  if (input.reason.trim().length < MIN_TEXT) e.push('Indique el motivo: queda en la planilla.');
  return e;
}

export function validateClose(run: Pick<PayrollRun, 'status' | 'period'>, built: BuiltPayroll, today: string): string[] {
  const e: string[] = [];
  if (run.status !== 'Borrador') e.push('La planilla ya está cerrada.');
  if (built.lines.length === 0) e.push('La planilla no tiene trabajadores: no hay contratos que cubran el mes.');
  if (run.period > periodOf(today)) e.push('No se cierra la planilla de un mes que aún no empieza.');
  e.push(...built.warnings.filter(w => w.level === 'error').map(w => w.text));
  return e;
}

export function validateReopen(run: Pick<PayrollRun, 'status' | 'period' | 'id' | 'companyId'>, runs: Pick<PayrollRun, 'id' | 'status' | 'period' | 'companyId'>[], reason: string): string[] {
  const e: string[] = [];
  if (run.status !== 'Cerrada') e.push('La planilla ya está en borrador.');
  if (reason.trim().length < MIN_TEXT) e.push('Indique el motivo de la reapertura: queda en el historial.');
  const later = runs.find(r => r.id !== run.id && r.companyId === run.companyId && r.status !== 'Borrador' && periodYear(r.period) === periodYear(run.period) && r.period > run.period);
  if (later) e.push(`Ya está cerrada la planilla de ${periodLabel(later.period)}: reabra primero esa (la renta de 5.ª depende del orden).`);
  return e;
}

// ---------------------------------------------------------------- Salidas
const money = (n: number) => `S/ ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const PAYROLL_HEADERS = ['Trabajador', 'Documento', 'Sede', 'Contrato', 'Días', 'Sueldo', 'Asig. familiar', 'Gratificación + bonif.', 'Otros ingresos', 'Total ingresos', 'Pensión', 'Renta', 'Otros descuentos', 'Neto referencial', 'EsSalud (empleador)', 'CTS a depositar'];
/** Columnas que no se muestran en régimen MYPE (gratificación + bonificación, EsSalud y CTS): las calcula contabilidad. */
const MYPE_HIDDEN_COLUMNS = [7, 14, 15];
export const payrollHeaders = (regime: LaborRegime = 'General'): string[] => (regime === 'General' ? PAYROLL_HEADERS : PAYROLL_HEADERS.filter((_, i) => !MYPE_HIDDEN_COLUMNS.includes(i)));
const payrollRowOf = (l: PayrollLine): (string | number)[] => [
  l.staffName, `${l.docType} ${l.docNumber}`, l.branch, l.contractType, `${l.calc.days}/${l.calc.daysInMonth}`, l.calc.basic, l.calc.familyAllowance,
  round2(l.calc.gratification + l.calc.gratificationBonus), round2(l.calc.extraTaxable + l.calc.extraNonTaxable), l.calc.totalIncome, l.calc.pension,
  l.calc.incomeTax, l.calc.otherDeductions, l.calc.net, l.calc.essalud, l.calc.ctsDeposit,
];
export const payrollRows = (lines: PayrollLine[], regime: LaborRegime = 'General'): (string | number)[][] =>
  lines.map(l => (regime === 'General' ? payrollRowOf(l) : payrollRowOf(l).filter((_, i) => !MYPE_HIDDEN_COLUMNS.includes(i))));

/**
 * Detalle de remuneración REFERENCIAL de un trabajador (HTML listo para imprimir o guardar como PDF). NO es la boleta oficial de pago: el sistema no
 * paga ni liquida al personal; contabilidad emite la boleta oficial y valida el cálculo. Por eso no lleva casillas de firma.
 */
export function payslipHtml(line: PayrollLine, period: string): string {
  const c = line.calc;
  const mype = line.regime === 'MYPE';
  const rows = (items: [string, number][]) => items.filter(([, v]) => v !== 0).map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td class="n">${escapeHtml(money(v))}</td></tr>`).join('');
  const extras = line.adjustments.filter(a => a.kind === 'Ingreso').map(a => [a.concept, a.amount] as [string, number]);
  const discounts = line.adjustments.filter(a => a.kind === 'Descuento').map(a => [a.concept, a.amount] as [string, number]);
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Detalle de remuneración ${escapeHtml(line.staffName)} ${escapeHtml(period)}</title><style>
    body{font-family:Arial,Helvetica,sans-serif;color:#1c1c1e;margin:28px;max-width:720px}
    h1{font-size:17px;margin:0} h2{font-size:12px;text-transform:uppercase;letter-spacing:.05em;margin:18px 0 6px;border-bottom:1px solid #ccc;padding-bottom:3px}
    p{font-size:12px;margin:2px 0;color:#444} table{border-collapse:collapse;width:100%;font-size:12px} td{padding:3px 6px;border-bottom:1px solid #eee} td.n{text-align:right}
    .cols{display:grid;grid-template-columns:1fr 1fr;gap:20px} .net{font-size:15px;font-weight:bold;margin-top:14px;text-align:right}
    .note{font-size:10px;color:#777;margin-top:16px}
  </style></head><body>
    <h1>${escapeHtml(line.companyName)}</h1><p>${line.companyRuc ? `RUC ${escapeHtml(line.companyRuc)} · ` : ''}Detalle de remuneración (referencial) · ${escapeHtml(periodLabel(period))}</p>
    <h2>Trabajador</h2>
    <p><b>${escapeHtml(line.staffName)}</b> · ${escapeHtml(line.docType)} ${escapeHtml(line.docNumber)}</p>
    <p>${escapeHtml(line.role)}${line.branch ? ` · ${escapeHtml(line.branch)}` : ''} · ${escapeHtml(line.contractType)}${line.pensionSystem ? ` · ${escapeHtml(line.pensionSystem)}${line.pensionFund ? ` ${escapeHtml(line.pensionFund)}` : ''}` : ''}</p>
    <p>Días considerados: ${c.days} de ${c.daysInMonth}</p>
    <div class="cols"><div><h2>Ingresos</h2><table>${rows([['Remuneración', c.basic], ['Asignación familiar', c.familyAllowance], ['Gratificación', c.gratification], ['Bonificación extraordinaria (9 %)', c.gratificationBonus], ...extras, ...(c.extraNonTaxable > 0 && !extras.length ? [['Otros ingresos inafectos', c.extraNonTaxable] as [string, number]] : [])])}</table><p class="net" style="text-align:left">Total ingresos: ${escapeHtml(money(c.totalIncome))}</p></div>
    <div><h2>Descuentos</h2><table>${rows([[line.pensionSystem === 'ONP' ? 'ONP (13 %)' : 'Aporte AFP', c.pension], [`Renta de ${c.taxKind ?? '5.ª categoría'}`, c.incomeTax], ...discounts])}</table><p class="net" style="text-align:left">Total descuentos: ${escapeHtml(money(c.totalDeductions))}</p></div></div>
    <p class="net">NETO REFERENCIAL: ${escapeHtml(money(c.net))}</p>
    ${mype
    ? '<h2>Gratificación, CTS y aporte de salud del empleador</h2><p class="note" style="margin-top:4px">Régimen MYPE: no se calculan aquí; los calcula contabilidad según el régimen de la empresa.</p>'
    : `<h2>Aportes del empleador (no se descuentan)</h2><table>${rows([['EsSalud (9 %)', c.essalud]]) || '<tr><td>—</td><td></td></tr>'}</table>`}
    ${c.ctsDeposit > 0 ? `<p class="note">CTS estimada para este mes: ${escapeHtml(money(c.ctsDeposit))} (no forma parte del neto; el depósito se hace fuera del sistema).</p>` : ''}
    <p class="note">Detalle referencial con las tasas del sistema: no reemplaza la boleta oficial de pago. La validación tributaria es de contabilidad.</p>
  </body></html>`;
}
