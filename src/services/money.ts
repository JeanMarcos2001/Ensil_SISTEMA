/**
 * Operaciones del dinero (matrículas, planes, cuotas, pagos, caja, notas de crédito y grupos promocionales) sobre la base de datos.
 *
 * «El cliente calcula, la base guarda y vigila»: cada acción del contexto calcula el estado nuevo con las reglas puras de siempre y aquí se compara
 * con el de antes (`diffMoney`); solo viajan las filas nuevas y las columnas que cambiaron, en UNA llamada (`aplicar_cambios_matricula`) que la base
 * aplica todo o nada, con la función del registro de esa acción, y vuelve a comprobar los invariantes del dinero. Después se vuelve a leer lo tocado:
 * se muestra lo que de verdad quedó guardado.
 *
 * Recibe el repositorio como parámetro (el de Supabase en el sistema, uno en memoria en `scripts/check-money-db.ts`).
 */
import { replaceDraftIds } from '../utils/draftIds';
import {
  diffMoney, emptyMoneyRows, type MoneyAction, type MoneyPayload, type MoneyRows, type MoneyState, type MoneyTouched, type StockOp,
} from '../utils/moneyDb';
import type { OpResult, RepoResult } from './orgDirectory';

export interface MoneyRepository {
  list(): Promise<RepoResult<MoneyRows>>;
  /** Vuelve a leer solo estas filas (un plan trae sus cuotas). */
  fetch(touched: MoneyTouched): Promise<RepoResult<MoneyRows>>;
  /**
   * Aplica los cambios de una acción, todo o nada. La base asigna el código definitivo de cada registro nuevo (la pantalla manda borradores,
   * `utils/draftIds.ts`) y devuelve la lista «borrador → código real».
   */
  apply(action: MoneyAction, payload: MoneyPayload): Promise<RepoResult<{ codes: Record<string, string> }>>;
}

const fail = (error: string): OpResult<never> => ({ ok: false, error });

/** Lee de la base todo el dinero que la cuenta puede ver. Se lee al iniciar sesión (`AccessGate`), antes de montar las pantallas. */
export async function loadMoney(repo: MoneyRepository): Promise<OpResult<MoneyRows>> {
  const res = await repo.list();
  return res.ok && res.data ? { ok: true, value: res.data } : fail(res.error ?? 'No se pudieron cargar las matrículas y los pagos.');
}

export interface MoneyApplied {
  fresh: MoneyRows; touched: MoneyTouched;
  /** «Borrador → código real» de lo que la base asignó (vacío si no había registros nuevos). */
  codes: Record<string, string>;
}

/**
 * Guarda lo que cambió entre `before` y `after` con la acción dada (más los movimientos de stock que la acción pida) y devuelve las filas tal como
 * quedaron. Los registros nuevos viajan con códigos de borrador: la base asigna los definitivos y aquí se traducen los códigos de lo tocado antes de
 * volver a leerlo. Si no hay nada que guardar, devuelve ok sin llamar a la base.
 */
export async function applyMoney(
  repo: MoneyRepository, action: MoneyAction, before: MoneyState, after: MoneyState, stock: StockOp[] = [],
): Promise<OpResult<MoneyApplied>> {
  const diff = diffMoney(before, after, stock);
  if (diff.error) return fail(diff.error);
  if (diff.empty) return { ok: true, value: { fresh: emptyMoneyRows(), touched: diff.touched, codes: {} } };
  const saved = await repo.apply(action, diff.payload);
  if (!saved.ok) return fail(saved.error ?? 'No se pudo guardar.');
  const codes = saved.data?.codes ?? {};
  const touched = replaceDraftIds(diff.touched, codes);
  const fresh = await repo.fetch(touched);
  if (!fresh.ok || !fresh.data) return fail('Se guardó, pero no se pudo volver a leer. Actualice la pantalla para ver lo que quedó.');
  return { ok: true, value: { fresh: fresh.data, touched, codes } };
}
