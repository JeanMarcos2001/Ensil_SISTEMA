import React, { useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { useData, type Guardian } from '../../context/DataContext';
import { emptyPerson, type DraftPerson } from '../../utils/enrollment';
import { buildGuardian, guardianToPerson, validateGuardian } from '../../utils/people';
import { todayLocalISO } from '../../utils/schedule';
import { PersonForm } from '../enrollment/fields';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Titular a editar; `null` para registrar uno nuevo. */
  editing: Guardian | null;
  /** Se llama con el titular creado (para vincularlo, p. ej., desde el panel de alumnos). */
  onSaved?: (guardian: Guardian) => void;
}

/**
 * Alta y edición de un titular (apoderado). Mismos datos y reglas que el titular principal del asistente de matrícula:
 * documento, nombres, nacimiento (mayor de edad), celular, correo, dirección y estado civil.
 */
export function GuardianFormModal({ isOpen, onClose, editing, onSaved }: Props) {
  const { guardians, students, addGuardian, updateGuardian, updateStudent } = useData();
  const today = todayLocalISO();
  const [person, setPerson] = useState<DraftPerson>(emptyPerson());
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    setPerson(editing ? guardianToPerson(editing) : emptyPerson());
    setErrors([]);
  }, [isOpen, editing]);

  const handleSave = () => {
    const found = validateGuardian(person, guardians, today, editing?.id);
    if (found.length > 0) { setErrors(found); return; }
    const data = buildGuardian(person);
    if (editing) {
      updateGuardian(editing.id, data);
      // El nombre del titular principal se guarda también en la ficha de sus alumnos
      students.filter(s => s.guardianIds?.[0] === editing.id && s.titular !== data.name).forEach(s => updateStudent(s.id, { titular: data.name }));
    } else {
      const created = addGuardian(data);
      onSaved?.(created);
    }
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editing ? 'Editar Titular' : 'Nuevo Titular'}
      size="2xl"
      footer={
        <div className="flex justify-end gap-3 w-full">
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="button" variant="primary" onClick={handleSave}>Guardar Titular</Button>
        </div>
      }
    >
      <div className="space-y-5 pb-4">
        {errors.length > 0 && (
          <div className="bg-danger-tint border border-danger-text/20 rounded-xl p-3 flex gap-2 text-sm text-danger-text">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <ul className="space-y-0.5">{errors.map(m => <li key={m}>{m}</li>)}</ul>
          </div>
        )}
        <PersonForm person={person} onChange={setPerson} today={today} ageOnDate={today} extended />
        <p className="text-xs text-text-muted">
          Los alumnos se vinculan al titular desde el panel de alumnos o al registrar una matrícula. El parentesco se indica en cada alumno.
        </p>
      </div>
    </Modal>
  );
}
