/**
 * Verificación de la política y el registro de recordatorios de Psicopedagogía en la base de datos (Lote 10C).
 *  - filas de la base → lo que muestra el sistema (`utils/psyRemindersDb.ts`): la política vigente es la versión más alta o la de partida; los recordatorios, el más reciente primero;
 *  - operaciones (`services/agenda.ts`) contra un repositorio en memoria: validar con las reglas puras → guardar → traducir el error;
 *  - la migración 0024 (tablas, funciones, lo que pide el registro, las reglas que repite la base con los MISMOS textos que las reglas del sistema, permisos y «deshacer»)
 *    y el cableado (inicio de sesión, gancho, contexto y pantallas).
 * La base se prueba aparte contra una copia (cuentas de dos sedes, asesorías, actividades, matrículas y los envíos que arma el propio sistema).
 * Ejecutar: npx tsx scripts/check-psy-reminders-db.ts
 */
import { readFileSync } from 'node:fs';
import type { PsyReminderLog } from '../src/context/DataContext';
import { logPsyReminderEntry, refreshPsyReminders, savePsyPolicyVersion, type AgendaRepository, type PsyReminderRequest } from '../src/services/agenda';
import { agendaFromRows, mergeAgendaRows, EMPTY_AGENDA } from '../src/utils/agendaDb';
import { ALL_CAPABILITIES, capabilityById } from '../src/utils/capabilities';
import { THROWS_ON_DENIAL } from '../src/utils/guards';
import { DEFAULT_PSY_POLICY, policyText, psyReminderKey, validatePsyPolicy, validatePsyReminderLog } from '../src/utils/psyReminders';
import {
  currentPsyPolicy, psyPolicyFromRow, psyReminderFromRow, psyRemindersErrorMessage, sortPsyReminders, type PsyPoliticaRow, type PsyRecordatorioRow,
} from '../src/utils/psyRemindersDb';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : ` -> ${detail}`}`);
  if (!ok) failed++;
};
const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

// ------------------------------------------------------------------------------------------------------------------ Filas → lo que muestra el sistema
const policies: PsyPoliticaRow[] = [
  { version: 1, asesorias_antes: [1], actividades_antes: [2], vigencia_antes: [14, 7, 1], creada_en: '2026-11-16T15:00:00Z', creada_por: 'Ana' },
  { version: 3, asesorias_antes: [2, 1], actividades_antes: [3, 2], vigencia_antes: [30, 14, 7, 1], creada_en: '2026-11-18T15:00:00Z', creada_por: 'Luis' },
  { version: 2, asesorias_antes: [1], actividades_antes: [2], vigencia_antes: [7, 1], creada_en: '2026-11-17T15:00:00Z', creada_por: 'Ana' },
];
const logRows: PsyRecordatorioRow[] = [
  { id: 'PRL-001', tipo: 'asesoria', ref_id: 'SES-001', alumno_id: 'ALU-001', etapa: 1, clave: 'asesoria:SES-001:1', sede_id: 'FIL-002', registrado_en: '2026-11-16T15:00:00Z', registrado_por: 'Ana', canal: 'WhatsApp', resultado: 'Enviado', nota: null },
  { id: 'PRL-002', tipo: 'actividad', ref_id: 'CRO-001:ACT-001', alumno_id: 'ALU-005', etapa: 2, clave: 'actividad:CRO-001:ACT-001:ALU-005:2', sede_id: 'FIL-002', registrado_en: '2026-11-17T15:00:00Z', registrado_por: 'Luis', canal: 'Otro', resultado: 'Omitido', nota: 'Ya confirmó' },
  { id: 'PRL-003', tipo: 'vigencia', ref_id: 'MAT-2026-001', alumno_id: 'ALU-001', etapa: 14, clave: 'vigencia:MAT-2026-001:14', sede_id: 'FIL-002', registrado_en: '2026-11-17T15:00:00Z', registrado_por: 'Ana', canal: 'Llamada', resultado: 'Enviado', nota: null },
];
const versions = policies.map(psyPolicyFromRow).sort((a, b) => b.version - a.version);
check('Cada versión de la política sale con sus días, quién la guardó y cuándo; la vigente es la de número más alto (aunque lleguen desordenadas)',
  versions.map(v => v.version).join() === '3,2,1' && versions[0]!.sessionBefore.join() === '2,1' && versions[0]!.activityBefore.join() === '3,2' && versions[0]!.validityBefore.join() === '30,14,7,1' && versions[0]!.createdBy === 'Luis' && versions[0]!.createdAt === '2026-11-18T15:00:00Z'
  && JSON.stringify(currentPsyPolicy(versions)) === JSON.stringify({ sessionBefore: [2, 1], activityBefore: [3, 2], validityBefore: [30, 14, 7, 1] }) && JSON.stringify(currentPsyPolicy(policies.map(psyPolicyFromRow))) === JSON.stringify(currentPsyPolicy(versions)));
check('Sin ninguna versión guardada vale la política de partida (asesorías 1 día antes, actividades 2, vigencia 14, 7 y 1)',
  JSON.stringify(currentPsyPolicy([])) === JSON.stringify(DEFAULT_PSY_POLICY) && DEFAULT_PSY_POLICY.sessionBefore.join() === '1' && DEFAULT_PSY_POLICY.activityBefore.join() === '2' && DEFAULT_PSY_POLICY.validityBefore.join() === '14,7,1');
const logs = logRows.map(psyReminderFromRow);
check('Un recordatorio registrado sale con su clave (la que genera la base), su tipo, lo recordado, el alumno, la etapa, quién y cuándo, y su nota solo si la tiene',
  logs[0]!.key === 'asesoria:SES-001:1' && logs[0]!.kind === 'asesoria' && logs[0]!.refId === 'SES-001' && logs[0]!.studentId === 'ALU-001' && logs[0]!.offset === 1 && logs[0]!.by === 'Ana' && logs[0]!.at === '2026-11-16T15:00:00Z' && logs[0]!.channel === 'WhatsApp' && logs[0]!.result === 'Enviado' && !('note' in logs[0]!)
  && logs[1]!.note === 'Ya confirmó' && logs[1]!.result === 'Omitido');
check('Las claves que arma el sistema son las mismas que genera la base: la de una actividad lleva al alumno; la de una asesoría o una vigencia, no',
  logs.every((l, i) => l.key === psyReminderKey(l.kind, l.refId, l.offset, l.studentId) && !!logRows[i]) && psyReminderKey('actividad', 'CRO-001:ACT-001', 2, 'ALU-005') === 'actividad:CRO-001:ACT-001:ALU-005:2'
  && psyReminderKey('asesoria', 'SES-001', 1, 'ALU-001') === 'asesoria:SES-001:1' && psyReminderKey('vigencia', 'MAT-2026-001', 14, 'ALU-001') === 'vigencia:MAT-2026-001:14');
check('Los recordatorios se muestran del más reciente al más antiguo (con la hora y el código como desempate)',
  sortPsyReminders(logs).map(l => l.id).join() === 'PRL-003,PRL-002,PRL-001' && logs.map(l => l.id).join() === 'PRL-001,PRL-002,PRL-003');
{
  const state = agendaFromRows({ ...EMPTY_AGENDA, psyPoliticas: policies, psyRecordatorios: logRows }, { students: [], enrollments: [], staff: [], branches: [] });
  check('La agenda entrega la política vigente, todas sus versiones y los recordatorios registrados; sin filas, la de partida y ninguno',
    state.psyReminderPolicy.sessionBefore.join() === '2,1' && state.psyPolicies.length === 3 && state.psyPolicies[0]!.version === 3 && state.psyReminderLogs.length === 3 && state.psyReminderLogs[0]!.id === 'PRL-003'
    && agendaFromRows(EMPTY_AGENDA, { students: [], enrollments: [], staff: [], branches: [] }).psyReminderLogs.length === 0
    && JSON.stringify(agendaFromRows(EMPTY_AGENDA, { students: [], enrollments: [], staff: [], branches: [] }).psyReminderPolicy) === JSON.stringify(DEFAULT_PSY_POLICY));
  const base = { ...EMPTY_AGENDA, psyPoliticas: policies, psyRecordatorios: logRows };
  const merged = mergeAgendaRows(base, { psyRecordatorios: [] });
  const kept = mergeAgendaRows(base, { asesorias: [] });
  check('Volver a leer la política y los recordatorios los reemplaza completos; mezclar otra cosa no los toca',
    merged.psyRecordatorios.length === 0 && merged.psyPoliticas.length === 3 && kept.psyRecordatorios.length === 3 && kept.psyPoliticas.length === 3);
}
check('Errores de la base: un recordatorio repetido, algo que ya no existe y lo técnico se traducen; los avisos propios (EN001) se muestran tal cual',
  /ya fue registrado/.test(psyRemindersErrorMessage({ code: '23505', message: 'x', details: 'psy_recordatorios_clave_uq' })) && /Otra persona/.test(psyRemindersErrorMessage({ code: '23505', message: 'x' }))
  && /ya no existe/.test(psyRemindersErrorMessage({ code: '23503', message: 'x' })) && psyRemindersErrorMessage({ code: 'EN001', message: 'Esa etapa de recordatorio ya no está en la política de Psicopedagogía: actualice la página.' }) === 'Esa etapa de recordatorio ya no está en la política de Psicopedagogía: actualice la página.');

// ------------------------------------------------------------------------------------------------------------------ Operaciones con un repositorio en memoria
function memoryRepo(opts: { fail?: string; failRead?: boolean } = {}) {
  const calls: { fn: string; args: unknown[] }[] = [];
  const repo: AgendaRepository = {
    async loadAll() { return { ok: true, data: { ...EMPTY_AGENDA } }; },
    async apply() { return { ok: true, data: { codes: {} } }; },
    async loadTouched() { return { ok: true, data: {} }; },
    async saveCapacity() { return { ok: true, data: null }; },
    async applyActivities() { return { ok: true, data: { codes: {} } }; },
    async loadActivitiesTouched() { return { ok: true, data: { cronogramas: [], actividades: [], inscripciones: [], eventos: [] } }; },
    async savePsyPolicy(policy) { calls.push({ fn: 'savePsyPolicy', args: [policy] }); return opts.fail ? { ok: false, error: opts.fail } : { ok: true, data: 2 }; },
    async addPsyReminder(r: PsyReminderRequest) { calls.push({ fn: 'addPsyReminder', args: [r] }); return opts.fail ? { ok: false, error: opts.fail } : { ok: true, data: 'PRL-004' }; },
    async loadPsyReminders() { calls.push({ fn: 'loadPsyReminders', args: [] }); return opts.failRead ? { ok: false, error: 'sin conexión' } : { ok: true, data: { psyPoliticas: policies, psyRecordatorios: logRows } }; },
  };
  return { repo, calls };
}
const reminder = { key: 'asesoria:SES-009:1', kind: 'asesoria' as const, refId: 'SES-009', studentId: 'ALU-001', offset: 1 };
async function run() {
  { const m = memoryRepo(); const r = await savePsyPolicyVersion(m.repo, { sessionBefore: [], activityBefore: [2], validityBefore: [14] });
    check('Una política sin días se rechaza antes de llamar a la base', !r.ok && /al menos un día para las asesorías/.test(r.error ?? '') && m.calls.length === 0); }
  { const m = memoryRepo(); const r = await savePsyPolicyVersion(m.repo, { sessionBefore: [15], activityBefore: [2], validityBefore: [14] });
    check('Y una con días fuera de rango (las asesorías hasta 14) también', !r.ok && /entre 0 y 14/.test(r.error ?? '') && m.calls.length === 0); }
  { const m = memoryRepo(); const r = await savePsyPolicyVersion(m.repo, { sessionBefore: [2, 1], activityBefore: [3], validityBefore: [14, 7, 1] });
    check('Una política válida se manda tal cual a la base (que guarda una versión nueva solo si cambió)', r.ok && m.calls.length === 1 && m.calls[0]!.fn === 'savePsyPolicy' && JSON.stringify(m.calls[0]!.args[0]) === JSON.stringify({ sessionBefore: [2, 1], activityBefore: [3], validityBefore: [14, 7, 1] })); }
  { const r = await savePsyPolicyVersion(memoryRepo({ fail: 'Su rol no puede configurar los días de recordatorio.' }).repo, DEFAULT_PSY_POLICY);
    check('Si la base rechaza la política, se devuelve su motivo', !r.ok && /configurar los días/.test(r.error ?? '')); }

  { const m = memoryRepo(); const r = await logPsyReminderEntry(m.repo, [{ key: reminder.key }], reminder, 'WhatsApp', 'Enviado', '');
    check('Un recordatorio ya registrado no se vuelve a mandar (se rechaza antes de llamar a la base)', !r.ok && /ya fue registrado/.test(r.error ?? '') && m.calls.length === 0); }
  { const m = memoryRepo(); const r = await logPsyReminderEntry(m.repo, [], reminder, 'WhatsApp', 'Omitido', 'no');
    check('Omitir pide su motivo (al menos 5 letras)', !r.ok && /por qué se omite/.test(r.error ?? '') && m.calls.length === 0); }
  { const m = memoryRepo(); const r = await logPsyReminderEntry(m.repo, [], reminder, 'Paloma' as PsyReminderLog['channel'], 'Enviado', '');
    check('El canal debe ser uno de la lista', !r.ok && /canal/.test(r.error ?? '') && m.calls.length === 0); }
  { const m = memoryRepo(); const r = await logPsyReminderEntry(m.repo, [], reminder, 'Otro', 'Omitido', '  Ya confirmó por teléfono ');
    const sent = m.calls[0]?.args[0] as PsyReminderRequest | undefined;
    check('Un recordatorio válido se manda con su tipo, lo recordado, el alumno, la etapa, el canal, el resultado y la nota sin espacios de más',
      r.ok && sent?.kind === 'asesoria' && sent.refId === 'SES-009' && sent.studentId === 'ALU-001' && sent.offset === 1 && sent.channel === 'Otro' && sent.result === 'Omitido' && sent.note === 'Ya confirmó por teléfono'); }
  { const r = await logPsyReminderEntry(memoryRepo({ fail: 'Una primera asesoría cuya matrícula sigue sin verificar no se recuerda: primero hay que verificar o reprogramar.' }).repo, [], reminder, 'WhatsApp', 'Enviado', '');
    check('Si la base rechaza el recordatorio, se devuelve su motivo', !r.ok && /sin verificar/.test(r.error ?? '')); }
  { const m = memoryRepo(); const r = await refreshPsyReminders(m.repo);
    check('Volver a leer trae las versiones y los recordatorios', r.ok && r.value?.psyPoliticas.length === 3 && r.value?.psyRecordatorios.length === 3 && m.calls[0]!.fn === 'loadPsyReminders'); }
  { const r = await refreshPsyReminders(memoryRepo({ failRead: true }).repo);
    check('Si se guardó pero no se pudo volver a leer, se avisa que se guardó', !r.ok && /Se guardó, pero no se pudo volver a leer/.test(r.error ?? '')); }
}

// ------------------------------------------------------------------------------------------------------------------ La migración 0024
const sql = read('supabase/migrations/20261116100000_recordatorios_de_psicopedagogia.sql');
const down = read('supabase/deshacer/20261116100000_recordatorios_de_psicopedagogia.down.sql');
const code = sql.replace(/--[^\n]*/g, '');
const tables = ['psy_recordatorio_politicas', 'psy_recordatorios'];
check('Crea las dos tablas, con seguridad por fila y solo lectura para las cuentas (todo cambia por funciones)',
  tables.every(t => new RegExp(`create table public\\.${t} \\(`).test(sql) && new RegExp(`alter table public\\.${t}\\s+enable row level security`).test(sql))
  && /revoke all on public\.psy_recordatorio_politicas, public\.psy_recordatorios from public, anon, authenticated;/.test(sql) && /grant select on public\.psy_recordatorio_politicas, public\.psy_recordatorios to authenticated;/.test(sql) && !/grant (insert|update|delete)/i.test(code));
check('Una versión de la política y un recordatorio registrado no se modifican, no se borran ni se vacían (un cambio de la política es una versión nueva)',
  /create trigger psy_politicas_no_cambian before update or delete on public\.psy_recordatorio_politicas/.test(sql) && /create trigger psy_politicas_no_vaciar\s+before truncate on public\.psy_recordatorio_politicas/.test(sql)
  && /create trigger psy_recordatorios_no_cambian before update or delete on public\.psy_recordatorios/.test(sql) && /create trigger psy_recordatorios_no_vaciar\s+before truncate on public\.psy_recordatorios/.test(sql)
  && /un cambio se guarda como una versión nueva/.test(sql));
check('Un mismo recordatorio se registra una sola vez: su clave (tipo + lo recordado + alumno si es una actividad + etapa) es única, con la misma fórmula del sistema, y omitir lleva su motivo',
  /clave\s+text generated always as \(tipo \|\| ':' \|\| ref_id \|\| case when tipo = 'actividad' then ':' \|\| alumno_id else '' end \|\| ':' \|\| etapa::text\) stored/.test(sql) && /create unique index psy_recordatorios_clave_uq on public\.psy_recordatorios \(clave\)/.test(sql)
  && /check \(resultado = 'Enviado' or length\(btrim\(coalesce\(nota, ''\)\)\) >= 5\)/.test(sql) && /canal in \('WhatsApp', 'Correo', 'Llamada', 'Otro'\)/.test(sql) && /resultado in \('Enviado', 'Omitido'\)/.test(sql) && /tipo in \('asesoria', 'actividad', 'vigencia'\)/.test(sql));
check('La política de partida de la base es la del sistema (asesorías 1, actividades 2, vigencia 14, 7 y 1) y la vigente es la versión más alta',
  /select 0, array\[1\], array\[2\], array\[14, 7, 1\] where not exists/.test(sql) && DEFAULT_PSY_POLICY.sessionBefore.join() === '1' && DEFAULT_PSY_POLICY.activityBefore.join() === '2' && DEFAULT_PSY_POLICY.validityBefore.join() === '14,7,1'
  && /order by p\.version desc limit 1/.test(sql));

// Lo que pide cada función y los mismos textos que las reglas del sistema
const has = (id: string, action: string) => ((capabilityById(id) as { actions?: string[] } | undefined)?.actions ?? []).includes(action);
check('Guardar la política pide «Configurar los días de recordatorio» y registrar uno pide «Enviar y registrar recordatorios», y son las funciones de las acciones del sistema',
  /app\.exigir\('psi-recordatorios:config', 'Configurar los días de recordatorio'\)/.test(sql) && has('psi-recordatorios:config', 'savePsyReminderPolicy') && capabilityById('psi-recordatorios:config')?.label === 'Configurar los días de recordatorio'
  && /app\.exigir\('psi-recordatorios:remind', 'Enviar y registrar recordatorios'\)/.test(sql) && has('psi-recordatorios:remind', 'logPsyReminder') && capabilityById('psi-recordatorios:remind')?.label === 'Enviar y registrar recordatorios');
{
  const bad = validatePsyPolicy({ sessionBefore: '', activityBefore: '99', validityBefore: '99' }).concat(validatePsyPolicy({ sessionBefore: '15', activityBefore: '', validityBefore: '' }));
  check('Las reglas de la política son las del sistema (`validatePsyPolicy`): al menos un día de cada y enteros de 0 a 14, 30 y 60; la base dice lo mismo, con las mismas palabras',
    bad.length >= 5 && bad.every(m => sql.includes(m)) && validatePsyPolicy(policyText(DEFAULT_PSY_POLICY)).length === 0);
  const messages = [
    ...validatePsyReminderLog({ key: 'k' }, 'WhatsApp', 'Enviado', '', [{ key: 'k' }]), ...validatePsyReminderLog({ key: 'k' }, 'Paloma', 'Enviado', '', []),
    ...validatePsyReminderLog({ key: 'k' }, 'Otro', 'Quizás', '', []), ...validatePsyReminderLog({ key: 'k' }, 'Otro', 'Omitido', 'no', []),
  ];
  check('Las reglas de un recordatorio son las del sistema (`validatePsyReminderLog`): no repetir, canal, resultado y motivo al omitir; la base dice lo mismo, con las mismas palabras',
    messages.length === 4 && messages.every(m => sql.includes(m)));
}
check('La base vuelve a comprobar lo que ya comprobaba el sistema: la asesoría sigue pendiente y, si es primera, con la matrícula verificada; la actividad no pasó y el alumno sigue inscrito sin asistencia; la matrícula sigue activa',
  /v_ases\.estado not in \('Reservado', 'Reprogramado'\) or v_ases\.fecha < v_hoy/.test(sql) && /app\.matricula_sin_verificar\(v_ases\.matricula_id\)/.test(sql) && /Una primera asesoría cuya matrícula sigue sin verificar no se recuerda/.test(sql)
  && /v_act\.fecha < v_hoy/.test(sql) && /i\.asistencia is null/.test(sql) && /v_mat\.estado <> 'Activa'/.test(sql) && /split_part\(p_ref, ':', 2\)/.test(sql) && /split_part\(p_ref, ':', 1\)/.test(sql)
  && /perform app\.exigir_sede\(v_sede, 'recordatorios de Psicopedagogía'\)/.test(sql));
check('La etapa debe ser una de la política vigente de ese tipo (si cambió mientras tanto, se pide actualizar la página) y el código PRL lo asigna la base con un candado (sin repetidos ni huecos)',
  /v_etapas := case p_tipo when 'asesoria' then v_pol\.asesorias when 'actividad' then v_pol\.actividades else v_pol\.vigencia end/.test(sql) && /Esa etapa de recordatorio ya no está en la política de Psicopedagogía: actualice la página/.test(sql)
  && /pg_advisory_xact_lock\(hashtextextended\('ensil:codigo:PRL\|', 0\)\)/.test(sql) && /'\^PRL-\(\[0-9\]\+\)\$'/.test(sql) && /check \(id ~ '\^PRL-\[0-9\]\{3,\}\$'\)/.test(sql) && /app\.numero_con_relleno\(v_n, 3\)/.test(sql));
const readers = (entity: string) => ALL_CAPABILITIES.filter(c => (c as { reads?: string[] }).reads?.includes(entity)).map(c => c.id).sort().join();
const listOf = (fn: string) => [...(sql.match(new RegExp(`create function app\\.${fn}\\(\\) returns boolean[\\s\\S]*?array\\[([^\\]]+)\\]`))?.[1] ?? '').matchAll(/'([^']+)'/g)].map(m => m[1]).sort().join();
check('Quién lee los recordatorios es lo mismo que dice el registro (y se lee solo lo de las sedes que se alcanzan); la política la lee cualquier cuenta vigente',
  listOf('puede_leer_recordatorios_psy') === readers('psyReminder') && ((capabilityById('sis-auditoria:view') as { reads?: string[] }).reads ?? []).includes('psyReminder')
  && /create policy psy_recordatorios_leer on public\.psy_recordatorios for select to authenticated\s+using \(\(select app\.puede_leer_recordatorios_psy\(\)\) and \(select app\.ve_sede\(sede_id\)\)\)/.test(sql)
  && /create policy psy_politicas_leer on public\.psy_recordatorio_politicas for select to authenticated using \(\(select app\.acceso_vigente\(\)\)\)/.test(sql), `${listOf('puede_leer_recordatorios_psy')} / ${readers('psyReminder')}`);
check('Las funciones públicas son de las cuentas con sesión y lo interno no se llama de fuera; no se toca ningún otro permiso del esquema',
  /revoke execute on function public\.guardar_politica_recordatorios_psy\(integer\[\], integer\[\], integer\[\]\), public\.registrar_recordatorio_psy\(text, text, text, integer, text, text, text\) from public, anon;/.test(sql)
  && /grant execute on function public\.guardar_politica_recordatorios_psy\(integer\[\], integer\[\], integer\[\]\), public\.registrar_recordatorio_psy\(text, text, text, integer, text, text, text\) to authenticated;/.test(sql)
  && /revoke execute on function app\.psy_politica_vigente\(\), app\.psy_politica_inmutable\(\), app\.psy_recordatorio_inmutable\(\) from public, anon, authenticated;/.test(sql) && !/on all functions in schema app/.test(code));
check('La migración se puede deshacer: quita las dos tablas y las funciones nuevas',
  tables.every(t => down.includes(`drop table if exists public.${t};`)) && down.includes('drop function if exists public.guardar_politica_recordatorios_psy(') && down.includes('drop function if exists public.registrar_recordatorio_psy(')
  && ['psy_politica_vigente', 'puede_leer_recordatorios_psy', 'psy_politica_inmutable', 'psy_recordatorio_inmutable'].every(f => down.includes(`drop function if exists app.${f}(`)));

// ------------------------------------------------------------------------------------------------------------------ Cableado
const ctxSrc = read('src/context/DataContext.tsx');
const hook = read('src/hooks/useAgenda.ts');
const repoSrc = read('src/services/agendaRepository.ts');
const screens = { config: read('src/pages/settings/PsyRemindersConfig.tsx'), reminders: read('src/pages/psychopedagogy/Reminders.tsx') };
check('El repositorio de Supabase llama a las dos funciones de los recordatorios y lee las dos tablas (al iniciar sesión y después de cada operación)',
  repoSrc.includes("'guardar_politica_recordatorios_psy'") && repoSrc.includes("'registrar_recordatorio_psy'") && repoSrc.includes("'psy_recordatorio_politicas'") && repoSrc.includes("'psy_recordatorios'") && /async loadPsyReminders\(\)/.test(repoSrc)
  && /p_asesorias: policy\.sessionBefore, p_actividades: policy\.activityBefore, p_vigencia: policy\.validityBefore/.test(repoSrc) && /p_tipo: r\.kind, p_ref: r\.refId, p_alumno: r\.studentId, p_etapa: r\.offset/.test(repoSrc));
check('El gancho valida contra lo último que se vio, guarda y vuelve a leer la política y los recordatorios; el contexto ya no los guarda en memoria',
  /logPsyReminderEntry\(repo, stateRef\.current\.psyReminderLogs, reminder, channel, result, note\)/.test(hook) && /savePsyPolicyVersion\(repo, policy\)/.test(hook) && /await refreshPsy\(\)/.test(hook)
  && !/useState<PsyReminderPolicy>|useState<PsyReminderLog\[\]>|setPsyReminderPolicy|setPsyReminderLogs/.test(ctxSrc) && /psyReminderPolicies/.test(ctxSrc));
check('Las acciones son asíncronas y devuelven { ok, error } (ya no lanzan error al negar el permiso) y piden su función antes de llamar a la base',
  /savePsyReminderPolicy: \(policy: PsyReminderPolicy\) => Promise<StockResult>/.test(ctxSrc) && /logPsyReminder: \([^)]*\) => Promise<StockResult>/.test(ctxSrc) && !['savePsyReminderPolicy', 'logPsyReminder'].some(a => THROWS_ON_DENIAL.has(a))
  && /if \(!can\(PERM\.psiConfig\)\) return[\s\S]{0,160}await agenda\.savePsyPolicy\(policy\)/.test(ctxSrc) && /if \(!can\(PERM\.psiRemind\)\) return[\s\S]{0,160}await agenda\.logPsyReminder\(reminder, channel, result, note\)/.test(ctxSrc));
check('Las pantallas esperan la respuesta de la base antes de seguir, apagan los botones mientras guardan y la configuración muestra el historial de versiones',
  /await savePsyReminderPolicy\(parsePsyPolicy\(form\)\)/.test(screens.config) && /disabled=\{problems\.length > 0 \|\| saving\}/.test(screens.config) && /psyReminderPolicies\.map/.test(screens.config) && /Versiones de la política/.test(screens.config)
  && /await logPsyReminder\(r, channel, 'Enviado', ''\)/.test(screens.reminders) && /await logPsyReminder\(skipping, 'Otro', 'Omitido', detail\)/.test(screens.reminders) && /disabled=\{!mayRemind \|\| busy\}/.test(screens.reminders));

run().then(() => {
  if (failed > 0) {
    console.log(`\n${failed} comprobaciones fallaron.`);
    process.exit(1);
  }
  console.log('\nTodo en verde.');
});
