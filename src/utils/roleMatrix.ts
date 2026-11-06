/**
 * Matriz de pruebas por rol (paso 8): qué ve y qué puede hacer cada cuenta, calculado con las MISMAS reglas que usa el sistema
 * (permisos del rol, guardas de las acciones, menú por función, Dashboard por rol, alcance de sedes y avisos por función y sede).
 * Nada se escribe a mano aquí salvo la lista de acciones clave que se quiere mirar: `check-role-matrix.ts` la contrasta con lo que
 * el negocio decidió y `doc-role-matrix.ts` genera `docs/PRUEBAS_POR_ROL.md`.
 */
import type { Branch, Permission, Role, User, Warehouse } from '../context/DataContext';
import { can as canDo } from './authority';
import { ALL_CAPABILITIES, buildHolders, type Holder } from './capabilities';
import { EVENTS } from './capabilityRegistry';
import { dashboardLayout, type DashboardLayout } from './dashboard';
import { requirementOf, unmetClause } from './guards';
import { resolveRecipients } from './notifications';
import { menuPreview } from './roleBuilder';
import { firstPathFor, scopeOfUser, type SessionScope } from './session';
import { PERM } from './authority';

/** Acciones clave que se miran en cada cuenta: lo que decide quién cobra, quién reversa, quién aprueba, quién mueve stock y quién ve sueldos. */
export interface KeyAction {
  id: string;
  label: string;
  group: string;
  /** Acción del contexto y los argumentos con que se evalúa (la guarda pide la función según lo que lleva). */
  action?: string;
  args?: unknown[];
  /** Función que decide la acción cuando la reparten ADENTRO de la acción según el dato (p. ej. el cierre de la caja o de la caja chica). */
  capability?: string;
}

export const KEY_ACTIONS: KeyAction[] = [
  { group: 'Matrícula', id: 'matricular', label: 'Matricular', action: 'registerEnrollments', args: [{}] },
  { group: 'Matrícula', id: 'renovar', label: 'Renovar una matrícula', action: 'registerEnrollments', args: [{ renewsId: 'MAT' }] },
  { group: 'Matrícula', id: 'pedir-caida', label: 'Pedir una caída', action: 'requestEnrollmentDrop' },
  { group: 'Matrícula', id: 'aprobar-caida', label: 'Aprobar o rechazar una caída', action: 'resolveEnrollmentDrop' },
  { group: 'Matrícula', id: 'entregar-materiales', label: 'Entregar materiales (verificación)', action: 'updateEnrollmentVerification' },
  { group: 'Dinero', id: 'cobrar', label: 'Cobrar una cuota', action: 'registerPayment' },
  { group: 'Dinero', id: 'ingreso-caja', label: 'Registrar un ingreso en caja', action: 'addCashMovement', args: [{ kind: 'Ingreso' }] },
  { group: 'Dinero', id: 'egreso-caja', label: 'Registrar un egreso en caja', action: 'addCashMovement', args: [{ kind: 'Egreso' }] },
  { group: 'Dinero', id: 'vender', label: 'Vender un artículo en caja', action: 'registerItemSale' },
  { group: 'Dinero', id: 'cerrar-caja', label: 'Cerrar la caja', action: 'closeCash', args: [{ scope: 'caja' }] },
  { group: 'Control', id: 'reversar-pago', label: 'Reversar un pago', action: 'reversePayment' },
  { group: 'Control', id: 'reversar-caja', label: 'Reversar un movimiento de caja', action: 'reverseCashMovement' },
  { group: 'Control', id: 'reabrir-caja', label: 'Reabrir un cierre de la caja', capability: 'op-caja:reopen_box' },
  { group: 'Control', id: 'reabrir-caja-chica', label: 'Reabrir un cierre de la caja chica', capability: 'op-caja-chica:reopen_box' },
  { group: 'Logística', id: 'ingresar-stock', label: 'Ingresar stock', action: 'registerStockEntry' },
  { group: 'Logística', id: 'preparar-envio', label: 'Preparar un envío', action: 'addShipment', args: [{ status: 'Borrador' }] },
  { group: 'Logística', id: 'despachar-envio', label: 'Despachar un envío', action: 'updateShipment', args: ['ENV', { status: 'En tránsito' }] },
  { group: 'Logística', id: 'recibir-envio', label: 'Confirmar la recepción de un envío', action: 'confirmReception', args: [{ docType: 'Envío' }] },
  { group: 'Logística', id: 'aprobar-transferencia', label: 'Aprobar una transferencia', action: 'updateTransferStatus', args: ['TRF', 'Aprobada'] },
  { group: 'Logística', id: 'ajustar-stock', label: 'Registrar un ajuste o merma', action: 'addAdjustment' },
  { group: 'Psicopedagogía', id: 'agendar', label: 'Agendar una asesoría', action: 'addSchedule' },
  { group: 'Psicopedagogía', id: 'reprogramar', label: 'Reprogramar una asesoría', action: 'updateSchedule', args: ['SES', { date: '2026-01-01' }] },
  { group: 'Psicopedagogía', id: 'asistencia', label: 'Marcar la asistencia', action: 'updateSchedule', args: ['SES', { status: 'Faltó' }] },
  { group: 'Psicopedagogía', id: 'seguimiento', label: 'Registrar una sesión de seguimiento', action: 'addTracking' },
  { group: 'Personal', id: 'crear-contrato', label: 'Crear un contrato', action: 'addContract' },
  { group: 'Personal', id: 'renovar-contrato', label: 'Renovar un contrato', action: 'renewContract' },
  { group: 'Personal', id: 'generar-planilla', label: 'Generar la planilla', action: 'generatePayroll' },
  { group: 'Personal', id: 'cerrar-planilla', label: 'Cerrar la planilla', action: 'closePayroll' },
  { group: 'Oferta comercial', id: 'crear-tarifa', label: 'Crear un tarifario', action: 'addTariff' },
  { group: 'Oferta comercial', id: 'crear-promocion', label: 'Crear una promoción', action: 'addPromotion' },
  { group: 'Organización', id: 'crear-sede', label: 'Crear una sede', action: 'addBranch' },
  { group: 'Organización', id: 'crear-rol', label: 'Crear un rol', action: 'addRole', args: [{}] },
  { group: 'Organización', id: 'configurar-permisos', label: 'Configurar los permisos de un rol', action: 'savePermissions' },
  { group: 'Organización', id: 'crear-usuario', label: 'Crear una cuenta', action: 'addUser' },
];

