import React, { useMemo, useState } from 'react';
import { Search, Calendar as CalendarIcon, Download, Plus, Trash2, GripVertical, AlertCircle } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Input } from '../../components/ui/Input';
import { inputCls, labelCls, nativeFieldCls, textareaCls } from './formStyles';
import { Select } from '../../components/ui/Select';
import { ActionMenu } from '../../components/ui/ActionMenu';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Modal } from '../../components/ui/Modal';
import { useData, type MonthlySchedule, type ScheduleActivity } from '../../context/DataContext';
import {
  MAX_ACTIVITY_HOURS,
  MONTHS,
  affectedSchedules,
  rangeLabel,
  rangeToSlots,
  slotsForDate,
  slotsToRange,
  todayLocalISO,
  toggleActivitySlot,
  validateActivity,
} from '../../utils/schedule';
import { CapacityInput } from './CapacityInput';
import { ActivityEnrollModal } from './ActivityEnrollModal';
import { ActivityDatePicker } from './ActivityDatePicker';

interface FormState {
  branchId: string;
  mes: string;
  anio: number;
  titulo: string;
  observaciones: string;
  actividades: ScheduleActivity[];
}

const newActivity = (order: number): ScheduleActivity => ({
  id: `new-${Date.now()}-${order}`, actividad: '', fecha: '', horaInicio: '', horaFin: '', responsable: '', orden: order, cupo: null, inscritos: [],
});

const autoTitle = (mes: string, anio: number) => `Cronograma de Actividades - ${mes} ${anio}`;

const slotText = (t: string) => `${Number(t.split(':')[0]) % 12 || 12}:00 ${Number(t.split(':')[0]) >= 12 ? 'p. m.' : 'a. m.'}`;

const seats = (a: ScheduleActivity) => (a.cupo === null ? `${a.inscritos.length} inscritos` : `${a.inscritos.length}/${a.cupo} inscritos`);

/**
 * Cronogramas mensuales por sede. Las actividades (con fecha, hora de inicio y fin, y cupo) se ven en el calendario de
 * Programación, bloquean los horarios de asesoría de su sede y admiten inscripción de alumnos.
 */
