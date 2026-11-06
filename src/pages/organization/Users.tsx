import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { ActionMenu } from '../../components/ui/ActionMenu';
import { Modal } from '../../components/ui/Modal';
import { Search, Plus, Shield, Mail, Phone, AlertTriangle, Info, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTablePagination } from '../../hooks/useTablePagination';
import { useData } from '../../context/DataContext';
import { seatsUsed } from '../../utils/roleBuilder';
import { accountCreateCheck, accountPlacesOf, personSummary, roleFitError, rolesFor, rulesInput, worksInWarehouse, type AccountRulesContext } from '../../utils/accountRules';
import { errorPersona } from '../../../supabase/functions/usuarios/reglas.ts';
import { StaffDbNotice } from '../../components/people/StaffDbNotice';
import { SUPERUSER } from '../../utils/authority';
import { OrgDbNotice } from '../../components/organization/OrgDbNotice';
import { accountPlaceLabel } from '../../utils/session';

export function Users() {
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /** Resultado de «Reenviar acceso» (se muestra arriba de la tabla). */
  const [accessNote, setAccessNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [isDeactivateModalOpen, setIsDeactivateModalOpen] = useState(false);
  const [activationNote, setActivationNote] = useState<string | null>(null);

  // Las sedes y los almacenes de las cuentas son los guardados en la base de datos (Organización → Filiales y Almacenes)
  const { users, orgBranches: branches, orgWarehouses: warehouses, orgStaff: staff, orgAssignments: assignments, orgPlaces: places, permissions, roles, addUser, updateUser, resendAccess, can, currentUser } = useData();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [serverError, setServerError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Una cuenta nace de una persona de Personal (`staffId`); solo un Superusuario crea una cuenta técnica, sin persona (`technical`)
  const [formData, setFormData] = useState({ staffId: '', technical: false, name: '', email: '', role: '', status: 'Activo' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const isSuperuser = currentUser.role === SUPERUSER;
  const rules: AccountRulesContext = { staff, assignments, places, users, roles, permissions, actorIsSuperuser: isSuperuser };
  const editingUser = selectedUser ? users.find(u => u.id === selectedUser) : undefined;
  const person = formData.staffId ? staff.find(s => s.id === formData.staffId) : undefined;
  /** Las personas que hoy pueden recibir una cuenta: activas, sin cuenta y con una asignación con acceso. */
  const eligible = staff.filter(s => s.status === 'Activo' && errorPersona(s.id, rulesInput(staff, assignments, users)) === null);
  const waiting = staff.filter(s => s.status === 'Activo' && !users.some(u => u.staffId === s.id) && !eligible.includes(s));
  /** Los roles que se ofrecen: solo los coherentes con el lugar de trabajo de la persona. */
  const roleChoices = formData.technical
    ? roles.filter(r => r.locked && r.status === 'Activo' && isSuperuser)
    : formData.staffId
      ? rolesFor(formData.staffId, rules, editingUser?.role)
      : roles.filter(r => r.status === 'Activo' && !r.locked);
  const liveCheck = !selectedUser && (formData.staffId || formData.technical) && formData.email && formData.role
    ? accountCreateCheck({ staffId: formData.technical ? undefined : formData.staffId, name: formData.name, email: formData.email, role: formData.role }, rules) : null;

  const filteredUsers = users.filter(u => {
    const matchesSearch = u.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         u.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter ? u.role === roleFilter : true;
    const matchesBranch = branchFilter ? accountPlaceLabel(u, warehouses).toLowerCase().includes(branchFilter.toLowerCase()) : true;
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

  /** Reenvía la invitación (si nunca entró) o el enlace para fijar la contraseña. */
  const handleResendAccess = async (id: string) => {
    setAccessNote(null);
    const result = await resendAccess(id);
    setAccessNote(result.ok ? { ok: true, text: 'Listo: se envió el correo para fijar la contraseña.' } : { ok: false, text: result.error ?? 'No se pudo enviar el correo.' });
  };

  const handleDeactivate = (id: string) => {
    setSelectedUser(id);
    setIsDeactivateModalOpen(true);
  };

  const handleOpenForm = (id?: string, presetStaffId?: string) => {
    setSelectedUser(id || null);
    setServerError(null);
    const user = id ? users.find(u => u.id === id) : undefined;
    if (user) {
      setFormData({ staffId: user.staffId ?? '', technical: !user.staffId, name: user.name, email: user.email, role: user.role, status: user.status });
    } else {
      const preset = presetStaffId ? staff.find(s => s.id === presetStaffId) : undefined;
      setFormData({ staffId: preset?.id ?? '', technical: false, name: '', email: '', role: '', status: 'Activo' });
    }
    setErrors({});
    setIsDetailOpen(false);
    setIsFormOpen(true);
  };

  /** Al elegir a la persona, el rol se limpia (los roles que se ofrecen dependen de dónde trabaja). */
  const chooseStaff = (id: string) => {
    setFormData(prev => ({ ...prev, staffId: id, role: '' }));
    setErrors({});
    setServerError(null);
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    if (selectedUser) {
      if (formData.technical && !formData.name.trim()) newErrors.name = 'El nombre es obligatorio';
      if (!formData.role) newErrors.role = 'El rol es obligatorio';
    } else {
      if (!formData.technical && !formData.staffId) newErrors.staffId = 'Elija a la persona de Personal a la que pertenece la cuenta';
      if (formData.technical && !formData.name.trim()) newErrors.name = 'El nombre es obligatorio';
      if (!formData.email.trim()) newErrors.email = 'El correo es obligatorio';
      if (!formData.role) newErrors.role = 'El rol es obligatorio';
      if (Object.keys(newErrors).length === 0) {
        const check = accountCreateCheck({ staffId: formData.technical ? undefined : formData.staffId, name: formData.name, email: formData.email, role: formData.role }, rules);
        if (check.error) {
          if (/correo/i.test(check.error)) newErrors.email = check.error;
          else if (/rol/i.test(check.error)) newErrors.role = check.error;
          else newErrors.staffId = check.error;
        }
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (saving || !validateForm()) return;
    const form = {
      staffId: formData.technical ? undefined : formData.staffId,
      name: formData.technical ? formData.name : undefined,
      email: formData.email,
      role: formData.role,
      status: formData.status as 'Activo' | 'Inactivo',
    };
    setSaving(true);
    const result = selectedUser ? await updateUser(selectedUser, form) : await addUser(form);
    setSaving(false);
    if (!result.ok) { setServerError(result.error ?? 'No se pudo guardar el usuario.'); return; }
    setAccessNote(selectedUser ? null : { ok: true, text: `Se envió la invitación a ${formData.email.trim().toLowerCase()}: la persona abre el enlace del correo y fija su contraseña.` });
    setIsFormOpen(false);
  };

  const confirmDeactivate = async () => {
    if (!selectedUser) return;
    const result = await updateUser(selectedUser, { status: 'Inactivo' });
    if (!result.ok) { setServerError(result.error ?? 'No se pudo desactivar.'); return; }
    setServerError(null);
    setIsDeactivateModalOpen(false);
    setSelectedUser(null);
  };

  const handleActivate = async (id: string) => {
    const result = await updateUser(id, { status: 'Activo' });
    setActivationNote(result.ok ? null : result.error ?? 'No se pudo activar.');
  };

  // ?usuario=ID abre el perfil de esa cuenta
  useEffect(() => {
    const usuario = params.get('usuario');
    if (!usuario) return;
    handleOpenDetail(usuario);
    setParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  // ?personal=ID (desde Personas → Personal → «Crear usuario de acceso») abre el formulario con esa persona elegida
  useEffect(() => {
    const personal = params.get('personal');
    if (!personal) return;
    if (can('org-usuarios:create')) handleOpenForm(undefined, personal);
    setParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

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

      <OrgDbNotice quiet />
      <StaffDbNotice />

      {accessNote && (
        <div className={`mb-4 rounded-xl border p-3 text-sm ${accessNote.ok ? 'bg-success-tint border-success-text/20 text-success-text' : 'bg-danger-tint border-danger-text/20 text-danger-text'}`} role={accessNote.ok ? 'status' : 'alert'}>
          {accessNote.text}
        </div>
      )}

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
                {warehouses.map(w => (
                  <option key={w.id} value={w.name}>{w.name}</option>
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
                  <td className="px-6 py-3 text-text-secondary">
                    {accountPlaceLabel(row, warehouses)}
                    {(() => {
                      const role = roles.find(r => r.name === row.role);
                      const problem = row.staffId && role && !role.locked ? roleFitError(role, row.staffId, assignments, permissions) : null;
                      return problem ? <div className="text-[10px] text-warning-text mt-1 max-w-[220px] flex gap-1"><AlertTriangle size={11} className="shrink-0 mt-px" />Rol y lugar de trabajo no coinciden</div> : null;
                    })()}
                  </td>
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
                        { label: 'Reenviar acceso', hidden: !can('org-usuarios:reset_access') || row.status !== 'Activo', onClick: () => void handleResendAccess(row.id) },
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
              <p className="text-sm font-medium text-text-primary">{[users.find(u => u.id === selectedUser)?.branch, ...(users.find(u => u.id === selectedUser)?.additionalBranches ?? []), ...(users.find(u => u.id === selectedUser)?.warehouses ?? []).map(id => warehouses.find(w => w.id === id)?.name ?? id)].filter(Boolean).join(', ')}</p>
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
        title={selectedUser ? 'Editar Usuario' : formData.technical ? 'Nueva cuenta técnica' : 'Nuevo Usuario'}
        size="xl"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setIsFormOpen(false)}>Cancelar</Button>
            <Button variant="primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando…' : selectedUser ? 'Guardar Cambios' : 'Crear Usuario y enviar invitación'}
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

          {/* Bloque 1: Persona (los datos personales salen de Personal; aquí no se escriben otra vez) */}
          <div>
            <h4 className="text-sm font-bold text-text-primary mb-3">1. {formData.technical ? 'Cuenta técnica' : 'Persona'}</h4>
            {formData.technical ? (
              <div className="space-y-3">
                <div className="flex gap-2 text-xs text-info-text bg-info-tint rounded-xl p-3">
                  <Info size={14} className="shrink-0 mt-0.5" />
                  <p>Una cuenta técnica no pertenece a ninguna persona de Personal (por ejemplo, la de soporte). Solo la crea un Superusuario y solo con un rol del sistema.</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-text-primary">Nombre de la cuenta <span className="text-error">*</span></label>
                  <input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })}
                    className={`w-full h-10 bg-surface border ${errors.name ? 'border-error' : 'border-border-soft'} rounded-lg px-3 text-sm focus:outline-none focus:border-primary-accent`} placeholder="Ej. Soporte técnico" />
                  {errors.name && <p className="text-xs text-error">{errors.name}</p>}
                </div>
                {!selectedUser && <button type="button" className="text-xs text-text-muted underline hover:text-text-primary" onClick={() => setFormData({ staffId: '', technical: false, name: '', email: formData.email, role: '', status: 'Activo' })}>Mejor crear la cuenta de una persona de Personal</button>}
              </div>
            ) : (
              <div className="space-y-3">
                {!selectedUser && (
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-text-primary">Persona de Personal <span className="text-error">*</span></label>
                    <select value={formData.staffId} onChange={e => chooseStaff(e.target.value)}
                      className={`w-full h-10 bg-surface border ${errors.staffId ? 'border-error' : 'border-border-soft'} rounded-lg px-3 text-sm focus:outline-none focus:border-primary-accent`}>
                      <option value="">{eligible.length > 0 ? 'Seleccionar persona...' : 'No hay personas disponibles'}</option>
                      {eligible.map(s => <option key={s.id} value={s.id}>{s.names} {s.lastNameP} {s.lastNameM} · {s.docNumber}</option>)}
                    </select>
                    {errors.staffId && <p className="text-xs text-error">{errors.staffId}</p>}
                    <p className="text-xs text-text-muted">
                      Solo aparecen personas activas, sin cuenta y con una asignación activa con acceso al sistema.
                      {waiting.length > 0 ? ` ${waiting.length} más no pueden recibir cuenta todavía: les falta una asignación con acceso (Personas → Asignaciones).` : ''}
                    </p>
                    {isSuperuser && <button type="button" className="text-xs text-text-muted underline hover:text-text-primary" onClick={() => setFormData({ staffId: '', technical: true, name: '', email: formData.email, role: '', status: 'Activo' })}>Crear una cuenta técnica del sistema (sin persona)</button>}
                  </div>
                )}
                {(person ?? (editingUser?.staffId ? staff.find(s => s.id === editingUser.staffId) : undefined)) && (() => {
                  const p = (person ?? staff.find(s => s.id === editingUser?.staffId))!;
                  const info = personSummary(p, assignments, places);
                  return (
                    <div className="rounded-xl border border-border-soft bg-surface-muted/40 p-4 space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-sm font-medium text-text-primary"><UserRound size={16} className="text-text-muted" />{info.name}</div>
                        <button type="button" className="text-xs text-primary-accent underline" onClick={() => navigate(`/personas/personal?ficha=${p.id}`)}>Ver ficha</button>
                      </div>
                      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                        <div><dt className="text-text-muted">Documento</dt><dd className="text-text-primary">{info.document}</dd></div>
                        <div><dt className="text-text-muted">Celular</dt><dd className="text-text-primary">{info.phone}</dd></div>
                        <div><dt className="text-text-muted">Correo personal</dt><dd className="text-text-primary">{info.personalEmail || '—'}</dd></div>
                        <div><dt className="text-text-muted">Verá (según sus asignaciones)</dt><dd className="text-text-primary">{info.placesText}</dd></div>
                      </dl>
                      <p className="text-[11px] text-text-muted">Estos datos salen de Personas → Personal y Asignaciones: se corrigen allá y la cuenta se actualiza sola.</p>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          {/* Bloque 2: Acceso */}
          <div className="border-t border-border-soft pt-4">
            <h4 className="text-sm font-bold text-text-primary mb-3">2. Acceso</h4>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text-primary">Correo de ingreso (institucional) <span className="text-error">*</span></label>
                <input
                  type="email"
                  value={formData.email}
                  disabled={!!selectedUser}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  className={`w-full h-10 bg-surface border ${errors.email ? 'border-error' : 'border-border-soft'} rounded-lg px-3 text-sm focus:outline-none focus:border-primary-accent`}
                  placeholder="nombre@ensilperu.com"
                />
                {errors.email && <p className="text-xs text-error">{errors.email}</p>}
                {!errors.email && liveCheck?.warning && <p className="text-xs text-warning-text flex gap-1"><AlertTriangle size={12} className="shrink-0 mt-px" />{liveCheck.warning}</p>}
                <p className="text-xs text-text-muted">{selectedUser ? 'El correo de una cuenta no se cambia: si es otro, se desactiva esta cuenta y se crea una nueva.' : 'A este correo llega la invitación para fijar la contraseña. Debe ser el de trabajo, no el personal de la ficha.'}</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text-primary">Rol <span className="text-error">*</span></label>
                <select
                  value={formData.role}
                  disabled={(!!selectedUser && !can('org-usuarios:assign_role')) || (!formData.technical && !formData.staffId)}
                  onChange={(e) => setFormData({...formData, role: e.target.value})}
                  className={`w-full h-10 bg-surface border ${errors.role ? 'border-error' : 'border-border-soft'} rounded-lg px-3 text-sm focus:outline-none focus:border-primary-accent`}
                >
                  <option value="">{!formData.technical && !formData.staffId ? 'Primero elija a la persona' : 'Seleccionar rol...'}</option>
                  {roleChoices.map(r => <option key={r.id} value={r.name}>{r.name}</option>)}
                </select>
                {errors.role && <p className="text-xs text-error">{errors.role}</p>}
                {(() => {
                  const chosen = roles.find(r => r.name === formData.role);
                  const hint = formData.staffId && !formData.technical
                    ? (worksInWarehouse(formData.staffId, assignments)
                      ? 'Trabaja en el almacén: se ofrecen los roles que mueven el almacén.'
                      : 'Trabaja solo en sedes: se ofrecen los roles que no mueven el almacén.')
                    : '';
                  const seatBranch = formData.staffId ? accountPlacesOf(formData.staffId, assignments, places).branch : '';
                  const used = chosen && seatBranch ? seatsUsed(chosen.name, users, seatBranch, selectedUser ?? undefined) : 0;
                  return (
                    <p className="text-[11px] text-text-muted">
                      {hint}{hint && chosen ? ' · ' : ''}
                      {chosen?.desc}
                      {chosen?.branchUserLimit && seatBranch ? ` · En ${seatBranch}: ${used} de ${chosen.branchUserLimit} cuentas activas con este rol.` : chosen?.branchUserLimit ? ` · Máximo ${chosen.branchUserLimit} cuentas activas por sede.` : ''}
                    </p>
                  );
                })()}
              </div>
              <p className="text-xs text-text-muted">Solo quien trabaja en el almacén puede despachar, ingresar compras o ajustar su stock. Ver todas las sedes permite ver el almacén, no moverlo.</p>
            </div>
          </div>

          {/* Bloque 3: Seguridad */}
          <div className="border-t border-border-soft pt-4">
            <h4 className="text-sm font-bold text-text-primary mb-3">3. Seguridad</h4>
            <p className="text-sm text-text-secondary">
              {selectedUser
                ? 'La contraseña es de cada persona. Si la olvidó o no recibió su invitación, use «Reenviar acceso» en la lista.'
                : 'No se escribe ninguna contraseña aquí: al crear la cuenta, la persona recibe un correo con un enlace para fijar la suya.'}
            </p>
          </div>

          {/* Bloque 4: Estado (solo al editar: una cuenta nueva nace activa) */}
          {selectedUser && (
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
                <p className="text-xs text-text-muted">Al inactivar a la persona en Personal, su cuenta se desactiva sola; reactivarla es una decisión aparte, aquí.</p>
              </div>
            </div>
          )}

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
