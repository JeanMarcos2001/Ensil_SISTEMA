/**
 * Plantillas de rol (los 6 roles de partida). Son DATOS, no código: se cargan como roles de ejemplo con el mismo constructor y se
 * pueden editar o duplicar. Cada plantilla lista las funciones que MARCA una persona; lo que esas funciones necesitan se suma solo
 * (`roleClosure`), igual que en el constructor.
 *
 * Separación de funciones que respetan (ver `INCOMPATIBILITIES`): la sede cobra y cierra la caja pero NO reversa pagos ni reabre cierres
 * (eso es de Administración general); el almacén despacha pero NO confirma recepciones de envíos; quien aprueba una solicitud no es
 * quien la pide; la planilla es informativa (el sistema no registra pagos al personal) y nadie la «paga».
 */
import { ALL_CAPABILITIES, roleClosure } from './capabilities';

export interface RoleTemplate {
  id: string;
  name: string;
  desc: string;
  /** Funciones que marca la plantilla (sin las que se suman solas). */
  capabilities: string[];
  /** Cuentas activas que admite el rol por sede (sin valor = sin límite). */
  branchUserLimit?: number;
  /** El rol no se edita, desactiva ni elimina (solo el Superusuario). */
  locked?: boolean;
  /** Para qué sirve, en una línea (se muestra al elegir la plantilla). */
  summary: string;
  /** Combinaciones a separar que la plantilla reúne A PROPÓSITO, con su motivo (regla → motivo). Sin esto, el rol no se podría guardar. */
  risks?: Record<string, string>;
}

const ALL = (functionality: string): string[] => ALL_CAPABILITIES.filter(c => c.functionality === functionality && !c.reserved).map(c => c.id);

const ADMIN_SEDE: string[] = [
  'dash-resumen:view', 'dash-resumen:view_money', 'msg-mensajeria:view', 'sis-avisos:view',
  // Matrícula, alumnos y titulares
  'op-matriculas:view', 'op-matriculas:create', 'op-matriculas:renew', 'op-matriculas:documents',
  'op-matriculas:req_drop', 'op-matriculas:req_reactivation', 'op-matriculas:req_program_change', 'op-matriculas:req_transfer',
  'per-alumnos:view', 'per-alumnos:create', 'per-alumnos:edit', 'per-titulares:view', 'per-titulares:create', 'per-titulares:edit',
  // Dinero de la sede: cobra, vende y cierra; no reversa ni reabre
  'op-pagos:view', 'op-pagos:register',
  'op-caja:view', 'op-caja:reg_income', 'op-caja:reg_expense', 'op-caja:deposit', 'op-caja:close_box', 'op-caja:sell_item',
  'op-caja-chica:view', 'op-caja-chica:reg_movement', 'op-caja-chica:count',
  'op-cobranza:view', 'op-cobranza:remind', 'op-cobranza:charge_mora',
  // Materiales y recepción
  'op-verificacion:view', 'op-verificacion:deliver',
  'log-stock:view', 'log-recepciones:view', 'log-recepciones:confirm', 'log-kardex:view',
  'log-transfer:view', 'log-transfer:req_transfer', 'log-transfer:receive',
  // Asesorías y cronogramas (el alumno fija su horario en secretaría)
  'psi-prog:view', 'psi-prog:create', 'psi-prog:reschedule', 'psi-prog:export_schedule',
  'psi-cronogramas:view', 'psi-cronogramas:create', 'psi-cronogramas:edit', 'psi-historial:view', 'psi-recordatorios:view', 'psi-recordatorios:remind',
  // Reportes de su sede y cierres
  'rep-general:view', 'rep-matriculas:view', 'rep-cartera:view', 'rep-caja:view', 'rep-verificacion:view', 'sis-cierres:view',
];

const PSICOPEDAGOGIA: string[] = [
  'dash-resumen:view', 'msg-mensajeria:view', 'sis-avisos:view',
  'psi-prog:view', 'psi-prog:mark_attendance', 'psi-prog:reg_tracking', 'psi-prog:activity_lead', 'psi-prog:activity_attendance', 'psi-prog:export_schedule',
  'psi-historial:view', 'psi-cronogramas:view', 'psi-recordatorios:view',
  'per-alumnos:view',
  'rep-general:view', 'rep-psicopedagogia:view',
];

const ALMACEN: string[] = [
  'dash-resumen:view', 'msg-mensajeria:view', 'sis-avisos:view', 'org-alcance:all_branches',
  'log-catalogo:view', 'log-catalogo:create', 'log-catalogo:edit',
  'log-stock:view', 'log-stock:edit_min', 'log-stock:pack', 'log-stock:entry',
  'log-envios:view', 'log-envios:create', 'log-envios:edit', 'log-envios:dispatch',
  'log-transfer:view', 'log-transfer:approve_transfer', 'log-transfer:dispatch',
  'log-kardex:view', 'log-ajustes:view', 'log-ajustes:create',
  'rep-general:view', 'rep-stock:view',
];

