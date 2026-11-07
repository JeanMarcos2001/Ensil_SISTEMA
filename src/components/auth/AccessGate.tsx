import React, { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { loadAccess, type AccessData } from '../../services/accessRoles';
import { createSupabaseAccountsRepository } from '../../services/accountsRepository';
import { createSupabaseRolesRepository } from '../../services/accessRolesRepository';
import { loadOrgDirectory, type OrgDirectoryData } from '../../services/orgDirectory';
import { createSupabaseOrgRepository } from '../../services/orgRepository';
import { Button } from '../ui/Button';

const screen = 'min-h-screen flex items-center justify-center bg-app-bg px-4 text-center';

/**
 * Carga desde la base, ANTES de montar el sistema, los roles, sus funciones, las cuentas y las empresas, sedes y almacén: el menú, los
 * permisos y la sede que se ve dependen de ellos, así que no se puede mostrar nada hasta tenerlos. Entrega también el id de la cuenta con
 * la que se ingresó. Con un error de conexión se ofrece reintentar.
 */
export function AccessGate({ children }: { children: (access: AccessData, accountId: string, org: OrgDirectoryData) => ReactNode }) {
  const { account } = useAuth();
  const rolesRepo = useMemo(() => createSupabaseRolesRepository(supabase), []);
  const accountsRepo = useMemo(() => createSupabaseAccountsRepository(supabase), []);
  const orgRepo = useMemo(() => createSupabaseOrgRepository(supabase), []);
  const [loaded, setLoaded] = useState<{ access: AccessData; org: OrgDirectoryData } | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    const [res, org] = await Promise.all([loadAccess(rolesRepo, accountsRepo), loadOrgDirectory(orgRepo)]);
    if (!res.ok || !res.value) { setError(res.error ?? 'No se pudieron cargar los roles y las cuentas.'); return; }
    if (!org.ok || !org.value) { setError(org.error ?? 'No se pudieron cargar las empresas, sedes y almacenes.'); return; }
    if (account && !res.value.users.some(u => u.id === account.id)) { setError('No se encontró su cuenta entre las que el sistema puede mostrar: su rol puede haber cambiado. Vuelva a ingresar.'); return; }
    setLoaded({ access: res.value, org: org.value });
  }, [rolesRepo, accountsRepo, orgRepo, account]);

  useEffect(() => { void load(); }, [load]);

  if (loaded && account) return <>{children(loaded.access, account.id, loaded.org)}</>;
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
  return <div className={screen} role="status"><p className="text-sm text-text-secondary flex items-center gap-2"><Loader2 size={16} className="animate-spin" />Cargando roles, cuentas, empresas y sedes…</p></div>;
}
