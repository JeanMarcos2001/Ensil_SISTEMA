import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Modal } from '../ui/Modal';
import { useData } from '../../context/DataContext';
import { buildFicha, type Ficha, type FichaEvent } from '../../utils/enrollmentFicha';
import { localDateOf, longDayLabel, slotLabel, todayLocalISO } from '../../utils/schedule';
import { VALIDITY_LABEL, canEnableExtension, type ValidityState } from '../../utils/validity';
import { RegisterPaymentModal } from '../payments/RegisterPaymentModal';
import { DropRequestModal } from './DropRequestModal';
import { EditEnrollmentModal } from './EditEnrollmentModal';
import { ResolveDropModal } from './ResolveDropModal';
import { EnrollmentDocumentsPanel } from './EnrollmentDocumentsPanel';
import { useChangeActions } from './useChangeActions';

export type FichaTab = 'resumen' | 'plan' | 'asesorias' | 'entrega' | 'documentos' | 'historial';
const TABS: { id: FichaTab; label: string }[] = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'plan', label: 'Plan y pagos' },
  { id: 'asesorias', label: 'Asesorías y vigencia' },
  { id: 'entrega', label: 'Verificación y entrega' },
  { id: 'documentos', label: 'Contrato y ficha' },
  { id: 'historial', label: 'Historial' },
];

