import React, { useState } from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useAuth } from '../../context/AuthContext';

/** Pantalla de ingreso con correo y contraseña (Supabase Auth). */
export function LoginPage() {
  const { signIn, requestReset, notice } = useAuth();
  const [resetting, setResetting] = useState(false);
  const [info, setInfo] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (resetting) { await sendReset(); return; }
    if (busy) return;
    setBusy(true);
    setError('');
    const result = await signIn(email, password);
    // Si entra, esta pantalla se reemplaza sola; si no, se muestra el motivo y se limpia la contraseña.
    if (!result.ok) { setError(result.error ?? 'No se pudo iniciar sesión.'); setPassword(''); }
    setBusy(false);
  };

  /** «Olvidé mi contraseña»: manda el enlace al correo escrito. */
  const sendReset = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    setInfo('');
    const result = await requestReset(email);
    if (result.ok) setInfo(result.message ?? ''); else setError(result.error ?? 'No se pudo enviar el enlace.');
    setBusy(false);
  };

  const message = error || notice;

  return (
    <div className="min-h-screen flex items-center justify-center bg-app-bg px-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-surface border border-border-soft rounded-2xl shadow-sm p-8 flex flex-col gap-5" aria-label="Iniciar sesión">
        <div className="flex flex-col items-center text-center gap-2">
          <div className="w-11 h-11 rounded-xl bg-primary-accent/10 flex items-center justify-center text-primary-accent"><Lock size={20} /></div>
          <h1 className="text-xl font-semibold text-text-primary">Sistema ENSIL</h1>
          <p className="text-sm text-text-secondary">Ingrese con su correo y contraseña.</p>
        </div>

        <label className="flex flex-col gap-1.5 text-sm font-medium text-text-primary">
          Correo
          <Input type="email" autoComplete="username" autoFocus value={email} onChange={e => { setEmail(e.target.value); setError(''); }} placeholder="correo@ensilperu.com" />
        </label>

        {!resetting && (
        <label className="flex flex-col gap-1.5 text-sm font-medium text-text-primary">
          Contraseña
          <div className="relative">
            <Input type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={e => { setPassword(e.target.value); setError(''); }} className="pr-10" />
            <button type="button" onClick={() => setShow(s => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-text-primary" aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </label>
        )}

        {message && <p className="text-sm text-danger-text bg-danger-tint rounded-lg px-3 py-2" role="alert">{message}</p>}

        {info && <p className="text-sm text-success-text bg-success-tint rounded-lg px-3 py-2" role="status">{info}</p>}

        {resetting
          ? <Button type="button" variant="primary" size="lg" disabled={busy} onClick={() => void sendReset()}>{busy ? 'Enviando…' : 'Enviarme el enlace'}</Button>
          : <Button type="submit" variant="primary" size="lg" disabled={busy}>{busy ? 'Ingresando…' : 'Ingresar'}</Button>}
        <button type="button" onClick={() => { setResetting(r => !r); setError(''); setInfo(''); }} className="text-xs text-text-muted hover:text-text-primary self-center">
          {resetting ? 'Volver a ingresar' : '¿Olvidó su contraseña?'}
        </button>
      </form>
    </div>
  );
}
