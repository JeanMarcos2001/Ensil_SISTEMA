/**
 * Núcleo del asistente «Registrar nueva matrícula» (funciones puras, sin React).
 *
 *  - `quoteEnrollment`: tarifa, precio, promociones y unidades de pago de cada alumno.
 *  - `validate*`: reglas por paso.
 *  - `buildEnrollmentBatch`: arma TODO lo que se guarda (matrículas, planes, pagos, caja, grupos) de una sola vez
 *    y sin tocar el estado; si algo falla no se crea nada (guardado atómico).
 */
import type {
  Assignment,
  Branch,
  CashMovement,
  ClassSchedule,
  Counseling,
  Enrollment,
  Guardian,
  LeadSource,
  Level,
  Payment,
  PaymentPart,
  PaymentType,
  Plan,
  Program,
  Promotion,
  PromotionGroup,
  ScheduleMode,
  Staff,
  Student,
  Tariff,
} from '../context/DataContext';
import { nextNumericId, nextSequentialId } from './ids';
import { findPromotionOffers, buildPromotionGroups, type PromoStudent, type PromotionOffer } from './promotions';
import {
  buildPlanInstallments,
  findTariff,
  formatDisplayDate,
  getAvailablePaymentTypes,
  resolveScheduleMode,
  roundMoney,
  sumPaymentParts,
  tariffTotal,
} from './tariffs';

// ---------------------------------------------------------------- Borrador

export type EnrollmentMode = 'independiente' | 'apoderado';
export type Situation = 'estudiando' | 'trabajando' | 'ambos' | 'ninguna';

export const SITUATIONS: { id: Situation; label: string }[] = [
  { id: 'estudiando', label: 'Estudiando' },
  { id: 'trabajando', label: 'Trabajando' },
  { id: 'ambos', label: 'Estudiando y trabajando' },
  { id: 'ninguna', label: 'Ninguna por el momento' },
];
export const INSTITUTION_TYPES = ['Colegio', 'Instituto', 'Universidad', 'Otro'] as const;
export const SCHOOL_GRADES = [
  'Inicial 3 años', 'Inicial 4 años', 'Inicial 5 años',
  '1° Primaria', '2° Primaria', '3° Primaria', '4° Primaria', '5° Primaria', '6° Primaria',
  '1° Secundaria', '2° Secundaria', '3° Secundaria', '4° Secundaria', '5° Secundaria',
];

export const studies = (s: { situation: Situation | '' }) => s.situation === 'estudiando' || s.situation === 'ambos';
export const works = (s: { situation: Situation | '' }) => s.situation === 'trabajando' || s.situation === 'ambos';

/** Datos de situación listos para guardar: solo se conserva lo que corresponde a la situación elegida. */
export function situationData(ds: { situation: Situation | ''; institutionType: string; school: string; grade: string; occupation: string; workplace: string }) {
  return {
    occupationStatus: (ds.situation || undefined) as Situation | undefined,
    institutionType: studies(ds) ? ds.institutionType || undefined : undefined,
    colegio: studies(ds) ? ds.school.trim() || undefined : undefined,
    grado: studies(ds) ? ds.grade.trim() || undefined : undefined,
    occupation: works(ds) ? ds.occupation.trim() || undefined : undefined,
    workplace: works(ds) ? ds.workplace.trim() || undefined : undefined,
  };
}
export type DocType = 'DNI' | 'CE' | 'Pasaporte';

export interface DraftPerson {
  /** Si la persona ya existe en el sistema, su id (no se duplica). */
  existingId?: string;
  /** Cómo se identifica a la persona en la tarjeta: ya registrada o nueva (por defecto, nueva). */
  source?: 'nuevo' | 'existente';
  docType: DocType;
  docNumber: string;
  names: string;
  lastNameP: string;
  lastNameM: string;
  birthDate: string;
  phone: string;
  email: string;
  address: string;
  civilStatus: string;
}

export interface DraftStudent {
  /** Clave estable dentro del registro (no es el correlativo definitivo). */
  key: string;
  person: DraftPerson;
  /** Parentesco con el titular; vacío si la matrícula es independiente. */
  relationship: string;
  /** ¿Estudia, trabaja, ambos o ninguna? Define qué datos se piden. */
  situation: Situation | '';
  institutionType: string;
  /** Institución educativa (colegio, instituto, universidad…). */
  school: string;
  /** Grado (colegio) o ciclo (instituto/universidad). */
  grade: string;
  occupation: string;
  workplace: string;
  programId: string;
  levelId: string;
  paymentTypeId: string;
  schedule: string;
  startDate: string;
  /** Fecha y hora específicas de la primera asesoría. */
  counselingDate: string;
  counselingTime: string;
  /** Fechas acordadas (ISO) para cronogramas de fechas manuales (Contado en 2 partes). */
  dueDates: string[];
}

