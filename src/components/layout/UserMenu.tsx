import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, KeyRound, Lock, Users as UsersIcon } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { UserSwitcher } from './UserSwitcher';

const input = 'w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent focus:ring-1 focus:ring-primary-accent';

/** Cada persona cambia su propio PIN: pide el actual (si tiene) y el nuevo dos veces. */
function ChangePinModal({ onClose }: { onClose: () => void }) {
  const { users, currentUser, changeOwnPin } = useData();
  const hasPin = !!users.find(u => u.id === currentUser.id)?.pinHash;
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const digits = (set: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => { set(e.target.value.replace(/\D/g, '')); setError(''); };

  const submit = () => {
    if (next !== again) { setError('El PIN nuevo y su confirmación no coinciden.'); return; }
    const result = changeOwnPin(current, next);
    if (!result.ok) { setError(result.error ?? 'No se pudo cambiar el PIN.'); return; }
    setDone(true);
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Cambiar mi PIN"
      size="sm"
      footer={
        <div className="flex justify-end gap-3 w-full">
          <Button variant="ghost" onClick={onClose}>{done ? 'Cerrar' : 'Cancelar'}</Button>
          {!done && <Button variant="primary" onClick={submit} disabled={next.length < 4 || again.length < 4 || (hasPin && current.length < 4)}>Guardar PIN</Button>}
        </div>
      }
    >
      {done ? (
        <p className="text-sm text-text-secondary">Listo: desde ahora entras con el PIN nuevo.</p>
      ) : (
        <form className="flex flex-col gap-3" onSubmit={e => { e.preventDefault(); submit(); }}>
          <p className="text-sm text-text-secondary">El PIN tiene de 4 a 6 números. Con él cambias de usuario sin cerrar la sesión de los demás.</p>
          {hasPin && <input type="password" inputMode="numeric" autoComplete="off" maxLength={6} placeholder="PIN actual" aria-label="PIN actual" value={current} onChange={digits(setCurrent)} className={input} />}
          <input type="password" inputMode="numeric" autoComplete="off" maxLength={6} placeholder="PIN nuevo" aria-label="PIN nuevo" value={next} onChange={digits(setNext)} className={input} />
          <input type="password" inputMode="numeric" autoComplete="off" maxLength={6} placeholder="Repite el PIN nuevo" aria-label="Repite el PIN nuevo" value={again} onChange={digits(setAgain)} className={input} />
          {error && <p className="text-sm text-danger-text" role="alert">{error}</p>}
        </form>
      )}
    </Modal>
  );
}

/** La cuenta con la que se trabaja: abre el cambio rápido de usuario, el cambio de PIN y el bloqueo de la sesión. */
export function UserMenu() {
  const { currentUser, currentBranchId, branches, lockSession } = useData();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [changingPin, setChangingPin] = useState(false);
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
          <button role="menuitem" className={item} onClick={() => { setOpen(false); setSwitching(true); }}>
            <UsersIcon size={15} className="text-text-muted" />Cambiar de usuario
          </button>
          <button role="menuitem" className={item} onClick={() => { setOpen(false); setChangingPin(true); }}>
            <KeyRound size={15} className="text-text-muted" />Cambiar mi PIN
          </button>
          <button role="menuitem" className={item} onClick={() => { setOpen(false); lockSession(); }}>
            <Lock size={15} className="text-text-muted" />Bloquear sesión
          </button>
        </div>
      )}

      {switching && <UserSwitcher locked={false} onClose={() => setSwitching(false)} />}
      {changingPin && <ChangePinModal onClose={() => setChangingPin(false)} />}
    </div>
  );
}
