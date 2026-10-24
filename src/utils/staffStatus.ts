/**
 * Inactivar y reactivar personal (funciones puras).
 *
 * Inactivar a un trabajador NO borra su ficha: queda en el historial con fecha y motivo. Para poder inactivarlo no puede
 * tener un contrato vigente (primero se cierra, que es el acto laboral) ni asesorías futuras a su nombre (primero se
 * reasignan). Al inactivarlo se cierran sus asignaciones activas, por lo que deja de aparecer como responsable de entrevistas,
 * asesorías y verificaciones. Reactivarlo solo devuelve el estado «Activo»: no restituye asignaciones ni contrato (se
 * registran nuevos).
 */
import type { Assignment, Contract, Schedule, Staff } from '../context/DataContext';
import { activeOf, futureSessionsOf, MIN_REASON } from './assignments';
import { futureActivitiesOf } from './psyActivities';
import type { FlatActivity } from './schedule';
import { contractStatus } from './payroll';

export const INACTIVE = 'Inactivo';
export const ACTIVE_STAFF = 'Activo';

export const INACTIVATION_REASONS = ['Renuncia', 'Fin de contrato', 'Cese por la empresa', 'Licencia prolongada', 'Otro'];

export interface InactivationContext {
  contracts: Contract[];
  assignments: Assignment[];
  schedules: Schedule[];
  /** Actividades especiales (para ver las que tiene a su cargo). */
  activities?: FlatActivity[];
  today: string;
}

export interface InactivationCheck {
  /** Contrato vigente que impide inactivar. */
  contract?: Contract;
  /** Asesorías futuras a su nombre que impiden inactivar. */
  sessions: Schedule[];
  /** Actividades especiales futuras a su cargo que impiden inactivar. */
  activities: FlatActivity[];
  /** Asignaciones activas que se cerrarán. */
  assignmentsToClose: Assignment[];
  blocked: boolean;
}

export function inactivationCheck(member: Staff, ctx: InactivationContext): InactivationCheck {
  const contract = ctx.contracts.find(c => c.staffId === member.id && contractStatus(c, ctx.today) === 'Vigente');
  const sessions = futureSessionsOf(member, ctx.schedules, ctx.today);
  const activities = futureActivitiesOf(member, ctx.activities ?? [], ctx.today);
  return { contract, sessions, activities, assignmentsToClose: activeOf(member.id, ctx.assignments), blocked: !!contract || sessions.length > 0 || activities.length > 0 };
}

export function validateInactivation(member: Staff, reason: string, detail: string, date: string, ctx: InactivationContext): string[] {
  const e: string[] = [];
  if (member.status !== ACTIVE_STAFF) e.push('El trabajador ya está inactivo.');
  if (!INACTIVATION_REASONS.includes(reason)) e.push('Seleccione el motivo.');
  if (detail.trim().length < MIN_REASON) e.push('Explique brevemente el motivo: queda en el historial.');
  if (!date) e.push('Indique la fecha de baja.');
  else if (date > ctx.today) e.push('La fecha de baja no puede ser futura.');
  const check = inactivationCheck(member, ctx);
  if (check.contract) e.push('Tiene un contrato vigente: ciérrelo primero en Personas → Contratos.');
  if (check.sessions.length > 0) e.push(`Tiene ${check.sessions.length} asesoría(s) futura(s) a su nombre: reasígnelas primero en Psicopedagogía → Programación.`);
  if (check.activities.length > 0) e.push(`Tiene ${check.activities.length} actividad(es) especial(es) a su cargo: asigne otro responsable primero en Psicopedagogía → Programación → Actividades especiales.`);
  return e;
}

export function validateReactivation(member: Staff, detail: string): string[] {
  const e: string[] = [];
  if (member.status === ACTIVE_STAFF) e.push('El trabajador ya está activo.');
  if (detail.trim().length < MIN_REASON) e.push('Indique el motivo de la reactivación.');
  return e;
}

/** Texto del historial de estado de un trabajador (último cambio). */
export const statusNote = (m: Pick<Staff, 'status' | 'statusDate' | 'statusReason'>): string =>
  m.statusDate ? `${m.status === INACTIVE ? 'Baja' : 'Reactivación'} el ${m.statusDate}${m.statusReason ? ` · ${m.statusReason}` : ''}` : '';
