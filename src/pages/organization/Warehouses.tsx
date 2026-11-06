import React, { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { ActionMenu } from '../../components/ui/ActionMenu';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Plus, Search, Info } from 'lucide-react';
import { useData, type Warehouse } from '../../context/DataContext';
import { OrgDbNotice } from '../../components/organization/OrgDbNotice';
import { warehouseFieldErrors } from '../../utils/orgDirectory';

type Form = { name: string; companyId: string; address: string; observations: string; status: Warehouse['status'] };
const EMPTY: Form = { name: '', companyId: '', address: '', observations: '', status: 'Activo' };

/**
 * Organización → Almacenes: el almacén central, aparte de las sedes. Recibe compras, despacha a las sedes y recibe devoluciones; no vende.
 * Los almacenes están guardados en la base de datos; su stock sigue en datos de ejemplo hasta que el stock pase a la base, por eso aquí
 * no se muestran unidades.
 */
export function Warehouses() {
  const { orgWarehouses: warehouses, orgCompanies: companies, orgDirectory, addWarehouse, updateWarehouse, can } = useData();
  const [searchTerm, setSearchTerm] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState<Warehouse | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const rows = warehouses.filter(w => w.id.toLowerCase().includes(searchTerm.toLowerCase()) || w.name.toLowerCase().includes(searchTerm.toLowerCase()));

  const companyOptions = [
    { value: '', label: 'Sin definir todavía' },
    ...companies.filter(c => c.status === 'Activo' || c.id === editing?.companyId).map(c => ({ value: c.id, label: c.name })),
  ];

  const open = (warehouse?: Warehouse) => {
    setEditing(warehouse ?? null);
    setForm(warehouse ? { name: warehouse.name, companyId: warehouse.companyId ?? '', address: warehouse.address ?? '', observations: warehouse.observations ?? '', status: warehouse.status } : EMPTY);
    setErrors({});
    setIsFormOpen(true);
  };

  const save = async () => {
    if (saving) return;
    const data = { name: form.name, companyId: form.companyId || undefined, address: form.address.trim() || undefined, observations: form.observations.trim() || undefined, status: form.status };
    const found = warehouseFieldErrors(data, warehouses, companies, editing?.id);
    if (Object.keys(found).length > 0) { setErrors(found); return; }
    setSaving(true);
    const result = editing ? await updateWarehouse(editing.id, data) : await addWarehouse(data);
    setSaving(false);
    if (!result.ok) { setErrors({ form: result.error ?? 'No se pudo guardar el almacén.' }); return; }
    setIsFormOpen(false);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-text-primary mb-1">Almacenes</h2>
          <p className="text-sm text-text-secondary">El almacén central abastece a las sedes. No vende y su stock es propio: nunca se mezcla con el de venta de una sede.</p>
        </div>
        {can('org-almacenes:create') && (
          <Button variant="primary" className="flex items-center gap-2" disabled={orgDirectory.status !== 'ready'} onClick={() => open()}>
            <Plus size={16} />
            Nuevo Almacén
          </Button>
        )}
      </div>

      <OrgDbNotice />

      <div className="bg-surface border border-border-soft rounded-xl shadow-sm flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-border-soft">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
            <input
              type="text"
              placeholder="Buscar por código o nombre..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-10 bg-surface border border-border-soft rounded-xl pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary-accent focus:ring-1 focus:ring-primary-accent transition-shadow"
            />
          </div>
        </div>
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-text-secondary uppercase bg-surface-muted/50 sticky top-0 z-10">
              <tr>
                <th className="px-6 py-3 font-medium">Código</th>
                <th className="px-6 py-3 font-medium">Almacén</th>
                <th className="px-6 py-3 font-medium">Empresa</th>
                <th className="px-6 py-3 font-medium">Estado</th>
                <th className="px-6 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-soft">
              {rows.map(w => (
                <tr key={w.id} className="hover:bg-surface-muted/50 transition-colors even:bg-surface-muted/30">
                  <td className="px-6 py-3 font-mono text-xs text-text-secondary">{w.id}</td>
                  <td className="px-6 py-3">
                    <div className="flex flex-col">
                      <span className="font-medium text-text-primary">{w.name}</span>
                      {w.address && <span className="text-xs text-text-muted">{w.address}</span>}
                    </div>
                  </td>
                  <td className="px-6 py-3 text-text-secondary">{w.company || '—'}</td>
                  <td className="px-6 py-3"><Badge variant={w.status === 'Activo' ? 'success' : 'neutral'}>{w.status}</Badge></td>
                  <td className="px-6 py-3 text-right">
                    <ActionMenu items={[{ label: 'Editar almacén', hidden: !can('org-almacenes:edit'), onClick: () => open(w) }]} />
                  </td>
                </tr>
              ))}
              {orgDirectory.status === 'ready' && rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-text-muted">
                    {warehouses.length === 0 ? 'Aún no hay almacenes guardados. Sin almacén central no hay envíos ni transferencias: cree el primero con «Nuevo Almacén».' : 'Ningún almacén coincide con la búsqueda.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editing ? 'Editar Almacén' : 'Nuevo Almacén'}
        size="lg"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setIsFormOpen(false)}>Cancelar</Button>
            <Button variant="primary" onClick={save} disabled={saving}>{saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear almacén'}</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="flex items-start gap-2 p-3 bg-surface-muted rounded-lg text-xs text-text-secondary">
            <Info size={14} className="mt-0.5 shrink-0" />
            <span>Solo puede haber un almacén central activo. Un almacén con mercadería no se inactiva: primero se envía o se ajusta su stock. El código (ALM-001…) lo asigna el sistema.</span>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-text-secondary">Nombre *</label>
            <Input value={form.name} onChange={(e) => { setForm({ ...form, name: e.target.value }); setErrors({ ...errors, name: '', form: '' }); }} error={errors.name} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-text-secondary">Empresa</label>
            <Select value={form.companyId} onChange={(e) => { setForm({ ...form, companyId: e.target.value }); setErrors({ ...errors, companyId: '', form: '' }); }} options={companyOptions} error={errors.companyId} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-text-secondary">Dirección</label>
            <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-text-secondary">Observaciones</label>
            <Input value={form.observations} onChange={(e) => setForm({ ...form, observations: e.target.value })} />
          </div>
          {editing && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-text-secondary">Estado</label>
              <Select
                value={form.status}
                onChange={(e) => { setForm({ ...form, status: e.target.value as Warehouse['status'] }); setErrors({ ...errors, status: '', form: '' }); }}
                options={[{ value: 'Activo', label: 'Activo' }, { value: 'Inactivo', label: 'Inactivo' }]}
                error={errors.status}
              />
            </div>
          )}
          {errors.status && !editing && <p className="text-sm text-danger-text">{errors.status}</p>}
          {errors.form && <p className="text-sm text-danger-text" role="alert">{errors.form}</p>}
        </div>
      </Modal>
    </div>
  );
}
