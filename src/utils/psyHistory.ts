/**
 * Historial de reprogramaciones y cancelaciones de Psicopedagogía (funciones puras).
 *
 * Todo cambio de una asesoría deja un evento: qué pasó, de qué a qué, quién lo hizo en el sistema, quién lo pidió
 * (el alumno o su titular, o la institución) y por qué. Los eventos se generan comparando la asesoría antes y después
 * (`buildScheduleEvents`), así ninguna pantalla puede olvidarse de registrarlos.
 *
 * Quién lo pidió decide la regla de las 24 horas: el alumno o su titular solo puede cambiar con 24 horas de anticipación;
 * la institución puede hacerlo antes (con permiso y motivo), porque el cambio no depende del alumno.
 */
import type { ChangeInitiator, ChangeMeta, PsyEvent, PsyEventType, Schedule } from '../context/DataContext';
import { longDayLabel } from './schedule';

export const MIN_DETAIL = 5;

export interface ReasonOption {
  reason: string;
  initiator: ChangeInitiator;
  /** Exige explicar con detalle. */
  needsDetail?: boolean;
  /** Solo al cancelar. */
  cancelOnly?: boolean;
}

export const CHANGE_REASONS: ReasonOption[] = [
  { reason: 'El alumno o su titular avisó con anticipación', initiator: 'Alumno o titular' },
  { reason: 'Enfermedad del alumno', initiator: 'Alumno o titular' },
  { reason: 'Cruce con el colegio, el trabajo o un viaje', initiator: 'Alumno o titular' },
  { reason: 'El alumno dejará de asistir', initiator: 'Alumno o titular', cancelOnly: true },
  { reason: 'Reserva duplicada o hecha por error', initiator: 'Institución', cancelOnly: true },
  { reason: 'Institución: personal no disponible', initiator: 'Institución' },
  { reason: 'Institución: feriado o cierre de la sede', initiator: 'Institución' },
  { reason: 'Institución: cruce con una actividad o evento', initiator: 'Institución' },
  { reason: 'Institución: matrícula sin verificar (sin materiales)', initiator: 'Institución' },
  { reason: 'Institución: otro motivo', initiator: 'Institución', needsDetail: true },
];

export type ChangeAction = 'cancelar' | 'reprogramar';

export const reasonsFor = (kind: ChangeAction): ReasonOption[] => CHANGE_REASONS.filter(r => kind === 'cancelar' || !r.cancelOnly);
export const reasonOption = (reason: string): ReasonOption | undefined => CHANGE_REASONS.find(r => r.reason === reason);
export const initiatorOfReason = (reason: string): ChangeInitiator | undefined => reasonOption(reason)?.initiator;
export const MATERIALS_REASON = 'Institución: matrícula sin verificar (sin materiales)';

export interface ChangeRule {
  /** Faltan 24 horas o más para la asesoría. */
  withNotice: boolean;
  /** El usuario puede cambiar con menos de 24 horas en nombre de la institución. */
  canInstitutional: boolean;
  /** Es una primera asesoría cuya matrícula no está verificada. */
  materialsMissing?: boolean;
}

/** Motivo de una cancelación o reprogramación: lo exige el sistema y respeta la regla de las 24 horas. */
export function validateChangeMeta(kind: ChangeAction, meta: Partial<ChangeMeta> | undefined, rule: ChangeRule): string[] {
  const e: string[] = [];
  const option = meta?.reason ? reasonOption(meta.reason) : undefined;
  if (!option || (kind === 'reprogramar' && option.cancelOnly)) { e.push('Seleccione el motivo.'); return e; }
  if (option.needsDetail && (meta?.detail ?? '').trim().length < MIN_DETAIL) e.push('Explique brevemente el motivo: queda en el historial.');
  if (option.initiator === 'Alumno o titular' && !rule.withNotice) {
    e.push('Con menos de 24 horas el alumno o su titular ya no puede cambiar la asesoría: si la institución decide el cambio, elija un motivo de la institución.');
  }
  if (option.initiator === 'Institución' && !rule.withNotice && !rule.canInstitutional && !rule.materialsMissing) {
    e.push('Su rol no puede cambiar una asesoría con menos de 24 horas de anticipación.');
  }
  if (rule.materialsMissing && option.reason !== MATERIALS_REASON && option.initiator === 'Alumno o titular') {
    e.push('La matrícula aún no está verificada: el cambio es de la institución (sin materiales).');
  }
  return e;
}

