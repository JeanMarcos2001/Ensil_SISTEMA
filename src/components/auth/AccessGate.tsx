import React, { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { loadAccess, type AccessData } from '../../services/accessRoles';
import { createSupabaseAccountsRepository } from '../../services/accountsRepository';
import { createSupabaseRolesRepository } from '../../services/accessRolesRepository';
import { loadCatalog } from '../../services/catalog';
import { loadItemCatalog, type ItemCatalogData } from '../../services/itemCatalog';
import { loadLogistics, type LogisticsData } from '../../services/logistics';
import { loadPeople, type PeopleData } from '../../services/people';
import { createSupabasePeopleRepository } from '../../services/peopleRepository';
import { createSupabaseLogisticsRepository } from '../../services/logisticsRepository';
import { createSupabaseItemCatalogRepository } from '../../services/itemCatalogRepository';
import { createSupabaseCatalogRepository } from '../../services/catalogRepository';
import { loadOrgDirectory, type OrgDirectoryData } from '../../services/orgDirectory';
import { createSupabaseOrgRepository } from '../../services/orgRepository';
import type { CatalogData } from '../../utils/catalog';
import { Button } from '../ui/Button';

const screen = 'min-h-screen flex items-center justify-center bg-app-bg px-4 text-center';

/**
 * Carga desde la base, ANTES de montar el sistema, los roles, sus funciones, las cuentas, las empresas, sedes y almacén, y el catálogo
 * comercial (programas, niveles, tipos de pago, tarifarios, promociones y orígenes de leads), los artículos con sus precios y recetas y Logística
 * (stock, kardex, ajustes, envíos y transferencias) y los titulares y alumnos: el
 * menú, los permisos, la sede que se ve, la matrícula y la verificación de materiales dependen de ellos, así que no se puede mostrar nada hasta tenerlos. Entrega también el id de la cuenta con la que se ingresó.
 * Con un error de conexión se ofrece reintentar.
 */
export function AccessGate({ children }: { children: (access: AccessData, accountId: string, org: OrgDirectoryData, catalog: CatalogData, itemCatalog: ItemCatalogData, logistics: LogisticsData, people: PeopleData) => ReactNode }) {
  const { account } = useAuth();
  const rolesRepo = useMemo(() => createSupabaseRolesRepository(supabase), []);
  const accountsRepo = useMemo(() => createSupabaseAccountsRepository(supabase), []);
  const orgRepo = useMemo(() => createSupabaseOrgRepository(supabase), []);
  const catalogRepo = useMemo(() => createSupabaseCatalogRepository(supabase), []);
  const itemRepo = useMemo(() => createSupabaseItemCatalogRepository(supabase), []);
  const logisticsRepo = useMemo(() => createSupabaseLogisticsRepository(supabase), []);
  const peopleRepo = useMemo(() => createSupabasePeopleRepository(supabase), []);
  const [loaded, setLoaded] = useState<{ access: AccessData; org: OrgDirectoryData; catalog: CatalogData; items: ItemCatalogData; logistics: LogisticsData; people: PeopleData } | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    const [res, org, catalog, items, logistics, people] = await Promise.all([loadAccess(rolesRepo, accountsRepo), loadOrgDirectory(orgRepo), loadCatalog(catalogRepo), loadItemCatalog(itemRepo), loadLogistics(logisticsRepo), loadPeople(peopleRepo)]);
    if (!res.ok || !res.value) { setError(res.error ?? 'No se pudieron cargar los roles y las cuentas.'); return; }
    if (!org.ok || !org.value) { setError(org.error ?? 'No se pudieron cargar las empresas, sedes y almacenes.'); return; }
    if (!catalog.ok || !catalog.value) { setError(catalog.error ?? 'No se pudo cargar el catálogo comercial.'); return; }
    if (!items.ok || !items.value) { setError(items.error ?? 'No se pudieron cargar los artículos y las recetas.'); return; }
    if (!logistics.ok || !logistics.value) { setError(logistics.error ?? 'No se pudo cargar Logística (stock, kardex, envíos y transferencias).'); return; }
    if (!people.ok || !people.value) { setError(people.error ?? 'No se pudieron cargar los titulares y los alumnos.'); return; }
    if (account && !res.value.users.some(u => u.id === account.id)) { setError('No se encontró su cuenta entre las que el sistema puede mostrar: su rol puede haber cambiado. Vuelva a ingresar.'); return; }
    setLoaded({ access: res.value, org: org.value, catalog: catalog.value, items: items.value, logistics: logistics.value, people: people.value });
  }, [rolesRepo, accountsRepo, orgRepo, catalogRepo, itemRepo, logisticsRepo, peopleRepo, account]);

  useEffect(() => { void load(); }, [load]);

  if (loaded && account) return <>{children(loaded.access, account.id, loaded.org, loaded.catalog, loaded.items, loaded.logistics, loaded.people)}</>;
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
  return <div className={screen} role="status"><p className="text-sm text-text-secondary flex items-center gap-2"><Loader2 size={16} className="animate-spin" />Cargando roles, cuentas, sedes, catálogo, artículos, stock y personas…</p></div>;
}
