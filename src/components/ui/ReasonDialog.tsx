import React, { useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from './Button';
import { DateInput } from './DateInput';
import { Modal } from './Modal';

export interface ReasonValues {
  reason: string;
  detail: string;
  date: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  size?: 'md' | 'lg' | 'xl' | '2xl';
  /** Contexto y efectos de la acción (se muestra arriba de los campos). */
  children?: React.ReactNode;
  /** Motivos para elegir (si no se pasan, solo hay explicación). */
  reasons?: string[];
  reasonLabel?: string;
  detailLabel?: string;
  detailPlaceholder?: string;
  /** La explicación no es obligatoria (se valida en `onSubmit` si hace falta). */
  detailOptional?: boolean;
  /** Fecha a pedir (opcional) y su rango. */
  dateLabel?: string;
  dateMin?: string;
  dateMax?: string;
  dateDefault?: string;
  confirmLabel: string;
  danger?: boolean;
  /** Si hay un impedimento, se muestra y el botón queda deshabilitado. */
  blocked?: React.ReactNode;
  /** Devuelve el mensaje de error, o nada si se aplicó. El diálogo se cierra solo si se aplicó. */
  onSubmit: (values: ReasonValues) => string | null | undefined | void;
}

/**
 * Diálogo estándar de una acción con control: motivo, explicación (queda en el historial) y, si hace falta, una fecha.
 * Se usa para cerrar asignaciones, dar de baja personal, reversar movimientos de caja, etc.
 */
export function ReasonDialog({
  isOpen, onClose, title, size = 'lg', children, reasons, reasonLabel = 'Motivo', detailLabel = 'Explicación', detailPlaceholder = 'Qué ocurrió y por qué se hace...', detailOptional = false,
  dateLabel, dateMin, dateMax, dateDefault = '', confirmLabel, danger, blocked, onSubmit,
}: Props) {
  const [reason, setReason] = useState('');
  const [detail, setDetail] = useState('');
  const [date, setDate] = useState(dateDefault);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setReason(''); setDetail(''); setDate(dateDefault); setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const submit = () => {
    const r = onSubmit({ reason, detail, date });
    if (typeof r === 'string' && r) { setError(r); return; }
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size={size}
      footer={
        <div className="flex justify-end gap-3 w-full">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={submit} disabled={!!blocked}>{confirmLabel}</Button>
        </div>
      }
    >
      <div className="space-y-4 pb-2">
        {blocked && (
          <div className="bg-warning-tint border border-warning-text/20 rounded-xl p-3 flex gap-2 text-sm text-warning-text">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <div>{blocked}</div>
          </div>
        )}
        {error && (
          <div className="bg-danger-tint border border-danger-text/20 rounded-xl p-3 flex gap-2 text-sm text-danger-text">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <p>{error}</p>
          </div>
        )}
        {children}
        {dateLabel && (
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-secondary">{dateLabel} <span className="text-error">*</span></label>
            <DateInput min={dateMin} max={dateMax} value={date} onChange={e => { setDate(e.target.value); setError(null); }} />
          </div>
        )}
        {reasons && (
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-secondary">{reasonLabel} <span className="text-error">*</span></label>
            <select
              className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none"
              value={reason}
              onChange={e => { setReason(e.target.value); setError(null); }}
            >
              <option value="">Seleccionar...</option>
              {reasons.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        )}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-text-secondary">{detailLabel} {detailOptional ? <span className="text-xs text-text-muted font-normal">(opcional)</span> : <span className="text-error">*</span>}</label>
          <textarea
            className="w-full h-24 bg-surface border border-border-soft rounded-xl p-3 text-sm focus:outline-none focus:border-primary-accent resize-none"
            value={detail}
            onChange={e => { setDetail(e.target.value); setError(null); }}
            placeholder={detailPlaceholder}
          />
        </div>
      </div>
    </Modal>
  );
}
