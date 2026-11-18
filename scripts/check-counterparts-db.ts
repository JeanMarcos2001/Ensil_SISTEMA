/**
 * Verificación de las contrapartes que consulta la base (migración 0028, función `contrapartes_de_funciones`):
 *  - el problema que resuelve: una cuenta común (Logística del almacén) solo lee su propia cuenta y su propio rol, así que el navegador no «veía» a quien
 *    recibe en la sede destino y bloqueaba el envío con «Nadie tiene Confirmar la recepción…» aunque esa persona existiera;
 *  - las filas de la base (función + lugar) se convierten en «personas» anónimas que responden a `availability` igual que las cuentas reales;
 *  - mientras la base no contesta, una cuenta común no se bloquea por algo que no pudo comprobar (el Superusuario sí lee todo);
 *  - la función de la base solo entrega función y lugar (nunca nombres, correos ni ids de cuentas), la llama quien tiene acceso vigente y se puede deshacer;
 *  - el cableado: el contexto usa el gancho y la decisión de ofrecer una función depende de que la base haya contestado.
 * Lo que hace la base se prueba aparte, contra una copia (ver `docs/PLANTILLA_SUPABASE.md`).
 * Ejecutar: npx tsx scripts/check-counterparts-db.ts
 */
import { readFileSync } from 'node:fs';
import { loadCounterparts, type CounterpartsRepository } from '../src/services/counterparts';
import { ALL_CAPABILITIES, availability, holdersWith } from '../src/utils/capabilities';
import { ALL_BRANCHES_PLACE, COUNTERPART_REFRESH_MS, counterpartCapabilityIds, counterpartsErrorMessage, holdersFromCounterpartRows, type CounterpartRow } from '../src/utils/counterpartsDb';
import { availabilityForViewer } from '../src/utils/guards';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : ` -> ${detail}`}`);
  if (!ok) failed++;
};
const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

const CHICLAYO = { branchId: 'FIL-003', branchName: 'Chiclayo' };
const PIURA = { branchId: 'FIL-002', branchName: 'Piura' };

// ------------------------------------------------------------------------------------------------------------------ El problema y su arreglo
// Lo que el navegador de Logística lee: solo su propia cuenta (nadie más). Sin las contrapartes de la base, el envío a Chiclayo se bloquea.
const levi = [{ id: 'u-levi', name: 'Levi', branchIds: [], allBranches: true, warehouseIds: ['ALM-001'], allWarehouses: false, capabilities: new Set(['log-envios:create', 'log-envios:dispatch', 'org-alcance:all_branches']) }];
const alone = availability('log-envios:dispatch', levi, CHICLAYO);
check('El problema: con solo su propia cuenta a la vista, Logística no encuentra a quien recibe en Chiclayo y el envío se bloquea', !alone.available && /Nadie tiene «Confirmar la recepción de un envío» en Chiclayo/.test(alone.reason ?? ''), JSON.stringify(alone));

const rows: CounterpartRow[] = [
  { funcion_id: 'log-recepciones:confirm', lugar_id: 'FIL-003' },
  { funcion_id: 'log-transfer:receive', lugar_id: 'FIL-003' },
];
const fromBase = holdersFromCounterpartRows(rows);
const fixed = availability('log-envios:dispatch', [...levi, ...fromBase], CHICLAYO);
check('El arreglo: con lo que contesta la base (alguien recibe en Chiclayo) el envío a Chiclayo se ofrece', fixed.available && fixed.advisories.length === 0, JSON.stringify(fixed));
check('Y a una sede donde nadie recibe sigue bloqueado, con el motivo', (() => { const r = availability('log-envios:dispatch', [...levi, ...fromBase], PIURA); return !r.available && /en Piura/.test(r.reason ?? ''); })());
check('Las transferencias igual: se ofrece despachar a Chiclayo (alguien recibe) y no a Piura',
  availability('log-transfer:dispatch', [...levi, ...fromBase], CHICLAYO).available && !availability('log-transfer:dispatch', [...levi, ...fromBase], PIURA).available);

// ------------------------------------------------------------------------------------------------------------------ Filas → personas anónimas
const mixed = holdersFromCounterpartRows([
  { funcion_id: 'log-recepciones:confirm', lugar_id: ALL_BRANCHES_PLACE },
  { funcion_id: 'log-envios:dispatch', lugar_id: 'ALM-001' },
  { funcion_id: 'log-transfer:receive', lugar_id: 'FIL-002' },
]);
check('Quien alcanza todas las sedes («*») cubre cualquier sede', holdersWith('log-recepciones:confirm', mixed, 'FIL-009').length === 1 && holdersWith('log-recepciones:confirm', mixed).length === 1);
check('Quien trabaja en el almacén no cubre una sede, y alcanzar todas las sedes no cuenta como trabajar en el almacén',
  holdersWith('log-envios:dispatch', mixed, 'ALM-001').length === 1 && holdersWith('log-envios:dispatch', mixed, 'FIL-002').length === 0 && holdersWith('log-recepciones:confirm', mixed, 'ALM-001').length === 0);
check('Una sede concreta solo cubre esa sede', holdersWith('log-transfer:receive', mixed, 'FIL-002').length === 1 && holdersWith('log-transfer:receive', mixed, 'FIL-003').length === 0);
check('Son personas anónimas: sin nombre y con una sola función cada una (no se mezclan con las cuentas reales)', mixed.every(h => h.name === '' && h.capabilities.size === 1 && h.id.startsWith('base:')) && new Set(mixed.map(h => h.id)).size === mixed.length);
check('Sin filas no hay nadie', holdersFromCounterpartRows([]).length === 0);

// ------------------------------------------------------------------------------------------------------------------ Qué se le pregunta a la base
const asked = counterpartCapabilityIds();
const expected = new Set(ALL_CAPABILITIES.flatMap(c => c.counterparts.map(x => x.capability)));
check('Se le pregunta a la base por TODAS las funciones que son contraparte de otra (las del registro), y por ninguna más', asked.length === expected.size && asked.every(id => expected.has(id)), asked.join());
check('Entre ellas están quien recibe envíos y transferencias en la sede destino', asked.includes('log-recepciones:confirm') && asked.includes('log-transfer:receive') && asked.includes('log-envios:dispatch'));
check('La base acepta hasta 60 funciones por consulta y el registro está muy por debajo', asked.length <= 60, String(asked.length));
check('Se pregunta sin repetir y en orden estable', new Set(asked).size === asked.length && [...asked].sort().join() === asked.join());

// ------------------------------------------------------------------------------------------------------------------ El servicio
const calls: string[][] = [];
let reply: { ok: boolean; data?: CounterpartRow[]; error?: string } = { ok: true, data: rows };
const repo: CounterpartsRepository = { async list(ids) { calls.push(ids); return reply; } };
const loaded = await loadCounterparts(repo);
check('El servicio le pasa a la base las funciones del registro y devuelve las personas anónimas', loaded.ok && loaded.value?.length === 2 && calls[0].join() === asked.join(), JSON.stringify(loaded));
reply = { ok: false, error: 'No se pudo.' };
const failedLoad = await loadCounterparts(repo);
check('Si la base falla, devuelve el motivo (sin lanzar)', !failedLoad.ok && failedLoad.error === 'No se pudo.');
reply = { ok: false };
check('Si falla sin motivo, uno claro', (await loadCounterparts(repo)).error === 'No se pudo comprobar quién puede recibir en la sede destino.');
check('Un error de la base se traduce a un mensaje claro', counterpartsErrorMessage(null) === 'No se pudo comprobar quién puede recibir en la sede destino.' && /\S/.test(counterpartsErrorMessage({ message: 'x', code: 'EN001' })));

// ------------------------------------------------------------------------------------------------------------------ Mientras la base no contesta
const blocked = availability('log-envios:dispatch', levi, CHICLAYO);
const common = availabilityForViewer(blocked, false, false);
check('Mientras la base no ha contestado, una cuenta común NO se bloquea por algo que no pudo comprobar (ni se le muestran avisos dudosos)', common.available && common.advisories.length === 0);
check('Cuando la base ya contestó, el bloqueo es real y se muestra', !availabilityForViewer(blocked, false, true).available && !availabilityForViewer(blocked, false).available);
const su = availabilityForViewer(blocked, true, false);
check('El Superusuario (que lee todas las cuentas) se maneja como siempre: se le ofrece y se le muestra el motivo', su.available && /Superusuario/.test(su.advisories[0] ?? ''));
check('Lo que ya estaba disponible no cambia para nadie', availabilityForViewer(fixed, false, false).available && availabilityForViewer(fixed, false, true) === fixed && availabilityForViewer(fixed, true, true) === fixed);

// ------------------------------------------------------------------------------------------------------------------ La migración 0028
const mig = read('supabase/migrations/20261118230000_contrapartes_de_funciones.sql');
const down = read('supabase/deshacer/20261118230000_contrapartes_de_funciones.down.sql');
const fnBody = mig.slice(mig.indexOf('create function public.contrapartes_de_funciones'), mig.indexOf('comment on function public.contrapartes_de_funciones'));
check('La función de la base solo entrega función y lugar: no lee nombres, correos ni ids de cuentas hacia afuera', /returns table \(funcion_id text, lugar_id text\)/.test(fnBody) && !/\bc\.nombre\b|\bc\.correo\b|\.documento\b|\.telefono\b/.test(fnBody)
  && /select distinct x\.funcion_id, x\.lugar_id/.test(fnBody));
check('Cuenta solo a quien está activo con rol activo y sin el Superusuario (igual que los avisos), y a quien alcanza todas las sedes por la función del rol o por la marca «Todas»',
  /c\.estado = 'Activo' and r\.estado = 'Activo' and not r\.es_sistema/.test(fnBody) && /org-alcance:all_branches/.test(fnBody) && /h\.todas_las_sedes/.test(fnBody)
  && /public\.cuenta_sedes/.test(fnBody) && /public\.cuenta_almacenes/.test(fnBody));
check('La puede llamar cualquier cuenta con acceso vigente (no hace falta ver a las demás), con tope de funciones, y nadie sin sesión',
  /if not app\.acceso_vigente\(\)/.test(fnBody) && /cardinality\(p_funciones\) > 60/.test(fnBody)
  && /revoke execute on function public\.contrapartes_de_funciones\(text\[\]\) from public, anon;/.test(mig) && /grant execute on function public\.contrapartes_de_funciones\(text\[\]\) to authenticated;/.test(mig));
check('Es de solo lectura y no depende de la cuenta que pregunta más que para exigir el acceso: no escribe en ninguna tabla', !/\b(insert|update|delete)\b\s+(into|from)?\s*public\./i.test(fnBody));
check('La migración se puede deshacer: quita la función y devuelve la recepción de la 0027', /drop function if exists public\.contrapartes_de_funciones\(text\[\]\)/.test(down) && /create or replace function public\.confirmar_recepcion/.test(down));

// ------------------------------------------------------------------------------------------------------------------ El cableado
const hook = read('src/hooks/useCounterparts.ts');
const ctx = read('src/context/DataContext.tsx');
check('El gancho lee al abrir, cada 5 minutos y al volver a la pestaña; si falla se queda con lo que había y nunca impide abrir el sistema',
  COUNTERPART_REFRESH_MS === 300000 && /setInterval/.test(hook) && /visibilitychange/.test(hook) && /if \(res\.ok && res\.value\) \{ setHolders\(res\.value\); setReady\(true\); \}/.test(hook) && !/throw/.test(hook));
check('El contexto suma lo que contesta la base a las cuentas que el navegador sí lee, y decide con `ready` (si la base no contestó, no bloquea a una cuenta común)',
  /const counterparts = useCounterparts\(\);/.test(ctx) && /\[\.\.\.holders, \.\.\.counterparts\.holders\]/.test(ctx) && /availabilityForViewer\(availability\(capabilityId, availabilityHolders, target\), currentUser\.role === SUPERUSER, counterparts\.ready\)/.test(ctx));
check('Lo que dependía solo de las cuentas leídas (avisos por regla, semáforo de roles) NO mezcla las personas anónimas', /buildHolders\(\{ users, roles, permissions, branches \}\), \[users, roles, permissions, branches\]\)/.test(ctx));
check('El repositorio de Supabase llama a la función de la base con las funciones pedidas', /client\.rpc\('contrapartes_de_funciones', \{ p_funciones: functionIds \}\)/.test(read('src/services/counterpartsRepository.ts')));

if (failed > 0) {
  console.log(`\n${failed} comprobaciones fallaron.`);
  process.exit(1);
}
console.log('\nTodas las comprobaciones pasaron.');
