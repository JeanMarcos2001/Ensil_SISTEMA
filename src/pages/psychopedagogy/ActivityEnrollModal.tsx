import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Calendar as CalendarIcon, Trash2 } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { ReasonDialog } from '../../components/ui/ReasonDialog';
import { useData } from '../../context/DataContext';
import { PERM } from '../../utils/authority';
import { isStudentWorkable } from '../../utils/validity';
import { activityState, attendanceBlock, attendanceSummary, canRemoveEnrollment, hasResponsible, isStaffNamed, responsibleOptions, staffLabel } from '../../utils/psyActivities';
import { reasonsFor } from '../../utils/psyHistory';
import {
  allActivities,
  canChangeWithNotice,
  longDayLabel,
  noticeMessage,
  rangeLabel,
  seatsLeft,
  studentProgramLabel,
  todayLocalISO,
  validateActivityEnrollment,
} from '../../utils/schedule';
import { branchOfStudent } from '../../utils/schedule';
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
  const {
    monthlySchedules, students, enrollments, schedules, programs, staff, assignments, branches, can,
    setActivityResponsible, enrollInActivity, unenrollFromActivity, markActivityAttendance,
  } = useData();
  const today = todayLocalISO();
  const [selectedId, setSelectedId] = useState<string>('');
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);
  // Quitar una inscripción pide confirmación (id del alumno a quitar)
  const [toRemove, setToRemove] = useState<string | null>(null);
  // Quitar la marca de asistencia también pide explicación
  const [toUnmark, setToUnmark] = useState<string | null>(null);

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
    setToRemove(null);
    setSelectedId(activityId ?? '');
  }, [isOpen, activityId]);

  const selected = activities.find(a => a.id === selectedId) ?? allActivities(monthlySchedules).find(a => a.id === selectedId) ?? activities[0];

  const matches = selected && query.trim().length >= 2
    ? students
        .filter(s => isStudentWorkable(s, { enrollments, programs, schedules }, today) && !selected.enrolled.includes(s.id) &&
          `${s.name} ${s.doc}`.toLowerCase().includes(query.trim().toLowerCase()))
        .slice(0, 6)
    : [];

  const enroll = (studentId: string) => {
    if (!selected) return;
    const res = enrollInActivity(selected.id, studentId);
    if (!res.ok) { setError(res.error ?? 'No se pudo inscribir.'); return; }
    setError(null);
    setQuery('');
  };

  const nameOf = (id: string) => students.find(s => s.id === id)?.name ?? id;
  // Regla de 24 horas: la inscripción solo se quita con anticipación (la institución puede hacerlo antes, con permiso)
  const mayLate = can(PERM.psiInstitutionalChange);
  const canRemove = !!selected && (canChangeWithNotice(selected.date, selected.start, new Date()) || mayLate);

  const mayAssign = can(PERM.psiActivityLead);
  const mayMark = can(PERM.psiActivityAttendance);
  const options = selected
    ? responsibleOptions(selected, { schedules, activities: allActivities(monthlySchedules), staff, assignments, branches })
    : [];
  const legacyLead = selected && !selected.responsibleId && selected.responsible.trim() ? staff.find(s => isStaffNamed(s, selected.responsible)) : undefined;
  const leadValue = selected?.responsibleId ?? legacyLead?.id ?? '';
  const locked = !!selected && Object.keys(selected.attendance).length > 0;
  const summary = selected ? attendanceSummary(selected) : null;
  const attendanceReason = selected ? attendanceBlock(selected, today) : null;

  const changeLead = (staffId: string) => {
    if (!selected) return;
    const res = setActivityResponsible(selected.id, staffId || null);
    setError(res.ok ? null : res.error ?? 'No se pudo asignar.');
  };
  const mark = (studentId: string, status: 'Asistió' | 'Faltó') => {
    if (!selected) return;
    const res = markActivityAttendance(selected.id, studentId, status);
    setError(res.ok ? null : res.error ?? 'No se pudo registrar.');
  };
  const markAll = () => {
    if (!selected) return;
    selected.enrolled.filter(id => !selected.attendance[id]).forEach(id => markActivityAttendance(selected.id, id, 'Asistió'));
    setError(null);
  };

  return (
    <>
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
                  <p className={`text-xs mt-0.5 ${hasResponsible(a) ? 'text-text-muted' : 'text-warning-text font-medium'}`}>{hasResponsible(a) ? `Responsable: ${a.responsible || 'asignado'}` : 'Sin responsable'}</p>
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
                  <Badge variant={activityState(selected, today) === 'Realizada' ? 'neutral' : activityState(selected, today) === 'Hoy' ? 'success' : 'info'} className="ml-2">{activityState(selected, today)}</Badge>
                </p>
                <p className="text-xs text-text-muted mt-1">
                  Durante la actividad, esos horarios de asesoría quedan bloqueados en {selected.sede}.
                  {selected.date >= today && !canRemove && ' Ya no se pueden quitar inscripciones (faltan menos de 24 horas).'}
                </p>
              </div>

              {/* Responsable: quien firma la asistencia */}
              <div>
                <label className={labelCls}>Responsable de la actividad</label>
                <select
                  className={nativeFieldCls}
                  value={leadValue}
                  disabled={!mayAssign || locked}
                  onChange={e => changeLead(e.target.value)}
                >
                  <option value="">{selected.responsible && !leadValue ? `${selected.responsible} (sin ficha de personal)` : 'Sin responsable'}</option>
                  {options.map(o => (
                    <option key={o.staff.id} value={o.staff.id} disabled={o.conflicts.length > 0 && o.staff.id !== leadValue}>
                      {staffLabel(o.staff)} — {o.sameBranch ? selected.sede : `${o.branchNames.join(', ')} (otra sede)`}{o.conflicts.length > 0 ? ' · tiene un cruce' : ''}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-text-muted mt-1">
                  {locked
                    ? 'Ya hay asistencia registrada: el responsable no se cambia.'
                    : !mayAssign ? 'Su rol no puede asignar el responsable.'
                    : 'Personal activo de Psicopedagogía sin otra actividad ni asesoría a esa hora. Sin responsable no se registra la asistencia.'}
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
                          <span className="text-text-muted"> · {s.doc} · {studentProgramLabel(s, enrollments)}</span>
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
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-text-secondary">Inscritos · {capText(selected.capacity, selected.enrolled.length)}</p>
                  {summary && summary.enrolled > 0 && (
                    <p className="text-xs text-text-muted">
                      Asistieron {summary.present} · Faltaron {summary.absent} · Sin marcar {summary.pending}{summary.rate !== null ? ` · ${summary.rate} % de asistencia` : ''}
                    </p>
                  )}
                </div>
                {selected.enrolled.length > 0 && attendanceReason && (
                  <p className="text-xs text-text-muted bg-surface-muted rounded-lg px-3 py-2">{attendanceReason}</p>
                )}
                {selected.enrolled.length > 0 && !attendanceReason && mayMark && summary && summary.pending > 0 && (
                  <button type="button" onClick={markAll} className="text-xs font-medium text-primary-accent hover:underline">Marcar a todos los pendientes como «Asistió»</button>
                )}
                {selected.enrolled.length === 0 ? (
                  <p className="text-sm text-text-muted py-4 text-center border border-dashed border-border-soft rounded-xl">Aún no hay alumnos inscritos.</p>
                ) : (
                  selected.enrolled.map(id => {
                    const mark_ = selected.attendance[id];
                    return (
                      <div key={id} className="flex items-center justify-between gap-3 px-3 py-2 border border-border-soft rounded-xl">
                        <div>
                          <span className="text-sm text-text-primary">{nameOf(id)}</span>
                          {mark_?.note && <p className="text-xs text-text-muted">{mark_.note}</p>}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {!attendanceReason && mayMark && (
                            <>
                              <button type="button" onClick={() => mark(id, 'Asistió')} className={`h-7 px-2.5 rounded-lg border text-xs font-medium transition-colors ${mark_?.status === 'Asistió' ? 'bg-success-tint border-success-text/30 text-success-text' : 'border-border-soft text-text-secondary hover:bg-surface-muted'}`}>Asistió</button>
                              <button type="button" onClick={() => mark(id, 'Faltó')} className={`h-7 px-2.5 rounded-lg border text-xs font-medium transition-colors ${mark_?.status === 'Faltó' ? 'bg-danger-tint border-danger-text/30 text-danger-text' : 'border-border-soft text-text-secondary hover:bg-surface-muted'}`}>Faltó</button>
                              {mark_ && <button type="button" onClick={() => setToUnmark(id)} className="text-xs text-text-muted hover:underline">Quitar</button>}
                            </>
                          )}
                          {(attendanceReason || !mayMark) && mark_ && <Badge variant={mark_.status === 'Asistió' ? 'success' : 'danger'}>{mark_.status}</Badge>}
                          {selected.date >= today && (
                            <button
                              type="button"
                              disabled={!canRemove || !canRemoveEnrollment(selected, id)}
                              onClick={() => setToRemove(id)}
                              className="p-1.5 text-text-muted hover:text-danger-text hover:bg-danger-tint rounded-lg transition-colors disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-text-muted disabled:cursor-not-allowed"
                              title={!canRemoveEnrollment(selected, id) ? 'Ya tiene asistencia registrada' : canRemove ? 'Quitar inscripción' : noticeMessage(selected.date, selected.start)}
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </Modal>

    <ReasonDialog
      isOpen={!!toRemove}
      onClose={() => setToRemove(null)}
      title="Quitar inscripción"
      reasons={reasonsFor('cancelar').map(r => r.reason)}
      detailOptional
      detailLabel="Detalle"
      confirmLabel="Quitar inscripción"
      danger
      onSubmit={({ reason, detail }) => {
        if (!toRemove || !selected) return null;
        const res = unenrollFromActivity(selected.id, toRemove, { reason, detail });
        return res.ok ? null : res.error ?? 'No se pudo quitar la inscripción.';
      }}
    >
      {toRemove && selected && (
        <p className="text-sm text-text-secondary">
          ¿Quitar a <strong>{nameOf(toRemove)}</strong> de «{selected.name}» ({longDayLabel(selected.date)})? Dejará de contar en el cupo y, para volver a inscribirlo, habrá que hacerlo de nuevo. Queda en el historial.
        </p>
      )}
    </ReasonDialog>

    <ReasonDialog
      isOpen={!!toUnmark}
      onClose={() => setToUnmark(null)}
      title="Quitar la marca de asistencia"
      detailLabel="¿Por qué se quita la marca?"
      detailPlaceholder="Por ejemplo: se marcó al alumno equivocado."
      confirmLabel="Quitar marca"
      danger
      onSubmit={({ detail }) => {
        if (!toUnmark || !selected) return null;
        const res = markActivityAttendance(selected.id, toUnmark, null, detail);
        return res.ok ? null : res.error ?? 'No se pudo quitar la marca.';
      }}
    >
      {toUnmark && <p className="text-sm text-text-secondary">Se quitará la marca de <strong>{nameOf(toUnmark)}</strong>. Queda en el historial.</p>}
    </ReasonDialog>
    </>
  );
}
