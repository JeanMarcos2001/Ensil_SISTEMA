import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Contract, PayrollRun } from '../context/DataContext';
import { supabase } from '../lib/supabase';
import {
  addPayrollAdjustment as addAdjustmentIn, closeContract as closeContractIn, closePayroll as closePayrollIn, createContract as createContractIn,
  deletePayrollDraft as deleteDraftIn, editContract as editContractIn, generatePayroll as generatePayrollIn, loadContractsPayroll,
  removePayrollAdjustment as removeAdjustmentIn, renewContract as renewContractIn, reopenPayroll as reopenPayrollIn,
  type AdjustmentInput, type ContractsContext,
} from '../services/contractsPayroll';
import { createSupabaseContractsPayrollRepository } from '../services/contractsPayrollRepository';
import type { OpResult } from '../services/orgDirectory';
import type { RenewalInput } from '../utils/contractRenewal';
import type { ContractForm } from '../utils/payroll';
import type { PayrollContext } from '../utils/payrollRun';

export type ContractsPayrollStatus = 'loading' | 'ready' | 'error';

/** Lo que el sistema aporta para validar un cambio (el personal, las empresas y la agenda no viven en este gancho). */
export type ContractsBase = Omit<ContractsContext, 'contracts' | 'runs'>;

/**
 * Contratos y Planilla guardados en la base de datos: los carga al montarse y, después de CADA operación, vuelven a leerse (se muestra lo que
 * de verdad quedó guardado: la base puede haber cambiado más cosas que la pantalla, como el estado de un contrato renovado). Las reglas y el
 * orden «validar → guardar» están en `services/contractsPayroll.ts`; aquí solo se guarda el estado de React.
 * Cada operación devuelve `{ ok, error }` como las demás acciones del contexto (nunca lanza).
 */
export function useContractsPayroll() {
  const repo = useMemo(() => createSupabaseContractsPayrollRepository(supabase), []);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [status, setStatus] = useState<ContractsPayrollStatus>('loading');
  const [error, setError] = useState('');

  // Las operaciones leen la lista vigente (no la de cuando se creó la función) para validar contra lo último que se vio.
  const contractsRef = useRef(contracts);
  const runsRef = useRef(runs);
  contractsRef.current = contracts;
  runsRef.current = runs;

  const reload = useCallback(async () => {
    setStatus('loading');
    setError('');
    const res = await loadContractsPayroll(repo);
    if (!res.ok || !res.value) {
      setError(res.error ?? 'No se pudieron cargar los contratos y las planillas.');
      setStatus('error');
      return;
    }
    setContracts(res.value.contracts);
    setRuns(res.value.runs);
    setStatus('ready');
  }, [repo]);

  useEffect(() => { void reload(); }, [reload]);

  /** Vuelve a leer sin mostrar «cargando» (después de una operación). Si falla, se conserva lo que había. */
  const refresh = useCallback(async () => {
    const res = await loadContractsPayroll(repo);
    if (res.ok && res.value) {
      setContracts(res.value.contracts);
      setRuns(res.value.runs);
    }
  }, [repo]);

  const after = useCallback(async <T,>(res: OpResult<T>): Promise<OpResult<T>> => {
    if (res.ok) await refresh();
    return res;
  }, [refresh]);

  const ctxOf = (base: ContractsBase): ContractsContext => ({ ...base, contracts: contractsRef.current, runs: runsRef.current });

  const createContract = useCallback((base: ContractsBase, form: ContractForm) => createContractIn(repo, ctxOf(base), form).then(after), [repo, after]);
  const editContract = useCallback((base: ContractsBase, id: string, form: ContractForm, reason: string) => editContractIn(repo, ctxOf(base), id, form, reason).then(after), [repo, after]);
  const closeContract = useCallback((base: ContractsBase, id: string, date: string, reason: string) => closeContractIn(repo, ctxOf(base), id, date, reason).then(after), [repo, after]);
  const renewContract = useCallback((base: ContractsBase, id: string, input: RenewalInput) => renewContractIn(repo, ctxOf(base), id, input).then(after), [repo, after]);

  const generatePayroll = useCallback(
    (companies: ContractsBase['companies'], companyId: string, period: string, today: string) => generatePayrollIn(repo, runsRef.current, companies, companyId, period, today).then(after),
    [repo, after],
  );
  const deletePayrollDraft = useCallback((runId: string) => deleteDraftIn(repo, runsRef.current, runId).then(after), [repo, after]);
  const addPayrollAdjustment = useCallback(
    (ctx: Omit<PayrollContext, 'runs'>, runId: string, input: AdjustmentInput, staffName: string) =>
      addAdjustmentIn(repo, { ...ctx, runs: runsRef.current }, runId, input, staffName).then(after),
    [repo, after],
  );
  const removePayrollAdjustment = useCallback((runId: string, adjustmentId: string) => removeAdjustmentIn(repo, runsRef.current, runId, adjustmentId).then(after), [repo, after]);
  const closePayroll = useCallback((ctx: Omit<PayrollContext, 'runs'>, runId: string, today: string) => closePayrollIn(repo, { ...ctx, runs: runsRef.current }, runId, today).then(after), [repo, after]);
  const reopenPayroll = useCallback((runId: string, reason: string) => reopenPayrollIn(repo, runsRef.current, runId, reason).then(after), [repo, after]);

  return {
    contracts, runs, status, error, reload,
    createContract, editContract, closeContract, renewContract,
    generatePayroll, deletePayrollDraft, addPayrollAdjustment, removePayrollAdjustment, closePayroll, reopenPayroll,
  };
}
