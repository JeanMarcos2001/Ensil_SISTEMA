/**
 * Carga de partida del catálogo comercial en la base (SQL): sale de los mismos datos de ejemplo del sistema (`data/seedCatalog.ts`) y de la
 * misma traducción que usa el repositorio (`utils/catalogDb.ts`), así que lo que se carga es exactamente lo que el sistema sabe leer.
 * `scripts/doc-catalogo-seed.ts` la escribe en `supabase/seed/catalogo_comercial.sql` y `scripts/check-catalog-db.ts` comprueba que el
 * archivo esté al día. Función pura: no toca archivos.
 */
import {
  seedLeadSources, seedLevels, seedPaymentTypes, seedPrograms, seedPromotions, seedTariffs,
} from '../data/seedCatalog';
import { leadSourceToRow, levelToRow, paymentTypeToRow, programToRow, promotionToRow, tariffToRow } from './catalogDb';

export type Value = string | number | boolean | null | string[] | object;

/** Columnas que guardan una lista de objetos (jsonb): una lista vacía NO es un arreglo de textos. */
const JSONB_COLUMNS = new Set(['lineas', 'composicion', 'articulos', 'entrenamientos_variables', 'cobros', 'partes', 'reparto', 'documentos', 'documento', 'reversa', 'deposito', 'venta', 'datos', 'efectos']);

const q = (v: string): string => `'${v.replace(/'/g, "''")}'`;

function literal(v: Value, column = ''): string {
  if (v === null) return 'null';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'string') return q(v);
  // Lista de textos → text[]; lista de objetos (el desglose de un tarifario) u objeto (una constancia) → jsonb
  if (JSONB_COLUMNS.has(column) || !Array.isArray(v)) return `${q(JSON.stringify(v))}::jsonb`;
  if (v.length === 0 || typeof v[0] === 'string') return `array[${(v as string[]).map(q).join(', ')}]::text[]`;
  return `${q(JSON.stringify(v))}::jsonb`;
}

export function insert(table: string, rows: Record<string, Value>[]): string {
  if (rows.length === 0) return '';
  const columns = Object.keys(rows[0]);
  const values = rows.map(r => `  (${columns.map(c => literal(r[c], c)).join(', ')})`).join(',\n');
  return `insert into public.${table} (${columns.join(', ')}) values\n${values}\non conflict do nothing;\n`;
}

export function renderCatalogSeedSql(): string {
  return `-- =====================================================================================================================
-- Catálogo comercial de partida (generado: NO se edita a mano)
-- ---------------------------------------------------------------------------------------------------------------------
-- Sale de \`src/data/seedCatalog.ts\` con \`npx tsx scripts/doc-catalogo-seed.ts\`. Requiere la migración 0010 (catálogo comercial) y las sedes
-- reales cargadas (\`empresas_y_sedes_reales.sql\`): «Pre-lectura» solo se ofrece en Piura y Chiclayo.
-- Es repetible: lo que ya existe (mismo id o mismo código) no se vuelve a cargar ni se modifica.
-- No incluye «Especialización»: el programa avanzado es solo «Profesional».
-- =====================================================================================================================

begin;

${insert('programas', seedPrograms().map(programToRow) as unknown as Record<string, Value>[])}
${insert('niveles', seedLevels().map(levelToRow) as unknown as Record<string, Value>[])}
${insert('tipos_pago', seedPaymentTypes().map(paymentTypeToRow) as unknown as Record<string, Value>[])}
${insert('tarifarios', seedTariffs().map(tariffToRow) as unknown as Record<string, Value>[])}
${insert('promociones', seedPromotions().map(promotionToRow) as unknown as Record<string, Value>[])}
${insert('origenes_lead', seedLeadSources().map(leadSourceToRow) as unknown as Record<string, Value>[])}
commit;
`;
}
