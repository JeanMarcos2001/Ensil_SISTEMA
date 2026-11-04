/**
 * Verificación de los avisos con destinatario y de las alertas por regla: a quién llega cada aviso (por función y sede, no por nombre de
 * rol), qué pasa si nadie puede recibirlo, lectura por usuario y alertas derivadas (cuotas vencidas, materiales, contratos, stock).
 * Ejecutar: npx tsx scripts/check-notifications.ts
 */
import { buildHolders } from '../src/utils/capabilities';
import { EVENTS } from '../src/utils/capabilityRegistry';
import { eventById } from '../src/utils/capabilities';
import { markRead, noticesFor, resolveRecipients, visibility, type NoticeScope } from '../src/utils/notifications';
import { deriveAlerts, type AlertInput } from '../src/utils/systemAlerts';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : ` -> ${detail}`}`);
  if (!ok) failed++;
};

// ------------------------------------------------------------------------------------------------------------------ Personas y funciones
const branches = [{ id: 'LOL', name: 'Los Olivos' }, { id: 'PIU', name: 'Piura' }, { id: 'ARE', name: 'Arequipa' }];
const roles = [
  { id: 'R-ALM', name: 'Almacén central', status: 'Activo' as const },
  { id: 'R-ADM', name: 'Administrador de sede', status: 'Activo' as const },
  { id: 'R-GEN', name: 'Administración general', status: 'Activo' as const },
  { id: 'R-SUP', name: 'Supervisión', status: 'Activo' as const },
];
const permissions = [
  { roleId: 'R-ALM', permissions: ['log-envios:dispatch', 'log-envios:create', 'log-ajustes:create', 'log-transfer:dispatch'] },
  { roleId: 'R-ADM', permissions: ['log-recepciones:confirm', 'log-transfer:receive', 'op-cobranza:remind', 'op-cobranza:view', 'op-verificacion:deliver', 'op-matriculas:req_drop', 'log-transfer:req_transfer'] },
  { roleId: 'R-GEN', permissions: ['op-matriculas:approve_drop', 'log-transfer:approve_transfer', 'per-contratos:edit', 'sis-avisos:fallback', 'org-alcance:all_branches'] },
  { roleId: 'R-SUP', permissions: ['sis-avisos:supervise'] },
];
const u = (id: string, name: string, role: string, branch: string, status: 'Activo' | 'Inactivo' = 'Activo') => ({ id, name, role, branch, status, additionalBranches: [] as string[] });
const users = [
  u('U-ALM', 'Almacenero', 'Almacén central', 'Los Olivos'),
  u('U-PIU', 'Admin Piura', 'Administrador de sede', 'Piura'),
  u('U-ARE', 'Admin Arequipa', 'Administrador de sede', 'Arequipa'),
  u('U-GEN', 'Gerente', 'Administración general', 'Los Olivos'),
  u('U-SUP', 'Contadora', 'Supervisión', 'Los Olivos'),
];
const holders = buildHolders({ users, roles, permissions, branches });
const ids = (r: { userIds: string[] }) => [...r.userIds].sort().join();
const ev = (id: string) => eventById(id)!;

// ------------------------------------------------------------------------------------------------------------------ A quién llega
const toPiura: NoticeScope = { originBranchId: 'LOL', destinationBranchId: 'PIU' };
check('Un envío despachado a Piura llega al administrador de Piura (quien recibe allí)', ids(resolveRecipients(ev('shipment_dispatched'), toPiura, holders)) === 'U-PIU', ids(resolveRecipients(ev('shipment_dispatched'), toPiura, holders)));
check('…y no al de Arequipa ni a la Gerencia (que no tiene «Confirmar la recepción»)', !resolveRecipients(ev('shipment_dispatched'), toPiura, holders).userIds.includes('U-ARE') && !resolveRecipients(ev('shipment_dispatched'), toPiura, holders).userIds.includes('U-GEN'));
const wide = buildHolders({
  users: [u('U-WIDE', 'Gerente de campo', 'Alcance total', 'Los Olivos')],
  roles: [{ id: 'R-WIDE', name: 'Alcance total', status: 'Activo' as const }],
  permissions: [{ roleId: 'R-WIDE', permissions: ['log-recepciones:confirm', 'org-alcance:all_branches'] }],
  branches,
});
check('Quien ve todas las sedes y puede recibir, recibe el envío a cualquiera', ids(resolveRecipients(ev('shipment_dispatched'), toPiura, wide)) === 'U-WIDE' && ids(resolveRecipients(ev('shipment_dispatched'), { destinationBranchId: 'ARE' }, wide)) === 'U-WIDE');
check('El almacenero no recibe el aviso del envío que él mismo despachó', !resolveRecipients(ev('shipment_dispatched'), toPiura, holders).userIds.includes('U-ALM'));
check('«Envío recibido» llega al almacén de origen (quien despacha allí)', ids(resolveRecipients(ev('shipment_received'), toPiura, holders)) === 'U-ALM', ids(resolveRecipients(ev('shipment_received'), toPiura, holders)));
check('Una recepción con faltantes llega al almacén de origen y a la supervisión', ids(resolveRecipients(ev('reception_with_differences'), toPiura, holders)) === 'U-ALM,U-SUP', ids(resolveRecipients(ev('reception_with_differences'), toPiura, holders)));
check('Una transferencia en tránsito llega a quien recepciona en el destino', ids(resolveRecipients(ev('transfer_dispatched'), { originBranchId: 'LOL', destinationBranchId: 'ARE' }, holders)) === 'U-ARE', ids(resolveRecipients(ev('transfer_dispatched'), { originBranchId: 'LOL', destinationBranchId: 'ARE' }, holders)));
check('Una transferencia solicitada llega a quien la aprueba, en cualquier sede', ids(resolveRecipients(ev('transfer_requested'), toPiura, holders)) === 'U-GEN');
check('Una solicitud de caída llega a quien la aprueba', ids(resolveRecipients(ev('drop_request_pending'), { subjectBranchId: 'PIU' }, holders)) === 'U-GEN');
check('Los avisos de control (reversas, cierres reabiertos) llegan solo a la supervisión', ['payment_reversed', 'cash_movement_reversed', 'cash_reopened', 'role_permissions_changed'].every(id => ids(resolveRecipients(ev(id), { subjectBranchId: 'PIU' }, holders)) === 'U-SUP'));
check('La cuota refinanciada llega a cobranza de la sede del alumno y a la supervisión', ids(resolveRecipients(ev('installment_refinanced'), { subjectBranchId: 'ARE' }, holders)) === 'U-ARE,U-SUP', ids(resolveRecipients(ev('installment_refinanced'), { subjectBranchId: 'ARE' }, holders)));

// La resolución de una solicitud llega a quien la pidió
const resolved = ev('request_resolved');
check('«Solicitud resuelta» llega a quien la pidió (por id)', ids(resolveRecipients(resolved, { requesterId: 'U-PIU' }, holders)) === 'U-PIU');
check('…o por nombre mientras las solicitudes solo guarden el nombre', ids(resolveRecipients(resolved, { requesterName: 'Admin Arequipa' }, holders)) === 'U-ARE');
check('…y no a otra persona', !resolveRecipients(resolved, { requesterId: 'U-PIU' }, holders).userIds.includes('U-ARE'));

// ------------------------------------------------------------------------------------------------------------------ Sin destinatario: respaldo
const noReceiver = buildHolders({ users: users.filter(x => x.id !== 'U-PIU'), roles, permissions, branches });
const fb = resolveRecipients(ev('shipment_dispatched'), toPiura, noReceiver);
check('Sin quien reciba en Piura (el de Arequipa no sirve), el envío llega a quien tiene la función de respaldo', ids(fb) === 'U-GEN' && fb.viaFallback === true, JSON.stringify(fb));
const trueFallback = buildHolders({ users: users.filter(x => !['U-PIU', 'U-GEN'].includes(x.id)).concat([u('U-RES', 'Respaldo', 'Respaldo', 'Los Olivos')]), roles: [...roles, { id: 'R-RES', name: 'Respaldo', status: 'Activo' as const }], permissions: [...permissions, { roleId: 'R-RES', permissions: ['sis-avisos:fallback'] }], branches });
const fb2 = resolveRecipients(ev('shipment_dispatched'), toPiura, trueFallback);
check('Sin destinatario, el aviso se entrega al respaldo y se marca como tal', ids(fb2) === 'U-RES' && fb2.viaFallback, JSON.stringify(fb2));
const nobody = buildHolders({ users: [u('U-ALM', 'Almacenero', 'Almacén central', 'Los Olivos')], roles, permissions, branches });
const none = resolveRecipients(ev('shipment_dispatched'), toPiura, nobody);
check('Sin destinatario ni respaldo, no le llega a nadie (y no falla)', none.userIds.length === 0 && !none.viaFallback);
check('Si el aviso no trae la sede que pide su regla, llega a todos los que tienen la función (mejor de más que perderlo)', ids(resolveRecipients(ev('shipment_dispatched'), {}, holders)) === 'U-ARE,U-PIU', ids(resolveRecipients(ev('shipment_dispatched'), {}, holders)));

// ------------------------------------------------------------------------------------------------------------------ Quién ve qué
const piuraAdmin = { id: 'U-PIU', role: 'Administrador de sede' };
const notices = [
  { id: 'N1', eventId: 'shipment_dispatched', scope: toPiura, readBy: [] as string[] },
  { id: 'N2', eventId: 'payment_reversed', scope: { subjectBranchId: 'PIU' }, readBy: [] as string[] },
  { id: 'N3', readBy: [] as string[] },
];
check('El administrador de Piura ve el envío a Piura y el aviso general, no la reversa', noticesFor(piuraAdmin, notices, holders).map(n => n.id).join() === 'N1,N3', noticesFor(piuraAdmin, notices, holders).map(n => n.id).join());
check('La supervisión ve la reversa y el aviso general, no el envío', noticesFor({ id: 'U-SUP', role: 'Supervisión' }, notices, holders).map(n => n.id).join() === 'N2,N3');
check('El Superusuario ve todos los avisos (soporte)', noticesFor({ id: 'USR-001', role: 'Superusuario' }, notices, holders).length === 3);
check('Alguien sin ninguna función solo ve los avisos generales', noticesFor({ id: 'U-X', role: 'Sin rol' }, notices, holders).map(n => n.id).join() === 'N3');
check('Un aviso sin evento lo ve cualquiera', visibility({ id: 'U-X', role: 'Sin rol' }, { eventId: undefined }, holders).visible);
check('Un evento desconocido se trata como aviso general (no se pierde)', visibility({ id: 'U-X', role: 'Sin rol' }, { eventId: 'no_existe' }, holders).visible);

// El aviso no guarda a quién llegó: quien se incorpora después también lo ve
const later = buildHolders({ users: [...users, u('U-ARE2', 'Nueva Arequipa', 'Administrador de sede', 'Arequipa')], roles, permissions, branches });
check('Un usuario creado después con «Confirmar la recepción» en Arequipa ve los envíos que iban hacia Arequipa', noticesFor({ id: 'U-ARE2', role: 'Administrador de sede' }, [{ id: 'N9', eventId: 'shipment_dispatched', scope: { originBranchId: 'LOL', destinationBranchId: 'ARE' } }], later).length === 1);
check('…y antes de existir no lo habría visto', noticesFor({ id: 'U-ARE2', role: 'Administrador de sede' }, [{ id: 'N9', eventId: 'shipment_dispatched', scope: { originBranchId: 'LOL', destinationBranchId: 'ARE' } }], holders).length === 0);
check('Quitarle la función a un rol cambia quién recibe (se calcula al mostrar)', noticesFor(piuraAdmin, [notices[0]], buildHolders({ users, roles, permissions: permissions.map(p => (p.roleId === 'R-ADM' ? { ...p, permissions: [] } : p)), branches })).length === 0);

// ------------------------------------------------------------------------------------------------------------------ Lectura por usuario
const read1 = markRead(notices, 'N1', 'U-PIU');
check('Marcar leído es por usuario: Piura lo leyó, Arequipa no', noticesFor(piuraAdmin, read1, holders).find(n => n.id === 'N1')!.read === true && noticesFor({ id: 'U-GEN', role: 'Superusuario' }, read1, holders).find(n => n.id === 'N1')!.read === false);
check('Marcar leído dos veces no repite al usuario', markRead(read1, 'N1', 'U-PIU').find(n => n.id === 'N1')!.readBy!.length === 1);
check('Marcar leído no toca a los demás avisos', read1.find(n => n.id === 'N2')!.readBy!.length === 0);
check('Los avisos se pueden leer sin modificar la lista original', notices[0].readBy.length === 0);
check('«Aviso con respaldo» se informa a quien lo recibe por respaldo', noticesFor({ id: 'U-RES', role: 'Respaldo' }, [{ id: 'N5', eventId: 'shipment_dispatched', scope: toPiura }], trueFallback)[0]?.viaFallback === true);

// ------------------------------------------------------------------------------------------------------------------ Alertas por regla
const TODAY = '2026-10-30';
const inst = (id: string, due: string, balance = 100, status = 'Pendiente') => ({ id, name: id, amount: 100, balance, dueDateISO: due, status, payments: [] });
const input: AlertInput = {
  plans: [
    { id: 'P1', mat: 'M1', type: 'Cuotas', total: 300, balance: 200, status: 'Atrasado', installments: [inst('I1', '2026-10-01'), inst('I2', '2026-10-10'), inst('I3', '2026-12-01')] },
    { id: 'P2', mat: 'M2', type: 'Cuotas', total: 100, balance: 100, status: 'Al día', installments: [inst('I4', '2026-11-20')] },
    { id: 'P3', mat: 'M3', type: 'Cuotas', total: 100, balance: 100, status: 'Caída', installments: [inst('I5', '2026-09-01')] },
    { id: 'P4', mat: 'M4', type: 'Cuotas', total: 100, balance: 100, status: 'Atrasado', installments: [inst('I6', '2026-10-05')] },
  ] as never,
  enrollments: [{ id: 'M1', branchId: 'PIU' }, { id: 'M2', branchId: 'PIU' }, { id: 'M3', branchId: 'PIU' }, { id: 'M4', branchId: 'ARE' }],
  contracts: [
    { id: 'C1', staffId: 'S1', status: 'Vigente', endDate: '2026-11-15' },
    { id: 'C2', staffId: 'S2', status: 'Vigente', endDate: '2027-06-30' },
    { id: 'C3', staffId: 'S3', status: 'Vigente' },
    { id: 'C4', staffId: 'S4', status: 'Cesado', endDate: '2026-11-01' },
  ] as never,
  stockItems: [
    { id: 'K1', itemId: 'I', branchId: 'PIU', stock: 3, minStock: 5 },
    { id: 'K2', itemId: 'J', branchId: 'PIU', stock: 5, minStock: 5 },
    { id: 'K3', itemId: 'K', branchId: 'ARE', stock: 0, minStock: 0 },
    { id: 'K4', itemId: 'L', branchId: 'ARE', stock: 1, minStock: 4 },
    { id: 'K5', itemId: 'M', branchId: 'ARE', stock: 2, minStock: 4 },
  ] as never,
  items: [],
  branches,
  blockedSessions: {
    M1: { blocked: true, level: 'critica', overdue: false, message: '' },
    M2: { blocked: true, level: 'planificada', overdue: false, message: '' },
    M4: { blocked: true, level: 'urgente', overdue: false, message: '' },
    M9: { blocked: false, level: 'ok', overdue: false, message: '' },
  } as never,
};
const alerts = deriveAlerts(input, TODAY);
const alertOf = (key: string) => alerts.find(a => a.key === key);
check('Cuotas vencidas por sede: Piura 2 (las de la matrícula caída no cuentan) y Arequipa 1', alertOf('installment_overdue:PIU')?.count === 2 && alertOf('installment_overdue:ARE')?.count === 1, JSON.stringify(alerts.map(a => [a.key, a.count])));
check('La alerta de cuotas dice cuánto hay por cobrar', /USD 200\.00/.test(alertOf('installment_overdue:PIU')?.message ?? ''), alertOf('installment_overdue:PIU')?.message);
check('Materiales pendientes por sede, y la más urgente define el color', alertOf('first_session_without_materials:PIU')?.count === 2 && alertOf('first_session_without_materials:PIU')?.type === 'danger' && alertOf('first_session_without_materials:ARE')?.type === 'warning');
check('Una matrícula sin bloqueo no genera alerta de materiales', alerts.filter(a => a.eventId === 'first_session_without_materials').reduce((n, a) => n + a.count, 0) === 3);
check('Contratos por vencer: solo vigentes que vencen en 30 días o menos (uno)', alertOf('contract_expiring:all')?.count === 1, String(alertOf('contract_expiring:all')?.count));
check('Stock bajo el mínimo: estar justo en el mínimo o no tener mínimo no es alerta', alertOf('stock_below_minimum:PIU')?.count === 1 && alertOf('stock_below_minimum:ARE')?.count === 2);
check('Cada alerta lleva su evento, sede y pantalla de origen', alerts.every(a => !!eventById(a.eventId) && a.link.startsWith('/') && a.key.startsWith(`${a.eventId}:`)));
check('Sin causas no hay alertas', deriveAlerts({ ...input, plans: [], contracts: [], stockItems: [], blockedSessions: {} }, TODAY).length === 0);
check('Las alertas son estables: la misma causa da la misma clave', deriveAlerts(input, TODAY).map(a => a.key).join() === alerts.map(a => a.key).join());
check('Las alertas desaparecen al corregir la causa (se paga la cuota vencida)', !deriveAlerts({ ...input, plans: input.plans.map(p => (p.id === 'P4' ? { ...p, installments: p.installments.map(i => ({ ...i, balance: 0, status: 'Pagada' })) } : p)) as never }, TODAY).some(a => a.key === 'installment_overdue:ARE'));

// Las alertas llegan con las mismas reglas de los avisos
const a = (key: string) => alertOf(key)!;
check('La alerta de cuotas de Piura la ve cobranza de Piura, no la de Arequipa', visibility({ id: 'U-PIU', role: 'Administrador de sede' }, a('installment_overdue:PIU'), holders).visible && !visibility({ id: 'U-ARE', role: 'Administrador de sede' }, a('installment_overdue:PIU'), holders).visible);
check('La alerta de contratos por vencer la ve quien puede editar contratos, no la sede', visibility({ id: 'U-GEN', role: 'Administración general' }, a('contract_expiring:all'), holders).visible && !visibility({ id: 'U-PIU', role: 'Administrador de sede' }, a('contract_expiring:all'), holders).visible);
check('La alerta de materiales de Arequipa la ve quien entrega materiales en Arequipa', visibility({ id: 'U-ARE', role: 'Administrador de sede' }, a('first_session_without_materials:ARE'), holders).visible && !visibility({ id: 'U-PIU', role: 'Administrador de sede' }, a('first_session_without_materials:ARE'), holders).visible);
check('El stock bajo de Piura lo ve quien solicita transferencias en Piura y el almacén (que prepara el envío)', visibility({ id: 'U-PIU', role: 'Administrador de sede' }, a('stock_below_minimum:PIU'), holders).visible && visibility({ id: 'U-ALM', role: 'Almacén central' }, a('stock_below_minimum:PIU'), holders).visible && !visibility({ id: 'U-ARE', role: 'Administrador de sede' }, a('stock_below_minimum:PIU'), holders).visible);
check('Toda alerta posible corresponde a un aviso de sistema del registro', alerts.every(x => EVENTS.find(e => e.id === x.eventId)?.trigger === 'sistema'));

console.log(failed === 0 ? '\nTodo correcto.' : `\n${failed} caso(s) fallaron.`);
process.exit(failed === 0 ? 0 : 1);
