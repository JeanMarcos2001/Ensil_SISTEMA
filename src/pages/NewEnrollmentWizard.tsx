import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Check, CheckCircle2, X } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { useData } from '../context/DataContext';
import {
  availablePaymentTypesFor,
  emptyDraft,
  emptyStudent,
  quoteEnrollment,
  validateContext,
  validateHolders,
  validatePayments,
  validateProgram,
  validateStudents,
  type EnrollmentCatalogs,
  type EnrollmentDraft,
} from '../utils/enrollment';
import { StepContext } from './enrollment/StepContext';
import { StepHolders } from './enrollment/StepHolders';
import { StepStudents } from './enrollment/StepStudents';
import { StepProgram } from './enrollment/StepProgram';
import { StepPayment } from './enrollment/StepPayment';
import { StepSummary } from './enrollment/StepSummary';
import { STEPS } from './enrollment/types';

interface NewEnrollmentWizardProps {
  onClose: () => void;
}

const DRAFT_KEY = 'enrollmentDraft.v3';
const todayISO = () => new Date().toISOString().slice(0, 10);

function loadDraft(): { step: number; draft: EnrollmentDraft } | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.draft?.context || !Array.isArray(parsed.draft.students) || !Array.isArray(parsed.draft.holders)) return null;
    const d = parsed.draft as EnrollmentDraft;
    // Borradores anteriores no traen los campos de situación del alumno: se completan con valores vacíos.
    d.students = d.students.map(s => ({ ...emptyStudent(), ...s }));
    return { step: Math.min(Math.max(Number(parsed.step) || 1, 1), STEPS.length), draft: d };
  } catch {
    return null;
  }
}

const clearDraft = () => {
  try { localStorage.removeItem(DRAFT_KEY); } catch { /* sin almacenamiento disponible */ }
};

