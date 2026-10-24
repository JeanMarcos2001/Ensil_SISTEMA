import React, { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import type { ActionMenuItem } from '../ui/ActionMenu';
import { useData, type ChangeKindName, type Enrollment } from '../../context/DataContext';
import { PERM } from '../../utils/authority';
import { DRAFT_KEY } from '../../utils/enrollment';
import { buildRenewalDraft, paymentTypeIdOf, pendingChangeOf, renewalCheck } from '../../utils/enrollmentChange';
import { todayLocalISO } from '../../utils/schedule';
import { ChangeRequestModal } from './ChangeRequestModal';

/**
 * Acciones de ciclo de vida de una matrícula que comparten el listado de Matrículas y su ficha: reactivar, cambiar de
 * programa o nivel, trasladar de sede y renovar. Devuelve los ítems del menú y las ventanas que necesitan.
 */
export function useChangeActions() {
  const data = useData();
  const navigate = useNavigate();
  const [change, setChange] = useState<{ kind: ChangeKindName; id: string } | null>(null);
  const [renewal, setRenewal] = useState<{ enrollment: Enrollment; draft: ReturnType<typeof buildRenewalDraft> } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const renewalOf = useCallback((e: Enrollment) => renewalCheck(e, { enrollments: data.enrollments, programs: data.programs, levels: data.levels, schedules: data.schedules, today: todayLocalISO() }), [data.enrollments, data.programs, data.levels, data.schedules]);

  const openWizard = (draft: NonNullable<ReturnType<typeof buildRenewalDraft>>) => {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ step: 1, draft })); } catch { /* sin almacenamiento: el asistente empezará vacío */ }
    data.setIsEnrollmentWizardOpen(true);
  };

  const startRenewal = (e: Enrollment) => {
    const check = renewalOf(e);
    if (!check.ok) { setNotice(check.reasons[0]); return; }
    const draft = buildRenewalDraft(e, check, data.students, data.guardians, todayLocalISO(), paymentTypeIdOf(e, data.plans.find(p => p.mat === e.id), data.paymentTypes));
    if (!draft) { setNotice('No se encontró al alumno de la matrícula.'); return; }
    let hasDraft = false;
    try { hasDraft = !!localStorage.getItem(DRAFT_KEY); } catch { /* ignorar */ }
    if (hasDraft) setRenewal({ enrollment: e, draft });
    else openWizard(draft);
  };

  /** Ítems del menú para una matrícula (según su estado y los permisos del usuario). */
  const items = (e: Enrollment): ActionMenuItem[] => {
    const out: ActionMenuItem[] = [];
    const pending = pendingChangeOf(e.id, data.changeRequests);
    if (pending) return [{ label: `Ver solicitud ${pending.id} (${pending.kind.toLowerCase()})`, onClick: () => navigate('/sistema/solicitudes-pendientes') }];
    if (e.status === 'Activa') {
      out.push({ label: 'Solicitar cambio de programa o nivel', onClick: () => setChange({ kind: 'Cambio de programa', id: e.id }), disabled: !data.can(PERM.programChangeRequest) });
      out.push({ label: 'Solicitar traslado de sede', onClick: () => setChange({ kind: 'Traslado de sede', id: e.id }), disabled: !data.can(PERM.transferRequest) });
    }
    if (e.status === 'Caída') out.push({ label: 'Solicitar reactivación', onClick: () => setChange({ kind: 'Reactivación', id: e.id }), disabled: !data.can(PERM.reactivationRequest) });
    if ((e.status === 'Activa' || e.status === 'Caída') && renewalOf(e).ok) out.push({ label: 'Renovar matrícula', onClick: () => startRenewal(e), disabled: !data.can(PERM.renew) });
    return out;
  };

  const modals = (
    <>
      <ChangeRequestModal kind={change?.kind ?? null} enrollmentId={change?.id ?? null} onClose={() => setChange(null)} />
      <ConfirmDialog
        isOpen={!!renewal}
        onClose={() => setRenewal(null)}
        onConfirm={() => { if (renewal?.draft) openWizard(renewal.draft); setRenewal(null); }}
        title="Reemplazar el borrador de matrícula"
        description="Hay una matrícula sin terminar en el asistente. Si continúa, se reemplaza por la renovación de esta matrícula."
        variant="warning"
        confirmLabel="SÍ, REEMPLAZAR"
        cancelLabel="NO, CONSERVAR"
      />
      <ConfirmDialog
        isOpen={!!notice}
        onClose={() => setNotice(null)}
        onConfirm={() => setNotice(null)}
        title="No se puede renovar"
        description={notice ?? ''}
        variant="warning"
        confirmLabel="ENTENDIDO"
        hideCancel
      />
    </>
  );

  return { items, modals, startRenewal, renewalOf, openChange: (kind: ChangeKindName, id: string) => setChange({ kind, id }) };
}
