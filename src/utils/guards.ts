/**
 * Guardas: qué función pide cada acción del contexto y cada ítem del menú (reglas puras sobre `capabilityRegistry.ts`).
 *
 * El registro ya dice qué acciones del contexto ejecuta cada función (`actions`). De ahí sale, sin repetirse, lo que pide cada acción:
 * `guardActions` envuelve todas las acciones del contexto y, si el usuario no tiene la función, devuelve `{ ok: false, error }` (o lanza
 * `PermissionError` en las que no devuelven resultado). Las pantallas siguen consultando `can()` para ocultar lo que el rol no puede
 * hacer; esta capa es la red de seguridad para que ninguna pantalla —ni una nueva— salte la validación.
 *
 * Una acción puede pedir varias funciones («cualquiera de estas»: p. ej. `registerEnrollments` es de crear o de renovar) o depender de
 * lo que lleva (cobrar un ingreso o un egreso, cerrar la caja o la caja chica): para esas hay un resolutor por argumentos.
 * Lo que depende del dato guardado (qué campos cambia `updateUser` frente a la cuenta actual) lo resuelve la propia acción con
 * `userChangeNeeds`.
 */
import { ALL_CAPABILITIES, capabilityById, menuCapabilities, type Availability } from './capabilities';
import { NON_CAPABILITY_ACTIONS } from './capabilityRegistry';

/**
 * Lo que debe cumplirse para ejecutar una acción: una lista de cláusulas y se deben cumplir todas; cada cláusula es una lista de
 * funciones de las que basta tener una.
 */
export type Requirement = string[][];

export class PermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermissionError';
  }
}

const BY_ACTION = new Map<string, string[]>();
for (const c of ALL_CAPABILITIES) for (const a of c.actions) BY_ACTION.set(a, [...(BY_ACTION.get(a) ?? []), c.id]);

/** Las acciones del contexto que piden una función (todas las del registro). */
export const guardedActionNames = (): string[] => [...BY_ACTION.keys()];

/** Las funciones que registra el catálogo para una acción (sin mirar los argumentos). */
export const capabilitiesOfAction = (action: string): string[] => BY_ACTION.get(action) ?? [];

type Resolver = (args: any[]) => Requirement;

const TRANSFER_ANY = ['log-transfer:req_transfer', 'log-transfer:approve_transfer', 'log-transfer:dispatch', 'log-transfer:receive'];
const SCHEDULE_EDIT_KEYS = ['date', 'time', 'responsible', 'observations', 'duration', 'branchId'];
/** Datos que solo completa quien despacha la transferencia (cajas, transporte, recepción manual). */
const TRANSFER_DISPATCH_KEYS = ['boxes', 'shippingMethodId', 'courierId', 'trackingNumber', 'additionalReference', 'travelerName', 'travelerDocument', 'shippingObservation', 'internalLogisticsObservation', 'eta', 'manualEnable', 'attachments'];

