-- =====================================================================================================================
-- 0014 · Titulares y alumnos en la base (Lote 7)
-- ---------------------------------------------------------------------------------------------------------------------
--   · `titulares`: los apoderados (datos de la persona, dirección y estado civil). Un titular puede tener varios alumnos.
--   · `alumnos`: los alumnos (datos de la persona y su situación: estudia, trabaja, ambos o ninguna). Un alumno independiente es su propio
--     titular: no tiene titulares y su teléfono es obligatorio. Un alumno con apoderado tiene al menos un titular y un parentesco.
--   · `alumno_titulares`: el vínculo alumno ↔ titular, con orden (el primero es el titular principal).
--   · Lo derivable NO se guarda: el nombre completo (sale de nombres y apellidos), la edad, el estado del alumno, su programa y su sede (salen
--     de sus matrículas) y los alumnos, matrículas y saldo de un titular.
--   · Los códigos TIT-NNN y ALU-NNN los asigna la base (dos personas a la vez no repiten).
--   · Nadie escribe las tablas directo: las altas y los cambios pasan por `crear_personas` (varios titulares y alumnos, todo o nada: lo que usa
--     el asistente de matrícula), `editar_titular` y `editar_alumno`, que validan otra vez, piden la función del registro y dejan quién y
--     cuándo. Eliminar sí es directo (con la función «Eliminar»), y la base impide eliminar un titular con alumnos.
--   · Quién lee: cualquier cuenta con una función que muestre alumnos o titulares (Alumnos, Titulares, Matrículas, Cobranza, Programación de
--     Psicopedagogía, Historial, reportes). Son datos de menores: sin una de esas funciones, la base no entrega nada. El alcance por sede llega
--     cuando las matrículas pasen a la base (hoy el alumno no sabe en qué sede está: eso lo dice su matrícula).
--   · Quién puede qué: crear alumnos o titulares, «Crear alumno» / «Crear titular» o quien matricula (matricular crea personas); editar, «Editar
--     alumno» / «Editar titular» (quien solo matricula puede dar la fecha de inicio y la situación de un alumno que ya existe); eliminar, «Eliminar…».
-- Los errores de negocio usan el código EN001: el sistema muestra su texto tal cual (está en español).
-- Para deshacer: supabase/deshacer/20261110100000_titulares_y_alumnos.down.sql
-- =====================================================================================================================

begin;

-- ---------------------------------------------------------------------------------------------------------------------
-- Ayudantes
-- ---------------------------------------------------------------------------------------------------------------------

-- ¿Tiene al menos una de estas funciones? (el Superusuario, todas)
create function app.tiene_alguna(p_funciones text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from unnest(p_funciones) f where app.tiene_funcion(f));
$$;

