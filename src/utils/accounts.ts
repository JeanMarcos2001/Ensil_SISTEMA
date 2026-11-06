/**
 * Cuentas de usuario guardadas en la base de datos (paso 10): traducción entre las tablas `cuentas`, `cuenta_sedes` y `cuenta_almacenes`
 * y el modelo del sistema (`User`), y cómo se arman las peticiones a la Edge Function `usuarios` (la única que escribe esas tablas).
 *
 * - Una cuenta apunta a su rol por id; el sistema muestra el NOMBRE del rol (`User.role`), así que renombrar un rol no toca las cuentas.
 * - Las sedes se muestran por nombre (`User.branch` es la sede principal; «Todas» si alcanza todas).
 * - Una cuenta de un rol del sistema (Superusuario) no necesita sede: se muestra con «Todas».
 * - **Una cuenta nace de una persona de Personal** (`personalId`): su nombre, documento, teléfono, sedes y almacén salen de la ficha y de las
 *   asignaciones y NO se envían ni se editan aquí. Solo el Superusuario puede crear una cuenta técnica (sin persona).
 * - Las reglas (permisos, plazas por sede, alcance, coherencia rol ↔ lugar…) las vuelve a aplicar el servidor: aquí solo se arma lo que se envía.
 */
import type { Role, User } from '../context/DataContext';

export interface CuentaRow {
  id: string;
  nombre: string;
  correo: string;
  rol_id: string;
  estado: string;
  todas_las_sedes: boolean;
  nota_estado: string | null;
  personal_id: string | null;
  documento: string | null;
  telefono: string | null;
  ultimo_acceso: string | null;
}
export interface CuentaSedeRow { cuenta_id: string; sede_id: string; es_principal: boolean }
export interface CuentaAlmacenRow { cuenta_id: string; almacen_id: string }
export interface SedeRef { id: string; nombre: string }

export interface AccountRows { cuentas: CuentaRow[]; cuentaSedes: CuentaSedeRow[]; cuentaAlmacenes: CuentaAlmacenRow[]; sedes: SedeRef[] }

// ------------------------------------------------------------------------------------------------------------------ Último acceso

const LIMA = 'America/Lima';
const dayOf = (d: Date): string => d.toLocaleDateString('en-CA', { timeZone: LIMA });
const timeOf = (d: Date): string => d.toLocaleTimeString('en-GB', { timeZone: LIMA, hour: '2-digit', minute: '2-digit', hour12: false });

/** «Nunca», «Hoy 08:10», «Ayer 14:30» o «5 nov 2026» (hora de Lima). */
export function lastAccessText(iso: string | null | undefined, now: Date): string {
  if (!iso) return 'Nunca';
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return 'Nunca';
  if (dayOf(at) === dayOf(now)) return `Hoy ${timeOf(at)}`;
  if (dayOf(at) === dayOf(new Date(now.getTime() - 24 * 60 * 60 * 1000))) return `Ayer ${timeOf(at)}`;
  return at.toLocaleDateString('es-PE', { timeZone: LIMA, day: 'numeric', month: 'short', year: 'numeric' }).replace(/\./g, '');
}

// ------------------------------------------------------------------------------------------------------------------ De la base al sistema

const ALL = 'Todas';

/** La cuenta como la usa el sistema; `null` si su rol ya no existe (no se muestra una cuenta sin rol). */
export function accountFromRows(
  row: CuentaRow, roles: Pick<Role, 'id' | 'name' | 'locked'>[], sedes: SedeRef[], cuentaSedes: CuentaSedeRow[], cuentaAlmacenes: CuentaAlmacenRow[], now: Date,
): User | null {
  const role = roles.find(r => r.id === row.rol_id);
  if (!role) return null;
  const own = cuentaSedes.filter(s => s.cuenta_id === row.id);
  const named = own
    .map(s => ({ name: sedes.find(x => x.id === s.sede_id)?.nombre, main: s.es_principal }))
    .filter((s): s is { name: string; main: boolean } => !!s.name)
    .sort((a, b) => Number(b.main) - Number(a.main) || a.name.localeCompare(b.name));
  const all = row.todas_las_sedes || role.locked === true;
  const warehouses = cuentaAlmacenes.filter(a => a.cuenta_id === row.id).map(a => a.almacen_id).sort();
  return {
    id: row.id, name: row.nombre, email: row.correo, role: role.name,
    branch: all ? ALL : named[0]?.name ?? '',
    additionalBranches: all ? undefined : named.length > 1 ? named.slice(1).map(s => s.name) : undefined,
    warehouses: warehouses.length > 0 ? warehouses : undefined,
    status: row.estado === 'Inactivo' ? 'Inactivo' : 'Activo',
    statusNote: row.nota_estado ?? undefined, staffId: row.personal_id ?? undefined, document: row.documento ?? undefined, phone: row.telefono ?? undefined,
    lastAccess: lastAccessText(row.ultimo_acceso, now),
  };
}

