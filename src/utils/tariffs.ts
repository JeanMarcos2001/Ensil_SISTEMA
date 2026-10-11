/**
 * Reglas de Tarifario y cronogramas (funciones puras, sin estado).
 *
 * Responsabilidades:
 *  - Tarifario = Programa + Nivel (opcional) + Tipo de pago + Vigencia + Moneda + Desglose.
 *  - Los tipos de pago disponibles para una matrícula salen SOLO de tarifarios activos y vigentes.
 *  - El desglose es la fuente del total.
 *  - Una CUOTA es una obligación programada; una PARTE DE PAGO es una fracción de un mismo pago.
 */
import type {
  PaymentPart,
  PaymentType,
  ScheduleMode,
  Tariff,
  TariffInstallment,
} from '../context/DataContext';

export interface TariffContext {
  programId: string;
  levelId?: string;
  branchId?: string;
  /** Fecha ISO (YYYY-MM-DD) para comprobar vigencia. */
  date: string;
}

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export const roundMoney = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** Suma días calendario exactos (sin «mismo día del mes siguiente»). Opera en UTC para evitar desfases de zona horaria. */
export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

/** `2026-04-15` → `15 Abr 2026` (mismo formato que usa Planes). */
export function formatDisplayDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return `${String(d).padStart(2, '0')} ${MONTHS[m - 1]} ${y}`;
}

export function resolveScheduleMode(paymentType: Pick<PaymentType, 'scheduleMode' | 'installments'>): ScheduleMode {
  if (paymentType.scheduleMode) return paymentType.scheduleMode;
  return paymentType.installments <= 1 ? 'inmediato' : 'intervalo_fijo';
}

/** ¿El tarifario puede usarse para este programa/nivel/sede en esa fecha? */
export function isTariffAvailable(tariff: Tariff, ctx: TariffContext): boolean {
  if (tariff.status !== 'Activo') return false;
  if (tariff.programId !== ctx.programId) return false;
  if (tariff.levelId && tariff.levelId !== ctx.levelId) return false;
  if (tariff.branchId !== 'all' && ctx.branchId && tariff.branchId !== ctx.branchId) return false;
  if (ctx.date < tariff.startDate) return false;
  if (tariff.endDate && ctx.date > tariff.endDate) return false;
  return true;
}

/** Tarifario aplicable a Programa/Nivel + Tipo de pago. Prefiere el de nivel específico y luego el de sede específica. */
export function findTariff(tariffs: Tariff[], ctx: TariffContext, paymentTypeId: string): Tariff | undefined {
  const candidates = tariffs.filter(t => t.paymentTypeId === paymentTypeId && isTariffAvailable(t, ctx));
  return candidates.sort((a, b) => {
    const score = (t: Tariff) => (t.levelId ? 2 : 0) + (t.branchId !== 'all' ? 1 : 0);
    return score(b) - score(a) || b.startDate.localeCompare(a.startDate);
  })[0];
}

/**
 * Tipos de pago que realmente existen para un programa/nivel/sede en una fecha.
 * Si no hay tarifario activo y vigente para la combinación, el tipo de pago NO aparece.
 */
export function getAvailablePaymentTypes(
  tariffs: Tariff[],
  paymentTypes: PaymentType[],
  ctx: TariffContext
): { paymentType: PaymentType; tariff: Tariff }[] {
  return paymentTypes
    .filter(pt => pt.status === 'Activo')
    .map(paymentType => ({ paymentType, tariff: findTariff(tariffs, ctx, paymentType.id) }))
    .filter((x): x is { paymentType: PaymentType; tariff: Tariff } => !!x.tariff);
}

export const sumBreakdown = (lines: TariffInstallment[]): number =>
  roundMoney(lines.reduce((acc, l) => acc + (l.variable ? 0 : l.amount), 0));

/** Total del tarifario: suma del desglose; en cronogramas con montos variables rige `basePrice` (total objetivo). */
export function tariffTotal(tariff: Pick<Tariff, 'installments' | 'basePrice'>): number {
  const hasVariable = tariff.installments.some(l => l.variable);
  return hasVariable ? tariff.basePrice : sumBreakdown(tariff.installments);
}

