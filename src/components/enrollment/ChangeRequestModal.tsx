import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '../ui/Button';
import { DateInput } from '../ui/DateInput';
import { Modal } from '../ui/Modal';
import { useData, type ChangeKindName } from '../../context/DataContext';
import {
  MAX_START_AHEAD_DAYS, PROGRAM_CHANGE_REASONS, REACTIVATION_REASONS, TRANSFER_REASONS,
  programChangeProblems, reactivationProblems, responsiblesByBranch, transferAgenda, transferProblems, validateProgramChangeRequest, validateReactivationRequest, validateTransferRequest,
  type ChangeContext,
} from '../../utils/enrollmentChange';
import { getAvailablePrograms, getProgramLevels } from '../../utils/enrollment';
import { addDaysISO, allActivities, todayLocalISO } from '../../utils/schedule';
import { Field, inputCls } from '../../pages/enrollment/fields';
import { Blocked, ChangePreviewPanel } from './ChangePreviewPanel';
import { FirstSessionPicker } from './FirstSessionPicker';

interface Props {
  /** Tipo de solicitud; `null` cierra la ventana. */
  kind: ChangeKindName | null;
  enrollmentId: string | null;
  onClose: () => void;
}

const REASONS: Record<ChangeKindName, string[]> = {
  'Reactivación': REACTIVATION_REASONS,
  'Cambio de programa': PROGRAM_CHANGE_REASONS,
  'Traslado de sede': TRANSFER_REASONS,
};

