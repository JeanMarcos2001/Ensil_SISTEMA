/**
 * Auditoría: un solo registro de «quién hizo qué y cuándo» (funciones puras).
 *
 * No hay una tabla de auditoría aparte: cada módulo ya guarda la constancia de sus acciones con control (quién, cuándo, por qué).
 * Aquí se **reúnen** en una sola línea de tiempo, para que Sistema → Auditoría y Reportes → Auditoría respondan en un solo lugar.
 * Como se calcula de lo que ya existe, nunca queda desfasada de las pantallas de origen.
 *
 * Fuentes: correcciones y solicitudes de cambio de matrícula (caída, reactivación, cambio de programa, traslado), contrato y ficha,
 * pagos reversados y notas de crédito, movimientos reversados y depósitos de Caja y Caja chica, cierres y reaperturas, agenda de
 * Psicopedagogía, planilla, contratos, recordatorios (cobranza y Psicopedagogía) y ajustes y mermas de stock.
 */
import type {
  Adjustment, ChangeRequest, CashClosure, CashMovement, Contract, CreditNote, DropRequest, Enrollment, EnrollmentChange, Payment, PayrollRun,
  PettyCashMovement, PsyEvent, PsyReminderLog,
} from '../context/DataContext';
import type { ReminderLog } from './collections';
import { dayOf, inRange, timeOf, type DateRange } from './reportCommon';

export const AUDIT_MODULES = ['Matrículas', 'Pagos', 'Caja', 'Caja chica', 'Planilla', 'Contratos', 'Psicopedagogía', 'Cobranza', 'Logística'] as const;
export type AuditModule = (typeof AUDIT_MODULES)[number];

export interface AuditEntry {
  id: string;
  /** Fecha y hora (ISO) o solo fecha, según lo que guardó el módulo. */
  at: string;
  ts: number;
  module: AuditModule;
  action: string;
  detail: string;
  by: string;
  ref?: string;
  /** Pantalla donde se ve el detalle. */
  link?: string;
}

export interface AuditContext {
  enrollmentChanges: EnrollmentChange[];
  changeRequests: ChangeRequest[];
  dropRequests: DropRequest[];
  enrollments: Enrollment[];
  payments: Payment[];
  creditNotes: CreditNote[];
  cashMovements: CashMovement[];
  pettyCashMovements: PettyCashMovement[];
  cashClosures: CashClosure[];
  psyEvents: PsyEvent[];
  psyReminderLogs: PsyReminderLog[];
  reminderLogs: ReminderLog[];
  payrollRuns: PayrollRun[];
  contracts: Contract[];
  adjustments: Adjustment[];
  staffName: (id: string) => string;
  studentName: (id: string) => string;
}

const money = (n: number, cur: string) => `${cur === 'USD' ? 'USD' : 'S/'} ${n.toFixed(2)}`;
const trim = (t: string | undefined, n = 140) => (t && t.length > n ? `${t.slice(0, n - 1)}…` : t ?? '');