export interface BreakdownOptions {
  mode: ScheduleMode;
  /** Cantidad de obligaciones (sin contar la matrícula). */
  count: number;
  /** Intervalo entre cuotas en días (intervalo_fijo y fechas_manuales). */
  intervalDays: number;
  /** Monto de cada cuota (intervalo_fijo) o del pago único (inmediato). */
  amount: number;
  /** Matrícula como línea propia al día 0 (opcional). */
  enrollmentAmount?: number;
}

/** Genera el desglose del tarifario. La matrícula es una línea más (día 0); las cuotas se separan exactamente `intervalDays` días. */
export function generateBreakdown(opts: BreakdownOptions): TariffInstallment[] {
  const lines: TariffInstallment[] = [];
  const enrollment = roundMoney(opts.enrollmentAmount ?? 0);

  if (enrollment > 0) {
    lines.push({ number: 0, concept: 'Matrícula', amount: enrollment, dueDays: 0, kind: 'matricula' });
  }

  if (opts.mode === 'inmediato') {
    lines.push({ number: 1, concept: 'Pago único', amount: roundMoney(opts.amount), dueDays: 0, kind: 'unica' });
    return lines;
  }

  if (opts.mode === 'fechas_manuales') {
    for (let i = 0; i < opts.count; i++) {
      lines.push({
        number: i + 1,
        concept: i === opts.count - 1 && opts.count > 1 ? `Parte ${i + 1} (saldo)` : `Parte ${i + 1}`,
        amount: 0,
        dueDays: i * opts.intervalDays,
        kind: 'parte',
        variable: true,
      });
    }
    return lines;
  }

  for (let i = 0; i < opts.count; i++) {
    lines.push({
      number: i + 1,
      concept: `Cuota ${i + 1}`,
      amount: roundMoney(opts.amount),
      dueDays: i * opts.intervalDays,
      kind: 'cuota',
    });
  }
  return lines;
}

/** Obligaciones del cronograma (sin la matrícula) — sirve para validar contra `PaymentType.installments`. */
export const countObligations = (lines: TariffInstallment[]): number =>
  lines.filter(l => l.kind !== 'matricula' && l.number !== 0).length;

/**
 * Convierte el desglose del tarifario en las obligaciones de un Plan.
 * Compatible con `Plan.installments` actual; las líneas variables conservan `variable: true`
 * (la parte 1 arranca con el total objetivo como tope y la parte 2 en 0 hasta registrar el primer cobro).
 */
export function buildPlanInstallments(tariff: Tariff, startDateISO: string, variableDatesISO?: string[]) {
  const total = tariffTotal(tariff);
  const firstVariableSeen = { value: false };
  let variableIndex = 0;
  return [...tariff.installments]
    .sort((a, b) => a.number - b.number)
    .map((line, idx) => {
      // Cronogramas de fechas manuales: la fecha acordada en matrícula reemplaza al desfase por defecto.
      const agreed = line.variable ? variableDatesISO?.[variableIndex++] : undefined;
      const iso = agreed || addDays(startDateISO, line.dueDays);
      let amount = line.amount;
      if (line.variable) {
        amount = firstVariableSeen.value ? 0 : total;
        firstVariableSeen.value = true;
      }
      return {
        id: `C${idx + 1}`,
        name: line.concept,
        amount,
        balance: amount,
        dueDate: formatDisplayDate(iso),
        dueDateISO: iso,
        status: 'Pendiente',
        variable: !!line.variable,
        payments: [] as { id: string; date: string; amount: number; receipt: string }[],
      };
    });
}

/**
 * Total de las partes de un pago expresado en la moneda de la obligación.
 * Una parte en PEN con obligación en USD se convierte con su TC (PEN / TC = USD).
 * Devuelve `null` si alguna parte en PEN no trae TC válido.
 */
export function sumPaymentParts(parts: PaymentPart[], targetCurrency: 'PEN' | 'USD'): number | null {
  let total = 0;
  for (const part of parts) {
    if (part.currency === targetCurrency) {
      total += part.amount;
    } else if (part.currency === 'PEN' && targetCurrency === 'USD') {
      if (!part.exchangeRate || part.exchangeRate <= 0) return null;
      total += part.amount / part.exchangeRate;
    } else if (part.currency === 'USD' && targetCurrency === 'PEN') {
      if (!part.exchangeRate || part.exchangeRate <= 0) return null;
      total += part.amount * part.exchangeRate;
    }
  }
  return roundMoney(total);
}
