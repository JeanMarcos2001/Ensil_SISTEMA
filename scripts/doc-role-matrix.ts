/**
 * Genera docs/PRUEBAS_POR_ROL.md: qué ve y qué puede hacer cada cuenta de ejemplo (no se edita a mano).
 * Ejecutar: npx tsx scripts/doc-role-matrix.ts
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { seedBranches, seedPermissions, seedRoles, seedUsers } from '../src/data/seedCatalog';
import { EVENTS } from '../src/utils/capabilityRegistry';
import { accountProfiles, KEY_ACTIONS } from '../src/utils/roleMatrix';

const branches = seedBranches();
const profiles = accountProfiles({ users: seedUsers(), roles: seedRoles(), permissions: seedPermissions(), branches });
const SHORT: Record<string, string> = {
  'Admin Sistema': 'Admin. general', 'Laura Martínez': 'Sede (Piura)', 'Marco Salas': 'Sede (Los Olivos)', 'Juan Pérez': 'Psicopedagogía',
  'Rosa Quispe': 'Almacén', 'Elena Ramos': 'Contabilidad', Superadmin: 'Superusuario',
};
const ORDER = ['Laura Martínez', 'Marco Salas', 'Juan Pérez', 'Rosa Quispe', 'Admin Sistema', 'Elena Ramos', 'Superadmin'];
const cols = ORDER.map(n => profiles.find(p => p.name === n)!).filter(Boolean);
const head = (first: string) => [`| ${first} | ${cols.map(c => SHORT[c.name] ?? c.name).join(' | ')} |`, `|---|${cols.map(() => ':-:').join('|')}|`];
const yes = (v: boolean) => (v ? '✔' : '—');

const out: string[] = [];
out.push('# Pruebas por rol: qué ve y qué puede hacer cada cuenta');
out.push('');
out.push('> **Generado** con `npx tsx scripts/doc-role-matrix.ts`; las verificaciones están en `scripts/check-role-matrix.ts`. No se edita a mano.');
out.push('> Se calcula con las mismas reglas del sistema (permisos del rol, guardas de las acciones, menú por función, Dashboard por rol, alcance de sedes y avisos), con las 7 cuentas activas de ejemplo (PIN 1234).');
out.push('');

out.push('## 1. Resumen por cuenta');
out.push('');
out.push('| Cuenta | Rol | Sedes que alcanza | Funciones | Acciones del sistema que puede | Ítems de menú | Tarjetas del Dashboard | Avisos que recibe |');
out.push('|---|---|:-:|:-:|:-:|:-:|:-:|:-:|');
for (const p of cols) {
  out.push(`| ${p.name} | ${p.role} | ${p.scope.allBranches ? `todas (${p.scope.branchIds.length})` : p.scope.branchIds.map(id => branches.find(b => b.id === id)?.name).join(', ')} | ${p.capabilities.length} | ${p.allowedActions} | ${p.menu.length} | ${p.dashboard.cards.length} | ${p.name === 'Superadmin' ? 'todos (soporte)' : p.notices.length} |`);
}
out.push('');

out.push('## 2. Acciones clave');
out.push('');
out.push('✔ = la guarda deja ejecutarla · — = la guarda la frena nombrando la función que falta. Es lo que decide quién cobra, quién reversa, quién aprueba, quién mueve stock y quién ve sueldos.');
out.push('');
let group = '';
out.push(...head('Acción'));
for (const a of KEY_ACTIONS) {
  if (a.group !== group) { group = a.group; out.push(`| **${group}** |${cols.map(() => '').join('|')}|`); }
  out.push(`| ${a.label} | ${cols.map(c => yes(c.allowed.includes(a.id))).join(' | ')} |`);
}
out.push('');

out.push('## 3. Menú que ve cada cuenta');
out.push('');
out.push('Solo los ítems que piden una función (todos ven «Preferencias» y el botón «Ayuda»). «Configuración» solo la ven quienes tienen alguna sección de configuración.');
out.push('');
const allItems = [...new Set(profiles.flatMap(p => p.menu))];
out.push(...head('Ítem'));
for (const item of allItems) out.push(`| ${item} | ${cols.map(c => yes(c.menu.includes(item))).join(' | ')} |`);
out.push(`| Botón «Configuración» | ${cols.map(c => yes(c.settings)).join(' | ')} |`);
out.push('');

out.push('## 4. Dashboard por rol');
out.push('');
out.push('| Cuenta | Primera pantalla | Tarjetas | Resumen por sedes | Caja y vencimientos | Actividad reciente | Accesos rápidos |');
out.push('|---|---|---|:-:|:-:|:-:|---|');
for (const p of cols) {
  out.push(`| ${p.name} (${SHORT[p.name]}) | ${p.firstPath} | ${p.dashboard.cards.join(', ') || '—'} | ${yes(p.dashboard.sedes)} | ${yes(p.dashboard.cashPanel)} | ${yes(p.dashboard.activity)} | ${p.dashboard.quickLinks.map(l => l.label).join(', ')} |`);
}
out.push('');

out.push('## 5. Avisos que recibe cada cuenta');
out.push('');
out.push('Para un caso en su propia sede (el origen de los envíos es el almacén). El Superusuario ve todos los avisos por ser el rol de soporte.');
out.push('');
for (const p of cols.filter(c => c.name !== 'Superadmin')) {
  out.push(`- **${p.name}** (${SHORT[p.name]}): ${p.notices.length ? p.notices.map(id => EVENTS.find(e => e.id === id)?.label ?? id).join(', ') : 'ninguno'}`);
}
out.push('');

out.push('## 6. Hallazgos del paso 8');
out.push('');
out.push('| # | Hallazgo | Estado |');
out.push('|---|---|---|');
out.push('| 1 | **Titulares mostraba el saldo, la deuda vencida y el estado de cuenta a quien no ve pagos** (Psicopedagogía veía lo que debe cada titular). | ✅ Corregido: esas columnas, el filtro de deuda, la exportación del saldo y «Ver estado de cuenta» piden «Ver pagos». |');
out.push('| 2 | **Los accesos rápidos «Nueva Filial» y «Nuevo Usuario» se ofrecían a Administración general**, que ve esas pantallas pero no puede crear nada ahí. | ✅ Corregido: los accesos «Nuevo…» piden poder crear eso. |');
out.push('| 3 | **El Almacén central editaba los precios del catálogo** (`log-catalogo:edit_price`, función sensible de dinero). | ✅ Decidido: el Almacén ya no fija precios; los fija Administración general. |');
out.push('| 4 | **El administrador de sede podía reabrir el cierre de la CAJA CHICA** (la función de contarla cubría cerrar y reabrir). | ✅ Decidido: reabrir la caja chica es de Administración general (función propia `op-caja-chica:reopen_box`); la sede la cuenta y la cierra. |');
out.push('| 5 | **Psicopedagogía veía Alumnos y Titulares** (datos de contacto), aunque el plan no los menciona para ese rol. | ✅ Decidido: ve Alumnos y no Titulares. |');
out.push('| 6 | **Psicopedagogía no recibía ningún aviso** (las primeras asesorías sin materiales iban solo al administrador de sede). | ✅ Decidido: recibe el aviso de primeras asesorías sin materiales de su sede. |');
out.push('| 7 | **Administración general no crea sedes, cuentas ni roles** (solo el Superusuario), aunque ve «Empresas» y «Filiales». | ℹ Coherente con el plan; las pantallas ya no ofrecen el botón. |');
out.push('| 8 | La lista «Sistema» muestra «Preferencias» a todos los roles (no pide función). | ⏳ Pendiente (ya anotado). |');
out.push('| 11 | **La campana de avisos solo la veía Administración general**: los demás roles recibían avisos que no podían ver. | ✅ Las plantillas de sede, almacén, Psicopedagogía y Contabilidad tienen «Ver la bandeja de avisos». |');
out.push('| 9 | **La marca «Pagada» de la planilla** no corresponde a ningún proceso (el sistema no registra pagos al personal). | ✅ Retirada: la planilla queda en Borrador → Cerrada. |');
out.push('| 10 | **Quien pide una solicitud podía resolverla él mismo.** | ✅ `allowSelfApproval = false` (el Superusuario queda exento). |');
out.push('');

out.push('## 7. Prueba en el navegador');
out.push('');
out.push('Se entró con cada una de las 7 cuentas (cambio de usuario con PIN) y se comparó lo que muestra la pantalla con esta matriz:');
out.push('');
out.push('- **Menú lateral:** para las 7 cuentas, los ítems visibles coinciden exactamente con los de la sección 3 (ninguno de más, ninguno de menos); el botón «Configuración» aparece solo para Administración general y el Superusuario.');
out.push('- **Dashboard:** el número de tarjetas y los accesos rápidos coinciden con la sección 4 en las 7 cuentas, y todas entran al Dashboard.');
out.push('- **Rutas escritas a mano en la barra de direcciones:** Laura no abre Usuarios ni Planilla; Juan no abre Caja; Rosa no abre Recepciones; Elena no abre Matrículas; cada una ve «Su rol no tiene acceso a…» con la función que falta. Sí abren lo suyo (Laura: Caja con sus botones de venta y egreso; Elena: Caja sin botones de registro, solo lectura y exportación; Juan: Programación; Rosa: Stock).');
out.push('- **Corrección comprobada (hallazgo 1):** en Titulares, Juan (Psicopedagogía) ya no ve la columna de saldo, el filtro de deuda ni «Ver estado de cuenta»; Laura (sede) los sigue viendo.');
out.push('- Sin errores de consola.');
out.push('');

const here = dirname(fileURLToPath(import.meta.url));
writeFileSync(join(here, '..', 'docs', 'PRUEBAS_POR_ROL.md'), out.join('\n') + '\n', 'utf8');
console.log(`docs/PRUEBAS_POR_ROL.md: ${out.length} líneas`);
