import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Lock, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { useData, type User } from '../../context/DataContext';
import { initials } from '../../utils/dashboard';

interface UserSwitcherProps {
  /** Con la sesión bloqueada no se puede cerrar: hay que entrar con el PIN de una cuenta. */
  locked: boolean;
  onClose: () => void;
}

const field = 'w-full h-11 bg-surface border border-border-soft rounded-xl px-3 text-center text-lg tracking-[0.5em] text-text-primary placeholder:text-text-muted placeholder:tracking-normal focus:outline-none focus:border-primary-accent focus:ring-1 focus:ring-primary-accent';

/**
 * Cambio rápido de usuario: se elige la cuenta y se entra con su PIN. Es el reemplazo del selector de sede de pruebas: cada persona
 * trabaja con su cuenta (y queda a su nombre lo que hace) sin cerrar y abrir sesión.
 */
export function UserSwitcher({ locked, onClose }: UserSwitcherProps) {
  const { users, currentUser, switchUser } = useData();
  const [picked, setPicked] = useState<User | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);

  const accounts = users.filter(u => u.status === 'Activo').sort((a, b) => a.name.localeCompare(b.name));

  useEffect(() => { if (picked) input.current?.focus(); }, [picked]);
  useEffect(() => {
    if (locked) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [locked, onClose]);

  const submit = () => {
    if (!picked) return;
    const result = switchUser(picked.id, pin);
    if (!result.ok) { setError(result.error ?? 'No se pudo entrar.'); setPin(''); input.current?.focus(); return; }
    setPin(''); setError(''); setPicked(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Cambiar de usuario">
      <div className="relative bg-surface rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-soft">
          <div className="flex items-center gap-2">
            {locked && <Lock size={16} className="text-text-muted" />}
            <h3 className="text-lg font-semibold text-text-primary">{picked ? `PIN de ${picked.name}` : locked ? 'Sesión bloqueada' : 'Cambiar de usuario'}</h3>
          </div>
          {!locked && (
            <button onClick={onClose} className="p-1.5 text-text-muted hover:text-text-primary hover:bg-surface-muted rounded-lg" aria-label="Cerrar">
              <X size={18} />
            </button>
          )}
        </div>

        {!picked ? (
          <div className="p-4 overflow-y-auto">
            <p className="text-sm text-text-secondary px-2 pb-3">
              {locked ? 'Elige tu cuenta para continuar.' : 'Elige la cuenta que va a trabajar. Lo que haga quedará a su nombre.'}
            </p>
            <ul className="flex flex-col gap-1">
              {accounts.map(u => {
                const noPin = !u.pinHash;
                const mine = u.id === currentUser.id;
                return (
                  <li key={u.id}>
                    <button
                      disabled={noPin}
                      onClick={() => { setPicked(u); setPin(''); setError(''); }}
                      className="w-full flex items-center gap-3 p-2.5 rounded-xl text-left transition-colors hover:bg-surface-muted disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                      title={noPin ? 'Sin PIN: pídale al Superusuario que se lo asigne.' : undefined}
                    >
                      <div className="w-9 h-9 rounded-full bg-primary-accent/10 flex items-center justify-center text-primary-accent font-semibold text-sm shrink-0">{initials(u.name)}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-text-primary truncate">{u.name}</p>
                        <p className="text-xs text-text-muted truncate">{u.role} · {u.branch}</p>
                      </div>
                      {mine && <Badge variant="info">En uso</Badge>}
                      {noPin && <Badge variant="neutral">Sin PIN</Badge>}
                    </button>
                  </li>
                );
              })}
              {accounts.length === 0 && <li className="text-sm text-text-muted px-2 py-6 text-center">No hay cuentas activas.</li>}
            </ul>
          </div>
        ) : (
          <form className="p-6 flex flex-col gap-4" onSubmit={e => { e.preventDefault(); submit(); }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary-accent/10 flex items-center justify-center text-primary-accent font-semibold shrink-0">{initials(picked.name)}</div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-text-primary truncate">{picked.name}</p>
                <p className="text-xs text-text-muted truncate">{picked.role} · {picked.branch}</p>
              </div>
            </div>
            <input
              ref={input}
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              placeholder="PIN"
              value={pin}
              onChange={e => { setPin(e.target.value.replace(/\D/g, '')); setError(''); }}
              className={field}
              aria-label="PIN"
            />
            {error && <p className="text-sm text-danger-text" role="alert">{error}</p>}
            <div className="flex justify-between gap-3">
              <Button type="button" variant="ghost" className="flex items-center gap-2" onClick={() => { setPicked(null); setPin(''); setError(''); }}>
                <ArrowLeft size={14} />
                Otra cuenta
              </Button>
              <Button type="submit" variant="primary" disabled={pin.length < 4}>Entrar</Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
