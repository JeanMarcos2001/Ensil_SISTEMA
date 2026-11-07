-- Deshace la migración 0008: la empresa de un contrato vuelve a ser fija (como en la 0007). Los contratos que ya cambiaron de empresa conservan la nueva.

begin;

create or replace function app.contrato_validar(p jsonb, p_propio text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_tipo   text := p->>'tipo';
  v_inicio date := nullif(p->>'fecha_inicio', '')::date;
  v_fin    date := nullif(p->>'fecha_fin', '')::date;
  v_vi     date := nullif(p->>'vacaciones_inicio', '')::date;
  v_vf     date := nullif(p->>'vacaciones_fin', '')::date;
  v_bruto  numeric := nullif(p->>'sueldo_bruto', '')::numeric;
begin
  if not exists (select 1 from public.personal x where x.id = p->>'personal_id' and x.estado = 'Activo') then
    raise exception 'El trabajador no existe o está inactivo.' using errcode = 'EN001';
  end if;
  if not exists (select 1 from public.empresas e where e.id = p->>'empresa_id' and e.estado = 'Activo') then
    raise exception 'La empresa elegida no existe o está inactiva.' using errcode = 'EN001';
  end if;
  if v_tipo is null or v_tipo not in ('Indeterminado', 'Plazo Fijo', 'Locación de servicios') then
    raise exception 'Seleccione el tipo de contrato.' using errcode = 'EN001';
  end if;
  if length(btrim(coalesce(p->>'cargo', ''))) < 3 then raise exception 'Indique el cargo (ej.: Psicólogo Senior).' using errcode = 'EN001'; end if;
  if length(btrim(p->>'cargo')) > 60 then raise exception 'El cargo es demasiado largo (máximo 60 caracteres).' using errcode = 'EN001'; end if;
  if v_inicio is null then raise exception 'La fecha de inicio es obligatoria.' using errcode = 'EN001'; end if;
  if v_tipo <> 'Indeterminado' then
    if v_fin is null then raise exception 'La fecha de fin es obligatoria para este tipo de contrato.' using errcode = 'EN001'; end if;
    if v_fin <= v_inicio then raise exception 'La fecha de fin debe ser posterior a la de inicio.' using errcode = 'EN001'; end if;
  elsif v_fin is not null then
    raise exception 'El contrato indeterminado no tiene fecha de fin.' using errcode = 'EN001';
  end if;
  if v_bruto is null or not (v_bruto > 0) then raise exception 'Indique el sueldo bruto.' using errcode = 'EN001'; end if;
  if v_bruto > 100000 then raise exception 'Revise el sueldo bruto.' using errcode = 'EN001'; end if;
  if v_tipo <> 'Locación de servicios' then
    if coalesce(p->>'sistema_pension', '') not in ('AFP', 'ONP') then raise exception 'Seleccione el sistema de pensiones.' using errcode = 'EN001'; end if;
    if p->>'sistema_pension' = 'AFP' and coalesce(p->>'afp', '') not in ('Integra', 'Prima', 'Habitat', 'Profuturo') then raise exception 'Seleccione la AFP.' using errcode = 'EN001'; end if;
    if v_vi is not null or v_vf is not null then
      if v_vi is null or v_vf is null then raise exception 'Indique el inicio y el retorno de las vacaciones.' using errcode = 'EN001'; end if;
      if v_vf < v_vi then raise exception 'El retorno no puede ser anterior al inicio.' using errcode = 'EN001'; end if;
      if v_vi < v_inicio then raise exception 'Las vacaciones no pueden empezar antes del contrato.' using errcode = 'EN001'; end if;
      if v_fin is not null and v_vf > v_fin then raise exception 'Las vacaciones no pueden terminar después del contrato.' using errcode = 'EN001'; end if;
    end if;
  elsif v_vi is not null or v_vf is not null then
    raise exception 'La locación de servicios no tiene vacaciones.' using errcode = 'EN001';
  end if;
  if exists (
    select 1 from public.contratos c
    where c.personal_id = p->>'personal_id' and c.id is distinct from p_propio and c.estado = 'Vigente' and (c.fecha_fin is null or c.fecha_fin >= app.hoy())
  ) then
    raise exception 'Este trabajador ya tiene un contrato vigente. Ciérrelo antes de crear otro.' using errcode = 'EN001';
  end if;
end;
$$;

create or replace function public.editar_contrato(p_id text, p jsonb, p_motivo text, p_cambios jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c public.contratos;
begin
  if not app.permite('per-contratos:edit') then raise exception 'Su rol no tiene la función «Editar contrato».' using errcode = 'EN001'; end if;
  if not app.permite('per-remuneracion:view') then raise exception 'Para editar un contrato se necesita también la función «Ver remuneraciones».' using errcode = 'EN001'; end if;
  select * into c from public.contratos where id = p_id for update;
  if not found then raise exception 'No se encontró el contrato.' using errcode = 'EN001'; end if;
  if c.estado <> 'Vigente' then raise exception 'Solo se puede editar un contrato vigente. Un contrato cesado queda como historial: registre uno nuevo.' using errcode = 'EN001'; end if;
  if p->>'personal_id' is distinct from c.personal_id then raise exception 'No se puede cambiar el trabajador de un contrato.' using errcode = 'EN001'; end if;
  if p->>'empresa_id' is distinct from c.empresa_id then raise exception 'No se puede cambiar la empresa de un contrato: cese este y registre uno nuevo.' using errcode = 'EN001'; end if;
  if coalesce(jsonb_array_length(p_cambios), 0) = 0 then raise exception 'No hay cambios que guardar.' using errcode = 'EN001'; end if;
  if length(btrim(coalesce(p_motivo, ''))) < 5 then raise exception 'Indique el motivo de la modificación: queda en el historial del contrato.' using errcode = 'EN001'; end if;
  perform app.contrato_validar(p, p_id);
  update public.contratos set
    tipo = p->>'tipo', cargo = btrim(p->>'cargo'), fecha_inicio = (p->>'fecha_inicio')::date, fecha_fin = nullif(p->>'fecha_fin', '')::date,
    vacaciones_inicio = nullif(p->>'vacaciones_inicio', '')::date, vacaciones_fin = nullif(p->>'vacaciones_fin', '')::date,
    observaciones = nullif(btrim(coalesce(p->>'observaciones', '')), '')
  where id = p_id;
  update public.contratos_pago set
    sueldo_bruto = (p->>'sueldo_bruto')::numeric, sistema_pension = nullif(p->>'sistema_pension', ''), afp = nullif(p->>'afp', ''),
    aporte = coalesce(nullif(p->>'aporte', '')::numeric, 0), renta = coalesce(nullif(p->>'renta', '')::numeric, 0),
    asignacion_familiar = coalesce(nullif(p->>'asignacion_familiar', '')::numeric, 0), neto = (p->>'neto')::numeric,
    suspension_4ta = coalesce((p->>'suspension_4ta')::boolean, false)
  where contrato_id = p_id;
  insert into public.contrato_revisiones (contrato_id, por, motivo, cambios) values (p_id, app.quien(null), btrim(p_motivo), p_cambios);
end;
$$;

commit;
