import React, { useState, useEffect } from 'react';
import { Plus, Search, Filter, Calendar as CalendarIcon, List, MoreVertical, Clock, User, MapPin, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { ActionMenu } from '../../components/ui/ActionMenu';
import { Modal } from '../../components/ui/Modal';
import { Select } from '../../components/ui/Select';
import { useData } from '../../context/DataContext';
import { useTablePagination } from '../../hooks/useTablePagination';

export function Schedule() {
  const { schedules } = useData();
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('list');
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState<any>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = useTablePagination();

  const filteredSchedules = schedules.filter(s => 
    s.student.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.responsible.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.program.toLowerCase().includes(searchTerm.toLowerCase())
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const totalPages = Math.ceil(filteredSchedules.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedSchedules = filteredSchedules.slice(startIndex, endIndex);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Confirmado': return 'success';
      case 'Reservado': return 'info';
      case 'Reprogramado': return 'warning';
      case 'Cancelado': return 'danger';
      case 'No reservó': return 'neutral';
      default: return 'neutral';
    }
  };

  const handleOpenModal = (schedule?: any) => {
    setSelectedSchedule(schedule || null);
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Programación</h1>
          <p className="text-text-secondary mt-1">Gestiona la agenda semanal de asesorías por alumno y sede.</p>
        </div>
        <div className="flex gap-3 w-full sm:w-auto">
          <div className="flex bg-surface-muted p-1 rounded-lg">
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-md transition-colors ${viewMode === 'list' ? 'bg-surface shadow-sm text-text-primary' : 'text-text-muted hover:text-text-primary'}`}
            >
              <List size={20} />
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={`p-2 rounded-md transition-colors ${viewMode === 'calendar' ? 'bg-surface shadow-sm text-text-primary' : 'text-text-muted hover:text-text-primary'}`}
            >
              <CalendarIcon size={20} />
            </button>
          </div>
          <Button onClick={() => handleOpenModal()} className="flex-1 sm:flex-none">
            <Plus size={20} className="mr-2" />
            Nueva Reserva
          </Button>
        </div>
      </div>

      <div className="bg-surface border border-border-soft rounded-xl overflow-hidden flex flex-col">
        <div className="p-4 border-b border-border-soft flex flex-col sm:flex-row gap-4 justify-between items-center bg-surface-muted/30">
          <div className="relative w-full sm:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
            <input
              type="text"
              placeholder="Buscar por alumno o responsable..."
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

        {viewMode === 'list' ? (
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border-soft bg-surface-muted/50 sticky top-0 z-10">
                  <th className="py-3 px-6 text-[10px] font-bold text-text-muted uppercase tracking-widest">Fecha y Hora</th>
                  <th className="py-3 px-6 text-[10px] font-bold text-text-muted uppercase tracking-widest">Alumno</th>
                  <th className="py-3 px-6 text-[10px] font-bold text-text-muted uppercase tracking-widest">Programa</th>
                  <th className="py-3 px-6 text-[10px] font-bold text-text-muted uppercase tracking-widest">Tipo</th>
                  <th className="py-3 px-6 text-[10px] font-bold text-text-muted uppercase tracking-widest">Responsable</th>
                  <th className="py-3 px-6 text-[10px] font-bold text-text-muted uppercase tracking-widest">Estado</th>
                  <th className="py-3 px-6 text-[10px] font-bold text-text-muted uppercase tracking-widest text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-soft">
                {paginatedSchedules.map((schedule) => (
                  <tr key={schedule.id} className="hover:bg-surface-muted/50 transition-colors group">
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-primary-accent/5 flex flex-col items-center justify-center border border-primary-accent/10">
                          <span className="text-[10px] font-bold text-primary-accent uppercase tracking-tighter leading-none">{schedule.date.split('/')[1]}</span>
                          <span className="text-sm font-bold text-text-primary tracking-tighter">{schedule.date.split('/')[0]}</span>
                        </div>
                        <div>
                          <p className="text-sm font-bold text-text-primary leading-tight">{schedule.time}</p>
                          <p className="text-[10px] text-text-muted font-medium">{schedule.duration} min</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="text-sm font-bold text-text-primary tracking-tight">{schedule.student}</div>
                      <div className="text-xs text-text-secondary mt-0.5">{schedule.modality}</div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="text-sm text-text-primary font-medium">{schedule.program}</div>
                      <div className="text-[10px] text-text-muted uppercase tracking-wider mt-0.5">{schedule.level}</div>
                    </td>
                    <td className="py-4 px-6">
                      <span className="text-xs font-semibold text-text-secondary bg-surface-muted px-2 py-0.5 rounded uppercase tracking-tighter">{schedule.type}</span>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-surface-muted flex items-center justify-center text-text-muted">
                           <User size={12} />
                        </div>
                        <span className="text-sm text-text-secondary font-medium tracking-tight">{schedule.responsible}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <Badge variant={getStatusBadge(schedule.status) as any}>{schedule.status}</Badge>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <ActionMenu
                        items={[
                          { label: 'Editar reserva', onClick: () => handleOpenModal(schedule) },
                          { label: 'Reprogramar', onClick: () => {} },
                          { label: 'Cancelar reserva', onClick: () => {}, danger: true },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center text-text-muted bg-surface-muted/10 flex-1 flex flex-col items-center justify-center">
            <div className="w-16 h-16 bg-surface-muted rounded-full flex items-center justify-center mb-4">
              <CalendarIcon size={32} className="opacity-40" />
            </div>
            <h3 className="text-lg font-bold text-text-primary mb-1">Vista de Calendario</h3>
            <p className="text-sm text-text-secondary">Estamos trabajando para integrar la agenda interactiva aquí.</p>
          </div>
        )}

        {/* Pagination */}
        <div className="p-4 border-t border-border-soft flex items-center justify-between bg-surface">
          <span className="text-xs font-medium text-text-muted uppercase tracking-wider">
            Mostrando {filteredSchedules.length > 0 ? startIndex + 1 : 0} a {Math.min(endIndex, filteredSchedules.length)} de {filteredSchedules.length} reservas
          </span>
          <div className="flex items-center gap-2">
            <Button 
              variant="secondary" 
              size="sm"
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="h-8 px-3 rounded-lg border-border-soft"
            >
              <ChevronLeft size={16} className="mr-1" /> Anterior
            </Button>
            
            <div className="flex items-center gap-1 mx-2">
              {Array.from({ length: Math.min(5, totalPages) }).map((_, i) => {
                const pageNum = i + 1;
                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${
                      currentPage === pageNum 
                        ? 'bg-primary-accent text-white shadow-lg shadow-primary-accent/20 scale-105' 
                        : 'text-text-secondary hover:bg-surface-muted'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
              {totalPages > 5 && <span className="text-text-muted px-1">...</span>}
            </div>

            <Button 
              variant="secondary" 
              size="sm"
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages || totalPages === 0}
              className="h-8 px-3 rounded-lg border-border-soft"
            >
              Siguiente <ChevronRight size={16} className="ml-1" />
            </Button>
          </div>
        </div>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={selectedSchedule ? "Editar Reserva" : "Nueva Reserva de Asesoría"}
        size="4xl"
        footer={
          <div className="flex justify-end gap-3 w-full py-2">
            <Button variant="ghost" onClick={() => setIsModalOpen(false)}>Descartar Cambios</Button>
            <Button variant="primary" onClick={() => setIsModalOpen(false)} className="px-6">Guardar y Confirmar Reserva</Button>
          </div>
        }
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pb-4">
          {/* Left Column */}
          <div className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-border-soft">
                <div className="w-1 h-4 bg-primary-accent rounded-full" />
                <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider">Datos del Alumno</h3>
              </div>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-1.5">Alumno</label>
                  <Select
                    options={[
                      { value: '', label: 'Buscar alumno activo...' },
                      { value: '1', label: 'Ana García' },
                      { value: '2', label: 'Carlos López' },
                      { value: '3', label: 'Sofía Martínez' },
                    ]}
                    value={selectedSchedule?.student || ''}
                    onChange={() => {}}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-1.5">Programa</label>
                    <Input value={selectedSchedule?.program || ''} disabled placeholder="Autocompletado" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-1.5">Nivel</label>
                    <Input value={selectedSchedule?.level || ''} disabled placeholder="Autocompletado" />
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-border-soft">
                <div className="w-1 h-4 bg-primary-accent rounded-full" />
                <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider">Detalles Básicos</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-1.5">Tipo de cita</label>
                  <Select
                    options={[
                      { value: 'primera', label: 'Primera asesoría' },
                      { value: 'seguimiento', label: 'Seguimiento' },
                      { value: 'reprogramacion', label: 'Reprogramación' },
                    ]}
                    value={selectedSchedule?.type || ''}
                    onChange={() => {}}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-1.5">Canal / Modalidad</label>
                  <Select
                    options={[
                      { value: 'presencial', label: 'Presencial' },
                      { value: 'virtual', label: 'Virtual' },
                    ]}
                    value={selectedSchedule?.modality || 'presencial'}
                    onChange={() => {}}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-border-soft">
                <div className="w-1 h-4 bg-primary-accent rounded-full" />
                <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider">Programación</h3>
              </div>
              
              <div className="grid grid-cols-1 gap-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-1.5">Fecha</label>
                    <Input type="date" value={selectedSchedule?.date || ''} onChange={() => {}} />
                  </div>
                  <div className="col-span-2 sm:col-span-1 grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-1.5">Hora</label>
                      <Input type="time" value={selectedSchedule?.time || ''} onChange={() => {}} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-1.5">Dur. (min)</label>
                      <Input type="number" value={selectedSchedule?.duration || 45} onChange={() => {}} />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-1.5">Responsable</label>
                  <Select
                    options={[
                      { value: '1', label: 'Lic. María Torres' },
                      { value: '2', label: 'Lic. Juan Pérez' },
                    ]}
                    value={selectedSchedule?.responsible || ''}
                    onChange={() => {}}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-1.5">Estado de reserva</label>
                  <Select
                    options={[
                      { value: 'reservado', label: 'Reservado' },
                      { value: 'confirmado', label: 'Confirmado' },
                      { value: 'reprogramado', label: 'Reprogramado' },
                      { value: 'cancelado', label: 'Cancelado' },
                      { value: 'no_reservo', label: 'No reservó' },
                    ]}
                    value={selectedSchedule?.status || 'reservado'}
                    onChange={() => {}}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-1.5">Observaciones</label>
                  <textarea
                    className="w-full bg-surface border border-border-soft rounded-lg p-3 text-sm focus:outline-none focus:border-primary-accent resize-none h-24 transition-all focus:ring-2 focus:ring-primary-accent/10"
                    rows={3}
                    placeholder="Notas de agenda..."
                  ></textarea>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
