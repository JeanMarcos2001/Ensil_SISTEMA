/**
 * Reglas de la cuenta de una PERSONA de Personal (funciones puras): las que la pantalla de Usuarios y las acciones `addUser`/`updateUser`
 * revisan antes de llamar a la Edge Function `usuarios` (que las vuelve a aplicar: `supabase/functions/usuarios/reglas.ts`, de donde se
 * importan las de la persona, el correo personal y la coherencia rol ↔ lugar, para que haya UNA sola definición).
 *
 * El modelo, en corto:
 *  - una cuenta nace de una persona de Personal (una persona, una cuenta); solo un Superusuario crea una cuenta técnica, sin persona;
 *  - las sedes y el almacén de la cuenta salen de las asignaciones activas con acceso de la persona (no se eligen en la cuenta);
 *  - el rol dice QUÉ puede hacer y el lugar DÓNDE: un rol que mueve el almacén exige trabajar en él y al revés (`errorCoherenciaRolLugar`);
 *  - el correo de ingreso es institucional: nunca el personal de la ficha (bloquea) y, si no es del dominio de la institución, se avisa
 *    sin bloquear (puede haber un dominio nuevo o un asesor externo);
 *  - el rol del sistema (Superusuario) es SOLO para cuentas técnicas, sin persona (y solo lo da un Superusuario): no se le ofrece ni se le
 *    da a una persona de Personal.
 */
import type { Assignment, Permission, Role, Staff, User } from '../context/DataContext';
import {
  CORREO_RE, ROL_SISTEMA_SOLO_TECNICO, errorCoherenciaRolLugar, errorCorreoPersonal, errorPersona, rolMueveAlmacen,
  type AsignacionInfo, type CuentaInfo, type PersonaInfo,
} from '../../supabase/functions/usuarios/reglas.ts';
import type { Place } from './assignments';
import { accountRoleError, seatLimitError } from './roleBuilder';
import { derivedPlaces, grantsAccess } from './staffDb';

/** Dominio de los correos institucionales: otro dominio no bloquea, solo se avisa. */
export const INSTITUTIONAL_DOMAIN = 'ensilperu.com';

/** Aviso (no bloquea) si el correo no es del dominio institucional. */
export function emailDomainWarning(email: string): string | undefined {
  const text = email.trim().toLowerCase();
  if (!CORREO_RE.test(text)) return undefined;
  return text.endsWith(`@${INSTITUTIONAL_DOMAIN}`) ? undefined : `No es un correo @${INSTITUTIONAL_DOMAIN}: confirme que es el correo de trabajo de la persona (no uno personal).`;
}

export interface AccountRulesContext {
  staff: Staff[];
  assignments: Assignment[];
  places: Place[];
  users: User[];
  roles: Pick<Role, 'id' | 'name' | 'status' | 'locked' | 'branchUserLimit'>[];
  permissions: Permission[];
  actorIsSuperuser: boolean;
}

// ------------------------------------------------------------------------------------------------------------------ Lo que ve la cuenta

/** Lo que verá la cuenta de la persona: sedes por nombre (la principal primero) y almacenes por id, como los guarda `User`. */
export interface AccountPlaces { branch: string; additionalBranches: string[]; warehouses: string[] }

export function accountPlacesOf(staffId: string, assignments: Assignment[], places: Place[]): AccountPlaces {
  const d = derivedPlaces(staffId, assignments);
  const names = d.branches.map(id => places.find(p => p.id === id)?.name ?? id);
  return { branch: names[0] ?? '', additionalBranches: names.slice(1), warehouses: d.warehouses };
}

/** Texto de los lugares de trabajo con acceso, para mostrar en el formulario («Piura, Los Olivos · Almacén central»). */
export function workPlacesText(staffId: string, assignments: Assignment[], places: Place[]): string {
  const d = derivedPlaces(staffId, assignments);
  const name = (id: string) => places.find(p => p.id === id)?.name ?? id;
  const parts = [d.branches.map(name).join(', '), d.warehouses.map(name).join(', ')].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'Ninguno: no tiene asignaciones activas con acceso';
}