/** Acciones cuya función depende de lo que llevan. El resto pide cualquiera de las funciones que las listan en el registro. */
const RESOLVERS: Record<string, Resolver> = {
  addCashMovement: ([m]) => [[m?.kind === 'Egreso' ? 'op-caja:reg_expense' : 'op-caja:reg_income']],
  registerEnrollments: ([draft]) => [[draft?.renewsId ? 'op-matriculas:renew' : 'op-matriculas:create']],
  closeCash: ([input]) => [[input?.scope === 'caja-chica' ? 'op-caja-chica:count' : 'op-caja:close_box']],
  reversePayment: () => [['op-pagos:reverse_payment']],
  // Un rol que nace con funciones pide además la función de configurarlas
  addRole: ([input]) => (input?.permissions?.length ? [['org-roles:create'], ['org-roles:config_perms']] : [['org-roles:create']]),
  saveRecipe: ([recipe]) => [[recipe?.id ? 'com-recetas:edit' : 'com-recetas:create']],
  confirmReception: ([data]) => [[data?.docType === 'Transferencia' ? 'log-transfer:receive' : 'log-recepciones:confirm']],
  // Despachar es la función que mueve el stock: un envío que nace o pasa a «En tránsito» pide despachar, no solo preparar
  addShipment: ([shipment]) => (shipment?.status === 'En tránsito' ? [['log-envios:create'], ['log-envios:dispatch']] : [['log-envios:create']]),
  updateShipment: ([, patch]) => [[patch?.status === 'En tránsito' ? 'log-envios:dispatch' : 'log-envios:edit']],
  updateTransfer: ([, patch]) => [[TRANSFER_DISPATCH_KEYS.some(k => k in (patch ?? {})) ? 'log-transfer:dispatch' : 'log-transfer:req_transfer']],
  updateTransferStatus: ([, status]) => {
    switch (status) {
      case 'Solicitada': return [['log-transfer:req_transfer']];
      case 'Aprobada': case 'Rechazada': return [['log-transfer:approve_transfer']];
      case 'En tránsito': case 'Listo para recepción': case 'Despachada': return [['log-transfer:dispatch']];
      case 'Recibida': case 'Recibida con diferencias': case 'Recepcionada': return [['log-transfer:receive']];
      case 'Cancelada': return [['log-transfer:req_transfer', 'log-transfer:dispatch', 'log-transfer:approve_transfer']];
      default: return [TRANSFER_ANY];
    }
  },
  updateSchedule: ([, data]) => {
    const d = (data ?? {}) as Record<string, unknown>;
    // Cambiar fecha, hora, responsable u observaciones, o cancelar, es reprogramar (con menos de 24 h la acción exige además la función institucional)
    if (SCHEDULE_EDIT_KEYS.some(k => k in d) || d.status === 'Cancelado' || d.status === 'Reprogramado') return [['psi-prog:reschedule']];
    if (d.status === 'Faltó') return [['psi-prog:mark_attendance']];
    // Registrar la sesión de seguimiento también deja la asesoría como «Asistió»
    if (d.status === 'Asistió') return [['psi-prog:mark_attendance', 'psi-prog:reg_tracking']];
    return [['psi-prog:reschedule', 'psi-prog:mark_attendance', 'psi-prog:reg_tracking']];
  },
};

/** Lo que pide ejecutar `action` con esos argumentos; `null` si la acción no es una función de una persona. */
export function requirementOf(action: string, args: unknown[] = []): Requirement | null {
  if (action in NON_CAPABILITY_ACTIONS) return null;
  const resolve = RESOLVERS[action];
  if (resolve) return resolve(args);
  const caps = BY_ACTION.get(action);
  return caps && caps.length > 0 ? [caps] : null;
}

/** La primera cláusula que el usuario no cumple (`null` si cumple todas). */
export function unmetClause(requirement: Requirement, can: (capabilityId: string) => boolean): string[] | null {
  return requirement.find(clause => !clause.some(id => can(id))) ?? null;
}

const labelOf = (id: string) => capabilityById(id)?.label ?? id;

/** El mensaje para quien no tiene la función (nombra la función tal como la ve en Permisos). */
export function denialMessage(clause: string[]): string {
  return clause.length === 1
    ? `Su rol no tiene la función «${labelOf(clause[0])}».`
    : `Su rol no tiene ninguna de estas funciones: ${clause.map(id => `«${labelOf(id)}»`).join(' o ')}.`;
}

/**
 * Las acciones que no devuelven un `{ ok, error }`: si se les niega el permiso lanzan `PermissionError` (una pantalla bien armada no las
 * ofrece sin la función, así que solo se llega aquí por un error de programación). `check-guards.ts` la compara con las firmas del contexto.
 */
export const THROWS_ON_DENIAL: ReadonlySet<string> = new Set([
  // devuelven la entidad creada
  'addMonthlySchedule', 'addSchedule', 'addTracking',
  // no devuelven nada
  'markNotificationAsRead', 'setCapacityConfig',
  'deleteMonthlySchedule',
  'updateMonthlySchedule', 'updateTracking',
]);

