import React, { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Plus, Trash2, Edit2, Check, X } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useActionError } from '../../hooks/useActionError';

export function LeadsConfig() {
  const { leadSources, addLeadSource, updateLeadSource, deleteLeadSource, can } = useData();
  const actionError = useActionError();
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const handleAdd = async () => {
    if (!newName.trim()) return;
    const res = await actionError.run(addLeadSource(newName.trim()));
    if (res.ok) setNewName('');
  };

  const handleStartEdit = (id: string, name: string) => {
    setEditingId(id);
    setEditName(name);
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editName.trim()) return;
    const source = leadSources.find(x => x.id === editingId);
    if (source) {
      const res = await actionError.run(updateLeadSource(editingId, editName.trim(), source.status));
      if (!res.ok) return;
    }
    setEditingId(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-text-primary mb-1">Orígenes de Leads</h2>
        <p className="text-sm text-text-secondary">Gestiona los canales por los cuales los prospectos llegan a la institución.</p>
      </div>

      {can('cfg-leads:create') && (
        <div className="flex gap-2 max-w-md">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nuevo origen (ej: TikTok)"
            className="flex-1 h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:border-primary-accent outline-none"
          />
          <Button variant="primary" onClick={handleAdd} className="flex items-center gap-2">
            <Plus size={16} />
            Agregar
          </Button>
        </div>
      )}

      {actionError.error && <p className="rounded-xl bg-danger-tint px-4 py-3 text-sm text-danger-text" role="alert">{actionError.error}</p>}

      <div className="border border-border-soft rounded-xl overflow-hidden bg-surface">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-text-secondary uppercase bg-surface-muted/50">
            <tr>
              <th className="px-4 py-3 font-medium">Nombre</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-soft">
            {leadSources.map((source) => (
              <tr key={source.id} className="hover:bg-surface-muted/30 transition-colors">
                <td className="px-4 py-3">
                  {editingId === source.id ? (
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full h-8 bg-surface border border-border-soft rounded-lg px-2 text-sm focus:border-primary-accent outline-none"
                      autoFocus
                    />
                  ) : (
                    <span className="text-text-primary font-medium">{source.name}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium uppercase ${
                    source.status === 'active' ? 'bg-success-tint text-success-text' : 'bg-surface-muted text-text-muted'
                  }`}>
                    {source.status === 'active' ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    {editingId === source.id ? (
                      <>
                        <button onClick={handleSaveEdit} className="p-1.5 text-success-text hover:bg-success-tint rounded-lg transition-colors">
                          <Check size={14} />
                        </button>
                        <button onClick={() => setEditingId(null)} className="p-1.5 text-text-muted hover:bg-surface-muted rounded-lg transition-colors">
                          <X size={14} />
                        </button>
                      </>
                    ) : (
                      <>
                        {can('cfg-leads:edit') && (
                          <button onClick={() => handleStartEdit(source.id, source.name)} className="p-1.5 text-text-muted hover:text-primary-accent hover:bg-active-tint rounded-lg transition-colors">
                            <Edit2 size={14} />
                          </button>
                        )}
                        {can('cfg-leads:delete') && (
                          <button onClick={() => void actionError.run(deleteLeadSource(source.id))} className="p-1.5 text-text-muted hover:text-danger-text hover:bg-danger-tint rounded-lg transition-colors">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {leadSources.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-text-muted">
                  No hay orígenes de leads configurados
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
