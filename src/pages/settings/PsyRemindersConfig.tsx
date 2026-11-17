import React, { useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { useData } from '../../context/DataContext';
import { parsePsyPolicy, policyText, validatePsyPolicy } from '../../utils/psyReminders';
import { Field, inputCls } from '../enrollment/fields';

const when = (iso: string) => new Date(iso).toLocaleString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/**
 * Configuración → Psicopedagogía → Recordatorios: con cuántos días de anticipación se avisa cada cosa. Es UNA política para todo el grupo y se guarda por versiones
 * (solo se agregan): cada cambio queda con quién y cuándo, y los recordatorios ya registrados no cambian.
 */
export function PsyRemindersConfig() {
  const { psyReminderPolicy, psyReminderPolicies, savePsyReminderPolicy } = useData();
  const [form, setForm] = useState(() => policyText(psyReminderPolicy));
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setForm(policyText(psyReminderPolicy)); }, [psyReminderPolicy]);

  const problems = validatePsyPolicy(form);
  const set = (patch: Partial<typeof form>) => { setForm(f => ({ ...f, ...patch })); setMessage(null); };
  const save = async () => {
    if (saving) return;
    setSaving(true);
    const r = await savePsyReminderPolicy(parsePsyPolicy(form));
    setSaving(false);
    setMessage(r.ok ? { ok: true, text: 'Política guardada.' } : { ok: false, text: r.error ?? 'No se pudo guardar.' });
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-text-primary">Recordatorios de Psicopedagogía</h2>
        <p className="text-sm text-text-secondary">Define con cuántos días de anticipación se prepara el aviso al titular. Se atienden en Psicopedagogía → Recordatorios.</p>
      </div>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Field label="Asesorías (días antes)" required hint="1 = el día anterior (deja tiempo para avisar con las 24 horas de anticipación). 0 = el mismo día. Ej.: 1">
          <input className={inputCls} value={form.sessionBefore} onChange={e => set({ sessionBefore: e.target.value })} />
        </Field>
        <Field label="Actividades especiales (días antes)" required hint="Solo para los alumnos inscritos. Ej.: 2">
          <input className={inputCls} value={form.activityBefore} onChange={e => set({ activityBefore: e.target.value })} />
        </Field>
        <Field label="Vigencia por vencer (días antes del fin de la duración base)" required hint="Solo matrículas por vencer y sin extensión habilitada. Ej.: 14, 7, 1">
          <input className={inputCls} value={form.validityBefore} onChange={e => set({ validityBefore: e.target.value })} />
        </Field>
      </section>

      <p className="text-xs text-text-muted">
        Cada asesoría, actividad o matrícula muestra un solo recordatorio: el más cercano a su fecha que todavía no se atendió. El sistema prepara el texto y abre WhatsApp con el mensaje listo; no lo envía solo. Una primera asesoría cuya matrícula sigue sin verificar no se recuerda: primero hay que verificar o reprogramar.
      </p>
      {problems.length > 0 && <ul className="text-sm text-danger-text list-disc pl-5">{problems.map(p => <li key={p}>{p}</li>)}</ul>}
      {message && <p className={`text-sm ${message.ok ? 'text-success-text' : 'text-danger-text'}`}>{message.text}</p>}
      <Button variant="primary" onClick={save} disabled={problems.length > 0 || saving}>{saving ? 'Guardando…' : 'Guardar política'}</Button>

      <section className="space-y-2 pt-2">
        <h3 className="text-base font-semibold text-text-primary">Versiones de la política</h3>
        {psyReminderPolicies.length === 0 ? (
          <p className="text-sm text-text-muted">Todavía no se guardó ninguna: valen los días de partida. Al guardar nace la versión 1.</p>
        ) : (
          <div className="border border-border-soft rounded-xl overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-text-secondary uppercase bg-surface-muted/50">
                <tr>
                  <th className="px-4 py-2 font-medium">Versión</th>
                  <th className="px-4 py-2 font-medium">Asesorías</th>
                  <th className="px-4 py-2 font-medium">Actividades</th>
                  <th className="px-4 py-2 font-medium">Vigencia</th>
                  <th className="px-4 py-2 font-medium">Guardada por</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-soft">
                {psyReminderPolicies.map((v, i) => (
                  <tr key={v.version}>
                    <td className="px-4 py-2 text-text-primary">{v.version}{i === 0 && <span className="ml-2 text-xs text-success-text">vigente</span>}</td>
                    <td className="px-4 py-2 text-text-secondary">{v.sessionBefore.join(', ')}</td>
                    <td className="px-4 py-2 text-text-secondary">{v.activityBefore.join(', ')}</td>
                    <td className="px-4 py-2 text-text-secondary">{v.validityBefore.join(', ')}</td>
                    <td className="px-4 py-2 text-text-secondary">{v.createdBy}<span className="block text-xs text-text-muted">{when(v.createdAt)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