/** Solicitud de reactivación, cambio de programa/nivel o traslado de sede: datos, qué pasaría y envío para aprobación. */
export function ChangeRequestModal({ kind, enrollmentId, onClose }: Props) {
  const data = useData();
  const enrollment = data.enrollments.find(e => e.id === enrollmentId);
  const today = todayLocalISO();
  const [reason, setReason] = useState('');
  const [detail, setDetail] = useState('');
  const [startDate, setStartDate] = useState(today);
  const [programId, setProgramId] = useState('');
  const [levelId, setLevelId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [firstDate, setFirstDate] = useState('');
  const [firstTime, setFirstTime] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setReason(''); setDetail(''); setStartDate(todayLocalISO()); setProgramId(''); setLevelId(''); setBranchId(''); setFirstDate(''); setFirstTime(''); setError(null); setSaving(false);
  }, [kind, enrollmentId]);

  const ctx: ChangeContext = useMemo(() => ({
    enrollments: data.enrollments, plans: data.plans, students: data.students, schedules: data.schedules, monthly: data.monthlySchedules, programs: data.programs,
    levels: data.levels, tariffs: data.tariffs, paymentTypes: data.paymentTypes, branches: data.branches,
    payments: data.payments, groups: data.promotionGroups, requests: data.changeRequests, responsibles: responsiblesByBranch(data.staff, data.assignments, data.branches), today,
  }), [data.enrollments, data.plans, data.students, data.schedules, data.monthlySchedules, data.programs, data.levels, data.tariffs, data.paymentTypes, data.branches, data.staff, data.assignments, data.payments, data.promotionGroups, data.changeRequests, today]);

  if (!kind || !enrollment) return null;
  const student = data.students.find(s => s.id === enrollment.studentId) ?? data.students.find(s => s.name === enrollment.student);
  const payload: Record<string, string> = kind === 'Reactivación' ? { startDate } : kind === 'Cambio de programa' ? { programId, levelId } : { branchId, firstDate, firstTime };

  // Impedimentos de fondo (los que no dependen de lo que se escribe)
  const blockers = kind === 'Reactivación' ? reactivationProblems(enrollment, ctx)
    : kind === 'Cambio de programa' ? (programId ? programChangeProblems(enrollment, { programId, levelId }, ctx) : programChangeProblems(enrollment, { programId: '', levelId: '' }, ctx).filter(p => !/Seleccione el programa/.test(p)))
    : (branchId ? transferProblems(enrollment, { branchId, firstDate, firstTime }, ctx) : transferProblems(enrollment, { branchId: '', firstDate: '', firstTime: '' }, ctx).filter(p => !/Seleccione la sede/.test(p)));
  const allProblems = kind === 'Reactivación' ? validateReactivationRequest(enrollment, { startDate, reason, detail }, ctx)
    : kind === 'Cambio de programa' ? validateProgramChangeRequest(enrollment, { programId, levelId, reason, detail }, ctx)
    : validateTransferRequest(enrollment, { branchId, firstDate, firstTime, reason, detail }, ctx);

  const programs = getAvailablePrograms(data.programs, enrollment.branchId ?? '');
  const program = data.programs.find(p => p.id === programId);
  const levels = getProgramLevels(data.levels, program);
  const targetBranch = data.branches.find(b => b.id === branchId);
  // Si el traslado cancela su primera asesoría, la solicitud lleva la fecha y la hora de la nueva en la sede destino
  const agenda = kind === 'Traslado de sede' ? transferAgenda(enrollment, ctx) : undefined;
  const needsFirst = !!targetBranch && !!agenda?.firstSessionLost;
  const targetSchedules = agenda ? data.schedules.filter(s => !agenda.scheduleIds.includes(s.id)) : data.schedules;

  const submit = async () => {
    setSaving(true);
    const r = await (kind === 'Reactivación' ? data.requestReactivation(enrollment.id, { startDate, reason, detail })
      : kind === 'Cambio de programa' ? data.requestProgramChange(enrollment.id, { programId, levelId, reason, detail })
      : data.requestTransfer(enrollment.id, { branchId, firstDate, firstTime, reason, detail }));
    setSaving(false);
    if (!r.ok) { setError(r.error ?? 'No se pudo enviar la solicitud.'); return; }
    onClose();
  };

  const intro: Record<ChangeKindName, string> = {
    'Reactivación': 'Vuelve a activar una matrícula caída (dentro del plazo y mientras dure su vigencia). La solicitud la aprueba quien tiene autoridad.',
    'Cambio de programa': 'Cambia el programa o el nivel de una matrícula activa. Lo ya cobrado se abona al precio del programa nuevo.',
    'Traslado de sede': 'Pasa la matrícula a otra sede. El precio y el plan no cambian; la agenda de la sede anterior se cancela para reprogramarla.',
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Solicitar ${kind.toLowerCase()} · ${enrollment.id}`}
      size="3xl"
      footer={
        <div className="flex justify-end gap-3 w-full">
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button variant="primary" onClick={submit} disabled={saving}>{saving ? 'Enviando…' : 'Enviar solicitud'}</Button>
        </div>
      }
    >
      <div className="space-y-5 pb-2">
        <p className="text-sm text-text-secondary">{intro[kind]}</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-surface-muted border border-border-soft rounded-xl p-4 text-sm">
          <div><span className="block text-xs text-text-muted">Alumno</span><span className="font-medium text-text-primary">{enrollment.student}</span></div>
          <div><span className="block text-xs text-text-muted">Programa</span><span className="font-medium text-text-primary">{enrollment.program} {enrollment.level !== 'Sin nivel' ? enrollment.level : ''}</span></div>
          <div><span className="block text-xs text-text-muted">Sede</span><span className="font-medium text-text-primary">{enrollment.sede ?? '—'}</span></div>
          <div><span className="block text-xs text-text-muted">Estado</span><span className="font-medium text-text-primary">{enrollment.status}</span></div>
        </div>

        {error && (
          <div className="bg-danger-tint border border-danger-text/20 rounded-xl p-3 flex gap-2 text-sm text-danger-text">
            <AlertCircle size={16} className="shrink-0 mt-0.5" /><p>{error}</p>
          </div>
        )}
        <Blocked problems={blockers} />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {kind === 'Reactivación' && (
            <Field label="Reactivar desde" required hint={`Hoy o hasta ${MAX_START_AHEAD_DAYS} días adelante.`}>
              <DateInput min={today} max={addDaysISO(today, MAX_START_AHEAD_DAYS)} value={startDate} onChange={e => { setStartDate(e.target.value); setError(null); }} />
            </Field>
          )}
          {kind === 'Cambio de programa' && (
            <>
              <Field label="Programa nuevo" required>
                <select className={inputCls} value={programId} onChange={e => { setProgramId(e.target.value); setLevelId(''); setError(null); }}>
                  <option value="">Seleccionar...</option>
                  {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </Field>
              <Field label="Nivel nuevo" required={!!program?.hasLevels}>
                <select className={inputCls} value={levelId} disabled={!program?.hasLevels} onChange={e => { setLevelId(e.target.value); setError(null); }}>
                  <option value="">{program?.hasLevels ? 'Seleccionar...' : 'No usa niveles'}</option>
                  {levels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </Field>
            </>
          )}
          {kind === 'Traslado de sede' && (
            <>
              <Field label="Sede destino" required>
                <select className={inputCls} value={branchId} onChange={e => { setBranchId(e.target.value); setFirstDate(''); setFirstTime(''); setError(null); }}>
                  <option value="">Seleccionar...</option>
                  {data.branches.filter(b => b.status === 'Activo' && b.id !== enrollment.branchId).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </Field>
              {needsFirst && targetBranch && (
                <>
                  <p className="md:col-span-2 text-sm text-text-secondary bg-surface-muted rounded-xl px-3 py-2.5">
                    El traslado cancela su primera asesoría (la vigencia cuenta desde ella). Elija la nueva en {targetBranch.name}: al aprobar la solicitud se programa sola.
                  </p>
                  <FirstSessionPicker
                    branchId={targetBranch.id}
                    schedules={targetSchedules}
                    activities={allActivities(data.monthlySchedules)}
                    date={firstDate}
                    time={firstTime}
                    min={today}
                    onChange={(d, t) => { setFirstDate(d); setFirstTime(t); setError(null); }}
                  />
                </>
              )}
            </>
          )}
          <Field label="Motivo" required>
            <select className={inputCls} value={reason} onChange={e => { setReason(e.target.value); setError(null); }}>
              <option value="">Seleccionar...</option>
              {REASONS[kind].map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="Explicación" required className="md:col-span-2" hint="Queda como constancia en la solicitud y en el historial de la matrícula.">
            <textarea className="w-full h-20 bg-surface border border-border-soft rounded-xl p-3 text-sm focus:outline-none focus:border-primary-accent resize-none" value={detail} onChange={e => { setDetail(e.target.value); setError(null); }} />
          </Field>
        </div>

        <section className="space-y-2">
          <h4 className="text-sm font-bold text-text-primary uppercase tracking-wider">Qué pasaría si se aprueba</h4>
          {blockers.length === 0 || kind !== 'Reactivación' ? <ChangePreviewPanel kind={kind} enrollment={enrollment} payload={payload} ctx={ctx} /> : <p className="text-sm text-text-muted">Resuelva los impedimentos de arriba para ver el efecto.</p>}
        </section>
        {allProblems.length > 0 && (reason || detail) && <p className="text-xs text-text-muted">{allProblems[0]}</p>}
      </div>
    </Modal>
  );
}