-- Quien llama tiene alguna de estas funciones; si no, el mensaje las nombra. Las escrituras sin sesión (el editor SQL) no se frenan aquí.
create function app.exigir_alguna(p_funciones text[], p_mensaje text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not app.tiene_alguna(p_funciones) then
    raise exception '%', p_mensaje using errcode = 'EN001';
  end if;
end;
$$;

-- Quién ve a los alumnos y a los titulares: las funciones que, en el registro, leen un alumno o un titular.
create function app.puede_leer_alumnos() returns boolean
language sql stable security definer set search_path = '' as $$
  select app.tiene_alguna(array['op-matriculas:view', 'op-cobranza:view', 'psi-prog:view', 'psi-prog:create', 'psi-historial:view', 'per-alumnos:view',
    'per-titulares:view', 'rep-matriculas:view', 'rep-psicopedagogia:view']);
$$;

create function app.puede_leer_titulares() returns boolean
language sql stable security definer set search_path = '' as $$
  select app.tiene_alguna(array['op-matriculas:view', 'op-cobranza:view', 'per-alumnos:view', 'per-titulares:view', 'rep-cartera:view']);
$$;

-- Años cumplidos a una fecha.
create function app.edad_en(p_nacimiento date, p_hoy date) returns integer
language sql immutable set search_path = '' as $$
  select extract(year from age(p_hoy, p_nacimiento))::integer;
$$;

-- Valida el número de documento según su tipo (las mismas reglas que las pantallas).
create function app.validar_documento(p_tipo text, p_numero text) returns void
language plpgsql immutable set search_path = '' as $$
begin
  if coalesce(btrim(p_numero), '') = '' then raise exception 'El número de documento es obligatorio.' using errcode = 'EN001'; end if;
  if p_tipo = 'DNI' and p_numero !~ '^\d{8}$' then raise exception 'El DNI debe tener 8 dígitos.' using errcode = 'EN001'; end if;
  if p_tipo <> 'DNI' and p_numero !~ '^[A-Za-z0-9]{6,12}$' then raise exception 'El documento debe tener entre 6 y 12 caracteres alfanuméricos.' using errcode = 'EN001'; end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------------------------------------------------

create table public.titulares (
  numero           bigint generated by default as identity primary key,
  id               text generated always as ('TIT-' || lpad(numero::text, 3, '0')) stored unique,
  tipo_doc         text not null default 'DNI' check (tipo_doc in ('DNI', 'CE', 'Pasaporte')),
  documento        text not null,
  nombres          text not null check (length(btrim(nombres)) > 0),
  apellido_paterno text not null check (length(btrim(apellido_paterno)) > 0),
  apellido_materno text not null default '',
  fecha_nacimiento date not null,
  estado_civil     text not null default '',
  telefono         text not null default '',
  correo           text not null default '',
  direccion        text not null default '',
  parentesco       text,
  creado_en        timestamptz not null default now(),
  creado_por       text,
  actualizado_en   timestamptz not null default now(),
  actualizado_por  text
);
create unique index titulares_documento_unico on public.titulares (upper(documento));
comment on table public.titulares is 'Apoderados de los alumnos (datos de menores y de sus familias). Nadie escribe directo: solo crear_personas y editar_titular. El nombre completo, los alumnos y el saldo se derivan.';

create table public.alumnos (
  numero           bigint generated by default as identity primary key,
  id               text generated always as ('ALU-' || lpad(numero::text, 3, '0')) stored unique,
  tipo_doc         text not null default 'DNI' check (tipo_doc in ('DNI', 'CE', 'Pasaporte')),
  documento        text not null,
  nombres          text not null check (length(btrim(nombres)) > 0),
  apellido_paterno text not null check (length(btrim(apellido_paterno)) > 0),
  apellido_materno text not null default '',
  fecha_nacimiento date not null,
  telefono         text not null default '',
  correo           text not null default '',
  direccion        text not null default '',
  parentesco       text not null default '',
  fecha_inicio     date,
  situacion        text not null check (situacion in ('estudiando', 'trabajando', 'ambos', 'ninguna')),
  tipo_institucion text,
  colegio          text,
  grado            text,
  ocupacion        text,
  centro_trabajo   text,
  creado_en        timestamptz not null default now(),
  creado_por       text,
  actualizado_en   timestamptz not null default now(),
  actualizado_por  text
);
create unique index alumnos_documento_unico on public.alumnos (upper(documento));
comment on table public.alumnos is 'Alumnos (datos de menores). Nadie escribe directo: solo crear_personas y editar_alumno. La edad, el estado, el programa, la sede y el titular se derivan de sus vínculos y de sus matrículas.';
comment on column public.alumnos.parentesco is 'Parentesco con el titular (vive en el alumno porque es del vínculo); vacío si es independiente.';

create table public.alumno_titulares (
  alumno_id  text not null references public.alumnos (id) on delete cascade,
  titular_id text not null references public.titulares (id) on delete restrict,
  orden      integer not null check (orden >= 1),
  primary key (alumno_id, titular_id),
  unique (alumno_id, orden)
);
create index alumno_titulares_titular_idx on public.alumno_titulares (titular_id);
comment on table public.alumno_titulares is 'Titulares de cada alumno, en orden: el primero es el titular principal. Un alumno sin filas es independiente (su propio titular).';

create trigger titulares_huella before insert or update on public.titulares for each row execute function app.catalogo_huella();
create trigger alumnos_huella   before insert or update on public.alumnos   for each row execute function app.catalogo_huella();

-- ---------------------------------------------------------------------------------------------------------------------
-- Validaciones (las mismas que hacen las pantallas; la base las vuelve a comprobar)
-- ---------------------------------------------------------------------------------------------------------------------

create function app.persona_validar_comun(p_tipo text, p_doc text, p_nacimiento date, p_correo text, p_telefono text) returns void
language plpgsql stable set search_path = '' as $$
begin
  perform app.validar_documento(p_tipo, p_doc);
  if p_nacimiento is null then raise exception 'La fecha de nacimiento es obligatoria.' using errcode = 'EN001'; end if;
  if p_nacimiento > app.hoy() then raise exception 'La fecha de nacimiento no puede ser futura.' using errcode = 'EN001'; end if;
  if p_nacimiento < date '1900-01-01' then raise exception 'La fecha de nacimiento no es válida.' using errcode = 'EN001'; end if;
  if coalesce(p_correo, '') <> '' and p_correo !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'El correo no es válido.' using errcode = 'EN001'; end if;
  if coalesce(p_telefono, '') <> '' and p_telefono !~ '^\d{9}$' then raise exception 'El teléfono debe tener 9 dígitos.' using errcode = 'EN001'; end if;
end;
$$;

create function app.titular_validar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.documento := btrim(new.documento);
  new.nombres := btrim(new.nombres);
  new.apellido_paterno := btrim(new.apellido_paterno);
  new.apellido_materno := btrim(coalesce(new.apellido_materno, ''));
  new.telefono := btrim(coalesce(new.telefono, ''));
  new.correo := btrim(coalesce(new.correo, ''));
  new.direccion := btrim(coalesce(new.direccion, ''));
  new.estado_civil := btrim(coalesce(new.estado_civil, ''));
  if new.nombres = '' or new.apellido_paterno = '' then raise exception 'Nombres y apellido paterno son obligatorios.' using errcode = 'EN001'; end if;
  perform app.persona_validar_comun(new.tipo_doc, new.documento, new.fecha_nacimiento, new.correo, new.telefono);
  if app.edad_en(new.fecha_nacimiento, app.hoy()) < 18 then raise exception 'El titular debe ser mayor de 18 años.' using errcode = 'EN001'; end if;
  if new.telefono = '' then raise exception 'El teléfono debe tener 9 dígitos.' using errcode = 'EN001'; end if;
  if exists (select 1 from public.titulares t where t.numero <> new.numero and upper(t.documento) = upper(new.documento)) then
    raise exception 'El documento % ya está registrado.', new.documento using errcode = 'EN001';
  end if;
  return new;
end;
$$;
create trigger titulares_validar before insert or update on public.titulares for each row execute function app.titular_validar();

create function app.alumno_validar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.documento := btrim(new.documento);
  new.nombres := btrim(new.nombres);
  new.apellido_paterno := btrim(new.apellido_paterno);
  new.apellido_materno := btrim(coalesce(new.apellido_materno, ''));
  new.telefono := btrim(coalesce(new.telefono, ''));
  new.correo := btrim(coalesce(new.correo, ''));
  new.direccion := btrim(coalesce(new.direccion, ''));
  new.parentesco := btrim(coalesce(new.parentesco, ''));
  new.tipo_institucion := nullif(btrim(coalesce(new.tipo_institucion, '')), '');
  new.colegio := nullif(btrim(coalesce(new.colegio, '')), '');
  new.grado := nullif(btrim(coalesce(new.grado, '')), '');
  new.ocupacion := nullif(btrim(coalesce(new.ocupacion, '')), '');
  new.centro_trabajo := nullif(btrim(coalesce(new.centro_trabajo, '')), '');
  if new.nombres = '' or new.apellido_paterno = '' then raise exception 'Nombres y apellido paterno son obligatorios.' using errcode = 'EN001'; end if;
  perform app.persona_validar_comun(new.tipo_doc, new.documento, new.fecha_nacimiento, new.correo, new.telefono);
  if new.situacion is null or new.situacion not in ('estudiando', 'trabajando', 'ambos', 'ninguna') then
    raise exception 'Indique si está estudiando, trabajando o ninguna.' using errcode = 'EN001';
  end if;
  -- ¿Qué hace el alumno? Estudia (institución y grado o ciclo), trabaja (ocupación), ambas o ninguna; solo se conserva lo que corresponde
  if new.situacion in ('estudiando', 'ambos') then
    if new.tipo_institucion is null then raise exception 'Seleccione el tipo de institución.' using errcode = 'EN001'; end if;
    if new.colegio is null then raise exception 'Indique la institución donde estudia.' using errcode = 'EN001'; end if;
    if new.grado is null then raise exception 'Indique el %.', case when new.tipo_institucion = 'Colegio' then 'grado' else 'ciclo' end using errcode = 'EN001'; end if;
  else
    new.tipo_institucion := null; new.colegio := null; new.grado := null;
  end if;
  if new.situacion in ('trabajando', 'ambos') then
    if new.ocupacion is null then raise exception 'Indique la ocupación.' using errcode = 'EN001'; end if;
  else
    new.ocupacion := null; new.centro_trabajo := null;
  end if;
  if exists (select 1 from public.alumnos a where a.numero <> new.numero and upper(a.documento) = upper(new.documento)) then
    raise exception 'El documento % ya está registrado.', new.documento using errcode = 'EN001';
  end if;
  return new;
end;
$$;
create trigger alumnos_validar before insert or update on public.alumnos for each row execute function app.alumno_validar();

-- Un titular con alumnos a su cargo no se elimina.
create function app.titular_eliminar_guarda() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.alumno_titulares l where l.titular_id = old.id) then
    raise exception 'El titular tiene alumnos a su cargo: no se puede eliminar.' using errcode = 'EN001';
  end if;
  return old;
