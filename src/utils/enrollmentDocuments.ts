/**
 * Contrato y ficha de la matrícula (funciones puras).
 *
 *  - Los documentos se ARMAN con los datos de la matrícula (alumno, titular, programa, precio, plan, sede, empresa, vigencia);
 *    nada se digita dos veces. El contrato sale de una plantilla con campos entre llaves dobles (`{{alumno}}`) que se edita en
 *    Configuración → Plantillas de documentos.
 *  - Antes de generar el contrato se comprueba que existan los datos que lo hacen válido (titular con documento y dirección,
 *    mayoría de edad si el alumno es su propio titular, empresa de la sede con RUC, plan de pagos). Si falta algo, se dice qué.
 *  - Cada documento generado tiene NÚMERO (CTR-2026-001 / FIC-2026-001) y VERSIÓN. Si los datos cambian después (precio,
 *    cuotas, titular…) el documento queda «desactualizado»: se vuelve a generar (versión siguiente) y hay que firmarlo de nuevo.
 *  - La firma se registra con la fecha y el nombre del archivo escaneado (el sistema aún no guarda archivos).
 *  - La plantilla de contrato que trae el sistema es un TEXTO MODELO: debe revisarla el área legal y marcarse como revisada.
 */
import type {
  Branch, Company, ContractClause, ContractTemplate, Enrollment, EnrollmentDocuments, Guardian, IssuedDocument, Level, Plan, Program, Schedule, Student,
} from '../context/DataContext';
import { nextSequentialId } from './ids';
import { escapeHtml } from './printTable';
import { installmentDueISO } from './enrollmentDrop';
import { formatDisplayDate } from './tariffs';
import type { Validity } from './validity';

export type DocKind = 'contract' | 'ficha';
export const DOC_LABEL: Record<DocKind, string> = { contract: 'Contrato de servicios educativos', ficha: 'Ficha de matrícula' };
export const DOC_PREFIX: Record<DocKind, string> = { contract: 'CTR', ficha: 'FIC' };

