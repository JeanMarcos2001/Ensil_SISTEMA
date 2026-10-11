import React from 'react';
import type { DocType, DraftPerson } from '../../utils/enrollment';
import { ageOn } from '../../utils/enrollment';

export const inputCls =
  'w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none disabled:bg-surface-muted disabled:text-text-muted';

export function Field({
  label, required, hint, className = '', children,
}: { label: string; required?: boolean; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <label className="text-sm font-medium text-text-secondary">
        {label}{required && <span className="text-error"> *</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-text-muted">{hint}</p>}
    </div>
  );
}

export function StepHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h3 className="text-[28px] font-bold text-text-primary leading-tight">{title}</h3>
      <p className="text-[14px] font-normal text-text-secondary mt-1">{subtitle}</p>
    </div>
  );
}

export interface ExistingOption {
  id: string;
  label: string;
  doc: string;
}

interface PersonFormProps {
  person: DraftPerson;
  onChange: (next: DraftPerson) => void;
  today: string;
  /** Campos adicionales del titular principal. */
  extended?: boolean;
  /** Desactiva la edición (persona ya registrada o campos autocompletados). */
  locked?: boolean;
  /** Búsqueda de personas ya registradas para no duplicarlas. */
  existing?: ExistingOption[];
  onPickExisting?: (id: string) => void;
  onClearExisting?: () => void;
  searchPlaceholder?: string;
  /** Fecha de referencia para calcular la edad (fecha de matrícula). */
  ageOnDate: string;
}

const DOC_TYPES: DocType[] = ['DNI', 'CE', 'Pasaporte'];

export function PersonForm({
  person, onChange, extended, locked, existing, onPickExisting, onClearExisting, searchPlaceholder, ageOnDate, today,
}: PersonFormProps) {
  const [query, setQuery] = React.useState('');
  const set = (patch: Partial<DraftPerson>) => onChange({ ...person, ...patch });
  const disabled = !!locked || !!person.existingId;
  const age = person.birthDate ? ageOn(person.birthDate, ageOnDate) : null;

  const matches = query.trim().length >= 2 && existing
    ? existing.filter(e => `${e.label} ${e.doc}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 5)
    : [];

  return (
    <div className="space-y-4">
      {existing && onPickExisting && !locked && (
        <div className="space-y-1.5">
          {person.existingId ? (
            <div className="flex items-center justify-between bg-success-tint border border-border-soft rounded-xl px-3 py-2 text-sm">
              <span className="text-success-text font-medium">Persona ya registrada: se reutilizará su ficha.</span>
              <button type="button" className="text-xs text-primary-accent hover:underline" onClick={onClearExisting}>
                Registrar como nueva
              </button>
            </div>
          ) : (
            <>
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={searchPlaceholder || 'Buscar persona ya registrada por nombre o documento...'}
                className={inputCls}
              />
              {matches.length > 0 && (
                <div className="border border-border-soft rounded-xl overflow-hidden bg-surface">
                  {matches.map(m => (
                    <button
                      key={m.id}
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-surface-muted border-b border-border-soft last:border-0"
                      onClick={() => { onPickExisting(m.id); setQuery(''); }}
                    >
                      <span className="font-medium text-text-primary">{m.label}</span>
                      <span className="text-text-muted"> · {m.doc}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Field label="Nombres" required>
          <input className={inputCls} disabled={disabled} value={person.names} onChange={e => set({ names: e.target.value })} />
        </Field>
        <Field label="Apellido paterno" required>
          <input className={inputCls} disabled={disabled} value={person.lastNameP} onChange={e => set({ lastNameP: e.target.value })} />
        </Field>
        <Field label="Apellido materno">
          <input className={inputCls} disabled={disabled} value={person.lastNameM} onChange={e => set({ lastNameM: e.target.value })} />
        </Field>
        <Field label="Tipo de documento" required>
          <select className={inputCls} disabled={disabled} value={person.docType} onChange={e => set({ docType: e.target.value as DocType })}>
            {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="N° de documento" required hint={person.docType === 'DNI' ? '8 dígitos' : '6 a 12 caracteres'}>
          <input className={`${inputCls} font-mono`} disabled={disabled} value={person.docNumber} onChange={e => set({ docNumber: e.target.value })} />
        </Field>
        <Field label="Fecha de nacimiento" required hint={age !== null && age >= 0 ? `Edad: ${age} años` : undefined}>
          <input type="date" max={today} className={inputCls} disabled={disabled} value={person.birthDate} onChange={e => set({ birthDate: e.target.value })} />
        </Field>
        <Field label="Teléfono">
          <input className={inputCls} disabled={disabled} value={person.phone} onChange={e => set({ phone: e.target.value })} placeholder="9 dígitos" />
        </Field>
        {extended && (
          <>
            <Field label="Correo">
              <input type="email" className={inputCls} disabled={disabled} value={person.email} onChange={e => set({ email: e.target.value })} />
            </Field>
            <Field label="Dirección" required className="col-span-2">
              <input className={inputCls} disabled={disabled} value={person.address} onChange={e => set({ address: e.target.value })} />
            </Field>
            <Field label="Estado civil" required>
              <select className={inputCls} disabled={disabled} value={person.civilStatus} onChange={e => set({ civilStatus: e.target.value })}>
                <option value="">Seleccionar...</option>
                {['Soltero(a)', 'Casado(a)', 'Conviviente', 'Divorciado(a)', 'Viudo(a)'].map(x => <option key={x} value={x}>{x}</option>)}
              </select>
            </Field>
          </>
        )}
      </div>
    </div>
  );
}