export interface EnrollmentDraft {
  context: {
    branchId: string;
    date: string;
    leadSourceId: string;
    interviewerId: string;
    observation: string;
  };
  mode: EnrollmentMode;
  /** Titulares: el primero es el principal. En modo independiente solo existe la persona del Alumno 1. */
  holders: DraftPerson[];
  students: DraftStudent[];
  /** Promoción elegida y los grupos de alumnos (por clave) que la usan. */
  promotion: { promotionId: string; groups: string[][] } | null;
  /** Partes de pago por unidad de pago (grupo promocional o alumno contado). */
  payments: Record<string, PaymentPart[]>;
}

export const emptyPerson = (): DraftPerson => ({
  docType: 'DNI', docNumber: '', names: '', lastNameP: '', lastNameM: '',
  birthDate: '', phone: '', email: '', address: '', civilStatus: '',
});

let keyCounter = 0;
export const newStudentKey = () => `S${Date.now().toString(36)}${(keyCounter++).toString(36)}`;

export const emptyStudent = (): DraftStudent => ({
  key: newStudentKey(), person: emptyPerson(), relationship: '',
  situation: '', institutionType: '', school: '', grade: '', occupation: '', workplace: '',
  programId: '', levelId: '', paymentTypeId: '', schedule: '', startDate: '', counselingDate: '', counselingTime: '', dueDates: [],
});

export const emptyDraft = (today: string, branchId = ''): EnrollmentDraft => ({
  context: { branchId, date: today, leadSourceId: '', interviewerId: '', observation: '' },
  mode: 'apoderado',
  holders: [emptyPerson()],
  students: [emptyStudent()],
  promotion: null,
  payments: {},
});

/** Persona efectiva de un alumno. En modo independiente el Alumno 1 ES el titular (no se duplica). */
export function studentPerson(draft: EnrollmentDraft, index: number): DraftPerson {
  return index === 0 && draft.mode === 'independiente' ? draft.holders[0] : draft.students[index].person;
}

// ---------------------------------------------------------------- Personas

export const fullName = (p: Pick<DraftPerson, 'names' | 'lastNameP' | 'lastNameM'>) =>
  [p.names, p.lastNameP, p.lastNameM].map(x => x.trim()).filter(Boolean).join(' ');

/** Edad en años cumplidos a una fecha (ISO). `null` si la fecha no es válida. */
export function ageOn(birthDate: string, onDate: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return null;
  const [by, bm, bd] = birthDate.split('-').map(Number);
  const [y, m, d] = onDate.split('-').map(Number);
  let age = y - by;
  if (m < bm || (m === bm && d < bd)) age--;
  return age;
}

export function validateDocument(type: DocType, number: string): string | null {
  const n = number.trim();
  if (!n) return 'El número de documento es obligatorio.';
  if (type === 'DNI' && !/^\d{8}$/.test(n)) return 'El DNI debe tener 8 dígitos.';
  if (type !== 'DNI' && !/^[A-Za-z0-9]{6,12}$/.test(n)) return 'El documento debe tener entre 6 y 12 caracteres alfanuméricos.';
  return null;
}

export interface PersonRules {
  needsEmail?: boolean;
  needsAddress?: boolean;
  needsCivilStatus?: boolean;
  needsPhone?: boolean;
  needsBirthDate?: boolean;
}

export function validatePerson(p: DraftPerson, label: string, today: string, rules: PersonRules = {}): string[] {
  const errors: string[] = [];
  if (p.source === 'existente' && !p.existingId) {
    errors.push(`${label}: seleccione a la persona ya registrada o cambie a «Nuevo».`);
    return errors;
  }
  if (p.existingId) return errors; // persona ya registrada
  const doc = validateDocument(p.docType, p.docNumber);
  if (doc) errors.push(`${label}: ${doc}`);
  if (!p.names.trim() || !p.lastNameP.trim()) errors.push(`${label}: nombres y apellido paterno son obligatorios.`);
  if (rules.needsBirthDate !== false) {
    if (!p.birthDate) errors.push(`${label}: la fecha de nacimiento es obligatoria.`);
    else if (p.birthDate > today) errors.push(`${label}: la fecha de nacimiento no puede ser futura.`);
  }
  if (rules.needsPhone && !/^\d{9}$/.test(p.phone.trim())) errors.push(`${label}: el teléfono debe tener 9 dígitos.`);
  if (p.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p.email.trim())) errors.push(`${label}: el correo no es válido.`);
  if (rules.needsAddress && !p.address.trim()) errors.push(`${label}: la dirección es obligatoria.`);
  if (rules.needsCivilStatus && !p.civilStatus) errors.push(`${label}: el estado civil es obligatorio.`);
  return errors;
}

// ---------------------------------------------------------------- Catálogos

export interface EnrollmentCatalogs {
  branches: Branch[];
  leadSources: LeadSource[];
  staff: Staff[];
  assignments: Assignment[];
  programs: Program[];
  levels: Level[];
  tariffs: Tariff[];
  paymentTypes: PaymentType[];
  promotions: Promotion[];
  guardians: Guardian[];
  students: Student[];
  classSchedules: ClassSchedule[];
}

