import React, { useState, useEffect } from 'react';
import { Search, Filter, Calendar as CalendarIcon, Clock, User, FileText, Activity, BookOpen, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { ActionMenu } from '../../components/ui/ActionMenu';
import { Modal } from '../../components/ui/Modal';
import { Select } from '../../components/ui/Select';
import { useData } from '../../context/DataContext';
import { useTablePagination } from '../../hooks/useTablePagination';

export function Tracking() {
  const { students, trackings, addTracking } = useData();
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [viewMode, setViewMode] = useState<'daily' | 'student'>('daily');

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = useTablePagination();

  const filteredStudents = students.filter(s => 
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.program.toLowerCase().includes(searchTerm.toLowerCase())
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const totalPages = Math.ceil(filteredStudents.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedStudents = filteredStudents.slice(startIndex, endIndex);

  // Form state
  const [formState, setFormState] = useState({
    fechaAsistencia: new Date().toISOString().split('T')[0],
    estadoAsistencia: 'Asistió',
    observaciones: '',
    metrics: {} as any
  });

  const handleSave = () => {
    if (!selectedStudent) return;
    addTracking({
      studentId: selectedStudent.id,
      date: formState.fechaAsistencia,
      status: formState.estadoAsistencia,
      metrics: formState.metrics,
      observations: formState.observaciones
    });
    setIsModalOpen(false);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Asistió': return 'success';
      case 'Faltó': return 'danger';
      case 'No reservó': return 'warning';
      default: return 'neutral';
    }
  };

  const handleOpenModal = (student?: any) => {
    setSelectedStudent(student || null);
    setFormState({
      fechaAsistencia: new Date().toISOString().split('T')[0],
      estadoAsistencia: 'Asistió',
      observaciones: '',
      metrics: {}
    });
    setIsModalOpen(true);
  };

  const renderMetricsForm = () => {
    if (!selectedStudent || formState.estadoAsistencia !== 'Asistió') return null;

    const program = selectedStudent.program.split(' - ')[0];

    if (program === 'Especialización' || program === 'Teens') {
      return (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 bg-surface-50 rounded-xl border border-border-soft">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Módulo</label>
            <Input 
              placeholder="Ej. Módulo 4" 
              value={formState.metrics.modulo || ''}
              onChange={(e) => setFormState({...formState, metrics: {...formState.metrics, modulo: e.target.value}})}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Velocidad (pxm)</label>
            <Input 
              type="number" 
              placeholder="0" 
              value={formState.metrics.velocidad || ''}
              onChange={(e) => setFormState({...formState, metrics: {...formState.metrics, velocidad: e.target.value}})}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Comprensión (%)</label>
            <Input 
              type="number" 
              placeholder="0-100" 
              min="0" max="100"
              value={formState.metrics.comprension || ''}
              onChange={(e) => setFormState({...formState, metrics: {...formState.metrics, comprension: e.target.value}})}
            />
          </div>
        </div>
      );
    }

    if (program === 'Kids') {
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-4 bg-surface-50 rounded-xl border border-border-soft">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Nivel</label>
            <Input 
              placeholder="Ej. Nivel 2" 
              value={formState.metrics.nivel || ''}
              onChange={(e) => setFormState({...formState, metrics: {...formState.metrics, nivel: e.target.value}})}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Sesión</label>
            <Input 
              placeholder="Ej. Sesión 5" 
              value={formState.metrics.sesion || ''}
              onChange={(e) => setFormState({...formState, metrics: {...formState.metrics, sesion: e.target.value}})}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Velocidad (pxm)</label>
            <Input 
              type="number" 
              placeholder="0" 
              value={formState.metrics.velocidad || ''}
              onChange={(e) => setFormState({...formState, metrics: {...formState.metrics, velocidad: e.target.value}})}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Comprensión (%)</label>
            <Input 
              type="number" 
              placeholder="0-100" 
              min="0" max="100"
              value={formState.metrics.comprension || ''}
              onChange={(e) => setFormState({...formState, metrics: {...formState.metrics, comprension: e.target.value}})}
            />
          </div>
        </div>
      );
    }

    if (program === 'Pre-Kids') {
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-4 bg-surface-50 rounded-xl border border-border-soft">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Nivel</label>
            <Input 
              placeholder="Ej. Nivel 1" 
              value={formState.metrics.nivel || ''}
              onChange={(e) => setFormState({...formState, metrics: {...formState.metrics, nivel: e.target.value}})}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Semana</label>
            <Input 
              placeholder="Ej. Semana 3" 
              value={formState.metrics.semana || ''}
              onChange={(e) => setFormState({...formState, metrics: {...formState.metrics, semana: e.target.value}})}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">¿Identifica?</label>
            <Select 
              options={[
                { value: 'Sí', label: 'Sí' },
                { value: 'No', label: 'No' },
                { value: '50%', label: '50%' },
              ]}
              value={formState.metrics.identifica || ''}
              onChange={(e) => setFormState({...formState, metrics: {...formState.metrics, identifica: e.target.value}})}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">¿Lee solo?</label>
            <Select 
              options={[
                { value: 'Sí', label: 'Sí' },
                { value: 'No', label: 'No' },
                { value: '50%', label: '50%' },
              ]}
              value={formState.metrics.leeSolo || ''}
              onChange={(e) => setFormState({...formState, metrics: {...formState.metrics, leeSolo: e.target.value}})}
            />
          </div>
        </div>
      );
    }

    if (program === 'Pre-lectura') {
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-surface-50 rounded-xl border border-border-soft">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Sesión / Semana</label>
            <Input 
              placeholder="Ej. Sesión 2" 
              value={formState.metrics.sesion || ''}
              onChange={(e) => setFormState({...formState, metrics: {...formState.metrics, sesion: e.target.value}})}
            />
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Seguimiento Pedagógico</h1>
          <p className="text-text-secondary mt-1">Captura de resultados y métricas por sesión según el programa.</p>
        </div>
        <div className="flex gap-3 w-full sm:w-auto">
          <div className="flex bg-surface-muted p-1 rounded-lg">
            <button
              onClick={() => setViewMode('daily')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === 'daily' ? 'bg-surface shadow-sm text-text-primary' : 'text-text-muted hover:text-text-primary'}`}
            >
              Vista del Día
            </button>
            <button
              onClick={() => setViewMode('student')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === 'student' ? 'bg-surface shadow-sm text-text-primary' : 'text-text-muted hover:text-text-primary'}`}
            >
              Ficha del Alumno
            </button>
          </div>
          <Button onClick={() => handleOpenModal()} className="flex-1 sm:flex-none">
            Registrar Sesión
          </Button>
        </div>
      </div>

      <div className="bg-surface border border-border-soft rounded-xl overflow-hidden flex flex-col">
        <div className="p-4 border-b border-border-soft flex flex-col sm:flex-row gap-4 justify-between items-center bg-surface-muted/30">
          <div className="relative w-full sm:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
            <input
              type="text"
              placeholder="Buscar alumno por nombre o programa..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-10 bg-surface border border-border-soft rounded-xl pl-10 pr-4 text-sm focus:outline-none focus:border-primary-accent focus:ring-1 focus:ring-primary-accent/10 transition-all font-medium"
            />
          </div>
          <div className="flex gap-3 w-full sm:w-auto">
            <Button variant="secondary" className="flex-1 sm:flex-none h-10 px-4 rounded-xl border-border-soft">
              <Filter size={18} className="mr-2" />
              Filtros Avanzados
            </Button>
          </div>
        </div>

        {viewMode === 'daily' ? (
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border-soft bg-surface-muted/50 sticky top-0 z-10">
                  <th className="py-3 px-6 text-[10px] font-bold text-text-muted uppercase tracking-widest">Alumno</th>
                  <th className="py-3 px-6 text-[10px] font-bold text-text-muted uppercase tracking-widest">Programa Inscrito</th>
                  <th className="py-3 px-6 text-[10px] font-bold text-text-muted uppercase tracking-widest">Estado Actual</th>
                  <th className="py-3 px-6 text-[10px] font-bold text-text-muted uppercase tracking-widest text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-soft">
                {paginatedStudents.map((student) => (
                  <tr key={student.id} className="hover:bg-surface-muted/50 transition-colors group">
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-primary-accent/5 flex items-center justify-center text-primary-accent border border-primary-accent/10 font-bold">
                          {student.name.charAt(0)}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-text-primary tracking-tight">{student.name}</p>
                          <p className="text-[10px] text-text-muted font-medium uppercase tracking-tighter">ID: {student.id.slice(0, 8)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="text-sm text-text-primary font-medium tracking-tight">{student.program}</div>
                    </td>
                    <td className="py-4 px-6">
                      <Badge variant="success">{student.status}</Badge>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <Button variant="secondary" size="sm" onClick={() => handleOpenModal(student)} className="h-8 rounded-lg font-bold text-[10px] uppercase tracking-wider border-border-soft">
                        Registrar Sesión
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-6 flex-1 overflow-y-auto">
            {/* ... rest of existing student view ... */}
            {!selectedStudent ? (
              <div className="flex flex-col items-center justify-center py-12 text-text-muted">
                <User size={48} className="mb-4 opacity-20" />
                <p>Selecciona un alumno para ver su historial</p>
              </div>
            ) : (
              <>
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-text-primary mb-4">Historial de {selectedStudent?.name}</h3>
                  <div className="flex gap-4 mb-6">
                    <Badge variant="info">{selectedStudent?.program}</Badge>
                  </div>
                </div>
                
                <div className="space-y-4">
                  {trackings.filter(t => t.studentId === selectedStudent?.id).map((record) => (
                    <div key={record.id} className="p-4 border border-border-soft rounded-xl bg-surface-50">
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-3">
                          <CalendarIcon size={18} className="text-text-muted" />
                          <span className="font-medium text-text-primary">{record.date}</span>
                          <Badge variant={getStatusBadge(record.status) as any}>{record.status}</Badge>
                        </div>
                      </div>
                      
                      {record.metrics && record.status === 'Asistió' && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-3 p-3 bg-surface rounded-lg border border-border-soft">
                          {Object.entries(record.metrics).map(([key, value]) => (
                            <div key={key}>
                              <p className="text-xs text-text-secondary capitalize">{key}</p>
                              <p className="font-medium text-text-primary">{String(value)}</p>
                            </div>
                          ))}
                        </div>
                      )}
                      
                      <div>
                        <p className="text-sm text-text-secondary">{record.observations}</p>
                      </div>
                    </div>
                  ))}
                  {trackings.filter(t => t.studentId === selectedStudent?.id).length === 0 && (
                    <div className="text-center py-8 text-text-muted">
                      No hay registros de seguimiento para este alumno.
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Registrar Sesión de Seguimiento Pedagógico"
        size="4xl"
        footer={
          <div className="flex justify-end gap-3 w-full py-2">
            <Button variant="ghost" onClick={() => setIsModalOpen(false)}>Descartar Registro</Button>
            <Button variant="primary" onClick={handleSave} disabled={!selectedStudent} className="px-6">Guardar Resultados de Sesión</Button>
          </div>
        }
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pb-4">
          {/* Left Column */}
          <div className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-border-soft">
                <User size={16} className="text-primary-accent" />
                <h3 className="text-xs font-bold text-text-primary uppercase tracking-widest">Identificación del Alumno</h3>
              </div>
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Alumno</label>
                  <Select
                    options={[{value: '', label: 'Seleccionar alumno activo...'}, ...students.map(s => ({ value: s.id, label: `${s.name} - ${s.program}` }))]}
                    value={selectedStudent?.id || ''}
                    onChange={(e) => {
                      const student = students.find(s => s.id === e.target.value);
                      setSelectedStudent(student);
                    }}
                  />
                </div>
                
                {selectedStudent && (
                  <div className="bg-surface-muted/50 p-4 rounded-xl border border-border-soft flex gap-6">
                    <div>
                      <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest mb-1.5">Programa Matrícula</p>
                      <p className="text-sm font-bold text-text-primary tracking-tight">{selectedStudent.program}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest mb-1.5">Protocolo Aplicado</p>
                      <Badge variant="info" className="mt-0.5 font-bold uppercase tracking-tighter">{selectedStudent.program}</Badge>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-5">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Fecha de Sesión</label>
                    <input 
                      type="date" 
                      className="w-full h-10 bg-surface border border-border-soft rounded-xl px-3 text-sm focus:outline-none focus:border-primary-accent transition-all font-medium"
                      value={formState.fechaAsistencia}
                      onChange={(e) => setFormState({...formState, fechaAsistencia: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Presencia / Status</label>
                    <Select
                      options={[
                        { value: 'Asistió', label: 'Asistió' },
                        { value: 'Faltó', label: 'Faltó' },
                        { value: 'No reservó', label: 'No reservó' },
                      ]}
                      value={formState.estadoAsistencia}
                      onChange={(e) => setFormState({...formState, estadoAsistencia: e.target.value})}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            {selectedStudent && formState.estadoAsistencia === 'Asistió' && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-border-soft">
                  <Activity size={16} className="text-primary-accent" />
                  <h3 className="text-xs font-bold text-text-primary uppercase tracking-widest">Rendimiento y Métricas</h3>
                </div>
                {renderMetricsForm()}
              </div>
            )}

            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-border-soft">
                <FileText size={16} className="text-primary-accent" />
                <h3 className="text-xs font-bold text-text-primary uppercase tracking-widest">Informe Pedagógico</h3>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Observaciones y Recomendaciones</label>
                <textarea
                  className="w-full bg-surface border border-border-soft rounded-xl p-3 text-sm focus:outline-none focus:border-primary-accent resize-none h-32 transition-all focus:ring-1 focus:ring-primary-accent/10 font-medium"
                  placeholder="Describa el progreso del alumno, dificultades detectadas y compromisos para la siguiente sesión..."
                  value={formState.observaciones}
                  onChange={(e) => setFormState({...formState, observaciones: e.target.value})}
                ></textarea>
              </div>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
