import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Calendar as CalendarIcon, Trash2 } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { useData } from '../../context/DataContext';
import { isStudentWorkable } from '../../utils/validity';
import {
  allActivities,
  branchOfStudent,
  canChangeWithNotice,
  longDayLabel,
  noticeMessage,
  rangeLabel,
  seatsLeft,
  todayLocalISO,
  validateActivityEnrollment,
  withEnrollment,
  withoutEnrollment,
} from '../../utils/schedule';
import { labelCls, nativeFieldCls } from './formStyles';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Actividad con la que se abre (`cronograma:actividad`). */
  activityId?: string;
  /** Limita la lista a una sede; vacío = todas. */
  branchId?: string;
}

const capText = (capacity: number | null, enrolled: number) => (capacity === null ? `${enrolled} inscritos · sin límite` : `${enrolled} de ${capacity} inscritos`);

/** Actividades especiales de los cronogramas mensuales: ver y administrar los alumnos inscritos. */
export function ActivityEnrollModal({ isOpen, onClose, activityId, branchId }: Props) {
  const { monthlySchedules, updateMonthlySchedule, students, enrollments, schedules, programs } = useData();
  const today = todayLocalISO();
  const [selectedId, setSelectedId] = useState<string>('');
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);

  const activities = useMemo(
    () => allActivities(monthlySchedules)
      .filter(a => (!branchId || a.branchId === branchId) && (showPast || a.date >= today))
      .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)),
    [monthlySchedules, branchId, showPast, today]
  );

  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    setError(null);
    setShowPast(false);
    setSelectedId(activityId ?? '');
  }, [isOpen, activityId]);

  const selected = activities.find(a => a.id === selectedId) ?? allActivities(monthlySchedules).find(a => a.id === selectedId) ?? activities[0];

  const matches = selected && query.trim().length >= 2
    ? students
        .filter(s => isStudentWorkable(s, { enrollments, programs, schedules }, today) && !selected.enrolled.includes(s.id) &&
          `${s.name} ${s.doc}`.toLowerCase().includes(query.trim().toLowerCase()))
        .slice(0, 6)
    : [];

  const patchActivity = (fn: (a: ReturnType<typeof withEnrollment>) => ReturnType<typeof withEnrollment>) => {
    if (!selected) return;
    const monthly = monthlySchedules.find(m => m.id === selected.monthlyId);
    if (!monthly) return;
    updateMonthlySchedule(monthly.id, { actividades: monthly.actividades.map(a => (a.id === selected.activityId ? fn(a) : a)) });
  };

  const enroll = (studentId: string) => {
    if (!selected) return;
    const student = students.find(s => s.id === studentId);
    if (!student) return;
    const problem = validateActivityEnrollment({
      activity: selected, studentId, studentName: student.name, studentBranchId: branchOfStudent(student, enrollments), schedules,
    });
    if (problem) { setError(problem); return; }
    setError(null);
    patchActivity(a => withEnrollment(a, studentId));
    setQuery('');
  };

  const nameOf = (id: string) => students.find(s => s.id === id)?.name ?? id;
  // Regla de 24 horas: la inscripción solo se quita con anticipación
  const canRemove = !!selected && canChangeWithNotice(selected.date, selected.start, new Date());

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Actividades especiales"
      size="5xl"
      footer={<div className="flex justify-end w-full"><Button variant="ghost" onClick={onClose}>Cerrar</Button></div>}
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pb-4">
        {/* Lista de actividades */}
        <div className="lg:col-span-5 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-border-soft">
            <h3 className="text-base font-semibold text-text-primary">Fechas del cronograma</h3>
            <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer select-none">
              <input type="checkbox" checked={showPast} onChange={e => setShowPast(e.target.checked)} className="w-3.5 h-3.5 rounded border-border-soft" />
              Incluir pasadas
            </label>
          </div>
          {activities.length === 0 ? (
            <div className="text-center py-10 text-text-muted border-2 border-dashed border-border-soft rounded-xl">
              <CalendarIcon size={28} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">No hay actividades próximas{branchId ? ' en esta sede' : ''}.</p>
              <p className="text-xs mt-1">Se crean en Cronogramas mensuales.</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
              {activities.map(a => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => { setSelectedId(a.id); setError(null); setQuery(''); }}
                  className={`w-full text-left p-3 border rounded-xl transition-colors ${
                    selected?.id === a.id ? 'border-primary-accent bg-active-tint/50' : 'border-border-soft hover:bg-surface-muted'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-text-primary">{a.name}</p>
                    <Badge variant={seatsLeft(a) === 0 ? 'danger' : 'info'}>{capText(a.capacity, a.enrolled.length)}</Badge>
                  </div>
                  <p className="text-xs text-text-secondary mt-0.5">{longDayLabel(a.date)} · {rangeLabel(a.start, a.end)}</p>
                  {!branchId && <p className="text-xs text-text-muted">{a.sede}</p>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Inscritos */}
        <div className="lg:col-span-7 space-y-4">
          {!selected ? (
            <p className="text-sm text-text-muted pt-10 text-center">Elija una actividad para ver sus inscritos.</p>
          ) : (
            <>
              <div className="pb-2 border-b border-border-soft">
                <h3 className="text-base font-semibold text-text-primary">{selected.name}</h3>
                <p className="text-sm text-text-secondary mt-0.5">
                  {selected.sede} · {longDayLabel(selected.date)} · {rangeLabel(selected.start, selected.end)}
                  {selected.responsible ? ` · ${selected.responsible}` : ''}
                </p>
                <p className="text-xs text-text-muted mt-1">
                  Durante la actividad, esos horarios de asesoría quedan bloqueados en {selected.sede}.
                  {selected.date >= today && !canRemove && ' Ya no se pueden quitar inscripciones (faltan menos de 24 horas).'}
                </p>
              </div>

              {error && (
                <div className="bg-danger-tint border border-danger-text/20 rounded-xl p-3 flex gap-2 text-sm text-danger-text">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <p>{error}</p>
                </div>
              )}

              {selected.date >= today ? (
                <div>
                  <label className={labelCls}>Inscribir alumno</label>
                  <input
                    type="text"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Buscar alumno activo por nombre o documento (mínimo 2 caracteres)..."
                    className={nativeFieldCls}
                  />
                  {matches.length > 0 && (
                    <div className="mt-1.5 border border-border-soft rounded-xl overflow-hidden bg-surface">
                      {matches.map(s => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => enroll(s.id)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-surface-muted border-b border-border-soft last:border-0"
                        >
                          <span className="font-medium text-text-primary">{s.name}</span>
                          <span className="text-text-muted"> · {s.doc} · {s.program}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {query.trim().length >= 2 && matches.length === 0 && <p className="text-xs text-text-muted mt-1">No hay alumnos activos que coincidan.</p>}
                </div>
              ) : (
                <p className="text-sm text-text-muted">La actividad ya pasó; solo se puede consultar.</p>
              )}

              <div className="space-y-2">
                <p className="text-sm font-medium text-text-secondary">Inscritos · {capText(selected.capacity, selected.enrolled.length)}</p>
                {selected.enrolled.length === 0 ? (
                  <p className="text-sm text-text-muted py-4 text-center border border-dashed border-border-soft rounded-xl">Aún no hay alumnos inscritos.</p>
                ) : (
                  selected.enrolled.map(id => (
                    <div key={id} className="flex items-center justify-between gap-3 px-3 py-2 border border-border-soft rounded-xl">
                      <span className="text-sm text-text-primary">{nameOf(id)}</span>
                      {selected.date >= today && (
                        <button
                          type="button"
                          disabled={!canRemove}
                          onClick={() => patchActivity(a => withoutEnrollment(a, id))}
                          className="p-1.5 text-text-muted hover:text-danger-text hover:bg-danger-tint rounded-lg transition-colors disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-text-muted disabled:cursor-not-allowed"
                          title={canRemove ? 'Quitar inscripción' : noticeMessage(selected.date, selected.start)}
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
