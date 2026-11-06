import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Info, TriangleAlert } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { DateInput } from '../../components/ui/DateInput';
import { Modal } from '../../components/ui/Modal';
import { useData, type Assignment } from '../../context/DataContext';
import { todayLocalISO } from '../../utils/schedule';
import { SUPERUSER } from '../../utils/authority';
import {
  WAREHOUSE_AREA,
  areasForPlace,
  assignablePlaces,
  assignmentToForm,
  buildAssignment,
  emptyAssignmentForm,
  mainToDemote,
  validateAssignmentForm,
  willBeMain,
  type AssignmentForm,
} from '../../utils/assignments';
import { Field, errorCls, inputCls } from '../enrollment/fields';
import { accountPlaceWarning, assignmentAccessNote } from '../../utils/staffDb';
import { userOfStaff } from '../../utils/staffAccess';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Asignación a editar; `null` para crear una nueva. */
  editing: Assignment | null;
  /** Trabajador con el que empieza el formulario (al venir desde Personal). */
  presetStaffId?: string;
}

const textareaCls = 'w-full bg-surface border border-border-soft rounded-xl p-3 text-sm focus:outline-none focus:border-primary-accent resize-none';

/**
 * Nueva asignación o edición de una activa. De las asignaciones salen los responsables de entrevista y asesorías (área
 * Psicopedagogía) y los verificadores de cada sede. Cada trabajador tiene UNA principal.
 */
