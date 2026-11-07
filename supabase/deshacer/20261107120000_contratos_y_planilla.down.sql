-- Deshace la migración 0007 (contratos y planilla en la base): BORRA los contratos y las planillas guardados. Úselo solo si aún no hay datos reales.
-- Deja `inactivar_personal` como estaba antes (sin la comprobación del contrato vigente).

begin;

create or replace function public.inactivar_personal(p_id text, p_motivo text, p_detalle text, p_fecha date, p_por text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.permite('per-personal:inactivate') then
    raise exception 'Su rol no tiene la función «Inactivar a un trabajador».' using errcode = 'EN001';
  end if;
  perform set_config('app.baja_personal', 'on', true);
  update public.personal
    set estado = 'Inactivo', fecha_estado = p_fecha, motivo_estado = p_motivo || ' — ' || btrim(p_detalle)
    where id = p_id and estado = 'Activo';
  if not found then raise exception 'No se encontró al trabajador activo.' using errcode = 'EN001'; end if;
  update public.asignaciones
    set estado = 'Cerrada', es_principal = false, fecha_fin = greatest(p_fecha, fecha_inicio), motivo_cierre = p_motivo || ' — ' || btrim(p_detalle), cerrada_por = p_por
    where personal_id = p_id and estado = 'Activa';
end;
$$;

drop function if exists public.reabrir_planilla(text, text);
drop function if exists public.cerrar_planilla(text, jsonb, text);
drop function if exists public.quitar_ajuste_planilla(text, text, text);
drop function if exists public.agregar_ajuste_planilla(text, text, jsonb, text);
drop function if exists public.eliminar_borrador_planilla(text);
drop function if exists public.generar_planilla(text, text, text);
drop function if exists public.renovar_contrato(text, text, jsonb);
drop function if exists public.cesar_contrato(text, date, text);
drop function if exists public.editar_contrato(text, jsonb, text, jsonb);
drop function if exists public.crear_contrato(text, jsonb);

drop table if exists public.planilla_eventos;
drop table if exists public.planilla_lineas;
drop table if exists public.planilla_ajustes;
drop table if exists public.planillas;
drop table if exists public.contrato_revisiones;
drop table if exists public.contratos_pago;
drop table if exists public.contratos;

drop function if exists app.contrato_insertar(text, jsonb, text);
drop function if exists app.contrato_validar(jsonb, text);
drop function if exists app.quien(text);
drop function if exists app.hoy();

commit;
