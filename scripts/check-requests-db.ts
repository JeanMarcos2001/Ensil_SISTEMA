/**
 * Verificación de las solicitudes sobre las matrículas y del registro de correcciones en la base de datos (Lote 9B):
 *  - traducción filas ↔ modelo (caídas, reactivaciones, cambios de programa, traslados y correcciones): ida y vuelta con los datos de ejemplo; lo derivable
 *    no se guarda (el alumno de una solicitud sale de su matrícula) y quién y cuándo pidieron y resolvieron lo pone la base (no viaja al guardar);
 *  - el comparador `diffMoney` con las solicitudes y las correcciones: una solicitud nueva viaja completa y marcada; resolverla manda solo su estado, su
 *    nota y sus efectos; una corrección viaja con el cambio de su matrícula; no se pueden quitar registros;
 *  - las operaciones (con un repositorio en memoria): pedir y aprobar una solicitud llaman UNA vez a la base, con la acción que corresponde;
 *  - la carga de partida (`supabase/seed/solicitudes_de_ejemplo.sql`) está al día;
 *  - el cableado: las acciones de la base existen y piden las funciones del registro, quién lee solicitudes y correcciones coincide con el registro, las
 *    tablas no se escriben directo, y el contexto ya no guarda solicitudes ni correcciones en memoria.
 * Lo que hace la base (nace pendiente, se resuelve una vez, quien pidió no resuelve, el efecto de lo aprobado cuadra, por sede) se prueba aparte contra una
 * copia de la base, con los payloads que arma este mismo código.
 * Ejecutar: npx tsx scripts/check-requests-db.ts
 */
