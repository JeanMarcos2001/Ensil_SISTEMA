import React, { useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { useData } from '../../context/DataContext';
import { stagesOf, validatePolicy } from '../../utils/collections';
import { Field, inputCls } from '../enrollment/fields';

/** Configuración → Política de cobranza: días de gracia, mora y cuándo se recuerda cada cuota. */
export function CollectionsConfig() {
  const { collectionPolicy, updateCollectionPolicy } = useData();
  const toForm = () => ({
    graceDays: String(collectionPolicy.graceDays),
    moraMonthlyRatePct: String(Math.round(collectionPolicy.moraMonthlyRate * 10000) / 100),
    remindBefore: collectionPolicy.remindBefore.join(', '),
    remindAfter: collectionPolicy.remindAfter.join(', '),
  });
  const [form, setForm] = useState(toForm);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { setForm(toForm()); }, [collectionPolicy]);

  const problems = validatePolicy(form);
  const set = (patch: Partial<typeof form>) => { setForm(f => ({ ...f, ...patch })); setMessage(null); };
  const save = () => {
    const r = updateCollectionPolicy(form);
    setMessage(r.ok ? { ok: true, text: 'Política guardada.' } : { ok: false, text: r.error ?? 'No se pudo guardar.' });
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-text-primary">Política de cobranza</h2>
        <p className="text-sm text-text-secondary">Define cuándo se recuerda una cuota, cuántos días de gracia hay y si se cobra mora. La usan Planes y cartera y el reporte de Cartera.</p>
      </div>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Field label="Días de gracia" required hint="Una cuota vencida no genera mora hasta pasados estos días.">
          <input className={inputCls} type="number" min={0} max={60} value={form.graceDays} onChange={e => set({ graceDays: e.target.value })} />
        </Field>
        <Field label="Tasa de mora mensual (%)" required hint="0 = no se cobra mora. Se calcula sobre el saldo vencido, proporcional a los días (tasa × días / 30).">
          <input className={inputCls} type="number" min={0} max={10} step="0.01" value={form.moraMonthlyRatePct} onChange={e => set({ moraMonthlyRatePct: e.target.value })} />
        </Field>
        <Field label="Recordar antes del vencimiento (días)" required hint="Separe con comas. 0 = el mismo día del vencimiento. Ej.: 3, 0">
          <input className={inputCls} value={form.remindBefore} onChange={e => set({ remindBefore: e.target.value })} />
        </Field>
        <Field label="Recordar después del vencimiento (días)" required hint="Separe con comas. Ej.: 1, 7, 15, 30">
          <input className={inputCls} value={form.remindAfter} onChange={e => set({ remindAfter: e.target.value })} />
        </Field>
      </section>

      {problems.length === 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider">Así quedaría el calendario de cada cuota</h3>
          <ol className="text-sm text-text-secondary space-y-1 list-decimal pl-5">
            {stagesOf({ graceDays: Number(form.graceDays), moraMonthlyRate: Number(form.moraMonthlyRatePct) / 100, remindBefore: form.remindBefore.split(/[,;\s]+/).filter(Boolean).map(Number), remindAfter: form.remindAfter.split(/[,;\s]+/).filter(Boolean).map(Number) }).map(s => <li key={s.offset}>{s.label}</li>)}
          </ol>
          <p className="text-xs text-text-muted">El sistema prepara el mensaje y abre WhatsApp con el texto listo; no lo envía solo. Cada envío (o su omisión) queda registrado con quién y cuándo.</p>
        </section>
      )}
      {problems.length > 0 && <ul className="text-sm text-danger-text list-disc pl-5">{problems.map(p => <li key={p}>{p}</li>)}</ul>}
      {message && <p className={`text-sm ${message.ok ? 'text-success-text' : 'text-danger-text'}`}>{message.text}</p>}
      <Button variant="primary" onClick={save} disabled={problems.length > 0}>Guardar política</Button>
    </div>
  );
}
