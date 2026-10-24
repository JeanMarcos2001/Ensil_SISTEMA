import React, { useState, useEffect } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { ActionMenu } from '../components/ui/ActionMenu';
import { Search, Download, Plus, X, User, GraduationCap, Calendar, FileText, Phone, Mail, MapPin } from 'lucide-react';
import { ClearFilters } from '../components/ui/ClearFilters';
import { csvFileName, downloadCsv } from '../utils/exportCsv';
import { useData } from '../context/DataContext';
import { useTablePagination } from '../hooks/useTablePagination';
import { Modal } from '../components/ui/Modal';
import { useNavigate } from 'react-router-dom';
import { StudentFormModal } from './people/StudentFormModal';
import { ACTIVE_STATUSES, studentProgramLabel, todayLocalISO } from '../utils/schedule';

export function Students() {
  const { students, enrollments, schedules, trackings, branches } = useData();
  const today = todayLocalISO();
  const navigate = useNavigate();
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = useTablePagination();

  const selectedStudent = students.find(s => s.id === selectedStudentId);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<any | null>(null);

  const filteredStudents = students.filter(s => {
    const matchesSearch = 
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.doc.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Check student's enrollment sede if available
    const studentEnrollment = enrollments.find(e => e.studentId === s.id || e.student === s.name);
    const matchesBranch = !selectedBranch || (studentEnrollment && studentEnrollment.sede === selectedBranch);

    const matchesStatus = !selectedStatus || s.status === selectedStatus;

    return matchesSearch && matchesBranch && matchesStatus;
  });
  const hasFilters = !!(searchTerm || selectedBranch || selectedStatus);
  const clearFilters = () => { setSearchTerm(''); setSelectedBranch(''); setSelectedStatus(''); };

  const handleExport = () => {
    downloadCsv(
      csvFileName('Alumnos', today),
      ['Código', 'Documento', 'Alumno', 'Edad', 'Programa', 'Titular', 'Estado'],
      filteredStudents.map(s => [s.id, `${s.docType ?? 'DNI'} ${s.doc}`, s.name, s.age, studentProgramLabel(s, enrollments) || 'Sin matrícula', s.titular, s.status])
    );
  };

  const totalPages = Math.ceil(filteredStudents.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedStudents = filteredStudents.slice(startIndex, endIndex);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedBranch, selectedStatus]);

  const handleOpenDetail = (id: string) => {
    setSelectedStudentId(id);
    setIsDetailOpen(true);
  };

  const handleOpenForm = (student?: any) => {
    setEditingStudent(student || null);
    setIsFormOpen(true);
  };

  const studentEnrollments = enrollments.filter(e => e.studentId === selectedStudent?.id || e.student === selectedStudent?.name);
  // Próxima asesoría: la más cercana que sigue activa (reservada o reprogramada) desde hoy
  const nextSchedule = schedules
    .filter(s => (s.studentId === selectedStudent?.id || s.student === selectedStudent?.name) && s.date >= today && ['Reservado', 'Reprogramado'].includes(s.status))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0];
  const latestTracking = trackings.filter(t => t.studentId === selectedStudent?.id).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-text-primary mb-1">Alumnos</h2>
          <p className="text-sm text-text-secondary">Maestro de beneficiarios y alumnos</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" className="hidden sm:flex items-center gap-2" onClick={handleExport} disabled={filteredStudents.length === 0}>
            <Download size={16} />
            Exportar
          </Button>
          <Button variant="primary" onClick={() => handleOpenForm()} className="flex items-center gap-2">
            <Plus size={16} />
            Nuevo alumno
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
              placeholder="Buscar por nombre, documento o código..." 
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
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-primary-accent min-w-[140px]"
            >
              <option value="">Todos los estados</option>
              <option value="Activo">Activo</option>
              <option value="Inactivo">Inactivo</option>
              <option value="Sin matrícula">Sin matrícula</option>
              <option value="Egresado">Egresado</option>
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
                <th className="px-6 py-4 font-medium">Código / Doc</th>
                <th className="px-6 py-4 font-medium">Alumno</th>
                <th className="px-6 py-4 font-medium">Edad</th>
                <th className="px-6 py-4 font-medium">Programa Activo</th>
                <th className="px-6 py-4 font-medium">Titular Principal</th>
                <th className="px-6 py-4 font-medium">Estado</th>
                <th className="px-6 py-4 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-soft">
              {paginatedStudents.map((row, idx) => (
                <tr key={row.id} className="hover:bg-surface-muted/50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="font-medium text-text-primary">{row.id}</div>
                    <div className="text-xs text-text-muted">{row.doc}</div>
                  </td>
                  <td className="px-6 py-4 font-medium text-text-primary">{row.name}</td>
                  <td className="px-6 py-4 text-text-secondary">{row.age} años</td>
                  <td className="px-6 py-4 text-text-secondary">{studentProgramLabel(row, enrollments) || 'Sin matrícula'}</td>
                  <td className="px-6 py-4 text-text-secondary">{row.titular}</td>
                  <td className="px-6 py-4">
                    <Badge variant={row.status === 'Activo' ? 'success' : 'neutral'}>{row.status}</Badge>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <ActionMenu 
                      items={[
                        { label: 'Ver perfil', onClick: () => handleOpenDetail(row.id) },
                        { label: 'Ver matrículas', onClick: () => navigate(`/operacion/matriculas?alumno=${row.id}`) },
                        { label: 'Editar datos', onClick: () => handleOpenForm(row) },
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
            Mostrando {filteredStudents.length > 0 ? startIndex + 1 : 0} a {Math.min(endIndex, filteredStudents.length)} de {filteredStudents.length} registros
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

      {/* Perfil del Alumno Modal */}
      <Modal 
        isOpen={isDetailOpen} 
        onClose={() => setIsDetailOpen(false)} 
        title="Ficha del Alumno"
        size="4xl"
      >
        {selectedStudent && (
          <div className="space-y-6 pb-4">
            {/* Header Profil */}
            <div className="flex flex-col md:flex-row md:items-center gap-6 bg-surface-muted p-6 rounded-xl border border-border-soft">
              <div className="w-24 h-24 bg-primary-accent/10 rounded-2xl flex items-center justify-center text-primary-accent font-bold text-3xl shadow-inner border border-primary-accent/10">
                {selectedStudent.name.charAt(0)}
              </div>
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <h3 className="text-2xl font-bold text-text-primary tracking-tight">{selectedStudent.name}</h3>
                  <Badge variant={selectedStudent.status === 'Activo' ? 'success' : 'neutral'}>{selectedStudent.status}</Badge>
                </div>
                <div className="flex flex-wrap gap-4 text-sm text-text-secondary">
                  <span className="flex items-center gap-1.5"><User size={14} /> DNI: {selectedStudent.doc}</span>
                  <span className="flex items-center gap-1.5"><GraduationCap size={14} /> {selectedStudent.grado || 'Sin grado'}</span>
                  <span className="flex items-center gap-1.5"><Calendar size={14} /> {selectedStudent.age} años</span>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => handleOpenForm(selectedStudent)}>Editar Ficha</Button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Información Personal y Familiar */}
              <section className="space-y-6">
                <div>
                  <h4 className="flex items-center gap-2 text-xs font-bold text-text-muted uppercase tracking-widest mb-4">
                    <User size={14} /> Información Personal
                  </h4>
                  <div className="grid grid-cols-2 gap-6 bg-surface p-4 rounded-xl border border-border-soft">
                    <div className="space-y-1">
                      <p className="text-[10px] text-text-muted uppercase tracking-wider">Colegio</p>
                      <p className="text-sm font-medium text-text-primary">{selectedStudent.colegio || '-'}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] text-text-muted uppercase tracking-wider">Programa Principal</p>
                      <p className="text-sm font-medium text-primary-accent">{studentProgramLabel(selectedStudent, enrollments) || 'Sin matrícula'}</p>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="flex items-center gap-2 text-xs font-bold text-text-muted uppercase tracking-widest mb-4">
                    <User size={14} /> Contacto y Titular
                  </h4>
                  <div className="space-y-4 bg-surface p-4 rounded-xl border border-border-soft">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-surface-muted flex items-center justify-center text-text-secondary">
                        <User size={16} />
                      </div>
                      <div>
                        <p className="text-xs text-text-muted">Titular / Responsable</p>
                        <p className="text-sm font-bold text-text-primary">{selectedStudent.titular}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* Status Académico y Seguimiento */}
              <section className="space-y-6">
                <div>
                  <h4 className="flex items-center gap-2 text-xs font-bold text-text-muted uppercase tracking-widest mb-4">
                    <Calendar size={14} /> Próxima Sesión
                  </h4>
                  <div className="bg-primary-accent/5 border border-primary-accent/10 rounded-xl p-4">
                    {nextSchedule ? (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-white flex flex-col items-center justify-center shadow-sm">
                            <span className="text-[10px] font-bold text-primary-accent uppercase">{nextSchedule.date.split('-')[1]}</span>
                            <span className="text-lg font-bold text-text-primary -mt-1">{nextSchedule.date.split('-')[2]}</span>
                          </div>
                          <div>
                            <p className="text-sm font-bold text-text-primary">{nextSchedule.program}</p>
                            <p className="text-xs text-text-secondary">{nextSchedule.time} - {nextSchedule.responsible}</p>
                          </div>
                        </div>
                        <Badge variant="success">Confirmado</Badge>
                      </div>
                    ) : (
                      <p className="text-sm text-text-muted italic text-center py-2">No hay sesiones programadas esta semana.</p>
                    )}
                  </div>
                </div>

                <div>
                  <h4 className="flex items-center gap-2 text-xs font-bold text-text-muted uppercase tracking-widest mb-4">
                    <FileText size={14} /> Último Seguimiento
                  </h4>
                  {latestTracking ? (
                    <div className="bg-surface p-4 rounded-xl border border-border-soft space-y-3 shadow-inner">
                      <div className="flex justify-between items-start">
                        <p className="text-sm font-bold text-text-primary">{latestTracking.status}</p>
                        <span className="text-[10px] font-medium text-text-muted bg-surface-muted px-1.5 py-0.5 rounded uppercase tracking-wider">{latestTracking.date}</span>
                      </div>
                      <p className="text-sm text-text-secondary line-clamp-3 italic leading-relaxed">"{latestTracking.observations}"</p>
                      <Button variant="ghost" className="w-full text-xs text-primary-accent h-8" onClick={() => navigate(`/psicopedagogia/historial-del-alumno?alumno=${selectedStudent.id}`)}>Ver Seguimiento Completo</Button>
                    </div>
                  ) : (
                    <div className="bg-surface p-4 rounded-xl border border-border-soft border-dashed flex flex-col items-center justify-center py-6 text-center">
                      <p className="text-sm text-text-muted mb-2">No se han registrado seguimientos psicopedagógicos aún.</p>
                      <Button variant="secondary" className="text-xs h-8" onClick={() => navigate(`/psicopedagogia/historial-del-alumno?alumno=${selectedStudent.id}`)}>Ver historial y programar asesoría</Button>
                    </div>
                  )}
                </div>
              </section>
            </div>
            
            {/* Matrículas Históricas */}
            <div className="border-t border-border-soft pt-6">
              <h4 className="text-sm font-bold text-text-primary mb-4 flex items-center justify-between">
                Historial de Matrículas
                <Badge variant="neutral">{studentEnrollments.length} Registros</Badge>
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {studentEnrollments.map(e => (
                  <div key={e.id} className="flex items-center justify-between p-3 bg-surface border border-border-soft rounded-xl hover:border-primary-accent/30 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-surface-muted flex items-center justify-center border border-border-soft">
                        <GraduationCap size={16} className="text-text-muted" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-text-primary">{e.program}</p>
                        <p className="text-xs text-text-secondary">{e.date}</p>
                      </div>
                    </div>
                    <Badge variant={e.status === 'Activa' ? 'success' : 'danger'}>{e.status}</Badge>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>

      <StudentFormModal isOpen={isFormOpen} onClose={() => setIsFormOpen(false)} editing={editingStudent} />
    </div>
  );
}