/** Área cuyo personal puede ser responsable de la entrevista. */
export const INTERVIEWER_AREA = 'Psicopedagogía';

const normalizeText = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

export interface InterviewerOption {
  staff: Staff;
  /** Sede de su asignación de Psicopedagogía (la de la sede de la matrícula si tiene una allí). */
  branchName: string;
}

/**
 * Responsables de la entrevista: TODO el personal activo con una asignación activa en el área de
 * Psicopedagogía, de cualquier sede. Primero aparecen los de la sede de la matrícula y luego el resto.
 */
export function getInterviewerOptions(
  c: Pick<EnrollmentCatalogs, 'staff' | 'assignments' | 'branches'>,
  branchId: string
): InterviewerOption[] {
  const currentBranch = c.branches.find(b => b.id === branchId)?.name;
  const area = normalizeText(INTERVIEWER_AREA);
  const options: InterviewerOption[] = [];

  c.staff
    .filter(s => s.status === 'Activo')
    .forEach(s => {
      const own = c.assignments.filter(
        a => a.staffId === s.id && a.status === 'Activa' && normalizeText(a.area) === area
      );
      if (own.length === 0) return;
      const preferred = own.find(a => a.branch === currentBranch) ?? own.find(a => a.isMain) ?? own[0];
      options.push({ staff: s, branchName: preferred.branch });
    });

  return options.sort((a, b) => {
    const aHere = a.branchName === currentBranch ? 0 : 1;
    const bHere = b.branchName === currentBranch ? 0 : 1;
    return aHere - bHere || a.staff.lastNameP.localeCompare(b.staff.lastNameP) || a.staff.names.localeCompare(b.staff.names);
  });
}

export function getInterviewers(c: Pick<EnrollmentCatalogs, 'staff' | 'assignments' | 'branches'>, branchId: string): Staff[] {
  return getInterviewerOptions(c, branchId).map(o => o.staff);
}

/** Horarios de clases activos y disponibles en la sede (configurados en Configuración → Horarios de clases). */
export function getAvailableSchedules(schedules: ClassSchedule[], branchId: string): ClassSchedule[] {
  return schedules.filter(h => h.status === 'Activo' && (h.allBranches || h.branchIds.includes(branchId)));
}

/** Programas activos y habilitados para la sede. */
export function getAvailablePrograms(programs: Program[], branchId: string): Program[] {
  return programs.filter(p => p.status === 'Activo' && (p.allBranches || (p.enabledBranches ?? []).includes(branchId)));
}

/** Niveles activos del programa, en orden. Vacío si el programa no usa niveles. */
export function getProgramLevels(levels: Level[], program: Program | undefined): Level[] {
  if (!program || !program.hasLevels) return [];
  return levels.filter(l => l.programId === program.id && l.status === 'Activo').sort((a, b) => a.order - b.order);
}

// ---------------------------------------------------------------- Cotización

export interface StudentQuote {
  key: string;
  index: number;
  program?: Program;
  level?: Level;
  paymentType?: PaymentType;
  mode?: ScheduleMode;
  tariff?: Tariff;
  /** Precio del tarifario (USD). */
  listPrice: number;
  /** Costo asignado (USD): el del tarifario o la parte del total promocional. */
  assignedPrice: number;
  promotionGroupIndex?: number;
  issues: string[];
}

export interface PaymentUnit {
  key: string;
  kind: 'group' | 'single';
  label: string;
  studentKeys: string[];
  required: number; // USD
  promotionId?: string;
  groupIndex?: number;
}

export interface QuotedGroup {
  promotionId: string;
  studentKeys: string[];
  totalPrice: number;
  allocations: { studentKey: string; amount: number }[];
}

export interface EnrollmentQuote {
  students: StudentQuote[];
  offers: PromotionOffer[];
  groups: QuotedGroup[];
  units: PaymentUnit[];
  warnings: string[];
}

/** Alumnos que participan en el motor de promociones (pago inmediato con tarifa vigente). */
export function promoStudentsFromQuote(students: StudentQuote[]): PromoStudent[] {
  return students
    .filter(q => q.tariff && q.mode === 'inmediato' && q.program)
    .map(q => ({
      key: q.key, programId: q.program!.id, levelId: q.level?.id,
      paymentTypeId: q.paymentType!.id, tariffId: q.tariff!.id,
      basePrice: q.listPrice, currency: q.tariff!.currency,
    }));
}

/**
 * Calcula tarifa, precio y promoción de cada alumno.
 * Las promociones solo se evalúan para alumnos con pago inmediato (Contado): un grupo promocional realiza un único pago.
 */
