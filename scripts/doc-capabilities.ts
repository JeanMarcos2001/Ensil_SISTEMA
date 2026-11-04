/**
 * Genera docs/CATALOGO_DE_FUNCIONES.md a partir del registro único de funciones (no se edita a mano).
 * Ejecutar: npx tsx scripts/doc-capabilities.ts
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_CAPABILITIES, capabilityById } from '../src/utils/capabilities';
import { CATALOG_MODULES, ENTITIES, EVENTS, FUNCTIONALITIES, INCOMPATIBILITIES, MENU_WITHOUT_CAPABILITY, NON_CAPABILITY_ACTIONS } from '../src/utils/capabilityRegistry';

const label = (id: string) => capabilityById(id)?.label ?? id;
const ent = (xs: string[]) => xs.map(x => ENTITIES[x] ?? x).join(', ') || '—';
const WHERE: Record<string, string> = { 'same-branch': 'en la misma sede', 'destination-branch': 'en la sede destino', any: 'en cualquier sede' };
const RWHERE: Record<string, string> = { 'destination-branch': 'sede destino', 'origin-branch': 'sede origen', 'subject-branch': 'sede del alumno o documento', any: 'cualquier sede' };
const SENS: Record<string, string> = { dinero: '💲', remuneracion: '👁‍🗨 sueldos', control: '🛡 control' };
const cell = (t: string) => t.replace(/\|/g, '/');

const out: string[] = [];
const total = ALL_CAPABILITIES.length;
out.push('# Catálogo de funciones y conexiones');
out.push('');
out.push('> **Generado** desde `src/utils/capabilityRegistry.ts` con `npx tsx scripts/doc-capabilities.ts`. No se edita a mano: para cambiar algo, se cambia el registro y se vuelve a generar.');
out.push('> Es el cuadro de referencia del constructor de roles: qué función existe, qué necesita, qué otra persona debe poder hacer, qué datos toca y qué avisos dispara.');
out.push('');
out.push(`**${FUNCTIONALITIES.length} funcionalidades · ${total} funciones** (${ALL_CAPABILITIES.filter(c => c.reserved).length} reservadas) · ${EVENTS.length} avisos · ${INCOMPATIBILITIES.length} combinaciones a separar.`);
out.push('');
out.push('Cómo leerlo:');
out.push('- **Requiere:** lo que el mismo usuario necesita; al marcar la función se marca solo.');
out.push('- **Contraparte:** lo que otra persona debe poder hacer. **Obligatoria** = sin ella la función no se ofrece; **recomendada** = se ofrece y se avisa.');
out.push('- **Lee → Escribe:** los datos que toca (alimentan el mapa de conexiones).');
out.push('- **Avisos:** los avisos que dispara. 💲 mueve dinero · 👁‍🗨 muestra sueldos · 🛡 control (pide motivo y deja historial).');
out.push('');

for (const m of CATALOG_MODULES) {
  const funcs = FUNCTIONALITIES.filter(f => f.module === m.id);
  if (!funcs.length) continue;
  out.push(`## ${m.name}`);
  out.push('');
  for (const f of funcs) {
    out.push(`### ${f.name} \`${f.id}\``);
    out.push('');
    out.push('| Función | Tipo | Requiere | Contraparte | Lee → Escribe | Avisos |');
    out.push('|---|---|---|---|---|---|');
    for (const c of f.capabilities) {
      const sens = c.sensitive ? ` ${SENS[c.sensitive]}` : '';
      const reserved = c.reserved ? ' _(reservada)_' : '';
      const menu = c.menu ? ` · menú «${c.menu.item}»` : '';
      const cp = c.counterparts.length ? c.counterparts.map(x => `${label(x.capability)} ${WHERE[x.where]} (${x.strength === 'required' ? 'obligatoria' : 'recomendada'})`).join('<br>') : '—';
      const req = c.requires.length ? c.requires.map(label).join(', ') : '—';
      const rw = `${ent(c.reads)} → ${ent(c.writes)}`;
      const ev = c.emits.length ? c.emits.map(e => EVENTS.find(x => x.id === e)?.label ?? e).join(', ') : '—';
      out.push(`| **${cell(c.label)}**${sens}${reserved}${menu}<br><code>${c.id}</code> | ${c.kind} | ${cell(req)} | ${cell(cp)} | ${cell(rw)} | ${cell(ev)} |`);
    }
    out.push('');
  }
}

out.push('## Avisos con destinatario');
out.push('');
out.push('El aviso llega a quien tenga la función indicada en la sede que corresponde, no a un nombre de rol. Si nadie la tiene, llega a quien tenga «' + label('sis-avisos:fallback') + '».');
out.push('');
out.push('| Aviso | Lo dispara | Llega a quien tenga… (y dónde) |');
out.push('|---|---|---|');
for (const e of EVENTS) {
  const who = e.recipients.map(r => ('person' in r ? (r.person === 'requester' ? 'Quien hizo la solicitud' : 'Quien ejecutó la acción') : `${label(r.capability)} (${RWHERE[r.where]})`)).join('<br>');
  const by = e.trigger === 'sistema' ? 'La regla del sistema (por fecha o estado)' : ALL_CAPABILITIES.filter(c => c.emits.includes(e.id)).map(c => c.label).join(' · ');
  out.push(`| ${e.label} | ${cell(by)} | ${cell(who)} |`);
}
out.push('');

out.push('## Combinaciones que conviene separar');
out.push('');
out.push('Si un rol reúne **todas** las funciones de la fila, el constructor avisa y pide un motivo para guardar.');
out.push('');
out.push('| Funciones | Por qué |');
out.push('|---|---|');
for (const r of INCOMPATIBILITIES) out.push(`| ${r.capabilities.map(label).join(' + ')} | ${r.message} |`);
out.push('');

out.push('## Lo que no es una función');
out.push('');
out.push('Acciones del contexto que no pertenecen a una persona (consultas, ayudas internas, estado de la interfaz):');
out.push('');
for (const [a, why] of Object.entries(NON_CAPABILITY_ACTIONS)) out.push(`- \`${a}\`: ${why}`);
out.push('');
out.push('Ítems del menú sin función todavía:');
out.push('');
for (const [k, why] of Object.entries(MENU_WITHOUT_CAPABILITY)) out.push(`- \`${k}\`: ${why}`);
out.push('');

const target = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'CATALOGO_DE_FUNCIONES.md');
writeFileSync(target, out.join('\n'), 'utf-8');
console.log(`Escrito ${target} (${out.length} líneas)`);
