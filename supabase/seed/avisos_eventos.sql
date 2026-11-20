-- Eventos de los avisos (generado desde src/utils/capabilityRegistry.ts con `npx tsx scripts/doc-avisos-seed.ts`; no se edita a mano).
-- NO es una migración: son datos de configuración que se cargan después de la migración 0026 (avisos) y cada vez que cambia un evento del registro.
--
-- Cargar: pegar este script en el SQL Editor del proyecto `ensil-sistema` (NO el de la web).
-- Es seguro repetirlo: cada evento se inserta o se actualiza. Carga 26 eventos.

insert into public.aviso_eventos (id, etiqueta, disparo, destinatarios, respaldo, emiten)
values
    ('shipment_dispatched', 'Envío despachado', 'accion', '[{"capability":"log-recepciones:confirm","where":"destination-branch"}]'::jsonb, 'sis-avisos:fallback', array['log-envios:create', 'log-envios:dispatch', 'log-envios:edit']),
    ('shipment_cancelled', 'Envío cancelado', 'accion', '[{"capability":"log-recepciones:confirm","where":"destination-branch"}]'::jsonb, 'sis-avisos:fallback', array['log-envios:dispatch']),
    ('shipment_received', 'Envío recibido', 'accion', '[{"capability":"log-envios:dispatch","where":"origin-branch"}]'::jsonb, 'sis-avisos:fallback', array['log-recepciones:confirm']),
    ('transfer_dispatched', 'Transferencia en tránsito', 'accion', '[{"capability":"log-transfer:receive","where":"destination-branch"}]'::jsonb, 'sis-avisos:fallback', array['log-transfer:dispatch']),
    ('transfer_cancelled', 'Transferencia cancelada', 'accion', '[{"capability":"log-transfer:receive","where":"destination-branch"}]'::jsonb, 'sis-avisos:fallback', array['log-transfer:dispatch']),
    ('transfer_received', 'Transferencia recibida', 'accion', '[{"capability":"log-transfer:dispatch","where":"origin-branch"}]'::jsonb, 'sis-avisos:fallback', array['log-transfer:receive']),
    ('reception_with_differences', 'Recepción con faltante o daño', 'accion', '[{"capability":"log-ajustes:create","where":"origin-branch"},{"capability":"sis-avisos:supervise","where":"any"}]'::jsonb, 'sis-avisos:fallback', array['log-recepciones:confirm', 'log-transfer:receive']),
    ('stock_below_minimum', 'Stock por debajo del mínimo', 'sistema', '[{"capability":"log-requerimientos:create","where":"subject-branch"},{"capability":"log-envios:create","where":"any"}]'::jsonb, 'sis-avisos:fallback', array[]::text[]),
    ('requirement_created', 'Requerimiento de una sede (aviso a Logística)', 'accion', '[{"capability":"log-requerimientos:attend","where":"any"}]'::jsonb, 'sis-avisos:fallback', array['log-requerimientos:create']),
    ('requirement_rejected', 'Requerimiento rechazado (aviso a la sede)', 'accion', '[{"person":"requester"},{"capability":"log-requerimientos:create","where":"subject-branch"}]'::jsonb, 'sis-avisos:fallback', array['log-requerimientos:attend']),
    ('requirement_message_to_logistics', 'Mensaje de una sede en su requerimiento (aviso a Logística)', 'accion', '[{"capability":"log-requerimientos:attend","where":"any"}]'::jsonb, 'sis-avisos:fallback', array['log-requerimientos:message']),
    ('requirement_message_to_sede', 'Mensaje de Logística en un requerimiento (aviso a la sede)', 'accion', '[{"person":"requester"},{"capability":"log-requerimientos:create","where":"subject-branch"}]'::jsonb, 'sis-avisos:fallback', array['log-requerimientos:message']),
    ('drop_request_pending', 'Solicitud de caída pendiente', 'accion', '[{"capability":"op-matriculas:approve_drop","where":"any"}]'::jsonb, 'sis-avisos:fallback', array['op-matriculas:req_drop']),
    ('reactivation_request_pending', 'Solicitud de reactivación pendiente', 'accion', '[{"capability":"op-matriculas:approve_reactivation","where":"any"}]'::jsonb, 'sis-avisos:fallback', array['op-matriculas:req_reactivation']),
    ('program_change_request_pending', 'Solicitud de cambio de programa pendiente', 'accion', '[{"capability":"op-matriculas:approve_program_change","where":"any"}]'::jsonb, 'sis-avisos:fallback', array['op-matriculas:req_program_change']),
    ('enrollment_transfer_pending', 'Solicitud de traslado de sede pendiente', 'accion', '[{"capability":"op-matriculas:approve_transfer","where":"any"}]'::jsonb, 'sis-avisos:fallback', array['op-matriculas:req_transfer']),
    ('request_resolved', 'Solicitud resuelta', 'accion', '[{"person":"requester"}]'::jsonb, 'sis-avisos:fallback', array['op-matriculas:approve_drop', 'op-matriculas:approve_program_change', 'op-matriculas:approve_reactivation', 'op-matriculas:approve_transfer']),
    ('verification_without_stock', 'Sin stock para verificar materiales (aviso a Logística)', 'accion', '[{"capability":"log-envios:create","where":"any"}]'::jsonb, 'sis-avisos:fallback', array['op-verificacion:deliver']),
    ('first_session_without_materials', 'Primera asesoría sin materiales entregados', 'sistema', '[{"capability":"op-verificacion:deliver","where":"subject-branch"},{"capability":"psi-prog:mark_attendance","where":"subject-branch"}]'::jsonb, 'sis-avisos:fallback', array[]::text[]),
    ('payment_reversed', 'Pago reversado', 'accion', '[{"capability":"sis-avisos:supervise","where":"any"}]'::jsonb, 'sis-avisos:fallback', array['op-pagos:reverse_payment']),
    ('cash_movement_reversed', 'Movimiento de caja reversado', 'accion', '[{"capability":"sis-avisos:supervise","where":"any"}]'::jsonb, 'sis-avisos:fallback', array['op-caja:reverse_movement']),
    ('cash_reopened', 'Caja reabierta', 'accion', '[{"capability":"sis-avisos:supervise","where":"any"}]'::jsonb, 'sis-avisos:fallback', array['op-caja-chica:reopen_box', 'op-caja:reopen_box']),
    ('installment_refinanced', 'Cuota refinanciada', 'accion', '[{"capability":"op-cobranza:view","where":"subject-branch"},{"capability":"sis-avisos:supervise","where":"any"}]'::jsonb, 'sis-avisos:fallback', array['op-cobranza:refinance']),
    ('installment_overdue', 'Cuotas vencidas', 'sistema', '[{"capability":"op-cobranza:remind","where":"subject-branch"}]'::jsonb, 'sis-avisos:fallback', array[]::text[]),
    ('contract_expiring', 'Contratos por vencer', 'sistema', '[{"capability":"per-contratos:edit","where":"any"}]'::jsonb, 'sis-avisos:fallback', array[]::text[]),
    ('role_permissions_changed', 'Permisos de un rol modificados', 'accion', '[{"capability":"sis-avisos:supervise","where":"any"}]'::jsonb, 'sis-avisos:fallback', array['org-roles:config_perms', 'org-roles:create'])
on conflict (id) do update set
  etiqueta = excluded.etiqueta, disparo = excluded.disparo, destinatarios = excluded.destinatarios, respaldo = excluded.respaldo, emiten = excluded.emiten;

-- Comprobación: cada evento con cuántas funciones lo pueden emitir.
select id, disparo, cardinality(emiten) as funciones_que_lo_emiten from public.aviso_eventos order by id;
