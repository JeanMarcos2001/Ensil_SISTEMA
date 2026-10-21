/**
 * Reglas de los pagos (funciones puras), compartidas por el asistente de matrícula, Pagos y Planes.
 *
 * Un pago tiene dos tipos de datos que no deben mezclarse:
 *  - Lo que RECIBE la empresa, por cada medio usado (parte): moneda, monto, TC, medio, banco, N.º de operación, evidencia.
 *  - Lo que ENTREGA la empresa, una vez por pago: el comprobante (boleta o factura, serie y número).
 */
import type { CashMovement, Payment, PaymentPart } from '../context/DataContext';
import { roundMoney, sumPaymentParts } from './tariffs';

export const PAYMENT_METHODS = ['Efectivo', 'Transferencia', 'Yape', 'Plin', 'Depósito', 'Tarjeta'];

export const METHODS_NEED_BANK = ['Transferencia', 'Depósito'];
export const METHODS_NEED_OPERATION = ['Transferencia', 'Yape', 'Plin', 'Depósito'];

export const needsBank = (method: string) => METHODS_NEED_BANK.includes(method);
export const needsOperation = (method: string) => METHODS_NEED_OPERATION.includes(method);
/** Todo pago que no es en efectivo deja un voucher o captura. */
export const needsEvidence = (method: string) => !!method && method !== 'Efectivo';

export type DocType = 'Boleta' | 'Factura';
export const DOC_TYPES: DocType[] = ['Boleta', 'Factura'];
export const DOC_PREFIX: Record<DocType, string> = { Boleta: 'B', Factura: 'F' };

/** Comprobante que la empresa entrega por un pago. */
export interface PaymentDocument {
  type: DocType;
  serie: string;
  number: string;
}

export const emptyDocument = (): PaymentDocument => ({ type: 'Boleta', serie: '', number: '' });

export const normalizeDocument = (d: PaymentDocument): PaymentDocument => ({
  type: d.type, serie: d.serie.trim().toUpperCase(), number: d.number.trim(),
});

/** «B001-000123» */
export const documentLabel = (d: PaymentDocument): string => {
  const n = normalizeDocument(d);
  return `${n.serie}-${n.number}`;
};

/** Texto de un comprobante antiguo («B001-000123») → comprobante estructurado; undefined si no lo es («S/N», operaciones…). */
export function parseReceipt(receipt: string | undefined): PaymentDocument | undefined {
  const m = /^([BF][A-Z0-9]{3})-(\d{1,8})$/i.exec((receipt ?? '').trim());
  if (!m) return undefined;
  return { type: m[1].toUpperCase().startsWith('F') ? 'Factura' : 'Boleta', serie: m[1].toUpperCase(), number: m[2] };
}

export function validateDocument(doc: PaymentDocument | undefined, label: string): string[] {
  if (!doc) return [`${label}: indique el comprobante (boleta o factura).`];
  const d = normalizeDocument(doc);
  const prefix = DOC_PREFIX[d.type];
  if (!d.serie || !d.number) return [`${label}: indique la serie y el número del comprobante.`];
  if (!d.serie.startsWith(prefix)) return [`${label}: la serie de una ${d.type.toLowerCase()} debe comenzar con «${prefix}».`];
  if (!/^[BF][A-Z0-9]{3}$/.test(d.serie)) return [`${label}: la serie debe tener 4 caracteres (p. ej. ${prefix}001).`];
  if (!/^\d{1,8}$/.test(d.number)) return [`${label}: el número del comprobante debe tener solo dígitos (hasta 8).`];
  return [];
}

/** Reglas de una parte de pago (lo que recibe la empresa). */
export function validatePart(part: PaymentPart, label: string): string[] {
  const e: string[] = [];
  if (!(part.amount > 0)) e.push(`${label}: el monto debe ser mayor a 0.`);
  if (part.currency === 'PEN' && !(part.exchangeRate && part.exchangeRate > 0)) e.push(`${label}: indique el tipo de cambio (TC).`);
  if (!part.method) e.push(`${label}: seleccione el medio de pago.`);
  if (needsBank(part.method) && !part.bank?.trim()) e.push(`${label}: indique el banco o entidad.`);
  if (needsOperation(part.method) && !part.operationNumber?.trim()) e.push(`${label}: indique el N° de operación.`);
  if (needsEvidence(part.method) && !part.evidence?.trim()) e.push(`${label}: adjunte la evidencia (voucher o captura).`);
  return e;
}

// ---------------------------------------------------------------- Importes

/** Equivalente en USD de cada parte (la última absorbe el redondeo para que la suma sea exacta). null si falta algún TC. */
export function partsUSD(parts: PaymentPart[]): number[] | null {
  const total = parts.length ? sumPaymentParts(parts, 'USD') : 0;
  if (total === null) return null;
  const each = parts.map(p => (p.currency === 'USD' ? roundMoney(p.amount) : roundMoney(p.amount / (p.exchangeRate || 1))));
  if (each.length > 0) each[each.length - 1] = roundMoney(total - each.slice(0, -1).reduce((a, b) => a + b, 0));
  return each;
}

export const totalUSD = (parts: PaymentPart[]): number | null => (parts.length ? sumPaymentParts(parts, 'USD') : 0);

// ---------------------------------------------------------------- Integridad (no repetir comprobantes ni operaciones)

