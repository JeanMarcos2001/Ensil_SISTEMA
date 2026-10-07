import React from 'react';
import { Bell, ChevronRight, Menu, Hexagon, MapPin, ChevronDown } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { NotificationDropdown } from './NotificationDropdown';

interface TopbarProps {
  title: string;
  breadcrumb: string[];
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
}

export function Topbar({ title, breadcrumb, isSidebarOpen, onToggleSidebar }: TopbarProps) {
  const { branches, currentBranchId, setCurrentBranchId, currentUser } = useData();
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
        {/* Branch Selector */}
        <div className="hidden lg:flex items-center gap-2 bg-surface-muted px-3 py-1.5 rounded-xl border border-border-soft">
          <MapPin size={14} className="text-primary-accent" />
          <select 
            value={currentBranchId}
            onChange={(e) => setCurrentBranchId(e.target.value)}
            className="bg-transparent text-xs font-semibold text-text-primary focus:outline-none cursor-pointer pr-2"
          >
            <option value="all">Vista Global</option>
            {branches.map(branch => (
              <option key={branch.id} value={branch.id}>{branch.name}</option>
            ))}
          </select>
        </div>

        <NotificationDropdown />
        <div className="h-8 w-px bg-border-soft"></div>
        <div className="flex items-center gap-3 cursor-pointer hover:bg-surface-muted p-1.5 pr-3 rounded-full transition-colors">
          <div className="w-8 h-8 rounded-full bg-primary-accent/10 flex items-center justify-center text-primary-accent font-semibold text-sm">
            {currentUser.name.substring(0, 2).toUpperCase()}
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-medium text-text-primary leading-none">{currentUser.name}</span>
            <span className="text-xs text-text-muted mt-1 leading-none">{currentBranch?.name || 'Vista Global'}</span>
          </div>
        </div>
      </div>
    </header>
  );
}
