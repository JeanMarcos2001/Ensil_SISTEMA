import React, { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { loadAccess, type AccessData } from '../../services/accessRoles';
import { createSupabaseAccountsRepository } from '../../services/accountsRepository';
import { createSupabaseRolesRepository } from '../../services/accessRolesRepository';
import { Button } from '../ui/Button';

const screen = 'min-h-screen flex items-center justify-center bg-app-bg px-4 text-center';

/**
 * Carga los roles, sus funciones y las cuentas desde la base ANTES de montar el sistema: el menú y los permisos dependen de ellos, así que
 * no se puede mostrar nada hasta tenerlos. Entrega también el id de la cuenta con la que se ingresó. Con un error de conexión se ofrece
 * reintentar.
 */
export function AccessGate({ children }: { children: (access: AccessData, accountId: string) => ReactNode }) {
  const { account } = useAuth();
  const rolesRepo = useMemo(() => createSupabaseRolesRepository(supabase), []);
  const accountsRepo = useMemo(() => createSupabaseAccountsRepository(supabase), []);
  const [access, setAccess] = useState<AccessData | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    const res = await loadAccess(rolesRepo, accountsRepo);
    if (!res.ok || !res.value) { setError(res.error ?? 'No se pudieron cargar los roles y las cuentas.'); return; }
    if (account && !res.value.users.some(u => u.id === account.id)) { setError('No se encontró su cuenta entre las que el sistema puede mostrar: su rol puede haber cambiado. Vuelva a ingresar.'); return; }
    setAccess(res.value);
  }, [rolesRepo, accountsRepo, account]);

  useEffect(() => { void load(); }, [load]);

  if (access && account) return <>{children(access, account.id)}</>;
  if (error) {
    return (
      <div className={screen}>
        <div className="max-w-md bg-surface border border-border-soft rounded-2xl p-8 flex flex-col gap-4 items-center">
          <h1 className="text-lg font-semibold text-text-primary">No se pudo cargar el sistema</h1>
          <p className="text-sm text-text-secondary" role="alert">{error}</p>
          <Button variant="primary" onClick={() => void load()}>Reintentar</Button>
        </div>
      </div>
    );
  }
  return <div className={screen} role="status"><p className="text-sm text-text-secondary flex items-center gap-2"><Loader2 size={16} className="animate-spin" />Cargando roles, permisos y cuentas…</p></div>;
}
