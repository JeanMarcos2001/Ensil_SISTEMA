import React, { useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { useData } from '../../context/DataContext';
import { parsePsyPolicy, policyText, validatePsyPolicy } from '../../utils/psyReminders';
import { Field, inputCls } from '../enrollment/fields';

/** Configuración → Recordatorios de Psicopedagogía: con cuántos días de anticipación se avisa cada cosa. */
export function PsyRemindersConfig() {
  const { psyReminderPolicy, savePsyReminderPolicy } = useData();
  const [form, setForm] = useState(() => policyText(psyReminderPolicy));
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { setForm(policyText(psyReminderPolicy)); }, [psyReminderPolicy]);

  const problems = validatePsyPolicy(form);
  const set = (patch: Partial<typeof form>) => { setForm(f => ({ ...f, ...patch })); setMessage(null); };
  const save = () => {
    const r = savePsyReminderPolicy(parsePsyPolicy(form));
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
      <Button variant="primary" onClick={save} disabled={problems.length > 0}>Guardar política</Button>
    </div>
  );
}
