import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Image as ImageIcon } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { useData } from '../../context/DataContext';
import { ORIGIN_LABEL, movementEnrollmentIds, movementOrigin } from '../../utils/cash';

interface Props {
  /** Movimiento a mostrar; `null` cierra la ventana. */
  movementId: string | null;
  /** `receipt` pone primero el comprobante y la evidencia. */
  focus?: 'detail' | 'receipt';
  onClose: () => void;
}

const sym = (c: 'PEN' | 'USD') => (c === 'PEN' ? 'S/' : '$');
const money = (n: number) => n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const when = (iso: string) => new Date(iso).toLocaleString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="block text-xs text-text-muted uppercase tracking-wider">{label}</span>
      <span className="text-sm font-medium text-text-primary">{children || '—'}</span>
    </div>
  );
}

/** Detalle de un movimiento de caja: datos, de dónde nace, comprobante y evidencias, y la constancia si fue reversado. */
export function CashMovementModal({ movementId, focus = 'detail', onClose }: Props) {
  const { cashMovements, payments, plans, branches } = useData();
  const navigate = useNavigate();
  const m = cashMovements.find(x => x.id === movementId);
  if (!m) return null;
  const payment = m.paymentId ? payments.find(p => p.id === m.paymentId) : undefined;
  const enrollmentIds = movementEnrollmentIds(m, plans);
  const branch = branches.find(b => b.id === m.branchId)?.name;
  const origin = movementOrigin(m);
  const evidences = (payment?.parts ?? []).filter(pt => pt.evidence);
  const go = (path: string) => { onClose(); navigate(path); };

  const receipt = (
    <section className="space-y-3" key="receipt">
      <h4 className="text-sm font-bold text-text-primary uppercase tracking-wider">Comprobante y evidencias</h4>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Row label="Comprobante / referencia">{payment?.receipt && payment.receipt !== 'S/N' ? payment.receipt : m.reference}</Row>
        <Row label="N.º de operación">{m.operationNumber}</Row>
        <Row label="Banco">{m.bank}</Row>
      </div>
      {evidences.length > 0 ? (
        <ul className="border border-border-soft rounded-xl divide-y divide-border-soft text-sm">
          {evidences.map(pt => (
            <li key={pt.id} className="px-4 py-2 flex items-center gap-2"><ImageIcon size={16} className="text-text-muted" /> {pt.evidence} <span className="text-text-muted">· {pt.method}</span></li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-text-muted italic">Este movimiento no tiene archivos de evidencia registrados.</p>
      )}
      <p className="text-xs text-text-muted">El sistema guarda el nombre del archivo, no el archivo: la vista previa estará disponible cuando se active el almacenamiento.</p>
    </section>
  );

  const data = (
    <section className="space-y-3" key="data">
      <h4 className="text-sm font-bold text-text-primary uppercase tracking-wider">Datos del movimiento</h4>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Row label="Código">{m.id}</Row>
        <Row label="Fecha y hora">{when(m.date)}</Row>
        <Row label="Registrado por">{m.user}</Row>
        <Row label="Concepto">{m.concept}</Row>
        <Row label="Origen">{ORIGIN_LABEL[origin]}</Row>
        <Row label="Sede">{branch}</Row>
        <Row label="Medio de pago">{m.method}</Row>
        <Row label="Caja">{m.currency === 'PEN' ? 'Soles (PEN)' : 'Dólares (USD)'}</Row>
        <Row label="Tipo de cambio">{m.exchangeRate ? m.exchangeRate.toFixed(3) : ''}</Row>
        <Row label="Equivalente en USD">{m.amountUSD > 0 ? `$ ${money(m.amountUSD)}` : ''}</Row>
        <div className="col-span-2 md:col-span-3"><Row label="Referencia">{m.reference}</Row></div>
      </div>
    </section>
  );

  const links = (
    <section className="space-y-2" key="links">
      <h4 className="text-sm font-bold text-text-primary uppercase tracking-wider">Vínculos</h4>
      <div className="flex flex-wrap gap-2">
        {m.paymentId && <Button variant="secondary" size="sm" onClick={() => go(`/operacion/pagos?pago=${m.paymentId}`)}>Ver el pago {m.paymentId}</Button>}
        {enrollmentIds.map(id => <Button key={id} variant="secondary" size="sm" onClick={() => go(`/operacion/matriculas?ficha=${id}`)}>Matrícula {id}</Button>)}
        {enrollmentIds.map(id => plans.find(p => p.mat === id)).filter(Boolean).map(pl => <Button key={pl!.id} variant="secondary" size="sm" onClick={() => go(`/operacion/planes-y-cartera?plan=${pl!.id}`)}>Plan y cuotas {pl!.id}</Button>)}
        {m.deposit && <Badge variant="info">Lote de depósito {m.deposit.code} · {m.deposit.movementIds.length} ingreso(s)</Badge>}
        {m.depositedIn && <Badge variant="info">Depositado en el lote {m.depositedIn}</Badge>}
        {!m.paymentId && enrollmentIds.length === 0 && !m.deposit && !m.depositedIn && <span className="text-sm text-text-muted italic">No está vinculado a un pago ni a una matrícula.</span>}
      </div>
    </section>
  );

  return (
    <Modal isOpen onClose={onClose} title={focus === 'receipt' ? 'Comprobante del movimiento' : 'Detalle del movimiento'} size="3xl" footer={<div className="flex justify-end w-full"><Button variant="ghost" onClick={onClose}>Cerrar</Button></div>}>
      <div className="space-y-6 pb-2">
        <div className="flex flex-wrap items-center justify-between gap-3 bg-surface-muted border border-border-soft rounded-xl p-4">
          <div className="flex items-center gap-3">
            <FileText size={20} className="text-text-muted" />
            <div>
              <p className="font-semibold text-text-primary">{m.concept}</p>
              <p className="text-xs text-text-muted">{m.id}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={m.status === 'Reversado' ? 'danger' : m.kind === 'Ingreso' ? 'success' : 'neutral'}>{m.status === 'Reversado' ? 'Reversado' : m.kind}</Badge>
            <span className={`text-xl font-semibold ${m.status === 'Reversado' ? 'line-through text-text-muted' : m.kind === 'Ingreso' ? 'text-success-text' : 'text-text-primary'}`}>
              {m.kind === 'Ingreso' ? '+' : '-'}{sym(m.currency)} {money(m.amount)}
            </span>
          </div>
        </div>

        {m.reversal && (
          <div className="bg-danger-tint border border-danger-text/20 rounded-xl p-3 text-sm text-danger-text">
            <p className="font-semibold">Reversado por {m.reversal.by} el {when(m.reversal.at)}</p>
            <p>{m.reversal.reason} — {m.reversal.detail}</p>
          </div>
        )}

        {focus === 'receipt' ? [receipt, data, links] : [data, receipt, links]}
      </div>
    </Modal>
  );
}
