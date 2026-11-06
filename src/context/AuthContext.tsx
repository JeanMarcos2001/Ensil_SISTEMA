import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { initialAuthHash } from '../lib/authHash';
import { supabase, supabaseConfigured } from '../lib/supabase';
import {
  RESET_SENT, admitAccount, authErrorMessage, loginInputError, normalizeEmail, parseAuthHash, passwordError, type LoginAccount, type LoginAccountRow,
} from '../utils/loginAccess';

/**
 * Inicio de sesión real (Supabase Auth). Va POR FUERA de `DataProvider`: sin cuenta admitida el sistema ni se monta.
 * Cerrar sesión desmonta el sistema y los datos de ejemplo (que siguen en memoria) vuelven a empezar, igual que al recargar.
 *
 * Quien llega desde el enlace de una invitación (o de «olvidé mi contraseña») ya trae una sesión, pero antes de entrar debe fijar su
 * contraseña: estado `settingPassword`.
 */
export type AuthStatus = 'checking' | 'misconfigured' | 'signedOut' | 'settingPassword' | 'signedIn';

interface AuthContextType {
  status: AuthStatus;
  /** La cuenta admitida (solo con `status === 'signedIn'`). */
  account: LoginAccount | null;
  /** El correo de la sesión abierta con el enlace del correo (para mostrarlo al fijar la contraseña). */
  sessionEmail: string;
  /** Por qué no se pudo entrar (cuenta inactiva, enlace vencido…), para mostrarlo en la pantalla de ingreso. */
  notice: string;
  signIn: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  signOut: () => Promise<void>;
  /** «Olvidé mi contraseña»: manda el enlace por correo. Responde lo mismo exista o no la cuenta. */
  requestReset: (email: string) => Promise<{ ok: boolean; message?: string; error?: string }>;
  /** Fija la contraseña de quien llegó desde el enlace del correo. */
  setPassword: (password: string, confirm: string) => Promise<{ ok: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [link] = useState(() => parseAuthHash(initialAuthHash));
  // `undefined` = todavía no se sabe si hay sesión guardada en el navegador.
  const [session, setSession] = useState<Session | null | undefined>(supabaseConfigured ? undefined : null);
  const [account, setAccount] = useState<LoginAccount | null>(null);
  const [checkedFor, setCheckedFor] = useState<string | null>(null);
  const [notice, setNotice] = useState(link.kind === 'error' ? link.error ?? '' : '');
  const [mustSetPassword, setMustSetPassword] = useState(link.kind === 'invite' || link.kind === 'recovery');

  // Solo se guarda la sesión en el estado: no se llama a otras funciones de Supabase dentro del aviso (puede bloquearse).
  useEffect(() => {
    if (!supabaseConfigured) return;
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => { if (!cancelled) setSession(data.session); });
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === 'PASSWORD_RECOVERY') setMustSetPassword(true);
      setSession(next);
    });
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, []);

  // Con sesión de Auth (y la contraseña ya fijada), se lee la fila de `cuentas` (la política solo deja ver la propia) y se decide si pasa.
  const userId = session?.user.id ?? null;
  useEffect(() => {
    if (!userId || mustSetPassword) { setAccount(null); setCheckedFor(null); return; }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('cuentas')
        .select('id, nombre, correo, estado, rol_id, roles(estado, es_sistema)')
        .eq('id', userId)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        setNotice('No se pudo leer su cuenta. Revise su internet e intente de nuevo.');
        await supabase.auth.signOut();
        return;
      }
      const admission = admitAccount((data as unknown as LoginAccountRow | null) ?? null);
      if (!admission.ok) {
        setNotice(admission.error ?? '');
        await supabase.auth.signOut();
        return;
      }
      setNotice('');
      setAccount(admission.account ?? null);
      setCheckedFor(userId);
      // Anota el último acceso (si falla no importa: no se avisa)
      void supabase.functions.invoke('usuarios', { body: { accion: 'ingreso' } }).catch(() => undefined);
    })();
    return () => { cancelled = true; };
  }, [userId, mustSetPassword]);

  const signIn = useCallback<AuthContextType['signIn']>(async (email, password) => {
    const problem = loginInputError(email, password);
    if (problem) return { ok: false, error: problem };
    setNotice('');
    const { error } = await supabase.auth.signInWithPassword({ email: normalizeEmail(email), password });
    if (error) return { ok: false, error: authErrorMessage(error.message, error.status) };
    return { ok: true };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const requestReset = useCallback<AuthContextType['requestReset']>(async email => {
    const problem = loginInputError(email, 'x');
    if (problem) return { ok: false, error: problem };
    const { error } = await supabase.auth.resetPasswordForEmail(normalizeEmail(email), { redirectTo: window.location.origin });
    // Un límite de envíos sí se avisa; cualquier otro resultado responde igual, exista o no la cuenta
    if (error && (error.status === 429 || /rate limit/i.test(error.message))) return { ok: false, error: authErrorMessage(error.message, error.status) };
    return { ok: true, message: RESET_SENT };
  }, []);

  const setPassword = useCallback<AuthContextType['setPassword']>(async (password, confirm) => {
    const problem = passwordError(password, confirm, session?.user.email ?? '');
    if (problem) return { ok: false, error: problem };
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      const text = error.message.toLowerCase();
      if (text.includes('same') && text.includes('password')) return { ok: false, error: 'La contraseña nueva debe ser distinta de la anterior.' };
      if (text.includes('weak') || text.includes('pwned') || text.includes('compromised') || text.includes('easy to guess')) return { ok: false, error: 'Esa contraseña es muy común o apareció en filtraciones: elija otra.' };
      return { ok: false, error: authErrorMessage(error.message, error.status) };
    }
    // La dirección ya no necesita el enlace: se limpia y se sigue al sistema
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    setMustSetPassword(false);
    return { ok: true };
  }, [session]);

  const status: AuthStatus = !supabaseConfigured ? 'misconfigured'
    : session === undefined ? 'checking'
    : !session ? 'signedOut'
    : mustSetPassword ? 'settingPassword'
    : account && checkedFor === session.user.id ? 'signedIn'
    : 'checking';

  const value = useMemo(
    () => ({ status, account: status === 'signedIn' ? account : null, sessionEmail: session?.user.email ?? '', notice, signIn, signOut, requestReset, setPassword }),
    [status, account, session, notice, signIn, signOut, requestReset, setPassword],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