export function quoteEnrollment(draft: EnrollmentDraft, c: EnrollmentCatalogs): EnrollmentQuote {
  const ctx = { programId: '', branchId: draft.context.branchId, date: draft.context.date };
  const warnings: string[] = [];

  const students: StudentQuote[] = draft.students.map((s, index) => {
    const issues: string[] = [];
    const program = c.programs.find(p => p.id === s.programId);
    const level = c.levels.find(l => l.id === s.levelId);
    const paymentType = c.paymentTypes.find(p => p.id === s.paymentTypeId);
    const tariff = program && paymentType
      ? findTariff(c.tariffs, { ...ctx, programId: program.id, levelId: s.levelId || undefined }, paymentType.id)
      : undefined;
    if (program && paymentType && !tariff) {
      issues.push('No hay un tarifario vigente para este programa, nivel y tipo de pago.');
    }
    const listPrice = tariff ? tariffTotal(tariff) : 0;
    return {
      key: s.key, index, program, level, paymentType,
      mode: paymentType ? resolveScheduleMode(paymentType) : undefined,
      tariff, listPrice, assignedPrice: listPrice, issues,
    };
  });

  // Promociones: solo alumnos con pago inmediato y tarifa vigente
  const promoStudents = promoStudentsFromQuote(students);
  const promoCtx = { branchId: draft.context.branchId, date: draft.context.date };
  const offers = findPromotionOffers(c.promotions, promoStudents, promoCtx);

  const groups: QuotedGroup[] = [];
  if (draft.promotion && draft.promotion.groups.length > 0) {
    const promo = c.promotions.find(p => p.id === draft.promotion!.promotionId);
    if (!promo) {
      warnings.push('La promoción seleccionada ya no existe.');
    } else {
      const built = buildPromotionGroups(promo, draft.promotion.groups, promoStudents, promoCtx);
      if (!built.ok) {
        warnings.push(`La promoción seleccionada ya no es válida: ${built.error}`);
      } else {
        built.groups!.forEach((g, gi) => {
          groups.push({
            promotionId: g.promotionId,
            studentKeys: g.allocations.map(a => a.studentKey),
            totalPrice: g.totalPrice,
            allocations: g.allocations,
          });
          g.allocations.forEach(a => {
            const q = students.find(x => x.key === a.studentKey)!;
            q.assignedPrice = a.amount;
            q.promotionGroupIndex = gi;
          });
        });
      }
    }
  }

  // Unidades de pago
  const units: PaymentUnit[] = [];
  groups.forEach((g, gi) => {
    const promo = c.promotions.find(p => p.id === g.promotionId)!;
    units.push({
      key: `group-${gi}`, kind: 'group', groupIndex: gi, promotionId: g.promotionId,
      label: `${promo.name} (${g.studentKeys.length} alumnos)`,
      studentKeys: g.studentKeys, required: g.totalPrice,
    });
  });
  students.forEach(q => {
    if (q.mode === 'inmediato' && q.tariff && q.promotionGroupIndex === undefined) {
      units.push({
        key: `single-${q.key}`, kind: 'single', label: `Contado — alumno ${q.index + 1}`,
        studentKeys: [q.key], required: q.assignedPrice,
      });
    }
  });

  return { students, offers, groups, units, warnings };
}

// ---------------------------------------------------------------- Validaciones por paso

export function validateContext(draft: EnrollmentDraft, c: EnrollmentCatalogs, today: string): string[] {
  const e: string[] = [];
  const x = draft.context;
  const branch = c.branches.find(b => b.id === x.branchId);
  if (!branch) e.push('Seleccione la sede.');
  else if (branch.status !== 'Activo') e.push('La sede seleccionada está inactiva.');
  if (!x.date) e.push('La fecha de matrícula es obligatoria.');
  else if (x.date > today) e.push('La fecha de matrícula no puede ser futura.');
  const lead = c.leadSources.find(l => l.id === x.leadSourceId);
  if (!lead) e.push('Seleccione el origen del contacto.');
  else if (lead.status !== 'active') e.push('El origen seleccionado está inactivo.');
  if (!x.interviewerId) e.push('Seleccione al responsable de la entrevista.');
  else if (!getInterviewers(c, x.branchId).some(s => s.id === x.interviewerId)) {
    e.push('El responsable debe ser personal activo asignado a Psicopedagogía.');
  }
  return e;
}

export function validateHolders(draft: EnrollmentDraft, c: EnrollmentCatalogs, today: string): string[] {
  const e: string[] = [];
  if (draft.mode === 'independiente') {
    // La persona se completa una vez; se valida como alumno.
    e.push(...validatePerson(draft.holders[0], 'Persona', today, { needsPhone: true }));
  } else {
    draft.holders.forEach((h, i) => {
      const label = i === 0 ? 'Titular principal' : i === 1 ? 'Titular secundario' : `Titular ${i + 1}`;
      e.push(...validatePerson(h, label, today, i === 0
        ? { needsPhone: true, needsAddress: true, needsCivilStatus: true }
        : { needsPhone: true }));
    });
  }
  // Documentos duplicados dentro del registro
  const docs = draft.holders.map(h => `${h.docType}-${h.docNumber.trim()}`).filter(d => !d.endsWith('-'));
  if (new Set(docs).size !== docs.length) e.push('Hay titulares con el mismo documento.');
  // Documento nuevo que ya existe en el sistema
  draft.holders.forEach((h, i) => {
    if (!h.existingId && h.docNumber.trim() && c.guardians.some(g => g.doc === h.docNumber.trim())) {
      e.push(`Titular ${i + 1}: el documento ${h.docNumber} ya está registrado. Selecciónelo como titular existente.`);
    }
  });
  return e;
}

