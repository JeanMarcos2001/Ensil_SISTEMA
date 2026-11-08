/**
 * Repositorio del catálogo comercial sobre Supabase (tablas `programas`, `niveles`, `tipos_pago`, `tarifarios`, `promociones` y
 * `origenes_lead`). Solo traduce: filas ↔ modelo del sistema y errores de la base ↔ mensajes claros. Las reglas y el orden de las
 * operaciones viven en `utils/catalog.ts` y `services/catalog.ts`. La seguridad no está aquí: la deciden las políticas de la base según la
 * cuenta que inició sesión.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CatalogEntities, CatalogKind } from '../utils/catalog';
import { CATALOG_TABLES, byNumericId, catalogErrorMessage, isCatalogIdConflict } from '../utils/catalogDb';
import type { RepoResult } from './orgDirectory';
import type { CatalogRepository } from './catalog';

const failure = <T>(error: { code?: string; message?: string; details?: string } | null): RepoResult<T> =>
  ({ ok: false, error: catalogErrorMessage(error), idConflict: isCatalogIdConflict(error) });

/** Cuando una actualización o un borrado no toca ninguna fila, la política de seguridad la ocultó (o ya no existe). */
const NOT_TOUCHED = 'No se pudo completar: el registro ya no existe o su cuenta no tiene permiso para cambiarlo.';

type Anything = (row: never) => unknown;
const spec = (kind: CatalogKind) => CATALOG_TABLES[kind] as { table: string; fromRow: Anything; toRow: Anything };

export function createSupabaseCatalogRepository(client: SupabaseClient): CatalogRepository {
  return {
    async list<K extends CatalogKind>(kind: K): Promise<RepoResult<CatalogEntities[K][]>> {
      const t = spec(kind);
      const { data, error } = await client.from(t.table).select('*');
      if (error) return failure(error);
      return { ok: true, data: (data as never[]).map(r => t.fromRow(r) as CatalogEntities[K]).sort(byNumericId) };
    },
    async insert<K extends CatalogKind>(kind: K, entity: CatalogEntities[K]): Promise<RepoResult<CatalogEntities[K]>> {
      const t = spec(kind);
      const { data, error } = await client.from(t.table).insert(t.toRow(entity as never) as object).select().single();
      return error ? failure(error) : { ok: true, data: t.fromRow(data as never) as CatalogEntities[K] };
    },
    async update<K extends CatalogKind>(kind: K, entity: CatalogEntities[K]): Promise<RepoResult<CatalogEntities[K]>> {
      const t = spec(kind);
      const { id, ...row } = t.toRow(entity as never) as { id: string };
      const { data, error } = await client.from(t.table).update(row).eq('id', id).select();
      if (error) return failure(error);
      return data && data.length === 1 ? { ok: true, data: t.fromRow(data[0] as never) as CatalogEntities[K] } : { ok: false, error: NOT_TOUCHED };
    },
    async remove(kind: CatalogKind, id: string): Promise<RepoResult<null>> {
      const { data, error } = await client.from(spec(kind).table).delete().eq('id', id).select('id');
      if (error) return failure(error);
      return data && data.length === 1 ? { ok: true, data: null } : { ok: false, error: NOT_TOUCHED };
    },
  };
}
