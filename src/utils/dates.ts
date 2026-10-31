/**
 * Fechas (funciones puras, sin dependencias): todo el sistema guarda las fechas como texto ISO (AAAA-MM-DD, o un instante ISO
 * completo si importa la hora). El texto para mostrar («24 Mar 2024», «24/03/2024») se arma siempre al pintar la pantalla.
 */

/** Edad en años cumplidos a una fecha (ISO). `null` si la fecha no es válida. */
export function ageOn(birthDate: string, onDate: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return null;
  const [by, bm, bd] = birthDate.split('-').map(Number);
  const [y, m, d] = onDate.split('-').map(Number);
  let age = y - by;
  if (m < bm || (m === bm && d < bd)) age--;
  return age;
}
