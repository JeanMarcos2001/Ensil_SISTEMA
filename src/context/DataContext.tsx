import React, { createContext, useContext, useRef, useState, ReactNode } from 'react';
import { buildEnrollmentBatch, type EnrollmentDraft } from '../utils/enrollment';
import { formatDisplayDate } from '../utils/tariffs';
import { nextNumericId, nextSequentialId } from '../utils/ids';
import { allActivities, MONTHS } from '../utils/schedule';

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
  parts?: PaymentPart[]; // Estructura para la integración del asistente (etapa 5)
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
  institutionalEmail: string;
  personalEmail?: string;
  address?: string;
  status: string;
  observations?: string;
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
  commissionType?: string;
  grossSalary?: number;
  contribution?: number;
  netSalary?: number;
  vacationStart?: string;
  vacationEnd?: string;
  terminationReason?: string;
  observations?: string;
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
  status: string;
  observations?: string;
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
  updateSchedule: (id: string, data: Partial<Omit<Schedule, 'id'>>) => void;
  trackings: Tracking[];
  monthlySchedules: MonthlySchedule[];
  addMonthlySchedule: (data: Omit<MonthlySchedule, 'id'>) => MonthlySchedule;
  updateMonthlySchedule: (id: string, data: Partial<Omit<MonthlySchedule, 'id'>>) => void;
  deleteMonthlySchedule: (id: string) => void;
  capacityConfig: CapacityConfig;
  setCapacityConfig: (config: CapacityConfig) => void;
  staff: Staff[];
  contracts: Contract[];
  assignments: Assignment[];
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
  addStaff: (staff: Omit<Staff, 'id'>) => void;
  updateStaff: (id: string, staff: Partial<Staff>) => void;
  deleteStaff: (id: string) => void;
  addStudent: (student: Omit<Student, 'id'>) => void;
  updateStudent: (id: string, student: Partial<Student>) => void;
  deleteStudent: (id: string) => void;
  addGuardian: (guardian: Omit<Guardian, 'id'>) => void;
  updateGuardian: (id: string, guardian: Partial<Guardian>) => void;
  deleteGuardian: (id: string) => void;
  /** Guardado atómico del asistente: crea matrículas, planes, pagos, caja y grupos promocionales, o nada. */
  registerEnrollments: (draft: EnrollmentDraft) => { ok: boolean; error?: string; enrollmentIds?: string[] };
  addTracking: (tracking: Omit<Tracking, 'id'>) => Tracking;
  updateTracking: (id: string, data: Partial<Omit<Tracking, 'id'>>) => void;
  registerPayment: (planId: string, installmentId: string, paymentData: any) => StockResult;
  refinanceInstallment: (planId: string, installmentId: string, refinanceData: any) => void;
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
    { id: 'ALU-001', doc: '76543210', name: 'Mateo Ruiz', age: 8, program: 'Kids - Básico 1', titular: 'Juan Ruiz', status: 'Activo' },
    { id: 'ALU-002', doc: '76543211', name: 'Sofia Castro', age: 14, program: 'Teens - Intermedio', titular: 'María Castro', status: 'Activo' },
    { id: 'ALU-003', doc: '76543212', name: 'Lucas Vega', age: 9, program: 'Kids - Básico 2', titular: 'Pedro Vega', status: 'Inactivo' },
    { id: 'ALU-004', doc: '76543213', name: 'Valentina Silva', age: 5, program: 'Pre-Kids - Inicial', titular: 'Ana Silva', status: 'Activo' },
    { id: 'ALU-005', doc: '76543214', name: 'Diego Torres', age: 15, program: 'Teens - Avanzado', titular: 'Carlos Torres', status: 'Activo' },
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
  const [schedules, setSchedules] = useState<Schedule[]>([
    { id: '1', student: 'Mateo Ruiz', studentId: 'ALU-001', branchId: 'FIL-PIU', program: 'Kids', level: 'Nivel 1', date: seedDay(0), time: '16:00', duration: 60, responsible: 'Lic. María Torres', status: 'Asistió', isFirst: true },
    { id: '2', student: 'Sofia Castro', studentId: 'ALU-002', branchId: 'FIL-CHI', program: 'Kids', level: 'Nivel 2', date: seedDay(0), time: '17:00', duration: 60, responsible: 'Lic. Juan Pérez', status: 'Reservado' },
    { id: '3', student: 'Lucas Vega', studentId: 'ALU-003', branchId: 'FIL-PIU', program: 'Kids', level: 'Nivel 3', date: seedDay(1), time: '16:00', duration: 60, responsible: 'Lic. María Torres', status: 'Cancelado' },
    { id: '4', student: 'Valentina Silva', studentId: 'ALU-004', branchId: 'FIL-CHI', program: 'Pre-Kids', level: 'Nivel 1', date: seedDay(2), time: '17:00', duration: 60, responsible: 'Lic. Juan Pérez', status: 'Reservado', isFirst: true },
    { id: '5', student: 'Diego Torres', studentId: 'ALU-005', branchId: 'FIL-PIU', program: 'Kids', level: 'Nivel 1', date: seedDay(3), time: '18:00', duration: 60, responsible: 'Lic. María Torres', status: 'Reservado' },
  ]);

  const addSchedule = (data: Omit<Schedule, 'id'>): Schedule => {
    const created: Schedule = { ...data, id: nextNumericId(schedules.map(x => x.id)) };
    setSchedules(prev => [...prev, created]);
    return created;
  };

  const updateSchedule = (id: string, data: Partial<Omit<Schedule, 'id'>>) => {
    setSchedules(prev => prev.map(x => (x.id === id ? { ...x, ...data } : x)));
  };

  const [trackings, setTrackings] = useState<Tracking[]>([
    { id: '1', studentId: 'ALU-001', date: '2026-03-24', status: 'Asistió', metrics: { modulo: 'Módulo 3', velocidad: 250, comprension: 85 }, observations: 'Buen progreso en lectura rápida.' },
    { id: '2', studentId: 'ALU-001', date: '2026-03-17', status: 'Asistió', metrics: { modulo: 'Módulo 3', velocidad: 220, comprension: 80 }, observations: 'Se recomienda repasar ejercicios de fijación.' },
    { id: '3', studentId: 'ALU-001', date: '2026-03-10', status: 'Faltó', metrics: null, observations: 'Avisó con anticipación por motivos de salud.' },
    { id: '4', studentId: 'ALU-002', date: '2026-03-25', status: 'Asistió', metrics: { modulo: 'Módulo 5', velocidad: 300, comprension: 90 }, observations: 'Excelente comprensión.' },
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
        { id: 'a1', actividad: 'Taller de Ortografía', fecha: seedDay(2), horaInicio: '15:00', horaFin: '17:00', responsable: 'Lic. Juan Pérez', orden: 1, cupo: 12, inscritos: [] },
        { id: 'a2', actividad: 'Maratón de Lectura', fecha: seedDay(5), horaInicio: '16:00', horaFin: '18:00', responsable: 'Equipo Psicopedagogía', orden: 2, cupo: null, inscritos: ['ALU-001', 'ALU-005'] },
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
        { id: 'b1', actividad: 'Taller para Padres', fecha: seedDay(3), horaInicio: '18:00', horaFin: '19:30', responsable: 'Lic. Ana Gómez', orden: 1, cupo: 20, inscritos: [] },
        { id: 'b2', actividad: 'Evaluación de Avance', fecha: seedDay(6), horaInicio: '15:00', horaFin: '20:00', responsable: '', orden: 2, cupo: null, inscritos: [] },
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

  const [capacityConfig, setCapacityConfig] = useState<CapacityConfig>({ defaultCapacity: 6, byBranch: {}, overrides: [] });

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
    { id: '1', code: '000001', docType: 'DNI', docNumber: '12345678', names: 'Juan', lastNameP: 'Pérez', lastNameM: 'García', birthDate: '1985-05-15', age: 38, gender: 'Masculino', civilStatus: 'Casado', hasChildren: true, childrenCount: 2, educationLevel: 'Universitario', profession: 'Psicólogo', specialty: 'Psicopedagogía', phone: '987654321', institutionalEmail: 'juan.perez@ensil.com', personalEmail: 'juan.perez.personal@gmail.com', address: 'Av. Larco 123, Miraflores', status: 'Activo', observations: 'Docente principal' },
    { id: '2', code: '000002', docType: 'DNI', docNumber: '87654321', names: 'María', lastNameP: 'Torres', lastNameM: 'López', birthDate: '1990-08-20', age: 33, gender: 'Femenino', civilStatus: 'Soltera', hasChildren: false, childrenCount: 0, educationLevel: 'Técnico', profession: 'Administradora', specialty: 'Gestión Educativa', phone: '912345678', institutionalEmail: 'maria.torres@ensil.com', personalEmail: 'maria.torres.personal@gmail.com', address: 'Calle Lima 456, San Isidro', status: 'Activo', observations: 'Coordinadora de filial' },
  ]);

  const [contracts, setContracts] = useState<Contract[]>([
    { id: 'CON-001', staffId: '1', type: 'Indeterminado', startDate: '2023-01-01', status: 'Vigente', shift: 'Full time', pensionSystem: 'AFP', pensionFund: 'Integra', grossSalary: 3500, contribution: 450, netSalary: 3050, observations: 'Contrato inicial' },
    { id: 'CON-002', staffId: '2', type: 'Plazo Fijo', startDate: '2023-06-01', endDate: '2024-06-01', status: 'Vigente', shift: 'Full time', pensionSystem: 'ONP', grossSalary: 2800, contribution: 364, netSalary: 2436, observations: 'Renovación anual' },
  ]);

  const [assignments, setAssignments] = useState<Assignment[]>([
    { id: 'ASG-001', staffId: '1', branch: 'Piura', area: 'Psicopedagogía', role: 'Psicólogo Senior', systemRole: 'Psicopedagogía', startDate: '2023-01-01', isMain: true, status: 'Activa' },
    { id: 'ASG-002', staffId: '2', branch: 'Chiclayo', area: 'Administración', role: 'Coordinadora', systemRole: 'Administración', startDate: '2023-06-01', isMain: true, status: 'Activa' },
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
  const registerPayment = (planId: string, installmentId: string, rawPayment: any): StockResult => {
    // El cobro no puede ser NaN, ≤ 0 ni exceder lo adeudado (cuota; en cronogramas variables, el saldo del plan).
    const planNow = plans.find(pl => pl.id === planId);
    const instNow = planNow?.installments.find((i: any) => i.id === installmentId);
    if (!planNow || !instNow) return { ok: false, error: 'No se encontró la cuota.' };
    const owed = instNow.variable ? planNow.balance : instNow.balance;
    const amountToApply = Math.min(Number(rawPayment.amount) || 0, owed);
    if (!(amountToApply > 0)) return { ok: false, error: 'La cuota no tiene saldo pendiente o el monto no es válido.' };
    const paymentData = { ...rawPayment, amount: Math.round(amountToApply * 100) / 100 };
    const payCurrency: 'PEN' | 'USD' = rawPayment.currency === 'PEN' ? 'PEN' : 'USD';
    const tc = Number(rawPayment.exchangeRate) || undefined;
    if (payCurrency === 'PEN' && !tc) return { ok: false, error: 'Indique el tipo de cambio para cobrar en soles.' };
    // Dinero real recibido en su moneda (si el monto se limitó al saldo, se recalcula con el mismo TC)
    const requested = Number(rawPayment.amount) || 0;
    const exactPen = Number(rawPayment.originalAmount);
    const realAmount = payCurrency === 'PEN'
      ? (exactPen > 0 && Math.abs(requested - paymentData.amount) < 0.005 ? exactPen : Math.round(paymentData.amount * tc! * 100) / 100)
      : paymentData.amount;

    setPlans(prevPlans => prevPlans.map(plan => {
      if (plan.id !== planId) return plan;

      const targetIdx = plan.installments.findIndex(inst => inst.id === installmentId);
      if (targetIdx < 0) return plan;
      const target = plan.installments[targetIdx];
      const newPayment = {
        id: `P-${Date.now()}`,
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

    // Add to global payments
    const planRef = plans.find(pl => pl.id === planId);
    const enrollmentRef = enrollments.find(e => e.id === planRef?.mat);
    const paymentId = nextSequentialId('PAG', payments.map(p => p.id));
    const newPayment: Payment = {
      id: paymentId,
      date: /^\d{4}-\d{2}-\d{2}$/.test(paymentData.date || '') ? formatDisplayDate(paymentData.date) : paymentData.date,
      student: enrollmentRef?.student || planRef?.titular || 'Alumno',
      concept: `Pago de ${instNow.name}`,
      amount: paymentData.amount,
      method: paymentData.method,
      receipt: paymentData.receipt,
      status: 'Aprobado',
      currency: 'USD',
      enrollmentIds: enrollmentRef ? [enrollmentRef.id] : undefined,
      user: currentUser.name,
      comment: rawPayment.note || undefined,
      parts: [{
        id: `PT-${Date.now()}`,
        currency: payCurrency,
        amount: realAmount,
        exchangeRate: payCurrency === 'PEN' ? tc : undefined,
        method: paymentData.method || 'Efectivo',
        operationNumber: rawPayment.operationNumber || undefined,
        evidence: rawPayment.evidence || undefined,
        note: rawPayment.note || undefined,
      }],
    };
    setPayments(prev => [newPayment, ...prev]);
    // El cobro de una cuota ingresa a la caja de la moneda en que se recibió (USD o PEN con su TC).
    addCashMovement({
      kind: 'Ingreso',
      concept: 'Ingreso cuota',
      reference: `${planId} / ${enrollmentRef?.student || planRef?.titular || ''}`,
      currency: payCurrency,
      amount: realAmount,
      exchangeRate: payCurrency === 'PEN' ? tc : undefined,
      amountUSD: paymentData.amount,
      method: paymentData.method || 'Efectivo',
      operationNumber: rawPayment.operationNumber || undefined,
      branchId: enrollmentRef?.branchId,
      paymentId,
      enrollmentIds: enrollmentRef ? [enrollmentRef.id] : undefined,
    });
    return { ok: true };
  };

  const refinanceInstallment = (planId: string, installmentId: string, refinanceData: any) => {
    setPlans(prevPlans => prevPlans.map(plan => {
      if (plan.id === planId) {
        const updatedInstallments = plan.installments.map(inst => {
          if (inst.id === installmentId) {
            return {
              ...inst,
              status: 'Refinanciada'
            };
          }
          return inst;
        });

        // Add new installment
        const newInstallment = {
          id: `C-${Date.now()}`,
          name: refinanceData.name,
          amount: refinanceData.amount,
          balance: refinanceData.amount,
          dueDate: refinanceData.dueDate,
          status: 'Pendiente',
          payments: []
        };

        return {
          ...plan,
          installments: [...updatedInstallments, newInstallment],
          balance: plan.balance + refinanceData.amount // Assuming the old balance is kept or adjusted, let's just add the new amount for simplicity, or maybe the old installment's balance should be subtracted.
        };
      }
      return plan;
    }));
  };

  const addStaff = (staffData: Omit<Staff, 'id'>) => {
    const newStaff = {
      ...staffData,
      id: `STF-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`,
    };
    setStaff(prev => [...prev, newStaff]);
  };

  const updateStaff = (id: string, staffData: Partial<Staff>) => {
    setStaff(prev => prev.map(s => s.id === id ? { ...s, ...staffData } : s));
  };

  const deleteStaff = (id: string) => {
    setStaff(prev => prev.filter(s => s.id !== id));
  };

  const addStudent = (studentData: Omit<Student, 'id'>) => {
    const newStudent = {
      ...studentData,
      id: `ALU-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`,
    };
    setStudents(prev => [...prev, newStudent]);
  };

  const updateStudent = (id: string, studentData: Partial<Student>) => {
    setStudents(prev => prev.map(s => s.id === id ? { ...s, ...studentData } : s));
  };

  const deleteStudent = (id: string) => {
    setStudents(prev => prev.filter(s => s.id !== id));
  };

  const addGuardian = (guardianData: Omit<Guardian, 'id'>) => {
    const newGuardian = {
      ...guardianData,
      id: (guardians.length + 1).toString(),
      students: 0,
      enrollments: 0,
      balance: '$0',
    };
    setGuardians(prev => [...prev, newGuardian]);
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

  const addTracking = (trackingData: Omit<Tracking, 'id'>): Tracking => {
    const newTracking: Tracking = {
      ...trackingData,
      id: `TRK-${Date.now().toString().slice(-4)}`
    };
    setTrackings(prev => [newTracking, ...prev]);
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
      updateStaff,
      deleteStaff,
      addStudent,
      updateStudent,
      deleteStudent,
      addGuardian,
      updateGuardian,
      deleteGuardian,
      registerEnrollments,
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
