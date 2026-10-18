import React, { useEffect, useState } from 'react';
import { AlertCircle, Trash2 } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { useData, type CapacityConfig } from '../../context/DataContext';
import {
  DEFAULT_CAPACITY,
  capacityLabel,
  isValidCapacity,
  longDayLabel,
  occupancy,
  removeOverride,
  setBranchCapacity,
  slotLabel,
  slotsForDate,
  todayLocalISO,
  upsertOverride,
} from '../../utils/schedule';
import { CapacityInput } from './CapacityInput';
import { labelCls, nativeFieldCls } from './formStyles';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

type BranchMode = 'general' | 'propio' | 'sin';

/**
 * Cupo de alumnos por horario de asesoría (cada salón atiende normalmente entre 5 y 8 alumnos, pero es variable).
 * Tres niveles: cupo general, cupo propio de cada sede y excepciones para una fecha y horario concretos.
 */
export function CapacityModal({ isOpen, onClose }: Props) {
  const { capacityConfig, setCapacityConfig, branches, schedules } = useData();
  const today = todayLocalISO();
  const activeBranches = branches.filter(b => b.status === 'Activo');
  const [cfg, setCfg] = useState<CapacityConfig>(capacityConfig);
  const [error, setError] = useState<string | null>(null);
  const [exc, setExc] = useState({ branchId: '', date: '', time: '', capacity: DEFAULT_CAPACITY as number | null });

  useEffect(() => {
    if (!isOpen) return;
    setCfg(capacityConfig);
    setError(null);
    setExc({ branchId: activeBranches[0]?.id ?? '', date: '', time: '', capacity: DEFAULT_CAPACITY });
  }, [isOpen]);

  const modeOf = (branchId: string): BranchMode =>
    !Object.prototype.hasOwnProperty.call(cfg.byBranch, branchId) ? 'general' : cfg.byBranch[branchId] === null ? 'sin' : 'propio';

  const setMode = (branchId: string, mode: BranchMode) => {
    setError(null);
    if (mode === 'general') setCfg(setBranchCapacity(cfg, branchId, undefined));
    else if (mode === 'sin') setCfg(setBranchCapacity(cfg, branchId, null));
    else setCfg(setBranchCapacity(cfg, branchId, typeof cfg.defaultCapacity === 'number' ? cfg.defaultCapacity : DEFAULT_CAPACITY));
  };

  const branchName = (id: string) => branches.find(b => b.id === id)?.name ?? id;

  const addException = () => {
    if (!exc.branchId) { setError('Elija la sede de la excepción.'); return; }
    if (!exc.date) { setError('Elija la fecha de la excepción.'); return; }
    if (exc.date < today) { setError('La fecha de la excepción no puede ser anterior a hoy.'); return; }
    if (!slotsForDate(exc.date).includes(exc.time)) { setError('Elija un horario válido para esa fecha.'); return; }
    if (!isValidCapacity(exc.capacity)) { setError('El cupo debe estar entre 1 y 50, o sin límite.'); return; }
    setError(null);
    setCfg(upsertOverride(cfg, { branchId: exc.branchId, date: exc.date, time: exc.time, capacity: exc.capacity }));
    setExc({ ...exc, time: '' });
  };

  const handleSave = () => {
    if (!isValidCapacity(cfg.defaultCapacity)) { setError('El cupo general debe estar entre 1 y 50, o sin límite.'); return; }
    setCapacityConfig(cfg);
    onClose();
  };

  const upcoming = cfg.overrides.filter(o => o.date >= today);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Cupos por horario"
      size="3xl"
      footer={
        <div className="flex justify-end gap-3 w-full">
          <Button variant="ghost" onClick={onClose}>Descartar Cambios</Button>
          <Button variant="primary" onClick={handleSave}>Guardar Cupos</Button>
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

        <p className="text-sm text-text-secondary">
          Cada horario es un salón: atiende a varios alumnos a la vez (normalmente entre 5 y 8). Defina cuántos admite o elija «Sin límite».
          Los cambios aplican a las nuevas reservas; las ya registradas se mantienen.
        </p>

        <div className="space-y-3">
          <div className="pb-2 border-b border-border-soft">
            <h3 className="text-base font-semibold text-text-primary">Cupo general</h3>
          </div>
          <div>
            <label className={labelCls}>Alumnos por horario (todas las sedes)</label>
            <CapacityInput value={cfg.defaultCapacity} onChange={v => { setError(null); setCfg({ ...cfg, defaultCapacity: v }); }} />
          </div>
        </div>

        <div className="space-y-3">
          <div className="pb-2 border-b border-border-soft">
            <h3 className="text-base font-semibold text-text-primary">Cupo por sede</h3>
          </div>
          <div className="space-y-2">
            {activeBranches.map(b => {
              const mode = modeOf(b.id);
              return (
                <div key={b.id} className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 border border-border-soft rounded-xl">
                  <span className="text-sm font-medium text-text-primary sm:w-40 shrink-0">{b.name}</span>
                  <select className={`${nativeFieldCls} sm:w-56`} value={mode} onChange={e => setMode(b.id, e.target.value as BranchMode)}>
                    <option value="general">Usar el cupo general ({capacityLabel(cfg.defaultCapacity)})</option>
                    <option value="propio">Cupo propio</option>
                    <option value="sin">Sin límite</option>
                  </select>
                  {mode === 'propio' && (
                    <CapacityInput
                      value={cfg.byBranch[b.id] ?? DEFAULT_CAPACITY}
                      onChange={v => setCfg(setBranchCapacity(cfg, b.id, v))}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-3">
          <div className="pb-2 border-b border-border-soft">
            <h3 className="text-base font-semibold text-text-primary">Excepciones por fecha y horario</h3>
            <p className="text-sm text-text-secondary mt-0.5">Para un día concreto que necesite más o menos alumnos (o sin límite).</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Sede</label>
              <select className={nativeFieldCls} value={exc.branchId} onChange={e => setExc({ ...exc, branchId: e.target.value })}>
                {activeBranches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Fecha</label>
              <input type="date" min={today} className={nativeFieldCls} value={exc.date} onChange={e => setExc({ ...exc, date: e.target.value, time: '' })} />
            </div>
            <div>
              <label className={labelCls}>Horario</label>
              <select className={nativeFieldCls} value={exc.time} disabled={!exc.date} onChange={e => setExc({ ...exc, time: e.target.value })}>
                <option value="">{!exc.date ? 'Elija primero la fecha' : slotsForDate(exc.date).length ? 'Seleccionar horario...' : 'Sin atención'}</option>
                {slotsForDate(exc.date).map(t => <option key={t} value={t}>{slotLabel(t)}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Cupo</label>
              <CapacityInput value={exc.capacity} onChange={v => setExc({ ...exc, capacity: v })} />
            </div>
          </div>
          <div className="flex justify-end">
            <Button variant="secondary" onClick={addException}>Agregar excepción</Button>
          </div>

          {upcoming.length > 0 && (
            <div className="space-y-2">
              {upcoming.map(o => {
                const used = occupancy(schedules, o.branchId, o.date, o.time);
                return (
                  <div key={o.id} className="flex items-center justify-between gap-3 p-3 border border-border-soft rounded-xl">
                    <div className="text-sm">
                      <p className="font-medium text-text-primary">{branchName(o.branchId)} · {longDayLabel(o.date)} · {slotLabel(o.time)}</p>
                      <p className="text-xs text-text-muted">
                        Cupo: {capacityLabel(o.capacity)} · Reservados hoy: {used}
                        {o.capacity !== null && used > o.capacity ? ' (supera el cupo; se mantienen)' : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCfg(removeOverride(cfg, o.id))}
                      className="p-2 text-text-muted hover:text-danger-text hover:bg-danger-tint rounded-lg transition-colors"
                      title="Quitar excepción"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
