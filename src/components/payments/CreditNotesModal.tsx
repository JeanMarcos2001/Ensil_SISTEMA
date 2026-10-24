import React from 'react';
import { Printer } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { useData } from '../../context/DataContext';
import { creditNoteHtml } from '../../utils/creditNotes';
import { csvFileName, downloadCsv } from '../../utils/exportCsv';
import { printHtml } from '../../utils/printTable';
import { todayLocalISO } from '../../utils/schedule';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

/** Registro de notas de crédito (las emitidas por el sistema y las registradas de otro sistema), con su constancia imprimible. */
export function CreditNotesModal({ isOpen, onClose }: Props) {
  const { creditNotes } = useData();
  const exportCsv = () => downloadCsv(
    csvFileName('Notas de credito', todayLocalISO()),
    ['Nota', 'Origen', 'Comprobante que anula', 'Alumno', 'Pago', 'Importe', 'Moneda', 'Motivo', 'Emitida', 'Por'],
    creditNotes.map(n => [n.label, n.origin, `${n.originalType} ${n.originalDocument}`, n.studentName, n.paymentId, n.amount, n.currency, `${n.reason} — ${n.detail}`, n.issuedAt.slice(0, 10), n.issuedBy])
  );
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Notas de crédito"
      size="4xl"
      footer={
        <div className="flex justify-between w-full">
          <Button variant="secondary" onClick={exportCsv} disabled={creditNotes.length === 0}>Exportar</Button>
          <Button variant="ghost" onClick={onClose}>Cerrar</Button>
        </div>
      }
    >
      <div className="space-y-3 pb-2">
        <p className="text-sm text-text-secondary">Se generan al reversar un pago con comprobante. El sistema lleva el correlativo (BC01 para boletas, FC01 para facturas); no las envía a SUNAT.</p>
        <div className="border border-border-soft rounded-xl overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-text-secondary uppercase bg-surface-muted/50">
              <tr><th className="px-4 py-2 font-medium">Nota</th><th className="px-4 py-2 font-medium">Anula</th><th className="px-4 py-2 font-medium">Alumno</th><th className="px-4 py-2 font-medium text-right">Importe</th><th className="px-4 py-2 font-medium">Emitida</th><th /></tr>
            </thead>
            <tbody className="divide-y divide-border-soft">
              {creditNotes.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-text-muted">Todavía no hay notas de crédito.</td></tr>}
              {creditNotes.map(n => (
                <tr key={n.id}>
                  <td className="px-4 py-2 font-medium text-text-primary">{n.label}<div><Badge variant={n.origin === 'sistema' ? 'success' : 'neutral'}>{n.origin === 'sistema' ? 'Emitida' : 'Registrada'}</Badge></div></td>
                  <td className="px-4 py-2">{n.originalType} {n.originalDocument}<div className="text-xs text-text-muted">{n.paymentId}</div></td>
                  <td className="px-4 py-2">{n.studentName}</td>
                  <td className="px-4 py-2 text-right font-medium">{n.currency === 'PEN' ? 'S/' : '$'} {n.amount.toFixed(2)}</td>
                  <td className="px-4 py-2 text-text-secondary">{n.issuedAt.slice(0, 10)}<div className="text-xs text-text-muted">{n.issuedBy}</div></td>
                  <td className="px-4 py-2 text-right"><Button variant="secondary" size="sm" className="gap-1" onClick={() => printHtml(creditNoteHtml(n))}><Printer size={14} /> Imprimir</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}
