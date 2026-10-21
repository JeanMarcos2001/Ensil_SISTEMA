import React from 'react';
import { fullName, studentPerson, unitPaymentStatus } from '../../utils/enrollment';
import { documentLabel } from '../../utils/payments';
import { StepHeader } from './fields';
import { STEPS, type StepProps } from './types';

const usd = (n: number) => `USD ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border border-border-soft rounded-xl overflow-hidden">
      <h4 className="px-4 py-2 bg-surface-muted text-xs font-semibold text-text-secondary uppercase tracking-wide">{title}</h4>
      <div className="p-4 space-y-1.5 text-sm">{children}</div>
    </section>
  );
}

const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
  <div className="flex justify-between gap-4">
    <span className="text-text-secondary">{k}</span>
    <span className="font-medium text-text-primary text-right">{v}</span>
  </div>
);

export function StepSummary({ draft, catalogs, quote }: StepProps) {
  const branch = catalogs.branches.find(b => b.id === draft.context.branchId);
  const lead = catalogs.leadSources.find(l => l.id === draft.context.leadSourceId);
  const interviewer = catalogs.staff.find(s => s.id === draft.context.interviewerId);
  const promoOf = (id: string) => catalogs.promotions.find(p => p.id === id);
  const total = quote.students.reduce((acc, q) => acc + (q.mode === 'inmediato' ? q.assignedPrice : q.listPrice || q.tariff?.basePrice || 0), 0);

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-right-4">
      <StepHeader title={STEPS[5].title} subtitle={STEPS[5].subtitle} />

      <Section title="Contexto">
        <Row k="Sede" v={branch?.name ?? '—'} />
        <Row k="Fecha de matrícula" v={draft.context.date} />
        <Row k="Origen" v={lead?.name ?? '—'} />
        <Row k="Responsable de la entrevista" v={interviewer ? `${interviewer.names} ${interviewer.lastNameP}` : '—'} />
        {draft.context.observation && <Row k="Observación" v={draft.context.observation} />}
      </Section>

      <Section title={draft.mode === 'independiente' ? 'Matrícula independiente' : 'Titulares'}>
        {draft.mode === 'independiente' ? (
          <Row k="Persona" v={`${fullName(draft.holders[0])} · ${draft.holders[0].docType} ${draft.holders[0].docNumber}`} />
        ) : (
          draft.holders.map((h, i) => (
            <Row
              key={i}
              k={i === 0 ? 'Titular principal' : i === 1 ? 'Titular secundario' : `Titular ${i + 1}`}
              v={`${fullName(h)} · ${h.docType} ${h.docNumber}${h.phone ? ` · ${h.phone}` : ''}`}
            />
          ))
        )}
      </Section>

      <Section title={`Matrículas a crear (${draft.students.length})`}>
        {quote.students.map(q => {
          const p = studentPerson(draft, q.index);
          return (
            <div key={q.key} className="py-2 border-b border-border-soft last:border-0 space-y-1">
              <p className="font-semibold text-text-primary">
                Alumno {q.index + 1}: {fullName(p)} <span className="text-text-muted font-normal">· {p.docType} {p.docNumber}</span>
              </p>
              <Row k="Programa / nivel" v={`${q.program?.name ?? '—'}${q.level ? ` · ${q.level.name}` : ''}`} />
              <Row k="Primera asesoría" v={`${draft.students[q.index].counselingDate || '—'} · ${draft.students[q.index].counselingTime || '—'}`} />
              <Row k="Tipo de pago" v={q.paymentType?.name ?? '—'} />
              <Row k="Tarifario" v={q.tariff?.name ?? '—'} />
              <Row k="Costo asignado" v={q.mode === 'inmediato' ? usd(q.assignedPrice) : usd(q.listPrice || q.tariff?.basePrice || 0)} />
              {q.promotionGroupIndex !== undefined && (
                <Row k="Promoción" v={promoOf(quote.groups[q.promotionGroupIndex].promotionId)?.name ?? '—'} />
              )}
            </div>
          );
        })}
      </Section>

      <Section title="Pago">
        {quote.units.length === 0 && <p className="text-text-secondary">No hay pagos inmediatos: los alumnos tienen cronograma (ver abajo).</p>}
        {quote.units.map(u => {
          const parts = draft.payments[u.key] ?? [];
          const st = unitPaymentStatus(parts, u.required);
          return (
            <div key={u.key} className="py-2 border-b border-border-soft last:border-0 space-y-1">
              <p className="font-semibold text-text-primary">{u.label}</p>
              <Row k="Total requerido" v={usd(u.required)} />
              {parts.map((p, i) => (
                <Row
                  key={p.id}
                  k={`Parte ${i + 1} · ${p.method}${p.operationNumber ? ` · Op. ${p.operationNumber}` : ''}`}
                  v={p.currency === 'USD'
                    ? usd(p.amount)
                    : `S/ ${p.amount.toFixed(2)} (TC ${p.exchangeRate ?? '—'} = ${usd(p.exchangeRate ? p.amount / p.exchangeRate : 0)})`}
                />
              ))}
              {parts.some(p => p.evidence) && <Row k="Evidencias" v={parts.map(p => p.evidence).filter(Boolean).join(', ')} />}
              {draft.paymentDocs[u.key] && <Row k="Comprobante" v={`${draft.paymentDocs[u.key].type} ${documentLabel(draft.paymentDocs[u.key])}`} />}
              <Row k="Total equivalente" v={st.validTc ? usd(st.registered) : 'Falta TC'} />
            </div>
          );
        })}
        {quote.students.filter(q => q.tariff && q.mode !== 'inmediato').map(q => (
          <p key={q.key} className="text-text-secondary">
            Alumno {q.index + 1}: cronograma de {q.paymentType!.name} (los pagos se gestionan desde Planes).
          </p>
        ))}
      </Section>

      {quote.groups.length > 0 && (
        <Section title="Promoción">
          {quote.groups.map((g, gi) => (
            <div key={gi} className="space-y-1">
              <Row k={`Grupo ${gi + 1}`} v={promoOf(g.promotionId)?.name ?? '—'} />
              <Row k="Total promocional" v={usd(g.totalPrice)} />
              {g.allocations.map(a => {
                const idx = draft.students.findIndex(s => s.key === a.studentKey);
                return <Row key={a.studentKey} k={`Reparto — Alumno ${idx + 1}`} v={usd(a.amount)} />;
              })}
            </div>
          ))}
        </Section>
      )}

      <div className="flex justify-between items-center bg-primary-accent/5 border border-primary-accent/20 rounded-xl px-4 py-3">
        <span className="text-sm font-medium text-text-primary">Total del registro</span>
        <span className="text-lg font-bold text-primary-accent">{usd(total)}</span>
      </div>
    </div>
  );
}