/**
 * Envuelve las acciones del contexto: antes de ejecutar una, comprueba la función que pide. Lo que no es acción (datos, consultas,
 * estado de la interfaz) pasa igual.
 */
export function guardActions<T extends object>(actions: T, can: (capabilityId: string) => boolean): T {
  const out: Record<string, unknown> = { ...(actions as Record<string, unknown>) };
  for (const [name, fn] of Object.entries(actions)) {
    if (typeof fn !== 'function' || requirementOf(name) === null) continue;
    out[name] = (...args: unknown[]) => {
      const clause = unmetClause(requirementOf(name, args) ?? [], can);
      if (!clause) return (fn as (...a: unknown[]) => unknown)(...args);
      const error = denialMessage(clause);
      if (THROWS_ON_DENIAL.has(name)) throw new PermissionError(error);
      return { ok: false, error, reason: error };
    };
  }
  return out as T;
}

// ------------------------------------------------------------------------------------------------------------------ Cuentas de usuario

export interface UserLike {
  name: string; email: string; role: string; branch: string; status: string;
  document?: string; phone?: string; additionalBranches?: string[];
  /** PIN nuevo (llega en claro a la acción, que guarda solo su marca). */
  pin?: string;
}

const sameList = (a: string[] = [], b: string[] = []) => a.length === b.length && a.every(x => b.includes(x));

/**
 * Las funciones que pide un cambio de cuenta, según los campos que de verdad cambian frente a la cuenta actual (el formulario manda
 * todos los campos aunque se haya tocado uno): activar o desactivar, cambiar el rol, cambiar las sedes o corregir los datos.
 */
export function userChangeNeeds(before: UserLike, patch: Partial<UserLike>): Requirement {
  const changed = <K extends keyof UserLike>(k: K) => k in patch && patch[k] !== undefined && patch[k] !== before[k];
  const needs: Requirement = [];
  if (changed('status')) needs.push([patch.status === 'Inactivo' ? 'org-usuarios:deactivate' : 'org-usuarios:edit']);
  if (changed('role')) needs.push(['org-usuarios:assign_role']);
  if (changed('branch') || ('additionalBranches' in patch && !sameList(patch.additionalBranches, before.additionalBranches))) needs.push(['org-usuarios:assign_branch']);
  if (changed('name') || changed('email') || changed('document') || changed('phone') || !!patch.pin) needs.push(['org-usuarios:edit']);
  return needs;
}

// ------------------------------------------------------------------------------------------------------------------ Menú

const MENU = new Map(menuCapabilities().map(m => [`${m.module}/${m.item}`, m.capability]));

/** La función que hace visible un ítem del menú (`undefined` si el ítem no pide ninguna). */
export const menuCapabilityOf = (moduleId: string, item: string): string | undefined => MENU.get(`${moduleId}/${item}`);

/** ¿Se muestra el ítem? Los que no piden función (Preferencias, Ayuda) los decide el menú. */
export const menuVisible = (moduleId: string, item: string, can: (capabilityId: string) => boolean): boolean => {
  const cap = menuCapabilityOf(moduleId, item);
  return cap === undefined || can(cap);
};

// ------------------------------------------------------------------------------------------------------------------ Disponibilidad

/**
 * Lo que se le ofrece a quien mira: si falta una contraparte obligatoria no se ofrece la función, con el motivo. Al Superusuario sí se
 * le ofrece (es quien crea las cuentas que faltan y hoy puede hacerlo todo) y se le muestra el motivo como aviso.
 */
export function availabilityForViewer(base: Availability, isSuperuser: boolean): Availability {
  if (base.available || !isSuperuser) return base;
  return { available: true, advisories: [`${base.reason} (Se le ofrece porque usted es Superusuario.)`, ...base.advisories] };
}