/** ¿Trabaja en el almacén (alguna asignación activa con acceso al almacén)? */
export const worksInWarehouse = (staffId: string, assignments: Assignment[]): boolean => derivedPlaces(staffId, assignments).warehouses.length > 0;

/** Traduce el estado del sistema a lo que entienden las reglas compartidas con el servidor. */
export function rulesInput(staff: Staff[], assignments: Assignment[], users: User[]): { personal: PersonaInfo[]; asignaciones: AsignacionInfo[]; cuentas: CuentaInfo[] } {
  return {
    personal: staff.map(s => ({ id: s.id, nombre: `${s.names} ${s.lastNameP}`.trim(), estado: s.status === 'Inactivo' ? 'Inactivo' : 'Activo', correoPersonal: s.personalEmail ?? null })),
    asignaciones: assignments.map(a => ({
      personalId: a.staffId, sedeId: a.placeKind === 'almacen' ? null : a.placeId ?? a.branch, almacenId: a.placeKind === 'almacen' ? a.placeId ?? a.branch : null,
      conAcceso: a.hasAccess, esPrincipal: a.isMain, estado: a.status === 'Cerrada' ? 'Cerrada' : 'Activa', fechaInicio: a.startDate,
    })),
    cuentas: users.map(u => ({
      id: u.id, nombre: u.name, correo: u.email, rolId: '', estado: u.status, todasLasSedes: u.branch === 'Todas', sedeIds: [], almacenIds: u.warehouses ?? [], ultimoAcceso: null, personalId: u.staffId ?? null,
    })),
  };
}

// ------------------------------------------------------------------------------------------------------------------ Roles compatibles

const roleMoves = (role: Pick<Role, 'id'>, permissions: Permission[]) => rolMueveAlmacen(permissions.find(p => p.roleId === role.id)?.permissions ?? []);

/** El error de combinar el rol con el lugar de trabajo de la persona (`null` = coherentes). Los roles del sistema no tienen restricción. */
export function roleFitError(role: Pick<Role, 'id' | 'name' | 'locked'>, staffId: string, assignments: Assignment[], permissions: Permission[]): string | null {
  return errorCoherenciaRolLugar(
    { nombre: role.name, esSistema: role.locked === true, mueveAlmacen: roleMoves(role, permissions) },
    { almacenIds: derivedPlaces(staffId, assignments).warehouses },
  );
}

/** Los roles que se pueden ofrecer a esa persona: activos, no reservados (el del sistema es solo de las cuentas técnicas) y coherentes con su lugar de trabajo. */
export function rolesFor(staffId: string, ctx: Pick<AccountRulesContext, 'roles' | 'assignments' | 'permissions' | 'actorIsSuperuser'>, keepRole?: string): typeof ctx.roles {
  return ctx.roles.filter(r => r.name === keepRole || (r.status === 'Activo' && !r.locked && roleFitError(r, staffId, ctx.assignments, ctx.permissions) === null));
}

// ------------------------------------------------------------------------------------------------------------------ Crear

export interface AccountCreateInput { staffId?: string; name?: string; email: string; role: string }
export interface AccountCheck { error?: string; warning?: string }

