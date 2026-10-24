import React, { createContext, useContext, useRef, useState, ReactNode } from 'react';
import { buildEnrollmentBatch, type EnrollmentDraft } from '../utils/enrollment';
import { formatDisplayDate } from '../utils/tariffs';
import { nextNumericId, nextSequentialId } from '../utils/ids';
import { addDaysISO, allActivities, canChangeWithNotice, changeBlockedByNotice, branchOfStudent, localDateOf, MONTHS, todayLocalISO, validateActivityEnrollment, weekdayIndex, withEnrollment, withoutEnrollment, type FlatActivity } from '../utils/schedule';
import { addMonths, canEnableExtension, enrollmentValidity, firstSessionOf, programOf } from '../utils/validity';
import { attendanceBlock, blockedFirstSessions, scheduleGate, type FirstSessionGate } from '../utils/verificationGate';
import { buildScheduleEvents, initiatorOfReason, validateChangeMeta } from '../utils/psyHistory';
import { canRemoveEnrollment, staffLabel, validateAttendance, validateResponsible, withAttendance, withoutAttendance } from '../utils/psyActivities';
import { DEFAULT_PSY_POLICY, validatePsyPolicy, validatePsyReminderLog, type PsyReminder } from '../utils/psyReminders';
import { applyDropToPlan, previewDrop, summarizeDrop, validateDropRequest, validateDropResolution, type DropInput } from '../utils/enrollmentDrop';
import { applyReversalToPlan, reversalTargets, validateReversal, type ReversalInput } from '../utils/paymentReversal';
import { buildEnrollmentPatch, currentEditValues, diffEnrollmentEdit, validateEnrollmentEdit, type EnrollmentEditValues } from '../utils/enrollmentEdit';
import { partsUSD } from '../utils/payments';
import { closeAllOf, closeAssignmentIn, closeImpact, isActive as isActiveAssignment, saveAssignment as saveAssignmentIn, validateAssignmentClose, validateAssignmentForm, type AssignmentForm } from '../utils/assignments';
import { validateInactivation, validateReactivation } from '../utils/staffStatus';
import { buildContractPatch, diffContract, validateContractEdit, validateContractForm, type ContractForm } from '../utils/payroll';
import { applyCashReversal, buildDeposit, cashReversalCheck, validateCashReversal, validateDeposit, type DepositInput } from '../utils/cash';
import { PERM, can as canDo, type AuthorityContext } from '../utils/authority';
import { allowedNoteModes, buildCreditNote, validateNoteChoice, type NoteMode } from '../utils/creditNotes';
import { buildClosure, closedMessage, expectedAt, validateClosure, validateReopen, type ClosureInput } from '../utils/cashClosure';
import { DEFAULT_FUND, validateFund, type PettyFund } from '../utils/pettyCash';
import {
  applyProgramChangeToPlan, applyReactivationToPlan, previewProgramChange, previewReactivation, previewTransfer, programChangeProblems, reactivationProblems, transferProblems,
  validateProgramChangeRequest, validateReactivationRequest, validateTransferRequest, type ChangeContext, type ProgramChangeInput, type ReactivationInput, type TransferInput,
} from '../utils/enrollmentChange';
import { canRequest, canResolve, type ChangeKind } from '../utils/authority';
import {
  DEFAULT_CONTRACT_TEMPLATE, buildDocument, docState, documentProblems, issueDocument, issuedNumbers, validateSignature, validateTemplate, type DocContext, type DocKind,
} from '../utils/enrollmentDocuments';
import {
  DEFAULT_POLICY, chargeMoraOn, parsePolicy, validateMoraCharge, validatePolicy, validateReminderLog, type CollectionPolicy, type Reminder, type ReminderLog,
} from '../utils/collections';
import { applyRefinance, validateRefinance, type RefinanceInput } from '../utils/refinance';
import { buildPettyMovement, validatePettyInput, validatePettyReversal, type PettyInput } from '../utils/pettyCash';
import { buildPaymentRecord, documentLabel, totalUSD, validatePaymentInput, type PaymentDocument } from '../utils/payments';

// Types
export interface Guardian {
  id: string;
  name: string;
  doc: string;
  phone: string;
  email: string;
  parentesco?: string;
  direccion?: string;
  // Datos del registro de matrícula (asistente)
  docType?: string;
  names?: string;
  lastNameP?: string;
  lastNameM?: string;
  birthDate?: string;
  civilStatus?: string;
  students: number;
  enrollments: number;
  balance: string;
}

export interface Student {
  id: string;
  doc: string;
  name: string;
  age: number;
  grado?: string;
  colegio?: string;
  program: string;
  horario?: string;
  fechaInicio?: string;
  titular: string;
  status: string;
  // Datos del registro de matrícula (asistente)
  docType?: string;
  names?: string;
  lastNameP?: string;
  lastNameM?: string;
  birthDate?: string;
  phone?: string;
  email?: string;
  address?: string;
  guardianIds?: string[];
  relationship?: string; // parentesco con el titular; vacío si es independiente
  // Situación del alumno: estudia, trabaja, ambos o ninguna
  occupationStatus?: 'estudiando' | 'trabajando' | 'ambos' | 'ninguna';
  institutionType?: string;
  occupation?: string;
  workplace?: string;
}

/** Horario de clases configurable (Configuración → CRUDS Básicos → Horarios de clases). */
export interface ClassSchedule {
  id: string;
  name: string; // p. ej. «L-M-V 4:00 PM»
  allBranches: boolean;
  branchIds: string[];
  status: 'Activo' | 'Inactivo';
}

export interface Enrollment {
  id: string;
  date: string;
  student: string;
  program: string;
  programId?: string;
  level: string;
  levelId?: string;
  sede?: string;
  branchId?: string;
  asesor?: string;
  origen?: string;
  status: string;
  plan: string;
  verificationStatus?: 'Pendiente' | 'Verificado Incompleto' | 'Verificado Completo';
  verifiedItems?: string[]; // IDs of items delivered
  verificationDate?: string;
  verifier?: string;
  verificationObservation?: string;

  // Datos del registro de matrícula (asistente)
  studentId?: string;
  guardianIds?: string[];
  dateISO?: string;
  asesorId?: string;
  origenId?: string;
  observation?: string;
  planId?: string;
  paymentTypeId?: string;
  paymentTypeName?: string;
  tariffId?: string;
  tariffName?: string;
  assignedPrice?: number; // costo asignado (USD), con promoción si aplica
  promotionGroupId?: string;
  createdAt?: string;
  createdBy?: string;
  /** Extensión (garantía) habilitada: el alumno sigue apareciendo hasta el fin de la extensión. */
  extensionEnabledAt?: string;
  extensionEnabledBy?: string;
  /** Caída aprobada: desde qué fecha el alumno dejó de asistir y la solicitud que la originó. */
  dropDate?: string;
  dropRequestId?: string;
  /** Reactivación aprobada de una matrícula caída. */
  reactivatedAt?: string;
  reactivationRequestId?: string;
  /** Matrícula que esta renueva (nueva matrícula del mismo alumno al terminar o caer la anterior). */
  renewsId?: string;
  /** Contrato y ficha generados (numeración, versión y firma). */
  documents?: EnrollmentDocuments;
}

/** Documento generado de una matrícula (contrato o ficha). */
export interface IssuedDocument {
  number: string;
  version: number;
  generatedAt: string;
  generatedBy: string;
  /** Resumen de los datos con los que se generó (si cambian, el documento queda desactualizado). */
  fingerprint: string;
  signedAt?: string;
  signedBy?: string;
  /** Nombre del archivo escaneado con la firma (el sistema aún no guarda archivos). */
  signedFile?: string;
}

export interface EnrollmentDocuments {
  contract?: IssuedDocument;
  ficha?: IssuedDocument;
}

/** Cláusula editable del contrato (con campos entre llaves dobles, p. ej. `{{alumno}}`). */
export interface ContractClause {
  id: string;
  title: string;
  body: string;
}

/** Plantilla del contrato de servicios educativos (Configuración → Plantillas de documentos). */
export interface ContractTemplate {
  version: number;
  /** ¿El área legal ya revisó este texto? Mientras no, los contratos se generan con una advertencia. */
  reviewed: boolean;
  intro: string;
  clauses: ContractClause[];
  closing: string;
  updatedAt?: string;
  updatedBy?: string;
}

export type ChangeKindName = 'Reactivación' | 'Cambio de programa' | 'Traslado de sede';

/** Solicitud de cambio sobre una matrícula (la pide quien atiende y la resuelve quien tiene autoridad). */
export interface ChangeRequest {
  id: string;
  kind: ChangeKindName;
  enrollmentId: string;
  studentId?: string;
  requestedAt: string;
  requestedBy: string;
  reason: string;
  detail: string;
  /** Datos propios de cada tipo (fecha de reinicio, programa/nivel destino, sede destino…). */
  payload: Record<string, string>;
  status: DropStatus;
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionNote?: string;
  /** Qué se hizo al aprobar (líneas para el historial). */
  effects?: string[];
}

export type DropStatus = 'Pendiente' | 'Aprobada' | 'Rechazada';

/** Resumen de lo que se hizo al aprobar una caída (queda en el historial). */
export interface DropEffects {
  annulledInstallments: number;
  annulledUSD: number;
  overdueInstallments: number;
  overdueUSD: number;
  overdueForgiven: boolean;
  paidUSD: number;
  cancelledSchedules: number;
  removedActivities: number;
  studentDeactivated: boolean;
}

/** Solicitud de caída de una matrícula: la pide quien atiende y la resuelve quien tiene autoridad. */
export interface DropRequest {
  id: string;
  enrollmentId: string;
  studentId?: string;
  requestedAt: string;
  requestedBy: string;
  reason: string;
  detail: string;
  /** Desde cuándo el alumno dejó de asistir (YYYY-MM-DD). */
  effectiveDate: string;
  status: DropStatus;
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionNote?: string;
  effects?: DropEffects;
}

/** Corrección de un dato administrativo de una matrícula (con motivo, para auditar). */
export interface EnrollmentChange {
  id: string;
  enrollmentId: string;
  at: string;
  by: string;
  field: string;
  label: string;
  from: string;
  to: string;
  reason: string;
}

/** Reversa (anulación) de un pago. */
export interface PaymentReversal {
  at: string;
  by: string;
  reason: string;
  detail: string;
  /** true = el dinero se devolvió al cliente (sale de caja); false = nunca ingresó o se registró por error. */
  refunded: boolean;
  /** Etiqueta de la nota de crédito (emitida por el sistema o registrada) que anuló el comprobante. */
  creditNote?: string;
  creditNoteId?: string;
  /** Qué se hizo con el comprobante: nota emitida, nota registrada, comprobante no entregado o sin comprobante. */
  creditNoteMode?: NoteMode;
}

/** Cierre (arqueo) de una caja a una fecha; se puede reabrir con motivo. */
export interface CashClosure {
  id: string;
  scope: 'caja' | 'caja-chica';
  currency: 'PEN' | 'USD';
  /** Último día cubierto (YYYY-MM-DD). */
  date: string;
  /** Saldo que decía el sistema a esa fecha. */
  expected: number;
  /** Dinero contado. */
  counted: number;
  /** Contado − sistema (sobrante positivo, faltante negativo). */
  difference: number;
  note: string;
  closedAt: string;
  closedBy: string;
  status: 'Cerrada' | 'Reabierta';
  reopenedAt?: string;
  reopenedBy?: string;
  reopenReason?: string;
}

/**
 * Nota de crédito: anula (total) un comprobante ya entregado. Se emite con el correlativo de su serie
 * (BC01 para boletas, FC01 para facturas) o se registra una emitida fuera del sistema.
 */
export interface CreditNote {
  id: string;
  series: string;
  sequence: number;
  label: string;
  origin: 'sistema' | 'externa';
  paymentId: string;
  studentName: string;
  enrollmentIds: string[];
  originalType: 'Boleta' | 'Factura';
  originalDocument: string;
  amount: number;
  currency: 'PEN' | 'USD';
  reason: string;
  detail: string;
  issuedAt: string;
  issuedBy: string;
}

/** Datos para cobrar una cuota (los mismos que pide el asistente al cobrar la matrícula). */
export interface RegisterPaymentInput {
  /** Fecha del pago (YYYY-MM-DD). */
  date: string;
  /** Una parte por medio de pago usado. */
  parts: PaymentPart[];
  /** Comprobante que se entrega por el pago. */
  document: PaymentDocument;
  note?: string;
}

/** Grupo promocional: alumnos que comparten una promoción y UN único pago. */
export interface PromotionGroup {
  id: string;
  promotionId: string;
  currency: 'PEN' | 'USD';
  totalPrice: number;
  /** Costo asignado por alumno/matrícula (reparto interno). `studentKey` es la clave del alumno en el registro; luego se enlaza con la matrícula. */
  allocations: { studentKey: string; enrollmentId?: string; amount: number }[];
  paymentId?: string; // Pago grupal único
}

export interface Plan {
  id: string;
  mat: string;
  titular: string;
  type: string;
  total: number;
  balance: number;
  next: string;
  status: string;
  installments: any[];
}

/**
 * Parte de un MISMO pago realizado en el mismo momento (p. ej. una parte por Yape y otra en efectivo).
 * No es una cuota: las cuotas son obligaciones programadas de un plan.
 */
export interface PaymentPart {
  id: string;
  currency: 'PEN' | 'USD';
  amount: number;
  exchangeRate?: number; // TC: obligatorio si currency === 'PEN' y la obligación está en USD
  method: string;
  bank?: string;
  operationNumber?: string;
  evidence?: string;
  note?: string;
}

export interface Payment {
  id: string;
  date: string;
  student: string;
  concept: string;
  amount: number;
  method: string;
  receipt: string;
  status: string;
  /** Comprobante que la empresa entrega (boleta / factura). `receipt` es su texto: «B001-000123». */
  document?: PaymentDocument;
  /** Si el pago se reversó: cuándo, quién, por qué y si se devolvió el dinero. */
  reversal?: PaymentReversal;
  parts?: PaymentPart[]; // Una parte por medio de pago usado (lo que recibe la empresa)
  currency?: 'PEN' | 'USD'; // Moneda de la obligación que cubre el pago
  promotionGroupId?: string; // Pago grupal: un único pago para todas las matrículas del grupo
  enrollmentIds?: string[]; // Matrículas cubiertas por este pago
  user?: string; // Quién registró el pago
  comment?: string;
}

/**
 * Movimiento de caja. Cada parte de un pago es dinero real en SU moneda (PEN o USD); el equivalente en USD
 * se calcula con el tipo de cambio de la parte. La configuración comercial siempre es USD.
 */
export interface CashMovement {
  id: string;
  date: string; // ISO datetime
  kind: 'Ingreso' | 'Egreso';
  concept: string;
  reference: string; // matrícula / alumno / comprobante
  currency: 'PEN' | 'USD'; // caja en la que se registra
  amount: number; // en la moneda de la caja
  exchangeRate?: number;
  amountUSD: number; // equivalente en USD
  method: string;
  bank?: string;
  operationNumber?: string;
  branchId?: string;
  user: string;
  paymentId?: string;
  enrollmentIds?: string[];
  status: 'Aplicado' | 'Reversado';
  /** Constancia de la reversa (el movimiento no se borra). */
  reversal?: { at: string; by: string; reason: string; detail: string };
  /** Ingreso en efectivo: código del lote de depósito en el que se llevó al banco. */
  depositedIn?: string;
  /** Egreso que es un lote de depósito: sus ingresos. */
  deposit?: { code: string; bank: string; movementIds: string[] };
  /** Venta de artículo: qué se vendió (para devolverlo al stock si se reversa). */
  sale?: { itemId: string; branchId: string; qty: number };
}

/** Movimiento de la caja chica (fondo fijo en soles para gastos menores). */
export interface PettyCashMovement {
  id: string;
  date: string; // ISO datetime
  kind: 'Ingreso' | 'Egreso';
  category: string;
  concept: string;
  amount: number; // PEN
  method: string;
  reference?: string; // N.º de boleta, recibo, etc.
  evidence?: string; // nombre del archivo adjunto (aún no hay almacenamiento)
  observations?: string;
  user: string;
  status: 'Aplicado' | 'Reversado';
  reversal?: { at: string; by: string; reason: string; detail: string };
}

export type ItemType = 'Material educativo' | 'Herramienta / adicional' | 'Libro' | 'Paquete / kit logístico';

export interface Item {
  id: string;
  name: string;
  status: 'Activo' | 'Inactivo';
  type: ItemType;
  description: string;
  unit: string;
  cost: number;
  isSold: boolean;
  /** @deprecated El precio de venta vive en `ItemPrice` (general o por sede, con vigencia e historial). */
  salePrice?: number;
  /** Habilita el artículo para ser elegido dentro de una Receta de matrícula. NO lo entrega automáticamente a todo alumno. */
  isDeliveredOnEnrollment: boolean;
  isPackage: boolean;
  allowUnpacking: boolean;

  // Material educativo
  sessions?: number;
  gymnasticsPerSession?: number;
  trainingsPerSession?: number;
  trainingMode?: 'General' | 'Variable';
  variableTrainings?: { session: number; trainings: number }[];

  // Libro
  bookType?: 'Individual' | 'Paquete/Juego';
  /** Obligatorio para libros. Anillado: normalmente material de programa. Encolado: puede ser vendible. */
  bindingType?: 'Anillado' | 'Encolado';

  // Paquete
  composition?: { itemId: string; name: string; quantity: number }[];
}

/**
 * Precio de venta de un artículo (USD). Un precio general (`branchId: 'all'`) y/o excepciones por sede.
 * Cambiar un precio crea una nueva vigencia; no se sobrescribe el histórico.
 */
export interface ItemPrice {
  id: string;
  itemId: string;
  branchId: string; // 'all' o id de sede
  amount: number; // USD
  validFrom: string; // YYYY-MM-DD
  validTo?: string; // YYYY-MM-DD; vacío = vigente hasta nueva vigencia
  createdAt: string;
  createdBy: string;
}

export interface StockItem {
  id: string;
  itemId: string;
  branchId: string;
  stock: number;
  minStock: number;
}

export interface KardexEntry {
  id: string;
  date: string;
  branch: string;
  material: string;
  type: 'Ingreso' | 'Salida' | 'Transferencia Salida' | 'Transferencia Entrada' | 'Ajuste Positivo' | 'Ajuste Negativo' | 'Merma' | 'Venta' | 'Entrega por Verificación' | 'Empaquetado' | 'Desempaquetado' | 'Regularización Administrativa' | 'Salida por matrícula' | 'Transferencia' | 'Ajuste' | 'Devolución';
  qty: number;
  prevBalance: number;
  newBalance: number;
  user: string;
  doc: string;
  observation?: string;
}

export interface Courier {
  id: string;
  code: string;
  name: string;
  address: string;
  reference: string;
  phone: string;
  status: 'Activo' | 'Inactivo';
  observations: string;
}

export interface ShippingMethod {
  id: string;
  name: string;
  status: 'Activo' | 'Inactivo';
  observations: string;
}

export interface TransferBoxItem {
  itemId: string;
  quantity: number;
}

export interface TransferBox {
  id: string;
  boxNumber: string;
  observation?: string;
  items: TransferBoxItem[];
}

export interface TransferItem {
  itemId: string;
  quantity: number;
  observation?: string;
}

export interface Transfer {
  id: string;
  date: string;
  originId: string;
  destinationId: string;
  status: 'Borrador' | 'Solicitada' | 'Aprobada' | 'En tránsito' | 'Listo para recepción' | 'Recibida' | 'Recibida con diferencias' | 'Rechazada' | 'Cancelada' | 'Despachada' | 'Recepcionada';
  items: TransferItem[];
  boxes?: TransferBox[];
  reason: string;
  shippingMethodId?: string;
  courierId?: string;
  trackingNumber?: string;
  additionalReference?: string;
  travelerName?: string;
  travelerDocument?: string;
  shippingObservation?: string;
  internalLogisticsObservation?: string;
  eta?: string;
  observation?: string;
  attachments?: string[];
  receptionObservation?: string;
  receptionDate?: string;
  receivedBy?: string;
  manualEnable?: boolean;
}

export interface ShipmentBoxItem {
  itemId: string;
  quantity: number;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'danger';
  date: string;
  read: boolean;
  branchId?: string;
}

export interface ShipmentBox {
  id: string;
  boxNumber: string;
  observation?: string;
  items: ShipmentBoxItem[];
}

export interface ShipmentItem {
  itemId: string;
  quantity: number;
  observation?: string;
}

export interface Shipment {
  id: string;
  date: string;
  originId: string;
  destinationId: string;
  status: 'Borrador' | 'En tránsito' | 'Listo para recepción' | 'Recibido' | 'Recibido con diferencias' | 'Cancelado';
  boxes: ShipmentBox[];
  items: ShipmentItem[]; // Flattened list for easy querying
  shippingMethodId?: string;
  courierId?: string;
  trackingNumber?: string;
  additionalReference?: string;
  travelerName?: string;
  travelerDocument?: string;
  shippingObservation?: string;
  eta?: string;
  etaTime?: string; // e.g. "14:30"
  draftExpiry?: string;
  observation?: string;
  attachments?: string[];
  receptionObservation?: string;
  receptionDate?: string;
  receivedBy?: string;
  manualEnable?: boolean;
}

export interface ReceptionIncident {
  id: string;
  docId: string;
  docType: 'Envío' | 'Transferencia';
  itemId: string;
  type: 'missing' | 'damaged' | 'extra';
  quantity: number;
  observation: string;
  date: string;
  branchId: string;
}

export interface PromotionComposition {
  programId: string;
  quantity: number;
}

export interface Promotion {
  id: string;
  code: string;
  name: string;
  type: 'Grupal';
  requiredStudents: number;
  /** Programas/familias elegibles (cualquier combinación de ellos con la cantidad requerida). */
  eligibleProgramIds?: string[];
  /** Precio contado/base que debe tener el tarifario vigente de CADA alumno (en la moneda de la promoción). Vacío = sin condición de precio. */
  requiredBasePrice?: number;
  /** Permite formar varios grupos con los alumnos del mismo registro (cada alumno solo en un grupo). */
  allowMultipleGroups?: boolean;
  /** @deprecated Composición rígida (p. ej. PreKids x1 + Kids x1). Solo se usa si la promoción no define `eligibleProgramIds`. */
  composition?: PromotionComposition[];
  paymentTypeIds: string[];
  totalPrice: number;
  currency: 'PEN' | 'USD';
  internalDistributionRule: 'Igualitario';
  branchIds: string[];
  applyToAllBranches: boolean;
  startDate: string;
  endDate: string;
  status: 'Activo' | 'Inactivo';
  observations?: string;
}

export interface RecipeItem {
  itemId: string;
  quantity: number;
}

export interface Recipe {
  id: string;
  name: string;
  programId: string;
  levelId?: string; // Optional: if empty, applies to all levels
  branchIds: string[]; // List of branch IDs
  applyToAllBranches: boolean;
  status: 'Activo' | 'Inactivo';
  items: RecipeItem[];
  startDate: string;
  endDate?: string; // Optional: if empty, indefinite
}

export interface Adjustment {
  id: string;
  date: string;
  branch: string;
  material: string;
  type: 'Ajuste Positivo' | 'Ajuste Negativo' | 'Merma' | 'Regularización Administrativa' | 'Devolución';
  qty: number;
  reason: string;
  observation?: string;
  user: string;
}

