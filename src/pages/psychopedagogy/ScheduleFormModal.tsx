import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { useData, type Schedule, type Student } from '../../context/DataContext';
import { getInterviewerOptions } from '../../utils/enrollment';
import {
  STATUS_OPTIONS,
  TYPE_OPTIONS,
  findScheduleConflict,
  longDayLabel,
  todayLocalISO,
  validateSchedule,
} from '../../utils/schedule';
import { labelCls, nativeFieldCls, textareaCls } from './formStyles';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Reserva a editar; `null` para crear una nueva. */
  schedule: Schedule | null;
  /** Fecha sugerida al crear desde el calendario. */
  defaultDate?: string;
}

interface FormState {
  studentId: string;
  student: string;
  program: string;
  level: string;
  type: string;
  modality: string;
  date: string;
  time: string;
  duration: number;
  responsible: string;
  status: string;
  observations: string;
}

const emptyForm = (date: string): FormState => ({
  studentId: '', student: '', program: '', level: '', type: 'Primera asesoría', modality: 'Presencial',
  date, time: '', duration: 45, responsible: '', status: 'Reservado', observations: '',
});

const defaultDuration = (type: string) => (type === 'Primera asesoría' ? 45 : 30);

/** Programa y nivel vigentes del alumno según su matrícula más reciente. */
function programOf(student: Student, enrollments: ReturnType<typeof useData>['enrollments']) {
  const own = enrollments.filter(e => e.studentId === student.id || e.student === student.name);
  const latest = own.sort((a, b) => (a.dateISO ?? '').localeCompare(b.dateISO ?? '')).pop();
  if (latest) return { program: latest.program, level: latest.level };
  const [program = '', level = ''] = (student.program || '').split(' - ');
  return { program, level };
}

