/**
 * Carga de partida de titulares y alumnos en la base (SQL): sale de los mismos datos de ejemplo del sistema (`data/seedPeople.ts`) y de la misma
 * traducción que usa el repositorio (`utils/peopleDb.ts`). `scripts/doc-personas-seed.ts` la escribe en `supabase/seed/personas_de_ejemplo.sql` y
 * `scripts/check-people-db.ts` comprueba que el archivo esté al día. Función pura: no toca archivos.
 *
 * Las matrículas, los planes, los pagos y la agenda de ejemplo siguen en memoria y nombran a estas personas por su código (ALU-001…, TIT-001…): por
 * eso se cargan con esos mismos códigos. Las fechas de nacimiento se calculan a partir de un día fijo (`SEED_REFERENCE_DAY`), así el archivo es
 * siempre el mismo.
 */
import { buildPeopleSeed } from '../data/seedPeople';
import { insert, type Value } from './catalogSeedSql';
import { guardianToSeedRow, studentToSeedRow } from './peopleDb';

/** El día con el que se arman los datos de ejemplo de la carga (cambiarlo cambia las fechas de nacimiento y se vuelve a generar el archivo). */
export const SEED_REFERENCE_DAY = '2026-11-10';

const rows = (list: object[]) => list as unknown as Record<string, Value>[];

export function renderPeopleSeedSql(): string {
  const seed = buildPeopleSeed(SEED_REFERENCE_DAY);
  const links = seed.students.flatMap(s => s.guardianIds.map((g, i) => ({ alumno_id: s.id, titular_id: g, orden: i + 1 })));
  const last = (table: string) => `perform setval(pg_get_serial_sequence('public.${table}', 'numero'), greatest((select max(numero) from public.${table}), 1));`;
  return `-- =====================================================================================================================
-- Titulares y alumnos de ejemplo (generado: NO se edita a mano)
-- ---------------------------------------------------------------------------------------------------------------------
-- Sale de \`src/data/seedPeople.ts\` con \`npx tsx scripts/doc-personas-seed.ts\`. Requiere la migración 0014 (titulares y alumnos).
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

${insert('titulares', rows(seed.guardians.map(guardianToSeedRow)))}
${insert('alumnos', rows(seed.students.map(studentToSeedRow)))}
${insert('alumno_titulares', rows(links))}
  -- Los códigos siguientes continúan después de los de ejemplo
  ${last('titulares')}
  ${last('alumnos')}
end $$;

commit;
`;
}
