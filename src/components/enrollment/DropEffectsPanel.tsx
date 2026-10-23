import React from 'react';
import type { Enrollment } from '../../context/DataContext';
import type { DropPreview } from '../../utils/enrollmentDrop';

const usd = (n: number) => `USD ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface Props {
  preview: DropPreview;
  enrollment: Enrollment;
  /** Si se condonan las cuotas vencidas (cambia el texto de la deuda). */
  forgiveOverdue?: boolean;
}

/** Qué pasará con la matrícula, su plan, las asesorías, el alumno y los materiales si la caída se aprueba. */
export function DropEffectsPanel({ preview: p, enrollment, forgiveOverdue = false }: Props) {
  const rows: { title: string; text: string; tone?: 'warn' | 'danger' }[] = [
    { title: 'Matrícula', text: `${enrollment.id} pasa a «Caída» desde la fecha indicada y deja de contar como vigente.` },
    {
      title: 'Plan de pagos',
      text: p.annulled.length > 0
        ? `Se anulan ${p.annulled.length} ${p.annulled.length === 1 ? 'cuota futura' : 'cuotas futuras'} sin pagar (${usd(p.annulledUSD)}).`
        : 'No hay cuotas futuras sin pagar que anular.',
    },
    {
      title: 'Deuda vencida',
      text: p.overdue.length > 0
        ? forgiveOverdue
          ? `Se condonan ${p.overdue.length} ${p.overdue.length === 1 ? 'cuota vencida' : 'cuotas vencidas'} (${usd(p.overdueUSD)}).`
          : `${p.overdue.length} ${p.overdue.length === 1 ? 'cuota vencida sigue' : 'cuotas vencidas siguen'} como deuda (${usd(p.overdueUSD)}) hasta que se cobre o se condone.`
        : 'No hay cuotas vencidas sin pagar.',
      tone: p.overdue.length > 0 && !forgiveOverdue ? 'warn' : undefined,
    },
    {
      title: 'Lo ya pagado',
      text: p.paidUSD > 0
        ? `Se conserva ${usd(p.paidUSD)} cobrado. Si hay que devolver dinero, se hace con «Reversar pago» (queda en caja).`
        : 'No hay pagos registrados.',
    },
    {
      title: 'Asesorías y actividades',
      text: p.scheduleIds.length + p.activityRemovals.length > 0
        ? `Se cancelan ${p.scheduleIds.length} ${p.scheduleIds.length === 1 ? 'asesoría futura' : 'asesorías futuras'} y se quitan ${p.activityRemovals.length} ${p.activityRemovals.length === 1 ? 'inscripción' : 'inscripciones'} en actividades.`
        : 'No hay asesorías futuras ni inscripciones que cancelar.',
    },
    {
      title: 'Alumno',
      text: p.studentDeactivated
        ? 'No tiene otra matrícula activa: pasa a «Inactivo» y deja de aparecer para programar asesorías (sus datos se conservan).'
        : p.otherActiveEnrollments.length > 0
          ? `Tiene otra matrícula activa (${p.otherActiveEnrollments.join(', ')}): sigue activo; solo se cancela lo propio de esta matrícula.`
          : 'Su estado no cambia.',
    },
  ];
  if (p.deliveredItems > 0) rows.push({ title: 'Materiales', text: `Ya se entregaron ${p.deliveredItems} ${p.deliveredItems === 1 ? 'artículo' : 'artículos'}: la entrega no se revierte.`, tone: 'warn' });
  if (p.groupMembers > 0) rows.push({ title: 'Grupo promocional', text: `Pertenece a un grupo promocional con ${p.groupMembers} ${p.groupMembers === 1 ? 'alumno más' : 'alumnos más'}. Revise si la promoción sigue aplicando.`, tone: 'warn' });

  return (
    <div className="border border-border-soft rounded-xl divide-y divide-border-soft overflow-hidden">
      {rows.map(r => (
        <div key={r.title} className={`flex gap-4 px-4 py-2.5 text-sm ${r.tone === 'warn' ? 'bg-warning-tint/40' : ''}`}>
          <span className="w-40 shrink-0 font-medium text-text-secondary">{r.title}</span>
          <span className="text-text-primary">{r.text}</span>
        </div>
      ))}
    </div>
  );
}
