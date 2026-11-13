/**
 * Verificación de los códigos de Personal, Asignaciones y Contratos de personal que asigna la BASE (migración 0020, `src/utils/draftIds.ts`):
 *  - el código de borrador de cada tipo (`STF-~1~`, `ASG-~2~`, `CON-~3~`, `AJU-~4~`): formato, sin año, que dos no se repitan;
 *  - el cableado: la migración asigna exactamente los tipos que la pantalla pide, con candado hasta el final de la operación, sin recortar al pasar de
 *    999, con el disparador de la ficha y de la asignación ANTES de la validación, y con las funciones de contratos y ajustes como envolturas que
 *    devuelven el código; se puede deshacer; las funciones base y el asignador no se llaman de fuera;
 *  - que la pantalla ya no inventa estos códigos con lo que ve (ni el servicio de Personal ni el de Contratos ni el armador de la ficha), y que el
 *    repositorio de Supabase lee de la base el código asignado.
 * El caso que originó esto (la cuenta de una sede proponía un código que ya existía en otra) se comprueba en `check-staff-db.ts` y
 * `check-contracts-db.ts` con repositorios en memoria, y la base se prueba aparte contra una copia (con las mismas cuentas por sede).
 * Ejecutar: npx tsx scripts/check-staff-codes.ts
 */