export function validateStudents(draft: EnrollmentDraft, c: EnrollmentCatalogs, today: string): string[] {
  const e: string[] = [];
  if (draft.students.length === 0) e.push('Agregue al menos un alumno.');
  draft.students.forEach((_, i) => {
    const p = studentPerson(draft, i);
    const label = `Alumno ${i + 1}`;
    if (!(i === 0 && draft.mode === 'independiente')) {
      e.push(...validatePerson(p, label, today));
    }
    if (draft.mode === 'apoderado' && !draft.students[i].relationship) {
      e.push(`${label}: indique el parentesco con el titular.`);
    }
    const ds = draft.students[i];
    if (!ds.situation) {
      e.push(`${label}: indique si está estudiando, trabajando o ninguna.`);
    } else {
      if (studies(ds)) {
        if (!ds.institutionType) e.push(`${label}: seleccione el tipo de institución.`);
        if (!ds.school.trim()) e.push(`${label}: indique la institución donde estudia.`);
        if (!ds.grade.trim()) e.push(`${label}: indique el ${ds.institutionType === 'Colegio' ? 'grado' : 'ciclo'}.`);
      }
      if (works(ds) && !ds.occupation.trim()) e.push(`${label}: indique la ocupación.`);
    }
    if (!p.existingId && p.docNumber.trim() && c.students.some(s => s.doc === p.docNumber.trim())) {
      e.push(`${label}: el documento ${p.docNumber} ya está registrado. Selecciónelo como alumno existente.`);
    }
  });
  const docs = draft.students.map((_, i) => studentPerson(draft, i)).map(p => `${p.docType}-${p.docNumber.trim()}`).filter(d => !d.endsWith('-'));
  if (new Set(docs).size !== docs.length) e.push('Hay alumnos con el mismo documento.');
  return e;
}

export function validateProgram(draft: EnrollmentDraft, c: EnrollmentCatalogs, quote: EnrollmentQuote): string[] {
  const e: string[] = [];
  draft.students.forEach((s, i) => {
    const q = quote.students[i];
    const label = `Alumno ${i + 1}`;
    const program = c.programs.find(p => p.id === s.programId);
    if (!program) { e.push(`${label}: seleccione el programa.`); return; }
    if (!getAvailablePrograms(c.programs, draft.context.branchId).some(p => p.id === program.id)) {
      e.push(`${label}: el programa no está disponible en la sede.`);
    }
    if (program.hasLevels) {
      if (!s.levelId) e.push(`${label}: seleccione el nivel.`);
      else if (!getProgramLevels(c.levels, program).some(l => l.id === s.levelId)) e.push(`${label}: el nivel no es válido para el programa.`);
    }
    if (!s.counselingDate) e.push(`${label}: indique la fecha de la primera asesoría.`);
    else if (s.counselingDate < draft.context.date) e.push(`${label}: la primera asesoría no puede ser anterior a la fecha de matrícula.`);
    if (!s.counselingTime) e.push(`${label}: indique la hora de la primera asesoría.`);
    if (!s.paymentTypeId) { e.push(`${label}: seleccione el tipo de pago.`); return; }
    if (!q.tariff) e.push(`${label}: no hay un tarifario vigente para el tipo de pago elegido.`);
    if (s.startDate && s.startDate < draft.context.date) e.push(`${label}: la fecha de inicio de clases no puede ser anterior a la matrícula.`);
    if (s.schedule && !getAvailableSchedules(c.classSchedules, draft.context.branchId).some(h => h.name === s.schedule)) {
      e.push(`${label}: el horario elegido no está disponible en la sede.`);
    }
    if (q.mode === 'fechas_manuales' && q.tariff) {
      const needed = q.tariff.installments.filter(l => l.variable).length;
      const dates = s.dueDates.slice(0, needed);
      if (dates.length < needed || dates.some(d => !d)) e.push(`${label}: indique las fechas acordadas de cada parte.`);
      else if (dates.some(d => d < draft.context.date)) e.push(`${label}: las fechas acordadas no pueden ser anteriores a la matrícula.`);
      else if (dates.some((d, k) => k > 0 && d < dates[k - 1])) e.push(`${label}: las fechas acordadas deben ir en orden.`);
    }
  });
  return e;
}

const METHODS_NEED_OPERATION = ['Transferencia', 'Yape', 'Plin', 'Depósito'];
const METHODS_NEED_BANK = ['Transferencia', 'Depósito'];
export const PAYMENT_METHODS = ['Efectivo', 'Transferencia', 'Yape', 'Plin', 'Depósito', 'Tarjeta'];

