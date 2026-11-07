/**
 * Registro único de funciones (los datos).
 *
 * Cada cosa que una persona puede hacer en el sistema se declara AQUÍ, una sola vez, con sus conexiones:
 *  - `requires`: otras funciones que el mismo usuario necesita (enviar necesita ver el stock);
 *  - `counterpart`: lo que debe poder hacer OTRA persona para que esta función tenga sentido (enviar necesita que alguien reciba en la sede destino);
 *  - `reads` / `writes`: los datos que lee y escribe (alimentan el mapa de conexiones);
 *  - `emits`: los avisos que dispara;
 *  - `actions`: las acciones de `DataContext` que protege (verificado por `scripts/check-capabilities.ts`).
 *
 * El identificador de cada función es el permiso `funcionalidad:acción` de siempre (`op-caja:close_box`): por eso los roles y las
 * llamadas `can(PERM.x)` existentes siguen valiendo. El catálogo de Organización → Permisos, el constructor de roles y el reparto de
 * avisos se DERIVAN de este archivo (reglas en `utils/capabilities.ts`).
 */

export type CapabilityKind = 'ver' | 'crear' | 'editar' | 'eliminar' | 'operar' | 'aprobar' | 'exportar' | 'configurar';
/** dinero = mueve o muestra dinero · remuneracion = muestra sueldos · control = reversa, cierre, baja (pide motivo y deja historial). */
export type Sensitivity = 'dinero' | 'remuneracion' | 'control';
/** Dónde debe estar la contraparte: en la misma sede, en la sede destino o en cualquiera. */
export type Where = 'same-branch' | 'destination-branch' | 'any';
export type RecipientWhere = 'destination-branch' | 'origin-branch' | 'subject-branch' | 'any';

export interface MenuRef { module: string; item: string }

export interface Counterpart {
  /** Función que debe tener otra persona. */
  capability: string;
  where: Where;
  /** required: sin contraparte la función no se ofrece · advisory: se ofrece y se avisa. */
  strength: 'required' | 'advisory';
  why: string;
}

export interface CapabilityDef {
  /** `funcionalidad:acción`: el permiso que se guarda en el rol. */
  id: string;
  functionality: string;
  action: string;
  label: string;
  kind: CapabilityKind;
  requires: string[];
  reads: string[];
  writes: string[];
  emits: string[];
  /** Lo que deben poder hacer OTRAS personas para que esta función tenga sentido (puede haber varias). */
  counterparts: Counterpart[];
  /** Acciones de `DataContext` que esta función protege. */
  actions: string[];
  /** Ítem del menú que esta función hace visible (la función «ver» de cada pantalla). */
  menu?: MenuRef;
  sensitive?: Sensitivity;
  /** Reservada: todavía no hay un proceso detrás; no se ofrece en el catálogo. */
  reserved?: boolean;
  note?: string;
}

export interface FunctionalityDef { id: string; name: string; module: string; capabilities: CapabilityDef[] }

export const CATALOG_MODULES: { id: string; name: string }[] = [
  { id: 'mod-dashboard', name: 'Dashboard' },
  { id: 'mod-mensajeria', name: 'Mensajería' },
  { id: 'mod-operacion', name: 'Operación' },
  { id: 'mod-logistica', name: 'Logística' },
  { id: 'mod-psico', name: 'Psicopedagogía' },
  { id: 'mod-personas', name: 'Personas' },
  { id: 'mod-comercial', name: 'Oferta comercial' },
  { id: 'mod-org', name: 'Organización' },
  { id: 'mod-reportes', name: 'Reportes' },
  { id: 'mod-sistema', name: 'Sistema' },
  { id: 'mod-config', name: 'Configuración' },
];

/** Los datos que las funciones leen y escriben (los nodos de datos del mapa). */
export const ENTITIES: Record<string, string> = {
  student: 'Alumno', guardian: 'Titular', enrollment: 'Matrícula', enrollmentRequest: 'Solicitud sobre una matrícula', document: 'Contrato y ficha',
  plan: 'Plan de pago', installment: 'Cuota', payment: 'Pago', creditNote: 'Nota de crédito', cashMovement: 'Movimiento de caja', deposit: 'Lote de depósito',
  cashClosure: 'Cierre de caja', pettyCash: 'Caja chica', collectionPolicy: 'Política de cobranza', reminder: 'Recordatorio de cobro', verification: 'Verificación de materiales',
  item: 'Artículo', itemPrice: 'Precio de artículo', stock: 'Stock', kardex: 'Kardex', shipment: 'Envío', transfer: 'Transferencia', reception: 'Recepción', adjustment: 'Ajuste o merma',
  schedule: 'Asesoría', tracking: 'Seguimiento de la sesión', monthlySchedule: 'Cronograma mensual', activity: 'Actividad especial', psyReminder: 'Recordatorio de Psicopedagogía', capacity: 'Cupos',
  staff: 'Personal', contract: 'Contrato de trabajo', assignment: 'Asignación', payroll: 'Planilla', role: 'Rol', permission: 'Permisos del rol', user: 'Cuenta de usuario',
  company: 'Empresa', branch: 'Filial', warehouse: 'Almacén', program: 'Programa', level: 'Nivel', paymentType: 'Tipo de pago', tariff: 'Tarifario', promotion: 'Promoción', recipe: 'Receta de materiales',
  leadSource: 'Origen de lead', contractTemplate: 'Plantilla de contrato', notification: 'Aviso', audit: 'Auditoría',
  courier: 'Courier', shippingMethod: 'Método de envío',
};

export type Recipient = { capability: string; where: RecipientWhere } | { person: 'requester' | 'emitter' };

export interface EventDef {
  id: string;
  label: string;
  /** accion: lo dispara una función · sistema: lo dispara una regla por fecha o por estado. */
  trigger: 'accion' | 'sistema';
  /** Quienes reciben el aviso (se suman). */
  recipients: Recipient[];
  /** Quien recibe el aviso cuando nadie cumple lo anterior (ver `sis-avisos:fallback`). */
  fallback: string;
}

const FALLBACK = 'sis-avisos:fallback';

