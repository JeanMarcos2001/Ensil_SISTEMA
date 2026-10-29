import React from 'react';
import { DateInput } from '../ui/DateInput';
import type { Schedule } from '../../context/DataContext';
import { firstBlockText, firstSessionBlock, longDayLabel, slotLabel, slotsForDate, weekdayIndex, type FlatActivity } from '../../utils/schedule';
import { Field, inputCls } from '../../pages/enrollment/fields';

interface Props {
  branchId: string;
  /** Agenda de la sede (sin las asesorías que se van a cancelar). */
  schedules: Schedule[];
  activities: FlatActivity[];
  date: string;
  time: string;
  min: string;
  onChange: (date: string, time: string) => void;
}

/**
 * Fecha y hora de una primera asesoría: de lunes a sábado, en un bloque de 1 hora VACÍO de la sede (sin asesorías ni
 * actividades encima). Es el único horario que se elige al matricular o trasladar a un alumno.
 */
export function FirstSessionPicker({ branchId, schedules, activities, date, time, min, onChange }: Props) {
  const scheduling = { schedules, capacity: { defaultCapacity: null, byBranch: {}, overrides: [] }, activities };
  const slots = date ? slotsForDate(date) : [];
  return (
    <>
      <Field label="Fecha de la primera asesoría" required hint={date && weekdayIndex(date) === 6 ? 'Los domingos no hay atención. Elija de lunes a sábado.' : date ? longDayLabel(date) : 'No puede ser anterior a hoy.'}>
        <DateInput min={min} isDateDisabled={d => weekdayIndex(d) === 6} value={date} onChange={e => onChange(e.target.value, '')} />
      </Field>
      <Field label="Horario de la primera asesoría" required hint="Solo horarios vacíos: la primera asesoría no se mezcla con asesorías ni actividades.">
        <select className={inputCls} value={time} disabled={!date || slots.length === 0} onChange={e => onChange(date, e.target.value)}>
          <option value="">{!date ? 'Elija primero la fecha' : slots.length === 0 ? 'Sin atención' : 'Seleccionar horario...'}</option>
          {slots.map(t => {
            const state = firstSessionBlock(scheduling, branchId, date, t);
            const unavailable = state.kind === 'taken' || state.kind === 'blocked';
            return <option key={t} value={t} disabled={unavailable && t !== time}>{slotLabel(t)} — {firstBlockText(state)}</option>;
          })}
        </select>
      </Field>
    </>
  );
}
