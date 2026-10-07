import React, { useState, useRef, useEffect } from 'react';
import { Bell, Check, Info, AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { useData, Notification } from '../../context/DataContext';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';

export function NotificationDropdown() {
  const { notifications, markNotificationAsRead, currentBranchId } = useData();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filteredNotifications = notifications.filter(n => 
    !n.branchId || n.branchId === 'all' || n.branchId === currentBranchId
  );

  const unreadCount = filteredNotifications.filter(n => !n.read).length;

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

  return (
    <div className="relative" ref={dropdownRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-text-secondary hover:bg-surface-muted rounded-full transition-colors"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-danger-text text-white text-[10px] font-bold rounded-full border-2 border-surface flex items-center justify-center">
            {unreadCount > 9 ? '+9' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-surface border border-border-soft rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="p-4 border-b border-border-soft flex items-center justify-between bg-surface-muted/30">
            <h3 className="font-semibold text-text-primary">Notificaciones</h3>
            {unreadCount > 0 && (
              <Badge variant="neutral" className="text-[10px]">{unreadCount} nuevas</Badge>
            )}
          </div>
          
          <div className="max-h-[400px] overflow-y-auto">
            {filteredNotifications.length === 0 ? (
              <div className="p-8 text-center">
                <div className="w-12 h-12 bg-surface-muted rounded-full flex items-center justify-center mx-auto mb-3">
                  <Bell size={20} className="text-text-muted" />
                </div>
                <p className="text-sm text-text-muted">No tienes notificaciones</p>
              </div>
            ) : (
              <div className="divide-y divide-border-soft">
                {filteredNotifications.map((notif) => (
                  <div 
                    key={notif.id}
                    className={`p-4 hover:bg-surface-muted/50 transition-colors cursor-pointer relative group ${!notif.read ? 'bg-primary-accent/5' : ''}`}
                    onClick={() => markNotificationAsRead(notif.id)}
                  >
                    <div className="flex gap-3">
                      <div className="mt-0.5 shrink-0">
                        {getIcon(notif.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start gap-2">
                          <p className={`text-sm leading-tight ${!notif.read ? 'font-semibold text-text-primary' : 'text-text-secondary'}`}>
                            {notif.title}
                          </p>
                          {!notif.read && (
                            <div className="w-2 h-2 bg-primary-accent rounded-full shrink-0 mt-1"></div>
                          )}
                        </div>
                        <p className="text-xs text-text-muted mt-1 line-clamp-2 leading-relaxed">
                          {notif.message}
                        </p>
                        <p className="text-[10px] text-text-muted mt-2">
                          {new Date(notif.date).toLocaleString('es-PE', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          {filteredNotifications.length > 0 && (
            <div className="p-3 border-t border-border-soft text-center bg-surface-muted/30">
              <button className="text-xs font-medium text-primary-accent hover:underline">
                Ver todas las notificaciones
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