/** Avisos con destinatario: llegan a quien tenga la función indicada en la sede que corresponde, no a un nombre de rol. */
const SUPERVISE: Recipient = { capability: 'sis-avisos:supervise', where: 'any' };
export const EVENTS: EventDef[] = [
  // Logística
  { id: 'shipment_dispatched', label: 'Envío despachado', trigger: 'accion', recipients: [{ capability: 'log-recepciones:confirm', where: 'destination-branch' }], fallback: FALLBACK },
  { id: 'shipment_cancelled', label: 'Envío cancelado', trigger: 'accion', recipients: [{ capability: 'log-recepciones:confirm', where: 'destination-branch' }], fallback: FALLBACK },
  { id: 'shipment_received', label: 'Envío recibido', trigger: 'accion', recipients: [{ capability: 'log-envios:dispatch', where: 'origin-branch' }], fallback: FALLBACK },
  { id: 'transfer_requested', label: 'Transferencia solicitada', trigger: 'accion', recipients: [{ capability: 'log-transfer:approve_transfer', where: 'any' }], fallback: FALLBACK },
  { id: 'transfer_decided', label: 'Transferencia aprobada o rechazada', trigger: 'accion', recipients: [{ person: 'requester' }], fallback: FALLBACK },
  { id: 'transfer_dispatched', label: 'Transferencia en tránsito', trigger: 'accion', recipients: [{ capability: 'log-transfer:receive', where: 'destination-branch' }], fallback: FALLBACK },
  { id: 'transfer_received', label: 'Transferencia recibida', trigger: 'accion', recipients: [{ capability: 'log-transfer:dispatch', where: 'origin-branch' }], fallback: FALLBACK },
  { id: 'reception_with_differences', label: 'Recepción con faltante o daño', trigger: 'accion', recipients: [{ capability: 'log-ajustes:create', where: 'origin-branch' }, SUPERVISE], fallback: FALLBACK },
  { id: 'stock_below_minimum', label: 'Stock por debajo del mínimo', trigger: 'sistema', recipients: [{ capability: 'log-transfer:req_transfer', where: 'subject-branch' }, { capability: 'log-envios:create', where: 'any' }], fallback: FALLBACK },
  // Matrícula
  { id: 'drop_request_pending', label: 'Solicitud de caída pendiente', trigger: 'accion', recipients: [{ capability: 'op-matriculas:approve_drop', where: 'any' }], fallback: FALLBACK },
  { id: 'reactivation_request_pending', label: 'Solicitud de reactivación pendiente', trigger: 'accion', recipients: [{ capability: 'op-matriculas:approve_reactivation', where: 'any' }], fallback: FALLBACK },
  { id: 'program_change_request_pending', label: 'Solicitud de cambio de programa pendiente', trigger: 'accion', recipients: [{ capability: 'op-matriculas:approve_program_change', where: 'any' }], fallback: FALLBACK },
  { id: 'enrollment_transfer_pending', label: 'Solicitud de traslado de sede pendiente', trigger: 'accion', recipients: [{ capability: 'op-matriculas:approve_transfer', where: 'any' }], fallback: FALLBACK },
  { id: 'request_resolved', label: 'Solicitud resuelta', trigger: 'accion', recipients: [{ person: 'requester' }], fallback: FALLBACK },
  { id: 'first_session_without_materials', label: 'Primera asesoría sin materiales entregados', trigger: 'sistema', recipients: [{ capability: 'op-verificacion:deliver', where: 'subject-branch' }, { capability: 'psi-prog:mark_attendance', where: 'subject-branch' }], fallback: FALLBACK },
  // Dinero
  { id: 'payment_reversed', label: 'Pago reversado', trigger: 'accion', recipients: [SUPERVISE], fallback: FALLBACK },
  { id: 'cash_movement_reversed', label: 'Movimiento de caja reversado', trigger: 'accion', recipients: [SUPERVISE], fallback: FALLBACK },
  { id: 'cash_reopened', label: 'Caja reabierta', trigger: 'accion', recipients: [SUPERVISE], fallback: FALLBACK },
  { id: 'installment_refinanced', label: 'Cuota refinanciada', trigger: 'accion', recipients: [{ capability: 'op-cobranza:view', where: 'subject-branch' }, SUPERVISE], fallback: FALLBACK },
  { id: 'installment_overdue', label: 'Cuotas vencidas', trigger: 'sistema', recipients: [{ capability: 'op-cobranza:remind', where: 'subject-branch' }], fallback: FALLBACK },
  // Personal y seguridad
  { id: 'contract_expiring', label: 'Contratos por vencer', trigger: 'sistema', recipients: [{ capability: 'per-contratos:edit', where: 'any' }], fallback: FALLBACK },
  { id: 'role_permissions_changed', label: 'Permisos de un rol modificados', trigger: 'accion', recipients: [SUPERVISE], fallback: FALLBACK },
];

export interface IncompatibilityDef {
  id: string;
  /** Si el rol reúne TODAS estas funciones, se avisa. */
  capabilities: string[];
  message: string;
}

/** Separación de funciones: combinaciones que un rol no debería reunir sin una razón. Se muestran como advertencia y piden motivo para guardar. */
export const INCOMPATIBILITIES: IncompatibilityDef[] = [
  // Dinero
  { id: 'cobrar-reversar-cerrar', capabilities: ['op-pagos:register', 'op-pagos:reverse_payment', 'op-caja:close_box'], message: 'Quien cobra, reversa los pagos y cierra la caja puede ocultar una diferencia sin que nadie más lo vea.' },
  { id: 'cobrar-nota-credito', capabilities: ['op-pagos:register', 'op-pagos:credit_note'], message: 'Quien cobra y también emite notas de crédito puede devolver dinero de lo que él mismo cobró.' },
  { id: 'reversar-reabrir-caja', capabilities: ['op-caja:reverse_movement', 'op-caja:reopen_box'], message: 'Quien reversa movimientos y también reabre los cierres puede modificar un día ya arqueado.' },
  { id: 'reversar-reabrir-caja-chica', capabilities: ['op-caja-chica:reverse_movement', 'op-caja-chica:reopen_box'], message: 'Quien reversa gastos de la caja chica y también reabre sus cierres puede modificar un conteo ya hecho.' },
  { id: 'caja-egreso-reversa-cierre', capabilities: ['op-caja:reg_expense', 'op-caja:reverse_movement', 'op-caja:close_box'], message: 'Quien registra egresos, los reversa y cierra la caja puede esconder una salida de dinero.' },
  { id: 'caja-chica-gasto-reversa-arqueo', capabilities: ['op-caja-chica:reg_movement', 'op-caja-chica:reverse_movement', 'op-caja-chica:count'], message: 'Quien gasta de la caja chica, reversa los gastos y hace el arqueo puede cuadrar la caja a su favor.' },
  // Solicitudes sobre matrículas
  { id: 'pedir-aprobar-caida', capabilities: ['op-matriculas:req_drop', 'op-matriculas:approve_drop'], message: 'Quien pide una caída y la aprueba no tiene quien lo revise.' },
  { id: 'pedir-aprobar-reactivacion', capabilities: ['op-matriculas:req_reactivation', 'op-matriculas:approve_reactivation'], message: 'Quien pide una reactivación y la aprueba no tiene quien lo revise.' },
  { id: 'pedir-aprobar-cambio', capabilities: ['op-matriculas:req_program_change', 'op-matriculas:approve_program_change'], message: 'Quien pide un cambio de programa y lo aprueba no tiene quien lo revise.' },
  { id: 'pedir-aprobar-traslado', capabilities: ['op-matriculas:req_transfer', 'op-matriculas:approve_transfer'], message: 'Quien pide un traslado y lo aprueba no tiene quien lo revise.' },
  // Mercadería
  { id: 'despachar-recibir', capabilities: ['log-envios:dispatch', 'log-recepciones:confirm'], message: 'Quien despacha un envío y también lo recibe puede dar por recibida mercadería que nunca llegó.' },
  { id: 'transferir-aprobar-recibir', capabilities: ['log-transfer:approve_transfer', 'log-transfer:dispatch', 'log-transfer:receive'], message: 'Quien aprueba, despacha y recepciona una transferencia controla todo el movimiento sin contrapeso.' },
  // Personal y planilla
  { id: 'ficha-cuenta-rol', capabilities: ['per-personal:create', 'org-usuarios:create', 'org-usuarios:assign_role'], message: 'Quien crea la ficha, la cuenta y le asigna el rol puede inventar a un trabajador con acceso.' },
  // Accesos
  { id: 'roles-asignar', capabilities: ['org-roles:config_perms', 'org-usuarios:assign_role'], message: 'Quien define los permisos y también asigna los roles puede darse a sí mismo cualquier acceso.' },
];

// ---------------------------------------------------------------------------------------------------------------------------------
// Construcción del registro
// ---------------------------------------------------------------------------------------------------------------------------------

