import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';

/** La cuenta con la que se trabaja: muestra quién ingresó, su rol y su sede, y permite cerrar la sesión. */
export function UserMenu() {
  const { currentUser, currentBranchId, branches } = useData();
  const { account, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  const place = branches.find(b => b.id === currentBranchId)?.name ?? (currentBranchId === 'all' ? 'Vista global' : '—');
  const item = 'w-full flex items-center gap-2.5 px-3 py-2 text-sm text-text-secondary hover:bg-surface-muted hover:text-text-primary rounded-lg text-left';

  return (
    <div className="relative" ref={box}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-3 hover:bg-surface-muted p-1.5 pr-3 rounded-full transition-colors"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <div className="w-8 h-8 rounded-full bg-primary-accent/10 flex items-center justify-center text-primary-accent font-semibold text-sm">
          {currentUser.name.substring(0, 2).toUpperCase()}
        </div>
        <div className="flex flex-col text-left">
          <span className="text-sm font-medium text-text-primary leading-none">{currentUser.name}</span>
          <span className="text-xs text-text-muted mt-1 leading-none">{currentUser.role} · {place}</span>
        </div>
        <ChevronDown size={14} className="text-text-muted" />
      </button>

      {open && (
        <div role="menu" className="absolute right-0 top-full mt-2 w-60 bg-surface border border-border-soft rounded-xl shadow-lg p-1.5 z-40">
          {account && <p className="px-3 pt-1 pb-0.5 text-xs text-text-muted truncate" title={account.email}>Ingresó como {account.email}</p>}
          <button role="menuitem" className={item} onClick={() => { setOpen(false); void signOut(); }}>
            <LogOut size={15} className="text-text-muted" />Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}
