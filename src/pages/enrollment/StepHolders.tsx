import React from 'react';
import { Plus, Trash2, User, Users } from 'lucide-react';
import { emptyPerson, type DraftPerson, type EnrollmentMode } from '../../utils/enrollment';
import { PersonForm, StepHeader, type ExistingOption } from './fields';
import { STEPS, type StepProps } from './types';

export function StepHolders({ draft, update, catalogs, today }: StepProps) {
  const guardianOptions: ExistingOption[] = catalogs.guardians.map(g => ({ id: g.id, label: g.name, doc: g.doc }));

  const setMode = (mode: EnrollmentMode) =>
    update(d => ({ ...d, mode, promotion: null, holders: mode === 'independiente' ? [d.holders[0]] : d.holders }));

  const setHolder = (idx: number, person: DraftPerson) =>
    update(d => ({ ...d, holders: d.holders.map((h, i) => (i === idx ? person : h)) }));

  const pickExisting = (idx: number, id: string) => {
    const g = catalogs.guardians.find(x => x.id === id);
    if (!g) return;
    setHolder(idx, {
      ...emptyPerson(),
      existingId: g.id,
      docType: (g.docType as DraftPerson['docType']) || 'DNI',
      docNumber: g.doc,
      names: g.names ?? g.name,
      lastNameP: g.lastNameP ?? '',
      lastNameM: g.lastNameM ?? '',
      birthDate: g.birthDate ?? '',
      phone: g.phone,
      email: g.email,
      address: g.direccion ?? '',
      civilStatus: g.civilStatus ?? '',
    });
  };

  const addHolder = () => update(d => ({ ...d, holders: [...d.holders, emptyPerson()] }));
  const removeHolder = (idx: number) => update(d => ({ ...d, holders: d.holders.filter((_, i) => i !== idx) }));

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
      <StepHeader title={STEPS[1].title} subtitle={STEPS[1].subtitle} />

      <div className="space-y-2">
        <p className="text-sm font-medium text-text-secondary">¿Cómo se realizará la matrícula?</p>
        <div className="grid grid-cols-2 gap-3">
          {([
            { id: 'independiente', label: 'Alumno independiente', icon: User, hint: 'La persona se captura una sola vez y es a la vez titular y alumno.' },
            { id: 'apoderado', label: 'Con apoderado', icon: Users, hint: 'Un titular principal (y opcionalmente otros) responde por los alumnos.' },
          ] as const).map(opt => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setMode(opt.id)}
              className={`flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-colors ${
                draft.mode === opt.id ? 'border-primary-accent bg-primary-accent/5' : 'border-border-soft hover:border-primary-accent/50'
              }`}
            >
              <opt.icon size={20} className="text-primary-accent mt-0.5 shrink-0" />
              <span>
                <span className="block text-sm font-semibold text-text-primary">{opt.label}</span>
                <span className="block text-xs text-text-secondary mt-0.5">{opt.hint}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      {draft.mode === 'independiente' ? (
        <div className="p-5 border border-border-soft rounded-xl space-y-4">
          <h4 className="font-semibold text-text-primary">Datos de la persona</h4>
          <PersonForm
            person={draft.holders[0]}
            onChange={p => setHolder(0, p)}
            today={today}
            ageOnDate={draft.context.date}
            existing={catalogs.students.map(s => ({ id: s.id, label: s.name, doc: s.doc }))}
            onPickExisting={id => {
              const s = catalogs.students.find(x => x.id === id);
              if (!s) return;
              setHolder(0, {
                ...emptyPerson(), existingId: s.id,
                docType: (s.docType as DraftPerson['docType']) || 'DNI', docNumber: s.doc,
                names: s.names ?? s.name, lastNameP: s.lastNameP ?? '', lastNameM: s.lastNameM ?? '',
                birthDate: s.birthDate ?? '', phone: s.phone ?? '', email: s.email ?? '', address: s.address ?? '',
              });
            }}
            onClearExisting={() => setHolder(0, emptyPerson())}
            searchPlaceholder="Buscar alumno ya registrado por nombre o documento..."
          />
          <p className="text-xs text-text-muted">Esta misma persona será el Alumno 1: sus datos no se duplican.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {draft.holders.map((h, idx) => (
            <div key={idx} className="p-5 border border-border-soft rounded-xl space-y-4">
              <div className="flex justify-between items-center">
                <h4 className="font-semibold text-text-primary">
                  {idx === 0 ? 'Titular principal' : idx === 1 ? 'Titular secundario' : `Titular ${idx + 1}`}
                </h4>
                {idx > 0 && (
                  <button type="button" className="text-text-muted hover:text-danger-text" onClick={() => removeHolder(idx)}>
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
              <PersonForm
                person={h}
                onChange={p => setHolder(idx, p)}
                today={today}
                ageOnDate={draft.context.date}
                extended={idx === 0}
                existing={guardianOptions}
                onPickExisting={id => pickExisting(idx, id)}
                onClearExisting={() => setHolder(idx, emptyPerson())}
                searchPlaceholder="Buscar titular ya registrado por nombre o documento..."
              />
            </div>
          ))}
          <button
            type="button"
            onClick={addHolder}
            className="w-full py-3 border-2 border-dashed border-border-soft rounded-xl text-text-secondary hover:border-primary-accent hover:text-primary-accent transition-all flex items-center justify-center gap-2 font-medium"
          >
            <Plus size={18} /> Agregar titular
          </button>
        </div>
      )}
    </div>
  );
}