export function validatePartRules(part: PaymentPart, label: string): string[] {
  const e: string[] = [];
  if (!(part.amount > 0)) e.push(`${label}: el monto debe ser mayor a 0.`);
  if (part.currency === 'PEN' && !(part.exchangeRate && part.exchangeRate > 0)) e.push(`${label}: indique el tipo de cambio (TC).`);
  if (!part.method) e.push(`${label}: seleccione el medio de pago.`);
  if (METHODS_NEED_BANK.includes(part.method) && !part.bank?.trim()) e.push(`${label}: indique el banco o entidad.`);
  if (METHODS_NEED_OPERATION.includes(part.method) && !part.operationNumber?.trim()) e.push(`${label}: indique el N° de operación.`);
  return e;
}

/** Equivalente en USD de una unidad de pago y su saldo pendiente. */
export function unitPaymentStatus(parts: PaymentPart[], required: number) {
  const registered = parts.length ? sumPaymentParts(parts, 'USD') : 0;
  const valid = registered !== null;
  const paid = valid ? registered! : 0;
  return { registered: paid, pending: roundMoney(required - paid), validTc: valid };
}

export function validatePayments(draft: EnrollmentDraft, quote: EnrollmentQuote): string[] {
  const e: string[] = [];
  quote.units.forEach(u => {
    const parts = draft.payments[u.key] ?? [];
    if (parts.length === 0) { e.push(`${u.label}: registre al menos una parte de pago.`); return; }
    parts.forEach((p, i) => e.push(...validatePartRules(p, `${u.label} · parte ${i + 1}`)));
    const st = unitPaymentStatus(parts, u.required);
    if (st.validTc && Math.abs(st.pending) > 0.01) {
      e.push(`${u.label}: la suma de las partes (USD ${st.registered.toFixed(2)}) debe ser exactamente USD ${u.required.toFixed(2)}.`);
    }
  });
  return e;
}

/** Tipos de pago realmente disponibles para el alumno (derivados de tarifarios vigentes). */
export function availablePaymentTypesFor(draft: EnrollmentDraft, c: EnrollmentCatalogs, index: number) {
  const s = draft.students[index];
  if (!s.programId) return [];
  return getAvailablePaymentTypes(c.tariffs, c.paymentTypes, {
    programId: s.programId, levelId: s.levelId || undefined, branchId: draft.context.branchId, date: draft.context.date,
  });
}

// ---------------------------------------------------------------- Guardado atómico

export interface ExistingState {
  guardians: Guardian[];
  students: Student[];
  enrollments: Enrollment[];
  plans: Plan[];
  payments: Payment[];
  promotionGroups: PromotionGroup[];
  counselings: Counseling[];
}

export interface EnrollmentBatch {
  newGuardians: Guardian[];
  guardianUpdates: { id: string; patch: Partial<Guardian> }[];
  newStudents: Student[];
  studentUpdates: { id: string; patch: Partial<Student> }[];
  enrollments: Enrollment[];
  plans: Plan[];
  payments: Payment[];
  cashMovements: Omit<CashMovement, 'id' | 'user'>[];
  promotionGroups: PromotionGroup[];
  counselings: Counseling[];
}

export interface BatchResult {
  ok: boolean;
  error?: string;
  batch?: EnrollmentBatch;
}

const parseMoney = (s: string) => parseFloat((s || '').replace(/[^0-9.-]/g, '')) || 0;

/**
 * Convierte el borrador validado en filas listas para guardar. No modifica nada.
 * El correlativo definitivo de matrícula se asigna aquí, al confirmar (nunca en borrador).
 */
