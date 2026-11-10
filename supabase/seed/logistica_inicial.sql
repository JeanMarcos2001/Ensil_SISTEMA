-- =====================================================================================================================
-- Logística de partida: stock, couriers y métodos de envío (generado: NO se edita a mano)
-- ---------------------------------------------------------------------------------------------------------------------
-- Sale de `src/data/seedCatalog.ts` con `npx tsx scripts/doc-logistica-seed.ts`. Requiere las migraciones 0012 (stock y kardex) y 0013 (envíos,
-- transferencias y recepciones), los artículos cargados (`articulos_y_recetas.sql`) y las sedes y el almacén reales (`empresas_y_sedes_reales.sql`).
-- Es repetible: los couriers y métodos que ya existen no se vuelven a cargar, y el stock solo se carga si todavía no hay ninguna fila.
-- El stock entra como un ingreso «Saldo inicial» en el kardex: lo que hay siempre tiene su movimiento detrás.
-- =====================================================================================================================

begin;

insert into public.couriers (id, codigo, nombre, direccion, referencia, telefono, estado, observaciones) values
  ('COUR-001', 'C-001', 'Olva Courier', 'Av. Argentina 123', 'Frente al parque', '01-123-4567', 'Activo', 'Entrega en 24h'),
  ('COUR-002', 'C-002', 'Shalom', 'Av. Javier Prado 456', 'Cerca al óvalo', '01-987-6543', 'Activo', 'Recojo en agencia')
on conflict do nothing;

insert into public.metodos_envio (id, nombre, estado, observaciones) values
  ('SM-001', 'Courier', 'Activo', 'Envío por agencia externa'),
  ('SM-002', 'Viajero', 'Activo', 'Envío con personal viajero'),
  ('SM-003', 'Recojo interno', 'Activo', 'Recojo por logística interna'),
  ('SM-004', 'Otro', 'Activo', 'Otros métodos')
on conflict do nothing;

do $$
declare
  r record;
begin
  if exists (select 1 from public.stock) then
    raise notice 'El stock ya tiene datos: no se vuelve a cargar el saldo inicial.';
    return;
  end if;
  for r in
    select * from (values
    ('FIL-002', 'ITM-LIB-K1', 100, 50),
    ('FIL-002', 'ITM-MAT-01', 50, 30),
    ('FIL-002', 'ITM-KIT-BIENV', 25, 5),
    ('FIL-002', 'ITM-HER-01', 40, 10),
    ('FIL-002', 'ITM-HER-02', 40, 5),
    ('FIL-003', 'ITM-LIB-K1', 85, 40),
    ('FIL-003', 'ITM-HER-01', 5, 5),
    ('FIL-003', 'ITM-MAT-01', 15, 10),
    ('FIL-003', 'ITM-KIT-BIENV', 8, 3),
    ('FIL-003', 'ITM-HER-02', 10, 5),
    ('ALM-001', 'ITM-LIB-K1', 400, 100),
    ('ALM-001', 'ITM-MAT-01', 250, 60),
    ('ALM-001', 'ITM-KIT-BIENV', 80, 20),
    ('ALM-001', 'ITM-HER-01', 150, 30),
    ('ALM-001', 'ITM-HER-02', 150, 30),
    ('FIL-001', 'ITM-LIB-K1', 60, 30),
    ('FIL-001', 'ITM-MAT-01', 40, 20),
    ('FIL-001', 'ITM-KIT-BIENV', 12, 5),
    ('FIL-001', 'ITM-HER-01', 25, 10),
    ('FIL-001', 'ITM-HER-02', 25, 5)
    ) as v(ubicacion, articulo, cantidad, minimo)
  loop
    perform app.mover_stock(r.ubicacion, r.articulo, r.cantidad, 'Ingreso', 'SALDO-INICIAL', 'Saldo inicial (datos de prueba)');
    update public.stock s set minimo = r.minimo where s.articulo_id = r.articulo and s.ubicacion_id = r.ubicacion;
  end loop;
end $$;

commit;
