import React, { useState } from 'react';
import { AlertCircle, Check, Edit2, Plus, Power, Trash2 } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { useData, ClassSchedule } from '../../context/DataContext';

const inputCls =
  'w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none';

interface FormState {
  name: string;
  allBranches: boolean;
  branchIds: string[];
}

const emptyForm: FormState = { name: '', allBranches: true, branchIds: [] };

/**
 * Configuración → CRUDS Básicos → Horarios de clases.
 * Alimenta el selector «Horario de clases» del asistente de matrícula (filtrado por sede).
 */
export function ClassSchedulesConfig() {
  const { classSchedules, branches, addClassSchedule, updateClassSchedule, deleteClassSchedule } = useData();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const branchName = (id: string) => branches.find(b => b.id === id)?.name ?? id;
  const scopeLabel = (h: ClassSchedule) => (h.allBranches ? 'Todas las sedes' : h.branchIds.map(branchName).join(', '));

  const reset = () => { setForm(emptyForm); setEditingId(null); setError(null); };

  const submit = () => {
    setError(null);
    const result = editingId ? updateClassSchedule(editingId, form) : addClassSchedule({ ...form, status: 'Activo' });
    if (!result.ok) { setError(result.error || 'No se pudo guardar el horario.'); return; }
    reset();
  };

  const startEdit = (h: ClassSchedule) => {
    setEditingId(h.id);
    setForm({ name: h.name, allBranches: h.allBranches, branchIds: h.branchIds });
    setError(null);
  };

  const toggleBranch = (id: string) =>
    setForm(f => ({ ...f, branchIds: f.branchIds.includes(id) ? f.branchIds.filter(b => b !== id) : [...f.branchIds, id] }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-text-primary mb-1">Horarios de clases</h2>
        <p className="text-sm text-text-secondary">
          Horarios que se ofrecen al matricular un alumno. Cada horario puede estar disponible en todas las sedes o solo en algunas.
        </p>
      </div>

      <div className="p-4 border border-border-soft rounded-xl bg-surface-muted/30 space-y-4 max-w-2xl">
        <h3 className="text-sm font-semibold text-text-primary">{editingId ? 'Editar horario' : 'Nuevo horario'}</h3>
        {error && (
          <div className="bg-danger-tint border border-danger-text/20 rounded-xl p-3 flex items-center gap-2 text-sm text-danger-text">
            <AlertCircle size={16} className="shrink-0" />
            <p>{error}</p>
          </div>
        )}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-text-secondary">Nombre del horario <span className="text-error">*</span></label>
          <input
            className={inputCls}
            value={form.name}
            placeholder="Ej. L-M-V 4:00 PM"
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          />
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            className="w-4 h-4 rounded border-border-soft text-primary-accent"
            checked={form.allBranches}
            onChange={e => setForm(f => ({ ...f, allBranches: e.target.checked, branchIds: e.target.checked ? [] : f.branchIds }))}
          />
          Disponible en todas las sedes
        </label>
        {!form.allBranches && (
          <div className="flex flex-wrap gap-2">
            {branches.map(b => {
              const on = form.branchIds.includes(b.id);
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => toggleBranch(b.id)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    on ? 'bg-primary-accent text-white border-primary-accent' : 'bg-surface text-text-secondary border-border-soft hover:border-primary-accent'
                  }`}
                >
                  {b.name}
                </button>
              );
            })}
          </div>
        )}
        <div className="flex gap-2">
          <Button variant="primary" onClick={submit} className="flex items-center gap-2">
            {editingId ? <Check size={16} /> : <Plus size={16} />}
            {editingId ? 'Guardar cambios' : 'Agregar horario'}
          </Button>
          {editingId && <Button variant="ghost" onClick={reset}>Cancelar</Button>}
        </div>
      </div>

      <div className="border border-border-soft rounded-xl overflow-hidden bg-surface">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-text-secondary uppercase bg-surface-muted/50">
            <tr>
              <th className="px-4 py-3 font-medium">Horario</th>
              <th className="px-4 py-3 font-medium">Sedes</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-soft">
            {classSchedules.map(h => (
              <tr key={h.id} className="hover:bg-surface-muted/30 transition-colors">
                <td className="px-4 py-3 font-medium text-text-primary">{h.name}</td>
                <td className="px-4 py-3 text-text-secondary">{scopeLabel(h)}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium uppercase ${
                    h.status === 'Activo' ? 'bg-success-tint text-success-text' : 'bg-surface-muted text-text-muted'
                  }`}>
                    {h.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    <button
                      title="Editar"
                      onClick={() => startEdit(h)}
                      className="p-1.5 text-text-muted hover:text-primary-accent hover:bg-active-tint rounded-lg transition-colors"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      title={h.status === 'Activo' ? 'Inactivar' : 'Activar'}
                      onClick={() => updateClassSchedule(h.id, { status: h.status === 'Activo' ? 'Inactivo' : 'Activo' })}
                      className="p-1.5 text-text-muted hover:text-warning-text hover:bg-warning-tint rounded-lg transition-colors"
                    >
                      <Power size={14} />
                    </button>
                    <button
                      title="Eliminar"
                      onClick={() => {
                        const r = deleteClassSchedule(h.id);
                        setError(r.ok ? null : r.error || 'No se pudo eliminar.');
                      }}
                      className="p-1.5 text-text-muted hover:text-danger-text hover:bg-danger-tint rounded-lg transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {classSchedules.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-text-muted">No hay horarios configurados</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-text-muted">
        Un horario en uso no se puede eliminar; inactívelo para dejar de ofrecerlo.
      </p>
    </div>
  );
}