const usd = (n: number) => `USD ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const VALIDITY_TONE: Record<ValidityState, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  'sin-inicio': 'neutral', 'por-iniciar': 'info', vigente: 'success', 'por-vencer': 'warning', 'base-finalizada': 'danger', extension: 'info', finalizada: 'neutral',
};
const INSTALLMENT_TONE = (s: string): 'success' | 'warning' | 'danger' | 'info' | 'neutral' =>
  s === 'Pagada' ? 'success' : s === 'Parcial' ? 'warning' : s === 'Vencida' ? 'danger' : s === 'Refinanciada' ? 'info' : 'neutral';
const EVENT_DOT: Record<FichaEvent['tone'], string> = {
  neutral: 'bg-text-muted', success: 'bg-success-text', warning: 'bg-warning-text', danger: 'bg-danger-text', info: 'bg-info-text',
};

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-text-muted uppercase tracking-wider">{label}</p>
      <div className="text-sm font-medium text-text-primary mt-0.5">{children || '—'}</div>
    </div>
  );
}

function Card({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`border border-border-soft rounded-xl p-4 space-y-3 ${className}`}>
      <h4 className="text-xs font-bold text-text-muted uppercase tracking-widest">{title}</h4>
      {children}
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'danger' | 'success' }) {
  return (
    <div className="bg-surface-muted border border-border-soft rounded-xl p-3">
      <p className="text-xs text-text-muted">{label}</p>
      <p className={`text-lg font-semibold ${tone === 'danger' ? 'text-danger-text' : tone === 'success' ? 'text-success-text' : 'text-text-primary'}`}>{value}</p>
    </div>
  );
}

interface Props {
  /** Matrícula a mostrar; `null` cierra la ficha. */
  enrollmentId: string | null;
  onClose: () => void;
  initialTab?: FichaTab;
}

/**
 * Ficha de una matrícula: todo lo que el sistema sabe de ella, ordenado por tema, con sus acciones
 * (cobrar, corregir datos, solicitar o resolver la caída, habilitar la extensión).
 */
export function EnrollmentFichaModal({ enrollmentId, onClose, initialTab = 'resumen' }: Props) {
  const data = useData();
  const navigate = useNavigate();
  const today = todayLocalISO();
  const [tab, setTab] = useState<FichaTab>(initialTab);
  const [dropFor, setDropFor] = useState<string | null>(null);
  const [resolveFor, setResolveFor] = useState<string | null>(null);
  const [editFor, setEditFor] = useState<string | null>(null);
  const [payFor, setPayFor] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const lifecycle = useChangeActions();

  useEffect(() => { if (enrollmentId) { setTab(initialTab); setNotice(null); } }, [enrollmentId, initialTab]);

  const ficha: Ficha | undefined = useMemo(
    () => (enrollmentId ? buildFicha({
      enrollments: data.enrollments, students: data.students, guardians: data.guardians, programs: data.programs, plans: data.plans,
      payments: data.payments, groups: data.promotionGroups, schedules: data.schedules, trackings: data.trackings,
      dropRequests: data.dropRequests, changes: data.enrollmentChanges, today,
    }, enrollmentId) : undefined),
    [enrollmentId, data.enrollments, data.students, data.guardians, data.programs, data.plans, data.payments, data.promotionGroups, data.schedules, data.trackings, data.dropRequests, data.enrollmentChanges, today]
  );

  if (!enrollmentId || !ficha) return null;
  const { enrollment: e, student, guardians, plan, validity: v } = ficha;
  const active = e.status === 'Activa';
  const canPay = active && !!plan && plan.balance > 0 && plan.installments.some(i => i.balance > 0 && i.status !== 'Refinanciada');
  const students = ficha.group?.members.map(m => m.student) ?? [];

  const enableExtension = () => {
    const r = data.enableExtension(e.id);
    setNotice(r.ok ? 'Extensión habilitada.' : r.error ?? 'No se pudo habilitar la extensión.');
  };

  return (
    <>
      <Modal
        isOpen
        onClose={onClose}
        title="Ficha de la matrícula"
        size="6xl"
        footer={
          <div className="flex flex-wrap justify-between items-center gap-3 w-full">
            <Button variant="ghost" onClick={onClose}>Cerrar</Button>
            <div className="flex flex-wrap gap-2">
              {plan && <Button variant="secondary" onClick={() => { onClose(); navigate(`/operacion/planes-y-cartera?plan=${plan.id}`); }}>Ver plan en Planes y cartera</Button>}
              {active && <Button variant="secondary" onClick={() => setEditFor(e.id)}>Corregir datos</Button>}
              {canPay && <Button variant="secondary" onClick={() => setPayFor(plan!.id)}>Registrar pago</Button>}
              {ficha.pendingDrop
                ? <Button variant="primary" onClick={() => setResolveFor(ficha.pendingDrop!.id)}>Resolver caída solicitada</Button>
                : active && <Button variant="secondary" className="text-danger-text" onClick={() => setDropFor(e.id)}>Solicitar caída</Button>}
            </div>
          </div>
        }
      >
        <div className="space-y-5 pb-2">
          {/* Cabecera */}
          <div className="flex flex-wrap items-center justify-between gap-4 bg-surface-muted p-4 rounded-xl border border-border-soft">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-primary-accent/10 rounded-full flex items-center justify-center text-primary-accent font-bold">{e.student.charAt(0)}</div>
              <div>
                <h3 className="text-lg font-bold text-text-primary">{e.id} · {e.student}</h3>
                <p className="text-sm text-text-secondary">{e.program}{e.level ? ` - ${e.level}` : ''} · {e.sede ?? '—'} · Matrícula del {e.date}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <Badge variant={active ? 'success' : 'danger'}>{e.status}</Badge>
              {ficha.pendingDrop && <Badge variant="warning">Caída solicitada</Badge>}
              {active && <Badge variant={VALIDITY_TONE[v.state]}>{VALIDITY_LABEL[v.state]}</Badge>}
              {plan && <Badge variant={plan.status === 'Al día' ? 'success' : plan.status === 'Completado' ? 'info' : 'danger'}>Plan: {plan.status}</Badge>}
            </div>
          </div>

          {notice && <div className="text-sm bg-info-tint/60 border border-info-text/20 text-info-text rounded-xl px-4 py-2.5">{notice}</div>}
          {ficha.pendingDrop && (
            <div className="text-sm bg-warning-tint/60 border border-warning-text/20 rounded-xl px-4 py-2.5 text-text-primary">
              <strong>Caída solicitada</strong> el {localDateOf(ficha.pendingDrop.requestedAt)} por {ficha.pendingDrop.requestedBy}: {ficha.pendingDrop.reason}. Pendiente de resolver.
            </div>
          )}
          {(() => {
            const pendingChange = data.changeRequests.find(r => r.enrollmentId === e.id && r.status === 'Pendiente');
            return pendingChange ? (
              <div className="text-sm bg-warning-tint/60 border border-warning-text/20 rounded-xl px-4 py-2.5 text-text-primary">
                <strong>{pendingChange.kind} solicitada</strong> el {localDateOf(pendingChange.requestedAt)} por {pendingChange.requestedBy}: {pendingChange.reason}. Pendiente de resolver en Sistema → Solicitudes pendientes.
              </div>
            ) : null;
          })()}
          {lifecycle.items(e).length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider mr-1">Ciclo de la matrícula</span>
              {lifecycle.items(e).map(item => (
                <Button key={item.label} variant="secondary" size="sm" disabled={item.disabled} onClick={item.onClick}>{item.label}</Button>
              ))}
            </div>
          )}
          {e.status === 'Caída' && ficha.drop?.status === 'Aprobada' && (
            <div className="text-sm bg-danger-tint/50 border border-danger-text/20 rounded-xl px-4 py-2.5 text-text-primary">
              <strong>Matrícula caída</strong> desde el {e.dropDate ? longDayLabel(e.dropDate) : '—'}. Motivo: {ficha.drop.reason}.
            </div>
          )}

          {/* Pestañas */}
          <div className="flex gap-1 border-b border-border-soft overflow-x-auto">
            {TABS.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`px-4 h-10 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
                  tab === t.id ? 'border-primary-accent text-primary-accent' : 'border-transparent text-text-muted hover:text-text-primary'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Resumen */}
          {tab === 'resumen' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <Card title="Alumno">
                <div className="grid grid-cols-2 gap-4">
                  <Item label="Nombre">{student?.name ?? e.student}</Item>
                  <Item label="Documento">{student ? `${student.docType ?? 'DNI'} ${student.doc}` : ''}</Item>
                  <Item label="Edad">{student ? `${student.age} años` : ''}</Item>
                  <Item label="Nacimiento">{student?.birthDate}</Item>
                  <Item label="Situación">
                    {student?.occupationStatus === 'estudiando' ? 'Estudia' : student?.occupationStatus === 'trabajando' ? 'Trabaja' : student?.occupationStatus === 'ambos' ? 'Estudia y trabaja' : student?.occupationStatus === 'ninguna' ? 'Ninguna' : ''}
                  </Item>
                  <Item label="Institución / grado">{[student?.colegio, student?.grado].filter(Boolean).join(' · ')}</Item>
                  {student?.occupation && <Item label="Ocupación">{[student.occupation, student.workplace].filter(Boolean).join(' · ')}</Item>}
                  <Item label="Horario de clases">{student?.horario}</Item>
                  {student && (!student.guardianIds || student.guardianIds.length === 0) && <Item label="Teléfono">{student.phone}</Item>}
                </div>
              </Card>

              <Card title={guardians.length > 1 ? 'Titulares' : 'Titular'}>
                {guardians.length === 0 ? (
                  <p className="text-sm text-text-secondary">
                    {student && (!student.guardianIds || student.guardianIds.length === 0)
                      ? student.titular && student.titular !== student.name
                        ? `${student.titular} (registro antiguo, sin ficha de titular vinculada).`
                        : 'Alumno independiente: es su propio titular.'
                      : 'Sin titular registrado.'}
                  </p>
                ) : guardians.map((g, i) => (
                  <div key={g.id} className="space-y-1 pb-2 border-b border-border-soft last:border-0 last:pb-0">
                    <p className="text-sm font-semibold text-text-primary">{g.name}{i === 0 && guardians.length > 1 && <span className="ml-2 text-xs font-medium text-primary-accent">Principal</span>}</p>
                    <p className="text-xs text-text-secondary">{g.docType ?? 'DNI'} {g.doc} · {g.phone}{g.email ? ` · ${g.email}` : ''}</p>
                    {g.direccion && <p className="text-xs text-text-muted">{g.direccion}</p>}
                    {i === 0 && student?.relationship && <p className="text-xs text-text-muted">Parentesco del alumno: {student.relationship}</p>}
                  </div>
                ))}
              </Card>

              <Card title="Matrícula">
                <div className="grid grid-cols-2 gap-4">
                  <Item label="Fecha">{e.date}</Item>
                  <Item label="Sede">{e.sede}</Item>
                  <Item label="Programa">{e.program}</Item>
                  <Item label="Nivel">{e.level}</Item>
                  <Item label="Tipo de pago">{e.paymentTypeName}</Item>
                  <Item label="Tarifario">{e.tariffName}</Item>
                  <Item label="Precio asignado">{e.assignedPrice != null ? usd(e.assignedPrice) : ''}</Item>
                  <Item label="Responsable de la entrevista">{e.asesor}</Item>
                  <Item label="Origen del contacto">{e.origen}</Item>
                  <Item label="Registrada por">{e.createdBy}</Item>
                </div>
                {e.observation && <Item label="Observación">{e.observation}</Item>}
              </Card>

              {ficha.group && (
                <Card title="Grupo promocional" className="lg:col-span-3">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Item label="Grupo">{ficha.group.group.id}</Item>
                    <Item label="Precio del grupo">{usd(ficha.group.group.totalPrice)}</Item>
                    <Item label="Parte de esta matrícula">{usd(ficha.group.group.allocations.find(a => a.enrollmentId === e.id)?.amount ?? 0)}</Item>
                    <Item label="Alumnos del grupo">{students.join(', ')}</Item>
                  </div>
                </Card>
              )}
            </div>
          )}

          {/* Plan y pagos */}
          {tab === 'plan' && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Stat label="Total de la matrícula" value={usd(ficha.totalUSD)} />
                <Stat label="Cobrado" value={usd(ficha.paidUSD)} tone="success" />
                <Stat label="Saldo por cobrar" value={usd(ficha.balanceUSD)} tone={ficha.balanceUSD > 0 ? 'danger' : undefined} />
                <Stat label="Próxima cuota" value={plan?.next && plan.next !== '-' ? plan.next : '—'} />
              </div>

              {plan ? (
                <Card title={`Cronograma · ${plan.type}`}>
                  {plan.installments.length === 0 ? (
                    <p className="text-sm text-text-secondary">Pago de contado: no tiene cuotas.</p>
                  ) : (
                    <div className="border border-border-soft rounded-xl overflow-hidden">
                      <table className="w-full text-sm text-left">
                        <thead className="text-xs text-text-secondary uppercase bg-surface-muted/50">
                          <tr>
                            <th className="px-4 py-2 font-medium">Cuota</th>
                            <th className="px-4 py-2 font-medium">Vence</th>
                            <th className="px-4 py-2 font-medium text-right">Monto</th>
                            <th className="px-4 py-2 font-medium text-right">Saldo</th>
                            <th className="px-4 py-2 font-medium">Estado</th>
                            <th className="px-4 py-2 font-medium">Cobros</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border-soft">
                          {plan.installments.map((i: any) => (
                            <tr key={i.id}>
                              <td className="px-4 py-2 font-medium text-text-primary">{i.name}</td>
                              <td className="px-4 py-2 text-text-secondary">{i.dueDate}</td>
                              <td className="px-4 py-2 text-right text-text-primary">{usd(i.amount)}</td>
                              <td className="px-4 py-2 text-right font-medium text-text-primary">{usd(i.balance)}</td>
                              <td className="px-4 py-2"><Badge variant={INSTALLMENT_TONE(i.status)}>{i.status}</Badge></td>
                              <td className="px-4 py-2 text-text-secondary text-xs">{(i.payments ?? []).map((p: any) => p.receipt).join(', ') || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>
              ) : (
                <p className="text-sm text-text-muted">Esta matrícula no tiene un plan de pagos registrado.</p>
              )}

              <Card title="Pagos registrados">
                {ficha.payments.length === 0 ? (
                  <p className="text-sm text-text-muted">Aún no hay pagos.</p>
                ) : (
                  <div className="border border-border-soft rounded-xl overflow-hidden">
                    <table className="w-full text-sm text-left">
                      <thead className="text-xs text-text-secondary uppercase bg-surface-muted/50">
                        <tr>
                          <th className="px-4 py-2 font-medium">Pago</th>
                          <th className="px-4 py-2 font-medium">Fecha</th>
                          <th className="px-4 py-2 font-medium">Concepto</th>
                          <th className="px-4 py-2 font-medium">Medio</th>
                          <th className="px-4 py-2 font-medium">Comprobante</th>
                          <th className="px-4 py-2 font-medium text-right">Monto</th>
                          <th className="px-4 py-2 font-medium">Estado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border-soft">
                        {ficha.payments.map(({ payment: p, shareUSD, voided }) => (
                          <tr key={p.id} className={voided ? 'opacity-60' : ''}>
                            <td className="px-4 py-2 font-mono text-text-secondary">{p.id}</td>
                            <td className="px-4 py-2 text-text-secondary">{p.date}</td>
                            <td className="px-4 py-2 text-text-primary">{p.concept}</td>
                            <td className="px-4 py-2 text-text-secondary">{p.method}</td>
                            <td className="px-4 py-2 text-text-secondary">{p.receipt}</td>
                            <td className={`px-4 py-2 text-right font-medium text-text-primary ${voided ? 'line-through' : ''}`}>{usd(shareUSD)}</td>
                            <td className="px-4 py-2"><Badge variant={voided ? 'danger' : 'success'}>{voided ? 'Anulado' : 'Aplicado'}</Badge></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </div>
          )}

          {/* Asesorías y vigencia */}
          {tab === 'asesorias' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <Card title="Vigencia del programa">
                <div className="grid grid-cols-2 gap-4">
                  <Item label="Estado"><Badge variant={VALIDITY_TONE[v.state]}>{VALIDITY_LABEL[v.state]}</Badge></Item>
                  <Item label="Duración">{v.baseMonths ? `${v.baseMonths} meses + ${v.extensionMonths} de extensión` : ''}</Item>
                  <Item label="Inicio (primera asesoría)">{v.start ? longDayLabel(v.start) : 'Aún no tiene primera asesoría'}</Item>
                  <Item label="Fin de la duración base">{v.baseEnd ? longDayLabel(v.baseEnd) : ''}</Item>
                  <Item label="Fin con extensión">{v.extensionEnd ? longDayLabel(v.extensionEnd) : ''}</Item>
                  <Item label="Extensión">{v.extensionEnabled ? `Habilitada${e.extensionEnabledBy ? ` por ${e.extensionEnabledBy}` : ''}` : 'No habilitada'}</Item>
                </div>
                {v.state === 'por-vencer' && <p className="text-sm text-warning-text bg-warning-tint/50 rounded-lg px-3 py-2">Termina la duración base en {v.daysToBaseEnd} {v.daysToBaseEnd === 1 ? 'día' : 'días'}.</p>}
                {active && canEnableExtension(v) && <Button variant="secondary" onClick={enableExtension}>Habilitar extensión</Button>}
              </Card>

              <Card title="Asesorías del alumno">
                <div className="grid grid-cols-3 gap-4">
                  <Item label="Asistió">{String(ficha.sessions.attended)}</Item>
                  <Item label="Faltó">{String(ficha.sessions.missed)}</Item>
                  <Item label="Sesiones registradas">{String(ficha.sessions.recorded)}</Item>
                </div>
                {ficha.firstSession && (
                  <Item label="Primera asesoría">{longDayLabel(ficha.firstSession.date)} · {slotLabel(ficha.firstSession.time)} · {ficha.firstSession.status}</Item>
                )}
                <div className="space-y-1.5">
                  <p className="text-xs text-text-muted uppercase tracking-wider">Próximas</p>
                  {ficha.sessions.upcoming.length === 0
                    ? <p className="text-sm text-text-secondary">No tiene asesorías reservadas.</p>
                    : ficha.sessions.upcoming.slice(0, 5).map(s => (
                      <p key={s.id} className="text-sm text-text-primary">{longDayLabel(s.date)} · {slotLabel(s.time)} <span className="text-text-muted">· {s.responsible}</span></p>
                    ))}
                </div>
              </Card>
            </div>
          )}

          {/* Verificación y entrega */}
          {tab === 'entrega' && (
            <Card title="Verificación de entrega de materiales">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Item label="Estado"><Badge variant={e.verificationStatus === 'Verificado Completo' ? 'success' : e.verificationStatus === 'Verificado Incompleto' ? 'warning' : 'neutral'}>{e.verificationStatus ?? 'Pendiente'}</Badge></Item>
                <Item label="Fecha">{e.verificationDate ? e.verificationDate.slice(0, 10) : ''}</Item>
                <Item label="Verificador">{e.verifier}</Item>
                <Item label="Artículos entregados">{String(e.verifiedItems?.length ?? 0)}</Item>
              </div>
              {e.verificationObservation && <Item label="Observación">{e.verificationObservation}</Item>}
              <Button variant="secondary" onClick={() => { onClose(); navigate('/operacion/verificacion'); }}>Ir a Verificación</Button>
            </Card>
          )}

          {tab === 'documentos' && <EnrollmentDocumentsPanel enrollmentId={e.id} />}

          {/* Historial */}
          {tab === 'historial' && (
            <div className="space-y-4">
              {ficha.events.length === 0 && <p className="text-sm text-text-muted">Sin eventos.</p>}
              <ol className="relative border-l border-border-soft ml-2 space-y-4">
                {ficha.events.map((ev, i) => (
                  <li key={i} className="ml-5">
                    <span className={`absolute -left-[5px] mt-1.5 w-2.5 h-2.5 rounded-full ${EVENT_DOT[ev.tone]}`} />
                    <p className="text-xs text-text-muted">{longDayLabel(ev.date)} {ev.date.slice(0, 4)}</p>
                    <p className="text-sm font-medium text-text-primary">{ev.title}</p>
                    {ev.detail && <p className="text-sm text-text-secondary">{ev.detail}</p>}
                  </li>
                ))}
              </ol>
              <p className="text-xs text-text-muted">La línea de tiempo se arma con los datos de la matrícula; el sistema aún no tiene una bitácora de auditoría completa.</p>
            </div>
          )}
        </div>
      </Modal>

      <DropRequestModal enrollmentId={dropFor} onClose={() => setDropFor(null)} />
      {lifecycle.modals}
      <ResolveDropModal requestId={resolveFor} onClose={() => setResolveFor(null)} />
      <EditEnrollmentModal enrollmentId={editFor} onClose={() => setEditFor(null)} />
      <RegisterPaymentModal isOpen={!!payFor} onClose={() => setPayFor(null)} initialPlanId={payFor ?? undefined} />
    </>
  );
}
