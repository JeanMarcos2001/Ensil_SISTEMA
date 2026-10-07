import React, { useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { ActionMenu } from '../../components/ui/ActionMenu';
import { Modal } from '../../components/ui/Modal';
import { Search, Plus, Building2, MapPin, Phone, Mail, AlertTriangle } from 'lucide-react';
import { useTablePagination } from '../../hooks/useTablePagination';
import { useData } from '../../context/DataContext';

interface CompaniesProps {
  onNavigate?: (item: string) => void;
}

export function Companies({ onNavigate }: CompaniesProps) {
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  const [isDeactivateModalOpen, setIsDeactivateModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const { branches, companies, addCompany, updateCompany, deleteCompany } = useData();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const filteredCompanies = companies.filter(c => {
    const matchesSearch = c.ruc.includes(searchTerm) || c.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter ? c.status.toLowerCase() === statusFilter.toLowerCase() : true;
    return matchesSearch && matchesStatus;
  });

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = useTablePagination();

  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter]);

  const totalPages = Math.ceil(filteredCompanies.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedCompanies = filteredCompanies.slice(startIndex, endIndex);

  const [formData, setFormData] = useState({
    ruc: '',
    razonSocial: '',
    nombreCorto: '',
    estado: 'activo',
    observaciones: ''
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const selectedCompanyData = companies.find(c => c.id === selectedCompany);
  const hasLinkedBranches = selectedCompanyData 
    ? branches.some(b => b.company === selectedCompanyData.name) 
    : false;

  const handleOpenDetail = (id: string) => {
    setSelectedCompany(id);
    setIsDetailOpen(true);
  };

  const handleOpenForm = (id?: string) => {
    setSelectedCompany(id || null);
    if (id) {
      const company = companies.find(c => c.id === id);
      setFormData({
        ruc: company?.ruc || '',
        razonSocial: company?.name || '',
        nombreCorto: company?.commercialName || '',
        estado: company?.status.toLowerCase() || 'activo',
        observaciones: company?.observaciones || ''
      });
    } else {
      setFormData({
        ruc: '',
        razonSocial: '',
        nombreCorto: '',
        estado: 'activo',
        observaciones: ''
      });
    }
    setErrors({});
    setIsDetailOpen(false);
    setIsFormOpen(true);
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.ruc) {
      newErrors.ruc = 'El RUC es obligatorio';
    } else if (!/^\d{11}$/.test(formData.ruc)) {
      newErrors.ruc = 'El RUC debe tener exactamente 11 dígitos numéricos';
    } else {
      const isDuplicate = companies.some(c => c.ruc === formData.ruc && c.id !== selectedCompany);
      if (isDuplicate) {
        newErrors.ruc = 'Este RUC ya está registrado en otra empresa';
      }
    }
    
    if (!formData.razonSocial.trim()) {
      newErrors.razonSocial = 'La razón social es obligatoria';
    }

    if (formData.estado === 'inactivo' && hasLinkedBranches) {
      newErrors.estado = 'No se puede inactivar una empresa con filiales vinculadas';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = () => {
    if (validateForm()) {
      const newCompanyData = {
        ruc: formData.ruc,
        name: formData.razonSocial,
        commercialName: formData.nombreCorto,
        status: (formData.estado === 'activo' ? 'Activo' : 'Inactivo') as 'Activo' | 'Inactivo',
        observaciones: formData.observaciones
      };

      if (selectedCompany) {
        updateCompany(selectedCompany, newCompanyData);
      } else {
        addCompany({
          ...newCompanyData,
          id: `EMP-${Date.now().toString().slice(-3)}`
        });
      }
      setIsFormOpen(false);
    }
  };

  const handleDeactivate = (id: string) => {
    setSelectedCompany(id);
    setIsDeactivateModalOpen(true);
  };

  const handleActivate = (id: string) => {
    updateCompany(id, { status: 'Activo' });
  };

  const handleDelete = (id: string) => {
    setSelectedCompany(id);
    setIsDeleteModalOpen(true);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-text-primary mb-1">Empresas</h2>
          <p className="text-sm text-text-secondary">Gestión de razones sociales y empresas del grupo</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="primary" className="flex items-center gap-2" onClick={() => handleOpenForm()}>
            <Plus size={16} />
            Nueva Empresa
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
                placeholder="Buscar por RUC o razón social..." 
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
                <option value="activo">Activo</option>
                <option value="inactivo">Inactivo</option>
              </select>
            </div>
          </div>
        </div>

        {/* Data Table */}
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-text-secondary uppercase bg-surface-muted/50 sticky top-0 z-10">
              <tr>
                <th className="px-6 py-3 font-medium">RUC</th>
                <th className="px-6 py-3 font-medium">Razón Social</th>
                <th className="px-6 py-3 font-medium">Nombre Corto / Sigla</th>
                <th className="px-6 py-3 font-medium">Estado</th>
                <th className="px-6 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-soft">
              {paginatedCompanies.map((row, idx) => (
                <tr key={idx} className="hover:bg-surface-muted/50 transition-colors even:bg-surface-muted/30">
                  <td className="px-6 py-3 font-medium text-text-primary">{row.ruc}</td>
                  <td className="px-6 py-3 font-medium text-text-primary">{row.name}</td>
                  <td className="px-6 py-3 text-text-secondary">{row.commercialName}</td>
                  <td className="px-6 py-3">
                    <Badge variant={row.status === 'Activo' ? 'success' : 'neutral'}>{row.status}</Badge>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <ActionMenu 
                      items={[
                        { label: 'Ver detalles', onClick: () => handleOpenDetail(row.id) },
                        { label: 'Editar empresa', onClick: () => handleOpenForm(row.id) },
                        { label: 'Gestionar filiales', onClick: () => onNavigate?.('Filiales') },
                        row.status === 'Activo' 
                          ? { label: 'Desactivar', onClick: () => handleDeactivate(row.id) }
                          : { label: 'Activar', onClick: () => handleActivate(row.id) },
                        { label: 'Eliminar', onClick: () => handleDelete(row.id), danger: true },
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
            Mostrando {filteredCompanies.length > 0 ? startIndex + 1 : 0} a {Math.min(endIndex, filteredCompanies.length)} de {filteredCompanies.length} registros
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
        title={`Detalle de Empresa`}
        size="xl"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setIsDetailOpen(false)}>Cerrar</Button>
            <Button variant="primary" onClick={() => handleOpenForm(selectedCompany || undefined)}>Editar Datos</Button>
          </div>
        }
      >
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-primary-accent/10 rounded-xl flex items-center justify-center text-primary-accent">
              <Building2 size={32} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-text-primary">{selectedCompanyData?.name}</h3>
              <p className="text-sm text-text-secondary">RUC: {selectedCompanyData?.ruc}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <span className="text-xs text-text-muted uppercase tracking-wider">Nombre Corto / Sigla</span>
              <p className="text-sm font-medium text-text-primary">{selectedCompanyData?.commercialName}</p>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-text-muted uppercase tracking-wider">Estado</span>
              <Badge variant={selectedCompanyData?.status === 'Activo' ? 'success' : 'neutral'}>
                {selectedCompanyData?.status}
              </Badge>
            </div>
          </div>

          {selectedCompanyData?.observaciones && (
            <div className="border-t border-border-soft pt-4">
              <h4 className="text-sm font-bold text-text-primary mb-3">Observaciones</h4>
              <p className="text-sm text-text-secondary whitespace-pre-wrap">
                {selectedCompanyData.observaciones}
              </p>
            </div>
          )}
        </div>
      </Modal>

      {/* Form Modal */}
      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={selectedCompany ? 'Editar Empresa' : 'Nueva Empresa'}
        size="lg"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setIsFormOpen(false)}>Cancelar</Button>
            <Button variant="primary" onClick={handleSave}>
              {selectedCompany ? 'Guardar Cambios' : 'Crear Empresa'}
            </Button>
          </div>
        }
      >
        <form className="space-y-6" onSubmit={(e) => e.preventDefault()}>
          {/* Bloque 1: Identificación */}
          <div>
            <h4 className="text-sm font-medium text-text-primary mb-4">Identificación</h4>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-text-primary">
                    RUC <span className="text-error">*</span>
                  </label>
                  <input 
                    type="text" 
                    maxLength={11}
                    value={formData.ruc}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, '');
                      setFormData({ ...formData, ruc: value });
                      if (errors.ruc) setErrors({ ...errors, ruc: '' });
                    }}
                    className={`w-full h-10 bg-surface border ${errors.ruc ? 'border-error' : 'border-border-soft'} rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent transition-colors`}
                    placeholder="Ej. 20123456789"
                  />
                  {errors.ruc && <p className="text-xs text-error">{errors.ruc}</p>}
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-text-primary">
                    Razón Social <span className="text-error">*</span>
                  </label>
                  <input 
                    type="text" 
                    value={formData.razonSocial}
                    onChange={(e) => {
                      setFormData({ ...formData, razonSocial: e.target.value });
                      if (errors.razonSocial) setErrors({ ...errors, razonSocial: '' });
                    }}
                    className={`w-full h-10 bg-surface border ${errors.razonSocial ? 'border-error' : 'border-border-soft'} rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent transition-colors`}
                    placeholder="Ej. Educación y Cultura S.A.C."
                  />
                  {errors.razonSocial && <p className="text-xs text-error">{errors.razonSocial}</p>}
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-text-primary">Nombre corto / sigla</label>
                <input 
                  type="text" 
                  value={formData.nombreCorto}
                  onChange={(e) => setFormData({ ...formData, nombreCorto: e.target.value })}
                  className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent transition-colors"
                  placeholder="Ej. ENSIL INT"
                />
                <p className="text-xs text-text-muted">Útil para tablas, reportes y visualización interna.</p>
              </div>
            </div>
          </div>

          {/* Bloque 2: Control interno */}
          <div className="border-t border-border-soft pt-6">
            <h4 className="text-sm font-medium text-text-primary mb-4">Control interno</h4>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-text-primary">
                  Estado <span className="text-error">*</span>
                </label>
                <select 
                  value={formData.estado}
                  onChange={(e) => {
                    setFormData({ ...formData, estado: e.target.value });
                    if (errors.estado) setErrors({ ...errors, estado: '' });
                  }}
                  className={`w-full h-10 bg-surface border ${errors.estado ? 'border-error' : 'border-border-soft'} rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent transition-colors`}
                >
                  <option value="activo">Activo</option>
                  <option value="inactivo">Inactivo</option>
                </select>
                {errors.estado && <p className="text-xs text-error">{errors.estado}</p>}
              </div>

              {selectedCompany && formData.estado === 'inactivo' && hasLinkedBranches && (
                <div className="p-3 bg-error/10 border border-error/20 rounded-xl flex gap-3 items-start animate-in fade-in slide-in-from-top-2">
                  <AlertTriangle className="text-error shrink-0 mt-0.5" size={16} />
                  <p className="text-sm text-error leading-relaxed">
                    No se puede inactivar esta empresa porque está vinculada a al menos una filial. Debe desvincular las filiales primero.
                  </p>
                </div>
              )}

              {selectedCompany && formData.estado === 'inactivo' && !hasLinkedBranches && (
                <div className="p-3 bg-warning/10 border border-warning/20 rounded-xl flex gap-3 items-start animate-in fade-in slide-in-from-top-2">
                  <AlertTriangle className="text-warning shrink-0 mt-0.5" size={16} />
                  <p className="text-sm text-warning leading-relaxed">
                    Inactivar esta empresa no eliminará el historial, pero impedirá su uso en nuevos registros. ¿Desea continuar?
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <label className="block text-sm font-medium text-text-primary">Observaciones</label>
                <textarea 
                  value={formData.observaciones}
                  onChange={(e) => setFormData({ ...formData, observaciones: e.target.value })}
                  className="w-full h-24 bg-surface border border-border-soft rounded-xl p-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent resize-none transition-colors"
                  placeholder="Notas internas, aclaraciones o contexto administrativo..."
                />
              </div>
            </div>
          </div>
        </form>
      </Modal>

      {/* Deactivate Modal */}
      <Modal
        isOpen={isDeactivateModalOpen}
        onClose={() => setIsDeactivateModalOpen(false)}
        title="Desactivar Empresa"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setIsDeactivateModalOpen(false)}>Cancelar</Button>
            <Button 
              variant="danger" 
              onClick={() => {
                if (selectedCompany) {
                  updateCompany(selectedCompany, { status: 'Inactivo' });
                }
                setIsDeactivateModalOpen(false);
              }}
            >
              Desactivar Empresa
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3 text-warning">
            <AlertTriangle size={24} />
            <p className="text-sm font-medium">¿Estás seguro de que deseas desactivar esta empresa?</p>
          </div>
          <p className="text-sm text-text-secondary">
            Al desactivar la empresa, esta ya no estará activa para relacionarse con nuevas filiales. Los datos se mantendrán en el historial.
          </p>
        </div>
      </Modal>

      {/* Delete Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Eliminar Empresa"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setIsDeleteModalOpen(false)}>Cancelar</Button>
            {!hasLinkedBranches && (
              <Button 
                variant="danger" 
                onClick={() => {
                  if (selectedCompany) {
                    deleteCompany(selectedCompany);
                  }
                  setIsDeleteModalOpen(false);
                }}
              >
                Eliminar Empresa
              </Button>
            )}
          </div>
        }
      >
        <div className="space-y-4">
          {hasLinkedBranches ? (
            <>
              <div className="flex items-center gap-3 text-error">
                <AlertTriangle size={24} />
                <p className="text-sm font-medium">No se puede eliminar esta empresa</p>
              </div>
              <p className="text-sm text-text-secondary">
                El sistema ha detectado que esta empresa está vinculada a alguna filial. 
                Primero desvincula todas las sedes de esta empresa para poder eliminarla.
              </p>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3 text-error">
                <AlertTriangle size={24} />
                <p className="text-sm font-medium">¿Estás seguro de que deseas eliminar esta empresa?</p>
              </div>
              <p className="text-sm text-text-secondary">
                Esta acción es irreversible. Todos los datos asociados a esta empresa serán eliminados permanentemente del sistema.
              </p>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