/** Todo lo que debe cumplirse para crear la cuenta; el primer problema se devuelve como `error` (bloquea) y el aviso aparte (no bloquea). */
export function accountCreateCheck(input: AccountCreateInput, ctx: AccountRulesContext): AccountCheck {
  const email = input.email.trim().toLowerCase();
  const role = ctx.roles.find(r => r.name === input.role);
  const warning = emailDomainWarning(email);
  const fail = (error: string): AccountCheck => ({ error, warning });

  if (input.staffId) {
    const personProblem = errorPersona(input.staffId, rulesInput(ctx.staff, ctx.assignments, ctx.users));
    if (personProblem) return fail(personProblem);
  } else {
    if (!ctx.actorIsSuperuser) return fail('Solo un Superusuario crea una cuenta sin persona (cuenta técnica del sistema).');
    if (!(input.name ?? '').trim()) return fail('Escriba el nombre de la cuenta técnica.');
  }
  if (!email) return fail('El correo es obligatorio.');
  if (!CORREO_RE.test(email)) return fail('El correo no es válido.');
  if (ctx.users.some(u => u.email.toLowerCase() === email)) return fail('Este correo ya está registrado.');
  if (input.staffId) {
    const person = ctx.staff.find(s => s.id === input.staffId);
    const mismatch = person ? errorCorreoPersonal(email, { correoPersonal: person.personalEmail ?? null }) : null;
    if (mismatch) return fail(mismatch);
  }
  const roleProblem = accountRoleError(input.role, ctx.roles, ctx.actorIsSuperuser);
  if (roleProblem) return fail(roleProblem);
  if (!input.staffId) {
    return role?.locked ? { warning } : fail('Una cuenta sin persona solo puede tener un rol del sistema (Superusuario): las demás nacen de una persona de Personal.');
  }
  if (role?.locked) return fail(ROL_SISTEMA_SOLO_TECNICO);
  const fit = role ? roleFitError(role, input.staffId, ctx.assignments, ctx.permissions) : null;
  if (fit) return fail(fit);
  const placesOf = accountPlacesOf(input.staffId, ctx.assignments, ctx.places);
  const seats = seatLimitError(role, ctx.users, { role: input.role, status: 'Activo', ...placesOf });
  if (seats) return fail(seats);
  return { warning };
}

// ------------------------------------------------------------------------------------------------------------------ Editar

/**
 * Lo que debe cumplirse para cambiar el rol o el estado de una cuenta de persona (`null` = se puede). Las cuentas técnicas no tienen
 * restricción de lugar. Reactivar exige lo mismo que crear: persona activa y con una asignación con acceso.
 */
export function accountEditCheck(before: User, change: { role?: string; status?: 'Activo' | 'Inactivo' }, ctx: AccountRulesContext): string | null {
  const nextRole = change.role ?? before.role;
  const nextStatus = change.status ?? before.status;
  const roleProblem = accountRoleError(nextRole, ctx.roles, ctx.actorIsSuperuser, before);
  if (roleProblem) return roleProblem;
  if (!before.staffId) return null;
  const reactivates = before.status === 'Inactivo' && nextStatus === 'Activo';
  if (reactivates) {
    const personProblem = errorPersona(before.staffId, rulesInput(ctx.staff, ctx.assignments, ctx.users), before.id);
    if (personProblem) return personProblem;
  }
  if (nextRole !== before.role || reactivates) {
    const role = ctx.roles.find(r => r.name === nextRole);
    if (nextRole !== before.role && role?.locked) return ROL_SISTEMA_SOLO_TECNICO;
    const fit = role ? roleFitError(role, before.staffId, ctx.assignments, ctx.permissions) : null;
    if (fit) return fit;
  }
  const placesOf = accountPlacesOf(before.staffId, ctx.assignments, ctx.places);
  return seatLimitError(ctx.roles.find(r => r.name === nextRole), ctx.users, { role: nextRole, status: nextStatus, ...placesOf }, before);
}

/** Datos de la persona que se muestran (solo lectura) al crear su cuenta. */
export function personSummary(person: Staff, assignments: Assignment[], places: Place[]) {
  const own = assignments.filter(a => a.staffId === person.id && a.status === 'Activa');
  const withAccess = own.filter(grantsAccess);
  return {
    name: `${person.names} ${person.lastNameP} ${person.lastNameM}`.replace(/\s+/g, ' ').trim(),
    document: `${person.docType} ${person.docNumber}`,
    phone: person.phone,
    personalEmail: person.personalEmail ?? '',
    placesText: workPlacesText(person.id, assignments, places),
    assignmentsText: own.length === 0 ? 'Sin asignaciones activas' : `${withAccess.length} con acceso de ${own.length}`,
  };
}