export function usersFromRows(rows: AccountRows, roles: Pick<Role, 'id' | 'name' | 'locked'>[], now: Date): User[] {
  return rows.cuentas
    .map(c => accountFromRows(c, roles, rows.sedes, rows.cuentaSedes, rows.cuentaAlmacenes, now))
    .filter((u): u is User => u !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ------------------------------------------------------------------------------------------------------------------ Del sistema a la función

/** Lo que se llena al crear o editar una cuenta (el nombre, documento, teléfono y lugares de una persona salen de su ficha). */
export interface AccountForm {
  /** Persona de Personal de la que nace la cuenta; vacío = cuenta técnica del sistema (solo un Superusuario la crea, con un rol del sistema). */
  staffId?: string;
  /** Solo de una cuenta técnica: la de una persona toma el nombre de su ficha. */
  name?: string;
  /** Correo de ingreso (institucional): nunca es el personal de la ficha. */
  email: string;
  role: string;
  status?: 'Activo' | 'Inactivo';
}

export interface Payload<T> { ok: boolean; error?: string; body?: T }

/** La petición para invitar (crear) una cuenta. Devuelve el error si el rol no se encuentra. */
export function inviteBody(form: AccountForm, roles: Pick<Role, 'id' | 'name'>[], redirectTo?: string): Payload<Record<string, unknown>> {
  const role = roles.find(r => r.name === form.role);
  if (!role) return { ok: false, error: form.role ? `El rol «${form.role}» no existe.` : 'Elija el rol de la cuenta.' };
  const correo = form.email.trim().toLowerCase();
  if (form.staffId) return { ok: true, body: { accion: 'invitar', personalId: form.staffId, correo, rolId: role.id, redirectTo } };
  if (!(form.name ?? '').trim()) return { ok: false, error: 'Escriba el nombre de la cuenta técnica.' };
  return { ok: true, body: { accion: 'invitar', nombre: (form.name ?? '').trim(), correo, rolId: role.id, redirectTo } };
}

/**
 * La petición para editar una cuenta con SOLO lo que cambió (el servidor pide una función distinta por cada campo que cambia, así que no se
 * manda lo que sigue igual). De una cuenta de persona solo se editan el rol y el estado; de una técnica, además, el nombre. Los lugares y los
 * datos personales no se editan aquí: salen de Personas → Personal y Asignaciones. `body.cambios` vacío = no hay nada que guardar.
 */
export function editBody(before: User, form: AccountForm, roles: Pick<Role, 'id' | 'name'>[]): Payload<{ accion: 'editar'; cuentaId: string; cambios: Record<string, unknown> }> {
  const cambios: Record<string, unknown> = {};
  if (!before.staffId && form.name !== undefined && form.name.trim() !== before.name) cambios.nombre = form.name.trim();
  if (form.role !== before.role) {
    const role = roles.find(r => r.name === form.role);
    if (!role) return { ok: false, error: form.role ? `El rol «${form.role}» no existe.` : 'Elija el rol de la cuenta.' };
    cambios.rolId = role.id;
  }
  if (form.status && form.status !== before.status) cambios.estado = form.status;
  return { ok: true, body: { accion: 'editar', cuentaId: before.id, cambios } };
}

/**
 * Las funciones que pide un cambio, una cláusula por cada campo que de verdad cambia (igual que el servidor): desactivar, activar o
 * corregir datos, cambiar el rol, o cambiar las sedes y los almacenes.
 */
export function changeNeeds(cambios: Record<string, unknown>): string[][] {
  const needs: string[][] = [];
  if ('estado' in cambios) needs.push([cambios.estado === 'Inactivo' ? 'org-usuarios:deactivate' : 'org-usuarios:edit']);
  if ('rolId' in cambios) needs.push(['org-usuarios:assign_role']);
  if ('sedeIds' in cambios || 'almacenIds' in cambios || 'todasLasSedes' in cambios) needs.push(['org-usuarios:assign_branch']);
  if ('nombre' in cambios || 'documento' in cambios || 'telefono' in cambios) needs.push(['org-usuarios:edit']);
  return needs;
}
