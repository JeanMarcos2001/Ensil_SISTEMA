import React from 'react';
import { AlertTriangle, CheckCircle2, CircleDashed, ShieldAlert } from 'lucide-react';
import { Badge } from '../../../components/ui/Badge';
import { capabilityById } from '../../../utils/capabilities';
import type { IncompatibilityDef } from '../../../utils/capabilityRegistry';
import { MIN_REASON } from '../../../utils/assignments';
import type { AcceptedRisk, CounterpartRow, MenuPreviewModule } from '../../../utils/roleBuilder';

const label = (id: string) => capabilityById(id)?.label ?? id;

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div>
        <h4 className="text-xs font-bold text-text-primary uppercase tracking-wider">{title}</h4>
        {hint && <p className="text-[11px] text-text-muted mt-0.5">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

const places = (names: string[]) => (names.length <= 4 ? names.join(', ') : `${names.slice(0, 4).join(', ')} y ${names.length - 4} más`);

// ------------------------------------------------------------------------------------------------------------------ Combinaciones a separar

interface WarningsProps {
  warnings: IncompatibilityDef[];
  accepted: AcceptedRisk[];
  reasons: Record<string, string>;
  onReason: (ruleId: string, text: string) => void;
  readOnly: boolean;
}

export function RoleWarnings({ warnings, accepted, reasons, onReason, readOnly }: WarningsProps) {
  return (
    <Section title="Combinaciones a separar" hint="No impiden guardar, pero piden un motivo que queda escrito en el rol.">
      {warnings.length === 0 ? (
        <p className="text-xs text-success-text flex items-center gap-1.5"><CheckCircle2 size={14} /> Ninguna: el rol no reúne funciones que convenga separar.</p>
      ) : (
        <ul className="space-y-3">
          {warnings.map(rule => {
            const prior = accepted.find(a => a.ruleId === rule.id);
            const typed = reasons[rule.id] ?? '';
            const missing = !prior && typed.trim().length < MIN_REASON;
            return (
              <li key={rule.id} className={`rounded-xl border p-3 text-xs ${missing ? 'border-error bg-danger-tint' : 'border-border-soft bg-warning-tint'}`}>
                <p className="flex items-start gap-1.5 text-text-primary font-medium"><ShieldAlert size={14} className="mt-0.5 shrink-0 text-warning-text" />{rule.message}</p>
                <p className="mt-1 text-text-secondary">Reúne: {rule.capabilities.map(label).join(' + ')}</p>
                {prior && typed === '' ? (
                  <p className="mt-2 text-text-secondary">Aceptada por {prior.by} el {prior.at}: «{prior.reason}»</p>
                ) : null}
                {!readOnly && (
                  <input
                    type="text"
                    value={typed}
                    onChange={e => onReason(rule.id, e.target.value)}
                    placeholder={prior ? 'Escriba un motivo nuevo para cambiarlo' : `Motivo para aceptarla (mínimo ${MIN_REASON} letras)`}
                    className="mt-2 w-full h-9 bg-surface border border-border-soft rounded-lg px-2.5 text-xs text-text-primary focus:outline-none focus:border-primary-accent"
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------------------------ Semáforo de contrapartes

export function CounterpartLights({ rows }: { rows: CounterpartRow[] }) {
  const required = rows.filter(r => r.state === 'falta' && r.strength === 'required');
  const advisory = rows.filter(r => r.state === 'falta' && r.strength === 'advisory');
  const pending = rows.filter(r => r.state === 'sin-cuentas');
  const ok = rows.filter(r => r.state === 'ok');
  return (
    <Section title="Contrapartes" hint="Lo que otra persona debe poder hacer para que lo que hace este rol tenga sentido, con las cuentas de hoy.">
      {rows.length === 0 && <p className="text-xs text-text-muted">Las funciones elegidas no dependen de otra persona.</p>}
      <ul className="space-y-2">
        {required.map(r => (
          <li key={`${r.capabilityId}>${r.counterpartId}`} className="rounded-xl border border-error bg-danger-tint p-3 text-xs">
            <p className="flex items-start gap-1.5 font-medium text-danger-text"><AlertTriangle size={14} className="mt-0.5 shrink-0" />«{label(r.capabilityId)}»: sin «{label(r.counterpartId)}» en {places(r.missingIn)}</p>
            <p className="mt-1 text-text-secondary">{r.why} Sin ello la función no se ofrece.</p>
          </li>
        ))}
        {advisory.map(r => (
          <li key={`${r.capabilityId}>${r.counterpartId}`} className="rounded-xl border border-border-soft bg-warning-tint p-3 text-xs">
            <p className="flex items-start gap-1.5 font-medium text-warning-text"><AlertTriangle size={14} className="mt-0.5 shrink-0" />«{label(r.capabilityId)}»: nadie hace «{label(r.counterpartId)}» en {places(r.missingIn)}</p>
            <p className="mt-1 text-text-secondary">{r.why} Se recomienda cubrirlo.</p>
          </li>
        ))}
        {pending.map(r => (
          <li key={`${r.capabilityId}>${r.counterpartId}`} className="rounded-xl border border-border-soft bg-surface-muted p-3 text-xs">
            <p className="flex items-start gap-1.5 text-text-secondary"><CircleDashed size={14} className="mt-0.5 shrink-0" />«{label(r.capabilityId)}» necesita «{label(r.counterpartId)}» en la misma sede: se medirá cuando el rol tenga cuentas.</p>
          </li>
        ))}
      </ul>
      {ok.length > 0 && (
        <details className="text-xs text-text-secondary">
          <summary className="cursor-pointer flex items-center gap-1.5 text-success-text"><CheckCircle2 size={14} /> {ok.length} contraparte{ok.length === 1 ? '' : 's'} cubierta{ok.length === 1 ? '' : 's'}</summary>
          <ul className="mt-2 space-y-1 pl-5 list-disc">
            {ok.map(r => <li key={`${r.capabilityId}>${r.counterpartId}`}>«{label(r.capabilityId)}» ← «{label(r.counterpartId)}»</li>)}
          </ul>
        </details>
      )}
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------------------------ Vista previa del menú

export function MenuPreviewPanel({ modules, settings }: { modules: MenuPreviewModule[]; settings: boolean }) {
  return (
    <Section title="Menú que verá" hint="Sale de las mismas funciones que muestran u ocultan cada pantalla.">
      {modules.length === 0 && <p className="text-xs text-text-muted">Con estas funciones no vería ninguna pantalla.</p>}
      <ul className="space-y-2">
        {modules.map(m => (
          <li key={m.id} className="text-xs">
            <span className="font-medium text-text-primary">{m.title}</span>
            <div className="mt-1 flex flex-wrap gap-1">
              {m.items.map(item => <Badge key={item} variant="neutral">{item}</Badge>)}
            </div>
          </li>
        ))}
      </ul>
      {settings && <p className="text-[11px] text-text-secondary">Además vería el botón «Configuración».</p>}
    </Section>
  );
}