end;
$$;
create trigger titulares_no_eliminar before delete on public.titulares for each row execute function app.titular_eliminar_guarda();

-- ---------------------------------------------------------------------------------------------------------------------
-- Vínculos alumno ↔ titular
-- ---------------------------------------------------------------------------------------------------------------------

-- Deja los titulares del alumno exactamente como se indican (en ese orden; el primero es el principal).
create function app.vincular_titulares(p_alumno text, p_titulares jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_id    text;
  v_orden integer := 0;
  v_vistos text[] := '{}';
begin
  delete from public.alumno_titulares l where l.alumno_id = p_alumno;
  if jsonb_typeof(p_titulares) is distinct from 'array' then return; end if;
  for v_id in select jsonb_array_elements_text(p_titulares) loop
    if v_id = any (v_vistos) then raise exception 'Un titular está repetido en el alumno.' using errcode = 'EN001'; end if;
    v_vistos := v_vistos || v_id;
    if not exists (select 1 from public.titulares t where t.id = v_id) then raise exception 'Algún titular elegido ya no existe.' using errcode = 'EN001'; end if;
    v_orden := v_orden + 1;
    insert into public.alumno_titulares (alumno_id, titular_id, orden) values (p_alumno, v_id, v_orden);
  end loop;
end;
$$;

-- Lo que depende de los vínculos: con apoderado, el parentesco; independiente, su propio teléfono.
create function app.alumno_completar(p_alumno text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_alumno public.alumnos;
  v_n      integer;
begin
  select * into v_alumno from public.alumnos a where a.id = p_alumno;
  select count(*) into v_n from public.alumno_titulares l where l.alumno_id = p_alumno;
  if v_n = 0 then
    if v_alumno.telefono !~ '^\d{9}$' then raise exception 'Un alumno independiente necesita su teléfono (9 dígitos).' using errcode = 'EN001'; end if;
    if v_alumno.parentesco <> '' then update public.alumnos a set parentesco = '' where a.id = p_alumno; end if;
  elsif v_alumno.parentesco = '' then
    raise exception 'Indique el parentesco con el titular.' using errcode = 'EN001';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Funciones públicas
-- ---------------------------------------------------------------------------------------------------------------------

-- Crea titulares y alumnos, y actualiza alumnos que ya existen, todo o nada. Es lo que usa el asistente de matrícula (que registra a las
-- personas nuevas y las matricula) y los formularios de Titulares y Alumnos (con una sola persona).
--   p = { titulares: [{ clave, tipo_doc, documento, nombres, apellido_paterno, apellido_materno, fecha_nacimiento, estado_civil, telefono, correo, direccion, parentesco }],
--         alumnos:   [{ clave, ...datos del alumno, titulares: [clave de un titular de este lote o código TIT-NNN de uno que ya existe] }],
--         actualizaciones: [{ id: 'ALU-NNN', fecha_inicio, situacion, tipo_institucion, colegio, grado, ocupacion, centro_trabajo }] }
-- Devuelve { titulares: { clave: 'TIT-NNN' }, alumnos: { clave: 'ALU-NNN' } }.
create function public.crear_personas(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_t       jsonb;
  v_a       jsonb;
  v_u       jsonb;
  v_ref     jsonb;
  v_id      text;
  v_mapa_t  jsonb := '{}'::jsonb;
  v_mapa_a  jsonb := '{}'::jsonb;
  v_vinculos jsonb;
begin
  if jsonb_typeof(p) is distinct from 'object' then raise exception 'No hay personas para guardar.' using errcode = 'EN001'; end if;
  if jsonb_array_length(coalesce(p->'titulares', '[]'::jsonb)) > 0 then
    perform app.exigir_alguna(array['per-titulares:create', 'op-matriculas:create', 'op-matriculas:renew'],
      'Su rol no puede crear titulares: hace falta «Crear titular» o «Crear matrícula».');
  end if;
  if jsonb_array_length(coalesce(p->'alumnos', '[]'::jsonb)) > 0 then
    perform app.exigir_alguna(array['per-alumnos:create', 'op-matriculas:create', 'op-matriculas:renew'],
      'Su rol no puede crear alumnos: hace falta «Crear alumno» o «Crear matrícula».');
  end if;
  if jsonb_array_length(coalesce(p->'actualizaciones', '[]'::jsonb)) > 0 then
    perform app.exigir_alguna(array['per-alumnos:edit', 'op-matriculas:create', 'op-matriculas:renew'],
      'Su rol no puede cambiar datos de un alumno: hace falta «Editar alumno» o «Crear matrícula».');
  end if;

  for v_t in select * from jsonb_array_elements(coalesce(p->'titulares', '[]'::jsonb)) loop
    insert into public.titulares (tipo_doc, documento, nombres, apellido_paterno, apellido_materno, fecha_nacimiento, estado_civil, telefono, correo, direccion, parentesco)
    values (coalesce(app.jtexto(v_t, 'tipo_doc'), 'DNI'), coalesce(v_t->>'documento', ''), coalesce(v_t->>'nombres', ''), coalesce(v_t->>'apellido_paterno', ''),
      coalesce(v_t->>'apellido_materno', ''), nullif(v_t->>'fecha_nacimiento', '')::date, coalesce(v_t->>'estado_civil', ''), coalesce(v_t->>'telefono', ''),
      coalesce(v_t->>'correo', ''), coalesce(v_t->>'direccion', ''), app.jtexto(v_t, 'parentesco'))
    returning id into v_id;
    v_mapa_t := v_mapa_t || jsonb_build_object(coalesce(app.jtexto(v_t, 'clave'), v_id), v_id);
  end loop;

  for v_a in select * from jsonb_array_elements(coalesce(p->'alumnos', '[]'::jsonb)) loop
    insert into public.alumnos (tipo_doc, documento, nombres, apellido_paterno, apellido_materno, fecha_nacimiento, telefono, correo, direccion, parentesco, fecha_inicio,
      situacion, tipo_institucion, colegio, grado, ocupacion, centro_trabajo)
    values (coalesce(app.jtexto(v_a, 'tipo_doc'), 'DNI'), coalesce(v_a->>'documento', ''), coalesce(v_a->>'nombres', ''), coalesce(v_a->>'apellido_paterno', ''),
      coalesce(v_a->>'apellido_materno', ''), nullif(v_a->>'fecha_nacimiento', '')::date, coalesce(v_a->>'telefono', ''), coalesce(v_a->>'correo', ''),
      coalesce(v_a->>'direccion', ''), coalesce(v_a->>'parentesco', ''), nullif(v_a->>'fecha_inicio', '')::date, coalesce(app.jtexto(v_a, 'situacion'), ''),
      app.jtexto(v_a, 'tipo_institucion'), app.jtexto(v_a, 'colegio'), app.jtexto(v_a, 'grado'), app.jtexto(v_a, 'ocupacion'), app.jtexto(v_a, 'centro_trabajo'))
    returning id into v_id;
    -- Cada titular se nombra por su clave dentro de este lote o por su código si ya existía
    v_vinculos := '[]'::jsonb;
    for v_ref in select * from jsonb_array_elements(coalesce(v_a->'titulares', '[]'::jsonb)) loop
      v_vinculos := v_vinculos || to_jsonb(coalesce(v_mapa_t->>(v_ref #>> '{}'), v_ref #>> '{}'));
    end loop;
    perform app.vincular_titulares(v_id, v_vinculos);
    perform app.alumno_completar(v_id);
    v_mapa_a := v_mapa_a || jsonb_build_object(coalesce(app.jtexto(v_a, 'clave'), v_id), v_id);
  end loop;

  for v_u in select * from jsonb_array_elements(coalesce(p->'actualizaciones', '[]'::jsonb)) loop
    update public.alumnos a set
      fecha_inicio = case when v_u ? 'fecha_inicio' then nullif(v_u->>'fecha_inicio', '')::date else a.fecha_inicio end,
      situacion = case when v_u ? 'situacion' then coalesce(app.jtexto(v_u, 'situacion'), a.situacion) else a.situacion end,
      tipo_institucion = case when v_u ? 'tipo_institucion' then app.jtexto(v_u, 'tipo_institucion') else a.tipo_institucion end,
      colegio = case when v_u ? 'colegio' then app.jtexto(v_u, 'colegio') else a.colegio end,
      grado = case when v_u ? 'grado' then app.jtexto(v_u, 'grado') else a.grado end,
      ocupacion = case when v_u ? 'ocupacion' then app.jtexto(v_u, 'ocupacion') else a.ocupacion end,
      centro_trabajo = case when v_u ? 'centro_trabajo' then app.jtexto(v_u, 'centro_trabajo') else a.centro_trabajo end
    where a.id = v_u->>'id';
    if not found then raise exception 'No se encontró al alumno.' using errcode = 'EN001'; end if;
  end loop;

  return jsonb_build_object('titulares', v_mapa_t, 'alumnos', v_mapa_a);
end;
$$;

-- Corrige los datos de un titular (los campos que vienen; uno que viene vacío se limpia).
create function public.editar_titular(p_id text, p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.exigir_alguna(array['per-titulares:edit'], 'Su rol no tiene la función «Editar titular».');
  update public.titulares t set
    tipo_doc = case when p ? 'tipo_doc' then coalesce(app.jtexto(p, 'tipo_doc'), t.tipo_doc) else t.tipo_doc end,
    documento = case when p ? 'documento' then coalesce(p->>'documento', t.documento) else t.documento end,
    nombres = case when p ? 'nombres' then coalesce(p->>'nombres', t.nombres) else t.nombres end,
    apellido_paterno = case when p ? 'apellido_paterno' then coalesce(p->>'apellido_paterno', t.apellido_paterno) else t.apellido_paterno end,
    apellido_materno = case when p ? 'apellido_materno' then coalesce(p->>'apellido_materno', '') else t.apellido_materno end,
    fecha_nacimiento = case when p ? 'fecha_nacimiento' then coalesce(nullif(p->>'fecha_nacimiento', '')::date, t.fecha_nacimiento) else t.fecha_nacimiento end,
    estado_civil = case when p ? 'estado_civil' then coalesce(p->>'estado_civil', '') else t.estado_civil end,
    telefono = case when p ? 'telefono' then coalesce(p->>'telefono', '') else t.telefono end,
    correo = case when p ? 'correo' then coalesce(p->>'correo', '') else t.correo end,
    direccion = case when p ? 'direccion' then coalesce(p->>'direccion', '') else t.direccion end,
    parentesco = case when p ? 'parentesco' then app.jtexto(p, 'parentesco') else t.parentesco end
  where t.id = p_id;
  if not found then raise exception 'No se encontró al titular.' using errcode = 'EN001'; end if;
end;
$$;

-- Corrige los datos de un alumno y, si vienen, sus titulares. Quien solo matricula puede dar la fecha de inicio y la situación, nada más.
create function public.editar_alumno(p_id text, p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_solo_situacion boolean;
begin
  perform app.exigir_alguna(array['per-alumnos:edit', 'op-matriculas:create', 'op-matriculas:renew'],
    'Su rol no tiene la función «Editar alumno».');
  v_solo_situacion := auth.uid() is not null and not app.tiene_funcion('per-alumnos:edit');
  if v_solo_situacion and exists (
    select 1 from jsonb_object_keys(p) k where k not in ('fecha_inicio', 'situacion', 'tipo_institucion', 'colegio', 'grado', 'ocupacion', 'centro_trabajo')
  ) then
    raise exception 'Con su rol solo puede dar la fecha de inicio y la situación del alumno; para cambiar algo más hace falta «Editar alumno».' using errcode = 'EN001';
  end if;
  update public.alumnos a set
    tipo_doc = case when p ? 'tipo_doc' then coalesce(app.jtexto(p, 'tipo_doc'), a.tipo_doc) else a.tipo_doc end,
    documento = case when p ? 'documento' then coalesce(p->>'documento', a.documento) else a.documento end,
    nombres = case when p ? 'nombres' then coalesce(p->>'nombres', a.nombres) else a.nombres end,
    apellido_paterno = case when p ? 'apellido_paterno' then coalesce(p->>'apellido_paterno', a.apellido_paterno) else a.apellido_paterno end,
    apellido_materno = case when p ? 'apellido_materno' then coalesce(p->>'apellido_materno', '') else a.apellido_materno end,
    fecha_nacimiento = case when p ? 'fecha_nacimiento' then coalesce(nullif(p->>'fecha_nacimiento', '')::date, a.fecha_nacimiento) else a.fecha_nacimiento end,
    telefono = case when p ? 'telefono' then coalesce(p->>'telefono', '') else a.telefono end,
    correo = case when p ? 'correo' then coalesce(p->>'correo', '') else a.correo end,
    direccion = case when p ? 'direccion' then coalesce(p->>'direccion', '') else a.direccion end,
    parentesco = case when p ? 'parentesco' then coalesce(p->>'parentesco', '') else a.parentesco end,
    fecha_inicio = case when p ? 'fecha_inicio' then nullif(p->>'fecha_inicio', '')::date else a.fecha_inicio end,
    situacion = case when p ? 'situacion' then coalesce(app.jtexto(p, 'situacion'), a.situacion) else a.situacion end,
    tipo_institucion = case when p ? 'tipo_institucion' then app.jtexto(p, 'tipo_institucion') else a.tipo_institucion end,
    colegio = case when p ? 'colegio' then app.jtexto(p, 'colegio') else a.colegio end,
    grado = case when p ? 'grado' then app.jtexto(p, 'grado') else a.grado end,
    ocupacion = case when p ? 'ocupacion' then app.jtexto(p, 'ocupacion') else a.ocupacion end,
    centro_trabajo = case when p ? 'centro_trabajo' then app.jtexto(p, 'centro_trabajo') else a.centro_trabajo end
  where a.id = p_id;
  if not found then raise exception 'No se encontró al alumno.' using errcode = 'EN001'; end if;
  if p ? 'titulares' then perform app.vincular_titulares(p_id, p->'titulares'); end if;
  perform app.alumno_completar(p_id);
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Permisos de tabla y RLS: leer con una función que muestre alumnos o titulares; eliminar con «Eliminar…»; todo lo demás, por las funciones
-- ---------------------------------------------------------------------------------------------------------------------

revoke all on public.titulares, public.alumnos, public.alumno_titulares from public, anon, authenticated;
grant select, delete on public.titulares, public.alumnos to authenticated;
grant select on public.alumno_titulares to authenticated;

alter table public.titulares        enable row level security;
alter table public.alumnos          enable row level security;
alter table public.alumno_titulares enable row level security;

create policy titulares_leer on public.titulares for select to authenticated using ((select app.puede_leer_titulares()));
create policy titulares_eliminar on public.titulares for delete to authenticated using ((select app.tiene_funcion('per-titulares:delete')));
create policy alumnos_leer on public.alumnos for select to authenticated using ((select app.puede_leer_alumnos()));
create policy alumnos_eliminar on public.alumnos for delete to authenticated using ((select app.tiene_funcion('per-alumnos:delete')));
create policy alumno_titulares_leer on public.alumno_titulares for select to authenticated using ((select app.puede_leer_alumnos()));

revoke execute on function public.crear_personas(jsonb), public.editar_titular(text, jsonb), public.editar_alumno(text, jsonb) from public, anon;
grant execute on function public.crear_personas(jsonb), public.editar_titular(text, jsonb), public.editar_alumno(text, jsonb) to authenticated;
revoke execute on all functions in schema app from public, anon;
grant execute on all functions in schema app to authenticated;

commit;
