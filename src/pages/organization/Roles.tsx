import React, { useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { ActionMenu } from '../../components/ui/ActionMenu';
import { Modal } from '../../components/ui/Modal';
import { HelpPopover } from '../../components/ui/HelpPopover';
import { Search, Plus, Shield, Users, Settings, AlertTriangle } from 'lucide-react';
import { useTablePagination } from '../../hooks/useTablePagination';
import { useData } from '../../context/DataContext';

interface RolesProps {
  onNavigate?: (item: string, state?: any) => void;
}

export function Roles({ onNavigate }: RolesProps) {
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const { roles, addRole, updateRole, deleteRole } = useData();

  const [formData, setFormData] = useState({
    name: '',
    desc: '',
    baseRole: '',
    status: 'Activo',
    observations: ''
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const filteredRoles = roles.filter(r => {
    const matchesSearch = r.name.toLowerCase().includes(searchTerm.toLowerCase()) || r.desc.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter ? r.status.toLowerCase() === statusFilter.toLowerCase() : true;
    return matchesSearch && matchesStatus;
  });

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = useTablePagination();

  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter]);

  const totalPages = Math.ceil(filteredRoles.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedRoles = filteredRoles.slice(startIndex, endIndex);

  const handleOpenDetail = (id: string) => {
    setSelectedRole(id);
    setIsDetailOpen(true);
  };

  const handleOpenForm = (id?: string) => {
    setSelectedRole(id || null);
    if (id) {
      const role = roles.find(r => r.id === id);
      setFormData({
        name: role?.name || '',
        desc: role?.desc || '',
        baseRole: role?.baseRole || '',
        status: role?.status || 'Activo',
        observations: role?.observations || ''
      });
    } else {
      setFormData({
        name: '',
        desc: '',
        baseRole: '',
        status: 'Activo',
        observations: ''
      });
    }
    setErrors({});
    setIsDetailOpen(false);
    setIsFormOpen(true);
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) {
      newErrors.name = 'El nombre del rol es obligatorio';
    } else {
      const isDuplicate = roles.some(r => r.name.toLowerCase() === formData.name.trim().toLowerCase() && r.id !== selectedRole);
      if (isDuplicate) {
        newErrors.name = 'Ya existe un rol con este nombre';
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = () => {
    if (validateForm()) {
      const newRoleData = {
        name: formData.name,
        desc: formData.desc,
        status: formData.status as 'Activo' | 'Inactivo',
        baseRole: formData.baseRole,
        observations: formData.observations,
        users: selectedRole ? (roles.find(r => r.id === selectedRole)?.users || 0) : 0
      };

      if (selectedRole) {
        updateRole(selectedRole, newRoleData);
      } else {
        addRole({
          ...newRoleData,
          id: `ROL-${Date.now().toString().slice(-3)}`
        });
      }
      setIsFormOpen(false);
    }
  };

  const handleSaveAndConfigure = () => {
    if (validateForm()) {
      const newRoleData = {
        name: formData.name,
        desc: formData.desc,
        status: formData.status as 'Activo' | 'Inactivo',
        baseRole: formData.baseRole,
        observations: formData.observations,
        users: selectedRole ? (roles.find(r => r.id === selectedRole)?.users || 0) : 0
      };

      let newRoleId = selectedRole;
      if (selectedRole) {
        updateRole(selectedRole, newRoleData);
      } else {
        newRoleId = `ROL-${Date.now().toString().slice(-3)}`;
        addRole({
          ...newRoleData,
          id: newRoleId
        });
      }
      setIsFormOpen(false);
      onNavigate?.('Permisos', { selectedRoleId: newRoleId });
    }
  };

  const handleDelete = (id: string) => {
    setSelectedRole(id);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = () => {
    if (selectedRole) {
      deleteRole(selectedRole);
      setIsDeleteModalOpen(false);
      setSelectedRole(null);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-text-primary mb-1">Roles</h2>
          <p className="text-sm text-text-secondary">Gestión de roles y perfiles de acceso</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="primary" className="flex items-center gap-2" onClick={() => handleOpenForm()}>
            <Plus size={16} />
            Nuevo Rol
          </Button>
          
          <HelpPopover title="¿Qué es un rol base?">
            <div className="space-y-4">
              <p>
                <strong className="text-text-primary font-medium">Un rol base es una plantilla inicial de permisos.</strong><br />
                Sirve para crear nuevos roles más rápido sin empezar desde cero.
              </p>
              
              <div>
                <h5 className="text-text-primary font-medium mb-1">Cómo funciona</h5>
                <ul className="list-disc pl-4 space-y-1">
                  <li>Si eliges un rol base, el nuevo rol copiará sus permisos iniciales.</li>
                  <li>Luego podrás ajustar esos permisos en la matriz de permisos.</li>
                  <li>Si no eliges un rol base, el nuevo rol se crea vacío y configuras todo manualmente.</li>
                </ul>
              </div>

              <div>
                <h5 className="text-text-primary font-medium mb-1">Roles base del sistema</h5>
                <ul className="list-disc pl-4 space-y-1">
                  <li>Superadmin</li>
                  <li>Administración</li>
                  <li>Filial</li>
                  <li>Logística</li>
                  <li>Psicopedagogía</li>
                </ul>
              </div>

              <div className="bg-surface-muted p-3 rounded-xl border border-border-soft">
                <h5 className="text-text-primary font-medium mb-1 flex items-center gap-1.5">
                  <AlertTriangle size={14} className="text-warning-text" />
                  Importante
                </h5>
                <ul className="list-disc pl-4 space-y-1 text-xs">
                  <li>Elegir un rol base es opcional.</li>
                  <li>No reemplaza la configuración final de permisos.</li>
                  <li>Solo sirve como punto de partida.</li>
                </ul>
              </div>
            </div>
          </HelpPopover>
        </div>
      </div>

      {/* Main Content Card (Filters + Table + Pagination) */}
      <div className="bg-surface border border-border-soft rounded-xl shadow-sm flex-1 flex flex-col overflow-hidden">
        {/* Filters */}
        <div className="p-4 border-b border-border-soft">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
              <input 
                type="text" 
                placeholder="Buscar por nombre o descripción..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full h-10 bg-surface border border-border-soft rounded-xl pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary-accent focus:ring-1 focus:ring-primary-accent transition-shadow"
              />
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 md:pb-0">
              <select 
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent min-w-[140px]"
              >
                <option value="">Estado</option>
                <option value="Activo">Activo</option>
                <option value="Inactivo">Inactivo</option>
              </select>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-text-secondary uppercase bg-surface-muted/50 sticky top-0 z-10">
              <tr>
                <th className="px-6 py-3 font-medium">Nombre del Rol</th>
                <th className="px-6 py-3 font-medium">Descripción</th>
                <th className="px-6 py-3 font-medium">Usuarios Asignados</th>
                <th className="px-6 py-3 font-medium">Estado</th>
                <th className="px-6 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-soft">
              {paginatedRoles.map((row, idx) => (
                <tr key={idx} className="hover:bg-surface-muted/50 transition-colors even:bg-surface-muted/30">
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-2">
                      <Shield size={16} className="text-primary-accent" />
                      <span className="font-medium text-text-primary">{row.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-3 text-text-secondary">{row.desc}</td>
                  <td className="px-6 py-3 text-text-secondary">
                    <div className="flex items-center gap-1.5">
                      <Users size={14} className="text-text-muted" />
                      {row.users} usuarios
                    </div>
                  </td>
                  <td className="px-6 py-3">
                    <Badge variant={row.status === 'Activo' ? 'success' : 'neutral'}>{row.status}</Badge>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <ActionMenu 
                      items={[
                        { label: 'Ver detalles', onClick: () => handleOpenDetail(row.id) },
                        { label: 'Editar rol', onClick: () => handleOpenForm(row.id) },
                        { label: 'Configurar permisos', onClick: () => onNavigate?.('Permisos', { selectedRoleId: row.id }) },
                        { label: 'Ver usuarios', onClick: () => onNavigate?.('Usuarios') },
                        { label: 'Eliminar rol', onClick: () => handleDelete(row.id), danger: true },
                      ]} 
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="p-4 border-t border-border-soft flex items-center justify-between bg-surface">
          <span className="text-sm text-text-secondary">
            Mostrando {filteredRoles.length > 0 ? startIndex + 1 : 0} a {Math.min(endIndex, filteredRoles.length)} de {filteredRoles.length} registros
          </span>
          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
            >
              Anterior
            </Button>
            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }).map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentPage(i + 1)}
                  className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                    currentPage === i + 1 
                      ? 'bg-primary-accent text-white' 
                      : 'text-text-secondary hover:bg-surface-muted'
                  }`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
            <Button 
              variant="ghost" 
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages || totalPages === 0}
            >
              Siguiente
            </Button>
          </div>
        </div>
      </div>

      {/* Detail Modal */}
      <Modal 
        isOpen={isDetailOpen} 
        onClose={() => setIsDetailOpen(false)} 
        title={`Detalle de Rol`}
        size="xl"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setIsDetailOpen(false)}>Cerrar</Button>
            <Button variant="primary" onClick={() => { setIsDetailOpen(false); onNavigate?.('Permisos', { selectedRoleId: selectedRole }); }}>Configurar Permisos</Button>
          </div>
        }
      >
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-primary-accent/10 rounded-xl flex items-center justify-center text-primary-accent">
              <Shield size={32} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-text-primary">{roles.find(r => r.id === selectedRole)?.name}</h3>
              <p className="text-sm text-text-secondary">Código: {selectedRole}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <span className="text-xs text-text-muted uppercase tracking-wider">Usuarios Asignados</span>
              <p className="text-sm font-medium text-text-primary flex items-center gap-1">
                <Users size={14} className="text-text-muted" />
                {roles.find(r => r.id === selectedRole)?.users} usuarios
              </p>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-text-muted uppercase tracking-wider">Creado el</span>
              <p className="text-sm font-medium text-text-primary">10/01/2024</p>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-text-muted uppercase tracking-wider">Estado</span>
              <Badge variant={roles.find(r => r.id === selectedRole)?.status === 'Activo' ? 'success' : 'neutral'}>
                {roles.find(r => r.id === selectedRole)?.status}
              </Badge>
            </div>
          </div>

          <div className="border-t border-border-soft pt-4">
            <h4 className="text-sm font-bold text-text-primary mb-3">Descripción</h4>
            <p className="text-sm text-text-secondary">
              {roles.find(r => r.id === selectedRole)?.desc || 'Sin descripción.'}
            </p>
          </div>

          {roles.find(r => r.id === selectedRole)?.baseRole && (
            <div className="border-t border-border-soft pt-4">
              <h4 className="text-sm font-bold text-text-primary mb-3">Rol Base de Referencia</h4>
              <p className="text-sm text-text-secondary capitalize">
                {roles.find(r => r.id === selectedRole)?.baseRole}
              </p>
            </div>
          )}

          {roles.find(r => r.id === selectedRole)?.observations && (
            <div className="border-t border-border-soft pt-4">
              <h4 className="text-sm font-bold text-text-primary mb-3">Observaciones</h4>
              <p className="text-sm text-text-secondary whitespace-pre-wrap">
                {roles.find(r => r.id === selectedRole)?.observations}
              </p>
            </div>
          )}

          <div className="border-t border-border-soft pt-4">
            <h4 className="text-sm font-bold text-text-primary mb-3">Permisos y Accesos</h4>
            <div className="bg-surface-muted p-4 rounded-xl border border-border-soft flex items-start gap-3">
              <Settings className="text-text-muted mt-0.5" size={16} />
              <div>
                <p className="text-sm font-medium text-text-primary mb-1">Gestión centralizada</p>
                <p className="text-xs text-text-secondary">
                  Los permisos de este rol se gestionan a nivel de módulo y funcionalidad en la matriz de permisos.
                </p>
              </div>
            </div>
          </div>
        </div>
      </Modal>

      {/* Form Modal */}
      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={selectedRole ? 'Editar Rol' : 'Nuevo Rol'}
        size="xl"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setIsFormOpen(false)}>Cancelar</Button>
            <Button variant="secondary" onClick={handleSave}>
              Guardar Rol
            </Button>
            <Button variant="primary" onClick={handleSaveAndConfigure}>
              Guardar y configurar permisos
            </Button>
          </div>
        }
      >
        <form className="space-y-6" onSubmit={(e) => e.preventDefault()}>
          {/* Bloque 1: Identidad */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-border-soft">
              <Shield size={18} className="text-primary-accent" />
              <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider">Bloque 1: Identidad</h3>
            </div>
            
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-text-secondary">Nombre del Rol <span className="text-error">*</span></label>
              <input 
                type="text" 
                value={formData.name}
                onChange={(e) => {
                  setFormData({ ...formData, name: e.target.value });
                  if (errors.name) setErrors({ ...errors, name: '' });
                }}
                className={`w-full h-10 bg-surface border ${errors.name ? 'border-error' : 'border-border-soft'} rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent`}
                placeholder="Ej. Coordinador Académico"
              />
              {errors.name && <p className="text-xs text-error">{errors.name}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-text-secondary">Descripción</label>
              <textarea 
                value={formData.desc}
                onChange={(e) => setFormData({ ...formData, desc: e.target.value })}
                className="w-full h-20 bg-surface border border-border-soft rounded-xl p-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent resize-none"
                placeholder="Describe las responsabilidades y alcance de este rol..."
              />
            </div>
          </section>

          {/* Bloque 2: Configuración inicial */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-border-soft">
              <Settings size={18} className="text-primary-accent" />
              <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider">Bloque 2: Configuración inicial</h3>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-text-secondary">Rol base de referencia (Opcional)</label>
                <select 
                  value={formData.baseRole}
                  onChange={(e) => setFormData({ ...formData, baseRole: e.target.value })}
                  className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent"
                  disabled={!!selectedRole}
                >
                  <option value="">Ninguno (Crear desde cero)</option>
                  <option value="superadmin">Superadmin</option>
                  <option value="administracion">Administración</option>
                  <option value="filial">Filial</option>
                  <option value="logistica">Logística</option>
                  <option value="psicopedagogia">Psicopedagogía</option>
                </select>
                {!selectedRole && <p className="text-[10px] text-text-muted">Copia los permisos iniciales de un rol existente.</p>}
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-text-secondary">Estado <span className="text-error">*</span></label>
                <select 
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent"
                >
                  <option value="Activo">Activo</option>
                  <option value="Inactivo">Inactivo</option>
                </select>
              </div>
            </div>
          </section>

          {/* Bloque 3: Interno */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-border-soft">
              <AlertTriangle size={18} className="text-primary-accent" />
              <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider">Bloque 3: Interno</h3>
            </div>
            
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-text-secondary">Observaciones</label>
              <textarea 
                value={formData.observations}
                onChange={(e) => setFormData({ ...formData, observations: e.target.value })}
                className="w-full h-20 bg-surface border border-border-soft rounded-xl p-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent resize-none"
                placeholder="Notas internas sobre este rol..."
              />
            </div>
          </section>

          <div className="bg-primary-accent/5 border border-primary-accent/20 rounded-xl p-4 mt-4">
            <div className="flex items-start gap-3">
              <Shield className="text-primary-accent mt-0.5" size={16} />
              <div>
                <h4 className="text-sm font-medium text-text-primary mb-1">Configuración de Permisos</h4>
                <p className="text-xs text-text-secondary">
                  Los permisos específicos por módulo se configuran en la sección de Permisos una vez guardado el rol.
                </p>
              </div>
            </div>
          </div>
        </form>
      </Modal>

      {/* Delete Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Eliminar Rol"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setIsDeleteModalOpen(false)}>Cancelar</Button>
            <Button variant="danger" onClick={confirmDelete}>Eliminar Rol</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3 text-error">
            <AlertTriangle size={24} />
            <p className="text-sm font-medium">¿Estás seguro de que deseas eliminar este rol?</p>
          </div>
          <p className="text-sm text-text-secondary">
            Esta acción no se puede deshacer. Los usuarios que tengan asignado este rol perderán los permisos asociados. Asegúrate de reasignar los usuarios antes de eliminar el rol.
          </p>
        </div>
      </Modal>
    </div>
  );
}
