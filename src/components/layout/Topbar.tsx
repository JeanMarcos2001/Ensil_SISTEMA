import React from 'react';
import { ChevronRight, Menu, Hexagon, MapPin } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { NotificationDropdown } from './NotificationDropdown';
import { UserMenu } from './UserMenu';
import { viewOptions } from '../../utils/session';

interface TopbarProps {
  title: string;
  breadcrumb: string[];
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
}

export function Topbar({ title, breadcrumb, isSidebarOpen, onToggleSidebar }: TopbarProps) {
  const { branches, currentBranchId, selectBranch, sessionScope, can } = useData();
  // La sede que se ve sale de la cuenta: quien alcanza una sola no elige; quien alcanza varias elige solo entre las suyas
  const options = viewOptions(sessionScope, branches);
  const currentBranch = branches.find(b => b.id === currentBranchId);

  return (
    <header className="h-[64px] bg-surface flex items-center justify-between px-4 md:px-6 shrink-0 z-30 relative">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3 w-[240px]">
          <div className="w-8 h-8 bg-primary-accent text-white rounded-lg flex items-center justify-center shadow-sm">
            <Hexagon size={20} fill="currentColor" className="text-primary-accent-foreground" />
          </div>
          <span className="font-bold text-lg text-text-primary tracking-tight">ENSIL</span>
          <button 
            onClick={onToggleSidebar}
            className="ml-auto p-1.5 text-text-secondary hover:bg-surface-muted rounded-lg transition-colors"
          >
            <Menu size={20} />
          </button>
        </div>
        
        <div className="hidden md:flex flex-col justify-center pl-4">
          <div className="flex items-center gap-1.5 text-xs text-text-muted mb-0.5">
            {breadcrumb.map((item, idx) => (
              <React.Fragment key={idx}>
                <span className="hover:text-text-primary cursor-pointer transition-colors">{item}</span>
                {idx < breadcrumb.length - 1 && <ChevronRight size={12} />}
              </React.Fragment>
            ))}
          </div>
          <h1 className="text-lg font-semibold text-text-primary leading-tight">{title}</h1>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {/* Sede que se ve (sale de la cuenta) */}
        <div className="hidden lg:flex items-center gap-2 bg-surface-muted px-3 py-1.5 rounded-xl border border-border-soft">
          <MapPin size={14} className="text-primary-accent" />
          {options.length > 0 ? (
            <select
              value={currentBranchId}
              onChange={(e) => selectBranch(e.target.value)}
              className="bg-transparent text-xs font-semibold text-text-primary focus:outline-none cursor-pointer pr-2"
              aria-label="Sede que se ve"
            >
              {options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          ) : (
            <span className="text-xs font-semibold text-text-primary pr-2">{currentBranch?.name ?? 'Sin sede'}</span>
          )}
        </div>

        {can('sis-avisos:view') && <NotificationDropdown />}
        <div className="h-8 w-px bg-border-soft"></div>
        <UserMenu />
      </div>
    </header>
  );
}
