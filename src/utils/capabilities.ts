/**
 * Funciones y roles (reglas puras sobre `capabilityRegistry.ts`).
 *
 * - Catálogo de permisos derivado del registro (lo que muestra Organización → Permisos).
 * - Un rol es un conjunto de funciones: al marcar una se marcan solas las que necesita (`roleClosure`) y no se puede quitar una
 *   que otra marcada necesita (`removalBlockers`).
 * - Advertencias de separación de funciones (`roleWarnings`).
 * - Contrapartes: lo que otra persona debe poder hacer para que la función tenga sentido (`availability`).
 * - Mapa de conexiones de una función (`connectionsOf`).
 */
import type { Branch, Permission, Role, User } from '../context/DataContext';
import { SUPERUSER } from './authority';
import {
  CATALOG_MODULES, ENTITIES, EVENTS, FUNCTIONALITIES, INCOMPATIBILITIES,
  type CapabilityDef, type EventDef, type FunctionalityDef, type IncompatibilityDef,
} from './capabilityRegistry';

export const ALL_CAPABILITIES: CapabilityDef[] = FUNCTIONALITIES.flatMap(f => f.capabilities);
const BY_ID = new Map(ALL_CAPABILITIES.map(c => [c.id, c]));

export const capabilityById = (id: string): CapabilityDef | undefined => BY_ID.get(id);
export const isKnownCapability = (id: string): boolean => BY_ID.has(id);
export const eventById = (id: string): EventDef | undefined => EVENTS.find(e => e.id === id);

// ------------------------------------------------------------------------------------------------------------------ Catálogo

export interface CatalogAction { id: string; label: string }
export interface CatalogFunctionality { id: string; name: string; actions: CatalogAction[] }
export interface CatalogModule { id: string; name: string; functionalities: CatalogFunctionality[] }

/** El catálogo de permisos agrupado por módulo y funcionalidad. Las funciones reservadas no se ofrecen salvo que se pidan. */
export function permissionCatalog(opts: { includeReserved?: boolean } = {}): CatalogModule[] {
  return CATALOG_MODULES
    .map(m => ({
      id: m.id,
      name: m.name,
      functionalities: FUNCTIONALITIES
        .filter(f => f.module === m.id)
        .map((f: FunctionalityDef) => ({
          id: f.id,
          name: f.name,
          actions: f.capabilities.filter(c => opts.includeReserved || !c.reserved).map(c => ({ id: c.action, label: c.label })),
        }))
        .filter(f => f.actions.length > 0),
    }))
    .filter(m => m.functionalities.length > 0);
}

// ------------------------------------------------------------------------------------------------------------------ Dependencias de un rol

/** Todo lo que necesita una función, directa o indirectamente (sin incluirla). */
export function requiredBy(id: string): string[] {
  const out = new Set<string>();
  const walk = (cid: string) => {
    for (const r of capabilityById(cid)?.requires ?? []) {
      if (!out.has(r)) { out.add(r); walk(r); }
    }
  };
  walk(id);
  return [...out];
}

/** El conjunto elegido más todo lo que necesita. `added` son las funciones que se marcaron solas. Los permisos desconocidos se conservan tal cual. */
export function roleClosure(selected: Iterable<string>): { all: string[]; added: string[] } {
  const chosen = new Set(selected);
  const all = new Set(chosen);
  for (const id of chosen) for (const r of requiredBy(id)) all.add(r);
  return { all: [...all], added: [...all].filter(id => !chosen.has(id)) };
}

/** Funciones marcadas que necesitan a `id` y por eso no permiten quitarla. Vacío = se puede quitar. */
export function removalBlockers(id: string, selected: Iterable<string>): string[] {
  return [...selected].filter(other => other !== id && requiredBy(other).includes(id));
}

/** Marca o desmarca una función respetando las dependencias: al marcar suma lo que necesita; al desmarcar rechaza si otra marcada la necesita. */
export function toggleCapability(selected: Iterable<string>, id: string): { selected: string[]; blockedBy?: string[]; added?: string[] } {
  const current = new Set(selected);
  if (current.has(id)) {
    const blockedBy = removalBlockers(id, current);
    if (blockedBy.length > 0) return { selected: [...current], blockedBy };
    current.delete(id);
    return { selected: [...current] };
  }
  current.add(id);
  const { all, added } = roleClosure(current);
  return { selected: all, added };
}

// ------------------------------------------------------------------------------------------------------------------ Advertencias

/** Combinaciones de funciones que el rol reúne y que conviene separar. */
export function roleWarnings(selected: Iterable<string>): IncompatibilityDef[] {
  const have = new Set(selected);
  return INCOMPATIBILITIES.filter(rule => rule.capabilities.every(c => have.has(c)));
}

// ------------------------------------------------------------------------------------------------------------------ Contrapartes

/** Una persona con cuenta activa y lo que puede hacer, lista para buscar contrapartes. */
export interface Holder {
  id: string;
  name: string;
  branchIds: string[];
  allBranches: boolean;
  capabilities: Set<string>;
}

export interface HolderSources {
  users: Pick<User, 'id' | 'name' | 'role' | 'branch' | 'additionalBranches' | 'status'>[];
  roles: Pick<Role, 'id' | 'name' | 'status'>[];
  permissions: Permission[];
  branches: Pick<Branch, 'id' | 'name'>[];
}

