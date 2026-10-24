import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { useData } from '../../context/DataContext';
import { buildStatement } from '../../utils/guardianStatement';
import { csvFileName, downloadCsv } from '../../utils/exportCsv';
import { todayLocalISO } from '../../utils/schedule';
import { formatDisplayDate } from '../../utils/tariffs';

interface Props {
  /** Titular del que se muestra el estado de cuenta; `null` cierra la ventana. */
  guardianId: string | null;
  onClose: () => void;
}

const usd = (n: number) => `USD ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const planBadge = (status: string): 'success' | 'danger' | 'warning' | 'neutral' =>
  status === 'Completado' || status === 'Al día' ? 'success' : status === 'Atrasado' ? 'danger' : status === 'Caída' ? 'neutral' : 'warning';

/** Estado de cuenta del titular: lo que debe y lo que pagó, por matrícula, con las cuotas pendientes y los pagos. */
export function GuardianStatementModal({ guardianId, onClose }: Props) {
  const data = useData();
  const navigate = useNavigate();
  const today = todayLocalISO();
  const statement = useMemo(
    () => (guardianId
      ? buildStatement({ guardians: data.guardians, students: data.students, enrollments: data.enrollments, plans: data.plans, payments: data.payments, groups: data.promotionGroups }, guardianId, today)
      : undefined),
    [guardianId, data.guardians, data.students, data.enrollments, data.plans, data.payments, data.promotionGroups, today]
  );
  if (!guardianId || !statement) return null;
  const { guardian, totals } = statement;
  const pending = statement.enrollments.flatMap(r => r.pending.map(i => ({ ...i, enrollmentId: r.enrollment.id, student: r.studentName })))
    .sort((a, b) => (a.dueISO || '9999').localeCompare(b.dueISO || '9999'));

  const handleExport = () => {
    downloadCsv(
      csvFileName(`Estado de cuenta ${guardian.name}`, today),
      ['Matrícula', 'Alumno', 'Programa', 'Estado de la matrícula', 'Total (USD)', 'Cobrado (USD)', 'Saldo (USD)', 'Vencido (USD)', 'Anulado por caída (USD)'],
      statement.enrollments.map(r => [r.enrollment.id, r.studentName, `${r.enrollment.program} ${r.enrollment.level}`.trim(), r.enrollment.status, r.totalUSD, r.paidUSD, r.balanceUSD, r.overdueUSD, r.annulledUSD])
    );
  };

  const go = (path: string) => { onClose(); navigate(path); };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Estado de cuenta"
      size="5xl"
      footer={
        <div className="flex justify-between gap-3 w-full">
          <Button variant="secondary" className="flex items-center gap-2" onClick={handleExport} disabled={statement.enrollments.length === 0}>
            <Download size={16} /> Exportar
          </Button>
          <Button variant="ghost" onClick={onClose}>Cerrar</Button>
        </div>
      }
    >
      <div className="space-y-6 pb-2">
        <div className="bg-surface-muted border border-border-soft rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-lg font-semibold text-text-primary">{guardian.name}</p>
            <p className="text-sm text-text-secondary">{guardian.docType || 'DNI'}: {guardian.doc} · {guardian.phone}{guardian.email ? ` · ${guardian.email}` : ''}</p>
          </div>
          <p className="text-xs text-text-muted">Al {formatDisplayDate(today)} · {statement.students.length} alumno(s) · {statement.enrollments.length} matrícula(s)</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total de las matrículas', value: usd(totals.totalUSD), tone: 'text-text-primary' },
            { label: 'Cobrado', value: usd(totals.paidUSD), tone: 'text-success-text' },
            { label: 'Saldo por cobrar', value: usd(totals.balanceUSD), tone: totals.balanceUSD > 0 ? 'text-danger-text' : 'text-text-primary' },
            { label: 'Deuda vencida', value: usd(totals.overdueUSD), tone: totals.overdueUSD > 0 ? 'text-danger-text' : 'text-text-primary' },
          ].map(k => (
            <div key={k.label} className="border border-border-soft rounded-xl p-3">
              <span className="block text-xs text-text-muted">{k.label}</span>
              <span className={`text-lg font-semibold ${k.tone}`}>{k.value}</span>
            </div>
          ))}
        </div>
        {totals.annulledUSD > 0 && (
          <p className="text-xs text-text-muted -mt-3">Además, {usd(totals.annulledUSD)} fueron anulados por caídas de matrícula (no son deuda).</p>
        )}

        {statement.enrollments.length === 0 ? (
          <p className="text-sm text-text-muted italic">Este titular no tiene matrículas registradas: no hay nada que cobrar.</p>
        ) : (
          <>
            <section className="space-y-2">
              <h4 className="text-sm font-bold text-text-primary uppercase tracking-wider">Por matrícula</h4>
              <div className="border border-border-soft rounded-xl overflow-hidden">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-text-secondary uppercase bg-surface-muted/50">
                    <tr>
                      <th className="px-4 py-2 font-medium">Matrícula / alumno</th>
                      <th className="px-4 py-2 font-medium">Plan</th>
                      <th className="px-4 py-2 font-medium text-right">Total</th>
                      <th className="px-4 py-2 font-medium text-right">Cobrado</th>
                      <th className="px-4 py-2 font-medium text-right">Saldo</th>
                      <th className="px-4 py-2 font-medium">Próxima cuota</th>
                      <th className="px-4 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-soft">
                    {statement.enrollments.map(r => (
                      <tr key={r.enrollment.id}>
                        <td className="px-4 py-2">
                          <div className="font-medium text-text-primary">{r.enrollment.id}</div>
                          <div className="text-xs text-text-muted">{r.studentName} · {r.enrollment.program} {r.enrollment.level}</div>
                        </td>
                        <td className="px-4 py-2">
                          {r.plan ? <Badge variant={planBadge(r.plan.status)}>{r.plan.status}</Badge> : <span className="text-xs text-text-muted">Sin plan</span>}
                          {r.enrollment.status !== 'Activa' && <div className="text-xs text-text-muted mt-0.5">Matrícula {r.enrollment.status.toLowerCase()}</div>}
                        </td>
                        <td className="px-4 py-2 text-right">{usd(r.totalUSD)}</td>
                        <td className="px-4 py-2 text-right text-success-text">{usd(r.paidUSD)}</td>
                        <td className={`px-4 py-2 text-right font-medium ${r.balanceUSD > 0 ? 'text-danger-text' : 'text-text-secondary'}`}>{usd(r.balanceUSD)}</td>
                        <td className="px-4 py-2 text-xs text-text-secondary">
                          {r.next ? <>{r.next.name} · {r.next.dueLabel}{r.next.overdue && <span className="text-danger-text font-medium"> (vencida)</span>}</> : '—'}
                        </td>
                        <td className="px-4 py-2 text-right whitespace-nowrap">
                          <button className="text-xs text-primary-accent hover:underline" onClick={() => go(`/operacion/matriculas?ficha=${r.enrollment.id}`)}>Ver matrícula</button>
                          {r.plan && <button className="text-xs text-primary-accent hover:underline ml-3" onClick={() => go(`/operacion/planes-y-cartera?plan=${r.plan!.id}`)}>Ver plan</button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="space-y-2">
              <h4 className="text-sm font-bold text-text-primary uppercase tracking-wider">Cuotas pendientes</h4>
              {pending.length === 0 ? (
                <p className="text-sm text-text-muted italic">No hay cuotas pendientes: el titular está al día.</p>
              ) : (
                <div className="border border-border-soft rounded-xl overflow-hidden">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-text-secondary uppercase bg-surface-muted/50">
                      <tr>
                        <th className="px-4 py-2 font-medium">Vence</th>
                        <th className="px-4 py-2 font-medium">Cuota</th>
                        <th className="px-4 py-2 font-medium">Alumno</th>
                        <th className="px-4 py-2 font-medium text-right">Saldo</th>
                        <th className="px-4 py-2 font-medium">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-soft">
                      {pending.map(i => (
                        <tr key={`${i.enrollmentId}-${i.id}`}>
                          <td className="px-4 py-2 whitespace-nowrap">{i.dueLabel}</td>
                          <td className="px-4 py-2">{i.name} <span className="text-xs text-text-muted">({i.enrollmentId})</span></td>
                          <td className="px-4 py-2 text-text-secondary">{i.student}</td>
                          <td className="px-4 py-2 text-right font-medium">{usd(i.balance)}</td>
                          <td className="px-4 py-2"><Badge variant={i.overdue ? 'danger' : 'warning'}>{i.overdue ? 'Vencida' : i.status}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="space-y-2">
              <h4 className="text-sm font-bold text-text-primary uppercase tracking-wider">Pagos registrados</h4>
              {statement.payments.length === 0 ? (
                <p className="text-sm text-text-muted italic">Todavía no se registró ningún pago.</p>
              ) : (
                <div className="border border-border-soft rounded-xl overflow-hidden">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-text-secondary uppercase bg-surface-muted/50">
                      <tr>
                        <th className="px-4 py-2 font-medium">Fecha</th>
                        <th className="px-4 py-2 font-medium">Comprobante</th>
                        <th className="px-4 py-2 font-medium">Matrícula(s)</th>
                        <th className="px-4 py-2 font-medium">Medio</th>
                        <th className="px-4 py-2 font-medium text-right">Aplicado a este titular</th>
                        <th className="px-4 py-2 font-medium">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-soft">
                      {statement.payments.map(({ payment, enrollmentIds, shareUSD, voided }) => (
                        <tr key={payment.id} className={voided ? 'text-text-muted' : ''}>
                          <td className="px-4 py-2 whitespace-nowrap">{payment.date}</td>
                          <td className="px-4 py-2">{payment.receipt}</td>
                          <td className="px-4 py-2 text-xs">{enrollmentIds.join(', ')}</td>
                          <td className="px-4 py-2">{payment.method}</td>
                          <td className={`px-4 py-2 text-right ${voided ? 'line-through' : 'font-medium text-text-primary'}`}>{usd(shareUSD)}</td>
                          <td className="px-4 py-2"><Badge variant={voided ? 'danger' : 'success'}>{voided ? 'Anulado' : 'Aplicado'}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </Modal>
  );
}
