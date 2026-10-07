import React, { useState, useEffect } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { ActionMenu } from '../../components/ui/ActionMenu';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { 
  Search, Plus, MapPin, Building, Users, AlertTriangle, 
  Phone, Mail, User, Info, Building2, Map 
} from 'lucide-react';
import { useTablePagination } from '../../hooks/useTablePagination';
import { useData } from '../../context/DataContext';
import { Branch } from '../../context/DataContext';

export function Branches() {
  const { branches, staff, companies, addBranch, updateBranch } = useData();
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [isDeactivateModalOpen, setIsDeactivateModalOpen] = useState(false);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const filteredBranches = branches.filter(b => {
    const matchesSearch = b.id.toLowerCase().includes(searchTerm.toLowerCase()) || b.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter ? b.status === statusFilter : true;
    return matchesSearch && matchesStatus;
  });

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = useTablePagination();

  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter]);

  const totalPages = Math.ceil(filteredBranches.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedBranches = filteredBranches.slice(startIndex, endIndex);
  
  // Form State
  const [formData, setFormData] = useState<Partial<Branch>>({
    id: '',
    name: '',
    company: '',
    status: 'Activo',
    address: '',
    reference: '',
    department: '',
    province: '',
    district: '',
    phoneFixed: '',
    phoneMobile: '',
    email: '',
    responsibleId: '',
    observations: ''
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [reasonForChange, setReasonForChange] = useState('');

  useEffect(() => {
    if (selectedBranch) {
      setFormData(selectedBranch);
      setReasonForChange('');
    } else {
      setFormData({
        id: '',
        name: '',
        company: '',
        status: 'Activo',
        address: '',
        reference: '',
        department: '',
        province: '',
        district: '',
        phoneFixed: '',
        phoneMobile: '',
        email: '',
        responsibleId: '',
        observations: ''
      });
    }
    setErrors({});
  }, [selectedBranch, isFormOpen]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.id) newErrors.id = 'El código es obligatorio';
    if (!selectedBranch && branches.some(b => b.id === formData.id)) {
      newErrors.id = 'Este código ya está en uso';
    }
    if (!formData.company) newErrors.company = 'Debe seleccionar una empresa';
    if (!formData.name) newErrors.name = 'El nombre es obligatorio';
    if (!formData.address) newErrors.address = 'La dirección es obligatoria';
    if (!formData.department) newErrors.department = 'El departamento es obligatorio';
    if (!formData.province) newErrors.province = 'La provincia es obligatoria';
    if (!formData.district) newErrors.district = 'El distrito es obligatorio';
    
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Formato de correo inválido';
    }

    if (selectedBranch && !reasonForChange) {
      newErrors.reasonForChange = 'Debe indicar el motivo del cambio para auditoría';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (validateForm()) {
      if (selectedBranch) {
        updateBranch(selectedBranch.id, { ...formData });
      } else {
        addBranch(formData as Branch);
      }
      setIsFormOpen(false);
    }
  };

  const handleOpenDetail = (branch: Branch) => {
    setSelectedBranch(branch);
    setIsDetailOpen(true);
  };

  const handleOpenForm = (branch?: Branch) => {
    setSelectedBranch(branch || null);
    setIsFormOpen(true);
  };

  const handleDeactivateClick = (branch: Branch) => {
    setSelectedBranch(branch);
    setIsDeactivateModalOpen(true);
  };

  const confirmDeactivation = () => {
    if (selectedBranch) {
      updateBranch(selectedBranch.id, { status: 'Inactivo' });
      setIsDeactivateModalOpen(false);
    }
  };

  const companyOptions = [
    { value: '', label: 'Seleccionar empresa' },
    ...companies.filter(c => c.status === 'Activo').map(c => ({ value: c.name, label: c.name }))
  ];

  const staffOptions = [
    { value: '', label: 'Sin asignar' },
    ...staff.map(s => ({ value: s.id, label: `${s.names} ${s.lastNameP}` }))
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-text-primary mb-1">Filiales</h2>
          <p className="text-sm text-text-secondary">Gestión de sedes operativas y puntos de atención</p>
        </div>
        <Button variant="primary" className="flex items-center gap-2" onClick={() => handleOpenForm()}>
          <Plus size={16} />
          Nueva Filial
        </Button>
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
                placeholder="Buscar por código o nombre..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full h-10 bg-surface border border-border-soft rounded-xl pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary-accent focus:ring-1 focus:ring-primary-accent transition-shadow"
              />
            </div>
            <div className="flex gap-3">
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
                <th className="px-6 py-3 font-medium">Código</th>
                <th className="px-6 py-3 font-medium">Filial</th>
                <th className="px-6 py-3 font-medium">Ubicación</th>
                <th className="px-6 py-3 font-medium">Empresa</th>
                <th className="px-6 py-3 font-medium">Estado</th>
                <th className="px-6 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-soft">
              {paginatedBranches.map((branch) => (
                <tr key={branch.id} className="hover:bg-surface-muted/50 transition-colors group even:bg-surface-muted/30">
                  <td className="px-6 py-3 font-mono text-xs text-text-secondary">{branch.id}</td>
                  <td className="px-6 py-3">
                    <div className="flex flex-col">
                      <span className="font-medium text-text-primary">{branch.name}</span>
                      <span className="text-xs text-text-muted">{branch.address}</span>
                    </div>
                  </td>
                  <td className="px-6 py-3 text-text-secondary">
                    <div className="flex items-center gap-1">
                      <MapPin size={14} className="text-text-muted" />
                      <span>{branch.district}, {branch.province}</span>
                    </div>
                  </td>
                  <td className="px-6 py-3 text-text-secondary truncate max-w-[150px]">{branch.company}</td>
                  <td className="px-6 py-3">
                    <Badge variant={branch.status === 'Activo' ? 'success' : 'danger'}>
                      {branch.status}
                    </Badge>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <ActionMenu 
                      items={[
                        { label: 'Ver detalles', onClick: () => handleOpenDetail(branch) },
                        { label: 'Editar filial', onClick: () => handleOpenForm(branch) },
                        { label: 'Desactivar', onClick: () => handleDeactivateClick(branch), danger: true },
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
            Mostrando {filteredBranches.length > 0 ? startIndex + 1 : 0} a {Math.min(endIndex, filteredBranches.length)} de {filteredBranches.length} registros
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

      {/* Form Modal */}
      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={selectedBranch ? 'Editar Filial' : 'Nueva Filial'}
        size="2xl"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setIsFormOpen(false)}>Cancelar</Button>
            <Button variant="primary" onClick={handleSubmit}>
              {selectedBranch ? 'Guardar Cambios' : 'Crear Filial'}
            </Button>
          </div>
        }
      >
        <div className="space-y-8">
          {/* Block 1: Identity */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-border-soft">
              <Building2 size={18} className="text-primary-accent" />
              <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider">Bloque 1: Identidad</h3>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-text-secondary">Código de Filial</label>
                <Input 
                  placeholder="Ej. FIL-001"
                  value={formData.id}
                  onChange={(e) => setFormData({ ...formData, id: e.target.value.toUpperCase() })}
                  error={errors.id}
                  disabled={!!selectedBranch}
                />
                {!selectedBranch && <p className="text-[10px] text-text-muted">Identificador único e inmutable.</p>}
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-text-secondary">Empresa</label>
                <Select 
                  options={companyOptions}
                  value={formData.company}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                  error={errors.company}
                  disabled={!!selectedBranch}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-text-secondary">Nombre de Filial</label>
              <Input 
                placeholder="Ej. Sede Central San Isidro"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                error={errors.name}
              />
            </div>
          </section>

          {/* Block 2: Location */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-border-soft">
              <Map size={18} className="text-primary-accent" />
              <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider">Bloque 2: Ubicación</h3>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-text-secondary">Dirección Exacta</label>
              <Input 
                placeholder="Av. / Calle / Jr. y número"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                error={errors.address}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-text-secondary">Referencia (Opcional)</label>
              <Input 
                placeholder="Ej. Frente al parque central, 1/2 cdra. de..."
                value={formData.reference}
                onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-text-secondary">Departamento</label>
                <Input 
                  placeholder="Ej. Lima"
                  value={formData.department}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                  error={errors.department}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-text-secondary">Provincia</label>
                <Input 
                  placeholder="Ej. Lima"
                  value={formData.province}
                  onChange={(e) => setFormData({ ...formData, province: e.target.value })}
                  error={errors.province}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-text-secondary">Distrito</label>
                <Input 
                  placeholder="Ej. San Isidro"
                  value={formData.district}
                  onChange={(e) => setFormData({ ...formData, district: e.target.value })}
                  error={errors.district}
                />
              </div>
            </div>
          </section>

          {/* Block 3: Contact */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-border-soft">
              <Phone size={18} className="text-primary-accent" />
              <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider">Bloque 3: Contacto</h3>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-text-secondary">Teléfono Fijo</label>
                <Input 
                  placeholder="Ej. (01) 444-5566"
                  value={formData.phoneFixed}
                  onChange={(e) => setFormData({ ...formData, phoneFixed: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-text-secondary">Teléfono Móvil</label>
                <Input 
                  placeholder="Ej. 999 888 777"
                  value={formData.phoneMobile}
                  onChange={(e) => setFormData({ ...formData, phoneMobile: e.target.value })}
                />
                <p className="text-[10px] text-text-muted italic">Recomendado para atención rápida.</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-text-secondary">Correo de Sede</label>
              <Input 
                type="email"
                placeholder="sede.nombre@ensil.edu.pe"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                error={errors.email}
              />
            </div>
          </section>

          {/* Block 4: Operation */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-border-soft">
              <Users size={18} className="text-primary-accent" />
              <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider">Bloque 4: Operación</h3>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-text-secondary">Estado Operativo</label>
              <div className="flex p-1 bg-surface-muted rounded-xl border border-border-soft">
                {['Activo', 'Inactivo'].map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setFormData({ ...formData, status: status as any })}
                    className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${
                      formData.status === status 
                        ? 'bg-surface text-primary-accent shadow-sm ring-1 ring-border-soft' 
                        : 'text-text-muted hover:text-text-secondary'
                    }`}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-text-secondary">Responsable de Sede</label>
              <Select 
                options={staffOptions}
                value={formData.responsibleId}
                onChange={(e) => setFormData({ ...formData, responsibleId: e.target.value })}
              />
              <p className="text-[10px] text-text-muted">Personal asignado a la dirección operativa.</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-text-secondary">Observaciones</label>
              <textarea 
                rows={3}
                className="w-full px-3 py-2 bg-surface border border-border-soft rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors resize-none"
                placeholder="Notas adicionales sobre la sede..."
                value={formData.observations}
                onChange={(e) => setFormData({ ...formData, observations: e.target.value })}
              />
            </div>

            {selectedBranch && (
              <div className="space-y-1.5 pt-2 border-t border-border-soft">
                <label className="text-xs font-medium text-danger-text flex items-center gap-1">
                  <AlertTriangle size={12} />
                  Motivo del cambio (Auditoría)
                </label>
                <Input 
                  placeholder="Ej. Cambio de responsable por rotación..."
                  value={reasonForChange}
                  onChange={(e) => setReasonForChange(e.target.value)}
                  error={errors.reasonForChange}
                  className="border-danger-text/30 focus:border-danger-text"
                />
              </div>
            )}
          </section>
        </div>
      </Modal>

      {/* Detail Modal */}
      <Modal
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        title="Detalle de Filial"
        size="xl"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setIsDetailOpen(false)}>Cerrar</Button>
            <Button variant="primary" onClick={() => { setIsDetailOpen(false); handleOpenForm(selectedBranch!); }}>
              Editar Filial
            </Button>
          </div>
        }
      >
        {selectedBranch && (
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-primary-accent/10 rounded-xl flex items-center justify-center text-primary-accent">
                <Building size={24} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-text-primary">{selectedBranch.name}</h3>
                <p className="text-sm text-text-secondary font-mono">{selectedBranch.id}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-1">
                <span className="text-[10px] text-text-muted uppercase tracking-wider font-bold">Empresa</span>
                <p className="text-sm font-medium text-text-primary">{selectedBranch.company}</p>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] text-text-muted uppercase tracking-wider font-bold">Estado</span>
                <div>
                  <Badge variant={selectedBranch.status === 'Activo' ? 'success' : 'danger'}>{selectedBranch.status}</Badge>
                </div>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] text-text-muted uppercase tracking-wider font-bold">Responsable</span>
                <div className="flex items-center gap-2">
                  <User size={14} className="text-text-muted" />
                  <p className="text-sm font-medium text-text-primary">
                    {staff.find(s => s.id === selectedBranch.responsibleId)?.names || 'Sin asignar'}
                  </p>
                </div>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] text-text-muted uppercase tracking-wider font-bold">Contacto</span>
                <p className="text-sm font-medium text-text-primary">{selectedBranch.phoneMobile || selectedBranch.phoneFixed || 'N/A'}</p>
              </div>
            </div>

            <div className="p-4 bg-surface-muted rounded-xl border border-border-soft space-y-4">
              <div className="flex items-start gap-3">
                <MapPin size={18} className="text-primary-accent mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-text-primary">{selectedBranch.address}</p>
                  <p className="text-xs text-text-secondary">{selectedBranch.district}, {selectedBranch.province}, {selectedBranch.department}</p>
                  {selectedBranch.reference && (
                    <p className="text-xs text-text-muted mt-1 italic">Ref: {selectedBranch.reference}</p>
                  )}
                </div>
              </div>
            </div>

            {selectedBranch.observations && (
              <div className="space-y-2">
                <span className="text-[10px] text-text-muted uppercase tracking-wider font-bold">Observaciones</span>
                <p className="text-sm text-text-secondary bg-surface p-3 rounded-lg border border-border-soft italic">
                  "{selectedBranch.observations}"
                </p>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Deactivate Modal */}
      <Modal
        isOpen={isDeactivateModalOpen}
        onClose={() => setIsDeactivateModalOpen(false)}
        title="Desactivar Filial"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setIsDeactivateModalOpen(false)}>Cancelar</Button>
            <Button variant="danger" onClick={confirmDeactivation}>Confirmar Desactivación</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 bg-danger-tint rounded-xl border border-danger-text/20">
            <AlertTriangle className="text-danger-text shrink-0" size={24} />
            <div className="space-y-1">
              <p className="text-sm font-bold text-danger-text">¡Advertencia de Integridad!</p>
              <p className="text-xs text-danger-text/80 leading-relaxed">
                Estás a punto de desactivar la filial <strong>{selectedBranch?.name}</strong>. 
                Esta acción tiene las siguientes implicancias:
              </p>
            </div>
          </div>
          
          <ul className="space-y-2 text-sm text-text-secondary pl-4">
            <li className="flex items-start gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-text-muted mt-1.5 shrink-0" />
              <span>Los usuarios con esta sede como principal perderán acceso a sus funciones.</span>
            </li>
            <li className="flex items-start gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-text-muted mt-1.5 shrink-0" />
              <span>No se podrán realizar nuevos movimientos de caja o stock en esta sede.</span>
            </li>
            <li className="flex items-start gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-text-muted mt-1.5 shrink-0" />
              <span>Las matrículas activas deberán ser trasladadas a otra filial operativa.</span>
            </li>
          </ul>

          <p className="text-xs text-text-muted italic pt-2">
            * Los datos históricos se mantendrán para fines de auditoría y reportes.
          </p>
        </div>
      </Modal>
    </div>
  );
}
