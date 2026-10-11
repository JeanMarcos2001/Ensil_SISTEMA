import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { emptyPerson, emptyStudent, studentPerson, type DraftPerson, type DraftStudent } from '../../utils/enrollment';
import { Field, PersonForm, StepHeader, inputCls } from './fields';
import { STEPS, type StepProps } from './types';

const RELATIONSHIPS = ['Hijo(a)', 'Nieto(a)', 'Sobrino(a)', 'Hermano(a)', 'Otro familiar', 'Otro'];

export function StepStudents({ draft, update, catalogs, today }: StepProps) {
  const setStudent = (idx: number, patch: Partial<DraftStudent>) =>
    update(d => ({ ...d, students: d.students.map((s, i) => (i === idx ? { ...s, ...patch } : s)) }));

  const addStudent = () => update(d => ({ ...d, students: [...d.students, emptyStudent()] }));
  const removeStudent = (idx: number) =>
    update(d => ({ ...d, promotion: null, students: d.students.filter((_, i) => i !== idx) }));

  const pickExisting = (idx: number, id: string) => {
    const s = catalogs.students.find(x => x.id === id);
    if (!s) return;
    const person: DraftPerson = {
      ...emptyPerson(), existingId: s.id,
      docType: (s.docType as DraftPerson['docType']) || 'DNI', docNumber: s.doc,
      names: s.names ?? s.name, lastNameP: s.lastNameP ?? '', lastNameM: s.lastNameM ?? '',
      birthDate: s.birthDate ?? '', phone: s.phone ?? '', email: s.email ?? '', address: s.address ?? '',
    };
    setStudent(idx, { person, grade: s.grado ?? '', school: s.colegio ?? '' });
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
      <StepHeader title={STEPS[2].title} subtitle={STEPS[2].subtitle} />

      {draft.students.map((s, idx) => {
        const sameAsHolder = idx === 0 && draft.mode === 'independiente';
        const person = studentPerson(draft, idx);
        return (
          <div key={s.key} className="p-5 border border-border-soft rounded-xl space-y-4">
            <div className="flex justify-between items-center">
              <h4 className="font-semibold text-text-primary">Alumno {idx + 1}</h4>
              {idx > 0 && (
                <button type="button" className="text-text-muted hover:text-danger-text" onClick={() => removeStudent(idx)}>
                  <Trash2 size={16} />
                </button>
              )}
            </div>

            {sameAsHolder ? (
              <>
                <PersonForm person={person} onChange={() => undefined} today={today} ageOnDate={draft.context.date} locked />
                <p className="text-xs text-text-muted">Datos tomados del paso Titulares (la misma persona; no se duplican).</p>
              </>
            ) : (
              <PersonForm
                person={s.person}
                onChange={p => setStudent(idx, { person: p })}
                today={today}
                ageOnDate={draft.context.date}
                existing={catalogs.students.map(x => ({ id: x.id, label: x.name, doc: x.doc }))}
                onPickExisting={id => pickExisting(idx, id)}
                onClearExisting={() => setStudent(idx, { person: emptyPerson() })}
                searchPlaceholder="Buscar alumno ya registrado por nombre o documento..."
              />
            )}

            <div className="grid grid-cols-2 gap-4">
              {draft.mode === 'apoderado' && (
                <Field label="Parentesco con el titular" required>
                  <select className={inputCls} value={s.relationship} onChange={e => setStudent(idx, { relationship: e.target.value })}>
                    <option value="">Seleccionar...</option>
                    {RELATIONSHIPS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </Field>
              )}
              <Field label="Grado">
                <input className={inputCls} value={s.grade} onChange={e => setStudent(idx, { grade: e.target.value })} />
              </Field>
              <Field label="Colegio / institución">
                <input className={inputCls} value={s.school} onChange={e => setStudent(idx, { school: e.target.value })} />
              </Field>
            </div>
          </div>
        );
      })}

      <button
        type="button"
        onClick={addStudent}
        className="w-full py-3 border-2 border-dashed border-border-soft rounded-xl text-text-secondary hover:border-primary-accent hover:text-primary-accent transition-all flex items-center justify-center gap-2 font-medium"
      >
        <Plus size={18} /> Agregar alumno
      </button>
    </div>
  );
}