export interface Schedule {
  id: string;
  student: string;
  program: string;
  level: string;
  /** @deprecated Ya no existe tipo de cita: todo son asesorías. */
  type?: string;
  date: string;
  time: string;
  /** Siempre 60 (las asesorías duran 1 hora exacta). */
  duration: number;
  responsible: string;
  /** @deprecated No existe modalidad virtual. */
  modality?: string;
  status: string; // Reservado | Reprogramado | Asistió | Faltó | Cancelado
  studentId?: string; // Alumno registrado al que pertenece la reserva
  /** Sede de la asesoría = sede del alumno (cada sede tiene sus propios bloques, cupos y cronogramas). */
  branchId?: string;
  observations?: string;
  isFirst?: boolean; // Primera asesoría del alumno (la crea la matrícula)
  /** Primera asesoría: registro de matrícula (lote) al que pertenece. Los alumnos de un mismo registro comparten horario. */
  registrationId?: string;
  /** Primera asesoría: matrícula a la que pertenece (de aquí se deriva el inicio de la vigencia). */
  enrollmentId?: string;
}

/** Cierre de la primera asesoría (checklist). */
export interface FirstSessionChecklist {
  guardianAttended: boolean;
  methodologyExplained: boolean;
  itemsExplained: boolean;
}

/** Registro de la sesión de una asesoría a la que el alumno asistió (avance, métricas y observaciones). */
export interface Tracking {
  id: string;
  studentId: string;
  /** Asesoría de la agenda a la que corresponde la sesión (los registros antiguos no la tienen). */
  scheduleId?: string;
  date: string;
  status: string;
  metrics: any;
  observations: string;
  checklist?: FirstSessionChecklist;
}

/** Actividad especial de un cronograma mensual (p. ej. una maratón). Bloquea los horarios de asesoría de su sede. */
export interface ScheduleActivity {
  id: string;
  actividad: string;
  fecha: string;
  horaInicio: string; // HH:MM
  horaFin: string; // HH:MM
  responsable: string;
  orden: number;
  /** Máximo de alumnos inscritos; null = sin límite. */
  cupo: number | null;
  /** IDs de los alumnos inscritos. */
  inscritos: string[];
  /** Personal de Psicopedagogía a cargo (el nombre queda en `responsable`). Se asigna desde Actividades especiales. */
  responsableId?: string;
  /** Asistencia de los inscritos (alumno → estado). Se registra desde el día de la actividad y exige responsable. */
  asistencia?: Record<string, ActivityAttendance>;
}

/** Asistencia de un alumno a una actividad especial. */
export interface ActivityAttendance {
  status: 'Asistió' | 'Faltó';
  /** Fecha y hora del registro (ISO). */
  at: string;
  by: string;
  note?: string;
}

/** Quién pidió el cambio de una asesoría: el alumno (o su titular) o la propia institución. */
export type ChangeInitiator = 'Alumno o titular' | 'Institución';

export type PsyEventType =
  | 'Reservada' | 'Reprogramada' | 'Cancelada' | 'Asistió' | 'Faltó' | 'Sesión registrada'
  | 'Inscripción' | 'Inscripción quitada' | 'Responsable asignado' | 'Asistencia a actividad';

/**
 * Historial de Psicopedagogía: cada cambio de una asesoría o de una actividad queda como un evento (quién, cuándo, de qué
 * a qué, por qué y quién lo pidió). Se genera solo al cambiar la agenda, así que ninguna pantalla puede olvidarlo.
 */
export interface PsyEvent {
  id: string;
  /** Fecha y hora del cambio (ISO). */
  at: string;
  /** Usuario del sistema que lo hizo. */
  by: string;
  subject: 'asesoria' | 'actividad';
  /** Asesoría (id) o actividad (`cronograma:actividad`). */
  refId: string;
  studentId?: string;
  type: PsyEventType;
  initiator?: ChangeInitiator;
  reason?: string;
  detail?: string;
  from?: { date: string; time: string; responsible: string };
  to?: { date: string; time: string; responsible: string };
}

/** Motivo que acompaña a una cancelación o reprogramación. */
export interface ChangeMeta {
  reason: string;
  detail?: string;
}

/** Política de recordatorios de Psicopedagogía (editable en Configuración). Los días son antes de la fecha. */
export interface PsyReminderPolicy {
  /** Asesorías: días antes (1 = el día anterior; 0 = el mismo día). */
  sessionBefore: number[];
  /** Actividades especiales a las que el alumno está inscrito. */
  activityBefore: number[];
  /** Fin de la duración base de la matrícula (por vencer, sin extensión habilitada). */
  validityBefore: number[];
}

export interface PsyReminderLog {
  id: string;
  /** Clave del recordatorio atendido (tipo:referencia:días). */
  key: string;
  kind: 'asesoria' | 'actividad' | 'vigencia';
  refId: string;
  studentId: string;
  offset: number;
  at: string;
  by: string;
  channel: 'WhatsApp' | 'Correo' | 'Llamada' | 'Otro';
  result: 'Enviado' | 'Omitido';
  note?: string;
}

export interface MonthlySchedule {
  id: string;
  /** Sede (cada sede tiene su propio cronograma). */
  branchId: string;
  sede: string;
  mes: string;
  anio: number;
  titulo: string;
  actividades: ScheduleActivity[];
  observaciones: string;
}

/** Cupo distinto al habitual para un horario concreto de una sede. */
export interface CapacityOverride {
  id: string;
  branchId: string;
  date: string;
  time: string;
  /** null = sin límite. */
  capacity: number | null;
}

/**
 * Cupo de alumnos por horario de asesoría. Prioridad: excepción por fecha y horario > cupo de la sede > cupo general.
 * `null` significa «sin límite».
 */
export interface CapacityConfig {
  defaultCapacity: number | null;
  byBranch: Record<string, number | null>;
  overrides: CapacityOverride[];
}

export interface Staff {
  id: string;
  code: string;
  docType: string;
  docNumber: string;
  names: string;
  lastNameP: string;
  lastNameM: string;
  birthDate: string;
  age: number;
  gender?: string;
  civilStatus?: string;
  hasChildren?: boolean;
  childrenCount?: number;
  educationLevel?: string;
  profession?: string;
  specialty?: string;
  phone: string;
  personalEmail?: string;
  address?: string;
  status: string;
  observations?: string;
  /** Última baja o reactivación (fecha YYYY-MM-DD y motivo). */
  statusDate?: string;
  statusReason?: string;
}

export interface Contract {
  id: string;
  staffId: string;
  type: string;
  startDate: string;
  endDate?: string;
  status: string;
  shift?: string;
  pensionSystem?: string;
  pensionFund?: string;
  grossSalary?: number;
  contribution?: number;
  netSalary?: number;
  vacationStart?: string;
  vacationEnd?: string;
  terminationReason?: string;
  observations?: string;
  /** Modificaciones del contrato vigente, con motivo (la más reciente primero). */
  revisions?: ContractRevision[];
}

export interface ContractRevisionChange {
  label: string;
  from: string;
  to: string;
}

export interface ContractRevision {
  at: string;
  by: string;
  reason: string;
  changes: ContractRevisionChange[];
}

export interface Assignment {
  id: string;
  staffId: string;
  branch: string;
  area: string;
  role: string;
  systemRole?: string;
  startDate: string;
  endDate?: string;
  isMain: boolean;
  /** Activa | Cerrada */
  status: string;
  observations?: string;
  closeReason?: string;
  closedBy?: string;
}

export interface Company {
  id: string;
  ruc: string;
  name: string;
  commercialName: string;
  status: 'Activo' | 'Inactivo';
  observaciones?: string;
}

export interface Role {
  id: string;
  name: string;
  desc: string;
  users: number;
  status: 'Activo' | 'Inactivo';
  baseRole?: string;
  observations?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  branch: string;
  lastAccess: string;
  status: 'Activo' | 'Inactivo';
  document?: string;
  phone?: string;
  additionalBranches?: string[];
}

export interface Permission {
  roleId: string;
  permissions: string[];
}

export interface Branch {
  id: string; // Código
  name: string; // Nombre de filial
  company: string; // Empresa
  status: 'Activo' | 'Inactivo';
  address: string; // Dirección
  reference?: string; // Referencia
  department: string; // Departamento
  province: string; // Provincia
  district: string; // Distrito
  phoneFixed?: string;
  phoneMobile?: string;
  email?: string;
  responsibleId?: string; // ID del personal responsable
  observations?: string;
}

export interface LeadSource {
  id: string;
  name: string;
  status: 'active' | 'inactive';
}

export interface Program {
  id: string;
  code: string;
  name: string;
  alias?: string;
  description?: string;
  hasLevels: boolean;
  durationBase: number;
  warranty: number;
  allBranches: boolean;
  enabledBranches?: string[];
  status: 'Activo' | 'Inactivo';
  observations?: string;
}

export interface Level {
  id: string;
  programId: string;
  code: string;
  name: string;
  order: number;
  status: 'Activo' | 'Inactivo';
  description?: string;
}

/**
 * Modalidad del cronograma:
 * - inmediato: una obligación, pago al momento (Contado).
 * - intervalo_fijo: n cuotas separadas por `termDays` días exactos (Plan 3, 6, 9...).
 * - fechas_manuales: n obligaciones cuyas fechas se acuerdan (Contado en 2 partes).
 */
export type ScheduleMode = 'inmediato' | 'intervalo_fijo' | 'fechas_manuales';

export interface PaymentType {
  id: string;
  code: string;
  name: string;
  installments: number; // N° de obligaciones del cronograma
  termDays: number; // Intervalo en días (solo intervalo_fijo)
  scheduleMode?: ScheduleMode; // Si falta: 1 obligación = inmediato; >1 = intervalo_fijo
  /** @deprecated Las partes de un pago pertenecen al registro de pago (`Payment.parts`), no al tipo de pago. */
  allowPartial?: boolean;
  /** @deprecated Ver `allowPartial`. */
  maxPartials?: number;
  /** @deprecated La relación Programa/Nivel + Tipo de pago se resuelve mediante el Tarifario. Sin consumidores; se conserva solo por compatibilidad con datos antiguos. */
  applicablePrograms?: string[];
  status: 'Activo' | 'Inactivo';
  description?: string;
}

export interface TariffInstallment {
  number: number; // 0 = Matrícula; 1..n = cuotas/partes
  concept: string;
  amount: number; // En líneas `variable`, el monto se define al cobrar (queda en 0)
  dueDays: number;
  kind?: 'matricula' | 'cuota' | 'unica' | 'parte';
  variable?: boolean;
}

export interface Tariff {
  id: string;
  name: string;
  programId: string;
  levelId?: string; // Opcional: solo si el programa usa niveles; vacío = aplica a todos los niveles
  paymentTypeId: string;
  branchId: string; // 'all' or specific ID
  currency: 'PEN' | 'USD';
  basePrice: number;
  /** @deprecated La matrícula es una línea del desglose (`installments`, kind 'matricula'). */
  includesEnrollment?: boolean;
  /** @deprecated Ver `includesEnrollment`. */
  enrollmentValue?: number;
  /** @deprecated Los materiales se resuelven por Programa/Nivel → Receta → Catálogo; no afectan precio ni cálculos. */
  includesMaterials?: boolean;
  /** @deprecated Ver `includesMaterials`. */
  materialsValue?: number;
  /** Fuente de verdad del total: `basePrice` es la suma de estas líneas (salvo cronogramas con montos variables). */
  installments: TariffInstallment[];
  startDate: string;
  endDate?: string;
  status: 'Activo' | 'Inactivo';
}

/** Resultado de una operación que mueve stock. `ok: false` = no se aplicó ningún cambio. */
export interface StockResult {
  ok: boolean;
  error?: string;
}

interface DataContextType {
  guardians: Guardian[];
  students: Student[];
  enrollments: Enrollment[];
  plans: Plan[];
  payments: Payment[];
  items: Item[];
  setItems: React.Dispatch<React.SetStateAction<Item[]>>;
  stockItems: StockItem[];
  classSchedules: ClassSchedule[];
  addClassSchedule: (data: Omit<ClassSchedule, 'id'>) => StockResult;
  updateClassSchedule: (id: string, data: Partial<Omit<ClassSchedule, 'id'>>) => StockResult;
  deleteClassSchedule: (id: string) => StockResult;
  cashMovements: CashMovement[];
  addCashMovement: (movement: Omit<CashMovement, 'id' | 'date' | 'user' | 'status'> & { date?: string }) => CashMovement;
  /** Reversa un movimiento de caja manual, venta o lote de depósito (los de un pago se reversan desde el pago). */
  reverseCashMovement: (id: string, input: { reason: string; detail: string }) => StockResult;
  /** Lleva ingresos en efectivo al banco: un egreso «Depósito bancario» y los ingresos quedan depositados. */
  createDepositBatch: (input: DepositInput) => StockResult & { code?: string };
  pettyCashMovements: PettyCashMovement[];
  addPettyCashMovement: (input: PettyInput) => StockResult;
  reversePettyCashMovement: (id: string, input: { reason: string; detail: string }) => StockResult;
  promotionGroups: PromotionGroup[];
  itemPrices: ItemPrice[];
  addItemPrice: (price: { itemId: string; branchId: string; amount: number; validFrom: string }) => { ok: boolean; error?: string };
  kardex: KardexEntry[];
  transfers: Transfer[];
  setTransfers: React.Dispatch<React.SetStateAction<Transfer[]>>;
  couriers: Courier[];
  setCouriers: React.Dispatch<React.SetStateAction<Courier[]>>;
  shippingMethods: ShippingMethod[];
  setShippingMethods: React.Dispatch<React.SetStateAction<ShippingMethod[]>>;
  adjustments: Adjustment[];
  addAdjustment: (adjustment: Omit<Adjustment, 'id' | 'date' | 'user'>, stockId: string) => StockResult;
  schedules: Schedule[];
  addSchedule: (data: Omit<Schedule, 'id'>) => Schedule;
  /** Una primera asesoría con la matrícula sin verificar no admite «Asistió» ni «Faltó» (ver `utils/verificationGate.ts`). */
  updateSchedule: (id: string, data: Partial<Omit<Schedule, 'id'>>, meta?: Partial<ChangeMeta>) => { ok: boolean; reason?: string };
  /** Historial de Psicopedagogía: cada cambio de una asesoría o actividad (quién, cuándo, por qué y quién lo pidió). */
  psyEvents: PsyEvent[];
  /** Asigna (o quita, con `null`) el responsable de una actividad especial (`cronograma:actividad`). */
  setActivityResponsible: (flatId: string, staffId: string | null) => StockResult;
  enrollInActivity: (flatId: string, studentId: string) => StockResult;
  unenrollFromActivity: (flatId: string, studentId: string, meta: Partial<ChangeMeta>) => StockResult;
  /** Registra la asistencia de un inscrito (`null` quita la marca; pide una nota). */
  markActivityAttendance: (flatId: string, studentId: string, status: 'Asistió' | 'Faltó' | null, note?: string) => StockResult;
  psyReminderPolicy: PsyReminderPolicy;
  savePsyReminderPolicy: (policy: PsyReminderPolicy) => StockResult;
  psyReminderLogs: PsyReminderLog[];
  logPsyReminder: (reminder: Pick<PsyReminder, 'key' | 'kind' | 'refId' | 'studentId' | 'offset'>, channel: PsyReminderLog['channel'], result: PsyReminderLog['result'], note: string) => StockResult;
  /** Estado de la verificación frente a una primera asesoría (solo la primera asesoría vigente de una matrícula). */
  gateOfSchedule: (schedule: Pick<Schedule, 'id' | 'isFirst' | 'enrollmentId'>) => FirstSessionGate;
  /** Motivo por el que no se puede registrar la asistencia o la sesión de una asesoría (null = se puede). */
  attendanceBlockOf: (schedule: Pick<Schedule, 'id' | 'isFirst' | 'enrollmentId'>) => string | null;
  /** Matrículas cuya primera asesoría espera la verificación, por número de matrícula. */
  pendingFirstSessions: () => Record<string, FirstSessionGate>;
  trackings: Tracking[];
  monthlySchedules: MonthlySchedule[];
  addMonthlySchedule: (data: Omit<MonthlySchedule, 'id'>) => MonthlySchedule;
  updateMonthlySchedule: (id: string, data: Partial<Omit<MonthlySchedule, 'id'>>) => void;
  deleteMonthlySchedule: (id: string) => void;
  capacityConfig: CapacityConfig;
  setCapacityConfig: (config: CapacityConfig) => void;
  staff: Staff[];
  contracts: Contract[];
  addContract: (contract: Omit<Contract, 'id'>) => Contract;
  updateContract: (id: string, data: Partial<Omit<Contract, 'id'>>) => void;
  assignments: Assignment[];
  /** Crea (o edita, con `editingId`) una asignación. La nueva principal desplaza a la anterior. */
  saveAssignment: (form: AssignmentForm, editingId?: string) => StockResult;
  /** Cierra una asignación con fecha y motivo (no se borra). */
  closeAssignment: (id: string, date: string, reason: string) => StockResult;
  /** Edita un contrato vigente con motivo; queda la constancia de lo que cambió. */
  editContract: (id: string, form: ContractForm, reason: string) => StockResult;
  /** Da de baja a un trabajador (cierra sus asignaciones). Exige contrato cerrado y sin asesorías futuras. */
  inactivateStaff: (id: string, input: { reason: string; detail: string; date: string }) => StockResult;
  reactivateStaff: (id: string, detail: string) => StockResult;
  roles: Role[];
  setRoles: React.Dispatch<React.SetStateAction<Role[]>>;
  addRole: (role: Role) => void;
  updateRole: (id: string, roleData: Partial<Role>) => void;
  deleteRole: (id: string) => void;
  users: User[];
  setUsers: React.Dispatch<React.SetStateAction<User[]>>;
  addUser: (user: User) => void;
  updateUser: (id: string, userData: Partial<User>) => void;
  deleteUser: (id: string) => void;
  permissions: Permission[];
  savePermissions: (roleId: string, newPermissions: string[]) => void;
  companies: Company[];
  setCompanies: React.Dispatch<React.SetStateAction<Company[]>>;
  addCompany: (company: Company) => void;
  updateCompany: (id: string, companyData: Partial<Company>) => void;
  deleteCompany: (id: string) => void;
  branches: Branch[];
  leadSources: LeadSource[];
  programs: Program[];
  levels: Level[];
  paymentTypes: PaymentType[];
  tariffs: Tariff[];
  promotions: Promotion[];
  recipes: Recipe[];
  setRecipes: React.Dispatch<React.SetStateAction<Recipe[]>>;
  unpackPackage: (stockId: string) => StockResult;
  packPackage: (stockId: string) => StockResult;
  updateStock: (branchId: string, itemId: string, qty: number, type: KardexEntry['type'], observation: string, doc?: string) => StockResult;
  updateMinStock: (stockId: string, minStock: number) => void;
  updateTransferStatus: (id: string, status: Transfer['status']) => StockResult;
  updateTransfer: (id: string, transfer: Partial<Transfer>) => void;
  addTransfer: (transfer: Omit<Transfer, 'id'>) => void;
  addStaff: (staff: Omit<Staff, 'id'>) => Staff;
  updateStaff: (id: string, staff: Partial<Staff>) => void;
  deleteStaff: (id: string) => void;
  /** Crea el alumno (correlativo ALU-000) y suma uno al contador de alumnos de sus titulares. */
  addStudent: (student: Omit<Student, 'id'>) => Student;
  updateStudent: (id: string, student: Partial<Student>) => void;
  deleteStudent: (id: string) => void;
  addGuardian: (guardian: Omit<Guardian, 'id' | 'students' | 'enrollments' | 'balance'>) => Guardian;
  updateGuardian: (id: string, guardian: Partial<Guardian>) => void;
  deleteGuardian: (id: string) => void;
  /** Guardado atómico del asistente: crea matrículas, planes, pagos, caja y grupos promocionales, o nada. */
  registerEnrollments: (draft: EnrollmentDraft) => { ok: boolean; error?: string; enrollmentIds?: string[] };
  /** Habilita el período de extensión (garantía) de una matrícula por vencer o con la duración base terminada. */
  enableExtension: (enrollmentId: string) => StockResult;
  dropRequests: DropRequest[];
  /** Solicita la caída de una matrícula: queda pendiente hasta que alguien con autoridad la resuelva. */
  requestEnrollmentDrop: (enrollmentId: string, input: DropInput) => StockResult;
  /** Aprueba (aplica los efectos en plan, asesorías, actividades y alumno) o rechaza una solicitud de caída. */
  resolveEnrollmentDrop: (requestId: string, decision: 'Aprobada' | 'Rechazada', opts: { note: string; forgiveOverdue: boolean }) => StockResult;
  enrollmentChanges: EnrollmentChange[];
  /** Corrige datos administrativos de una matrícula activa (con motivo y constancia). */
  updateEnrollmentData: (enrollmentId: string, after: EnrollmentEditValues, reason: string) => StockResult;
  /** Reversa un pago: queda anulado, repone la cuota, ajusta caja y libera su comprobante. */
  reversePayment: (paymentId: string, input: ReversalInput) => StockResult;
  cashClosures: CashClosure[];
  /** Hace el arqueo y cierra una caja hasta una fecha (Caja PEN, Caja USD o Caja chica). */
  closeCash: (input: ClosureInput) => StockResult;
  /** Reabre el último cierre de una caja (con motivo y permiso). */
  reopenCash: (closureId: string, reason: string) => StockResult;
  /** Fondo fijo y tope por gasto de la caja chica. */
  pettyFund: PettyFund;
  collectionPolicy: CollectionPolicy;
  /** Guarda la política de cobranza (días de gracia, mora y días de recordatorio). */
  updateCollectionPolicy: (input: { graceDays: string; moraMonthlyRatePct: string; remindBefore: string; remindAfter: string }) => StockResult;
  reminderLogs: ReminderLog[];
  /** Registra que un recordatorio de cobranza se envió (o se omitió, con motivo). */
  logReminder: (reminder: Pick<Reminder, 'key' | 'planId' | 'installmentId' | 'stage'>, channel: ReminderLog['channel'], result: ReminderLog['result'], note: string) => StockResult;
  /** Cobra la mora acumulada de una cuota vencida generando una cuota «Mora». */
  chargeMora: (planId: string, installmentId: string) => StockResult;
  contractTemplate: ContractTemplate;
  /** Guarda la plantilla del contrato (sube la versión; pierde la marca de revisada si el texto cambió). */
  updateContractTemplate: (template: Omit<ContractTemplate, 'version' | 'updatedAt' | 'updatedBy'>) => StockResult;
  /** Datos con los que se arman el contrato y la ficha de una matrícula. */
  documentContextOf: (enrollmentId: string) => DocContext | undefined;
  /** Genera (o regenera, si los datos cambiaron) el contrato o la ficha de la matrícula. */
  generateEnrollmentDocument: (enrollmentId: string, kind: DocKind) => StockResult;
  /** Registra que el documento fue firmado (fecha y archivo escaneado). */
  registerDocumentSignature: (enrollmentId: string, kind: DocKind, input: { date: string; file: string }) => StockResult;
  changeRequests: ChangeRequest[];
  /** Pide reactivar una matrícula caída (la resuelve quien tiene autoridad). */
  requestReactivation: (enrollmentId: string, input: ReactivationInput) => StockResult;
  /** Pide cambiar el programa o el nivel de una matrícula activa. */
  requestProgramChange: (enrollmentId: string, input: ProgramChangeInput) => StockResult;
  /** Pide trasladar una matrícula activa a otra sede. */
  requestTransfer: (enrollmentId: string, input: TransferInput) => StockResult;
  /** Aprueba (aplica los efectos) o rechaza una solicitud de reactivación, cambio de programa o traslado. */
  resolveChangeRequest: (requestId: string, decision: 'Aprobada' | 'Rechazada', note: string) => StockResult;
  updatePettyFund: (fund: { assigned: string; maxExpense: string }) => StockResult;
  creditNotes: CreditNote[];
  /** ¿El usuario actual tiene el permiso `funcionalidad:acción`? (el Superusuario puede todo) */
  can: (permission: string) => boolean;
  addTracking: (tracking: Omit<Tracking, 'id'>) => Tracking;
  updateTracking: (id: string, data: Partial<Omit<Tracking, 'id'>>) => void;
  /** Cobra una cuota: una o varias partes (medios) y un comprobante. Valida y deja el pago, la cuota y la caja consistentes. */
  registerPayment: (planId: string, installmentId: string, input: RegisterPaymentInput) => StockResult;
  /** Traslada el saldo pendiente de una cuota a una cuota nueva con otro vencimiento (con motivo). */
  refinanceInstallment: (planId: string, installmentId: string, input: RefinanceInput) => StockResult;
  addLeadSource: (name: string) => void;
  updateLeadSource: (id: string, name: string, status: 'active' | 'inactive') => void;
  deleteLeadSource: (id: string) => void;
  updateEnrollmentVerification: (enrollmentId: string, data: {
    status: Enrollment['verificationStatus'];
    items: string[];
    observation?: string;
    date: string;
    verifier: string;
  }) => void;
  addProgram: (program: Omit<Program, 'id'>) => void;
  updateProgram: (id: string, program: Partial<Program>) => void;
  deleteProgram: (id: string) => void;
  addLevel: (level: Omit<Level, 'id'>) => void;
  updateLevel: (id: string, level: Partial<Level>) => void;
  deleteLevel: (id: string) => void;
  addPaymentType: (paymentType: Omit<PaymentType, 'id'>) => void;
  updatePaymentType: (id: string, paymentType: Partial<PaymentType>) => void;
  deletePaymentType: (id: string) => void;
  addTariff: (tariff: Omit<Tariff, 'id'>) => void;
  updateTariff: (id: string, tariff: Partial<Tariff>) => void;
  deleteTariff: (id: string) => void;
  addPromotion: (promotion: Omit<Promotion, 'id'>) => void;
  updatePromotion: (id: string, promotion: Partial<Promotion>) => void;
  deletePromotion: (id: string) => void;
  addBranch: (branch: Branch) => void;
  updateBranch: (id: string, branch: Partial<Branch>) => void;
  deleteBranch: (id: string) => void;
  isEnrollmentWizardOpen: boolean;
  setIsEnrollmentWizardOpen: (isOpen: boolean) => void;
  shipments: Shipment[];
  addShipment: (shipment: Omit<Shipment, 'id'>) => StockResult & { id?: string };
  updateShipmentStatus: (id: string, status: Shipment['status'], observation?: string) => StockResult;
  updateShipment: (id: string, shipment: Partial<Shipment>) => StockResult;
  deleteShipment: (id: string) => void;
  notifications: Notification[];
  addNotification: (notification: Omit<Notification, 'id' | 'date' | 'read'>) => void;
  markNotificationAsRead: (id: string) => void;
  incidents: ReceptionIncident[];
  currentBranchId: string;
  setCurrentBranchId: (id: string) => void;
  currentUser: { id: string; name: string; role: string; branchId: string | 'all' };
  confirmReception: (data: {
    docId: string;
    docType: 'Envío' | 'Transferencia';
    receivedItems: { itemId: string; quantity: number; status: 'ok' | 'missing' | 'damaged' | 'extra'; observation?: string }[];
    generalObservation?: string;
  }) => void;
}

