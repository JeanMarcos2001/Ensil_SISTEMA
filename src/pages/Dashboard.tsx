import React from 'react';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { ArrowUpRight, ArrowDownRight, Users, CreditCard, DollarSign, FileCheck, AlertCircle, Clock, Plus, FileText, Building, CalendarClock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { todayLocalISO } from '../utils/schedule';
import { validityCounts } from '../utils/validity';

function KPICard({ title, value, trend, trendValue, icon: Icon, alert = false }: any) {
  return (
    <Card className="flex flex-col relative overflow-hidden">
      {alert && <div className="absolute top-0 left-0 w-full h-1 bg-danger-text"></div>}
      <div className="flex justify-between items-start mb-4">
        <span className="text-sm font-medium text-text-secondary">{title}</span>
        <div className={`p-2 rounded-lg ${alert ? 'bg-danger-tint text-danger-text' : 'bg-surface-muted text-text-muted'}`}>
          <Icon size={18} />
        </div>
      </div>
      <div className="flex items-baseline gap-2">
        <h3 className="text-2xl font-semibold text-text-primary">{value}</h3>
        {trend && (
          <span className={`flex items-center text-xs font-medium ${trend === 'up' ? 'text-success-text' : 'text-danger-text'}`}>
            {trend === 'up' ? <ArrowUpRight size={14} className="mr-0.5" /> : <ArrowDownRight size={14} className="mr-0.5" />}
            {trendValue}
          </span>
        )}
      </div>
    </Card>
  );
}

export function Dashboard() {
  const { enrollments, programs, schedules } = useData();
  const navigate = useNavigate();
  const expiring = validityCounts({ enrollments, programs, schedules }, todayLocalISO())['por-vencer'];
  return (
    <div className="flex flex-col gap-6">
      {/* Row 1: KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7 gap-4">
        <KPICard title="Matrículas Activas" value="1,248" trend="up" trendValue="12%" icon={Users} />
        <KPICard title="Cartera Pendiente" value="$45,200" trend="down" trendValue="3.2%" icon={CreditCard} />
        <KPICard title="Pagos del Día" value="$8,450" trend="up" trendValue="8.1%" icon={DollarSign} />
        <KPICard title="Verificaciones" value="24" icon={FileCheck} />
        <div role="link" tabIndex={0} className="cursor-pointer rounded-xl hover:shadow-md transition-shadow" onClick={() => navigate('/operacion/matriculas?vigencia=por-vencer')} onKeyDown={e => e.key === 'Enter' && navigate('/operacion/matriculas?vigencia=por-vencer')}>
          <KPICard title="Matrículas por vencer" value={String(expiring)} icon={CalendarClock} alert={expiring > 0} />
        </div>
        <KPICard title="Alertas de Stock" value="7" icon={AlertCircle} alert />
        <KPICard title="Solicitudes" value="12" icon={Clock} />
      </div>

      {/* Row 2: Main Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Resumen por sedes */}
        <Card className="lg:col-span-2 flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-semibold text-text-primary">Resumen por Sedes</h3>
            <Button variant="secondary">Ver detalle</Button>
          </div>
          <div className="flex-1">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-text-secondary uppercase bg-surface-muted/50">
                  <tr>
                    <th className="px-4 py-3 font-medium rounded-l-lg">Sede</th>
                    <th className="px-4 py-3 font-medium">Matrículas</th>
                    <th className="px-4 py-3 font-medium">Ingresos (Mes)</th>
                    <th className="px-4 py-3 font-medium">Estado</th>
                    <th className="px-4 py-3 font-medium rounded-r-lg"></th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border-soft last:border-0">
                    <td className="px-4 py-4 font-medium text-text-primary">Sede Central (Lima)</td>
                    <td className="px-4 py-4 text-text-secondary">845</td>
                    <td className="px-4 py-4 text-text-secondary">$124,500</td>
                    <td className="px-4 py-4"><Badge variant="success">Óptimo</Badge></td>
                    <td className="px-4 py-4 text-right"><Button variant="ghost">Gestionar</Button></td>
                  </tr>
                  <tr className="border-b border-border-soft last:border-0">
                    <td className="px-4 py-4 font-medium text-text-primary">Sede Norte (Trujillo)</td>
                    <td className="px-4 py-4 text-text-secondary">234</td>
                    <td className="px-4 py-4 text-text-secondary">$38,200</td>
                    <td className="px-4 py-4"><Badge variant="warning">Revisión</Badge></td>
                    <td className="px-4 py-4 text-right"><Button variant="ghost">Gestionar</Button></td>
                  </tr>
                  <tr className="border-b border-border-soft last:border-0">
                    <td className="px-4 py-4 font-medium text-text-primary">Sede Sur (Arequipa)</td>
                    <td className="px-4 py-4 text-text-secondary">169</td>
                    <td className="px-4 py-4 text-text-secondary">$29,800</td>
                    <td className="px-4 py-4"><Badge variant="success">Óptimo</Badge></td>
                    <td className="px-4 py-4 text-right"><Button variant="ghost">Gestionar</Button></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </Card>

        {/* Caja por moneda & Vencimientos */}
        <div className="flex flex-col gap-6">
          <Card>
            <h3 className="text-base font-semibold text-text-primary mb-4">Caja por Moneda</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center p-3 bg-surface-muted rounded-xl border border-border-soft">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-white border border-border-soft flex items-center justify-center font-medium text-xs">PEN</div>
                  <span className="text-sm font-medium text-text-primary">Soles</span>
                </div>
                <span className="text-sm font-semibold text-text-primary">S/ 145,200.00</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-surface-muted rounded-xl border border-border-soft">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-white border border-border-soft flex items-center justify-center font-medium text-xs">USD</div>
                  <span className="text-sm font-medium text-text-primary">Dólares</span>
                </div>
                <span className="text-sm font-semibold text-text-primary">$ 12,450.00</span>
              </div>
            </div>
          </Card>

          <Card className="flex-1">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-base font-semibold text-text-primary">Vencimientos Cercanos</h3>
              <Badge variant="danger">3 Críticos</Badge>
            </div>
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex gap-3 items-start">
                  <div className="w-2 h-2 rounded-full bg-warning-text mt-1.5 shrink-0"></div>
                  <div>
                    <p className="text-sm font-medium text-text-primary">Pago a Proveedor IT</p>
                    <p className="text-xs text-text-muted">Vence mañana • $1,200</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {/* Row 3: Actividad & Accesos */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-semibold text-text-primary">Actividad Reciente</h3>
            <Button variant="ghost">Ver todo</Button>
          </div>
          <div className="space-y-4">
            {[
              { user: 'Ana García', action: 'aprobó una solicitud de descuento', time: 'Hace 10 min', avatar: 'AG' },
              { user: 'Carlos Ruiz', action: 'registró un nuevo pago en Sede Norte', time: 'Hace 45 min', avatar: 'CR' },
              { user: 'Sistema', action: 'generó el cierre de caja automático', time: 'Hace 2 horas', avatar: 'SYS' },
            ].map((item, idx) => (
              <div key={idx} className="flex items-center gap-4 py-2 border-b border-border-soft last:border-0 last:pb-0">
                <div className="w-8 h-8 rounded-full bg-surface-muted border border-border-soft flex items-center justify-center text-xs font-medium text-text-secondary shrink-0">
                  {item.avatar}
                </div>
                <div className="flex-1">
                  <p className="text-sm text-text-primary">
                    <span className="font-medium">{item.user}</span> {item.action}
                  </p>
                  <p className="text-xs text-text-muted mt-0.5">{item.time}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h3 className="text-base font-semibold text-text-primary mb-4">Accesos Rápidos</h3>
          <div className="grid grid-cols-2 gap-3">
            <button className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl border border-border-soft hover:bg-surface-muted transition-colors text-text-secondary hover:text-primary-accent group">
              <div className="w-10 h-10 rounded-full bg-surface-muted group-hover:bg-active-tint flex items-center justify-center transition-colors">
                <Plus size={20} />
              </div>
              <span className="text-xs font-medium text-center">Nueva Promoción</span>
            </button>
            <button className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl border border-border-soft hover:bg-surface-muted transition-colors text-text-secondary hover:text-primary-accent group">
              <div className="w-10 h-10 rounded-full bg-surface-muted group-hover:bg-active-tint flex items-center justify-center transition-colors">
                <FileText size={20} />
              </div>
              <span className="text-xs font-medium text-center">Nuevo Tarifario</span>
            </button>
            <button className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl border border-border-soft hover:bg-surface-muted transition-colors text-text-secondary hover:text-primary-accent group">
              <div className="w-10 h-10 rounded-full bg-surface-muted group-hover:bg-active-tint flex items-center justify-center transition-colors">
                <Users size={20} />
              </div>
              <span className="text-xs font-medium text-center">Nuevo Usuario</span>
            </button>
            <button className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl border border-border-soft hover:bg-surface-muted transition-colors text-text-secondary hover:text-primary-accent group">
              <div className="w-10 h-10 rounded-full bg-surface-muted group-hover:bg-active-tint flex items-center justify-center transition-colors">
                <Building size={20} />
              </div>
              <span className="text-xs font-medium text-center">Nueva Filial</span>
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}
