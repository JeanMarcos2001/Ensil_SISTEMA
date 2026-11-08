-- Deshace 0011 (artículos, precios y recetas en la base). Borra las tablas CON sus datos: antes de ejecutarlo, copie lo que quiera conservar.
-- Devuelve los guardias de eliminación de la migración 0010 (sin mirar las recetas).
begin;

create or replace function app.programa_eliminar_guarda() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.niveles n where n.programa_id = old.id) then
    raise exception 'No se puede eliminar el programa: tiene niveles. Elimínelos primero o inactive el programa.' using errcode = 'EN001';
  end if;
  if exists (select 1 from public.tarifarios t where t.programa_id = old.id) then
    raise exception 'No se puede eliminar el programa: tiene tarifarios. Elimínelos primero o inactive el programa.' using errcode = 'EN001';
  end if;
  if exists (select 1 from public.promociones p where old.id = any (p.programas_elegibles)) then
    raise exception 'No se puede eliminar el programa: hay promociones que lo usan. Quítelo de ellas o inactive el programa.' using errcode = 'EN001';
  end if;
  return old;
end;
$$;

create or replace function app.nivel_eliminar_guarda() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.tarifarios t where t.nivel_id = old.id) then
    raise exception 'No se puede eliminar el nivel: hay tarifarios que lo usan. Elimínelos primero o inactive el nivel.' using errcode = 'EN001';
  end if;
  return old;
end;
$$;

create or replace function app.sede_catalogo_eliminar_guarda() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.programas p where not p.todas_las_sedes and old.id = any (p.sedes_habilitadas))
     or exists (select 1 from public.tarifarios t where t.sede_id = old.id)
     or exists (select 1 from public.promociones p where not p.todas_las_sedes and old.id = any (p.sedes)) then
    raise exception 'No se puede eliminar la filial: el catálogo comercial (programas, tarifarios o promociones) la usa. Inactívela si ya no se usa.' using errcode = 'EN001';
  end if;
  return old;
end;
$$;

drop function if exists public.crear_articulos(jsonb, jsonb);
drop function if exists public.agregar_precio_articulo(text, text, numeric, date);
drop function if exists app.registrar_precio(text, text, numeric, date);

drop table if exists public.recetas;
drop table if exists public.articulo_precios;
drop table if exists public.articulos;

drop function if exists app.receta_validar();
drop function if exists app.articulo_validar();

commit;