export function buildAudit(c: AuditContext): AuditEntry[] {
  const out: Omit<AuditEntry, 'ts'>[] = [];
  const push = (e: Omit<AuditEntry, 'ts'>) => { if (e.at) out.push(e); };
  const mat = (id: string) => `/operacion/matriculas?ficha=${id}`;
  const studentOfEnrollment = (id: string) => c.enrollments.find(e => e.id === id)?.student ?? '';

  for (const x of c.enrollmentChanges) {
    push({ id: x.id, at: x.at, module: 'Matrículas', action: 'Corrección de datos', detail: `${x.label}: «${x.from}» → «${x.to}». ${x.reason}`, by: x.by, ref: x.enrollmentId, link: mat(x.enrollmentId) });
  }
  for (const r of c.changeRequests) {
    push({ id: `${r.id}-req`, at: r.requestedAt, module: 'Matrículas', action: `Solicitud de ${r.kind.toLowerCase()}`, detail: `${studentOfEnrollment(r.enrollmentId)} · ${r.reason}`, by: r.requestedBy, ref: r.enrollmentId, link: '/sistema/solicitudes-pendientes' });
    if (r.resolvedAt) push({ id: `${r.id}-res`, at: r.resolvedAt, module: 'Matrículas', action: `${r.kind} ${r.status.toLowerCase()}`, detail: trim([r.resolutionNote, ...(r.effects ?? [])].filter(Boolean).join(' · ')), by: r.resolvedBy ?? '', ref: r.enrollmentId, link: mat(r.enrollmentId) });
  }
  for (const d of c.dropRequests) {
    push({ id: `${d.id}-req`, at: d.requestedAt, module: 'Matrículas', action: 'Solicitud de caída', detail: `${studentOfEnrollment(d.enrollmentId)} · ${d.reason}`, by: d.requestedBy, ref: d.enrollmentId, link: '/sistema/solicitudes-pendientes' });
    if (d.resolvedAt) push({ id: `${d.id}-res`, at: d.resolvedAt, module: 'Matrículas', action: `Caída ${d.status.toLowerCase()}`, detail: trim(d.resolutionNote), by: d.resolvedBy ?? '', ref: d.enrollmentId, link: mat(d.enrollmentId) });
  }
  for (const e of c.enrollments) {
    for (const [kind, doc] of [['Contrato', e.documents?.contract], ['Ficha', e.documents?.ficha]] as const) {
      if (!doc) continue;
      push({ id: `${e.id}-${kind}-g`, at: doc.generatedAt, module: 'Matrículas', action: `${kind} generado`, detail: `${doc.number} · versión ${doc.version}`, by: doc.generatedBy, ref: e.id, link: mat(e.id) });
      if (doc.signedAt) push({ id: `${e.id}-${kind}-f`, at: doc.signedAt, module: 'Matrículas', action: `${kind} firmado`, detail: doc.number, by: doc.signedBy ?? '', ref: e.id, link: mat(e.id) });
    }
  }

  for (const p of c.payments) {
    if (p.reversal) push({ id: `${p.id}-rev`, at: p.reversal.at, module: 'Pagos', action: 'Pago reversado', detail: `${p.student} · ${p.receipt} · ${p.reversal.reason}${p.reversal.refunded ? ' · dinero devuelto' : ''}`, by: p.reversal.by, ref: p.id, link: '/operacion/pagos' });
  }
  for (const n of c.creditNotes) {
    push({ id: n.id, at: n.issuedAt, module: 'Pagos', action: n.origin === 'sistema' ? 'Nota de crédito emitida' : 'Nota de crédito registrada', detail: `${n.label} · ${n.studentName} · ${money(n.amount, n.currency)} · ${n.reason}`, by: n.issuedBy, ref: n.paymentId, link: '/operacion/pagos' });
  }

  for (const m of c.cashMovements) {
    if (m.reversal) push({ id: `${m.id}-rev`, at: m.reversal.at, module: 'Caja', action: 'Movimiento reversado', detail: `${m.concept} · ${money(m.amount, m.currency)} · ${m.reversal.reason}`, by: m.reversal.by, ref: m.id, link: '/operacion/caja' });
    if (m.deposit) push({ id: `${m.id}-dep`, at: m.date, module: 'Caja', action: 'Depósito al banco', detail: `Lote ${m.deposit.code} · ${m.deposit.bank} · ${money(m.amount, m.currency)}`, by: m.user, ref: m.id, link: '/operacion/caja' });
  }
  for (const m of c.pettyCashMovements) {
    if (m.reversal) push({ id: `${m.id}-rev`, at: m.reversal.at, module: 'Caja chica', action: 'Movimiento reversado', detail: `${m.concept} · S/ ${m.amount.toFixed(2)} · ${m.reversal.reason}`, by: m.reversal.by, ref: m.id, link: '/operacion/caja-chica' });
  }
  for (const k of c.cashClosures) {
    const module: AuditModule = k.scope === 'caja' ? 'Caja' : 'Caja chica';
    const link = k.scope === 'caja' ? '/operacion/caja' : '/operacion/caja-chica';
    push({ id: `${k.id}-cierre`, at: k.closedAt, module, action: 'Cierre de caja', detail: `${k.currency} al ${k.date} · diferencia ${k.difference.toFixed(2)}${k.note ? ` · ${k.note}` : ''}`, by: k.closedBy, ref: k.id, link });
    if (k.reopenedAt) push({ id: `${k.id}-reapertura`, at: k.reopenedAt, module, action: 'Reapertura de caja', detail: trim(`${k.date} · ${k.reopenReason ?? ''}`), by: k.reopenedBy ?? '', ref: k.id, link: '/sistema/reaperturas' });
  }

  for (const e of c.psyEvents) {
    const who = e.studentId ? c.studentName(e.studentId) : '';
    push({ id: e.id, at: e.at, module: 'Psicopedagogía', action: e.type, detail: trim([who, e.reason, e.detail, e.initiator ? `pidió: ${e.initiator}` : ''].filter(Boolean).join(' · ')), by: e.by, ref: e.refId, link: '/psicopedagogia/programacion' });
  }
  for (const l of c.psyReminderLogs) {
    push({ id: l.id, at: l.at, module: 'Psicopedagogía', action: `Recordatorio ${l.result.toLowerCase()}`, detail: `${l.kind} · ${c.studentName(l.studentId)} · ${l.channel}${l.note ? ` · ${l.note}` : ''}`, by: l.by, ref: l.refId, link: '/psicopedagogia/recordatorios' });
  }
  for (const l of c.reminderLogs) {
    push({ id: l.id, at: l.at, module: 'Cobranza', action: `Recordatorio de cobro ${l.result.toLowerCase()}`, detail: `${l.planId} · ${l.installmentId} · ${l.channel}${l.note ? ` · ${l.note}` : ''}`, by: l.by, ref: l.planId, link: '/operacion/planes-y-cartera' });
  }

  for (const r of c.payrollRuns) {
    for (const [i, ev] of r.events.entries()) push({ id: `${r.id}-${i}`, at: ev.at, module: 'Planilla', action: `Planilla ${ev.action.toLowerCase()}`, detail: trim(`${r.period}${ev.detail ? ` · ${ev.detail}` : ''}`), by: ev.by, ref: r.id, link: '/personas/planilla' });
  }
  for (const k of c.contracts) {
    for (const [i, rev] of (k.revisions ?? []).entries()) {
      push({ id: `${k.id}-rev-${i}`, at: rev.at, module: 'Contratos', action: 'Contrato modificado', detail: trim(`${c.staffName(k.staffId)} · ${rev.changes.map(x => `${x.label}: ${x.from} → ${x.to}`).join('; ')} · ${rev.reason}`), by: rev.by, ref: k.id, link: '/personas/contratos' });
    }
  }
  for (const a of c.adjustments) {
    push({ id: a.id, at: a.date, module: 'Logística', action: a.type, detail: `${a.material} · ${a.branch} · ${a.qty} · ${a.reason}`, by: a.user, ref: a.id, link: '/logistica/ajustes-y-mermas' });
  }

  return out.map(e => ({ ...e, ts: timeOf(e.at) })).sort((a, b) => b.ts - a.ts || a.id.localeCompare(b.id));
}

export interface AuditFilters {
  range: DateRange;
  module: '' | AuditModule;
  user: string;
  text: string;
}

const fold = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function filterAudit(entries: AuditEntry[], f: AuditFilters): AuditEntry[] {
  const q = fold(f.text.trim());
  return entries.filter(e =>
    inRange(dayOf(e.at), f.range) && (!f.module || e.module === f.module) && (!f.user || e.by === f.user) &&
    (!q || fold(`${e.action} ${e.detail} ${e.ref ?? ''} ${e.by}`).includes(q))
  );
}

/** Personas que figuran en el registro (para el filtro de usuario). */
export const auditUsers = (entries: AuditEntry[]): string[] => [...new Set(entries.map(e => e.by).filter(Boolean))].sort((a, b) => a.localeCompare(b));
