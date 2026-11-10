/**
 * Carga de partida de Logística en la base (SQL): el stock de ejemplo, los couriers y los métodos de envío. Sale de los mismos datos de ejemplo
 * del sistema (`data/seedCatalog.ts`) y de la misma traducción que usa el repositorio (`utils/stockDb.ts`).
 * `scripts/doc-logistica-seed.ts` la escribe en `supabase/seed/logistica_inicial.sql` y `scripts/check-stock-db.ts` comprueba que el archivo esté
 * al día. Función pura: no toca archivos.
 *
 * El stock entra como un ingreso «Saldo inicial» en el kardex (para que lo que hay siempre tenga su movimiento detrás), con su mínimo de alerta.
 * No se cargan envíos, transferencias ni ajustes de ejemplo: eran de 2024 y dejarían un historial que no cuadra con el kardex.
 */
import { seedCouriers, seedShippingMethods, seedStock } from '../data/seedCatalog';
import { insert, type Value } from './catalogSeedSql';
import { courierToRow, methodToRow } from './stockDb';

const rows = (list: object[]) => list as unknown as Record<string, Value>[];
const q = (v: string): string => `'${v.replace(/'/g, "''")}'`;

export function renderLogisticsSeedSql(): string {
  const values = seedStock().map(s => `    (${q(s.branchId)}, ${q(s.itemId)}, ${s.stock}, ${s.minStock})`).join(',\n');
  return `-- =====================================================================================================================
-- Logística de partida: stock, couriers y métodos de envío (generado: NO se edita a mano)
-- ---------------------------------------------------------------------------------------------------------------------
-- Sale de \`src/data/seedCatalog.ts\` con \`npx tsx scripts/doc-logistica-seed.ts\`. Requiere las migraciones 0012 (stock y kardex) y 0013 (envíos,
-- transferencias y recepciones), los artículos cargados (\`articulos_y_recetas.sql\`) y las sedes y el almacén reales (\`empresas_y_sedes_reales.sql\`).
-- Es repetible: los couriers y métodos que ya existen no se vuelven a cargar, y el stock solo se carga si todavía no hay ninguna fila.
-- El stock entra como un ingreso «Saldo inicial» en el kardex: lo que hay siempre tiene su movimiento detrás.
-- =====================================================================================================================

begin;

${insert('couriers', rows(seedCouriers().map(courierToRow)))}
${insert('metodos_envio', rows(seedShippingMethods().map(methodToRow)))}
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
${values}
    ) as v(ubicacion, articulo, cantidad, minimo)
  loop
    perform app.mover_stock(r.ubicacion, r.articulo, r.cantidad, 'Ingreso', 'SALDO-INICIAL', 'Saldo inicial (datos de prueba)');
    update public.stock s set minimo = r.minimo where s.articulo_id = r.articulo and s.ubicacion_id = r.ubicacion;
  end loop;
end $$;

commit;
`;
}
