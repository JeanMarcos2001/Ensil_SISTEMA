/**
 * Roles y funciones guardados en la base de datos (paso 10): traducción entre el modelo del sistema (`Role`, `Permission`) y las tablas
 * `roles` y `rol_funciones`.
 *
 * - La base es la única fuente de los roles y de sus funciones: el navegador ya no los guarda (solo las cuentas, provisionalmente).
 * - El rol del sistema (Superusuario) no guarda funciones en la base porque puede todo; en el sistema se le muestran todas las que
 *   existen (como siempre), calculadas aquí.
 * - Lo que se lee de la base se trata como no confiable: una función que ya no existe en el código, o que es reservada, no se carga;
 *   un motivo de combinación mal formado se ignora.
 */
import type { Permission, Role } from '../context/DataContext';
import { capabilityById, isKnownCapability } from './capabilities';
import type { AcceptedRisk } from './roleBuilder';
import { templateById, templatePermissions } from './roleTemplates';

export interface RolRow {
  id: string;
  nombre: string;
  descripcion: string;
  estado: string;
  plantilla_id: string | null;
  observaciones: string | null;
  limite_cuentas_por_sede: number | null;
  es_sistema: boolean;
  riesgos_aceptados: unknown;
}

export interface RolFuncionRow { rol_id: string; funcion_id: string }

const orNull = (v: string | undefined): string | null => {
  const t = (v ?? '').trim();
  return t ? t : null;
};

/** ¿La función existe en el código y se puede dar? (las reservadas todavía no). */
export const isGrantable = (id: string): boolean => isKnownCapability(id) && !capabilityById(id)?.reserved;

/** Lee los motivos de combinaciones aceptadas; ignora lo que no tenga la forma exacta. */
export function readAcceptedRisks(v: unknown): AcceptedRisk[] {
  if (!Array.isArray(v)) return [];
  const out: AcceptedRisk[] = [];
  for (const x of v) {
    if (typeof x !== 'object' || x === null) continue;
    const { ruleId, reason, by, at } = x as Record<string, unknown>;
    if (typeof ruleId === 'string' && typeof reason === 'string' && typeof by === 'string' && typeof at === 'string') out.push({ ruleId, reason, by, at });
  }
  return out;
}

export function roleFromRow(r: RolRow): Role {
  const risks = readAcceptedRisks(r.riesgos_aceptados);
  const limit = r.limite_cuentas_por_sede;
  return {
    id: r.id, name: r.nombre, desc: r.descripcion ?? '', status: r.estado === 'Inactivo' ? 'Inactivo' : 'Activo',
    templateId: r.plantilla_id ?? undefined, observations: r.observaciones ?? undefined,
    branchUserLimit: typeof limit === 'number' ? limit : undefined,
    locked: r.es_sistema ? true : undefined,
    acceptedRisks: risks.length > 0 ? risks : undefined,
  };
}

/** Un rol creado desde el sistema nunca es del sistema: esa marca solo la pone la migración que crea al Superusuario. */
export const roleToRow = (r: Role): RolRow => ({
  id: r.id, nombre: r.name.trim(), descripcion: (r.desc ?? '').trim(), estado: r.status, plantilla_id: r.templateId ?? null,
  observaciones: orNull(r.observations), limite_cuentas_por_sede: r.branchUserLimit ?? null, es_sistema: false, riesgos_aceptados: r.acceptedRisks ?? [],
});

/** Solo los campos que vienen en el cambio; quitar un valor opcional (`undefined` presente) lo deja en blanco. */
export function rolePatchToRow(p: Partial<Role>): Partial<RolRow> {
  const row: Partial<RolRow> = {};
  if (p.name !== undefined) row.nombre = p.name.trim();
  if (p.desc !== undefined) row.descripcion = p.desc.trim();
  if (p.status !== undefined) row.estado = p.status;
  if ('templateId' in p) row.plantilla_id = p.templateId ?? null;
  if ('observations' in p) row.observaciones = orNull(p.observations);
  if ('branchUserLimit' in p) row.limite_cuentas_por_sede = p.branchUserLimit ?? null;
  if ('acceptedRisks' in p) row.riesgos_aceptados = p.acceptedRisks ?? [];
  return row;
}

/** Todas las funciones que se pueden dar: lo que se le muestra al Superusuario aunque la base no guarde ninguna. */
const SUPERUSER_FUNCTIONS = (): string[] => templatePermissions(templateById('superusuario')!);

/** Las funciones de cada rol, agrupadas. Al rol del sistema se le muestran todas; a los demás, solo las que existen y se pueden dar. */
export function permissionsFromRows(roles: Pick<Role, 'id' | 'locked'>[], rows: RolFuncionRow[]): Permission[] {
  return roles.map(role => {
    if (role.locked) return { roleId: role.id, permissions: SUPERUSER_FUNCTIONS() };
    const own = [...new Set(rows.filter(r => r.rol_id === role.id).map(r => r.funcion_id))].filter(isGrantable);
    return { roleId: role.id, permissions: own };
  });
}