export function ScheduleFormModal({ isOpen, onClose, schedule, defaultDate }: Props) {
  const { students, enrollments, schedules, staff, assignments, branches, addSchedule, updateSchedule } = useData();
  const today = todayLocalISO();
  const [form, setForm] = useState<FormState>(() => emptyForm(defaultDate || today));
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Responsables: todo el personal activo asignado a Psicopedagogía
  const responsibles = useMemo(
    () => getInterviewerOptions({ staff, assignments, branches }, '').map(o => ({
      value: `${o.staff.names} ${o.staff.lastNameP}`.trim(),
      label: `${o.staff.names} ${o.staff.lastNameP} ${o.staff.lastNameM} — ${o.branchName}`.replace(/\s+/g, ' '),
    })),
    [staff, assignments, branches]
  );

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setQuery('');
    if (schedule) {
      const known = students.find(s => s.id === schedule.studentId) ?? students.find(s => s.name === schedule.student);
      setForm({
        studentId: known?.id ?? schedule.studentId ?? '',
        student: schedule.student, program: schedule.program, level: schedule.level, type: schedule.type,
        modality: schedule.modality, date: schedule.date, time: schedule.time, duration: schedule.duration,
        responsible: schedule.responsible, status: schedule.status, observations: schedule.observations ?? '',
      });
    } else {
      setForm(emptyForm(defaultDate || today));
    }
  }, [isOpen, schedule, defaultDate]);

  const set = (patch: Partial<FormState>) => { setError(null); setForm(f => ({ ...f, ...patch })); };

  const matches = query.trim().length >= 2
    ? students
        .filter(s => s.status === 'Activo' && `${s.name} ${s.doc}`.toLowerCase().includes(query.trim().toLowerCase()))
        .slice(0, 6)
    : [];

  const pickStudent = (s: Student) => {
    const { program, level } = programOf(s, enrollments);
    set({ studentId: s.id, student: s.name, program, level });
    setQuery('');
  };

  const handleSave = () => {
    const isNew = !schedule;
    const problem = validateSchedule({ ...form, isNew }, today);
    if (problem) { setError(problem); return; }

    const conflict = findScheduleConflict(schedules, form, schedule?.id);
    if (conflict) {
      const c = conflict.schedule;
      setError(
        conflict.who === 'responsable'
          ? `${c.responsible} ya tiene una cita ese día de ${c.time} con ${c.student}. Elija otro horario o responsable.`
          : `${c.student} ya tiene una cita ese día a las ${c.time}.`
      );
      return;
    }

    const data = {
      student: form.student.trim(), studentId: form.studentId || undefined, program: form.program, level: form.level,
      type: form.type, date: form.date, time: form.time, duration: form.duration, responsible: form.responsible.trim(),
      modality: form.modality, status: form.status, observations: form.observations.trim() || undefined,
    };
    if (schedule) updateSchedule(schedule.id, data);
    else addSchedule(data);
    onClose();
  };

  const responsibleOptions = form.responsible && !responsibles.some(r => r.value === form.responsible)
    ? [{ value: form.responsible, label: form.responsible }, ...responsibles]
    : responsibles;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={schedule ? 'Editar Reserva' : 'Nueva Reserva de Asesoría'}
      size="4xl"
      footer={
        <div className="flex justify-end gap-3 w-full">
          <Button variant="ghost" onClick={onClose}>Descartar Cambios</Button>
          <Button variant="primary" onClick={handleSave}>{schedule ? 'Guardar Cambios' : 'Guardar y Confirmar Reserva'}</Button>
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
                      <button
                        type="button"
                        className="text-xs text-primary-accent hover:underline shrink-0"
                        onClick={() => set({ studentId: '', student: '', program: '', level: '' })}
                      >
                        Cambiar
                      </button>
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
                              <span className="text-text-muted"> · {s.doc} · {s.program}</span>
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
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Programa</label>
                    <input className={`${nativeFieldCls} disabled:bg-surface-muted disabled:text-text-muted`} value={form.program} disabled placeholder="Autocompletado" readOnly />
                  </div>
                  <div>
                    <label className={labelCls}>Nivel</label>
                    <input className={`${nativeFieldCls} disabled:bg-surface-muted disabled:text-text-muted`} value={form.level} disabled placeholder="Autocompletado" readOnly />
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="pb-2 border-b border-border-soft">
                <h3 className="text-base font-semibold text-text-primary">Detalles Básicos</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Tipo de cita</label>
                  <select
                    className={nativeFieldCls}
                    value={form.type}
                    onChange={e => set({ type: e.target.value, duration: schedule ? form.duration : defaultDuration(e.target.value) })}
                  >
                    {TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Canal / Modalidad</label>
                  <select className={nativeFieldCls} value={form.modality} onChange={e => set({ modality: e.target.value })}>
                    <option value="Presencial">Presencial</option>
                    <option value="Virtual">Virtual</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Columna derecha */}
          <div className="space-y-6">
            <div className="space-y-4">
              <div className="pb-2 border-b border-border-soft">
                <h3 className="text-base font-semibold text-text-primary">Programación</h3>
              </div>
              <div className="grid grid-cols-1 gap-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 sm:col-span-1">
                    <label className={labelCls}>Fecha <span className="text-error">*</span></label>
                    <input
                      type="date"
                      min={schedule ? undefined : today}
                      className={nativeFieldCls}
                      value={form.date}
                      onChange={e => set({ date: e.target.value })}
                    />
                    {form.date && <p className="text-xs text-text-muted mt-1">{longDayLabel(form.date)}</p>}
                  </div>
                  <div className="col-span-2 sm:col-span-1 grid grid-cols-2 gap-2">
                    <div>
                      <label className={labelCls}>Hora <span className="text-error">*</span></label>
                      <input type="time" className={nativeFieldCls} value={form.time} onChange={e => set({ time: e.target.value })} />
                    </div>
                    <div>
                      <label className={labelCls}>Dur. (min)</label>
                      <input
                        type="number" min={5} max={240} step={5}
                        className={nativeFieldCls}
                        value={form.duration}
                        onChange={e => set({ duration: parseInt(e.target.value) || 0 })}
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className={labelCls}>Responsable <span className="text-error">*</span></label>
                  <select className={nativeFieldCls} value={form.responsible} onChange={e => set({ responsible: e.target.value })}>
                    <option value="">{responsibleOptions.length ? 'Seleccionar responsable...' : 'No hay personal asignado a Psicopedagogía'}</option>
                    {responsibleOptions.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </div>

                <div>
                  <label className={labelCls}>Estado de reserva</label>
                  <select className={nativeFieldCls} value={form.status} onChange={e => set({ status: e.target.value })}>
                    {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                <div>
                  <label className={labelCls}>Observaciones</label>
                  <textarea
                    className={`${textareaCls} h-24`}
                    rows={3}
                    placeholder="Notas de agenda..."
                    value={form.observations}
                    onChange={e => set({ observations: e.target.value })}
                  ></textarea>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
