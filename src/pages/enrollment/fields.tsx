import React from 'react';
import type { DocType, DraftPerson } from '../../utils/enrollment';
import { ageOn, emptyPerson } from '../../utils/enrollment';
import { DateInput } from '../../components/ui/DateInput';

export const inputCls =
  'w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none disabled:bg-surface-muted disabled:text-text-muted';

/** Campo con su etiqueta (asterisco si es obligatorio), una ayuda y, si hay, el error de ese campo. */
export function Field({
  label, required, hint, error, className = '', children,
}: { label: string; required?: boolean; hint?: string; error?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <label className="text-sm font-medium text-text-secondary">
        {label}{required && <span className="text-error"> *</span>}
      </label>
      {children}
      {error ? <p className="text-xs text-danger-text">{error}</p> : hint && <p className="text-xs text-text-muted">{hint}</p>}
    </div>
  );
}

/** Estilo de un campo con error. */
export const errorCls = 'border-danger-text! focus:border-danger-text!';

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

/** Interruptor deslizante «Existente | Nuevo». */
export function SourceToggle({
  value, onChange,
}: { value: 'nuevo' | 'existente'; onChange: (v: 'nuevo' | 'existente') => void }) {
  return (
    <div
      role="group"
      aria-label="Origen de la persona"
      className="relative inline-grid grid-cols-2 w-56 p-1 rounded-xl bg-surface-muted border border-border-soft text-sm select-none"
    >
      <span
        aria-hidden
        className="absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] rounded-lg bg-primary-accent shadow-sm transition-transform duration-200 ease-out"
        style={{ transform: value === 'existente' ? 'translateX(0)' : 'translateX(100%)' }}
      />
      {([
        { id: 'existente', label: 'Existente' },
        { id: 'nuevo', label: 'Nuevo' },
      ] as const).map(opt => (
        <button
          key={opt.id}
          type="button"
          aria-pressed={value === opt.id}
          onClick={() => value !== opt.id && onChange(opt.id)}
          className={`relative z-10 h-8 rounded-lg font-medium transition-colors ${
            value === opt.id ? 'text-white' : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

interface PersonFormProps {
  person: DraftPerson;
  onChange: (next: DraftPerson) => void;
  today: string;
  /** Campos adicionales del titular principal. */
  extended?: boolean;
  /** Desactiva la edición (campos autocompletados desde otro paso). */
  locked?: boolean;
  /** Personas ya registradas. Si se pasa, aparece el interruptor Existente | Nuevo. */
  existing?: ExistingOption[];
  /** Devuelve la persona completa al elegir una registrada (debe traer `existingId`). */
  onPickExisting?: (id: string) => void;
  searchPlaceholder?: string;
  /** Fecha de referencia para calcular la edad (fecha de matrícula). */
  ageOnDate: string;
  /** Si se indica, el formulario dibuja su encabezado: título a la izquierda y el interruptor al extremo opuesto. */
  title?: React.ReactNode;
  /** Acciones extra del encabezado (p. ej. eliminar), a la derecha junto al interruptor. */
  headerActions?: React.ReactNode;
  /** No pide ni muestra el teléfono (alumnos dependientes de un apoderado). */
  hidePhone?: boolean;
}

const DOC_TYPES: DocType[] = ['DNI', 'CE', 'Pasaporte'];

export function PersonForm({
  person, onChange, extended, locked, existing, onPickExisting, searchPlaceholder, ageOnDate, today, title, headerActions, hidePhone,
}: PersonFormProps) {
  const [query, setQuery] = React.useState('');
  const set = (patch: Partial<DraftPerson>) => onChange({ ...person, ...patch });
  const canChooseSource = !!existing && !!onPickExisting && !locked;
  const source: 'nuevo' | 'existente' = canChooseSource ? (person.source ?? (person.existingId ? 'existente' : 'nuevo')) : 'nuevo';
  const age = person.birthDate ? ageOn(person.birthDate, ageOnDate) : null;

  const matches = query.trim().length >= 2 && existing
    ? existing.filter(e => `${e.label} ${e.doc}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 6)
    : [];

  const changeSource = (next: 'nuevo' | 'existente') => {
    setQuery('');
    // Cambiar de modo parte de una ficha limpia para no mezclar datos de una persona registrada con una nueva.
    onChange({ ...emptyPerson(), source: next });
  };

  // Encabezado: título | (acciones + interruptor). Sin título, el interruptor va solo arriba.
  const header = title !== undefined ? (
    <div className="flex items-center justify-between gap-4">
      <h4 className="font-semibold text-text-primary">{title}</h4>
      <div className="flex items-center gap-3">
        {headerActions}
        {canChooseSource && <SourceToggle value={source} onChange={changeSource} />}
      </div>
    </div>
  ) : (
    canChooseSource && <SourceToggle value={source} onChange={changeSource} />
  );

  // ------------------------------------------------------------- Persona ya registrada
  if (canChooseSource && source === 'existente') {
    return (
      <div className="space-y-4">
        {header}

        {person.existingId ? (
          <div className="flex items-start justify-between gap-4 bg-success-tint border border-border-soft rounded-xl p-4">
            <div className="space-y-0.5 text-sm">
              <p className="font-semibold text-text-primary">
                {[person.names, person.lastNameP, person.lastNameM].filter(Boolean).join(' ')}
              </p>
              <p className="text-text-secondary">{person.docType} {person.docNumber}</p>
              {((!hidePhone && person.phone) || person.email) && (
                <p className="text-text-secondary">{[hidePhone ? '' : person.phone, person.email].filter(Boolean).join(' · ')}</p>
              )}
              <p className="text-xs text-success-text font-medium pt-1">Persona ya registrada: se reutilizará su ficha.</p>
            </div>
            <button
              type="button"
              className="text-xs text-primary-accent hover:underline shrink-0"
              onClick={() => onChange({ ...emptyPerson(), source: 'existente' })}
            >
              Cambiar
            </button>
          </div>
        ) : (
          <div className="space-y-1.5">
            <input
              type="text"
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={searchPlaceholder || 'Buscar por nombre o documento (mínimo 2 caracteres)...'}
              className={inputCls}
            />
            {matches.length > 0 && (
              <div className="border border-border-soft rounded-xl overflow-hidden bg-surface">
                {matches.map(m => (
                  <button
                    key={m.id}
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-surface-muted border-b border-border-soft last:border-0"
                    onClick={() => { onPickExisting!(m.id); setQuery(''); }}
                  >
                    <span className="font-medium text-text-primary">{m.label}</span>
                    <span className="text-text-muted"> · {m.doc}</span>
                  </button>
                ))}
              </div>
            )}
            {query.trim().length >= 2 && matches.length === 0 && (
              <p className="text-xs text-text-muted">
                Sin resultados. Si la persona no está registrada, cambie a «Nuevo».
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  // ------------------------------------------------------------- Persona nueva (o campos bloqueados)
  const disabled = !!locked;
  return (
    <div className="space-y-4">
      {header}

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
          <DateInput max={today} className={inputCls} disabled={disabled} value={person.birthDate} onChange={e => set({ birthDate: e.target.value })} />
        </Field>
        {!hidePhone && (
          <Field label="Teléfono">
            <input className={inputCls} disabled={disabled} value={person.phone} onChange={e => set({ phone: e.target.value })} placeholder="9 dígitos" />
          </Field>
        )}
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
