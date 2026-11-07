import React, { createContext, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { buildEnrollmentBatch, type EnrollmentDraft } from '../utils/enrollment';
import { formatDisplayDate } from '../utils/tariffs';
import { createIdAllocator, ID_PREFIX, nextNumericId, nextSequentialId } from '../utils/ids';
import { SLOT_DURATION, addDaysISO, allActivities, canChangeWithNotice, changeBlockedByNotice, branchOfStudent, localDateOf, MONTHS, todayLocalISO, validateActivityEnrollment, weekdayIndex, withEnrollment, withoutEnrollment, type FlatActivity } from '../utils/schedule';
import { addMonths, canEnableExtension, enrollmentValidity, firstSessionOf, programOf } from '../utils/validity';
import { attendanceBlock, blockedFirstSessions, scheduleGate, type FirstSessionGate } from '../utils/verificationGate';
import { buildScheduleEvents, initiatorOfReason, validateChangeMeta } from '../utils/psyHistory';
import { staffDisplayName } from '../utils/staffAccess';
import { linesOf, runIdOf, validateAdjustment, validateClose, validateGenerate, validateReopen as validatePayrollReopen, type BuiltPayroll } from '../utils/payrollRun';
import { periodLabel, periodOf, round2, type LineCalc } from '../utils/payrollEngine';
import { canRemoveEnrollment, staffLabel, validateAttendance, validateResponsible, withAttendance, withoutAttendance } from '../utils/psyActivities';
import { DEFAULT_PSY_POLICY, validatePsyPolicy, validatePsyReminderLog, type PsyReminder } from '../utils/psyReminders';
import { applyDropToPlan, previewDrop, summarizeDrop, validateDropRequest, validateDropResolution, type DropInput } from '../utils/enrollmentDrop';
import { applyReversalToPlan, reversalTargets, validateReversal, type ReversalInput } from '../utils/paymentReversal';
import { buildEnrollmentPatch, currentEditValues, diffEnrollmentEdit, validateEnrollmentEdit, type EnrollmentEditValues } from '../utils/enrollmentEdit';
import { partsUSD } from '../utils/payments';
import type { AssignmentForm, Place } from '../utils/assignments';
import { useStaffDirectory, type StaffDirectoryStatus } from '../hooks/useStaffDirectory';
import { NOT_YET_IN_DB, placesOf } from '../utils/staffDb';
import { appUrl } from '../utils/appUrl';
import { validateInactivation, validateReactivation } from '../utils/staffStatus';
import { buildContractPatch, diffContract, validateContractEdit, validateContractForm, type ContractForm } from '../utils/payroll';
import { buildRenewal, markRenewed, validateRenewal, type RenewalInput } from '../utils/contractRenewal';
import { ceseAgendaError, sessionResponsibleUnavailable, unavailableOn } from '../utils/staffAvailability';
import { applyCashReversal, buildDeposit, cashReversalCheck, validateCashReversal, validateDeposit, type DepositInput } from '../utils/cash';
import { PERM, SUPERUSER, can as canDo, type AuthorityContext } from '../utils/authority';
import { allowedNoteModes, buildCreditNote, validateNoteChoice, type NoteMode } from '../utils/creditNotes';
import { buildClosure, closedMessage, expectedAt, validateClosure, validateReopen, type ClosureInput } from '../utils/cashClosure';
import { DEFAULT_FUND, validateFund, type PettyFund } from '../utils/pettyCash';
import {
  applyProgramChangeToPlan, applyReactivationToPlan, previewProgramChange, previewReactivation, previewTransfer, programChangeProblems, reactivationProblems, responsiblesByBranch, transferProblems,
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
import type { ContractStatus, EnrollmentStatus, InstallmentStatus, PaymentStatus, PlanStatus } from '../utils/statuses';
import { recomputePlan } from '../utils/planState';
import { buildPeopleSeed, buildScheduleSeed, buildTrackingSeed, seedDay } from '../data/seedPeople';
import { seedAssignments, seedBranches, seedContracts, seedLevels, seedPrograms, seedStaff, seedUsers, seedWarehouses } from '../data/seedCatalog';
import { syncCatalogLabels, syncStudentName } from '../utils/identity';
import { buildPettyMovement, validatePettyInput, validatePettyReversal, type PettyInput } from '../utils/pettyCash';
import { buildPaymentRecord, documentLabel, totalUSD, validatePaymentInput, type PaymentDocument } from '../utils/payments';
import { availability, buildHolders, type Availability } from '../utils/capabilities';
import { availabilityForViewer, denialMessage, guardActions, unmetClause, userChangeNeeds } from '../utils/guards';
import { useOrgDirectory, type OrgDirectoryStatus } from '../hooks/useOrgDirectory';
import type { OpResult } from '../services/orgDirectory';
import { supabase } from '../lib/supabase';
import { loadAccessRoles, loadUsers, persistNewRole, persistPermissions, persistRoleDelete, persistRoleUpdate, type AccessData } from '../services/accessRoles';
import { createSupabaseAccountsRepository } from '../services/accountsRepository';
import { accountCreateCheck, accountEditCheck, type AccountRulesContext } from '../utils/accountRules';
import { changeNeeds, editBody, inviteBody, type AccountForm } from '../utils/accounts';
import { createSupabaseRolesRepository } from '../services/accessRolesRepository';
import {
  activeAccount, defaultViewBranch, lastSuperuserError, NO_BRANCH, NO_SCOPE, scopeOfUser, selfAccountError, validView, viewBranchError, warehouseOperationError, type SessionScope,
} from '../utils/session';
import { accountRoleError, planPermissions, roleDeleteError, roleLockedError, seatLimitError, validateRoleInput, type AcceptedRisk } from '../utils/roleBuilder';
import { markRead, noticesFor, visibility, type NoticeScope } from '../utils/notifications';
import { deriveAlerts, type SystemAlert } from '../utils/systemAlerts';
import { duplicateRecipe as copyRecipe, recipeStatusError, validateRecipe } from '../utils/recipes';
import { isWarehouseId, locationSaleError, shipmentRouteError, stockLocations, transferRouteError, warehouseDefinitionError, warehouseInactivationError, type StockLocation } from '../utils/logisticsRoutes';
import { availableStock, getCurrentPrice, itemSaleError, stockEntryError, stockMovesError, validateItem } from '../utils/inventory';

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
  // Alumnos, matrículas y saldo del titular NO se guardan: se derivan (utils/guardianStatement.ts).
}

export interface Student {
  id: string;
  doc: string;
  name: string;
  grado?: string;
  colegio?: string;
  fechaInicio?: string;
  // Titular, estado, programa y edad NO se guardan: se derivan de los vínculos, las matrículas y la fecha de nacimiento (utils/identity.ts).
  // Datos del registro de matrícula (asistente)
  docType?: string;
  names?: string;
  lastNameP?: string;
  lastNameM?: string;
  /** Fecha de nacimiento (AAAA-MM-DD): de aquí sale la edad. */
  birthDate: string;
  phone?: string;
  email?: string;
  address?: string;
  /** Titulares del alumno (el primero es el principal). Vacío = alumno independiente, su propio titular. */
  guardianIds: string[];
  relationship?: string; // parentesco con el titular; vacío si es independiente
  // Situación del alumno: estudia, trabaja, ambos o ninguna
  occupationStatus?: 'estudiando' | 'trabajando' | 'ambos' | 'ninguna';
  institutionType?: string;
  occupation?: string;
  workplace?: string;
}

export interface Enrollment {
  id: string;
  /** Fecha de la matrícula (AAAA-MM-DD): el único formato guardado; el texto «24 Mar 2024» se arma al mostrar. */
  dateISO: string;
  /** Alumno de la matrícula (por id). */
  studentId: string;
  /** Copia del nombre para listar y buscar; se corrige con `syncStudentName` (utils/identity.ts). */
  student: string;
  /** Programa, nivel y sede: el id manda; el texto es una copia que se corrige con `syncCatalogLabels`. */
  programId: string;
  program: string;
  levelId?: string;
  level: string;
  branchId: string;
  sede?: string;
  asesor?: string;
  origen?: string;
  /** Guardado: «Caída» es un hecho de la matrícula. El estado del plan se deriva (utils/planState.ts). */
  status: EnrollmentStatus;
  verificationStatus?: 'Pendiente' | 'Verificado Incompleto' | 'Verificado Completo';
  verifiedItems?: string[]; // IDs of items delivered
  verificationDate?: string;
  verifier?: string;
  verificationObservation?: string;

  // Datos del registro de matrícula (asistente)
  /** Titulares que firmaron la matrícula (el primero es el principal). Vacío = alumno independiente. */
  guardianIds: string[];
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

/** Plantilla del contrato de servicios educativos (Configuración → Documentos → Plantillas de contrato y ficha). */
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

/** Pago aplicado a una cuota (el pago completo, con sus partes y su comprobante, está en `Payment`). */
export interface InstallmentPayment {
  id: string;
  /** Pago global del que viene este cobro: permite reversarlo y reponer exactamente esta cuota. */
  paymentId?: string;
  /** Fecha del cobro (AAAA-MM-DD). */
  date: string;
  amount: number;
  receipt: string;
}

/** Cuota u obligación de un plan. La fecha de vencimiento se guarda solo en ISO (el texto se arma al mostrar). */
export interface Installment {
  id: string;
  name: string;
  amount: number;
  balance: number;
  /** Vencimiento (AAAA-MM-DD). */
  dueDateISO: string;
  /** Se guarda al registrar cada cobro, pero lo que se muestra es el estado calculado a hoy (`installmentState`): «Vencida» nunca se guarda. */
  status: InstallmentStatus;
  payments: InstallmentPayment[];
  /** Contado en 2 partes: el monto de la parte se define al cobrar. */
  variable?: boolean;
  /** Mora cobrada como cuota aparte y la cuota que la originó. */
  isMora?: boolean;
  moraOf?: string;
  moraCharged?: number;
  /** Refinanciación: cuota de origen y cuota nueva. */
  refinancedFrom?: string;
  refinancedTo?: string;
  /** Reactivación de una matrícula caída: vencimiento anterior (AAAA-MM-DD). */
  reactivatedFrom?: string;
  /** Cuota futura anulada por la caída de la matrícula (se restituye si se reactiva). */
  dropAnnulled?: boolean;
  /** Deuda vencida condonada al aprobar la caída (no se restituye). */
  forgiven?: boolean;
  note?: string;
  createdAt?: string;
}

/**
 * Plan de pagos de una matrícula. El titular no se guarda (sale de la matrícula, `holderNameOfPlan`) ni la próxima cuota (sale
 * de las cuotas abiertas). `balance` y `status` son un resumen guardado que solo escribe `recomputePlan`.
 */
export interface Plan {
  id: string;
  /** Matrícula a la que pertenece. */
  mat: string;
  type: string;
  total: number;
  balance: number;
  status: PlanStatus;
  installments: Installment[];
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
  /** Fecha del pago (AAAA-MM-DD). */
  date: string;
  /** Constancia: nombre del alumno el día del pago. NO se reescribe si luego cambia (un comprobante no cambia). */
  student: string;
  concept: string;
  amount: number;
  method: string;
  receipt: string;
  status: PaymentStatus;
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
  /** Ubicación de stock: el almacén central (`ALM-NNN`) o una sede (su código). */
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
  /** Quién la solicitó (a esa persona le llega el aviso de aprobación o rechazo). */
  requestedBy?: string;
  requestedById?: string;
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
  /** Qué pasó (`EVENTS` del registro de funciones) y dónde: de ahí se calcula quién lo recibe. Sin evento = aviso general para todos. */
  eventId?: string;
  scope?: NoticeScope;
  /** Quiénes ya lo leyeron (cada usuario lo marca por su cuenta). */
  readBy?: string[];
}

/** Un aviso tal como lo ve un usuario: con su marca de leído y si le llega por respaldo. */
export type NoticeView = Notification & { read: boolean; viaFallback: boolean };

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
  studentId: string; // Alumno al que pertenece la reserva (por id; `student` es solo una copia del nombre)
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
  /** Fecha de nacimiento (AAAA-MM-DD): de aquí sale la edad. */
  birthDate: string;
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
  /** Cargo o puesto pactado (el que se ve en Personal y en los reportes: no se escribe en las asignaciones). */
  position?: string;
  startDate: string;
  endDate?: string;
  status: ContractStatus;
  shift?: string;
  pensionSystem?: string;
  pensionFund?: string;
  grossSalary?: number;
  /** Aporte a pensiones de un mes regular. */
  contribution?: number;
  /** Renta de 5.ª categoría (dependientes) o 4.ª (locación) de un mes regular. */
  incomeTax?: number;
  /** Asignación familiar que se suma al sueldo (según los hijos declarados del trabajador). */
  familyAllowance?: number;
  /** Neto de un mes regular (el de cada mes sale de la planilla). */
  netSalary?: number;
  /** Locación de servicios: el prestador presentó la suspensión de retenciones de 4.ª categoría. */
  suspension4ta?: boolean;
  vacationStart?: string;
  vacationEnd?: string;
  terminationReason?: string;
  /** Contrato que este renueva (el anterior queda «Renovado»; a cuál dio paso se deduce, no se guarda). */
  renewsId?: string;
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

/** Ingreso o descuento eventual de una planilla (bono, comisión, adelanto…). */
export interface PayrollAdjustment {
  id: string;
  staffId: string;
  kind: 'Ingreso' | 'Descuento';
  concept: string;
  amount: number;
  /** Ingreso afecto a aportes de pensión y renta (un bono sí; una movilidad inafecta no). */
  taxable: boolean;
  reason: string;
  by: string;
  at: string;
}

/** Línea de un trabajador en una planilla: una foto del contrato y de lo calculado. */
export interface PayrollLine {
  staffId: string;
  staffName: string;
  docType: string;
  docNumber: string;
  contractId: string;
  contractType: string;
  branch: string;
  role: string;
  pensionSystem?: string;
  pensionFund?: string;
  grossSalary: number;
  calc: LineCalc;
  adjustments: PayrollAdjustment[];
  warnings: string[];
}

export interface PayrollEvent {
  at: string;
  by: string;
  action: 'Generada' | 'Ajuste' | 'Cerrada' | 'Reabierta';
  detail?: string;
}

/** Planilla de un mes (informativa: el sistema no registra pagos al personal). Borrador = se recalcula con los contratos; Cerrada guarda la foto de las líneas. */
export interface PayrollRun {
  id: string;
  /** AAAA-MM. */
  period: string;
  status: 'Borrador' | 'Cerrada';
  adjustments: PayrollAdjustment[];
  lines?: PayrollLine[];
  createdAt: string;
  createdBy: string;
  closedAt?: string;
  closedBy?: string;
  events: PayrollEvent[];
}

export interface Assignment {
  id: string;
  staffId: string;
  /** Nombre del lugar de trabajo (una sede o el almacén central). */
  branch: string;
  /** Id del lugar y su tipo (asignaciones guardadas en la base; los datos de ejemplo solo traen el nombre). */
  placeId?: string;
  placeKind?: 'sede' | 'almacen';
  area: string;
  /** La persona necesita acceso al sistema en este lugar de trabajo (de las asignaciones con acceso salen las sedes y el almacén de su cuenta). */
  hasAccess: boolean;
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
  status: 'Activo' | 'Inactivo';
  /** Plantilla de partida (`utils/roleTemplates.ts`): solo es el punto de partida, el rol se edita libremente. */
  templateId?: string;
  observations?: string;
  /** Cuentas activas que admite el rol por sede (sin valor = sin límite). */
  branchUserLimit?: number;
  /** Rol del sistema (Superusuario): no se edita, desactiva ni elimina. */
  locked?: boolean;
  /** Combinaciones a separar que se aceptaron al guardar las funciones, con su motivo, quién y cuándo. */
  acceptedRisks?: AcceptedRisk[];
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
  /** Almacenes (ids `ALM-NNN`) en los que trabaja la cuenta, p. ej. el rol Almacén central. Sin sede ni almacén, la cuenta no ve datos de ninguno. */
  warehouses?: string[];
  /** Ficha de personal a la que pertenece la cuenta (nombre, documento, teléfono y sedes salen de ella). */
  staffId?: string;
  /** Por qué y cuándo se desactivó la cuenta (p. ej. el trabajador se inactivó). */
  statusNote?: string;
}

export interface Permission {
  roleId: string;
  permissions: string[];
}

export interface Branch {
  id: string; // Código
  name: string; // Nombre de filial
  company: string; // Empresa (nombre; en las filiales de la base se calcula a partir de `companyId`)
  /** Id de la empresa (filiales guardadas en la base de datos). */
  companyId?: string;
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

/**
 * Almacén central: aparte de las sedes (no tiene alumnos ni vende). Recibe compras, despacha a las sedes y recibe devoluciones; su stock
 * es propio y nunca se mezcla con el de venta de una sede (ni siquiera el de la sede donde está físicamente).
 */
export interface Warehouse {
  id: string; // ALM-NNN
  name: string;
  /** Empresa a la que pertenece (nombre; en los almacenes de la base se calcula a partir de `companyId`); puede quedar vacía hasta definirla. */
  company?: string;
  /** Id de la empresa (almacenes guardados en la base de datos). */
  companyId?: string;
  status: 'Activo' | 'Inactivo';
  address?: string;
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

export interface NewRoleInput {
  name: string;
  desc?: string;
  status?: Role['status'];
  templateId?: string;
  observations?: string;
  branchUserLimit?: number;
  permissions?: string[];
  reasons?: Record<string, string>;
}

export type RolePatch = Partial<Pick<Role, 'name' | 'desc' | 'status' | 'observations' | 'branchUserLimit' | 'templateId'>>;

export interface ItemSaleInput {
  branchId: string;
  itemId: string;
  qty: number;
  currency: 'PEN' | 'USD';
  exchangeRate?: number;
  method: string;
  customerName: string;
  receiptType: string;
  receiptNumber: string;
}

interface DataContextType {
  guardians: Guardian[];
  students: Student[];
  enrollments: Enrollment[];
  plans: Plan[];
  payments: Payment[];
  items: Item[];
  /** Crea artículos (uno o una carga masiva); un artículo que se vende nace con su precio general (`prices`). Todo o nada. */
  addItems: (items: Item[], prices?: { itemId: string; amount: number }[]) => StockResult;
  /** Edita un artículo (también activarlo o desactivarlo). */
  updateItem: (id: string, item: Item) => StockResult;
  stockItems: StockItem[];
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
  couriers: Courier[];
  addCourier: (courier: Omit<Courier, 'id'>) => StockResult;
  updateCourier: (id: string, courier: Partial<Omit<Courier, 'id'>>) => StockResult;
  shippingMethods: ShippingMethod[];
  addShippingMethod: (method: Omit<ShippingMethod, 'id'>) => StockResult;
  updateShippingMethod: (id: string, method: Partial<Omit<ShippingMethod, 'id'>>) => StockResult;
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
  /** Personal de ejemplo (en memoria): lo siguen usando contratos, planilla, agenda y matrículas. Personas → Personal y Asignaciones usan `orgStaff` y `orgAssignments`. */
  staff: Staff[];
  /** Personal y asignaciones guardados en la base de datos (Personas → Personal y Asignaciones; de ahí salen las cuentas de usuario). */
  orgStaff: Staff[];
  orgAssignments: Assignment[];
  /** Sedes y almacén como lugares de trabajo (para las asignaciones). */
  orgPlaces: Place[];
  staffDirectory: { status: StaffDirectoryStatus; error: string };
  reloadStaffDirectory: () => Promise<void>;
  contracts: Contract[];
  addContract: (contract: Omit<Contract, 'id'>) => Contract;
  updateContract: (id: string, data: Partial<Omit<Contract, 'id'>>) => void;
  assignments: Assignment[];
  /** Crea (o edita, con `editingId`) una asignación. La nueva principal desplaza a la anterior. */
  saveAssignment: (form: AssignmentForm, editingId?: string) => Promise<StockResult>;
  /** Cierra una asignación con fecha y motivo (no se borra). */
  closeAssignment: (id: string, date: string, reason: string) => Promise<StockResult>;
  /** Edita un contrato vigente con motivo; queda la constancia de lo que cambió. */
  editContract: (id: string, form: ContractForm, reason: string) => StockResult;
  /** Da de baja a un trabajador (cierra sus asignaciones). Exige contrato cerrado y sin asesorías futuras. */
  inactivateStaff: (id: string, input: { reason: string; detail: string; date: string }) => Promise<StockResult>;
  reactivateStaff: (id: string, detail: string) => Promise<StockResult>;
  roles: Role[];
  /** Crea el rol; con `permissions` lo deja armado en una sola operación (todo o nada). `reasons` son los motivos de las combinaciones a separar. */
  addRole: (input: NewRoleInput) => Promise<OpResult & { id?: string }>;
  updateRole: (id: string, roleData: RolePatch) => Promise<OpResult>;
  deleteRole: (id: string) => Promise<OpResult>;
  users: User[];
  /** Invita (crea) una cuenta: la guarda el servidor y manda la invitación por correo; la persona fija su contraseña desde el enlace. */
  addUser: (form: AccountForm) => Promise<OpResult & { id?: string }>;
  /** Cambia datos, rol, sedes, almacenes o estado de una cuenta (al servidor solo llega lo que cambia). El correo no se cambia. */
  updateUser: (id: string, changes: Partial<AccountForm>) => Promise<OpResult>;
  /** Reenvía la invitación (si la persona nunca entró) o el enlace para fijar la contraseña. */
  resendAccess: (id: string) => Promise<OpResult>;
  payrollRuns: PayrollRun[];
  /** Líneas de una planilla: la foto si ya se cerró; en borrador, se recalculan con los contratos. */
  payrollLinesOf: (run: PayrollRun) => BuiltPayroll;
  generatePayroll: (period: string) => StockResult;
  deletePayrollDraft: (runId: string) => StockResult;
  addPayrollAdjustment: (runId: string, input: { staffId: string; kind: 'Ingreso' | 'Descuento'; concept: string; amount: number; taxable: boolean; reason: string }) => StockResult;
  removePayrollAdjustment: (runId: string, adjustmentId: string) => StockResult;
  closePayroll: (runId: string) => StockResult;
  reopenPayroll: (runId: string, reason: string) => StockResult;
  /** Cierra un contrato vigente (cese); no se permite si una planilla ya cerrada lo pagó en esas fechas. */
  closeContract: (id: string, date: string, reason: string) => StockResult;
  /** Renueva un contrato con fecha de fin: el anterior queda «Renovado» y nace uno nuevo desde el día siguiente a su fin (con motivo). */
  renewContract: (id: string, input: RenewalInput) => StockResult;
  permissions: Permission[];
  savePermissions: (roleId: string, newPermissions: string[], reasons?: Record<string, string>) => Promise<OpResult>;
  /** Empresas de ejemplo (en memoria): las siguen usando las pantallas que aún no pasaron a la base. Organización → Empresas usa `orgCompanies`. */
  companies: Company[];
  /** Empresas y filiales guardadas en la base de datos (Organización → Empresas y Filiales). */
  orgCompanies: Company[];
  orgBranches: Branch[];
  orgWarehouses: Warehouse[];
  orgDirectory: { status: OrgDirectoryStatus; error: string };
  reloadOrgDirectory: () => Promise<void>;
  addCompany: (company: Omit<Company, 'id'>) => Promise<OpResult<Company> & { id?: string }>;
  updateCompany: (id: string, companyData: Partial<Company>) => Promise<OpResult<Company>>;
  deleteCompany: (id: string) => Promise<OpResult>;
  branches: Branch[];
  warehouses: Warehouse[];
  /** El almacén y las sedes como ubicaciones de stock (para nombres y selectores de Logística). */
  stockLocations: StockLocation[];
  leadSources: LeadSource[];
  programs: Program[];
  levels: Level[];
  paymentTypes: PaymentType[];
  tariffs: Tariff[];
  promotions: Promotion[];
  recipes: Recipe[];
  /** Crea (id vacío) o edita una receta; valida los datos y que no se solape con otra activa. Los errores vienen separados por saltos de línea. */
  saveRecipe: (recipe: Recipe) => StockResult & { id?: string };
  /** La copia nace inactiva (si no, chocaría con la original). */
  duplicateRecipe: (id: string) => StockResult & { id?: string };
  setRecipeStatus: (id: string, status: Recipe['status']) => StockResult;
  unpackPackage: (stockId: string) => StockResult;
  packPackage: (stockId: string) => StockResult;
  /** Vende un artículo en caja: descuenta el stock de la sede y registra el ingreso en una sola operación. */
  registerItemSale: (input: ItemSaleInput) => StockResult;
  /** Ingreso de stock (compra o reposición) con el documento que lo respalda; queda en el kardex. */
  registerStockEntry: (input: { branchId: string; itemId: string; qty: number; doc: string; reason?: string }) => StockResult;
  updateMinStock: (stockId: string, minStock: number) => void;
  updateTransferStatus: (id: string, status: Transfer['status']) => StockResult;
  updateTransfer: (id: string, transfer: Partial<Transfer>) => StockResult;
  addTransfer: (transfer: Omit<Transfer, 'id'>) => StockResult;
  /** El id `STF-NNN` y el código los asigna el sistema. */
  addStaff: (staff: Omit<Staff, 'id' | 'code'>) => Promise<OpResult<Staff>>;
  updateStaff: (id: string, staff: Partial<Staff>) => Promise<OpResult<Staff>>;
  /** Crea el alumno (correlativo ALU-000) y suma uno al contador de alumnos de sus titulares. */
  addStudent: (student: Omit<Student, 'id'>) => Student;
  updateStudent: (id: string, student: Partial<Student>) => void;
  deleteStudent: (id: string) => StockResult;
  addGuardian: (guardian: Omit<Guardian, 'id'>) => Guardian;
  updateGuardian: (id: string, guardian: Partial<Guardian>) => void;
  deleteGuardian: (id: string) => StockResult;
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
  /** ¿Se ofrece la función? Depende de sus contrapartes (p. ej. despachar un envío exige quien lo reciba en la sede destino). */
  availabilityOf: (capabilityId: string, target?: { branchId: string; branchName: string }) => Availability;
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
  }, deductions?: { itemId: string; quantity: number }[]) => StockResult;
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
  addBranch: (branch: Omit<Branch, 'id'>) => Promise<OpResult<Branch> & { id?: string }>;
  updateBranch: (id: string, branch: Partial<Branch>) => Promise<OpResult<Branch>>;
  deleteBranch: (id: string) => Promise<OpResult>;
  addWarehouse: (warehouse: Omit<Warehouse, 'id'>) => Promise<OpResult<Warehouse> & { id?: string }>;
  updateWarehouse: (id: string, warehouse: Partial<Omit<Warehouse, 'id'>>) => Promise<OpResult<Warehouse>>;
  isEnrollmentWizardOpen: boolean;
  setIsEnrollmentWizardOpen: (isOpen: boolean) => void;
  shipments: Shipment[];
  addShipment: (shipment: Omit<Shipment, 'id'>) => StockResult & { id?: string };
  updateShipmentStatus: (id: string, status: Shipment['status'], observation?: string) => StockResult;
  updateShipment: (id: string, shipment: Partial<Shipment>) => StockResult;
  deleteShipment: (id: string) => void;
  notifications: Notification[];
  /** Los avisos que le corresponden al usuario actual (según las funciones de su rol y su sede), con la marca de leído. */
  myNotifications: NoticeView[];
  /** Alertas por regla (cuotas vencidas, materiales pendientes, contratos por vencer, stock bajo el mínimo) que le corresponden al usuario actual. */
  myAlerts: SystemAlert[];
  markNotificationAsRead: (id: string) => void;
  incidents: ReceptionIncident[];
  /** Sede que se ve: `'all'` (vista global) solo para quien alcanza todas; el resto, una de las suyas. Sale de la cuenta con la que se trabaja. */
  currentBranchId: string;
  /** Cambia la sede que se ve, solo entre las que alcanza la cuenta. */
  selectBranch: (id: string) => StockResult;
  /** Las sedes que alcanza la cuenta con la que se trabaja. */
  sessionScope: SessionScope;
  currentUser: { id: string; name: string; role: string; branchId: string | 'all' };
  confirmReception: (data: {
    docId: string;
    docType: 'Envío' | 'Transferencia';
    receivedItems: { itemId: string; quantity: number; status: 'ok' | 'missing' | 'damaged' | 'extra'; observation?: string }[];
    generalObservation?: string;
  }) => StockResult;
}

export const DataContext = createContext<DataContextType | undefined>(undefined);

/** Semilla de personas, matrículas, planes, pagos y caja (se arma una vez al abrir la página, con fechas relativas a hoy). */
const PEOPLE_SEED = buildPeopleSeed(todayLocalISO());

/** `access` = los roles, funciones y cuentas leídos de la base antes de montar el sistema (`AccessGate`); `accountId` = la cuenta con la que se ingresó. */
export function DataProvider({ children, access, accountId }: { children: ReactNode; access: AccessData; accountId: string }) {
  const allocId = useRef(createIdAllocator()).current;
  // Datos de ejemplo de personas, matrículas, planes, pagos y caja: `data/seedPeople.ts` (fechas relativas a hoy, armados con las reglas reales)
  const [guardians, setGuardians] = useState<Guardian[]>(() => structuredClone(PEOPLE_SEED.guardians));
  const [students, setStudents] = useState<Student[]>(() => structuredClone(PEOPLE_SEED.students));
  const [enrollments, setEnrollments] = useState<Enrollment[]>(() => structuredClone(PEOPLE_SEED.enrollments));
  const [plans, setPlans] = useState<Plan[]>(() => structuredClone(PEOPLE_SEED.plans));
  const [payments, setPayments] = useState<Payment[]>(() => structuredClone(PEOPLE_SEED.payments));

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

  const [cashMovements, setCashMovements] = useState<CashMovement[]>(() => structuredClone(PEOPLE_SEED.cashMovements));
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

  const addCashMovement = (m: Omit<CashMovement, 'id' | 'date' | 'user' | 'status'> & { date?: string }): CashMovement => {
    const created: CashMovement = {
      ...m,
      id: allocId('CJ', cashMovements.map(x => x.id)),
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
    // Almacén central (aparte de las sedes): de aquí salen los envíos a todas las filiales
    { id: 'STK-011', itemId: 'ITM-LIB-K1', branchId: 'ALM-001', stock: 400, minStock: 100 },
    { id: 'STK-012', itemId: 'ITM-MAT-01', branchId: 'ALM-001', stock: 250, minStock: 60 },
    { id: 'STK-013', itemId: 'ITM-KIT-BIENV', branchId: 'ALM-001', stock: 80, minStock: 20 },
    { id: 'STK-014', itemId: 'ITM-HER-01', branchId: 'ALM-001', stock: 150, minStock: 30 },
    { id: 'STK-015', itemId: 'ITM-HER-02', branchId: 'ALM-001', stock: 150, minStock: 30 },
    // Los Olivos es una sede como las demás: stock de venta propio
    { id: 'STK-016', itemId: 'ITM-LIB-K1', branchId: 'FIL-LOL', stock: 60, minStock: 30 },
    { id: 'STK-017', itemId: 'ITM-MAT-01', branchId: 'FIL-LOL', stock: 40, minStock: 20 },
    { id: 'STK-018', itemId: 'ITM-KIT-BIENV', branchId: 'FIL-LOL', stock: 12, minStock: 5 },
    { id: 'STK-019', itemId: 'ITM-HER-01', branchId: 'FIL-LOL', stock: 25, minStock: 10 },
    { id: 'STK-020', itemId: 'ITM-HER-02', branchId: 'FIL-LOL', stock: 25, minStock: 5 },
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
      originId: 'ALM-001', 
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
      destinationId: 'ALM-001', 
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
      originId: 'ALM-001', 
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
      originId: 'ALM-001', // Almacén central
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

  // Reservas de ejemplo con fechas relativas a hoy (siempre en días con atención y en horarios permitidos): `data/seedPeople.ts`
  // Diego Torres: su primera asesoría fue hace casi 3 meses, así que su duración base está por vencer (ejemplo de la alerta)
  const expiringStart = PEOPLE_SEED.expiringStart;
  const [schedules, setSchedules] = useState<Schedule[]>(() => buildScheduleSeed(PEOPLE_SEED));

  // Historial de Psicopedagogía: cada cambio de la agenda deja un evento
  const [psyEvents, setPsyEvents] = useState<PsyEvent[]>([
    { id: 'EVT-0001', at: new Date(Date.now() - 86400000).toISOString(), by: 'Superadmin', subject: 'asesoria', refId: 'SES-003', studentId: 'ALU-003', type: 'Cancelada', initiator: 'Alumno o titular', reason: 'Enfermedad del alumno', detail: 'Avisó la mañana anterior.', from: { date: seedDay(1), time: '16:00', responsible: 'Lic. María Torres' } },
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
    const created: Schedule = { ...data, id: allocId('SES', schedules.map(x => x.id)) };
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
    // El responsable de una asesoría que se mueve o se reasigna debe trabajar ese día (no de vacaciones ni cesado)
    if (moved) {
      const away = sessionResponsibleUnavailable(next.responsible, next.date, staff, contracts);
      if (away) return { ok: false, reason: away };
    }
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

  const [trackings, setTrackings] = useState<Tracking[]>(() => buildTrackingSeed(PEOPLE_SEED));

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
    const problems = validateResponsible(a, staffId, { schedules, activities: allActivities(monthlySchedules), staff, assignments, branches, unavailable: (sid, date) => unavailableOn(sid, date, contracts) });
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
  const [dropRequests, setDropRequests] = useState<DropRequest[]>(() => structuredClone(PEOPLE_SEED.dropRequests));
  const [enrollmentChanges, setEnrollmentChanges] = useState<EnrollmentChange[]>([]);

  const [isEnrollmentWizardOpen, setIsEnrollmentWizardOpen] = useState(false);

  const [incidents, setIncidents] = useState<ReceptionIncident[]>([]);

  const [notifications, setNotifications] = useState<Notification[]>([
    { id: 'NOT-001', title: 'Bienvenido', message: 'Bienvenido al sistema ENSIL', type: 'info', date: new Date().toISOString(), readBy: [] }
  ]);

  /** Emite un aviso: guarda qué pasó y dónde; quién lo recibe se calcula al mostrar (`utils/notifications.ts`). */
  const notify = (eventId: string, n: { title: string; message: string; type: Notification['type']; scope?: NoticeScope }) => {
    setNotifications(prev => [
      { id: allocId('NOT', prev.map(x => x.id)), title: n.title, message: n.message, type: n.type, date: new Date().toISOString(), eventId, scope: n.scope, readBy: [] },
      ...prev,
    ]);
  };

  const markNotificationAsRead = (id: string) => {
    setNotifications(prev => markRead(prev, id, currentUser.id));
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

    if (!doc) return { ok: false, error: 'No se encontró el documento a recepcionar.' };
    // Recibir en el almacén (devoluciones) mueve su stock: solo lo confirma quien trabaja en él
    const deniedReception = warehouseProblem(doc.destinationId);
    if (deniedReception) return { ok: false, error: deniedReception };

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
          id: allocId('INC', incidents.map(x => x.id)),
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
    notify(hasDifferences ? 'reception_with_differences' : docType === 'Envío' ? 'shipment_received' : 'transfer_received', {
      title: hasDifferences ? 'Recepción con diferencias' : 'Recepción confirmada',
      message: `El ${docType} ${docId} ha sido recibido en ${locationName(doc?.destinationId)}. Estado: ${finalStatus}`,
      type: hasDifferences ? 'warning' : 'success',
      scope: { originBranchId: doc.originId, destinationBranchId: doc.destinationId, subjectBranchId: doc.destinationId },
    });
    return { ok: true };
  };

  const [staff, setStaff] = useState<Staff[]>(() => seedStaff());

  const [contracts, setContracts] = useState<Contract[]>(() => seedContracts());

  const [payrollRuns, setPayrollRuns] = useState<PayrollRun[]>([]);

  const [assignments, setAssignments] = useState<Assignment[]>(() => seedAssignments());

  const [companies] = useState<Company[]>([
    { id: '1', ruc: '20123456789', name: 'Educación y Cultura S.A.C.', commercialName: 'ENSIL Central', status: 'Activo' },
    { id: '2', ruc: '20987654321', name: 'Instituto de Idiomas del Norte S.A.', commercialName: 'ENSIL Norte', status: 'Activo' },
  ]);

  const [branches] = useState<Branch[]>(() => seedBranches());
  // Empresas y Filiales de Organización viven en la base de datos; las de ejemplo de arriba siguen alimentando el resto del sistema.
  const org = useOrgDirectory();

  const [warehouses] = useState<Warehouse[]>(() => seedWarehouses());
  const locations = useMemo(() => stockLocations(branches, warehouses), [branches, warehouses]);
  /** Nombre de una ubicación de stock (almacén o sede); si ya no existe, su id. */
  const locationName = (id: string | undefined): string => locations.find(l => l.id === id)?.name ?? id ?? '';

  // Los roles, sus funciones y las cuentas llegan de la base (`access`): el navegador ya no guarda nada de esto.
  const [roles, setRoles] = useState<Role[]>(() => access.roles);

  const [users, setUsers] = useState<User[]>(() => access.users);

  const [permissions, setPermissions] = useState<Permission[]>(() => access.permissions);

  const accountsRepo = useMemo(() => createSupabaseAccountsRepository(supabase), []);
  /** Vuelve a leer las cuentas de la base (después de cada cambio: se muestra lo que de verdad quedó guardado). */
  const resyncUsers = async () => {
    const fresh = await loadUsers(accountsRepo, roles);
    if (fresh.ok && fresh.value) setUsers(fresh.value);
  };
  // Personal y Asignaciones viven en la base: cargan cuando ya están las sedes y el almacén (el lugar de una asignación sale de ellos).
  const places = useMemo(() => placesOf(org.branches, org.warehouses), [org.branches, org.warehouses]);
  const staffDir = useStaffDirectory(places, org.status === 'ready', resyncUsers);
  const rolesRepo = useMemo(() => createSupabaseRolesRepository(supabase), []);
  /** Vuelve a leer los roles de la base (después de un cambio que quedó a medias, para mostrar lo que de verdad quedó). */
  const resyncRoles = async () => {
    const fresh = await loadAccessRoles(rolesRepo);
    if (fresh.ok && fresh.value) { setRoles(fresh.value.roles); setPermissions(fresh.value.permissions); }
  };

  // Sesión (paso 7): quién trabaja sale de las cuentas; la sede que ve, de lo que alcanza esa cuenta.
  const scopeFor = (account: User | null): SessionScope =>
    account ? scopeOfUser(account, branches, canDo({ user: account, roles, permissions }, PERM.allBranches), warehouses) : NO_SCOPE;
  /** La cuenta con la que se ingresó: no cambia durante la sesión (cambiar de persona es cerrar sesión e ingresar con otra cuenta). */
  const activeUserId: string = accountId;
  const sessionAccount = activeAccount(users, activeUserId);
  const sessionScope = useMemo(() => scopeFor(sessionAccount), [sessionAccount, branches, warehouses, roles, permissions]);
  const [viewBranchId, setViewBranchId] = useState<string>(() => {
    const account = activeAccount(access.users, activeUserId);
    return account ? defaultViewBranch(scopeFor(account), account, branches) : NO_BRANCH;
  });
  const currentBranchId = sessionAccount ? validView(sessionScope, viewBranchId, sessionAccount, branches) : NO_BRANCH;
  const currentUser = useMemo(
    () => (sessionAccount
      ? { id: sessionAccount.id, name: sessionAccount.name, role: sessionAccount.role, branchId: sessionScope.allBranches ? 'all' : defaultViewBranch(sessionScope, sessionAccount, branches) }
      : { id: '', name: 'Sin sesión', role: '', branchId: NO_BRANCH }),
    [sessionAccount, sessionScope, branches]
  );

  const [leadSources, setLeadSources] = useState<LeadSource[]>([
    { id: '1', name: 'Facebook Ads', status: 'active' },
    { id: '2', name: 'Orgánico', status: 'active' },
    { id: '3', name: 'Referido', status: 'active' },
    { id: '4', name: 'Instagram', status: 'active' },
    { id: '5', name: 'WhatsApp', status: 'active' },
  ]);

  const [programs, setPrograms] = useState<Program[]>(() => seedPrograms());

  const [levels, setLevels] = useState<Level[]>(() => seedLevels());

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
      id: nextNumericId(leadSources.map(x => x.id)),
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

  const updateEnrollmentVerification: DataContextType['updateEnrollmentVerification'] = (enrollmentId, data, deductions = []) => {
    if (!can(PERM.deliverMaterials)) return { ok: false, error: 'Su rol no puede registrar la entrega de materiales.' };
    const enrollment = enrollments.find(e => e.id === enrollmentId);
    if (!enrollment) return { ok: false, error: 'No se encontró la matrícula.' };
    // Todo o nada: primero se comprueba el stock de TODAS las líneas, después se descuenta
    const moves = deductions.map(d => ({ branchId: enrollment.branchId || '', itemId: d.itemId, qty: -d.quantity }));
    const shortage = stockMovesError(stockRef.current, moves, id => items.find(i => i.id === id)?.name ?? id);
    if (shortage) return { ok: false, error: shortage };
    moves.forEach(m => updateStock(m.branchId, m.itemId, m.qty, 'Entrega por Verificación', `Entrega a alumno ${enrollment.student} (Matrícula: ${enrollment.id})`, enrollment.id));
    setEnrollments(prev => prev.map(e => (e.id === enrollmentId
      ? { ...e, verificationStatus: data.status, verifiedItems: data.items, verificationObservation: data.observation, verificationDate: data.date, verifier: data.verifier }
      : e)));
    return { ok: true };
  };

  // Último estado del inventario: permite encadenar movimientos en un mismo evento y evita efectos secundarios
  // dentro de actualizadores de estado (con StrictMode duplicaban las líneas de kardex).
  const stockRef = useRef<StockItem[]>(stockItems);
  stockRef.current = stockItems;

  /**
   * Mover stock del almacén pide estar asignado a él (o ser Superusuario): alcanzar todas las sedes permite VER el almacén, no despachar
   * ni ajustar su stock. En una sede rige el alcance de siempre.
   */
  const warehouseProblem = (...locationIds: string[]): string | null => {
    for (const id of locationIds) {
      if (isWarehouseId(id)) { const p = warehouseOperationError(sessionScope, id); if (p) return p; }
    }
    return null;
  };

  /** Primer artículo sin saldo suficiente en la sede, o `null` si hay para todos. */
  const findInsufficientStock = (branchId: string, lines: { itemId: string; quantity: number }[]): string | null => {
    const needed = new Map<string, number>();
    lines.forEach(l => needed.set(l.itemId, (needed.get(l.itemId) ?? 0) + l.quantity));
    for (const [itemId, qty] of needed) {
      const have = stockRef.current.find(x => x.branchId === branchId && x.itemId === itemId)?.stock ?? 0;
      if (have < qty) {
        const name = items.find(i => i.id === itemId)?.name || itemId;
        return `Stock insuficiente de "${name}" en ${locationName(branchId)}: disponible ${have}, requerido ${qty}.`;
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
      : [...list, { id: allocId('STK', list.map(x => x.id)), itemId, branchId, stock: newBalance, minStock: 0 }];

    const entry: KardexEntry = {
      id: allocId('KDX', kardex.map(k => k.id)),
      date: new Date().toISOString().replace('T', ' ').slice(0, 16),
      branch: locationName(branchId),
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
      id: allocId('PRC', itemPrices.map(p => p.id)),
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

  const addItems = (newItems: Item[], prices: { itemId: string; amount: number }[] = []): StockResult => {
    if (newItems.length === 0) return { ok: false, error: 'No hay artículos para guardar.' };
    const accepted: Item[] = [];
    for (const item of newItems) {
      const problem = validateItem({ item, allItems: [...items, ...accepted] });
      if (problem) return { ok: false, error: newItems.length > 1 ? `${item.id || 'Artículo'}: ${problem}` : problem };
      accepted.push(item);
    }
    const badPrice = prices.find(p => !(p.amount > 0) || !accepted.some(i => i.id === p.itemId));
    if (badPrice) return { ok: false, error: 'Indique el precio general de venta (USD) para un artículo que se vende.' };
    setItems(prev => [...prev, ...accepted]);
    prices.forEach(p => addItemPrice({ itemId: p.itemId, branchId: 'all', amount: p.amount, validFrom: todayLocalISO() }));
    return { ok: true };
  };

  const updateItem = (id: string, item: Item): StockResult => {
    if (!items.some(i => i.id === id)) return { ok: false, error: 'No se encontró el artículo.' };
    const problem = validateItem({ item, allItems: items, editingId: id });
    if (problem) return { ok: false, error: problem };
    setItems(prev => prev.map(i => (i.id === id ? item : i)));
    return { ok: true };
  };

  const addCourier = (courier: Omit<Courier, 'id'>): StockResult => {
    if (!courier.code?.trim() || !courier.name?.trim()) return { ok: false, error: 'El código y nombre son obligatorios.' };
    if (couriers.some(c => c.code.trim().toLowerCase() === courier.code.trim().toLowerCase())) return { ok: false, error: 'Ya existe un courier con ese código.' };
    setCouriers(prev => [...prev, { ...courier, id: nextSequentialId('COUR', prev.map(x => x.id)) }]);
    return { ok: true };
  };

  const updateCourier = (id: string, courier: Partial<Omit<Courier, 'id'>>): StockResult => {
    const current = couriers.find(c => c.id === id);
    if (!current) return { ok: false, error: 'No se encontró el courier.' };
    const next = { ...current, ...courier };
    if (!next.code?.trim() || !next.name?.trim()) return { ok: false, error: 'El código y nombre son obligatorios.' };
    if (couriers.some(c => c.id !== id && c.code.trim().toLowerCase() === next.code.trim().toLowerCase())) return { ok: false, error: 'Ya existe un courier con ese código.' };
    setCouriers(prev => prev.map(c => (c.id === id ? next : c)));
    return { ok: true };
  };

  const addShippingMethod = (method: Omit<ShippingMethod, 'id'>): StockResult => {
    if (!method.name?.trim()) return { ok: false, error: 'El nombre del método es obligatorio.' };
    setShippingMethods(prev => [...prev, { ...method, id: nextSequentialId('SM', prev.map(x => x.id)) }]);
    return { ok: true };
  };

  const updateShippingMethod = (id: string, method: Partial<Omit<ShippingMethod, 'id'>>): StockResult => {
    const current = shippingMethods.find(m => m.id === id);
    if (!current) return { ok: false, error: 'No se encontró el método de envío.' };
    const next = { ...current, ...method };
    if (!next.name?.trim()) return { ok: false, error: 'El nombre del método es obligatorio.' };
    setShippingMethods(prev => prev.map(m => (m.id === id ? next : m)));
    return { ok: true };
  };

  /** Venta de un artículo en caja: todo o nada (stock + ingreso), con el precio vigente de la sede y el cierre de caja respetado. */
  const registerItemSale = (input: ItemSaleInput): StockResult => {
    if (!can(PERM.itemSale)) return { ok: false, error: 'Su rol no puede vender artículos en caja.' };
    if (!input.branchId || !input.itemId) return { ok: false, error: 'Por favor complete todos los campos obligatorios.' };
    const notSold = locationSaleError(input.branchId);
    if (notSold) return { ok: false, error: notSold };
    const item = items.find(i => i.id === input.itemId);
    if (!item || !item.isSold || item.status !== 'Activo') return { ok: false, error: 'El artículo no está habilitado para la venta.' };
    const unitPrice = getCurrentPrice(itemPrices, input.itemId, input.branchId)?.amount ?? 0;
    if (!(unitPrice > 0)) return { ok: false, error: 'El artículo no tiene un precio de venta vigente. Configúrelo en Logística → Catálogo de artículos.' };
    const invalid = itemSaleError({ qty: input.qty, available: availableStock(stockRef.current, input.branchId, input.itemId), currency: input.currency, exchangeRate: input.exchangeRate });
    if (invalid) return { ok: false, error: invalid };
    const closed = closedMessage(cashClosures, 'caja', input.currency, todayLocalISO());
    if (closed) return { ok: false, error: closed };
    const totalUsd = Math.round(unitPrice * input.qty * 100) / 100;
    const out = updateStock(input.branchId, input.itemId, -input.qty, 'Venta', `Venta directa en caja a ${input.customerName || 'Cliente General'}. Comprobante: ${input.receiptType} ${input.receiptNumber}`, input.receiptNumber);
    if (!out.ok) return out;
    addCashMovement({
      kind: 'Ingreso',
      concept: 'Venta de artículo',
      reference: `${input.receiptType} ${input.receiptNumber || 'S/N'} / ${input.customerName || 'Cliente General'}`,
      currency: input.currency,
      amount: input.currency === 'USD' ? totalUsd : Math.round(totalUsd * (input.exchangeRate ?? 0) * 100) / 100,
      exchangeRate: input.currency === 'PEN' ? input.exchangeRate : undefined,
      amountUSD: totalUsd,
      method: input.method,
      branchId: input.branchId,
      sale: { itemId: input.itemId, branchId: input.branchId, qty: input.qty },
    });
    return { ok: true };
  };

  const registerStockEntry = (input: { branchId: string; itemId: string; qty: number; doc: string; reason?: string }): StockResult => {
    if (!can(PERM.stockEntry)) return { ok: false, error: 'Su rol no puede registrar ingresos de stock.' };
    const invalid = stockEntryError(input);
    if (invalid) return { ok: false, error: invalid };
    const denied = warehouseProblem(input.branchId);
    if (denied) return { ok: false, error: denied };
    return updateStock(input.branchId, input.itemId, input.qty, 'Ingreso', input.reason?.trim() || 'Ingreso manual de stock', input.doc.trim());
  };

  const saveRecipe = (recipe: Recipe): StockResult & { id?: string } => {
    const previous = recipe.id ? recipes.find(r => r.id === recipe.id) : undefined;
    if (!can(previous ? PERM.recipeEdit : PERM.recipeCreate)) return { ok: false, error: `Su rol no puede ${previous ? 'editar' : 'crear'} recetas.` };
    if (recipe.id && !previous) return { ok: false, error: 'No se encontró la receta.' };
    const errors = validateRecipe(recipe, recipes.filter(r => r.id !== recipe.id), items, previous);
    if (errors.length > 0) return { ok: false, error: errors.join('\n') };
    if (previous) {
      setRecipes(prev => prev.map(r => (r.id === recipe.id ? recipe : r)));
      return { ok: true, id: recipe.id };
    }
    const id = nextSequentialId('REC', recipes.map(r => r.id));
    setRecipes(prev => [{ ...recipe, id }, ...prev]);
    return { ok: true, id };
  };

  const duplicateRecipe = (id: string): StockResult & { id?: string } => {
    if (!can(PERM.recipeCreate)) return { ok: false, error: 'Su rol no puede crear recetas.' };
    const source = recipes.find(r => r.id === id);
    if (!source) return { ok: false, error: 'No se encontró la receta.' };
    const copyId = nextSequentialId('REC', recipes.map(r => r.id));
    setRecipes(prev => [copyRecipe(source, copyId), ...prev]);
    return { ok: true, id: copyId };
  };

  const setRecipeStatus = (id: string, status: Recipe['status']): StockResult => {
    if (!can(PERM.recipeStatus)) return { ok: false, error: 'Su rol no puede activar ni desactivar recetas.' };
    const recipe = recipes.find(r => r.id === id);
    if (!recipe) return { ok: false, error: 'No se encontró la receta.' };
    const error = recipeStatusError(recipe, status, recipes);
    if (error) return { ok: false, error };
    setRecipes(prev => prev.map(r => (r.id === id ? { ...r, status } : r)));
    return { ok: true };
  };

  const addAdjustment = (adjData: Omit<Adjustment, 'id' | 'date' | 'user'>, stockId: string): StockResult => {
    const stock = stockRef.current.find(s => s.id === stockId);
    if (!stock) return { ok: false, error: 'No se encontró el registro de stock.' };
    const denied = warehouseProblem(stock.branchId);
    if (denied) return { ok: false, error: denied };

    const newAdjustment: Adjustment = {
      ...adjData,
      id: allocId('ADJ', adjustments.map(a => a.id)),
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

  const addTransfer = (transfer: Omit<Transfer, 'id'>): StockResult => {
    // Entre filiales todo pasa por el almacén central (utils/logisticsRoutes.ts)
    const routeError = transferRouteError(transfer.originId, transfer.destinationId, locations);
    if (routeError) return { ok: false, error: routeError };
    const newTransfer = {
      ...transfer,
      id: `TRF-${new Date().getFullYear()}-${String(transfers.length + 1).padStart(3, '0')}`,
      requestedBy: currentUser.name,
      requestedById: currentUser.id,
    } as Transfer;
    setTransfers(prev => [newTransfer, ...prev]);
    if (newTransfer.status === 'Solicitada') announceTransfer(newTransfer, 'Solicitada');
    return { ok: true };
  };

  /** Avisos de una transferencia: pedida (a quien aprueba) y aprobada o rechazada (a quien la pidió). */
  const announceTransfer = (t: Transfer, status: Transfer['status']) => {
    const route = `${locationName(t.originId)} → ${locationName(t.destinationId)}`;
    if (status === 'Solicitada') {
      notify('transfer_requested', { title: 'Transferencia solicitada', message: `${currentUser.name} solicitó la transferencia ${t.id} (${route}): ${t.reason}.`, type: 'warning', scope: { originBranchId: t.originId, destinationBranchId: t.destinationId } });
    } else if (status === 'Aprobada' || status === 'Rechazada') {
      notify('transfer_decided', {
        title: `Transferencia ${status === 'Aprobada' ? 'aprobada' : 'rechazada'}`, message: `${currentUser.name} ${status === 'Aprobada' ? 'aprobó' : 'rechazó'} la transferencia ${t.id} (${route}).`,
        type: status === 'Aprobada' ? 'success' : 'warning', scope: { originBranchId: t.originId, destinationBranchId: t.destinationId, requesterId: t.requestedById, requesterName: t.requestedBy },
      });
    }
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
    const movesStock = (newStatus === 'En tránsito' && (transfer.status === 'Aprobada' || transfer.status === 'Solicitada'))
      || (newStatus === 'Cancelada' && (transfer.status === 'En tránsito' || transfer.status === 'Listo para recepción'));
    const deniedMove = movesStock ? warehouseProblem(transfer.originId) : null;
    if (deniedMove) return { ok: false, error: deniedMove };

    // Regla de stock: sale del origen al DESPACHAR (una sola vez); el destino suma al RECIBIR.
    if (newStatus === 'En tránsito' && (transfer.status === 'Aprobada' || transfer.status === 'Solicitada')) {
      const shortage = findInsufficientStock(transfer.originId, transfer.items);
      if (shortage) return { ok: false, error: shortage };
      transfer.items.forEach(item => {
        updateStock(transfer.originId, item.itemId, -item.quantity, 'Transferencia Salida', `Despacho TRF: ${transfer.id}`, transfer.id);
      });

      notify('transfer_dispatched', {
        title: 'Transferencia en tránsito',
        message: `La transferencia ${transfer.id} desde ${locationName(transfer.originId)} está en tránsito. El stock salió del origen y se sumará al recepcionar.`,
        type: 'info',
        scope: { originBranchId: transfer.originId, destinationBranchId: transfer.destinationId },
      });
    }
    if (newStatus !== transfer.status && (newStatus === 'Solicitada' || newStatus === 'Aprobada' || newStatus === 'Rechazada')) announceTransfer(transfer, newStatus);

    // Cancelación con mercadería ya despachada: vuelve al origen.
    if (newStatus === 'Cancelada' && (transfer.status === 'En tránsito' || transfer.status === 'Listo para recepción')) {
      transfer.items.forEach(item => {
        updateStock(transfer.originId, item.itemId, item.quantity, 'Ingreso', `Cancelación TRF: ${transfer.id}`, transfer.id);
      });
    }

    commitTransfers(transfersRef.current.map(t => t.id === transferId ? { ...t, status: newStatus } : t));
    return { ok: true };
  };

  const updateTransfer = (transferId: string, updatedData: Partial<Transfer>): StockResult => {
    const current = transfersRef.current.find(t => t.id === transferId);
    if (!current) return { ok: false, error: 'Transferencia no encontrada.' };
    const next = { ...current, ...updatedData };
    if (next.originId !== current.originId || next.destinationId !== current.destinationId) {
      const routeError = transferRouteError(next.originId, next.destinationId, locations);
      if (routeError) return { ok: false, error: routeError };
    }
    commitTransfers(transfersRef.current.map(t => t.id === transferId ? next : t));
    return { ok: true };
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
      const newPayment: InstallmentPayment = {
        id: paymentId,
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
        const updated: Installment[] = plan.installments.map((inst, i) => {
          if (i === targetIdx) {
            return {
              ...inst,
              // El monto de la parte queda fijado en lo realmente cobrado (antes tenía como tope el total del plan)
              amount: inst.payments.reduce((acc, pay) => acc + pay.amount, 0) + paid,
              balance: 0,
              status: 'Pagada' as const,
              payments: [...inst.payments, { ...newPayment, amount: paid }]
            };
          }
          if (i === nextIdx) {
            return { ...inst, amount: remaining, balance: remaining, status: remaining === 0 ? ('Pagada' as const) : ('Pendiente' as const) };
          }
          return inst;
        });
        return recomputePlan({ ...plan, installments: updated }, todayISO);
      }

      const updatedInstallments: Installment[] = plan.installments.map(inst => {
        if (inst.id !== installmentId) return inst;
        const newBalance = Math.max(0, inst.balance - paymentData.amount);
        return { ...inst, balance: newBalance, status: newBalance === 0 ? ('Pagada' as const) : ('Parcial' as const), payments: [...inst.payments, newPayment] };
      });
      // El saldo y el estado del plan los calcula recomputePlan (única función que los escribe)
      return recomputePlan({ ...plan, installments: updatedInstallments }, todayISO);
    }));

    // Pago global (una parte por medio usado, un comprobante) y un movimiento de caja por parte
    const planRef = plans.find(pl => pl.id === planId);
    const enrollmentRef = enrollments.find(e => e.id === planRef?.mat);
    const studentName = enrollmentRef?.student || 'Alumno';
    const built = buildPaymentRecord({
      id: paymentId,
      date: paymentData.date,
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
    notify('installment_refinanced', {
      title: 'Cuota refinanciada',
      message: `${currentUser.name} refinanció «${installmentName}» del plan ${planId} (${plan.mat}): ${input.reason.trim()}`,
      type: 'info',
      scope: { subjectBranchId: enrollments.find(e => e.id === plan.mat)?.branchId },
    });
    return { ok: true };
  };

  const updateContract = (id: string, data: Partial<Omit<Contract, 'id'>>) => {
    setContracts(prev => prev.map(c => (c.id === id ? { ...c, ...data } : c)));
  };

  const addContract = (data: Omit<Contract, 'id'>): Contract => {
    const created: Contract = { ...data, id: nextSequentialId('CON', contracts.map(c => c.id)) };
    setContracts(prev => [...prev, created]);
    return created;
  };

  const addStudent = (studentData: Omit<Student, 'id'>): Student => {
    const newStudent: Student = { ...studentData, id: nextSequentialId('ALU', students.map(s => s.id)) };
    setStudents(prev => [...prev, newStudent]);
    return newStudent;
  };

  /**
   * Edita al alumno. Si cambia su nombre, se corrige también la copia que guardan sus matrículas y su agenda (una sola puerta:
   * `syncStudentName`); los comprobantes ya emitidos conservan el nombre de ese día.
   */
  const updateStudent = (id: string, studentData: Partial<Student>) => {
    setStudents(prev => prev.map(s => s.id === id ? { ...s, ...studentData } : s));
    if (studentData.name !== undefined) {
      const synced = syncStudentName(id, studentData.name, enrollments, schedules);
      if (synced.changed) { setEnrollments(synced.enrollments); setSchedules(synced.schedules); }
    }
  };

  /** Un alumno con matrículas, asesorías o seguimiento no se elimina: es historial (ya no tendría a quién mostrar). */
  const deleteStudent = (id: string): StockResult => {
    if (enrollments.some(e => e.studentId === id) || schedules.some(s => s.studentId === id) || trackings.some(t => t.studentId === id)) {
      return { ok: false, error: 'El alumno tiene matrículas, asesorías o seguimiento registrados: no se puede eliminar.' };
    }
    setStudents(prev => prev.filter(s => s.id !== id));
    return { ok: true };
  };

  const addGuardian = (guardianData: Omit<Guardian, 'id'>): Guardian => {
    const newGuardian: Guardian = { ...guardianData, id: nextSequentialId('TIT', guardians.map(g => g.id)) };
    setGuardians(prev => [...prev, newGuardian]);
    return newGuardian;
  };

  const updateGuardian = (id: string, guardianData: Partial<Guardian>) => {
    setGuardians(prev => prev.map(g => g.id === id ? { ...g, ...guardianData } : g));
  };

  /** Un titular con alumnos o matrículas a su cargo no se elimina. */
  const deleteGuardian = (id: string): StockResult => {
    if (students.some(s => s.guardianIds.includes(id)) || enrollments.some(e => e.guardianIds.includes(id))) {
      return { ok: false, error: 'El titular tiene alumnos o matrículas a su cargo: no se puede eliminar.' };
    }
    setGuardians(prev => prev.filter(g => g.id !== id));
    return { ok: true };
  };

  const registerEnrollments = (draft: EnrollmentDraft) => {
    const result = buildEnrollmentBatch(
      draft,
      {
        branches, leadSources, staff, assignments, programs, levels, tariffs, paymentTypes, promotions, guardians, students,
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
        ...m, id: allocId('CJ', cashMovements.map(x => x.id)), user: currentUser.name,
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
    notify('drop_request_pending', { title: 'Solicitud de caída pendiente', message: `${currentUser.name} solicitó la caída de la matrícula ${enrollmentId} (${enrollment.student}): ${input.reason}.`, type: 'warning', scope: { subjectBranchId: enrollment.branchId, requesterId: currentUser.id, requesterName: currentUser.name } });
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

    setEnrollments(prev => prev.map(e => (e.id === enrollment.id ? { ...e, status: 'Caída' as const, dropDate: request.effectiveDate, dropRequestId: request.id } : e)));
    if (plan) setPlans(prev => prev.map(p => (p.id === plan.id ? applyDropToPlan(p, preview, forgive, todayLocalISO()) : p)));
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
    // El estado del alumno no se guarda: pasa a «Inactivo» solo, porque ya no le queda ninguna matrícula activa (utils/identity.ts)
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
    const changes = diffEnrollmentEdit(currentEditValues(enrollment), after, names);
    const problems = validateEnrollmentEdit(enrollment, after, changes, reason);
    if (problems.length > 0) return { ok: false, error: problems[0] };
    const at = new Date().toISOString();
    setEnrollments(prev => prev.map(e => (e.id === enrollmentId ? { ...e, ...buildEnrollmentPatch(after, names) } : e)));
    setEnrollmentChanges(prev => [
      ...changes.map(c => ({ id: allocId('COR', enrollmentChanges.map(x => x.id)), enrollmentId, at, by: currentUser.name, field: c.field, label: c.label, from: c.from, to: c.to, reason: reason.trim() })),
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
    notify('payment_reversed', { title: 'Pago reversado', message: `${currentUser.name} reversó el pago ${paymentId} de ${payment.student} (${input.reason}).`, type: 'warning', scope: { requesterId: currentUser.id, requesterName: currentUser.name } });
    return { ok: true };
  };

  // ---- Personal y asignaciones (en la base de datos; las reglas puras están en utils/ y el orden en services/staffDirectory.ts)
  const addStaff: DataContextType['addStaff'] = input => staffDir.addStaff(input);
  const updateStaff: DataContextType['updateStaff'] = (id, data) => staffDir.updateStaff(id, data);

  const saveAssignment: DataContextType['saveAssignment'] = (form, editingId) => staffDir.saveAssignment(form, todayLocalISO(), editingId);

  const closeAssignment: DataContextType['closeAssignment'] = (id, date, reason) =>
    staffDir.closeAssignment(id, date, reason, currentUser.name, todayLocalISO(), { schedules: NOT_YET_IN_DB.schedules, activities: NOT_YET_IN_DB.activities });

  const inactivateStaff: DataContextType['inactivateStaff'] = async (id, input) => {
    // Los contratos y la agenda de ejemplo no se cruzan con las personas de la base (ver NOT_YET_IN_DB)
    const ctx = { contracts: NOT_YET_IN_DB.contracts, assignments: [], schedules: NOT_YET_IN_DB.schedules, activities: NOT_YET_IN_DB.activities, today: todayLocalISO() };
    const hasActiveAccount = users.some(u => u.staffId === id && u.status === 'Activo');
    const res = await staffDir.inactivateStaff(id, input, currentUser.name, ctx, hasActiveAccount);
    return { ok: res.ok, error: res.error };
  };

  const reactivateStaff: DataContextType['reactivateStaff'] = async (id, detail) => {
    const res = await staffDir.reactivateStaff(id, detail, todayLocalISO());
    return { ok: res.ok, error: res.error };
  };

  // ---- Contratos y planilla
  const closeContract: DataContextType['closeContract'] = (id, date, reason) => {
    const contract = contracts.find(x => x.id === id);
    if (!contract) return { ok: false, error: 'No se encontró el contrato.' };
    if (contract.status !== 'Vigente') return { ok: false, error: 'Solo se cierra un contrato vigente.' };
    if (!date) return { ok: false, error: 'Indique la fecha de cese.' };
    if (date < contract.startDate) return { ok: false, error: 'La fecha de cese no puede ser anterior al inicio del contrato.' };
    if (reason.trim().length < 5) return { ok: false, error: 'Indique el motivo del cese.' };
    // Quien cesa no puede quedar como responsable de asesorías ni actividades posteriores al cese
    const leaver = staff.find(s => s.id === contract.staffId);
    const agendaProblem = leaver ? ceseAgendaError(leaver, date, { schedules, activities: allActivities(monthlySchedules) }) : null;
    if (agendaProblem) return { ok: false, error: agendaProblem };
    const paid = payrollRuns.find(r => r.status !== 'Borrador' && r.period >= periodOf(date) && r.lines?.some(l => l.contractId === id));
    if (paid) return { ok: false, error: `La planilla de ${periodLabel(paid.period)} ya está cerrada con este contrato: reábrala o elija una fecha de cese posterior.` };
    setContracts(prev => prev.map(x => (x.id === id ? { ...x, status: 'Cesado', endDate: date, terminationReason: reason.trim() } : x)));
    return { ok: true };
  };

  const renewContract: DataContextType['renewContract'] = (id, input) => {
    const old = contracts.find(x => x.id === id);
    if (!old) return { ok: false, error: 'No se encontró el contrato.' };
    const member = staff.find(s => s.id === old.staffId);
    const problems = validateRenewal(old, input, contracts, staff, payrollRuns, todayLocalISO());
    if (problems.length > 0) return { ok: false, error: problems[0] };
    const created: Contract = { ...buildRenewal(old, input, member ?? {}), id: nextSequentialId('CON', contracts.map(x => x.id)) };
    setContracts(prev => [...prev.map(x => (x.id === id ? markRenewed(x) : x)), created]);
    return { ok: true };
  };

  const payrollContext = () => ({ contracts, staff, assignments, runs: payrollRuns });
  const payrollLinesOf: DataContextType['payrollLinesOf'] = run => linesOf(run, payrollContext());
  const patchRun = (id: string, fn: (r: PayrollRun) => PayrollRun) => setPayrollRuns(prev => prev.map(r => (r.id === id ? fn(r) : r)));
  const payrollEvent = (action: PayrollEvent['action'], detail?: string): PayrollEvent => ({ at: new Date().toISOString(), by: currentUser.name, action, detail });

  const generatePayroll: DataContextType['generatePayroll'] = period => {
    if (!can(PERM.payrollGenerate)) return { ok: false, error: 'Su rol no puede generar planillas.' };
    const problems = validateGenerate(period, payrollRuns, todayLocalISO());
    if (problems.length > 0) return { ok: false, error: problems[0] };
    const run: PayrollRun = { id: runIdOf(period), period, status: 'Borrador', adjustments: [], createdAt: new Date().toISOString(), createdBy: currentUser.name, events: [payrollEvent('Generada')] };
    setPayrollRuns(prev => [run, ...prev].sort((a, b) => b.period.localeCompare(a.period)));
    return { ok: true };
  };

  const deletePayrollDraft: DataContextType['deletePayrollDraft'] = runId => {
    if (!can(PERM.payrollGenerate)) return { ok: false, error: 'Su rol no puede eliminar planillas.' };
    const run = payrollRuns.find(r => r.id === runId);
    if (!run) return { ok: false, error: 'No se encontró la planilla.' };
    if (run.status !== 'Borrador') return { ok: false, error: 'Solo se elimina una planilla en borrador.' };
    setPayrollRuns(prev => prev.filter(r => r.id !== runId));
    return { ok: true };
  };

  const addPayrollAdjustment: DataContextType['addPayrollAdjustment'] = (runId, input) => {
    if (!can(PERM.payrollAdjust)) return { ok: false, error: 'Su rol no puede ajustar planillas.' };
    const run = payrollRuns.find(r => r.id === runId);
    if (!run) return { ok: false, error: 'No se encontró la planilla.' };
    const inLines = payrollLinesOf(run).lines.some(l => l.staffId === input.staffId);
    const problems = validateAdjustment(run, input, inLines);
    if (problems.length > 0) return { ok: false, error: problems[0] };
    const adjustment: PayrollAdjustment = {
      id: nextSequentialId('AJU', payrollRuns.flatMap(r => r.adjustments.map(a => a.id))), staffId: input.staffId, kind: input.kind, concept: input.concept.trim(),
      amount: round2(input.amount), taxable: input.kind === 'Ingreso' ? input.taxable : true, reason: input.reason.trim(), by: currentUser.name, at: new Date().toISOString(),
    };
    const who = staff.find(s => s.id === input.staffId);
    patchRun(runId, r => ({ ...r, adjustments: [...r.adjustments, adjustment], events: [...r.events, payrollEvent('Ajuste', `${adjustment.kind}: ${adjustment.concept} S/ ${adjustment.amount.toFixed(2)}${who ? ` (${staffDisplayName(who)})` : ''}`)] }));
    return { ok: true };
  };

  const removePayrollAdjustment: DataContextType['removePayrollAdjustment'] = (runId, adjustmentId) => {
    if (!can(PERM.payrollAdjust)) return { ok: false, error: 'Su rol no puede ajustar planillas.' };
    const run = payrollRuns.find(r => r.id === runId);
    const adjustment = run?.adjustments.find(a => a.id === adjustmentId);
    if (!run || !adjustment) return { ok: false, error: 'No se encontró el ajuste.' };
    if (run.status !== 'Borrador') return { ok: false, error: 'Solo se ajusta una planilla en borrador.' };
    patchRun(runId, r => ({ ...r, adjustments: r.adjustments.filter(a => a.id !== adjustmentId), events: [...r.events, payrollEvent('Ajuste', `Se quitó: ${adjustment.concept} S/ ${adjustment.amount.toFixed(2)}`)] }));
    return { ok: true };
  };

  const closePayroll: DataContextType['closePayroll'] = runId => {
    if (!can(PERM.payrollClose)) return { ok: false, error: 'Su rol no puede cerrar planillas.' };
    const run = payrollRuns.find(r => r.id === runId);
    if (!run) return { ok: false, error: 'No se encontró la planilla.' };
    const built = payrollLinesOf(run);
    const problems = validateClose(run, built, todayLocalISO());
    if (problems.length > 0) return { ok: false, error: problems[0] };
    const net = round2(built.lines.reduce((s, l) => s + l.calc.net, 0));
    patchRun(runId, r => ({ ...r, status: 'Cerrada', lines: built.lines, closedAt: new Date().toISOString(), closedBy: currentUser.name, events: [...r.events, payrollEvent('Cerrada', `${built.lines.length} trabajador(es) · neto S/ ${net.toFixed(2)}`)] }));
    return { ok: true };
  };

  const reopenPayroll: DataContextType['reopenPayroll'] = (runId, reason) => {
    if (!can(PERM.payrollReopen)) return { ok: false, error: 'Su rol no puede reabrir planillas.' };
    const run = payrollRuns.find(r => r.id === runId);
    if (!run) return { ok: false, error: 'No se encontró la planilla.' };
    const problems = validatePayrollReopen(run, payrollRuns, reason);
    if (problems.length > 0) return { ok: false, error: problems[0] };
    patchRun(runId, r => ({ ...r, status: 'Borrador', lines: undefined, closedAt: undefined, closedBy: undefined, events: [...r.events, payrollEvent('Reabierta', reason.trim())] }));
    return { ok: true };
  };

  const editContract = (id: string, form: ContractForm, reason: string): StockResult => {
    const current = contracts.find(c => c.id === id);
    if (!current) return { ok: false, error: 'No se encontró el contrato.' };
    if (form.staffId !== current.staffId) return { ok: false, error: 'No se puede cambiar el trabajador de un contrato.' };
    const errors = validateContractForm(form, contracts, staff, todayLocalISO(), id, { schedules, activities: allActivities(monthlySchedules) });
    const first = Object.values(errors)[0];
    if (first) return { ok: false, error: first };
    const patch = buildContractPatch(form, staff.find(s => s.id === current.staffId) ?? {});
    const changes = diffContract(current, patch);
    const problems = validateContractEdit(current, changes, reason);
    if (problems.length > 0) return { ok: false, error: problems[0] };
    setContracts(prev => prev.map(c => (c.id === id
      ? { ...c, ...patch, revisions: [{ at: new Date().toISOString(), by: currentUser.name, reason: reason.trim(), changes }, ...(c.revisions ?? [])] }
      : c)));
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
    notify('cash_movement_reversed', { title: 'Movimiento de caja reversado', message: `${currentUser.name} reversó el movimiento ${movement.id} (${movement.concept}): ${input.reason}.`, type: 'warning', scope: { subjectBranchId: movement.branchId } });
    return { ok: true };
  };

  const createDepositBatch = (input: DepositInput): StockResult & { code?: string } => {
    if (!can(PERM.deposit)) return { ok: false, error: 'Su rol no puede crear lotes de depósito.' };
    const closed = closedMessage(cashClosures, 'caja', input.currency, input.date);
    if (closed) return { ok: false, error: closed };
    const problems = validateDeposit(input, cashMovements, todayLocalISO());
    if (problems.length > 0) return { ok: false, error: problems[0] };
    const built = buildDeposit(input, cashMovements, currentUser.name, new Date(`${input.date}T12:00:00`).toISOString());
    const created: CashMovement = { ...built.egress, id: allocId('CJ', cashMovements.map(x => x.id)), user: currentUser.name, status: 'Aplicado' };
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
    if (!can(closure.scope === 'caja' ? PERM.reopenCash : PERM.reopenPetty)) return { ok: false, error: 'Su rol no puede reabrir esta caja.' };
    const problems = validateReopen(closure, cashClosures, reason);
    if (problems.length > 0) return { ok: false, error: problems[0] };
    setCashClosures(prev => prev.map(c => (c.id === closureId ? { ...c, status: 'Reabierta' as const, reopenedAt: new Date().toISOString(), reopenedBy: currentUser.name, reopenReason: reason.trim() } : c)));
    notify('cash_reopened', { title: 'Caja reabierta', message: `${currentUser.name} reabrió el cierre ${closure.id} (${closure.scope === 'caja' ? `Caja ${closure.currency}` : 'Caja chica'} al ${closure.date}): ${reason.trim()}`, type: 'warning' });
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
    enrollments, plans, students, schedules, monthly: monthlySchedules, programs, levels, tariffs, paymentTypes, branches,
    payments, groups: promotionGroups, requests: omit ? changeRequests.filter(r => r.id !== omit) : changeRequests, responsibles: responsiblesByBranch(staff, assignments, branches), today: todayLocalISO(),
  });

  const openChange = (kind: ChangeKind & ChangeRequest['kind'], enrollment: Enrollment, reason: string, detail: string, payload: Record<string, string>): StockResult => {
    const request: ChangeRequest = {
      id: nextSequentialId('SOL', changeRequests.map(r => r.id)), kind, enrollmentId: enrollment.id, studentId: enrollment.studentId,
      requestedAt: new Date().toISOString(), requestedBy: currentUser.name, reason, detail: detail.trim(), payload, status: 'Pendiente',
    };
    setChangeRequests(prev => [request, ...prev]);
    notify(kind === 'Reactivación' ? 'reactivation_request_pending' : kind === 'Cambio de programa' ? 'program_change_request_pending' : 'enrollment_transfer_pending', { title: `Solicitud de ${kind.toLowerCase()} pendiente`, message: `${currentUser.name} solicitó ${kind.toLowerCase()} para la matrícula ${enrollment.id} (${enrollment.student}): ${reason}.`, type: 'warning', scope: { subjectBranchId: enrollment.branchId, requesterId: currentUser.id, requesterName: currentUser.name } });
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
    return openChange('Traslado de sede', enrollment, input.reason, input.detail, { branchId: input.branchId, firstDate: input.firstDate, firstTime: input.firstTime });
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
      setEnrollmentChanges(prev => [{ id: allocId('COR', enrollmentChanges.map(x => x.id)), enrollmentId: enrollment.id, at, by: currentUser.name, field, label, from, to, reason: request.reason }, ...prev]);
    const plan = plans.find(p => p.mat === enrollment.id);
    const effects: string[] = [];

    if (request.kind === 'Reactivación') {
      const problems = reactivationProblems(enrollment, c);
      if (problems.length > 0) return { ok: false, error: problems[0] };
      const startDate = request.payload.startDate || today;
      const preview = previewReactivation(enrollment, c, startDate);
      setEnrollments(prev => prev.map(e => (e.id === enrollment.id ? { ...e, status: 'Activa' as const, dropDate: undefined, dropRequestId: undefined, reactivatedAt: at, reactivationRequestId: request.id } : e)));
      if (plan) setPlans(prev => prev.map(p => (p.id === plan.id ? applyReactivationToPlan(p, preview, today) : p)));
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
      const otherActive = enrollments.some(o => o.id !== enrollment.id && o.status === 'Activa' && o.studentId === enrollment.studentId);
      setSchedules(prev => prev.map(sc => {
        const mine = sc.studentId === enrollment.studentId;
        const target = otherActive ? sc.isFirst && sc.enrollmentId === enrollment.id : mine;
        return target && sc.date >= today && ['Reservado', 'Reprogramado'].includes(sc.status) ? { ...sc, program: preview.program.name, level: preview.level?.name ?? 'Sin nivel' } : sc;
      }));
      // El programa del alumno tampoco se guarda: sale de su matrícula más reciente
      log('program', 'Cambio de programa o nivel', preview.fromLabel, toLabel);
      effects.push(`${preview.fromLabel} → ${toLabel}.`, `Precio: USD ${preview.oldTotal.toFixed(2)} → USD ${preview.newTotal.toFixed(2)}; cobrado USD ${preview.paidUSD.toFixed(2)}; saldo USD ${preview.remaining.toFixed(2)}.`);
      if (preview.verificationReset) effects.push('La verificación vuelve a «Pendiente» para entregar los materiales del programa nuevo.');
    } else {
      const input = { branchId: request.payload.branchId, firstDate: request.payload.firstDate ?? '', firstTime: request.payload.firstTime ?? '' };
      const problems = transferProblems(enrollment, input, c);
      if (problems.length > 0) return { ok: false, error: problems[0] };
      const preview = previewTransfer(enrollment, input, c);
      if (!preview) return { ok: false, error: 'No se encontró la sede destino.' };
      const fromName = preview.fromName;
      setEnrollments(prev => prev.map(e => (e.id === enrollment.id ? { ...e, branchId: input.branchId, sede: preview.toName } : e)));
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
      // La nueva primera asesoría en la sede destino (con personal de Psicopedagogía de esa sede)
      if (preview.newFirst) {
        const taken = responsiblesByBranch(staff, assignments, branches)[input.branchId] ?? [];
        const responsible = taken[0] ?? '';
        addSchedule({
          student: enrollment.student, studentId: enrollment.studentId, branchId: input.branchId, program: enrollment.program, level: enrollment.level,
          date: preview.newFirst.date, time: preview.newFirst.time, duration: SLOT_DURATION, responsible, status: 'Reservado',
          isFirst: true, registrationId: enrollment.id, enrollmentId: enrollment.id,
        });
        effects.push(`Nueva primera asesoría en ${preview.toName}: ${preview.newFirst.date} a las ${preview.newFirst.time}${responsible ? ` con ${responsible}` : ''}.`);
      }
      log('branch', 'Traslado de sede', fromName, preview.toName);
      effects.push(`Sede: ${fromName} → ${preview.toName}.`, `${preview.scheduleIds.length} asesoría(s) y ${preview.activityRemovals.length} inscripción(es) de la sede anterior canceladas.`);
    }
    setChangeRequests(prev => prev.map(r => (r.id === requestId ? { ...r, ...base, effects } : r)));
    notify('request_resolved', { title: `Solicitud de ${request.kind.toLowerCase()} aprobada`, message: `${currentUser.name} aprobó la solicitud ${request.id} de la matrícula ${enrollment.id}.`, type: 'info', scope: { subjectBranchId: enrollment.branchId, requesterName: request.requestedBy } });
    return { ok: true };
  };

  // ---- Contrato y ficha de la matrícula
  const documentContextOf = (enrollmentId: string): DocContext | undefined => {
    const enrollment = enrollments.find(e => e.id === enrollmentId);
    if (!enrollment) return undefined;
    const today = todayLocalISO();
    const student = students.find(s => s.id === enrollment.studentId);
    const guardiansOf = (enrollment.guardianIds.length > 0 ? enrollment.guardianIds : student?.guardianIds ?? [])
      .map(id => guardians.find(g => g.id === id)).filter((g): g is Guardian => !!g);
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
      id: allocId('TRK', trackings.map(t => t.id))
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
      id: nextNumericId(programs.map(x => x.id)),
    };
    setPrograms(prev => [...prev, newProgram]);
  };

  /** Las matrículas y la agenda copian el nombre del programa, del nivel y de la sede: al renombrar un catálogo se corrigen (syncCatalogLabels). */
  const relabelFrom = (catalogs: { branches: Branch[]; programs: Program[]; levels: Level[] }) => {
    const synced = syncCatalogLabels(enrollments, schedules, catalogs);
    setEnrollments(synced.enrollments);
    setSchedules(synced.schedules);
  };

  const updateProgram = (id: string, programData: Partial<Program>) => {
    const next = programs.map(p => p.id === id ? { ...p, ...programData } : p);
    setPrograms(next);
    if (programData.name !== undefined) relabelFrom({ branches, programs: next, levels });
  };

  const deleteProgram = (id: string) => {
    setPrograms(prev => prev.filter(p => p.id !== id));
  };

  const addLevel = (levelData: Omit<Level, 'id'>) => {
    const newLevel = {
      ...levelData,
      id: nextNumericId(levels.map(x => x.id)),
    };
    setLevels(prev => [...prev, newLevel]);
  };

  const updateLevel = (id: string, levelData: Partial<Level>) => {
    const next = levels.map(l => l.id === id ? { ...l, ...levelData } : l);
    setLevels(next);
    if (levelData.name !== undefined) relabelFrom({ branches, programs, levels: next });
  };

  const deleteLevel = (id: string) => {
    setLevels(prev => prev.filter(l => l.id !== id));
  };

  const addPaymentType = (data: Omit<PaymentType, 'id'>) => {
    setPaymentTypes(prev => [...prev, { ...data, id: nextNumericId(prev.map(x => x.id)) }]);
  };

  const updatePaymentType = (id: string, data: Partial<PaymentType>) => {
    setPaymentTypes(prev => prev.map(pt => pt.id === id ? { ...pt, ...data } : pt));
  };

  const deletePaymentType = (id: string) => {
    setPaymentTypes(prev => prev.filter(pt => pt.id !== id));
  };

  const addTariff = (data: Omit<Tariff, 'id'>) => {
    setTariffs(prev => [...prev, { ...data, id: nextNumericId(prev.map(x => x.id)) }]);
  };

  const updateTariff = (id: string, data: Partial<Tariff>) => {
    setTariffs(prev => prev.map(t => t.id === id ? { ...t, ...data } : t));
  };

  const deleteTariff = (id: string) => {
    setTariffs(prev => prev.filter(t => t.id !== id));
  };

  const addPromotion = (data: Omit<Promotion, 'id'>) => {
    setPromotions(prev => [...prev, { ...data, id: nextNumericId(prev.map(x => x.id)) }]);
  };

  const updatePromotion = (id: string, data: Partial<Promotion>) => {
    setPromotions(prev => prev.map(p => p.id === id ? { ...p, ...data } : p));
  };

  const deletePromotion = (id: string) => {
    setPromotions(prev => prev.filter(p => p.id !== id));
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
    const cancelling = !!prev && IN_TRANSIT_STATUSES.includes(prev.status) && next.status === 'Cancelado';
    // El stock del almacén solo lo mueve quien trabaja en él (despachar y cancelar un envío en tránsito lo mueven)
    const denied = dispatching || cancelling ? warehouseProblem(next.originId) : null;
    if (denied) return denied;
    return dispatching ? findInsufficientStock(next.originId, next.items) : null;
  };

  const applyShipmentTransition = (prev: Shipment | undefined, next: Shipment) => {
    const wasDispatched = !!prev && IN_TRANSIT_STATUSES.includes(prev.status);
    const isDispatched = IN_TRANSIT_STATUSES.includes(next.status);

    if (!wasDispatched && isDispatched && (!prev || prev.status === 'Borrador')) {
      next.items.forEach(i => {
        updateStock(next.originId, i.itemId, -i.quantity, 'Transferencia Salida', `Despacho de envío ${next.id}`, next.id);
      });
      notify('shipment_dispatched', {
        title: 'Envío en tránsito',
        message: `El envío ${next.id} desde ${locationName(next.originId) || 'la sede de origen'} ha sido despachado. El stock salió del origen y se sumará al recepcionar.`,
        type: 'info',
        scope: { originBranchId: next.originId, destinationBranchId: next.destinationId },
      });
    }

    if (wasDispatched && next.status === 'Cancelado') {
      next.items.forEach(i => {
        updateStock(next.originId, i.itemId, i.quantity, 'Ingreso', `Cancelación de envío ${next.id}`, next.id);
      });
      notify('shipment_cancelled', {
        title: 'Envío cancelado',
        message: `El envío ${next.id} hacia ${locationName(next.destinationId) || 'la filial'} fue cancelado. El stock volvió al almacén de origen.`,
        type: 'warning',
        scope: { originBranchId: next.originId, destinationBranchId: next.destinationId },
      });
    }
  };

  const addShipment = (shipment: Omit<Shipment, 'id'>): StockResult & { id?: string } => {
    const routeError = shipmentRouteError(shipment.originId, shipment.destinationId, locations);
    if (routeError) return { ok: false, error: routeError };
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
    if (next.originId !== prev.originId || next.destinationId !== prev.destinationId) {
      const routeError = shipmentRouteError(next.originId, next.destinationId, locations);
      if (routeError) return { ok: false, error: routeError };
    }
    const shortage = checkShipmentDispatch(prev, next);
    if (shortage) return { ok: false, error: shortage };
    commitShipments(shipmentsRef.current.map(s => s.id === id ? next : s));
    applyShipmentTransition(prev, next);
    return { ok: true };
  };

  const addRole: DataContextType['addRole'] = async input => {
    const invalid = validateRoleInput(input, roles);
    if (invalid) return { ok: false, error: invalid };
    const draft: Omit<Role, 'id'> = {
      name: input.name.trim(), desc: input.desc?.trim() ?? '', status: input.status ?? 'Activo', templateId: input.templateId,
      observations: input.observations?.trim() || undefined, branchUserLimit: input.branchUserLimit,
    };
    // Con funciones, el rol nace armado en una sola operación: si algo falla no queda un rol a medias
    let granted: string[] = [];
    if (input.permissions && input.permissions.length > 0) {
      const plan = planPermissions(draft, input.permissions, input.reasons ?? {}, currentUser.name, todayLocalISO());
      if (!plan.ok) return { ok: false, error: plan.error };
      granted = plan.permissions;
      if (plan.acceptedRisks.length > 0) draft.acceptedRisks = plan.acceptedRisks;
    }
    const saved = await persistNewRole(rolesRepo, roles, draft, granted);
    if (!saved.ok || !saved.value) {
      if (saved.partial) await resyncRoles();
      return { ok: false, error: saved.error };
    }
    const created = saved.value;
    setRoles(prev => [...prev, created]);
    if (granted.length > 0) setPermissions(prev => [...prev, { roleId: created.id, permissions: granted }]);
    notify('role_permissions_changed', {
      title: 'Rol creado',
      message: `${currentUser.name} creó el rol «${created.name}»${granted.length > 0 ? ` con ${granted.length} funciones` : ' sin funciones'}.`,
      type: 'info',
    });
    return { ok: true, id: created.id };
  };

  const updateRole: DataContextType['updateRole'] = async (id, roleData) => {
    const role = roles.find(r => r.id === id);
    if (!role) return { ok: false, error: 'No se encontró el rol.' };
    const locked = roleLockedError(role);
    if (locked) return { ok: false, error: locked };
    const next = { ...role, ...roleData };
    const invalid = validateRoleInput(next, roles, id);
    if (invalid) return { ok: false, error: invalid };
    const name = next.name.trim();
    const saved = await persistRoleUpdate(rolesRepo, id, {
      name, desc: next.desc.trim(), status: next.status, templateId: next.templateId, observations: next.observations, branchUserLimit: next.branchUserLimit,
    });
    if (!saved.ok || !saved.value) return { ok: false, error: saved.error };
    // Lo que se guardó en la base (con el rol del sistema y los motivos tal como están allá) es lo que se muestra
    const stored = saved.value;
    setRoles(prev => prev.map(r => (r.id === id ? { ...r, ...stored } : r)));
    // El rol y la cuenta se enlazan por nombre: al renombrar el rol, sus cuentas lo siguen
    if (name !== role.name) setUsers(prev => prev.map(u => (u.role === role.name ? { ...u, role: name } : u)));
    return { ok: true };
  };

  const deleteRole: DataContextType['deleteRole'] = async id => {
    const role = roles.find(r => r.id === id);
    if (!role) return { ok: false, error: 'No se encontró el rol.' };
    const blocked = roleDeleteError(role, users);
    if (blocked) return { ok: false, error: blocked };
    const removed = await persistRoleDelete(rolesRepo, id);
    if (!removed.ok) return { ok: false, error: removed.error };
    setRoles(prev => prev.filter(r => r.id !== id));
    setPermissions(prev => prev.filter(p => p.roleId !== id));
    return { ok: true };
  };

  // ------------------------------------------------------------------ Cuentas: las escribe la Edge Function `usuarios`, no el navegador
  /** Lo que las reglas de las cuentas miran: el personal y las asignaciones de la base, los usuarios, los roles y quién actúa. */
  const accountRules = (): AccountRulesContext => ({
    staff: staffDir.staff, assignments: staffDir.assignments, places, users, roles, permissions, actorIsSuperuser: currentUser.role === SUPERUSER,
  });

  const addUser: DataContextType['addUser'] = async form => {
    if (!can(PERM.userCreate)) return { ok: false, error: 'Su rol no puede crear usuarios.' };
    // Una cuenta nace de una persona de Personal (o es técnica, solo si la crea un Superusuario): el servidor vuelve a revisar todo
    const check = accountCreateCheck({ staffId: form.staffId, name: form.name, email: form.email, role: form.role }, accountRules());
    if (check.error) return { ok: false, error: check.error };
    const request = inviteBody(form, roles, appUrl());
    if (!request.ok || !request.body) return { ok: false, error: request.error };
    const res = await accountsRepo.call(request.body);
    if (!res.ok) return { ok: false, error: res.error };
    await resyncUsers();
    return { ok: true, id: res.cuentaId };
  };

  const updateUser: DataContextType['updateUser'] = async (id, changes) => {
    const current = users.find(u => u.id === id);
    if (!current) return { ok: false, error: 'No se encontró el usuario.' };
    const form: AccountForm = { staffId: current.staffId, name: current.name, email: current.email, role: current.role, status: current.status, ...changes };
    if (form.email.trim().toLowerCase() !== current.email.toLowerCase()) return { ok: false, error: 'El correo de una cuenta no se puede cambiar: desactívela y cree una cuenta nueva.' };
    const roleChange = form.role !== current.role ? form.role : undefined;
    const statusChange = form.status !== current.status ? form.status : undefined;
    const selfProblem = selfAccountError(activeUserId, id, { role: roleChange, status: statusChange });
    if (selfProblem) return { ok: false, error: selfProblem };
    const lastProblem = lastSuperuserError(users, id, { role: roleChange, status: statusChange });
    if (lastProblem) return { ok: false, error: lastProblem };
    const problem = accountEditCheck(current, { role: form.role, status: form.status }, accountRules());
    if (problem) return { ok: false, error: problem };
    const request = editBody(current, form, roles);
    if (!request.ok || !request.body) return { ok: false, error: request.error };
    if (Object.keys(request.body.cambios).length === 0) return { ok: true };
    // Cada campo que de verdad cambia pide su función: desactivar, activar, cambiar el rol o corregir el nombre de una cuenta técnica
    const unmet = unmetClause(changeNeeds(request.body.cambios), can);
    if (unmet) return { ok: false, error: denialMessage(unmet) };
    const res = await accountsRepo.call(request.body);
    if (!res.ok) return { ok: false, error: res.error };
    await resyncUsers();
    return { ok: true };
  };

  const resendAccess: DataContextType['resendAccess'] = async id => {
    if (!users.some(u => u.id === id)) return { ok: false, error: 'No se encontró el usuario.' };
    const res = await accountsRepo.call({ accion: 'reenviar', cuentaId: id, redirectTo: appUrl() });
    return res.ok ? { ok: true } : { ok: false, error: res.error };
  };

  const selectBranch: DataContextType['selectBranch'] = id => {
    const problem = viewBranchError(sessionScope, id);
    if (problem) return { ok: false, error: problem };
    setViewBranchId(id);
    return { ok: true };
  };

  const savePermissions: DataContextType['savePermissions'] = async (roleId, newPermissions, reasons = {}) => {
    const role = roles.find(r => r.id === roleId);
    if (!role) return { ok: false, error: 'No se encontró el rol.' };
    // Un rol nunca queda con una función a medias (se suma lo que cada una necesita) y las combinaciones a separar piden motivo
    const plan = planPermissions(role, newPermissions, reasons, currentUser.name, todayLocalISO());
    if (!plan.ok) return { ok: false, error: plan.error };
    const current = permissions.find(p => p.roleId === roleId)?.permissions ?? [];
    const saved = await persistPermissions(rolesRepo, roleId, current, plan.permissions, plan.acceptedRisks);
    if (!saved.ok) {
      // Si llegó a cambiar algo, se vuelve a leer la base para mostrar lo que de verdad quedó
      if (saved.partial) await resyncRoles();
      return { ok: false, error: saved.error };
    }
    setPermissions(prev => (prev.some(p => p.roleId === roleId)
      ? prev.map(p => (p.roleId === roleId ? { ...p, permissions: plan.permissions } : p))
      : [...prev, { roleId, permissions: plan.permissions }]));
    setRoles(prev => prev.map(r => (r.id === roleId ? { ...r, acceptedRisks: plan.acceptedRisks.length > 0 ? plan.acceptedRisks : undefined } : r)));
    notify('role_permissions_changed', {
      title: 'Permisos de un rol modificados',
      message: `${currentUser.name} cambió los permisos de «${role.name}» (${plan.permissions.length} funciones).`,
      type: 'warning',
    });
    return { ok: true };
  };

  // Avisos y alertas del usuario actual: se calculan con las cuentas y funciones de hoy (nada de esto se guarda)
  const holders = useMemo(() => buildHolders({ users, roles, permissions, branches }), [users, roles, permissions, branches]);
  const myNotifications = useMemo(() => noticesFor(currentUser, notifications, holders), [currentUser, notifications, holders]);
  const myAlerts = useMemo(
    () => deriveAlerts({ plans, enrollments, contracts, stockItems, items, branches: locations, blockedSessions: blockedFirstSessions(enrollments, gateContext()) }, todayLocalISO())
      .filter(a => visibility(currentUser, a, holders).visible),
    [plans, enrollments, contracts, stockItems, items, branches, schedules, recipes, holders, currentUser]
  );

  const availabilityOf: DataContextType['availabilityOf'] = (capabilityId, target) =>
    availabilityForViewer(availability(capabilityId, holders, target), currentUser.role === SUPERUSER);

  const data: DataContextType = {
      guardians, 
      students, 
      enrollments, 
      plans, 
      payments, 
      items,
      addItems,
      updateItem,
      stockItems, 
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
      couriers,
      addCourier,
      updateCourier,
      shippingMethods,
      addShippingMethod,
      updateShippingMethod,
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
      orgCompanies: org.companies,
      orgBranches: org.branches,
      orgWarehouses: org.warehouses,
      orgDirectory: { status: org.status, error: org.error },
      reloadOrgDirectory: org.reload,
      addCompany: org.addCompany,
      updateCompany: org.updateCompany,
      deleteCompany: org.deleteCompany,
      roles,
      addRole,
      updateRole,
      deleteRole,
      users,
      addUser,
      updateUser,
      resendAccess,
      payrollRuns,
      payrollLinesOf,
      generatePayroll,
      deletePayrollDraft,
      addPayrollAdjustment,
      removePayrollAdjustment,
      closePayroll,
      reopenPayroll,
      closeContract,
      renewContract,
      permissions,
      savePermissions,
      branches,
      warehouses,
      stockLocations: locations,
      leadSources,
      programs,
      levels,
      paymentTypes,
      tariffs,
      promotions,
      recipes,
      saveRecipe,
      duplicateRecipe,
      setRecipeStatus,
      unpackPackage,
      packPackage,
      registerItemSale,
      registerStockEntry,
      addAdjustment,
      updateMinStock,
      updateTransferStatus,
      updateTransfer,
      addTransfer,
      addStaff,
      addContract,
      updateContract,
      updateStaff,
      orgStaff: staffDir.staff,
      orgAssignments: staffDir.assignments,
      orgPlaces: places,
      staffDirectory: { status: staffDir.status, error: staffDir.error },
      reloadStaffDirectory: staffDir.reload,
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
      addBranch: org.addBranch,
      updateBranch: org.updateBranch,
      deleteBranch: org.deleteBranch,
      addWarehouse: org.addWarehouse,
      updateWarehouse: org.updateWarehouse,
      isEnrollmentWizardOpen,
      setIsEnrollmentWizardOpen,
      shipments,
      addShipment,
      updateShipmentStatus,
      updateShipment,
      deleteShipment,
      notifications,
      myNotifications,
      myAlerts,
      markNotificationAsRead,
      incidents,
      currentBranchId,
      selectBranch,
      sessionScope,
      currentUser,
      confirmReception,
      updateEnrollmentVerification,
      availabilityOf,
  };

  // Toda acción pide su función antes de ejecutarse (ver `utils/guards.ts`); las pantallas además ocultan lo que el rol no puede hacer
  return (
    <DataContext.Provider value={guardActions(data, can)}>
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