export function NewEnrollmentWizard({ onClose }: NewEnrollmentWizardProps) {
  const data = useData();
  const navigate = useNavigate();
  const today = todayISO();

  const catalogs: EnrollmentCatalogs = {
    branches: data.branches, leadSources: data.leadSources, staff: data.staff, assignments: data.assignments,
    programs: data.programs, levels: data.levels, tariffs: data.tariffs, paymentTypes: data.paymentTypes,
    promotions: data.promotions, guardians: data.guardians, students: data.students, classSchedules: data.classSchedules,
  };

  // Sede de la sesión: una sesión de filial no puede cambiarla; el Superadmin en vista global sí.
  const lockedBranchId =
    data.currentBranchId !== 'all' ? data.currentBranchId
    : data.currentUser.branchId !== 'all' ? data.currentUser.branchId
    : '';

  const [step, setStep] = useState<number>(() => loadDraft()?.step ?? 1);
  const [draft, setDraft] = useState<EnrollmentDraft>(() => {
    const saved = loadDraft()?.draft;
    const base = saved ?? emptyDraft(today, lockedBranchId);
    // Descarta referencias que ya no existen (sede, origen) para no arrastrar datos inválidos
    const branchOk = data.branches.some(b => b.id === base.context.branchId && b.status === 'Activo');
    const leadOk = data.leadSources.some(l => l.id === base.context.leadSourceId && l.status === 'active');
    return {
      ...base,
      context: {
        ...base.context,
        branchId: lockedBranchId || (branchOk ? base.context.branchId : ''),
        leadSourceId: leadOk ? base.context.leadSourceId : '',
      },
    };
  });
  const [errors, setErrors] = useState<string[]>([]);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [result, setResult] = useState<{ ids: string[] } | null>(null);

  const quote = useMemo(() => quoteEnrollment(draft, catalogs), [draft, data.tariffs, data.paymentTypes, data.promotions, data.programs, data.levels]);

  const update = (fn: (d: EnrollmentDraft) => EnrollmentDraft) => {
    setErrors([]);
    setDraft(fn);
  };

  // La promoción elegida se revalida ante cualquier cambio: si deja de ser válida se retira con aviso.
  const lastPromoCheck = useRef('');
  useEffect(() => {
    if (draft.promotion && quote.warnings.length > 0) {
      const sig = quote.warnings.join('|');
      if (lastPromoCheck.current !== sig) {
        lastPromoCheck.current = sig;
        setNotice('La promoción aplicada dejó de cumplir las condiciones y se retiró. Vuelva a evaluarla.');
      }
      setDraft(d => ({ ...d, promotion: null }));
    }
  }, [draft.promotion, quote.warnings.join('|')]);

  // Pagos que ya no corresponden a una unidad vigente se descartan
  useEffect(() => {
    const keys = new Set(quote.units.map(u => u.key));
    const stale = Object.keys(draft.payments).filter(k => !keys.has(k));
    if (stale.length > 0) {
      setDraft(d => {
        const next = { ...d.payments };
        stale.forEach(k => delete next[k]);
        return { ...d, payments: next };
      });
    }
  }, [quote.units.map(u => u.key).join('|')]);

  /** Cambios del contexto con invalidación de dependientes (sede → programas y tipos de pago; fecha → tipos de pago). */
  const onContextChange = (patch: Partial<EnrollmentDraft['context']>) => {
    update(d => {
      const context = { ...d.context, ...patch };
      let students = d.students;
      let promotion = d.promotion;
      let interviewerId = context.interviewerId;

      if (patch.branchId !== undefined && patch.branchId !== d.context.branchId) {
        promotion = null;
        students = students.map(s => ({ ...s, programId: '', levelId: '', paymentTypeId: '', dueDates: [] }));
      }
      if (patch.date !== undefined && patch.date !== d.context.date) {
        promotion = null;
        const probe: EnrollmentDraft = { ...d, context: { ...context, interviewerId }, students };
        students = students.map((s, i) => {
          if (!s.paymentTypeId) return s;
          const ok = availablePaymentTypesFor(probe, catalogs, i).some(o => o.paymentType.id === s.paymentTypeId);
          return ok ? s : { ...s, paymentTypeId: '', dueDates: [] };
        });
      }
      return { ...d, context: { ...context, interviewerId }, students, promotion };
    });
  };

  const validateStep = (n: number): string[] => {
    switch (n) {
      case 1: return validateContext(draft, catalogs, today);
      case 2: return validateHolders(draft, catalogs, today);
      case 3: return validateStudents(draft, catalogs, today);
      case 4: return validateProgram(draft, catalogs, quote);
      case 5: return validatePayments(draft, quote);
      default: return [];
    }
  };

  const next = () => {
    const e = validateStep(step);
    if (e.length) { setErrors(e); return; }
    setErrors([]);
    setNotice(null);
    setStep(s => Math.min(s + 1, STEPS.length));
  };
  const prev = () => { setErrors([]); setStep(s => Math.max(s - 1, 1)); };

  const goTo = (n: number) => { if (n < step) { setErrors([]); setStep(n); } };

  const handleConfirm = () => {
    if (saving) return;
    // Revalida todos los pasos antes de guardar
    for (let n = 1; n <= 5; n++) {
      const e = validateStep(n);
      if (e.length) { setErrors(e); setStep(n); return; }
    }
    setSaving(true);
    const res = data.registerEnrollments(draft);
    setSaving(false);
    if (!res.ok) {
      setErrors([res.error || 'No se pudo guardar la matrícula.']);
      return;
    }
    clearDraft();
    setResult({ ids: res.enrollmentIds ?? [] });
  };

  const saveDraftAndExit = () => {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ step, draft })); } catch { /* sin almacenamiento disponible */ }
    setShowCancelConfirm(false);
    onClose();
  };
  const discardAndExit = () => {
    clearDraft();
    setShowCancelConfirm(false);
    onClose();
  };
  const handleCancel = () => {
    const hasProgress = step > 1 || draft.holders.some(h => h.names || h.docNumber);
    if (hasProgress) setShowCancelConfirm(true);
    else discardAndExit();
  };

  const stepProps = { draft, update, catalogs, quote, today };

  // ---- Pantalla de éxito
  if (result) {
    return (
      <div className="flex flex-col items-center justify-center h-[75vh] -m-6 px-8 text-center space-y-5">
        <CheckCircle2 size={56} className="text-success-text" />
        <div>
          <h3 className="text-2xl font-bold text-text-primary">Matrículas registradas</h3>
          <p className="text-sm text-text-secondary mt-1">
            Se crearon {result.ids.length} matrícula(s). Estado inicial de verificación: <strong>Pendiente</strong>.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 justify-center">
          {result.ids.map(id => (
            <span key={id} className="px-3 py-1 rounded-lg bg-surface-muted border border-border-soft font-mono text-sm">{id}</span>
          ))}
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => { onClose(); navigate('/operacion/matriculas'); }}>Ver matrículas</Button>
          <Button variant="secondary" onClick={() => { onClose(); navigate('/operacion/verificacion'); }}>Verificar</Button>
          <Button variant="primary" onClick={onClose}>Cerrar</Button>
        </div>
        <p className="text-xs text-text-muted max-w-md">
          Pendiente de módulos aún inexistentes: generar contrato y generar ficha de matrícula.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[75vh] -m-6">
      <div className="flex flex-1 min-h-0">
        {/* Progress Indicator (Left Sidebar) */}
        <div className="w-[35%] border-r border-border-soft pl-[8vw] pr-8 py-6 flex flex-col overflow-y-auto">
          {STEPS.map((cfg, idx) => {
            const n = idx + 1;
            const isActive = step === n;
            const isPast = step > n;
            const isLast = idx === STEPS.length - 1;
            return (
              <div
                key={cfg.label}
                className={`relative flex items-start gap-4 ${isLast ? '' : 'pb-10'} ${isPast ? 'cursor-pointer group' : ''}`}
                onClick={() => goTo(n)}
              >
                {!isLast && (
                  <div className={`absolute left-[23px] top-[48px] bottom-0 w-[2px] ${isPast ? 'bg-success-text/40' : 'bg-border-soft'}`} />
                )}
                <div
                  className={`relative z-10 w-12 h-12 rounded-full flex items-center justify-center text-lg font-medium transition-colors shrink-0 ${
                    isPast ? 'bg-success-tint text-success-text group-hover:bg-success-tint/80'
                    : isActive ? 'bg-primary-accent text-white shadow-md'
                    : 'bg-surface border-2 border-border-soft text-text-primary'
                  }`}
                >
                  {isPast ? <Check size={24} strokeWidth={3} /> : n}
                </div>
                <div className="flex flex-col pt-1.5">
                  <span className={`transition-colors ${
                    isActive ? 'text-[18px] font-semibold text-primary-accent'
                    : isPast ? 'text-[16px] font-semibold text-text-primary group-hover:text-primary-accent'
                    : 'text-[16px] font-medium text-text-muted'
                  }`}>{cfg.label}</span>
                  <span className={`text-[13px] mt-0.5 leading-tight ${isActive ? 'text-text-secondary font-medium' : 'text-text-muted'}`}>
                    {cfg.description}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Step Content */}
        <div className="flex-1 overflow-y-auto pl-12 pr-[8vw] py-6 relative">
          {(errors.length > 0 || notice) && (
            <div className="mb-4 space-y-2">
              {errors.length > 0 && (
                <div className="bg-danger-tint border border-danger-text/20 rounded-xl p-3 text-danger-text text-sm shadow-sm">
                  <div className="flex items-start gap-3">
                    <AlertCircle size={18} className="shrink-0 mt-0.5" />
                    <ul className="flex-1 space-y-0.5 font-medium">
                      {errors.slice(0, 6).map((m, i) => <li key={i}>{m}</li>)}
                      {errors.length > 6 && <li>… y {errors.length - 6} más.</li>}
                    </ul>
                    <button onClick={() => setErrors([])} className="p-1 rounded-lg hover:bg-danger-text/10"><X size={16} /></button>
                  </div>
                </div>
              )}
              {notice && (
                <div className="bg-warning-tint border border-warning-text/20 rounded-xl p-3 text-warning-text text-sm flex items-start gap-3">
                  <AlertCircle size={18} className="shrink-0 mt-0.5" />
                  <p className="flex-1">{notice}</p>
                  <button onClick={() => setNotice(null)}><X size={16} /></button>
                </div>
              )}
            </div>
          )}

          {step === 1 && <StepContext {...stepProps} lockedBranchId={lockedBranchId} onContextChange={onContextChange} />}
          {step === 2 && <StepHolders {...stepProps} />}
          {step === 3 && <StepStudents {...stepProps} />}
          {step === 4 && <StepProgram {...stepProps} />}
          {step === 5 && <StepPayment {...stepProps} />}
          {step === 6 && <StepSummary {...stepProps} />}
        </div>
      </div>

      {/* Footer Actions */}
      <div className="flex justify-between items-center pl-[8vw] pr-[8vw] py-4 border-t border-border-soft shrink-0 bg-surface">
        <Button variant="ghost" onClick={handleCancel}>Cancelar</Button>
        <div className="flex gap-3">
          {step > 1 && <Button variant="secondary" onClick={prev}>Atrás</Button>}
          {step < STEPS.length ? (
            <Button variant="primary" onClick={next}>Siguiente</Button>
          ) : (
            <Button variant="primary" onClick={handleConfirm} disabled={saving}>Guardar matrículas</Button>
          )}
        </div>
      </div>

      {/* Cancel Confirmation Modal */}
      {showCancelConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-surface rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden animate-in zoom-in-95">
            <div className="p-6">
              <h3 className="text-xl font-bold text-text-primary mb-2">¿Guardar progreso?</h3>
              <p className="text-text-secondary mb-6">
                Has avanzado en el registro. ¿Deseas guardar tu progreso para continuar más tarde o descartarlo? El correlativo de matrícula
                solo se asigna al guardar definitivamente.
              </p>
              <div className="flex flex-col gap-3">
                <Button variant="primary" className="w-full justify-center" onClick={saveDraftAndExit}>Sí, guardar y salir</Button>
                <Button
                  variant="secondary"
                  className="w-full justify-center border-danger-text text-danger-text hover:bg-danger-tint"
                  onClick={discardAndExit}
                >
                  No, descartar y salir
                </Button>
                <Button variant="ghost" className="w-full justify-center" onClick={() => setShowCancelConfirm(false)}>
                  Cancelar y seguir editando
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