const MONTHS_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const longDate = (iso: string): string => {
  const [y, m, d] = iso.split('-').map(Number);
  return y ? `${d} de ${MONTHS_LONG[m - 1]} de ${y}` : '';
};
const usd = (n: number) => `USD ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const months = (n: number) => `${n} ${n === 1 ? 'mes' : 'meses'}`;

// ---------------------------------------------------------------- Plantilla

export const TEMPLATE_TOKENS: { token: string; description: string }[] = [
  { token: 'empresa', description: 'Razón social de la empresa de la sede' },
  { token: 'ruc', description: 'RUC de la empresa' },
  { token: 'sede', description: 'Nombre de la sede' },
  { token: 'direccion_sede', description: 'Dirección de la sede' },
  { token: 'ciudad', description: 'Ciudad (distrito de la sede)' },
  { token: 'contratante', description: 'Nombre del titular (o del alumno si es independiente)' },
  { token: 'contratante_doc', description: 'Documento del contratante' },
  { token: 'contratante_direccion', description: 'Dirección del contratante' },
  { token: 'calidad', description: 'Parentesco o calidad del contratante (padre, apoderado, el propio alumno…)' },
  { token: 'alumno', description: 'Nombre del alumno' },
  { token: 'alumno_doc', description: 'Documento del alumno' },
  { token: 'programa', description: 'Programa y nivel' },
  { token: 'duracion', description: 'Duración base del programa' },
  { token: 'garantia', description: 'Período de garantía o extensión' },
  { token: 'inicio', description: 'Fecha de la primera asesoría (inicio de la vigencia)' },
  { token: 'fin_base', description: 'Último día de la duración base' },
  { token: 'fin_extension', description: 'Último día con la extensión' },
  { token: 'horario', description: 'Horario de clases del alumno' },
  { token: 'precio', description: 'Precio total asignado' },
  { token: 'tipo_pago', description: 'Tipo de pago contratado' },
  { token: 'plan_pagos', description: 'Resumen del cronograma de pagos' },
  { token: 'fecha_matricula', description: 'Fecha de la matrícula' },
  { token: 'fecha_contrato', description: 'Fecha de emisión del contrato' },
  { token: 'matricula', description: 'Código de la matrícula' },
];

export const DEFAULT_CONTRACT_TEMPLATE: ContractTemplate = {
  version: 1,
  reviewed: false,
  intro: 'Conste por el presente documento el contrato de prestación de servicios educativos que celebran, de una parte, {{empresa}}, con RUC {{ruc}}, con domicilio en {{direccion_sede}} ({{sede}}), a quien en adelante se le denominará EL INSTITUTO; y de la otra parte {{contratante}}, identificado(a) con {{contratante_doc}}, con domicilio en {{contratante_direccion}}, en calidad de {{calidad}}, a quien en adelante se le denominará EL CONTRATANTE, respecto del alumno {{alumno}} ({{alumno_doc}}), bajo los términos siguientes:',
  clauses: [
    { id: 'objeto', title: 'Primera: objeto', body: 'EL INSTITUTO se obliga a prestar al alumno {{alumno}} el servicio educativo del programa {{programa}}, registrado con la matrícula {{matricula}} de fecha {{fecha_matricula}}.' },
    { id: 'duracion', title: 'Segunda: duración y garantía', body: 'La duración del programa es de {{duracion}}, contada desde la primera asesoría ({{inicio}}), hasta el {{fin_base}}. {{garantia}} El horario de clases acordado es: {{horario}}.' },
    { id: 'precio', title: 'Tercera: precio y forma de pago', body: 'El precio total del servicio es {{precio}}, bajo la modalidad «{{tipo_pago}}»: {{plan_pagos}}. El detalle del cronograma se encuentra en el anexo de este contrato. Los pagos realizados en soles se convierten con el tipo de cambio del día del pago.' },
    { id: 'mora', title: 'Cuarta: incumplimiento de pago', body: 'El retraso en el pago de una cuota genera la mora y los recordatorios previstos por EL INSTITUTO. Los términos de intereses y de suspensión del servicio por falta de pago los define EL INSTITUTO en su política de cobranza vigente.' },
    { id: 'retiro', title: 'Quinta: retiro del alumno', body: 'Si el alumno deja de asistir, EL CONTRATANTE puede solicitar la caída de la matrícula. La caída anula las cuotas futuras no vencidas; las cuotas ya vencidas y los montos pagados se tratan según la política de EL INSTITUTO. El alumno puede reactivar su matrícula dentro del plazo que EL INSTITUTO establezca.' },
    { id: 'datos', title: 'Sexta: datos personales', body: 'EL CONTRATANTE autoriza el tratamiento de los datos personales suyos y del alumno para la gestión del servicio educativo, conforme a la Ley N.° 29733 de Protección de Datos Personales.' },
  ],
  closing: 'En señal de conformidad, las partes firman este documento en {{ciudad}}, el {{fecha_contrato}}.',
};

export function renderTemplateText(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_m, key: string) => (key in vars ? vars[key] : `{{${key}}}`));
}

/** Campos de la plantilla que no existen (para avisar al editarla). */
export function unknownTokens(text: string): string[] {
  const known = new Set(TEMPLATE_TOKENS.map(t => t.token));
  return [...new Set([...text.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)].map(m => m[1]).filter(k => !known.has(k)))];
}

export function validateTemplate(t: ContractTemplate): string[] {
  const e: string[] = [];
  if (t.intro.trim().length < 20) e.push('La introducción del contrato es demasiado corta.');
  if (t.clauses.length === 0) e.push('El contrato necesita al menos una cláusula.');
  t.clauses.forEach((c, i) => {
    if (!c.title.trim()) e.push(`La cláusula ${i + 1} no tiene título.`);
    if (c.body.trim().length < 10) e.push(`La cláusula ${i + 1} no tiene contenido.`);
  });
  const unknown = unknownTokens([t.intro, t.closing, ...t.clauses.map(c => c.body)].join(' '));
  if (unknown.length > 0) e.push(`La plantilla usa campos que no existen: ${unknown.map(u => `{{${u}}}`).join(', ')}.`);
  return e;
}

// ---------------------------------------------------------------- Documento

export interface DocContext {
  enrollment: Enrollment;
  student?: Student;
  guardians: Guardian[];
  program?: Program;
  level?: Level;
  plan?: Plan;
  branch?: Branch;
  company?: Company;
  firstSession?: Schedule;
  validity: Validity;
  template: ContractTemplate;
  today: string;
}

export interface DocSection {
  title: string;
  rows?: [string, string][];
  paragraphs?: string[];
  table?: { headers: string[]; rows: string[][] };
}

export interface BuiltDocument {
  kind: DocKind;
  title: string;
  subtitle: string;
  sections: DocSection[];
  signatures: { role: string; name: string; doc: string }[];
  fingerprint: string;
}

export const hashString = (s: string): string => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16).padStart(8, '0');
};

const studentDocText = (s?: Student) => (s ? `${s.docType ?? 'DNI'} N.° ${s.doc}` : '—');
const guardianDocText = (g: Guardian) => `${g.docType ?? 'DNI'} N.° ${g.doc}`;

/** Contratante: el primer titular, o el propio alumno si es independiente. */
export function contractor(ctx: Pick<DocContext, 'guardians' | 'student'>): { name: string; doc: string; address: string; capacity: string; independent: boolean; phone: string } | undefined {
  const g = ctx.guardians[0];
  if (g) return { name: g.name, doc: guardianDocText(g), address: g.direccion ?? '', capacity: g.parentesco ? g.parentesco.toLowerCase() : 'apoderado', independent: false, phone: g.phone };
  const s = ctx.student;
  if (!s) return undefined;
  return { name: s.name, doc: studentDocText(s), address: s.address ?? '', capacity: 'el propio alumno', independent: true, phone: s.phone ?? '' };
}

/** Qué falta para poder generar el documento (vacío = se puede). */
export function documentProblems(kind: DocKind, ctx: DocContext): string[] {
  const out: string[] = [];
  if (!ctx.student) out.push('No se encontró al alumno de la matrícula.');
  if (kind === 'ficha') return out;
  if (ctx.enrollment.status !== 'Activa') out.push(`El contrato se genera para matrículas activas (esta está ${ctx.enrollment.status.toLowerCase()}).`);
  if (!ctx.program) out.push('No se encontró el programa de la matrícula.');
  if (!ctx.plan) out.push('La matrícula no tiene plan de pagos.');
  const c = contractor(ctx);
  if (!c) out.push('No hay contratante: la matrícula no tiene titular ni alumno.');
  else {
    if (!c.address.trim()) out.push(`Falta la dirección ${c.independent ? 'del alumno' : 'del titular'} (${c.name}): complétela en Personas.`);
    if (c.independent && (ctx.student?.age ?? 0) < 18) out.push('El alumno es menor de edad y no tiene titular: vincule a su apoderado en Personas → Alumnos.');
  }
  if (!ctx.branch) out.push('No se encontró la sede de la matrícula.');
  if (!ctx.company) out.push(`No se encontró la empresa de la sede${ctx.branch ? ` (${ctx.branch.company})` : ''}: registre su razón social y RUC en Organización → Empresas.`);
  else if (!ctx.company.ruc?.trim()) out.push(`La empresa ${ctx.company.name} no tiene RUC registrado.`);
  return out;
}

const planRows = (plan?: Plan): string[][] =>
  (plan?.installments ?? []).filter(i => !['Anulada', 'Refinanciada'].includes(i.status) || i.amount > 0)
    .map(i => [i.name, i.dueDate || formatDisplayDate(installmentDueISO(i)), usd(i.amount), i.status === 'Anulada' ? 'Anulada' : i.status === 'Refinanciada' ? 'Refinanciada' : i.balance <= 0 ? 'Pagada' : i.balance < i.amount ? 'Parcial' : 'Pendiente']);

export function planSummary(plan: Plan | undefined, tipo: string): string {
  if (!plan) return 'sin plan de pagos';
  const live = plan.installments.filter(i => !['Anulada', 'Refinanciada'].includes(i.status));
  if (live.length === 0) return 'pago único al contado';
  return `${live.length} ${live.length === 1 ? 'pago' : 'pagos'} (${tipo}): ${live.map(i => `${usd(i.amount)} el ${i.dueDate || formatDisplayDate(installmentDueISO(i))}`).join('; ')}`;
}

export function templateVars(ctx: DocContext): Record<string, string> {
  const { enrollment: e, student, program, plan, branch, company, validity: v } = ctx;
  const c = contractor(ctx);
  const warrantyMonths = program?.warranty ?? 0;
  const label = e.level && e.level !== 'Sin nivel' ? `${e.program} - ${e.level}` : e.program;
  return {
    empresa: company?.name ?? '________', ruc: company?.ruc ?? '________', sede: branch?.name ?? e.sede ?? '________',
    direccion_sede: branch ? [branch.address, branch.district].filter(Boolean).join(', ') : '________', ciudad: branch?.district || branch?.province || branch?.name || '________',
    contratante: c?.name ?? '________', contratante_doc: c?.doc ?? '________', contratante_direccion: c?.address || '________', calidad: c?.capacity ?? '________',
    alumno: student?.name ?? e.student, alumno_doc: studentDocText(student), programa: label,
    duracion: months(program?.durationBase ?? 0),
    garantia: warrantyMonths > 0 ? `El programa incluye una garantía de ${months(warrantyMonths)} adicionales (extensión), que se habilita a solicitud cuando la duración base está por terminar o ya terminó${v.extensionEnd ? `, hasta el ${longDate(v.extensionEnd)}` : ''}.` : 'El programa no incluye período de extensión.',
    inicio: v.start ? longDate(v.start) : 'fecha por definir (primera asesoría)', fin_base: v.baseEnd ? longDate(v.baseEnd) : 'fecha por definir', fin_extension: v.extensionEnd ? longDate(v.extensionEnd) : 'fecha por definir',
    horario: student?.horario || 'por definir', precio: usd(e.assignedPrice ?? plan?.total ?? 0), tipo_pago: e.paymentTypeName ?? plan?.type ?? '—',
    plan_pagos: planSummary(plan, e.paymentTypeName ?? plan?.type ?? ''), fecha_matricula: e.dateISO ? longDate(e.dateISO) : e.date, fecha_contrato: longDate(ctx.today), matricula: e.id,
  };
}

export function buildContractDocument(ctx: DocContext): BuiltDocument {
  const vars = templateVars(ctx);
  const t = ctx.template;
  const c = contractor(ctx);
  const sections: DocSection[] = [
    { title: '', paragraphs: [renderTemplateText(t.intro, vars)] },
    ...t.clauses.map(cl => ({ title: cl.title, paragraphs: [renderTemplateText(cl.body, vars)] })),
    { title: 'Anexo: cronograma de pagos', table: { headers: ['Cuota', 'Vence', 'Monto', 'Estado'], rows: planRows(ctx.plan) } },
    { title: '', paragraphs: [renderTemplateText(t.closing, vars)] },
  ];
  const doc: Omit<BuiltDocument, 'fingerprint'> = {
    kind: 'contract', title: DOC_LABEL.contract, subtitle: `Matrícula ${ctx.enrollment.id} · ${vars.alumno}`, sections,
    signatures: [
      { role: 'EL CONTRATANTE', name: c?.name ?? '', doc: c?.doc ?? '' },
      { role: 'EL INSTITUTO', name: vars.empresa, doc: `RUC ${vars.ruc}` },
    ],
  };
  return { ...doc, fingerprint: hashString(JSON.stringify([doc.sections, doc.signatures, t.version])) };
}

export function buildFichaDocument(ctx: DocContext): BuiltDocument {
  const { enrollment: e, student, guardians, plan, branch, firstSession, validity: v } = ctx;
  const sections: DocSection[] = [
    { title: 'Datos de la matrícula', rows: [
      ['Código', e.id], ['Fecha', e.dateISO ? longDate(e.dateISO) : e.date], ['Sede', branch?.name ?? e.sede ?? '—'],
      ['Responsable de la entrevista', e.asesor ?? '—'], ['Origen del contacto', e.origen ?? '—'], ['Registrada por', e.createdBy ?? '—'],
    ] },
    { title: 'Alumno', rows: [
      ['Nombre', student?.name ?? e.student], ['Documento', studentDocText(student)], ['Edad', student ? `${student.age} años` : '—'], ['Nacimiento', student?.birthDate ?? '—'],
      ['Institución / grado', [student?.colegio, student?.grado].filter(Boolean).join(' · ') || '—'], ['Horario de clases', student?.horario ?? '—'],
      ['Teléfono', student?.phone || '—'], ['Dirección', student?.address || '—'],
    ] },
    { title: guardians.length > 1 ? 'Titulares' : 'Titular', rows: guardians.length === 0
      ? [['Titular', student && (!student.guardianIds || student.guardianIds.length === 0) ? 'El propio alumno (independiente)' : '—']]
      : guardians.flatMap((g, i) => [[`${i === 0 ? 'Principal' : 'Titular ' + (i + 1)}`, `${g.name} · ${guardianDocText(g)}`], ['Contacto', `${g.phone}${g.email ? ` · ${g.email}` : ''}`], ['Dirección', g.direccion || '—']] as [string, string][]) },
    { title: 'Programa y precio', rows: [
      ['Programa', e.program], ['Nivel', e.level ?? '—'], ['Tarifario', e.tariffName ?? '—'], ['Tipo de pago', e.paymentTypeName ?? plan?.type ?? '—'], ['Precio asignado', usd(e.assignedPrice ?? plan?.total ?? 0)],
      ['Primera asesoría', firstSession ? `${longDate(firstSession.date)} · ${firstSession.time} · ${firstSession.responsible}` : 'Sin programar'],
      ['Vigencia', v.start ? `${longDate(v.start)} al ${longDate(v.baseEnd ?? v.start)}${v.extensionEnd ? ` (con extensión hasta ${longDate(v.extensionEnd)})` : ''}` : 'Empieza con la primera asesoría'],
    ] },
    { title: 'Plan de pagos', table: { headers: ['Cuota', 'Vence', 'Monto', 'Estado'], rows: planRows(plan) } },
  ];
  if (e.observation) sections.push({ title: 'Observaciones', paragraphs: [e.observation] });
  const c = contractor(ctx);
  const doc: Omit<BuiltDocument, 'fingerprint'> = {
    kind: 'ficha', title: DOC_LABEL.ficha, subtitle: `${e.id} · ${student?.name ?? e.student}`, sections,
    signatures: [{ role: c?.independent ? 'EL ALUMNO' : 'EL TITULAR', name: c?.name ?? '', doc: c?.doc ?? '' }],
  };
  return { ...doc, fingerprint: hashString(JSON.stringify([doc.sections, doc.signatures])) };
}

export const buildDocument = (kind: DocKind, ctx: DocContext): BuiltDocument => (kind === 'contract' ? buildContractDocument(ctx) : buildFichaDocument(ctx));

// ---------------------------------------------------------------- Emisión, versión y firma

export type DocState = 'sin-generar' | 'vigente' | 'desactualizado';
export const docState = (issued: IssuedDocument | undefined, fingerprint: string): DocState => (!issued ? 'sin-generar' : issued.fingerprint === fingerprint ? 'vigente' : 'desactualizado');

/** Documento a guardar al generar: si no cambió nada se conserva; si cambió, número igual y versión siguiente (sin firma). */
export function issueDocument(
  kind: DocKind, existing: IssuedDocument | undefined, built: BuiltDocument, by: string, at: string, allNumbers: string[]
): IssuedDocument {
  if (existing && existing.fingerprint === built.fingerprint) return existing;
  const year = parseInt(at.slice(0, 4), 10);
  return {
    number: existing?.number ?? nextSequentialId(DOC_PREFIX[kind], allNumbers, { year }),
    version: existing ? existing.version + 1 : 1,
    generatedAt: at,
    generatedBy: by,
    fingerprint: built.fingerprint,
  };
}

export const issuedNumbers = (enrollments: Pick<Enrollment, 'documents'>[], kind: DocKind): string[] =>
  enrollments.map(e => e.documents?.[kind]?.number).filter((n): n is string => !!n);

export function validateSignature(issued: IssuedDocument | undefined, state: DocState, input: { date: string; file: string }, today: string): string[] {
  const e: string[] = [];
  if (!issued) return ['Genere el documento antes de registrar la firma.'];
  if (state === 'desactualizado') e.push('El documento está desactualizado: vuélvalo a generar y haga firmar la versión nueva.');
  if (issued.signedAt) e.push('Este documento ya tiene su firma registrada.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) e.push('Indique la fecha de la firma.');
  else {
    if (input.date > today) e.push('La fecha de la firma no puede ser futura.');
    if (input.date < issued.generatedAt.slice(0, 10)) e.push('La firma no puede ser anterior a la fecha en que se generó el documento.');
  }
  if (!input.file.trim()) e.push('Indique el archivo del documento firmado (escaneo o foto).');
  return e;
}

/** Estado documental de la matrícula para alertas: ¿falta generar o firmar el contrato? */
export function documentAlert(e: Pick<Enrollment, 'documents' | 'status'>, contractFingerprint?: string): 'sin-contrato' | 'sin-firma' | 'desactualizado' | null {
  if (e.status !== 'Activa') return null;
  const c = e.documents?.contract;
  if (!c) return 'sin-contrato';
  if (contractFingerprint && c.fingerprint !== contractFingerprint) return 'desactualizado';
  return c.signedAt ? null : 'sin-firma';
}

export function documentSet(docs: EnrollmentDocuments | undefined, kind: DocKind, issued: IssuedDocument): EnrollmentDocuments {
  return { ...(docs ?? {}), [kind]: issued };
}

// ---------------------------------------------------------------- HTML para imprimir

export function documentHtml(doc: BuiltDocument, issued?: IssuedDocument): string {
  const body = doc.sections.map(s => {
    const parts: string[] = [];
    if (s.title) parts.push(`<h2>${escapeHtml(s.title)}</h2>`);
    if (s.rows) parts.push(`<table class="kv">${s.rows.map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`).join('')}</table>`);
    (s.paragraphs ?? []).forEach(p => parts.push(`<p>${escapeHtml(p)}</p>`));
    if (s.table) parts.push(`<table class="grid"><thead><tr>${s.table.headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${s.table.rows.map(r => `<tr>${r.map(c => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
    return parts.join('');
  }).join('');
  const signatures = `<div class="sign">${doc.signatures.map(s => `<div><div class="line"></div><strong>${escapeHtml(s.role)}</strong><br>${escapeHtml(s.name)}<br>${escapeHtml(s.doc)}</div>`).join('')}</div>`;
  const meta = issued ? `${issued.number} · versión ${issued.version} · generado el ${issued.generatedAt.slice(0, 10)} por ${issued.generatedBy}` : 'Vista previa (aún no generado)';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapeHtml(doc.title)}</title><style>
    body{font-family:Georgia,'Times New Roman',serif;color:#1c1c1e;margin:28px;font-size:13px;line-height:1.5}
    h1{font-size:18px;text-align:center;margin:0 0 2px;text-transform:uppercase;letter-spacing:.04em} .sub{text-align:center;color:#555;margin:0 0 4px} .meta{text-align:center;color:#777;font-size:11px;margin:0 0 18px}
    h2{font-size:13px;margin:16px 0 4px;text-transform:uppercase} p{margin:0 0 8px;text-align:justify}
    table{border-collapse:collapse;width:100%;margin:4px 0 8px;font-size:12px} .kv th{text-align:left;width:32%;color:#555;font-weight:normal;padding:3px 6px;border-bottom:1px solid #e5e5e8} .kv td{padding:3px 6px;border-bottom:1px solid #e5e5e8}
    .grid th,.grid td{border:1px solid #cfcfd4;padding:4px 6px;text-align:left} .grid th{background:#f3f3f5}
    .sign{display:flex;gap:48px;margin-top:64px} .sign>div{flex:1;text-align:center;font-size:12px} .line{border-top:1px solid #1c1c1e;margin-bottom:4px}
    @media print{body{margin:10mm}}
  </style></head><body><h1>${escapeHtml(doc.title)}</h1><p class="sub">${escapeHtml(doc.subtitle)}</p><p class="meta">${escapeHtml(meta)}</p>${body}${signatures}</body></html>`;
}
