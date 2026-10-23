import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { useData, type Schedule, type Student } from '../../context/DataContext';
import { getInterviewerOptions } from '../../utils/enrollment';
import { isStudentWorkable, studentExpiring, studentLimit } from '../../utils/validity';
import {
  SLOT_DURATION,
  allActivities,
  blockState,
  blockText,
  branchOfStudent,
  changeBlockedByNotice,
  findScheduleConflict,
  firstBlockText,
  firstSessionBlock,
  noticeMessage,
  latestEnrollment,
  longDayLabel,
  slotLabel,
  slotsForDate,
  studentProgramLabel,
  suggestedResponsible,
  todayLocalISO,
  validateReservation,
  validateSchedule,
  weekdayIndex,
} from '../../utils/schedule';
import { labelCls, nativeFieldCls, textareaCls } from './formStyles';
import { DateInput } from '../../components/ui/DateInput';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Asesoría a reprogramar; `null` para reservar una nueva. */
  schedule: Schedule | null;
  /** Fecha sugerida al reservar desde el calendario. */
  defaultDate?: string;
  /** Alumno con el que se abre al reservar (p. ej. desde «Sin asesoría esta semana»). */
  defaultStudentId?: string;
}

interface FormState {
  studentId: string;
  student: string;
  branchId: string;
  program: string;
  level: string;
  date: string;
  time: string;
  responsible: string;
  observations: string;
}

const emptyForm = (date: string): FormState => ({
  studentId: '', student: '', branchId: '', program: '', level: '', date, time: '', responsible: '', observations: '',
});

/** Programa y nivel vigentes del alumno según su matrícula más reciente. */
function programOf(student: Student, enrollments: ReturnType<typeof useData>['enrollments']) {
  const latest = latestEnrollment(student, enrollments);
  if (latest) return { program: latest.program, level: latest.level };
  const [program = '', level = ''] = (student.program || '').split(' - ');
  return { program, level };
}

