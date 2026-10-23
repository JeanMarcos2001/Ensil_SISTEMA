import React, { useEffect, useState } from 'react';
import { AlertCircle, Plus, Star, X } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { useData, type Student } from '../../context/DataContext';
import { emptyStudent, type DraftStudent } from '../../utils/enrollment';
import {
  NO_ENROLLMENT,
  RELATIONSHIPS,
  buildStudent,
  studentToInput,
  validateStudentInput,
  type StudentInput,
  type StudentMode,
} from '../../utils/people';
import { todayLocalISO } from '../../utils/schedule';
import { Field, PersonForm, inputCls } from '../enrollment/fields';
import { StudentSituation } from '../enrollment/StudentSituation';
import { GuardianFormModal } from './GuardianFormModal';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Alumno a editar; `null` para registrar uno nuevo. */
  editing: Student | null;
}

/**
 * Alta y edición de un alumno. Mismos datos y reglas que el paso Alumnos del asistente de matrícula:
 *  - Con apoderado: titular(es) registrados (el primero es el principal) y parentesco; sin teléfono propio.
 *  - Independiente: es su propio titular y su teléfono es obligatorio.
 * Programa, nivel, horario y sede salen de la matrícula: el alumno nuevo queda «Sin matrícula».
 */
export function StudentFormModal({ isOpen, onClose, editing }: Props) {
  const { students, guardians, addStudent, updateStudent } = useData();
  const today = todayLocalISO();
  const [mode, setMode] = useState<StudentMode>('apoderado');
  const [ds, setDs] = useState<DraftStudent>(emptyStudent());
  const [guardianIds, setGuardianIds] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [newGuardianOpen, setNewGuardianOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const init: StudentInput = editing ? studentToInput(editing, guardians) : { mode: 'apoderado', guardianIds: [], student: emptyStudent() };
    setMode(init.mode);
    setDs(init.student);
    setGuardianIds(init.guardianIds);
    setQuery('');
    setErrors([]);
  }, [isOpen, editing]);

  const input: StudentInput = { mode, student: ds, guardianIds };
  const matches = query.trim().length >= 2
    ? guardians
        .filter(g => !guardianIds.includes(g.id) && `${g.name} ${g.doc}`.toLowerCase().includes(query.trim().toLowerCase()))
        .slice(0, 6)
    : [];

  const handleSave = () => {
    const found = validateStudentInput(input, students, guardians, today, editing?.id);
    if (found.length > 0) { setErrors(found); return; }
    const record = buildStudent(input, guardians, today, editing ?? undefined);
    if (editing) updateStudent(editing.id, record);
    else addStudent(record);
    onClose();
  };

  const modeBtn = (id: StudentMode, label: string) => (
    <button
      key={id}
      type="button"
      aria-pressed={mode === id}
      onClick={() => { setMode(id); setErrors([]); }}
      className={`flex-1 h-10 rounded-xl border text-sm font-medium transition-colors ${
        mode === id ? 'bg-primary-accent text-white border-primary-accent' : 'bg-surface text-text-secondary border-border-soft hover:border-primary-accent hover:text-primary-accent'
      }`}
    >
      {label}
    </button>
  );

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={editing ? 'Editar Alumno' : 'Nuevo Alumno'}
        size="3xl"
        footer={
          <div className="flex justify-end gap-3 w-full">
            <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button type="button" variant="primary" onClick={handleSave}>Guardar Alumno</Button>
          </div>
        }
      >
        <div className="space-y-6 pb-4">
          {errors.length > 0 && (
            <div className="bg-danger-tint border border-danger-text/20 rounded-xl p-3 flex gap-2 text-sm text-danger-text">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <ul className="space-y-0.5">{errors.map(m => <li key={m}>{m}</li>)}</ul>
            </div>
          )}

          <section className="space-y-3">
            <h4 className="text-sm font-bold text-text-primary uppercase tracking-wider">Responsable</h4>
            <div className="flex gap-3">
              {modeBtn('apoderado', 'Con apoderado')}
              {modeBtn('independiente', 'Independiente')}
            </div>

            {mode === 'apoderado' ? (
              <div className="space-y-3">
                <Field label="Titular(es)" required hint="El primero es el titular principal. Búsquelo por nombre o documento.">
                  <div className="space-y-2">
                    {guardianIds.map((id, i) => {
                      const g = guardians.find(x => x.id === id);
                      return (
                        <div key={id} className="flex items-center justify-between gap-3 bg-success-tint border border-border-soft rounded-xl px-3 py-2">
                          <div className="text-sm">
                            <p className="font-semibold text-text-primary">{g?.name ?? id}{i === 0 && <span className="ml-2 inline-flex items-center gap-1 text-xs font-medium text-primary-accent"><Star size={11} /> Principal</span>}</p>
                            <p className="text-xs text-text-secondary">{g?.doc} · {g?.phone}</p>
                          </div>
                          <button type="button" onClick={() => setGuardianIds(guardianIds.filter(x => x !== id))} className="text-text-muted hover:text-danger-text" aria-label="Quitar titular">
                            <X size={16} />
                          </button>
                        </div>
                      );
                    })}
                    <input
                      className={inputCls}
                      value={query}
                      onChange={e => setQuery(e.target.value)}
                      placeholder={guardianIds.length ? 'Agregar otro titular...' : 'Buscar titular por nombre o documento (mínimo 2 caracteres)...'}
                    />
                    {matches.length > 0 && (
                      <div className="border border-border-soft rounded-xl overflow-hidden bg-surface">
                        {matches.map(g => (
                          <button
                            key={g.id}
                            type="button"
                            className="w-full text-left px-3 py-2 text-sm hover:bg-surface-muted border-b border-border-soft last:border-0"
                            onClick={() => { setGuardianIds([...guardianIds, g.id]); setQuery(''); }}
                          >
                            <span className="font-medium text-text-primary">{g.name}</span>
                            <span className="text-text-muted"> · {g.doc}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {query.trim().length >= 2 && matches.length === 0 && <p className="text-xs text-text-muted">No hay titulares que coincidan.</p>}
                    <button type="button" onClick={() => setNewGuardianOpen(true)} className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-accent hover:underline">
                      <Plus size={14} /> Registrar un titular nuevo
                    </button>
                  </div>
                </Field>
                <div className="max-w-xs">
                  <Field label="Parentesco con el titular" required>
                    <select className={inputCls} value={ds.relationship} onChange={e => setDs({ ...ds, relationship: e.target.value })}>
                      <option value="">Seleccionar...</option>
                      {RELATIONSHIPS.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </Field>
                </div>
              </div>
            ) : (
              <p className="text-sm text-text-secondary bg-surface-muted rounded-xl px-3 py-2.5">
                El alumno independiente es su propio titular: no tiene apoderado y su teléfono es obligatorio.
              </p>
            )}
          </section>

          <section className="space-y-3 border-t border-border-soft pt-6">
            <h4 className="text-sm font-bold text-text-primary uppercase tracking-wider">Datos del alumno</h4>
            <PersonForm
              person={ds.person}
              onChange={p => setDs({ ...ds, person: p })}
              today={today}
              ageOnDate={today}
              hidePhone={mode === 'apoderado'}
            />
            <StudentSituation student={ds} onChange={patch => setDs({ ...ds, ...patch })} />
          </section>

          <p className="text-xs text-text-muted">
            {editing
              ? 'El programa, el nivel y el horario del alumno se gestionan desde sus matrículas.'
              : `El alumno quedará «${NO_ENROLLMENT}» hasta que se registre su primera matrícula; entonces se activa y aparece en Programación.`}
          </p>
        </div>
      </Modal>

      <GuardianFormModal
        isOpen={newGuardianOpen}
        onClose={() => setNewGuardianOpen(false)}
        editing={null}
        onSaved={g => setGuardianIds(ids => [...ids, g.id])}
      />
    </>
  );
}
