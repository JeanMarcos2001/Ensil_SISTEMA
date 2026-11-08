/**
 * Operaciones del catálogo comercial sobre la base de datos (programas, niveles, tipos de pago, tarifarios, promociones y orígenes de
 * leads): validan con las reglas de `utils/catalog.ts` y luego guardan.
 *
 * Reciben el repositorio como parámetro (el de Supabase en el sistema, uno en memoria en `scripts/check-catalog-db.ts`), de modo que el
 * orden «validar → guardar → traducir el error» se puede comprobar sin conexión. Ninguna toca el estado de React: devuelven el registro
 * resultante y quien llama (el gancho `useCatalog`) lo aplica a su lista.
 */
import {
  CATALOG_LIST, CATALOG_NOUN, NO_LINKS, catalogDeletionError, catalogFieldErrors, firstError,
  type CatalogContext, type CatalogData, type CatalogEntities, type CatalogKind, type CatalogLinks,
} from '../utils/catalog';
import { nextNumericId } from '../utils/ids';
import type { OpResult, RepoResult } from './orgDirectory';

export interface CatalogRepository {
  list<K extends CatalogKind>(kind: K): Promise<RepoResult<CatalogEntities[K][]>>;
  insert<K extends CatalogKind>(kind: K, entity: CatalogEntities[K]): Promise<RepoResult<CatalogEntities[K]>>;
  /** Guarda la fila completa del registro (el id no cambia). */
  update<K extends CatalogKind>(kind: K, entity: CatalogEntities[K]): Promise<RepoResult<CatalogEntities[K]>>;
  remove(kind: CatalogKind, id: string): Promise<RepoResult<null>>;
}

const fail = (error: string): OpResult<never> => ({ ok: false, error });
const MAX_ID_ATTEMPTS = 3;
const KINDS: CatalogKind[] = ['program', 'level', 'paymentType', 'tariff', 'promotion', 'leadSource'];

/**
 * Lee de la base todo el catálogo comercial. Es la ÚNICA fuente de programas, niveles, tipos de pago, tarifarios, promociones y orígenes de
 * leads: se lee al iniciar sesión, antes de montar las pantallas (`AccessGate`), y lo que Oferta comercial cambie se aplica sobre esa lista.
 */
export async function loadCatalog(repo: CatalogRepository): Promise<OpResult<CatalogData>> {
  const [programs, levels, paymentTypes, tariffs, promotions, leadSources] = await Promise.all(KINDS.map(k => repo.list(k)));
  const failed = [programs, levels, paymentTypes, tariffs, promotions, leadSources].find(r => !r.ok);
  if (failed) return fail(failed.error ?? 'No se pudo cargar el catálogo comercial.');
  return {
    ok: true,
    value: {
      programs: programs.data as CatalogData['programs'], levels: levels.data as CatalogData['levels'],
      paymentTypes: paymentTypes.data as CatalogData['paymentTypes'], tariffs: tariffs.data as CatalogData['tariffs'],
      promotions: promotions.data as CatalogData['promotions'], leadSources: leadSources.data as CatalogData['leadSources'],
    },
  };
}

type Input<K extends CatalogKind> = Omit<CatalogEntities[K], 'id'>;

/** El id (un número correlativo) lo asigna el sistema; si dos personas crean a la vez, se reintenta con el siguiente. */
export async function createCatalogEntry<K extends CatalogKind>(
  repo: CatalogRepository, kind: K, ctx: CatalogContext, input: Input<K>,
): Promise<OpResult<CatalogEntities[K]>> {
  const problem = firstError(catalogFieldErrors(kind, input, ctx));
  if (problem) return fail(problem);
  const taken = (ctx[CATALOG_LIST[kind]] as { id: string }[]).map(x => x.id);
  for (let attempt = 0; attempt < MAX_ID_ATTEMPTS; attempt++) {
    const id = nextNumericId(taken);
    const res = await repo.insert(kind, { ...input, id } as CatalogEntities[K]);
    if (res.ok && res.data) return { ok: true, value: res.data };
    if (!res.idConflict) return fail(res.error ?? `No se pudo guardar el ${CATALOG_NOUN[kind]}.`);
    taken.push(id);
  }
  return fail(`No se pudo asignar un código al ${CATALOG_NOUN[kind]}. Intente de nuevo.`);
}

export async function editCatalogEntry<K extends CatalogKind>(
  repo: CatalogRepository, kind: K, ctx: CatalogContext, id: string, patch: Partial<Input<K>>,
): Promise<OpResult<CatalogEntities[K]>> {
  const current = (ctx[CATALOG_LIST[kind]] as CatalogEntities[K][]).find(x => x.id === id);
  if (!current) return fail(`No se encontró el ${CATALOG_NOUN[kind]}.`);
  const next = { ...current, ...patch, id } as CatalogEntities[K];
  const { id: _id, ...fields } = next;
  const problem = firstError(catalogFieldErrors(kind, fields as Input<K>, ctx, id));
  if (problem) return fail(problem);
  const res = await repo.update(kind, next);
  return res.ok && res.data ? { ok: true, value: res.data } : fail(res.error ?? `No se pudo guardar el ${CATALOG_NOUN[kind]}.`);
}

/** `links` = lo que sigue en memoria y apunta al catálogo (matrículas, recetas, grupos promocionales). */
export async function removeCatalogEntry(
  repo: CatalogRepository, kind: CatalogKind, ctx: CatalogContext, id: string, links: CatalogLinks = NO_LINKS,
): Promise<OpResult> {
  if (!(ctx[CATALOG_LIST[kind]] as { id: string }[]).some(x => x.id === id)) return fail(`No se encontró el ${CATALOG_NOUN[kind]}.`);
  const problem = catalogDeletionError(kind, id, ctx, links);
  if (problem) return fail(problem);
  const res = await repo.remove(kind, id);
  return res.ok ? { ok: true } : fail(res.error ?? `No se pudo eliminar el ${CATALOG_NOUN[kind]}.`);
}