interface Raw {
  action: string;
  label: string;
  kind: CapabilityKind;
  requires?: string[];
  reads?: string[];
  writes?: string[];
  emits?: string[];
  counterparts?: Counterpart[];
  actions?: string[];
  menu?: MenuRef;
  sensitive?: Sensitivity;
  reserved?: boolean;
  note?: string;
}

const cp = (capability: string, where: Where, strength: 'required' | 'advisory', why: string): Counterpart => ({ capability, where, strength, why });
const menu = (module: string, item: string): MenuRef => ({ module, item });

/** Una funcionalidad con sus funciones; los nombres cortos de `requires` («view») se completan con la funcionalidad. */
function f(id: string, name: string, module: string, caps: Raw[]): FunctionalityDef {
  return {
    id, name, module,
    capabilities: caps.map(c => ({
      id: `${id}:${c.action}`,
      functionality: id,
      action: c.action,
      label: c.label,
      kind: c.kind,
      requires: (c.requires ?? []).map(r => (r.includes(':') ? r : `${id}:${r}`)),
      reads: c.reads ?? [],
      writes: c.writes ?? [],
      emits: c.emits ?? [],
      counterparts: c.counterparts ?? [],
      actions: c.actions ?? [],
      menu: c.menu,
      sensitive: c.sensitive,
      reserved: c.reserved,
      note: c.note,
    })),
  };
}

/** Ver / crear / editar / eliminar de un catálogo simple. */
function crud(o: { entity: string; one: string; many: string; menu?: MenuRef; reads?: string[]; create?: string[]; edit?: string[]; remove?: string[]; noDelete?: boolean }): Raw[] {
  const rows: Raw[] = [
    { action: 'view', label: `Ver ${o.many}`, kind: 'ver', menu: o.menu, reads: [o.entity, ...(o.reads ?? [])] },
    { action: 'create', label: `Crear ${o.one}`, kind: 'crear', requires: ['view'], writes: [o.entity], actions: o.create },
    { action: 'edit', label: `Editar ${o.one}`, kind: 'editar', requires: ['view'], writes: [o.entity], actions: o.edit },
  ];
  if (!o.noDelete) rows.push({ action: 'delete', label: `Eliminar ${o.one}`, kind: 'eliminar', requires: ['view'], writes: [o.entity], actions: o.remove, sensitive: 'control' });
  return rows;
}

const OP = 'operacion';
const NOBODY_APPROVES = 'Si nadie puede aprobarla, la solicitud quedará pendiente.';

