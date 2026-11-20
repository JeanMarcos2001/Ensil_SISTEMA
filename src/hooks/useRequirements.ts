import { useCallback, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  createRequirement, loadRequirements, markRequirementSeen, moveRequirementToPacking, openRequirementReview, rejectRequirement, reviewRequirement,
  sendRequirementMessage, type RequirementResult, type RequirementsContext, type RequirementsData,
} from '../services/requirements';
import { createSupabaseRequirementsRepository } from '../services/requirementsRepository';
import type { Shipment } from '../context/DataContext';
import type { ItemRef, Requirement, RequirementDraft, RequirementMessage } from '../utils/requirements';

export interface RequirementsRefs {
  items: ItemRef[];
  shipments: Pick<Shipment, 'id' | 'requirementId' | 'status'>[];
  itemName: (id: string) => string;
}

const EMPTY: RequirementsData = { requirements: [], messages: [], seen: {} };

/**
 * Los requerimientos de las sedes guardados en la base de datos (migración 0031): los que la cuenta puede ver, sus mensajes y hasta dónde leyó cada uno.
 * No pasa por `AccessGate` (como los avisos): se lee cuando se abre Envíos o Recepciones y se mantiene al día con la actualización en vivo; una cuenta que no
 * puede ver requerimientos recibe una lista vacía. Después de CADA operación vuelve a leer de la base, así lo que se muestra es lo que de verdad quedó guardado.
 * Cada operación devuelve `{ ok, error }` (nunca lanza). Las reglas y el orden «validar → guardar» están en `services/requirements.ts`.
 */
export function useRequirements(refs: RequirementsRefs) {
  const repo = useMemo(() => createSupabaseRequirementsRepository(supabase), []);
  const [data, setData] = useState<RequirementsData>(EMPTY);

  // Las operaciones validan contra lo último que se vio (no contra la lista de cuando se creó la función)
  const dataRef = useRef(data); dataRef.current = data;
  const refsRef = useRef(refs); refsRef.current = refs;
  const context = (): RequirementsContext => ({
    requirements: dataRef.current.requirements, shipments: refsRef.current.shipments, items: refsRef.current.items, itemName: refsRef.current.itemName,
  });

  /** Vuelve a leer; si lo leído es igual a lo que ya se muestra no se cambia nada (no se vuelve a dibujar el tablero ni se reinicia el parpadeo). */
  const reload = useCallback(async () => {
    const res = await loadRequirements(repo);
    if (!res.ok || !res.value) return;
    const fresh = res.value;
    // También se actualiza la referencia al instante: la operación que sigue (guardar las cantidades y pasar a «Empacando») debe validar contra lo recién leído
    if (JSON.stringify(fresh) !== JSON.stringify(dataRef.current)) { dataRef.current = fresh; setData(fresh); }
  }, [repo]);

  const settle = useCallback(async (res: RequirementResult): Promise<RequirementResult> => {
    if (res.ok) await reload();
    return res;
  }, [reload]);

  const add = useCallback(async (draft: RequirementDraft) => settle(await createRequirement(repo, context(), draft)), [repo, settle]);
  const openReview = useCallback(async (id: string) => settle(await openRequirementReview(repo, context(), id)), [repo, settle]);
  const review = useCallback(async (id: string, sends: Record<string, number>, version?: number) => settle(await reviewRequirement(repo, context(), id, sends, version)), [repo, settle]);
  const reject = useCallback(async (id: string, reason: string, version?: number) => settle(await rejectRequirement(repo, context(), id, reason, version)), [repo, settle]);
  const moveToPacking = useCallback(async (id: string, version?: number) => settle(await moveRequirementToPacking(repo, context(), id, version)), [repo, settle]);
  const sendMessage = useCallback(async (id: string, text: string) => settle(await sendRequirementMessage(repo, context(), id, text)), [repo, settle]);
  const markSeen = useCallback(async (id: string) => {
    // La marca se ve al instante; la base la confirma
    const last = dataRef.current.messages.filter(m => m.requirementId === id).reduce((n, m) => Math.max(n, m.id), 0);
    if (last > (dataRef.current.seen[id] ?? 0)) {
      const next = { ...dataRef.current, seen: { ...dataRef.current.seen, [id]: last } };
      dataRef.current = next; setData(next);
    }
    return settle(await markRequirementSeen(repo, id));
  }, [repo, settle]);

  return {
    requirements: data.requirements as Requirement[], messages: data.messages as RequirementMessage[], seen: data.seen,
    reload, add, openReview, review, reject, moveToPacking, sendMessage, markSeen,
  };
}
