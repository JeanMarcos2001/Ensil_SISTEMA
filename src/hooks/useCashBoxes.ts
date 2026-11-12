import { useCallback, useMemo, useRef, useState } from 'react';
import type { CashClosure, CashMovement, PettyCashMovement } from '../context/DataContext';
import { supabase } from '../lib/supabase';
import {
  addPettyMovement, closeCashBox, reopenCashBox, reversePettyMovement, savePettyFund, type CashBoxesContext, type CashBoxesData,
} from '../services/cashBoxes';
import { createSupabaseCashBoxesRepository } from '../services/cashBoxesRepository';
import type { OpResult } from '../services/orgDirectory';
import type { ClosureInput } from '../utils/cashClosure';
import type { PettyFund, PettyInput } from '../utils/pettyCash';
import { todayLocalISO } from '../utils/schedule';

/**
 * Cierres de caja y caja chica guardados en la base de datos (cada sede cierra su caja y tiene su fondo): arranca con lo que `AccessGate` leyó al iniciar
 * sesión y, después de CADA operación, vuelve a leer de la base, así lo que se muestra es lo que de verdad quedó guardado (con el saldo esperado que
 * calculó la base y los códigos que asignó). Las reglas y el orden «validar → guardar» están en `services/cashBoxes.ts`; aquí solo se guarda el estado de
 * React. Cada operación devuelve `{ ok, error }` como las demás acciones del contexto (nunca lanza).
 */
export function useCashBoxes(initial: CashBoxesData, cashMovements: CashMovement[]) {
  const repo = useMemo(() => createSupabaseCashBoxesRepository(supabase), []);
  const [closures, setClosures] = useState<CashClosure[]>(initial.closures);
  const [pettyMovements, setPettyMovements] = useState<PettyCashMovement[]>(initial.pettyMovements);
  const [pettyFunds, setPettyFunds] = useState<Record<string, PettyFund>>(initial.pettyFunds);

  // Las operaciones validan contra lo último que se vio (no contra la lista de cuando se creó la función).
  const closuresRef = useRef(closures); closuresRef.current = closures;
  const pettyRef = useRef(pettyMovements); pettyRef.current = pettyMovements;
  const fundsRef = useRef(pettyFunds); fundsRef.current = pettyFunds;
  const cashRef = useRef(cashMovements); cashRef.current = cashMovements;
  const context = (): CashBoxesContext => ({
    closures: closuresRef.current, pettyMovements: pettyRef.current, pettyFunds: fundsRef.current, cashMovements: cashRef.current, today: todayLocalISO(),
  });

  /** Vuelve a leer todo (son pocas filas por sede). Si la lectura falla, se queda lo que había: la operación ya se guardó. */
  const refresh = useCallback(async () => {
    const res = await repo.loadAll();
    if (!res.ok || !res.data) return;
    setClosures(res.data.closures); setPettyMovements(res.data.pettyMovements); setPettyFunds(res.data.pettyFunds);
  }, [repo]);

  const settle = useCallback(async <T,>(res: OpResult<T>): Promise<OpResult<T>> => {
    if (res.ok) await refresh();
    return res;
  }, [refresh]);

  const close = useCallback(async (input: ClosureInput): Promise<OpResult<{ id: string }>> => settle(await closeCashBox(repo, context(), input)), [repo, settle]);
  const reopen = useCallback(async (closureId: string, reason: string): Promise<OpResult> => settle(await reopenCashBox(repo, context(), closureId, reason)), [repo, settle]);
  const saveFund = useCallback(async (branchId: string, input: { assigned: string; maxExpense: string }): Promise<OpResult> => settle(await savePettyFund(repo, branchId, input)), [repo, settle]);
  const addPetty = useCallback(async (branchId: string, input: PettyInput): Promise<OpResult> => settle(await addPettyMovement(repo, context(), branchId, input)), [repo, settle]);
  const reversePetty = useCallback(async (id: string, input: { reason: string; detail: string }): Promise<OpResult> => settle(await reversePettyMovement(repo, context(), id, input)), [repo, settle]);

  return { closures, pettyMovements, pettyFunds, refresh, close, reopen, saveFund, addPetty, reversePetty };
}
