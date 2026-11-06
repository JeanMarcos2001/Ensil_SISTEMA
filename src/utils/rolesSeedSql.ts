/**
 * Script SQL de los roles de partida (`supabase/seed/roles_de_partida.sql`), generado desde las plantillas (`utils/roleTemplates.ts`):
 * así el rol que se carga en la base es exactamente el que describe el código. Función pura; `scripts/doc-roles-seed.ts` lo escribe y
 * `scripts/check-access-roles.ts` comprueba que el archivo no se desfase.
 *
 * - El Superusuario (rol del sistema) no se incluye: lo crea la migración 0001.
 * - Los ids se asignan en orden (ROL-002, ROL-003…); el nombre de cada rol es único en la base.
 * - Es repetible: un rol que ya existe (mismo id o mismo nombre) se omite junto con sus funciones.
 */
import { roleClosure } from './capabilities';
import { ROLE_TEMPLATES, type RoleTemplate } from './roleTemplates';

const lit = (s: string): string => `'${s.replace(/'/g, "''")}'`;

export interface SeededRole { id: string; template: RoleTemplate; functions: string[] }

/** Los roles de partida (sin el del sistema) con el id que reciben y sus funciones completas. */
export function seededRoles(templates: RoleTemplate[] = ROLE_TEMPLATES): SeededRole[] {
  return templates.filter(t => !t.locked).map((template, i) => ({
    id: `ROL-${String(i + 2).padStart(3, '0')}`, template, functions: [...new Set(roleClosure(template.capabilities).all)].sort(),
  }));
}

export function renderRolesSeedSql(templates: RoleTemplate[] = ROLE_TEMPLATES): string {
  const roles = seededRoles(templates);
  const roleRows = roles.map(({ id, template: t }) => {
    const risks = t.risks && Object.keys(t.risks).length > 0
      ? `jsonb_build_array(${Object.entries(t.risks).map(([ruleId, reason]) => `jsonb_build_object('ruleId', ${lit(ruleId)}, 'reason', ${lit(reason)}, 'by', 'Plantilla de partida', 'at', current_date::text)`).join(', ')})`
      : `'[]'::jsonb`;
    return `    (${lit(id)}, ${lit(t.name)}, ${lit(t.desc)}, 'Activo', ${lit(t.id)}, ${t.branchUserLimit ?? 'null'}, ${risks})`;
  });
  const functionRows = roles.flatMap(r => r.functions.map(f => `    (${lit(r.id)}, ${lit(f)})`));
  return `-- Roles de partida (generado desde src/utils/roleTemplates.ts con \`npx tsx scripts/doc-roles-seed.ts\`; no se edita a mano).
-- NO es una migración: son datos que se cargan una sola vez a mano. El Superusuario ya existe (migración 0001).
--
-- Cargar: pegar este script en el SQL Editor del proyecto \`ensil-sistema\` (NO el de la web).
-- Es seguro repetirlo: un rol que ya existe (mismo id o mismo nombre) se omite junto con sus funciones.
-- Crea ${roles.length} roles (${roles.map(r => r.id).join(', ')}) con ${functionRows.length} funciones en total.

with nuevos as (
  insert into public.roles (id, nombre, descripcion, estado, plantilla_id, limite_cuentas_por_sede, riesgos_aceptados)
  values
${roleRows.join(',\n')}
  on conflict do nothing
  returning id
)
insert into public.rol_funciones (rol_id, funcion_id)
select v.rol_id, v.funcion_id
from (values
${functionRows.join(',\n')}
) as v(rol_id, funcion_id)
where v.rol_id in (select id from nuevos);

-- Comprobación: cada rol con su número de funciones.
select r.id, r.nombre, r.limite_cuentas_por_sede as limite, count(f.funcion_id) as funciones
from public.roles r
left join public.rol_funciones f on f.rol_id = r.id
group by r.id, r.nombre, r.limite_cuentas_por_sede
order by r.id;
`;
}
