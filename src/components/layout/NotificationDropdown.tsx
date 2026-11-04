import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Info, AlertTriangle, CheckCircle2, X, ChevronRight } from 'lucide-react';
import { useData, Notification } from '../../context/DataContext';
import { Badge } from '../ui/Badge';

/**
 * Campana del encabezado. Muestra solo lo que le corresponde al usuario actual:
 *  - Alertas: las que dispara una regla (cuotas vencidas, materiales pendientes, contratos por vencer, stock bajo el mínimo); se calculan y
 *    desaparecen solas cuando se corrige la causa. Un clic lleva a la pantalla donde se resuelven.
 *  - Avisos: lo que hizo alguien (un envío despachado, una solicitud pendiente, una reversa…); cada usuario los marca leídos por su cuenta.
 */
export function NotificationDropdown() {
  const { myNotifications, myAlerts, markNotificationAsRead } = useData();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const unreadNotices = myNotifications.filter(n => !n.read);
  const unreadCount = unreadNotices.length + myAlerts.length;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getIcon = (type: Notification['type']) => {
    switch (type) {
      case 'success': return <CheckCircle2 size={16} className="text-success-text" />;
      case 'warning': return <AlertTriangle size={16} className="text-warning-text" />;
      case 'danger': return <X size={16} className="text-danger-text" />;
      default: return <Info size={16} className="text-info-text" />;
    }
  };

  const empty = myNotifications.length === 0 && myAlerts.length === 0;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-text-secondary hover:bg-surface-muted rounded-full transition-colors"
        aria-label="Notificaciones"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-danger-text text-white text-[10px] font-bold rounded-full border-2 border-surface flex items-center justify-center">
            {unreadCount > 9 ? '+9' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 bg-surface border border-border-soft rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="p-4 border-b border-border-soft flex items-center justify-between bg-surface-muted/30">
            <h3 className="font-semibold text-text-primary">Notificaciones</h3>
            {unreadCount > 0 && (
              <Badge variant="neutral" className="text-[10px]">{unreadCount} nuevas</Badge>
            )}
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {empty ? (
              <div className="p-8 text-center">
                <div className="w-12 h-12 bg-surface-muted rounded-full flex items-center justify-center mx-auto mb-3">
                  <Bell size={20} className="text-text-muted" />
                </div>
                <p className="text-sm text-text-muted">No tienes notificaciones</p>
              </div>
            ) : (
              <>
                {myAlerts.length > 0 && (
                  <div>
                    <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted">Alertas por resolver</p>
                    <div className="divide-y divide-border-soft">
                      {myAlerts.map(alert => (
                        <button
                          key={alert.key}
                          type="button"
                          onClick={() => { navigate(alert.link); setIsOpen(false); }}
                          className="w-full text-left p-4 hover:bg-surface-muted/50 transition-colors flex gap-3 items-start"
                        >
                          <div className="mt-0.5 shrink-0">{getIcon(alert.type)}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm leading-tight font-semibold text-text-primary">{alert.title}</p>
                            <p className="text-xs text-text-muted mt-1 leading-relaxed">{alert.message}</p>
                          </div>
                          <ChevronRight size={16} className="text-text-muted shrink-0 mt-0.5" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {myNotifications.length > 0 && (
                  <div>
                    <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted">Avisos</p>
                    <div className="divide-y divide-border-soft">
                      {myNotifications.map(notif => (
                        <div
                          key={notif.id}
                          className={`p-4 hover:bg-surface-muted/50 transition-colors cursor-pointer relative group ${!notif.read ? 'bg-primary-accent/5' : ''}`}
                          onClick={() => markNotificationAsRead(notif.id)}
                        >
                          <div className="flex gap-3">
                            <div className="mt-0.5 shrink-0">{getIcon(notif.type)}</div>
                            <div className="flex-1 min-w-0">
                              <div className="flex justify-between items-start gap-2">
                                <p className={`text-sm leading-tight ${!notif.read ? 'font-semibold text-text-primary' : 'text-text-secondary'}`}>{notif.title}</p>
                                {!notif.read && <div className="w-2 h-2 bg-primary-accent rounded-full shrink-0 mt-1"></div>}
                              </div>
                              <p className="text-xs text-text-muted mt-1 line-clamp-2 leading-relaxed">{notif.message}</p>
                              <p className="text-[10px] text-text-muted mt-2">
                                {new Date(notif.date).toLocaleString('es-PE', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })}
                                {notif.viaFallback && <span className="ml-2 text-warning-text">Te llega porque nadie más podía recibirlo</span>}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {myNotifications.length > 0 && (
            <div className="p-3 border-t border-border-soft text-center bg-surface-muted/30">
              <button
                className="text-xs font-medium text-primary-accent hover:underline disabled:text-text-muted disabled:no-underline disabled:cursor-default"
                disabled={unreadNotices.length === 0}
                onClick={() => unreadNotices.forEach(n => markNotificationAsRead(n.id))}
              >
                {unreadNotices.length === 0 ? 'No hay avisos nuevos' : 'Marcar todos los avisos como leídos'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
