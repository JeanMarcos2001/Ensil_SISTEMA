/**
 * Datos reales de empresas y sedes: la lista está en `src/data/realOrg.ts` (única fuente, la misma de los datos de ejemplo) y de ella salen
 *  - `supabase/seed/empresas_y_sedes_reales.sql`  → la carga repetible en la base
 *  - `docs/DATOS_SEDES.md`                        → la tabla de consulta (para no volver a pedir los datos)
 * Antes de escribir nada, valida los datos con las mismas reglas que usa la pantalla Organización.
 * Ejecutar: npx tsx scripts/doc-sedes-reales.ts
 *
 * Origen: tabla `filiales` del proyecto de la web (`jtrugvxgztnxbhwjtiou`), exportada por el usuario el 2026-11-07,
 * y la empresa de cada sede, informada por el usuario el mismo día.
 */
import { writeFileSync } from 'node:fs';
import {
  PENDING_BRANCH as PENDIENTE, PHOTO_BASE, REAL_BRANCHES as SEDES, REAL_COMPANIES as EMPRESAS, RUC, realBranchId as sedeCode, realCompanyId as empresaCode, realOrgProblems,
} from '../src/data/realOrg';

const LOADED_ON = '2026-11-07';
const SQL_FILE = 'supabase/seed/empresas_y_sedes_reales.sql';
const MD_FILE = 'docs/DATOS_SEDES.md';
const EMPRESA_OBSERVACION = 'Razón social informada el 2026-11-07: confirmar con la ficha RUC de SUNAT.';
const EVOLUTION = RUC.evolution;

// ------------------------------------------------------------------------------------------------------------------ SQL

const q = (v: string) => `'${v.replace(/'/g, "''")}'`;
const qOrNull = (v: string) => (v.trim() ? q(v.trim()) : 'null');

function renderSql(): string {
  const empresas = EMPRESAS.filter(e => !e.inBase)
    .map(e => `    (${q(e.ruc)}, ${q(e.name)})`).join(',\n');
  const sedes = SEDES.filter(s => !s.inBase)
    .map(s => `    (${[s.name, s.ruc, s.address, s.reference, s.department, s.province, s.district].map(q).join(', ')}, ${qOrNull(s.phoneFixed)}, ${qOrNull(s.phoneMobile)})`).join(',\n');
  const evolution = EMPRESAS.find(e => e.ruc === EVOLUTION)!;
  return `-- GENERADO por \`npx tsx scripts/doc-sedes-reales.ts\` (no se edita a mano: cambie los datos en src/data/realOrg.ts y vuelva a generar).
-- Empresas y sedes reales de ENSIL. Los datos de cada sede salen de la tabla \`filiales\` del proyecto web; la empresa de cada una la informó el usuario el ${LOADED_ON}.
-- La tabla de consulta está en docs/DATOS_SEDES.md.
--
-- NO es una migración: se ejecuta a mano, una sola vez, en el SQL Editor del proyecto \`ensil-sistema\` (NO el de la web).
-- Antes: deben existir SILEE y Colegio Ensil de las Américas (Organización → Empresas) y las sedes Los Olivos y Piura.
-- Es seguro repetirlo: no vuelve a crear la empresa que ya tiene ese RUC ni la sede que ya tiene ese nombre.
-- Los códigos (EMP-NNN y FIL-NNN) se asignan solos, a continuación del mayor que exista, en el orden de esta lista.
-- Ilo (de la web) NO se carga todavía: aún no tiene empresa definida.
-- Todo o nada: si algo falla, no queda nada a medias.

do $$
declare
  e   record;
  s   record;
  n   int;
  eid text;
begin
  -- 1) Empresas nuevas (la razón social va como la informó el usuario: confirmarla con la ficha RUC de SUNAT).
  for e in
    select * from (values
${empresas}
    ) as t(ruc, razon_social)
  loop
    if not exists (select 1 from public.empresas where ruc = e.ruc) then
      select coalesce(max(substring(id from 5)::int), 0) + 1 into n from public.empresas;
      insert into public.empresas (id, ruc, razon_social, estado, observaciones)
      values ('EMP-' || lpad(n::text, 3, '0'), e.ruc, e.razon_social, 'Activo', ${q(EMPRESA_OBSERVACION)});
    end if;
  end loop;

  -- 2) Sedes nuevas, cada una con su empresa (se busca por RUC).
  for s in
    select * from (values
${sedes}
    ) as t(nombre, ruc, direccion, referencia, departamento, provincia, distrito, telefono_fijo, telefono_movil)
  loop
    select id into eid from public.empresas where ruc = s.ruc;
    if eid is null then
      raise exception 'No se encontró la empresa con RUC % (sede %).', s.ruc, s.nombre;
    end if;
    if not exists (select 1 from public.sedes where lower(nombre) = lower(s.nombre)) then
      select coalesce(max(substring(id from 5)::int), 0) + 1 into n from public.sedes;
      insert into public.sedes (id, nombre, empresa_id, estado, direccion, referencia, departamento, provincia, distrito, telefono_fijo, telefono_movil)
      values ('FIL-' || lpad(n::text, 3, '0'), s.nombre, eid, 'Activo', s.direccion, s.referencia, s.departamento, s.provincia, s.distrito, s.telefono_fijo, s.telefono_movil);
    end if;
  end loop;

  -- 3) Piura es de ${evolution.name} (la de «Colegio Ensil» no cuenta): se corrige la empresa de la sede que ya existía.
  select id into eid from public.empresas where ruc = ${q(EVOLUTION)};
  if eid is null then raise exception 'No se encontró la empresa con RUC ${EVOLUTION}.'; end if;
  update public.sedes set empresa_id = eid where lower(nombre) = 'piura' and empresa_id is distinct from eid;
end $$;

-- Comprobación: deben verse las ${EMPRESAS.length} empresas y las ${SEDES.length} sedes, cada sede con su empresa.
select s.id, s.nombre, e.razon_social as empresa, e.ruc, s.estado
from public.sedes s
left join public.empresas e on e.id = s.empresa_id
order by s.id;
`;
}

