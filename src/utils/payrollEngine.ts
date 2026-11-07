/**
 * Motor de cálculo de la planilla (funciones puras).
 *
 * Un solo cálculo sirve para dos cosas: el neto «de un mes regular» que muestra el contrato y la línea de cada trabajador
 * en la planilla mensual. Así el contrato y la planilla nunca se desacuerdan.
 *
 * Reglas (Perú, régimen general; las tasas están en constantes para actualizarlas en un solo lugar):
 *  - Remuneración = sueldo del contrato × (días cubiertos por el contrato en el mes ÷ días del mes).
 *  - Asignación familiar (dependientes con hijos declarados) = 10 % de la RMV, proporcional a los días.
 *  - Gratificación en julio y diciembre = 1/6 de la remuneración computable por cada mes COMPLETO del semestre
 *    (+ bonificación extraordinaria de 9 %). Es inafecta a aportes de pensión; sí cuenta para la renta de 5.ª.
 *  - CTS (mayo y noviembre): se DEPOSITA en el banco, no forma parte del neto; se informa aparte.
 *  - Pensión (ONP 13 % o AFP: aporte + seguro + comisión) sobre remuneración afecta (sueldo + asignación + ingresos afectos).
 *  - Renta de 5.ª categoría: método de proyección de la SUNAT — ingreso anual proyectado, menos 7 UIT, escala acumulativa de
 *    8 % / 14 % / 17 % / 20 % / 30 %, retenido en cuotas (÷12, ÷9, ÷8, ÷5, ÷4 y el saldo en diciembre).
 *  - Locación de servicios: sin pensión, sin 5.ª ni beneficios; retención de 4.ª categoría (8 %) si el honorario del mes pasa
 *    de S/ 3 300 y el prestador no presentó suspensión de retenciones.
 *  - EsSalud (9 %) lo paga el empleador: no baja el neto, pero sí es costo.
 *  - Régimen laboral de la EMPRESA: lo anterior de gratificación, bonificación, CTS y EsSalud es del régimen GENERAL. En MYPE (micro y pequeña empresa)
 *    esos cuatro conceptos NO se calculan (los calcula contabilidad según su régimen) y la planilla muestra solo lo ordinario.
 *
 * SUPUESTOS (el sistema no conoce más): se proyecta con el sueldo y los beneficios del contrato; no se consideran ingresos
 * de otros empleadores, deducciones adicionales de 3 UIT ni créditos de meses previos que no estén en planillas cerradas
 * (esos meses se suponen pagados con la misma regularidad). Es una retención referencial: la declaración la valida contabilidad.
 */
import type { Contract } from '../context/DataContext';
import type { LaborRegime } from './statuses';

export const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------- Constantes legales (revisar cada año)
export const UIT_BY_YEAR: Record<number, number> = { 2024: 5150, 2025: 5350, 2026: 5500 };
export const uitOf = (year: number): number => UIT_BY_YEAR[year] ?? UIT_BY_YEAR[Math.max(...Object.keys(UIT_BY_YEAR).map(Number))];
export const TAX_DEDUCTION_UIT = 7;
/** Escala acumulativa de la renta de 5.ª categoría: tramos en UIT sobre la renta neta anual. */
export const TAX_BRACKETS: { upToUit: number; rate: number }[] = [
  { upToUit: 5, rate: 0.08 }, { upToUit: 20, rate: 0.14 }, { upToUit: 35, rate: 0.17 }, { upToUit: 45, rate: 0.20 }, { upToUit: Infinity, rate: 0.30 },
];
/** Divisor de la retención mensual según el mes (el saldo de diciembre se retiene completo). */
export const RETENTION_DIVISOR: Record<number, number> = { 1: 12, 2: 12, 3: 12, 4: 9, 5: 8, 6: 8, 7: 8, 8: 5, 9: 4, 10: 4, 11: 4, 12: 1 };
export const FAMILY_ALLOWANCE_RATE = 0.10;
export const GRATIFICATION_BONUS_RATE = 0.09;
export const ESSALUD_RATE = 0.09;
export const FOURTH_CATEGORY_RATE = 0.08;
export const FOURTH_CATEGORY_MIN = 3300;
/** Remuneración mínima vital (S/): base de la asignación familiar. */
export const RMV = 1130;