const ADMIN_GENERAL: string[] = [
  'dash-resumen:view', 'dash-resumen:view_money', 'msg-mensajeria:view', 'org-alcance:all_branches',
  // Aprueba lo que las sedes piden, y lo que lleva control
  'op-matriculas:view', 'op-matriculas:approve_drop', 'op-matriculas:approve_reactivation', 'op-matriculas:approve_program_change', 'op-matriculas:approve_transfer',
  'op-matriculas:edit_data', 'op-matriculas:extend', 'sis-solicitudes:view',
  'op-pagos:view', 'op-pagos:reverse_payment', 'op-pagos:credit_note',
  'op-caja:view', 'op-caja:reverse_movement', 'op-caja:reopen_box', 'op-caja-chica:view', 'op-caja-chica:reverse_movement', 'op-caja-chica:reopen_box', 'op-caja-chica:config',
  'op-cobranza:view', 'op-cobranza:refinance', 'op-cobranza:config',
  // Fija los precios de los artículos (el almacén los ve y mueve el stock, pero no los cambia)
  'log-catalogo:view', 'log-catalogo:edit_price',
  // Oferta comercial
  ...ALL('com-programas'), ...ALL('com-niveles'), ...ALL('com-tipos-pago'), ...ALL('com-tarifarios'), ...ALL('com-promociones'), ...ALL('com-recetas'),
  // Personal, contratos y planilla (informativa: el sistema no registra pagos al personal)
  'per-personal:view', 'per-personal:create', 'per-personal:edit', 'per-personal:inactivate', 'per-personal:reactivate',
  'per-contratos:view', 'per-contratos:create', 'per-contratos:edit', 'per-contratos:close', 'per-contratos:renew', 'per-asignaciones:view', 'per-asignaciones:save', 'per-asignaciones:close',
  'per-planilla:view', 'per-planilla:generate', 'per-planilla:adjust', 'per-planilla:close', 'per-planilla:reopen', 'per-remuneracion:view',
  'org-empresas:view', 'org-filiales:view',
  // Todos los reportes, auditoría y supervisión
  'rep-general:view', 'rep-general:export', 'rep-matriculas:view', 'rep-cartera:view', 'rep-caja:view', 'rep-verificacion:view', 'rep-stock:view', 'rep-psicopedagogia:view', 'rep-personal:view',
  'sis-auditoria:view', 'sis-cierres:view', 'sis-cierres:view_reopenings', 'sis-avisos:view', 'sis-avisos:supervise', 'sis-avisos:fallback',
];

const CONTABILIDAD: string[] = [
  'dash-resumen:view', 'dash-resumen:view_money', 'msg-mensajeria:view', 'sis-avisos:view', 'org-alcance:all_branches',
  'op-pagos:view', 'op-caja:view', 'op-caja-chica:view', 'op-cobranza:view',
  'per-planilla:view', 'per-remuneracion:view',
  'rep-general:view', 'rep-general:export', 'rep-cartera:view', 'rep-caja:view', 'rep-personal:view', 'sis-cierres:view',
];

const SUPERUSUARIO: string[] = ALL_CAPABILITIES.filter(c => !c.reserved).map(c => c.id);

export const ROLE_TEMPLATES: RoleTemplate[] = [
  { id: 'admin-sede', name: 'Administrador de sede', desc: 'Matrículas, caja, cobranza, materiales y asesorías de su sede', summary: 'Una cuenta por persona de la sede (1 a 3): matricula, cobra, cierra la caja, entrega materiales, recibe envíos y agenda asesorías. No reversa pagos ni reabre cierres.', capabilities: ADMIN_SEDE, branchUserLimit: 3 },
  { id: 'psicopedagogia', name: 'Psicopedagogía', desc: 'Seguimiento del alumno y asistencia; sin dinero', summary: 'Marca la asistencia y registra el seguimiento. La agenda la ve en lectura y no ve dinero.', capabilities: PSICOPEDAGOGIA, branchUserLimit: 3 },
  { id: 'almacen-central', name: 'Almacén central', desc: 'Catálogo, stock, envíos, transferencias, kardex y ajustes', summary: 'Un solo almacén para toda la empresa (Los Olivos): abastece a las sedes. Despacha, pero no confirma recepciones. Hasta 3 cuentas (jefe y auxiliares).', capabilities: ALMACEN, branchUserLimit: 3 },
  { id: 'admin-general', name: 'Administración general', desc: 'Aprobaciones, oferta comercial, personal, planilla y auditoría', summary: 'Aprueba caídas, reactivaciones, cambios y traslados; reversas con devolución y reaperturas; oferta comercial; personal y planilla; todos los reportes.', capabilities: ADMIN_GENERAL, risks: { 'reversar-reabrir-caja': 'Es el único rol que reversa movimientos de caja y reabre cierres: la sede no puede hacerlo (separación respecto a quien cobra).', 'reversar-reabrir-caja-chica': 'Lo mismo con la caja chica: la sede la cuenta y la cierra, pero solo Administración general reversa sus gastos y reabre su conteo.' } },
  { id: 'contabilidad', name: 'Contabilidad', desc: 'Lectura y exportación de caja, cartera y planilla', summary: 'Solo lectura y exportación de caja, cartera y planilla de todas las sedes. No registra nada ni arma la planilla.', capabilities: CONTABILIDAD },
  { id: 'superusuario', name: 'Superusuario', desc: 'Roles, usuarios y configuración técnica', summary: 'Puede todo, en todas las sedes. Es el rol técnico de sistemas: no se edita ni se elimina.', capabilities: SUPERUSUARIO, locked: true },
];

export const templateById = (id: string | undefined): RoleTemplate | undefined => ROLE_TEMPLATES.find(t => t.id === id);

/** Las funciones de la plantilla con todo lo que necesitan (el rol queda completo). */
export const templatePermissions = (t: RoleTemplate): string[] => roleClosure(t.capabilities).all;
