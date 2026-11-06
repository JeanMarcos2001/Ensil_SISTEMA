/**
 * Personal y Asignaciones guardados en la base de datos (paso 10): traducción entre las tablas `personal` y `asignaciones` y el modelo del
 * sistema (`Staff`, `Assignment`), y las reglas que se avisan en pantalla antes de enviar.
 *
 * - La ficha no se borra: se inactiva (con fecha y motivo). La asignación no se borra: se cierra (con fecha y motivo).
 * - El lugar de una asignación es UNA sede o el almacén central: se guarda como `sede_id` o `almacen_id` (nunca los dos).
 * - Nombre, documento y teléfono de la cuenta de la persona, y las sedes y el almacén de esa cuenta, los mantiene la base a partir de la
 *   ficha y de las asignaciones activas con acceso: aquí solo se explica lo que va a pasar.
 */
import type { Assignment, Branch, Permission, Role, Staff, User, Warehouse } from '../context/DataContext';
import { errorCoherenciaRolLugar, rolMueveAlmacen } from '../../supabase/functions/usuarios/reglas.ts';
import { type Place, WAREHOUSE_SYSTEM_ROLE } from './assignments';

// ------------------------------------------------------------------------------------------------------------------ Filas de la base

export interface PersonalRow {
  id: string;
  codigo: string;
  tipo_documento: string;
  numero_documento: string;
  nombres: string;
  apellido_paterno: string;
  apellido_materno: string | null;
  fecha_nacimiento: string;
  genero: string | null;
  estado_civil: string | null;
  tiene_hijos: boolean;
  numero_hijos: number;
  nivel_educativo: string | null;
  profesion: string | null;
  especialidad: string | null;
  telefono: string;
  correo_personal: string | null;
  direccion: string | null;
  estado: string;
  observaciones: string | null;
  fecha_estado: string | null;
  motivo_estado: string | null;
}

export interface AsignacionRow {
  id: string;
  personal_id: string;
  sede_id: string | null;
  almacen_id: string | null;
  area: string;
  rol_sistema: string;
  fecha_inicio: string;
  fecha_fin: string | null;
  es_principal: boolean;
  estado: string;
  observaciones: string | null;
  motivo_cierre: string | null;
  cerrada_por: string | null;
}

const orNull = (v: string | undefined | null): string | null => {
  const t = (v ?? '').trim();
  return t ? t : null;
};

// ------------------------------------------------------------------------------------------------------------------ Personal

export const staffFromRow = (r: PersonalRow): Staff => ({
  id: r.id, code: r.codigo, docType: r.tipo_documento, docNumber: r.numero_documento, names: r.nombres, lastNameP: r.apellido_paterno,
  lastNameM: r.apellido_materno ?? '', birthDate: r.fecha_nacimiento, gender: r.genero ?? undefined, civilStatus: r.estado_civil ?? undefined,
  hasChildren: r.tiene_hijos, childrenCount: r.numero_hijos, educationLevel: r.nivel_educativo ?? undefined, profession: r.profesion ?? undefined,
  specialty: r.especialidad ?? undefined, phone: r.telefono, personalEmail: r.correo_personal ?? undefined, address: r.direccion ?? undefined,
  status: r.estado, observations: r.observaciones ?? undefined, statusDate: r.fecha_estado ?? undefined, statusReason: r.motivo_estado ?? undefined,
});

export const staffToRow = (s: Staff): PersonalRow => ({
  id: s.id, codigo: s.code, tipo_documento: s.docType, numero_documento: s.docNumber.trim(), nombres: s.names.trim(), apellido_paterno: s.lastNameP.trim(),
  apellido_materno: orNull(s.lastNameM), fecha_nacimiento: s.birthDate, genero: orNull(s.gender), estado_civil: orNull(s.civilStatus),
  tiene_hijos: !!s.hasChildren, numero_hijos: s.hasChildren ? s.childrenCount ?? 0 : 0, nivel_educativo: orNull(s.educationLevel), profesion: orNull(s.profession),
  especialidad: orNull(s.specialty), telefono: s.phone.trim(), correo_personal: orNull(s.personalEmail), direccion: orNull(s.address), estado: s.status,
  observaciones: orNull(s.observations), fecha_estado: s.statusDate ?? null, motivo_estado: orNull(s.statusReason),
});

