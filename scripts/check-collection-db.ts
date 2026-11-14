/**
 * Verificación de la política de cobranza, los recordatorios registrados y la plantilla del contrato en la base de datos (Lote 9C). **La política es UNA para
 * todo el grupo; la política y la plantilla se guardan por versiones y cada contrato conserva la versión con la que se generó.**
 *  - traducción de filas de la base (`utils/collectionConfigDb.ts`), la versión vigente y la plantilla de un contrato ya generado;
 *  - operaciones (`services/collectionConfig.ts`) contra un repositorio en memoria: validar → guardar, sin llamar a la base si no hay nada que guardar;
 *  - que el contrato conserva su texto aunque la plantilla se edite (con las reglas puras de `utils/enrollmentDocuments.ts`);
 *  - la migración 0021 (tablas, funciones, lo que pide el registro, la vigilancia de la mora, permisos y «deshacer») y el cableado (contexto, inicio de sesión y
 *    pantallas).
 * La base se prueba aparte contra una copia (con cuentas de dos sedes y los envíos que arma el propio cliente).
 * Ejecutar: npx tsx scripts/check-collection-db.ts
 */
import { readFileSync } from 'node:fs';
import type { ContractTemplate, IssuedDocument } from '../src/context/DataContext';
import {
  loadCollectionConfig, logReminderEntry, saveContractTemplate, savePolicyVersion,
  type CollectionConfigData, type CollectionConfigRepository, type ReminderRequest, type TemplateInput,
} from '../src/services/collectionConfig';
import type { RepoResult } from '../src/services/orgDirectory';
import {
  collectionConfigErrorMessage, currentPolicy, currentTemplate, policyFromRow, reminderFromRow, templateForIssued, templateFromRow, type PolicyVersion,
} from '../src/utils/collectionConfigDb';
import { ALL_CAPABILITIES, capabilityById } from '../src/utils/capabilities';
import { DEFAULT_POLICY, reminderKey, stagesOf, validatePolicy, type CollectionPolicy } from '../src/utils/collections';
import {
  DEFAULT_CONTRACT_TEMPLATE, TEMPLATE_TOKENS, buildContractDocument, docState, issueDocument, type DocContext,
} from '../src/utils/enrollmentDocuments';
import { THROWS_ON_DENIAL } from '../src/utils/guards';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : ` -> ${detail}`}`);
  if (!ok) failed++;
};
const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

// ------------------------------------------------------------------------------------------------------------------ Traducción de filas
const pol = (version: number, over: Partial<PolicyVersion> = {}): PolicyVersion => ({
  version, graceDays: 3, moraMonthlyRate: 0.02, remindBefore: [3, 0], remindAfter: [1, 7, 15, 30], createdAt: '2026-11-13T15:00:00.000Z', createdBy: 'Ana', ...over,
});
check('Política ↔ fila: la tasa llega como texto y se lee como número; los días se copian; quién y cuándo se conservan',
  (() => {
    const p = policyFromRow({ version: 2, dias_gracia: 5, tasa_mora: '0.0250', recordar_antes: [2, 0], recordar_despues: [3, 10], creada_en: '2026-11-13T15:00:00Z', creada_por: 'Ana' });
    return p.version === 2 && p.graceDays === 5 && p.moraMonthlyRate === 0.025 && p.remindBefore.join() === '2,0' && p.remindAfter.join() === '3,10' && p.createdBy === 'Ana' && p.createdAt === '2026-11-13T15:00:00Z';
  })());
check('Recordatorio ↔ fila: la clave de la base es la del sistema (plan:cuota:etapa) y la nota solo está si hay',
  (() => {
    const a = reminderFromRow({ id: 'REC-004', plan_id: 'PLN-001', cuota_id: 'C2', desfase: -3, clave: reminderKey('PLN-001', 'C2', -3), sede_id: 'FIL-002', registrado_en: '2026-11-13T15:00:00Z', registrado_por: 'Ana', canal: 'WhatsApp', resultado: 'Enviado', nota: null });
    const b = reminderFromRow({ id: 'REC-005', plan_id: 'PLN-001', cuota_id: 'C2', desfase: 7, clave: reminderKey('PLN-001', 'C2', 7), sede_id: 'FIL-002', registrado_en: '2026-11-13T15:00:00Z', registrado_por: 'Ana', canal: 'Otro', resultado: 'Omitido', nota: 'Ya pagó' });
    return a.key === 'PLN-001:C2:-3' && a.stageOffset === -3 && a.by === 'Ana' && a.channel === 'WhatsApp' && !('note' in a) && b.note === 'Ya pagó' && b.result === 'Omitido';
  })());
const tpl = (version: number, over: Partial<ContractTemplate> = {}): ContractTemplate => ({ ...DEFAULT_CONTRACT_TEMPLATE, version, ...over });
check('Plantilla ↔ fila: las cláusulas se copian (id, título, texto); quién y cuándo salen de la revisión si la hay, y si no, de la creación',
  (() => {
    const a = templateFromRow({ version: 3, introduccion: 'Introducción larga del contrato.', clausulas: [{ id: 'objeto', title: 'Primera', body: 'Texto suficiente.' }], cierre: 'Cierre', revisada: true, revisada_por: 'Legal', revisada_en: '2026-11-14T10:00:00Z', creada_en: '2026-11-13T10:00:00Z', creada_por: 'Ana' });
    const b = templateFromRow({ version: 4, introduccion: 'Introducción larga del contrato.', clausulas: [], cierre: '', revisada: false, revisada_por: null, revisada_en: null, creada_en: '2026-11-15T10:00:00Z', creada_por: 'Ana' });
    return a.version === 3 && a.reviewed && a.clauses[0]!.id === 'objeto' && a.updatedBy === 'Legal' && a.updatedAt === '2026-11-14T10:00:00Z' && b.reviewed === false && b.updatedBy === 'Ana' && b.updatedAt === '2026-11-15T10:00:00Z';
  })());

// ------------------------------------------------------------------------------------------------------------------ La versión vigente
check('Sin ninguna política guardada vale la de partida; con varias, la de número más alto (en el orden que lleguen)',
  JSON.stringify(currentPolicy([])) === JSON.stringify(DEFAULT_POLICY) && currentPolicy([pol(1), pol(3, { graceDays: 9 }), pol(2, { graceDays: 5 })]).graceDays === 9
  && currentPolicy([pol(2, { graceDays: 5 }), pol(1)]).graceDays === 5 && !('version' in currentPolicy([pol(1)])) && !('createdBy' in currentPolicy([pol(1)])));
check('La política vigente es una copia: cambiarla no cambia el historial', (() => { const v = pol(1); const c = currentPolicy([v]); c.remindBefore.push(99); return v.remindBefore.join() === '3,0'; })());
check('Sin ninguna plantilla guardada vale el texto modelo (versión 1, sin revisar); con varias, la más alta',
  currentTemplate([]) === DEFAULT_CONTRACT_TEMPLATE && currentTemplate([]).version === 1 && !currentTemplate([]).reviewed && currentTemplate([tpl(1), tpl(3), tpl(2)]).version === 3);

// ------------------------------------------------------------------------------------------------------------------ El contrato conserva su texto
const ctxFor = (template: ContractTemplate): DocContext => ({
  enrollment: { id: 'MAT-2026-001', program: 'Lectura Veloz', level: 'Sin nivel', student: 'Mateo Ruiz', dateISO: '2026-09-01' },
  guardians: [], validity: {}, template, today: '2026-11-13',
} as unknown as DocContext);
const v1 = tpl(1, { reviewed: true });
const v2 = tpl(2, { intro: `${v1.intro} Se agrega una frase nueva.` });
const NOW = '2026-11-13T10:00:00.000Z';
{
  const issuedV1 = issueDocument('contract', undefined, buildContractDocument(ctxFor(v1)), 'Ana', NOW, 1);
  check('El contrato guarda la versión de la plantilla con la que se generó (la ficha no usa plantilla y no la guarda)',
    issuedV1.templateVersion === 1 && !('templateVersion' in issueDocument('ficha', undefined, buildContractDocument(ctxFor(v1)), 'Ana', NOW, 1))
    && !('templateVersion' in issueDocument('contract', undefined, buildContractDocument(ctxFor(v1)), 'Ana', NOW)));
  const versions = [v2, v1];
  const pinned = templateForIssued(versions, issuedV1, v2);
  check('Con la plantilla editada (versión 2), el contrato generado con la 1 se sigue armando con la 1 y sigue vigente (no se marca desactualizado)',
    pinned === v1 && docState(issuedV1, buildContractDocument(ctxFor(pinned)).fingerprint) === 'vigente');
  check('Armado con la plantilla vigente (la 2) saldría distinto: por eso solo se vuelve a generar a propósito (versión siguiente del contrato, sin firma)',
    docState(issuedV1, buildContractDocument(ctxFor(v2)).fingerprint) === 'desactualizado'
    && (() => { const again = issueDocument('contract', { ...issuedV1, signedAt: '2026-11-14', signedFile: 'x.pdf' }, buildContractDocument(ctxFor(v2)), 'Ana', NOW, 2); return again.version === 2 && again.templateVersion === 2 && !again.signedAt && again.number === issuedV1.number; })());
  check('Un contrato generado antes de este registro (sin versión) y uno cuya versión no está se arman con la vigente',
    templateForIssued(versions, { ...issuedV1, templateVersion: undefined } as IssuedDocument, v2) === v2 && templateForIssued(versions, undefined, v2) === v2
    && templateForIssued([v2], issuedV1, v2) === v2 && templateForIssued([], issuedV1, DEFAULT_CONTRACT_TEMPLATE) === DEFAULT_CONTRACT_TEMPLATE);
  check('Si lo que cambia son los datos de la matrícula (no la plantilla), el contrato sí queda desactualizado',
    docState(issuedV1, buildContractDocument({ ...ctxFor(v1), enrollment: { ...ctxFor(v1).enrollment, assignedPrice: 999 } } as DocContext).fingerprint) === 'desactualizado');
}

// ------------------------------------------------------------------------------------------------------------------ Errores de la base
check('Errores de la base: recordatorio repetido, plan inexistente y lo técnico se traducen; los avisos propios (EN001) se muestran tal cual',
  /ya fue registrado/.test(collectionConfigErrorMessage({ code: '23505', message: 'duplicate key value violates unique constraint "recordatorios_clave_uq"' }))
  && /Otra persona/.test(collectionConfigErrorMessage({ code: '23505', message: 'x' })) && /plan ya no existe/.test(collectionConfigErrorMessage({ code: '23503', message: 'x' }))
  && collectionConfigErrorMessage({ code: 'EN001', message: 'Este recordatorio ya fue registrado.' }) === 'Este recordatorio ya fue registrado.'
  && !/violates|constraint/i.test(collectionConfigErrorMessage({ code: '99999', message: 'violates something' })));

// ------------------------------------------------------------------------------------------------------------------ Operaciones con un repositorio en memoria
function memoryRepo(initial: CollectionConfigData, opts: { fail?: string } = {}) {
  const calls: { fn: string; args: unknown[] }[] = [];
  const reply = async <T>(fn: string, args: unknown[], data: T): Promise<RepoResult<T>> => { calls.push({ fn, args }); return opts.fail ? { ok: false, error: opts.fail } : { ok: true, data }; };
  const repo: CollectionConfigRepository = {
    async loadAll() { return { ok: true, data: JSON.parse(JSON.stringify(initial)) as CollectionConfigData }; },
    savePolicy: (p: CollectionPolicy) => reply('savePolicy', [p], 2),
    addReminder: (r: ReminderRequest) => reply('addReminder', [r], 'REC-001'),
    saveTemplate: (t: TemplateInput) => reply('saveTemplate', [t], 2),
  };
  return { repo, calls };
}
const EMPTY: CollectionConfigData = { policies: [], reminders: [], templates: [] };
const form = { graceDays: '3', moraMonthlyRatePct: '2', remindBefore: '3, 0', remindAfter: '1, 7, 15, 30' };
const stage = stagesOf(DEFAULT_POLICY).find(s => s.offset === 7)!;
const reminder = { key: reminderKey('PLN-001', 'C2', 7), planId: 'PLN-001', installmentId: 'C2', stage };

async function run() {
  const loaded = await loadCollectionConfig(memoryRepo({ policies: [pol(1)], reminders: [], templates: [v1] }).repo);
  check('Se leen de la base las versiones de la política, los recordatorios y las versiones de la plantilla', loaded.ok && loaded.value?.policies.length === 1 && loaded.value?.templates.length === 1);
  const brokenLoad = await loadCollectionConfig({ ...memoryRepo(EMPTY).repo, loadAll: async () => ({ ok: false, error: 'sin conexión' }) });
  check('Si la lectura falla se devuelve el motivo (el inicio de sesión ofrece reintentar)', !brokenLoad.ok && brokenLoad.error === 'sin conexión');

  // Política
  { const m = memoryRepo(EMPTY); const r = await savePolicyVersion(m.repo, { ...form, graceDays: '99' });
    check('Política: lo inválido se rechaza ANTES de llamar a la base', !r.ok && /días de gracia/.test(r.error ?? '') && m.calls.length === 0, JSON.stringify(r)); }
  { const m = memoryRepo(EMPTY); const r = await savePolicyVersion(m.repo, { ...form, remindBefore: '0, 3', remindAfter: '30, 1' });
    const sent = m.calls[0]?.args[0] as CollectionPolicy | undefined;
    check('Política: se manda interpretada (tasa en fracción y días en orden)', r.ok && m.calls.length === 1 && sent?.moraMonthlyRate === 0.02 && sent?.graceDays === 3 && sent?.remindBefore.join() === '3,0' && sent?.remindAfter.join() === '1,30', JSON.stringify(m.calls)); }
  { const r = await savePolicyVersion(memoryRepo(EMPTY, { fail: 'Su rol no tiene la función «Configurar políticas de cobranza».' }).repo, form);
    check('Política: si la base la rechaza se devuelve su motivo', !r.ok && /Configurar políticas de cobranza/.test(r.error ?? '')); }

  // Recordatorios
  { const m = memoryRepo(EMPTY); const r = await logReminderEntry(m.repo, [{ key: reminder.key }], reminder, 'WhatsApp', 'Enviado', '');
    check('Recordatorio: uno ya registrado se rechaza antes de llamar a la base', !r.ok && /ya fue registrado/.test(r.error ?? '') && m.calls.length === 0, JSON.stringify(r)); }
  { const m = memoryRepo(EMPTY); const r = await logReminderEntry(m.repo, [], reminder, 'Otro', 'Omitido', 'ya');
    check('Recordatorio: omitirlo pide un motivo (5 letras como mínimo)', !r.ok && /por qué se omite/.test(r.error ?? '') && m.calls.length === 0); }
  { const m = memoryRepo(EMPTY); const r = await logReminderEntry(m.repo, [], reminder, 'Paloma' as never, 'Enviado', '');
    check('Recordatorio: un canal que no existe se rechaza', !r.ok && /canal/i.test(r.error ?? '') && m.calls.length === 0); }
  { const m = memoryRepo(EMPTY); const r = await logReminderEntry(m.repo, [{ key: 'otro' }], reminder, 'Otro', 'Omitido', '  Ya pagó por transferencia  ');
    const sent = m.calls[0]?.args[0] as ReminderRequest | undefined;
    check('Recordatorio: se manda la cuota, la etapa, el canal, el resultado y la nota sin espacios sobrantes (quién, cuándo, sede y código los pone la base)',
      r.ok && sent?.planId === 'PLN-001' && sent?.installmentId === 'C2' && sent?.stageOffset === 7 && sent?.channel === 'Otro' && sent?.result === 'Omitido' && sent?.note === 'Ya pagó por transferencia' && !('by' in (sent ?? {})), JSON.stringify(m.calls)); }
  { const r = await logReminderEntry(memoryRepo(EMPTY, { fail: 'Este recordatorio ya fue registrado.' }).repo, [], reminder, 'WhatsApp', 'Enviado', '');
    check('Recordatorio: si otra persona lo registró a la vez, se devuelve el motivo de la base', !r.ok && /ya fue registrado/.test(r.error ?? '')); }

  // Plantilla
  const input = (over: Partial<TemplateInput> = {}): TemplateInput => ({ intro: v1.intro, clauses: v1.clauses, closing: v1.closing, reviewed: true, ...over });
  { const m = memoryRepo(EMPTY); const r = await saveContractTemplate(m.repo, v1, input({ clauses: [] }));
    check('Plantilla: sin cláusulas se rechaza antes de llamar a la base', !r.ok && /al menos una cláusula/.test(r.error ?? '') && m.calls.length === 0, JSON.stringify(r)); }
  { const m = memoryRepo(EMPTY); const r = await saveContractTemplate(m.repo, v1, input({ intro: `${v1.intro} {{campo_inventado}}` }));
    check('Plantilla: un campo que el contrato no sabe completar se rechaza', !r.ok && /campos que no existen/.test(r.error ?? '') && m.calls.length === 0, JSON.stringify(r)); }
  { const m = memoryRepo(EMPTY); const r = await saveContractTemplate(m.repo, v1, input());
    check('Plantilla: sin ningún cambio (mismo texto y misma marca) no se llama a la base', r.ok && m.calls.length === 0); }
  { const m = memoryRepo(EMPTY); const r = await saveContractTemplate(m.repo, v1, input({ reviewed: false }));
    check('Plantilla: solo cambiar la marca de «revisada» sí se guarda', r.ok && m.calls.length === 1 && (m.calls[0]!.args[0] as TemplateInput).reviewed === false); }
  { const m = memoryRepo(EMPTY); const r = await saveContractTemplate(m.repo, v1, input({ intro: `${v1.intro} Y algo más.`, reviewed: false }));
    check('Plantilla: un texto distinto se manda completo (la base decide la versión nueva)', r.ok && m.calls.length === 1 && /Y algo más/.test((m.calls[0]!.args[0] as TemplateInput).intro) && (m.calls[0]!.args[0] as TemplateInput).clauses.length === v1.clauses.length); }
  { const r = await saveContractTemplate(memoryRepo(EMPTY, { fail: 'Su rol no tiene la función «Editar las plantillas de contrato y ficha».' }).repo, v1, input({ reviewed: false }));
    check('Plantilla: si la base la rechaza se devuelve su motivo', !r.ok && /Editar las plantillas/.test(r.error ?? '')); }
}

// ------------------------------------------------------------------------------------------------------------------ La migración 0021
const sql = read('supabase/migrations/20261113190000_cobranza_y_plantilla_del_contrato.sql');
const down = read('supabase/deshacer/20261113190000_cobranza_y_plantilla_del_contrato.down.sql');
const code = sql.replace(/--[^\n]*/g, '');
check('Crea las tres tablas, con RLS y solo lectura para las cuentas (todo cambia por funciones)',
  ['cobranza_politicas', 'recordatorios_cobranza', 'plantilla_contrato_versiones'].every(t => new RegExp(`create table public\\.${t} \\(`).test(sql) && new RegExp(`alter table public\\.${t}\\s+enable row level security`).test(sql))
  && /revoke all on public\.cobranza_politicas, public\.recordatorios_cobranza, public\.plantilla_contrato_versiones from public, anon, authenticated;/.test(sql)
  && /grant select on public\.cobranza_politicas, public\.recordatorios_cobranza, public\.plantilla_contrato_versiones to authenticated;/.test(sql)
  && !/grant (insert|update|delete)/i.test(code));
check('La política y la plantilla se guardan por versiones y no se modifican; el recordatorio no se modifica ni se borra; ninguna se vacía',
  /create trigger politicas_no_cambian before update or delete on public\.cobranza_politicas/.test(sql) && /create trigger politicas_no_vaciar\s+before truncate on public\.cobranza_politicas/.test(sql)
  && /create trigger recordatorios_no_cambian before update or delete on public\.recordatorios_cobranza/.test(sql) && /create trigger recordatorios_no_vaciar\s+before truncate on public\.recordatorios_cobranza/.test(sql)
  && /create trigger plantilla_no_cambia before update or delete on public\.plantilla_contrato_versiones/.test(sql) && /create trigger plantilla_no_vaciar before truncate on public\.plantilla_contrato_versiones/.test(sql)
  && /\(to_jsonb\(old\) - 'revisada' - 'revisada_por' - 'revisada_en'\) is distinct from \(to_jsonb\(new\) - 'revisada' - 'revisada_por' - 'revisada_en'\)/.test(sql));
check('La clave de un recordatorio (plan + cuota + etapa) es única en toda la base y es la misma que arma el sistema (`reminderKey`)',
  /clave\s+text generated always as \(plan_id \|\| ':' \|\| cuota_id \|\| ':' \|\| desfase::text\) stored/.test(sql) && /create unique index recordatorios_clave_uq on public\.recordatorios_cobranza \(clave\)/.test(sql)
  && reminderKey('PLN-001', 'C2', -3) === 'PLN-001:C2:-3' && /v_clave := p_plan \|\| ':' \|\| p_cuota \|\| ':' \|\| p_desfase::text;/.test(sql));
check('Quien omite un recordatorio deja el motivo (5 letras como mínimo), en la tabla y en la función',
  /check \(resultado = 'Enviado' or length\(btrim\(coalesce\(nota, ''\)\)\) >= 5\)/.test(sql) && /if p_resultado = 'Omitido' and length\(v_nota\) < 5 then/.test(sql));

const used = [...code.matchAll(/app\.exigir\('([^']+)'/g)].map(m => m[1]!);
check('Cada función que pide la base existe en el registro y es la de la acción del sistema (configurar, recordar, plantilla y cobrar mora)',
  ['op-cobranza:config', 'op-cobranza:remind', 'cfg-plantillas:edit', 'op-cobranza:charge_mora'].every(id => used.includes(id) && !!capabilityById(id))
  && (capabilityById('op-cobranza:config') as { actions?: string[] }).actions?.includes('updateCollectionPolicy') === true
  && (capabilityById('op-cobranza:remind') as { actions?: string[] }).actions?.includes('logReminder') === true
  && (capabilityById('cfg-plantillas:edit') as { actions?: string[] }).actions?.includes('updateContractTemplate') === true
  && (capabilityById('op-cobranza:charge_mora') as { actions?: string[] }).actions?.includes('chargeMora') === true, used.join());
check('Cada función pública valida primero lo que pide el registro y después lo demás',
  /create function public\.guardar_politica_cobranza[^$]*\$\$\s*declare[^$]*begin\s+perform app\.exigir\('op-cobranza:config'/.test(sql)
  && /create function public\.registrar_recordatorio[^$]*\$\$\s*declare[^$]*begin\s+perform app\.exigir\('op-cobranza:remind'/.test(sql)
  && /create function public\.guardar_plantilla_contrato[^$]*\$\$\s*declare[^$]*begin\s+perform app\.exigir\('cfg-plantillas:edit'/.test(sql)
  && /create function app\.verificar_mora[^$]*\$\$\s*declare[^$]*begin\s+perform app\.exigir\('op-cobranza:charge_mora'/.test(sql));

const readers = (entity: string) => ALL_CAPABILITIES.filter(c => (c as { reads?: string[] }).reads?.includes(entity)).map(c => c.id).sort().join();
const listOf = (fn: string) => [...(sql.match(new RegExp(`create function app\\.${fn}\\(\\) returns boolean[\\s\\S]*?array\\[([^\\]]+)\\]`))?.[1] ?? '').matchAll(/'([^']+)'/g)].map(m => m[1]).sort().join();
check('Quién lee los recordatorios (y su sede) es lo mismo que dice el registro; la política y la plantilla las lee cualquier cuenta vigente',
  listOf('puede_leer_recordatorios') === readers('reminder') && readers('reminder') === 'op-cobranza:view'
  && /create policy recordatorios_leer on public\.recordatorios_cobranza for select to authenticated\s+using \(\(select app\.puede_leer_recordatorios\(\)\) and \(select app\.ve_sede\(sede_id\)\)\)/.test(sql)
  && /create policy politicas_leer on public\.cobranza_politicas for select to authenticated using \(\(select app\.acceso_vigente\(\)\)\)/.test(sql)
  && /create policy plantilla_leer on public\.plantilla_contrato_versiones for select to authenticated using \(\(select app\.acceso_vigente\(\)\)\)/.test(sql), `${listOf('puede_leer_recordatorios')} / ${readers('reminder')}`);

// La política de partida y los rangos de la base son los del sistema
check('La política de partida de la base (sin ninguna guardada) es la del sistema: 3 días de gracia, 0 % de mora, recordar 3 y 0 antes y 1, 7, 15 y 30 después',
  /select 0, 3, 0::numeric, array\[3, 0\], array\[1, 7, 15, 30\] where not exists/.test(sql) && DEFAULT_POLICY.graceDays === 3 && DEFAULT_POLICY.moraMonthlyRate === 0
  && DEFAULT_POLICY.remindBefore.join() === '3,0' && DEFAULT_POLICY.remindAfter.join() === '1,7,15,30');
const f = (over: Partial<typeof form>) => validatePolicy({ ...form, ...over }).length;
check('Los rangos de la política en la base son los de `validatePolicy` (gracia 0 a 60, mora 0 % a 10 %, antes 0 a 30, después 1 a 180)',
  f({ graceDays: '60' }) === 0 && f({ graceDays: '61' }) === 1 && f({ moraMonthlyRatePct: '10' }) === 0 && f({ moraMonthlyRatePct: '10.01' }) === 1 && f({ remindBefore: '30' }) === 0 && f({ remindBefore: '31' }) === 1
  && f({ remindAfter: '180' }) === 0 && f({ remindAfter: '181' }) === 1 && f({ remindAfter: '0' }) === 1
  && /p_dias_gracia > 60/.test(sql) && /p_tasa_mora > 0\.1/.test(sql) && /x < 0 or x > 30/.test(sql) && /x < 1 or x > 180/.test(sql) && /dias_gracia between 0 and 60/.test(sql) && /tasa_mora between 0 and 0\.1/.test(sql));
check('Los campos de la plantilla que la base reconoce son los mismos que completa el contrato (`TEMPLATE_TOKENS`)',
  (() => {
    const list = [...(sql.match(/v_campos constant text\[\] := array\[([^\]]+)\]/)?.[1] ?? '').matchAll(/'([^']+)'/g)].map(m => m[1]!).sort();
    return list.length === TEMPLATE_TOKENS.length && list.join() === TEMPLATE_TOKENS.map(t => t.token).sort().join();
  })());
check('La base exige del texto lo mismo que `validateTemplate`: introducción de 20 letras, al menos una cláusula, título y 10 letras de contenido',
  /length\(btrim\(v_intro\)\) < 20/.test(sql) && /jsonb_array_length\(p_clausulas\) = 0/.test(sql) && /length\(btrim\(coalesce\(v_c->>'body', ''\)\)\) < 10/.test(sql) && /length\(btrim\(coalesce\(v_c->>'title', ''\)\)\) = 0/.test(sql)
  && /length\(btrim\(introduccion\)\) >= 20/.test(sql));
check('Un cambio de texto es una versión nueva; si solo cambia la marca de revisada se anota en la vigente; sin cambios no se agrega nada (y hay un candado)',
  /v_version := v_ult\.version \+ 1;/.test(sql) && /elsif v_ult\.introduccion = v_intro and v_ult\.clausulas = v_claus and v_ult\.cierre = v_cierre then/.test(sql) && /update public\.plantilla_contrato_versiones v set revisada = p_revisada/.test(sql)
  && /pg_advisory_xact_lock\(hashtextextended\('ensil:plantilla_contrato', 0\)\)/.test(sql) && /pg_advisory_xact_lock\(hashtextextended\('ensil:cobranza_politicas', 0\)\)/.test(sql));
check('El código del recordatorio lo asigna la base con un candado hasta el final de la operación (sin repetidos), sin recortar al pasar de 999',
  /pg_advisory_xact_lock\(hashtextextended\('ensil:codigo:REC\|', 0\)\)/.test(sql) && /'REC-' \|\| app\.numero_con_relleno\(v_n, 3\)/.test(sql) && /id\s+text primary key check \(id ~ '\^REC-\[0-9\]\{3,\}\$'\)/.test(sql));
check('La etapa de un recordatorio debe ser de la política vigente y la cuota debe tener saldo por cobrar',
  /v_etapas := array\(select -x from unnest\(v_pol\.recordar_antes\) x where x > 0\)/.test(sql) && /not \(p_desfase = any \(v_etapas\)\)/.test(sql) && /v_cuota\.estado in \('Anulada', 'Refinanciada'\) or v_cuota\.saldo <= 0/.test(sql));
check('El recordatorio es de la sede de la matrícula y quien registra debe alcanzarla',
  /select m\.sede_id into v_sede from public\.planes pl join public\.matriculas m on m\.id = pl\.matricula_id where pl\.id = p_plan;/.test(sql) && /perform app\.exigir_sede\(v_sede, 'recordatorios de cobranza'\);/.test(sql));

// La base vigila la mora
check('La base vigila la mora: vuelve a calcular lo mismo que el sistema (`moraOf`) con la política guardada, con un margen de redondeo de un centavo',
  /v_origen\.saldo \* v_pol\.tasa_mora \* greatest\(0, v_dias - v_pol\.dias_gracia\) \/ 30/.test(sql) && /v_dias := case when v_origen\.vence is null or v_origen\.vence >= v_hoy then 0 else v_hoy - v_origen\.vence end;/.test(sql)
  && /v_nuevo > v_pend \+ 0\.011/.test(sql) && /round\(coalesce\(v_origen\.mora_cobrada, 0\), 2\)/.test(sql) && /if v_pol\.tasa_mora <= 0 then/.test(sql));
check('La vigilancia exige que lo cobrado como mora en la cuota de origen cuadre con las cuotas de mora, que la mora no genere mora y que la sede se alcance',
  /abs\(coalesce\(v_cobrada, 0\) - \(coalesce\(v_origen\.mora_cobrada, 0\) \+ v_nuevo\)\) > 0\.011/.test(sql) && /if v_origen\.es_mora then raise exception 'La mora no genera más mora\.'/.test(sql) && /perform app\.exigir_sede\(v_sede, 'la mora'\);/.test(sql));
check('La función pública del dinero pasa a ser una envoltura más: vigila solo la acción «mora», llama a la de la 0019 y no se pueden llamar de fuera las internas',
  /alter function public\.aplicar_cambios_matricula\(text, jsonb\) set schema app;/.test(sql) && /rename to aplicar_cambios_matricula_con_codigos;/.test(sql)
  && /if p_accion = 'mora' and jsonb_typeof\(p\) = 'object' then perform app\.verificar_mora\(p\); end if;\s+return app\.aplicar_cambios_matricula_con_codigos\(p_accion, p\);/.test(sql)
  && /revoke execute on function\s+app\.aplicar_cambios_matricula_con_codigos\(text, jsonb\), app\.verificar_mora\(jsonb\), app\.politica_cobranza_vigente\(\),[\s\S]*?from public, anon, authenticated;/.test(sql));
check('Las funciones públicas son de las cuentas con sesión y no se toca ningún otro permiso del esquema (no se reabre lo que cerraron la 0019 y la 0020)',
  /revoke execute on function\s+public\.guardar_politica_cobranza\(integer, numeric, integer\[\], integer\[\]\), public\.registrar_recordatorio\(text, text, integer, text, text, text\),\s+public\.guardar_plantilla_contrato\(text, jsonb, text, boolean\), public\.aplicar_cambios_matricula\(text, jsonb\)\s+from public, anon;/.test(sql)
  && /grant execute on function\s+public\.guardar_politica_cobranza[\s\S]*?to authenticated;/.test(sql) && !/on all functions in schema app/.test(code));
check('Un `raise` con un «%» literal lo escribe «%%» (si no, la función no compila): los dos avisos con «0 %» lo hacen',
  /entre 0 %% y 10 %% \(con hasta dos decimales\)/.test(sql) && /\(tasa 0 %%\)/.test(sql));
check('La migración se puede deshacer: quita las tres tablas y las funciones, y devuelve la envoltura de la 0019 a `public`',
  ['cobranza_politicas', 'recordatorios_cobranza', 'plantilla_contrato_versiones'].every(t => down.includes(`drop table if exists public.${t};`))
  && down.includes('drop function if exists public.aplicar_cambios_matricula(text, jsonb);') && down.includes('rename to aplicar_cambios_matricula;') && down.includes('app.aplicar_cambios_matricula(text, jsonb) set schema public;')
  && ['guardar_politica_cobranza', 'registrar_recordatorio', 'guardar_plantilla_contrato'].every(fn => down.includes(`drop function if exists public.${fn}(`)));

// ------------------------------------------------------------------------------------------------------------------ Cableado
const gate = read('src/components/auth/AccessGate.tsx');
const ctxSrc = read('src/context/DataContext.tsx');
const repoSrc = read('src/services/collectionConfigRepository.ts');
const hook = read('src/hooks/useCollectionConfig.ts');
check('La política, los recordatorios y la plantilla se leen al iniciar sesión (antes de montar el sistema), junto con lo demás',
  /loadCollectionConfig\(collectionRepo\)/.test(gate) && /loaded\.cashBoxes, loaded\.collection, loaded\.agenda\)/.test(gate) && /collection=\{collection\}/.test(read('src/App.tsx')) && /collection: collectionData/.test(ctxSrc) && /useCollectionConfig\(collectionData\)/.test(ctxSrc));
check('El repositorio de Supabase llama a las tres funciones de la base y lee las tres tablas',
  ["'guardar_politica_cobranza'", "'registrar_recordatorio'", "'guardar_plantilla_contrato'"].every(fn => repoSrc.includes(fn)) && ["'cobranza_politicas'", "'recordatorios_cobranza'", "'plantilla_contrato_versiones'"].every(t => repoSrc.includes(t))
  && /p_clausulas: t\.clauses\.map\(c => \(\{ id: c\.id, title: c\.title, body: c\.body \}\)\)/.test(repoSrc));
check('El gancho arranca con lo ya leído, valida contra lo último que se vio y vuelve a leer después de cada operación',
  /useCollectionConfig\(initial: CollectionConfigData/.test(hook) && /useState<PolicyVersion\[\]>\(initial\.policies\)/.test(hook) && /remindersRef\.current = reminders/.test(hook) && /if \(res\.ok\) await refresh\(\)/.test(hook) && !/useEffect/.test(hook));
check('Las acciones son asíncronas y devuelven { ok, error } (ya no lanzan error al negar el permiso)',
  /updateCollectionPolicy: \(input: PolicyForm\) => Promise<StockResult>/.test(ctxSrc) && /logReminder: \([^)]*\) => Promise<StockResult>/.test(ctxSrc) && /updateContractTemplate: \([^)]*\) => Promise<StockResult>/.test(ctxSrc)
  && !['updateCollectionPolicy', 'logReminder', 'updateContractTemplate'].some(a => THROWS_ON_DENIAL.has(a)));
check('El contexto ya no guarda estas tres cosas en memoria ni inventa el código del recordatorio con lo que ve la pantalla',
  !/setCollectionPolicy|setReminderLogs|setContractTemplate|DEFAULT_POLICY/.test(ctxSrc) && !/nextSequentialId\('REC'/.test(ctxSrc));
check('Un contrato nuevo, o uno que se vuelve a generar, usa la plantilla vigente; uno ya generado se arma con su versión; un documento al día no se vuelve a generar',
  /templateForIssued\(contractTemplates, enrollment\.documents\?\.contract, contractTemplate\)/.test(ctxSrc) && /options\?\.currentTemplate \? contractTemplate/.test(ctxSrc)
  && /documentContextOf\(enrollmentId, \{ currentTemplate: true \}\)/.test(ctxSrc) && /=== 'vigente'\) return \{ ok: true \}/.test(ctxSrc) && /issueDocument\(kind, existing, built, currentUser\.name, new Date\(\)\.toISOString\(\), ctx\.template\.version\)/.test(ctxSrc));
const screens = {
  policy: read('src/pages/settings/CollectionsConfig.tsx'), template: read('src/pages/settings/DocumentTemplatesConfig.tsx'), reminders: read('src/components/collections/RemindersPanel.tsx'),
  docs: read('src/components/enrollment/EnrollmentDocumentsPanel.tsx'),
};
check('Las pantallas esperan la respuesta de la base antes de seguir y apagan el botón mientras guardan',
  /await updateCollectionPolicy\(form\)/.test(screens.policy) && /disabled=\{problems\.length > 0 \|\| saving\}/.test(screens.policy) && /can\(PERM\.configCollections\)/.test(screens.policy)
  && /await updateContractTemplate\(/.test(screens.template) && /\|\| saving\}/.test(screens.template) && /await logReminder\(r, channel, 'Enviado', ''\)/.test(screens.reminders) && /await logReminder\(skipping, 'Otro', 'Omitido', detail\)/.test(screens.reminders)
  && /const mayRemind = can\(PERM\.sendReminders\) && !saving;/.test(screens.reminders));
check('La política muestra su historial (quién y cuándo) y el aviso de la plantilla sin revisar es el de la versión que se va a usar',
  /collectionPolicyVersions\.slice\(0, 10\)/.test(screens.policy) && /!ctx\.template\.reviewed/.test(screens.docs) && /data\.contractTemplates\]\)/.test(screens.docs));

run().then(() => {
  if (failed > 0) {
    console.log(`\n${failed} comprobaciones fallaron.`);
    process.exit(1);
  }
  console.log('\nTodo en verde.');
});
