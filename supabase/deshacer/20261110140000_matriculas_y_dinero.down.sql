-- Deshace la migración 0015 (matrículas y dinero). CUIDADO: borra las matrículas, los planes, las cuotas, los pagos, los movimientos de caja,
-- las notas de crédito y los grupos promocionales guardados. Los alumnos y titulares vuelven a verse sin límite por sede.

begin;

-- Los alumnos y titulares vuelven a leerse sin el límite por sede (como dejó la migración 0014)
drop policy alumnos_leer on public.alumnos;
drop policy titulares_leer on public.titulares;
drop policy alumno_titulares_leer on public.alumno_titulares;
create policy titulares_leer on public.titulares for select to authenticated using ((select app.puede_leer_titulares()));
create policy alumnos_leer on public.alumnos for select to authenticated using ((select app.puede_leer_alumnos()));
create policy alumno_titulares_leer on public.alumno_titulares for select to authenticated using ((select app.puede_leer_alumnos()));

drop trigger if exists alumnos_no_eliminar_con_matriculas on public.alumnos;

drop function if exists public.aplicar_cambios_matricula(text, jsonb);

drop table if exists public.notas_credito;
drop table if exists public.movimientos_caja;
drop table if exists public.pagos;
drop table if exists public.cuotas;
drop table if exists public.planes;
drop table if exists public.matriculas;
drop table if exists public.grupos_promocionales;

drop function if exists app.verificar_dinero(text[], text[], text[], text[], text[]);
drop function if exists app.exigir_sede(text, text);
drop function if exists app.aplicar_cuotas(text, jsonb);
drop function if exists app.aplicar_fila(text, jsonb, text[], text);
drop function if exists app.acciones_dinero();
drop function if exists app.ve_titular(text);
drop function if exists app.ve_alumno(text);
drop function if exists app.ve_grupo(text);
drop function if exists app.ve_pago(text);
drop function if exists app.ve_sede_o_general(text);
drop function if exists app.ve_matricula(text);
drop function if exists app.puede_leer_caja();
drop function if exists app.puede_leer_pagos();
drop function if exists app.puede_leer_cuotas();
drop function if exists app.puede_leer_planes();
drop function if exists app.puede_leer_matriculas();
drop function if exists app.alumno_con_matriculas_guarda();
drop function if exists app.matricula_validar();
drop function if exists app.dinero_no_se_vacia();
drop function if exists app.nota_inmutable();
drop function if exists app.movimiento_inmutable();
drop function if exists app.pago_inmutable();
drop function if exists app.huella_dinero();

commit;