/** Solo los campos que cambian (el id y el código no se tocan). */
export function staffPatchToRow(p: Partial<Staff>): Partial<PersonalRow> {
  const row: Partial<PersonalRow> = {};
  if (p.docType !== undefined) row.tipo_documento = p.docType;
  if (p.docNumber !== undefined) row.numero_documento = p.docNumber.trim();
  if (p.names !== undefined) row.nombres = p.names.trim();
  if (p.lastNameP !== undefined) row.apellido_paterno = p.lastNameP.trim();
  if (p.lastNameM !== undefined) row.apellido_materno = orNull(p.lastNameM);
  if (p.birthDate !== undefined) row.fecha_nacimiento = p.birthDate;
  if (p.gender !== undefined) row.genero = orNull(p.gender);
  if (p.civilStatus !== undefined) row.estado_civil = orNull(p.civilStatus);
  if (p.hasChildren !== undefined) row.tiene_hijos = p.hasChildren;
  if (p.childrenCount !== undefined || p.hasChildren === false) row.numero_hijos = p.hasChildren === false ? 0 : p.childrenCount ?? 0;
  if (p.educationLevel !== undefined) row.nivel_educativo = orNull(p.educationLevel);
  if (p.profession !== undefined) row.profesion = orNull(p.profession);
  if (p.specialty !== undefined) row.especialidad = orNull(p.specialty);
  if (p.phone !== undefined) row.telefono = p.phone.trim();
  if (p.personalEmail !== undefined) row.correo_personal = orNull(p.personalEmail);
  if (p.address !== undefined) row.direccion = orNull(p.address);
  if (p.status !== undefined) row.estado = p.status;
  if (p.observations !== undefined) row.observaciones = orNull(p.observations);
  if (p.statusDate !== undefined) row.fecha_estado = p.statusDate || null;
  if (p.statusReason !== undefined) row.motivo_estado = orNull(p.statusReason);
  return row;
}

// ------------------------------------------------------------------------------------------------------------------ Lugares y asignaciones

/** Las sedes y el almacén juntos, como «lugares de trabajo». Si un nombre se repite entre una sede y un almacén, se distingue añadiendo «(almacén)». */
export function placesOf(branches: Pick<Branch, 'id' | 'name' | 'status'>[], warehouses: Pick<Warehouse, 'id' | 'name' | 'status'>[]): Place[] {
  const sedeNames = new Set(branches.map(b => b.name.trim().toLowerCase()));
  return [
    ...branches.map(b => ({ id: b.id, name: b.name, kind: 'sede' as const, status: b.status })),
    ...warehouses.map(w => ({ id: w.id, name: sedeNames.has(w.name.trim().toLowerCase()) ? `${w.name} (almacén)` : w.name, kind: 'almacen' as const, status: w.status })),
  ];
}

export function assignmentFromRow(r: AsignacionRow, places: Place[]): Assignment {
  const placeId = r.sede_id ?? r.almacen_id ?? '';
  const place = places.find(p => p.id === placeId);
  return {
    id: r.id, staffId: r.personal_id, branch: place?.name ?? placeId, placeId, placeKind: r.sede_id ? 'sede' : 'almacen', area: r.area,
    systemRole: r.rol_sistema, startDate: r.fecha_inicio, endDate: r.fecha_fin ?? undefined, isMain: r.es_principal, status: r.estado,
    observations: r.observaciones ?? undefined, closeReason: r.motivo_cierre ?? undefined, closedBy: r.cerrada_por ?? undefined,
  };
}

