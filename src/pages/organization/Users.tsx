import React, { useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { ActionMenu } from '../../components/ui/ActionMenu';
import { Modal } from '../../components/ui/Modal';
import { Search, Plus, Shield, Users as UsersIcon, Settings, Mail, Phone, AlertTriangle } from 'lucide-react';
import { useTablePagination } from '../../hooks/useTablePagination';
import { useData } from '../../context/DataContext';

export function Users() {
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [isResetPasswordModalOpen, setIsResetPasswordModalOpen] = useState(false);
  const [isDeactivateModalOpen, setIsDeactivateModalOpen] = useState(false);

  const { users, branches, addUser, updateUser } = useData();

  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    document: '',
    phone: '',
    email: '',
    role: '',
    mainBranch: '',
    additionalBranches: [] as string[],
    passwordType: 'auto' as 'auto' | 'manual',
    password: '',
    status: 'Activo'
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const filteredUsers = users.filter(u => {
    const matchesSearch = u.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         u.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter ? u.role.toLowerCase().includes(roleFilter.toLowerCase()) : true;
    const matchesBranch = branchFilter ? u.branch.toLowerCase().includes(branchFilter.toLowerCase()) : true;
    const matchesStatus = statusFilter ? u.status.toLowerCase() === statusFilter.toLowerCase() : true;
    return matchesSearch && matchesRole && matchesBranch && matchesStatus;
  });

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = useTablePagination();

  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, roleFilter, branchFilter, statusFilter]);

  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedUsers = filteredUsers.slice(startIndex, endIndex);

  const handleOpenDetail = (id: string) => {
    setSelectedUser(id);
    setIsDetailOpen(true);
  };

  const handleResetPassword = (id: string) => {
    setSelectedUser(id);
    setIsResetPasswordModalOpen(true);
  };

  const handleDeactivate = (id: string) => {
    setSelectedUser(id);
    setIsDeactivateModalOpen(true);
  };

  const handleOpenForm = (id?: string) => {
    setSelectedUser(id || null);
    if (id) {
      const user = users.find(u => u.id === id);
      if (user) {
        const [firstName, ...lastNameParts] = user.name.split(' ');
        setFormData({
          firstName: firstName || '',
          lastName: lastNameParts.join(' ') || '',
          document: user.document || '45678912', // Mock data fallback
          phone: user.phone || '+51 987 654 321', // Mock data fallback
          email: user.email,
          role: user.role,
          mainBranch: user.branch,
          additionalBranches: user.additionalBranches || [],
          passwordType: 'auto',
          password: '',
          status: user.status
        });
      }
    } else {
      setFormData({
        firstName: '',
        lastName: '',
        document: '',
        phone: '',
        email: '',
        role: '',
        mainBranch: '',
        additionalBranches: [],
        passwordType: 'auto',
        password: '',
        status: 'Activo'
      });
    }
    setErrors({});
    setIsDetailOpen(false);
    setIsFormOpen(true);
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.firstName.trim()) newErrors.firstName = 'El nombre es obligatorio';
    if (!formData.lastName.trim()) newErrors.lastName = 'El apellido es obligatorio';
    if (!formData.document.trim()) newErrors.document = 'El documento es obligatorio';
    
    if (!formData.email.trim()) {
      newErrors.email = 'El correo es obligatorio';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'El correo no es válido';
    } else {
      const isDuplicate = users.some(u => u.email.toLowerCase() === formData.email.toLowerCase() && u.id !== selectedUser);
      if (isDuplicate) newErrors.email = 'Este correo ya está registrado';
    }

    if (!formData.role) newErrors.role = 'El rol principal es obligatorio';
    if (!formData.mainBranch) newErrors.mainBranch = 'La sede principal es obligatoria';
    
    if (formData.passwordType === 'manual') {
      if (!formData.password) {
        newErrors.password = 'La contraseña es obligatoria';
      } else if (formData.password.length < 8) {
        newErrors.password = 'Debe tener al menos 8 caracteres';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = () => {
    if (validateForm()) {
      const newUserData = {
        name: `${formData.firstName} ${formData.lastName}`,
        email: formData.email,
        role: formData.role,
        branch: formData.mainBranch,
        status: formData.status as 'Activo' | 'Inactivo',
        document: formData.document,
        phone: formData.phone,
        additionalBranches: formData.additionalBranches,
        lastAccess: selectedUser ? (users.find(u => u.id === selectedUser)?.lastAccess || 'Nunca') : 'Nunca'
      };

      if (selectedUser) {
        updateUser(selectedUser, newUserData);
      } else {
        addUser({
          ...newUserData,
          id: `USR-${Date.now().toString().slice(-3)}`
        });
      }
      setIsFormOpen(false);
    }
  };

  const confirmDeactivate = () => {
    if (selectedUser) {
      updateUser(selectedUser, { status: 'Inactivo' });
      setIsDeactivateModalOpen(false);
      setSelectedUser(null);
    }
  };

  const handleAdditionalBranchToggle = (branch: string) => {
    setFormData(prev => ({
      ...prev,
      additionalBranches: prev.additionalBranches.includes(branch)
        ? prev.additionalBranches.filter(b => b !== branch)
        : [...prev.additionalBranches, branch]
    }));
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-text-primary mb-1">Usuarios</h2>
          <p className="text-sm text-text-secondary">Gestión de cuentas de acceso al sistema</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="primary" className="flex items-center gap-2" onClick={() => handleOpenForm()}>
            <Plus size={16} />
            Nuevo Usuario
          </Button>
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
                placeholder="Buscar por nombre, correo o DNI..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full h-10 bg-surface border border-border-soft rounded-xl pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary-accent focus:ring-1 focus:ring-primary-accent transition-shadow"
              />
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 md:pb-0">
              <select 
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent min-w-[140px]"
              >
                <option value="">Rol</option>
                <option value="Administrador">Administrador</option>
                <option value="Director">Director</option>
                <option value="Coordinador">Coordinador</option>
                <option value="Docente">Docente</option>
              </select>
              <select 
                value={branchFilter}
                onChange={(e) => setBranchFilter(e.target.value)}
                className="h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent min-w-[140px]"
              >
                <option value="">Todas las sedes</option>
                <option value="Todas">Todas</option>
                {branches.map(b => (
                  <option key={b.id} value={b.name}>{b.name}</option>
                ))}
              </select>
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
                <th className="px-6 py-3 font-medium">Usuario</th>
                <th className="px-6 py-3 font-medium">Correo Electrónico</th>
                <th className="px-6 py-3 font-medium">Rol Principal</th>
                <th className="px-6 py-3 font-medium">Sede Principal</th>
                <th className="px-6 py-3 font-medium">Último Acceso</th>
                <th className="px-6 py-3 font-medium">Estado</th>
                <th className="px-6 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-soft">
              {paginatedUsers.map((row, idx) => (
                <tr key={idx} className="hover:bg-surface-muted/50 transition-colors even:bg-surface-muted/30">
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary-accent/10 text-primary-accent flex items-center justify-center font-medium">
                        {row.name.substring(0, 2).toUpperCase()}
                      </div>
                      <span className="font-medium text-text-primary">{row.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-3 text-text-secondary">{row.email}</td>
                  <td className="px-6 py-3 text-text-secondary">
                    <div className="flex items-center gap-1.5">
                      <Shield size={14} className="text-text-muted" />
                      {row.role}
                    </div>
                  </td>
                  <td className="px-6 py-3 text-text-secondary">{row.branch}</td>
                  <td className="px-6 py-3 text-text-secondary">{row.lastAccess}</td>
                  <td className="px-6 py-3">
                    <Badge variant={row.status === 'Activo' ? 'success' : 'neutral'}>{row.status}</Badge>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <ActionMenu 
                      items={[
                        { label: 'Ver perfil', onClick: () => handleOpenDetail(row.id) },
                        { label: 'Editar usuario', onClick: () => handleOpenForm(row.id) },
                        { label: 'Restablecer contraseña', onClick: () => handleResetPassword(row.id) },
                        { label: 'Desactivar', onClick: () => handleDeactivate(row.id), danger: true },
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
            Mostrando {filteredUsers.length > 0 ? startIndex + 1 : 0} a {Math.min(endIndex, filteredUsers.length)} de {filteredUsers.length} registros
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
        title={`Perfil de Usuario`}
        size="xl"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setIsDetailOpen(false)}>Cerrar</Button>
            <Button variant="primary" onClick={() => handleOpenForm(selectedUser || undefined)}>Editar Perfil</Button>
          </div>
        }
      >
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-primary-accent/10 rounded-full flex items-center justify-center text-primary-accent font-bold text-xl">
              {users.find(u => u.id === selectedUser)?.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
            </div>
            <div>
              <h3 className="text-lg font-bold text-text-primary">{users.find(u => u.id === selectedUser)?.name}</h3>
              <p className="text-sm text-text-secondary">DNI: {users.find(u => u.id === selectedUser)?.document || 'N/A'}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <span className="text-xs text-text-muted uppercase tracking-wider">Rol Principal</span>
              <p className="text-sm font-medium text-text-primary flex items-center gap-1">
                <Shield size={14} className="text-primary-accent" />
                {users.find(u => u.id === selectedUser)?.role}
              </p>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-text-muted uppercase tracking-wider">Sede Principal</span>
              <p className="text-sm font-medium text-text-primary">{users.find(u => u.id === selectedUser)?.branch}</p>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-text-muted uppercase tracking-wider">Último Acceso</span>
              <p className="text-sm font-medium text-text-primary">{users.find(u => u.id === selectedUser)?.lastAccess}</p>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-text-muted uppercase tracking-wider">Estado</span>
              <Badge variant={users.find(u => u.id === selectedUser)?.status === 'Activo' ? 'success' : 'neutral'}>
                {users.find(u => u.id === selectedUser)?.status}
              </Badge>
            </div>
          </div>

          <div className="border-t border-border-soft pt-4">
            <h4 className="text-sm font-bold text-text-primary mb-3">Información de Contacto</h4>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Mail size={16} className="text-text-muted" />
                <p className="text-sm font-medium text-text-primary">{users.find(u => u.id === selectedUser)?.email}</p>
              </div>
              <div className="flex items-center gap-3">
                <Phone size={16} className="text-text-muted" />
                <p className="text-sm font-medium text-text-primary">{users.find(u => u.id === selectedUser)?.phone || 'N/A'}</p>
              </div>
            </div>
          </div>
        </div>
      </Modal>

      {/* Form Modal */}
      <Modal 
        isOpen={isFormOpen} 
        onClose={() => setIsFormOpen(false)} 
        title={selectedUser ? 'Editar Usuario' : 'Nuevo Usuario'}
        size="xl"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setIsFormOpen(false)}>Cancelar</Button>
            <Button variant="primary" onClick={handleSave}>
              {selectedUser ? 'Guardar Cambios' : 'Crear Usuario'}
            </Button>
          </div>
        }
      >
        <div className="space-y-6">
          {/* Bloque 1: Identidad */}
          <div>
            <h4 className="text-sm font-bold text-text-primary mb-3">1. Identidad</h4>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-text-primary">Nombres <span className="text-error">*</span></label>
                  <input 
                    type="text" 
                    value={formData.firstName}
                    onChange={(e) => setFormData({...formData, firstName: e.target.value})}
                    className={`w-full h-10 bg-surface border ${errors.firstName ? 'border-error' : 'border-border-soft'} rounded-lg px-3 text-sm focus:outline-none focus:border-primary-accent`} 
                    placeholder="Ej. Juan" 
                  />
                  {errors.firstName && <p className="text-xs text-error">{errors.firstName}</p>}
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-text-primary">Apellidos <span className="text-error">*</span></label>
                  <input 
                    type="text" 
                    value={formData.lastName}
                    onChange={(e) => setFormData({...formData, lastName: e.target.value})}
                    className={`w-full h-10 bg-surface border ${errors.lastName ? 'border-error' : 'border-border-soft'} rounded-lg px-3 text-sm focus:outline-none focus:border-primary-accent`} 
                    placeholder="Ej. Pérez" 
                  />
                  {errors.lastName && <p className="text-xs text-error">{errors.lastName}</p>}
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-text-primary">DNI / Documento <span className="text-error">*</span></label>
                  <input 
                    type="text" 
                    value={formData.document}
                    onChange={(e) => setFormData({...formData, document: e.target.value})}
                    className={`w-full h-10 bg-surface border ${errors.document ? 'border-error' : 'border-border-soft'} rounded-lg px-3 text-sm focus:outline-none focus:border-primary-accent`} 
                    placeholder="Número de documento" 
                  />
                  {errors.document && <p className="text-xs text-error">{errors.document}</p>}
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-text-primary">Teléfono</label>
                  <input 
                    type="tel" 
                    value={formData.phone}
                    onChange={(e) => setFormData({...formData, phone: e.target.value})}
                    className="w-full h-10 bg-surface border border-border-soft rounded-lg px-3 text-sm focus:outline-none focus:border-primary-accent" 
                    placeholder="+51 999 999 999" 
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text-primary">Correo Electrónico <span className="text-error">*</span></label>
                <input 
                  type="email" 
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  className={`w-full h-10 bg-surface border ${errors.email ? 'border-error' : 'border-border-soft'} rounded-lg px-3 text-sm focus:outline-none focus:border-primary-accent`} 
                  placeholder="correo@institucion.edu.pe" 
                />
                {errors.email && <p className="text-xs text-error">{errors.email}</p>}
              </div>
            </div>
          </div>

          {/* Bloque 2: Acceso y asignación */}
          <div className="border-t border-border-soft pt-4">
            <h4 className="text-sm font-bold text-text-primary mb-3">2. Acceso y Asignación</h4>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-text-primary">Rol Principal <span className="text-error">*</span></label>
                  <select 
                    value={formData.role}
                    onChange={(e) => setFormData({...formData, role: e.target.value})}
                    className={`w-full h-10 bg-surface border ${errors.role ? 'border-error' : 'border-border-soft'} rounded-lg px-3 text-sm focus:outline-none focus:border-primary-accent`}
                  >
                    <option value="">Seleccionar rol...</option>
                    <option value="Administrador Global">Administrador Global</option>
                    <option value="Director Académico">Director Académico</option>
                    <option value="Coordinador de Ventas">Coordinador de Ventas</option>
                    <option value="Docente">Docente</option>
                  </select>
                  {errors.role && <p className="text-xs text-error">{errors.role}</p>}
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-text-primary">Sede Principal <span className="text-error">*</span></label>
                  <select 
                    value={formData.mainBranch}
                    onChange={(e) => setFormData({...formData, mainBranch: e.target.value})}
                    className={`w-full h-10 bg-surface border ${errors.mainBranch ? 'border-error' : 'border-border-soft'} rounded-lg px-3 text-sm focus:outline-none focus:border-primary-accent`}
                  >
                    <option value="">Seleccionar sede...</option>
                    <option value="Todas">Todas</option>
                    {branches.map(b => (
                      <option key={b.id} value={b.name}>{b.name}</option>
                    ))}
                  </select>
                  {errors.mainBranch && <p className="text-xs text-error">{errors.mainBranch}</p>}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text-primary">Sedes Adicionales (Opcional)</label>
                <div className="flex flex-wrap gap-2 p-3 border border-border-soft rounded-lg bg-surface-muted/30">
                  {branches.filter(b => b.name !== formData.mainBranch).map(branch => (
                    <label key={branch.id} className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={formData.additionalBranches.includes(branch.name)}
                        onChange={() => handleAdditionalBranchToggle(branch.name)}
                        className="rounded border-border-strong text-primary-accent focus:ring-primary-accent" 
                      />
                      {branch.name}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Bloque 3: Seguridad */}
          <div className="border-t border-border-soft pt-4">
            <h4 className="text-sm font-bold text-text-primary mb-3">3. Seguridad</h4>
            <div className="space-y-3">
              <label className="flex items-start gap-3 p-3 border border-border-soft rounded-lg cursor-pointer hover:border-primary-accent/50 transition-colors">
                <input 
                  type="radio" 
                  name="password_type" 
                  className="mt-1 text-primary-accent focus:ring-primary-accent" 
                  checked={formData.passwordType === 'auto'}
                  onChange={() => {
                    setFormData({...formData, passwordType: 'auto', password: ''});
                    setErrors({...errors, password: ''});
                  }}
                />
                <div>
                  <p className="text-sm font-medium text-text-primary">Generar contraseña automáticamente</p>
                  <p className="text-xs text-text-secondary">Se enviará un correo al usuario con instrucciones para establecer su contraseña.</p>
                </div>
              </label>
              <label className="flex items-start gap-3 p-3 border border-border-soft rounded-lg cursor-pointer hover:border-primary-accent/50 transition-colors">
                <input 
                  type="radio" 
                  name="password_type" 
                  className="mt-1 text-primary-accent focus:ring-primary-accent" 
                  checked={formData.passwordType === 'manual'}
                  onChange={() => setFormData({...formData, passwordType: 'manual'})}
                />
                <div className="w-full">
                  <p className="text-sm font-medium text-text-primary mb-2">Establecer contraseña manualmente</p>
                  {formData.passwordType === 'manual' && (
                    <div className="mt-2">
                      <input 
                        type="password" 
                        placeholder="Ingresar contraseña" 
                        value={formData.password}
                        onChange={(e) => setFormData({...formData, password: e.target.value})}
                        className={`w-full h-9 bg-surface border ${errors.password ? 'border-error' : 'border-border-soft'} rounded-md px-3 text-sm focus:outline-none focus:border-primary-accent`} 
                      />
                      {errors.password && <p className="text-xs text-error mt-1">{errors.password}</p>}
                    </div>
                  )}
                </div>
              </label>
            </div>
          </div>

          {/* Bloque 4: Estado */}
          <div className="border-t border-border-soft pt-4">
            <h4 className="text-sm font-bold text-text-primary mb-3">4. Estado de la Cuenta</h4>
            <div className="space-y-1.5">
              <select 
                value={formData.status}
                onChange={(e) => setFormData({...formData, status: e.target.value})}
                className="w-full h-10 bg-surface border border-border-soft rounded-lg px-3 text-sm focus:outline-none focus:border-primary-accent"
              >
                <option value="Activo">Activo - El usuario puede acceder al sistema</option>
                <option value="Inactivo">Inactivo - El usuario no tiene acceso</option>
              </select>
            </div>
          </div>

        </div>
      </Modal>

      {/* Reset Password Modal */}
      <Modal
        isOpen={isResetPasswordModalOpen}
        onClose={() => setIsResetPasswordModalOpen(false)}
        title="Restablecer Contraseña"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setIsResetPasswordModalOpen(false)}>Cancelar</Button>
            <Button variant="primary" onClick={() => setIsResetPasswordModalOpen(false)}>Enviar Enlace</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            Se enviará un correo electrónico al usuario con un enlace seguro para que pueda restablecer su contraseña.
          </p>
          <div className="bg-surface-muted p-3 rounded-xl border border-border-soft">
            <p className="text-sm font-medium text-text-primary">{users.find(u => u.id === selectedUser)?.email}</p>
          </div>
        </div>
      </Modal>

      {/* Deactivate User Modal */}
      <Modal
        isOpen={isDeactivateModalOpen}
        onClose={() => setIsDeactivateModalOpen(false)}
        title="Desactivar Usuario"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setIsDeactivateModalOpen(false)}>Cancelar</Button>
            <Button variant="danger" onClick={() => setIsDeactivateModalOpen(false)}>Desactivar Usuario</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3 text-error">
            <AlertTriangle size={24} />
            <p className="text-sm font-medium">¿Estás seguro de que deseas desactivar este usuario?</p>
          </div>
          <p className="text-sm text-text-secondary">
            El usuario ya no podrá acceder al sistema. Sus registros y actividades previas se mantendrán en el historial.
          </p>
        </div>
      </Modal>
    </div>
  );
}
