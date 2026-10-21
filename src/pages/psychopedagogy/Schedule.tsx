import React, { useMemo, useState, useEffect } from 'react';
import { Plus, Search, Calendar as CalendarIcon, List, User, ChevronLeft, ChevronRight, CalendarDays, Gauge, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { ActionMenu } from '../../components/ui/ActionMenu';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { useData, type Schedule as ScheduleItem } from '../../context/DataContext';
import { useTablePagination } from '../../hooks/useTablePagination';
import { isStudentWorkable } from '../../utils/validity';
import {
  MONTHS,
  STATUS_OPTIONS,
  addDaysISO,
  allActivities,
  availableActions,
  changeBlockedByNotice,
  endTime,
  longDayLabel,
  nextOpenDay,
  statusTone,
  studentsWithoutSession,
  todayLocalISO,
  weekOf,
  type ScheduleAction,
} from '../../utils/schedule';
import { ScheduleCalendar, type CalendarMode } from './ScheduleCalendar';
import { ScheduleFormModal } from './ScheduleFormModal';
import { DayAgendaModal, ACTION_LABEL } from './DayAgendaModal';
import { SessionModal } from './SessionModal';
import { CapacityModal } from './CapacityModal';
import { ActivityEnrollModal } from './ActivityEnrollModal';
import { nativeFieldCls } from './formStyles';

export function Schedule() {
  const { schedules, updateSchedule, branches, trackings, students, enrollments, programs, monthlySchedules, capacityConfig } = useData();
  const today = todayLocalISO();
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('list');
  const [searchTerm, setSearchTerm] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Ventanas
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState<ScheduleItem | null>(null);
  const [defaultDate, setDefaultDate] = useState<string | undefined>(undefined);
  const [defaultStudentId, setDefaultStudentId] = useState<string | undefined>(undefined);
  const [toCancel, setToCancel] = useState<ScheduleItem | null>(null);
  const [sessionOf, setSessionOf] = useState<ScheduleItem | null>(null);
  const [capacityOpen, setCapacityOpen] = useState(false);
  const [activities, setActivities] = useState<{ open: boolean; activityId?: string }>({ open: false });
  const [pendingOpen, setPendingOpen] = useState(true);

  // Calendario
  const [calendarMode, setCalendarMode] = useState<CalendarMode>('month');
  const [cursor, setCursor] = useState(today);
  const [dayDetail, setDayDetail] = useState<string | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = useTablePagination();

  const branchName = (id?: string) => branches.find(b => b.id === id)?.name ?? '—';
  const activeBranches = branches.filter(b => b.status === 'Activo');
  const term = searchTerm.toLowerCase();

  // Primero lo que viene (de hoy en adelante), luego lo pasado (lo más reciente primero)
  const filteredSchedules = useMemo(() => {
    const list = schedules.filter(s =>
      (!branchFilter || s.branchId === branchFilter) &&
      (!statusFilter || s.status === statusFilter) &&
      (s.student.toLowerCase().includes(term) || s.responsible.toLowerCase().includes(term) || s.program.toLowerCase().includes(term))
    );
    const key = (s: ScheduleItem) => s.date + s.time;
    const upcoming = list.filter(s => s.date >= today).sort((a, b) => key(a).localeCompare(key(b)));
    const past = list.filter(s => s.date < today).sort((a, b) => key(b).localeCompare(key(a)));
    return [...upcoming, ...past];
  }, [schedules, branchFilter, statusFilter, term, today]);

  const flatActivities = useMemo(
    () => allActivities(monthlySchedules).filter(a => !branchFilter || a.branchId === branchFilter),
    [monthlySchedules, branchFilter]
  );

  // Cada alumno debe asistir al menos una vez por semana (lunes a sábado)
  const week = useMemo(() => weekOf(nextOpenDay(today)).slice(0, 6), [today]);
  const withoutSession = useMemo(
    // Solo alumnos con matrícula vigente: al terminar la duración base sin extensión dejan de aparecer
    () => studentsWithoutSession(
      { students: students.filter(s => isStudentWorkable(s, { enrollments, programs, schedules }, today)), schedules, enrollments },
      week, branchFilter || undefined
    ),
    [students, schedules, enrollments, programs, week, branchFilter, today]
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, branchFilter, statusFilter]);

  const totalPages = Math.ceil(filteredSchedules.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedSchedules = filteredSchedules.slice(startIndex, endIndex);

  const openForm = (schedule?: ScheduleItem | null, date?: string, studentId?: string) => {
    setSelectedSchedule(schedule || null);
    setDefaultDate(date);
    setDefaultStudentId(studentId);
    setIsModalOpen(true);
  };

  // Acciones sobre una asesoría (Reservado y Reprogramado son automáticos)
  const runAction = (action: ScheduleAction, s: ScheduleItem) => {
    setDayDetail(null);
    if (action === 'reprogramar') openForm(s);
    else if (action === 'asistio') updateSchedule(s.id, { status: 'Asistió' });
    else if (action === 'sesion') setSessionOf(s);
    else if (action === 'falta') updateSchedule(s.id, { status: 'Faltó' });
    else if (action === 'cancelar') setToCancel(s);
  };

  const rowActions = (s: ScheduleItem) => {
    const now = new Date();
    const items = availableActions(s, today, now).map(a => ({
      label: a === 'sesion' && trackings.some(t => t.scheduleId === s.id) ? 'Ver sesión' : ACTION_LABEL[a],
      onClick: () => runAction(a, s),
      danger: a === 'falta' || a === 'cancelar',
      disabled: false,
    }));
    // Regla de 24 horas: se muestran, pero no se pueden usar
    if (changeBlockedByNotice(s, now)) {
      items.push(
        { label: 'Reprogramar (requiere 24 h de anticipación)', onClick: () => {}, danger: false, disabled: true },
        { label: 'Cancelar (requiere 24 h de anticipación)', onClick: () => {}, danger: true, disabled: true },
      );
    }
    return items;
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
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Programación</h1>
          <p className="text-text-secondary mt-1">Agenda semanal de asesorías por sede: reserva, asistencia y registro de la sesión.</p>
        </div>
        <div className="flex flex-wrap gap-3 w-full lg:w-auto">
          <div className="flex bg-surface-muted p-1 rounded-lg">
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-md transition-colors ${viewMode === 'list' ? 'bg-surface shadow-sm text-text-primary' : 'text-text-muted hover:text-text-primary'}`}
              aria-label="Ver lista"
            >
              <List size={20} />
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={`p-2 rounded-md transition-colors ${viewMode === 'calendar' ? 'bg-surface shadow-sm text-text-primary' : 'text-text-muted hover:text-text-primary'}`}
              aria-label="Ver calendario"
            >
              <CalendarIcon size={20} />
            </button>
          </div>
          <Button variant="secondary" onClick={() => setActivities({ open: true })} className="flex-1 sm:flex-none">
            <CalendarDays size={18} className="mr-2" />
            Actividades especiales
          </Button>
          <Button variant="secondary" onClick={() => setCapacityOpen(true)} className="flex-1 sm:flex-none">
            <Gauge size={18} className="mr-2" />
            Cupos
          </Button>
          <Button onClick={() => openForm()} className="flex-1 sm:flex-none">
            <Plus size={20} className="mr-2" />
            Reservar Asesoría
          </Button>
        </div>
      </div>

      {/* Frecuencia: al menos una asesoría por semana */}
      {withoutSession.length > 0 && (
        <div className="bg-warning-tint/60 border border-warning-text/20 rounded-xl">
          <button
            type="button"
            onClick={() => setPendingOpen(o => !o)}
            className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
          >
            <span className="text-sm font-semibold text-text-primary">
              Sin asesoría esta semana ({longDayLabel(week[0])} al {longDayLabel(week[5])}): {withoutSession.length} {withoutSession.length === 1 ? 'alumno' : 'alumnos'}
            </span>
            {pendingOpen ? <ChevronUp size={18} className="text-text-secondary" /> : <ChevronDown size={18} className="text-text-secondary" />}
          </button>
          {pendingOpen && (
            <div className="px-4 pb-4 flex flex-wrap gap-2">
              {withoutSession.slice(0, 12).map(({ student, branchId }) => (
                <span key={student.id} className="inline-flex items-center gap-2 bg-surface border border-border-soft rounded-xl pl-3 pr-1.5 py-1 text-sm">
                  <span className="text-text-primary font-medium">{student.name}</span>
                  <span className="text-xs text-text-muted">{student.program}{!branchFilter ? ` · ${branchName(branchId)}` : ''}</span>
                  <button
                    type="button"
                    onClick={() => openForm(null, nextOpenDay(today), student.id)}
                    className="text-xs font-medium text-primary-accent hover:bg-active-tint rounded-lg px-2 py-1"
                  >
                    Reservar
                  </button>
                </span>
              ))}
              {withoutSession.length > 12 && <span className="text-xs text-text-muted self-center">y {withoutSession.length - 12} más</span>}
            </div>
          )}
        </div>
      )}

      <div className="bg-surface border border-border-soft rounded-xl overflow-hidden flex flex-col">
        <div className="p-4 border-b border-border-soft flex flex-col lg:flex-row gap-3 justify-between items-center bg-surface-muted/30">
          <div className="relative w-full lg:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
            <input
              type="text"
              placeholder="Buscar por alumno o responsable..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-10 bg-surface border border-border-soft rounded-xl pl-10 pr-4 text-sm focus:outline-none focus:border-primary-accent focus:ring-1 focus:ring-primary-accent/10 transition-all font-medium"
            />
          </div>
          <div className="flex gap-3 w-full lg:w-auto">
            <select className={`${nativeFieldCls} lg:w-48`} value={branchFilter} onChange={e => setBranchFilter(e.target.value)} aria-label="Filtrar por sede">
              <option value="">Todas las sedes</option>
              {activeBranches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            {viewMode === 'list' && (
              <select className={`${nativeFieldCls} lg:w-44`} value={statusFilter} onChange={e => setStatusFilter(e.target.value)} aria-label="Filtrar por estado">
                <option value="">Todos los estados</option>
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
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
                  <th className="py-3 px-6 text-[10px] font-bold text-text-muted uppercase tracking-widest">Responsable</th>
                  <th className="py-3 px-6 text-[10px] font-bold text-text-muted uppercase tracking-widest">Estado</th>
                  <th className="py-3 px-6 text-[10px] font-bold text-text-muted uppercase tracking-widest text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-soft">
                {paginatedSchedules.length === 0 && (
                  <tr><td colSpan={6} className="py-10 text-center text-sm text-text-muted">No hay asesorías para los filtros elegidos.</td></tr>
                )}
                {paginatedSchedules.map((schedule) => {
                  const hasSession = trackings.some(t => t.scheduleId === schedule.id);
                  return (
                    <tr key={schedule.id} className="hover:bg-surface-muted/50 transition-colors group">
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-primary-accent/5 flex flex-col items-center justify-center border border-primary-accent/10">
                            <span className="text-[10px] font-bold text-primary-accent uppercase tracking-tighter leading-none">{MONTHS[Number(schedule.date.split('-')[1]) - 1]?.slice(0, 3)}</span>
                            <span className="text-sm font-bold text-text-primary tracking-tighter">{Number(schedule.date.split('-')[2])}</span>
                          </div>
                          <div>
                            <p className="text-sm font-bold text-text-primary leading-tight">{schedule.time} – {endTime(schedule.time, schedule.duration)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <div className="text-sm font-bold text-text-primary tracking-tight">{schedule.student}</div>
                        <div className="text-xs text-text-muted mt-0.5">
                          {schedule.isFirst && <span className="text-primary-accent font-medium">Primera asesoría · </span>}
                          {branchName(schedule.branchId)}
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <div className="text-sm text-text-primary font-medium">{schedule.program}</div>
                        <div className="text-[10px] text-text-muted uppercase tracking-wider mt-0.5">{schedule.level}</div>
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
                        <Badge variant={statusTone(schedule.status) as any}>{schedule.status}</Badge>
                        {schedule.status === 'Asistió' && (
                          <div className={`text-xs mt-1 ${hasSession ? 'text-text-muted' : 'text-warning-text font-medium'}`}>
                            {hasSession ? 'Sesión registrada' : 'Falta registrar la sesión'}
                          </div>
                        )}
                      </td>
                      <td className="py-4 px-6 text-right">
                        <ActionMenu items={rowActions(schedule)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <ScheduleCalendar
            schedules={filteredSchedules}
            activities={flatActivities}
            capacity={capacityConfig}
            branchId={branchFilter}
            mode={calendarMode}
            onModeChange={setCalendarMode}
            cursor={cursor}
            onNavigate={navigateCalendar}
            today={today}
            onCreate={(date) => openForm(null, date)}
            onShowDay={setDayDetail}
            onShowActivity={(id) => setActivities({ open: true, activityId: id })}
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
        defaultStudentId={defaultStudentId}
      />

      <SessionModal schedule={sessionOf} onClose={() => setSessionOf(null)} />

      <CapacityModal isOpen={capacityOpen} onClose={() => setCapacityOpen(false)} />

      <ActivityEnrollModal
        isOpen={activities.open}
        onClose={() => setActivities({ open: false })}
        activityId={activities.activityId}
        branchId={branchFilter}
      />

      <ConfirmDialog
        isOpen={!!toCancel}
        onClose={() => setToCancel(null)}
        onConfirm={() => { if (toCancel) updateSchedule(toCancel.id, { status: 'Cancelado' }); setToCancel(null); }}
        title="Cancelar asesoría"
        description={toCancel ? `¿Cancelar la asesoría de ${toCancel.student} del ${longDayLabel(toCancel.date)} a las ${toCancel.time}? El horario quedará libre.` : ''}
        variant="danger"
        confirmLabel="SÍ, CANCELAR"
      />

      {/* Agenda de un día (desde un horario o «+N más» del calendario) */}
      <DayAgendaModal
        date={dayDetail}
        today={today}
        schedules={filteredSchedules}
        activities={flatActivities}
        capacity={capacityConfig}
        branchId={branchFilter}
        branchName={branchName}
        trackings={trackings}
        onClose={() => setDayDetail(null)}
        onReserve={(d) => { setDayDetail(null); openForm(null, d); }}
        onAction={runAction}
        onShowActivity={(id) => { setDayDetail(null); setActivities({ open: true, activityId: id }); }}
      />
    </div>
  );
}
