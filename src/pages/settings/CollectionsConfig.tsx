import React, { useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { useData } from '../../context/DataContext';
import { PERM } from '../../utils/authority';
import { stagesOf, validatePolicy } from '../../utils/collections';
import { Field, inputCls } from '../enrollment/fields';

const when = (iso: string) => new Date(iso).toLocaleString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const pct = (rate: number) => `${Math.round(rate * 10000) / 100} %`;
const days = (list: number[]) => (list.length > 0 ? list.join(', ') : '—');

/**
 * Configuración → Cobranza → Política de cobranza: días de gracia, mora y cuándo se recuerda cada cuota. **Es una sola para todo el grupo** y vive en la
 * base de datos, por versiones: cada cambio guarda una versión nueva con quién y cuándo (el historial está abajo).
 */
export function CollectionsConfig() {
  const { collectionPolicy, collectionPolicyVersions, updateCollectionPolicy, can } = useData();
  const canEdit = can(PERM.configCollections);
  const toForm = () => ({
    graceDays: String(collectionPolicy.graceDays),
    moraMonthlyRatePct: String(Math.round(collectionPolicy.moraMonthlyRate * 10000) / 100),
    remindBefore: collectionPolicy.remindBefore.join(', '),
    remindAfter: collectionPolicy.remindAfter.join(', '),
  });
  const [form, setForm] = useState(toForm);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setForm(toForm()); }, [collectionPolicy]);

  const problems = validatePolicy(form);
  const set = (patch: Partial<typeof form>) => { setForm(f => ({ ...f, ...patch })); setMessage(null); };
  const save = async () => {
    if (saving) return;
    setSaving(true);
    const r = await updateCollectionPolicy(form);
    setSaving(false);
    setMessage(r.ok ? { ok: true, text: 'Política guardada.' } : { ok: false, text: r.error ?? 'No se pudo guardar.' });
  };
  const current = collectionPolicyVersions[0];

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-text-primary">Política de cobranza</h2>
        <p className="text-sm text-text-secondary">Define cuándo se recuerda una cuota, cuántos días de gracia hay y si se cobra mora. Es una sola para todo el grupo. La usan Planes y cartera y el reporte de Cartera.</p>
      </div>

      <fieldset disabled={!canEdit || saving} className="space-y-6 min-w-0">
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
      </fieldset>

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
      <div className="flex items-center gap-3">
        {canEdit && <Button variant="primary" onClick={() => void save()} disabled={problems.length > 0 || saving}>{saving ? 'Guardando…' : 'Guardar política'}</Button>}
        <span className="text-xs text-text-muted">{current ? `Versión ${current.version} · guardada por ${current.createdBy}` : 'Todavía no se guardó ninguna: valen los valores de partida.'}</span>
      </div>

      {collectionPolicyVersions.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider">Historial de la política</h3>
          <div className="overflow-x-auto border border-border-soft rounded-xl">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-text-secondary uppercase bg-surface-muted/50">
                <tr>
                  <th className="px-4 py-2 font-medium">Versión</th>
                  <th className="px-4 py-2 font-medium">Gracia</th>
                  <th className="px-4 py-2 font-medium">Mora mensual</th>
                  <th className="px-4 py-2 font-medium">Antes</th>
                  <th className="px-4 py-2 font-medium">Después</th>
                  <th className="px-4 py-2 font-medium">Guardada</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-soft">
                {collectionPolicyVersions.slice(0, 10).map(v => (
                  <tr key={v.version}>
                    <td className="px-4 py-2 font-medium text-text-primary">{v.version}{v === current ? ' (vigente)' : ''}</td>
                    <td className="px-4 py-2">{v.graceDays} d</td>
                    <td className="px-4 py-2">{pct(v.moraMonthlyRate)}</td>
                    <td className="px-4 py-2">{days(v.remindBefore)}</td>
                    <td className="px-4 py-2">{days(v.remindAfter)}</td>
                    <td className="px-4 py-2 text-text-secondary">{v.createdBy}<span className="block text-xs text-text-muted">{when(v.createdAt)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {collectionPolicyVersions.length > 10 && <p className="text-xs text-text-muted">Se muestran las 10 más recientes.</p>}
        </section>
      )}
    </div>
  );
}
