/**
 * Autoridad: quién puede pedir y quién puede resolver cada acción (funciones puras).
 *
 * Las solicitudes (caída, reactivación, cambio de programa, traslado) y las acciones de control (reversar un pago o un
 * movimiento, reabrir una caja, emitir notas de crédito…) NO dependen de que existan los roles de sesión: cada una pide un
 * permiso del catálogo de Organización → Permisos (`funcionalidad:acción`) y se pregunta siempre por `can()`. Hoy el único
 * usuario es el Superusuario, que lo puede todo; cuando se definan los roles basta marcar las casillas del rol, sin tocar
 * ninguna pantalla.
 *
 * Separación de funciones: `APPROVAL_POLICY.allowSelfApproval` indica si quien pidió una solicitud puede aprobarla él mismo.
 * Con varias cuentas y roles es `false`: quien pide no resuelve (el Superusuario, rol técnico, queda exento).
 */
import type { Permission, Role } from '../context/DataContext';

export const APPROVAL_POLICY = { allowSelfApproval: false };

export const SUPERUSER = 'Superusuario';

/** Permisos que usan las pantallas (deben existir en el catálogo de Permisos). */
export const PERM = {
  dropRequest: 'op-matriculas:req_drop',
  dropApprove: 'op-matriculas:approve_drop',
  reactivationRequest: 'op-matriculas:req_reactivation',
  reactivationApprove: 'op-matriculas:approve_reactivation',
  programChangeRequest: 'op-matriculas:req_program_change',
  programChangeApprove: 'op-matriculas:approve_program_change',
  transferRequest: 'op-matriculas:req_transfer',
  transferApprove: 'op-matriculas:approve_transfer',
  renew: 'op-matriculas:renew',
  correctData: 'op-matriculas:edit_data',
  documents: 'op-matriculas:documents',
  reversePayment: 'op-pagos:reverse_payment',
  creditNote: 'op-pagos:credit_note',
  reverseCash: 'op-caja:reverse_movement',
  deposit: 'op-caja:deposit',
  closeCash: 'op-caja:close_box',
  reopenCash: 'op-caja:reopen_box',
  reopenPetty: 'op-caja-chica:reopen_box',
  reversePetty: 'op-caja-chica:reverse_movement',
  closePetty: 'op-caja-chica:count',
  configPetty: 'op-caja-chica:config',
  collections: 'op-cobranza:view',
  sendReminders: 'op-cobranza:remind',
  chargeMora: 'op-cobranza:charge_mora',
  configCollections: 'op-cobranza:config',
  psiSchedule: 'psi-prog:create',
  psiActivityLead: 'psi-prog:activity_lead',
  psiActivityAttendance: 'psi-prog:activity_attendance',
  psiInstitutionalChange: 'psi-prog:institutional_change',
  psiRemind: 'psi-recordatorios:remind',
  psiConfig: 'psi-recordatorios:config',
  psiReport: 'rep-psicopedagogia:view',
  reportView: 'rep-general:view',
  reportExport: 'rep-general:export',
  userCreate: 'org-usuarios:create',
  userEdit: 'org-usuarios:edit',
  userDeactivate: 'org-usuarios:deactivate',
  payrollView: 'per-planilla:view',
  payrollGenerate: 'per-planilla:generate',
  payrollAdjust: 'per-planilla:adjust',
  payrollClose: 'per-planilla:close',
  payrollReopen: 'per-planilla:reopen',
  payView: 'per-remuneracion:view',
  auditView: 'sis-auditoria:view',
  reportEnrollments: 'rep-matriculas:view',
  reportPortfolio: 'rep-cartera:view',
  reportCash: 'rep-caja:view',
  reportVerification: 'rep-verificacion:view',
  reportStock: 'rep-stock:view',
  reportPsychopedagogy: 'rep-psicopedagogia:view',
  reportStaff: 'rep-personal:view',
  recipeCreate: 'com-recetas:create',
  recipeEdit: 'com-recetas:edit',
  recipeStatus: 'com-recetas:deactivate',
  itemSale: 'op-caja:sell_item',
  stockEntry: 'log-stock:entry',
  deliverMaterials: 'op-verificacion:deliver',
  allBranches: 'org-alcance:all_branches',
} as const;

export type ChangeKind = 'Caída' | 'Reactivación' | 'Cambio de programa' | 'Traslado de sede';

export const REQUEST_RULES: Record<ChangeKind, { request: string; approve: string }> = {
  'Caída': { request: PERM.dropRequest, approve: PERM.dropApprove },
  'Reactivación': { request: PERM.reactivationRequest, approve: PERM.reactivationApprove },
  'Cambio de programa': { request: PERM.programChangeRequest, approve: PERM.programChangeApprove },
  'Traslado de sede': { request: PERM.transferRequest, approve: PERM.transferApprove },
};

export interface AuthorityContext {
  user: { role: string; name?: string };
  roles: Pick<Role, 'id' | 'name' | 'status'>[];
  permissions: Permission[];
}

/** ¿El usuario tiene el permiso `funcionalidad:acción`? El Superusuario puede todo. */
export function can(ctx: AuthorityContext, permission: string): boolean {
  if (ctx.user.role === SUPERUSER) return true;
  const role = ctx.roles.find(r => r.name === ctx.user.role && r.status === 'Activo');
  if (!role) return false;
  return (ctx.permissions.find(p => p.roleId === role.id)?.permissions ?? []).includes(permission);
}

export interface Decision {
  ok: boolean;
  reason?: string;
}

export function canRequest(ctx: AuthorityContext, kind: ChangeKind): Decision {
  return can(ctx, REQUEST_RULES[kind].request) ? { ok: true } : { ok: false, reason: `Su rol no puede solicitar «${kind.toLowerCase()}» (permiso ${REQUEST_RULES[kind].request}).` };
}

/** ¿Puede resolver (aprobar o rechazar) la solicitud? Además del permiso, aplica la separación de funciones. */
export function canResolve(ctx: AuthorityContext, kind: ChangeKind, requestedBy: string): Decision {
  if (!can(ctx, REQUEST_RULES[kind].approve)) return { ok: false, reason: `Su rol no puede resolver solicitudes de «${kind.toLowerCase()}» (permiso ${REQUEST_RULES[kind].approve}).` };
  if (!APPROVAL_POLICY.allowSelfApproval && ctx.user.name && ctx.user.name === requestedBy && ctx.user.role !== SUPERUSER) {
    return { ok: false, reason: 'Quien pidió la solicitud no puede resolverla: debe hacerlo otra persona con autoridad.' };
  }
  return { ok: true };
}
