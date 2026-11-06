import React, { type ReactNode } from 'react';
import { useAuth } from '../../context/AuthContext';
import { LoginPage } from '../../pages/auth/LoginPage';
import { SetPasswordPage } from '../../pages/auth/SetPasswordPage';

const screen = 'min-h-screen flex items-center justify-center bg-app-bg px-4 text-center';

/** Deja pasar al sistema solo con una cuenta admitida; mientras tanto muestra la verificación, el ingreso o el aviso de configuración. */
export function AuthGate({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  if (status === 'signedIn') return <>{children}</>;
  if (status === 'signedOut') return <LoginPage />;
  if (status === 'settingPassword') return <SetPasswordPage />;
  if (status === 'misconfigured') {
    return (
      <div className={screen}>
        <div className="max-w-md bg-surface border border-border-soft rounded-2xl p-8">
          <h1 className="text-lg font-semibold text-text-primary mb-2">Falta configurar el servidor</h1>
          <p className="text-sm text-text-secondary">
            No se encontraron <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code> en el archivo <code>.env.local</code>. Agréguelas y reinicie el sistema.
          </p>
        </div>
      </div>
    );
  }
  return <div className={screen} role="status"><p className="text-sm text-text-secondary">Verificando su sesión…</p></div>;
}
