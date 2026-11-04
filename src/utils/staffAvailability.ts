/**
 * Disponibilidad del personal frente a la agenda (funciones puras).
 *
 * Una persona NO puede ser responsable de una asesoría o de una actividad en una fecha en la que no trabaja:
 *   - **de vacaciones** (las del contrato vigente, del inicio al retorno, ambos días incluidos);
 *   - **después de su cese** (contrato cerrado y sin otro contrato que la cubra).
 * Y al revés, no se programan vacaciones ni se cierra un contrato si la persona tiene agenda en esas fechas: primero se
 * reasigna (así nadie queda como responsable de algo que no va a atender). Un contrato **vencido** sin renovar ni cerrar no bloquea
 * la agenda: ya lo avisa la alerta de contratos por vencer y la decisión es del negocio.
 */
import type { Contract, Schedule, Staff } from '../context/DataContext';
import { isStaffNamed } from './psyActivities';
import { addDaysISO, type FlatActivity } from './schedule';
import { formatDisplayDate } from './tariffs';

export type AbsenceKind = 'Vacaciones' | 'Cese';

export interface Absence {
  kind: AbsenceKind;
  /** Primer día en que no está (incluido). */
  from: string;
  /** Último día en que no está (incluido); sin valor = sin fin (cesó y no volvió). */
  to?: string;
  label: string;
}

const day = (iso: string) => formatDisplayDate(iso);

/** Cuándo no está esta persona: sus vacaciones programadas y, si cesó, el tiempo desde entonces hasta que vuelva a tener contrato. */
export function absencesOf(staffId: string, contracts: Contract[]): Absence[] {
  const own = contracts.filter(c => c.staffId === staffId);
  const out: Absence[] = [];
  for (const c of own) {
    if (c.status === 'Vigente' && c.vacationStart && c.vacationEnd) {
      out.push({ kind: 'Vacaciones', from: c.vacationStart, to: c.vacationEnd, label: `está de vacaciones del ${day(c.vacationStart)} al ${day(c.vacationEnd)}` });
    }
    if (c.status === 'Cesado' && c.endDate) {
      const from = addDaysISO(c.endDate, 1);
      const back = own.filter(x => x.id !== c.id && x.startDate > c.endDate!).map(x => x.startDate).sort()[0];
      out.push({ kind: 'Cese', from, to: back ? addDaysISO(back, -1) : undefined, label: `cesó el ${day(c.endDate)} (contrato cerrado)` });
    }
  }
  return out;
}

const covers = (a: Absence, date: string) => date >= a.from && (!a.to || date <= a.to);
const overlaps = (a: Absence, from: string, to?: string) => (!to || a.from <= to) && (!a.to || a.to >= from);

/** Por qué no está disponible en esa fecha (`null` = disponible). */
export function unavailableOn(staffId: string, date: string, contracts: Contract[]): string | null {
  return absencesOf(staffId, contracts).find(a => covers(a, date))?.label ?? null;
}

/** Quién es el trabajador al que se refiere el texto del responsable de una asesoría («Ana Pérez», «Lic. Ana Pérez»…). */
export const staffNamed = (text: string, staff: Staff[]): Staff | undefined => staff.find(s => isStaffNamed(s, text));

// ------------------------------------------------------------------------------------------------------------------ Responsable

/** Mensaje si la persona no puede ser responsable ese día, o `null`. */
export function responsibleUnavailable(member: Pick<Staff, 'id' | 'names' | 'lastNameP'>, date: string, contracts: Contract[]): string | null {
  const why = unavailableOn(member.id, date, contracts);
  return why ? `${member.names} ${member.lastNameP} ${why}: no puede ser responsable el ${day(date)}.` : null;
}

/** Lo mismo para el responsable de una asesoría guardado como texto; si no es nadie del personal no se opina. */
export function sessionResponsibleUnavailable(responsible: string, date: string, staff: Staff[], contracts: Contract[]): string | null {
  const member = responsible.trim() ? staffNamed(responsible, staff) : undefined;
  return member ? responsibleUnavailable(member, date, contracts) : null;
}

// ------------------------------------------------------------------------------------------------------------------ Agenda de una persona

export interface AgendaContext { schedules: Schedule[]; activities: FlatActivity[] }

export interface AgendaIn { sessions: Schedule[]; activities: FlatActivity[] }

const PENDING_SESSION = ['Reservado', 'Reprogramado'];

/** Asesorías pendientes y actividades a cargo de la persona entre dos fechas (`to` vacío = sin fin), ambas incluidas. */
export function agendaBetween(member: Pick<Staff, 'id' | 'names' | 'lastNameP' | 'lastNameM'>, from: string, to: string | undefined, ctx: AgendaContext): AgendaIn {
  const inRange = (date: string) => date >= from && (!to || date <= to);
  return {
    sessions: ctx.schedules.filter(s => PENDING_SESSION.includes(s.status) && inRange(s.date) && isStaffNamed(member as Staff, s.responsible)),
    activities: ctx.activities.filter(a => inRange(a.date) && (a.responsibleId === member.id || (!a.responsibleId && isStaffNamed(member as Staff, a.responsible)))),
  };
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function agendaMessage(who: string, when: string, a: AgendaIn): string {
  const parts = [a.sessions.length > 0 ? count(a.sessions.length, 'asesoría', 'asesorías') : '', a.activities.length > 0 ? count(a.activities.length, 'actividad', 'actividades') : ''].filter(Boolean);
  return `${who} tiene ${parts.join(' y ')} ${when}: reasígnelas primero en Psicopedagogía → Programación.`;
}

/** Vacaciones que se quieren programar: no pueden cruzarse con su agenda. */
export function vacationAgendaError(member: Pick<Staff, 'id' | 'names' | 'lastNameP' | 'lastNameM'>, start: string, end: string, today: string, ctx: AgendaContext): string | null {
  if (!start || !end) return null;
  const a = agendaBetween(member, start < today ? today : start, end, ctx);
  return a.sessions.length + a.activities.length === 0 ? null : agendaMessage(`${member.names} ${member.lastNameP}`, `durante esas vacaciones (${day(start)} al ${day(end)})`, a);
}

/** Cese: nada de agenda después de la fecha de cese (la fecha misma sí se trabaja). */
export function ceseAgendaError(member: Pick<Staff, 'id' | 'names' | 'lastNameP' | 'lastNameM'>, ceseDate: string, ctx: AgendaContext): string | null {
  const a = agendaBetween(member, addDaysISO(ceseDate, 1), undefined, ctx);
  return a.sessions.length + a.activities.length === 0 ? null : agendaMessage(`${member.names} ${member.lastNameP}`, `después de su cese (${day(ceseDate)})`, a);
}

/** ¿Está ausente en algún momento del rango? Para marcar al personal en las listas de responsables. */
export const absentBetween = (staffId: string, from: string, to: string | undefined, contracts: Contract[]): Absence | undefined =>
  absencesOf(staffId, contracts).find(a => overlaps(a, from, to));
