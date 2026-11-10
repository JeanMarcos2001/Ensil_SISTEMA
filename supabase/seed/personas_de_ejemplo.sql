-- =====================================================================================================================
-- Titulares y alumnos de ejemplo (generado: NO se edita a mano)
-- ---------------------------------------------------------------------------------------------------------------------
-- Sale de `src/data/seedPeople.ts` con `npx tsx scripts/doc-personas-seed.ts`. Requiere la migración 0014 (titulares y alumnos).
-- Son los 5 titulares y 5 alumnos con los que las matrículas, los pagos y la agenda de ejemplo (que siguen en memoria) se entienden: por eso llevan
-- los mismos códigos (TIT-001…, ALU-001…). Son datos de PRUEBA (nombres y documentos inventados): se pueden borrar desde Personas cuando se
-- empiece con datos reales (un alumno con matrículas en memoria no se elimina; al reiniciar, los datos de ejemplo de esas matrículas vuelven).
-- Es repetible: solo se carga si todavía no hay titulares ni alumnos.
-- =====================================================================================================================

begin;

do $$
begin
  if exists (select 1 from public.titulares) or exists (select 1 from public.alumnos) then
    raise notice 'Ya hay titulares o alumnos: no se vuelven a cargar los de ejemplo.';
    return;
  end if;

insert into public.titulares (numero, tipo_doc, documento, nombres, apellido_paterno, apellido_materno, fecha_nacimiento, estado_civil, telefono, correo, direccion, parentesco) values
  (1, 'DNI', '45678901', 'Juan', 'Ruiz', 'Paredes', '1988-07-10', 'Casado(a)', '987654321', 'juan.ruiz@email.com', 'Av. Grau 450, Piura', 'Padre/Madre'),
  (2, 'DNI', '45678902', 'María', 'Castro', 'Lama', '1985-07-10', 'Casado(a)', '987654322', 'maria.castro@email.com', 'Calle Lima 218, Chiclayo', 'Padre/Madre'),
  (3, 'DNI', '45678903', 'Pedro', 'Vega', 'Soto', '1982-07-10', 'Casado(a)', '987654323', 'pedro.vega@email.com', 'Jr. Tacna 120, Piura', 'Padre/Madre'),
  (4, 'DNI', '45678904', 'Ana', 'Silva', 'Reyes', '1993-07-10', 'Casado(a)', '987654324', 'ana.silva@email.com', 'Av. Balta 905, Chiclayo', 'Padre/Madre'),
  (5, 'DNI', '45678905', 'Carlos', 'Torres', 'Díaz', '1980-07-10', 'Casado(a)', '987654325', 'carlos.torres@email.com', 'Av. Sánchez Cerro 77, Piura', 'Padre/Madre')
on conflict do nothing;

insert into public.alumnos (numero, tipo_doc, documento, nombres, apellido_paterno, apellido_materno, fecha_nacimiento, telefono, correo, direccion, parentesco, fecha_inicio, situacion, tipo_institucion, colegio, grado, ocupacion, centro_trabajo) values
  (1, 'DNI', '76543210', 'Mateo', 'Ruiz', 'Paredes', '2018-07-10', '', '', '', 'Hijo(a)', null, 'estudiando', 'Colegio', 'I.E. San Miguel', '3.º primaria', null, null),
  (2, 'DNI', '76543211', 'Sofia', 'Castro', 'Lama', '2012-07-10', '', '', '', 'Hijo(a)', null, 'estudiando', 'Colegio', 'I.E. Santa Rosa', '2.º secundaria', null, null),
  (3, 'DNI', '76543212', 'Lucas', 'Vega', 'Soto', '2017-07-10', '', '', '', 'Hijo(a)', null, 'estudiando', 'Colegio', 'I.E. Cristo Rey', '4.º primaria', null, null),
  (4, 'DNI', '76543213', 'Valentina', 'Silva', 'Reyes', '2021-07-10', '', '', '', 'Hijo(a)', null, 'estudiando', 'Colegio', 'Inicial Los Pinos', '5 años', null, null),
  (5, 'DNI', '76543214', 'Diego', 'Torres', 'Díaz', '2011-07-10', '', '', '', 'Hijo(a)', null, 'estudiando', 'Colegio', 'I.E. Nuestra Señora', '4.º secundaria', null, null)
on conflict do nothing;

insert into public.alumno_titulares (alumno_id, titular_id, orden) values
  ('ALU-001', 'TIT-001', 1),
  ('ALU-002', 'TIT-002', 1),
  ('ALU-003', 'TIT-003', 1),
  ('ALU-004', 'TIT-004', 1),
  ('ALU-005', 'TIT-005', 1)
on conflict do nothing;

  -- Los códigos siguientes continúan después de los de ejemplo
  perform setval(pg_get_serial_sequence('public.titulares', 'numero'), greatest((select max(numero) from public.titulares), 1));
  perform setval(pg_get_serial_sequence('public.alumnos', 'numero'), greatest((select max(numero) from public.alumnos), 1));
end $$;

commit;
