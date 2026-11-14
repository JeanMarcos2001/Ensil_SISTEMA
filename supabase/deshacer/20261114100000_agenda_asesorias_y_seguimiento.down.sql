-- Deshace 0022 (agenda de Psicopedagogía, primera entrega: asesorías, historial, seguimiento y capacidad en la base): se quitan las cuatro tablas (con lo que
-- tengan guardado: asesorías, historial, seguimientos y cupos) y `aplicar_cambios_matricula` vuelve a ser la de la 0021 (sin la clave `agenda`).
-- Después de deshacerla, la aplicación debe ser la versión anterior (la que guarda la agenda en memoria).
begin;

create or replace function public.aplicar_cambios_matricula(p_accion text, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if p_accion = 'mora' and jsonb_typeof(p) = 'object' then perform app.verificar_mora(p); end if;
  return app.aplicar_cambios_matricula_con_codigos(p_accion, p);
end;
$$;
comment on function public.aplicar_cambios_matricula(text, jsonb) is 'Aplica los cambios de una acción del dinero, todo o nada, y asigna los códigos de los registros nuevos. En «mora» vigila antes que lo cobrado no pase de lo que dice la política. Devuelve { ok, codigos }.';

drop function if exists public.aplicar_cambios_agenda(text, jsonb);
drop function if exists public.guardar_capacidad(jsonb);

drop policy if exists asesorias_leer on public.asesorias;
drop policy if exists psy_eventos_leer on public.psy_eventos;
drop policy if exists seguimientos_leer on public.seguimientos;
drop policy if exists capacidad_leer on public.capacidad_asesorias;

drop trigger if exists asesorias_no_cambian on public.asesorias;
drop trigger if exists asesorias_no_vaciar on public.asesorias;
drop trigger if exists psy_eventos_no_cambian on public.psy_eventos;
drop trigger if exists psy_eventos_no_vaciar on public.psy_eventos;
drop trigger if exists seguimientos_no_cambian on public.seguimientos;
drop trigger if exists seguimientos_no_vaciar on public.seguimientos;

drop table if exists public.seguimientos;
drop table if exists public.psy_eventos;
drop table if exists public.asesorias;
drop table if exists public.capacidad_asesorias;

drop function if exists app.aplicar_agenda(text, jsonb, boolean);
drop function if exists app.verificar_asesoria(jsonb, text, text, boolean, jsonb);
drop function if exists app.asignar_codigos_agenda(jsonb);
drop function if exists app.reemplazar_borradores(jsonb, jsonb);
drop function if exists app.cupo_de(text, date, text);
drop function if exists app.personal_disponible(text, date);
drop function if exists app.responsable_invalido(text, text, date);
drop function if exists app.matricula_sin_verificar(text);
drop function if exists app.receta_aplica(text);
drop function if exists app.motivo_cambio(text);
drop function if exists app.horario_valido(date, text);
drop function if exists app.acciones_agenda();
drop function if exists app.puede_leer_asesorias();
drop function if exists app.puede_leer_seguimientos();
drop function if exists app.puede_leer_capacidad();
drop function if exists app.asesoria_inmutable();
drop function if exists app.evento_inmutable();
drop function if exists app.seguimiento_inmutable();

commit;