export function ScheduleFormModal({ isOpen, onClose, schedule, defaultDate, defaultStudentId }: Props) {
  const { students, enrollments, programs, schedules, staff, assignments, branches, capacityConfig, monthlySchedules, addSchedule, updateSchedule } = useData();
  const today = todayLocalISO();
  const [form, setForm] = useState<FormState>(() => emptyForm(defaultDate || today));
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const isReschedule = !!schedule;

  const ctx = useMemo(
    () => ({ schedules, capacity: capacityConfig, activities: allActivities(monthlySchedules) }),
    [schedules, capacityConfig, monthlySchedules]
  );

  // Responsables: todo el personal activo asignado a Psicopedagogía
  const responsibles = useMemo(
    () => getInterviewerOptions({ staff, assignments, branches }, '').map(o => ({
      value: `${o.staff.names} ${o.staff.lastNameP}`.trim(),
      label: `${o.staff.names} ${o.staff.lastNameP} ${o.staff.lastNameM} — ${o.branchName}`.replace(/\s+/g, ' '),
    })),
    [staff, assignments, branches]
  );

  const fillStudent = (s: Student): Partial<FormState> => {
    const { program, level } = programOf(s, enrollments);
    return { studentId: s.id, student: s.name, branchId: branchOfStudent(s, enrollments) ?? '', program, level };
  };

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setQuery('');
    if (schedule) {
      const known = students.find(s => s.id === schedule.studentId) ?? students.find(s => s.name === schedule.student);
      setForm({
        studentId: known?.id ?? schedule.studentId ?? '', student: schedule.student,
        branchId: schedule.branchId ?? (known ? branchOfStudent(known, enrollments) ?? '' : ''),
        program: schedule.program, level: schedule.level,
        date: schedule.date, time: schedule.time, responsible: schedule.responsible, observations: schedule.observations ?? '',
      });
    } else {
      const preset = defaultStudentId ? students.find(s => s.id === defaultStudentId) : undefined;
      setForm({ ...emptyForm(defaultDate || today), ...(preset ? fillStudent(preset) : {}) });
    }
  }, [isOpen, schedule, defaultDate, defaultStudentId]);

  // Vigencia del programa (duración base + garantía desde la primera asesoría): solo aparecen alumnos con matrícula vigente
  const vigencia = useMemo(() => ({ enrollments, programs, schedules }), [enrollments, programs, schedules]);
  const picked = form.studentId ? students.find(s => s.id === form.studentId) : undefined;
  const limit = picked ? studentLimit(picked, vigencia, today) : undefined;
  const expiring = picked ? studentExpiring(picked, vigencia, today) : undefined;

  const set = (patch: Partial<FormState>) => { setError(null); setForm(f => ({ ...f, ...patch })); };

  const matches = query.trim().length >= 2
    ? students
        .filter(s => isStudentWorkable(s, vigencia, today) && `${s.name} ${s.doc}`.toLowerCase().includes(query.trim().toLowerCase()))
        .slice(0, 6)
    : [];

  const pickStudent = (s: Student) => {
    set({ ...fillStudent(s), time: '' });
    setQuery('');
  };

  const pickTime = (time: string) => {
    // Si el horario ya tiene un responsable, se propone el mismo (el salón lo atiende una persona)
    const proposed = !form.responsible && time ? suggestedResponsible(schedules, form.branchId, form.date, time) : '';
    set({ time, ...(proposed ? { responsible: proposed } : {}) });
  };

  const branchName = branches.find(b => b.id === form.branchId)?.name;

  // Horarios del día elegido (cada uno de 1 hora) con su cupo, y cuáles no admiten más alumnos
  const slots = form.date ? slotsForDate(form.date) : [];
  const closedDay = !!form.date && weekdayIndex(form.date) === 6;
  // Una primera asesoría solo puede ir a un horario vacío (o al de su mismo registro); una asesoría, a uno con cupo
  const isFirst = !!schedule?.isFirst;
  const optionOf = (time: string): { text: string; unavailable: boolean } => {
    if (isFirst) {
      const f = firstSessionBlock(ctx, form.branchId, form.date, time, schedule?.registrationId, schedule?.id);
      return { text: firstBlockText(f), unavailable: f.kind === 'taken' || f.kind === 'blocked' };
    }
    const b = blockState(ctx, form.branchId, form.date, time, schedule?.id);
    return { text: blockText(b), unavailable: b.kind === 'full' || b.kind === 'blocked' || b.kind === 'first' };
  };
  const chosen = form.time && form.branchId ? optionOf(form.time).text : undefined;

  const handleSave = () => {
    const slotChanged = !schedule || schedule.date !== form.date || schedule.time !== form.time;
    // Regla de 24 horas: una asesoría activa solo se reprograma con anticipación
    if (schedule && changeBlockedByNotice(schedule, new Date())) { setError(noticeMessage(schedule.date, schedule.time)); return; }
    // No se programan asesorías después del fin de la vigencia del alumno (la primera asesoría es la que la inicia)
    if (!isFirst && slotChanged && limit && form.date > limit) {
      setError(`La vigencia del alumno termina el ${longDayLabel(limit)}; no se puede programar una asesoría posterior.`);
      return;
    }
    const cand = { ...form, status: 'Reservado', isFirst, registrationId: schedule?.registrationId };
    // Si solo cambian observaciones o responsable, el horario (que ya ocupaba) no se vuelve a evaluar contra el cupo
    const problem = slotChanged
      ? validateReservation(ctx, { ...cand, checkPast: true }, today, schedule?.id)
      : validateSchedule({ ...cand, checkPast: false }, today) ?? (findScheduleConflict(schedules, cand, schedule?.id) ? 'El alumno ya tiene otra asesoría a esa hora.' : null);
    if (problem) { setError(problem); return; }

    const base = {
      student: form.student.trim(), studentId: form.studentId || undefined, branchId: form.branchId, program: form.program, level: form.level,
      date: form.date, time: form.time, duration: SLOT_DURATION, responsible: form.responsible.trim(),
      observations: form.observations.trim() || undefined,
    };
    if (schedule) {
      // Cambiar fecha, horario o responsable reprograma la asesoría (estado automático)
      const moved = slotChanged || schedule.responsible.trim() !== form.responsible.trim();
      updateSchedule(schedule.id, { ...base, status: moved ? 'Reprogramado' : schedule.status });
    } else {
      addSchedule({ ...base, status: 'Reservado' });
    }
    onClose();
  };

  const responsibleOptions = form.responsible && !responsibles.some(r => r.value === form.responsible)
    ? [{ value: form.responsible, label: form.responsible }, ...responsibles]
    : responsibles;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isReschedule ? 'Reprogramar Asesoría' : 'Reservar Asesoría'}
      size="4xl"
      footer={
        <div className="flex justify-end gap-3 w-full">
          <Button variant="ghost" onClick={onClose}>Descartar Cambios</Button>
          <Button variant="primary" onClick={handleSave}>{isReschedule ? 'Guardar Reprogramación' : 'Guardar y Confirmar Reserva'}</Button>
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Columna izquierda */}
          <div className="space-y-6">
            <div className="space-y-4">
              <div className="pb-2 border-b border-border-soft">
                <h3 className="text-base font-semibold text-text-primary">Datos del Alumno</h3>
              </div>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className={labelCls}>Alumno <span className="text-error">*</span></label>
                  {form.student ? (
                    <div className="flex items-center justify-between gap-3 bg-success-tint border border-border-soft rounded-xl px-3 py-2">
                      <div className="text-sm">
                        <p className="font-semibold text-text-primary">{form.student}</p>
                        {!form.studentId && <p className="text-xs text-text-muted">Alumno de una reserva anterior (sin ficha vinculada)</p>}
                      </div>
                      {!isReschedule && (
                        <button
                          type="button"
                          className="text-xs text-primary-accent hover:underline shrink-0"
                          onClick={() => set({ studentId: '', student: '', branchId: '', program: '', level: '', time: '' })}
                        >
                          Cambiar
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <input
                        type="text"
                        autoFocus
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder="Buscar alumno activo por nombre o documento (mínimo 2 caracteres)..."
                        className={nativeFieldCls}
                      />
                      {matches.length > 0 && (
                        <div className="border border-border-soft rounded-xl overflow-hidden bg-surface">
                          {matches.map(s => (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => pickStudent(s)}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-surface-muted border-b border-border-soft last:border-0"
                            >
                              <span className="font-medium text-text-primary">{s.name}</span>
                              <span className="text-text-muted"> · {s.doc} · {studentProgramLabel(s, enrollments)}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {query.trim().length >= 2 && matches.length === 0 && (
                        <p className="text-xs text-text-muted">No hay alumnos activos que coincidan.</p>
                      )}
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className={labelCls}>Sede</label>
                    <input className={`${nativeFieldCls} disabled:bg-surface-muted disabled:text-text-muted`} value={branchName ?? ''} disabled placeholder="Autocompletado" readOnly />
                  </div>
                  <div>
                    <label className={labelCls}>Programa</label>
                    <input className={`${nativeFieldCls} disabled:bg-surface-muted disabled:text-text-muted`} value={form.program} disabled placeholder="Autocompletado" readOnly />
                  </div>
                  <div>
                    <label className={labelCls}>Nivel</label>
                    <input className={`${nativeFieldCls} disabled:bg-surface-muted disabled:text-text-muted`} value={form.level} disabled placeholder="Autocompletado" readOnly />
                  </div>
                </div>
                {picked && limit && (
                  <p className={`text-xs ${expiring ? 'text-warning-text font-medium' : 'text-text-muted'}`}>
                    Vigencia hasta el {longDayLabel(limit)}
                    {expiring ? ` · por vencer (quedan ${expiring.daysToBaseEnd} ${expiring.daysToBaseEnd === 1 ? 'día' : 'días'}; extensión +${expiring.extensionMonths} meses)` : ''}
                  </p>
                )}
                {form.student && !form.branchId && (
                  <p className="text-xs text-danger-text">El alumno no tiene una matrícula con sede; no se puede reservar su horario.</p>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className="pb-2 border-b border-border-soft">
                <h3 className="text-base font-semibold text-text-primary">Observaciones</h3>
              </div>
              <textarea
                className={`${textareaCls} h-24`}
                rows={3}
                placeholder="Notas de agenda..."
                value={form.observations}
                onChange={e => set({ observations: e.target.value })}
              ></textarea>
            </div>
          </div>

          {/* Columna derecha */}
          <div className="space-y-4">
            <div className="pb-2 border-b border-border-soft">
              <h3 className="text-base font-semibold text-text-primary">Programación</h3>
            </div>
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className={labelCls}>Fecha <span className="text-error">*</span></label>
                <DateInput
                  min={today}
                  isDateDisabled={d => weekdayIndex(d) === 6}
                  value={form.date}
                  onChange={e => set({ date: e.target.value, time: '' })}
                />
                {form.date && !closedDay && <p className="text-xs text-text-muted mt-1">{longDayLabel(form.date)}</p>}
                {closedDay && <p className="text-xs text-danger-text mt-1">Los domingos no hay atención. Elija de lunes a sábado.</p>}
              </div>

              <div>
                <label className={labelCls}>Horario <span className="text-error">*</span></label>
                <select
                  className={nativeFieldCls}
                  value={form.time}
                  disabled={!form.date || closedDay || !form.branchId}
                  onChange={e => pickTime(e.target.value)}
                >
                  <option value="">
                    {!form.student ? 'Elija primero al alumno' : !form.date ? 'Elija primero la fecha' : closedDay ? 'Sin atención' : 'Seleccionar horario...'}
                  </option>
                  {(form.branchId ? slots : []).map(t => {
                    const o = optionOf(t);
                    return (
                      <option key={t} value={t} disabled={o.unavailable && t !== form.time}>
                        {slotLabel(t)} — {o.text}
                      </option>
                    );
                  })}
                </select>
                <p className="text-xs text-text-muted mt-1">
                  {isFirst
                    ? 'Primera asesoría: solo horarios vacíos o del mismo registro; no tiene cupo.'
                    : chosen
                      ? `Cada horario es un salón con cupo. Este: ${chosen}.`
                      : 'Cada asesoría dura 1 hora. Lun–Vie 3 a 8 p. m.; sábados 9 a 1 p. m. y 4 a 8 p. m.'}
                </p>
              </div>

              <div>
                <label className={labelCls}>Responsable <span className="text-error">*</span></label>
                <select className={nativeFieldCls} value={form.responsible} onChange={e => set({ responsible: e.target.value })}>
                  <option value="">{responsibleOptions.length ? 'Seleccionar responsable...' : 'No hay personal asignado a Psicopedagogía'}</option>
                  {responsibleOptions.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
