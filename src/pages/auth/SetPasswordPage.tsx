import React, { useState } from 'react';
import { Eye, EyeOff, KeyRound } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useAuth } from '../../context/AuthContext';
import { PASSWORD_MIN } from '../../utils/loginAccess';

/** Pantalla a la que llega quien abre el enlace de su invitación (o de «olvidé mi contraseña»): fija su contraseña y entra. */
export function SetPasswordPage() {
  const { sessionEmail, setPassword, signOut } = useAuth();
  const [password, setPasswordValue] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    const result = await setPassword(password, confirm);
    // Si se guarda, esta pantalla se reemplaza sola por el sistema
    if (!result.ok) { setError(result.error ?? 'No se pudo guardar la contraseña.'); setBusy(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-app-bg px-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-surface border border-border-soft rounded-2xl shadow-sm p-8 flex flex-col gap-5" aria-label="Fijar contraseña">
        <div className="flex flex-col items-center text-center gap-2">
          <div className="w-11 h-11 rounded-xl bg-primary-accent/10 flex items-center justify-center text-primary-accent"><KeyRound size={20} /></div>
          <h1 className="text-xl font-semibold text-text-primary">Fije su contraseña</h1>
          <p className="text-sm text-text-secondary">
            {sessionEmail ? <>Cuenta <strong className="text-text-primary font-medium">{sessionEmail}</strong>. </> : null}
            Con esta contraseña ingresará al sistema.
          </p>
        </div>

        <label className="flex flex-col gap-1.5 text-sm font-medium text-text-primary">
          Contraseña nueva
          <div className="relative">
            <Input type={show ? 'text' : 'password'} autoComplete="new-password" autoFocus value={password} onChange={e => { setPasswordValue(e.target.value); setError(''); }} className="pr-10" />
            <button type="button" onClick={() => setShow(s => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-text-primary" aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <span className="text-xs font-normal text-text-muted">Al menos {PASSWORD_MIN} caracteres, con letras y números.</span>
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-medium text-text-primary">
          Repita la contraseña
          <Input type={show ? 'text' : 'password'} autoComplete="new-password" value={confirm} onChange={e => { setConfirm(e.target.value); setError(''); }} />
        </label>

        {error && <p className="text-sm text-danger-text bg-danger-tint rounded-lg px-3 py-2" role="alert">{error}</p>}

        <Button type="submit" variant="primary" size="lg" disabled={busy}>{busy ? 'Guardando…' : 'Guardar y entrar'}</Button>
        <button type="button" onClick={() => void signOut()} className="text-xs text-text-muted hover:text-text-primary self-center">Cancelar y salir</button>
      </form>
    </div>
  );
}