export function buildEnrollmentBatch(
  draft: EnrollmentDraft,
  c: EnrollmentCatalogs,
  state: ExistingState,
  opts: { now: string; userName: string }
): BatchResult {
  const today = opts.now.slice(0, 10);
  const quote = quoteEnrollment(draft, c);

  const errors = [
    ...validateContext(draft, c, today),
    ...validateHolders(draft, c, today),
    ...validateStudents(draft, c, today),
    ...validateProgram(draft, c, quote),
    ...validatePayments(draft, quote),
  ];
  if (quote.warnings.length) errors.push(...quote.warnings);
  if (errors.length > 0) return { ok: false, error: errors[0] };

  const year = parseInt(draft.context.date.slice(0, 4), 10);
  const branch = c.branches.find(b => b.id === draft.context.branchId)!;
  const lead = c.leadSources.find(l => l.id === draft.context.leadSourceId)!;
  const interviewer = c.staff.find(s => s.id === draft.context.interviewerId)!;
  const interviewerName = `${interviewer.names} ${interviewer.lastNameP}`.trim();

  // ---- Titulares
  const newGuardians: Guardian[] = [];
  const guardianUpdates: { id: string; patch: Partial<Guardian> }[] = [];
  const guardianIds: string[] = [];
  const guardianIdPool = state.guardians.map(g => g.id);
  if (draft.mode === 'apoderado') {
    draft.holders.forEach((h, i) => {
      if (h.existingId) { guardianIds.push(h.existingId); return; }
      const id = nextNumericId([...guardianIdPool, ...newGuardians.map(g => g.id)]);
      newGuardians.push({
        id, name: fullName(h), doc: h.docNumber.trim(), phone: h.phone.trim(), email: h.email.trim(),
        parentesco: i === 0 ? draft.students[0]?.relationship : undefined, direccion: h.address.trim(),
        docType: h.docType, names: h.names.trim(), lastNameP: h.lastNameP.trim(), lastNameM: h.lastNameM.trim(),
        birthDate: h.birthDate, civilStatus: h.civilStatus,
        students: 0, enrollments: 0, balance: '$0',
      });
      guardianIds.push(id);
    });
  }
  const primaryHolderName = draft.mode === 'apoderado' ? fullName(draft.holders[0]) : '';

  // ---- Alumnos, matrículas, planes
  const newStudents: Student[] = [];
  const studentUpdates: { id: string; patch: Partial<Student> }[] = [];
  const enrollments: Enrollment[] = [];
  const plans: Plan[] = [];
  const studentIdPool = state.students.map(s => s.id);
  const enrollmentIdPool = state.enrollments.map(e => e.id);
  const planIdPool = state.plans.map(p => p.id);
  const enrollmentByKey: Record<string, string> = {};
  const planByKey: Record<string, string> = {};
  const balanceByGuardian = new Map<string, number>();

  draft.students.forEach((ds, i) => {
    const q = quote.students[i];
    const person = studentPerson(draft, i);
    const name = fullName(person);
    const program = q.program!;
    const programLabel = q.level ? `${program.name} - ${q.level.name}` : program.name;
    const titularName = draft.mode === 'apoderado' ? primaryHolderName : name;
    const birth = person.birthDate;

    let studentId = person.existingId;
    if (studentId) {
      studentUpdates.push({
        id: studentId,
        patch: {
          program: programLabel, horario: ds.schedule || undefined, fechaInicio: ds.startDate || undefined,
          titular: titularName, status: 'Activo',
          ...situationData(ds),
        },
      });
    } else {
      studentId = nextSequentialId('ALU', [...studentIdPool, ...newStudents.map(s => s.id)]);
      newStudents.push({
        id: studentId, doc: person.docNumber.trim(), name, age: birth ? (ageOn(birth, draft.context.date) ?? 0) : 0,
        program: programLabel, horario: ds.schedule || undefined, fechaInicio: ds.startDate || undefined,
        ...situationData(ds),
        titular: titularName, status: 'Activo',
        docType: person.docType, names: person.names.trim(), lastNameP: person.lastNameP.trim(), lastNameM: person.lastNameM.trim(),
        birthDate: birth, phone: person.phone.trim(), email: person.email.trim(), address: person.address.trim(),
        guardianIds: draft.mode === 'apoderado' ? guardianIds : [],
        relationship: draft.mode === 'apoderado' ? ds.relationship : '',
      });
    }

    const enrollmentId = nextSequentialId('MAT', [...enrollmentIdPool, ...enrollments.map(e => e.id)], { year });
    enrollmentByKey[ds.key] = enrollmentId;
    const planId = nextSequentialId('PLN', [...planIdPool, ...plans.map(p => p.id)]);
    planByKey[ds.key] = planId;

    // Plan
    const tariff = q.tariff!;
    let plan: Plan;
    if (q.mode === 'inmediato') {
      plan = {
        id: planId, mat: enrollmentId, titular: titularName, type: q.paymentType!.name,
        total: q.assignedPrice, balance: 0, next: '-', status: 'Al día', installments: [],
      };
    } else {
      const variableDates = q.mode === 'fechas_manuales' ? ds.dueDates : undefined;
      const installments = buildPlanInstallments(tariff, draft.context.date, variableDates);
      const first = installments.find(x => x.balance > 0);
      plan = {
        id: planId, mat: enrollmentId, titular: titularName, type: q.paymentType!.name,
        total: tariffTotal(tariff), balance: tariffTotal(tariff), next: first ? first.dueDate : '-',
        status: 'Al día', installments,
      };
    }
    plans.push(plan);
    balanceByGuardian.set(
      guardianIds[0] ?? '', (balanceByGuardian.get(guardianIds[0] ?? '') ?? 0) + plan.balance
    );

    enrollments.push({
      id: enrollmentId,
      date: formatDisplayDate(draft.context.date),
      dateISO: draft.context.date,
      student: name,
      studentId,
      guardianIds: draft.mode === 'apoderado' ? guardianIds : [],
      program: program.name, programId: program.id,
      level: q.level?.name ?? 'Sin nivel', levelId: q.level?.id,
      sede: branch.name, branchId: branch.id,
      asesor: interviewerName, asesorId: interviewer.id,
      origen: lead.name, origenId: lead.id,
      observation: draft.context.observation.trim() || undefined,
      status: 'Activa',
      plan: 'Al día',
      planId,
      paymentTypeId: q.paymentType!.id, paymentTypeName: q.paymentType!.name,
      tariffId: tariff.id, tariffName: tariff.name,
      assignedPrice: q.assignedPrice,
      verificationStatus: 'Pendiente',
      createdAt: opts.now, createdBy: opts.userName,
    });
  });

  // ---- Primera asesoría de cada alumno (fecha y hora definidas en el paso Programa)
  const counselings: Counseling[] = [];
  const counselingIdPool = state.counselings.map(c => c.id);
  draft.students.forEach((ds, i) => {
    const q = quote.students[i];
    counselings.push({
      id: nextNumericId([...counselingIdPool, ...counselings.map(c => c.id)]),
      student: fullName(studentPerson(draft, i)),
      program: q.program!.name,
      level: q.level?.name ?? 'Sin nivel',
      date: ds.counselingDate,
      time: ds.counselingTime,
      responsible: 'Por asignar',
      status: 'Pendiente',
    });
  });

  // ---- Grupos promocionales y pagos
  const promotionGroups: PromotionGroup[] = [];
  const payments: Payment[] = [];
  const cashMovements: Omit<CashMovement, 'id' | 'user'>[] = [];
  const groupIdPool = state.promotionGroups.map(g => g.id);
  const paymentIdPool = state.payments.map(p => p.id);

  quote.units.forEach(u => {
    const parts = draft.payments[u.key] ?? [];
    const paymentId = nextSequentialId('PAG', [...paymentIdPool, ...payments.map(p => p.id)]);
    const enrollmentIds = u.studentKeys.map(k => enrollmentByKey[k]);
    const names = u.studentKeys.map(k => {
      const idx = draft.students.findIndex(s => s.key === k);
      return fullName(studentPerson(draft, idx));
    });

    let groupId: string | undefined;
    if (u.kind === 'group') {
      const g = quote.groups[u.groupIndex!];
      groupId = nextSequentialId('PGR', [...groupIdPool, ...promotionGroups.map(x => x.id)]);
      const promo = c.promotions.find(p => p.id === g.promotionId)!;
      promotionGroups.push({
        id: groupId, promotionId: g.promotionId, currency: promo.currency, totalPrice: g.totalPrice,
        allocations: g.allocations.map(a => ({ ...a, enrollmentId: enrollmentByKey[a.studentKey] })),
        paymentId,
      });
      enrollmentIds.forEach(id => {
        const en = enrollments.find(e => e.id === id)!;
        en.promotionGroupId = groupId;
      });
    }

    payments.push({
      id: paymentId,
      date: formatDisplayDate(opts.now.slice(0, 10)),
      student: names.join(' + '),
      concept: u.kind === 'group' ? `Contado grupal — ${u.label}` : 'Contado',
      amount: u.required,
      method: Array.from(new Set(parts.map(p => p.method))).join(' / '),
      receipt: parts.map(p => p.operationNumber).filter(Boolean).join(', ') || 'S/N',
      status: 'Aprobado',
      parts,
      currency: 'USD',
      promotionGroupId: groupId,
      enrollmentIds,
    });

    // Un movimiento de caja por parte: dinero real, en su moneda.
    parts.forEach(p => {
      const usd = p.currency === 'USD' ? p.amount : roundMoney(p.amount / (p.exchangeRate || 1));
      cashMovements.push({
        date: opts.now,
        kind: 'Ingreso',
        concept: u.kind === 'group' ? 'Ingreso matrícula (promoción grupal)' : 'Ingreso matrícula (contado)',
        reference: `${enrollmentIds.join(', ')} / ${names.join(' + ')}`,
        currency: p.currency, amount: p.amount, exchangeRate: p.exchangeRate, amountUSD: usd,
        method: p.method, bank: p.bank, operationNumber: p.operationNumber,
        branchId: branch.id, paymentId, enrollmentIds, status: 'Aplicado',
      });
    });
  });

  // ---- Contadores de titulares (existentes y nuevos)
  const studentsPerGuardian = draft.students.length;
  guardianIds.forEach(gid => {
    const existing = state.guardians.find(g => g.id === gid);
    const added = balanceByGuardian.get(guardianIds[0]) ?? 0;
    if (existing) {
      guardianUpdates.push({
        id: gid,
        patch: {
          students: existing.students + studentsPerGuardian,
          enrollments: existing.enrollments + studentsPerGuardian,
          balance: `$${(parseMoney(existing.balance) + added).toLocaleString('en-US')}`,
        },
      });
    } else {
      const g = newGuardians.find(x => x.id === gid)!;
      g.students = studentsPerGuardian;
      g.enrollments = studentsPerGuardian;
      g.balance = `$${added.toLocaleString('en-US')}`;
    }
  });

  return {
    ok: true,
    batch: { newGuardians, guardianUpdates, newStudents, studentUpdates, enrollments, plans, payments, cashMovements, promotionGroups, counselings },
  };
}
