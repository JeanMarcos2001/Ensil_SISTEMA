/**
 * Verificación de las reglas de pago compartidas (matrícula, Pagos y Planes): medios, banco / operación / evidencia,
 * comprobante (boleta / factura), repeticiones, importes en USD y armado del registro.
 * Ejecutar: npx tsx scripts/check-payments.ts
 */
import type { Payment, PaymentPart } from '../src/context/DataContext';
import {
  PAYMENT_METHODS,
  buildPaymentRecord,
  documentLabel,
  findDuplicateDocument,
  findDuplicateOperation,
  needsBank,
  needsEvidence,
  needsOperation,
  parseReceipt,
  partsUSD,
  validateDocument,
  validatePart,
  validatePaymentInput,
  type PaymentDocument,
} from '../src/utils/payments';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : ` -> ${detail}`}`);
  if (!ok) failed++;
};

const part = (over: Partial<PaymentPart> = {}): PaymentPart => ({ id: 'p', currency: 'USD', amount: 100, method: 'Efectivo', ...over });
const doc = (over: Partial<PaymentDocument> = {}): PaymentDocument => ({ type: 'Boleta', serie: 'B001', number: '000123', ...over });
const pay = (over: Partial<Payment> = {}): Payment => ({
  id: 'PAG-001', date: '10 Oct 2026', student: 'A', concept: 'Contado', amount: 100, method: 'Efectivo', receipt: 'B001-000123', status: 'Aprobado', ...over,
});

// ---------------------------------------------------------------- Medios
check('Medios únicos para todo el sistema', PAYMENT_METHODS.join() === 'Efectivo,Transferencia,Yape,Plin,Depósito,Tarjeta');
check('Banco: transferencia y depósito', needsBank('Transferencia') && needsBank('Depósito') && !needsBank('Yape') && !needsBank('Efectivo'));
check('Operación: transferencia, Yape, Plin y depósito', ['Transferencia', 'Yape', 'Plin', 'Depósito'].every(needsOperation) && !needsOperation('Efectivo') && !needsOperation('Tarjeta'));
check('Evidencia: todo menos efectivo', needsEvidence('Yape') && needsEvidence('Tarjeta') && !needsEvidence('Efectivo'));

// ---------------------------------------------------------------- Parte de pago (lo que recibe la empresa)
check('Efectivo con monto → válida (sin evidencia)', validatePart(part(), 'P').length === 0);
check('Monto 0 → rechazada', validatePart(part({ amount: 0 }), 'P').some(m => /monto/.test(m)));
check('Soles sin TC → rechazada', validatePart(part({ currency: 'PEN' }), 'P').some(m => /tipo de cambio/.test(m)));
check('Soles con TC → válida', validatePart(part({ currency: 'PEN', exchangeRate: 3.8 }), 'P').length === 0);
check('Transferencia sin banco, operación ni evidencia → 3 errores', validatePart(part({ method: 'Transferencia' }), 'P').length === 3);
check('Transferencia completa → válida', validatePart(part({ method: 'Transferencia', bank: 'BCP', operationNumber: '77', evidence: 'v.png' }), 'P').length === 0);
check('Yape sin evidencia → rechazada (la captura es obligatoria)', validatePart(part({ method: 'Yape', operationNumber: '5' }), 'P').some(m => /evidencia/.test(m)));
check('Yape no pide banco', !validatePart(part({ method: 'Yape', operationNumber: '5', evidence: 'c.png' }), 'P').some(m => /banco/.test(m)));
check('Tarjeta sin operación pero con evidencia → válida', validatePart(part({ method: 'Tarjeta', evidence: 'v.png' }), 'P').length === 0);

// ---------------------------------------------------------------- Comprobante (lo que entrega la empresa)
check('Boleta B001-000123 → válida', validateDocument(doc(), 'C').length === 0);
check('Factura F001-45 → válida', validateDocument(doc({ type: 'Factura', serie: 'f001', number: '45' }), 'C').length === 0);
check('Sin comprobante → rechazado', validateDocument(undefined, 'C').length === 1);
check('Sin serie o sin número → rechazado', /serie y el número/.test(validateDocument(doc({ serie: '' }), 'C')[0] ?? '') && /serie y el número/.test(validateDocument(doc({ number: ' ' }), 'C')[0] ?? ''));
check('Boleta con serie F → rechazada', /debe comenzar con «B»/.test(validateDocument(doc({ serie: 'F001' }), 'C')[0] ?? ''));
check('Factura con serie B → rechazada', /debe comenzar con «F»/.test(validateDocument(doc({ type: 'Factura', serie: 'B001' }), 'C')[0] ?? ''));
check('Serie de 3 caracteres → rechazada', /4 caracteres/.test(validateDocument(doc({ serie: 'B01' }), 'C')[0] ?? ''));
check('Número con letras → rechazado', /solo dígitos/.test(validateDocument(doc({ number: '12A' }), 'C')[0] ?? ''));
check('Etiqueta normalizada', documentLabel(doc({ serie: ' b001 ', number: ' 45 ' })) === 'B001-45');
check('Texto antiguo → comprobante', JSON.stringify(parseReceipt('B001-000123')) === JSON.stringify(doc()) && parseReceipt('F001-9')?.type === 'Factura');
check('«S/N» u operaciones no son comprobante', parseReceipt('S/N') === undefined && parseReceipt('123, 999') === undefined && parseReceipt(undefined) === undefined);

// ---------------------------------------------------------------- Repeticiones
const existing = [
  pay({ id: 'PAG-001', receipt: 'B001-000123' }),
  pay({ id: 'PAG-002', receipt: 'B001-000200', document: doc({ number: '000200' }), parts: [part({ method: 'Transferencia', bank: 'BCP', operationNumber: 'ABC-1' })] }),
  pay({ id: 'PAG-003', receipt: 'B001-000300', status: 'Anulado', parts: [part({ method: 'Yape', operationNumber: 'Y9' })] }),
];
check('Comprobante repetido (texto antiguo) → detectado', findDuplicateDocument(existing, doc())?.id === 'PAG-001');
check('Comprobante repetido aunque cambie el relleno de ceros', findDuplicateDocument(existing, doc({ number: '123' }))?.id === 'PAG-001');
check('Comprobante repetido (estructurado)', findDuplicateDocument(existing, doc({ number: '200' }))?.id === 'PAG-002');
check('Otro número, otra serie u otro tipo → libre', !findDuplicateDocument(existing, doc({ number: '124' })) && !findDuplicateDocument(existing, doc({ serie: 'B002' })) && !findDuplicateDocument(existing, doc({ type: 'Factura', serie: 'F001' })));
check('Un pago anulado libera su comprobante', !findDuplicateDocument(existing, doc({ number: '300' })));
check('Operación repetida (mismo medio, banco y número) → detectada',
  findDuplicateOperation(existing, [part({ method: 'Transferencia', bank: 'bcp', operationNumber: 'abc-1' })])?.payment.id === 'PAG-002');
check('Otro banco u otro número → libre', !findDuplicateOperation(existing, [part({ method: 'Transferencia', bank: 'BBVA', operationNumber: 'ABC-1' })]) && !findDuplicateOperation(existing, [part({ method: 'Transferencia', bank: 'BCP', operationNumber: 'ABC-2' })]));
check('Operación de un pago anulado → libre', !findDuplicateOperation(existing, [part({ method: 'Yape', operationNumber: 'Y9' })]));
check('El efectivo no tiene operación que repetir', !findDuplicateOperation(existing, [part({ method: 'Efectivo' })]));

// ---------------------------------------------------------------- Pago completo
const good = { parts: [part({ method: 'Yape', operationNumber: 'Y1', evidence: 'c.png' }), part({ amount: 50 })], document: doc({ number: '777' }) };
check('Pago con 2 partes y comprobante → válido', validatePaymentInput(good, existing).length === 0);
check('Sin partes → rechazado', validatePaymentInput({ parts: [], document: doc() }, existing)[0]?.includes('al menos una parte'));
check('Comprobante ya usado → rechazado con el pago que lo usó', validatePaymentInput({ ...good, document: doc() }, existing).some(m => /ya fue usado en el pago PAG-001/.test(m)));
check('Operación ya registrada → rechazada', validatePaymentInput({ ...good, parts: [part({ method: 'Transferencia', bank: 'BCP', operationNumber: 'ABC-1', evidence: 'v.png' })] }, existing).some(m => /ya fue registrada en el pago PAG-002/.test(m)));
check('Misma operación en dos partes del mismo pago → rechazada',
  validatePaymentInput({ ...good, parts: [part({ method: 'Yape', operationNumber: 'Z', evidence: 'a.png' }), part({ method: 'Yape', operationNumber: 'z', evidence: 'b.png' })] }, existing).some(m => /repetida en dos partes/.test(m)));
check('Se señala la parte con error cuando hay varias', validatePaymentInput({ ...good, parts: [part(), part({ amount: 0 })] }, existing).some(m => /parte 2/.test(m)));

// ---------------------------------------------------------------- Importes
check('Equivalente en USD de cada parte (la última absorbe el redondeo)',
  JSON.stringify(partsUSD([part({ currency: 'PEN', amount: 100, exchangeRate: 3 }), part({ currency: 'PEN', amount: 100, exchangeRate: 3 }), part({ currency: 'PEN', amount: 100, exchangeRate: 3 })])) === JSON.stringify([33.33, 33.33, 33.34]));
check('Sin TC no hay equivalente', partsUSD([part({ currency: 'PEN', amount: 100 })]) === null);

// ---------------------------------------------------------------- Armado del registro
const built = buildPaymentRecord({
  id: 'PAG-010', date: '20 Oct 2026', student: 'Mateo', concept: 'Pago de Cuota 1', amountUSD: 200,
  parts: [part({ method: 'Yape', currency: 'PEN', amount: 380, exchangeRate: 3.8, operationNumber: 'Y1', evidence: 'c.png' }), part({ amount: 100 })],
  document: doc({ serie: 'b001', number: '777' }), cashConcept: 'Ingreso cuota', cashReference: 'PLN-1 / Mateo', branchId: 'FIL-PIU', enrollmentIds: ['MAT-1'], user: 'Caja', note: 'ok',
});
check('El comprobante queda estructurado y como texto', built.payment.receipt === 'B001-777' && built.payment.document?.serie === 'B001');
check('Medios distintos del pago en una sola línea', built.payment.method === 'Yape / Efectivo');
check('Un movimiento de caja por parte, cada uno en su moneda', built.cashMovements.length === 2 && built.cashMovements[0].currency === 'PEN' && built.cashMovements[0].amount === 380 && built.cashMovements[1].currency === 'USD');
check('La suma en USD de caja coincide con el pago', Math.abs(built.cashMovements.reduce((a, m) => a + m.amountUSD, 0) - 200) < 0.005);
check('La operación y la sede viajan a caja', built.cashMovements[0].operationNumber === 'Y1' && built.cashMovements.every(m => m.branchId === 'FIL-PIU' && m.paymentId === 'PAG-010'));
check('La nota queda como comentario', built.payment.comment === 'ok' && built.payment.user === 'Caja');

console.log(failed === 0 ? '\nTodo correcto.' : `\n${failed} caso(s) fallaron.`);
process.exit(failed === 0 ? 0 : 1);