export function AssignmentFormModal({ isOpen, onClose, editing, presetStaffId }: Props) {
  const { orgStaff: staff, orgAssignments: assignments, orgPlaces: places, users, roles, permissions, saveAssignment, currentUser, sessionScope } = useData();
  const today = todayLocalISO();
  const [form, setForm] = useState<AssignmentForm>(emptyAssignmentForm(today));
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setForm(editing ? assignmentToForm(editing) : { ...emptyAssignmentForm(today), staffId: presetStaffId ?? '' });
    setSubmitted(false);
    setServerError(null);
  }, [isOpen, editing, presetStaffId, today]);

  const errors = useMemo(() => validateAssignmentForm(form, assignments, staff, places, today, editing?.id), [form, assignments, staff, places, today, editing?.id]);
  const set = (patch: Partial<AssignmentForm>) => { setForm(f => ({ ...f, ...patch })); setServerError(null); };
  const err = (k: keyof AssignmentForm) => (submitted ? errors[k] : undefined);
  const cls = (k: keyof AssignmentForm) => `${inputCls} ${err(k) ? errorCls : ''}`;

  const demoted = form.staffId ? mainToDemote(form, assignments, editing?.id) : undefined;
  const forcedMain = !!form.staffId && !form.isMain && willBeMain(form, assignments, editing?.id);
  const count = Object.keys(errors).length;

  const place = places.find(p => p.name === form.branch);
  // Los lugares en los que quien asigna puede hacerlo: sus sedes (todas si alcanza todas) y el almacén solo si lo opera (Superusuario o asignado)
  const me = users.find(u => u.id === currentUser.id);
  const placeChoices = assignablePlaces(places, {
    allBranches: sessionScope.allBranches, isSuperuser: currentUser.role === SUPERUSER,
    branchNames: [me?.branch, ...(me?.additionalBranches ?? [])].filter((n): n is string => !!n), warehouseIds: me?.warehouses ?? [],
  }, editing?.branch);
  // Las áreas que admite el lugar: el almacén central solo trabaja en Logística; una sede admite todas
  const areaOptions = areasForPlace(place?.kind);
  const changePlace = (name: string) => {
    const next = places.find(p => p.name === name);
    const area = next && !areasForPlace(next.kind).includes(form.area) ? '' : form.area;
    // En el almacén solo cabe una opción: queda elegida sola
    set({ branch: name, area: next?.kind === 'almacen' && !area ? WAREHOUSE_AREA : area });
  };

  // Qué pasará con la cuenta de la persona (si la tiene): sus sedes y su almacén salen de estas asignaciones
  const account = form.staffId ? userOfStaff(form.staffId, users) : undefined;
  const accessNote = assignmentAccessNote(form.hasAccess, place?.kind);
  const accountWarning = useMemo(() => {
    if (!account || !place || count > 0) return undefined;
    const built = { ...buildAssignment(form, editing?.id ?? 'ASG-NUEVA', assignments, editing?.id), placeId: place.id, placeKind: place.kind };
    const others = assignments.filter(a => a.id !== built.id).map(a => (built.isMain && a.staffId === built.staffId ? { ...a, isMain: false } : a));
    return accountPlaceWarning(account, [...others, { ...(editing ?? {}), ...built }], roles, permissions);
  }, [account, place, count, form, editing, assignments, roles, permissions]);

  const handleSave = async () => {
    setSubmitted(true);
    if (count > 0 || saving) return;
    setSaving(true);
    try {
      const r = await saveAssignment(form, editing?.id);
      if (!r.ok) { setServerError(r.error ?? 'No se pudo guardar la asignación.'); return; }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editing ? 'Editar asignación' : 'Nueva asignación'}
      size="2xl"
      footer={
        <div className="flex justify-end gap-3 w-full">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={() => void handleSave()} disabled={saving}>{saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Guardar asignación'}</Button>
        </div>
      }
    >
      <div className="space-y-5 pb-2">
        {(serverError || (submitted && count > 0)) && (
          <div className="bg-danger-tint border border-danger-text/20 rounded-xl p-3 flex gap-2 text-sm text-danger-text">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <p>{serverError ?? `Revise ${count} ${count === 1 ? 'campo marcado' : 'campos marcados'} antes de guardar.`}</p>
          </div>
        )}

        <Field label="Trabajador" required error={err('staffId')} hint={editing ? 'El trabajador de una asignación no se cambia: cierre esta y cree otra.' : 'El cargo no se registra aquí: sale del contrato de la persona.'}>
          <select className={cls('staffId')} value={form.staffId} disabled={!!editing} onChange={e => set({ staffId: e.target.value })}>
            <option value="">Seleccionar trabajador...</option>
            {staff.filter(s => s.status === 'Activo' || s.id === form.staffId).map(s => (
              <option key={s.id} value={s.id}>{s.names} {s.lastNameP} {s.lastNameM}</option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="Lugar de trabajo" required error={err('branch')} hint="Una sede o el almacén central.">
            <select className={cls('branch')} value={form.branch} onChange={e => changePlace(e.target.value)}>
              <option value="">Seleccionar sede o almacén...</option>
              <optgroup label="Sedes">
                {placeChoices.filter(p => p.kind === 'sede' && (p.status === 'Activo' || p.name === form.branch)).map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
              </optgroup>
              <optgroup label="Almacén central">
                {placeChoices.filter(p => p.kind === 'almacen' && (p.status === 'Activo' || p.name === form.branch)).map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
              </optgroup>
            </select>
          </Field>
          <Field label="Área" required error={err('area')} hint={place?.kind === 'almacen' ? 'El almacén central solo trabaja en Logística.' : undefined}>
            <select className={cls('area')} value={form.area} onChange={e => set({ area: e.target.value })}>
              <option value="">Seleccionar área...</option>
              {areaOptions.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </Field>
          <Field label="Acceso al sistema" required hint="El rol de su cuenta se elige después, en Organización → Usuarios.">
            <select className={inputCls} value={form.hasAccess ? 'si' : 'no'} onChange={e => set({ hasAccess: e.target.value === 'si' })}>
              <option value="si">Sí, necesita acceso</option>
              <option value="no">No necesita acceso (p. ej. limpieza)</option>
            </select>
          </Field>
          <Field label="Fecha de inicio" required error={err('startDate')}>
            <DateInput value={form.startDate} onChange={e => set({ startDate: e.target.value })} />
          </Field>
          <Field label="Fecha de fin (opcional)" error={err('endDate')} hint="Solo si la asignación tiene un término previsto.">
            <DateInput min={form.startDate || undefined} value={form.endDate} onChange={e => set({ endDate: e.target.value })} />
          </Field>
        </div>

        <div className="p-4 bg-surface-muted rounded-xl border border-border-soft">
          <label className="flex items-start justify-between gap-4 cursor-pointer">
            <span>
              <span className="block text-sm font-medium text-text-primary">Asignación principal</span>
              <span className="block text-xs text-text-secondary">Es el lugar y el área base del trabajador (lo que se ve en la lista de Personal).</span>
            </span>
            <input
              type="checkbox"
              className="w-5 h-5 accent-primary-accent mt-0.5"
              checked={form.isMain || forcedMain}
              disabled={forcedMain}
              onChange={e => set({ isMain: e.target.checked })}
            />
          </label>
          {err('isMain') && <p className="text-xs text-danger-text mt-2">{err('isMain')}</p>}
          {forcedMain && <p className="text-xs text-text-muted mt-2">Será la principal porque es la única asignación activa de este trabajador.</p>}
          {demoted && <p className="text-xs text-warning-text mt-2">Al guardar, «{demoted.area} · {demoted.branch}» dejará de ser la principal.</p>}
        </div>

        {(accessNote || account) && (
          <div className="flex gap-2 text-xs text-text-secondary bg-info-tint rounded-xl p-3">
            <Info size={14} className="shrink-0 mt-0.5 text-info-text" />
            <p>
              {accessNote}{accessNote ? ' ' : ''}
              {account ? `Su cuenta (${account.id}) toma sus sedes y su almacén de las asignaciones activas con acceso: al guardar se actualiza sola.` : ''}
            </p>
          </div>
        )}
        {accountWarning && (
          <div className="flex gap-2 text-xs text-warning-text bg-warning-tint border border-warning-text/20 rounded-xl p-3">
            <TriangleAlert size={14} className="shrink-0 mt-0.5" />
            <p>{accountWarning} Se guarda igual, pero corrija su rol en Organización → Usuarios.</p>
          </div>
        )}

        <Field label="Observaciones">
          <textarea className={`${textareaCls} h-20`} value={form.observations} onChange={e => set({ observations: e.target.value })} placeholder="Detalles adicionales de la asignación..." />
        </Field>
      </div>
    </Modal>
  );
}
