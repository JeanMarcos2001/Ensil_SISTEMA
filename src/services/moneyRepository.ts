/**
 * Repositorio del dinero sobre Supabase (tablas `matriculas`, `planes`, `cuotas`, `pagos`, `movimientos_caja`, `notas_credito` y
 * `grupos_promocionales`, y la función `aplicar_cambios_matricula`). Solo traduce: filas ↔ modelo del sistema y errores de la base ↔ mensajes claros.
 * Las reglas viven en `src/utils` y el orden de las operaciones en `services/money.ts`. La seguridad no está aquí: la deciden las políticas (por sede)
 * y la función de la base según la cuenta que inició sesión.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  moneyErrorMessage, numberOfCode, type GrupoRow, type MatriculaRow, type MoneyRows, type MovimientoRow, type NotaRow, type PagoRow, type PlanRow,
} from '../utils/moneyDb';
import type { RepoResult } from './orgDirectory';
import type { MoneyRepository } from './money';

type DbError = { code?: string; message?: string; details?: string };
const failure = <T>(error: DbError | null): RepoResult<T> => ({ ok: false, error: moneyErrorMessage(error) });

const PAGE = 1000;

/** Lee TODA una tabla de a mil filas (la API entrega mil por vez) en un orden estable. `columns` permite traer las cuotas dentro de cada plan. */
async function fetchAll<T>(client: SupabaseClient, table: string, order: string, columns = '*'): Promise<{ data: T[]; error: null } | { data: null; error: DbError }> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client.from(table).select(columns).order(order).range(from, from + PAGE - 1);
    if (error) return { data: null, error };
    out.push(...((data ?? []) as unknown as T[]));
    if (!data || data.length < PAGE) return { data: out, error: null };
  }
}

/** Lee solo estas filas (en tandas, para no armar una dirección demasiado larga). */
async function fetchByIds<T>(client: SupabaseClient, table: string, ids: string[], columns = '*'): Promise<{ data: T[]; error: null } | { data: null; error: DbError }> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await client.from(table).select(columns).in('id', ids.slice(i, i + 100));
    if (error) return { data: null, error };
    out.push(...((data ?? []) as unknown as T[]));
  }
  return { data: out, error: null };
}

const PLAN_WITH_QUOTAS = '*, cuotas(*)';
const byCode = <T extends { id: string }>(list: T[]): T[] => [...list].sort((a, b) => numberOfCode(a.id) - numberOfCode(b.id));

export function createSupabaseMoneyRepository(client: SupabaseClient): MoneyRepository {
  return {
    async list(): Promise<RepoResult<MoneyRows>> {
      const [m, p, pa, mo, n, g] = await Promise.all([
        fetchAll<MatriculaRow>(client, 'matriculas', 'id'),
        fetchAll<PlanRow>(client, 'planes', 'id', PLAN_WITH_QUOTAS),
        fetchAll<PagoRow>(client, 'pagos', 'id'),
        fetchAll<MovimientoRow>(client, 'movimientos_caja', 'id'),
        fetchAll<NotaRow>(client, 'notas_credito', 'id'),
        fetchAll<GrupoRow>(client, 'grupos_promocionales', 'id'),
      ]);
      const error = m.error ?? p.error ?? pa.error ?? mo.error ?? n.error ?? g.error;
      if (error) return failure(error);
      return {
        ok: true,
        data: {
          matriculas: m.data as MatriculaRow[], planes: p.data as PlanRow[], pagos: byCode(pa.data as PagoRow[]), movimientos: byCode(mo.data as MovimientoRow[]),
          notas: byCode(n.data as NotaRow[]), grupos: g.data as GrupoRow[],
        },
      };
    },
    async fetch(touched): Promise<RepoResult<MoneyRows>> {
      const [m, p, pa, mo, n, g] = await Promise.all([
        fetchByIds<MatriculaRow>(client, 'matriculas', touched.matriculas),
        fetchByIds<PlanRow>(client, 'planes', touched.planes, PLAN_WITH_QUOTAS),
        fetchByIds<PagoRow>(client, 'pagos', touched.pagos),
        fetchByIds<MovimientoRow>(client, 'movimientos_caja', touched.movimientos),
        fetchByIds<NotaRow>(client, 'notas_credito', touched.notas),
        fetchByIds<GrupoRow>(client, 'grupos_promocionales', touched.grupos),
      ]);
      const error = m.error ?? p.error ?? pa.error ?? mo.error ?? n.error ?? g.error;
      if (error) return failure(error);
      return {
        ok: true,
        data: { matriculas: m.data as MatriculaRow[], planes: p.data as PlanRow[], pagos: pa.data as PagoRow[], movimientos: mo.data as MovimientoRow[], notas: n.data as NotaRow[], grupos: g.data as GrupoRow[] },
      };
    },
    async apply(action, payload): Promise<RepoResult<null>> {
      const { error } = await client.rpc('aplicar_cambios_matricula', { p_accion: action, p: payload });
      return error ? failure(error) : { ok: true, data: null };
    },
  };
}
