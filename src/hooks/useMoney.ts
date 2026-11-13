import { useCallback, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { applyMoney, loadMoney } from '../services/money';
import { createSupabaseMoneyRepository } from '../services/moneyRepository';
import type { OpResult } from '../services/orgDirectory';
import {
  mergeMoneyRows, moneyStateFromRows, sortMoneyState, type EnrollmentLists, type MoneyAction, type MoneyRows, type MoneyState, type StockOp,
} from '../utils/moneyDb';

/**
 * Matrículas, planes, cuotas, pagos, caja, notas de crédito y grupos promocionales guardados en la base de datos: arranca con lo que `AccessGate` leyó
 * al iniciar sesión y se mantiene al día con cada operación (después de guardar se vuelven a leer las filas tocadas, así se muestra lo que de verdad
 * quedó). Las pantallas y las reglas ven el estado con los nombres derivados (alumno, programa, sede…): salen de las listas al mostrar, nunca se guardan.
 *
 * Cada acción del contexto pide un borrador (`draft`), lo cambia con las reglas puras de siempre y lo entrega con `commit(acción, borrador)`: la base lo
 * aplica todo o nada, con la función del registro de esa acción. Si falla, el estado no cambia y se devuelve el motivo (nunca lanza).
 * Los registros nuevos llevan códigos de BORRADOR (`utils/draftIds.ts`): la base asigna los definitivos y `commit` devuelve `codes` («borrador → código real»).
 */
export function useMoney(initial: MoneyRows, lists: EnrollmentLists, onStockMoved?: () => void | Promise<void>) {
  const repo = useMemo(() => createSupabaseMoneyRepository(supabase), []);
  const [rows, setRows] = useState<MoneyRows>(initial);
  const rowsRef = useRef(rows); rowsRef.current = rows;

  const { students, programs, levels, branches, staff, leadSources, paymentTypes, tariffs } = lists;
  const state: MoneyState = useMemo(
    () => sortMoneyState(moneyStateFromRows(rows, { students, programs, levels, branches, staff, leadSources, paymentTypes, tariffs })),
    [rows, students, programs, levels, branches, staff, leadSources, paymentTypes, tariffs],
  );
  const stateRef = useRef(state); stateRef.current = state;
  const listsRef = useRef(lists); listsRef.current = lists;

  const reload = useCallback(async (): Promise<OpResult> => {
    const res = await loadMoney(repo);
    if (!res.ok || !res.value) return { ok: false, error: res.error };
    rowsRef.current = res.value; setRows(res.value);
    return { ok: true };
  }, [repo]);

  /** Una copia del estado de ahora para cambiarla (las listas son nuevas; las filas que no se toquen conservan su referencia). */
  const draft = useCallback((): MoneyState => ({ ...stateRef.current }), []);

  /**
   * Guarda lo que cambió entre el estado de ahora y el borrador, con la acción dada y los movimientos de stock que la acción pida (los aplica la misma
   * llamada de la base). Devuelve el estado como quedó guardado (para que quien llama siga trabajando con él).
   */
  const commit = useCallback(async (action: MoneyAction, next: MoneyState, stock: StockOp[] = []): Promise<OpResult<MoneyState> & { codes?: Record<string, string> }> => {
    const res = await applyMoney(repo, action, stateRef.current, next, stock);
    if (!res.ok || !res.value) return { ok: false, error: res.error };
    const merged = mergeMoneyRows(rowsRef.current, res.value.fresh);
    rowsRef.current = merged;
    stateRef.current = sortMoneyState(moneyStateFromRows(merged, listsRef.current));
    setRows(merged);
    if (stock.length > 0 && onStockMoved) await onStockMoved();
    // `codes` = «borrador → código real» de lo que la base asignó: quien usó borradores fuera del dinero (la agenda, los avisos) los traduce con ella
    return { ok: true, value: stateRef.current, codes: res.value.codes };
  }, [repo, onStockMoved]);

  return { ...state, reload, draft, commit };
}
