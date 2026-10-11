import React from 'react';
import { Gift, X } from 'lucide-react';
import {
  availablePaymentTypesFor,
  fullName,
  getAvailablePrograms,
  getProgramLevels,
  promoStudentsFromQuote,
  studentPerson,
  type DraftStudent,
} from '../../utils/enrollment';
import { buildPromotionGroups, suggestGroups } from '../../utils/promotions';
import { ENROLLMENT_SCHEDULES } from '../../config/schedules';
import { Field, StepHeader, inputCls } from './fields';
import { STEPS, type StepProps } from './types';

const usd = (n: number) => `USD ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function StepProgram({ draft, update, catalogs, quote, today }: StepProps) {
  const programs = getAvailablePrograms(catalogs.programs, draft.context.branchId);
  const [chosenPromoId, setChosenPromoId] = React.useState('');
  const [checked, setChecked] = React.useState<string[] | null>(null);
  const [promoError, setPromoError] = React.useState<string | null>(null);

  const setStudent = (idx: number, patch: Partial<DraftStudent>) =>
    update(d => ({
      ...d,
      // Cambiar programa, nivel o tipo de pago invalida la promoción elegida (se vuelve a evaluar).
      promotion: 'programId' in patch || 'levelId' in patch || 'paymentTypeId' in patch ? null : d.promotion,
      students: d.students.map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    }));

  // ----- Promociones
  const offers = [...quote.offers].sort((a, b) => a.promotion.totalPrice - b.promotion.totalPrice);
  const currentOffer = offers.find(o => o.promotion.id === chosenPromoId) ?? offers[0];
  const promoStudents = promoStudentsFromQuote(quote.students);
  const promoCtx = { branchId: draft.context.branchId, date: draft.context.date };
  const nameOf = (key: string) => {
    const idx = draft.students.findIndex(s => s.key === key);
    const n = idx >= 0 ? fullName(studentPerson(draft, idx)) : '';
    return `Alumno ${idx + 1}${n ? ` — ${n}` : ''}`;
  };

  const effectiveChecked = currentOffer
    ? (checked ?? suggestGroups(currentOffer.promotion, promoStudents, promoCtx).flat())
    : [];

  const applyPromotion = () => {
    if (!currentOffer) return;
    const promo = currentOffer.promotion;
    const keys = effectiveChecked;
    if (keys.length === 0 || keys.length % promo.requiredStudents !== 0) {
      setPromoError(`Seleccione alumnos en múltiplos de ${promo.requiredStudents}.`);
      return;
    }
    const groups: string[][] = [];
    for (let i = 0; i < keys.length; i += promo.requiredStudents) groups.push(keys.slice(i, i + promo.requiredStudents));
    const res = buildPromotionGroups(promo, groups, promoStudents, promoCtx);
    if (!res.ok) { setPromoError(res.error || 'La combinación no es válida.'); return; }
    setPromoError(null);
    update(d => ({ ...d, promotion: { promotionId: promo.id, groups } }));
  };

  const appliedPromo = draft.promotion ? catalogs.promotions.find(p => p.id === draft.promotion!.promotionId) : undefined;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
      <StepHeader title={STEPS[3].title} subtitle={STEPS[3].subtitle} />

      {draft.students.map((s, idx) => {
        const q = quote.students[idx];
        const program = catalogs.programs.find(p => p.id === s.programId);
        const levels = getProgramLevels(catalogs.levels, program);
        const paymentOptions = availablePaymentTypesFor(draft, catalogs, idx);
        const variableLines = q.tariff?.installments.filter(l => l.variable) ?? [];
        const personName = fullName(studentPerson(draft, idx));

        return (
          <div key={s.key} className="p-5 border border-border-soft rounded-xl space-y-4">
            <h4 className="font-semibold text-text-primary">
              Alumno {idx + 1}{personName && <span className="text-text-secondary font-normal"> — {personName}</span>}
            </h4>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Programa" required hint={programs.length === 0 ? 'No hay programas activos habilitados para la sede.' : undefined}>
                <select
                  className={inputCls}
                  value={s.programId}
                  onChange={e => setStudent(idx, { programId: e.target.value, levelId: '', paymentTypeId: '', dueDates: [] })}
                >
                  <option value="">Seleccionar programa...</option>
                  {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </Field>

              {program?.hasLevels ? (
                <Field label="Nivel" required>
                  <select
                    className={inputCls}
                    value={s.levelId}
                    onChange={e => setStudent(idx, { levelId: e.target.value, paymentTypeId: '', dueDates: [] })}
                  >
                    <option value="">Seleccionar nivel...</option>
                    {levels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </Field>
              ) : (
                <Field label="Nivel">
                  <input className={inputCls} disabled value={program ? 'Este programa no usa niveles' : ''} readOnly />
                </Field>
              )}

              <Field
                label="Tipo de pago"
                required
                className="col-span-2"
                hint={
                  !s.programId || (program?.hasLevels && !s.levelId)
                    ? 'Elija programa y nivel para ver los tipos de pago disponibles.'
                    : paymentOptions.length === 0
                      ? 'No hay tarifarios vigentes para este programa/nivel en la sede y fecha.'
                      : 'Solo aparecen los tipos de pago con tarifario activo y vigente.'
                }
              >
                <select
                  className={inputCls}
                  value={s.paymentTypeId}
                  disabled={paymentOptions.length === 0}
                  onChange={e => setStudent(idx, { paymentTypeId: e.target.value, dueDates: [] })}
                >
                  <option value="">Seleccionar tipo de pago...</option>
                  {paymentOptions.map(o => <option key={o.paymentType.id} value={o.paymentType.id}>{o.paymentType.name}</option>)}
                </select>
              </Field>
            </div>

            {q.tariff && (
              <div className="bg-surface-muted border border-border-soft rounded-xl p-4 space-y-3">
                <div className="flex justify-between items-baseline">
                  <div>
                    <p className="text-xs text-text-muted uppercase tracking-wide">Tarifario</p>
                    <p className="text-sm font-medium text-text-primary">{q.tariff.name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-text-muted uppercase tracking-wide">Costo total</p>
                    <p className="text-lg font-bold text-text-primary">{usd(q.listPrice || q.tariff.basePrice)}</p>
                  </div>
                </div>
                {q.promotionGroupIndex !== undefined && (
                  <p className="text-xs text-success-text font-medium">
                    Con promoción: costo asignado {usd(q.assignedPrice)}
                  </p>
                )}
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-text-muted text-left">
                      <th className="py-1 font-medium">Concepto</th>
                      <th className="py-1 font-medium">Monto</th>
                      <th className="py-1 font-medium">Vence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {q.tariff.installments.map((l, i) => (
                      <tr key={i} className="border-t border-border-soft">
                        <td className="py-1.5 text-text-primary">{l.concept}</td>
                        <td className="py-1.5 text-text-secondary">{l.variable ? 'Se define al cobrar' : usd(l.amount)}</td>
                        <td className="py-1.5 text-text-secondary">{l.dueDays === 0 ? 'Día de matrícula' : `+${l.dueDays} días`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {q.mode === 'fechas_manuales' && variableLines.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-text-secondary">Fechas acordadas <span className="text-error">*</span></p>
                <div className="grid grid-cols-2 gap-4">
                  {variableLines.map((l, k) => (
                    <Field key={k} label={l.concept} hint="Solo la fecha; el monto se registra al cobrar en Planes.">
                      <input
                        type="date"
                        min={draft.context.date}
                        className={inputCls}
                        value={s.dueDates[k] ?? ''}
                        onChange={e => {
                          const next = [...s.dueDates];
                          next[k] = e.target.value;
                          setStudent(idx, { dueDates: next });
                        }}
                      />
                    </Field>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <Field label="Horario">
                <select className={inputCls} value={s.schedule} onChange={e => setStudent(idx, { schedule: e.target.value })}>
                  <option value="">Seleccionar horario...</option>
                  {ENROLLMENT_SCHEDULES.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </Field>
              <Field label="Fecha de inicio">
                <input
                  type="date"
                  min={draft.context.date}
                  className={inputCls}
                  value={s.startDate}
                  onChange={e => setStudent(idx, { startDate: e.target.value })}
                />
              </Field>
            </div>
          </div>
        );
      })}

      {/* ---- Promociones ---- */}
      {appliedPromo && quote.groups.length > 0 && (
        <div className="p-4 border-2 border-success-text/30 bg-success-tint rounded-xl space-y-3">
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-2 text-success-text font-semibold">
              <Gift size={18} /> Promoción aplicada: {appliedPromo.name}
            </div>
            <button type="button" className="text-text-secondary hover:text-danger-text" onClick={() => update(d => ({ ...d, promotion: null }))}>
              <X size={16} />
            </button>
          </div>
          {quote.groups.map((g, gi) => (
            <div key={gi} className="bg-surface rounded-lg p-3 text-sm space-y-1">
              <p className="font-medium text-text-primary">Grupo {gi + 1} — total {usd(g.totalPrice)} (un único pago)</p>
              {g.allocations.map(a => (
                <p key={a.studentKey} className="text-text-secondary">{nameOf(a.studentKey)}: {usd(a.amount)}</p>
              ))}
            </div>
          ))}
        </div>
      )}

      {!appliedPromo && currentOffer && (
        <div className="p-4 border-2 border-primary-accent/30 bg-primary-accent/5 rounded-xl space-y-3">
          <div className="flex items-center gap-2 text-primary-accent font-semibold">
            <Gift size={18} /> Promoción disponible
          </div>

          {offers.length > 1 && (
            <Field label="Promociones aplicables" hint="Se sugiere la de menor precio total para el cliente.">
              <select
                className={inputCls}
                value={currentOffer.promotion.id}
                onChange={e => { setChosenPromoId(e.target.value); setChecked(null); setPromoError(null); }}
              >
                {offers.map(o => (
                  <option key={o.promotion.id} value={o.promotion.id}>
                    {o.promotion.name} — {usd(o.promotion.totalPrice)}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <p className="text-sm text-text-primary">
            <strong>{currentOffer.promotion.name}</strong>: {currentOffer.promotion.requiredStudents} matrículas por{' '}
            <strong>{usd(currentOffer.promotion.totalPrice)}</strong> (se paga una sola vez).
          </p>

          <div className="space-y-1">
            <p className="text-xs font-medium text-text-secondary uppercase tracking-wide">Alumnos participantes</p>
            {currentOffer.eligibleKeys.map(key => (
              <label key={key} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded border-border-soft text-primary-accent"
                  checked={effectiveChecked.includes(key)}
                  onChange={e => {
                    const base = effectiveChecked;
                    setChecked(e.target.checked ? [...base, key] : base.filter(k => k !== key));
                    setPromoError(null);
                  }}
                />
                {nameOf(key)}
              </label>
            ))}
          </div>

          {promoError && <p className="text-xs text-danger-text font-medium">{promoError}</p>}
          <button
            type="button"
            onClick={applyPromotion}
            className="px-4 h-9 rounded-lg bg-primary-accent text-white text-sm font-medium hover:opacity-90"
          >
            Aplicar beneficio
          </button>
        </div>
      )}
    </div>
  );
}