export const DataContext = createContext<DataContextType | undefined>(undefined);

export function DataProvider({ children }: { children: ReactNode }) {
  const [guardians, setGuardians] = useState<Guardian[]>([
    { id: '1', name: 'Juan Ruiz', doc: '45678901', phone: '987654321', email: 'juan@email.com', students: 1, enrollments: 1, balance: '$800' },
    { id: '2', name: 'María Castro', doc: '45678902', phone: '987654322', email: 'maria@email.com', students: 1, enrollments: 1, balance: '$100' },
    { id: '3', name: 'Pedro Vega', doc: '45678903', phone: '987654323', email: 'pedro@email.com', students: 1, enrollments: 1, balance: '$1,750' },
    { id: '4', name: 'Ana Silva', doc: '45678904', phone: '987654324', email: 'ana@email.com', students: 1, enrollments: 1, balance: '$0' },
    { id: '5', name: 'Carlos Torres', doc: '45678905', phone: '987654325', email: 'carlos@email.com', students: 1, enrollments: 1, balance: '$0' },
  ]);

  const [students, setStudents] = useState<Student[]>([
    { id: 'ALU-001', doc: '76543210', name: 'Mateo Ruiz', age: 8, program: 'Kids - Nivel 1', titular: 'Juan Ruiz', status: 'Activo' },
    { id: 'ALU-002', doc: '76543211', name: 'Sofia Castro', age: 14, program: 'Kids - Nivel 2', titular: 'María Castro', status: 'Activo' },
    { id: 'ALU-003', doc: '76543212', name: 'Lucas Vega', age: 9, program: 'Kids - Nivel 3', titular: 'Pedro Vega', status: 'Inactivo' },
    { id: 'ALU-004', doc: '76543213', name: 'Valentina Silva', age: 5, program: 'Pre-Kids - Nivel 1', titular: 'Ana Silva', status: 'Activo' },
    { id: 'ALU-005', doc: '76543214', name: 'Diego Torres', age: 15, program: 'Kids - Nivel 1', titular: 'Carlos Torres', status: 'Activo' },
  ]);

  const [enrollments, setEnrollments] = useState<Enrollment[]>([
    { id: 'MAT-2024-001', date: '24 Mar 2024', student: 'Mateo Ruiz', program: 'Kids', programId: '1', level: 'Nivel 1', levelId: '1', sede: 'Piura', branchId: 'FIL-PIU', status: 'Activa', plan: 'Al día' },
    { id: 'MAT-2024-002', date: '23 Mar 2024', student: 'Sofia Castro', program: 'Kids', programId: '1', level: 'Nivel 2', levelId: '2', sede: 'Chiclayo', branchId: 'FIL-CHI', status: 'Activa', plan: 'Parcial' },
    { id: 'MAT-2024-003', date: '22 Mar 2024', student: 'Lucas Vega', program: 'Kids', programId: '1', level: 'Nivel 3', levelId: '3', sede: 'Piura', branchId: 'FIL-PIU', status: 'Caída', plan: 'Atrasado' },
    { id: 'MAT-2024-004', date: '20 Mar 2024', student: 'Valentina Silva', program: 'Pre-Kids', programId: '2', level: 'Nivel 1', levelId: '4', sede: 'Chiclayo', branchId: 'FIL-CHI', status: 'Activa', plan: 'Al día' },
    { id: 'MAT-2024-005', date: '19 Mar 2024', student: 'Diego Torres', program: 'Kids', programId: '1', level: 'Nivel 1', levelId: '1', sede: 'Piura', branchId: 'FIL-PIU', status: 'Activa', plan: 'Al día' },
  ]);

  const [plans, setPlans] = useState<Plan[]>([
    { 
      id: 'PLN-001', mat: 'MAT-2024-001', titular: 'Juan Ruiz', type: 'Plan 6 Cuotas', total: 1200, balance: 800, next: '15 Abr 2024', status: 'Al día',
      installments: [
        { id: 'C1', name: 'Cuota 1', amount: 200, balance: 0, dueDate: '15 Feb 2024', status: 'Pagada', payments: [{ id: 'P1', date: '10 Feb 2024', amount: 200, receipt: 'B001-000123' }] },
        { id: 'C2', name: 'Cuota 2', amount: 200, balance: 0, dueDate: '15 Mar 2024', status: 'Pagada', payments: [{ id: 'P2', date: '12 Mar 2024', amount: 200, receipt: 'B001-000456' }] },
        { id: 'C3', name: 'Cuota 3', amount: 200, balance: 200, dueDate: '15 Abr 2024', status: 'Pendiente', payments: [] },
        { id: 'C4', name: 'Cuota 4', amount: 200, balance: 200, dueDate: '15 May 2024', status: 'Pendiente', payments: [] },
        { id: 'C5', name: 'Cuota 5', amount: 200, balance: 200, dueDate: '15 Jun 2024', status: 'Pendiente', payments: [] },
        { id: 'C6', name: 'Cuota 6', amount: 200, balance: 200, dueDate: '15 Jul 2024', status: 'Pendiente', payments: [] },
      ]
    },
    { 
      id: 'PLN-002', mat: 'MAT-2024-002', titular: 'María Castro', type: 'Plan 6 Cuotas', total: 1200, balance: 100, next: '15 Abr 2024', status: 'Parcial',
      installments: [
        { id: 'C1', name: 'Cuota 1', amount: 200, balance: 0, dueDate: '15 Feb 2024', status: 'Pagada', payments: [{ id: 'P1', date: '10 Feb 2024', amount: 200, receipt: 'B001-000123' }] },
        { id: 'C2', name: 'Cuota 2', amount: 200, balance: 0, dueDate: '15 Mar 2024', status: 'Pagada', payments: [{ id: 'P2', date: '12 Mar 2024', amount: 200, receipt: 'B001-000456' }] },
        { id: 'C3', name: 'Cuota 3', amount: 200, balance: 100, dueDate: '15 Abr 2024', status: 'Parcial', payments: [{ id: 'P3', date: '10 Abr 2024', amount: 100, receipt: 'B001-000501' }] },
        { id: 'C4', name: 'Cuota 4', amount: 200, balance: 200, dueDate: '15 May 2024', status: 'Pendiente', payments: [] },
        { id: 'C5', name: 'Cuota 5', amount: 200, balance: 200, dueDate: '15 Jun 2024', status: 'Pendiente', payments: [] },
        { id: 'C6', name: 'Cuota 6', amount: 200, balance: 200, dueDate: '15 Jul 2024', status: 'Pendiente', payments: [] },
      ]
    },
    { 
      id: 'PLN-003', mat: 'MAT-2024-003', titular: 'Pedro Vega', type: 'Plan 12 Cuotas', total: 2100, balance: 1750, next: '05 Abr 2024', status: 'Atrasado',
      installments: [
        { id: 'C1', name: 'Cuota 1', amount: 175, balance: 0, dueDate: '05 Ene 2024', status: 'Pagada', payments: [{ id: 'P3', date: '04 Ene 2024', amount: 175, receipt: 'F001-000890' }] },
        { id: 'C2', name: 'Cuota 2', amount: 175, balance: 0, dueDate: '05 Feb 2024', status: 'Pagada', payments: [{ id: 'P4', date: '05 Feb 2024', amount: 175, receipt: 'F001-000912' }] },
        { id: 'C3', name: 'Cuota 3', amount: 175, balance: 75, dueDate: '05 Mar 2024', status: 'Parcial', payments: [{ id: 'P5', date: '10 Mar 2024', amount: 100, receipt: 'B001-000501' }] },
        { id: 'C4', name: 'Cuota 4', amount: 175, balance: 175, dueDate: '05 Abr 2024', status: 'Vencida', payments: [] },
      ]
    },
    { 
      id: 'PLN-004', mat: 'MAT-2024-004', titular: 'Ana Silva', type: 'Contado', total: 1000, balance: 0, next: '-', status: 'Al día',
      installments: []
    },
    { 
      id: 'PLN-005', mat: 'MAT-2024-005', titular: 'Carlos Torres', type: 'Contado', total: 1500, balance: 0, next: '-', status: 'Al día',
      installments: []
    },
  ]);

  const [payments, setPayments] = useState<Payment[]>([
    { id: 'PAG-001', date: '24 Mar 2024', student: 'Mateo Ruiz', concept: 'Cuota 1', amount: 250.00, method: 'Transferencia', receipt: 'B001-000123', status: 'Aprobado' },
    { id: 'PAG-002', date: '23 Mar 2024', student: 'Sofia Castro', concept: 'Matrícula', amount: 150.00, method: 'Yape', receipt: 'B001-000124', status: 'Aprobado' },
    { id: 'PAG-003', date: '22 Mar 2024', student: 'Lucas Vega', concept: 'Artículos', amount: 80.00, method: 'Efectivo', receipt: 'B001-000125', status: 'Aprobado' },
  ]);

  const [items, setItems] = useState<Item[]>([
    { 
      id: 'ITM-LIB-K1', 
      name: 'Libro Kids Nivel 1', 
      type: 'Libro', 
      cost: 45.00, 
      status: 'Activo',
      description: 'Libro de nivel 1 para programa Kids',
      unit: 'Unidad',
      isSold: true,
      salePrice: 60.00,
      isDeliveredOnEnrollment: true,
      isPackage: false,
      allowUnpacking: false,
      bookType: 'Individual',
      bindingType: 'Encolado'
    },
    { 
      id: 'ITM-MAT-01', 
      name: 'Material Lógico Matemático', 
      type: 'Material educativo', 
      cost: 20.00, 
      status: 'Activo',
      description: 'Material para desarrollo lógico',
      unit: 'Unidad',
      isSold: false,
      isDeliveredOnEnrollment: true,
      isPackage: false,
      allowUnpacking: false,
      sessions: 12,
      gymnasticsPerSession: 2,
      trainingsPerSession: 3,
      trainingMode: 'General'
    },
    { 
      id: 'ITM-KIT-BIENV', 
      name: 'Kit Bienvenida (Mochila + Útiles)', 
      type: 'Paquete / kit logístico', 
      cost: 80.00, 
      status: 'Activo',
      description: 'Kit entregado al matricular',
      unit: 'Kit',
      isSold: false,
      isDeliveredOnEnrollment: true,
      isPackage: true,
      allowUnpacking: true,
      composition: [
        { itemId: 'ITM-HER-01', name: 'Mochila Institucional', quantity: 1 },
        { itemId: 'ITM-HER-02', name: 'Cartuchera', quantity: 1 }
      ]
    },
    { 
      id: 'ITM-HER-01', 
      name: 'Mochila Institucional', 
      type: 'Herramienta / adicional', 
      cost: 25.00, 
      status: 'Activo',
      description: 'Mochila con logo ENSIL',
      unit: 'Unidad',
      isSold: true,
      salePrice: 45.00,
      isDeliveredOnEnrollment: true,
      isPackage: false,
      allowUnpacking: false
    },
    { 
      id: 'ITM-HER-02', 
      name: 'Cartuchera', 
      type: 'Herramienta / adicional', 
      cost: 5.00, 
      status: 'Activo',
      description: 'Cartuchera básica',
      unit: 'Unidad',
      isSold: true,
      salePrice: 10.00,
      isDeliveredOnEnrollment: true,
      isPackage: false,
      allowUnpacking: false
    },
  ]);

  const [cashMovements, setCashMovements] = useState<CashMovement[]>([
    { id: 'CJ-001', date: '2026-10-09T10:30:00.000Z', kind: 'Ingreso', concept: 'Ingreso Cuota', reference: 'PLN-001 / Juan Ruiz', currency: 'PEN', amount: 1200, amountUSD: 0, method: 'Transferencia', user: 'Ana G.', status: 'Aplicado' },
    { id: 'CJ-002', date: '2026-10-09T09:15:00.000Z', kind: 'Ingreso', concept: 'Ingreso Matrícula', reference: 'MAT-2024-002 / María Castro', currency: 'PEN', amount: 950, amountUSD: 0, method: 'Efectivo', user: 'Carlos R.', status: 'Aplicado' },
    { id: 'CJ-003', date: '2026-10-08T17:45:00.000Z', kind: 'Egreso', concept: 'Egreso', reference: 'Pago Proveedor Limpieza', currency: 'PEN', amount: 350, amountUSD: 0, method: 'Efectivo', user: 'Admin', status: 'Aplicado' },
  ]);
  const [promotionGroups, setPromotionGroups] = useState<PromotionGroup[]>([]);
  const [creditNotes, setCreditNotes] = useState<CreditNote[]>([]);
  const [cashClosures, setCashClosures] = useState<CashClosure[]>([]);
  const [changeRequests, setChangeRequests] = useState<ChangeRequest[]>([]);
  const [collectionPolicy, setCollectionPolicy] = useState<CollectionPolicy>(DEFAULT_POLICY);
  const [reminderLogs, setReminderLogs] = useState<ReminderLog[]>([]);
  const [contractTemplate, setContractTemplate] = useState<ContractTemplate>(DEFAULT_CONTRACT_TEMPLATE);
  const [pettyFund, setPettyFund] = useState<PettyFund>(DEFAULT_FUND);

  // Caja chica: fondo fijo en soles. Semilla: los tres movimientos de ejemplo que mostraba la pantalla.
  const [pettyCashMovements, setPettyCashMovements] = useState<PettyCashMovement[]>(() => {
    const at = (back: number, hh: string) => new Date(`${addDaysISO(todayLocalISO(), -back)}T${hh}:00`).toISOString();
    return [
      { id: 'CCH-003', date: at(0, '11:30'), kind: 'Egreso', category: 'Movilidad', concept: 'Taxi a notaría', amount: 25, method: 'Efectivo', user: 'Ana G.', status: 'Aplicado' },
      { id: 'CCH-002', date: at(1, '15:20'), kind: 'Egreso', category: 'Útiles de oficina', concept: 'Compra de papel bond', amount: 120, method: 'Efectivo', reference: 'Boleta B001-0456', user: 'Carlos R.', status: 'Aplicado' },
      { id: 'CCH-001', date: at(3, '09:00'), kind: 'Ingreso', category: 'Reposición de fondo', concept: 'Reposición de fondo fijo', amount: 1000, method: 'Efectivo', user: 'Admin', status: 'Aplicado' },
    ];
  });

  // Horarios de clases (antes una lista fija dentro del asistente)
  const [classSchedules, setClassSchedules] = useState<ClassSchedule[]>([
    { id: 'HOR-001', name: 'L-M-V 4:00 PM', allBranches: true, branchIds: [], status: 'Activo' },
    { id: 'HOR-002', name: 'L-M-V 5:00 PM', allBranches: true, branchIds: [], status: 'Activo' },
    { id: 'HOR-003', name: 'Sábados 9:00 AM', allBranches: true, branchIds: [], status: 'Activo' },
  ]);

  const normalizeName = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

  const addClassSchedule = (data: Omit<ClassSchedule, 'id'>): StockResult => {
    if (!data.name.trim()) return { ok: false, error: 'El nombre del horario es obligatorio.' };
    if (classSchedules.some(h => normalizeName(h.name) === normalizeName(data.name))) {
      return { ok: false, error: 'Ya existe un horario con ese nombre.' };
    }
    if (!data.allBranches && data.branchIds.length === 0) return { ok: false, error: 'Seleccione al menos una sede o marque todas.' };
    const id = nextSequentialId('HOR', classSchedules.map(h => h.id));
    setClassSchedules(prev => [...prev, { ...data, name: data.name.trim(), id }]);
    return { ok: true };
  };

  const updateClassSchedule = (id: string, data: Partial<Omit<ClassSchedule, 'id'>>): StockResult => {
    const current = classSchedules.find(h => h.id === id);
    if (!current) return { ok: false, error: 'Horario no encontrado.' };
    const next = { ...current, ...data };
    if (!next.name.trim()) return { ok: false, error: 'El nombre del horario es obligatorio.' };
    if (classSchedules.some(h => h.id !== id && normalizeName(h.name) === normalizeName(next.name))) {
      return { ok: false, error: 'Ya existe un horario con ese nombre.' };
    }
    if (!next.allBranches && next.branchIds.length === 0) return { ok: false, error: 'Seleccione al menos una sede o marque todas.' };
    setClassSchedules(prev => prev.map(h => (h.id === id ? { ...next, name: next.name.trim() } : h)));
    return { ok: true };
  };

  const deleteClassSchedule = (id: string): StockResult => {
    const current = classSchedules.find(h => h.id === id);
    if (!current) return { ok: false, error: 'Horario no encontrado.' };
    const used = students.filter(s => s.horario === current.name).length;
    if (used > 0) return { ok: false, error: `El horario lo usan ${used} alumno(s). Inactívelo en lugar de eliminarlo.` };
    setClassSchedules(prev => prev.filter(h => h.id !== id));
    return { ok: true };
  };

  const addCashMovement = (m: Omit<CashMovement, 'id' | 'date' | 'user' | 'status'> & { date?: string }): CashMovement => {
    const created: CashMovement = {
      ...m,
      id: `CJ-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      date: m.date ?? new Date().toISOString(),
      user: currentUser.name,
      status: 'Aplicado',
    };
    setCashMovements(prev => [created, ...prev]);
    return created;
  };

  // Precios de venta con vigencia (USD). Semilla: precios generales de los artículos vendibles.
  const [itemPrices, setItemPrices] = useState<ItemPrice[]>([
    { id: 'PRC-001', itemId: 'ITM-LIB-K1', branchId: 'all', amount: 60, validFrom: '2026-01-01', createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'Sistema' },
    { id: 'PRC-002', itemId: 'ITM-HER-01', branchId: 'all', amount: 45, validFrom: '2026-01-01', createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'Sistema' },
    { id: 'PRC-003', itemId: 'ITM-HER-02', branchId: 'all', amount: 10, validFrom: '2026-01-01', createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'Sistema' },
  ]);

  const [stockItems, setStockItems] = useState<StockItem[]>([
    { id: 'STK-001', itemId: 'ITM-LIB-K1', branchId: 'FIL-PIU', stock: 100, minStock: 50 },
    { id: 'STK-002', itemId: 'ITM-MAT-01', branchId: 'FIL-PIU', stock: 50, minStock: 30 },
    { id: 'STK-003', itemId: 'ITM-KIT-BIENV', branchId: 'FIL-PIU', stock: 25, minStock: 5 },
    { id: 'STK-004', itemId: 'ITM-HER-01', branchId: 'FIL-PIU', stock: 40, minStock: 10 },
    { id: 'STK-005', itemId: 'ITM-HER-02', branchId: 'FIL-PIU', stock: 40, minStock: 5 },
    { id: 'STK-006', itemId: 'ITM-LIB-K1', branchId: 'FIL-CHI', stock: 85, minStock: 40 },
    { id: 'STK-007', itemId: 'ITM-HER-01', branchId: 'FIL-CHI', stock: 5, minStock: 5 },
    { id: 'STK-008', itemId: 'ITM-MAT-01', branchId: 'FIL-CHI', stock: 15, minStock: 10 },
    { id: 'STK-009', itemId: 'ITM-KIT-BIENV', branchId: 'FIL-CHI', stock: 8, minStock: 3 },
    { id: 'STK-010', itemId: 'ITM-HER-02', branchId: 'FIL-CHI', stock: 10, minStock: 5 },
  ]);

  const [kardex, setKardex] = useState<KardexEntry[]>([
    { id: 'KDX-001', date: '2024-03-15 14:30', branch: 'Piura', material: 'Libro Kids Nivel 1', type: 'Ingreso', qty: 50, prevBalance: 100, newBalance: 150, user: 'Admin', doc: 'COMP-2024-001' },
    { id: 'KDX-002', date: '2024-03-15 10:15', branch: 'Piura', material: 'Libro Kids Nivel 1', type: 'Salida por matrícula', qty: -1, prevBalance: 151, newBalance: 150, user: 'Ventas Piura', doc: 'MAT-2024-001' },
    { id: 'KDX-003', date: '2024-03-14 16:45', branch: 'Piura', material: 'Libro Kids Nivel 1', type: 'Transferencia Salida', qty: -10, prevBalance: 160, newBalance: 150, user: 'Logística Central', doc: 'TRF-2024-001' },
    { id: 'KDX-004', date: '2024-03-10 11:30', branch: 'Chiclayo', material: 'Mochila Institucional', type: 'Transferencia Entrada', qty: 5, prevBalance: 0, newBalance: 5, user: 'Logística Chiclayo', doc: 'TRF-2024-003' },
    { id: 'KDX-005', date: '2024-03-13 11:20', branch: 'Piura', material: 'Material Lógico Matemático', type: 'Ajuste Positivo', qty: 5, prevBalance: 45, newBalance: 50, user: 'Admin', doc: 'AJU-2024-001' },
    { id: 'KDX-008', date: '2024-03-15 16:00', branch: 'Piura', material: 'Mochila Institucional', type: 'Transferencia Salida', qty: -20, prevBalance: 60, newBalance: 40, user: 'Logística Central', doc: 'ENV-2024-001', observation: 'Despacho de envío ENV-2024-001' },
    { id: 'KDX-007', date: '2024-03-15 16:00', branch: 'Piura', material: 'Libro Kids Nivel 1', type: 'Transferencia Salida', qty: -50, prevBalance: 150, newBalance: 100, user: 'Logística Central', doc: 'ENV-2024-001', observation: 'Despacho de envío ENV-2024-001' },
    { id: 'KDX-006', date: '2024-03-12 15:00', branch: 'Chiclayo', material: 'Libro Kids Nivel 1', type: 'Merma', qty: -2, prevBalance: 87, newBalance: 85, user: 'Logística Chiclayo', doc: 'MER-2024-001' },
  ]);

  const [transfers, setTransfers] = useState<Transfer[]>([
    { 
      id: 'TRF-2024-001', 
      date: '2024-03-15', 
      originId: 'FIL-PIU', 
      destinationId: 'FIL-CHI', 
      status: 'En tránsito', 
      eta: '2024-03-20',
      items: [
        { itemId: 'ITM-LIB-K1', quantity: 10 },
        { itemId: 'ITM-MAT-01', quantity: 5 }
      ], 
      reason: 'Reposición', 
      shippingMethodId: 'SM-001', 
      courierId: 'COUR-001', 
      trackingNumber: 'TRK-123456' 
    },
    { 
      id: 'TRF-2024-002', 
      date: '2024-03-14', 
      originId: 'FIL-CHI', 
      destinationId: 'FIL-PIU', 
      status: 'Borrador', 
      items: [
        { itemId: 'ITM-KIT-BIENV', quantity: 2 }
      ], 
      reason: 'Redistribución', 
      shippingMethodId: 'SM-002', 
      travelerName: 'Juan Pérez' 
    },
    { 
      id: 'TRF-2024-003', 
      date: '2024-03-10', 
      originId: 'FIL-PIU', 
      destinationId: 'FIL-CHI', 
      status: 'Recibida', 
      receptionDate: '2024-03-10',
      receivedBy: 'María Torres',
      items: [
        { itemId: 'ITM-HER-01', quantity: 5 }
      ], 
      reason: 'Apoyo temporal', 
      shippingMethodId: 'SM-003', 
      internalLogisticsObservation: 'Vehículo de la empresa' 
    },
  ]);

  const [shipments, setShipments] = useState<Shipment[]>([
    {
      id: 'ENV-2024-001',
      date: '2024-03-15',
      originId: 'FIL-PIU', // Piura (Almacén Central)
      destinationId: 'FIL-CHI', // Chiclayo
      status: 'En tránsito',
      boxes: [
        {
          id: 'BOX-1',
          boxNumber: 'Caja 1',
          items: [
            { itemId: 'ITM-LIB-K1', quantity: 50 }
          ]
        },
        {
          id: 'BOX-2',
          boxNumber: 'Caja 2',
          items: [
            { itemId: 'ITM-HER-01', quantity: 20 }
          ]
        }
      ],
      items: [
        { itemId: 'ITM-LIB-K1', quantity: 50 },
        { itemId: 'ITM-HER-01', quantity: 20 }
      ],
      shippingMethodId: 'SM-001',
      courierId: 'COUR-001',
      trackingNumber: 'TRK-123456',
      eta: '2024-03-18',
      etaTime: '15:00'
    }
  ]);

  const [couriers, setCouriers] = useState<Courier[]>([
    { id: 'COUR-001', code: 'C-001', name: 'Olva Courier', address: 'Av. Argentina 123', reference: 'Frente al parque', phone: '01-123-4567', status: 'Activo', observations: 'Entrega en 24h' },
    { id: 'COUR-002', code: 'C-002', name: 'Shalom', address: 'Av. Javier Prado 456', reference: 'Cerca al óvalo', phone: '01-987-6543', status: 'Activo', observations: 'Recojo en agencia' },
  ]);

  const [shippingMethods, setShippingMethods] = useState<ShippingMethod[]>([
    { id: 'SM-001', name: 'Courier', status: 'Activo', observations: 'Envío por agencia externa' },
    { id: 'SM-002', name: 'Viajero', status: 'Activo', observations: 'Envío con personal viajero' },
    { id: 'SM-003', name: 'Recojo interno', status: 'Activo', observations: 'Recojo por logística interna' },
    { id: 'SM-004', name: 'Otro', status: 'Activo', observations: 'Otros métodos' },
  ]);

  const [adjustments, setAdjustments] = useState<Adjustment[]>([
    { id: 'AJU-2024-001', date: '2024-03-15', branch: 'Piura', material: 'Material Lógico Matemático', type: 'Ajuste Positivo', qty: 5, reason: 'Diferencia de conteo', user: 'Admin' },
    { id: 'MER-2024-001', date: '2024-03-14', branch: 'Chiclayo', material: 'Libro Kids Nivel 1', type: 'Merma', qty: -2, reason: 'Deterioro', user: 'Logística Chiclayo' },
    { id: 'AJU-2024-002', date: '2024-03-10', branch: 'Piura', material: 'Mochila Institucional', type: 'Ajuste Negativo', qty: -1, reason: 'Error anterior', user: 'Superadmin' },
    { id: 'DEV-2024-001', date: '2024-03-05', branch: 'Piura', material: 'Cartuchera', type: 'Devolución', qty: 1, reason: 'Devolución', user: 'Ventas Piura' },
  ]);

  // Reservas de ejemplo con fechas relativas a hoy (siempre en días con atención y en horarios permitidos)
  const seedDay = (offset: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    while (d.getDay() === 0) d.setDate(d.getDate() + 1); // domingo: sin atención
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  // Diego Torres: su primera asesoría fue hace casi 3 meses, así que su duración base está por vencer (ejemplo de la alerta)
  const expiringStart = (() => {
    const d = addMonths(addDaysISO(todayLocalISO(), 10), -3);
    return weekdayIndex(d) === 6 ? addDaysISO(d, 1) : d;
  })();
  const [schedules, setSchedules] = useState<Schedule[]>([
    { id: '1', student: 'Mateo Ruiz', studentId: 'ALU-001', branchId: 'FIL-PIU', program: 'Kids', level: 'Nivel 1', date: seedDay(0), time: '16:00', duration: 60, responsible: 'Lic. María Torres', status: 'Asistió', isFirst: true, registrationId: 'REG-SEED-1', enrollmentId: 'MAT-2024-001' },
    { id: '2', student: 'Sofia Castro', studentId: 'ALU-002', branchId: 'FIL-CHI', program: 'Kids', level: 'Nivel 2', date: seedDay(0), time: '17:00', duration: 60, responsible: 'Lic. Juan Pérez', status: 'Reservado' },
    { id: '3', student: 'Lucas Vega', studentId: 'ALU-003', branchId: 'FIL-PIU', program: 'Kids', level: 'Nivel 3', date: seedDay(1), time: '16:00', duration: 60, responsible: 'Lic. María Torres', status: 'Cancelado' },
    { id: '4', student: 'Valentina Silva', studentId: 'ALU-004', branchId: 'FIL-CHI', program: 'Pre-Kids', level: 'Nivel 1', date: seedDay(2), time: '17:00', duration: 60, responsible: 'Lic. Juan Pérez', status: 'Reservado', isFirst: true, registrationId: 'REG-SEED-2', enrollmentId: 'MAT-2024-004' },
    { id: '5', student: 'Diego Torres', studentId: 'ALU-005', branchId: 'FIL-PIU', program: 'Kids', level: 'Nivel 1', date: seedDay(3), time: '18:00', duration: 60, responsible: 'Lic. María Torres', status: 'Reservado' },
    { id: '6', student: 'Diego Torres', studentId: 'ALU-005', branchId: 'FIL-PIU', program: 'Kids', level: 'Nivel 1', date: expiringStart, time: '16:00', duration: 60, responsible: 'Lic. María Torres', status: 'Asistió', isFirst: true, registrationId: 'REG-SEED-3', enrollmentId: 'MAT-2024-005' },
  ]);

  // Historial de Psicopedagogía: cada cambio de la agenda deja un evento
  const [psyEvents, setPsyEvents] = useState<PsyEvent[]>([
    { id: 'EVT-0001', at: new Date(Date.now() - 86400000).toISOString(), by: 'Superadmin', subject: 'asesoria', refId: '3', studentId: 'ALU-003', type: 'Cancelada', initiator: 'Alumno o titular', reason: 'Enfermedad del alumno', detail: 'Avisó la mañana anterior.', from: { date: seedDay(1), time: '16:00', responsible: 'Lic. María Torres' } },
  ]);
  const eventSeq = useRef(2);
  const nextEventId = () => `EVT-${String(eventSeq.current++).padStart(4, '0')}`;
  const pushEvents = (events: PsyEvent[]) => { if (events.length > 0) setPsyEvents(prev => [...prev, ...events]); };
  /** Cancelaciones que hace el sistema por otra causa (caída de la matrícula, traslado de sede). */
  const logSystemCancel = (scheduleIds: string[], reason: string) => pushEvents(
    schedules.filter(s => scheduleIds.includes(s.id)).map(s => ({
      id: nextEventId(), at: new Date().toISOString(), by: currentUser.name, subject: 'asesoria' as const, refId: s.id, studentId: s.studentId,
      type: 'Cancelada' as const, initiator: 'Institución' as const, reason, from: { date: s.date, time: s.time, responsible: s.responsible },
    }))
  );
  const logActivityRemovals = (removals: { monthlyId: string; activityId: string; studentId: string }[], reason: string) => pushEvents(
    removals.map(r => ({
      id: nextEventId(), at: new Date().toISOString(), by: currentUser.name, subject: 'actividad' as const, refId: `${r.monthlyId}:${r.activityId}`, studentId: r.studentId,
      type: 'Inscripción quitada' as const, initiator: 'Institución' as const, reason,
    }))
  );

  const addSchedule = (data: Omit<Schedule, 'id'>): Schedule => {
    const created: Schedule = { ...data, id: nextNumericId(schedules.map(x => x.id)) };
    setSchedules(prev => [...prev, created]);
    pushEvents(buildScheduleEvents(undefined, created, undefined, currentUser.name, new Date().toISOString(), nextEventId));
    return created;
  };

  const gateContext = () => ({ schedules, plans, recipes, today: todayLocalISO(), now: new Date() });
  const gateOfSchedule: DataContextType['gateOfSchedule'] = s => scheduleGate(s, enrollments, gateContext());
  const attendanceBlockOf: DataContextType['attendanceBlockOf'] = s => attendanceBlock(s, enrollments, gateContext());
  const pendingFirstSessions = () => blockedFirstSessions(enrollments, gateContext());

  const updateSchedule: DataContextType['updateSchedule'] = (id, data, meta) => {
    const target = schedules.find(x => x.id === id);
    if (!target) return { ok: false, reason: 'No se encontró la asesoría.' };
    const next: Schedule = { ...target, ...data };
    // La verificación va antes de la primera asesoría: sin ella no se marca asistencia ni falta
    if (data.status === 'Asistió' || data.status === 'Faltó') {
      const reason = attendanceBlockOf(target);
      if (reason) return { ok: false, reason };
    }
    // Cancelar o reprogramar exige el motivo (y quién lo pidió); con menos de 24 h solo lo decide la institución
    const cancelling = next.status === 'Cancelado' && target.status !== 'Cancelado';
    const moved = next.status !== 'Cancelado' && (next.date !== target.date || next.time !== target.time || next.responsible.trim() !== target.responsible.trim());
    if (cancelling || moved) {
      const problems = validateChangeMeta(cancelling ? 'cancelar' : 'reprogramar', meta, {
        withNotice: !changeBlockedByNotice(target, new Date()),
        canInstitutional: can(PERM.psiInstitutionalChange),
        materialsMissing: gateOfSchedule(target).blocked,
      });
      if (problems.length > 0) return { ok: false, reason: problems[0] };
    }
    pushEvents(buildScheduleEvents(target, next, meta, currentUser.name, new Date().toISOString(), nextEventId));
    setSchedules(prev => prev.map(x => (x.id === id ? { ...x, ...data } : x)));
    return { ok: true };
  };

  const [trackings, setTrackings] = useState<Tracking[]>([
    { id: '1', studentId: 'ALU-001', date: '2026-03-24', status: 'Asistió', metrics: { modulo: 'Módulo 3', velocidad: 250, comprension: 85 }, observations: 'Buen progreso en lectura rápida.' },
    { id: '2', studentId: 'ALU-001', date: '2026-03-17', status: 'Asistió', metrics: { modulo: 'Módulo 3', velocidad: 220, comprension: 80 }, observations: 'Se recomienda repasar ejercicios de fijación.' },
    { id: '3', studentId: 'ALU-001', date: '2026-03-10', status: 'Faltó', metrics: null, observations: 'Avisó con anticipación por motivos de salud.' },
    { id: '4', studentId: 'ALU-002', date: '2026-03-25', status: 'Asistió', metrics: { modulo: 'Módulo 5', velocidad: 300, comprension: 90 }, observations: 'Excelente comprensión.' },
    { id: '6', studentId: 'ALU-005', scheduleId: '6', date: expiringStart, status: 'Asistió', metrics: { nivel: 'Nivel 1', sesion: 'Sesión 1', velocidad: 110, comprension: 75 }, observations: 'Primera asesoría: diagnóstico inicial.', checklist: { guardianAttended: true, methodologyExplained: true, itemsExplained: true } },
    { id: '5', studentId: 'ALU-004', date: '2026-03-26', status: 'Asistió', metrics: { nivel: 'Nivel 1', sesion: 'Sesión 2', velocidad: 100, comprension: 70 }, observations: 'Mejorando la pronunciación.' },
  ]);

  const seedMonth = (iso: string) => ({ mes: MONTHS[Number(iso.split('-')[1]) - 1], anio: Number(iso.split('-')[0]) });
  const [monthlySchedules, setMonthlySchedules] = useState<MonthlySchedule[]>([
    {
      id: '1',
      branchId: 'FIL-PIU',
      sede: 'Piura',
      ...seedMonth(seedDay(5)),
      titulo: 'Cronograma de Actividades - Piura',
      actividades: [
        { id: 'a1', actividad: 'Taller de Ortografía', fecha: seedDay(2), horaInicio: '16:00', horaFin: '18:00', responsable: '', orden: 1, cupo: 12, inscritos: [] },
        { id: 'a2', actividad: 'Maratón de Lectura', fecha: seedDay(5), horaInicio: '17:00', horaFin: '19:00', responsable: '', orden: 2, cupo: null, inscritos: ['ALU-001', 'ALU-005'] },
        {
          id: 'a0', actividad: 'Taller de Velocidad Lectora', fecha: seedDay(-3), horaInicio: '15:00', horaFin: '17:00', responsable: 'Juan Pérez', responsableId: '1', orden: 3, cupo: 10,
          inscritos: ['ALU-001', 'ALU-003', 'ALU-005'],
          asistencia: {
            'ALU-001': { status: 'Asistió', at: new Date(Date.now() - 3 * 86400000).toISOString(), by: 'Superadmin' },
            'ALU-003': { status: 'Faltó', at: new Date(Date.now() - 3 * 86400000).toISOString(), by: 'Superadmin', note: 'No avisó.' },
            'ALU-005': { status: 'Asistió', at: new Date(Date.now() - 3 * 86400000).toISOString(), by: 'Superadmin' },
          },
        },
      ],
      observaciones: 'Mes con enfoque en comprensión lectora.'
    },
    {
      id: '2',
      branchId: 'FIL-CHI',
      sede: 'Chiclayo',
      ...seedMonth(seedDay(3)),
      titulo: 'Actividades Psicopedagógicas Chiclayo',
      actividades: [
        { id: 'b1', actividad: 'Taller para Padres', fecha: seedDay(3), horaInicio: '18:00', horaFin: '20:00', responsable: '', orden: 1, cupo: 20, inscritos: [] },
        { id: 'b2', actividad: 'Evaluación de Avance', fecha: seedDay(6), horaInicio: '16:00', horaFin: '19:00', responsable: '', orden: 2, cupo: null, inscritos: [] },
      ],
      observaciones: ''
    }
  ]);

  const addMonthlySchedule = (data: Omit<MonthlySchedule, 'id'>): MonthlySchedule => {
    const created: MonthlySchedule = { ...data, id: nextNumericId(monthlySchedules.map(x => x.id)) };
    setMonthlySchedules(prev => [...prev, created]);
    return created;
  };

  const updateMonthlySchedule = (id: string, data: Partial<Omit<MonthlySchedule, 'id'>>) => {
    setMonthlySchedules(prev => prev.map(x => (x.id === id ? { ...x, ...data } : x)));
  };

  const deleteMonthlySchedule = (id: string) => {
    setMonthlySchedules(prev => prev.filter(x => x.id !== id));
  };

  // ---- Actividades especiales: responsable, inscripción y asistencia (cada acción deja su evento)
  const flatActivityOf = (flatId: string) => allActivities(monthlySchedules).find(a => a.id === flatId);
  const patchActivity = (a: FlatActivity, fn: (x: ScheduleActivity) => ScheduleActivity) =>
    setMonthlySchedules(prev => prev.map(m => (m.id === a.monthlyId ? { ...m, actividades: m.actividades.map(x => (x.id === a.activityId ? fn(x) : x)) } : m)));
  const activityEvent = (a: FlatActivity, type: PsyEventType, extra: Partial<PsyEvent> = {}): PsyEvent =>
    ({ id: nextEventId(), at: new Date().toISOString(), by: currentUser.name, subject: 'actividad', refId: a.id, type, ...extra });

  const setActivityResponsible: DataContextType['setActivityResponsible'] = (flatId, staffId) => {
    if (!can(PERM.psiActivityLead)) return { ok: false, error: 'Su rol no puede asignar el responsable de una actividad.' };
    const a = flatActivityOf(flatId);
    if (!a) return { ok: false, error: 'No se encontró la actividad.' };
    const problems = validateResponsible(a, staffId, { schedules, activities: allActivities(monthlySchedules), staff, assignments, branches });
    if (problems.length > 0) return { ok: false, error: problems[0] };
    const member = staffId ? staff.find(s => s.id === staffId) : undefined;
    patchActivity(a, x => ({ ...x, responsable: member ? staffLabel(member) : '', responsableId: member?.id }));
    pushEvents([activityEvent(a, 'Responsable asignado', { detail: member ? staffLabel(member) : 'Se quitó el responsable' })]);
    return { ok: true };
  };

  const enrollInActivity: DataContextType['enrollInActivity'] = (flatId, studentId) => {
    if (!can(PERM.psiSchedule)) return { ok: false, error: 'Su rol no puede inscribir alumnos en actividades.' };
    const a = flatActivityOf(flatId);
    const student = students.find(s => s.id === studentId);
    if (!a || !student) return { ok: false, error: 'No se encontró la actividad o el alumno.' };
    if (a.date < todayLocalISO()) return { ok: false, error: 'La actividad ya pasó: no admite inscripciones.' };
    const problem = validateActivityEnrollment({ activity: a, studentId, studentName: student.name, studentBranchId: branchOfStudent(student, enrollments), schedules });
    if (problem) return { ok: false, error: problem };
    patchActivity(a, x => withEnrollment(x, studentId));
    pushEvents([activityEvent(a, 'Inscripción', { studentId })]);
    return { ok: true };
  };

  const unenrollFromActivity: DataContextType['unenrollFromActivity'] = (flatId, studentId, meta) => {
    if (!can(PERM.psiSchedule)) return { ok: false, error: 'Su rol no puede quitar inscripciones.' };
    const a = flatActivityOf(flatId);
    if (!a) return { ok: false, error: 'No se encontró la actividad.' };
    if (a.date < todayLocalISO()) return { ok: false, error: 'La actividad ya pasó: no se quitan inscripciones.' };
    if (!canRemoveEnrollment(a, studentId)) return { ok: false, error: 'Ya tiene asistencia registrada: no se puede quitar la inscripción.' };
    const problems = validateChangeMeta('cancelar', meta, { withNotice: canChangeWithNotice(a.date, a.start, new Date()), canInstitutional: can(PERM.psiInstitutionalChange) });
    if (problems.length > 0) return { ok: false, error: problems[0] };
    patchActivity(a, x => withoutEnrollment(x, studentId));
    pushEvents([activityEvent(a, 'Inscripción quitada', { studentId, reason: meta.reason, detail: meta.detail?.trim() || undefined, initiator: initiatorOfReason(meta.reason ?? '') })]);
    return { ok: true };
  };

  const markActivityAttendance: DataContextType['markActivityAttendance'] = (flatId, studentId, status, note) => {
    if (!can(PERM.psiActivityAttendance)) return { ok: false, error: 'Su rol no puede registrar la asistencia a actividades.' };
    const a = flatActivityOf(flatId);
    if (!a) return { ok: false, error: 'No se encontró la actividad.' };
    const text = (note ?? '').trim();
    if (status === null) {
      if (!a.attendance[studentId]) return { ok: false, error: 'El alumno no tiene marca de asistencia.' };
      if (text.length < 5) return { ok: false, error: 'Explique por qué se quita la marca: queda en el historial.' };
      patchActivity(a, x => ({ ...x, asistencia: withoutAttendance(x.asistencia ?? {}, studentId) }));
      pushEvents([activityEvent(a, 'Asistencia a actividad', { studentId, detail: 'Marca quitada', reason: text })]);
      return { ok: true };
    }
    const problems = validateAttendance(a, studentId, status, todayLocalISO());
    if (problems.length > 0) return { ok: false, error: problems[0] };
    patchActivity(a, x => ({ ...x, asistencia: withAttendance(x.asistencia ?? {}, studentId, { status, at: new Date().toISOString(), by: currentUser.name, note: text || undefined }) }));
    pushEvents([activityEvent(a, 'Asistencia a actividad', { studentId, detail: status, reason: text || undefined })]);
    return { ok: true };
  };

  // ---- Recordatorios de Psicopedagogía (el sistema prepara el texto; aquí queda el registro de lo enviado u omitido)
  const [psyReminderPolicy, setPsyReminderPolicy] = useState<PsyReminderPolicy>(DEFAULT_PSY_POLICY);
  const [psyReminderLogs, setPsyReminderLogs] = useState<PsyReminderLog[]>([]);

  const savePsyReminderPolicy: DataContextType['savePsyReminderPolicy'] = policy => {
    if (!can(PERM.psiConfig)) return { ok: false, error: 'Su rol no puede configurar los recordatorios de Psicopedagogía.' };
    const problems = validatePsyPolicy({ sessionBefore: policy.sessionBefore.join(','), activityBefore: policy.activityBefore.join(','), validityBefore: policy.validityBefore.join(',') });
    if (problems.length > 0) return { ok: false, error: problems[0] };
    setPsyReminderPolicy(policy);
    return { ok: true };
  };

  const logPsyReminder: DataContextType['logPsyReminder'] = (reminder, channel, result, note) => {
    if (!can(PERM.psiRemind)) return { ok: false, error: 'Su rol no puede registrar recordatorios.' };
    const problems = validatePsyReminderLog(reminder, channel, result, note, psyReminderLogs);
    if (problems.length > 0) return { ok: false, error: problems[0] };
    const entry: PsyReminderLog = {
      id: nextSequentialId('PRL', psyReminderLogs.map(l => l.id)), key: reminder.key, kind: reminder.kind, refId: reminder.refId, studentId: reminder.studentId,
      offset: reminder.offset, at: new Date().toISOString(), by: currentUser.name, channel, result, note: note.trim() || undefined,
    };
    setPsyReminderLogs(prev => [entry, ...prev]);
    return { ok: true };
  };

  const [capacityConfig, setCapacityConfig] = useState<CapacityConfig>({ defaultCapacity: 6, byBranch: {}, overrides: [] });
  const [dropRequests, setDropRequests] = useState<DropRequest[]>([]);
  const [enrollmentChanges, setEnrollmentChanges] = useState<EnrollmentChange[]>([]);

  const [isEnrollmentWizardOpen, setIsEnrollmentWizardOpen] = useState(false);

  const [currentBranchId, setCurrentBranchId] = useState<string>('all');
  const [currentUser] = useState({
    id: 'USR-001',
    name: 'Superadmin',
    role: 'Superusuario',
    branchId: 'all'
  });

  const [incidents, setIncidents] = useState<ReceptionIncident[]>([]);

  const [notifications, setNotifications] = useState<Notification[]>([
    { id: '1', title: 'Bienvenido', message: 'Bienvenido al sistema ENSIL', type: 'info', date: new Date().toISOString(), read: false }
  ]);

  const addNotification = (notif: Omit<Notification, 'id' | 'date' | 'read'>) => {
    const newNotif: Notification = {
      ...notif,
      id: `NOT-${Date.now()}`,
      date: new Date().toISOString(),
      read: false
    };
    setNotifications(prev => [newNotif, ...prev]);
  };

  const markNotificationAsRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const confirmReception = (data: {
    docId: string;
    docType: 'Envío' | 'Transferencia';
    receivedItems: { itemId: string; quantity: number; status: 'ok' | 'missing' | 'damaged' | 'extra'; observation?: string }[];
    generalObservation?: string;
  }) => {
    const { docId, docType, receivedItems, generalObservation } = data;
    
    // 1. Find the document
    let doc: Shipment | Transfer | undefined;
    if (docType === 'Envío') {
      doc = shipments.find(s => s.id === docId);
    } else {
      doc = transfers.find(t => t.id === docId);
    }

    if (!doc) return;

    // 2. Determine final status
    const hasDifferences = receivedItems.some(ri => ri.status !== 'ok' || ri.quantity !== (doc?.items.find(i => i.itemId === ri.itemId)?.quantity || 0));
    const finalStatus = hasDifferences ? (docType === 'Envío' ? 'Recibido con diferencias' : 'Recibida con diferencias') : (docType === 'Envío' ? 'Recibido' : 'Recibida');

    // 3. Update document status
    const receptionData = {
      status: finalStatus as any,
      receptionObservation: generalObservation,
      receptionDate: new Date().toISOString(),
      receivedBy: currentUser.name
    };

    if (docType === 'Envío') {
      setShipments(prev => prev.map(s => s.id === docId ? { ...s, ...receptionData } : s));
    } else {
      setTransfers(prev => prev.map(t => t.id === docId ? { ...t, ...receptionData } : t));
    }

    // 4. Update Stock, Kardex and Incidents
    receivedItems.forEach(ri => {
      // Add incident if not ok
      if (ri.status !== 'ok') {
        const newIncident: ReceptionIncident = {
          id: `INC-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
          docId,
          docType,
          itemId: ri.itemId,
          type: ri.status as any,
          quantity: ri.status === 'missing' ? (doc?.items.find(i => i.itemId === ri.itemId)?.quantity || 0) - ri.quantity : ri.quantity,
          observation: ri.observation || '',
          date: new Date().toISOString(),
          branchId: doc?.destinationId || ''
        };
        setIncidents(prev => [...prev, newIncident]);
      }

      if (ri.quantity > 0) {
        // Regla de stock: el origen se descuenta UNA sola vez, al despachar. Aquí solo se suma lo recibido al destino.
        // Faltantes: ya salieron del origen; quedan registrados como incidencia.
        // Add to Destination
        updateStock(
          doc?.destinationId || '',
          ri.itemId,
          ri.quantity,
          docType === 'Envío' ? 'Ingreso' : 'Transferencia Entrada',
          `Recepción de ${docType} ${docId}. Estado: ${ri.status}. ${ri.observation || ''}`,
          docId
        );
      }
    });

    // 5. Send Notification
    addNotification({
      title: hasDifferences ? 'Recepción con diferencias' : 'Recepción confirmada',
      message: `El ${docType} ${docId} ha sido recibido en ${branches.find(b => b.id === doc?.destinationId)?.name}. Estado: ${finalStatus}`,
      type: hasDifferences ? 'warning' : 'success',
      branchId: docType === 'Envío' ? 'all' : doc.originId // Notify central or origin branch
    });
  };

  const [staff, setStaff] = useState<Staff[]>([
    { id: '1', code: '000001', docType: 'DNI', docNumber: '12345678', names: 'Juan', lastNameP: 'Pérez', lastNameM: 'García', birthDate: '1985-05-15', age: 38, gender: 'Masculino', civilStatus: 'Casado(a)', hasChildren: true, childrenCount: 2, educationLevel: 'Universitario', profession: 'Psicólogo', specialty: 'Psicopedagogía', phone: '987654321', personalEmail: 'juan.perez.personal@gmail.com', address: 'Av. Larco 123, Miraflores', status: 'Activo', observations: 'Docente principal' },
    { id: '2', code: '000002', docType: 'DNI', docNumber: '87654321', names: 'María', lastNameP: 'Torres', lastNameM: 'López', birthDate: '1990-08-20', age: 33, gender: 'Femenino', civilStatus: 'Soltero(a)', hasChildren: false, childrenCount: 0, educationLevel: 'Técnico', profession: 'Administradora', specialty: 'Gestión Educativa', phone: '912345678', personalEmail: 'maria.torres.personal@gmail.com', address: 'Calle Lima 456, San Isidro', status: 'Activo', observations: 'Coordinadora de filial' },
  ]);

  const [contracts, setContracts] = useState<Contract[]>([
    { id: 'CON-001', staffId: '1', type: 'Indeterminado', startDate: '2023-01-01', status: 'Vigente', shift: 'Full time', pensionSystem: 'AFP', pensionFund: 'Integra', grossSalary: 3500, contribution: 450, netSalary: 3050, observations: 'Contrato inicial' },
    { id: 'CON-002', staffId: '2', type: 'Plazo Fijo', startDate: '2023-06-01', endDate: '2024-06-01', status: 'Vigente', shift: 'Full time', pensionSystem: 'ONP', grossSalary: 2800, contribution: 364, netSalary: 2436, observations: 'Renovación anual' },
  ]);

  const [assignments, setAssignments] = useState<Assignment[]>([
    { id: 'ASG-001', staffId: '1', branch: 'Piura', area: 'Psicopedagogía', role: 'Psicólogo Senior', systemRole: 'Psicopedagogía', startDate: '2023-01-01', isMain: true, status: 'Activa' },
    { id: 'ASG-002', staffId: '2', branch: 'Chiclayo', area: 'Administración', role: 'Coordinadora', systemRole: 'Administración', startDate: '2023-06-01', isMain: true, status: 'Activa' },
    { id: 'ASG-003', staffId: '2', branch: 'Chiclayo', area: 'Psicopedagogía', role: 'Psicopedagoga', systemRole: 'Psicopedagogía', startDate: '2023-06-01', isMain: false, status: 'Activa' },
  ]);

  const [companies, setCompanies] = useState<Company[]>([
    { id: '1', ruc: '20123456789', name: 'Educación y Cultura S.A.C.', commercialName: 'ENSIL Central', status: 'Activo' },
    { id: '2', ruc: '20987654321', name: 'Instituto de Idiomas del Norte S.A.', commercialName: 'ENSIL Norte', status: 'Activo' },
  ]);

  const [branches, setBranches] = useState<Branch[]>([
    { 
      id: 'FIL-PIU', 
      name: 'Piura', 
      company: 'Educación y Cultura S.A.C.', 
      status: 'Activo', 
      address: 'Av. Sullana #280', 
      reference: 'Frente al Museo Vicus (Almacén Central)',
      department: 'Piura',
      province: 'Piura',
      district: 'Piura',
      phoneFixed: '073-617445',
      phoneMobile: '933732053'
    },
    { 
      id: 'FIL-CHI', 
      name: 'Chiclayo', 
      company: 'Educación y Cultura S.A.C.', 
      status: 'Activo', 
      address: 'Calle Andalucía #150 Urb. San Juan', 
      reference: 'Altura del Hotel Tumbas Reales',
      department: 'Lambayeque',
      province: 'Chiclayo',
      district: 'Chiclayo',
      phoneFixed: '074-525632',
      phoneMobile: '905464734'
    },
    { 
      id: 'FIL-CAJ', 
      name: 'Cajamarca', 
      company: 'Educación y Cultura S.A.C.', 
      status: 'Activo', 
      address: 'Jr. Guadalupe #466', 
      reference: 'Huánuco y Silva Santiesteban',
      department: 'Cajamarca',
      province: 'Cajamarca',
      district: 'Cajamarca',
      phoneFixed: '076-772573',
      phoneMobile: '933722476'
    },
    { 
      id: 'FIL-LOL', 
      name: 'Los Olivos', 
      company: 'Educación y Cultura S.A.C.', 
      status: 'Activo', 
      address: 'Jr. Carlos Monge #233', 
      reference: 'Espalda cdra. 4 Av. Izaguirre',
      department: 'Lima',
      province: 'Lima',
      district: 'Los Olivos',
      phoneFixed: '01-7504687',
      phoneMobile: '960508686'
    },
    { 
      id: 'FIL-SIS', 
      name: 'San Isidro', 
      company: 'Educación y Cultura S.A.C.', 
      status: 'Activo', 
      address: 'Calle Francisco de Zela #2575', 
      reference: '1/2 cdra. del Touring',
      department: 'Lima',
      province: 'Lima',
      district: 'San Isidro',
      phoneMobile: '960508686'
    },
    { 
      id: 'FIL-HUA', 
      name: 'Huancayo', 
      company: 'Educación y Cultura S.A.C.', 
      status: 'Activo', 
      address: 'Jr. Arequipa #218', 
      reference: 'Complejo Salesiano Sta. Rosa',
      department: 'Junín',
      province: 'Huancayo',
      district: 'El Tambo',
      phoneFixed: '064-419923',
      phoneMobile: '992195898'
    },
    { 
      id: 'FIL-PUN', 
      name: 'Puno', 
      company: 'Educación y Cultura S.A.C.', 
      status: 'Activo', 
      address: 'Jr. Moquegua #422 (2° piso)', 
      reference: 'Frente al Restaurant Tamis',
      department: 'Puno',
      province: 'Puno',
      district: 'Puno',
      phoneFixed: '051-352969',
      phoneMobile: '961274101'
    },
    { 
      id: 'FIL-JUL', 
      name: 'Juliaca', 
      company: 'Educación y Cultura S.A.C.', 
      status: 'Activo', 
      address: 'Jr. Bolívar #329', 
      reference: 'Costado del Mía Market',
      department: 'Puno',
      province: 'San Román',
      district: 'Juliaca',
      phoneMobile: '913632393'
    },
    { 
      id: 'FIL-TAC', 
      name: 'Tacna', 
      company: 'Educación y Cultura S.A.C.', 
      status: 'Activo', 
      address: 'Av. Cusco #485', 
      reference: 'Frente a Mueblería Rony',
      department: 'Tacna',
      province: 'Tacna',
      district: 'Tacna',
      phoneFixed: '052-638377',
      phoneMobile: '933746179'
    },
  ]);

  const [roles, setRoles] = useState<Role[]>([
    { id: 'ROL-001', name: 'Administrador Global', desc: 'Acceso total al sistema y configuraciones', users: 3, status: 'Activo' },
    { id: 'ROL-002', name: 'Director Académico', desc: 'Gestión de programas, docentes y alumnos', users: 5, status: 'Activo' },
    { id: 'ROL-003', name: 'Coordinador de Ventas', desc: 'Gestión de matrículas, prospectos y caja', users: 12, status: 'Activo' },
    { id: 'ROL-004', name: 'Docente', desc: 'Acceso a sus cursos, asistencia y notas', users: 45, status: 'Activo' },
    { id: 'ROL-005', name: 'Cajero', desc: 'Gestión de caja y pagos', users: 8, status: 'Activo' },
  ]);

  const [users, setUsers] = useState<User[]>([
    { id: 'USR-001', name: 'Admin Sistema', email: 'admin@ensil.edu.pe', role: 'Administrador Global', branch: 'Todas', lastAccess: 'Hace 5 min', status: 'Activo' },
    { id: 'USR-002', name: 'Laura Martínez', email: 'lmartinez@ensil.edu.pe', role: 'Director Académico', branch: 'Piura', lastAccess: 'Ayer 14:30', status: 'Activo' },
    { id: 'USR-003', name: 'Jorge Torres', email: 'jtorres@ensil.edu.pe', role: 'Coordinador de Ventas', branch: 'Chiclayo', lastAccess: 'Hace 2 días', status: 'Inactivo' },
  ]);

  const [permissions, setPermissions] = useState<Permission[]>([
    { roleId: 'ROL-002', permissions: ['org-usuarios:view', 'op-matriculas:view', 'op-matriculas:create', 'op-caja:view'] }
  ]);

  const [leadSources, setLeadSources] = useState<LeadSource[]>([
    { id: '1', name: 'Facebook Ads', status: 'active' },
    { id: '2', name: 'Orgánico', status: 'active' },
    { id: '3', name: 'Referido', status: 'active' },
    { id: '4', name: 'Instagram', status: 'active' },
    { id: '5', name: 'WhatsApp', status: 'active' },
  ]);

  const [programs, setPrograms] = useState<Program[]>([
    { id: '1', code: 'PRG-KIDS', name: 'Kids', hasLevels: true, durationBase: 3, warranty: 3, allBranches: true, status: 'Activo' },
    { id: '2', code: 'PRG-PK', name: 'Pre-Kids', hasLevels: true, durationBase: 3, warranty: 3, allBranches: true, status: 'Activo' },
    { id: '3', code: 'PRG-PL', name: 'Pre-lectura', hasLevels: false, durationBase: 3, warranty: 3, allBranches: false, enabledBranches: ['FIL-PIU', 'FIL-CHI'], status: 'Activo' },
    { id: '4', code: 'PRG-ESP', name: 'Especialización', hasLevels: false, durationBase: 6, warranty: 6, allBranches: true, status: 'Activo' },
    { id: '5', code: 'PRG-PROF', name: 'Profesional', hasLevels: false, durationBase: 6, warranty: 6, allBranches: true, status: 'Activo' },
  ]);

  const [levels, setLevels] = useState<Level[]>([
    { id: '1', programId: '1', code: 'NVL-KIDS-1', name: 'Nivel 1', order: 1, status: 'Activo' },
    { id: '2', programId: '1', code: 'NVL-KIDS-2', name: 'Nivel 2', order: 2, status: 'Activo' },
    { id: '3', programId: '1', code: 'NVL-KIDS-3', name: 'Nivel 3', order: 3, status: 'Activo' },
    { id: '4', programId: '2', code: 'NVL-PK-1', name: 'Nivel 1', order: 1, status: 'Activo' },
  ]);

  const [paymentTypes, setPaymentTypes] = useState<PaymentType[]>([
    { id: '1', code: 'TP-CONT', name: 'Contado', installments: 1, termDays: 0, scheduleMode: 'inmediato', applicablePrograms: ['1', '2', '3', '4'], status: 'Activo' },
    { id: '2', code: 'TP-C2P', name: 'Contado en 2 partes', installments: 2, termDays: 30, scheduleMode: 'fechas_manuales', applicablePrograms: ['1', '2'], status: 'Activo' },
    { id: '3', code: 'TP-P3', name: 'Plan 3', installments: 3, termDays: 30, scheduleMode: 'intervalo_fijo', applicablePrograms: ['1', '2'], status: 'Activo' },
    { id: '4', code: 'TP-P6', name: 'Plan 6', installments: 6, termDays: 30, scheduleMode: 'intervalo_fijo', applicablePrograms: ['1', '2'], status: 'Activo' },
    { id: '5', code: 'TP-P9', name: 'Plan 9', installments: 9, termDays: 30, scheduleMode: 'intervalo_fijo', applicablePrograms: ['5'], status: 'Activo' },
  ]);

  const [tariffs, setTariffs] = useState<Tariff[]>([
    {
      id: '1', name: 'Kids - Contado 2026', programId: '1', paymentTypeId: '1', branchId: 'all', currency: 'USD', basePrice: 500,
      installments: [
        { number: 1, concept: 'Pago único', amount: 500, dueDays: 0, kind: 'unica' }
      ],
      startDate: '2026-01-01', endDate: '2026-12-31', status: 'Activo'
    },
    {
      // Contado en 2 partes: en matrícula solo se acuerdan las fechas; el monto de la parte 1 se registra al cobrar en Planes y la parte 2 es el saldo.
      id: '2', name: 'Kids - Contado en 2 partes 2026', programId: '1', paymentTypeId: '2', branchId: 'all', currency: 'USD', basePrice: 500,
      installments: [
        { number: 1, concept: 'Parte 1', amount: 0, dueDays: 0, kind: 'parte', variable: true },
        { number: 2, concept: 'Parte 2 (saldo)', amount: 0, dueDays: 30, kind: 'parte', variable: true }
      ],
      startDate: '2026-01-01', endDate: '2026-12-31', status: 'Activo'
    },
    {
      id: '3', name: 'Pre-Kids - Contado 2026', programId: '2', paymentTypeId: '1', branchId: 'all', currency: 'USD', basePrice: 500,
      installments: [
        { number: 1, concept: 'Pago único', amount: 500, dueDays: 0, kind: 'unica' }
      ],
      startDate: '2026-01-01', endDate: '2026-12-31', status: 'Activo'
    },
    {
      id: '4', name: 'Pre-lectura - Plan 3 2026', programId: '3', paymentTypeId: '3', branchId: 'all', currency: 'USD', basePrice: 1000,
      installments: [
        { number: 0, concept: 'Matrícula', amount: 100, dueDays: 0, kind: 'matricula' },
        { number: 1, concept: 'Cuota 1', amount: 300, dueDays: 0, kind: 'cuota' },
        { number: 2, concept: 'Cuota 2', amount: 300, dueDays: 30, kind: 'cuota' },
        { number: 3, concept: 'Cuota 3', amount: 300, dueDays: 60, kind: 'cuota' }
      ],
      startDate: '2026-01-01', status: 'Activo'
    },
    {
      id: '5', name: 'Profesional - Contado 2026', programId: '5', paymentTypeId: '1', branchId: 'all', currency: 'USD', basePrice: 1000,
      installments: [
        { number: 1, concept: 'Pago único', amount: 1000, dueDays: 0, kind: 'unica' }
      ],
      startDate: '2026-01-01', endDate: '2026-12-31', status: 'Activo'
    },
    {
      id: '6', name: 'Profesional - Plan 3 2026', programId: '5', paymentTypeId: '3', branchId: 'all', currency: 'USD', basePrice: 1200,
      installments: [
        { number: 0, concept: 'Matrícula', amount: 300, dueDays: 0, kind: 'matricula' },
        { number: 1, concept: 'Cuota 1', amount: 300, dueDays: 0, kind: 'cuota' },
        { number: 2, concept: 'Cuota 2', amount: 300, dueDays: 30, kind: 'cuota' },
        { number: 3, concept: 'Cuota 3', amount: 300, dueDays: 60, kind: 'cuota' }
      ],
      startDate: '2026-01-01', endDate: '2026-12-31', status: 'Activo'
    },
    {
      id: '7', name: 'Profesional - Plan 6 2026', programId: '5', paymentTypeId: '4', branchId: 'all', currency: 'USD', basePrice: 1400,
      installments: [
        { number: 0, concept: 'Matrícula', amount: 200, dueDays: 0, kind: 'matricula' },
        { number: 1, concept: 'Cuota 1', amount: 200, dueDays: 0, kind: 'cuota' },
        { number: 2, concept: 'Cuota 2', amount: 200, dueDays: 30, kind: 'cuota' },
        { number: 3, concept: 'Cuota 3', amount: 200, dueDays: 60, kind: 'cuota' },
        { number: 4, concept: 'Cuota 4', amount: 200, dueDays: 90, kind: 'cuota' },
        { number: 5, concept: 'Cuota 5', amount: 200, dueDays: 120, kind: 'cuota' },
        { number: 6, concept: 'Cuota 6', amount: 200, dueDays: 150, kind: 'cuota' }
      ],
      startDate: '2026-01-01', endDate: '2026-12-31', status: 'Activo'
    },
    {
      id: '8', name: 'Profesional - Plan 9 2026', programId: '5', paymentTypeId: '5', branchId: 'all', currency: 'USD', basePrice: 1500,
      installments: [
        { number: 0, concept: 'Matrícula', amount: 150, dueDays: 0, kind: 'matricula' },
        { number: 1, concept: 'Cuota 1', amount: 150, dueDays: 0, kind: 'cuota' },
        { number: 2, concept: 'Cuota 2', amount: 150, dueDays: 30, kind: 'cuota' },
        { number: 3, concept: 'Cuota 3', amount: 150, dueDays: 60, kind: 'cuota' },
        { number: 4, concept: 'Cuota 4', amount: 150, dueDays: 90, kind: 'cuota' },
        { number: 5, concept: 'Cuota 5', amount: 150, dueDays: 120, kind: 'cuota' },
        { number: 6, concept: 'Cuota 6', amount: 150, dueDays: 150, kind: 'cuota' },
        { number: 7, concept: 'Cuota 7', amount: 150, dueDays: 180, kind: 'cuota' },
        { number: 8, concept: 'Cuota 8', amount: 150, dueDays: 210, kind: 'cuota' },
        { number: 9, concept: 'Cuota 9', amount: 150, dueDays: 240, kind: 'cuota' }
      ],
      startDate: '2026-01-01', endDate: '2026-12-31', status: 'Activo'
    },
  ]);

  const [promotions, setPromotions] = useState<Promotion[]>([
    {
      id: '1',
      code: 'PROMO-2X700',
      name: '2 matrículas Pre-Kids / Kids por USD 700',
      type: 'Grupal',
      requiredStudents: 2,
      eligibleProgramIds: ['2', '1'], // Pre-Kids y Kids (cualquier combinación y nivel)
      requiredBasePrice: 500, // Contado base de cada alumno
      allowMultipleGroups: true,
      paymentTypeIds: ['1'], // Contado
      totalPrice: 700,
      currency: 'USD',
      internalDistributionRule: 'Igualitario',
      branchIds: [],
      applyToAllBranches: true,
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      status: 'Activo'
    },
    {
      id: '2',
      code: 'PROMO-PROF-2X1700',
      name: '2 matrículas Profesional por USD 1700',
      type: 'Grupal',
      requiredStudents: 2,
      eligibleProgramIds: ['5'],
      requiredBasePrice: 1000,
      allowMultipleGroups: true,
      paymentTypeIds: ['1'], // Contado
      totalPrice: 1700,
      currency: 'USD',
      internalDistributionRule: 'Igualitario',
      branchIds: [],
      applyToAllBranches: true,
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      status: 'Activo'
    }
  ]);

  const [recipes, setRecipes] = useState<Recipe[]>([
    {
      id: 'REC-001',
      name: 'Pack Kids Nivel 1 2024',
      programId: '1',
      levelId: '1',
      branchIds: [],
      applyToAllBranches: true,
      status: 'Activo',
      items: [
        { itemId: 'ITM-LIB-K1', quantity: 1 },
        { itemId: 'ITM-KIT-BIENV', quantity: 1 }
      ],
      startDate: '2026-01-01',
      endDate: '2026-12-31'
    },
    {
      id: 'REC-002',
      name: 'Pack Kids Nivel 2 2024',
      programId: '1',
      levelId: '2',
      branchIds: [],
      applyToAllBranches: true,
      status: 'Activo',
      items: [
        { itemId: 'ITM-LIB-K1', quantity: 1 },
        { itemId: 'ITM-MAT-01', quantity: 1 }
      ],
      startDate: '2026-01-01',
      endDate: '2026-12-31'
    },
    {
      id: 'REC-003',
      name: 'Pack Pre-Kids Nivel 1 2026',
      programId: '2',
      levelId: '4',
      branchIds: [],
      applyToAllBranches: true,
      status: 'Activo',
      items: [
        { itemId: 'ITM-KIT-BIENV', quantity: 1 },
        { itemId: 'ITM-MAT-01', quantity: 1 }
      ],
      startDate: '2026-01-01',
      endDate: '2026-12-31'
    }
  ]);

  const addLeadSource = (name: string) => {
    const newSource: LeadSource = {
      id: Date.now().toString(),
      name,
      status: 'active'
    };
    setLeadSources(prev => [...prev, newSource]);
  };

  const updateLeadSource = (id: string, name: string, status: 'active' | 'inactive') => {
    setLeadSources(prev => prev.map(s => s.id === id ? { ...s, name, status } : s));
  };

  const deleteLeadSource = (id: string) => {
    setLeadSources(prev => prev.filter(s => s.id !== id));
  };

  const updateEnrollmentVerification = (enrollmentId: string, data: {
    status: Enrollment['verificationStatus'];
    items: string[];
    observation?: string;
    date: string;
    verifier: string;
  }) => {
    setEnrollments(prev => prev.map(e => {
      if (e.id === enrollmentId) {
        return {
          ...e,
          verificationStatus: data.status,
          verifiedItems: data.items,
          verificationObservation: data.observation,
          verificationDate: data.date,
          verifier: data.verifier
        };
      }
      return e;
    }));
  };

  // Último estado del inventario: permite encadenar movimientos en un mismo evento y evita efectos secundarios
  // dentro de actualizadores de estado (con StrictMode duplicaban las líneas de kardex).
  const stockRef = useRef<StockItem[]>(stockItems);
  stockRef.current = stockItems;

  /** Primer artículo sin saldo suficiente en la sede, o `null` si hay para todos. */
  const findInsufficientStock = (branchId: string, lines: { itemId: string; quantity: number }[]): string | null => {
    const needed = new Map<string, number>();
    lines.forEach(l => needed.set(l.itemId, (needed.get(l.itemId) ?? 0) + l.quantity));
    for (const [itemId, qty] of needed) {
      const have = stockRef.current.find(x => x.branchId === branchId && x.itemId === itemId)?.stock ?? 0;
      if (have < qty) {
        const name = items.find(i => i.id === itemId)?.name || itemId;
        return `Stock insuficiente de "${name}" en ${branches.find(b => b.id === branchId)?.name || branchId}: disponible ${have}, requerido ${qty}.`;
      }
    }
    return null;
  };

  const updateStock = (branchId: string, itemId: string, qty: number, type: KardexEntry['type'], observation: string, doc?: string): StockResult => {
    const list = stockRef.current;
    const idx = list.findIndex(x => x.branchId === branchId && x.itemId === itemId);
    const prevBalance = idx >= 0 ? list[idx].stock : 0;
    const newBalance = prevBalance + qty;

    if (qty < 0 && newBalance < 0) {
      const name = items.find(i => i.id === itemId)?.name || itemId;
      return { ok: false, error: `Stock insuficiente de "${name}": disponible ${prevBalance}, se intentó descontar ${-qty}.` };
    }

    const nextList = idx >= 0
      ? list.map((x, i) => i === idx ? { ...x, stock: newBalance } : x)
      : [...list, { id: `STK-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, itemId, branchId, stock: newBalance, minStock: 0 }];

    const entry: KardexEntry = {
      id: `KDX-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      date: new Date().toISOString().replace('T', ' ').slice(0, 16),
      branch: branches.find(b => b.id === branchId)?.name || branchId,
      material: items.find(i => i.id === itemId)?.name || itemId,
      type,
      qty,
      prevBalance,
      newBalance,
      user: currentUser.name,
      doc: doc || 'S/N',
      observation
    };

    stockRef.current = nextList;
    setStockItems(nextList);
    setKardex(prevK => [entry, ...prevK]);
    return { ok: true };
  };

  const addItemPrice = (price: { itemId: string; branchId: string; amount: number; validFrom: string }) => {
    if (!(price.amount > 0)) return { ok: false, error: 'El precio debe ser mayor a 0.' };
    if (!price.validFrom) return { ok: false, error: 'Indique desde cuándo rige el precio.' };
    const sameScope = itemPrices.filter(p => p.itemId === price.itemId && p.branchId === price.branchId);
    if (sameScope.some(p => p.validFrom === price.validFrom)) {
      return { ok: false, error: 'Ya existe un precio con esa fecha de inicio. Use una fecha posterior.' };
    }
    if (sameScope.some(p => p.validFrom > price.validFrom)) {
      return { ok: false, error: 'Existe un precio con vigencia posterior. Registre el nuevo precio después de esa fecha.' };
    }
    const dayBefore = new Date(Date.parse(price.validFrom + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
    const newPrice: ItemPrice = {
      id: `PRC-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      ...price,
      amount: Math.round(price.amount * 100) / 100,
      createdAt: new Date().toISOString(),
      createdBy: currentUser.name,
    };
    setItemPrices(prev => [
      // Cierra la vigencia abierta del mismo alcance en lugar de sobrescribirla
      ...prev.map(p =>
        p.itemId === price.itemId && p.branchId === price.branchId && !p.validTo ? { ...p, validTo: dayBefore } : p
      ),
      newPrice,
    ]);
    return { ok: true };
  };

  const addAdjustment = (adjData: Omit<Adjustment, 'id' | 'date' | 'user'>, stockId: string): StockResult => {
    const stock = stockRef.current.find(s => s.id === stockId);
    if (!stock) return { ok: false, error: 'No se encontró el registro de stock.' };

    const newAdjustment: Adjustment = {
      ...adjData,
      id: `ADJ-${Date.now()}`,
      date: new Date().toISOString().replace('T', ' ').slice(0, 16),
      user: currentUser.name
    };

    const result = updateStock(stock.branchId, stock.itemId, adjData.qty, adjData.type, adjData.reason, newAdjustment.id);
    if (!result.ok) return result;
    setAdjustments(prev => [newAdjustment, ...prev]);
    return { ok: true };
  };

  const updateMinStock = (stockId: string, minStock: number) => {
    setStockItems(prev => prev.map(s => {
      if (s.id === stockId) {
        return { ...s, minStock };
      }
      return s;
    }));
  };

  const addTransfer = (transfer: Omit<Transfer, 'id'>) => {
    const newTransfer = {
      ...transfer,
      id: `TRF-${new Date().getFullYear()}-${String(transfers.length + 1).padStart(3, '0')}`
    } as Transfer;
    setTransfers(prev => [newTransfer, ...prev]);
  };

  // Referencias al último estado: varias operaciones encadenadas en un mismo evento (p. ej. updateTransfer + updateTransferStatus)
  // deben ver los cambios anteriores y no descontar stock dos veces ni con ítems desactualizados.
  const transfersRef = useRef<Transfer[]>(transfers);
  transfersRef.current = transfers;
  const commitTransfers = (next: Transfer[]) => {
    transfersRef.current = next;
    setTransfers(next);
  };

  const updateTransferStatus = (transferId: string, newStatus: Transfer['status']): StockResult => {
    const transfer = transfersRef.current.find(t => t.id === transferId);
    if (!transfer) return { ok: false, error: 'Transferencia no encontrada.' };

    // Regla de stock: sale del origen al DESPACHAR (una sola vez); el destino suma al RECIBIR.
    if (newStatus === 'En tránsito' && (transfer.status === 'Aprobada' || transfer.status === 'Solicitada')) {
      const shortage = findInsufficientStock(transfer.originId, transfer.items);
      if (shortage) return { ok: false, error: shortage };
      transfer.items.forEach(item => {
        updateStock(transfer.originId, item.itemId, -item.quantity, 'Transferencia Salida', `Despacho TRF: ${transfer.id}`, transfer.id);
      });

      addNotification({
        title: 'Transferencia en tránsito',
        message: `La transferencia ${transfer.id} desde ${branches.find(b => b.id === transfer.originId)?.name} está en tránsito. El stock salió del origen y se sumará al recepcionar.`,
        type: 'info',
        branchId: transfer.destinationId
      });
    }

    // Cancelación con mercadería ya despachada: vuelve al origen.
    if (newStatus === 'Cancelada' && (transfer.status === 'En tránsito' || transfer.status === 'Listo para recepción')) {
      transfer.items.forEach(item => {
        updateStock(transfer.originId, item.itemId, item.quantity, 'Ingreso', `Cancelación TRF: ${transfer.id}`, transfer.id);
      });
    }

    commitTransfers(transfersRef.current.map(t => t.id === transferId ? { ...t, status: newStatus } : t));
    return { ok: true };
  };

  const updateTransfer = (transferId: string, updatedData: Partial<Transfer>) => {
    commitTransfers(transfersRef.current.map(t => t.id === transferId ? { ...t, ...updatedData } : t));
  };

  const unpackPackage = (stockId: string): StockResult => {
    const stock = stockRef.current.find(s => s.id === stockId);
    if (!stock) return { ok: false, error: 'No se encontró el registro de stock.' };

    const item = items.find(i => i.id === stock.itemId);
    if (!item || !item.isPackage || !item.composition) return { ok: false, error: 'El artículo no es un paquete con composición.' };
    if (!item.allowUnpacking) return { ok: false, error: 'Este paquete no permite desempaquetado.' };

    // 1. Restar 1 del paquete
    const removed = updateStock(stock.branchId, stock.itemId, -1, 'Desempaquetado', `Desempaquetado de ${item.name}`, 'DESEMP-001');
    if (!removed.ok) return removed;

    // 2. Sumar componentes
    item.composition.forEach(comp => {
      updateStock(stock.branchId, comp.itemId, comp.quantity, 'Desempaquetado', `Componente de ${item.name}`, 'DESEMP-001');
    });
    return { ok: true };
  };

  const packPackage = (stockId: string): StockResult => {
    const stock = stockRef.current.find(s => s.id === stockId);
    if (!stock) return { ok: false, error: 'No se encontró el registro de stock.' };

    const item = items.find(i => i.id === stock.itemId);
    if (!item || !item.isPackage || !item.composition) return { ok: false, error: 'El artículo no es un paquete con composición.' };
    if (item.composition.length === 0) return { ok: false, error: 'El paquete no tiene composición definida.' };

    // 1. Verificar que haya stock de todos los componentes
    const shortage = findInsufficientStock(stock.branchId, item.composition.map(c => ({ itemId: c.itemId, quantity: c.quantity })));
    if (shortage) return { ok: false, error: `No hay stock suficiente de todos los componentes para empaquetar. ${shortage}` };

    // 2. Restar componentes
    item.composition.forEach(comp => {
      updateStock(stock.branchId, comp.itemId, -comp.quantity, 'Empaquetado', `Componente para ${item.name}`, 'EMP-001');
    });

    // 3. Sumar 1 al paquete
    updateStock(stock.branchId, stock.itemId, 1, 'Empaquetado', `Empaquetado de ${item.name}`, 'EMP-001');
    return { ok: true };
  };

  /**
   * Cobra una cuota. `amount` es el monto aplicado en USD (la deuda siempre es en USD). Si se cobró en soles,
   * `currency: 'PEN'` + `exchangeRate` + `originalAmount` registran el dinero real en la caja de soles.
   */
  const registerPayment = (planId: string, installmentId: string, input: RegisterPaymentInput): StockResult => {
    const planNow = plans.find(pl => pl.id === planId);
    const instNow = planNow?.installments.find((i: any) => i.id === installmentId);
    if (!planNow || !instNow) return { ok: false, error: 'No se encontró la cuota.' };
    const todayISO = todayLocalISO();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || input.date > todayISO) return { ok: false, error: 'La fecha de pago es obligatoria y no puede ser futura.' };
    // Partes (monto, TC, medio, banco, operación, evidencia), comprobante y repeticiones frente a los pagos ya registrados
    const problems = validatePaymentInput({ parts: input.parts, document: input.document }, payments, 'Pago');
    if (problems.length > 0) return { ok: false, error: problems[0] };
    // En cronogramas variables (Contado en 2 partes) lo adeudado al cobrar es el saldo del plan
    const owed = instNow.variable ? planNow.balance : instNow.balance;
    const received = totalUSD(input.parts) ?? 0;
    if (!(received > 0) || !(owed > 0)) return { ok: false, error: 'La cuota no tiene saldo pendiente o el monto no es válido.' };
    if (received > owed + 0.01) return { ok: false, error: `El monto equivale a USD ${received.toFixed(2)} y supera el saldo de USD ${owed.toFixed(2)}.` };
    const paymentData = { date: input.date, amount: Math.round(Math.min(received, owed) * 100) / 100, receipt: documentLabel(input.document) };

    const paymentId = nextSequentialId('PAG', payments.map(p => p.id));
    setPlans(prevPlans => prevPlans.map(plan => {
      if (plan.id !== planId) return plan;

      const targetIdx = plan.installments.findIndex(inst => inst.id === installmentId);
      if (targetIdx < 0) return plan;
      const target = plan.installments[targetIdx];
      const newPayment = {
        id: `P-${Date.now()}`,
        paymentId, // vínculo con el pago global: permite reversarlo y reponer exactamente esta cuota
        date: paymentData.date,
        amount: paymentData.amount,
        receipt: paymentData.receipt
      };

      // Contado en 2 partes: el monto de la parte 1 se define al cobrar y la parte 2 es el saldo del total.
      const nextIdx = plan.installments.findIndex((inst, i) => i > targetIdx && inst.variable);
      if (target.variable && nextIdx >= 0) {
        const paid = Math.min(paymentData.amount, plan.balance);
        const remaining = Math.max(0, plan.balance - paid);
        const updated = plan.installments.map((inst, i) => {
          if (i === targetIdx) {
            return {
              ...inst,
              // El monto de la parte queda fijado en lo realmente cobrado (antes tenía como tope el total del plan)
              amount: inst.payments.reduce((acc: number, pay: any) => acc + pay.amount, 0) + paid,
              balance: 0,
              status: 'Pagada',
              payments: [...inst.payments, { ...newPayment, amount: paid }]
            };
          }
          if (i === nextIdx) {
            return { ...inst, amount: remaining, balance: remaining, status: remaining === 0 ? 'Pagada' : 'Pendiente' };
          }
          return inst;
        });
        return {
          ...plan,
          balance: remaining,
          status: remaining === 0 ? 'Completado' : plan.status,
          installments: updated
        };
      }

      let planBalanceReduction = 0;
      const updatedInstallments = plan.installments.map(inst => {
        if (inst.id === installmentId) {
          const newBalance = Math.max(0, inst.balance - paymentData.amount);
          planBalanceReduction = inst.balance - newBalance;
          return {
            ...inst,
            balance: newBalance,
            status: newBalance === 0 ? 'Pagada' : 'Parcial',
            payments: [...inst.payments, newPayment]
          };
        }
        return inst;
      });

      const newPlanBalance = Math.max(0, plan.balance - planBalanceReduction);
      return {
        ...plan,
        balance: newPlanBalance,
        status: newPlanBalance === 0 ? 'Completado' : plan.status,
        installments: updatedInstallments
      };
    }));

    // Pago global (una parte por medio usado, un comprobante) y un movimiento de caja por parte
    const planRef = plans.find(pl => pl.id === planId);
    const enrollmentRef = enrollments.find(e => e.id === planRef?.mat);
    const studentName = enrollmentRef?.student || planRef?.titular || 'Alumno';
    const built = buildPaymentRecord({
      id: paymentId,
      date: formatDisplayDate(paymentData.date),
      student: studentName,
      concept: `Pago de ${instNow.name}`,
      amountUSD: paymentData.amount,
      parts: input.parts,
      document: input.document,
      cashConcept: 'Ingreso cuota',
      cashReference: `${planId} / ${studentName}`,
      branchId: enrollmentRef?.branchId,
      enrollmentIds: enrollmentRef ? [enrollmentRef.id] : undefined,
      note: input.note?.trim(),
      user: currentUser.name,
    });
    setPayments(prev => [built.payment, ...prev]);
    built.cashMovements.forEach(m => addCashMovement(m));
    return { ok: true };
  };

  const refinanceInstallment = (planId: string, installmentId: string, input: RefinanceInput): StockResult => {
    const plan = plans.find(p => p.id === planId);
    if (!plan) return { ok: false, error: 'No se encontró el plan.' };
    const today = todayLocalISO();
    const problems = validateRefinance(plan, installmentId, input, today);
    if (problems.length > 0) return { ok: false, error: problems[0] };
    const installmentName = plan.installments.find(x => x.id === installmentId)?.name ?? '';
    setPlans(prev => prev.map(p => (p.id === planId ? applyRefinance(p, installmentId, input, today, new Date().toISOString()) : p)));
    addNotification({
      title: 'Cuota refinanciada',
      message: `${currentUser.name} refinanció «${installmentName}» del plan ${planId} (${plan.mat}): ${input.reason.trim()}`,
      type: 'info',
    });
    return { ok: true };
  };

  const addStaff = (staffData: Omit<Staff, 'id'>): Staff => {
    const newStaff: Staff = { ...staffData, id: nextNumericId(staff.map(s => s.id)) };
    setStaff(prev => [...prev, newStaff]);
    return newStaff;
  };

  const updateContract = (id: string, data: Partial<Omit<Contract, 'id'>>) => {
    setContracts(prev => prev.map(c => (c.id === id ? { ...c, ...data } : c)));
  };

  const addContract = (data: Omit<Contract, 'id'>): Contract => {
    const created: Contract = { ...data, id: nextSequentialId('CON', contracts.map(c => c.id)) };
    setContracts(prev => [...prev, created]);
    return created;
  };

  const updateStaff = (id: string, staffData: Partial<Staff>) => {
    setStaff(prev => prev.map(s => s.id === id ? { ...s, ...staffData } : s));
  };

  const deleteStaff = (id: string) => {
    setStaff(prev => prev.filter(s => s.id !== id));
  };

  /** Ajusta el contador de alumnos de los titulares cuando un alumno se vincula o se desvincula. */
  const shiftGuardianStudents = (ids: string[], delta: number) => {
    if (ids.length === 0) return;
    setGuardians(prev => prev.map(g => (ids.includes(g.id) ? { ...g, students: Math.max(0, g.students + delta) } : g)));
  };

  const addStudent = (studentData: Omit<Student, 'id'>): Student => {
    const newStudent: Student = { ...studentData, id: nextSequentialId('ALU', students.map(s => s.id)) };
    setStudents(prev => [...prev, newStudent]);
    shiftGuardianStudents(newStudent.guardianIds ?? [], 1);
    return newStudent;
  };

  const updateStudent = (id: string, studentData: Partial<Student>) => {
    const before = students.find(s => s.id === id)?.guardianIds ?? [];
    if (studentData.guardianIds) {
      shiftGuardianStudents(studentData.guardianIds.filter(g => !before.includes(g)), 1);
      shiftGuardianStudents(before.filter(g => !studentData.guardianIds!.includes(g)), -1);
    }
    setStudents(prev => prev.map(s => s.id === id ? { ...s, ...studentData } : s));
  };

  const deleteStudent = (id: string) => {
    shiftGuardianStudents(students.find(s => s.id === id)?.guardianIds ?? [], -1);
    setStudents(prev => prev.filter(s => s.id !== id));
  };

  const addGuardian = (guardianData: Omit<Guardian, 'id' | 'students' | 'enrollments' | 'balance'>): Guardian => {
    const newGuardian: Guardian = {
      ...guardianData,
      id: nextNumericId(guardians.map(g => g.id)),
      students: 0,
      enrollments: 0,
      balance: '$0',
    };
    setGuardians(prev => [...prev, newGuardian]);
    return newGuardian;
  };

  const updateGuardian = (id: string, guardianData: Partial<Guardian>) => {
    setGuardians(prev => prev.map(g => g.id === id ? { ...g, ...guardianData } : g));
  };

  const deleteGuardian = (id: string) => {
    setGuardians(prev => prev.filter(g => g.id !== id));
  };

  const registerEnrollments = (draft: EnrollmentDraft) => {
    const result = buildEnrollmentBatch(
      draft,
      {
        branches, leadSources, staff, assignments, programs, levels, tariffs, paymentTypes, promotions, guardians, students, classSchedules,
        scheduling: { schedules, capacity: capacityConfig, activities: allActivities(monthlySchedules) },
      },
      { guardians, students, enrollments, plans, payments, promotionGroups, schedules },
      { now: new Date().toISOString(), userName: currentUser.name }
    );
    if (!result.ok || !result.batch) return { ok: false, error: result.error };
    const b = result.batch;

    // Una sola aplicación de cambios: si el armado falló arriba, no se creó nada.
    setGuardians(prev => [
      ...prev.map(g => {
        const u = b.guardianUpdates.find(x => x.id === g.id);
        return u ? { ...g, ...u.patch } : g;
      }),
      ...b.newGuardians,
    ]);
    setStudents(prev => [
      ...prev.map(st => {
        const u = b.studentUpdates.find(x => x.id === st.id);
        return u ? { ...st, ...u.patch } : st;
      }),
      ...b.newStudents,
    ]);
    setEnrollments(prev => [...prev, ...b.enrollments]);
    setPlans(prev => [...prev, ...b.plans]);
    setPayments(prev => [...b.payments, ...prev]);
    setPromotionGroups(prev => [...prev, ...b.promotionGroups]);
    setSchedules(prev => [...prev, ...b.schedules]);
    setCashMovements(prev => [
      ...b.cashMovements.map((m, i) => ({
        ...m, id: `CJ-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 5)}`, user: currentUser.name,
      })),
      ...prev,
    ]);

    return { ok: true, enrollmentIds: b.enrollments.map(e => e.id) };
  };

  const requestEnrollmentDrop = (enrollmentId: string, input: DropInput): StockResult => {
    const enrollment = enrollments.find(e => e.id === enrollmentId);
    if (!enrollment) return { ok: false, error: 'No se encontró la matrícula.' };
    const auth = canRequest(authority(), 'Caída');
    if (!auth.ok) return { ok: false, error: auth.reason };
    const problems = validateDropRequest(enrollment, input, dropRequests, todayLocalISO());
    if (problems.length > 0) return { ok: false, error: problems[0] };
    const request: DropRequest = {
      id: nextSequentialId('CAI', dropRequests.map(r => r.id)),
      enrollmentId,
      studentId: enrollment.studentId,
      requestedAt: new Date().toISOString(),
      requestedBy: currentUser.name,
      reason: input.reason,
      detail: input.detail.trim(),
      effectiveDate: input.effectiveDate,
      status: 'Pendiente',
    };
    setDropRequests(prev => [request, ...prev]);
    addNotification({ title: 'Solicitud de caída pendiente', message: `${currentUser.name} solicitó la caída de la matrícula ${enrollmentId} (${enrollment.student}): ${input.reason}.`, type: 'warning' });
    return { ok: true };
  };

  const resolveEnrollmentDrop = (requestId: string, decision: 'Aprobada' | 'Rechazada', opts: { note: string; forgiveOverdue: boolean }): StockResult => {
    const request = dropRequests.find(r => r.id === requestId);
    if (!request) return { ok: false, error: 'No se encontró la solicitud.' };
    const auth = canResolve(authority(), 'Caída', request.requestedBy);
    if (!auth.ok) return { ok: false, error: auth.reason };
    const problems = validateDropResolution(request, decision, opts.note);
    if (problems.length > 0) return { ok: false, error: problems[0] };
    const resolution = { status: decision, resolvedAt: new Date().toISOString(), resolvedBy: currentUser.name, resolutionNote: opts.note.trim() || undefined };

    if (decision === 'Rechazada') {
      setDropRequests(prev => prev.map(r => (r.id === requestId ? { ...r, ...resolution } : r)));
      return { ok: true };
    }

    const enrollment = enrollments.find(e => e.id === request.enrollmentId);
    if (!enrollment) return { ok: false, error: 'No se encontró la matrícula.' };
    if (enrollment.status !== 'Activa') return { ok: false, error: `La matrícula ya no está activa (${enrollment.status}).` };
    const plan = plans.find(p => p.mat === enrollment.id);
    const preview = previewDrop(
      { enrollment, plan, schedules, monthly: monthlySchedules, students, enrollments, payments, groups: promotionGroups },
      request.effectiveDate
    );
    const forgive = opts.forgiveOverdue && preview.overdue.length > 0;
    const effects = summarizeDrop(preview, forgive);

    setEnrollments(prev => prev.map(e => (e.id === enrollment.id ? { ...e, status: 'Caída', plan: 'Caída', dropDate: request.effectiveDate, dropRequestId: request.id } : e)));
    if (plan) setPlans(prev => prev.map(p => (p.id === plan.id ? applyDropToPlan(p, preview, forgive) : p)));
    if (preview.scheduleIds.length > 0) {
      setSchedules(prev => prev.map(sc => (preview.scheduleIds.includes(sc.id) ? { ...sc, status: 'Cancelado', observations: 'Cancelada por la caída de la matrícula' } : sc)));
      logSystemCancel(preview.scheduleIds, 'Caída de la matrícula');
    }
    logActivityRemovals(preview.activityRemovals, 'Caída de la matrícula');
    if (preview.activityRemovals.length > 0) {
      setMonthlySchedules(prev => prev.map(m => ({
        ...m,
        actividades: m.actividades.map(a =>
          preview.activityRemovals.filter(r => r.monthlyId === m.id && r.activityId === a.id).reduce((acc, r) => withoutEnrollment(acc, r.studentId), a)
        ),
      })));
    }
    if (preview.studentDeactivated) {
      setStudents(prev => prev.map(st => (st.id === enrollment.studentId || (!enrollment.studentId && st.name === enrollment.student) ? { ...st, status: 'Inactivo' } : st)));
    }
    setDropRequests(prev => prev.map(r => (r.id === requestId ? { ...r, ...resolution, effects } : r)));
    return { ok: true };
  };

  const updateEnrollmentData = (enrollmentId: string, after: EnrollmentEditValues, reason: string): StockResult => {
    const enrollment = enrollments.find(e => e.id === enrollmentId);
    if (!enrollment) return { ok: false, error: 'No se encontró la matrícula.' };
    const student = students.find(s => s.id === enrollment.studentId) ?? students.find(s => s.name === enrollment.student);
    const names = {
      origin: (id: string) => leadSources.find(l => l.id === id)?.name ?? '',
      advisor: (id: string) => { const m = staff.find(x => x.id === id); return m ? `${m.names} ${m.lastNameP}`.trim() : ''; },
    };
    const changes = diffEnrollmentEdit(currentEditValues(enrollment, student), after, names);
    const problems = validateEnrollmentEdit(enrollment, after, changes, reason);
    if (problems.length > 0) return { ok: false, error: problems[0] };
    const at = new Date().toISOString();
    setEnrollments(prev => prev.map(e => (e.id === enrollmentId ? { ...e, ...buildEnrollmentPatch(after, names) } : e)));
    if (student && changes.some(c => c.field === 'schedule')) setStudents(prev => prev.map(st => (st.id === student.id ? { ...st, horario: after.schedule.trim() || undefined } : st)));
    setEnrollmentChanges(prev => [
      ...changes.map((c, i) => ({ id: `COR-${Date.now()}-${i}`, enrollmentId, at, by: currentUser.name, field: c.field, label: c.label, from: c.from, to: c.to, reason: reason.trim() })),
      ...prev,
    ]);
    return { ok: true };
  };

  /** Autoridad del usuario actual (ver `utils/authority.ts`). */
  const authority = (): AuthorityContext => ({ user: currentUser, roles, permissions });
  const can = (permission: string) => canDo(authority(), permission);

  const reversePayment = (paymentId: string, input: ReversalInput): StockResult => {
    const payment = payments.find(p => p.id === paymentId);
    if (!payment) return { ok: false, error: 'No se encontró el pago.' };
    if (!can(PERM.reversePayment)) return { ok: false, error: 'Su rol no puede reversar pagos.' };
    const ctx = { payments, plans, enrollments, groups: promotionGroups };
    const problems = validateReversal(payment, input, ctx);
    if (problems.length > 0) return { ok: false, error: problems[0] };
    // Comprobante: nota de crédito emitida por el sistema, registrada, o constancia de que no se entregó
    const noteMode: NoteMode = input.creditNoteMode ?? allowedNoteModes(payment)[0];
    const noteProblems = validateNoteChoice(payment, noteMode, input.creditNote, input.detail, creditNotes);
    if (noteProblems.length > 0) return { ok: false, error: noteProblems[0] };
    if ((noteMode === 'emitir' || noteMode === 'externa') && !can(PERM.creditNote)) return { ok: false, error: 'Su rol no puede emitir ni registrar notas de crédito.' };
    const today = todayLocalISO();
    const targets = reversalTargets(payment, ctx);
    let note: CreditNote | undefined;
    if (noteMode === 'emitir' || noteMode === 'externa') {
      const built = buildCreditNote({ payment, mode: noteMode, external: input.creditNote, reason: input.reason, detail: input.detail, by: currentUser.name, at: new Date().toISOString() }, creditNotes);
      note = { ...built, id: nextSequentialId('NC', creditNotes.map(n => n.id)) };
      setCreditNotes(prev => [note!, ...prev]);
    }

    // 1) Cuotas y planes: se repone lo que cubrió el pago
    setPlans(prev => prev.map(plan => {
      const t = targets.find(x => x.planId === plan.id);
      return t ? applyReversalToPlan(plan, payment, t.shareUSD, today).plan : plan;
    }));
    // 2) El pago queda anulado (con constancia); su comprobante y su operación quedan libres
    setPayments(prev => prev.map(p => (p.id === paymentId
      ? { ...p, status: 'Anulado', reversal: { at: new Date().toISOString(), by: currentUser.name, reason: input.reason, detail: input.detail.trim(), refunded: input.refunded, creditNote: note?.label, creditNoteId: note?.id, creditNoteMode: noteMode } }
      : p)));
    // 3) Caja: devolución (egreso) o ingresos reversados
    if (input.refunded) {
      const parts = payment.parts && payment.parts.length > 0 ? payment.parts : [{ id: 'x', currency: payment.currency ?? 'USD', amount: payment.amount, method: payment.method } as PaymentPart];
      const usd = partsUSD(parts) ?? [payment.amount];
      const branchId = enrollments.find(e => e.id === payment.enrollmentIds?.[0])?.branchId;
      parts.forEach((part, i) => addCashMovement({
        kind: 'Egreso',
        concept: 'Devolución de pago',
        reference: `${payment.id} / ${payment.student}`,
        currency: part.currency,
        amount: part.amount,
        exchangeRate: part.currency === 'PEN' ? part.exchangeRate : undefined,
        amountUSD: usd[i] ?? payment.amount,
        method: part.method,
        bank: part.bank,
        operationNumber: part.operationNumber,
        branchId,
        paymentId,
        enrollmentIds: payment.enrollmentIds,
      }));
    } else {
      setCashMovements(prev => prev.map(m => (m.paymentId === paymentId && m.kind === 'Ingreso' ? { ...m, status: 'Reversado' } : m)));
    }
    addNotification({ title: 'Pago reversado', message: `${currentUser.name} reversó el pago ${paymentId} de ${payment.student} (${input.reason}).`, type: 'warning' });
    return { ok: true };
  };

  // ---- Personal: asignaciones, contratos y baja
  const saveAssignment = (form: AssignmentForm, editingId?: string): StockResult => {
    if (editingId) {
      const current = assignments.find(a => a.id === editingId);
      if (!current) return { ok: false, error: 'No se encontró la asignación.' };
      if (!isActiveAssignment(current)) return { ok: false, error: 'La asignación está cerrada: no se edita. Cree una nueva.' };
      if (current.staffId !== form.staffId) return { ok: false, error: 'No se puede cambiar el trabajador de una asignación.' };
    }
    const errors = validateAssignmentForm(form, assignments, staff, branches, todayLocalISO(), editingId);
    const first = Object.values(errors)[0];
    if (first) return { ok: false, error: first };
    setAssignments(prev => saveAssignmentIn(prev, form, editingId).assignments);
    return { ok: true };
  };

  const closeAssignment = (id: string, date: string, reason: string): StockResult => {
    const target = assignments.find(a => a.id === id);
    if (!target) return { ok: false, error: 'No se encontró la asignación.' };
    const today = todayLocalISO();
    const problems = validateAssignmentClose(target, date, reason, today);
    if (problems.length > 0) return { ok: false, error: problems[0] };
    const impact = closeImpact(target, assignments, staff.find(s => s.id === target.staffId), schedules, today, allActivities(monthlySchedules));
    if (impact.blocked) return { ok: false, error: `Es su última asignación de Psicopedagogía y tiene ${impact.futureSessions.length} asesoría(s) y ${impact.futureActivities.length} actividad(es) futura(s): reasígnelas primero.` };
    setAssignments(prev => closeAssignmentIn(prev, id, date, reason, currentUser.name).assignments);
    return { ok: true };
  };

  const editContract = (id: string, form: ContractForm, reason: string): StockResult => {
    const current = contracts.find(c => c.id === id);
    if (!current) return { ok: false, error: 'No se encontró el contrato.' };
    if (form.staffId !== current.staffId) return { ok: false, error: 'No se puede cambiar el trabajador de un contrato.' };
    const errors = validateContractForm(form, contracts, staff, todayLocalISO(), id);
    const first = Object.values(errors)[0];
    if (first) return { ok: false, error: first };
    const patch = buildContractPatch(form);
    const changes = diffContract(current, patch);
    const problems = validateContractEdit(current, changes, reason);
    if (problems.length > 0) return { ok: false, error: problems[0] };
    setContracts(prev => prev.map(c => (c.id === id
      ? { ...c, ...patch, revisions: [{ at: new Date().toISOString(), by: currentUser.name, reason: reason.trim(), changes }, ...(c.revisions ?? [])] }
      : c)));
    return { ok: true };
  };

  const inactivateStaff = (id: string, input: { reason: string; detail: string; date: string }): StockResult => {
    const member = staff.find(s => s.id === id);
    if (!member) return { ok: false, error: 'No se encontró al trabajador.' };
    const ctx = { contracts, assignments, schedules, activities: allActivities(monthlySchedules), today: todayLocalISO() };
    const problems = validateInactivation(member, input.reason, input.detail, input.date, ctx);
    if (problems.length > 0) return { ok: false, error: problems[0] };
    const note = `${input.reason} — ${input.detail.trim()}`;
    setStaff(prev => prev.map(s => (s.id === id ? { ...s, status: 'Inactivo', statusDate: input.date, statusReason: note } : s)));
    setAssignments(prev => closeAllOf(prev, id, input.date, note, currentUser.name));
    return { ok: true };
  };

  const reactivateStaff = (id: string, detail: string): StockResult => {
    const member = staff.find(s => s.id === id);
    if (!member) return { ok: false, error: 'No se encontró al trabajador.' };
    const problems = validateReactivation(member, detail);
    if (problems.length > 0) return { ok: false, error: problems[0] };
    setStaff(prev => prev.map(s => (s.id === id ? { ...s, status: 'Activo', statusDate: todayLocalISO(), statusReason: `Reactivado — ${detail.trim()}` } : s)));
    return { ok: true };
  };

  // ---- Caja: reversa de movimientos y lotes de depósito
  const reverseCashMovement = (id: string, input: { reason: string; detail: string }): StockResult => {
    const movement = cashMovements.find(m => m.id === id);
    if (!movement) return { ok: false, error: 'No se encontró el movimiento.' };
    if (!can(PERM.reverseCash)) return { ok: false, error: 'Su rol no puede reversar movimientos de caja.' };
    const closed = closedMessage(cashClosures, 'caja', movement.currency, localDateOf(movement.date));
    if (closed) return { ok: false, error: closed };
    const problems = validateCashReversal(movement, input.reason, input.detail, cashMovements);
    if (problems.length > 0) return { ok: false, error: problems[0] };
    const check = cashReversalCheck(movement, cashMovements);
    if (check.restock) {
      const r = updateStock(check.restock.branchId, check.restock.itemId, check.restock.qty, 'Devolución', `Reversa de la venta registrada en caja (${movement.id})`, movement.id);
      if (!r.ok) return r;
    }
    setCashMovements(prev => applyCashReversal(prev, id, { ...input, at: new Date().toISOString(), by: currentUser.name }));
    addNotification({ title: 'Movimiento de caja reversado', message: `${currentUser.name} reversó el movimiento ${movement.id} (${movement.concept}): ${input.reason}.`, type: 'warning' });
    return { ok: true };
  };

  const createDepositBatch = (input: DepositInput): StockResult & { code?: string } => {
    if (!can(PERM.deposit)) return { ok: false, error: 'Su rol no puede crear lotes de depósito.' };
    const closed = closedMessage(cashClosures, 'caja', input.currency, input.date);
    if (closed) return { ok: false, error: closed };
    const problems = validateDeposit(input, cashMovements, todayLocalISO());
    if (problems.length > 0) return { ok: false, error: problems[0] };
    const built = buildDeposit(input, cashMovements, currentUser.name, new Date(`${input.date}T12:00:00`).toISOString());
    const created: CashMovement = { ...built.egress, id: `CJ-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, user: currentUser.name, status: 'Aplicado' };
    const ids = new Set(built.selected.map(m => m.id));
    setCashMovements(prev => [created, ...prev.map(m => (ids.has(m.id) ? { ...m, depositedIn: built.code } : m))]);
    return { ok: true, code: built.code };
  };

  // ---- Caja chica
  const addPettyCashMovement = (input: PettyInput): StockResult => {
    const errors = validatePettyInput(input, pettyCashMovements, todayLocalISO(), pettyFund);
    const first = Object.values(errors)[0];
    if (first) return { ok: false, error: first };
    const closed = closedMessage(cashClosures, 'caja-chica', 'PEN', input.date);
    if (closed) return { ok: false, error: closed };
    const created: PettyCashMovement = {
      ...buildPettyMovement(input),
      id: nextSequentialId('CCH', pettyCashMovements.map(m => m.id)),
      user: currentUser.name,
      status: 'Aplicado',
    };
    setPettyCashMovements(prev => [created, ...prev]);
    return { ok: true };
  };

  const reversePettyCashMovement = (id: string, input: { reason: string; detail: string }): StockResult => {
    const movement = pettyCashMovements.find(m => m.id === id);
    if (!movement) return { ok: false, error: 'No se encontró el movimiento.' };
    if (!can(PERM.reversePetty)) return { ok: false, error: 'Su rol no puede reversar movimientos de la caja chica.' };
    const closed = closedMessage(cashClosures, 'caja-chica', 'PEN', localDateOf(movement.date));
    if (closed) return { ok: false, error: closed };
    const problems = validatePettyReversal(movement, input.reason, input.detail, pettyCashMovements);
    if (problems.length > 0) return { ok: false, error: problems[0] };
    setPettyCashMovements(prev => prev.map(m => (m.id === id
      ? { ...m, status: 'Reversado' as const, reversal: { at: new Date().toISOString(), by: currentUser.name, reason: input.reason, detail: input.detail.trim() } }
      : m)));
    return { ok: true };
  };

  // ---- Cierre y reapertura de caja, fondo de la caja chica
  const closeCash = (input: ClosureInput): StockResult => {
    if (!can(input.scope === 'caja' ? PERM.closeCash : PERM.closePetty)) return { ok: false, error: 'Su rol no puede cerrar esta caja.' };
    const expected = expectedAt(input.scope, input.currency, input.date, cashMovements, pettyCashMovements);
    const problems = validateClosure(input, cashClosures, expected, todayLocalISO());
    if (problems.length > 0) return { ok: false, error: problems[0] };
    const built = buildClosure(input, expected, currentUser.name, new Date().toISOString());
    setCashClosures(prev => [{ ...built, id: nextSequentialId('CIE', prev.map(c => c.id)) }, ...prev]);
    return { ok: true };
  };

  const reopenCash = (closureId: string, reason: string): StockResult => {
    const closure = cashClosures.find(c => c.id === closureId);
    if (!closure) return { ok: false, error: 'No se encontró el cierre.' };
    if (!can(closure.scope === 'caja' ? PERM.reopenCash : PERM.closePetty)) return { ok: false, error: 'Su rol no puede reabrir esta caja.' };
    const problems = validateReopen(closure, cashClosures, reason);
    if (problems.length > 0) return { ok: false, error: problems[0] };
    setCashClosures(prev => prev.map(c => (c.id === closureId ? { ...c, status: 'Reabierta' as const, reopenedAt: new Date().toISOString(), reopenedBy: currentUser.name, reopenReason: reason.trim() } : c)));
    addNotification({ title: 'Caja reabierta', message: `${currentUser.name} reabrió el cierre ${closure.id} (${closure.scope === 'caja' ? `Caja ${closure.currency}` : 'Caja chica'} al ${closure.date}): ${reason.trim()}`, type: 'warning' });
    return { ok: true };
  };

  const updatePettyFund = (fund: { assigned: string; maxExpense: string }): StockResult => {
    if (!can(PERM.configPetty)) return { ok: false, error: 'Su rol no puede configurar el fondo de la caja chica.' };
    const errors = validateFund(fund);
    const first = errors.assigned ?? errors.maxExpense;
    if (first) return { ok: false, error: first };
    setPettyFund({ assigned: Number(fund.assigned), maxExpense: Number(fund.maxExpense) });
    return { ok: true };
  };

  // ---- Cambios de matrícula: reactivación, cambio de programa/nivel y traslado de sede
  const changeContext = (omit?: string): ChangeContext => ({
    enrollments, plans, students, schedules, monthly: monthlySchedules, programs, levels, tariffs, paymentTypes, branches, classSchedules,
    payments, groups: promotionGroups, requests: omit ? changeRequests.filter(r => r.id !== omit) : changeRequests, today: todayLocalISO(),
  });

  const openChange = (kind: ChangeKind & ChangeRequest['kind'], enrollment: Enrollment, reason: string, detail: string, payload: Record<string, string>): StockResult => {
    const request: ChangeRequest = {
      id: nextSequentialId('SOL', changeRequests.map(r => r.id)), kind, enrollmentId: enrollment.id, studentId: enrollment.studentId,
      requestedAt: new Date().toISOString(), requestedBy: currentUser.name, reason, detail: detail.trim(), payload, status: 'Pendiente',
    };
    setChangeRequests(prev => [request, ...prev]);
    addNotification({ title: `Solicitud de ${kind.toLowerCase()} pendiente`, message: `${currentUser.name} solicitó ${kind.toLowerCase()} para la matrícula ${enrollment.id} (${enrollment.student}): ${reason}.`, type: 'warning' });
    return { ok: true };
  };

  const requestReactivation = (enrollmentId: string, input: ReactivationInput): StockResult => {
    const enrollment = enrollments.find(e => e.id === enrollmentId);
    if (!enrollment) return { ok: false, error: 'No se encontró la matrícula.' };
    const auth = canRequest(authority(), 'Reactivación');
    if (!auth.ok) return { ok: false, error: auth.reason };
    const problems = validateReactivationRequest(enrollment, input, changeContext());
    if (problems.length > 0) return { ok: false, error: problems[0] };
    return openChange('Reactivación', enrollment, input.reason, input.detail, { startDate: input.startDate });
  };

  const requestProgramChange = (enrollmentId: string, input: ProgramChangeInput): StockResult => {
    const enrollment = enrollments.find(e => e.id === enrollmentId);
    if (!enrollment) return { ok: false, error: 'No se encontró la matrícula.' };
    const auth = canRequest(authority(), 'Cambio de programa');
    if (!auth.ok) return { ok: false, error: auth.reason };
    const problems = validateProgramChangeRequest(enrollment, input, changeContext());
    if (problems.length > 0) return { ok: false, error: problems[0] };
    return openChange('Cambio de programa', enrollment, input.reason, input.detail, { programId: input.programId, levelId: input.levelId });
  };

  const requestTransfer = (enrollmentId: string, input: TransferInput): StockResult => {
    const enrollment = enrollments.find(e => e.id === enrollmentId);
    if (!enrollment) return { ok: false, error: 'No se encontró la matrícula.' };
    const auth = canRequest(authority(), 'Traslado de sede');
    if (!auth.ok) return { ok: false, error: auth.reason };
    const problems = validateTransferRequest(enrollment, input, changeContext());
    if (problems.length > 0) return { ok: false, error: problems[0] };
    return openChange('Traslado de sede', enrollment, input.reason, input.detail, { branchId: input.branchId, schedule: input.schedule });
  };

  const resolveChangeRequest = (requestId: string, decision: 'Aprobada' | 'Rechazada', note: string): StockResult => {
    const request = changeRequests.find(r => r.id === requestId);
    if (!request) return { ok: false, error: 'No se encontró la solicitud.' };
    if (request.status !== 'Pendiente') return { ok: false, error: 'Esta solicitud ya fue resuelta.' };
    const auth = canResolve(authority(), request.kind, request.requestedBy);
    if (!auth.ok) return { ok: false, error: auth.reason };
    if (decision === 'Rechazada' && note.trim().length < 5) return { ok: false, error: 'Indique por qué se rechaza la solicitud.' };
    const at = new Date().toISOString();
    const base = { status: decision, resolvedAt: at, resolvedBy: currentUser.name, resolutionNote: note.trim() || undefined };
    if (decision === 'Rechazada') {
      setChangeRequests(prev => prev.map(r => (r.id === requestId ? { ...r, ...base } : r)));
      return { ok: true };
    }
    const enrollment = enrollments.find(e => e.id === request.enrollmentId);
    if (!enrollment) return { ok: false, error: 'No se encontró la matrícula.' };
    const c = changeContext(requestId);
    const today = c.today;
    const log = (field: string, label: string, from: string, to: string) =>
      setEnrollmentChanges(prev => [{ id: `COR-${Date.now()}-${field}`, enrollmentId: enrollment.id, at, by: currentUser.name, field, label, from, to, reason: request.reason }, ...prev]);
    const plan = plans.find(p => p.mat === enrollment.id);
    const effects: string[] = [];

    if (request.kind === 'Reactivación') {
      const problems = reactivationProblems(enrollment, c);
      if (problems.length > 0) return { ok: false, error: problems[0] };
      const startDate = request.payload.startDate || today;
      const preview = previewReactivation(enrollment, c, startDate);
      setEnrollments(prev => prev.map(e => (e.id === enrollment.id ? { ...e, status: 'Activa', plan: 'Al día', dropDate: undefined, dropRequestId: undefined, reactivatedAt: at, reactivationRequestId: request.id } : e)));
      if (plan) setPlans(prev => prev.map(p => (p.id === plan.id ? applyReactivationToPlan(p, preview, today) : p)));
      if (preview.studentReactivates) setStudents(prev => prev.map(st => (st.id === enrollment.studentId || (!enrollment.studentId && st.name === enrollment.student) ? { ...st, status: 'Activo' } : st)));
      log('reactivation', 'Reactivación de la matrícula', 'Caída', 'Activa');
      effects.push(`Matrícula reactivada desde el ${startDate}.`, `${preview.restored.length} cuota(s) restituida(s) por USD ${preview.restoredUSD.toFixed(2)}, con el calendario corrido ${preview.shiftDays} día(s).`);
      if (preview.keptDebt.length > 0) effects.push(`Sigue pendiente la deuda vencida de USD ${preview.keptDebtUSD.toFixed(2)}.`);
    } else if (request.kind === 'Cambio de programa') {
      const input = { programId: request.payload.programId, levelId: request.payload.levelId };
      const problems = programChangeProblems(enrollment, input, c);
      if (problems.length > 0) return { ok: false, error: problems[0] };
      const preview = previewProgramChange(enrollment, input, c);
      if (!preview) return { ok: false, error: 'No se pudo calcular el precio del programa nuevo.' };
      if (preview.remaining < 0) return { ok: false, error: `Ya se cobró más (USD ${preview.paidUSD.toFixed(2)}) que el precio del programa nuevo (USD ${preview.newTotal.toFixed(2)}): primero devuelva la diferencia.` };
      const toLabel = preview.level ? `${preview.program.name} - ${preview.level.name}` : preview.program.name;
      setEnrollments(prev => prev.map(e => (e.id === enrollment.id ? {
        ...e, program: preview.program.name, programId: preview.program.id, level: preview.level?.name ?? 'Sin nivel', levelId: preview.level?.id,
        tariffId: preview.tariff.id, tariffName: preview.tariff.name, assignedPrice: preview.newTotal,
        verificationStatus: preview.verificationReset ? 'Pendiente' : e.verificationStatus,
      } : e)));
      if (plan) setPlans(prev => prev.map(p => (p.id === plan.id ? applyProgramChangeToPlan(p, preview, today) : p)));
      const otherActive = enrollments.some(o => o.id !== enrollment.id && o.status === 'Activa' && (o.studentId && enrollment.studentId ? o.studentId === enrollment.studentId : o.student === enrollment.student));
      setSchedules(prev => prev.map(sc => {
        const mine = enrollment.studentId && sc.studentId ? sc.studentId === enrollment.studentId : sc.student === enrollment.student;
        const target = otherActive ? sc.isFirst && sc.enrollmentId === enrollment.id : mine;
        return target && sc.date >= today && ['Reservado', 'Reprogramado'].includes(sc.status) ? { ...sc, program: preview.program.name, level: preview.level?.name ?? 'Sin nivel' } : sc;
      }));
      if (!otherActive) setStudents(prev => prev.map(st => (st.id === enrollment.studentId || (!enrollment.studentId && st.name === enrollment.student) ? { ...st, program: toLabel } : st)));
      log('program', 'Cambio de programa o nivel', preview.fromLabel, toLabel);
      effects.push(`${preview.fromLabel} → ${toLabel}.`, `Precio: USD ${preview.oldTotal.toFixed(2)} → USD ${preview.newTotal.toFixed(2)}; cobrado USD ${preview.paidUSD.toFixed(2)}; saldo USD ${preview.remaining.toFixed(2)}.`);
      if (preview.verificationReset) effects.push('La verificación vuelve a «Pendiente» para entregar los materiales del programa nuevo.');
    } else {
      const input = { branchId: request.payload.branchId, schedule: request.payload.schedule };
      const problems = transferProblems(enrollment, input, c);
      if (problems.length > 0) return { ok: false, error: problems[0] };
      const preview = previewTransfer(enrollment, input, c);
      if (!preview) return { ok: false, error: 'No se encontró la sede destino.' };
      const fromName = preview.fromName;
      setEnrollments(prev => prev.map(e => (e.id === enrollment.id ? { ...e, branchId: input.branchId, sede: preview.toName } : e)));
      if (preview.scheduleChanged) setStudents(prev => prev.map(st => (st.id === enrollment.studentId || (!enrollment.studentId && st.name === enrollment.student) ? { ...st, horario: preview.schedule } : st)));
      if (preview.scheduleIds.length > 0) {
        setSchedules(prev => prev.map(sc => (preview.scheduleIds.includes(sc.id) ? { ...sc, status: 'Cancelado', observations: `Cancelada por el traslado de sede (${fromName} → ${preview.toName})` } : sc)));
        logSystemCancel(preview.scheduleIds, `Traslado de sede (${fromName} → ${preview.toName})`);
      }
      logActivityRemovals(preview.activityRemovals, `Traslado de sede (${fromName} → ${preview.toName})`);
      if (preview.activityRemovals.length > 0) {
        setMonthlySchedules(prev => prev.map(m => ({
          ...m,
          actividades: m.actividades.map(a => preview.activityRemovals.filter(r => r.monthlyId === m.id && r.activityId === a.id).reduce((acc, r) => withoutEnrollment(acc, r.studentId), a)),
        })));
      }
      log('branch', 'Traslado de sede', fromName, preview.toName);
      effects.push(`Sede: ${fromName} → ${preview.toName}.`, `${preview.scheduleIds.length} asesoría(s) y ${preview.activityRemovals.length} inscripción(es) de la sede anterior canceladas.`);
      if (preview.scheduleChanged) effects.push(`Horario de clases: ${preview.schedule}.`);
    }
    setChangeRequests(prev => prev.map(r => (r.id === requestId ? { ...r, ...base, effects } : r)));
    addNotification({ title: `Solicitud de ${request.kind.toLowerCase()} aprobada`, message: `${currentUser.name} aprobó la solicitud ${request.id} de la matrícula ${enrollment.id}.`, type: 'info' });
    return { ok: true };
  };

  // ---- Contrato y ficha de la matrícula
  const documentContextOf = (enrollmentId: string): DocContext | undefined => {
    const enrollment = enrollments.find(e => e.id === enrollmentId);
    if (!enrollment) return undefined;
    const today = todayLocalISO();
    const student = students.find(s => s.id === enrollment.studentId) ?? students.find(s => s.name === enrollment.student);
    const linked = (enrollment.guardianIds && enrollment.guardianIds.length > 0 ? enrollment.guardianIds : student?.guardianIds ?? [])
      .map(id => guardians.find(g => g.id === id)).filter((g): g is Guardian => !!g);
    // Registros antiguos: sin vínculo, el titular se reconoce por el nombre guardado
    const legacy = linked.length === 0 && student && student.titular && student.titular !== student.name ? guardians.find(g => g.name === student.titular) : undefined;
    const guardiansOf = legacy ? [legacy] : linked;
    const program = programOf(enrollment, programs);
    const branch = branches.find(b => b.id === enrollment.branchId);
    return {
      enrollment, student, guardians: guardiansOf, program,
      level: levels.find(l => l.id === enrollment.levelId), plan: plans.find(p => p.mat === enrollment.id), branch,
      company: companies.find(c => c.name === branch?.company), firstSession: firstSessionOf(enrollment.id, schedules),
      validity: enrollmentValidity(enrollment, program, schedules, today), template: contractTemplate, today,
    };
  };

  const updateContractTemplate = (input: Omit<ContractTemplate, 'version' | 'updatedAt' | 'updatedBy'>): StockResult => {
    if (!can(PERM.documents)) return { ok: false, error: 'Su rol no puede editar las plantillas de documentos.' };
    const problems = validateTemplate({ ...input, version: contractTemplate.version });
    if (problems.length > 0) return { ok: false, error: problems[0] };
    const changed = JSON.stringify([input.intro, input.clauses, input.closing]) !== JSON.stringify([contractTemplate.intro, contractTemplate.clauses, contractTemplate.closing]);
    setContractTemplate({
      ...input, reviewed: input.reviewed,
      version: changed ? contractTemplate.version + 1 : contractTemplate.version, updatedAt: new Date().toISOString(), updatedBy: currentUser.name,
    });
    return { ok: true };
  };

  const generateEnrollmentDocument = (enrollmentId: string, kind: DocKind): StockResult => {
    if (!can(PERM.documents)) return { ok: false, error: 'Su rol no puede generar contratos ni fichas.' };
    const ctx = documentContextOf(enrollmentId);
    if (!ctx) return { ok: false, error: 'No se encontró la matrícula.' };
    const problems = documentProblems(kind, ctx);
    if (problems.length > 0) return { ok: false, error: problems[0] };
    const built = buildDocument(kind, ctx);
    const issued = issueDocument(kind, ctx.enrollment.documents?.[kind], built, currentUser.name, new Date().toISOString(), issuedNumbers(enrollments, kind));
    setEnrollments(prev => prev.map(e => (e.id === enrollmentId ? { ...e, documents: { ...(e.documents ?? {}), [kind]: issued } } : e)));
    return { ok: true };
  };

  const registerDocumentSignature = (enrollmentId: string, kind: DocKind, input: { date: string; file: string }): StockResult => {
    if (!can(PERM.documents)) return { ok: false, error: 'Su rol no puede registrar firmas.' };
    const ctx = documentContextOf(enrollmentId);
    if (!ctx) return { ok: false, error: 'No se encontró la matrícula.' };
    const issued = ctx.enrollment.documents?.[kind];
    const state = docState(issued, buildDocument(kind, ctx).fingerprint);
    const problems = validateSignature(issued, state, input, todayLocalISO());
    if (problems.length > 0) return { ok: false, error: problems[0] };
    setEnrollments(prev => prev.map(e => (e.id === enrollmentId && e.documents?.[kind]
      ? { ...e, documents: { ...e.documents, [kind]: { ...e.documents[kind]!, signedAt: input.date, signedBy: currentUser.name, signedFile: input.file.trim() } } }
      : e)));
    return { ok: true };
  };

  // ---- Cobranza: política, recordatorios y mora
  const updateCollectionPolicy = (input: { graceDays: string; moraMonthlyRatePct: string; remindBefore: string; remindAfter: string }): StockResult => {
    if (!can(PERM.configCollections)) return { ok: false, error: 'Su rol no puede configurar la política de cobranza.' };
    const problems = validatePolicy(input);
    if (problems.length > 0) return { ok: false, error: problems[0] };
    setCollectionPolicy(parsePolicy(input));
    return { ok: true };
  };

  const logReminder = (reminder: Pick<Reminder, 'key' | 'planId' | 'installmentId' | 'stage'>, channel: ReminderLog['channel'], result: ReminderLog['result'], note: string): StockResult => {
    if (!can(PERM.sendReminders)) return { ok: false, error: 'Su rol no puede registrar recordatorios.' };
    const problems = validateReminderLog(reminder, channel, result, note, reminderLogs);
    if (problems.length > 0) return { ok: false, error: problems[0] };
    setReminderLogs(prev => [{
      id: nextSequentialId('REC', prev.map(r => r.id)), key: reminder.key, planId: reminder.planId, installmentId: reminder.installmentId, stageOffset: reminder.stage.offset,
      at: new Date().toISOString(), by: currentUser.name, channel, result, note: note.trim() || undefined,
    }, ...prev]);
    return { ok: true };
  };

  const chargeMora = (planId: string, installmentId: string): StockResult => {
    if (!can(PERM.chargeMora)) return { ok: false, error: 'Su rol no puede cobrar mora.' };
    const plan = plans.find(p => p.id === planId);
    if (!plan) return { ok: false, error: 'No se encontró el plan.' };
    const today = todayLocalISO();
    const problems = validateMoraCharge(plan, installmentId, collectionPolicy, today);
    if (problems.length > 0) return { ok: false, error: problems[0] };
    setPlans(prev => prev.map(pl => (pl.id === planId ? chargeMoraOn(pl, installmentId, collectionPolicy, today) : pl)));
    return { ok: true };
  };

  const enableExtension = (enrollmentId: string): StockResult => {
    const enrollment = enrollments.find(e => e.id === enrollmentId);
    if (!enrollment) return { ok: false, error: 'No se encontró la matrícula.' };
    const v = enrollmentValidity(enrollment, programOf(enrollment, programs), schedules, todayLocalISO());
    if (!canEnableExtension(v)) {
      return {
        ok: false,
        error: v.extensionEnabled
          ? 'La extensión ya está habilitada.'
          : v.extensionMonths === 0
            ? 'El programa no tiene período de extensión.'
            : 'La extensión se habilita cuando la matrícula está por vencer o ya terminó la duración base.',
      };
    }
    setEnrollments(prev => prev.map(e => (e.id === enrollmentId
      ? { ...e, extensionEnabledAt: new Date().toISOString(), extensionEnabledBy: currentUser.name }
      : e)));
    return { ok: true };
  };

  const addTracking = (trackingData: Omit<Tracking, 'id'>): Tracking => {
    const newTracking: Tracking = {
      ...trackingData,
      id: `TRK-${Date.now().toString().slice(-4)}`
    };
    setTrackings(prev => [newTracking, ...prev]);
    if (newTracking.scheduleId) {
      pushEvents([{ id: nextEventId(), at: new Date().toISOString(), by: currentUser.name, subject: 'asesoria', refId: newTracking.scheduleId, studentId: newTracking.studentId, type: 'Sesión registrada' }]);
    }
    return newTracking;
  };

  const updateTracking = (id: string, data: Partial<Omit<Tracking, 'id'>>) => {
    setTrackings(prev => prev.map(t => (t.id === id ? { ...t, ...data } : t)));
  };

  const addProgram = (programData: Omit<Program, 'id'>) => {
    const newProgram = {
      ...programData,
      id: Date.now().toString(),
    };
    setPrograms(prev => [...prev, newProgram]);
  };

  const updateProgram = (id: string, programData: Partial<Program>) => {
    setPrograms(prev => prev.map(p => p.id === id ? { ...p, ...programData } : p));
  };

  const deleteProgram = (id: string) => {
    setPrograms(prev => prev.filter(p => p.id !== id));
  };

  const addLevel = (levelData: Omit<Level, 'id'>) => {
    const newLevel = {
      ...levelData,
      id: Date.now().toString(),
    };
    setLevels(prev => [...prev, newLevel]);
  };

  const updateLevel = (id: string, levelData: Partial<Level>) => {
    setLevels(prev => prev.map(l => l.id === id ? { ...l, ...levelData } : l));
  };

  const deleteLevel = (id: string) => {
    setLevels(prev => prev.filter(l => l.id !== id));
  };

  const addPaymentType = (data: Omit<PaymentType, 'id'>) => {
    setPaymentTypes(prev => [...prev, { ...data, id: Date.now().toString() }]);
  };

  const updatePaymentType = (id: string, data: Partial<PaymentType>) => {
    setPaymentTypes(prev => prev.map(pt => pt.id === id ? { ...pt, ...data } : pt));
  };

  const deletePaymentType = (id: string) => {
    setPaymentTypes(prev => prev.filter(pt => pt.id !== id));
  };

  const addTariff = (data: Omit<Tariff, 'id'>) => {
    setTariffs(prev => [...prev, { ...data, id: Date.now().toString() }]);
  };

  const updateTariff = (id: string, data: Partial<Tariff>) => {
    setTariffs(prev => prev.map(t => t.id === id ? { ...t, ...data } : t));
  };

  const deleteTariff = (id: string) => {
    setTariffs(prev => prev.filter(t => t.id !== id));
  };

  const addPromotion = (data: Omit<Promotion, 'id'>) => {
    setPromotions(prev => [...prev, { ...data, id: Date.now().toString() }]);
  };

  const updatePromotion = (id: string, data: Partial<Promotion>) => {
    setPromotions(prev => prev.map(p => p.id === id ? { ...p, ...data } : p));
  };

  const deletePromotion = (id: string) => {
    setPromotions(prev => prev.filter(p => p.id !== id));
  };

  const addBranch = (branch: Branch) => {
    setBranches(prev => [...prev, branch]);
  };

  const updateBranch = (id: string, branchData: Partial<Branch>) => {
    setBranches(prev => prev.map(b => b.id === id ? { ...b, ...branchData } : b));
  };

  const deleteBranch = (id: string) => {
    setBranches(prev => prev.filter(b => b.id !== id));
  };

  const shipmentsRef = useRef<Shipment[]>(shipments);
  shipmentsRef.current = shipments;
  const commitShipments = (next: Shipment[]) => {
    shipmentsRef.current = next;
    setShipments(next);
  };

  const IN_TRANSIT_STATUSES: Shipment['status'][] = ['En tránsito', 'Listo para recepción'];

  /** Efectos de cambio de estado de un envío (misma regla que Transferencias: sale del origen al despachar). */
  const checkShipmentDispatch = (prev: Shipment | undefined, next: Shipment): string | null => {
    const dispatching = IN_TRANSIT_STATUSES.includes(next.status) && (!prev || prev.status === 'Borrador');
    return dispatching ? findInsufficientStock(next.originId, next.items) : null;
  };

  const applyShipmentTransition = (prev: Shipment | undefined, next: Shipment) => {
    const wasDispatched = !!prev && IN_TRANSIT_STATUSES.includes(prev.status);
    const isDispatched = IN_TRANSIT_STATUSES.includes(next.status);

    if (!wasDispatched && isDispatched && (!prev || prev.status === 'Borrador')) {
      next.items.forEach(i => {
        updateStock(next.originId, i.itemId, -i.quantity, 'Transferencia Salida', `Despacho de envío ${next.id}`, next.id);
      });
      addNotification({
        title: 'Envío en tránsito',
        message: `El envío ${next.id} desde ${branches.find(b => b.id === next.originId)?.name || 'la sede de origen'} ha sido despachado. El stock salió del origen y se sumará al recepcionar.`,
        type: 'info',
        branchId: next.destinationId
      });
    }

    if (wasDispatched && next.status === 'Cancelado') {
      next.items.forEach(i => {
        updateStock(next.originId, i.itemId, i.quantity, 'Ingreso', `Cancelación de envío ${next.id}`, next.id);
      });
    }
  };

  const addShipment = (shipment: Omit<Shipment, 'id'>): StockResult & { id?: string } => {
    const newId = `ENV-${new Date().getFullYear()}-${String(shipmentsRef.current.length + 1).padStart(3, '0')}`;
    const created: Shipment = { ...shipment, id: newId };
    const shortage = checkShipmentDispatch(undefined, created);
    if (shortage) return { ok: false, error: shortage };
    commitShipments([...shipmentsRef.current, created]);
    applyShipmentTransition(undefined, created);
    return { ok: true, id: newId };
  };

  const updateShipmentStatus = (id: string, status: Shipment['status'], observation?: string): StockResult => {
    const prev = shipmentsRef.current.find(s => s.id === id);
    if (!prev) return { ok: false, error: 'Envío no encontrado.' };
    const next: Shipment = { ...prev, status, observation: observation || prev.observation };
    const shortage = checkShipmentDispatch(prev, next);
    if (shortage) return { ok: false, error: shortage };
    commitShipments(shipmentsRef.current.map(s => s.id === id ? next : s));
    applyShipmentTransition(prev, next);
    return { ok: true };
  };
  
  const deleteShipment = (id: string) => {
    commitShipments(shipmentsRef.current.filter(s => s.id !== id));
  };

  const updateShipment = (id: string, shipment: Partial<Shipment>): StockResult => {
    const prev = shipmentsRef.current.find(s => s.id === id);
    if (!prev) return { ok: false, error: 'Envío no encontrado.' };
    const next: Shipment = { ...prev, ...shipment };
    const shortage = checkShipmentDispatch(prev, next);
    if (shortage) return { ok: false, error: shortage };
    commitShipments(shipmentsRef.current.map(s => s.id === id ? next : s));
    applyShipmentTransition(prev, next);
    return { ok: true };
  };

  const addCompany = (company: Company) => {
    setCompanies(prev => [...prev, company]);
  };

  const updateCompany = (id: string, companyData: Partial<Company>) => {
    setCompanies(prev => prev.map(c => c.id === id ? { ...c, ...companyData } : c));
  };

  const deleteCompany = (id: string) => {
    setCompanies(prev => prev.filter(c => c.id !== id));
  };

  const addRole = (role: Role) => {
    setRoles(prev => [...prev, role]);
  };

  const updateRole = (id: string, roleData: Partial<Role>) => {
    setRoles(prev => prev.map(r => r.id === id ? { ...r, ...roleData } : r));
  };

  const deleteRole = (id: string) => {
    setRoles(prev => prev.filter(r => r.id !== id));
  };

  const addUser = (user: User) => {
    setUsers(prev => [...prev, user]);
  };

  const updateUser = (id: string, userData: Partial<User>) => {
    setUsers(prev => prev.map(u => u.id === id ? { ...u, ...userData } : u));
  };

  const deleteUser = (id: string) => {
    setUsers(prev => prev.filter(u => u.id !== id));
  };

  const savePermissions = (roleId: string, newPermissions: string[]) => {
    setPermissions(prev => {
      const existing = prev.find(p => p.roleId === roleId);
      if (existing) {
        return prev.map(p => p.roleId === roleId ? { ...p, permissions: newPermissions } : p);
      }
      return [...prev, { roleId, permissions: newPermissions }];
    });
  };

  return (
    <DataContext.Provider value={{ 
      guardians, 
      students, 
      enrollments, 
      plans, 
      payments, 
      items,
      setItems,
      stockItems, 
      classSchedules,
      addClassSchedule,
      updateClassSchedule,
      deleteClassSchedule,
      cashMovements,
      addCashMovement,
      reverseCashMovement,
      createDepositBatch,
      pettyCashMovements,
      addPettyCashMovement,
      reversePettyCashMovement,
      promotionGroups,
      itemPrices,
      addItemPrice,
      kardex, 
      transfers, 
      setTransfers,
      couriers,
      setCouriers,
      shippingMethods,
      setShippingMethods,
      adjustments, 
      schedules, 
      addSchedule,
      updateSchedule,
      psyEvents,
      setActivityResponsible,
      enrollInActivity,
      unenrollFromActivity,
      markActivityAttendance,
      psyReminderPolicy,
      savePsyReminderPolicy,
      psyReminderLogs,
      logPsyReminder,
      gateOfSchedule,
      attendanceBlockOf,
      pendingFirstSessions,
      trackings, 
      monthlySchedules, 
      addMonthlySchedule,
      updateMonthlySchedule,
      deleteMonthlySchedule,
      capacityConfig,
      setCapacityConfig,
      staff,
      contracts,
      assignments,
      saveAssignment,
      closeAssignment,
      editContract,
      inactivateStaff,
      reactivateStaff,
      companies,
      setCompanies,
      addCompany,
      updateCompany,
      deleteCompany,
      roles,
      addRole,
      updateRole,
      deleteRole,
      users,
      addUser,
      updateUser,
      deleteUser,
      permissions,
      savePermissions,
      branches,
      leadSources,
      programs,
      levels,
      paymentTypes,
      tariffs,
      promotions,
      recipes,
      setRecipes,
      unpackPackage,
      packPackage,
      updateStock,
      setRoles,
      setUsers,
      addAdjustment,
      updateMinStock,
      updateTransferStatus,
      updateTransfer,
      addTransfer,
      addStaff,
      addContract,
      updateContract,
      updateStaff,
      deleteStaff,
      addStudent,
      updateStudent,
      deleteStudent,
      addGuardian,
      updateGuardian,
      deleteGuardian,
      registerEnrollments,
      enableExtension,
      dropRequests,
      requestEnrollmentDrop,
      resolveEnrollmentDrop,
      enrollmentChanges,
      updateEnrollmentData,
      reversePayment,
      collectionPolicy,
      updateCollectionPolicy,
      reminderLogs,
      logReminder,
      chargeMora,
      contractTemplate,
      updateContractTemplate,
      documentContextOf,
      generateEnrollmentDocument,
      registerDocumentSignature,
      changeRequests,
      requestReactivation,
      requestProgramChange,
      requestTransfer,
      resolveChangeRequest,
      cashClosures,
      closeCash,
      reopenCash,
      pettyFund,
      updatePettyFund,
      creditNotes,
      can,
      addTracking, 
      updateTracking,
      registerPayment, 
      refinanceInstallment,
      addLeadSource,
      updateLeadSource,
      deleteLeadSource,
      addProgram,
      updateProgram,
      deleteProgram,
      addLevel,
      updateLevel,
      deleteLevel,
      addPaymentType,
      updatePaymentType,
      deletePaymentType,
      addTariff,
      updateTariff,
      deleteTariff,
      addPromotion,
      updatePromotion,
      deletePromotion,
      addBranch,
      updateBranch,
      deleteBranch,
      isEnrollmentWizardOpen,
      setIsEnrollmentWizardOpen,
      shipments,
      addShipment,
      updateShipmentStatus,
      updateShipment,
      deleteShipment,
      notifications,
      addNotification,
      markNotificationAsRead,
      incidents,
      currentBranchId,
      setCurrentBranchId,
      currentUser,
      confirmReception,
      updateEnrollmentVerification
    }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const context = useContext(DataContext);
  if (context === undefined) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
}