const norm = (t: string | undefined) => (t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
const isVoid = (p: Payment) => /anulad|revers/i.test(p.status);

/** Pago existente que ya usó ese comprobante (mismo tipo, serie y número). Ignora pagos anulados. */
export function findDuplicateDocument(payments: Payment[], doc: PaymentDocument): Payment | undefined {
  const d = normalizeDocument(doc);
  return payments.find(p => {
    if (isVoid(p)) return false;
    const other = p.document ? normalizeDocument(p.document) : parseReceipt(p.receipt);
    return !!other && other.type === d.type && other.serie === d.serie && Number(other.number) === Number(d.number);
  });
}

/** Parte que repite una operación ya registrada (mismo medio, banco y N.º de operación). Ignora pagos anulados y efectivo. */
export function findDuplicateOperation(payments: Payment[], parts: PaymentPart[]): { part: PaymentPart; payment: Payment } | undefined {
  for (const part of parts) {
    if (!needsOperation(part.method) || !part.operationNumber?.trim()) continue;
    for (const payment of payments) {
      if (isVoid(payment)) continue;
      const hit = (payment.parts ?? []).some(
        o => o.method === part.method && norm(o.bank) === norm(part.bank) && norm(o.operationNumber) === norm(part.operationNumber)
      );
      if (hit) return { part, payment };
    }
  }
  return undefined;
}

/** Valida un pago completo: partes, comprobante y repeticiones frente a los pagos existentes. */
export function validatePaymentInput(
  input: { parts: PaymentPart[]; document: PaymentDocument | undefined },
  existing: Payment[],
  label = 'Pago'
): string[] {
  const e: string[] = [];
  if (input.parts.length === 0) return [`${label}: registre al menos una parte de pago.`];
  input.parts.forEach((p, i) => e.push(...validatePart(p, input.parts.length > 1 ? `${label} · parte ${i + 1}` : label)));
  const docErrors = validateDocument(input.document, label);
  e.push(...docErrors);
  if (docErrors.length === 0) {
    const dup = findDuplicateDocument(existing, input.document!);
    if (dup) e.push(`${label}: el comprobante ${documentLabel(input.document!)} ya fue usado en el pago ${dup.id}.`);
  }
  const dupOp = findDuplicateOperation(existing, input.parts);
  if (dupOp) e.push(`${label}: la operación ${dupOp.part.operationNumber} (${dupOp.part.method}) ya fue registrada en el pago ${dupOp.payment.id}.`);
  // Dos partes iguales dentro del mismo pago
  const seen = new Set<string>();
  for (const p of input.parts) {
    if (!needsOperation(p.method) || !p.operationNumber?.trim()) continue;
    const k = `${p.method}|${norm(p.bank)}|${norm(p.operationNumber)}`;
    if (seen.has(k)) e.push(`${label}: la operación ${p.operationNumber} está repetida en dos partes.`);
    seen.add(k);
  }
  return e;
}

// ---------------------------------------------------------------- Armado del registro

export interface PaymentRecordInput {
  id: string;
  /** Fecha para mostrar («24 Mar 2024» o la que use el sistema). */
  date: string;
  student: string;
  concept: string;
  /** Monto cubierto, en USD. */
  amountUSD: number;
  parts: PaymentPart[];
  document: PaymentDocument;
  /** Concepto del movimiento de caja (uno por parte). */
  cashConcept: string;
  cashReference: string;
  branchId?: string;
  enrollmentIds?: string[];
  promotionGroupId?: string;
  note?: string;
  user?: string;
  /** Fecha-hora ISO de los movimientos de caja. */
  cashDate?: string;
}

/**
 * Arma el pago y un movimiento de caja por parte (dinero real, en su moneda), igual para la matrícula y para las cuotas.
 * El comprobante se guarda estructurado (`document`) y como texto en `receipt`.
 */
export function buildPaymentRecord(input: PaymentRecordInput): { payment: Payment; cashMovements: Omit<CashMovement, 'id' | 'user'>[] } {
  const usd = partsUSD(input.parts) ?? input.parts.map(() => 0);
  const document = normalizeDocument(input.document);
  const payment: Payment = {
    id: input.id,
    date: input.date,
    student: input.student,
    concept: input.concept,
    amount: input.amountUSD,
    method: Array.from(new Set(input.parts.map(p => p.method))).join(' / '),
    receipt: documentLabel(document),
    document,
    status: 'Aprobado',
    parts: input.parts,
    currency: 'USD',
    promotionGroupId: input.promotionGroupId,
    enrollmentIds: input.enrollmentIds,
    user: input.user,
    comment: input.note || undefined,
  };
  const cashMovements = input.parts.map((p, i) => ({
    date: input.cashDate ?? new Date().toISOString(),
    kind: 'Ingreso' as const,
    concept: input.cashConcept,
    reference: input.cashReference,
    currency: p.currency,
    amount: p.amount,
    exchangeRate: p.currency === 'PEN' ? p.exchangeRate : undefined,
    amountUSD: usd[i],
    method: p.method,
    bank: p.bank,
    operationNumber: p.operationNumber,
    branchId: input.branchId,
    paymentId: input.id,
    enrollmentIds: input.enrollmentIds,
    status: 'Aplicado' as const,
  }));
  return { payment, cashMovements };
}