import { readFileSync } from 'node:fs';
import { buildPeopleSeed } from '../src/data/seedPeople';
import { seedBranches, seedLeadSources, seedLevels, seedPaymentTypes, seedPrograms, seedTariffs } from '../src/data/seedCatalog';
import { applyMoney, type MoneyRepository } from '../src/services/money';
import type { RepoResult } from '../src/services/orgDirectory';
import { ALL_CAPABILITIES, capabilityById } from '../src/utils/capabilities';
import { capabilitiesOfAction } from '../src/utils/guards';
import {
  diffMoney, emptyMoneyRows, MONEY_ACTIONS, moneyRowsFromState, moneyStateFromRows, sortMoneyState, type EnrollmentLists, type MoneyRows, type MoneyState,
} from '../src/utils/moneyDb';
import { SEED_REFERENCE_DAY } from '../src/utils/peopleSeedSql';
import {
  changeRequestFromRow, changeRequestToRow, correctionFromRow, correctionToRow, dropRequestFromRow, dropRequestToRow, requestRowsFromState, requestsFromRows,
} from '../src/utils/requestsDb';
import { renderRequestsSeedSql } from '../src/utils/requestsSeedSql';
import type { ChangeRequest, DropRequest, EnrollmentChange } from '../src/context/DataContext';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : ` -> ${detail}`}`);
  if (!ok) failed++;
};
const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

const seed = buildPeopleSeed(SEED_REFERENCE_DAY);
const lists: EnrollmentLists = {
  students: seed.students, programs: seedPrograms(), levels: seedLevels(), branches: seedBranches(), staff: [], leadSources: seedLeadSources(),
  paymentTypes: seedPaymentTypes(), tariffs: seedTariffs(),
};
const world = (): MoneyState => structuredClone({
  enrollments: seed.enrollments, plans: seed.plans, payments: seed.payments, cashMovements: seed.cashMovements, creditNotes: [], promotionGroups: [],
  dropRequests: seed.dropRequests, changeRequests: [], enrollmentChanges: [],
});
const sameSet = (a: string[], b: string[]) => [...a].sort().join() === [...b].sort().join();
/** Para comparar objetos sin que cuente el orden de sus claves. */
const canon = (v: unknown): string => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1))) : x));

const drop: DropRequest = seed.dropRequests[0];
const change: ChangeRequest = {
  id: 'SOL-001', kind: 'Cambio de programa', enrollmentId: 'MAT-2026-001', studentId: 'ALU-001', requestedAt: '2026-11-05T15:00:00.000Z', requestedBy: 'Ana G.',
  reason: 'Nivel mal asignado', detail: 'Está en un nivel que no es.', payload: { programId: '5', levelId: '' }, status: 'Aprobada', resolvedAt: '2026-11-06T09:00:00.000Z', resolvedBy: 'Superadmin',
  resolutionNote: 'De acuerdo', effects: ['Kids → Profesional.', 'Precio: USD 600.00 → USD 900.00.'],
};
const fix: EnrollmentChange = { id: 'COR-001', enrollmentId: 'MAT-2026-001', at: '2026-11-06T09:00:00.000Z', by: 'Superadmin', field: 'program', label: 'Cambio de programa o nivel', from: 'Kids', to: 'Profesional', reason: 'Nivel mal asignado' };

// ------------------------------------------------------------------------------------------------------------------ Traducción
const dropRow = dropRequestToRow(drop, true);
check('Una caída vuelve igual de su fila (con quién y cuándo, como en la carga de partida)', canon(dropRequestFromRow(dropRow, drop.studentId)) === canon({ ...drop, requestedAt: new Date(drop.requestedAt).toISOString(), resolvedAt: new Date(drop.resolvedAt!).toISOString() }),
  JSON.stringify(dropRequestFromRow(dropRow, drop.studentId)));
check('La fila de una caída lleva su tipo, su fecha de efecto y su resumen de efectos; no lleva los datos propios de otros tipos', dropRow.tipo === 'Caída' && dropRow.fecha_efecto === drop.effectiveDate && dropRow.datos && Object.keys(dropRow.datos).length === 0 && !!dropRow.efectos);
const changeRow = changeRequestToRow(change, true);
check('Un cambio vuelve igual de su fila', canon(changeRequestFromRow(changeRow, change.studentId)) === canon({ ...change, requestedAt: new Date(change.requestedAt).toISOString(), resolvedAt: new Date(change.resolvedAt!).toISOString() }),
  JSON.stringify(changeRequestFromRow(changeRow, change.studentId)));
check('La fila de un cambio lleva su tipo y lo propio de él en `datos` (sin fecha de efecto); sus efectos son líneas de texto', changeRow.tipo === 'Cambio de programa' && changeRow.fecha_efecto === null && changeRow.datos.programId === '5' && Array.isArray(changeRow.efectos));
check('La corrección vuelve igual de su fila (de, a, motivo, quién y cuándo)', canon(correctionFromRow(correctionToRow(fix, true))) === canon(fix));
check('El alumno de una solicitud NO se guarda: sale de la matrícula', !('alumno_id' in dropRow) && !('student_id' in dropRow) && !Object.keys(changeRow).some(k => /alumno|student/.test(k)));
const pendiente: DropRequest = { ...drop, id: 'CAI-009', status: 'Pendiente', resolvedAt: undefined, resolvedBy: undefined, resolutionNote: undefined, effects: undefined };
const nuevaFila = dropRequestToRow(pendiente);
check('Al guardar NO viaja quién ni cuándo (los pone la base con la cuenta): ni `creado_*` ni `resuelta_*`', !('creado_por' in nuevaFila) && !('creado_en' in nuevaFila) && nuevaFila.resuelta_en === null && nuevaFila.resuelta_por === null && nuevaFila.estado === 'Pendiente');
check('Una solicitud pendiente viaja sin efectos ni nota (solo lo que ya sabe quien la pide)', nuevaFila.efectos === null && nuevaFila.nota_resolucion === null);
check('La corrección sin quién ni cuándo tampoco los manda al guardar', !('creado_por' in correctionToRow(fix)) && !('creado_en' in correctionToRow(fix)));

const w = world();
const rows = moneyRowsFromState(w, true);
const back = moneyStateFromRows(rows, lists);
check('Las solicitudes del estado vuelven iguales de las filas, repartidas en caídas y cambios', back.dropRequests.length === 1 && back.changeRequests.length === 0 && back.dropRequests[0].id === 'CAI-001' && back.dropRequests[0].studentId === w.dropRequests[0].studentId);
const mixed = requestsFromRows([dropRow, changeRow], id => (id === 'MAT-2026-001' ? 'ALU-001' : undefined));
check('Una sola tabla, dos listas: las caídas van a una y los cambios a la otra, cada uno con su alumno derivado', mixed.dropRequests.length === 1 && mixed.changeRequests.length === 1 && mixed.changeRequests[0].studentId === 'ALU-001' && mixed.dropRequests[0].studentId === undefined);
check('El estado, vuelto filas, deja las caídas y los cambios en la misma lista de solicitudes', requestRowsFromState([drop], [change]).map(r => r.id).join() === 'CAI-001,SOL-001');

const sorted = sortMoneyState({ ...w, changeRequests: [change, { ...change, id: 'SOL-003' }, { ...change, id: 'SOL-002' }], enrollmentChanges: [fix, { ...fix, id: 'COR-003' }, { ...fix, id: 'COR-002' }] });
check('Las solicitudes y las correcciones se muestran del código más nuevo al más antiguo', sorted.changeRequests.map(r => r.id).join() === 'SOL-003,SOL-002,SOL-001' && sorted.enrollmentChanges.map(c => c.id).join() === 'COR-003,COR-002,COR-001');

// ------------------------------------------------------------------------------------------------------------------ Comparador
check('Sin cambios no hay nada que guardar (tampoco en solicitudes ni correcciones)', diffMoney(w, { ...w }).empty && diffMoney(w, structuredClone(w)).empty);
{
  const d = diffMoney(w, { ...w, dropRequests: [pendiente, ...w.dropRequests] });
  check('Pedir una caída manda UNA fila nueva y completa, marcada como nueva, y nada más', !d.empty && d.payload.solicitudes.length === 1 && d.payload.solicitudes[0]._nueva === true && d.payload.solicitudes[0].id === 'CAI-009'
    && 'motivo' in d.payload.solicitudes[0] && 'fecha_efecto' in d.payload.solicitudes[0] && 'datos' in d.payload.solicitudes[0] && d.touched.solicitudes.join() === 'CAI-009'
    && d.payload.matriculas.length === 0 && d.payload.planes.length === 0 && d.payload.correcciones.length === 0);
}
{
  const withPending = { ...w, dropRequests: [pendiente, ...w.dropRequests] };
  const after = { ...withPending, dropRequests: withPending.dropRequests.map(r => (r.id === 'CAI-009' ? { ...r, status: 'Rechazada' as const, resolvedAt: '2026-11-11T10:00:00.000Z', resolvedBy: 'Otra', resolutionNote: 'Aún puede asistir' } : r)) };
  const d = diffMoney(withPending, after);
  check('Resolver una solicitud manda su código y SOLO su estado y su nota (quién y cuándo los pone la base)', d.payload.solicitudes.length === 1 && Object.keys(d.payload.solicitudes[0]).sort().join() === 'estado,id,nota_resolucion' && !('_nueva' in d.payload.solicitudes[0]));
  const approved = { ...withPending, dropRequests: withPending.dropRequests.map(r => (r.id === 'CAI-009' ? { ...r, status: 'Aprobada' as const, resolvedAt: '2026-11-11T10:00:00.000Z', resolvedBy: 'Otra', effects: drop.effects } : r)) };
  check('Aprobar una caída manda además sus efectos (el historial que queda con la solicitud)', Object.keys(diffMoney(withPending, approved).payload.solicitudes[0]).sort().join() === 'efectos,estado,id');
}
{
  const d = diffMoney(w, { ...w, changeRequests: [{ ...change, id: 'SOL-002', status: 'Pendiente' as const, resolvedAt: undefined, resolvedBy: undefined, resolutionNote: undefined, effects: undefined }] });
  check('Pedir un cambio manda su tipo y sus datos propios; una caída y un cambio comparten la tabla pero no se confunden', d.payload.solicitudes.length === 1 && d.payload.solicitudes[0].tipo === 'Cambio de programa' && (d.payload.solicitudes[0].datos as Record<string, string>).programId === '5' && d.payload.solicitudes[0].fecha_efecto === null);
}
{
  const d = diffMoney(w, { ...w, enrollmentChanges: [fix], enrollments: w.enrollments.map(e => (e.id === 'MAT-2026-001' ? { ...e, observation: 'x' } : e)) });
  check('Una corrección viaja como fila nueva junto con el cambio de su matrícula', d.payload.correcciones.length === 1 && d.payload.correcciones[0]._nueva === true && d.payload.correcciones[0].matricula_id === 'MAT-2026-001' && d.payload.matriculas.length === 1);
}
{
  const d = diffMoney(w, { ...w, dropRequests: [] });
  check('Quitar una solicitud es un error (ninguna acción las borra)', !!d.error && /quitar/.test(d.error));
  const d2 = diffMoney({ ...w, enrollmentChanges: [fix] }, { ...w, enrollmentChanges: [] });
  check('Quitar una corrección también es un error', !!d2.error && /quitar/.test(d2.error));
}
check('Las acciones nuevas son exactamente las de pedir y rechazar cada tipo de solicitud', ['solicitar_caida', 'solicitar_reactivacion', 'solicitar_cambio_programa', 'solicitar_traslado', 'rechazar_caida', 'rechazar_reactivacion', 'rechazar_cambio_programa', 'rechazar_traslado'].every(a => (MONEY_ACTIONS as readonly string[]).includes(a)) && MONEY_ACTIONS.length === 26);

// ------------------------------------------------------------------------------------------------------------------ Operaciones con un repositorio en memoria
function memoryRepo(initial: MoneyRows) {
  const calls: { fn: string; args?: unknown }[] = [];
  const db = structuredClone(initial);
  const repo: MoneyRepository = {
    async list(): Promise<RepoResult<MoneyRows>> { calls.push({ fn: 'list' }); return { ok: true, data: structuredClone(db) }; },
    async fetch(t): Promise<RepoResult<MoneyRows>> {
      calls.push({ fn: 'fetch', args: t });
      return { ok: true, data: { ...emptyMoneyRows(), matriculas: db.matriculas.filter(r => t.matriculas.includes(r.id)), solicitudes: db.solicitudes.filter(r => t.solicitudes.includes(r.id)), correcciones: db.correcciones.filter(r => t.correcciones.includes(r.id)) } };
    },
    async apply(action, payload): Promise<RepoResult<null>> {
      calls.push({ fn: 'apply', args: { action, payload } });
      const put = <R extends { id: string }>(list: R[], news: Record<string, unknown>[]) => {
        for (const row of news) {
          const { _nueva, ...rest } = row;
          const at = list.findIndex(x => x.id === row.id);
          if (_nueva) list.push(rest as unknown as R); else if (at >= 0) Object.assign(list[at], rest);
        }
      };
      put(db.matriculas, payload.matriculas); put(db.solicitudes, payload.solicitudes); put(db.correcciones, payload.correcciones);
      return { ok: true, data: null };
    },
  };
  return { repo, calls };
}
{
  const m = memoryRepo(rows);
  const r = await applyMoney(m.repo, 'solicitar_caida', w, { ...w, dropRequests: [pendiente, ...w.dropRequests] });
  check('Pedir: compara, aplica UNA vez con la acción de pedir, y vuelve a leer la solicitud (y solo esa)',
    !!r.ok && m.calls.filter(c => c.fn === 'apply').length === 1 && (m.calls.find(c => c.fn === 'apply')!.args as { action: string }).action === 'solicitar_caida'
    && r.value!.fresh.solicitudes.length === 1 && r.value!.fresh.solicitudes[0].id === 'CAI-009' && r.value!.fresh.matriculas.length === 0);
  const back2 = moneyStateFromRows({ ...rows, solicitudes: [...rows.solicitudes, ...r.value!.fresh.solicitudes] }, lists);
  check('Lo que se vuelve a leer se entiende como una caída pendiente', back2.dropRequests.some(x => x.id === 'CAI-009' && x.status === 'Pendiente' && x.effectiveDate === pendiente.effectiveDate));
}
{
  const m = memoryRepo(rows);
  const after = {
    ...w, enrollments: w.enrollments.map(e => (e.id === 'MAT-2026-001' ? { ...e, observation: 'corregida' } : e)),
    enrollmentChanges: [fix], changeRequests: [{ ...change, status: 'Pendiente' as const, resolvedAt: undefined, resolvedBy: undefined, resolutionNote: undefined, effects: undefined }],
  };
  const r = await applyMoney(m.repo, 'corregir', w, after);
  check('La matrícula, la corrección y la solicitud de una operación viajan en UNA sola llamada a la base', !!r.ok && m.calls.filter(c => c.fn === 'apply').length === 1
    && (m.calls.find(c => c.fn === 'apply')!.args as { payload: { matriculas: unknown[]; correcciones: unknown[]; solicitudes: unknown[] } }).payload.correcciones.length === 1
    && (m.calls.find(c => c.fn === 'apply')!.args as { payload: { solicitudes: unknown[] } }).payload.solicitudes.length === 1);
}

// ------------------------------------------------------------------------------------------------------------------ Carga de partida
const seedFile = read('supabase/seed/solicitudes_de_ejemplo.sql');
check('La carga de partida está al día (se genera con npx tsx scripts/doc-solicitudes-seed.ts)', renderRequestsSeedSql() === seedFile);
check('La carga trae la solicitud de caída de ejemplo CAI-001 (aprobada, con sus efectos en jsonb) y es repetible (no pisa nada)',
  /insert into public\.solicitudes_matricula /.test(seedFile) && /\('CAI-001', 'Caída', 'MAT-2026-003'/.test(seedFile) && /'Aprobada'/.test(seedFile) && /::jsonb/.test(seedFile) && /on conflict do nothing/.test(seedFile));
check('La matrícula que la solicitud nombra existe en la carga de matrículas de ejemplo', /'MAT-2026-003'/.test(read('supabase/seed/matriculas_de_ejemplo.sql')) && /'CAI-001'/.test(read('supabase/seed/matriculas_de_ejemplo.sql')));

// ------------------------------------------------------------------------------------------------------------------ Migración
const mig = read('supabase/migrations/20261112160000_solicitudes_y_correcciones.sql');
const down = read('supabase/deshacer/20261112160000_solicitudes_y_correcciones.down.sql');
const mig15 = read('supabase/migrations/20261110140000_matriculas_y_dinero.sql');
check('Las dos tablas existen y se leen de ellas en el repositorio (sin escribirlas directo)',
  /create table public\.solicitudes_matricula \(/.test(mig) && /create table public\.correcciones_matricula \(/.test(mig) && /'solicitudes_matricula'/.test(read('src/services/moneyRepository.ts'))
  && /'correcciones_matricula'/.test(read('src/services/moneyRepository.ts')) && !/\.from\('[a-z_]+'\)\s*\.(insert|update|upsert|delete)/.test(read('src/services/moneyRepository.ts')));
check('Nadie escribe las tablas directo: solo se lee (la escritura pasa por aplicar_cambios_matricula)', /grant select on public\.solicitudes_matricula, public\.correcciones_matricula to authenticated/.test(mig) && !/grant (insert|update|delete)/.test(mig));
check('Una solicitud nace pendiente (con sesión) y después solo se aprueba o se rechaza, una vez; no se borra ni se vacía',
  /create trigger solicitudes_guarda before insert or update/.test(mig) && /Una solicitud nueva nace pendiente/.test(mig) && /Esta solicitud ya fue resuelta/.test(mig) && /Una solicitud no se modifica: solo se aprueba o se rechaza/.test(mig)
  && /create trigger solicitudes_no_borrar before delete/.test(mig) && /before truncate on public\.solicitudes_matricula/.test(mig));
check('Quien pidió una solicitud no la resuelve (salvo el Superusuario): la base lo exige por cuenta, no por nombre', /solicitante_cuenta = auth\.uid\(\) and not app\.es_superusuario\(\)/.test(mig) && /Quien pidió la solicitud no puede resolverla/.test(mig));
check('Quién resolvió y cuándo salen de la cuenta con sesión (no de la pantalla)', /new\.resuelta_por := app\.quien\(null\)/.test(mig) && /new\.resuelta_en := now\(\)/.test(mig));
check('Las correcciones no se modifican, no se borran ni se vacían', /create trigger correcciones_no_cambian before update or delete/.test(mig) && /before truncate on public\.correcciones_matricula/.test(mig));
check('Una sola solicitud pendiente por matrícula: una de caída y una de cambio', /create unique index solicitudes_caida_pendiente_uq[^;]*where tipo = 'Caída' and estado = 'Pendiente'/.test(mig) && /create unique index solicitudes_cambio_pendiente_uq[^;]*where tipo <> 'Caída' and estado = 'Pendiente'/.test(mig));
check('Cada tipo lleva lo suyo: la reactivación su fecha de reinicio, el cambio su programa destino, el traslado su sede destino, la caída su fecha', /tipo <> 'Reactivación' or datos \? 'startDate'/.test(mig) && /tipo <> 'Cambio de programa' or datos \? 'programId'/.test(mig)
  && /tipo <> 'Traslado de sede' or datos \? 'branchId'/.test(mig) && /tipo <> 'Caída' or \(fecha_efecto is not null/.test(mig));
check('Un rechazo explica por qué (5 letras) y una aprobada guarda sus efectos', /estado <> 'Rechazada' or length\(btrim\(coalesce\(nota_resolucion, ''\)\)\) >= 5/.test(mig) && /\(estado = 'Aprobada'\) = \(efectos is not null\)/.test(mig));
check('Lo aprobado deja la matrícula como se aprobó (la base lo vuelve a comprobar)', /create function app\.verificar_solicitudes/.test(mig) && /perform app\.verificar_solicitudes\(v_solicitudes\)/.test(mig)
  && /caida_solicitud = r\.id and r\.caida_fecha = r\.fecha_efecto/.test(mig) && /reactivacion_solicitud = r\.id/.test(mig) && /r\.programa_id = r\.datos->>'programId'/.test(mig) && /r\.sede_id = r\.datos->>'branchId'/.test(mig));
check('Una corrección solo nace junto con un cambio de esa misma matrícula', /= any \(v_matriculas\)/.test(mig) && /La corrección nombra la matrícula/.test(mig));
check('Una acción de solicitudes trabaja con UNA solicitud, de su tipo y en el estado que deja', /jsonb_array_length\(p->'solicitudes'\) <> 1/.test(mig) && /v_tipo_fila is distinct from v_sol_tipo/.test(mig) && /\(v_fila->>'estado'\) is distinct from v_sol_estado/.test(mig));
check('Una solicitud nueva pide la matrícula en el estado de su tipo (la reactivación, caída; los demás, activa) y la sede alcanzable', /v_sol_tipo = 'Reactivación' and v_m_estado <> 'Caída'/.test(mig) && /v_sol_tipo <> 'Reactivación' and v_m_estado <> 'Activa'/.test(mig) && /exigir_sede\(v_vieja, 'solicitudes de matrícula'\)/.test(mig));
check('Se ve por sede: las solicitudes con las funciones que las leen y las correcciones con las de matrículas', /app\.puede_leer_solicitudes\(\)\) and \(select app\.ve_matricula\(matricula_id\)\)/.test(mig) && /app\.puede_leer_matriculas\(\)\) and \(select app\.ve_matricula\(matricula_id\)\)/.test(mig));
check('La función aplicar_cambios_matricula se amplía (create or replace, misma firma) y sigue pidiendo la función del registro de cada acción', /create or replace function public\.aplicar_cambios_matricula\(p_accion text, p jsonb\)/.test(mig) && /app\.exigir_alguna\(v_funcs/.test(mig) && /create or replace function app\.acciones_dinero\(\)/.test(mig));
check('Los errores de negocio usan el código EN001', (mig.match(/errcode = 'EN001'/g) ?? []).length >= 30);
check('Hay script para deshacer: quita las tablas y devuelve las funciones de la 0015', /drop table if exists public\.solicitudes_matricula/.test(down) && /drop table if exists public\.correcciones_matricula/.test(down)
  && /create or replace function app\.acciones_dinero\(\)/.test(down) && /create or replace function public\.aplicar_cambios_matricula/.test(down) && !/solicitar_caida/.test(down));
check('Las funciones de 0015 que se restauran son las mismas (no hay una copia cambiada a mano)', mig15.includes(down.slice(down.indexOf('create or replace function app.acciones_dinero()') + 'create or replace function '.length, down.indexOf('create or replace function app.acciones_dinero()') + 400)));

// ------------------------------------------------------------------------------------------------------------------ Acciones de la base
const block = /create or replace function app\.acciones_dinero\(\)[\s\S]*?select '(\{[\s\S]*?\})'::jsonb;/.exec(mig)?.[1] ?? '{}';
const config = JSON.parse(block) as Record<string, { funciones: string[]; tablas: Record<string, string>; sol_tipo?: string; sol_estado?: string }>;
const request: Record<string, [string, string]> = {
  solicitar_caida: ['Caída', 'requestEnrollmentDrop'], solicitar_reactivacion: ['Reactivación', 'requestReactivation'], solicitar_cambio_programa: ['Cambio de programa', 'requestProgramChange'],
  solicitar_traslado: ['Traslado de sede', 'requestTransfer'],
};
check('Cada acción de pedir agrega UNA solicitud pendiente de su tipo y pide la misma función que el contexto pide a la pantalla (una sola fuente: el registro)',
  Object.entries(request).every(([a, [tipo, ctx]]) => config[a]?.sol_tipo === tipo && config[a].sol_estado === 'Pendiente' && config[a].tablas.solicitudes === 'i' && Object.keys(config[a].tablas).length === 1 && sameSet(config[a].funciones, capabilitiesOfAction(ctx))));
check('Cada acción de rechazar solo cambia la solicitud, la deja rechazada y pide la función de aprobar de su tipo',
  [['rechazar_caida', 'Caída', 'caida'], ['rechazar_reactivacion', 'Reactivación', 'reactivacion'], ['rechazar_cambio_programa', 'Cambio de programa', 'cambio_programa'], ['rechazar_traslado', 'Traslado de sede', 'traslado']]
    .every(([a, tipo, ap]) => config[a]?.sol_tipo === tipo && config[a].sol_estado === 'Rechazada' && config[a].tablas.solicitudes === 'u' && Object.keys(config[a].tablas).length === 1 && sameSet(config[a].funciones, config[ap].funciones)));
check('Cada aprobación cambia la solicitud (la deja aprobada, de su tipo) junto con lo que cambia en la matrícula',
  [['caida', 'Caída'], ['reactivacion', 'Reactivación'], ['cambio_programa', 'Cambio de programa'], ['traslado', 'Traslado de sede']].every(([a, tipo]) => config[a].sol_tipo === tipo && config[a].sol_estado === 'Aprobada' && config[a].tablas.solicitudes === 'u' && config[a].tablas.matriculas === 'u'));
check('El registro de correcciones solo se agrega y solo lo escriben corregir y las aprobaciones que cambian algo corregible (no la caída)',
  Object.entries(config).every(([a, c]) => !c.tablas.correcciones || (c.tablas.correcciones === 'i' && ['corregir', 'reactivacion', 'cambio_programa', 'traslado'].includes(a))) && !config.caida.tablas.correcciones);
check('Solo las acciones de solicitudes tienen tipo y estado de solicitud', Object.entries(config).every(([a, c]) => !!c.sol_tipo === !!c.tablas.solicitudes && !!c.sol_estado === !!c.sol_tipo));
check('Las funciones del registro que piden las acciones nuevas existen', Object.values(config).flatMap(c => c.funciones).every(id => !!capabilityById(id)));
check('Las acciones de la base son exactamente las que conoce el cliente', sameSet(Object.keys(config), [...MONEY_ACTIONS]), `${Object.keys(config).sort().join()} ≠ ${[...MONEY_ACTIONS].sort().join()}`);

// ------------------------------------------------------------------------------------------------------------------ Quién lee
const readers = (entity: string) => ALL_CAPABILITIES.filter(c => (c as { reads?: string[] }).reads?.includes(entity)).map(c => c.id).sort().join();
const listOf = (fn: string) => {
  const m = new RegExp(`function app\\.${fn}\\(\\)[\\s\\S]*?array\\[([^\\]]*)\\]`).exec(mig);
  return (m?.[1].match(/'([a-z-]+:[a-z_]+)'/g) ?? []).map(x => x.slice(1, -1)).sort().join();
};
check('Quién lee solicitudes son exactamente las funciones que, en el registro, leen «Solicitud sobre una matrícula» (si se agrega una, la lista de la base se actualiza)',
  listOf('puede_leer_solicitudes') === readers('enrollmentRequest'), `${listOf('puede_leer_solicitudes')} ≠ ${readers('enrollmentRequest')}`);
check('«Ver matrículas» lee las solicitudes (las pendientes salen en su lista y en la ficha) y las aprobaciones y el reporte también', ['op-matriculas:view', 'op-matriculas:approve_drop', 'op-matriculas:approve_reactivation', 'op-matriculas:approve_program_change',
  'op-matriculas:approve_transfer', 'rep-matriculas:view', 'sis-solicitudes:view', 'dash-resumen:view'].every(id => readers('enrollmentRequest').split(',').includes(id)));

// ------------------------------------------------------------------------------------------------------------------ Contexto y pantallas
const ctxSrc = read('src/context/DataContext.tsx');
check('El contexto ya no guarda solicitudes ni correcciones en memoria: usa las de la base (useMoney)',
  !/setDropRequests|setChangeRequests|setEnrollmentChanges/.test(ctxSrc) && /const \{ enrollments, plans, payments, cashMovements, creditNotes, promotionGroups, dropRequests, changeRequests, enrollmentChanges \} = money/.test(ctxSrc));
check('Pedir una solicitud la guarda en la base con la acción de su tipo, ANTES de avisar a quien aprueba',
  /d\.dropRequests = \[request, \.\.\.d\.dropRequests\];\s*const saved = await saveMoney\('solicitar_caida', d\);\s*if \(!saved\.ok\) return saved;\s*notify\('drop_request_pending'/.test(ctxSrc)
  && /saveMoney\(kind === 'Reactivación' \? 'solicitar_reactivacion' : kind === 'Cambio de programa' \? 'solicitar_cambio_programa' : 'solicitar_traslado', d\);\s*if \(!saved\.ok\) return saved;\s*notify\(/.test(ctxSrc));
check('Rechazar una solicitud la guarda con la acción de rechazar de su tipo', /saveMoney\('rechazar_caida', d\)/.test(ctxSrc) && /saveMoney\(CHANGE_ACTIONS\[request\.kind\]\.reject, d\)/.test(ctxSrc));
check('Corregir los datos de una matrícula guarda la matrícula y sus correcciones en la misma operación', /d\.enrollmentChanges = \[\s*\.\.\.changes\.map\([^\n]*\n\s*\.\.\.d\.enrollmentChanges,\s*\];\s*return saveMoney\('corregir', d\);/.test(ctxSrc));
check('Aprobar una reactivación, un cambio de programa o un traslado arma el historial y la corrección ANTES de guardar (todo viaja junto)', /log = entry\('reactivation'/.test(ctxSrc) && /log = entry\('program'/.test(ctxSrc) && /log = entry\('branch'/.test(ctxSrc)
  && !/entry\([^)]*\);\s*\n[^\n]*setEnrollmentChanges/.test(ctxSrc));
check('Las cuatro acciones de pedir devuelven una promesa en el contexto', ['requestEnrollmentDrop', 'requestReactivation', 'requestProgramChange', 'requestTransfer'].every(a => new RegExp(`\\n  ${a}: \\([^)]*\\) => Promise<StockResult>`).test(ctxSrc)));
const kinds: ChangeRequest['kind'][] = ['Reactivación', 'Cambio de programa', 'Traslado de sede'];
check('Cada tipo de cambio tiene su acción de aprobar y de rechazar', kinds.every(k => ctxSrc.includes(`'${k}': { approve:`)));

// ------------------------------------------------------------------------------------------------------------------ Quedaron sin tocar
const gate = read('src/components/auth/AccessGate.tsx');
check('Las solicitudes se leen con el resto del dinero al iniciar sesión (no hay una lectura aparte)', /loadMoney\(moneyRepo\)/.test(gate) && !/solicitudes_matricula/.test(gate));

if (failed > 0) {
  console.log(`\n${failed} comprobaciones fallaron.`);
  process.exit(1);
}
console.log('\nTodo en verde.');