export const isFreelance = (type: string) => type === 'Locación de servicios';

// ---------------------------------------------------------------- Fechas y períodos
export const isPeriod = (p: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(p);
export const periodYear = (p: string) => Number(p.slice(0, 4));
export const periodMonth = (p: string) => Number(p.slice(5, 7));
export const daysInPeriod = (p: string) => new Date(Date.UTC(periodYear(p), periodMonth(p), 0)).getUTCDate();
export const periodStart = (p: string) => `${p}-01`;
export const periodEnd = (p: string) => `${p}-${String(daysInPeriod(p)).padStart(2, '0')}`;
export const periodOf = (isoDate: string) => isoDate.slice(0, 7);
export const addPeriods = (p: string, n: number): string => {
  const total = periodYear(p) * 12 + (periodMonth(p) - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
};
const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const periodLabel = (p: string) => `${MONTH_NAMES[periodMonth(p) - 1]} ${periodYear(p)}`;

export interface ContractTerms {
  type: string;
  startDate: string;
  endDate?: string;
  grossSalary?: number;
  pensionSystem?: string;
  pensionFund?: string;
  /** Prestador de locación con suspensión de retenciones de 4.ª categoría. */
  suspension4ta?: boolean;
  /** Régimen laboral de la empresa del contrato; sin dato se calcula como General. */
  regime?: LaborRegime;
}

/** Días del mes que cubre el contrato (0 si no lo toca). */
export function coveredDays(c: Pick<ContractTerms, 'startDate' | 'endDate'>, period: string): number {
  const from = c.startDate > periodStart(period) ? c.startDate : periodStart(period);
  const to = c.endDate && c.endDate < periodEnd(period) ? c.endDate : periodEnd(period);
  if (to < from) return 0;
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000) + 1;
}

/** ¿El contrato cubre TODOS los días del mes? */
export const coversWholeMonth = (c: Pick<ContractTerms, 'startDate' | 'endDate'>, period: string) => coveredDays(c, period) === daysInPeriod(period);

/** Meses COMPLETOS cubiertos por el contrato entre dos períodos (inclusive). */
export function fullMonths(c: Pick<ContractTerms, 'startDate' | 'endDate'>, from: string, to: string): number {
  let n = 0;
  for (let p = from; p <= to; p = addPeriods(p, 1)) if (coversWholeMonth(c, p)) n++;
  return n;
}

// ---------------------------------------------------------------- Impuesto
/** Impuesto anual de 5.ª categoría sobre la renta neta (ya descontadas las 7 UIT). */
export function annualIncomeTax(netIncome: number, year: number): number {
  const uit = uitOf(year);
  let remaining = Math.max(0, netIncome);
  let previous = 0;
  let tax = 0;
  for (const b of TAX_BRACKETS) {
    const limit = b.upToUit === Infinity ? Infinity : b.upToUit * uit;
    const slice = Math.min(remaining, limit - previous);
    if (slice <= 0) break;
    tax += slice * b.rate;
    remaining -= slice;
    previous = limit;
    if (remaining <= 0) break;
  }
  return tax;
}

// ---------------------------------------------------------------- Entrada y salida de una línea
export interface PayrollAdjustmentInput {
  kind: 'Ingreso' | 'Descuento';
  amount: number;
  /** Ingreso afecto a aportes de pensión y a renta (bono, comisión, horas extra). Un ingreso inafecto (movilidad) no lo es. */
  taxable?: boolean;
}

/** Dato de un mes anterior del mismo año: lo realmente cobrado y retenido (de una planilla cerrada). */
export interface PriorMonth {
  period: string;
  /** Ingreso afecto a la renta de 5.ª de ese mes. */
  income: number;
  withheld: number;
}

export interface LineInput {
  contract: ContractTerms;
  staff: { hasChildren?: boolean };
  period: string;
  adjustments?: PayrollAdjustmentInput[];
  prior?: PriorMonth[];
}

export interface FifthDetail {
  annualIncome: number;
  deduction: number;
  netIncome: number;
  annualTax: number;
  alreadyWithheld: number;
  divisor: number;
}

export interface LineCalc {
  days: number;
  daysInMonth: number;
  /** Sueldo del contrato prorrateado. */
  basic: number;
  familyAllowance: number;
  gratification: number;
  gratificationBonus: number;
  extraTaxable: number;
  extraNonTaxable: number;
  /** Todo lo que se paga en el mes antes de descuentos. */
  totalIncome: number;
  pensionBase: number;
  pension: number;
  /** 5.ª categoría (dependientes) o 4.ª (locación). */
  incomeTax: number;
  taxKind: '5.ª categoría' | '4.ª categoría' | null;
  otherDeductions: number;
  totalDeductions: number;
  net: number;
  essalud: number;
  /** CTS a depositar este mes (mayo / noviembre); no forma parte del neto. */
  ctsDeposit: number;
  fifth?: FifthDetail;
}

export const ONP_RATE = 0.13;
/** AFP: aporte al fondo (10 %) + prima de seguro + comisión de cada AFP (tasas referenciales). */
export const AFP_RATES: Record<string, { fund: number; insurance: number; commission: number }> = {
  Integra: { fund: 0.10, insurance: 0.0137, commission: 0.0155 },
  Prima: { fund: 0.10, insurance: 0.0137, commission: 0.0160 },
  Habitat: { fund: 0.10, insurance: 0.0137, commission: 0.0147 },
  Profuturo: { fund: 0.10, insurance: 0.0137, commission: 0.0169 },
};
const afpTotal = (fund: string) => AFP_RATES[fund].fund + AFP_RATES[fund].insurance + AFP_RATES[fund].commission;

/** Tasa de pensión aplicable (0 si no corresponde). Debe coincidir con `pensionRate` de `payroll.ts`. */
export function pensionRateOf(c: Pick<ContractTerms, 'type' | 'pensionSystem' | 'pensionFund'>): number {
  if (isFreelance(c.type)) return 0;
  if (c.pensionSystem === 'ONP') return ONP_RATE;
  if (c.pensionSystem === 'AFP' && c.pensionFund && c.pensionFund in AFP_RATES) return afpTotal(c.pensionFund);
  return 0;
}

const hasBenefits = (c: Pick<ContractTerms, 'type'>) => !isFreelance(c.type);
/** Gratificación, bonificación, CTS y EsSalud: solo en régimen general (en MYPE los calcula contabilidad). */
const regimeBenefits = (c: Pick<ContractTerms, 'type' | 'regime'>) => hasBenefits(c) && (c.regime ?? 'General') === 'General';
const familyOf = (c: ContractTerms, staff: { hasChildren?: boolean }) => (hasBenefits(c) && staff.hasChildren ? round2(RMV * FAMILY_ALLOWANCE_RATE) : 0);

/** Remuneración computable (base de gratificación y CTS): sueldo + asignación familiar de un mes completo. */
const computable = (c: ContractTerms, staff: { hasChildren?: boolean }) => (c.grossSalary ?? 0) + familyOf(c, staff);

/** Gratificación (sin bonificación) que corresponde pagar en julio o diciembre. */
function gratificationFor(c: ContractTerms, staff: { hasChildren?: boolean }, year: number, month: 7 | 12): number {
  if (!regimeBenefits(c)) return 0;
  const from = `${year}-${month === 7 ? '01' : '07'}`;
  const to = `${year}-${month === 7 ? '06' : '12'}`;
  const n = fullMonths(c, from, to);
  return round2((computable(c, staff) * n) / 6);
}

/** CTS a depositar en mayo (nov–abr) o noviembre (may–oct). */
function ctsFor(c: ContractTerms, staff: { hasChildren?: boolean }, year: number, month: number): number {
  if (!regimeBenefits(c) || (month !== 5 && month !== 11)) return 0;
  const [from, to] = month === 5 ? [`${year - 1}-11`, `${year}-04`] : [`${year}-05`, `${year}-10`];
  const n = fullMonths(c, from, to);
  const base = computable(c, staff);
  return round2(((base + base / 6) * n) / 12);
}

/** Último mes del año que cubre el contrato (12 si sigue vigente). */
const lastMonthOf = (c: ContractTerms, year: number): number => (c.endDate && c.endDate.slice(0, 4) === String(year) ? Number(c.endDate.slice(5, 7)) : c.endDate && c.endDate.slice(0, 4) < String(year) ? 0 : 12);
const firstMonthOf = (c: ContractTerms, year: number): number => (c.startDate.slice(0, 4) === String(year) ? Number(c.startDate.slice(5, 7)) : c.startDate.slice(0, 4) > String(year) ? 13 : 1);

/**
 * Retención de 5.ª categoría de un mes por el método de proyección. Los meses anteriores del año salen de `prior`
 * (planillas cerradas) y, si faltan, se suponen pagados con la misma regularidad.
 */
function fifthCategory(c: ContractTerms, staff: { hasChildren?: boolean }, period: string, monthlyTaxable: number, thisMonthTaxable: number, prior: PriorMonth[]): { tax: number; detail: FifthDetail } {
  const year = periodYear(period);
  const month = periodMonth(period);
  const first = firstMonthOf(c, year);
  const last = lastMonthOf(c, year);
  const known = new Map(prior.filter(p => periodYear(p.period) === year).map(p => [periodMonth(p.period), p]));
  const bonus = 1 + GRATIFICATION_BONUS_RATE;
  const gratOf = (m: number) => (m === 7 || m === 12 ? round2(gratificationFor(c, staff, year, m) * bonus) : 0);

  // Ingreso y retención de un mes; para los meses previos sin planilla se supone lo regular
  const incomeOf = (m: number): number => known.get(m)?.income ?? (m < first || m > last ? 0 : monthlyTaxable + gratOf(m));
  const cache = new Map<number, number>();
  const retentionOf = (m: number): number => {
    const k = known.get(m);
    if (k) return k.withheld;
    if (m < first || m > last) return 0;
    if (!cache.has(m)) cache.set(m, compute(m, monthlyTaxable).tax);
    return cache.get(m) as number;
  };

  function compute(m: number, thisMonth: number): { tax: number; detail: FifthDetail } {
    let annual = 0;
    for (let i = 1; i < m; i++) annual += incomeOf(i);
    annual += thisMonth + gratOf(m);
    for (let i = m + 1; i <= last; i++) annual += monthlyTaxable + gratOf(i);
    const deduction = TAX_DEDUCTION_UIT * uitOf(year);
    const net = Math.max(0, annual - deduction);
    const annualTax = annualIncomeTax(net, year);
    // De enero a marzo se retiene 1/12 del impuesto anual; desde abril se descuenta lo ya retenido y se reparte lo que falta
    let already = 0;
    if (m > 3) for (let i = 1; i < m; i++) already += retentionOf(i);
    const divisor = RETENTION_DIVISOR[m];
    const tax = Math.max(0, (annualTax - already) / divisor);
    return { tax: round2(tax), detail: { annualIncome: round2(annual), deduction, netIncome: round2(net), annualTax: round2(annualTax), alreadyWithheld: round2(already), divisor } };
  }
  return compute(month, thisMonthTaxable);
}

/** Calcula la línea de un trabajador en un período. */
export function computeLine(input: LineInput): LineCalc {
  const { contract: c, staff, period } = input;
  const adjustments = input.adjustments ?? [];
  const total = daysInPeriod(period);
  const days = coveredDays(c, period);
  const ratio = total === 0 ? 0 : days / total;
  const gross = c.grossSalary ?? 0;
  const year = periodYear(period);
  const month = periodMonth(period);
  const benefits = hasBenefits(c);

  const basic = round2(gross * ratio);
  const familyAllowance = round2(familyOf(c, staff) * ratio);
  const extraTaxable = round2(adjustments.filter(a => a.kind === 'Ingreso' && a.taxable !== false).reduce((s, a) => s + a.amount, 0));
  const extraNonTaxable = round2(adjustments.filter(a => a.kind === 'Ingreso' && a.taxable === false).reduce((s, a) => s + a.amount, 0));
  const otherDeductions = round2(adjustments.filter(a => a.kind === 'Descuento').reduce((s, a) => s + a.amount, 0));

  const gratification = days > 0 && (month === 7 || month === 12) ? gratificationFor(c, staff, year, month) : 0;
  const gratificationBonus = round2(gratification * GRATIFICATION_BONUS_RATE);

  const pensionBase = round2(basic + familyAllowance + extraTaxable);
  const pension = round2(pensionBase * pensionRateOf(c));

  let incomeTax = 0;
  let taxKind: LineCalc['taxKind'] = null;
  let fifth: FifthDetail | undefined;
  if (benefits && days > 0) {
    taxKind = '5.ª categoría';
    // Se proyecta con lo regular de un mes completo; el mes actual entra con lo que realmente se paga (sin la gratificación,
    // que la proyección suma aparte en julio y diciembre)
    const regularMonthly = round2(gross + familyOf(c, staff));
    const r = fifthCategory(c, staff, period, regularMonthly, pensionBase, input.prior ?? []);
    incomeTax = r.tax;
    fifth = r.detail;
  } else if (!benefits && days > 0) {
    const fee = basic + extraTaxable;
    if (fee > FOURTH_CATEGORY_MIN && !c.suspension4ta) { incomeTax = round2(fee * FOURTH_CATEGORY_RATE); taxKind = '4.ª categoría'; }
  }

  const totalIncome = round2(basic + familyAllowance + gratification + gratificationBonus + extraTaxable + extraNonTaxable);
  const totalDeductions = round2(pension + incomeTax + otherDeductions);
  const essalud = regimeBenefits(c) ? round2(pensionBase * ESSALUD_RATE) : 0;
  return {
    days, daysInMonth: total, basic, familyAllowance, gratification, gratificationBonus, extraTaxable, extraNonTaxable, totalIncome,
    pensionBase, pension, incomeTax, taxKind, otherDeductions, totalDeductions, net: round2(totalIncome - totalDeductions), essalud,
    ctsDeposit: days > 0 ? ctsFor(c, staff, year, month) : 0, fifth,
  };
}

export interface RegularMonth {
  pension: number;
  incomeTax: number;
  taxKind: LineCalc['taxKind'];
  familyAllowance: number;
  net: number;
  rate: number;
}

/**
 * Neto de un MES REGULAR del contrato (un mes completo sin gratificación ni extras): es el que muestra el contrato.
 * Usa marzo del año indicado, que retiene 1/12 del impuesto anual proyectado.
 */
export function regularMonth(contract: ContractTerms, staff: { hasChildren?: boolean }, year: number): RegularMonth | null {
  const gross = contract.grossSalary ?? 0;
  if (!(gross > 0)) return null;
  if (!isFreelance(contract.type) && (!contract.pensionSystem || (contract.pensionSystem === 'AFP' && !(contract.pensionFund && contract.pensionFund in AFP_RATES)))) return null;
  // Se calcula como si el contrato cubriera todo el año, para que el mes sea completo
  const whole: ContractTerms = { ...contract, startDate: `${year}-01-01`, endDate: undefined };
  const calc = computeLine({ contract: whole, staff, period: `${year}-03` });
  return { pension: calc.pension, incomeTax: calc.incomeTax, taxKind: calc.taxKind, familyAllowance: calc.familyAllowance, net: calc.net, rate: pensionRateOf(contract) };
}

export type { Contract };
