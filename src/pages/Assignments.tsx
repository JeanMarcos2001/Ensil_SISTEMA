import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Drawer } from '../components/ui/Drawer';
import { ActionMenu } from '../components/ui/ActionMenu';
import { Search, Download, MapPin, UserCheck, X } from 'lucide-react';
import { useData, Assignment, Staff } from '../context/DataContext';
import { useTablePagination } from '../hooks/useTablePagination';
import { Modal } from '../components/ui/Modal';
import { ClearFilters } from '../components/ui/ClearFilters';
import { ReasonDialog } from '../components/ui/ReasonDialog';
import { AssignmentFormModal } from './people/AssignmentFormModal';
import { AREAS, closeImpact, isActive } from '../utils/assignments';
import { csvFileName, downloadCsv } from '../utils/exportCsv';
import { allActivities, todayLocalISO } from '../utils/schedule';

export function AssignmentsPage() {
  const { assignments, staff, branches, schedules, monthlySchedules, closeAssignment } = useData();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const staffFilter = params.get('trabajador') ?? '';
  const filteredStaff = staff.find(s => s.id === staffFilter);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState<Assignment | null>(null);
  const [toClose, setToClose] = useState<Assignment | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('');
  const [selectedArea, setSelectedArea] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = useTablePagination();
  const today = todayLocalISO();

  const filteredAssignments = assignments.filter(asg => {
    const staffName = `${staff.find(s => s.id === asg.staffId)?.names || ''} ${staff.find(s => s.id === asg.staffId)?.lastNameP || ''}`.toLowerCase();
    const matchesSearch = staffName.includes(searchTerm.toLowerCase()) || asg.branch.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesBranch = !selectedBranch || asg.branch === selectedBranch;
    const matchesArea = !selectedArea || asg.area === selectedArea;
    const matchesStatus = !selectedStatus || asg.status === selectedStatus;
    const matchesStaff = !staffFilter || asg.staffId === staffFilter;
    return matchesSearch && matchesBranch && matchesArea && matchesStatus && matchesStaff;
  });
  const hasFilters = !!(searchTerm || selectedBranch || selectedArea || selectedStatus || staffFilter);
  const clearFilters = () => { setSearchTerm(''); setSelectedBranch(''); setSelectedArea(''); setSelectedStatus(''); setParams({}); };

  const totalPages = Math.ceil(filteredAssignments.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedAssignments = filteredAssignments.slice(startIndex, endIndex);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedBranch, selectedArea, selectedStatus, staffFilter]);

  const handleOpenDetail = (assignment: Assignment) => {
    setSelectedAssignment(assignment);
    setIsDetailOpen(true);
  };

  const getStaffName = (staffId: string) => {
    const member = staff.find(s => s.id === staffId);
    return member ? `${member.names} ${member.lastNameP} ${member.lastNameM}` : 'Desconocido';
  };

  const openNew = () => { setEditing(null); setIsFormOpen(true); };
  const openEdit = (a: Assignment) => { setEditing(a); setIsFormOpen(true); };

  const impact = useMemo(
    () => (toClose ? closeImpact(toClose, assignments, staff.find(s => s.id === toClose.staffId), schedules, today, allActivities(monthlySchedules)) : undefined),
    [toClose, assignments, staff, schedules, today]
  );

  const handleExport = () => {
    downloadCsv(
      csvFileName('Asignaciones', today),
      ['Trabajador', 'Sede', 'Área', 'Cargo', 'Rol del sistema', 'Principal', 'Estado', 'Inicio', 'Fin', 'Motivo de cierre'],
      filteredAssignments.map(a => [getStaffName(a.staffId), a.branch, a.area, a.role, a.systemRole ?? '', a.isMain ? 'Sí' : 'No', a.status, a.startDate, a.endDate ?? '', a.closeReason ?? ''])
    );
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
          <Button variant="secondary" className="hidden sm:flex items-center gap-2" onClick={handleExport} disabled={filteredAssignments.length === 0}>
            <Download size={16} />
            Exportar
          </Button>
          <Button variant="primary" onClick={openNew} className="flex items-center gap-2">
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
            <select
              value={selectedArea}
              onChange={(e) => setSelectedArea(e.target.value)}
              className="h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent min-w-[140px]"
            >
              <option value="">Todas las áreas</option>
              {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent min-w-[140px]"
            >
              <option value="">Todos los estados</option>
              <option value="Activa">Activa</option>
              <option value="Cerrada">Cerrada</option>
            </select>
            <ClearFilters active={hasFilters} onClear={clearFilters} />
          </div>
        </div>
        {filteredStaff && (
          <div className="mt-3 flex items-center gap-2 text-sm">
            <Badge variant="primary">Trabajador: {filteredStaff.names} {filteredStaff.lastNameP}</Badge>
            <button className="text-xs text-text-muted hover:text-text-primary underline" onClick={() => setParams({})}>Quitar filtro</button>
          </div>
        )}
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
                    <Badge variant={asg.status === 'Activa' ? 'success' : 'neutral'}>{asg.status}</Badge>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <ActionMenu 
                      items={[
                        { label: 'Ver detalle', onClick: () => handleOpenDetail(asg) },
                        { label: 'Ver trabajador', onClick: () => navigate(`/personas/personal?ficha=${asg.staffId}`) },
                        ...(isActive(asg) ? [
                          { label: 'Editar asignación', onClick: () => openEdit(asg) },
                          { label: 'Cerrar asignación', onClick: () => setToClose(asg), danger: true },
                        ] : []),
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
                    <Badge variant={selectedAssignment.status === 'Activa' ? 'success' : 'neutral'}>{selectedAssignment.status}</Badge>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-text-muted uppercase tracking-wider">{selectedAssignment.status === 'Activa' ? 'Fecha de fin prevista' : 'Fecha de cierre'}</label>
                  <p className="text-sm font-medium text-text-primary mt-1">{selectedAssignment.endDate || '—'}</p>
                </div>
                <div>
                  <label className="text-xs text-text-muted uppercase tracking-wider">Rol del sistema</label>
                  <p className="text-sm font-medium text-text-primary mt-1">{selectedAssignment.systemRole || '—'}</p>
                </div>
              </div>
            </section>

            {selectedAssignment.status === 'Cerrada' && (
              <section className="bg-surface-muted p-4 rounded-xl border border-border-soft">
                <label className="text-xs text-text-muted uppercase tracking-wider">Motivo del cierre</label>
                <p className="text-sm text-text-primary mt-1">{selectedAssignment.closeReason || '—'}{selectedAssignment.closedBy ? ` · ${selectedAssignment.closedBy}` : ''}</p>
              </section>
            )}

            <section>
              <label className="text-xs text-text-muted uppercase tracking-wider">Observaciones</label>
              <p className="text-sm text-text-primary mt-1">{selectedAssignment.observations || 'Sin observaciones.'}</p>
            </section>
          </div>
        )}
      </Modal>

      <AssignmentFormModal isOpen={isFormOpen} onClose={() => setIsFormOpen(false)} editing={editing} presetStaffId={staffFilter || undefined} />

      <ReasonDialog
        isOpen={!!toClose}
        onClose={() => setToClose(null)}
        title="Cerrar asignación"
        confirmLabel="Cerrar asignación"
        danger
        reasonLabel="Motivo"
        reasons={['Cambio de sede o de área', 'Fin del encargo', 'Renuncia o cese', 'Otro']}
        detailLabel="Explicación"
        dateLabel="Fecha de cierre"
        dateMin={toClose?.startDate}
        dateMax={today}
        dateDefault={today}
        blocked={impact?.blocked ? `Es su última asignación de Psicopedagogía y tiene ${impact.futureSessions.length} asesoría(s) y ${impact.futureActivities.length} actividad(es) futura(s) a su nombre. Reasígnelas en Psicopedagogía → Programación (y Actividades especiales) y vuelva a intentarlo.` : null}
        onSubmit={({ reason, detail, date }) => {
          if (!toClose) return;
          if (!reason) return 'Seleccione el motivo del cierre.';
          const r = closeAssignment(toClose.id, date, `${reason} — ${detail.trim()}`);
          return r.ok ? null : r.error ?? 'No se pudo cerrar la asignación.';
        }}
      >
        {toClose && impact && (
          <div className="space-y-3 text-sm">
            <p className="text-text-secondary">
              Se cerrará la asignación de <span className="font-medium text-text-primary">{getStaffName(toClose.staffId)}</span> como {toClose.role} en {toClose.branch} ({toClose.area}). No se borra: queda en el historial.
            </p>
            <ul className="space-y-1 text-text-secondary list-disc pl-5">
              {impact.promoted && <li>«{impact.promoted.role} · {impact.promoted.branch}» pasará a ser su asignación principal.</li>}
              {impact.noneLeft && <li>Quedará sin ninguna asignación activa: no aparecerá en las listas de responsables.</li>}
              {impact.leavesInterviewers && <li>Dejará de aparecer como responsable de entrevistas y asesorías.</li>}
              {!impact.promoted && !impact.noneLeft && !impact.leavesInterviewers && <li>No cambia su asignación principal ni sus otras asignaciones.</li>}
            </ul>
          </div>
        )}
      </ReasonDialog>
    </div>
  );
}
