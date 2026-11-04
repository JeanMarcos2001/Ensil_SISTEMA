import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { ActionMenu } from '../../components/ui/ActionMenu';
import { Modal } from '../../components/ui/Modal';
import { Search, Plus, Shield, Users as UsersIcon, Settings, Mail, Phone, AlertTriangle } from 'lucide-react';
import { useTablePagination } from '../../hooks/useTablePagination';
import { useData } from '../../context/DataContext';
import { accessAssignments, accessCheck, defaultsFromStaff, staffDisplayName, userOfStaff } from '../../utils/staffAccess';
import { seatsUsed } from '../../utils/roleBuilder';
import { SUPERUSER } from '../../utils/authority';
import { AccessStorageBar } from '../../components/people/AccessStorageBar';
import { pinError } from '../../utils/session';
import { nextSequentialId } from '../../utils/ids';

export function Users() {
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [isResetPasswordModalOpen, setIsResetPasswordModalOpen] = useState(false);
  const [resetPin, setResetPin] = useState('');
  const [resetError, setResetError] = useState<string | null>(null);
  const [isDeactivateModalOpen, setIsDeactivateModalOpen] = useState(false);
  const [activationNote, setActivationNote] = useState<string | null>(null);

  const { users, branches, roles, staff, assignments, addUser, updateUser, can, currentUser } = useData();
  const [params, setParams] = useSearchParams();
  const [serverError, setServerError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [formData, setFormData] = useState({
    /** Ficha de personal vinculada ('' = usuario externo, sin ficha). */
    staffId: '',
    firstName: '',
    lastName: '',
    document: '',
    phone: '',
    email: '',
    role: '',
    mainBranch: '',
    additionalBranches: [] as string[],
    /** PIN de acceso rápido (en blanco al editar = no se cambia). */
    pin: '',
    status: 'Activo'
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const filteredUsers = users.filter(u => {
    const matchesSearch = u.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         u.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter ? u.role === roleFilter : true;
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
    setResetPin('');
    setResetError(null);
    setIsResetPasswordModalOpen(true);
  };

  const submitResetPin = () => {
    if (!selectedUser) return;
    const problem = pinError(resetPin);
    if (problem) { setResetError(problem); return; }
    const result = updateUser(selectedUser, { pin: resetPin });
    if (!result.ok) { setResetError(result.error ?? 'No se pudo cambiar el PIN.'); return; }
    setIsResetPasswordModalOpen(false);
  };

  const handleDeactivate = (id: string) => {
    setSelectedUser(id);
    setIsDeactivateModalOpen(true);
  };

  const handleOpenForm = (id?: string, fromStaffId?: string) => {
    setSelectedUser(id || null);
    setServerError(null);
    if (!id && fromStaffId) {
      // Cuenta nueva de un trabajador: nace de su ficha y de sus asignaciones
      const member = staff.find(s => s.id === fromStaffId);
      if (member) {
        const d = defaultsFromStaff(member, assignments, users);
        const [firstName, ...rest] = d.name.split(' ');
        setFormData({
          staffId: member.id, firstName, lastName: rest.join(' '), document: d.document, phone: d.phone, email: '', role: d.role, mainBranch: d.branch,
          additionalBranches: d.additionalBranches, pin: '', status: 'Activo',
        });
        setErrors({});
        setIsDetailOpen(false);
        setIsFormOpen(true);
        return;
      }
    }
    if (id) {
      const user = users.find(u => u.id === id);
      if (user) {
        const [firstName, ...lastNameParts] = user.name.split(' ');
        setFormData({
          staffId: user.staffId ?? '',
          firstName: firstName || '',
          lastName: lastNameParts.join(' ') || '',
          document: user.document || '45678912', // Mock data fallback
          phone: user.phone || '+51 987 654 321', // Mock data fallback
          email: user.email,
          role: user.role,
          mainBranch: user.branch,
          additionalBranches: user.additionalBranches || [],
          pin: '',
          status: user.status
        });
      }
    } else {
      setFormData({
        staffId: '',
        firstName: '',
        lastName: '',
        document: '',
        phone: '',
        email: '',
        role: '',
        mainBranch: '',
        additionalBranches: [],
        pin: '',
        status: 'Activo'
      });
    }
    setErrors({});
    setIsDetailOpen(false);
    setIsFormOpen(true);
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    // Con ficha de personal, nombre, documento y teléfono salen de ella
    if (!formData.staffId) {
      if (!formData.firstName.trim()) newErrors.firstName = 'El nombre es obligatorio';
      if (!formData.lastName.trim()) newErrors.lastName = 'El apellido es obligatorio';
      if (!formData.document.trim()) newErrors.document = 'El documento es obligatorio';
    }
    
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
    
    if (formData.pin) {
      const pinProblem = pinError(formData.pin);
      if (pinProblem) newErrors.pin = pinProblem;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = () => {
    if (validateForm()) {
      const member = formData.staffId ? staff.find(s => s.id === formData.staffId) : undefined;
      const newUserData = {
        staffId: formData.staffId || undefined,
        name: member ? staffDisplayName(member) : `${formData.firstName} ${formData.lastName}`,
        email: formData.email,
        role: formData.role,
        branch: formData.mainBranch,
        status: formData.status as 'Activo' | 'Inactivo',
        document: member ? member.docNumber : formData.document,
        phone: member ? member.phone : formData.phone,
        additionalBranches: formData.additionalBranches,
        lastAccess: selectedUser ? (users.find(u => u.id === selectedUser)?.lastAccess || 'Nunca') : 'Nunca'
      };

      const result = selectedUser
        ? updateUser(selectedUser, { ...newUserData, pin: formData.pin || undefined })
        : addUser({ ...newUserData, id: nextSequentialId('USR', users.map(x => x.id)), pin: formData.pin || undefined });
      if (!result.ok) { setServerError(result.error ?? 'No se pudo guardar el usuario.'); return; }
      setIsFormOpen(false);
    }
  };

  const confirmDeactivate = () => {
    if (!selectedUser) return;
    const result = updateUser(selectedUser, { status: 'Inactivo' });
    if (!result.ok) { setServerError(result.error ?? 'No se pudo desactivar.'); return; }
    setServerError(null);
    setIsDeactivateModalOpen(false);
    setSelectedUser(null);
  };

  const handleActivate = (id: string) => {
    const result = updateUser(id, { status: 'Activo' });
    setActivationNote(result.ok ? null : result.error ?? 'No se pudo activar.');
  };

  // ?personal=ID abre la cuenta nueva de ese trabajador; ?usuario=ID abre el perfil de esa cuenta
  useEffect(() => {
    const personal = params.get('personal');
    const usuario = params.get('usuario');
    if (!personal && !usuario) return;
    if (personal) handleOpenForm(undefined, personal);
    else if (usuario) handleOpenDetail(usuario);
    setParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

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
          {can('org-usuarios:create') && (
            <Button variant="primary" className="flex items-center gap-2" onClick={() => handleOpenForm()}>
              <Plus size={16} />
              Nuevo Usuario
            </Button>
          )}
        </div>
      </div>

      <AccessStorageBar />

      {activationNote && (
        <div className="mb-4 bg-danger-tint border border-danger-text/20 rounded-xl p-3 flex gap-2 text-sm text-danger-text">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <p>{activationNote}</p>
        </div>
      )}

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
                {roles.map(r => <option key={r.id} value={r.name}>{r.name}</option>)}
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
                      <div>
                        <span className="font-medium text-text-primary">{row.name}</span>
                        {row.staffId && <div className="text-[10px] text-text-muted uppercase tracking-wider">Personal vinculado</div>}
                      </div>
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
                    {row.status === 'Inactivo' && row.statusNote && <div className="text-[10px] text-text-muted mt-1 max-w-[180px]">{row.statusNote}</div>}
                  </td>
                  <td className="px-6 py-3 text-right">
                    <ActionMenu 
                      items={[
                        { label: 'Ver perfil', onClick: () => handleOpenDetail(row.id) },
                        { label: 'Editar usuario', hidden: !can('org-usuarios:edit'), onClick: () => handleOpenForm(row.id) },
                        { label: 'Restablecer PIN', hidden: !can('org-usuarios:reset_access'), onClick: () => handleResetPassword(row.id) },
                        row.status === 'Activo'
                          ? { label: 'Desactivar', hidden: !can('org-usuarios:deactivate'), onClick: () => handleDeactivate(row.id), danger: true }
                          : { label: 'Activar', hidden: !can('org-usuarios:edit'), onClick: () => handleActivate(row.id) },
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
            {can('org-usuarios:edit') && <Button variant="primary" onClick={() => handleOpenForm(selectedUser || undefined)}>Editar Perfil</Button>}
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

          {(() => {
            const account = users.find(x => x.id === selectedUser);
            const member = account?.staffId ? staff.find(s => s.id === account.staffId) : undefined;
            return member ? (
              <div className="bg-surface-muted p-3 rounded-xl border border-border-soft text-sm">
                <span className="text-xs text-text-muted uppercase tracking-wider">Personal vinculado</span>
                <p className="font-medium text-text-primary mt-1">{staffDisplayName(member)} · {member.code} · {member.status}</p>
                <p className="text-xs text-text-muted mt-0.5">Nombre, documento, teléfono y sedes salen de su ficha y de sus asignaciones (Personas).</p>
              </div>
            ) : <p className="text-xs text-text-muted">Cuenta sin ficha de personal (usuario externo).</p>;
          })()}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <span className="text-xs text-text-muted uppercase tracking-wider">Rol Principal</span>
              <p className="text-sm font-medium text-text-primary flex items-center gap-1">
                <Shield size={14} className="text-primary-accent" />
                {users.find(u => u.id === selectedUser)?.role}
              </p>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-text-muted uppercase tracking-wider">Sedes</span>
              <p className="text-sm font-medium text-text-primary">{[users.find(u => u.id === selectedUser)?.branch, ...(users.find(u => u.id === selectedUser)?.additionalBranches ?? [])].filter(Boolean).join(', ')}</p>
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
          {serverError && (
            <div className="bg-danger-tint border border-danger-text/20 rounded-xl p-3 flex gap-2 text-sm text-danger-text">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <p>{serverError}</p>
            </div>
          )}
          {/* Bloque 1: Identidad */}
          <div>
            <h4 className="text-sm font-bold text-text-primary mb-3">1. Identidad</h4>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text-primary">Personal vinculado</label>
                <select
                  value={formData.staffId}
                  disabled={!!selectedUser && !!users.find(x => x.id === selectedUser)?.staffId}
                  onChange={(e) => {
                    const member = staff.find(s => s.id === e.target.value);
                    if (!member) { setFormData({ ...formData, staffId: '' }); return; }
                    const d = defaultsFromStaff(member, assignments, users);
                    const [firstName, ...rest] = d.name.split(' ');
                    setFormData({ ...formData, staffId: member.id, firstName, lastName: rest.join(' '), document: d.document, phone: d.phone, role: formData.role || d.role, mainBranch: d.branch, additionalBranches: d.additionalBranches });
                    setServerError(null);
                  }}
                  className="w-full h-10 bg-surface border border-border-soft rounded-lg px-3 text-sm focus:outline-none focus:border-primary-accent disabled:bg-surface-muted"
                >
                  <option value="">Sin ficha (usuario externo)</option>
                  {staff
                    .filter(s => s.id === formData.staffId || accessCheck(s, assignments, users).ok)
                    .map(s => <option key={s.id} value={s.id}>{staffDisplayName(s)} · {s.code}</option>)}
                </select>
                <p className="text-xs text-text-muted">
                  {formData.staffId
                    ? 'Nombre, documento y teléfono salen de su ficha (se editan en Personas → Personal) y las sedes, de sus asignaciones. Si el trabajador se inactiva, esta cuenta se desactiva sola.'
                    : 'Solo aparece el personal activo, con una asignación con acceso y sin cuenta. Elija «sin ficha» para administradores externos.'}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-text-primary">Nombres <span className="text-error">*</span></label>
                  <input 
                    type="text" 
                    value={formData.firstName}
                    disabled={!!formData.staffId}
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
                    disabled={!!formData.staffId}
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
                    disabled={!!formData.staffId}
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
                    disabled={!!formData.staffId}
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
                    disabled={!!selectedUser && !can('org-usuarios:assign_role')}
                    onChange={(e) => setFormData({...formData, role: e.target.value})}
                    className={`w-full h-10 bg-surface border ${errors.role ? 'border-error' : 'border-border-soft'} rounded-lg px-3 text-sm focus:outline-none focus:border-primary-accent`}
                  >
                    <option value="">Seleccionar rol...</option>
                    {/* Solo se ofrecen los roles que se pueden dar: activos, y el del sistema solo si quien asigna es Superusuario */}
                    {roles.filter(r => r.name === formData.role || (r.status === 'Activo' && (!r.locked || currentUser.role === SUPERUSER))).map(r => <option key={r.id} value={r.name}>{r.name}</option>)}
                  </select>
                  {errors.role && <p className="text-xs text-error">{errors.role}</p>}
                  {(() => {
                    const chosen = roles.find(r => r.name === formData.role);
                    if (!chosen) return null;
                    const seatBranch = formData.mainBranch && formData.mainBranch !== 'Todas' ? formData.mainBranch : '';
                    const used = seatBranch ? seatsUsed(chosen.name, users, seatBranch, selectedUser ?? undefined) : 0;
                    return (
                      <p className="text-[11px] text-text-muted">
                        {chosen.desc}
                        {chosen.branchUserLimit && seatBranch ? ` · En ${seatBranch}: ${used} de ${chosen.branchUserLimit} cuentas activas con este rol.` : chosen.branchUserLimit ? ` · Máximo ${chosen.branchUserLimit} cuentas activas por sede.` : ''}
                      </p>
                    );
                  })()}
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-text-primary">Sede Principal <span className="text-error">*</span></label>
                  <select
                    value={formData.mainBranch}
                    disabled={!!selectedUser && !can('org-usuarios:assign_branch')}
                    onChange={(e) => setFormData({...formData, mainBranch: e.target.value})}
                    className={`w-full h-10 bg-surface border ${errors.mainBranch ? 'border-error' : 'border-border-soft'} rounded-lg px-3 text-sm focus:outline-none focus:border-primary-accent`}
                  >
                    <option value="">Seleccionar sede...</option>
                    {!formData.staffId && <option value="Todas">Todas</option>}
                    {(formData.staffId ? branches.filter(b => accessAssignments(formData.staffId, assignments).some(a => a.branch === b.name)) : branches).map(b => (
                      <option key={b.id} value={b.name}>{b.name}</option>
                    ))}
                  </select>
                  {errors.mainBranch && <p className="text-xs text-error">{errors.mainBranch}</p>}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text-primary">Sedes Adicionales (Opcional)</label>
                <div className="flex flex-wrap gap-2 p-3 border border-border-soft rounded-lg bg-surface-muted/30">
                  {(formData.staffId ? branches.filter(b => accessAssignments(formData.staffId, assignments).some(a => a.branch === b.name)) : branches).filter(b => b.name !== formData.mainBranch).map(branch => (
                    <label key={branch.id} className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.additionalBranches.includes(branch.name)}
                        disabled={!!selectedUser && !can('org-usuarios:assign_branch')}
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
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">PIN de acceso rápido {selectedUser ? '(opcional)' : ''}</label>
              <input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={6}
                placeholder={selectedUser ? 'Dejar en blanco para no cambiarlo' : '4 a 6 números'}
                value={formData.pin}
                onChange={(e) => { setFormData({ ...formData, pin: e.target.value.replace(/\D/g, '') }); setErrors({ ...errors, pin: '' }); }}
                className={`w-full h-9 bg-surface border ${errors.pin ? 'border-error' : 'border-border-soft'} rounded-md px-3 text-sm focus:outline-none focus:border-primary-accent`}
              />
              {errors.pin && <p className="text-xs text-error mt-1">{errors.pin}</p>}
              <p className="text-xs text-text-secondary mt-1">
                Con el PIN la persona entra a su cuenta al cambiar de usuario. Sin PIN la cuenta no puede entrar; cada persona puede cambiar el suyo desde el menú de su cuenta.
              </p>
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

      {/* Reset PIN Modal */}
      <Modal
        isOpen={isResetPasswordModalOpen}
        onClose={() => setIsResetPasswordModalOpen(false)}
        title="Restablecer PIN"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setIsResetPasswordModalOpen(false)}>Cancelar</Button>
            <Button variant="primary" onClick={submitResetPin} disabled={resetPin.length < 4}>Guardar PIN</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            Fija un PIN nuevo para esta cuenta (4 a 6 números). Entrégaselo a la persona: puede cambiarlo después desde el menú de su cuenta.
          </p>
          <div className="bg-surface-muted p-3 rounded-xl border border-border-soft">
            <p className="text-sm font-medium text-text-primary">{users.find(u => u.id === selectedUser)?.name}</p>
            <p className="text-xs text-text-muted">{users.find(u => u.id === selectedUser)?.email}</p>
          </div>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            placeholder="PIN nuevo"
            aria-label="PIN nuevo"
            value={resetPin}
            onChange={(e) => { setResetPin(e.target.value.replace(/\D/g, '')); setResetError(null); }}
            className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent"
          />
          {resetError && <p className="text-sm text-danger-text" role="alert">{resetError}</p>}
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
            <Button variant="danger" onClick={confirmDeactivate}>Desactivar Usuario</Button>
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
          {serverError && <p className="text-sm text-danger-text">{serverError}</p>}
        </div>
      </Modal>
    </div>
  );
}