export interface AccountProfile {
  id: string;
  name: string;
  role: string;
  branch: string;
  status: User['status'];
  /** Funciones del rol (el Superusuario las tiene todas). */
  capabilities: string[];
  /** Ítems del menú que ve (solo los que piden una función): «Módulo › Ítem». */
  menu: string[];
  /** Ve el botón «Configuración» de abajo. */
  settings: boolean;
  /** Primera pantalla al entrar. */
  firstPath: string;
  dashboard: DashboardLayout;
  scope: SessionScope;
  /** Acciones clave que puede ejecutar (ids de `KEY_ACTIONS`). */
  allowed: string[];
  /** Acciones guardadas del sistema que puede ejecutar, de todas. */
  allowedActions: number;
  /** Avisos que recibe para un caso en su propia sede (ids de evento). */
  notices: string[];
}

export interface MatrixSources { users: User[]; roles: Role[]; permissions: Permission[]; branches: Branch[]; warehouses: Warehouse[] }

/** ¿Puede esta cuenta ejecutar la acción con esos argumentos? Es la misma comprobación de `guardActions`. */
export function canRunKeyAction(can: (capabilityId: string) => boolean, a: KeyAction): boolean {
  return a.capability ? can(a.capability) : canRunAction(can, a.action!, a.args);
}

export function canRunAction(can: (capabilityId: string) => boolean, action: string, args: unknown[] = []): boolean {
  const requirement = requirementOf(action, args);
  return requirement === null || unmetClause(requirement, can) === null;
}

const ALL_OFFERED = ALL_CAPABILITIES.filter(c => !c.reserved).map(c => c.id);

export function profileOf(user: User, src: MatrixSources, holders: Holder[]): AccountProfile {
  const authority = { user: { role: user.role }, roles: src.roles, permissions: src.permissions };
  const can = (id: string) => canDo(authority, id);
  const role = src.roles.find(r => r.name === user.role);
  const granted = user.role === 'Superusuario' ? ALL_OFFERED : src.permissions.find(p => p.roleId === role?.id)?.permissions ?? [];
  const menu = menuPreview(granted);
  const own = src.branches.find(b => b.name === user.branch) ?? src.branches.find(b => b.status === 'Activo' && b.name !== 'Todas');
  const warehouse = src.warehouses.find(w => w.status === 'Activo')?.id;
  // Un caso típico: algo que pasa en la sede de la cuenta (el origen de los envíos es el almacén)
  const scope = { subjectBranchId: own?.id, destinationBranchId: own?.id, originBranchId: warehouse };
  const guarded = [...new Set(ALL_CAPABILITIES.flatMap(c => c.actions))];
  return {
    id: user.id,
    name: user.name,
    role: user.role,
    branch: user.branch,
    status: user.status,
    capabilities: granted,
    menu: menu.modules.flatMap(m => m.items.map(i => (m.title === i ? i : `${m.title} › ${i}`))),
    settings: menu.settings,
    firstPath: firstPathFor(can),
    dashboard: dashboardLayout(can),
    scope: scopeOfUser(user, src.branches, can(PERM.allBranches), src.warehouses),
    allowed: KEY_ACTIONS.filter(a => canRunKeyAction(can, a)).map(a => a.id),
    allowedActions: guarded.filter(a => canRunAction(can, a)).length,
    notices: EVENTS.filter(e => resolveRecipients(e, scope, holders).userIds.includes(user.id)).map(e => e.id),
  };
}

export function accountProfiles(src: MatrixSources): AccountProfile[] {
  const holders = buildHolders(src);
  return src.users.filter(u => u.status === 'Activo').map(u => profileOf(u, src, holders));
}
