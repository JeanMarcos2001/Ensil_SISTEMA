import React, { useState, useEffect } from 'react';
import { Plus, Search, Filter, Calendar as CalendarIcon, List, User, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { ActionMenu } from '../../components/ui/ActionMenu';
import { Modal } from '../../components/ui/Modal';
import { useData, type Schedule as ScheduleItem } from '../../context/DataContext';
import { useTablePagination } from '../../hooks/useTablePagination';
import { MONTHS, addDaysISO, endTime, longDayLabel, statusTone, todayLocalISO } from '../../utils/schedule';
import { ScheduleCalendar, type CalendarMode } from './ScheduleCalendar';
import { ScheduleFormModal } from './ScheduleFormModal';

export function Schedule() {
  const { schedules } = useData();
  const today = todayLocalISO();
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('list');
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState<ScheduleItem | null>(null);
  const [defaultDate, setDefaultDate] = useState<string | undefined>(undefined);

  // Calendario
  const [calendarMode, setCalendarMode] = useState<CalendarMode>('month');
  const [cursor, setCursor] = useState(today);
  const [dayDetail, setDayDetail] = useState<string | null>(null);

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

  const getStatusBadge = statusTone;

  const handleOpenModal = (schedule?: ScheduleItem | null, date?: string) => {
    setSelectedSchedule(schedule || null);
    setDefaultDate(date);
    setIsModalOpen(true);
  };

  // Navegación del calendario (mes o semana según la vista)
  const navigateCalendar = (dir: -1 | 0 | 1) => {
    if (dir === 0) { setCursor(today); return; }
    if (calendarMode === 'week') { setCursor(addDaysISO(cursor, dir * 7)); return; }
    const [y, m] = cursor.split('-').map(Number);
    const next = new Date(Date.UTC(y, m - 1 + dir, 1));
    setCursor(`${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-01`);
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
                          <span className="text-[10px] font-bold text-primary-accent uppercase tracking-tighter leading-none">{MONTHS[Number(schedule.date.split('-')[1]) - 1]?.slice(0, 3)}</span>
                          <span className="text-sm font-bold text-text-primary tracking-tighter">{Number(schedule.date.split('-')[2])}</span>
                        </div>
                        <div>
                          <p className="text-sm font-bold text-text-primary leading-tight">{schedule.time} – {endTime(schedule.time, schedule.duration)}</p>
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
          <ScheduleCalendar
            schedules={filteredSchedules}
            mode={calendarMode}
            onModeChange={setCalendarMode}
            cursor={cursor}
            onNavigate={navigateCalendar}
            today={today}
            onCreate={(date) => handleOpenModal(null, date)}
            onEdit={(sch) => handleOpenModal(sch)}
            onShowDay={setDayDetail}
          />
        )}

        {/* Pagination */}
        {viewMode === 'list' && (
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
        )}
      </div>

      <ScheduleFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        schedule={selectedSchedule}
        defaultDate={defaultDate}
      />

      {/* Citas de un día (desde «+N más» del calendario) */}
      <Modal
        isOpen={!!dayDetail}
        onClose={() => setDayDetail(null)}
        title={dayDetail ? `Citas del ${longDayLabel(dayDetail)}` : ''}
        size="md"
        footer={
          <div className="flex justify-end gap-3 w-full">
            <Button variant="ghost" onClick={() => setDayDetail(null)}>Cerrar</Button>
            {dayDetail && dayDetail >= today && (
              <Button variant="primary" onClick={() => { const d = dayDetail; setDayDetail(null); handleOpenModal(null, d); }}>
                Nueva reserva
              </Button>
            )}
          </div>
        }
      >
        <div className="space-y-3 pb-2">
          {dayDetail && filteredSchedules
            .filter(sch => sch.date === dayDetail)
            .sort((a, b) => a.time.localeCompare(b.time))
            .map(sch => (
              <button
                key={sch.id}
                type="button"
                onClick={() => { setDayDetail(null); handleOpenModal(sch); }}
                className="w-full text-left p-3 border border-border-soft rounded-xl hover:bg-surface-muted transition-colors flex items-start justify-between gap-3"
              >
                <div>
                  <p className="text-sm font-semibold text-text-primary">{sch.time} – {endTime(sch.time, sch.duration)} · {sch.student}</p>
                  <p className="text-xs text-text-secondary mt-0.5">{sch.program} · {sch.level} · {sch.type} · {sch.modality}</p>
                  <p className="text-xs text-text-muted">{sch.responsible}</p>
                </div>
                <Badge variant={getStatusBadge(sch.status) as any}>{sch.status}</Badge>
              </button>
            ))}
        </div>
      </Modal>
    </div>
  );
}
