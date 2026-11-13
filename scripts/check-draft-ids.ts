/**
 * Verificación de los códigos del dinero que asigna la BASE (migración 0019, `src/utils/draftIds.ts`):
 *  - el código de borrador: formato, año, que dos no se repitan y que `~1~` no se confunda con `~10~`;
 *  - la asignación: cada tipo (y año) entrega los siguientes al más alto de TODA la base, en el orden de los borradores; cambia el borrador en las
 *    filas, en las referencias entre ellas y en los textos; las series de notas de crédito rellenan a 6 dígitos y fijan el correlativo; no recorta
 *    al pasar de 999;
 *  - lo que la base exige: el código de toda fila NUEVA es un borrador del tipo que le toca (una pantalla desactualizada no se salta al asignador);
 *  - el caso que originó esto: una cuenta que solo ve su sede proponía un código que ya existía en otra sede (se muestra con los datos de ejemplo);
 *  - el cableado: la migración asigna todos los tipos que la pantalla pide, está protegida contra repetidos y se puede deshacer; el contexto, los
 *    armadores y el repositorio ya no inventan códigos del dinero.
 * La base se prueba aparte contra una copia (con los mismos datos y la misma lista de borradores). Ejecutar: npx tsx scripts/check-draft-ids.ts
 */
import { readFileSync } from 'node:fs';
import { buildPeopleSeed } from '../src/data/seedPeople';
import {
  assignDraftIds, CODE_KINDS, draftId, draftPayloadProblem, draftTokens, highestOfRows, isDraftId, replaceDraftIds, type CodeKind,
} from '../src/utils/draftIds';
import { nextSequentialId } from '../src/utils/ids';
import { moneyRowsFromState, type MoneyRows } from '../src/utils/moneyDb';
import { SEED_REFERENCE_DAY } from '../src/utils/peopleSeedSql';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : ` -> ${detail}`}`);
  if (!ok) failed++;
};
const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const throws = (fn: () => unknown, re: RegExp) => { try { fn(); return false; } catch (e) { return re.test(String((e as Error).message)); } };

// ------------------------------------------------------------------------------------------------------------------ El código de borrador
const a = draftId('PAG');
const b = draftId('PAG');
const m26 = draftId('MAT', 2026);
check('Un borrador tiene el aspecto del código con el número entre «~» y dos borradores no se repiten', /^PAG-~\d+~$/.test(a) && a !== b && /^MAT-2026-~\d+~$/.test(m26));
check('Un código que lleva año lo exige y uno que no lo lleva lo rechaza; un tipo desconocido no existe',
  throws(() => draftId('MAT' as CodeKind), /lleva año/) && throws(() => draftId('PAG', 2026), /no lleva año/) && throws(() => draftId('XYZ' as CodeKind), /no lo asigna/));
check('isDraftId reconoce el borrador y no un código real', isDraftId(a) && isDraftId(m26) && !isDraftId('PAG-011') && !isDraftId('MAT-2026-005') && !isDraftId(undefined) && !isDraftId('PAG-~1~ x'));
{
  const t = draftTokens('["PAG-~10~","PAG-~1~","PAG-~1~","MAT-2026-~3~","BC01-~2~","CJ-~7~"]');
  check('Los borradores distintos de un texto salen ordenados por tipo, año y número (~1~ no es parte de ~10~)',
    t.map(x => x.token).join() === 'BC01-~2~,CJ-~7~,MAT-2026-~3~,PAG-~1~,PAG-~10~' && t[2].year === 2026 && t[3].n === 1);
}

// ------------------------------------------------------------------------------------------------------------------ La asignación
const highestFixed = (m: Record<string, number>) => (prefix: string, year?: number) => m[`${prefix}${year !== undefined ? `|${year}` : ''}`] ?? 0;
{
  const [p1, p2, p3] = [draftId('PAG'), draftId('PAG'), draftId('PAG')];
  const [mA, mB] = [draftId('MAT', 2026), draftId('MAT', 2026)];
  const mNext = draftId('MAT', 2027);
  const [pl, cj1, cj2, nc] = [draftId('PLN'), draftId('CJ'), draftId('CJ'), draftId('NC')];
  const payload = {
    matriculas: [{ id: mA, _nueva: true, plan: pl }, { id: mB, _nueva: true }, { id: mNext, _nueva: true }],
    planes: [{ id: pl, _nueva: true, matricula_id: mA, cuotas: [{ id: 'C1', cobros: [{ id: p1, paymentId: p1 }] }] }],
    pagos: [{ id: p1, _nueva: true, matricula_ids: [mA, mB] }, { id: p2, _nueva: true }, { id: p3, _nueva: true }],
    movimientos: [{ id: cj1, _nueva: true, pago_id: p1, referencia: `${mA} / Alumno ${mB}` }, { id: cj2, _nueva: true, pago_id: p2 }],
    notas: [] as Record<string, unknown>[], grupos: [], solicitudes: [], correcciones: [],
  };
  const high = highestFixed({ 'MAT|2026': 5, 'MAT|2027': 0, PLN: 5, PAG: 10, CJ: 11 });
  const r = assignDraftIds(payload, high);
  const J = JSON.stringify(r.payload);
  check('Cada tipo entrega los siguientes al más alto, en el orden de los borradores (cada año y cada tipo, aparte)',
    r.codes[mA] === 'MAT-2026-006' && r.codes[mB] === 'MAT-2026-007' && r.codes[mNext] === 'MAT-2027-001' && r.codes[p1] === 'PAG-011' && r.codes[p2] === 'PAG-012' && r.codes[p3] === 'PAG-013'
    && r.codes[pl] === 'PLN-006' && r.codes[cj1] === 'CJ-012' && r.codes[cj2] === 'CJ-013', JSON.stringify(r.codes));
  check('El borrador se cambia en la fila, en las referencias entre filas y dentro de los textos; no queda ninguno',
    r.payload.planes[0].matricula_id === 'MAT-2026-006' && r.payload.pagos[0].matricula_ids.join() === 'MAT-2026-006,MAT-2026-007' && r.payload.movimientos[0].pago_id === 'PAG-011'
    && r.payload.movimientos[0].referencia === 'MAT-2026-006 / Alumno MAT-2026-007' && (r.payload.planes[0].cuotas[0].cobros[0] as { paymentId: string }).paymentId === 'PAG-011'
    && r.payload.matriculas[0].plan === 'PLN-006' && !J.includes('~'), J);
  check('Cambiar los borradores no modifica el envío original', JSON.stringify(payload).includes('~') && payload.pagos[0].id === p1);
  check('Un envío sin borradores sale igual', JSON.stringify(assignDraftIds({ pagos: [{ id: 'PAG-001' }] }, () => 99).payload) === '{"pagos":[{"id":"PAG-001"}]}' && Object.keys(assignDraftIds({ x: 1 }, () => 1).codes).length === 0);
}
{
  const [c1, c2] = [draftId('CTR', 2026), draftId('FIC', 2026)];
  const dep = draftId('DEP');
  const r = assignDraftIds({ matriculas: [{ id: 'MAT-2026-001', documentos: { contract: { number: c1 }, ficha: { number: c2 } } }], movimientos: [{ id: 'CJ-012', lote_deposito: dep, deposito: { code: dep } }] },
    highestFixed({ 'CTR|2026': 4, 'FIC|2026': 0, DEP: 2 }));
  const mat = r.payload.matriculas[0] as { documentos: { contract: { number: string }; ficha: { number: string } } };
  check('Los números de contrato y ficha (por año) y el lote de depósito también los asigna la base, dentro de sus datos',
    mat.documentos.contract.number === 'CTR-2026-005' && mat.documentos.ficha.number === 'FIC-2026-001' && (r.payload.movimientos[0] as { lote_deposito: string }).lote_deposito === 'DEP-003'
    && (r.payload.movimientos[0] as { deposito: { code: string } }).deposito.code === 'DEP-003');
}
{
  const [n1, n2, f1] = [draftId('BC01'), draftId('BC01'), draftId('FC01')];
  const [nc1, nc2] = [draftId('NC'), draftId('NC')];
  const r = assignDraftIds({
    notas: [
      { id: nc1, _nueva: true, origen: 'sistema', serie: 'BC01', correlativo: 0, etiqueta: n1 },
      { id: nc2, _nueva: true, origen: 'sistema', serie: 'FC01', correlativo: 0, etiqueta: f1 },
      { id: 'NC-099', _nueva: true, origen: 'externa', serie: 'BC01', correlativo: 42, etiqueta: 'BC01-000042' },
    ], pagos: [{ id: 'PAG-001', reversa: { creditNote: n2 } }],
  }, highestFixed({ BC01: 12, FC01: 0, NC: 2 }));
  const notas = r.payload.notas as { id: string; correlativo: number; etiqueta: string }[];
  check('Una nota emitida por el sistema toma el siguiente correlativo de SU serie (6 dígitos) y lo deja como número; la externa conserva el suyo',
    notas[0].etiqueta === 'BC01-000013' && notas[0].correlativo === 13 && notas[1].etiqueta === 'FC01-000001' && notas[1].correlativo === 1
    && notas[2].etiqueta === 'BC01-000042' && notas[2].correlativo === 42 && notas[0].id === 'NC-003' && notas[1].id === 'NC-004', JSON.stringify(notas));
  check('La constancia de reversa del pago también recibe la etiqueta real de la nota', (r.payload.pagos[0] as { reversa: { creditNote: string } }).reversa.creditNote === 'BC01-000014');
}
{
  const [x, y] = [draftId('PAG'), draftId('PAG')];
  const r = assignDraftIds({ pagos: [{ id: x }, { id: y }] }, highestFixed({ PAG: 998 }));
  check('Al pasar de 999 el número crece sin recortarse (PAG-999, PAG-1000)', (r.payload.pagos as { id: string }[]).map(p => p.id).join() === 'PAG-999,PAG-1000');
  check('Un tipo que la base no asigna se rechaza, también con o sin año de más', throws(() => assignDraftIds({ x: 'XYZ-~1~' }, () => 0), /no lo asigna/) && throws(() => assignDraftIds({ x: 'MAT-~1~' }, () => 0), /lleva año/) && throws(() => assignDraftIds({ x: 'PAG-2026-~1~' }, () => 0), /no lleva año/));
}
check('replaceDraftIds cambia a cualquier profundidad y deja lo que no está en la lista', (() => {
  const v = { a: ['PAG-~1~', { b: 'ref PAG-~1~ y PAG-~2~' }], n: 3, f: null };
  const r = replaceDraftIds(v, { 'PAG-~1~': 'PAG-011' });
  return JSON.stringify(r) === '{"a":["PAG-011",{"b":"ref PAG-011 y PAG-~2~"}],"n":3,"f":null}' && replaceDraftIds(v, {}) === v;
})());

// ------------------------------------------------------------------------------------------------------------------ Lo que exige la base
{
  const ok = { matriculas: [{ id: draftId('MAT', 2026), _nueva: true }], pagos: [{ id: draftId('PAG'), _nueva: true }, { id: 'PAG-003', estado: 'Anulado' }],
    solicitudes: [{ id: draftId('CAI'), _nueva: true, tipo: 'Caída' }], notas: [{ id: draftId('NC'), _nueva: true, origen: 'sistema', serie: 'BC01', etiqueta: draftId('BC01') }] };
  check('Todo borrador del tipo que le toca se acepta; una fila que ya existe puede llevar su código real', draftPayloadProblem(ok) === null);
  const stale = (over: Record<string, unknown>) => draftPayloadProblem({ ...ok, ...over });
  check('Una pantalla desactualizada que manda un código escrito a mano se rechaza (en cualquier tabla)',
    /desactualizada/.test(stale({ pagos: [{ id: 'PAG-011', _nueva: true }] }) ?? '') && /desactualizada/.test(stale({ movimientos: [{ id: 'CJ-012', _nueva: true }] }) ?? '')
    && /desactualizada/.test(stale({ matriculas: [{ id: 'MAT-2026-006', _nueva: true }] }) ?? '') && /desactualizada/.test(stale({ planes: [{ id: 'PLN-006', _nueva: true }] }) ?? ''));
  check('El borrador debe ser del tipo de la tabla (un código de pago no sirve de matrícula) y con año si lleva año',
    /desactualizada/.test(stale({ matriculas: [{ id: draftId('PAG'), _nueva: true }] }) ?? '') && /desactualizada/.test(stale({ matriculas: [{ id: 'MAT-~1~', _nueva: true }] }) ?? ''));
  check('Una solicitud de caída lleva CAI y las demás SOL', stale({ solicitudes: [{ id: draftId('SOL'), _nueva: true, tipo: 'Caída' }] }) !== null
    && stale({ solicitudes: [{ id: draftId('SOL'), _nueva: true, tipo: 'Traslado de sede' }] }) === null && stale({ solicitudes: [{ id: draftId('CAI'), _nueva: true, tipo: 'Traslado de sede' }] }) !== null);
  check('Una nota del sistema lleva el borrador de su serie (BC01 o FC01) y no otra serie; una externa trae su número',
    stale({ notas: [{ id: draftId('NC'), _nueva: true, origen: 'sistema', serie: 'BC01', etiqueta: 'BC01-000013' }] }) !== null
    && stale({ notas: [{ id: draftId('NC'), _nueva: true, origen: 'sistema', serie: 'XX99', etiqueta: 'XX99-~1~' }] }) !== null
    && stale({ notas: [{ id: draftId('NC'), _nueva: true, origen: 'externa', serie: 'BC01', etiqueta: 'BC01-000042' }] }) === null);
}

// ------------------------------------------------------------------------------------------------------------------ El caso que originó esto
const seed = buildPeopleSeed(SEED_REFERENCE_DAY);
const all: MoneyRows = moneyRowsFromState({
  enrollments: seed.enrollments, plans: seed.plans, payments: seed.payments, cashMovements: seed.cashMovements, creditNotes: [], promotionGroups: [],
  dropRequests: [], changeRequests: [], enrollmentChanges: [],
});
{
  const chiclayo = seed.enrollments.filter(e => e.branchId === 'FIL-003');
  const otherSede = seed.enrollments.filter(e => e.branchId !== 'FIL-003');
  const visible = chiclayo.map(e => e.id);
  const viejo = nextSequentialId('MAT', visible, { year: 2026 });
  check('El problema de antes: la cuenta de Chiclayo veía solo sus matrículas y proponía un código que YA existía en otra sede',
    chiclayo.length > 0 && otherSede.some(e => e.id === viejo), `${viejo} / visibles ${visible.join()}`);
  const real = assignDraftIds({ matriculas: [{ id: draftId('MAT', 2026), _nueva: true }] }, highestOfRows(all)).payload.matriculas[0].id;
  check('Ahora la base mira todas las sedes: el código asignado es el siguiente al más alto de todas y no existe', !seed.enrollments.some(e => e.id === real) && real === `MAT-2026-${String(seed.enrollments.length + 1).padStart(3, '0')}`, real);
}
{
  const hi = highestOfRows({ ...all, matriculas: all.matriculas.map((r, i) => (i === 0 ? { ...r, documentos: { contract: { number: 'CTR-2026-007' } as never, ficha: { number: 'FIC-2026-003' } as never } } : r)),
    movimientos: all.movimientos.map((r, i) => (i === 0 ? { ...r, deposito: { code: 'DEP-004', bank: 'x', movementIds: [] } } : r)),
    notas: [{ id: 'NC-001', serie: 'BC01', correlativo: 9 } as never, { id: 'NC-002', serie: 'FC01', correlativo: 3 } as never, { id: 'NC-003', serie: 'BC01', correlativo: 12 } as never] });
  check('El más alto de cada tipo sale de las filas de TODAS las sedes: matrículas, planes, pagos, caja, contratos, fichas, lotes y series de notas',
    hi('MAT', 2026) === 5 && hi('MAT', 2027) === 0 && hi('PLN') === 5 && hi('PAG') === 10 && hi('CJ') === 11 && hi('CTR', 2026) === 7 && hi('FIC', 2026) === 3 && hi('DEP') === 4
    && hi('BC01') === 12 && hi('FC01') === 3 && hi('NC') === 3 && hi('PGR') === 0 && hi('CAI') === 0 && hi('SOL') === 0 && hi('COR') === 0);
}

// ------------------------------------------------------------------------------------------------------------------ Cableado
const migration = read('supabase/migrations/20261113100000_codigos_asignados_por_la_base.sql');
const down = read('supabase/deshacer/20261113100000_codigos_asignados_por_la_base.down.sql');
const kinds = Object.keys(CODE_KINDS) as CodeKind[];
const listOf = (re: RegExp) => new Set((re.exec(migration)?.[1] ?? '').split(',').map(s => s.trim().replace(/'/g, '')).filter(Boolean));
const sameSet = (x: Set<string>, y: string[]) => x.size === y.length && y.every(v => x.has(v));
const whitelist = listOf(/v_tok\.pref not in \(([^)]*)\)/);
check('La migración asigna exactamente los tipos de código que la pantalla puede pedir (misma lista que `CODE_KINDS`)', sameSet(whitelist, kinds), [...whitelist].join());
check('Los tipos con año son los mismos en la migración y en `CODE_KINDS`', sameSet(listOf(/v_tok\.pref in \(([^)]*)\)\) is distinct from \(v_tok\.anio is not null\)/), kinds.filter(k => CODE_KINDS[k].year)));
check('Las series de notas de crédito se rellenan a 6 dígitos y el resto a 3 (igual que `CODE_KINDS`)', sameSet(listOf(/v_pad := case when v_tok\.pref in \(([^)]*)\) then 6 else 3 end/), kinds.filter(k => CODE_KINDS[k].pad === 6)));
check('El más alto de cada tipo se busca en TODA la base (`app.codigo_maximo` tiene una rama por cada tipo)',
  kinds.every(k => new RegExp(`p_prefijo (=|in \\([^)]*) ?'${k}'`).test(migration.slice(migration.indexOf('create function app.codigo_maximo'), migration.indexOf('comment on function app.codigo_maximo')))));
check('Nunca se asigna sin candado: uno por tipo y año, que dura hasta el final de la operación, siempre en el mismo orden (no se traban)',
  /pg_advisory_xact_lock\(hashtextextended\('ensil:codigo:' \|\| v_grupo, 0\)\)/.test(migration) && /order by 1, 2 nulls first, 4/.test(migration) && migration.indexOf('pg_advisory_xact_lock') < migration.indexOf('app.codigo_maximo(v_tok.pref'));
check('Al pasar de 999 la base tampoco recorta el número (lpad solo si hace falta)', /case when length\(v_numero\) >= v_pad then v_numero else lpad\(v_numero, v_pad, '0'\) end/.test(migration));
check('La función pública es una envoltura: pide la función del registro, exige borradores, asigna y llama a la función de siempre (ahora `app.aplicar_cambios_matricula_base`)',
  /alter function public\.aplicar_cambios_matricula\(text, jsonb\) set schema app;/.test(migration) && /rename to aplicar_cambios_matricula_base;/.test(migration)
  && /create function public\.aplicar_cambios_matricula\(p_accion text, p jsonb\) returns jsonb/.test(migration) && /perform app\.exigir_alguna\(v_funcs/.test(migration)
  && /return app\.aplicar_cambios_matricula_base\(p_accion, p\) \|\| jsonb_build_object\('codigos', v_codigos\)/.test(migration));
check('La base de siempre no se llama de fuera (solo la envoltura, que corre con los permisos del dueño) y la pública sí',
  /revoke execute on function app\.aplicar_cambios_matricula_base\(text, jsonb\) from authenticated;/.test(migration) && /grant execute on function public\.aplicar_cambios_matricula\(text, jsonb\) to authenticated;/.test(migration)
  && /revoke execute on function public\.aplicar_cambios_matricula\(text, jsonb\) from public, anon;/.test(migration));
check('Ni contrato, ficha, lote de depósito ni nota de crédito pueden repetirse en ninguna sede (índices únicos)',
  /create unique index matriculas_contrato_numero_uq on public\.matriculas \(\(documentos->'contract'->>'number'\)\)/.test(migration) && /create unique index matriculas_ficha_numero_uq on public\.matriculas \(\(documentos->'ficha'->>'number'\)\)/.test(migration)
  && /create unique index movimientos_deposito_codigo_uq on public\.movimientos_caja \(\(deposito->>'code'\)\)/.test(migration) && /create unique index notas_serie_correlativo_uq on public\.notas_credito \(serie, correlativo\)/.test(migration));
check('Una nota externa que repite un número ya registrado (en cualquier sede) se rechaza con un motivo claro', /La nota de crédito % ya está registrada\./.test(migration));
check('La migración se puede deshacer (devuelve la función de antes y quita el asignador y los índices)',
  /alter function app\.aplicar_cambios_matricula_base\(text, jsonb\) rename to aplicar_cambios_matricula;/.test(down) && /set schema public;/.test(down) && /drop function if exists app\.codigo_maximo/.test(down)
  && ['matriculas_contrato_numero_uq', 'matriculas_ficha_numero_uq', 'movimientos_deposito_codigo_uq', 'notas_serie_correlativo_uq'].every(i => down.includes(i)));
check('El repositorio de Supabase lee de la respuesta la lista de códigos asignados', /\.codigos \?\? \{\}/.test(read('src/services/moneyRepository.ts')) || /codigos\?: Record<string, string>/.test(read('src/services/moneyRepository.ts')));
check('Después de guardar se vuelve a leer lo tocado CON los códigos reales (no con los borradores)', /replaceDraftIds\(diff\.touched, codes\)/.test(read('src/services/money.ts')) && /repo\.fetch\(touched\)/.test(read('src/services/money.ts')));

// ¿Queda algún lugar que invente un código del dinero con lo que ve la pantalla?
const ctx = read('src/context/DataContext.tsx');
const prefixes = 'MAT|PLN|PAG|PGR|CJ|NC|CAI|SOL|COR|DEP|CTR|FIC';
const sources = ['src/context/DataContext.tsx', 'src/utils/enrollment.ts', 'src/utils/cash.ts', 'src/utils/creditNotes.ts', 'src/utils/enrollmentDocuments.ts', 'src/services/money.ts', 'src/hooks/useMoney.ts'];
check('Ningún armador ni acción del dinero inventa un código con lo que ve la pantalla (ni nextSequentialId ni allocId de esos tipos)',
  sources.every(f => !new RegExp(`(nextSequentialId|allocId)\\(\\s*'(${prefixes})'`).test(read(f))), sources.filter(f => new RegExp(`(nextSequentialId|allocId)\\(\\s*'(${prefixes})'`).test(read(f))).join());
check('Cada acción arma sus registros nuevos con borrador (movimiento de caja, pago, corrección, nota, solicitud) y no usa el correlativo de la pantalla',
  (ctx.match(/draftId\('CJ'\)/g) ?? []).length >= 4 && /draftId\('PAG'\)/.test(ctx) && (ctx.match(/draftId\('COR'\)/g) ?? []).length === 2 && /draftId\('NC'\)/.test(ctx) && /draftId\('CAI'\)/.test(ctx) && /draftId\('SOL'\)/.test(ctx)
  && /enrollmentId = draftId\('MAT', year\)/.test(read('src/utils/enrollment.ts')) && /planId = draftId\('PLN'\)/.test(read('src/utils/enrollment.ts')) && /paymentId = draftId\('PAG'\)/.test(read('src/utils/enrollment.ts')) && /groupId = draftId\('PGR'\)/.test(read('src/utils/enrollment.ts'))
  && /draftId\('DEP'\)/.test(read('src/utils/cash.ts')) && /draftId\(series as 'BC01' \| 'FC01'\)/.test(read('src/utils/creditNotes.ts')) && /draftId\(DOC_PREFIX\[kind\], year\)/.test(read('src/utils/enrollmentDocuments.ts')));
check('Lo que sigue en memoria (la primera asesoría de una matrícula) y lo que se devuelve a la pantalla (matrículas creadas, código del lote) usan los códigos reales',
  /setSchedules\(prev => \[\.\.\.prev, \.\.\.replaceDraftIds\(b\.schedules, codes\)\]\)/.test(ctx) && /enrollmentIds: b\.enrollments\.map\(e => codes\[e\.id\] \?\? e\.id\)/.test(ctx)
  && /code: saved\.codes\?\.\[built\.code\] \?\? built\.code/.test(ctx));
check('El hook devuelve los códigos asignados y la pantalla de reversa ya no promete un número de nota (lo asigna la base)',
  /codes: res\.value\.codes/.test(read('src/hooks/useMoney.ts')) && !/nextNoteNumber|nextLabel/.test(read('src/components/payments/ReversePaymentModal.tsx')) && /el siguiente número de la serie/.test(read('src/components/payments/ReversePaymentModal.tsx')));

if (failed > 0) {
  console.log(`\n${failed} comprobaciones fallaron.`);
  process.exit(1);
}
console.log('\nTodo en verde.');
