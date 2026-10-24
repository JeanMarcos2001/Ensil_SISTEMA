import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { ActionMenu } from '../components/ui/ActionMenu';
import { Search, Download, UserPlus } from 'lucide-react';
import { useData, Staff } from '../context/DataContext';
import { useTablePagination } from '../hooks/useTablePagination';
import { Modal } from '../components/ui/Modal';
import { StaffFormModal } from './people/StaffFormModal';
import { contractStatus } from '../utils/payroll';
import { allActivities, todayLocalISO } from '../utils/schedule';
import { ClearFilters } from '../components/ui/ClearFilters';
import { ReasonDialog } from '../components/ui/ReasonDialog';
import { csvFileName, downloadCsv } from '../utils/exportCsv';
import { INACTIVATION_REASONS, inactivationCheck, statusNote } from '../utils/staffStatus';

export function StaffPage() {
  const { staff, contracts, assignments, branches, schedules, monthlySchedules, inactivateStaff, reactivateStaff } = useData();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [toInactivate, setToInactivate] = useState<Staff | null>(null);
  const [toReactivate, setToReactivate] = useState<Staff | null>(null);
  const [selectedRole, setSelectedRole] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const today = todayLocalISO();
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = useTablePagination();

  const filteredStaff = staff.filter(member => {
    const matchesSearch = 
      member.names.toLowerCase().includes(searchTerm.toLowerCase()) ||
      member.lastNameP.toLowerCase().includes(searchTerm.toLowerCase()) ||
      member.lastNameM.toLowerCase().includes(searchTerm.toLowerCase()) ||
      member.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      member.docNumber.includes(searchTerm);

    const memberAssignment = assignments.find(a => a.staffId === member.id && a.isMain);
    const matchesBranch = !selectedBranch || memberAssignment?.branch === selectedBranch;
    const matchesRole = !selectedRole || memberAssignment?.role === selectedRole;
    const matchesStatus = !selectedStatus || member.status === selectedStatus;

    return matchesSearch && matchesBranch && matchesRole && matchesStatus;
  });
  const roleOptions = useMemo(() => [...new Set(assignments.filter(a => a.isMain).map(a => a.role))].sort(), [assignments]);
  const hasFilters = !!(searchTerm || selectedBranch || selectedRole || selectedStatus);
  const clearFilters = () => { setSearchTerm(''); setSelectedBranch(''); setSelectedRole(''); setSelectedStatus(''); };

  const totalPages = Math.ceil(filteredStaff.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedStaff = filteredStaff.slice(startIndex, endIndex);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedBranch, selectedRole, selectedStatus]);

  // ?ficha=ID abre la ficha de ese trabajador (se usa desde Asignaciones y Contratos)
  useEffect(() => {
    const id = params.get('ficha');
    if (!id) return;
    const member = staff.find(s => s.id === id);
    if (member) { setSelectedStaff(member); setIsDetailOpen(true); }
    setParams({}, { replace: true });
  }, [params, staff, setParams]);

  const inactivation = useMemo(
    () => (toInactivate ? inactivationCheck(toInactivate, { contracts, assignments, schedules, activities: allActivities(monthlySchedules), today }) : undefined),
    [toInactivate, contracts, assignments, schedules, monthlySchedules, today]
  );

  const handleExport = () => {
    downloadCsv(
      csvFileName('Personal', today),
      ['Código', 'Nombres', 'Apellido paterno', 'Apellido materno', 'Documento', 'Celular', 'Correo personal', 'Sede', 'Área', 'Cargo', 'Estado', 'Baja / reactivación'],
      filteredStaff.map(m => {
        const a = assignments.find(x => x.staffId === m.id && x.isMain);
        return [m.code, m.names, m.lastNameP, m.lastNameM, `${m.docType} ${m.docNumber}`, m.phone, m.personalEmail ?? '', a?.branch ?? '', a?.area ?? '', a?.role ?? '', m.status, statusNote(m)];
      })
    );
  };

  const handleOpenDetail = (member: Staff) => {
    setSelectedStaff(member);
    setIsDetailOpen(true);
  };

  const handleOpenForm = (member?: Staff) => {
    setEditingStaff(member || null);
    setIsFormOpen(true);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-text-primary mb-1">Personal</h2>
          <p className="text-sm text-text-secondary">Administración de trabajadores y colaboradores</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" className="hidden sm:flex items-center gap-2" onClick={handleExport} disabled={filteredStaff.length === 0}>
            <Download size={16} />
            Exportar
          </Button>
          <Button variant="primary" onClick={() => handleOpenForm()} className="flex items-center gap-2">
            <UserPlus size={16} />
            Nuevo trabajador
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
              placeholder="Buscar por nombre, DNI o código..." 
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
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent min-w-[140px]"
            >
              <option value="">Todos los cargos</option>
              {roleOptions.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent min-w-[140px]"
            >
              <option value="">Todos los estados</option>
              <option value="Activo">Activo</option>
              <option value="Inactivo">Inactivo</option>
            </select>
            <ClearFilters active={hasFilters} onClear={clearFilters} />
          </div>
        </div>
      </Card>

      {/* Data Table */}
      <Card className="flex-1 overflow-hidden flex flex-col p-0">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-text-secondary uppercase bg-surface-muted/50 sticky top-0 z-10">
              <tr>
                <th className="px-6 py-4 font-medium">Código</th>
                <th className="px-6 py-4 font-medium">Nombres y Apellidos</th>
                <th className="px-6 py-4 font-medium">Documento</th>
                <th className="px-6 py-4 font-medium">Sede / Área</th>
                <th className="px-6 py-4 font-medium">Cargo</th>
                <th className="px-6 py-4 font-medium">Estado</th>
                <th className="px-6 py-4 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-soft">
              {paginatedStaff.map((member) => {
                const mainAssignment = assignments.find(a => a.staffId === member.id && a.isMain);
                return (
                  <tr key={member.id} className="hover:bg-surface-muted/50 transition-colors">
                    <td className="px-6 py-4 font-medium text-text-primary whitespace-nowrap">{member.code}</td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-text-primary">{member.names} {member.lastNameP} {member.lastNameM}</div>
                      <div className="text-xs text-text-muted">{member.personalEmail || member.phone}</div>
                    </td>
                    <td className="px-6 py-4 text-text-secondary whitespace-nowrap">{member.docType}: {member.docNumber}</td>
                    <td className="px-6 py-4">
                      <div className="text-text-primary">{mainAssignment?.branch || '-'}</div>
                      <div className="text-xs text-text-muted">{mainAssignment?.area || '-'}</div>
                    </td>
                    <td className="px-6 py-4 text-text-primary">{mainAssignment?.role || '-'}</td>
                    <td className="px-6 py-4">
                      <Badge variant={member.status === 'Activo' ? 'success' : 'danger'}>{member.status}</Badge>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <ActionMenu 
                        items={[
                          { label: 'Ver detalle', onClick: () => handleOpenDetail(member) },
                          { label: 'Editar datos', onClick: () => handleOpenForm(member) },
                          { label: 'Ver contratos', onClick: () => navigate(`/personas/contratos?trabajador=${member.id}`) },
                          { label: 'Ver asignaciones', onClick: () => navigate(`/personas/asignaciones?trabajador=${member.id}`) },
                          member.status === 'Activo'
                            ? { label: 'Inactivar', onClick: () => setToInactivate(member), danger: true }
                            : { label: 'Reactivar', onClick: () => setToReactivate(member) },
                        ]} 
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="p-4 border-t border-border-soft flex items-center justify-between bg-surface">
          <span className="text-sm text-text-secondary">
            Mostrando {filteredStaff.length > 0 ? startIndex + 1 : 0} a {Math.min(endIndex, filteredStaff.length)} de {filteredStaff.length} registros
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
        title="Ficha del Trabajador"
        size="4xl"
        footer={
          <div className="flex justify-end gap-3 w-full">
            <Button variant="ghost" onClick={() => setIsDetailOpen(false)}>Cerrar</Button>
            <Button variant="primary" onClick={() => {
              setIsDetailOpen(false);
              handleOpenForm(selectedStaff || undefined);
            }}>Editar Ficha</Button>
          </div>
        }
      >
        {selectedStaff && (
          <div className="space-y-8 pb-4">
            {/* Basic Info */}
            <section>
              <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider mb-4 border-b border-border-soft pb-2">Datos Personales</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                <div>
                  <label className="text-xs text-text-muted uppercase tracking-wider">Código</label>
                  <p className="text-sm font-medium text-text-primary mt-1">{selectedStaff.code}</p>
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs text-text-muted uppercase tracking-wider">Estado</label>
                  <p className="text-sm font-medium text-text-primary mt-1">
                    <Badge variant={selectedStaff.status === 'Activo' ? 'success' : 'danger'}>{selectedStaff.status}</Badge>
                    {statusNote(selectedStaff) && <span className="ml-2 text-xs font-normal text-text-muted">{statusNote(selectedStaff)}</span>}
                  </p>
                </div>
                <div>
                  <label className="text-xs text-text-muted uppercase tracking-wider">Documento</label>
                  <p className="text-sm font-medium text-text-primary mt-1">{selectedStaff.docType} {selectedStaff.docNumber}</p>
                </div>
                <div>
                  <label className="text-xs text-text-muted uppercase tracking-wider">Fecha de Nacimiento</label>
                  <p className="text-sm font-medium text-text-primary mt-1">{selectedStaff.birthDate} ({selectedStaff.age} años)</p>
                </div>
                <div>
                  <label className="text-xs text-text-muted uppercase tracking-wider">Género</label>
                  <p className="text-sm font-medium text-text-primary mt-1">{selectedStaff.gender}</p>
                </div>
                <div>
                  <label className="text-xs text-text-muted uppercase tracking-wider">Estado Civil</label>
                  <p className="text-sm font-medium text-text-primary mt-1">{selectedStaff.civilStatus}</p>
                </div>
                <div>
                  <label className="text-xs text-text-muted uppercase tracking-wider">Hijos</label>
                  <p className="text-sm font-medium text-text-primary mt-1">{selectedStaff.hasChildren ? `Sí (${selectedStaff.childrenCount})` : 'No'}</p>
                </div>
              </div>
            </section>

            {/* Contact & Education */}
            <section>
              <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider mb-4 border-b border-border-soft pb-2">Contacto y Formación</h3>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-6">
                <div>
                  <label className="text-xs text-text-muted uppercase tracking-wider">Celular</label>
                  <p className="text-sm font-medium text-text-primary mt-1">{selectedStaff.phone}</p>
                </div>
                <div>
                  <label className="text-xs text-text-muted uppercase tracking-wider">Correo Personal</label>
                  <p className="text-sm font-medium text-text-primary mt-1">{selectedStaff.personalEmail || '-'}</p>
                </div>
                <div className="lg:col-span-2">
                  <label className="text-xs text-text-muted uppercase tracking-wider">Dirección</label>
                  <p className="text-sm font-medium text-text-primary mt-1">{selectedStaff.address}</p>
                </div>
                <div>
                  <label className="text-xs text-text-muted uppercase tracking-wider">Grado de Instrucción</label>
                  <p className="text-sm font-medium text-text-primary mt-1">{selectedStaff.educationLevel}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-6 mt-6">
                <div>
                  <label className="text-xs text-text-muted uppercase tracking-wider">Profesión</label>
                  <p className="text-sm font-medium text-text-primary mt-1">{selectedStaff.profession}</p>
                </div>
                <div>
                  <label className="text-xs text-text-muted uppercase tracking-wider">Especialidad</label>
                  <p className="text-sm font-medium text-text-primary mt-1">{selectedStaff.specialty || '-'}</p>
                </div>
              </div>
            </section>

            {/* Current Assignments */}
            <section>
              <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider mb-4 border-b border-border-soft pb-2">Asignaciones Activas</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {assignments.filter(a => a.staffId === selectedStaff.id && a.status === 'Activa').map(asg => (
                  <div key={asg.id} className="flex items-center justify-between p-3 bg-surface-muted rounded-lg border border-border-soft">
                    <div>
                      <div className="text-sm font-medium text-text-primary">{asg.role} - {asg.area}</div>
                      <div className="text-xs text-text-muted">{asg.branch} | Desde: {asg.startDate}</div>
                    </div>
                    {asg.isMain && <Badge variant="primary">Principal</Badge>}
                  </div>
                ))}
              </div>
            </section>

            {/* Current Contract */}
            <section>
              <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider mb-4 border-b border-border-soft pb-2">Contrato Vigente</h3>
              {(() => {
                const activeContract = contracts.find(c => c.staffId === selectedStaff.id && contractStatus(c, todayLocalISO()) === 'Vigente');
                if (!activeContract) return <p className="text-sm text-text-muted italic">No hay contrato vigente registrado.</p>;
                return (
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 bg-surface-muted p-4 rounded-xl border border-border-soft">
                    <div>
                      <label className="text-xs text-text-muted uppercase tracking-wider">Tipo</label>
                      <p className="text-sm font-medium text-text-primary mt-1">{activeContract.type}</p>
                    </div>
                    <div>
                      <label className="text-xs text-text-muted uppercase tracking-wider">Inicio</label>
                      <p className="text-sm font-medium text-text-primary mt-1">{activeContract.startDate}</p>
                    </div>
                    <div>
                      <label className="text-xs text-text-muted uppercase tracking-wider">Jornada</label>
                      <p className="text-sm font-medium text-text-primary mt-1">{activeContract.shift}</p>
                    </div>
                    <div>
                      <label className="text-xs text-text-muted uppercase tracking-wider">Sueldo Neto</label>
                      <p className="text-sm font-medium text-text-primary mt-1">S/ {activeContract.netSalary?.toLocaleString()}</p>
                    </div>
                  </div>
                );
              })()}
            </section>
          </div>
        )}
      </Modal>

      <StaffFormModal isOpen={isFormOpen} onClose={() => setIsFormOpen(false)} editing={editingStaff} />

      <ReasonDialog
        isOpen={!!toInactivate}
        onClose={() => setToInactivate(null)}
        title="Inactivar trabajador"
        confirmLabel="Inactivar"
        danger
        reasons={INACTIVATION_REASONS}
        reasonLabel="Motivo de la baja"
        detailLabel="Explicación"
        dateLabel="Fecha de baja"
        dateMax={today}
        dateDefault={today}
        blocked={inactivation?.blocked ? (
          <ul className="space-y-1 list-disc pl-4">
            {inactivation.contract && <li>Tiene un contrato vigente ({inactivation.contract.type}). Ciérrelo primero en Personas → Contratos.</li>}
            {inactivation.sessions.length > 0 && <li>Tiene {inactivation.sessions.length} asesoría(s) futura(s) a su nombre. Reasígnelas en Psicopedagogía → Programación.</li>}
            {inactivation.activities.length > 0 && <li>Tiene {inactivation.activities.length} actividad(es) especial(es) a su cargo. Asigne otro responsable en Psicopedagogía → Programación → Actividades especiales.</li>}
          </ul>
        ) : null}
        onSubmit={({ reason, detail, date }) => {
          if (!toInactivate) return;
          const r = inactivateStaff(toInactivate.id, { reason, detail, date });
          return r.ok ? null : r.error ?? 'No se pudo inactivar al trabajador.';
        }}
      >
        {toInactivate && inactivation && (
          <div className="space-y-2 text-sm">
            <p className="text-text-secondary">
              Se dará de baja a <span className="font-medium text-text-primary">{toInactivate.names} {toInactivate.lastNameP} {toInactivate.lastNameM}</span>. Su ficha no se borra: queda en el historial.
            </p>
            <ul className="space-y-1 text-text-secondary list-disc pl-5">
              <li>
                {inactivation.assignmentsToClose.length > 0
                  ? `Se cerrarán sus ${inactivation.assignmentsToClose.length} asignación(es) activa(s): dejará de aparecer como responsable de entrevistas, asesorías y verificaciones.`
                  : 'No tiene asignaciones activas.'}
              </li>
              <li>Para volver a trabajar con la persona se reactiva y se registran una asignación y un contrato nuevos.</li>
            </ul>
          </div>
        )}
      </ReasonDialog>

      <ReasonDialog
        isOpen={!!toReactivate}
        onClose={() => setToReactivate(null)}
        title="Reactivar trabajador"
        confirmLabel="Reactivar"
        size="md"
        detailLabel="Motivo de la reactivación"
        detailPlaceholder="Ej: Reingreso a la institución..."
        onSubmit={({ detail }) => {
          if (!toReactivate) return;
          const r = reactivateStaff(toReactivate.id, detail);
          return r.ok ? null : r.error ?? 'No se pudo reactivar al trabajador.';
        }}
      >
        {toReactivate && (
          <p className="text-sm text-text-secondary">
            <span className="font-medium text-text-primary">{toReactivate.names} {toReactivate.lastNameP}</span> volverá a estar activo. Sus asignaciones anteriores siguen cerradas: registre una nueva en Personas → Asignaciones y un contrato nuevo en Contratos.
          </p>
        )}
      </ReasonDialog>
    </div>
  );
}
