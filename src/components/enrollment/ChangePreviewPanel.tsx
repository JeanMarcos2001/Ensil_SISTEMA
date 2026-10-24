import React from 'react';
import { AlertTriangle } from 'lucide-react';
import type { Enrollment } from '../../context/DataContext';
import {
  previewProgramChange, previewReactivation, previewTransfer, type ChangeContext,
} from '../../utils/enrollmentChange';
import type { ChangeKindName } from '../../context/DataContext';

const usd = (n: number) => `USD ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dmy = (iso: string) => (iso ? iso.split('-').reverse().join('/') : '—');

function Row({ label, children, tone }: { label: string; children: React.ReactNode; tone?: 'warn' }) {
  return (
    <div className={`px-4 py-2.5 ${tone === 'warn' ? 'bg-warning-tint/40' : ''}`}>
      <span className="font-medium text-text-primary">{label}: </span>
      <span className="text-text-secondary">{children}</span>
    </div>
  );
}

interface Props {
  kind: ChangeKindName;
  enrollment: Enrollment;
  payload: Record<string, string>;
  ctx: ChangeContext;
}

/** Qué pasaría (o qué pasará) con cada cambio: precio, plan, agenda, materiales y alumno. */
export function ChangePreviewPanel({ kind, enrollment, payload, ctx }: Props) {
  if (kind === 'Reactivación') {
    const pv = previewReactivation(enrollment, ctx, payload.startDate || ctx.today);
    return (
      <div className="border border-border-soft rounded-xl divide-y divide-border-soft overflow-hidden text-sm">
        <Row label="Matrícula">pasa de «Caída» a «Activa» el {dmy(payload.startDate || ctx.today)}.</Row>
        <Row label="Plan">
          {pv.restored.length === 0
            ? 'no hay cuotas anuladas por la caída que restituir.'
            : `se restituyen ${pv.restored.length} cuota(s) por ${usd(pv.restoredUSD)} y su calendario se corre ${pv.shiftDays} día(s) (lo que duró la ausencia): ${pv.restored.map(r => `${r.name} ${dmy(r.oldDue)} → ${dmy(r.newDue)}`).join('; ')}.`}
        </Row>
        {pv.keptDebt.length > 0 && <Row label="Deuda vencida" tone="warn">sigue pendiente {usd(pv.keptDebtUSD)} que se conservó al caer.</Row>}
        <Row label="Lo ya cobrado">{usd(pv.paidUSD)} se conserva.</Row>
        {pv.studentReactivates && <Row label="Alumno">vuelve a estar «Activo».</Row>}
        {pv.notes.map(n => <Row key={n} label="Ojo">{n}</Row>)}
      </div>
    );
  }
  if (kind === 'Cambio de programa') {
    const pv = previewProgramChange(enrollment, { programId: payload.programId, levelId: payload.levelId }, ctx);
    if (!pv) return <p className="text-sm text-text-muted">Elija el programa y el nivel para ver el efecto.</p>;
    return (
      <div className="border border-border-soft rounded-xl divide-y divide-border-soft overflow-hidden text-sm">
        <Row label="Cambio">{pv.fromLabel} → <strong className="text-text-primary">{pv.toLabel}</strong></Row>
        <Row label="Precio">{usd(pv.oldTotal)} → {usd(pv.newTotal)} (tarifario «{pv.tariff.name}», mismo tipo de pago).</Row>
        <Row label="Cobrado">{usd(pv.paidUSD)} se abona al precio nuevo. {pv.remaining >= 0 ? `Saldo por cobrar: ${usd(pv.remaining)}.` : ''}</Row>
        {pv.remaining < 0 && <Row label="No aplicable" tone="warn">se cobró {usd(-pv.remaining)} más que el precio nuevo: primero hay que devolver esa diferencia.</Row>}
        {pv.remaining >= 0 && (
          <Row label="Plan">{pv.installments.filter(i => i.balance > 0 && i.status !== 'Anulada' && i.status !== 'Refinanciada').map(i => `${i.name} ${usd(i.balance)} (${i.dueDate})`).join('; ') || 'sin cuotas por cobrar.'}</Row>
        )}
        {pv.notes.map(n => <Row key={n} label="Ojo">{n}</Row>)}
      </div>
    );
  }
  const pv = previewTransfer(enrollment, { branchId: payload.branchId, schedule: payload.schedule }, ctx);
  if (!pv) return <p className="text-sm text-text-muted">Elija la sede destino para ver el efecto.</p>;
  return (
    <div className="border border-border-soft rounded-xl divide-y divide-border-soft overflow-hidden text-sm">
      <Row label="Sede">{pv.fromName} → <strong className="text-text-primary">{pv.toName}</strong></Row>
      <Row label="Horario de clases">{pv.scheduleChanged ? `cambia a ${pv.schedule || '—'}` : `se mantiene (${pv.schedule || '—'})`}.</Row>
      <Row label="Agenda" tone={pv.scheduleIds.length + pv.activityRemovals.length > 0 ? 'warn' : undefined}>
        {pv.scheduleIds.length} asesoría(s) futura(s) y {pv.activityRemovals.length} inscripción(es) en actividades de {pv.fromName} se cancelan.
      </Row>
      {pv.notes.map(n => <Row key={n} label="Ojo">{n}</Row>)}
    </div>
  );
}

export function Blocked({ problems }: { problems: string[] }) {
  if (problems.length === 0) return null;
  return (
    <div className="bg-warning-tint border border-warning-text/20 rounded-xl p-3 flex gap-2 text-sm text-warning-text">
      <AlertTriangle size={16} className="shrink-0 mt-0.5" />
      <ul className="space-y-1">{problems.map(p => <li key={p}>{p}</li>)}</ul>
    </div>
  );
}