/**
 * Las personas con cuenta activa y rol activo, con sus funciones y sedes. El Superusuario no cuenta como contraparte (es un rol técnico):
 * si fuera el único «receptor», nunca se notaría que falta crear al verdadero.
 */
export function buildHolders(src: HolderSources, opts: { includeSuperuser?: boolean } = {}): Holder[] {
  const branchIdOf = (name: string) => src.branches.find(b => b.name === name)?.id;
  const holders: Holder[] = [];
  for (const u of src.users) {
    if (u.status !== 'Activo') continue;
    if (u.role === SUPERUSER) {
      // Como en `can()`: el Superusuario puede todo y en todas las sedes, haya o no un rol con ese nombre.
      if (opts.includeSuperuser) holders.push({ id: u.id, name: u.name, branchIds: [], allBranches: true, capabilities: new Set(ALL_CAPABILITIES.map(c => c.id)) });
      continue;
    }
    const role = src.roles.find(r => r.name === u.role && r.status === 'Activo');
    if (!role) continue;
    const capabilities = new Set(src.permissions.find(p => p.roleId === role.id)?.permissions ?? []);
    const names = [u.branch, ...(u.additionalBranches ?? [])];
    holders.push({
      id: u.id,
      name: u.name,
      branchIds: names.map(branchIdOf).filter((x): x is string => !!x),
      allBranches: capabilities.has('org-alcance:all_branches'),
      capabilities,
    });
  }
  return holders;
}

/** Las personas que tienen la función y alcanzan la sede (o cualquiera, si no se indica sede). */
export function holdersWith(capabilityId: string, holders: Holder[], branchId?: string): Holder[] {
  return holders.filter(h => h.capabilities.has(capabilityId) && (!branchId || h.allBranches || h.branchIds.includes(branchId)));
}

export interface Availability {
  available: boolean;
  /** Por qué no se ofrece (solo si `available` es falso). */
  reason?: string;
  /** Avisos que no impiden hacerlo (contrapartes recomendadas que nadie cubre). */
  advisories: string[];
}

/**
 * ¿Se ofrece esta función? Depende de sus contrapartes: si una obligatoria no la cubre nadie en la sede que corresponde, no se ofrece y se
 * explica por qué; las recomendadas solo avisan. `target` es la sede destino o la misma sede, según la función.
 */
export function availability(capabilityId: string, holders: Holder[], target?: { branchId: string; branchName: string }): Availability {
  const cap = capabilityById(capabilityId);
  const advisories: string[] = [];
  let blocked: string | undefined;
  for (const cps of cap?.counterparts ?? []) {
    const needsBranch = cps.where !== 'any';
    if (needsBranch && !target) continue;
    if (holdersWith(cps.capability, holders, needsBranch ? target!.branchId : undefined).length > 0) continue;
    const need = capabilityById(cps.capability)?.label ?? cps.capability;
    const place = needsBranch ? ` en ${target!.branchName}` : '';
    const message = `Nadie tiene «${need}»${place}. ${cps.why}`;
    if (cps.strength === 'required') blocked ??= message;
    else advisories.push(message);
  }
  return blocked ? { available: false, reason: blocked, advisories } : { available: true, advisories };
}

// ------------------------------------------------------------------------------------------------------------------ Mapa de conexiones

export interface Connections {
  capability: CapabilityDef;
  /** Lo que necesita el mismo usuario (directo e indirecto). */
  requires: CapabilityDef[];
  /** Lo que otras funciones necesitan de esta. */
  neededBy: CapabilityDef[];
  /** Las funciones que debe tener otra persona. */
  counterparts: { capability: CapabilityDef; where: string; strength: 'required' | 'advisory'; why: string }[];
  /** Las funciones para las que esta es la contraparte. */
  counterpartOf: CapabilityDef[];
  reads: string[];
  writes: string[];
  events: EventDef[];
  /** Avisos que esta función recibe (es destinataria). */
  receives: EventDef[];
}

const entityLabel = (id: string) => ENTITIES[id] ?? id;

export function connectionsOf(id: string): Connections | undefined {
  const capability = capabilityById(id);
  if (!capability) return undefined;
  return {
    capability,
    requires: requiredBy(id).map(capabilityById).filter((c): c is CapabilityDef => !!c),
    neededBy: ALL_CAPABILITIES.filter(c => c.id !== id && requiredBy(c.id).includes(id)),
    counterparts: capability.counterparts.flatMap(x => {
      const target = capabilityById(x.capability);
      return target ? [{ capability: target, where: x.where, strength: x.strength, why: x.why }] : [];
    }),
    counterpartOf: ALL_CAPABILITIES.filter(c => c.counterparts.some(x => x.capability === id)),
    reads: capability.reads.map(entityLabel),
    writes: capability.writes.map(entityLabel),
    events: capability.emits.map(eventById).filter((e): e is EventDef => !!e),
    receives: EVENTS.filter(e => e.recipients.some(r => 'capability' in r && r.capability === id)),
  };
}

/** Ítems de menú → función que los hace visibles. */
export function menuCapabilities(): { module: string; item: string; capability: string }[] {
  return ALL_CAPABILITIES.filter(c => c.menu).map(c => ({ module: c.menu!.module, item: c.menu!.item, capability: c.id }));
}
