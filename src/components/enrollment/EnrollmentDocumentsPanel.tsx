import React, { useMemo, useState } from 'react';
import { AlertTriangle, FileSignature, FileText, Printer } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { DateInput } from '../ui/DateInput';
import { Modal } from '../ui/Modal';
import { useData } from '../../context/DataContext';
import { PERM } from '../../utils/authority';
import { DOC_LABEL, buildDocument, docState, documentHtml, documentProblems, type BuiltDocument, type DocKind } from '../../utils/enrollmentDocuments';
import { printHtml } from '../../utils/printTable';
import { todayLocalISO } from '../../utils/schedule';
import { Field, inputCls } from '../../pages/enrollment/fields';

const when = (iso: string) => new Date(iso).toLocaleString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Contrato y ficha de la matrícula: generar, ver e imprimir, y registrar la firma. */
export function EnrollmentDocumentsPanel({ enrollmentId }: { enrollmentId: string }) {
  const data = useData();
  const [preview, setPreview] = useState<DocKind | null>(null);
  const [signing, setSigning] = useState<DocKind | null>(null);
  const [signDate, setSignDate] = useState(todayLocalISO());
  const [signFile, setSignFile] = useState('');
  const [error, setError] = useState<string | null>(null);

  const ctx = useMemo(() => data.documentContextOf(enrollmentId), [enrollmentId, data.enrollments, data.students, data.guardians, data.plans, data.schedules, data.programs, data.branches, data.companies, data.contractTemplate]);
  if (!ctx) return null;
  const kinds: DocKind[] = ['contract', 'ficha'];
  const built: Record<DocKind, BuiltDocument> = { contract: buildDocument('contract', ctx), ficha: buildDocument('ficha', ctx) };
  const canEdit = data.can(PERM.documents);

  const generate = (kind: DocKind) => {
    const r = data.generateEnrollmentDocument(enrollmentId, kind);
    setError(r.ok ? null : r.error ?? 'No se pudo generar el documento.');
  };
  const submitSignature = () => {
    if (!signing) return;
    const r = data.registerDocumentSignature(enrollmentId, signing, { date: signDate, file: signFile });
    if (!r.ok) { setError(r.error ?? 'No se pudo registrar la firma.'); return; }
    setSigning(null); setError(null);
  };

  return (
    <div className="space-y-4">
      {!data.contractTemplate.reviewed && (
        <div className="flex gap-2 text-sm bg-warning-tint/60 border border-warning-text/20 rounded-xl px-4 py-2.5 text-text-primary">
          <AlertTriangle size={16} className="shrink-0 mt-0.5 text-warning-text" />
          <p>La plantilla del contrato aún es un <strong>texto modelo</strong>: el área legal debe revisarla y marcarla como revisada en Configuración → Plantillas de documentos antes de firmar contratos reales.</p>
        </div>
      )}
      {error && <div className="text-sm bg-danger-tint border border-danger-text/20 text-danger-text rounded-xl px-4 py-2.5">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {kinds.map(kind => {
          const issued = ctx.enrollment.documents?.[kind];
          const state = docState(issued, built[kind].fingerprint);
          const problems = documentProblems(kind, ctx);
          return (
            <section key={kind} className="border border-border-soft rounded-xl p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  {kind === 'contract' ? <FileSignature size={18} className="text-text-muted" /> : <FileText size={18} className="text-text-muted" />}
                  <h4 className="text-sm font-bold text-text-primary">{DOC_LABEL[kind]}</h4>
                </div>
                <div className="flex gap-1.5 flex-wrap justify-end">
                  <Badge variant={state === 'vigente' ? 'success' : state === 'desactualizado' ? 'warning' : 'neutral'}>{state === 'sin-generar' ? 'Sin generar' : state === 'vigente' ? 'Generado' : 'Desactualizado'}</Badge>
                  {issued && state !== 'sin-generar' && <Badge variant={issued.signedAt && state === 'vigente' ? 'success' : 'danger'}>{issued.signedAt && state === 'vigente' ? 'Firmado' : 'Sin firma'}</Badge>}
                </div>
              </div>

              {issued ? (
                <div className="text-sm text-text-secondary space-y-0.5">
                  <p><span className="font-medium text-text-primary">{issued.number}</span> · versión {issued.version}</p>
                  <p>Generado el {when(issued.generatedAt)} por {issued.generatedBy}</p>
                  {issued.signedAt && <p>Firmado el {issued.signedAt.split('-').reverse().join('/')}{issued.signedFile ? ` · ${issued.signedFile}` : ''}</p>}
                  {state === 'desactualizado' && <p className="text-warning-text">Los datos de la matrícula cambiaron desde que se generó (precio, cuotas, titular…). Regenérelo y haga firmar la versión nueva.</p>}
                </div>
              ) : (
                <p className="text-sm text-text-muted">Todavía no se generó. Se arma con los datos de la matrícula.</p>
              )}

              {problems.length > 0 && (
                <ul className="text-sm text-warning-text list-disc pl-5 space-y-0.5">{problems.map(p => <li key={p}>{p}</li>)}</ul>
              )}

              <div className="flex flex-wrap gap-2">
                <Button variant={state === 'vigente' ? 'secondary' : 'primary'} size="sm" onClick={() => generate(kind)} disabled={!canEdit || problems.length > 0 || state === 'vigente'}>
                  {state === 'sin-generar' ? 'Generar' : state === 'desactualizado' ? 'Regenerar' : 'Al día'}
                </Button>
                <Button variant="secondary" size="sm" className="gap-1" onClick={() => setPreview(kind)} disabled={problems.length > 0}><Printer size={14} /> Ver e imprimir</Button>
                {issued && state === 'vigente' && !issued.signedAt && (
                  <Button variant="secondary" size="sm" onClick={() => { setSigning(kind); setSignDate(todayLocalISO()); setSignFile(''); setError(null); }} disabled={!canEdit}>Registrar firma</Button>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <Modal
        isOpen={!!preview}
        onClose={() => setPreview(null)}
        title={preview ? `${DOC_LABEL[preview]} · vista previa` : ''}
        size="4xl"
        footer={
          <div className="flex justify-end gap-3 w-full">
            <Button variant="ghost" onClick={() => setPreview(null)}>Cerrar</Button>
            <Button variant="primary" className="gap-2" onClick={() => preview && printHtml(documentHtml(built[preview], ctx.enrollment.documents?.[preview]))}><Printer size={16} /> Imprimir / Guardar PDF</Button>
          </div>
        }
      >
        {preview && <iframe title="Vista previa" className="w-full h-[60vh] border border-border-soft rounded-xl bg-white" srcDoc={documentHtml(built[preview], ctx.enrollment.documents?.[preview])} />}
      </Modal>

      <Modal
        isOpen={!!signing}
        onClose={() => setSigning(null)}
        title={signing ? `Registrar la firma · ${DOC_LABEL[signing]}` : ''}
        size="md"
        footer={
          <div className="flex justify-end gap-3 w-full">
            <Button variant="ghost" onClick={() => setSigning(null)}>Cancelar</Button>
            <Button variant="primary" onClick={submitSignature}>Registrar firma</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">Imprima el documento, hágalo firmar y registre aquí la fecha y el archivo escaneado. El sistema guarda el nombre del archivo (aún no almacena el archivo).</p>
          <Field label="Fecha de la firma" required>
            <DateInput max={todayLocalISO()} value={signDate} onChange={e => setSignDate(e.target.value)} />
          </Field>
          <Field label="Archivo firmado (escaneo o foto)" required>
            <input type="file" accept="image/*,.pdf" className={inputCls} onChange={e => setSignFile(e.target.files?.[0]?.name ?? '')} />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
