import React, { useEffect, useState } from 'react';
import { AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { useData, type ContractClause } from '../../context/DataContext';
import { DEFAULT_CONTRACT_TEMPLATE, TEMPLATE_TOKENS, validateTemplate } from '../../utils/enrollmentDocuments';

const areaCls = 'w-full bg-surface border border-border-soft rounded-xl p-3 text-sm focus:outline-none focus:border-primary-accent resize-y';

/** Configuración → Plantillas de documentos: texto del contrato de servicios educativos (con campos entre llaves dobles). */
export function DocumentTemplatesConfig() {
  const { contractTemplate, updateContractTemplate } = useData();
  const [intro, setIntro] = useState(contractTemplate.intro);
  const [closing, setClosing] = useState(contractTemplate.closing);
  const [clauses, setClauses] = useState<ContractClause[]>(contractTemplate.clauses);
  const [reviewed, setReviewed] = useState(contractTemplate.reviewed);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    setIntro(contractTemplate.intro); setClosing(contractTemplate.closing); setClauses(contractTemplate.clauses); setReviewed(contractTemplate.reviewed);
  }, [contractTemplate]);

  const dirty = JSON.stringify([intro, closing, clauses]) !== JSON.stringify([contractTemplate.intro, contractTemplate.closing, contractTemplate.clauses]);
  const problems = validateTemplate({ version: contractTemplate.version, reviewed, intro, clauses, closing });
  const edit = (fn: () => void) => { fn(); setReviewed(false); setMessage(null); };

  const save = () => {
    const r = updateContractTemplate({ reviewed, intro, clauses, closing });
    setMessage(r.ok ? { ok: true, text: 'Plantilla guardada. Los contratos ya generados no cambian hasta que se regeneren.' } : { ok: false, text: r.error ?? 'No se pudo guardar.' });
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-text-primary">Plantillas de documentos</h2>
        <p className="text-sm text-text-secondary">Texto del contrato de servicios educativos. La ficha de matrícula usa un formato fijo con los datos de la matrícula.</p>
      </div>

      <div className="flex gap-2 text-sm bg-warning-tint/60 border border-warning-text/20 rounded-xl px-4 py-3 text-text-primary">
        <AlertTriangle size={16} className="shrink-0 mt-0.5 text-warning-text" />
        <p>El texto que trae el sistema es un <strong>modelo</strong>, no asesoría legal. Debe ser revisado por el área legal de la institución antes de usarlo con clientes. Cada vez que se cambia el texto, la marca de «revisada» se quita.</p>
      </div>

      <section className="space-y-2">
        <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider">Campos que se completan solos</h3>
        <div className="flex flex-wrap gap-1.5">
          {TEMPLATE_TOKENS.map(t => <span key={t.token} title={t.description} className="font-mono text-xs bg-surface-muted border border-border-soft rounded-md px-2 py-0.5 cursor-help">{`{{${t.token}}}`}</span>)}
        </div>
        <p className="text-xs text-text-muted">Pase el cursor sobre un campo para ver qué dato pone. Se escriben tal cual, con dos llaves a cada lado.</p>
      </section>

      <section className="space-y-2">
        <label className="text-sm font-medium text-text-secondary">Introducción (partes del contrato)</label>
        <textarea className={`${areaCls} h-32`} value={intro} onChange={e => edit(() => setIntro(e.target.value))} />
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider">Cláusulas</h3>
          <Button variant="secondary" size="sm" className="gap-1" onClick={() => edit(() => setClauses(c => [...c, { id: `c${Date.now()}`, title: `Cláusula ${c.length + 1}`, body: '' }]))}><Plus size={14} /> Agregar cláusula</Button>
        </div>
        {clauses.map((c, i) => (
          <div key={c.id} className="border border-border-soft rounded-xl p-3 space-y-2">
            <div className="flex gap-2">
              <input className="flex-1 h-9 bg-surface border border-border-soft rounded-lg px-3 text-sm font-medium focus:outline-none focus:border-primary-accent" value={c.title} onChange={e => edit(() => setClauses(list => list.map((x, k) => (k === i ? { ...x, title: e.target.value } : x))))} />
              <Button variant="ghost" size="sm" aria-label="Quitar cláusula" onClick={() => edit(() => setClauses(list => list.filter((_, k) => k !== i)))}><Trash2 size={14} /></Button>
            </div>
            <textarea className={`${areaCls} h-24`} value={c.body} onChange={e => edit(() => setClauses(list => list.map((x, k) => (k === i ? { ...x, body: e.target.value } : x))))} />
          </div>
        ))}
      </section>

      <section className="space-y-2">
        <label className="text-sm font-medium text-text-secondary">Cierre y firma</label>
        <textarea className={`${areaCls} h-20`} value={closing} onChange={e => edit(() => setClosing(e.target.value))} />
      </section>

      <label className="flex items-start gap-3 p-3 border border-border-soft rounded-xl cursor-pointer hover:bg-surface-muted">
        <input type="checkbox" className="mt-0.5 w-4 h-4" checked={reviewed} onChange={e => { setReviewed(e.target.checked); setMessage(null); }} />
        <span className="text-sm"><span className="font-medium text-text-primary">Revisada por el área legal</span><span className="block text-text-secondary">Marque solo cuando legal haya aprobado este texto. Quita la advertencia de los contratos.</span></span>
      </label>

      {problems.length > 0 && <ul className="text-sm text-danger-text list-disc pl-5">{problems.map(p => <li key={p}>{p}</li>)}</ul>}
      {message && <p className={`text-sm ${message.ok ? 'text-success-text' : 'text-danger-text'}`}>{message.text}</p>}

      <div className="flex items-center gap-3">
        <Button variant="primary" onClick={save} disabled={(!dirty && reviewed === contractTemplate.reviewed) || problems.length > 0}>Guardar plantilla</Button>
        <Button variant="ghost" onClick={() => { setIntro(DEFAULT_CONTRACT_TEMPLATE.intro); setClosing(DEFAULT_CONTRACT_TEMPLATE.closing); setClauses(DEFAULT_CONTRACT_TEMPLATE.clauses); setReviewed(false); setMessage(null); }}>Restablecer el texto modelo</Button>
        <span className="text-xs text-text-muted">Versión {contractTemplate.version}{contractTemplate.updatedBy ? ` · actualizada por ${contractTemplate.updatedBy}` : ''}</span>
      </div>
    </div>
  );
}