export function MonthlySchedules() {
  const { monthlySchedules, branches, schedules, addMonthlySchedule, updateMonthlySchedule, deleteMonthlySchedule } = useData();
  const today = todayLocalISO();
  const activeBranches = branches.filter(b => b.status === 'Activo');
  const [searchTerm, setSearchTerm] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState<MonthlySchedule | null>(null);
  const [toDelete, setToDelete] = useState<MonthlySchedule | null>(null);
  const [enroll, setEnroll] = useState<{ open: boolean; activityId?: string; branchId?: string }>({ open: false });
  const [error, setError] = useState<string | null>(null);

  const [formState, setFormState] = useState<FormState>({
    branchId: '', mes: MONTHS[Number(today.split('-')[1]) - 1], anio: Number(today.split('-')[0]), titulo: '', observaciones: '', actividades: [],
  });

  const years = useMemo(
    () => [...new Set([Number(today.split('-')[0]), ...monthlySchedules.map(m => m.anio)])].sort(),
    [monthlySchedules, today]
  );

  const filtered = monthlySchedules.filter(m =>
    (!branchFilter || m.branchId === branchFilter) &&
    (!monthFilter || m.mes === monthFilter) &&
    (!yearFilter || String(m.anio) === yearFilter) &&
    (m.titulo.toLowerCase().includes(searchTerm.toLowerCase()) || m.sede.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleOpenDrawer = (schedule?: MonthlySchedule) => {
    setError(null);
    if (schedule) {
      setSelectedSchedule(schedule);
      setFormState({
        branchId: schedule.branchId, mes: schedule.mes, anio: schedule.anio, titulo: schedule.titulo,
        observaciones: schedule.observaciones, actividades: schedule.actividades.map(a => ({ ...a })),
      });
    } else {
      const mes = MONTHS[Number(today.split('-')[1]) - 1];
      const anio = Number(today.split('-')[0]);
      setSelectedSchedule(null);
      setFormState({ branchId: branchFilter || activeBranches[0]?.id || '', mes, anio, titulo: autoTitle(mes, anio), observaciones: '', actividades: [] });
    }
    setIsDrawerOpen(true);
  };

  const set = (patch: Partial<FormState>) => { setError(null); setFormState(f => ({ ...f, ...patch })); };

  const handleAddActivity = () => set({ actividades: [...formState.actividades, newActivity(formState.actividades.length + 1)] });
  const handleRemoveActivity = (id: string) => set({ actividades: formState.actividades.filter(a => a.id !== id) });
  const handleActivityChange = (id: string, patch: Partial<ScheduleActivity>) =>
    set({ actividades: formState.actividades.map(a => (a.id === id ? { ...a, ...patch } : a)) });

  const handleSave = () => {
    if (!formState.branchId) { setError('Seleccione la sede.'); return; }
    if (!formState.titulo.trim()) { setError('Indique el título del cuadro.'); return; }
    if (!Number.isInteger(formState.anio) || formState.anio < 2000) { setError('Indique un año válido.'); return; }
    const duplicate = monthlySchedules.find(m => m.id !== selectedSchedule?.id && m.branchId === formState.branchId && m.mes === formState.mes && m.anio === formState.anio);
    if (duplicate) { setError(`Ya existe un cronograma de ${duplicate.sede} para ${formState.mes} ${formState.anio}. Edítelo en lugar de crear otro.`); return; }
    const period = { mes: formState.mes, anio: formState.anio };
    for (const a of formState.actividades) {
      const problem = validateActivity(a, period);
      if (problem) { setError(problem); return; }
      if (a.cupo !== null && a.cupo < a.inscritos.length) { setError(`${a.actividad.trim()}: el cupo (${a.cupo}) es menor que los inscritos (${a.inscritos.length}).`); return; }
    }
    const data = {
      branchId: formState.branchId,
      sede: branches.find(b => b.id === formState.branchId)?.name ?? '',
      mes: formState.mes,
      anio: formState.anio,
      titulo: formState.titulo.trim(),
      observaciones: formState.observaciones.trim(),
      actividades: formState.actividades.map((a, i) => ({ ...a, actividad: a.actividad.trim(), responsable: '', orden: i + 1 })),
    };
    if (selectedSchedule) updateMonthlySchedule(selectedSchedule.id, data);
    else addMonthlySchedule(data);
    setIsDrawerOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Cronogramas Mensuales</h1>
          <p className="text-text-secondary mt-1">Actividades especiales por sede. Bloquean los horarios de asesoría de su fecha y admiten inscripción de alumnos.</p>
        </div>
        <div className="flex gap-3 w-full sm:w-auto">
          <Button variant="outline" className="flex-1 sm:flex-none">
            <Download size={20} className="mr-2" />
            Exportar Todos
          </Button>
          <Button onClick={() => handleOpenDrawer()} className="flex-1 sm:flex-none">
            <Plus size={20} className="mr-2" />
            Nuevo Cronograma
          </Button>
        </div>
      </div>

      <div className="bg-surface border border-border-soft rounded-xl overflow-hidden flex flex-col">
        <div className="p-4 border-b border-border-soft flex flex-col lg:flex-row gap-4 justify-between items-center bg-surface-50">
          <div className="relative w-full lg:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={20} />
            <Input
              placeholder="Buscar por título o sede..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 w-full"
            />
          </div>
          <div className="flex flex-wrap gap-3 w-full lg:w-auto">
            <select className={`${nativeFieldCls} lg:w-44`} value={branchFilter} onChange={e => setBranchFilter(e.target.value)} aria-label="Filtrar por sede">
              <option value="">Todas las sedes</option>
              {activeBranches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <select className={`${nativeFieldCls} lg:w-40`} value={monthFilter} onChange={e => setMonthFilter(e.target.value)} aria-label="Filtrar por mes">
              <option value="">Todos los meses</option>
              {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <select className={`${nativeFieldCls} lg:w-32`} value={yearFilter} onChange={e => setYearFilter(e.target.value)} aria-label="Filtrar por año">
              <option value="">Todos los años</option>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6">
          {filtered.length === 0 && <p className="col-span-full text-center text-sm text-text-muted py-10">No hay cronogramas para los filtros elegidos.</p>}
          {filtered.map((schedule) => (
            <div key={schedule.id} className="bg-surface border border-border-soft rounded-xl overflow-hidden hover:shadow-md transition-shadow flex flex-col">
              <div className="p-4 border-b border-border-soft bg-surface-50 flex justify-between items-start">
                <div>
                  <h3 className="font-semibold text-text-primary line-clamp-1" title={schedule.titulo}>{schedule.titulo}</h3>
                  <div className="flex items-center gap-2 mt-1 text-sm text-text-secondary">
                    <CalendarIcon size={14} />
                    <span>{schedule.mes} {schedule.anio}</span>
                    <span className="text-border-soft">•</span>
                    <span>{schedule.sede}</span>
                  </div>
                </div>
                <ActionMenu
                  items={[
                    { label: 'Editar cronograma', onClick: () => handleOpenDrawer(schedule) },
                    { label: 'Exportar a PDF', onClick: () => {} },
                    { label: 'Exportar a Imagen', onClick: () => {} },
                    { label: 'Eliminar', onClick: () => setToDelete(schedule), danger: true },
                  ]}
                />
              </div>
              <div className="p-4 flex-1">
                <p className="text-sm font-medium text-text-secondary mb-3">Actividades ({schedule.actividades.length})</p>
                <div className="space-y-3">
                  {schedule.actividades.length === 0 && <p className="text-sm text-text-muted">Aún no hay actividades.</p>}
                  {schedule.actividades.slice(0, 3).map((act) => (
                    <div key={act.id} className="flex gap-3 text-sm">
                      <div className="w-12 shrink-0 text-text-muted font-medium">{act.fecha.split('-')[2]}/{act.fecha.split('-')[1]}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-text-primary font-medium line-clamp-1">{act.actividad}</p>
                        <p className="text-text-secondary text-xs">{rangeLabel(act.horaInicio, act.horaFin)}</p>
                        <p className="text-text-muted text-xs">{seats(act)}</p>
                      </div>
                      {act.fecha >= today && (
                        <button
                          type="button"
                          onClick={() => setEnroll({ open: true, activityId: `${schedule.id}:${act.id}`, branchId: schedule.branchId })}
                          className="self-start text-xs font-medium text-primary-accent hover:bg-active-tint rounded-lg px-2 py-1 shrink-0"
                        >
                          Inscribir
                        </button>
                      )}
                    </div>
                  ))}
                  {schedule.actividades.length > 3 && (
                    <p className="text-xs text-text-muted text-center pt-2 border-t border-border-soft">
                      + {schedule.actividades.length - 3} actividades más
                    </p>
                  )}
                </div>
              </div>
              <div className="p-3 border-t border-border-soft bg-surface-muted/30">
                <Button variant="outline" className="w-full" onClick={() => handleOpenDrawer(schedule)}>
                  Ver Detalle Completo
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <ActivityEnrollModal
        isOpen={enroll.open}
        onClose={() => setEnroll({ open: false })}
        activityId={enroll.activityId}
        branchId={enroll.branchId}
      />

      <ConfirmDialog
        isOpen={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() => { if (toDelete) deleteMonthlySchedule(toDelete.id); setToDelete(null); }}
        title="Eliminar cronograma"
        description={toDelete ? `¿Eliminar «${toDelete.titulo}» (${toDelete.sede}, ${toDelete.mes} ${toDelete.anio})? Sus actividades e inscripciones se perderán y los horarios bloqueados quedarán libres.` : ''}
        variant="danger"
        confirmLabel="SÍ, ELIMINAR"
      />

      <Modal
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        title={selectedSchedule ? "Editar Cronograma" : "Nuevo Cronograma"}
        size="5xl"
        footer={
          <div className="flex justify-between w-full">
            <Button variant="outline">
              <Download size={20} className="mr-2" />
              Previsualizar PDF
            </Button>
            <div className="flex gap-3">
              <Button variant="ghost" onClick={() => setIsDrawerOpen(false)}>Cancelar</Button>
              <Button variant="primary" onClick={handleSave}>Guardar Cronograma</Button>
            </div>
          </div>
        }
      >
        <div className="space-y-6 pb-4">
          {error && (
            <div className="bg-danger-tint border border-danger-text/20 rounded-xl p-3 flex gap-2 text-sm text-danger-text">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <p>{error}</p>
            </div>
          )}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left Column */}
            <div className="lg:col-span-4 space-y-6">
              <div className="space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-border-soft">
                  <h3 className="text-base font-semibold text-text-primary">Cabecera del Cronograma</h3>
                </div>
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className={labelCls}>Sede</label>
                    <select className={nativeFieldCls} value={formState.branchId} onChange={e => set({ branchId: e.target.value })}>
                      {activeBranches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={labelCls}>Mes</label>
                      <select className={nativeFieldCls} value={formState.mes} onChange={e => set({ mes: e.target.value, ...(formState.titulo === autoTitle(formState.mes, formState.anio) ? { titulo: autoTitle(e.target.value, formState.anio) } : {}) })}>
                        {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>Año</label>
                      <Input className={inputCls}
                        type="number"
                        value={formState.anio}
                        onChange={(e) => {
                          const anio = parseInt(e.target.value);
                          set({ anio, ...(formState.titulo === autoTitle(formState.mes, formState.anio) && anio ? { titulo: autoTitle(formState.mes, anio) } : {}) });
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <label className={labelCls}>Título del Cuadro</label>
                    <Input className={inputCls}
                      value={formState.titulo}
                      onChange={(e) => set({ titulo: e.target.value })}
                      placeholder="Ej. Cronograma de Actividades"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t border-border-soft">
                <div className="flex items-center gap-2 pb-2 border-b border-border-soft">
                  <h3 className="text-base font-semibold text-text-primary">Observaciones (Internas)</h3>
                </div>
                <div>
                  <textarea
                    className={`${textareaCls} h-32`}
                    placeholder="Notas internas..."
                    value={formState.observaciones}
                    onChange={(e) => set({ observaciones: e.target.value })}
                  ></textarea>
                </div>
              </div>
            </div>

            {/* Right Column */}
            <div className="lg:col-span-8 space-y-6">
              <div className="space-y-4">
                <div className="flex justify-between items-center border-b border-border-soft pb-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold text-text-primary">Actividades</h3>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleAddActivity}>
                    <Plus size={16} className="mr-2" /> Agregar
                  </Button>
                </div>
                <p className="text-sm text-text-secondary">Cada actividad ocupa hasta {MAX_ACTIVITY_HOURS} horas consecutivas y bloquea los horarios de asesoría de la sede. El responsable se define después, desde una sesión de Psicopedagogía.</p>

                <div className="space-y-3 max-h-[500px] overflow-y-auto custom-scrollbar pr-2">
                  {formState.actividades.length === 0 ? (
                    <div className="text-center py-12 text-text-muted border-2 border-dashed border-border-soft rounded-xl bg-surface-50">
                      <CalendarIcon size={32} className="mx-auto mb-3 opacity-20" />
                      <p className="font-medium text-text-primary">No hay actividades</p>
                      <p className="text-sm mt-1">Haz clic en Agregar para comenzar</p>
                    </div>
                  ) : (
                    formState.actividades.map((act) => {
                      const chosen = rangeToSlots(act.fecha, act.horaInicio, act.horaFin);
                      const hits = act.fecha && act.horaInicio && act.horaFin && act.horaFin > act.horaInicio
                        ? affectedSchedules(schedules, formState.branchId, act)
                        : [];
                      return (
                        <div key={act.id} className="flex gap-3 items-start p-3 bg-surface-50 border border-border-soft rounded-xl group hover:border-border-strong transition-colors">
                          <div className="mt-2 cursor-move text-text-muted hover:text-text-primary transition-colors">
                            <GripVertical size={20} />
                          </div>
                          <div className="flex-1 min-w-0 space-y-3">
                            <div>
                              <label className={labelCls}>Nombre</label>
                              <Input className={inputCls}
                                value={act.actividad}
                                onChange={(e) => handleActivityChange(act.id, { actividad: e.target.value })}
                                placeholder="Nombre de la actividad"
                              />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div>
                                <label className={labelCls}>Fecha</label>
                                <ActivityDatePicker
                                  value={act.fecha}
                                  mes={formState.mes}
                                  anio={formState.anio}
                                  minDate={today}
                                  onChange={(fecha) => {
                                    // Al cambiar de día, se conservan las horas solo si ese día también las tiene
                                    const keep = rangeToSlots(fecha, act.horaInicio, act.horaFin).length > 0;
                                    handleActivityChange(act.id, { fecha, ...(keep ? {} : { horaInicio: '', horaFin: '' }) });
                                  }}
                                />
                              </div>
                              <div>
                                <label className={labelCls}>Cupo de inscripción</label>
                                <CapacityInput value={act.cupo} onChange={(v) => handleActivityChange(act.id, { cupo: v })} />
                              </div>
                            </div>
                            <div>
                              <label className={labelCls}>Horas de la actividad</label>
                              {!act.fecha ? (
                                <p className="text-sm text-text-muted border border-dashed border-border-soft rounded-xl px-3 py-2.5">Elija primero la fecha para ver las horas disponibles.</p>
                              ) : (
                                <>
                                  <div className="flex flex-wrap gap-2">
                                    {slotsForDate(act.fecha).map(t => {
                                      const on = chosen.includes(t);
                                      return (
                                        <button
                                          key={t}
                                          type="button"
                                          aria-pressed={on}
                                          onClick={() => {
                                            const range = slotsToRange(toggleActivitySlot(act.fecha, chosen, t));
                                            handleActivityChange(act.id, { horaInicio: range?.horaInicio ?? '', horaFin: range?.horaFin ?? '' });
                                          }}
                                          className={`h-9 px-3 rounded-lg border text-sm font-medium transition-colors ${
                                            on
                                              ? 'bg-primary-accent border-primary-accent text-white shadow-sm'
                                              : 'bg-surface border-border-soft text-text-primary hover:bg-active-tint'
                                          }`}
                                        >
                                          {slotText(t)}
                                        </button>
                                      );
                                    })}
                                  </div>
                                  <p className="text-xs text-text-muted mt-1.5">
                                    {chosen.length > 0
                                      ? `${rangeLabel(act.horaInicio, act.horaFin)} · ${chosen.length} ${chosen.length === 1 ? 'hora' : 'horas'}`
                                      : `Elija hasta ${MAX_ACTIVITY_HOURS} horas consecutivas.`}
                                  </p>
                                </>
                              )}
                            </div>
                            {act.inscritos.length > 0 && (
                              <p className="text-xs text-text-muted">{act.inscritos.length} {act.inscritos.length === 1 ? 'alumno inscrito' : 'alumnos inscritos'}.</p>
                            )}
                            {hits.length > 0 && (
                              <p className="text-xs text-warning-text bg-warning-tint rounded-lg px-3 py-2">
                                {hits.length} {hits.length === 1 ? 'asesoría ya reservada queda' : 'asesorías ya reservadas quedan'} dentro de este horario ({hits.map(h => `${h.student} ${h.time}`).join(', ')}). Reprográmelas desde Programación.
                              </p>
                            )}
                          </div>
                          <button
                            onClick={() => handleRemoveActivity(act.id)}
                            className="mt-6 p-2 text-text-muted hover:text-danger hover:bg-danger-tint rounded-lg transition-colors"
                            title="Eliminar actividad"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
