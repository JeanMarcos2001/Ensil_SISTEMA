-- GENERADO por `npx tsx scripts/doc-sedes-reales.ts` (no se edita a mano: cambie los datos en src/data/realOrg.ts y vuelva a generar).
-- Empresas y sedes reales de ENSIL. Los datos de cada sede salen de la tabla `filiales` del proyecto web; la empresa de cada una la informó el usuario el 2026-11-07.
-- La tabla de consulta está en docs/DATOS_SEDES.md.
--
-- NO es una migración: se ejecuta a mano, una sola vez, en el SQL Editor del proyecto `ensil-sistema` (NO el de la web).
-- Antes: aplicar la migración 0009 (régimen laboral); deben existir SILEE y Colegio Ensil de las Américas (Organización → Empresas) y las sedes Los Olivos y Piura.
-- Es seguro repetirlo: no vuelve a crear la empresa que ya tiene ese RUC ni la sede que ya tiene ese nombre.
-- Los códigos (EMP-NNN y FIL-NNN) se asignan solos, a continuación del mayor que exista, en el orden de esta lista.
-- Ilo (de la web) NO se carga todavía: aún no tiene empresa definida.
-- Todo o nada: si algo falla, no queda nada a medias.

do $$
declare
  e   record;
  s   record;
  n   int;
  eid text;
begin
  -- 1) Empresas nuevas (la razón social va como la informó el usuario: confirmarla con la ficha RUC de SUNAT).
  for e in
    select * from (values
    ('20533093133', 'EDITORIAL ENSIL DE LAS AMERICAS TACNA', 'MYPE'),
    ('20612421243', 'ENSIL INT. E.I.R.L.', 'MYPE'),
    ('20612459313', 'ENSIL EVOLUTION S.R.L.', 'MYPE'),
    ('20614185229', 'ENSIL REVOLUTION S.A.C.', 'MYPE')
    ) as t(ruc, razon_social, regimen_laboral)
  loop
    if not exists (select 1 from public.empresas where ruc = e.ruc) then
      select coalesce(max(substring(id from 5)::int), 0) + 1 into n from public.empresas;
      insert into public.empresas (id, ruc, razon_social, estado, observaciones, regimen_laboral)
      values ('EMP-' || lpad(n::text, 3, '0'), e.ruc, e.razon_social, 'Activo', 'Razón social informada el 2026-11-07: confirmar con la ficha RUC de SUNAT.', e.regimen_laboral);
    end if;
  end loop;

  -- 2) Sedes nuevas, cada una con su empresa (se busca por RUC).
  for s in
    select * from (values
    ('Chiclayo', '20612459313', 'Calle Andalucía #150 Urb. san juan', 'Altura del Hotel Tumbas Reales', 'Lambayeque', 'Chiclayo', 'Chiclayo', '074-525632', '905464734'),
    ('Cajamarca', '20612459313', 'Jr. Guadalupe #466', 'Huánuco y Silva Santiesteban', 'Cajamarca', 'Cajamarca', 'Cajamarca', '076-772573', '933722476'),
    ('Trujillo', '20610010289', 'San Martín #150', 'Frente al Club Libertad', 'La Libertad', 'Trujillo', 'Trujillo', null, '928140527'),
    ('San Isidro', '20612459313', 'Calle Francisco de Zela #2575', '1/2 cdra. del Touring', 'Lima', 'Lima', 'San Isidro', null, '960508686'),
    ('Huancayo', '20612421243', 'Jr. Arequipa #218', 'Complejo Salesiano Sta. Rosa', 'Junín', 'Huancayo', 'El Tambo', '064-419923', '992195898'),
    ('Puno', '20612421243', 'Jr. Moquegua #422 (2° piso)', 'Frente al Restaurante Tamis', 'Puno', 'Puno', 'Puno', '051-352969', '961274101'),
    ('Juliaca', '20612459313', 'Jr. Bolívar #329', 'Costado del Mía Market', 'Puno', 'San Román', 'Juliaca', null, '913632393'),
    ('Arequipa', '20612459313', 'Urbanización León XIII M 60 - A, CAYMA', 'A media cuadra de la Clínica García Braganini', 'Arequipa', 'Arequipa', 'Cayma', '054-325886', '980756620'),
    ('Cusco Magisterio', '20614185229', 'Parque Amauta #210 Urb. Magisterio', 'A 2 casas de Caprichos', 'Cusco', 'Cusco', 'Cusco', '084-782957', '953802527'),
    ('Cusco Marcavalle', '20533093133', 'Emilio Balcay #27 Urb. Cerveceros', 'Paradero Marcavalle', 'Cusco', 'Cusco', 'Wanchaq', null, '922477489'),
    ('Tacna', '20533093133', 'Av. Venezuela # 144', 'Frente al Parque Villa Hermosa', 'Tacna', 'Tacna', 'Tacna', '052-638072', '933746179'),
    ('Huaraz', '20612421243', 'Jr. Larrea y Laredo #796', 'Frente al Parque El Encuentro', 'Áncash', 'Huaraz', 'Huaraz', null, '933741997'),
    ('Ica', '20612421243', 'Av. San Martín #507', 'Al costado de Serpost', 'Ica', 'Ica', 'Ica', null, '936770444'),
    ('Ayacucho', '20612421243', 'Jr. Las Gardenias Mz K Teniente 14', 'Urb. Mariscal Cáceres', 'Ayacucho', 'Huamanga', 'Ayacucho', null, '925846402')
    ) as t(nombre, ruc, direccion, referencia, departamento, provincia, distrito, telefono_fijo, telefono_movil)
  loop
    select id into eid from public.empresas where ruc = s.ruc;
    if eid is null then
      raise exception 'No se encontró la empresa con RUC % (sede %).', s.ruc, s.nombre;
    end if;
    if not exists (select 1 from public.sedes where lower(nombre) = lower(s.nombre)) then
      select coalesce(max(substring(id from 5)::int), 0) + 1 into n from public.sedes;
      insert into public.sedes (id, nombre, empresa_id, estado, direccion, referencia, departamento, provincia, distrito, telefono_fijo, telefono_movil)
      values ('FIL-' || lpad(n::text, 3, '0'), s.nombre, eid, 'Activo', s.direccion, s.referencia, s.departamento, s.provincia, s.distrito, s.telefono_fijo, s.telefono_movil);
    end if;
  end loop;

  -- 3) Piura es de ENSIL EVOLUTION S.R.L. (la de «Colegio Ensil» no cuenta): se corrige la empresa de la sede que ya existía.
  select id into eid from public.empresas where ruc = '20612459313';
  if eid is null then raise exception 'No se encontró la empresa con RUC 20612459313.'; end if;
  update public.sedes set empresa_id = eid where lower(nombre) = 'piura' and empresa_id is distinct from eid;
end $$;

-- Comprobación: deben verse las 6 empresas y las 16 sedes, cada sede con su empresa.
select s.id, s.nombre, e.razon_social as empresa, e.ruc, s.estado
from public.sedes s
left join public.empresas e on e.id = s.empresa_id
order by s.id;