export const FUNCTIONALITIES: FunctionalityDef[] = [
  // ----------------------------------------------------------------------------------------------------------- Dashboard y Mensajería
  f('dash-resumen', 'Resumen general', 'mod-dashboard', [
    { action: 'view', label: 'Ver el resumen general', kind: 'ver', menu: menu('dashboard', 'Resumen general'), reads: ['enrollment', 'plan', 'schedule', 'stock', 'enrollmentRequest', 'audit'] },
    { action: 'view_money', label: 'Ver las cifras de dinero (caja, cobros y vencimientos)', kind: 'ver', requires: ['view'], reads: ['payment', 'cashMovement', 'installment'], sensitive: 'dinero' },
  ]),
  f('msg-mensajeria', 'Mensajería', 'mod-mensajeria', [
    { action: 'view', label: 'Ver la mensajería', kind: 'ver', menu: menu('mensajeria', 'Mensajería'), reads: ['staff'] },
  ]),

  // ----------------------------------------------------------------------------------------------------------- Operación
  f('op-matriculas', 'Matrículas', 'mod-operacion', [
    { action: 'view', label: 'Ver matrículas', kind: 'ver', menu: menu(OP, 'Matrículas'), reads: ['enrollment', 'student', 'guardian', 'plan', 'program', 'level'] },
    {
      action: 'create', label: 'Crear matrícula', kind: 'crear', requires: ['view'], sensitive: 'dinero',
      reads: ['program', 'level', 'tariff', 'promotion', 'paymentType'], writes: ['enrollment', 'student', 'guardian', 'plan', 'payment', 'cashMovement', 'verification', 'schedule'],
      actions: ['registerEnrollments', 'addStudent', 'addGuardian'],
      counterparts: [
        cp('op-verificacion:deliver', 'same-branch', 'advisory', 'Sin quien entregue los materiales en la sede, la matrícula quedará esperando su verificación y la primera asesoría no podrá darse.'),
        cp('psi-prog:create', 'same-branch', 'advisory', 'Sin quien agende asesorías en la sede, el alumno matriculado no tendrá su primera asesoría.'),
      ],
    },
    { action: 'edit_draft', label: 'Editar borrador', kind: 'editar', requires: ['view'], reserved: true, note: 'Reservada: hoy no existen matrículas en borrador.' },
    { action: 'confirm', label: 'Confirmar matrícula', kind: 'operar', requires: ['view'], reserved: true, note: 'Reservada: la matrícula se confirma al registrarla.' },
    {
      action: 'req_drop', label: 'Solicitar caída', kind: 'operar', requires: ['view'], writes: ['enrollmentRequest'], emits: ['drop_request_pending'], actions: ['requestEnrollmentDrop'],
      counterparts: [cp('op-matriculas:approve_drop', 'any', 'advisory', NOBODY_APPROVES)],
    },
    {
      action: 'approve_drop', label: 'Aprobar caída', kind: 'aprobar', requires: ['view', 'sis-solicitudes:view'], sensitive: 'control', reads: ['enrollmentRequest'],
      writes: ['enrollment', 'plan', 'installment', 'enrollmentRequest'], emits: ['request_resolved'], actions: ['resolveEnrollmentDrop'],
    },
    {
      action: 'req_reactivation', label: 'Solicitar reactivación', kind: 'operar', requires: ['view'], writes: ['enrollmentRequest'], emits: ['reactivation_request_pending'], actions: ['requestReactivation'],
      counterparts: [cp('op-matriculas:approve_reactivation', 'any', 'advisory', NOBODY_APPROVES)],
    },
    {
      action: 'approve_reactivation', label: 'Aprobar reactivación', kind: 'aprobar', requires: ['view', 'sis-solicitudes:view'], sensitive: 'control', reads: ['enrollmentRequest'],
      writes: ['enrollment', 'plan', 'installment', 'enrollmentRequest'], emits: ['request_resolved'], actions: ['resolveChangeRequest'],
    },
    {
      action: 'req_program_change', label: 'Solicitar cambio de programa o nivel', kind: 'operar', requires: ['view'], writes: ['enrollmentRequest'], emits: ['program_change_request_pending'], actions: ['requestProgramChange'],
      counterparts: [cp('op-matriculas:approve_program_change', 'any', 'advisory', NOBODY_APPROVES)],
    },
    {
      action: 'approve_program_change', label: 'Aprobar cambio de programa o nivel', kind: 'aprobar', requires: ['view', 'sis-solicitudes:view'], sensitive: 'control', reads: ['enrollmentRequest', 'tariff'],
      writes: ['enrollment', 'plan', 'installment', 'enrollmentRequest'], emits: ['request_resolved'], actions: ['resolveChangeRequest'],
    },
    {
      action: 'req_transfer', label: 'Solicitar traslado de sede', kind: 'operar', requires: ['view'], writes: ['enrollmentRequest'], emits: ['enrollment_transfer_pending'], actions: ['requestTransfer'],
      counterparts: [cp('op-matriculas:approve_transfer', 'any', 'advisory', NOBODY_APPROVES)],
    },
    {
      action: 'approve_transfer', label: 'Aprobar traslado de sede', kind: 'aprobar', requires: ['view', 'sis-solicitudes:view'], sensitive: 'control', reads: ['enrollmentRequest', 'branch'],
      writes: ['enrollment', 'schedule', 'enrollmentRequest'], emits: ['request_resolved'], actions: ['resolveChangeRequest'],
    },
    { action: 'renew', label: 'Renovar matrícula', kind: 'crear', requires: ['view'], sensitive: 'dinero', writes: ['enrollment', 'plan', 'payment', 'cashMovement'], actions: ['registerEnrollments'] },
    { action: 'edit_data', label: 'Corregir datos administrativos', kind: 'editar', requires: ['view'], sensitive: 'control', writes: ['enrollment'], actions: ['updateEnrollmentData'] },
    { action: 'documents', label: 'Generar contrato y ficha', kind: 'operar', requires: ['view'], reads: ['enrollment', 'contractTemplate'], writes: ['document'], actions: ['generateEnrollmentDocument', 'registerDocumentSignature'] },
    { action: 'extend', label: 'Habilitar extensión de vigencia', kind: 'operar', requires: ['view'], sensitive: 'control', writes: ['enrollment'], actions: ['enableExtension'] },
  ]),
  f('op-pagos', 'Pagos', 'mod-operacion', [
    { action: 'view', label: 'Ver pagos', kind: 'ver', menu: menu(OP, 'Pagos'), reads: ['payment', 'plan', 'installment'], sensitive: 'dinero' },
    {
      action: 'register', label: 'Registrar pago o cobro de cuota', kind: 'crear', requires: ['view'], sensitive: 'dinero', reads: ['plan', 'installment'],
      writes: ['payment', 'installment', 'plan', 'cashMovement'], actions: ['registerPayment'],
      counterparts: [cp('op-caja:close_box', 'same-branch', 'advisory', 'Sin quien cierre la caja en la sede, los cobros del día nunca se arquean.')],
    },
    {
      action: 'reverse_payment', label: 'Reversar pago', kind: 'operar', requires: ['view'], sensitive: 'control', writes: ['payment', 'installment', 'plan', 'cashMovement', 'creditNote'],
      emits: ['payment_reversed'], actions: ['reversePayment'],
    },
    { action: 'credit_note', label: 'Emitir nota de crédito', kind: 'operar', requires: ['view'], sensitive: 'control', writes: ['creditNote'], actions: ['reversePayment'] },
  ]),
  f('op-verificacion', 'Verificación de materiales', 'mod-operacion', [
    { action: 'view', label: 'Ver verificación', kind: 'ver', menu: menu(OP, 'Verificación'), reads: ['verification', 'enrollment', 'recipe', 'stock'] },
    {
      action: 'deliver', label: 'Registrar la entrega de materiales', kind: 'operar', requires: ['view', 'log-stock:view'], reads: ['recipe', 'stock'],
      writes: ['verification', 'stock', 'kardex'], actions: ['updateEnrollmentVerification'],
      counterparts: [cp('log-recepciones:confirm', 'same-branch', 'advisory', 'Sin quien reciba los envíos en la sede, el stock de materiales no se repone y la verificación se detendrá.')],
    },
  ]),
  f('op-caja', 'Caja', 'mod-operacion', [
    { action: 'view', label: 'Ver caja', kind: 'ver', menu: menu(OP, 'Caja'), reads: ['cashMovement', 'deposit', 'cashClosure'], sensitive: 'dinero' },
    { action: 'reg_income', label: 'Registrar ingreso', kind: 'crear', requires: ['view'], sensitive: 'dinero', writes: ['cashMovement'], actions: ['addCashMovement'] },
    { action: 'reg_expense', label: 'Registrar egreso', kind: 'crear', requires: ['view'], sensitive: 'dinero', writes: ['cashMovement'], actions: ['addCashMovement'] },
    { action: 'reverse_movement', label: 'Reversar movimiento', kind: 'operar', requires: ['view'], sensitive: 'control', writes: ['cashMovement'], emits: ['cash_movement_reversed'], actions: ['reverseCashMovement'] },
    { action: 'deposit', label: 'Crear lote de depósito', kind: 'operar', requires: ['view'], sensitive: 'dinero', writes: ['deposit', 'cashMovement'], actions: ['createDepositBatch'] },
    { action: 'close_box', label: 'Cerrar caja', kind: 'operar', requires: ['view'], sensitive: 'control', reads: ['cashMovement'], writes: ['cashClosure'], actions: ['closeCash'] },
    { action: 'reopen_box', label: 'Reabrir caja', kind: 'operar', requires: ['view'], sensitive: 'control', writes: ['cashClosure'], emits: ['cash_reopened'], actions: ['reopenCash'] },
    {
      action: 'sell_item', label: 'Vender un artículo en caja', kind: 'crear', requires: ['view'], sensitive: 'dinero', reads: ['item', 'itemPrice', 'stock'],
      writes: ['cashMovement', 'stock', 'kardex'], actions: ['registerItemSale'], note: 'Descuenta el stock de la sede y registra el ingreso en una sola operación.',
    },
  ]),
  f('op-caja-chica', 'Caja chica', 'mod-operacion', [
    { action: 'view', label: 'Ver caja chica', kind: 'ver', menu: menu(OP, 'Caja chica'), reads: ['pettyCash', 'cashClosure'], sensitive: 'dinero' },
    { action: 'reg_movement', label: 'Registrar ingreso o gasto de caja chica', kind: 'crear', requires: ['view'], sensitive: 'dinero', writes: ['pettyCash'], actions: ['addPettyCashMovement'] },
    { action: 'reverse_movement', label: 'Reversar movimiento', kind: 'operar', requires: ['view'], sensitive: 'control', writes: ['pettyCash'], actions: ['reversePettyCashMovement'] },
    { action: 'count', label: 'Hacer arqueo y cierre', kind: 'operar', requires: ['view'], sensitive: 'control', writes: ['cashClosure'], actions: ['closeCash'] },
    { action: 'reopen_box', label: 'Reabrir cierre de caja chica', kind: 'operar', requires: ['view'], sensitive: 'control', writes: ['cashClosure'], emits: ['cash_reopened'], actions: ['reopenCash'] },
    { action: 'config', label: 'Configurar fondo y tope por gasto', kind: 'configurar', requires: ['view'], writes: ['pettyCash'], actions: ['updatePettyFund'] },
  ]),
  f('op-cobranza', 'Cobranza y cartera', 'mod-operacion', [
    { action: 'view', label: 'Ver cartera y reportes de cobranza', kind: 'ver', menu: menu(OP, 'Planes y cartera'), reads: ['plan', 'installment', 'enrollment', 'student', 'guardian', 'reminder'], sensitive: 'dinero' },
    { action: 'remind', label: 'Enviar recordatorios', kind: 'operar', requires: ['view'], reads: ['collectionPolicy'], writes: ['reminder'], actions: ['logReminder'] },
    { action: 'charge_mora', label: 'Cobrar mora', kind: 'operar', requires: ['view'], sensitive: 'dinero', reads: ['collectionPolicy'], writes: ['installment', 'plan'], actions: ['chargeMora'] },
    { action: 'refinance', label: 'Refinanciar una cuota', kind: 'operar', requires: ['view'], sensitive: 'control', writes: ['installment', 'plan'], emits: ['installment_refinanced'], actions: ['refinanceInstallment'] },
    { action: 'config', label: 'Configurar políticas de cobranza', kind: 'configurar', requires: ['view'], writes: ['collectionPolicy'], actions: ['updateCollectionPolicy'] },
  ]),

  // ----------------------------------------------------------------------------------------------------------- Logística
  f('log-catalogo', 'Catálogo de artículos', 'mod-logistica', [
    { action: 'view', label: 'Ver el catálogo de artículos', kind: 'ver', menu: menu('logistica', 'Catálogo de artículos'), reads: ['item', 'itemPrice'] },
    {
      action: 'create', label: 'Crear artículos (uno a uno o por carga masiva)', kind: 'crear', requires: ['view'], writes: ['item', 'itemPrice'], actions: ['addItems'],
      note: 'Un artículo que se vende nace con su precio general; el artículo y su precio se guardan juntos.',
    },
    { action: 'edit', label: 'Editar, activar y desactivar artículos', kind: 'editar', requires: ['view'], writes: ['item'], actions: ['updateItem'] },
    { action: 'edit_price', label: 'Registrar el precio de un artículo', kind: 'editar', requires: ['view'], sensitive: 'dinero', writes: ['itemPrice'], actions: ['addItemPrice'] },
  ]),
  f('log-stock', 'Stock', 'mod-logistica', [
    { action: 'view', label: 'Ver el stock', kind: 'ver', menu: menu('logistica', 'Stock'), reads: ['stock', 'item', 'branch'] },
    { action: 'edit_min', label: 'Definir el stock mínimo', kind: 'editar', requires: ['view'], writes: ['stock'], actions: ['updateMinStock'] },
    { action: 'pack', label: 'Armar y abrir paquetes', kind: 'operar', requires: ['view'], reads: ['item'], writes: ['stock', 'kardex'], actions: ['packPackage', 'unpackPackage'] },
    {
      action: 'entry', label: 'Registrar un ingreso de stock (compra o reposición)', kind: 'crear', requires: ['view'], sensitive: 'control', reads: ['item'],
      writes: ['stock', 'kardex'], actions: ['registerStockEntry'], note: 'Pide el documento que lo respalda y queda en el kardex.',
    },
  ]),
  f('log-envios', 'Envíos', 'mod-logistica', [
    { action: 'view', label: 'Ver envíos', kind: 'ver', menu: menu('logistica', 'Envíos'), reads: ['shipment', 'branch'] },
    { action: 'create', label: 'Preparar un envío', kind: 'crear', requires: ['view', 'log-stock:view'], reads: ['stock', 'branch'], writes: ['shipment'], actions: ['addShipment'],
      counterparts: [cp('log-envios:dispatch', 'any', 'advisory', 'Nadie podrá despachar el envío preparado: hay que crear un usuario con «Realizar el envío (despachar)».')] },
    { action: 'edit', label: 'Editar un envío', kind: 'editar', requires: ['view'], writes: ['shipment'], actions: ['updateShipment'] },
    { action: 'delete', label: 'Eliminar un envío', kind: 'eliminar', requires: ['view'], sensitive: 'control', writes: ['shipment'], actions: ['deleteShipment'] },
    {
      action: 'dispatch', label: 'Realizar el envío (despachar)', kind: 'operar', requires: ['view', 'log-stock:view'], reads: ['stock', 'shipment', 'branch'],
      writes: ['shipment', 'stock', 'kardex'], emits: ['shipment_dispatched', 'shipment_cancelled'], actions: ['updateShipmentStatus'],
      counterparts: [cp('log-recepciones:confirm', 'destination-branch', 'required', 'Nadie podrá recibir el envío en la sede destino: hay que crear un usuario con «Confirmar recepción» en esa sede.')],
    },
  ]),
  f('log-transfer', 'Transferencias', 'mod-logistica', [
    { action: 'view', label: 'Ver transferencias', kind: 'ver', menu: menu('logistica', 'Transferencias'), reads: ['transfer', 'branch'] },
    { action: 'req_transfer', label: 'Solicitar transferencia', kind: 'crear', requires: ['view', 'log-stock:view'], reads: ['stock', 'branch'], writes: ['transfer'], emits: ['transfer_requested'], actions: ['addTransfer', 'updateTransfer'],
      counterparts: [cp('log-transfer:approve_transfer', 'any', 'advisory', 'Nadie podrá aprobar la solicitud de transferencia: quedará pendiente.')] },
    { action: 'approve_transfer', label: 'Aprobar transferencia', kind: 'aprobar', requires: ['view'], sensitive: 'control', writes: ['transfer'], emits: ['transfer_decided'], actions: ['updateTransferStatus'] },
    {
      action: 'dispatch', label: 'Despachar transferencia', kind: 'operar', requires: ['view', 'log-stock:view'], reads: ['stock', 'transfer'], writes: ['transfer', 'stock', 'kardex'],
      emits: ['transfer_dispatched'], actions: ['updateTransferStatus'],
      counterparts: [cp('log-transfer:receive', 'destination-branch', 'required', 'Nadie podrá recepcionar la transferencia en la sede destino.')],
    },
    {
      action: 'receive', label: 'Recepcionar transferencia', kind: 'operar', requires: ['view'], reads: ['transfer'], writes: ['transfer', 'stock', 'kardex', 'reception'],
      emits: ['transfer_received', 'reception_with_differences'], actions: ['confirmReception'],
    },
  ]),
  f('log-recepciones', 'Recepciones', 'mod-logistica', [
    { action: 'view', label: 'Ver recepciones', kind: 'ver', menu: menu('logistica', 'Recepciones'), reads: ['shipment', 'transfer', 'reception'] },
    {
      action: 'confirm', label: 'Confirmar la recepción de un envío', kind: 'operar', requires: ['view'], reads: ['shipment'], writes: ['reception', 'shipment', 'stock', 'kardex'],
      emits: ['shipment_received', 'reception_with_differences'], actions: ['confirmReception'],
    },
  ]),
  f('log-kardex', 'Kardex', 'mod-logistica', [
    { action: 'view', label: 'Ver el kardex', kind: 'ver', menu: menu('logistica', 'Kardex'), reads: ['kardex', 'stock', 'item'] },
  ]),
  f('log-ajustes', 'Ajustes y mermas', 'mod-logistica', [
    { action: 'view', label: 'Ver ajustes y mermas', kind: 'ver', menu: menu('logistica', 'Ajustes y mermas'), reads: ['adjustment', 'stock'] },
    { action: 'create', label: 'Registrar un ajuste o una merma', kind: 'crear', requires: ['view', 'log-stock:view'], sensitive: 'control', reads: ['stock'], writes: ['adjustment', 'stock', 'kardex'], actions: ['addAdjustment'] },
  ]),

  // ----------------------------------------------------------------------------------------------------------- Psicopedagogía
  f('psi-prog', 'Programación', 'mod-psico', [
    { action: 'view', label: 'Ver programación', kind: 'ver', menu: menu('psicopedagogia', 'Programación'), reads: ['schedule', 'student', 'enrollment', 'verification'] },
    {
      action: 'create', label: 'Crear programación (agendar asesorías)', kind: 'crear', requires: ['view'], reads: ['student', 'enrollment', 'verification', 'capacity'], writes: ['schedule'], actions: ['addSchedule'],
      counterparts: [cp('psi-prog:mark_attendance', 'same-branch', 'advisory', 'Sin Psicopedagogía en la sede nadie marcará la asistencia de las asesorías.')],
    },
    { action: 'reschedule', label: 'Reprogramar o cancelar con 24 horas o más', kind: 'editar', requires: ['view'], writes: ['schedule'], actions: ['updateSchedule'] },
    {
      action: 'mark_attendance', label: 'Marcar la asistencia de la asesoría', kind: 'operar', requires: ['view'], reads: ['verification'], writes: ['schedule'], actions: ['updateSchedule'],
      note: 'Sin materiales entregados no se marca asistencia (verificación antes de la primera asesoría).',
    },
    { action: 'reg_tracking', label: 'Registrar seguimiento de la sesión', kind: 'operar', requires: ['view'], writes: ['tracking', 'schedule'], actions: ['addTracking', 'updateTracking', 'updateSchedule'] },
    { action: 'export_schedule', label: 'Exportar cronograma mensual', kind: 'exportar', requires: ['view'], reads: ['monthlySchedule'] },
    { action: 'activity_lead', label: 'Asignar el responsable de una actividad especial', kind: 'operar', requires: ['view'], writes: ['activity'], actions: ['setActivityResponsible'] },
    { action: 'activity_enroll', label: 'Inscribir o retirar alumnos de una actividad especial', kind: 'operar', requires: ['view'], reads: ['capacity'], writes: ['activity'], actions: ['enrollInActivity', 'unenrollFromActivity'] },
    { action: 'activity_attendance', label: 'Registrar asistencia a actividades especiales', kind: 'operar', requires: ['view'], writes: ['activity'], actions: ['markActivityAttendance'] },
    {
      action: 'institutional_change', label: 'Cancelar o reprogramar con menos de 24 h (cambio de la institución)', kind: 'operar', requires: ['reschedule'], sensitive: 'control',
      writes: ['schedule'], actions: ['updateSchedule'],
    },
    { action: 'capacity', label: 'Configurar los cupos', kind: 'configurar', requires: ['view'], writes: ['capacity'], actions: ['setCapacityConfig'] },
  ]),
  f('psi-historial', 'Historial del alumno', 'mod-psico', [
    { action: 'view', label: 'Ver el historial del alumno', kind: 'ver', menu: menu('psicopedagogia', 'Historial del alumno'), reads: ['student', 'schedule', 'tracking', 'activity', 'monthlySchedule'] },
  ]),
  f('psi-cronogramas', 'Cronogramas mensuales', 'mod-psico', crud({
    entity: 'monthlySchedule', one: 'cronograma mensual', many: 'cronogramas mensuales', menu: menu('psicopedagogia', 'Cronogramas mensuales'), reads: ['activity'],
    create: ['addMonthlySchedule'], edit: ['updateMonthlySchedule'], remove: ['deleteMonthlySchedule'],
  })),
  f('psi-recordatorios', 'Recordatorios de Psicopedagogía', 'mod-psico', [
    { action: 'view', label: 'Ver recordatorios', kind: 'ver', menu: menu('psicopedagogia', 'Recordatorios'), reads: ['psyReminder', 'schedule'] },
    { action: 'remind', label: 'Enviar y registrar recordatorios', kind: 'operar', requires: ['view'], writes: ['psyReminder'], actions: ['logPsyReminder'] },
    { action: 'config', label: 'Configurar los días de recordatorio', kind: 'configurar', requires: ['view'], writes: ['psyReminder'], actions: ['savePsyReminderPolicy'] },
  ]),

  // ----------------------------------------------------------------------------------------------------------- Personas
  f('per-alumnos', 'Alumnos', 'mod-personas', crud({
    entity: 'student', one: 'alumno', many: 'alumnos', menu: menu('personas', 'Alumnos'), reads: ['guardian', 'enrollment'],
    create: ['addStudent'], edit: ['updateStudent'], remove: ['deleteStudent'],
  })),
  f('per-titulares', 'Titulares', 'mod-personas', crud({
    entity: 'guardian', one: 'titular', many: 'titulares', menu: menu('personas', 'Titulares'), reads: ['student', 'enrollment', 'plan'],
    create: ['addGuardian'], edit: ['updateGuardian'], remove: ['deleteGuardian'],
  })),
  f('per-personal', 'Personal', 'mod-personas', [
    { action: 'view', label: 'Ver el personal', kind: 'ver', menu: menu('personas', 'Personal'), reads: ['staff', 'contract', 'assignment', 'user'] },
    { action: 'create', label: 'Crear ficha de personal', kind: 'crear', requires: ['view'], writes: ['staff', 'user'], actions: ['addStaff'] },
    { action: 'edit', label: 'Editar ficha de personal', kind: 'editar', requires: ['view'], writes: ['staff', 'user'], actions: ['updateStaff'] },
    { action: 'inactivate', label: 'Inactivar a un trabajador', kind: 'operar', requires: ['view'], sensitive: 'control', writes: ['staff', 'user', 'assignment'], actions: ['inactivateStaff'], note: 'Su cuenta de usuario se desactiva sola.' },
    { action: 'reactivate', label: 'Reactivar a un trabajador', kind: 'operar', requires: ['view'], sensitive: 'control', writes: ['staff', 'user'], actions: ['reactivateStaff'] },
  ]),
  f('per-contratos', 'Contratos', 'mod-personas', [
    { action: 'view', label: 'Ver contratos', kind: 'ver', menu: menu('personas', 'Contratos'), reads: ['contract', 'staff', 'payroll'] },
    { action: 'create', label: 'Crear contrato', kind: 'crear', requires: ['view', 'per-remuneracion:view'], sensitive: 'remuneracion', writes: ['contract'], actions: ['addContract'],
      counterparts: [cp('per-planilla:generate', 'any', 'advisory', 'Sin quien arme la planilla, el contrato no se pagará.')] },
    { action: 'edit', label: 'Editar contrato (cambio de condiciones con motivo)', kind: 'editar', requires: ['view', 'per-remuneracion:view'], sensitive: 'remuneracion', writes: ['contract'], actions: ['editContract'] },
    { action: 'close', label: 'Cerrar contrato', kind: 'operar', requires: ['view'], sensitive: 'control', writes: ['contract', 'assignment'], actions: ['closeContract'] },
    { action: 'renew', label: 'Renovar contrato', kind: 'operar', requires: ['view', 'per-remuneracion:view'], sensitive: 'remuneracion', writes: ['contract'], actions: ['renewContract'] },
  ]),
  f('per-asignaciones', 'Asignaciones', 'mod-personas', [
    { action: 'view', label: 'Ver asignaciones', kind: 'ver', menu: menu('personas', 'Asignaciones'), reads: ['assignment', 'staff', 'branch'] },
    { action: 'save', label: 'Crear o editar una asignación', kind: 'crear', requires: ['view'], writes: ['assignment'], actions: ['saveAssignment'] },
    { action: 'close', label: 'Cerrar una asignación', kind: 'operar', requires: ['view'], sensitive: 'control', writes: ['assignment'], actions: ['closeAssignment'] },
  ]),
  f('per-planilla', 'Planilla', 'mod-personas', [
    { action: 'view', label: 'Ver planillas y boletas', kind: 'ver', requires: ['per-remuneracion:view'], menu: menu('personas', 'Planilla'), reads: ['payroll', 'contract', 'staff'], sensitive: 'remuneracion' },
    { action: 'generate', label: 'Generar y eliminar borradores de planilla', kind: 'crear', requires: ['view'], sensitive: 'remuneracion', reads: ['contract'], writes: ['payroll'], actions: ['generatePayroll', 'deletePayrollDraft'],
      counterparts: [cp('per-planilla:close', 'any', 'advisory', 'Sin quien cierre la planilla, quedará en borrador.')] },
    { action: 'adjust', label: 'Agregar ajustes (bonos, descuentos)', kind: 'editar', requires: ['view'], sensitive: 'remuneracion', writes: ['payroll'], actions: ['addPayrollAdjustment', 'removePayrollAdjustment'] },
    { action: 'close', label: 'Cerrar planilla', kind: 'operar', requires: ['view'], sensitive: 'control', writes: ['payroll'], actions: ['closePayroll'] },
    { action: 'reopen', label: 'Reabrir planilla cerrada', kind: 'operar', requires: ['view'], sensitive: 'control', writes: ['payroll'], actions: ['reopenPayroll'] },
  ]),
  f('per-remuneracion', 'Remuneraciones', 'mod-personas', [
    {
      action: 'view', label: 'Ver remuneraciones y costo de planilla', kind: 'ver', sensitive: 'remuneracion', reads: ['contract', 'payroll'],
      note: 'Sin esta función no se ven sueldos en Contratos, Planilla, Personal ni Auditoría.',
    },
  ]),

  // ----------------------------------------------------------------------------------------------------------- Oferta comercial
  f('com-programas', 'Programas', 'mod-comercial', crud({
    entity: 'program', one: 'programa', many: 'programas', menu: menu('configuracion', 'Programas'), reads: ['level'],
    create: ['addProgram'], edit: ['updateProgram'], remove: ['deleteProgram'],
  })),
  f('com-niveles', 'Niveles', 'mod-comercial', crud({
    entity: 'level', one: 'nivel', many: 'niveles', menu: menu('configuracion', 'Niveles'), reads: ['program'],
    create: ['addLevel'], edit: ['updateLevel'], remove: ['deleteLevel'],
  })),
  f('com-tipos-pago', 'Tipos de pago', 'mod-comercial', crud({
    entity: 'paymentType', one: 'tipo de pago', many: 'tipos de pago', menu: menu('configuracion', 'Tipos de pago'),
    create: ['addPaymentType'], edit: ['updatePaymentType'], remove: ['deletePaymentType'],
  })),
  f('com-tarifarios', 'Tarifarios', 'mod-comercial', crud({
    entity: 'tariff', one: 'tarifario', many: 'tarifarios', menu: menu('configuracion', 'Tarifarios'), reads: ['program', 'level', 'paymentType'],
    create: ['addTariff'], edit: ['updateTariff'], remove: ['deleteTariff'],
  })),
  f('com-promociones', 'Promociones', 'mod-comercial', crud({
    entity: 'promotion', one: 'promoción', many: 'promociones', menu: menu('configuracion', 'Promociones'), reads: ['program', 'tariff'],
    create: ['addPromotion'], edit: ['updatePromotion'], remove: ['deletePromotion'],
  })),
  f('com-recetas', 'Recetas de materiales', 'mod-comercial', [
    { action: 'view', label: 'Ver recetas de materiales', kind: 'ver', menu: menu('configuracion', 'Recetas de materiales'), reads: ['recipe', 'item', 'program', 'level', 'branch'] },
    { action: 'create', label: 'Crear y duplicar recetas', kind: 'crear', requires: ['view'], reads: ['item', 'program', 'level'], writes: ['recipe'], actions: ['saveRecipe', 'duplicateRecipe'] },
    { action: 'edit', label: 'Editar recetas', kind: 'editar', requires: ['view'], reads: ['item', 'program', 'level'], writes: ['recipe'], actions: ['saveRecipe'], note: 'Una receta nueva no puede solaparse con otra activa del mismo programa, nivel, sede y período.' },
    { action: 'deactivate', label: 'Activar y desactivar recetas', kind: 'operar', requires: ['view'], sensitive: 'control', writes: ['recipe'], actions: ['setRecipeStatus'] },
  ]),

  // ----------------------------------------------------------------------------------------------------------- Organización
  f('org-empresas', 'Empresas', 'mod-org', crud({
    entity: 'company', one: 'empresa', many: 'empresas', menu: menu('organizacion', 'Empresas'), reads: ['branch'],
    create: ['addCompany'], edit: ['updateCompany'], remove: ['deleteCompany'],
  })),
  f('org-filiales', 'Filiales', 'mod-org', crud({
    entity: 'branch', one: 'filial', many: 'filiales', menu: menu('organizacion', 'Filiales'), reads: ['company'],
    create: ['addBranch'], edit: ['updateBranch'], remove: ['deleteBranch'],
  })),
  f('org-almacenes', 'Almacenes', 'mod-org', crud({
    entity: 'warehouse', one: 'almacén', many: 'almacenes', menu: menu('organizacion', 'Almacenes'), reads: ['stock'],
    create: ['addWarehouse'], edit: ['updateWarehouse'], noDelete: true,
  })),
  f('org-roles', 'Roles y Permisos', 'mod-org', [
    { action: 'view', label: 'Ver roles', kind: 'ver', menu: menu('organizacion', 'Roles'), reads: ['role', 'permission', 'user'] },
    { action: 'create', label: 'Crear rol', kind: 'crear', requires: ['view'], writes: ['role'], actions: ['addRole'] },
    { action: 'edit', label: 'Editar rol', kind: 'editar', requires: ['view'], writes: ['role'], actions: ['updateRole'] },
    { action: 'delete', label: 'Eliminar rol', kind: 'eliminar', requires: ['view'], sensitive: 'control', writes: ['role'], actions: ['deleteRole'] },
    { action: 'config_perms', label: 'Configurar permisos', kind: 'configurar', requires: ['view'], sensitive: 'control', menu: menu('organizacion', 'Permisos'), reads: ['role', 'permission'], writes: ['permission'], emits: ['role_permissions_changed'], actions: ['savePermissions'] },
  ]),
  f('org-usuarios', 'Usuarios', 'mod-org', [
    { action: 'view', label: 'Ver usuarios', kind: 'ver', menu: menu('organizacion', 'Usuarios'), reads: ['user', 'role', 'staff', 'branch'] },
    { action: 'create', label: 'Crear usuario', kind: 'crear', requires: ['view', 'per-personal:view', 'per-asignaciones:view'], writes: ['user'], actions: ['addUser'] },
    { action: 'edit', label: 'Editar usuario', kind: 'editar', requires: ['view'], writes: ['user'], actions: ['updateUser'] },
    { action: 'deactivate', label: 'Desactivar usuario', kind: 'operar', requires: ['view'], sensitive: 'control', writes: ['user'], actions: ['updateUser'] },
    { action: 'reset_access', label: 'Reenviar acceso', kind: 'operar', requires: ['view'], sensitive: 'control', writes: ['user'], actions: ['resendAccess'] },
    { action: 'assign_role', label: 'Asignar rol', kind: 'operar', requires: ['view', 'org-roles:view'], sensitive: 'control', reads: ['role'], writes: ['user'], actions: ['updateUser'] },
    { action: 'assign_branch', label: 'Asignar sedes', kind: 'operar', requires: ['view'], sensitive: 'control', reads: ['branch'], writes: ['user'], actions: ['updateUser'] },
  ]),
  f('org-alcance', 'Alcance por sede', 'mod-org', [
    { action: 'all_branches', label: 'Ver y operar todas las sedes', kind: 'ver', reads: ['branch'], note: 'Sin esta función, cada persona ve solo la sede de sus asignaciones activas.' },
  ]),

  // ----------------------------------------------------------------------------------------------------------- Reportes
  f('rep-general', 'Reportes Generales', 'mod-reportes', [
    { action: 'view', label: 'Ver reportes', kind: 'ver', note: 'Base de todos los reportes; cada uno pide además la suya.' },
    { action: 'export', label: 'Exportar reportes', kind: 'exportar', requires: ['view'] },
    { action: 'save_views', label: 'Guardar vistas', kind: 'configurar', requires: ['view'], reserved: true, note: 'Reservada: hoy no existen vistas guardadas.' },
  ]),
  f('rep-matriculas', 'Reporte de matrículas', 'mod-reportes', [
    { action: 'view', label: 'Ver el reporte de matrículas', kind: 'ver', requires: ['rep-general:view'], menu: menu('reportes', 'Matrículas'), reads: ['enrollment', 'enrollmentRequest', 'student', 'program', 'branch'] },
  ]),
  f('rep-cartera', 'Reporte de cartera', 'mod-reportes', [
    { action: 'view', label: 'Ver el reporte de cartera', kind: 'ver', requires: ['rep-general:view'], menu: menu('reportes', 'Cartera'), reads: ['plan', 'installment', 'enrollment', 'guardian'], sensitive: 'dinero' },
  ]),
  f('rep-caja', 'Reporte de caja', 'mod-reportes', [
    { action: 'view', label: 'Ver el reporte de caja', kind: 'ver', requires: ['rep-general:view'], menu: menu('reportes', 'Caja'), reads: ['cashMovement', 'deposit', 'cashClosure', 'pettyCash'], sensitive: 'dinero' },
  ]),
  f('rep-verificacion', 'Reporte de verificación', 'mod-reportes', [
    { action: 'view', label: 'Ver el reporte de verificación', kind: 'ver', requires: ['rep-general:view'], menu: menu('reportes', 'Verificación'), reads: ['verification', 'enrollment', 'recipe', 'stock'] },
  ]),
  f('rep-stock', 'Reporte de stock', 'mod-reportes', [
    { action: 'view', label: 'Ver el reporte de stock', kind: 'ver', requires: ['rep-general:view'], menu: menu('reportes', 'Stock'), reads: ['stock', 'kardex', 'recipe', 'enrollment'] },
  ]),
  f('rep-psicopedagogia', 'Reporte de Psicopedagogía', 'mod-reportes', [
    { action: 'view', label: 'Ver el reporte de Psicopedagogía', kind: 'ver', requires: ['rep-general:view'], menu: menu('reportes', 'Psicopedagogía'), reads: ['schedule', 'tracking', 'activity', 'student'] },
  ]),
  f('rep-personal', 'Reporte de personal', 'mod-reportes', [
    { action: 'view', label: 'Ver el reporte de personal', kind: 'ver', requires: ['rep-general:view'], menu: menu('reportes', 'Personal'), reads: ['staff', 'contract', 'assignment', 'user'] },
  ]),

  // ----------------------------------------------------------------------------------------------------------- Sistema
  f('sis-auditoria', 'Auditoría', 'mod-sistema', [
    { action: 'view', label: 'Ver la auditoría', kind: 'ver', menu: menu('sistema', 'Auditoría'), reads: ['audit'], note: 'Los sueldos del detalle solo se muestran con «Ver remuneraciones».' },
  ]),
  f('sis-solicitudes', 'Solicitudes pendientes', 'mod-sistema', [
    { action: 'view', label: 'Ver solicitudes pendientes', kind: 'ver', menu: menu('sistema', 'Solicitudes pendientes'), reads: ['enrollmentRequest', 'enrollment'], note: 'Resolver cada solicitud pide la función «Aprobar» del tipo correspondiente.' },
  ]),
  f('sis-cierres', 'Cierres y reaperturas', 'mod-sistema', [
    { action: 'view', label: 'Ver los cierres de caja', kind: 'ver', menu: menu('sistema', 'Cierres'), reads: ['cashClosure'], sensitive: 'dinero' },
    { action: 'view_reopenings', label: 'Ver las reaperturas de caja', kind: 'ver', menu: menu('sistema', 'Reaperturas'), reads: ['cashClosure'], sensitive: 'control' },
  ]),
  f('sis-avisos', 'Avisos', 'mod-sistema', [
    { action: 'view', label: 'Ver la bandeja de avisos', kind: 'ver', reads: ['notification'], actions: ['markNotificationAsRead'] },
    {
      action: 'supervise', label: 'Recibir copia de los avisos de control (reversas, cierres reabiertos, diferencias de recepción, cambios de permisos)', kind: 'ver', requires: ['view'],
      sensitive: 'control', reads: ['notification'], note: 'Es la supervisión: quien tenga esta función ve lo que otros reversan, reabren o cambian.',
    },
    { action: 'fallback', label: 'Recibir los avisos que nadie más puede recibir', kind: 'ver', requires: ['view'], reads: ['notification'], note: 'Cuando un aviso no tiene destinatario en la sede, llega a quien tenga esta función.' },
  ]),

  // ----------------------------------------------------------------------------------------------------------- Configuración (ventana)
  f('cfg-leads', 'Orígenes de leads', 'mod-config', crud({
    entity: 'leadSource', one: 'origen de lead', many: 'orígenes de leads', create: ['addLeadSource'], edit: ['updateLeadSource'], remove: ['deleteLeadSource'],
  })),
  f('cfg-couriers', 'Couriers y métodos de envío', 'mod-config', [
    { action: 'view', label: 'Ver los couriers y métodos de envío', kind: 'ver', reads: ['courier', 'shippingMethod'] },
    { action: 'create', label: 'Crear couriers y métodos de envío', kind: 'crear', requires: ['view'], writes: ['courier', 'shippingMethod'], actions: ['addCourier', 'addShippingMethod'] },
    { action: 'edit', label: 'Editar, activar y desactivar couriers y métodos de envío', kind: 'editar', requires: ['view'], writes: ['courier', 'shippingMethod'], actions: ['updateCourier', 'updateShippingMethod'] },
  ]),
  f('cfg-plantillas', 'Plantillas de contrato y ficha', 'mod-config', [
    { action: 'view', label: 'Ver las plantillas de contrato y ficha', kind: 'ver', reads: ['contractTemplate'] },
    { action: 'edit', label: 'Editar las plantillas de contrato y ficha', kind: 'editar', requires: ['view'], writes: ['contractTemplate'], actions: ['updateContractTemplate'] },
  ]),
];

