import { useCallback, useMemo, useRef, useState } from 'react';
import type { Branch } from '../context/DataContext';
import { supabase } from '../lib/supabase';
import {
  CATALOG_LIST, NO_LINKS, type CatalogContext, type CatalogData, type CatalogEntities, type CatalogKind, type CatalogLinks,
} from '../utils/catalog';
import { byNumericId } from '../utils/catalogDb';
import { createCatalogEntry, editCatalogEntry, loadCatalog, removeCatalogEntry } from '../services/catalog';
import { createSupabaseCatalogRepository } from '../services/catalogRepository';
import type { OpResult } from '../services/orgDirectory';

/**
 * Catálogo comercial guardado en la base de datos (programas, niveles, tipos de pago, tarifarios, promociones y orígenes de leads): arranca
 * con lo que `AccessGate` leyó al iniciar sesión y se mantiene al día con cada operación. Las reglas y el orden «validar → guardar» están en
 * `services/catalog.ts`; aquí solo se guarda el estado de React. Cada operación devuelve `{ ok, error }` como las demás acciones del
 * contexto (nunca lanza). `reload` vuelve a leer la base (si algo quedó a medias).
 */
export function useCatalog(initial: CatalogData, branches: Pick<Branch, 'id' | 'name'>[]) {
  const repo = useMemo(() => createSupabaseCatalogRepository(supabase), []);
  const [data, setData] = useState<CatalogData>(initial);

  // Las operaciones validan contra lo último que se vio (no contra la lista de cuando se creó la función).
  const dataRef = useRef(data);
  dataRef.current = data;
  const branchesRef = useRef(branches);
  branchesRef.current = branches;
  const context = (): CatalogContext => ({ ...dataRef.current, branches: branchesRef.current });

  const apply = useCallback((kind: CatalogKind, change: (list: { id: string }[]) => { id: string }[]) => {
    setData(prev => {
      const key = CATALOG_LIST[kind];
      return { ...prev, [key]: change(prev[key] as { id: string }[]).sort(byNumericId) } as CatalogData;
    });
  }, []);

  const reload = useCallback(async (): Promise<OpResult> => {
    const res = await loadCatalog(repo);
    if (!res.ok || !res.value) return { ok: false, error: res.error ?? 'No se pudo cargar el catálogo comercial.' };
    setData(res.value);
    return { ok: true };
  }, [repo]);

  const add = useCallback(async <K extends CatalogKind>(kind: K, input: Omit<CatalogEntities[K], 'id'>): Promise<OpResult<CatalogEntities[K]>> => {
    const res = await createCatalogEntry(repo, kind, context(), input);
    if (res.ok && res.value) apply(kind, list => [...list, res.value as { id: string }]);
    return res;
  }, [repo, apply]);

  const edit = useCallback(async <K extends CatalogKind>(kind: K, id: string, patch: Partial<Omit<CatalogEntities[K], 'id'>>): Promise<OpResult<CatalogEntities[K]>> => {
    const res = await editCatalogEntry(repo, kind, context(), id, patch);
    if (res.ok && res.value) apply(kind, list => list.map(x => (x.id === id ? (res.value as { id: string }) : x)));
    return res;
  }, [repo, apply]);

  const remove = useCallback(async (kind: CatalogKind, id: string, links: CatalogLinks = NO_LINKS): Promise<OpResult> => {
    const res = await removeCatalogEntry(repo, kind, context(), id, links);
    if (res.ok) apply(kind, list => list.filter(x => x.id !== id));
    return res;
  }, [repo, apply]);

  return { ...data, reload, add, edit, remove };
}
