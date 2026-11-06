import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Branch, Company, Warehouse } from '../context/DataContext';
import { supabase } from '../lib/supabase';
import {
  createBranch, createCompany, createWarehouse, editBranch, editCompany, editWarehouse, removeBranch, removeCompany, type OpResult,
} from '../services/orgDirectory';
import { createSupabaseOrgRepository } from '../services/orgRepository';
import { withCompanyNames } from '../utils/orgDirectory';

export type OrgDirectoryStatus = 'loading' | 'ready' | 'error';

/**
 * Empresas y Filiales guardadas en la base de datos: las carga al montarse (ya con sesión iniciada) y las mantiene al día con cada
 * operación. Las reglas y el orden «validar → guardar» están en `services/orgDirectory.ts`; aquí solo se guarda el estado de React.
 * Cada operación devuelve `{ ok, error }` como las demás acciones del contexto (nunca lanza).
 */
export function useOrgDirectory() {
  const repo = useMemo(() => createSupabaseOrgRepository(supabase), []);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [rawBranches, setRawBranches] = useState<Branch[]>([]);
  const [rawWarehouses, setRawWarehouses] = useState<Warehouse[]>([]);
  const [status, setStatus] = useState<OrgDirectoryStatus>('loading');
  const [error, setError] = useState('');

  // Las operaciones leen la lista vigente (no la de cuando se creó la función) para validar contra lo último que se vio.
  const companiesRef = useRef(companies);
  const branchesRef = useRef<Branch[]>([]);
  companiesRef.current = companies;
  const branches = useMemo(() => withCompanyNames(rawBranches, companies), [rawBranches, companies]);
  branchesRef.current = branches;
  const warehouses = useMemo(() => withCompanyNames(rawWarehouses, companies), [rawWarehouses, companies]);
  const warehousesRef = useRef<Warehouse[]>([]);
  warehousesRef.current = warehouses;
  /** Filiales y almacenes juntos: cualquiera con empresa impide inactivarla o eliminarla. */
  const linkedToCompany = () => [...branchesRef.current, ...warehousesRef.current];

  const reload = useCallback(async () => {
    setStatus('loading');
    setError('');
    const [c, b, w] = await Promise.all([repo.listCompanies(), repo.listBranches(), repo.listWarehouses()]);
    if (!c.ok || !b.ok || !w.ok) {
      setError(c.error ?? b.error ?? w.error ?? 'No se pudieron cargar las empresas, filiales y almacenes.');
      setStatus('error');
      return;
    }
    setCompanies(c.data ?? []);
    setRawBranches(b.data ?? []);
    setRawWarehouses(w.data ?? []);
    setStatus('ready');
  }, [repo]);

  useEffect(() => { void reload(); }, [reload]);

  const addCompany = useCallback(async (input: Omit<Company, 'id'>): Promise<OpResult<Company> & { id?: string }> => {
    const res = await createCompany(repo, companiesRef.current, input);
    if (res.ok && res.value) setCompanies(prev => [...prev, res.value!].sort((a, b) => a.id.localeCompare(b.id)));
    return { ...res, id: res.value?.id };
  }, [repo]);

  const updateCompany = useCallback(async (id: string, patch: Partial<Company>): Promise<OpResult<Company>> => {
    const res = await editCompany(repo, companiesRef.current, linkedToCompany(), id, patch);
    if (res.ok && res.value) setCompanies(prev => prev.map(c => (c.id === id ? res.value! : c)));
    return res;
  }, [repo]);

  const deleteCompany = useCallback(async (id: string): Promise<OpResult> => {
    const res = await removeCompany(repo, companiesRef.current, linkedToCompany(), id);
    if (res.ok) setCompanies(prev => prev.filter(c => c.id !== id));
    return res;
  }, [repo]);

  const addBranch = useCallback(async (input: Omit<Branch, 'id'>): Promise<OpResult<Branch> & { id?: string }> => {
    const res = await createBranch(repo, branchesRef.current, companiesRef.current, input);
    if (res.ok && res.value) setRawBranches(prev => [...prev, res.value!].sort((a, b) => a.id.localeCompare(b.id)));
    return { ...res, id: res.value?.id };
  }, [repo]);

  const updateBranch = useCallback(async (id: string, patch: Partial<Branch>): Promise<OpResult<Branch>> => {
    const res = await editBranch(repo, branchesRef.current, companiesRef.current, id, patch);
    if (res.ok && res.value) setRawBranches(prev => prev.map(b => (b.id === id ? res.value! : b)));
    return res;
  }, [repo]);

  const deleteBranch = useCallback(async (id: string): Promise<OpResult> => {
    const res = await removeBranch(repo, branchesRef.current, id);
    if (res.ok) setRawBranches(prev => prev.filter(b => b.id !== id));
    return res;
  }, [repo]);

  const addWarehouse = useCallback(async (input: Omit<Warehouse, 'id'>): Promise<OpResult<Warehouse> & { id?: string }> => {
    const res = await createWarehouse(repo, warehousesRef.current, companiesRef.current, input);
    if (res.ok && res.value) setRawWarehouses(prev => [...prev, res.value!].sort((a, b) => a.id.localeCompare(b.id)));
    return { ...res, id: res.value?.id };
  }, [repo]);

  const updateWarehouse = useCallback(async (id: string, patch: Partial<Omit<Warehouse, 'id'>>): Promise<OpResult<Warehouse>> => {
    const res = await editWarehouse(repo, warehousesRef.current, companiesRef.current, id, patch);
    if (res.ok && res.value) setRawWarehouses(prev => prev.map(w => (w.id === id ? res.value! : w)));
    return res;
  }, [repo]);

  return { companies, branches, warehouses, status, error, reload, addCompany, updateCompany, deleteCompany, addBranch, updateBranch, deleteBranch, addWarehouse, updateWarehouse };
}