const place = (s: Pick<Schedule, 'date' | 'time' | 'responsible'>) => ({ date: s.date, time: s.time, responsible: s.responsible });
const ACTIVE = ['Reservado', 'Reprogramado', 'Asistió'];

/**
 * Eventos que produce el paso de `prev` a `next` (`prev` vacío = reserva nueva). Una cancelación o una reprogramación
 * lleva el motivo y quién la pidió.
 */
export function buildScheduleEvents(
  prev: Schedule | undefined,
  next: Schedule,
  meta: Partial<ChangeMeta> | undefined,
  by: string,
  at: string,
  nextId: () => string
): PsyEvent[] {
  const base = { at, by, subject: 'asesoria' as const, refId: next.id, studentId: next.studentId };
  const make = (type: PsyEventType, extra: Partial<PsyEvent> = {}): PsyEvent => ({ id: nextId(), ...base, type, ...extra });
  const reasonInfo = meta?.reason ? { reason: meta.reason, detail: meta.detail?.trim() || undefined, initiator: initiatorOfReason(meta.reason) } : {};

  if (!prev) return [make('Reservada', { to: place(next) })];
  const out: PsyEvent[] = [];
  const wasActive = ACTIVE.includes(prev.status);
  if (next.status === 'Cancelado' && prev.status !== 'Cancelado') {
    out.push(make('Cancelada', { from: place(prev), ...reasonInfo }));
  } else if (next.status !== 'Cancelado' && (prev.date !== next.date || prev.time !== next.time || prev.responsible.trim() !== next.responsible.trim())) {
    // Una asesoría cancelada o con falta que se vuelve a programar también cuenta como reprogramación
    out.push(make('Reprogramada', { from: place(prev), to: place(next), ...reasonInfo }));
  }
  if (next.status === 'Asistió' && prev.status !== 'Asistió') out.push(make('Asistió'));
  if (next.status === 'Faltó' && prev.status !== 'Faltó' && wasActive) out.push(make('Faltó'));
  return out;
}

// ---------------------------------------------------------------- Consultas

export const historyOf = (events: PsyEvent[], subject: PsyEvent['subject'], refId: string): PsyEvent[] =>
  events.filter(e => e.subject === subject && e.refId === refId).sort((a, b) => a.at.localeCompare(b.at));

export const rescheduleCount = (events: PsyEvent[], scheduleId: string): number =>
  events.filter(e => e.subject === 'asesoria' && e.refId === scheduleId && e.type === 'Reprogramada').length;

/** La última cancelación de la asesoría (quién y por qué). */
export const cancellationOf = (events: PsyEvent[], scheduleId: string): PsyEvent | undefined =>
  historyOf(events, 'asesoria', scheduleId).filter(e => e.type === 'Cancelada').pop();

const where = (p: NonNullable<PsyEvent['from']>) => `${longDayLabel(p.date)} ${p.time}`;

/** Una línea para mostrar el evento: «Reprogramada: 23 de octubre 16:00 → 26 de octubre 17:00». */
export function describeEvent(e: PsyEvent): string {
  if (e.type === 'Reprogramada' && e.from && e.to) {
    const moved = e.from.date !== e.to.date || e.from.time !== e.to.time;
    const lead = e.from.responsible.trim() !== e.to.responsible.trim() ? ` · responsable: ${e.from.responsible || '—'} → ${e.to.responsible || '—'}` : '';
    return `Reprogramada${moved ? `: ${where(e.from)} → ${where(e.to)}` : ''}${lead}`;
  }
  if (e.type === 'Cancelada' && e.from) return `Cancelada (era ${where(e.from)})`;
  if (e.type === 'Reservada' && e.to) return `Reservada para ${where(e.to)}`;
  return e.type;
}
