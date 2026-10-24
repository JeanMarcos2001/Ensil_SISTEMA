/**
 * Notas de crédito (funciones puras).
 *
 * Un comprobante ya entregado (boleta o factura) no se borra ni se «reutiliza»: se anula con una NOTA DE CRÉDITO que lo
 * referencia. Al reversar un pago con comprobante hay tres caminos:
 *  - «emitir»: el sistema genera la nota con el siguiente correlativo de su serie (BC01 para boletas, FC01 para facturas);
 *  - «externa»: la nota ya se emitió en otro sistema de facturación (SUNAT/OSE); se registra su número para llevar el control;
 *  - «no-entregado»: el comprobante nunca llegó al cliente; se deja constancia y no se emite nota.
 * Un pago sin comprobante no genera nota. La nota sale por el monto total del pago.
 *
 * Importante: el sistema NO envía la nota a SUNAT; es el registro y el control del correlativo. La emisión electrónica
 * necesita un proveedor (OSE/PSE) — ver el informe de facturación.
 */
import type { CreditNote, Payment } from '../context/DataContext';
import { documentLabel, parseReceipt, type DocType, type PaymentDocument } from './payments';
import { MIN_DETAIL } from './enrollmentDrop';
import { escapeHtml } from './printTable';

export type NoteMode = 'emitir' | 'externa' | 'no-entregado' | 'ninguna';

export const NOTE_SERIES: Record<DocType, string> = { Boleta: 'BC01', Factura: 'FC01' };
export const NOTE_PREFIX: Record<DocType, string> = { Boleta: 'B', Factura: 'F' };
export const NOTE_NUMBER_DIGITS = 6;

/** Comprobante del pago (el estructurado o el que se pueda leer del texto antiguo). */
export const documentOf = (p: Pick<Payment, 'document' | 'receipt'>): PaymentDocument | undefined => p.document ?? parseReceipt(p.receipt);

export const noteLabel = (series: string, n: number) => `${series}-${String(n).padStart(NOTE_NUMBER_DIGITS, '0')}`;

/** Siguiente número de nota de una serie (las externas también cuentan si usan la misma serie). */
export function nextNoteNumber(notes: Pick<CreditNote, 'series' | 'sequence'>[], series: string): number {
  return notes.filter(n => n.series === series).reduce((a, n) => Math.max(a, n.sequence), 0) + 1;
}

/** Descompone «BC01-000012» → serie y correlativo; null si el formato no corresponde al tipo de comprobante. */
export function parseNoteNumber(text: string, type: DocType): { series: string; sequence: number } | null {
  const m = /^([BF][A-Z0-9]{3})-(\d{1,8})$/.exec(text.trim().toUpperCase());
  if (!m || !m[1].startsWith(NOTE_PREFIX[type])) return null;
  return { series: m[1], sequence: parseInt(m[2], 10) };
}

/** Modos permitidos según tenga o no comprobante el pago. */
export const allowedNoteModes = (payment: Pick<Payment, 'document' | 'receipt'>): NoteMode[] =>
  documentOf(payment) ? ['emitir', 'externa', 'no-entregado'] : ['ninguna'];

export function validateNoteChoice(
  payment: Pick<Payment, 'document' | 'receipt'>,
  mode: NoteMode,
  external: string,
  detail: string,
  notes: Pick<CreditNote, 'series' | 'sequence'>[]
): string[] {
  const doc = documentOf(payment);
  if (!doc) return mode === 'ninguna' ? [] : ['El pago no tiene comprobante: no corresponde nota de crédito.'];
  if (mode === 'ninguna') return ['El pago tiene comprobante: emita la nota de crédito, registre la que ya emitió o indique que no se entregó.'];
  if (mode === 'emitir') return [];
  if (mode === 'no-entregado') return detail.trim().length >= MIN_DETAIL ? [] : ['Explique por qué el comprobante no se entregó al cliente.'];
  const parsed = parseNoteNumber(external, doc.type);
  if (!parsed) return [`El número de la nota debe ser de la forma ${NOTE_SERIES[doc.type]}-000001 (la serie de una nota de ${doc.type.toLowerCase()} empieza con «${NOTE_PREFIX[doc.type]}»).`];
  if (notes.some(n => n.series === parsed.series && n.sequence === parsed.sequence)) return [`La nota ${noteLabel(parsed.series, parsed.sequence)} ya está registrada.`];
  return [];
}

export interface NoteDraft {
  payment: Pick<Payment, 'id' | 'student' | 'amount' | 'currency' | 'document' | 'receipt' | 'enrollmentIds'>;
  mode: 'emitir' | 'externa';
  external: string;
  reason: string;
  detail: string;
  by: string;
  at: string;
}

/** Arma la nota (sin id). Debe haberse validado antes con `validateNoteChoice`. */
export function buildCreditNote(d: NoteDraft, notes: Pick<CreditNote, 'series' | 'sequence'>[]): Omit<CreditNote, 'id'> {
  const doc = documentOf(d.payment)!;
  const parsed = d.mode === 'externa' ? parseNoteNumber(d.external, doc.type)! : { series: NOTE_SERIES[doc.type], sequence: nextNoteNumber(notes, NOTE_SERIES[doc.type]) };
  return {
    series: parsed.series,
    sequence: parsed.sequence,
    label: noteLabel(parsed.series, parsed.sequence),
    origin: d.mode === 'emitir' ? 'sistema' : 'externa',
    paymentId: d.payment.id,
    studentName: d.payment.student,
    enrollmentIds: d.payment.enrollmentIds ?? [],
    originalType: doc.type,
    originalDocument: documentLabel(doc),
    amount: d.payment.amount,
    currency: d.payment.currency ?? 'USD',
    reason: d.reason,
    detail: d.detail.trim(),
    issuedAt: d.at,
    issuedBy: d.by,
  };
}

/** Documento imprimible de una nota de crédito (constancia interna; la emisión electrónica a SUNAT depende de un proveedor autorizado). */
export function creditNoteHtml(n: CreditNote): string {
  const sym = n.currency === 'PEN' ? 'S/' : 'USD';
  const rows: [string, string][] = [
    ['Comprobante que modifica', `${n.originalType} ${n.originalDocument}`], ['Cliente / alumno', n.studentName], ['Pago', n.paymentId],
    ['Motivo', `${n.reason}${n.detail ? ` — ${n.detail}` : ''}`], ['Importe', `${sym} ${n.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`],
    ['Emitida', `${n.issuedAt.slice(0, 10)} por ${n.issuedBy}`], ['Origen', n.origin === 'sistema' ? 'Emitida por el sistema' : 'Registrada (emitida en otro sistema de facturación)'],
  ];
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Nota de crédito ${escapeHtml(n.label)}</title><style>
    body{font-family:Arial,Helvetica,sans-serif;margin:28px;color:#1c1c1e;font-size:13px} h1{font-size:18px;margin:0 0 4px;text-transform:uppercase} .n{font-size:20px;font-weight:bold;margin-bottom:16px}
    table{border-collapse:collapse;width:100%} th{text-align:left;width:32%;color:#555;font-weight:normal;padding:5px 6px;border-bottom:1px solid #e5e5e8} td{padding:5px 6px;border-bottom:1px solid #e5e5e8}
    .note{margin-top:20px;font-size:11px;color:#777}
  </style></head><body><h1>Nota de crédito</h1><div class="n">${escapeHtml(n.label)}</div><table>${rows.map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`).join('')}</table>
  <p class="note">Documento de control interno. Para su validez tributaria debe emitirse electrónicamente a través de un proveedor autorizado por SUNAT.</p></body></html>`;
}