import { readFileSync } from 'node:fs';
import { CODE_KINDS, draftId, isDraftId, STAFF_CODE_KINDS, type CodeKind, type StaffCodeKind } from '../src/utils/draftIds';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : ` -> ${detail}`}`);
  if (!ok) failed++;
};
const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const throws = (fn: () => unknown, re: RegExp) => { try { fn(); return false; } catch (e) { return re.test(String((e as Error).message)); } };

// ------------------------------------------------------------------------------------------------------------------ El código de borrador
const kinds = Object.keys(STAFF_CODE_KINDS) as StaffCodeKind[];
check('Hay cuatro tipos: ficha (STF), asignación (ASG), contrato de personal (CON) y ajuste de planilla (AJU)', kinds.join() === 'STF,ASG,CON,AJU');
check('Ninguno de estos tipos se mezcla con los del dinero (cada migración asigna los suyos)', kinds.every(k => !(k in CODE_KINDS)));
{
  const drafts = kinds.map(k => draftId(k));
  check('Un borrador tiene el aspecto del código con el número entre «~» (STF-~1~) y dos borradores no se repiten', drafts.every((d, i) => new RegExp(`^${kinds[i]}-~\\d+~$`).test(d)) && new Set([...drafts, draftId('STF'), draftId('STF')]).size === drafts.length + 2);
  check('isDraftId los reconoce y no reconoce un código real', drafts.every(isDraftId) && !isDraftId('STF-013') && !isDraftId('CON-006') && !isDraftId('ASG-~x~'));
  check('No llevan año y un tipo desconocido no existe', throws(() => draftId('STF', 2026), /no lleva año/) && throws(() => draftId('XYZ' as CodeKind), /no lo asigna/));
}

// ------------------------------------------------------------------------------------------------------------------ La migración
const migration = read('supabase/migrations/20261113150000_codigos_de_personal_asignados_por_la_base.sql');
const down = read('supabase/deshacer/20261113150000_codigos_de_personal_asignados_por_la_base.down.sql');
const body = (start: string, end: string) => migration.slice(migration.indexOf(start), migration.indexOf(end));
const branches = [...body('create function app.siguiente_numero', 'comment on function app.siguiente_numero').matchAll(/p_prefijo = '([A-Z]+)'/g)].map(m => m[1]);
check('El asignador de números tiene una rama por cada tipo que la pantalla pide (y una más: el código de seis dígitos de la ficha, COD)',
  [...kinds, 'COD'].every(k => branches.includes(k)) && branches.length === kinds.length + 1, branches.join());
check('Cada rama mira TODA la tabla de su tipo (personal, asignaciones, contratos, ajustes de planilla), sin filtro por sede',
  /'\^STF-\(\[0-9\]\+\)\$'\)::integer\) into v_max from public\.personal t;/.test(migration) && /max\(t\.codigo::integer\) into v_max from public\.personal t;/.test(migration)
  && /ASG-.*from public\.asignaciones t;/.test(migration) && /CON-.*from public\.contratos t;/.test(migration) && /AJU-.*from public\.planilla_ajustes t;/.test(migration)
  && !/ve_persona|ve_sede|tiene_funcion/.test(body('create function app.siguiente_numero', 'comment on function app.siguiente_numero')));
check('El asignador corre con los permisos del dueño (si no, la política por sede le taparía las filas de otras sedes)', /create function app\.siguiente_numero\(p_prefijo text\) returns integer\nlanguage plpgsql security definer set search_path = ''/.test(migration));
check('Nunca se asigna sin candado: uno por tipo, que dura hasta el final de la operación, antes de mirar el más alto',
  /pg_advisory_xact_lock\(hashtextextended\('ensil:codigo:' \|\| p_prefijo \|\| '\|', 0\)\)/.test(migration) && migration.indexOf('pg_advisory_xact_lock') < migration.indexOf("if p_prefijo = 'STF'"));
check('Al pasar de 999 el número crece sin recortarse (lpad solo si hace falta)', /case when length\(p_n::text\) >= p_pad then p_n::text else lpad\(p_n::text, p_pad, '0'\) end/.test(migration));
check('Todos se rellenan a 3 dígitos (como `STAFF_CODE_KINDS`) y el código de la ficha a 6',
  kinds.every(k => STAFF_CODE_KINDS[k].pad === 3) && (migration.match(/numero_con_relleno\(app\.siguiente_numero\('(STF|ASG|CON|AJU)'\), 3\)/g) ?? []).length === 5 && /numero_con_relleno\(app\.siguiente_numero\('COD'\), 6\)/.test(migration));
check('El borrador se reconoce con el mismo formato que arma la pantalla (el número entre «~») y solo entonces se asigna (un código fijo se respeta)',
  kinds.every(k => migration.includes(`'^${k}-~[0-9]+~$'`)) && !/raise exception 'Esta pantalla está desactualizada/.test(migration));
check('La ficha y la asignación se asignan con un disparador ANTES de insertar y ANTES de la validación (el orden de los disparadores es el alfabético)',
  /create trigger personal_asignar_codigo_trg before insert on public\.personal/.test(migration) && /create trigger asignaciones_asignar_codigo_trg before insert on public\.asignaciones/.test(migration)
  && 'personal_asignar_codigo_trg' < 'personal_validar_trg' && 'asignaciones_asignar_codigo_trg' < 'asignaciones_validar_trg');
check('El disparador de la ficha asigna también el código de seis dígitos (solo si el id es un borrador)',
  /new\.id := 'STF-' \|\| app\.numero_con_relleno\(app\.siguiente_numero\('STF'\), 3\);\n\s+--[^\n]*\n\s+new\.codigo := app\.numero_con_relleno\(app\.siguiente_numero\('COD'\), 6\);/.test(migration));
for (const [fn, args, call] of [
  ['crear_contrato', 'p_id text, p jsonb', 'app.crear_contrato_base(v_id, p)'],
  ['renovar_contrato', 'p_anterior text, p_id text, p jsonb', 'app.renovar_contrato_base(p_anterior, v_id, p)'],
  ['agregar_ajuste_planilla', 'p_id text, p_planilla text, p jsonb, p_detalle text', 'app.agregar_ajuste_planilla_base(v_id, p_planilla, p, p_detalle)'],
] as const) {
  check(`${fn}: la función de siempre pasa a ser la base y la pública es una envoltura que asigna el código, llama a la base y lo devuelve`,
    migration.includes(`rename to ${fn}_base;`) && migration.includes(`create function public.${fn}(${args}) returns text`) && migration.includes(`perform ${call};\n  return v_id;`));
}
check('Las funciones base y los ayudantes no se llaman de fuera; las públicas sí (solo cuentas con sesión)',
  /revoke execute on function\n\s+app\.crear_contrato_base\(text, jsonb\), app\.renovar_contrato_base\(text, text, jsonb\), app\.agregar_ajuste_planilla_base\(text, text, jsonb, text\),\n\s+app\.siguiente_numero\(text\), app\.numero_con_relleno\(integer, integer\), app\.personal_asignar_codigo\(\), app\.asignaciones_asignar_codigo\(\)\n\s+from public, anon, authenticated;/.test(migration)
  && /revoke execute on function public\.crear_contrato\(text, jsonb\), public\.renovar_contrato\(text, text, jsonb\), public\.agregar_ajuste_planilla\(text, text, jsonb, text\) from public, anon;/.test(migration)
  && /grant execute on function public\.crear_contrato\(text, jsonb\), public\.renovar_contrato\(text, text, jsonb\), public\.agregar_ajuste_planilla\(text, text, jsonb, text\) to authenticated;/.test(migration));
check('No se toca ningún otro permiso del esquema (no se reabre la base del dinero que cerró la 0019)', !/on all functions in schema app/.test(migration.replace(/--[^\n]*/g, '')));
check('La migración se puede deshacer: quita disparadores y asignador y devuelve las tres funciones de la 0007',
  ['personal_asignar_codigo_trg', 'asignaciones_asignar_codigo_trg'].every(t => down.includes(`drop trigger if exists ${t}`)) && down.includes('drop function if exists app.siguiente_numero(text);')
  && ['crear_contrato', 'renovar_contrato', 'agregar_ajuste_planilla'].every(f => down.includes(`rename to ${f};`) && down.includes(`drop function if exists public.${f}(`)));

// ------------------------------------------------------------------------------------------------------------------ La pantalla ya no inventa estos códigos
const staffService = read('src/services/staffDirectory.ts');
const contractsService = read('src/services/contractsPayroll.ts');
const contractsRepo = read('src/services/contractsPayrollRepository.ts');
check('Personal y Asignaciones: la pantalla manda un borrador de id (y el código vacío en la ficha) y no reintenta con «el siguiente» (la base asigna)',
  /id: draftId\('STF'\), code: ''/.test(staffService) && /buildAssignment\(form, draftId\('ASG'\), assignments\)/.test(staffService)
  && !/nextSequentialId|nextStaffCode|MAX_ID_ATTEMPTS|idConflict|ID_PREFIX/.test(staffService));
check('Contratos y planilla: crear, renovar y ajustar mandan un borrador de código y devuelven el que asignó la base (sin reintentos)',
  (contractsService.match(/draftId\('CON'\)/g) ?? []).length === 2 && /draftId\('AJU'\)/.test(contractsService) && !/nextSequentialId|MAX_ID_ATTEMPTS|idConflict|ID_PREFIX/.test(contractsService)
  && (contractsService.match(/res\.data\.id/g) ?? []).length === 3);
check('El repositorio de Supabase lee de la respuesta el código asignado por la función de la base (y avisa si no llega)',
  ['crear_contrato', 'renovar_contrato', 'agregar_ajuste_planilla'].every(f => new RegExp(`rpcCreate\\('${f}'`).test(contractsRepo)) && /typeof data === 'string' && data/.test(contractsRepo) && /La base no devolvió el código asignado/.test(contractsRepo));
check('La ficha nueva no propone un código de seis dígitos con el personal que ve la cuenta (el armador lo deja vacío y la pantalla no le pasa la lista)',
  !/nextStaffCode/.test(read('src/utils/staff.ts')) && /code: base\?\.code \?\? ''/.test(read('src/utils/staff.ts')) && !/buildStaff\([^)]*,\s*staff\)/.test(read('src/pages/people/StaffFormModal.tsx')));

if (failed > 0) {
  console.log(`\n${failed} comprobaciones fallaron.`);
  process.exit(1);
}
console.log('\nTodo en verde.');