/** La fila de una asignación (el lugar se guarda como sede o como almacén según su tipo). */
export function assignmentToRow(a: Assignment): AsignacionRow {
  const isWarehouse = a.placeKind === 'almacen';
  return {
    id: a.id, personal_id: a.staffId, sede_id: isWarehouse ? null : a.placeId ?? null, almacen_id: isWarehouse ? a.placeId ?? null : null, area: a.area,
    rol_sistema: a.systemRole ?? 'Sin acceso', fecha_inicio: a.startDate, fecha_fin: a.endDate ?? null, es_principal: a.isMain, estado: a.status,
    observaciones: orNull(a.observations), motivo_cierre: orNull(a.closeReason), cerrada_por: orNull(a.closedBy),
  };
}

// ------------------------------------------------------------------------------------------------------------------ Reglas de acceso del personal

/** Roles del sistema de una asignación que dan acceso al sistema (todos menos «Sin acceso»). */
export const grantsAccess = (a: Pick<Assignment, 'systemRole'>) => (a.systemRole ?? '') !== 'Sin acceso';

export const isWarehouseAssignment = (a: Pick<Assignment, 'placeKind'>) => a.placeKind === 'almacen';

/** Lo que verá la cuenta de una persona a partir de sus asignaciones activas con acceso: sedes (la principal primero) y almacén. */
export interface DerivedPlaces { branches: string[]; warehouses: string[]; mainBranch: string }

export function derivedPlaces(staffId: string, assignments: Assignment[]): DerivedPlaces {
  const own = assignments
    .filter(a => a.staffId === staffId && a.status === 'Activa' && grantsAccess(a))
    .sort((a, b) => Number(b.isMain) - Number(a.isMain) || a.startDate.localeCompare(b.startDate) || a.id.localeCompare(b.id));
  const branches = [...new Set(own.filter(a => !isWarehouseAssignment(a)).map(a => a.placeId ?? a.branch))];
  const warehouses = [...new Set(own.filter(isWarehouseAssignment).map(a => a.placeId ?? a.branch))];
  return { branches, warehouses, mainBranch: branches[0] ?? '' };
}

/**
 * Aviso (no bloquea) al guardar una asignación: dice qué rol de cuenta pide el lugar. Quien trabaja en el almacén necesita un rol que
 * mueva el almacén; quien solo trabaja en sedes, uno que no lo mueva. La regla dura se aplica al crear la cuenta o cambiar su rol.
 */
export function assignmentAccessNote(systemRole: string, kind: Place['kind']): string | undefined {
  if (systemRole === 'Sin acceso') return 'Con «Sin acceso» no aporta lugares a la cuenta de la persona (puede ser de limpieza, por ejemplo).';
  if (kind === 'almacen' && systemRole === WAREHOUSE_SYSTEM_ROLE) return 'Su cuenta necesitará un rol que mueva el almacén (despachar, ingresar compras, ajustar stock).';
  return undefined;
}

/**
 * Aviso (no bloquea) al guardar o cerrar una asignación de alguien que YA tiene cuenta: si con las asignaciones que quedarían su rol y su
 * lugar de trabajo no se corresponden (un rol que mueve el almacén sin trabajar en él, o al revés), se lo dice para que corrija el rol en
 * Organización → Usuarios. La regla dura vive en el servidor al crear la cuenta o cambiar su rol; aquí solo se avisa.
 */
export function accountPlaceWarning(
  account: Pick<User, 'role' | 'staffId'> | undefined, nextAssignments: Assignment[], roles: Pick<Role, 'id' | 'name' | 'locked'>[], permissions: Permission[],
): string | undefined {
  if (!account?.staffId) return undefined;
  const role = roles.find(r => r.name === account.role);
  if (!role) return undefined;
  const mueveAlmacen = rolMueveAlmacen(permissions.find(p => p.roleId === role.id)?.permissions ?? []);
  const places = derivedPlaces(account.staffId, nextAssignments);
  const problem = errorCoherenciaRolLugar({ nombre: role.name, esSistema: role.locked === true, mueveAlmacen }, { almacenIds: places.warehouses });
  return problem ? `Su cuenta quedaría con una combinación incoherente. ${problem}` : undefined;
}