/**
 * Acciones de `DataContext` que NO son una función de una persona: consultas, ayudas internas y estado de la interfaz.
 * Cada una dice por qué; `check-capabilities.ts` exige que toda acción del contexto esté aquí o dentro de una función.
 */
export const NON_CAPABILITY_ACTIONS: Record<string, string> = {
  can: 'Consulta de permisos.',
  availabilityOf: 'Consulta (si la función se ofrece según sus contrapartes).',
  gateOfSchedule: 'Consulta (puerta de verificación antes de la primera asesoría).',
  attendanceBlockOf: 'Consulta (bloqueo de asistencia).',
  pendingFirstSessions: 'Consulta (primeras asesorías pendientes).',
  payrollLinesOf: 'Consulta (líneas de una planilla).',
  documentContextOf: 'Consulta (datos para armar un documento).',
  setIsEnrollmentWizardOpen: 'Estado de la interfaz (abrir el asistente de matrícula).',
  reloadOrgDirectory: 'Consulta (vuelve a leer las empresas y filiales de la base de datos).',
  reloadStaffDirectory: 'Consulta (vuelve a leer el personal y las asignaciones de la base de datos).',
  reloadContractsPayroll: 'Consulta (vuelve a leer los contratos y las planillas de la base de datos).',
  selectBranch: 'Sesión: cambia la sede que se ve, solo entre las que alcanza la cuenta (no es una función que se reparta).',
};

/** Ítems de menú que aún no tienen función porque la pantalla no existe o no es una pantalla propia. */
export const MENU_WITHOUT_CAPABILITY: Record<string, string> = {
  'sistema/Preferencias': 'Sin pantalla todavía.',
  'sistema/Ayuda': 'Se abre desde el botón inferior; no es un ítem del menú.',
};
