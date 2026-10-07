import React, { useState, useEffect } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Drawer } from '../components/ui/Drawer';
import { ActionMenu } from '../components/ui/ActionMenu';
import { Search, Filter, Download, MapPin, UserCheck, X } from 'lucide-react';
import { useData, Assignment, Staff } from '../context/DataContext';
import { useTablePagination } from '../hooks/useTablePagination';
import { Modal } from '../components/ui/Modal';

export function AssignmentsPage() {
  const { assignments, staff, branches } = useData();
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = useTablePagination();

  const filteredAssignments = assignments.filter(asg => {
    const staffName = `${staff.find(s => s.id === asg.staffId)?.names || ''} ${staff.find(s => s.id === asg.staffId)?.lastNameP || ''}`.toLowerCase();
    const matchesSearch = staffName.includes(searchTerm.toLowerCase()) || asg.branch.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesBranch = !selectedBranch || asg.branch === selectedBranch;
    return matchesSearch && matchesBranch;
  });

  const totalPages = Math.ceil(filteredAssignments.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedAssignments = filteredAssignments.slice(startIndex, endIndex);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const handleOpenDetail = (assignment: Assignment) => {
    setSelectedAssignment(assignment);
    setIsDetailOpen(true);
  };

  const getStaffName = (staffId: string) => {
    const member = staff.find(s => s.id === staffId);
    return member ? `${member.names} ${member.lastNameP} ${member.lastNameM}` : 'Desconocido';
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-text-primary mb-1">Asignaciones</h2>
          <p className="text-sm text-text-secondary">Vínculo entre trabajador, sede, área y cargo</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" className="hidden sm:flex items-center gap-2">
            <Download size={16} />
            Exportar
          </Button>
          <Button variant="primary" onClick={() => setIsFormOpen(true)} className="flex items-center gap-2">
            <MapPin size={16} />
            Nueva asignación
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="mb-6 p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
            <input 
              type="text" 
              placeholder="Buscar por trabajador o sede..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-10 bg-surface border border-border-soft rounded-xl pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary-accent focus:ring-1 focus:ring-primary-accent transition-shadow"
            />
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 md:pb-0">
            <select 
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent min-w-[140px]"
            >
              <option value="">Todas las sedes</option>
              {branches.map(b => (
                <option key={b.id} value={b.name}>{b.name}</option>
              ))}
            </select>
            <select className="h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent min-w-[140px]">
              <option value="">Área</option>
              <option value="admin">Administración</option>
              <option value="psico">Psicopedagogía</option>
              <option value="logistica">Logística</option>
            </select>
            <select className="h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent min-w-[140px]">
              <option value="">Estado</option>
              <option value="activa">Activa</option>
              <option value="inactiva">Inactiva</option>
            </select>
            <Button variant="secondary" className="shrink-0 px-3">
              <Filter size={16} />
            </Button>
          </div>
        </div>
      </Card>

      {/* Data Table */}
      <Card className="flex-1 overflow-hidden flex flex-col p-0">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-text-secondary uppercase bg-surface-muted/50 sticky top-0 z-10">
              <tr>
                <th className="px-6 py-4 font-medium">Trabajador</th>
                <th className="px-6 py-4 font-medium">Sede</th>
                <th className="px-6 py-4 font-medium">Área</th>
                <th className="px-6 py-4 font-medium">Cargo</th>
                <th className="px-6 py-4 font-medium">Principal</th>
                <th className="px-6 py-4 font-medium">Estado</th>
                <th className="px-6 py-4 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-soft">
              {paginatedAssignments.map((asg) => (
                <tr key={asg.id} className="hover:bg-surface-muted/50 transition-colors">
                  <td className="px-6 py-4 font-medium text-text-primary whitespace-nowrap">{getStaffName(asg.staffId)}</td>
                  <td className="px-6 py-4 text-text-primary whitespace-nowrap">{asg.branch}</td>
                  <td className="px-6 py-4 text-text-primary whitespace-nowrap">{asg.area}</td>
                  <td className="px-6 py-4 text-text-primary whitespace-nowrap">{asg.role}</td>
                  <td className="px-6 py-4">
                    {asg.isMain ? <Badge variant="primary">Sí</Badge> : <Badge variant="secondary">No</Badge>}
                  </td>
                  <td className="px-6 py-4">
                    <Badge variant={asg.status === 'Activa' ? 'success' : 'danger'}>{asg.status}</Badge>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <ActionMenu 
                      items={[
                        { label: 'Ver detalle', onClick: () => handleOpenDetail(asg) },
                        { label: 'Editar asignación', onClick: () => {} },
                        { label: 'Cerrar asignación', onClick: () => {}, danger: true },
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
            Mostrando {filteredAssignments.length > 0 ? startIndex + 1 : 0} a {Math.min(endIndex, filteredAssignments.length)} de {filteredAssignments.length} registros
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
      </Card>

      {/* Detail Modal */}
      <Modal 
        isOpen={isDetailOpen} 
        onClose={() => setIsDetailOpen(false)} 
        title="Detalle de Asignación"
        size="2xl"
      >
        {selectedAssignment && (
          <div className="space-y-8 pb-4">
            {/* Staff Info */}
            <div className="bg-surface-muted p-4 rounded-xl border border-border-soft">
              <label className="text-xs text-text-muted uppercase tracking-wider">Trabajador</label>
              <p className="text-lg font-semibold text-text-primary mt-1">{getStaffName(selectedAssignment.staffId)}</p>
            </div>

            {/* Assignment Details */}
            <section>
              <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider mb-4 border-b border-border-soft pb-2">Detalles de la Asignación</h3>
              <div className="grid grid-cols-2 gap-x-8 gap-y-6">
                <div>
                  <label className="text-xs text-text-muted uppercase tracking-wider">Sede</label>
                  <div className="flex items-center gap-2 mt-1">
                    <MapPin size={16} className="text-primary-accent" />
                    <p className="text-sm font-medium text-text-primary">{selectedAssignment.branch}</p>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-text-muted uppercase tracking-wider">Área / Departamento</label>
                  <p className="text-sm font-medium text-text-primary mt-1">{selectedAssignment.area}</p>
                </div>
                <div>
                  <label className="text-xs text-text-muted uppercase tracking-wider">Cargo / Rol</label>
                  <div className="flex items-center gap-2 mt-1">
                    <UserCheck size={16} className="text-primary-accent" />
                    <p className="text-sm font-medium text-text-primary">{selectedAssignment.role}</p>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-text-muted uppercase tracking-wider">Tipo de Asignación</label>
                  <div className="mt-1">
                    {selectedAssignment.isMain ? <Badge variant="primary">Principal</Badge> : <Badge variant="secondary">Secundaria</Badge>}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-text-muted uppercase tracking-wider">Fecha de Inicio</label>
                  <p className="text-sm font-medium text-text-primary mt-1">{selectedAssignment.startDate}</p>
                </div>
                <div>
                  <label className="text-xs text-text-muted uppercase tracking-wider">Estado</label>
                  <div className="mt-1">
                    <Badge variant={selectedAssignment.status === 'Activa' ? 'success' : 'danger'}>{selectedAssignment.status}</Badge>
                  </div>
                </div>
              </div>
            </section>

            <section>
              <label className="text-xs text-text-muted uppercase tracking-wider">Observaciones</label>
              <p className="text-sm text-text-primary mt-1">{selectedAssignment.observations || 'Sin observaciones.'}</p>
            </section>
          </div>
        )}
      </Modal>

      {/* Form Modal */}
      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title="Nueva Asignación"
        size="2xl"
        footer={
          <div className="flex justify-end gap-3 w-full">
            <Button variant="ghost" onClick={() => setIsFormOpen(false)}>Cancelar</Button>
            <Button variant="primary" onClick={() => setIsFormOpen(false)}>Guardar Asignación</Button>
          </div>
        }
      >
        <div className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-primary">Trabajador</label>
            <select className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent">
              <option value="">Seleccionar trabajador...</option>
              {staff.map(s => (
                <option key={s.id} value={s.id}>{s.names} {s.lastNameP} {s.lastNameM}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-text-primary">Sede</label>
              <select className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent">
                {branches.map(b => (
                  <option key={b.id} value={b.name}>{b.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-text-primary">Área</label>
              <select className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent">
                <option value="Administración">Administración</option>
                <option value="Psicopedagogía">Psicopedagogía</option>
                <option value="Logística">Logística</option>
                <option value="Ventas">Ventas</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-text-primary">Cargo</label>
              <input type="text" className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent" placeholder="Ej: Psicólogo Senior" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-text-primary">Rol del Sistema</label>
              <select className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent">
                <option value="Administración">Administración</option>
                <option value="Psicopedagogía">Psicopedagogía</option>
                <option value="Ventas">Ventas</option>
                <option value="Sin acceso">Sin acceso</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-text-primary">Fecha de Inicio</label>
              <input type="date" className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-text-primary">Fecha de Fin (Opcional)</label>
              <input type="date" className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent" />
            </div>
          </div>

          <div className="flex items-center justify-between p-4 bg-surface-muted rounded-xl border border-border-soft">
            <div>
              <p className="text-sm font-medium text-text-primary">Asignación Principal</p>
              <p className="text-xs text-text-secondary">Define si esta es la sede y cargo base del trabajador</p>
            </div>
            <input type="checkbox" className="w-5 h-5 accent-primary-accent" />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-text-primary">Observaciones</label>
            <textarea className="w-full h-24 bg-surface border border-border-soft rounded-xl p-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent resize-none" placeholder="Detalles adicionales de la asignación..."></textarea>
          </div>
        </div>
      </Modal>
    </div>
  );
}
