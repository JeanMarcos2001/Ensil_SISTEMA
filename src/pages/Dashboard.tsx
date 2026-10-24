import React, { useMemo } from 'react';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Users, CreditCard, DollarSign, FileCheck, AlertCircle, Clock, Plus, FileText, Building, CalendarClock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { todayLocalISO } from '../utils/schedule';
import { validityCounts } from '../utils/validity';
import { VERIFICATION_ALERT_DAYS } from '../utils/verificationGate';
import { branchFigures, dashboardKpis, dueText, initials, recentActivity, relativeTime, upcomingDues } from '../utils/dashboard';

function KPICard({ title, value, icon: Icon, alert = false, hint }: { title: string; value: string; icon: React.ElementType; alert?: boolean; hint?: string }) {
  return (
    <Card className="flex flex-col relative overflow-hidden h-full">
      {alert && <div className="absolute top-0 left-0 w-full h-1 bg-danger-text"></div>}
      <div className="flex justify-between items-start mb-4">
        <span className="text-sm font-medium text-text-secondary">{title}</span>
        <div className={`p-2 rounded-lg ${alert ? 'bg-danger-tint text-danger-text' : 'bg-surface-muted text-text-muted'}`}>
          <Icon size={18} />
        </div>
      </div>
      <div className="flex items-baseline gap-2">
        <h3 className="text-2xl font-semibold text-text-primary">{value}</h3>
      </div>
      {hint && <p className="text-xs text-danger-text font-medium mt-1">{hint}</p>}
    </Card>
  );
}

/** KPI que lleva a la pantalla donde se atiende. */
function LinkCard({ to, children }: { to: string; children: React.ReactNode }) {
  const navigate = useNavigate();
  return (
    <div role="link" tabIndex={0} className="cursor-pointer rounded-xl hover:shadow-md transition-shadow" onClick={() => navigate(to)} onKeyDown={e => e.key === 'Enter' && navigate(to)}>
      {children}
    </div>
  );
}