// ------------------------------------------------------------------------------------------------------------------ Documento

const cell = (v: string) => (v.trim() ? v.replace(/\|/g, '\\|') : '—');

function renderMd(): string {
  const empresaRows = EMPRESAS.map(e => {
    const own = SEDES.filter(s => s.ruc === e.ruc).map(s => s.name);
    return `| \`${empresaCode(e.ruc)}\` | ${e.ruc} | ${e.name} | ${own.length ? own.join(', ') : '— (ninguna por ahora)'} |`;
  }).join('\n');
  const sedeRows = SEDES.map(s =>
    `| \`${sedeCode(s.name)}\` | **${s.name}** | ${EMPRESAS.find(e => e.ruc === s.ruc)!.name} | ${s.department} | ${s.province} | ${s.district} | ${cell(s.address)} | ${cell(s.reference)} | ${cell(s.phoneFixed)} | ${cell(s.phoneMobile)} |`).join('\n');
  const extraRows = [...SEDES, PENDIENTE].map(s =>
    `| ${s.name} | ${s.webId} | [mapa](${s.maps}) | [foto](${PHOTO_BASE}${s.photo}) |`).join('\n');
  return `# Datos reales de empresas y sedes

> **Generado** con \`npx tsx scripts/doc-sedes-reales.ts\` — no se edita a mano: se cambian los datos en \`src/data/realOrg.ts\` y se vuelve a generar.
> Carga en la base: \`supabase/seed/empresas_y_sedes_reales.sql\` (ejecutada el ${LOADED_ON}).
> Los datos de ejemplo del sistema usan estos mismos códigos (\`FIL-NNN\`): ver \`seedBranches()\` en \`src/data/seedCatalog.ts\`.

**Origen.** Las direcciones, referencias y teléfonos salen de la tabla \`filiales\` del proyecto de la web (\`jtrugvxgztnxbhwjtiou\`), que el usuario exportó el ${LOADED_ON}. La empresa de cada sede y los RUC los informó el usuario el mismo día.
Este archivo existe para **no volver a pedir estos datos**: es la referencia de lo que va (y de lo que ya está) en Organización → Empresas / Filiales.

## Empresas (${EMPRESAS.length})

El almacén central pertenece a **SILEE**, igual que Los Olivos.

| Código | RUC | Razón social | Sedes |
|---|---|---|---|
${empresaRows}

> La razón social de las cuatro empresas nuevas se cargó **como la escribió el usuario**; falta confirmarla con la ficha RUC de SUNAT (por ejemplo, si SUNAT la escribe «ENSIL INT E.I.R.L.»). Se corrige en Organización → Empresas. Cada una lleva esa nota en «Observaciones».

## Sedes cargadas (${SEDES.length})

El código \`FIL-NNN\` lo asigna el sistema a continuación del mayor que exista (Los Olivos y Piura ya existían).

| Código | Sede | Empresa | Departamento | Provincia | Distrito | Dirección | Referencia | Teléfono fijo | Teléfono móvil |
|---|---|---|---|---|---|---|---|---|---|
${sedeRows}

## Sede pendiente: NO cargar todavía

| Sede | Empresa | Departamento | Provincia | Distrito | Dirección | Referencia | Teléfono móvil |
|---|---|---|---|---|---|---|---|
| **${PENDIENTE.name}** | — (sin definir) | ${PENDIENTE.department} | ${PENDIENTE.province} | ${PENDIENTE.district} | ${PENDIENTE.address} | ${PENDIENTE.reference} | ${PENDIENTE.phoneMobile} (en la web, con espacios; al cargarla se escribe junto: 981116176) |

Cuando se defina su empresa: agregarla al final de la lista de sedes de \`src/data/realOrg.ts\`, regenerar y cargar.

## Lo que la web guarda y el sistema (todavía) no

Mapa de Google, foto y número de la sede en la web (para cuando se pasen los archivos y los mapas al sistema).

| Sede | Id en la web | Mapa | Foto |
|---|---|---|---|
${extraRows}

## Decisiones y notas

- **Piura** figuraba dos veces en la tabla de empresas (Colegio Ensil y Ensil Evolution). El usuario aclaró que **la de Colegio Ensil no cuenta**: Piura es de **ENSIL EVOLUTION S.R.L.** Como la sede ya existía con Colegio Ensil, el script le corrige la empresa. Por eso **Colegio Ensil de las Américas queda sin sedes** por ahora (el usuario lo confirmó).
- **San Isidro** es de Ensil Evolution. **Ilo** se carga después (ver arriba): el usuario confirmó que **de momento no será registrada**.
- **Nombres:** se usan los de la web (\`Cajamarca\`, \`Cusco Magisterio\`, \`Cusco Marcavalle\`). Los 9 nombres que usan los datos de ejemplo del sistema (Piura, Chiclayo, Cajamarca, Los Olivos, San Isidro, Huancayo, Puno, Juliaca y Tacna) existen todos en la base. El nombre de una sede no se puede repetir.
- **Limpieza al cargar:** el enlace de mapa de Cajamarca traía un salto de línea escrito en el texto (\`\\r\\n\`) y se quitó; la dirección de Arequipa traía un espacio doble y quedó con uno.
- **Los datos no se tocaron** salvo lo anterior: «Urb. san juan» (Chiclayo) y «Mz K Teniente 14» (Ayacucho) quedan como están en la web; se corrigen en Organización → Filiales si hace falta.
- **La pantalla no cambia la empresa de una sede ya creada**: un cambio así se hace por SQL (así se corrigió Piura).
`;
}

// ------------------------------------------------------------------------------------------------------------------ Escribir

const problems = realOrgProblems();
if (problems.length) throw new Error(`Los datos reales no cumplen las reglas de Organización:\n- ${problems.join('\n- ')}`);
writeFileSync(SQL_FILE, renderSql(), 'utf8');
writeFileSync(MD_FILE, renderMd(), 'utf8');
console.log(`Escrito ${SQL_FILE} y ${MD_FILE}: ${EMPRESAS.length} empresas (${EMPRESAS.filter(e => !e.inBase).length} nuevas), ${SEDES.length} sedes (${SEDES.filter(s => !s.inBase).length} nuevas). Ilo queda pendiente.`);
