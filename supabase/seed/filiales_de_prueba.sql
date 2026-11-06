-- Dos filiales de prueba para la integración: Los Olivos (SILEE) y Piura (Colegio Ensil de las Américas).
-- NO es una migración: depende de las empresas que se crearon desde la pantalla Empresas, así que se ejecuta una sola vez a mano.
--
-- Antes: aplicar la migración 0002 (código FIL-NNN automático) y crear las dos empresas en Organización → Empresas.
-- Después: pegar este script en el SQL Editor del proyecto `ensil-sistema` (NO el de la web).
-- Es seguro repetirlo: si ya existe una filial con ese nombre, no la vuelve a crear.
-- El código (FIL-001, FIL-002…) se asigna solo, a continuación del mayor que exista.
-- Los datos salen de la tabla `filiales` del proyecto web. Las demás filiales las crea cada quien desde Organización → Filiales.

do $$
declare
  silee    text;
  colegio  text;
  n        int;
begin
  select id into silee   from public.empresas where razon_social ilike '%silee%'          order by id limit 1;
  select id into colegio from public.empresas where razon_social ilike '%colegio ensil%'  order by id limit 1;
  if silee is null   then raise exception 'No se encontró la empresa SILEE: créela primero en Organización → Empresas.'; end if;
  if colegio is null then raise exception 'No se encontró la empresa Colegio Ensil: créela primero en Organización → Empresas.'; end if;

  if not exists (select 1 from public.sedes where lower(nombre) = 'los olivos') then
    select coalesce(max(substring(id from 5)::int), 0) + 1 into n from public.sedes;
    insert into public.sedes (id, nombre, empresa_id, estado, direccion, referencia, departamento, provincia, distrito, telefono_fijo, telefono_movil)
    values ('FIL-' || lpad(n::text, 3, '0'), 'Los Olivos', silee, 'Activo', 'Carlos Monge Jr. #233', 'Espalda cdra. 4 Av. Izaguirre', 'Lima', 'Lima', 'Los Olivos', '01-7504687', '960508686');
  end if;

  if not exists (select 1 from public.sedes where lower(nombre) = 'piura') then
    select coalesce(max(substring(id from 5)::int), 0) + 1 into n from public.sedes;
    insert into public.sedes (id, nombre, empresa_id, estado, direccion, referencia, departamento, provincia, distrito, telefono_fijo, telefono_movil)
    values ('FIL-' || lpad(n::text, 3, '0'), 'Piura', colegio, 'Activo', 'Av. Los Cocos Mz. N Lt. 1 Urbanización Club Grau', 'Costado de la Biblioteca Municipal de Piura', 'Piura', 'Piura', 'Piura', '073-554090', '933732053');
  end if;
end $$;

-- Comprobación: deben verse las dos filiales, cada una con su empresa.
select s.id, s.nombre, e.razon_social as empresa, s.estado
from public.sedes s
left join public.empresas e on e.id = s.empresa_id
order by s.id;