const usd = (n: number) => `$ ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const usd0 = (n: number) => `$ ${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

export function Dashboard() {
  const { enrollments, programs, schedules, dropRequests, changeRequests, branches, plans, payments, cashMovements, stockItems, pendingFirstSessions } = useData();
  const navigate = useNavigate();
  const today = todayLocalISO();
  const ctx = useMemo(
    () => ({ branches, enrollments, plans, payments, cashMovements, stockItems, dropRequests, changeRequests }),
    [branches, enrollments, plans, payments, cashMovements, stockItems, dropRequests, changeRequests]
  );
  const k = useMemo(() => dashboardKpis(ctx, today), [ctx, today]);
  const bySede = useMemo(() => branchFigures(ctx, today), [ctx, today]);
  const dues = useMemo(() => upcomingDues(plans, today, 7), [plans, today]);
  const activity = useMemo(() => recentActivity(ctx, 6), [ctx]);
  const expiring = validityCounts({ enrollments, programs, schedules }, today)['por-vencer'];
  const critical = dues.filter(d => d.days <= 3).length;
  // Primeras asesorías que esperan la verificación de materiales (las que llegan en 3 días o menos, o ya vencidas, son urgentes)
  const waitingFirst = Object.values(pendingFirstSessions());
  const urgentFirst = waitingFirst.filter(g => g.level !== 'planificada').length;
  const now = new Date();

  return (
    <div className="flex flex-col gap-6">
      {/* Row 1: KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7 gap-4">
        <LinkCard to="/operacion/matriculas"><KPICard title="Matrículas Activas" value={String(k.activeEnrollments)} icon={Users} /></LinkCard>
        <LinkCard to="/operacion/planes-y-cartera"><KPICard title="Cartera Pendiente" value={usd0(k.portfolioUSD)} icon={CreditCard} alert={k.overdueUSD > 0} /></LinkCard>
        <LinkCard to="/operacion/pagos"><KPICard title="Pagos del Día" value={usd(k.paymentsTodayUSD)} icon={DollarSign} /></LinkCard>
        <LinkCard to="/operacion/verificacion"><KPICard title="Verificaciones pendientes" value={String(k.pendingVerifications)} icon={FileCheck} alert={k.pendingVerifications > 0} hint={urgentFirst > 0 ? `${urgentFirst} con 1.ª asesoría en ≤ ${VERIFICATION_ALERT_DAYS} días` : undefined} /></LinkCard>
        <LinkCard to="/operacion/matriculas?vigencia=por-vencer"><KPICard title="Matrículas por vencer" value={String(expiring)} icon={CalendarClock} alert={expiring > 0} /></LinkCard>
        <LinkCard to="/logistica/stock"><KPICard title="Alertas de Stock" value={String(k.lowStock)} icon={AlertCircle} alert={k.lowStock > 0} /></LinkCard>
        <LinkCard to="/sistema/solicitudes-pendientes"><KPICard title="Solicitudes" value={String(k.pendingRequests)} icon={Clock} alert={k.pendingRequests > 0} /></LinkCard>
      </div>

      {/* Row 2: Main Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Resumen por sedes */}
        <Card className="lg:col-span-2 flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-semibold text-text-primary">Resumen por Sedes</h3>
            <Button variant="secondary" onClick={() => navigate('/organizacion/filiales')}>Ver filiales</Button>
          </div>
          <div className="flex-1">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-text-secondary uppercase bg-surface-muted/50">
                  <tr>
                    <th className="px-4 py-3 font-medium rounded-l-lg">Sede</th>
                    <th className="px-4 py-3 font-medium">Matrículas activas</th>
                    <th className="px-4 py-3 font-medium">Ingresos (Mes)</th>
                    <th className="px-4 py-3 font-medium">Estado</th>
                    <th className="px-4 py-3 font-medium rounded-r-lg"></th>
                  </tr>
                </thead>
                <tbody>
                  {bySede.map(row => (
                    <tr key={row.branch.id} className="border-b border-border-soft last:border-0">
                      <td className="px-4 py-4 font-medium text-text-primary">{row.branch.name}</td>
                      <td className="px-4 py-4 text-text-secondary">{row.activeEnrollments}</td>
                      <td className="px-4 py-4 text-text-secondary">{usd(row.monthIncomeUSD)}</td>
                      <td className="px-4 py-4">
                        {row.overdueUSD > 0 ? <Badge variant="warning">Mora {usd0(row.overdueUSD)}</Badge> : <Badge variant="success">Al día</Badge>}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <Button variant="ghost" onClick={() => navigate(row.overdueUSD > 0 ? '/operacion/planes-y-cartera' : '/organizacion/filiales')}>
                          {row.overdueUSD > 0 ? 'Ver cartera' : 'Gestionar'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {bySede.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-text-muted">No hay sedes activas.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </Card>

        {/* Caja por moneda & Vencimientos */}
        <div className="flex flex-col gap-6">
          <Card>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-base font-semibold text-text-primary">Caja por Moneda</h3>
              <button className="text-xs text-primary-accent hover:underline" onClick={() => navigate('/operacion/caja')}>Ver caja</button>
            </div>
            <div className="space-y-4">
              <div className="flex justify-between items-center p-3 bg-surface-muted rounded-xl border border-border-soft">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-white border border-border-soft flex items-center justify-center font-medium text-xs">PEN</div>
                  <span className="text-sm font-medium text-text-primary">Soles</span>
                </div>
                <span className="text-sm font-semibold text-text-primary">S/ {k.cashPEN.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-surface-muted rounded-xl border border-border-soft">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-white border border-border-soft flex items-center justify-center font-medium text-xs">USD</div>
                  <span className="text-sm font-medium text-text-primary">Dólares</span>
                </div>
                <span className="text-sm font-semibold text-text-primary">{usd(k.cashUSD)}</span>
              </div>
            </div>
          </Card>

          <Card className="flex-1">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-base font-semibold text-text-primary">Vencimientos Cercanos</h3>
              {critical > 0 ? <Badge variant="danger">{critical} crítico{critical === 1 ? '' : 's'}</Badge> : <Badge variant="neutral">{dues.length}</Badge>}
            </div>
            {dues.length === 0 ? (
              <p className="text-sm text-text-muted italic">No hay cuotas vencidas ni por vencer en los próximos 7 días.</p>
            ) : (
              <div className="space-y-3">
                {dues.slice(0, 5).map(d => (
                  <button key={`${d.planId}-${d.installment}`} className="flex gap-3 items-start text-left w-full hover:bg-surface-muted rounded-lg -mx-1 px-1 py-0.5" onClick={() => navigate(`/operacion/planes-y-cartera?plan=${d.planId}`)}>
                    <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${d.days < 0 ? 'bg-danger-text' : 'bg-warning-text'}`}></div>
                    <div>
                      <p className="text-sm font-medium text-text-primary">{d.installment} · {d.titular}</p>
                      <p className="text-xs text-text-muted">{dueText(d.days)} • {usd(d.balance)} · {d.enrollmentId}</p>
                    </div>
                  </button>
                ))}
                {dues.length > 5 && <p className="text-xs text-text-muted">y {dues.length - 5} más en Planes y cartera.</p>}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Row 3: Actividad & Accesos */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-semibold text-text-primary">Actividad Reciente</h3>
          </div>
          {activity.length === 0 ? (
            <p className="text-sm text-text-muted italic">Todavía no hay movimientos registrados.</p>
          ) : (
            <div className="space-y-4">
              {activity.map((item, idx) => (
                <div key={idx} className="flex items-center gap-4 py-2 border-b border-border-soft last:border-0 last:pb-0">
                  <div className="w-8 h-8 rounded-full bg-surface-muted border border-border-soft flex items-center justify-center text-xs font-medium text-text-secondary shrink-0">
                    {initials(item.user)}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-text-primary">
                      <span className="font-medium">{item.user}</span> {item.text}
                    </p>
                    <p className="text-xs text-text-muted mt-0.5">{relativeTime(item.at, now)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <h3 className="text-base font-semibold text-text-primary mb-4">Accesos Rápidos</h3>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Nueva Promoción', icon: Plus, to: '/configuracion/promociones' },
              { label: 'Nuevo Tarifario', icon: FileText, to: '/configuracion/tarifarios' },
              { label: 'Nuevo Usuario', icon: Users, to: '/organizacion/usuarios' },
              { label: 'Nueva Filial', icon: Building, to: '/organizacion/filiales' },
            ].map(({ label, icon: Icon, to }) => (
              <button key={label} onClick={() => navigate(to)} className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl border border-border-soft hover:bg-surface-muted transition-colors text-text-secondary hover:text-primary-accent group">
                <div className="w-10 h-10 rounded-full bg-surface-muted group-hover:bg-active-tint flex items-center justify-center transition-colors">
                  <Icon size={20} />
                </div>
                <span className="text-xs font-medium text-center">{label}</span>
              </button>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
